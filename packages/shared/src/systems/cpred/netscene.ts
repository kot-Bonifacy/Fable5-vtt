/**
 * Sieć ze sceny (etap 62, zlecenie MG z 28.10; węzły wg rodzaju — etap 70d).
 *
 * MG postawił na mapie kamery i wieżyczki z ikoną urządzenia, a netrunner po
 * podłączeniu nie zobaczył żadnej z nich: urządzenie istniało dla Sieci dopiero
 * wtedy, gdy MG wpisał je ręcznie w węzeł kontrolny Architektury. Teraz ikona
 * figury wystarcza — gniazdo bez Architektury składa prostą Sieć ze sceny,
 * a do Architektury MG niepodpięte figury dochodzą w węźle swojej grupy.
 *
 * Od 70d (decyzja MG nr 5 z 11.11) Sieć ze sceny ma węzły wg rodzaju:
 * „Monitoring” (kamery, czujniki), „Obrona” (wieżyczki, drony, roboty)
 * i „Instalacje” (terminale, strefy środowiskowe, drzwi „Sterowane z Sieci”).
 * Jeden węzeł na wszystko dawał całej scenie jedną czynność na rundę.
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
  type NetDefenseKind,
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
  'ground-drone': 'drone',
  robot: 'drone',
  sensor: 'environment',
  terminal: 'environment',
};

/**
 * Ikona strefy bronionej na mapie (29.10, zlecenie MG) — sylwetka z tego samego
 * kompletu co ikony figur. Dron jest robotem, a jego strefa bez ikony była
 * zwykłym prostokątem pułapki; stanowiska i systemy środowiskowe ikony nie
 * dostają, bo wieżyczka stoi figurą, a podłoga to podłoga. Tabela s. 213 nie
 * ma kolumny „latający/naziemny”, więc naziemnego rozpoznaje nazwa wpisu.
 */
export function netDefenseGlyph(entry: {
  defenseKind: NetDefenseKind;
  name: string;
}): TokenGlyph | null {
  if (entry.defenseKind !== 'drone') return null;
  return /naziemn/i.test(entry.name) ? 'ground-drone' : 'drone';
}

/**
 * Ikona figury, którą „Postaw figurę urządzenia” (70d) stawia na starej strefie
 * drona albo stanowiska: dron z nazwy wpisu, stanowisko to wieżyczka. System
 * środowiskowy figury nie dostaje — podłoga to podłoga.
 */
export function netDefenseFigureGlyph(entry: {
  defenseKind: NetDefenseKind;
  name: string;
}): TokenGlyph | null {
  if (entry.defenseKind === 'emplacement') return 'turret';
  return netDefenseGlyph(entry);
}

/** PT Kontroli węzła Sieci ze sceny, gdy tabele podręcznika nie podają innego. */
export const NET_SCENE_CONTROL_DV = 8;

/** Figura sceny, która może być urządzeniem — tyle, ile reguła musi o niej wiedzieć. */
export interface NetSceneFigure {
  tokenId: string;
  name: string;
  glyph: TokenGlyph | null;
}

/**
 * Strefa środowiskowa sceny (70d) — podłoga, siatka, spryskiwacze. Wiązanie
 * mieszka na wierszu strefy (`architectureId` / `floorId` / `deviceId`, #33),
 * nie w urządzeniu, więc wołający podaje tylko strefy jeszcze niepodpięte.
 */
export interface NetSceneZone {
  zoneId: number;
  name: string;
}

/** Drzwi albo okno „Sterowane z Sieci” (70d). */
export interface NetSceneDoor {
  wallId: number;
  name: string;
}

/** Wszystko na scenie, co może być urządzeniem Sieci ze sceny. */
export interface NetSceneParts {
  figures: readonly NetSceneFigure[];
  zones?: readonly NetSceneZone[];
  doors?: readonly NetSceneDoor[];
}

/** Co już jest podpięte w którejś Architekturze kampanii — tego się nie dopina. */
export interface NetSceneWired {
  tokens: ReadonlySet<string>;
  walls?: ReadonlySet<number>;
}

/** Urządzenie, które netrunner widzi w Sieci, zanim przejmie jego węzeł. */
export interface NetSightedDevice {
  name: string;
  deviceKind: NetDeviceKind;
}

/** Grupy węzłów Sieci ze sceny (70d) — w tej kolejności stoją w szybie. */
export const NET_SCENE_GROUPS = ['monitoring', 'defense', 'installations'] as const;
export type NetSceneGroup = (typeof NET_SCENE_GROUPS)[number];

/** Etykieta węzła grupy — jawna dla gracza po wejściu, jak każda etykieta piętra. */
export const NET_SCENE_GROUP_LABELS: Record<NetSceneGroup, string> = {
  monitoring: 'Monitoring',
  defense: 'Obrona',
  installations: 'Instalacje',
};

/**
 * Grupa urządzenia: z ikony figury, gdy jest (czujnik to oko, choć w Sieci jest
 * przełącznikiem), inaczej z rodzaju. Jedna funkcja dla składania i dopinania.
 */
export function netSceneGroupOf(device: {
  deviceKind: NetDeviceKind;
  glyph?: TokenGlyph | null;
}): NetSceneGroup {
  if (device.glyph === 'camera' || device.glyph === 'sensor') return 'monitoring';
  if (device.glyph === 'terminal') return 'installations';
  if (device.deviceKind === 'camera') return 'monitoring';
  if (device.deviceKind === 'turret' || device.deviceKind === 'drone') return 'defense';
  return 'installations';
}

/** Przedrostek id urządzenia ze strefy sceny (po imporcie kampanii numer strefy się zmienia). */
export const NET_SCENE_ZONE_DEVICE_PREFIX = 'zone-';
/** Id urządzenia ze strefy sceny — strefa wskazuje je w `deviceId`. */
export const netSceneZoneDeviceId = (zoneId: number): string =>
  `${NET_SCENE_ZONE_DEVICE_PREFIX}${zoneId}`;
/** Id urządzenia z drzwi sceny. */
export const netSceneWallDeviceId = (wallId: number): string => `wall-${wallId}`;

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

interface GroupedDevice {
  device: CpredNetDevice;
  group: NetSceneGroup;
}

/** Figury, strefy i drzwi jako urządzenia z grupą — figury, potem strefy, potem drzwi. */
function netScenePartDevices(parts: NetSceneParts): GroupedDevice[] {
  const grouped: GroupedDevice[] = [];
  for (const figure of parts.figures) {
    const kind = figure.glyph ? NET_DEVICE_KIND_BY_GLYPH[figure.glyph] : undefined;
    if (!kind) continue;
    grouped.push({
      device: sceneDevice(figure, kind),
      group: netSceneGroupOf({ deviceKind: kind, glyph: figure.glyph }),
    });
  }
  for (const zone of parts.zones ?? []) {
    const name =
      zone.name.trim().slice(0, NET_DEVICE_NAME_MAX) || NET_DEVICE_KIND_LABELS.environment;
    grouped.push({
      device: { id: netSceneZoneDeviceId(zone.zoneId), name, deviceKind: 'environment' },
      group: 'installations',
    });
  }
  for (const door of parts.doors ?? []) {
    const name = door.name.trim().slice(0, NET_DEVICE_NAME_MAX) || NET_DEVICE_KIND_LABELS.door;
    grouped.push({
      device: {
        id: netSceneWallDeviceId(door.wallId),
        name,
        deviceKind: 'door',
        wallId: door.wallId,
      },
      group: 'installations',
    });
  }
  return grouped;
}

const GROUP_LABEL_RE = /^(Monitoring|Obrona|Instalacje)(?: \d+)?$/;

/**
 * Grupa węzła złożonego przez Sieć ze sceny (70d) — po id `scene-…` i etykiecie
 * grupy. Węzeł MG albo stary „Węzeł kontrolny” sprzed 70d grupy nie ma
 * i przyjmuje wszystko.
 */
export function netSceneNodeGroup(
  floor: Pick<CpredNetFloor, 'id' | 'label' | 'kind'>,
): NetSceneGroup | null {
  if (floor.kind !== 'controlNode' || !floor.id.startsWith('scene-')) return null;
  const label = GROUP_LABEL_RE.exec(floor.label)?.[1];
  if (!label) return null;
  return NET_SCENE_GROUPS.find((group) => NET_SCENE_GROUP_LABELS[group] === label) ?? null;
}

/** Wolne id i etykieta kolejnego węzła grupy („Monitoring 2”). */
function nextGroupNode(
  group: NetSceneGroup,
  floors: readonly Pick<CpredNetFloor, 'id' | 'label'>[],
  dv: number,
): CpredNetFloor {
  const label = NET_SCENE_GROUP_LABELS[group];
  const labelOf = (n: number) => (n === 1 ? label : `${label} ${n}`);
  let n = 1;
  while (floors.some((floor) => floor.id === `scene-${group}-${n}` || floor.label === labelOf(n))) {
    n += 1;
  }
  return { id: `scene-${group}-${n}`, kind: 'controlNode', label: labelOf(n), dv, devices: [] };
}

/** Id piętra wejścia Sieci ze sceny — po nim poznaje się Architekturę złożoną ze sceny. */
export const NET_SCENE_ENTRY_FLOOR_ID = 'scene-entry';

/**
 * Czy Architekturę złożyła Sieć ze sceny (62, 70d), a nie MG w edytorze. Strefy
 * i drzwi „Sterowane z Sieci” dochodzą same tylko do takiej — w Architekturze
 * MG wiąże je pole „Węzeł kontrolny” na karcie strefy (#33), więc ręcznie
 * zbudowana Sieć (np. „Brama” z T5) nie zmienia się od tego, co stoi na mapie.
 */
export function netIsSceneArchitecture(architecture: CpredNetArchitecture): boolean {
  const trunk = architecture.branches.find((branch) => branch.parentFloor === null);
  return trunk?.floors[0]?.id === NET_SCENE_ENTRY_FLOOR_ID;
}

/**
 * Prosta Sieć gniazda, któremu MG nie wybrał Architektury: piętro wejścia
 * i węzły grup („Monitoring”, „Obrona”, „Instalacje”) z urządzeniami sceny,
 * bez haseł i LOD-ów. Węzeł powstaje tylko z urządzeniem; nadmiar ponad
 * {@link NET_DEVICES_PER_NODE_MAX} idzie do „Monitoring 2” itd.
 */
export function netSceneArchitecture(
  input: { sceneName: string; dv: number } & NetSceneParts,
): CpredNetArchitecture {
  const grouped = netScenePartDevices(input);
  const floors: CpredNetFloor[] = [
    { id: NET_SCENE_ENTRY_FLOOR_ID, kind: 'empty', label: 'Wejście' },
  ];
  for (const group of NET_SCENE_GROUPS) {
    const devices = grouped.filter((entry) => entry.group === group).map((entry) => entry.device);
    for (let at = 0; at < devices.length; at += NET_DEVICES_PER_NODE_MAX) {
      if (floors.length >= NET_FLOORS_MAX) break;
      const node = nextGroupNode(group, floors, input.dv);
      node.devices = devices.slice(at, at + NET_DEVICES_PER_NODE_MAX);
      floors.push(node);
    }
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
 * Dopina do Architektury urządzenia sceny, których nie podpięto nigdzie
 * (`wired` — figury i drzwi wszystkich Architektur kampanii; strefy wołający
 * odsiewa sam, bo ich wiązanie mieszka na wierszu strefy).
 *
 * Węzeł wybiera się wg grupy (70d): najpierw taki, który już trzyma urządzenia
 * tej grupy i ma miejsce, potem pierwszy z miejscem bez cudzej grupy (węzeł MG,
 * stary „Węzeł kontrolny”), a gdy nie ma żadnego — nowy węzeł grupy na dole
 * trzonu, z PT pierwszego węzła albo `dv`. `placed` mówi, gdzie co trafiło
 * (id urządzenia → id piętra).
 */
export function netAdoptSceneDevices(
  architecture: CpredNetArchitecture,
  parts: NetSceneParts,
  wired: NetSceneWired,
  dv: number,
): { architecture: CpredNetArchitecture; adopted: number; placed: Map<string, string> } {
  const waiting = netScenePartDevices({
    figures: parts.figures.filter((figure) => !wired.tokens.has(figure.tokenId)),
    zones: parts.zones ?? [],
    doors: (parts.doors ?? []).filter((door) => !wired.walls?.has(door.wallId)),
  });
  const placed = new Map<string, string>();
  if (waiting.length === 0) return { architecture, adopted: 0, placed };

  const glyphByToken = new Map(parts.figures.map((figure) => [figure.tokenId, figure.glyph]));
  const groupOfDevice = (device: CpredNetDevice) =>
    netSceneGroupOf({
      deviceKind: device.deviceKind,
      glyph: device.tokenId ? glyphByToken.get(device.tokenId) : null,
    });

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
  const hasRoom = (floor: CpredNetFloor) => (floor.devices?.length ?? 0) < NET_DEVICES_PER_NODE_MAX;
  const holdsGroup = (floor: CpredNetFloor, group: NetSceneGroup) => {
    const own = netSceneNodeGroup(floor);
    if (own) return own === group;
    return (floor.devices ?? []).some((held) => groupOfDevice(held) === group);
  };
  let adopted = 0;
  for (const { device, group } of waiting) {
    let node =
      nodes.find((floor) => hasRoom(floor) && holdsGroup(floor, group)) ??
      nodes.find((floor) => hasRoom(floor) && netSceneNodeGroup(floor) === null);
    if (!node) {
      if (!trunk || floorCount >= NET_FLOORS_MAX) break;
      node = nextGroupNode(
        group,
        branches.flatMap((branch) => branch.floors),
        nodeDv,
      );
      trunk.floors.push(node);
      nodes.push(node);
      floorCount += 1;
    }
    node.devices = [...(node.devices ?? []), device];
    placed.set(device.id, node.id);
    adopted += 1;
  }
  return { architecture: { ...architecture, branches }, adopted, placed };
}

/**
 * Zdejmuje urządzenie o tym id ze wszystkich węzłów (70d — drzwi, którym MG
 * odhaczył „Sterowane z Sieci”, strefa „Poza Siecią”). Węzeł zostaje, nawet
 * pusty: pozycje pięter w trwających runach liczą się od jego miejsca.
 */
export function netReleaseSceneDevice(
  architecture: CpredNetArchitecture,
  deviceId: string,
): { architecture: CpredNetArchitecture; removed: boolean } {
  let removed = false;
  const branches = architecture.branches.map((branch) => ({
    ...branch,
    floors: branch.floors.map((floor) => {
      if (!floor.devices?.some((device) => device.id === deviceId)) return floor;
      removed = true;
      return { ...floor, devices: floor.devices.filter((device) => device.id !== deviceId) };
    }),
  }));
  return removed
    ? { architecture: { ...architecture, branches }, removed }
    : { architecture, removed };
}

/** Każda figura, którą jakaś Architektura już nazywa urządzeniem. */
export function netWiredTokenIds(architectures: readonly CpredNetArchitecture[]): Set<string> {
  const ids = new Set<string>();
  for (const device of allDevices(architectures)) if (device.tokenId) ids.add(device.tokenId);
  return ids;
}

/** Każde drzwi i okno, które jakaś Architektura już otwiera (70d). */
export function netWiredWallIds(architectures: readonly CpredNetArchitecture[]): Set<number> {
  const ids = new Set<number>();
  for (const device of allDevices(architectures)) {
    if (device.wallId !== undefined) ids.add(device.wallId);
  }
  return ids;
}

/**
 * Czy ta Architektura ma urządzenie o tym id (na tym piętrze, gdy podane) —
 * strefa wskazuje urządzenie po id, a skasowane albo przebudowane już go nie ma.
 */
export function netHasDevice(
  architecture: CpredNetArchitecture,
  floorId: string | null | undefined,
  deviceId: string | null | undefined,
): boolean {
  if (!deviceId) return false;
  for (const branch of architecture.branches) {
    for (const floor of branch.floors) {
      if (floorId && floor.id !== floorId) continue;
      if (floor.devices?.some((device) => device.id === deviceId)) return true;
    }
  }
  return false;
}

function* allDevices(architectures: readonly CpredNetArchitecture[]): Generator<CpredNetDevice> {
  for (const architecture of architectures) {
    for (const branch of architecture.branches) {
      for (const floor of branch.floors) yield* floor.devices ?? [];
    }
  }
}
