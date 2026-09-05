import { create } from 'zustand';
import type { SceneObjectRef } from '@vtt/shared';
import { useSelectionStore } from './selectionStore.js';

/**
 * Co z **scenerii** ma teraz zaznaczone ten widz (etap 27k).
 *
 * Osobny store obok `selectionStore` z tego samego powodu, dla którego tamten
 * jest osobny od `tokenStore`: to jest prywatny wskaźnik jednej przeglądarki,
 * który nigdy nie jedzie po sieci. Nikt przy stole nie musi wiedzieć, że MG
 * kliknął akurat w tę lampę.
 *
 * **Dwa zaznaczenia wykluczają się wzajemnie** i to jest cały sens trzymania
 * ich w dwóch miejscach z jedną bramką między nimi: `Delete` nigdy nie może
 * zgadywać, co kasuje. Zaznaczenie obiektu zdejmuje figurę, zaznaczenie figury
 * zdejmuje obiekt — a że figury `Delete` i tak nie dotyka (świadome odstępstwo
 * od Foundry: id żetonu noszą inicjatywa i runy Sieci), klawisz albo ma pod
 * ręką obiekt scenerii, albo nie ma nic.
 */

interface SceneSelectionState {
  selected: SceneObjectRef | null;
  /** Obiekt pod kursorem na uzbrojonej warstwie — sam obrys, nic więcej. */
  hovered: SceneObjectRef | null;

  select: (ref: SceneObjectRef | null) => void;
  setHovered: (ref: SceneObjectRef | null) => void;
  /** Zmiana sceny albo odłożenie narzędzia: zapominamy jedno i drugie. */
  clear: () => void;
}

export const useSceneSelectionStore = create<SceneSelectionState>((set) => ({
  selected: null,
  hovered: null,

  select: (ref) => {
    // Bramka między dwoma zaznaczeniami. `select(null)` nie rusza figury —
    // „przestałem trzymać ścianę" nie znaczy „przestałem sterować figurą".
    if (ref) {
      // Od etapu 35 po drugiej stronie bramki stoją **dwa** zaznaczenia figur:
      // sterowana jedna i grupa. `select(null)` zdejmuje pierwsze, ale grupy
      // świadomie nie rusza (marsz kończy się tym samym wywołaniem), więc drugie
      // trzeba zdjąć wprost — inaczej `Delete` miałby pod ręką i ścianę,
      // i sześć figur, a to jest dokładnie ta niejednoznaczność, której umowa
      // z 27k zabrania.
      useSelectionStore.getState().select(null);
      useSelectionStore.getState().clearGroup();
    }
    set({ selected: ref });
  },

  setHovered: (hovered) => set({ hovered }),

  clear: () => set({ selected: null, hovered: null }),
}));

/** Czy to ten sam obiekt — porównanie po wartości, bo referencje są świeże. */
export function sameSceneObject(a: SceneObjectRef | null, b: SceneObjectRef | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && a.id === b.id;
}

/**
 * Druga strona bramki: klik w figurę zdejmuje zaznaczoną scenerię.
 *
 * Subskrypcja, a nie gałąź w `selectionStore`, i to nie z lenistwa — rdzeń
 * wyboru figury jest starszy o dziesięć etapów i wołany z ~20 miejsc
 * (`MapRenderer`, `Tab`, przyciski lewej szyny, koniec marszu). Dopisanie mu
 * wiedzy o scenerii odwróciłoby zależność: to nowa warstwa ma znać starą.
 *
 * Reagujemy wyłącznie na **pojawienie się** figury. `select(null)` leci przy
 * każdym zakończonym marszu i przy każdym zaznaczeniu obiektu (patrz `select`
 * wyżej) — gdyby zerowało tutaj, zaznaczenie ściany kasowałoby się w tej samej
 * porcji zdarzeń, w której powstało.
 *
 * Od etapu 35 ta sama subskrypcja pilnuje **grupy**: ramka rzucona na figury
 * zdejmuje zaznaczoną scenerię tak samo, jak zrobiłby to klik w jedną figurę.
 * Warunek jest ten sam („pojawiło się coś nowego"), bo `clearGroup` leci przy
 * każdym pojedynczym wyborze.
 */
useSelectionStore.subscribe((state, previous) => {
  const tookToken = state.tokenId !== null && state.tokenId !== previous.tokenId;
  const tookGroup = state.groupIds.length > 0 && state.groupIds !== previous.groupIds;
  if (!tookToken && !tookGroup) return;
  useSceneSelectionStore.setState({ selected: null });
});
