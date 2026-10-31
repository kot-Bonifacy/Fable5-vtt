import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSceneTemplate } from './scene-templates.js';
import { createDefaultCharacterData } from './systems/cpred/character.js';
import {
  cpredTemplateNetArchitecture,
  cpredTemplateNetProgramIds,
  cpredTemplateNpcFinish,
  cpredTemplateProblems,
  readCpredTemplateNets,
  readCpredTemplateNpcExtras,
  type CpredTemplatePlacedFigure,
} from './systems/cpred/scene-template.js';

/** Wzorzec zwykłej mapy z tym, co doszło w etapie 66b. */
const mapTemplate = () => ({
  schemaVersion: 1,
  name: 'Hala',
  scene: {
    kind: 'map',
    backgroundUrl: '/public/scenes/hala/map.webp',
    backgroundWidth: 1000,
    backgroundHeight: 600,
    gridSizePx: 50,
    dark: true,
    darkSightM: 2,
  },
  figures: [
    { key: 'kam', name: 'Kamera', x: 1.5, y: 1.5, glyph: 'camera', facing: 450, visionRange: 30 },
    { key: 'dron', name: 'Dron', x: 4.5, y: 2.5, glyph: 'drone' },
    { name: 'Strażnik', x: 6.5, y: 2.5 },
  ],
  walls: [
    {
      points: [
        [0, 0],
        [10, 0],
        [10, 6],
      ],
    },
    {
      kind: 'door',
      points: [
        [2, 6],
        [4, 6],
      ],
      playerToggle: true,
      locked: true,
    },
    {
      kind: 'barrier',
      points: [
        { x: 5, y: 1 },
        { x: 5, y: 4 },
      ],
      armor: 10,
    },
  ],
  covers: [{ name: 'Skrzynia', x: 3, y: 3, width: 1, height: 0.5, hp: 20 }],
  accessPoints: [{ name: 'Konsola', x: 8, y: 5, net: 'siec' }],
  system: {
    net: [
      {
        key: 'siec',
        name: 'Sieć hali',
        floors: [
          { kind: 'password', label: 'Hasło' },
          {
            kind: 'controlNode',
            label: 'Węzeł',
            devices: [{ figure: 'kam' }, { figure: 'dron', on: false }],
          },
          { kind: 'ice', programs: [['program.nie-ma', 'program.jest'], ['program.zaden']] },
          { kind: 'file', label: 'Plik', dv: 12 },
        ],
      },
    ],
  },
});

describe('wzorzec zwykłej mapy (etap 66b)', () => {
  it('czyta ciemność, ściany, osłony, gniazda i pola figur', () => {
    const template = readSceneTemplate(mapTemplate(), 'hala')!;
    expect(template).not.toBeNull();
    expect(template.scene).toMatchObject({
      kind: 'map',
      dark: true,
      darkSightM: 2,
      explore: true,
      partySight: false,
      visibility: 'dynamic',
      metersPerSquare: 2,
    });
    expect(template.figures[0]).toMatchObject({
      key: 'kam',
      glyph: 'camera',
      facing: 90,
      visionRange: 30,
    });
    expect(template.figures[2]).toMatchObject({ key: null, glyph: null, facing: null });
    expect(template.walls.map((wall) => wall.kind)).toEqual(['wall', 'door', 'barrier']);
    expect(template.walls[1]).toMatchObject({ playerToggle: true, locked: true, open: false });
    expect(template.walls[2]).toMatchObject({
      armor: 10,
      points: [
        { x: 5, y: 1 },
        { x: 5, y: 4 },
      ],
    });
    expect(template.covers[0]).toMatchObject({ name: 'Skrzynia', hp: 20, hidden: false });
    expect(template.accessPoints[0]).toMatchObject({ net: 'siec', hidden: true, notes: '' });
  });

  it('stara mapa bez nowych pól: jasno, bez ścian, pamięć mapy włączona', () => {
    const raw = { ...mapTemplate(), scene: { ...mapTemplate().scene, dark: undefined } };
    const { walls: _w, covers: _c, accessPoints: _a, system: _s, ...bare } = raw;
    const template = readSceneTemplate(bare, 'hala')!;
    expect(template.scene).toMatchObject({ dark: false, explore: true, darkSightM: 2 });
    expect(template.walls).toEqual([]);
    expect(template.system).toBeNull();
  });

  it('odmawia w całości zepsutych ścian, figur i gniazd', () => {
    type Raw = ReturnType<typeof mapTemplate>;
    const cases: [string, (raw: Raw) => unknown][] = [
      ['ściana z jednym punktem', (raw) => ({ ...raw, walls: [{ points: [[0, 0]] }] })],
      [
        'ściana stoi w miejscu',
        (raw) => ({
          ...raw,
          walls: [
            {
              points: [
                [1, 1],
                [1, 1],
              ],
            },
          ],
        }),
      ],
      [
        'nieznany rodzaj',
        (raw) => ({
          ...raw,
          walls: [
            {
              kind: 'lava',
              points: [
                [0, 0],
                [1, 0],
              ],
            },
          ],
        }),
      ],
      [
        'pancerz zwykłej ściany',
        (raw) => ({
          ...raw,
          walls: [
            {
              points: [
                [0, 0],
                [1, 0],
              ],
              armor: 5,
            },
          ],
        }),
      ],
      ['zła ikona', (raw) => ({ ...raw, figures: [{ name: 'X', x: 1, y: 1, glyph: 'ufo' }] })],
      [
        'powtórzony klucz figury',
        (raw) => ({ ...raw, figures: [raw.figures[0], { ...raw.figures[1], key: 'kam' }] }),
      ],
      [
        'osłona bez PW',
        (raw) => ({ ...raw, covers: [{ name: 'X', x: 0, y: 0, width: 1, height: 1 }] }),
      ],
      [
        'gniazdo z kluczem spoza wzoru',
        (raw) => ({ ...raw, accessPoints: [{ name: 'X', x: 0, y: 0, net: 'Zła Sieć' }] }),
      ],
      ['ciemność nie-boolean', (raw) => ({ ...raw, scene: { ...raw.scene, dark: 'tak' } })],
      [
        'ściany na pościgu',
        (raw) => ({
          ...raw,
          scene: { ...raw.scene, kind: 'chase', chase: { direction: 'left', tempo: 40 } },
        }),
      ],
    ];
    for (const [label, broken] of cases) {
      expect(readSceneTemplate(broken(mapTemplate()), 'hala'), label).toBeNull();
    }
  });
});

describe('część CP RED wzorca mapy (etap 66b)', () => {
  it('karta NPC-a: wiersz plecaka i Wartość bojowa obok wydrukowanych PW', () => {
    const extras = readCpredTemplateNpcExtras({
      gear: [{ name: 'Drzazga', notes: 'Cel', qty: 0 }, { name: '  ' }],
      statBlock: { combatValue: 12 },
    });
    expect(extras.gear).toEqual([{ name: 'Drzazga', notes: 'Cel', qty: 1 }]);
    const base = {
      ...createDefaultCharacterData(),
      statBlock: { combatValue: null, weaponSkill: null, noBulletDodge: false, hpMax: 20 },
    };
    let n = 0;
    const sheet = cpredTemplateNpcFinish(base, extras, () => `row-${++n}`);
    expect(sheet.gear.at(-1)).toEqual({ id: 'row-1', name: 'Drzazga', notes: 'Cel', qty: 1 });
    expect(sheet.statBlock).toMatchObject({ combatValue: 12, hpMax: 20 });

    const untouched = cpredTemplateNpcFinish(base, readCpredTemplateNpcExtras({}), () => 'x');
    expect(untouched.statBlock).toBe(base.statBlock);
    expect(untouched.gear).toEqual(base.gear);
  });

  it('Architektura: urządzenia z ikony figury, uśpione wyłączone, PT poziomu i alternatywy LOD-u', () => {
    const template = readSceneTemplate(mapTemplate(), 'hala')!;
    const [net] = readCpredTemplateNets(template.system);
    expect(cpredTemplateNetProgramIds([net!])).toEqual([
      'program.nie-ma',
      'program.jest',
      'program.zaden',
    ]);
    const placed: Record<string, CpredTemplatePlacedFigure> = {
      kam: { tokenId: 't-kam', name: 'Kamera', glyph: 'camera' },
      dron: { tokenId: 't-dron', name: 'Dron', glyph: 'drone' },
    };
    const built = cpredTemplateNetArchitecture(net!, {
      figure: (key) => placed[key],
      defaultDv: 8,
      knownProgram: (id) => id === 'program.jest',
    });
    const floors = built.architecture.branches[0]!.floors;
    expect(floors.map((floor) => floor.kind)).toEqual(['password', 'controlNode', 'ice', 'file']);
    expect(floors[0]!.dv).toBe(8);
    expect(floors[3]!.dv).toBe(12);
    expect(floors[1]!.devices).toEqual([
      { id: 'tpl-kam', name: 'Kamera', deviceKind: 'camera', tokenId: 't-kam' },
      { id: 'tpl-dron', name: 'Dron', deviceKind: 'drone', tokenId: 't-dron' },
    ]);
    expect(floors[2]!.programIds).toEqual(['program.jest']);
    expect(built.devices).toEqual([{ deviceId: 'tpl-dron', on: false }]);
    expect(built.missing).toEqual(['program.zaden']);
    expect(built.architecture.difficulty).toBe('standard');
  });

  it('urządzenie bez figury wypada do missing', () => {
    const template = readSceneTemplate(mapTemplate(), 'hala')!;
    const [net] = readCpredTemplateNets(template.system);
    const built = cpredTemplateNetArchitecture(net!, {
      figure: () => undefined,
      defaultDv: 8,
      knownProgram: () => true,
    });
    expect(built.missing).toEqual(['figure:kam', 'figure:dron']);
    expect(built.architecture.branches[0]!.floors[1]!.devices).toBeUndefined();
  });

  it('cpredTemplateProblems łapie złe klucze, figury bez ikony i urządzenia poza węzłem', () => {
    expect(cpredTemplateProblems(readSceneTemplate(mapTemplate(), 'hala')!)).toEqual([]);
    const raw = mapTemplate();
    raw.accessPoints = [{ name: 'Konsola', x: 8, y: 5, net: 'inna' }];
    raw.system.net[0]!.floors.push({
      kind: 'file',
      label: 'Plik z urządzeniem',
      devices: [{ figure: 'nie-ma' }],
    } as never);
    (raw.system.net[0]!.floors[1]!.devices as { figure: string }[]).push({ figure: 'kam' });
    const problems = cpredTemplateProblems(readSceneTemplate(raw, 'hala')!);
    expect(problems).toEqual(
      expect.arrayContaining([
        'figura kam podpięta dwa razy',
        'net siec: urządzenia poza węzłem kontrolnym (Plik z urządzeniem)',
        'net siec: brak figury nie-ma',
        'gniazdo Konsola: brak Architektury inna',
      ]),
    );
  });
});

describe('wzorce map w data/public/scenes (etap 66b)', () => {
  const root = resolve(import.meta.dirname, '../../../data/public/scenes');
  const ids = readdirSync(root, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  it('część CP RED każdego wzorca trzyma się kupy, a Architektury przechodzą walidację', () => {
    expect(ids).toContain('fabryka-dronow');
    for (const id of ids) {
      const raw: unknown = JSON.parse(readFileSync(join(root, id, 'scene.json'), 'utf8'));
      const template = readSceneTemplate(raw, id)!;
      expect(cpredTemplateProblems(template), id).toEqual([]);
      const byKey = new Map(template.figures.map((figure) => [figure.key, figure]));
      for (const net of readCpredTemplateNets(template.system)) {
        const built = cpredTemplateNetArchitecture(net, {
          figure: (key) => {
            const figure = byKey.get(key);
            return figure
              ? { tokenId: `t-${key}`, name: figure.name, glyph: figure.glyph }
              : undefined;
          },
          defaultDv: 8,
          knownProgram: () => true,
        });
        expect(built.missing, `${id}/${net.key}`).toEqual([]);
      }
    }
  });

  it('fabryka dronów: ciemno, każdy widzi sam, uśpione lądowiska i drzazga w prototypie', () => {
    const raw: unknown = JSON.parse(
      readFileSync(join(root, 'fabryka-dronow', 'scene.json'), 'utf8'),
    );
    const template = readSceneTemplate(raw, 'fabryka-dronow')!;
    expect(template.scene).toMatchObject({ dark: true, partySight: false, visibility: 'dynamic' });
    const [net] = readCpredTemplateNets(template.system);
    const off = net!.floors.flatMap((floor) => floor.devices.filter((device) => !device.on));
    expect(off).toHaveLength(11);
    const prototype = template.figures.find((figure) => figure.key === 'prototyp')!;
    expect(readCpredTemplateNpcExtras(prototype.system).gear[0]!.name).toMatch(/Drzazga/);
    expect(template.accessPoints.every((point) => point.net === 'fabryka')).toBe(true);
  });
});
