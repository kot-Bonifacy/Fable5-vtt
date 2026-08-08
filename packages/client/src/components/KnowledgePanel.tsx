import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  KnowledgeEntryType,
  KnowledgeEntryView,
  KnowledgeIndexStatus,
  KnowledgeVisibility,
} from '@vtt/shared';
import {
  KNOWLEDGE_BODY_MAX_LENGTH,
  KNOWLEDGE_TAGS_MAX,
  KNOWLEDGE_TITLE_MAX_LENGTH,
  KNOWLEDGE_TYPES,
  KNOWLEDGE_TYPE_LABELS,
  KNOWLEDGE_VISIBILITIES,
  KNOWLEDGE_VISIBILITY_LABELS,
  normalizeKnowledgeTags,
} from '@vtt/shared';
import {
  deleteKnowledgeEntry,
  fetchKnowledge,
  reindexKnowledge,
  saveKnowledgeEntry,
} from '../socket.js';
import { useKnowledgeStore } from '../stores/knowledgeStore.js';

/**
 * Baza wiedzy kampanii (etap 19b) — zakładka MG.
 *
 * Panel jest zbudowany wokół jednej myśli, przeciwnej niż w „Zasadach": tam MG
 * pyta i sprawdza cytaty, tutaj **pisze świat**. Dlatego pierwszoplanowy jest
 * formularz i lista, a nie wyszukiwarka — a jedyna informacja z RAG-a, która się
 * liczy, to „czy bot już o tym wie" (chip „nieaktualny" przy wpisie).
 */

/** Tagi wpisuje się jednym polem — przecinki albo spacje, jak w każdym edytorze tagów. */
function parseTagInput(raw: string): string[] {
  return normalizeKnowledgeTags(raw.split(/[,\s]+/));
}

function IndexLine({ status }: { status: KnowledgeIndexStatus }) {
  const [busy, setBusy] = useState(false);

  async function reindex() {
    setBusy(true);
    const ack = await reindexKnowledge();
    if (ack.ok && ack.data) useKnowledgeStore.getState().setIndex(ack.data);
    setBusy(false);
  }

  return (
    <div className="ai-status">
      <div className="ai-status-main">
        <span className={`badge ${status.ready ? 'badge--ok' : 'badge--off'}`}>
          {status.ready ? 'boty czytają bazę' : 'indeks niedostępny'}
        </span>
        {status.chunks > 0 && (
          <span className="ai-status-text">
            {status.documents} wpisów · {status.chunks} fragmentów
          </span>
        )}
        {status.pending > 0 && (
          <span className="ai-status-text">{status.pending} czeka na indeks</span>
        )}
        <button
          type="button"
          className="small-button"
          onClick={() => void reindex()}
          disabled={busy}
          title="Wysyła do gatewaya wszystko, co się rozjechało, i zapomina skasowane wpisy"
        >
          {busy ? 'Indeksuję…' : 'Zaindeksuj wszystko'}
        </button>
      </div>
      {status.reason && <p className="ai-status-error">{status.reason}</p>}
    </div>
  );
}

function EntryRow({ entry, onEdit }: { entry: KnowledgeEntryView; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="knowledge-entry">
      <button type="button" className="knowledge-entry-head" onClick={onEdit}>
        <span className={`knowledge-type knowledge-type--${entry.type}`}>
          {KNOWLEDGE_TYPE_LABELS[entry.type]}
        </span>
        <span className="knowledge-entry-title">{entry.title}</span>
        {entry.visibility === 'gm' && (
          <span className="knowledge-flag" title="Ten wpis nigdy nie trafia do promptu bota">
            🔒 tylko MG
          </span>
        )}
        {entry.stale && (
          <span
            className="knowledge-flag knowledge-flag--stale"
            title="Boty odpowiadają jeszcze ze starej wersji — użyj „Zaindeksuj wszystko”"
          >
            ⟳ nieaktualny
          </span>
        )}
      </button>
      <p className="knowledge-entry-body">{entry.body}</p>
      <div className="knowledge-entry-foot">
        {entry.tags.map((tag) => (
          <span key={tag} className="knowledge-tag">
            #{tag}
          </span>
        ))}
        {confirming ? (
          <>
            <span className="knowledge-flag">Usunąć?</span>
            <button
              type="button"
              className="small-button character-delete"
              onClick={() => void deleteKnowledgeEntry(entry.id)}
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
            title="Usuń wpis (zniknie też z pamięci botów)"
            onClick={() => setConfirming(true)}
          >
            ✕
          </button>
        )}
      </div>
    </li>
  );
}

const EMPTY_DRAFT = {
  title: '',
  body: '',
  type: 'place' as KnowledgeEntryType,
  tags: '',
  visibility: 'bots' as KnowledgeVisibility,
};

function EntryForm({ entry, onClose }: { entry: KnowledgeEntryView | null; onClose: () => void }) {
  const [draft, setDraft] = useState(() =>
    entry
      ? {
          title: entry.title,
          body: entry.body,
          type: entry.type,
          tags: entry.tags.join(', '),
          visibility: entry.visibility,
        }
      : EMPTY_DRAFT,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tags = useMemo(() => parseTagInput(draft.tags), [draft.tags]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const ack = await saveKnowledgeEntry({
      ...(entry ? { id: entry.id } : {}),
      title: draft.title,
      body: draft.body,
      type: draft.type,
      tags,
      visibility: draft.visibility,
    });
    setBusy(false);
    if (!ack.ok) {
      setError(
        ack.error.startsWith('INVALID_ENTRY:')
          ? ack.error.slice('INVALID_ENTRY:'.length)
          : `Nie udało się zapisać wpisu: ${ack.error}`,
      );
      return;
    }
    onClose();
  }

  return (
    <form className="bot-form knowledge-form" onSubmit={(event) => void submit(event)}>
      <label className="bot-field">
        <span className="auth-label">Tytuł</span>
        <input
          type="text"
          autoFocus
          maxLength={KNOWLEDGE_TITLE_MAX_LENGTH}
          value={draft.title}
          placeholder="np. Klub Afterlife"
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
        <span className="bot-hint">
          Tytuł jedzie z każdym fragmentem do modelu — nazwij wpis tak, jak pytaliby o niego przy
          stole.
        </span>
      </label>

      <div className="bot-row-inline">
        <label className="bot-field bot-field--inline">
          <span className="auth-label">Rodzaj</span>
          <select
            value={draft.type}
            onChange={(event) =>
              setDraft({ ...draft, type: event.target.value as KnowledgeEntryType })
            }
          >
            {KNOWLEDGE_TYPES.map((type) => (
              <option key={type} value={type}>
                {KNOWLEDGE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="bot-field bot-field--inline">
          <span className="auth-label">Widoczność</span>
          <select
            value={draft.visibility}
            onChange={(event) =>
              setDraft({ ...draft, visibility: event.target.value as KnowledgeVisibility })
            }
          >
            {KNOWLEDGE_VISIBILITIES.map((visibility) => (
              <option key={visibility} value={visibility}>
                {KNOWLEDGE_VISIBILITY_LABELS[visibility]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {draft.visibility === 'gm' && (
        <p className="bot-hint">
          Wpis „tylko MG" nie ma prawa pojawić się w prompcie żadnego bota — filtruje go gateway
          przy wyszukiwaniu, więc NPC nawet nie zobaczy, że coś takiego istnieje.
        </p>
      )}

      <label className="bot-field">
        <span className="auth-label">Tagi</span>
        <input
          type="text"
          value={draft.tags}
          placeholder="miejsca, watson, gangi"
          onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
        />
        <span className="bot-hint">
          {tags.length > 0 ? `Zapisane jako: ${tags.map((tag) => `#${tag}`).join(' ')}. ` : ''}
          Tag to jedyny język uprawnień — bot czyta wpis, jeśli ma któryś z jego tagów (limit{' '}
          {KNOWLEDGE_TAGS_MAX}).
        </span>
      </label>

      <label className="bot-field">
        <span className="auth-label">Treść</span>
        <textarea
          rows={10}
          maxLength={KNOWLEDGE_BODY_MAX_LENGTH}
          value={draft.body}
          placeholder="Co bot ma o tym wiedzieć. Pisz zdaniami — model czyta to jak notatkę, nie jak tabelę."
          onChange={(event) => setDraft({ ...draft, body: event.target.value })}
        />
        <span className="bot-hint">
          {draft.body.length} / {KNOWLEDGE_BODY_MAX_LENGTH} znaków
        </span>
      </label>

      {error && <p className="auth-error">{error}</p>}
      <div className="bot-row-inline">
        <button type="submit" className="small-button" disabled={busy}>
          {busy ? 'Zapisuję i indeksuję…' : entry ? 'Zapisz zmiany' : 'Dodaj wpis'}
        </button>
        <button type="button" className="small-button" onClick={onClose}>
          Anuluj
        </button>
      </div>
    </form>
  );
}

export function KnowledgePanel() {
  const entries = useKnowledgeStore((s) => s.entries);
  const order = useKnowledgeStore((s) => s.order);
  const index = useKnowledgeStore((s) => s.index);
  const editing = useKnowledgeStore((s) => s.editing);
  const loaded = useKnowledgeStore((s) => s.loaded);
  const setEditing = useKnowledgeStore((s) => s.setEditing);
  const [query, setQuery] = useState('');

  useEffect(() => {
    void fetchKnowledge();
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = order
      .map((id) => entries[id])
      .filter((entry): entry is KnowledgeEntryView => !!entry);
    if (!needle) return rows;
    return rows.filter(
      (entry) =>
        entry.title.toLowerCase().includes(needle) ||
        entry.body.toLowerCase().includes(needle) ||
        entry.tags.some((tag) => tag.includes(needle)),
    );
  }, [entries, order, query]);

  if (editing) {
    const entry = editing === 'new' ? null : (entries[editing] ?? null);
    return (
      <section className="knowledge-panel">
        <EntryForm entry={entry} onClose={() => setEditing(null)} />
      </section>
    );
  }

  return (
    <section className="knowledge-panel">
      <IndexLine status={index} />

      <div className="compendium-head">
        <input
          className="compendium-search"
          type="search"
          value={query}
          placeholder="Szukaj we wpisach…"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="button" className="small-button" onClick={() => setEditing('new')}>
          + Nowy wpis
        </button>
      </div>

      <ul className="knowledge-list">
        {visible.length === 0 ? (
          <li className="placeholder-text">
            {!loaded
              ? 'Wczytuję…'
              : order.length === 0
                ? 'Baza jest pusta. Opisz miejsce, frakcję albo NPC-a — bot z uprawnieniem przypomni to sobie w rozmowie.'
                : 'Nic nie pasuje do wyszukiwania.'}
          </li>
        ) : (
          visible.map((entry) => (
            <EntryRow key={entry.id} entry={entry} onEdit={() => setEditing(entry.id)} />
          ))
        )}
      </ul>
    </section>
  );
}
