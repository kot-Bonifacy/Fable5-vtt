import { describe, expect, it } from 'vitest';
import {
  STATIST_ARMOR_ROW_IDS,
  STATIST_DEFAULT_STAT,
  STATIST_SKILL_LEVEL_MAX,
  STATIST_WEAPON_ROW_ID,
  applyStatistQuick,
  cpredSheetOperatedBy,
  cpredSheetRollSheet,
  cpredSheetWithCombatValue,
  createDefaultStatistQuick,
  createStatistSheet,
  sanitizeStatistQuick,
  statistQuick,
} from './statist.js';
import { cpredSheetHpMax } from './statblock.js';
import {
  buildCpredRegistry,
  mergeCharacterData,
  parseCharacterData,
  type CpredRegistry,
} from './character.js';
import { evasionBase, passiveEvasionDv, planCpredAttack } from './attacks.js';
import { cpredSheetWoundState } from './rolls.js';
import type { ResolvedWeapon } from './compendium.js';

/**
 * Etap 38a: figura, którą ktoś ostatystykował, ma prawdziwą kartę, a menu
 * żetonu jest tylko sześcioma polami patrzącymi na tę kartę. Testy niżej
 * pilnują tej tożsamości z dwóch stron: że karta zbudowana z sześciu liczb jest
 * dla `planCpredAttack` nie do odróżnienia od prawdziwej, i że trzy rzeczy,
 * których karta sama by nie utrzymała (Wartość bojowa, zakaz uniku przed
 * pociskami, wydrukowane PW), przeżywają zapis.
 */

const registry: CpredRegistry = buildCpredRegistry(
  {
    skills: [
      { id: 'handgun', name: 'Broń krótka', stat: 'ref' },
      { id: 'evasion', name: 'Unik', stat: 'dex' },
      { id: 'autofire', name: 'Ogień ciągły', stat: 'ref' },
      { id: 'brawling', name: 'Bijatyka', stat: 'dex' },
      { id: 'deduction', name: 'Dedukcja', stat: 'int' },
    ],
  },
  { roles: [] },
);

const pistol: ResolvedWeapon = {
  damage: '3k6',
  magazine: 8,
  rof: 2,
  hands: 1,
  concealable: true,
  attachmentSlots: 3,
  skillId: 'handgun',
  rangeDv: [13, 15, 20, 25, 30, 30, null, null],
  melee: false,
};

/** Ganger z pistoletem — figura, którą MG stawia najczęściej. */
function ganger() {
  return createStatistSheet({
    ...createDefaultStatistQuick(),
    weaponId: 'weapon.pistolet',
    weaponName: 'Pistolet',
    weaponDamage: '2k6',
    ammoCurrent: 8,
    ammoMax: 8,
    hpCurrent: 25,
    hpMax: 25,
  });
}

describe('sanitizeStatistQuick — naprawia, zamiast odmawiać', () => {
  it('wypełnia całkiem pusty obiekt zwykłym człowiekiem', () => {
    const quick = sanitizeStatistQuick(undefined);
    expect(quick.ref).toBe(STATIST_DEFAULT_STAT);
    expect(quick.weaponId).toBeNull();
    expect(quick.ammoMax).toBe(0);
    expect(quick.combatValue).toBeNull();
  });

  it('ścina Cechy do zakresu z podręcznika, zamiast rzucać', () => {
    const quick = sanitizeStatistQuick({ ref: 99, dex: -4, body: 7.6, will: 'osiem' });
    expect(quick.ref).toBe(10);
    expect(quick.dex).toBe(0);
    expect(quick.body).toBe(8);
    expect(quick.will).toBe(STATIST_DEFAULT_STAT);
  });

  it('nigdy nie zostawia w magazynku więcej, niż ten mieści', () => {
    const quick = sanitizeStatistQuick({ ammoMax: 12, ammoCurrent: 30 });
    expect(quick.ammoCurrent).toBe(12);
  });

  it('odrzuca id broni, które nie jest id kompendium', () => {
    expect(sanitizeStatistQuick({ weaponId: 'nie id' }).weaponId).toBeNull();
  });

  it('nie pozwala figurze mieć więcej PW, niż wynosi jej maksimum', () => {
    const quick = sanitizeStatistQuick({ hpMax: 30, hpCurrent: 200 });
    expect(quick.hpCurrent).toBe(30);
  });
});

describe('createStatistSheet — karta z sześciu liczb', () => {
  it('nie daje figurze Szczęścia, którego nie ma z czego wydawać', () => {
    const sheet = ganger();
    expect(sheet.stats.luck).toBe(0);
    expect(sheet.luckCurrent).toBe(0);
  });

  it('niesie jedną broń pod stałym id', () => {
    const sheet = ganger();
    expect(sheet.weapons).toHaveLength(1);
    expect(sheet.weapons[0]?.id).toBe(STATIST_WEAPON_ROW_ID);
    expect(sheet.weapons[0]?.compendiumId).toBe('weapon.pistolet');
    expect(sheet.weapons[0]?.ammoCurrent).toBe(8);
  });

  it('poziom broni siedzi w bloku statystyk, nie pod id Umiejętności', () => {
    const sheet = ganger();
    expect(sheet.statBlock?.weaponSkill).toBe(4);
    expect(sheet.skills.handgun).toBeUndefined();
  });

  it('a do rzutu wchodzi pod tą Umiejętnością, którą akurat strzela', () => {
    expect(cpredSheetRollSheet(ganger(), 'handgun').skills.handgun).toBe(4);
    // Ta sama figura z maczetą w ręku strzela tą samą liczbą — bo to jest
    // „poziom, na którym ta figura walczy", a nie poziom jednej Umiejętności.
    expect(cpredSheetRollSheet(ganger(), 'melee').skills.melee).toBe(4);
  });

  it('ale Umiejętność wpisana na pełnej karcie wygrywa z liczbą z edytora', () => {
    const sheet = { ...ganger(), skills: { ...ganger().skills, handgun: 6 } };
    expect(cpredSheetRollSheet(sheet, 'handgun').skills.handgun).toBe(6);
  });

  it('broni się własnym Unikiem zamiast codziennym PT', () => {
    const sheet = ganger();
    expect(evasionBase(sheet, registry)).toBe(sheet.stats.dex + 2);
    expect(passiveEvasionDv(sheet, registry)).toBeGreaterThan(0);
  });

  it('zakłada pancerz na głowie i na ciele, bo podręcznik drukuje jedno OB', () => {
    const sheet = createStatistSheet({ ...createDefaultStatistQuick(), armorSp: 11 });
    expect(sheet.armor.map((row) => row.location).sort()).toEqual(['body', 'head']);
    expect(sheet.armor.every((row) => row.sp === 11)).toBe(true);
  });

  it('OB zero nie zostawia rzędu pancerza', () => {
    expect(createStatistSheet(createDefaultStatistQuick()).armor).toEqual([]);
  });
});

describe('wydrukowane PW — trzecia rzecz, której karta sama by nie utrzymała', () => {
  const swat = createStatistSheet({
    ...createDefaultStatistQuick(),
    body: 4,
    will: 0,
    hpCurrent: 35,
    hpMax: 35,
    combatValue: 14,
  });

  it('C-SWAT ma trzydzieści pięć PW, choć z BC i SW wychodzi dwadzieścia', () => {
    expect(cpredSheetHpMax(swat)).toBe(35);
    expect(swat.hpCurrent).toBe(35);
  });

  it('zapis karty ich nie ścina — normalizacja czyta blok, nie same Cechy', () => {
    const saved = mergeCharacterData(swat, { hpCurrent: 35 });
    expect(saved.hpCurrent).toBe(35);
  });

  it('a stan ran liczy się z wydrukowanego maksimum, nie z Cech', () => {
    // Z samych Cech próg byłby przy 10 PW i funkcjonariusz z trzydziestoma
    // punktami byłby ciężko ranny.
    expect(cpredSheetWoundState(swat)).toBe('healthy');
    expect(cpredSheetWoundState({ ...swat, hpCurrent: 17 })).toBe('serious');
  });

  it('blok przeżywa podróż przez JSON karty', () => {
    const back = parseCharacterData(JSON.stringify(swat), registry);
    expect(back.statBlock?.hpMax).toBe(35);
    expect(back.statBlock?.combatValue).toBe(14);
  });
});

describe('Wartość bojowa — sufit i podstawienie', () => {
  it('nie ścina piętnastki C-SWAT-u do dziesiątki (błąd z 31.08)', () => {
    const quick = sanitizeStatistQuick({ skillLevel: 15, evasion: 15, combatValue: 15 });
    expect(quick.skillLevel).toBe(15);
    expect(quick.evasion).toBe(15);
    expect(quick.combatValue).toBe(15);
  });

  it('ale sufit nadal istnieje', () => {
    const quick = sanitizeStatistQuick({ skillLevel: 999, combatValue: 999 });
    expect(quick.skillLevel).toBe(STATIST_SKILL_LEVEL_MAX);
    expect(quick.combatValue).toBe(STATIST_SKILL_LEVEL_MAX);
  });

  it('wkłada całą Wartość bojową w Umiejętność i zeruje Cechy', () => {
    const officer = createStatistSheet({
      ...createDefaultStatistQuick(),
      body: 4,
      move: 4,
      combatValue: 14,
      hpMax: 35,
      hpCurrent: 35,
    });
    const rolling = cpredSheetRollSheet(officer, 'handgun');
    expect(rolling.skills.handgun).toBe(14);
    expect(rolling.stats.ref).toBe(0);
    expect(rolling.stats.int).toBe(0);
    // BC i RUCH zostają: podręcznik drukuje je obok Wartości bojowej jako
    // osobne liczby („istotne przy rozpatrywaniu dystansu", s. 158).
    expect(rolling.stats.body).toBe(4);
    expect(rolling.stats.move).toBe(4);
  });

  it('broni się tą samą liczbą, którą atakuje (s. 158)', () => {
    const officer = createStatistSheet({ ...createDefaultStatistQuick(), combatValue: 14 });
    expect(cpredSheetRollSheet(officer, null).skills.evasion).toBe(14);
  });

  it('karta bez bloku statystyk wraca nietknięta', () => {
    const sheet = { ...ganger(), statBlock: null };
    expect(cpredSheetRollSheet(sheet, 'handgun')).toBe(sheet);
  });
});

describe('cpredSheetWithCombatValue — maszyna za spustem (etap 26e)', () => {
  const turret = createStatistSheet({
    ...createDefaultStatistQuick(),
    ref: 3,
    dex: 3,
    armorSp: 7,
    ammoCurrent: 20,
    ammoMax: 30,
  });

  it('rzuca jedną liczbą, a Cechy schodzą do zera', () => {
    const rolling = cpredSheetRollSheet(cpredSheetWithCombatValue(turret, 14), 'handgun');
    expect(rolling.skills.handgun).toBe(14);
    expect(rolling.stats.ref).toBe(0);
  });

  it('nie unika ataków (s. 214) — inaczej niż funkcjonariusz Wsparcia', () => {
    const machine = cpredSheetWithCombatValue(turret, 14);
    expect(machine.skills.evasion).toBe(0);
    expect(machine.statBlock?.noBulletDodge).toBe(true);
  });

  it('nie rusza niczego, co należy do samej broni', () => {
    const machine = cpredSheetWithCombatValue(turret, 14);
    expect(machine.weapons[0]?.ammoCurrent).toBe(20);
    expect(machine.armor[0]?.sp).toBe(7);
  });
});

describe('cpredSheetOperatedBy — cudze ręce na spuście (etap 26d)', () => {
  const turret = cpredSheetWithCombatValue(
    createStatistSheet({ ...createDefaultStatistQuick(), armorSp: 7 }),
    14,
  );
  const netrunner = {
    stats: { ...createStatistSheet(createDefaultStatistQuick()).stats, ref: 8, dex: 7 },
    skills: { handgun: 6, evasion: 5 },
    humanityCurrent: 40,
    statEffects: [],
  };

  it('strzela Cechami i Umiejętnością operatora', () => {
    const operated = cpredSheetOperatedBy(turret, netrunner, 'handgun');
    const rolling = cpredSheetRollSheet(operated, 'handgun');
    expect(rolling.stats.ref).toBe(8);
    expect(rolling.skills.handgun).toBe(6);
  });

  it('gasi Wartość bojową wieżyczki — inaczej rzut wyzerowałby Cechy z powrotem', () => {
    const operated = cpredSheetOperatedBy(turret, netrunner, 'handgun');
    expect(operated.statBlock?.combatValue).toBeNull();
  });

  it('a pancerz i magazynek zostają wieżyczki', () => {
    const operated = cpredSheetOperatedBy(turret, netrunner, 'handgun');
    expect(operated.armor[0]?.sp).toBe(7);
  });
});

describe('planCpredAttack przyjmuje kartę figury bez różnicy', () => {
  const quick = {
    ...createDefaultStatistQuick(),
    ref: 7,
    skillLevel: 4,
    weaponId: 'weapon.zgrzyt-9',
    weaponName: 'Zgrzyt-9',
    weaponDamage: '3k6',
    ammoMax: 8,
    ammoCurrent: 8,
  };

  it('planuje strzał z REF i poziomem broni w rozbiciu', () => {
    const sheet = cpredSheetRollSheet(createStatistSheet(quick), 'handgun');
    const result = planCpredAttack(
      sheet,
      registry,
      { weaponRowId: STATIST_WEAPON_ROW_ID, mode: 'single' },
      { row: sheet.weapons[0]!, resolved: pistol },
      { name: 'Kurier', tokenId: 'token-2', metres: 14 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.breakdown.map((entry) => entry.value)).toEqual([7, 4]);
    expect(result.plan.attack.dv).toBe(20);
    expect(result.plan.attack.ammoAfter).toBe(7);
  });

  it('zużywa dziesięć naboi na serię tak samo jak karta', () => {
    const sheet = createStatistSheet({ ...quick, ammoMax: 25, ammoCurrent: 25 });
    const result = planCpredAttack(
      sheet,
      registry,
      { weaponRowId: STATIST_WEAPON_ROW_ID, mode: 'autofire' },
      {
        row: sheet.weapons[0]!,
        resolved: {
          ...pistol,
          autofire: { max: 4, rangeDv: [22, 20, 17, 20, null, null, null, null] },
        },
      },
      { name: 'Kurier', tokenId: 'token-2', metres: 14 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.attack.ammoAfter).toBe(15);
  });

  it('odmawia wydania Szczęścia, którego figura nie ma', () => {
    const sheet = createStatistSheet(quick);
    const result = planCpredAttack(
      sheet,
      registry,
      { weaponRowId: STATIST_WEAPON_ROW_ID, mode: 'single', luckSpent: 1 },
      { row: sheet.weapons[0]!, resolved: pistol },
      { name: 'Kurier', tokenId: 'token-2', metres: 14 },
    );
    expect(result).toEqual({ ok: false, error: 'NOT_ENOUGH_LUCK' });
  });
});

describe('statistQuick — droga powrotna', () => {
  it('czyta z karty dokładnie to, co szybki edytor w nią wpisał', () => {
    const quick = {
      ...createDefaultStatistQuick(),
      ref: 7,
      dex: 6,
      body: 8,
      will: 3,
      move: 6,
      skillLevel: 9,
      evasion: 5,
      armorSp: 11,
      weaponId: 'weapon.pistolet',
      weaponName: 'Pistolet',
      weaponDamage: '2k6',
      ammoCurrent: 5,
      ammoMax: 8,
      hpCurrent: 22,
      hpMax: 30,
    };
    expect(statistQuick(createStatistSheet(quick))).toEqual(quick);
  });

  it('figura bez wydrukowanych PW wraca z maksimum policzonym z Cech', () => {
    const sheet = ganger();
    const stripped = { ...sheet, statBlock: null };
    expect(statistQuick(stripped).hpMax).toBe(cpredSheetHpMax(stripped));
  });
});

describe('applyStatistQuick — szybkie pole nie zjada reszty karty', () => {
  it('zostawia ekwipunek, rany i notatki, których edytor nie pokazuje', () => {
    const sheet: ReturnType<typeof ganger> = {
      ...ganger(),
      gear: [{ id: 'g1', name: 'Apteczka', notes: '', qty: 1 }],
      notes: 'Widziany pod klubem Afterlife.',
      criticalInjuries: [{ id: 'i1', name: 'Złamane żebra', effect: 'Ból przy każdym ruchu.' }],
    };
    const after = applyStatistQuick(sheet, { ...statistQuick(sheet), ref: 9 });
    expect(after.stats.ref).toBe(9);
    expect(after.gear).toHaveLength(1);
    expect(after.notes).toBe('Widziany pod klubem Afterlife.');
    expect(after.criticalInjuries).toHaveLength(1);
  });

  it('zostawia drugą broń, którą MG dopisał z pełnej karty', () => {
    const sheet = ganger();
    const withKnife = {
      ...sheet,
      weapons: [
        ...sheet.weapons,
        {
          id: 'w2',
          name: 'Nóż',
          notes: '',
          damage: '1k6',
          ammoCurrent: 0,
          ammoMax: 0,
          ammoType: '',
          rof: '1',
        },
      ],
    };
    const after = applyStatistQuick(withKnife, statistQuick(withKnife));
    expect(after.weapons.map((row) => row.name)).toEqual(['Pistolet', 'Nóż']);
  });

  it('podniesienie katalogowego OB nie cofa zużycia pancerza', () => {
    const sheet = createStatistSheet({ ...createDefaultStatistQuick(), armorSp: 11 });
    const worn = {
      ...sheet,
      armor: sheet.armor.map((row) => ({ ...row, spCurrent: 6 })),
    };
    const after = applyStatistQuick(worn, { ...statistQuick(worn), armorSp: 11 });
    expect(after.armor.find((row) => row.id === STATIST_ARMOR_ROW_IDS.body)?.spCurrent).toBe(6);
  });
});
