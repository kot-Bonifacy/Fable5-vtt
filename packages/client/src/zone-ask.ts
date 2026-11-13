import type {
  DefenseZoneView,
  NetDeviceView,
  NetRunPayload,
  ScenePoint,
  SceneView,
  TokenView,
} from '@vtt/shared';
import { isPointInZone, tokenCentre, zoneTouchedByPath } from '@vtt/shared';
import { heldNodes } from './components/netrun/NetEyesStrip.js';

/**
 * Okienko strefy (etap 70d; zaległość 🔴 66e pkt 3): klik gracza w zauważoną
 * strefę był marszem na nią bez pytania — Iskra weszła na podłogę, którą
 * widziała, i straciła 10 PW. Teraz klik w strefę albo marsz przez nią do
 * punktu za nią pyta przy kursorze: „Wejdź mimo to”, „Rozbrój”, a netrunnerowi
 * trzymającemu jej węzeł — „Wyłącz / Włącz”.
 *
 * Gracz ma w `zoneStore` wyłącznie strefy, które widzi (jawne albo przez siebie
 * zauważone), więc pytanie niczego nie zdradza. Strefa, na której figura już
 * stoi, nie pyta — zejście z niej to nie wejście.
 */
export function zonesOnWalk(input: {
  zones: readonly DefenseZoneView[];
  scene: Pick<SceneView, 'id' | 'grid'>;
  token: Pick<TokenView, 'x' | 'y' | 'size'>;
  /** Punkt kliknięcia (świat). */
  goal: ScenePoint;
  /** Trasa marszu w położeniach figury (lewy górny róg), od startu; null — sam klik. */
  route: readonly ScenePoint[] | null;
}): DefenseZoneView[] {
  const { scene, token } = input;
  const half = (Math.max(1, token.size) * scene.grid.sizePx) / 2;
  const start = tokenCentre(token, scene);
  const path = input.route?.map((point) => ({ x: point.x + half, y: point.y + half })) ?? null;
  return input.zones.filter((zone) => {
    if (zone.sceneId !== scene.id) return false;
    if (isPointInZone(zone, start)) return false;
    if (isPointInZone(zone, input.goal)) return true;
    return path !== null && path.length >= 2 && zoneTouchedByPath(zone, path);
  });
}

/** Urządzenie Sieci, które przełącza tę strefę, w węźle trzymanym przez mój run. */
export interface ZoneNetSwitch {
  runId: string;
  floorId: string;
  device: NetDeviceView;
}

/**
 * Przełącznik strefy u netrunnera (70d): urządzenie z `zoneId` w węzłach,
 * które któryś z jego runów trzyma (karta piętra albo ślad — te same co pasek
 * „Oczy i urządzenia”). Rozbrojona na miejscu strefa przełącznika nie ma.
 */
export function zoneNetSwitch(
  runs: readonly Pick<NetRunPayload, 'runId' | 'run'>[],
  zoneId: number,
): ZoneNetSwitch | null {
  for (const run of runs) {
    for (const node of heldNodes(run.run)) {
      const device = node.devices?.find((entry) => entry.zoneId === zoneId);
      if (!device || device.disarmed) continue;
      const operation = device.on ? 'off' : 'on';
      if (!device.operations.includes(operation)) continue;
      return { runId: run.runId, floorId: node.id, device };
    }
  }
  return null;
}
