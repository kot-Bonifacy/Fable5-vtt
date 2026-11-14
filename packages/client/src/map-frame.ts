import type { NetDeviceView, ScenePoint } from '@vtt/shared';

/**
 * Kadr mapy na urządzeniu przejętym w Sieci (zlecenie MG z 20.10).
 *
 * Moduł, a nie store — z tego samego powodu co `map-ping.ts`: kadr to coś, co
 * się dzieje, a nie stan. Okno Sieci mówi „pokaż”, mapa przesuwa widok.
 *
 * Dwa rodzaje kadru, bo dwa rodzaje urządzeń (decyzja MG):
 *  - **kamera** zostaje w kadrze — netrunner patrzy jej oczami;
 *  - **wieżyczka, dron i reszta** dostają rzut oka: kadr na `GLANCE_MS`,
 *    potem powrót na figurę netrunnera. Kto w tym czasie ruszył mapę ręką,
 *    zostaje tam, dokąd ją przesunął.
 *
 * Każdy kadr stawia też w miejscu urządzenia znacznik z jego nazwą (rysunek
 * pingu, tylko u siebie): wieżyczka poza wzrokiem netrunnera to czerń, a gracz
 * ma wiedzieć, *co* przejął. Punkt kadru ląduje na środku tej części mapy,
 * której nie zasłania okno Sieci.
 */

/** Ile trwa rzut oka na wieżyczkę, zanim kadr wróci do netrunnera. */
export const GLANCE_MS = 2500;
/** Kiedy przejazd na pewno stoi (`FRAME_TOKEN_MS` renderera to 350 ms). */
const SETTLED_MS = 500;

/** Ile px ekranu okno Sieci zasłania przy lewym i prawym brzegu mapy. */
export interface SideInsets {
  left: number;
  right: number;
}

const NO_INSETS: SideInsets = { left: 0, right: 0 };

interface MapFramer {
  framePoint: (x: number, y: number, screenOffset?: ScenePoint, sideInsets?: SideInsets) => void;
  /** Granica kamery wraca do brzegów sceny (okno Sieci zamknięte). */
  releaseInsets: () => void;
  tokenCentre: (tokenId: string) => ScenePoint | null;
  /** Środek widoku w punktach sceny; null, gdy mapy jeszcze nie ma. */
  viewCentre: () => ScenePoint | null;
  /** Znacznik z podpisem w punkcie sceny — rysunek pingu, tylko u siebie. */
  mark: (x: number, y: number, label: string) => void;
}

let sceneId: string | null = null;
let framer: MapFramer | null = null;
/** Kadry w toku — nowy pokaz kasuje stary. */
let timers: ReturnType<typeof setTimeout>[] = [];

/** Mapa mówi „pokazuję tę scenę, kadry kieruj tutaj”. */
export function bindMapFrame(scene: string | null, next: MapFramer | null): void {
  sceneId = scene;
  framer = next;
  if (!next) cancelFrames();
}

function cancelFrames(): void {
  for (const timer of timers) clearTimeout(timer);
  timers = [];
}

type PlacedDevice = NetDeviceView & { at: NonNullable<NetDeviceView['at']> };

/** Urządzenie, które da się pokazać na scenie, którą ta mapa właśnie rysuje. */
function onThisMap(device: NetDeviceView): device is PlacedDevice {
  return device.at !== undefined && device.at.sceneId === sceneId;
}

/**
 * O ile (px ekranu) przesunąć punkt od środka mapy, żeby wylądował na środku
 * pasa, którego nie zasłania okno Sieci — szerszego z dwóch po jego bokach.
 *
 * Do tego, o ile kamera ma wolno wyjechać poza brzeg sceny po stronie okna
 * (70f pkt 1, 14.11): bez tego urządzenie przy krawędzi sceny — Sowa
 * w „Fabryce dronów” — zostawało pod oknem, bo kadr nie wyjeżdżał poza scenę.
 * Zapas to zasłonięta szerokość i pół wolnego pasa: urządzenie przy samym
 * brzegu staje na środku pasa, jak każde inne.
 */
export function clearOfRunWindow(
  map: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width'> | undefined,
  panel: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width'> | undefined,
): { offset: ScenePoint; insets: SideInsets } {
  const none = { offset: { x: 0, y: 0 }, insets: NO_INSETS };
  if (!map || !panel || panel.width === 0) return none;
  const overlaps =
    panel.left < map.right &&
    panel.right > map.left &&
    panel.top < map.bottom &&
    panel.bottom > map.top;
  if (!overlaps) return none;
  const left = Math.max(0, panel.left - map.left);
  const right = Math.max(0, map.right - panel.right);
  const freeOnLeft = left >= right;
  const target = freeOnLeft ? map.left + left / 2 : panel.right + right / 2;
  const covered = freeOnLeft ? map.right - panel.left : panel.right - map.left;
  const slack = Math.max(0, covered) + (freeOnLeft ? left : right) / 2;
  return {
    offset: { x: target - (map.left + map.width / 2), y: 0 },
    insets: freeOnLeft ? { left: 0, right: slack } : { left: slack, right: 0 },
  };
}

function frame(point: ScenePoint): void {
  const { offset, insets } = clearOfRunWindow(
    document.querySelector('.map-area')?.getBoundingClientRect(),
    document.querySelector('.net-run-window')?.getBoundingClientRect(),
  );
  framer?.framePoint(point.x, point.y, offset, insets);
}

/** Okno Sieci się zamknęło: kamera znów kończy się na brzegu sceny. */
export function releaseRunWindowInsets(): void {
  framer?.releaseInsets();
}

function show(device: PlacedDevice): void {
  frame(device.at);
  framer?.mark(device.at.x, device.at.y, device.name);
}

/**
 * Rzut oka: kadr na urządzeniu od `delay`, a po `GLANCE_MS` powrót na figurę
 * netrunnera — chyba że widok nie stoi już tam, gdzie go postawił przejazd
 * (ręka na mapie). Porównuje się ze środkiem po przejeździe, nie z punktem:
 * urządzenie przy krawędzi mapy gracza nie wjedzie na środek ekranu.
 */
function glance(device: PlacedDevice, delay: number, runnerTokenId: string | null): void {
  let settled: ScenePoint | null = null;
  timers.push(setTimeout(() => show(device), delay));
  timers.push(setTimeout(() => (settled = framer?.viewCentre() ?? null), delay + SETTLED_MS));
  if (runnerTokenId === null) return;
  timers.push(
    setTimeout(() => {
      const now = framer?.viewCentre();
      const runner = framer?.tokenCentre(runnerTokenId);
      if (runner && settled && now && Math.hypot(now.x - settled.x, now.y - settled.y) < 1) {
        frame(runner);
      }
    }, delay + GLANCE_MS),
  );
}

/**
 * Pokazuje urządzenia węzła, który netrunner właśnie przejął: rzut oka na
 * każdą wieżyczkę po kolei, a na końcu kamera, która w kadrze zostaje. Bez
 * kamery kadr wraca na figurę netrunnera.
 */
export function showNetDevices(devices: readonly NetDeviceView[], runnerTokenId: string): void {
  if (!framer) return;
  const placed = devices.filter(onThisMap);
  if (placed.length === 0) return;
  cancelFrames();
  const glances = placed.filter((device) => device.deviceKind !== 'camera');
  const camera = placed.find((device) => device.deviceKind === 'camera');
  glances.forEach((device, index) => {
    const last = index === glances.length - 1;
    // Powrót do netrunnera tylko po ostatniej wieżyczce i tylko bez kamery.
    glance(device, index * GLANCE_MS, last && !camera ? runnerTokenId : null);
  });
  if (camera) timers.push(setTimeout(() => show(camera), glances.length * GLANCE_MS));
}

/**
 * „⌂” paska oczu (etap 70c): kadr wraca na figurę netrunnera i tam zostaje.
 * Kasuje rzuty oka w toku — ich powrót i tak prowadziłby tutaj.
 */
export function showNetRunner(runnerTokenId: string): void {
  if (!framer) return;
  const runner = framer.tokenCentre(runnerTokenId);
  if (!runner) return;
  cancelFrames();
  frame(runner);
}

/**
 * Kadr na jednym urządzeniu: klik w miniaturę paska oczu (zostaje) albo
 * strzał wieżyczki (`returnTo` — rzut oka i powrót do figury netrunnera).
 */
export function showNetDevice(device: NetDeviceView, returnTo?: string): void {
  if (!framer || !onThisMap(device)) return;
  cancelFrames();
  if (returnTo) glance(device, 0, returnTo);
  else show(device);
}
