import { describe, expect, it } from 'vitest';
import {
  buildCpredRegistry,
  createDefaultCharacterData,
  type CpredArmorRow,
  type CpredWeaponRow,
} from './character.js';
import type { ResolvedWeapon } from './compendium.js';
import {
  CPRED_FABRICATION_WORK,
  cpredEntryTechSkillId,
  cpredFabricateMaterialsCost,
  cpredFabricateProblem,
  cpredFabricationWorkTask,
  cpredIsFabricableEntry,
  cpredItemTechSkillId,
  cpredTechItemUpgradeProblem,
  cpredTechUpgradesForTarget,
  cpredUpgradeMaterialsCost,
} from './fabrication.js';
import { CPRED_FABRICATION_TASK } from './roleability.js';
import { planCpredRoll } from './rolls.js';
import { cpredWorkTargetKey, isCpredRepairTarget } from './repair.js';

/**
 * Etap 71d2 (G13) — Praca Twórcy: Ulepszanie przedmiotu i Wytwarzanie Testem
 * (TEC-03, TEC-07, TEC-08, TEC-09, TEC-11, TEC-15; s. 148).
 */

const registry = buildCpredRegistry(
  {
    skills: [
      { id: 'basic-tech', name: 'Podstawowe naprawy', stat: 'tech' },
      { id: 'weaponstech', name: 'Naprawa broni', stat: 'tech' },
    ],
  },
  { roles: [{ id: 'tech', name: 'Technik', ability: 'Twórca' }] },
);

function technik(fabrication: Record<string, number>) {
  return {
    ...createDefaultCharacterData(),
    roleId: 'tech',
    roleAbilityRank: 4,
    fabrication,
    skills: { 'basic-tech': 4, weaponstech: 5 },
  };
}

const pistol: ResolvedWeapon = {
  damage: '2k6',
  magazine: 12,
  rof: 2,
  hands: 1,
  concealable: true,
  attachmentSlots: 3,
  melee: false,
} as ResolvedWeapon;

const weaponRow: CpredWeaponRow = {
  id: 'w1',
  name: 'Zgrzyt 9',
  notes: '',
  damage: '2k6',
  ammoCurrent: 12,
  ammoMax: 12,
  ammoType: '',
  rof: '2',
  compendiumId: 'weapon.zgrzyt-9',
};

const jacket: CpredArmorRow = {
  id: 'a1',
  name: 'Kurtka',
  notes: '',
  sp: 11,
  spCurrent: 11,
  location: 'body',
};

describe('TEC-07 TEC-08 PT i czas z pasma ceny (s. 148)', () => {
  it('liczby tabeli panelu, w minutach zegara świata', () => {
    for (const band of Object.keys(
      CPRED_FABRICATION_WORK,
    ) as (keyof typeof CPRED_FABRICATION_WORK)[]) {
      expect(CPRED_FABRICATION_WORK[band].dv).toBe(CPRED_FABRICATION_TASK[band].dv);
    }
    expect(cpredFabricationWorkTask('costly', 50)).toEqual({ dv: 13, minutes: 6 * 60 });
    expect(cpredFabricationWorkTask('expensive', 5000)).toEqual({ dv: 21, minutes: 7 * 24 * 60 });
    expect(cpredFabricationWorkTask('luxury', 50_000)).toEqual({ dv: 29, minutes: 30 * 24 * 60 });
  });

  it('Superluksusowe: miesiąc na każde 100 000 ed ceny domowej (zaczęte liczy się całe)', () => {
    expect(cpredFabricationWorkTask('superLuxury', 100_000).minutes).toBe(30 * 24 * 60);
    expect(cpredFabricationWorkTask('superLuxury', 250_000).minutes).toBe(3 * 30 * 24 * 60);
  });
});

describe('TEC-09 surowce w ed', () => {
  it('Ulepszanie: cena pasma przedmiotu w cenniku domowym wpisu', () => {
    // Broń (×10): pasmo Drogie 50 ed → 500 ed, niezależnie od wydrukowanej ceny.
    expect(
      cpredUpgradeMaterialsCost({ category: 'weapon', cost: 550, costCategory: 'costly' }),
    ).toBe(500);
    // Drobny sprzęt z pasma Drogie (×3) → 150 ed.
    expect(cpredUpgradeMaterialsCost({ category: 'gear', cost: 150, costCategory: 'costly' })).toBe(
      150,
    );
    expect(
      cpredUpgradeMaterialsCost({ category: 'weapon', cost: 500, costCategory: undefined }),
    ).toBe(null);
  });

  it('Wytwarzanie: pasmo niżej, Tanie po 5 ed z ramki, Superluksusowe — połowa ceny', () => {
    // Premium (broń ×10) → surowce z pasma Drogie: 50 × 10.
    expect(
      cpredFabricateMaterialsCost({ category: 'weapon', cost: 1000, costCategory: 'premium' }),
    ).toBe(500);
    expect(cpredFabricateMaterialsCost({ category: 'gear', cost: 30, costCategory: 'cheap' })).toBe(
      15,
    );
    expect(
      cpredFabricateMaterialsCost({
        category: 'cyberware',
        cost: 300_000,
        costCategory: 'superLuxury',
      }),
    ).toBe(150_000);
  });
});

describe('Umiejętność, którą zwykle naprawia się rzecz', () => {
  it('broń i dodatki — Naprawa broni, chrom — Cyberinżynieria, dek — Elektronika, reszta — Podstawowe naprawy', () => {
    expect(cpredEntryTechSkillId({ category: 'weapon' })).toBe('weaponstech');
    expect(cpredEntryTechSkillId({ category: 'attachment' })).toBe('weaponstech');
    expect(cpredEntryTechSkillId({ category: 'cyberware' })).toBe('cybertech');
    expect(cpredEntryTechSkillId({ category: 'gear', deckSlots: 7 })).toBe('electronics-security');
    expect(cpredEntryTechSkillId({ category: 'gear' })).toBe('basic-tech');
    expect(cpredItemTechSkillId({ kind: 'armor', row: jacket })).toBe('basic-tech');
    expect(cpredItemTechSkillId({ kind: 'weapon', row: weaponRow, resolved: pistol })).toBe(
      'weaponstech',
    );
  });
});

describe('Ulepszanie Testem — co wolno', () => {
  const subject = { kind: 'weapon' as const, row: weaponRow, resolved: pistol };
  const entry = { category: 'weapon' as const, cost: 500, costCategory: 'costly' as const };

  it('bez wynalazku i ulepszenia pojazdu — te są u MG i przy aucie', () => {
    const options = cpredTechUpgradesForTarget(subject);
    expect(options).toContain('slot');
    expect(options).toContain('fastRepair');
    expect(options).not.toContain('invention');
    expect(cpredTechItemUpgradeProblem(2, 'invention', subject, entry)).toBe('UPGRADE_BY_GM');
  });

  it('odmowy: bez Ulepszania, rzecz już ulepszona, sposób nie pasuje, rzecz bez pasma', () => {
    expect(cpredTechItemUpgradeProblem(0, 'slot', subject, entry)).toBe('NO_UPGRADE_SPECIALTY');
    expect(
      cpredTechItemUpgradeProblem(
        2,
        'slot',
        { ...subject, row: { ...weaponRow, upgrade: 'excellent' } },
        entry,
      ),
    ).toBe('ALREADY_UPGRADED');
    expect(cpredTechItemUpgradeProblem(2, 'armorSp', subject, entry)).toBe('UPGRADE_NOT_FOR_ITEM');
    expect(cpredTechItemUpgradeProblem(2, 'slot', subject, undefined)).toBe('NO_PRICE_BAND');
    expect(cpredTechItemUpgradeProblem(2, 'slot', subject, entry)).toBeNull();
  });

  it('TEC-11: +1 OB pancerza też Testem', () => {
    expect(
      cpredTechItemUpgradeProblem(
        1,
        'armorSp',
        { kind: 'armor', row: jacket },
        {
          category: 'armor',
          cost: 500,
          costCategory: 'expensive',
        },
      ),
    ).toBeNull();
  });
});

describe('Wytwarzanie — co wolno', () => {
  it('broń, dodatki, pancerz, sprzęt, wszczep tak; amunicja, program, pojazd nie', () => {
    const band = { cost: 100, costCategory: 'premium' as const };
    for (const category of ['weapon', 'attachment', 'armor', 'gear', 'cyberware'] as const) {
      expect(cpredIsFabricableEntry({ ...band, category })).toBe(true);
    }
    for (const category of ['ammo', 'program', 'vehicle'] as const) {
      expect(cpredIsFabricableEntry({ ...band, category })).toBe(false);
      expect(cpredFabricateProblem(2, { ...band, category })).toBe('NOT_FABRICABLE');
    }
    expect(cpredFabricateProblem(0, { ...band, category: 'gear' })).toBe('NO_FABRICATE_SPECIALTY');
    expect(cpredFabricateProblem(2, { cost: 100, costCategory: undefined, category: 'gear' })).toBe(
      'NO_PRICE_BAND',
    );
  });
});

describe('cel pracy i planer rzutu (TEC-03)', () => {
  const itemTarget = {
    kind: 'item' as const,
    characterId: 'c1',
    list: 'weapons' as const,
    rowId: 'w1',
  };

  it('cel: wiersz przedmiotu z listą karty albo wpis Kompendium', () => {
    expect(isCpredRepairTarget(itemTarget)).toBe(true);
    expect(isCpredRepairTarget({ ...itemTarget, list: 'vehicles' })).toBe(false);
    expect(isCpredRepairTarget({ kind: 'entry', entryId: 'weapon.zgrzyt-9' })).toBe(true);
    expect(cpredWorkTargetKey(itemTarget)).toBe('c1:weapons:w1');
  });

  it('Ulepszanie dodaje Ulepszanie, nie Naprawę; Wytwarzanie — Wytwarzanie', () => {
    const data = technik({ repair: 2, upgrade: 3, fabricate: 1 });
    const upgrade = planCpredRoll(data, registry, {
      kind: 'itemUpgrade',
      repairTarget: itemTarget,
      repairSkillId: 'weaponstech',
      itemUpgradeId: 'slot',
    });
    expect(upgrade.ok).toBe(true);
    if (!upgrade.ok) return;
    expect(upgrade.plan.breakdown.map((row) => row.label)).toEqual(
      expect.arrayContaining(['Ulepszanie 3']),
    );
    expect(upgrade.plan.breakdown.map((row) => row.label)).not.toContain('Naprawa 2');
    expect(upgrade.plan.work).toMatchObject({ task: 'itemUpgrade', itemUpgradeId: 'slot' });

    const make = planCpredRoll(data, registry, {
      kind: 'fabricate',
      repairTarget: { kind: 'entry', entryId: 'weapon.zgrzyt-9' },
      repairSkillId: 'weaponstech',
    });
    expect(make.ok).toBe(true);
    if (!make.ok) return;
    expect(make.plan.title).toBe('Wytwarzanie');
    expect(make.plan.breakdown.map((row) => row.label)).toContain('Wytwarzanie 1');
  });

  it('odmowy planera: bez Specjalizacji, cel nie tej pracy, brak sposobu', () => {
    expect(
      planCpredRoll(technik({ repair: 4 }), registry, {
        kind: 'itemUpgrade',
        repairTarget: itemTarget,
        repairSkillId: 'weaponstech',
        itemUpgradeId: 'slot',
      }),
    ).toEqual({ ok: false, error: 'NO_UPGRADE_SPECIALTY' });
    expect(
      planCpredRoll(technik({ repair: 4 }), registry, {
        kind: 'fabricate',
        repairTarget: { kind: 'entry', entryId: 'weapon.zgrzyt-9' },
      }),
    ).toEqual({ ok: false, error: 'NO_FABRICATE_SPECIALTY' });
    expect(
      planCpredRoll(technik({ upgrade: 2 }), registry, {
        kind: 'itemUpgrade',
        repairTarget: { kind: 'entry', entryId: 'weapon.zgrzyt-9' },
        itemUpgradeId: 'slot',
      }),
    ).toEqual({ ok: false, error: 'BAD_REQUEST' });
    expect(
      planCpredRoll(technik({ upgrade: 2 }), registry, {
        kind: 'itemUpgrade',
        repairTarget: itemTarget,
        repairSkillId: 'weaponstech',
      }),
    ).toEqual({ ok: false, error: 'BAD_REQUEST' });
  });
});
