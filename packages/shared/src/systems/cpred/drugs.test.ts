import { describe, expect, it } from 'vitest';
import {
  buildCpredRegistry,
  createDefaultCharacterData,
  parseCharacterData,
  type CpredCharacterData,
  type CpredRegistry,
} from './character.js';
import {
  CPRED_BLADE_TOXINS,
  cpredAddAddiction,
  cpredAddictionRollDue,
  cpredBladeToxinOfRow,
  cpredChemSkillBonus,
  cpredChemSkillRows,
  cpredClearDoses,
  cpredCoatBlade,
  cpredCoatingAmmoProfile,
  cpredCoatingOf,
  cpredDrug,
  cpredDrugOfRow,
  cpredEmptyChems,
  cpredPharmaCooldown,
  cpredRemoveAddiction,
  cpredTakeDose,
  readCpredChems,
  type CpredChems,
  type CpredDrug,
} from './drugs.js';
import { planCpredRoll } from './rolls.js';
import { cpredSheetHpMax } from './statblock.js';
import {
  CPRED_HOUR_S,
  cpredEffectiveStats,
  cpredStatEffectDeadlines,
  cpredStatModifierRows,
} from './stateffects.js';
import { cpredWoundSuspensionSource } from './woundsuspension.js';

/**
 * Narkotyki, alkohol i trucizna na ostrzu (etap 59b/59c).
 *
 * Pilnowane są granice z decyzji MG z 24.10.2026: sufit 10 (Dopalacz na INT 9
 * daje 10), druga dawka wydłuża zamiast kumulować, alkohol do trzech dawek,
 * kara Dopalacza zawsze, a Syntkoki i Szprycy tylko bez dawki — i to, że pule
 * się nie ruszają.
 */

const registry: CpredRegistry = buildCpredRegistry(
  {
    skills: [
      { id: 'resist-torture-drugs', name: 'Odporność na tortury/narkotyki', stat: 'will' },
      { id: 'persuasion', name: 'Perswazja', stat: 'cool' },
      { id: 'acting', name: 'Aktorstwo', stat: 'cool' },
      { id: 'perception', name: 'Percepcja', stat: 'int' },
    ],
  },
  { roles: [{ id: 'solo', name: 'Solo', ability: 'Zmysł Walki' }] },
);

let nextId = 0;
const makeId = () => `d${++nextId}`;

function drug(id: string): CpredDrug {
  const found = cpredDrug(id);
  if (!found) throw new Error(`brak ${id}`);
  return found;
}

/** Karta z Cechami po 5 plus nadpisania i lista dawek. */
function sheet(
  overrides: Partial<CpredCharacterData['stats']> = {},
  chems: CpredChems = cpredEmptyChems(),
): CpredCharacterData {
  const base = createDefaultCharacterData();
  return { ...base, stats: { ...base.stats, ...overrides }, chems };
}

function dosed(ids: string[], stats: Partial<CpredCharacterData['stats']> = {}) {
  let chems = cpredEmptyChems();
  for (const id of ids) {
    chems = cpredTakeDose(chems, drug(id), { expiresAtMinute: 1000 }, makeId).chems;
  }
  return sheet(stats, chems);
}

describe('rozpoznanie wiersza ekwipunku', () => {
  it('po `consumable`, po wpisie kompendium i po nazwie', () => {
    expect(cpredDrugOfRow({ name: 'cokolwiek', consumable: 'drug.dopalacz' })?.id).toBe(
      'drug.dopalacz',
    );
    expect(cpredDrugOfRow({ name: 'Szkło od Zeda', compendiumId: 'gear.blekitne-szklo' })?.id).toBe(
      'drug.blekitne-szklo',
    );
    expect(cpredDrugOfRow({ name: 'syntkoka' })?.id).toBe('drug.syntkoka');
    expect(
      cpredDrugOfRow({ name: 'Alkohol', compendiumId: 'gear.alkohol-doskonalej-jakosci' })?.id,
    ).toBe('drug.alkohol');
  });

  it('farmaceutyk i zwykły wiersz nie są narkotykiem', () => {
    expect(cpredDrugOfRow({ name: 'Stym', consumable: 'pharma.stym' })).toBeNull();
    expect(cpredDrugOfRow({ name: 'Łom' })).toBeNull();
  });

  it('fiolka trucizny po wpisie i po nazwie', () => {
    expect(cpredBladeToxinOfRow({ name: 'x', compendiumId: 'gear.fiolka-biotoksyny' })?.id).toBe(
      'toxin.biotoksyna',
    );
    expect(cpredBladeToxinOfRow({ name: 'Fiolka trucizny' })?.id).toBe('toxin.trucizna');
    expect(cpredBladeToxinOfRow({ name: 'Dopalacz' })).toBeNull();
  });
});

describe('zażycie', () => {
  it('druga dawka wydłuża oba terminy o pełny czas działania, nie dokłada wiersza', () => {
    const first = cpredTakeDose(
      cpredEmptyChems(),
      drug('drug.dopalacz'),
      { expiresAtMinute: 1440, expiresAtRound: 100 },
      makeId,
    );
    const second = cpredTakeDose(
      first.chems,
      drug('drug.dopalacz'),
      { expiresAtMinute: 999, expiresAtRound: 5 },
      makeId,
    );
    expect(second.how).toBe('extended');
    expect(second.chems.doses).toHaveLength(1);
    expect(second.dose.expiresAtMinute).toBe(1440 + 24 * 60);
    expect(second.dose.expiresAtRound).toBe(100 + (24 * 3600) / 3);
    expect(second.dose.durationS).toBe(48 * CPRED_HOUR_S);
  });

  it('dawka sprzed walki dostaje termin rundowy od teraz', () => {
    const first = cpredTakeDose(
      cpredEmptyChems(),
      drug('drug.syntkoka'),
      { expiresAtMinute: 240 },
      makeId,
    );
    const second = cpredTakeDose(
      first.chems,
      drug('drug.syntkoka'),
      { expiresAtMinute: 300, expiresAtRound: 7 },
      makeId,
    );
    expect(second.dose.expiresAtMinute).toBe(480);
    expect(second.dose.expiresAtRound).toBe(7);
  });

  it('Człowieczeństwo Czarnej szprycy sumuje się na dawce', () => {
    const first = cpredTakeDose(cpredEmptyChems(), drug('drug.czarna-szpryca'), {}, makeId, 7);
    const second = cpredTakeDose(first.chems, drug('drug.czarna-szpryca'), {}, makeId, 5);
    expect(second.dose.humanityLost).toBe(12);
  });

  it('alkohol: każda dawka osobno, czwarta wypycha najstarszą', () => {
    let chems = cpredEmptyChems();
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const taken = cpredTakeDose(chems, drug('drug.alkohol'), { expiresAtMinute: 60 }, makeId);
      chems = taken.chems;
      ids.push(taken.dose.id);
    }
    expect(chems.doses).toHaveLength(3);
    const fourth = cpredTakeDose(chems, drug('drug.alkohol'), { expiresAtMinute: 90 }, makeId);
    expect(fourth.how).toBe('stacked');
    expect(fourth.dropped?.id).toBe(ids[0]);
    expect(fourth.chems.doses).toHaveLength(3);
  });
});

describe('Cechy z dawek', () => {
  it('Dopalacz: INT 8 → 10 i INT 9 → 10 (sufit 10, decyzja MG)', () => {
    expect(cpredEffectiveStats(dosed(['drug.dopalacz'], { int: 8 })).int).toBe(10);
    expect(cpredEffectiveStats(dosed(['drug.dopalacz'], { int: 9 })).int).toBe(10);
  });

  it('Syntkoka: REF 8 → 9, wydłużona dalej +1', () => {
    expect(cpredEffectiveStats(dosed(['drug.syntkoka'], { ref: 8 })).ref).toBe(9);
    expect(cpredEffectiveStats(dosed(['drug.syntkoka', 'drug.syntkoka'], { ref: 8 })).ref).toBe(9);
  });

  it('alkohol: trzy dawki to REF −3 i SW +3', () => {
    const drunk = dosed(['drug.alkohol', 'drug.alkohol', 'drug.alkohol'], { ref: 6, will: 5 });
    expect(cpredEffectiveStats(drunk).ref).toBe(3);
    expect(cpredEffectiveStats(drunk).will).toBe(8);
  });

  it('pule się nie ruszają — PW z bazowej BC i SW', () => {
    const drunk = dosed(['drug.alkohol', 'drug.alkohol'], { will: 5, body: 5 });
    expect(cpredSheetHpMax(drunk)).toBe(cpredSheetHpMax(sheet({ will: 5, body: 5 })));
  });

  it('rozbicie rzutu ma wiersz z nazwą narkotyku', () => {
    expect(cpredStatModifierRows(dosed(['drug.dopalacz'], { int: 6 }), 'int')).toEqual([
      { label: 'Dopalacz', value: 2 },
    ]);
  });
});

describe('uzależnienie', () => {
  function addicted(id: string, doses: string[] = [], stats = {}) {
    const base = dosed(doses, stats);
    return { ...base, chems: cpredAddAddiction(base.chems, id as never) };
  }

  it('Dopalacz: INT −2 zawsze, pod dawką wychodzi na zero (decyzja MG)', () => {
    expect(cpredEffectiveStats(addicted('drug.dopalacz', [], { int: 6 })).int).toBe(4);
    expect(cpredEffectiveStats(addicted('drug.dopalacz', ['drug.dopalacz'], { int: 6 })).int).toBe(
      6,
    );
  });

  it('Syntkoka: REF −2 tylko bez dawki', () => {
    expect(cpredEffectiveStats(addicted('drug.syntkoka', [], { ref: 6 })).ref).toBe(4);
    expect(cpredEffectiveStats(addicted('drug.syntkoka', ['drug.syntkoka'], { ref: 6 })).ref).toBe(
      7,
    );
  });

  it('wiersz rozbicia mówi „Uzależnienie (…)”', () => {
    expect(cpredStatModifierRows(addicted('drug.czarna-szpryca', [], { ref: 6 }), 'ref')).toEqual([
      { label: 'Uzależnienie (Czarna szpryca)', value: -2 },
    ]);
  });

  it('rzut należy się nieuzależnionemu i uzależnionemu, któremu Szpryca trzyma Człowieczeństwo', () => {
    const lace = cpredTakeDose(cpredEmptyChems(), drug('drug.czarna-szpryca'), {}, makeId, 6);
    const boost = cpredTakeDose(cpredEmptyChems(), drug('drug.dopalacz'), {}, makeId);
    const beer = cpredTakeDose(cpredEmptyChems(), drug('drug.alkohol'), {}, makeId);
    expect(cpredAddictionRollDue(cpredEmptyChems(), boost.dose)).toBe(true);
    expect(
      cpredAddictionRollDue(cpredAddAddiction(cpredEmptyChems(), 'drug.dopalacz'), boost.dose),
    ).toBe(false);
    expect(
      cpredAddictionRollDue(cpredAddAddiction(cpredEmptyChems(), 'drug.czarna-szpryca'), lace.dose),
    ).toBe(true);
    expect(cpredAddictionRollDue(cpredEmptyChems(), beer.dose)).toBe(false);
  });

  it('terapia zdejmuje, drugi wpis nic nie robi', () => {
    const once = cpredAddAddiction(cpredEmptyChems(), 'drug.grzmot');
    expect(cpredAddAddiction(once, 'drug.grzmot').addictions).toEqual(['drug.grzmot']);
    expect(cpredRemoveAddiction(once, 'drug.grzmot').addictions).toEqual([]);
  });
});

describe('Umiejętności — Grzmot', () => {
  it('+2 do Perswazji raz, choćby dawka była wydłużona', () => {
    const party = dosed(['drug.grzmot', 'drug.grzmot']);
    expect(cpredChemSkillRows(party, 'persuasion')).toEqual([{ label: 'Grzmot', value: 2 }]);
    expect(cpredChemSkillRows(party, 'perception')).toEqual([]);
  });

  it('uzależnienie −2 działa także pod dawką (bez dopisku „gdy nie jest pod działaniem”)', () => {
    const base = dosed(['drug.grzmot']);
    const hooked = { ...base, chems: cpredAddAddiction(base.chems, 'drug.grzmot') };
    expect(cpredChemSkillBonus(hooked, 'acting')).toBe(0);
  });

  it('rozbicie Testu ma wiersz „Grzmot +2”', () => {
    const planned = planCpredRoll(dosed(['drug.grzmot']), registry, {
      kind: 'skill',
      skillId: 'persuasion',
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.breakdown).toContainEqual(
      expect.objectContaining({ label: 'Grzmot', value: 2 }),
    );
  });
});

describe('Czarna szpryca i kary Poważnie Rannego', () => {
  it('dawka zawiesza kary jak Stym', () => {
    expect(cpredWoundSuspensionSource({ ...dosed(['drug.czarna-szpryca']), cyberware: [] })).toBe(
      'Czarna szpryca',
    );
    expect(cpredWoundSuspensionSource({ ...dosed(['drug.dopalacz']), cyberware: [] })).toBeNull();
  });
});

describe('zdejmowanie i farmaceutyki z limitem', () => {
  it('Dynadetoks zdejmuje narkotyki, a Zryw zostaje', () => {
    let chems = cpredTakeDose(cpredEmptyChems(), drug('drug.dopalacz'), {}, makeId).chems;
    chems = cpredTakeDose(
      chems,
      { id: 'pharma.zryw', name: 'Zryw', durationS: 3600 },
      {},
      makeId,
    ).chems;
    const cleared = cpredClearDoses(chems, (dose) => cpredDrug(dose.substanceId) === null);
    expect(cleared.removed.map((dose) => dose.source)).toEqual(['Dopalacz']);
    expect(cleared.chems.doses.map((dose) => dose.source)).toEqual(['Zryw']);
  });

  it('Stym raz na dobę, Zryw raz na tydzień; bez zegara limit nie obowiązuje', () => {
    const chems = { ...cpredEmptyChems(), lastTaken: { 'pharma.stym': 100, 'pharma.zryw': 100 } };
    expect(cpredPharmaCooldown(chems, 'pharma.stym', 100 + 600)).toBe(24 * 60 - 600);
    expect(cpredPharmaCooldown(chems, 'pharma.stym', 100 + 24 * 60)).toBe(0);
    expect(cpredPharmaCooldown(chems, 'pharma.zryw', 100 + 24 * 60)).toBe(6 * 24 * 60);
    expect(cpredPharmaCooldown(chems, 'pharma.antybiotyk', 200)).toBe(0);
    expect(cpredPharmaCooldown(chems, 'pharma.stym', null)).toBe(0);
  });
});

describe('trucizna na ostrzu', () => {
  it('druga fiolka na tym samym ostrzu zastępuje pierwszą', () => {
    const [poison, biotoxin] = CPRED_BLADE_TOXINS;
    const once = cpredCoatBlade(cpredEmptyChems(), 'w1', poison!, {}, makeId).chems;
    const twice = cpredCoatBlade(once, 'w1', biotoxin!, {}, makeId).chems;
    expect(twice.coatings).toHaveLength(1);
    expect(cpredCoatingOf({ chems: twice }, 'w1')?.toxin.id).toBe('toxin.biotoksyna');
  });

  it('profil udaje nabój bez obrażeń z Testem PT 13 i 2k6', () => {
    const profile = cpredCoatingAmmoProfile(CPRED_BLADE_TOXINS[0]!);
    expect(profile.noDamage).toBe(true);
    expect(profile.check?.dv).toBe(13);
    expect(profile.check?.failure.damage).toBe('2k6');
  });

  it('trucizna schodzi z ostrza, którego nie ma już na karcie', () => {
    const coated = cpredCoatBlade(cpredEmptyChems(), 'gone', CPRED_BLADE_TOXINS[0]!, {}, makeId);
    const data = parseCharacterData(
      JSON.stringify({ ...createDefaultCharacterData(), chems: coated.chems }),
      registry,
    );
    expect(data.chems.coatings).toEqual([]);
  });
});

describe('odczyt z bazy', () => {
  it('zepsute wiersze odpadają po cichu, uzależnienia bez duplikatów', () => {
    const chems = readCpredChems({
      doses: [
        { id: 'a', substanceId: 'drug.dopalacz', source: 'Dopalacz', durationS: 3600 },
        { id: 'b', substanceId: 'drug.nieznany', source: 'X', durationS: 3600 },
        { id: 'c', substanceId: 'drug.grzmot', source: 'Grzmot', durationS: -5 },
      ],
      addictions: ['drug.grzmot', 'drug.grzmot', 'drug.alkohol', 'nonsense'],
      lastTaken: { 'pharma.stym': 50, 'pharma.antybiotyk': 10 },
      coatings: [{ id: 'k', weaponRowId: 'w', toxinId: 'toxin.zle', durationS: 60 }],
    });
    expect(chems.doses.map((dose) => dose.id)).toEqual(['a']);
    expect(chems.addictions).toEqual(['drug.grzmot']);
    expect(chems.lastTaken).toEqual({ 'pharma.stym': 50 });
    expect(chems.coatings).toEqual([]);
  });
});

describe('termin rundowy (poprawka z 59b)', () => {
  it('godzina to 1200 rund po 3 s, nie 360', () => {
    expect(cpredStatEffectDeadlines({ round: 4, minutes: 0 }, CPRED_HOUR_S).expiresAtRound).toBe(
      4 + 1200,
    );
  });
});
