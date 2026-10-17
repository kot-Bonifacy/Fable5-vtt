import type { FastifyInstance } from 'fastify';

/**
 * Konto administratora w testach dymnych (etap 53) — tylko dla `*.test.ts`.
 *
 * Konfiguracja testu podaje `TEST_ADMIN` (`adminLogin`, `adminPassword`), a
 * serwer zakłada z tego konto z hasłem tymczasowym. `adminCookie` loguje się
 * nim, ustawia własne hasło (inaczej każda trasa poza zmianą hasła odpowiada
 * `PASSWORD_CHANGE_REQUIRED`) i oddaje ciasteczko sesji, która tę zmianę
 * przeżyła. Drugie wywołanie w tym samym teście wchodzi już hasłem własnym.
 */
export const TEST_ADMIN = {
  adminLogin: 'admin-testowy',
  adminPassword: 'Tymczasowe2026!!',
} as const;

export const TEST_ADMIN_OWN_PASSWORD = 'wlasne-haslo-admina';

function cookieOf(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!raw) throw new Error('missing set-cookie header');
  return raw.split(';')[0]!;
}

let addressCounter = 0;

export async function adminCookie(built: { app: FastifyInstance }): Promise<string> {
  addressCounter += 1;
  // Własny adres — limit złych haseł nie miesza się z adresami samego testu.
  const remoteAddress = `10.53.0.${addressCounter}`;
  for (const password of [TEST_ADMIN_OWN_PASSWORD, TEST_ADMIN.adminPassword]) {
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { login: TEST_ADMIN.adminLogin, password },
      remoteAddress,
    });
    if (res.statusCode !== 200) continue;
    const cookie = cookieOf(res.headers['set-cookie']);
    const { user } = res.json() as { user: { mustChangePassword?: boolean } };
    if (!user.mustChangePassword) return cookie;
    const changed = await built.app.inject({
      method: 'POST',
      url: '/api/auth/password',
      headers: { cookie },
      payload: {
        current: password,
        password: TEST_ADMIN_OWN_PASSWORD,
        repeat: TEST_ADMIN_OWN_PASSWORD,
      },
      remoteAddress,
    });
    if (changed.statusCode !== 200) {
      throw new Error(`admin password change failed: ${changed.statusCode} ${changed.body}`);
    }
    return cookie;
  }
  throw new Error('admin login failed — does the test config carry TEST_ADMIN?');
}
