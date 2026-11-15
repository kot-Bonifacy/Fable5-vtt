/**
 * Skutki Ulepszania Technika na wierszach karty (etap 71d1, G14–G16; s. 148).
 *
 * Etap 30b wypisał dziesięć sposobów Ulepszania i policzył jeden (+1 OB), bo
 * reszta stała na maszynerii, której wtedy nie było. Dziś ta maszyneria jest:
 * gniazda dodatków (31), gniazda deku (48b), jakość broni czytana w ataku,
 * montaż wszczepu z Utratą Człowieczeństwa (59a). Ten moduł spina stempel
 * `CpredItemRow.upgrade` z tymi miejscami:
 *
 *  - **co wolno ulepszyć czym** — `cpredItemUpgradeProblem` (ta sama odpowiedź
 *    w menu MG, a od 71d2 w Teście Technika);
 *  - **stempel** — `cpredApplyItemUpgrade`: zapisuje `upgrade` i to, co zmienia
 *    się raz na zawsze w liczbach wiersza (OB pancerza, gniazda opcji wszczepu);
 *  - **odczyt** — broń po ulepszeniu (`cpredUpgradedWeapon`: gniazdo, gniazdo
 *    w broni egzotycznej, jakość Doskonała, broń do ukrycia), gniazda deku
 *    (`cpredUpgradedDeckSlots`) i UC wszczepu przy montażu
 *    (`cpredUpgradedHumanityLoss`).
 *
 * Czysta logika: nie importuje serwera ani klienta, a `roleability.ts` jej nie
 * importuje (lista dziesięciu skutków zostaje tam, gdzie była).
 */

import type {
  CpredArmorRow,
  CpredCyberwareRow,
  CpredGearRow,
  CpredItemRow,
  CpredWeaponRow,
} from './character.js';
import type { CompendiumEntry, CyberwareEntry, ResolvedWeapon } from './compendium.js';
import { CPRED_WEAPON_SLOTS_CEILING } from './attachments.js';
import { cpredItemUpgrade, CPRED_ITEM_UPGRADES } from './roleability.js';

/** Wiersz, który Technik ulepsza, z tym, co trzeba o nim wiedzieć. */
export type CpredUpgradeSubject =
  | { kind: 'weapon'; row: CpredWeaponRow; resolved: ResolvedWeapon | null }
  | { kind: 'armor'; row: CpredArmorRow }
  | { kind: 'gear'; row: CpredGearRow; entry: CompendiumEntry | undefined }
  | { kind: 'cyberware'; row: CpredCyberwareRow };

export type CpredItemUpgradeProblem =
  'UNKNOWN_UPGRADE' | 'ALREADY_UPGRADED' | 'UPGRADE_NOT_FOR_ITEM';

export const CPRED_ITEM_UPGRADE_PROBLEMS: Record<CpredItemUpgradeProblem, string> = {
  UNKNOWN_UPGRADE: 'Nie ma takiego sposobu Ulepszania.',
  ALREADY_UPGRADED: 'Ten przedmiot był już ulepszony — Ulepszanie działa na rzecz tylko raz.',
  UPGRADE_NOT_FOR_ITEM: 'Tego sposobu Ulepszania nie da się użyć na tej rzeczy.',
};

/**
 * Broń egzotyczna oczami VTT: dystansowa, nie rzucana, bez gniazd z katalogu.
 *
 * „Każda zwykła (nie egzotyczna) broń dystansowa ma trzy gniazda” (s. 342) —
 * więc zero gniazd przy broni dystansowej jest tym, co wpis mówi o egzotyce
 * (miotacz ognia). Granat i broń biała gniazd nie mają z innego powodu.
 */
export function cpredWeaponIsExotic(
  resolved: Pick<ResolvedWeapon, 'melee' | 'thrown' | 'attachmentSlots'> | null | undefined,
): boolean {
  return (
    !!resolved &&
    !resolved.melee &&
    resolved.thrown !== true &&
    (resolved.attachmentSlots ?? 0) <= 0
  );
}

/** Kości k6 w zapisie Utraty Człowieczeństwa („2k6” → 2); 0 dla stałej albo innej kości. */
function humanityD6Count(notation: string | undefined): number {
  const match = /^\s*(\d+)\s*[kd]\s*6\s*$/i.exec(notation ?? '');
  return match ? Number(match[1]) : 0;
}

/**
 * „Obniżasz Utratę Człowieczeństwa za cyborgizacje niebędące borgizacjami
 * o 1k6, jeśli UC tej cyborgizacji wynosi 2k6 lub więcej” (s. 148).
 */
export function cpredHumanityUpgradeFits(
  entry: Pick<CyberwareEntry, 'type' | 'humanityLoss'> | null | undefined,
): boolean {
  return !!entry && entry.type !== 'borgware' && humanityD6Count(entry.humanityLoss) >= 2;
}

function fits(upgradeId: string, target: CpredUpgradeSubject): boolean {
  switch (upgradeId) {
    case 'armorSp':
      return target.kind === 'armor' && target.row.sp > 0;
    case 'fastRepair':
      return target.kind === 'weapon' || target.kind === 'armor' || target.kind === 'gear';
    case 'invention':
      return true;
    case 'humanity':
      // Przed montażem: UC rzuca się raz, przy wszczepieniu (59a). Wszczep już
      // w ciele swoją cenę zapłacił.
      return (
        target.kind === 'gear' &&
        target.entry?.category === 'cyberware' &&
        cpredHumanityUpgradeFits(target.entry)
      );
    case 'slot':
      if (target.kind === 'weapon') {
        const resolved = target.resolved;
        return !!resolved && !resolved.melee && resolved.attachmentSlots > 0;
      }
      if (target.kind === 'gear') {
        return target.entry?.category === 'gear' && (target.entry.deckSlots ?? 0) > 0;
      }
      // „Nowe gniazdo musi być tego samego rodzaju, co gniazda już posiadane”.
      return target.kind === 'cyberware' && target.row.foundation === true;
    case 'concealable':
      return (
        target.kind === 'weapon' &&
        !!target.resolved &&
        target.resolved.hands === 1 &&
        !target.resolved.concealable
      );
    case 'excellent':
      // „ze Zwykłej na Doskonałą” — niska jakość nie przeskakuje dwóch szczebli.
      return target.kind === 'weapon' && !!target.resolved && target.resolved.quality === undefined;
    case 'exoticSlot':
    case 'exoticAmmo':
      return target.kind === 'weapon' && cpredWeaponIsExotic(target.resolved);
    default:
      // `vehicleMod` jedzie montażem w aucie (71c2), nie wierszem karty.
      return false;
  }
}

/** Czemu tego ulepszenia nie da się dać tej rzeczy — null, gdy można. */
export function cpredItemUpgradeProblem(
  upgradeId: string,
  target: CpredUpgradeSubject,
): CpredItemUpgradeProblem | null {
  if (!cpredItemUpgrade(upgradeId)) return 'UNKNOWN_UPGRADE';
  if (target.row.upgrade) return 'ALREADY_UPGRADED';
  return fits(upgradeId, target) ? null : 'UPGRADE_NOT_FOR_ITEM';
}

/** Sposoby Ulepszania, które pasują do tej rzeczy — lista menu. */
export function cpredUpgradesForTarget(target: CpredUpgradeSubject): string[] {
  if (target.row.upgrade) return [];
  return CPRED_ITEM_UPGRADES.filter((entry) => fits(entry.id, target)).map((entry) => entry.id);
}

/**
 * Stempel ulepszenia na wierszu. To, co zmienia liczbę zapisaną w wierszu
 * (OB pancerza, gniazda opcji wszczepu), zmienia się tu, raz; to, co wiersz
 * czyta z katalogu (gniazda i jakość broni, gniazda deku, UC), czyta się
 * funkcjami niżej. Wołający sprawdza `cpredItemUpgradeProblem` przed stemplem.
 */
export function cpredApplyItemUpgrade<T extends CpredItemRow>(row: T, upgradeId: string): T {
  const next = { ...row, upgrade: upgradeId } as T;
  if (upgradeId === 'armorSp' && 'sp' in next) {
    const armor = next as unknown as CpredArmorRow;
    return { ...next, sp: armor.sp + 1, spCurrent: armor.spCurrent + 1 };
  }
  if (upgradeId === 'slot' && 'foundation' in next && next.foundation === true) {
    const chrome = next as unknown as CpredCyberwareRow;
    return { ...next, slots: (chrome.slots ?? 0) + 1 };
  }
  return next;
}

/**
 * Broń tak, jak ją widzi stół po Ulepszaniu: katalog plus stempel wiersza.
 *
 * Każde miejsce, które czyta gniazda, jakość albo „do ukrycia” broni z karty,
 * woła tę funkcję zamiast gołego `resolveWeapon` — inaczej karta i planer
 * ataku powiedzą o tej samej broni dwie różne rzeczy.
 */
export function cpredUpgradedWeapon(
  resolved: ResolvedWeapon,
  upgrade: string | undefined,
): ResolvedWeapon {
  switch (upgrade) {
    case 'slot':
      return resolved.melee || resolved.attachmentSlots <= 0
        ? resolved
        : {
            ...resolved,
            attachmentSlots: Math.min(resolved.attachmentSlots + 1, CPRED_WEAPON_SLOTS_CEILING),
          };
    case 'exoticSlot':
      return cpredWeaponIsExotic(resolved) ? { ...resolved, attachmentSlots: 1 } : resolved;
    case 'excellent':
      return resolved.quality === undefined ? { ...resolved, quality: 'excellent' } : resolved;
    case 'concealable':
      return resolved.hands === 1 ? { ...resolved, concealable: true } : resolved;
    default:
      return resolved;
  }
}

/** Gniazda deku z wiersza Wyposażenia: katalog plus jedno z Ulepszania. */
export function cpredUpgradedDeckSlots(slots: number, upgrade: string | undefined): number {
  return upgrade === 'slot' ? slots + 1 : slots;
}

/**
 * Zapis UC, którym rzuca montaż: o 1k6 mniej przy wszczepie ulepszonym
 * „Łagodniejszą cyborgizacją” (s. 148), jeśli wpis się kwalifikuje.
 */
export function cpredUpgradedHumanityLoss(
  entry: Pick<CyberwareEntry, 'type' | 'humanityLoss'>,
  upgrade: string | undefined,
): { notation: string | undefined; reduced: boolean } {
  if (upgrade !== 'humanity' || !cpredHumanityUpgradeFits(entry)) {
    return { notation: entry.humanityLoss, reduced: false };
  }
  return { notation: `${humanityD6Count(entry.humanityLoss) - 1}k6`, reduced: true };
}
