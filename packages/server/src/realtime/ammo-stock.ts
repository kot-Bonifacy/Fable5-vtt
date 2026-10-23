import {
  ammoProfilesOf,
  cpredAmmoBoxName,
  cpredAmmoPatternFor,
  cpredOrdinaryAmmoEntryId,
  cpredReloadFromStock,
  cpredStockAmmoId,
  cpredTakeAmmo,
  cpredWeaponAmmoCounted,
  loadedAmmoFor,
  type CpredAmmoProfile,
  type CpredCharacterData,
  type CpredGearRow,
  type ResolvedWeapon,
} from '@vtt/shared';
import { buildCompendiumSync } from './compendium.js';
import { nextRowId } from './economy.js';
import { RealtimeError, type RealtimeDeps } from './registry.js';

/**
 * Zapas amunicji po stronie serwera (etap 46c).
 *
 * Czysta reguła mieszka w `shared/.../ammostock.ts`; tu jest tylko to, czego
 * moduł czysty nie wie: co mówi katalog kampanii o naboju w magazynku. Od
 * 23.10.2026 (zasada domowa MG) z zapasu biorą wyłącznie granaty i rakiety —
 * każda karta, także NPC i statysta (`cpredWeaponAmmoCounted`).
 */

async function ammoCatalogue(
  deps: RealtimeDeps,
  campaignId: string,
): Promise<{ profiles: CpredAmmoProfile[]; lookup: (id: string) => CpredAmmoProfile | null }> {
  const compendium = await buildCompendiumSync(deps, campaignId);
  const profiles = ammoProfilesOf(compendium.entries);
  const byId = new Map(profiles.map((ammo) => [ammo.id, ammo]));
  return { profiles, lookup: (id) => byId.get(id) ?? null };
}

/** Kaliber broni: z katalogu, a dla wiersza bez wpisu — to, co drukuje karta. */
function calibreOf(weapon: ResolvedWeapon | null, printed: string | undefined): string {
  return (weapon?.ammoType ?? printed ?? '').trim();
}

/**
 * Przeładowanie z zapasu: nowy ekwipunek i stan magazynka, albo `null`, gdy
 * broń jest „bez dna” (kule, śrut, strzały — 23.10) lub nie ma kalibru —
 * wtedy wołający napełnia magazynek jak przed 46c. Bez granatów i rakiet
 * odmowa `NO_AMMO` **przed** księgowaniem Akcji: przeładowanie, które nic nie
 * załadowało, nie kosztuje.
 */
export async function planStockReload(
  deps: RealtimeDeps,
  campaignId: string,
  data: CpredCharacterData,
  input: {
    weapon: ResolvedWeapon | null;
    printedCalibre?: string;
    capacity: number;
    loaded: { count: number; ammoId?: string };
    nextAmmoId?: string;
  },
): Promise<{ gear: CpredGearRow[]; count: number } | null> {
  if (!cpredWeaponAmmoCounted(input.weapon)) return null;
  const calibre = calibreOf(input.weapon, input.printedCalibre);
  if (!calibre) return null;
  const { profiles, lookup } = await ammoCatalogue(deps, campaignId);
  const loadedProfile = loadedAmmoFor(input.loaded, input.weapon, lookup);
  const nextProfile = loadedAmmoFor(
    input.nextAmmoId ? { ammoId: input.nextAmmoId } : {},
    input.weapon,
    lookup,
  );
  const loadedKind = cpredStockAmmoId(loadedProfile);
  const pattern = cpredAmmoPatternFor(loadedProfile, input.weapon) ?? 'bullet';
  // Wpis, którym znaczy się pudełko naboi wyjętych z magazynka — dla ceny
  // u handlarza i miniatury; zwykłe biorą pierwszy wpis bez efektów.
  const returnedEntry = loadedKind ?? cpredOrdinaryAmmoEntryId(profiles, pattern);
  const result = cpredReloadFromStock({
    gear: data.gear,
    calibre,
    capacity: input.capacity,
    loaded: { count: input.loaded.count, ammoId: loadedKind },
    nextAmmoId: cpredStockAmmoId(nextProfile),
    returned: {
      name: cpredAmmoBoxName(loadedKind ? loadedProfile!.name : null, calibre),
      ...(returnedEntry ? { compendiumId: returnedEntry } : {}),
      pattern,
    },
    makeId: nextRowId,
  });
  if (!result.ok) {
    if (result.error === 'NO_AMMO') throw new RealtimeError('NO_AMMO');
    return { gear: data.gear, count: input.loaded.count };
  }
  return { gear: result.gear, count: result.count };
}

/**
 * Rzut granatem ręcznym bez magazynka (decyzja MG 7 z 09.10): sztuka rodzaju
 * z wiersza schodzi z zapasu. `null` — broń „bez dna”, rzut niczego nie bierze.
 * Bez sztuki odmowa `NO_AMMO`, zanim planer cokolwiek policzy.
 */
export async function planThrowFromStock(
  deps: RealtimeDeps,
  campaignId: string,
  data: CpredCharacterData,
  row: { ammoId?: string; ammoType: string },
  weapon: ResolvedWeapon | null,
): Promise<CpredGearRow[] | null> {
  if (!cpredWeaponAmmoCounted(weapon)) return null;
  const calibre = calibreOf(weapon, row.ammoType);
  if (!calibre) return null;
  const { lookup } = await ammoCatalogue(deps, campaignId);
  const ammoId = cpredStockAmmoId(loadedAmmoFor(row, weapon, lookup));
  const gear = cpredTakeAmmo(data.gear, { calibre, ammoId }, 1);
  if (!gear) throw new RealtimeError('NO_AMMO');
  return gear;
}
