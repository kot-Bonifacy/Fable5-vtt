import { describe, expect, it } from 'vitest';
import type { CombatView, CombatantView, TokenView } from '@vtt/shared';
import {
  gmSteerLocked,
  gmTurnSteer,
  isTurnChangeInFight,
  playerTurnSteer,
} from './combat-steer.js';

/**
 * Kogo MG prowadzi w walce (etap 50b). Reguła mieszka w czystych funkcjach;
 * gesty na płótnie (klik podgląda, przeciąganie zostaje) ogląda się
 * w przeglądarce, a ich kształt w kodzie pilnuje `map-click.test.ts`.
 */

function combatant(id: string, tokenId: string | null, ownerId: string | null): CombatantView {
  return { id, tokenId, ownerId, name: id, initiative: 10 } as unknown as CombatantView;
}

function fight(round: number, active: string | null, id = 'c1'): CombatView {
  return {
    id,
    sceneId: 's1',
    round,
    activeCombatantId: active,
    combatants: [
      combatant('npc', 't-npc', null),
      combatant('pc', 't-pc', 'u-player'),
      combatant('ghost', null, null),
      combatant('box', 't-box', null),
    ],
  } as unknown as CombatView;
}

const TOKENS = {
  't-npc': { id: 't-npc', ownerId: null },
  't-pc': { id: 't-pc', ownerId: 'u-player' },
  't-box': { id: 't-box', ownerId: null, container: { kind: 'crate' } },
} as unknown as Record<string, TokenView>;

describe('blokada zaznaczania MG', () => {
  it('działa od rundy 1 i tylko u MG', () => {
    expect(gmSteerLocked(true, fight(1, 'npc'))).toBe(true);
    expect(gmSteerLocked(true, fight(0, null))).toBe(false);
    expect(gmSteerLocked(true, null)).toBe(false);
    expect(gmSteerLocked(false, fight(2, 'npc'))).toBe(false);
  });
});

describe('przejście tury w tej samej walce', () => {
  it('zmiana uczestnika albo rundy — tak', () => {
    expect(isTurnChangeInFight(fight(1, 'npc'), fight(1, 'pc'))).toBe(true);
    expect(isTurnChangeInFight(fight(0, null), fight(1, 'npc'))).toBe(true);
    expect(isTurnChangeInFight(fight(1, 'npc'), fight(2, 'npc'))).toBe(true);
  });

  it('wejście na scenę, nowa walka i ta sama tura — nie', () => {
    expect(isTurnChangeInFight(null, fight(3, 'npc'))).toBe(false);
    expect(isTurnChangeInFight(fight(1, 'npc', 'a'), fight(1, 'pc', 'b'))).toBe(false);
    expect(isTurnChangeInFight(fight(1, 'npc'), fight(1, 'npc'))).toBe(false);
    expect(isTurnChangeInFight(fight(1, 'npc'), null)).toBe(false);
  });
});

describe('co MG dostaje na początku tury', () => {
  it('tura NPC-a — prowadzi jego figurę', () => {
    expect(gmTurnSteer(fight(1, 'npc'), TOKENS)).toEqual({ kind: 'steer', tokenId: 't-npc' });
  });

  it('tura gracza — nic nie prowadzi, pasek pokazuje figurę gracza', () => {
    expect(gmTurnSteer(fight(1, 'pc'), TOKENS)).toEqual({ kind: 'watch', tokenId: 't-pc' });
  });

  it('uczestnik bez figury albo figura spoza sceny — nikt', () => {
    expect(gmTurnSteer(fight(1, 'ghost'), TOKENS)).toEqual({ kind: 'watch', tokenId: null });
    expect(gmTurnSteer(fight(1, 'npc'), {})).toEqual({ kind: 'watch', tokenId: null });
  });

  it('pojemnik nie jest kimś, kogo się prowadzi', () => {
    expect(gmTurnSteer(fight(1, 'box'), TOKENS)).toEqual({ kind: 'watch', tokenId: 't-box' });
  });

  it('przed walką nic się nie zmienia', () => {
    expect(gmTurnSteer(fight(0, null), TOKENS)).toBeNull();
    expect(gmTurnSteer(null, TOKENS)).toBeNull();
  });
});

describe('co gracz dostaje na początku tury', () => {
  it('w turze swojej postaci — jej figurę', () => {
    expect(playerTurnSteer(fight(1, 'pc'), TOKENS, 'u-player')).toBe('t-pc');
  });

  it('tura cudza, przed walką, bez figury albo bez konta — nic', () => {
    expect(playerTurnSteer(fight(1, 'npc'), TOKENS, 'u-player')).toBeNull();
    expect(playerTurnSteer(fight(1, 'pc'), TOKENS, 'u-other')).toBeNull();
    expect(playerTurnSteer(fight(0, 'pc'), TOKENS, 'u-player')).toBeNull();
    expect(playerTurnSteer(fight(1, 'ghost'), TOKENS, 'u-player')).toBeNull();
    expect(playerTurnSteer(fight(1, 'pc'), {}, 'u-player')).toBeNull();
    expect(playerTurnSteer(fight(1, 'pc'), TOKENS, null)).toBeNull();
    expect(playerTurnSteer(null, TOKENS, 'u-player')).toBeNull();
  });
});
