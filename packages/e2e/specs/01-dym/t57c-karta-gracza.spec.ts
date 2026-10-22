import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { query, queryOne } from '../../fixtures/db.ts';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { readPackage } from '../../fixtures/archive.ts';
import { createCampaign, createInvitation } from '../../fixtures/table.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { E2E_DIR, REPO_DIR } from '../../instance/paths.ts';

/**
 * Etap 57c — kopia postaci gracza (kryterium ukończenia): gracz pobiera kopię
 * swojej karty „⤓” na belce, zgłasza ją w drugiej kampanii tego samego MG
 * („Zgłoś kartę z pliku…” w „Postaciach”), a MG przyjmuje na karcie czatu —
 * karta z portretem jest u gracza. Gracz i MG w osobnych kontekstach
 * i silnikach: MG Chromium, gracz Firefox. Bez sesji — gracz siedzi „Między
 * sesjami”, gdzie karta, czat i zgłoszenie są dostępne.
 */
test.describe.serial('@szybkie 57c: karta gracza z kampanii A do kampanii B przez MG', () => {
  const OUT_DIR = join(E2E_DIR, 'tmp', 't57c');
  const CARD = 'Kira 57c';
  const PORTRAIT = join(REPO_DIR, 'data/public/maps/night-city-crossroads-2508.webp');
  let mg: Actor;
  let olaA: Actor;
  let olaB: Actor;
  let campaignA = '';
  let campaignB = '';
  let zipPath = '';

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('A: gracz pobiera kopię własnej karty z portretem', async ({ cast }) => {
    mg = await cast.mg('chromium');
    const socket = await mg.socket();
    // Z trwającą sesją nowa kampania nie otwiera się MG — kończymy cudze przebiegi.
    for (const { id } of query<{ id: string }>(
      'SELECT id FROM Campaign WHERE sessionStartedAt IS NOT NULL',
    )) {
      expect((await emitAck(socket, 'session:end', { campaignId: id })).ok).toBe(true);
    }
    campaignA = await createCampaign(mg, 'Kopie 57c — źródło', { session: false });
    expect((await emitAck(socket, 'campaign:open', { campaignId: campaignA })).ok).toBe(true);
    olaA = await cast.gracz('Ola', 'firefox', await createInvitation(mg, campaignA, 'Ola'));
    const olaId = queryOne<{ userId: string }>(
      'SELECT userId FROM CampaignMember WHERE campaignId = ?',
      campaignA,
    )!.userId;

    const upload = await mg.page.request.post(
      `/api/uploads/portrait-assets?campaignId=${campaignA}`,
      {
        multipart: {
          file: { name: 'kira.webp', mimeType: 'image/webp', buffer: readFileSync(PORTRAIT) },
        },
      },
    );
    expect(upload.status(), await upload.text()).toBe(201);
    const portraitUrl = ((await upload.json()) as { url: string }).url;
    const card = await emitAck<{ id: string }>(socket, 'character:create', {
      name: CARD,
      ownerId: olaId,
    });
    expect(card.ok).toBe(true);
    const cardId = (card as { data: { id: string } }).data.id;
    expect(
      (await emitAck(socket, 'character:update', { characterId: cardId, patch: { portraitUrl } }))
        .ok,
    ).toBe(true);
    socket.disconnect();

    const page = olaA.page;
    await page.getByRole('button', { name: 'Postacie', exact: true }).click();
    await page.locator('.side-panel .character-row-name', { hasText: CARD }).click();
    const sheet = page.getByLabel(`Karta postaci: ${CARD}`);
    await expect(sheet).toBeVisible();
    mkdirSync(OUT_DIR, { recursive: true });
    const pending = page.waitForEvent('download');
    await sheet.getByRole('button', { name: 'Pobierz kopię karty' }).click();
    const download = await pending;
    zipPath = join(OUT_DIR, 'karta.zip');
    await download.saveAs(zipPath);
    const file = await readPackage<{ name: string; portraitUrl: string }>(zipPath);
    expect(file.manifest.kind).toBe('character');
    expect(file.payload).toMatchObject({ name: CARD, portraitUrl });
    expect(file.files).toHaveLength(1);
  });

  test('B: nowy gracz zgłasza kartę z pliku, MG widzi zgłoszenie z podglądem', async ({ cast }) => {
    const socket = await mg.socket();
    campaignB = await createCampaign(mg, 'Kopie 57c — cel', { session: false });
    expect((await emitAck(socket, 'campaign:open', { campaignId: campaignB })).ok).toBe(true);
    socket.disconnect();
    olaB = await cast.gracz('Ola B', 'firefox', await createInvitation(mg, campaignB, 'Ola B'));

    const page = olaB.page;
    await page.getByRole('button', { name: 'Postacie', exact: true }).click();
    await expect(page.getByRole('button', { name: '📂 Zgłoś kartę z pliku…' })).toBeVisible();
    await page.getByLabel('Plik karty do zgłoszenia').setInputFiles(zipPath);
    await expect(
      page.locator('.notice[data-notice-topic="character"] .notice-text', {
        hasText: 'Karta zgłoszona',
      }),
    ).toBeVisible();
    await expect(page.locator('.card-submit')).toContainText(`${CARD} czeka na decyzję MG`);
    // Do decyzji MG karty w kampanii nie ma.
    expect(
      queryOne<{ n: number }>(
        'SELECT count(*) AS n FROM Character WHERE campaignId = ?',
        campaignB,
      )!.n,
    ).toBe(0);

    await mg.page.reload();
    await expect(mg.page.locator('.top-bar-campaign')).toHaveText('Kopie 57c — cel');
    await expect(mg.page.locator('.gm-attention-badge')).toBeVisible();
    await mg.page.getByRole('button', { name: 'Czat', exact: true }).click();
    const row = mg.page.getByTestId('card-submission');
    await expect(row).toContainText(`Ola B zgłasza kartę „${CARD}” do wczytania`);
    // Podgląd portretu z poczekalni — obrazek naprawdę się wczytał.
    await expect
      .poll(() =>
        row
          .locator('.chat-card-submission-portrait')
          .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      )
      .toBe(true);
  });

  test('MG przyjmuje — karta z portretem jest u gracza', async () => {
    const row = mg.page.getByTestId('card-submission');
    await row.getByRole('button', { name: 'Przyjmij' }).click();
    await expect(row).toContainText('Przyjęta — MG');
    await expect(row.getByRole('button', { name: 'Przyjmij' })).toHaveCount(0);

    const card = queryOne<{ id: string; ownerId: string; portraitUrl: string; playReady: number }>(
      'SELECT id, ownerId, portraitUrl, playReady FROM Character WHERE campaignId = ? AND name = ?',
      campaignB,
      CARD,
    )!;
    const olaBId = queryOne<{ userId: string }>(
      'SELECT userId FROM CampaignMember WHERE campaignId = ?',
      campaignB,
    )!.userId;
    expect(card.ownerId).toBe(olaBId);
    expect(card.playReady).toBe(1);
    expect(card.portraitUrl).toMatch(new RegExp(`^/uploads/campaigns/${campaignB}/portraits/`));

    const page = olaB.page;
    await expect(page.locator('.card-submit')).not.toContainText('czeka na decyzję MG');
    await page.locator('.side-panel .character-row-name', { hasText: CARD }).click();
    const sheet = page.getByLabel(`Karta postaci: ${CARD}`);
    await expect(sheet).toBeVisible();
    await expect
      .poll(() =>
        sheet
          .locator('.sheet-header-portrait')
          .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      )
      .toBe(true);
    expect((await page.request.get(card.portraitUrl)).status()).toBe(200);
  });
});
