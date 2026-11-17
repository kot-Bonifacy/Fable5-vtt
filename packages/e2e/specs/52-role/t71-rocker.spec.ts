import type { Locator } from '@playwright/test';
import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { characterId } from '../../fixtures/nocna-zmiana.ts';
import { sceneByName } from '../../fixtures/regresja.ts';
import {
  ROLES,
  ROLE_SCENE,
  TARGET,
  cardData,
  creationDataOf,
  dataOf,
  gmSocket,
  lastMessageId,
  rollAfter,
  seatRole,
  startFromRoleStart,
  tokenIdOf,
} from '../../fixtures/role.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { shakeCup } from '../../fixtures/table.ts';
import { pendingDice, scriptDice } from '../../instance/instance.ts';

/**
 * Etap 71b / 71f — Rocker, Efekt Charyzmy (s. 144–145). Wiersze macierzy:
 * ROC-01, ROC-02, ROC-04, ROC-06, ROC-08, ROC-09. Od 71f fani są listą na
 * karcie: udany Test dopisuje grupę, prośba pada do grupy, a odmowa zamyka ją
 * na 7 dni kalendarza świata.
 */

const ROCKER = ROLES.rockerboy;
const FAN = 'Barman z Totemu';
const CROWD = 'Publika Totemu';

interface FanRow {
  id: string;
  name: string;
  audience: string;
  blockedUntilMinute?: number;
  blockedWhat?: string;
}

test.describe.serial('@szybkie T71 Rocker — Efekt Charyzmy', () => {
  let hubert: Actor;
  let card: Locator;
  let gm: Socket;
  const panel = () => card.locator('.cp-role-strip');
  const rollFor = (name: string) =>
    panel().getByRole('button', { name: `Rzuć Efekt Charyzmy: ${name}`, exact: true });
  const fans = () => cardData<{ fans?: FanRow[] }>(ROCKER.card).fans ?? [];
  const favour = (extra: Record<string, unknown>) => ({
    characterId: characterId(ROCKER.card),
    request: {
      kind: 'charisma',
      charismaPurpose: 'favour',
      modifier: 0,
      luckSpent: 0,
      ...extra,
    },
    visibility: 'public',
  });

  test.beforeAll(async ({ cast }) => {
    await startFromRoleStart();
    ({ player: hubert, card } = await seatRole(cast, 'rockerboy'));
    gm = await gmSocket();
  });

  test.afterAll(async ({ cast }) => {
    gm?.close();
    await cast.closeAll();
  });

  test('ROC-09 bez fanów na karcie nie ma kogo prosić — ani w panelu, ani z gniazda', async () => {
    await panel().getByRole('button', { name: 'Poproś fanów o przysługę' }).click();
    await expect(panel().getByTestId('fans-empty')).toBeVisible();
    const refused = await emitAck(
      await hubert.socket(),
      'character:roll',
      favour({ charismaAudience: 'single' }),
    );
    expect(refused).toMatchObject({ ok: false, error: 'NO_FAN_GROUP' });
  });

  test('ROC-01 ROC-02 ROC-09 nowi fani: ranga + 1k10 przeciw PT 8, udany Test dopisuje grupę', async () => {
    await panel().getByRole('button', { name: 'Zrób z nich fanów' }).click();
    await panel().getByLabel('Nazwa nowej grupy fanów').fill(FAN);
    const since = lastMessageId();
    scriptDice([6]);
    await rollFor('Pojedynczy fan').click();
    await shakeCup(hubert.page);
    const roll = await rollAfter(since, 'Charyzm', 'roll');
    // Ranga 4 + kość 6 — bez Fajności (8) i bez Umiejętności.
    expect(roll.total, JSON.stringify(roll)).toBe(10);
    expect(roll.outcome?.success, JSON.stringify(roll.outcome)).toBe(true);
    expect(pendingDice()).toBe('');
    await expect.poll(() => fans().map((row) => row.name)).toEqual([FAN]);
    await panel().getByRole('button', { name: 'Poproś fanów o przysługę' }).click();
    await expect(panel().getByTestId('fans-list')).toContainText(FAN);
  });

  test('ROC-08 nieudana prośba zamyka tych fanów na 7 dni kalendarza', async () => {
    await panel().getByLabel('O co prosisz fanów').fill('nocleg');
    const since = lastMessageId();
    // Dwójka, nie jedynka: naturalna 1 to krytyczna porażka z dorzutem kości.
    scriptDice([2]);
    await rollFor(FAN).click();
    await shakeCup(hubert.page);
    const roll = await rollAfter(since, 'Charyzm', 'roll');
    expect(roll.total).toBe(6);
    expect(roll.outcome?.success, JSON.stringify(roll.outcome)).toBe(false);
    await expect.poll(() => fans()[0]?.blockedWhat).toBe('nocleg');
    await expect(panel().getByTestId('fans-list')).toContainText('Odmówili — do');
    await expect(rollFor(FAN)).toBeDisabled();
    const refused = await emitAck(
      await hubert.socket(),
      'character:roll',
      favour({ charismaAudience: 'single', charismaFanGroupId: fans()[0]!.id }),
    );
    expect(refused).toMatchObject({ ok: false, error: 'FANS_REFUSED' });
    // Blokady nie zdejmie gracz; tydzień zegara świata zdejmuje ją sam.
    const unblock = await emitAck(await hubert.socket(), 'character:fans', {
      characterId: characterId(ROCKER.card),
      action: 'unblock',
      groupId: fans()[0]!.id,
    });
    expect(unblock).toMatchObject({ ok: false });
    dataOf(await emitAck(gm, 'time:set', { minutes: fans()[0]!.blockedUntilMinute }), 'time:set');
    await expect(rollFor(FAN)).toBeEnabled();
  });

  test('ROC-02 prośba do dużej grupy od MG: PT 12, 4 + 7 nie wystarcza', async () => {
    dataOf(
      await emitAck(gm, 'character:fans', {
        characterId: characterId(ROCKER.card),
        action: 'add',
        name: CROWD,
        audience: 'large',
      }),
      'fani od MG',
    );
    const since = lastMessageId();
    scriptDice([7]);
    await rollFor(CROWD).click();
    await shakeCup(hubert.page);
    const roll = await rollAfter(since, 'Charyzm', 'roll');
    expect(roll.total).toBe(11);
    expect(roll.outcome?.success, JSON.stringify(roll.outcome)).toBe(false);
  });

  test('ROC-04 nowych fanów nie robi się w walce — odmowa serwera', async () => {
    dataOf(
      await emitAck(gm, 'combat:start', {
        sceneId: sceneByName(ROLE_SCENE).id,
        tokenIds: [tokenIdOf(TARGET)],
      }),
      'combat:start',
    );
    await panel().getByRole('button', { name: 'Zrób z nich fanów' }).click();
    await expect(rollFor('Mała grupa (do 6)')).toBeDisabled();
    const refused = await emitAck(await hubert.socket(), 'character:roll', {
      characterId: characterId(ROCKER.card),
      request: {
        kind: 'charisma',
        charismaAudience: 'small',
        charismaPurpose: 'fans',
        modifier: 0,
        luckSpent: 0,
      },
      visibility: 'public',
    });
    expect(refused).toMatchObject({ ok: false, error: 'FANS_IN_COMBAT' });
    dataOf(await emitAck(gm, 'combat:end', undefined), 'combat:end');
    await expect(rollFor('Mała grupa (do 6)')).toBeEnabled();
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
    await expect(rollFor(CROWD)).toBeDisabled();
    const crowd = fans().find((row) => row.name === CROWD)!;
    const refused = await emitAck(
      await hubert.socket(),
      'character:roll',
      favour({ charismaAudience: 'large', charismaFanGroupId: crowd.id }),
    );
    expect(refused).toMatchObject({ ok: false });
    expect(hubert.unexpectedErrors()).toEqual([]);
  });

  test('ROC-K1 G34 lista Umiejętności Rockera wg oryginału: Broń biała zamiast Broni długiej', async () => {
    const creation = await creationDataOf();
    const skills = creation.roles.find((role) => role.id === 'rockerboy')!.skills;
    expect(skills).toContain('melee-weapon');
    expect(skills).not.toContain('shoulder-arms');
    expect(Object.keys(creation.streetrat.rockerboy!.skills)).toContain('melee-weapon');
    // Pakiet Krawędziarza (G33): duża broń biała albo granat błyskowy — jedno z dwóch.
    const slots = creation.edgerunnerKits.rockerboy!.slots.filter((slot) => slot.length > 1);
    expect(slots.map((slot) => slot.map((option) => option.map((item) => item.id)))).toEqual([
      [['weapon.heavy-melee'], ['ammo.flashbang']],
    ]);
  });
});
