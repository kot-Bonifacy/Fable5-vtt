import { create } from 'zustand';

/**
 * Kanał komunikatów nad mapą (etap 55, wzór: `ui.notifications` z Foundry).
 *
 * Jedna kolumna na górze-środku zamiast notek w czacie, banerów nad mapą
 * i zdań w oknach. Kiedy komunikat znika, mówi jego kształt (decyzja MG
 * z 17.10): z przyciskami — po wyborze, odmowa — przy następnej próbie w tym
 * samym temacie, informacja — sama po kilku sekundach. ✕ zamyka każdy.
 * Stany przypięte (Stop, celowanie…) nie mieszkają tutaj: rysuje je
 * `NoticeColumn` wprost ze stanu, więc znikają razem z nim.
 */

/** Kolor paska: czerń — informacja, bursztyn — uwaga lub wybór, czerwień — odmowa. */
export type NoticeTone = 'info' | 'warn' | 'danger';

/**
 * Temat to „czego dotyczyła próba”. Nowy komunikat w temacie zastępuje stary,
 * a udana próba (`clearNotices`) zamyka wszystkie z tego tematu — tak odmowa
 * ruchu nie wisi, kiedy figura już idzie.
 */
export type NoticeTopic =
  | 'move'
  | 'attack'
  | 'action'
  | 'target'
  | 'token'
  | 'scene'
  | 'net'
  | 'exchange'
  | 'check'
  | 'table'
  | 'clock'
  | 'session'
  | 'character'
  | 'handout'
  | 'journal';

export interface NoticeAction {
  label: string;
  title?: string;
  run: () => void;
}

export interface Notice {
  id: string;
  tone: NoticeTone;
  title: string;
  text: string;
  topic: NoticeTopic | null;
  actions?: NoticeAction[];
  /** Ile ms stoi sam; `null` — czeka na wybór, następną próbę albo ✕. */
  lifetime: number | null;
  /** Rośnie, gdy to samo zdanie pada jeszcze raz: kolumna liczy czas od nowa. */
  raised: number;
}

export type NoticeInput = Omit<Notice, 'id' | 'raised'>;

/** Więcej naraz nie czyta nikt; przy piątym ustępuje najstarszy bez przycisków. */
export const NOTICE_LIMIT = 4;

/**
 * Czas informacji: 4 s na krótkie zdanie, dłuższe stoi dłużej (ok. 50 ms na
 * znak ponad 60), nie dłużej niż 10 s. Foundry trzyma 5 s bez względu na długość,
 * ale nasze zdania bywają dwulinijkowe („Usunięto ścianę — Ctrl+Z cofa” vs zdanie
 * o sesji), a najechanie i tak zatrzymuje zegar.
 */
export function infoLifetime(text: string): number {
  return Math.min(10_000, 4_000 + Math.max(0, text.length - 60) * 50);
}

/**
 * Czysta reguła kolumny: to samo zdanie odświeża swój wiersz (bez nowego id,
 * więc bez mrugnięcia), nowe w temacie zastępuje stare, a ponad limit wypada
 * najstarszy — najpierw taki, który nie czeka na wybór.
 */
export function pushNotice(list: Notice[], input: NoticeInput, id: string): Notice[] {
  const same = list.find(
    (n) => n.text === input.text && n.tone === input.tone && n.topic === input.topic,
  );
  if (same) {
    return list.map((n) => (n === same ? { ...n, ...input, id: n.id, raised: n.raised + 1 } : n));
  }
  const kept = input.topic === null ? list : list.filter((n) => n.topic !== input.topic);
  const next = [...kept, { ...input, id, raised: 0 }];
  while (next.length > NOTICE_LIMIT) {
    const plain = next.findIndex((n) => !n.actions?.length);
    next.splice(plain >= 0 ? plain : 0, 1);
  }
  return next;
}

interface NoticeStoreState {
  notices: Notice[];
  /** Zwraca id wiersza (także odświeżonego). */
  show: (input: NoticeInput) => string;
  dismiss: (id: string) => void;
  clearTopic: (topic: NoticeTopic) => void;
  /** Zdejmuje odmowy i pytania tematu, a informacja dożywa swojego czasu. */
  settleTopic: (topic: NoticeTopic) => void;
  reset: () => void;
}

let counter = 0;

export const useNoticeStore = create<NoticeStoreState>((set, get) => ({
  notices: [],
  show: (input) => {
    const next = pushNotice(get().notices, input, `notice-${++counter}`);
    set({ notices: next });
    const shown = next.find(
      (n) => n.text === input.text && n.tone === input.tone && n.topic === input.topic,
    );
    return shown?.id ?? '';
  },
  dismiss: (id) => set((state) => ({ notices: state.notices.filter((n) => n.id !== id) })),
  clearTopic: (topic) =>
    set((state) =>
      state.notices.some((n) => n.topic === topic)
        ? { notices: state.notices.filter((n) => n.topic !== topic) }
        : state,
    ),
  settleTopic: (topic) =>
    set((state) =>
      state.notices.some((n) => n.topic === topic && n.tone !== 'info')
        ? { notices: state.notices.filter((n) => n.topic !== topic || n.tone === 'info') }
        : state,
    ),
  reset: () => set({ notices: [] }),
}));
