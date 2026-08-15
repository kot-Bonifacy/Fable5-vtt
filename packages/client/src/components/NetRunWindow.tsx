import { useRef, useState, type PointerEvent } from 'react';
import type { CpredNetPosition, NetAbilityId, NetFloorView, NetShaftBranchView } from '@vtt/shared';
import { NET_ABILITIES_AVAILABLE, NET_FLOOR_KIND_LABELS, ROLE_GM, netAbility } from '@vtt/shared';
import { copyNetFile, leaveNetRun, moveNetRun, useNetAbility } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { currentRun, useNetRunStore } from '../stores/netRunStore.js';
import { netErrorText } from '../netErrors.js';
import { plural } from '../plural.js';

/**
 * Ekran Sieci (etap 26b) — pływające okno z windą (decyzja MG z 14.08).
 *
 * Okno, nie zakładka: run dzieje się w trakcie walki fizycznej, więc mapa musi
 * zostać widoczna. Winda idzie z góry na dół, tak jak w podręczniku, a to, ile
 * z niej widać, jest **już rozstrzygnięte na serwerze** — piętro z `kind: null`
 * nie ma nazwy ani PT, bo ich tu nie przysłano. Klient niczego nie ukrywa.
 *
 * Zwykły DOM i SVG, świadomie: winda to lista, a nie mapa, i nie ma powodu,
 * żeby dokładać ją do canvasu Pixi, który w tym czasie rysuje strzelaninę.
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
          dochodzi w etapie 26c
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

  const floors = run.run.branches.flatMap((branch) => branch.floors);
  const here = floors.find((floor) => floor.here);
  const virusPending = run.run.virus;
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
        </div>

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
        <p className="placeholder-text">
          {netAbility('slide')?.name} i {netAbility('zap')?.name} — razem z walką w Sieci (etap
          26c).
        </p>
      </div>
    </section>
  );
}
