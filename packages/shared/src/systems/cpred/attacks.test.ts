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
import type { CpredAmmoProfile } from './ammo.js';
import type { CpredAttachmentProfile } from './attachments.js';
import { CPRED_OBSCUREMENT_KIND } from './environment.js';
import { buildCpredRegistry, createDefaultCharacterData, type CpredRegistry } from './character.js';
import { hasCyberarm } from './cyberware.js';
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
    ammo,
  }: {
    data?: ReturnType<typeof sheet>;
    resolved?: ResolvedWeapon | null;
    row?: ReturnType<typeof weaponRow>;
    metres?: number;
    evasionDv?: number;
    typeId?: string;
    context?: CpredAttackContext;
    ammo?: CpredAmmoProfile | null;
  } = {},
) {
  return planCpredAttack(
    data,
    registry,
    { weaponRowId: row.id, mode: 'single', ...request },
    { row, resolved, ...(typeId ? { typeId } : {}), ...(ammo ? { ammo } : {}) },
    {
      name: 'Ganger',
      tokenId: 'token-1',
      metres,
      ...(evasionDv !== undefined ? { evasionDv } : {}),
    },
    context ?? {},
  );
}

describe('planCpredAttack — połowa pancerza (s. 176–178)', () => {
  const halving: ResolvedWeapon = { ...blade, halvesArmor: true };
  const meleeSheet = sheet({ skills: { 'melee-weapon': 5 } });

  it('niesie flagę na karcie ataku, gdy typ broni ją ma', () => {
    const result = plan({}, { resolved: halving, data: meleeSheet, metres: 1 });
    expect(result.ok && result.plan.attack.halvesArmor).toBe(true);
  });

  it('nie niesie jej dla Bijatyki — podręcznik wyklucza ją wprost (s. 177)', () => {
    const result = plan({}, { resolved: blade, data: meleeSheet, metres: 1 });
    expect(result.ok && result.plan.attack.halvesArmor).toBeUndefined();
  });
});

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

  it('passes the cyberarm rung through to the ladder', () => {
    expect(attackDamageNotation({ damage: '2k6' }, { body: 4 }, 'weapon-type.brawling', true)).toBe(
      '2k6',
    );
    // The chrome only matters bare-handed: a pistol does what the row says.
    expect(
      attackDamageNotation({ damage: '3k6' }, { body: 4 }, 'weapon-type.heavy-pistol', true),
    ).toBe('3k6');
  });
});

describe('hasCyberarm', () => {
  it('needs a foundation piece placed in an arm box', () => {
    expect(hasCyberarm([{ foundation: true, bodySlot: 'armLeft' }])).toBe(true);
    expect(hasCyberarm([{ foundation: true, bodySlot: 'armRight' }])).toBe(true);
  });

  it('is not fooled by a leg, an option or an unplaced limb', () => {
    expect(hasCyberarm([{ foundation: true, bodySlot: 'legRight' }])).toBe(false);
    // A Big Knucks screwed into the arm shares the box and is not an arm.
    expect(hasCyberarm([{ bodySlot: 'armRight' }])).toBe(false);
    // „Które ramię?" is the player's answer; until it comes, nothing is granted.
    expect(hasCyberarm([{ foundation: true, type: 'cyberlimb' }])).toBe(false);
    expect(hasCyberarm([])).toBe(false);
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
    const result = plan({ aimedAt: 'head' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.attack.location).toBe('head');
    expect(result.plan.attack.aimedAt).toBe('head');
    expect(formatRollNotation(result.plan.formula)).toBe('1d10+3'); // 11 − 8
    expect(result.plan.breakdown.some((row) => row.value === -8)).toBe(true);
  });

  it('resolves a leg and a held item against body armour (s. 170)', () => {
    for (const aim of ['leg', 'heldItem'] as const) {
      const result = plan({ aimedAt: aim });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // „Jeśli przez pancerz **na ciele** celu przejdzie choć jeden punkt…”
      expect(result.plan.attack.location).toBe('body');
      expect(result.plan.attack.aimed).toBe(true);
      expect(result.plan.attack.aimedAt).toBe(aim);
      // The −8 is the price of every aim point, not just the head's.
      expect(formatRollNotation(result.plan.formula)).toBe('1d10+3');
    }
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

  it('spends no ammunition and may be aimed like any other attack', () => {
    // „Wykonujesz pojedynczy … atak Dystansowy lub Wręcz, z modyfikatorem -8”
    // (s. 170) — a blade aims at a head exactly as a pistol does.
    const result = plan(
      { aimedAt: 'head' },
      { data, resolved: blade, row: weaponRow({ ammoMax: 0, ammoCurrent: 0 }), metres: 1 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.attack.ammoCost).toBe(0);
    expect(result.plan.attack.aimed).toBe(true);
    expect(result.plan.attack.location).toBe('head');
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

  it('carries the magazine size, which a burst cannot be back-computed from', () => {
    // Fired from a magazine that is already down to 25 of 30: „rounds spent plus
    // rounds left" would say 25, and the card promises capacity.
    const started = weaponRow({ ammoCurrent: 25, ammoMax: 30 });
    const burst = plan({ mode: 'autofire' }, { data, resolved: rifle, row: started, metres: 14 });
    expect(burst.ok && burst.plan.attack.ammoAfter).toBe(15);
    expect(burst.ok && burst.plan.attack.ammoMax).toBe(30);
    expect(burst.ok && burst.plan.attack.ammoCost + burst.plan.attack.ammoAfter).toBe(25);
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
      { mode: 'autofire', aimedAt: 'head' },
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
      { weaponRowId: weaponRow().id, mode: 'single', aimedAt: 'head' },
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

/**
 * Stage 16d — grenades, thrown objects and aiming at the ground.
 *
 * The planner grew a third kind of target and a second way of using a row, and
 * both were meant to arrive *without* a second code path. These tests are the
 * proof: the same call, the same breakdown, the same ammunition accounting.
 */
const grenade: ResolvedWeapon = {
  damage: '6k6',
  magazine: null,
  rof: 1,
  hands: 1,
  concealable: true,
  attachmentSlots: 0,
  skillId: 'athletics',
  rangeDv: [16, 15, 15, 17, 20, 22, 25, null],
  thrown: true,
  explosive: true,
  maxRangeM: 25,
  melee: false,
};

/** The registry above knows nothing of Athletics; grenades need it. */
const throwRegistry: CpredRegistry = buildCpredRegistry(
  {
    skills: [
      { id: 'handgun', name: 'Broń krótka', stat: 'ref' },
      { id: 'melee-weapon', name: 'Broń biała', stat: 'dex' },
      { id: 'athletics', name: 'Atletyka', stat: 'dex' },
      { id: 'evasion', name: 'Unik', stat: 'dex' },
    ],
  },
  { roles: [{ id: 'solo', name: 'Solo', ability: 'Zmysł Walki' }] },
);

function throwPlan(
  request: Partial<CpredAttackRequest>,
  {
    resolved = grenade,
    metres = 10,
    target = { name: 'wybrane pole', point: true as const },
    context = {},
  }: {
    resolved?: ResolvedWeapon | null;
    metres?: number;
    target?: Record<string, unknown>;
    context?: CpredAttackContext;
  } = {},
) {
  const row = weaponRow({
    id: 'w-grenade',
    name: 'Granat',
    damage: '6k6',
    ammoCurrent: 3,
    ammoMax: 3,
  });
  return planCpredAttack(
    sheet({ weapons: [row], skills: { athletics: 4 } }),
    throwRegistry,
    { weaponRowId: row.id, mode: 'single', ...request },
    { row, resolved },
    { metres, ...target } as never,
    context,
  );
}

describe('throwing a charge at a square (stage 16d)', () => {
  it('rolls Athletics rather than the weapon skill', () => {
    const result = throwPlan({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.breakdown.some((entry) => entry.label === 'Atletyka')).toBe(true);
    expect(result.plan.attack.statId).toBe('dex');
    expect(result.plan.attack.thrown).toBe(true);
  });

  it('marks the attack as covering a 10 m square', () => {
    const result = throwPlan({});
    if (!result.ok) throw new Error(result.error);
    expect(result.plan.attack.blastSideM).toBe(10);
  });

  it('reads its DV off the range table like any other ranged attack', () => {
    const result = throwPlan({});
    if (!result.ok) throw new Error(result.error);
    expect(result.plan.attack.dv).toBe(dvForRange(grenade.rangeDv, 10));
    expect(result.plan.attack.dvSource).toBe('range');
  });

  it('refuses a throw past the reach of an arm, even inside the table', () => {
    // 30 m is still a printed band, but no arm reaches it (s. 177).
    expect(throwPlan({}, { metres: 30 })).toEqual({ ok: false, error: 'OUT_OF_RANGE' });
  });

  it('has nothing to aim at: a square has no head', () => {
    const result = throwPlan({ aimedAt: 'head' });
    if (!result.ok) throw new Error(result.error);
    expect(result.plan.attack.aimed).toBe(false);
    expect(result.plan.attack.location).toBe('body');
  });

  it('goes over the car instead of being stopped by it', () => {
    // The same context refuses an ordinary shot (`TARGET_BEHIND_COVER`).
    const context: CpredAttackContext = {
      cover: { name: 'Samochód', hpCurrent: 25, hpMax: 25 },
    };
    expect(throwPlan({}, { context }).ok).toBe(true);
    expect(throwPlan({}, { context, resolved: { ...grenade, explosive: false } })).toEqual({
      ok: false,
      error: 'TARGET_BEHIND_COVER',
    });
  });

  it('spends one charge, like any other single shot', () => {
    const result = throwPlan({});
    if (!result.ok) throw new Error(result.error);
    expect(result.plan.attack.ammoCost).toBe(1);
    expect(result.plan.attack.ammoAfter).toBe(2);
  });

  it('has no fire modes', () => {
    expect(throwPlan({ mode: 'autofire' })).toEqual({ ok: false, error: 'NO_AUTOFIRE' });
  });
});

describe('throwing an ordinary object (stage 16d)', () => {
  /** „PT określasz, używając wiersza Granatnika" — supplied by the caller. */
  const throwProfile = { rangeDv: grenade.rangeDv! };

  it('turns a melee weapon into a ranged attack for one throw', () => {
    const result = throwPlan(
      { thrown: true },
      {
        resolved: blade,
        metres: 10,
        target: { name: 'Ganger', tokenId: 'token-1' },
        context: { throwProfile },
      },
    );
    if (!result.ok) throw new Error(result.error);
    // Ten metres would be out of reach for the same blade swung by hand.
    expect(result.plan.attack.melee).toBe(false);
    expect(result.plan.attack.thrown).toBe(true);
    expect(result.plan.attack.dv).toBe(dvForRange(throwProfile.rangeDv, 10));
    // Damage comes off the sheet row, exactly as it does when the same weapon
    // is swung: throwing changes how you hit, not what you hit with.
    expect(result.plan.attack.damage).toBe('6k6');
    // …and it makes no crater.
    expect(result.plan.attack.blastSideM).toBeUndefined();
  });

  it('rzucona broń biała spotyka pełny pancerz, nie połowę (s. 177)', () => {
    const result = throwPlan(
      { thrown: true },
      {
        resolved: { ...blade, halvesArmor: true },
        metres: 10,
        target: { name: 'Ganger', tokenId: 'token-1' },
        context: { throwProfile },
      },
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.plan.attack.thrown).toBe(true);
    expect(result.plan.attack.halvesArmor).toBeUndefined();
  });

  it('refuses when nobody handed over the range line', () => {
    expect(
      throwPlan(
        { thrown: true },
        { resolved: blade, target: { name: 'Ganger', tokenId: 'token-1' } },
      ),
    ).toEqual({ ok: false, error: 'UNKNOWN_WEAPON' });
  });

  it('still refuses a throw past 25 m', () => {
    expect(
      throwPlan(
        { thrown: true },
        {
          resolved: blade,
          metres: 26,
          target: { name: 'Ganger', tokenId: 'token-1' },
          context: { throwProfile },
        },
      ),
    ).toEqual({ ok: false, error: 'OUT_OF_RANGE' });
  });
});

/* ------------------------------------------------------------------ *
 * Ammunition (stage 16g): what the round in the magazine changes about
 * the attack itself. Everything it changes about the *damage* is in
 * `damage.test.ts` — the planner never touches HP.
 * ------------------------------------------------------------------ */

const shotgun: ResolvedWeapon = {
  ...pistol,
  damage: '5k6',
  magazine: 4,
  rof: 1,
  hands: 2,
  ammoPatterns: ['bullet', 'shell'],
};

const shot: CpredAmmoProfile = {
  id: 'ammo.shot',
  name: 'Amunicja śrutowa',
  patterns: ['shell'],
  spread: { dv: 13, damage: '3k6', coneRangeM: 6 },
  noAim: true,
};

describe('planCpredAttack with special ammunition', () => {
  const shotgunRow = weaponRow({
    id: 'w2',
    name: 'Strzelba',
    damage: '5k6',
    ammoMax: 4,
    ammoCurrent: 4,
  });
  const shotgunSheet = sheet({ weapons: [shotgunRow], skills: { handgun: 6 } });

  function shotPlan(request: Partial<CpredAttackRequest> = {}, metres = 4) {
    return plan(request, {
      data: shotgunSheet,
      resolved: shotgun,
      row: shotgunRow,
      metres,
      ammo: shot,
    });
  }

  it('carries the round onto the card, so the table sees what was fired', () => {
    const result = shotPlan();
    expect(result.ok && result.plan.attack.ammo?.name).toBe('Amunicja śrutowa');
  });

  it('says nothing about ammunition when the magazine holds ordinary rounds', () => {
    const result = plan({});
    expect(result.ok && result.plan.attack.ammo).toBeUndefined();
  });

  it('refuses a round the weapon does not chamber', () => {
    const result = plan({}, { ammo: shot }); // pistol chambers bullets, not shells
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toBe('AMMO_MISMATCH');
    expect(CPRED_ATTACK_PROBLEM_MESSAGES.AMMO_MISMATCH).toContain('nie pasuje');
  });

  it('a spread of shot has a fixed DV, whatever the range table says (s. 174)', () => {
    const near = shotPlan({}, 2);
    const far = shotPlan({}, 6);
    expect(near.ok && near.plan.attack.dv).toBe(13);
    expect(far.ok && far.plan.attack.dv).toBe(13);
    expect(near.ok && near.plan.attack.dvSource).toBe('spread');
  });

  it('a spread of shot rolls the shell’s damage, not the gun’s', () => {
    const result = shotPlan();
    expect(result.ok && result.plan.attack.damage).toBe('3k6');
  });

  it('the cone’s reach is the shot’s whole range', () => {
    const inside = shotPlan({}, 6);
    const outside = shotPlan({}, 7);
    expect(inside.ok).toBe(true);
    expect(inside.ok && inside.plan.attack.coneRangeM).toBe(6);
    expect(outside.ok).toBe(false);
    expect(!outside.ok && outside.error).toBe('OUT_OF_RANGE');
  });

  it('cannot be aimed — the shot spreads (s. 174)', () => {
    const result = shotPlan({ aimedAt: 'head' });
    expect(result.ok && result.plan.attack.aimed).toBe(false);
    expect(result.ok && result.plan.attack.location).toBe('body');
    // …and silently, so the bar's remembered „Celuj" is not an error to clear.
    expect(
      result.ok && result.plan.breakdown.some((entry) => entry.label.includes('celowany')),
    ).toBe(false);
  });

  it('is a single shot only', () => {
    const spreadRifle: ResolvedWeapon = {
      ...shotgun,
      autofire: { max: 3, rangeDv: RIFLE_AUTOFIRE_DV },
    };
    const result = plan(
      { mode: 'autofire' },
      { data: shotgunSheet, resolved: spreadRifle, row: shotgunRow, metres: 4, ammo: shot },
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toBe('AMMO_SINGLE_ONLY');
  });

  it('leaves an ordinary round in the same weapon shooting normally', () => {
    const slug: CpredAmmoProfile = { id: 'ammo.slug', name: 'Breneka', patterns: ['bullet'] };
    const result = plan(
      {},
      { data: shotgunSheet, resolved: shotgun, row: shotgunRow, metres: 24, ammo: slug },
    );
    expect(result.ok && result.plan.attack.dvSource).toBe('range');
    expect(result.ok && result.plan.attack.damage).toBe('5k6');
    expect(result.ok && result.plan.attack.coneRangeM).toBeUndefined();
  });
});

/**
 * Zmysł Walki w rachunku ataku (etap 30a, s. 146). Trzy z sześciu zdolności
 * dotykają tej ścieżki, a każda inaczej: Precyzyjny atak wchodzi do rozbicia
 * rzutu, Wyjście z opresji jedzie flagą do silnika kości, a Wykrycie słabości
 * czeka na kartę obrażeń — i o tym, czy je dostanie, rozstrzyga serwer.
 */
describe('Zmysł Walki w ataku', () => {
  function solo(allocation: Record<string, number>) {
    return sheet({
      weapons: [weaponRow()],
      skills: { handgun: 6 },
      roleId: 'solo',
      roleAbilityRank: 10,
      combatAwareness: allocation,
    });
  }

  it('Precyzyjny atak dokłada nazwany wiersz do rozbicia', () => {
    const planned = plan({}, { data: solo({ preciseAttack: 6 }) });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.breakdown).toContainEqual({
      label: 'Precyzyjny atak 2',
      value: 2,
      kind: 'situational',
    });
    // REF 5 + Broń krótka 6 + 2.
    expect(planned.plan.modifierTotal).toBe(13);
  });

  it('Wyjście z opresji jedzie flagą na karcie ataku', () => {
    const planned = plan({}, { data: solo({ luckyEscape: 4 }) });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.attack.ignoresFumble).toBe(true);
  });

  it('Wykrycie słabości jedzie liczbą — serwer dopiero rozstrzyga, czy się należy', () => {
    const planned = plan({}, { data: solo({ weakSpot: 3 }) });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.attack.weakSpot).toBe(3);
  });

  it('postać bez Zmysłu Walki nie niesie ani wiersza, ani flag', () => {
    const planned = plan({});
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.breakdown.some((entry) => entry.label.startsWith('Precyzyjny'))).toBe(
      false,
    );
    expect(planned.plan.attack.ignoresFumble).toBeUndefined();
    expect(planned.plan.attack.weakSpot).toBeUndefined();
  });

  it('nierozdzielone punkty nic nie dają', () => {
    const planned = plan({}, { data: solo({}) });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.modifierTotal).toBe(11);
    expect(planned.plan.attack.ignoresFumble).toBeUndefined();
  });
});

/**
 * Dodatki do broni (etap 31, s. 342–344).
 *
 * Tu sprawdzamy wyłącznie to, czego nie widać w `attachments.test.ts`: czy
 * rachunek strzału naprawdę je czyta. Same reguły montażu — gniazda, magazynki,
 * „tylko jeden magazynek naraz" — mają własny plik.
 */
describe('dodatki do broni', () => {
  const SMARTGUN: CpredAttachmentProfile = {
    id: 'attachment.smartgun-link',
    name: 'Złącze smartguna',
    fit: {},
    slots: 2,
    attackBonus: 1,
    requiresCyberware: ['Złącza interfejsu'],
  };
  const SCOPE: CpredAttachmentProfile = {
    id: 'attachment.sniper-scope',
    name: 'Snajperska luneta celownicza',
    fit: {},
    rangedBonus: { bonus: 1, minMetres: 51, singleOnly: true, whenAimed: true },
  };
  const NIGHT_SIGHT: CpredAttachmentProfile = {
    id: 'attachment.night-sight',
    name: 'Celownik noktowizyjny',
    fit: {},
    ignoresObscurement: true,
  };
  const BAYONET: CpredAttachmentProfile = {
    id: 'attachment.bayonet',
    name: 'Bagnet',
    fit: {},
    secondary: { weaponTypeId: 'weapon-type.light-melee' },
  };

  /** Lekka broń biała, jak ją zwraca `resolveAttachmentWeapon` dla bagnetu. */
  const bayonetBlade: ResolvedWeapon = { ...blade, damage: '1k6', halvesArmor: true };

  const gunner = () => sheet({ weapons: [weaponRow()], skills: { handgun: 6 } });

  function shoot(
    attachments: CpredAttachmentProfile[],
    {
      data = gunner(),
      metres = 10,
      request = {},
      context,
      secondary,
      row = weaponRow(),
    }: {
      data?: ReturnType<typeof sheet>;
      metres?: number;
      request?: Partial<CpredAttackRequest>;
      context?: CpredAttackContext;
      secondary?: ResolvedWeapon;
      row?: ReturnType<typeof weaponRow>;
    } = {},
  ) {
    return planCpredAttack(
      data,
      registry,
      { weaponRowId: 'w1', mode: 'single', ...request },
      {
        row,
        resolved: pistol,
        typeId: 'weapon-type.medium-pistol',
        attachments,
        ...(secondary ? { secondary } : {}),
      },
      { name: 'Cel', metres },
      context ?? {},
    );
  }

  function breakdownOf(result: ReturnType<typeof shoot>) {
    if (!result.ok) throw new Error(result.error);
    return result.plan.breakdown;
  }

  it('nie dolicza smartguna komuś, kto nie ma się czym do niego podpiąć', () => {
    expect(breakdownOf(shoot([SMARTGUN])).some((e) => e.label === SMARTGUN.name)).toBe(false);
  });

  it('dolicza +1, gdy strzelec ma Złącza interfejsu', () => {
    const wired = sheet({
      weapons: [weaponRow()],
      skills: { handgun: 6 },
      cyberware: [{ id: 'cw', name: 'Złącza interfejsu', notes: '' }],
    });
    expect(breakdownOf(shoot([SMARTGUN], { data: wired }))).toContainEqual({
      label: SMARTGUN.name,
      value: 1,
      kind: 'situational',
    });
  });

  it('luneta płaci dopiero od 51 m, a przy Celowaniu z każdej odległości', () => {
    expect(breakdownOf(shoot([SCOPE], { metres: 50 })).some((e) => e.label === SCOPE.name)).toBe(
      false,
    );
    expect(breakdownOf(shoot([SCOPE], { metres: 51 }))).toContainEqual({
      label: SCOPE.name,
      value: 1,
      kind: 'situational',
    });
    expect(
      breakdownOf(shoot([SCOPE], { metres: 5, request: { aimedAt: 'head' } })).some(
        (e) => e.label === SCOPE.name,
      ),
    ).toBe(true);
  });

  it('noktowizor zdejmuje karę za dym, ale nie rusza Trzymania', () => {
    const context: CpredAttackContext = {
      modifiers: [
        { label: 'Dym', value: -4, kind: CPRED_OBSCUREMENT_KIND },
        { label: 'Trzymanie', value: -2, kind: 'situational' },
      ],
    };
    expect(breakdownOf(shoot([], { context })).some((e) => e.label === 'Dym')).toBe(true);
    const sighted = breakdownOf(shoot([NIGHT_SIGHT], { context }));
    expect(sighted.some((e) => e.label === 'Dym')).toBe(false);
    // „modyfikatory ujemne za strzelanie do celu ukrytego" — nie każda kara.
    expect(sighted.some((e) => e.label === 'Trzymanie')).toBe(true);
  });

  it('strzela bronią doczepioną: jej obrażenia, jej zasięg, jej pancerz', () => {
    const result = shoot([BAYONET], {
      metres: 1,
      request: { attachmentId: BAYONET.id },
      secondary: bayonetBlade,
      row: weaponRow({ attachmentIds: [BAYONET.id] }),
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.plan.attack.damage).toBe('1k6');
    expect(result.plan.attack.melee).toBe(true);
    // Bagnet jest bronią białą, więc przechodzi przez połowę pancerza (s. 176).
    expect(result.plan.attack.halvesArmor).toBe(true);
    expect(result.plan.attack.attachmentName).toBe('Bagnet');
    // Magazynek pistoletu nie drgnął — dźgnięcie nie kosztuje naboju.
    expect(result.plan.attack.ammoCost).toBe(0);
    // Karta niesie obie nazwy: sztukę, którą się trzyma, i to, czym się bije.
    expect(result.plan.title).toContain('Bagnet');
    expect(result.plan.title).toContain('Zgrzyt-9');
  });

  it('bagnetem nie dosięgniesz dalej niż bronią białą', () => {
    expect(
      shoot([BAYONET], {
        metres: 8,
        request: { attachmentId: BAYONET.id },
        secondary: bayonetBlade,
      }),
    ).toEqual({ ok: false, error: 'MELEE_OUT_OF_REACH' });
  });

  it('odmawia strzału dodatkiem, którego na broni nie ma', () => {
    expect(shoot([], { request: { attachmentId: BAYONET.id } })).toEqual({
      ok: false,
      error: 'UNKNOWN_ATTACHMENT',
    });
  });

  it('nabój inteligentny nie wystrzeli bez wymaganej cyborgizacji', () => {
    // „z powodów bezpieczeństwa amunicja inteligentna nie wystrzeli po
    // pociągnięciu za spust" (s. 347) — od etapu 31 odmowa, nie proza.
    const smart: CpredAmmoProfile = {
      id: 'ammo.smart',
      name: 'Amunicja inteligentna',
      patterns: ['bullet'],
      smart: { maxMiss: 4, bonus: 10, requires: 'Celownik optyczny' },
    };
    const withAmmo = (data: ReturnType<typeof sheet>) =>
      planCpredAttack(
        data,
        registry,
        { weaponRowId: 'w1', mode: 'single' },
        {
          row: weaponRow(),
          resolved: { ...pistol, ammoPatterns: ['bullet'] },
          typeId: 'weapon-type.medium-pistol',
          ammo: smart,
        },
        { name: 'Cel', metres: 10 },
      );
    expect(withAmmo(gunner())).toEqual({ ok: false, error: 'AMMO_NEEDS_CYBERWARE' });
    const seeing = sheet({
      weapons: [weaponRow()],
      skills: { handgun: 6 },
      cyberware: [{ id: 'cw', name: 'Celownik optyczny', notes: '' }],
    });
    expect(withAmmo(seeing).ok).toBe(true);
  });
});
