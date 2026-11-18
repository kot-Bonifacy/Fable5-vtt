import type { Locator } from '@playwright/test';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { queryOne } from '../../fixtures/db.ts';
import { campaignId, characterId } from '../../fixtures/nocna-zmiana.ts';
import {
  CELL,
  ROLES,
  cardData,
  gmSocket,
  lastMessageId,
  messagesAfter,
  creationDataOf,
  rollAfter,
  seatRole,
  startFromRoleStart,
} from '../../fixtures/role.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { closeSheet, openSheet } from '../../fixtures/walka.ts';
import { pendingDice, scriptDice } from '../../instance/instance.ts';

/**
 * Etap 71b — Korpo, Praca Zespołowa (s. 153–157). Wiersze macierzy: KOR-02,
 * KOR-05, KOR-06, KOR-08 (z #74 i #75 przeniesionymi z T8c w 71h), KOR-09, KOR-11, KOR-18; od 71e także KOR-S1 (P6:
 * pracownik staje obok Korpo), KOR-15 (G26: następca za 200 ed z karty)
 * i KOR-12…14 (G25: zamknięcie sesji ścina Lojalność, proponuje −1
 * i przypomina o odejściu). Od 71h — WSP-22 (P3: pakiet Ulicznika Korpo
 * wg oryginału, suma 86).
 */

const EXEC = ROLES.exec;
const WORKER = 'Marta Kowalczyk';
type Sheet = {
  team: { characterId: string; loyalty: number; name?: string; neglectDue?: boolean }[];
  lifestyle: { housing: string } | null;
  eddies: number;
};
const tokenAt = (id: string) =>
  queryOne<{ x: number; y: number }>('SELECT x, y FROM Token WHERE characterId = ?', id);
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
    // P6 (KOR-S1): figura pracownika staje na mapie obok figury Korpo.
    const boss = tokenAt(characterId(EXEC.card))!;
    await expect.poll(() => tokenAt(member.characterId)).not.toBeUndefined();
    const placed = tokenAt(member.characterId)!;
    expect(Math.max(Math.abs(placed.x - boss.x), Math.abs(placed.y - boss.y))).toBeLessThanOrEqual(
      CELL,
    );
    expect(
      Object.keys((JSON.parse(worker.data) as { skills: object }).skills).length,
    ).toBeGreaterThan(5);
    // Ranga 4: jeden etat — drugiego HR nie oferuje.
    await expect(panel().getByRole('button', { name: 'Poproś HR o pracownika' })).toHaveCount(0);
    // #74 (z T8c, 71h): gracz widzi imię, które sam nadał; #75: guzików Lojalności,
    // które serwer zostawia MG, gracz nie dostaje.
    await expect(panel().locator('.team-row')).toContainText(WORKER);
    await expect(panel().getByRole('button', { name: /^Test Lojalności: / })).toHaveCount(0);
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

  test('KOR-15 G26 następca odchodzącego: Lojalność 1 i 200 ed z karty Korpo', async () => {
    const gm = await gmSocket();
    await emitAck(gm, 'economy:adjust', { characterId: characterId(EXEC.card), balance: 1000 });
    expect(
      await emitAck(gm, 'character:team-loyalty', {
        characterId: characterId(EXEC.card),
        memberId: sheet().team[0]!.characterId,
        dismiss: true,
      }),
    ).toMatchObject({ ok: true });
    gm.disconnect();
    await expect.poll(() => sheet().team.length).toBe(0);
    card = await openSheet(filip, EXEC.card);
    await card.getByRole('button', { name: 'Karta', exact: true }).click();
    await panel().getByRole('button', { name: 'Poproś HR o pracownika' }).click();
    await panel().getByLabel('Imię pracownika').fill('Następca');
    await panel()
      .getByLabel(/Następca \(200 ed\)/)
      .check();
    await panel().getByRole('button', { name: 'Zatrudnij' }).click();
    await expect.poll(() => sheet().team.length, { timeout: 20_000 }).toBe(1);
    expect(sheet().team[0]!.loyalty).toBe(1);
    expect(sheet().eddies).toBe(800);
  });

  test('KOR-12 KOR-13 KOR-14 G25 koniec sesji: propozycja −1 dla MG, przypomnienie o odejściu', async () => {
    const since = lastMessageId();
    const gm = await gmSocket();
    expect(await emitAck(gm, 'session:end', { campaignId: campaignId() })).toMatchObject({
      ok: true,
    });
    gm.disconnect();
    await expect.poll(() => sheet().team[0]?.neglectDue).toBe(true);
    await expect
      .poll(() =>
        messagesAfter(since)
          .map((m) => m.text)
          .join(' | '),
      )
      .toContain('Koniec sesji — zespół Krawat');
    const gmCard = await openSheet(mg, EXEC.card);
    const gmPanel = gmCard.locator('[data-sheet-panel="team"]');
    await expect(gmPanel.getByTestId('team-neglect')).toContainText('Sesja bez wzrostu');
    await gmPanel.getByRole('button', { name: 'Odejmij 1 Lojalności: Następca' }).click();
    // 1 − 1 = 0: przy zerze pracownik czynnie zdradza, „odchodzi” dopiero poniżej.
    await expect.poll(() => sheet().team[0]!.loyalty).toBe(0);
    expect(sheet().team[0]!.neglectDue).toBeUndefined();
    await expect(gmPanel.getByTestId('team-neglect')).toHaveCount(0);
    for (const actor of [mg, filip]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
  });

  test('WSP-22 P3 Ulicznik Korpo: pakiet wg oryginału, 86 punktów (druk polski: 84)', async () => {
    const creation = await creationDataOf();
    const skills = creation.streetrat.exec!.skills;
    // Lista Korpo nie ma Umiejętności o podwójnym koszcie — suma poziomów to koszt.
    expect(Object.values(skills).reduce((sum, level) => sum + level, 0)).toBe(86);
    expect(skills['personal-grooming']).toBe(4);
    expect(Object.values(skills).filter((level) => level === 6)).toHaveLength(11);
  });
});
