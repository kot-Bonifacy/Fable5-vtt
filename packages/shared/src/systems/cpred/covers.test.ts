import { describe, expect, it } from 'vitest';
import {
  buildCoverCatalogue,
  cpredCoverHp,
  cpredCoverPreset,
  cpredCoverPresetDetail,
  cpredCoverPresetHp,
  EMPTY_COVER_CATALOGUE,
} from './covers.js';

const RAW = {
  materials: [
    { id: 'steel', name: 'Stal', thick: 50, thin: 25 },
    { id: 'concrete', name: 'Beton', thick: 25, thin: 10 },
    { id: 'drywall', name: 'Gips', thick: 15, thin: 0 },
  ],
  presets: [
    { id: 'car', name: 'Samochód', materialId: 'steel', thickness: 'thin', widthM: 4, heightM: 2 },
    {
      id: 'bollard',
      name: 'Słupek',
      materialId: 'concrete',
      thickness: 'thick',
      widthM: 1,
      heightM: 1,
    },
    { id: 'partition', name: 'Ścianka', materialId: 'drywall', thickness: 'thin' },
  ],
};

describe('cover catalogue', () => {
  it('reads the material × thickness table', () => {
    const catalogue = buildCoverCatalogue(RAW);
    expect(cpredCoverHp(catalogue, 'steel', 'thick')).toBe(50);
    expect(cpredCoverHp(catalogue, 'steel', 'thin')).toBe(25);
    expect(cpredCoverHp(catalogue, 'concrete', 'thick')).toBe(25);
  });

  it('gives a preset the body points of its own material and thickness', () => {
    const catalogue = buildCoverCatalogue(RAW);
    expect(cpredCoverPresetHp(catalogue, 'car')).toBe(25);
    expect(cpredCoverPresetHp(catalogue, 'bollard')).toBe(25);
  });

  it('reports zero for the row the rulebook says is not cover', () => {
    // „Jeśli nie może zatrzymać kuli, nie jest to osłona i nie ma PW" (s. 179):
    // thin plasterboard comes out at 0, and the server refuses to place it.
    expect(cpredCoverPresetHp(buildCoverCatalogue(RAW), 'partition')).toBe(0);
  });

  it('answers zero for an unknown material or preset', () => {
    const catalogue = buildCoverCatalogue(RAW);
    expect(cpredCoverHp(catalogue, 'adamantium', 'thick')).toBe(0);
    expect(cpredCoverPresetHp(catalogue, 'battleship')).toBe(0);
    expect(cpredCoverPreset(catalogue, 'battleship')).toBeNull();
  });

  it('describes a preset for the palette', () => {
    const catalogue = buildCoverCatalogue(RAW);
    const preset = cpredCoverPreset(catalogue, 'car')!;
    expect(cpredCoverPresetDetail(catalogue, preset)).toBe('Stal, cienki — 25 PW');
  });

  it('drops malformed rows instead of failing', () => {
    const catalogue = buildCoverCatalogue({
      materials: [{ id: 'steel', name: 'Stal', thick: 50, thin: 25 }, { id: 'broken' }, 7],
      presets: [
        { id: 'car', name: 'Samochód', materialId: 'steel', thickness: 'thin' },
        // References a material that did not survive validation.
        { id: 'ghost', name: 'Duch', materialId: 'broken', thickness: 'thick' },
        { name: 'bez id', materialId: 'steel' },
      ],
    });
    expect(catalogue.materials.map((m) => m.id)).toEqual(['steel']);
    expect(catalogue.presets.map((p) => p.id)).toEqual(['car']);
    // A preset with no size still gets one, so the palette can pre-size a drag.
    expect(catalogue.presets[0]!.widthM).toBeGreaterThan(0);
  });

  it('falls back to an empty catalogue on nonsense', () => {
    expect(buildCoverCatalogue(null)).toEqual(EMPTY_COVER_CATALOGUE);
    expect(buildCoverCatalogue('nope')).toEqual(EMPTY_COVER_CATALOGUE);
    expect(buildCoverCatalogue({})).toEqual(EMPTY_COVER_CATALOGUE);
  });
});
