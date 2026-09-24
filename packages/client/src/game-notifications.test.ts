import { expect, it, vi } from 'vitest';
import { ROLE_GM, ROLE_PLAYER, type ChatMessageView } from '@vtt/shared';
import { chatNotification, notifyGame, startsOwnTurn } from './game-notifications.js';
import { playNaturalNotification } from './cup-notification.js';
vi.mock('./cup-notification.js', () => ({
  playNaturalNotification: vi.fn(),
  audioContext: vi.fn(),
}));
const user = { id: 'player', role: ROLE_PLAYER };
const gm = { id: 'gm', role: ROLE_GM };
const message = (patch: Partial<ChatMessageView>): ChatMessageView => ({
  id: 1,
  kind: 'say',
  authorId: 'other',
  authorName: 'Nadawca',
  text: '',
  createdAt: '2026-09-20T00:00:00Z',
  ...patch,
});
it('whispers notify only the addressed human, never the author or GM observer', () => {
  const whisper = message({ kind: 'whisper', recipientId: user.id });
  expect(chatNotification(whisper, user)).toBe('whisper');
  expect(chatNotification(whisper, gm)).toBeNull();
  expect(chatNotification({ ...whisper, authorId: user.id }, user)).toBeNull();
  expect(chatNotification({ ...whisper, recipientBotId: 'bot' }, user)).toBeNull();
});
it('inventory notifies its recipient only while waiting for receipt', () => {
  const inventory: NonNullable<ChatMessageView['inventory']> = {
    kind: 'give',
    fromCharacterId: 'a',
    fromName: 'A',
    toCharacterId: 'b',
    toName: 'B',
    toOwnerId: user.id,
    actorName: 'A',
    lines: ['Przedmiot'],
    system: {},
  };
  expect(chatNotification(message({ kind: 'inventory', inventory }), user)).toBe('inventory');
  expect(chatNotification(message({ kind: 'inventory', inventory }), gm)).toBeNull();
  expect(
    chatNotification(
      message({
        kind: 'inventory',
        inventory: { ...inventory, resolution: { kind: 'accepted', byName: 'B' } },
      }),
      user,
    ),
  ).toBeNull();
  expect(chatNotification(message({ kind: 'say' }), user)).toBeNull();
});
it('a pending Test request notifies GM only', () => {
  const request: NonNullable<ChatMessageView['request']> = {
    characterId: 'a',
    characterName: 'A',
    askedById: user.id,
    askedByName: 'Gracz',
    rollLabel: 'Test',
    system: {},
  };
  expect(chatNotification(message({ kind: 'request', request }), gm)).toBe('request');
  expect(chatNotification(message({ kind: 'request', request }), user)).toBeNull();
  expect(
    chatNotification(
      message({
        kind: 'request',
        request: { ...request, resolution: { kind: 'approved', byName: 'MG' } },
      }),
      gm,
    ),
  ).toBeNull();
});
it('turn cue ignores action updates, spectators and the pre-combat round', () => {
  const turn = {
    id: 'combat',
    round: 1,
    activeCombatantId: 'a',
    combatants: [
      { id: 'a', ownerId: user.id },
      { id: 'b', ownerId: 'other' },
    ],
  };
  expect(startsOwnTurn(null, turn, user.id)).toBe(true);
  expect(startsOwnTurn(turn, { ...turn }, user.id)).toBe(false);
  expect(startsOwnTurn(turn, { ...turn, round: 2 }, user.id)).toBe(true);
  expect(startsOwnTurn(turn, { ...turn, activeCombatantId: 'b' }, user.id)).toBe(false);
  expect(startsOwnTurn(null, { ...turn, round: 0 }, user.id)).toBe(false);
  expect(startsOwnTurn(null, turn, gm.id)).toBe(false);
  expect(startsOwnTurn(turn, null, user.id)).toBe(false);
});
it('every cue plays — there are no per-event switches since 24.09', () => {
  vi.mocked(playNaturalNotification).mockClear();
  notifyGame('turn');
  notifyGame('whisper');
  expect(playNaturalNotification).toHaveBeenCalledTimes(2);
});
