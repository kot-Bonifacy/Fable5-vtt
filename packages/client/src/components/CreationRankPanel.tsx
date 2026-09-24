import { useEffect, useState } from 'react';
import type {
  CpredCreationData,
  CpredStatId,
  CreationPermitRow,
  CreationRankDraft,
  CreationTerms,
} from '@vtt/shared';
import {
  CPRED_CREATION_METHOD_LABELS,
  CPRED_STAT_IDS,
  CPRED_STAT_LABELS,
  CREATION_SKILL_POOL_MAX,
  CREATION_SKILL_POOL_MIN,
  creationDataOf,
  isCreationSkillPool,
} from '@vtt/shared';
import {
  answerCreationRequest,
  creationErrorText,
  discardPlayerDraft,
  rerollCreationStats,
  setCreationTerms,
} from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useCreationRankStore, waitingRankCount } from '../stores/creationRankStore.js';

/**
 * The GM's view of players' new characters, on the „Postacie" tab.
 *
 * Since 24.09 (decyzje MG) a player's character starts with a request, and the
 * GM agrees **with the terms**: the method, the „Ranga Postaci" that pays for
 * Kompletny Pakiet's stats, and the skill budget (the book's 86 or his own
 * number). The same terms stay editable on the draft while it is built. A
 * Krawędziarz row also carries „Pozwól przerzucić" — a player rolls each stat
 * once — and every draft row the GM's „Wyrzuć szkic", the only way a player's
 * creation starts over.
 *
 * Until naprawa 2b this list lived inside the creator; it is pushed by the
 * server now and the tab counts what waits for the GM. Terms are applied with
 * a button, not on a select's change: a keyboard walks a closed select with
 * the arrows, and every step would have been a decision.
 */
export function CreationRankPanel() {
  const rows = useCreationRankStore((s) => s.rows);
  const permits = useCreationRankStore((s) => s.permits);
  if (rows.length === 0 && permits.length === 0) return null;
  const waiting = waitingRankCount(rows, permits);

  return (
    <section className="creation-ranks" aria-label="Nowe postaci graczy">
      <h4 className="creation-ranks-title">
        Nowe postaci graczy
        {waiting > 0 && <span className="side-tab-badge">{waiting}</span>}
      </h4>
      {permits.length > 0 && (
        <>
          <p className="creation-ranks-hint">
            Zgoda to jedna postać na Twoich warunkach: metoda, Ranga Postaci (pula Cech Kompletnego
            Pakietu) i pula umiejętności. Gracz przed startem czyta zasady.
          </p>
          <ul className="creation-ranks-list">
            {permits.map((row) => (
              <CreationPermitRowView key={row.userId} row={row} />
            ))}
          </ul>
        </>
      )}
      {rows.length > 0 && (
        <>
          <p className="creation-ranks-hint">
            Szkice w toku. Warunki możesz zmienić — rozdzielone punkty nie przepadają, kreator
            pokaże nadwyżkę albo brak. Przerzut zdejmuje wylosowaną Cechę Krawędziarza.
          </p>
          <ul className="creation-ranks-list">
            {rows.map((row) => (
              <CreationDraftRow key={row.id} row={row} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Terms for a request that has none yet: the book's default rank and skill budget. */
function defaultTerms(data: CpredCreationData): CreationTerms {
  return {
    method: 'complete',
    statRankId: data.defaultStatRankId || (data.statRanks[0]?.id ?? ''),
    skillPoints: data.skillPoints,
  };
}

/** The draft's terms as the list reports them. */
function draftTerms(row: CreationRankDraft, data: CpredCreationData): CreationTerms {
  return {
    method: row.method,
    statRankId: row.statRankId ?? defaultTerms(data).statRankId,
    skillPoints: row.skillPoints,
  };
}

function sameTerms(a: CreationTerms, b: CreationTerms): boolean {
  return a.method === b.method && a.statRankId === b.statRankId && a.skillPoints === b.skillPoints;
}

/**
 * Method, rank and skill budget in one line. The skill field keeps what is
 * typed; `onChange` gets a number only when it is a budget the server takes.
 */
function TermsEditor({
  value,
  onChange,
  who,
  disabled,
}: {
  value: CreationTerms;
  onChange: (terms: CreationTerms) => void;
  who: string;
  disabled: boolean;
}) {
  const registry = useCharacterStore((s) => s.registry);
  const data = creationDataOf(registry);
  const [skillText, setSkillText] = useState(String(value.skillPoints));
  useEffect(() => setSkillText(String(value.skillPoints)), [value.skillPoints]);

  return (
    <span className="creation-terms">
      <select
        aria-label={`Metoda tworzenia: ${who}`}
        value={value.method}
        disabled={disabled}
        onChange={(event) =>
          onChange({ ...value, method: event.target.value as CreationTerms['method'] })
        }
      >
        <option value="edgerunner">{CPRED_CREATION_METHOD_LABELS.edgerunner}</option>
        <option value="complete">{CPRED_CREATION_METHOD_LABELS.complete}</option>
      </select>
      {value.method === 'complete' && (
        <select
          aria-label={`Ranga Postaci: ${who}`}
          value={value.statRankId}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, statRankId: event.target.value })}
        >
          {data.statRanks.map((rank) => (
            <option key={rank.id} value={rank.id}>
              {rank.name} — {rank.points} pkt Cech
            </option>
          ))}
        </select>
      )}
      <label className="creation-terms-skills">
        <input
          type="number"
          aria-label={`Pula umiejętności: ${who}`}
          min={CREATION_SKILL_POOL_MIN}
          max={CREATION_SKILL_POOL_MAX}
          value={skillText}
          disabled={disabled}
          onChange={(event) => {
            setSkillText(event.target.value);
            const next = Number(event.target.value);
            if (isCreationSkillPool(next)) onChange({ ...value, skillPoints: next });
          }}
        />
        <span title={`W podręczniku zawsze ${data.skillPoints}`}>pkt umiejętności</span>
      </label>
    </span>
  );
}

/** A player asking for a new character, or holding a consent not used yet. */
function CreationPermitRowView({ row }: { row: CreationPermitRow }) {
  const registry = useCharacterStore((s) => s.registry);
  const data = creationDataOf(registry);
  const [terms, setTerms] = useState<CreationTerms>(row.terms ?? defaultTerms(data));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Another GM window, or this one's own answer, moves the stored terms.
  useEffect(() => {
    if (row.terms) setTerms(row.terms);
  }, [row.terms]);

  async function answer(grant: boolean) {
    setSaving(true);
    setError(null);
    const ack = await answerCreationRequest(row.userId, grant, grant ? terms : undefined);
    setSaving(false);
    if (!ack.ok) setError(creationErrorText(ack.error));
  }

  const requested = row.status === 'requested';
  const changed = row.terms === null || !sameTerms(terms, row.terms);
  return (
    <li className={`creation-rank-row${requested ? ' creation-rank-row--waiting' : ''}`}>
      <span className="creation-rank-who">
        <strong>{row.userName}</strong>
      </span>
      <span className="creation-rank-state">
        {requested
          ? 'prosi o nową postać'
          : row.rulesAccepted
            ? 'zgoda — zasady przeczytane'
            : 'zgoda — czeka na gracza'}
      </span>
      <TermsEditor value={terms} onChange={setTerms} who={row.userName} disabled={saving} />
      {requested ? (
        <>
          <button
            type="button"
            className="small-button small-button--primary"
            disabled={saving}
            onClick={() => void answer(true)}
          >
            Zgoda
          </button>
          <button
            type="button"
            className="small-button"
            disabled={saving}
            onClick={() => void answer(false)}
          >
            Odmowa
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="small-button"
            disabled={saving || !changed}
            onClick={() => void answer(true)}
          >
            Zapisz warunki
          </button>
          <button
            type="button"
            className="small-button"
            disabled={saving}
            onClick={() => void answer(false)}
            title="Gracz nie zaczął jeszcze szkicu — zgoda wraca do Ciebie"
          >
            Cofnij zgodę
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="auth-error creation-rank-error">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * One player's draft in progress: its terms (editable), the dice of a
 * Krawędziarz with „Pozwól przerzucić", and „Wyrzuć szkic".
 */
function CreationDraftRow({ row }: { row: CreationRankDraft }) {
  const registry = useCharacterStore((s) => s.registry);
  const data = creationDataOf(registry);
  const stored = draftTerms(row, data);
  const [terms, setTerms] = useState<CreationTerms>(stored);
  const [choice, setChoice] = useState<'all' | CpredStatId>('all');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const storedKey = `${stored.method}|${stored.statRankId}|${stored.skillPoints}`;
  // Another GM window, or this one's own save, moves the stored terms.
  useEffect(() => {
    const [method, statRankId, skillPoints] = storedKey.split('|');
    setTerms({
      method: method as CreationTerms['method'],
      statRankId: statRankId ?? '',
      skillPoints: Number(skillPoints),
    });
  }, [storedKey]);
  const rolled = CPRED_STAT_IDS.filter((id) => row.rolledStats.includes(id));
  // A stat the player has not thrown yet (or one just let go) leaves the list.
  useEffect(() => {
    if (choice !== 'all' && !row.rolledStats.includes(choice)) setChoice('all');
  }, [choice, row.rolledStats]);
  const who = row.characterName ? `${row.userName} · ${row.characterName}` : row.userName;
  const waitingRank = row.method === 'complete' && !row.rankApproved;
  // An old draft (from before 24.09) has no terms until the GM saves them.
  const changed = !sameTerms(terms, stored) || waitingRank || !row.methodFixed;

  async function saveTerms() {
    setSaving(true);
    setError(null);
    const ack = await setCreationTerms(row.id, terms);
    setSaving(false);
    if (!ack.ok) setError(creationErrorText(ack.error));
  }

  async function reroll() {
    setSaving(true);
    setError(null);
    const ack = await rerollCreationStats(row.id, choice === 'all' ? undefined : choice);
    setSaving(false);
    if (!ack.ok) setError(creationErrorText(ack.error));
  }

  return (
    <li className={`creation-rank-row${waitingRank ? ' creation-rank-row--waiting' : ''}`}>
      <span className="creation-rank-who">
        <strong>{row.userName}</strong>
        {row.characterName ? ` · ${row.characterName}` : ' · bez ksywy'}
      </span>
      <span className="creation-rank-state">
        {waitingRank
          ? 'czeka na rangę'
          : row.method === 'edgerunner'
            ? `Cechy ${rolled.length}/${CPRED_STAT_IDS.length}`
            : 'w toku'}
      </span>
      <TermsEditor value={terms} onChange={setTerms} who={who} disabled={saving} />
      <button
        type="button"
        className={`small-button${waitingRank ? ' small-button--primary' : ''}`}
        disabled={saving || !changed}
        onClick={() => void saveTerms()}
        title={
          terms.method !== row.method
            ? 'Zmiana metody działa jak u gracza: kreator odrzuci to, czego nowa metoda nie opłaci — wylosowane Cechy zostają'
            : undefined
        }
      >
        {waitingRank ? 'Zatwierdź warunki' : 'Zapisz warunki'}
      </button>
      {row.method === 'edgerunner' && (
        <span className="creation-terms">
          <select
            aria-label={`Co przerzucić: ${who}`}
            value={choice}
            disabled={saving || rolled.length === 0}
            onChange={(event) => setChoice(event.target.value as 'all' | CpredStatId)}
          >
            <option value="all">Wszystkie wylosowane</option>
            {rolled.map((id) => (
              <option key={id} value={id}>
                {CPRED_STAT_LABELS[id].name} ({CPRED_STAT_LABELS[id].abbr})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="small-button"
            disabled={saving || rolled.length === 0}
            onClick={() => void reroll()}
          >
            Pozwól przerzucić
          </button>
        </span>
      )}
      <DiscardDraftButton draftId={row.id} who={who} onError={setError} />
      {error && (
        <p role="alert" className="auth-error creation-rank-error">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * The GM's „Wyrzuć szkic" for a player's draft — the only way a player's
 * creation starts over (decyzja MG z 24.09). The second click confirms; a
 * browser `confirm` would freeze the table's automation and looks foreign.
 */
function DiscardDraftButton({
  draftId,
  who,
  onError,
}: {
  draftId: string;
  who: string;
  onError: (error: string | null) => void;
}) {
  const [armed, setArmed] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  async function discard() {
    setSaving(true);
    onError(null);
    const ack = await discardPlayerDraft(draftId);
    setSaving(false);
    setArmed(false);
    if (!ack.ok) onError(creationErrorText(ack.error));
  }

  return (
    <button
      type="button"
      className={`small-button${armed ? ' small-button--danger' : ''}`}
      disabled={saving}
      aria-label={armed ? `Na pewno wyrzucić szkic: ${who}?` : `Wyrzuć szkic: ${who}`}
      title="Kasuje szkic gracza; nowa postać zacznie się od nowej prośby"
      onClick={() => (armed ? void discard() : setArmed(true))}
    >
      {armed ? 'Na pewno?' : '🗑 Wyrzuć szkic'}
    </button>
  );
}
