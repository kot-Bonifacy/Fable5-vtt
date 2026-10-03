import type { APIRequestContext } from '@playwright/test';
import { request } from '@playwright/test';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { campaignId, startFromPoT3 } from '../../fixtures/nocna-zmiana.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { SERVER_URL } from '../../instance/paths.ts';

/**
 * Konta MG (etap 44a), testy dymne: migracja starej bazy (`po-T3` sprzed 44a),
 * logowanie loginem, rejestracja w Firefoksie, kampanie tylko swoje, panel
 * właściciela z resetem hasła i blokadą, kopie całej bazy tylko dla właściciela.
 * Odbiór całości to T9a (po 44b).
 */

const KASIA = 'kasia-mg';
const KASIA_PASSWORD = 'haslo-kasi-123';
const KASIA_NEW_PASSWORD = 'nowe-haslo-kasi';

interface AuthStore {
  status: string;
  user: { role: string; name: string; owner: boolean } | null;
  activeCampaign: { name: string } | null;
  endedNote: string | null;
}

/** Odmowy formularzy (400, 404) też lądują w konsoli jako nieudany zasób. */
const FORM_REFUSALS = /status of (400|403|404|409)/;
/**
 * Firefox, któremu serwer zerwał gniazdo (reset hasła kończy sesję — `auth:ended`
 * i `disconnect`), pisze o przerwanym WebSockecie. To zamierzony koniec sesji,
 * więc wybaczamy go tylko aktorowi, którego sesję serwer zakończył.
 */
function serverEndedSocket(text: string): boolean {
  return (
    /ws:\/\/\S*\/socket\.io\//.test(text) &&
    /can’t establish a connection|was interrupted/.test(text)
  );
}

async function campaignNames(actor: Actor): Promise<string[]> {
  const response = await actor.page.request.get('/api/campaigns');
  expect(response.status()).toBe(200);
  return ((await response.json()) as { name: string }[]).map((c) => c.name);
}

async function apiLogin(login: string, password: string): Promise<number> {
  const api: APIRequestContext = await request.newContext({ baseURL: SERVER_URL });
  try {
    return (await api.post('/api/auth/login', { data: { login, password } })).status();
  } finally {
    await api.dispose();
  }
}

test.describe.serial('@szybkie T2d konta MG (44a)', () => {
  let mg: Actor;
  let kasia: Actor;

  test.beforeAll(async () => {
    await startFromPoT3();
  });

  test('po migracji właściciel wchodzi loginem z GM_NAME i ma swoją kampanię', async ({ cast }) => {
    mg = await cast.mg('firefox');
    const auth = await mg.store<AuthStore>('auth');
    expect(auth.user).toMatchObject({ role: 'GM', name: 'MG', owner: true });
    expect(auth.activeCampaign?.name).toBe('Nocna zmiana');
    expect(await campaignNames(mg)).toContain('Nocna zmiana');
    // Samo hasło (sprzed 44a) już nie wpuszcza.
    const legacy = await request.newContext({ baseURL: SERVER_URL });
    const refused = await legacy.post('/api/auth/login', {
      data: { password: process.env.E2E_GM_PASSWORD },
    });
    expect(refused.status()).toBe(400);
    await legacy.dispose();
  });

  test('rejestracja w Firefoksie: odmowa po polsku, potem pusty stół z „Nowa kampania”', async ({
    cast,
  }) => {
    kasia = await cast.open('Kasia', 'firefox');
    const page = kasia.page;
    await page.goto('/');
    await page.getByRole('button', { name: 'Załóż konto MG' }).click();
    await page.locator('#register-login').fill(KASIA);
    await page.locator('#register-password').fill('krotkie');
    await page.locator('#register-repeat').fill('krotkie');
    await page.getByRole('button', { name: 'Załóż konto' }).click();
    await expect(page.locator('.auth-error')).toHaveText('Hasło musi mieć co najmniej 10 znaków.');

    await page.locator('#register-password').fill(KASIA_PASSWORD);
    await page.locator('#register-repeat').fill(KASIA_PASSWORD);
    await page.getByRole('button', { name: 'Załóż konto' }).click();
    await expect
      .poll(async () => (await kasia.store<AuthStore>('auth'))?.status)
      .toBe('authenticated');
    const auth = await kasia.store<AuthStore>('auth');
    expect(auth.user).toMatchObject({ role: 'GM', name: 'MG', owner: false });
    expect(auth.activeCampaign).toBeNull();
    await expect(page.getByText('Nie masz aktywnej kampanii')).toBeVisible();
    await expect(page.getByLabel('Nowa kampania')).toBeVisible();
    expect(await campaignNames(kasia)).toEqual([]);
  });

  test('zwykły MG nie widzi kopii całej bazy, właściciel widzi', async () => {
    const socket = await kasia.socket();
    expect(await emitAck(socket, 'archive:list', {})).toEqual({ ok: false, error: 'FORBIDDEN' });
    const owner = await mg.socket();
    expect((await emitAck(owner, 'archive:list', {})).ok).toBe(true);
    // Cudza kampania jak nieistniejąca.
    expect(await emitAck(socket, 'campaign:activate', { campaignId: campaignId() })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
  });

  test('panel właściciela: reset hasła w Chromium, link działa raz, stare sesje wylogowane', async ({
    cast,
  }) => {
    await mg.page.goto('/gm');
    const row = mg.page.locator('.owner-account', { hasText: KASIA });
    await expect(row).toBeVisible();
    await expect(row).toContainText('kampanie: 0');
    await row.getByRole('button', { name: 'Zresetuj hasło' }).click();
    const link = (await row.locator('code.invite-url').textContent()) ?? '';
    expect(link).toMatch(/\/reset\/[\w-]+$/);
    const path = new URL(link).pathname;

    const other = await cast.open('Kasia-2', 'chromium');
    await other.page.goto(path);
    await expect(other.page.getByText(`Konto MG: ${KASIA}`)).toBeVisible();
    await other.page.locator('#reset-password').fill(KASIA_NEW_PASSWORD);
    await other.page.locator('#reset-repeat').fill(KASIA_NEW_PASSWORD);
    await other.page.getByRole('button', { name: 'Ustaw hasło i wejdź' }).click();
    await expect
      .poll(async () => (await other.store<AuthStore>('auth'))?.status)
      .toBe('authenticated');

    // Stara sesja w Firefoksie wraca na ekran logowania z powodem.
    await expect(kasia.page.getByText('Hasło tego konta zmieniono')).toBeVisible();
    expect(await apiLogin(KASIA, KASIA_PASSWORD)).toBe(401);
    expect(await apiLogin(KASIA, KASIA_NEW_PASSWORD)).toBe(200);

    // Drugie użycie tego samego linku.
    const again = await cast.open('Kasia-3', 'firefox');
    await again.page.goto(path);
    await expect(again.page.getByRole('heading', { name: 'Link nieważny' })).toBeVisible();
  });

  test('blokada wylogowuje konto i nie wpuszcza go; odblokowanie wpuszcza', async ({ cast }) => {
    const back = await cast.open('Kasia-4', 'firefox');
    await back.page.goto('/');
    await back.page.locator('#gm-login').fill(KASIA.toUpperCase());
    await back.page.locator('#gm-password').fill(KASIA_NEW_PASSWORD);
    await back.page.getByRole('button', { name: 'Zaloguj się' }).click();
    await expect
      .poll(async () => (await back.store<AuthStore>('auth'))?.status)
      .toBe('authenticated');

    const row = mg.page.locator('.owner-account', { hasText: KASIA });
    await row.getByRole('button', { name: 'Zablokuj' }).click();
    await expect(row.getByText('zablokowane')).toBeVisible();
    await expect(back.page.getByText('zablokowane przez właściciela')).toBeVisible();
    expect(await apiLogin(KASIA, KASIA_NEW_PASSWORD)).toBe(403);

    await row.getByRole('button', { name: 'Odblokuj' }).click();
    await expect(row.getByText('zablokowane')).toHaveCount(0);
    expect(await apiLogin(KASIA, KASIA_NEW_PASSWORD)).toBe(200);
  });

  test('konsola bez nowych błędów', async ({ cast }) => {
    for (const actor of cast.actors) {
      const ended = actor === kasia;
      expect(
        actor
          .unexpectedErrors()
          .filter((text) => !FORM_REFUSALS.test(text))
          .filter((text) => !(ended && serverEndedSocket(text))),
        `${actor.name} (${actor.engine})`,
      ).toEqual([]);
    }
  });
});
