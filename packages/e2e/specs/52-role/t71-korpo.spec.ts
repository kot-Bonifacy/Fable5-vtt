import type { Locator } from '@playwright/test';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { queryOne } from '../../fixtures/db.ts';
import { characterId } from '../../fixtures/nocna-zmiana.ts';
import {
  ROLES,
  cardData,
  lastMessageId,
  rollAfter,
  seatRole,
  startFromRoleStart,
} from '../../fixtures/role.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { closeSheet, openSheet } from '../../fixtures/walka.ts';
import { pendingDice, scriptDice } from '../../instance/instance.ts';

/**
 * Etap 71b — Korpo, Praca Zespołowa (s. 153–157), stan dzisiejszy. Wiersze
 * macierzy: KOR-02, KOR-05, KOR-06, KOR-08, KOR-09, KOR-11, KOR-18.
 * Lojalność po zamknięciu sesji (KOR-12…14) to klik MG przy pracowniku albo ❌.
 */

const EXEC = ROLES.exec;
const WORKER = 'Marta Kowalczyk';
type Sheet = {
  team: { characterId: string; loyalty: number; name?: string }[];
  lifestyle: { housing: string } | null;
};
const sheet = () => cardData<Sheet>(EXEC.card);

test.describe.serial('@szybkie T71 Korpo — Praca Zespołowa', () => {
  let mg: Actor;
  let filip: Actor;
  let card: Locator;
  const panel = () => card.locator('[data-sheet-panel="team"]');

  test.beforeAll(async ({ cast }) => {
    await startFromRoleStart();
    ({ mg, player: filip, card } = await seatRole(cast, 'exec'));
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('KOR-05 KOR-06 KOR-08 HR przysyła jednego pracownika z kartą i Lojalnością 1k6 + 1', async () => {
    await panel().getByRole('button', { name: 'Poproś HR o pracownika' }).click();
    await panel().getByLabel('Imię pracownika').fill(WORKER);
    await panel().getByRole('button', { name: 'Zatrudnij' }).click();
    await expect.poll(() => sheet().team.length, { timeout: 20_000 }).toBe(1);
    const member = sheet().team[0]!;
    expect(member.loyalty).toBeGreaterThanOrEqual(2);
    expect(member.loyalty).toBeLessThanOrEqual(7);
    const worker = queryOne<{ name: string; ownerId: string | null; data: string }>(
      'SELECT name, ownerId, data FROM Character WHERE id = ?',
      member.characterId,
    )!;
    expect(worker.name).toBe(WORKER);
    expect(worker.ownerId, 'pracownikiem steruje MG').toBeNull();
    expect(
      Object.keys((JSON.parse(worker.data) as { skills: object }).skills).length,
    ).toBeGreaterThan(5);
    // Ranga 4: jeden etat — drugiego HR nie oferuje.
    await expect(panel().getByRole('button', { name: 'Poproś HR o pracownika' })).toHaveCount(0);
  });

  test('KOR-05 KOR-18 gniazdo gracza nie zatrudni drugiego ani nie rzuci Testu Lojalności', async () => {
    const player = await filip.socket();
    const hire = await emitAck(player, 'character:team-hire', {
      characterId: characterId(EXEC.card),
      professionId: 'bodyguard',
      name: 'Podstawiony',
    });
    expect(hire).toMatchObject({ ok: false });
    const loyalty = await emitAck(player, 'character:team-loyalty', {
      characterId: characterId(EXEC.card),
      memberId: sheet().team[0]!.characterId,
      test: true,
    });
    expect(loyalty).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(sheet().team.length).toBe(1);
  });

  test('KOR-09 KOR-11 MG: Test Lojalności kością, potem komplement z tabeli podnosi Lojalność', async () => {
    const before = sheet().team[0]!.loyalty;
    const gmCard = await openSheet(mg, EXEC.card);
    const gmPanel = gmCard.locator('[data-sheet-panel="team"]');
    const since = lastMessageId();
    scriptDice([1]);
    await gmPanel.getByRole('button', { name: `Test Lojalności: ${WORKER}` }).click();
    const roll = await rollAfter(since, 'Lojalno');
    test.info().annotations.push({ type: 'Test Lojalności', description: JSON.stringify(roll) });
    expect(pendingDice()).toBe('');
    expect(sheet().team[0]!.loyalty, 'Test niczego nie zmienia').toBe(before);
    await gmPanel.getByRole('button', { name: `Zmień Lojalność: ${WORKER}` }).click();
    await gmPanel.locator('.team-loyalty button', { hasText: /^\+\d/ }).first().click();
    await expect.poll(() => sheet().team[0]!.loyalty).toBeGreaterThan(before);
    await closeSheet(mg.page);
  });

  test('KOR-02 od poziomu 2 korporacyjny konap w Zakwaterowaniu', async () => {
    card = await openSheet(filip, EXEC.card);
    await card.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    await card.getByLabel('Zakwaterowanie').selectOption('corpoConapt');
    await expect.poll(() => sheet().lifestyle?.housing).toBe('corpoConapt');
    for (const actor of [mg, filip]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
  });
});
