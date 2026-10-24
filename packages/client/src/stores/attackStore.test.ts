import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OVERLAY_VISIBLE_MS, useAttackStore, type RangeOverlay } from './attackStore';

const rings: RangeOverlay = {
  tokenId: 't1',
  weaponName: 'Pistolet',
  rangeDv: [13, 15, 20],
  autofire: false,
};

describe('range rings from the sheet button', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAttackStore.getState().setOverlay(null);
  });
  afterEach(() => vi.useRealTimers());

  it('vanish after 10 seconds and come back for another 10 on the next click', () => {
    const store = useAttackStore.getState();
    store.toggleOverlay(rings);
    vi.advanceTimersByTime(OVERLAY_VISIBLE_MS - 1);
    expect(useAttackStore.getState().overlay).toBe(rings);
    vi.advanceTimersByTime(1);
    expect(useAttackStore.getState().overlay).toBeNull();

    store.toggleOverlay(rings);
    expect(useAttackStore.getState().overlay).toBe(rings);
    vi.advanceTimersByTime(OVERLAY_VISIBLE_MS);
    expect(useAttackStore.getState().overlay).toBeNull();
  });

  it('a second click while shown hides them early and the stale timer stays quiet', () => {
    const store = useAttackStore.getState();
    store.toggleOverlay(rings);
    store.toggleOverlay(rings);
    expect(useAttackStore.getState().overlay).toBeNull();

    vi.advanceTimersByTime(OVERLAY_VISIBLE_MS / 2);
    const other = { ...rings, weaponName: 'Karabin' };
    store.toggleOverlay(other);
    vi.advanceTimersByTime(OVERLAY_VISIBLE_MS - 1);
    expect(useAttackStore.getState().overlay).toBe(other);
  });
});
