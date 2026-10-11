import { beforeEach, describe, expect, it } from 'vitest';
import type { StateSyncPayload, TokenView } from '@vtt/shared';
import { nextTarget, targetOf, useTargetStore } from './stores/targetStore.js';
import { useTokenStore } from './stores/tokenStore.js';

/**
 * Trwały cel (etap 50c): magazyn celów i reguła `T`. Grot obracany na cel
 * ogląda się w przeglądarce — Pixi nie ma tu płótna.
 */

function sync(targets: { tokenId: string; targetId: string }[]): StateSyncPayload {
  return { targets } as unknown as StateSyncPayload;
}

describe('trwały cel — magazyn (etap 50c)', () => {
  beforeEach(() => {
    useTargetStore.setState({ targets: {} });
    useTokenStore.setState({
      tokens: { kowal: { id: 'kowal' } as TokenView, bandzior: { id: 'bandzior' } as TokenView },
    });
  });

  it('bierze cele z migawki stanu i nadpisuje nimi stare', () => {
    useTargetStore.getState().apply({ tokenId: 'stary', targetId: 'ktoś' });
    useTargetStore.getState().applySync(sync([{ tokenId: 'bandzior', targetId: 'kowal' }]));
    expect(useTargetStore.getState().targets).toEqual({ bandzior: 'kowal' });
  });

  it('ustawia, przenosi i zdejmuje cel figury', () => {
    const store = useTargetStore.getState();
    store.apply({ tokenId: 'bandzior', targetId: 'kowal' });
    store.apply({ tokenId: 'bandzior', targetId: 'ola' });
    expect(useTargetStore.getState().targets).toEqual({ bandzior: 'ola' });
    store.apply({ tokenId: 'bandzior', targetId: null });
    expect(useTargetStore.getState().targets).toEqual({});
  });

  it('zapomina skasowaną figurę — jako strzelca i jako cel', () => {
    const store = useTargetStore.getState();
    store.apply({ tokenId: 'bandzior', targetId: 'kowal' });
    store.apply({ tokenId: 'kowal', targetId: 'bandzior' });
    store.apply({ tokenId: 'snajper', targetId: 'ola' });
    store.forget('kowal');
    expect(useTargetStore.getState().targets).toEqual({ snajper: 'ola' });
  });

  it('podaje cel tylko wtedy, gdy cel stoi na mapie widza', () => {
    const store = useTargetStore.getState();
    store.apply({ tokenId: 'bandzior', targetId: 'kowal' });
    store.apply({ tokenId: 'kowal', targetId: 'niewidoczny' });
    expect(targetOf('bandzior')).toBe('kowal');
    expect(targetOf('kowal')).toBeNull();
    expect(targetOf(null)).toBeNull();
  });
});

describe('trwały cel — klawisz T (etap 50c)', () => {
  it('wskazuje cel, przenosi go na inną figurę i zdejmuje drugim T', () => {
    expect(nextTarget('bandzior', null, 'kowal')).toBe('kowal');
    expect(nextTarget('bandzior', 'kowal', 'ola')).toBe('ola');
    expect(nextTarget('bandzior', 'kowal', 'kowal')).toBeNull();
  });

  it('T na prowadzonej figurze zdejmuje jej cel, a bez celu nic nie robi', () => {
    expect(nextTarget('bandzior', 'kowal', 'bandzior')).toBeNull();
    expect(nextTarget('bandzior', null, 'bandzior')).toBeUndefined();
  });
});
