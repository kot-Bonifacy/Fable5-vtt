import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { dragWorld, type WorldPoint } from '../../fixtures/canvas.ts';
import { query, queryOne, stateFingerprint } from '../../fixtures/db.ts';
import {
  architecture,
  createBot,
  drawZone,
  figureOf,
  openSceneEditor,
  openZoneCard,
  placeStatist,
  revealFog,
  runOf,
  sceneByName,
  sceneListRow,
  tokenOn,
  tokensOn,
  visibleTokenIds,
  zonesOn,
} from '../../fixtures/brama.ts';
import { BRAMA } from '../../fixtures/maps.ts';
import { canariesInDatabase, ONLY_FROM } from '../../fixtures/nocna-zmiana.ts';
import { clickOnMap, fitCamera, tokenCentre } from '../../fixtures/scene.ts';
import { Canaries } from '../../fixtures/sniffer.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { createInvitation } from '../../fixtures/table.ts';
import {
  closeSheet,
  expectClean,
  lastMessageId,
  messageAfter,
  openSheet,
} from '../../fixtures/walka.ts';
import {
  hasCheckpoint,
  pendingDice,
  restoreCheckpoint,
  saveCheckpoint,
  scriptDice,
  startInstance,
} from '../../instance/instance.ts';

/**
 * T5a (`testy.md` 5.3, przygotowanie i kroki 5.1–5.3): od punktu `po-T4`
 * (walka w „Knajpie” skończona) MG przygotowuje „Bramę” — architekturę Sieci,
 * wieżyczkę z węzłem, strefy bronione, Strażnika z botem i amunicję Kowala —
 * aktywuje scenę, Marek wchodzi przez bramę, a Ola znajduje gniazdo Skanerem,
 * podłącza się, łamie hasło i rozpoznaje Plik. Walka druga to T5b od `po-T5a`.
 *
 * Decyzje MG z 27.09 (sesja T5a): architektura Hasło → Plik → Czarny LOD →
 * Węzeł kontrolny wieżyczki, na dnie Demon, który trzyma węzeł; nowy statysta
 * „Strażnik” z nowym botem; wieżyczka strzela sama na wejście w swoją strefę;
 * Kowal wchodzi ranny, MG daje mu amunicję przeciwpancerną.
 *
 * Kości: skrypt tam, gdzie wynik wybiera drogę (Skaner, Backdoor, Ajdi).
 */

type Sheet = { ammoStock: string };

const ARCHITECTURE = 'Ochrona bramy';

test.describe.serial('T5a: „Brama” — przygotowanie, wejście przez bramę, run Oli', () => {
  let mg: Actor;
  let marek: Actor;
  let ola: Actor;
  let bramaId: string;
  let knajpaId: string;
  let cell: number;
  /** Tajne przed obojgiem graczy. */
  const fromPlayers = new Canaries();
  /** Tajne przed Markiem (szept i handout Oli, notatka Pliku po Ajdi). */
  const fromMarek = new Canaries();
  /** Tajne przed Olą (szept MG do Marka, notatka Kowala). */
  const fromOla = new Canaries();
  const secretsFor = (player: Actor) => [
    ...fromPlayers.secretNow,
    ...(player === marek ? fromMarek : fromOla).secretNow,
  ];
  /** Nazwa architektury z kanarkiem — gracz widzi w oknie runu „SIEĆ”. */
  let architectureName = '';
  let fileNote = '';
  /** Odcisk „Knajpy” sprzed aktywacji „Bramy” (5.1: stan zachowany w bazie). */
  let knajpaBefore = '';

  const knajpaState = () =>
    JSON.stringify([
      query(
        'SELECT id, name, x, y, hidden, statuses FROM Token WHERE sceneId = ? ORDER BY id',
        knajpaId,
      ),
      query('SELECT id, open, locked FROM Wall WHERE sceneId = ? ORDER BY id', knajpaId),
      query('SELECT id, x, y FROM Cover WHERE sceneId = ? ORDER BY id', knajpaId),
    ]);
  const point = (column: number, row: number): WorldPoint => ({
    x: (column + 0.5) * cell,
    y: (row + 0.5) * cell,
  });
  const kowal = () => figureOf(bramaId, 'Kowal')!;
  const iskra = () => figureOf(bramaId, 'Iskra')!;
  const accessPoint = () =>
    queryOne<{
      id: string;
      name: string;
      hidden: number;
      architectureId: string | null;
      notes: string;
    }>(
      'SELECT id, name, hidden, architectureId, notes FROM NetAccessPoint WHERE sceneId = ?',
      bramaId,
    )!;
  const gateRow = () =>
    queryOne<{
      id: number;
      open: number;
      playerToggle: number;
      x1: number;
      x2: number;
      y1: number;
    }>(
      `SELECT id, open, playerToggle, x1, x2, y1 FROM Wall WHERE sceneId = ? AND kind = 'gate'`,
      bramaId,
    )!;
  const gateOpen = () => gateRow().open;
  /** Okno runu w kliencie (gracz widzi w nagłówku „SIEĆ”). */
  const runWindow = (actor: Actor) => actor.page.locator('.net-run-window');

  /** Marsz własną figurą: zaznaczenie, klik w pole, czekanie na bazę. */
  async function walk(
    actor: Actor,
    figure: () => { x: number; y: number; size: number },
    column: number,
    row: number,
  ) {
    const page = actor.page;
    await page.keyboard.press('Escape');
    await clickOnMap(page, tokenCentre(figure(), cell));
    await page.waitForTimeout(300);
    await clickOnMap(page, point(column, row));
    await expect
      .poll(() => [Math.round(figure().x / cell), Math.round(figure().y / cell)], {
        timeout: 30_000,
        message: `${actor.name} → ${column},${row}`,
      })
      .toEqual([column, row]);
    await page.keyboard.press('Escape');
  }

  test.beforeAll(() => {
    // Pełny przebieg idzie tu wprost po T4b; osobno — `E2E_FROM=po-T4`.
    const knajpa = queryOne<{ id: string; active: number }>(
      `SELECT id, active FROM Scene WHERE name = 'Knajpa'`,
    );
    const combat = knajpa
      ? queryOne<{ id: string }>('SELECT id FROM Combat WHERE sceneId = ?', knajpa.id)
      : null;
    if (!knajpa?.active || combat) {
      throw new Error('E2E: T5a needs the po-T4 state (E2E_FROM=po-T4)');
    }
    knajpaId = knajpa.id;
    bramaId = sceneByName('Brama').id;
    cell = sceneByName('Brama').gridSizePx;
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('start z po-T4: walka w „Knajpie” skończona, „Brama” czeka na MG', async ({ cast }) => {
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
    }
    for (const [code, label] of canariesInDatabase()) {
      // Łup Zbira leży od T4b na karcie Kowala — tajny już tylko przed Olą.
      const onlyFrom = label === 'lup-Zbira' ? 'Ola' : ONLY_FROM[label];
      (onlyFrom === 'Marek' ? fromMarek : onlyFrom === 'Ola' ? fromOla : fromPlayers).track(code);
    }
    // Brama z T3b: gniazdo ukryte i martwe, żadnej architektury ani figur.
    fromPlayers.track(bramaId);
    expect(accessPoint()).toMatchObject({ hidden: 1, architectureId: null });
    expect(query('SELECT id FROM NetArchitecture')).toEqual([]);
    expect(tokensOn(bramaId)).toEqual([]);
    expect(sceneByName('Brama').visibility).toBe('fog');
    knajpaBefore = knajpaState();
  });

  test('przygotowanie: MG ogląda „Bramę”, stawia wieżyczkę i Strażnika', async () => {
    test.setTimeout(4 * 60_000);
    const page = mg.page;
    await page.getByRole('button', { name: 'Sceny', exact: true }).click();
    await sceneListRow(page, 'Brama').getByRole('button', { name: 'Pokaż' }).click();
    await expect
      .poll(async () => (await mg.store<{ scene: { id: string } | null }>('scene'))?.scene?.id)
      .toBe(bramaId);
    await fitCamera(page, BRAMA.width, BRAMA.height);

    // Wieżyczka = figura z profilem statysty (26d); stanowisko nie unika (s. 214).
    const turret = await placeStatist(
      page,
      bramaId,
      'avatary/avatar21.png',
      BRAMA.turret,
      'Wieżyczka',
      {
        ref: 8,
        skill: 6,
        dodge: 0,
        armor: 0,
        weapon: 'Bardzo ciężki pistolet',
      },
    );
    const guard = await placeStatist(
      page,
      bramaId,
      'avatary/avatar20.png',
      BRAMA.guard,
      'Strażnik',
      { ref: 6, skill: 5, dodge: 4, armor: 11, weapon: 'Ciężki pistolet' },
      30,
    );
    fromPlayers.track(turret.id);
    fromPlayers.track(guard.id);
    // Obie figury mają własną kartę NPC bez właściciela.
    for (const figure of [turret, guard]) {
      expect(
        queryOne<{ ownerId: string | null }>(
          'SELECT ownerId FROM Character WHERE id = ?',
          figure.characterId!,
        )?.ownerId,
      ).toBeNull();
    }
  });

  test('przygotowanie: architektura w edytorze — hasło, Plik, Czarny LOD, węzeł wieżyczki, Demon', async () => {
    test.setTimeout(4 * 60_000);
    const page = mg.page;
    await page.getByRole('button', { name: 'Sieć', exact: true }).click();
    await page.getByRole('button', { name: '+ Nowa' }).click();
    const editor = page.locator('.net-window');
    await expect(editor).toBeVisible();
    architectureName = `${ARCHITECTURE} ${fromPlayers.secret('nazwa-architektury')}`;
    await editor.getByTitle('Nazwa architektury').fill(architectureName);

    const trunk = editor.locator('.net-branch').first();
    for (let i = 0; i < 5; i += 1) await trunk.getByRole('button', { name: '+ Piętro' }).click();
    const floors = trunk.locator('.net-floor');
    await expect(floors).toHaveCount(5);

    /** Rodzaj, opis dla stołu, PT i notatka MG jednego piętra. */
    async function floor(index: number, kind: string, label: string, dv?: number, notes?: string) {
      const row = floors.nth(index);
      await row.locator('.net-floor-kind').selectOption({ label: kind });
      await row.locator('.net-floor-label').fill(label);
      if (dv !== undefined) await row.locator('.net-floor-dv input').fill(String(dv));
      if (notes) await row.locator('input.net-floor-notes').fill(notes);
      return row;
    }
    await floor(
      0,
      'Hasło',
      'Hasło: szlaban',
      8,
      `Hasło to „brama-7”. ${fromPlayers.secret('notatka-hasla')}`,
    );
    fileNote = fromPlayers.secret('notatka-pliku');
    await floor(1, 'Plik', 'Plik: grafik zmian', 6, `Zmiana warty o 3:00. ${fileNote}`);
    const ice = await floor(2, 'Czarny LOD', `Czarny LOD ${fromPlayers.secret('pietro-LOD')}`);
    await ice.locator('.net-program-picker').selectOption({ label: 'Kruk' });
    const node = await floor(
      3,
      'Węzeł kontrolny',
      `Węzeł: wieżyczka ${fromPlayers.secret('pietro-wezla')}`,
      10,
      `Demon trzyma go od startu. ${fromPlayers.secret('notatka-wezla')}`,
    );
    await node.getByRole('button', { name: '+ Urządzenie' }).click();
    const device = node.locator('.net-floor-device');
    await device.locator('select').first().selectOption({ label: 'Wieżyczka' });
    await device.locator('input.net-floor-label').fill('Wieżyczka nad placem');
    await device.locator('select').nth(1).selectOption({ label: 'Automatyczna wieżyczka' });
    await device.locator('select').nth(2).selectOption({ label: 'Wieżyczka' });
    const demon = await floor(4, 'Demon', `Demon ${fromPlayers.secret('pietro-demona')}`);
    await demon.locator('.net-program-picker').selectOption({ label: 'Diablik' });

    await editor.getByRole('button', { name: 'Zapisz' }).click();
    await expect(editor).toBeHidden();
    const saved = architecture(architectureName);
    const trunkFloors = saved.shaft.branches.find((b) => b.parentFloor === null)!.floors;
    expect(trunkFloors.map((f) => [f.kind, f.dv ?? null, f.programIds ?? []])).toEqual([
      ['password', 8, []],
      ['file', 6, []],
      ['ice', null, ['program.kruk']],
      ['controlNode', 10, []],
      ['demon', null, ['demon.diablik']],
    ]);
    expect(trunkFloors[3]!.devices).toEqual([
      expect.objectContaining({
        name: 'Wieżyczka nad placem',
        deviceKind: 'turret',
        entryId: 'defense.automatyczna-wiezyczka',
        tokenId: tokenOn(bramaId, 'Wieżyczka').id,
      }),
    ]);
    // Id architektury nie jest kanarkiem: widok gniazda niesie je graczom celowo
    // (`architectureId` mówi, czy gniazdo gdzieś prowadzi) — nazwa jest wycięta.
    // Biblioteka architektur jedzie tylko do MG (26a).
    await expect(page.locator('.net-entry-title', { hasText: ARCHITECTURE })).toBeVisible();
  });

  test('przygotowanie: gniazdo przy bramie prowadzi do architektury i zostaje ukryte', async () => {
    const page = mg.page;
    await page.keyboard.press('Escape');
    await clickOnMap(page, BRAMA.accessPoint);
    const card = page.getByLabel(/^Karta obiektu: /);
    await expect(card).toBeVisible();
    const name = card.locator('label', { hasText: 'Nazwa' }).locator('input');
    await name.fill('Skrzynka sterowania bramy');
    await name.press('Tab');
    await card
      .locator('label', { hasText: 'Architektura' })
      .locator('select')
      .selectOption({ label: architectureName });
    const notes = card.locator('label', { hasText: 'Notatka MG' }).locator('textarea');
    await notes.fill(`Kabel idzie do budki. ${fromPlayers.secret('notatka-gniazda')}`);
    await notes.press('Tab');
    await expect
      .poll(() => accessPoint())
      .toMatchObject({
        name: 'Skrzynka sterowania bramy',
        hidden: 1,
        architectureId: architecture(architectureName).id,
      });
    await expect.poll(() => accessPoint().notes).toContain('KANAREK-notatka-gniazda');
    await page.keyboard.press('Escape');
  });

  test('przygotowanie: strefy — ostrzał wieżyczki i podłoga elektryczna, obie ukryte', async () => {
    const page = mg.page;
    const turretZone = await drawZone(
      page,
      bramaId,
      'Automatyczna wieżyczka',
      true,
      BRAMA.turretZone.from,
      BRAMA.turretZone.to,
    );
    const floorZone = await drawZone(
      page,
      bramaId,
      'Podłoga elektryczna',
      true,
      BRAMA.floorZone.from,
      BRAMA.floorZone.to,
    );
    expect([turretZone.entryId, turretZone.hidden, turretZone.armed]).toEqual([
      'defense.automatyczna-wiezyczka',
      1,
      1,
    ]);
    expect([floorZone.entryId, floorZone.hidden, floorZone.armed]).toEqual([
      'defense.podloga-elektryczna',
      1,
      1,
    ]);

    // Stanowisko strefy wieżyczki: figura, z której strzela (26f).
    const centreOf = (zone: { from: WorldPoint; to: WorldPoint }) => ({
      x: (zone.from.x + zone.to.x) / 2,
      y: (zone.from.y + zone.to.y) / 2,
    });
    let card = await openZoneCard(page, centreOf(BRAMA.turretZone));
    await card
      .locator('label', { hasText: 'Stanowisko' })
      .locator('select')
      .selectOption({ label: 'Wieżyczka' });
    await expect
      .poll(() => zonesOn(bramaId).find((z) => z.id === turretZone.id)?.tokenId)
      .toBe(tokenOn(bramaId, 'Wieżyczka').id);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    card = await openZoneCard(page, centreOf(BRAMA.floorZone));
    const notes = card.locator('label', { hasText: 'Notatka MG' }).locator('textarea');
    await notes.fill(`Prąd z budki. ${fromPlayers.secret('notatka-strefy')}`);
    await notes.press('Tab');
    await expect
      .poll(() => zonesOn(bramaId).find((z) => z.id === floorZone.id)?.notes)
      .toContain('KANAREK-notatka-strefy');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  });

  test('#33 karta strefy wiąże ją z węzłem kontrolnym (wyłączenie wieżyczki ją rozbraja)', async () => {
    test.fail(
      true,
      '#33: `zone:update` przyjmuje `architectureId/floorId/deviceId`, ale UI ich nie ustawia',
    );
    const page = mg.page;
    const card = await openZoneCard(page, {
      x: (BRAMA.turretZone.from.x + BRAMA.turretZone.to.x) / 2,
      y: (BRAMA.turretZone.from.y + BRAMA.turretZone.to.y) / 2,
    });
    try {
      await expect(card.getByText(/węzeł kontrolny|Węzeł kontrolny/)).toBeVisible({
        timeout: 2_000,
      });
    } finally {
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
    }
  });

  test('przygotowanie: strefa wieżyczki związana z węzłem z gniazda MG (obejście #33)', async () => {
    // Przy stole MG rozbroiłby strefę ręką („Rozbrój”), gdy Ola wyłączy wieżyczkę.
    // Automat wiąże ją zdarzeniem, które UI miałoby wysłać — T5b sprawdza wtedy
    // most serwera: wyłączone urządzenie węzła rozbraja strefę (`zoneDisarmedByNetrunner`).
    const arch = architecture(architectureName);
    const node = arch.shaft.branches[0]!.floors[3]!;
    const zone = zonesOn(bramaId).find((z) => z.entryId === 'defense.automatyczna-wiezyczka')!;
    expect(
      await emitAck(await mg.socket(), 'zone:update', {
        zoneId: zone.id,
        patch: { architectureId: arch.id, floorId: node.id, deviceId: node.devices![0]!.id },
      }),
    ).toMatchObject({ ok: true });
    expect(zonesOn(bramaId).find((z) => z.id === zone.id)).toMatchObject({
      architectureId: arch.id,
      floorId: node.id,
      deviceId: node.devices![0]!.id,
    });
  });

  test('przygotowanie: bot „Strażnik” (Propozycja, karta statysty, w scenie „Brama”)', async () => {
    const page = mg.page;
    await createBot(
      page,
      'Solo — ochroniarz',
      'Strażnik',
      {
        Osobowość:
          'Najemny strażnik bramy magazynu. Znudzony nocną zmianą, ale czujny, gdy ktoś podchodzi do szlabanu.',
        'Motywacje i cele':
          'Nikogo nie wpuścić bez przepustki i dotrwać do końca zmiany o trzeciej.',
        Sekrety: `Wpuszcza przemytników za łapówkę; kod do budki: ${fromPlayers.secret('sekret-Straznika')}.`,
        'Styl wypowiedzi': 'Krótko, służbowo, z wojskowym żargonem.',
      },
      'Strażnik',
    );
    const row = page.locator('.bot-row', { hasText: 'Strażnik' });
    const active = row.getByRole('checkbox');
    await active.click();
    await expect(active).toBeChecked();
    await row.locator('.bot-scene-pin').selectOption({ label: 'w scenie: Brama' });
    await expect
      .poll(() => {
        const bot = queryOne<{ active: number; sceneId: string | null; data: string }>(
          'SELECT active, sceneId, data FROM BotProfile WHERE name = ?',
          'Strażnik',
        );
        return (
          bot && [bot.active, bot.sceneId, (JSON.parse(bot.data) as { autonomy: string }).autonomy]
        );
      })
      .toEqual([1, bramaId, 'proposal']);
  });

  test('przygotowanie: MG dopisuje Kowalowi amunicję przeciwpancerną', async () => {
    const sheet = await openSheet(mg, 'Kowal');
    await sheet.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    await sheet.getByLabel('Amunicja (zapas)').fill('Przeciwpancerna do B.C. pistoletu × 16');
    await expect
      .poll(
        () =>
          (
            JSON.parse(
              queryOne<{ data: string }>('SELECT data FROM Character WHERE name = ?', 'Kowal')!
                .data,
            ) as Sheet
          ).ammoStock,
      )
      .toBe('Przeciwpancerna do B.C. pistoletu × 16');
    await closeSheet(mg.page);
  });

  test('przygotowanie: kanarki przed aktywacją — nic z „Bramy” u graczy', async () => {
    for (const player of [marek, ola]) await expectClean(player, secretsFor(player));
  });

  test('5.1 aktywacja „Bramy”: gracze bez F5, „Knajpa” zachowana, MG stawia figury przy starcie', async () => {
    const page = mg.page;
    await page.getByRole('button', { name: 'Sceny', exact: true }).click();
    await sceneListRow(page, 'Brama').getByRole('button', { name: 'Aktywuj' }).click();
    await expect.poll(() => sceneByName('Brama').active).toBe(1);
    fromPlayers.reveal(bramaId);
    for (const player of [marek, ola]) {
      await expect
        .poll(
          async () => (await player.store<{ scene: { id: string } | null }>('scene'))?.scene?.id,
          { message: `${player.name} follows the activation` },
        )
        .toBe(bramaId);
    }
    // Kowal i Iskra mają figury w „Knajpie”, więc na „Bramie” żadnej nie dostają
    // same (#9 spłaca tylko postać bez figury) — MG stawia je niżej, po mgle.
    expect([figureOf(bramaId, 'Kowal'), figureOf(bramaId, 'Iskra')]).toEqual([
      undefined,
      undefined,
    ]);
    // „Knajpa” w bazie tak, jak ją zostawiła walka — figury, drzwi, osłony.
    expect(knajpaState()).toBe(knajpaBefore);
    expect(sceneByName('Knajpa').active).toBe(0);

    // Nowa scena startuje zamknięta; MG zdejmuje blokadę ruchu.
    const editor = await openSceneEditor(page, 'Brama');
    await editor.getByLabel('Ruch graczy po tej mapie').click();
    await expect.poll(() => sceneByName('Brama').playerMoveLocked).toBe(0);
    await editor
      .getByRole('button', { name: /Zamknij|Anuluj zmiany/ })
      .last()
      .click();

    // Ręczna mgła: MG odsłania drogę od miejsca startu pod bramę.
    await fitCamera(page, BRAMA.width, BRAMA.height);
    await revealFog(page, BRAMA.roadReveal.from, BRAMA.roadReveal.to);
    await expect
      .poll(
        async () =>
          ((await ola.store<{ fog: { shapes: unknown[] } | null }>('fog'))?.fog?.shapes ?? [])
            .length,
      )
      .toBeGreaterThan(0);
    // Figury graczy przy miejscu startu: ⊕ „Postaw na scenie” z listy postaci.
    await page.getByRole('button', { name: 'Postacie', exact: true }).click();
    for (const [name, column] of [
      ['Kowal', 19],
      ['Iskra', 21],
    ] as const) {
      await page.getByRole('button', { name: `Postaw na scenie: ${name}` }).click();
      await clickOnMap(page, point(column, 27));
      await expect
        .poll(() => figureOf(bramaId, name)?.ownerId ?? null, { message: name })
        .not.toBeNull();
      const centre = tokenCentre(figureOf(bramaId, name)!, cell);
      expect(Math.hypot(centre.x - BRAMA.spawn.x, centre.y - BRAMA.spawn.y), name).toBeLessThan(
        3 * cell,
      );
    }
    await page.keyboard.press('Escape');
    // Wieżyczka i Strażnik stoją pod mgłą — nie ma ich w świecie graczy.
    for (const player of [marek, ola]) {
      const seen = await visibleTokenIds(player);
      expect(seen, player.name).toContain(kowal().id);
      expect(seen, player.name).not.toContain(tokenOn(bramaId, 'Strażnik').id);
      expect(seen, player.name).not.toContain(tokenOn(bramaId, 'Wieżyczka').id);
    }
  });

  test('5.1 skok w mgłę prosto z gniazda: serwer odmawia, figura stoi', async () => {
    // `refuseWalkIntoFog`: kod dla klienta to `MOVE_REFUSED`, a `MOVE_INTO_FOG`
    // ze zdaniem trafia na kartę odmowy — tylko w walce.
    const before = { x: kowal().x, y: kowal().y };
    expect(
      await emitAck(await marek.socket(), 'token:move', {
        tokenId: kowal().id,
        x: Math.floor(BRAMA.inFog.x / cell) * cell,
        y: Math.floor(BRAMA.inFog.y / cell) * cell,
        final: true,
      }),
    ).toEqual({ ok: false, error: 'MOVE_REFUSED' });
    await marek.page.waitForTimeout(1_000);
    expect({ x: kowal().x, y: kowal().y }).toEqual(before);
  });

  test('#28 marsz klikiem w mgłę staje na skraju odsłoniętego, a nie wraca na start', async () => {
    test.fail(
      true,
      '#28: serwer liczy kolumnę z `Math.floor(543 / 36.2)` = 14 i odmawia trasy planera',
    );
    const page = marek.page;
    await fitCamera(page, BRAMA.width, BRAMA.height).catch(() => undefined);
    const start = { x: kowal().x, y: kowal().y };
    try {
      await page.keyboard.press('Escape');
      await clickOnMap(page, tokenCentre(kowal(), cell));
      await page.waitForTimeout(300);
      await clickOnMap(page, BRAMA.inFog);
      // Planer prowadzi figurę najdalej, jak się da po odsłoniętym — pod zachodni
      // skraj drogi (x = 560) — i ani kroku w mgłę. Z #28 figura przechodzi całą
      // trasę, a serwer na końcu odmawia i odsyła ją na start.
      await page.waitForTimeout(12_000);
      test.info().annotations.push({
        type: 'marsz pod skraj mgły',
        description: `start ${start.x},${start.y} → teraz ${kowal().x},${kowal().y}`,
      });
      expect(kowal().x).toBeLessThan(start.x);
      const centre = tokenCentre(kowal(), cell);
      expect(centre.x).toBeGreaterThanOrEqual(BRAMA.roadReveal.from.x);
    } finally {
      await page.keyboard.press('Escape');
    }
  });

  test('#29 odmowa ruchu poza walką mówi graczowi dlaczego, a nie odsyła do karty', async () => {
    test.fail(
      true,
      '#29: „Ruch odrzucony — sprawdź kartę odmowy na czacie”, a karty poza walką nie ma',
    );
    const page = marek.page;
    const notesOf = async () =>
      ((await marek.store<{ items: { type: string; text?: string }[] }>('chat'))?.items ?? [])
        .filter((item) => item.type === 'note')
        .map((item) => item.text ?? '');
    const seen = (await notesOf()).length;
    const since = lastMessageId();
    const before = { x: kowal().x, y: kowal().y };
    // Przeciągnięcie własnej figury w mgłę — droga obok planera.
    await page.keyboard.press('Escape');
    await dragWorld(page, tokenCentre(kowal(), cell), BRAMA.inFog);
    await expect.poll(async () => (await notesOf()).length).toBeGreaterThan(seen);
    await page.waitForTimeout(1_000);
    expect({ x: kowal().x, y: kowal().y }).toEqual(before);
    const notes = (await notesOf()).slice(seen);
    test.info().annotations.push({ type: 'notatka Marka', description: JSON.stringify(notes) });
    // Karty odmowy nie ma — poza walką `logMovementRefusal` niczego nie pisze.
    expect(lastMessageId()).toBe(since);
    expect(notes.join(' ')).toContain('odsłonięt');
  });

  test('5.2 Marek podchodzi pod bramę', async () => {
    // Obok klamki, nie pod nią — żeton przykryłby 🚪 i klik złapałby figurę.
    await walk(marek, kowal, 20, 13);
    expect(gateOpen()).toBe(0);
  });

  test('#30 na ręcznej mgle gracz dostaje klamkę bramy, którą wolno mu otworzyć', async () => {
    test.fail(true, '#30: `computeViewerVision` wysyła otwory tylko na scenie Dynamicznej');
    const gate = gateRow();
    expect(gate.playerToggle).toBe(1);
    // Serwer i tak by przepuścił (`opening:toggle` nie pyta o tryb sceny) —
    // brakuje tylko klamki na mapie Marka.
    await expect
      .poll(
        async () =>
          ((await marek.store<{ openings: { id: number }[] }>('wall'))?.openings ?? []).map(
            (o) => o.id,
          ),
        { timeout: 5_000 },
      )
      .toContain(gate.id);
  });

  test('5.2 MG otwiera bramę (obejście #30), Marek wchodzi na plac odsłonięty przez MG', async () => {
    test.setTimeout(3 * 60_000);
    const page = mg.page;
    await fitCamera(page, BRAMA.width, BRAMA.height);
    await page.keyboard.press('Escape');
    await clickOnMap(page, BRAMA.gateHandle);
    await expect.poll(gateOpen).toBe(1);
    // Otwarta brama znika z przeszkód planera Oli (Firefox) bez F5.
    const gate = gateRow();
    const blocksOla = async () =>
      (
        (await ola.store<{ blockers: { x1: number; x2: number; y1: number }[] }>('wall'))
          ?.blockers ?? []
      ).some((b) => b.y1 === gate.y1 && b.x1 === gate.x1 && b.x2 === gate.x2);
    await expect.poll(blocksOla).toBe(false);

    await revealFog(page, BRAMA.yardReveal.from, BRAMA.yardReveal.to);
    const since = lastMessageId();
    await walk(marek, kowal, 21, 11);
    // Na placu żadna strefa nie odpaliła, a Percepcja nie rzucała (strefy > 4 m).
    await marek.page.waitForTimeout(1_500);
    expect(messageAfter(since, '', 'damage')).toBeUndefined();
    expect(zonesOn(bramaId).map((z) => [z.hidden, z.armed])).toEqual([
      [1, 1],
      [1, 1],
    ]);
    const seen = await visibleTokenIds(ola);
    expect(seen).not.toContain(tokenOn(bramaId, 'Strażnik').id);
  });

  test('5.3 Ola staje przy skrzynce i Skanerem znajduje ukryte gniazdo', async () => {
    test.setTimeout(3 * 60_000);
    await fitCamera(ola.page, BRAMA.width, BRAMA.height).catch(() => undefined);
    await walk(ola, iskra, 24, 15);
    // Gniazdo ukryte: gracz go nie dostaje (26b).
    const pointsOf = async (actor: Actor) =>
      (await actor.store<{ accessPoints: { id: string; name: string }[] }>('netRun'))
        ?.accessPoints ?? [];
    expect(await pointsOf(ola)).toEqual([]);

    const since = lastMessageId();
    scriptDice([7]);
    await clickOnMap(ola.page, tokenCentre(iskra(), cell));
    await ola.page.locator('.hud-slot', { hasText: 'Skaner' }).click();
    await expect.poll(() => accessPoint().hidden).toBe(0);
    expect(pendingDice()).toBe('');
    const scan = messageAfter(since, 'Skaner', 'gmroll');
    expect(scan, 'karta Skanera').toBeTruthy();
    expect(JSON.parse(scan!.payload!)).toMatchObject({ total: 11, outcome: { success: true } });
    for (const player of [ola, marek]) {
      await expect
        .poll(async () => (await pointsOf(player)).map((p) => p.name), { message: player.name })
        .toEqual(['Skrzynka sterowania bramy']);
    }
    await ola.page.keyboard.press('Escape');
  });

  test('5.3 podłączenie: winda w pływającym oknie, dalsze piętra jako „?”', async () => {
    const page = ola.page;
    await clickOnMap(page, BRAMA.accessPoint);
    const card = page.getByLabel(/^Karta obiektu: /);
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Podłącz się' }).click();
    const window = runWindow(ola);
    await expect(window).toBeVisible();
    await expect(window.locator('.net-run-title')).toContainText('SIEĆ');
    const labels = window.locator('.net-run-floor-label');
    await expect(labels).toHaveText(['Hasło: szlaban', '?', '?', '?', '?']);
    await expect(window.locator('.net-run-status')).toContainText(
      'Punkt dostępu: Skrzynka sterowania bramy',
    );
    expect(runOf('Iskra')?.state.position.floor).toBe(0);
    // Marek nie ma cudzego runu; MG widzi go z nazwą architektury.
    const runsOf = async (actor: Actor) =>
      ((await actor.store<{ runs: { characterName: string }[] }>('netRun'))?.runs ?? []).map(
        (r) => r.characterName,
      );
    expect(await runsOf(marek)).toEqual([]);
    await expect.poll(() => runsOf(mg)).toEqual(['Iskra']);
    await expect(runWindow(mg).locator('.net-run-title')).toContainText(ARCHITECTURE);
  });

  test('#32 nazwa architektury nie dociera do netrunnerki (gracz widzi „SIEĆ”)', async () => {
    const code = architectureName.slice(ARCHITECTURE.length + 1);
    const leaked = await ola.sniffer.found([code]);
    if (leaked.length > 0) {
      test.info().annotations.push({
        type: 'wyciek u Ola',
        description: `${code} … ${await ola.sniffer.evidence(code, 0, 200)}`,
      });
    }
    // Znany wyciek zostaje tajny już tylko przed Markiem (cudzego runu nie dostaje),
    // żeby ogólna kontrola kanarków łapała każdy następny.
    fromPlayers.reveal(code);
    fromMarek.track(code);
    test.fail(true, '#32: `netRunView` oddaje `architectureName` także graczowi');
    expect(leaked).toEqual([]);
  });

  test('#31 niezłamane hasło na piętrze wejścia blokuje zjazd niżej', async () => {
    test.fail(
      true,
      '#31: `netCanMove` sprawdza hasła po drodze bez piętra, na którym netrunner stoi',
    );
    const window = runWindow(ola);
    const floors = window.locator('.net-run-floor');
    try {
      await floors.nth(1).locator('.net-run-floor-body').click();
      await ola.page.waitForTimeout(1_500);
      test.info().annotations.push({
        type: 'zjazd przez niezłamane hasło',
        description: `piętro ${(runOf('Iskra')?.state.position.floor ?? -1) + 1}; komunikat: ${JSON.stringify(
          await window.locator('.net-run-notice').allTextContents(),
        )}`,
      });
      expect(runOf('Iskra')?.state.position.floor).toBe(0);
      await expect(window.locator('.net-run-notice')).toContainText('blokuje drogę', {
        timeout: 2_000,
      });
    } finally {
      // Z #31 Ola stoi już na Pliku — wraca na hasło (w górę wolno zawsze),
      // żeby dalszy przebieg był ten sam przed poprawką i po niej.
      // Z gniazda, nie klikiem: to sprzątanie, a nie krok, który testujemy.
      const run = runOf('Iskra')!;
      if (run.state.position.floor !== 0) {
        expect(
          await emitAck(await ola.socket(), 'netrun:move', {
            runId: run.id,
            to: { ...run.state.position, floor: 0 },
          }),
        ).toMatchObject({ ok: true });
        await expect.poll(() => runOf('Iskra')?.state.position.floor).toBe(0);
        await expect(floors.nth(0)).toHaveClass(/net-run-floor--here/);
      }
    }
  });

  test('5.3 Backdoor łamie hasło, zjazd na Plik, Ajdi go rozpoznaje', async () => {
    const window = runWindow(ola);
    const floors = window.locator('.net-run-floor');
    const password = architecture(architectureName).shaft.branches[0]!.floors[0]!.id;
    const file = architecture(architectureName).shaft.branches[0]!.floors[1]!.id;
    scriptDice([6]);
    await window.locator('.net-abilities').getByRole('button', { name: 'Backdoor' }).click();
    await expect.poll(() => runOf('Iskra')?.state.broken).toContain(password);
    expect(pendingDice()).toBe('');
    await expect(floors.nth(0)).toContainText('złamane');
    // Reszta stołu widzi skrót, nie zawartość Architektury (26b).
    await expect(marek.page.locator('.chat-message', { hasText: 'Backdoor' }).last()).toBeVisible();

    await floors.nth(1).locator('.net-run-floor-body').click();
    await expect.poll(() => runOf('Iskra')?.state.position.floor).toBe(1);
    await expect(window.locator('.net-run-floor-label')).toHaveText([
      'Hasło: szlaban',
      'Plik: grafik zmian',
      '?',
      '?',
      '?',
    ]);

    const since = lastMessageId();
    scriptDice([5]);
    await window.locator('.net-abilities').getByRole('button', { name: 'Ajdi' }).click();
    await expect.poll(() => runOf('Iskra')?.state.identified).toContain(file);
    expect(pendingDice()).toBe('');
    // Ajdi wypłaca notatkę MG z Pliku — Oli, nie Markowi.
    await expect(floors.nth(1)).toContainText('rozpoznany');
    await expect(floors.nth(1).locator('.net-run-floor-notes')).toContainText(
      'Zmiana warty o 3:00',
    );
    fromPlayers.reveal(fileNote);
    fromMarek.track(fileNote);
    expect(messageAfter(since, 'Ajdi', 'gmroll') ?? messageAfter(since, 'Ajdi')).toBeTruthy();
  });

  test('5.3 kanarki po T5a: dalsze piętra, notatki i Strażnik zostają u MG; konsola czysta', async () => {
    for (const player of [marek, ola]) await expectClean(player, secretsFor(player));
    // Kontrola podsłuchu: notatka Pliku dotarła do Oli, która go rozpoznała.
    expect(await ola.sniffer.found([fileNote])).toEqual([fileNote]);
    for (const actor of [mg, marek, ola]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
  });

  test('punkt kontrolny po-T5a: kopia i odtworzenie przed walką drugą', async () => {
    const before = stateFingerprint();
    saveCheckpoint('po-T5a');
    expect(hasCheckpoint('po-T5a')).toBe(true);
    await restoreCheckpoint('po-T5a');
    await startInstance();
    expect(stateFingerprint()).toEqual(before);
  });
});
