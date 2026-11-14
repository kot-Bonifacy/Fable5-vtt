import type { CpredNetPosition, NetFloorView, NetShaftBranchView } from '@vtt/shared';
import { plural } from '../../plural.js';
import { FLOOR_GLYPHS, TRACES_LABELS, TRACES_TITLES, floorName } from './net-glyphs.js';

function PlanFloor({
  floor,
  branchId,
  busy,
  onMove,
}: {
  floor: NetFloorView;
  branchId: string;
  busy: boolean;
  onMove: (to: CpredNetPosition) => void;
}) {
  const kind = floor.kind ?? 'empty';
  return (
    <li
      className={`net-run-floor${floor.here ? ' net-run-floor--here' : ''}${floor.traces ? ' net-run-floor--traces' : ''}`}
    >
      <button
        type="button"
        className="net-run-floor-body"
        disabled={busy || floor.here}
        title={
          floor.here
            ? 'Netrunner stoi na tym piętrze'
            : 'Przestaw netrunnera na to piętro — ręka MG nie pyta o ślad, hasło dalej blokuje'
        }
        onClick={() => onMove({ branchId, floor: floor.index })}
      >
        <span className="net-run-floor-depth">{floor.depth + 1}</span>
        <span className="net-run-floor-glyph">{FLOOR_GLYPHS[kind]}</span>
        <span className="net-run-floor-label">
          {floorName({ kind, ...(floor.label ? { label: floor.label } : {}) })}
        </span>
        {floor.here && <span className="net-run-floor-flag net-run-floor-flag--here">tu jest</span>}
        {floor.dv !== undefined && <span className="net-run-floor-dv">PT {floor.dv}</span>}
        {floor.broken && <span className="net-run-floor-flag">złamane</span>}
        {floor.controlledDv !== undefined && (
          <span className="net-run-floor-flag net-run-floor-flag--held">
            przejęty · PT {floor.controlledDv}
          </span>
        )}
        {floor.identified && <span className="net-run-floor-flag">rozpoznany</span>}
        {floor.hackFailed && <span className="net-run-floor-flag">próba zużyta</span>}
        {floor.copied && <span className="net-run-floor-flag">kopia na deku</span>}
        {floor.cloak === 'masked' && (
          <span
            className="net-run-floor-flag"
            title={`Cudzy Zwiad musiałby przebić ${floor.cloakTotal ?? '?'}`}
          >
            ślady zatarte{floor.cloakTotal !== undefined ? ` · ${floor.cloakTotal}` : ''}
          </span>
        )}
        {floor.traces && (
          <span
            className="net-run-floor-flag net-run-floor-flag--traces"
            title={TRACES_TITLES[floor.traces]}
          >
            {TRACES_LABELS[floor.traces]}
          </span>
        )}
        {floor.cloak === 'trying' && <span className="net-run-floor-flag">maskowanie w toku</span>}
        {floor.programIds && floor.programIds.length > 0 && (
          <span className="net-run-floor-flag net-run-floor-flag--ice">
            {plural(floor.programIds.length, 'Program', 'Programy', 'Programów')}
          </span>
        )}
      </button>
      {floor.notes && <p className="net-run-floor-notes">{floor.notes}</p>}
      {floor.devices && floor.devices.length > 0 && (
        <p className="net-run-floor-notes net-plan-devices">
          {floor.devices.map((device) => device.name).join(' · ')}
        </p>
      )}
    </li>
  );
}

/**
 * „Plan Architektury” (etap 70a) — cały szyb, tylko w oknie MG.
 *
 * Gracz nie ma tej kolumny, bo nie ma jej z czego narysować: `shaft` przychodzi
 * wyłącznie w ładunku MG. To jest podgląd i skok — klik przestawia netrunnera
 * ręką MG (bez ograniczenia do śladu i wyjść). Urządzenia węzła obsługuje się
 * z paska „Oczy i urządzenia” (70c), nie stąd.
 */
export function NetGmShaft({
  shaft,
  spentTries,
  busy,
  onMove,
  onResetTries,
}: {
  shaft: NetShaftBranchView[];
  spentTries: number;
  busy: boolean;
  onMove: (to: CpredNetPosition) => void;
  onResetTries: () => void;
}) {
  return (
    <aside className="net-plan" aria-label="Plan Architektury">
      <h4 className="net-section-title">Plan Architektury</h4>
      {spentTries > 0 && (
        <p className="net-plan-tries">
          Zużyte próby tej postaci na scenie: {spentTries}.{' '}
          <button
            type="button"
            className="small-button"
            disabled={busy}
            title="Ta postać na tej scenie znów ma po jednej próbie każdej zdolności"
            onClick={onResetTries}
          >
            Oddaj próby
          </button>
        </p>
      )}
      {shaft.map((branch) => (
        <div
          key={branch.id}
          className={`net-run-column${branch.trunk ? '' : ' net-run-column--branch'}`}
        >
          <h5 className="net-run-column-title">
            {branch.trunk ? 'Trzon' : (branch.name ?? 'Odgałęzienie')}
            {!branch.trunk && branch.parentFloor !== null && (
              <span className="net-section-meta"> · z piętra {branch.parentFloor + 1}</span>
            )}
          </h5>
          <ul className="net-run-floors">
            {branch.floors.map((floor) => (
              <PlanFloor
                key={floor.id}
                floor={floor}
                branchId={branch.id}
                busy={busy}
                onMove={onMove}
              />
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}
