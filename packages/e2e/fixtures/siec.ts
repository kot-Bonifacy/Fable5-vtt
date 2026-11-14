import type { Locator, Page } from '@playwright/test';
import type { Socket } from 'socket.io-client';
import { expect, type Actor } from './actors.ts';
import { runOf } from './brama.ts';
import { characterId, userId } from './nocna-zmiana.ts';
import { centreCamera, clickOnMap } from './scene.ts';
import { emitAck } from './socket.ts';
import { shakeCup } from './table.ts';
import type { WorldPoint } from './canvas.ts';

/**
 * Okno SIEĆ po etapie 70a: jedno piętro (`.net-floor-card`), wyjścia z niego
 * (`.net-exit`) i ślad odwiedzonych (`.net-trail-step`). Pełny szyb rysuje tylko
 * „Plan Architektury” w oknie MG (`.net-plan .net-run-floor`).
 *
 * Specy Sieci chodzą po oknie tymi pomocnikami zamiast po `nth()` listy pięter —
 * gracz nie ma już listy, z której dałoby się wybrać piętro po numerze.
 */

type Ack<T> = { ok: true; data: T } | { ok: false; error: string };
function dataOf<T>(ack: unknown, what: string): T {
  const typed = ack as Ack<T>;
  if (!typed.ok) throw new Error(`E2E: ${what}: ${JSON.stringify(ack)}`);
  return typed.data;
}

export const runWindow = (actor: Actor): Locator => actor.page.locator('.net-run-window');
/** Karta piętra, na którym stoi netrunner — u gracza jedyne piętro w oknie. */
export const floorCard = (actor: Actor): Locator => runWindow(actor).locator('.net-floor-card');
/** Wyjścia w dół z bieżącego piętra; `door` zawęża do „Niżej” albo „Odnoga”. */
export const exitsDown = (actor: Actor, door?: 'Niżej' | 'Odnoga'): Locator => {
  const all = runWindow(actor).locator('.net-exit--down');
  return door ? all.filter({ hasText: door }) : all;
};
export const exitUp = (actor: Actor): Locator => runWindow(actor).locator('.net-exit--up');
export const trailSteps = (actor: Actor): Locator => runWindow(actor).locator('.net-trail-step');
/** Zdolność z karty piętra („Backdoor”, „Zwiad”, „Kontrola”…). */
export const abilityButton = (actor: Actor, name: string): Locator =>
  floorCard(actor).locator('.net-abilities').getByRole('button', { name, exact: true });
/**
 * Rzut Sieci po kliku (zlecenie MG z 14.11): zdolność, atak, Ślizg i Skaner
 * ładują kubek, a rzuca dopiero gest — czekamy, aż kubek się zapali, i rzucamy.
 */
export async function throwNetRoll(page: Page): Promise<void> {
  await expect(page.locator('.dice-cup')).toHaveClass(/dice-cup--sheet/);
  await shakeCup(page);
}
/** Wiersze „Planu Architektury” — tylko okno MG. */
export const planFloors = (actor: Actor): Locator =>
  runWindow(actor).locator('.net-plan .net-run-floor');

export const positionOf = (character: string) => runOf(character)?.state.position;

/** Klik w wyjście w dół i czekanie, aż serwer zapisze nową pozycję. */
export async function takeExit(
  actor: Actor,
  character: string,
  door: 'Niżej' | 'Odnoga' = 'Niżej',
): Promise<void> {
  const before = positionOf(character);
  await exitsDown(actor, door).first().click();
  await expect
    .poll(() => JSON.stringify(positionOf(character)), { message: `${character}: zjazd` })
    .not.toBe(JSON.stringify(before));
}

/** „▲ Wyżej” i czekanie na pozycję o piętro płytszą. */
export async function goUp(actor: Actor, character: string): Promise<void> {
  const before = positionOf(character);
  await exitUp(actor).click();
  await expect
    .poll(() => JSON.stringify(positionOf(character)), { message: `${character}: wyżej` })
    .not.toBe(JSON.stringify(before));
}

/** Podłączenie z karty gniazda na mapie (kadr najpierw nad gniazdo). */
export async function jackIn(actor: Actor, socketAt: WorldPoint): Promise<void> {
  await centreCamera(actor.page, { x: socketAt.x + 240, y: socketAt.y + 40 });
  await actor.page.waitForTimeout(500);
  await clickOnMap(actor.page, socketAt);
  const card = actor.page.getByLabel(/^Karta obiektu: /);
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Podłącz się' }).click();
  await expect(runWindow(actor)).toBeVisible();
}

export interface NetFloorSpec {
  id: string;
  kind: 'empty' | 'password' | 'file' | 'controlNode' | 'ice' | 'demon';
  label: string;
  dv?: number;
  notes?: string;
  /** Czarny LOD albo Demon na piętrze — id wpisów kompendium (etap 70e). */
  programIds?: string[];
}

/** Hamulec MG na obronę Sieci w oknie runu MG (etap 70e). */
export const defenseBrake = (actor: Actor): Locator =>
  runWindow(actor).getByRole('checkbox', { name: 'Wstrzymaj obronę' });
export interface NetBranchSpec {
  id: string;
  name?: string;
  parentFloor: number | null;
  floors: NetFloorSpec[];
}

export interface NetSceneOptions {
  scene: string;
  architecture: { name: string; branches: NetBranchSpec[] };
  /** Postać netrunnera i konto, które nią gra. */
  runner: { character: string; player: string; at: WorldPoint };
  socketAt: WorldPoint;
  socketName?: string;
}

/**
 * Scena z gniazdem wpiętym w Architekturę — wszystko surowym gniazdem MG, bo
 * edytor Architektury i sceny sprawdzają już T5a i T3; tu liczy się okno runu.
 * Scena zostaje aktywna, figura netrunnera stoi przy jawnym gnieździe.
 */
export async function buildNetScene(
  gm: Socket,
  options: NetSceneOptions,
): Promise<{ sceneId: string; architectureId: string }> {
  const sceneId = dataOf<{ id: string }>(
    await emitAck(gm, 'scene:create', { name: options.scene }),
    'scene:create',
  ).id;
  await emitAck(gm, 'scene:update', {
    sceneId,
    patch: { width: 2000, height: 2000, playerMove: 'explore' },
  });
  await emitAck(gm, 'scene:activate', { sceneId });
  const architectureId = dataOf<{ id: string }>(
    await emitAck(gm, 'net:save', {
      architecture: { difficulty: 'standard', ...options.architecture },
    }),
    'net:save',
  ).id;
  dataOf(
    await emitAck(gm, 'token:create', {
      sceneId,
      name: options.runner.character,
      ...options.runner.at,
      ownerId: userId(options.runner.player),
      characterId: characterId(options.runner.character),
    }),
    'token:create',
  );
  dataOf(
    await emitAck(gm, 'netpoint:place', {
      sceneId,
      ...options.socketAt,
      name: options.socketName ?? 'Gniazdo serwisowe',
      architectureId,
      hidden: false,
    }),
    'netpoint:place',
  );
  return { sceneId, architectureId };
}
