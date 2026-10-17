import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { RandomTableUpsertPayload, RandomTableView, RandomTableVisibility } from '@vtt/shared';
import {
  displayDiceNotation,
  RANDOM_TABLE_DESCRIPTION_MAX_LENGTH,
  RANDOM_TABLE_NAME_MAX_LENGTH,
  RANDOM_TABLE_ROWS_MAX,
  RANDOM_TABLE_ROW_TEXT_MAX_LENGTH,
  RANDOM_TABLE_VISIBILITIES,
  RANDOM_TABLE_VISIBILITY_LABELS,
  parseRandomTableRange,
  parseRollNotation,
  randomTableCoverageIssues,
  randomTableRangeLabel,
  randomTableSpan,
} from '@vtt/shared';
import {
  deleteRandomTable,
  fetchRandomTables,
  randomTableErrorText,
  rollRandomTableNow,
  saveRandomTable,
} from '../socket.js';
import { noteAck } from '../notices.js';
import { useTableStore } from '../stores/tableStore.js';
import { plural } from '../plural.js';
import { EmptyState } from './EmptyState.js';

/**
 * Tabele losowe (etap 34) — zakładka MG.
 *
 * Panel stoi na jednym rozstrzygnięciu: **„Losuj" omija kubek całkowicie.**
 * Klik wysyła `table:roll`, serwer rzuca i wynik pojawia się na czacie — nic tu
 * nie dotyka `rollStore`, więc rzut wzięty do ręki w oknie postaci i czekające
 * u gracza wezwanie do Testu (32) przeżywają dowolną liczbę losowań.
 *
 * Drugie: pokrycie zakresów liczy **ta sama funkcja**, którą serwer odmawia
 * zapisu (`randomTableCoverageIssues`), więc formularz nie zgaduje, co się
 * uda — mówi dokładnie to zdanie, które padnie przy zapisie.
 */

/** Ile wierszy wolno wygenerować guzikiem „Wiersz na każdą liczbę" — dalej to już import. */
const FILL_ROWS_MAX = 100;

/**
 * Zakres jest jednym polem tekstowym („7", „4–6"), jak w drukowanej tabeli —
 * dwa pola liczb ze strzałkami zjadały wiersz i odsuwały od siebie zakres
 * i treść. `subOpen` trzyma rozwiniętą listę „losuj dalej" przy wierszu, który
 * jeszcze jej nie ma; wiersz z wybraną tabelą pokazuje ją zawsze.
 */
type DraftRow = { range: string; text: string; subTableId: string; subOpen: boolean };

function emptyRow(range: string): DraftRow {
  return { range, text: '', subTableId: '', subOpen: false };
}

function toDraftRows(table: RandomTableView | null): DraftRow[] {
  if (!table || table.rows.length === 0) return [emptyRow('1')];
  return table.rows.map((row) => ({
    range: randomTableRangeLabel(row),
    text: row.text,
    subTableId: row.subTableId ?? '',
    subOpen: false,
  }));
}

/** Wiersze z czytelnym zakresem; `null` w miejscu tych, których nie da się przeczytać. */
function parsedRows(rows: DraftRow[]): ({ min: number; max: number } | null)[] {
  return rows.map((row) => parseRandomTableRange(row.range));
}

function rangeIssue(index: number, raw: string): string {
  return raw.trim().length === 0
    ? `Wiersz ${index + 1} nie ma zakresu — wpisz „7” albo „4–6”.`
    : `Wiersz ${index + 1}: nie rozumiem zakresu „${raw.trim()}” — wpisz „7” albo „4–6”.`;
}

/**
 * Czy przycisk myszy (palec, rysik) jest teraz wciśnięty — liczone od
 * pierwszego użycia, nasłuch na `window` w fazie przechwytywania.
 */
let pointerHeld = false;
let pointerWatched = false;

function watchPointer(): void {
  if (pointerWatched || typeof window === 'undefined') return;
  pointerWatched = true;
  window.addEventListener('pointerdown', () => (pointerHeld = true), true);
  const release = (): void => {
    pointerHeld = false;
  };
  window.addEventListener('pointerup', release, true);
  window.addEventListener('pointercancel', release, true);
}

/**
 * #72: pole treści zwija się dopiero po puszczeniu przycisku. Fokus znika już
 * przy mousedown, a zwinięcie wtedy przesuwało wszystko pod polem o ~5rem —
 * mouseup trafiał w inny element i klik w „Dodaj tabelę" przepadał bez słowa.
 */
function collapseAfterPointer(collapse: () => void): void {
  if (!pointerHeld) {
    collapse();
    return;
  }
  const done = (): void => {
    window.removeEventListener('pointerup', done);
    window.removeEventListener('pointercancel', done);
    // Po `click`, który przychodzi zaraz za `pointerup`.
    setTimeout(collapse, 0);
  };
  window.addEventListener('pointerup', done);
  window.addEventListener('pointercancel', done);
}

function TableForm({
  table,
  others,
  onClose,
}: {
  table: RandomTableView | null;
  /** Tabele, na które wolno wskazać podrzutem — bez tej edytowanej. */
  others: RandomTableView[];
  onClose: () => void;
}) {
  const [name, setName] = useState(table?.name ?? '');
  const [formula, setFormula] = useState(table?.formula ?? '1d10');
  const [description, setDescription] = useState(table?.description ?? '');
  const [visibility, setVisibility] = useState<RandomTableVisibility>(table?.visibility ?? 'gm');
  const [rows, setRows] = useState<DraftRow[]>(() => toDraftRows(table));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openText, setOpenText] = useState<number | null>(null);
  useEffect(watchPointer, []);

  const parsedFormula = useMemo(() => parseRollNotation(formula), [formula]);
  const span = useMemo(
    () => (parsedFormula.ok ? randomTableSpan(parsedFormula.formula) : null),
    [parsedFormula],
  );
  const ranges = useMemo(() => parsedRows(rows), [rows]);
  const issues = useMemo(() => {
    const unreadable = ranges.flatMap((range, index) =>
      range ? [] : [rangeIssue(index, rows[index]?.range ?? '')],
    );
    if (unreadable.length > 0) return unreadable;
    if (!parsedFormula.ok) return [];
    return randomTableCoverageIssues(
      parsedFormula.formula,
      ranges.filter((range): range is { min: number; max: number } => range !== null),
    ).map((issue) => issue.message);
  }, [parsedFormula, ranges, rows]);

  function patchRow(index: number, patch: Partial<DraftRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => {
      const last = current[current.length - 1];
      const lastRange = last ? parseRandomTableRange(last.range) : null;
      const next = lastRange ? lastRange.max + 1 : (span?.min ?? 1);
      return [...current, emptyRow(String(next))];
    });
  }

  /*
   * „Wiersz na każdą liczbę" zastępuje wszystkie wiersze, więc działa tylko na
   * pustych: dawniej jedno kliknięcie w gotowej tabeli kasowało jej treść.
   */
  const rowsEmpty = rows.every((row) => row.text.trim() === '' && row.subTableId === '');
  const fillCount = span ? span.max - span.min + 1 : 0;
  const canFill = rowsEmpty && !!span && fillCount >= 1 && fillCount <= FILL_ROWS_MAX;

  /** Rozpisuje formułę na wiersz po liczbie — pierwszy krok przy nowej tabeli. */
  function fillRange() {
    if (!canFill || !span) return;
    setRows(Array.from({ length: fillCount }, (_, index) => emptyRow(String(span.min + index))));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const unreadable = ranges.findIndex((range) => range === null);
    if (unreadable >= 0) {
      setError(rangeIssue(unreadable, rows[unreadable]?.range ?? ''));
      return;
    }
    setBusy(true);
    setError(null);
    const payload: RandomTableUpsertPayload = {
      ...(table ? { id: table.id } : {}),
      name,
      formula,
      description,
      visibility,
      rows: rows.map((row, index) => ({
        min: ranges[index]!.min,
        max: ranges[index]!.max,
        text: row.text,
        subTableId: row.subTableId.length > 0 ? row.subTableId : null,
      })),
    };
    const ack = await saveRandomTable(payload);
    setBusy(false);
    if (!ack.ok) {
      setError(randomTableErrorText(ack.error));
      return;
    }
    onClose();
  }

  return (
    <form className="bot-form table-form" onSubmit={(event) => void submit(event)}>
      <label className="bot-field">
        <span className="auth-label">Nazwa</span>
        <input
          type="text"
          autoFocus
          maxLength={RANDOM_TABLE_NAME_MAX_LENGTH}
          value={name}
          placeholder="np. Spotkania dzienne"
          onChange={(event) => setName(event.target.value)}
        />
        <span className="bot-hint">Nazwa jest adresem: tak samo wpiszesz ją w „/tab".</span>
      </label>

      <div className="bot-row-inline table-form-top">
        <label className="bot-field bot-field--inline">
          <span className="auth-label">Formuła</span>
          <input
            type="text"
            value={formula}
            placeholder="1d10"
            onChange={(event) => setFormula(event.target.value)}
          />
        </label>
        <label className="bot-field bot-field--inline">
          <span className="auth-label">Widoczność</span>
          <select
            value={visibility}
            title="Który przycisk losowania jest domyślny i jak losuje „/tab” na czacie"
            onChange={(event) => setVisibility(event.target.value as RandomTableVisibility)}
          >
            {RANDOM_TABLE_VISIBILITIES.map((entry) => (
              <option key={entry} value={entry}>
                {RANDOM_TABLE_VISIBILITY_LABELS[entry]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="bot-hint">
        {span
          ? `Ta formuła daje ${span.min}–${span.max} — zakresy wierszy muszą pokryć całość, bez dziur i bez zachodzenia.`
          : 'Nie rozumiem formuły — spróbuj „1d10" albo „1d100".'}
      </p>

      <label className="bot-field">
        <span className="auth-label">Opis (dla MG)</span>
        <input
          type="text"
          maxLength={RANDOM_TABLE_DESCRIPTION_MAX_LENGTH}
          value={description}
          placeholder="Kiedy się to losuje — np. „przejście przez Strefę Walki za dnia”"
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      <div className="table-rows-head">
        <span className="auth-label">Wiersze ({rows.length})</span>
        <button
          type="button"
          className="small-button"
          onClick={fillRange}
          disabled={!canFill}
          title={
            !rowsEmpty
              ? 'Działa tylko na pustej tabeli — zastąpiłoby wpisane wiersze'
              : canFill
                ? `Założy ${fillCount} pustych wierszy, po jednym na każdą liczbę z formuły`
                : `Działa do ${FILL_ROWS_MAX} wierszy`
          }
        >
          Wiersz na każdą liczbę
        </button>
      </div>

      <ol className="table-rows">
        {rows.map((row, index) => {
          const showSub = row.subOpen || row.subTableId !== '';
          const label = row.range.trim() || `${index + 1}.`;
          return (
            <li key={index} className="table-row">
              <input
                className={
                  ranges[index] ? 'table-row-range' : 'table-row-range table-row-range--bad'
                }
                type="text"
                inputMode="numeric"
                value={row.range}
                placeholder="4–6"
                aria-label="Zakres"
                title="Liczba („7”) albo zakres („4–6”), na który wypada ten wiersz"
                onChange={(event) => patchRow(index, { range: event.target.value })}
              />
              <textarea
                className={
                  openText === index ? 'table-row-text table-row-text--open' : 'table-row-text'
                }
                rows={1}
                maxLength={RANDOM_TABLE_ROW_TEXT_MAX_LENGTH}
                value={row.text}
                placeholder="Co się dzieje"
                aria-label="Treść wiersza"
                onFocus={() => setOpenText(index)}
                onBlur={() => collapseAfterPointer(() => setOpenText(null))}
                onChange={(event) => patchRow(index, { text: event.target.value })}
              />
              <div className="table-row-tools">
                <button
                  type="button"
                  className={
                    showSub
                      ? 'small-button table-row-link is-active'
                      : 'small-button table-row-link'
                  }
                  aria-pressed={showSub}
                  aria-label={`Losuj dalej z innej tabeli (wiersz ${label})`}
                  title={
                    others.length === 0
                      ? 'Losuj dalej z innej tabeli — najpierw załóż drugą tabelę'
                      : 'Losuj dalej z innej tabeli, gdy wypadnie ten wiersz (np. „Łup” → „Broń przy ciele”)'
                  }
                  disabled={others.length === 0 && !showSub}
                  onClick={() =>
                    patchRow(
                      index,
                      showSub ? { subOpen: false, subTableId: '' } : { subOpen: true },
                    )
                  }
                >
                  ↳
                </button>
                <button
                  type="button"
                  className="small-button character-delete"
                  title={`Usuń wiersz ${label}`}
                  aria-label={`Usuń wiersz ${label}`}
                  onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                >
                  ✕
                </button>
              </div>
              {showSub && (
                <label className="table-row-sub">
                  <span>…i losuj dalej z:</span>
                  <select
                    value={row.subTableId}
                    aria-label="Losuj dalej z"
                    onChange={(event) => patchRow(index, { subTableId: event.target.value })}
                  >
                    <option value="">— wybierz tabelę —</option>
                    {others.map((other) => (
                      <option key={other.id} value={other.id}>
                        {other.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="small-button"
        onClick={addRow}
        disabled={rows.length >= RANDOM_TABLE_ROWS_MAX}
      >
        + Wiersz
      </button>

      {issues.length > 0 && (
        <ul className="table-issues">
          {issues.map((issue, index) => (
            <li key={index}>{issue}</li>
          ))}
        </ul>
      )}

      {error && <p className="auth-error">{error}</p>}
      <div className="bot-row-inline">
        <button type="submit" className="small-button" disabled={busy}>
          {busy ? 'Zapisuję…' : table ? 'Zapisz zmiany' : 'Dodaj tabelę'}
        </button>
        <button type="button" className="small-button" onClick={onClose}>
          Anuluj
        </button>
      </div>
    </form>
  );
}

function TableRow({ table, onEdit }: { table: RandomTableView; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function roll(visibility: RandomTableVisibility) {
    const ack = await rollRandomTableNow({ id: table.id, visibility });
    noteAck('table', ack, randomTableErrorText);
  }

  async function remove() {
    const ack = await deleteRandomTable(table.id);
    noteAck('table', ack, randomTableErrorText);
  }

  const linked = [
    ...new Set(table.rows.flatMap((row) => (row.subTableName ? [row.subTableName] : []))),
  ];

  /*
   * Dwa przyciski z napisem zamiast „Losuj" i samej ikonki odwrotnej
   * widoczności — 🔊 czytało się jako dźwięk. Domyślny (ten, którym losuje
   * „/tab") jest pogrubiony.
   */
  const rollButton = (visibility: RandomTableVisibility) => {
    const isDefault = table.visibility === visibility;
    return (
      <button
        type="button"
        className={isDefault ? 'small-button table-roll' : 'small-button'}
        onClick={() => void roll(visibility)}
        title={`${
          visibility === 'gm'
            ? 'Wynik na czacie zobaczysz tylko ty — stołowi pokażesz go przyciskiem na karcie'
            : 'Wynik na czacie zobaczy cały stół'
        }. Kubka nie rusza.${isDefault ? ' Domyślne — tak losuje też „/tab”.' : ''}`}
      >
        {visibility === 'gm' ? '🔒 Losuj dla MG' : '📢 Losuj jawnie'}
      </button>
    );
  };

  return (
    <li className="knowledge-entry table-entry">
      <button
        type="button"
        className="knowledge-entry-head"
        aria-expanded={expanded}
        title={expanded ? 'Zwiń wiersze' : 'Pokaż wiersze'}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="table-entry-caret" aria-hidden>
          {expanded ? '▾' : '▸'}
        </span>
        <span className="knowledge-type">{displayDiceNotation(table.formula)}</span>
        <span className="knowledge-entry-title">{table.name}</span>
      </button>
      {table.description && <p className="knowledge-entry-body">{table.description}</p>}
      {expanded && (
        <ol className="table-preview">
          {table.rows.map((row) => (
            <li key={row.id}>
              <span className="table-preview-range">{randomTableRangeLabel(row)}</span>
              <span className="table-preview-text">
                {row.text}
                {row.subTableName && (
                  <span className="table-preview-link"> ↳ {row.subTableName}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="knowledge-entry-foot">
        <span className="knowledge-tag">
          {plural(table.rows.length, 'wiersz', 'wiersze', 'wierszy')}
        </span>
        {linked.length > 0 && (
          <span className="knowledge-tag" title="Te tabele losują się dalej po trafieniu w wiersz">
            ↳ {linked.join(', ')}
          </span>
        )}
      </div>
      <div className="knowledge-entry-foot">
        {rollButton('gm')}
        {rollButton('public')}
        {confirming ? (
          <>
            <span className="knowledge-flag table-entry-end">Usunąć?</span>
            <button
              type="button"
              className="small-button character-delete"
              onClick={() => void remove()}
            >
              Tak, usuń
            </button>
            <button type="button" className="small-button" onClick={() => setConfirming(false)}>
              Anuluj
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="small-button table-entry-end"
              title="Edytuj tabelę"
              aria-label="Edytuj tabelę"
              onClick={onEdit}
            >
              ✎
            </button>
            <button
              type="button"
              className="small-button character-delete"
              title="Usuń tabelę (wiersze innych tabel, które ją losowały, stracą to powiązanie)"
              aria-label="Usuń tabelę"
              onClick={() => setConfirming(true)}
            >
              ✕
            </button>
          </>
        )}
      </div>
    </li>
  );
}

export function TablePanel() {
  const tables = useTableStore((s) => s.tables);
  const order = useTableStore((s) => s.order);
  const editing = useTableStore((s) => s.editing);
  const loaded = useTableStore((s) => s.loaded);
  const setEditing = useTableStore((s) => s.setEditing);
  const [query, setQuery] = useState('');

  useEffect(() => {
    void fetchRandomTables();
  }, []);

  const rows = useMemo(
    () => order.map((id) => tables[id]).filter((table): table is RandomTableView => !!table),
    [tables, order],
  );
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (table) =>
        table.name.toLowerCase().includes(needle) ||
        table.description.toLowerCase().includes(needle) ||
        table.rows.some((row) => row.text.toLowerCase().includes(needle)),
    );
  }, [rows, query]);

  if (editing) {
    const table = editing === 'new' ? null : (tables[editing] ?? null);
    return (
      <section className="knowledge-panel">
        <TableForm
          table={table}
          others={rows.filter((entry) => entry.id !== table?.id)}
          onClose={() => setEditing(null)}
        />
      </section>
    );
  }

  return (
    <section className="knowledge-panel">
      <div className="compendium-head">
        <input
          className="compendium-search"
          type="search"
          value={query}
          placeholder="Szukaj w tabelach…"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="button" className="small-button" onClick={() => setEditing('new')}>
          + Nowa tabela
        </button>
      </div>

      {rows.length > 0 && (
        <p className="bot-hint table-panel-intro">
          Tabele losowe: rzut formułą wybiera wiersz, a wynik ląduje na czacie — kubka nie rusza. Na
          czacie to samo robi <code>/tab nazwa</code>.
        </p>
      )}

      <ul className="knowledge-list">
        {visible.length === 0 ? (
          <li>
            {!loaded ? (
              <EmptyState text="Wczytuję…" />
            ) : rows.length === 0 ? (
              <EmptyState text="Nie ma tu żadnej tabeli. Załóż pierwszą — spotkania na ulicy, łup z kieszeni, plotka w barze — a „Losuj” dorzuci wynik na czat." />
            ) : (
              <EmptyState
                text="Nic nie pasuje do wyszukiwania."
                action={{ label: 'Wyczyść szukanie', onClick: () => setQuery('') }}
              />
            )}
          </li>
        ) : (
          visible.map((table) => (
            <TableRow key={table.id} table={table} onEdit={() => setEditing(table.id)} />
          ))
        )}
      </ul>
    </section>
  );
}
