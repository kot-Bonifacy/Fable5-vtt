import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import {
  architecture,
  drawGuardArea,
  drawZone,
  openZoneCard,
  runOf,
} from '../../fixtures/brama.ts';
import { characterId, cookieHeader, apiGm, userId } from '../../fixtures/nocna-zmiana.ts';
import { query, queryOne, seat, startFromPoT6 } from '../../fixtures/regresja.ts';
import { clickOnMap, fitCamera, openObjectCard } from '../../fixtures/scene.ts';
import { DEAD_GATEWAY, rawSocket } from '../../fixtures/security.ts';
import {
  abilityButton,
  floorCard,
  jackIn,
  runWindow,
  takeExit,
  throwNetRoll,
} from '../../fixtures/siec.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { pendingDice, scriptDice } from '../../instance/instance.ts';

/**
 * Etap 70d „Edycja mapy, strefy, Sieć ze sceny”. Pusta hala bez Architektury:
 * MG stawia w UI wieżyczkę z „Urządzeń”, rysuje jej „Obszar straży” z menu
 * figury, kładzie narzędziem „Strefy bronione” podłogę elektryczną (lista ma
 * już same systemy środowiskowe) i zaznacza drzwi „Sterowane z Sieci”.
 * Podłączenie Iskry składa Sieć ze sceny z węzłami wg rodzaju — „Monitoring”
 * (kamera), „Obrona” (wieżyczka), „Instalacje” (podłoga, drzwi). Klik w podłogę
 * pyta okienkiem zamiast marszu (zaległość 🔴 66e pkt 3), „Wyłącz” z okienka
 * rozbraja ją, Marek przechodzi przez nią bez obrażeń, a drzwi otwiera pasek
 * „Oczy i urządzenia”. Na koniec stara strefa drona bez figury dostaje figurę
 * jednym kliknięciem.
 *
 * Gniazdo, ściana z drzwiami i kamera stawia surowe gniazdo MG — ich UI
 * sprawdzają T5a i T3, tu liczy się to, co 70d dokłada.
 */

const SCENE = 'Hala 70d';
const SOCKET_AT = { x: 260, y: 160 };
const RUNNER_AT = { x: 100, y: 200 };
const KOWAL_AT = { x: 400, y: 600 };
const TURRET_AT = { x: 1300, y: 300 };
const GUARD = { from: { x: 1100, y: 100 }, to: { x: 1500, y: 500 } };
/** Podłoga w poprzek drogi Kowala, z dala od Iskry. */
const FLOOR = { from: { x: 700, y: 500 }, to: { x: 900, y: 800 } };
const FLOOR_MID = { x: 800, y: 650 };
const KOWAL_TO = { x: 1100, y: 600 };
const DOOR = [
  { x: 1600, y: 900 },
  { x: 1600, y: 1000 },
];
const DOOR_MID = { x: 1600, y: 950 };
const OLD_ZONE = { x: 300, y: 1200, width: 300, height: 300 };

type Ack<T> = { ok: true; data: T } | { ok: false; error: string };
function dataOf<T>(ack: unknown, what: string): T {
  const typed = ack as Ack<T>;
  if (!typed.ok) throw new Error(`E2E: ${what}: ${JSON.stringify(ack)}`);
  return typed.data;
}

type ZoneDbRow = {
  id: number;
  entryId: string;
  tokenId: string | null;
  hidden: number;
  architectureId: string | null;
  floorId: string | null;
  deviceId: string | null;
  hpMax: number;
};
const zonesOf = (sceneId: string) =>
  query<ZoneDbRow>('SELECT * FROM DefenseZone WHERE sceneId = ? ORDER BY id', sceneId);
const tokensOf = (sceneId: string) =>
  query<{
    id: string;
    name: string;
    glyph: string | null;
    hpCurrent: number | null;
    hpMax: number | null;
  }>(
    'SELECT id, name, glyph, hpCurrent, hpMax FROM Token WHERE sceneId = ? ORDER BY createdAt',
    sceneId,
  );
const kowalHp = () =>
  (
    JSON.parse(
      queryOne<{ data: string }>('SELECT data FROM Character WHERE id = ?', characterId('Kowal'))!
        .data,
    ) as { hpCurrent: number }
  ).hpCurrent;
/** Stan urządzenia w runtime Architektury (`on: false` po „Wyłącz”). */
const deviceOn = (architectureName: string, deviceId: string): boolean => {
  const row = queryOne<{ runtime: string }>(
    'SELECT runtime FROM NetArchitecture WHERE name = ?',
    architectureName,
  );
  const runtime = JSON.parse(row?.runtime || '{}') as {
    devices?: { deviceId: string; on?: boolean }[];
  };
  return runtime.devices?.find((state) => state.deviceId === deviceId)?.on !== false;
};

test.describe.serial('@szybkie T70d edycja mapy: obszar straży, strefy, Sieć ze sceny', () => {
  let gm: Socket;
  let mg: Actor;
  let ola: Actor;
  let marek: Actor;
  let sceneId = '';
  let doorId = 0;
  const ask = (actor: Actor) => actor.page.getByRole('dialog', { name: 'Strefa na drodze' });
  const architectureName = `Sieć: ${SCENE}`;

  test.beforeAll(async ({ cast }) => {
    await startFromPoT6(DEAD_GATEWAY);
    test.setTimeout(4 * 60_000);
    const { socket } = await rawSocket(await cookieHeader(await apiGm()));
    gm = socket!;

    sceneId = dataOf<{ id: string }>(
      await emitAck(gm, 'scene:create', { name: SCENE }),
      'scene:create',
    ).id;
    dataOf(
      await emitAck(gm, 'scene:update', {
        sceneId,
        patch: { width: 2000, height: 1600, playerMove: 'explore' },
      }),
      'scene:update',
    );
    dataOf(await emitAck(gm, 'scene:activate', { sceneId }), 'scene:activate');
    const figure = async (name: string, at: { x: number; y: number }, extra = {}) =>
      dataOf<{ id: string }>(
        await emitAck(gm, 'token:create', { sceneId, name, ...at, ...extra }),
        `token:create (${name})`,
      ).id;
    await figure('Iskra', RUNNER_AT, {
      ownerId: userId('Ola'),
      characterId: characterId('Iskra'),
    });
    await figure('Kowal', KOWAL_AT, {
      ownerId: userId('Marek'),
      characterId: characterId('Kowal'),
    });
    await figure('Kamera 70d', { x: 1700, y: 200 }, { glyph: 'camera' });
    const [door] = dataOf<{ id: number }[]>(
      await emitAck(gm, 'wall:create', { sceneId, kind: 'door', points: DOOR }),
      'wall:create (drzwi)',
    );
    doorId = door!.id;
    // Gniazdo bez Architektury — Sieć złoży się ze sceny przy podłączeniu.
    dataOf(
      await emitAck(gm, 'netpoint:place', {
        sceneId,
        ...SOCKET_AT,
        name: 'Gniazdo hali',
        architectureId: null,
        hidden: false,
      }),
      'netpoint:place',
    );

    ({
      mg,
      players: [ola, marek],
    } = (await seat(cast, ['Ola', 'Marek'], SCENE)) as { mg: Actor; players: [Actor, Actor] });
    ola.page.setDefaultTimeout(15_000);
    await fitCamera(mg.page, 2000, 1600);
  });

  test.afterAll(async ({ cast }) => {
    gm?.close();
    await cast.closeAll();
  });

  test('1. MG: wieżyczka z „Urządzeń”, jej obszar straży, podłoga i drzwi „Sterowane z Sieci”', async () => {
    const page = mg.page;
    // Wieżyczka z zakładki „Grafiki” → „Urządzenia”.
    await page.getByRole('button', { name: 'Grafiki', exact: true }).click();
    await page.locator('.token-panel .token-asset[aria-pressed]', { hasText: 'Wieżyczka' }).click();
    await clickOnMap(page, { x: TURRET_AT.x + 50, y: TURRET_AT.y + 50 });
    await page.keyboard.press('Escape');
    await expect
      .poll(() => tokensOf(sceneId).find((token) => token.glyph === 'turret')?.name)
      .toBe('Wieżyczka');
    const turret = tokensOf(sceneId).find((token) => token.glyph === 'turret')!;

    // Obszar straży z menu figury — wpis podpowiada się sam.
    const guard = await drawGuardArea(
      page,
      sceneId,
      { x: TURRET_AT.x + 50, y: TURRET_AT.y + 50 },
      GUARD.from,
      GUARD.to,
    );
    expect(guard).toMatchObject({
      entryId: 'defense.automatyczna-wiezyczka',
      tokenId: turret.id,
      hidden: 1,
      hpMax: 0,
    });
    // PW wpisu przeszły na figurę bez paska.
    expect(tokensOf(sceneId).find((token) => token.id === turret.id)).toMatchObject({
      hpCurrent: 25,
      hpMax: 25,
    });

    // Narzędzie stref: same systemy środowiskowe.
    await page.locator('.map-tools button[title^="Strefy bronione"]').click();
    const options = page.getByRole('group', { name: 'Ustawienia stref bronionych' });
    await options.getByRole('button', { name: 'System obronny', exact: true }).click();
    const list = options.getByRole('listbox', { name: 'System obronny' });
    await expect(list.getByRole('option', { name: 'Podłoga elektryczna' })).toBeVisible();
    await expect(list.getByRole('option', { name: 'Automatyczna wieżyczka' })).toHaveCount(0);
    await expect(list.getByRole('option', { name: 'Dron naziemny' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    const floor = await drawZone(page, sceneId, 'Podłoga elektryczna', false, FLOOR.from, FLOOR.to);
    expect(floor).toMatchObject({ entryId: 'defense.podloga-elektryczna', hidden: 0 });

    // Drzwi „Sterowane z Sieci” na karcie otworu.
    const card = await openObjectCard(page, 'Ściany (W)', DOOR_MID);
    // Pole czyta stan z serwera — klik, potem odpowiedź z `wall:update`.
    const netControlled = card.getByRole('checkbox', { name: 'Sterowane z Sieci' });
    await netControlled.click();
    await expect(netControlled).toBeChecked();
    await expect
      .poll(
        () =>
          queryOne<{ netControlled: number }>('SELECT netControlled FROM Wall WHERE id = ?', doorId)
            ?.netControlled,
      )
      .toBe(1);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    // Gracz nie dostaje ani obszaru straży, ani planu drzwi.
    await expect
      .poll(async () =>
        (await ola.store<{ zones: { id: number }[] }>('zone')).zones.map((zone) => zone.id),
      )
      .toEqual([floor.id]);
  });

  test('2. Iskra podłącza się: Sieć ze sceny ma „Monitoring”, „Obronę” i „Instalacje”', async () => {
    await jackIn(ola, SOCKET_AT);
    const built = architecture(architectureName);
    const floors = built.shaft.branches[0]!.floors;
    expect(floors.map((floor) => floor.label)).toEqual([
      'Wejście',
      'Monitoring',
      'Obrona',
      'Instalacje',
    ]);
    const floorZone = zonesOf(sceneId).find(
      (zone) => zone.entryId === 'defense.podloga-elektryczna',
    )!;
    expect(floors[3]!.devices?.map((device) => device.id)).toEqual([
      `zone-${floorZone.id}`,
      `wall-${doorId}`,
    ]);
    // Strefa podpięta do urządzenia „Instalacji” (#33) bez ręki MG.
    expect(floorZone).toMatchObject({
      architectureId: built.id,
      floorId: floors[3]!.id,
      deviceId: `zone-${floorZone.id}`,
    });
    // Trzy węzły po kolei — etykieta węzła jest jawna po wejściu.
    for (const label of ['Monitoring', 'Obrona', 'Instalacje']) {
      await takeExit(ola, 'Iskra');
      await expect(floorCard(ola)).toContainText(label);
    }
  });

  test('3. klik w podłogę: okienko zamiast marszu; po Kontroli „Wyłącz”, Marek przechodzi cały', async () => {
    const iskraBefore = queryOne<{ x: number; y: number }>(
      "SELECT x, y FROM Token WHERE sceneId = ? AND name = 'Iskra'",
      sceneId,
    )!;
    // Przed Kontrolą: okienko bez przełącznika Sieci.
    await clickOnMap(ola.page, { x: RUNNER_AT.x + 50, y: RUNNER_AT.y + 50 });
    await clickOnMap(ola.page, FLOOR_MID);
    await expect(ask(ola)).toBeVisible();
    await expect(ask(ola)).toContainText('Podłoga elektryczna');
    await expect(ask(ola).getByRole('button', { name: /Wyłącz/ })).toHaveCount(0);
    await ola.page.keyboard.press('Escape');
    await expect(ask(ola)).toBeHidden();

    scriptDice([9]);
    await abilityButton(ola, 'Kontrola').click();
    await throwNetRoll(ola.page);
    await expect(
      runWindow(ola).getByTestId('net-eyes').locator(`[data-device-id="wall-${doorId}"]`),
    ).toBeVisible({ timeout: 20_000 });
    expect(pendingDice()).toBe('');

    await clickOnMap(ola.page, FLOOR_MID);
    await expect(ask(ola)).toBeVisible();
    await ask(ola)
      .getByRole('button', { name: /Wyłącz/ })
      .click();
    await expect(ask(ola)).toBeHidden();
    const floorZone = zonesOf(sceneId).find(
      (zone) => zone.entryId === 'defense.podloga-elektryczna',
    )!;
    await expect.poll(() => deviceOn(architectureName, `zone-${floorZone.id}`)).toBe(false);
    // Iskra nie ruszyła się ani razu.
    expect(
      queryOne<{ x: number; y: number }>(
        "SELECT x, y FROM Token WHERE sceneId = ? AND name = 'Iskra'",
        sceneId,
      ),
    ).toEqual(iskraBefore);

    // Marek idzie Kowalem przez podłogę: okienko, „Wejdź mimo to”, zero obrażeń.
    const hpBefore = kowalHp();
    await clickOnMap(marek.page, { x: KOWAL_AT.x + 50, y: KOWAL_AT.y + 50 });
    await clickOnMap(marek.page, KOWAL_TO);
    await expect(ask(marek)).toBeVisible();
    await expect(ask(marek).getByRole('button', { name: /Wyłącz/ })).toHaveCount(0);
    await ask(marek).getByRole('button', { name: 'Wejdź mimo to' }).click();
    await expect
      .poll(
        () =>
          queryOne<{ x: number }>(
            "SELECT x FROM Token WHERE sceneId = ? AND name = 'Kowal'",
            sceneId,
          )!.x,
        { timeout: 20_000 },
      )
      .toBeGreaterThan(FLOOR.to.x);
    expect(kowalHp()).toBe(hpBefore);

    // „Włącz” z tego samego okienka — podłoga wraca.
    await clickOnMap(ola.page, FLOOR_MID);
    await ask(ola).getByRole('button', { name: /Włącz/ }).click();
    await expect.poll(() => deviceOn(architectureName, `zone-${floorZone.id}`)).toBe(true);
  });

  test('4. drzwi z paska urządzeń: „Otwórz” otwiera otwór', async () => {
    const tile = runWindow(ola)
      .getByTestId('net-eyes')
      .locator(`[data-device-id="wall-${doorId}"]`);
    await tile.locator('[data-device-operation="open"]').click();
    await expect
      .poll(() => queryOne<{ open: number }>('SELECT open FROM Wall WHERE id = ?', doorId)?.open)
      .toBe(1);
    expect(runOf('Iskra')).toBeTruthy();
  });

  test('5. stara strefa drona bez figury: „Postaw figurę urządzenia” przenosi PW na figurę', async () => {
    const old = dataOf<{ id: number; hpMax: number }>(
      await emitAck(gm, 'zone:create', {
        sceneId,
        entryId: 'defense.dron-naziemny',
        ...OLD_ZONE,
        hidden: false,
      }),
      'zone:create (stara strefa drona)',
    );
    expect(old.hpMax).toBe(30);
    const card = await openZoneCard(mg.page, {
      x: OLD_ZONE.x + OLD_ZONE.width / 2,
      y: OLD_ZONE.y + OLD_ZONE.height / 2,
    });
    await card.getByRole('button', { name: 'Postaw figurę urządzenia' }).click();
    await expect
      .poll(() => zonesOf(sceneId).find((zone) => zone.id === old.id)?.tokenId)
      .not.toBeNull();
    const zone = zonesOf(sceneId).find((entry) => entry.id === old.id)!;
    expect(zone.hpMax).toBe(0);
    expect(tokensOf(sceneId).find((token) => token.id === zone.tokenId)).toMatchObject({
      glyph: 'ground-drone',
      hpCurrent: 30,
      hpMax: 30,
    });
    await mg.page.keyboard.press('Escape');
    await mg.page.keyboard.press('Escape');
  });
});
