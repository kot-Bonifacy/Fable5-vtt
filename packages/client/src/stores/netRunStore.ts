import { create } from 'zustand';
import type { NetAccessPointView, NetRunPayload } from '@vtt/shared';

/**
 * Punkty dostępu i runy u klienta (etap 26b).
 *
 * Osobny store od `netStore` (biblioteka Architektur z 26a) i to jest celowe:
 * biblioteka jest narzędziem MG poza sesją, a to jest stan gry przy stole,
 * który u gracza **też** się zapełnia. Nie ma tu nic do filtrowania — serwer
 * przysyła już wyłącznie to, co dany widz może zobaczyć: ukryte punkty dostępu
 * po prostu nie przychodzą, a piętra, na których netrunner nie był, mają
 * `kind: null` i żadnej nazwy.
 *
 * Które gniazdo jest otwarte na karcie, **nie jest** tutaj od 27l: to jest stan
 * karty, wspólny dla siedmiu rodzajów obiektów sceny, więc mieszka
 * w `sceneCardStore`.
 */
interface NetRunState {
  /** Punkty dostępu oglądanej sceny — u gracza tylko te już znalezione. */
  accessPoints: NetAccessPointView[];
  /** Runy, które ten widz może oglądać: MG wszystkie, gracz swoje. */
  runs: NetRunPayload[];
  /** Run otwarty w oknie „Sieć"; null = okno zamknięte. */
  openRunId: string | null;
  /** Ostatni komunikat pod szybem („Hasło złamane…"). */
  notice: string | null;

  replacePoints: (points: NetAccessPointView[]) => void;
  replaceRuns: (runs: NetRunPayload[]) => void;
  openRun: (runId: string | null) => void;
  setNotice: (notice: string | null) => void;
}

export const useNetRunStore = create<NetRunState>((set) => ({
  accessPoints: [],
  runs: [],
  openRunId: null,
  notice: null,

  // Karta gniazda zdjętego ze sceny zamyka się sama — pilnuje tego
  // `SceneObjectCard`, bo obiekt znika spod niej tak samo w każdym z siedmiu
  // store'ów (etap 27l).
  replacePoints: (accessPoints) => set({ accessPoints }),

  replaceRuns: (runs) =>
    set((state) => ({
      runs,
      // Okno pilnuje się samo: run, który się skończył (odłączenie, awaryjne
      // wyjście, skasowany punkt dostępu), zamyka okno zamiast zostawiać
      // nieaktualny szyb na ekranie.
      openRunId: runs.some((run) => run.runId === state.openRunId)
        ? state.openRunId
        : (runs[0]?.runId ?? null),
      notice: runs.some((run) => run.runId === state.openRunId) ? state.notice : null,
    })),

  openRun: (openRunId) => set({ openRunId, notice: null }),
  setNotice: (notice) => set({ notice }),
}));

/** Run tego widza otwarty w oknie — albo pierwszy, jaki ma. */
export function currentRun(state: NetRunState): NetRunPayload | null {
  return state.runs.find((run) => run.runId === state.openRunId) ?? state.runs[0] ?? null;
}

/**
 * Punkt dostępu pod kliknięciem, w promieniu tolerancji (etap 26b).
 *
 * Ten sam sposób trafiania co w lampy z 18b: gniazdo nie ma rozmiaru w świecie,
 * tylko uchwyt na ekranie, więc o trafieniu decyduje odległość od jego środka.
 */
export function pickAccessPointAt(
  points: readonly NetAccessPointView[],
  at: { x: number; y: number },
  tolerancePx: number,
): NetAccessPointView | null {
  let best: NetAccessPointView | null = null;
  let bestDistance = tolerancePx;
  for (const point of points) {
    const distance = Math.hypot(point.x - at.x, point.y - at.y);
    if (distance <= bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}
