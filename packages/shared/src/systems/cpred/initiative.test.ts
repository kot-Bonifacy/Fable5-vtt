import { describe, expect, it } from 'vitest';
import { buildCpredRegistry, createDefaultCharacterData, type CpredArmorRow } from './character.js';
import { cpredSheetInitiative } from './initiative.js';
import { readCpredCombatAwareness } from './roleability.js';

/**
 * Inicjatywa z karty (#61, 03.10): `1k10 + REF` (s. 168), pancerz zabiera REF
 * (s. 185), Błyskawiczna reakcja dokłada do sumy, ale nie do remisu (s. 146).
 * Ta sama liczba trafia do kubka gracza i do `combat:roll`.
 */

const registry = buildCpredRegistry(
  { skills: [] },
  { roles: [{ id: 'solo', name: 'Solo', ability: 'Zmysł Walki' }] },
);

function sheet(overrides: Partial<ReturnType<typeof createDefaultCharacterData>> = {}) {
  const base = createDefaultCharacterData();
  return { ...base, stats: { ...base.stats, ref: 7 }, ...overrides };
}

describe('cpredSheetInitiative', () => {
  it('dodaje REF i rozstrzyga nim remis', () => {
    expect(cpredSheetInitiative(sheet(), registry)).toEqual({
      modifier: 7,
      tieBreak: 7,
      label: 'Refleks (REF)',
    });
  });

  it('Błyskawiczna reakcja podnosi sumę, nie remis — Kruk z T8b rzucał za +8', () => {
    const solo = sheet({
      roleId: 'solo',
      roleAbilityRank: 4,
      combatAwareness: readCpredCombatAwareness({ fastReflexes: 1 }),
    });
    const initiative = cpredSheetInitiative(solo, registry);
    expect(initiative.modifier).toBe(8);
    expect(initiative.tieBreak).toBe(7);
    expect(initiative.label).toBe('Refleks (REF) + Błyskawiczna reakcja 1');
  });

  it('ciężki pancerz zabiera REF i przesuwa też remis', () => {
    const armor = [
      { id: 'a', name: 'Metalgear', location: 'body', sp: 18, spCurrent: 18, penalty: -4 },
    ] as unknown as CpredArmorRow[];
    const initiative = cpredSheetInitiative(sheet({ armor }), registry);
    expect(initiative.modifier).toBe(3);
    expect(initiative.tieBreak).toBe(3);
    expect(initiative.label).toBe('Refleks (REF) Pancerz -4');
  });
});
