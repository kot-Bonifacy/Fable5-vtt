import { useState } from 'react';
import type {
  CpredNetPosition,
  NetCombatView,
  NetDemonView,
  NetIceView,
  NetProgramSlotView,
} from '@vtt/shared';
import { NET_DEMON_MODE_LABELS, NET_ICE_MODE_LABELS } from '@vtt/shared';

/**
 * Jeden Czarny LOD.
 *
 * Gracz widzi nazwę, ikonę i pasek REZ — walka toczy się o ten pasek. ATK, OBR,
 * PER i PRĘ zostają u MG: to liczby, których podręcznik każe się dowiedzieć
 * rzutem. Od etapu 70e LOD wykrywa i gra swoją Turę w kolejce sam; dwa
 * przyciski MG („wykrywa intruza", „Tura LOD-a") zostają na hamulec i na
 * poprawki (przełącznik „Wstrzymaj obronę” w belce stanu).
 */
function IceRow({
  ice,
  weapons,
  slideTargets,
  isGm,
  busy,
  onAttack,
  onSlide,
  onDetect,
  onTurn,
}: {
  ice: NetIceView;
  weapons: NetProgramSlotView[];
  slideTargets: NetCombatView['slideTargets'];
  isGm: boolean;
  busy: boolean;
  onAttack: (iceId: string, rowId?: string) => void;
  onSlide: (iceId: string, to?: CpredNetPosition) => void;
  onDetect: (iceId: string) => void;
  onTurn: (iceId: string) => void;
}) {
  const [weapon, setWeapon] = useState('');
  const [escape, setEscape] = useState('0');
  const down = ice.mode === 'derezzed' || ice.mode === 'destroyed';
  // LOD, który ściga, jest tam, gdzie netrunner („ściga swój cel po całej
  // Architekturze", s. 205); czyhający wymaga stania na jego piętrze.
  const inReach = ice.mode === 'hunting' || ice.here;
  const rezPercent = ice.rezMax > 0 ? Math.round((ice.rezCurrent / ice.rezMax) * 100) : 0;
  return (
    <li className={`net-ice${down ? ' net-ice--down' : ''}`}>
      <div className="net-ice-head">
        <span className="net-ice-glyph">☠</span>
        <span className="net-ice-name">{ice.name}</span>
        <span className="net-run-floor-flag">{NET_ICE_MODE_LABELS[ice.mode]}</span>
        {ice.here && <span className="net-run-floor-flag">na tym piętrze</span>}
        <span className="net-ice-rez">
          REZ {ice.rezCurrent}/{ice.rezMax}
        </span>
      </div>
      <div className="net-ice-bar">
        <span style={{ width: `${rezPercent}%` }} />
      </div>
      {ice.effect && <p className="net-ice-effect">{ice.effect}</p>}
      {isGm && (
        <p className="net-ice-stats">
          ATK {ice.atk} · OBR {ice.def} · PER {ice.per ?? '—'} · PRĘ {ice.speed ?? '—'}
        </p>
      )}
      {!down && (
        <div className="net-ice-actions">
          <select
            value={weapon}
            disabled={busy || !inReach}
            title="Czym uderzyć — Agresor z deku odpala się i sam wyłącza"
            onChange={(event) => setWeapon(event.target.value)}
          >
            <option value="">Paf (1k6, bez Programu)</option>
            {weapons.map((slot) => (
              <option key={slot.rowId} value={slot.rowId}>
                {slot.name} — {slot.vsIce}k6
              </option>
            ))}
          </select>
          <button
            type="button"
            className="small-button"
            disabled={busy || !inReach}
            title={
              inReach
                ? 'Interfejs + ATK Programu + 1k10 przeciw OBR + 1k10. Kosztuje Akcję Sieciową.'
                : 'Ten Czarny LOD jest na innym piętrze'
            }
            onClick={() => onAttack(ice.id, weapon || undefined)}
          >
            Atakuj
          </button>
          {slideTargets.length > 0 && (
            <select
              value={escape}
              disabled={busy || !inReach}
              title="Dokąd uciec — hasła nie da się minąć nawet Ślizgiem"
              onChange={(event) => setEscape(event.target.value)}
            >
              {slideTargets.map((target, index) => (
                <option key={target.label} value={String(index)}>
                  ucieczka: {target.label}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="small-button"
            disabled={busy || !inReach || slideTargets.length === 0}
            title="Test sporny przeciw PER LOD-u. Raz na Turę, ucieczka na sąsiednie piętro."
            onClick={() => onSlide(ice.id, slideTargets[Number(escape)]?.position)}
          >
            Ślizg
          </button>
          {isGm && !(ice.detected && ice.mode === 'hunting') && (
            <button
              type="button"
              className="small-button net-ice-gm"
              disabled={busy}
              title="Interfejs + premie do PRĘ + 1k10 przeciw PRĘ + 1k10. Przegrana netrunnera to darmowy atak i wejście LOD-u do kolejki inicjatywy."
              onClick={() => onDetect(ice.id)}
            >
              LOD wykrywa intruza
            </button>
          )}
          {isGm && ice.detected && ice.mode === 'hunting' && (
            <button
              type="button"
              className="small-button net-ice-gm"
              disabled={busy}
              title="Jeden atak LOD-u — raz na Turę"
              onClick={() => onTurn(ice.id)}
            >
              Tura LOD-a
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Jeden Demon (etap 26e).
 *
 * Od Czarnego LOD-a różni się trzema rzeczami i wszystkie trzy widać: broni się
 * Testem Interfejsu, więc MG nie ma tu kolumny OBR; nie ma PER, więc nie ma
 * przycisku Ślizgu, tylko zdanie dlaczego; i nie czyha na piętrze, tylko wie
 * o wszystkim, więc nie ma plakietki „na tym piętrze".
 *
 * Gracz widzi Demona dopiero wtedy, gdy ten zacznie go ścigać — wcześniej nie
 * ma go w payloadzie. Od etapu 70e budzi się i gra Turę sam (wejście na jego
 * piętro, przejęty węzeł, kolejka); dwa przyciski MG zostają jak przy LOD-zie.
 */
function DemonRow({
  demon,
  weapons,
  isGm,
  busy,
  onAttack,
  onDetect,
  onTurn,
}: {
  demon: NetDemonView;
  weapons: NetProgramSlotView[];
  isGm: boolean;
  busy: boolean;
  onAttack: (demonId: string, rowId?: string) => void;
  onDetect: (demonId: string) => void;
  onTurn: (demonId: string) => void;
}) {
  const [weapon, setWeapon] = useState('');
  const down = demon.mode === 'derezzed' || demon.mode === 'destroyed';
  const rezPercent = demon.rezMax > 0 ? Math.round((demon.rezCurrent / demon.rezMax) * 100) : 0;
  return (
    <li className={`net-ice${down ? ' net-ice--down' : ''}`}>
      <div className="net-ice-head">
        <span className="net-ice-glyph">👹</span>
        <span className="net-ice-name">{demon.name}</span>
        <span className="net-run-floor-flag">{NET_DEMON_MODE_LABELS[demon.mode]}</span>
        <span className="net-ice-rez">
          REZ {demon.rezCurrent}/{demon.rezMax}
        </span>
      </div>
      <div className="net-ice-bar">
        <span style={{ width: `${rezPercent}%` }} />
      </div>
      {isGm && (
        <p className="net-ice-stats">
          Interfejs {demon.interfaceRank ?? '—'} · Akcje Sieciowe {demon.netActions ?? '—'} ·
          Wartość bojowa {demon.combatValue ?? '—'}
          {demon.holds ? ` · węzły z Testu Kontroli: ${demon.holds}` : ''}
        </p>
      )}
      {!down && (
        <div className="net-ice-actions">
          <select
            value={weapon}
            disabled={busy}
            title="Czym uderzyć — Demon to Program, więc czyta zwykłą kolumnę obrażeń"
            onChange={(event) => setWeapon(event.target.value)}
          >
            <option value="">Paf (1k6, bez Programu)</option>
            {weapons.map((slot) => (
              <option key={slot.rowId} value={slot.rowId}>
                {slot.name} — {slot.vsProgram}k6
              </option>
            ))}
          </select>
          <button
            type="button"
            className="small-button"
            disabled={busy}
            title="Interfejs + ATK Programu + 1k10 przeciw Testowi Interfejsu Demona. Kosztuje Akcję Sieciową."
            onClick={() => onAttack(demon.id, weapon || undefined)}
          >
            Atakuj
          </button>
          <span className="net-deck-note">Ślizg nie działa — Demon nie ma Percepcji.</span>
          {isGm && demon.mode === 'lurking' && (
            <button
              type="button"
              className="small-button net-ice-gm"
              disabled={busy}
              title="Demon nie ma PRĘDKOŚCI, więc nie ma tu testu spornego: zaczyna ścigać i wchodzi na czoło kolejki inicjatywy."
              onClick={() => onDetect(demon.id)}
            >
              Demon wykrywa intruza
            </button>
          )}
          {isGm && demon.mode === 'hunting' && (
            <button
              type="button"
              className="small-button net-ice-gm"
              disabled={busy}
              title="Cała Tura naraz: najpierw odbiera węzły, potem strzela z wieżyczek, a z resztek Akcji Sieciowych Pafa netrunnera."
              onClick={() => onTurn(demon.id)}
            >
              Tura Demona
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * „Zagrożenia” (etap 70a) — Czarny LOD i Demony w jednej sekcji okna.
 *
 * Sekcja istnieje tylko wtedy, gdy jest z kim walczyć: okno netrunnera, którego
 * nikt nie ściga, nie ma ani nagłówka, ani akapitu o tym, że Ślizg i Paf
 * czekają na LOD-a (te dwa stoją w wierszu LOD-a, gdy ten się pojawi).
 */
export function NetThreats({
  combat,
  demons,
  isGm,
  busy,
  onAttackIce,
  onAttackDemon,
  onSlide,
  onIceDetect,
  onIceTurn,
  onDemonDetect,
  onDemonTurn,
}: {
  combat: NetCombatView;
  demons: NetDemonView[];
  isGm: boolean;
  busy: boolean;
  onAttackIce: (iceId: string, rowId?: string) => void;
  onAttackDemon: (demonId: string, rowId?: string) => void;
  onSlide: (iceId: string, to?: CpredNetPosition) => void;
  onIceDetect: (iceId: string) => void;
  onIceTurn: (iceId: string) => void;
  onDemonDetect: (demonId: string) => void;
  onDemonTurn: (demonId: string) => void;
}) {
  if (combat.ice.length === 0 && demons.length === 0) return null;
  /** Agresory, które mają czym uderzyć w Czarnego LOD-a (etap 26c). */
  const weapons = combat.deck.filter((slot) => slot.vsIce > 0);
  /** Te same Agresory wobec Demona, który jest zwykłym Programem (etap 26e). */
  const demonWeapons = combat.deck.filter((slot) => slot.vsProgram > 0);
  return (
    <div className="net-section net-threats">
      <h4 className="net-section-title">Zagrożenia</h4>
      <ul className="net-ice-list">
        {combat.ice.map((ice) => (
          <IceRow
            key={ice.id}
            ice={ice}
            weapons={weapons}
            slideTargets={combat.slideTargets}
            isGm={isGm}
            busy={busy}
            onAttack={onAttackIce}
            onSlide={onSlide}
            onDetect={onIceDetect}
            onTurn={onIceTurn}
          />
        ))}
        {demons.map((demon) => (
          <DemonRow
            key={demon.id}
            demon={demon}
            weapons={demonWeapons}
            isGm={isGm}
            busy={busy}
            onAttack={onAttackDemon}
            onDetect={onDemonDetect}
            onTurn={onDemonTurn}
          />
        ))}
      </ul>
    </div>
  );
}
