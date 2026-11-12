import type { NetCombatView, NetProgramSlotView } from '@vtt/shared';
import { NET_PROGRAM_CLASS_LABELS, NET_PROGRAM_TARGET_LABELS } from '@vtt/shared';
import { plural } from '../../plural.js';

/**
 * Gniazda cyberdeku (etap 26c).
 *
 * Dwie klasy zachowują się inaczej i widać to na przycisku: Dopalacz i Obrońca
 * chodzą w tle („Uruchom" / „Zatrzymaj", po Akcji Sieciowej za każde), a Agresor
 * nie ma stanu — odpala się go atakiem i sam się wyłącza (s. 201). Dlatego przy
 * Agresorze nie ma żadnego przycisku: jest w rozwijanej liście przy LOD-zie.
 */
function DeckSlot({
  slot,
  busy,
  onToggle,
}: {
  slot: NetProgramSlotView;
  busy: boolean;
  onToggle: (rowId: string, action: 'run' | 'stop') => void;
}) {
  const attacker = slot.programClass === 'attacker';
  const running = slot.rezzedId !== undefined;
  return (
    <li className={`net-deck-slot${running && !slot.derezzed ? ' net-deck-slot--rezzed' : ''}`}>
      <span className="net-deck-name">{slot.name}</span>
      <span className="net-deck-class">
        {NET_PROGRAM_CLASS_LABELS[slot.programClass]}
        {slot.target ? ` ${NET_PROGRAM_TARGET_LABELS[slot.target]}` : ''}
        {slot.blackIce ? ' · Czarny LOD' : ''}
      </span>
      {slot.effect && <span className="net-deck-effect">{slot.effect}</span>}
      {running && (
        <span className="net-run-floor-flag">
          {slot.derezzed ? 'zderezowany' : `zrezowany · REZ ${slot.rezCurrent}/${slot.rez}`}
        </span>
      )}
      {slot.spent && <span className="net-run-floor-flag">zużyty na to wejście</span>}
      {!attacker && (
        <button
          type="button"
          className="small-button"
          disabled={busy || (!running && slot.spent === true)}
          title={
            running
              ? 'Zatrzymanie Programu kosztuje Akcję Sieciową. Zderezowany wraca dopiero po zatrzymaniu i ponownym uruchomieniu.'
              : 'Uruchomienie Programu kosztuje Akcję Sieciową'
          }
          onClick={() => onToggle(slot.rowId, running ? 'stop' : 'run')}
        >
          {running ? 'Zatrzymaj' : 'Uruchom'}
        </button>
      )}
      {attacker && slot.vsIce === 0 && (
        <span className="net-deck-note">
          {slot.target === 'antiPersonnel'
            ? 'przeciwbiałkowy — Czarnemu LOD-owi nic nie zrobi'
            : 'brak danych efektu — rozstrzyga MG'}
        </span>
      )}
    </li>
  );
}

/**
 * Cyberdek (etap 70a) — zwijana sekcja na dole okna.
 *
 * Zwinięta domyślnie: przez większość runu netrunner patrzy na piętro i wyjścia,
 * a do gniazd zagląda, gdy trzeba uruchomić Program. Nagłówek mówi, ile ich
 * jest i ile działa, więc zwinięta sekcja nie chowa stanu deku.
 */
export function NetDeckSection({
  combat,
  busy,
  onToggle,
}: {
  combat: NetCombatView;
  busy: boolean;
  onToggle: (rowId: string, action: 'run' | 'stop') => void;
}) {
  if (combat.deck.length === 0) return null;
  const running = combat.deck.filter((slot) => slot.rezzedId !== undefined && !slot.derezzed);
  return (
    <details className="net-section net-deck">
      <summary className="net-section-title net-deck-summary">
        Cyberdek
        <span className="net-section-meta">
          {plural(combat.deck.length, 'Program', 'Programy', 'Programów')}
          {running.length > 0 ? ` · działa: ${running.map((slot) => slot.name).join(', ')}` : ''}
          {combat.brainArmour > 0 ? ` · Pancerz −${combat.brainArmour} w mózg` : ''}
        </span>
      </summary>
      <ul className="net-deck-slots">
        {combat.deck.map((slot) => (
          <DeckSlot key={slot.rowId} slot={slot} busy={busy} onToggle={onToggle} />
        ))}
      </ul>
    </details>
  );
}
