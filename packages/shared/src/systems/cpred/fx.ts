/**
 * What a Cyberpunk weapon *sounds and looks like* when it goes off (stage 27i).
 *
 * The same bargain stage 27h struck for slot pictures: the core VTT knows there
 * is a shot with a style and a sound, the system decides which. A renderer that
 * had to ask „is this a shotgun" would be a renderer that has to be edited every
 * time the compendium grows a weapon type.
 *
 * Classification is not repeated here. `cpredWeaponIcon` already walks the three
 * rungs — weapon type, then skill, then what the weapon does — and gets it right
 * for the twenty types in the book and for homebrew rows with neither. This file
 * is one table on top of its answer, so a weapon can never draw a pistol and
 * bang like a shotgun.
 */

import type { ResolvedWeapon } from './compendium.js';
import { cpredWeaponIcon, type CpredSlotIcon } from './hotbar.js';
import type { MapFxShotStyle, MapFxSound } from '../../fx.js';

/** How one weapon shows up on the map. */
export interface CpredWeaponFx {
  style: MapFxShotStyle;
  /** The bang; null for something that makes none worth playing. */
  sound: MapFxSound | null;
}

const ICON_FX: Readonly<Record<CpredSlotIcon, CpredWeaponFx>> = {
  pistol: { style: 'bullet', sound: 'shot-pistol' },
  revolver: { style: 'bullet', sound: 'shot-pistol' },
  smg: { style: 'bullet', sound: 'shot-pistol' },
  'smg-heavy': { style: 'bullet', sound: 'shot-rifle' },
  rifle: { style: 'bullet', sound: 'shot-rifle' },
  sniper: { style: 'bullet', sound: 'shot-sniper' },
  shotgun: { style: 'bullet', sound: 'shot-shotgun' },
  flamethrower: { style: 'flame', sound: 'flame' },
  grenade: { style: 'rocket', sound: 'swing' },
  launcher: { style: 'rocket', sound: 'launch' },
  rocket: { style: 'rocket', sound: 'launch' },
  crossbow: { style: 'arrow', sound: 'bowstring' },
  bow: { style: 'arrow', sound: 'bowstring' },
  knife: { style: 'melee', sound: 'swing' },
  sword: { style: 'melee', sound: 'swing' },
  broadsword: { style: 'melee', sound: 'swing' },
  'two-handed-sword': { style: 'melee', sound: 'swing' },
  fist: { style: 'melee', sound: 'punch' },
  'martial-arts': { style: 'melee', sound: 'punch' },
  // Never reached from a weapon — the icon table lists actions too, and a
  // `Record` that skipped them would stop compiling the day one is renamed.
  reload: { style: 'bullet', sound: 'reload-pistol' },
  'first-aid': { style: 'melee', sound: null },
  grab: { style: 'melee', sound: 'punch' },
  hourglass: { style: 'melee', sound: null },
  'stand-up': { style: 'melee', sound: null },
  run: { style: 'melee', sound: null },
  scanner: { style: 'melee', sound: null },
  'combat-awareness': { style: 'melee', sound: null },
  backup: { style: 'melee', sound: null },
};

/**
 * Broń długa — ta, której magazynek wchodzi na cztery takty, nie na dwa.
 *
 * Domyślny jest pistolet, i to jest wybór, nie przeoczenie: nowa ikona
 * (albo homebrew bez typu) zabrzmi krócej niż powinna, a nie odwrotnie —
 * karabinowy czterotakt pod pistoletem słychać od razu, pistoletowy dwutakt
 * pod karabinem nie kłuje w ucho. Nóż i pięść nigdy tu nie trafią: serwer
 * odzywa się dopiero po udanym przeładowaniu, a te mają `ammoMax` równe zeru.
 */
const LONG_ARMS: ReadonlySet<CpredSlotIcon> = new Set([
  'smg-heavy',
  'rifle',
  'sniper',
  'shotgun',
  'flamethrower',
  'launcher',
  'rocket',
]);

/** Odgłos świeżego magazynka w tej właśnie broni. */
export function cpredReloadSound(resolved: ResolvedWeapon | null): MapFxSound {
  return LONG_ARMS.has(cpredWeaponIcon(resolved)) ? 'reload-rifle' : 'reload-pistol';
}

/**
 * The map effect one weapon fires.
 *
 * A **thrown** weapon overrides the table on purpose: a knife let go of at
 * somebody flies, it does not slash, and the swing it would otherwise draw
 * would happen at the wrong end of the line. An explosive is already a `rocket`
 * through its icon, so it needs no second rule.
 */
export function cpredWeaponFx(resolved: ResolvedWeapon | null): CpredWeaponFx {
  const icon = cpredWeaponIcon(resolved);
  const base = ICON_FX[icon];
  if (resolved?.thrown && base.style === 'melee') return { style: 'arrow', sound: 'swing' };
  return base;
}
