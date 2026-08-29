import { useState } from 'react';
import {
  CPRED_BACKUP_ABILITY,
  cpredBackupTiersFor,
  cpredRoleAbilityRank,
  describeBackupTier,
} from '@vtt/shared';
import { callBackup } from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';

/**
 * Wezwanie Wsparcia (etap 30c, s. 158).
 *
 * Panel jest listą kategorii, bo taka jest decyzja: „Stróż Prawa może wezwać na
 * pomoc grupę Wsparcia o poziomie **równym lub niższym** wartości Zdolności
 * Specjalnej" — czyli wybór, a nie automat. Rzut jest zawsze ten sam (1k10 ≤
 * ranga), więc wezwanie krawężników zamiast C-SWAT-u nie jest łatwiejsze; jest
 * cichsze, tańsze w konsekwencjach i czasem właśnie o to chodzi.
 *
 * Jeden komponent w dwóch domach, jak panel Zmysłu Walki: karta postaci
 * i pasek akcji nad mapą. To ta sama decyzja podejmowana w dwóch momentach gry.
 */
export function BackupPanel({
  characterId,
  tokenId,
  onDone,
}: {
  characterId: string;
  /** Figura, która płaci Akcję i przy której staną funkcjonariusze. */
  tokenId?: string;
  onDone?: () => void;
}) {
  const character = useCharacterStore((s) => s.characters[characterId] ?? null);
  const registry = useCharacterStore((s) => s.registry);
  const rank = character
    ? cpredRoleAbilityRank(character.data, registry, CPRED_BACKUP_ABILITY)
    : null;
  const [calling, setCalling] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (!character || rank === null) return null;
  const tiers = cpredBackupTiersFor(rank);

  async function call(level: number, tierId: string): Promise<void> {
    setCalling(tierId);
    setNote(null);
    const result = await callBackup(characterId, level, tokenId);
    setCalling(null);
    if (!result.ok) return;
    if (!result.answered) {
      setNote('Nikt nie odpowiedział. W kolejnej Turze możesz spróbować znowu.');
      return;
    }
    setNote(
      result.secondGroup
        ? `Odsiecz w drodze — i to dwie grupy. MG wskaże drugą kategorię.`
        : `Odsiecz w drodze: ${result.rounds ?? '?'} Rund.`,
    );
    onDone?.();
  }

  return (
    <div className="awareness">
      <header className="awareness-head">
        <h4>Wsparcie {rank}</h4>
        <p className="awareness-left">
          {tiers.length === 1
            ? 'Jedna kategoria w zasięgu'
            : `Kategorie w zasięgu: ${tiers.length}`}
        </p>
      </header>
      <ul className="awareness-list">
        {tiers.map((tier) => (
          <li key={tier.id} className="awareness-row backup-row">
            <span className="awareness-name" title={`${tier.description} (s. ${tier.page})`}>
              {tier.name}
              <small className="backup-stats">
                {' '}
                ×{tier.count} · {describeBackupTier(tier)}
              </small>
            </span>
            <span className="awareness-steps">
              <button
                type="button"
                onClick={() => void call(tier.minLevel, tier.id)}
                disabled={calling !== null}
                title={`Wezwij: ${tier.name} — ${tier.loadout}`}
                aria-label={`Wezwij: ${tier.name}`}
              >
                {calling === tier.id ? '…' : 'Wezwij'}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {note && <p className="awareness-hint">{note}</p>}
      <p className="awareness-hint">
        Wezwanie kosztuje Akcję i udaje się na 1k10 ≤ {rank}. Potem 1k6 decyduje, ile Rund potrwa
        dojazd; szóstka przysyła kategorię wyżej. Nadużywanie kosztuje posadę (s. 158).
      </p>
    </div>
  );
}
