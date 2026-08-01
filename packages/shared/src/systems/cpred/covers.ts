/**
 * Cover toughness in Cyberpunk RED (stage 16c) — pure data plus lookups.
 *
 * The rulebook is unusually blunt about cover, and two sentences on s. 179
 * decide the whole model:
 *
 *  - **„Nie ma czegoś takiego jak »częściowa« osłona"** — cover either stops
 *    the round or it is not cover. There is no to-hit penalty to model;
 *  - **„Jeśli nie może zatrzymać kuli, nie jest to osłona i nie ma PW"** —
 *    which is why this table has no Stopping Power column. Cover is not armour
 *    that soaks part of a hit; it is an object with body points that takes the
 *    hit instead of you, and when it runs out it is gone. (The stage's original
 *    description asked for „SP i PW"; the rulebook says otherwise, and the
 *    rulebook won.)
 *
 * The numbers are the material × thickness table on s. 180. Thickness has
 * exactly two rungs there — thick and thin — and „gips/pianka/plastik" thin
 * comes out at 0, which is the table's own way of saying that a plasterboard
 * partition is not cover at all.
 *
 * The catalogue is **data**, loaded from `data/public/cpred/covers.json`, for
 * the reason every other table in this project is: the GM has to be able to add
 * „kontener na śmieci" without a deploy. This module supplies the shape, the
 * validation and the two questions anybody asks of it.
 */

/** The two rungs the rulebook's table has. */
export const CPRED_COVER_THICKNESSES = ['thick', 'thin'] as const;
export type CpredCoverThickness = (typeof CPRED_COVER_THICKNESSES)[number];

export const CPRED_COVER_THICKNESS_LABELS: Record<CpredCoverThickness, string> = {
  thick: 'gruby',
  thin: 'cienki',
};

/** One row of the material table (s. 180). */
export interface CpredCoverMaterial {
  id: string;
  /** Polish name as the rulebook prints it. */
  name: string;
  /** Body points when thick, and when thin. Zero means „this is not cover". */
  thick: number;
  thin: number;
}

/**
 * One thing the GM can drop on the map: a label, a material, a thickness and
 * the size it usually has.
 *
 * Presets exist so that placing cover is „click Samochód, drag a rectangle"
 * rather than a form with two dropdowns. The material is still the source of
 * the numbers — the preset only picks a row of the table and a default size.
 */
export interface CpredCoverPreset {
  id: string;
  name: string;
  materialId: string;
  thickness: CpredCoverThickness;
  /** Default footprint in metres, used to pre-size the drag. */
  widthM: number;
  heightM: number;
}

export interface CpredCoverCatalogue {
  materials: CpredCoverMaterial[];
  presets: CpredCoverPreset[];
}

export const EMPTY_COVER_CATALOGUE: CpredCoverCatalogue = { materials: [], presets: [] };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Parses and validates a catalogue file; malformed rows are dropped, not fatal. */
export function buildCoverCatalogue(raw: unknown): CpredCoverCatalogue {
  if (typeof raw !== 'object' || raw === null) return EMPTY_COVER_CATALOGUE;
  const source = raw as { materials?: unknown; presets?: unknown };
  const materials: CpredCoverMaterial[] = [];
  for (const entry of Array.isArray(source.materials) ? source.materials : []) {
    if (typeof entry !== 'object' || entry === null) continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== 'string' || typeof row.name !== 'string') continue;
    if (!isFiniteNumber(row.thick) || !isFiniteNumber(row.thin)) continue;
    materials.push({
      id: row.id,
      name: row.name,
      thick: Math.max(0, Math.round(row.thick)),
      thin: Math.max(0, Math.round(row.thin)),
    });
  }

  const byId = new Map(materials.map((material) => [material.id, material]));
  const presets: CpredCoverPreset[] = [];
  for (const entry of Array.isArray(source.presets) ? source.presets : []) {
    if (typeof entry !== 'object' || entry === null) continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== 'string' || typeof row.name !== 'string') continue;
    if (typeof row.materialId !== 'string' || !byId.has(row.materialId)) continue;
    const thickness = (CPRED_COVER_THICKNESSES as readonly string[]).includes(
      row.thickness as string,
    )
      ? (row.thickness as CpredCoverThickness)
      : 'thick';
    presets.push({
      id: row.id,
      name: row.name,
      materialId: row.materialId,
      thickness,
      widthM: isFiniteNumber(row.widthM) ? Math.max(0.5, row.widthM) : 2,
      heightM: isFiniteNumber(row.heightM) ? Math.max(0.5, row.heightM) : 2,
    });
  }
  return { materials, presets };
}

/** Body points of one material at one thickness; 0 when the table says so. */
export function cpredCoverHp(
  catalogue: CpredCoverCatalogue,
  materialId: string,
  thickness: CpredCoverThickness,
): number {
  const material = catalogue.materials.find((entry) => entry.id === materialId);
  if (!material) return 0;
  return thickness === 'thick' ? material.thick : material.thin;
}

/** The preset a placement names, or null when the client sent an unknown id. */
export function cpredCoverPreset(
  catalogue: CpredCoverCatalogue,
  typeId: string,
): CpredCoverPreset | null {
  return catalogue.presets.find((preset) => preset.id === typeId) ?? null;
}

/** Body points a preset starts with; 0 means the preset is not cover at all. */
export function cpredCoverPresetHp(catalogue: CpredCoverCatalogue, typeId: string): number {
  const preset = cpredCoverPreset(catalogue, typeId);
  if (!preset) return 0;
  return cpredCoverHp(catalogue, preset.materialId, preset.thickness);
}

/** „Stal, cienka — 25 PW" — what the tool palette writes under a preset. */
export function cpredCoverPresetDetail(
  catalogue: CpredCoverCatalogue,
  preset: CpredCoverPreset,
): string {
  const material = catalogue.materials.find((entry) => entry.id === preset.materialId);
  const hp = cpredCoverHp(catalogue, preset.materialId, preset.thickness);
  const name = material?.name ?? preset.materialId;
  return `${name}, ${CPRED_COVER_THICKNESS_LABELS[preset.thickness]} — ${hp} PW`;
}
