import { useMemo, useState } from 'react';
import type {
  CompendiumEntry,
  CpredNetArchitecture,
  CpredNetBranch,
  CpredNetDevice,
  CpredNetFloor,
  NetDeviceKind,
  NetDifficulty,
  NetFloorKind,
} from '@vtt/shared';
import {
  NET_BRANCHES_MAX,
  NET_BRANCH_PARENT_MIN,
  NET_DEVICES_PER_NODE_MAX,
  NET_DEVICE_KINDS,
  NET_DEVICE_KIND_LABELS,
  NET_DEVICE_NAME_MAX,
  NET_DIFFICULTIES,
  NET_DIFFICULTY_LABELS,
  NET_FLOORS_MAX,
  NET_FLOOR_DV_MAX,
  NET_FLOOR_DV_MIN,
  NET_FLOOR_KINDS,
  NET_FLOOR_KIND_LABELS,
  NET_FLOOR_KINDS_WITH_DEVICES,
  NET_FLOOR_KINDS_WITH_DV,
  NET_FLOOR_KINDS_WITH_PROGRAMS,
  NET_FLOOR_PROGRAMS_MAX,
  isOpening,
  isProgramEntry,
  netDefenseSystemEntries,
  netDemonEntries,
  netArchitectureAdvice,
  netBranchDepth,
  netDeepestBranch,
  netFloorCount,
} from '@vtt/shared';
import { saveNetArchitecture } from '../socket.js';
import { useCompendiumStore } from '../stores/compendiumStore.js';
import { useNetStore } from '../stores/netStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { useWallStore } from '../stores/wallStore.js';
import { plural } from '../plural.js';
import { useWindowPlacement } from '../window-placement.js';
import { WindowResizeGrip } from './WindowResizeGrip.js';

/**
 * Edytor Architektury Sieciowej (etap 26a) — pływające okno MG.
 *
 * Szyb rysuje się kolumnami: trzon, a pod nim każde odgałęzienie ze zdaniem,
 * z którego piętra wyrasta. Ładna „winda" z neonem należy do runu (26b) — tutaj
 * liczy się to, żeby dało się szybko wpisać PT i wstawić LOD-a, a nie to, żeby
 * wyglądało jak cyberprzestrzeń.
 *
 * Zapis idzie przez `validateNetArchitecture` na serwerze; miękkie oczekiwania
 * podręcznika (wyraźne dno, PT na haśle) wypisuje `netArchitectureAdvice` pod
 * szybem i **nie blokują** zapisu — MG jest w połowie budowania.
 */

let nextId = 1;
function makeId(prefix: string): string {
  nextId += 1;
  return `${prefix}-${Date.now().toString(36)}-${nextId}`;
}

function emptyFloor(): CpredNetFloor {
  return { id: makeId('f'), kind: 'empty', label: '' };
}

function difficultyOf(value: string): NetDifficulty {
  return (NET_DIFFICULTIES as readonly string[]).includes(value)
    ? (value as NetDifficulty)
    : 'standard';
}

function floorKindOf(value: string): NetFloorKind {
  return (NET_FLOOR_KINDS as readonly string[]).includes(value) ? (value as NetFloorKind) : 'empty';
}

/** Programs the GM may drop on a floor: Black ICE for `ice`, Demons for `demon`. */
function pickableFor(kind: NetFloorKind, entries: CompendiumEntry[]): CompendiumEntry[] {
  if (kind === 'demon') return netDemonEntries(entries);
  return entries.filter((entry) => isProgramEntry(entry) && entry.blackIce === true);
}

/**
 * Rzeczy podłączone do węzła kontrolnego (etap 26d).
 *
 * Wiązanie jest **identyfikatorem**: wieżyczka wskazuje żeton stojący na
 * scenie, drzwi wskazują ścianę z 18d. Kopii żadnej z tych rzeczy tu nie ma
 * i być nie może — inaczej magazynek wieżyczki miałby dwa domy.
 *
 * Lista żetonów i drzwi bierze się z **oglądanej sceny**, bo tam MG stawia
 * wieżyczkę; Architektura jest kampanijna i może wisieć przy kilku scenach,
 * więc jeśli MG zwiąże urządzenie z żetonem innej sceny, wybór po prostu
 * pokaże goły identyfikator zamiast nazwy.
 */
function DeviceRows({
  floor,
  entries,
  tokens,
  openings,
  onChange,
}: {
  floor: CpredNetFloor;
  entries: CompendiumEntry[];
  tokens: { id: string; name: string }[];
  openings: { id: number; label: string }[];
  onChange: (next: CpredNetFloor) => void;
}) {
  const devices = floor.devices ?? [];
  const systems = useMemo(() => netDefenseSystemEntries(entries), [entries]);

  function setDevice(index: number, next: CpredNetDevice) {
    onChange({ ...floor, devices: devices.map((entry, at) => (at === index ? next : entry)) });
  }

  return (
    <div className="net-floor-devices">
      {devices.map((device, index) => (
        <div key={device.id} className="net-floor-device">
          <div className="net-floor-line">
            <select
              value={device.deviceKind}
              title="Czym jest ta rzecz — to decyduje, jakie przyciski dostaje netrunner"
              onChange={(event) =>
                setDevice(index, { ...device, deviceKind: deviceKindOf(event.target.value) })
              }
            >
              {NET_DEVICE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {NET_DEVICE_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
            <input
              className="net-floor-label"
              type="text"
              maxLength={NET_DEVICE_NAME_MAX}
              value={device.name}
              placeholder="Nazwa przy stole, np. „Wieżyczka nad drzwiami”"
              onChange={(event) => setDevice(index, { ...device, name: event.target.value })}
            />
            <button
              type="button"
              className="small-button character-delete"
              title="Odłącz od węzła"
              aria-label="Odłącz od węzła"
              onClick={() =>
                onChange({ ...floor, devices: devices.filter((_, at) => at !== index) })
              }
            >
              ✕
            </button>
          </div>
          <div className="net-floor-line">
            <select
              value={device.entryId ?? ''}
              title="Wpis z kompendium — daje PT unieszkodliwienia, PW i Wartość bojową"
              onChange={(event) => {
                const next = { ...device };
                if (event.target.value) next.entryId = event.target.value;
                else delete next.entryId;
                setDevice(index, next);
              }}
            >
              <option value="">— bez wpisu kompendium —</option>
              {systems.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
            {device.deviceKind === 'door' ? (
              <select
                value={device.wallId === undefined ? '' : String(device.wallId)}
                title="Drzwi albo okno z etapu 18d, które ten węzeł otwiera"
                onChange={(event) => {
                  const next = { ...device };
                  const parsed = Number.parseInt(event.target.value, 10);
                  if (Number.isInteger(parsed)) next.wallId = parsed;
                  else delete next.wallId;
                  setDevice(index, next);
                }}
              >
                <option value="">— wskaż drzwi na scenie —</option>
                {openings.map((opening) => (
                  <option key={opening.id} value={String(opening.id)}>
                    {opening.label}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={device.tokenId ?? ''}
                title="Figura na scenie, z której to urządzenie strzela"
                onChange={(event) => {
                  const next = { ...device };
                  if (event.target.value) next.tokenId = event.target.value;
                  else delete next.tokenId;
                  setDevice(index, next);
                }}
              >
                <option value="">— bez figury na mapie —</option>
                {tokens.map((token) => (
                  <option key={token.id} value={token.id}>
                    {token.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      ))}
      {devices.length < NET_DEVICES_PER_NODE_MAX && (
        <button
          type="button"
          className="small-button"
          onClick={() =>
            onChange({
              ...floor,
              devices: [
                ...devices,
                { id: makeId('dev'), name: 'Kamera', deviceKind: 'camera' as NetDeviceKind },
              ],
            })
          }
        >
          + Urządzenie
        </button>
      )}
      {systems.length === 0 && (
        <span className="placeholder-text">
          Kompendium nie ma jeszcze systemów obronnych — urządzenie i tak zadziała, tylko bez PT
          unieszkodliwienia i PW.
        </span>
      )}
    </div>
  );
}

function deviceKindOf(value: string): NetDeviceKind {
  return (NET_DEVICE_KINDS as readonly string[]).includes(value)
    ? (value as NetDeviceKind)
    : 'camera';
}

function FloorRow({
  floor,
  index,
  entries,
  tokens,
  openings,
  onChange,
  onRemove,
}: {
  floor: CpredNetFloor;
  index: number;
  entries: CompendiumEntry[];
  tokens: { id: string; name: string }[];
  openings: { id: number; label: string }[];
  onChange: (next: CpredNetFloor) => void;
  onRemove: () => void;
}) {
  const pickable = useMemo(() => pickableFor(floor.kind, entries), [floor.kind, entries]);
  const showDv = NET_FLOOR_KINDS_WITH_DV.includes(floor.kind);
  const showPrograms = NET_FLOOR_KINDS_WITH_PROGRAMS.includes(floor.kind);
  const showDevices = NET_FLOOR_KINDS_WITH_DEVICES.includes(floor.kind);
  const programIds = floor.programIds ?? [];

  function setKind(kind: NetFloorKind) {
    // Numbers and Programs that no longer belong to the new kind are dropped
    // rather than kept hidden: a password that quietly remembers a Black ICE is
    // a floor whose data disagrees with what the GM can see.
    const next: CpredNetFloor = { id: floor.id, kind, label: floor.label };
    if (NET_FLOOR_KINDS_WITH_DV.includes(kind) && floor.dv !== undefined) next.dv = floor.dv;
    if (NET_FLOOR_KINDS_WITH_PROGRAMS.includes(kind) && floor.programIds?.length) {
      next.programIds = floor.programIds;
    }
    if (NET_FLOOR_KINDS_WITH_DEVICES.includes(kind) && floor.devices?.length) {
      next.devices = floor.devices;
    }
    if (floor.notes) next.notes = floor.notes;
    onChange(next);
  }

  return (
    <li className={`net-floor net-floor--${floor.kind}`}>
      <span className="net-floor-index">{index + 1}</span>
      <div className="net-floor-body">
        <div className="net-floor-line">
          <select
            className="net-floor-kind"
            value={floor.kind}
            onChange={(event) => setKind(floorKindOf(event.target.value))}
            title="Co czeka za drzwiami tego piętra"
          >
            {NET_FLOOR_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {NET_FLOOR_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
          <input
            className="net-floor-label"
            type="text"
            maxLength={120}
            value={floor.label}
            placeholder="Opis dla stołu, np. „Plik: listy przewozowe”"
            onChange={(event) => onChange({ ...floor, label: event.target.value })}
          />
          {showDv && (
            <label className="net-floor-dv">
              <span>PT</span>
              <input
                type="number"
                min={NET_FLOOR_DV_MIN}
                max={NET_FLOOR_DV_MAX}
                value={floor.dv ?? ''}
                onChange={(event) => {
                  const value = Number.parseInt(event.target.value, 10);
                  const next = { ...floor };
                  if (Number.isInteger(value)) next.dv = value;
                  else delete next.dv;
                  onChange(next);
                }}
              />
            </label>
          )}
          <button
            type="button"
            className="small-button character-delete"
            title="Usuń piętro"
            aria-label="Usuń piętro"
            onClick={onRemove}
          >
            ✕
          </button>
        </div>

        {showPrograms && (
          <div className="net-floor-programs">
            {programIds.map((id, slot) => (
              <span key={`${id}-${slot}`} className="net-program-chip">
                {entries.find((entry) => entry.id === id)?.name ?? id}
                <button
                  type="button"
                  title="Zdejmij z piętra"
                  aria-label="Zdejmij z piętra"
                  onClick={() =>
                    onChange({
                      ...floor,
                      programIds: programIds.filter((_, at) => at !== slot),
                    })
                  }
                >
                  ✕
                </button>
              </span>
            ))}
            {programIds.length < NET_FLOOR_PROGRAMS_MAX && (
              <select
                className="net-program-picker"
                value=""
                onChange={(event) => {
                  if (!event.target.value) return;
                  onChange({ ...floor, programIds: [...programIds, event.target.value] });
                }}
              >
                <option value="">{floor.kind === 'demon' ? '+ Demon…' : '+ Czarny LOD…'}</option>
                {pickable.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            )}
            {pickable.length === 0 && (
              <span className="placeholder-text">
                Kompendium nie ma jeszcze {floor.kind === 'demon' ? 'Demonów' : 'Czarnych LOD-ów'}.
              </span>
            )}
          </div>
        )}

        {showDevices && (
          <DeviceRows
            floor={floor}
            entries={entries}
            tokens={tokens}
            openings={openings}
            onChange={onChange}
          />
        )}

        <input
          className="net-floor-notes"
          type="text"
          maxLength={200}
          value={floor.notes ?? ''}
          placeholder="Notatka MG — nigdy nie trafia do gracza"
          onChange={(event) => {
            const next = { ...floor };
            if (event.target.value) next.notes = event.target.value;
            else delete next.notes;
            onChange(next);
          }}
        />
      </div>
    </li>
  );
}

function BranchColumn({
  branch,
  trunkFloors,
  entries,
  tokens,
  openings,
  onChange,
  onRemove,
}: {
  branch: CpredNetBranch;
  trunkFloors: number;
  entries: CompendiumEntry[];
  tokens: { id: string; name: string }[];
  openings: { id: number; label: string }[];
  onChange: (next: CpredNetBranch) => void;
  onRemove: (() => void) | null;
}) {
  const isTrunk = branch.parentFloor === null;
  const parentOptions = Array.from(
    { length: Math.max(0, trunkFloors - NET_BRANCH_PARENT_MIN) },
    (_, index) => index + NET_BRANCH_PARENT_MIN,
  );

  function setFloor(index: number, floor: CpredNetFloor) {
    onChange({ ...branch, floors: branch.floors.map((row, at) => (at === index ? floor : row)) });
  }

  return (
    <section className="net-branch">
      <header className="net-branch-head">
        <h4>{isTrunk ? 'Trzon' : (branch.name ?? 'Odgałęzienie')}</h4>
        {!isTrunk && (
          <label className="net-branch-parent">
            <span>wyrasta poniżej piętra</span>
            <select
              value={branch.parentFloor ?? NET_BRANCH_PARENT_MIN}
              onChange={(event) =>
                onChange({ ...branch, parentFloor: Number.parseInt(event.target.value, 10) })
              }
            >
              {parentOptions.map((value) => (
                <option key={value} value={value}>
                  {value + 1}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="net-branch-depth">sięga {netBranchDepth(branch)}</span>
        {onRemove && (
          <button type="button" className="small-button character-delete" onClick={onRemove}>
            Usuń gałąź
          </button>
        )}
      </header>
      <ol className="net-floors">
        {branch.floors.map((floor, index) => (
          <FloorRow
            key={floor.id}
            floor={floor}
            index={isTrunk ? index : (branch.parentFloor ?? 0) + 1 + index}
            entries={entries}
            tokens={tokens}
            openings={openings}
            onChange={(next) => setFloor(index, next)}
            onRemove={() =>
              onChange({ ...branch, floors: branch.floors.filter((_, at) => at !== index) })
            }
          />
        ))}
      </ol>
      <button
        type="button"
        className="small-button"
        onClick={() => onChange({ ...branch, floors: [...branch.floors, emptyFloor()] })}
      >
        + Piętro
      </button>
    </section>
  );
}

function EditorWindow({ architectureId }: { architectureId: string | 'new' }) {
  const draft = useNetStore((s) => s.draft);
  const rollSummary = useNetStore((s) => s.rollSummary);
  const setDraft = useNetStore((s) => s.setDraft);
  const close = useNetStore((s) => s.close);
  const entriesById = useCompendiumStore((s) => s.entries);
  const order = useCompendiumStore((s) => s.order);
  const tokensById = useTokenStore((s) => s.tokens);
  const walls = useWallStore((s) => s.walls);

  const placement = useWindowPlacement('net-architecture', () => ({ x: 140, y: 60 }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const entries = useMemo(
    () => order.map((id) => entriesById[id]).filter((entry): entry is CompendiumEntry => !!entry),
    [entriesById, order],
  );
  const advice = useMemo(() => (draft ? netArchitectureAdvice(draft) : []), [draft]);

  // Czym da się związać urządzenie węzła (26d): figury i otwory **oglądanej**
  // sceny. Architektura jest kampanijna, więc to podpowiedź, nie ograniczenie —
  // zapisany zostaje sam identyfikator.
  const tokens = useMemo(
    () =>
      Object.values(tokensById)
        .map((token) => ({ id: token.id, name: token.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pl')),
    [tokensById],
  );
  const openings = useMemo(
    () =>
      walls
        .filter((wall) => isOpening(wall))
        .map((wall) => ({
          id: wall.id,
          label: `${wall.kind === 'door' ? 'Drzwi' : 'Okno'} #${wall.id}${wall.locked ? ' (na klucz)' : ''}`,
        })),
    [walls],
  );

  if (!draft) return null;
  const shaft = draft;
  const trunk = shaft.branches.find((branch) => branch.parentFloor === null);
  const branches = shaft.branches.filter((branch) => branch.parentFloor !== null);
  const deepest = netDeepestBranch(shaft);

  function patch(next: Partial<CpredNetArchitecture>) {
    setDraft({ ...shaft, ...next } as CpredNetArchitecture);
  }

  function setBranch(id: string, next: CpredNetBranch) {
    patch({ branches: shaft.branches.map((branch) => (branch.id === id ? next : branch)) });
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const ack = await saveNetArchitecture({
      ...(architectureId === 'new' ? {} : { id: architectureId }),
      architecture: shaft,
    });
    setBusy(false);
    if (!ack.ok) {
      setError(
        ack.error.startsWith('INVALID_ARCHITECTURE:')
          ? ack.error.slice('INVALID_ARCHITECTURE:'.length)
          : `Nie udało się zapisać: ${ack.error}`,
      );
      return;
    }
    close();
  }

  const totalFloors = netFloorCount(shaft);

  return (
    <section
      ref={placement.ref}
      className="sheet-window net-window"
      style={{ ...placement.style, zIndex: 320 }}
      aria-label={`Architektura Sieciowa: ${shaft.name}`}
    >
      <div className="sheet-header" {...placement.dragProps}>
        <input
          className="sheet-name"
          type="text"
          maxLength={80}
          value={shaft.name}
          onChange={(event) => patch({ name: event.target.value })}
          title="Nazwa architektury"
        />
        <button type="button" className="small-button" onClick={() => void save()} disabled={busy}>
          {busy ? 'Zapisuję…' : 'Zapisz'}
        </button>
        <button
          type="button"
          className="sheet-close"
          onClick={close}
          title="Zamknij edytor"
          aria-label="Zamknij edytor"
        >
          ✕
        </button>
      </div>

      <div className="net-window-body">
        <div className="net-window-meta">
          <label className="bot-field">
            <span className="auth-label">Poziom trudności</span>
            <select
              value={shaft.difficulty}
              onChange={(event) => patch({ difficulty: difficultyOf(event.target.value) })}
            >
              {NET_DIFFICULTIES.map((id) => (
                <option key={id} value={id}>
                  {NET_DIFFICULTY_LABELS[id]}
                </option>
              ))}
            </select>
          </label>
          <span className="net-entry-meta">
            {plural(totalFloors, 'piętro', 'piętra', 'pięter')}
            {deepest
              ? ` · dno: ${deepest.parentFloor === null ? 'trzon' : (deepest.name ?? 'odgałęzienie')}`
              : ' · bez wyraźnego dna'}
          </span>
        </div>

        {rollSummary && <p className="net-roll-summary">🎲 {rollSummary}</p>}

        <input
          className="net-floor-notes"
          type="text"
          maxLength={200}
          value={shaft.notes ?? ''}
          placeholder="Czym ta architektura steruje w Somie — notatka MG"
          onChange={(event) => {
            const next = { ...shaft };
            if (event.target.value) next.notes = event.target.value;
            else delete next.notes;
            setDraft(next);
          }}
        />

        <div className="net-shaft">
          {trunk && (
            <BranchColumn
              branch={trunk}
              trunkFloors={trunk.floors.length}
              entries={entries}
              tokens={tokens}
              openings={openings}
              onChange={(next) => setBranch(trunk.id, next)}
              onRemove={null}
            />
          )}
          {branches.map((branch) => (
            <BranchColumn
              key={branch.id}
              branch={branch}
              trunkFloors={trunk?.floors.length ?? 0}
              entries={entries}
              tokens={tokens}
              openings={openings}
              onChange={(next) => setBranch(branch.id, next)}
              onRemove={() =>
                patch({ branches: shaft.branches.filter((entry) => entry.id !== branch.id) })
              }
            />
          ))}
        </div>

        {branches.length < NET_BRANCHES_MAX &&
          (trunk?.floors.length ?? 0) > NET_BRANCH_PARENT_MIN && (
            <button
              type="button"
              className="small-button"
              disabled={totalFloors >= NET_FLOORS_MAX}
              onClick={() =>
                patch({
                  branches: [
                    ...shaft.branches,
                    {
                      id: makeId('branch'),
                      name: `Odgałęzienie ${branches.length + 1}`,
                      parentFloor: NET_BRANCH_PARENT_MIN,
                      floors: [emptyFloor()],
                    },
                  ],
                })
              }
            >
              + Odgałęzienie
            </button>
          )}

        {advice.length > 0 && (
          <ul className="net-advice">
            {advice.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {error && <p className="ai-status-error">{error}</p>}
      </div>
      <WindowResizeGrip resizeProps={placement.resizeProps} />
    </section>
  );
}

export function NetArchitectureEditor() {
  const editing = useNetStore((s) => s.editing);
  if (!editing) return null;
  return <EditorWindow architectureId={editing} />;
}
