import { beforeEach, describe, expect, it } from 'vitest';
import { useMapToolStore } from './stores/mapToolStore.js';

/**
 * „Jedno kliknięcie trafia w jedną rzecz" — od strony **stanu**, nie kliknięcia.
 *
 * `map-click.test.ts` pilnuje kolejności znaczeń w samym rendererze; ten
 * pilnuje rzeczy o piętro wyżej: że dwóch trybów naraz w ogóle nie da się
 * ustawić. Do 28.08 dało się — żeton w ręku mieszkał w `tokenStore`, a wybór
 * narzędzia w `mapToolStore`, więc uzbrojony punkt dostępu i uzbrojony żeton
 * były dwoma niezależnymi prawdami. Przy oględzinach 26b jeden klik postawił
 * oba; po naprawie z 22.08 (`toolSpentThisClick`) klik szedł już tylko na
 * narzędzie, ale żeton zostawał w ręku niewidzialnie i nic tego nie mówiło.
 */
describe('tryb mapy jest jeden', () => {
  beforeEach(() => {
    useMapToolStore.setState({ tool: 'pointer', tokenPlacement: null });
  });

  it('uzbrojenie narzędzia wytrąca żeton z ręki', () => {
    const store = useMapToolStore.getState();
    store.setTokenPlacement({ name: 'Kolec', imageUrl: null });
    expect(useMapToolStore.getState().tokenPlacement).not.toBeNull();

    useMapToolStore.getState().setTool('netpoint');
    expect(useMapToolStore.getState().tokenPlacement).toBeNull();
    expect(useMapToolStore.getState().tool).toBe('netpoint');
  });

  it('to samo przez `toggleTool`, którym chodzi cały pasek narzędzi', () => {
    useMapToolStore.getState().setTokenPlacement({ name: 'Kolec', imageUrl: null });
    useMapToolStore.getState().toggleTool('wall');
    expect(useMapToolStore.getState().tokenPlacement).toBeNull();
  });

  it('wzięcie żetonu do ręki odkłada narzędzie', () => {
    useMapToolStore.getState().setTool('cover');
    useMapToolStore.getState().setTokenPlacement({ name: 'Kolec', imageUrl: null });
    expect(useMapToolStore.getState().tool).toBe('pointer');
    expect(useMapToolStore.getState().tokenPlacement?.name).toBe('Kolec');
  });

  it('odłożenie żetonu nie rusza narzędzia, bo puste ręce to nie tryb', () => {
    useMapToolStore.getState().setTool('fog');
    // `setTool` samo wytrąciło żeton; odłożenie „nic" ma zostawić mgłę w ręku.
    useMapToolStore.getState().setTokenPlacement(null);
    expect(useMapToolStore.getState().tool).toBe('fog');
  });

  it('powtórne kliknięcie tego samego narzędzia je odkłada (bez zmiany żetonu)', () => {
    useMapToolStore.getState().toggleTool('light');
    useMapToolStore.getState().toggleTool('light');
    expect(useMapToolStore.getState().tool).toBe('pointer');
    expect(useMapToolStore.getState().tokenPlacement).toBeNull();
  });

  it('żeton postaci niesie wiązanie z kartą i właściciela', () => {
    useMapToolStore.getState().setTokenPlacement({
      name: 'Rudy Kwiatkowski',
      imageUrl: '/uploads/portraits/rudy.png',
      characterId: 'char-1',
      ownerId: 'user-7',
    });
    const pending = useMapToolStore.getState().tokenPlacement;
    expect(pending?.characterId).toBe('char-1');
    expect(pending?.ownerId).toBe('user-7');
  });
});
