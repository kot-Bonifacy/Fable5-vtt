import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { runOf } from '../../fixtures/brama.ts';
import { apiGm, cookieHeader } from '../../fixtures/nocna-zmiana.ts';
import { chatLine, query, queryOne, seat, startFromPoT6 } from '../../fixtures/regresja.ts';
import { centreCamera, clickOnMap } from '../../fixtures/scene.ts';
import { DEAD_GATEWAY, rawSocket } from '../../fixtures/security.ts';
import {
  abilityButton,
  buildNetScene,
  floorCard,
  jackIn,
  runWindow,
  takeExit,
} from '../../fixtures/siec.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { shakeCup } from '../../fixtures/table.ts';
import { pendingDice, scriptDice } from '../../instance/instance.ts';

/**
 * Etap 70b „Przejęta wieżyczka na mapie”. Do 70b wieżyczka strzelała z listy
 * w oknie SIEĆ: cel z rozwijanej listy, bez linii strzału, z osłoną jako
 * płatnym pytaniem po fakcie i Umiejętnością netrunnera. Teraz Kontrola węzła
 * pożycza netrunnerowi **figurę**: zaznacza ją na mapie, belka pokazuje
 * urządzenie, strzał idzie celownikiem i kubkiem — Wartością bojową wieżyczki,
 * za jedną Akcję Sieciową na Turę.
 *
 * Wieżyczka jest figurą z ikoną urządzenia, więc do węzła trafia sama przy
 * podłączeniu (etap 62). Kamera i drugi gracz mają testy serwera
 * (`netdevices.test.ts`, `net-cameras.test.ts`) — tu liczy się droga przez UI.
 */

const SCENE = 'Magazyn 70b';
const SOCKET_AT = { x: 360, y: 460 };
const TURRET = 'Wieżyczka 70b';
const TARGET = 'Zbir 70b';
const TURRET_AT = { x: 700, y: 700 };
const TARGET_AT = { x: 1100, y: 700 };
/** Środek figury 1 × 1 przy siatce 100 px. */
const centre = (at: { x: number; y: number }) => ({ x: at.x + 50, y: at.y + 50 });

type Ack<T> = { ok: true; data: T } | { ok: false; error: string };
function dataOf<T>(ack: unknown, what: string): T {
  const typed = ack as Ack<T>;
  if (!typed.ok) throw new Error(`E2E: ${what}: ${JSON.stringify(ack)}`);
  return typed.data;
}

const tokenRow = (name: string) =>
  queryOne<{ id: string; statuses: string; characterId: string | null }>(
    'SELECT t.id, t.statuses, t.characterId FROM Token t JOIN Scene s ON s.id = t.sceneId WHERE s.name = ? AND t.name = ?',
    SCENE,
    name,
  )!;
const statusesOf = (name: string) => JSON.parse(tokenRow(name).statuses || '[]') as string[];
const combat = () =>
  queryOne<{ round: number; activeCombatantId: string | null }>(
    'SELECT c.round, c.activeCombatantId FROM Combat c JOIN Scene s ON s.id = c.sceneId WHERE s.name = ?',
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
  ((runOf('Iskra')?.state as unknown as { deviceTurns?: { actionLeft: boolean }[] })?.deviceTurns ??
    []) as { actionLeft: boolean }[];

test.describe.serial('@szybkie T70b przejęta wieżyczka na mapie', () => {
  let gm: Socket;
  let mg: Actor;
  let ola: Actor;
  let sceneId = '';
  const hud = (actor: Actor) => actor.page.locator('.hud-rail');
  const device = (actor: Actor) => actor.page.getByTestId('hud-device');

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
        name: 'Sieć magazynu 70b',
        branches: [
          {
            id: 'trzon-70b',
            parentFloor: null,
            floors: [
              { id: 'wejscie-70b', kind: 'empty', label: 'Wejście' },
              { id: 'wezel-70b', kind: 'controlNode', label: 'Obrona magazynu', dv: 6 },
            ],
          },
        ],
      },
    }));
    // Wieżyczka: figura z ikoną urządzenia (sama wejdzie do węzła, etap 62),
    // statysta z Wartością bojową 14 — nią, nie Interfejsem Iskry, pójdzie strzał.
    const turretId = dataOf<{ id: string }>(
      await emitAck(gm, 'token:create', {
        sceneId,
        name: TURRET,
        ...TURRET_AT,
        glyph: 'turret',
        hp: { current: 25, max: 25 },
      }),
      'token:create (wieżyczka)',
    ).id;
    dataOf(
      await emitAck(gm, 'token:stat', {
        tokenId: turretId,
        quick: {
          ref: 3,
          dex: 3,
          body: 5,
          will: 5,
          skillLevel: 1,
          evasion: 0,
          combatValue: 14,
          armorSp: 0,
          weaponId: 'weapon.submachine-gun',
          weaponName: 'Pistolet maszynowy',
          weaponDamage: '2k6',
          ammoCurrent: 30,
          ammoMax: 30,
        },
      }),
      'token:stat (wieżyczka)',
    );
    dataOf(
      await emitAck(gm, 'token:create', {
        sceneId,
        name: TARGET,
        ...TARGET_AT,
        hp: { current: 30, max: 30 },
      }),
      'token:create (cel)',
    );

    ({
      mg,
      players: [ola],
    } = (await seat(cast, ['Ola'], SCENE)) as { mg: Actor; players: [Actor] });
    ola.page.setDefaultTimeout(15_000);
  });

  test.afterAll(async ({ cast }) => {
    gm?.close();
    await cast.closeAll();
  });

  test('1. piętro węzła przed Kontrolą: nazwa i rodzaj, żadnej przejętej figury', async () => {
    await jackIn(ola, SOCKET_AT);
    await takeExit(ola, 'Iskra');
    await expect(floorCard(ola)).toContainText('Obrona magazynu');
    await expect(floorCard(ola).locator('.net-sighted-device')).toContainText(TURRET);
    expect(statusesOf(TURRET)).not.toContain('net-seized');
    await ola.page.getByRole('button', { name: 'Postacie', exact: true }).click();
    await expect(ola.page.locator('[data-character-group="operated"]')).toHaveCount(0);
  });

  test('2. Kontrola: figura przejęta — naklejka na mapie, wiersz w „Postaciach”', async () => {
    scriptDice([9]);
    await abilityButton(ola, 'Kontrola').click();
    // Od 70c urządzenia przejętego węzła stoją w pasku „Oczy i urządzenia”.
    await expect(runWindow(ola).locator('.net-eye[data-eye]')).toHaveCount(1, { timeout: 20_000 });
    expect(pendingDice()).toBe('');
    await expect.poll(() => statusesOf(TURRET)).toContain('net-seized');
    // Okno nie strzela: pasek nie ma ani celu, ani „Strzelaj”.
    await expect(runWindow(ola).getByRole('button', { name: 'Strzelaj' })).toHaveCount(0);
    const seized = ola.page.locator('[data-character-group="operated"]');
    await expect(seized).toContainText('Przejęte (1)');
    await expect(seized).toContainText('przez: Obrona magazynu');
  });

  test('3. walka: zaznaczenie wieżyczki na mapie daje belkę urządzenia z kosztem „Akcja Sieciowa”', async () => {
    const started = dataOf<{ combatants: { id: string; tokenId: string | null }[] }>(
      await emitAck(gm, 'combat:start', {
        sceneId,
        tokenIds: [tokenRow('Iskra').id, tokenRow(TURRET).id],
      }),
      'combat:start',
    );
    const idOf = (name: string) =>
      started.combatants.find((row) => row.tokenId === tokenRow(name).id)!.id;
    // Iskra rzuca inicjatywę własnym kubkiem — załadował się sam przy starcie
    // walki, a załadowany kubek nie przyjąłby potem strzału wieżyczki.
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
    dataOf(
      await emitAck(gm, 'combat:set-initiative', { combatantId: idOf(TURRET), initiative: 5 }),
      'inicjatywa wieżyczki',
    );
    await mg.page.getByRole('button', { name: /Rozpocznij walkę/ }).click();
    await expect.poll(() => combat()?.round).toBe(1);
    await expect.poll(activeTokenName).toBe('Iskra');

    // Początek tury sam wraca zaznaczeniem do postaci gracza, a widok runu z rundą
    // dochodzi po animacji kości inicjatywy — wieżyczkę bierze się dopiero potem.
    await expect
      .poll(
        async () =>
          (await ola.store<{ runs: { operated: { state: string }[] }[] }>('netRun')).runs[0]
            ?.operated[0]?.state,
        { timeout: 30_000 },
      )
      .toBe('ready');
    await ola.page.waitForTimeout(500);
    await centreCamera(ola.page, { x: 760, y: 620 });
    await ola.page.waitForTimeout(500);
    await clickOnMap(ola.page, centre(TURRET_AT));
    await expect(device(ola)).toBeVisible();
    await expect(device(ola)).toContainText('przez: Obrona magazynu');
    // Widok runu z rundą dochodzi po animacji kości inicjatywy (pułapka `siec` z 20.10).
    await expect(device(ola).locator('[data-device-state]')).toHaveAttribute(
      'data-device-state',
      'ready',
      { timeout: 30_000 },
    );
    await expect(hud(ola).locator('.hud-head-title')).toHaveText('Urządzenie');
    // Kafel broni wieżyczki ze znakiem Akcji Sieciowej; żadnych akcji postaci.
    const weapon = hud(ola).locator('.hud-slot--weapon');
    await expect(weapon).toHaveCount(1);
    await expect(weapon).toContainText('Pistolet maszynowy');
    await expect(hud(ola).locator('[data-device-verb="off"] .hud-cost--net')).toHaveCount(1);
    await expect(hud(ola).getByText('Bieg', { exact: true })).toHaveCount(0);
    // Kolejka mówi, że tura wieżyczki przejdzie sama.
    await expect(ola.page.locator('.combat-chip-badge--seized')).toHaveCount(1);
  });

  test('4. strzał z mapy: kubek, Wartość bojowa wieżyczki, jedna Akcja Sieciowa', async () => {
    // Seria z szuflady trybów ognia — z listy w oknie Sieci nie dało się jej wybrać.
    await hud(ola).getByRole('button', { name: 'Tryb ognia' }).click();
    await hud(ola)
      .locator('.hud-mode')
      .filter({ hasText: /ciągły/i })
      .click();
    await expect(hud(ola).locator('.hud-slot--weapon .hud-slot-mode')).toContainText(
      /ciągły|seria/i,
    );
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
      attack?: { system?: { operatorUserId?: string } };
    };
    expect(roll.actor).toBe(TURRET);
    // 14 to Wartość bojowa urządzenia — Cecha w rzucie stoi na zerze.
    expect(roll.breakdown.find((row) => row.kind === 'skill')?.value).toBe(14);
    expect(roll.breakdown.find((row) => row.kind === 'stat')?.value ?? 0).toBe(0);
    expect(roll.attack?.system?.operatorUserId).toBeTruthy();
    await expect.poll(() => deviceTurns().length).toBe(1);
    expect(deviceTurns()[0]!.actionLeft).toBe(false);
    await expect(device(ola).locator('[data-device-state]')).toHaveAttribute(
      'data-device-state',
      'spent',
      { timeout: 20_000 },
    );
  });

  test('5. drugi strzał w tej Turze odmawia — węzeł był już aktywowany', async () => {
    const socket = await ola.socket();
    const ack = await emitAck(socket, 'attack:roll', {
      attackerTokenId: tokenRow(TURRET).id,
      targetTokenId: tokenRow(TARGET).id,
      request: { weaponRowId: 'statist-weapon' },
    });
    expect(ack).toEqual({ ok: false, error: 'NET_DEVICE_SPENT' });
    // Kafel broni jest wygaszony z tym samym powodem.
    await expect(hud(ola).locator('.hud-slot--weapon .hud-slot--refused')).toHaveCount(1);
    expect(deviceTurns()).toHaveLength(1);
  });

  test('6. kolejka: tura przejętej wieżyczki przechodzi sama', async () => {
    dataOf(await emitAck(await ola.socket(), 'combat:next', undefined), 'Kończę turę (Ola)');
    await expect.poll(() => combat()?.round).toBe(2);
    await expect.poll(activeTokenName).toBe('Iskra');
    await expect(chatLine(mg.page, /przejęta w Sieci/).first()).toBeVisible();
    // Nowa runda oddaje aktywację, a początek tury wraca belką do postaci.
    await expect
      .poll(
        async () =>
          (await ola.store<{ runs: { operated: { state: string }[] }[] }>('netRun')).runs[0]
            ?.operated[0]?.state,
        { timeout: 30_000 },
      )
      .toBe('ready');
    await expect(hud(ola).locator('.hud-head-title')).toHaveText('Postać');
  });

  test('7. odłączenie: belka wraca do Iskry, naklejka znika, „wraca do obrony”', async () => {
    // Wieżyczka znów w ręku — odłączenie ma ją z niej wyjąć.
    await ola.page.waitForTimeout(500);
    await clickOnMap(ola.page, centre(TURRET_AT));
    await expect(device(ola)).toBeVisible();
    await runWindow(ola).getByRole('button', { name: 'Odłącz się' }).click();
    await expect.poll(() => runOf('Iskra')).toBeNull();
    await expect(device(ola)).toHaveCount(0);
    await expect(hud(ola).locator('.hud-head-title')).toHaveText('Postać');
    await expect.poll(() => statusesOf(TURRET)).not.toContain('net-seized');
    // Wiersz czatu z bazy — Ola ma otwartą zakładkę „Postacie”, nie czat.
    await expect
      .poll(
        () =>
          query<{ id: number }>(
            "SELECT id FROM ChatMessage WHERE kind = 'action' AND payload LIKE '%wraca do obrony%'",
          ).length,
      )
      .toBe(1);
    await expect(ola.page.locator('[data-character-group="operated"]')).toHaveCount(0);
    const refused = await emitAck(await ola.socket(), 'attack:roll', {
      attackerTokenId: tokenRow(TURRET).id,
      targetTokenId: tokenRow(TARGET).id,
      request: { weaponRowId: 'statist-weapon' },
    });
    expect(refused).toMatchObject({ ok: false });
  });

  test('8. konsola przeglądarek czysta', async () => {
    for (const actor of [mg, ola]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
  });
});
