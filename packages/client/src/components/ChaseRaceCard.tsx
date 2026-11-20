import type { ChaseRaceLogEntry, ChaseRaceRow, ChatMessageView } from '@vtt/shared';
import { ROLE_GM, chaseRacePending } from '@vtt/shared';
import { notifyRefusal } from '../notices.js';
import { rollChaseRaceFor, skipChaseRace } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { chaseErrorText } from './ChaseVehicleMenu.js';

/**
 * Karta „Wyścig — runda N” (etap 72c): Test przeciwstawny Prowadzenia
 * wszystkich kierowców na początku rundy pościgu. Jawna dla stołu — zryw i tak
 * widać na mapie, a gracz ma wiedzieć, z kim przegrał.
 *
 * Dopóki ktoś z graczy nie rzucił, runda stoi bez tury, a MG ma tu (i w panelu
 * decyzji) „Rzuć za…” i „Pomiń Wyścig”. Kubek gracza woła osobne wezwanie —
 * ta karta tylko mówi, na kogo stół czeka.
 */
export function ChaseRaceRowCard({
  message,
  entry,
}: {
  message: ChatMessageView;
  entry: ChaseRaceLogEntry;
}) {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const waiting = entry.status === 'waiting';
  return (
    <div
      className={`chat-message chat-race${entry.status === 'cancelled' ? ' chat-check--cancelled' : ''}`}
      data-testid="chase-race"
      data-status={entry.status}
    >
      <div className="chat-message-meta">
        <span className="chat-message-author">{chaseRaceTitle(entry)}</span>
      </div>
      <ChaseRaceSummary entry={entry} />
      {entry.status === 'cancelled' && (
        <span className="chat-action-badge">Przerwany — walka się skończyła</span>
      )}
      {waiting && isGm && <ChaseRaceDecision messageId={message.id} entry={entry} />}
    </div>
  );
}

export function chaseRaceTitle(entry: Pick<ChaseRaceLogEntry, 'round' | 'solo'>): string {
  return entry.solo ? `Zwykła jazda — runda ${entry.round}` : `Wyścig — runda ${entry.round}`;
}

/** Opis i kafle kierowców — to samo na karcie czatu i w panelu decyzji MG. */
export function ChaseRaceSummary({ entry }: { entry: ChaseRaceLogEntry }) {
  return (
    <>
      <p className="chat-race-rule">
        {entry.solo
          ? 'Słaby kierowca rzuca Test zwykłej jazdy (PT 10) — porażka to utrata kontroli na rundę.'
          : 'Test przeciwstawny Prowadzenia — zryw: kratka za każde 2 punkty nad najsłabszym, najwyżej 5.'}
      </p>
      <ul className="chat-attack-checks chat-race-rows">
        {entry.rows.map((row) => (
          <li
            key={row.vehicleId}
            className={raceRowClass(row)}
            data-testid="chase-race-row"
            data-vehicle-id={row.vehicleId}
            title={raceRowTitle(row)}
          >
            <strong>{row.vehicleName}</strong>
            {row.driverName && <span className="chat-race-driver"> · {row.driverName}</span>}
            {' — '}
            {raceRowResult(row, entry)}
          </li>
        ))}
      </ul>
    </>
  );
}

function raceRowClass(row: ChaseRaceRow): string {
  if (row.lostControl) return 'chat-attack-check--pinned';
  if (row.skipped || row.total === undefined) return 'chat-race-row--pending';
  return '';
}

function raceRowResult(row: ChaseRaceRow, entry: ChaseRaceLogEntry): string {
  if (row.skipped) return 'pominięty, bez zrywu';
  if (row.total === undefined) {
    return entry.status === 'waiting' ? 'czeka na kubek' : 'nie rzucił';
  }
  const parts = [`${row.total}`];
  if (row.lostControl) parts.push('utrata kontroli');
  else if (row.bonus !== undefined && !entry.solo) {
    parts.push(row.bonus > 0 ? `zryw +${row.bonus} kr.` : 'bez zrywu');
  } else if (row.weak && entry.status === 'done') parts.push('panuje nad autem');
  return parts.join(' · ');
}

/** Podpowiedź kafla: jak powstał wynik i kto rzucał. */
function raceRowTitle(row: ChaseRaceRow): string {
  const lines: string[] = [];
  if (row.total !== undefined) {
    const dice = (row.dice ?? []).join(' + ');
    const terms = (row.breakdown ?? []).map(
      (part) => `${part.label} ${part.value >= 0 ? '+' : '−'}${Math.abs(part.value)}`,
    );
    lines.push([dice ? `1k10: ${dice}` : '', ...terms].filter(Boolean).join(' · '));
    lines.push(
      row.by === 'player' ? 'Rzucał kubkiem' : row.by === 'gm' ? 'Rzucił MG za gracza' : 'Rzut MG',
    );
  }
  if (row.weak) lines.push('Słaby kierowca: ten rzut jest też Testem zwykłej jazdy (PT 10).');
  return lines.join('\n');
}

/** „Rzuć za…” i „Pomiń Wyścig” — MG, dopóki runda czeka (karta czatu i panel decyzji). */
export function ChaseRaceDecision({
  messageId,
  entry,
}: {
  messageId: number;
  entry: ChaseRaceLogEntry;
}) {
  const pending = chaseRacePending(entry);
  if (pending.length === 0) return null;
  return (
    <div className="chat-note-actions">
      {pending.map((row) => (
        <button
          key={row.vehicleId}
          type="button"
          className="small-button"
          title="Rzut z karty kierowcy, bez Szczęścia — gdy gracz nie może sięgnąć po kubek"
          onClick={async () => {
            const ack = await rollChaseRaceFor(messageId, row.vehicleId);
            if (!ack.ok) notifyRefusal('chase', chaseErrorText(ack.error));
          }}
        >
          Rzuć za: {row.driverName || row.vehicleName}
        </button>
      ))}
      <button
        type="button"
        className="small-button"
        title="Kto nie rzucił, jedzie bez zrywu i bez utraty kontroli; runda rusza. To samo robi „Następna tura”."
        onClick={async () => {
          const ack = await skipChaseRace(messageId);
          if (!ack.ok) notifyRefusal('chase', chaseErrorText(ack.error));
        }}
      >
        Pomiń Wyścig
      </button>
    </div>
  );
}
