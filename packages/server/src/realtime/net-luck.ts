import { parseCharacterData } from '@vtt/shared';
import { RealtimeError, type RealtimeDeps } from './registry.js';

/**
 * Szczęście w rzutach Sieci (zlecenie MG z 14.11.2026).
 *
 * Do tego dnia rzut Interfejsu leciał od razu po kliknięciu zdolności, więc
 * Szczęścia nie dało się do niego dorzucić. Teraz klik ładuje kubek, a gracz
 * dorzuca punkty w menu kubka — jak przy Teście z karty i ataku. Każdy rzut
 * Interfejsu (zdolność, Maskowanie, Paf i Agresor, Ślizg, Skaner) przyjmuje je
 * tą samą drogą: sprawdzenie puli przed Akcją Sieciową, zdjęcie z puli tuż
 * przed kośćmi (`spendCharacterLuck`) i wiersz „Szczęście” w rozbiciu karty.
 */

/** Ile Szczęścia prosi o ten rzut — liczba całkowita od zera, inaczej zero. */
export function netLuckOf(raw: unknown): number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : 0;
}

/**
 * Odmowa przed czymkolwiek, co kosztuje: brak punktów w puli nie może zjeść
 * Akcji Sieciowej. Zdejmuje je dopiero `spendCharacterLuck` przy kościach.
 */
export async function requireNetLuck(
  deps: RealtimeDeps,
  characterId: string,
  luck: number,
): Promise<void> {
  if (luck <= 0) return;
  const row = await deps.ctx.prisma.character.findUnique({ where: { id: characterId } });
  if (!row) throw new RealtimeError('CHARACTER_NOT_FOUND');
  if (luck > parseCharacterData(row.data, deps.ctx.cpred).luckCurrent) {
    throw new RealtimeError('NOT_ENOUGH_LUCK');
  }
}

/** Wiersz rozbicia karty — ten sam napis, co przy Teście z karty (`rolls.ts`). */
export function netLuckBonus(luck: number): { label: string; value: number; kind: 'luck' }[] {
  return luck > 0 ? [{ label: `Szczęście (${luck} pkt)`, value: luck, kind: 'luck' }] : [];
}
