import { request, type APIRequestContext } from '@playwright/test';
import { ADMIN_LOGIN, SERVER_URL } from '../instance/paths.ts';

/**
 * Administrator (etap 53) bez przeglądarki — kontekst żądań zalogowany na
 * serwerze instancji. Hasło po starcie instancji jest tymczasowe
 * (`VTT_ADMIN_RESET_PASSWORD`), więc pierwsze wejście w przebiegu ustawia
 * własne (`E2E_ADMIN_PASSWORD`); kolejne idą już nim. Wołający zamyka kontekst.
 */
export async function adminApi(): Promise<APIRequestContext> {
  const temporary = process.env.E2E_ADMIN_TEMP_PASSWORD;
  const own = process.env.E2E_ADMIN_PASSWORD;
  if (!temporary || !own) throw new Error('E2E: no E2E_ADMIN_* — run through playwright test');
  const api = await request.newContext({ baseURL: SERVER_URL });
  for (const password of [own, temporary]) {
    const res = await api.post('/api/auth/login', { data: { login: ADMIN_LOGIN, password } });
    if (res.status() !== 200) continue;
    const { user } = (await res.json()) as { user: { mustChangePassword?: boolean } };
    if (user.mustChangePassword) {
      const changed = await api.post('/api/auth/password', {
        data: { current: password, password: own, repeat: own },
      });
      if (changed.status() !== 200)
        throw new Error(`E2E: admin password change ${changed.status()}`);
    }
    return api;
  }
  await api.dispose();
  throw new Error('E2E: admin login failed');
}
