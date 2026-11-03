import { describe, expect, it } from 'vitest';
import type {
  ChatMessageView,
  DamageLogEntry,
  RollAttackMeta,
  RollOpposedMeta,
  RollResult,
} from '@vtt/shared';
import {
  attackThreadSettled,
  attackThreadSummary,
  foldAttackThreads,
  isCombatThreadRoot,
} from './chat-attack-thread.js';
import type { ChatItem } from './stores/chatStore.js';

/** Przebieg ataku na czacie (03.11): atak → Unik → obrażenia → nałożenie. */

function message(id: number, patch: Partial<ChatMessageView>): ChatMessageView {
  return {
    id,
    kind: 'say',
    authorId: 'gm',
    authorName: 'MG',
    text: `wiersz ${id}`,
    createdAt: new Date(1_800_000_000_000 + id * 1000).toISOString(),
    ...patch,
  } as ChatMessageView;
}

function item(view: ChatMessageView): ChatItem {
  return { type: 'message', message: view };
}

function attack(id: number, meta: Partial<RollAttackMeta> = {}): ChatMessageView {
  const roll = {
    total: 17,
    actor: 'Kowal',
    attack: {
      system: {},
      label: 'Pistolet → Ganger',
      detail: 'PT 13',
      hit: true,
      damageNotation: '3d6',
      targetTokenId: 'ganger',
      ...meta,
    },
  } as unknown as RollResult;
  return message(id, { kind: 'roll', authorId: 'marek', authorName: 'Marek', roll });
}

function damageRoll(id: number, attackMessageId?: number, extra = {}): ChatMessageView {
  const roll = {
    total: 11,
    title: 'Pistolet — obrażenia',
    actor: 'Kowal',
    damage: {
      ...(attackMessageId !== undefined ? { attackMessageId } : {}),
      targetTokenId: 'ganger',
      ...extra,
    },
  } as unknown as RollResult;
  return message(id, { kind: 'roll', roll });
}

function applied(id: number, entry: Partial<DamageLogEntry>): ChatMessageView {
  return message(id, {
    kind: 'damage',
    damage: {
      targetName: 'Ganger',
      location: 'body',
      locationLabel: 'korpus',
      damageRolled: 11,
      armorSp: 7,
      damageThrough: 4,
      bonusDamage: 0,
      hpLost: 4,
      ...entry,
    } as DamageLogEntry,
  });
}

const say = (id: number) => message(id, { kind: 'say', text: `Mówię ${id}` });
const ids = (items: ChatItem[]) =>
  items.map((entry) => (entry.type === 'message' ? entry.message.id : entry.id));

describe('foldAttackThreads', () => {
  it('wkłada rzut obrażeń i ich nałożenie do karty ataku', () => {
    const folded = foldAttackThreads([
      item(attack(1, { damageRollId: 2 })),
      item(damageRoll(2, 1)),
      item(applied(3, { sourceMessageId: 2 })),
    ]);
    expect(ids(folded.items)).toEqual([1]);
    expect(folded.steps.get(1)?.map((step) => step.id)).toEqual([2, 3]);
  });

  it('karta zjeżdża na miejsce najnowszego kroku — za wypowiedzi z międzyczasu', () => {
    const note: ChatItem = { type: 'note', id: 'n1', text: 'notka' };
    const folded = foldAttackThreads([
      item(attack(1, { damageRollId: 3 })),
      item(say(2)),
      item(damageRoll(3, 1)),
      note,
      item(say(4)),
      item(applied(5, { sourceMessageId: 3 })),
      item(say(6)),
    ]);
    expect(ids(folded.items)).toEqual([2, 'n1', 4, 1, 6]);
  });

  it('skutki gazu dołączają po id ataku, a rzut bez ataku zbiera swoje nałożenie', () => {
    const folded = foldAttackThreads([
      item(attack(1, { damageNotation: undefined })),
      item(applied(2, { attackMessageId: 1, ammo: { name: 'Gaz' } })),
      item(damageRoll(3)),
      item(applied(4, { sourceMessageId: 3 })),
    ]);
    expect(ids(folded.items)).toEqual([1, 3]);
    expect(folded.steps.get(1)?.map((step) => step.id)).toEqual([2]);
    expect(folded.steps.get(3)?.map((step) => step.id)).toEqual([4]);
  });

  it('bez karty-matki u widza kroki stoją osobno — atak MG w ukryciu, starsza historia', () => {
    const folded = foldAttackThreads([
      item(damageRoll(2, 1)),
      item(applied(3, { sourceMessageId: 2 })),
      item(applied(5, { sourceMessageId: 4 })),
      item(applied(6, {})),
    ]);
    // Rzut 2 nie ma ataku w feedzie, więc sam jest korzeniem dla 3.
    expect(ids(folded.items)).toEqual([2, 5, 6]);
    expect(folded.steps.get(2)?.map((step) => step.id)).toEqual([3]);
  });

  it('pusty przebieg to ten sam feed', () => {
    const items = [item(say(1)), item(attack(2))];
    const folded = foldAttackThreads(items);
    expect(ids(folded.items)).toEqual([1, 2]);
    expect(folded.steps.size).toBe(0);
  });
});

describe('attackThreadSettled', () => {
  it('czeka na Unik, na rzut obrażeń i na ich nałożenie', () => {
    expect(attackThreadSettled(attack(1, { evasionPending: ['ganger'] }))).toBe(false);
    expect(attackThreadSettled(attack(1))).toBe(false);
    const rolled = attack(1, { damageRollId: 2 });
    expect(attackThreadSettled(rolled, [damageRoll(2, 1)])).toBe(false);
    expect(
      attackThreadSettled(rolled, [damageRoll(2, 1), applied(3, { sourceMessageId: 2 })]),
    ).toBe(true);
  });

  it('„Cofnij” otwiera przebieg z powrotem', () => {
    const rolled = attack(1, { damageRollId: 2 });
    expect(
      attackThreadSettled(rolled, [
        damageRoll(2, 1),
        applied(3, { sourceMessageId: 2, undone: true }),
      ]),
    ).toBe(false);
  });

  it('pudło, udany Unik i ogień zaporowy są rozliczone od razu; „Popraw strzał” nie', () => {
    expect(attackThreadSettled(attack(1, { hit: false, damageNotation: undefined }))).toBe(true);
    expect(
      attackThreadSettled(attack(1, { hit: false, evaded: true, damageNotation: undefined })),
    ).toBe(true);
    expect(attackThreadSettled(attack(1, { hit: undefined, damageNotation: undefined }))).toBe(
      true,
    );
    expect(
      attackThreadSettled(
        attack(1, {
          hit: false,
          damageNotation: undefined,
          smart: { missedBy: 2, bonus: 4 },
        }),
      ),
    ).toBe(false);
  });

  it('wybuch, który wszystkich ominął, nie czeka na nałożenie', () => {
    const rolled = attack(1, { damageRollId: 2 });
    const roll = damageRoll(2, 1, {
      areaTargets: [{ tokenId: 'a', name: 'A', metres: 1, spared: 'evaded' }],
    });
    expect(attackThreadSettled(rolled, [roll])).toBe(true);
  });

  it('starcie czeka na odpowiedź obrońcy i na wybór przegranego', () => {
    const opposed = (meta: Partial<RollOpposedMeta>) =>
      message(1, {
        kind: 'roll',
        roll: {
          total: 12,
          opposed: { system: {}, label: 'Vex → Kurier', detail: '', won: true, ...meta },
        } as unknown as RollResult,
      });
    expect(attackThreadSettled(opposed({ defenderTokenId: 't', answerLabel: 'Broń się' }))).toBe(
      false,
    );
    expect(
      attackThreadSettled(
        opposed({ defenderTokenId: 't', answerLabel: 'Broń się', answered: true }),
      ),
    ).toBe(true);
    const concede = { loserTokenId: 'a', winnerTokenId: 'b', winnerName: 'B' };
    expect(attackThreadSettled(opposed({ concede }))).toBe(false);
    expect(attackThreadSettled(opposed({ concede: { ...concede, chosen: 'stand' } }))).toBe(true);
    expect(isCombatThreadRoot(opposed({}))).toBe(true);
  });
});

describe('attackThreadSummary', () => {
  it('werdykt i skutek: przebicie, PW i rany, bez cofniętych wpisów', () => {
    const summary = attackThreadSummary(attack(1, { damageRollId: 2, evaded: true }), [
      damageRoll(2, 1),
      applied(3, { sourceMessageId: 2, undone: true }),
      applied(4, {
        sourceMessageId: 2,
        hp: { before: 30, after: 26, max: 40 },
        woundLabel: 'Ciężko ranny',
        injury: { name: 'Złamane żebra' } as DamageLogEntry['injury'],
      }),
    ]);
    expect(summary.actor).toBe('Kowal');
    expect(summary.title).toBe('Pistolet → Ganger');
    expect(summary.verdict).toEqual({ text: 'Trafienie mimo uniku', tone: 'success' });
    expect(summary.effects).toEqual([
      {
        name: 'Ganger',
        text: 'przebicie 4 · PW 30 → 26',
        badges: ['Ciężko ranny', 'Rana krytyczna: Złamane żebra'],
      },
    ]);
  });

  it('gracz bez prawa do PW celu czyta samą utratę; pancerz, który zatrzymał, mówi to', () => {
    const summary = attackThreadSummary(attack(1, { damageRollId: 2 }), [
      applied(3, { sourceMessageId: 2 }),
      applied(4, { sourceMessageId: 2, targetName: 'Zbir', damageThrough: 0, hpLost: 0 }),
    ]);
    expect(summary.effects.map((effect) => `${effect.name}: ${effect.text}`)).toEqual([
      'Ganger: przebicie 4 · −4 PW',
      'Zbir: pancerz zatrzymał cios',
    ]);
  });

  it('wybuch wylicza tych, którzy odskoczyli; ogień zaporowy — przygwożdżonych', () => {
    const blast = attackThreadSummary(
      attack(1, {
        label: 'Granat → pole',
        area: {
          shape: 'blast',
          targets: [{ tokenId: 'k', name: 'Kowal', metres: 2, spared: 'evaded' }],
        } as unknown as RollAttackMeta['area'],
      }),
    );
    expect(blast.notes).toEqual(['Kowal odskoczył']);
    const suppressive = attackThreadSummary(
      attack(1, {
        hit: undefined,
        forcedChecks: [
          { name: 'Ganger', detail: '', success: false },
          { name: 'Zbir', detail: '', success: true },
        ],
      }),
    );
    expect(suppressive.verdict.text).toBe('Ogień zaporowy');
    expect(suppressive.notes).toEqual(['do osłony: Ganger']);
  });
});
