import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type {
  JournalEntryView,
  JournalHandoutLink,
  JournalIndexStatus,
  JournalPlayerEntry,
  JournalProgressBroadcast,
  JournalUpsertPayload,
  KnowledgeVisibility,
  RelationProposal,
} from '@vtt/shared';
import {
  JOURNAL_BODY_MAX_LENGTH,
  JOURNAL_HANDOUTS_MAX,
  JOURNAL_HINT_MAX_LENGTH,
  JOURNAL_TITLE_MAX_LENGTH,
  KNOWLEDGE_TAGS_MAX,
  KNOWLEDGE_VISIBILITIES,
  KNOWLEDGE_VISIBILITY_LABELS,
  ROLE_GM,
  groupJournalByMonth,
  journalMatches,
  normalizeKnowledgeTags,
  relationBadge,
} from '@vtt/shared';
import {
  cancelSummary,
  deleteJournalEntry,
  fetchHandouts,
  fetchJournal,
  journalErrorText,
  reindexJournal,
  saveJournalEntry,
  setRelation,
  summarizeSession,
} from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useHandoutStore } from '../stores/handoutStore.js';
import { useJournalStore } from '../stores/journalStore.js';
import { plural } from '../plural.js';
import { Markdown } from './Markdown.js';
import { EmptyState } from './EmptyState.js';

/**
 * Dziennik kampanii — zakładka MG (19c) i kronika stołu (24b).
 *
 * Panel MG prowadzi jedną drogę: „Zakończ sesję" → szkic do poprawy → „Zapisz
 * do dziennika". Model niczego nie zapisuje sam, więc szkic i propozycje relacji
 * są tu materiałem do decyzji, a nie faktem dokonanym.
 *
 * Od 24b ta sama zakładka istnieje u gracza — z osią czasu i wyszukiwarką, ale
 * bez jednego pola do edycji. Nie ma tu gałęzi „ukryj u gracza": wpisów, których
 * MG nie odsłonił, po tamtej stronie po prostu nie ma, bo serwer ich nie wysłał.
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
  const [shared, setShared] = useState(false);
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
      sharedWithPlayers: shared,
      throughMessageId: draft.throughMessageId,
      lineCount: draft.lineCount,
    });
    setBusy(false);
    if (!ack.ok) {
      setError(journalErrorText(ack.error));
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

      <label className="journal-share-toggle">
        <input
          type="checkbox"
          checked={shared}
          onChange={(event) => setShared(event.target.checked)}
        />
        <span>Widzi stół — wpis pojawi się graczom w zakładce „Dziennik"</span>
      </label>

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

// ---------------------------------------------------------------------------
// Oś czasu — wspólna dla obu stron stołu (etap 24b)
// ---------------------------------------------------------------------------

/**
 * Odnośniki do materiałów przypiętych do wpisu.
 *
 * Lista przychodzi z serwera już odsiana — u gracza są w niej wyłącznie
 * handouty, które dostał — więc tutaj nie ma czego ukrywać. Przycisk otwiera
 * okno z pamięci klienta, tak samo jak wiersz handoutu na czacie.
 */
function HandoutLinks({ handouts }: { handouts: JournalHandoutLink[] }) {
  const known = useHandoutStore((s) => s.handouts);
  const openHandout = useHandoutStore((s) => s.openHandout);
  if (handouts.length === 0) return null;
  return (
    <div className="journal-materials">
      <span className="journal-materials-label">Materiały:</span>
      {handouts.map((handout) => (
        <button
          key={handout.id}
          type="button"
          className="journal-material"
          disabled={!(handout.id in known)}
          title={handout.id in known ? 'Otwórz materiał' : 'Materiał wycofany'}
          onClick={() => openHandout(handout.id)}
        >
          {handout.hasImage ? '🖼 ' : '📄 '}
          {handout.title}
        </button>
      ))}
    </div>
  );
}

interface TimelineProps<T extends JournalPlayerEntry> {
  entries: T[];
  /** Lista jest już wczytana — dopiero wtedy wolno rozstrzygać o ognisku. */
  ready: boolean;
  emptyText: string;
  /** Chipy w nagłówku wiersza — MG dokłada widoczność i stan indeksu. */
  badges?: (entry: T) => ReactNode;
  /** Przyciski pod treścią rozwiniętego wpisu — u gracza żadnych. */
  actions?: (entry: T) => ReactNode;
}

/**
 * Oś czasu: nagłówki miesięcy, wiersze wpisów i wyszukiwarka.
 *
 * Rozwinięty jest **najnowszy wpis z widocznych** — a przy aktywnym szukaniu
 * pierwsze trafienie, więc wpisanie słowa od razu pokazuje treść, zamiast
 * kazać jeszcze klikać. Reszta zwija się do wiersza „data — tytuł", żeby
 * zakładka nie rosła z liczbą sesji.
 */
function JournalTimeline<T extends JournalPlayerEntry>({
  entries,
  ready,
  emptyText,
  badges,
  actions,
}: TimelineProps<T>) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const focus = useJournalStore((s) => s.focus);
  const setFocus = useJournalStore((s) => s.setFocus);

  const filtered = useMemo(
    () => entries.filter((entry) => journalMatches(entry, query)),
    [entries, query],
  );
  const groups = useMemo(() => groupJournalByMonth(filtered), [filtered]);
  const newest = filtered[0]?.id;

  // Przycisk „Otwórz" z czatu: wpis ma się rozwinąć i pokazać niezależnie od
  // tego, co akurat jest wpisane w wyszukiwarkę.
  //
  // Czekamy na `ready`, bo panel montuje się razem z przełączeniem zakładki —
  // gdyby ognisko gasło przed wczytaniem listy, wpis by się nie rozwinął. Gdy
  // lista już jest, ognisko gaśnie **zawsze**, także dla wpisu, którego w niej
  // nie ma: inaczej zostałoby zapalone na stałe i drugie kliknięcie „Otwórz"
  // (ta sama wartość w store) nie wywołałoby już niczego.
  useEffect(() => {
    if (!focus || !ready) return;
    const found = entries.some((entry) => entry.id === focus);
    setFocus(null);
    if (!found) return;
    setQuery('');
    setOpen((previous) => ({ ...previous, [focus]: true }));
    requestAnimationFrame(() =>
      document.getElementById(`journal-entry-${focus}`)?.scrollIntoView({ block: 'nearest' }),
    );
  }, [focus, ready, entries, setFocus]);

  return (
    <>
      <div className="journal-search">
        <input
          type="search"
          value={query}
          placeholder="Szukaj w dzienniku — tytuł i treść"
          onChange={(event) => setQuery(event.target.value)}
        />
        {query.length > 0 && (
          <span className="ai-status-text">
            {plural(filtered.length, 'wpis', 'wpisy', 'wpisów')}
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        query.length > 0 ? (
          <EmptyState
            text="Nic takiego w dzienniku nie ma."
            action={{ label: 'Wyczyść szukanie', onClick: () => setQuery('') }}
          />
        ) : (
          <EmptyState text={emptyText} />
        )
      ) : (
        groups.map((group) => (
          <section key={group.key} className="journal-month">
            <h4 className="journal-month-label">{group.label}</h4>
            <ul className="journal-timeline">
              {group.entries.map((entry) => {
                const expanded = open[entry.id] ?? entry.id === newest;
                return (
                  <li
                    key={entry.id}
                    id={`journal-entry-${entry.id}`}
                    className={`journal-entry ${expanded ? 'journal-entry--open' : ''}`}
                  >
                    <button
                      type="button"
                      className="journal-entry-head"
                      aria-expanded={expanded}
                      onClick={() =>
                        setOpen((previous) => ({ ...previous, [entry.id]: !expanded }))
                      }
                    >
                      <span className="journal-entry-arrow">{expanded ? '▾' : '▸'}</span>
                      <span className="knowledge-type knowledge-type--event">
                        {entry.sessionDate}
                      </span>
                      <span className="knowledge-entry-title">{entry.title}</span>
                      {badges?.(entry)}
                    </button>
                    {expanded && (
                      <div className="journal-entry-body">
                        <Markdown source={entry.body} />
                        <HandoutLinks handouts={entry.handouts} />
                        {actions?.(entry)}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Widok MG
// ---------------------------------------------------------------------------

/** Pełny zapis wpisu z jedną zmienioną rzeczą — `journal:upsert` chce całości. */
function entryPayload(
  entry: JournalEntryView,
  patch: Partial<JournalUpsertPayload>,
): JournalUpsertPayload {
  return {
    id: entry.id,
    title: entry.title,
    body: entry.body,
    sessionDate: entry.sessionDate,
    tags: entry.tags,
    visibility: entry.visibility,
    sharedWithPlayers: entry.sharedWithPlayers,
    handoutIds: entry.handouts.map((handout) => handout.id),
    ...patch,
  };
}

/** Przełącznik „widzi stół" i kosz — jedyne działania na wierszu listy. */
function GmEntryActions({ entry }: { entry: JournalEntryView }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setEditing = useJournalStore((s) => s.setEditing);

  async function toggleShared() {
    setBusy(true);
    setError(null);
    const ack = await saveJournalEntry(
      entryPayload(entry, { sharedWithPlayers: !entry.sharedWithPlayers }),
    );
    setBusy(false);
    if (!ack.ok) setError(journalErrorText(ack.error));
  }

  return (
    <div className="journal-entry-actions">
      <button
        type="button"
        className={`small-button ${entry.sharedWithPlayers ? 'small-button--on' : ''}`}
        disabled={busy}
        onClick={() => void toggleShared()}
        title={
          entry.sharedWithPlayers
            ? 'Zdejmij wpis ze stołu — zniknie graczom'
            : 'Pokaż wpis graczom (zostawi linię na czacie)'
        }
      >
        {entry.sharedWithPlayers ? '👁 Widzi stół' : '👁 Pokaż stołowi'}
      </button>
      <button type="button" className="small-button" onClick={() => setEditing(entry.id)}>
        ✎ Edytuj
      </button>
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
          title="Usuń wpis (zniknie też z pamięci botów i ze stołu)"
          aria-label="Usuń wpis (zniknie też z pamięci botów i ze stołu)"
          onClick={() => setConfirming(true)}
        >
          ✕
        </button>
      )}
      {error && <span className="auth-error">{error}</span>}
    </div>
  );
}

function GmBadges({ entry }: { entry: JournalEntryView }) {
  return (
    <>
      {entry.sharedWithPlayers && (
        <span className="knowledge-flag knowledge-flag--shared" title="Gracze mają ten wpis">
          👁 stół
        </span>
      )}
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
    </>
  );
}

/** Ręczna edycja wpisu — poprawka streszczenia albo notatka pisana od zera. */
function EntryForm({ entry, onClose }: { entry: JournalEntryView | null; onClose: () => void }) {
  const handouts = useJournalStore((s) => s.handouts);
  const [draft, setDraft] = useState(() =>
    entry
      ? {
          title: entry.title,
          body: entry.body,
          sessionDate: entry.sessionDate,
          tags: entry.tags.join(', '),
          visibility: entry.visibility,
          sharedWithPlayers: entry.sharedWithPlayers,
        }
      : {
          title: '',
          body: '',
          sessionDate: new Date().toISOString().slice(0, 10),
          tags: '',
          visibility: 'gm' as KnowledgeVisibility,
          sharedWithPlayers: false,
        },
  );
  const [pinned, setPinned] = useState<string[]>(
    () => entry?.handouts.map((handout) => handout.id) ?? [],
  );
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function togglePinned(id: string) {
    setPinned((previous) =>
      previous.includes(id)
        ? previous.filter((pinnedId) => pinnedId !== id)
        : previous.length >= JOURNAL_HANDOUTS_MAX
          ? previous
          : [...previous, id],
    );
  }

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
      sharedWithPlayers: draft.sharedWithPlayers,
      handoutIds: pinned,
    });
    setBusy(false);
    if (!ack.ok) {
      setError(journalErrorText(ack.error));
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

      {/* Uprawnienie stołu jest osobne od uprawnienia botów: wpis może być
          kroniką dla drużyny, nie będąc pamięcią żadnego NPC-a. */}
      <label className="journal-share-toggle">
        <input
          type="checkbox"
          checked={draft.sharedWithPlayers}
          onChange={(event) => setDraft({ ...draft, sharedWithPlayers: event.target.checked })}
        />
        <span>Widzi stół — wpis pojawi się graczom w zakładce „Dziennik"</span>
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
          Markdown jak w handoutach: <code>#</code> nagłówek, <code>**mocno**</code>, <code>-</code>{' '}
          lista, <code>&gt;</code> cytat. {draft.body.length} / {JOURNAL_BODY_MAX_LENGTH} znaków
        </span>
      </label>

      <div className="bot-row-inline">
        <button type="button" className="small-button" onClick={() => setPreview(!preview)}>
          {preview ? 'Ukryj podgląd' : 'Podgląd'}
        </button>
      </div>
      {preview && (
        <div className="handout-preview">
          <Markdown source={draft.body} />
        </div>
      )}

      <div className="bot-field">
        <span className="auth-label">Materiały do wpisu</span>
        {handouts.length === 0 ? (
          <span className="bot-hint">
            Nie ma jeszcze żadnego handoutu — załóż go w zakładce „Handouty".
          </span>
        ) : (
          <>
            <div className="journal-pin-list">
              {handouts.map((handout) => {
                const on = pinned.includes(handout.id);
                // Przy komplecie chip przestawał reagować bez słowa — MG widział
                // martwy przycisk, nie limit. Wyszarzenie mówi to samo, co zdanie niżej.
                const full = !on && pinned.length >= JOURNAL_HANDOUTS_MAX;
                return (
                  <button
                    key={handout.id}
                    type="button"
                    className={`handout-chip ${on ? 'handout-chip--on' : ''}`}
                    disabled={full}
                    title={
                      full
                        ? `Przypięto już ${JOURNAL_HANDOUTS_MAX} materiałów — odepnij któryś, żeby dodać ten`
                        : undefined
                    }
                    onClick={() => togglePinned(handout.id)}
                  >
                    {handout.hasImage ? '🖼 ' : '📄 '}
                    {handout.title}
                  </button>
                );
              })}
            </div>
            <span className="bot-hint">
              {pinned.length >= JOURNAL_HANDOUTS_MAX
                ? `Przypięto ${pinned.length} z ${JOURNAL_HANDOUTS_MAX} — więcej materiałów wpis nie przyjmie. `
                : ''}
              Odnośnik zobaczy tylko ten gracz, któremu handout jest udostępniony — reszcie stołu
              wpis pokaże się bez niego.
            </span>
          </>
        )}
      </div>

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

function GmJournal() {
  const entries = useJournalStore((s) => s.entries);
  const order = useJournalStore((s) => s.order);
  const index = useJournalStore((s) => s.index);
  const editing = useJournalStore((s) => s.editing);
  const loaded = useJournalStore((s) => s.loaded);
  const draft = useJournalStore((s) => s.draft);
  const setEditing = useJournalStore((s) => s.setEditing);

  const list = useMemo(
    () => order.map((id) => entries[id]).filter((entry): entry is JournalEntryView => !!entry),
    [order, entries],
  );

  if (editing) {
    const entry = editing === 'new' ? null : (entries[editing] ?? null);
    return (
      <EntryForm
        entry={entry}
        onClose={() => {
          setEditing(null);
          void fetchJournal();
        }}
      />
    );
  }

  return (
    <>
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
          <JournalTimeline
            entries={list}
            ready={loaded}
            emptyText={
              loaded
                ? 'Dziennik jest pusty. Po sesji kliknij „Zakończ sesję i streść” — reszta to poprawki.'
                : 'Wczytuję…'
            }
            badges={(entry) => <GmBadges entry={entry} />}
            actions={(entry) => <GmEntryActions entry={entry} />}
          />
        </>
      )}
    </>
  );
}

export function JournalPanel() {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const shared = useJournalStore((s) => s.shared);
  const sharedOrder = useJournalStore((s) => s.sharedOrder);
  const loaded = useJournalStore((s) => s.loaded);

  useEffect(() => {
    void fetchJournal();
    // Odnośniki do materiałów otwierają okno z pamięci klienta, a gracz mógł
    // nigdy nie wejść w zakładkę „Handouty" — bez tego przycisk byłby martwy.
    void fetchHandouts();
  }, []);

  const list = useMemo(
    () =>
      sharedOrder.map((id) => shared[id]).filter((entry): entry is JournalPlayerEntry => !!entry),
    [sharedOrder, shared],
  );

  return (
    <section className="knowledge-panel journal-panel">
      {isGm ? (
        <GmJournal />
      ) : (
        <JournalTimeline
          entries={list}
          ready={loaded}
          emptyText={
            loaded ? 'Mistrz Gry nie udostępnił jeszcze żadnego wpisu z kroniki.' : 'Wczytuję…'
          }
        />
      )}
    </section>
  );
}
