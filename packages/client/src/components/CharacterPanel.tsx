import { useEffect, useState, type FormEvent } from 'react';
import type { CampaignDetail, CpredCharacterData } from '@vtt/shared';
import { ROLE_GM, cyberpsychosisFor, formatEddies } from '@vtt/shared';
import { apiGet } from '../api.js';
import { confirmDestructive } from '../confirm.js';
import {
  createCharacter,
  deleteCharacter,
  economyErrorText,
  settleMonth,
  updateCharacter,
} from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { ensureCpredDataLoaded, useCharacterStore } from '../stores/characterStore.js';
import { useCreationStore } from '../stores/creationStore.js';
import { useMapToolStore } from '../stores/mapToolStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { plural } from '../plural.js';

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
  const openCreator = useCreationStore((s) => s.openCreator);

  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [newName, setNewName] = useState('');
  const [newOwnerId, setNewOwnerId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [settlement, setSettlement] = useState<string | null>(null);

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

  /** Start-of-session ritual (RAW): every pool back to its maximum. */
  async function refreshAllLuck() {
    const store = useCharacterStore.getState();
    const stale = store.order
      .map((id) => store.characters[id])
      .filter((character) => character && character.data.luckCurrent < character.data.stats.luck);
    if (stale.length === 0) return;
    const who = plural(stale.length, 'postaci', 'postaciom', 'postaciom');
    if (!window.confirm(`Odnowić pulę Szczęścia ${who} (nowa sesja)?`)) return;
    for (const character of stale) {
      if (!character) continue;
      const ack = await updateCharacter(character.id, {
        data: { luckCurrent: character.data.stats.luck },
      });
      if (!ack.ok) {
        setError(ackErrorText(ack.error));
        return;
      }
    }
  }

  /** The first of the month (stage 23b) — preview first, then the real thing. */
  async function runSettlement(preview: boolean) {
    if (
      !preview &&
      !window.confirm('Pobrać Poziom życia i czynsz wszystkim postaciom z ustawionym rachunkiem?')
    ) {
      return;
    }
    const ack = await settleMonth({ preview });
    if (!ack.ok || !ack.data) {
      setSettlement(economyErrorText(ack.ok ? undefined : ack.error));
      return;
    }
    const { charged, shortfall, settled, skipped } = ack.data;
    setSettlement(
      `${preview ? 'Do pobrania' : 'Pobrano'} ${formatEddies(charged)} ed od ${settled} postaci` +
        (shortfall > 0 ? ` · niedopłata ${formatEddies(shortfall)} ed` : '') +
        (skipped > 0 ? ` · pominięto ${skipped} bez Poziomu życia` : '') +
        '. Szczegóły na czacie.',
    );
  }

  async function removeCharacter(characterId: string, name: string) {
    if (!confirmDestructive(`Usunąć postać „${name}”?`)) return;
    const ack = await deleteCharacter(characterId);
    if (!ack.ok) setError(ackErrorText(ack.error));
  }

  const roleName = (roleId: string | null) =>
    registry.roles.find((r) => r.id === roleId)?.name ?? '';
  const ownerName = (ownerId: string | null) =>
    ownerId === null ? 'NPC' : (players.find((p) => p.id === ownerId)?.name ?? 'gracz');

  return (
    <div className="character-panel">
      {isGm && order.length > 0 && (
        <div className="character-panel-actions">
          <button
            type="button"
            className="small-button"
            onClick={() => void refreshAllLuck()}
            title="Ustawia pulę Szczęścia wszystkich postaci na maksimum (start sesji)"
          >
            ↻ Odnów Szczęście wszystkim
          </button>
          {/* Stage 23b. Two clicks on purpose: the preview lists the bill for
              every sheet with a Lifestyle and touches nothing, and only the
              second press moves money — a mis-click here empties wallets. */}
          <button
            type="button"
            className="small-button"
            onClick={() => void runSettlement(true)}
            title="Podgląd: ile zejdzie każdej postaci pierwszego dnia miesiąca (nic nie pobiera)"
          >
            Podgląd miesiąca
          </button>
          <button
            type="button"
            className="small-button"
            onClick={() => void runSettlement(false)}
            title="Pobiera Poziom życia i czynsz wszystkim postaciom, które je mają ustawione"
          >
            💸 Rozlicz miesiąc
          </button>
        </div>
      )}
      {settlement ? <p className="character-panel-note">{settlement}</p> : null}
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
                    <span className="character-row-name">
                      {character.name}
                      <CyberpsychosisChip data={character.data} />
                    </span>
                    <span className="character-row-meta">
                      {roleName(character.data.roleId) || '—'}
                      {isGm ? ` · ${ownerName(character.ownerId)}` : ''}
                    </span>
                  </span>
                </button>
                {isGm && (
                  <span className="character-row-actions">
                    <PlaceOnSceneButton
                      characterId={id}
                      name={character.name}
                      portraitUrl={character.portraitUrl}
                      ownerId={character.ownerId}
                    />
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
                      aria-label="Usuń postać"
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

      {/* Stage 25a. Two doors on purpose: the wizard for a character somebody
          will play, and the one-line form below for the mannequin a GM needs
          on the map in five seconds. */}
      <button
        type="button"
        className="small-button character-creator-open"
        onClick={() => void openCreator()}
        title="Kreator: Rola, Cechy i Umiejętności wg zasad podręcznika"
      >
        🧬 Kreator postaci…
      </button>

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

/**
 * How close this character is to the Edge (stage 23a), on the list rather than
 * only inside their sheet — the GM has to see „kto stoi na granicy" without
 * opening five windows. Silent above EMP 2, which is where the rules go quiet
 * too (s. 232).
 */
function CyberpsychosisChip({ data }: { data: CpredCharacterData }) {
  const state = cyberpsychosisFor(data.humanityCurrent);
  if (state.level === 'none') return null;
  return (
    <span className={`character-psychosis character-psychosis--${state.level}`} title={state.note}>
      EMP {state.emp} · {state.label}
    </span>
  );
}

/**
 * „Postaw na scenie" — druga droga do żetonu postaci (28.08).
 *
 * Do tej pory żeton związany z kartą powstawał **wyłącznie** w kreatorze
 * (`creation.ts` woła `createCharacterToken`). Kto skasował żeton — albo dostał
 * kartę zaimportowaną, nie zbudowaną — nie miał jak dorobić drugiego: panel
 * „Tokeny" stawia same krążki z biblioteki, a `token:create` przyjmuje
 * `characterId` od zawsze, tylko nikt go z UI nie podawał. Wyszło przy
 * odtwarzaniu „Kolca" na Poligonie: karta stała nietknięta, figury nie było
 * i jedyną drogą była konsola.
 *
 * Portret idzie na żeton, a właściciel przepisuje się z karty — te same dwie
 * decyzje, które podejmuje kreator, żeby żeton dorobiony ręcznie niczym się nie
 * różnił od postawionego automatem.
 */
function PlaceOnSceneButton({
  characterId,
  name,
  portraitUrl,
  ownerId,
}: {
  characterId: string;
  name: string;
  portraitUrl: string | null;
  ownerId: string | null;
}) {
  const armed = useMapToolStore((s) => s.tokenPlacement?.characterId === characterId);
  // Figura tej postaci już na scenie — przycisk nadal działa (dubler bywa
  // potrzebny), ale mówi, że to będzie druga.
  const onScene = useTokenStore((s) =>
    Object.values(s.tokens).some((token) => token.characterId === characterId),
  );

  return (
    <button
      type="button"
      className={`small-button ${armed ? 'small-button--armed' : ''}`}
      onClick={() =>
        useMapToolStore
          .getState()
          .setTokenPlacement(armed ? null : { name, imageUrl: portraitUrl, characterId, ownerId })
      }
      title={
        armed
          ? 'Kliknij na mapie, żeby postawić figurę (Esc anuluje)'
          : onScene
            ? `Ta postać ma już figurę na scenie — postawi się druga`
            : 'Postaw figurę tej postaci na aktywnej scenie'
      }
      aria-label={`Postaw na scenie: ${name}`}
    >
      {armed ? '◎' : '⊕'}
    </button>
  );
}
