import { useEffect, useState, type FormEvent } from 'react';
import type { CampaignDetail } from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import { apiGet } from '../api.js';
import { createCharacter, deleteCharacter, updateCharacter } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { ensureCpredDataLoaded, useCharacterStore } from '../stores/characterStore.js';

interface PlayerOption {
  id: string;
  name: string;
}

function ackErrorText(code: string): string {
  switch (code) {
    case 'INVALID_NAME':
      return 'Nieprawidłowe imię postaci (1–64 znaki).';
    case 'OWNER_NOT_FOUND':
      return 'Wybrany gracz nie należy do kampanii.';
    case 'NO_CAMPAIGN':
      return 'Brak aktywnej kampanii.';
    default:
      return `Błąd: ${code}`;
  }
}

/**
 * Side-panel tab with the campaign's characters. The GM sees all of them
 * (with owner assignment); a player sees only their own. Clicking a row opens
 * the floating sheet window.
 */
export function CharacterPanel() {
  const user = useAuthStore((s) => s.user);
  const isGm = user?.role === ROLE_GM;
  const characters = useCharacterStore((s) => s.characters);
  const order = useCharacterStore((s) => s.order);
  const registry = useCharacterStore((s) => s.registry);
  const openSheet = useCharacterStore((s) => s.openSheet);

  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [newName, setNewName] = useState('');
  const [newOwnerId, setNewOwnerId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureCpredDataLoaded();
  }, []);

  useEffect(() => {
    if (!isGm) return;
    apiGet<CampaignDetail[]>('/api/campaigns')
      .then((campaigns) => {
        const active = campaigns.find((c) => c.active);
        setPlayers(active?.players.map((p) => ({ id: p.id, name: p.name })) ?? []);
      })
      .catch(() => setPlayers([]));
  }, [isGm]);

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (name.length === 0) return;
    setError(null);
    const ack = await createCharacter(
      isGm ? { name, ownerId: newOwnerId === '' ? null : newOwnerId } : { name },
    );
    if (!ack.ok) {
      setError(ackErrorText(ack.error));
      return;
    }
    setNewName('');
    if (ack.data) openSheet(ack.data.id);
  }

  async function changeOwner(characterId: string, ownerId: string) {
    const ack = await updateCharacter(characterId, { ownerId: ownerId === '' ? null : ownerId });
    if (!ack.ok) setError(ackErrorText(ack.error));
  }

  async function removeCharacter(characterId: string, name: string) {
    if (!window.confirm(`Usunąć postać „${name}”? Tej operacji nie można cofnąć.`)) return;
    const ack = await deleteCharacter(characterId);
    if (!ack.ok) setError(ackErrorText(ack.error));
  }

  const roleName = (roleId: string | null) =>
    registry.roles.find((r) => r.id === roleId)?.name ?? '';
  const ownerName = (ownerId: string | null) =>
    ownerId === null ? 'NPC' : (players.find((p) => p.id === ownerId)?.name ?? 'gracz');

  return (
    <div className="character-panel">
      {order.length === 0 ? (
        <p className="placeholder-text">
          {isGm ? 'Brak postaci — utwórz pierwszą poniżej.' : 'Nie masz jeszcze żadnej postaci.'}
        </p>
      ) : (
        <ul className="character-list">
          {order.map((id) => {
            const character = characters[id];
            if (!character) return null;
            return (
              <li key={id} className="character-row">
                <button
                  type="button"
                  className="character-open"
                  onClick={() => openSheet(id)}
                  title="Otwórz kartę"
                >
                  {character.portraitUrl ? (
                    <img className="character-thumb" src={character.portraitUrl} alt="" />
                  ) : (
                    <span className="character-thumb character-thumb--empty" aria-hidden>
                      ◇
                    </span>
                  )}
                  <span className="character-row-text">
                    <span className="character-row-name">{character.name}</span>
                    <span className="character-row-meta">
                      {roleName(character.data.roleId) || '—'}
                      {isGm ? ` · ${ownerName(character.ownerId)}` : ''}
                    </span>
                  </span>
                </button>
                {isGm && (
                  <span className="character-row-actions">
                    <select
                      value={character.ownerId ?? ''}
                      onChange={(e) => void changeOwner(id, e.target.value)}
                      title="Właściciel postaci"
                    >
                      <option value="">NPC (MG)</option>
                      {players.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="small-button character-delete"
                      onClick={() => void removeCharacter(id, character.name)}
                      title="Usuń postać"
                    >
                      ✕
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form className="scene-editor-row character-create" onSubmit={(e) => void submitCreate(e)}>
        <input
          type="text"
          maxLength={64}
          placeholder="Imię nowej postaci"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        {isGm && (
          <select
            value={newOwnerId}
            onChange={(e) => setNewOwnerId(e.target.value)}
            title="Właściciel nowej postaci"
          >
            <option value="">NPC (MG)</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <button type="submit" className="small-button" disabled={newName.trim().length === 0}>
          Utwórz
        </button>
      </form>

      {error && <p className="auth-error">{error}</p>}
    </div>
  );
}
