import { describe, expect, it } from 'vitest';
import { NET_DEVICE_MESSAGES, type CombatView } from '@vtt/shared';
import { hudTurnRefusal } from './hud.js';
import { operatedRailRefusal } from './net-operated.js';

/** #63 (T8b): przed pierwszą rundą panel mówił „to nie jest tura tej postaci”. */
describe('hudTurnRefusal', () => {
  const combat = (round: number, activeCombatantId: string | null): CombatView =>
    ({
      id: 'c',
      sceneId: 's',
      round,
      activeCombatantId,
      combatants: [
        { id: 'k', tokenId: 'kruk' },
        { id: 'z', tokenId: 'zbir' },
      ],
    }) as unknown as CombatView;

  it('przed pierwszą rundą mówi, że walka się nie zaczęła', () => {
    expect(hudTurnRefusal(combat(0, null), 'kruk', false)).toMatch(/nie zaczęła/);
  });

  it('w rundzie mówi o cudzej turze, a własnej nie odmawia', () => {
    expect(hudTurnRefusal(combat(1, 'z'), 'kruk', false)).toMatch(/nie jest tura/);
    expect(hudTurnRefusal(combat(1, 'k'), 'kruk', false)).toBeNull();
  });

  it('MG nie dostaje odmowy nigdy', () => {
    expect(hudTurnRefusal(combat(0, null), 'kruk', true)).toBeNull();
  });
});

/** Zaległość 14.11 (pkt 2): „ODMOWA” na belce urządzenia zaraz po udanym strzale. */
describe('operatedRailRefusal', () => {
  it('stan aktywacji nie trafia na czerwone pole', () => {
    expect(operatedRailRefusal(NET_DEVICE_MESSAGES.NET_DEVICE_SPENT)).toBeNull();
    expect(operatedRailRefusal(NET_DEVICE_MESSAGES.NET_NODE_USED)).toBeNull();
  });

  it('odmowa tury netrunnera zostaje', () => {
    const turn = 'Urządzeniem działasz w turze swojego netrunnera — poczekaj na nią.';
    expect(operatedRailRefusal(turn)).toBe(turn);
    expect(operatedRailRefusal(null)).toBeNull();
  });
});
