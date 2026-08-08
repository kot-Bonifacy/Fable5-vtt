import { create } from 'zustand';
import type {
  JournalDraft,
  JournalEntryView,
  JournalIndexStatus,
  JournalProgressBroadcast,
  RelationProposal,
} from '@vtt/shared';
import { emptyJournalIndexStatus } from '@vtt/shared';

/**
 * Dziennik kampanii u klienta (etap 19c).
 *
 * Wpisy dostaje wyłącznie MG (serwer emituje do `gmRoom`), więc — jak w bazie
 * wiedzy — store nie istnieje po stronie gracza i nie ma tu nic do filtrowania.
 *
 * Szkic streszczenia żyje **tylko tutaj**, dopóki MG go nie zapisze: model niczego
 * nie wpisuje do dziennika sam, a propozycje relacji są listą do odklikania.
 */
interface JournalState {
  entries: Record<string, JournalEntryView>;
  /** Kolejność wyświetlania: najnowsza sesja u góry. */
  order: string[];
  index: JournalIndexStatus;
  /** Ile linii czatu czeka na streszczenie. */
  pendingLines: number;
  /** Wpis otwarty w formularzu; `new` = nowy, null = formularz zamknięty. */
  editing: string | 'new' | null;
  loaded: boolean;

  /** Trwające streszczanie: id żądania i ostatni postęp. */
  running: { requestId: string; progress: JournalProgressBroadcast | null } | null;
  draft: JournalDraft | null;
  proposals: RelationProposal[];
  /** Ile porcji przeszło przez model — widać, kiedy log wymagał mapy-redukcji. */
  batches: number;
  error: string | null;

  replaceAll: (entries: JournalEntryView[], index: JournalIndexStatus, pending: number) => void;
  upsert: (entry: JournalEntryView, index?: JournalIndexStatus) => void;
  remove: (id: string, index?: JournalIndexStatus) => void;
  setIndex: (index: JournalIndexStatus) => void;
  setEditing: (editing: string | 'new' | null) => void;

  startRun: (requestId: string) => void;
  setProgress: (progress: JournalProgressBroadcast) => void;
  setDraft: (draft: JournalDraft, proposals: RelationProposal[], batches: number) => void;
  patchDraft: (patch: Partial<JournalDraft>) => void;
  dropProposal: (botId: string, characterId: string) => void;
  clearDraft: () => void;
  fail: (message: string) => void;
}

const collator = new Intl.Collator('pl');

function sortIds(entries: Record<string, JournalEntryView>): string[] {
  return Object.values(entries)
    .sort(
      (a, b) =>
        b.sessionDate.localeCompare(a.sessionDate) ||
        collator.compare(b.createdAt, a.createdAt) ||
        collator.compare(a.title, b.title),
    )
    .map((entry) => entry.id);
}

export const useJournalStore = create<JournalState>((set) => ({
  entries: {},
  order: [],
  index: emptyJournalIndexStatus(),
  pendingLines: 0,
  editing: null,
  loaded: false,
  running: null,
  draft: null,
  proposals: [],
  batches: 0,
  error: null,

  replaceAll: (entries, index, pending) => {
    const byId: Record<string, JournalEntryView> = {};
    for (const entry of entries) byId[entry.id] = entry;
    set({ entries: byId, order: sortIds(byId), index, pendingLines: pending, loaded: true });
  },

  upsert: (entry, index) =>
    set((state) => {
      const entries = { ...state.entries, [entry.id]: entry };
      return { entries, order: sortIds(entries), ...(index ? { index } : {}) };
    }),

  remove: (id, index) =>
    set((state) => {
      const entries = { ...state.entries };
      delete entries[id];
      return {
        entries,
        order: sortIds(entries),
        ...(index ? { index } : {}),
        editing: state.editing === id ? null : state.editing,
      };
    }),

  setIndex: (index) => set({ index }),
  setEditing: (editing) => set({ editing }),

  startRun: (requestId) =>
    set({ running: { requestId, progress: null }, draft: null, proposals: [], error: null }),
  setProgress: (progress) =>
    set((state) =>
      state.running?.requestId === progress.requestId
        ? { running: { requestId: progress.requestId, progress } }
        : {},
    ),
  setDraft: (draft, proposals, batches) => set({ draft, proposals, batches, running: null }),
  patchDraft: (patch) =>
    set((state) => (state.draft ? { draft: { ...state.draft, ...patch } } : {})),
  dropProposal: (botId, characterId) =>
    set((state) => ({
      proposals: state.proposals.filter(
        (proposal) => proposal.botId !== botId || proposal.characterId !== characterId,
      ),
    })),
  clearDraft: () => set({ draft: null, proposals: [], batches: 0, running: null }),
  fail: (message) => set({ error: message, running: null }),
}));
