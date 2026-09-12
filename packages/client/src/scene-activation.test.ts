import { beforeEach, describe, expect, it } from 'vitest';
import type { SceneView } from '@vtt/shared';
import { buildWelcomeScene } from './map/welcome-map.js';
import { useSceneStore } from './stores/sceneStore.js';

/**
 * Kto idzie za aktywacją sceny (`followActivation`).
 *
 * Usterka z 11.09: MG, który połączył się, gdy żadna scena nie była aktywna,
 * po własnym „Aktywuj" dalej widział „Brak sceny". Serwer przenosił jego
 * gniazdo do pokoju sceny, a klient wołał `applyScene`, które odświeża
 * wyłącznie scenę **już** oglądaną — czyli przy `null` nie robiło nic. Mapa
 * wracała dopiero po przeładowaniu karty albo kliknięciu „Pokaż".
 */
function scene(id: string, name = id): SceneView {
  return { ...buildWelcomeScene(1448, 1086), id, name };
}

describe('aktywacja sceny u klienta', () => {
  beforeEach(() => {
    useSceneStore.setState({ scene: null, scenes: [], draft: null, effectiveScene: null });
  });

  it('MG bez sceny na ekranie idzie za aktywacją i prosi o figury', () => {
    const needsTokens = useSceneStore.getState().followActivation(scene('a'), true);
    expect(needsTokens).toBe(true);
    expect(useSceneStore.getState().effectiveScene?.id).toBe('a');
  });

  it('MG oglądający inną scenę zostaje przy swoim podglądzie', () => {
    useSceneStore.getState().setScene(scene('podgląd'));
    const needsTokens = useSceneStore.getState().followActivation(scene('a'), true);
    expect(needsTokens).toBe(false);
    expect(useSceneStore.getState().scene?.id).toBe('podgląd');
  });

  it('MG oglądający aktywowaną scenę dostaje ją odświeżoną, bez dociągania figur', () => {
    useSceneStore.getState().setScene(scene('a', 'stara nazwa'));
    const needsTokens = useSceneStore.getState().followActivation(scene('a', 'nowa'), true);
    expect(needsTokens).toBe(false);
    expect(useSceneStore.getState().scene?.name).toBe('nowa');
  });

  it('gracz idzie za aktywacją zawsze, a figury dociąga tylko przy zmianie sceny', () => {
    const store = () => useSceneStore.getState();
    expect(store().followActivation(scene('a'), false)).toBe(true);
    expect(store().followActivation(scene('a', 'po zmianie'), false)).toBe(false);
    expect(store().scene?.name).toBe('po zmianie');
    expect(store().followActivation(scene('b'), false)).toBe(true);
    expect(store().scene?.id).toBe('b');
  });
});
