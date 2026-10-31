/**
 * Światło z ekwipunku (31.10.2026, zgłoszenie MG: „dobyta latarka ma świecić").
 *
 * Latarka na karcie była zwykłym wierszem wyposażenia, a światło figury
 * ustawiał MG ręką w „Edytuj…" każdej figurze z osobna. Teraz wiersz, który
 * świeci (`cpredGearLightProfile`), ma na karcie „Dobądź" / „Schowaj" pod nazwą, jak broń — pole
 * `lit` na wierszu, przełączane jak `connected` egzoszkieletu — a serwer
 * przenosi ten stan na światło każdej figury tej karty (`readSheetLight`
 * w `sheets.ts`, `syncSheetLight` w `tokens.ts`).
 *
 * Karta jest tu źródłem prawdy: przełącznik latarki na mapie u figury z taką
 * kartą zapisuje `lit` na karcie (`cpredSetGearLight`), a nie samo światło
 * żetonu, więc oba miejsca nigdy się nie rozjadą. Figura bez źródła światła
 * w plecaku działa po staremu — światło ustawione przez MG zostaje nietknięte.
 *
 * Ręce: zapalona latarka nie zajmuje ręki w liczeniu `CPRED_HANDS` — VTT nie
 * liczy dziś, co postać trzyma poza bronią i tarczą.
 */

import type { CpredGearRow } from './character.js';

/** Jak świeci przedmiot — kształt światła figury (`TokenLight` bez `on`). */
export interface CpredLightProfile {
  brightM: number;
  dimM: number;
  color: string;
  flicker: boolean;
}

/** Zimna biel LED — barwa z palety świateł mapy. */
const COLD_WHITE = '#e8f4ff';

/**
 * Wpisy kompendium, które świecą. Promienie są stołowe (siatka 2 m), nie
 * z podręcznika: „100 metrów" latarki to zasięg snopu, a figura świeci kołem.
 */
const BY_COMPENDIUM_ID: Readonly<Record<string, CpredLightProfile>> = {
  'gear.latarka': { brightM: 6, dimM: 12, color: COLD_WHITE, flicker: false },
  'gear.latarka-taktyczna': { brightM: 8, dimM: 16, color: COLD_WHITE, flicker: false },
  'gear.flara-alarmowa': { brightM: 8, dimM: 16, color: '#ff5a3c', flicker: true },
  'gear.swiatlo-chemiczne': { brightM: 2, dimM: 4, color: '#a3e635', flicker: false },
};

/** Wiersze wpisane ręką, bez wpisu kompendium — po nazwie. */
const BY_NAME: readonly [RegExp, CpredLightProfile][] = [
  [/latark/i, BY_COMPENDIUM_ID['gear.latarka']!],
  [/pochodni/i, { brightM: 4, dimM: 8, color: '#ffb347', flicker: true }],
  [/flar[aęy]/i, BY_COMPENDIUM_ID['gear.flara-alarmowa']!],
  [/światło chemiczne|swiatlo chemiczne/i, BY_COMPENDIUM_ID['gear.swiatlo-chemiczne']!],
];

/**
 * Czy lampa figury ma dokładnie kształt któregoś przedmiotu — czyli wzięła się
 * z ekwipunku, a nie z „Edytuj…" MG. Po tym serwer poznaje, że latarkę oddano
 * albo wyrzucono i trzeba ją zdjąć z figury; lampy MG (domyślnie ciepła
 * `#ffd9a0`) nie ruszy.
 */
export function cpredIsGearLightShape(light: CpredLightProfile): boolean {
  const all = [...Object.values(BY_COMPENDIUM_ID), ...BY_NAME.map(([, profile]) => profile)];
  return all.some(
    (profile) =>
      profile.brightM === light.brightM &&
      profile.dimM === light.dimM &&
      profile.color.toLowerCase() === light.color.toLowerCase() &&
      profile.flicker === light.flicker,
  );
}

/** Jak świeci ten wiersz wyposażenia, albo `null`, gdy nie świeci wcale. */
export function cpredGearLightProfile(
  row: Pick<CpredGearRow, 'compendiumId' | 'name'>,
): CpredLightProfile | null {
  if (row.compendiumId) {
    const known = BY_COMPENDIUM_ID[row.compendiumId];
    if (known) return known;
  }
  for (const [pattern, profile] of BY_NAME) {
    if (pattern.test(row.name)) return profile;
  }
  return null;
}

/** Światło karty tak, jak widzi je figura: profil i czy świeci. */
export interface CpredSheetLight extends CpredLightProfile {
  on: boolean;
}

/**
 * Światło, które niesie karta, albo `null`, gdy w plecaku nie ma niczego,
 * co świeci (wtedy figura zostaje przy świetle ustawionym przez MG).
 * Zapalony wiersz wygrywa; bez zapalonego — profil pierwszego źródła, zgaszony.
 */
export function cpredSheetLight(data: { gear: readonly CpredGearRow[] }): CpredSheetLight | null {
  let first: CpredLightProfile | null = null;
  for (const row of data.gear) {
    if (row.qty <= 0) continue;
    const profile = cpredGearLightProfile(row);
    if (!profile) continue;
    if (row.lit === true) return { ...profile, on: true };
    first ??= profile;
  }
  return first ? { ...first, on: false } : null;
}

/**
 * Ekwipunek po „zapal" / „zgaś" z mapy. Zapalenie przy już zapalonym źródle
 * niczego nie zmienia, inaczej zapala pierwsze; zgaszenie gasi wszystkie.
 * `null`, gdy karta nie ma czego zapalić.
 */
export function cpredSetGearLight(
  gear: readonly CpredGearRow[],
  on: boolean,
): CpredGearRow[] | null {
  const lights = gear.filter((row) => row.qty > 0 && cpredGearLightProfile(row) !== null);
  if (lights.length === 0) return null;
  if (on) {
    if (lights.some((row) => row.lit === true)) return [...gear];
    const target = lights[0]!.id;
    return gear.map((row) => (row.id === target ? { ...row, lit: true } : row));
  }
  return gear.map((row) => {
    if (row.lit !== true) return row;
    const { lit: _lit, ...rest } = row;
    return rest;
  });
}
