import { describe, expect, it } from 'vitest';
import { damageTotal } from '../../dice.js';
import { buildCpredRegistry, createDefaultCharacterData, type CpredRegistry } from './character.js';
import { CPRED_PHARMACEUTICALS, cpredCanCraftPharma, cpredPharmaAccess } from './pharma.js';
import {
  CPRED_FABRICATION_RULES,
  CPRED_MEDICINE_RULES,
  cpredFleetProblem,
  cpredRumourHeard,
  cpredSpecialtyPool,
  type CpredFleetRow,
} from './roleability.js';
import { planCpredRoll } from './rolls.js';
import { cpredDrivingTestNeeded } from './vehicles.js';

/**
 * Testy charakteryzujące z audytu Ról (etap 71a). Każdy nosi identyfikator
 * wiersza z `docs/etapy/role-macierz.md` i przypina zachowanie, na które macierz
 * się powołuje, a którego żaden wcześniejszy test nie trzymał.
 *
 * `it.fails` znaczy: podręcznik albo FAQ mówi inaczej, niż liczy kod (wiersz ⚠️).
 * Naprawa czeka na bramkę MG po 71b — po niej taki test zrobi się czerwony
 * i wtedy `it.fails` zamienia się na zwykłe `it`.
 */

const registry: CpredRegistry = buildCpredRegistry(
  {
    skills: [
      { id: 'perception', name: 'Percepcja', stat: 'int' },
      { id: 'human-perception', name: 'Odczytywanie emocji', stat: 'emp' },
    ],
  },
  {
    roles: [
      { id: 'solo', name: 'Solo', ability: 'Zmysł Walki' },
      { id: 'nomad', name: 'Nomada', ability: 'Moto' },
    ],
  },
);

function sheet(roleId: string, rank: number, extra: Record<string, unknown> = {}) {
  return { ...createDefaultCharacterData(), roleId, roleAbilityRank: rank, ...extra };
}

describe('Solo — styk Zmysłu Walki z FAQ', () => {
  it('SOL-13 Wyczucie zagrożenia wchodzi do Percepcji, a nie do Odczytywania emocji', () => {
    const solo = sheet('solo', 6, {
      skills: { perception: 4, 'human-perception': 4 },
      combatAwareness: { threatSense: 3 },
    });
    const perception = planCpredRoll(solo, registry, { kind: 'skill', skillId: 'perception' });
    const emotions = planCpredRoll(solo, registry, { kind: 'skill', skillId: 'human-perception' });
    expect(perception.ok && emotions.ok).toBe(true);
    if (!perception.ok || !emotions.ok) return;
    expect(perception.plan.breakdown.map((row) => row.label)).toContain('Wyczucie zagrożenia 3');
    expect(emotions.plan.breakdown.map((row) => row.label)).not.toContain('Wyczucie zagrożenia 3');
  });

  const armed = sheet('solo', 6, {
    weapons: [
      {
        id: 'w1',
        name: 'Karabin szturmowy',
        damage: '5k6',
        notes: '',
        ammoCurrent: 25,
        ammoMax: 25,
        ammoType: '',
        rof: '1',
      },
    ],
  });

  // FAQ: przy Ogniu ciągłym premię dodaje się PO pomnożeniu 2k6, przed pancerzem:
  // (2k6 × mnożnik) + Wykrycie słabości. Dziś premia jest termem rzutu, a mnożnik
  // obejmuje całą sumę — (2k6 + premia) × mnożnik.
  it('SOL-10 plan serii niesie premię w modyfikatorze i mnożnik obok niej', () => {
    // Pilnuje, żeby `it.fails` niżej padał z powodu rachunku, a nie odmowy planera.
    const planned = planCpredRoll(armed, registry, {
      kind: 'damage',
      weaponRowId: 'w1',
      damageNotation: '2k6',
      damageMultiplier: 3,
      weakSpot: 2,
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.modifierTotal).toBe(2);
    expect(planned.plan.damage?.multiplier).toBe(3);
  });

  it('SOL-10 Wykrycie słabości przy Ogniu ciągłym nie mnoży się razem z kośćmi (#83, 71c0)', () => {
    const planned = planCpredRoll(armed, registry, {
      kind: 'damage',
      weaponRowId: 'w1',
      damageNotation: '2k6',
      damageMultiplier: 3,
      weakSpot: 2,
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const dice = 7;
    const rolled = dice + planned.plan.modifierTotal;
    const total = damageTotal({ total: rolled, damage: planned.plan.damage as never });
    expect(total).toBe(dice * 3 + 2);
  });
});

describe('Rozwój — korzyści rangi 4 z kreatora (FAQ)', () => {
  it('ROZ-06 ranga 4 daje Medykowi 4 punkty Specjalizacji, a Technikowi 8', () => {
    expect(cpredSpecialtyPool(CPRED_MEDICINE_RULES, 4)).toBe(4);
    expect(cpredSpecialtyPool(CPRED_FABRICATION_RULES, 4)).toBe(8);
  });

  it('ROZ-07 Nomada z Moto 4 ma cztery wpisy Taboru, piąty jest ponad rangę', () => {
    const row = (id: string): CpredFleetRow => ({
      id,
      kind: 'vehicle',
      name: 'Samochód kompaktowy',
      level: 1,
      notes: '',
    });
    const four = ['a', 'b', 'c', 'd'].map(row);
    expect(cpredFleetProblem(four, 4)).toBeNull();
    expect(cpredFleetProblem([...four, row('e')], 4)).toBe('TOO_MANY');
  });
});

describe('Medyk — dostęp do Farmaceutyków', () => {
  it('MED-08 punkt Farmaceutyków otwiera kolejny środek w kolejności tabeli', () => {
    expect(cpredPharmaAccess(0)).toHaveLength(0);
    expect(cpredPharmaAccess(2).map((entry) => entry.id)).toEqual(
      CPRED_PHARMACEUTICALS.slice(0, 2).map((entry) => entry.id),
    );
    expect(cpredPharmaAccess(5)).toHaveLength(CPRED_PHARMACEUTICALS.length);
    expect(cpredCanCraftPharma(1, CPRED_PHARMACEUTICALS[1]!.id)).toBe(false);
    expect(cpredCanCraftPharma(2, CPRED_PHARMACEUTICALS[1]!.id)).toBe(true);
  });
});

describe('Nomada — próg Testu zwykłej jazdy', () => {
  // Wiersz ❓: próg liczy REF + Umiejętność i nie widzi Moto, choć Moto dokłada
  // się do samego Testu. Podręcznik nie rozstrzyga — decyzja MG na bramce.
  it('NOM-03 kierowca z REF 5 i Prowadzeniem 4 rzuca Test jazdy bez względu na Moto', () => {
    expect(cpredDrivingTestNeeded(5, 4)).toBe(true);
    expect(cpredDrivingTestNeeded(5, 5)).toBe(false);
  });
});

describe('Media — Pogłoski', () => {
  it('MDA-03 remis z progiem nie przynosi pogłoski, punkt wyżej już tak', () => {
    expect(cpredRumourHeard(7)).toBeNull();
    expect(cpredRumourHeard(8)?.id).toBe('vague');
    expect(cpredRumourHeard(14)?.id).toBe('detailed');
  });
});
