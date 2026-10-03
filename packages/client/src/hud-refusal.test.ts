import { describe, expect, it } from 'vitest';
import type { CombatView } from '@vtt/shared';
import { hudTurnRefusal } from './hud.js';

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
