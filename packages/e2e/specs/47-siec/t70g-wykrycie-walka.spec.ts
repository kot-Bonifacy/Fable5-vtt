import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { apiGm, campaignId, cookieHeader } from '../../fixtures/nocna-zmiana.ts';
import { query, queryOne, startFromPoT6, viewedScene } from '../../fixtures/regresja.ts';
import { DEAD_GATEWAY, rawSocket } from '../../fixtures/security.ts';
import {
  abilityButton,
  buildNetScene,
  exitsDown,
  floorCard,
  jackIn,
  positionOf,
  takeExit,
  throwNetRoll,
} from '../../fixtures/siec.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { createInvitation } from '../../fixtures/table.ts';
import { pendingDice, scriptDice } from '../../instance/instance.ts';

/**
 * Wykrycie w Sieci zaczyna walkę (decyzja MG z 14.11). Do tej zmiany LOD, który
 * wykrył netrunnera poza walką, polował bez kolejki, a nieudane Maskowanie
 * zostawiało tylko znacznik na planie MG. Teraz oba zakładają starcie „Przed
 * walką” jak zauważenie wroga (etap 56): MG dostaje pasek „Wykrycie w Sieci”
 * z „⚔ Rozpocznij walkę / Odwołaj”, drużyna stoi — także w Sieci — a LOD po
 * starcie walki staje na czele kolejki (s. 205).
 *
 * Układ odwrotny niż w T8c: **MG w Firefoksie** (pasek MG to zmiana wyglądu,
 * oglądana poza Chrome MG), Ola w Chromium.
 */

const SCENE = 'Archiwum 70g';
const SOCKET_AT = { x: 360, y: 460 };
const ARCHITECTURE = 'Sieć archiwum 70g';
const STRAZNIK = 'Strażnik 70g';

type Ack<T> = { ok: true; data: T } | { ok: false; error: string };
function dataOf<T>(ack: unknown, what: string): T {
  const typed = ack as Ack<T>;
  if (!typed.ok) throw new Error(`E2E: ${what}: ${JSON.stringify(ack)}`);
  return typed.data;
}

const combat = () =>
  queryOne<{ id: string; round: number; sighting: string | null }>(
    'SELECT c.id, c.round, c.sighting FROM Combat c JOIN Scene s ON s.id = c.sceneId WHERE s.name = ?',
    SCENE,
  );
const queue = () =>
  query<{ name: string; initiative: number | null }>(
    `SELECT COALESCE(t.name, m.label) AS name, m.initiative FROM Combatant m
       JOIN Combat c ON c.id = m.combatId JOIN Scene s ON s.id = c.sceneId
       LEFT JOIN Token t ON t.id = m.tokenId
     WHERE s.name = ? ORDER BY m.initiative DESC`,
    SCENE,
  );
/** Próby Maskowania Iskry na piętrze `floorId` (runtime Architektury). */
const cloakOf = (floorId: string) => {
  const row = queryOne<{ runtime: string | null }>(
    'SELECT runtime FROM NetArchitecture WHERE name = ?',
    ARCHITECTURE,
  );
  const runtime = JSON.parse(row?.runtime || '{}') as {
    cloaks?: { floorId: string; attempts: number; outcome?: string }[];
  };
  return runtime.cloaks?.find((entry) => entry.floorId === floorId);
};
const sightingBar = (actor: Actor) =>
  actor.page.locator('.notice--pinned', { hasText: 'Wykrycie w Sieci' });

test.describe.serial('@szybkie T70g wykrycie w Sieci zaczyna walkę', () => {
  let gm: Socket;
  let mg: Actor;
  let ola: Actor;

  test.beforeAll(async ({ cast }) => {
    await startFromPoT6(DEAD_GATEWAY);
    test.setTimeout(4 * 60_000);
    const { socket } = await rawSocket(await cookieHeader(await apiGm()));
    gm = socket!;

    const strazId = dataOf<{ id: string }>(
      await emitAck(gm, 'compendium:upsert', {
        entry: {
          category: 'program',
          name: STRAZNIK,
          programClass: 'attacker',
          target: 'antiPersonnel',
          blackIce: true,
          atk: 2,
          def: 2,
          rez: 15,
          per: 2,
          speed: 2,
          effects: { hooks: ['stealNetAction'] },
        },
      }),
      STRAZNIK,
    ).id;

    await buildNetScene(gm, {
      scene: SCENE,
      runner: { character: 'Iskra', player: 'Ola', at: { x: 200, y: 300 } },
      socketAt: SOCKET_AT,
      architecture: {
        name: ARCHITECTURE,
        branches: [
          {
            id: 'trzon-70g',
            parentFloor: null,
            floors: [
              { id: 'wejscie-70g', kind: 'empty', label: 'Wejście' },
              { id: 'korytarz-70g', kind: 'empty', label: 'Korytarz' },
              { id: 'straz-70g', kind: 'ice', label: 'Gniazdo Strażnika', programIds: [strazId] },
            ],
          },
        ],
      },
    });

    cast.viewport = { width: 1920, height: 1080 };
    mg = await cast.mg('firefox');
    ola = await cast.gracz('Ola', 'chromium', await createInvitation(mg, campaignId(), 'Ola'));
    for (const actor of [mg, ola]) await expect.poll(() => viewedScene(actor)).toBe(SCENE);
    ola.page.setDefaultTimeout(15_000);

    // Podłączenie poza walką — nic nie kosztuje i niczego nie zakłada.
    await jackIn(ola, SOCKET_AT);
    await expect(floorCard(ola)).toContainText('Wejście');
    await takeExit(ola, 'Iskra');
    await expect(floorCard(ola)).toContainText('Korytarz');
    expect(combat()).toBeUndefined();
  });

  test.afterAll(async ({ cast }) => {
    gm?.close();
    await cast.closeAll();
  });

  test('1. nieudane Maskowanie zakłada starcie dopiero przy ostatniej próbie Tury', async () => {
    let attempts = 0;
    for (; attempts < 6; attempts += 1) {
      if (cloakOf('korytarz-70g')?.outcome === 'failed') break;
      // Poprzednie próby nie zakładają niczego.
      expect(combat()).toBeUndefined();
      scriptDice([1]);
      await abilityButton(ola, 'Maskowanie').click();
      await throwNetRoll(ola.page);
      await expect
        .poll(() => cloakOf('korytarz-70g')?.attempts ?? 0, { timeout: 20_000 })
        .toBe(attempts + 1);
      expect(pendingDice()).toBe('');
    }
    expect(cloakOf('korytarz-70g')?.outcome).toBe('failed');
    expect(attempts).toBeGreaterThan(1);

    await expect.poll(() => combat()?.round).toBe(0);
    expect(JSON.parse(combat()!.sighting!)).toMatchObject({ net: { foes: [], traces: true } });
    // Tylko drużyna: Iskra (i inni gracze sceny), bez LOD-u.
    expect(queue().map((row) => row.name)).toEqual(['Iskra']);

    const bar = sightingBar(mg);
    await expect(bar).toBeVisible({ timeout: 15_000 });
    await expect(bar).toContainText('Iskra — Maskowanie nieudane, ślady zostały w Sieci.');
    await expect(bar.getByRole('button', { name: /Rozpocznij walkę/ })).toBeVisible();
    await mg.page.screenshot({ path: test.info().outputPath('maskowanie-pasek-mg-firefox.png') });
    // Gracz nie dostaje paska MG.
    await expect(sightingBar(ola)).toHaveCount(0);
  });

  test('2. drużyna stoi — w Sieci też — a „Odwołaj” wraca do Eksploracji', async () => {
    const before = JSON.stringify(positionOf('Iskra'));
    await exitsDown(ola).first().click();
    // Odmowa z okna Sieci idzie do kolumny komunikatów nad mapą.
    await expect(
      ola.page.locator('.notice', { hasText: 'Zaraz walka — czekaj, aż MG ją rozpocznie.' }),
    ).toBeVisible();
    expect(JSON.stringify(positionOf('Iskra'))).toBe(before);

    await sightingBar(mg).getByRole('button', { name: 'Odwołaj' }).click();
    await expect.poll(() => combat()).toBeUndefined();
  });

  test('3. LOD wykrywa Iskrę poza walką: starcie, pasek z nazwą, LOD na czele po starcie', async () => {
    // Iskra: Interfejs 4 + 9 = 13 przeciw PRĘ 2 + 1 — ucieka przed darmowym atakiem.
    scriptDice([9, 1]);
    await takeExit(ola, 'Iskra');
    await expect.poll(() => combat()?.round, { timeout: 20_000 }).toBe(0);
    expect(pendingDice()).toBe('');
    expect(JSON.parse(combat()!.sighting!)).toMatchObject({
      net: { foes: [STRAZNIK], traces: false },
    });
    expect(queue().map((row) => row.name)).toContain(STRAZNIK);

    const bar = sightingBar(mg);
    await expect(bar).toContainText(`Iskra — wykrycie w Sieci: ${STRAZNIK}.`, { timeout: 15_000 });
    await mg.page.screenshot({ path: test.info().outputPath('wykrycie-pasek-mg-firefox.png') });

    // Iskra rzuca inicjatywę od MG ręką (12), potem „Rozpocznij walkę”.
    const iskraRow = queryOne<{ id: string }>(
      `SELECT m.id FROM Combatant m JOIN Token t ON t.id = m.tokenId
         JOIN Scene s ON s.id = t.sceneId WHERE s.name = ? AND t.name = 'Iskra'`,
      SCENE,
    )!;
    dataOf(
      await emitAck(gm, 'combat:set-initiative', { combatantId: iskraRow.id, initiative: 12 }),
      'combat:set-initiative',
    );
    // LOD atakuje w swojej Turze: ATK 2 + 1 przeciw Interfejsowi 4 + 9 — pudło.
    scriptDice([1, 9]);
    await bar.getByRole('button', { name: /Rozpocznij walkę/ }).click();
    // Bez NPC-a z figurą pierwszy klik może tylko ostrzec (etap 50a) — drugi zaczyna.
    await mg.page
      .getByRole('button', { name: /zacznij mimo to/ })
      .click({ timeout: 3_000 })
      .catch(() => undefined);
    await expect.poll(() => combat()?.round, { timeout: 20_000 }).toBe(1);
    // „LOD wchodzi do walki na pierwszym miejscu, nawet jeśli byłeś szybszy”.
    expect(queue()[0]).toEqual({ name: STRAZNIK, initiative: 13 });
    await expect(sightingBar(mg)).toHaveCount(0);
  });
});
