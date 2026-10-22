import { useEffect } from 'react';
import type { CharacterView } from '@vtt/shared';
import { noteAck } from '../notices.js';
import { updateCharacter } from '../socket.js';
import { useCampaignPlayersStore } from '../stores/campaignPlayersStore.js';

function assignErrorText(code: string): string {
  return code === 'OWNER_NOT_FOUND'
    ? 'Ten gracz nie należy już do kampanii — odśwież listę.'
    : `Nie udało się przypisać karty (${code}).`;
}

/**
 * „Czeka na gracza” (etap 57a, decyzja MG 3) — pasek pod belką karty MG, gdy
 * karta gracza przyszła z pliku, a jej gracza w tej kampanii nie ma.
 *
 * Gracz o tym samym imieniu przy stole — jeden klik „Przypisz”. Inaczej lista
 * graczy (wybór to przypisanie), a gdy nikogo jeszcze nie ma — wskazówka, że
 * kartę daje się też linkiem „Nowy gracz”. Przypisanie idzie zwykłym
 * `character:update`, więc figury karty przechodzą do gracza jak zawsze.
 */
export function PendingOwnerStrip({ character }: { character: CharacterView }) {
  const players = useCampaignPlayersStore((s) => s.players);
  const pending = character.pendingOwner ?? null;

  useEffect(() => {
    if (pending) void useCampaignPlayersStore.getState().load();
  }, [pending]);

  if (!pending) return null;
  const match = players.find(
    (player) => player.name.toLocaleLowerCase('pl') === pending.toLocaleLowerCase('pl'),
  );

  async function assign(ownerId: string) {
    if (!ownerId) return;
    noteAck('character', await updateCharacter(character.id, { ownerId }), assignErrorText);
  }

  return (
    <div className="sheet-pending-owner" role="status">
      <span className="sheet-pending-owner-text">
        Karta z pliku czeka na gracza <strong>„{pending}”</strong>.
      </span>
      {match ? (
        <button type="button" className="small-button" onClick={() => void assign(match.id)}>
          Przypisz: {match.name}
        </button>
      ) : players.length > 0 ? (
        <select
          className="sheet-pending-owner-select"
          value=""
          aria-label="Przypisz kartę graczowi"
          onChange={(event) => void assign(event.target.value)}
        >
          <option value="">Przypisz graczowi…</option>
          {players.map((player) => (
            <option key={player.id} value={player.id}>
              {player.name}
            </option>
          ))}
        </select>
      ) : (
        <span className="sheet-pending-owner-hint">
          Wystaw link „Nowy gracz” w Panelu MG i wybierz przy nim tę kartę.
        </span>
      )}
    </div>
  );
}
