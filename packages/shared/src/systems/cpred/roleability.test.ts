import { describe, expect, it } from 'vitest';
import {
  CPRED_COMBAT_AWARENESS,
  CPRED_COMBAT_AWARENESS_ABILITY,
  CPRED_NO_COMBAT_AWARENESS,
  cpredCombatAwarenessEffects,
  cpredCombatAwarenessProblem,
  cpredCombatAwarenessSpent,
  cpredCombatAwarenessValue,
  cpredRoleAbilityName,
  cpredRoleAbilityRank,
  cpredSheetCombatAwareness,
  describeCombatAwareness,
  readCpredCombatAwareness,
} from './roleability.js';
import { buildCpredRegistry, createDefaultCharacterData } from './character.js';

/**
 * Zmysł Walki (etap 30a, s. 146) — sześć zdolności bojowych i pula punktów
 * równa poziomowi Zdolności Specjalnej Solo.
 *
 * Testy trzymają się liczb z podręcznika, nie z implementacji: progi Redukcji
 * obrażeń (2/4/6/8/10 → 1…5), Precyzyjnego ataku (3/6/9 → 1…3), jedna cena
 * Wyjścia z opresji (4) i trzy zdolności „za każdy punkt +1".
 */

const registry = buildCpredRegistry(
  { skills: [] },
  {
    roles: [
      { id: 'solo', name: 'Solo', ability: 'Zmysł Walki' },
      { id: 'netrunner', name: 'Netrunner', ability: 'Interfejs' },
    ],
  },
);

function soloSheet(rank: number, allocation: Record<string, number> = {}) {
  return {
    ...createDefaultCharacterData(),
    roleId: 'solo',
    roleAbilityRank: rank,
    combatAwareness: readCpredCombatAwareness(allocation),
  };
}

describe('poziom Zdolności Specjalnej', () => {
  it('czyta rangę tylko wtedy, gdy Rola ma tę właśnie Zdolność', () => {
    expect(
      cpredRoleAbilityRank(
        { roleId: 'solo', roleAbilityRank: 6 },
        registry,
        CPRED_COMBAT_AWARENESS_ABILITY,
      ),
    ).toBe(6);
    // Netrunner ma Interfejs, nie Zmysł Walki — null, nie zero: zero czytałoby
    // się jak „Solo, które jest w tym słabe".
    expect(
      cpredRoleAbilityRank(
        { roleId: 'netrunner', roleAbilityRank: 8 },
        registry,
        CPRED_COMBAT_AWARENESS_ABILITY,
      ),
    ).toBeNull();
    expect(
      cpredRoleAbilityRank(
        { roleId: null, roleAbilityRank: 8 },
        registry,
        CPRED_COMBAT_AWARENESS_ABILITY,
      ),
    ).toBeNull();
  });

  it('nazywa Zdolność postaci', () => {
    expect(cpredRoleAbilityName({ roleId: 'solo' }, registry)).toBe('Zmysł Walki');
    expect(cpredRoleAbilityName({ roleId: null }, registry)).toBeNull();
  });
});

describe('progi kosztów z s. 146', () => {
  it('Redukcja obrażeń kupuje się parami punktów, 2 → −1 … 10 → −5', () => {
    expect(cpredCombatAwarenessValue('damageReduction', 2)).toBe(1);
    expect(cpredCombatAwarenessValue('damageReduction', 4)).toBe(2);
    expect(cpredCombatAwarenessValue('damageReduction', 6)).toBe(3);
    expect(cpredCombatAwarenessValue('damageReduction', 8)).toBe(4);
    expect(cpredCombatAwarenessValue('damageReduction', 10)).toBe(5);
    expect(cpredCombatAwarenessValue('damageReduction', 0)).toBe(0);
  });

  it('Precyzyjny atak kosztuje 3, 6 i 9 punktów za +1, +2 i +3', () => {
    expect(cpredCombatAwarenessValue('preciseAttack', 3)).toBe(1);
    expect(cpredCombatAwarenessValue('preciseAttack', 6)).toBe(2);
    expect(cpredCombatAwarenessValue('preciseAttack', 9)).toBe(3);
  });

  it('trzy zdolności liczą się „za każdy punkt"', () => {
    expect(cpredCombatAwarenessValue('fastReflexes', 1)).toBe(1);
    expect(cpredCombatAwarenessValue('weakSpot', 7)).toBe(7);
    expect(cpredCombatAwarenessValue('threatSense', 3)).toBe(3);
  });

  it('Wyjście z opresji ma jedną cenę i jest włącznikiem', () => {
    const definition = CPRED_COMBAT_AWARENESS.find((entry) => entry.id === 'luckyEscape')!;
    expect(definition.shape).toBe('flat');
    expect(definition.costs).toEqual([4]);
    expect(cpredCombatAwarenessEffects({ luckyEscape: 4 }, 4).ignoresFumble).toBe(true);
    expect(cpredCombatAwarenessEffects({}, 4).ignoresFumble).toBe(false);
  });
});

describe('walidacja przydziału', () => {
  it('odmawia sumy większej niż poziom Zdolności', () => {
    expect(cpredCombatAwarenessProblem({ damageReduction: 4, preciseAttack: 3 }, 6)).toBe(
      'NOT_ENOUGH_POINTS',
    );
    expect(cpredCombatAwarenessProblem({ damageReduction: 4, preciseAttack: 3 }, 7)).toBeNull();
  });

  it('odmawia liczby punktów spoza progu — 4 w Precyzyjny atak kupuje to, co 3', () => {
    expect(cpredCombatAwarenessProblem({ preciseAttack: 4 }, 10)).toBe('BAD_STEP');
    expect(cpredCombatAwarenessProblem({ damageReduction: 3 }, 10)).toBe('BAD_STEP');
    expect(cpredCombatAwarenessProblem({ luckyEscape: 2 }, 10)).toBe('BAD_STEP');
  });

  it('odmawia wartości, które nie są całkowite ani nieujemne', () => {
    expect(cpredCombatAwarenessProblem({ weakSpot: -1 }, 10)).toBe('BAD_VALUE');
    expect(cpredCombatAwarenessProblem({ weakSpot: 2.5 }, 10)).toBe('BAD_VALUE');
    expect(cpredCombatAwarenessProblem({ weakSpot: 11 }, 20)).toBe('BAD_VALUE');
  });

  it('pusty przydział na karcie bez Zmysłu Walki nie jest problemem', () => {
    expect(cpredCombatAwarenessProblem({}, null)).toBeNull();
    expect(cpredCombatAwarenessProblem({ weakSpot: 1 }, null)).toBe('NO_ABILITY');
  });
});

describe('przykład „Zmysł Walki w działaniu" (s. 146)', () => {
  /**
   * Kelsa ma Zmysł Walki 6 i na starcie sesji rozdziela: Redukcja obrażeń 1
   * (2 punkty), Wykrycie słabości 2 (2 punkty), Wyczucie zagrożenia 2
   * (2 punkty). Podręcznik podaje i punkty, i to, co kupują — więc test
   * sprawdza obie liczby naraz.
   */
  it('pierwszy przydział Kelsy daje −1 obrażeń, +2 do obrażeń i +2 do Percepcji', () => {
    const effects = cpredCombatAwarenessEffects(
      { damageReduction: 2, weakSpot: 2, threatSense: 2 },
      6,
    );
    expect(effects.damageReduction).toBe(1);
    expect(effects.weakSpot).toBe(2);
    expect(effects.perception).toBe(2);
    expect(effects.spent).toBe(6);
    expect(effects.left).toBe(0);
  });

  it('drugi przydział: Redukcja 1, Błyskawiczna reakcja 1, Precyzyjny atak 1', () => {
    const effects = cpredCombatAwarenessEffects(
      { damageReduction: 2, fastReflexes: 1, preciseAttack: 3 },
      6,
    );
    expect(effects.damageReduction).toBe(1);
    expect(effects.initiative).toBe(1);
    expect(effects.attack).toBe(1);
    expect(effects.spent).toBe(6);
  });

  it('trzeci przydział: wszystkie 6 w Wykrycie słabości', () => {
    const effects = cpredCombatAwarenessEffects({ weakSpot: 6 }, 6);
    expect(effects.weakSpot).toBe(6);
    expect(effects.damageReduction).toBe(0);
    expect(effects.attack).toBe(0);
  });
});

describe('czytanie z karty', () => {
  it('Solo dostaje swoje efekty, każda inna Rola dostaje zera', () => {
    expect(cpredSheetCombatAwareness(soloSheet(6, { preciseAttack: 6 }), registry).attack).toBe(2);
    const netrunner = { ...soloSheet(6, { preciseAttack: 6 }), roleId: 'netrunner' };
    expect(cpredSheetCombatAwareness(netrunner, registry)).toEqual(CPRED_NO_COMBAT_AWARENESS);
  });

  it('odczyt zapisanego przydziału wycina śmieci i zeruje ujemne', () => {
    expect(readCpredCombatAwareness({ weakSpot: 3, nieistnieje: 5, threatSense: -2 })).toEqual({
      weakSpot: 3,
    });
    expect(readCpredCombatAwareness(null)).toEqual({});
    expect(readCpredCombatAwareness('coś')).toEqual({});
  });

  it('karta, której MG obniżył rangę, nadal się otwiera', () => {
    // Zapis jest łagodny (nic nie ginie), a odmowa pada dopiero przy *zmianie*.
    const lowered = soloSheet(2, { damageReduction: 10 });
    expect(cpredSheetCombatAwareness(lowered, registry).damageReduction).toBe(5);
    expect(cpredCombatAwarenessProblem(lowered.combatAwareness, 2)).toBe('NOT_ENOUGH_POINTS');
  });
});

describe('zdanie o przydziale', () => {
  it('wylicza tylko to, w co coś włożono', () => {
    expect(describeCombatAwareness({ damageReduction: 4, luckyEscape: 4 })).toBe(
      'Redukcja obrażeń 2 (4 pkt), Wyjście z opresji (4 pkt)',
    );
  });

  it('pusty przydział mówi to wprost', () => {
    expect(describeCombatAwareness({})).toBe('nic nie rozdzielono');
    expect(cpredCombatAwarenessSpent({})).toBe(0);
  });
});
