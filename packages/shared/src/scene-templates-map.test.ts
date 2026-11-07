import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSceneTemplate } from './scene-templates.js';
import { createDefaultCharacterData } from './systems/cpred/character.js';
import {
  cpredTemplateContainerSheet,
  cpredTemplateLockRule,
  cpredTemplateNetArchitecture,
  cpredTemplateNetProgramIds,
  cpredTemplateNpcFinish,
  cpredTemplateProblems,
  readCpredTemplateContainer,
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
      const zones = new Map(template.zones.map((zone) => [zone.key, zone]));
      const walls = new Map(template.walls.map((wall, index) => [wall.key, index]));
      for (const net of readCpredTemplateNets(template.system)) {
        const built = cpredTemplateNetArchitecture(net, {
          figure: (key) => {
            const figure = byKey.get(key);
            return figure
              ? { tokenId: `t-${key}`, name: figure.name, glyph: figure.glyph }
              : undefined;
          },
          zone: (key) => (zones.has(key) ? { name: zones.get(key)!.name ?? key } : undefined),
          wall: (key) => (walls.has(key) ? { wallId: walls.get(key)! + 1 } : undefined),
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

  it('po zamknięciu: 47 odcinków (46 ze sceny MG + drzwi z kuchni na salę), zamki, ukryte kamery, strefa i szafka w Sieci', () => {
    const raw: unknown = JSON.parse(
      readFileSync(join(root, 'po-zamknieciu', 'scene.json'), 'utf8'),
    );
    const template = readSceneTemplate(raw, 'po-zamknieciu')!;
    expect(template).not.toBeNull();
    expect(template.scene).toMatchObject({ dark: true, darkSightM: 4, playerMove: 'explore' });
    expect(template.walls).toHaveLength(47);
    const count = (kind: string) => template.walls.filter((wall) => wall.kind === kind).length;
    expect([count('wall'), count('door'), count('window'), count('gate')]).toEqual([32, 12, 1, 2]);
    const locked = template.walls.filter((wall) => wall.locked);
    expect(locked.map((wall) => cpredTemplateLockRule(wall.lockRule).dv).sort()).toEqual([
      13, 13, 15, 17,
    ]);
    expect(template.walls.find((wall) => wall.key === 'drzwi-gabinetu')).toMatchObject({
      kind: 'door',
      locked: true,
    });
    const cameras = template.figures.filter((figure) => figure.glyph === 'camera');
    expect(cameras).toHaveLength(5);
    expect(cameras.every((figure) => figure.hidden && figure.disposition === 'neutral')).toBe(true);
    expect(template.lights).toHaveLength(5);
    expect(template.zones).toEqual([
      expect.objectContaining({ key: 'podloga', hidden: true, armed: true, x: 22, y: 10 }),
    ]);
    const szafka = readCpredTemplateContainer(template.containers[0]!.system);
    expect(szafka).toMatchObject({ lock: 'locked', dv: 13, keyHolder: 'maly', eddies: 200 });
    const [net] = readCpredTemplateNets(template.system);
    expect(net!.floors.map((floor) => floor.kind)).toEqual([
      'password',
      'controlNode',
      'controlNode',
      'file',
    ]);
    expect(
      net!.floors[2]!.devices.map((device) => device.zone ?? device.wall ?? device.figure),
    ).toEqual(['wiezyczka', 'podloga', 'drzwi-gabinetu']);
  });
});

describe('format wzorca: światła, zamki, strefy i pojemniki (etap 66e)', () => {
  const extended = () => ({
    ...mapTemplate(),
    walls: [
      ...mapTemplate().walls,
      {
        kind: 'door',
        key: 'drzwi',
        points: [
          [6, 6],
          [7, 6],
        ],
        locked: true,
        lockRule: { dv: 15, skills: ['electronics-security'] },
      },
    ],
    lights: [{ x: 2, y: 2, brightM: 6, dimM: 3, color: '#FF4D9D', flicker: true }],
    zones: [
      {
        key: 'podloga',
        x: 1,
        y: 4,
        width: 3,
        height: 1,
        notes: 'Korytarz',
        spotDv: 15,
        system: { entryIds: ['defense.nie-ma', 'defense.iskrownik'] },
      },
    ],
    containers: [
      {
        key: 'szafka',
        name: 'Szafka',
        x: 8.5,
        y: 1.5,
        preset: 'stash',
        system: {
          lock: 'locked',
          dv: 13,
          keyHolder: 'kam',
          items: [{ ids: ['weapon.a', 'weapon.b'] }, 'gear.c', { ids: ['gear.d'], qty: 3 }],
          eddies: 200,
        },
      },
    ],
    system: {
      net: [
        {
          key: 'siec',
          name: 'Sieć hali',
          floors: [
            { kind: 'password' },
            {
              kind: 'controlNode',
              label: 'Zabezpieczenia',
              devices: [
                { figure: 'kam' },
                { zone: 'podloga', on: false },
                { wall: 'drzwi', name: 'Zamek' },
              ],
            },
          ],
        },
      ],
    },
  });

  it('czyta nowe pola, a światło dostaje promienie w kolejności i barwę małymi literami', () => {
    const template = readSceneTemplate(extended(), 'hala')!;
    expect(template).not.toBeNull();
    expect(template.lights).toEqual([
      { x: 2, y: 2, brightM: 6, dimM: 6, color: '#ff4d9d', flicker: true, enabled: true },
    ]);
    expect(template.walls.at(-1)).toMatchObject({
      key: 'drzwi',
      lockRule: { dv: 15, skills: ['electronics-security'] },
    });
    expect(template.walls[0]).toMatchObject({ key: null, lockRule: null });
    expect(template.zones[0]).toMatchObject({
      key: 'podloga',
      name: null,
      hidden: true,
      armed: true,
      spotDv: 15,
      disarmDv: null,
    });
    expect(template.containers[0]).toMatchObject({ preset: 'stash', hidden: false });
    expect(cpredTemplateProblems(template)).toEqual([]);
  });

  it('stary wzorzec bez nowych pól czyta się z pustymi listami', () => {
    const template = readSceneTemplate(mapTemplate(), 'hala')!;
    expect(template.lights).toEqual([]);
    expect(template.zones).toEqual([]);
    expect(template.containers).toEqual([]);
  });

  it('odmawia w całości zepsutych świateł, kluczy, zamków, stref i pojemników', () => {
    type Raw = ReturnType<typeof extended>;
    const door = (extra: Record<string, unknown>) => ({
      kind: 'door',
      points: [
        [0, 6],
        [1, 6],
      ],
      ...extra,
    });
    const cases: [string, (raw: Raw) => unknown][] = [
      ['światło bez promienia', (raw) => ({ ...raw, lights: [{ x: 1, y: 1, brightM: 2 }] })],
      [
        'światło z barwą słowem',
        (raw) => ({ ...raw, lights: [{ x: 1, y: 1, brightM: 2, dimM: 4, color: 'red' }] }),
      ],
      [
        'klucz zwykłej ściany',
        (raw) => ({
          ...raw,
          walls: [
            {
              key: 'x',
              points: [
                [0, 0],
                [1, 0],
              ],
            },
          ],
        }),
      ],
      [
        'klucz łańcucha z trzech punktów',
        (raw) => ({
          ...raw,
          walls: [
            door({
              key: 'x',
              points: [
                [0, 0],
                [1, 0],
                [1, 1],
              ],
            }),
          ],
        }),
      ],
      [
        'klucz otworu powtórzony',
        (raw) => ({ ...raw, walls: [door({ key: 'x' }), door({ key: 'x' })] }),
      ],
      ['zamek nie-obiekt', (raw) => ({ ...raw, walls: [door({ lockRule: 13 })] })],
      [
        'zamek zwykłej ściany',
        (raw) => ({
          ...raw,
          walls: [
            {
              points: [
                [0, 0],
                [1, 0],
              ],
              lockRule: { dv: 13 },
            },
          ],
        }),
      ],
      ['strefa bez rozmiaru', (raw) => ({ ...raw, zones: [{ ...raw.zones[0], width: 0 }] })],
      ['strefa z PT poza skalą', (raw) => ({ ...raw, zones: [{ ...raw.zones[0], spotDv: 99 }] })],
      ['powtórzony klucz strefy', (raw) => ({ ...raw, zones: [raw.zones[0], raw.zones[0]] })],
      [
        'pojemnik-stos',
        (raw) => ({ ...raw, containers: [{ ...raw.containers[0], preset: 'pile' }] }),
      ],
      [
        'pojemnik bez nazwy',
        (raw) => ({ ...raw, containers: [{ ...raw.containers[0], name: ' ' }] }),
      ],
      [
        'światła na pościgu',
        (raw) => ({
          ...raw,
          walls: [],
          covers: [],
          accessPoints: [],
          zones: [],
          containers: [],
          scene: { ...raw.scene, kind: 'chase', chase: { direction: 'left', tempo: 40 } },
        }),
      ],
    ];
    for (const [label, broken] of cases) {
      expect(readSceneTemplate(broken(extended()), 'hala'), label).toBeNull();
    }
  });

  it('Architektura: strefa to System środowiskowy z wiązaniem, otwór to drzwi z id ściany', () => {
    const template = readSceneTemplate(extended(), 'hala')!;
    const [net] = readCpredTemplateNets(template.system);
    const built = cpredTemplateNetArchitecture(net!, {
      figure: (key) =>
        key === 'kam' ? { tokenId: 't-kam', name: 'Kamera', glyph: 'camera' } : undefined,
      zone: (key) => (key === 'podloga' ? { name: 'Iskrownik' } : undefined),
      wall: (key) => (key === 'drzwi' ? { wallId: 41 } : undefined),
      defaultDv: 8,
      knownProgram: () => true,
    });
    expect(built.missing).toEqual([]);
    expect(built.architecture.branches[0]!.floors[1]!.devices).toEqual([
      { id: 'tpl-kam', name: 'Kamera', deviceKind: 'camera', tokenId: 't-kam' },
      { id: 'tpl-zone-podloga', name: 'Iskrownik', deviceKind: 'environment' },
      { id: 'tpl-wall-drzwi', name: 'Zamek', deviceKind: 'door', wallId: 41 },
    ]);
    expect(built.zones).toEqual([
      { zone: 'podloga', floorId: 'tpl-floor-2', deviceId: 'tpl-zone-podloga' },
    ]);
    expect(built.devices).toEqual([{ deviceId: 'tpl-zone-podloga', on: false }]);

    const lonely = cpredTemplateNetArchitecture(net!, {
      figure: () => undefined,
      defaultDv: 8,
      knownProgram: () => true,
    });
    expect(lonely.missing).toEqual(['figure:kam', 'zone:podloga', 'wall:drzwi']);
    expect(lonely.zones).toEqual([]);
  });

  it('cpredTemplateProblems łapie brak strefy i otworu, zły zamek, klucz bez figury i podwójne wpięcie', () => {
    const raw = extended();
    raw.walls[raw.walls.length - 1] = {
      ...raw.walls.at(-1)!,
      lockRule: { dv: 0, skills: ['lockpick'] },
    } as never;
    raw.zones[0] = { ...raw.zones[0]!, key: 'inna', system: { entryIds: [] } } as never;
    raw.containers[0]!.system = {
      ...raw.containers[0]!.system,
      lock: 'sejf',
      keyHolder: 'nikt',
      items: [{ ids: [] }],
    } as never;
    const devices = raw.system.net[0]!.floors[1]!.devices as Record<string, unknown>[];
    devices.push({ wall: 'nie-ma' }, { figure: 'kam' }, { figure: 'kam', zone: 'inna' });
    const problems = cpredTemplateProblems(readSceneTemplate(raw, 'hala')!);
    expect(problems).toEqual(
      expect.arrayContaining([
        'net siec: brak strefy podloga',
        'net siec: brak otworu nie-ma',
        'net siec: nieczytelne urządzenie w węźle Zabezpieczenia',
        'figura kam podpięta dwa razy',
        'zamek drzwi: PT poza skalą',
        'zamek drzwi: nieznana Umiejętność',
        'strefa inna: brak wpisu kompendium',
        'pojemnik Szafka: zły stan',
        'pojemnik Szafka: brak figury nikt z kluczem',
        'pojemnik Szafka: nieczytelna rzecz',
      ]),
    );
  });

  it('pojemnik: zamek, rzeczy z ilością i gotówka na karcie z polem container', () => {
    const spec = readCpredTemplateContainer({
      lock: 'locked',
      dv: 15,
      skills: ['pick-lock', 'hacking'],
      items: [{ ids: ['gear.a'], qty: 3 }, 'weapon.b', { ids: [] }],
      eddies: 200,
    });
    expect(spec).toMatchObject({ lock: 'locked', dv: 15, skills: ['pick-lock'], eddies: 200 });
    expect(spec.items).toEqual([
      { ids: ['gear.a'], qty: 3 },
      { ids: ['weapon.b'], qty: 1 },
    ]);
    const sheet = cpredTemplateContainerSheet(
      spec,
      [
        { row: { list: 'gear', row: { id: 'r1', name: 'Latarka', notes: '', qty: 1 } }, qty: 3 },
        {
          row: {
            list: 'weapons',
            row: {
              id: 'r2',
              name: 'PM',
              notes: '',
              damage: '2k6',
              ammoCurrent: 30,
              ammoMax: 30,
              ammoType: '',
              rof: '1',
            },
          },
          qty: 1,
        },
      ],
      'klucz-1',
    );
    expect(sheet.container).toMatchObject({ lock: 'locked', dv: 15, keyId: 'klucz-1', tried: [] });
    expect(sheet.gear).toEqual([{ id: 'r1', name: 'Latarka', notes: '', qty: 3 }]);
    expect(sheet.weapons.map((row) => row.name)).toEqual(['PM']);
    expect(sheet.eddies).toBe(200);
    // Domyślnie zamknięty na klamkę, bez gotówki i bez klucza.
    expect(readCpredTemplateContainer(undefined)).toMatchObject({
      lock: 'closed',
      keyHolder: null,
      items: [],
      eddies: 0,
    });
  });

  it('zamek otworu: wyrozumiały odczyt, bez listy prób; gotówka NPC-a na karcie', () => {
    expect(
      cpredTemplateLockRule({ dv: 17, skills: ['electronics-security'], tried: ['c1'] }),
    ).toEqual({ dv: 17, skills: ['electronics-security'], keyId: null, tried: [] });
    const extras = readCpredTemplateNpcExtras({ eddies: 300 });
    const sheet = cpredTemplateNpcFinish(createDefaultCharacterData(), extras, () => 'x');
    expect(sheet.eddies).toBe(300);
    expect(readCpredTemplateNpcExtras({ eddies: -5 }).eddies).toBe(0);
  });
});
