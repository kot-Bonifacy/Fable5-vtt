import { describe, expect, it } from 'vitest';
import {
  NET_DEVICES_PER_NODE_MAX,
  validateNetArchitecture,
  type CpredNetArchitecture,
} from './netrunning.js';
import {
  netAdoptSceneDevices,
  netSceneArchitecture,
  netSceneDevices,
  netWiredTokenIds,
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
  it('builds an entry floor and one control node that a runner lands above', () => {
    const architecture = netSceneArchitecture({
      sceneName: 'restauracja Mariana',
      dv: 8,
      figures: [figure('cam', 'camera'), figure('tur', 'turret')],
    });
    expect(architecture.name).toBe('Sieć: restauracja Mariana');
    const floors = architecture.branches[0]!.floors;
    expect(floors.map((floor) => floor.kind)).toEqual(['empty', 'controlNode']);
    expect(floors[1]).toMatchObject({ dv: 8 });
    expect(floors[1]!.devices?.map((device) => device.tokenId)).toEqual(['cam', 'tur']);
    expect(netEntryPosition(architecture)).toEqual({ branchId: 'trunk', floor: 0 });
  });

  it('survives the editor validator unchanged', () => {
    const architecture = netSceneArchitecture({
      sceneName: 'Monitoring',
      dv: 8,
      figures: [figure('cam', 'camera')],
    });
    const result = validateNetArchitecture(architecture);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.architecture.branches).toEqual(architecture.branches);
  });

  it('spills past six devices into a further node', () => {
    const figures = Array.from({ length: NET_DEVICES_PER_NODE_MAX + 2 }, (_, i) =>
      figure(`c${i}`, 'camera'),
    );
    const nodes = nodesOf(netSceneArchitecture({ sceneName: 'Hala', dv: 8, figures }));
    expect(nodes.map((node) => node.devices?.length)).toEqual([NET_DEVICES_PER_NODE_MAX, 2]);
  });

  it('a scene with no devices still gets a node to take', () => {
    const nodes = nodesOf(netSceneArchitecture({ sceneName: 'Pusto', dv: 8, figures: [] }));
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.devices).toEqual([]);
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

  it('puts unwired figures into the first control node and leaves wired ones alone', () => {
    const { architecture, adopted } = netAdoptSceneDevices(
      built,
      [figure('wired', 'camera'), figure('new', 'turret'), figure('guard', null)],
      netWiredTokenIds([built]),
      8,
    );
    expect(adopted).toBe(1);
    expect(nodesOf(architecture)[0]!.devices?.map((device) => device.tokenId)).toEqual([
      'wired',
      'new',
    ]);
    // Nothing mutated in place: the caller's copy is the GM's saved build.
    expect(nodesOf(built)[0]!.devices).toHaveLength(1);
  });

  it('returns the same object when there is nothing to adopt', () => {
    const result = netAdoptSceneDevices(built, [figure('wired', 'camera')], new Set(['wired']), 8);
    expect(result.adopted).toBe(0);
    expect(result.architecture).toBe(built);
  });

  it('a figure wired in another Architecture of the campaign is not adopted twice', () => {
    const { adopted } = netAdoptSceneDevices(
      built,
      [figure('elsewhere', 'camera')],
      new Set(['elsewhere']),
      8,
    );
    expect(adopted).toBe(0);
  });

  it('with no control node, grows one at the bottom of the trunk', () => {
    const plain: CpredNetArchitecture = {
      ...built,
      branches: [{ id: 'trunk', parentFloor: null, floors: [built.branches[0]!.floors[0]!] }],
    };
    const { architecture } = netAdoptSceneDevices(plain, [figure('cam', 'camera')], new Set(), 8);
    const floors = architecture.branches[0]!.floors;
    expect(floors.map((floor) => floor.kind)).toEqual(['password', 'controlNode']);
    expect(floors[1]).toMatchObject({ dv: 8 });
    expect(validateNetArchitecture(architecture).ok).toBe(true);
  });

  it('a full node overflows into a new one with the first node’s DV', () => {
    const full = netAdoptSceneDevices(
      built,
      Array.from({ length: NET_DEVICES_PER_NODE_MAX }, (_, i) => figure(`c${i}`, 'camera')),
      new Set(['wired']),
      8,
    ).architecture;
    const nodes = nodesOf(full);
    expect(nodes.map((node) => node.devices?.length)).toEqual([NET_DEVICES_PER_NODE_MAX, 1]);
    expect(nodes[1]).toMatchObject({ dv: 10 });
  });
});
