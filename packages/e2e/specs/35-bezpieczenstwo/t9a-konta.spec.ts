import { request, type APIRequestContext } from '@playwright/test';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { query, queryOne } from '../../fixtures/db.ts';
import { startFromPoT3 } from '../../fixtures/nocna-zmiana.ts';
import { rawSocket } from '../../fixtures/security.ts';
import { GM_LOGIN, SERVER_URL } from '../../instance/paths.ts';

/**
 * T9a, punkt 1 (`testy.md` 6.5): konta MG z perspektywy bety — rejestracja
 * w Chromium (Firefox gra ją w `t2d`), walidacja po polsku i na serwerze,
 * zajęty login bez względu na wielkość liter, wylogowanie po stronie serwera,
 * zmiana hasła w „Konto”, reset przez administratora (24 h, nowy unieważnia stary),
 * limity rejestracji i złych haseł per adres, zwykły MG bez kopii całej bazy
 * i bez panelu właściciela. Start z `po-T3`, jak `t2d`.
 *
 * Limity liczą się per adres; instancja ma `TRUST_PROXY=1` (jak za Caddy),
 * więc próby limitów idą z „obcych” adresów w `X-Forwarded-For` i nie dotykają
 * adresu przeglądarek testu.
 */

const BARTEK = 'Bartek-MG';
const BARTEK_LOGIN = 'bartek-mg';
const BARTEK_PASSWORD = 'haslo-bartka-01';
const BARTEK_NEW_PASSWORD = 'nowe-haslo-bartka';

interface AuthStore {
  status: string;
  user: { id: string; role: string; name: string; owner: boolean } | null;
  endedNote: string | null;
}

/** Odmowy formularzy i tras (400–429) lądują w konsoli jako nieudany zasób. */
const FORM_REFUSALS = /status of (400|401|403|404|409|410|429)/;
/** Firefox, któremu serwer zerwał gniazdo po zmianie hasła — zamierzony koniec sesji (jak `t2d`). */
function serverEndedSocket(text: string): boolean {
  return (
    /ws:\/\/\S*\/socket\.io\//.test(text) &&
    /can’t establish a connection|was interrupted/.test(text)
  );
}

async function anon(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: SERVER_URL });
}

async function signedIn(actor: Actor): Promise<void> {
  await expect
    .poll(async () => (await actor.store<AuthStore>('auth'))?.status, { message: actor.name })
    .toBe('authenticated');
}

async function loginForm(actor: Actor, login: string, password: string): Promise<void> {
  await actor.page.goto('/');
  await actor.page.locator('#gm-login').fill(login);
  await actor.page.locator('#gm-password').fill(password);
  await actor.page.getByRole('button', { name: 'Zaloguj się' }).click();
}

async function cookieOf(actor: Actor): Promise<string> {
  const cookies = await actor.context.cookies();
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

test.describe.serial('@szybkie T9a konta MG: rejestracja, hasła, limity', () => {
  let mg: Actor;
  let admin: Actor;
  let bartek: Actor;

  test.beforeAll(async () => {
    await startFromPoT3();
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('9.1 rejestracja w Chromium: walidacja po polsku, zajęty login, konto dopiero z poprawnym formularzem', async ({
    cast,
  }) => {
    bartek = await cast.open('Bartek', 'chromium');
    const page = bartek.page;
    await page.goto('/');
    await page.getByRole('button', { name: 'Załóż konto MG' }).click();
    const fill = async (login: string, password: string, repeat = password) => {
      await page.locator('#register-login').fill(login);
      await page.locator('#register-password').fill(password);
      await page.locator('#register-repeat').fill(repeat);
      await page.getByRole('button', { name: 'Załóż konto' }).click();
    };
    const error = page.locator('.auth-error');
    const loginRule = /^Login: 3–32 znaki/;

    await fill('ab', BARTEK_PASSWORD);
    await expect(error).toHaveText(loginRule);
    await fill('bartek mg', BARTEK_PASSWORD);
    await expect(error).toHaveText(loginRule);
    await fill('łukasz', BARTEK_PASSWORD);
    await expect(error).toHaveText(loginRule);
    await fill('bartek-mg1', 'BARTEK-MG1');
    await expect(error).toHaveText('Hasło nie może być takie samo jak login.');
    await fill(BARTEK, BARTEK_PASSWORD, `${BARTEK_PASSWORD}x`);
    await expect(error).toHaveText('Hasła się różnią — wpisz to samo w obu polach.');
    expect(query('SELECT id FROM User WHERE role = ?', 'GM')).toHaveLength(1);

    await fill(BARTEK, BARTEK_PASSWORD);
    await signedIn(bartek);
    const auth = await bartek.store<AuthStore>('auth');
    expect(auth.user).toMatchObject({ role: 'GM', name: 'MG', owner: false });
    expect(queryOne('SELECT login, owner, name FROM User WHERE id = ?', auth.user!.id)).toEqual({
      login: BARTEK_LOGIN,
      owner: 0,
      name: 'MG',
    });

    // Ten sam login wielkimi literami z drugiej przeglądarki — zajęty.
    const other = await cast.open('Ktoś', 'chromium');
    await other.page.goto('/');
    await other.page.getByRole('button', { name: 'Załóż konto MG' }).click();
    await other.page.locator('#register-login').fill(BARTEK.toUpperCase());
    await other.page.locator('#register-password').fill('inne-haslo-123');
    await other.page.locator('#register-repeat').fill('inne-haslo-123');
    await other.page.getByRole('button', { name: 'Załóż konto' }).click();
    await expect(other.page.locator('.auth-error')).toHaveText(
      'Ten login jest już zajęty — wybierz inny.',
    );

    // Serwer sprawdza to samo bez klienta: wielkość liter, zły login, krótkie hasło.
    const api = await anon();
    const register = (login: string, password: string, repeat = password) =>
      api.post('/api/auth/register', {
        data: { login, password, repeat },
        headers: { 'x-forwarded-for': '203.0.113.60' },
      });
    const taken = await register('BARTEK-mg', 'inne-haslo-123');
    expect([taken.status(), (await taken.json()).error]).toEqual([409, 'LOGIN_TAKEN']);
    const invalid = await register('a b', 'inne-haslo-123');
    expect([invalid.status(), (await invalid.json()).error]).toEqual([400, 'LOGIN_INVALID']);
    const short = await register('ktos-inny', 'krotkie');
    expect([short.status(), (await short.json()).error]).toEqual([400, 'PASSWORD_TOO_SHORT']);
    // Login właściciela z `.env` (`MG`) jest za krótki na rejestrację — odpada na długości.
    const owner = await register(GM_LOGIN.toLowerCase(), 'inne-haslo-123');
    expect(owner.status()).toBeGreaterThanOrEqual(400);
    await api.dispose();
    expect(query('SELECT id FROM User WHERE role = ?', 'GM')).toHaveLength(2);
  });

  test('9.1 wylogowanie zamyka sesję na serwerze: stare ciasteczko i gniazdo nie wracają', async () => {
    const cookie = await cookieOf(bartek);
    const open = await rawSocket(cookie);
    expect(open.socket?.connected).toBe(true);
    const disconnected = new Promise<string>((resolve) =>
      open.socket!.once('disconnect', (reason) => resolve(reason)),
    );
    const sessions = query(
      'SELECT id FROM Session WHERE userId = ?',
      (await bartek.store<AuthStore>('auth')).user!.id,
    );
    expect(sessions).toHaveLength(1);

    await bartek.page.getByRole('button', { name: 'Wyloguj' }).click();
    await expect(bartek.page.locator('#gm-login')).toBeVisible();
    await disconnected;

    const api = await anon();
    const me = await api.get('/api/auth/me', { headers: { cookie } });
    expect(me.status()).toBe(401);
    await api.dispose();
    const again = await rawSocket(cookie);
    expect(again.socket).toBeNull();
    expect(queryOne('SELECT id FROM Session WHERE id = ?', sessions[0]!.id as string)).toBe(
      undefined,
    );

    // Login wpisany wielkimi literami wpuszcza na to samo konto.
    await loginForm(bartek, BARTEK.toUpperCase(), BARTEK_PASSWORD);
    await signedIn(bartek);
  });

  test('9.1 zmiana hasła w „Konto”: złe obecne, za krótkie, sukces wylogowuje drugą przeglądarkę', async ({
    cast,
  }) => {
    const second = await cast.open('Bartek-Firefox', 'firefox');
    await loginForm(second, BARTEK, BARTEK_PASSWORD);
    await signedIn(second);

    const page = bartek.page;
    await page.getByRole('button', { name: /^Ustawienia/ }).click();
    const account = page.locator('.settings-group--account');
    await expect(account.getByRole('heading', { name: 'Konto' })).toBeVisible();
    await account.getByRole('button', { name: 'Zmień hasło' }).click();
    const form = account.locator('form.password-change');
    const submit = async (current: string, password: string, repeat = password) => {
      await form.getByLabel('Obecne hasło').fill(current);
      await form.getByLabel('Nowe hasło').fill(password);
      await form.getByLabel('Powtórz nowe').fill(repeat);
      await form.getByRole('button', { name: 'Zapisz hasło' }).click();
    };
    await submit('nie-to-haslo-123', BARTEK_NEW_PASSWORD);
    await expect(form.locator('.auth-error')).toHaveText('Obecne hasło jest nieprawidłowe.');
    await submit(BARTEK_PASSWORD, 'krotkie');
    await expect(form.locator('.auth-error')).toHaveText('Hasło musi mieć co najmniej 10 znaków.');
    await submit(BARTEK_PASSWORD, BARTEK_NEW_PASSWORD);
    await expect(account.getByText('Hasło zmienione.')).toBeVisible();

    // Druga przeglądarka wraca na ekran logowania z powodem, ta zostaje.
    await expect(second.page.getByText('Hasło tego konta zmieniono')).toBeVisible();
    expect((await bartek.store<AuthStore>('auth')).status).toBe('authenticated');
    const api = await anon();
    const headers = { 'x-forwarded-for': '203.0.113.61' };
    const old = await api.post('/api/auth/login', {
      data: { login: BARTEK, password: BARTEK_PASSWORD },
      headers,
    });
    expect(old.status()).toBe(401);
    const fresh = await api.post('/api/auth/login', {
      data: { login: BARTEK, password: BARTEK_NEW_PASSWORD },
      headers,
    });
    expect(fresh.status()).toBe(200);
    await api.dispose();
    await page.keyboard.press('Escape');
  });

  test('9.1 właściciel: hasło tylko z .env; administrator: reset zwykłego MG na 24 h, nowy link unieważnia stary', async ({
    cast,
  }) => {
    mg = await cast.mg('chromium');
    // Konto właściciela nie zmienia hasła w UI ani przez API.
    await mg.page.getByRole('button', { name: /^Ustawienia/ }).click();
    await expect(mg.page.locator('.settings-group--account')).toHaveCount(0);
    await mg.page.keyboard.press('Escape');
    const refused = await mg.page.request.post('/api/auth/password', {
      data: { current: 'x', password: 'cokolwiek-123', repeat: 'cokolwiek-123' },
    });
    expect([refused.status(), (await refused.json()).error]).toEqual([409, 'PASSWORD_FROM_ENV']);

    // Etap 53: konta MG prowadzi administrator, nie konto MG właściciela.
    await mg.page.goto('/gm');
    await expect(mg.page.locator('.owner-account')).toHaveCount(0);
    admin = await cast.admin('chromium');
    const row = admin.page.locator('.owner-account', { hasText: BARTEK_LOGIN });
    await expect(row).toBeVisible();
    const ownerRow = admin.page.locator('.owner-account', {
      has: admin.page.locator('.badge', { hasText: 'właściciel' }),
    });
    await expect(ownerRow).toBeVisible();
    await expect(ownerRow.getByRole('button', { name: 'Link resetu' })).toHaveCount(0);
    await expect(ownerRow.getByRole('button', { name: 'Zablokuj' })).toHaveCount(0);

    const shown = row.locator('code.invite-url');
    const link = async () => {
      const before = (await shown.count()) > 0 ? await shown.textContent() : null;
      await row.getByRole('button', { name: 'Link resetu' }).click();
      await expect(shown).toBeVisible();
      if (before) await expect(shown).not.toHaveText(before);
      return new URL((await shown.textContent()) ?? '').pathname;
    };
    const first = await link();
    const second = await link();
    expect(second).not.toBe(first);
    const api = await anon();
    const token = (path: string) => path.replace(/^\/reset\//, '');
    expect((await api.get(`/api/auth/reset/${token(first)}`)).status()).toBe(404);
    expect((await api.get(`/api/auth/reset/${token(second)}`)).status()).toBe(200);
    await api.dispose();

    const bartekId = (await bartek.store<AuthStore>('auth')).user!.id;
    // Nowy link zastępuje stary w bazie; daty Prismy leżą w SQLite jako tekst ISO.
    const resets = query<{ expiresAt: string; createdAt: string; usedAt: string | null }>(
      'SELECT expiresAt, createdAt, usedAt FROM PasswordReset WHERE userId = ?',
      bartekId,
    );
    expect(resets).toHaveLength(1);
    const [reset] = resets;
    expect(reset!.usedAt).toBeNull();
    const hours = (Date.parse(reset!.expiresAt) - Date.parse(reset!.createdAt)) / 3_600_000;
    expect(Math.round(hours)).toBe(24);

    // Konta właściciela nie zresetuje i nie zablokuje nawet administrator, z pominięciem UI.
    const ownerId = (await mg.store<AuthStore>('auth')).user!.id;
    const resetOwner = await admin.page.request.post(`/api/admin/accounts/${ownerId}/reset`);
    expect(resetOwner.status()).toBeGreaterThanOrEqual(400);
    const blockOwner = await admin.page.request.post(`/api/admin/accounts/${ownerId}/block`, {
      data: { blocked: true },
    });
    expect(blockOwner.status()).toBeGreaterThanOrEqual(400);
    expect(queryOne('SELECT blockedAt FROM User WHERE id = ?', ownerId)).toEqual({
      blockedAt: null,
    });
    // Obsada żyje przez cały pracownik — administrator nie może przeżyć restartu
    // instancji w następnym pliku z zerwanym gniazdem w konsoli.
    expect(admin.unexpectedErrors()).toEqual([]);
    await admin.close();
    cast.actors.splice(cast.actors.indexOf(admin), 1);
  });

  test('9.1 limity: szóste konto z jednego adresu w godzinie — 429, inny adres dalej; 10 złych haseł konta z rejestracji — 429 także na dobre', async () => {
    const api = await anon();
    const from = (ip: string) => ({ 'x-forwarded-for': ip });
    const statuses: number[] = [];
    for (let i = 1; i <= 6; i += 1) {
      const response = await api.post('/api/auth/register', {
        data: { login: `limit-${i}`, password: 'haslo-limitu-1', repeat: 'haslo-limitu-1' },
        headers: from('203.0.113.70'),
      });
      statuses.push(response.status());
      if (i === 6) {
        expect((await response.json()).error).toBe('TOO_MANY_REGISTRATIONS');
        expect(Number(response.headers()['retry-after'])).toBeGreaterThan(3_000);
      }
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
    expect(queryOne('SELECT id FROM User WHERE login = ?', 'limit-6')).toBeUndefined();
    const elsewhere = await api.post('/api/auth/register', {
      data: { login: 'limit-7', password: 'haslo-limitu-1', repeat: 'haslo-limitu-1' },
      headers: from('203.0.113.71'),
    });
    expect(elsewhere.status()).toBe(201);

    const guesses: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      guesses.push(
        (
          await api.post('/api/auth/login', {
            data: { login: BARTEK, password: `zgaduje-${i}-bartka` },
            headers: from('203.0.113.72'),
          })
        ).status(),
      );
    }
    expect(guesses).toEqual(Array(10).fill(401));
    const blocked = await api.post('/api/auth/login', {
      data: { login: BARTEK, password: BARTEK_NEW_PASSWORD },
      headers: from('203.0.113.72'),
    });
    expect([blocked.status(), (await blocked.json()).error]).toEqual([429, 'TOO_MANY_ATTEMPTS']);
    const other = await api.post('/api/auth/login', {
      data: { login: BARTEK, password: BARTEK_NEW_PASSWORD },
      headers: from('203.0.113.73'),
    });
    expect(other.status()).toBe(200);
    await api.dispose();
    // Zablokowany adres zgadującego nie wylogował Bartka.
    expect((await bartek.store<AuthStore>('auth')).status).toBe('authenticated');
  });

  test('9.1 MG (zwykły i właściciel): bez kopii całej bazy i bez panelu administratora', async () => {
    const ownerId = (await mg.store<AuthStore>('auth')).user!.id;
    for (const gm of [bartek, mg]) {
      expect((await gm.page.request.get('/api/admin/backups')).status()).toBe(403);
      expect((await gm.page.request.post('/api/admin/backups')).status()).toBe(403);
      expect((await gm.page.request.get('/api/admin/accounts')).status()).toBe(403);
      const resetOwner = await gm.page.request.post(`/api/admin/accounts/${ownerId}/reset`);
      expect(resetOwner.status()).toBe(403);
    }
    await bartek.page.goto('/gm');
    await expect(bartek.page.getByRole('link', { name: '← Wróć do gry' })).toBeVisible();
    await expect(bartek.page.locator('.owner-account')).toHaveCount(0);
    await expect(bartek.page.getByText('Konta MG')).toHaveCount(0);
  });

  test('konsola bez nowych błędów', async ({ cast }) => {
    for (const actor of cast.actors) {
      expect(
        actor
          .unexpectedErrors()
          .filter((text) => !FORM_REFUSALS.test(text))
          .filter((text) => !(actor.name === 'Bartek-Firefox' && serverEndedSocket(text))),
        `${actor.name} (${actor.engine})`,
      ).toEqual([]);
    }
  });
});
