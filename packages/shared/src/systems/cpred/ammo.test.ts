import { describe, expect, it } from 'vitest';
import {
  CPRED_ABLATION_STANDARD,
  ammoAblation,
  ammoDamageNotes,
  ammoFitsWeapon,
  ammoOptionsFor,
  loadedAmmoFor,
  type CpredAmmoProfile,
} from './ammo.js';
import {
  buildCompendium,
  resolveWeapon,
  type ResolvedWeapon,
  type WeaponEntry,
} from './compendium.js';

/**
 * Ammunition as data (stage 16g): does this round fit this gun, and what does
 * it change? Both questions are answered from catalogue rows, so these tests
 * build rows rather than calling into the combat code.
 */

function ammo(overrides: Partial<CpredAmmoProfile> = {}): CpredAmmoProfile {
  return { id: 'ammo.test', name: 'Nabój testowy', patterns: ['bullet'], ...overrides };
}

function weapon(overrides: Partial<ResolvedWeapon> = {}): ResolvedWeapon {
  return {
    damage: '3k6',
    magazine: 8,
    rof: 2,
    hands: 1,
    concealable: true,
    attachmentSlots: 3,
    skillId: 'handgun',
    melee: false,
    ammoPatterns: ['bullet'],
    ...overrides,
  };
}

describe('ammoFitsWeapon', () => {
  it('matches a round to the shapes the weapon chambers', () => {
    expect(ammoFitsWeapon(ammo({ patterns: ['bullet'] }), weapon())).toBe(true);
    expect(ammoFitsWeapon(ammo({ patterns: ['shell'] }), weapon())).toBe(false);
  });

  it('lets a shotgun take both slugs and shells', () => {
    const shotgun = weapon({ ammoPatterns: ['bullet', 'shell'] });
    expect(ammoFitsWeapon(ammo({ patterns: ['shell'] }), shotgun)).toBe(true);
    expect(ammoFitsWeapon(ammo({ patterns: ['bullet', 'arrow'] }), shotgun)).toBe(true);
    expect(ammoFitsWeapon(ammo({ patterns: ['grenade'] }), shotgun)).toBe(false);
  });

  it('refuses everything a weapon type says nothing about', () => {
    // A hand-typed row has no patterns, and „no patterns" must not read as
    // „every pattern" — that is how a bow would end up loaded with grenades.
    expect(ammoFitsWeapon(ammo(), weapon({ ammoPatterns: undefined }))).toBe(false);
    expect(ammoFitsWeapon(ammo(), null)).toBe(false);
  });

  it('refuses melee weapons whatever the patterns say', () => {
    expect(ammoFitsWeapon(ammo(), weapon({ melee: true, ammoPatterns: ['bullet'] }))).toBe(false);
  });

  it('honours a weapon that names the only rounds it fires', () => {
    const flamer = weapon({ ammoPatterns: ['shell'], ammoIds: ['ammo.flamer'] });
    expect(ammoFitsWeapon(ammo({ id: 'ammo.flamer', patterns: ['shell'] }), flamer)).toBe(true);
    // Right shape, wrong round: the list wins over the pattern (s. 348).
    expect(ammoFitsWeapon(ammo({ id: 'ammo.shot', patterns: ['shell'] }), flamer)).toBe(false);
  });

  it('lists only the rounds a weapon can take', () => {
    const catalogue = [
      ammo({ id: 'ammo.a', patterns: ['bullet'] }),
      ammo({ id: 'ammo.b', patterns: ['shell'] }),
      ammo({ id: 'ammo.c', patterns: ['grenade'] }),
    ];
    expect(ammoOptionsFor(catalogue, weapon({ ammoPatterns: ['bullet', 'shell'] }))).toHaveLength(
      2,
    );
    expect(ammoOptionsFor(catalogue, weapon({ melee: true }))).toHaveLength(0);
  });
});

describe('loadedAmmoFor', () => {
  const catalogue: Record<string, CpredAmmoProfile> = {
    'ammo.flamer': ammo({ id: 'ammo.flamer', patterns: ['shell'] }),
    'ammo.piercing': ammo({ id: 'ammo.piercing', ablationBonus: 1 }),
  };
  const lookup = (id: string) => catalogue[id] ?? null;

  it('reads the round named on the weapon row', () => {
    expect(loadedAmmoFor({ ammoId: 'ammo.piercing' }, weapon(), lookup)?.ablationBonus).toBe(1);
  });

  it('is nothing when the row names none — that is ordinary ammunition', () => {
    expect(loadedAmmoFor({}, weapon(), lookup)).toBeNull();
  });

  it('loads a weapon that takes exactly one kind of round by itself', () => {
    const flamer = weapon({ ammoPatterns: ['shell'], ammoIds: ['ammo.flamer'] });
    expect(loadedAmmoFor({}, flamer, lookup)?.id).toBe('ammo.flamer');
  });

  it('is nothing when the named round is not in the catalogue', () => {
    expect(loadedAmmoFor({ ammoId: 'ammo.gone' }, weapon(), lookup)).toBeNull();
  });
});

describe('ammoAblation', () => {
  it('takes RAW’s single point when nothing says otherwise', () => {
    expect(ammoAblation(null)).toBe(CPRED_ABLATION_STANDARD);
    expect(ammoAblation(ammo())).toBe(1);
  });

  it('takes two for an armour-piercing round (s. 345)', () => {
    expect(ammoAblation(ammo({ ablationBonus: 1 }))).toBe(2);
  });

  it('takes none at all for a rubber one (s. 346)', () => {
    expect(ammoAblation(ammo({ noAblation: true, ablationBonus: 3 }))).toBe(0);
  });
});

describe('ammoDamageNotes', () => {
  it('names the extra point of ablation rather than hiding it', () => {
    const notes = ammoDamageNotes(ammo({ ablationBonus: 1 }), { ablated: 2 });
    expect(notes[0]).toContain('pancerz −2');
  });

  it('says nothing about ablation when the armour was not hit', () => {
    expect(ammoDamageNotes(ammo({ ablationBonus: 1 }), { ablated: 0 })).toEqual([]);
  });

  it('reports the non-lethal floor and the suppressed injury', () => {
    const notes = ammoDamageNotes(ammo({ nonLethal: true, noAblation: true }), {
      ablated: 0,
      heldAtOne: true,
      injurySuppressed: true,
    });
    expect(notes).toEqual([
      'pancerz bez uszkodzeń',
      'bez rany krytycznej',
      'cel zatrzymany na 1 PW',
    ]);
  });

  it('reports the fire it started', () => {
    const notes = ammoDamageNotes(ammo({ ignites: { statusId: 'on-fire', damage: 4 } }), {
      ablated: 0,
      ignited: { label: 'Podpalony', damage: 4 },
    });
    expect(notes).toEqual(['Podpalony — 4 obr./turę']);
  });
});

describe('ammunition in the compendium', () => {
  const registry = buildCompendium([
    {
      weaponTypes: [
        {
          id: 'weapon-type.test-shotgun',
          name: 'Strzelba testowa',
          skillId: 'shoulder-arms',
          damage: '5k6',
          magazine: 4,
          rof: 1,
          hands: 2,
          melee: false,
          ammoPatterns: ['bullet', 'shell'],
          rangeDv: [13, 15, 20, 25, 30, 35, null, null],
        },
      ],
      entries: [
        {
          id: 'weapon.test-shotgun',
          category: 'weapon',
          name: 'Strzelba',
          weaponTypeId: 'weapon-type.test-shotgun',
          quality: 'standard',
          cost: 500,
        },
        {
          id: 'ammo.test-shot',
          category: 'ammo',
          name: 'Śrut testowy',
          cost: 10,
          patterns: ['shell'],
          spread: { dv: 13, damage: '3k6', coneRangeM: 6 },
          noAim: true,
        },
        {
          id: 'ammo.broken',
          category: 'ammo',
          name: 'Nabój bez wzorca',
          cost: 10,
          patterns: [],
        },
      ],
    },
  ]);

  it('keeps the machine flags on the entry', () => {
    const entry = registry.entryById.get('ammo.test-shot');
    expect(entry?.category).toBe('ammo');
    expect(entry && entry.category === 'ammo' ? entry.spread?.dv : null).toBe(13);
  });

  it('drops a round that fits nothing rather than shipping it', () => {
    expect(registry.entryById.has('ammo.broken')).toBe(false);
  });

  it('carries the chambered patterns onto the resolved weapon', () => {
    const entry = registry.entryById.get('weapon.test-shotgun') as WeaponEntry;
    const resolved = resolveWeapon(entry, registry);
    expect(resolved.ammoPatterns).toEqual(['bullet', 'shell']);
    const shot = registry.entryById.get('ammo.test-shot');
    expect(
      shot && shot.category === 'ammo'
        ? ammoFitsWeapon({ id: shot.id, patterns: shot.patterns }, resolved)
        : false,
    ).toBe(true);
  });
});
