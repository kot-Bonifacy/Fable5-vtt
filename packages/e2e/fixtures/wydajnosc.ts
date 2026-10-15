import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import type { Socket } from 'socket.io-client';
import { REPO_DIR } from '../instance/paths.ts';
import { expect, type Actor } from './actors.ts';
import { worldToClient, type WorldPoint } from './canvas.ts';
import { query } from './db.ts';
import { apiGm, characterId, userId } from './nocna-zmiana.ts';
import { emitAck } from './socket.ts';

/**
 * Scena pomiarowa T7c (`testy.md` 6.3, „wydajność mapy”): `test-map-4096.png`,
 * 40 figur, 200 odcinków ścian, 10 świateł. Budowana z gniazda MG — przygotowanie,
 * nie przedmiot testu (budowanie sceny przez UI sprawdził T3b).
 *
 * Układ: kratka 64 px (64 × 64 pola), 5 × 5 kwartałów 400 × 400 px, każdy
 * zamknięty łańcuch 8 odcinków (rzucają cień w Dynamicznej), między nimi ulice
 * szerokości ~6 pól. Światła na skrzyżowaniach, figury na ulicach.
 */

export const PERF_SCENE = 'Wydajność 4096';
export const PERF_MAP = join(REPO_DIR, 'data/public/maps/test-map-4096.png');
export const PERF_CELL = 64;
export const PERF_SIZE = 4096;

const BLOCK = 400;
const PITCH = 800;
const ORIGIN = 248;
/** Pola środków ulic pionowych i poziomych (px 848, 1648, 2448, 3248). */
export const STREETS = [13, 25, 38, 50] as const;

/** Start figur graczy (pola) — ulica pionowa przy środku mapy. */
export const PLAYER_START: Record<'Kowal' | 'Iskra', readonly [number, number]> = {
  Kowal: [25, 30],
  Iskra: [24, 30],
};
/** Cel marszu gracza: 10 pól w górę tą samą ulicą (20 m). */
export const PLAYER_GOAL: readonly [number, number] = [25, 20];
/** Statysta, którym maszeruje MG, i jego cel (ulica pionowa przy lewym brzegu). */
export const NPC_MARCHER = 'Przechodzień 1';
export const NPC_START: readonly [number, number] = [13, 3];
export const NPC_GOAL: readonly [number, number] = [13, 19];

export const cellTopLeft = ([x, y]: readonly [number, number]) => ({
  x: x * PERF_CELL,
  y: y * PERF_CELL,
});
export const cellCentre = ([x, y]: readonly [number, number]): WorldPoint => ({
  x: x * PERF_CELL + PERF_CELL / 2,
  y: y * PERF_CELL + PERF_CELL / 2,
});

/** 25 kwartałów × 8 odcinków = 200 (zamknięty łańcuch: 9 punktów). */
export function perfWalls(): [number, number][][] {
  const chains: [number, number][][] = [];
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      const x = ORIGIN + col * PITCH;
      const y = ORIGIN + row * PITCH;
      const h = BLOCK / 2;
      chains.push([
        [x, y],
        [x + h, y],
        [x + BLOCK, y],
        [x + BLOCK, y + h],
        [x + BLOCK, y + BLOCK],
        [x + h, y + BLOCK],
        [x, y + BLOCK],
        [x, y + h],
        [x, y],
      ]);
    }
  }
  return chains;
}

/** 10 z 16 skrzyżowań; co trzecie światło migocze. */
export function perfLights(): { x: number; y: number; flicker: boolean }[] {
  const all = STREETS.flatMap((cx) => STREETS.map((cy) => cellCentre([cx, cy])));
  return all
    .filter((_, i) => i % 8 !== 3 && i % 8 !== 6 && i !== 15)
    .slice(0, 10)
    .map((point, i) => ({ ...point, flicker: i % 3 === 2 }));
}

/**
 * 38 pól statystów: ulice pionowe co ~6–7 pól, potem poziome między skrzyżowaniami;
 * bez pól graczy i obu tras marszu. Pierwszy to maszerujący statysta MG.
 */
export function npcCells(): [number, number][] {
  const along = [3, 9, 16, 22, 29, 35, 42, 48, 55, 61];
  const between = [6, 19, 32, 44, 57];
  const cells: [number, number][] = [];
  for (const x of STREETS) for (const y of along) cells.push([x, y]);
  for (const y of STREETS) for (const x of between) cells.push([x, y]);
  const free = cells.filter(
    ([x, y]) => !(x === 25 && y >= 16 && y <= 35) && !(x === 13 && y > 3 && y <= 22),
  );
  return free.slice(0, 38);
}

async function ok<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  const ack = await emitAck<T>(socket, event, payload, 30_000);
  expect(ack, `${event}: ${JSON.stringify(ack).slice(0, 300)}`).toMatchObject({ ok: true });
  return (ack as { data: T }).data;
}

/**
 * Buduje scenę pomiarową w kampanii z `po-T6` i ją aktywuje. Figury Kowala
 * (Marek) i Iskry (Ola) z kartami, 38 statystów z portretami, które już leżą
 * w uploadach punktu (biblioteka portretów MG).
 */
export async function buildPerfScene(gm: Socket): Promise<{ sceneId: string; npcIds: string[] }> {
  const api = await apiGm();
  const upload = await api.post('/api/uploads/maps', {
    multipart: {
      file: { name: 'test-map-4096.png', mimeType: 'image/png', buffer: readFileSync(PERF_MAP) },
    },
  });
  expect(upload.status(), await upload.text()).toBe(201);
  const map = (await upload.json()) as { url: string; width: number; height: number };
  await api.dispose();

  const scene = await ok<{ id: string }>(gm, 'scene:create', { name: PERF_SCENE });
  await ok(gm, 'scene:update', {
    sceneId: scene.id,
    patch: {
      background: map,
      grid: { sizePx: PERF_CELL },
      playerMove: 'explore',
    },
  });
  for (const points of perfWalls()) {
    await ok(gm, 'wall:create', {
      sceneId: scene.id,
      points: points.map(([x, y]) => ({ x, y })),
      kind: 'wall',
    });
  }
  for (const light of perfLights()) {
    await ok(gm, 'light:create', { sceneId: scene.id, ...light });
  }
  for (const [character, owner] of [
    ['Kowal', 'Marek'],
    ['Iskra', 'Ola'],
  ] as const) {
    await ok(gm, 'token:create', {
      sceneId: scene.id,
      name: character,
      ...cellTopLeft(PLAYER_START[character]),
      ownerId: userId(owner),
      characterId: characterId(character),
    });
  }
  const portraits = query<{ imageUrl: string }>(
    `SELECT DISTINCT imageUrl FROM Token WHERE imageUrl LIKE '/uploads/%'`,
  ).map((row) => row.imageUrl);
  const npcIds: string[] = [];
  for (const [i, cell] of npcCells().entries()) {
    const created = await ok<{ id: string }>(gm, 'token:create', {
      sceneId: scene.id,
      name: `Przechodzień ${i + 1}`,
      imageUrl: portraits.length ? portraits[i % portraits.length] : null,
      ...cellTopLeft(cell),
      hp: { current: 20, max: 20 },
    });
    npcIds.push(created.id);
  }
  await ok(gm, 'scene:activate', { sceneId: scene.id });
  return { sceneId: scene.id, npcIds };
}

/** Dynamiczna + ciemność (widzenie po ciemku 4 m, jak „Knajpa”) + pamięć terenu. */
export async function perfDynamic(gm: Socket, sceneId: string): Promise<void> {
  await ok(gm, 'scene:visibility', { sceneId, visibility: 'dynamic' });
  await ok(gm, 'scene:lighting', { sceneId, dark: true, darkSightM: 4 });
}

/** Ręczna mgła: całość zakryta, odsłonięty środek 2000 × 2000 px z trasą gracza. */
export async function perfFog(gm: Socket, sceneId: string): Promise<void> {
  await ok(gm, 'scene:visibility', { sceneId, visibility: 'fog' });
  await ok(gm, 'fog:reset', { sceneId, mode: 'hide' });
  await ok(gm, 'fog:paint', {
    sceneId,
    shape: { kind: 'rect', mode: 'reveal', x: 1000, y: 1000, width: 2000, height: 2000 },
  });
}

// --- Kamera ------------------------------------------------------------------

async function mapBox(page: Page) {
  const box = await page.locator('.map-area').boundingBox();
  if (!box) throw new Error('E2E: no map area');
  return box;
}

/** Kamera najdalej, jak się da (gracz: zamknięta w granicach mapy). */
export async function zoomAllOut(page: Page): Promise<void> {
  const box = await mapBox(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 14; i += 1) {
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(300);
}

/** Przeciągnięcie gołym lewym przyciskiem (panorama, decyzja MG z 05.09) tak, żeby punkt sceny stanął na środku mapy. */
export async function centreOn(page: Page, point: WorldPoint): Promise<void> {
  const box = await mapBox(page);
  const from = await worldToClient(page, point);
  const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 + 30 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}

/**
 * Najbliższa kamera, w której oba punkty mieszczą się na mapie z marginesem —
 * od najdalszej: krok kółkiem, potem środek trasy z powrotem na środek ekranu
 * (kółko pixi-viewport nie trzyma punktu pod kursorem na brzegach mapy).
 */
export async function frameBoth(page: Page, a: WorldPoint, b: WorldPoint): Promise<void> {
  await zoomAllOut(page);
  const box = await mapBox(page);
  const inside = (p: WorldPoint) =>
    p.x > box.x + 80 &&
    p.x < box.x + box.width - 80 &&
    p.y > box.y + 160 &&
    p.y < box.y + box.height - 120;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  await centreOn(page, mid);
  for (let step = 0; step < 12; step += 1) {
    const centre = await worldToClient(page, mid);
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(200);
    await centreOn(page, mid);
    const [sa, sb] = [await worldToClient(page, a), await worldToClient(page, b)];
    if (process.env.E2E_T7C_DEBUG) console.log('frameBoth', step, sa, sb);
    if (!inside(sa) || !inside(sb)) {
      await page.mouse.wheel(0, 240);
      await page.waitForTimeout(200);
      await centreOn(page, mid);
      break;
    }
  }
}

/** Przesuwanie kamery gołym lewym przyciskiem: okrąg 300 px w ~3 s, dwa razy. */
export async function panCircle(page: Page): Promise<void> {
  const box = await mapBox(page);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  for (let lap = 0; lap < 2; lap += 1) {
    await page.mouse.move(cx + 150, cy);
    await page.mouse.down();
    for (let i = 1; i <= 60; i += 1) {
      const angle = (i / 60) * 2 * Math.PI;
      await page.mouse.move(cx + 150 * Math.cos(angle), cy + 150 * Math.sin(angle));
      await page.waitForTimeout(25);
    }
    await page.mouse.up();
  }
}

/** Kółko: pięć kroków bliżej i pięć dalej nad środkiem ekranu. */
export async function wheelInOut(page: Page): Promise<void> {
  const box = await mapBox(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (const delta of [-240, -240, -240, -240, -240, 240, 240, 240, 240, 240]) {
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(150);
  }
}

/** Pozycja figury u klienta (lewy górny róg) — marsz kończy się, gdy stanie na celu. */
export async function clientTokenAt(actor: Actor, tokenId: string) {
  const store = await actor.store<{ tokens: Record<string, { x: number; y: number }> }>('token');
  const view = store?.tokens[tokenId];
  return view ? { x: Math.round(view.x), y: Math.round(view.y) } : null;
}
