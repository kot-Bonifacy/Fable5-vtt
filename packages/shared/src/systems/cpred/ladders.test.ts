import { describe, expect, it } from 'vitest';
import {
  CPRED_CHARISMA_DV,
  CPRED_CHARISMA_TIERS,
  CPRED_CREDIBILITY_TIERS,
  CPRED_HAGGLE_DEALS,
  CPRED_MOTO_FLEET,
  CPRED_MOTO_SKILL_IDS,
  CPRED_OPERATOR_TIERS,
  CPRED_RUMOUR_TIERS,
  cpredAbilityTierAt,
  cpredAbilityTiersUpTo,
  cpredAudienceBelieves,
  cpredCharismaEffect,
  cpredCharismaProblem,
  cpredCharismaTierAt,
  cpredFleetProblem,
  cpredFleetSheetProblem,
  cpredHaggleDeals,
  cpredHaggleProblem,
  cpredHaggledPrice,
  cpredOperatorReach,
  cpredReliabilityChance,
  cpredRumourHeard,
  cpredSheetMoto,
  readCpredFleet,
  readCpredHaggle,
  type CpredAbilityTier,
} from './roleability.js';
import { buildCpredRegistry, createDefaultCharacterData } from './character.js';

/**
 * Etap 30d — cztery Zdolności, które dzielą jeden kształt: drabinę rang.
 *
 * Testy trzymają się liczb z podręcznika, nie z implementacji: sześć szczebli
 * u Rockera, Fixera i Media (1–2, 3–4, 5–6, 7–8, 9, 10), cztery u Nomady
 * (1–4, 5–6, 7–8, 9–10), PT 8/10/12 Efektu Charyzmy, szansa Rzetelności 2…7
 * i progi pogłosek 7/9/11/13.
 */

const registry = buildCpredRegistry(
  { skills: [] },
  {
    roles: [
      { id: 'rockerboy', name: 'Rocker', ability: 'Efekt Charyzmy' },
      { id: 'fixer', name: 'Fixer', ability: 'Znajomości' },
      { id: 'nomad', name: 'Nomada', ability: 'Moto' },
      { id: 'media', name: 'Media', ability: 'Wiarygodność' },
      { id: 'solo', name: 'Solo', ability: 'Zmysł Walki' },
    ],
  },
);

function sheet(roleId: string, rank: number) {
  return { ...createDefaultCharacterData(), roleId, roleAbilityRank: rank };
}

describe('drabina rang', () => {
  it('trzy z czterech tabel mają sześć szczebli i parują rangi aż do dziewiątki', () => {
    const ladders: readonly (readonly CpredAbilityTier[])[] = [
      CPRED_CHARISMA_TIERS,
      CPRED_OPERATOR_TIERS,
      CPRED_CREDIBILITY_TIERS,
    ];
    for (const tiers of ladders) {
      expect(tiers).toHaveLength(6);
      expect(tiers.map((tier) => [tier.min, tier.max])).toEqual([
        [1, 2],
        [3, 4],
        [5, 6],
        [7, 8],
        [9, 9],
        [10, 10],
      ]);
    }
  });

  it('każda ranga 1–10 trafia dokładnie w jeden szczebel, a ranga 0 w żaden', () => {
    const ladders: readonly (readonly CpredAbilityTier[])[] = [
      CPRED_CHARISMA_TIERS,
      CPRED_OPERATOR_TIERS,
      CPRED_CREDIBILITY_TIERS,
      CPRED_MOTO_FLEET,
    ];
    for (const tiers of ladders) {
      expect(cpredAbilityTierAt(tiers, 0)).toBeNull();
      for (let rank = 1; rank <= 10; rank += 1) {
        const matches = tiers.filter((tier) => rank >= tier.min && rank <= tier.max);
        expect(matches).toHaveLength(1);
      }
    }
  });

  it('„droga do tej rangi" to szczeble, które postać minęła', () => {
    expect(cpredAbilityTiersUpTo(CPRED_CHARISMA_TIERS, 5).map((tier) => tier.id)).toEqual([
      'charisma-1-2',
      'charisma-3-4',
      'charisma-5-6',
    ]);
  });
});

describe('Efekt Charyzmy (s. 144)', () => {
  it('PT zależy od liczebności publiczności, nie od rangi', () => {
    expect(CPRED_CHARISMA_DV).toEqual({ single: 8, small: 10, large: 12 });
  });

  it('duża grupa fanów nie istnieje przy randze 1 i 2', () => {
    expect(cpredCharismaEffect(1, 'large')).toBeNull();
    expect(cpredCharismaEffect(2, 'large')).toBeNull();
    expect(cpredCharismaEffect(3, 'large')).not.toBeNull();
  });

  it('prośba do nieistniejącej publiczności nie dochodzi do kości', () => {
    expect(cpredCharismaProblem(2, 'large', 'favour')).toBe('NO_CROWD');
    // Robienie nowych fanów tabeli nie pyta — „chyba że czynnie cię nie lubią".
    expect(cpredCharismaProblem(2, 'large', 'fans')).toBeNull();
  });

  it('bez Zdolności nie ma o czym rozmawiać, a bzdurna publiczność to zły request', () => {
    expect(cpredCharismaProblem(null, 'single', 'favour')).toBe('NO_ABILITY');
    expect(cpredCharismaProblem(4, 'stadium', 'favour')).toBe('BAD_VALUE');
    expect(cpredCharismaProblem(4, 'single', 'sing')).toBe('BAD_VALUE');
  });

  it('każdy szczebel od trójki w górę mówi coś o wszystkich trzech publicznościach', () => {
    for (const tier of CPRED_CHARISMA_TIERS.slice(1)) {
      expect(tier.effects.single).toBeTruthy();
      expect(tier.effects.small).toBeTruthy();
      expect(tier.effects.large).toBeTruthy();
    }
    expect(cpredCharismaTierAt(10)?.venues).toContain('stadiony');
  });
});

describe('Znajomości: Zasięg i Targowanie się (s. 159–161)', () => {
  it('pasmo rośnie z rangą, a szczebel Nocnego zatrzymuje pasmo poprzedniego', () => {
    expect(cpredOperatorReach(0)).toBeNull();
    expect(cpredOperatorReach(2)).toBe('everyday');
    expect(cpredOperatorReach(4)).toBe('expensive');
    // 5–6 drukuje Nocny zamiast pasma: awans nie może odebrać Zasięgu.
    expect(cpredOperatorReach(5)).toBe('expensive');
    expect(cpredOperatorReach(6)).toBe('expensive');
    expect(cpredOperatorReach(8)).toBe('veryExpensive');
    expect(cpredOperatorReach(9)).toBe('luxury');
    expect(cpredOperatorReach(10)).toBe('superLuxury');
  });

  it('każdy szczebel otwiera dokładnie jeden targ i wszystkie sześć są różne', () => {
    const ids = CPRED_OPERATOR_TIERS.map((tier) => tier.dealId);
    expect(new Set(ids).size).toBe(6);
    expect(ids).toEqual(CPRED_HAGGLE_DEALS.map((deal) => deal.id));
  });

  it('menu targów to „poziom Znajomości lub niższy"', () => {
    expect(cpredHaggleDeals(1).map((deal) => deal.id)).toEqual(['percent10']);
    expect(cpredHaggleDeals(9).map((deal) => deal.id)).toEqual([
      'percent10',
      'sixthFree',
      'crewRaise',
      'halfLater',
      'percent20',
    ]);
    expect(cpredHaggleDeals(10)).toHaveLength(6);
  });

  it('VTT liczy dwa targi z sześciu i tylko te dwa niosą procent', () => {
    const counted = CPRED_HAGGLE_DEALS.filter((deal) => deal.discount !== undefined);
    expect(counted.map((deal) => [deal.id, deal.discount])).toEqual([
      ['percent10', 10],
      ['percent20', 20],
    ]);
  });

  it('odmawia targu ponad rangę, nieznanego i bzdurnego modyfikatora', () => {
    expect(cpredHaggleProblem(null, 'percent10', 0)).toBe('NO_ABILITY');
    expect(cpredHaggleProblem(3, 'percent20', 0)).toBe('DEAL_ABOVE_RANK');
    expect(cpredHaggleProblem(3, 'kolano', 0)).toBe('UNKNOWN_DEAL');
    expect(cpredHaggleProblem(3, 'percent10', -1)).toBe('BAD_VALUE');
    expect(cpredHaggleProblem(3, 'percent10', 999)).toBe('BAD_VALUE');
    expect(cpredHaggleProblem(3, 'percent10', 14)).toBeNull();
  });

  it('zniżka schodzi z ceny i zaokrągla się w górę', () => {
    expect(cpredHaggledPrice(100, 10)).toBe(90);
    expect(cpredHaggledPrice(100, 20)).toBe(80);
    expect(cpredHaggledPrice(55, 10)).toBe(50); // 49,5 → 50
    expect(cpredHaggledPrice(500, 0)).toBe(500);
  });

  it('dobity targ czytany z bazy bierze procent z tabeli, gdy go nie zapisano', () => {
    expect(readCpredHaggle({ dealId: 'percent20' })).toEqual({
      dealId: 'percent20',
      discount: 20,
      note: '',
    });
    expect(readCpredHaggle({ dealId: 'crewRaise' })?.discount).toBe(0);
    expect(readCpredHaggle({ dealId: 'nie-ma' })).toBeNull();
    expect(readCpredHaggle(null)).toBeNull();
  });
});

describe('Moto (s. 161)', () => {
  it('dokłada się do sześciu Umiejętności i do żadnej innej', () => {
    expect([...CPRED_MOTO_SKILL_IDS].sort()).toEqual([
      'air-vehicle-tech',
      'driving',
      'land-vehicle-tech',
      'pilot-air-vehicle',
      'pilot-sea-vehicle',
      'sea-vehicle-tech',
    ]);
  });

  it('poziom czyta się tylko z karty Nomady', () => {
    expect(cpredSheetMoto(sheet('nomad', 4), registry)).toBe(4);
    expect(cpredSheetMoto(sheet('solo', 4), registry)).toBe(0);
  });

  it('Tabor ma tyle wpisów, ile poziomów, a wpis nie bywa z wyższej kategorii', () => {
    const rows = (count: number, level = 1) =>
      Array.from({ length: count }, (_, index) => ({
        id: `t${index}`,
        kind: 'vehicle' as const,
        name: 'Motocykl',
        level,
        notes: '',
      }));
    expect(cpredFleetProblem(rows(3), 3)).toBeNull();
    expect(cpredFleetProblem(rows(4), 3)).toBe('TOO_MANY');
    expect(cpredFleetProblem(rows(1, 5), 3)).toBe('LEVEL_ABOVE_RANK');
    // Karta bez Moto może mieć pusty Tabor i nie może mieć żadnego wpisu.
    expect(cpredFleetProblem([], null)).toBeNull();
    expect(cpredFleetProblem(rows(1), null)).toBe('NO_ABILITY');
  });

  it('sprawdzenie na scalonej karcie czyta rangę z Roli', () => {
    const nomad = {
      ...sheet('nomad', 1),
      fleet: readCpredFleet([{ id: 'a', kind: 'vehicle', name: 'Skuter', level: 1 }]),
    };
    expect(cpredFleetSheetProblem(nomad, registry)).toBeNull();
    expect(cpredFleetSheetProblem({ ...nomad, roleAbilityRank: 1, roleId: 'solo' }, registry)).toBe(
      'NO_ABILITY',
    );
  });

  it('odczyt Taboru odsiewa wiersze bez nazwy i przycina poziom do drabiny', () => {
    const rows = readCpredFleet([
      { id: 'a', kind: 'upgrade', name: '  Opancerzenie kadłuba  ', level: 99 },
      { id: 'b', kind: 'vehicle', name: '' },
      { kind: 'vehicle', name: 'Bez id' },
      { id: 'c', kind: 'rakieta', name: 'Aerozep', level: 0 },
    ]);
    expect(rows).toEqual([
      { id: 'a', kind: 'upgrade', name: 'Opancerzenie kadłuba', level: 10, notes: '' },
      { id: 'c', kind: 'vehicle', name: 'Aerozep', level: 1, notes: '' },
    ]);
  });
});

describe('Wiarygodność (s. 151–153)', () => {
  it('szansa Rzetelności idzie 2, 3, 4, 5, 6, 7 przez sześć szczebli', () => {
    expect(CPRED_CREDIBILITY_TIERS.map((tier) => tier.reliability)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(cpredReliabilityChance(1, 'none')).toBe(2);
    expect(cpredReliabilityChance(10, 'none')).toBe(7);
    expect(cpredReliabilityChance(0, 'none')).toBe(0);
  });

  it('dowody kumulują się i nigdy nie przebijają dziesiątki', () => {
    expect(cpredReliabilityChance(5, 'solid')).toBe(5);
    expect(cpredReliabilityChance(5, 'irrefutable')).toBe(7);
    expect(cpredReliabilityChance(10, 'irrefutable')).toBe(10);
  });

  it('„szansa N na 10" to wynik kości nie większy niż N', () => {
    expect(cpredAudienceBelieves(2, 2)).toBe(true);
    expect(cpredAudienceBelieves(3, 2)).toBe(false);
    expect(cpredAudienceBelieves(10, 10)).toBe(true);
    expect(cpredAudienceBelieves(1, 0)).toBe(false);
  });

  it('pogłoska to najwyższy pobity próg z kolumny Zasłyszane', () => {
    expect(CPRED_RUMOUR_TIERS.map((tier) => [tier.passive, tier.active])).toEqual([
      [7, 13],
      [9, 15],
      [11, 17],
      [13, 21],
    ]);
    expect(cpredRumourHeard(6)).toBeNull();
    expect(cpredRumourHeard(7)?.id).toBe('vague');
    expect(cpredRumourHeard(10)?.id).toBe('typical');
    expect(cpredRumourHeard(40)?.id).toBe('detailed');
  });
});
