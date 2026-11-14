import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { runOf } from '../../fixtures/brama.ts';
import { worldToClient } from '../../fixtures/canvas.ts';
import { apiGm, characterId, cookieHeader, userId } from '../../fixtures/nocna-zmiana.ts';
import { query, queryOne, seat, startFromPoT6 } from '../../fixtures/regresja.ts';
import { clickOnMap, walkOnMap } from '../../fixtures/scene.ts';
import { DEAD_GATEWAY, rawSocket } from '../../fixtures/security.ts';
import {
  abilityButton,
  buildNetScene,
  jackIn,
  runWindow,
  takeExit,
  throwNetRoll,
} from '../../fixtures/siec.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { shakeCup } from '../../fixtures/table.ts';
import { pendingDice, scriptDice } from '../../instance/instance.ts';

/**
 * Etap 70c „Dron w ruchu, oczy urządzeń, pasek”. Ciemna hala przecięta ścianą:
 * Iskra przy gnieździe nad nią, pod nią dron, wieżyczka i kamera (figury
 * z ikoną urządzenia — do węzła „Obrona” trafiają same, etap 62), Kot przy
 * dronie, Zbir 12 m dalej i Kowal Marka. Kontrola pożycza Iskrze trzy pary
 * oczu; dron w jednej aktywacji podjeżdża klikiem i strzela, pasek „Oczy
 * i urządzenia” przełącza kadr między oczami i wraca na Iskrę, a „Wyłącz”
 * daje naklejkę „Wyłączony”, którą widzi też Marek.
 *
 * Testy serwera (`net-drone.test.ts`) pilnują rachunku metrów, odmów i kolejki
 * — tu liczy się droga przez UI.
 */

const SCENE = 'Hala 70c';
const SOCKET_AT = { x: 360, y: 460 };
const DRONE = 'Dron 70c';
const TURRET = 'Wieżyczka 70c';
const CAMERA = 'Kamera 70c';
const TARGET = 'Zbir 70c';
const DRONE_AT = { x: 300, y: 1300 };
/** 8 m na wschód — cały RUCH drona (4 × 2 m) jednym marszem. */
const DRONE_TO = { x: 700, y: 1300 };
const TARGET_AT = { x: 900, y: 1300 };
/**
 * Wieżyczka i kamera z dala od prawej krawędzi sceny: kadr nie wyjeżdża poza
 * mapę, więc punkt przy krawędzi zostałby pod oknem Sieci (70b, `map-frame`).
 */
const TURRET_AT = { x: 1100, y: 1700 };
const GUARD_AT = { x: 1100, y: 1500 };
const CAMERA_AT = { x: 300, y: 1800 };
/** Środek figury 1 × 1 przy siatce 100 px. */
const centre = (at: { x: number; y: number }) => ({ x: at.x + 50, y: at.y + 50 });

type Ack<T> = { ok: true; data: T } | { ok: false; error: string };
function dataOf<T>(ack: unknown, what: string): T {
  const typed = ack as Ack<T>;
  if (!typed.ok) throw new Error(`E2E: ${what}: ${JSON.stringify(ack)}`);
  return typed.data;
}

const tokenRow = (name: string) =>
  queryOne<{ id: string; x: number; y: number; statuses: string }>(
    'SELECT t.id, t.x, t.y, t.statuses FROM Token t JOIN Scene s ON s.id = t.sceneId WHERE s.name = ? AND t.name = ?',
    SCENE,
    name,
  )!;
const statusesOf = (name: string) => JSON.parse(tokenRow(name).statuses || '[]') as string[];
const combat = () =>
  queryOne<{ round: number }>(
    'SELECT c.round FROM Combat c JOIN Scene s ON s.id = c.sceneId WHERE s.name = ?',
    SCENE,
  );
const activeTokenName = () =>
  queryOne<{ name: string }>(
    'SELECT t.name FROM Combat c JOIN Combatant m ON m.id = c.activeCombatantId JOIN Token t ON t.id = m.tokenId JOIN Scene s ON s.id = c.sceneId WHERE s.name = ?',
    SCENE,
  )?.name;
const lastRollId = () =>
  queryOne<{ id: number }>(
    "SELECT COALESCE(MAX(id), 0) AS id FROM ChatMessage WHERE kind = 'roll'",
  )!.id;
const rollsAfter = (after: number) =>
  query<{ id: number; payload: string }>(
    "SELECT id, payload FROM ChatMessage WHERE kind = 'roll' AND id > ? ORDER BY id",
    after,
  );
const deviceTurns = () =>
  ((
    runOf('Iskra')?.state as unknown as {
      deviceTurns?: { moveLeftM: number; actionLeft: boolean }[];
    }
  )?.deviceTurns ?? []) as { moveLeftM: number; actionLeft: boolean }[];

/** Czy Ola pamięta to pole mapy — jej własna pamięć (scena bez wspólnego widoku). */
function olaRemembers(point: { x: number; y: number }): boolean {
  const row = queryOne<{ cell: number; cols: number; rows: number; data: string }>(
    'SELECT e.cell, e.cols, e.rows, e.data FROM PlayerExploration e JOIN Scene s ON s.id = e.sceneId WHERE s.name = ? AND e.userId = ?',
    SCENE,
    userId('Ola'),
  );
  if (!row) return false;
  const index = Math.floor(point.y / row.cell) * row.cols + Math.floor(point.x / row.cell);
  // Na przemian długości pasów „niezbadane, zbadane, …” wierszami.
  let at = 0;
  let explored = false;
  for (const run of row.data.split(',').map(Number)) {
    if (index < at + run) return explored;
    at += run;
    explored = !explored;
  }
  return false;
}

const STATIST = {
  ref: 3,
  dex: 3,
  body: 5,
  will: 5,
  skillLevel: 1,
  evasion: 0,
  armorSp: 0,
  weaponId: 'weapon.submachine-gun',
  weaponName: 'Pistolet maszynowy',
  weaponDamage: '2k6',
  ammoCurrent: 30,
  ammoMax: 30,
};

test.describe.serial('@szybkie T70c dron w ruchu, oczy urządzeń, pasek', () => {
  let gm: Socket;
  let mg: Actor;
  let ola: Actor;
  let marek: Actor;
  let sceneId = '';
  const hud = (actor: Actor) => actor.page.locator('.hud-rail');
  const device = (actor: Actor) => actor.page.getByTestId('hud-device');
  const strip = (actor: Actor) => runWindow(actor).getByTestId('net-eyes');
  const tile = (actor: Actor, name: string) =>
    strip(actor).locator('.net-eye').filter({ hasText: name });
  const namesSeenBy = async (actor: Actor) =>
    Object.values(
      (await actor.store<{ tokens: Record<string, { name: string }> }>('token')).tokens,
    ).map((entry) => entry.name);
  const tokenOf = async (actor: Actor, name: string) =>
    Object.values(
      (await actor.store<{ tokens: Record<string, { name: string; statuses: string[] }> }>('token'))
        .tokens,
    ).find((entry) => entry.name === name);
  const selected = async (actor: Actor) =>
    (await actor.store<{ tokenId: string | null }>('selection')).tokenId;

  test.beforeAll(async ({ cast }) => {
    await startFromPoT6(DEAD_GATEWAY);
    test.setTimeout(4 * 60_000);
    const { socket } = await rawSocket(await cookieHeader(await apiGm()));
    gm = socket!;

    ({ sceneId } = await buildNetScene(gm, {
      scene: SCENE,
      runner: { character: 'Iskra', player: 'Ola', at: { x: 200, y: 300 } },
      socketAt: SOCKET_AT,
      architecture: {
        name: 'Sieć hali 70c',
        branches: [
          {
            id: 'trzon-70c',
            parentFloor: null,
            floors: [
              { id: 'wejscie-70c', kind: 'empty', label: 'Wejście' },
              { id: 'wezel-70c', kind: 'controlNode', label: 'Obrona', dv: 6 },
            ],
          },
        ],
      },
    }));
    // Ciemna hala ze ścianą przez całą szerokość: Iskra widzi tylko swój kąt.
    dataOf(await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'dynamic' }), 'widoczność');
    dataOf(await emitAck(gm, 'scene:lighting', { sceneId, dark: true, darkSightM: 4 }), 'ciemność');
    dataOf(
      await emitAck(gm, 'wall:create', {
        sceneId,
        kind: 'wall',
        points: [
          { x: 0, y: 1000 },
          { x: 2000, y: 1000 },
        ],
      }),
      'ściana',
    );

    const figure = async (name: string, at: { x: number; y: number }, extra = {}) =>
      dataOf<{ id: string }>(
        await emitAck(gm, 'token:create', { sceneId, name, ...at, ...extra }),
        `token:create (${name})`,
      ).id;
    // Dron: RUCH 4 (8 m na aktywację), Wartość bojowa 12, wzrok 10 m.
    const droneId = await figure(DRONE, DRONE_AT, { glyph: 'drone', hp: { current: 20, max: 20 } });
    dataOf(
      await emitAck(gm, 'token:stat', {
        tokenId: droneId,
        quick: { ...STATIST, move: 4, combatValue: 12 },
      }),
      'token:stat (dron)',
    );
    const turretId = await figure(TURRET, TURRET_AT, {
      glyph: 'turret',
      hp: { current: 25, max: 25 },
    });
    dataOf(
      await emitAck(gm, 'token:stat', {
        tokenId: turretId,
        quick: { ...STATIST, combatValue: 14 },
      }),
      'token:stat (wieżyczka)',
    );
    const cameraId = await figure(CAMERA, CAMERA_AT, { glyph: 'camera' });
    for (const [id, range] of [
      [droneId, 10],
      [turretId, 6],
      [cameraId, 6],
    ] as const) {
      dataOf(
        await emitAck(gm, 'token:update', { tokenId: id, patch: { visionRange: range } }),
        'wzrok urządzenia',
      );
    }
    dataOf(
      await emitAck(gm, 'token:facing', { tokenId: cameraId, facing: 90 }),
      'kamera na wschód',
    );
    await figure('Kot 70c', { x: 300, y: 1500 });
    await figure(TARGET, TARGET_AT, { hp: { current: 30, max: 30 } });
    // Strażnik 4 m od wieżyczki, poza zasięgiem drona przed marszem.
    await figure('Strażnik 70c', GUARD_AT);
    // Kowal Marka pod ścianą, 3 m od miejsca, w które dojedzie dron.
    await figure(
      'Kowal',
      { x: 700, y: 1150 },
      {
        ownerId: userId('Marek'),
        characterId: characterId('Kowal'),
      },
    );

    ({
      mg,
      players: [ola, marek],
    } = (await seat(cast, ['Ola', 'Marek'], SCENE)) as { mg: Actor; players: [Actor, Actor] });
    ola.page.setDefaultTimeout(15_000);
  });

  test.afterAll(async ({ cast }) => {
    gm?.close();
    await cast.closeAll();
  });

  test('1. Kontrola: trzy pary oczu w ciemności, tylko u Iskry i bez pamięci mapy', async () => {
    await jackIn(ola, SOCKET_AT);
    await takeExit(ola, 'Iskra');
    expect(await namesSeenBy(ola)).not.toContain('Kot 70c');
    scriptDice([9]);
    await abilityButton(ola, 'Kontrola').click();
    await throwNetRoll(ola.page);
    // Pasek przychodzi po animacji kości (pułapka `siec` z 20.10).
    await expect(strip(ola).locator('.net-eye[data-eye]')).toHaveCount(3, { timeout: 20_000 });
    expect(pendingDice()).toBe('');
    await expect.poll(() => statusesOf(DRONE)).toContain('net-seized');
    // Dron widzi Kota w czerni hali — Iskra razem z nim; Marek nie.
    await expect.poll(() => namesSeenBy(ola)).toContain('Kot 70c');
    await expect.poll(() => namesSeenBy(ola)).toContain('Strażnik 70c');
    expect(await namesSeenBy(ola)).not.toContain(TARGET);
    expect(await namesSeenBy(marek)).not.toContain('Kot 70c');
    // Pożyczone oczy nie zasilają pamięci mapy (decyzja z 20.10).
    expect(olaRemembers(centre({ x: 300, y: 1500 }))).toBe(false);
    expect(olaRemembers(centre(DRONE_AT))).toBe(false);
  });

  test('2. walka: dron podjeżdża klikiem z metrów aktywacji, potem strzela; trzecia czynność odmawia', async () => {
    const started = dataOf<{ combatants: { id: string; tokenId: string | null }[] }>(
      await emitAck(gm, 'combat:start', {
        sceneId,
        tokenIds: [tokenRow('Iskra').id, tokenRow(DRONE).id, tokenRow(TARGET).id],
      }),
      'combat:start',
    );
    const idOf = (name: string) =>
      started.combatants.find((row) => row.tokenId === tokenRow(name).id)!.id;
    await expect(ola.page.locator('.dice-cup')).toHaveAttribute('title', /inicjatyw/i);
    scriptDice([8]);
    await shakeCup(ola.page);
    await expect
      .poll(
        () =>
          queryOne<{ initiative: number | null }>(
            'SELECT initiative FROM Combatant WHERE id = ?',
            idOf('Iskra'),
          )?.initiative ?? null,
        { timeout: 20_000 },
      )
      .not.toBeNull();
    for (const [name, initiative] of [
      [DRONE, 5],
      [TARGET, 3],
    ] as const) {
      dataOf(
        await emitAck(gm, 'combat:set-initiative', { combatantId: idOf(name), initiative }),
        `inicjatywa: ${name}`,
      );
    }
    await mg.page.getByRole('button', { name: /Rozpocznij walkę/ }).click();
    await expect.poll(() => combat()?.round).toBe(1);
    await expect.poll(activeTokenName).toBe('Iskra');
    await expect
      .poll(
        async () =>
          (
            await ola.store<{ runs: { operated: { name: string; state: string }[] }[] }>('netRun')
          ).runs[0]?.operated.find((figure) => figure.name === DRONE)?.state,
        { timeout: 30_000 },
      )
      .toBe('ready');
    await ola.page.waitForTimeout(500);

    // Miniatura drona bierze go w rękę i przenosi na niego kadr.
    await tile(ola, DRONE).locator('.net-eye-take').click();
    await expect(device(ola)).toBeVisible();
    await expect(hud(ola).locator('.hud-head-title')).toHaveText('Urządzenie');
    const move = hud(ola).locator('[data-device-move]');
    await expect(move.locator('[data-device-metres]')).toHaveText(/^8/);
    await expect(move.locator('.hud-cost--net')).toHaveCount(1);
    await ola.page.waitForTimeout(700);

    // Marsz klikiem w podłoże: 8 m, cały RUCH drona.
    await walkOnMap(ola.page, centre(DRONE_TO));
    await expect
      .poll(
        () => {
          const row = tokenRow(DRONE);
          return `${row.x},${row.y}`;
        },
        { timeout: 20_000 },
      )
      .toBe(`${DRONE_TO.x},${DRONE_TO.y}`);
    await expect.poll(() => deviceTurns()[0]?.moveLeftM).toBe(0);
    expect(deviceTurns()[0]!.actionLeft).toBe(true);
    // Kreska metrów zeszła do zera, a dron widzi teraz Zbira.
    await expect(move.locator('[data-device-metres]')).toHaveText(/^0/, { timeout: 20_000 });
    await expect.poll(() => namesSeenBy(ola)).toContain(TARGET);

    // Strzał w tej samej aktywacji — Wartością bojową drona.
    await hud(ola).getByRole('button', { name: 'Tryb ognia' }).click();
    await hud(ola)
      .locator('.hud-mode')
      .filter({ hasText: /ciągły/i })
      .click();
    const before = lastRollId();
    scriptDice([8]);
    await clickOnMap(ola.page, centre(TARGET_AT));
    await ola.page.waitForTimeout(400);
    await expect(ola.page.locator('.dice-cup')).toHaveAttribute('title', /Pistolet maszynowy/);
    await shakeCup(ola.page);
    await expect.poll(() => rollsAfter(before).length, { timeout: 20_000 }).toBeGreaterThan(0);
    const roll = JSON.parse(rollsAfter(before)[0]!.payload) as {
      actor: string;
      breakdown: { kind: string; value: number }[];
    };
    expect(roll.actor).toBe(DRONE);
    expect(roll.breakdown.find((row) => row.kind === 'skill')?.value).toBe(12);
    await expect.poll(() => deviceTurns()[0]?.actionLeft).toBe(false);
    expect(deviceTurns()).toHaveLength(1);

    // Ani drugiego strzału, ani metra więcej.
    const socket = await ola.socket();
    expect(
      await emitAck(socket, 'attack:roll', {
        attackerTokenId: tokenRow(DRONE).id,
        targetTokenId: tokenRow(TARGET).id,
        request: { weaponRowId: 'statist-weapon' },
      }),
    ).toEqual({ ok: false, error: 'NET_DEVICE_SPENT' });
    expect(
      await emitAck(socket, 'token:walk', {
        tokenId: tokenRow(DRONE).id,
        route: [{ x: DRONE_TO.x, y: DRONE_TO.y + 100 }],
      }),
    ).toEqual({ ok: false, error: 'NET_DEVICE_NO_MOVE_LEFT' });
    await expect(move).toHaveClass(/hud-slot--refused/);
  });

  test('3. pasek: „▸” przenosi kadr i zaznaczenie po trzech oczach, „⌂” wraca na Iskrę', async () => {
    const eyes = [DRONE, TURRET, CAMERA].map((name) => tokenRow(name).id);
    const at = { [eyes[0]!]: DRONE_TO, [eyes[1]!]: TURRET_AT, [eyes[2]!]: CAMERA_AT };
    const map = (await ola.page.locator('.map-area').boundingBox())!;
    const panel = (await runWindow(ola).boundingBox())!;
    /** Punkt sceny stoi na mapie, w pasie obok okna Sieci. */
    const inView = async (point: { x: number; y: number }) => {
      const client = await worldToClient(ola.page, point);
      const onMap =
        client.x > map.x &&
        client.x < map.x + map.width &&
        client.y > map.y &&
        client.y < map.y + map.height;
      const underPanel =
        client.x > panel.x &&
        client.x < panel.x + panel.width &&
        client.y > panel.y &&
        client.y < panel.y + panel.height;
      return onMap && !underPanel;
    };

    const visited: string[] = [];
    for (let step = 0; step < 3; step += 1) {
      const previous = await selected(ola);
      await strip(ola).getByRole('button', { name: 'Następne oko' }).click();
      await expect.poll(() => selected(ola)).not.toBe(previous);
      const now = (await selected(ola))!;
      expect(eyes).toContain(now);
      await expect.poll(() => inView(centre(at[now]!))).toBe(true);
      await expect(strip(ola).locator('.net-eye--selected')).toHaveCount(1);
      visited.push(now);
    }
    expect(new Set(visited).size).toBe(3);
    // Czwarty „▸” wraca do pierwszego oka.
    await strip(ola).getByRole('button', { name: 'Następne oko' }).click();
    await expect.poll(() => selected(ola)).toBe(visited[0]);

    await strip(ola).getByRole('button', { name: 'Wróć do netrunnera' }).click();
    await expect.poll(() => selected(ola)).toBe(tokenRow('Iskra').id);
    await expect(hud(ola).locator('.hud-head-title')).toHaveText('Postać');
    await expect.poll(() => inView({ x: 250, y: 350 })).toBe(true);
  });

  test('4. „Wyłącz” na dronie: naklejka „Wyłączony” u MG i u Marka, dron wypada z oczu paska', async () => {
    // `combat:end` kończy walkę sceny, którą gniazdo ogląda — surowe gniazdo MG
    // podłączyło się przed aktywacją hali, więc idzie świeże, z ciasteczka MG.
    dataOf(await emitAck(await mg.socket(), 'combat:end', undefined), 'koniec walki');
    await expect.poll(() => combat() ?? null).toBeNull();
    await tile(ola, DRONE).locator('.net-eye-take').click();
    await expect(device(ola)).toBeVisible();
    await hud(ola).locator('[data-device-verb="off"]').click();
    await expect.poll(() => statusesOf(DRONE)).toContain('net-off');
    expect(statusesOf(DRONE)).not.toContain('net-seized');
    await expect.poll(async () => (await tokenOf(mg, DRONE))?.statuses).toContain('net-off');
    // Kowal stoi 3 m od drona — Marek widzi figurę, więc i naklejkę.
    await expect.poll(async () => (await tokenOf(marek, DRONE))?.statuses).toContain('net-off');
    // Na pasku dron nie jest już okiem: szara kropka i „Włącz”.
    await expect(strip(ola).locator('.net-eye[data-eye]')).toHaveCount(2);
    await expect(tile(ola, DRONE).locator('[data-eye-state="off"]')).toHaveCount(1);
    await expect(tile(ola, DRONE).getByRole('button', { name: 'Włącz' })).toBeVisible();
    // Belka wróciła do Iskry, a Kot zniknął z jej widoku razem z oczami drona.
    await expect(device(ola)).toHaveCount(0);
    await expect.poll(() => namesSeenBy(ola)).not.toContain('Kot 70c');
  });

  test('5. F5 Oli w trakcie kontroli: okno, pasek, belka i oczy wracają', async () => {
    await ola.page.reload();
    await expect(runWindow(ola)).toBeVisible({ timeout: 30_000 });
    await expect(strip(ola).locator('.net-eye[data-eye]')).toHaveCount(2, { timeout: 20_000 });
    await expect(tile(ola, DRONE).locator('[data-eye-state="off"]')).toHaveCount(1);
    await expect.poll(() => namesSeenBy(ola)).toContain('Strażnik 70c');
    await tile(ola, TURRET).locator('.net-eye-take').click();
    await expect(device(ola)).toBeVisible();
    await expect(device(ola)).toContainText('przez: Obrona');
  });

  test('6. konsola przeglądarek czysta', async () => {
    for (const actor of [mg, ola, marek]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
  });
});
