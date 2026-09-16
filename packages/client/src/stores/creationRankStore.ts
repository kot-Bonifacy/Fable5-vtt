import { create } from 'zustand';
import type { CreationRankDraft } from '@vtt/shared';

/**
 * The GM's list of players' Kompletny Pakiet drafts and their ranks (naprawa
 * 2b). Filled by the `creation:ranks` answer when the GM's socket syncs and
 * replaced whole by every `creation:ranks-sync` push — the server sends the
 * list after anything that could change it, so nothing here merges rows.
 */
interface CreationRankState {
  rows: CreationRankDraft[];
  replace: (rows: CreationRankDraft[]) => void;
}

export const useCreationRankStore = create<CreationRankState>((set) => ({
  rows: [],
  replace: (rows) => set({ rows }),
}));

/** Drafts whose player cannot buy stats until the GM picks a rank. */
export function waitingRankCount(rows: readonly CreationRankDraft[]): number {
  return rows.reduce((count, row) => (row.rankApproved ? count : count + 1), 0);
}
