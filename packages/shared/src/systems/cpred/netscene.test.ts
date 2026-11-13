import { describe, expect, it } from 'vitest';
import {
  NET_DEVICES_PER_NODE_MAX,
  validateNetArchitecture,
  type CpredNetArchitecture,
} from './netrunning.js';
import {
  netAdoptSceneDevices,
  netDefenseFigureGlyph,
  netDefenseGlyph,
  netHasDevice,
  netReleaseSceneDevice,
  netSceneArchitecture,
  netSceneDevices,
  netSceneGroupOf,
  netSceneNodeGroup,
  netWiredTokenIds,
  netWiredWallIds,
  type NetSceneFigure,
} from './netscene.js';
import { netEntryPosition } from './netrun.js';

const figure = (tokenId: string, glyph: NetSceneFigure['glyph'], name = tokenId) => ({
  tokenId,
  name,
  glyph,
});

const nodesOf = (architecture: CpredNetArchitecture) =>
  architecture.branches.flatMap((branch) =>
    branch.floors.filter((floor) => floor.kind === 'controlNode'),
  );

describe('netSceneDevices', () => {
  it('turns device glyphs into devices bound to their figures, mines and plain figures stay out', () => {
    const devices = netSceneDevices([
      figure('t1', 'camera', 'Kamera nad barem'),
      figure('t2', 'turret'),
      figure('t3', 'robot'),
      figure('t4', 'sensor'),
      figure('t5', 'terminal'),
      figure('t6', 'drone'),
      figure('t7', 'mine'),
      figure('t8', null, 'Strażnik'),
    ]);
    expect(devices.map((device) => [device.tokenId, device.deviceKind])).toEqual([
      ['t1', 'camera'],
      ['t2', 'turret'],
      ['t3', 'drone'],
      ['t4', 'environment'],
      ['t5', 'environment'],
      ['t6', 'drone'],
    ]);
    expect(devices[0]).toMatchObject({ id: 'scene-t1', name: 'Kamera nad barem' });
  });

  it('a figure with an empty name is called by its kind', () => {
    expect(netSceneDevices([figure('t1', 'camera', '  ')])[0]?.name).toBe('Kamera');
  });
});

describe('netSceneArchitecture', () => {
  it('builds an entry floor and a node per group, in the order Monitoring, Obrona, Instalacje', () => {
    const architecture = netSceneArchitecture({
      sceneName: 'restauracja Mariana',
      dv: 8,
      figures: [
        figure('tur', 'turret'),
        figure('cam', 'camera'),
        figure('term', 'terminal'),
        figure('sens', 'sensor'),
        figure('bot', 'robot'),
      ],
      zones: [{ zoneId: 7, name: 'Podłoga elektryczna' }],
      doors: [{ wallId: 12, name: 'Drzwi gabinetu' }],
    });
    expect(architecture.name).toBe('Sieć: restauracja Mariana');
    const floors = architecture.branches[0]!.floors;
    expect(floors.map((floor) => [floor.kind, floor.label])).toEqual([
      ['empty', 'Wejście'],
      ['controlNode', 'Monitoring'],
      ['controlNode', 'Obrona'],
      ['controlNode', 'Instalacje'],
    ]);
    expect(floors[1]).toMatchObject({ dv: 8 });
    expect(floors[1]!.devices?.map((device) => device.tokenId)).toEqual(['cam', 'sens']);
    expect(floors[2]!.devices?.map((device) => device.tokenId)).toEqual(['tur', 'bot']);
    expect(floors[3]!.devices).toEqual([
      { id: 'scene-term', name: 'term', deviceKind: 'environment', tokenId: 'term' },
      { id: 'zone-7', name: 'Podłoga elektryczna', deviceKind: 'environment' },
      { id: 'wall-12', name: 'Drzwi gabinetu', deviceKind: 'door', wallId: 12 },
    ]);
    expect(netEntryPosition(architecture)).toEqual({ branchId: 'trunk', floor: 0 });
  });

  it('a group with nothing in it gets no node', () => {
    const floors = netSceneArchitecture({
      sceneName: 'Hala',
      dv: 8,
      figures: [figure('tur', 'turret')],
      doors: [{ wallId: 3, name: '' }],
    }).branches[0]!.floors;
    expect(floors.map((floor) => floor.label)).toEqual(['Wejście', 'Obrona', 'Instalacje']);
    // Drzwi bez nazwy nazywa ich rodzaj.
    expect(floors[2]!.devices?.[0]?.name).toBe('Drzwi lub winda');
  });

  it('survives the editor validator unchanged', () => {
    const architecture = netSceneArchitecture({
      sceneName: 'Monitoring',
      dv: 8,
      figures: [figure('cam', 'camera'), figure('tur', 'turret')],
      zones: [{ zoneId: 1, name: 'Siatka' }],
    });
    const result = validateNetArchitecture(architecture);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.architecture.branches).toEqual(architecture.branches);
  });

  it('spills past six devices of one group into "Monitoring 2"', () => {
    const figures = Array.from({ length: NET_DEVICES_PER_NODE_MAX + 2 }, (_, i) =>
      figure(`c${i}`, 'camera'),
    );
    const nodes = nodesOf(netSceneArchitecture({ sceneName: 'Hala', dv: 8, figures }));
    expect(nodes.map((node) => [node.label, node.devices?.length])).toEqual([
      ['Monitoring', NET_DEVICES_PER_NODE_MAX],
      ['Monitoring 2', 2],
    ]);
    expect(new Set(nodes.map((node) => node.id)).size).toBe(2);
  });

  it('a scene with no devices is the entry alone, no empty node to take', () => {
    const architecture = netSceneArchitecture({ sceneName: 'Pusto', dv: 8, figures: [] });
    expect(nodesOf(architecture)).toHaveLength(0);
    expect(architecture.branches[0]!.floors).toHaveLength(1);
    expect(validateNetArchitecture(architecture).ok).toBe(true);
  });
});

describe('netSceneGroupOf / netSceneNodeGroup', () => {
  it('the glyph wins over the kind: a sensor watches, a terminal is an installation', () => {
    expect(netSceneGroupOf({ deviceKind: 'environment', glyph: 'sensor' })).toBe('monitoring');
    expect(netSceneGroupOf({ deviceKind: 'environment', glyph: 'terminal' })).toBe('installations');
    expect(netSceneGroupOf({ deviceKind: 'camera' })).toBe('monitoring');
    expect(netSceneGroupOf({ deviceKind: 'drone', glyph: 'robot' })).toBe('defense');
    expect(netSceneGroupOf({ deviceKind: 'door' })).toBe('installations');
    expect(netSceneGroupOf({ deviceKind: 'environment' })).toBe('installations');
  });

  it('only a scene node under a group label has a group', () => {
    expect(netSceneNodeGroup({ id: 'scene-defense-1', kind: 'controlNode', label: 'Obrona' })).toBe(
      'defense',
    );
    expect(
      netSceneNodeGroup({ id: 'scene-monitoring-2', kind: 'controlNode', label: 'Monitoring 2' }),
    ).toBe('monitoring');
    // Stary węzeł Sieci ze sceny (62) i węzeł MG nie mają grupy.
    expect(
      netSceneNodeGroup({ id: 'scene-node-1', kind: 'controlNode', label: 'Węzeł kontrolny' }),
    ).toBe(null);
    expect(netSceneNodeGroup({ id: 'f1', kind: 'controlNode', label: 'Obrona' })).toBe(null);
  });
});

describe('netAdoptSceneDevices', () => {
  const built: CpredNetArchitecture = {
    id: 'net.gm',
    name: 'Ochrona',
    difficulty: 'standard',
    branches: [
      {
        id: 'trunk',
        parentFloor: null,
        floors: [
          { id: 'f0', kind: 'password', label: 'Hasło', dv: 6 },
          {
            id: 'f1',
            kind: 'controlNode',
            label: 'Węzeł',
            dv: 10,
            devices: [{ id: 'd0', name: 'Kamera MG', deviceKind: 'camera', tokenId: 'wired' }],
          },
        ],
      },
    ],
  };
  const parts = (...figures: NetSceneFigure[]) => ({ figures });

  it('puts unwired figures into the first control node and leaves wired ones alone', () => {
    const { architecture, adopted, placed } = netAdoptSceneDevices(
      built,
      parts(figure('wired', 'camera'), figure('new', 'turret'), figure('guard', null)),
      { tokens: netWiredTokenIds([built]) },
      8,
    );
    expect(adopted).toBe(1);
    expect(nodesOf(architecture)[0]!.devices?.map((device) => device.tokenId)).toEqual([
      'wired',
      'new',
    ]);
    expect([...placed]).toEqual([['scene-new', 'f1']]);
    // Nothing mutated in place: the caller's copy is the GM's saved build.
    expect(nodesOf(built)[0]!.devices).toHaveLength(1);
  });

  it('returns the same object when there is nothing to adopt', () => {
    const result = netAdoptSceneDevices(
      built,
      parts(figure('wired', 'camera')),
      { tokens: new Set(['wired']) },
      8,
    );
    expect(result.adopted).toBe(0);
    expect(result.architecture).toBe(built);
  });

  it('a figure or a door wired in another Architecture of the campaign is not adopted twice', () => {
    const { adopted } = netAdoptSceneDevices(
      built,
      { figures: [figure('elsewhere', 'camera')], doors: [{ wallId: 4, name: 'Drzwi' }] },
      { tokens: new Set(['elsewhere']), walls: new Set([4]) },
      8,
    );
    expect(adopted).toBe(0);
  });

  it('with no control node, grows a node of the group at the bottom of the trunk', () => {
    const plain: CpredNetArchitecture = {
      ...built,
      branches: [{ id: 'trunk', parentFloor: null, floors: [built.branches[0]!.floors[0]!] }],
    };
    const { architecture } = netAdoptSceneDevices(
      plain,
      parts(figure('cam', 'camera')),
      { tokens: new Set() },
      8,
    );
    const floors = architecture.branches[0]!.floors;
    expect(floors.map((floor) => [floor.kind, floor.label])).toEqual([
      ['password', 'Hasło'],
      ['controlNode', 'Monitoring'],
    ]);
    expect(floors[1]).toMatchObject({ dv: 8 });
    expect(validateNetArchitecture(architecture).ok).toBe(true);
  });

  it('a full node overflows into a new node of the group with the first node DV', () => {
    const full = netAdoptSceneDevices(
      built,
      parts(
        ...Array.from({ length: NET_DEVICES_PER_NODE_MAX }, (_, i) => figure(`c${i}`, 'camera')),
      ),
      { tokens: new Set(['wired']) },
      8,
    ).architecture;
    const nodes = nodesOf(full);
    expect(nodes.map((node) => node.devices?.length)).toEqual([NET_DEVICES_PER_NODE_MAX, 1]);
    expect(nodes[1]).toMatchObject({ dv: 10, label: 'Monitoring' });
  });

  it('in a scene Sieć a device goes to its own group, never into another group node', () => {
    const scene = netSceneArchitecture({
      sceneName: 'Hala',
      dv: 8,
      figures: [figure('cam', 'camera'), figure('tur', 'turret')],
    });
    const { architecture, placed } = netAdoptSceneDevices(
      scene,
      {
        figures: [figure('cam', 'camera'), figure('tur', 'turret'), figure('cam2', 'camera')],
        zones: [{ zoneId: 9, name: 'Podłoga' }],
        doors: [{ wallId: 5, name: 'Drzwi' }],
      },
      { tokens: netWiredTokenIds([scene]) },
      8,
    );
    const nodes = nodesOf(architecture);
    expect(nodes.map((node) => [node.label, node.devices?.map((device) => device.id)])).toEqual([
      ['Monitoring', ['scene-cam', 'scene-cam2']],
      ['Obrona', ['scene-tur']],
      ['Instalacje', ['zone-9', 'wall-5']],
    ]);
    expect(placed.get('zone-9')).toBe(nodes[2]!.id);
  });

  it('an old scene node from before 70d (one node for everything) still takes anything', () => {
    const old: CpredNetArchitecture = {
      ...built,
      branches: [
        {
          id: 'trunk',
          parentFloor: null,
          floors: [
            { id: 'scene-entry', kind: 'empty', label: 'Wejście' },
            {
              id: 'scene-node-1',
              kind: 'controlNode',
              label: 'Węzeł kontrolny',
              dv: 8,
              devices: [{ id: 'scene-cam', name: 'Kamera', deviceKind: 'camera', tokenId: 'cam' }],
            },
          ],
        },
      ],
    };
    const { architecture } = netAdoptSceneDevices(
      old,
      { figures: [], zones: [{ zoneId: 2, name: 'Podłoga' }] },
      { tokens: new Set(['cam']) },
      8,
    );
    expect(nodesOf(architecture)[0]!.devices?.map((device) => device.id)).toEqual([
      'scene-cam',
      'zone-2',
    ]);
  });
});

describe('netReleaseSceneDevice / netWiredWallIds / netHasDevice', () => {
  const scene = netSceneArchitecture({
    sceneName: 'Hala',
    dv: 8,
    figures: [],
    zones: [{ zoneId: 1, name: 'Podłoga' }],
    doors: [{ wallId: 7, name: 'Drzwi' }],
  });

  it('takes the device off its node and keeps the node in place', () => {
    const { architecture, removed } = netReleaseSceneDevice(scene, 'wall-7');
    expect(removed).toBe(true);
    expect(nodesOf(architecture)[0]!.devices?.map((device) => device.id)).toEqual(['zone-1']);
    expect(architecture.branches[0]!.floors).toHaveLength(2);
    expect(netWiredWallIds([scene])).toEqual(new Set([7]));
    expect(netWiredWallIds([architecture])).toEqual(new Set());
  });

  it('an unknown id changes nothing', () => {
    const result = netReleaseSceneDevice(scene, 'wall-99');
    expect(result.removed).toBe(false);
    expect(result.architecture).toBe(scene);
  });

  it('finds a device by id, on its floor or anywhere', () => {
    const node = nodesOf(scene)[0]!;
    expect(netHasDevice(scene, node.id, 'zone-1')).toBe(true);
    expect(netHasDevice(scene, null, 'zone-1')).toBe(true);
    expect(netHasDevice(scene, 'scene-entry', 'zone-1')).toBe(false);
    expect(netHasDevice(scene, node.id, null)).toBe(false);
  });
});

describe('netDefenseGlyph', () => {
  it('dron naziemny dostaje gąsienice, latający — wirniki, reszta nic', () => {
    expect(netDefenseGlyph({ defenseKind: 'drone', name: 'Dron naziemny' })).toBe('ground-drone');
    expect(netDefenseGlyph({ defenseKind: 'drone', name: 'Pajęczy dron naziemny' })).toBe(
      'ground-drone',
    );
    expect(netDefenseGlyph({ defenseKind: 'drone', name: 'Rój dronów' })).toBe('drone');
    expect(netDefenseGlyph({ defenseKind: 'emplacement', name: 'Automatyczna wieżyczka' })).toBe(
      null,
    );
  });

  it('Postaw figurę urządzenia: stanowisko to wieżyczka, dron z nazwy, podłoga nic (70d)', () => {
    expect(
      netDefenseFigureGlyph({ defenseKind: 'emplacement', name: 'Automatyczna wieżyczka' }),
    ).toBe('turret');
    expect(netDefenseFigureGlyph({ defenseKind: 'drone', name: 'Dron naziemny' })).toBe(
      'ground-drone',
    );
    expect(netDefenseFigureGlyph({ defenseKind: 'environment', name: 'Podłoga' })).toBe(null);
  });

  it('figura z ikoną drona naziemnego jest urządzeniem Sieci', () => {
    expect(netSceneDevices([figure('t1', 'ground-drone')])).toMatchObject([
      { deviceKind: 'drone', tokenId: 't1' },
    ]);
  });
});
