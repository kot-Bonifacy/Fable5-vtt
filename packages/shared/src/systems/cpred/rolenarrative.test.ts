import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY, gameWeekIndex } from '../../gametime.js';
import { buildCpredRegistry, createDefaultCharacterData, mergeCharacterData } from './character.js';
import { planCpredRoll } from './rolls.js';
import { CPRED_BACKUP_TIERS } from './roleability.js';
import {
  CPRED_FANS_MAX,
  cpredFanGroupBlocked,
  cpredFansAfterRefusal,
  cpredFansUnblocked,
  cpredFansWithGroup,
  cpredFavourProblem,
  readCpredFans,
  type CpredFanGroup,
} from './rolefans.js';
import {
  CPRED_PUBLICATIONS_MAX,
  cpredPublicationProblem,
  cpredPublicationsWith,
  cpredRumourRollsThisWeek,
  cpredRumourSearchSkills,
  cpredRumourWeekAfterRoll,
  cpredRumourWeekSweep,
  readCpredPublications,
  readCpredRumourWeek,
  type CpredPublication,
} from './rolerumours.js';
import { cpredBackupCallCounts, cpredBackupCallsWith, readCpredBackupCalls } from './backuplog.js';

/**
 * Etap 71f — czas i zasoby narracyjne Ról (G27–G32, P2): fani Rockera
 * z blokadą tygodnia, licznik Pogłosek, rejestr publikacji, licznik wezwań
 * Wsparcia i druga broń funkcjonariusza.
 */

/** Poniedziałek 00:00 — 5 stycznia 1970 był poniedziałkiem. */
const MONDAY = 4 * MINUTES_PER_DAY;
const WEEK = 7 * MINUTES_PER_DAY;

const registry = buildCpredRegistry(
  {
    skills: [
      { id: 'library', name: 'Przeszukiwanie baz danych', stat: 'int' },
      { id: 'talk', name: 'Konwersacja', stat: 'emp' },
      { id: 'handgun', name: 'Broń krótka', stat: 'ref' },
    ],
  },
  {
    roles: [
      { id: 'rockerboy', name: 'Rocker', ability: 'Efekt Charyzmy' },
      { id: 'media', name: 'Media', ability: 'Wiarygodność' },
    ],
  },
);

describe('tydzień kalendarza świata', () => {
  it('zaczyna się w poniedziałek i trwa do niedzieli', () => {
    expect(gameWeekIndex(MONDAY)).toBe(gameWeekIndex(MONDAY + WEEK - 1));
    expect(gameWeekIndex(MONDAY - 1)).toBe(gameWeekIndex(MONDAY) - 1);
    expect(gameWeekIndex(MONDAY + WEEK)).toBe(gameWeekIndex(MONDAY) + 1);
  });
});

describe('fani Rockera (G27; ROC-08, ROC-09)', () => {
  const fans: CpredFanGroup[] = [
    { id: 'a', name: 'Barman', audience: 'single' },
    { id: 'b', name: 'Ekipa z baru', audience: 'small' },
  ];

  it('prośba potrzebuje grupy tej wielkości z karty', () => {
    expect(cpredFavourProblem(fans, 'a', 'single', MONDAY)).toBeNull();
    expect(cpredFavourProblem(fans, 'a', 'small', MONDAY)).toBe('NO_FAN_GROUP');
    expect(cpredFavourProblem(fans, 'nikt', 'single', MONDAY)).toBe('NO_FAN_GROUP');
    expect(cpredFavourProblem([], undefined, 'single', MONDAY)).toBe('NO_FAN_GROUP');
  });

  it('nieudana prośba zamyka tę grupę na 7 dni kalendarza — i tylko tę', () => {
    const after = cpredFansAfterRefusal(fans, 'a', MONDAY, '  schowajcie mnie  ');
    expect(after[0]).toEqual({
      id: 'a',
      name: 'Barman',
      audience: 'single',
      blockedUntilMinute: MONDAY + WEEK,
      blockedWhat: 'schowajcie mnie',
    });
    expect(after[1]).toEqual(fans[1]);
    expect(cpredFavourProblem(after, 'a', 'single', MONDAY + WEEK - 1)).toBe('FANS_REFUSED');
    // Termin mija sam — bez przemiatania zegara.
    expect(cpredFavourProblem(after, 'a', 'single', MONDAY + WEEK)).toBeNull();
    expect(cpredFanGroupBlocked(after[0]!, MONDAY + WEEK)).toBe(false);
    // Planer bez zegara blokady nie sprawdza — rozstrzyga serwer.
    expect(cpredFavourProblem(after, 'a', 'single', null)).toBeNull();
  });

  it('MG zdejmuje blokadę przed czasem', () => {
    const blocked = cpredFansAfterRefusal(fans, 'a', MONDAY, 'nocleg');
    expect(cpredFansUnblocked(blocked, 'a')).toEqual(fans);
  });

  it('nowa grupa dostaje nazwę domyślną, gdy gracz nie wpisał własnej; lista ma sufit', () => {
    const added = cpredFansWithGroup(fans, { id: 'c', name: '  ', audience: 'large' });
    expect(added?.[2]).toEqual({ id: 'c', name: 'Nowi fani — duża grupa', audience: 'large' });
    const full = Array.from({ length: CPRED_FANS_MAX }, (_, index) => ({
      id: `g${index}`,
      name: `Grupa ${index}`,
      audience: 'single' as const,
    }));
    expect(cpredFansWithGroup(full, { id: 'x', name: 'Ktoś', audience: 'single' })).toBeNull();
  });

  it('czytnik przyjmuje starą kartę i odrzuca śmieci', () => {
    expect(readCpredFans(undefined)).toEqual([]);
    expect(
      readCpredFans([
        { id: 'a', name: ' Barman ', audience: 'single', blockedWhat: 'bez terminu' },
        { id: 'a', name: 'Duplikat', audience: 'single' },
        { id: 'b', name: '', audience: 'small' },
        { id: 'c', name: 'Zła wielkość', audience: 'tłum' },
        'śmieć',
      ]),
    ).toEqual([{ id: 'a', name: 'Barman', audience: 'single' }]);
    expect(createDefaultCharacterData().fans).toEqual([]);
    // Zapis i odczyt przez łatę karty nie gubi blokady.
    const blocked = cpredFansAfterRefusal(fans, 'b', MONDAY, 'transport');
    const merged = mergeCharacterData(createDefaultCharacterData(), { fans: blocked });
    expect(readCpredFans(JSON.parse(JSON.stringify(merged.fans)))).toEqual(blocked);
  });

  it('planer: prośba bez grupy nie dochodzi do kości, nowi fani grupy nie potrzebują', () => {
    const rocker = { ...createDefaultCharacterData(), roleId: 'rockerboy', roleAbilityRank: 4 };
    expect(
      planCpredRoll(rocker, registry, {
        kind: 'charisma',
        charismaAudience: 'single',
        charismaPurpose: 'favour',
      }),
    ).toEqual({ ok: false, error: 'NO_FAN_GROUP' });
    const withFans = { ...rocker, fans };
    expect(
      planCpredRoll(withFans, registry, {
        kind: 'charisma',
        charismaAudience: 'small',
        charismaPurpose: 'favour',
        charismaFanGroupId: 'a',
      }),
    ).toEqual({ ok: false, error: 'NO_FAN_GROUP' });
    const favour = planCpredRoll(withFans, registry, {
      kind: 'charisma',
      charismaAudience: 'small',
      charismaPurpose: 'favour',
      charismaFanGroupId: 'b',
      charismaNote: ' nocleg ',
    });
    expect(favour.ok && favour.plan.title).toBe('Efekt Charyzmy: przysługa — Ekipa z baru');
    expect(favour.ok && favour.plan.charisma).toMatchObject({ fanGroupId: 'b', note: 'nocleg' });
    const made = planCpredRoll(rocker, registry, {
      kind: 'charisma',
      charismaAudience: 'large',
      charismaPurpose: 'fans',
      charismaNote: 'Publika klubu',
    });
    expect(made.ok && made.plan.charisma).toMatchObject({ purpose: 'fans', note: 'Publika klubu' });
  });
});

describe('licznik Pogłosek w tygodniu (G28; MDA-04)', () => {
  it('liczy rzuty w tygodniu kalendarza i zeruje się w następnym', () => {
    const first = cpredRumourWeekAfterRoll(null, MONDAY + 60);
    expect(first).toEqual({ week: gameWeekIndex(MONDAY), rolls: 1 });
    const second = cpredRumourWeekAfterRoll(first, MONDAY + 3 * MINUTES_PER_DAY);
    expect(second.rolls).toBe(2);
    expect(cpredRumourRollsThisWeek(second, MONDAY + WEEK - 1)).toBe(2);
    expect(cpredRumourRollsThisWeek(second, MONDAY + WEEK)).toBe(0);
    expect(cpredRumourWeekAfterRoll(second, MONDAY + WEEK).rolls).toBe(1);
  });

  it('przemiatanie przypomina, gdy tydzień minął bez dwóch rzutów', () => {
    const week = gameWeekIndex(MONDAY);
    // W tym samym tygodniu — nic.
    expect(cpredRumourWeekSweep({ week, rolls: 0 }, MONDAY + 60)).toEqual({
      next: null,
      missed: null,
    });
    // Tydzień minął z jednym rzutem — przypomnienie i nowy licznik.
    expect(cpredRumourWeekSweep({ week, rolls: 1 }, MONDAY + WEEK)).toEqual({
      next: { week: week + 1, rolls: 0 },
      missed: 1,
    });
    // Dwa rzuty — tylko nowy licznik.
    expect(cpredRumourWeekSweep({ week, rolls: 2 }, MONDAY + WEEK).missed).toBeNull();
    // Karta bez licznika i zegar cofnięty zaczynają liczyć po cichu.
    expect(cpredRumourWeekSweep(null, MONDAY)).toEqual({ next: { week, rolls: 0 }, missed: null });
    expect(cpredRumourWeekSweep({ week: week + 2, rolls: 0 }, MONDAY).missed).toBeNull();
  });

  it('czytnik: stara karta nie ma licznika', () => {
    expect(readCpredRumourWeek(undefined)).toBeNull();
    expect(readCpredRumourWeek({ week: 'x' })).toBeNull();
    expect(readCpredRumourWeek({ week: 12, rolls: -3 })).toEqual({ week: 12, rolls: 0 });
    expect(createDefaultCharacterData().rumourWeek).toBeNull();
  });
});

describe('aktywne szukanie pogłosek (G29; MDA-05)', () => {
  it('znajduje po nazwie te Umiejętności, które zna rejestr', () => {
    expect(cpredRumourSearchSkills(registry.skills).map((skill) => skill.id)).toEqual([
      'library',
      'talk',
    ]);
  });
});

describe('rejestr publikacji (G30; MDA-10)', () => {
  const entry: CpredPublication = {
    id: 'p1',
    topic: 'Przekręt w ratuszu',
    atMinute: MONDAY,
    proof: 'solid',
    believed: true,
  };

  it('temat jest wymagany, a puszczony wraca tylko z nowymi informacjami', () => {
    expect(cpredPublicationProblem([], '   ', false)).toBe('NO_TOPIC');
    expect(cpredPublicationProblem([], undefined, false)).toBe('NO_TOPIC');
    expect(cpredPublicationProblem([], 'Przekręt w ratuszu', false)).toBeNull();
    // Wielkość liter i odstępy nie robią z tematu nowego tematu.
    expect(cpredPublicationProblem([entry], '  przekręt  W ratuszu ', false)).toBe(
      'ALREADY_PUBLISHED',
    );
    expect(cpredPublicationProblem([entry], 'Przekręt w ratuszu', true)).toBeNull();
    expect(cpredPublicationProblem([entry], 'Inna sprawa', false)).toBeNull();
  });

  it('planer niesie temat do rejestru i odmawia powtórki', () => {
    const media = { ...createDefaultCharacterData(), roleId: 'media', roleAbilityRank: 3 };
    expect(planCpredRoll(media, registry, { kind: 'reliability' })).toEqual({
      ok: false,
      error: 'NO_TOPIC',
    });
    const published = { ...media, publications: [entry] };
    expect(
      planCpredRoll(published, registry, {
        kind: 'reliability',
        reliabilityTopic: 'przekręt w ratuszu',
      }),
    ).toEqual({ ok: false, error: 'ALREADY_PUBLISHED' });
    const again = planCpredRoll(published, registry, {
      kind: 'reliability',
      reliabilityTopic: 'Przekręt w ratuszu',
      reliabilityNewInfo: true,
    });
    expect(again.ok && again.plan.reliability).toMatchObject({
      topic: 'Przekręt w ratuszu',
      again: true,
    });
    // „Nowe informacje” przy świeżym temacie nie robią z niego powtórki.
    const fresh = planCpredRoll(media, registry, {
      kind: 'reliability',
      reliabilityTopic: 'Inna sprawa',
      reliabilityNewInfo: true,
    });
    expect(fresh.ok && fresh.plan.reliability?.again).toBe(false);
  });

  it('rejestr trzyma najnowsze wpisy, czytnik przyjmuje starą kartę', () => {
    let list: CpredPublication[] = [];
    for (let index = 0; index < CPRED_PUBLICATIONS_MAX + 3; index += 1) {
      list = cpredPublicationsWith(list, { ...entry, id: `p${index}`, topic: `Temat ${index}` });
    }
    expect(list).toHaveLength(CPRED_PUBLICATIONS_MAX);
    expect(list[0]!.id).toBe('p3');
    expect(readCpredPublications(undefined)).toEqual([]);
    expect(
      readCpredPublications([
        { ...entry, again: true },
        { ...entry, id: 'p2', proof: 'zmyślone' },
        { ...entry, id: 'p3', topic: ' ' },
      ]),
    ).toEqual([{ ...entry, again: true }]);
    expect(createDefaultCharacterData().publications).toEqual([]);
  });
});

describe('licznik wezwań Wsparcia (G32; STR-14)', () => {
  it('liczy wezwania tej doby i tego tygodnia kalendarza', () => {
    let calls: number[] = [];
    // Niedziela wieczorem, potem trzy wezwania w nowym tygodniu, dwa we wtorek.
    for (const minute of [
      MONDAY - 60,
      MONDAY + 60,
      MONDAY + MINUTES_PER_DAY + 10,
      MONDAY + MINUTES_PER_DAY + 500,
    ]) {
      calls = cpredBackupCallsWith(calls, minute);
    }
    expect(cpredBackupCallCounts(calls, MONDAY + MINUTES_PER_DAY + 600)).toEqual({
      today: 2,
      week: 3,
    });
    expect(cpredBackupCallCounts(calls, MONDAY + WEEK)).toEqual({ today: 0, week: 0 });
    expect(readCpredBackupCalls(undefined)).toEqual([]);
    expect(readCpredBackupCalls([1, 'x', 2.5, 3])).toEqual([1, 3]);
    expect(createDefaultCharacterData().backupCalls).toEqual([]);
  });
});

describe('druga broń funkcjonariusza (G31; STR-13)', () => {
  it('niższe kategorie mają jedną broń, wyższe — drugą z listy wyposażenia', () => {
    const second = Object.fromEntries(
      CPRED_BACKUP_TIERS.map((tier) => [tier.id, tier.secondWeapon ?? null]),
    );
    expect(second).toEqual({
      'corp-security': null,
      'beat-cops': null,
      'state-police': 'Ciężki pistolet',
      marshal: 'Granatnik',
      'c-swat': 'Wyrzutnia rakiet',
      federal: 'Bardzo ciężki pistolet',
    });
    // Druga broń stoi w wydrukowanym wyposażeniu kategorii.
    for (const tier of CPRED_BACKUP_TIERS) {
      if (!tier.secondWeapon) continue;
      const stem = tier.secondWeapon.toLowerCase().split(' ').pop()!.slice(0, 6);
      expect(tier.loadout.toLowerCase()).toContain(stem);
    }
  });
});
