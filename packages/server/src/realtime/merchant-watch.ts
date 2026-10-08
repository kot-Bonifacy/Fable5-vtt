import type { RealtimeDeps } from './registry.js';

/**
 * Kto ogląda którą półkę (etap 46a) — osobno od `merchant.ts`, bo czyta to
 * `character-io.ts`, a `merchant.ts` sam z niego korzysta (cykl importów).
 *
 * Półka zmienia się nie tylko zdarzeniami sklepu: MG dopisuje towar w karcie,
 * gracz oddaje handlarzowi rzecz przez handel, łup ruszy ekwipunek martwego.
 * Każda z tych dróg kończy się `emitCharacterUpsert`, więc tam wpina się
 * odświeżenie — a ten plik mówi, czy w ogóle jest komu odświeżać.
 *
 * Stan w pamięci po `socket.id`, sprzątany przy rozłączeniu (wzór: `token:aim`).
 */

const watchers = new Map<string, Set<string>>();

type Refresher = (deps: RealtimeDeps, campaignId: string, characterId: string) => Promise<void>;
let refresher: Refresher | null = null;

/** `merchant.ts` rejestruje tu odświeżanie półki karty handlarza. */
export function setMerchantCardRefresher(next: Refresher): void {
  refresher = next;
}

export function watchMerchant(socketId: string, merchantId: string): void {
  const set = watchers.get(socketId) ?? new Set<string>();
  set.add(merchantId);
  watchers.set(socketId, set);
}

export function unwatchMerchant(socketId: string, merchantId: string): void {
  const set = watchers.get(socketId);
  if (!set) return;
  set.delete(merchantId);
  if (set.size === 0) watchers.delete(socketId);
}

export function forgetMerchantWatcher(socketId: string): void {
  watchers.delete(socketId);
}

export function isWatchingMerchant(socketId: string, merchantId: string): boolean {
  return watchers.get(socketId)?.has(merchantId) ?? false;
}

/** Ktokolwiek ogląda jakąkolwiek półkę — bez tego zapis karty nie pyta bazy o sklep. */
export function anyMerchantWatched(): boolean {
  return watchers.size > 0;
}

/** Zapis karty: jeśli to handlarz, którego ktoś ogląda, półka jedzie od nowa. */
export async function notifyMerchantCard(
  deps: RealtimeDeps,
  campaignId: string,
  characterId: string,
): Promise<void> {
  if (!refresher || !anyMerchantWatched()) return;
  await refresher(deps, campaignId, characterId);
}
