import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { RandomTableUpsertPayload, RandomTableView, RandomTableVisibility } from '@vtt/shared';
import {
  RANDOM_TABLE_DESCRIPTION_MAX_LENGTH,
  RANDOM_TABLE_NAME_MAX_LENGTH,
  RANDOM_TABLE_ROWS_MAX,
  RANDOM_TABLE_ROW_TEXT_MAX_LENGTH,
  RANDOM_TABLE_VISIBILITIES,
  RANDOM_TABLE_VISIBILITY_LABELS,
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
import { useChatStore } from '../stores/chatStore.js';
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

/** Ile wierszy wolno wygenerować guzikiem „Rozpisz zakres" — dalej to już import. */
const FILL_ROWS_MAX = 100;

type DraftRow = { min: string; max: string; text: string; subTableId: string };

function toDraftRows(table: RandomTableView | null): DraftRow[] {
  if (!table || table.rows.length === 0) return [{ min: '1', max: '1', text: '', subTableId: '' }];
  return table.rows.map((row) => ({
    min: String(row.min),
    max: String(row.max),
    text: row.text,
    subTableId: row.subTableId ?? '',
  }));
}

function parsedRows(rows: DraftRow[]): { min: number; max: number }[] {
  return rows
    .map((row) => ({ min: Number(row.min), max: Number(row.max) }))
    .filter((row) => Number.isFinite(row.min) && Number.isFinite(row.max));
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

  const parsedFormula = useMemo(() => parseRollNotation(formula), [formula]);
  const span = useMemo(
    () => (parsedFormula.ok ? randomTableSpan(parsedFormula.formula) : null),
    [parsedFormula],
  );
  const issues = useMemo(
    () =>
      parsedFormula.ok ? randomTableCoverageIssues(parsedFormula.formula, parsedRows(rows)) : [],
    [parsedFormula, rows],
  );

  function patchRow(index: number, patch: Partial<DraftRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => {
      const last = current[current.length - 1];
      const next = last ? Number(last.max) + 1 : 1;
      const value = Number.isFinite(next) ? String(next) : '1';
      return [...current, { min: value, max: value, text: '', subTableId: '' }];
    });
  }

  /** Rozpisuje formułę na wiersz po liczbie — pierwszy krok przy nowej tabeli. */
  function fillRange() {
    if (!span) return;
    const count = span.max - span.min + 1;
    if (count < 1 || count > FILL_ROWS_MAX) return;
    setRows(
      Array.from({ length: count }, (_, index) => ({
        min: String(span.min + index),
        max: String(span.min + index),
        text: '',
        subTableId: '',
      })),
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const payload: RandomTableUpsertPayload = {
      ...(table ? { id: table.id } : {}),
      name,
      formula,
      description,
      visibility,
      rows: rows.map((row) => ({
        min: Number(row.min),
        max: Number(row.max),
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

  const fillCount = span ? span.max - span.min + 1 : 0;

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

      <div className="bot-row-inline">
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
          <span className="auth-label">Domyślna widoczność</span>
          <select
            value={visibility}
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
          disabled={!span || fillCount < 1 || fillCount > FILL_ROWS_MAX}
          title={
            span && fillCount >= 1 && fillCount <= FILL_ROWS_MAX
              ? `Rozpisze ${fillCount} pustych wierszy, po jednym na liczbę`
              : `Rozpisanie działa do ${FILL_ROWS_MAX} wierszy`
          }
        >
          Rozpisz zakres
        </button>
      </div>

      <ol className="table-rows">
        {rows.map((row, index) => (
          <li key={index} className="table-row">
            <input
              className="table-row-num"
              type="number"
              value={row.min}
              aria-label="Od"
              onChange={(event) => patchRow(index, { min: event.target.value })}
            />
            <span className="table-row-dash">–</span>
            <input
              className="table-row-num"
              type="number"
              value={row.max}
              aria-label="Do"
              onChange={(event) => patchRow(index, { max: event.target.value })}
            />
            <textarea
              className="table-row-text"
              rows={1}
              maxLength={RANDOM_TABLE_ROW_TEXT_MAX_LENGTH}
              value={row.text}
              placeholder="Co się dzieje"
              onChange={(event) => patchRow(index, { text: event.target.value })}
            />
            <select
              className="table-row-sub"
              value={row.subTableId}
              aria-label="Podrzut"
              title="Podrzut: po trafieniu w ten wiersz losuje się jeszcze z tej tabeli"
              onChange={(event) => patchRow(index, { subTableId: event.target.value })}
            >
              <option value="">bez podrzutu</option>
              {others.map((other) => (
                <option key={other.id} value={other.id}>
                  ↳ {other.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="small-button character-delete"
              title={`Usuń wiersz ${randomTableRangeLabel({ min: Number(row.min), max: Number(row.max) })}`}
              aria-label={`Usuń wiersz ${randomTableRangeLabel({ min: Number(row.min), max: Number(row.max) })}`}
              onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
            >
              ✕
            </button>
          </li>
        ))}
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
            <li key={index}>{issue.message}</li>
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
  const other: RandomTableVisibility = table.visibility === 'gm' ? 'public' : 'gm';

  async function roll(visibility?: RandomTableVisibility) {
    const ack = await rollRandomTableNow({
      id: table.id,
      ...(visibility ? { visibility } : {}),
    });
    if (!ack.ok) useChatStore.getState().addNote(randomTableErrorText(ack.error));
  }

  async function remove() {
    const ack = await deleteRandomTable(table.id);
    if (!ack.ok) useChatStore.getState().addNote(randomTableErrorText(ack.error));
  }

  const nested = table.rows.filter((row) => row.subTableId).length;

  return (
    <li className="knowledge-entry table-entry">
      <button type="button" className="knowledge-entry-head" onClick={onEdit}>
        <span className="knowledge-type">{table.formula}</span>
        <span className="knowledge-entry-title">{table.name}</span>
        <span className="knowledge-flag">
          {table.visibility === 'gm' ? '🔒 tylko MG' : '🔊 cały stół'}
        </span>
      </button>
      {table.description && <p className="knowledge-entry-body">{table.description}</p>}
      <div className="knowledge-entry-foot">
        <span className="knowledge-tag">
          {plural(table.rows.length, 'wiersz', 'wiersze', 'wierszy')}
        </span>
        {nested > 0 && (
          <span className="knowledge-tag" title="Wiersze, które losują jeszcze inną tabelę">
            ↳ {plural(nested, 'podrzut', 'podrzuty', 'podrzutów')}
          </span>
        )}
        <button
          type="button"
          className="small-button table-roll"
          onClick={() => void roll()}
          title={`Losuje na czat — ${RANDOM_TABLE_VISIBILITY_LABELS[table.visibility].toLowerCase()}. Kubka nie rusza.`}
        >
          🎲 Losuj
        </button>
        <button
          type="button"
          className="small-button"
          onClick={() => void roll(other)}
          title={`Ten sam rzut, ale ${RANDOM_TABLE_VISIBILITY_LABELS[other].toLowerCase()}`}
        >
          {other === 'gm' ? '🔒' : '🔊'}
        </button>
        {confirming ? (
          <>
            <span className="knowledge-flag">Usunąć?</span>
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
          <button
            type="button"
            className="small-button character-delete"
            title="Usuń tabelę (wiersze, które ją podrzucały, stracą podrzut)"
            aria-label="Usuń tabelę"
            onClick={() => setConfirming(true)}
          >
            ✕
          </button>
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
