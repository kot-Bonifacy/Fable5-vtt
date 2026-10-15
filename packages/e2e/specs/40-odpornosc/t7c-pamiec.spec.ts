import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { sceneListRow } from '../../fixtures/brama.ts';
import { queryOne } from '../../fixtures/db.ts';
import { apiGm, cookieHeader, invite } from '../../fixtures/nocna-zmiana.ts';
import {
  clientMemory,
  recordMeasurement,
  serverHeap,
  serverProcess,
  slope,
  type ClientMemory,
  type ServerHeap,
} from '../../fixtures/pomiary.ts';
import { DEAD_GATEWAY, rawSocket } from '../../fixtures/security.ts';
import { clickActivate, rollWithCup } from '../../fixtures/table.ts';
import { buildPerfScene, PERF_SCENE } from '../../fixtures/wydajnosc.ts';
import { restoreCheckpoint, startInstance } from '../../instance/instance.ts';

/**
 * T7c, część 2 (`testy.md` 6.3, „wyciek pamięci”): 30 przełączeń scen
 * („Knajpa” → „Brama” → „Wydajność 4096”, przez UI MG: „Aktywuj” i „Pokaż”) i 300
 * rzutów kubkiem w jednej karcie, każdy z animacją 3D (decyzja MG z 02.10: rzuca
 * Ola w Firefoksie, MG w Chromium patrzy — oba silniki odgrywają te same rzuty).
 *
 * Próbki: sterta JS po GC (Chromium, CDP), liczniki haka E2E w obu silnikach
 * (drzewo i tekstury Pixi, kości 3D, DOM) i sterta serwera po GC przez inspektor
 * Node — na starcie, po przełączeniach, po rzutach i po 5 min spoczynku. „Nie
 * rośnie liniowo” = nachylenie po rozgrzewce (`slope`); wagi z decyzji MG z 02.10
 * (B2 > ~200 MB albo spadek klatek, mniejszy liniowy wzrost B3) — test zapisuje
 * liczby, a od poprawek #50 i #51 pilnuje też progów (`SWITCH_LEAK_MB`,
 * `ROLL_LEAK_GEOMETRIES`).
 */

const FILE = 't7c-pamiec';
const SCENES = ['Knajpa', 'Brama', PERF_SCENE] as const;
const SWITCHES = 30;
const ROLLS = Number(process.env.E2E_T7C_RZUTY ?? 300);
const REST_MS = Number(process.env.E2E_T7C_SPOCZYNEK_MS ?? 5 * 60_000);
const FORMULAS = ['/r 1d10', '/r 2d6', '/r 1d10+3', '/r 3d6', '/r 1d6'];
/**
 * Progi wycieku po poprawkach #50 i #51 (decyzja MG z 02.10: test pilnuje, a nie
 * tylko mierzy). Nachylenie po rozgrzewce — zero z szumem odśmiecania, nie zero.
 */
const SWITCH_LEAK_MB = 0.2;
const ROLL_LEAK_GEOMETRIES = 0.1;

interface Sample {
  step: number;
  mg: ClientMemory;
  ola: ClientMemory;
}

test.describe.serial('T7c odporność: wyciek pamięci @odpornosc', () => {
  let gm: Socket;
  let mg: Actor;
  let ola: Actor;
  const server: Record<string, ServerHeap & { workingSetMb: number | null }> = {};
  const switches: Sample[] = [];
  const rolls: Sample[] = [];

  test.beforeAll(async ({ cast }) => {
    test.setTimeout(5 * 60_000);
    cast.viewport = { width: 1920, height: 1080 };
    await restoreCheckpoint('po-T6');
    await startInstance(DEAD_GATEWAY, { inspect: true });
    const { socket } = await rawSocket(await cookieHeader(await apiGm()));
    gm = socket!;
  });

  test.afterAll(async ({ cast }) => {
    gm?.close();
    await cast.closeAll();
    cast.viewport = { width: 1600, height: 900 };
  });

  async function serverSample(label: string) {
    const heap = await serverHeap();
    server[label] = { ...heap, workingSetMb: (await serverProcess())?.workingSetMb ?? null };
  }

  async function sample(step: number): Promise<Sample> {
    return {
      step,
      mg: await clientMemory(mg.page, 'chromium'),
      ola: await clientMemory(ola.page, 'firefox'),
    };
  }

  async function onScene(actor: Actor, name: string) {
    await expect
      .poll(
        async () => (await actor.store<{ scene: { name: string } | null }>('scene'))?.scene?.name,
        { timeout: 30_000, message: `${actor.name} on ${name}` },
      )
      .toBe(name);
  }

  async function chatTab(actor: Actor) {
    const input = actor.page.getByLabel('Wiadomość czatu');
    if (!(await input.isVisible())) {
      await actor.page.getByRole('button', { name: /^Czat/ }).first().click();
    }
  }

  /** Nachylenie (na krok) od rozgrzewki do końca serii — `null`, gdy licznika nie ma. */
  function trend(series: Sample[], read: (s: Sample) => number | null | undefined) {
    const points = series
      .map((s) => ({ x: s.step, y: read(s) }))
      .filter((p): p is { x: number; y: number } => typeof p.y === 'number');
    if (points.length < 2) return null;
    return {
      od: points[0]!.y,
      do: points[points.length - 1]!.y,
      naKrok: Math.round(slope(points) * 1000) / 1000,
    };
  }

  function trends(series: Sample[]) {
    return {
      mgStertaMb: trend(series, (s) => s.mg.heapMb),
      mgBuforyMb: trend(series, (s) => s.mg.buffersMb),
      mgSluchacze: trend(series, (s) => s.mg.listeners),
      mgWezlyPixi: trend(series, (s) => s.mg.pixi?.nodes),
      mgTeksturyGpu: trend(series, (s) => s.mg.pixi?.gpuTextures),
      mgTeksturyGpuMb: trend(series, (s) => s.mg.pixi?.gpuTextureMb),
      mgAssets: trend(series, (s) => s.mg.pixi?.assetsCached),
      mgKosciGeometrie: trend(series, (s) => s.mg.dice?.geometries),
      mgKosciTekstury: trend(series, (s) => s.mg.dice?.textures),
      mgDom: trend(series, (s) => s.mg.dom.nodes),
      olaWezlyPixi: trend(series, (s) => s.ola.pixi?.nodes),
      olaTeksturyGpu: trend(series, (s) => s.ola.pixi?.gpuTextures),
      olaTeksturyGpuMb: trend(series, (s) => s.ola.pixi?.gpuTextureMb),
      olaAssets: trend(series, (s) => s.ola.pixi?.assetsCached),
      olaKosciGeometrie: trend(series, (s) => s.ola.dice?.geometries),
      olaKosciTekstury: trend(series, (s) => s.ola.dice?.textures),
      olaDom: trend(series, (s) => s.ola.dom.nodes),
    };
  }

  test('start: scena 4096 obok „Knajpy” i „Bramy”, MG w Chromium, Ola w Firefoksie', async ({
    cast,
  }) => {
    test.setTimeout(5 * 60_000);
    await buildPerfScene(gm);
    mg = await cast.mg('chromium');
    ola = await cast.gracz('Ola', 'firefox', await invite(await apiGm(), 'Ola'));
    for (const actor of [mg, ola]) actor.page.setDefaultTimeout(20_000);
    await onScene(ola, PERF_SCENE);
    await chatTab(ola);
    await chatTab(mg);
    await serverSample('start');
  });

  test(`${SWITCHES} przełączeń scen przez UI MG (Aktywuj + Pokaż)`, async () => {
    test.setTimeout(20 * 60_000);
    const page = mg.page;
    await page.getByRole('button', { name: 'Sceny', exact: true }).click();
    const switchTo = async (name: string) => {
      const row = sceneListRow(page, name);
      await clickActivate(row);
      await expect
        .poll(
          () =>
            queryOne<{ active: number }>('SELECT active FROM Scene WHERE name = ?', name)!.active,
        )
        .toBe(1);
      await row.getByRole('button', { name: 'Pokaż' }).click();
      await onScene(mg, name);
      await onScene(ola, name);
      // Mapa narysowana u obojga (tekstura tła na karcie graficznej), potem chwila spokoju.
      await page.waitForTimeout(1_500);
    };
    const times: number[] = [];
    for (let i = 1; i <= SWITCHES; i += 1) {
      const t0 = Date.now();
      await switchTo(SCENES[(i - 1) % SCENES.length]!);
      times.push(Date.now() - t0);
      // Próbka po każdym pełnym obrocie (co trzy), pierwsza po rozgrzewce.
      if (i % SCENES.length === 0) switches.push(await sample(i));
    }
    await serverSample('po-przelaczeniach');
    const result = {
      przelaczenMs: times,
      probki: switches,
      trendy: trends(switches),
      bledyKonsoli: { MG: mg.unexpectedErrors(), Ola: ola.unexpectedErrors() },
    };
    recordMeasurement(FILE, 'przelaczenia', result);
    test.info().annotations.push({
      type: 'przełączenia — trendy na przełączenie',
      description: JSON.stringify(result.trendy),
    });
    expect(result.bledyKonsoli).toEqual({ MG: [], Ola: [] });
    // #50 (02.10): przed poprawką +1,72 MB buforów i +1,34 MB sterty MG na przełączenie.
    expect
      .soft(result.trendy.mgBuforyMb?.naKrok, 'bufory MG, MB na przełączenie')
      .toBeLessThan(SWITCH_LEAK_MB);
    expect
      .soft(result.trendy.mgStertaMb?.naKrok, 'sterta MG, MB na przełączenie')
      .toBeLessThan(SWITCH_LEAK_MB);
  });

  test(`${ROLLS} rzutów kubkiem Oli, każdy z animacją 3D u Oli i MG`, async () => {
    test.setTimeout((ROLLS * 15_000 + 5 * 60_000) | 0);
    // MG wraca z listy scen na czat — karty rzutów liczy się w DOM-ie panelu czatu.
    await chatTab(mg);
    await chatTab(ola);
    const cards = (actor: Actor) => actor.page.locator('.chat-roll').count();
    let olaCards = await cards(ola);
    let mgCards = await cards(mg);
    const played: number[] = [];
    for (let i = 1; i <= ROLLS; i += 1) {
      const t0 = Date.now();
      await rollWithCup(ola.page, FORMULAS[i % FORMULAS.length]!);
      // Karta rzutu staje na czacie dopiero po animacji (umowa `kosci`) — u obojga,
      // zanim pójdzie następny, więc dogonienie z #48 (> 3 s zaległości) się nie włącza.
      await expect.poll(() => cards(ola), { timeout: 30_000, intervals: [100] }).toBe(olaCards + 1);
      await expect.poll(() => cards(mg), { timeout: 30_000, intervals: [100] }).toBe(mgCards + 1);
      olaCards += 1;
      mgCards += 1;
      played.push(Date.now() - t0);
      if (i % 30 === 0) rolls.push(await sample(i));
    }
    await serverSample('po-rzutach');
    const result = {
      rzutMs: {
        p50: [...played].sort((a, b) => a - b)[Math.floor(played.length / 2)],
        max: Math.max(...played),
      },
      probki: rolls,
      trendy: trends(rolls),
      bledyKonsoli: { MG: mg.unexpectedErrors(), Ola: ola.unexpectedErrors() },
    };
    recordMeasurement(FILE, 'rzuty', result);
    test.info().annotations.push({
      type: 'rzuty — trendy na rzut',
      description: JSON.stringify(result.trendy),
    });
    expect(result.bledyKonsoli).toEqual({ MG: [], Ola: [] });
    // #51 (02.10): przed poprawką +1,43 (MG) i +1,48 (Ola) geometrii three.js na rzut.
    for (const [who, trend] of [
      ['MG', result.trendy.mgKosciGeometrie],
      ['Ola', result.trendy.olaKosciGeometrie],
    ] as const) {
      expect
        .soft(trend?.naKrok, `geometrie kości u ${who} na rzut`)
        .toBeLessThan(ROLL_LEAK_GEOMETRIES);
    }
  });

  test('spoczynek 5 min: pamięć klientów i serwera po odśmiecaniu', async () => {
    test.setTimeout(REST_MS + 3 * 60_000);
    await mg.page.waitForTimeout(REST_MS);
    const rest = await sample(-1);
    await serverSample('po-spoczynku');
    recordMeasurement(FILE, 'spoczynek', { klienci: rest, serwer: server });
    test.info().annotations.push({
      type: 'serwer (sterta po GC, MB)',
      description: Object.entries(server)
        .map(([k, v]) => `${k}: ${v.heapUsedMb} / RSS ${v.rssMb} / WS ${v.workingSetMb}`)
        .join(' · '),
    });
  });
});
