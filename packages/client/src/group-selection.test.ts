import { beforeEach, describe, expect, it } from 'vitest';
import { useSelectionStore } from './stores/selectionStore.js';
import { useSceneSelectionStore } from './stores/sceneSelectionStore.js';

/**
 * Zaznaczanie wielu figur (etap 35) — i jedna umowa, której nie wolno złamać.
 *
 * Umowa z 27k mówi: **zaznaczenie figur i zaznaczenie scenerii wykluczają się
 * wzajemnie**, żeby `Delete` nigdy nie musiał zgadywać, co kasuje. Etap 35
 * dokłada po stronie figur **drugie** zaznaczenie (grupę), więc bramka między
 * store'ami ma teraz do zamknięcia dwa wejścia zamiast jednego — i dokładnie
 * o to chodzi w tym pliku.
 *
 * Testowane są same store'y, bo tam mieszka reguła. Gestów (ramka, `Shift`
 * +klik) nie da się tu dotknąć: te siedzą w `MapRenderer`, który ciągnie za
 * sobą Pixi — i są sprawdzane w przeglądarce.
 */

beforeEach(() => {
  useSelectionStore.setState({
    tokenId: null,
    focusTokenId: null,
    groupIds: [],
    dismissed: false,
  });
  useSceneSelectionStore.setState({ selected: null, hovered: null });
});

describe('grupa i sceneria wykluczają się wzajemnie (umowa z 27k)', () => {
  it('zaznaczenie grupy zdejmuje zaznaczony obiekt scenerii', () => {
    useSceneSelectionStore.getState().select({ kind: 'wall', id: 7 });
    useSelectionStore.getState().setGroup(['t1', 't2']);
    expect(useSceneSelectionStore.getState().selected).toBeNull();
  });

  it('zaznaczenie obiektu scenerii zdejmuje całą grupę, nie tylko jedną figurę', () => {
    useSelectionStore.getState().setGroup(['t1', 't2', 't3']);
    useSceneSelectionStore.getState().select({ kind: 'cover', id: 3 });
    expect(useSelectionStore.getState().groupIds).toEqual([]);
    expect(useSelectionStore.getState().tokenId).toBeNull();
  });

  it('`Shift`+klik dokładający figurę też zdejmuje scenerię', () => {
    useSceneSelectionStore.getState().select({ kind: 'light', id: 2 });
    useSelectionStore.getState().toggleInGroup('t1');
    expect(useSceneSelectionStore.getState().selected).toBeNull();
  });
});

describe('kotwica grupy — figura, którą klik w podłogę wyśle w drogę', () => {
  it('ramka prowadzi pierwszą z zaznaczonych', () => {
    useSelectionStore.getState().setGroup(['t3', 't1', 't2']);
    expect(useSelectionStore.getState().tokenId).toBe('t3');
    expect(useSelectionStore.getState().focusTokenId).toBe('t3');
  });

  it('pusta ramka nie zostawia nikogo pod sterowaniem', () => {
    useSelectionStore.getState().setGroup(['t1', 't2']);
    useSelectionStore.getState().setGroup([]);
    expect(useSelectionStore.getState().groupIds).toEqual([]);
    expect(useSelectionStore.getState().tokenId).toBeNull();
  });

  it('nie powtarza figury, która trafiła do ramki dwa razy', () => {
    useSelectionStore.getState().setGroup(['t1', 't2', 't1']);
    expect(useSelectionStore.getState().groupIds).toEqual(['t1', 't2']);
  });

  it('kotwica zostaje na swoim miejscu, dopóki nie wypadnie z grupy', () => {
    useSelectionStore.getState().setGroup(['t1', 't2']);
    useSelectionStore.getState().toggleInGroup('t3');
    expect(useSelectionStore.getState().tokenId).toBe('t1');
    useSelectionStore.getState().toggleInGroup('t1');
    expect(useSelectionStore.getState().groupIds).toEqual(['t2', 't3']);
    expect(useSelectionStore.getState().tokenId).toBe('t2');
  });
});

describe('`Shift`+klik i pojedynczy wybór', () => {
  it('pierwsze `Shift`+kliknięcie robi grupę z figury już prowadzonej', () => {
    useSelectionStore.getState().select('t1');
    useSelectionStore.getState().toggleInGroup('t2');
    expect(useSelectionStore.getState().groupIds).toEqual(['t1', 't2']);
  });

  it('drugie `Shift`+kliknięcie w tę samą figurę odejmuje ją', () => {
    useSelectionStore.getState().setGroup(['t1', 't2']);
    useSelectionStore.getState().toggleInGroup('t2');
    expect(useSelectionStore.getState().groupIds).toEqual(['t1']);
  });

  it('zwykły klik w figurę zastępuje grupę pojedynczym wyborem', () => {
    useSelectionStore.getState().setGroup(['t1', 't2', 't3']);
    useSelectionStore.getState().select('t9');
    expect(useSelectionStore.getState().groupIds).toEqual([]);
    expect(useSelectionStore.getState().tokenId).toBe('t9');
  });

  /**
   * Regres, który ta asercja trzyma za rękę: `select(null)` leci przy **każdym**
   * zakończonym marszu, a marsz jednej figury z zaznaczonej szóstki nie jest
   * powodem, żeby zapomnieć pozostałe pięć.
   */
  it('zdjęcie samego sterowania nie kasuje grupy', () => {
    useSelectionStore.getState().setGroup(['t1', 't2']);
    useSelectionStore.getState().select(null);
    expect(useSelectionStore.getState().groupIds).toEqual(['t1', 't2']);
  });

  it('„nie ważne" (prawy klik w puste tło) zdejmuje wszystko', () => {
    useSelectionStore.getState().setGroup(['t1', 't2']);
    useSelectionStore.getState().dismiss();
    expect(useSelectionStore.getState().groupIds).toEqual([]);
    expect(useSelectionStore.getState().tokenId).toBeNull();
  });

  it('zmiana sceny zapomina grupę razem z resztą wskaźników', () => {
    useSelectionStore.getState().setGroup(['t1', 't2']);
    useSelectionStore.getState().resetFocus();
    expect(useSelectionStore.getState().groupIds).toEqual([]);
  });
});
