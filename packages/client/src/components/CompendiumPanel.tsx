import { useMemo, useState } from 'react';
import type { CompendiumEntry, WeaponTypeDefinition } from '@vtt/shared';
import {
  ARMOR_LOCATION_LABELS,
  COMPENDIUM_CATEGORIES,
  COMPENDIUM_CATEGORY_LABELS,
  CPRED_RANGE_BANDS,
  ROLE_GM,
  WEAPON_QUALITY_LABELS,
  formatCost,
  rangeBandLabel,
  resolveWeapon,
} from '@vtt/shared';
import { deleteCompendiumEntry } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { countByCategory, useCompendiumStore, visibleEntries } from '../stores/compendiumStore.js';
import { addCompendiumItemToCharacter } from '../compendium-items.js';
import { CompendiumEditor } from './CompendiumEditor.js';

/**
 * Side-panel tab with the item catalogue (stage 13). Everyone browses the same
 * data — picking gear is a player activity — while adding, editing and
 * deleting the campaign's own entries stays with the GM.
 *
 * Labels follow the Polish edition: OBR. (damage), OB (armor), LA (rate of
 * fire), PT (difficulty value).
 */
export function CompendiumPanel() {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const category = useCompendiumStore((s) => s.category);
  const query = useCompendiumStore((s) => s.query);
  const selectedId = useCompendiumStore((s) => s.selectedId);
  const editing = useCompendiumStore((s) => s.editing);
  const setCategory = useCompendiumStore((s) => s.setCategory);
  const setQuery = useCompendiumStore((s) => s.setQuery);
  const select = useCompendiumStore((s) => s.select);
  const edit = useCompendiumStore((s) => s.edit);
  // Raw slices only: a selector that derives a new array or object on every
  // render loops React (learned in stage 10, same trap).
  const entriesById = useCompendiumStore((s) => s.entries);
  const order = useCompendiumStore((s) => s.order);
  const weaponTypeById = useCompendiumStore((s) => s.weaponTypeById);
  const entries = useMemo(
    () => visibleEntries(entriesById, order, query, category),
    [entriesById, order, query, category],
  );
  const counts = useMemo(() => countByCategory(entriesById, order), [entriesById, order]);

  const selected = selectedId ? (entriesById[selectedId] ?? null) : null;

  return (
    <section className="compendium-panel">
      <div className="compendium-head">
        <input
          className="compendium-search"
          type="search"
          value={query}
          placeholder="Szukaj przedmiotu…"
          onChange={(event) => setQuery(event.target.value)}
        />
        {isGm ? (
          <button type="button" className="small-button" onClick={() => edit('new')}>
            + Własny wpis
          </button>
        ) : null}
      </div>

      <nav className="compendium-categories">
        {COMPENDIUM_CATEGORIES.map((id) => (
          <button
            key={id}
            type="button"
            className={`compendium-category ${category === id ? 'compendium-category--active' : ''}`}
            onClick={() => setCategory(id)}
          >
            {COMPENDIUM_CATEGORY_LABELS[id]} <span className="compendium-count">{counts[id]}</span>
          </button>
        ))}
      </nav>

      {selected ? (
        <EntryCard entry={selected} isGm={isGm} onBack={() => select(null)} />
      ) : (
        <ul className="compendium-list">
          {entries.length === 0 ? (
            <li className="placeholder-text">Brak wpisów w tej kategorii.</li>
          ) : null}
          {entries.map((entry) => (
            <li key={entry.id}>
              <button type="button" className="compendium-row" onClick={() => select(entry.id)}>
                <span className="compendium-row-name">
                  {entry.name}
                  {entry.custom ? <span className="compendium-tag">własny</span> : null}
                  {entry.incomplete ? (
                    <span className="compendium-tag compendium-tag--warn" title="Dane niepełne">
                      ?
                    </span>
                  ) : null}
                </span>
                <span className="compendium-row-meta">
                  {shortStats(entry, weaponTypeById)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing ? <CompendiumEditor /> : null}
    </section>
  );
}

/**
 * One-line summary for the list. Weapon damage usually lives on the base type,
 * not on the entry, so it has to be resolved — otherwise every imported weapon
 * would show a dash where its dice belong.
 */
function shortStats(
  entry: CompendiumEntry,
  weaponTypeById: Record<string, WeaponTypeDefinition>,
): string {
  switch (entry.category) {
    case 'weapon': {
      const damage =
        entry.damage ??
        (entry.weaponTypeId ? weaponTypeById[entry.weaponTypeId]?.damage : undefined) ??
        '—';
      return `${damage} · ${formatCost(entry)}`;
    }
    case 'armor':
      return `OB ${entry.sp} · ${formatCost(entry)}`;
    default:
      return formatCost(entry);
  }
}

function EntryCard({
  entry,
  isGm,
  onBack,
}: {
  entry: CompendiumEntry;
  isGm: boolean;
  onBack: () => void;
}) {
  const weaponTypeById = useCompendiumStore((s) => s.weaponTypeById);
  const characters = useCharacterStore((s) => s.characters);
  const order = useCharacterStore((s) => s.order);
  const edit = useCompendiumStore((s) => s.edit);
  const [note, setNote] = useState<string | null>(null);
  const [targetId, setTargetId] = useState('');

  const resolved = useMemo(
    () =>
      entry.category === 'weapon'
        ? resolveWeapon(entry, { weaponTypeById: new Map(Object.entries(weaponTypeById)) })
        : null,
    [entry, weaponTypeById],
  );

  const targets = order.map((id) => characters[id]).filter((c) => c !== undefined);
  const target = targetId || targets[0]?.id || '';

  async function addToSheet() {
    if (!target) return;
    const result = await addCompendiumItemToCharacter(target, entry, resolved);
    setNote(result);
  }

  return (
    <div className="compendium-card">
      <div className="compendium-card-head">
        <button type="button" className="small-button" onClick={onBack}>
          ← Lista
        </button>
        {isGm && entry.custom ? (
          <span className="compendium-card-actions">
            <button type="button" className="small-button" onClick={() => edit(entry.id)}>
              Edytuj
            </button>
            <button
              type="button"
              className="small-button small-button--danger"
              onClick={() => void deleteCompendiumEntry(entry.id)}
            >
              Usuń
            </button>
          </span>
        ) : null}
      </div>

      <h3 className="compendium-card-name">{entry.name}</h3>
      {entry.nameOriginal && entry.nameOriginal !== entry.name ? (
        <p className="compendium-card-original">{entry.nameOriginal}</p>
      ) : null}

      <dl className="compendium-stats">
        {entry.category === 'weapon' && resolved ? (
          <>
            <Stat label="OBR." value={resolved.damage} />
            <Stat label="LA" value={String(resolved.rof)} />
            <Stat label="Magazynek" value={resolved.magazine === null ? '—' : String(resolved.magazine)} />
            <Stat label="Ręce" value={String(resolved.hands)} />
            <Stat label="Ukrywalna" value={resolved.concealable ? 'tak' : 'nie'} />
            <Stat label="Jakość" value={WEAPON_QUALITY_LABELS[entry.quality]} />
            {resolved.typeName ? <Stat label="Typ" value={resolved.typeName} /> : null}
            {resolved.attachmentSlots > 0 ? (
              <Stat label="Gniazda" value={String(resolved.attachmentSlots)} />
            ) : null}
          </>
        ) : null}
        {entry.category === 'armor' ? (
          <>
            <Stat label="OB" value={String(entry.sp)} />
            <Stat
              label="Lokacje"
              value={entry.locations.map((l) => ARMOR_LOCATION_LABELS[l]).join(', ')}
            />
            {entry.penalty ? <Stat label="Kara" value={String(entry.penalty)} /> : null}
          </>
        ) : null}
        {entry.category === 'cyberware' ? (
          <>
            {entry.humanityLoss ? <Stat label="Człowieczeństwo" value={`−${entry.humanityLoss}`} /> : null}
            {entry.slots !== undefined ? <Stat label="Gniazda" value={String(entry.slots)} /> : null}
            {entry.foundation ? <Stat label="Podstawa" value="tak" /> : null}
          </>
        ) : null}
        <Stat label="Cena" value={formatCost(entry)} />
      </dl>

      {entry.category === 'weapon' && resolved?.rangeDv ? (
        <table className="compendium-range">
          <caption>PT w walce dystansowej</caption>
          <thead>
            <tr>
              {CPRED_RANGE_BANDS.map((band) => (
                <th key={band.id}>{rangeBandLabel(band)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {CPRED_RANGE_BANDS.map((band, index) => (
                <td key={band.id}>{resolved.rangeDv?.[index] ?? 'Nd.'}</td>
              ))}
            </tr>
          </tbody>
        </table>
      ) : null}

      {entry.description ? <p className="compendium-card-text">{entry.description}</p> : null}
      {entry.descriptionOriginal ? (
        <details className="compendium-original">
          <summary>Oryginał (EN)</summary>
          <p>{entry.descriptionOriginal}</p>
        </details>
      ) : null}
      {entry.category === 'weapon' && entry.features?.length ? (
        <ul className="compendium-features">
          {entry.features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      ) : null}

      {entry.incomplete ? (
        <p className="compendium-warning">
          Dane niepełne — w darmowych materiałach nie ma wszystkich wartości. Uzupełnij je własnym
          wpisem albo z podręcznika.
        </p>
      ) : null}
      {entry.source ? <p className="compendium-source">Źródło: {entry.source}</p> : null}

      {targets.length > 0 ? (
        <div className="compendium-assign">
          <select value={target} onChange={(event) => setTargetId(event.target.value)}>
            {targets.map((character) => (
              <option key={character.id} value={character.id}>
                {character.name}
              </option>
            ))}
          </select>
          <button type="button" className="small-button" onClick={() => void addToSheet()}>
            Dodaj postaci
          </button>
        </div>
      ) : null}
      {note ? <p className="compendium-note">{note}</p> : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="compendium-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
