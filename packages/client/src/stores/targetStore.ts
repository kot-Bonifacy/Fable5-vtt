import { create } from 'zustand';
import type { StateSyncPayload, TokenTargetBroadcast } from '@vtt/shared';
import { useTokenStore } from './tokenStore.js';

/**
 * Trwałe cele figur oglądanej sceny (etap 50c) — kto w kogo mierzy.
 *
 * Cel należy do figury-strzelca (decyzja MG z 11.10), więc klucz to id
 * strzelca. Serwer wysyła tylko pary, z których ten widz widzi obie figury;
 * mapa obraca grot strzelca na cel, a broń z paska strzela w cel figury,
 * którą się prowadzi.
 */
interface TargetStoreState {
  /** Id celu po id figury-strzelca. */
  targets: Readonly<Record<string, string>>;

  applySync: (payload: StateSyncPayload) => void;
  apply: (broadcast: Pick<TokenTargetBroadcast, 'tokenId' | 'targetId'>) => void;
  /** Figura zniknęła z mapy — nie mierzy i nie jest celem. */
  forget: (tokenId: string) => void;
}

export const useTargetStore = create<TargetStoreState>((set) => ({
  targets: {},

  applySync: (payload) =>
    set({
      targets: Object.fromEntries(
        (payload.targets ?? []).map((entry) => [entry.tokenId, entry.targetId]),
      ),
    }),
  apply: ({ tokenId, targetId }) =>
    set((state) => {
      if ((state.targets[tokenId] ?? null) === targetId) return state;
      const targets = { ...state.targets };
      if (targetId === null) delete targets[tokenId];
      else targets[tokenId] = targetId;
      return { targets };
    }),
  forget: (tokenId) =>
    set((state) => {
      const entries = Object.entries(state.targets).filter(
        ([shooter, target]) => shooter !== tokenId && target !== tokenId,
      );
      if (entries.length === Object.keys(state.targets).length) return state;
      return { targets: Object.fromEntries(entries) };
    }),
}));

/** Cel figury, o ile cel stoi na mapie tego widza; inaczej null. */
export function targetOf(tokenId: string | null): string | null {
  if (!tokenId) return null;
  const targetId = useTargetStore.getState().targets[tokenId];
  return targetId && useTokenStore.getState().tokens[targetId] ? targetId : null;
}

/**
 * Co robi `T` / podwójny prawy klik na figurze `picked`, gdy strzelec mierzy
 * w `current` (etap 50c): ta sama figura drugi raz zdejmuje cel, inna go
 * przenosi, a sam strzelec zdejmuje swój cel. `undefined` — nie ma nic do
 * zrobienia (strzelec bez celu wskazał siebie).
 */
export function nextTarget(
  shooterId: string,
  current: string | null,
  picked: string,
): string | null | undefined {
  if (picked === shooterId) return current === null ? undefined : null;
  return current === picked ? null : picked;
}
