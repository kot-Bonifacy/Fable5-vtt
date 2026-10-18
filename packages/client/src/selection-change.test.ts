import { beforeEach, describe, expect, it } from 'vitest';
import { reportsSelection } from './map/selection-change.js';
import { useSelectionStore } from './stores/selectionStore.js';

/**
 * Pasek po podglądzie cudzej figury (zgłoszenie MG, 18.10.2026).
 *
 * Gracz prowadzi swoją figurę, klika cudzą (pasek ją pokazuje, prowadzenie
 * zostaje), potem znowu swoją — albo przychodzi jego tura. Renderer widział
 * „tę samą figurę co prowadzona" i nic nie zgłaszał, więc pasek zostawał przy
 * cudzym portrecie. Sam klik żyje w `MapRenderer` (Pixi), stąd test reguły
 * i jej skutku w store, tą samą drogą co `onSelectionChange` w `MapArea`.
 */

beforeEach(() => {
  useSelectionStore.setState({
    tokenId: null,
    focusTokenId: null,
    groupIds: [],
    dismissed: false,
  });
});

describe('reportsSelection', () => {
  it('zmiana figury idzie do store zawsze', () => {
    expect(reportsSelection('own', 'other', 'pick')).toBe(true);
    expect(reportsSelection('own', null, 'gone')).toBe(true);
  });

  it('ponowny wybór prowadzonej figury też idzie — pasek mógł od niej odejść', () => {
    expect(reportsSelection('own', 'own', 'pick')).toBe(true);
  });

  it('„nic nie pokazuj" i zmiana sceny idą nawet bez prowadzonej figury', () => {
    expect(reportsSelection(null, null, 'dismiss')).toBe(true);
    expect(reportsSelection(null, null, 'scene')).toBe(true);
  });

  it('powtórzone `gone` i puste `pick` nie mają nic do powiedzenia', () => {
    expect(reportsSelection(null, null, 'gone')).toBe(false);
    expect(reportsSelection(null, null, 'pick')).toBe(false);
  });
});

describe('klik we własną figurę po podglądzie cudzej', () => {
  it('sprowadza pasek z powrotem do własnej figury', () => {
    const selection = useSelectionStore.getState();
    selection.select('own');
    selection.focus('other');
    expect(useSelectionStore.getState().focusTokenId).toBe('other');
    expect(useSelectionStore.getState().tokenId).toBe('own');

    // Renderer wciąż prowadzi `own`; tak samo przy zmianie tury na gracza.
    if (reportsSelection('own', 'own', 'pick')) useSelectionStore.getState().select('own');

    expect(useSelectionStore.getState().focusTokenId).toBe('own');
    expect(useSelectionStore.getState().tokenId).toBe('own');
  });
});
