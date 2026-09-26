import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { query, queryOne, stateFingerprint } from '../../fixtures/db.ts';
import { LLM_TIMEOUT_MS, requireGateway } from '../../fixtures/llm.ts';
import { BRAMA, KNAJPA } from '../../fixtures/maps.ts';
import { material } from '../../fixtures/materials.ts';
import {
  clickOnMap,
  clickTool,
  drawCover,
  drawWalls,
  dropTool,
  fitCamera,
  gmNote,
  openObjectCard,
  openTokenEditor,
  placeTokenFromFile,
  setStepper,
  tokenCentre,
} from '../../fixtures/scene.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { Canaries } from '../../fixtures/sniffer.ts';
import { say } from '../../fixtures/table.ts';
import {
  hasCheckpoint,
  restoreCheckpoint,
  saveCheckpoint,
  startInstance,
} from '../../instance/instance.ts';
import type { Page } from '@playwright/test';

/**
 * T3b (`testy.md` 5.1, kroki 3.9–3.15): od punktu `po-T3a` MG buduje „Knajpę”
 * (Dynamiczna, ciemna, pełny plan ścian) i „Bramę” (ręczna mgła, bariera
 * z bramą), stawia statystów i ukrytego „Cienia”, zakłada boty „Rzeźnik”
 * i „Paser”, aktywuje „Knajpę”; gracze chodzą, otwierają drzwi, rozmawiają
 * z botem, szepczą; na końcu punkt kontrolny `po-T3`.
 *
 * Decyzje MG z 26.09 (sesja T3b): Knajpa Dynamiczna + ciemność + pamięć terenu,
 * Brama na ręcznej mgle (odmowę ruchu w mgłę sprawdza T5); realistyczny plan
 * ścian; Rzeźnik i Paser to statyści z kartą, do których przypięto boty.
 */

type SceneRow = {
  id: string;
  name: string;
  active: number;
  visibility: string;
  dark: number;
  darkSightM: number;
  gridSizePx: number;
  playerMoveLocked: number;
  spawnX: number | null;
  spawnY: number | null;
};
type TokenRow = {
  id: string;
  name: string;
  publicName: string | null;
  sceneId: string;
  x: number;
  y: number;
  size: number;
  hidden: number;
  ownerId: string | null;
  characterId: string | null;
};

const scene = (name: string): SceneRow => {
  const row = queryOne<SceneRow>('SELECT * FROM Scene WHERE name = ?', name);
  if (!row) throw new Error(`E2E: no scene "${name}"`);
  return row;
};
const tokensOn = (sceneId: string): TokenRow[] =>
  query<TokenRow>('SELECT * FROM Token WHERE sceneId = ? ORDER BY createdAt', sceneId);
const token = (sceneId: string, name: string): TokenRow => {
  const row = tokensOn(sceneId).find((t) => t.name === name);
  if (!row) throw new Error(`E2E: no token "${name}"`);
  return row;
};
const characterId = (name: string): string =>
  queryOne<{ id: string }>('SELECT id FROM Character WHERE name = ?', name)!.id;

/** Środek kratki (kolumna, wiersz) sceny o boku kratki `cell`. */
const cellCentre = (cell: number, column: number, row: number) => ({
  x: (column + 0.5) * cell,
  y: (row + 0.5) * cell,
});

/** Id figur widocznych u aktora — to samo, co rysuje jego mapa. */
async function visibleTokenIds(actor: Actor): Promise<string[]> {
  const state = await actor.store<{ tokens: Record<string, unknown> }>('token');
  return Object.keys(state?.tokens ?? {});
}

/** Ile kratek pamięci terenu ma zaznaczone „zwiedzone” (co drugi bieg). */
async function exploredCells(actor: Actor): Promise<number> {
  const state = await actor.store<{ mask: { runs: number[] } | null }>('exploration');
  return (state?.mask?.runs ?? []).reduce((sum, run, i) => (i % 2 ? sum + run : sum), 0);
}

function sceneRow(page: Page, name: string) {
  return page.locator('.scene-row').filter({
    has: page.locator('.scene-row-name', { hasText: new RegExp(`^${name}$`) }),
  });
}

async function openSceneEditor(page: Page, name: string) {
  await page.getByRole('button', { name: 'Sceny', exact: true }).click();
  const editor = page.locator('.scene-editor');
  if (!(await editor.isVisible())) {
    await sceneRow(page, name).getByRole('button', { name: 'Edytuj' }).click();
  }
  await expect(editor.getByRole('heading', { name: `Edycja: ${name}` })).toBeVisible();
  return editor;
}

/** Nowa scena z mapą, kratką z nazwy pliku i trybem widoczności. */
async function createScene(
  page: Page,
  map: { file: string; width: number; columns: number },
  name: string,
  visibility: 'fog' | 'dynamic',
) {
  await page.getByRole('button', { name: 'Sceny', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nazwa nowej sceny' }).fill(name);
  await page.getByRole('button', { name: 'Utwórz', exact: true }).click();
  const editor = await openSceneEditor(page, name);
  await editor.locator('.scene-upload-button input[type=file]').setInputFiles(material(map.file));
  await expect(editor.getByText(new RegExp(`^${map.width}×\\d+ px$`))).toBeVisible();
  await editor.locator('#grid-columns').fill(String(map.columns));
  await editor.locator('#scene-visibility').selectOption(visibility);
  await expect(editor.locator('#scene-visibility')).toHaveValue(visibility);
  return editor;
}

test.describe.serial('T3b: sceny, figury, boty, aktywacja i czat', () => {
  let mg: Actor;
  let marek: Actor;
  let ola: Actor;
  let campaignId: string;
  let knajpaId: string;
  let bramaId: string;
  let cell: number;
  /** Tajne przed obojgiem graczy. */
  const fromPlayers = new Canaries();
  /** Tajne przed Markiem (szept Oli do MG, handout Oli). */
  const fromMarek = new Canaries();
  /** Tajne przed Olą (szept MG do Marka). */
  const fromOla = new Canaries();

  test.beforeAll(() => {
    // Pełny przebieg idzie tu wprost po T3a; osobno — `E2E_FROM=po-T3a`.
    const campaign = queryOne<{ id: string }>(
      `SELECT id FROM Campaign WHERE name = 'Nocna zmiana'`,
    );
    if (!campaign) throw new Error('E2E: T3b needs the po-T3a state (E2E_FROM=po-T3a)');
    campaignId = campaign.id;
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('start z po-T3a: MG, Marek i Ola przy stole, scen jeszcze nie ma', async ({ cast }) => {
    const invites = query<{ token: string }>(
      'SELECT token FROM Invitation WHERE campaignId = ? ORDER BY createdAt',
      campaignId,
    );
    expect(invites).toHaveLength(2);
    mg = await cast.mg('chromium');
    // Ten sam link i to samo imię = to samo konto (`routes/join.ts`).
    marek = await cast.gracz('Marek', 'chromium', invites[0]!.token);
    ola = await cast.gracz('Ola', 'firefox', invites[1]!.token);
    expect(query('SELECT id FROM Scene')).toEqual([]);
    expect(
      query<{ name: string }>(`SELECT name FROM User WHERE role = 'PLAYER' ORDER BY name`).map(
        (u) => u.name,
      ),
    ).toEqual(['Marek', 'Ola']);
  });

  test('3.9 MG buduje „Knajpę”: mapa 33 × 24, Dynamiczna, ciemność, ściany, drzwi, okna, światła', async () => {
    test.setTimeout(6 * 60_000);
    const page = mg.page;
    const editor = await createScene(page, KNAJPA, 'Knajpa', 'dynamic');
    knajpaId = fromPlayers.track(scene('Knajpa').id);
    const dark = editor.getByLabel('Ciemna scena — widać tylko to, co oświetlone');
    await dark.click();
    await expect(dark).toBeChecked();
    // Widzenie po ciemku 4 m zamiast 2: gracz podchodzący do baru widzi Pasera.
    await editor.locator('#scene-dark-sight').fill('4');
    await editor.locator('#scene-dark-sight').press('Tab');
    await editor.getByRole('button', { name: 'Zapisz' }).click();
    await expect(editor).toBeHidden();
    await expect
      .poll(() => {
        const row = scene('Knajpa');
        return [row.visibility, row.dark, row.darkSightM, Math.round(row.gridSizePx * 100)];
      })
      .toEqual(['dynamic', 1, 4, 4455]);
    cell = scene('Knajpa').gridSizePx;

    await fitCamera(page, KNAJPA.width, KNAJPA.height);
    await drawWalls(page, knajpaId, KNAJPA.walls);
    const kinds = query<{ kind: string; n: number }>(
      'SELECT kind, count(*) AS n FROM Wall WHERE sceneId = ? GROUP BY kind ORDER BY kind',
      knajpaId,
    );
    expect(kinds).toEqual([
      { kind: 'door', n: 13 },
      { kind: 'wall', n: 44 },
      { kind: 'window', n: 3 },
    ]);
    // Drzwi otwierają gracze, okna tylko MG (domyślne „nie” dla okien).
    expect(
      query(
        'SELECT DISTINCT kind, playerToggle FROM Wall WHERE sceneId = ? AND kind <> ?',
        knajpaId,
        'wall',
      ),
    ).toEqual(
      expect.arrayContaining([
        { kind: 'door', playerToggle: 1 },
        { kind: 'window', playerToggle: 0 },
      ]),
    );

    // Rygiel na tylnych drzwiach kuchni — z karty segmentu (dwuklik).
    const card = await openObjectCard(page, 'Ściany (W)', KNAJPA.backDoor);
    await card.getByRole('button', { name: /Bez rygla/ }).click();
    await expect
      .poll(() => query('SELECT id FROM Wall WHERE sceneId = ? AND locked = 1', knajpaId).length)
      .toBe(1);
    await card.getByRole('button', { name: 'Zamknij kartę' }).click();
    await dropTool(page);

    await clickTool(page, 'Światła (L)', [...KNAJPA.lights]);
    await gmNote(
      page,
      KNAJPA.note,
      `Pod ladą Pasera schowek z bronią. ${fromPlayers.secret('notatka-Knajpy')}`,
    );
    await clickTool(page, 'Miejsce startu graczy', [KNAJPA.spawn]);
    expect(
      query('SELECT x, y, brightM, dimM FROM MapLight WHERE sceneId = ? ORDER BY id', knajpaId),
    ).toEqual(KNAJPA.lights.map((l) => ({ ...l, brightM: 4, dimM: 10 })));
    expect([scene('Knajpa').spawnX, scene('Knajpa').spawnY]).toEqual([
      KNAJPA.spawn.x,
      KNAJPA.spawn.y,
    ]);
    expect(scene('Knajpa').active).toBe(0);
  });

  test('3.10 MG buduje „Bramę”: mapa 40 × 30, ręczna mgła, bariera z bramą, osłona, gniazdo', async () => {
    test.setTimeout(4 * 60_000);
    const page = mg.page;
    const editor = await createScene(page, BRAMA, 'Brama', 'fog');
    bramaId = fromPlayers.track(scene('Brama').id);
    await editor.getByRole('button', { name: 'Zapisz' }).click();
    await expect(editor).toBeHidden();
    await expect.poll(() => Math.round(scene('Brama').gridSizePx * 10)).toBe(362);

    await fitCamera(page, BRAMA.width, BRAMA.height);
    await drawWalls(page, bramaId, BRAMA.walls);
    await drawWalls(page, bramaId, BRAMA.barriers, { armor: 20, hidesFigures: true });
    await drawWalls(page, bramaId, BRAMA.gate, { armor: 10, playerToggle: true });
    await drawWalls(page, bramaId, BRAMA.fence, { armor: 5 });
    expect(
      query(
        `SELECT kind, armor, hidesFigures, playerToggle, count(*) AS n FROM Wall
          WHERE sceneId = ? GROUP BY kind, armor, hidesFigures, playerToggle ORDER BY kind, armor`,
        bramaId,
      ),
    ).toEqual([
      { kind: 'barrier', armor: 5, hidesFigures: 0, playerToggle: 0, n: 2 },
      { kind: 'barrier', armor: 20, hidesFigures: 1, playerToggle: 0, n: 2 },
      { kind: 'gate', armor: 10, hidesFigures: 0, playerToggle: 1, n: 1 },
      { kind: 'wall', armor: 0, hidesFigures: 0, playerToggle: 0, n: 5 },
    ]);

    await drawCover(page, BRAMA.cover.from, BRAMA.cover.to);
    await expect
      .poll(() => query('SELECT id FROM Cover WHERE sceneId = ?', bramaId).length)
      .toBe(1);
    await clickTool(page, 'Punkty dostępu do Sieci', [BRAMA.accessPoint]);
    expect(query('SELECT hidden FROM NetAccessPoint WHERE sceneId = ?', bramaId)).toEqual([
      { hidden: 1 },
    ]);
    await gmNote(
      page,
      BRAMA.note,
      `Wieżyczka na dachu magazynu. ${fromPlayers.secret('notatka-Bramy')}`,
    );
    await clickTool(page, 'Miejsce startu graczy', [BRAMA.spawn]);
    expect(scene('Brama').visibility).toBe('fog');

    // Żadna z dwóch scen nie dotarła do graczy — nic nie jest aktywne.
    for (const player of [marek, ola]) {
      const state = await player.store<{ scene: { id: string } | null }>('scene');
      expect(state?.scene ?? null, player.name).toBeNull();
    }
  });

  test('3.11 figury: statyści z kartą, klon z aliasem, Rzeźnik, Paser, ukryty „Cień”', async () => {
    test.setTimeout(5 * 60_000);
    const page = mg.page;
    await page.getByRole('button', { name: 'Sceny', exact: true }).click();
    await sceneRow(page, 'Knajpa').getByRole('button', { name: 'Pokaż' }).click();
    await expect
      .poll(async () => (await mg.store<{ scene: { id: string } | null }>('scene'))?.scene?.id)
      .toBe(knajpaId);
    await fitCamera(page, KNAJPA.width, KNAJPA.height);

    /** Statysta: figura z grafiki, potem „Statystyki bojowe” w oknie edycji. */
    async function statist(
      file: string,
      asset: string,
      at: { x: number; y: number },
      name: string,
      profile: { ref: number; skill: number; dodge: number; armor: number; weapon: string },
      hp?: number,
    ) {
      await placeTokenFromFile(page, material(file), asset, at);
      await expect.poll(() => tokensOn(knajpaId).some((t) => t.name === asset)).toBe(true);
      const dialog = await openTokenEditor(page, at);
      await dialog.locator('#token-name').fill(name);
      if (hp !== undefined) {
        await dialog.getByLabel('Pasek HP').check();
        const [current, max] = await dialog.locator('.scene-number-input').all();
        await max!.fill(String(hp));
        await current!.fill(String(hp));
      }
      await dialog.getByLabel('Statystyki bojowe (figura dostaje własną kartę)').check();
      await setStepper(dialog.getByRole('spinbutton', { name: 'Cecha REF' }), profile.ref);
      await setStepper(
        dialog.getByRole('spinbutton', { name: 'Poziom umiejętności broni' }),
        profile.skill,
      );
      await setStepper(dialog.getByRole('spinbutton', { name: 'Poziom Uniku' }), profile.dodge);
      await setStepper(
        dialog.getByRole('spinbutton', { name: 'OB pancerza statysty' }),
        profile.armor,
      );
      await dialog.locator('#statist-weapon').selectOption({ label: profile.weapon });
      await dialog.getByRole('button', { name: 'Zapisz' }).click();
      await expect(dialog).toBeHidden();
      await expect.poll(() => token(knajpaId, name).characterId).not.toBeNull();
    }

    const zbir = cellCentre(cell, 7, 8);
    await statist('avatary/avatar14.png', 'avatar14', zbir, 'Zbir', {
      ref: 6,
      skill: 6,
      dodge: 4,
      armor: 11,
      weapon: 'Ciężki pistolet',
    });

    // Klon statysty z menu: własna karta, potem prawdziwe imię-kanarek i alias dla stołu.
    await clickOnMap(page, zbir, 'right');
    await page.getByRole('button', { name: /Duplikuj/ }).click();
    // Kopia dostaje kolejny numer („Zbir 2”, `nextTokenCopyName`).
    await expect.poll(() => tokensOn(knajpaId).some((t) => t.name === 'Zbir 2')).toBe(true);
    const clone = token(knajpaId, 'Zbir 2');
    expect(clone.characterId).not.toBe(token(knajpaId, 'Zbir').characterId);
    const secretName = `Szrama ${fromPlayers.secret('prawdziwe-imie')}`;
    const dialog = await openTokenEditor(page, tokenCentre(clone, cell));
    await dialog.locator('#token-name').fill(secretName);
    await dialog.getByLabel('Gracze widzą inną nazwę').check();
    await dialog.getByLabel('Nazwa widoczna dla graczy').fill('Ochroniarz');
    await dialog.getByRole('button', { name: 'Zapisz' }).click();
    await expect(dialog).toBeHidden();
    await expect
      .poll(() => queryOne<TokenRow>('SELECT * FROM Token WHERE id = ?', clone.id)?.publicName)
      .toBe('Ochroniarz');

    await statist(
      'avatary/avatar16.png',
      'avatar16',
      cellCentre(cell, 10, 11),
      'Rzeźnik',
      { ref: 7, skill: 6, dodge: 5, armor: 11, weapon: 'Ciężki pistolet' },
      45,
    );
    await statist('avatary/avatar18.png', 'avatar18', cellCentre(cell, 13, 13), 'Paser', {
      ref: 5,
      skill: 4,
      dodge: 3,
      armor: 7,
      weapon: 'Średni pistolet',
    });

    // „Cień” w kuchni, ukryty przed graczami do połowy walki pierwszej (T4, 4.5).
    const cien = cellCentre(cell, 20, 15);
    await statist('avatary/avatar17.png', 'avatar17', cien, 'Cień', {
      ref: 8,
      skill: 7,
      dodge: 6,
      armor: 11,
      weapon: 'Bardzo ciężki pistolet',
    });
    await clickOnMap(page, cien, 'right');
    await page.getByRole('button', { name: /Ukryj przed graczami/ }).click();
    await expect.poll(() => token(knajpaId, 'Cień').hidden).toBe(1);
    fromPlayers.track(token(knajpaId, 'Cień').id);

    // Każdy statysta ma własną kartę NPC (bez właściciela) w panelu postaci.
    const npcCards = query<{ name: string; ownerId: string | null }>(
      `SELECT c.name, c.ownerId FROM Character c JOIN Token t ON t.characterId = c.id
        WHERE t.sceneId = ? ORDER BY t.createdAt`,
      knajpaId,
    );
    expect(npcCards.map((c) => c.ownerId)).toEqual([null, null, null, null, null]);
    expect(npcCards).toHaveLength(5);

    // Figury graczy: postacie przyjęto w T3a bez aktywnej sceny, więc żeton z kreatora
    // czeka na aktywację sceny (#9) — MG niczego nie stawia ręką, a „Knajpa” tylko
    // oglądana (nie aktywna) figur nie dostaje.
    for (const name of ['Kowal', 'Iskra']) {
      expect(
        tokensOn(knajpaId).some((t) => t.characterId === characterId(name)),
        name,
      ).toBe(false);
    }
  });

  test('3.12 boty: „Rzeźnik” (Propozycja, karta statysty) i „Paser” (w scenie Knajpa)', async () => {
    const page = mg.page;
    await page.getByRole('button', { name: 'Boty', exact: true }).click();

    async function createBot(
      template: string,
      name: string,
      persona: Record<'Osobowość' | 'Motywacje i cele' | 'Sekrety' | 'Styl wypowiedzi', string>,
      card: string,
    ) {
      const panel = page.locator('.bot-create');
      await panel.getByTitle('Archetyp startowy').selectOption({ label: template });
      await panel.getByRole('textbox').fill(name);
      await panel.getByRole('button', { name: 'Utwórz', exact: true }).click();
      const editor = page.getByLabel(`Edytor bota: ${name}`);
      await expect(editor).toBeVisible();
      // Etykieta pola niesie też podpowiedź („Osobowość Kim jest…”) — po początku nazwy.
      for (const [label, text] of Object.entries(persona)) {
        await editor.getByLabel(new RegExp(`^${label}`)).fill(text);
      }
      await expect
        .poll(
          () =>
            queryOne<{ data: string }>('SELECT data FROM BotProfile WHERE name = ?', name)?.data,
        )
        .toContain(persona.Sekrety);
      await editor.getByRole('button', { name: 'Wiedza i model' }).click();
      await editor
        .locator('label', { hasText: 'Powiązana karta postaci' })
        .locator('select')
        .selectOption({ label: card });
      await expect
        .poll(
          () =>
            queryOne<{ characterId: string | null }>(
              'SELECT characterId FROM BotProfile WHERE name = ?',
              name,
            )?.characterId,
        )
        .toBe(characterId(card));
      await editor.getByRole('button', { name: 'Zamknij edytor' }).click();
    }

    const rzeznikSecret = fromPlayers.secret('sekret-Rzeznika');
    await createBot(
      'Solo — ochroniarz',
      'Rzeźnik',
      {
        Osobowość:
          'Szef gangu, który trzyma tę dzielnicę za gardło. Były rzeźnik z Kabuki: ciężki, powolny w mowie, szybki w działaniu. Knajpa jest jego neutralnym gruntem.',
        'Motywacje i cele':
          'Utrzymać spokój w knajpie i ukarać każdego, kto podniesie tu rękę na jego ludzi.',
        Sekrety: `W chłodni knajpy trzyma porwanego korpo z Arasaki. Hasło do chłodni: ${rzeznikSecret}.`,
        'Styl wypowiedzi': 'Krótkie zdania. Groźby wypowiada spokojnie, bez podnoszenia głosu.',
      },
      'Rzeźnik',
    );
    const paserSecret = fromPlayers.secret('sekret-Pasera');
    await createBot(
      'Fikserka',
      'Paser',
      {
        Osobowość:
          'Paser prowadzi lombard dwie przecznice dalej, a wieczorami siedzi za barem u Rzeźnika. Uśmiechnięty, gadatliwy, zawsze ma coś „prosto z ciężarówki”.',
        'Motywacje i cele': 'Sprzedać drogo, kupić tanio i nie wejść w drogę Rzeźnikowi.',
        Sekrety: `Donosi NCPD o ruchach Rzeźnika; jego kryptonim u glin to ${paserSecret}.`,
        'Styl wypowiedzi':
          'Mówi szybko, z uliczną swadą i komplementami. Do klientów zwraca się „szefie” albo „kochana”.',
      },
      'Paser',
    );

    // Rzeźnik: w sesji, wołany po imieniu, Propozycja. Paser: w sesji, przypięty do Knajpy.
    const row = (name: string) => page.locator('.bot-row', { hasText: name });
    // „w sesji” jest kontrolowane stanem z serwera — przełącza się dopiero po odpowiedzi.
    for (const name of ['Rzeźnik', 'Paser']) {
      const active = row(name).getByRole('checkbox');
      await active.click();
      await expect(active).toBeChecked();
    }
    await row('Paser').locator('.bot-scene-pin').selectOption({ label: 'w scenie: Knajpa' });
    await expect
      .poll(() =>
        query<{ name: string; active: number; sceneId: string | null; data: string }>(
          'SELECT name, active, sceneId, data FROM BotProfile ORDER BY name',
        ).map((b) => [
          b.name,
          b.active,
          b.sceneId,
          (JSON.parse(b.data) as { autonomy: string }).autonomy,
        ]),
      )
      .toEqual([
        ['Paser', 1, knajpaId, 'proposal'],
        ['Rzeźnik', 1, null, 'proposal'],
      ]);

    // Profile botów nie jadą do graczy (etap 11).
    for (const player of [marek, ola]) {
      const bots = await player.store<{ bots: Record<string, unknown> }>('bot');
      expect(Object.keys(bots?.bots ?? {}), player.name).toEqual([]);
    }
  });

  test('3.12 kanarki przed aktywacją: sceny, notatki, figury i boty zostają u MG', async () => {
    expect(await marek.sniffer.found(fromPlayers.secretNow)).toEqual([]);
    expect(await ola.sniffer.found(fromPlayers.secretNow)).toEqual([]);
  });

  test('3.13 aktywacja „Knajpy”: gracze na tarasie bez F5, ruch zamknięty do zdjęcia blokady', async () => {
    const page = mg.page;
    await page.getByRole('button', { name: 'Sceny', exact: true }).click();
    await sceneRow(page, 'Knajpa').getByRole('button', { name: 'Aktywuj' }).click();
    await expect.poll(() => scene('Knajpa').active).toBe(1);
    fromPlayers.reveal(knajpaId);

    for (const player of [marek, ola]) {
      await expect
        .poll(
          async () => (await player.store<{ scene: { id: string } | null }>('scene'))?.scene?.id,
          {
            message: `${player.name} follows the activation`,
          },
        )
        .toBe(knajpaId);
    }
    // #9: figury graczy przyjętych w T3a bez sceny wchodzą same przy aktywacji —
    // na taras, przy miejscu startu (a nie na środek mapy).
    const byCard = (name: string) =>
      tokensOn(knajpaId).find((t) => t.characterId === characterId(name));
    await expect.poll(() => [!!byCard('Kowal'), !!byCard('Iskra')]).toEqual([true, true]);
    const kowal = byCard('Kowal')!;
    const iskra = byCard('Iskra')!;
    for (const [figure, owner] of [
      [kowal, 'Marek'],
      [iskra, 'Ola'],
    ] as const) {
      const centre = tokenCentre(figure, cell);
      expect(Math.hypot(centre.x - KNAJPA.spawn.x, centre.y - KNAJPA.spawn.y), owner).toBeLessThan(
        3 * cell,
      );
      expect(
        queryOne<{ name: string }>('SELECT name FROM User WHERE id = ?', figure.ownerId!)?.name,
      ).toBe(owner);
    }

    // Nowa scena startuje zamknięta: własną figurą gracz nie rusza.
    const socket = await marek.socket();
    expect(
      await emitAck(socket, 'token:move', {
        tokenId: kowal.id,
        x: kowal.x,
        y: kowal.y - cell,
        final: true,
      }),
    ).toEqual({ ok: false, error: 'MOVE_LOCKED' });

    const editor = await openSceneEditor(page, 'Knajpa');
    await editor.getByLabel('Ruch graczy po tej mapie').click();
    await expect.poll(() => scene('Knajpa').playerMoveLocked).toBe(0);
    await editor
      .getByRole('button', { name: /Zamknij|Anuluj zmiany/ })
      .last()
      .click();
  });

  test('3.13 Marek otwiera drzwi na taras i idzie do baru; Ola patrzy przez okno', async () => {
    test.setTimeout(3 * 60_000);
    const kowal = () => tokensOn(knajpaId).find((t) => t.characterId === characterId('Kowal'))!;
    const zbir = token(knajpaId, 'Zbir');
    const paser = token(knajpaId, 'Paser');
    const cien = token(knajpaId, 'Cień');

    // Ola na tarasie: lampa nad salą, na ciemnej scenie okno nie zasłania (18d).
    await expect.poll(() => visibleTokenIds(ola)).toContain(zbir.id);
    const olaSees = await visibleTokenIds(ola);
    expect(olaSees).not.toContain(paser.id);
    expect(olaSees).not.toContain(cien.id);
    // Klon z aliasem: gracz widzi „Ochroniarz”, prawdziwe imię zostaje u MG (kanarek).
    const clone = tokensOn(knajpaId).find((t) => t.publicName === 'Ochroniarz')!;
    await expect
      .poll(async () => {
        const state = await ola.store<{ tokens: Record<string, { name: string }> }>('token');
        return state?.tokens[clone.id]?.name;
      })
      .toBe('Ochroniarz');

    const page = marek.page;
    await fitCamera(page, KNAJPA.width, KNAJPA.height).catch(() => undefined);
    const walk = async (to: { x: number; y: number }) => {
      await clickOnMap(page, tokenCentre(kowal(), cell));
      await clickOnMap(page, to);
      const target = { x: Math.floor(to.x / cell) * cell, y: Math.floor(to.y / cell) * cell };
      await expect
        .poll(() => [Math.round(kowal().x), Math.round(kowal().y)], { timeout: 20_000 })
        .toEqual([Math.round(target.x), Math.round(target.y)]);
    };

    // Pod drzwi, klamka, do środka.
    await walk(cellCentre(cell, 5, 18));
    await clickOnMap(page, KNAJPA.frontDoor);
    await expect
      .poll(
        () =>
          queryOne<{ open: number }>(
            'SELECT open FROM Wall WHERE sceneId = ? AND kind = ? AND x1 = 177 AND y1 = 801',
            knajpaId,
            'door',
          )?.open,
      )
      .toBe(1);
    await walk(cellCentre(cell, 5, 16));
    await walk(cellCentre(cell, 12, 13));

    // Paser stoi w ciemności za barem: widzi go tylko ten, kto podszedł (4 m).
    await expect.poll(() => visibleTokenIds(marek)).toContain(paser.id);
    expect(await visibleTokenIds(marek)).not.toContain(cien.id);
    expect(await visibleTokenIds(ola)).not.toContain(paser.id);
  });

  test('3.13 pamięć terenu po F5; marsz do kuchni staje przed zamkniętymi drzwiami', async () => {
    const before = await exploredCells(marek);
    expect(before).toBeGreaterThan(0);
    await marek.page.reload();
    await expect
      .poll(async () => (await marek.store<{ status: string } | null>('auth'))?.status)
      .toBe('authenticated');
    await expect.poll(() => exploredCells(marek)).toBe(before);

    // Kuchnia za zamkniętymi drzwiami wahadłowymi (x = 666): planer prowadzi figurę
    // najdalej pod drzwi, ale nie przez nie — figura zostaje po stronie sali.
    const kowal = () => tokensOn(knajpaId).find((t) => t.characterId === characterId('Kowal'))!;
    await fitCamera(marek.page, KNAJPA.width, KNAJPA.height).catch(() => undefined);
    await clickOnMap(marek.page, tokenCentre(kowal(), cell));
    await clickOnMap(marek.page, cellCentre(cell, 20, 15));
    await marek.page.waitForTimeout(8_000);
    expect(tokenCentre(kowal(), cell).x).toBeLessThan(666);
    expect(
      queryOne<{ open: number }>(
        'SELECT open FROM Wall WHERE sceneId = ? AND kind = ? AND x1 = 666 AND y1 = 753',
        knajpaId,
        'door',
      )?.open,
    ).toBe(0);
  });

  test('3.14 @llm Marek pyta Pasera o towar — bot odpowiada po polsku', async () => {
    await requireGateway();
    const paserId = queryOne<{ id: string }>(`SELECT id FROM BotProfile WHERE name = 'Paser'`)!.id;
    const started = Date.now();
    // Przypięcie do sceny tylko podtrzymuje rozmowę — zaczyna się ją imieniem bota.
    await say(marek, 'Paser, co masz dziś pod ladą? Szukam czegoś cichego na nocną robotę.');
    await expect
      .poll(
        () =>
          queryOne<{ text: string }>(
            'SELECT text FROM ChatMessage WHERE botId = ? ORDER BY id DESC',
            paserId,
          )?.text ?? '',
        { timeout: LLM_TIMEOUT_MS, intervals: [2_000] },
      )
      .not.toBe('');
    const reply = queryOne<{ text: string }>(
      'SELECT text FROM ChatMessage WHERE botId = ? ORDER BY id DESC',
      paserId,
    )!.text;
    test
      .info()
      .annotations.push(
        { type: 'odpowiedź Pasera', description: reply },
        { type: 'czas odpowiedzi', description: `${Math.round((Date.now() - started) / 1000)} s` },
      );
    expect(reply.length).toBeGreaterThan(20);
    expect(reply).toMatch(/[ąćęłńóśźż]/i);
    expect(reply).not.toMatch(/KANAREK/);
    for (const player of [marek, ola]) {
      await expect(
        player.page.locator('.chat-panel, aside').getByText(reply.slice(0, 40)),
      ).toBeVisible();
    }
  });

  test('3.14 szept Oli do MG, szept MG do Marka, handout tylko dla Oli', async () => {
    await mg.page.getByRole('button', { name: 'Czat', exact: true }).click();
    const olaWhisper = fromMarek.secret('szept-Oli');
    await say(ola, `/w MG Mam przeczucie, że Paser kłamie. ${olaWhisper}`);
    await expect(mg.page.getByText(olaWhisper)).toBeVisible();
    expect(
      queryOne<{ kind: string }>(
        'SELECT kind FROM ChatMessage WHERE text LIKE ?',
        `%${olaWhisper}%`,
      )?.kind,
    ).toBe('whisper');

    const mgWhisper = fromOla.secret('szept-MG');
    await say(mg, `/w Marek Za barem coś się poruszyło. ${mgWhisper}`);
    await expect(marek.page.getByText(mgWhisper)).toBeVisible();

    const page = mg.page;
    const handoutText = fromMarek.secret('handout-Oli');
    await page.getByRole('button', { name: 'Handouty', exact: true }).click();
    await page.getByRole('button', { name: '+ Nowy handout' }).click();
    const form = page.locator('form.handout-form');
    await form.getByRole('textbox').first().fill('Liścik spod kufla');
    await form.locator('textarea').fill(`Spotkajmy się na zapleczu o północy. ${handoutText}`);
    await form.getByRole('button', { name: 'Dodaj handout' }).click();
    await page
      .locator('.handout-row', { hasText: 'Liścik spod kufla' })
      .getByRole('button', { name: 'Ola', exact: true })
      .click();
    await expect
      .poll(async () => {
        const state = await ola.store<{ handouts: Record<string, { title: string }> }>('handout');
        return Object.values(state?.handouts ?? {}).map((h) => h.title);
      })
      .toContain('Liścik spod kufla');
    const marekHandouts = await marek.store<{ handouts: Record<string, unknown> }>('handout');
    expect(Object.keys(marekHandouts?.handouts ?? {})).toEqual([]);
  });

  test('3.14 kanarki po T3b: nic tajnego u graczy, konsola bez błędów', async () => {
    expect(await marek.sniffer.found([...fromPlayers.secretNow, ...fromMarek.secretNow])).toEqual(
      [],
    );
    expect(await ola.sniffer.found([...fromPlayers.secretNow, ...fromOla.secretNow])).toEqual([]);
    // Kontrola podsłuchu: adresaci dostali swoje szepty i handout.
    expect(await ola.sniffer.found(fromMarek.secretNow)).toEqual(fromMarek.secretNow);
    expect(await marek.sniffer.found(fromOla.secretNow)).toEqual(fromOla.secretNow);
    for (const actor of [mg, marek, ola]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
  });

  test('3.15 punkt kontrolny po-T3: kopia i odtworzenie dają ten sam stan', async () => {
    const before = stateFingerprint();
    saveCheckpoint('po-T3');
    expect(hasCheckpoint('po-T3')).toBe(true);
    await restoreCheckpoint('po-T3');
    await startInstance();
    expect(stateFingerprint()).toEqual(before);
  });
});
