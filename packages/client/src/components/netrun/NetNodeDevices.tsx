import { useState } from 'react';
import type { NetDeviceOperation, NetDeviceView } from '@vtt/shared';
import {
  NET_CAMERA_DIRECTIONS,
  NET_DEVICE_KIND_LABELS,
  NET_DEVICE_OPERATION_LABELS,
  netCameraDirectionLabel,
  normalizeFacing,
} from '@vtt/shared';

/** Węzeł widziany przez listę urządzeń: piętro karty albo krok śladu. */
export interface NetNodeLike {
  id: string;
  devices?: NetDeviceView[];
  nodeUsed?: boolean;
}

/**
 * Rzeczy podłączone do przejętego węzła (etap 26d).
 *
 * Sekcja pojawia się **dopiero po** udanej Kontroli — nie dlatego, że jest
 * chowana, tylko dlatego, że przed przejęciem serwer nie przysyła listy
 * urządzeń („po przejęciu kontroli nad węzłem", s. 199). Każdy przycisk to
 * osobna Akcja Sieciowa, a cały węzeł gaśnie po pierwszym użyciu w Turze.
 *
 * Od 20.10 (zlecenie MG) nazwa urządzenia z figurą na oglądanej scenie to
 * przycisk kadru, a kamera na mapie ma przy „Obróć” wybór kierunku.
 */
export function NetNodeDevices({
  node,
  targets,
  busy,
  sceneId,
  onOperate,
  onShow,
}: {
  node: NetNodeLike;
  targets: { id: string; name: string }[];
  busy: boolean;
  /** Scena, którą rysuje mapa — tylko tam da się pokazać urządzenie. */
  sceneId: string | null;
  onOperate: (deviceId: string, operation: NetDeviceOperation, extra: OperateExtra) => void;
  onShow: (device: NetDeviceView) => void;
}) {
  const [target, setTarget] = useState('');
  /** Kierunek „Obróć” per kamera; bez wyboru — ćwierć obrotu od obecnego. */
  const [aims, setAims] = useState<Record<string, number>>({});
  const devices = node.devices ?? [];
  if (devices.length === 0) return null;
  const spent = node.nodeUsed === true;
  return (
    <div className="net-node-devices">
      <span className="net-node-title">
        Podłączone urządzenia
        {spent && <span className="net-run-floor-flag">węzeł użyty w tej Turze</span>}
      </span>
      <ul className="net-node-list">
        {devices.map((device) => (
          <li
            key={device.id}
            className={`net-node-device${device.on ? '' : ' net-node-device--off'}`}
          >
            {device.at && device.at.sceneId === sceneId ? (
              <button
                type="button"
                className="net-node-name net-node-name--show"
                title="Pokaż na mapie"
                onClick={() => onShow(device)}
              >
                ⌖ {device.name}
              </button>
            ) : (
              <span className="net-node-name">{device.name}</span>
            )}
            <span className="net-node-kind">{NET_DEVICE_KIND_LABELS[device.deviceKind]}</span>
            {device.deviceKind === 'camera' && device.tokenId && device.facing !== undefined && (
              <span className="net-run-floor-flag">
                patrzy na {netCameraDirectionLabel(device.facing)}
              </span>
            )}
            {device.disarmed ? (
              <span className="net-run-floor-flag">rozbrojona na miejscu</span>
            ) : (
              !device.on && <span className="net-run-floor-flag">wyłączone</span>
            )}
            {device.turned && <span className="net-run-floor-flag">obrócona</span>}
            {device.detail && <span className="net-deck-effect">{device.detail}</span>}
            {device.notes && <p className="net-run-floor-notes">{device.notes}</p>}
            <span className="net-node-buttons">
              {device.operations.map((operation) => {
                // „Włącz" przy działającym urządzeniu i „Wyłącz" przy wyłączonym
                // to przyciski, które nic nie zmieniają — serwer je zresztą
                // odrzuci, więc niech nie kuszą.
                if (operation === 'on' && device.on) return null;
                if (operation !== 'on' && !device.on) return null;
                const needsTarget = operation === 'fire';
                const aimsCamera =
                  operation === 'turn' && device.deviceKind === 'camera' && !!device.tokenId;
                const aim = aims[device.id] ?? nextCameraFacing(device.facing);
                const button = (
                  <button
                    key={operation}
                    type="button"
                    className="small-button"
                    disabled={
                      busy ||
                      spent ||
                      (needsTarget && (!device.tokenId || target === '')) ||
                      (operation === 'open' || operation === 'close'
                        ? device.wallId === undefined
                        : false)
                    }
                    title={
                      needsTarget
                        ? 'Strzał z tej figury Umiejętnościami netrunnera — kosztuje Akcję Sieciową'
                        : 'Obsługa urządzenia kosztuje Akcję Sieciową, a węzeł działa raz na Turę'
                    }
                    onClick={() =>
                      onOperate(device.id, operation, {
                        ...(needsTarget ? { targetTokenId: target } : {}),
                        ...(aimsCamera ? { facing: aim } : {}),
                      })
                    }
                  >
                    {NET_DEVICE_OPERATION_LABELS[operation]}
                  </button>
                );
                if (!aimsCamera) return button;
                return (
                  <span key={operation} className="net-node-aim">
                    {button}
                    <select
                      value={String(aim)}
                      title="Dokąd obrócić kamerę"
                      aria-label={`Kierunek kamery ${device.name}`}
                      disabled={busy || spent}
                      onChange={(event) =>
                        setAims((now) => ({ ...now, [device.id]: Number(event.target.value) }))
                      }
                    >
                      {NET_CAMERA_DIRECTIONS.map((direction) => (
                        <option key={direction.facing} value={String(direction.facing)}>
                          na {direction.label}
                        </option>
                      ))}
                    </select>
                  </span>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
      {devices.some((device) => device.operations.includes('fire')) && (
        <label className="net-node-target">
          <span className="auth-label">Cel strzału</span>
          <select value={target} onChange={(event) => setTarget(event.target.value)}>
            <option value="">— wskaż figurę —</option>
            {targets.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

/** Co poza rodzajem obsługi niesie jedno kliknięcie urządzenia. */
export interface OperateExtra {
  targetTokenId?: string;
  facing?: number;
}

/**
 * Kierunek, który lista „Obróć” podsuwa kamerze: ćwierć obrotu zgodnie
 * z zegarem od obecnego, przyciągnięty do jednego z ośmiu kierunków.
 */
function nextCameraFacing(facing: number | undefined): number {
  return normalizeFacing(Math.round(((facing ?? 0) + 90) / 45) * 45);
}
