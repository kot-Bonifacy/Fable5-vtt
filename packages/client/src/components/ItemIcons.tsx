/**
 * Miniatury rodzaju przedmiotu na listach i filtr typów broni (24.09.2026).
 *
 * Która sylwetka należy do którego przedmiotu, rozstrzyga `shared`
 * (`cpredEntryIcon`, `cpredItemRowIcon`) — ta sama odpowiedź, którą pasek broni
 * w panelu postaci dostaje z `cpredWeaponIcon`. Tutaj jest tylko rysowanie:
 * `HudIcon` (maska, kolor z tekstu wiersza), a przedmiot bez miniatury dostaje
 * pusty kwadrat tej samej szerokości, żeby nazwy na liście mieszanej stały
 * w jednej kolumnie.
 */

import { useMemo } from 'react';
import type {
  CompendiumEntry,
  CpredItemIcon,
  CpredItemIconSource,
  CpredItemList,
  CpredItemViewWire,
  WeaponEntry,
} from '@vtt/shared';
import {
  cpredEntryIcon,
  cpredItemRowIcon,
  cpredSortWeapons,
  cpredWeaponTypeIcon,
  cpredWeaponTypeRank,
} from '@vtt/shared';
import { useCompendiumStore } from '../stores/compendiumStore.js';
import { HudIcon } from './HudIcon.js';

/** Sylwetka przy nazwie albo puste miejsce po niej. */
export function ItemIcon({ icon, title }: { icon: CpredItemIcon | null; title?: string }) {
  if (!icon) return <span className="item-icon item-icon--none" aria-hidden />;
  return <HudIcon name={icon} className="item-icon" {...(title ? { title } : {})} />;
}

/** Typy broni z magazynu jako `Map` — kształt, którego chce `resolveWeapon`. */
function useTypeRegistry() {
  const weaponTypeById = useCompendiumStore((s) => s.weaponTypeById);
  return useMemo(
    () => ({ weaponTypeById: new Map(Object.entries(weaponTypeById)) }),
    [weaponTypeById],
  );
}

/** Miniatura wpisu kompendium — lista sklepu, półka kreatora, wybór broni. */
export function useEntryIcon(): (entry: CompendiumEntry) => CpredItemIcon | null {
  const registry = useTypeRegistry();
  return useMemo(() => (entry: CompendiumEntry) => cpredEntryIcon(entry, registry), [registry]);
}

/** Miniatura wiersza ekwipunku — karta postaci, wymiana, łup. */
export function useRowIcon(): (
  list: CpredItemList,
  row: CpredItemIconSource,
) => CpredItemIcon | null {
  const registry = useTypeRegistry();
  const entries = useCompendiumStore((s) => s.entries);
  return useMemo(
    () => (list: CpredItemList, row: CpredItemIconSource) =>
      cpredItemRowIcon(list, row, (id) => entries[id], registry),
    [entries, registry],
  );
}

/** Miniatura rzeczy w oknie wymiany i łupu — widok niesie wpis i lokację. */
export function ItemViewIcon({ item }: { item: CpredItemViewWire }) {
  const rowIcon = useRowIcon();
  return <ItemIcon icon={rowIcon(item.list, item)} />;
}

/** Klucz filtra dla broni bez typu — pusty napis, bo id typu nigdy nim nie jest. */
const UNTYPED = '';

/** Broń wybranego typu (`null` — wszystkie), posortowana typami. */
export function filterWeaponsByType<T extends WeaponEntry>(
  weapons: readonly T[],
  typeId: string | null,
): T[] {
  const picked =
    typeId === null ? weapons : weapons.filter((w) => (w.weaponTypeId ?? UNTYPED) === typeId);
  return cpredSortWeapons(picked);
}

interface TypeChip {
  typeId: string;
  label: string;
  icon: CpredItemIcon | null;
  count: number;
}

/**
 * Rząd sylwetek nad listą broni: klik zawęża listę do jednego typu, drugi
 * klik (albo „Wszystkie”) zdejmuje filtr. Typy bierze z listy, którą dostał —
 * po szukaniu zostają tylko te, w których coś pasuje; wybrany typ zostaje
 * zawsze, choćby z zerem, żeby dało się go odkliknąć.
 */
export function WeaponTypeFilter({
  weapons,
  value,
  onChange,
}: {
  weapons: readonly WeaponEntry[];
  value: string | null;
  onChange: (typeId: string | null) => void;
}) {
  const weaponTypeById = useCompendiumStore((s) => s.weaponTypeById);
  const entryIcon = useEntryIcon();

  const chips = useMemo(() => {
    const byType = new Map<string, TypeChip>();
    for (const weapon of weapons) {
      const typeId = weapon.weaponTypeId ?? UNTYPED;
      const chip = byType.get(typeId);
      if (chip) {
        chip.count += 1;
        continue;
      }
      byType.set(typeId, {
        typeId,
        label: typeId ? (weaponTypeById[typeId]?.name ?? typeId) : 'Bez typu',
        // Sylwetka typu, nie modelu: rewolwer nie może udawać całej kategorii.
        icon: cpredWeaponTypeIcon(typeId) ?? entryIcon({ ...weapon, icon: undefined }),
        count: 1,
      });
    }
    if (value !== null && !byType.has(value)) {
      byType.set(value, {
        typeId: value,
        label: value ? (weaponTypeById[value]?.name ?? value) : 'Bez typu',
        icon: cpredWeaponTypeIcon(value),
        count: 0,
      });
    }
    return [...byType.values()].sort(
      (a, b) =>
        cpredWeaponTypeRank(a.typeId || null) - cpredWeaponTypeRank(b.typeId || null) ||
        a.label.localeCompare(b.label, 'pl'),
    );
  }, [weapons, value, weaponTypeById, entryIcon]);

  if (chips.length < 2 && value === null) return null;

  return (
    <div className="weapon-type-filter" role="group" aria-label="Filtr typu broni">
      <button
        type="button"
        className={`weapon-type-chip ${value === null ? 'weapon-type-chip--active' : ''}`}
        aria-pressed={value === null}
        onClick={() => onChange(null)}
      >
        Wszystkie
      </button>
      {chips.map((chip) => {
        const active = chip.typeId === value;
        return (
          <button
            key={chip.typeId || 'untyped'}
            type="button"
            className={`weapon-type-chip ${active ? 'weapon-type-chip--active' : ''}`}
            aria-pressed={active}
            aria-label={`${chip.label} (${chip.count})`}
            title={`${chip.label} — ${chip.count}`}
            onClick={() => onChange(active ? null : chip.typeId)}
          >
            <ItemIcon icon={chip.icon} />
            <span className="weapon-type-chip-count">{chip.count}</span>
          </button>
        );
      })}
    </div>
  );
}
