import { useEffect, useState } from 'react';
import type { CpredCreationRank, CpredStatId, CreationRankDraft } from '@vtt/shared';
import { CPRED_STAT_IDS, CPRED_STAT_LABELS, creationDataOf } from '@vtt/shared';
import { creationErrorText, rerollCreationStats, setCreationRank } from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useCreationRankStore, waitingRankCount } from '../stores/creationRankStore.js';

/**
 * The GM's view of players' drafts, on the „Postacie" tab: ranks for
 * Kompletny Pakiet (naprawa 2b) and, since 24.09, „Pozwól przerzucić" for a
 * Krawędziarz — a player rolls each stat once and only the GM lets them throw
 * again.
 * Until 2b the list lived inside the creator, so the GM had to
 * open the wizard — which starts a draft of his own — and press „Odśwież" to
 * learn that somebody was waiting. The list is now pushed by the server and the
 * tab counts the drafts still waiting.
 *
 * A rank is applied with a button, not on the select's change: a keyboard walks
 * a closed select with the arrows, and every step would have approved a pool.
 */
export function CreationRankPanel() {
  const rows = useCreationRankStore((s) => s.rows);
  const registry = useCharacterStore((s) => s.registry);
  const ranks = creationDataOf(registry).statRanks;
  if (rows.length === 0) return null;
  const waiting = waitingRankCount(rows);
  const complete = rows.filter((row) => row.method === 'complete');
  const rolled = rows.filter((row) => row.method === 'edgerunner');

  return (
    <section className="creation-ranks" aria-label="Szkice postaci graczy">
      <h4 className="creation-ranks-title">
        Szkice postaci graczy
        {waiting > 0 && <span className="side-tab-badge">{waiting}</span>}
      </h4>
      {complete.length > 0 && (
        <>
          <p className="creation-ranks-hint">
            Kompletny Pakiet: ranga ustala pulę punktów Cech. Gracz nie wpisze Cech, dopóki jej nie
            zatwierdzisz; zmiana później nie kasuje rozdzielonych punktów.
          </p>
          <ul className="creation-ranks-list">
            {complete.map((row) => (
              <CreationRankRow key={row.id} row={row} ranks={ranks} />
            ))}
          </ul>
        </>
      )}
      {rolled.length > 0 && (
        <>
          <p className="creation-ranks-hint">
            Krawędziarz: gracz rzuca każdą Cechę raz. Przerzut zdejmuje wynik, a gracz rzuca tę
            Cechę od nowa; stara karta zostaje na czacie.
          </p>
          <ul className="creation-ranks-list">
            {rolled.map((row) => (
              <CreationRerollRow key={row.id} row={row} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** One Krawędziarz draft: how far the dice got, and the GM's „Pozwól przerzucić". */
function CreationRerollRow({ row }: { row: CreationRankDraft }) {
  const [choice, setChoice] = useState<'all' | CpredStatId>('all');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rolled = CPRED_STAT_IDS.filter((id) => row.rolledStats.includes(id));
  // A stat the player has not thrown yet (or one just let go) leaves the list.
  useEffect(() => {
    if (choice !== 'all' && !row.rolledStats.includes(choice)) setChoice('all');
  }, [choice, row.rolledStats]);
  const who = row.characterName ? `${row.userName} · ${row.characterName}` : row.userName;

  async function reroll() {
    setSaving(true);
    setError(null);
    const ack = await rerollCreationStats(row.id, choice === 'all' ? undefined : choice);
    setSaving(false);
    if (!ack.ok) setError(creationErrorText(ack.error));
  }

  return (
    <li className="creation-rank-row">
      <span className="creation-rank-who">
        <strong>{row.userName}</strong>
        {row.characterName ? ` · ${row.characterName}` : ' · bez ksywy'}
      </span>
      <span className="creation-rank-state">
        Cechy {rolled.length}/{CPRED_STAT_IDS.length}
      </span>
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
      {error && (
        <p role="alert" className="auth-error creation-rank-error">
          {error}
        </p>
      )}
    </li>
  );
}

function CreationRankRow({ row, ranks }: { row: CreationRankDraft; ranks: CpredCreationRank[] }) {
  const [choice, setChoice] = useState(row.statRankId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Another GM window, or this one's own approval, moves the stored rank.
  useEffect(() => setChoice(row.statRankId ?? ''), [row.statRankId]);

  const ready = choice !== '' && (!row.rankApproved || choice !== row.statRankId);
  const who = row.characterName ? `${row.userName} · ${row.characterName}` : row.userName;

  async function approve() {
    setSaving(true);
    setError(null);
    const ack = await setCreationRank(row.id, choice);
    setSaving(false);
    if (!ack.ok) setError(creationErrorText(ack.error));
  }

  return (
    <li className={`creation-rank-row${row.rankApproved ? '' : ' creation-rank-row--waiting'}`}>
      <span className="creation-rank-who">
        <strong>{row.userName}</strong>
        {row.characterName ? ` · ${row.characterName}` : ' · bez ksywy'}
      </span>
      <span className="creation-rank-state">
        {row.rankApproved ? 'zatwierdzona' : 'czeka na rangę'}
      </span>
      <select
        aria-label={`Ranga Postaci: ${who}`}
        value={choice}
        disabled={saving}
        onChange={(event) => setChoice(event.target.value)}
      >
        <option value="" disabled>
          Wybierz rangę
        </option>
        {ranks.map((rank) => (
          <option key={rank.id} value={rank.id}>
            {rank.name} — {rank.points} pkt
          </option>
        ))}
      </select>
      <button
        type="button"
        className="small-button small-button--primary"
        disabled={!ready || saving}
        onClick={() => void approve()}
      >
        {row.rankApproved ? 'Zmień' : 'Zatwierdź'}
      </button>
      {error && (
        <p role="alert" className="auth-error creation-rank-error">
          {error}
        </p>
      )}
    </li>
  );
}
