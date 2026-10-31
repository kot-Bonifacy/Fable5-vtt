import { describe, expect, it } from 'vitest';
import type { CpredGearRow } from './character.js';
import { cpredTakeRows } from './inventory.js';
import {
  cpredGearLightProfile,
  cpredIsGearLightShape,
  cpredSetGearLight,
  cpredSheetLight,
} from './lightgear.js';

const row = (over: Partial<CpredGearRow>): CpredGearRow => ({
  id: 'g',
  name: 'Lina',
  notes: '',
  qty: 1,
  ...over,
});

describe('cpredGearLightProfile', () => {
  it('knows the compendium light sources and hand-written torches', () => {
    expect(cpredGearLightProfile(row({ compendiumId: 'gear.latarka', name: 'X' }))).toMatchObject({
      brightM: 6,
      dimM: 12,
    });
    expect(cpredGearLightProfile(row({ name: 'Stara latarka' }))).not.toBeNull();
    expect(cpredGearLightProfile(row({ name: 'Pochodnia' }))?.flicker).toBe(true);
    expect(cpredGearLightProfile(row({ name: 'Lina' }))).toBeNull();
  });
});

describe('cpredSheetLight', () => {
  it('is null without anything that glows', () => {
    expect(cpredSheetLight({ gear: [row({})] })).toBeNull();
  });

  it('is off while the torch is in the pack, on once it is lit', () => {
    const torch = row({ id: 't', name: 'Latarka' });
    expect(cpredSheetLight({ gear: [torch] })?.on).toBe(false);
    expect(cpredSheetLight({ gear: [torch, { ...torch, id: 'u', lit: true }] })?.on).toBe(true);
  });

  it('ignores a torch stack of zero', () => {
    expect(cpredSheetLight({ gear: [row({ name: 'Latarka', qty: 0, lit: true })] })).toBeNull();
  });
});

describe('cpredSetGearLight', () => {
  const gear = [
    row({ id: 'r' }),
    row({ id: 'a', name: 'Latarka' }),
    row({ id: 'b', name: 'Flara' }),
  ];

  it('lights the first source, and puts every one out', () => {
    const lit = cpredSetGearLight(gear, true)!;
    expect(lit.find((r) => r.id === 'a')?.lit).toBe(true);
    expect(lit.find((r) => r.id === 'b')?.lit).toBeUndefined();
    const both = lit.map((r) => (r.id === 'b' ? { ...r, lit: true } : r));
    expect(cpredSetGearLight(both, false)!.some((r) => r.lit)).toBe(false);
  });

  it('keeps an already lit source rather than lighting another', () => {
    const second = gear.map((r) => (r.id === 'b' ? { ...r, lit: true } : r));
    expect(cpredSetGearLight(second, true)!.find((r) => r.id === 'a')?.lit).toBeUndefined();
  });

  it('is null when there is nothing to light', () => {
    expect(cpredSetGearLight([row({})], true)).toBeNull();
  });
});

describe('cpredIsGearLightShape', () => {
  it('tells a carried lamp from the GM default warm bulb', () => {
    expect(cpredIsGearLightShape(cpredGearLightProfile(row({ name: 'Latarka' }))!)).toBe(true);
    expect(cpredIsGearLightShape({ brightM: 6, dimM: 12, color: '#ffd9a0', flicker: false })).toBe(
      false,
    );
  });
});

describe('a lit torch handed over', () => {
  it('lands with the receiver put out', () => {
    const torch = row({ id: 't', name: 'Latarka', lit: true });
    const result = cpredTakeRows({ weapons: [], armor: [], gear: [torch] }, [
      { list: 'gear', rowId: 't' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.taken[0]!.row as CpredGearRow).lit).toBeUndefined();
  });
});
