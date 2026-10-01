import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { queryOne } from '../../fixtures/db.ts';
import { FakeGateway } from '../../fixtures/fake-gateway.ts';
import { KNAJPA } from '../../fixtures/maps.ts';
import { expectReconnected } from '../../fixtures/network.ts';
import { fitCamera } from '../../fixtures/scene.ts';
import { DEAD_GATEWAY, ServerLog } from '../../fixtures/security.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { createInvitation, rollWithCup, say } from '../../fixtures/table.ts';
import { activeName, combatRow, nextTurn, token } from '../../fixtures/walka.ts';
import {
  restoreCheckpoint,
  startInstance,
  startServer,
  stopServer,
} from '../../instance/instance.ts';

/**
 * T7a, część 3 (`testy.md` 6.3, „degradacja AI — warianty”): tura bota Rzeźnika
 * w walce pierwszej (`po-T4a`), kiedy AI nie ma — gateway martwy od startu,
 * gateway żywy z martwym llama-serverem i odpowiedź po 3 minutach (ponad
 * `AI_REQUEST_TIMEOUT_MS` = 120 s). Dwa ostatnie gra atrapa gatewaya
 * (`fixtures/fake-gateway.ts`, decyzja MG z 01.10). W każdym wariancie gracze
 * grają w trakcie: wiadomość Oli dochodzi do MG, rzut Marka dochodzi do Oli,
 * a MG może ruszać figurami.
 *
 * Oczekiwane: boty „niedostępne”, reszta stołu bez zmian, żadna akcja MG nie wisi.
 * Wagi: stół stoi (czat, rzut, ruch MG) = B1; „Graj turę” wisi ponad limit
 * `AI_REQUEST_TIMEOUT_MS` albo MG nie zamknie tury bota bez F5 = B2 (decyzja MG z 26.09);
 * odmowa bez notki = B3.
 */

const FAKE_PORT = 3109;
/** Wiadomość innego gracza dochodzi po ponad 5 s = B1 (próg zalewu z 26.09). */
const TABLE_LAG_MS = 5_000;

type AiStatus = { status: { available: boolean; llama: string } };

test.describe.serial('T7a odporność: tura bota bez AI — trzy warianty @odpornosc', () => {
  let mg: Actor;
  let marek: Actor;
  let ola: Actor;
  const fake = new FakeGateway(FAKE_PORT);
  const serverLog = new ServerLog();
  /** Notka i awarie handlerów z wariantu 3 — do testu #46. */
  let slow: { note: string; failures: string[] } = { note: '', failures: [] };

  const playButton = () =>
    mg.page
      .getByRole('group', { name: 'Kolejka inicjatywy' })
      .getByRole('button', { name: /Graj turę|Bot myśli/ })
      .first();

  /**
   * „Graj turę” Rzeźnika, a w tym czasie stół: Ola pisze, Marek rzuca, MG rusza
   * Pasera z gniazda. Zwraca czas do powrotu przycisku i notkę odmowy z czatu MG.
   */
  async function botTurnWhileTablePlays(label: string, limitMs: number) {
    const notes = mg.page.locator('.chat-note', { hasText: '🤖 Rzeźnik:' });
    const notesBefore = await notes.count();
    const started = Date.now();
    await playButton().click();

    const line = `${label}: Ola pisze, kiedy bot myśli.`;
    const sent = Date.now();
    await say(ola, line);
    await expect(mg.page.locator('.chat-message', { hasText: line })).toHaveCount(1, {
      timeout: TABLE_LAG_MS,
    });
    const chatLag = Date.now() - sent;

    const rollsAtOla = await ola.page.locator('.chat-roll').count();
    await rollWithCup(marek.page, '/r 1d10');
    await expect
      .poll(() => ola.page.locator('.chat-roll').count(), { timeout: 30_000 })
      .toBeGreaterThan(rollsAtOla);

    const paser = token('Paser');
    const moveStarted = Date.now();
    const moved = await emitAck(await mg.socket(), 'token:move', {
      tokenId: paser.id,
      x: paser.x,
      y: paser.y - KNAJPA.height / 24,
      final: true,
    });
    const moveLag = Date.now() - moveStarted;
    expect(moved, JSON.stringify(moved)).toMatchObject({ ok: true });
    expect(moveLag, 'ruch MG w czasie tury bota').toBeLessThan(TABLE_LAG_MS);

    await expect(playButton()).toHaveText('🤖 Graj turę', { timeout: limitMs });
    const elapsed = Date.now() - started;
    await expect.poll(() => notes.count(), { timeout: 10_000 }).toBeGreaterThan(notesBefore);
    const note = (await notes.last().innerText()).replace(/\s+/g, ' ');
    test
      .info()
      .annotations.push(
        { type: `${label}: czas „Graj turę”`, description: `${Math.round(elapsed / 1000)} s` },
        { type: `${label}: notka`, description: note },
        { type: `${label}: czat Oli → MG`, description: `${chatLag} ms` },
        { type: `${label}: ruch MG`, description: `${moveLag} ms` },
      );
    // Tura dalej Rzeźnika, a MG ją zamyka bez F5.
    expect(activeName()).toBe('Rzeźnik');
    return { elapsed, note };
  }

  async function aiStatusAtGm() {
    return (await mg.store<AiStatus>('ai'))?.status;
  }

  test.beforeAll(async () => {
    test.setTimeout(3 * 60_000);
    await restoreCheckpoint('po-T4a');
    await startInstance(DEAD_GATEWAY);
    await fake.start();
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
    await fake.stop();
  });

  test('start z po-T4a przy martwym gatewayu: tura Rzeźnika, przycisk bota u MG', async ({
    cast,
  }) => {
    test.setTimeout(4 * 60_000);
    mg = await cast.mg('chromium');
    const campaignId = queryOne<{ id: string }>(
      `SELECT id FROM Campaign WHERE name = 'Nocna zmiana'`,
    )!.id;
    marek = await cast.gracz('Marek', 'chromium', await createInvitation(mg, campaignId));
    ola = await cast.gracz('Ola', 'firefox', await createInvitation(mg, campaignId));
    for (const actor of [mg, marek, ola]) {
      await expect
        .poll(
          async () => (await actor.store<{ scene: { name: string } | null }>('scene'))?.scene?.name,
        )
        .toBe('Knajpa');
      await fitCamera(actor.page, KNAJPA.width, KNAJPA.height).catch(() => undefined);
      await actor.page.getByRole('button', { name: /^Czat/ }).first().click();
    }
    // Cień → … → runda 2: Kowal, Iskra, Rzeźnik (bot „Rzeźnik” prowadzi jego kartę).
    for (let i = 0; i < 8 && activeName() !== 'Rzeźnik'; i += 1) await nextTurn(mg);
    expect(activeName()).toBe('Rzeźnik');
    expect(combatRow()?.round).toBe(2);
    await expect(playButton()).toHaveText('🤖 Graj turę');
    await expect.poll(async () => (await aiStatusAtGm())?.available).toBe(false);
  });

  test('wariant 1: gateway martwy od startu — odmowa z notką, stół gra dalej', async () => {
    test.setTimeout(2 * 60_000);
    const { elapsed } = await botTurnWhileTablePlays('gateway martwy', 30_000);
    expect(elapsed).toBeLessThan(15_000);
  });

  test('wariant 2: gateway żyje, llama-server nie — boty niedostępne, odmowa z notką', async () => {
    test.setTimeout(3 * 60_000);
    fake.mode = 'llama-down';
    await stopServer();
    await startServer({ AI_GATEWAY_URL: fake.url });
    for (const actor of [mg, marek, ola]) await expectReconnected(actor, 45_000);
    await expect
      .poll(async () => (await aiStatusAtGm())?.llama, { timeout: 30_000 })
      .toBe('stopped');
    expect((await aiStatusAtGm())?.available).toBe(false);
    const asked = fake.chats.length;
    const { elapsed } = await botTurnWhileTablePlays('llama-server martwy', 30_000);
    expect(elapsed).toBeLessThan(15_000);
    test.info().annotations.push({
      type: 'llama-server martwy: zapytania /chat do atrapy',
      description: String(fake.chats.length - asked),
    });
  });

  test('wariant 3: odpowiedź po 3 min — „Graj turę” wraca najpóźniej po limicie 120 s', async () => {
    test.setTimeout(6 * 60_000);
    fake.mode = 'slow';
    // Serwer pyta gateway o zdrowie cyklicznie — przełączenie atrapy widać po chwili.
    await expect
      .poll(async () => (await aiStatusAtGm())?.available, { timeout: 60_000 })
      .toBe(true);
    const asked = fake.chats.length;
    serverLog.mark();
    const { elapsed, note } = await botTurnWhileTablePlays('odpowiedź po 3 min', 4 * 60_000);
    slow = { note, failures: serverLog.handlerFailures() };
    test.info().annotations.push({
      type: 'odpowiedź po 3 min: zapytania /chat do atrapy',
      description: String(fake.chats.length - asked),
    });
    expect(fake.chats.length - asked, 'serwer zapytał model').toBeGreaterThan(0);
    // `AI_REQUEST_TIMEOUT_MS` = 120 s + zapas na kroki bota i notkę.
    expect(elapsed, 'tura bota nie wisi ponad limit zapytania do AI').toBeLessThan(150_000);
  });

  test('#46 limit 120 s: notka mówi o czasie odpowiedzi, a serwer nie loguje awarii handlera', async () => {
    // Znalezione w T7a (01.10): `TimeoutError` z `AbortSignal.timeout` wylatywał
    // z `bot:play-turn` jako `INTERNAL`, a MG czytał „coś poszło nie tak po stronie
    // serwera”, choć to model nie zdążył. Od poprawki — `AI_TIMEOUT` i zdanie o limicie.
    test.info().annotations.push({
      type: 'awarie handlerów w wariancie 3',
      description: slow.failures.join(' | ') || '(brak)',
    });
    expect(slow.failures).toEqual([]);
    expect(slow.note).not.toMatch(/po stronie serwera/);
    expect(slow.note).toContain('Model nie odpowiedział w 120 s');
  });

  test('po wariantach: MG zamyka turę Rzeźnika zwykłym „Następna tura”', async () => {
    await nextTurn(mg);
    expect(activeName()).not.toBe('Rzeźnik');
    for (const actor of [mg, marek, ola]) {
      const errors = actor
        .unexpectedErrors()
        .filter((text) => !/ERR_CONNECTION_REFUSED|2152398861|socket\.io/.test(text));
      expect(errors, actor.name).toEqual([]);
    }
  });
});
