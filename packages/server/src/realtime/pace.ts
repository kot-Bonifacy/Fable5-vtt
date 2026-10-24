import type { TokenPaceBroadcast } from '@vtt/shared';
import { PACE_FALLBACK_CAP_M, paceOwed, paceSpend, type PaceState } from '@vtt/shared';
import type { Scene, Token } from '../generated/prisma/client.js';
import { readSheetMoveBudget } from '../sheets.js';
import { RealtimeError, type RealtimeDeps } from './registry.js';
import { emitToCampaignUser } from './state.js';

/**
 * Pula metrów Eksploracji po stronie serwera (etap 45). Od 24.10 płaci z niej
 * tylko przeciąganie figury i Skok — marsz klikiem idzie do celu bez postoju.
 *
 * Stan żyje **w pamięci procesu**, nie w bazie: to tempo marszu z ostatnich
 * dziesięciu sekund, a restart serwera po prostu napełnia wszystkim pule. Klucz
 * to figura, nie gracz — dwie figury jednego gracza chodzą każda swoim tempem.
 * Rachunek jest w `shared/pace.ts`; tu tylko pamięć, wielkość puli z karty
 * i wysyłka stanu graczom figury.
 */
const ledger = new Map<string, PaceState>();

/** Zegar puli — testy podmieniają `now`, żeby nie czekać dziesięciu sekund. */
export const paceClock = { now: (): number => Date.now() };

/**
 * Wyłącznik puli dla testów, które o pulę nie pytają (etap 52). Do 52 takie
 * testy stawiały scenę w „Swobodnym”; ten tryb zniknął, a ściany, mgła czy
 * Sieć nie mają powodu chodzić po 12 m na raz. Kod aplikacji go nie rusza.
 */
export const paceTesting = { off: false };

/** Ile mieści pełna pula tej figury: ruch z jednej tury według karty. */
export async function paceCapFor(
  deps: RealtimeDeps,
  token: Pick<Token, 'characterId'>,
): Promise<{ capM: number; ownerId: string | null }> {
  if (!token.characterId) return { capM: PACE_FALLBACK_CAP_M, ownerId: null };
  const character = await deps.ctx.prisma.character.findUnique({
    where: { id: token.characterId },
    select: { data: true, ownerId: true },
  });
  if (!character) return { capM: PACE_FALLBACK_CAP_M, ownerId: null };
  return {
    capM: readSheetMoveBudget(character, deps.ctx.cpred).metresPerMove,
    ownerId: character.ownerId,
  };
}

/** Dług puli figury teraz — do widoku i do testów. */
export function paceOwedNow(tokenId: string, capM: number): number {
  return paceOwed(ledger.get(tokenId), capM, paceClock.now());
}

async function emitPace(
  deps: RealtimeDeps,
  campaignId: string,
  token: Pick<Token, 'id' | 'ownerId'>,
  sheetOwnerId: string | null,
  owedM: number,
): Promise<void> {
  const payload: TokenPaceBroadcast = { tokenId: token.id, owedM };
  const ids = new Set([token.ownerId, sheetOwnerId].filter((id): id is string => !!id));
  for (const userId of ids) {
    await emitToCampaignUser(deps.io, campaignId, userId, 'token:pace', payload);
  }
}

/**
 * Płaci za krok gracza z puli albo odmawia `MOVE_PACE`.
 *
 * Woła to `validateTokenMove` dla ruchu, którego nie pilnuje walka, na scenie
 * w Eksploracji. Odmowa najpierw wysyła graczowi stan puli — jego klient mógł
 * go nie znać (odświeżona karta, druga przeglądarka) i narysował trasę z pełnej
 * — a dopiero potem rzuca, więc figura wraca, a ślady butów już mówią prawdę.
 */
export async function chargePace(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Pick<Scene, 'playerMove'>,
  token: Pick<Token, 'id' | 'ownerId' | 'characterId'>,
  metres: number,
): Promise<void> {
  if (scene.playerMove !== 'explore' || paceTesting.off) return;
  const { capM, ownerId } = await paceCapFor(deps, token);
  const now = paceClock.now();
  const before = ledger.get(token.id);
  const after = paceSpend(before, capM, metres, now);
  if (!after) {
    await emitPace(deps, campaignId, token, ownerId, paceOwed(before, capM, now));
    throw new RealtimeError('MOVE_PACE');
  }
  ledger.set(token.id, after);
  await emitPace(deps, campaignId, token, ownerId, after.owedM);
}

/**
 * To samo pytanie co `chargePace`, bez płacenia (etap 52): czy ruch osądzany
 * na sucho zmieści się w puli. Marsz klikiem puli już nie pyta (24.10), więc
 * pyta tu tylko Skok przed lądowaniem, które zapłaci.
 */
export async function checkPace(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Pick<Scene, 'playerMove'>,
  token: Pick<Token, 'id' | 'ownerId' | 'characterId'>,
  metres: number,
): Promise<void> {
  if (scene.playerMove !== 'explore' || paceTesting.off) return;
  const { capM, ownerId } = await paceCapFor(deps, token);
  const now = paceClock.now();
  const before = ledger.get(token.id);
  if (paceSpend(before, capM, metres, now)) return;
  await emitPace(deps, campaignId, token, ownerId, paceOwed(before, capM, now));
  throw new RealtimeError('MOVE_PACE');
}

/** Zapomina figurę — skasowana nie ma czego pamiętać. */
export function forgetPace(tokenId: string): void {
  ledger.delete(tokenId);
}
