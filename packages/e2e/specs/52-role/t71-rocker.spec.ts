import type { Locator } from '@playwright/test';
import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { characterId } from '../../fixtures/nocna-zmiana.ts';
import {
  ROLES,
  dataOf,
  gmSocket,
  lastMessageId,
  rollAfter,
  seatRole,
  startFromRoleStart,
} from '../../fixtures/role.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { shakeCup } from '../../fixtures/table.ts';
import { pendingDice, scriptDice } from '../../instance/instance.ts';

/**
 * Etap 71b — Rocker, Efekt Charyzmy (s. 144–145), stan dzisiejszy. Wiersze
 * macierzy: ROC-01, ROC-02, ROC-06. Blokada tygodniowa i „ci fani” (ROC-08,
 * ROC-09) nie istnieją jako stan — nie ma czego klikać.
 */

const ROCKER = ROLES.rockerboy;

test.describe.serial('@szybkie T71 Rocker — Efekt Charyzmy', () => {
  let hubert: Actor;
  let card: Locator;
  let gm: Socket;
  const panel = () => card.locator('.cp-role-strip');
  const rollFor = (audience: string) =>
    panel().getByRole('button', { name: `Rzuć Efekt Charyzmy: ${audience}`, exact: true });

  test.beforeAll(async ({ cast }) => {
    await startFromRoleStart();
    ({ player: hubert, card } = await seatRole(cast, 'rockerboy'));
    gm = await gmSocket();
  });

  test.afterAll(async ({ cast }) => {
    gm?.close();
    await cast.closeAll();
  });

  test('ROC-01 ROC-02 nowi fani: sama ranga + 1k10 z kubka przeciw PT 8', async () => {
    await panel().getByRole('button', { name: 'Zrób z nich fanów' }).click();
    const since = lastMessageId();
    scriptDice([6]);
    await rollFor('Pojedynczy fan').click();
    await shakeCup(hubert.page);
    const roll = await rollAfter(since, 'Charyzm', 'roll');
    // Ranga 4 + kość 6 — bez Fajności (8) i bez Umiejętności.
    expect(roll.total, JSON.stringify(roll)).toBe(10);
    expect(roll.outcome?.success, JSON.stringify(roll.outcome)).toBe(true);
    expect(pendingDice()).toBe('');
  });

  test('ROC-02 prośba do dużej grupy: PT 12, 4 + 7 nie wystarcza', async () => {
    await panel().getByRole('button', { name: 'Poproś fanów o przysługę' }).click();
    const since = lastMessageId();
    scriptDice([7]);
    await rollFor('Duża grupa').click();
    await shakeCup(hubert.page);
    const roll = await rollAfter(since, 'Charyzm', 'roll');
    expect(roll.total).toBe(11);
    expect(roll.outcome?.success, JSON.stringify(roll.outcome)).toBe(false);
  });

  test('ROC-06 przy randze 2 prośby do dużej grupy nie ma — ani w panelu, ani z gniazda', async () => {
    dataOf(
      await emitAck(gm, 'character:update', {
        characterId: characterId(ROCKER.card),
        patch: { data: { roleAbilityRank: 2 } },
      }),
      'ranga 2',
    );
    await expect(panel()).toContainText('Efekt Charyzmy 2');
    await panel().getByRole('button', { name: 'Poproś fanów o przysługę' }).click();
    await expect(rollFor('Duża grupa')).toBeDisabled();
    const refused = await emitAck(await hubert.socket(), 'character:roll', {
      characterId: characterId(ROCKER.card),
      request: {
        kind: 'charisma',
        charismaAudience: 'large',
        charismaPurpose: 'favour',
        modifier: 0,
        luckSpent: 0,
      },
      visibility: 'public',
    });
    expect(refused).toMatchObject({ ok: false });
    expect(hubert.unexpectedErrors()).toEqual([]);
  });
});
