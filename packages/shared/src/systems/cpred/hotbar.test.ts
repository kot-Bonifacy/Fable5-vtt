import { describe, expect, it } from 'vitest';
import {
  CPRED_HOTBAR_KEYED_SLOTS,
  cpredFireModes,
  cpredHotbarGroups,
  cpredNextWeaponMode,
  cpredWeaponIcon,
  cpredWeaponModeSlot,
  cpredWeaponOptions,
  hotbarSlotsFor,
  type CpredHotbarInput,
  type CpredHotbarWeaponSlot,
} from './hotbar.js';
import { CPRED_JAM_REFUSAL } from './attacks.js';
import type { ResolvedWeapon, WeaponTypeDefinition } from './compendium.js';
import type { CpredAttachmentProfile } from './attachments.js';
import type { CpredWeaponRow } from './character.js';
import { createDefaultCombatProfile } from './statist.js';
import {
  CPRED_ACTION_COMBAT_AWARENESS,
  CPRED_ACTION_RUN,
  CPRED_ACTION_SCANNER,
  CPRED_ACTION_STAND_UP,
} from './turn.js';

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

  it('offers a statist the same reload as a sheet (29.08)', () => {
    const profile = { ...createDefaultCombatProfile(), ammoCurrent: 1, ammoMax: 6 };
    const slots = hotbarSlotsFor(input({ sheet: null, profile }));
    const reload = slots.find((slot) => slot.kind === 'reload');
    expect(reload).toBeDefined();
    expect(reload?.disabled).toBeNull();
    expect(weaponSlots(slots)).toHaveLength(1);
  });

  it('greys out a statist whose magazine is already full', () => {
    const profile = { ...createDefaultCombatProfile(), ammoCurrent: 6, ammoMax: 6 };
    const slots = hotbarSlotsFor(input({ sheet: null, profile }));
    const reload = slots.find((slot) => slot.kind === 'reload');
    expect(reload?.disabled).toMatch(/pełny/);
  });

  it('gives an unarmed statist nothing to reload — no magazine, no box', () => {
    const profile = { ...createDefaultCombatProfile(), ammoCurrent: 0, ammoMax: 0 };
    const slots = hotbarSlotsFor(input({ sheet: null, profile }));
    expect(slots.some((slot) => slot.kind === 'reload')).toBe(false);
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

describe('hotbarSlotsFor — a wound says why, a spent Action says when', () => {
  const spine = 'Uraz kręgosłupa: w kolejnej Turze nie możesz wykonać Akcji.';

  it('puts the wound’s own sentence on the slot instead of „już wykorzystana"', () => {
    const slots = hotbarSlotsFor(
      input({ turn: { actionSpent: true, moveSpent: false, blockedAction: spine } }),
    );
    // The Action *is* counted as spent (that is how the tracker paints it), so
    // without the reason the button would blame the player for using it.
    expect(weaponSlots(slots)[0]!.disabled).toBe(spine);
  });

  it('says the same thing to the GM, because it is a fact about the figure', () => {
    const slots = hotbarSlotsFor(
      input({ turn: { actionSpent: true, moveSpent: false, blockedAction: spine }, isGm: true }),
    );
    expect(weaponSlots(slots)[0]!.disabled).toBe(spine);
  });

  it('lets a status outrank the wound — both are true, one is being looked at', () => {
    const slots = hotbarSlotsFor(
      input({
        statuses: ['unconscious'],
        turn: { actionSpent: true, moveSpent: false, blockedAction: spine },
      }),
    );
    expect(weaponSlots(slots)[0]!.disabled).not.toBe(spine);
  });

  it('carries the movement block to Bieg the same way', () => {
    const leg = 'Złamana noga: w tej Turze nie wykonasz Akcji Ruchu.';
    const slots = hotbarSlotsFor(
      input({ turn: { actionSpent: false, moveSpent: true, blockedMove: leg } }),
    );
    const run = slots.find((slot) => slot.kind === 'action' && slot.actionId === CPRED_ACTION_RUN);
    expect(run?.disabled).toBe(leg);
  });
});

describe('hotbarSlotsFor — Skaner (26b)', () => {
  const scannerOf = (slots: ReturnType<typeof hotbarSlotsFor>) =>
    slots.find((slot) => slot.kind === 'action' && slot.actionId === CPRED_ACTION_SCANNER);

  it('gives the slot to a netrunner — the only figure whose click the server honours', () => {
    const slots = hotbarSlotsFor(input({ netrunner: true }));
    expect(scannerOf(slots)?.label).toBe('Skaner');
    // No form: the roll happens where the figure stands, with nothing to fill in.
    expect(scannerOf(slots)?.kind === 'action' && scannerOf(slots)).toMatchObject({
      needsForm: false,
    });
  });

  it('leaves it off every other bar', () => {
    expect(scannerOf(hotbarSlotsFor(input()))).toBeUndefined();
  });

  it('costs an Action like anything else — a spent turn greys it out', () => {
    const slots = hotbarSlotsFor(
      input({ netrunner: true, turn: { actionSpent: true, moveSpent: false } }),
    );
    expect(scannerOf(slots)?.disabled).toMatch(/już wykorzystana/);
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

/**
 * Stage 27h, second pass: the panel draws one box per weapon and folds the fire
 * modes inside it, while the flat list keeps its shape for the bot's turn.
 */
describe('cpredHotbarGroups', () => {
  it('folds one weapon into one row whatever it can do', () => {
    const groups = cpredHotbarGroups(hotbarSlotsFor(input({ resolve: () => smg })));
    const weapons = groups.filter((group) => group.kind === 'weapon');
    expect(weapons).toHaveLength(1);
    expect(weapons[0]!.kind === 'weapon' && weapons[0]!.modes.map((slot) => slot.mode)).toEqual([
      'single',
      'autofire',
      'suppressive',
    ]);
  });

  it('numbers weapons rather than modes, so one gun is one key', () => {
    const groups = cpredHotbarGroups(hotbarSlotsFor(input({ resolve: () => smg })));
    expect(groups[0]!.key).toBe('1');
    // Before grouping the same bar spent keys 1–3 on that single weapon.
    expect(groups[1]!.kind).toBe('reload');
    expect(groups[1]!.key).toBe('2');
  });

  it('keeps a reload and an Action as rows of their own', () => {
    const groups = cpredHotbarGroups(hotbarSlotsFor(input({ resolve: () => pistol })));
    const kinds = groups.map((group) => group.kind);
    expect(kinds).toContain('reload');
    expect(kinds).toContain('action');
    const action = groups.find((group) => group.kind === 'action');
    expect(action?.kind === 'action' && action.slot.kind).toBe('action');
  });

  it('picks the remembered mode, and forgets one the weapon no longer has', () => {
    const groups = cpredHotbarGroups(hotbarSlotsFor(input({ resolve: () => smg })));
    const weapon = groups[0]!;
    if (weapon.kind !== 'weapon') throw new Error('pierwsza grupa nie jest bronią');
    expect(cpredWeaponModeSlot(weapon, 'suppressive').mode).toBe('suppressive');
    expect(cpredWeaponModeSlot(weapon, undefined).mode).toBe('single');

    const plain = cpredHotbarGroups(hotbarSlotsFor(input({ resolve: () => pistol })))[0]!;
    if (plain.kind !== 'weapon') throw new Error('pierwsza grupa nie jest bronią');
    expect(cpredWeaponModeSlot(plain, 'autofire').mode).toBe('single');
  });

  it('cycles the modes in a ring', () => {
    const groups = cpredHotbarGroups(hotbarSlotsFor(input({ resolve: () => smg })));
    const weapon = groups[0]!;
    if (weapon.kind !== 'weapon') throw new Error('pierwsza grupa nie jest bronią');
    expect(cpredNextWeaponMode(weapon, 'single')).toBe('autofire');
    expect(cpredNextWeaponMode(weapon, 'autofire')).toBe('suppressive');
    expect(cpredNextWeaponMode(weapon, 'suppressive')).toBe('single');

    const plain = cpredHotbarGroups(hotbarSlotsFor(input({ resolve: () => pistol })))[0]!;
    if (plain.kind !== 'weapon') throw new Error('pierwsza grupa nie jest bronią');
    // A weapon with one mode cycles to itself rather than off the end.
    expect(cpredNextWeaponMode(plain, 'single')).toBe('single');
  });

  it('leaves the flat list — the one a bot reads — untouched', () => {
    const slots = hotbarSlotsFor(input({ resolve: () => smg }));
    const weaponSlots = slots.filter((slot) => slot.kind === 'weapon');
    expect(weaponSlots).toHaveLength(3);
    expect(weaponSlots.every((slot) => slot.id.startsWith('weapon:'))).toBe(true);
  });
});

describe('hotbarSlotsFor — Zmysł Walki (30a)', () => {
  const awarenessOf = (slots: ReturnType<typeof hotbarSlotsFor>) =>
    slots.find((slot) => slot.kind === 'action' && slot.actionId === CPRED_ACTION_COMBAT_AWARENESS);

  it('daje pudełko Solo i nikomu innemu', () => {
    expect(awarenessOf(hotbarSlotsFor(input({ combatAwareness: true })))?.label).toBe(
      'Zmysł Walki',
    );
    expect(awarenessOf(hotbarSlotsFor(input()))).toBeUndefined();
  });

  it('nie gaśnie po zużytej Akcji — pudełko tylko otwiera panel', () => {
    // Akcję płaci zapis nowego przydziału, nie zajrzenie do własnych punktów.
    const slots = hotbarSlotsFor(
      input({ combatAwareness: true, turn: { actionSpent: true, moveSpent: true } }),
    );
    expect(awarenessOf(slots)?.disabled).toBeNull();
  });

  it('stoi obok Skanera, gdy ktoś ma obie Zdolności', () => {
    const slots = hotbarSlotsFor(input({ netrunner: true, combatAwareness: true }));
    expect(awarenessOf(slots)).toBeDefined();
    expect(
      slots.find((slot) => slot.kind === 'action' && slot.actionId === CPRED_ACTION_SCANNER),
    ).toBeDefined();
  });
});

/**
 * Etap 31, uzupełnienie z 01.09: bagnet i granatnik podwieszany są bronią,
 * a broń mieszka na pasku akcji. Do tej pory `cpredHotbarSlots` czytało wyłącznie
 * `sheet.weapons`, więc jedyną drogą do nich była karta postaci — a gracz
 * prowadzący figurę paskiem musiał otwierać kartę, żeby dźgnąć.
 */
describe('hotbarSlotsFor — broń przykręcona do wiersza (31)', () => {
  const rifle: ResolvedWeapon = {
    ...pistol,
    magazine: 25,
    attachmentSlots: 4,
    skillId: 'shoulder-arms',
    typeId: 'weapon-type.assault-rifle',
  };

  const BAYONET: CpredAttachmentProfile = {
    id: 'attachment.bayonet',
    name: 'Bagnet',
    fit: { skillIds: ['shoulder-arms'] },
    secondary: { weaponTypeId: 'weapon-type.light-melee' },
  };

  const LAUNCHER: CpredAttachmentProfile = {
    id: 'attachment.underbarrel-grenade-launcher',
    name: 'Granatnik podwieszany',
    fit: { skillIds: ['shoulder-arms'] },
    slots: 2,
    secondary: { weaponTypeId: 'weapon-type.grenade-launcher', magazine: 1 },
  };

  const SCOPE: CpredAttachmentProfile = {
    id: 'attachment.sniping-scope',
    name: 'Luneta snajperska',
    fit: { notSkillIds: ['archery'] },
  };

  const types: WeaponTypeDefinition[] = [
    {
      id: 'weapon-type.light-melee',
      name: 'Lekka broń biała',
      damage: '1k6',
      magazine: null,
      rof: 2,
      hands: 1,
      concealable: true,
      attachmentSlots: 0,
      skillId: 'melee-weapon',
      melee: true,
    },
    {
      id: 'weapon-type.grenade-launcher',
      name: 'Granatnik',
      damage: '6k6',
      magazine: 2,
      rof: 1,
      hands: 2,
      concealable: false,
      attachmentSlots: 0,
      skillId: 'heavy-weapons',
      explosive: true,
    } as WeaponTypeDefinition,
  ];

  const lookup = {
    catalogue: [BAYONET, LAUNCHER, SCOPE],
    weaponTypeById: new Map(types.map((type) => [type.id, type])),
  };

  const armed = (row: Partial<CpredWeaponRow>, attachmentIds: string[]) =>
    input({
      sheet: {
        weapons: [
          weaponRow({
            ammoCurrent: 25,
            ammoMax: 25,
            compendiumId: 'weapon.rifle',
            attachmentIds,
            ...row,
          } as Partial<CpredWeaponRow>),
        ],
      },
      resolve: () => rifle,
      attachments: lookup,
    });

  it('daje bagnetowi własny slot pod karabinem', () => {
    const slots = weaponSlots(hotbarSlotsFor(armed({}, ['attachment.bayonet'])));
    expect(slots).toHaveLength(2);
    expect(slots[0]!.attachmentId).toBeNull();
    const bayonet = slots[1]!;
    expect(bayonet.label).toBe('Bagnet');
    expect(bayonet.attachmentId).toBe('attachment.bayonet');
    expect(bayonet.weaponRowId).toBe('row-1');
    // Broń biała, więc planer odmówi jej powyżej dwóch metrów — i pasek to wie.
    expect(bayonet.melee).toBe(true);
    expect(bayonet.icon).toBe('knife');
    expect(bayonet.id).toBe('weapon:row-1@attachment.bayonet:single');
  });

  it('granatnik podwieszany celuje w POLE i ma własny magazynek na jeden granat', () => {
    const slots = weaponSlots(
      hotbarSlotsFor(armed({}, ['attachment.underbarrel-grenade-launcher'])),
    );
    const launcher = slots[1]!;
    expect(launcher.pointTarget).toBe(true);
    expect(launcher.ammo).toEqual({ current: 1, max: 1 });
    // Magazynek karabinu nietknięty — to dwie różne rury.
    expect(slots[0]!.ammo).toEqual({ current: 25, max: 25 });
  });

  it('zużyty granat siedzi w attachmentAmmo, nie w magazynku karabinu', () => {
    const slots = weaponSlots(
      hotbarSlotsFor(
        armed({ attachmentAmmo: { 'attachment.underbarrel-grenade-launcher': 0 } }, [
          'attachment.underbarrel-grenade-launcher',
        ]),
      ),
    );
    expect(slots[1]!.ammo).toEqual({ current: 0, max: 1 });
    expect(slots[1]!.disabled).toBe('Pusty magazynek — przeładuj.');
    expect(slots[0]!.disabled).toBeNull();
  });

  it('przeładowanie broni podwieszanej to osobne pudełko z jej id', () => {
    const slots = hotbarSlotsFor(
      armed({ attachmentAmmo: { 'attachment.underbarrel-grenade-launcher': 0 } }, [
        'attachment.underbarrel-grenade-launcher',
      ]),
    );
    const reloads = slots.filter((slot) => slot.kind === 'reload');
    expect(reloads.map((slot) => slot.id)).toEqual([
      'reload:row-1',
      'reload:row-1@attachment.underbarrel-grenade-launcher',
    ]);
    const secondary = reloads[1]!;
    if (secondary.kind !== 'reload') throw new Error('to nie jest przeładowanie');
    expect(secondary.attachmentId).toBe('attachment.underbarrel-grenade-launcher');
    expect(secondary.label).toBe('Przeładuj: Granatnik podwieszany');
    expect(secondary.disabled).toBeNull();
  });

  it('dodatek bez własnej broni nie dokłada slotu', () => {
    // Luneta zmienia rozbicie strzału, a nie liczbę sposobów strzelania.
    const slots = weaponSlots(hotbarSlotsFor(armed({}, ['attachment.sniping-scope'])));
    expect(slots).toHaveLength(1);
  });

  it('to, czego nie dałoby się zamontować, nie daje broni', () => {
    // Ta sama zasada co na karcie: lista jest sądzona przy odczycie, więc
    // bagnet wpisany do łuku nie staje się bagnetem.
    const slots = weaponSlots(
      hotbarSlotsFor(
        input({
          sheet: {
            weapons: [
              weaponRow({ attachmentIds: ['attachment.bayonet'] } as Partial<CpredWeaponRow>),
            ],
          },
          resolve: () => ({ ...pistol, skillId: 'archery' }),
          attachments: lookup,
        }),
      ),
    );
    expect(slots).toHaveLength(1);
  });

  it('bez katalogu dodatków pasek wygląda dokładnie tak, jak wyglądał', () => {
    // Tura bota nie podaje katalogu — i ma dostać ten sam pasek co dotąd.
    const slots = weaponSlots(
      hotbarSlotsFor({ ...armed({}, ['attachment.bayonet']), attachments: undefined }),
    );
    expect(slots).toHaveLength(1);
  });

  it('bagnet i karabin to dwie grupy, mimo wspólnego wiersza', () => {
    const groups = cpredHotbarGroups(hotbarSlotsFor(armed({}, ['attachment.bayonet'])));
    const weapons = groups.filter((group) => group.kind === 'weapon');
    expect(weapons).toHaveLength(2);
    expect(weapons.map((group) => group.id)).toEqual([
      'weapon:row-1',
      'weapon:row-1@attachment.bayonet',
    ]);
    // Osobne klawisze — o to w tej zaległości chodziło.
    expect(weapons.map((group) => group.key)).toEqual(['1', '2']);
  });
});

describe('zacięta broń na pasku akcji (s. 244)', () => {
  const jammed = weaponRow({ jammed: true });

  it('gasi wszystkie tryby ognia i mówi, co trzeba zrobić', () => {
    const slots = hotbarSlotsFor(input({ sheet: { weapons: [jammed] }, resolve: () => smg }));
    const weapons = weaponSlots(slots);
    expect(weapons.length).toBeGreaterThan(1);
    for (const slot of weapons) expect(slot.disabled).toBe(CPRED_JAM_REFUSAL);
  });

  it('dokłada pudełko „Usuń usterkę" przed przeładowaniem', () => {
    const slots = hotbarSlotsFor(input({ sheet: { weapons: [jammed] } }));
    const ids = slots.map((slot) => slot.kind);
    expect(ids.indexOf('clear-jam')).toBeGreaterThan(-1);
    expect(ids.indexOf('clear-jam')).toBeLessThan(ids.indexOf('reload'));
    const box = slots.find((slot) => slot.kind === 'clear-jam');
    expect(box?.label).toBe('Usuń usterkę: Ciężki pistolet');
  });

  it('daje to pudełko także broni, która nie liczy naboi', () => {
    const machete = weaponRow({ id: 'row-2', name: 'Maczeta', ammoMax: 0, jammed: true });
    const slots = hotbarSlotsFor(input({ sheet: { weapons: [machete] }, resolve: () => knife }));
    expect(slots.some((slot) => slot.kind === 'reload')).toBe(false);
    expect(slots.some((slot) => slot.kind === 'clear-jam')).toBe(true);
  });

  it('nie pokazuje go broni sprawnej', () => {
    const slots = hotbarSlotsFor(input());
    expect(slots.some((slot) => slot.kind === 'clear-jam')).toBe(false);
  });

  it('gaśnie razem z resztą, gdy Akcja w tej turze jest już wydana', () => {
    const slots = hotbarSlotsFor(
      input({
        sheet: { weapons: [jammed] },
        turn: { actionSpent: true, blockedAction: null, blockedMove: null },
      } as Partial<CpredHotbarInput>),
    );
    const box = slots.find((slot) => slot.kind === 'clear-jam');
    expect(box?.disabled).toBe('Akcja w tej turze już wykorzystana.');
  });
});
