import type { CSSProperties } from 'react';
import type {
  NetDeviceKind,
  NetDeviceOperation,
  NetDeviceView,
  NetFloorKind,
  NetOperatedFigure,
  NetOperatedState,
  NetRunView,
} from '@vtt/shared';
import { NET_DEVICE_KIND_LABELS, NET_DEVICE_OPERATION_LABELS } from '@vtt/shared';
import { takeFigure } from '../../hud.js';
import { showNetDevice, showNetRunner } from '../../map-frame.js';
import { useSelectionStore } from '../../stores/selectionStore.js';
import { floorName } from './net-glyphs.js';

/** Węzeł widziany przez pasek: piętro karty albo krok śladu, z urządzeniami. */
export interface NetNodeLike {
  id: string;
  kind: NetFloorKind | null;
  label?: string;
  devices?: NetDeviceView[];
  nodeUsed?: boolean;
}

/**
 * Węzły runu z listą urządzeń: piętro pod stopami i przejęte na śladzie (ślad
 * niesie urządzenia trzymanych węzłów od 70a — pasek czyta je stamtąd).
 */
export function heldNodes(view: NetRunView): NetNodeLike[] {
  const nodes: NetNodeLike[] = [];
  if (view.here?.devices?.length) nodes.push(view.here);
  for (const step of view.trail) {
    if (!step.here && step.devices?.length) nodes.push(step);
  }
  return nodes;
}

/** Sylwetka rodzaju z `public/icons/devices/` — ta sama, co na krążku figury. */
const KIND_ICONS: Partial<Record<NetDeviceKind, string>> = {
  camera: 'camera',
  turret: 'turret',
  drone: 'drone',
};
const KIND_GLYPHS: Record<NetDeviceKind, string> = {
  camera: '◉',
  turret: '▣',
  drone: '✈',
  door: '⇄',
  environment: '⚡',
};

/** Kropka stanu na miniaturze — co urządzenie może jeszcze w tej Turze. */
type EyeDot = NetOperatedState | 'off' | 'away';

const DOT_TEXT: Record<EyeDot, string> = {
  ready: 'gotowe — pierwsza czynność za Akcję Sieciową',
  active: 'aktywne w tej Turze',
  spent: 'czynność wykonana w tej Turze',
  'node-used': 'węzeł użyty w tej Turze',
  free: 'gotowe — poza walką bez kosztu',
  off: 'wyłączone',
  away: 'na innej scenie',
};

/** Jedno oko: urządzenie z figurą na tej mapie, którą netrunner prowadzi. */
interface Eye {
  device: NetDeviceView;
  figure: NetOperatedFigure;
}

/**
 * Pasek „Oczy i urządzenia” okna SIEĆ (etap 70c) — zastępuje listy urządzeń
 * przy przejętych węzłach (26d, 70a).
 *
 * Jedna miniatura na urządzenie **wszystkich** trzymanych węzłów, pogrupowane
 * węzłami. Urządzenie z figurą, którą netrunner prowadzi, to „oko”: klik bierze
 * figurę w rękę i przenosi na nią kadr, „◂ ▸” chodzą po kolejnych oczach, „⌂”
 * wraca kadrem i zaznaczeniem do netrunnera. Strzał, ruch drona i „Obróć”
 * mieszkają na lewej belce figury; tu zostają przełączniki tego, czego belka
 * nie ma: drzwi, instalacje, kamera bez figury i „Włącz” wyłączonego
 * urządzenia (wyłączone wypada spod ręki). Stan oczu czyta ten sam ładunek co
 * belka i „Postacie” (`NetRunPayload.operated`).
 */
export function NetEyesStrip({
  view,
  operated,
  runnerTokenId,
  sceneId,
  busy,
  onOperate,
}: {
  view: NetRunView;
  operated: readonly NetOperatedFigure[];
  runnerTokenId: string;
  /** Scena, którą rysuje mapa — tylko tam da się wziąć figurę i pokazać kadr. */
  sceneId: string | null;
  busy: boolean;
  onOperate: (floorId: string, deviceId: string, operation: NetDeviceOperation) => void;
}) {
  const selected = useSelectionStore((s) => s.tokenId);
  const nodes = heldNodes(view);
  if (nodes.length === 0) return null;

  const figureOf = (device: NetDeviceView) =>
    device.tokenId ? operated.find((figure) => figure.tokenId === device.tokenId) : undefined;
  const eyes: Eye[] = nodes.flatMap((node) =>
    (node.devices ?? []).flatMap((device) => {
      const figure = figureOf(device);
      return figure && device.on && device.at?.sceneId === sceneId ? [{ device, figure }] : [];
    }),
  );

  const look = (eye: Eye) => {
    takeFigure(eye.figure.tokenId, false);
    showNetDevice(eye.device);
  };
  const step = (by: 1 | -1) => {
    if (eyes.length === 0) return;
    const at = eyes.findIndex((eye) => eye.figure.tokenId === selected);
    const next = at < 0 ? (by > 0 ? 0 : eyes.length - 1) : (at + by + eyes.length) % eyes.length;
    look(eyes[next]!);
  };
  const home = () => {
    takeFigure(runnerTokenId, false);
    showNetRunner(runnerTokenId);
  };

  return (
    <section className="net-section net-eyes" data-testid="net-eyes" aria-label="Oczy i urządzenia">
      <div className="net-eyes-head">
        <h4 className="net-section-title">Oczy i urządzenia</h4>
        <span className="net-eyes-nav">
          <button
            type="button"
            className="small-button"
            aria-label="Poprzednie oko"
            title="Poprzednie oko — kadr i zaznaczenie"
            disabled={eyes.length === 0}
            onClick={() => step(-1)}
          >
            ◂
          </button>
          <button
            type="button"
            className="small-button"
            aria-label="Następne oko"
            title="Następne oko — kadr i zaznaczenie"
            disabled={eyes.length === 0}
            onClick={() => step(1)}
          >
            ▸
          </button>
          <button
            type="button"
            className="small-button"
            aria-label="Wróć do netrunnera"
            title="Wróć kadrem i zaznaczeniem do netrunnera"
            onClick={home}
          >
            ⌂
          </button>
        </span>
      </div>
      {nodes.map((node) => (
        <div key={node.id} className="net-eyes-node">
          <span className="net-eyes-node-name">
            ⚙ {floorName({ kind: node.kind ?? 'controlNode', label: node.label })}
            {node.nodeUsed && <span className="net-run-floor-flag">węzeł użyty w tej Turze</span>}
          </span>
          <ul className="net-eyes-list">
            {(node.devices ?? []).map((device) => (
              <EyeTile
                key={device.id}
                device={device}
                figure={figureOf(device)}
                sceneId={sceneId}
                selected={device.tokenId !== undefined && device.tokenId === selected}
                busy={busy || node.nodeUsed === true}
                onLook={look}
                onOperate={(operation) => onOperate(node.id, device.id, operation)}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function EyeTile({
  device,
  figure,
  sceneId,
  selected,
  busy,
  onLook,
  onOperate,
}: {
  device: NetDeviceView;
  figure: NetOperatedFigure | undefined;
  sceneId: string | null;
  selected: boolean;
  busy: boolean;
  onLook: (eye: Eye) => void;
  onOperate: (operation: NetDeviceOperation) => void;
}) {
  const onMap = device.at !== undefined && device.at.sceneId === sceneId;
  const eye = figure && device.on && onMap ? { device, figure } : null;
  const dot: EyeDot = !device.on
    ? 'off'
    : figure && !onMap
      ? 'away'
      : (figure?.state ?? (device.tokenId ? 'ready' : 'free'));
  // Figurę prowadzi belka; z paska zostają przełączniki tego, czego belka nie ma.
  const switches = device.disarmed
    ? []
    : device.operations.filter((operation) => {
        if (operation === 'fire') return false;
        if (!device.on) return operation === 'on';
        if (operation === 'on') return false;
        // Urządzenie z figurą: „Obróć” i „Wyłącz” stoją na jej belce.
        return !device.tokenId;
      });
  const icon = KIND_ICONS[device.deviceKind];
  const iconStyle = icon
    ? ({ '--hud-icon': `url("/icons/devices/${icon}.svg")` } as CSSProperties)
    : undefined;
  const label = (
    <>
      <span className="net-eye-glyph" aria-hidden>
        {icon ? (
          <span className="hud-icon net-eye-icon" style={iconStyle} />
        ) : (
          KIND_GLYPHS[device.deviceKind]
        )}
      </span>
      <span className="net-eye-name">{device.name}</span>
      <span
        className={`net-eye-dot net-eye-dot--${dot}`}
        data-eye-state={dot}
        title={DOT_TEXT[dot]}
        aria-label={DOT_TEXT[dot]}
        role="img"
      />
    </>
  );
  return (
    <li
      className={`net-eye${device.on ? '' : ' net-eye--off'}${selected ? ' net-eye--selected' : ''}`}
      data-device-id={device.id}
      {...(eye ? { 'data-eye': '' } : {})}
    >
      {eye ? (
        <button
          type="button"
          className="net-eye-take"
          aria-pressed={selected}
          title={`${device.name} (${NET_DEVICE_KIND_LABELS[device.deviceKind]}) — weź na mapie i pokaż kadr`}
          onClick={() => onLook(eye)}
        >
          {label}
        </button>
      ) : (
        <span
          className="net-eye-take net-eye-take--static"
          title={`${device.name} (${NET_DEVICE_KIND_LABELS[device.deviceKind]})`}
        >
          {label}
        </span>
      )}
      {device.disarmed && <span className="net-run-floor-flag">rozbrojona na miejscu</span>}
      {device.turned && !device.tokenId && <span className="net-run-floor-flag">obrócona</span>}
      {switches.length > 0 && (
        <span className="net-eye-switches">
          {switches.map((operation) => (
            <button
              key={operation}
              type="button"
              className="small-button"
              data-device-operation={operation}
              disabled={
                busy ||
                ((operation === 'open' || operation === 'close') && device.wallId === undefined)
              }
              title="Obsługa urządzenia kosztuje Akcję Sieciową, a węzeł działa raz na Turę"
              onClick={() => onOperate(operation)}
            >
              {NET_DEVICE_OPERATION_LABELS[operation]}
            </button>
          ))}
        </span>
      )}
    </li>
  );
}
