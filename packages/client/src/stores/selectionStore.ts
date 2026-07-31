import { create } from 'zustand';

/**
 * The token this user is steering (stage 16e) — core VTT, no game system.
 *
 * Its own tiny store rather than a field of `tokenStore`, for the same reason
 * `explorationStore` is separate from `wallStore`: the token list is *the map*,
 * shared by everyone and arriving from the server, while this is one viewer's
 * private pointer state that never travels. Nobody else at the table needs to
 * know which figure I have clicked on.
 *
 * Only a token this user may actually move is ever put here — the GM's every
 * token, a player's own — because selection exists to answer „who walks when I
 * click the floor?" and nothing else. What the third ring on the map means is
 * therefore exactly „this one obeys me".
 */
interface SelectionStoreState {
  tokenId: string | null;
  select: (tokenId: string | null) => void;
}

export const useSelectionStore = create<SelectionStoreState>((set) => ({
  tokenId: null,
  select: (tokenId) => set({ tokenId }),
}));
