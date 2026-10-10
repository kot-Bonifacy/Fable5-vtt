import { createHash } from 'node:crypto';
import type { Socket } from 'socket.io-client';
import { BASE_URL } from '../../instance/paths.ts';
import { Actor, expect, test, type Cast, type Engine } from '../../fixtures/actors.ts';
import { sceneByName, sceneListRow } from '../../fixtures/brama.ts';
import { query, queryOne } from '../../fixtures/db.ts';
import { BRAMA, KNAJPA } from '../../fixtures/maps.ts';
import { characterId, userId } from '../../fixtures/nocna-zmiana.ts';
import {
  readChatArrivals,
  recordMeasurement,
  serverProcess,
  spread,
  startChatArrivals,
  startFrameMeter,
  stopFrameMeter,
  storageSizes,
  type Arrival,
  type FrameStats,
} from '../../fixtures/pomiary.ts';
import { clickOnMap, fitCamera } from '../../fixtures/scene.ts';
import { DEAD_GATEWAY, rawSocket } from '../../fixtures/security.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { createInvitation, rollWithCup, say, shakeCup } from '../../fixtures/table.ts';
import {
  activeName,
  cellCentre,
  combatRow,
  lastMessageId,
  nextTurn,
  token,
  beginFight,
} from '../../fixtures/walka.ts';
import { restoreCheckpoint, startInstance } from '../../instance/instance.ts';

/**
 * T7b, część 1 (`testy.md` 6.3, „obciążenie stołu”): MG i czterech graczy przez
 * dziesięć minut ruchu, rzutów, czatu i zapisów karty, a w piątej minucie
 * dochodzi spóźniony gracz. Na koniec każdej części stan każdej karty
 * przeglądarki (magazyny klienta) = świeży `state:sync` tego samego konta = baza.
 *
 * Rozstrzygnięcia MG z 02.10: oba tryby po kolei — ~7 min swobodnie na „Bramie”
 * z odsłoniętą mgłą (5 min tempa stołu co 3–8 s, 2 min szczytu co 0,5–1 s),
 * potem ~3 min walki turowej w „Knajpie” (Dynamiczna — każdy widzi co innego);
 * nowi gracze Kuba i Ewa dostają od MG puste karty; obserwator to spóźniony
 * gracz (Zosia); silniki pół na pół. Liczby bez progów — linia bazowa
 * refaktoryzacji w `.e2e/pomiary/t7b-obciazenie.json`.
 *
 * Wagi (decyzja MG z 01.10): utrata zapisanego stanu albo pad = B0; rozjazd
 * klientów, którego nie naprawia F5, albo podwójny rzut/akcja = B1; liczby =
 * obserwacja, B2 dopiero przy wyraźnym zacinaniu.
 */

const FILE = 't7b-obciazenie';
const REALISTIC = { min: 3_000, max: 8_000 };
const PEAK = { min: 500, max: 1_000 };
/** `E2E_T7B_SKALA=0.1` skraca części do próby suity (pomiary zapisuje się z pełnych 10 min). */
const SCALE = Number(process.env.E2E_T7B_SKALA ?? 1);
/**
 * Skala samej „Bramy” — T7c (02.10) powtarza walkę w „Knajpie” w pełnej długości
 * przy krótkiej „Bramie”, żeby odtworzyć marsz Sowy (`E2E_T7B_BRAMA_SKALA=0.05`).
 */
const BRAMA_SCALE = Number(process.env.E2E_T7B_BRAMA_SKALA ?? SCALE);
const BRAMA_CALM_MS = 5 * 60_000 * BRAMA_SCALE;
/** Pełny przebieg nadpisuje linię bazową (`brama`, `knajpa`); próby idą pod własnym kluczem. */
const RUN_SUFFIX =
  SCALE === 1 && BRAMA_SCALE === 1
    ? ''
    : BRAMA_SCALE === SCALE
      ? `-proba-${SCALE}`
      : `-proba-${SCALE}-brama-${BRAMA_SCALE}-${new Date().toISOString().slice(11, 19)}`;
const BRAMA_PEAK_MS = 2 * 60_000 * BRAMA_SCALE;
const KNAJPA_MS = 3 * 60_000 * SCALE;
/**
 * #48 (02.10): po końcu obciążenia każdy klient zgadza się ze świeżym
 * `state:sync` w tym czasie. Przed poprawką — 850–1130 s.
 */
const CONVERGENCE_LIMIT_MS = 60_000;

type Pace = { min: number; max: number };
type TokenStore = { tokens: Record<string, { x: number; y: number }> };

/** Gracz przy stole: jego postać, figura i pas kolumn „Bramy”, po którym chodzi. */
interface Seat {
  actor: Actor;
  character: string;
  /** Kolumny pasa na „Bramie” (wiersze 15–27 dla wszystkich) — pasy się nie stykają. */
  band: [number, number];
  /** Pole startowe w „Knajpie”; w walce figura chodzi pole w prawo i z powrotem. */
  knajpa: [number, number];
  formula: string;
}

interface Failure {
  who: string;
  action: string;
  phase: string;
  error: string;
  /** Ślad nieudanego marszu w walce (T7c): figura w bazie i u klienta, stan tury, notki czatu. */
  diag?: unknown;
}

test.describe
  .serial('T7b odporność: obciążenie stołu — MG + 4 graczy + spóźniony @odpornosc', () => {
  let mg: Actor;
  let zosia: Actor | undefined;
  let gm: Socket;
  const seats: Seat[] = [];
  const cells = { Brama: 0, Knajpa: 0 };
  let phase = 'start';

  // Liczniki obciążenia: co poszło, co się nie udało, co ma być w bazie.
  const actions = new Map<string, Record<string, number>>();
  const failures: Failure[] = [];
  const sentAt = new Map<string, number>();
  const notesTail = new Map<string, string>();
  const notesUnknown = new Set<string>();
  const notesLost: Record<string, string[]> = {};
  const rollAttempts = new Map<string, number>();
  const rtt: Record<string, number[]> = {};
  const memory: { phase: string; t: number; workingSetMb: number; cpuSeconds: number }[] = [];
  const frames: Record<string, Record<string, FrameStats>> = {};
  let firstMessageId = 0;
  let markers = 0;
  let loadStartedAt = 0;

  const players = () => seats.map((seat) => seat.actor);
  const everyone = () => [mg, ...players(), ...(zosia ? [zosia] : [])];
  const rand = (pace: Pace) => pace.min + Math.random() * (pace.max - pace.min);
  const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]!;

  function count(who: string, action: string) {
    const row = actions.get(who) ?? {};
    row[action] = (row[action] ?? 0) + 1;
    actions.set(who, row);
  }

  /** Figura postaci na scenie (po nazwie karty — figura MG bywa pod aliasem). */
  function figure(scene: string, character: string) {
    return queryOne<{ id: string; x: number; y: number; size: number }>(
      `SELECT t.id, t.x, t.y, t.size FROM Token t JOIN Scene s ON s.id = t.sceneId
         JOIN Character c ON c.id = t.characterId WHERE s.name = ? AND c.name = ?`,
      scene,
      character,
    )!;
  }

  /** Środek figury tak, jak ją widzi klient (w marszu baza ma jeszcze pole startowe). */
  async function seenCentre(actor: Actor, id: string, cell: number) {
    const store = await actor.store<TokenStore>('token');
    const view = store?.tokens[id];
    if (!view) throw new Error(`${actor.name}: no figure ${id} in the client`);
    return { x: view.x + cell / 2, y: view.y + cell / 2 };
  }

  async function chatTab(actor: Actor) {
    const input = actor.page.getByLabel('Wiadomość czatu');
    if (!(await input.isVisible())) {
      await actor.page.getByRole('button', { name: /^Czat/ }).first().click();
    }
  }

  async function march(actor: Actor, id: string, cell: number, to: [number, number]) {
    await actor.page.keyboard.press('Escape');
    const from = await seenCentre(actor, id, cell);
    // Klik w to samo pole to dwuklik w figurę — otwiera jej kartę, która zasłania pasek.
    if (Math.floor(from.x / cell) === to[0] && Math.floor(from.y / cell) === to[1]) {
      to = [to[0], to[1] === 27 ? 26 : to[1] + 1];
    }
    await clickOnMap(actor.page, from);
    await actor.page.waitForTimeout(250);
    await clickOnMap(actor.page, cellCentre(cell, to[0], to[1]));
  }

  async function sayMarked(actor: Actor, text: string) {
    await chatTab(actor);
    markers += 1;
    const marker = `[t7b:${actor.name}:${markers}]`;
    const at = Date.now();
    await say(actor, `${text} ${marker}`);
    sentAt.set(marker, at);
  }

  async function roll(actor: Actor, formula: string) {
    await chatTab(actor);
    rollAttempts.set(actor.name, (rollAttempts.get(actor.name) ?? 0) + 1);
    await rollWithCup(actor.page, formula);
  }

  /** Notatki własnej karty: krótki dopisek przez UI, odczekany autozapis, zamknięcie. */
  async function writeNotes(actor: Actor, character: string) {
    const page = actor.page;
    await page.getByRole('button', { name: 'Postacie', exact: true }).click();
    await page.locator('.side-panel').getByText(character, { exact: true }).first().click();
    const region = page.getByRole('region', { name: `Karta postaci: ${character}` });
    const notes = region.getByLabel('Notatki');
    await notes.click();
    await notes.press('Control+End');
    const chunk = ` ·${actor.name[0]}${(actions.get(actor.name)?.notatki ?? 0) + 1}`;
    notesUnknown.add(character);
    await notes.pressSequentially(chunk, { delay: 25 });
    // Autozapis karty po 600 ms ciszy (`CHARACTER_SAVE_DEBOUNCE_MS`).
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: 'Zamknij kartę' }).click();
    notesTail.set(character, (notesTail.get(character) ?? '') + chunk);
    notesUnknown.delete(character);
  }

  async function recover(actor: Actor) {
    await actor.page.keyboard.press('Escape').catch(() => undefined);
    const close = actor.page.getByRole('button', { name: 'Zamknij kartę' });
    if (await close.count().catch(() => 0))
      await close
        .first()
        .click()
        .catch(() => undefined);
    await actor.page.keyboard.press('Escape').catch(() => undefined);
  }

  async function attempt(actor: Actor, action: string, body: () => Promise<void>) {
    try {
      await body();
      count(actor.name, action);
    } catch (error) {
      failures.push({
        who: actor.name,
        action,
        phase,
        error: String((error as Error).message ?? error)
          .split('\n')[0]!
          .slice(0, 240),
      });
      await recover(actor);
    }
  }

  const LINES = [
    'Brama wygląda na zamkniętą, ale budka jest pusta.',
    'Słyszę silnik od strony magazynu.',
    'Zażółć gęślą jaźń — sprawdzam polskie znaki pod obciążeniem.',
    'Kto ma jeszcze amunicję?',
    'Idę na lewą flankę, osłaniaj mnie.',
    'Nie ufam temu Paserowi.',
    'Ile mamy czasu do zmiany warty?',
  ];

  /** Jedna czynność gracza na „Bramie” — losowo marsz, rzut, czat albo notatki. */
  async function playerTurnOnBrama(seat: Seat, pace: Pace) {
    const { actor } = seat;
    const r = Math.random();
    const peak = pace === PEAK;
    if (r < 0.35) {
      const to: [number, number] = [
        seat.band[0] + Math.floor(Math.random() * (seat.band[1] - seat.band[0] + 1)),
        15 + Math.floor(Math.random() * 13),
      ];
      await attempt(actor, 'marsz', () =>
        march(actor, figure('Brama', seat.character).id, cells.Brama, to),
      );
    } else if (r < 0.65) {
      await attempt(actor, 'rzut', () => roll(actor, seat.formula));
    } else if (r < (peak ? 0.97 : 0.9)) {
      await attempt(actor, 'czat', () => sayMarked(actor, pick(LINES)));
    } else {
      await attempt(actor, 'notatki', () => writeNotes(actor, seat.character));
    }
  }

  /** Czynność MG na „Bramie”: marsz Strażnika, czat, rzut, szept, ukryty rzut. */
  async function gmTurnOnBrama() {
    const r = Math.random();
    if (r < 0.25) {
      const to: [number, number] = [
        29 + Math.floor(Math.random() * 3),
        15 + Math.floor(Math.random() * 13),
      ];
      await attempt(mg, 'marsz', () => march(mg, figure('Brama', 'Strażnik').id, cells.Brama, to));
    } else if (r < 0.55) {
      await attempt(mg, 'czat', () => sayMarked(mg, pick(LINES)));
    } else if (r < 0.75) {
      await attempt(mg, 'rzut', () => roll(mg, '/r 1d6+5'));
    } else if (r < 0.9) {
      const to = pick(seats).actor.name;
      await attempt(mg, 'szept', async () => {
        await chatTab(mg);
        await say(mg, `/w ${to} Strażnik coś podejrzewa.`);
      });
    } else {
      await attempt(mg, 'ukryty rzut', () => roll(mg, '/gr 1d6+6'));
    }
  }

  async function loop(until: number, pace: Pace, step: () => Promise<void>) {
    while (Date.now() < until) {
      await step();
      const rest = Math.min(rand(pace), until - Date.now());
      if (rest > 0) await new Promise((resolve) => setTimeout(resolve, rest));
    }
  }

  /** Sonda serwera: co sekundę `chat:history` z gniazda MG — czas odpowiedzi pod obciążeniem. */
  function probe(name: string): () => void {
    const samples: number[] = (rtt[name] ??= []);
    let on = true;
    void (async () => {
      while (on) {
        const t0 = performance.now();
        const ack = await emitAck(gm, 'chat:history', { beforeId: 1 }).catch(() => null);
        if (ack?.ok) samples.push(performance.now() - t0);
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    })();
    return () => {
      on = false;
    };
  }

  /** Pamięć i procesor serwera co 15 s. */
  function sampleServer(name: string): () => void {
    let on = true;
    void (async () => {
      while (on) {
        const sample = await serverProcess();
        if (sample) memory.push({ phase: name, t: Date.now() - loadStartedAt, ...sample });
        await new Promise((resolve) => setTimeout(resolve, 15_000));
      }
    })();
    return () => {
      on = false;
    };
  }

  async function meterOn(name: string) {
    for (const actor of everyone()) await startFrameMeter(actor.page, name);
  }

  async function meterOff(name: string) {
    frames[name] = {};
    for (const actor of everyone()) {
      frames[name]![`${actor.name} (${actor.engine})`] = await stopFrameMeter(actor.page, name);
    }
  }

  // ——— porównanie stanu: karta przeglądarki ↔ świeży `state:sync` ↔ baza ———

  type Canon = {
    scene: string | null;
    tokens: Record<string, unknown>;
    characters: Record<string, unknown>;
    combat: unknown;
    chat: number[];
  };

  const tokenCanon = (t: Record<string, unknown>) => ({
    name: t.name,
    publicName: t.publicName ?? null,
    x: Math.round(t.x as number),
    y: Math.round(t.y as number),
    size: t.size,
    hidden: t.hidden,
    ownerId: t.ownerId,
    statuses: t.statuses ?? [],
  });
  const characterCanon = (c: Record<string, unknown>) => ({
    name: c.name,
    ownerId: c.ownerId,
    data: c.data,
  });
  const combatCanon = (c: Record<string, unknown> | null) =>
    c
      ? {
          round: c.round,
          activeCombatantId: c.activeCombatantId,
          combatants: (c.combatants as Record<string, unknown>[]).map((x) => [
            x.id,
            x.initiative,
            x.order,
          ]),
        }
      : null;

  function canon(raw: {
    scene: string | null;
    tokens: Record<string, unknown>[];
    characters: Record<string, unknown>[];
    combat: Record<string, unknown> | null;
    chat: number[];
  }): Canon {
    return {
      scene: raw.scene,
      tokens: Object.fromEntries(raw.tokens.map((t) => [t.id as string, tokenCanon(t)])),
      characters: Object.fromEntries(
        raw.characters.map((c) => [c.id as string, characterCanon(c)]),
      ),
      combat: combatCanon(raw.combat),
      // Magazyn klienta trzyma wiersze w kolejności przyjścia (karta rzutu czeka na animację).
      chat: [...raw.chat].sort((x, y) => x - y).slice(-50),
    };
  }

  function sorted(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sorted);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.keys(value as object)
          .sort()
          .map((key) => [key, sorted((value as Record<string, unknown>)[key])]),
      );
    }
    return value;
  }
  const hash = (value: unknown) =>
    createHash('sha256')
      .update(JSON.stringify(sorted(value)))
      .digest('hex')
      .slice(0, 12);

  async function clientState(actor: Actor): Promise<Canon> {
    const raw = await actor.page.evaluate(() => {
      const s = (name: string) =>
        window.__vttE2E!.stores[name]!.getState() as Record<string, unknown>;
      const items = (s('chat').items as { message?: { id: number } }[]) ?? [];
      return {
        scene: ((s('scene').scene as { id: string } | null) ?? null)?.id ?? null,
        tokens: Object.values(s('token').tokens as Record<string, Record<string, unknown>>),
        characters: Object.values(
          s('character').characters as Record<string, Record<string, unknown>>,
        ),
        combat: (s('combat').combat as Record<string, unknown> | null) ?? null,
        chat: items.filter((item) => item.message).map((item) => item.message!.id),
      };
    });
    return canon(raw);
  }

  async function serverState(actor: Actor): Promise<Canon> {
    const cookies = await actor.context.cookies(BASE_URL);
    const { socket, sync, error } = await rawSocket(
      cookies.map((c) => `${c.name}=${c.value}`).join('; '),
    );
    socket?.close();
    if (!sync) throw new Error(`${actor.name}: no state:sync (${error})`);
    const view = sync as {
      scene: { id: string } | null;
      tokens: Record<string, unknown>[];
      characters: Record<string, unknown>[];
      combat: Record<string, unknown> | null;
      messages: { id: number }[];
    };
    return canon({
      scene: view.scene?.id ?? null,
      tokens: view.tokens,
      characters: view.characters,
      combat: view.combat,
      chat: view.messages.map((m) => m.id),
    });
  }

  /** Pola, którymi różnią się dwa wpisy (pierwszy poziom, skrót wartości). */
  function delta(a: unknown, b: unknown): string {
    if (!a || !b) return a ? 'brak w serwerze' : 'brak u klienta';
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    return [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .filter((key) => hash(left[key] ?? null) !== hash(right[key] ?? null))
      .map((key) => {
        if (key !== 'data') {
          return `${key} ${JSON.stringify(left[key])} ≠ ${JSON.stringify(right[key])}`;
        }
        const l = (left.data ?? {}) as Record<string, unknown>;
        const r = (right.data ?? {}) as Record<string, unknown>;
        const keys = [...new Set([...Object.keys(l), ...Object.keys(r)])].filter(
          (k) => hash(l[k] ?? null) !== hash(r[k] ?? null),
        );
        return `data.{${keys.join(',')}} ${JSON.stringify(keys.map((k) => l[k])).slice(0, 160)} ≠ ${JSON.stringify(keys.map((k) => r[k])).slice(0, 160)}`;
      })
      .join('; ');
  }

  function differences(a: Canon, b: Canon): string[] {
    const out: string[] = [];
    if (a.scene !== b.scene) out.push(`scena ${a.scene} ≠ ${b.scene}`);
    for (const key of ['tokens', 'characters'] as const) {
      const ids = new Set([...Object.keys(a[key]), ...Object.keys(b[key])]);
      for (const id of ids) {
        if (hash(a[key][id] ?? null) !== hash(b[key][id] ?? null)) {
          const name =
            (a[key][id] as { name?: string } | undefined)?.name ??
            (b[key][id] as { name?: string } | undefined)?.name;
          out.push(
            `${key === 'tokens' ? 'figura' : 'karta'} ${name ?? id}: ${delta(a[key][id], b[key][id])}`,
          );
        }
      }
    }
    if (hash(a.combat) !== hash(b.combat)) out.push('walka');
    if (hash(a.chat) !== hash(b.chat)) {
      const onlyA = a.chat.filter((id) => !b.chat.includes(id));
      const onlyB = b.chat.filter((id) => !a.chat.includes(id));
      out.push(`czat: tylko u klienta ${onlyA.join(',')} · tylko w serwerze ${onlyB.join(',')}`);
    }
    return out;
  }

  /** Widok świeżego `state:sync` zgadza się z wierszami bazy (pozycje, notatki i reszta karty). */
  function againstDatabase(view: Canon): string[] {
    const out: string[] = [];
    for (const [id, t] of Object.entries(view.tokens)) {
      const row = queryOne<{ x: number; y: number; hidden: number }>(
        'SELECT x, y, hidden FROM Token WHERE id = ?',
        id,
      );
      const seen = t as { x: number; y: number; hidden: boolean; name: string };
      if (!row) out.push(`figura ${seen.name}: brak w bazie`);
      else if (Math.round(row.x) !== seen.x || Math.round(row.y) !== seen.y)
        out.push(`figura ${seen.name}: ${seen.x},${seen.y} ≠ baza ${row.x},${row.y}`);
    }
    for (const [id, c] of Object.entries(view.characters)) {
      const row = queryOne<{ data: string }>('SELECT data FROM Character WHERE id = ?', id);
      const seen = c as { name: string; data: Record<string, unknown> };
      if (!row) {
        out.push(`karta ${seen.name}: brak w bazie`);
        continue;
      }
      // Widok to karta po `parseCharacterData` (uzupełnione domyślne pola) — każde pole
      // zapisane w bazie ma w nim tę samą wartość.
      const stored = JSON.parse(row.data) as Record<string, unknown>;
      for (const [key, value] of Object.entries(stored)) {
        if (hash(value) !== hash(seen.data[key])) out.push(`karta ${seen.name}: pole ${key}`);
      }
    }
    return out;
  }

  /**
   * Stół zgodny: u każdego klient = świeży widok serwera dla tego konta = baza;
   * figury, które widzą wszyscy, stoją u wszystkich w tym samym miejscu.
   */
  async function tableAgrees(label: string, maxWaitMs = 20 * 60_000) {
    // Klient odtwarza animacje rzutów po jednej i trzyma za nimi cały ruch gniazda
    // (`RollPresentation`, umowa `serwer` z 22.09). Do poprawki #48 (02.10) stół
    // dochodził do zgodności po 14–19 min; od niej rzut, który czekał w kolejce
    // ponad 3 s, wychodzi kartą bez animacji. Rozjazd po limicie = B1.
    const t0 = Date.now();
    const key = (actor: Actor) => `${actor.name} (${actor.engine})`;
    const pending = new Set(everyone());
    const last = new Map<Actor, { client: Canon; server: Canon }>();
    const atEnd: Record<string, string[]> = {};
    const converged: Record<string, number | null> = {};
    while (pending.size > 0) {
      for (const actor of [...pending]) {
        const client = await clientState(actor);
        const server = await serverState(actor);
        last.set(actor, { client, server });
        const diff = differences(client, server);
        atEnd[key(actor)] ??= diff;
        if (diff.length === 0) {
          converged[key(actor)] = Date.now() - t0;
          pending.delete(actor);
        }
      }
      if (pending.size === 0 || Date.now() - t0 > maxWaitMs) break;
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
    const hashes: Record<string, { client: string; server: string }> = {};
    const shared = new Map<string, Set<string>>();
    for (const actor of everyone()) {
      const { client, server } = last.get(actor)!;
      converged[key(actor)] ??= null;
      hashes[key(actor)] = { client: hash(client), server: hash(server) };
      expect
        .soft(
          differences(client, server),
          `${label}: ${actor.name} klient ↔ serwer po ${Math.round(maxWaitMs / 1000)} s`,
        )
        .toEqual([]);
      expect.soft(againstDatabase(server), `${label}: ${actor.name} serwer ↔ baza`).toEqual([]);
      for (const [id, t] of Object.entries(client.tokens)) {
        const at = hash({ x: (t as { x: number }).x, y: (t as { y: number }).y });
        shared.set(id, (shared.get(id) ?? new Set()).add(at));
      }
    }
    // #48: stół jest najwyżej kilka sekund za serwerem — z zapasem na sondę co 5 s
    // i na ostatnią animację, która jeszcze leci.
    for (const [who, ms] of Object.entries(converged)) {
      expect.soft(ms, `${label}: ${who} — zgodność ze świeżym state:sync (ms, #48)`).not.toBeNull();
      if (ms !== null)
        expect
          .soft(ms, `${label}: ${who} — zgodność po (ms, #48)`)
          .toBeLessThan(CONVERGENCE_LIMIT_MS);
    }
    const split = [...shared.entries()].filter(([, at]) => at.size > 1).map(([id]) => id);
    expect.soft(split, `${label}: figura w dwóch miejscach u różnych klientów`).toEqual([]);
    test.info().annotations.push(
      {
        type: `${label}: odcisk stanu (klient / świeży state:sync)`,
        description: Object.entries(hashes)
          .map(([who, h]) => `${who} ${h.client}${h.client === h.server ? ' =' : ' ≠ '}${h.server}`)
          .join(' · '),
      },
      {
        type: `${label}: zgodność po końcu obciążenia (ms)`,
        description: JSON.stringify(converged),
      },
      {
        type: `${label}: różnice tuż po końcu obciążenia`,
        description: JSON.stringify(atEnd).slice(0, 3_000),
      },
    );
    return { hashes, converged, atEnd };
  }

  /** Każdy wysłany znacznik czatu jest w bazie dokładnie raz; rzuty nie dublują się. */
  function chatIntegrity(label: string) {
    const rows = query<{ text: string; kind: string; authorId: string; payload: string | null }>(
      'SELECT text, kind, authorId, payload FROM ChatMessage WHERE id > ?',
      firstMessageId,
    );
    const counts = new Map<string, number>();
    for (const row of rows) {
      const match = /\[t7b:[^\]]+\]/.exec(row.text);
      if (match) counts.set(match[0], (counts.get(match[0]) ?? 0) + 1);
    }
    const lost = [...sentAt.keys()].filter((marker) => !counts.has(marker));
    const doubled = [...counts.entries()].filter(([, n]) => n > 1).map(([marker]) => marker);
    expect.soft(doubled, `${label}: wiersz czatu zapisany dwa razy`).toEqual([]);
    // Wysłany = Enter w polu; przy zgubieniu sprawdź `failures` — klik mógł nie dojść.
    test.info().annotations.push({
      type: `${label}: wiersze czatu`,
      description: `wysłane ${sentAt.size}, w bazie ${counts.size}, zgubione ${lost.length}${lost.length ? ` (${lost.slice(0, 5).join(' ')})` : ''}`,
    });
    expect.soft(lost, `${label}: wiersz czatu, którego nie ma w bazie`).toEqual([]);

    const rollsBy = new Map<string, number>();
    for (const row of rows) {
      // Rzut gestem kubka niesie `toss`; „Rzuć wszystkim” MG idzie bez gestu.
      if (row.kind !== 'roll' && row.kind !== 'gmroll') continue;
      if (!row.payload?.includes('"toss":')) continue;
      const who = queryOne<{ name: string }>('SELECT name FROM User WHERE id = ?', row.authorId);
      if (who) rollsBy.set(who.name, (rollsBy.get(who.name) ?? 0) + 1);
    }
    const summary = [...rollAttempts.entries()].map(
      ([who, tried]) => `${who}: gestów ${tried}, w bazie ${rollsBy.get(who) ?? 0}`,
    );
    test.info().annotations.push({ type: `${label}: rzuty`, description: summary.join(' · ') });
    for (const [who, tried] of rollAttempts) {
      expect
        .soft(rollsBy.get(who) ?? 0, `${label}: ${who} — więcej rzutów niż gestów`)
        .toBeLessThanOrEqual(tried);
    }
  }

  /**
   * Opóźnienie czatu u każdego odbiorcy w oknie `[since, ∞)`: mowa od Enter, rzut
   * od zapisu na serwerze. Do tego rozładowanie kolejki po końcu obciążenia
   * (`endedAt`): ile wierszy doszło później, kiedy ostatni i co ile szły karty rzutów.
   */
  async function latencies(since: number, endedAt: number) {
    const result: Record<string, unknown> = {};
    for (const actor of everyone()) {
      const arrivals = (await readChatArrivals(actor.page)).filter((a: Arrival) => a.at >= since);
      const said = arrivals
        .map((a) => {
          const marker = /\[t7b:[^\]]+\]/.exec(a.text)?.[0];
          const sent = marker ? sentAt.get(marker) : undefined;
          return sent !== undefined && !marker!.startsWith(`[t7b:${actor.name}:`)
            ? a.at - sent
            : null;
        })
        .filter((v): v is number => v !== null);
      const rolled = arrivals
        .filter((a) => a.kind === 'roll')
        .map((a) => a.at - Date.parse(a.createdAt));
      const late = arrivals.filter((a) => a.at > endedAt);
      const lateRolls = late.filter((a) => a.kind === 'roll').map((a) => a.at);
      const gaps = lateRolls.slice(1).map((at, i) => at - lateRolls[i]!);
      result[`${actor.name} (${actor.engine})`] = {
        mowa: spread(said),
        rzut: spread(rolled),
        poKoncu: {
          wierszy: late.length,
          ostatniPoMs: late.length ? late[late.length - 1]!.at - endedAt : 0,
          odstepKartRzutuMs: spread(gaps),
        },
      };
    }
    return result;
  }

  async function join(cast: Cast, name: string, engine: Engine, campaign: string) {
    const actor = await cast.gracz(name, engine, await createInvitation(mg, campaign, name));
    actor.page.setDefaultTimeout(10_000);
    return actor;
  }

  async function onScene(actor: Actor, name: string, map: { width: number; height: number }) {
    await expect
      .poll(
        async () => (await actor.store<{ scene: { name: string } | null }>('scene'))?.scene?.name,
        {
          message: actor.name,
          timeout: 20_000,
        },
      )
      .toBe(name);
    await fitCamera(actor.page, map.width, map.height).catch(() => undefined);
  }

  test.beforeAll(async () => {
    test.setTimeout(3 * 60_000);
    await restoreCheckpoint('po-T6');
    await startInstance(DEAD_GATEWAY);
    cells.Brama = sceneByName('Brama').gridSizePx;
    cells.Knajpa = sceneByName('Knajpa').gridSizePx;
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('start z po-T6: MG, Marek, Ola, Kuba i Ewa; puste karty od MG; „Brama” aktywna i odsłonięta', async ({
    cast,
  }) => {
    test.setTimeout(5 * 60_000);
    mg = await cast.mg('chromium');
    mg.page.setDefaultTimeout(10_000);
    const campaign = queryOne<{ id: string }>(
      `SELECT id FROM Campaign WHERE name = 'Nocna zmiana'`,
    )!.id;
    const marek = await join(cast, 'Marek', 'chromium', campaign);
    const ola = await join(cast, 'Ola', 'firefox', campaign);
    const kuba = await join(cast, 'Kuba', 'firefox', campaign);
    const ewa = await join(cast, 'Ewa', 'chromium', campaign);
    seats.push(
      { actor: marek, character: 'Kowal', band: [13, 15], knajpa: [8, 8], formula: '/r 1d10+1' },
      { actor: ola, character: 'Iskra', band: [17, 19], knajpa: [8, 9], formula: '/r 1d10+2' },
      { actor: kuba, character: 'Lis', band: [21, 23], knajpa: [10, 8], formula: '/r 1d10+3' },
      { actor: ewa, character: 'Sowa', band: [25, 27], knajpa: [10, 9], formula: '/r 1d10+4' },
    );
    gm = await mg.socket();

    // Puste karty z właścicielem i figury na obu scenach (przygotowanie MG, nie przedmiot testu).
    const brama = sceneByName('Brama');
    const knajpa = sceneByName('Knajpa');
    for (const seat of seats.slice(2)) {
      const owner = userId(seat.actor.name);
      const created = await emitAck<{ id: string }>(gm, 'character:create', {
        name: seat.character,
        ownerId: owner,
      });
      expect(created, JSON.stringify(created)).toMatchObject({ ok: true });
      const id = characterId(seat.character);
      for (const [scene, at] of [
        [brama, [seat.band[0] + 1, 20]],
        [knajpa, seat.knajpa],
      ] as const) {
        const placed = await emitAck(gm, 'token:create', {
          sceneId: scene.id,
          name: seat.character,
          x: at[0] * scene.gridSizePx,
          y: at[1] * scene.gridSizePx,
          ownerId: owner,
          characterId: id,
        });
        expect(placed, JSON.stringify(placed)).toMatchObject({ ok: true });
      }
    }
    // Kowal i Iskra z placu za bramą (strefa wieżyczki) na drogę, Strażnik do swojego pasa.
    for (const [character, at] of [
      ['Kowal', [14, 20]],
      ['Iskra', [18, 20]],
      ['Strażnik', [30, 20]],
    ] as const) {
      const moved = await emitAck(gm, 'token:move', {
        tokenId: figure('Brama', character).id,
        x: at[0] * cells.Brama,
        y: at[1] * cells.Brama,
        final: true,
      });
      expect(moved, `${character}: ${JSON.stringify(moved)}`).toMatchObject({ ok: true });
    }
    expect(await emitAck(gm, 'fog:reset', { sceneId: brama.id, mode: 'reveal' })).toMatchObject({
      ok: true,
    });

    const page = mg.page;
    await page.getByRole('button', { name: 'Sceny', exact: true }).click();
    await sceneListRow(page, 'Brama').getByRole('button', { name: 'Aktywuj' }).click();
    await expect.poll(() => sceneByName('Brama').active).toBe(1);
    await sceneListRow(page, 'Brama').getByRole('button', { name: 'Pokaż' }).click();
    for (const actor of everyone()) await onScene(actor, 'Brama', BRAMA);
    for (const seat of seats) {
      await expect
        .poll(async () =>
          Boolean(
            (await seat.actor.store<TokenStore>('token'))?.tokens[
              figure('Brama', seat.character).id
            ],
          ),
        )
        .toBe(true);
    }
    // Filtry czatu: wszystko widoczne (odmowy lądują w „Stół”).
    for (const actor of everyone()) await chatTab(actor);
    for (const seat of seats) notesTail.set(seat.character, '');
    test.info().annotations.push({
      type: 'figury na „Bramie” w kliencie',
      description: (
        await Promise.all(
          everyone().map(
            async (a) =>
              `${a.name} ${Object.keys((await a.store<TokenStore>('token'))?.tokens ?? {}).length}`,
          ),
        )
      ).join(' · '),
    });
  });

  test('„Brama” 7 min: 5 min tempa stołu, 2 min szczytu, w 5. minucie wchodzi Zosia', async ({
    cast,
  }) => {
    test.setTimeout(BRAMA_CALM_MS + BRAMA_PEAK_MS + 26 * 60_000);
    firstMessageId = lastMessageId();
    loadStartedAt = Date.now();
    const sizesBefore = storageSizes();
    for (const actor of everyone()) await startChatArrivals(actor.page);

    // Tempo stołu.
    phase = 'brama-tempo';
    await meterOn(phase);
    let stopProbe = probe(phase);
    let stopSampler = sampleServer(phase);
    let until = Date.now() + BRAMA_CALM_MS;
    await Promise.all([
      loop(until, REALISTIC, gmTurnOnBrama),
      ...seats.map((seat) => loop(until, REALISTIC, () => playerTurnOnBrama(seat, REALISTIC))),
    ]);
    stopProbe();
    stopSampler();
    await meterOff(phase);

    // Szczyt: wszyscy co 0,5–1 s, a Zosia wchodzi z linku w trakcie.
    phase = 'brama-szczyt';
    await meterOn(phase);
    stopProbe = probe(phase);
    stopSampler = sampleServer(phase);
    until = Date.now() + BRAMA_PEAK_MS;
    const campaign = queryOne<{ id: string }>(
      `SELECT id FROM Campaign WHERE name = 'Nocna zmiana'`,
    )!.id;
    const lateJoin = (async () => {
      const t0 = Date.now();
      zosia = await join(cast, 'Zosia', 'firefox', campaign);
      await onScene(zosia, 'Brama', BRAMA);
      const ready = Date.now() - t0;
      await startChatArrivals(zosia.page);
      await startFrameMeter(zosia.page, phase);
      await chatTab(zosia);
      await attempt(zosia, 'czat', () =>
        sayMarked(zosia!, 'Cześć, spóźniłam się — co mnie ominęło?'),
      );
      return ready;
    })();
    await Promise.all([
      loop(until, PEAK, gmTurnOnBrama),
      ...seats.map((seat) => loop(until, PEAK, () => playerTurnOnBrama(seat, PEAK))),
    ]);
    const lateReadyMs = await lateJoin;
    stopProbe();
    stopSampler();
    await meterOff(phase);

    const bramaEnded = Date.now();
    phase = 'brama-kontrola';
    const agreement = await tableAgrees('„Brama”');
    chatIntegrity('„Brama”');
    for (const seat of seats) {
      if (notesUnknown.has(seat.character)) continue;
      const stored =
        (
          JSON.parse(
            queryOne<{ data: string }>('SELECT data FROM Character WHERE name = ?', seat.character)!
              .data,
          ) as { notes?: string }
        ).notes ?? '';
      // Do poprawki #49 (02.10) dopiski ginęły pod obciążeniem przez spóźnione echo
      // zapisu (odtworzenie w `t7b-zapis-karty`).
      const lost = (notesTail.get(seat.character)!.match(/ ·\S+/g) ?? []).filter(
        (chunk) => !stored.split(' ').includes(chunk.trim()),
      );
      if (lost.length > 0) {
        notesLost[seat.character] = lost.map((chunk) => chunk.trim());
        test.info().annotations.push({
          type: `#49: ${seat.character} — zgubione dopiski notatek`,
          description: lost.join(''),
        });
      }
      expect.soft(lost, `#49: ${seat.character} — zgubione dopiski notatek`).toEqual([]);
    }
    recordMeasurement(FILE, `brama${RUN_SUFFIX}`, {
      czasWejsciaZosiMs: lateReadyMs,
      notatkiZgubione49: notesLost,
      czynnosci: Object.fromEntries(actions),
      nieudane: failures.length,
      opoznienieCzatuMs: await latencies(loadStartedAt, bramaEnded),
      sondaSerweraMs: {
        tempo: spread(rtt['brama-tempo'] ?? []),
        szczyt: spread(rtt['brama-szczyt'] ?? []),
      },
      klatkiMs: frames,
      serwer: memory,
      zgodnosc: agreement,
      rozmiarPrzed: sizesBefore,
      rozmiarPo: storageSizes(),
    });
    test.info().annotations.push({
      type: 'nieudane czynności („Brama”)',
      description:
        failures.map((f) => `${f.who}/${f.action}/${f.phase}: ${f.error}`).join(' | ') || '(brak)',
    });
  });

  test('„Knajpa” 3 min walki turowej: inicjatywa kubkiem naraz, tury graczy i statystów', async () => {
    test.setTimeout(KNAJPA_MS + 27 * 60_000);
    const page = mg.page;
    await page.getByRole('button', { name: 'Sceny', exact: true }).click();
    await sceneListRow(page, 'Knajpa').getByRole('button', { name: 'Aktywuj' }).click();
    await expect.poll(() => sceneByName('Knajpa').active).toBe(1);
    await sceneListRow(page, 'Knajpa').getByRole('button', { name: 'Pokaż' }).click();
    for (const actor of everyone()) await onScene(actor, 'Knajpa', KNAJPA);
    // Karty otwarte w czasie obciążenia (np. dwuklik w figurę) zasłaniają czarny pas.
    for (const actor of everyone()) {
      const close = actor.page.getByRole('button', { name: 'Zamknij kartę' });
      while ((await close.count()) > 0) await close.first().click();
    }

    const fighters = [
      ...seats.map((seat) => figure('Knajpa', seat.character).id),
      token('Szrama').id,
      token('Paser').id,
    ];
    const started = await emitAck(gm, 'combat:start', {
      sceneId: sceneByName('Knajpa').id,
      tokenIds: fighters,
    });
    expect(started, JSON.stringify(started)).toMatchObject({ ok: true });
    // Czterech graczy rzuca inicjatywę kubkiem jednocześnie.
    phase = 'knajpa-inicjatywa';
    await Promise.all(
      seats.map((seat) =>
        attempt(seat.actor, 'inicjatywa', async () => {
          await seat.actor.page.getByRole('button', { name: /^Rzuć inicjatywę:/ }).click();
          rollAttempts.set(seat.actor.name, (rollAttempts.get(seat.actor.name) ?? 0) + 1);
          await shakeCup(seat.actor.page);
        }),
      ),
    );
    await page.getByRole('button', { name: 'Walka', exact: true }).first().click();
    await expect
      .poll(
        () =>
          query<{ n: number }>(
            `SELECT count(*) AS n FROM Combatant c JOIN Token t ON t.id = c.tokenId
               WHERE c.initiative IS NOT NULL AND t.characterId IN (${seats.map(() => '?').join(',')})`,
            ...seats.map((seat) => characterId(seat.character)),
          )[0]!.n,
        { timeout: 30_000 },
      )
      .toBe(seats.length);
    await page.getByRole('button', { name: 'Rzuć wszystkim', exact: true }).click();
    await beginFight(page);
    await expect.poll(() => combatRow()?.activeCombatantId ?? null).not.toBeNull();

    phase = 'knajpa-walka';
    const knajpaStartedAt = Date.now();
    await meterOn(phase);
    const stopProbe = probe(phase);
    const stopSampler = sampleServer(phase);
    const until = Date.now() + KNAJPA_MS;
    const busy = new Set<Actor>();
    const away = new Map<string, boolean>();
    const turns: string[] = [];
    const turnWaits: number[] = [];

    async function chatter(seat: Seat) {
      while (Date.now() < until) {
        await seat.actor.page.waitForTimeout(rand(REALISTIC));
        if (busy.has(seat.actor) || Date.now() >= until) continue;
        busy.add(seat.actor);
        if (Math.random() < 0.5)
          await attempt(seat.actor, 'rzut', () => roll(seat.actor, seat.formula));
        else await attempt(seat.actor, 'czat', () => sayMarked(seat.actor, pick(LINES)));
        busy.delete(seat.actor);
      }
    }

    /**
     * Klient widzi turę z bazy — w kolejce za animacjami rzutów bywa to minuta i więcej,
     * a człowiek przy stole po prostu czeka. Czas czekania idzie do pomiaru.
     */
    async function seesTurn(actor: Actor) {
      const t0 = Date.now();
      const now = combatRow()?.activeCombatantId;
      await expect
        .poll(
          async () =>
            (await actor.store<{ combat: { activeCombatantId: string | null } | null }>('combat'))
              ?.combat?.activeCombatantId,
          { message: actor.name, timeout: 120_000 },
        )
        .toBe(now);
      turnWaits.push(Date.now() - t0);
    }

    /** Co wiedzą baza i klient gracza po marszu, który nie doszedł (marsz Sowy, T7c). */
    async function marchDiagnosis(actor: Actor, seat: Seat, to: [number, number]) {
      const f = figure('Knajpa', seat.character);
      const seen = (await actor.store<TokenStore>('token'))?.tokens[f.id];
      const chat = await actor.store<{
        items: { type: string; message?: { kind: string; text: string }; text?: string }[];
      }>('chat');
      const combatant = queryOne(
        `SELECT turnState, held, actionBypass, grappledById FROM Combatant WHERE tokenId = ?`,
        f.id,
      );
      return {
        cel: to,
        baza: [f.x / cells.Knajpa, f.y / cells.Knajpa],
        klient: seen ? [seen.x / cells.Knajpa, seen.y / cells.Knajpa] : null,
        tura: activeName(),
        uczestnik: combatant,
        sasiedzi: query<{ name: string; x: number; y: number }>(
          `SELECT t.name, t.x, t.y FROM Token t JOIN Scene s ON s.id = t.sceneId
             WHERE s.name = 'Knajpa' AND abs(t.x - ?) < ? AND abs(t.y - ?) < ?`,
          f.x,
          3 * cells.Knajpa,
          f.y,
          3 * cells.Knajpa,
        ).map((t) => `${t.name} ${t.x / cells.Knajpa},${t.y / cells.Knajpa}`),
        notki: (chat?.items ?? [])
          .slice(-6)
          .map((item) => item.text ?? `${item.message?.kind}: ${item.message?.text}`)
          .map((text) => String(text).slice(0, 160)),
        zaznaczenie: await actor.page.evaluate(
          () =>
            document.querySelector('.token-hud, .selection-hud')?.textContent?.slice(0, 160) ??
            null,
        ),
      };
    }

    async function driver() {
      while (Date.now() < until) {
        const name = activeName() ?? '';
        turns.push(name);
        const seat = seats.find((s) => s.character === name);
        await attempt(mg, 'MG widzi turę', () => seesTurn(mg));
        if (!seat) {
          // Statysta: MG mówi za niego i oddaje turę.
          await attempt(mg, 'czat', () => sayMarked(mg, `${name} rozgląda się nerwowo.`));
          await attempt(mg, 'następna tura', () => nextTurn(mg));
          continue;
        }
        const { actor } = seat;
        while (busy.has(actor)) await actor.page.waitForTimeout(100);
        busy.add(actor);
        await attempt(actor, 'widzi turę', () => seesTurn(actor));
        const out = away.get(seat.character) ?? false;
        const to: [number, number] = [seat.knajpa[0] + (out ? 0 : 1), seat.knajpa[1]];
        const marchFailuresBefore = failures.length;
        await attempt(actor, 'marsz', async () => {
          await march(actor, figure('Knajpa', seat.character).id, cells.Knajpa, to);
          await expect
            .poll(
              () => {
                const f = figure('Knajpa', seat.character);
                return [Math.round(f.x / cells.Knajpa), Math.round(f.y / cells.Knajpa)];
              },
              { timeout: 15_000 },
            )
            .toEqual(to);
          away.set(seat.character, !out);
        });
        if (failures.length > marchFailuresBefore) {
          failures[failures.length - 1]!.diag = await marchDiagnosis(actor, seat, to);
        }
        await attempt(actor, 'rzut', () => roll(actor, seat.formula));
        await actor.page.waitForTimeout(rand(REALISTIC));
        await attempt(actor, 'czat', () => sayMarked(actor, pick(LINES)));
        await attempt(actor, 'koniec tury', async () => {
          const before = combatRow()?.activeCombatantId;
          await actor.page.getByRole('button', { name: 'Kończę turę' }).click();
          await expect
            .poll(() => combatRow()?.activeCombatantId, { timeout: 15_000 })
            .not.toBe(before);
        });
        busy.delete(actor);
        // Jeśli koniec tury nie doszedł, MG oddaje ją sam (jak przy stole).
        if (activeName() === name) await attempt(mg, 'następna tura', () => nextTurn(mg));
      }
    }

    await Promise.all([driver(), ...seats.map(chatter)]);
    stopProbe();
    stopSampler();
    await meterOff(phase);
    const knajpaEnded = Date.now();

    phase = 'knajpa-kontrola';
    const agreement = await tableAgrees('„Knajpa”');
    chatIntegrity('„Knajpa”');
    test.info().annotations.push({
      type: 'tury w walce',
      description: `runda ${combatRow()?.round} · ${turns.join(' → ')}`,
    });
    const errors = Object.fromEntries(everyone().map((a) => [a.name, a.unexpectedErrors()]));
    test.info().annotations.push({
      type: 'konsola',
      description: JSON.stringify(errors).slice(0, 2_000),
    });
    recordMeasurement(FILE, `knajpa${RUN_SUFFIX}`, {
      tury: turns,
      czekanieNaTureMs: spread(turnWaits),
      runda: combatRow()?.round,
      czynnosci: Object.fromEntries(actions),
      nieudane: failures,
      opoznienieCzatuMs: await latencies(knajpaStartedAt, knajpaEnded),
      sondaSerweraMs: { walka: spread(rtt['knajpa-walka'] ?? []) },
      klatkiMs: { 'knajpa-walka': frames['knajpa-walka'] },
      serwer: memory,
      zgodnosc: agreement,
      rozmiarPo: storageSizes(),
      konsola: errors,
    });
    test.info().annotations.push({
      type: 'nieudane czynności (całość)',
      description:
        failures.map((f) => `${f.who}/${f.action}/${f.phase}: ${f.error}`).join(' | ') || '(brak)',
    });
    for (const [who, list] of Object.entries(errors)) {
      expect.soft(list, `konsola ${who}`).toEqual([]);
    }
  });
});
