import { describe, expect, it } from 'vitest';
import { formatRollNotation } from '../../dice.js';
import {
  CPRED_ATTACK_PROBLEM_MESSAGES,
  CPRED_BURST_AMMO_COST,
  CPRED_EVERYDAY_DV,
  CPRED_MELEE_REACH_M,
  CPRED_PASSIVE_DIE,
  attackAmmoCost,
  attackDamageNotation,
  autofireDvForRange,
  autofireMultiplier,
  concentrationBase,
  evasionBase,
  passiveEvasionDv,
  planCpredAttack,
  rangeBandFor,
  resolveCpredAttack,
  unarmedDamage,
  type CpredAttackContext,
  type CpredAttackRequest,
} from './attacks.js';
import { buildCpredRegistry, createDefaultCharacterData, type CpredRegistry } from './character.js';
import { dvForRange, type ResolvedWeapon } from './compendium.js';

const registry: CpredRegistry = buildCpredRegistry(
  {
    skills: [
      { id: 'handgun', name: 'Broń krótka', stat: 'ref' },
      { id: 'melee-weapon', name: 'Broń biała', stat: 'dex' },
      { id: 'autofire', name: 'Ogień ciągły', stat: 'ref' },
      { id: 'evasion', name: 'Unik', stat: 'dex' },
      { id: 'concentration', name: 'Koncentracja', stat: 'will' },
    ],
  },
  { roles: [{ id: 'solo', name: 'Solo', ability: 'Zmysł Walki' }] },
);

/** Invented DV rows — the shape matters here, not the rulebook's numbers. */
const PISTOL_DV = [13, 15, 20, 25, 30, 30, null, null];
const RIFLE_AUTOFIRE_DV = [22, 20, 17, 20, 25, null, null, null];

const pistol: ResolvedWeapon = {
  damage: '3k6',
  magazine: 8,
  rof: 2,
  hands: 1,
  concealable: true,
  attachmentSlots: 3,
  skillId: 'handgun',
  rangeDv: PISTOL_DV,
  melee: false,
};

const rifle: ResolvedWeapon = {
  ...pistol,
  damage: '5k6',
  magazine: 25,
  skillId: 'autofire',
  rangeDv: [17, 16, 15, 13, 15, 20, 25, 30],
  autofire: { max: 4, rangeDv: RIFLE_AUTOFIRE_DV },
  suppressive: true,
  melee: false,
};

const blade: ResolvedWeapon = {
  damage: '3k6',
  magazine: null,
  rof: 2,
  hands: 1,
  concealable: false,
  attachmentSlots: 0,
  skillId: 'melee-weapon',
  melee: true,
};

function weaponRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'w1',
    name: 'Zgrzyt-9',
    notes: '',
    damage: '3k6',
    ammoCurrent: 8,
    ammoMax: 8,
    ammoType: 'Ś. Pistolet',
    rof: '2',
    ...overrides,
  } as ReturnType<typeof createDefaultCharacterData>['weapons'][number];
}

/** Sheet with every stat at 5, plus overrides. */
function sheet(overrides: Partial<ReturnType<typeof createDefaultCharacterData>> = {}) {
  return { ...createDefaultCharacterData(), ...overrides };
}

function plan(
  request: Partial<CpredAttackRequest>,
  {
    data = sheet({ weapons: [weaponRow()], skills: { handgun: 6 } }),
    resolved = pistol,
    row = weaponRow(),
    metres = 24,
    evasionDv,
    typeId,
    context,
  }: {
    data?: ReturnType<typeof sheet>;
    resolved?: ResolvedWeapon | null;
    row?: ReturnType<typeof weaponRow>;
    metres?: number;
    evasionDv?: number;
    typeId?: string;
    context?: CpredAttackContext;
  } = {},
) {
  return planCpredAttack(
    data,
    registry,
    { weaponRowId: row.id, mode: 'single', ...request },
    { row, resolved, ...(typeId ? { typeId } : {}) },
    {
      name: 'Ganger',
      tokenId: 'token-1',
      metres,
      ...(evasionDv !== undefined ? { evasionDv } : {}),
    },
    context ?? {},
  );
}

describe('rangeBandFor — band boundaries', () => {
  it('places every boundary metre in the band that prints it', () => {
    expect(rangeBandFor(0)?.id).toBe('0-6');
    expect(rangeBandFor(6)?.id).toBe('0-6');
    expect(rangeBandFor(7)?.id).toBe('7-12');
    expect(rangeBandFor(12)?.id).toBe('7-12');
    expect(rangeBandFor(13)?.id).toBe('13-25');
    expect(rangeBandFor(25)?.id).toBe('13-25');
    expect(rangeBandFor(26)?.id).toBe('26-50');
    expect(rangeBandFor(50)?.id).toBe('26-50');
    expect(rangeBandFor(51)?.id).toBe('51-100');
    expect(rangeBandFor(100)?.id).toBe('51-100');
    expect(rangeBandFor(101)?.id).toBe('101-200');
    expect(rangeBandFor(400)?.id).toBe('201-400');
    expect(rangeBandFor(401)?.id).toBe('401-800');
    expect(rangeBandFor(800)?.id).toBe('401-800');
  });

  it('has nothing beyond the last band', () => {
    expect(rangeBandFor(801)).toBeNull();
  });
});

describe('dvForRange — the DV a distance buys', () => {
  it('reads the band the metre falls into, at both edges', () => {
    expect(dvForRange(PISTOL_DV, 6)).toBe(13);
    expect(dvForRange(PISTOL_DV, 7)).toBe(15);
    expect(dvForRange(PISTOL_DV, 12)).toBe(15);
    expect(dvForRange(PISTOL_DV, 13)).toBe(20);
  });

  it('returns null where the table says the weapon cannot reach', () => {
    expect(dvForRange(PISTOL_DV, 201)).toBeNull();
    expect(dvForRange(PISTOL_DV, 900)).toBeNull();
  });
});

describe('autofireDvForRange', () => {
  it('uses the burst table, which differs from the single-shot one', () => {
    expect(autofireDvForRange(rifle.autofire, 14)).toBe(17);
    expect(dvForRange(rifle.rangeDv, 14)).toBe(15);
  });

  it('stops at 100 m even though the weapon shoots further', () => {
    expect(autofireDvForRange(rifle.autofire, 100)).toBe(25);
    expect(autofireDvForRange(rifle.autofire, 101)).toBeNull();
    expect(dvForRange(rifle.rangeDv, 101)).toBe(20);
  });

  it('is null for a weapon without autofire', () => {
    expect(autofireDvForRange(undefined, 10)).toBeNull();
  });
});

describe('autofireMultiplier', () => {
  it('multiplies by the margin, capped by the weapon', () => {
    expect(autofireMultiplier(1, 4)).toBe(1);
    expect(autofireMultiplier(4, 4)).toBe(4);
    expect(autofireMultiplier(9, 4)).toBe(4);
    expect(autofireMultiplier(2, 3)).toBe(2);
  });

  it('never drops below one — a hit always does its 2k6', () => {
    expect(autofireMultiplier(0, 4)).toBe(1);
    expect(autofireMultiplier(-3, 4)).toBe(1);
  });
});

describe('resolveCpredAttack — ties go to the defender', () => {
  it('needs a total strictly above the DV', () => {
    expect(resolveCpredAttack(16, 15).hit).toBe(true);
    expect(resolveCpredAttack(15, 15).hit).toBe(false);
    expect(resolveCpredAttack(14, 15).hit).toBe(false);
  });

  it('reports the margin on both sides of the DV', () => {
    expect(resolveCpredAttack(21, 17).margin).toBe(4);
    expect(resolveCpredAttack(12, 17).margin).toBe(-5);
  });

  it('computes the burst multiplier only on a hit', () => {
    expect(resolveCpredAttack(21, 17, 4).multiplier).toBe(4);
    expect(resolveCpredAttack(30, 17, 4).multiplier).toBe(4);
    expect(resolveCpredAttack(17, 17, 4).multiplier).toBeUndefined();
  });
});

describe('unarmedDamage — the BODY ladder', () => {
  it('steps at 5, 7 and 11', () => {
    expect(unarmedDamage(4)).toBe('1k6');
    expect(unarmedDamage(5)).toBe('2k6');
    expect(unarmedDamage(6)).toBe('2k6');
    expect(unarmedDamage(7)).toBe('3k6');
    expect(unarmedDamage(10)).toBe('3k6');
    expect(unarmedDamage(11)).toBe('4k6');
  });

  it('lifts a weak attacker to 2k6 with a cyberarm', () => {
    expect(unarmedDamage(3, true)).toBe('2k6');
    expect(unarmedDamage(8, true)).toBe('3k6');
  });
});

describe('attackDamageNotation', () => {
  it('uses the row’s notation for an ordinary weapon', () => {
    expect(attackDamageNotation({ damage: '5k6' }, { body: 9 }, 'weapon-type.assault-rifle')).toBe(
      '5k6',
    );
  });

  it('reads bare hands off BODY instead of the row', () => {
    expect(attackDamageNotation({ damage: '2k6' }, { body: 11 }, 'weapon-type.brawling')).toBe(
      '4k6',
    );
    expect(attackDamageNotation({ damage: '2k6' }, { body: 4 }, 'weapon-type.martial-arts')).toBe(
      '1k6',
    );
  });
});

describe('attackAmmoCost', () => {
  it('spends one round per shot and ten per burst', () => {
    expect(attackAmmoCost('single', { ammoMax: 25 })).toBe(1);
    expect(attackAmmoCost('autofire', { ammoMax: 25 })).toBe(CPRED_BURST_AMMO_COST);
    expect(attackAmmoCost('suppressive', { ammoMax: 25 })).toBe(CPRED_BURST_AMMO_COST);
  });

  it('spends nothing on a weapon that counts no rounds', () => {
    expect(attackAmmoCost('single', { ammoMax: 0 })).toBe(0);
  });
});

describe('planCpredAttack — a single shot', () => {
  it('builds REF + skill + 1k10 and reads the DV off the distance', () => {
    const result = plan({}, { metres: 24 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(formatRollNotation(result.plan.formula)).toBe('1d10+11'); // REF 5 + Broń krótka 6
    expect(result.plan.attack.dv).toBe(20);
    expect(result.plan.attack.dvSource).toBe('range');
    expect(result.plan.attack.rangeLabel).toBe('13–25 m');
    expect(result.plan.attack.metres).toBe(24);
  });

  it('gives the same pistol a different DV at 5 m and at 45 m', () => {
    const near = plan({}, { metres: 5 });
    const far = plan({}, { metres: 45 });
    expect(near.ok && near.plan.attack.dv).toBe(13);
    expect(far.ok && far.plan.attack.dv).toBe(25);
    expect(near.ok && near.plan.attack.rangeLabel).toBe('0–6 m');
    expect(far.ok && far.plan.attack.rangeLabel).toBe('26–50 m');
  });

  it('spends one round and reports the magazine before and after', () => {
    const result = plan({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.attack.ammoCost).toBe(1);
    expect(result.plan.attack.ammoBefore).toBe(8);
    expect(result.plan.attack.ammoAfter).toBe(7);
  });

  it('refuses to fire an empty weapon', () => {
    const result = plan({}, { row: weaponRow({ ammoCurrent: 0 }) });
    expect(result).toEqual({ ok: false, error: 'NOT_ENOUGH_AMMO' });
  });

  it('refuses a target the table cannot reach', () => {
    expect(plan({}, { metres: 300 })).toEqual({ ok: false, error: 'OUT_OF_RANGE' });
  });

  it('applies the aimed-shot penalty and aims at the head', () => {
    const result = plan({ aimed: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.attack.location).toBe('head');
    expect(formatRollNotation(result.plan.formula)).toBe('1d10+3'); // 11 − 8
    expect(result.plan.breakdown.some((row) => row.value === -8)).toBe(true);
  });

  it('carries the wound penalty into the attack like any other check', () => {
    const hurt = sheet({ hpCurrent: 10, weapons: [weaponRow()], skills: { handgun: 6 } });
    const result = plan({}, { data: hurt });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(formatRollNotation(result.plan.formula)).toBe('1d10+9'); // 11 − 2
    expect(result.plan.woundState).toBe('serious');
  });

  it('rejects more Luck than the sheet holds', () => {
    expect(plan({ luckSpent: 99 })).toEqual({ ok: false, error: 'NOT_ENOUGH_LUCK' });
  });
});

describe('planCpredAttack — melee', () => {
  const data = sheet({ weapons: [weaponRow()], skills: { 'melee-weapon': 8 } });

  it('rolls DEX, not REF, and uses the defender’s stand-in DV', () => {
    const result = plan({}, { data, resolved: blade, metres: 2, evasionDv: 14 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(formatRollNotation(result.plan.formula)).toBe('1d10+13'); // ZW 5 + Broń biała 8
    expect(result.plan.attack.dv).toBe(14);
    expect(result.plan.attack.dvSource).toBe('evasion');
    expect(result.plan.attack.rangeLabel).toBeNull();
  });

  it('falls back to the everyday DV against a target with no sheet', () => {
    const result = plan({}, { data, resolved: blade, metres: 1 });
    expect(result.ok && result.plan.attack.dv).toBe(CPRED_EVERYDAY_DV);
    expect(result.ok && result.plan.attack.dvSource).toBe('everyday');
  });

  it('refuses a target beyond reach, at exactly one metre past it', () => {
    expect(plan({}, { data, resolved: blade, metres: CPRED_MELEE_REACH_M })).toMatchObject({
      ok: true,
    });
    expect(plan({}, { data, resolved: blade, metres: CPRED_MELEE_REACH_M + 1 })).toEqual({
      ok: false,
      error: 'MELEE_OUT_OF_REACH',
    });
  });

  it('spends no ammunition and cannot be aimed', () => {
    const result = plan(
      { aimed: true },
      { data, resolved: blade, row: weaponRow({ ammoMax: 0, ammoCurrent: 0 }), metres: 1 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.attack.ammoCost).toBe(0);
    expect(result.plan.attack.aimed).toBe(false);
    expect(result.plan.attack.location).toBe('body');
  });

  it('reads bare-hand damage off BODY', () => {
    const strong = sheet({
      stats: { ...createDefaultCharacterData().stats, body: 11 },
      skills: { 'melee-weapon': 4 },
    });
    const result = plan(
      {},
      {
        data: strong,
        resolved: blade,
        row: weaponRow({ damage: '2k6', ammoMax: 0, ammoCurrent: 0 }),
        metres: 1,
        typeId: 'weapon-type.brawling',
      },
    );
    expect(result.ok && result.plan.attack.damage).toBe('4k6');
  });
});

describe('planCpredAttack — autofire', () => {
  const data = sheet({ weapons: [weaponRow()], skills: { autofire: 6 } });
  const row = weaponRow({ name: 'Karabin', damage: '5k6', ammoCurrent: 25, ammoMax: 25 });

  it('rolls the autofire skill against the autofire table and deals 2k6', () => {
    const result = plan({ mode: 'autofire' }, { data, resolved: rifle, row, metres: 14 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.attack.dv).toBe(17);
    expect(result.plan.attack.dvSource).toBe('autofire');
    expect(result.plan.attack.damage).toBe('2k6');
    expect(result.plan.attack.autofireMax).toBe(4);
    expect(formatRollNotation(result.plan.formula)).toBe('1d10+11'); // REF 5 + Ogień ciągły 6
  });

  it('spends ten rounds and refuses a burst with nine left', () => {
    const ok = plan({ mode: 'autofire' }, { data, resolved: rifle, row, metres: 14 });
    expect(ok.ok && ok.plan.attack.ammoCost).toBe(10);
    expect(ok.ok && ok.plan.attack.ammoAfter).toBe(15);
    const short = plan(
      { mode: 'autofire' },
      { data, resolved: rifle, row: weaponRow({ ammoCurrent: 9, ammoMax: 25 }), metres: 14 },
    );
    expect(short).toEqual({ ok: false, error: 'NOT_ENOUGH_AMMO' });
  });

  it('refuses a weapon without the fire mode', () => {
    expect(plan({ mode: 'autofire' }, { resolved: pistol })).toEqual({
      ok: false,
      error: 'NO_AUTOFIRE',
    });
    expect(plan({ mode: 'suppressive' }, { resolved: pistol })).toEqual({
      ok: false,
      error: 'NO_SUPPRESSIVE',
    });
  });

  it('refuses a burst past the autofire table even though the weapon reaches', () => {
    expect(plan({ mode: 'autofire' }, { data, resolved: rifle, row, metres: 120 })).toEqual({
      ok: false,
      error: 'OUT_OF_RANGE',
    });
    expect(plan({ mode: 'single' }, { data, resolved: rifle, row, metres: 120 })).toMatchObject({
      ok: true,
    });
  });

  it('cannot be aimed', () => {
    const result = plan(
      { mode: 'autofire', aimed: true },
      { data, resolved: rifle, row, metres: 14 },
    );
    expect(result.ok && result.plan.attack.aimed).toBe(false);
  });
});

describe('planCpredAttack — suppressive fire', () => {
  const data = sheet({ weapons: [weaponRow()], skills: { autofire: 6 } });
  const row = weaponRow({ ammoCurrent: 25, ammoMax: 25 });

  it('has no DV of its own — the roll becomes the targets’ DV', () => {
    const result = plan({ mode: 'suppressive' }, { data, resolved: rifle, row, metres: 20 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.attack.dv).toBeNull();
    expect(result.plan.attack.dvSource).toBe('suppressive');
    expect(result.plan.attack.ammoCost).toBe(10);
  });
});

describe('defence values read off a sheet', () => {
  const data = sheet({ skills: { evasion: 4, concentration: 3 } });

  it('adds DEX to Evasion, and half a die for the stand-in DV', () => {
    expect(evasionBase(data, registry)).toBe(9); // ZW 5 + Unik 4
    expect(passiveEvasionDv(data, registry)).toBe(9 + CPRED_PASSIVE_DIE);
  });

  it('adds WILL to Concentration for suppressive fire', () => {
    expect(concentrationBase(data, registry)).toBe(8); // SW 5 + Koncentracja 3
  });

  it('works on a sheet with neither skill trained', () => {
    expect(evasionBase(sheet(), registry)).toBe(5);
    expect(concentrationBase(sheet(), registry)).toBe(5);
  });
});

describe('planCpredAttack — line of fire (stage 16b)', () => {
  const data = sheet({ weapons: [weaponRow()], skills: { handgun: 6, 'melee-weapon': 6 } });

  it('refuses a shot the server measured as blocked', () => {
    expect(plan({}, { data, context: { lineOfFire: false } })).toEqual({
      ok: false,
      error: 'NO_LINE_OF_FIRE',
    });
  });

  it('lets the shot through when the line is clear', () => {
    expect(plan({}, { data, context: { lineOfFire: true } })).toMatchObject({ ok: true });
  });

  it('judges nothing when the caller could not measure — the sheet preview', () => {
    expect(plan({}, { data, context: {} })).toMatchObject({ ok: true });
  });

  it('outranks the range table: a wall is not „out of range"', () => {
    // 900 m is off the end of the pistol's table, so without the wall this
    // would answer OUT_OF_RANGE — and send the player stepping closer instead
    // of round the corner.
    expect(plan({}, { data, metres: 900, context: { lineOfFire: false } })).toEqual({
      ok: false,
      error: 'NO_LINE_OF_FIRE',
    });
  });

  it('stops a fist too — a wall is a wall', () => {
    expect(plan({}, { data, resolved: blade, metres: 2, context: { lineOfFire: false } })).toEqual({
      ok: false,
      error: 'NO_LINE_OF_FIRE',
    });
  });

  it('leaves suppressive fire alone — it sprays an area, not a token', () => {
    const row = weaponRow({ ammoCurrent: 25, ammoMax: 25 });
    const gunner = sheet({ weapons: [row], skills: { autofire: 6 } });
    expect(
      plan(
        { mode: 'suppressive' },
        { data: gunner, resolved: rifle, row, metres: 20, context: { lineOfFire: false } },
      ),
    ).toMatchObject({ ok: true });
  });
});

describe('planCpredAttack — cover (stage 16c)', () => {
  const data = sheet({ weapons: [weaponRow()], skills: { handgun: 6, 'melee-weapon': 6 } });
  const car = { name: 'Samochód', hpCurrent: 25, hpMax: 25 };

  it('refuses a shot at somebody behind a cover', () => {
    expect(plan({}, { data, context: { cover: car } })).toEqual({
      ok: false,
      error: 'TARGET_BEHIND_COVER',
    });
  });

  it('lets it through when the table rules the target leaned out', () => {
    expect(plan({ ignoreCover: true }, { data, context: { cover: car } })).toMatchObject({
      ok: true,
    });
  });

  it('leaves suppressive fire alone, as walls do', () => {
    const row = weaponRow({ ammoCurrent: 25, ammoMax: 25 });
    const gunner = sheet({ weapons: [row], skills: { autofire: 6 } });
    expect(
      plan(
        { mode: 'suppressive' },
        { data: gunner, resolved: rifle, row, metres: 20, context: { cover: car } },
      ),
    ).toMatchObject({ ok: true });
  });

  it('reads the DV off the range table when the cover *is* the target', () => {
    const shot = planCpredAttack(
      data,
      registry,
      { weaponRowId: weaponRow().id, mode: 'single' },
      { row: weaponRow(), resolved: pistol },
      { name: 'Samochód', coverId: 7, metres: 24, cover: true },
    );
    expect(shot).toMatchObject({ ok: true });
    if (!shot.ok) return;
    expect(shot.plan.attack.dv).toBe(dvForRange(PISTOL_DV, 24));
    expect(shot.plan.attack.targetCoverId).toBe(7);
    expect(shot.plan.attack.targetTokenId).toBeUndefined();
  });

  it('drops the aimed shot against an object — a car has no head', () => {
    const shot = planCpredAttack(
      data,
      registry,
      { weaponRowId: weaponRow().id, mode: 'single', aimed: true },
      { row: weaponRow(), resolved: pistol },
      { name: 'Samochód', coverId: 7, metres: 24, cover: true },
    );
    expect(shot).toMatchObject({ ok: true });
    if (!shot.ok) return;
    expect(shot.plan.attack.aimed).toBe(false);
    expect(shot.plan.attack.location).toBe('body');
  });

  it('refuses to suppress an object', () => {
    const row = weaponRow({ ammoCurrent: 25, ammoMax: 25 });
    const gunner = sheet({ weapons: [row], skills: { autofire: 6 } });
    expect(
      planCpredAttack(
        gunner,
        registry,
        { weaponRowId: row.id, mode: 'suppressive' },
        { row, resolved: rifle },
        { name: 'Samochód', coverId: 7, metres: 20, cover: true },
      ),
    ).toEqual({ ok: false, error: 'COVER_NOT_SUPPRESSIBLE' });
  });

  it('still charges the ammunition for a shot at a car', () => {
    const row = weaponRow({ ammoCurrent: 8, ammoMax: 8 });
    const shot = planCpredAttack(
      sheet({ weapons: [row], skills: { handgun: 6 } }),
      registry,
      { weaponRowId: row.id, mode: 'single' },
      { row, resolved: pistol },
      { name: 'Samochód', coverId: 7, metres: 10, cover: true },
    );
    expect(shot).toMatchObject({ ok: true });
    if (!shot.ok) return;
    expect(shot.plan.attack.ammoAfter).toBe(7);
  });
});

describe('problem messages', () => {
  it('has Polish text for every problem the planner can return', () => {
    for (const message of Object.values(CPRED_ATTACK_PROBLEM_MESSAGES)) {
      expect(message.length).toBeGreaterThan(0);
    }
  });
});
