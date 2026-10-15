import type { BrowserContext } from '@playwright/test';
import { Actor, expect, test, type Cast } from '../../fixtures/actors.ts';
import { queryOne, stateFingerprint } from '../../fixtures/db.ts';
import { KNAJPA } from '../../fixtures/maps.ts';
import { connectionStatus, expectReconnected, Network } from '../../fixtures/network.ts';
import { clickOnMap, fitCamera, tokenCentre, walkOnMap } from '../../fixtures/scene.ts';
import { DEAD_GATEWAY } from '../../fixtures/security.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { createInvitation, say, shakeCup } from '../../fixtures/table.ts';
import {
  activeName,
  cellCentre,
  characterRow,
  clientsSeeTurn,
  closeSheet,
  combatRow,
  lastMessageId,
  nextTurn,
  openSheet,
  rollAndWait,
  sceneRow,
  sheet,
  token,
} from '../../fixtures/walka.ts';
import {
  restoreCheckpoint,
  scriptDice,
  startInstance,
  startServer,
  stopServer,
} from '../../instance/instance.ts';

/**
 * T7a, część 1 (`testy.md` 6.3): walka pierwsza w „Knajpie” od punktu `po-T4a`
 * pod złą siecią — opóźnienie VPS 150 ± 50 ms (pola karty, marsz, podwójny klik),
 * gracz offline 30 s w swojej turze, Marek w dwóch kartach (jedno wezwanie, jeden
 * rzut) i zabicie serwera w trakcie marszu. Gateway martwy — AI to osobny plik.
 *
 * Wagi (decyzja MG z 01.10): utrata zapisanego stanu albo pad = B0; rozjazd
 * między klientami, którego nie naprawia F5, albo podwójny rzut/akcja = B1;
 * powrót tylko po F5 albo brak czytelnego „rozłączony” = B2.
 */

type Sheet = { notes: string };
type TokenStore = { tokens: Record<string, { x: number; y: number }> };

test.describe.serial('T7a odporność: walka pod złą siecią i restart serwera @odpornosc', () => {
  let mg: Actor;
  let marek: Actor;
  let ola: Actor;
  let cell: number;
  const net = new Map<Actor, Network>();
  const everyone = () => [mg, marek, ola];

  const at = (name: string) => [Math.round(token(name).x / cell), Math.round(token(name).y / cell)];

  /** Pozycja figury u klienta (magazyn `token`), w polach. */
  async function seenAt(actor: Actor, name: string) {
    const store = await actor.store<TokenStore>('token');
    const view = store?.tokens[token(name).id];
    return view ? [Math.round(view.x / cell), Math.round(view.y / cell)] : null;
  }

  /**
   * Ślad pozycji figury z magazynu klienta co klatkę — skok wstecz to pole bliżej
   * startu po polu dalej (echo spóźnionego `token:move`, upsert z pozycją z bazy).
   */
  function recordTrail(actor: Actor, name: string, ms = 8_000) {
    return actor.page.evaluate(
      ({ id, ms }) =>
        new Promise<{ x: number; y: number }[]>((resolve) => {
          const trail: { x: number; y: number }[] = [];
          const end = performance.now() + ms;
          const tick = () => {
            const state = window.__vttE2E?.stores.token?.getState() as
              { tokens: Record<string, { x: number; y: number }> } | undefined;
            const view = state?.tokens[id];
            if (view) {
              const last = trail[trail.length - 1];
              if (!last || last.x !== view.x || last.y !== view.y)
                trail.push({ x: view.x, y: view.y });
            }
            if (performance.now() < end) requestAnimationFrame(tick);
            else resolve(trail);
          };
          tick();
        }),
      { id: token(name).id, ms },
    );
  }

  /** Marek prowadzi Kowala marszem na pole `to`; `during` biegnie w czasie marszu. */
  async function marchKowal(to: number[], during?: () => Promise<void>) {
    await marek.page.keyboard.press('Escape');
    await clickOnMap(marek.page, tokenCentre(token('Kowal'), cell));
    await marek.page.waitForTimeout(300);
    await walkOnMap(marek.page, cellCentre(cell, to[0]!, to[1]!));
    await during?.();
    await expect.poll(() => at('Kowal'), { timeout: 20_000 }).toEqual(to);
  }

  /** Ramki z `Network.capture`, które niosą pozycję figury: ruch i lista (`token:sync`). */
  function kowalFrames(frames: string[], id: string): string[] {
    const shown: string[] = [];
    for (const frame of frames) {
      const space = frame.indexOf(' ');
      const raw = frame.slice(space + 1);
      if (!raw.startsWith('42[')) continue;
      const [event, body] = JSON.parse(raw.slice(2)) as [string, Record<string, unknown>];
      const where = (x: number) => (x / cell).toFixed(2);
      if (event === 'token:move' && body.tokenId === id) {
        shown.push(
          `${frame.slice(0, space)} move${body.final ? '!' : ''} ${where(body.x as number)}`,
        );
      } else if (event === 'token:sync' || event === 'token:upsert' || event === 'state:sync') {
        const list = (body.tokens ?? [body.token]) as { id: string; x: number }[] | undefined;
        const mine = list?.find((entry) => entry?.id === id);
        shown.push(`${frame.slice(0, space)} ${event.slice(6)} ${mine ? where(mine.x) : '—'}`);
      }
    }
    return shown;
  }

  function expectNoBackwardJump(who: string, trail: { x: number; y: number }[], startX: number) {
    const progress = trail.map((p) => Math.abs(p.x - startX));
    // Skok to cofnięcie o ćwierć pola i więcej; drgania interpolacji o kilka pikseli
    // (0,07 pola u Marka 01.10) przy stole są niewidoczne — tylko do adnotacji.
    const steps = progress.map((d, i) => (i > 0 ? progress[i - 1]! - d : 0));
    const backwards = steps.filter((back) => back > cell / 4);
    const jitter = Math.max(0, ...steps);
    if (jitter > 0) {
      test.info().annotations.push({
        type: `drganie marszu u ${who}`,
        description: `${(jitter / cell).toFixed(2)} pola`,
      });
    }
    const shown = trail
      .map((p) => `${(p.x / cell).toFixed(2)},${(p.y / cell).toFixed(2)}`)
      .join(' ');
    test.info().annotations.push({ type: `ślad marszu u ${who}`, description: shown });
    expect.soft(backwards, `${who}: kroki wstecz w marszu — ślad ${shown}`).toEqual([]);
  }

  /** Wiadomość z zakładki „Czat” — po karcie postaci panel stoi na „Postaciach”. */
  async function chat(actor: Actor, text: string) {
    await actor.page.getByRole('button', { name: /^Czat/ }).first().click();
    await say(actor, text);
  }

  async function join(cast: Cast) {
    let network: Network | undefined;
    const prepare = async (context: BrowserContext) => {
      network = await Network.install(context);
    };
    mg = await cast.mg('chromium', prepare);
    net.set(mg, network!);
    const campaignId = queryOne<{ id: string }>(
      `SELECT id FROM Campaign WHERE name = 'Nocna zmiana'`,
    )!.id;
    marek = await cast.gracz(
      'Marek',
      'chromium',
      await createInvitation(mg, campaignId, 'Marek'),
      prepare,
    );
    net.set(marek, network!);
    ola = await cast.gracz(
      'Ola',
      'firefox',
      await createInvitation(mg, campaignId, 'Ola'),
      prepare,
    );
    net.set(ola, network!);
  }

  test.beforeAll(async () => {
    test.setTimeout(3 * 60_000);
    await restoreCheckpoint('po-T4a');
    await startInstance(DEAD_GATEWAY);
    cell = sceneRow().gridSizePx;
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('start z po-T4a: trzy karty przez pośrednika gniazda, runda 2 od Kowala', async ({
    cast,
  }) => {
    test.setTimeout(3 * 60_000);
    await join(cast);
    for (const actor of everyone()) {
      expect(net.get(actor)!.connections, `${actor.name}: gniazdo przez pośrednika`).toBe(1);
      await expect
        .poll(
          async () => (await actor.store<{ scene: { name: string } | null }>('scene'))?.scene?.name,
        )
        .toBe('Knajpa');
      await fitCamera(actor.page, KNAJPA.width, KNAJPA.height).catch(() => undefined);
    }
    // Cień → Zbir → Ochroniarz → runda 2: Kowal (jak „koniec 1. rundy” w T4b).
    while (combatRow()?.round === 1) await nextTurn(mg);
    expect(activeName()).toBe('Kowal');
    await clientsSeeTurn(marek, ola);
  });

  test('7.1 opóźnienie 150 ± 50 ms: notatki Kowala i Iskry nie gubią znaków', async () => {
    test.setTimeout(3 * 60_000);
    for (const actor of everyone()) net.get(actor)!.latency(150, 50);
    const typed = {
      Kowal: ' | Opóźnienie VPS: dług u Pasera 500 ed, kontakt w Watson, nie ufać Rzeźnikowi.',
      Iskra: ' | Zażółć gęślą jaźń — Ola pisze w Firefoksie, a serwer odpowiada z opóźnieniem.',
    };
    const before = { Kowal: sheet<Sheet>('Kowal').notes, Iskra: sheet<Sheet>('Iskra').notes };

    async function typeNotes(actor: Actor, name: 'Kowal' | 'Iskra') {
      const region = await openSheet(actor, name);
      const notes = region.getByLabel('Notatki');
      await notes.click();
      await notes.press('Control+End');
      // Kawałki z przerwą dłuższą niż `CHARACTER_SAVE_DEBOUNCE_MS` (600 ms): zapis
      // poprzedniego kawałka jest w drodze, kiedy palce piszą następny.
      for (const chunk of typed[name].match(/.{1,12}/g)!) {
        await notes.pressSequentially(chunk, { delay: 35 });
        await actor.page.waitForTimeout(700);
      }
      return notes;
    }

    const [kowalNotes, iskraNotes] = await Promise.all([
      typeNotes(marek, 'Kowal'),
      typeNotes(ola, 'Iskra'),
    ]);
    // Echo serwera spóźnione o ~300 ms nie może cofnąć pola o ostatnie znaki.
    await marek.page.waitForTimeout(3_000);
    await expect(kowalNotes).toHaveValue(before.Kowal + typed.Kowal);
    await expect(iskraNotes).toHaveValue(before.Iskra + typed.Iskra);
    await expect.poll(() => sheet<Sheet>('Kowal').notes).toBe(before.Kowal + typed.Kowal);
    await expect.poll(() => sheet<Sheet>('Iskra').notes).toBe(before.Iskra + typed.Iskra);
    await closeSheet(marek.page);
    await closeSheet(ola.page);
  });

  test('7.1 opóźnienie: marsz Kowala nie skacze wstecz ani u Marka, ani u MG', async () => {
    test.setTimeout(2 * 60_000);
    const from = at('Kowal');
    const to = [from[0]! - 2, from[1]!];
    const trails = Promise.all([recordTrail(marek, 'Kowal'), recordTrail(mg, 'Kowal')]);
    await marchKowal(to);
    const [mine, gms] = await trails;
    expectNoBackwardJump('Marek', mine, from[0]! * cell);
    expectNoBackwardJump('MG', gms, from[0]! * cell);
    for (const actor of everyone()) {
      await expect.poll(() => seenAt(actor, 'Kowal'), { message: actor.name }).toEqual(to);
    }
  });

  test('#47 zapis karty Kowala w trakcie marszu nie cofa figury u nikogo', async () => {
    // Znalezione w T7a (01.10): każdy zapis karty rozsyłał `token:upsert` z pozycją
    // z bazy, a ta w czasie marszu jest jeszcze polem startowym (klatki pośrednie
    // nie trafiają do bazy) — u MG figura cofnęła się o 1,2 pola. Tu zapis notatek
    // Kowala (jak autozapis w trakcie marszu) leci celowo w połowie drogi, dwa razy.
    test.setTimeout(2 * 60_000);
    const from = at('Kowal');
    const to = [from[0]! + 2, from[1]!];
    const kowalId = characterRow('Kowal').id;
    const notes = sheet<Sheet>('Kowal').notes;
    const socket = await marek.socket();
    const trails = Promise.all([
      recordTrail(marek, 'Kowal'),
      recordTrail(mg, 'Kowal'),
      recordTrail(ola, 'Kowal'),
    ]);
    const saves = async () => {
      for (const [wait, mark] of [
        [500, ' | zapis w marszu 1'],
        [400, ' | zapis w marszu 2'],
      ] as const) {
        await new Promise((resolve) => setTimeout(resolve, wait));
        const ack = await emitAck(socket, 'character:update', {
          characterId: kowalId,
          patch: { data: { notes: `${notes}${mark}` } },
        });
        expect(ack.ok, mark).toBe(true);
      }
    };
    const olaFrames = net.get(ola)!.capture();
    await marchKowal(to, saves);
    const [mine, gms, olas] = await trails;
    test.info().annotations.push({
      type: 'Kowal w ramkach do Oli w czasie marszu (ms, zdarzenie, pole)',
      description: kowalFrames(olaFrames.stop(), token('Kowal').id).join(' | '),
    });
    expectNoBackwardJump('Marek', mine, from[0]! * cell);
    expectNoBackwardJump('MG', gms, from[0]! * cell);
    expectNoBackwardJump('Ola', olas, from[0]! * cell);
    // „Knajpa” ma widzenie Dynamiczne: gracze nie dostają upsertu, tylko listę
    // `token:sync` z bazy — pierwsza wersja poprawki (sam upsert) zostawiała
    // im ten skok. Z tarasu Ola nie widzi pola docelowego, więc figura znika
    // z jej magazynu (lista końcowa jej nie ma) — to widzenie, nie błąd.
    for (const actor of [mg, marek]) {
      await expect.poll(() => seenAt(actor, 'Kowal'), { message: actor.name }).toEqual(to);
    }
    await expect.poll(() => seenAt(ola, 'Kowal'), { message: 'Ola' }).not.toEqual(from);
    expect(sheet<Sheet>('Kowal').notes).toBe(`${notes} | zapis w marszu 2`);
  });

  test('7.1 opóźnienie: podwójny klik „Kończę turę” oddaje jedną turę, nie dwie', async () => {
    expect(activeName()).toBe('Kowal');
    await marek.page.getByRole('button', { name: 'Kończę turę' }).dblclick();
    await expect.poll(activeName).toBe('Iskra');
    // Drugi klik doszedł do serwera ~300 ms później — po nim dalej Iskra.
    await marek.page.waitForTimeout(3_000);
    expect(activeName(), 'tura Iskry nie przeskoczyła do Rzeźnika').toBe('Iskra');
    await clientsSeeTurn(mg, marek, ola);
    for (const actor of everyone()) net.get(actor)!.latency(0);
  });

  test('7.2 Ola offline 30 s w swojej turze: „Rozłączono”, potem ten sam stół bez F5', async () => {
    test.setTimeout(3 * 60_000);
    const ola$ = net.get(ola)!;
    // Figura, którą Iskra widzi (scena Dynamiczna: Paser przy barze bywa poza wzrokiem).
    const olaSees = Object.keys((await ola.store<TokenStore>('token'))?.tokens ?? {});
    const seen = ['Kowal', 'Rzeźnik', 'Zbir'].find((name) => olaSees.includes(token(name).id));
    test
      .info()
      .annotations.push({ type: 'figura widziana przez Iskrę', description: String(seen) });
    const moved = seen ? at(seen) : null;
    const eddies = sheet<{ eddies: number }>('Iskra').eddies;
    await ola$.goOffline();
    await expect(connectionStatus(ola)).toContainText('Rozłączono', { timeout: 10_000 });
    const offlineAt = Date.now();

    // Stół gra dalej: MG pisze, przestawia Pasera, Marek mówi.
    await chat(mg, 'Iskra, słyszysz nas? Zostań na linii.');
    const gm = await mg.socket();
    if (seen && moved) {
      expect(
        await emitAck(gm, 'token:move', {
          tokenId: token(seen).id,
          x: moved[0]! * cell,
          y: (moved[1]! - 1) * cell,
          final: true,
        }),
      ).toMatchObject({ ok: true });
    }
    expect(
      await emitAck(gm, 'character:update', {
        characterId: characterRow('Iskra').id,
        patch: { data: { eddies: eddies + 5 } },
      }),
    ).toMatchObject({ ok: true });
    await chat(marek, 'Ola wypadła z sieci, czekamy.');
    const shot = await ola.page.screenshot();
    await test.info().attach('Ola offline', { body: shot, contentType: 'image/png' });

    await ola.page.waitForTimeout(Math.max(0, 30_000 - (Date.now() - offlineAt)));
    await expect(connectionStatus(ola), 'po 30 s dalej czytelne „Rozłączono”').toContainText(
      'Rozłączono',
    );
    test.info().annotations.push({
      type: 'próby połączenia Oli w ciągu 30 s offline',
      description: String(ola$.refused),
    });
    await ola$.goOnline();
    await expectReconnected(ola);

    // Bez F5: to, co działo się w czasie przerwy, i ta sama tura.
    await ola.page.getByRole('button', { name: /^Czat/ }).first().click();
    for (const text of ['Iskra, słyszysz nas?', 'Ola wypadła z sieci']) {
      await expect(ola.page.locator('.chat-message', { hasText: text })).toHaveCount(1);
    }
    if (seen && moved) {
      await expect.poll(() => seenAt(ola, seen)).toEqual([moved[0]!, moved[1]! - 1]);
    }
    await expect
      .poll(async () => {
        const store = await ola.store<{
          characters: Record<string, { data: { eddies: number } }>;
        }>('character');
        return store?.characters[characterRow('Iskra').id]?.data.eddies;
      })
      .toBe(eddies + 5);
    await clientsSeeTurn(ola);
    await expect(ola.page.getByRole('button', { name: 'Kończę turę' })).toBeVisible();

    // I gra dalej: krok Iskry z tarasu, jak w T4b.
    await ola.page.keyboard.press('Escape');
    await clickOnMap(ola.page, tokenCentre(token('Iskra'), cell));
    await ola.page.waitForTimeout(300);
    await walkOnMap(ola.page, { x: 5.5 * cell, y: 19.85 * cell });
    await expect.poll(() => at('Iskra'), { timeout: 20_000 }).toEqual([5, 19]);
    for (const actor of everyone()) {
      await expect.poll(() => seenAt(actor, 'Iskra'), { message: actor.name }).toEqual([5, 19]);
    }
  });

  test('7.4 Marek w dwóch kartach: wezwanie w obu, rzut raz, druga karta widzi wynik', async () => {
    test.setTimeout(3 * 60_000);
    const second = await marek.context.newPage();
    const twin = new Actor('Marek-2', 'chromium', marek.context, second);
    await second.goto('/');
    await expect
      .poll(async () => (await twin.store<{ status: string } | null>('auth'))?.status)
      .toBe('authenticated');
    await expect
      .poll(
        async () => (await twin.store<{ scene: { name: string } | null }>('scene'))?.scene?.name,
      )
      .toBe('Knajpa');
    for (const page of [marek.page, second]) {
      expect(await page.evaluate(() => document.visibilityState)).toBe('visible');
    }

    const gm = await mg.socket();
    const call = async (prompt: string) => {
      const ack = await emitAck(gm, 'check:call', {
        characterId: characterRow('Kowal').id,
        request: { kind: 'skill', skillId: 'perception' },
        dv: 13,
        visibility: 'public',
        prompt,
      });
      expect(ack, JSON.stringify(ack)).toMatchObject({ ok: true });
      return queryOne<{ id: number }>(
        `SELECT id FROM ChatMessage WHERE kind = 'check' ORDER BY id DESC LIMIT 1`,
      )!.id;
    };
    const rollsFor = (callId: number) =>
      queryOne<{ n: number }>(
        `SELECT count(*) AS n FROM ChatMessage WHERE kind = 'roll' AND id > ?
           AND text LIKE 'Wezwanie: Percepcja%'`,
        callId,
      )!.n;
    const callCard = (page: typeof second, prompt: string) =>
      page.locator('.chat-message.chat-check', { hasText: prompt }).last();

    // Jedna karta odpowiada — druga widzi rozstrzygnięcie i nie ma już „Rzuć”.
    const first = 'Ktoś grzebie przy zamku zaplecza.';
    const firstId = await call(first);
    for (const page of [marek.page, second]) {
      await page.getByRole('button', { name: /^Czat/ }).first().click();
      await expect(callCard(page, first).getByRole('button', { name: 'Rzuć' })).toBeVisible();
    }
    scriptDice([6]);
    const before = lastMessageId();
    await callCard(marek.page, first).getByRole('button', { name: 'Rzuć' }).click();
    await marek.page.locator('.dialog').last().getByRole('button', { name: 'Weź kubek' }).click();
    await rollAndWait(marek, before, 'Wezwanie: Percepcja');
    await expect(callCard(second, first)).toContainText(/Zdane|Niezdane|Porażka/, {
      timeout: 30_000,
    });
    await expect(callCard(second, first).getByRole('button', { name: 'Rzuć' })).toHaveCount(0);
    expect(rollsFor(firstId)).toBe(1);

    // Obie karty naraz: kubek w obu, rzut w obu — serwer przyjmuje jeden.
    const race = 'Pod barem coś błysnęło.';
    const raceId = await call(race);
    for (const page of [marek.page, second]) {
      await expect(callCard(page, race).getByRole('button', { name: 'Rzuć' })).toBeVisible();
      await callCard(page, race).getByRole('button', { name: 'Rzuć' }).click();
      await page.locator('.dialog').last().getByRole('button', { name: 'Weź kubek' }).click();
    }
    scriptDice([5, 5]);
    await Promise.all([shakeCup(marek.page), shakeCup(second)]);
    await expect.poll(() => rollsFor(raceId), { timeout: 20_000 }).toBeGreaterThan(0);
    await marek.page.waitForTimeout(5_000);
    test.info().annotations.push({
      type: 'rzuty z dwóch kart na jedno wezwanie',
      description: String(rollsFor(raceId)),
    });
    expect(rollsFor(raceId), 'jedno wezwanie = jeden rzut').toBe(1);
    // Obie karty Marka i MG widzą to samo rozstrzygnięcie (wezwanie nie idzie do Oli).
    for (const page of [marek.page, second, mg.page]) {
      await page.getByRole('button', { name: /^Czat/ }).first().click();
      await expect(callCard(page, race)).toContainText(/Zdane|Niezdane|Porażka/, {
        timeout: 30_000,
      });
    }
    scriptDice([]);
    await second.close();
  });

  test('7.3 restart serwera w trakcie marszu Iskry: nic zapisanego nie znika, klienci wracają sami', async () => {
    test.setTimeout(4 * 60_000);
    expect(activeName()).toBe('Iskra');
    // Marsz z (5, 19) dwa pola na wschód — serwer pada zaraz po rozkazie.
    await ola.page.keyboard.press('Escape');
    await clickOnMap(ola.page, tokenCentre(token('Iskra'), cell));
    await ola.page.waitForTimeout(300);
    await walkOnMap(ola.page, { x: 7.5 * cell, y: 19.85 * cell });
    await ola.page.waitForTimeout(250);
    await stopServer();
    const saved = stateFingerprint();
    const iskra = at('Iskra');
    test.info().annotations.push({
      type: 'Iskra w bazie w chwili padu',
      description: JSON.stringify(iskra),
    });
    for (const actor of everyone()) {
      await expect(connectionStatus(actor), actor.name).toContainText('Rozłączono', {
        timeout: 15_000,
      });
    }

    await startServer(DEAD_GATEWAY);
    // Ten sam stan w bazie po starcie — start serwera niczego nie zjada ani nie dopisuje.
    expect(stateFingerprint()).toEqual(saved);
    for (const actor of everyone()) await expectReconnected(actor, 45_000);
    expect(await mg.store<{ status: string }>('auth')).toMatchObject({ status: 'authenticated' });

    // Klienci zgodni z bazą: tura, pozycje figur, ta sama runda.
    await clientsSeeTurn(mg, marek, ola);
    // Każda figura, którą klient zna (scena Dynamiczna — każdy widzi co innego), stoi tam,
    // gdzie w bazie; własne figury graczy są u nich zawsze.
    const misplaced = async (actor: Actor) => {
      const store = await actor.store<TokenStore>('token');
      return Object.entries(store?.tokens ?? {})
        .map(([id, view]) => {
          const row = queryOne<{ name: string; x: number; y: number }>(
            'SELECT name, x, y FROM Token WHERE id = ?',
            id,
          );
          return row &&
            (Math.round(row.x) !== Math.round(view.x) || Math.round(row.y) !== Math.round(view.y))
            ? `${row.name}: ${view.x},${view.y} ≠ ${row.x},${row.y}`
            : null;
        })
        .filter(Boolean);
    };
    for (const actor of everyone()) {
      await expect.poll(() => misplaced(actor), { message: actor.name }).toEqual([]);
    }
    expect(await seenAt(marek, 'Kowal')).toEqual(at('Kowal'));
    expect(await seenAt(ola, 'Iskra')).toEqual(at('Iskra'));
    expect(
      Object.keys((await mg.store<TokenStore>('token'))!.tokens).length,
    ).toBeGreaterThanOrEqual(7);
    // Stół działa: wiadomość od Marka dochodzi do MG i Oli.
    await chat(marek, 'Wróciliśmy po restarcie.');
    for (const actor of [mg, ola]) {
      await expect(
        actor.page.locator('.chat-message', { hasText: 'Wróciliśmy po restarcie.' }),
      ).toHaveCount(1);
    }
    // Restart zostawia w konsoli odmowy połączenia z chwili, gdy serwer leżał (pułapka `testy`).
    for (const actor of everyone()) {
      const errors = actor
        .unexpectedErrors()
        .filter(
          (text) => !/ERR_CONNECTION_REFUSED|2152398861|socket\.io|status of 50[23]/.test(text),
        );
      test.info().annotations.push({
        type: `konsola ${actor.name}`,
        description: actor.consoleErrors.join(' | ').slice(0, 1_500) || '(czysta)',
      });
      expect(errors, actor.name).toEqual([]);
    }
  });
});
