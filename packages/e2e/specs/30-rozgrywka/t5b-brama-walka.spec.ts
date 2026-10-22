import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { query, queryOne, stateFingerprint } from '../../fixtures/db.ts';
import { architecture, revealFog, runOf, visibleTokenIds, zonesOn } from '../../fixtures/brama.ts';
import { BRAMA } from '../../fixtures/maps.ts';
import { canariesInDatabase, ONLY_FROM } from '../../fixtures/nocna-zmiana.ts';
import { clickOnMap, fitCamera, tokenCentre, walkOnMap } from '../../fixtures/scene.ts';
import { Canaries } from '../../fixtures/sniffer.ts';
import { closeNotices, createInvitation, say } from '../../fixtures/table.ts';
import {
  cellCentre,
  chatCards,
  chipInitiatives,
  clientsSeeTurn,
  closeSheet,
  combatRow,
  combatants,
  combatantOf,
  endPlayerTurn,
  expectClean,
  freshCard,
  lastMessageId,
  messageAfter,
  nextTurn,
  noDodge,
  openSheet,
  queueOf,
  rollAndWait,
  rollById,
  sceneRow,
  sheet,
  statusesOf,
  token,
  type RollJson,
  beginFight,
  takeFigure,
  armFirstWeapon,
  damageToCup,
  cupHoldsDamage,
  fightPick,
} from '../../fixtures/walka.ts';
import { GatewayProxy } from '../../instance/gateway-proxy.ts';
import {
  hasCheckpoint,
  pendingDice,
  restoreCheckpoint,
  saveCheckpoint,
  scriptDice,
  startInstance,
  startServer,
  stopServer,
} from '../../instance/instance.ts';
import { GATEWAY_PROXY_PORT } from '../../instance/paths.ts';
import { GATEWAY_URL, LLM_TIMEOUT_MS, requireGateway } from '../../fixtures/llm.ts';

/**
 * T5b (`testy.md` 5.3, kroki 5.4–5.11): walka druga na „Bramie” od punktu
 * `po-T5a` — wieżyczka strzela sama na wejście w swoją strefę, Demon broni
 * Architektury, Kruk atakuje Olę i pada od Miecza, Ola przejmuje węzeł,
 * strzela wieżyczką w Strażnika i ją wyłącza; tura bota „Strażnik” traci
 * gateway w trakcie generowania, Kowal wchodzi na podłogę elektryczną,
 * przeładowuje amunicją przeciwpancerną i kładzie Strażnika; F5 u Oli w Sieci;
 * gateway wraca bez restartu serwera. Na końcu punkt `po-T5`.
 *
 * Decyzje MG z 27.09 (sesja T5b): Ola derezuje Kruka Mieczem (Kruk atakuje ją
 * raz, darmowym atakiem przy wykryciu); walka kończy się, gdy Strażnik pada
 * od strzału przeciwpancernego Kowala — Test Przeżywalności na pasie MG, potem
 * ✕. Pad gatewaya robi pośrednik TCP w suicie (sesja T5a).
 *
 * Kości: skrypt tam, gdzie wynik wybiera drogę; Kowal ma 12 PW i „Ciało obce”,
 * więc każdy strzał w niego i każda strefa biorą najniższe ścianki.
 */

type Sheet = { hpCurrent: number };

test.describe.serial('T5b: „Brama” — walka druga, Sieć, wieżyczka, pad AI', () => {
  let mg: Actor;
  let marek: Actor;
  let ola: Actor;
  let cell: number;
  const proxy = new GatewayProxy(GATEWAY_PROXY_PORT, GATEWAY_URL);
  /** Serwer instancji woła gateway przez pośrednika — do przywrócenia w `afterAll`. */
  let proxied = false;
  const fromPlayers = new Canaries();
  const fromMarek = new Canaries();
  const fromOla = new Canaries();
  /** Domyślne położenie okna runu Oli, zanim je odsunęła (#34). */
  let olaWindowDefault: { x: number; y: number; width: number; height: number } | null = null;
  /** To samo u MG — okno nie może stać na pasku narzędzi mapy ani na czacie (#34). */
  let mgWindowDefault: { x: number; y: number; width: number; height: number } | null = null;
  /** Id karty strzału wieżyczki ze strefy (#39). */
  let zoneShotId = 0;
  /** Notatki MG po padzie gatewaya w turze bota (#35). */
  let botTurnNotes: string[] = [];
  /** Czy kubek Oli wołał o obrażenia za strzał jej wieżyczki (#38). */
  let olaTurretDamageButton = 0;
  /** Ostatnia wiadomość przed turą Strażnika — jego Test Przeżywalności rzuca serwer (17.10). */
  let beforeGuardTurn = 0;
  /** Etykieta kanarka → kod (np. `pietro-LOD` → `KANAREK-pietro-LOD-0004`). */
  const codes = new Map<string, string>();
  /** Piętro, na które Ola weszła: jego opis jest odtąd jej, ale nie Marka. */
  const olaEntered = (label: string) => {
    const code = codes.get(label)!;
    fromPlayers.reveal(code);
    fromMarek.track(code);
  };
  const secretsFor = (player: Actor) => [
    ...fromPlayers.secretNow,
    ...(player === marek ? fromMarek : fromOla).secretNow,
  ];
  const runWindow = (actor: Actor) => actor.page.locator('.net-run-window');
  const point = (column: number, row: number) => cellCentre(cell, column, row);
  const at = (name: string) => [Math.round(token(name).x / cell), Math.round(token(name).y / cell)];
  /** Uczestnik kolejki po etykiecie albo nazwie figury (LOD i Demon nie mają figur). */
  const activeLabel = () => {
    const row = queryOne<{ label: string | null; name: string | null }>(
      `SELECT c.label, t.name FROM Combat k JOIN Combatant c ON c.id = k.activeCombatantId
         LEFT JOIN Token t ON t.id = c.tokenId WHERE k.sceneId = ?`,
      sceneRow().id,
    );
    return row?.name ?? row?.label ?? null;
  };
  const hp = (name: string) => sheet<Sheet>(name).hpCurrent;
  /** Czarny LOD albo Demon runu Iskry z bazy (tryb, REZ). */
  const iceOf = (name: string) => {
    const row = queryOne<{ data: string }>(
      'SELECT r.data FROM NetRun r JOIN Character c ON c.id = r.characterId WHERE c.name = ?',
      'Iskra',
    );
    const state = JSON.parse(row!.data) as {
      ice: { name: string; mode: string; rezCurrent: number }[];
      demons: { name: string; mode: string; rezCurrent: number }[];
    };
    return [...state.ice, ...state.demons].find((entry) => entry.name === name);
  };
  const architectureName = () =>
    queryOne<{ name: string }>('SELECT name FROM NetArchitecture')!.name;
  const trunk = () => architecture(architectureName()).shaft.branches[0]!.floors;
  /** Węzły kontrolne w rękach Oli (z bazy). */
  const controlledFloors = () =>
    (
      (runOf('Iskra')?.state as unknown as { controlled?: { floorId: string }[] }).controlled ?? []
    ).map((hold) => hold.floorId);

  /** Przeciągnięcie myszą z punktu do punktu (belka okna, uchwyt rozmiaru). */
  async function drag(actor: Actor, from: { x: number; y: number }, to: { x: number; y: number }) {
    const page = actor.page;
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
    await page.mouse.move(to.x, to.y, { steps: 5 });
    await page.mouse.up();
  }
  /** Okno runu uchwytem i za belkę w podany prostokąt ekranu. */
  async function arrangeRunWindow(
    actor: Actor,
    target: { x: number; y: number; width?: number; height?: number },
  ) {
    const window = runWindow(actor);
    const box = (await window.boundingBox())!;
    if (target.width !== undefined && target.height !== undefined) {
      const grip = (await window.locator('.window-resizer').boundingBox())!;
      await drag(
        actor,
        { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 },
        {
          x: grip.x + grip.width / 2 - (box.width - target.width),
          y: grip.y + grip.height / 2 - (box.height - target.height),
        },
      );
    }
    const header = (await window.locator('.sheet-header').boundingBox())!;
    await drag(
      actor,
      { x: header.x + 30, y: header.y + header.height / 2 },
      { x: target.x + 30, y: target.y + header.height / 2 },
    );
    const placed = (await window.boundingBox())!;
    expect(Math.abs(placed.x - target.x), `${actor.name}: okno runu w x`).toBeLessThan(8);
    expect(Math.abs(placed.y - target.y), `${actor.name}: okno runu w y`).toBeLessThan(8);
  }
  /**
   * Okno runu otwiera się od 29.09 przy prawej krawędzi mapy, pod pasem kolejki
   * (#34) — ale plac, po którym klika scenariusz, też jest mapą. MG zwęża je nad
   * lewy panel (mapa, pasek, czat i kubek wolne); Ola zsuwa je pod pas kolejki.
   */
  const tuckRunWindow = (actor: Actor) =>
    actor === mg
      ? arrangeRunWindow(mg, { x: 0, y: 110, width: 280, height: 680 })
      : arrangeRunWindow(actor, { x: 290, y: 115 });

  /**
   * Celowanie paskiem akcji: zaznaczenie figury, broń w ręku (pasek bierze ją
   * sam; gdy nie wziął — klik w slot, jak przy stole), klik w cel (MG z Alt).
   * Zwraca załadowany kubek ataku.
   */
  async function aimAs(actor: Actor, name: string, target: { x: number; y: number }, alt = false) {
    const page = actor.page;
    const panel = page.getByRole('complementary', { name: 'Panel aktywnej postaci' });
    await page.keyboard.press('Escape');
    // Etap 50b: MG w walce bierze figurę z menu, klik tylko by ją pokazał.
    if (actor === mg) await takeFigure(mg, tokenCentre(token(name), cell));
    await clickOnMap(page, tokenCentre(token(name), cell));
    await page.waitForTimeout(400);
    if (
      !(await panel
        .getByText(/^W ręku:/)
        .isVisible()
        .catch(() => false))
    ) {
      test.info().annotations.push({
        type: `${name}: broń z paska`,
        description: 'bez „W ręku” po zaznaczeniu',
      });
      await armFirstWeapon(page);
    }
    if (alt) await page.keyboard.down('Alt');
    await clickOnMap(page, target);
    if (alt) await page.keyboard.up('Alt');
    const cover = page.getByRole('button', { name: 'Strzelaj mimo osłony' }).last();
    await page.waitForTimeout(400);
    if (await cover.isVisible().catch(() => false)) await cover.click();
    await expect
      .poll(async () => (await actor.store<{ attack: unknown }>('roll'))?.attack ?? null, {
        message: `${name}: kubek ataku`,
      })
      .not.toBeNull();
  }

  /**
   * Marsz figury klikiem właściciela (MG — figura bez właściciela). Marsz staje,
   * gdy ktoś wchodzi w pole widzenia („marsz przerwany”) — gracz klika wtedy cel
   * jeszcze raz, więc pomocnik też.
   */
  async function walk(actor: Actor, name: string, column: number, row: number) {
    const page = actor.page;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await page.keyboard.press('Escape');
      if (actor === mg) await takeFigure(mg, tokenCentre(token(name), cell));
      await clickOnMap(page, tokenCentre(token(name), cell));
      await page.waitForTimeout(300);
      // Środek pola — także tego, na który zachodzi grot zaznaczonej figury:
      // klik bez przeciągnięcia to marsz, nie obrót (#36, poprawione 29.09).
      await walkOnMap(page, point(column, row));
      // Marsz rusza po chwili (planer, animacja) — dopiero potem czekamy, aż stanie.
      await page.waitForTimeout(1_500);
      let last = '';
      await expect
        .poll(
          () => {
            const now = JSON.stringify(at(name));
            const settled = now === last;
            last = now;
            return settled;
          },
          { timeout: 30_000, intervals: [1_500], message: `${name} stoi` },
        )
        .toBe(true);
      if (last === JSON.stringify([column, row])) break;
      const notes = (
        (await actor.store<{ items: { type: string; text?: string }[] }>('chat'))?.items ?? []
      )
        .filter((item) => item.type === 'note')
        .slice(-2)
        .map((item) => item.text);
      test.info().annotations.push({
        type: `marsz ${name} przerwany`,
        description: `na ${last}, cel ${column},${row}; notatki: ${JSON.stringify(notes)}; zaznaczona: ${JSON.stringify(await actor.store<{ tokenId: string | null }>('selection'))}`,
      });
    }
    expect(at(name), `${name} → ${column},${row}`).toEqual([column, row]);
    await page.keyboard.press('Escape');
  }

  test.beforeAll(async () => {
    // Pełny przebieg idzie tu wprost po T5a; osobno — `E2E_FROM=po-T5a`.
    const run = runOf('Iskra');
    if (!run || run.state.position.floor !== 1 || queryOne('SELECT id FROM Combat')) {
      throw new Error('E2E: T5b needs the po-T5a state (E2E_FROM=po-T5a)');
    }
    cell = sceneRow().gridSizePx;
    // Serwer instancji dostaje gateway przez pośrednika — tylko on umie „paść”
    // w trakcie generowania, nie ruszając prawdziwego gatewaya i modelu.
    await proxy.start();
    await stopServer();
    await startServer({ AI_GATEWAY_URL: proxy.url });
    proxied = true;
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
    // Plik padł w połowie: następne pliki pełnego przebiegu dostają zwykły gateway.
    if (proxied) {
      await stopServer();
      await startServer();
    }
    await proxy.close();
  });

  test('start z po-T5a: Ola na Pliku, Kowal na placu, Strażnik i Wieżyczka pod mgłą', async ({
    cast,
  }) => {
    mg = await cast.mg('chromium');
    const campaignId = queryOne<{ id: string }>(
      `SELECT id FROM Campaign WHERE name = 'Nocna zmiana'`,
    )!.id;
    marek = await cast.gracz('Marek', 'chromium', await createInvitation(mg, campaignId, 'Marek'));
    ola = await cast.gracz('Ola', 'firefox', await createInvitation(mg, campaignId, 'Ola'));
    for (const actor of [mg, marek, ola]) {
      await expect
        .poll(
          async () => (await actor.store<{ scene: { name: string } | null }>('scene'))?.scene?.name,
        )
        .toBe('Brama');
      await fitCamera(actor.page, BRAMA.width, BRAMA.height).catch(() => undefined);
    }
    for (const [code, label] of canariesInDatabase()) {
      codes.set(label, code);
      const onlyFrom = label === 'lup-Zbira' ? 'Ola' : ONLY_FROM[label];
      (onlyFrom === 'Marek' ? fromMarek : onlyFrom === 'Ola' ? fromOla : fromPlayers).track(code);
    }
    fromPlayers.track(token('Strażnik').id);
    fromPlayers.track(token('Wieżyczka').id);
    // Okno runu wraca u Oli i u MG po zalogowaniu — ten sam stan szybu.
    await expect(runWindow(ola).locator('.net-run-floor').nth(1)).toHaveClass(
      /net-run-floor--here/,
    );
    await expect(runWindow(mg)).toBeVisible();
    olaWindowDefault = await runWindow(ola).boundingBox();
    mgWindowDefault = await runWindow(mg).boundingBox();
    await tuckRunWindow(mg);
    await tuckRunWindow(ola);
    // Gateway przez pośrednika: MG widzi boty dostępne.
    await expect
      .poll(
        async () => (await mg.store<{ status: { available: boolean } }>('ai'))?.status.available,
        {
          timeout: 30_000,
        },
      )
      .toBe(true);
    test.info().annotations.push({
      type: 'stan startowy',
      description: JSON.stringify({
        Kowal: [hp('Kowal'), at('Kowal')],
        Iskra: [hp('Iskra'), at('Iskra')],
        Strażnik: [hp('Strażnik'), at('Strażnik')],
        Wieżyczka: at('Wieżyczka'),
      }),
    });
  });

  test('5.4 MG odsłania plac: Strażnik i Wieżyczka u obojga graczy bez F5', async () => {
    const page = mg.page;
    await fitCamera(page, BRAMA.width, BRAMA.height);
    await revealFog(page, BRAMA.yardWide.from, BRAMA.yardWide.to);
    for (const name of ['Strażnik', 'Wieżyczka']) fromPlayers.reveal(token(name).id);
    await expect
      .poll(() => visibleTokenIds(marek))
      .toEqual(expect.arrayContaining([token('Strażnik').id, token('Wieżyczka').id]));
    // Iskra stoi przy skrzynce za wschodnim odcinkiem bariery (zasłania figury, 42b),
    // więc sama Wieżyczki pod magazynem nie widzi — ale od etapu 45 figura Kowala to
    // „oczy drużyny”, a Kowal na placu widzi obie figury.
    await expect
      .poll(() => visibleTokenIds(ola))
      .toEqual(expect.arrayContaining([token('Strażnik').id, token('Wieżyczka').id]));
  });

  test('5.4 Kowal wchodzi w strefę wieżyczki — wieżyczka strzela sama, obrażenia nie przebijają kurtki', async () => {
    test.setTimeout(3 * 60_000);
    const since = lastMessageId();
    const kowalHp = hp('Kowal');
    // Wartość bojowa 14 + 7 = 21 > PT 20 (13 m) — trafia.
    scriptDice([7]);
    await walk(marek, 'Kowal', 25, 11);
    const title = 'Bardzo ciężki pistolet → Kowal';
    await expect
      .poll(() => messageAfter(since, title)?.id ?? 0, { timeout: 20_000 })
      .toBeGreaterThan(0);
    expect(pendingDice()).toBe('');
    zoneShotId = messageAfter(since, title)!.id;
    const shot = rollById(zoneShotId);
    test.info().annotations.push({ type: 'strzał wieżyczki', description: JSON.stringify(shot) });
    expect(shot.actor).toBe('Wieżyczka');
    expect(shot.total).toBe(21);
    expect(shot.attack?.hit).toBe(true);
    // Wiersz dziennika mówi, skąd strzał: wejście na broniony obszar.
    expect(messageAfter(since, 'Wejście na broniony obszar', 'action')).toBeTruthy();

    // Obrażenia rzuca MG (wieżyczka nie ma właściciela); gracz nie ma przycisku.
    await expect(
      chatCards(marek.page, title).last().getByRole('button', { name: 'Na kubek' }),
    ).toHaveCount(0);
    await noDodge(mg, zoneShotId, title);
    scriptDice([1, 1, 1, 1]);
    const before = lastMessageId();
    const damageTitle = 'Bardzo ciężki pistolet — obrażenia';
    const seen = await chatCards(mg.page, damageTitle).count();
    await damageToCup(mg.page, title);
    await rollAndWait(mg, before, damageTitle);
    // Obrażenia rozliczają się same na „Kowal” (decyzja MG z 03.10), bez „Zastosuj”.
    await freshCard(mg.page, damageTitle, seen);
    // 4 obrażeń na kurtkę OB 12: nic nie przechodzi, pancerz bez ablacji.
    await expect
      .poll(
        () =>
          query<{ id: number }>(
            `SELECT id FROM ChatMessage WHERE id > ? AND kind = 'damage'`,
            before,
          ).length,
      )
      .toBeGreaterThan(0);
    expect(hp('Kowal')).toBe(kowalHp);
    const jacket = sheet<{ armor: { name: string; spCurrent: number; equipped?: boolean }[] }>(
      'Kowal',
    ).armor.find((a) => a.name === 'Średnia kurtka kuloodporna');
    expect(jacket?.spCurrent).toBe(12);
  });

  test('#39 strzał wieżyczki ze strefy nie idzie na konto gracza, który w nią wszedł', async () => {
    // Strefa strzela „ręką” tego, kto ruszył figurą (`fireZone` z użytkownikiem
    // ruchu) — karta u stołu ma podpis „Wieżyczka (Marek)”.
    const row = queryOne<{ name: string; role: string }>(
      `SELECT u.name, u.role FROM ChatMessage m JOIN User u ON u.id = m.authorId WHERE m.id = ?`,
      zoneShotId,
    )!;
    test.info().annotations.push({ type: 'autor karty', description: JSON.stringify(row) });
    expect(row.role).toBe('GM');
  });

  test('5.4 tryb turowy: Kowal, Iskra i Strażnik; Demon wykrywa intruza i staje na czele kolejki', async () => {
    test.setTimeout(3 * 60_000);
    const page = mg.page;
    await page.getByRole('button', { name: 'Walka', exact: true }).first().click();
    await fightPick(page, 'Strażnik').check();
    await expect(fightPick(page, 'Wieżyczka')).not.toBeChecked();
    await page.getByRole('button', { name: /Załóż starcie/ }).click();
    await expect.poll(() => combatants().length).toBe(3);

    async function rollInitiative(actor: Actor, face: number): Promise<RollJson> {
      scriptDice([face]);
      // 🎲 pulsuje skalą, póki gracz nie rzuci (22.10) — nigdy nie jest „stabilny”.
      await actor.page.getByRole('button', { name: /^Rzuć inicjatywę:/ }).click({ force: true });
      const id = await rollAndWait(actor, lastMessageId(), 'Inicjatywa');
      const roll = rollById(id);
      await expect
        .poll(() => chipInitiatives(mg), { timeout: 30_000, message: `${actor.name} na pasie MG` })
        .toContain(String(roll.total));
      return roll;
    }
    const kowal = await rollInitiative(marek, 9);
    const iskraRef = sheet<{ stats: { ref: number } }>('Iskra').stats.ref;
    const iskra = await rollInitiative(ola, Math.min(9, kowal.total - 1 - iskraRef));
    expect(iskra.total).toBeLessThan(kowal.total);
    scriptDice([1]);
    await page.getByRole('button', { name: 'Rzuć wszystkim', exact: true }).click();
    await expect.poll(() => combatants().every((c) => c.initiative !== null)).toBe(true);
    expect(pendingDice()).toBe('');
    expect(combatantOf('Strażnik').initiative).toBeLessThan(iskra.total);

    // Demon czuwa od podłączenia; MG klika „wykrywa” — bez testu, Demon staje na czele.
    await runWindow(mg).getByRole('button', { name: 'Demon wykrywa intruza' }).click();
    await expect.poll(() => combatants().length).toBe(4);
    await beginFight(page);
    await expect.poll(activeLabel).toBe('Diablik');
    const queues: Record<string, string[]> = {};
    for (const actor of [mg, marek, ola]) {
      await expect
        .poll(async () => (await queueOf(actor)).length, { message: actor.name, timeout: 30_000 })
        .toBeGreaterThan(2);
      queues[actor.name] = await queueOf(actor);
    }
    test.info().annotations.push({ type: 'kolejki', description: JSON.stringify(queues) });
    expect(queues.MG).toEqual(['Diablik', 'Kowal', 'Iskra', 'Strażnik']);
    // 5.4: Ola w Sieci i Marek na mapie w tej samej kolejce.
    for (const player of [marek, ola]) {
      expect(queues[player.name]!.filter((n) => n !== 'Diablik')).toEqual([
        'Kowal',
        'Iskra',
        'Strażnik',
      ]);
    }
  });

  /** Wiersze czatu od `since` — do adnotacji (rodzaj, tekst, skrót ładunku). */
  const chatSince = (since: number) =>
    query<{ id: number; kind: string; text: string; payload: string | null }>(
      'SELECT id, kind, text, payload FROM ChatMessage WHERE id > ? ORDER BY id',
      since,
    ).map((row) => `${row.kind} · ${row.text} · ${(row.payload ?? '').slice(0, 400)}`);

  test('#34 okno runu netrunnerki nie zasłania czarnego pasa kolejki', async () => {
    // Domyślnie okno runu stoi na pasie kolejki (inicjatywa, tura) — Ola musiała
    // je odsunąć, żeby rzucić inicjatywę; klamra okien nie pozwala go wypchnąć.
    type Box = { x: number; y: number; width: number; height: number };
    const overlaps = (a: Box, b: Box) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    const bar = (await ola.page.getByRole('group', { name: 'Kolejka inicjatywy' }).boundingBox())!;
    const mgBar = (await mg.page.getByRole('group', { name: 'Kolejka inicjatywy' }).boundingBox())!;
    const tools = (await mg.page.getByRole('toolbar', { name: 'Narzędzia mapy' }).boundingBox())!;
    const side = (await mg.page.locator('.side-panel').boundingBox())!;
    test.info().annotations.push({
      type: 'okno i pas',
      description: JSON.stringify({
        Ola: { okno: olaWindowDefault, pas: bar },
        MG: { okno: mgWindowDefault, pas: mgBar, narzędzia: tools, panel: side },
      }),
    });
    expect(overlaps(olaWindowDefault!, bar), 'Ola: okno na pasie').toBe(false);
    expect(overlaps(mgWindowDefault!, mgBar), 'MG: okno na pasie').toBe(false);
    expect(overlaps(mgWindowDefault!, tools), 'MG: okno na narzędziach mapy').toBe(false);
    expect(overlaps(mgWindowDefault!, side), 'MG: okno na panelu z czatem').toBe(false);
  });

  test('5.2 runda 1, tura Demona: wieżyczka trafia Olę przez barierę, Paf w mózg', async () => {
    test.setTimeout(2 * 60_000);
    const since = lastMessageId();
    const iskraHp = hp('Iskra');
    // Demon celuje z wieżyczki w ciało netrunnerki za wschodnim odcinkiem bariery
    // (zasłania figury): 14 + 10 + 5 − 4 = 25 > PT 20 — trafia. Paf: Demon 3 + 9 = 12
    // przeciw Interfejsowi Oli 4 + 2 = 6 — trafia, 1k6 = 3 w mózg.
    scriptDice([10, 5, 9, 2, 3]);
    await runWindow(mg).getByRole('button', { name: 'Tura Demona' }).click();
    await expect
      .poll(() => messageAfter(since, 'Tura Demona', 'action')?.id ?? 0, { timeout: 20_000 })
      .toBeGreaterThan(0);
    expect(pendingDice()).toBe('');
    const title = 'Bardzo ciężki pistolet → Iskra';
    const shot = rollById(messageAfter(since, title)!.id);
    test
      .info()
      .annotations.push(
        { type: 'strzał wieżyczki Demona', description: JSON.stringify(shot) },
        { type: 'czat tury Demona', description: JSON.stringify(chatSince(since)) },
      );
    expect(shot.actor).toBe('Wieżyczka');
    expect(shot.attack?.hit).toBe(true);
    expect(shot.breakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Cel zasłonięty barierą', value: -4 }),
      ]),
    );
    // Paf: 3 w mózg, bez pancerza.
    await expect.poll(() => hp('Iskra')).toBe(iskraHp - 3);

    // Obrażenia wieżyczki Demona rzuca MG: 4k6 = 18 zatrzymuje bariera OB 20.
    const page = mg.page;
    await page.getByRole('button', { name: 'Czat', exact: true }).click();
    const damageTitle = 'Bardzo ciężki pistolet — obrażenia';
    const seen = await chatCards(page, damageTitle).count();
    await noDodge(mg, messageAfter(since, title)!.id, title);
    scriptDice([5, 5, 4, 4]);
    const beforeDamage = lastMessageId();
    await damageToCup(page, title);
    await rollAndWait(mg, beforeDamage, damageTitle);
    // Obrażenia rozliczają się same na „Iskra” (decyzja MG z 03.10), bez „Zastosuj”.
    await freshCard(page, damageTitle, seen);
    await expect
      .poll(() => messageAfter(beforeDamage, 'Iskra', 'damage')?.id ?? 0)
      .toBeGreaterThan(0);
    const applied = JSON.parse(messageAfter(beforeDamage, 'Iskra', 'damage')!.payload!) as {
      barrierSp?: number;
      hpLost: number;
    };
    test.info().annotations.push({ type: 'karta obrażeń', description: JSON.stringify(applied) });
    expect(applied.barrierSp).toBe(20);
    expect(applied.hpLost).toBe(0);
    expect(hp('Iskra')).toBe(iskraHp - 3);
  });

  test('runda 1, tura Kowala: marsz, Bieg i wejście na podłogę elektryczną (5.7)', async () => {
    test.setTimeout(3 * 60_000);
    await nextTurn(mg);
    expect(activeLabel()).toBe('Kowal');
    await clientsSeeTurn(marek);
    const since = lastMessageId();
    const kowalHp = hp('Kowal');
    // Akcja Ruchu: 5 pól (RUCH 7 − 2 za kurtkę = 10 m) na zachód, poza strefą wieżyczki.
    await walk(marek, 'Kowal', 20, 11);
    await marek.page
      .getByRole('complementary', { name: 'Panel aktywnej postaci' })
      .getByRole('button', { name: /^Bieg/ })
      .click();
    await expect.poll(() => JSON.parse(combatantOf('Kowal').turnState!).action?.id).toBe('run');
    // Drugi ruch z Biegu: 3 pola na podłogę elektryczną przy budce. Etap 58a:
    // marsz staje sam na pierwszym polu w 4 m od ukrytej podłogi (19, 11)
    // i rzuca Percepcję w ukryciu (2 — nie widzi); wiersz dostaje tylko MG.
    scriptDice([2, 1, 1, 1, 1, 1, 1]);
    await marek.page.keyboard.press('Escape');
    await clickOnMap(marek.page, tokenCentre(token('Kowal'), cell));
    await marek.page.waitForTimeout(300);
    await walkOnMap(marek.page, point(17, 11));
    await expect.poll(() => at('Kowal'), { timeout: 20_000 }).toEqual([19, 11]);
    const perception = messageAfter(since, 'Percepcja', 'gmaction');
    expect(perception?.payload ?? '').toContain('nie zauważa: Podłoga elektryczna');
    expect(messageAfter(since, 'Percepcja', 'action')).toBeFalsy();
    // Dalej na podłogę — Kowal już rzucał, więc nic go nie trzyma; 6k6 = 6 przy wejściu.
    await walk(marek, 'Kowal', 17, 11);
    await expect
      .poll(() => messageAfter(since, 'Wejście na broniony obszar', 'action')?.id ?? 0, {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
    expect(pendingDice()).toBe('');
    // 6k6 = 6 na kurtkę OB 12 — podłoga nie przebija (pancerz jej nie traci, s. 216).
    const entry = JSON.parse(messageAfter(since, 'Kowal', 'damage')!.payload!) as {
      damageRolled: number;
      hpLost: number;
      ammo?: { name: string; notes: string[] };
    };
    test
      .info()
      .annotations.push(
        { type: 'wejście na podłogę', description: JSON.stringify(entry) },
        { type: 'tura Kowala', description: combatantOf('Kowal').turnState ?? '' },
      );
    expect(entry).toMatchObject({ damageRolled: 6, hpLost: 0 });
    expect(entry.ammo).toMatchObject({ name: 'Podłoga elektryczna', notes: ['wejście na obszar'] });
    const turn = JSON.parse(combatantOf('Kowal').turnState!) as {
      metresWalked: number;
      overspent: number;
    };
    expect(turn).toMatchObject({ metresWalked: 16, overspent: 0 });
    expect(hp('Kowal')).toBe(kowalHp);

    // Koniec tury na podłodze: drugie 6k6 i „Ciało obce” po marszu ponad 4 m (5 PW, bez pancerza).
    const beforeEnd = lastMessageId();
    scriptDice([1, 1, 1, 1, 1, 1]);
    await endPlayerTurn(marek);
    await expect.poll(() => hp('Kowal')).toBe(kowalHp - 5);
    expect(pendingDice()).toBe('');
    const endCards = query<{ text: string; payload: string }>(
      `SELECT text, payload FROM ChatMessage WHERE id > ? AND kind = 'damage' ORDER BY id`,
      beforeEnd,
    );
    test.info().annotations.push({
      type: 'koniec tury Kowala',
      description: JSON.stringify(endCards.map((c) => c.text)),
    });
    expect(endCards.map((c) => c.text)).toEqual(['Kowal — Korpus', 'Kowal — Ciało obce']);
    expect(JSON.parse(endCards[0]!.payload)).toMatchObject({
      hpLost: 0,
      ammo: { notes: ['koniec Tury na obszarze'] },
    });
  });

  test('runda 1, tura Oli: zjazd do Kruka, jego darmowy atak, Miecz go derezuje, zjazd na węzeł', async () => {
    test.setTimeout(3 * 60_000);
    expect(activeLabel()).toBe('Iskra');
    await clientsSeeTurn(ola);
    const window = runWindow(ola);
    const floors = window.locator('.net-run-floor');
    const since = lastMessageId();
    await floors.nth(2).locator('.net-run-floor-body').click();
    await expect.poll(() => runOf('Iskra')?.state.position.floor).toBe(2);
    olaEntered('pietro-LOD');
    // Kruk czyha na swoim piętrze obok ścigającego już Diablika.
    await expect(window.locator('.net-ice-name')).toHaveText(['Kruk', 'Diablik']);

    // MG: „LOD wykrywa intruza” — Ola 4 + 2 = 6 przeciw PRĘ Kruka 4 + 9 = 13:
    // przegrywa, Kruk wyprowadza darmowy atak (1k6 = 4 w mózg).
    const iskraHp = hp('Iskra');
    scriptDice([2, 9, 4]);
    await runWindow(mg).getByRole('button', { name: 'LOD wykrywa intruza' }).click();
    await expect.poll(() => combatants().length).toBe(5);
    expect(pendingDice()).toBe('');
    // Darmowy atak Kruka: nie ma zrezowanego Obrońcy, więc 1k6 = 4 wprost w mózg.
    await expect.poll(() => hp('Iskra')).toBe(iskraHp - 4);
    // Karta wymiany zapisuje się po obrażeniach w mózg — czekamy, a nie sprawdzamy raz.
    await expect
      .poll(() => messageAfter(since, 'Wykrycie — Kruk', 'gmroll')?.id ?? 0)
      .toBeGreaterThan(0);
    await expect
      .poll(() => queueOf(mg), { timeout: 30_000 })
      .toEqual(['Kruk', 'Diablik', 'Kowal', 'Iskra', 'Strażnik']);

    // Miecz: Interfejs 4 + ATK 1 + 8 = 13 przeciw OBR 2 + 3 = 5; 3k6 = 18 ≥ REZ 15.
    scriptDice([8, 3, 6, 6, 6]);
    const ice = window.locator('.net-ice', { hasText: 'Kruk' });
    await ice.locator('select').first().selectOption({ label: 'Miecz — 3k6' });
    await ice.getByRole('button', { name: 'Atakuj' }).click();
    // Stan runu w bazie od razu, okno Oli po animacji kości wymiany.
    await expect.poll(() => iceOf('Kruk')?.mode).toBe('derezzed');
    expect(pendingDice()).toBe('');
    expect(iceOf('Kruk')?.rezCurrent).toBe(0);
    await expect(ice).toHaveClass(/net-ice--down/, { timeout: 30_000 });
    // Zderezowany Kruk schodzi z kolejki u wszystkich.
    for (const actor of [mg, marek, ola]) {
      await expect
        .poll(() => queueOf(actor), { timeout: 30_000, message: actor.name })
        .toEqual(['Diablik', 'Kowal', 'Iskra', 'Strażnik']);
    }

    // „Miecz trafia…” (etap 55b) stoi w kanale nad listą pięter.
    await closeNotices(ola.page);
    await floors.nth(3).locator('.net-run-floor-body').click();
    await expect.poll(() => runOf('Iskra')?.state.position.floor).toBe(3);
    olaEntered('pietro-wezla');

    // 5.5 Kontrola: Interfejs 4 + 9 = 13 > PT 10 węzła, który Demon trzyma od startu.
    // Węzeł jest już „użyty w tej Turze” (Demon strzelał z wieżyczki), ale przejęcie
    // nie jest obsługą urządzenia.
    const node = trunk()[3]!;
    scriptDice([9]);
    const beforeControl = lastMessageId();
    await window.locator('.net-abilities').getByRole('button', { name: 'Kontrola' }).click();
    await expect.poll(controlledFloors).toEqual([node.id]);
    expect(pendingDice()).toBe('');
    test
      .info()
      .annotations.push(
        { type: 'Kontrola', description: JSON.stringify(chatSince(beforeControl)) },
        { type: 'tura Iskry', description: combatantOf('Iskra').turnState ?? '' },
      );
    await expect(floors.nth(3)).toContainText('przejęty', { timeout: 30_000 });
    const turn = JSON.parse(combatantOf('Iskra').turnState!) as {
      action: { net?: { count: number; max: number } };
    };
    expect(turn.action.net).toMatchObject({ count: 2, max: 3 });
    for (const player of [marek, ola]) await expectClean(player, secretsFor(player));
    await endPlayerTurn(ola);
  });

  test('5.6 @llm tura Strażnika: gateway pada w trakcie generowania, bot niedostępny, nic nie wisi', async () => {
    await requireGateway();
    expect(activeLabel()).toBe('Strażnik');
    const page = mg.page;
    const since = lastMessageId();
    const proposals = page.locator('.chat-message.chat-proposal');
    const seenProposals = await proposals.count();
    const clicked = Date.now();
    const play = page
      .getByRole('group', { name: 'Kolejka inicjatywy' })
      .getByRole('button', { name: /Graj turę|Bot myśli/ });
    await play.click();
    // Pytanie o turę poszło do modelu — dopiero wtedy gateway „pada”.
    // Tnie od razu: 27B oddaje pierwszy krok tury w 2–3 s.
    await expect
      .poll(() => proxy.chatSince(clicked), {
        timeout: 60_000,
        intervals: [50],
        message: 'POST /chat',
      })
      .not.toBeNull();
    await proxy.cut();
    expect(await proposals.count(), 'bot jeszcze nic nie zaproponował').toBe(seenProposals);
    const cutAt = Date.now();

    // Przycisk wraca (tura się skończyła, nie wisi), a MG widzi boty offline.
    await expect(play).toHaveText('🤖 Graj turę', { timeout: 60_000 });
    await expect
      .poll(
        async () => (await mg.store<{ status: { available: boolean } }>('ai'))?.status.available,
        { timeout: 30_000 },
      )
      .toBe(false);
    const notes = async (actor: Actor) =>
      ((await actor.store<{ items: { type: string; text?: string }[] }>('chat'))?.items ?? [])
        .filter((item) => item.type === 'note')
        .map((item) => item.text ?? '');
    botTurnNotes = (await notes(mg)).slice(-1);
    test
      .info()
      .annotations.push(
        { type: 'czas do zerwania', description: `${Math.round((cutAt - clicked) / 1000)} s` },
        { type: 'notatki MG', description: JSON.stringify((await notes(mg)).slice(-4)) },
        { type: 'czat po zerwaniu', description: JSON.stringify(chatSince(since)) },
        { type: 'tura Strażnika', description: combatantOf('Strażnik').turnState ?? '' },
      );
    expect(await proposals.count(), 'żadnej propozycji po padzie').toBe(seenProposals);
    expect(activeLabel(), 'tura dalej u Strażnika').toBe('Strażnik');

    // Drugie „Graj turę” przy martwym gatewayu: od razu odmowa, bez zawieszenia.
    const before = (await notes(mg)).length;
    await play.click();
    await expect
      .poll(async () => (await notes(mg)).length, { timeout: 15_000 })
      .toBeGreaterThan(before);
    const refusal = (await notes(mg)).slice(before);
    botTurnNotes.push(...refusal);
    test
      .info()
      .annotations.push({ type: 'drugie „Graj turę”', description: JSON.stringify(refusal) });
    await expect(play).toHaveText('🤖 Graj turę');
    // Gracze nie dostają nic z pada gatewaya poza tym, co stół i tak widzi.
    for (const player of [marek, ola]) await expectClean(player, secretsFor(player));
  });

  test('#35 pad gatewaya w turze bota: MG dostaje zdanie, a nie kod błędu', async () => {
    // Zerwany strumień SSE rzuca `TypeError: terminated` w `ai/gateway.ts` (pętla
    // `parseSse` bez `try`) — gniazdo odpowiada `INTERNAL`; drugie „Graj turę”
    // przy martwym gatewayu — `AI_UNAVAILABLE`. Oba lądują w notce jako kody.
    test.info().annotations.push({ type: 'notatki', description: JSON.stringify(botTurnNotes) });
    expect(botTurnNotes.length).toBeGreaterThan(0);
    for (const note of botTurnNotes) expect(note).not.toMatch(/\((INTERNAL|AI_[A-Z_]+)\)/);
  });

  test('5.6 MG gra Strażnikiem ręką: strzał w Kowala na podłodze elektrycznej, pudło', async () => {
    test.setTimeout(3 * 60_000);
    // Strażnik zostaje przy budce — Iskra widzi go przez otwartą bramę, a lista
    // celów wieżyczki to figury widoczne dla netrunnerki (T5b, runda 2).
    // 6 + 5 + 2 = 13 przeciw PT 13 (Kowal 4 m dalej) — pudło.
    scriptDice([2]);
    const before = lastMessageId();
    await mg.page.getByRole('button', { name: 'Czat', exact: true }).click();
    await aimAs(mg, 'Strażnik', tokenCentre(token('Kowal'), cell), true);
    const title = 'Ciężki pistolet → Kowal';
    const shotId = await rollAndWait(mg, before, title);
    const shot = rollById(shotId);
    test.info().annotations.push({ type: 'strzał Strażnika', description: JSON.stringify(shot) });
    expect(pendingDice()).toBe('');
    expect(shot.actor).toBe('Strażnik');
    expect(shot.attack?.hit).toBe(false);
    await nextTurn(mg);
    expect(combatRow()?.round).toBe(2);
    expect(activeLabel()).toBe('Diablik');
  });

  test('runda 2, tura Demona: Test Kontroli nieudany — węzeł zostaje u Oli, Paf pudłuje', async () => {
    const since = lastMessageId();
    const iskraHp = hp('Iskra');
    // Odebranie węzła: Demon 3 + 2 = 5 przeciw PT 13 z Kontroli Oli — nieudane.
    // Węzła nie trzyma, więc nie strzela; Paf 3 + 2 = 5 przeciw 4 + 9 — pudło.
    scriptDice([2, 2, 9]);
    await runWindow(mg).getByRole('button', { name: 'Tura Demona' }).click();
    await expect
      .poll(() => messageAfter(since, 'Tura Demona', 'action')?.id ?? 0, { timeout: 20_000 })
      .toBeGreaterThan(0);
    const note = JSON.parse(messageAfter(since, 'Tura Demona', 'action')!.payload!) as {
      note: string;
    };
    test.info().annotations.push({ type: 'Tura Demona', description: note.note });
    expect(pendingDice()).toBe('');
    expect(note.note).toContain('Test Kontroli nieudany');
    expect(note.note).toContain('Paf chybia');
    expect(controlledFloors()).toEqual([trunk()[3]!.id]);
    expect(hp('Iskra')).toBe(iskraHp);
    await nextTurn(mg);
    expect(activeLabel()).toBe('Kowal');
  });

  test('5.9 runda 2, tura Kowala: schodzi z podłogi i ładuje amunicję przeciwpancerną (Akcja)', async () => {
    await clientsSeeTurn(marek);
    const kowalHp = hp('Kowal');
    // Jedno pole (2 m) — „Ciało obce” liczy się dopiero od 4 m.
    await walk(marek, 'Kowal', 18, 11);
    const sheetOf = () =>
      sheet<{ weapons: { name: string; ammoId?: string; ammoCurrent: number; ammoMax: number }[] }>(
        'Kowal',
      ).weapons.find((w) => w.name === 'Bardzo ciężki pistolet')!;
    expect(sheetOf().ammoCurrent).toBe(7);
    // Etap 46c: naboje z pudełek. Zmiana rodzaju oddaje 7 zwykłych do zapasu,
    // a magazynek (8) ładuje się z 20 przeciwpancernych od MG (T5a).
    const stock = (ammoId: string | null) =>
      sheet<{ gear: { qty?: number; ammo?: { ammoId: string | null; calibre: string } }[] }>(
        'Kowal',
      )
        .gear.filter((row) => row.ammo?.calibre === 'B.C. Pistolet' && row.ammo.ammoId === ammoId)
        .reduce((sum, row) => sum + (row.qty ?? 0), 0);
    const ordinary = stock(null);
    expect(stock('ammo.armour-piercing')).toBe(20);
    const card = await openSheet(marek, 'Kowal');
    await card.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    const picker = card.getByLabel('Rodzaj naboju: Bardzo ciężki pistolet');
    await expect(
      picker.locator('option', { hasText: 'Amunicja przeciwpancerna — 20' }),
    ).toHaveCount(1);
    await picker.selectOption('ammo.armour-piercing');
    await expect.poll(() => sheetOf().ammoId).toBe('ammo.armour-piercing');
    expect(sheetOf().ammoCurrent).toBe(sheetOf().ammoMax);
    expect(stock('ammo.armour-piercing')).toBe(20 - sheetOf().ammoMax);
    expect(stock(null)).toBe(ordinary + 7);
    await closeSheet(marek.page);
    const turn = JSON.parse(combatantOf('Kowal').turnState!) as {
      action: { id: string } | null;
      metresWalked: number;
    };
    test.info().annotations.push({ type: 'tura Kowala', description: JSON.stringify(turn) });
    expect(turn.action?.id, 'przeładowanie kosztuje Akcję').toBeTruthy();
    const beforeEnd = lastMessageId();
    await endPlayerTurn(marek);
    await marek.page.waitForTimeout(1_000);
    // Zszedł z podłogi i szedł 2 m: ani 6k6, ani „Ciała obcego”.
    expect(chatSince(beforeEnd).filter((row) => row.startsWith('damage'))).toEqual([]);
    expect(hp('Kowal')).toBe(kowalHp);
  });

  test('5.8 runda 2, tura Oli: F5 w Sieci — ten sam run, węzeł, kolejka i tura', async () => {
    test.setTimeout(2 * 60_000);
    expect(activeLabel()).toBe('Iskra');
    await clientsSeeTurn(ola);
    const since = await ola.sniffer.mark();
    const turnBefore = combatantOf('Iskra').turnState;
    await ola.page.reload();
    await expect(runWindow(ola)).toBeVisible({ timeout: 30_000 });
    await expect(runWindow(ola).locator('.net-run-floor').nth(3)).toHaveClass(
      /net-run-floor--here/,
    );
    await expect(runWindow(ola).locator('.net-run-floor').nth(3)).toContainText('przejęty');
    await expect
      .poll(() => queueOf(ola), { timeout: 30_000 })
      .toEqual(['Diablik', 'Kowal', 'Iskra', 'Strażnik']);
    await clientsSeeTurn(ola);
    expect(combatantOf('Iskra').turnState).toBe(turnBefore);
    // Okno wraca tam, gdzie Ola je zostawiła (pamięć położenia, 27f).
    const box = (await runWindow(ola).boundingBox())!;
    test.info().annotations.push({ type: 'okno runu po F5', description: JSON.stringify(box) });
    if (box.y < 112) await tuckRunWindow(ola);
    // Pełny stan po F5 idzie inną drogą niż przyrosty — te same kanarki.
    await expectClean(ola, secretsFor(ola), since);
  });

  test('5.5 runda 2, tura Oli: strzał wieżyczką w Strażnika (Umiejętności netrunnerki)', async () => {
    test.setTimeout(3 * 60_000);
    // Strzał wieżyczką: Umiejętności Oli, cel z listy figur, które widzi.
    const devices = runWindow(ola).locator('.net-node-devices');
    await devices.getByLabel('Cel strzału').selectOption({ label: 'Strażnik' });
    const beforeShot = lastMessageId();
    scriptDice([10, 9]);
    await devices.getByRole('button', { name: 'Strzelaj' }).click();
    const title = 'Bardzo ciężki pistolet → Strażnik';
    await expect
      .poll(() => messageAfter(beforeShot, title)?.id ?? 0, { timeout: 20_000 })
      .toBeGreaterThan(0);
    const shot = rollById(messageAfter(beforeShot, title)!.id);
    test
      .info()
      .annotations.push(
        { type: 'strzał wieżyczki Oli', description: JSON.stringify(shot) },
        { type: 'czat strzału', description: JSON.stringify(chatSince(beforeShot)) },
        { type: 'kości', description: pendingDice() },
      );
    expect(shot.attack?.hit).toBe(true);
    // Kto rzuca obrażenia za wieżyczkę netrunnerki — kubek Oli czy MG? Od 14.10 kubek
    // prowadzącego strzelca woła sam, a MG ma na karcie „Na kubek”.
    await mg.page.getByRole('button', { name: 'Czat', exact: true }).click();
    const damageTitle = 'Bardzo ciężki pistolet — obrażenia';
    const seen = await chatCards(mg.page, damageTitle).count();
    // 4k6 = 22 (dwie szóstki: rana krytyczna, 2k6 tabeli = 7), OB 11.
    await noDodge(mg, messageAfter(beforeShot, title)!.id, title);
    const mgButton = () =>
      chatCards(mg.page, title).last().getByRole('button', { name: 'Na kubek' }).count();
    await expect.poll(mgButton, { timeout: 30_000 }).toBeGreaterThan(0);
    // Karta dochodzi do Oli po animacji jej własnych kości — czekamy jak na MG.
    await expect
      .poll(() => cupHoldsDamage(ola.page), { timeout: 30_000 })
      .toBe(true)
      .catch(() => undefined);
    olaTurretDamageButton = (await cupHoldsDamage(ola.page)) ? 1 : 0;
    test.info().annotations.push({
      type: 'kubek obrażeń za wieżyczkę',
      description: `MG „Na kubek”: ${await mgButton()}, kubek Oli: ${olaTurretDamageButton}, kubek Marka: ${await cupHoldsDamage(marek.page)}`,
    });
    const roller = olaTurretDamageButton > 0 ? ola : mg;
    scriptDice([6, 6, 5, 5, 3, 4]);
    const beforeDamage = lastMessageId();
    await damageToCup(roller.page, title);
    await rollAndWait(roller, beforeDamage, damageTitle);
    // Obrażenia rozliczają się same na „Strażnik” (decyzja MG z 03.10), bez „Zastosuj”.
    await freshCard(mg.page, damageTitle, seen);
    await expect
      .poll(() => messageAfter(beforeDamage, 'Strażnik', 'damage')?.id ?? 0)
      .toBeGreaterThan(0);
    const applied = JSON.parse(messageAfter(beforeDamage, 'Strażnik', 'damage')!.payload!);
    test
      .info()
      .annotations.push(
        { type: 'obrażenia Strażnika', description: JSON.stringify(applied) },
        { type: 'kości po obrażeniach', description: pendingDice() },
        { type: 'PW Strażnika', description: String(hp('Strażnik')) },
      );
    await endPlayerTurn(ola);
    expect(activeLabel()).toBe('Strażnik');
  });

  test('#38 netrunnerka rzuca obrażenia za strzał wieżyczki, którą prowadzi', async () => {
    // Strzelec karty to żeton wieżyczki (bez właściciela, #23/#27); prowadzi go Ola
    // (`operatorUserId`), więc to jej kubek ma wołać o obrażenia, nie kubek MG.
    expect(olaTurretDamageButton).toBeGreaterThan(0);
  });

  test('runda 2, Strażnik ręką MG czeka; runda 3, Demon znów nie odbiera węzła', async () => {
    expect(activeLabel()).toBe('Strażnik');
    await nextTurn(mg);
    expect(combatRow()?.round).toBe(3);
    expect(activeLabel()).toBe('Diablik');
    const since = lastMessageId();
    scriptDice([2, 2, 9]);
    await runWindow(mg).getByRole('button', { name: 'Tura Demona' }).click();
    await expect
      .poll(() => messageAfter(since, 'Tura Demona', 'action')?.id ?? 0, { timeout: 20_000 })
      .toBeGreaterThan(0);
    expect(pendingDice()).toBe('');
    expect(controlledFloors()).toEqual([trunk()[3]!.id]);
    await nextTurn(mg);
    expect(activeLabel()).toBe('Kowal');
  });

  test('5.9 runda 3, tura Kowala: strzał przeciwpancerny kładzie Strażnika', async () => {
    test.setTimeout(3 * 60_000);
    await clientsSeeTurn(marek);
    const title = 'Bardzo ciężki pistolet → Strażnik';
    const before = lastMessageId();
    await marek.page.getByRole('button', { name: 'Czat', exact: true }).click();
    await aimAs(marek, 'Kowal', tokenCentre(token('Strażnik'), cell));
    // Cechy Kowala losuje kreator T3a — kość dobiera się do modyfikatora z kubka,
    // żeby suma przekroczyła PT 13 (do 6 m), bez dziesiątki.
    const cup = await marek.store<{ attack: { modifierTotal: number } | null }>('roll');
    const face = Math.min(9, Math.max(2, 14 - (cup?.attack?.modifierTotal ?? 0)));
    scriptDice([face]);
    const shotId = await rollAndWait(marek, before, title);
    const shot = rollById(shotId);
    test.info().annotations.push({ type: 'strzał Kowala', description: JSON.stringify(shot) });
    expect(shot.attack?.hit).toBe(true);

    // 4k6 = 24 przeciwpancerną (dwie szóstki: rana, 2k6 tabeli = 7), OB korpusu 10.
    const damageTitle = 'Bardzo ciężki pistolet — obrażenia';
    const seen = await chatCards(mg.page, damageTitle).count();
    await noDodge(mg, shotId, title);
    scriptDice([6, 6, 6, 6, 3, 4]);
    const beforeDamage = lastMessageId();
    await damageToCup(marek.page, title);
    await rollAndWait(marek, beforeDamage, damageTitle);
    // Obrażenia rozliczają się same na „Strażnik” (decyzja MG z 03.10), bez „Zastosuj”.
    await freshCard(mg.page, damageTitle, seen);
    await expect
      .poll(() => messageAfter(beforeDamage, 'Strażnik', 'damage')?.id ?? 0)
      .toBeGreaterThan(0);
    const applied = JSON.parse(messageAfter(beforeDamage, 'Strażnik', 'damage')!.payload!) as {
      armor?: { before: number; after: number };
      hpLost: number;
    };
    test
      .info()
      .annotations.push(
        { type: 'obrażenia przeciwpancerne', description: JSON.stringify(applied) },
        { type: 'kości', description: pendingDice() },
        { type: 'statusy Strażnika', description: JSON.stringify(statusesOf('Strażnik')) },
      );
    expect(pendingDice()).toBe('');
    // Przeciwpancerna zdziera pancerz o 2, nie o 1 (s. 346).
    expect(applied.armor).toMatchObject({ before: 10, after: 8 });
    expect(hp('Strażnik')).toBeLessThanOrEqual(0);
    const ammo = sheet<{ weapons: { name: string; ammoCurrent: number; ammoMax: number }[] }>(
      'Kowal',
    ).weapons.find((w) => w.name === 'Bardzo ciężki pistolet')!;
    expect(ammo.ammoCurrent).toBe(ammo.ammoMax - 1);
    await endPlayerTurn(marek);
  });

  test('5.5 runda 3, tura Oli: wyłącza wieżyczkę — strefa ostrzału rozbrojona przez węzeł', async () => {
    expect(activeLabel()).toBe('Iskra');
    await clientsSeeTurn(ola);
    const devices = runWindow(ola).locator('.net-node-devices');
    await devices.getByRole('button', { name: 'Wyłącz' }).click();
    const device = trunk()[3]!.devices![0]!;
    await expect
      .poll(() => {
        const runtime = JSON.parse(architecture(architectureName()).runtime || '{}') as {
          devices?: { deviceId?: string; id?: string; on?: boolean }[];
        };
        return (runtime.devices ?? []).find((d) => (d.deviceId ?? d.id) === device.id)?.on;
      })
      .toBe(false);
    await expect(devices).toContainText('wyłączone', { timeout: 30_000 });
    // Od 17.10 Test Przeżywalności Strażnika rzuca serwer na starcie jego tury —
    // kość skryptuje się przed przejściem tury. Rzut niski: przeżywa.
    scriptDice([2]);
    beforeGuardTurn = lastMessageId();
    await endPlayerTurn(ola);
  });

  test('5.9 tura Strażnika: Test Przeżywalności rzuca serwer na starcie tury, MG kończy walkę', async () => {
    expect(activeLabel()).toBe('Strażnik');
    // Od 17.10 NPC nie czeka na MG: serwer rzuca za niego, więc przycisku Testu
    // nie ma nikt. Strażnik to figura bota — rzut jawny, nie dla MG.
    for (const actor of [mg, marek, ola]) {
      await expect(actor.page.locator('.combat-bar-death-save'), actor.name).toHaveCount(0);
    }
    await expect
      .poll(() => messageAfter(beforeGuardTurn, 'Test Przeżywalności')?.id ?? 0, {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
    expect(pendingDice()).toBe('');
    const save = rollById(messageAfter(beforeGuardTurn, 'Test Przeżywalności')!.id);
    test.info().annotations.push({
      type: 'Test Przeżywalności Strażnika',
      description: JSON.stringify(save.outcome),
    });
    expect(save.outcome?.success).toBe(true);
    expect(statusesOf('Strażnik')).not.toContain('dead');

    // „✕” pyta paskiem w kanale komunikatów — „Tak, wyłącz”.
    await mg.page.getByRole('button', { name: 'Wyłącz tryb turowy' }).click();
    await mg.page.getByRole('button', { name: 'Tak, wyłącz' }).click();
    await expect.poll(() => combatRow() ?? null).toBeNull();
    for (const player of [marek, ola]) {
      await expect(
        player.page.getByRole('group', { name: 'Kolejka inicjatywy' }),
        player.name,
      ).toHaveCount(0);
    }
    expect(combatants()).toEqual([]);
  });

  test('po walce: Kowal wchodzi w strefę wyłączonej wieżyczki — nic nie strzela (most węzła, #33)', async () => {
    test.setTimeout(2 * 60_000);
    const since = lastMessageId();
    await walk(marek, 'Kowal', 25, 11);
    await marek.page.waitForTimeout(2_000);
    test.info().annotations.push({ type: 'czat', description: JSON.stringify(chatSince(since)) });
    expect(messageAfter(since, 'Bardzo ciężki pistolet → Kowal')).toBeUndefined();
    expect(messageAfter(since, 'Wejście na broniony obszar', 'action')).toBeUndefined();
    // Strefa dalej „uzbrojona” w bazie — rozbraja ją urządzenie węzła, nie ręka MG.
    expect(
      zonesOn(sceneRow().id).find((z) => z.entryId === 'defense.automatyczna-wiezyczka')?.armed,
    ).toBe(1);
  });

  test('#36 klik w środek pola przed figurą rusza ją, a nie łapie uchwytu obrotu', async () => {
    // Grot (uchwyt obrotu, 27j/26.09) sięga do środka sąsiedniego pola w kierunku
    // patrzenia: klik tam zaczyna obrót o 0°, marsz nie rusza i nic o tym nie mówi.
    const page = marek.page;
    const start = at('Kowal');
    const facing = token('Kowal') as unknown as { facing: number | null };
    const angle = (((facing.facing ?? 0) - 90) * Math.PI) / 180;
    const centre = tokenCentre(token('Kowal'), cell);
    await page.keyboard.press('Escape');
    await clickOnMap(page, centre);
    await page.waitForTimeout(400);
    await walkOnMap(page, {
      x: centre.x + Math.cos(angle) * cell,
      y: centre.y + Math.sin(angle) * cell,
    });
    await page.waitForTimeout(3_000);
    await page.keyboard.press('Escape');
    test.info().annotations.push({
      type: 'klik przed figurą',
      description: `patrzy ${facing.facing}°, przed ${JSON.stringify(start)}, po ${JSON.stringify(at('Kowal'))}`,
    });
    expect(at('Kowal')).not.toEqual(start);
  });

  test('#37 opis piętra węzła nie dociera do gracza spoza runu (dziennik Tury Demona i węzła)', async () => {
    // `logNetLine` pisze do wszystkich wiersz „Tura Demona” z etykietą piętra
    // („Węzeł: … — Test Kontroli nieudany”) i „Węzeł kontrolny: …” po strzale Oli.
    const code = codes.get('pietro-wezla')!;
    const leaked = await marek.sniffer.found([code]);
    if (leaked.length > 0) {
      test.info().annotations.push({
        type: 'wyciek u Marek',
        description: `${code} … ${await marek.sniffer.evidence(code, 0, 300)}`,
      });
    }
    expect(leaked).toEqual([]);
  });

  test('5.10 @llm gateway wraca: boty dostępne bez restartu serwera, Strażnik odpowiada po polsku', async () => {
    await requireGateway();
    await proxy.restore();
    await expect
      .poll(
        async () => (await mg.store<{ status: { available: boolean } }>('ai'))?.status.available,
        { timeout: 30_000 },
      )
      .toBe(true);
    const botId = queryOne<{ id: string }>(`SELECT id FROM BotProfile WHERE name = 'Strażnik'`)!.id;
    const started = Date.now();
    await say(marek, 'Strażnik, ile jeszcze zostało do końca twojej zmiany?');
    await expect
      .poll(
        () =>
          queryOne<{ text: string }>(
            'SELECT text FROM ChatMessage WHERE botId = ? ORDER BY id DESC',
            botId,
          )?.text ?? '',
        { timeout: LLM_TIMEOUT_MS, intervals: [2_000] },
      )
      .not.toBe('');
    const reply = queryOne<{ text: string }>(
      'SELECT text FROM ChatMessage WHERE botId = ? ORDER BY id DESC',
      botId,
    )!.text;
    test
      .info()
      .annotations.push(
        { type: 'odpowiedź Strażnika', description: reply },
        { type: 'czas odpowiedzi', description: `${Math.round((Date.now() - started) / 1000)} s` },
      );
    expect(reply.length).toBeGreaterThan(20);
    expect(reply).toMatch(/[ąćęłńóśźż]/i);
    expect(reply).not.toMatch(/KANAREK/);
  });

  test('5.11 kanarki po T5b: nic tajnego u graczy, konsola bez błędów', async () => {
    for (const player of [marek, ola]) await expectClean(player, secretsFor(player));
    for (const actor of [mg, marek, ola]) {
      test.info().annotations.push({
        type: `konsola ${actor.name}`,
        description: JSON.stringify(actor.unexpectedErrors()),
      });
    }
    for (const actor of [mg, marek, ola]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
  });

  test('5.11 punkt kontrolny po-T5: kopia i odtworzenie po walce drugiej', async () => {
    const before = stateFingerprint();
    saveCheckpoint('po-T5');
    expect(hasCheckpoint('po-T5')).toBe(true);
    await restoreCheckpoint('po-T5');
    // Instancja wraca na zwykły gateway — pośrednik był tylko dla tego pliku.
    await startInstance();
    proxied = false;
    expect(stateFingerprint()).toEqual(before);
  });
});
