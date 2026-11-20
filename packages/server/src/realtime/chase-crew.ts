import type { Scene, Token } from '../generated/prisma/client.js';
import type { RealtimeDeps } from './registry.js';

/**
 * Stan kierowcy w widoku aut (05.11.2026) — liść przeciw cyklowi importów
 * `tokens.ts` ↔ `chase.ts`.
 *
 * Rama pościgu i menu auta liczą „kierowca prowadzi” ze stanów figury w fotelu
 * 0 (`driverCapable`). Stany zmienia wiele dróg — rany z karty
 * (`syncWoundStatuses`), obrażenia, ręka MG, efekty tury — i każda kończy się
 * `emitTokenUpsert`. Ten jeden punkt odświeża więc auta sceny, a `chase.ts`
 * podaje tu swoje `emitChase` przy ładowaniu modułu: `tokens.ts` nie może go
 * zaimportować wprost, bo `chase.ts` importuje `tokens.ts`.
 */

type ChaseEmitter = (deps: RealtimeDeps, campaignId: string, sceneId: string) => Promise<void>;

let emitter: ChaseEmitter | null = null;

/** Woła `chase.ts` przy ładowaniu — jedyny dostawca. */
export function provideChaseEmitter(next: ChaseEmitter): void {
  emitter = next;
}

/** Czy zmiana tej figury może zmienić, czy auto ma kierowcę. */
export function seatedDriverOnChase(
  scene: Pick<Scene, 'kind'>,
  token: Pick<Token, 'sceneVehicleId' | 'vehicleSeat'>,
): boolean {
  return scene.kind === 'chase' && token.sceneVehicleId !== null && token.vehicleSeat === 0;
}

/**
 * Rozsyła auta sceny pościgu po zmianie tury (etap 72e): plan autopilota
 * i Nitro w widoku zależą od tego, czyja jest tura, a zmiana wskaźnika nie
 * rusza żadnego auta. Woła tracker (`applyTurnPointer`), który nie może
 * importować `chase.ts`.
 */
export async function refreshChaseOnTurn(deps: RealtimeDeps, sceneId: string): Promise<void> {
  if (!emitter) return;
  const scene = await deps.ctx.prisma.scene.findUnique({
    where: { id: sceneId },
    select: { kind: true, campaignId: true },
  });
  if (scene?.kind !== 'chase') return;
  await emitter(deps, scene.campaignId, sceneId);
}

/** Rozsyła auta sceny po zmianie figury w fotelu kierowcy. */
export async function refreshChaseForDriver(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Pick<Scene, 'id' | 'kind'>,
  token: Pick<Token, 'sceneVehicleId' | 'vehicleSeat'>,
): Promise<void> {
  if (!emitter || !seatedDriverOnChase(scene, token)) return;
  await emitter(deps, campaignId, scene.id);
}
