import { describe, expect, it } from 'vitest';
import {
  CPRED_LOYALTY_CHANGES,
  CPRED_LOYALTY_SESSION_CAP,
  CPRED_TEAM_MAX,
  CPRED_TEAM_PROFESSIONS,
  cpredLoyaltyAfterSession,
  cpredLoyaltyChange,
  cpredLoyaltyObeys,
  cpredLoyaltyTreacherous,
  cpredStartingLoyalty,
  cpredTeamCyberdeck,
  cpredTeamProblem,
  cpredTeamProfession,
  cpredTeamSlots,
  cpredTeamStats,
  cpredTeamworkPerks,
  describeTeamMember,
  readCpredTeam,
} from './roleability.js';
import {
  buildCpredRegistry,
  createDefaultCharacterData,
  cyberdeckSlotsUsed,
  mergeCharacterData,
  parseCharacterData,
} from './character.js';
import type { CompendiumEntry, ProgramEntry } from './compendium.js';

/**
 * Praca Zespołowa Korpo (etap 30c, s. 153–157).
 *
 * Testowane jest to, co da się przeczytać ze strony i pomylić w kodzie: ile
 * etatów daje ranga, co robi Test Lojalności (**mniej niż**, nie „co najwyżej"),
 * i czy pięć pakietów Umiejętności ma po sześć wierszy Cech.
 */

describe('etaty rosnące z rangą', () => {
  it('pierwszy pracownik dochodzi na 3. poziomie, nie wcześniej', () => {
    expect(cpredTeamSlots(2)).toBe(0);
    expect(cpredTeamSlots(3)).toBe(1);
    expect(cpredTeamSlots(4)).toBe(1);
  });

  it('drugi na 5., trzeci na 9., i na tym koniec', () => {
    expect(cpredTeamSlots(5)).toBe(2);
    expect(cpredTeamSlots(8)).toBe(2);
    expect(cpredTeamSlots(9)).toBe(3);
    expect(cpredTeamSlots(10)).toBe(CPRED_TEAM_MAX);
  });

  it('wypisuje przywileje osiągnięte przez tę rangę', () => {
    const perks = cpredTeamworkPerks(6).map((perk) => perk.level);
    expect(perks).toEqual([1, 2, 3, 5, 6]);
    expect(cpredTeamworkPerks(0)).toHaveLength(0);
  });
});

describe('pięć zawodów HR-u', () => {
  it('każdy ma sześć wierszy tabeli 1k6', () => {
    expect(CPRED_TEAM_PROFESSIONS).toHaveLength(5);
    for (const profession of CPRED_TEAM_PROFESSIONS) {
      expect(profession.rows).toHaveLength(6);
    }
  });

  it('Cechy mieszczą się w zakresie, w jakim podręcznik je drukuje', () => {
    for (const profession of CPRED_TEAM_PROFESSIONS) {
      for (const row of profession.rows) {
        for (const value of Object.values(row)) {
          expect(value).toBeGreaterThanOrEqual(2);
          expect(value).toBeLessThanOrEqual(8);
        }
      }
    }
  });

  it('czyta wiersz po rzucie 1k6 i nic poza nim', () => {
    const bodyguard = cpredTeamProfession('bodyguard')!;
    expect(cpredTeamStats(bodyguard, 1)).toMatchObject({ int: 3, ref: 7, body: 8 });
    expect(cpredTeamStats(bodyguard, 6)).toMatchObject({ int: 5, ref: 7, body: 7 });
    expect(cpredTeamStats(bodyguard, 0)).toBeNull();
    expect(cpredTeamStats(bodyguard, 7)).toBeNull();
  });

  it('tylko Netrunner przynosi ze sobą Zdolność Specjalną', () => {
    const withAbility = CPRED_TEAM_PROFESSIONS.filter((profession) => profession.ability !== null);
    expect(withAbility.map((profession) => profession.id)).toEqual(['netrunner']);
    // „Umiejętności +2: Interfejs (Zdolność Specjalna Netrunnera)" — ranga 2.
    expect(withAbility[0]!.ability).toEqual({ name: 'Interfejs', rank: 2 });
  });

  it('nikt nie dostaje Interfejsu jako Umiejętności', () => {
    for (const profession of CPRED_TEAM_PROFESSIONS) {
      expect(Object.keys(profession.skills)).not.toContain('interface');
      // Język jedzie Ścieżką Życia od 25b, więc w mapie specjalizacji go nie ma.
      expect(Object.keys(profession.skillSpecialties)).not.toContain('language');
      expect(profession.language).toBe('Slang uliczny');
    }
  });

  it('każdy pakiet ma poziomy z trzech pasm i nic poza nimi', () => {
    for (const profession of CPRED_TEAM_PROFESSIONS) {
      for (const level of Object.values(profession.skills)) {
        expect([2, 4, 6]).toContain(level);
      }
    }
  });
});

describe('Lojalność', () => {
  it('startuje na 1k6 + 1', () => {
    expect(cpredStartingLoyalty(1)).toBe(2);
    expect(cpredStartingLoyalty(6)).toBe(7);
  });

  it('Test udaje się, gdy 1k6 wypadnie MNIEJ niż Lojalność', () => {
    expect(cpredLoyaltyObeys(3, 4)).toBe(true);
    // Remis nie wystarcza — to jedyne miejsce w tym projekcie, gdzie tak jest,
    // i dlatego ma własny test.
    expect(cpredLoyaltyObeys(4, 4)).toBe(false);
    expect(cpredLoyaltyObeys(5, 4)).toBe(false);
  });

  it('Lojalność 1 nie przechodzi nigdy', () => {
    for (const roll of [1, 2, 3, 4, 5, 6]) {
      expect(cpredLoyaltyObeys(roll, 1)).toBe(false);
    }
  });

  it('zero albo mniej to czynna zdrada', () => {
    expect(cpredLoyaltyTreacherous(1)).toBe(false);
    expect(cpredLoyaltyTreacherous(0)).toBe(true);
    expect(cpredLoyaltyTreacherous(-3)).toBe(true);
  });

  it('między sesjami ścina się do dziesiątki, ale nie podnosi', () => {
    expect(cpredLoyaltyAfterSession(14)).toBe(CPRED_LOYALTY_SESSION_CAP);
    expect(cpredLoyaltyAfterSession(10)).toBe(10);
    expect(cpredLoyaltyAfterSession(-2)).toBe(-2);
  });

  it('tabela ma sześć zysków i sześć strat', () => {
    expect(CPRED_LOYALTY_CHANGES.filter((row) => row.value > 0)).toHaveLength(6);
    expect(CPRED_LOYALTY_CHANGES.filter((row) => row.value < 0)).toHaveLength(6);
    expect(cpredLoyaltyChange('abandoned')?.value).toBe(-8);
    expect(cpredLoyaltyChange('risk')?.value).toBe(8);
    expect(cpredLoyaltyChange('nie-ma')).toBeNull();
  });
});

describe('lista zespołu na karcie Korpo', () => {
  const member = { characterId: 'c1', professionId: 'bodyguard', loyalty: 5 };

  it('odsiewa wiersze bez id, z nieznanym zawodem i duplikaty', () => {
    const team = readCpredTeam([
      member,
      { characterId: 'c1', professionId: 'agent', loyalty: 9 },
      { characterId: 'c2', professionId: 'nie-ma', loyalty: 3 },
      { professionId: 'agent', loyalty: 3 },
      'śmieć',
    ]);
    expect(team).toHaveLength(1);
    expect(team[0]).toEqual(member);
  });

  it('nigdy nie zwraca więcej wierszy, niż zespół może mieć', () => {
    const many = Array.from({ length: 8 }, (_unused, index) => ({
      characterId: `c${index}`,
      professionId: 'agent',
      loyalty: 4,
    }));
    expect(readCpredTeam(many)).toHaveLength(CPRED_TEAM_MAX);
  });

  it('odmawia listy większej, niż ranga płaci', () => {
    expect(cpredTeamProblem([member], 3)).toBeNull();
    expect(cpredTeamProblem([member], 2)).toBe('TEAM_FULL');
    expect(cpredTeamProblem([member], null)).toBe('NO_ABILITY');
    // Pusta lista jest legalna zawsze — także u Roli bez tej Zdolności.
    expect(cpredTeamProblem([], null)).toBeNull();
  });

  it('opisuje wiersz zawodem i Lojalnością', () => {
    expect(describeTeamMember(member)).toBe('Firmowy ochroniarz · Lojalność 5');
  });
});

/**
 * Cyberdek Korporacyjnego netrunnera (13.09.2026). Do tej daty był zdaniem
 * w notatkach, a `netrun:*` odmawia karcie bez deku — czyli netrunner z HR-u,
 * jedyny powód, dla którego pracownik jest pełną kartą, nie mógł sieciować.
 */
describe('cyberdek z pakietu Korporacyjnego netrunnera', () => {
  const netrunner = cpredTeamProfession('netrunner')!;
  const registry = buildCpredRegistry({ skills: [] }, { roles: [] });

  function attacker(id: string, name: string, fields: Partial<ProgramEntry> = {}): ProgramEntry {
    return {
      id,
      category: 'program',
      name,
      cost: 100,
      programClass: 'attacker',
      target: 'antiProgram',
      atk: 3,
      def: 0,
      rez: 0,
      ...fields,
    };
  }

  const deckEntry: CompendiumEntry = {
    id: 'gear.cyberdek-zwyklej-jakosci',
    category: 'gear',
    name: 'Cyberdek (zwykłej jakości)',
    cost: 500,
    deckSlots: 7,
  };
  const sword = attacker('program.miecz', 'Miecz');
  const killer = attacker('program.zabojca', 'Zabójca', { blackIce: true, per: 6, speed: 4 });
  const worm: ProgramEntry = {
    id: 'program.robak',
    category: 'program',
    name: 'Robak',
    cost: 50,
    programClass: 'booster',
    atk: 0,
    def: 0,
    rez: 7,
  };
  const armor: ProgramEntry = {
    id: 'program.pancerz',
    category: 'program',
    name: 'Pancerz',
    cost: 50,
    programClass: 'defender',
    atk: 0,
    def: 0,
    rez: 7,
  };

  it('pakiet niesie dek jako dane, a nie jako zdanie w osprzęcie', () => {
    expect(netrunner.cyberdeck).toEqual({
      name: 'Cyberdek (zwykłej jakości)',
      slots: 7,
      programs: ['Miecz', 'Zabójca', 'Robak', 'Pancerz'],
    });
    expect(netrunner.gear).not.toContain('Cyberdek');
    const others = CPRED_TEAM_PROFESSIONS.filter((profession) => profession.id !== 'netrunner');
    expect(others.every((profession) => profession.cyberdeck === null)).toBe(true);
  });

  it('wkłada cztery Programy z kompendium, z liczbami przepisanymi z wpisu', () => {
    const { deck, missing } = cpredTeamCyberdeck(netrunner.cyberdeck!, [
      deckEntry,
      sword,
      killer,
      worm,
      armor,
    ]);
    expect(missing).toEqual([]);
    expect(deck).toMatchObject({
      compendiumId: 'gear.cyberdek-zwyklej-jakosci',
      name: 'Cyberdek (zwykłej jakości)',
      slots: 7,
    });
    expect(deck.installed.map((row) => [row.name, row.slotCost])).toEqual([
      ['Miecz', 1],
      ['Zabójca', 2],
      ['Robak', 1],
      ['Pancerz', 1],
    ]);
    // Czarny LOD zajmuje dwa gniazda i niesie PER/PRĘ — liczby z wpisu, nie zgadnięte.
    expect(deck.installed[1]).toMatchObject({
      kind: 'program',
      compendiumId: 'program.zabojca',
      program: { blackIce: true, per: 6, speed: 4, target: 'antiProgram' },
    });
    expect(cyberdeckSlotsUsed(deck)).toBe(5);
  });

  it('Programu bez wpisu nie zmyśla — oddaje jego nazwę do notatek', () => {
    const { deck, missing } = cpredTeamCyberdeck(netrunner.cyberdeck!, [sword, killer, worm]);
    expect(missing).toEqual(['Pancerz']);
    expect(deck.installed.map((row) => row.name)).toEqual(['Miecz', 'Zabójca', 'Robak']);
    // Deku nie ma w kompendium, a mimo to jest: wydrukowane 7 gniazd, bez odnośnika.
    expect(deck).toEqual({
      name: 'Cyberdek (zwykłej jakości)',
      slots: 7,
      installed: deck.installed,
    });
  });

  it('szuka po nazwie bez względu na wielkość liter i spacje', () => {
    const shouted = attacker('program.miecz-mg', '  MIECZ ');
    const { deck, missing } = cpredTeamCyberdeck(netrunner.cyberdeck!, [shouted]);
    expect(deck.installed.map((row) => row.compendiumId)).toEqual(['program.miecz-mg']);
    expect(missing).toEqual(['Zabójca', 'Robak', 'Pancerz']);
  });

  it('nie przepełnia deku, gdy MG powiększył Program w kompendium', () => {
    const huge = attacker('program.miecz', 'Miecz', { slots: 7 });
    const { deck, missing } = cpredTeamCyberdeck(netrunner.cyberdeck!, [huge, killer, worm, armor]);
    expect(deck.installed.map((row) => row.name)).toEqual(['Miecz']);
    expect(missing).toEqual(['Zabójca', 'Robak', 'Pancerz']);
    expect(cyberdeckSlotsUsed(deck)).toBeLessThanOrEqual(deck.slots);
  });

  it('złożony dek przechodzi odczyt karty bez strat', () => {
    const { deck } = cpredTeamCyberdeck(netrunner.cyberdeck!, [
      deckEntry,
      sword,
      killer,
      worm,
      armor,
    ]);
    const sheet = mergeCharacterData(createDefaultCharacterData(), { cyberdeck: deck });
    expect(parseCharacterData(JSON.stringify(sheet), registry).cyberdeck).toEqual(deck);
  });
});
