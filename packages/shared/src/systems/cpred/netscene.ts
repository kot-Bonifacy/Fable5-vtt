/**
 * Sieć ze sceny (etap 62, zlecenie MG z 28.10).
 *
 * MG postawił na mapie kamery i wieżyczki z ikoną urządzenia, a netrunner po
 * podłączeniu nie zobaczył żadnej z nich: urządzenie istniało dla Sieci dopiero
 * wtedy, gdy MG wpisał je ręcznie w węzeł kontrolny Architektury. Teraz ikona
 * figury wystarcza — gniazdo bez Architektury składa prostą Sieć ze sceny,
 * a do Architektury MG niepodpięte figury dochodzą w pierwszym wolnym węźle.
 */
import type { TokenGlyph } from '../../tokens.js';
import {
  NET_ARCHITECTURE_NAME_MAX,
  NET_DEVICE_KIND_LABELS,
  NET_DEVICE_NAME_MAX,
  NET_DEVICES_PER_NODE_MAX,
  NET_FLOORS_MAX,
  type CpredNetArchitecture,
  type CpredNetDevice,
  type CpredNetFloor,
  type NetDeviceKind,
} from './netrunning.js';

/**
 * Które ikony figur są urządzeniami Sieci (decyzja MG z 28.10). Mina nie ma
 * łącza — wybucha, nie słucha. Robot strzela jak dron, a czujnik i terminal są
 * przełącznikiem, który MG opowiada.
 */
export const NET_DEVICE_KIND_BY_GLYPH: Partial<Record<TokenGlyph, NetDeviceKind>> = {
  camera: 'camera',
  turret: 'turret',
  drone: 'drone',
  robot: 'drone',
  sensor: 'environment',
  terminal: 'environment',
};

/** PT Kontroli węzła Sieci ze sceny, gdy tabele podręcznika nie podają innego. */
export const NET_SCENE_CONTROL_DV = 8;

/** Figura sceny, która może być urządzeniem — tyle, ile reguła musi o niej wiedzieć. */
export interface NetSceneFigure {
  tokenId: string;
  name: string;
  glyph: TokenGlyph | null;
}

/** Urządzenie, które netrunner widzi w Sieci, zanim przejmie jego węzeł. */
export interface NetSightedDevice {
  name: string;
  deviceKind: NetDeviceKind;
}

function sceneDevice(figure: NetSceneFigure, deviceKind: NetDeviceKind): CpredNetDevice {
  const name =
    figure.name.trim().slice(0, NET_DEVICE_NAME_MAX) || NET_DEVICE_KIND_LABELS[deviceKind];
  return { id: `scene-${figure.tokenId}`.slice(0, 40), name, deviceKind, tokenId: figure.tokenId };
}

/** Figury z ikoną urządzenia Sieci jako urządzenia, w kolejności sceny. */
export function netSceneDevices(figures: readonly NetSceneFigure[]): CpredNetDevice[] {
  const devices: CpredNetDevice[] = [];
  for (const figure of figures) {
    const kind = figure.glyph ? NET_DEVICE_KIND_BY_GLYPH[figure.glyph] : undefined;
    if (kind) devices.push(sceneDevice(figure, kind));
  }
  return devices;
}

function controlNode(index: number, dv: number, devices: CpredNetDevice[]): CpredNetFloor {
  return {
    id: `scene-node-${index}`,
    kind: 'controlNode',
    label: 'Węzeł kontrolny',
    dv,
    devices,
  };
}

/**
 * Prosta Sieć gniazda, któremu MG nie wybrał Architektury: piętro wejścia
 * i węzeł kontrolny z urządzeniami sceny, bez haseł i LOD-ów. Każde kolejne
 * {@link NET_DEVICES_PER_NODE_MAX} urządzeń dostaje kolejny węzeł.
 */
export function netSceneArchitecture(input: {
  sceneName: string;
  dv: number;
  figures: readonly NetSceneFigure[];
}): CpredNetArchitecture {
  const devices = netSceneDevices(input.figures);
  const floors: CpredNetFloor[] = [{ id: 'scene-entry', kind: 'empty', label: 'Wejście' }];
  for (let at = 0; at < devices.length || floors.length === 1; at += NET_DEVICES_PER_NODE_MAX) {
    if (floors.length >= NET_FLOORS_MAX) break;
    floors.push(
      controlNode(floors.length, input.dv, devices.slice(at, at + NET_DEVICES_PER_NODE_MAX)),
    );
  }
  return {
    id: 'net.scena',
    name: `Sieć: ${input.sceneName}`.slice(0, NET_ARCHITECTURE_NAME_MAX),
    difficulty: 'standard',
    branches: [{ id: 'trunk', parentFloor: null, floors }],
    notes: 'Złożona sama z urządzeń sceny przy pierwszym podłączeniu.',
  };
}

/**
 * Dopina do Architektury figury sceny, których nie podpięto nigdzie
 * (`wired` — figury urządzeń wszystkich Architektur kampanii). Idą do
 * pierwszego węzła kontrolnego z wolnym miejscem (trzon, potem odgałęzienia);
 * gdy wszystkie są pełne albo żadnego nie ma, na dole trzonu staje nowy węzeł
 * z PT pierwszego węzła albo `dv`.
 */
export function netAdoptSceneDevices(
  architecture: CpredNetArchitecture,
  figures: readonly NetSceneFigure[],
  wired: ReadonlySet<string>,
  dv: number,
): { architecture: CpredNetArchitecture; adopted: number } {
  const waiting = netSceneDevices(figures.filter((figure) => !wired.has(figure.tokenId)));
  if (waiting.length === 0) return { architecture, adopted: 0 };

  const branches = architecture.branches.map((branch) => ({
    ...branch,
    floors: branch.floors.map((floor) =>
      floor.kind === 'controlNode' ? { ...floor, devices: [...(floor.devices ?? [])] } : floor,
    ),
  }));
  const nodes = branches.flatMap((branch) =>
    branch.floors.filter((floor) => floor.kind === 'controlNode'),
  );
  const nodeDv = nodes[0]?.dv ?? dv;
  const trunk = branches.find((branch) => branch.parentFloor === null);
  let floorCount = branches.reduce((total, branch) => total + branch.floors.length, 0);
  let adopted = 0;
  for (const device of waiting) {
    let node = nodes.find((floor) => (floor.devices?.length ?? 0) < NET_DEVICES_PER_NODE_MAX);
    if (!node) {
      if (!trunk || floorCount >= NET_FLOORS_MAX) break;
      node = controlNode(trunk.floors.length, nodeDv, []);
      trunk.floors.push(node);
      nodes.push(node);
      floorCount += 1;
    }
    node.devices = [...(node.devices ?? []), device];
    adopted += 1;
  }
  return { architecture: { ...architecture, branches }, adopted };
}

/** Każda figura, którą jakaś Architektura już nazywa urządzeniem. */
export function netWiredTokenIds(architectures: readonly CpredNetArchitecture[]): Set<string> {
  const ids = new Set<string>();
  for (const architecture of architectures) {
    for (const branch of architecture.branches) {
      for (const floor of branch.floors) {
        for (const device of floor.devices ?? []) if (device.tokenId) ids.add(device.tokenId);
      }
    }
  }
  return ids;
}
