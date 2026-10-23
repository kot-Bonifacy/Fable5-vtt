import { useMemo, useState } from 'react';
import type { CompendiumCategory, CompendiumEntry } from '@vtt/shared';
import {
  COMPENDIUM_CATEGORY_LABELS,
  CPRED_AMMO_PACKS_MAX,
  CPRED_AMMO_PACK_SIZE,
  cpredAmmoPatternCounted,
  cpredCalibreOptions,
  cpredIsBareHandsEntry,
  formatCost,
  isAmmoEntry,
  resolveWeapon,
  searchCompendium,
  toAmmoProfile,
} from '@vtt/shared';
import {
  addCompendiumItemToCharacter,
  addFoundCyberwareToCharacter,
  showItemNote,
} from '../../compendium-items.js';
import { useCompendiumStore } from '../../stores/compendiumStore.js';
import { ItemIcon, useEntryIcon } from '../ItemIcons.js';

/** Ile wpisów pokazuje wybór naraz; reszta czeka na doprecyzowanie szukania. */
const PICKER_LIMIT = 40;

/**
 * Co da się włożyć do pojemnika. Rany i Obrona Sieci nie są rzeczami, a gołe
 * ręce ma każda karta z urzędu.
 */
const CONTAINER_CATEGORIES: readonly CompendiumCategory[] = [
  'weapon',
  'armor',
  'gear',
  'ammo',
  'attachment',
  'program',
  'cyberware',
];

/**
 * „+ Z katalogu…” na karcie pojemnika (zlecenie MG z 15.10).
 *
 * To samo co „Dodaj za darmo” w Kompendium, tylko bez szukania skrzyni na
 * liście kart: wiersz powstaje tym samym `purchasedSheetRow`, więc broń ze
 * skrzyni zna tabelę zasięgów jak kupiona. Dwa wyjątki: amunicja potrzebuje
 * kalibru i liczby paczek, a wszczep leży w skrzyni jako rzecz w Wyposażeniu
 * („Znaleziony — montaż”) — skrzyni nikt niczego nie wszczepi.
 */
export function ContainerItemPicker({
  characterId,
  onClose,
}: {
  characterId: string;
  onClose: () => void;
}) {
  const entries = useCompendiumStore((s) => s.entries);
  const order = useCompendiumStore((s) => s.order);
  const weaponTypeById = useCompendiumStore((s) => s.weaponTypeById);
  const entryIcon = useEntryIcon();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CompendiumCategory | ''>('');
  const [ammo, setAmmo] = useState<CompendiumEntry | null>(null);

  const types = useMemo(() => new Map(Object.entries(weaponTypeById)), [weaponTypeById]);

  const found = useMemo(() => {
    const catalogue = order
      .map((id) => entries[id])
      .filter(
        (entry): entry is CompendiumEntry =>
          !!entry &&
          CONTAINER_CATEGORIES.includes(entry.category) &&
          !cpredIsBareHandsEntry(entry.id) &&
          // Kule, śrut i strzały się nie kończą (23.10) — do skrzyni tylko
          // granaty i rakiety.
          !(isAmmoEntry(entry) && !toAmmoProfile(entry).patterns.some(cpredAmmoPatternCounted)),
      );
    return searchCompendium(catalogue, query, category || undefined).slice(0, PICKER_LIMIT);
  }, [entries, order, query, category]);

  async function pick(entry: CompendiumEntry) {
    if (isAmmoEntry(entry)) {
      setAmmo(entry);
      return;
    }
    if (entry.category === 'cyberware') {
      showItemNote(addFoundCyberwareToCharacter(characterId, entry));
      return;
    }
    const resolved =
      entry.category === 'weapon' ? resolveWeapon(entry, { weaponTypeById: types }) : null;
    showItemNote(await addCompendiumItemToCharacter(characterId, entry, resolved));
  }

  return (
    <div className="weapon-picker" data-container-picker>
      <div className="weapon-picker-head">
        <input
          type="search"
          className="weapon-picker-search"
          placeholder="Szukaj w katalogu…"
          aria-label="Szukaj przedmiotu do pojemnika"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              onClose();
            }
          }}
        />
        <select
          value={category}
          aria-label="Rodzaj przedmiotu"
          onChange={(e) => setCategory(e.target.value as CompendiumCategory | '')}
        >
          <option value="">Wszystko</option>
          {CONTAINER_CATEGORIES.map((id) => (
            <option key={id} value={id}>
              {COMPENDIUM_CATEGORY_LABELS[id]}
            </option>
          ))}
        </select>
        <button type="button" className="small-button" onClick={onClose}>
          Gotowe
        </button>
      </div>
      {ammo && (
        <AmmoChoice
          key={ammo.id}
          entry={ammo}
          onAdd={async (choice) => {
            showItemNote(await addCompendiumItemToCharacter(characterId, ammo, null, choice));
            setAmmo(null);
          }}
          onCancel={() => setAmmo(null)}
        />
      )}
      {found.length === 0 ? (
        <p className="weapon-picker-empty">
          {order.length === 0
            ? 'Katalog jest pusty — wczytaj kompendium w zakładce „Kompendium”.'
            : 'Nic takiego nie ma w katalogu. Rzecz fabularną zakładasz własnym wpisem w Kompendium.'}
        </p>
      ) : (
        <ul className="weapon-picker-list">
          {found.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className="weapon-picker-row"
                title="Włóż do pojemnika za darmo"
                onClick={() => void pick(entry)}
              >
                <span className="weapon-picker-name">
                  <ItemIcon icon={entryIcon(entry)} />
                  {entry.name}
                </span>
                <span className="weapon-picker-stats">
                  {COMPENDIUM_CATEGORY_LABELS[entry.category]} · {formatCost(entry)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="weapon-picker-hint" aria-live="polite">
        Klik wkłada rzecz do pojemnika za darmo — wybór zostaje otwarty na następne.
      </p>
    </div>
  );
}

/** Kaliber i paczki — amunicja to pudełko do konkretnej rodziny broni (etap 46c). */
function AmmoChoice({
  entry,
  onAdd,
  onCancel,
}: {
  entry: CompendiumEntry;
  onAdd: (choice: { weaponTypeId: string; packs: number }) => void;
  onCancel: () => void;
}) {
  const weaponTypeById = useCompendiumStore((s) => s.weaponTypeById);
  const calibres = useMemo(
    () =>
      isAmmoEntry(entry)
        ? cpredCalibreOptions(toAmmoProfile(entry), Object.values(weaponTypeById))
        : [],
    [entry, weaponTypeById],
  );
  const [typeId, setTypeId] = useState(calibres[0]?.weaponTypeId ?? '');
  const [packs, setPacks] = useState(1);
  const calibre = calibres.find((option) => option.weaponTypeId === typeId) ?? calibres[0];

  if (!calibre) {
    return (
      <p className="weapon-picker-empty">
        „{entry.name}” nie pasuje do żadnego typu broni w katalogu.{' '}
        <button type="button" className="cp-mini-button" onClick={onCancel}>
          OK
        </button>
      </p>
    );
  }

  return (
    <div className="weapon-picker-head container-picker-ammo" role="group" aria-label="Amunicja">
      <span className="weapon-picker-name">{entry.name}</span>
      <select
        value={calibre.weaponTypeId}
        aria-label="Kaliber"
        onChange={(e) => setTypeId(e.target.value)}
      >
        {calibres.map((option) => (
          <option key={option.weaponTypeId} value={option.weaponTypeId}>
            {option.calibre} — {option.typeNames.join(', ')}
          </option>
        ))}
      </select>
      <input
        type="number"
        className="compendium-ammo-packs"
        min={1}
        max={CPRED_AMMO_PACKS_MAX}
        value={packs}
        title={`Liczba paczek — paczka to ${CPRED_AMMO_PACK_SIZE[calibre.pattern]} szt. (s. 344).`}
        aria-label="Liczba paczek"
        onChange={(e) =>
          setPacks(Math.max(1, Math.min(CPRED_AMMO_PACKS_MAX, Number(e.target.value) || 1)))
        }
      />
      <button
        type="button"
        className="cp-mini-button"
        onClick={() => onAdd({ weaponTypeId: calibre.weaponTypeId, packs })}
      >
        Włóż
      </button>
      <button
        type="button"
        className="cp-mini-button"
        title="Nie wkładaj tej amunicji"
        aria-label="Anuluj amunicję"
        onClick={onCancel}
      >
        ✕
      </button>
    </div>
  );
}
