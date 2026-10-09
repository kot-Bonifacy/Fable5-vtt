/**
 * Miniatura rodzaju przedmiotu na listach (24.09.2026).
 *
 * Kompendium, półka kreatora, karta postaci, okno wymiany i łupu rysują przy
 * nazwie sylwetkę **rodzaju** — nie konkretnego modelu. Rodzaj broni to jej typ
 * (ta sama sylwetka, co na pasku broni w panelu postaci, bo pytanie „co to za
 * broń" ma w całym VTT jedną odpowiedź), amunicji — kształt naboju, dodatku —
 * to, co dodatek robi, pancerza — czy to kurtka, czy tarcza.
 *
 * Rodzaj czyta się z pól, które maszyna i tak rozumie (`patterns`, `magazine`,
 * `secondary`, `locations`), a nigdy z nazwy ani z id wpisu: id prawdziwego
 * katalogu nie mogą stać w repozytorium, a nazwę wystarczy przetłumaczyć, żeby
 * miniatura zniknęła.
 *
 * Moduł mówi **nazwy** sylwetek, pliki są klienta (`public/icons/hud/`).
 */

import type { CpredAmmoPattern } from './ammo.js';
import type { CpredAttachmentEffect } from './attachments.js';
import type { CompendiumEntry, CompendiumRegistry, WeaponEntry } from './compendium.js';
import { resolveWeapon } from './compendium.js';
import { cpredWeaponIcon, cpredWeaponTypeIcon, cpredWeaponTypeRank } from './hotbar.js';
import type { CpredItemList } from './inventory.js';
import type { ArmorLocation } from './locations.js';
import { CPRED_WEAPON_ICONS, isCpredWeaponIcon, type CpredWeaponIcon } from './weaponicons.js';

/** Sylwetki spoza broni — amunicja, dodatki, pancerz. */
export const CPRED_GEAR_ICONS = [
  'bullets',
  'shells',
  'arrows',
  'rockets',
  'ammo-box',
  'ammo',
  'bayonet',
  'night-vision',
  'smartlink',
  'scope',
  'attachment',
  'armor',
  'shield',
] as const;

export type CpredItemIcon = CpredWeaponIcon | (typeof CPRED_GEAR_ICONS)[number];

/** Wszystkie miniatury, jakie lista może narysować — test pilnuje plików. */
export const CPRED_ITEM_ICONS: readonly CpredItemIcon[] = [
  ...CPRED_WEAPON_ICONS,
  ...CPRED_GEAR_ICONS,
];

/** Kształt naboju → sylwetka; granat jest tym samym granatem, co broń rzucana. */
const AMMO_PATTERN_ICONS: Readonly<Record<CpredAmmoPattern, CpredItemIcon>> = {
  bullet: 'bullets',
  shell: 'shells',
  arrow: 'arrows',
  grenade: 'grenade',
  rocket: 'rockets',
};

/**
 * Amunicja: kształt, w jakim ją robią.
 *
 * Nabój robiony w kilku kształtach („zwykła" to kule, śrut i strzały naraz)
 * dostaje skrzynkę amunicji, a nie pierwszy z brzegu kształt — kula przy
 * przeciwpancernej kazałaby granatnikowi szukać gdzie indziej. Które kształty,
 * mówi i tak wiersz listy.
 */
export function cpredAmmoIcon(patterns: readonly CpredAmmoPattern[]): CpredItemIcon {
  const unique = [...new Set(patterns)];
  return unique.length === 1 ? AMMO_PATTERN_ICONS[unique[0]!] : 'ammo-box';
}

/**
 * Dodatek: to, co robi z bronią.
 *
 * Doczepiona broń rysuje się sylwetką tej broni (podwieszany granatnik jest
 * granatnikiem), a doczepione ostrze — bagnetem, bo nóż przy karabinie czyta
 * się jako „nóż do kupienia", nie jako dodatek.
 */
export function cpredAttachmentIcon(attachment: CpredAttachmentEffect): CpredItemIcon {
  if (attachment.secondary) {
    const icon = cpredWeaponTypeIcon(attachment.secondary.weaponTypeId);
    if (icon === 'knife' || icon === 'sword' || icon === 'broadsword') return 'bayonet';
    return icon ?? 'attachment';
  }
  if (attachment.magazine) return 'ammo';
  if (attachment.ignoresObscurement) return 'night-vision';
  if (attachment.requiresCyberware?.length) return 'smartlink';
  if (attachment.rangedBonus) return 'scope';
  return 'attachment';
}

/** Pancerz: tarcza albo reszta — hełm i kurtka to w CP RED ten sam wpis. */
export function cpredArmorIcon(
  locations: ArmorLocation | readonly ArmorLocation[] | undefined,
): CpredItemIcon {
  const list = typeof locations === 'string' ? [locations] : (locations ?? []);
  return list.length > 0 && list.every((location) => location === 'shield') ? 'shield' : 'armor';
}

/** Miniatura wpisu kompendium; `null` dla kategorii, które jej nie mają. */
export function cpredEntryIcon(
  entry: CompendiumEntry,
  registry: Pick<CompendiumRegistry, 'weaponTypeById'>,
): CpredItemIcon | null {
  switch (entry.category) {
    case 'weapon':
      return cpredWeaponIcon(resolveWeapon(entry, registry));
    case 'ammo':
      return cpredAmmoIcon(entry.patterns);
    case 'attachment':
      return cpredAttachmentIcon(entry);
    case 'armor':
      return cpredArmorIcon(entry.locations);
    default:
      return null;
  }
}

/** Co o wierszu ekwipunku wiadomo bez całej karty — wiersz albo jego widok. */
export interface CpredItemIconSource {
  compendiumId?: string | undefined;
  /** Pancerz wpisany ręcznie nie ma wpisu, ale wie, gdzie siedzi. */
  armorLocation?: ArmorLocation | undefined;
  /**
   * Etap 46c: pudełko amunicji rysuje kształt **swojego** naboju — wpis
   * „Amunicja zwykła” pasuje do kul, śrutu i strzał, a pudełko ma jedno.
   */
  ammo?: { pattern: CpredAmmoPattern } | undefined;
}

/**
 * Miniatura wiersza ekwipunku — na karcie, w wymianie, w łupie.
 *
 * Wiersz z wpisem idzie za wpisem, więc zakupiony pistolet ma na karcie tę
 * samą sylwetkę, co w sklepie. Broń wpisana ręcznie dostaje to samo, co na
 * pasku broni (`cpredWeaponIcon(null)`), pancerz — z miejsca, które chroni,
 * a zwykły sprzęt bez wpisu broni, amunicji ani dodatku — nic.
 */
export function cpredItemRowIcon(
  list: CpredItemList,
  row: CpredItemIconSource,
  lookup: (entryId: string) => CompendiumEntry | undefined,
  registry: Pick<CompendiumRegistry, 'weaponTypeById'>,
): CpredItemIcon | null {
  if (list === 'gear' && row.ammo) return cpredAmmoIcon([row.ammo.pattern]);
  const entry = row.compendiumId ? lookup(row.compendiumId) : undefined;
  const byEntry = entry ? cpredEntryIcon(entry, registry) : null;
  if (byEntry) return byEntry;
  if (list === 'weapons') return cpredWeaponIcon(null);
  if (list === 'armor') return cpredArmorIcon(row.armorLocation);
  return null;
}

/**
 * Kolejność broni na liście: typ (pistolety → karabiny → ciężka → biała),
 * w obrębie typu nazwa. Sortuje kopię.
 */
export function cpredSortWeapons<T extends Pick<WeaponEntry, 'name' | 'weaponTypeId'>>(
  weapons: readonly T[],
): T[] {
  const collator = new Intl.Collator('pl');
  return [...weapons].sort(
    (a, b) =>
      cpredWeaponTypeRank(a.weaponTypeId) - cpredWeaponTypeRank(b.weaponTypeId) ||
      collator.compare(a.name, b.name),
  );
}

/**
 * `weapon-icons.json` (24.09.2026) — modele, którym sylwetka typu kłamie.
 *
 * Rewolwery w podręczniku są średnimi i ciężkimi pistoletami, więc „rewolwer"
 * nie wynika z żadnego pola i musi zostać komuś powiedziany. Plik działa jak
 * `shop-tiers.json`: publiczna próbka nazywa wymyślone wpisy, prywatny — broń
 * grupy i wygrywa po id; nieznana miniatura jest odrzucana i zgłaszana.
 */
export function parseWeaponIcons(raw: unknown): {
  icons: Record<string, CpredWeaponIcon>;
  issues: string[];
} {
  const icons: Record<string, CpredWeaponIcon> = {};
  const issues: string[] = [];
  const table = (raw as { icons?: unknown } | null)?.icons;
  if (typeof table !== 'object' || table === null) {
    return { icons, issues: ['Brak obiektu „icons".'] };
  }
  for (const [id, icon] of Object.entries(table as Record<string, unknown>)) {
    if (isCpredWeaponIcon(icon)) icons[id] = icon;
    else issues.push(`icons.${id}: nieznana miniatura „${String(icon)}".`);
  }
  return { icons, issues };
}

/**
 * Zapisuje miniatury z pliku na wpisy broni jako ich własne `icon` — tak jak
 * `withShopTiers` zapisuje poziomy, żeby każda lista czytała jedno pole.
 * Id, którego katalog nie zna, albo wpis, który nie jest bronią, przepada.
 */
export function withWeaponIcons(
  registry: CompendiumRegistry,
  icons: Readonly<Record<string, CpredWeaponIcon>>,
): CompendiumRegistry {
  if (Object.keys(icons).length === 0) return registry;
  const entries = registry.entries.map((entry) => {
    const icon = icons[entry.id];
    return icon === undefined || entry.category !== 'weapon' ? entry : { ...entry, icon };
  });
  return { ...registry, entries, entryById: new Map(entries.map((entry) => [entry.id, entry])) };
}
