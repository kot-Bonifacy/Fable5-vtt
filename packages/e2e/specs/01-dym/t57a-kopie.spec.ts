import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { query, queryOne } from '../../fixtures/db.ts';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { readPackage } from '../../fixtures/archive.ts';
import { createCampaign } from '../../fixtures/table.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { E2E_DIR, REPO_DIR, UPLOADS_DIR } from '../../instance/paths.ts';

/**
 * Etap 57a — paczka ZIP jest samowystarczalna (kryterium ukończenia): scena
 * z mapą pobrana w kampanii A i wczytana w kampanii B tego MG pokazuje mapę
 * także po usunięciu pliku mapy z katalogu A. Całość przez zakładkę „Kopie”:
 * „Pobierz scenę” i jedno „Wczytaj z pliku…”.
 */
test.describe.serial('@szybkie 57a: scena z mapą z kampanii A do kampanii B', () => {
  const OUT_DIR = join(E2E_DIR, 'tmp', 't57a');
  const SCENE = 'Brama 57a';
  const MAP = join(REPO_DIR, 'data/public/maps/night-city-crossroads-2508.webp');
  let mg: Actor;
  let campaignA = '';
  let campaignB = '';
  let mapUrl = '';
  let zipPath = '';

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('A: scena z mapą i figurą, „Pobierz scenę” daje paczkę z mapą w środku', async ({
    cast,
  }) => {
    mg = await cast.mg('chromium');
    const socket = await mg.socket();
    // Z trwającą sesją nowa kampania nie otwiera się MG — kończymy cudze przebiegi.
    for (const { id } of query<{ id: string }>(
      'SELECT id FROM Campaign WHERE sessionStartedAt IS NOT NULL',
    )) {
      expect((await emitAck(socket, 'session:end', { campaignId: id })).ok).toBe(true);
    }
    campaignA = await createCampaign(mg, 'Kopie 57a — źródło', { session: false });
    expect((await emitAck(socket, 'campaign:open', { campaignId: campaignA })).ok).toBe(true);

    const upload = await mg.page.request.post('/api/uploads/maps', {
      multipart: {
        file: {
          name: 'skrzyzowanie.webp',
          mimeType: 'image/webp',
          buffer: readFileSync(MAP),
        },
      },
    });
    expect(upload.status(), await upload.text()).toBe(201);
    const map = (await upload.json()) as { url: string; width: number; height: number };
    mapUrl = map.url;
    const scene = await emitAck<{ id: string }>(socket, 'scene:create', { name: SCENE });
    expect(scene.ok).toBe(true);
    const sceneId = (scene as { data: { id: string } }).data.id;
    expect(
      (await emitAck(socket, 'scene:update', { sceneId, patch: { background: map } })).ok,
    ).toBe(true);
    expect(
      (
        await emitAck(socket, 'token:create', {
          sceneId,
          name: 'Wartownik',
          x: 300,
          y: 300,
        })
      ).ok,
    ).toBe(true);
    socket.disconnect();

    await mg.page.reload();
    await expect(mg.page.locator('.top-bar-campaign')).toHaveText('Kopie 57a — źródło');
    await mg.page.getByRole('button', { name: 'Kopie', exact: true }).click();
    await mg.page.getByLabel('Scena do pobrania').selectOption({ label: SCENE });
    mkdirSync(OUT_DIR, { recursive: true });
    const pending = mg.page.waitForEvent('download');
    await mg.page.getByRole('button', { name: 'Pobierz scenę' }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(/^scene-.*\.zip$/);
    zipPath = join(OUT_DIR, 'scena.zip');
    await download.saveAs(zipPath);

    const file = await readPackage(zipPath);
    expect(file.manifest).toMatchObject({
      app: 'vtt',
      kind: 'scene',
      campaignName: 'Kopie 57a — źródło',
    });
    expect(file.manifest.entries.map((entry) => entry.url)).toEqual([mapUrl]);
    expect(file.files).toEqual([`files/maps/${mapUrl.split('/').pop()}`]);
  });

  test('B: „Wczytaj z pliku…” stawia scenę, a mapa żyje po usunięciu pliku w A', async () => {
    const socket = await mg.socket();
    campaignB = await createCampaign(mg, 'Kopie 57a — cel', { session: false });
    expect((await emitAck(socket, 'campaign:open', { campaignId: campaignB })).ok).toBe(true);
    socket.disconnect();
    const page = mg.page;
    await expect(page.locator('.top-bar-campaign')).toHaveText('Kopie 57a — cel');

    await page.getByRole('button', { name: 'Kopie', exact: true }).click();
    await page.getByLabel('Plik kopii do wczytania').setInputFiles(zipPath);
    const done = page.locator('.notice[data-notice-topic="archive"] .notice-text', {
      hasText: `Wczytano scenę „${SCENE}”`,
    });
    await expect(done).toBeVisible();
    await expect(done).toContainText('podglądzie');
    await expect(
      page.getByLabel('Scena do pobrania').locator('option', { hasText: SCENE }),
    ).toHaveCount(1);

    // Plik mapy w A znika — scena w B ma własną kopię z paczki.
    const source = join(UPLOADS_DIR, ...mapUrl.replace(/^\/uploads\//, '').split('/'));
    expect(existsSync(source)).toBe(true);
    unlinkSync(source);
    expect((await page.request.get(mapUrl)).status()).toBe(404);

    const scene = queryOne<{ backgroundUrl: string; active: number }>(
      'SELECT backgroundUrl, active FROM Scene WHERE campaignId = ? AND name = ?',
      campaignB,
      SCENE,
    )!;
    expect(scene.active).toBe(0);
    expect(scene.backgroundUrl.startsWith(`/uploads/campaigns/${campaignB}/maps/`)).toBe(true);
    const copy = await page.request.get(scene.backgroundUrl);
    expect(copy.status()).toBe(200);
    expect((await copy.body()).length).toBeGreaterThan(100_000);
    expect(
      queryOne<{ n: number }>(
        `SELECT count(*) AS n FROM Token t JOIN Scene s ON s.id = t.sceneId
          WHERE s.campaignId = ? AND t.name = 'Wartownik'`,
        campaignB,
      )!.n,
    ).toBe(1);
  });
});
