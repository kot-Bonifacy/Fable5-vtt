import { describe, expect, it } from 'vitest';
import type { ChatMessageView, RollAttackMeta, SessionUser, TokenView } from '@vtt/shared';
import { openDamageCallFor } from './attack-damage-call.js';
import type { CharacterSheetView } from './stores/characterStore.js';
import type { ChatItem } from './stores/chatStore.js';

/**
 * Kubek strzelca woła o obrażenia (14.10, MG) — i tylko wtedy, gdy wolno już
 * rzucić: nikt nie czeka z Unikiem, obrażeń nie rzucono, a woła autor ataku.
 */

const NOW = Date.parse('2026-10-14T20:00:00Z');
const player: SessionUser = {
  id: 'user-vex',
  name: 'Ola',
  role: 'player',
} as unknown as SessionUser;
const gm: SessionUser = { id: 'user-gm', name: 'MG', role: 'GM' } as unknown as SessionUser;

const vex = {
  id: 'char-vex',
  name: 'Vex',
  ownerId: 'user-vex',
  data: { weapons: [{ id: 'pistol' }] },
} as unknown as CharacterSheetView;
const ganger = {
  id: 'char-ganger',
  name: 'Ganger',
  ownerId: null,
  data: { weapons: [{ id: 'statist-weapon' }] },
} as unknown as CharacterSheetView;
const characters = { [vex.id]: vex, [ganger.id]: ganger };
const tokens = {
  'tok-vex': { id: 'tok-vex', name: 'Vex', characterId: 'char-vex', ownerId: 'user-vex' },
  'tok-ganger': { id: 'tok-ganger', name: 'Ganger', characterId: 'char-ganger', ownerId: null },
} as unknown as Record<string, TokenView>;

function attackCard(
  id: number,
  attack: Partial<RollAttackMeta>,
  patch: Partial<ChatMessageView> = {},
): ChatItem {
  return {
    type: 'message',
    message: {
      id,
      kind: 'roll',
      authorId: 'user-vex',
      authorName: 'Ola',
      text: '',
      createdAt: new Date(NOW - 60_000).toISOString(),
      roll: {
        notation: '1d10+12',
        terms: [],
        criticalDamage: false,
        total: 20,
        attack: {
          hit: true,
          detail: '',
          damageNotation: '3d6',
          system: { weaponRowId: 'pistol', weaponName: 'Pistolet', attackerTokenId: 'tok-vex' },
          ...attack,
        } as RollAttackMeta,
      },
      ...patch,
    } as ChatMessageView,
  };
}

const call = (items: ChatItem[], user: SessionUser, skip: ReadonlySet<number> = new Set()) =>
  openDamageCallFor(items, user, characters, tokens, skip, NOW);

describe('openDamageCallFor', () => {
  it('woła strzelca o trafienie gotowe do rozliczenia', () => {
    const found = call([attackCard(7, {})], player);
    expect(found?.messageId).toBe(7);
    expect(found?.pending.request).toEqual({
      kind: 'damage',
      weaponRowId: 'pistol',
      attackMessageId: 7,
    });
    expect(found?.pending.characterId).toBe('char-vex');
    expect(found?.pending.title).toBe('Pistolet — obrażenia 3d6');
  });

  it('milczy, gdy cel jeszcze decyduje o Uniku, obrażenia rzucono albo nie trafiono', () => {
    expect(call([attackCard(7, { evasionPending: ['tok-ganger'] })], player)).toBeNull();
    expect(call([attackCard(7, { damageRollId: 9 })], player)).toBeNull();
    expect(call([attackCard(7, { hit: false, damageNotation: undefined })], player)).toBeNull();
  });

  it('nie woła MG o strzał gracza, choć MG ma jego kartę', () => {
    expect(call([attackCard(7, {})], gm)).toBeNull();
  });

  it('strzał NPC-a woła MG, nawet gdy kartę wystawił serwer, a nie gracza', () => {
    const npcShot = attackCard(
      7,
      {
        system: {
          weaponRowId: 'statist-weapon',
          weaponName: 'Pistolet',
          attackerTokenId: 'tok-ganger',
        },
      },
      { authorId: 'user-vex' },
    );
    expect(call([npcShot], gm)?.pending.attackerTokenId).toBe('tok-ganger');
    expect(call([npcShot], player)).toBeNull();
  });

  it('odłożone Esc i karty sprzed dwóch godzin nie wołają', () => {
    expect(call([attackCard(7, {})], player, new Set([7]))).toBeNull();
    const old = attackCard(7, {}, { createdAt: new Date(NOW - 3 * 3600_000).toISOString() });
    expect(call([old], player)).toBeNull();
  });

  it('bierze najnowsze czekające trafienie', () => {
    const found = call([attackCard(5, {}), attackCard(6, { damageRollId: 8 })], player);
    expect(found?.messageId).toBe(5);
  });
});
