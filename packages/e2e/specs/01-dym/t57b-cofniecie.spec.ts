import { query, queryOne } from '../../fixtures/db.ts';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { createCampaign, createInvitation, startSession } from '../../fixtures/table.ts';
import { emitAck } from '../../fixtures/socket.ts';

/**
 * Etap 57b — cofnięcie kampanii do kopii ze startu sesji (kryterium
 * ukończenia): sesja → zmiana karty gracza → koniec sesji → „Cofnij…” w
 * zakładce „Kopie” → przy następnej sesji gracz widzi kartę sprzed zmiany,
 * w tej samej kampanii. Stan sprzed cofnięcia czeka w kampanii „(przed
 * cofnięciem …)”, którą MG usuwa z Panelu MG.
 */
test.describe.serial('@szybkie 57b: sesja, zmiana karty, cofnięcie do startu sesji', () => {
  const CAMPAIGN = 'Cofnięcie 57b';
  const BEFORE = 'Kira';
  const AFTER = 'Kira po sesji';
  let mg: Actor;
  let wera: Actor;
  let campaignId = '';
  let cardId = '';

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  const endSession = async () => {
    const socket = await mg.socket();
    expect((await emitAck(socket, 'session:end', { campaignId })).ok).toBe(true);
    socket.disconnect();
  };

  test('sesja z kartą gracza zostawia kopie startu i końca', async ({ cast }) => {
    mg = await cast.mg('chromium');
    const socket = await mg.socket();
    for (const { id } of query<{ id: string }>(
      'SELECT id FROM Campaign WHERE sessionStartedAt IS NOT NULL',
    )) {
      expect((await emitAck(socket, 'session:end', { campaignId: id })).ok).toBe(true);
    }
    campaignId = await createCampaign(mg, CAMPAIGN, { session: false });
    expect((await emitAck(socket, 'campaign:open', { campaignId })).ok).toBe(true);
    wera = await cast.gracz('Wera', 'firefox', await createInvitation(mg, campaignId, 'Wera'));
    const playerId = queryOne<{ userId: string }>(
      'SELECT userId FROM CampaignMember WHERE campaignId = ?',
      campaignId,
    )!.userId;
    const card = await emitAck<{ id: string }>(socket, 'character:create', {
      name: BEFORE,
      ownerId: playerId,
    });
    expect(card.ok).toBe(true);
    cardId = (card as { data: { id: string } }).data.id;
    socket.disconnect();

    // Sesja: karta zmienia imię — tę zmianę cofnięcie ma zabrać.
    await startSession(mg, campaignId);
    await wera.page.getByRole('button', { name: 'Postacie', exact: true }).click();
    await expect(
      wera.page.locator('.side-panel .character-row-name', { hasText: BEFORE }),
    ).toBeVisible();
    const during = await mg.socket();
    expect(
      (await emitAck(during, 'character:update', { characterId: cardId, patch: { name: AFTER } }))
        .ok,
    ).toBe(true);
    during.disconnect();
    await expect(
      wera.page.locator('.side-panel .character-row-name', { hasText: AFTER }),
    ).toBeVisible();
    await endSession();
    await expect(wera.page.getByLabel('Między sesjami')).toBeVisible();

    await mg.page.reload();
    await expect(mg.page.locator('.top-bar-campaign')).toHaveText(CAMPAIGN);
    await mg.page.getByRole('button', { name: 'Kopie', exact: true }).click();
    const copies = mg.page.locator('.archive-session-copies .archive-row');
    await expect(copies).toHaveCount(2);
    await expect(copies.nth(0)).toContainText('koniec sesji');
    await expect(copies.nth(1)).toContainText('start sesji');
  });

  test('„Cofnij…” do startu sesji: potwierdzenie nazwą, komunikat z kampanią „przed cofnięciem”', async () => {
    const page = mg.page;
    const start = page.locator('.archive-session-copies .archive-row', {
      hasText: 'start sesji',
    });
    await start.getByRole('button', { name: 'Cofnij…' }).click();
    const confirm = start.getByRole('button', { name: 'Cofnij kampanię' });
    await expect(confirm).toBeDisabled();
    await start.getByLabel(`Potwierdź nazwę kampanii ${CAMPAIGN}`).fill('cofnięcie 57B');
    await expect(confirm).toBeEnabled();
    await confirm.click();
    const done = page.locator('.notice[data-notice-topic="archive"] .notice-text', {
      hasText: 'Kampania cofnięta',
    });
    await expect(done).toBeVisible();
    await expect(done).toContainText(`${CAMPAIGN} (przed cofnięciem`);
    // Lista dostała kopię bezpieczeństwa stanu sprzed cofnięcia.
    await expect(
      page.locator('.archive-session-copies .archive-row', { hasText: 'przed cofnięciem' }),
    ).toHaveCount(1);
    // MG po cofnięciu ma przed sobą stan z kopii — bez przeładowania strony.
    await page.getByRole('button', { name: 'Postacie', exact: true }).click();
    await expect(
      page.locator('.side-panel .character-row-name', { hasText: new RegExp(`^${BEFORE}$`) }),
    ).toBeVisible();
  });

  test('następna sesja: gracz w tej samej kampanii widzi kartę sprzed zmiany', async () => {
    await startSession(mg, campaignId);
    await wera.page.getByRole('button', { name: 'Postacie', exact: true }).click();
    await expect(
      wera.page.locator('.side-panel .character-row-name', { hasText: new RegExp(`^${BEFORE}$`) }),
    ).toBeVisible();
    await expect(
      wera.page.locator('.side-panel .character-row-name', { hasText: AFTER }),
    ).toHaveCount(0);
    const card = queryOne<{ name: string; ownerId: string; campaignId: string }>(
      'SELECT name, ownerId, campaignId FROM Character WHERE id = ?',
      cardId,
    )!;
    expect(card).toMatchObject({ name: BEFORE, campaignId });
    await endSession();
  });

  test('kampania „przed cofnięciem” ma stan z sesji i da się ją usunąć z Panelu MG', async () => {
    const previous = queryOne<{ id: string; name: string }>(
      "SELECT id, name FROM Campaign WHERE name LIKE 'Cofnięcie 57b (przed cofnięciem%'",
    )!;
    expect(
      queryOne<{ n: number }>(
        'SELECT count(*) AS n FROM Character WHERE campaignId = ? AND name = ?',
        previous.id,
        AFTER,
      )!.n,
    ).toBe(1);
    const page = mg.page;
    await page.goto('/gm');
    const card = page.locator('.panel-card', {
      has: page.getByRole('heading', { name: previous.name }),
    });
    await card.getByRole('button', { name: 'Usuń…' }).click();
    const remove = card.getByRole('button', { name: 'Usuń na zawsze' });
    await expect(remove).toBeDisabled();
    await card.getByLabel(`Potwierdź nazwę kampanii ${previous.name}`).fill(previous.name);
    await remove.click();
    await expect(page.getByRole('heading', { name: previous.name })).toHaveCount(0);
    expect(queryOne('SELECT id FROM Campaign WHERE id = ?', previous.id)).toBeUndefined();
    // Otwartej kampanii usunąć nie wolno — przycisk jest wyszarzony.
    const open = page.locator('.panel-card', {
      has: page.getByRole('heading', { name: CAMPAIGN }),
    });
    await expect(open.getByRole('button', { name: 'Usuń…' })).toBeDisabled();
  });
});
