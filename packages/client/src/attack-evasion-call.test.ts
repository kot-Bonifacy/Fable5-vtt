import { describe, expect, it } from 'vitest';
import type { ChatMessageView, RollAttackMeta, SessionUser, TokenView } from '@vtt/shared';
import { openEvasionCallsFor } from './attack-evasion-call.js';
import type { CharacterSheetView } from './stores/characterStore.js';
import type { ChatItem } from './stores/chatStore.js';

/**
 * Unik woła obrońcę (17.10, MG): kubek i wezwanie nad nim dostaje ten, kto
 * prowadzi trafioną figurę — gracz swoją, MG figury bez właściciela — i tylko
 * dopóki serwer na niego czeka.
 */

const NOW = Date.parse('2026-10-17T20:00:00Z');
const player: SessionUser = {
  id: 'user-vex',
  name: 'Ola',
  role: 'player',
} as unknown as SessionUser;
const other: SessionUser = {
  id: 'user-kuba',
  name: 'Kuba',
  role: 'player',
} as unknown as SessionUser;
const gm: SessionUser = { id: 'user-gm', name: 'MG', role: 'GM' } as unknown as SessionUser;

const vex = { id: 'char-vex', name: 'Vex', ownerId: 'user-vex' } as unknown as CharacterSheetView;
const ganger = {
  id: 'char-ganger',
  name: 'Ganger',
  ownerId: null,
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
      authorId: 'user-gm',
      authorName: 'MG',
      text: '',
      createdAt: new Date(NOW - 60_000).toISOString(),
      roll: {
        notation: '1d10+12',
        terms: [],
        criticalDamage: false,
        total: 17,
        actor: 'Ganger',
        attack: {
          hit: true,
          detail: '',
          damageNotation: '3d6',
          targetTokenId: 'tok-vex',
          evasionPending: ['tok-vex'],
          system: { attackerTokenId: 'tok-ganger' },
          ...attack,
        } as RollAttackMeta,
      },
      ...patch,
    } as ChatMessageView,
  };
}

const calls = (items: ChatItem[], user: SessionUser) =>
  openEvasionCallsFor(items, user, characters, tokens, NOW);

describe('openEvasionCallsFor', () => {
  it('woła gracza o Unik jego trafionej postaci — kartą, przeciw wynikowi strzelca', () => {
    const [found, ...rest] = calls([attackCard(7, {})], player);
    expect(rest).toEqual([]);
    expect(found).toMatchObject({
      messageId: 7,
      tokenId: 'tok-vex',
      defenderName: 'Vex',
      attackerName: 'Ganger',
      attackTotal: 17,
      area: null,
    });
    expect(found?.pending).toEqual({
      messageId: 7,
      characterId: 'char-vex',
      characterName: 'Vex',
      title: 'Unik: Vex',
      modifierTotal: 0,
    });
  });

  it('za gracza nie woła ani MG, ani innego gracza', () => {
    expect(calls([attackCard(7, {})], gm)).toEqual([]);
    expect(calls([attackCard(7, {})], other)).toEqual([]);
  });

  it('MG dostaje Unik figury bez właściciela', () => {
    const card = attackCard(8, { targetTokenId: 'tok-ganger', evasionPending: ['tok-ganger'] });
    expect(calls([card], gm).map((call) => call.tokenId)).toEqual(['tok-ganger']);
    expect(calls([card], player)).toEqual([]);
  });

  it('milczy, gdy serwer już nie czeka: Unik rzucony, obrażenia rzucone, karta stara', () => {
    expect(calls([attackCard(7, { evasionPending: undefined })], player)).toEqual([]);
    expect(calls([attackCard(7, { damageRollId: 9 })], player)).toEqual([]);
    const old = attackCard(7, {}, { createdAt: new Date(NOW - 3 * 3600_000).toISOString() });
    expect(calls([old], player)).toEqual([]);
  });

  it('przy wybuchu woła o Odskok wiersza tej postaci, z adresem figury', () => {
    const card = attackCard(9, {
      targetTokenId: undefined,
      evasionPending: ['tok-vex', 'tok-ganger'],
      area: {
        shape: 'blast',
        targets: [
          { tokenId: 'tok-vex', name: 'Vex', metres: 1, canEvade: true },
          { tokenId: 'tok-ganger', name: 'Ganger', metres: 2, canEvade: true },
        ],
      } as unknown as RollAttackMeta['area'],
    });
    const [found, ...rest] = calls([card], player);
    expect(rest).toEqual([]);
    expect(found?.area).toBe('blast');
    expect(found?.pending).toMatchObject({ tokenId: 'tok-vex', title: 'Odskok: Vex' });
    expect(calls([card], gm).map((call) => call.tokenId)).toEqual(['tok-ganger']);
  });

  it('kilka czekających trafień — od najnowszego', () => {
    const found = calls([attackCard(7, {}), attackCard(8, {})], player);
    expect(found.map((call) => call.messageId)).toEqual([8, 7]);
  });
});
