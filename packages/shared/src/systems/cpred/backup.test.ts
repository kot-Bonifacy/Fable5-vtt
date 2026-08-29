import { describe, expect, it } from 'vitest';
import {
  CPRED_BACKUP_TIERS,
  cpredBackupCall,
  cpredBackupDue,
  cpredBackupProfile,
  cpredBackupTier,
  cpredBackupTierAfter,
  cpredBackupTierAt,
  cpredBackupTiersFor,
  describeBackupPending,
  describeBackupTier,
  readCpredCombatState,
} from './roleability.js';

/**
 * Wsparcie Stróża Prawa (etap 30c, s. 158–159).
 *
 * Trzy rzeczy warte testu i żadnej więcej: że tabela ma sześć kategorii i te
 * liczby, co w książce; że rzut wezwania czyta się dokładnie tak, jak jest
 * napisany („tyle, ile wynosi twój poziom, **lub mniej**"); i że szóstka robi
 * dwie różne rzeczy zależnie od rangi.
 */

describe('tabela poziomów Wsparcia', () => {
  it('ma sześć kategorii, a nie pięć', () => {
    expect(CPRED_BACKUP_TIERS).toHaveLength(6);
  });

  it('pokrywa poziomy 1–10 bez dziur i bez zakładek', () => {
    for (let level = 1; level <= 10; level += 1) {
      const matches = CPRED_BACKUP_TIERS.filter(
        (tier) => level >= tier.minLevel && level <= tier.maxLevel,
      );
      expect(matches).toHaveLength(1);
    }
    expect(cpredBackupTierAt(0)).toBeNull();
    expect(cpredBackupTierAt(11)).toBeNull();
  });

  it('niesie liczby z podręcznika', () => {
    expect(cpredBackupTierAt(1)).toMatchObject({ combatValue: 8, sp: 7, hp: 20, count: 4 });
    expect(cpredBackupTierAt(4)).toMatchObject({ combatValue: 10, sp: 7, hp: 25, count: 4 });
    expect(cpredBackupTierAt(6)).toMatchObject({ combatValue: 14, sp: 13, hp: 35, count: 2 });
    expect(cpredBackupTierAt(8)).toMatchObject({ combatValue: 16, sp: 15, hp: 50, count: 1 });
    expect(cpredBackupTierAt(9)).toMatchObject({ combatValue: 15, sp: 18, hp: 35, count: 2 });
    expect(cpredBackupTierAt(10)).toMatchObject({ combatValue: 14, sp: 11, hp: 35, count: 2 });
  });

  it('daje Wartość bojową w Umiejętności do ataku i do obrony', () => {
    const tier = cpredBackupTierAt(6)!;
    const profile = cpredBackupProfile(tier);
    // „Umiejętność bazowa używana do ataku i obrony" — jedna liczba w obu.
    expect(profile.skillLevel).toBe(14);
    expect(profile.evasion).toBe(14);
    // Cechy zerowe, bo Wartość bojowa to już suma Cechy i Umiejętności.
    expect(profile.ref).toBe(0);
    expect(profile.dex).toBe(0);
    // RUCH i BC drukuje tabela, więc nie znikają.
    expect(profile.move).toBe(4);
    expect(profile.body).toBe(4);
    // „Funkcjonariusze Wsparcia nie mogą Unikać pocisków."
    expect(profile.noBulletDodge).toBe(true);
  });

  it('mówi, kogo wolno wezwać przy danej randze', () => {
    expect(cpredBackupTiersFor(0)).toHaveLength(0);
    expect(cpredBackupTiersFor(4).map((tier) => tier.id)).toEqual(['corp-security', 'beat-cops']);
    expect(cpredBackupTiersFor(10)).toHaveLength(6);
  });

  it('zna kategorię wyżej, a nad szczytem nie ma nic', () => {
    expect(cpredBackupTierAfter(cpredBackupTierAt(4)!)?.id).toBe('state-police');
    expect(cpredBackupTierAfter(cpredBackupTierAt(10)!)).toBeNull();
  });

  it('opisuje kategorię jedną linijką', () => {
    expect(describeBackupTier(cpredBackupTierAt(8)!)).toBe(
      'Wartość bojowa 16 · OB 15 · PW 50 · RUCH 6 · BC 6',
    );
  });
});

describe('rzut wezwania', () => {
  it('udaje się na wyniku równym randze albo niższym', () => {
    expect(cpredBackupCall(4, 3, 4, 2).answered).toBe(true);
    expect(cpredBackupCall(4, 3, 5, 2).answered).toBe(false);
    expect(cpredBackupCall(4, 3, 1, 2).answered).toBe(true);
  });

  it('nie wpuszcza kategorii wyższej niż ranga… przez samą rangę', () => {
    // Poziom 9 przy randze 4 to nie jest wezwanie, tylko życzenie: gałąź
    // odmowy siedzi na serwerze, ale rzut i tak nie daje nic sensownego.
    expect(cpredBackupCall(4, 3, 4, 3)).toMatchObject({ tierId: 'beat-cops', rounds: 3 });
  });

  it('milczenie w eterze nie niesie ani kategorii, ani rund', () => {
    expect(cpredBackupCall(2, 1, 7, 6)).toEqual({
      answered: false,
      tierId: null,
      rounds: null,
      escalated: false,
      secondGroup: false,
    });
  });

  it('szóstka podnosi kategorię — także ponad rangę wzywającego', () => {
    const outcome = cpredBackupCall(9, 9, 3, 6);
    expect(outcome).toMatchObject({ answered: true, escalated: true, secondGroup: false });
    // Ranga 9 wzywa C-SWAT, szóstka przysyła federalnych.
    expect(outcome.tierId).toBe('federal');
    expect(outcome.rounds).toBe(6);
  });

  it('przy randze 10 szóstka przysyła dwie grupy zamiast awansu', () => {
    const outcome = cpredBackupCall(10, 10, 8, 6);
    expect(outcome.secondGroup).toBe(true);
    // Wezwana kategoria zostaje ta, o którą prosił Stróż Prawa.
    expect(outcome.tierId).toBe('federal');
  });

  it('przy randze 10 dwie grupy dotyczą też niższego wezwania', () => {
    // „chyba że poziom twojej Zdolności wynosi 10" — warunek stoi na randze,
    // nie na wezwanej kategorii.
    const outcome = cpredBackupCall(10, 1, 5, 6);
    expect(outcome).toMatchObject({ tierId: 'corp-security', secondGroup: true });
  });

  it('poza szóstką nic się nie podnosi', () => {
    for (const roll of [1, 2, 3, 4, 5]) {
      expect(cpredBackupCall(9, 9, 1, roll)).toMatchObject({
        tierId: 'c-swat',
        escalated: false,
        rounds: roll,
      });
    }
  });
});

describe('stan walki: kto jest w drodze', () => {
  const state = {
    backup: [
      {
        id: 'a',
        tierId: 'beat-cops',
        arriveAtRound: 5,
        callerTokenId: 't1',
        callerName: 'Slack',
      },
      {
        id: 'b',
        tierId: 'federal',
        arriveAtRound: 9,
        callerTokenId: null,
        callerName: 'Slack',
        awaitingSecond: true as const,
      },
    ],
  };

  it('wpuszcza tylko tych, których runda już nadeszła', () => {
    expect(cpredBackupDue(state, 4)).toHaveLength(0);
    expect(cpredBackupDue(state, 5).map((row) => row.id)).toEqual(['a']);
  });

  it('nie stawia grupy, na którą MG jeszcze nie odpowiedział', () => {
    // Wiersz z pytaniem czeka na MG nawet po swojej rundzie — inaczej VTT
    // zgadłby drugą kategorię, czego podręcznik nie robi.
    expect(cpredBackupDue(state, 12).map((row) => row.id)).toEqual(['a']);
  });

  it('czyta kolumnę tolerancyjnie i wyrzuca śmieci', () => {
    expect(readCpredCombatState(null).backup).toHaveLength(0);
    expect(readCpredCombatState('nie-json').backup).toHaveLength(0);
    expect(readCpredCombatState('{"backup":"nie-lista"}').backup).toHaveLength(0);
    const parsed = readCpredCombatState(
      JSON.stringify({
        backup: [
          { id: 'ok', tierId: 'marshal', arriveAtRound: 3, callerName: 'Slack' },
          { id: 'zła-kategoria', tierId: 'nie-ma', arriveAtRound: 3 },
          { tierId: 'marshal', arriveAtRound: 3 },
        ],
      }),
    );
    expect(parsed.backup).toHaveLength(1);
    expect(parsed.backup[0]).toMatchObject({ id: 'ok', callerTokenId: null });
  });

  it('opisuje wiersz nazwą kategorii i liczbą figur', () => {
    expect(describeBackupPending(state.backup[0]!)).toBe('Miejscowe krawężniki ×4');
  });

  it('zna kategorię po id', () => {
    expect(cpredBackupTier('marshal')?.count).toBe(1);
    expect(cpredBackupTier('nie-ma')).toBeNull();
  });
});
