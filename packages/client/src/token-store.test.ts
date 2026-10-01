import { beforeEach, describe, expect, it } from 'vitest';
import type { TokenView } from '@vtt/shared';
import { noteMoveFrame, useTokenStore, WALK_FRAME_HOLD_MS } from './stores/tokenStore.js';

/**
 * #47 (T7a, 01.10): zapis karty w trakcie marszu cofał figurę na start.
 *
 * Każda zmiana karty (choćby autozapis notatek) rozsyła `token:upsert` z pozycją
 * z bazy, a ta w czasie marszu jest jeszcze polem startowym — klatki pośrednie
 * nie trafiają do bazy. Upsert znanej figury nie rusza więc jej pozycji, chyba
 * że serwer powie `moved` (ciągnięty Pochwycony). Na scenie Dynamicznej gracze
 * dostają zamiast upsertu całą listę (`token:sync`) — ta nie rusza figury w marszu.
 */
const viewer = { myUserId: null, isGm: true };
const kowal = (x: number, y: number, extra: Partial<TokenView> = {}) =>
  ({ id: 'kowal', sceneId: 'knajpa', name: 'Kowal', x, y, ...extra }) as TokenView;

describe('magazyn figur — upsert a pozycja (#47)', () => {
  beforeEach(() => {
    useTokenStore.setState({ tokens: {} });
  });

  it('upsert znanej figury bierze nowe pola, ale zostawia pozycję z marszu', () => {
    const store = useTokenStore.getState();
    store.upsert(kowal(540, 630), viewer);
    store.applyMove('kowal', 486, 630);

    store.upsert(kowal(540, 630, { name: 'Kowal (ranny)' }), viewer);

    const token = useTokenStore.getState().tokens.kowal!;
    expect(token.name).toBe('Kowal (ranny)');
    expect([token.x, token.y]).toEqual([486, 630]);
  });

  it('upsert z `moved` przesuwa figurę (Pochwycony ciągnięty za napastnikiem)', () => {
    const store = useTokenStore.getState();
    store.upsert(kowal(540, 630), viewer);

    store.upsert(kowal(495, 630), viewer, true);

    const token = useTokenStore.getState().tokens.kowal!;
    expect([token.x, token.y]).toEqual([495, 630]);
  });

  it('nowa figura bierze pozycję z upsertu', () => {
    useTokenStore.getState().upsert(kowal(540, 630), viewer);

    const token = useTokenStore.getState().tokens.kowal!;
    expect([token.x, token.y]).toEqual([540, 630]);
  });
});

describe('magazyn figur — lista `token:sync` a figura w marszu (#47)', () => {
  beforeEach(() => {
    useTokenStore.setState({ tokens: {} });
    noteMoveFrame('kowal', true);
  });

  it('lista z bazy nie cofa figury w marszu, ale zdejmuje i dodaje figury', () => {
    const store = useTokenStore.getState();
    store.applyTokens([kowal(450, 630)], viewer);
    noteMoveFrame('kowal', false);
    store.applyMove('kowal', 471, 630);

    const zbir = { ...kowal(140, 160), id: 'zbir', name: 'Zbir' } as TokenView;
    store.applyTokens([kowal(450, 630, { name: 'Kowal (ranny)' }), zbir], viewer);

    const { tokens } = useTokenStore.getState();
    expect([tokens.kowal!.x, tokens.kowal!.name]).toEqual([471, 'Kowal (ranny)']);
    expect([tokens.zbir!.x, tokens.zbir!.y]).toEqual([140, 160]);
  });

  it('po końcowej klatce lista znowu ustawia pozycję', () => {
    const store = useTokenStore.getState();
    store.applyTokens([kowal(450, 630)], viewer);
    noteMoveFrame('kowal', false);
    noteMoveFrame('kowal', true);

    store.applyTokens([kowal(540, 630)], viewer);

    expect(useTokenStore.getState().tokens.kowal!.x).toBe(540);
  });

  it('klatka sprzed limitu nie trzyma pozycji na zawsze (ręka stanęła, gracz wypadł z sieci)', () => {
    const store = useTokenStore.getState();
    store.applyTokens([kowal(450, 630)], viewer);
    noteMoveFrame('kowal', false, Date.now() - WALK_FRAME_HOLD_MS - 1);

    store.applyTokens([kowal(540, 630)], viewer);

    expect(useTokenStore.getState().tokens.kowal!.x).toBe(540);
  });
});
