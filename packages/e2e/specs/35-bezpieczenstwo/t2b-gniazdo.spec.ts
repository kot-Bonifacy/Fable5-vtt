import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { query, queryOne, stateFingerprint } from '../../fixtures/db.ts';
import {
  campaignId,
  characterId,
  sceneId,
  startFromPoT3,
  tokenOf,
} from '../../fixtures/nocna-zmiana.ts';
import {
  probe,
  probesFor,
  rawSocket,
  realtimeEvents,
  ServerLog,
  serverAlive,
  type ProbeOutcome,
} from '../../fixtures/security.ts';
import { emitAck, type Ack } from '../../fixtures/socket.ts';
import { createInvitation, say } from '../../fixtures/table.ts';
import { BASE_URL } from '../../instance/paths.ts';

/**
 * T2, gniazdo (`testy.md` 6.2, punkty 1–4): macierz ról z rejestru serwera,
 * własność, śmieciowe ładunki (gracz i — decyzja MG z 26.09 — także MG), zalew.
 * Start z kopii `po-T3`; śmieci MG na końcu pliku niszczą stan (to kopia).
 *
 * Progi (decyzje MG z 26.09): zalew, po którym wiadomość innego gracza albo ruch
 * MG dochodzi po ponad **5 s**, to B1; pad serwera to B0; `INTERNAL` bez szkody
 * w stanie — jeden zbiorczy B3.
 */

/** Nagłówek `cookie` przeglądarki aktora — surowe gniazdo tej samej sesji. */
async function cookieOf(actor: Actor): Promise<string> {
  const cookies = await actor.context.cookies(BASE_URL);
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

async function socketOf(actor: Actor): Promise<Socket> {
  const { socket, error } = await rawSocket(await cookieOf(actor));
  if (!socket) throw new Error(`E2E: ${actor.name} socket refused: ${error}`);
  return socket;
}

const rowHash = (sql: string, ...params: string[]): string => JSON.stringify(query(sql, ...params));

function describeOutcome(outcome: ProbeOutcome): string {
  if (outcome.kind === 'ack') return outcome.ack.ok ? 'ok' : outcome.ack.error;
  return outcome.kind === 'no-ack' ? 'BRAK ACK' : `ROZŁĄCZONO (${outcome.reason})`;
}

/** Wynik serii śmieciowych ładunków — do adnotacji i asercji. */
interface FuzzReport {
  sent: number;
  internal: string[];
  noAck: string[];
  disconnected: string[];
  accepted: string[];
}

/**
 * Wszystkie próby `probesFor(realIds)` na liście zdarzeń z gniazda aktora.
 * Zdarzenie, które dwa razy nie odpowie, traci resztę prób (nie czekamy godzinami).
 */
async function fuzz(
  actor: Actor,
  events: string[],
  realIds: Record<string, unknown>,
): Promise<FuzzReport> {
  const report: FuzzReport = { sent: 0, internal: [], noAck: [], disconnected: [], accepted: [] };
  let socket = await socketOf(actor);
  for (const event of events) {
    let silent = 0;
    const accepted: string[] = [];
    for (const sample of probesFor(realIds)) {
      if (silent >= 2) break;
      report.sent += 1;
      const outcome = await probe(socket, event, sample);
      const where = `${event} [${sample.label}]`;
      if (outcome.kind === 'no-ack') {
        silent += 1;
        report.noAck.push(where);
      } else if (outcome.kind === 'disconnected') {
        report.disconnected.push(`${where}: ${outcome.reason}`);
        if (!(await serverAlive())) throw new Error(`E2E: server died on ${where}`);
        socket = await socketOf(actor);
      } else if (!outcome.ack.ok && outcome.ack.error === 'INTERNAL') {
        report.internal.push(where);
      } else if (outcome.ack.ok) {
        accepted.push(sample.label);
      }
    }
    if (accepted.length > 0) report.accepted.push(`${event}: ${accepted.join(', ')}`);
  }
  socket.disconnect();
  return report;
}

function annotateFuzz(title: string, report: FuzzReport, log: ServerLog): void {
  const failures = log.handlerFailures();
  test
    .info()
    .annotations.push(
      { type: 'fuzz', description: `${title}: ${report.sent} prób` },
      { type: 'fuzz-INTERNAL', description: report.internal.join(' | ') || '—' },
      { type: 'fuzz-log', description: [...new Set(failures)].join(' | ') || '—' },
      { type: 'fuzz-brak-ack', description: report.noAck.join(' | ') || '—' },
      { type: 'fuzz-rozlaczono', description: report.disconnected.join(' | ') || '—' },
      { type: 'fuzz-przyjete', description: report.accepted.join(' | ') || '—' },
    );
}

/** Zdarzenia niszczące na koniec — żeby śmieci z prawdziwym id nie skasowały celu reszcie prób. */
function destructiveLast(names: string[]): string[] {
  const destructive = /delete|clear|remove|reset|undo|forget|discard|end$/;
  return [
    ...names.filter((name) => !destructive.test(name)),
    ...names.filter((name) => destructive.test(name)),
  ];
}

test.describe.serial('T2 gniazdo: role, własność, śmieci, zalew', () => {
  let mg: Actor;
  let marek: Actor;
  let ola: Actor;
  let campaign: string;
  let kowal: string;
  let iskra: string;
  let paser: string;
  let kowalToken: string;
  let iskraToken: string;
  let paserToken: string;
  let knajpa: string;
  let playerFuzz: FuzzReport;
  let gmFuzz: FuzzReport;
  let floodLatency = { chat: Infinity, move: Infinity, page: Infinity };
  const log = new ServerLog();

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    await startFromPoT3();
    campaign = campaignId();
    kowal = characterId('Kowal');
    iskra = characterId('Iskra');
    paser = characterId('Paser');
    kowalToken = tokenOf('Kowal');
    iskraToken = tokenOf('Iskra');
    paserToken = tokenOf('Paser');
    knajpa = sceneId('Knajpa');
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('start z po-T3: MG, Marek i Ola przy stole', async ({ cast }) => {
    mg = await cast.mg('chromium');
    const token = await createInvitation(mg, campaign);
    marek = await cast.gracz('Marek', 'chromium', token);
    ola = await cast.gracz('Ola', 'firefox', token);
    for (const actor of [mg, marek, ola]) {
      await expect(actor.page.getByLabel('Wiadomość czatu')).toBeEnabled();
    }
  });

  test('6.2.1 macierz ról: każde zdarzenie MG z gniazda gracza → FORBIDDEN, baza bez zmian', async () => {
    const gmEvents = realtimeEvents().filter((event) => event.gmOnly);
    expect(gmEvents.length).toBeGreaterThan(100);
    const socket = await socketOf(marek);
    const before = stateFingerprint();
    const realIds = {
      campaignId: campaign,
      sceneId: knajpa,
      tokenId: paserToken,
      characterId: kowal,
      botId: 'x',
    };
    const leaks: string[] = [];
    for (const { name } of gmEvents) {
      for (const payload of [{}, realIds]) {
        const ack = await emitAck(socket, name, payload);
        if (ack.ok || ack.error !== 'FORBIDDEN') leaks.push(`${name}: ${JSON.stringify(ack)}`);
      }
    }
    socket.disconnect();
    test.info().annotations.push({
      type: 'macierz',
      description: `${gmEvents.length} zdarzeń MG × 2 ładunki z gniazda Marka`,
    });
    expect(leaks).toEqual([]);
    expect(stateFingerprint()).toEqual(before);
  });

  test('6.2.2 własność, przegląd: każde otwarte zdarzenie Oli z id Kowala nie rusza Kowala', async () => {
    const openEvents = realtimeEvents().filter((event) => !event.gmOnly);
    const socket = await socketOf(ola);
    const kowalState = () =>
      rowHash('SELECT * FROM Character WHERE id = ?', kowal) +
      rowHash('SELECT * FROM Token WHERE id = ?', kowalToken) +
      rowHash('SELECT id FROM LedgerEntry WHERE characterId = ?', kowal);
    const payload = {
      characterId: kowal,
      fromCharacterId: kowal,
      toCharacterId: iskra,
      tokenId: kowalToken,
      attackerTokenId: kowalToken,
      fromTokenId: kowalToken,
      sceneId: knajpa,
      x: 700,
      y: 700,
      final: true,
      amount: 100,
      eddies: 100,
      items: [],
      patch: { notes: 'Ola pisze na karcie Kowala', data: { notes: 'Ola pisze na karcie Kowala' } },
      request: { kind: 'skill', skillId: 'perception' },
      visibility: 'public',
      facing: 90,
    };
    const touched: string[] = [];
    const answers: string[] = [];
    for (const { name } of openEvents) {
      const before = kowalState();
      const ack = await emitAck(socket, name, payload);
      answers.push(`${name}: ${ack.ok ? 'ok' : ack.error}`);
      if (kowalState() !== before) touched.push(`${name}: ${JSON.stringify(ack).slice(0, 200)}`);
    }
    socket.disconnect();
    test.info().annotations.push({ type: 'odpowiedzi', description: answers.join(' | ') });
    expect(touched, 'zdarzenia, którymi Ola zmieniła Kowala').toEqual([]);
  });

  test('6.2.2 własność: ruch, karta, rzut, ekwipunek, eurodolce, usunięcie cudzej postaci', async () => {
    const socket = await socketOf(ola);
    const kowalRow = () => rowHash('SELECT * FROM Character WHERE id = ?', kowal);
    const tokenRow = () => rowHash('SELECT * FROM Token WHERE id = ?', kowalToken);
    const messages = () => query('SELECT id FROM ChatMessage').length;
    const before = { card: kowalRow(), token: tokenRow(), messages: messages() };
    const attempts: [string, unknown][] = [
      ['token:move', { tokenId: kowalToken, x: 700, y: 700, final: true }],
      ['token:move', { tokenId: kowalToken, x: 700, y: 700, final: false }],
      ['token:facing', { tokenId: kowalToken, facing: 180 }],
      ['character:update', { characterId: kowal, patch: { data: { notes: 'przejęte' } } }],
      ['character:update', { characterId: kowal, patch: { name: 'Przejęty' } }],
      ['character:update', { characterId: kowal, patch: { ownerId: null } }],
      [
        'character:roll',
        {
          characterId: kowal,
          request: { kind: 'skill', skillId: 'perception' },
          visibility: 'public',
        },
      ],
      ['inventory:give', { fromCharacterId: kowal, toCharacterId: iskra, items: [], eddies: 100 }],
      ['economy:transfer', { fromCharacterId: kowal, toCharacterId: iskra, amount: 100 }],
      ['economy:history', { characterId: kowal }],
      ['character:xp-history', { characterId: kowal }],
      ['character:delete', { characterId: kowal }],
      ['character:rest', { characterId: kowal }],
      ['weapon:reload', { characterId: kowal, weaponRowId: 'x' }],
      ['token:light', { tokenId: kowalToken }],
    ];
    const results: string[] = [];
    for (const [event, payload] of attempts) {
      const ack = await emitAck(socket, event, payload);
      results.push(
        `${event}: ${ack.ok ? `ok ${JSON.stringify(ack.data ?? '').slice(0, 120)}` : ack.error}`,
      );
      expect(ack.ok, `${event} ${JSON.stringify(payload)}`).toBe(false);
    }
    socket.disconnect();
    test.info().annotations.push({ type: 'odmowy', description: results.join(' | ') });
    expect(kowalRow()).toBe(before.card);
    expect(tokenRow()).toBe(before.token);
    expect(messages()).toBe(before.messages);
  });

  test('6.2.2 własność: cudzy handel — Ola nie przyjmuje, nie składa ofert, nie akceptuje', async () => {
    const gmSocket = await socketOf(mg);
    const marekSocket = await socketOf(marek);
    const olaSocket = await socketOf(ola);
    const ledger = () =>
      query(`SELECT id FROM LedgerEntry WHERE characterId IN (?, ?)`, kowal, paser).length;
    const ledgerBefore = ledger();
    const kowalAt = queryOne<{ x: number; y: number }>(
      'SELECT x, y FROM Token WHERE id = ?',
      kowalToken,
    )!;
    const paserAt = queryOne<{ x: number; y: number }>(
      'SELECT x, y FROM Token WHERE id = ?',
      paserToken,
    )!;
    // Handel wymaga zasięgu: MG stawia Pasera tuż obok Kowala (na koniec wraca).
    const cell = queryOne<{ gridSizePx: number }>(
      'SELECT gridSizePx FROM Scene WHERE id = ?',
      knajpa,
    )!.gridSizePx;
    expect(
      await emitAck(gmSocket, 'token:move', {
        tokenId: paserToken,
        x: kowalAt.x + cell,
        y: kowalAt.y,
        final: true,
      }),
    ).toMatchObject({ ok: true });
    const invite = await emitAck<{ trade: { id: string; version: number } }>(
      marekSocket,
      'trade:invite',
      { fromCharacterId: kowal, toTokenId: paserToken },
    );
    expect(invite, JSON.stringify(invite)).toMatchObject({ ok: true });
    const tradeId = invite.ok ? invite.data!.trade.id : '';
    const refused = async (socket: Socket, event: string, payload: unknown) => {
      const ack = await emitAck(socket, event, payload);
      expect(ack.ok, `${event} ${JSON.stringify(ack)}`).toBe(false);
    };
    await refused(olaSocket, 'trade:respond', { tradeId, accept: true });
    await refused(marekSocket, 'trade:respond', { tradeId, accept: true });
    const opened = await emitAck(gmSocket, 'trade:respond', { tradeId, accept: true });
    expect(opened, JSON.stringify(opened)).toMatchObject({ ok: true });
    await refused(olaSocket, 'trade:offer', { tradeId, items: [], eddies: 0 });
    await refused(olaSocket, 'trade:accept', { tradeId, version: 1, accepted: true });
    await refused(olaSocket, 'trade:accept', { tradeId, version: 2, accepted: true });
    await refused(olaSocket, 'trade:cancel', { tradeId });
    const olaList = await emitAck<unknown>(olaSocket, 'trade:list', {});
    expect(JSON.stringify(olaList)).not.toContain(tradeId);
    expect(await emitAck(marekSocket, 'trade:cancel', { tradeId })).toMatchObject({ ok: true });
    await emitAck(gmSocket, 'token:move', { tokenId: paserToken, ...paserAt, final: true });
    for (const socket of [gmSocket, marekSocket, olaSocket]) socket.disconnect();
    // Pozostałość handlu na kartach: nikt nic nie oddał.
    expect(ledger()).toBe(ledgerBefore);
  });

  test('6.2.2 własność: cudze wezwanie do Testu — Ola nie odpowiada za Marka', async () => {
    const gmSocket = await socketOf(mg);
    const olaSocket = await socketOf(ola);
    const call = await emitAck(gmSocket, 'check:call', {
      characterId: kowal,
      request: { kind: 'skill', skillId: 'perception' },
      dv: 13,
      visibility: 'public',
      prompt: 'Coś skrzypi na zapleczu.',
    });
    expect(call, JSON.stringify(call)).toMatchObject({ ok: true });
    const stored = queryOne<{ id: number; payload: string }>(
      `SELECT id, payload FROM ChatMessage WHERE kind = 'check' ORDER BY id DESC LIMIT 1`,
    )!;
    for (const characterId of [iskra, kowal]) {
      const ack = await emitAck(olaSocket, 'character:roll', {
        characterId,
        request: { kind: 'skill', skillId: 'perception' },
        visibility: 'public',
        callMessageId: stored.id,
      });
      expect(ack.ok, `character:roll ${characterId} ${JSON.stringify(ack)}`).toBe(false);
    }
    const after = queryOne<{ payload: string }>(
      'SELECT payload FROM ChatMessage WHERE id = ?',
      stored.id,
    )!;
    expect(JSON.parse(after.payload)).not.toHaveProperty('resolved');
    expect(await emitAck(gmSocket, 'check:cancel', { messageId: stored.id })).toMatchObject({
      ok: true,
    });
    gmSocket.disconnect();
    olaSocket.disconnect();
  });

  test('6.2.3 XSS: HTML i odnośnik javascript: na czacie zostają tekstem', async () => {
    const html = '<img src=x onerror="window.__xss=1"><b id="xss-bold">pogrubione</b>';
    await say(marek, html);
    await say(marek, '[kliknij](javascript:window.__xss=2) [też](JaVaScRiPt:window.__xss=3)');
    for (const actor of [mg, ola]) {
      await expect(actor.page.locator('.chat-message', { hasText: 'pogrubione' })).toBeVisible();
      expect(await actor.page.locator('.chat-panel img[src="x"], #xss-bold').count()).toBe(0);
      expect(await actor.page.locator('a[href^="javascript" i]').count()).toBe(0);
      expect(await actor.page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
    }
  });

  test('6.2.4 zalew: 500 wiadomości i 2000 ruchów Marka — serwer żyje, pomiar opóźnień', async () => {
    test.setTimeout(180_000);
    const flood = await socketOf(marek);
    const olaSocket = await socketOf(ola);
    const gmSocket = await socketOf(mg);
    const messagesBefore = query(`SELECT id FROM ChatMessage WHERE text LIKE 'ZALEW-%'`).length;
    const kowalAt = queryOne<{ x: number; y: number }>(
      'SELECT x, y FROM Token WHERE id = ?',
      kowalToken,
    )!;
    const iskraAt = queryOne<{ x: number; y: number }>(
      'SELECT x, y FROM Token WHERE id = ?',
      iskraToken,
    )!;

    const waitFor = <T>(socket: Socket, event: string, match: (payload: T) => boolean) =>
      new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`E2E: no ${event} in 60 s`)), 60_000);
        const handler = (payload: T) => {
          if (!match(payload)) return;
          clearTimeout(timer);
          socket.off(event, handler);
          resolve(Date.now());
        };
        socket.on(event, handler);
      });

    const acks: Ack[] = [];
    const floodStart = Date.now();
    for (let i = 0; i < 500; i += 1) {
      flood.emit('chat:send', { text: `ZALEW-${i} bla bla bla` }, (ack: Ack) => acks.push(ack));
    }
    for (let i = 0; i < 2000; i += 1) {
      flood.emit('token:move', {
        tokenId: kowalToken,
        x: kowalAt.x + ((i % 20) - 10),
        y: kowalAt.y + ((i % 7) - 3),
        final: false,
      });
    }
    const emitted = Date.now() - floodStart;

    // W środku zalewu: Ola pisze do stołu, MG przesuwa Iskrę, MG pisze do stołu.
    const olaText = `PING-OLA-${Date.now()}`;
    const mgText = `PING-MG-${Date.now()}`;
    const sentAt = Date.now();
    const olaToMg = waitFor<{ message?: { text?: string } }>(gmSocket, 'chat:message', (p) =>
      JSON.stringify(p).includes(olaText),
    );
    const moveToOla = waitFor<{ tokenId?: string }>(
      olaSocket,
      'token:move',
      (p) => p.tokenId === iskraToken,
    );
    olaSocket.emit('chat:send', { text: olaText }, () => undefined);
    gmSocket.emit(
      'token:move',
      { tokenId: iskraToken, x: iskraAt.x, y: iskraAt.y + 1, final: true },
      () => undefined,
    );
    gmSocket.emit('chat:send', { text: mgText }, () => undefined);
    const [chatAt, moveAt] = await Promise.all([olaToMg, moveToOla]);
    await expect(ola.page.locator('.chat-message', { hasText: mgText })).toBeVisible({
      timeout: 60_000,
    });
    const pageAt = Date.now();
    await expect.poll(() => acks.length, { timeout: 120_000 }).toBe(500);
    const allAt = Date.now();

    const latency = {
      chat: (chatAt - sentAt) / 1000,
      move: (moveAt - sentAt) / 1000,
      page: (pageAt - sentAt) / 1000,
    };
    const stored =
      query(`SELECT id FROM ChatMessage WHERE text LIKE 'ZALEW-%'`).length - messagesBefore;
    const refusals = [...new Set(acks.filter((a) => !a.ok).map((a) => (a.ok ? '' : a.error)))];
    test.info().annotations.push({
      type: 'pomiar',
      description:
        `zalew wysłany w ${emitted} ms; 500 ack po ${((allAt - floodStart) / 1000).toFixed(1)} s; ` +
        `zapisanych ${stored}/500, odmowy: ${refusals.join(', ') || 'żadnych'}; ` +
        `Ola→MG czat ${latency.chat.toFixed(2)} s, ruch MG→Ola ${latency.move.toFixed(2)} s, ` +
        `czat MG na ekranie Oli (Firefox) ${latency.page.toFixed(2)} s`,
    });
    if (stored === 500) {
      test.info().annotations.push({
        type: 'zadanie',
        description:
          'Brak limitu tempa na gnieździe: 500 wiadomości gracza w kilka sekund zapisanych w całości — ' +
          'etap „Konta MG” (limit per sesja) i 28 (Caddy), decyzja MG z 26.09.',
      });
    }
    for (const socket of [flood, olaSocket, gmSocket]) socket.disconnect();
    floodLatency = latency;
    expect(await serverAlive()).toBe(true);
  });

  test('6.2.4 zalew nie dławi innych graczy ponad 5 s (#13)', async () => {
    test.fail(true, '#13: 500 wiadomości jednego gracza opóźnia czat i ruchy innych o 6–8 s');
    expect(floodLatency.chat, 'czat Oli do MG w trakcie zalewu').toBeLessThanOrEqual(5);
    expect(floodLatency.move, 'ruch MG u Oli w trakcie zalewu').toBeLessThanOrEqual(5);
    expect(floodLatency.page, 'czat MG na ekranie Oli w trakcie zalewu').toBeLessThanOrEqual(5);
  });

  test('6.2.3 ładunek ponad 1 MB zrywa tylko to gniazdo, serwer żyje', async () => {
    const socket = await socketOf(marek);
    const outcome = await probe(socket, 'chat:send', {
      label: '1,1 MB',
      payload: { text: 'a'.repeat(1_100_000) },
    });
    test.info().annotations.push({ type: 'wynik', description: describeOutcome(outcome) });
    expect(outcome.kind).toBe('disconnected');
    socket.disconnect();
    expect(await serverAlive()).toBe(true);
    expect(query(`SELECT id FROM ChatMessage WHERE length(text) > 1000000`)).toEqual([]);
  });

  test('6.2.3 śmieci gracza: otwarte zdarzenia z gniazda Marka — bez padu i bez wiszenia', async () => {
    test.setTimeout(20 * 60_000);
    // `character:delete` ma własny test (#14) — w śmieciach skasowałby Kowala.
    const open = destructiveLast(
      realtimeEvents()
        .filter((event) => !event.gmOnly && event.name !== 'character:delete')
        .map((event) => event.name),
    );
    log.mark();
    playerFuzz = await fuzz(marek, open, {
      characterId: kowal,
      tokenId: kowalToken,
      attackerTokenId: kowalToken,
      fromCharacterId: kowal,
      sceneId: knajpa,
    });
    annotateFuzz('gracz', playerFuzz, log);
    expect(await serverAlive()).toBe(true);
    expect(playerFuzz.noAck, 'zdarzenia bez odpowiedzi').toEqual([]);
    expect(playerFuzz.disconnected, 'zerwane połączenia').toEqual([]);
  });

  test('6.2.3 śmieci gracza: żadnego INTERNAL (#15)', async () => {
    expect(playerFuzz.internal).toEqual([]);
  });

  test('6.2.3 po śmieciach gracza stół działa: F5 u wszystkich, czat w obie strony', async () => {
    for (const actor of [mg, marek, ola]) {
      actor.consoleErrors.length = 0;
      await actor.page.reload();
      await expect(actor.page.getByLabel('Wiadomość czatu')).toBeEnabled();
    }
    await say(ola, 'Po burzy — Ola.');
    await expect(mg.page.locator('.chat-message', { hasText: 'Po burzy — Ola.' })).toBeVisible();
    for (const actor of [mg, marek, ola]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
  });

  test('6.2.2 gracz nie usuwa własnej postaci przyjętej do gry (#14)', async () => {
    const socket = await socketOf(marek);
    const ack = await emitAck(socket, 'character:delete', { characterId: kowal });
    socket.disconnect();
    expect(ack.ok, JSON.stringify(ack)).toBe(false);
    expect(queryOne('SELECT id FROM Character WHERE id = ?', kowal)).toBeDefined();
  });

  test('6.2.3 śmieci MG: wszystkie zdarzenia z gniazda MG — bez padu i bez wiszenia', async () => {
    test.setTimeout(30 * 60_000);
    const ordered = destructiveLast(realtimeEvents().map((event) => event.name));
    log.mark();
    gmFuzz = await fuzz(mg, ordered, {
      characterId: paser,
      tokenId: paserToken,
      sceneId: sceneId('Brama'),
    });
    annotateFuzz('MG', gmFuzz, log);
    expect(await serverAlive()).toBe(true);
    expect(gmFuzz.noAck, 'zdarzenia bez odpowiedzi').toEqual([]);
    expect(gmFuzz.disconnected, 'zerwane połączenia').toEqual([]);
  });

  test('6.2.3 śmieci MG: żadnego INTERNAL (#15)', async () => {
    expect(gmFuzz.internal).toEqual([]);
  });

  test('6.2.3 po śmieciach MG klienci nie padają: F5 u wszystkich', async () => {
    const pageErrors = [mg, marek, ola].flatMap((actor) =>
      actor.consoleErrors
        .filter((text) => text.startsWith('pageerror'))
        .map((t) => `${actor.name}: ${t}`),
    );
    test
      .info()
      .annotations.push({ type: 'bledy-w-trakcie', description: pageErrors.join(' | ') || '—' });
    for (const actor of [mg, marek, ola]) {
      actor.consoleErrors.length = 0;
      await actor.page.reload();
      await expect(actor.page.getByLabel('Wiadomość czatu')).toBeEnabled();
    }
    for (const actor of [mg, marek, ola]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
    expect(pageErrors, 'wyjątki stron w trakcie śmieci MG').toEqual([]);
  });
});
