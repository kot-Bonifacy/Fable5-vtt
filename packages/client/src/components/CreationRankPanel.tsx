import { useEffect, useState } from 'react';
import type { CpredCreationRank, CreationRankDraft } from '@vtt/shared';
import { creationDataOf } from '@vtt/shared';
import { creationErrorText, setCreationRank } from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useCreationRankStore, waitingRankCount } from '../stores/creationRankStore.js';

/**
 * The GM's ranks for players' Kompletny Pakiet drafts (naprawa 2b), on the
 * „Postacie" tab. Until 2b the list lived inside the creator, so the GM had to
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

  return (
    <section className="creation-ranks" aria-label="Rangi szkiców postaci">
      <h4 className="creation-ranks-title">
        Szkice postaci: Ranga Postaci
        {waiting > 0 && <span className="side-tab-badge">{waiting}</span>}
      </h4>
      <p className="creation-ranks-hint">
        Ranga ustala pulę punktów Cech Kompletnego Pakietu. Gracz nie wpisze Cech, dopóki jej nie
        zatwierdzisz; zmiana później nie kasuje rozdzielonych punktów.
      </p>
      <ul className="creation-ranks-list">
        {rows.map((row) => (
          <CreationRankRow key={row.id} row={row} ranks={ranks} />
        ))}
      </ul>
    </section>
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
