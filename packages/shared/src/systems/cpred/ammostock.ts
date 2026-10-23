/**
 * Zapas amunicji (etap 46c) — czysta logika, bez IO.
 *
 * Do 46c amunicja była „bez dna”: przeładowanie napełniało magazynek do pełna
 * za Akcję i niczego nie zużywało, a granat z magazynkiem 2/2 rzucał się bez
 * końca (#82). Od 46c naboje leżą w ekwipunku jako **pudełka** — zwykłe wiersze
 * wyposażenia z `ammo` (`CpredGearAmmo`) — więc przekazanie, łup, handel
 * i półka handlarza obsługują je bez nowej gałęzi.
 *
 * Od 23.10.2026 (zasada domowa MG) pudełka są wyłącznie na granaty i rakiety:
 * kule, śrut i strzały się nie kończą (`cpredWeaponAmmoCounted` w `ammo.ts`),
 * więc broń na nie przeładowuje się za darmo jak przed 46c, a zakup ich nie
 * zna. Granaty i rakiety liczy każda karta — także NPC i statysta; „bez dna”
 * jest tylko figura bez karty. Ten moduł odpowiada na trzy pytania, każde
 * **jedną** funkcją, bo każde pada w kilkunastu miejscach:
 *
 *  - **które pudełko pasuje do tej broni** — `cpredAmmoStockKeyOf` i kaliber
 *    (`cpredCalibreKey`): rodzina z pola „Amunicja” typu broni, decyzja MG
 *    z 09.10 (granat pasuje i do ręki, i do granatnika — s. 344);
 *  - **ile kosztuje nabój** — `cpredAmmoPiecePrice`: cena wpisu jest za paczkę
 *    10 sztuk, a granatów i rakiet za sztukę (s. 344);
 *  - **co robi przeładowanie** — `cpredReloadFromStock`.
 */

import {
  ammoFitsWeapon,
  cpredAmmoPatternCounted,
  cpredWeaponAmmoCounted,
  type CpredAmmoEffect,
  type CpredAmmoPattern,
  type CpredAmmoProfile,
} from './ammo.js';
import { ITEM_QTY_MAX } from './character.js';
import type { CpredCharacterData, CpredGearAmmo, CpredGearRow } from './character.js';
import type { ResolvedWeapon, WeaponTypeDefinition } from './compendium.js';

/**
 * „Granaty i rakiety trzeba kupować na sztuki. Wszystkie inne rodzaje amunicji
 * kupuje się po 10 sztuk” (s. 344). Cena wpisu amunicji jest ceną paczki.
 */
export const CPRED_AMMO_PACK_SIZE: Readonly<Record<CpredAmmoPattern, number>> = {
  bullet: 10,
  shell: 10,
  arrow: 10,
  grenade: 1,
  rocket: 1,
};

/** Najwięcej paczek w jednym zakupie — sufit pola w oknie, nie zasada. */
export const CPRED_AMMO_PACKS_MAX = 20;

/** Nazwa rodzaju „zwykła” — pudełko bez wpisu z efektami. */
export const CPRED_ORDINARY_AMMO_LABEL = 'Amunicja zwykła';

/* ------------------------------------------------------------------ *
 * Kaliber i rodzaj
 * ------------------------------------------------------------------ */

/**
 * Kaliber jako klucz porównania: bez wielkości liter i nadmiarowych spacji.
 * Pusty napis — broń, której katalog nie powiedział, czym strzela.
 */
export function cpredCalibreKey(label: string | null | undefined): string {
  return (label ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pl');
}

/**
 * Pola efektu naboju. `Record` z `true`, żeby nowe pole `CpredAmmoEffect` bez
 * wpisu tutaj było błędem kompilacji — inaczej nabój z nowym efektem zostałby
 * po cichu „zwykłym” i skleił się ze zwykłymi.
 */
const AMMO_EFFECT_KEYS: Readonly<Record<keyof CpredAmmoEffect, true>> = {
  ablationBonus: true,
  noAblation: true,
  noCriticalInjury: true,
  nonLethal: true,
  ignites: true,
  extraInjuryOn: true,
  spread: true,
  noAim: true,
  noDamage: true,
  check: true,
  smoke: true,
  smart: true,
};

/** Czy nabój czymkolwiek różni się od zwykłego („Nie ma cech specjalnych”). */
export function cpredAmmoHasEffects(ammo: CpredAmmoEffect): boolean {
  const record = ammo as Record<string, unknown>;
  return (Object.keys(AMMO_EFFECT_KEYS) as (keyof CpredAmmoEffect)[]).some((key) => {
    const value = record[key];
    return value !== undefined && value !== null && value !== false && value !== 0;
  });
}

/**
 * Rodzaj naboju tak, jak go zapisuje pudełko: id wpisu z efektami albo `null`.
 * Wpis bez efektów („Amunicja zwykła” z katalogu) to ta sama zwykła amunicja,
 * którą broń ma bez `ammoId` — inaczej dwa pudełka tego samego by się nie
 * skleiły, a magazynek „zwykłej” nie przyjąłby kupionej zwykłej.
 */
export function cpredStockAmmoId(ammo: CpredAmmoProfile | null | undefined): string | null {
  return ammo && cpredAmmoHasEffects(ammo) ? ammo.id : null;
}

/** Co wolno włożyć do tej broni: kaliber i rodzaj. */
export interface CpredAmmoStockKey {
  calibre: string;
  ammoId: string | null;
}

/** Klucz pudełka — `null` dla wiersza, który pudełkiem nie jest. */
export function cpredAmmoStockKeyOf(row: Pick<CpredGearRow, 'ammo'>): CpredAmmoStockKey | null {
  return row.ammo ? { calibre: row.ammo.calibre, ammoId: row.ammo.ammoId } : null;
}

/** Czy pudełko ma ten kaliber i ten rodzaj. */
export function cpredAmmoBoxFits(row: Pick<CpredGearRow, 'ammo'>, key: CpredAmmoStockKey): boolean {
  if (!row.ammo) return false;
  return (
    cpredCalibreKey(row.ammo.calibre) === cpredCalibreKey(key.calibre) &&
    row.ammo.ammoId === key.ammoId
  );
}

/** Czy dwa pudełka to ta sama amunicja (sklejanie w `stacksWith`). */
export function cpredSameAmmo(a: CpredGearAmmo, b: CpredGearAmmo): boolean {
  return cpredCalibreKey(a.calibre) === cpredCalibreKey(b.calibre) && a.ammoId === b.ammoId;
}

/** Ile naboi danego rodzaju i kalibru leży w ekwipunku. */
export function cpredAmmoStockCount(gear: readonly CpredGearRow[], key: CpredAmmoStockKey): number {
  let total = 0;
  for (const row of gear) if (cpredAmmoBoxFits(row, key)) total += row.qty;
  return total;
}

/**
 * Zapas kalibru według rodzaju — liczby przy wyborze naboju na karcie
 * („Przeciwpancerna — 16”). Klucz `null` to zwykła.
 */
export function cpredAmmoStockByKind(
  gear: readonly CpredGearRow[],
  calibre: string,
): Map<string | null, number> {
  const wanted = cpredCalibreKey(calibre);
  const counts = new Map<string | null, number>();
  for (const row of gear) {
    if (!row.ammo || cpredCalibreKey(row.ammo.calibre) !== wanted) continue;
    counts.set(row.ammo.ammoId, (counts.get(row.ammo.ammoId) ?? 0) + row.qty);
  }
  return counts;
}

/** „Amunicja przeciwpancerna · C. Pistolet” — nazwa wiersza pudełka. */
export function cpredAmmoBoxName(kindName: string | null, calibre: string): string {
  return `${kindName ?? CPRED_ORDINARY_AMMO_LABEL} · ${calibre.trim()}`;
}

/** Kształt naboju, w którym dana broń przyjmuje dany rodzaj. */
export function cpredAmmoPatternFor(
  ammo: Pick<CpredAmmoProfile, 'patterns'> | null,
  weapon: Pick<ResolvedWeapon, 'ammoPatterns'> | null | undefined,
): CpredAmmoPattern | null {
  const patterns = weapon?.ammoPatterns ?? [];
  if (!ammo) return patterns[0] ?? null;
  return patterns.find((pattern) => ammo.patterns.includes(pattern)) ?? ammo.patterns[0] ?? null;
}

/* ------------------------------------------------------------------ *
 * Ceny
 * ------------------------------------------------------------------ */

/**
 * Cena jednego naboju z ceny wpisu (która jest ceną paczki). Półka i odkup
 * handlarza liczą sztukę tym, a nie ceną paczki — inaczej pudełko 40 naboi
 * byłoby warte cztery razy tyle, co cztery paczki.
 */
export function cpredAmmoPiecePrice(packPrice: number, pattern: CpredAmmoPattern): number {
  return packPrice / CPRED_AMMO_PACK_SIZE[pattern];
}

/* ------------------------------------------------------------------ *
 * Zakup
 * ------------------------------------------------------------------ */

/** Jeden kaliber, do którego da się kupić dany nabój. */
export interface CpredCalibreOption {
  /** Nazwa z pola „Amunicja” typu broni — taka, jaką drukuje wiersz broni. */
  calibre: string;
  /** Typy broni, które go przyjmują („Ciężki pistolet”, „Ciężki PM”). */
  typeNames: string[];
  /** Pierwszy z tych typów — tego id klient używa w żądaniu zakupu. */
  weaponTypeId: string;
  pattern: CpredAmmoPattern;
}

/**
 * Kalibry, do których pasuje nabój — wybór w oknie zakupu. Jeden wiersz na
 * rodzinę, nie na typ broni: ciężki pistolet i ciężki PM dzielą „C. Pistolet”.
 * Tylko kształty, które się kończą (23.10): pusta lista znaczy „tej amunicji
 * się nie kupuje — wybiera się ją na wierszu broni”.
 */
export function cpredCalibreOptions(
  ammo: Pick<CpredAmmoProfile, 'id' | 'patterns'>,
  weaponTypes: Iterable<WeaponTypeDefinition>,
): CpredCalibreOption[] {
  const byKey = new Map<string, CpredCalibreOption>();
  for (const type of weaponTypes) {
    if (type.melee || !type.ammunition) continue;
    if (!ammoFitsWeapon(ammo, type)) continue;
    const pattern = cpredAmmoPatternFor(ammo, type);
    if (!pattern || !cpredAmmoPatternCounted(pattern)) continue;
    const key = cpredCalibreKey(type.ammunition);
    const known = byKey.get(key);
    if (known) known.typeNames.push(type.name);
    else {
      byKey.set(key, {
        calibre: type.ammunition.trim(),
        typeNames: [type.name],
        weaponTypeId: type.id,
        pattern,
      });
    }
  }
  return [...byKey.values()];
}

/**
 * Pudełko z zakupu: `packs` paczek wpisu do kalibru typu broni. Cenę liczy
 * wołający z `entryPrice` × `packs` — ten moduł nie zna pasm cen.
 *
 * `null`, gdy nabój do tej broni nie pasuje (`AMMO_MISMATCH` po stronie
 * serwera): zakup „przeciwpancernej do łuku z kulami” to pomyłka, nie towar.
 * Tak samo kule, śrut i strzały (23.10) — te się nie kończą, więc nie ma czego
 * kupować.
 */
export function cpredPurchasedAmmoRow(
  entry: CpredAmmoProfile,
  weaponType: WeaponTypeDefinition,
  packs: number,
  rowId: string,
): CpredGearRow | null {
  if (weaponType.melee || !weaponType.ammunition) return null;
  if (!ammoFitsWeapon(entry, weaponType)) return null;
  const pattern = cpredAmmoPatternFor(entry, weaponType);
  if (!pattern || !cpredAmmoPatternCounted(pattern)) return null;
  const ammoId = cpredStockAmmoId(entry);
  const calibre = weaponType.ammunition.trim();
  return {
    id: rowId,
    name: cpredAmmoBoxName(ammoId ? entry.name : null, calibre),
    notes: '',
    compendiumId: entry.id,
    qty: CPRED_AMMO_PACK_SIZE[pattern] * packs,
    ammo: { ammoId, calibre, pattern },
  };
}

/**
 * Wpis katalogu, który sprzedaje zwykłą amunicję danego kształtu — pierwszy
 * bez efektów. Tym wpisem znaczy się pudełko z naboi wyjętych z magazynka,
 * żeby miało cenę u handlarza i miniaturę.
 */
export function cpredOrdinaryAmmoEntryId(
  catalogue: readonly CpredAmmoProfile[],
  pattern: CpredAmmoPattern,
): string | null {
  return (
    catalogue.find((ammo) => !cpredAmmoHasEffects(ammo) && ammo.patterns.includes(pattern))?.id ??
    null
  );
}

/* ------------------------------------------------------------------ *
 * Zdejmowanie i dokładanie
 * ------------------------------------------------------------------ */

/**
 * Dokłada naboje do zapasu: skleja z pudełkiem tego samego rodzaju i kalibru,
 * a gdy go nie ma (albo jest pełne do `ITEM_QTY_MAX`) — dopisuje wiersz.
 */
export function cpredPutAmmo(
  gear: readonly CpredGearRow[],
  box: Pick<CpredGearRow, 'name' | 'compendiumId'> & { ammo: CpredGearAmmo },
  qty: number,
  makeId: () => string,
): CpredGearRow[] {
  const next = [...gear];
  let left = qty;
  for (let index = 0; index < next.length && left > 0; index += 1) {
    const row = next[index]!;
    if (!row.ammo || !cpredSameAmmo(row.ammo, box.ammo)) continue;
    const room = ITEM_QTY_MAX - row.qty;
    if (room <= 0) continue;
    const added = Math.min(room, left);
    next[index] = { ...row, qty: row.qty + added };
    left -= added;
  }
  const taken = new Set(next.map((row) => row.id));
  while (left > 0) {
    let id = makeId();
    while (taken.has(id)) id = makeId();
    taken.add(id);
    const added = Math.min(ITEM_QTY_MAX, left);
    next.push({
      id,
      name: box.name,
      notes: '',
      ...(box.compendiumId ? { compendiumId: box.compendiumId } : {}),
      qty: added,
      ammo: { ...box.ammo },
    });
    left -= added;
  }
  return next;
}

/**
 * Zdejmuje `count` naboi z pasujących pudełek, w kolejności karty; pudełko,
 * które się opróżniło, znika. `null`, gdy tyle nie ma — nic nie zdjęto.
 */
export function cpredTakeAmmo(
  gear: readonly CpredGearRow[],
  key: CpredAmmoStockKey,
  count: number,
): CpredGearRow[] | null {
  if (count <= 0) return [...gear];
  if (cpredAmmoStockCount(gear, key) < count) return null;
  let left = count;
  const next: CpredGearRow[] = [];
  for (const row of gear) {
    if (left > 0 && cpredAmmoBoxFits(row, key)) {
      const used = Math.min(row.qty, left);
      left -= used;
      if (row.qty - used > 0) next.push({ ...row, qty: row.qty - used });
      continue;
    }
    next.push(row);
  }
  return next;
}

/* ------------------------------------------------------------------ *
 * Przeładowanie
 * ------------------------------------------------------------------ */

export interface CpredReloadFromStockInput {
  gear: readonly CpredGearRow[];
  /** Kaliber broni (`ResolvedWeapon.ammoType`). */
  calibre: string;
  /** Pojemność magazynka. */
  capacity: number;
  /** Co siedzi w magazynku: ile i jakiego rodzaju (`null` = zwykła). */
  loaded: { count: number; ammoId: string | null };
  /** Rodzaj, który ma wejść (`null` = zwykła). */
  nextAmmoId: string | null;
  /**
   * Pudełko dla naboi, które wracają z magazynka przy zmianie rodzaju: nazwa,
   * wpis katalogu i kształt — rodzaj i kaliber bierze się z `loaded`.
   */
  returned: { name: string; compendiumId?: string; pattern: CpredAmmoPattern };
  makeId: () => string;
}

export type CpredReloadFromStockResult =
  | {
      ok: true;
      gear: CpredGearRow[];
      /** Stan magazynka po przeładowaniu. */
      count: number;
      /** Ile naboi weszło z zapasu. */
      taken: number;
      /** Ile wróciło z magazynka do zapasu (zmiana rodzaju). */
      returned: number;
    }
  | { ok: false; error: 'NO_AMMO' | 'MAGAZINE_FULL' };

/**
 * Przeładowanie z zapasu (etap 46c).
 *
 * „Załadowujesz magazynek do pełna” (s. 169) — tyle, ile jest: przy małym
 * zapasie wchodzi reszta, a przy zerowym nie dzieje się nic i odmowa mówi
 * `NO_AMMO` (Akcja nie jest wydana — tego pilnuje wołający, księgując ją
 * dopiero po udanym wyniku). Zmiana rodzaju wyjmuje magazynek: naboje wracają
 * do zapasu swojego rodzaju, a nie przepadają — nikt przy stole nie wyrzuca
 * pół magazynka przeciwpancernej, żeby załadować zwykłą.
 */
export function cpredReloadFromStock(input: CpredReloadFromStockInput): CpredReloadFromStockResult {
  const changing = input.nextAmmoId !== input.loaded.ammoId;
  const keep = changing ? 0 : Math.max(0, Math.min(input.loaded.count, input.capacity));
  const need = input.capacity - keep;
  if (need <= 0) return { ok: false, error: 'MAGAZINE_FULL' };
  const nextKey = { calibre: input.calibre, ammoId: input.nextAmmoId };
  const available = cpredAmmoStockCount(input.gear, nextKey);
  if (available <= 0) return { ok: false, error: 'NO_AMMO' };
  const taken = Math.min(need, available);
  // Najpierw zdjęcie, potem zwrot: przy pełnym `ITEM_QTY_MAX` zwracane naboje
  // nie mogą wpaść do pudełka, z którego właśnie się bierze.
  let gear = cpredTakeAmmo(input.gear, nextKey, taken)!;
  const returned = changing ? Math.max(0, input.loaded.count) : 0;
  if (returned > 0) {
    gear = cpredPutAmmo(
      gear,
      {
        name: input.returned.name,
        ...(input.returned.compendiumId ? { compendiumId: input.returned.compendiumId } : {}),
        ammo: {
          ammoId: input.loaded.ammoId,
          calibre: input.calibre.trim(),
          pattern: input.returned.pattern,
        },
      },
      returned,
      input.makeId,
    );
  }
  return { ok: true, gear, count: keep + taken, taken, returned };
}

/**
 * Broń, którą się rzuca, a nie przeładowuje (decyzja MG 7 z 09.10): granat
 * ręczny bez magazynka bierze sztukę z zapasu przy każdym rzucie. Nóż rzucany
 * tym nie jest — nie ma kształtu naboju.
 */
export function cpredThrowsFromStock(
  row: { ammoMax: number },
  resolved: Pick<ResolvedWeapon, 'thrown' | 'ammoPatterns'> | null | undefined,
): boolean {
  return resolved?.thrown === true && (resolved.ammoPatterns?.length ?? 0) > 0 && row.ammoMax <= 0;
}

/**
 * Broń, do której nie ma w ekwipunku ani jednego naboju jej kalibru —
 * ostrzeżenie w podsumowaniu kreatora („Broń bez zapasu amunicji: …”).
 * Broń bez kalibru (biała, łuk bez magazynka, wpisana ręką) i broń „bez dna”
 * (kule, śrut, strzały — 23.10) się nie liczy.
 */
export function cpredWeaponsWithoutStock(
  sheet: Pick<CpredCharacterData, 'weapons' | 'gear'>,
  resolve: (compendiumId: string | undefined) => ResolvedWeapon | null,
): string[] {
  const names: string[] = [];
  for (const row of sheet.weapons) {
    const resolved = resolve(row.compendiumId);
    const calibre = resolved?.ammoType;
    if (!calibre || !cpredWeaponAmmoCounted(resolved)) continue;
    if (row.ammoMax <= 0 && !cpredThrowsFromStock(row, resolved)) continue;
    if (cpredAmmoStockByKind(sheet.gear, calibre).size > 0) continue;
    names.push(row.name);
  }
  return names;
}

/**
 * Czy łata karty dokłada naboi (decyzja MG 6 z 09.10: gracz tylko zmniejsza).
 *
 * Liczy się każdy sposób, którym ręka przy karcie mogłaby ominąć zapas:
 * większy magazynek broni i broni podwieszanej (także zdjęty wpis
 * `attachmentAmmo`, który znaczy „pełny”), zmiana rodzaju naboju poza
 * przeładowaniem i więcej naboi któregokolwiek rodzaju w pudełkach. Nowy
 * wiersz broni z katalogu tu nie wpada — to sprawa przedmiotów, nie zapasu.
 */
export function cpredAmmoPatchRaises(
  current: Pick<CpredCharacterData, 'weapons' | 'gear'>,
  patch: Partial<Pick<CpredCharacterData, 'weapons' | 'gear'>>,
): boolean {
  if (patch.weapons) {
    const before = new Map(current.weapons.map((row) => [row.id, row]));
    for (const row of patch.weapons) {
      const old = before.get(row.id);
      if (!old) continue;
      if (row.ammoCurrent > old.ammoCurrent) return true;
      if ((row.ammoId ?? null) !== (old.ammoId ?? null)) return true;
      for (const [attachmentId, count] of Object.entries(old.attachmentAmmo ?? {})) {
        const next = row.attachmentAmmo?.[attachmentId];
        if (next === undefined || next > count) return true;
      }
      const oldKinds = old.attachmentAmmoId ?? {};
      const newKinds = row.attachmentAmmoId ?? {};
      const kinds = new Set([...Object.keys(oldKinds), ...Object.keys(newKinds)]);
      for (const attachmentId of kinds) {
        if (oldKinds[attachmentId] !== newKinds[attachmentId]) return true;
      }
    }
  }
  if (patch.gear) {
    const totals = (gear: readonly CpredGearRow[]) => {
      const sums = new Map<string, number>();
      for (const row of gear) {
        if (!row.ammo) continue;
        const key = `${cpredCalibreKey(row.ammo.calibre)}|${row.ammo.ammoId ?? ''}`;
        sums.set(key, (sums.get(key) ?? 0) + row.qty);
      }
      return sums;
    };
    const before = totals(current.gear);
    for (const [key, qty] of totals(patch.gear)) {
      if (qty > (before.get(key) ?? 0)) return true;
    }
  }
  return false;
}
