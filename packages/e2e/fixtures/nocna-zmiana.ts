import { request, type APIRequestContext } from '@playwright/test';
import { SERVER_URL } from '../instance/paths.ts';
import { restoreCheckpoint, startInstance } from '../instance/instance.ts';
import { query, queryOne, tableNames } from './db.ts';
import { DEAD_GATEWAY } from './security.ts';

/**
 * Stan kampanii „Nocna zmiana” z punktu `po-T3` — wspólny dla plików T2, które
 * startują z tego punktu na własnej kopii (decyzja MG z 26.09: T2 bierze stan
 * z `po-T3`, nie z własnego zasiewu). Id czyta się po nazwach, bo punkt zapisuje
 * każdy pełny przebieg od nowa.
 */

/** Odtworzenie `po-T3` i instancja z martwym gatewayem (T2 nie woła modelu). */
export async function startFromPoT3(extraEnv: NodeJS.ProcessEnv = {}): Promise<void> {
  await restoreCheckpoint('po-T3');
  await startInstance({ ...DEAD_GATEWAY, ...extraEnv });
}

function idOf(sql: string, name: string): string {
  const row = queryOne<{ id: string }>(sql, name);
  if (!row) throw new Error(`E2E: nothing named "${name}" (${sql})`);
  return row.id;
}

export const campaignId = (): string =>
  idOf('SELECT id FROM Campaign WHERE name = ?', 'Nocna zmiana');
export const characterId = (name: string): string =>
  idOf('SELECT id FROM Character WHERE name = ?', name);
export const userId = (name: string): string => idOf('SELECT id FROM User WHERE name = ?', name);
export const sceneId = (name: string): string => idOf('SELECT id FROM Scene WHERE name = ?', name);
/** Figura postaci (po nazwie karty — imię figury bywa kanarkiem z aliasem). */
export const tokenOf = (character: string): string =>
  idOf(
    'SELECT t.id FROM Token t JOIN Character c ON c.id = t.characterId WHERE c.name = ?',
    character,
  );

/** Kontekst HTTP MG (ciasteczko w słoju kontekstu), prosto na serwer, bez proxy klienta. */
export async function apiGm(): Promise<APIRequestContext> {
  const password = process.env.E2E_GM_PASSWORD;
  if (!password) throw new Error('E2E: no E2E_GM_PASSWORD — run through playwright test');
  const api = await request.newContext({ baseURL: SERVER_URL });
  const response = await api.post('/api/auth/login', { data: { password } });
  if (response.status() !== 200) throw new Error(`E2E: GM login ${response.status()}`);
  return api;
}

/** Świeże zaproszenie do kampanii (zaproszenia z punktu wygasają po tygodniu). */
export async function invite(gm: APIRequestContext, campaign = campaignId()): Promise<string> {
  const response = await gm.post(`/api/campaigns/${campaign}/invitations`, { data: {} });
  if (response.status() !== 201) throw new Error(`E2E: invitation ${response.status()}`);
  return ((await response.json()) as { token: string }).token;
}

/** Kontekst HTTP gracza wchodzącego z zaproszenia (to samo imię = to samo konto). */
export async function apiPlayer(name: string, token: string): Promise<APIRequestContext> {
  const api = await request.newContext({ baseURL: SERVER_URL });
  const response = await api.post(`/api/join/${token}`, { data: { name } });
  if (response.status() !== 200) throw new Error(`E2E: ${name} join ${response.status()}`);
  return api;
}

/** Nagłówek `cookie` kontekstu HTTP — do surowego gniazda tej samej sesji. */
export async function cookieHeader(api: APIRequestContext): Promise<string> {
  const { cookies } = await api.storageState();
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

/** Kanarki tajne tylko przed jednym graczem (reszta — przed obojgiem). */
export const ONLY_FROM: Record<string, 'Marek' | 'Ola'> = {
  'szept-Oli': 'Marek', // szept Oli do MG
  'handout-Oli': 'Marek', // handout pokazany tylko Oli
  'notatka-Kowala': 'Ola', // notatka na karcie Marka
  'szept-MG': 'Ola', // szept MG do Marka
  'prosba-Oli': 'Marek', // prośba Oli o Test, odrzucona przez MG (T4a)
};

const CANARY = /KANAREK-([\w-]+?)-[0-9A-F]{4}/g;

/** Wszystkie kanarki w bazie E2E: kod → etykieta. */
export function canariesInDatabase(): Map<string, string> {
  const found = new Map<string, string>();
  for (const table of tableNames()) {
    for (const row of query(`SELECT * FROM "${table}"`)) {
      for (const value of Object.values(row)) {
        if (typeof value !== 'string' || !value.includes('KANAREK-')) continue;
        for (const match of value.matchAll(CANARY)) found.set(match[0], match[1]!);
      }
    }
  }
  return found;
}
