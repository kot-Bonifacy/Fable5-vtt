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
 * Etap 72f3 — plan rund pościgu. Ta sama scena co w `t72f2-okno`: jazda
 * w lewo, trzy pasy, Strzała Iskry (Ola), Furgon gangu z kierowcą-NPC-em
 * i Radiowóz poza pościgiem.
 *
 * - MG (**Chromium**) przed walką wpisuje w oknie „Pościg” notatkę na rundę 1
 *   i posiłki na rundę 2 (Radiowóz, trzeci pas, od tyłu);
 * - na początku rundy 1 panel decyzji pyta o notatkę — runda przy tym idzie
 *   dalej; „Zrobione” zamyka kartę;
 * - w rundzie 2 „Wypuść” w panelu decyzji przywraca Radiowóz na trzecim pasie;
 * - Ola (**Firefox**) planu nie dostaje: ani w oknie, ani na czacie, a Radiowóz
 *   widzi dopiero po wypuszczeniu.
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
  lengthSq: number;
  status: string;
}
interface PlanEntry {
  id: string;
  round: number;
  kind: string;
  status: string;
}
interface CombatView {
  round: number;
  activeCombatantId: string | null;
  combatants: { id: string; tokenId: string | null }[];
}

const MAP = 'mapy/Neonowy wiadukt nad cyberpunkowym miastem_24x18.png';

test.describe.serial('@szybkie T72f3 plan rund: okno, panel decyzji, posiłki', () => {
  let mg: Actor;
  let ola: Actor;
  let gm: Socket;
  let sceneId = '';
  let grid = 0;
  let width = 0;
  let iskraCar: Placed;
  let vanCar: Placed;
  let policeCar: Placed;
  let iskra = '';
  let vanDriver = '';

  const vehicle = async (actor: Actor, id: string) =>
    (await actor.store<{ vehicles: Placed[] }>('chase')).vehicles.find((row) => row.id === id);
  const plan = async (actor: Actor) => (await actor.store<{ plan: PlanEntry[] }>('chase')).plan;
  /** „Następna tura” MG; runda stojąca na kubku Oli (Wyścig) — drugie kliknięcie ją pomija. */
  const next = async () => {
    scriptDice([5]);
    const view = dataOf<CombatView>(await emitAck(gm, 'combat:next', undefined));
    if (view.round >= 1 && view.activeCombatantId === null) {
      return dataOf<CombatView>(await emitAck(gm, 'combat:next', undefined));
    }
    return view;
  };
  const panel = () => mg.page.getByRole('region', { name: 'Pościg' });
  const planForm = () => panel().getByTestId('chase-plan-form');
  const decision = () => mg.page.getByTestId('gm-decision');
  /** Karty planu w magazynie czatu (pasek boczny nie musi stać na czacie). */
  const planCards = async (actor: Actor) =>
    (
      await actor.store<{
        items: { type: string; message?: { kind: string; chasePlan?: { status: string } } }[];
      }>('chat')
    ).items.flatMap((item) =>
      item.type === 'message' && item.message?.kind === 'chaseplan'
        ? [item.message.chasePlan?.status ?? '']
        : [],
    );

  test.beforeAll(async ({ cast }) => {
    const mapFile = material(MAP);
    await startFromPoT6(DEAD_GATEWAY);
    test.setTimeout(4 * 60_000);
    cast.viewport = { width: 1600, height: 1000 };
    mg = await cast.mg('chromium');
    ola = await cast.gracz('Ola', 'firefox', await invite(await apiGm(), 'Ola'));
    gm = await mg.socket();

    sceneId = dataOf<{ id: string }>(
      await emitAck(gm, 'scene:create', { name: 'Plan pościgu', kind: 'chase' }),
    ).id;
    const api = await apiGm();
    const upload = await api.post('/api/uploads/maps', {
      multipart: {
        file: { name: 'wiadukt.png', mimeType: 'image/png', buffer: readFileSync(mapFile) },
      },
    });
    const map = (await upload.json()) as { url: string; width: number; height: number };
    await api.dispose();
    grid = map.width / 48;
    width = map.width;
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
      await create('Strzała Iskry', '/art/vehicles/furia.webp', characterId('Iskra')),
      grid * 33.6,
      grid * 6,
    );
    vanCar = await place(
      await create('Furgon gangu', '/art/vehicles/widmo.webp'),
      grid * 42,
      grid * 10,
    );
    policeCar = await place(
      await create('Radiowóz', '/art/vehicles/widmo.webp'),
      grid * 20,
      grid * 14,
    );
    // Radiowóz czeka poza pościgiem — jak posiłki z rezerwy.
    dataOf(await emitAck(gm, 'chase:escape', { sceneVehicleId: policeCar.id }));

    const figure = async (name: string, y: number, extra: Record<string, unknown> = {}) =>
      dataOf<{ id: string }>(
        await emitAck(gm, 'token:create', { sceneId, name, x: grid * 2, y: grid * y, ...extra }),
      ).id;
    iskra = await figure('Iskra', 2, {
      characterId: characterId('Iskra'),
      ownerId: userId('Ola'),
    });
    vanDriver = await figure('Kierowca gangu', 4, { hp: { current: 30, max: 30 } });
    for (const [tokenId, sceneVehicleId] of [
      [iskra, iskraCar.id],
      [vanDriver, vanCar.id],
    ] as const) {
      dataOf(await emitAck(gm, 'vehicle:seat', { tokenId, sceneVehicleId, seat: 0 }));
    }

    await closeNotices(mg.page);
    await mg.page.getByRole('button', { name: 'Sceny', exact: true }).click();
    await sceneListRow(mg.page, 'Plan pościgu').getByRole('button', { name: 'Pokaż' }).click();
    await closeNotices(ola.page);
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('przed walką MG wpisuje plan w oknie „Pościg”; Ola go nie dostaje', async () => {
    await mg.page.getByRole('button', { name: 'Pościg', exact: true }).click();
    await expect(panel()).toBeVisible();
    await expect(panel().getByTestId('chase-plan-editor')).toContainText('Planu nie ma');

    // Posiłki na rundę 2: Radiowóz (poza kadrem — pierwszy na liście), trzeci pas, od tyłu.
    await planForm().getByRole('spinbutton', { name: 'Runda zdarzenia' }).fill('2');
    await planForm().getByRole('combobox', { name: 'Rodzaj zdarzenia' }).selectOption('reinforce');
    await expect(planForm().getByRole('combobox', { name: 'Auto posiłków' })).toHaveValue(
      policeCar.id,
    );
    await planForm().getByRole('combobox', { name: 'Pas', exact: true }).selectOption('2');
    await planForm().getByRole('combobox', { name: 'Strona kadru' }).selectOption('rear');
    await planForm().getByRole('textbox', { name: 'Dopisek dla MG' }).fill('NCPD wchodzi do gry');
    await planForm().getByRole('button', { name: 'Dodaj do planu' }).click();
    await expect.poll(async () => (await plan(mg)).length).toBe(1);

    // Notatka na rundę 1 — bez treści nie da się jej dodać.
    await planForm().getByRole('spinbutton', { name: 'Runda zdarzenia' }).fill('1');
    await planForm().getByRole('combobox', { name: 'Rodzaj zdarzenia' }).selectOption('note');
    await expect(planForm().getByRole('button', { name: 'Dodaj do planu' })).toBeDisabled();
    await planForm()
      .getByRole('textbox', { name: 'Treść notatki' })
      .fill('Megafon z radiowozu: zjechać na pobocze!');
    await planForm().getByRole('button', { name: 'Dodaj do planu' }).click();
    await expect
      .poll(async () => (await plan(mg)).map((row) => row.kind))
      .toEqual(['note', 'reinforce']);
    const rows = panel().locator('.chase-plan-row');
    await expect(rows.first()).toContainText('R1');
    await expect(rows.first()).toContainText('Notatka: Megafon z radiowozu');
    await expect(rows.nth(1)).toContainText('Posiłki: Radiowóz — pas 3, od tyłu, prędkość pościgu');
    await expect(rows.nth(1)).toContainText('NCPD wchodzi do gry');
    expect(await plan(ola)).toEqual([]);
    await panel().screenshot({ path: test.info().outputPath('plan-przed-walka.png') });
  });

  test('runda 1: panel decyzji pyta o notatkę, runda idzie dalej, „Zrobione” ją zamyka', async () => {
    const combat = dataOf<CombatView>(
      await emitAck(gm, 'combat:start', { sceneId, tokenIds: [iskra, vanDriver] }),
    );
    const order: Record<string, number> = { [iskra]: 18, [vanDriver]: 12 };
    for (const row of combat.combatants) {
      dataOf(
        await emitAck(gm, 'combat:set-initiative', {
          combatantId: row.id,
          initiative: order[row.tokenId ?? ''] ?? 10,
        }),
      );
    }
    const view = await next(); // runda 1, tura Iskry
    expect(view).toMatchObject({ round: 1 });
    expect(view.activeCombatantId).not.toBeNull();
    await expect(decision()).toContainText('Plan rundy');
    await expect(decision()).toContainText('Megafon z radiowozu: zjechać na pobocze!');
    await mg.page.screenshot({ path: test.info().outputPath('plan-panel-decyzji.png') });
    // Karta planu jest na czacie MG, Ola jej nie dostaje.
    expect(await planCards(mg)).toEqual(['waiting']);
    expect(await planCards(ola)).toEqual([]);
    await decision().getByRole('button', { name: 'Zrobione' }).click();
    await expect
      .poll(async () => (await plan(mg)).find((row) => row.kind === 'note')?.status)
      .toBe('done');
    await expect.poll(async () => planCards(mg)).toEqual(['released']);
    await expect(panel().locator('.chase-plan-row').first()).toContainText('zrobione');
  });

  test('runda 2: „Wypuść” przywraca Radiowóz na trzecim pasie; Ola go widzi (Firefox)', async () => {
    expect(await vehicle(ola, policeCar.id)).toBeUndefined();
    await next(); // tura Furgonu
    const view = await next(); // runda 2
    expect(view.round).toBe(2);
    await expect(decision()).toContainText('Radiowóz — pas 3, od tyłu');
    await expect(decision()).toContainText('NCPD wchodzi do gry');
    await decision().getByRole('button', { name: 'Wypuść' }).click();
    await expect.poll(async () => (await vehicle(mg, policeCar.id))?.status).toBe('racing');
    const police = (await vehicle(mg, policeCar.id))!;
    // Tył kadru przy jeździe w lewo to prawa krawędź.
    expect(police.lane).toBe(2);
    expect(police.x).toBeCloseTo(width - (police.lengthSq / 2) * grid, 1);
    await expect.poll(async () => (await vehicle(ola, policeCar.id))?.status).toBe('racing');
    await expect(panel().locator('.chase-plan-row').nth(1)).toContainText('wypuszczone');
    expect(await planCards(ola)).toEqual([]);
    await panel().screenshot({ path: test.info().outputPath('plan-po-posilkach.png') });
    await ola.page.screenshot({ path: test.info().outputPath('ola-po-posilkach.png') });
  });
});
