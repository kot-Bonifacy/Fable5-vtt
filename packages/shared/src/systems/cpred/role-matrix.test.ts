import { describe, expect, it } from 'vitest';
import { damageTotal } from '../../dice.js';
import { buildCpredRegistry, createDefaultCharacterData, type CpredRegistry } from './character.js';
import {
  CPRED_PHARMACEUTICALS,
  cpredCanCraftPharma,
  cpredLegacyPharmaPicks,
  cpredPharmaAccess,
  cpredPickPharma,
  cpredReadPharmaPicks,
  cpredUnpickPharma,
} from './pharma.js';
import {
  CPRED_FABRICATION_RULES,
  CPRED_MEDICINE_RULES,
  CPRED_OPERATOR_ABILITY,
  cpredOperatorLanguageReminder,
  cpredFleetProblem,
  cpredRumourHeard,
  cpredSpecialtyPool,
  type CpredFleetRow,
} from './roleability.js';
import { planCpredRoll } from './rolls.js';
import { cpredRaceWeakDriver } from './chase-drive.js';

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
      { id: 'driving', name: 'Prowadzenie pojazdów', stat: 'ref' },
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
  it('MED-08 karta sprzed wyboru (null) czyta środki w kolejności tabeli', () => {
    expect(cpredPharmaAccess(0)).toHaveLength(0);
    expect(cpredPharmaAccess(2).map((entry) => entry.id)).toEqual(
      CPRED_PHARMACEUTICALS.slice(0, 2).map((entry) => entry.id),
    );
    expect(cpredPharmaAccess(5)).toHaveLength(CPRED_PHARMACEUTICALS.length);
    expect(cpredCanCraftPharma(1, CPRED_PHARMACEUTICALS[1]!.id)).toBe(false);
    expect(cpredCanCraftPharma(2, CPRED_PHARMACEUTICALS[1]!.id)).toBe(true);
  });

  it('MED-08 D2: każdy punkt otwiera środek, który Medyk wybrał (71g1)', () => {
    const [antibiotic, detox, turbo, stim] = CPRED_PHARMACEUTICALS.map((row) => row.id);
    // Nowa karta: dwa punkty, nic nie wybrane — dostępu nie ma.
    expect(cpredPharmaAccess(2, [])).toEqual([]);
    const first = cpredPickPharma(2, [], stim!);
    if (!first.ok) throw new Error('wybór odrzucony');
    const second = cpredPickPharma(2, first.picks, turbo!);
    if (!second.ok) throw new Error('wybór odrzucony');
    expect(cpredPharmaAccess(2, second.picks).map((row) => row.id)).toEqual([stim, turbo]);
    expect(cpredCanCraftPharma(2, antibiotic!, second.picks)).toBe(false);
    // Trzeci wybór bez trzeciego punktu, powtórka i obcy środek — odmowa.
    expect(cpredPickPharma(2, second.picks, detox!)).toEqual({
      ok: false,
      problem: 'NO_PHARMA_POINT',
    });
    expect(cpredPickPharma(3, second.picks, stim!)).toEqual({
      ok: false,
      problem: 'ALREADY_PICKED',
    });
    expect(cpredPickPharma(3, second.picks, 'pharma.nie-ma')).toEqual({
      ok: false,
      problem: 'UNKNOWN_PHARMA',
    });
    // Punkt zdjęty „−” chowa ostatni wybór, a dołożony z powrotem go oddaje.
    expect(cpredPharmaAccess(1, second.picks).map((row) => row.id)).toEqual([stim]);
    expect(cpredPickPharma(1, second.picks, detox!).ok).toBe(false);
    // Karta sprzed wyboru czyta się z dwoma środkami z tabeli i trzeci punkt wybiera.
    const legacy = cpredPickPharma(3, cpredLegacyPharmaPicks(2), stim!);
    expect(legacy.ok && legacy.picks).toEqual([antibiotic, detox, stim]);
    // Ręka MG zdejmuje wybór; zdjęcie czegoś, czego nie wybrano — odmowa.
    const removed = cpredUnpickPharma(2, second.picks, stim!);
    expect(removed.ok && removed.picks).toEqual([turbo]);
    expect(cpredUnpickPharma(2, second.picks, antibiotic!)).toEqual({
      ok: false,
      problem: 'NOT_PICKED',
    });
    // Odczyt karty: obce id, powtórki i nie-tablica wypadają.
    expect(cpredReadPharmaPicks([stim, stim, 'x', 7])).toEqual([stim]);
    expect(cpredReadPharmaPicks('stym')).toEqual([]);
  });
});

describe('Fixer — Wazeliniarz przy awansie (G36)', () => {
  it('FIX-12 Znajomości 3, 5 i 7 przypominają o nowym języku; inne poziomy i Zdolności — nie', () => {
    for (const to of [3, 5, 7]) {
      expect(cpredOperatorLanguageReminder(CPRED_OPERATOR_ABILITY, to)).toContain(
        `Znajomości ${to}`,
      );
    }
    for (const to of [1, 2, 4, 6, 8, 9, 10]) {
      expect(cpredOperatorLanguageReminder(CPRED_OPERATOR_ABILITY, to)).toBeNull();
    }
    expect(cpredOperatorLanguageReminder('Medycyna', 3)).toBeNull();
  });
});

describe('Nomada — próg Testu zwykłej jazdy', () => {
  // Od etapu 72c (decyzja MG z 15.11): próg słabego kierowcy liczy też Moto,
  // bo Moto dolicza się do samego Testu — rzut Wyścigu słabego kierowcy jest
  // jego Testem zwykłej jazdy.
  it('NOM-03 Nomada z REF 5, Prowadzeniem 4 i Moto 1 nie rzuca Testu jazdy, bez Moto — tak', () => {
    const nomad = sheet('nomad', 1, { skills: { driving: 4 } });
    expect(cpredRaceWeakDriver(nomad, registry, 'car', true)).toBe(false);
    const fresh = sheet('nomad', 0, { skills: { driving: 4 } });
    expect(cpredRaceWeakDriver(fresh, registry, 'car', true)).toBe(true);
  });
});

describe('Media — Pogłoski', () => {
  it('MDA-03 remis z progiem nie przynosi pogłoski, punkt wyżej już tak', () => {
    expect(cpredRumourHeard(7)).toBeNull();
    expect(cpredRumourHeard(8)?.id).toBe('vague');
    expect(cpredRumourHeard(14)?.id).toBe('detailed');
  });
});
