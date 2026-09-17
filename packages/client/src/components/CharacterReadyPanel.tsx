import { useState } from 'react';
import { cpredRoleChores } from '@vtt/shared';
import { setCharacterPlayReady } from '../socket.js';
import { useCharacterStore, type CharacterSheetView } from '../stores/characterStore.js';
import { RoleChoresList } from './RoleChores.js';

/**
 * Postaci, które wyszły z kreatora i czekają na MG (naprawa 3c).
 *
 * MG zgłosił w audycie (A10), że „Rola na randze 4" wygląda na skończoną
 * konfigurację, a nią nie jest — kreator nie rozdziela punktów Zmysłu Walki,
 * nie obsadza zespołu Korpo, nie wybiera Taboru ani cyberdeku. Ta lista mówi
 * mu o tym **zanim** zacznie się sesja: wiersz na postać, pod nim to, czego
 * brakuje, i przycisk „Przyjmij do gry".
 *
 * Znacznik niczego nie blokuje (decyzja MG z 17.09) — gracz może grać i
 * uzupełniać kartę dalej. Lista znika, gdy nikt nie czeka; gotowość cofa się
 * z samej karty, żeby ta lista nie rosła bez końca.
 */
export function useWaitingCharacters(isGm: boolean): CharacterSheetView[] {
  const characters = useCharacterStore((s) => s.characters);
  const order = useCharacterStore((s) => s.order);
  if (!isGm) return [];
  return order
    .map((id) => characters[id])
    .filter((row): row is CharacterSheetView => !!row && !row.playReady);
}

export function CharacterReadyPanel({ rows }: { rows: CharacterSheetView[] }) {
  if (rows.length === 0) return null;

  return (
    <section className="creation-ready" aria-label="Postaci czekające na przyjęcie do gry">
      <h4 className="creation-ranks-title">
        Nowe postaci: gotowość do gry
        <span className="side-tab-badge">{rows.length}</span>
      </h4>
      <p className="creation-ranks-hint">
        Karty prosto z kreatora. Znacznik niczego nie blokuje — mówi tylko, że gracz skończył, a
        Rola zostawiła jeszcze decyzje. „Przejdź” otwiera właściwy panel karty.
      </p>
      <ul className="creation-ranks-list">
        {rows.map((row) => (
          <ReadyRow key={row.id} character={row} />
        ))}
      </ul>
    </section>
  );
}

function ReadyRow({ character }: { character: CharacterSheetView }) {
  const registry = useCharacterStore((s) => s.registry);
  const openSheet = useCharacterStore((s) => s.openSheet);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chores = cpredRoleChores(character.data, registry);
  const role = registry.roles.find((entry) => entry.id === character.data.roleId)?.name;

  async function approve() {
    setBusy(true);
    setError(null);
    const ack = await setCharacterPlayReady(character.id, true);
    setBusy(false);
    if (!ack.ok) setError(`Nie udało się zapisać gotowości: ${ack.error}`);
  }

  return (
    <li className="creation-rank-row creation-rank-row--waiting creation-ready-row">
      <span className="creation-rank-who">
        <strong>{character.name}</strong>
        {role ? ` · ${role}` : ''}
      </span>
      <span className="creation-rank-state">
        {chores.length === 0 ? 'nic nie zostało' : `zostało: ${chores.length}`}
      </span>
      <button type="button" className="small-button" onClick={() => openSheet(character.id)}>
        Pokaż kartę
      </button>
      <button
        type="button"
        className="small-button small-button--primary"
        disabled={busy}
        onClick={() => void approve()}
      >
        Przyjmij do gry
      </button>
      <div className="creation-ready-chores">
        <RoleChoresList chores={chores} characterId={character.id} />
      </div>
      {error && (
        <p role="alert" className="auth-error creation-rank-error">
          {error}
        </p>
      )}
    </li>
  );
}
