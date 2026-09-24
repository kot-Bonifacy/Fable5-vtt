import { create } from 'zustand';
import type { CreationPermitRow, CreationRankDraft } from '@vtt/shared';

/**
 * The GM's list of players' drafts: Kompletny Pakiet ranks (naprawa 2b) and,
 * since 24.09, Krawędziarz dice the GM may let a player throw again. Filled by the `creation:ranks` answer when the GM's socket syncs and
 * replaced whole by every `creation:ranks-sync` push — the server sends the
 * list after anything that could change it, so nothing here merges rows.
 */
interface CreationRankState {
  rows: CreationRankDraft[];
  replace: (rows: CreationRankDraft[]) => void;
  /** Players asking for a new character, or holding an unused consent (24.09). */
  permits: CreationPermitRow[];
  replacePermits: (permits: CreationPermitRow[]) => void;
}

export const useCreationRankStore = create<CreationRankState>((set) => ({
  rows: [],
  replace: (rows) => set({ rows }),
  permits: [],
  replacePermits: (permits) => set({ permits }),
}));

/**
 * What waits for the GM's hand: drafts whose player cannot buy stats until a
 * rank is picked, and players asking for a new character (24.09).
 */
export function waitingRankCount(
  rows: readonly CreationRankDraft[],
  permits: readonly CreationPermitRow[] = [],
): number {
  return (
    rows.reduce((count, row) => (row.rankApproved ? count : count + 1), 0) +
    permits.filter((row) => row.status === 'requested').length
  );
}
