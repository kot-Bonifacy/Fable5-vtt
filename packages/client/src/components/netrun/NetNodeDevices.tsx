import type { NetDeviceOperation, NetDeviceView } from '@vtt/shared';
import {
  NET_DEVICE_KIND_LABELS,
  NET_DEVICE_OPERATION_LABELS,
  netCameraDirectionLabel,
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
 * urządzeń („po przejęciu kontroli nad węzłem", s. 199).
 *
 * Od etapu 70b urządzenie z figurą na mapie **prowadzi się z mapy**: nazwa
 * zaznacza figurę i przenosi na nią kadr, a strzał, obrót kamery i „Wyłącz”
 * mieszkają na lewej belce tej figury. Lista zostaje przy tym, czego belka
 * nie ma: przełącznikach urządzeń bez figury, drzwiach i „Włącz” (wyłączona
 * figura wypada spod ręki netrunnera, więc z belki się jej nie włączy).
 */
export function NetNodeDevices({
  node,
  busy,
  sceneId,
  onOperate,
  onShow,
}: {
  node: NetNodeLike;
  busy: boolean;
  /** Scena, którą rysuje mapa — tylko tam da się pokazać urządzenie. */
  sceneId: string | null;
  onOperate: (deviceId: string, operation: NetDeviceOperation) => void;
  onShow: (device: NetDeviceView) => void;
}) {
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
        {devices.map((device) => {
          const onMap = device.at !== undefined && device.at.sceneId === sceneId;
          // Figura na mapie prowadzi się belką: strzał i obrót kamery stąd znikły.
          const fromMap = (operation: NetDeviceOperation) =>
            operation === 'fire' ||
            (operation === 'turn' && device.deviceKind === 'camera' && !!device.tokenId);
          return (
            <li
              key={device.id}
              className={`net-node-device${device.on ? '' : ' net-node-device--off'}`}
            >
              {onMap ? (
                <button
                  type="button"
                  className="net-node-name net-node-name--show"
                  title={
                    device.on ? 'Weź na mapie — figurę prowadzisz lewą belką' : 'Pokaż na mapie'
                  }
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
                  if (fromMap(operation)) return null;
                  // „Włącz" przy działającym urządzeniu i „Wyłącz" przy wyłączonym
                  // to przyciski, które nic nie zmieniają — serwer je zresztą
                  // odrzuci, więc niech nie kuszą.
                  if (operation === 'on' && device.on) return null;
                  if (operation !== 'on' && !device.on) return null;
                  return (
                    <button
                      key={operation}
                      type="button"
                      className="small-button"
                      disabled={
                        busy ||
                        spent ||
                        (operation === 'open' || operation === 'close'
                          ? device.wallId === undefined
                          : false)
                      }
                      title="Obsługa urządzenia kosztuje Akcję Sieciową, a węzeł działa raz na Turę"
                      onClick={() => onOperate(device.id, operation)}
                    >
                      {NET_DEVICE_OPERATION_LABELS[operation]}
                    </button>
                  );
                })}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
