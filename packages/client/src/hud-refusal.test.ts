import { describe, expect, it } from 'vitest';
import {
  CPRED_ACTION_COMBAT_AWARENESS,
  CPRED_ACTION_SNEAK,
  NET_DEVICE_MESSAGES,
  type CombatView,
  type CpredHotbarSlot,
} from '@vtt/shared';
import { hudSlotsUnderRefusal, hudTurnRefusal } from './hud.js';
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

  it('runda stojąca na Wyścigu (72c) mówi o Wyścigu, a tura ukrytego NPC-a — o cudzej turze', () => {
    expect(hudTurnRefusal(combat(2, null), 'kruk', false, 2)).toMatch(/czeka na Wyścig/);
    expect(hudTurnRefusal(combat(2, null), 'kruk', false, null)).toMatch(/nie jest tura/);
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

/** #87 (71c0): „Przed walką” kafel Zmysłu Walki otwiera przydział (s. 146). */
describe('hudSlotsUnderRefusal', () => {
  const action = (actionId: string) =>
    ({
      kind: 'action',
      id: actionId,
      actionId,
      label: actionId,
      disabled: null,
    }) as unknown as CpredHotbarSlot;
  const slots = [
    action(CPRED_ACTION_COMBAT_AWARENESS),
    action('dodge'),
    action(CPRED_ACTION_SNEAK),
  ];
  const refusal = 'Walka jeszcze się nie zaczęła';

  it('w rundzie 0 Zmysł Walki zostaje czynny, reszta dostaje odmowę', () => {
    const shown = hudSlotsUnderRefusal(slots, refusal, { roundZero: true, sneaking: false });
    expect(shown.map((slot) => slot.disabled)).toEqual([null, refusal, refusal]);
  });

  it('w cudzej turze rundy 1 Zmysł Walki też czeka — zmiana kosztuje Akcję', () => {
    const shown = hudSlotsUnderRefusal(slots, 'nie twoja tura', {
      roundZero: false,
      sneaking: true,
    });
    expect(shown.map((slot) => slot.disabled)).toEqual(['nie twoja tura', 'nie twoja tura', null]);
  });

  it('bez odmowy niczego nie rusza', () => {
    expect(hudSlotsUnderRefusal(slots, null, { roundZero: true, sneaking: false })).toEqual(slots);
  });
});
