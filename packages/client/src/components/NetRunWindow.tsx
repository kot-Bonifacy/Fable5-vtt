import { useRef, useState, type PointerEvent } from 'react';
import type {
  CpredNetPosition,
  NetAbilityId,
  NetCombatView,
  NetFloorView,
  NetIceView,
  NetProgramSlotView,
  NetShaftBranchView,
} from '@vtt/shared';
import {
  NET_ABILITIES_AVAILABLE,
  NET_FLOOR_KIND_LABELS,
  NET_ICE_MODE_LABELS,
  NET_PROGRAM_CLASS_LABELS,
  NET_PROGRAM_TARGET_LABELS,
  ROLE_GM,
  netAbility,
} from '@vtt/shared';
import {
  attackInNet,
  clearNetGlue,
  copyNetFile,
  iceDetects,
  iceTakesTurn,
  leaveNetRun,
  moveNetRun,
  slideInNet,
  toggleNetProgram,
  useNetAbility,
} from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { currentRun, useNetRunStore } from '../stores/netRunStore.js';
import { netErrorText } from '../netErrors.js';
import { plural } from '../plural.js';

/**
 * Ekran Sieci (etapy 26b i 26c) — pływające okno z windą (decyzja MG z 14.08).
 *
 * Okno, nie zakładka: run dzieje się w trakcie walki fizycznej, więc mapa musi
 * zostać widoczna. Winda idzie z góry na dół, tak jak w podręczniku, a to, ile
 * z niej widać, jest **już rozstrzygnięte na serwerze** — piętro z `kind: null`
 * nie ma nazwy ani PT, bo ich tu nie przysłano. Klient niczego nie ukrywa.
 *
 * Zwykły DOM i SVG, świadomie: winda to lista, a nie mapa, i nie ma powodu,
 * żeby dokładać ją do canvasu Pixi, który w tym czasie rysuje strzelaninę.
 *
 * Etap 26c dokłada dwie sekcje pod szybem: **Czarny LOD** (jeden wiersz na
 * napotkany Program, z paskiem REZ i przyciskami ataku) oraz **Cyberdek**
 * (gniazda z Programami). Obie są puste, dopóki nie ma czym walczyć — okno
 * netrunnera bez deku wygląda dokładnie tak, jak w 26b.
 */

/** Ikona piętra — jedno spojrzenie mówi, co za drzwiami. */
const FLOOR_GLYPHS: Record<string, string> = {
  empty: '·',
  password: '🔒',
  file: '🗎',
  controlNode: '⚙',
  ice: '☠',
  demon: '👹',
};

function FloorRow({
  floor,
  branchId,
  onMove,
  onCopy,
  busy,
}: {
  floor: NetFloorView;
  branchId: string;
  onMove: (to: CpredNetPosition) => void;
  onCopy: (floorId: string) => void;
  busy: boolean;
}) {
  const unknown = floor.kind === null;
  const label = unknown
    ? '?'
    : floor.label || NET_FLOOR_KIND_LABELS[floor.kind as keyof typeof NET_FLOOR_KIND_LABELS];
  return (
    <li className={`net-run-floor${floor.here ? ' net-run-floor--here' : ''}`}>
      <button
        type="button"
        className="net-run-floor-body"
        disabled={busy || floor.here}
        title={
          floor.here
            ? 'Netrunner stoi na tym piętrze'
            : 'Zjedź na to piętro — ruch po Architekturze nie kosztuje Akcji Sieciowej'
        }
        onClick={() => onMove({ branchId, floor: floor.index })}
      >
        <span className="net-run-floor-depth">{floor.depth + 1}</span>
        <span className={`net-run-floor-glyph${unknown ? ' net-run-floor-glyph--unknown' : ''}`}>
          {unknown ? '?' : (FLOOR_GLYPHS[floor.kind as string] ?? '·')}
        </span>
        <span className="net-run-floor-label">{label}</span>
        {floor.dv !== undefined && <span className="net-run-floor-dv">PT {floor.dv}</span>}
        {floor.broken && <span className="net-run-floor-flag">złamane</span>}
        {floor.controlledDv !== undefined && (
          <span className="net-run-floor-flag">przejęty · PT {floor.controlledDv}</span>
        )}
        {floor.identified && <span className="net-run-floor-flag">rozpoznany</span>}
        {floor.copied && <span className="net-run-floor-flag">kopia na deku</span>}
        {floor.knowledge === 'scouted' && <span className="net-run-floor-flag">ze Zwiadu</span>}
      </button>
      {floor.notes && <p className="net-run-floor-notes">{floor.notes}</p>}
      {floor.here && floor.kind === 'file' && !floor.copied && (
        <button
          type="button"
          className="small-button"
          title="Kopia Pliku na cyberdek — nie zużywa Akcji Sieciowej"
          disabled={busy}
          onClick={() => onCopy(floor.id)}
        >
          Skopiuj Plik
        </button>
      )}
      {floor.programIds && floor.programIds.length > 0 && (
        <span className="net-run-floor-flag net-run-floor-flag--ice">
          {plural(floor.programIds.length, 'Program', 'Programy', 'Programów')} — walka w Sieci
        </span>
      )}
    </li>
  );
}

function Branch({
  branch,
  onMove,
  onCopy,
  busy,
}: {
  branch: NetShaftBranchView;
  onMove: (to: CpredNetPosition) => void;
  onCopy: (floorId: string) => void;
  busy: boolean;
}) {
  return (
    <div className={`net-run-column${branch.trunk ? '' : ' net-run-column--branch'}`}>
      <h4 className="net-run-column-title">
        {branch.trunk ? 'Trzon' : (branch.name ?? 'Odgałęzienie')}
        {!branch.trunk && branch.parentFloor !== null && (
          <span className="net-entry-meta"> · z piętra {branch.parentFloor + 1}</span>
        )}
      </h4>
      <ul className="net-run-floors">
        {branch.floors.map((floor) => (
          <FloorRow
            key={floor.id}
            floor={floor}
            branchId={branch.id}
            onMove={onMove}
            onCopy={onCopy}
            busy={busy}
          />
        ))}
      </ul>
    </div>
  );
}

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
 * Jeden Czarny LOD.
 *
 * Gracz widzi nazwę, ikonę i pasek REZ — walka toczy się o ten pasek. ATK, OBR,
 * PER i PRĘ zostają u MG: to liczby, których podręcznik każe się dowiedzieć
 * rzutem. Dwa przyciski MG („wykrywa intruza", „Tura LOD-a") to decyzja MG
 * z 15.08: LOD nigdy nie rusza się sam.
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

/** „Opisz MG, co chcesz, by twój Wirus zrobił" (s. 200) — trzy pola, bez magii. */
function VirusForm({
  onSubmit,
  onCancel,
  busy,
}: {
  onSubmit: (virus: { description: string; dv: number; actions: number }) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [description, setDescription] = useState('');
  const [dv, setDv] = useState('12');
  const [actions, setActions] = useState('1');
  return (
    <form
      className="net-virus-form"
      onSubmit={(event) => {
        event.preventDefault();
        const parsedDv = Number.parseInt(dv, 10);
        const parsedActions = Number.parseInt(actions, 10);
        if (!description.trim() || !Number.isInteger(parsedDv)) return;
        onSubmit({
          description: description.trim(),
          dv: parsedDv,
          actions: Number.isInteger(parsedActions) ? parsedActions : 1,
        });
      }}
    >
      <label className="bot-field">
        <span className="auth-label">Co ma zrobić Wirus</span>
        <textarea
          rows={2}
          maxLength={500}
          value={description}
          placeholder="Co 5 minut zmienia wszystkie hasła w tej Architekturze"
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <div className="net-generator-row">
        <label className="bot-field">
          <span className="auth-label">PT (ustala MG)</span>
          <input
            type="number"
            min={1}
            max={30}
            value={dv}
            onChange={(event) => setDv(event.target.value)}
          />
        </label>
        <label className="bot-field">
          <span className="auth-label">Akcji Sieciowych</span>
          <input
            type="number"
            min={1}
            max={20}
            value={actions}
            onChange={(event) => setActions(event.target.value)}
          />
        </label>
      </div>
      <p className="placeholder-text">
        Wirusa pisze się przez kilka Tur: każda Akcja Sieciowa to jeden krok, a rzut idzie dopiero
        na ostatnim. PT zniszczenia gotowego Wirusa równa się wynikowi tego rzutu.
      </p>
      <div className="net-generator-foot">
        <button type="submit" className="small-button" disabled={busy}>
          Pisz Wirusa
        </button>
        <button type="button" className="small-button" onClick={onCancel}>
          Anuluj
        </button>
      </div>
    </form>
  );
}

export function NetRunWindow() {
  const run = useNetRunStore(currentRun);
  const runs = useNetRunStore((s) => s.runs);
  const openRun = useNetRunStore((s) => s.openRun);
  const notice = useNetRunStore((s) => s.notice);
  const setNotice = useNetRunStore((s) => s.setNotice);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const [position, setPosition] = useState({ x: 200, y: 80 });
  const [busy, setBusy] = useState(false);
  const [virusOpen, setVirusOpen] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );

  if (!run) return null;

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('button, input, select, textarea')) return;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      baseX: position.x,
      baseY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    setPosition({
      x: Math.max(0, Math.min(window.innerWidth - 200, drag.baseX + event.clientX - drag.startX)),
      y: Math.max(0, Math.min(window.innerHeight - 60, drag.baseY + event.clientY - drag.startY)),
    });
  }

  async function guard<T>(work: Promise<{ ok: boolean; error?: string; data?: T }>) {
    setBusy(true);
    const ack = await work;
    setBusy(false);
    if (!ack.ok) setNotice(netErrorText(ack.error));
    return ack;
  }

  async function move(to: CpredNetPosition) {
    const ack = await guard(moveNetRun(run!.runId, to));
    if (ack.ok) setNotice(null);
  }

  async function ability(
    id: NetAbilityId,
    virus?: { description: string; dv: number; actions: number },
  ) {
    const ack = await guard(
      useNetAbility({ runId: run!.runId, ability: id, ...(virus ? { virus } : {}) }),
    );
    if (ack.ok && ack.data) setNotice(ack.data.summary);
    setVirusOpen(false);
  }

  /** Każde wejście do walki w Sieci wraca tym samym zdaniem pod szybem. */
  async function fight<T extends { summary: string }>(
    work: Promise<{ ok: boolean; error?: string; data?: T }>,
  ) {
    const ack = await guard(work);
    if (ack.ok && ack.data) setNotice(ack.data.summary);
  }

  const floors = run.run.branches.flatMap((branch) => branch.floors);
  const here = floors.find((floor) => floor.here);
  const virusPending = run.run.virus;
  const fightState = run.run.combat;
  /** Agresory, które mają czym uderzyć w Czarnego LOD-a (etap 26c). */
  const weapons = fightState.deck.filter((slot) => slot.vsIce > 0);
  /*
   * „Gdy dotrzesz do najniższego poziomu Architektury, możesz zostawić tam
   * Wirusa" (s. 200). Liczone tu z widoku, nie zgadywane: dno to jedyne
   * najgłębsze piętro, a remis znaczy, że dna nie ma — ta sama zasada, którą
   * 26a wypisuje w „Uwagach" pod szybem. Serwer i tak odmówi; przycisk ma
   * o tym powiedzieć wcześniej, zamiast otwierać formularz do kosza.
   */
  const deepest = floors.reduce((max, floor) => Math.max(max, floor.depth), -1);
  const atBottom =
    here !== undefined &&
    here.depth === deepest &&
    floors.filter((floor) => floor.depth === deepest).length === 1;

  return (
    <section
      className="sheet-window net-run-window"
      style={{ left: position.x, top: position.y, zIndex: 330 }}
      aria-label={`Sieć: ${run.run.architectureName}`}
    >
      <div
        className="sheet-header"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={() => (dragRef.current = null)}
        onPointerCancel={() => (dragRef.current = null)}
      >
        <span className="sheet-name net-run-title">
          {isGm ? run.run.architectureName : 'SIEĆ'}
          <span className="net-entry-meta"> · {run.characterName}</span>
        </span>
        {runs.length > 1 && (
          <select
            value={run.runId}
            onChange={(event) => openRun(event.target.value)}
            title="Który run oglądasz"
          >
            {runs.map((entry) => (
              <option key={entry.runId} value={entry.runId}>
                {entry.characterName}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="small-button"
          title="Bezpieczne odłączenie — kosztuje Akcję Sieciową i resetuje obronę Architektury"
          disabled={busy}
          onClick={() => void guard(leaveNetRun(run.runId))}
        >
          Odłącz się
        </button>
      </div>

      <div className="net-run-body">
        <div className="net-run-status">
          <span>Interfejs {run.interfaceRank}</span>
          <span>
            {plural(run.run.netActionsMax, 'Akcja Sieciowa', 'Akcje Sieciowe', 'Akcji Sieciowych')}{' '}
            na Turę
          </span>
          <span>Punkt dostępu: {run.accessPointName}</span>
          {fightState.netActionDebt > 0 && (
            <span className="net-run-debt">
              W kolejnej Turze −{fightState.netActionDebt} Akcji Sieciowej
            </span>
          )}
          {fightState.slideMarks > 0 && (
            <span className="net-run-debt">
              Ślizg −{2 * fightState.slideMarks} (Skunks ×{fightState.slideMarks})
            </span>
          )}
        </div>

        {fightState.glue && (
          <p className="net-run-notice net-run-notice--glue">
            {fightState.glue.source}: ani niżej, ani bezpiecznego odłączenia
            {fightState.glue.untilRound !== null
              ? ` — do rundy ${fightState.glue.untilRound}`
              : ' — do zdjęcia przez MG'}
            . Awaryjne odłączenie wciąż działa.
            {isGm && (
              <button
                type="button"
                className="small-button"
                disabled={busy}
                onClick={() => void guard(clearNetGlue(run.runId))}
              >
                Zdejmij
              </button>
            )}
          </p>
        )}

        <div className="net-run-shaft">
          {run.run.branches.map((branch) => (
            <Branch
              key={branch.id}
              branch={branch}
              busy={busy}
              onMove={(to) => void move(to)}
              onCopy={(floorId) => void guard(copyNetFile(run.runId, floorId))}
            />
          ))}
        </div>

        {virusPending && (
          <p className="net-run-notice">
            Wirus w budowie: {virusPending.actionsSpent} / {virusPending.actionsNeeded} Akcji
            Sieciowych · PT {virusPending.dv} — {virusPending.description}
          </p>
        )}

        {fightState.ice.length > 0 && (
          <div className="net-ice-list-wrap">
            <h4 className="net-run-column-title">Czarny LOD</h4>
            <ul className="net-ice-list">
              {fightState.ice.map((ice) => (
                <IceRow
                  key={ice.id}
                  ice={ice}
                  weapons={weapons}
                  isGm={isGm}
                  busy={busy}
                  onAttack={(iceId, rowId) =>
                    void fight(
                      attackInNet({ runId: run!.runId, iceId, ...(rowId ? { rowId } : {}) }),
                    )
                  }
                  slideTargets={fightState.slideTargets}
                  onSlide={(iceId, to) =>
                    void fight(slideInNet({ runId: run!.runId, iceId, ...(to ? { to } : {}) }))
                  }
                  onDetect={(iceId) => void fight(iceDetects({ runId: run!.runId, iceId }))}
                  onTurn={(iceId) => void fight(iceTakesTurn({ runId: run!.runId, iceId }))}
                />
              ))}
            </ul>
          </div>
        )}

        {fightState.deck.length > 0 && (
          <div className="net-deck">
            <h4 className="net-run-column-title">
              Cyberdek
              {fightState.brainArmour > 0 && (
                <span className="net-entry-meta">
                  {' '}
                  · Pancerz zdejmuje {fightState.brainArmour} z obrażeń w mózg
                </span>
              )}
            </h4>
            <ul className="net-deck-slots">
              {fightState.deck.map((slot) => (
                <DeckSlot
                  key={slot.rowId}
                  slot={slot}
                  busy={busy}
                  onToggle={(rowId, action) =>
                    void fight(toggleNetProgram({ runId: run!.runId, rowId, action }))
                  }
                />
              ))}
            </ul>
          </div>
        )}

        <div className="net-abilities">
          {NET_ABILITIES_AVAILABLE.filter((entry) => entry.id !== 'scanner').map((entry) => {
            // Zdolność, która potrzebuje konkretnego piętra, jest wyszarzona,
            // dopóki netrunner na nim nie stanie — odmowa serwera i tak by
            // przyszła, ale przycisk ma mówić o tym wcześniej.
            const wrongFloor =
              (entry.floorKind !== undefined && here?.kind !== entry.floorKind) ||
              (entry.id === 'virus' && !atBottom);
            return (
              <button
                key={entry.id}
                type="button"
                className="small-button net-ability"
                title={entry.hint}
                disabled={busy || wrongFloor}
                onClick={() => {
                  if (entry.id === 'virus' && !virusPending) setVirusOpen(true);
                  else void ability(entry.id);
                }}
              >
                {entry.name}
              </button>
            );
          })}
        </div>

        {virusOpen && (
          <VirusForm
            busy={busy}
            onCancel={() => setVirusOpen(false)}
            onSubmit={(virus) => void ability('virus', virus)}
          />
        )}

        {run.run.viruses.length > 0 && (
          <ul className="net-virus-list">
            {run.run.viruses.map((virus) => (
              <li key={virus.id}>
                <strong>Wirus PT {virus.dv}</strong> — {virus.description}
                {virus.author ? ` (${virus.author})` : ''}
              </li>
            ))}
          </ul>
        )}

        {notice && <p className="net-run-notice">{notice}</p>}
        {fightState.ice.length === 0 && (
          <p className="placeholder-text">
            {netAbility('slide')?.name} i {netAbility('zap')?.name} czekają na Czarnego LOD-a — oba
            są testami spornymi i pojawiają się przy nim, gdy jakiś stanie w szybie.
          </p>
        )}
      </div>
    </section>
  );
}
