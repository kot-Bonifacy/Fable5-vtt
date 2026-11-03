import { useMemo } from 'react';
import {
  cpredGrenadesOutsideHands,
  isWeaponEntry,
  resolveWeapon,
  type CpredOutsideHands,
} from '@vtt/shared';
import { useCompendiumStore } from './stores/compendiumStore.js';

/**
 * Granaty ręczne spoza limitu rąk (29.10.2026) rozpoznane katalogiem stołu —
 * dla `cpredInventoryView`, żeby kafel granatu w oknie „Wymiana” nie dostał
 * znaczka „w rękach” (03.11.2026). Ten sam katalog, co serwer (`outsideHandsOf`).
 */
export function useOutsideHands(): CpredOutsideHands {
  const entries = useCompendiumStore((s) => s.entries);
  const weaponTypeById = useCompendiumStore((s) => s.weaponTypeById);
  return useMemo(() => {
    const types = new Map(Object.entries(weaponTypeById));
    return cpredGrenadesOutsideHands((row) => {
      const entry = row.compendiumId ? entries[row.compendiumId] : undefined;
      return entry && isWeaponEntry(entry) ? resolveWeapon(entry, { weaponTypeById: types }) : null;
    });
  }, [entries, weaponTypeById]);
}
