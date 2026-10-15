import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { request } from '@playwright/test';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { createBot, placeStatist, sceneListRow } from '../../fixtures/brama.ts';
import { query, queryOne } from '../../fixtures/db.ts';
import {
  campaignObjects,
  changedRows,
  newRows,
  ownershipProbes,
  rowSnapshot,
  stringIds,
  TappedSocket,
  uploadUrls,
  type RowSnapshot,
} from '../../fixtures/izolacja.ts';
import { material, materialAs } from '../../fixtures/materials.ts';
import { recordMeasurement } from '../../fixtures/pomiary.ts';
import { canariesInDatabase } from '../../fixtures/nocna-zmiana.ts';
import { startFromPoT6 } from '../../fixtures/regresja.ts';
import { fitCamera, gmNote } from '../../fixtures/scene.ts';
import {
  DEAD_GATEWAY,
  payloadKeys,
  realtimeEvents,
  ServerLog,
  serverAlive,
} from '../../fixtures/security.ts';
import { Canaries } from '../../fixtures/sniffer.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { createInvitation } from '../../fixtures/table.ts';
import {
  restoreBackup,
  saveCheckpoint,
  startInstance,
  stopInstance,
} from '../../instance/instance.ts';
import { GM_LOGIN, SERVER_URL, UPLOADS_DIR } from '../../instance/paths.ts';

/**
 * T9a (`testy.md` 6.5, punkty 2, 3, 5, 6, 7 i 9): dwóch MG na jednym serwerze.
 *
 * - **MG-A** = właściciel z grupą Marka i Oli w stanie `po-T6` (rozegrana
 *   „Nocna zmiana”: kanarki, Sieć, boty, handouty, kompendium MG, pliki).
 * - **MG-B** = „Bartek” z otwartej rejestracji, w Firefoksie; buduje przez UI
 *   kampanię średniej wielkości (scena z mapą, portrety, statysta, handout,
 *   notatka, bot) i wpuszcza imiennymi linkami **Kubę** (Chromium) i **Marka**
 *   (Firefox) — Marek u MG-B to inne konto niż Marek u MG-A.
 *
 * Do etapu 44c aktywna kampania jest jedna na serwer: kampania MG-B zdejmuje stół
 * grupie MG-A, a powrót MG-A zdejmuje go grupie MG-B. To znany stan sprzed 44c
 * (T9b, punkt 4), nie błąd T9a — test go tylko odnotowuje.
 *
 * Wagi (decyzja MG z 04.10, sesja T9a): **każdy** odczyt albo zapis czegokolwiek
 * z cudzej kampanii, także sama informacja, że obiekt istnieje, i link, który
 * wpuszcza po użyciu albo wygaśnięciu, to **B1**.
 */

const BARTEK_LOGIN = 'bartek-mg';
const BARTEK_PASSWORD = 'haslo-bartka-01';
const CAMPAIGN_A = 'Nocna zmiana';
const CAMPAIGN_B = 'Kampania B';
const SCENE_B = 'Rezydencja';
const MAP_B = { file: 'mapy/RockerMansion-33x24.png', width: 1470, height: 1070, columns: 33 };
const STATIST_B = 'Ochroniarz Rezydencji';
const BOT_B = 'Wykidajło';

interface AuthStore {
  status: string;
  user: { id: string; role: string; name: string; owner: boolean } | null;
  activeCampaign: { id: string; name: string } | null;
}

/** Odmowy tras (400–429) lądują w konsoli jako nieudany zasób — tu wywołane celowo. */
const REFUSALS = /status of (400|401|403|404|409|410|429)/;
/** Gniazdo zerwane przez serwer przy odtworzeniu kopii albo przełączeniu kampanii (Firefox). */
function socketDropped(text: string): boolean {
  return (
    /ws:\/\/\S*\/socket\.io\//.test(text) &&
    /can’t establish a connection|was interrupted/.test(text)
  );
}

async function cookieOf(actor: Actor): Promise<string> {
  return (await actor.context.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
}

async function authOf(actor: Actor): Promise<AuthStore> {
  return actor.store<AuthStore>('auth');
}

/** Wszystkie magazyny klienta z haka E2E jako JSON (funkcje i cykle pominięte). */
async function storesJson(actor: Actor): Promise<string> {
  return actor.page.evaluate(() => {
    const out: Record<string, string> = {};
    for (const [name, store] of Object.entries(window.__vttE2E?.stores ?? {})) {
      try {
        out[name] = JSON.stringify(store.getState());
      } catch {
        out[name] = '(cykl)';
      }
    }
    return JSON.stringify(out);
  });
}

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) out.push(join(entry.parentPath, entry.name));
  }
  return out.sort();
}

interface CompendiumRow {
  id: string;
  name: string;
}
type SyncWithCompendium = { compendium?: { entries?: CompendiumRow[] } } | null;

/** Wpisy kompendium MG-A z bazy: slug (id w synchronizacji) i nazwa. */
function customEntriesA(): CompendiumRow[] {
  return query<{ slug: string; data: string }>(
    `SELECT e.slug, e.data FROM CompendiumEntry e JOIN Campaign c ON c.id = e.campaignId
      WHERE c.name = ?`,
    CAMPAIGN_A,
  ).map((row) => ({ id: row.slug, name: (JSON.parse(row.data) as { name: string }).name }));
}

/** Migawka ograniczona do wierszy, których klucze były w `keys` (stan A). */
function restrictTo(snapshot: RowSnapshot, keys: RowSnapshot): RowSnapshot {
  const out: RowSnapshot = new Map();
  for (const [table, rows] of snapshot) {
    const allowed = keys.get(table);
    if (!allowed) continue;
    out.set(table, new Map([...rows].filter(([key]) => allowed.has(key))));
  }
  return out;
}

test.describe
  .serial('T9a izolacja dwóch MG: odczyt, zapis, pliki, linki, kopie, kompendium', () => {
  let mg: Actor;
  let marek: Actor;
  let ola: Actor;
  let bartek: Actor;
  let kuba: Actor;
  let marekB: Actor;
  let campaignA: string;
  let campaignB: string;
  /** Stan A sprzed wejścia MG-B: wszystko z `po-T6`. */
  let aRows: RowSnapshot;
  /** Kanarki, id wierszy, slugi kompendium MG i tokeny linków kampanii A. */
  let aSecrets: string[];
  let aUploads: string[];
  /** Tajne MG-B: przed graczami B i przed całą grupą A. */
  const fromB = new Canaries();
  /** Kanarki obiektów, które MG-A dokłada na starcie (baza wiedzy, tabela). */
  const extraA = new Canaries();
  /** Id wierszy B (po zbudowaniu) — dla podsłuchu grupy A. */
  let bIds: string[] = [];
  let bartekUserId = '';
  let kubaToken: string;
  let kubaId: string;
  let bEntries: CompendiumRow[] = [];

  const aActors = () => [mg, marek, ola];
  const bActors = () => [bartek, kuba, marekB];
  const bSecrets = () => [...fromB.secretNow, ...bIds];

  test.beforeAll(async () => {
    test.setTimeout(5 * 60_000);
    await startFromPoT6(DEAD_GATEWAY);
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('start z po-T6: MG-A, Marek i Ola przy stole; migawka stanu kampanii A', async ({
    cast,
  }) => {
    campaignA = queryOne<{ id: string }>('SELECT id FROM Campaign WHERE name = ?', CAMPAIGN_A)!.id;
    mg = await cast.mg('chromium');
    marek = await cast.gracz('Marek', 'chromium', await createInvitation(mg, campaignA, 'Marek'));
    ola = await cast.gracz('Ola', 'firefox', await createInvitation(mg, campaignA, 'Ola'));
    for (const actor of aActors()) {
      await expect
        .poll(async () => (await authOf(actor))?.activeCampaign?.name, { message: actor.name })
        .toBe(CAMPAIGN_A);
    }
    // `po-T6` nie ma wpisu bazy wiedzy, tabeli losowej ani rysunku — MG-A dokłada po
    // jednym (z kanarkiem), żeby macierz zapisu trafiała też w te rodzaje obiektów.
    const owner = await mg.socket();
    const sceneA = queryOne<{ id: string }>(
      'SELECT id FROM Scene WHERE campaignId = ? AND active = 1',
      campaignA,
    )!.id;
    const created = [
      await emitAck(owner, 'knowledge:upsert', {
        title: 'Kryjówka Pasera',
        body: `Zaplecze lombardu. ${extraA.secret('wiedza-A')}`,
        type: 'place',
        tags: [],
        visibility: 'gm',
      }),
      await emitAck(owner, 'table:upsert', {
        name: 'Plotki z Knajpy',
        formula: '1d6',
        description: '',
        visibility: 'gm',
        rows: [{ min: 1, max: 6, text: `Ktoś widział Cienia. ${extraA.secret('tabela-A')}` }],
      }),
      await emitAck(owner, 'drawing:create', {
        sceneId: sceneA,
        shape: { kind: 'rect', x: 100, y: 100, width: 80, height: 60 },
        style: { color: '#ff0000', width: 4, filled: false },
        gmOnly: true,
      }),
    ];
    expect(
      created.map((ack) => ack.ok),
      JSON.stringify(created),
    ).toEqual([true, true, true]);
    aRows = rowSnapshot();
    aUploads = uploadUrls(campaignA);
    aSecrets = [
      ...canariesInDatabase().keys(),
      ...stringIds(aRows),
      ...query<{ slug: string }>(
        'SELECT slug FROM CompendiumEntry WHERE campaignId = ?',
        campaignA,
      ).map((row) => row.slug),
      ...query<{ token: string }>(
        'SELECT token FROM Invitation WHERE campaignId = ?',
        campaignA,
      ).map((row) => row.token),
    ];
    expect(aUploads.length, 'pliki kampanii A').toBeGreaterThan(3);
    expect(canariesInDatabase().size, 'kanarki z rozgrywki').toBeGreaterThan(10);
    test.info().annotations.push({
      type: 'stan A',
      description: JSON.stringify({
        wiersze: [...aRows.values()].reduce((sum, rows) => sum + rows.size, 0),
        tajne: aSecrets.length,
        pliki: aUploads.length,
      }),
    });
  });

  test('9.2 MG-B zakłada konto w Firefoksie i „Kampanię B”; stół A pustoszeje (jedna aktywna kampania do 44c)', async ({
    cast,
  }) => {
    bartek = await cast.open('Bartek', 'firefox');
    const page = bartek.page;
    await page.goto('/');
    await page.getByRole('button', { name: 'Załóż konto MG' }).click();
    await page.locator('#register-login').fill(BARTEK_LOGIN);
    await page.locator('#register-password').fill(BARTEK_PASSWORD);
    await page.locator('#register-repeat').fill(BARTEK_PASSWORD);
    await page.getByRole('button', { name: 'Załóż konto' }).click();
    await expect.poll(async () => (await authOf(bartek))?.status).toBe('authenticated');
    await expect(page.getByLabel('Nowa kampania')).toBeVisible();
    // Pusty stół nowego MG: ani kampanii, ani śladu po A.
    expect(((await (await page.request.get('/api/campaigns')).json()) as unknown[]).length).toBe(0);

    await page.getByLabel('Nowa kampania').fill(CAMPAIGN_B);
    await page.getByRole('button', { name: 'Utwórz', exact: true }).click();
    await expect
      .poll(() => queryOne<{ id: string }>('SELECT id FROM Campaign WHERE name = ?', CAMPAIGN_B))
      .not.toBeUndefined();
    const row = queryOne<{ id: string; gmId: string; sessionStartedAt: string | null }>(
      'SELECT id, gmId, sessionStartedAt FROM Campaign WHERE name = ?',
      CAMPAIGN_B,
    )!;
    // Etap 44c: nowa kampania to przygotowanie, bez slotu.
    expect(row.sessionStartedAt).toBeNull();
    campaignB = row.id;
    bartekUserId = (await authOf(bartek)).user!.id;
    expect(row.gmId).toBe(bartekUserId);
    await expect.poll(async () => (await authOf(bartek))?.activeCampaign?.name).toBe(CAMPAIGN_B);
    // Od 44c kampania MG-B nie zdejmuje stołu grupie A (do 44b zdejmowała).
    for (const actor of aActors()) {
      await expect
        .poll(async () => (await authOf(actor))?.activeCampaign?.name, { message: actor.name })
        .toBe(CAMPAIGN_A);
    }
  });

  test('9.2 MG-B buduje przez UI: scena z mapą, portrety, statysta z kartą, handout, notatka, bot', async () => {
    test.setTimeout(6 * 60_000);
    const page = bartek.page;
    await page.getByRole('button', { name: 'Sceny', exact: true }).click();
    await page.getByRole('textbox', { name: 'Nazwa nowej sceny' }).fill(SCENE_B);
    await page.getByRole('button', { name: 'Utwórz', exact: true }).click();
    const editor = page.locator('.scene-editor');
    if (!(await editor.isVisible())) {
      await sceneListRow(page, SCENE_B).getByRole('button', { name: 'Edytuj' }).click();
    }
    await editor
      .locator('.scene-upload-button input[type=file]')
      .setInputFiles(material(MAP_B.file));
    await expect(editor.getByText(new RegExp(`^${MAP_B.width}×\\d+ px$`))).toBeVisible();
    await editor.getByRole('tab', { name: 'Siatka' }).click();
    await editor.locator('#grid-columns').fill(String(MAP_B.columns));
    // Od etapu 45 nowa scena startuje w Dynamicznej; T9b liczy na ręczną mgłę.
    await editor.getByRole('tab', { name: 'Widoczność' }).click();
    await editor.locator('#scene-visibility').selectOption('fog');
    await editor.getByRole('button', { name: 'Zapisz' }).click();
    await expect(editor).toBeHidden();
    await sceneListRow(page, SCENE_B).getByRole('button', { name: 'Aktywuj' }).click();
    await expect
      .poll(
        () =>
          queryOne<{ active: number }>('SELECT active FROM Scene WHERE name = ?', SCENE_B)?.active,
      )
      .toBe(1);
    const sceneB = queryOne<{ id: string }>('SELECT id FROM Scene WHERE name = ?', SCENE_B)!.id;
    const viewed = async () =>
      (await bartek.store<{ scene: { name: string } | null }>('scene'))?.scene?.name;
    if ((await viewed()) !== SCENE_B) {
      await sceneListRow(page, SCENE_B).getByRole('button', { name: 'Pokaż' }).click();
    }
    await expect.poll(viewed).toBe(SCENE_B);
    await fitCamera(page, MAP_B.width, MAP_B.height);

    // Portrety: gracz i NPC (portret NPC tylko dla MG — kanarek).
    const npcName = fromB.secret('portret-NPC-B');
    await page.getByRole('button', { name: 'Postacie', exact: true }).click();
    await page.getByRole('button', { name: 'Portrety — biblioteka MG' }).click();
    await page
      .locator('.portrait-pool-head input[type=file]')
      .setInputFiles([
        material('avatary/avatar20.png'),
        materialAs('avatary/avatar22.png', `${npcName}.png`),
      ]);
    await expect(page.getByText('Dodano: 2 z 2. Nie dodano: 0.')).toBeVisible();
    await page
      .getByRole('button', { name: `Przenieś portret „${npcName}” do portretów NPC` })
      .click();
    await expect
      .poll(
        () =>
          queryOne<{ gmOnly: number }>('SELECT gmOnly FROM PortraitAsset WHERE name = ?', npcName)
            ?.gmOnly,
      )
      .toBe(1);
    await page.getByRole('button', { name: 'Zamknij', exact: true }).click();

    await placeStatist(
      page,
      sceneB,
      'avatary/avatar21.png',
      { x: 400, y: 400 },
      STATIST_B,
      { ref: 6, skill: 5, dodge: 4, armor: 11, weapon: 'Ciężki pistolet' },
      30,
    );
    await gmNote(
      page,
      { x: 700, y: 500 },
      `Sejf za obrazem w gabinecie. ${fromB.secret('notatka-B')}`,
    );

    await page.getByRole('button', { name: 'Handouty', exact: true }).click();
    await page.getByRole('button', { name: '+ Nowy handout' }).click();
    const form = page.locator('form.handout-form');
    await form.getByRole('textbox').first().fill('Lista gości');
    await form.locator('textarea').fill(`Goście na dziś. ${fromB.secret('handout-B')}`);
    await form.getByRole('button', { name: 'Dodaj handout' }).click();
    await expect(page.locator('.handout-row', { hasText: 'Lista gości' })).toBeVisible();

    await createBot(
      page,
      'Solo — ochroniarz',
      BOT_B,
      {
        Osobowość: 'Bramkarz rezydencji rockmana, mrukliwy i podejrzliwy.',
        'Motywacje i cele': 'Nikogo nie wpuścić bez zaproszenia z listy gości.',
        Sekrety: `Bierze łapówki od paparazzi. ${fromB.secret('sekret-bota-B')}`,
        'Styl wypowiedzi': 'Krótko, ulicznym slangiem.',
      },
      STATIST_B,
    );
    // Id wierszy B (nowe od migawki A) — kanarki „obiekt istnieje” dla grupy A.
    bIds = newRows(aRows)
      .map((row) => (JSON.parse(row.json) as { id?: unknown }).id)
      .filter((id): id is string => typeof id === 'string' && /^[a-z0-9]{20,}$/i.test(id));
    expect(bIds.length).toBeGreaterThan(5);
  });

  test('9.6 imienne linki MG-B z Panelu MG: Kuba (Chromium) i Marek (Firefox); Marek u MG-B to inne konto', async ({
    cast,
  }) => {
    const page = bartek.page;
    await page.goto('/gm');
    const issue = async (name: string) => {
      await page.getByPlaceholder('Imię nowego gracza').fill(name);
      await page.getByRole('button', { name: 'Nowy gracz' }).click();
      const link = page.locator('.invite-row', { hasText: name }).locator('code.invite-url');
      await expect(link).toBeVisible();
      return new URL((await link.textContent()) ?? '').pathname.replace(/^\/join\//, '');
    };
    kubaToken = await issue('Kuba');
    const marekToken = await issue('Marek');
    await page.goto('/');
    // Etap 44c: MG-B rozpoczyna sesję z górnego paska (Firefox) — dopiero wtedy
    // gracze B siadają przy stole. Dwie sesje naraz: A i B.
    await page.getByRole('button', { name: 'Rozpocznij sesję' }).click();
    await expect(page.locator('.session-state--live')).toContainText('sesja');
    expect(
      queryOne<{ n: number }>(
        'SELECT COUNT(*) AS n FROM Campaign WHERE sessionStartedAt IS NOT NULL',
      )!.n,
    ).toBe(2);

    kuba = await cast.gracz('Kuba', 'chromium', kubaToken);
    marekB = await cast.gracz('Marek', 'firefox', marekToken);
    kubaId = (await authOf(kuba)).user!.id;
    const marekBId = (await authOf(marekB)).user!.id;
    const marekAId = (await authOf(marek)).user!.id;
    expect(marekBId).not.toBe(marekAId);
    for (const actor of [kuba, marekB]) {
      await expect
        .poll(async () => (await authOf(actor))?.activeCampaign?.name, { message: actor.name })
        .toBe(CAMPAIGN_B);
    }
    // Członkostwo: każde konto gracza w jednej kampanii.
    const memberships = (userId: string) =>
      query<{ campaignId: string }>(
        'SELECT campaignId FROM CampaignMember WHERE userId = ?',
        userId,
      ).map((row) => row.campaignId);
    expect(memberships(kubaId)).toEqual([campaignB]);
    expect(memberships(marekBId)).toEqual([campaignB]);
    expect(memberships(marekAId)).toEqual([campaignA]);
    // Marek u MG-B nie ma karty Kowala ani niczego z A.
    expect(await storesJson(marekB)).not.toContain('Kowal');
    bIds.push(kubaId, marekBId);
  });

  test('9.2 izolacja odczytu: MG-B, Kuba i Marek B nie widzą niczego z kampanii A', async () => {
    const page = bartek.page;
    const campaigns = (await (await page.request.get('/api/campaigns')).json()) as {
      name: string;
    }[];
    expect(campaigns.map((c) => c.name)).toEqual([CAMPAIGN_B]);
    for (const [path, column] of [
      ['/api/portrait-assets', 'PortraitAsset'],
      ['/api/token-assets', 'TokenAsset'],
    ] as const) {
      const list = (await (await page.request.get(path)).json()) as { id: string }[];
      const own = query<{ id: string }>(`SELECT id FROM ${column} WHERE campaignId = ?`, campaignB)
        .map((row) => row.id)
        .sort();
      expect(list.map((item) => item.id).sort(), path).toEqual(own);
    }
    // Panel MG-B: jedna scena i własny bot (reszta — magazyny i podsłuch niżej).
    await page.getByRole('button', { name: 'Sceny', exact: true }).click();
    await expect(page.locator('.scene-row')).toHaveCount(1);
    await expect(sceneListRow(page, SCENE_B)).toBeVisible();
    await page.getByRole('button', { name: 'Boty', exact: true }).click();
    await expect(page.getByText(BOT_B).first()).toBeVisible();

    for (const actor of bActors()) {
      const stores = await storesJson(actor);
      const inStores = aSecrets.filter((code) => stores.includes(code));
      expect(inStores, `${actor.name}: magazyny klienta`).toEqual([]);
      const heard = await actor.sniffer.found(aSecrets);
      expect(heard, `${actor.name}: podsłuch`).toEqual([]);
    }
    // Gracze B nie dostają tajnych MG-B (bonus symetrii); MG-B dostaje swoje.
    for (const player of [kuba, marekB]) {
      expect(await player.sniffer.found(fromB.secretNow), player.name).toEqual([]);
    }
    expect((await bartek.sniffer.found(fromB.secretNow)).length).toBeGreaterThan(0);
  });

  test('9.5 pliki kampanii A: 404 dla MG-B, Kuby i Marka B po dokładnym adresie, 401 bez logowania; w drugą stronę tak samo', async () => {
    const bUploads = uploadUrls(campaignB);
    expect(bUploads.length).toBeGreaterThan(2);
    const anon = await request.newContext({ baseURL: SERVER_URL });
    const status = async (actor: Actor | null, url: string) =>
      (actor ? await actor.page.request.get(url) : await anon.get(url)).status();
    for (const url of aUploads) {
      for (const actor of bActors())
        expect(await status(actor, url), `${actor.name} ${url}`).toBe(404);
      expect(await status(null, url), `bez logowania ${url}`).toBe(401);
    }
    // Właściciel pliku dalej go dostaje, choć jego kampania nie jest teraz aktywna.
    const mapA = aUploads.find((url) => url.includes('/maps/'))!;
    expect(await status(mg, mapA)).toBe(200);
    expect(await status(marek, mapA)).toBe(200);
    const mapB = bUploads.find((url) => url.includes('/maps/'))!;
    expect(await status(kuba, mapB)).toBe(200);
    expect(await status(bartek, mapB)).toBe(200);
    for (const url of bUploads) {
      for (const actor of aActors())
        expect(await status(actor, url), `${actor.name} ${url}`).toBe(404);
    }
    // Ta sama ścieżka „przebrana” (`%2e%2e`, wielkie litery katalogu) nie omija strażnika.
    const [, rest] = mapA.split(`/campaigns/${campaignA}/`);
    // Prosto na serwer: podgląd Vite oddałby na nieznaną ścieżkę `index.html` z 200.
    for (const actor of [kuba, bartek]) {
      const direct = await request.newContext({
        baseURL: SERVER_URL,
        extraHTTPHeaders: { cookie: await cookieOf(actor) },
      });
      expect((await direct.get(mapB)).status(), `${actor.name}: kontrola`).toBe(200);
      for (const trick of [
        `/uploads/campaigns/${campaignB}/%2e%2e/${campaignA}/${rest}`,
        `/uploads/campaigns/${campaignB}/..%2f${campaignA}/${rest}`,
        `/%75ploads/campaigns/${campaignA}/${rest}`,
        `/uploads/campaigns/${campaignA.toUpperCase()}/${rest}`,
      ]) {
        const response = await direct.get(trick);
        expect(response.status(), `${actor.name} ${trick}`).not.toBe(200);
      }
      await direct.dispose();
    }
    await anon.dispose();
  });

  test('9.9 kompendium: podręcznik wspólny (66 umiejętności), wpisy MG-A tylko u MG-A', async () => {
    for (const actor of [bartek, kuba]) {
      const data = (await (await actor.page.request.get('/api/cpred/data')).json()) as {
        skills: unknown[];
      };
      expect(data.skills, actor.name).toHaveLength(66);
    }
    const custom = customEntriesA();
    expect(custom.length, 'wpisy własne MG-A (granat, pięści)').toBeGreaterThan(0);
    for (const actor of [bartek, kuba]) {
      const tap = await new TappedSocket(await cookieOf(actor)).connect();
      const entries = (tap.sync as SyncWithCompendium)?.compendium?.entries ?? [];
      tap.close();
      if (actor === kuba) bEntries = entries;
      expect(entries.length, `${actor.name}: katalog z podręcznika`).toBeGreaterThan(50);
      // Wpis MG-A albo go nie ma, albo to wersja z podręcznika (inna nazwa).
      const leaked = custom.filter((own) =>
        entries.some((entry) => entry.id === own.id && entry.name === own.name),
      );
      expect(leaked, actor.name).toEqual([]);
    }
  });

  test('9.3 macierz zapisu: każde zdarzenie z gniazda MG-B i Kuby na obiektach A — odmowa, A nietknięte', async () => {
    test.setTimeout(20 * 60_000);
    const objects = campaignObjects(campaignA, 'Marek');
    const missing = Object.entries(objects)
      .filter(([, value]) => value === undefined)
      .map(([key]) => key);
    test.info().annotations.push({ type: 'brak obiektu w po-T6', description: missing.join(', ') });
    const keys = payloadKeys();
    const events = realtimeEvents();
    // Napisowe id (cuid) — liczbowe id czatu jako ciąg cyfr siedzi w każdej ramce.
    const sentIds = Object.values(objects).filter(
      (value): value is string => typeof value === 'string',
    );
    const unsent = aSecrets.filter((code) => !sentIds.includes(code));
    const before = rowSnapshot();
    const aDir = join(UPLOADS_DIR, 'campaigns', campaignA);
    const aFiles = filesUnder(aDir);
    const log = new ServerLog();
    log.mark();
    const aMarks = await Promise.all(aActors().map((actor) => actor.sniffer.mark()));

    const summary: Record<string, Record<string, number>> = {};
    const accepted: string[] = [];
    /** MG-B dostaje `FORBIDDEN` tylko tam, gdzie zdarzenie nie jest dla MG (właściciel, gracz). */
    const forbidden = new Set<string>();
    const silent: string[] = [];
    for (const [who, actor] of [
      ['MG-B', bartek],
      ['Kuba', kuba],
    ] as const) {
      const tap = await new TappedSocket(await cookieOf(actor)).connect();
      const counts: Record<string, number> = {};
      for (const event of events) {
        for (const sample of ownershipProbes(objects, keys, event.name)) {
          const outcome = await tap.probe(event.name, sample);
          const label =
            outcome.kind === 'ack' ? (outcome.ack.ok ? 'ok' : outcome.ack.error) : outcome.kind;
          counts[label] = (counts[label] ?? 0) + 1;
          if (label === 'ok') accepted.push(`${who} ${event.name} (${sample.label})`);
          if (label === 'FORBIDDEN' && who === 'MG-B') forbidden.add(event.name);
          if (outcome.kind !== 'ack')
            silent.push(`${who} ${event.name} (${sample.label}): ${label}`);
        }
      }
      summary[who] = counts;
      // Tajne A, których B nie wysłał, nie mogą wrócić w żadnej ramce ani w acku;
      // wysłane id mogą wrócić tylko w odpowiedzi na własną próbę (echo), nie w rozgłoszeniu.
      expect(tap.found(unsent), `${who}: tajne A w gnieździe`).toEqual([]);
      const broadcasts = tap.received.filter((text) => !text.startsWith('ack '));
      expect(
        sentIds.filter((id) => broadcasts.some((text) => text.includes(id))),
        `${who}: id A w rozgłoszeniach`,
      ).toEqual([]);
      tap.close();
    }
    test
      .info()
      .annotations.push({ type: 'odpowiedzi macierzy', description: JSON.stringify(summary) });
    test.info().annotations.push({ type: 'przyjęte (ok)', description: accepted.join('; ') });
    // Dowód do notatki sesji: kody odpowiedzi i zdarzenia przyjęte (działały na własnej kampanii).
    recordMeasurement('t9a-macierz', 'zapis', {
      zdarzen: events.length,
      prob: events.length * 3,
      brakObiektow: missing,
      odpowiedzi: summary,
      przyjete: accepted,
      zakazaneMgB: [...forbidden].sort(),
    });

    expect(await serverAlive()).toBe(true);
    expect(changedRows(restrictTo(before, aRows)), 'wiersze A zmienione przez B').toEqual([]);
    const pointing = newRows(before).filter((row) =>
      aSecrets.some((code) => row.json.includes(code)),
    );
    expect(pointing, 'nowe wiersze wskazujące obiekty A').toEqual([]);
    expect(filesUnder(aDir), 'pliki A').toEqual(aFiles);
    expect(silent, 'zdarzenia bez odpowiedzi albo zerwane').toEqual([]);
    expect.soft(log.handlerFailures(), 'INTERNAL w logu').toEqual([]);
    for (const [index, actor] of aActors().entries()) {
      expect(await actor.sniffer.found(bSecrets(), aMarks[index]), actor.name).toEqual([]);
    }
  });

  test('9.3 trasy REST MG-B i Kuby na obiektach A: odmowa, A nietknięte', async () => {
    const objects = campaignObjects(campaignA, 'Marek');
    const before = rowSnapshot();
    const calls: [string, string][] = [
      ['GET', `/api/archive/character/${objects.character}`],
      ['GET', `/api/archive/scene/${objects.scene}`],
      ['POST', `/api/campaigns/${campaignA}/sandbox`],
      ['POST', `/api/campaigns/${campaignA}/invitations`],
      ['POST', `/api/campaigns/${campaignA}/players/${objects.user}/renewal`],
      ['POST', `/api/campaigns/${campaignB}/players/${objects.user}/renewal`],
      ['POST', `/api/invitations/${objects.invitation}/revoke`],
      ['DELETE', `/api/portrait-assets/${objects.portraitAsset}`],
      ['POST', `/api/music/${campaignA}/youtube`],
      ['POST', `/api/music/${campaignA}/upload`],
    ];
    const results: string[] = [];
    for (const actor of [bartek, kuba]) {
      for (const [method, path] of calls) {
        const response = await actor.page.request.fetch(path, {
          method,
          data:
            method === 'POST'
              ? { name: 'Intruz', url: 'https://example.com/x', sandbox: true }
              : undefined,
        });
        results.push(
          `${actor.name} ${method} ${path.replace(/[a-z0-9]{20,}/gi, '…')} ${response.status()}`,
        );
        // MG-B: obca kampania jak nieistniejąca (404) albo „nie twoja aktywna” (409 muzyki);
        // gracz: 403 na trasach MG.
        expect(
          actor === bartek ? [404, 409] : [403],
          `${actor.name} ${method} ${path}: ${response.status()}`,
        ).toContain(response.status());
        const body = await response.text();
        expect(aSecrets.filter((code) => body.includes(code) && !path.includes(code))).toEqual([]);
      }
    }
    test.info().annotations.push({ type: 'trasy REST', description: results.join('; ') });
    recordMeasurement('t9a-macierz', 'rest', { wyniki: results });
    // Własna kampania z cudzym graczem w środku ścieżki — też obca.
    expect(changedRows(restrictTo(before, aRows))).toEqual([]);
    // MG-A nie wystawi linku do kampanii B.
    const reverse = await mg.page.request.post(`/api/campaigns/${campaignB}/invitations`, {
      data: { name: 'Intruz' },
    });
    expect(reverse.status()).toBe(404);
  });

  test('9.6 linki: drugi raz nie wpuszcza, odnowienie na to samo konto, unieważniony i wygasły nie wpuszczają, imię zajęte w kampanii', async ({
    cast,
  }) => {
    // Link Kuby po użyciu — w innej przeglądarce, przez UI i przez API.
    const again = await cast.open('Kuba-ponownie', 'firefox');
    await again.page.goto(`/join/${kubaToken}`);
    await expect(again.page.getByRole('heading', { name: 'Link już wykorzystany' })).toBeVisible();
    const anon = await request.newContext({ baseURL: SERVER_URL });
    expect((await anon.post(`/api/join/${kubaToken}`)).status()).toBe(410);

    const page = bartek.page;
    await page.goto('/gm');
    // Imię zajęte w kampanii B.
    await page.getByPlaceholder('Imię nowego gracza').fill('Kuba');
    await page.getByRole('button', { name: 'Nowy gracz' }).click();
    await expect(page.locator('.auth-error')).toHaveText(
      'Przy tym stole ktoś już nosi to imię albo czeka na nie link — wybierz inne.',
    );
    await page.getByPlaceholder('Imię nowego gracza').fill('');

    // Link odnowienia Kuby: to samo konto, pierwsza przeglądarka dalej zalogowana.
    await page
      .locator('.player-row', { hasText: 'Kuba' })
      .getByRole('button', { name: 'Link odnowienia' })
      .click();
    const renewal = page
      .locator('.invite-row', { hasText: 'Kuba' })
      .filter({ hasText: 'odnowienie' })
      .locator('code.invite-url');
    await expect(renewal).toBeVisible();
    const renewalToken = new URL((await renewal.textContent()) ?? '').pathname.replace(
      /^\/join\//,
      '',
    );
    const kuba2 = await cast.gracz('Kuba', 'firefox', renewalToken);
    expect((await authOf(kuba2)).user!.id).toBe(kubaId);
    expect((await authOf(kuba)).status).toBe('authenticated');
    expect((await anon.post(`/api/join/${renewalToken}`)).status()).toBe(410);

    // Unieważniony.
    await page.getByPlaceholder('Imię nowego gracza').fill('Zosia');
    await page.getByRole('button', { name: 'Nowy gracz' }).click();
    const zosia = page.locator('.invite-row', { hasText: 'Zosia' });
    const zosiaToken = new URL(
      (await zosia.locator('code.invite-url').textContent()) ?? '',
    ).pathname.replace(/^\/join\//, '');
    await zosia.getByRole('button', { name: 'Unieważnij' }).click();
    await expect(
      page.locator('.invite-row', { hasText: 'Zosia' }).locator('code.invite-url'),
    ).toHaveCount(0);
    expect((await anon.post(`/api/join/${zosiaToken}`)).status()).toBe(404);
    await again.page.goto(`/join/${zosiaToken}`);
    await expect(again.page.getByRole('heading', { name: 'Zaproszenie nieważne' })).toBeVisible();

    // Wygasły (ważność skrócona trasą, jak T2 6.2.7).
    const expiring = await page.request.post(`/api/campaigns/${campaignB}/invitations`, {
      data: { name: 'Spóźniony', expiresInHours: 1 / 3600 },
    });
    expect(expiring.status()).toBe(201);
    const expiredToken = ((await expiring.json()) as { token: string }).token;
    await page.waitForTimeout(1_500);
    expect((await anon.post(`/api/join/${expiredToken}`)).status()).toBe(410);
    await again.page.goto(`/join/${expiredToken}`);
    await expect(again.page.getByRole('heading', { name: 'Link wygasł' })).toBeVisible();

    // Kuba nie wystawia linków; obce kampanie nie przyjmują jego konta.
    expect(
      (
        await kuba.page.request.post(`/api/campaigns/${campaignB}/invitations`, {
          data: { name: 'X' },
        })
      ).status(),
    ).toBe(403);
    expect(query('SELECT campaignId FROM CampaignMember WHERE userId = ?', kubaId)).toEqual([
      { campaignId: campaignB },
    ]);
    await anon.dispose();
    await page.goto('/');
  });

  test('9.7 eksport kampanii MG-B bez niczego z A; MG-B bez kopii całej bazy w UI i na serwerze', async () => {
    const page = bartek.page;
    const response = await page.request.get('/api/archive/campaign');
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(
      aSecrets.filter((code) => text.includes(code)),
      'eksport B',
    ).toEqual([]);
    expect(text).toContain(STATIST_B);
    expect(text).toContain(campaignB);

    await expect.poll(async () => (await authOf(bartek))?.activeCampaign?.name).toBe(CAMPAIGN_B);
    await page.getByRole('button', { name: 'Kopie', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Zrzut całej kampanii' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Kopie zapasowe' })).toHaveCount(0);
    const socket = await bartek.socket();
    expect(await emitAck(socket, 'archive:list', {})).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await emitAck(socket, 'archive:snapshot', {})).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
  });

  test('9.2 dwie sesje naraz, koniec sesji B nie rusza A; nic nie przecieka w obie strony', async () => {
    const bMarks = await Promise.all(bActors().map((actor) => actor.sniffer.mark()));
    // Grupa A przez cały czas przy stole — kampania B niczego jej nie zdjęła.
    const atTable = async () => {
      for (const actor of aActors()) {
        await expect
          .poll(async () => (await authOf(actor))?.activeCampaign?.name, { message: actor.name })
          .toBe(CAMPAIGN_A);
        await expect
          .poll(
            async () =>
              (await actor.store<{ scene: { name: string } | null }>('scene'))?.scene?.name ?? null,
            { message: actor.name },
          )
          .not.toBeNull();
      }
    };
    await atTable();

    // MG-B kończy sesję (Firefox, dwa kliknięcia): gracze B wracają do widoku
    // między sesjami, MG-B zostaje w przygotowaniu.
    const page = bartek.page;
    await page.getByRole('button', { name: 'Zakończ sesję' }).click();
    await page.getByRole('button', { name: 'Na pewno? Zakończ' }).click();
    await expect(page.locator('.session-state--prep')).toHaveText('przygotowanie');
    for (const actor of [kuba, marekB]) {
      await expect(actor.page.locator('.between-sessions')).toBeVisible();
      await expect(actor.page.getByLabel('Wiadomość czatu')).toBeDisabled();
      expect((await authOf(actor))?.activeCampaign?.name).toBe(CAMPAIGN_B);
    }
    await atTable();
    expect(
      queryOne<{ sessionStartedAt: string | null }>(
        'SELECT sessionStartedAt FROM Campaign WHERE id = ?',
        campaignA,
      )?.sessionStartedAt,
    ).not.toBeNull();
    for (const [index, actor] of bActors().entries()) {
      expect(
        await actor.sniffer.found(aSecrets, bMarks[index]),
        `${actor.name} po końcu sesji B`,
      ).toEqual([]);
      expect(await actor.sniffer.found(aSecrets), `${actor.name} cały przebieg`).toEqual([]);
    }
    // Właściciel widzi konta MG w „Konta MG” (44a) — id konta MG-B to u niego nie wyciek.
    for (const actor of aActors()) {
      const secrets = bSecrets().filter((code) => !(actor === mg && code === bartekUserId));
      expect(await actor.sniffer.found(secrets), `${actor.name}: tajne B`).toEqual([]);
    }

    // Kompendium MG-A = katalog B + wpisy własne A (ten sam podręcznik dla obu).
    const tap = await new TappedSocket(await cookieOf(mg)).connect();
    const aEntries = (tap.sync as SyncWithCompendium)?.compendium?.entries ?? [];
    tap.close();
    const custom = customEntriesA();
    const key = (entry: CompendiumRow) => JSON.stringify(entry);
    const bKeys = new Set(bEntries.map(key));
    const aKeys = new Set(aEntries.map(key));
    expect(
      aEntries
        .filter((entry) => !bKeys.has(key(entry)))
        .map((entry) => entry.id)
        .sort(),
      'A minus B = wpisy własne A',
    ).toEqual([...new Set(custom.map((entry) => entry.id))].sort());
    expect(
      bEntries.filter(
        (entry) => !aKeys.has(key(entry)) && !custom.some((own) => own.id === entry.id),
      ),
      'B minus A = tylko wpisy podmienione przez A',
    ).toEqual([]);
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

  test('9.7 kopia całej bazy właściciela: odtworzenie zachowuje właścicieli kampanii', async ({
    cast,
  }) => {
    test.setTimeout(5 * 60_000);
    type SnapshotList = { snapshots: { name: string }[] };
    const socket = await mg.socket();
    const listed = await emitAck<SnapshotList>(socket, 'archive:list', {});
    const known = new Set(listed.ok ? (listed.data?.snapshots ?? []).map((s) => s.name) : []);
    const ack = await emitAck<SnapshotList>(socket, 'archive:snapshot', {}, 60_000);
    expect(ack.ok).toBe(true);
    const mine = (ack.ok ? (ack.data?.snapshots ?? []) : []).filter((s) => !known.has(s.name));
    expect(mine).toHaveLength(1);
    const owners = query<{ id: string; name: string; gmId: string }>(
      'SELECT id, name, gmId FROM Campaign ORDER BY name',
    );
    expect(owners.map((row) => row.name)).toEqual([CAMPAIGN_B, CAMPAIGN_A].sort());

    await cast.closeAll();
    await stopInstance();
    await restoreBackup(mine[0]!.name);
    await startInstance(DEAD_GATEWAY);
    expect(query('SELECT id, name, gmId FROM Campaign ORDER BY name')).toEqual(owners);

    const login = async (login: string, password: string) => {
      const api = await request.newContext({ baseURL: SERVER_URL });
      expect((await api.post('/api/auth/login', { data: { login, password } })).status()).toBe(200);
      const names = ((await (await api.get('/api/campaigns')).json()) as { name: string }[]).map(
        (c) => c.name,
      );
      await api.dispose();
      return names;
    };
    expect(await login(BARTEK_LOGIN, BARTEK_PASSWORD)).toEqual([CAMPAIGN_B]);
    expect(await login(GM_LOGIN, process.env.E2E_GM_PASSWORD!)).toEqual([CAMPAIGN_A]);
    // Dwie kampanie dwóch MG — start oględzin i T9b (hasło Bartka wyżej, gracze B linkiem odnowienia).
    saveCheckpoint('po-T9a');
  });
});
