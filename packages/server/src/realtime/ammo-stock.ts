import {
  ammoProfilesOf,
  cpredAmmoBoxName,
  cpredAmmoPatternFor,
  cpredOrdinaryAmmoEntryId,
  cpredReloadFromStock,
  cpredStockAmmoId,
  cpredTakeAmmo,
  cpredTracksAmmo,
  loadedAmmoFor,
  type CpredAmmoProfile,
  type CpredCharacterData,
  type CpredGearRow,
  type ResolvedWeapon,
} from '@vtt/shared';
import type { Character } from '../generated/prisma/client.js';
import { buildCompendiumSync } from './compendium.js';
import { nextRowId } from './economy.js';
import { RealtimeError, type RealtimeDeps } from './registry.js';
import { isTeamCard } from './team-cards.js';

/**
 * Zapas amunicji po stronie serwera (etap 46c).
 *
 * Czysta reguła mieszka w `shared/.../ammostock.ts`; tu jest tylko to, czego
 * moduł czysty nie wie: czy karta jest drużyną (towarzysz-bot siedzi w profilu
 * bota) i co mówi katalog kampanii o naboju w magazynku.
 */

/** Czy ta karta przeładowuje z ekwipunku — jedna odpowiedź dla broni, dodatku i rzutu. */
export async function characterTracksAmmo(
  deps: RealtimeDeps,
  campaignId: string,
  character: Pick<Character, 'id' | 'ownerId'>,
  data: Pick<CpredCharacterData, 'ammoTracked'>,
): Promise<boolean> {
  if (typeof data.ammoTracked === 'boolean') return data.ammoTracked;
  const owned = character.ownerId !== null;
  const companion = !owned && (await isTeamCard(deps.ctx.prisma, campaignId, character));
  return cpredTracksAmmo(data, { owned, companion });
}

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
 * karta jest „bez dna” (NPC, statysta) lub broń nie ma kalibru — wtedy wołający
 * napełnia magazynek jak przed 46c. Bez naboi odmowa `NO_AMMO` **przed**
 * księgowaniem Akcji: przeładowanie, które nic nie załadowało, nie kosztuje.
 */
export async function planStockReload(
  deps: RealtimeDeps,
  campaignId: string,
  character: Pick<Character, 'id' | 'ownerId'>,
  data: CpredCharacterData,
  input: {
    weapon: ResolvedWeapon | null;
    printedCalibre?: string;
    capacity: number;
    loaded: { count: number; ammoId?: string };
    nextAmmoId?: string;
  },
): Promise<{ gear: CpredGearRow[]; count: number } | null> {
  if (!(await characterTracksAmmo(deps, campaignId, character, data))) return null;
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
 * z wiersza schodzi z zapasu. `null` — karta „bez dna”, rzut niczego nie bierze.
 * Bez sztuki odmowa `NO_AMMO`, zanim planer cokolwiek policzy.
 */
export async function planThrowFromStock(
  deps: RealtimeDeps,
  campaignId: string,
  character: Pick<Character, 'id' | 'ownerId'>,
  data: CpredCharacterData,
  row: { ammoId?: string; ammoType: string },
  weapon: ResolvedWeapon | null,
): Promise<CpredGearRow[] | null> {
  if (!(await characterTracksAmmo(deps, campaignId, character, data))) return null;
  const calibre = calibreOf(weapon, row.ammoType);
  if (!calibre) return null;
  const { lookup } = await ammoCatalogue(deps, campaignId);
  const ammoId = cpredStockAmmoId(loadedAmmoFor(row, weapon, lookup));
  const gear = cpredTakeAmmo(data.gear, { calibre, ammoId }, 1);
  if (!gear) throw new RealtimeError('NO_AMMO');
  return gear;
}
