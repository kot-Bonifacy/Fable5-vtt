import { describe, expect, it } from 'vitest';
import type {
  ChatMessageView,
  DamageLogEntry,
  RollAttackMeta,
  SessionUser,
  TokenView,
} from '@vtt/shared';
import {
  attackStepStates,
  awaitedDodgeStepFor,
  cupStepLabel,
  foldAttackCards,
} from './attack-steps.js';
import type { CharacterSheetView } from './stores/characterStore.js';
import type { ChatItem } from './stores/chatStore.js';

/**
 * Atak to jedna karta z krokami (etap 63c): ① trafienie → ② Unik → ③ obrażenia,
 * a rzut obrażeń i rozliczenia wchodzą w kartę ataku zamiast stać osobno.
 */

const NOW = Date.parse('2026-10-28T20:00:00Z');
const player = { id: 'user-vex', name: 'Ola', role: 'player' } as unknown as SessionUser;
const gm = { id: 'user-gm', name: 'MG', role: 'GM' } as unknown as SessionUser;
const vex = {
  id: 'char-vex',
  name: 'Vex',
  ownerId: 'user-vex',
  data: { weapons: [{ id: 'pistol' }] },
} as unknown as CharacterSheetView;
const characters = { [vex.id]: vex };
const tokens = {
  'tok-vex': { id: 'tok-vex', name: 'Vex', characterId: 'char-vex', ownerId: 'user-vex' },
  'tok-iskra': { id: 'tok-iskra', name: 'Iskra', characterId: null, ownerId: 'user-ola' },
} as unknown as Record<string, TokenView>;

const meta = (attack: Partial<RollAttackMeta>): RollAttackMeta =>
  ({
    hit: true,
    detail: '',
    label: '',
    damageNotation: '3d6',
    system: { weaponRowId: 'pistol', weaponName: 'Pistolet', attackerTokenId: 'tok-vex' },
    ...attack,
  }) as RollAttackMeta;

function message(id: number, patch: Partial<ChatMessageView>): ChatItem {
  return {
    type: 'message',
    message: {
      id,
      kind: 'roll',
      authorId: 'user-vex',
      authorName: 'Ola',
      text: '',
      createdAt: new Date(NOW - 60_000).toISOString(),
      ...patch,
    } as ChatMessageView,
  };
}

const roll = (attack?: Partial<RollAttackMeta>, extra: object = {}) =>
  ({
    notation: '1d10+12',
    terms: [],
    criticalDamage: false,
    total: 20,
    ...(attack ? { attack: meta(attack) } : {}),
    ...extra,
  }) as ChatMessageView['roll'];

describe('attackStepStates', () => {
  it('ogień zaporowy nie ma kroków', () => {
    expect(attackStepStates(meta({ hit: undefined }))).toBeNull();
  });

  it('pudło kończy kartę na kroku ①', () => {
    expect(attackStepStates(meta({ hit: false, damageNotation: undefined }))).toEqual({
      hit: 'failed',
      evasion: null,
      damage: null,
    });
  });

  it('trafienie czeka na Unik, potem woła o obrażenia, potem je ma', () => {
    expect(attackStepStates(meta({ evasionPending: ['tok-iskra'] }))).toEqual({
      hit: 'done',
      evasion: 'waiting',
      damage: 'waiting',
    });
    const dodged = { dodge: { name: 'Iskra', total: 14, hit: true }, evaded: true };
    expect(attackStepStates(meta(dodged))).toEqual({ hit: 'done', evasion: 'done', damage: 'now' });
    expect(attackStepStates(meta({ ...dodged, damageRollId: 9 }))?.damage).toBe('done');
  });

  it('udany Unik: krok ① zostaje zdany, obrażeń nie ma', () => {
    const states = attackStepStates(
      meta({
        hit: false,
        evaded: true,
        dodge: { name: 'Iskra', total: 22, hit: false },
        damageNotation: undefined,
      }),
    );
    expect(states).toEqual({ hit: 'done', evasion: 'done', damage: 'skipped' });
  });

  it('cel, który nie może unikać, pomija krok ②', () => {
    expect(attackStepStates(meta({}))).toEqual({ hit: 'done', evasion: 'skipped', damage: 'now' });
  });

  it('chybiony granat idzie dalej — ładunek i tak wybucha', () => {
    const area = {
      sceneId: 's',
      targets: [
        {
          tokenId: 'tok-iskra',
          name: 'Iskra',
          metres: 2,
          jump: { name: 'Iskra', total: 9, hit: true },
        },
      ],
    } as unknown as RollAttackMeta['area'];
    expect(attackStepStates(meta({ hit: false, area }))).toEqual({
      hit: 'failed',
      evasion: 'done',
      damage: 'now',
    });
  });
});

describe('foldAttackCards', () => {
  const attack = message(10, { roll: roll({ damageRollId: 12 }) });
  const chatter = message(11, { kind: 'say', text: 'Uwaga!' });
  const damageRoll = message(12, {
    roll: roll(undefined, {
      damage: { location: 'body', locationLabel: 'Tułów', attackMessageId: 10 },
    }),
  });
  const settled = message(13, {
    kind: 'damage',
    damage: { sourceMessageId: 12, targetName: 'Iskra' } as DamageLogEntry,
  });

  it('wciąga rzut obrażeń i rozliczenie do karty ataku, rozmowę zostawia', () => {
    const fold = foldAttackCards([attack, chatter, damageRoll, settled]);
    expect(fold.children.get(10)?.map((part) => part.id)).toEqual([12, 13]);
    expect([...fold.folded]).toEqual([12, 13]);
  });

  it('rzut, którego atak nie doszedł do kanału, stoi sam', () => {
    const fold = foldAttackCards([chatter, damageRoll, settled]);
    expect(fold.children.size).toBe(0);
    expect(fold.folded.size).toBe(0);
  });
});

describe('awaitedDodgeStepFor', () => {
  const waiting = message(20, { roll: roll({ evasionPending: ['tok-iskra'] }) });
  const step = (items: ChatItem[], user: SessionUser) =>
    awaitedDodgeStepFor(items, user, characters, tokens, NOW);

  it('strzelec widzi, na czyj Unik czeka', () => {
    const found = step([waiting], player);
    expect(found && cupStepLabel(found)).toBe('Krok 2/3 · Czeka na Unik: Iskra');
  });

  it('MG za strzał gracza nie dostaje paska, a rzucone obrażenia go zdejmują', () => {
    expect(step([waiting], gm)).toBeNull();
    const rolled = message(20, { roll: roll({ evasionPending: ['tok-iskra'], damageRollId: 3 }) });
    expect(step([rolled], player)).toBeNull();
  });
});
