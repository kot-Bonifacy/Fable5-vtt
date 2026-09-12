import { describe, expect, it } from 'vitest';
import {
  buildCpredRegistry,
  createDefaultCharacterData,
  parseCharacterData,
  validateCharacterDataPatch,
  type CpredCharacterData,
  type CpredRegistry,
  type CpredWeaponRow,
} from './character.js';
import type { ResolvedWeapon } from './compendium.js';
import { planCpredAttack } from './attacks.js';
import {
  cpredSheetWoundCheckPenalty,
  cpredSheetWoundCondition,
  cpredWoundPenaltyRows,
  planCpredRoll,
} from './rolls.js';
import { cpredSheetSeriousWoundThreshold, type CpredStatBlock } from './statblock.js';
import {
  CPRED_HOUR_S,
  CPRED_STAT_EFFECT_DURATION_MAX_S,
  cpredStatEffectExpired,
  describeCpredStatEffectTimer,
} from './stateffects.js';
import {
  CPRED_PAIN_EDITOR_CYBERWARE,
  cpredWoundSuspensionSource,
  describeCpredWoundSuspension,
  readCpredWoundSuspension,
  type CpredWoundSuspension,
} from './woundsuspension.js';

/**
 * Zawieszenie kar Poważnie Rannego (12.09.2026) — Stym i Edytor bólu — i stan
 * ran liczony z karty zamiast z Cech, poprawiony w tym samym przejściu.
 *
 * Pilnowane są trzy rzeczy, każda z nich to błąd, który przy stole wychodzi
 * dopiero po kilku sesjach: że zawieszona jest **wyłącznie** kara Poważnie
 * Rannego (−4 Śmiertelnie Rannego zostaje), że Test i atak liczą ją tą samą
 * funkcją, i że statysta z wydrukowanymi PW ma próg z wydruku w **każdym**
 * rzucie, a nie tylko w ataku.
 */

const registry: CpredRegistry = buildCpredRegistry(
  {
    skills: [
      { id: 'perception', name: 'Percepcja', stat: 'int' },
      { id: 'handgun', name: 'Broń krótka', stat: 'ref' },
    ],
  },
  { roles: [{ id: 'solo', name: 'Solo', ability: 'Zmysł Walki' }] },
);

const STYM: CpredWoundSuspension = {
  id: 'stym-1',
  source: 'Stym',
  durationS: CPRED_HOUR_S,
  expiresAtMinute: 600,
};

/** Karta z Cechami po 5 (35 PW, próg 18) plus nadpisania. */
function sheet(overrides: Partial<CpredCharacterData> = {}): CpredCharacterData {
  return { ...createDefaultCharacterData(), ...overrides };
}

const PAIN_EDITOR = { id: 'c1', name: CPRED_PAIN_EDITOR_CYBERWARE, notes: '' };

/** Statysta z Wartością bojową: SW wyzerowane, PW wydrukowane (etap 38a). */
const PRINTED: CpredStatBlock = {
  combatValue: null,
  weaponSkill: null,
  noBulletDodge: false,
  hpMax: 35,
};

describe('co zawiesza kary Poważnie Rannego', () => {
  it('karta bez Stymu i bez chromu nie ma zawieszenia', () => {
    expect(cpredWoundSuspensionSource(sheet())).toBeNull();
  });

  it('Stym na karcie zawiesza pod własną nazwą', () => {
    expect(cpredWoundSuspensionSource(sheet({ woundSuspension: STYM }))).toBe('Stym');
  });

  it('Edytor bólu działa po nazwie wiersza, bez względu na wielkość liter i spacje', () => {
    const cyberware = [{ ...PAIN_EDITOR, name: '  edytor BÓLU ' }];
    expect(cpredWoundSuspensionSource(sheet({ cyberware }))).toBe(CPRED_PAIN_EDITOR_CYBERWARE);
  });

  it('Edytor bólu wygrywa ze Stymem, bo zostaje, kiedy zastrzyk zejdzie', () => {
    const data = sheet({ cyberware: [PAIN_EDITOR], woundSuspension: STYM });
    expect(cpredWoundSuspensionSource(data)).toBe(CPRED_PAIN_EDITOR_CYBERWARE);
  });
});

describe('wiersze kary za rany', () => {
  it('Poważnie ranny pod Stymem: kara i zawieszenie osobnymi wierszami, razem zero', () => {
    const rows = cpredWoundPenaltyRows({ state: 'serious', suspendedBy: 'Stym' });
    expect(rows).toEqual([
      { label: 'Poważnie ranny', value: -2, kind: 'wound' },
      { label: 'Stym', value: 2, kind: 'situational' },
    ]);
  });

  it('Śmiertelnie Rannemu Stym nie zdejmuje −4', () => {
    expect(cpredWoundPenaltyRows({ state: 'mortal', suspendedBy: 'Stym' })).toEqual([
      { label: 'Śmiertelnie ranny', value: -4, kind: 'wound' },
    ]);
  });

  it('bez kary nie ma czego zawieszać — ani wiersza kary, ani Stymu', () => {
    expect(cpredWoundPenaltyRows({ state: 'light', suspendedBy: 'Stym' })).toEqual([]);
    expect(cpredWoundPenaltyRows({ state: 'healthy', suspendedBy: null })).toEqual([]);
  });

  it('jedna liczba z karty zgadza się z wierszami', () => {
    expect(cpredSheetWoundCheckPenalty(sheet({ hpCurrent: 17 }))).toBe(-2);
    expect(cpredSheetWoundCheckPenalty(sheet({ hpCurrent: 17, woundSuspension: STYM }))).toBe(0);
    expect(cpredSheetWoundCheckPenalty(sheet({ hpCurrent: 0, woundSuspension: STYM }))).toBe(-4);
  });
});

describe('Test z karty', () => {
  it('Poważnie ranny pod Stymem rzuca bez −2, a rozbicie mówi dlaczego', () => {
    const data = sheet({ hpCurrent: 17, skills: { perception: 4 }, woundSuspension: STYM });
    const result = planCpredRoll(data, registry, { kind: 'skill', skillId: 'perception' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Stan zostaje — zawieszona jest kara, nie rana.
    expect(result.plan.woundState).toBe('serious');
    expect(result.plan.breakdown).toContainEqual({
      label: 'Poważnie ranny',
      value: -2,
      kind: 'wound',
    });
    expect(result.plan.breakdown).toContainEqual({ label: 'Stym', value: 2, kind: 'situational' });
    expect(result.plan.modifierTotal).toBe(5 + 4);
  });

  it('Edytor bólu zawiesza tę samą karę bez zastrzyku', () => {
    const data = sheet({ hpCurrent: 10, cyberware: [PAIN_EDITOR] });
    const result = planCpredRoll(data, registry, { kind: 'stat', statId: 'cool' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.breakdown.map((row) => row.label)).toContain(CPRED_PAIN_EDITOR_CYBERWARE);
    expect(result.plan.modifierTotal).toBe(5);
  });

  it('Śmiertelnie Ranny pod Stymem nadal rzuca z −4', () => {
    const data = sheet({ hpCurrent: 0, woundSuspension: STYM });
    const result = planCpredRoll(data, registry, { kind: 'stat', statId: 'ref' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.breakdown.map((row) => row.label)).not.toContain('Stym');
    expect(result.plan.modifierTotal).toBe(5 - 4);
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

  function attack(data: CpredCharacterData) {
    return planCpredAttack(
      data,
      registry,
      { weaponRowId: row.id, mode: 'single' },
      { row, resolved: pistol },
      { name: 'Ganger', tokenId: 'token-1', metres: 6, evasionDv: 12 },
      {},
    );
  }

  it('liczy zawieszenie tą samą funkcją co Test', () => {
    const data = sheet({
      hpCurrent: 17,
      skills: { handgun: 4 },
      weapons: [row],
      woundSuspension: STYM,
    });
    const plan = attack(data);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const woundRows = plan.plan.breakdown.filter(
      (entry) => entry.label === 'Poważnie ranny' || entry.label === 'Stym',
    );
    expect(woundRows).toEqual(cpredWoundPenaltyRows(cpredSheetWoundCondition(data)));
    expect(plan.plan.modifierTotal).toBe(5 + 4);
  });
});

describe('stan ran z karty, nie z Cech (błąd z etapu 38a)', () => {
  // BC 6 i SW 0 dają z Cech 25 PW i próg 13; wydruk mówi 35 PW i próg 18.
  const statist = (hpCurrent: number) =>
    sheet({
      stats: { ...createDefaultCharacterData().stats, body: 6, will: 0 },
      statBlock: PRINTED,
      hpCurrent,
      skills: { perception: 4, handgun: 4 },
    });

  it('Test widzi Poważnie Rannego tam, gdzie widzi go wydruk', () => {
    const result = planCpredRoll(statist(15), registry, { kind: 'skill', skillId: 'perception' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Do 12.09.2026 planer Testów liczył próg z BC i SW: 15 > 13, więc „lekko
    // ranny" i bez kary — a atak tej samej figury dostawał −2.
    expect(result.plan.woundState).toBe('serious');
    expect(result.plan.breakdown).toContainEqual({
      label: 'Poważnie ranny',
      value: -2,
      kind: 'wound',
    });
  });

  it('pełne 35 PW to „bez ran", a 30 z 35 — lekko ranny, choć z Cech wychodzi komplet', () => {
    const full = planCpredRoll(statist(35), registry, { kind: 'stat', statId: 'cool' });
    const hurt = planCpredRoll(statist(30), registry, { kind: 'stat', statId: 'cool' });
    expect(full.ok && full.plan.woundState).toBe('healthy');
    expect(hurt.ok && hurt.plan.woundState).toBe('light');
  });

  it('próg na karcie i kara jedną liczbą idą z wydruku', () => {
    expect(cpredSheetSeriousWoundThreshold(statist(15))).toBe(18);
    expect(cpredSheetWoundCheckPenalty(statist(15))).toBe(-2);
    expect(cpredSheetWoundCheckPenalty(statist(19))).toBe(0);
  });
});

describe('zapis Stymu na karcie', () => {
  it('nowa karta nie ma zawieszenia', () => {
    expect(createDefaultCharacterData().woundSuspension).toBeNull();
  });

  it('czyta poprawny zapis z bazy i gubi po cichu zepsuty', () => {
    const stored = parseCharacterData(JSON.stringify({ woundSuspension: STYM }), registry);
    expect(stored.woundSuspension).toEqual(STYM);
    const broken = parseCharacterData(
      JSON.stringify({ woundSuspension: { ...STYM, durationS: 0 } }),
      registry,
    );
    expect(broken.woundSuspension).toBeNull();
  });

  it('czytnik odrzuca zapis bez id, bez źródła i dłuższy niż doba', () => {
    expect(readCpredWoundSuspension({ ...STYM, id: '' })).toBeNull();
    expect(readCpredWoundSuspension({ ...STYM, source: '   ' })).toBeNull();
    expect(
      readCpredWoundSuspension({ ...STYM, durationS: CPRED_STAT_EFFECT_DURATION_MAX_S + 1 }),
    ).toBeNull();
    expect(readCpredWoundSuspension('Stym')).toBeNull();
    // Zły termin odpada, a zapis zostaje — tak jak przy efekcie na Cesze.
    expect(readCpredWoundSuspension({ ...STYM, expiresAtRound: -3 })).toEqual(STYM);
  });

  it('walidator łaty przyjmuje zdjęcie i odrzuca śmieci', () => {
    expect(validateCharacterDataPatch({ woundSuspension: null }, registry).ok).toBe(true);
    expect(validateCharacterDataPatch({ woundSuspension: { id: 'x' } }, registry).ok).toBe(false);
  });

  it('wygasa tym samym terminem co efekt na Cesze i tak samo się opisuje', () => {
    expect(cpredStatEffectExpired(STYM, { round: null, minutes: 599 })).toBe(false);
    expect(cpredStatEffectExpired(STYM, { round: null, minutes: 600 })).toBe(true);
    expect(describeCpredStatEffectTimer(STYM, { round: null, minutes: 558 })).toBe(
      'zostaje 42 min',
    );
    expect(describeCpredWoundSuspension(STYM)).toBe('Stym (bez kar Poważnie Rannego)');
  });
});
