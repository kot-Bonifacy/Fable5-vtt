import type { Locator } from '@playwright/test';
import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { queryOne } from '../../fixtures/db.ts';
import { characterId } from '../../fixtures/nocna-zmiana.ts';
import { sceneByName } from '../../fixtures/regresja.ts';
import {
  CELL,
  ROLES,
  ROLE_SCENE,
  TARGET,
  breakdownRow,
  calledTest,
  cardData,
  dataOf,
  gmSocket,
  lastMessageId,
  rollAfter,
  seatRole,
  startFromRoleStart,
  tokenIdOf,
  turnStateOf,
} from '../../fixtures/role.ts';
import { centreCamera, clickOnMap } from '../../fixtures/scene.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { shakeCup } from '../../fixtures/table.ts';
import { closeSheet, nextTurn, openSheet } from '../../fixtures/walka.ts';
import { pendingDice, scriptDice } from '../../instance/instance.ts';

/**
 * Etap 71b — Solo, Zmysł Walki (s. 146). Wiersze macierzy: SOL-01, SOL-02
 * (#87), SOL-03 (#84), SOL-07, SOL-08, SOL-09, SOL-13, SOL-14. Błędy #84 i #87
 * naprawione w 71c0. SOL-10 (#83, Ogień ciągły) sprawdza `role-matrix.test.ts`.
 */

const SOLO = ROLES.solo;
const at = (column: number, row: number) => ({
  x: column * CELL + CELL / 2,
  y: row * CELL + CELL / 2,
});
const SOLO_AT = at(SOLO.column, 3);
const TARGET_AT = at(2, 7);

type Awareness = Record<string, number>;
const awareness = () => cardData<{ combatAwareness: Awareness }>(SOLO.card).combatAwareness;

test.describe.serial('@szybkie T71 Solo — Zmysł Walki', () => {
  let mg: Actor;
  let ada: Actor;
  let card: Locator;
  let gm: Socket;
  const panel = () => card.locator('[data-sheet-panel="combat-awareness"]');
  const hud = () => ada.page.getByRole('complementary', { name: 'Panel aktywnej postaci' });
  const plus = (scope: Locator, name: string) =>
    scope.getByRole('button', { name: `Dołóż punkty: ${name}`, exact: true });
  const minus = (scope: Locator, name: string) =>
    scope.getByRole('button', { name: `Zdejmij punkty: ${name}`, exact: true });

  test.beforeAll(async ({ cast }) => {
    await startFromRoleStart();
    ({ mg, player: ada, card } = await seatRole(cast, 'solo'));
    gm = await gmSocket();
  });

  test.afterAll(async ({ cast }) => {
    gm?.close();
    await cast.closeAll();
  });

  test('SOL-01 SOL-14 przydział do rangi i tylko na progach; gniazdo nie przyjmie więcej', async () => {
    await expect(panel()).toContainText('Wolne punkty: 4 z 4');
    await plus(panel(), 'Precyzyjny atak').click();
    await expect(panel()).toContainText('Wolne punkty: 1 z 4');
    // Następny próg Precyzyjnego ataku to 6, a Wyjście z opresji kosztuje 4.
    await expect(plus(panel(), 'Precyzyjny atak')).toBeDisabled();
    await expect(plus(panel(), 'Wyjście z opresji')).toBeDisabled();
    await plus(panel(), 'Wyczucie zagrożenia').click();
    await expect(panel()).toContainText('Wszystkie punkty rozdzielone');
    await panel().getByRole('button', { name: 'Zapisz przydział' }).click();
    await expect.poll(awareness).toEqual({ preciseAttack: 3, threatSense: 1 });

    const player = await ada.socket();
    for (const allocation of [
      { preciseAttack: 3, threatSense: 2 }, // ponad rangę
      { preciseAttack: 2, threatSense: 1 }, // liczba spoza progu
    ]) {
      const refused = await emitAck(player, 'character:combat-awareness', {
        characterId: characterId(SOLO.card),
        allocation,
      });
      expect(refused, JSON.stringify(allocation)).toMatchObject({ ok: false });
    }
    expect(awareness()).toEqual({ preciseAttack: 3, threatSense: 1 });
  });

  test('SOL-13 Wyczucie zagrożenia dokłada się do Testu Percepcji z wezwania MG', async () => {
    const roll = await calledTest(
      gm,
      ada,
      SOLO.card,
      { kind: 'skill', skillId: 'perception' },
      13,
      [5],
    );
    expect(breakdownRow(roll, 'Wyczucie zagrożenia')?.value, JSON.stringify(roll.breakdown)).toBe(
      1,
    );
    // INT 6 + Percepcja 4 + Wyczucie 1 + kość 5.
    expect(roll.total).toBe(16);
    expect(pendingDice()).toBe('');
  });

  test('próg powyżej 4: MG podnosi rangę do 8, Solo kupuje Wyjście z opresji obok Precyzyjnego ataku', async () => {
    dataOf(
      await emitAck(gm, 'character:update', {
        characterId: characterId(SOLO.card),
        patch: { data: { roleAbilityRank: 8 } },
      }),
      'ranga 8',
    );
    card = await openSheet(ada, SOLO.card);
    await expect(panel()).toContainText('Wolne punkty: 4 z 8');
    await plus(panel(), 'Wyjście z opresji').click();
    await expect(panel()).toContainText('Wszystkie punkty rozdzielone');
    await panel().getByRole('button', { name: 'Zapisz przydział' }).click();
    await expect.poll(awareness).toEqual({ preciseAttack: 3, threatSense: 1, luckyEscape: 4 });
    await closeSheet(ada.page);
  });

  test('SOL-02 SOL-08 „Przed walką” zmiana z karty jest darmowa; Błyskawiczna reakcja w inicjatywie', async () => {
    test.setTimeout(3 * 60_000);
    await centreCamera(ada.page, { x: SOLO_AT.x, y: (SOLO_AT.y + TARGET_AT.y) / 2 });
    dataOf(
      await emitAck(gm, 'combat:start', {
        sceneId: sceneByName(ROLE_SCENE).id,
        tokenIds: [tokenIdOf(SOLO.card), tokenIdOf(TARGET)],
      }),
      'combat:start',
    );
    await expect(ada.page.locator('.dice-cup')).toHaveAttribute('title', /inicjatyw/i);
    // Runda 0 z karty; z belki — test niżej (#87).
    card = await openSheet(ada, SOLO.card);
    await minus(panel(), 'Wyczucie zagrożenia').click();
    await plus(panel(), 'Błyskawiczna reakcja').click();
    await panel().getByRole('button', { name: 'Zapisz przydział' }).click();
    await expect.poll(awareness).toEqual({ preciseAttack: 3, fastReflexes: 1, luckyEscape: 4 });
    expect(turnStateOf(SOLO.card)?.action ?? null, 'runda 0 nie bierze Akcji').toBeNull();
    await closeSheet(ada.page);

    const since = lastMessageId();
    scriptDice([6]);
    await shakeCup(ada.page);
    const initiative = await rollAfter(since, 'Inicjatywa');
    // Karta rzutu łączy Cechę z premią w jednym wierszu: „Refleks (REF) + Błyskawiczna reakcja 1”.
    expect(
      breakdownRow(initiative, 'Refleks (REF) + Błyskawiczna reakcja 1')?.value,
      JSON.stringify(initiative.breakdown),
    ).toBe(8);
    // REF 7 + Błyskawiczna reakcja 1 + kość 6.
    expect(initiative.total).toBe(14);
  });

  test('#87 SOL-02 „Przed walką” kafel Zmysłu Walki w belce otwiera przydział', async () => {
    await hud().locator('.hud-slot', { hasText: 'Zmysł Walki' }).click();
    const form = hud().locator('.hud-form');
    await expect(form).toBeVisible({ timeout: 3_000 });
    await form.getByRole('button', { name: 'Zamknij', exact: true }).click();
    await expect(form).toHaveCount(0);
  });

  test('SOL-03 w trakcie walki zapis z belki kosztuje Akcję', async () => {
    const started = queryOne<{ id: string }>(
      `SELECT m.id FROM Combatant m JOIN Token t ON t.id = m.tokenId WHERE t.name = ?`,
      TARGET,
    )!;
    dataOf(
      await emitAck(gm, 'combat:set-initiative', { combatantId: started.id, initiative: 1 }),
      'inicjatywa Manekina',
    );
    await mg.page.getByRole('button', { name: /Rozpocznij walkę/ }).click();
    await expect.poll(() => turnStateOf(SOLO.card) !== null, { timeout: 20_000 }).toBe(true);
    // Tura zaczyna się z bronią w ręku — Esc ją odkłada, potem kafel Zmysłu Walki.
    await ada.page.keyboard.press('Escape');
    await hud().locator('.hud-slot', { hasText: 'Zmysł Walki' }).click();
    const form = hud().locator('.hud-form');
    await minus(form, 'Błyskawiczna reakcja').click();
    await plus(form, 'Wyczucie zagrożenia').click();
    await form.getByRole('button', { name: 'Zapisz przydział' }).click();
    await expect.poll(awareness).toEqual({ preciseAttack: 3, threatSense: 1, luckyEscape: 4 });
    await expect.poll(() => turnStateOf(SOLO.card)?.action ?? null).not.toBeNull();
  });

  test('#84 SOL-03 zdarzenie bez figury w ładunku też płaci Akcję', async () => {
    // Akcja tej Tury już wydana: drugi zapis musi dostać odmowę, a nie przejść.
    const ack = await emitAck(await ada.socket(), 'character:combat-awareness', {
      characterId: characterId(SOLO.card),
      allocation: { preciseAttack: 3, fastReflexes: 1, luckyEscape: 4 },
    });
    expect(ack).toMatchObject({ ok: false, error: 'NO_ACTION_LEFT' });
    expect(awareness()).toEqual({ preciseAttack: 3, threatSense: 1, luckyEscape: 4 });
  });

  test('SOL-07 SOL-09 runda 2: jedynka nie odejmuje (Wyjście z opresji), Precyzyjny atak +1 w rozbiciu', async () => {
    test.setTimeout(3 * 60_000);
    await nextTurn(mg);
    await nextTurn(mg);
    await expect.poll(() => queryOne<{ round: number }>('SELECT round FROM Combat')?.round).toBe(2);
    expect(turnStateOf(SOLO.card)?.action ?? null).toBeNull();
    // Tura zaczyna się z pierwszą bronią w ręku („W ręku — kliknij cel na mapie”).
    const pistol = hud().locator('.hud-slot', { hasText: 'Ciężki pistolet' });
    if (!(await hud().getByText('kliknij cel na mapie').isVisible())) await pistol.click();
    await expect(hud().getByText('kliknij cel na mapie')).toBeVisible();
    const since = lastMessageId();
    scriptDice([1, 7]);
    await clickOnMap(ada.page, TARGET_AT);
    await shakeCup(ada.page);
    const attack = await rollAfter(since, 'Ciężki pistolet');
    expect(breakdownRow(attack, 'Precyzyjny atak')?.value, JSON.stringify(attack.breakdown)).toBe(
      1,
    );
    // Jedynka zostaje jedynką: druga kość (7) nie spadła na krytyczną porażkę.
    expect(pendingDice()).toBe('7');
    scriptDice([]);
    test.info().annotations.push({ type: 'karta ataku', description: JSON.stringify(attack) });
    for (const actor of [mg, ada]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
  });
});
