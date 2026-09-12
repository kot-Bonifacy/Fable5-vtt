import { beforeEach, describe, expect, it } from 'vitest';
import { GAME_TIME_DEFAULT } from '@vtt/shared';
import { useGameTimeStore } from './stores/gameTimeStore.js';

/**
 * Etap 37: propozycja odpoczynku po skoku zegara.
 *
 * Doby są jedyną rzeczą w tym module, która **nie** przychodzi ze stanu
 * serwera — są własnością skoku, więc tylko tutaj można się pomylić. Dwa błędy,
 * których pilnują te testy, wyglądałyby przy stole identycznie („zniknęła mi
 * propozycja"): zerowanie licznika krótkim skokiem i branie ostatniego skoku
 * zamiast sumy.
 */
describe('zegar świata u klienta', () => {
  beforeEach(() => {
    useGameTimeStore.setState({
      minutes: GAME_TIME_DEFAULT,
      settledMonth: '2045-01',
      pendingRestDays: 0,
      open: false,
    });
  });

  it('doby z kolejnych skoków sumują się, a nie zastępują', () => {
    const store = useGameTimeStore.getState();
    store.applyJump({ minutes: GAME_TIME_DEFAULT + 1440, settledMonth: '2045-01' }, 1);
    store.applyJump({ minutes: GAME_TIME_DEFAULT + 2880, settledMonth: '2045-01' }, 1);
    expect(useGameTimeStore.getState().pendingRestDays).toBe(2);
  });

  it('krótki skok nie kasuje nierozdanej propozycji', () => {
    const store = useGameTimeStore.getState();
    store.applyJump({ minutes: GAME_TIME_DEFAULT + 1440, settledMonth: '2045-01' }, 1);
    store.applyJump({ minutes: GAME_TIME_DEFAULT + 1450, settledMonth: '2045-01' }, 0);
    expect(useGameTimeStore.getState().pendingRestDays).toBe(1);
    expect(useGameTimeStore.getState().minutes).toBe(GAME_TIME_DEFAULT + 1450);
  });

  it('„Pomiń" zdejmuje propozycję, nie ruszając zegara', () => {
    const store = useGameTimeStore.getState();
    store.applyJump({ minutes: GAME_TIME_DEFAULT + 1440, settledMonth: '2045-01' }, 1);
    useGameTimeStore.getState().clearRestDays();
    expect(useGameTimeStore.getState().pendingRestDays).toBe(0);
    expect(useGameTimeStore.getState().minutes).toBe(GAME_TIME_DEFAULT + 1440);
  });

  it('cudzy skok (rozgłoszenie) przesuwa datę, ale nie rozdaje dób', () => {
    // Ack dostał ten, kto kliknął — u pozostałych `time:set` jest samą datą.
    useGameTimeStore
      .getState()
      .applyTime({ minutes: GAME_TIME_DEFAULT + 1440, settledMonth: '2045-01' });
    expect(useGameTimeStore.getState().minutes).toBe(GAME_TIME_DEFAULT + 1440);
    expect(useGameTimeStore.getState().pendingRestDays).toBe(0);
  });

  it('kampania bez zegara w `state:sync` wraca do domyślnego startu', () => {
    useGameTimeStore.getState().applySync({} as never);
    expect(useGameTimeStore.getState().minutes).toBe(GAME_TIME_DEFAULT);
    expect(useGameTimeStore.getState().settledMonth).toBeNull();
  });
});
