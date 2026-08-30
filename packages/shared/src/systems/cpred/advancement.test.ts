import { describe, expect, it } from 'vitest';
import {
  CPRED_ABILITY_ADVANCE_COSTS,
  CPRED_SKILL_ADVANCE_COSTS,
  cpredAbilityAdvanceCost,
  cpredAbilityAdvanceStep,
  cpredAbilityAdvanceSteps,
  cpredRoleChangeSheet,
  cpredSkillAdvanceCost,
  cpredSkillAdvanceStep,
  describeCpredAdvance,
  describeCpredRoleChange,
  formatAdvancementAmount,
  planCpredAdvance,
  planCpredRoleChange,
  type CpredAdvanceSheet,
} from './advancement.js';
import { buildCpredRegistry } from './character.js';
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
