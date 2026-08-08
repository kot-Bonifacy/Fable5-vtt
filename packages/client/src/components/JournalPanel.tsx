import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  JournalEntryView,
  JournalIndexStatus,
  JournalProgressBroadcast,
  KnowledgeVisibility,
  RelationProposal,
} from '@vtt/shared';
import {
  JOURNAL_BODY_MAX_LENGTH,
  JOURNAL_HINT_MAX_LENGTH,
  JOURNAL_TITLE_MAX_LENGTH,
  KNOWLEDGE_TAGS_MAX,
  KNOWLEDGE_VISIBILITIES,
  KNOWLEDGE_VISIBILITY_LABELS,
  normalizeKnowledgeTags,
  relationBadge,
} from '@vtt/shared';
import {
  cancelSummary,
  deleteJournalEntry,
  fetchJournal,
  reindexJournal,
  saveJournalEntry,
  setRelation,
  summarizeSession,
} from '../socket.js';
import { useJournalStore } from '../stores/journalStore.js';

/**
 * Dziennik kampanii (etap 19c) — zakładka MG.
 *
 * Panel prowadzi jedną drogę: „Zakończ sesję" → szkic do poprawy → „Zapisz do
 * dziennika". Model niczego nie zapisuje sam, więc szkic i propozycje relacji
 * są tu widoczne jako materiał do decyzji, a nie jako fakt dokonany.
 */

const STAGE_LABELS: Record<JournalProgressBroadcast['stage'], string> = {
  read: 'Czytam czat',
  map: 'Streszczam fragment',
  reduce: 'Składam całość',
  relations: 'Sprawdzam nastawienia NPC',
};

function parseTagInput(raw: string): string[] {
  return normalizeKnowledgeTags(raw.split(/[,\s]+/));
}

/** Polska liczba mnoga: 1 sesja, 2–4 sesje, 5+ sesji. */
function plural(count: number, one: string, few: string, many: string): string {
  const last = count % 10;
  const teens = count % 100;
  if (count === 1) return `${count} ${one}`;
  if (last >= 2 && last <= 4 && (teens < 12 || teens > 14)) return `${count} ${few}`;
  return `${count} ${many}`;
}

function IndexLine({ status }: { status: JournalIndexStatus }) {
  const [busy, setBusy] = useState(false);

  async function reindex() {
    setBusy(true);
    const ack = await reindexJournal();
    if (ack.ok && ack.data) useJournalStore.getState().setIndex(ack.data);
    setBusy(false);
  }

  return (
    <div className="ai-status">
      <div className="ai-status-main">
        <span className={`badge ${status.ready ? 'badge--ok' : 'badge--off'}`}>
          {status.ready ? 'dziennik zaindeksowany' : 'indeks niedostępny'}
        </span>
        {status.chunks > 0 && (
          <span className="ai-status-text">
            {plural(status.documents, 'sesja', 'sesje', 'sesji')} ·{' '}
            {plural(status.chunks, 'fragment', 'fragmenty', 'fragmentów')}
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

/** „Zakończ sesję": licznik linii, podpowiedź do promptu i pasek postępu. */
function SummarySection() {
  const pendingLines = useJournalStore((s) => s.pendingLines);
  const running = useJournalStore((s) => s.running);
  const error = useJournalStore((s) => s.error);
  const [hint, setHint] = useState('');

  async function start() {
    useJournalStore.getState().startRun('pending');
    const ack = await summarizeSession(hint);
    if (!ack.ok) {
      useJournalStore
        .getState()
        .fail(
          ack.error === 'AI_UNAVAILABLE'
            ? 'Brak połączenia z AI Gateway — streszczanie wymaga modelu.'
            : `Nie udało się zacząć streszczania: ${ack.error}`,
        );
      return;
    }
    if (ack.data) useJournalStore.getState().startRun(ack.data.requestId);
  }

  if (running) {
    const progress = running.progress;
    return (
      <div className="journal-run">
        <span className="ai-status-text">
          {progress ? STAGE_LABELS[progress.stage] : 'Zaczynam'}
          {progress && progress.total > 1 ? ` ${progress.done + 1}/${progress.total}` : ''}…
        </span>
        <button
          type="button"
          className="small-button"
          onClick={() => {
            cancelSummary();
            useJournalStore.getState().clearDraft();
          }}
        >
          Przerwij
        </button>
      </div>
    );
  }

  return (
    <div className="journal-run">
      <input
        type="text"
        className="journal-hint"
        value={hint}
        maxLength={JOURNAL_HINT_MAX_LENGTH}
        placeholder="Opcjonalnie: na czym się skupić — np. wątek z Militechem"
        onChange={(event) => setHint(event.target.value)}
      />
      <button
        type="button"
        className="small-button"
        onClick={() => void start()}
        disabled={pendingLines === 0}
        title={
          pendingLines === 0
            ? 'Od ostatniego wpisu dziennika nie ma nowych wypowiedzi'
            : 'Streszcza czat od ostatniego wpisu dziennika do teraz'
        }
      >
        Zakończ sesję i streść ({pendingLines})
      </button>
      {error && <p className="ai-status-error">{error}</p>}
    </div>
  );
}

/** Jedna propozycja zmiany nastawienia. Zatwierdzana pojedynczo — nigdy hurtem. */
function ProposalRow({ proposal }: { proposal: RelationProposal }) {
  const [busy, setBusy] = useState(false);

  async function apply() {
    setBusy(true);
    const ack = await setRelation({
      botId: proposal.botId,
      characterId: proposal.characterId,
      value: proposal.value,
      note: proposal.note,
    });
    setBusy(false);
    if (ack.ok) useJournalStore.getState().dropProposal(proposal.botId, proposal.characterId);
  }

  return (
    <li className="journal-proposal">
      <span className="journal-proposal-main">
        <strong>{proposal.botName}</strong> → {proposal.characterName}:{' '}
        <span className="knowledge-tag">{relationBadge(proposal.currentValue)}</span> →{' '}
        <span className="knowledge-tag">{relationBadge(proposal.value)}</span>
      </span>
      {proposal.note && <span className="bot-hint">{proposal.note}</span>}
      <span className="bot-row-inline">
        <button type="button" className="small-button" disabled={busy} onClick={() => void apply()}>
          Zastosuj
        </button>
        <button
          type="button"
          className="small-button"
          onClick={() =>
            useJournalStore.getState().dropProposal(proposal.botId, proposal.characterId)
          }
        >
          Odrzuć
        </button>
      </span>
    </li>
  );
}

/** Szkic streszczenia: tekst do poprawy plus decyzja, kto go czyta. */
function DraftSection() {
  const draft = useJournalStore((s) => s.draft);
  const proposals = useJournalStore((s) => s.proposals);
  const batches = useJournalStore((s) => s.batches);
  const [tagDraft, setTagDraft] = useState('');
  const [visibility, setVisibility] = useState<KnowledgeVisibility>('gm');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tags = useMemo(() => parseTagInput(tagDraft), [tagDraft]);

  if (!draft) return null;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    setBusy(true);
    setError(null);
    const ack = await saveJournalEntry({
      title: draft.title,
      body: draft.body,
      sessionDate: draft.sessionDate,
      tags,
      visibility,
      throughMessageId: draft.throughMessageId,
      lineCount: draft.lineCount,
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
    useJournalStore.getState().clearDraft();
    void fetchJournal();
  }

  return (
    <form className="bot-form journal-draft" onSubmit={(event) => void save(event)}>
      <h3>Szkic streszczenia</h3>
      <p className="bot-hint">
        {plural(draft.lineCount, 'wypowiedź', 'wypowiedzi', 'wypowiedzi')}
        {batches > 1 ? ` · streszczone w ${batches} porcjach` : ''} · sesja z {draft.sessionDate}.
        Popraw tekst, zanim trafi do dziennika — to on pojedzie do pamięci botów.
      </p>

      <label className="bot-field">
        <span className="auth-label">Tytuł</span>
        <input
          type="text"
          maxLength={JOURNAL_TITLE_MAX_LENGTH}
          value={draft.title}
          onChange={(event) => useJournalStore.getState().patchDraft({ title: event.target.value })}
        />
      </label>

      <label className="bot-field">
        <span className="auth-label">Treść</span>
        <textarea
          rows={12}
          maxLength={JOURNAL_BODY_MAX_LENGTH}
          value={draft.body}
          onChange={(event) => useJournalStore.getState().patchDraft({ body: event.target.value })}
        />
      </label>

      <div className="bot-row-inline">
        <label className="bot-field bot-field--inline">
          <span className="auth-label">Kto to czyta</span>
          <select
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as KnowledgeVisibility)}
          >
            {KNOWLEDGE_VISIBILITIES.map((option) => (
              <option key={option} value={option}>
                {KNOWLEDGE_VISIBILITY_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="bot-field bot-field--inline">
          <span className="auth-label">Tagi</span>
          <input
            type="text"
            value={tagDraft}
            placeholder="sesje, militech"
            onChange={(event) => setTagDraft(event.target.value)}
          />
        </label>
      </div>
      <p className="bot-hint">
        {visibility === 'gm'
          ? 'Wpis zostaje u Ciebie — żaden NPC nie dowie się z niego niczego.'
          : `Boty z pasującym tagiem przypomną sobie tę sesję (limit ${KNOWLEDGE_TAGS_MAX} tagów).`}
      </p>

      {proposals.length > 0 && (
        <>
          <h3>Propozycje zmian nastawienia ({proposals.length})</h3>
          <p className="bot-hint">
            Model przeczytał streszczenie i tak by to zapisał. Nic nie zmieni się bez Twojego
            kliknięcia.
          </p>
          <ul className="journal-proposals">
            {proposals.map((proposal) => (
              <ProposalRow key={`${proposal.botId}:${proposal.characterId}`} proposal={proposal} />
            ))}
          </ul>
        </>
      )}

      {error && <p className="auth-error">{error}</p>}
      <div className="bot-row-inline">
        <button type="submit" className="small-button" disabled={busy}>
          {busy ? 'Zapisuję…' : 'Zapisz do dziennika'}
        </button>
        <button
          type="button"
          className="small-button"
          onClick={() => useJournalStore.getState().clearDraft()}
        >
          Odrzuć szkic
        </button>
      </div>
    </form>
  );
}

function EntryRow({ entry, onEdit }: { entry: JournalEntryView; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="knowledge-entry">
      <button type="button" className="knowledge-entry-head" onClick={onEdit}>
        <span className="knowledge-type knowledge-type--event">{entry.sessionDate}</span>
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
        {entry.lineCount > 0 && (
          <span className="knowledge-tag">
            z {plural(entry.lineCount, 'wypowiedzi', 'wypowiedzi', 'wypowiedzi')}
          </span>
        )}
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
              onClick={() => void deleteJournalEntry(entry.id)}
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

/** Ręczna edycja wpisu — poprawka streszczenia albo notatka pisana od zera. */
function EntryForm({ entry, onClose }: { entry: JournalEntryView | null; onClose: () => void }) {
  const [draft, setDraft] = useState(() =>
    entry
      ? {
          title: entry.title,
          body: entry.body,
          sessionDate: entry.sessionDate,
          tags: entry.tags.join(', '),
          visibility: entry.visibility,
        }
      : {
          title: '',
          body: '',
          sessionDate: new Date().toISOString().slice(0, 10),
          tags: '',
          visibility: 'gm' as KnowledgeVisibility,
        },
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const ack = await saveJournalEntry({
      ...(entry ? { id: entry.id } : {}),
      title: draft.title,
      body: draft.body,
      sessionDate: draft.sessionDate,
      tags: parseTagInput(draft.tags),
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
          maxLength={JOURNAL_TITLE_MAX_LENGTH}
          value={draft.title}
          placeholder="np. Skok na skład Militechu"
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
      </label>

      <div className="bot-row-inline">
        <label className="bot-field bot-field--inline">
          <span className="auth-label">Data sesji</span>
          <input
            type="date"
            value={draft.sessionDate}
            onChange={(event) => setDraft({ ...draft, sessionDate: event.target.value })}
          />
        </label>
        <label className="bot-field bot-field--inline">
          <span className="auth-label">Kto to czyta</span>
          <select
            value={draft.visibility}
            onChange={(event) =>
              setDraft({ ...draft, visibility: event.target.value as KnowledgeVisibility })
            }
          >
            {KNOWLEDGE_VISIBILITIES.map((option) => (
              <option key={option} value={option}>
                {KNOWLEDGE_VISIBILITY_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="bot-field">
        <span className="auth-label">Tagi</span>
        <input
          type="text"
          value={draft.tags}
          placeholder="sesje, militech"
          onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
        />
        <span className="bot-hint">
          Bot czyta wpis, jeśli ma któryś z jego tagów — i tylko wtedy, gdy wpis jest oznaczony
          „boty z uprawnieniem".
        </span>
      </label>

      <label className="bot-field">
        <span className="auth-label">Treść</span>
        <textarea
          rows={12}
          maxLength={JOURNAL_BODY_MAX_LENGTH}
          value={draft.body}
          placeholder="Co się wydarzyło na sesji. Pisz zdaniami — model czyta to jak notatkę."
          onChange={(event) => setDraft({ ...draft, body: event.target.value })}
        />
        <span className="bot-hint">
          {draft.body.length} / {JOURNAL_BODY_MAX_LENGTH} znaków
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

export function JournalPanel() {
  const entries = useJournalStore((s) => s.entries);
  const order = useJournalStore((s) => s.order);
  const index = useJournalStore((s) => s.index);
  const editing = useJournalStore((s) => s.editing);
  const loaded = useJournalStore((s) => s.loaded);
  const draft = useJournalStore((s) => s.draft);
  const setEditing = useJournalStore((s) => s.setEditing);

  useEffect(() => {
    void fetchJournal();
  }, []);

  if (editing) {
    const entry = editing === 'new' ? null : (entries[editing] ?? null);
    return (
      <section className="knowledge-panel">
        <EntryForm
          entry={entry}
          onClose={() => {
            setEditing(null);
            void fetchJournal();
          }}
        />
      </section>
    );
  }

  return (
    <section className="knowledge-panel">
      <IndexLine status={index} />
      <SummarySection />
      <DraftSection />

      {!draft && (
        <>
          <div className="compendium-head">
            <span className="ai-status-text">Dziennik kampanii</span>
            <button type="button" className="small-button" onClick={() => setEditing('new')}>
              + Wpis ręcznie
            </button>
          </div>

          <ul className="knowledge-list">
            {order.length === 0 ? (
              <li className="placeholder-text">
                {!loaded
                  ? 'Wczytuję…'
                  : 'Dziennik jest pusty. Po sesji kliknij „Zakończ sesję i streść” — reszta to poprawki.'}
              </li>
            ) : (
              order
                .map((id) => entries[id])
                .filter((entry): entry is JournalEntryView => !!entry)
                .map((entry) => (
                  <EntryRow key={entry.id} entry={entry} onEdit={() => setEditing(entry.id)} />
                ))
            )}
          </ul>
        </>
      )}
    </section>
  );
}
