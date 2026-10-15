import type { Socket } from 'socket.io-client';
import { expect, test, type Actor, type Cast, type Engine } from '../../fixtures/actors.ts';
import { clickWorld, walkWorld } from '../../fixtures/canvas.ts';
import { queryOne } from '../../fixtures/db.ts';
import { apiGm, cookieHeader, invite } from '../../fixtures/nocna-zmiana.ts';
import {
  clientMemory,
  mainThreadLoad,
  recordMeasurement,
  type MainThreadLoad,
  startFrameMeter,
  stopFrameMeter,
  type FrameStats,
} from '../../fixtures/pomiary.ts';
import { DEAD_GATEWAY, rawSocket } from '../../fixtures/security.ts';
import { emitAck } from '../../fixtures/socket.ts';
import {
  buildPerfScene,
  cellCentre,
  cellTopLeft,
  clientTokenAt,
  frameBoth,
  NPC_GOAL,
  NPC_START,
  panCircle,
  perfDynamic,
  perfFog,
  PERF_CELL,
  PERF_SCENE,
  PLAYER_GOAL,
  PLAYER_START,
  wheelInOut,
  zoomAllOut,
} from '../../fixtures/wydajnosc.ts';
import { restoreCheckpoint, startInstance } from '../../instance/instance.ts';

/**
 * T7c, część 1 (`testy.md` 6.3, „wydajność mapy”): scena 4096 px z 40 figurami,
 * 200 odcinkami ścian i 10 światłami w dwóch trybach (Dynamiczna + ciemność +
 * pamięć terenu, potem ręczna mgła), oczami MG i gracza w obu silnikach (decyzje
 * MG z 02.10). Okno Full HD, headless z GPU.
 *
 * Każdy aktor mierzy **sam** — otwiera się, mierzy i zamyka, zanim wejdzie
 * następny — żeby cudze płótna nie dzieliły karty graficznej i liczby były
 * linią bazową refaktoryzacji `MapRenderer.ts`. Liczby bez progów: klatki
 * (p50/p95, > 50 ms, > 100 ms) w spoczynku, przy przesuwaniu i kółku kamery,
 * w marszu; czas do narysowanej mapy; liczniki Pixi i sterta po wszystkim.
 */

const FILE = 't7c-mapa';

interface Viewer {
  label: string;
  engine: Engine;
  /** `null` = MG; inaczej gracz i jego postać. */
  player: { name: 'Marek' | 'Ola'; character: 'Kowal' | 'Iskra' } | null;
}

const VIEWERS: Viewer[] = [
  { label: 'MG-chromium', engine: 'chromium', player: null },
  { label: 'MG-firefox', engine: 'firefox', player: null },
  { label: 'Marek-chromium', engine: 'chromium', player: { name: 'Marek', character: 'Kowal' } },
  { label: 'Ola-firefox', engine: 'firefox', player: { name: 'Ola', character: 'Iskra' } },
];

test.describe.serial('T7c odporność: wydajność mapy @odpornosc', () => {
  let gm: Socket;
  let sceneId = '';
  let npcIds: string[] = [];

  test.beforeAll(async ({ cast }) => {
    test.setTimeout(5 * 60_000);
    cast.viewport = { width: 1920, height: 1080 };
    await restoreCheckpoint('po-T6');
    await startInstance(DEAD_GATEWAY);
    const { socket } = await rawSocket(await cookieHeader(await apiGm()));
    gm = socket!;
  });

  test.afterAll(async ({ cast }) => {
    gm?.close();
    await cast.closeAll();
    cast.viewport = { width: 1600, height: 900 };
  });

  const tokenOn = (character: string) =>
    queryOne<{ id: string }>(
      `SELECT t.id FROM Token t JOIN Scene s ON s.id = t.sceneId JOIN Character c ON c.id = t.characterId
        WHERE s.name = ? AND c.name = ?`,
      PERF_SCENE,
      character,
    )!.id;

  async function open(cast: Cast, viewer: Viewer): Promise<{ actor: Actor; readyMs: number }> {
    const t0 = Date.now();
    const actor = viewer.player
      ? await cast.gracz(
          viewer.player.name,
          viewer.engine,
          await invite(await apiGm(), viewer.player.name),
        )
      : await cast.mg(viewer.engine);
    actor.page.setDefaultTimeout(20_000);
    // Gotowa mapa = scena w magazynie i tekstura 4096² (64 MB RGBA) na karcie graficznej.
    await expect
      .poll(
        async () => {
          const scene = await actor.store<{ scene: { name: string } | null }>('scene');
          const counts = await actor.page.evaluate(() => window.__vttE2E?.counts().pixi ?? null);
          return scene?.scene?.name === PERF_SCENE && (counts?.gpuTextureMb ?? 0) >= 64;
        },
        { timeout: 60_000, intervals: [100], message: `${viewer.label}: map ready` },
      )
      .toBe(true);
    const readyMs = Date.now() - t0;
    return { actor, readyMs };
  }

  /** Klatki w oknie pomiaru, a w Chromium także zajętość wątku głównego. */
  async function meter(
    actor: Actor,
    key: string,
    body: () => Promise<void>,
  ): Promise<FrameStats & Partial<MainThreadLoad>> {
    await startFrameMeter(actor.page, key);
    if (actor.engine !== 'chromium') {
      await body();
      return stopFrameMeter(actor.page, key);
    }
    const { load } = await mainThreadLoad(actor.page, body);
    return { ...(await stopFrameMeter(actor.page, key)), ...load };
  }

  /**
   * Marsz klikiem: figura, potem pole celu. Na scenie z 38 statystami marsz staje
   * na „… w polu widzenia — marsz przerwany” (zachowanie aplikacji, sekcja 8 z T5b),
   * więc jak człowiek — klik w figurę i cel jeszcze raz. Koniec, gdy klient i baza
   * stoją na celu; liczba przerwań idzie do pomiaru.
   */
  async function march(
    actor: Actor,
    tokenId: string,
    to: readonly [number, number],
  ): Promise<{ ms: number; przerwania: number }> {
    const goal = cellTopLeft(to);
    const t0 = Date.now();
    let stops = -1;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const at = await clientTokenAt(actor, tokenId);
      if (at && at.x === goal.x && at.y === goal.y) break;
      stops += 1;
      await clickWorld(actor.page, { x: at!.x + PERF_CELL / 2, y: at!.y + PERF_CELL / 2 });
      await actor.page.waitForTimeout(250);
      await walkWorld(actor.page, cellCentre(to));
      // Czekamy, aż figura dojdzie albo stanie na dłużej niż 1,5 s.
      let last = JSON.stringify(await clientTokenAt(actor, tokenId));
      let still = Date.now();
      while (Date.now() - still < 1_500) {
        await actor.page.waitForTimeout(100);
        const now = JSON.stringify(await clientTokenAt(actor, tokenId));
        if (now === JSON.stringify(goal)) break;
        if (now !== last) {
          last = now;
          still = Date.now();
        }
      }
    }
    await expect.poll(() => clientTokenAt(actor, tokenId), { timeout: 5_000 }).toEqual(goal);
    const ms = Date.now() - t0;
    await expect
      .poll(() =>
        queryOne<{ x: number; y: number }>('SELECT x, y FROM Token WHERE id = ?', tokenId),
      )
      .toEqual(goal);
    return { ms, przerwania: stops };
  }

  async function resetFigures() {
    for (const [id, cell] of [
      [tokenOn('Kowal'), PLAYER_START.Kowal],
      [tokenOn('Iskra'), PLAYER_START.Iskra],
      [npcIds[0]!, NPC_START],
    ] as const) {
      const moved = await emitAck(gm, 'token:move', {
        tokenId: id,
        ...cellTopLeft(cell),
        final: true,
      });
      expect(moved, JSON.stringify(moved)).toMatchObject({ ok: true });
    }
  }

  async function measureViewer(cast: Cast, mode: string, viewer: Viewer) {
    await resetFigures();
    const { actor, readyMs } = await open(cast, viewer);
    const page = actor.page;
    const result: Record<string, unknown> = { readyMs };
    try {
      const [figure, from, to] = viewer.player
        ? [tokenOn(viewer.player.character), PLAYER_START[viewer.player.character], PLAYER_GOAL]
        : [npcIds[0]!, NPC_START, NPC_GOAL];

      await zoomAllOut(page);
      result.calaMapaSpoczynek = await meter(actor, 'idle-wide', () => page.waitForTimeout(3_000));
      result.calaMapaPrzesuwanie = await meter(actor, 'pan-wide', () => panCircle(page));

      await frameBoth(page, cellCentre(from), cellCentre(to));
      result.bliskoSpoczynek = await meter(actor, 'idle-close', () => page.waitForTimeout(3_000));
      result.bliskoKolko = await meter(actor, 'wheel', () => wheelInOut(page));
      await frameBoth(page, cellCentre(from), cellCentre(to));
      let walk = { ms: 0, przerwania: 0 };
      result.marsz = await meter(actor, 'march', async () => {
        walk = await march(actor, figure, to);
      });
      result.marszMs = walk.ms;
      result.marszPrzerwania = walk.przerwania;
      result.pamiec = await clientMemory(page, viewer.engine);
      result.bledyKonsoli = actor.unexpectedErrors();
    } finally {
      await actor.close();
      cast.actors.splice(cast.actors.indexOf(actor), 1);
    }
    recordMeasurement(FILE, `${mode}:${viewer.label}`, result);
    test.info().annotations.push({
      type: `${mode} ${viewer.label}`,
      description: JSON.stringify({
        readyMs,
        marszMs: result.marszMs,
        przerwania: result.marszPrzerwania,
        marsz: pick(result.marsz),
        przesuwanie: pick(result.calaMapaPrzesuwanie),
        kolko: pick(result.bliskoKolko),
      }),
    });
    expect(result.bledyKonsoli, `${viewer.label}: console`).toEqual([]);
  }

  const pick = (stats: unknown) => {
    const s = stats as FrameStats & Partial<MainThreadLoad>;
    return { fps: s.fps, p95: s.p95, max: s.max, over50: s.over50, busy: s.busyPct };
  };

  test('scena pomiarowa: 4096 px, 40 figur, 200 odcinków ścian, 10 świateł — aktywna', async () => {
    test.setTimeout(5 * 60_000);
    ({ sceneId, npcIds } = await buildPerfScene(gm));
    const counts = queryOne<{ walls: number; lights: number; tokens: number }>(
      `SELECT (SELECT count(*) FROM Wall WHERE sceneId = ?) AS walls,
              (SELECT count(*) FROM MapLight WHERE sceneId = ?) AS lights,
              (SELECT count(*) FROM Token WHERE sceneId = ?) AS tokens`,
      sceneId,
      sceneId,
      sceneId,
    )!;
    expect(counts).toEqual({ walls: 200, lights: 10, tokens: 40 });
    expect(
      queryOne<{ active: number }>('SELECT active FROM Scene WHERE id = ?', sceneId)!.active,
    ).toBe(1);
  });

  for (const [mode, setup] of [
    ['dynamiczna', perfDynamic],
    ['mgla', perfFog],
  ] as const) {
    for (const viewer of VIEWERS) {
      test(`${mode}: ${viewer.label} — mapa gotowa, kamera, kółko, marsz`, async ({ cast }) => {
        test.setTimeout(4 * 60_000);
        if (viewer === VIEWERS[0]) await setup(gm, sceneId);
        await measureViewer(cast, mode, viewer);
      });
    }
  }
});
