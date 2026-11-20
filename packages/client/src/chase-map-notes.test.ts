import { describe, expect, it } from 'vitest';
import {
  ROLE_GM,
  type ChaseObstacleView,
  type SceneVehicleView,
  type SceneView,
  type TokenView,
} from '@vtt/shared';
import {
  chaseMapNotes,
  chaseRoundsText,
  chaseViewerVehicle,
  ghostRuler,
} from './chase-map-notes.js';

const GRID = 100;

/** Auto 3 × 5 kratek; pozostałe pola widoku nie grają w dopiskach. */
function car(id: string, x: number, y: number, extra: Partial<SceneVehicleView> = {}) {
  return {
    id,
    x,
    y,
    status: 'racing',
    party: false,
    control: 'driver',
    speed: 30,
    widthSq: 3,
    lengthSq: 5,
    hp: 50,
    name: id,
    ...extra,
  } as SceneVehicleView;
}

function obstacle(id: string, x: number, y: number): ChaseObstacleView {
  return { id, x, y, widthSq: 3, lengthSq: 1 } as ChaseObstacleView;
}

/** Jazda w prawo, 40 × 20 kratek, kratka 2 m. */
function scene(pursuitSpeed: number | null) {
  return {
    kind: 'chase',
    width: 40 * GRID,
    height: 20 * GRID,
    metersPerSquare: 2,
    grid: { sizePx: GRID, offsetX: 0, offsetY: 0 },
    chase: { direction: 'right', pursuitSpeed, anchorId: null },
  } as unknown as SceneView;
}

describe('chaseRoundsText — „za N tur” pod przeszkodą (72d2)', () => {
  it('odmienia turę i mówi o styku', () => {
    expect(chaseRoundsText(0)).toBe('przy zderzaku');
    expect(chaseRoundsText(1)).toBe('za 1 turę');
    expect(chaseRoundsText(3)).toBe('za 3 tury');
    expect(chaseRoundsText(5)).toBe('za 5 tur');
    expect(chaseRoundsText(12)).toBe('za 12 tur');
  });
});

describe('chaseMapNotes — prędkość aut i prognoza przeszkód (72d2)', () => {
  it('poza walką nie ma dopisków', () => {
    const notes = chaseMapNotes(scene(null), [car('a', 1000, 1000)], [], null);
    expect(notes.vehicles.size).toBe(0);
  });

  it('auto w pościgu ma mile na godzinę, wrak i auto poza kadrem — nic', () => {
    const notes = chaseMapNotes(
      scene(30),
      [
        car('a', 1000, 1000, { speed: 30 }),
        car('wrak', 2000, 1000, { status: 'wrecked', hp: 0 }),
        car('tyl', 3000, 1000, { status: 'behind' }),
      ],
      [],
      null,
    );
    expect(notes.vehicles.get('a')).toBe('150 mil/h');
    expect(notes.vehicles.has('wrak')).toBe(false);
    expect(notes.vehicles.has('tyl')).toBe(false);
  });

  it('przeszkoda na pasie auta: metry od zderzaka i rundy z prędkości auta', () => {
    // Przedni zderzak auta na x = 1250, przeszkoda od 1950 — 7 kratek = 14 m;
    // Ruch 20 to 5 kratek na rundę, więc dojazd za 2 tury.
    const viewer = car('a', 1000, 1000, { speed: 20 });
    const notes = chaseMapNotes(
      scene(20),
      [viewer],
      [obstacle('o', 2000, 1000), obstacle('bok', 2000, 1500), obstacle('za', 500, 1000)],
      viewer,
    );
    expect(notes.obstacles.get('o')).toBe('14 m · za 2 tury');
    expect(notes.obstacles.get('bok')).toBe('14 m · inny pas');
    expect(notes.obstacles.has('za')).toBe(false);
  });

  it('stojące auto do przeszkody nie dojedzie — same metry', () => {
    const viewer = car('a', 1000, 1000, { speed: 0 });
    const notes = chaseMapNotes(scene(0), [viewer], [obstacle('o', 2000, 1000)], viewer);
    expect(notes.obstacles.get('o')).toBe('14 m');
  });
});

describe('chaseViewerVehicle — z którego auta liczy się prognoza', () => {
  const party = car('druzyna', 1000, 1000, { party: true });
  const foe = car('wrog', 2000, 1000, { speed: 40 });
  const own = { ownerId: 'u1', vehicleSeat: { sceneVehicleId: 'wrog', seat: 1 } } as TokenView;

  it('gracz patrzy z auta, w którym siedzi jego figura', () => {
    expect(chaseViewerVehicle([party, foe], [own], { id: 'u1', role: 'player' }, null)?.id).toBe(
      'wrog',
    );
    expect(chaseViewerVehicle([party, foe], [own], { id: 'u2', role: 'player' }, null)).toBe(null);
  });

  it('MG patrzy z auta kadru — wskazanego albo pierwszego auta drużyny', () => {
    expect(chaseViewerVehicle([party, foe], [], { id: 'mg', role: ROLE_GM }, null)?.id).toBe(
      'druzyna',
    );
    expect(chaseViewerVehicle([party, foe], [], { id: 'mg', role: ROLE_GM }, 'wrog')?.id).toBe(
      'wrog',
    );
  });
});

describe('ghostRuler — miarka od ducha do celu (72d2)', () => {
  const gap = (gapSq: number, at: { x: number; y: number }) => ({
    name: 'cel',
    gapSq,
    at,
    halfLengthPx: 250,
  });

  it('cel z przodu: od przedniego zderzaka ducha do tylnego zderzaka celu', () => {
    const ruler = ghostRuler(
      { x: 1000, y: 1000 },
      250,
      gap(4, { x: 1900, y: 1400 }),
      'right',
      '8 m',
    );
    expect(ruler).toEqual({ from: { x: 1250, y: 1000 }, to: { x: 1650, y: 1400 }, label: '8 m' });
  });

  it('cel z tyłu przy jeździe w lewo: zderzaki od strony celu', () => {
    const ruler = ghostRuler(
      { x: 1000, y: 1000 },
      250,
      gap(-4, { x: 1900, y: 1000 }),
      'left',
      '8 m',
    );
    expect(ruler?.from).toEqual({ x: 1250, y: 1000 });
    expect(ruler?.to).toEqual({ x: 1650, y: 1000 });
  });

  it('cel na styku — bez miarki', () => {
    expect(ghostRuler({ x: 0, y: 0 }, 250, gap(0, { x: 500, y: 0 }), 'right', '0 m')).toBe(null);
  });
});
