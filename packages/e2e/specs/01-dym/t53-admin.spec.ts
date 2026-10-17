import { query, queryOne } from '../../fixtures/db.ts';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { createCampaign, createInvitation } from '../../fixtures/table.ts';
import { emitAck } from '../../fixtures/socket.ts';

/**
 * Etap 53 — konto administratora, dym UI: pierwsze wejście hasłem tymczasowym
 * (fikstura `cast.admin` przechodzi ekran „Ustaw własne hasło”), trwająca sesja
 * z graczem przy stole i „Zakończ sesję”, dziennik z powodem, hasło tymczasowe
 * dla MG z wymuszoną zmianą, przełącznik rejestracji i usunięcie konta MG.
 * Administrator w **Firefoksie**, MG i gracz w Chromium.
 */
test.describe.serial('@szybkie dym 53: panel administratora', () => {
  const LOGIN = 'mg-53';
  const PASSWORD = 'haslo-mg-53-pierwsze';
  const OWN_PASSWORD = 'haslo-mg-53-wlasne';
  const CAMPAIGN = 'Noc w Watson 53';
  /** Imię spoza innych dymów (dym.spec ma swoją Olę na tej samej instancji). */
  const PLAYER = 'Ola-53';
  let admin: Actor;
  let gm: Actor;
  let ola: Actor;

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('administrator po pierwszym wejściu widzi panel, a konto MG właściciela — nie', async ({
    cast,
  }) => {
    admin = await cast.admin('firefox');
    const auth = await admin.store<{ user: { role: string; mustChangePassword?: boolean } }>(
      'auth',
    );
    expect(auth.user.role).toBe('ADMIN');
    expect(auth.user.mustChangePassword).toBeUndefined();
    // Panel nie siada przy stole — ani mapy, ani gniazda stołu.
    await expect(admin.page.locator('.map-area')).toHaveCount(0);
    for (const heading of ['Sesje', 'Konta MG', 'AI właściciela', 'Serwer']) {
      await expect(admin.page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }
  });

  test('trwająca sesja z graczem przy stole; „Zakończ sesję” administratora, wpis w dzienniku', async ({
    cast,
  }) => {
    // Bez cudzych trwających sesji — slot musi być wolny dla MG-53.
    const owner = await cast.mg('chromium');
    const ownerSocket = await owner.socket();
    for (const { id } of query<{ id: string }>(
      'SELECT id FROM Campaign WHERE sessionStartedAt IS NOT NULL',
    )) {
      expect((await emitAck(ownerSocket, 'session:end', { campaignId: id })).ok).toBe(true);
    }
    ownerSocket.disconnect();

    gm = await cast.open('MG-53', 'chromium');
    const registered = await gm.context.request.post('/api/auth/register', {
      data: { login: LOGIN, password: PASSWORD, repeat: PASSWORD },
      headers: { 'x-forwarded-for': '10.53.53.1' },
    });
    expect(registered.status()).toBe(201);
    const campaignId = await createCampaign(gm, CAMPAIGN);
    await gm.page.goto('/');
    ola = await cast.gracz(PLAYER, 'chromium', await createInvitation(gm, campaignId, PLAYER));
    await expect(ola.page.locator('.map-area')).toBeVisible();

    const running = admin.page.locator('.owner-account', { hasText: CAMPAIGN });
    await expect(running).toContainText(`MG ${LOGIN}`);
    await expect(running).toContainText(`przy stole: ${PLAYER}`);
    await running.getByRole('button', { name: 'Zakończ sesję' }).click();
    await running.getByRole('button', { name: 'Tak, zakończ' }).click();
    await expect(ola.page.locator('.between-sessions')).toBeVisible();
    await expect(gm.page.getByText('Sesję zakończył administrator serwera.')).toBeVisible();

    const history = admin.page.locator('.admin-table tr', { hasText: CAMPAIGN });
    await expect(history).toContainText(PLAYER);
    await expect(history).toContainText('zakończył administrator');
    expect(
      queryOne<{ endReason: string }>(
        'SELECT endReason FROM GameSession WHERE campaignName = ?',
        CAMPAIGN,
      ),
    ).toEqual({ endReason: 'admin' });
  });

  test('hasło tymczasowe: MG wylogowany, wchodzi nim i musi ustawić własne', async () => {
    const row = admin.page.locator('.owner-accounts .owner-account', { hasText: LOGIN });
    await row.getByRole('button', { name: 'Hasło tymczasowe' }).click();
    await row.getByRole('button', { name: 'Ustaw', exact: true }).click();
    const temporary = (await row.locator('code.invite-url').textContent()) ?? '';
    expect(temporary).toHaveLength(12);
    await expect(row).toContainText('hasło tymczasowe');
    await expect(gm.page.getByText('Hasło tego konta zmieniono')).toBeVisible();

    const page = gm.page;
    await page.locator('#gm-login').fill(LOGIN);
    await page.locator('#gm-password').fill(temporary);
    await page.getByRole('button', { name: 'Zaloguj się' }).click();
    await expect(page.getByRole('heading', { name: 'Ustaw własne hasło' })).toBeVisible();
    await page.locator('#set-current').fill(temporary);
    await page.locator('#set-password').fill(OWN_PASSWORD);
    await page.locator('#set-repeat').fill(OWN_PASSWORD);
    await page.getByRole('button', { name: 'Ustaw hasło i wejdź' }).click();
    await expect(page.locator('.top-bar-campaign')).toHaveText(CAMPAIGN);
    await expect(row.getByText('hasło tymczasowe', { exact: true })).toHaveCount(0);
  });

  test('przełącznik rejestracji chowa „Załóż konto MG” i serwer odmawia', async ({ cast }) => {
    const toggle = admin.page.getByLabel('Rejestracja nowych kont MG otwarta');
    await toggle.uncheck();
    await expect(toggle).not.toBeChecked();
    const visitor = await cast.open('Gość', 'chromium');
    await visitor.page.goto('/');
    await expect(visitor.page.locator('#gm-login')).toBeVisible();
    await expect(visitor.page.getByRole('button', { name: 'Załóż konto MG' })).toHaveCount(0);
    const refused = await visitor.context.request.post('/api/auth/register', {
      data: { login: 'spozniony-53', password: 'haslo-spoznione', repeat: 'haslo-spoznione' },
      headers: { 'x-forwarded-for': '10.53.53.2' },
    });
    expect(refused.status()).toBe(403);
    await toggle.check();
    await visitor.page.reload();
    await expect(visitor.page.getByRole('button', { name: 'Załóż konto MG' })).toBeVisible();
  });

  test('usunięcie konta MG zabiera kampanię i gracza, dziennik zostaje', async () => {
    const row = admin.page.locator('.owner-accounts .owner-account', { hasText: LOGIN });
    await row.getByRole('button', { name: 'Usuń…' }).click();
    const confirm = row.getByRole('button', { name: 'Usuń na zawsze' });
    await expect(confirm).toBeDisabled();
    await row.getByLabel(`Potwierdź login ${LOGIN}`).fill(LOGIN);
    await confirm.click();
    await expect(row).toHaveCount(0);
    await expect(gm.page.getByText('usunięte przez administratora')).toBeVisible();
    await expect(ola.page.getByText('usunięte przez administratora')).toBeVisible();
    expect(query('SELECT id FROM Campaign WHERE name = ?', CAMPAIGN)).toEqual([]);
    expect(query('SELECT id FROM User WHERE name = ?', PLAYER)).toEqual([]);
    await expect(admin.page.locator('.admin-table tr', { hasText: CAMPAIGN })).toContainText(
      '(usunięta)',
    );
  });

  test('konsola bez nowych błędów', ({ cast }) => {
    // Odmowy formularzy i zerwane gniazda usuniętych kont to zamierzone końce.
    const expected = /status of (401|403|409)|ws:\/\/\S*\/socket\.io\//;
    for (const actor of cast.actors) {
      expect(
        actor.unexpectedErrors().filter((text) => !expected.test(text)),
        `${actor.name} (${actor.engine})`,
      ).toEqual([]);
    }
  });
});
