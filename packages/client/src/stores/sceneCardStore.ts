import { create } from 'zustand';
import type { SceneObjectRef } from '@vtt/shared';
import { useSceneSelectionStore } from './sceneSelectionStore.js';

/**
 * Która karta obiektu sceny jest otwarta (etap 27l).
 *
 * Do 27l karty miały trzy różne domy: gniazdo trzymało `editingPointId`
 * w `netRunStore`, strefa `editingZoneId` w `zoneStore`, notatka `editingId`
 * w `noteStore` — a ściana, osłona, światło i rysunek nie miały karty w ogóle.
 * Trzy stany znaczyły trzy zachowania: inne zamykanie, inna reakcja na `Esc`,
 * inne miejsce na ekranie. Ten store jest odpowiedzią „jedno miejsce dla
 * wszystkich kart" z zakresu etapu.
 *
 * Prywatny wskaźnik jednej przeglądarki, jak `sceneSelectionStore` obok: nikt
 * przy stole nie musi wiedzieć, że MG ogląda akurat tę lampę.
 */

interface SceneCardState {
  /** Obiekt, którego karta stoi otwarta; `null` = żadna. */
  open: SceneObjectRef | null;
  /**
   * Świeżo wbita pinezka, której notatki jeszcze nie napisano. Jedyny stan
   * karty **bez** obiektu po drugiej stronie — notatka powstaje dopiero
   * z zapisanego tekstu, więc dopóki go nie ma, nie ma czego zaznaczyć ani
   * skasować.
   */
  noteDraft: { x: number; y: number } | null;

  openCard: (ref: SceneObjectRef) => void;
  startNoteDraft: (at: { x: number; y: number }) => void;
  close: () => void;
}

export const useSceneCardStore = create<SceneCardState>((set) => ({
  open: null,
  noteDraft: null,

  /**
   * Karta **nie** zaznacza obiektu i to jest celowe. Dwuklik na uzbrojonej
   * warstwie i tak zaznaczył pierwszym kliknięciem, a gniazdo otwiera się
   * także zwykłym klikiem bez narzędzia — u gracza również. Zaznaczanie
   * stamtąd oddałoby graczowi obrys i klawisz `Delete`, którym i tak nic nie
   * zrobi, a MG dostawałby zaznaczenie poza warstwą, czyli dokładnie to,
   * czego 27k się pozbyło.
   */
  openCard: (ref) => set({ open: ref, noteDraft: null }),

  startNoteDraft: (at) => set({ open: null, noteDraft: at }),

  close: () => set({ open: null, noteDraft: null }),
}));

/**
 * Zmiana zaznaczenia figury zamyka kartę obiektu — druga strona tej samej
 * bramki, którą `sceneSelectionStore` trzyma dla obrysu. Bez tego karta ściany
 * zostawałaby otwarta nad mapą, na której MG steruje już kimś innym.
 */
useSceneSelectionStore.subscribe((state, previous) => {
  if (state.selected !== null || previous.selected === null) return;
  useSceneCardStore.setState({ open: null });
});
