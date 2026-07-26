/**
 * Slug helpers for compendium ids. They live in their own module because both
 * the sheet (`character.ts`, which stores references) and the catalogue
 * (`compendium.ts`, which mints them) need them — importing one from the other
 * would close a cycle.
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

const PL_TRANSLITERATION: Record<string, string> = {
  ą: 'a',
  ć: 'c',
  ę: 'e',
  ł: 'l',
  ń: 'n',
  ó: 'o',
  ś: 's',
  ź: 'z',
  ż: 'z',
};

/** Slug for a compendium id: "Ciężki pistolet" -> "ciezki-pistolet". */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (char) => PL_TRANSLITERATION[char] ?? char)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isValidCompendiumId(value: string): boolean {
  return SLUG_PATTERN.test(value);
}
