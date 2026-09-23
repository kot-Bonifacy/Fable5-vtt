import { describe, expect, it } from 'vitest';
import {
  isTradeReady,
  mayCancelTrade,
  setTradeAccept,
  setTradeOffer,
  tradeSideOf,
  tradeViewFor,
  withTradeNotice,
  type TradeSideState,
  type TradeState,
} from './trade.js';

/**
 * Etap 38c: stan handlu. Najważniejsze jest rozstrzygnięcie MG z 23.09 —
 * każda zmiana pola wymiany kasuje obie zgody, a zgoda na wersję, której już
 * nie ma, przepada.
 */

function side(patch: Partial<TradeSideState> = {}): TradeSideState {
  return {
    characterId: 'c-vex',
    name: 'Vex',
    ownerId: 'u-vex',
    items: [],
    views: [],
    eddies: 0,
    accepted: false,
    ...patch,
  };
}

function trade(patch: Partial<TradeState> = {}): TradeState {
  return {
    id: 't1',
    campaignId: 'k1',
    status: 'open',
    version: 3,
    sides: [side({ eddies: 100 }), side({ characterId: 'c-fixer', name: 'Paser', ownerId: null })],
    ...patch,
  };
}

describe('stan handlu', () => {
  it('stronę gracza prowadzi gracz, stronę NPC-a — MG', () => {
    expect(tradeSideOf(trade(), 'u-vex', false)).toBe(0);
    expect(tradeSideOf(trade(), 'u-gm', true)).toBe(1);
    expect(tradeSideOf(trade(), 'u-rico', false)).toBeNull();
  });

  it('MG nie prowadzi strony gracza — w handlu dwóch graczy tylko patrzy', () => {
    const players = trade({
      sides: [side(), side({ characterId: 'c-rico', name: 'Rico', ownerId: 'u-rico' })],
    });
    expect(tradeSideOf(players, 'u-gm', true)).toBeNull();
    expect(mayCancelTrade(players, 'u-gm', true)).toBe(true);
    expect(mayCancelTrade(players, 'u-kai', false)).toBe(false);
  });

  it('zmiana pola wymiany kasuje OBIE zgody i podbija wersję', () => {
    const agreed = trade({
      sides: [side({ eddies: 100, accepted: true }), side({ ownerId: null, accepted: true })],
    });
    const changed = setTradeOffer(agreed, 1, { items: [], views: [], eddies: 5 });
    expect(changed.version).toBe(4);
    expect(changed.sides.map((s) => s.accepted)).toEqual([false, false]);
    expect(changed.sides[1].eddies).toBe(5);
    expect(changed.sides[0].eddies).toBe(100);
  });

  it('zgoda na starszą wersję przepada', () => {
    expect(setTradeAccept(trade(), 0, true, 2)).toEqual({ ok: false, error: 'TRADE_CHANGED' });
    const ok = setTradeAccept(trade(), 0, true, 3);
    expect(ok.ok && ok.trade.sides[0].accepted).toBe(true);
  });

  it('cofnięcie zgody przechodzi niezależnie od wersji', () => {
    const agreed = trade({ sides: [side({ eddies: 1, accepted: true }), side({ ownerId: null })] });
    const back = setTradeAccept(agreed, 0, false, 0);
    expect(back.ok && back.trade.sides[0].accepted).toBe(false);
  });

  it('pustego handlu nie da się zatwierdzić', () => {
    const empty = trade({ sides: [side(), side({ ownerId: null })] });
    expect(setTradeAccept(empty, 0, true, 3)).toEqual({ ok: false, error: 'TRADE_EMPTY' });
  });

  it('nie zatwierdza się handlu, który czeka jeszcze na zaproszonego', () => {
    expect(setTradeAccept(trade({ status: 'invited' }), 0, true, 3)).toEqual({
      ok: false,
      error: 'TRADE_NOT_OPEN',
    });
  });

  it('gotowy dopiero przy dwóch zgodach', () => {
    const one = setTradeAccept(trade(), 0, true, 3);
    if (!one.ok) throw new Error(one.error);
    expect(isTradeReady(one.trade)).toBe(false);
    const both = setTradeAccept(one.trade, 1, true, 3);
    if (!both.ok) throw new Error(both.error);
    expect(isTradeReady(both.trade)).toBe(true);
  });

  it('odmowa wykonania zdejmuje zgody i zostawia powód obu stronom', () => {
    const refused = withTradeNotice(
      trade({ sides: [side({ eddies: 1, accepted: true }), side({ accepted: true })] }),
      'OUT_OF_REACH',
    );
    expect(refused.notice).toBe('OUT_OF_REACH');
    expect(refused.sides.every((s) => !s.accepted)).toBe(true);
    // Następna zmiana pola zdejmuje komunikat — dotyczył stanu, którego już nie ma.
    expect(setTradeOffer(refused, 0, { items: [], views: [], eddies: 2 }).notice).toBeUndefined();
  });

  it('gracz nie dostaje id cudzej karty, MG dostaje oba', () => {
    const forVex = tradeViewFor(trade(), 'u-vex', false);
    expect(forVex.sides[0]).toMatchObject({ characterId: 'c-vex', mine: true });
    expect(forVex.sides[1].characterId).toBeUndefined();
    expect(forVex.sides[1].mine).toBe(false);

    const forGm = tradeViewFor(trade(), 'u-gm', true);
    expect(forGm.sides.map((s) => s.characterId)).toEqual(['c-vex', 'c-fixer']);
    expect(forGm.sides.map((s) => s.mine)).toEqual([false, true]);
  });
});
