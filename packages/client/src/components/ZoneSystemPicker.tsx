import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  NET_DEFENSE_KIND_LABELS,
  NET_DEFENSE_SYSTEM_KINDS,
  netDefenseGlyph,
  type NetDefenseEntry,
  type TokenGlyph,
} from '@vtt/shared';
import { IconHazard } from './MapIcons.js';

/**
 * Wybór systemu obronnego dla narzędzia stref (29.10, zlecenie MG) — z ikoną
 * przy każdym wpisie, czego zwykły `<select>` nie umie.
 *
 * Drony biorą sylwetkę strefy na mapie (`netDefenseGlyph`); w liście dochodzi
 * wieżyczka dla stanowisk, które strzelają, i kamera — na mapie stoją figurą,
 * ale w liście ikona pomaga trafić we właściwy wiersz. Reszta to trójkąt
 * zagrożenia z przycisku narzędzia.
 */
function pickerGlyph(entry: NetDefenseEntry): TokenGlyph | null {
  const glyph = netDefenseGlyph(entry);
  if (glyph) return glyph;
  if (entry.defenseKind === 'emplacement' && entry.effects?.fires) return 'turret';
  if (/kamer/i.test(entry.name)) return 'camera';
  return null;
}

function EntryIcon({ entry }: { entry: NetDefenseEntry | undefined }) {
  const glyph = entry ? pickerGlyph(entry) : null;
  if (!glyph) {
    return (
      <span className="zone-picker-icon zone-picker-icon--hazard" aria-hidden>
        <IconHazard size={16} />
      </span>
    );
  }
  const style = { '--device-glyph': `url("/icons/devices/${glyph}.svg")` } as CSSProperties;
  return (
    <span className="zone-picker-icon" aria-hidden>
      <span className="device-glyph-mark" style={style} />
    </span>
  );
}

export function ZoneSystemPicker({
  entries,
  value,
  onChange,
}: {
  entries: readonly NetDefenseEntry[];
  value: string;
  onChange: (entryId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = entries.find((entry) => entry.id === value);
  const groups = NET_DEFENSE_SYSTEM_KINDS.map((kind) => ({
    kind,
    rows: entries.filter((entry) => entry.defenseKind === kind),
  })).filter((group) => group.rows.length > 0);
  // Fokus po otwarciu: wybrany wiersz albo pierwszy z listy.
  const focusId = current?.id ?? groups[0]?.rows[0]?.id;

  // Klik poza listą i Escape ją zamykają — jak zamyka się natywny `<select>`.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Strzałki przesuwają fokus po wierszach listy.
  function moveFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const options = Array.from(
      root.current?.querySelectorAll<HTMLButtonElement>('.zone-picker-option') ?? [],
    );
    const at = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'ArrowDown' ? at + 1 : at - 1;
    options[(next + options.length) % options.length]?.focus();
  }

  function choose(entryId: string) {
    onChange(entryId);
    setOpen(false);
  }

  return (
    <div className="zone-picker" ref={root} onKeyDown={moveFocus}>
      <button
        type="button"
        className="zone-picker-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="System obronny"
        title="Wpis „Obrona Sieci” z kompendium — z niego serwer czyta PW, Wartość bojową i efekt"
        onClick={() => setOpen(!open)}
      >
        {current && <EntryIcon entry={current} />}
        <span className="zone-picker-name">{current?.name ?? '— wybierz system —'}</span>
        <span className="zone-picker-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="zone-picker-list" role="listbox" aria-label="System obronny">
          {entries.length === 0 && (
            <p className="zone-picker-empty">Kompendium nie ma systemów obronnych.</p>
          )}
          {groups.map(({ kind, rows }) => (
            <div key={kind} role="group" aria-label={NET_DEFENSE_KIND_LABELS[kind]}>
              <div className="zone-picker-group">{NET_DEFENSE_KIND_LABELS[kind]}</div>
              {rows.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="option"
                  aria-selected={entry.id === value}
                  className={`zone-picker-option${entry.id === value ? ' zone-picker-option--active' : ''}`}
                  autoFocus={entry.id === focusId}
                  onClick={() => choose(entry.id)}
                >
                  <EntryIcon entry={entry} />
                  <span className="zone-picker-name">{entry.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
