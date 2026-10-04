import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Socket } from 'socket.io-client';
import { expect, test, type Actor, type Cast, type Engine } from '../../fixtures/actors.ts';
import { query, queryOne } from '../../fixtures/db.ts';
import { FakeGateway } from '../../fixtures/fake-gateway.ts';
import { campaignSecrets } from '../../fixtures/izolacja.ts';
import { expectReconnected } from '../../fixtures/network.ts';
import { Canaries } from '../../fixtures/sniffer.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { createInvitation, rollWithCup, say } from '../../fixtures/table.ts';
import {
  hasCheckpoint,
  restoreCheckpoint,
  scriptDice,
  startInstance,
  startServer,
  stopServer,
} from '../../instance/instance.ts';
import { E2E_DIR, GM_LOGIN } from '../../instance/paths.ts';

/**
 * T9b (`testy.md` 6.5, punkty 4, 8 i 10): dwie grupy grają naraz, AI właściciela
 * i limit sesji — odbiór etapów 44c i 44d. Start z `po-T9a`:
 *
 * - **MG-A** = właściciel (Chromium) z Markiem (Chromium) i Olą (Firefox) na
 *   „Knajpie” — sesja A trwa od punktu kontrolnego;
 * - **MG-B** = Bartek (Firefox) z Kubą (Chromium); kampania B w przygotowaniu;
 * - **Właściciel jako gracz** (Firefox) — nowe konto z imiennego linku u MG-B,
 *   flaga właściciela hasłem konta MG w „Ustawienia → Konto”;
 * - **MG-C** (Firefox) z rejestracji, tylko do limitu sesji.
 *
 * AI to **atrapa gatewaya** w trybie „odpowiada” — jej dziennik żądań jest
 * „logiem gatewaya”, z którego liczymy, czy żądanie kampanii bez prawa w ogóle
 * dotarło. Progi czasowe skrócone przez env: karencja właściciela 20 s,
 * a w ostatnim kroku pusty slot 1 min i bezczynność 3 min (decyzje MG z 04.10,
 * sesja T9b). Dokładne progi pilnują testy serwera na sztucznym zegarze.
 *
 * Wagi (decyzja MG z 04.10, sesja T9b): **B1** — przeciek ruchu, rzutu, czatu
 * albo kanarka między grupami; żądanie AI bez prawa, które dociera do gatewaya;
 * prośba o AI widoczna poza kontami właściciela; gracz po końcu sesji wykonuje
 * zdarzenie stołu; trzecia sesja ponad limit; slot, który nie zwalnia się sam.
 * **B2** — AI nie przechodzi albo nie gaśnie, a ręka właściciela to naprawia.
 * **B3** — mylący powód w panelu botów.
 */

const CAMPAIGN_A = 'Nocna zmiana';
const CAMPAIGN_B = 'Kampania B';
const CAMPAIGN_C = 'Kampania C';
const BARTEK_LOGIN = 'bartek-mg';
const BARTEK_PASSWORD = 'haslo-bartka-01';
const MG_C_LOGIN = 'mg-c-t9b';
const MG_C_PASSWORD = 'haslo-mg-c-t9b';
const BOT_A = 'Paser';
const BOT_B = 'Wykidajło';
const STATIST_B = 'Ochroniarz Rezydencji';
const OWNER_PLAYER = 'Właściciel';
const FAKE_PORT = 3109;
const GRACE_SECONDS = 20;
const EMPTY_MINUTES = 1;
const IDLE_MINUTES = 3;
/** Wiadomość dochodzi do swojej grupy po ponad 5 s = B1 (próg zalewu z 26.09). */
const TABLE_LAG_MS = 5_000;
/** Karta rzutu u obserwatora: animacja kości i 3,2 s leżenia (pomiar T9b: ~7 s, fumble ~11 s). */
const ROLL_CARD_MS = 30_000;
/** Kod w odpowiedzi atrapy — kanarek odpowiedzi bota B w podsłuchu grupy A. */
const REPLY_CODE = 'Rezydencja-7731';
/**
 * Kanarki prośby o AI: ramka gniazda panelu właściciela i pole jego stanu w JSON-ie.
 * Same nazwy (`ai-access:owner`, `/api/owner/ai`) siedzą w paczce JS klienta, którą
 * podsłuch też widzi — dlatego kształt ramki, a nie nazwa.
 */
const OWNER_ONLY = ['["ai-access:owner"', '"canTakeOver":'];

type AiStore = { status: { available: boolean; reason?: string | null } };
type AuthStore = {
  status: string;
  user: { id: string; owner: boolean } | null;
  activeCampaign: { id: string; name: string; sessionStartedAt?: string | null } | null;
};

/** Odmowy tras (400–429) — wywołane celowo. */
const REFUSALS = /status of (400|401|403|404|409|410|429)/;
/** Gniazdo zerwane przez restart serwera (Firefox i Chromium; pośrednik `vite preview` oddaje wtedy 500–503 na long-polling). */
function socketDropped(text: string): boolean {
  return (
    /\/socket\.io\//.test(text) &&
    /can’t establish a connection|was interrupted|ERR_CONNECTION_REFUSED|WebSocket is closed|status of 50[0-3]/.test(
      text,
    )
  );
}

async function authOf(actor: Actor): Promise<AuthStore> {
  return actor.store<AuthStore>('auth');
}

async function sceneOf(actor: Actor): Promise<string | null> {
  return (await actor.store<{ scene: { name: string } | null }>('scene'))?.scene?.name ?? null;
}

/** Powód z magazynu `ai` klienta MG: `available` albo kod bramy. */
async function aiReason(actor: Actor): Promise<string> {
  const status = (await actor.store<AiStore>('ai'))?.status;
  if (!status) return 'brak';
  return status.available ? 'available' : (status.reason ?? 'offline');
}

/** Konto MG przez formularz logowania (jak `cast.mg`, ale innym loginem). */
async function loginGm(
  cast: Cast,
  name: string,
  engine: Engine,
  login: string,
  password: string,
): Promise<Actor> {
  const actor = await cast.open(name, engine);
  await actor.page.goto('/');
  await actor.page.locator('#gm-login').fill(login);
  await actor.page.locator('#gm-password').fill(password);
  await actor.page.getByRole('button', { name: 'Zaloguj się' }).click();
  await expect.poll(async () => (await authOf(actor))?.status).toBe('authenticated');
  return actor;
}

function sessionStarted(campaignId: string): boolean {
  return (
    queryOne<{ sessionStartedAt: string | null }>(
      'SELECT sessionStartedAt FROM Campaign WHERE id = ?',
      campaignId,
    )?.sessionStartedAt != null
  );
}

/** Zrzuty do oględzin T9b (poza repo) — widoki, których automat nie oceni okiem. */
const SHOTS_DIR = join(E2E_DIR, 'pomiary', 't9b');
async function shot(actor: Actor, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await actor.page.screenshot({
    path: join(SHOTS_DIR, `${name}-${actor.name}-${actor.engine}.png`),
  });
}

async function sideTab(actor: Actor, name: string): Promise<void> {
  await actor.page.locator('.side-tab', { hasText: name }).first().click();
}

test.describe.serial('T9b dwie grupy naraz, AI właściciela, limit sesji', () => {
  const fake = new FakeGateway(FAKE_PORT);
  let mg: Actor;
  let marek: Actor;
  let ola: Actor;
  let bartek: Actor;
  let kuba: Actor;
  let owner: Actor;
  let mgC: Actor;
  let campaignA: string;
  let campaignB: string;
  let campaignC: string;
  let botB: string;
  let botA: string;
  let bSocket: Socket;
  /** Tajne grupy A (z `po-T9a` i dopisane w trakcie) — przed grupą B. */
  let aIds: string[] = [];
  let aCanaries: string[] = [];
  let ownerMgId = '';
  /** Tajne grupy B — przed grupą A. */
  let bIds: string[] = [];
  let bCanaries: string[] = [];
  const fromA = new Canaries();
  const fromB = new Canaries();
  /** Znaczniki podsłuchu na starcie (aktorzy z pierwszego kroku). */
  const startMarks = new Map<Actor, number>();

  const aActors = () => [mg, marek, ola].filter((actor) => !actor.page.isClosed());
  const bPlayers = () => [bartek, kuba];
  /** Tajne A dla grupy B; właściciel jako gracz legalnie widzi swoją kampanię w panelu AI. */
  const aSecrets = (forOwner = false) => [
    ...aCanaries,
    ...fromA.secretNow,
    ...aIds.filter((id) => !(forOwner && id === campaignA)),
    ...(forOwner ? [] : [ownerMgId, CAMPAIGN_A]),
  ];
  const bSecrets = () => [...bCanaries, ...fromB.secretNow, ...bIds, REPLY_CODE];
  /** Żądania atrapy, które niosą coś z kampanii B. */
  const bRequests = (since: number) =>
    fake.requests
      .slice(since)
      .filter((request) =>
        [campaignB, BOT_B, STATIST_B, CAMPAIGN_B, ...fromB.secretNow].some(
          (marker) => request.body.includes(marker) || request.url.includes(marker),
        ),
      );

  /** `bot:chat` z gniazda MG-B; przy zgodzie czeka na `bot:reply` albo `bot:error`. */
  async function botChatB(message: string) {
    const ack = await emitAck<{ requestId: string }>(bSocket, 'bot:chat', {
      botId: botB,
      message,
    });
    if (!ack.ok) return { ack, outcome: null };
    const requestId = ack.data!.requestId;
    const outcome = await new Promise<{ event: string; text?: string; code?: string }>(
      (resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('bot:chat — brak odpowiedzi')), 30_000);
        const done =
          (event: string) => (payload: { requestId: string; text?: string; code?: string }) => {
            if (payload.requestId !== requestId) return;
            clearTimeout(timer);
            bSocket.off('bot:reply');
            bSocket.off('bot:error');
            resolve({ event, text: payload.text, code: payload.code });
          };
        bSocket.on('bot:reply', done('bot:reply'));
        bSocket.on('bot:error', done('bot:error'));
      },
    );
    return { ack, outcome };
  }

  /** Odmowa AI kampanii B: `AI_UNAVAILABLE` od razu i ani jednego żądania B w atrapie. */
  async function expectBRefused(label: string) {
    const since = fake.requests.length;
    const { ack } = await botChatB(`${label}: wpuścisz mnie?`);
    expect(ack, label).toEqual({ ok: false, error: 'AI_UNAVAILABLE' });
    // Brama mogłaby wysłać coś w tle (RAG, liczenie tokenów) — chwila na dotarcie.
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    expect(bRequests(since), `${label}: żądania B w atrapie`).toEqual([]);
  }

  async function ownerWindow(actor: Actor) {
    const window = actor.page.locator('.owner-ai-window');
    if (!(await window.isVisible())) await actor.page.locator('.owner-ai-button').click();
    await expect(window).toBeVisible();
    return window;
  }

  test.beforeAll(async () => {
    test.skip(!hasCheckpoint('po-T9a'), 'brak punktu po-T9a — najpierw T9a');
    test.setTimeout(3 * 60_000);
    fake.mode = 'reply';
    fake.replyText = `Spadaj stąd, chłopcze. Kod bramy to ${REPLY_CODE}, ale nie dla ciebie.`;
    await fake.start();
    await restoreCheckpoint('po-T9a');
    await startInstance({
      AI_GATEWAY_URL: fake.url,
      VTT_AI_OWNER_GRACE_SECONDS: String(GRACE_SECONDS),
    });
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
    await fake.stop();
  });

  test('start z po-T9a: grupa A gra na „Knajpie”, MG-B i Kuba w przygotowaniu kampanii B', async ({
    cast,
  }) => {
    const idOf = (name: string) =>
      queryOne<{ id: string }>('SELECT id FROM Campaign WHERE name = ?', name)!.id;
    campaignA = idOf(CAMPAIGN_A);
    campaignB = idOf(CAMPAIGN_B);
    botA = queryOne<{ id: string }>('SELECT id FROM BotProfile WHERE name = ?', BOT_A)!.id;
    botB = queryOne<{ id: string }>('SELECT id FROM BotProfile WHERE name = ?', BOT_B)!.id;
    ownerMgId = queryOne<{ id: string }>("SELECT id FROM User WHERE role = 'GM' AND owner = 1")!.id;
    expect(sessionStarted(campaignA), 'sesja A trwa od po-T9a').toBe(true);
    expect(sessionStarted(campaignB), 'B w przygotowaniu').toBe(false);

    const a = campaignSecrets(campaignA);
    aIds = [
      ...a.ids,
      ...query<{ token: string }>(
        'SELECT token FROM Invitation WHERE campaignId = ?',
        campaignA,
      ).map((row) => row.token),
      ...query<{ slug: string }>(
        'SELECT slug FROM CompendiumEntry WHERE campaignId = ?',
        campaignA,
      ).map((row) => row.slug),
    ];
    aCanaries = a.canaries;
    const b = campaignSecrets(campaignB);
    bIds = b.ids;
    bCanaries = b.canaries;
    expect(aCanaries.length, 'kanarki z rozgrywki A').toBeGreaterThan(10);
    // Żaden kanarek nie jest naraz w A i w B — inaczej wyrocznia nic nie znaczy.
    expect(aCanaries.filter((code) => bCanaries.includes(code))).toEqual([]);

    mg = await cast.mg('chromium');
    marek = await cast.gracz('Marek', 'chromium', await createInvitation(mg, campaignA, 'Marek'));
    ola = await cast.gracz('Ola', 'firefox', await createInvitation(mg, campaignA, 'Ola'));
    bartek = await loginGm(cast, 'Bartek', 'firefox', BARTEK_LOGIN, BARTEK_PASSWORD);
    kuba = await cast.gracz('Kuba', 'chromium', await createInvitation(bartek, campaignB, 'Kuba'));
    for (const actor of aActors()) {
      await expect.poll(() => sceneOf(actor), { message: actor.name }).toBe('Knajpa');
    }
    await expect(bartek.page.locator('.session-state--prep')).toHaveText('przygotowanie');
    await expect(kuba.page.locator('.between-sessions')).toBeVisible();
    bSocket = await bartek.socket();
    for (const actor of [mg, marek, ola, bartek, kuba])
      startMarks.set(actor, await actor.sniffer.mark());
    test.info().annotations.push({
      type: 'tajne',
      description: JSON.stringify({
        A: aIds.length + aCanaries.length,
        B: bIds.length + bCanaries.length,
      }),
    });
  });

  test('4. MG-B przygotowuje i rozpoczyna sesję, gdy A gra — Marek i Ola zostają na „Knajpie”', async () => {
    const aMarks = await Promise.all(aActors().map((actor) => actor.sniffer.mark()));
    // Przygotowanie: czat tylko dla MG-B (44c), Kuba go nie widzi.
    const prep = fromB.secret('przygotowanie-B');
    await say(bartek, `Ochroniarz pilnuje bramy. ${prep}`);
    await expect(bartek.page.locator('.chat-message', { hasText: prep })).toBeVisible();

    await bartek.page.getByRole('button', { name: 'Rozpocznij sesję' }).click();
    await expect(bartek.page.locator('.session-state--live')).toContainText('sesja');
    await expect(kuba.page.locator('.between-sessions')).toHaveCount(0);
    await expect.poll(() => sceneOf(kuba)).toBe('Rezydencja');
    await expect(kuba.page.getByLabel('Wiadomość czatu')).toBeEnabled();
    expect(sessionStarted(campaignA) && sessionStarted(campaignB), 'dwie sesje naraz').toBe(true);
    expect(await kuba.sniffer.found([prep])).toEqual([]);

    // Grupa A bez ruchu: ta sama kampania i scena, ani jednego `session:changed`.
    for (const [index, actor] of aActors().entries()) {
      expect((await authOf(actor)).activeCampaign?.name, actor.name).toBe(CAMPAIGN_A);
      expect(await sceneOf(actor), actor.name).toBe('Knajpa');
      expect(await actor.sniffer.found(['session:changed'], aMarks[index]), actor.name).toEqual([]);
    }
    await expect(marek.page.getByLabel('Wiadomość czatu')).toBeEnabled();
  });

  test('4. obie grupy grają naraz: ruch, rzut, czat i szept jednej nie docierają do drugiej', async () => {
    const marks = new Map<Actor, number>();
    for (const actor of [...aActors(), ...bPlayers()]) marks.set(actor, await actor.sniffer.mark());
    const rolls = async (actor: Actor) => actor.page.locator('.chat-roll').count();
    const rollsBefore = new Map<Actor, number>();
    for (const actor of [...aActors(), ...bPlayers()]) rollsBefore.set(actor, await rolls(actor));

    // Ruch: Marek przesuwa Kowala, MG-B — Ochroniarza; każdy ruch widzi tylko swoja grupa.
    const kowal = queryOne<{ id: string; x: number; y: number }>(
      `SELECT t.id, t.x, t.y FROM Token t JOIN Scene s ON s.id = t.sceneId
        WHERE s.campaignId = ? AND s.name = 'Knajpa' AND t.name = 'Kowal'`,
      campaignA,
    )!;
    const guard = queryOne<{ id: string; x: number; y: number }>(
      `SELECT t.id, t.x, t.y FROM Token t JOIN Scene s ON s.id = t.sceneId
        WHERE s.campaignId = ? AND t.name = ?`,
      campaignB,
      STATIST_B,
    )!;
    bIds.push(guard.id);
    const grid = 44.54545454545455;
    const marekSocket = await marek.socket();
    const movedA = await emitAck(marekSocket, 'token:move', {
      tokenId: kowal.id,
      x: kowal.x + grid,
      y: kowal.y,
      final: true,
    });
    expect(movedA, JSON.stringify(movedA)).toMatchObject({ ok: true });
    const movedB = await emitAck(bSocket, 'token:move', {
      tokenId: guard.id,
      x: guard.x + grid,
      y: guard.y,
      final: true,
    });
    expect(movedB, JSON.stringify(movedB)).toMatchObject({ ok: true });

    // Czat i szept: obie grupy mają „Marka” — szept MG-B idzie do Marka B, nie do Marka A.
    const lineA = fromA.secret('czat-A');
    const lineB = fromB.secret('czat-B');
    const whisperA = fromA.secret('szept-A');
    const whisperB = fromB.secret('szept-B');
    await say(ola, `Ola przy barze. ${lineA}`);
    await say(kuba, `Kuba pod bramą. ${lineB}`);
    await say(mg, `/w Ola Ktoś cię obserwuje. ${whisperA}`);
    await say(bartek, `/w Marek Masz wejście od kuchni. ${whisperB}`);
    for (const actor of [mg, marek]) {
      await expect(actor.page.locator('.chat-message', { hasText: lineA })).toBeVisible({
        timeout: TABLE_LAG_MS,
      });
    }
    await expect(ola.page.locator('.chat-message', { hasText: whisperA })).toBeVisible({
      timeout: TABLE_LAG_MS,
    });
    await expect(bartek.page.locator('.chat-message', { hasText: lineB })).toBeVisible({
      timeout: TABLE_LAG_MS,
    });
    const whisper = queryOne<{ campaignId: string; recipientId: string | null }>(
      'SELECT campaignId, recipientId FROM ChatMessage WHERE text LIKE ?',
      `%${whisperB}%`,
    );
    const memberOf = (campaignId: string) =>
      queryOne<{ userId: string }>(
        `SELECT m.userId FROM CampaignMember m JOIN User u ON u.id = m.userId
          WHERE m.campaignId = ? AND u.name = 'Marek'`,
        campaignId,
      )!.userId;
    expect(whisper, 'szept do Marka B').toEqual({
      campaignId: campaignB,
      recipientId: memberOf(campaignB),
    });
    expect(memberOf(campaignB)).not.toBe(memberOf(campaignA));

    // Rzut kubkiem w obu grupach naraz. Ścianki wymuszone: karta rzutu dochodzi do
    // obserwatora po animacji i 3,2 s leżenia kości — zwykły rzut ~7 s, fumble ~11 s.
    scriptDice([5, 6]);
    await Promise.all([rollWithCup(marek.page, '/r 1d10'), rollWithCup(kuba.page, '/r 1d10')]);
    for (const actor of [...aActors(), ...bPlayers()]) {
      await expect
        .poll(() => rolls(actor), {
          message: `${actor.name}: jeden nowy rzut swojej grupy`,
          timeout: ROLL_CARD_MS,
        })
        .toBe(rollsBefore.get(actor)! + 1);
    }
    // Ruch dotarł do swojej grupy.
    const tokenX = async (actor: Actor, id: string) =>
      actor.page.evaluate(
        (tokenId) =>
          (
            window.__vttE2E?.stores.token?.getState() as
              { tokens: Record<string, { x: number }> } | undefined
          )?.tokens?.[tokenId]?.x ?? null,
        id,
      );
    await expect.poll(() => tokenX(mg, kowal.id)).toBeCloseTo(kowal.x + grid, 0);
    // Kuba nie widzi Ochroniarza: „Rezydencja” stoi pod ręczną mgłą, nic nie odsłonięte.
    await expect.poll(() => tokenX(bartek, guard.id)).toBeCloseTo(guard.x + grid, 0);
    // Chwila na spóźnione ramki, zanim podsłuch powie „nic”.
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    for (const actor of [...aActors(), ...bPlayers()]) {
      expect(await rolls(actor), `${actor.name}: bez rzutu drugiej grupy`).toBe(
        rollsBefore.get(actor)! + 1,
      );
    }
    for (const actor of aActors()) {
      expect(
        await actor.sniffer.found(bSecrets(), marks.get(actor)),
        `${actor.name}: tajne B`,
      ).toEqual([]);
    }
    for (const actor of bPlayers()) {
      expect(
        await actor.sniffer.found(aSecrets(), marks.get(actor)),
        `${actor.name}: tajne A`,
      ).toEqual([]);
    }
  });

  test('8. bez zgody: boty MG-B niedostępne z powodem, stół B gra, do gatewaya nie trafia nic z B', async () => {
    expect(await aiReason(mg), 'kampania właściciela ma AI').toBe('available');
    await expect.poll(() => aiReason(bartek)).toBe('no-consent');
    await sideTab(bartek, 'Boty');
    const panel = bartek.page.locator('.bot-panel');
    await expect(panel.locator('.badge').first()).toHaveText('AI niedostępne');
    await expect(panel).toContainText('Brak zgody właściciela na AI');
    await shot(bartek, '01-boty-bez-zgody');
    // Wykidajło „w sesji” — wołany po imieniu na czacie.
    const active = panel.locator('.bot-row', { hasText: BOT_B }).getByRole('checkbox');
    await active.click();
    await expect(active).toBeChecked();
    await sideTab(bartek, 'Czat');

    await expectBRefused('bez zgody (bot:chat)');
    const since = fake.requests.length;
    const call = fromB.secret('wolanie-B');
    await say(kuba, `${BOT_B}, wpuścisz mnie? ${call}`);
    await expect(
      kuba.page.locator('.chat-note', { hasText: `${BOT_B} nie odpowiada` }),
    ).toBeVisible();
    await shot(kuba, '02-wolanie-bota-bez-zgody');
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    expect(bRequests(since), 'wołanie bota przez Kubę').toEqual([]);
    expect(
      queryOne('SELECT id FROM ChatMessage WHERE botId = ?', botB),
      'bot B nic nie powiedział',
    ).toBeUndefined();

    // Kontrast: kampania właściciela pyta atrapę normalnie (AI trzyma sesja A).
    // Surowe gniazdo MG-A to też obecność właściciela — rozłączone dopiero po odpowiedzi,
    // bo odpowiedź bota idzie tylko do gniazda, które pytało.
    const mgA = await mg.socket();
    const replied = new Promise<string>((resolve) =>
      mgA.on('bot:reply', (payload: { text: string }) => resolve(payload.text)),
    );
    const askA = await emitAck(mgA, 'bot:chat', { botId: botA, message: 'Co masz pod ladą?' });
    expect(askA.ok, JSON.stringify(askA)).toBe(true);
    expect(await replied).toContain(REPLY_CODE);
    mgA.disconnect();
    expect(
      fake.requests.slice(since).filter((r) => r.url === '/chat' && r.body.includes(BOT_A)).length,
      'żądanie kampanii A dotarło',
    ).toBeGreaterThan(0);
    test.info().annotations.push({
      type: 'notka Kuby',
      description: await kuba.page.locator('.chat-note', { hasText: BOT_B }).last().innerText(),
    });
  });

  test('8. prośba przy nieobecnym właścicielu; widzi ją dopiero konto gracza właściciela', async ({
    cast,
  }) => {
    // Właściciel wylogowuje się — sesja A gra dalej z Markiem i Olą.
    expect((await mg.page.request.post('/api/auth/logout')).status()).toBe(200);
    cast.actors.splice(cast.actors.indexOf(mg), 1);
    const mgErrors = mg.unexpectedErrors();
    await mg.close();
    expect(mgErrors, 'MG-A przed wylogowaniem').toEqual([]);

    // MG-B prosi z Panelu MG w drugiej karcie — stół w pierwszej zostaje.
    const panelPage = await bartek.context.newPage();
    await panelPage.goto('/gm');
    const card = panelPage.locator('.panel-card', { hasText: 'AI właściciela serwera' });
    await card.getByRole('button', { name: 'Poproś o dostęp do AI właściciela' }).click();
    await expect(card).toContainText('Prośba wysłana — czeka na decyzję właściciela.');
    await panelPage.close();
    expect(queryOne('SELECT aiAccess FROM User WHERE login = ?', BARTEK_LOGIN)).toEqual({
      aiAccess: 'requested',
    });
    await expectBRefused('prośba czeka');

    // Właściciel wchodzi kontem gracza: imienny link u MG-B, potem flaga hasłem konta MG.
    owner = await cast.gracz(
      OWNER_PLAYER,
      'firefox',
      await createInvitation(bartek, campaignB, OWNER_PLAYER),
    );
    startMarks.set(owner, 0);
    await expect.poll(() => sceneOf(owner)).toBe('Rezydencja');
    await expect(owner.page.locator('.owner-ai-button')).toHaveCount(0);
    await owner.page.getByRole('button', { name: /^Ustawienia/ }).click();
    const account = owner.page.locator('.settings-group--account');
    await account.getByRole('button', { name: 'To konto właściciela serwera' }).click();
    await account.getByLabel('Login właściciela').fill(GM_LOGIN);
    await account.getByLabel('Hasło', { exact: true }).fill(process.env.E2E_GM_PASSWORD!);
    await account.getByRole('button', { name: 'Połącz' }).click();
    await expect(account).toContainText('To konto należy do właściciela serwera.');
    await owner.page.getByRole('button', { name: 'Zamknij ustawienia' }).click();
    await expect(owner.page.locator('.owner-ai-count')).toHaveText('1');
    await shot(owner, '03-znaczek-ai');
    const window = await ownerWindow(owner);
    await expect(window.locator('.owner-account', { hasText: BARTEK_LOGIN })).toContainText(
      'czeka',
    );
    await shot(owner, '04-okno-prosba');

    // Prośby nie dostał nikt poza kontem właściciela — a ono dostało (kontrola wyroczni).
    expect((await owner.sniffer.found(OWNER_ONLY)).sort()).toEqual([...OWNER_ONLY].sort());
    for (const actor of [marek, ola, kuba, bartek]) {
      expect(await actor.sniffer.found(OWNER_ONLY), actor.name).toEqual([]);
    }
  });

  test('8. zgoda: bez „Udostępniam AI” boty B dalej gasną, po włączeniu „AI zajęte przez inną sesję”, stół B gra', async () => {
    const window = await ownerWindow(owner);
    const row = window.locator('.owner-account', { hasText: BARTEK_LOGIN });
    await row.getByRole('button', { name: 'Zatwierdź' }).click();
    await expect(row).toContainText('zgoda');
    await expect.poll(() => aiReason(bartek)).toBe('sharing-off');
    await expectBRefused('zgoda bez przełącznika');

    await window.getByLabel('Udostępniam AI').check();
    await expect(window.locator('.owner-ai-lease')).toContainText(
      `AI trzyma sesja „${CAMPAIGN_A}” (Twoja).`,
    );
    await expect.poll(() => aiReason(bartek)).toBe('busy');
    await sideTab(bartek, 'Boty');
    const panel = bartek.page.locator('.bot-panel');
    await expect(panel.locator('.badge').first()).toHaveText('AI zajęte');
    await expect(panel).toContainText('AI zajęte przez inną sesję.');
    await shot(bartek, '05-ai-zajete');
    await sideTab(bartek, 'Czat');
    await expectBRefused('AI trzyma sesja A');

    // Stół B gra dalej bez botów.
    const line = fromB.secret('stol-B-bez-AI');
    await say(kuba, line);
    await expect(bartek.page.locator('.chat-message', { hasText: line })).toBeVisible({
      timeout: TABLE_LAG_MS,
    });
    // „Zajęte” nie mówi MG-B, czyja sesja trzyma AI.
    expect(await bartek.sniffer.found([CAMPAIGN_A, campaignA])).toEqual([]);
  });

  test('4 + 8. MG-A kończy sesję: Marek i Ola bez stołu (także z konsoli), AI przechodzi do sesji MG-B', async ({
    cast,
  }) => {
    mg = await cast.mg('chromium');
    startMarks.set(mg, 0);
    await mg.page.getByRole('button', { name: 'Zakończ sesję' }).click();
    await mg.page.getByRole('button', { name: 'Na pewno? Zakończ' }).click();
    await expect(mg.page.locator('.session-state--prep')).toHaveText('przygotowanie');
    expect(sessionStarted(campaignA)).toBe(false);

    for (const [actor, sheet] of [
      [marek, 'Kowal'],
      [ola, 'Iskra'],
    ] as const) {
      const page = actor.page;
      await expect(page.locator('.between-sessions'), actor.name).toBeVisible();
      await expect(page.locator('.map-area')).toHaveCount(0);
      await expect(page.getByLabel('Wiadomość czatu')).toBeDisabled();
      await sideTab(actor, 'Postacie');
      await expect(page.getByText(sheet).first(), `${actor.name} widzi swoją kartę`).toBeVisible();
      await shot(actor, '06-miedzy-sesjami');
      await sideTab(actor, 'Czat');
      const raw = await actor.socket();
      const token = queryOne<{ id: string }>(
        `SELECT t.id FROM Token t JOIN Scene s ON s.id = t.sceneId
          WHERE s.campaignId = ? AND t.name = ?`,
        campaignA,
        sheet,
      )!.id;
      for (const [event, payload] of [
        ['chat:send', { text: 'z konsoli po końcu sesji' }],
        ['chat:send', { text: '/r 1d10' }],
        ['token:move', { tokenId: token, x: 500, y: 500, final: true }],
        ['map:ping', { x: 1, y: 1 }],
        ['character:roll', {}],
      ] as const) {
        expect(await emitAck(raw, event, payload), `${actor.name} ${event}`).toEqual({
          ok: false,
          error: 'SESSION_NOT_RUNNING',
        });
      }
      raw.disconnect();
    }
    expect(query(`SELECT id FROM ChatMessage WHERE text = 'z konsoli po końcu sesji'`)).toEqual([]);

    // AI przechodzi do trwającej, uprawnionej sesji MG-B.
    await expect.poll(() => aiReason(bartek)).toBe('available');
    await expect((await ownerWindow(owner)).locator('.owner-ai-lease')).toContainText(
      `AI trzyma sesja „${CAMPAIGN_B}” MG „${BARTEK_LOGIN}”.`,
    );
    const since = fake.requests.length;
    const { ack, outcome } = await botChatB('Wpuścisz mnie?');
    expect(ack.ok, JSON.stringify(ack)).toBe(true);
    expect(outcome?.event, JSON.stringify(outcome)).toBe('bot:reply');
    expect(outcome?.text).toContain(REPLY_CODE);
    expect(bRequests(since).length, 'żądanie B dotarło').toBeGreaterThan(0);

    // Kuba woła Wykidajłę na czacie sesji — bot odpowiada stołowi B.
    await say(kuba, `${BOT_B}, otwórz bramę!`);
    await expect(kuba.page.locator('.chat-message', { hasText: REPLY_CODE })).toBeVisible({
      timeout: 30_000,
    });
    await expect(bartek.page.locator('.chat-message', { hasText: REPLY_CODE })).toBeVisible();
    await shot(kuba, '07-odpowiedz-bota');
  });

  test('8. cofnięcie w trakcie odpowiedzi gasi boty B od razu; odrzucona prośba też nic nie przepuszcza', async () => {
    const window = await ownerWindow(owner);
    const row = window.locator('.owner-account', { hasText: BARTEK_LOGIN });

    // Odpowiedź w toku (atrapa milczy), właściciel cofa zgodę.
    fake.mode = 'slow';
    fake.slowMs = 60_000;
    const chatsBefore = fake.chats.length;
    const pending = botChatB('Długa opowieść o bramie.');
    await expect.poll(() => fake.chats.length).toBeGreaterThan(chatsBefore);
    const revokedAt = Date.now();
    await row.getByRole('button', { name: 'Cofnij' }).click();
    const { outcome } = await pending;
    expect(outcome, 'strumień przerwany').toMatchObject({
      event: 'bot:error',
      code: 'AI_UNAVAILABLE',
    });
    expect(Date.now() - revokedAt, 'cofnięcie działa od razu').toBeLessThan(5_000);
    fake.mode = 'reply';
    await expect(row).toContainText('cofnięta');
    await expect.poll(() => aiReason(bartek)).toBe('no-consent');
    await expectBRefused('cofnięta zgoda');

    // Druga prośba — odrzucona.
    const request = async () =>
      expect((await bartek.page.request.post('/api/ai-access/request')).status()).toBe(200);
    await request();
    await expect(owner.page.locator('.owner-ai-count')).toHaveText('1');
    await row.getByRole('button', { name: 'Odrzuć' }).click();
    await expect(row).toContainText('odrzucona');
    await expect.poll(() => aiReason(bartek)).toBe('no-consent');
    await expectBRefused('odrzucona prośba');

    // Trzecia — zatwierdzona: przełącznik dalej włączony, właściciel obecny, AI wraca do B.
    await request();
    await row.getByRole('button', { name: 'Zatwierdź' }).click();
    await expect.poll(() => aiReason(bartek)).toBe('available');
    for (const actor of [marek, ola, kuba, bartek]) {
      expect(await actor.sniffer.found(OWNER_ONLY), actor.name).toEqual([]);
    }
  });

  test(`8. karencja: właściciel zamyka ostatnią kartę → boty B działają jeszcze ${GRACE_SECONDS} s, potem gasną; po powrocie przełącznik wyłączony`, async () => {
    // Obie karty właściciela (konto MG i konto gracza) znikają.
    await mg.page.goto('about:blank');
    await owner.page.goto('about:blank');
    const closedAt = Date.now();
    const inGrace = await botChatB('Jeszcze tu jesteś?');
    expect(inGrace.outcome?.event, 'w karencji AI jeszcze działa').toBe('bot:reply');
    await expect
      .poll(() => aiReason(bartek), { timeout: (GRACE_SECONDS + 20) * 1000 })
      .toBe('owner-absent');
    const after = Date.now() - closedAt;
    test
      .info()
      .annotations.push({ type: 'karencja', description: `${Math.round(after / 1000)} s` });
    expect(after, 'nie przed końcem karencji').toBeGreaterThanOrEqual((GRACE_SECONDS - 2) * 1000);
    await expectBRefused('właściciel nieobecny');

    // Powrót konta gracza: przełącznik wyłączony, powód „nie udostępnia”.
    await owner.page.goto('/');
    await expect.poll(async () => (await authOf(owner))?.status).toBe('authenticated');
    const window = await ownerWindow(owner);
    await expect(window.getByLabel('Udostępniam AI')).not.toBeChecked();
    await shot(owner, '08-po-powrocie');
    await expect.poll(() => aiReason(bartek)).toBe('sharing-off');
    await expectBRefused('po powrocie bez przełącznika');
    await window.getByLabel('Udostępniam AI').check();
    await expect.poll(() => aiReason(bartek)).toBe('available');

    await mg.page.goto('/');
    await expect.poll(async () => (await authOf(mg))?.status).toBe('authenticated');
  });

  test('8. „Przejmij AI”: sesja właściciela odbiera AI bez cofania zgody', async () => {
    await mg.page.getByRole('button', { name: 'Rozpocznij sesję' }).click();
    await expect(mg.page.locator('.session-state--live')).toContainText('sesja');
    for (const actor of [marek, ola]) {
      await expect(actor.page.locator('.between-sessions'), actor.name).toHaveCount(0);
      await expect.poll(() => sceneOf(actor), { message: actor.name }).toBe('Knajpa');
    }
    // B rozpoczęła sesję wcześniej, więc trzyma AI dalej.
    expect(await aiReason(bartek)).toBe('available');
    const window = await ownerWindow(owner);
    await expect(window.locator('.owner-ai-lease')).toContainText(`„${CAMPAIGN_B}”`);
    await shot(owner, '09-przejmij-ai');
    await window.getByRole('button', { name: 'Przejmij AI' }).click();
    await expect(window.locator('.owner-ai-lease')).toContainText(
      `AI trzyma sesja „${CAMPAIGN_A}” (Twoja).`,
    );
    await expect.poll(() => aiReason(bartek)).toBe('busy');
    await expectBRefused('po „Przejmij AI”');
    expect(queryOne('SELECT aiAccess FROM User WHERE login = ?', BARTEK_LOGIN)).toEqual({
      aiAccess: 'granted',
    });
    await expect(window.locator('.owner-account', { hasText: BARTEK_LOGIN })).toContainText(
      'zgoda',
    );
  });

  test('10. MG-C przy dwóch trwających sesjach: odmowa z komunikatem, stoły A i B bez zmian', async ({
    cast,
  }) => {
    const marks = new Map<Actor, number>();
    for (const actor of [marek, ola, kuba]) marks.set(actor, await actor.sniffer.mark());
    mgC = await cast.open('MG-C', 'firefox');
    const registered = await mgC.context.request.post('/api/auth/register', {
      data: { login: MG_C_LOGIN, password: MG_C_PASSWORD, repeat: MG_C_PASSWORD },
      headers: { 'x-forwarded-for': '10.9.9.3' },
    });
    expect(registered.status()).toBe(201);
    const created = await mgC.context.request.post('/api/campaigns', {
      data: { name: CAMPAIGN_C },
    });
    expect(created.status()).toBe(201);
    campaignC = ((await created.json()) as { id: string }).id;
    await mgC.page.goto('/');
    await expect(mgC.page.locator('.top-bar-campaign')).toHaveText(CAMPAIGN_C);
    await expect(mgC.page.locator('.session-state--prep')).toHaveText('przygotowanie');

    await mgC.page.getByRole('button', { name: 'Rozpocznij sesję' }).click();
    await expect(
      mgC.page.getByText(
        'Wszystkie miejsca na sesje są zajęte — serwer nie obsłuży więcej sesji naraz.',
      ),
    ).toBeVisible();
    await expect(mgC.page.locator('.session-state--prep')).toHaveText('przygotowanie');
    await shot(mgC, '10-sloty-zajete');
    const cSocket = await mgC.socket();
    expect(await emitAck(cSocket, 'session:start', { campaignId: campaignC })).toEqual({
      ok: false,
      error: 'SESSION_SLOTS_FULL',
    });
    cSocket.disconnect();
    expect(sessionStarted(campaignC)).toBe(false);
    expect(sessionStarted(campaignA) && sessionStarted(campaignB)).toBe(true);
    for (const actor of [marek, ola, kuba]) {
      await expect(actor.page.locator('.between-sessions'), actor.name).toHaveCount(0);
      expect(await actor.sniffer.found(['session:changed'], marks.get(actor)), actor.name).toEqual(
        [],
      );
    }
  });

  test('10. MG-A kończy sesję → MG-C startuje; AI wraca do sesji MG-B', async () => {
    await mg.page.getByRole('button', { name: 'Zakończ sesję' }).click();
    await mg.page.getByRole('button', { name: 'Na pewno? Zakończ' }).click();
    await expect(mg.page.locator('.session-state--prep')).toHaveText('przygotowanie');
    await mgC.page.getByRole('button', { name: 'Rozpocznij sesję' }).click();
    await expect(mgC.page.locator('.session-state--live')).toContainText('sesja');
    expect(sessionStarted(campaignC) && sessionStarted(campaignB)).toBe(true);
    // Kampania C bez zgody właściciela, więc AI wraca do B (zgoda została po „Przejmij”).
    await expect.poll(() => aiReason(bartek)).toBe('available');
    await expect.poll(() => aiReason(mgC)).toBe('no-consent');
  });

  test(`10. porzucona sesja i bezczynny stół zwalniają slot same (${EMPTY_MINUTES} min bez gniazd, ${IDLE_MINUTES} min bez zdarzeń)`, async () => {
    test.setTimeout((IDLE_MINUTES + 4) * 60_000);
    await stopServer();
    await startServer({
      AI_GATEWAY_URL: fake.url,
      VTT_AI_OWNER_GRACE_SECONDS: String(GRACE_SECONDS),
      VTT_SESSION_EMPTY_MINUTES: String(EMPTY_MINUTES),
      VTT_SESSION_IDLE_MINUTES: String(IDLE_MINUTES),
    });
    const restartedAt = Date.now();
    for (const actor of [bartek, kuba, mgC]) await expectReconnected(actor);
    // MG-C porzuca stół: żadnego gniazda kampanii C. Stół B: trzy gniazda, nikt nic nie robi.
    await mgC.page.goto('about:blank');

    await expect
      .poll(() => sessionStarted(campaignC), {
        timeout: (EMPTY_MINUTES + 2) * 60_000,
        intervals: [5_000],
      })
      .toBe(false);
    const emptyAfter = Date.now() - restartedAt;
    expect(sessionStarted(campaignB), 'stół B z graczami nie zwalnia się jako pusty').toBe(true);

    await expect
      .poll(() => sessionStarted(campaignB), {
        timeout: (IDLE_MINUTES + 2) * 60_000,
        intervals: [5_000],
      })
      .toBe(false);
    const idleAfter = Date.now() - restartedAt;
    test.info().annotations.push({
      type: 'zwolnienie slotów',
      description: `pusty C po ${Math.round(emptyAfter / 1000)} s, bezczynny B po ${Math.round(idleAfter / 1000)} s`,
    });
    expect(idleAfter, 'bezczynność nie przed progiem').toBeGreaterThanOrEqual(
      IDLE_MINUTES * 60_000,
    );
    await expect(kuba.page.locator('.between-sessions')).toBeVisible();
    await expect(bartek.page.locator('.session-state--prep')).toHaveText('przygotowanie');
    await expect(
      bartek.page.getByText(
        `Sesja zakończona automatycznie: przez ${IDLE_MINUTES} min nic się przy stole nie wydarzyło.`,
      ),
    ).toBeVisible();
    await expect(kuba.page.getByText('Sesja zakończona automatycznie')).toHaveCount(0);
    await shot(bartek, '11-koniec-bezczynnosc');

    await mgC.page.goto('/');
    await expect(
      mgC.page.getByText(
        `Sesja zakończona automatycznie: przez ${EMPTY_MINUTES} min nikogo nie było przy stole.`,
      ),
    ).toBeVisible();
    await shot(mgC, '12-koniec-pusty');
    // Oba sloty wolne: MG-A rozpoczyna sesję.
    await expectReconnected(mg);
    await mg.page.getByRole('button', { name: 'Rozpocznij sesję' }).click();
    await expect(mg.page.locator('.session-state--live')).toContainText('sesja');
  });

  test('kanarki przez cały przebieg: nic z A u grupy B i właściciela-gracza, nic z B u grupy A', async () => {
    for (const actor of bPlayers()) {
      expect(await actor.sniffer.found(aSecrets(), startMarks.get(actor)), actor.name).toEqual([]);
    }
    expect(await owner.sniffer.found(aSecrets(true)), 'właściciel jako gracz').toEqual([]);
    for (const actor of [marek, ola]) {
      expect(await actor.sniffer.found(bSecrets(), startMarks.get(actor)), actor.name).toEqual([]);
      expect(await actor.sniffer.found(OWNER_ONLY), actor.name).toEqual([]);
    }
    // MG-A po zalogowaniu widzi swój panel AI (prośby, dzierżawa B) — ale nic z gry B.
    expect(
      await mg.sniffer.found([...bCanaries, ...fromB.secretNow, REPLY_CODE], startMarks.get(mg)),
      'MG-A',
    ).toEqual([]);
    expect(await mgC.sniffer.found([...aSecrets(), ...bSecrets()]), 'MG-C').toEqual([]);
  });

  test('konsola bez nowych błędów', async ({ cast }) => {
    for (const actor of cast.actors) {
      expect(
        actor
          .unexpectedErrors()
          .filter((text) => !REFUSALS.test(text))
          .filter((text) => !socketDropped(text)),
        `${actor.name} (${actor.engine})`,
      ).toEqual([]);
    }
  });
});
