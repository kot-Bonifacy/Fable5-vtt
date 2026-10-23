import { describe, expect, it } from 'vitest';
import {
  CPRED_ABILITY_ADVANCE_COSTS,
  CPRED_SKILL_ADVANCE_COSTS,
  cpredAbilityAdvanceCost,
  cpredAbilityAdvanceStep,
  cpredAbilityAdvanceSteps,
  cpredDevelopmentChanged,
  cpredRoleChangeSheet,
  cpredSkillAdvanceCost,
  cpredSkillAdvanceStep,
  describeCpredAdvance,
  describeCpredRoleChange,
  describeXpAwardNotice,
  formatAdvancementAmount,
  planCpredAdvance,
  planAdvancementUndo,
  planCpredAdvances,
  planCpredRoleChange,
  advancementRevertOf,
  cpredRoleState,
  type CpredAdvanceSheet,
} from './advancement.js';
import { buildCpredRegistry, createDefaultCharacterData } from './character.js';
import { createDefaultLifepath } from './lifepath.js';
import { cpredInterfaceRank } from './netrun.js';
import type { CpredRegistry } from './character.js';

const registry: CpredRegistry = buildCpredRegistry(
  {
    skills: [
      { id: 'perception', name: 'Percepcja', stat: 'int' },
      { id: 'autofire', name: 'Ogień ciągły', stat: 'ref', multiplier: 2 },
      { id: 'science', name: 'Nauka', stat: 'int' },
    ],
  },
  {
    roles: [
      { id: 'solo', name: 'Solo', ability: 'Zmysł Walki' },
      { id: 'netrunner', name: 'Netrunner', ability: 'Interfejs' },
      { id: 'medtech', name: 'Medyk', ability: 'Medycyna' },
    ],
  },
);

/** Minimal slice of a sheet — the six fields these rules ever read. */
function sheet(patch: Partial<CpredAdvanceSheet> = {}): CpredAdvanceSheet {
  return {
    skills: {},
    skillSpecialties: {},
    lifepath: createDefaultLifepath(),
    roleId: null,
    roleAbilityRank: 1,
    formerRoles: [],
    improvementPoints: 0,
    ...patch,
  };
}

describe('drabinki kosztów (s. 411)', () => {
  it('są trzy, nie jedna — i 60/120/…/600 należy do Zdolności, nie do Umiejętności', () => {
    expect(CPRED_SKILL_ADVANCE_COSTS).toEqual([20, 40, 60, 80, 100, 120, 140, 160, 180, 200]);
    expect(CPRED_ABILITY_ADVANCE_COSTS).toEqual([60, 120, 180, 240, 300, 360, 420, 480, 540, 600]);
    // Umiejętność ×2 nie ma własnej tablicy: to ta pierwsza razy dwa.
    expect(CPRED_SKILL_ADVANCE_COSTS.map((cost) => cost * 2)).toEqual([
      40, 80, 120, 160, 200, 240, 280, 320, 360, 400,
    ]);
  });

  it('płaci się za poziom docelowy, nie za opuszczany', () => {
    expect(cpredSkillAdvanceCost(1)).toBe(20);
    expect(cpredSkillAdvanceCost(5)).toBe(100);
    expect(cpredSkillAdvanceCost(10)).toBe(200);
    expect(cpredAbilityAdvanceCost(1)).toBe(60);
    expect(cpredAbilityAdvanceCost(10)).toBe(600);
  });

  it('mnożnik ×2 podwaja szczebel, a inna liczba jest czytana jak jeden', () => {
    expect(cpredSkillAdvanceCost(5, 2)).toBe(200);
    expect(cpredSkillAdvanceCost(5, 1)).toBe(100);
    expect(cpredSkillAdvanceCost(5, 3)).toBe(100);
  });

  it('poza drabinką nie ma ceny', () => {
    expect(cpredSkillAdvanceCost(0)).toBeNull();
    expect(cpredSkillAdvanceCost(11)).toBeNull();
    expect(cpredAbilityAdvanceCost(11)).toBeNull();
  });
});

describe('krok w górę', () => {
  it('nietrenowana Umiejętność wchodzi na poziom 1 za pierwszy szczebel', () => {
    const step = cpredSkillAdvanceStep(sheet(), { id: 'perception', name: 'Percepcja' })!;
    expect(step).toMatchObject({ from: 0, to: 1, cost: 20, doubled: false });
  });

  it('Ogień ciągły kosztuje dwa razy tyle, co Percepcja na ten sam poziom', () => {
    const data = sheet({ skills: { perception: 4, autofire: 4 } });
    const plain = cpredSkillAdvanceStep(data, { id: 'perception', name: 'Percepcja' })!;
    const doubled = cpredSkillAdvanceStep(data, {
      id: 'autofire',
      name: 'Ogień ciągły',
      multiplier: 2,
    })!;
    expect(plain.cost).toBe(100);
    expect(doubled.cost).toBe(200);
    expect(doubled.doubled).toBe(true);
  });

  it('nazwa kroku niesie specjalizację, gdy karta ją nazwała', () => {
    const data = sheet({ skills: { science: 2 }, skillSpecialties: { science: 'Fizyka' } });
    const step = cpredSkillAdvanceStep(data, { id: 'science', name: 'Nauka' })!;
    expect(step.name).toBe('Nauka (Fizyka)');
    expect(describeCpredAdvance(step)).toBe('Nauka (Fizyka) 2 → 3');
  });

  it('dziesiąty poziom nie ma następnego', () => {
    const data = sheet({ skills: { perception: 10 } });
    expect(cpredSkillAdvanceStep(data, { id: 'perception', name: 'Percepcja' })).toBeNull();
  });

  it('Zdolność Specjalna nazywa się nazwą z rejestru, nie id Roli', () => {
    const step = cpredAbilityAdvanceStep(sheet({ roleId: 'solo', roleAbilityRank: 3 }), registry)!;
    expect(step).toMatchObject({ kind: 'ability', name: 'Zmysł Walki', from: 3, to: 4, cost: 240 });
  });

  it('karta bez Roli nie ma czego podnosić', () => {
    expect(cpredAbilityAdvanceStep(sheet(), registry)).toBeNull();
    expect(cpredAbilityAdvanceStep(sheet({ roleId: 'ghost' }), registry)).toBeNull();
  });
});

describe('planCpredAdvance', () => {
  it('kupuje poziom i mówi, ile zostanie', () => {
    const data = sheet({ skills: { perception: 4 }, improvementPoints: 250 });
    const result = planCpredAdvance(data, registry, {
      kind: 'skill',
      skillId: 'perception',
      to: 5,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan).toMatchObject({ from: 4, to: 5, cost: 100, left: 150 });
  });

  it('odmawia przeskoku o dwa poziomy, choćby stać było na oba', () => {
    const data = sheet({ skills: { perception: 3 }, improvementPoints: 9999 });
    const result = planCpredAdvance(data, registry, {
      kind: 'skill',
      skillId: 'perception',
      to: 5,
    });
    expect(result).toEqual({ ok: false, problem: 'LEVEL_SKIP' });
  });

  it('drugie kliknięcie w ten sam guzik trafia w ten sam zakaz', () => {
    // Poziom już podniesiony: żądanie „na 5" przychodzi do karty, która stoi
    // na 5, więc kolejnym poziomem jest 6 — to nie jest awans, tylko wyścig.
    const data = sheet({ skills: { perception: 5 }, improvementPoints: 9999 });
    const result = planCpredAdvance(data, registry, {
      kind: 'skill',
      skillId: 'perception',
      to: 5,
    });
    expect(result).toEqual({ ok: false, problem: 'LEVEL_SKIP' });
  });

  it('odmawia przy pustej sakiewce i nie zabiera nic', () => {
    const data = sheet({ skills: { perception: 4 }, improvementPoints: 99 });
    const result = planCpredAdvance(data, registry, {
      kind: 'skill',
      skillId: 'perception',
      to: 5,
    });
    expect(result).toEqual({ ok: false, problem: 'NO_POINTS' });
  });

  it('stać dokładnie co do punktu wystarcza', () => {
    const data = sheet({ skills: { perception: 4 }, improvementPoints: 100 });
    const result = planCpredAdvance(data, registry, {
      kind: 'skill',
      skillId: 'perception',
      to: 5,
    });
    expect(result.ok && result.plan.left).toBe(0);
  });

  it('nieznana Umiejętność i brak Roli mają własne odmowy', () => {
    expect(planCpredAdvance(sheet(), registry, { kind: 'skill', skillId: 'brak', to: 1 })).toEqual({
      ok: false,
      problem: 'UNKNOWN_SKILL',
    });
    expect(planCpredAdvance(sheet(), registry, { kind: 'ability', to: 1 })).toEqual({
      ok: false,
      problem: 'NO_ROLE',
    });
  });

  it('dziesiątka jest końcem obu drabinek', () => {
    const skills = sheet({ skills: { perception: 10 }, improvementPoints: 9999 });
    expect(
      planCpredAdvance(skills, registry, { kind: 'skill', skillId: 'perception', to: 11 }),
    ).toEqual({ ok: false, problem: 'LEVEL_MAX' });
    const ability = sheet({ roleId: 'solo', roleAbilityRank: 10, improvementPoints: 9999 });
    expect(planCpredAdvance(ability, registry, { kind: 'ability', to: 11 })).toEqual({
      ok: false,
      problem: 'LEVEL_MAX',
    });
  });

  it('Interfejs Netrunnera kupuje się tą samą drabinką, co Zmysł Walki', () => {
    const data = sheet({ roleId: 'netrunner', roleAbilityRank: 2, improvementPoints: 180 });
    const result = planCpredAdvance(data, registry, { kind: 'ability', to: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan).toMatchObject({ name: 'Interfejs', cost: 180, left: 0 });
  });

  it('żądanie bez sensownego celu jest odrzucane, a nie zgadywane', () => {
    const data = sheet({ improvementPoints: 9999 });
    expect(
      planCpredAdvance(data, registry, {
        kind: 'skill',
        skillId: 'perception',
        to: Number.NaN,
      }),
    ).toEqual({ ok: false, problem: 'BAD_REQUEST' });
    expect(planCpredAdvance(data, registry, { kind: 'stat' as 'skill', to: 1 })).toEqual({
      ok: false,
      problem: 'BAD_REQUEST',
    });
  });
});

describe('Interfejs Netrunnera', () => {
  /**
   * Kryterium etapu 29a: kupiony poziom Zdolności musi natychmiast działać
   * tam, gdzie jest czytany. Interfejs jest jedyną Zdolnością z mechaniką
   * starszą niż etap 30 (`netrun.ts`) — i jedyną, która to sprawdza.
   */
  it('kupiony poziom widać w netrun.ts od razu, bez drugiego pola', () => {
    const data = sheet({ roleId: 'netrunner', roleAbilityRank: 2, improvementPoints: 180 });
    expect(cpredInterfaceRank(data, registry)).toBe(2);
    const result = planCpredAdvance(data, registry, { kind: 'ability', to: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = { ...data, roleAbilityRank: result.plan.to };
    expect(cpredInterfaceRank(after, registry)).toBe(3);
  });
});

describe('rejestr awansów', () => {
  it('kwota niesie znak i jednostkę', () => {
    expect(formatAdvancementAmount(50)).toBe('+50 PD');
    expect(formatAdvancementAmount(-200)).toBe('−200 PD');
  });
});

/**
 * Wieloklasowość (etap 29b, s. 143).
 *
 * „W Czasie Czerwieni możesz zmienić Rolę zawsze, gdy poziom Zdolności
 * Specjalnej poprzedniej Roli wynosi co najmniej 4" — bramka pyta zawsze
 * o Rolę **bieżącą**, i to jest cały mechanizm, przez który trzecia Rola pyta
 * o drugą, a nie o pierwszą.
 */
describe('zmiana Roli', () => {
  const solo = sheet({ roleId: 'solo', roleAbilityRank: 4, improvementPoints: 100 });

  it('nie otwiera się poniżej czwartego poziomu Zdolności', () => {
    const green = sheet({ roleId: 'solo', roleAbilityRank: 3, improvementPoints: 600 });
    expect(planCpredRoleChange(green, registry, 'netrunner')).toEqual({
      ok: false,
      problem: 'RANK_TOO_LOW',
    });
  });

  it('nowa Rola startuje od poziomu 1 i kosztuje pierwszy szczebel drabinki Zdolności', () => {
    const result = planCpredRoleChange(solo, registry, 'netrunner');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan).toMatchObject({
      roleId: 'netrunner',
      ability: 'Interfejs',
      rank: 1,
      returning: false,
      cost: CPRED_ABILITY_ADVANCE_COSTS[0],
      left: 40,
      from: { roleId: 'solo', rank: 4 },
    });
    expect(describeCpredRoleChange(result.plan)).toBe('Netrunner — nowa Rola (Interfejs 1)');
  });

  it('stara Rola schodzi na listę z zachowaną rangą, a nowa staje na jej miejscu', () => {
    const result = planCpredRoleChange(solo, registry, 'netrunner');
    if (!result.ok) throw new Error('plan odrzucony');
    expect(cpredRoleChangeSheet(solo, result.plan)).toEqual({
      roleId: 'netrunner',
      roleAbilityRank: 1,
      formerRoles: [{ roleId: 'solo', rank: 4 }],
    });
  });

  it('bez PD nowej Roli się nie kupi', () => {
    const broke = sheet({ roleId: 'solo', roleAbilityRank: 6, improvementPoints: 59 });
    expect(planCpredRoleChange(broke, registry, 'netrunner')).toEqual({
      ok: false,
      problem: 'NO_POINTS',
    });
  });

  it('powrót do Roli, którą postać już miała, jest za darmo i z zachowaną rangą', () => {
    const runner = sheet({
      roleId: 'netrunner',
      roleAbilityRank: 4,
      formerRoles: [{ roleId: 'solo', rank: 6 }],
      improvementPoints: 0,
    });
    const result = planCpredRoleChange(runner, registry, 'solo');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan).toMatchObject({ returning: true, cost: 0, rank: 6, left: 0 });
    expect(describeCpredRoleChange(result.plan)).toBe('Solo — powrót do Roli (Zmysł Walki 6)');
    // Netrunner schodzi na listę, Solo z niej znika — żadna Rola nie stoi dwa razy.
    expect(cpredRoleChangeSheet(runner, result.plan)).toEqual({
      roleId: 'solo',
      roleAbilityRank: 6,
      formerRoles: [{ roleId: 'netrunner', rank: 4 }],
    });
  });

  it('trzecia Rola pyta o Zdolność bieżącej, nie o najwyższą posiadaną', () => {
    // Solo 9 w przeszłości nie otwiera drzwi Netrunnerowi na poziomie 2.
    const runner = sheet({
      roleId: 'netrunner',
      roleAbilityRank: 2,
      formerRoles: [{ roleId: 'solo', rank: 9 }],
      improvementPoints: 600,
    });
    expect(planCpredRoleChange(runner, registry, 'medtech')).toEqual({
      ok: false,
      problem: 'RANK_TOO_LOW',
    });
  });

  it('odmawia Roli, którą postać już jest, i Roli, której nie ma w rejestrze', () => {
    expect(planCpredRoleChange(solo, registry, 'solo')).toEqual({
      ok: false,
      problem: 'SAME_ROLE',
    });
    expect(planCpredRoleChange(solo, registry, 'zjadacz-ognia')).toEqual({
      ok: false,
      problem: 'UNKNOWN_ROLE',
    });
    expect(planCpredRoleChange(solo, registry, '')).toEqual({ ok: false, problem: 'BAD_REQUEST' });
    const roleless = sheet({ roleId: null, improvementPoints: 600 });
    expect(planCpredRoleChange(roleless, registry, 'solo')).toEqual({
      ok: false,
      problem: 'NO_ROLE',
    });
  });
});

describe('awans Zdolności przy kilku Rolach', () => {
  const multi = sheet({
    roleId: 'netrunner',
    roleAbilityRank: 1,
    formerRoles: [{ roleId: 'solo', rank: 4 }],
    improvementPoints: 600,
  });

  it('wystawia drabinkę każdej Roli osobno, bieżącą pierwszą', () => {
    expect(
      cpredAbilityAdvanceSteps(multi, registry).map((step) => [step.name, step.from, step.cost]),
    ).toEqual([
      ['Interfejs', 1, 120],
      ['Zmysł Walki', 4, 300],
    ]);
  });

  it('poprzednia Rola rośnie dalej — i płaci własnym szczeblem', () => {
    const result = planCpredAdvance(multi, registry, { kind: 'ability', roleId: 'solo', to: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan).toMatchObject({
      name: 'Zmysł Walki',
      roleId: 'solo',
      cost: 300,
      left: 300,
    });
  });

  it('bez `roleId` awansuje bieżąca Rola — tak jak przed etapem', () => {
    const result = planCpredAdvance(multi, registry, { kind: 'ability', to: 2 });
    if (!result.ok) throw new Error('plan odrzucony');
    expect(result.plan).toMatchObject({ name: 'Interfejs', roleId: 'netrunner', cost: 120 });
  });

  it('Roli spoza karty nie da się podnieść cudzym kosztem', () => {
    expect(
      planCpredAdvance(multi, registry, { kind: 'ability', roleId: 'medtech', to: 1 }),
    ).toEqual({ ok: false, problem: 'NO_ROLE' });
  });

  it('Zdolność poprzedniej Roli na dziesiątce nie blokuje bieżącej', () => {
    const capped = sheet({
      roleId: 'netrunner',
      roleAbilityRank: 3,
      formerRoles: [{ roleId: 'solo', rank: 10 }],
      improvementPoints: 600,
    });
    expect(cpredAbilityAdvanceSteps(capped, registry).map((step) => step.name)).toEqual([
      'Interfejs',
    ]);
  });
});

describe('komunikat o przyznanych PD (20.10)', () => {
  const notice = {
    characterId: 'c1',
    characterName: 'Marek',
    amount: 50,
    labels: ['sesja 20.10'],
    available: 120,
  };

  it('mówi, ile przyznano, komu, za co i ile jest do wydania', () => {
    expect(describeXpAwardNotice(notice)).toBe(
      'MG przyznał 50 PD postaci Marek (sesja 20.10). Do wydania: 120 PD.',
    );
  });

  it('kilka przyznań pod nieobecność wymienia wszystkie powody', () => {
    expect(
      describeXpAwardNotice({ ...notice, amount: 90, labels: ['sesja 13.10', 'sesja 20.10'] }),
    ).toBe('MG przyznał 90 PD postaci Marek (sesja 13.10; sesja 20.10). Do wydania: 120 PD.');
  });
});

describe('rozwój postaci poza Awansem (blokada w walce, 21.10)', () => {
  const base = {
    ...createDefaultCharacterData(),
    medicine: { surgery: 2 },
    fleet: [{ id: 'f1', kind: 'vehicle' as const, name: 'Kombi', level: 2, notes: '' }],
    lifestyle: { level: 'kibble' as const, housing: 'street' as const },
  };

  it('nie widzi zmiany w polach odesłanych bez zmian', () => {
    expect(cpredDevelopmentChanged(base, { ...base, medicine: { surgery: 2 } })).toBe(false);
    expect(cpredDevelopmentChanged(base, { ...base, fabrication: { repair: 0 } })).toBe(false);
  });

  it('przepuszcza uwagi przy wpisie Taboru', () => {
    const fleet = [{ ...base.fleet[0]!, notes: 'dziura w dachu' }];
    expect(cpredDevelopmentChanged(base, { ...base, fleet })).toBe(false);
  });

  it('widzi rozdział Specjalizacji, wpis Taboru i przeprowadzkę', () => {
    expect(cpredDevelopmentChanged(base, { ...base, medicine: { surgery: 3 } })).toBe(true);
    expect(cpredDevelopmentChanged(base, { ...base, fleet: [] })).toBe(true);
    expect(
      cpredDevelopmentChanged(base, {
        ...base,
        lifestyle: { ...base.lifestyle, housing: 'streetVehicle' },
      }),
    ).toBe(true);
    expect(cpredDevelopmentChanged(base, { ...base, lifestyle: null })).toBe(true);
  });
});

describe('koszyk awansów (24.10)', () => {
  it('kolejny szczebel liczy się od poziomu, który zostawił poprzedni', () => {
    const result = planCpredAdvances(
      sheet({ skills: { perception: 4 }, improvementPoints: 220 }),
      registry,
      [
        { kind: 'skill', skillId: 'perception', to: 5 },
        { kind: 'skill', skillId: 'perception', to: 6 },
      ],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plans.map((plan) => plan.cost)).toEqual([100, 120]);
    expect(result.sheet.skills.perception).toBe(6);
    expect(result.sheet.improvementPoints).toBe(0);
  });

  it('koszyk o punkt za drogi pada cały i mówi, który krok', () => {
    const result = planCpredAdvances(
      sheet({ skills: { perception: 4 }, improvementPoints: 219 }),
      registry,
      [
        { kind: 'skill', skillId: 'perception', to: 5 },
        { kind: 'skill', skillId: 'perception', to: 6 },
      ],
    );
    expect(result).toEqual({ ok: false, problem: 'NO_POINTS', index: 1 });
  });

  it('pusty koszyk zostawia kartę bez zmian', () => {
    const data = sheet({ improvementPoints: 5 });
    expect(planCpredAdvances(data, registry, [])).toEqual({ ok: true, plans: [], sheet: data });
  });
});

describe('cofanie wpisu rejestru przez MG (24.10)', () => {
  const solo = sheet({
    roleId: 'solo',
    roleAbilityRank: 5,
    formerRoles: [{ roleId: 'medtech', rank: 2 }],
    skills: { perception: 5 },
    improvementPoints: 10,
  });

  it('Umiejętność wraca o szczebel, a cena do puli', () => {
    const step = cpredSkillAdvanceStep(sheet({ skills: { perception: 4 } }), registry.skills[0]!)!;
    const result = planAdvancementUndo(solo, {
      kind: 'spend',
      amount: -step.cost,
      revert: advancementRevertOf(step),
      undone: false,
    });
    expect(result).toEqual({
      ok: true,
      plan: { amount: 100, sheet: { skills: { perception: 4 } } },
    });
  });

  it('Zdolność poprzedniej Roli wraca na jej własnym wierszu', () => {
    const step = cpredAbilityAdvanceStep(
      { ...solo, formerRoles: [{ roleId: 'medtech', rank: 1 }] },
      registry,
      'medtech',
    )!;
    const result = planAdvancementUndo(solo, {
      kind: 'spend',
      amount: -step.cost,
      revert: advancementRevertOf(step),
      undone: false,
    });
    expect(result.ok && result.plan.sheet).toEqual({
      formerRoles: [{ roleId: 'medtech', rank: 1 }],
    });
  });

  it('awans pod późniejszym szczeblem tej samej rzeczy czeka', () => {
    const result = planAdvancementUndo(solo, {
      kind: 'spend',
      amount: -80,
      revert: {
        type: 'advance',
        kind: 'skill',
        skillId: 'perception',
        roleId: null,
        from: 3,
        to: 4,
      },
      undone: false,
    });
    expect(result).toEqual({ ok: false, problem: 'UNDO_STALE' });
  });

  it('zmiana Roli wraca całą trójką pól, póki nic jej nie ruszyło', () => {
    const before = sheet({ roleId: 'medtech', roleAbilityRank: 4, improvementPoints: 60 });
    const plan = planCpredRoleChange(before, registry, 'solo');
    if (!plan.ok) throw new Error('role change refused');
    const after = { ...before, ...cpredRoleChangeSheet(before, plan.plan), improvementPoints: 0 };
    const entry = {
      kind: 'role',
      amount: -60,
      revert: {
        type: 'role' as const,
        before: cpredRoleState(before),
        after: cpredRoleState(after),
      },
      undone: false,
    };
    expect(planAdvancementUndo(after, entry)).toEqual({
      ok: true,
      plan: { amount: 60, sheet: cpredRoleState(before) },
    });
    expect(planAdvancementUndo({ ...after, roleAbilityRank: 2 }, entry)).toEqual({
      ok: false,
      problem: 'UNDO_STALE',
    });
  });

  it('przyznanie schodzi tylko z PD, które jeszcze leżą', () => {
    const award = { kind: 'award', amount: 50, revert: null, undone: false };
    expect(planAdvancementUndo(solo, award)).toEqual({ ok: false, problem: 'UNDO_SPENT' });
    expect(planAdvancementUndo({ ...solo, improvementPoints: 50 }, award)).toEqual({
      ok: true,
      plan: { amount: -50, sheet: {} },
    });
  });

  it('nie cofa drugi raz, nie cofa cofnięcia, a stary awans bez pamięci odsyła do karty', () => {
    expect(
      planAdvancementUndo(solo, { kind: 'award', amount: 5, revert: null, undone: true }),
    ).toEqual({ ok: false, problem: 'UNDO_DONE' });
    expect(
      planAdvancementUndo(solo, { kind: 'undo', amount: 5, revert: null, undone: false }),
    ).toEqual({ ok: false, problem: 'UNDO_KIND' });
    expect(
      planAdvancementUndo(solo, { kind: 'spend', amount: -20, revert: null, undone: false }),
    ).toEqual({ ok: false, problem: 'UNDO_UNKNOWN' });
  });
});
