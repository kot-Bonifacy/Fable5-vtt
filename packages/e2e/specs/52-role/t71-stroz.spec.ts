import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { query, queryOne } from '../../fixtures/db.ts';
import { characterId } from '../../fixtures/nocna-zmiana.ts';
import {
  CELL,
  ROLES,
  ROLE_SCENE,
  TARGET,
  cardData,
  dataOf,
  gmSocket,
  lastMessageId,
  messagesAfter,
  rollAfter,
  seatRole,
  startFromRoleStart,
  tokenIdOf,
  turnStateOf,
} from '../../fixtures/role.ts';
import { sceneByName } from '../../fixtures/regresja.ts';
import { centreCamera } from '../../fixtures/scene.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { shakeCup } from '../../fixtures/table.ts';
import { closeSheet, openSheet } from '../../fixtures/walka.ts';
import { pendingDice, scriptDice } from '../../instance/instance.ts';

/**
 * Etap 71b — Stróż Prawa, Wsparcie (s. 158–159). Wiersze macierzy: STR-01,
 * STR-02, STR-03 (#84, naprawiony w 71c0), STR-04, STR-07, STR-14 (licznik
 * wezwań dla MG, 71f), STR-15.
 * Pojazdy Wsparcia (STR-12) — po etapie 72.
 */

const LAW = ROLES.lawman;
const figures = () =>
  query<{ name: string }>(
    'SELECT t.name FROM Token t JOIN Scene s ON s.id = t.sceneId WHERE s.name = ?',
    ROLE_SCENE,
  ).map((row) => row.name);

test.describe.serial('@szybkie T71 Stróż Prawa — Wsparcie', () => {
  let mg: Actor;
  let gosia: Actor;
  let gm: Socket;
  const hud = () => gosia.page.getByRole('complementary', { name: 'Panel aktywnej postaci' });
  const radio = () => hud().locator('.hud-slot', { hasText: 'Wezwanie Wsparcia' });

  test.beforeAll(async ({ cast }) => {
    await startFromRoleStart();
    let card;
    ({ mg, player: gosia, card } = await seatRole(cast, 'lawman'));
    // STR-02 STR-07: na karcie tylko kategorie do rangi.
    await expect(card.locator('.cp-role-strip')).toContainText('Wsparcie 4');
    await closeSheet(gosia.page);
    gm = await gmSocket();
    await centreCamera(gosia.page, { x: LAW.column * CELL + 50, y: 4 * CELL });
  });

  test.afterAll(async ({ cast }) => {
    gm?.close();
    await cast.closeAll();
  });

  test('STR-02 STR-07 kategorie w zasięgu rangi; poziom 9 gniazdo odrzuca', async () => {
    await radio().click();
    const form = hud().locator('.hud-form');
    const calls = form.getByRole('button', { name: /^Wezwij: / });
    await expect(calls.first()).toBeVisible();
    test.info().annotations.push({
      type: 'kategorie',
      description: (await calls.allTextContents()).join(' | '),
    });
    expect(await calls.count()).toBeGreaterThan(0);
    const refused = await emitAck(await gosia.socket(), 'character:backup-call', {
      characterId: characterId(LAW.card),
      level: 9,
    });
    expect(refused).toEqual({ ok: false, error: 'BACKUP_LEVEL_TOO_HIGH' });
  });

  test('STR-01 STR-15 poza walką wezwanie z belki: 1k10 ≤ rangi, funkcjonariusze stają od razu', async () => {
    const before = figures().length;
    const since = lastMessageId();
    scriptDice([2, 3]);
    await hud()
      .locator('.hud-form')
      .getByRole('button', { name: /^Wezwij: / })
      .first()
      .click();
    const call = await rollAfter(since, 'Wezwanie Wsparcia', 'roll');
    expect(call.outcome?.success, JSON.stringify(call.outcome)).toBe(true);
    expect(pendingDice()).toBe('');
    await expect.poll(() => figures().length, { timeout: 15_000 }).toBeGreaterThan(before);
    test.info().annotations.push({ type: 'figury po wezwaniu', description: figures().join(', ') });
  });

  test('STR-01 STR-03 w walce nieudane wezwanie z belki i tak zabiera Akcję', async () => {
    test.setTimeout(3 * 60_000);
    const started = dataOf<{ combatants: { id: string; tokenId: string | null }[] }>(
      await emitAck(gm, 'combat:start', {
        sceneId: sceneByName(ROLE_SCENE).id,
        tokenIds: [tokenIdOf(LAW.card), tokenIdOf(TARGET)],
      }),
      'combat:start',
    );
    await expect(gosia.page.locator('.dice-cup')).toHaveAttribute('title', /inicjatyw/i);
    scriptDice([9]);
    await shakeCup(gosia.page);
    const target = started.combatants.find((row) => row.tokenId === tokenIdOf(TARGET))!;
    dataOf(
      await emitAck(gm, 'combat:set-initiative', { combatantId: target.id, initiative: 1 }),
      'inicjatywa',
    );
    await expect
      .poll(
        () =>
          queryOne<{ n: number }>('SELECT count(*) AS n FROM Combatant WHERE initiative IS NULL')
            ?.n,
      )
      .toBe(0);
    await mg.page.getByRole('button', { name: /Rozpocznij walkę/ }).click();
    await expect.poll(() => turnStateOf(LAW.card) !== null, { timeout: 20_000 }).toBe(true);
    // Tura zaczyna się z bronią w ręku: Esc ją odkłada, kafel radia otwiera listę.
    await gosia.page.keyboard.press('Escape');
    const form = hud().locator('.hud-form');
    await expect(async () => {
      if (!(await form.isVisible())) await radio().click();
      await expect(form).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
    const since = lastMessageId();
    scriptDice([8, 2]);
    await hud()
      .locator('.hud-form')
      .getByRole('button', { name: /^Wezwij: / })
      .first()
      .click();
    const call = await rollAfter(since, 'Wezwanie Wsparcia', 'roll');
    expect(call.outcome?.success).toBe(false);
    await expect.poll(() => turnStateOf(LAW.card)?.action ?? null).not.toBeNull();
    scriptDice([]);
  });

  test('#84 STR-03 wezwanie bez figury w ładunku po wydanej Akcji dostaje odmowę', async () => {
    const before = lastMessageId();
    scriptDice([9, 1]);
    const ack = await emitAck(await gosia.socket(), 'character:backup-call', {
      characterId: characterId(LAW.card),
      level: 1,
    });
    scriptDice([]);
    expect(ack).toMatchObject({ ok: false, error: 'NO_ACTION_LEFT' });
    // Odmowa przed kośćmi: żadnej karty „Wezwanie Wsparcia”.
    expect(messagesAfter(before).filter((row) => row.kind === 'roll')).toEqual([]);
  });

  test('STR-14 licznik wezwań z odzewem stoi u MG, nie u gracza, i nie da się go wyzerować łatą', async () => {
    // Jedno wezwanie z odzewem (poza walką); nieudane i odmówione się nie liczą.
    expect(cardData<{ backupCalls?: number[] }>(LAW.card).backupCalls ?? []).toHaveLength(1);
    const forged = await emitAck(await gosia.socket(), 'character:update', {
      characterId: characterId(LAW.card),
      patch: { data: { backupCalls: [] } },
    });
    expect(forged).toMatchObject({ ok: false });
    const gmCard = await openSheet(mg, LAW.card);
    await expect(gmCard.getByTestId('backup-calls')).toContainText('dziś 1 · w tym tygodniu 1');
    await closeSheet(mg.page);
    const own = await openSheet(gosia, LAW.card);
    await expect(own.locator('.cp-role-strip')).toContainText('Wsparcie 4');
    await expect(own.getByTestId('backup-calls')).toHaveCount(0);
    await closeSheet(gosia.page);
  });

  test('STR-13 G31 ranga 5: Policja stanowa przyjeżdża z drugą bronią na karcie figury', async () => {
    // Ranga 4 z `role-start` nie sięga kategorii z drugą bronią — MG podnosi ją do 5
    // po zamknięciu walki (wezwanie poza walką nie kosztuje Akcji).
    expect((await emitAck(gm, 'combat:end', {})).ok).toBe(true);
    dataOf(
      await emitAck(gm, 'character:update', {
        characterId: characterId(LAW.card),
        patch: { data: { roleAbilityRank: 5 } },
      }),
      'ranga 5',
    );
    await expect(async () => {
      const form = hud().locator('.hud-form');
      if (!(await form.isVisible())) await radio().click();
      await expect(form.getByRole('button', { name: /^Wezwij: Policja stanowa/ })).toBeVisible({
        timeout: 1_000,
      });
    }).toPass({ timeout: 15_000 });
    const since = lastMessageId();
    scriptDice([3, 4]);
    await hud()
      .locator('.hud-form')
      .getByRole('button', { name: /^Wezwij: Policja stanowa/ })
      .click();
    const call = await rollAfter(since, 'Wezwanie Wsparcia', 'roll');
    expect(call.outcome?.success, JSON.stringify(call.outcome)).toBe(true);
    expect(pendingDice()).toBe('');
    const officer = 'Funkcjonariusz drogówki 1';
    await expect.poll(() => figures().includes(officer), { timeout: 15_000 }).toBe(true);
    const weapons = cardData<{ weapons: { name: string; compendiumId?: string }[] }>(
      officer,
    ).weapons;
    expect(weapons.map((row) => row.name)).toEqual(
      expect.arrayContaining(['Karabin szturmowy', 'Ciężki pistolet']),
    );
    expect(weapons.find((row) => row.name === 'Ciężki pistolet')?.compendiumId).toBeTruthy();
  });

  test('porządek: brak błędów konsoli', async () => {
    for (const actor of [mg, gosia]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
  });
});
