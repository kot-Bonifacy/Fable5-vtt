import { query, queryOne } from '../../fixtures/db.ts';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { emitAck } from '../../fixtures/socket.ts';

/**
 * Etap 44d — AI właściciela, dym UI: MG-B prosi w Panelu MG, właściciel widzi
 * znaczek z licznikiem i powiadomienie, zatwierdza w oknie „AI właściciela”,
 * a stan prośby u MG-B zmienia się bez przeładowania. Właściciel w Chromium,
 * MG-B w **Firefoksie**. Powód niedostępności botów u MG-B sprawdza się tylko
 * z żywym gatewayem — bez niego oba stoły mają po prostu „boty offline”.
 *
 * Logikę prawa do AI, dzierżawy i karencji sprawdza `ai-access.test.ts`
 * w serwerze, a pełny scenariusz z dwiema grupami — T9b.
 */
test.describe.serial('@szybkie dym 44d: prośba o AI, panel właściciela, status u MG-B', () => {
  const LOGIN = 'mg-b-44d';
  const PASSWORD = 'haslo-mg-b-44d';
  let owner: Actor;
  let mgB: Actor;

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('MG-B prosi z Panelu MG, właściciel dostaje znaczek i powiadomienie', async ({ cast }) => {
    owner = await cast.mg('chromium');
    // Bez trwających sesji: AI nikt nie trzyma, więc u MG-B w przygotowaniu
    // powodem jest przełącznik, a nie „zajęte przez inną sesję”.
    const ownerSocket = await owner.socket();
    for (const { id } of query<{ id: string }>(
      'SELECT id FROM Campaign WHERE sessionStartedAt IS NOT NULL',
    )) {
      expect((await emitAck(ownerSocket, 'session:end', { campaignId: id })).ok).toBe(true);
    }
    mgB = await cast.open('MG-B', 'firefox');
    // Rejestracja z własnego adresu (TRUST_PROXY) — limit pięciu kont na
    // godzinę z jednego adresu zostaje dla T9a. Przez adres klienta, żeby
    // ciasteczko sesji trafiło do przeglądarki MG-B.
    const registered = await mgB.context.request.post('/api/auth/register', {
      data: { login: LOGIN, password: PASSWORD, repeat: PASSWORD },
      headers: { 'x-forwarded-for': '10.44.4.4' },
    });
    expect(registered.status()).toBe(201);
    const created = await mgB.context.request.post('/api/campaigns', {
      data: { name: 'Pustkowia 44d' },
    });
    expect(created.status()).toBe(201);
    await mgB.page.goto('/gm');
    const card = mgB.page.locator('.panel-card', { hasText: 'AI właściciela serwera' });
    await expect(card).toContainText('Bez prośby o dostęp do AI właściciela serwera');
    // Właściciel nie ma tej karty — ma panel.
    await owner.page.goto('/');
    await expect(owner.page.locator('.owner-ai-button')).toBeVisible();
    await expect(owner.page.locator('.owner-ai-count')).toHaveCount(0);

    await card.getByRole('button', { name: 'Poproś o dostęp do AI właściciela' }).click();
    await expect(card).toContainText('Prośba wysłana — czeka na decyzję właściciela.');
    expect(queryOne('SELECT aiAccess FROM User WHERE login = ?', LOGIN)).toEqual({
      aiAccess: 'requested',
    });

    await expect(owner.page.locator('.owner-ai-count')).toHaveText('1');
    await expect(owner.page.getByText(`MG „${LOGIN}” prosi o dostęp do Twojego AI.`)).toBeVisible();
  });

  test('właściciel zatwierdza w oknie, MG-B widzi zgodę bez F5', async () => {
    await owner.page.locator('.owner-ai-button').click();
    const window = owner.page.locator('.owner-ai-window');
    await expect(window).toBeVisible();
    const row = window.locator('.owner-account', { hasText: LOGIN });
    await expect(row).toContainText('czeka');
    await row.getByRole('button', { name: 'Zatwierdź' }).click();
    await expect(row).toContainText('zgoda');
    await expect(owner.page.locator('.owner-ai-count')).toHaveCount(0);

    const card = mgB.page.locator('.panel-card', { hasText: 'AI właściciela serwera' });
    await expect(card).toContainText('Masz zgodę właściciela.');
    await expect(card.getByRole('button', { name: /Poproś/ })).toHaveCount(0);
  });

  test('status AI u MG-B: powód zamiast „boty offline”, a po „Udostępniam AI” — dostępne', async () => {
    const ownerStatus = await owner.store<{ status: { available: boolean } }>('ai');
    test.skip(!ownerStatus.status.available, 'gateway wyłączony — powód zasłania „offline”');

    await mgB.page.goto('/');
    await mgB.page.locator('.side-tab', { hasText: 'Boty' }).click();
    const panel = mgB.page.locator('.bot-panel');
    await expect(panel.locator('.badge').first()).toHaveText('AI niedostępne');
    await expect(panel).toContainText('Właściciel nie udostępnia teraz AI.');

    const window = owner.page.locator('.owner-ai-window');
    await window.getByLabel('Udostępniam AI').check();
    await expect(panel.locator('.badge').first()).toHaveText('model gotowy');
  });

  test('konsola bez nowych błędów w obu silnikach', () => {
    expect(owner.unexpectedErrors()).toEqual([]);
    expect(mgB.unexpectedErrors()).toEqual([]);
  });
});
