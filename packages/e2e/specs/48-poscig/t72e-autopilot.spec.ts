import { readFileSync } from 'node:fs';
import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { sceneListRow } from '../../fixtures/brama.ts';
import { material } from '../../fixtures/materials.ts';
import { apiGm, characterId, invite, userId } from '../../fixtures/nocna-zmiana.ts';
import { startFromPoT6 } from '../../fixtures/regresja.ts';
import { DEAD_GATEWAY } from '../../fixtures/security.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { closeNotices } from '../../fixtures/table.ts';
import { scriptDice } from '../../instance/instance.ts';

/**
 * Etap 72e — auta NPC-ów jadą same z zamiarem. Scena jazdy w lewo, trzy pasy,
 * szeroki kadr (48 kratek): Iskra Oli w kadrze, „Pogoń” gangu 6 kratek za nią
 * na tym samym pasie, „Ucieczka” daleko z przodu na dolnym.
 *
 * - MG (**Chromium**) w turze kierowcy Pogoni wybiera w menu auta „Goń: …”,
 *   a kokpit od razu pokazuje plan autopilota (Gaz wciśnięty, „Autopilot”
 *   zamiast „Po ruchu”); po „Następnej turze” auto jedzie nim samo i w trzech
 *   rundach dogania Iskrę;
 * - „Uciekaj” dodaje gazu co turę aż do maksimum;
 * - przełącznik „Autopilot” na pasku narzędzi gasi plan;
 * - Ola (**Firefox**) zamiaru aut gangu nie dostaje.
 *
 * Wyścig: Olę MG pomija, a dwaj kierowcy-NPC-e rzucają te same kości
 * (`scriptDice`), więc zrywu nie ma i liczby są dokładne.
 */

type Ack<T> = { ok: true; data: T } | { ok: false; error: string };
const dataOf = <T>(ack: unknown): T => {
  const typed = ack as Ack<T>;
  if (!typed.ok) throw new Error(JSON.stringify(ack));
  return typed.data;
};

interface Placed {
  id: string;
  name: string;
  x: number;
  y: number;
  speed: number;
  lane: number;
  status: string;
  intent?: { intent: string; plan: { pedal: string | null; laneDelta: number } | null };
}
interface CombatView {
  round: number;
  activeCombatantId: string | null;
  combatants: { id: string; tokenId: string | null }[];
}

const MAP = 'mapy/Neonowy wiadukt nad cyberpunkowym miastem_24x18.png';

test.describe.serial('@szybkie T72e autopilot: auta NPC-ów jadą same z zamiarem', () => {
  let mg: Actor;
  let ola: Actor;
  let gm: Socket;
  let sceneId = '';
  let grid = 0;
  let iskraCar: Placed;
  let chaserCar: Placed;
  let runnerCar: Placed;
  let chaserDriver = '';

  const vehicle = async (actor: Actor, id: string) =>
    (await actor.store<{ vehicles: Placed[] }>('chase')).vehicles.find((row) => row.id === id);
  /**
   * „Następna tura” MG. Na początku rundy dwaj NPC-e rzucają Wyścig — te same
   * kości, zryw 0; runda stojąca na kubku Oli — drugie kliknięcie ją pomija.
   */
  const next = async () => {
    scriptDice([5, 5]);
    const view = dataOf<CombatView>(await emitAck(gm, 'combat:next', undefined));
    if (view.round >= 1 && view.activeCombatantId === null) {
      return dataOf<CombatView>(await emitAck(gm, 'combat:next', undefined));
    }
    return view;
  };
  const activeToken = (view: CombatView) =>
    view.combatants.find((row) => row.id === view.activeCombatantId)?.tokenId ?? null;
  /** Odstęp zderzaków Pogoni do Iskry w kratkach (jazda w lewo: Iskra z przodu, mniejsze `x`). */
  const chaserGap = async () => {
    const chaser = (await vehicle(mg, chaserCar.id))!;
    const iskra = (await vehicle(mg, iskraCar.id))!;
    return (chaser.x - iskra.x) / grid - 5;
  };

  test.beforeAll(async ({ cast }) => {
    const mapFile = material(MAP);
    await startFromPoT6(DEAD_GATEWAY);
    test.setTimeout(4 * 60_000);
    cast.viewport = { width: 1600, height: 1000 };
    mg = await cast.mg('chromium');
    ola = await cast.gracz('Ola', 'firefox', await invite(await apiGm(), 'Ola'));
    gm = await mg.socket();

    sceneId = dataOf<{ id: string }>(
      await emitAck(gm, 'scene:create', { name: 'Autopilot', kind: 'chase' }),
    ).id;
    const api = await apiGm();
    const upload = await api.post('/api/uploads/maps', {
      multipart: {
        file: { name: 'wiadukt.png', mimeType: 'image/png', buffer: readFileSync(mapFile) },
      },
    });
    const map = (await upload.json()) as { url: string; width: number; height: number };
    await api.dispose();
    // Szeroki kadr: 48 kratek wzdłuż, żeby za autem kadru było gdzie gonić.
    grid = map.width / 48;
    dataOf(
      await emitAck(gm, 'scene:update', {
        sceneId,
        patch: {
          background: map,
          grid: { sizePx: grid },
          // Jazda w lewo; trzy pasy po 4 kratki (środki 6, 10, 14), 100 mil/h na starcie.
          chase: { road: { from: 4, to: 16 }, tempo: 20 },
        },
      }),
    );
    dataOf(await emitAck(gm, 'scene:activate', { sceneId }));
    dataOf(await emitAck(gm, 'scene:view', { sceneId }));

    const create = async (name: string, imageUrl: string, owner?: string) => {
      const created = dataOf<{ id: string }>(
        await emitAck(gm, 'vehicle:create', {
          catalogId: 'vehicle.samochod-sportowy',
          ...(owner ? { ownerCharacterId: owner } : {}),
        }),
      );
      dataOf(
        await emitAck(gm, 'vehicle:update', { vehicleId: created.id, patch: { name, imageUrl } }),
      );
      return created.id;
    };
    const place = async (vehicleId: string, x: number, y: number) =>
      dataOf<Placed>(await emitAck(gm, 'chase:place', { sceneId, vehicleId, x, y }));
    // Iskra stoi już tam, gdzie trzyma ją kadr (30% od tylnej, prawej krawędzi).
    iskraCar = await place(
      await create('Strzała Iskry', '/art/vehicles/car-red.webp', characterId('Iskra')),
      grid * 33.6,
      grid * 6,
    );
    chaserCar = await place(
      await create('Pogoń', '/art/vehicles/car-black-viper.webp'),
      grid * 45,
      grid * 6,
    );
    runnerCar = await place(
      await create('Ucieczka', '/art/vehicles/car-black-viper.webp'),
      grid * 12,
      grid * 14,
    );

    const figure = async (name: string, y: number, extra: Record<string, unknown> = {}) =>
      dataOf<{ id: string }>(
        await emitAck(gm, 'token:create', { sceneId, name, x: grid * 2, y: grid * y, ...extra }),
      ).id;
    const iskra = await figure('Iskra', 2, {
      characterId: characterId('Iskra'),
      ownerId: userId('Ola'),
    });
    chaserDriver = await figure('Ścigacz', 4, { hp: { current: 30, max: 30 } });
    const runnerDriver = await figure('Kierowca', 6, { hp: { current: 30, max: 30 } });
    for (const [tokenId, sceneVehicleId] of [
      [iskra, iskraCar.id],
      [chaserDriver, chaserCar.id],
      [runnerDriver, runnerCar.id],
    ] as const) {
      dataOf(await emitAck(gm, 'vehicle:seat', { tokenId, sceneVehicleId, seat: 0 }));
    }
    // Zamiar Ucieczki przez gniazdo — Pogoń dostaje swój z menu w teście.
    dataOf(await emitAck(gm, 'chase:intent', { sceneVehicleId: runnerCar.id, intent: 'flee' }));

    await closeNotices(mg.page);
    await mg.page.getByRole('button', { name: 'Sceny', exact: true }).click();
    await sceneListRow(mg.page, 'Autopilot').getByRole('button', { name: 'Pokaż' }).click();

    const combat = dataOf<CombatView>(
      await emitAck(gm, 'combat:start', {
        sceneId,
        tokenIds: [iskra, chaserDriver, runnerDriver],
      }),
    );
    const order: Record<string, number> = { [iskra]: 18, [chaserDriver]: 15, [runnerDriver]: 12 };
    for (const row of combat.combatants) {
      dataOf(
        await emitAck(gm, 'combat:set-initiative', {
          combatantId: row.id,
          initiative: order[row.tokenId ?? ''] ?? 10,
        }),
      );
    }
    // Runda 1, tura Iskry.
    await next();
    await closeNotices(ola.page);
    await closeNotices(mg.page);
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('MG wybiera „Goń” w menu auta, kokpit pokazuje plan autopilota (Chromium)', async () => {
    const turn = await next();
    expect(activeToken(turn)).toBe(chaserDriver);
    // NPC w turze jest u MG zaznaczony z urzędu — belka ma grupę „Pojazd” Pogoni.
    const group = mg.page.getByTestId('hud-vehicle');
    await expect(group).toBeVisible();
    await expect(group).toContainText('Pogoń');
    await expect(group.locator('.hud-vehicle-after .hud-armed-tag')).toHaveText('Po ruchu');

    await group.locator('.hud-slot--large').click();
    const menu = mg.page.getByRole('menu', { name: 'Auto: Pogoń' });
    await expect(menu).toBeVisible();
    const intent = menu.locator('.chase-menu-intent select');
    await expect(intent).toHaveValue('manual');
    await intent.selectOption({ label: 'Goń: Strzała Iskry' });
    await expect.poll(async () => (await vehicle(mg, chaserCar.id))?.intent?.intent).toBe('pursue');
    await menu.screenshot({ path: test.info().outputPath('menu-zamiar.png') });
    await mg.page.keyboard.press('Escape');
    await expect(menu).toBeHidden();

    // 6,4 kratki za Iskrą, obie 100 mil/h — autopilot wciska gaz.
    await expect(group.locator('.hud-vehicle-after .hud-armed-tag')).toHaveText('Autopilot');
    await expect(group.getByRole('button', { name: /^Gaz/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(group).toContainText('150');
    await mg.page.screenshot({ path: test.info().outputPath('kokpit-autopilot.png') });

    // Ola nie dostaje zamiaru aut gangu.
    await expect.poll(async () => (await vehicle(ola, chaserCar.id))?.name).toBe('Pogoń');
    expect((await vehicle(ola, chaserCar.id))?.intent).toBeUndefined();
  });

  test('bez „Jedź” auto jedzie planem i w trzech rundach dogania Iskrę', async () => {
    const before = (await vehicle(mg, chaserCar.id))!;
    await next(); // koniec tury Pogoni — jedzie z gazem; tura Ucieczki
    await expect.poll(async () => (await vehicle(mg, chaserCar.id))?.speed).toBe(30);
    // (30 − 20) / 4 = 2,5 kratki w lewo, ten sam pas.
    expect((await vehicle(mg, chaserCar.id))?.x).toBeCloseTo(before.x - 2.5 * grid, 3);
    expect((await vehicle(mg, chaserCar.id))?.lane).toBe(0);

    for (let round = 0; round < 2; round += 1) {
      await next(); // tura Iskry nowej rundy
      await next(); // tura Pogoni
      await next(); // tura Ucieczki — Pogoń już pojechała
    }
    // Hamulec zbija 100 mil/h naraz, więc Pogoń zatrzymuje się na ~4 kratkach za Iskrą
    // (zamiast 6,4 na starcie) i nie wjeżdża w nią.
    const gap = await chaserGap();
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThanOrEqual(4);
    expect((await vehicle(mg, chaserCar.id))?.lane).toBe(0);
  });

  test('„Uciekaj” dodaje gazu co turę — Ucieczka jedzie najszybciej, jak umie', async () => {
    await expect
      .poll(async () => (await vehicle(mg, runnerCar.id))?.speed, { timeout: 15_000 })
      .toBe(40);
  });

  test('przełącznik „Autopilot” na pasku MG gasi plan w kokpicie (Chromium)', async () => {
    const toggle = mg.page.getByRole('button', { name: 'Autopilot', exact: true });
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    // Tura Iskry, potem Pogoni: planu nie ma, krzyżak stoi pusty.
    await next();
    const turn = await next();
    expect(activeToken(turn)).toBe(chaserDriver);
    const group = mg.page.getByTestId('hud-vehicle');
    await expect(group.locator('.hud-vehicle-after .hud-armed-tag')).toHaveText('Po ruchu');
    expect((await vehicle(mg, chaserCar.id))?.intent?.plan).toBeNull();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(async () => (await vehicle(mg, chaserCar.id))?.intent?.plan ?? null)
      .not.toBeNull();
    await expect(group.locator('.hud-vehicle-after .hud-armed-tag')).toHaveText('Autopilot');
  });
});
