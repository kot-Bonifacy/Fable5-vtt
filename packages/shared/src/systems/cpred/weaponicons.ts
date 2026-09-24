/**
 * The weapon pictures, by name (stage 27h; own module since 24.09.2026).
 *
 * A module with no imports, because both ends need it: `compendium.ts`
 * validates an entry's own `icon` against this list, and `hotbar.ts` — which
 * imports the compendium — picks the picture a slot wears.
 */

/**
 * Weapon pictures (stage 27h, pistols split 24.09.2026).
 *
 * Names of *things*, not of files: the client owns the artwork and only needs
 * to be told what the slot is holding. Until 24.09 the three pistols shared one
 * silhouette, because at 18 px the difference is small and the name underneath
 * says which one it is — but the same pictures now head the shop lists, where
 * the point is to find „a heavy pistol" by eye, so each size has its own.
 *
 * `revolver` is the one picture no weapon *type* wears: the rulebook has no
 * revolver type, only revolver models spread over three pistol types. It comes
 * from the entry's own `icon` (`weapon-icons.json`, or the GM's editor).
 */
export const CPRED_WEAPON_ICONS = [
  'pistol',
  'pistol-heavy',
  'pistol-very-heavy',
  'revolver',
  'smg',
  'smg-heavy',
  'rifle',
  'sniper',
  'shotgun',
  'flamethrower',
  'grenade',
  'launcher',
  'rocket',
  'crossbow',
  'bow',
  'knife',
  'sword',
  'broadsword',
  'two-handed-sword',
  'fist',
  'martial-arts',
] as const;

export type CpredWeaponIcon = (typeof CPRED_WEAPON_ICONS)[number];

/** Polish names of the pictures, for the GM's „Miniatura" picker. */
export const CPRED_WEAPON_ICON_LABELS: Readonly<Record<CpredWeaponIcon, string>> = {
  pistol: 'Średni pistolet',
  'pistol-heavy': 'Ciężki pistolet',
  'pistol-very-heavy': 'Bardzo ciężki pistolet',
  revolver: 'Rewolwer',
  smg: 'Pistolet maszynowy',
  'smg-heavy': 'Ciężki pistolet maszynowy',
  rifle: 'Karabin szturmowy',
  sniper: 'Karabin snajperski',
  shotgun: 'Strzelba',
  flamethrower: 'Miotacz ognia',
  grenade: 'Granat',
  launcher: 'Granatnik',
  rocket: 'Wyrzutnia rakiet',
  crossbow: 'Kusza',
  bow: 'Łuk',
  knife: 'Lekka broń biała',
  sword: 'Średnia broń biała',
  broadsword: 'Duża broń biała',
  'two-handed-sword': 'Bardzo duża broń biała',
  fist: 'Bijatyka',
  'martial-arts': 'Sztuki walki',
};

export function isCpredWeaponIcon(value: unknown): value is CpredWeaponIcon {
  return typeof value === 'string' && (CPRED_WEAPON_ICONS as readonly string[]).includes(value);
}
