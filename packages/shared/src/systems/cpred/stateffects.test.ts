import { describe, expect, it } from 'vitest';
import {
  buildCpredRegistry,
  createDefaultCharacterData,
  type CpredCharacterData,
  type CpredRegistry,
  type CpredWeaponRow,
} from './character.js';
import {
  CPRED_HOUR_S,
  CPRED_STAT_EFFECTS_MAX,
  cpredEffectiveStats,
  cpredExpireStatEffects,
  cpredStatEffectDeadlines,
  cpredStatEffectDelta,
  cpredStatEffectExpired,
  cpredStatEffectRows,
  cpredStatEffectSum,
  describeCpredStatEffect,
  describeCpredStatEffectTimer,
  describeCpredStatEffectValue,
  readCpredStatEffects,
  type CpredStatEffect,
} from './stateffects.js';
import { CPRED_STAT_MIN } from './stats.js';
import { deathSaveTarget, hpMax } from './derived.js';
import { evasionBase, planCpredAttack } from './attacks.js';
import type { ResolvedWeapon } from './compendium.js';
import { planCpredRoll } from './rolls.js';
import { cpredMoveBudgetFromSheet } from './movement.js';

/**
 * Efekty czasowe na Cechach (etap 39).
 *
 * Testy pilnują czterech rzeczy, i każda z nich jest błędem, który przy stole
 * wychodzi dopiero po kilku sesjach: że modyfikator wchodzi **i** do rzutu,
 * **i** do wartości pochodnej; że Cecha nie schodzi poniżej podręcznikowego
 * minimum; że efekt schodzi sam obydwoma zegarami; i że pule (maks. PW, maks.
 * Szczęścia) zostają przy Cesze bazowej, bo inaczej godzina pod Nerwosolem
 * zabierałaby punkty na stałe.
 */

const registry: CpredRegistry = buildCpredRegistry(
  {
    skills: [
      { id: 'evasion', name: 'Unik', stat: 'dex' },
      { id: 'handgun', name: 'Broń krótka', stat: 'ref' },
      { id: 'athletics', name: 'Atletyka', stat: 'dex' },
    ],
  },
  { roles: [{ id: 'solo', name: 'Solo', ability: 'Zmysł Walki' }] },
);

function effect(overrides: Partial<CpredStatEffect> = {}): CpredStatEffect {
  return {
    id: 'e1',
    stat: 'ref',
    value: -3,
    source: 'Lisz',
    durationS: CPRED_HOUR_S,
    ...overrides,
  };
}

/** Karta z Cechami po 5 (35 PW) plus podane efekty. */
function sheet(effects: CpredStatEffect[] = [], overrides: Partial<CpredCharacterData> = {}) {
  const base = createDefaultCharacterData();
  return { ...base, ...overrides, statEffects: effects };
}

describe('cpredEffectiveStats', () => {
  it('odejmuje efekt od Cechy bazowej', () => {
    expect(cpredEffectiveStats(sheet([effect()])).ref).toBe(2);
  });

  it('sumuje dwa efekty na tej samej Cesze, a zdjęcie jednego zostawia drugi', () => {
    const two = [effect(), effect({ id: 'e2', value: -1, source: 'Nerwosol' })];
    expect(cpredEffectiveStats(sheet(two)).ref).toBe(1);
    expect(cpredEffectiveStats(sheet([two[1]!])).ref).toBe(4);
  });

  it('nie schodzi poniżej minimum, choćby efekty sumowały się głębiej', () => {
    const deep = [effect({ value: -9 }), effect({ id: 'e2', value: -9, source: 'Nerwosol' })];
    expect(cpredEffectiveStats(sheet(deep)).ref).toBe(CPRED_STAT_MIN);
  });

  it('nie przekracza sufitu Cechy', () => {
    expect(cpredEffectiveStats(sheet([effect({ value: 9, source: 'Dopalacz' })])).ref).toBe(10);
  });

  it('nie rusza Cech, na których nic nie siedzi', () => {
    const stats = cpredEffectiveStats(sheet([effect()]));
    expect(stats.dex).toBe(5);
    expect(stats.body).toBe(5);
  });

  it('zwraca ten sam obiekt, gdy nie ma czego zmieniać', () => {
    const data = sheet();
    expect(cpredEffectiveStats(data)).toBe(cpredEffectiveStats(data));
  });

  it('nie podnosi Empatii zerowej Człowieczeństwem do podręcznikowej jedynki', () => {
    // Cyberpsychopata rzuca EMP na gołej kości (s. 229) — podłoga efektów nie
    // ma prawa mu tego oddać.
    const data = sheet([], { humanityCurrent: 0 });
    expect(cpredEffectiveStats(data).emp).toBe(0);
    const drugged = sheet([effect({ stat: 'emp', value: -2 })], { humanityCurrent: 0 });
    expect(cpredEffectiveStats(drugged).emp).toBe(0);
  });

  it('nakłada się na Empatię już obniżoną Człowieczeństwem', () => {
    const data = sheet([effect({ stat: 'emp', value: -1 })], { humanityCurrent: 30 });
    expect(cpredEffectiveStats(data).emp).toBe(2);
  });
});

describe('cpredStatEffectDelta i wiersze rozbicia', () => {
  it('liczy różnicę po przycięciu, nie surową sumę', () => {
    const deep = sheet([effect({ value: -9 }), effect({ id: 'e2', value: -9 })]);
    expect(cpredStatEffectSum(deep.statEffects, 'ref')).toBe(-18);
    expect(cpredStatEffectDelta(deep, 'ref')).toBe(-4);
  });

  it('rysuje po jednym wierszu na efekt, gdy podłoga nie przycina', () => {
    const two = sheet([effect(), effect({ id: 'e2', value: -1, source: 'Nerwosol' })]);
    expect(cpredStatEffectRows(two, 'ref')).toEqual([
      { label: 'Lisz', value: -3 },
      { label: 'Nerwosol', value: -1 },
    ]);
  });

  it('zwija je w jeden wiersz, gdy podłoga przycięła — suma ma się zgadzać', () => {
    const deep = sheet([
      effect({ value: -9 }),
      effect({ id: 'e2', value: -9, source: 'Nerwosol' }),
    ]);
    const rows = cpredStatEffectRows(deep, 'ref');
    expect(rows).toEqual([{ label: 'Lisz, Nerwosol', value: -4 }]);
    expect(5 + rows[0]!.value).toBe(CPRED_STAT_MIN);
  });

  it('milczy o Cesze, na której nic nie siedzi', () => {
    expect(cpredStatEffectRows(sheet([effect()]), 'body')).toEqual([]);
  });
});

describe('modyfikator wchodzi do rzutu', () => {
  it('pokazuje efekt osobnym wierszem, a suma jest o niego niższa', () => {
    const clean = planCpredRoll(sheet(), registry, { kind: 'skill', skillId: 'handgun' });
    const drugged = planCpredRoll(sheet([effect()]), registry, {
      kind: 'skill',
      skillId: 'handgun',
    });
    expect(clean.ok && drugged.ok).toBe(true);
    if (!clean.ok || !drugged.ok) return;
    expect(drugged.plan.modifierTotal).toBe(clean.plan.modifierTotal - 3);
    expect(drugged.plan.breakdown.map((row) => row.label)).toContain('Lisz');
  });

  it('wchodzi też do Testu samej Cechy', () => {
    const plan = planCpredRoll(sheet([effect()]), registry, { kind: 'stat', statId: 'ref' });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.plan.modifierTotal).toBe(2);
  });

  it('nie schodzi poniżej podłogi także w rozbiciu rzutu', () => {
    const deep = sheet([
      effect({ value: -9 }),
      effect({ id: 'e2', value: -9, source: 'Nerwosol' }),
    ]);
    const plan = planCpredRoll(deep, registry, { kind: 'stat', statId: 'ref' });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.plan.modifierTotal).toBe(CPRED_STAT_MIN);
  });
});

describe('modyfikator wchodzi do wartości pochodnych', () => {
  it('obniża Unik razem ze Zwinnością', () => {
    const drugged = sheet([effect({ stat: 'dex', value: -2 })], { skills: { evasion: 4 } });
    expect(evasionBase(drugged, registry)).toBe(7);
    expect(evasionBase(sheet([], { skills: { evasion: 4 } }), registry)).toBe(9);
  });

  it('obniża Rzut na Śmierć razem z Budową Ciała', () => {
    expect(deathSaveTarget(cpredEffectiveStats(sheet([effect({ stat: 'body', value: -2 })])))).toBe(
      3,
    );
  });

  it('skraca dystans razem z RUCH-em i mówi, co go skróciło', () => {
    const drugged = sheet([effect({ stat: 'move', value: -3, source: 'Skorpion' })]);
    const budget = cpredMoveBudgetFromSheet({
      move: drugged.stats.move,
      hpCurrent: drugged.hpCurrent,
      hpMax: hpMax(drugged.stats),
      statEffects: drugged.statEffects,
    });
    expect(budget.move).toBe(2);
    expect(budget.metresPerMove).toBe(4);
    expect(budget.modifiers).toContainEqual({ label: 'Skorpion', value: -3 });
  });

  it('nie pozwala RUCH-owi spaść poniżej jednego punktu', () => {
    const drugged = sheet([effect({ stat: 'move', value: -9, source: 'Skorpion' })]);
    const budget = cpredMoveBudgetFromSheet({
      move: drugged.stats.move,
      hpCurrent: drugged.hpCurrent,
      hpMax: hpMax(drugged.stats),
      statEffects: drugged.statEffects,
    });
    expect(budget.move).toBe(1);
    expect(budget.floored).toBe(true);
  });
});

describe('pule zostają przy Cesze bazowej (decyzja MG z 05.09.2026)', () => {
  it('nie zabiera maksymalnych PW, gdy spada Budowa Ciała', () => {
    // Gdyby maksimum spadało, `mergeCharacterData` przyciąłby bieżące PW przy
    // pierwszym zapisie karty — i wygaśnięcie efektu zostawiłoby postać trwale
    // słabszą. To jedyny powód, dla którego ta liczba nie idzie przez efekty.
    const drugged = sheet([effect({ stat: 'body', value: -4 })]);
    expect(hpMax(drugged.stats)).toBe(35);
    expect(drugged.hpCurrent).toBe(35);
  });

  it('nie zabiera punktów Szczęścia, gdy spada Szczęście', () => {
    const drugged = sheet([effect({ stat: 'luck', value: -3 })]);
    expect(drugged.luckCurrent).toBe(drugged.stats.luck);
  });
});

describe('wygasanie', () => {
  it('kończy się rundą, gdy runda dogoniła', () => {
    const timed = effect({ expiresAtRound: 9 });
    expect(cpredStatEffectExpired(timed, { round: 8, minutes: 0 })).toBe(false);
    expect(cpredStatEffectExpired(timed, { round: 9, minutes: 0 })).toBe(true);
  });

  it('kończy się zegarem świata, gdy minuta dogoniła', () => {
    const timed = effect({ expiresAtMinute: 100 });
    expect(cpredStatEffectExpired(timed, { round: null, minutes: 99 })).toBe(false);
    expect(cpredStatEffectExpired(timed, { round: null, minutes: 100 })).toBe(true);
  });

  it('kończy się na pierwszym z dwóch terminów', () => {
    const timed = effect({ expiresAtRound: 400, expiresAtMinute: 100 });
    expect(cpredStatEffectExpired(timed, { round: 12, minutes: 100 })).toBe(true);
    expect(cpredStatEffectExpired(timed, { round: 400, minutes: 5 })).toBe(true);
  });

  it('nie kończy się zegarem, którego wołający nie zna', () => {
    const timed = effect({ expiresAtMinute: 100 });
    expect(cpredStatEffectExpired(timed, { round: 999, minutes: null })).toBe(false);
  });

  it('nie kończy się nigdy bez żadnego terminu — zdejmuje MG', () => {
    expect(cpredStatEffectExpired(effect(), { round: 9999, minutes: 9_999_999 })).toBe(false);
  });

  it('rozdziela listę na to, co zostaje, i to, czego czas minął', () => {
    const rows = [effect({ expiresAtMinute: 50 }), effect({ id: 'e2', expiresAtMinute: 500 })];
    const { kept, expired } = cpredExpireStatEffects(rows, { round: null, minutes: 100 });
    expect(expired.map((row) => row.id)).toEqual(['e1']);
    expect(kept.map((row) => row.id)).toEqual(['e2']);
  });
});

describe('cpredStatEffectDeadlines', () => {
  it('stawia oba terminy naraz, gdy trwa walka', () => {
    expect(cpredStatEffectDeadlines({ round: 3, minutes: 1000 }, CPRED_HOUR_S)).toEqual({
      expiresAtRound: 363,
      expiresAtMinute: 1060,
    });
  });

  it('poza walką stawia sam zegar świata — efekt i tak kiedyś zejdzie', () => {
    expect(cpredStatEffectDeadlines({ round: null, minutes: 1000 }, CPRED_HOUR_S)).toEqual({
      expiresAtMinute: 1060,
    });
  });

  it('nie stawia terminu rundowego przed pierwszą rundą', () => {
    // Runda 0 znaczy „zebrani, nikt nie działał": efekt nałożony wtedy nie ma
    // prawa zejść w rundzie pierwszej.
    expect(
      cpredStatEffectDeadlines({ round: 0, minutes: 1000 }, 60).expiresAtRound,
    ).toBeUndefined();
  });
});

describe('etykiety', () => {
  it('pisze zmianę ze znakiem i źródło', () => {
    expect(describeCpredStatEffectValue(effect())).toBe('REF −3');
    expect(describeCpredStatEffect(effect())).toBe('REF −3 (Lisz)');
    expect(describeCpredStatEffectValue(effect({ value: 2 }))).toBe('REF +2');
  });

  it('odlicza zegarem świata, gdy oba terminy stoją', () => {
    const timed = effect({ expiresAtRound: 363, expiresAtMinute: 1060 });
    expect(describeCpredStatEffectTimer(timed, { round: 3, minutes: 1018 })).toBe('zostaje 42 min');
    expect(describeCpredStatEffectTimer(timed, { round: 3, minutes: 1000 })).toBe('zostaje 1 h');
    expect(describeCpredStatEffectTimer(timed, { round: 3, minutes: 995 })).toBe(
      'zostaje 1 h 5 min',
    );
  });

  it('mówi wprost, gdy nic nie odlicza', () => {
    expect(describeCpredStatEffectTimer(effect(), { round: null, minutes: 1000 })).toBe(
      'na 60 min — zdejmuje MG',
    );
  });
});

describe('readCpredStatEffects', () => {
  it('czyta poprawny wiersz w całości', () => {
    const rows = readCpredStatEffects([
      {
        id: 'abc',
        stat: 'dex',
        value: -4,
        source: 'Nerwosol',
        durationS: CPRED_HOUR_S,
        rolled: '1k6',
        expiresAtMinute: 1060,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stat: 'dex', value: -4, rolled: '1k6', expiresAtMinute: 1060 });
  });

  it('odrzuca po cichu wiersz bez sensu, a nie całą listę', () => {
    const rows = readCpredStatEffects([
      { id: 'a', stat: 'nose', value: -1, source: 'x', durationS: 60 },
      { id: 'b', stat: 'ref', value: 0, source: 'x', durationS: 60 },
      { id: 'c', stat: 'ref', value: -1, source: '  ', durationS: 60 },
      { id: 'd', stat: 'ref', value: -1, source: 'Lisz', durationS: 60 },
    ]);
    expect(rows.map((row) => row.id)).toEqual(['d']);
  });

  it('tnie listę do limitu karty', () => {
    const many = Array.from({ length: CPRED_STAT_EFFECTS_MAX + 5 }, (_, index) => ({
      id: `e${index}`,
      stat: 'ref',
      value: -1,
      source: 'Lisz',
      durationS: 60,
    }));
    expect(readCpredStatEffects(many)).toHaveLength(CPRED_STAT_EFFECTS_MAX);
  });

  it('z czegoś, co nie jest listą, robi pustą listę', () => {
    expect(readCpredStatEffects('nie lista')).toEqual([]);
    expect(readCpredStatEffects(undefined)).toEqual([]);
  });
});

describe('atak z karty', () => {
  const pistol: ResolvedWeapon = {
    damage: '3k6',
    magazine: 8,
    rof: 2,
    hands: 1,
    concealable: true,
    attachmentSlots: 3,
    skillId: 'handgun',
    rangeDv: [13, 15, 20, 25, 30, 30, 30, 30],
    melee: false,
  };
  const row: CpredWeaponRow = {
    id: 'w1',
    name: 'Ciężki pistolet',
    notes: '',
    damage: '3k6',
    rof: '2',
    ammoCurrent: 8,
    ammoMax: 8,
    ammoType: '',
  };

  it('liczy się obniżoną Cechą i mówi o tym w rozbiciu', () => {
    const data = sheet([effect()], { skills: { handgun: 4 }, weapons: [row] });
    const plan = planCpredAttack(
      data,
      registry,
      { weaponRowId: row.id, mode: 'single' },
      { row, resolved: pistol },
      { name: 'Ganger', tokenId: 'token-1', metres: 6, evasionDv: 12 },
      {},
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.plan.breakdown.map((entry) => entry.label)).toContain('Lisz');
    expect(plan.plan.modifierTotal).toBe(5 + 4 - 3);
  });
});
