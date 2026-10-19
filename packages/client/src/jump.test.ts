import { describe, expect, it } from 'vitest';
import { jumpErrorText, jumpOptionAt } from './jump.js';
import type { HudJump } from './stores/hudStore.js';

/** Skok (19.10.2026): klik trafia pole lądowania całą figurą, nie jej rogiem. */
describe('jumpOptionAt', () => {
  const jump: HudJump = {
    tokenId: 'vex',
    options: [
      { dx: 1, dy: 0, x: 700, y: 500 },
      { dx: 0, dy: -1, x: 500, y: 300 },
    ],
  };

  it('znajduje pole pod kursorem, z krawędzią lewą i górną włącznie', () => {
    expect(jumpOptionAt(jump, 100, { x: 750, y: 550 })).toMatchObject({ dx: 1, dy: 0 });
    expect(jumpOptionAt(jump, 100, { x: 700, y: 500 })).toMatchObject({ dx: 1, dy: 0 });
    expect(jumpOptionAt(jump, 100, { x: 800, y: 550 })).toBeNull();
    expect(jumpOptionAt(jump, 100, { x: 550, y: 350 })).toMatchObject({ dx: 0, dy: -1 });
  });

  it('figura 2 × 2 trafia całym kwadratem', () => {
    expect(jumpOptionAt(jump, 200, { x: 890, y: 690 })).toMatchObject({ dx: 1, dy: 0 });
  });
});

describe('jumpErrorText', () => {
  it('mówi po polsku i nie nazywa przeszkody', () => {
    expect(jumpErrorText('MOVE_BLOCKED_BY_TERRAIN')).toMatch(/nie doskoczysz/);
    expect(jumpErrorText('JUMP_NOT_VISIBLE')).toMatch(/Nie widzisz/);
    expect(jumpErrorText('COŚ')).toBe('Skok się nie udał: COŚ.');
  });
});
