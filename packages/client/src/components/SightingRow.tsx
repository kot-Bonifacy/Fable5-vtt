import type { CpredSighting, SightingLogEntry } from '@vtt/shared';
import { cpredSightingLine } from '@vtt/shared';
import { useSightingStore } from '../stores/sightingStore.js';

/**
 * Karta oględzin na czacie (etap 41) — to, co zdany Test Percepcji pokazał.
 *
 * Karta jest **prywatna**: dochodzi do tego, kto patrzył, i do MG. Rzut, który
 * ją poprzedził, bywa jawny i zwykle jest — stół widzi, że ktoś się przygląda
 * i czy mu wyszło. Widzi natomiast wynik rzutu, a nie treść: liczby zdobyte
 * spojrzeniem należą do postaci, która je zdobyła, a stół dowiaduje się ich
 * wtedy, gdy ona je powie.
 *
 * Karta jest też **pamięcią**: po przeładowaniu strony gracz nadal ma to, co
 * wypatrzył, i okno oględzin czyta liczby właśnie stąd — bez rzucania po raz
 * drugi. Dlatego wiersz jest krótki i klikalny: pełna lista mieszka w oknie,
 * a tutaj stoi zdanie i droga do niego.
 */
export function SightingRow({ entry }: { entry: SightingLogEntry }) {
  const open = useSightingStore((s) => s.open);
  const sighting = entry.sighting as unknown as CpredSighting;

  return (
    <div className="chat-message chat-sighting" data-testid="sighting-card">
      <div className="chat-message-meta">
        <span className="chat-message-author">Oględziny</span>
        <span className="chat-roll-gm-label">{entry.actor}</span>
      </div>
      <div className="chat-action-body">
        <span className="chat-action-name">{entry.target}</span>
      </div>
      <p className="chat-sighting-line">{cpredSightingLine(sighting)}</p>
      <div className="chat-note-actions">
        <button
          type="button"
          className="small-button"
          onClick={() => open(entry.targetTokenId)}
          title="Otwórz pełną listę tego, co widać"
        >
          Pokaż wszystko
        </button>
      </div>
    </div>
  );
}
