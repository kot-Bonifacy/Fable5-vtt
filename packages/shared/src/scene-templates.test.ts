import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSceneTemplate, sceneTemplatePoint } from './scene-templates.js';
import {
  cpredTemplateNpcEntryIds,
  cpredTemplateNpcInput,
  cpredTemplateVehicleStats,
  readCpredTemplateNpc,
  readCpredTemplateVehicle,
} from './systems/cpred/scene-template.js';
import type { VehicleEntry } from './systems/cpred/compendium.js';

const minimal = () => ({
  schemaVersion: 1,
  name: 'Próba',
  scene: {
    kind: 'chase',
    backgroundUrl: '/public/scenes/proba/map.webp',
    backgroundWidth: 1000,
    backgroundHeight: 600,
    gridSizePx: 50,
    chase: { direction: 'right', tempo: 30, road: { from: 2, to: 8 } },
  },
  vehicles: [{ key: 'a', name: 'Auto', x: 5, y: 5, system: { catalogIds: ['vehicle.x'] } }],
  figures: [{ name: 'Kierowca', vehicle: { key: 'a', seat: 0 }, system: {} }],
  notes: [{ x: 1, y: 1, icon: '⚠️', text: 'Uwaga' }],
});

describe('readSceneTemplate (etap 66)', () => {
  it('czyta poprawny wzorzec i dokłada wartości domyślne pościgu', () => {
    const template = readSceneTemplate(minimal(), 'proba')!;
    expect(template).not.toBeNull();
    expect(template.category).toBe('examples');
    expect(template.scene).toMatchObject({
      kind: 'chase',
      width: 1000,
      height: 600,
      metersPerSquare: 1,
      visibility: 'open',
      playerMove: 'stop',
      ambience: 'car',
      chase: { direction: 'right', tempo: 30, running: true, road: { from: 2, to: 8 } },
    });
    expect(template.figures[0]!.vehicle).toEqual({ key: 'a', seat: 0 });
    expect(sceneTemplatePoint(template.scene, { x: 2, y: 3 })).toEqual({ x: 100, y: 150 });
  });

  it('odmawia w całości zamiast gubić kawałki', () => {
    const cases: [string, (raw: ReturnType<typeof minimal>) => unknown][] = [
      ['zła wersja', (raw) => ({ ...raw, schemaVersion: 2 })],
      [
        'tło spoza /public/scenes',
        (raw) => ({ ...raw, scene: { ...raw.scene, backgroundUrl: '/uploads/x.png' } }),
      ],
      [
        'ucieczka ścieżką',
        (raw) => ({
          ...raw,
          scene: { ...raw.scene, backgroundUrl: '/public/scenes/../private/x.png' },
        }),
      ],
      ['pościg bez ustawień', (raw) => ({ ...raw, scene: { ...raw.scene, chase: null } })],
      [
        'figura w nieznanym aucie',
        (raw) => ({ ...raw, figures: [{ name: 'X', vehicle: { key: 'b', seat: 0 } }] }),
      ],
      [
        'dwie figury w jednym fotelu',
        (raw) => ({ ...raw, figures: [raw.figures[0], raw.figures[0]] }),
      ],
      ['figura poza autem bez miejsca', (raw) => ({ ...raw, figures: [{ name: 'X' }] })],
      [
        'auto na zwykłej mapie',
        (raw) => ({ ...raw, scene: { ...raw.scene, kind: 'map', chase: null } }),
      ],
      [
        'grafika auta spoza wbudowanych',
        (raw) => ({ ...raw, vehicles: [{ ...raw.vehicles[0], imageUrl: '/uploads/a.png' }] }),
      ],
      ['pusta notatka', (raw) => ({ ...raw, notes: [{ x: 1, y: 1, text: '  ' }] })],
    ];
    for (const [label, broken] of cases) {
      expect(readSceneTemplate(broken(minimal()), 'proba'), label).toBeNull();
    }
    expect(readSceneTemplate(minimal(), '../proba')).toBeNull();
  });
});

const entry = (id: string, seats: number): VehicleEntry =>
  ({
    id,
    category: 'vehicle',
    name: id,
    vehicleKind: 'car',
    hp: 50,
    seats,
    move: 40,
  }) as VehicleEntry;

describe('część CP RED wzorca (etap 66)', () => {
  it('auto: pierwsza znana alternatywa z katalogu, ulepszenia i PUK z Wzmocnioną konstrukcją', () => {
    const spec = readCpredTemplateVehicle({
      catalogIds: ['vehicle.nie-ma', 'vehicle.jest'],
      upgrades: ['reinforced', 'ram', 'nie-ma-takiego'],
    });
    const catalog = new Map([['vehicle.jest', entry('vehicle.jest', 4)]]);
    const { stats, missing } = cpredTemplateVehicleStats(spec, (id) => catalog.get(id));
    expect(missing).toEqual([]);
    expect(stats.catalogId).toBe('vehicle.jest');
    expect(stats.upgrades.map((row) => row.upgradeId)).toEqual(['reinforced', 'ram']);
    expect(stats.hp).toBe(70);
  });

  it('auto bez żadnej alternatywy: kompakt zastępczy i pierwsze id dla MG', () => {
    const { stats, missing } = cpredTemplateVehicleStats(
      readCpredTemplateVehicle({ catalogIds: ['vehicle.a', 'vehicle.b'] }),
      () => undefined,
    );
    expect(stats.catalogId).toBeNull();
    expect(missing).toEqual(['vehicle.a']);
  });

  it('NPC: sloty broni i pancerza z alternatywami, brak trafia do missing', () => {
    const npc = readCpredTemplateNpc({
      stats: { ref: 7 },
      skills: { handgun: 5 },
      weapons: [['weapon.a', 'weapon.b'], ['weapon.c'], 'weapon.d'],
      armorBody: ['armor.x', 'armor.y'],
      armorHead: [],
    });
    expect(cpredTemplateNpcEntryIds(npc)).toEqual([
      'weapon.a',
      'weapon.b',
      'weapon.c',
      'weapon.d',
      'armor.x',
      'armor.y',
    ]);
    const known = new Set(['weapon.b', 'weapon.d', 'armor.y']);
    const { input, missing } = cpredTemplateNpcInput(npc, (id) => known.has(id));
    expect(input).toMatchObject({
      weaponIds: ['weapon.b', 'weapon.d'],
      armorBodyId: 'armor.y',
      armorHeadId: null,
      stats: { ref: 7 },
    });
    expect(missing).toEqual(['weapon.c']);
  });
});

describe('wzorce w data/public/scenes', () => {
  const root = resolve(import.meta.dirname, '../../../data/public/scenes');
  const ids = readdirSync(root, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  it('każdy wzorzec z repo jest poprawny, a jego tło leży obok', () => {
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const raw: unknown = JSON.parse(readFileSync(join(root, id, 'scene.json'), 'utf8'));
      const template = readSceneTemplate(raw, id);
      expect(template, id).not.toBeNull();
      const url = template!.scene.backgroundUrl;
      if (url) {
        const file = join(root, '..', url.slice('/public/'.length));
        expect(() => readFileSync(file), `${id}: ${url}`).not.toThrow();
      }
    }
  });
});
