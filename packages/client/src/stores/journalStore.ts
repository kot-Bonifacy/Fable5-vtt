import { create } from 'zustand';
import type {
  JournalDraft,
  JournalEntryView,
  JournalHandoutLink,
  JournalIndexStatus,
  JournalPlayerEntry,
  JournalProgressBroadcast,
  RelationProposal,
} from '@vtt/shared';
import { emptyJournalIndexStatus } from '@vtt/shared';

/**
 * Dziennik kampanii u klienta (etap 19c, rozszerzony w 24b).
 *
 * Od 24b store istnieje **po obu stronach stołu**, ale w dwóch rozdzielnych
 * kolekcjach: `entries` to widok MG (tagi, widoczność, stan indeksu), `shared`
 * to widok gracza (sam tekst plus odnośniki do materiałów, które dostał). Który
 * z nich jest wypełniony, rozstrzyga rola konta — nic tu nie filtrujemy,
 * bo filtr stoi w zapytaniu na serwerze.
 *
 * Szkic streszczenia żyje **tylko tutaj**, dopóki MG go nie zapisze: model niczego
 * nie wpisuje do dziennika sam, a propozycje relacji są listą do odklikania.
 */
interface JournalState {
  entries: Record<string, JournalEntryView>;
  /** Kolejność wyświetlania: najnowsza sesja u góry. */
  order: string[];
  /** Wpisy odsłonięte stołowi — wypełnione wyłącznie u gracza. */
  shared: Record<string, JournalPlayerEntry>;
  sharedOrder: string[];
  /** Materiały, które MG może przypiąć do wpisu; u gracza pusta. */
  handouts: JournalHandoutLink[];
  index: JournalIndexStatus;
  /** Ile linii czatu czeka na streszczenie. */
  pendingLines: number;
  /** Wpis otwarty w formularzu; `new` = nowy, null = formularz zamknięty. */
  editing: string | 'new' | null;
  /** Wpis, na który ma skoczyć zakładka — ustawia go przycisk z czatu. */
  focus: string | null;
  loaded: boolean;

  /** Trwające streszczanie: id żądania i ostatni postęp. */
  running: { requestId: string; progress: JournalProgressBroadcast | null } | null;
  draft: JournalDraft | null;
  proposals: RelationProposal[];
  /** Ile porcji przeszło przez model — widać, kiedy log wymagał mapy-redukcji. */
  batches: number;
  error: string | null;

  replaceAll: (
    entries: JournalEntryView[],
    index: JournalIndexStatus,
    pending: number,
    handouts: JournalHandoutLink[],
  ) => void;
  upsert: (entry: JournalEntryView, index?: JournalIndexStatus) => void;
  remove: (id: string, index?: JournalIndexStatus) => void;
  replaceShared: (entries: JournalPlayerEntry[]) => void;
  upsertShared: (entry: JournalPlayerEntry) => void;
  removeShared: (id: string) => void;
  setIndex: (index: JournalIndexStatus) => void;
  setEditing: (editing: string | 'new' | null) => void;
  setFocus: (id: string | null) => void;

  startRun: (requestId: string) => void;
  setProgress: (progress: JournalProgressBroadcast) => void;
  setDraft: (draft: JournalDraft, proposals: RelationProposal[], batches: number) => void;
  patchDraft: (patch: Partial<JournalDraft>) => void;
  dropProposal: (botId: string, characterId: string) => void;
  clearDraft: () => void;
  fail: (message: string) => void;
}

const collator = new Intl.Collator('pl');

/** Najnowsza sesja u góry — ta sama kolejność po obu stronach stołu. */
function sortIds<T extends JournalPlayerEntry>(entries: Record<string, T>): string[] {
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
  shared: {},
  sharedOrder: [],
  handouts: [],
  index: emptyJournalIndexStatus(),
  pendingLines: 0,
  editing: null,
  focus: null,
  loaded: false,
  running: null,
  draft: null,
  proposals: [],
  batches: 0,
  error: null,

  replaceAll: (entries, index, pending, handouts) => {
    const byId: Record<string, JournalEntryView> = {};
    for (const entry of entries) byId[entry.id] = entry;
    set({
      entries: byId,
      order: sortIds(byId),
      index,
      pendingLines: pending,
      handouts,
      loaded: true,
    });
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

  replaceShared: (entries) => {
    const byId: Record<string, JournalPlayerEntry> = {};
    for (const entry of entries) byId[entry.id] = entry;
    set({ shared: byId, sharedOrder: sortIds(byId), loaded: true });
  },

  upsertShared: (entry) =>
    set((state) => {
      const shared = { ...state.shared, [entry.id]: entry };
      return { shared, sharedOrder: sortIds(shared) };
    }),

  removeShared: (id) =>
    set((state) => {
      if (!(id in state.shared)) return {};
      const shared = { ...state.shared };
      delete shared[id];
      return {
        shared,
        sharedOrder: sortIds(shared),
        focus: state.focus === id ? null : state.focus,
      };
    }),

  setIndex: (index) => set({ index }),
  setEditing: (editing) => set({ editing }),
  setFocus: (id) => set({ focus: id }),

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
