import { describe, expect, it } from 'vitest';
import {
  buildCpredRegistry,
  createDefaultCharacterData,
  mergeCharacterData,
  parseCharacterData,
  validateCharacterDataPatch,
  type CpredCharacterData,
  type CpredCyberwareRow,
  type CpredGearRow,
  type CpredRegistry,
  type CpredWeaponRow,
} from './character.js';
import type { CpredAttachmentProfile } from './attachments.js';
import type { ResolvedWeapon } from './compendium.js';
import { planCpredAttack, type CpredAttackRequest } from './attacks.js';
import {
  cpredActiveChrome,
  cpredChromeModOf,
  cpredChromeRequirementNote,
  cpredChromeSkillBonus,
  cpredChromeStats,
  cpredSkillLevel,
  normalizeChromeName,
} from './chromestats.js';
import { cpredSheetInitiative } from './initiative.js';
import { cpredPlayerItemPatchProblem } from './itemlocks.js';
import { cpredTakeRows, cpredLandRows, cpredItemLists } from './inventory.js';
import { planCpredRoll } from './rolls.js';
import { cpredSheetHpMax, cpredSheetSeriousWoundThreshold } from './statblock.js';
import {
  CPRED_HOUR_S,
  cpredEffectiveStats,
  cpredSheetDeathSaveTarget,
  type CpredStatEffect,
} from './stateffects.js';

/**
 * Chrom i sprzęt zmieniające liczby karty (etap 59a).
 *
 * Pilnowane są granice, na których przy stole wychodzi błąd: sufit 10
 * przeszczepu, kolejność przeszczep → ramownica, pule z wszczepu, ale nie
 * z egzoszkieletu, brak kumulacji premii do Umiejętności i to, że rozbicie
 * rzutu sumuje się zawsze do liczby, którą rzuca kość.
 */

const registry: CpredRegistry = buildCpredRegistry(
  {
    skills: [
      { id: 'perception', name: 'Percepcja', stat: 'int' },
      { id: 'handgun', name: 'Broń krótka', stat: 'ref' },
      { id: 'resist-torture-drugs', name: 'Odporność na tortury/narkotyki', stat: 'will' },
      { id: 'basic-tech', name: 'Podstawowe naprawy', stat: 'tech' },
      { id: 'wardrobe-style', name: 'Moda i styl', stat: 'cool' },
      { id: 'personal-grooming', name: 'Atrakcyjność', stat: 'cool' },
      { id: 'acting', name: 'Aktorstwo', stat: 'cool' },
      { id: 'first-aid', name: 'Pierwsza pomoc', stat: 'tech' },
      { id: 'paramedic', name: 'Ratownictwo medyczne', stat: 'tech' },
    ],
  },
  { roles: [{ id: 'solo', name: 'Solo', ability: 'Zmysł Walki' }] },
);

/** Karta z Cechami po 5 (35 PW) plus nadpisania. */
function sheet(overrides: Partial<CpredCharacterData> = {}): CpredCharacterData {
  return { ...createDefaultCharacterData(), ...overrides };
}

let nextId = 0;
function chrome(name: string, extra: Partial<CpredCyberwareRow> = {}): CpredCyberwareRow {
  nextId += 1;
  return { id: `c${nextId}`, name, notes: '', ...extra };
}

function gear(name: string, extra: Partial<CpredGearRow> = {}): CpredGearRow {
  nextId += 1;
  return { id: `g${nextId}`, name, notes: '', qty: 1, ...extra };
}

const LACE = 'Przeszczep splotu mięśniowo-kostnego';
const SIGMA = 'Implantowana ramownica linearna ∑ (Sigma)';
const BETA = 'Implantowana ramownica linearna ß (Beta)';
const EXO_SIGMA = 'Ramownica linearna ∑ (Sigma)';

function withBody(
  body: number,
  cyberware: CpredCyberwareRow[],
  more: Partial<CpredCharacterData> = {},
) {
  const base = sheet();
  return sheet({ stats: { ...base.stats, body }, cyberware, ...more });
}

describe('rozpoznanie wiersza', () => {
  it('nazwa z kompendium bez łącznika i nazwa z podręcznika to ta sama rzecz', () => {
    expect(normalizeChromeName('Przeszczep splotu mięśniowokostnego')).toBe(
      normalizeChromeName('przeszczep  splotu mięśniowo-kostnego'),
    );
    expect(cpredChromeModOf({ name: 'Przeszczep splotu mięśniowokostnego' }, 'cyberware')?.id).toBe(
      'muscle-bone-lace',
    );
  });

  it('wpis kompendium wygrywa z przemianowanym wierszem', () => {
    const row = {
      name: 'Mój szkielet',
      compendiumId: 'cyberware.implantowana-ramownica-linearna-beta',
    };
    expect(cpredChromeModOf(row, 'cyberware')?.id).toBe('linear-frame-beta');
  });

  it('egzoszkielet w cyborgizacjach i ramownica wszczepiana w plecaku nie działają', () => {
    expect(cpredChromeModOf({ name: EXO_SIGMA }, 'cyberware')).toBeNull();
    expect(cpredChromeModOf({ name: SIGMA }, 'gear')).toBeNull();
  });
});

describe('Budowa Ciała z wszczepów', () => {
  it('przeszczep dodaje 2, każdy osobno, do sufitu 10', () => {
    expect(
      cpredChromeStats(withBody(5, [chrome(LACE)]).stats, withBody(5, [chrome(LACE)])).body,
    ).toBe(7);
    const two = withBody(5, [chrome(LACE), chrome(LACE)]);
    expect(cpredEffectiveStats(two).body).toBe(9);
    const three = withBody(5, [chrome(LACE), chrome(LACE), chrome(LACE)]);
    expect(cpredEffectiveStats(three).body).toBe(10);
  });

  it('przeszczep nie obniża BC wyższej niż sufit', () => {
    const data = withBody(5, [chrome(LACE)]);
    expect(cpredChromeStats({ ...data.stats, body: 12 }, data).body).toBe(12);
  });

  it('ramownica stoi na przeszczepie: BC 8 + przeszczep → 10 → Sigma 12', () => {
    const data = withBody(8, [chrome(SIGMA), chrome(LACE)]);
    expect(cpredEffectiveStats(data).body).toBe(12);
  });

  it('Beta podnosi do 14, a z Sigmą wygrywa większa', () => {
    expect(cpredEffectiveStats(withBody(8, [chrome(LACE), chrome(LACE), chrome(BETA)])).body).toBe(
      14,
    );
    expect(cpredEffectiveStats(withBody(8, [chrome(SIGMA), chrome(BETA)])).body).toBe(14);
  });

  it('Cechy bez chromu wracają tym samym obiektem', () => {
    const data = sheet();
    expect(cpredChromeStats(data.stats, data)).toBe(data.stats);
    expect(cpredEffectiveStats(data)).toBe(data.stats);
  });

  it('efekt czasowy liczy się od BC z wszczepem i ma jego sufit', () => {
    const minus: CpredStatEffect = {
      id: 'e1',
      stat: 'body',
      value: -2,
      source: 'Lisz',
      durationS: CPRED_HOUR_S,
    };
    expect(cpredEffectiveStats(withBody(5, [chrome(LACE)], { statEffects: [minus] })).body).toBe(5);
    const plus = { ...minus, value: 2, source: 'Dopalacz' };
    expect(cpredEffectiveStats(withBody(8, [chrome(SIGMA)], { statEffects: [plus] })).body).toBe(
      12,
    );
  });
});

describe('pule z wszczepu', () => {
  it('przeszczep podnosi PW, próg Poważnie Rannego i Przeżywalność', () => {
    const data = withBody(5, [chrome(LACE)]);
    // 10 + 5 × ⌈(7 + 5) / 2⌉
    expect(cpredSheetHpMax(data)).toBe(40);
    expect(cpredSheetSeriousWoundThreshold(data)).toBe(20);
    expect(cpredSheetDeathSaveTarget(data)).toBe(7);
  });

  it('wydrukowane PW bloku dalej wygrywają', () => {
    const data = withBody(5, [chrome(LACE)], {
      statBlock: { combatValue: null, weaponSkill: null, noBulletDodge: false, hpMax: 25 },
    });
    expect(cpredSheetHpMax(data)).toBe(25);
  });

  it('wyjęcie wszczepu przycina PW przy najbliższym zapisie', () => {
    const data = withBody(5, [chrome(LACE)], { hpCurrent: 40 });
    expect(mergeCharacterData(data, {}).hpCurrent).toBe(40);
    expect(mergeCharacterData(data, { cyberware: [] }).hpCurrent).toBe(35);
  });
});

describe('egzoszkielet (ramownica zewnętrzna)', () => {
  it('podłączony daje BC 12 do rzutów, ale nie rusza PW ani Przeżywalności', () => {
    const data = sheet({ gear: [gear(EXO_SIGMA, { connected: true })] });
    expect(cpredEffectiveStats(data).body).toBe(12);
    expect(cpredSheetHpMax(data)).toBe(35);
    expect(cpredSheetDeathSaveTarget(data)).toBe(5);
  });

  it('odłączony w plecaku nie robi nic', () => {
    expect(cpredEffectiveStats(sheet({ gear: [gear(EXO_SIGMA)] })).body).toBe(5);
  });

  it('rozbicie Testu BC mówi „(podłączona)” i sumuje się do 12', () => {
    const data = sheet({ gear: [gear(EXO_SIGMA, { connected: true })] });
    const result = planCpredRoll(data, registry, { kind: 'stat', statId: 'body' });
    if (!result.ok) throw new Error(result.error);
    expect(result.plan.breakdown).toContainEqual({
      label: 'Ramownica linearna ∑ (podłączona)',
      value: 7,
      kind: 'situational',
    });
    expect(result.plan.modifierTotal).toBe(12);
  });

  it('flagę „podłączona” walidator zostawia tylko egzoszkieletowi', () => {
    const result = validateCharacterDataPatch(
      { gear: [gear(EXO_SIGMA, { connected: true }), gear('Latarka', { connected: true })] },
      registry,
    );
    if (!result.ok) throw new Error('patch odrzucony');
    expect(result.patch.gear?.map((row) => row.connected)).toEqual([true, undefined]);
  });

  it('oddany komuś jedzie odłączony i nie skleja się z podłączonym', () => {
    const exo = gear(EXO_SIGMA, { connected: true, compendiumId: 'gear.ramownica-linearna-sigma' });
    const giver = cpredItemLists(sheet({ gear: [exo] }));
    const taken = cpredTakeRows(giver, [{ list: 'gear', rowId: exo.id }]);
    if (!taken.ok) throw new Error(taken.error);
    expect((taken.taken[0]!.row as CpredGearRow).connected).toBeUndefined();
    const receiver = cpredItemLists(sheet({ gear: [{ ...exo, id: 'r1' }] }));
    cpredLandRows(receiver, taken.taken, () => 'r2');
    expect(receiver.gear).toHaveLength(2);
  });
});

describe('Test BC z wszczepem', () => {
  it('rozbicie: BC z karty i wiersz przeszczepu', () => {
    const data = withBody(5, [chrome(LACE), chrome(LACE)]);
    const result = planCpredRoll(data, registry, { kind: 'stat', statId: 'body' });
    if (!result.ok) throw new Error(result.error);
    expect(result.plan.breakdown.slice(0, 2)).toEqual([
      { label: 'Budowa Ciała (BC)', value: 5, kind: 'stat' },
      { label: `${LACE} ×2`, value: 4, kind: 'situational' },
    ]);
    expect(result.plan.modifierTotal).toBe(9);
  });

  it('Rzut na Śmierć ma próg z ramownicy wszczepianej', () => {
    const data = withBody(8, [chrome(SIGMA)]);
    const result = planCpredRoll(data, registry, { kind: 'deathSave' });
    if (!result.ok) throw new Error(result.error);
    expect(result.plan.deathSave?.target).toBe(12);
  });
});

describe('notki wymagań', () => {
  const sigma = cpredChromeModOf({ name: SIGMA }, 'cyberware')!;
  const exo = cpredChromeModOf({ name: EXO_SIGMA }, 'gear')!;

  it('Sigma bez przeszczepu i przy BC 5 dostaje notkę, ale BC i tak rośnie', () => {
    const data = withBody(5, [chrome(SIGMA)]);
    expect(cpredChromeRequirementNote(sigma, data)).toBe(
      'Wymaga: BC 6 i przeszczep splotu mięśniowo-kostnego',
    );
    expect(cpredEffectiveStats(data).body).toBe(12);
  });

  it('wymagania liczą BC bazową, nie podniesioną przeszczepem', () => {
    expect(
      cpredChromeRequirementNote(sigma, withBody(6, [chrome(SIGMA), chrome(LACE)])),
    ).toBeNull();
    expect(
      cpredChromeRequirementNote(sigma, withBody(5, [chrome(SIGMA), chrome(LACE)])),
    ).not.toBeNull();
  });

  it('egzoszkielet pyta o złącza interfejsu', () => {
    expect(cpredChromeRequirementNote(exo, sheet())).toBe('Wymaga: złącza interfejsu');
    expect(
      cpredChromeRequirementNote(exo, sheet({ cyberware: [chrome('Złącza interfejsu')] })),
    ).toBeNull();
  });
});

describe('premie do Umiejętności', () => {
  it('Detoksykator: osobny wiersz +2 w Teście Odporności', () => {
    const data = sheet({
      cyberware: [chrome('Detoksykator')],
      skills: { 'resist-torture-drugs': 3 },
    });
    const result = planCpredRoll(data, registry, {
      kind: 'skill',
      skillId: 'resist-torture-drugs',
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.plan.breakdown).toContainEqual({
      label: 'Detoksykator',
      value: 2,
      kind: 'situational',
    });
    expect(result.plan.modifierTotal).toBe(5 + 3 + 2);
  });

  it('Techskaner w ręce i w plecaku dają razem +2, nie +4', () => {
    const data = sheet({ cyberware: [chrome('Techskaner')], gear: [gear('Techskaner')] });
    expect(cpredChromeSkillBonus(data, 'basic-tech')).toEqual({ label: 'Techskaner', value: 2 });
  });

  it('Skaner medyczny z plecaka działa w Ustabilizowaniu', () => {
    const data = sheet({ gear: [gear('Skaner medyczny')], skills: { 'first-aid': 2 } });
    const result = planCpredRoll(data, registry, {
      kind: 'stabilize',
      stabilizeDv: 13,
      stabilizeTokenId: 't1',
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.plan.modifierTotal).toBe(5 + 2 + 2);
  });

  it('pusty stos sprzętu nie daje premii', () => {
    expect(
      cpredChromeSkillBonus(sheet({ gear: [gear('Techskaner', { qty: 0 })] }), 'basic-tech'),
    ).toBeNull();
  });

  it('tatuaże świetlne działają od trzech, a Superchrom się z nimi nie kumuluje', () => {
    const two = sheet({ cyberware: [chrome('Tatuaż świetlny'), chrome('Tatuaż świetlny')] });
    expect(cpredChromeSkillBonus(two, 'wardrobe-style')).toBeNull();
    const three = sheet({ cyberware: [...two.cyberware, chrome('Tatuaż świetlny')] });
    expect(cpredChromeSkillBonus(three, 'wardrobe-style')?.value).toBe(2);
    const both = sheet({ cyberware: [...three.cyberware, chrome('Pokrycie Superchrom')] });
    expect(cpredChromeSkillBonus(both, 'wardrobe-style')?.value).toBe(2);
  });

  it('chemskóra działa tylko razem z techfryzem', () => {
    expect(
      cpredChromeSkillBonus(sheet({ cyberware: [chrome('Chemskóra')] }), 'personal-grooming'),
    ).toBeNull();
    const pair = sheet({ cyberware: [chrome('Chemskóra'), chrome('Techfryz')] });
    expect(cpredChromeSkillBonus(pair, 'personal-grooming')).toEqual({
      label: 'Chemskóra i techfryz',
      value: 2,
    });
  });

  it('Ulepszony słuch niczego nie dolicza sam — to MG', () => {
    const data = sheet({ cyberware: [chrome('Ulepszony słuch')] });
    expect(cpredChromeSkillBonus(data, 'perception')).toBeNull();
    expect(cpredActiveChrome(data).map((entry) => entry.mod.id)).toEqual(['amplified-hearing']);
  });
});

describe('czip Umiejętności', () => {
  const CHIP = 'Czip Umiejętności';

  it('podnosi Umiejętność do 3, a wyuczona wyżej wygrywa', () => {
    const data = sheet({ cyberware: [chrome(CHIP, { skillId: 'handgun' })] });
    expect(cpredSkillLevel(data, 'handgun')).toBe(3);
    expect(cpredSkillLevel({ ...data, skills: { handgun: 5 } }, 'handgun')).toBe(5);
    expect(cpredSkillLevel(data, 'perception')).toBe(0);
  });

  it('czip bez nazwanej Umiejętności nie robi nic', () => {
    expect(cpredSkillLevel(sheet({ cyberware: [chrome(CHIP)] }), 'handgun')).toBe(0);
  });

  it('Test i atak mówią „(czip)”', () => {
    const data = sheet({ cyberware: [chrome(CHIP, { skillId: 'perception' })] });
    const result = planCpredRoll(data, registry, { kind: 'skill', skillId: 'perception' });
    if (!result.ok) throw new Error(result.error);
    expect(result.plan.breakdown).toContainEqual({
      label: 'Percepcja (czip)',
      value: 3,
      kind: 'skill',
    });
  });

  it('nieznana Umiejętność odpada przy zapisie', () => {
    const data = parseCharacterData(
      { cyberware: [chrome(CHIP, { skillId: 'nie-ma-takiej' })] },
      registry,
    );
    expect(data.cyberware[0]!.skillId).toBeUndefined();
  });

  it('gracz nazywa czip raz, potem już tylko MG', () => {
    const blank = chrome(CHIP);
    const current = sheet({ cyberware: [blank] });
    expect(
      cpredPlayerItemPatchProblem(current, { cyberware: [{ ...blank, skillId: 'handgun' }] }),
    ).toBeNull();
    const named = sheet({ cyberware: [{ ...blank, skillId: 'handgun' }] });
    expect(
      cpredPlayerItemPatchProblem(named, { cyberware: [{ ...blank, skillId: 'perception' }] }),
    ).toBe('ITEM_LOCKED');
  });
});

describe('Inicjatywa', () => {
  it('Kerenzikov dodaje 2 do sumy, nie do remisu', () => {
    const plain = cpredSheetInitiative(sheet(), registry);
    const fast = cpredSheetInitiative(sheet({ cyberware: [chrome('Kerenzikov')] }), registry);
    expect(fast.modifier).toBe(plain.modifier + 2);
    expect(fast.tieBreak).toBe(plain.tieBreak);
    expect(fast.label).toContain('Kerenzikov 2');
  });
});

describe('chrom w oku przy ataku', () => {
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
  const SCOPE: CpredAttachmentProfile = {
    id: 'attachment.sniper-scope',
    name: 'Snajperska luneta celownicza',
    fit: {},
    rangedBonus: {
      bonus: 1,
      minMetres: 51,
      singleOnly: true,
      whenAimed: true,
      conflictsWith: ['Teleskop'],
    },
  };

  function labels(
    cyberware: CpredCyberwareRow[],
    metres: number,
    request: Partial<CpredAttackRequest> = {},
    attachments: CpredAttachmentProfile[] = [],
  ): string[] {
    const result = planCpredAttack(
      sheet({ cyberware, weapons: [row], skills: { handgun: 4 } }),
      registry,
      { weaponRowId: 'w1', mode: 'single', ...request },
      { row, resolved: pistol, attachments },
      { name: 'Cel', metres },
      {},
    );
    if (!result.ok) throw new Error(result.error);
    return result.plan.breakdown.map((entry) => entry.label);
  }

  it('Celownik optyczny dolicza tylko przy Celowaniu', () => {
    expect(labels([chrome('Celownik optyczny')], 10)).not.toContain('Celownik optyczny');
    expect(labels([chrome('Celownik optyczny')], 10, { aimedAt: 'head' })).toContain(
      'Celownik optyczny',
    );
  });

  it('Teleskop: pojedynczy strzał od 51 m albo Celowanie', () => {
    expect(labels([chrome('Teleskop')], 20)).not.toContain('Teleskop');
    expect(labels([chrome('Teleskop')], 60)).toContain('Teleskop');
    expect(labels([chrome('Teleskop')], 5, { aimedAt: 'leg' })).toContain('Teleskop');
  });

  it('Teleskop nie kumuluje się z lunetą snajperską', () => {
    const rows = labels([chrome('Teleskop')], 60, {}, [SCOPE]);
    expect(rows).toContain('Snajperska luneta celownicza');
    expect(rows).not.toContain('Teleskop');
  });

  it('dwa celowniki dają +1, nie +2', () => {
    const rows = labels([chrome('Celownik optyczny'), chrome('Celownik optyczny')], 10, {
      aimedAt: 'head',
    });
    expect(rows.filter((label) => label === 'Celownik optyczny')).toHaveLength(1);
  });
});
