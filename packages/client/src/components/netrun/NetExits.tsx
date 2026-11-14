import type { CpredNetPosition, NetExitView, NetRunView } from '@vtt/shared';
import { FLOOR_GLYPHS, floorName } from './net-glyphs.js';

/**
 * „Niżej: ?”, „Niżej: 🔒 Hasło serwisowe”, „Odnoga: ☠ Strażnik — Piekielny Ogar”.
 * Nazwy Programów przychodzą tylko z wyjściem znanym ze Zwiadu albo z pobytu.
 */
function exitLabel(exit: NetExitView): { door: string; behind: string } {
  const door = exit.branch ? (exit.branchName ? `Odnoga „${exit.branchName}”` : 'Odnoga') : 'Niżej';
  const programs = exit.programs?.length ? ` — ${exit.programs.join(', ')}` : '';
  const behind =
    exit.kind === undefined
      ? '?'
      : `${FLOOR_GLYPHS[exit.kind]} ${floorName({ kind: exit.kind, ...(exit.label ? { label: exit.label } : {}) })}${programs}`;
  return { door, behind };
}

function exitTitle(exit: NetExitView): string {
  if (exit.blocked) return 'Hasło pod stopami blokuje zjazd — najpierw złam je Backdoorem';
  if (exit.knowledge === 'unknown') {
    return 'Nieznane piętro — Zwiad powie, co tam jest. Zjazd nie kosztuje Akcji Sieciowej';
  }
  const programs = exit.programs?.length ? ` Czeka tam: ${exit.programs.join(', ')}.` : '';
  if (exit.knowledge === 'scouted') {
    return `Znane ze Zwiadu.${programs} Zjazd nie kosztuje Akcji Sieciowej`;
  }
  return `Już tam byłeś.${programs} Zjazd nie kosztuje Akcji Sieciowej`;
}

/**
 * Wyjścia z piętra (etap 70a): „Wyżej”, gdy jest dokąd, i po jednym przycisku
 * na każde piętro bezpośrednio pod spodem. Rozwidlenie widać dopiero stąd.
 *
 * Nieznane wyjście nie ma w ładunku ani rodzaju, ani nazwy — przycisk pisze
 * „?”, bo nic więcej nie przyszło. Brak wyjść w dół to koniec tej kolumny.
 */
export function NetExits({
  exits,
  busy,
  onMove,
}: {
  exits: NetRunView['exits'];
  busy: boolean;
  onMove: (to: CpredNetPosition) => void;
}) {
  return (
    <div className="net-exits" role="group" aria-label="Wyjścia z tego piętra">
      {exits.up && (
        <button
          type="button"
          className="small-button net-exit net-exit--up"
          disabled={busy}
          title="Piętro wyżej — ruch po Architekturze nie kosztuje Akcji Sieciowej"
          onClick={() => onMove(exits.up!)}
        >
          ▲ Wyżej
        </button>
      )}
      {exits.down.map((exit) => {
        const { door, behind } = exitLabel(exit);
        return (
          <button
            key={`${exit.to.branchId}:${exit.to.floor}`}
            type="button"
            className={`small-button net-exit net-exit--down net-exit--${exit.knowledge}`}
            disabled={busy || exit.blocked === true}
            title={exitTitle(exit)}
            onClick={() => onMove(exit.to)}
          >
            ▼ {door}: <span className="net-exit-behind">{behind}</span>
          </button>
        );
      })}
      {exits.down.length === 0 && <span className="net-exit-end">Dalej nie ma zejścia.</span>}
    </div>
  );
}
