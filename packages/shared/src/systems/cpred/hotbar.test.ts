import { describe, expect, it } from 'vitest';
import {
  CPRED_HOTBAR_KEYED_SLOTS,
  cpredFireModes,
  cpredWeaponIcon,
  cpredWeaponOptions,
  hotbarSlotsFor,
  type CpredHotbarInput,
  type CpredHotbarWeaponSlot,
} from './hotbar.js';
import type { ResolvedWeapon } from './compendium.js';
import type { CpredWeaponRow } from './character.js';
import { createDefaultCombatProfile } from './statist.js';
import { CPRED_ACTION_RUN, CPRED_ACTION_STAND_UP } from './turn.js';

/**
 * Stage 16f: the action bar is generated from what the token can do, so the
 * only thing worth testing is that generation — which weapon becomes how many
 * slots, and which of them are already refused before anybody clicks.
 */

const pistol: ResolvedWeapon = {
  damage: '3k6',
  magazine: 12,
  rof: 2,
  hands: 1,
  concealable: true,
  attachmentSlots: 3,
  skillId: 'handgun',
  rangeDv: [13, 15, 20, 25, 30, 30, null, null],
  melee: false,
};

const smg: ResolvedWeapon = {
  ...pistol,
  magazine: 30,
  autofire: { max: 3, rangeDv: [13, 15, 20, 25, 30, 30, null, null] },
  suppressive: true,
};

const knife: ResolvedWeapon = { ...pistol, magazine: null, melee: true, rangeDv: undefined };

function weaponRow(overrides: Partial<CpredWeaponRow> = {}): CpredWeaponRow {
  return {
    id: 'row-1',
    name: 'Ciężki pistolet',
    damage: '3k6',
    ammoCurrent: 8,
    ammoMax: 12,
    ammoType: 'Pistoletowa',
    rof: '2',
    notes: '',
    compendiumId: 'weapon.heavy-pistol',
    ...overrides,
  } as CpredWeaponRow;
}

function input(overrides: Partial<CpredHotbarInput> = {}): CpredHotbarInput {
  return {
    sheet: { weapons: [weaponRow()] },
    profile: null,
    resolve: () => pistol,
    statuses: [],
    turn: null,
    isGm: false,
    ...overrides,
  };
}

const weaponSlots = (slots: ReturnType<typeof hotbarSlotsFor>): CpredHotbarWeaponSlot[] =>
  slots.filter((slot): slot is CpredHotbarWeaponSlot => slot.kind === 'weapon');

describe('cpredWeaponOptions — sheet or statist profile, never both', () => {
  it('reads the sheet rows when there is a sheet', () => {
    const options = cpredWeaponOptions(
      { weapons: [weaponRow(), weaponRow({ id: 'row-2', name: 'Maczeta', ammoMax: 0 })] },
      null,
      () => pistol,
    );
    expect(options.map((option) => option.name)).toEqual(['Ciężki pistolet', 'Maczeta']);
    expect(options[0]!.ammo).toEqual({ current: 8, max: 12 });
    // A weapon that counts no rounds gets no magazine badge at all.
    expect(options[1]!.ammo).toBeNull();
  });

  it('falls back to the single weapon of a combat profile (stage 16b)', () => {
    const profile = {
      ...createDefaultCombatProfile(),
      weaponName: 'Obrzyn',
      ammoCurrent: 1,
      ammoMax: 2,
    };
    const options = cpredWeaponOptions(null, profile, () => pistol);
    expect(options).toHaveLength(1);
    expect(options[0]!.name).toBe('Obrzyn');
    expect(options[0]!.ammo).toEqual({ current: 1, max: 2 });
  });

  it('gives an unstatted token nothing to shoot with', () => {
    expect(cpredWeaponOptions(null, null, () => pistol)).toEqual([]);
  });
});

describe('cpredFireModes — the weapon decides how many slots it takes', () => {
  it('gives a plain pistol one mode', () => {
    expect(cpredFireModes(pistol)).toEqual(['single']);
  });

  it('grows the row only for a weapon that really bursts', () => {
    expect(cpredFireModes(smg)).toEqual(['single', 'autofire', 'suppressive']);
  });

  it('treats an unknown weapon as a single-shot one', () => {
    expect(cpredFireModes(null)).toEqual(['single']);
  });
});

describe('hotbarSlotsFor — weapons', () => {
  it('turns each fire mode into its own slot', () => {
    const slots = weaponSlots(hotbarSlotsFor(input({ resolve: () => smg })));
    expect(slots.map((slot) => slot.mode)).toEqual(['single', 'autofire', 'suppressive']);
    expect(slots[0]!.weaponRowId).toBe('row-1');
  });

  it('keeps the fire mode out of the label so it cannot be truncated away', () => {
    const slots = weaponSlots(hotbarSlotsFor(input({ resolve: () => smg })));
    expect(slots.map((slot) => slot.label)).toEqual([
      'Ciężki pistolet',
      'Ciężki pistolet',
      'Ciężki pistolet',
    ]);
    expect(slots.map((slot) => slot.modeLabel)).toEqual([null, 'seria', 'zapora']);
  });

  it('refuses a single shot from an empty magazine', () => {
    const slots = weaponSlots(
      hotbarSlotsFor(input({ sheet: { weapons: [weaponRow({ ammoCurrent: 0 })] } })),
    );
    expect(slots[0]!.disabled).toMatch(/Pusty magazynek/);
  });

  it('refuses a burst that cannot pay its ten rounds, while the single shot stays live', () => {
    const slots = weaponSlots(
      hotbarSlotsFor(
        input({ sheet: { weapons: [weaponRow({ ammoCurrent: 4 })] }, resolve: () => smg }),
      ),
    );
    expect(slots[0]!.disabled).toBeNull();
    expect(slots[1]!.disabled).toMatch(/Za mało amunicji/);
  });

  it('never refuses a weapon that counts no rounds', () => {
    const slots = weaponSlots(
      hotbarSlotsFor(
        input({
          sheet: { weapons: [weaponRow({ ammoMax: 0, ammoCurrent: 0, name: 'Maczeta' })] },
          resolve: () => knife,
        }),
      ),
    );
    expect(slots[0]!.disabled).toBeNull();
    expect(slots[0]!.melee).toBe(true);
  });
});

describe('hotbarSlotsFor — reloading', () => {
  it('offers a reload only for a weapon with a magazine', () => {
    const slots = hotbarSlotsFor(
      input({
        sheet: { weapons: [weaponRow(), weaponRow({ id: 'row-2', name: 'Maczeta', ammoMax: 0 })] },
      }),
    );
    const reloads = slots.filter((slot) => slot.kind === 'reload');
    expect(reloads).toHaveLength(1);
    expect(reloads[0]!.id).toBe('reload:row-1');
  });

  it('greys out a reload of a full magazine', () => {
    const slots = hotbarSlotsFor(input({ sheet: { weapons: [weaponRow({ ammoCurrent: 12 })] } }));
    const reload = slots.find((slot) => slot.kind === 'reload');
    expect(reload?.disabled).toMatch(/pełny/);
  });

  it('offers no reload to a statist — `weapon:reload` writes to a sheet row', () => {
    const profile = { ...createDefaultCombatProfile(), ammoCurrent: 1, ammoMax: 6 };
    const slots = hotbarSlotsFor(input({ sheet: null, profile }));
    expect(slots.some((slot) => slot.kind === 'reload')).toBe(false);
    // …but the weapon itself is still there to fire.
    expect(weaponSlots(slots)).toHaveLength(1);
  });
});

describe('hotbarSlotsFor — what a status and a spent turn forbid', () => {
  it('greys out weapons and actions for a token that may not act', () => {
    const slots = hotbarSlotsFor(input({ statuses: ['unconscious'] }));
    expect(weaponSlots(slots)[0]!.disabled).not.toBeNull();
    const stand = slots.find(
      (slot) => slot.kind === 'action' && slot.actionId === CPRED_ACTION_STAND_UP,
    );
    expect(stand?.disabled).not.toBeNull();
  });

  it('keeps „Wstanie" live for a Powalony token — it is the cure, not the symptom', () => {
    const slots = hotbarSlotsFor(input({ statuses: ['prone'] }));
    const stand = slots.find(
      (slot) => slot.kind === 'action' && slot.actionId === CPRED_ACTION_STAND_UP,
    );
    expect(stand?.disabled).toBeNull();
    // …while Bieg, which is movement, is not.
    const run = slots.find((slot) => slot.kind === 'action' && slot.actionId === CPRED_ACTION_RUN);
    expect(run?.disabled).not.toBeNull();
  });

  it('refuses everything Action-priced once the turn Action is gone', () => {
    const slots = hotbarSlotsFor(input({ turn: { actionSpent: true, moveSpent: true } }));
    expect(weaponSlots(slots)[0]!.disabled).toMatch(/już wykorzystana/);
  });

  it('never refuses the GM, whose overspend is logged rather than blocked', () => {
    const slots = hotbarSlotsFor(
      input({ turn: { actionSpent: true, moveSpent: true }, isGm: true }),
    );
    expect(weaponSlots(slots)[0]!.disabled).toBeNull();
  });

  it('holds Bieg back until the Move Action of this turn has been used (RAW)', () => {
    const before = hotbarSlotsFor(input({ turn: { actionSpent: false, moveSpent: false } }));
    const after = hotbarSlotsFor(input({ turn: { actionSpent: false, moveSpent: true } }));
    const runOf = (slots: ReturnType<typeof hotbarSlotsFor>) =>
      slots.find((slot) => slot.kind === 'action' && slot.actionId === CPRED_ACTION_RUN);
    expect(runOf(before)?.disabled).toMatch(/Bieg wymaga/);
    expect(runOf(after)?.disabled).toBeNull();
  });
});

describe('hotbarSlotsFor — grappling turns one slot into its opposite', () => {
  it('offers „Wyrwij się" to whoever is Held', () => {
    const slots = hotbarSlotsFor(input({ grapple: 'defender' }));
    const grapple = slots.find((slot) => slot.kind === 'action' && slot.actionId === 'grapple');
    expect(grapple?.label).toBe('Wyrwij się');
  });

  it('offers the whole Hold to the one doing the holding — choking is an Action too', () => {
    const slots = hotbarSlotsFor(input({ grapple: 'attacker' }));
    const grapple = slots.find((slot) => slot.kind === 'action' && slot.actionId === 'grapple');
    expect(grapple?.label).toBe('Zwarcie');
  });
});

describe('hotbarSlotsFor — keys', () => {
  it('numbers the first nine slots and leaves the rest mouse-only', () => {
    const weapons = Array.from({ length: 6 }, (_, index) =>
      weaponRow({ id: `row-${index}`, name: `Broń ${index}` }),
    );
    const slots = hotbarSlotsFor(input({ sheet: { weapons }, resolve: () => smg }));
    expect(slots.length).toBeGreaterThan(CPRED_HOTBAR_KEYED_SLOTS);
    expect(slots.slice(0, CPRED_HOTBAR_KEYED_SLOTS).map((slot) => slot.key)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
    ]);
    expect(slots[CPRED_HOTBAR_KEYED_SLOTS]!.key).toBeNull();
  });

  it('gives an unstatted token only the catalogue actions', () => {
    const slots = hotbarSlotsFor(input({ sheet: null, profile: null }));
    expect(slots.every((slot) => slot.kind === 'action')).toBe(true);
  });
});

/**
 * Stage 27h: the panel draws a picture per slot, and the picture is a rules
 * decision — „which of these is a shotgun" is answered by the compendium, never
 * by matching words in a weapon's name.
 */
describe('cpredWeaponIcon', () => {
  it('reads the weapon type first, whatever the row is called', () => {
    expect(cpredWeaponIcon({ ...pistol, typeId: 'weapon-type.shotgun' })).toBe('shotgun');
    expect(cpredWeaponIcon({ ...pistol, typeId: 'weapon-type.very-heavy-pistol' })).toBe(
      'revolver',
    );
    expect(cpredWeaponIcon({ ...smg, typeId: 'weapon-type.heavy-submachine-gun' })).toBe(
      'smg-heavy',
    );
  });

  it('falls back to the skill when the type is one nobody mapped', () => {
    expect(
      cpredWeaponIcon({ ...pistol, typeId: 'weapon-type.sample-rifle', skillId: 'shoulder-arms' }),
    ).toBe('rifle');
    expect(cpredWeaponIcon({ ...knife, typeId: undefined, skillId: 'melee-weapon' })).toBe('sword');
  });

  it('falls back to what the weapon does when it has neither', () => {
    expect(cpredWeaponIcon({ ...pistol, skillId: null, explosive: true })).toBe('grenade');
    expect(cpredWeaponIcon({ ...pistol, skillId: null, thrown: true })).toBe('knife');
    expect(cpredWeaponIcon({ ...knife, skillId: null })).toBe('sword');
    expect(cpredWeaponIcon(null)).toBe('pistol');
  });

  it('puts a picture on every slot the bar builds', () => {
    const slots = hotbarSlotsFor(input({ resolve: () => smg }));
    expect(slots.every((slot) => slot.icon.length > 0)).toBe(true);
    const reload = slots.find((slot) => slot.kind === 'reload');
    expect(reload?.icon).toBe('reload');
    const stand = slots.find(
      (slot) => slot.kind === 'action' && slot.actionId === CPRED_ACTION_STAND_UP,
    );
    expect(stand?.icon).toBe('stand-up');
  });
});
