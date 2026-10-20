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

interface MapFramer {
  framePoint: (x: number, y: number, screenOffset?: ScenePoint) => void;
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
 */
function clearOfRunWindow(): ScenePoint {
  const map = document.querySelector('.map-area')?.getBoundingClientRect();
  const panel = document.querySelector('.net-run-window')?.getBoundingClientRect();
  if (!map || !panel || panel.width === 0) return { x: 0, y: 0 };
  const overlaps =
    panel.left < map.right &&
    panel.right > map.left &&
    panel.top < map.bottom &&
    panel.bottom > map.top;
  if (!overlaps) return { x: 0, y: 0 };
  const left = Math.max(0, panel.left - map.left);
  const right = Math.max(0, map.right - panel.right);
  const target = left >= right ? map.left + left / 2 : panel.right + right / 2;
  return { x: target - (map.left + map.width / 2), y: 0 };
}

function frame(point: ScenePoint): void {
  framer?.framePoint(point.x, point.y, clearOfRunWindow());
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
 * Kadr na jednym urządzeniu: klik w jego nazwę w oknie Sieci (zostaje) albo
 * strzał wieżyczki (`returnTo` — rzut oka i powrót do figury netrunnera).
 */
export function showNetDevice(device: NetDeviceView, returnTo?: string): void {
  if (!framer || !onThisMap(device)) return;
  cancelFrames();
  if (returnTo) glance(device, 0, returnTo);
  else show(device);
}
