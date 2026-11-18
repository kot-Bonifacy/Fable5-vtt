import type { Locator } from '@playwright/test';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { characterId, campaignId, userId } from '../../fixtures/nocna-zmiana.ts';
import {
  PLAYER_ENGINE,
  query,
  queryOne,
  sceneByName,
  seat,
  startFromPoT6,
} from '../../fixtures/regresja.ts';
import { openTableRituals } from '../../fixtures/scene.ts';
import { DEAD_GATEWAY } from '../../fixtures/security.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { createInvitation, shakeCup } from '../../fixtures/table.ts';
import { closeSheet, openSheet } from '../../fixtures/walka.ts';
import { pendingDice, scriptDice } from '../../instance/instance.ts';

/**
 * T8c, wieloklasowość (`testy.md` 6.4): nowy gracz Kuba dostaje od MG jedną
 * kartę wieloklasową (Rocker 2 — Rola bieżąca — oraz Media, Nomada, Fixer,
 * Stróż Prawa, Korpo i Technik jako dawne Role). Każda dawna Rola zachowuje
 * swoją Zdolność z rangą, przy której ją zostawiono (etap 29b), więc wszystkie
 * panele stoją na jednej karcie — tego pilnuje ten plik: panele, próg Moto
 * z rangi dawnej Roli i układ siatki paneli (#76, #77). Pojedyncze Zdolności
 * sprawdzają od etapu 71h specyfikacje `52-role/t71-*` (jedna Rola na kartę,
 * start z `role-start`); stąd wypadły ich duplikaty. Przygotowanie karty idzie
 * gniazdem MG — to nie przedmiot testu. Do tego Reputacja z Konfrontacją i styl
 * życia z rozliczeniem miesiąca.
 */

const CARD = 'Wielorak';
const FORMER = [
  { roleId: 'media', rank: 4 },
  { roleId: 'nomad', rank: 2 },
  { roleId: 'fixer', rank: 4 },
  { roleId: 'lawman', rank: 4 },
  { roleId: 'exec', rank: 4 },
  { roleId: 'tech', rank: 4 },
];

interface Sheet {
  fleet: unknown[];
  reputationSources: { level: number }[];
  lifestyle: { level: string; housing: string } | null;
  eddies: number;
}

const sheet = (): Sheet =>
  JSON.parse(
    queryOne<{ data: string }>('SELECT data FROM Character WHERE name = ?', CARD)!.data,
  ) as Sheet;

/** Wiersze czatu od danego id w górę (rzuty i karty Zdolności). */
const messagesAfter = (id: number) =>
  query<{ id: number; kind: string; text: string; authorId: string }>(
    'SELECT id, kind, text, authorId FROM ChatMessage WHERE id > ? ORDER BY id',
    id,
  );
const lastMessageId = () =>
  queryOne<{ id: number | null }>('SELECT max(id) AS id FROM ChatMessage')!.id ?? 0;

test.describe
  .serial('T8c Wieloklasowość: siedem Zdolności na jednej karcie, Reputacja, styl życia', () => {
  let mg: Actor;
  let kuba: Actor;
  let card: Locator;
  let cardId: string;

  test.beforeAll(async () => {
    await startFromPoT6(DEAD_GATEWAY);
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('start z po-T6: Kuba dołącza, MG daje mu kartę wieloklasową i figurę w „Knajpie”', async ({
    cast,
  }) => {
    test.setTimeout(3 * 60_000);
    mg = (await seat(cast, [])).mg;
    kuba = await cast.gracz(
      'Kuba',
      PLAYER_ENGINE,
      await createInvitation(mg, campaignId(), 'Kuba'),
    );
    const gm = await mg.socket();
    expect(
      await emitAck(gm, 'character:create', { name: CARD, ownerId: userId('Kuba') }),
    ).toMatchObject({ ok: true });
    cardId = characterId(CARD);
    const updated = await emitAck(gm, 'character:update', {
      characterId: cardId,
      patch: {
        data: {
          roleId: 'rockerboy',
          roleAbilityRank: 2,
          formerRoles: FORMER,
          eddies: 3_000,
          lifestyle: { level: 'kibble', housing: 'container' },
        },
      },
    });
    expect(updated, JSON.stringify(updated)).toMatchObject({ ok: true });
    const knajpa = sceneByName('Knajpa');
    const placed = await emitAck(gm, 'token:create', {
      sceneId: knajpa.id,
      name: CARD,
      x: 9 * knajpa.gridSizePx,
      y: 8 * knajpa.gridSizePx,
      ownerId: userId('Kuba'),
      characterId: cardId,
    });
    expect(placed, JSON.stringify(placed)).toMatchObject({ ok: true });
    card = await openSheet(kuba, CARD);
    await expect(card.locator('.cp-role-strip')).toBeVisible();
  });

  test('Rola bieżąca i sześć dawnych: siedem paneli Zdolności z rangami na jednej karcie', async () => {
    const strip = card.locator('.cp-role-strip');
    for (const label of [
      'Efekt Charyzmy 2',
      'Wiarygodność 4',
      'Moto 2',
      'Znajomości 4',
      'Wsparcie 4',
      'Praca Zespołowa 4',
      'Twórca 4',
    ]) {
      await expect(strip, label).toContainText(label);
    }
    // Pogłoski rzuca MG — także wtedy, gdy Media to dawna Rola gracza.
    await expect(strip.getByRole('button', { name: 'Pogłoski' })).toHaveCount(0);
  });

  test('Moto (dawna Nomada 2): dwa wpisy Taboru z rangi dawnej Roli, trzeci zablokowany — także dla gniazda', async () => {
    const strip = card.locator('.cp-role-strip');
    // Od 65a wpis Taboru to pojazd albo ulepszenie w nim (etykiety z 71b).
    const vehicle = strip.getByRole('button', { name: 'Dołóż pojazd' });
    const upgrade = strip.getByRole('button', { name: 'Dołóż ulepszenie' });
    await vehicle.click();
    await expect.poll(() => sheet().fleet.length).toBe(1);
    await expect(upgrade).toBeEnabled({ timeout: 15_000 });
    await upgrade.click();
    await expect.poll(() => sheet().fleet.length).toBe(2);
    await expect(vehicle).toBeDisabled();
    await expect(upgrade).toBeDisabled();
    await expect(strip).toContainText('Tabor skompletowany');
    const fleet = sheet().fleet;
    const refused = await emitAck(await kuba.socket(), 'character:update', {
      characterId: cardId,
      patch: {
        data: {
          fleet: [...fleet, { id: 'trzeci', kind: 'vehicle', name: 'Trzeci', level: 1, notes: '' }],
        },
      },
    });
    expect(refused).toMatchObject({ ok: false });
    expect(sheet().fleet.length).toBe(2);
  });

  test('#76 ✕ Taboru mieści się w karcie Moto; #77 puste pola siatki Zdolności nie świecą czerwienią', async () => {
    const strip = card.locator('.cp-role-strip');
    const fleetCard = strip.locator('[data-sheet-panel="fleet"]');
    const cardBox = (await fleetCard.boundingBox())!;
    for (const button of await fleetCard.getByRole('button', { name: /^Usuń z Taboru/ }).all()) {
      const box = (await button.boundingBox())!;
      expect(box.x + box.width, '✕ wystaje poza kartę Moto').toBeLessThanOrEqual(
        cardBox.x + cardBox.width,
      );
    }
    // Ostatni rząd paneli wypełnia całą szerokość pasa: między kartami zostają
    // tylko szczeliny `gap`, żadnej pustej komórki w czerwieni (#77).
    const rows = await strip.locator('.cp-role-cards').evaluate((grid) => {
      const inner = grid.getBoundingClientRect();
      const style = getComputedStyle(grid);
      const right = inner.right - parseFloat(style.paddingRight);
      const byTop = new Map<number, number>();
      for (const child of Array.from(grid.children)) {
        const box = child.getBoundingClientRect();
        const top = Math.round(box.top);
        byTop.set(top, Math.max(byTop.get(top) ?? 0, box.right));
      }
      return [...byTop.values()].map((edge) => right - edge);
    });
    expect(rows.length).toBeGreaterThan(1);
    for (const gap of rows) expect(gap, 'pusty kawałek rzędu paneli').toBeLessThan(2);
  });

  test('Reputacja i Konfrontacja: MG przyznaje wyczyn, Kuba staje Zbirowi, MG odpowiada kubkiem, Zbir się wycofuje', async () => {
    test.setTimeout(3 * 60_000);
    // Bez Reputacji gracz nie ma sekcji Reputacji na karcie (Konfrontacja — z celownika).
    // Reputacja stoi na stronie „Ścieżka Życia”.
    await card.getByRole('button', { name: 'Ścieżka Życia', exact: true }).click();
    await expect(card.locator('.sheet-reputation')).toHaveCount(0);
    const gmCard = await openSheet(mg, CARD);
    await gmCard.getByRole('button', { name: 'Ścieżka Życia', exact: true }).click();
    await gmCard.getByRole('button', { name: '+ Wyczyn' }).click();
    await expect.poll(() => sheet().reputationSources.length).toBe(1);
    await gmCard.locator('.reputation-note').fill('Koncert w Knajpie');
    await expect
      .poll(() => (sheet().reputationSources[0] as { note?: string }).note)
      .toBe('Koncert w Knajpie');
    await closeSheet(mg.page);

    const reputation = card.locator('.sheet-reputation');
    await expect(reputation).toContainText('Reputacja 1');
    await expect(reputation).toContainText('Koncert w Knajpie');
    await expect(reputation.locator('input')).toHaveCount(0);

    const since = lastMessageId();
    scriptDice([9]);
    await reputation.getByRole('button', { name: /Postaw się/ }).click();
    await reputation
      .locator('.facedown-picker-row', { hasText: /^Zbir$|Zbir/ })
      .first()
      .getByRole('button', { name: 'Zmierz się' })
      .click();
    await shakeCup(kuba.page);
    await expect
      .poll(() => messagesAfter(since).filter((m) => m.authorId === userId('Kuba')).length, {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
    expect(pendingDice()).toBe('');

    // MG odpowiada za Zbira z karty na czacie, potem wybiera „Wycofaj się”.
    await mg.page.getByRole('button', { name: 'Czat', exact: true }).click();
    const contest = mg.page.locator('.chat-message', { hasText: 'Konfrontacja' }).last();
    await expect(contest).toBeVisible({ timeout: 20_000 });
    const answer = contest.locator('.chat-attack-actions button').first();
    if (await answer.isVisible()) {
      scriptDice([1]);
      await answer.click();
      await shakeCup(mg.page);
      await expect.poll(pendingDice, { timeout: 15_000 }).toBe('');
    }
    const withdraw = mg.page.getByRole('button', { name: 'Wycofaj się' }).last();
    await expect(withdraw).toBeVisible({ timeout: 20_000 });
    await withdraw.click();
    await expect(mg.page.getByRole('button', { name: 'Wycofaj się' })).toHaveCount(0, {
      timeout: 10_000,
    });
    test.info().annotations.push({
      type: 'Konfrontacja na czacie',
      description: JSON.stringify(messagesAfter(since)),
    });

    // Odmowa: rozstrzygniętej Konfrontacji nie da się odpierać drugi raz.
    const contestId = messagesAfter(since).find((m) => m.authorId === userId('Kuba'))!.id;
    const refused = await emitAck(await mg.socket(), 'facedown:resist', {
      messageId: contestId,
      characterId: characterId('Zbir'),
    });
    expect(refused).toMatchObject({ ok: false });
  });

  test('styl życia: Kuba przenosi się z kontenera, MG rozlicza miesiąc; gracz rozliczenia nie uruchomi', async () => {
    await card.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    await card.getByLabel('Zakwaterowanie').selectOption('studio');
    await expect.poll(() => sheet().lifestyle?.housing).toBe('studio');
    await expect(
      card.locator('.sheet-hint', { hasText: 'Pierwszego dnia miesiąca' }),
    ).toBeVisible();
    const refused = await emitAck(await kuba.socket(), 'economy:settle', {});
    expect(refused).toMatchObject({ ok: false });
    const before = sheet().eddies;
    await closeSheet(kuba.page);
    await mg.page.getByRole('button', { name: 'Postacie', exact: true }).click();
    await openTableRituals(mg.page);
    await mg.page.getByRole('button', { name: /Rozlicz miesiąc/ }).click();
    await expect.poll(() => sheet().eddies, { timeout: 15_000 }).toBeLessThan(before);
    const ledger = query<{ kind: string; amount: number; label: string }>(
      'SELECT kind, amount, label FROM LedgerEntry WHERE characterId = ? ORDER BY id DESC LIMIT 2',
      cardId,
    );
    test.info().annotations.push({ type: 'księga Wieloraka', description: JSON.stringify(ledger) });
    expect(ledger.length).toBeGreaterThan(0);
    for (const actor of [mg, kuba]) {
      expect(actor.unexpectedErrors(), actor.name).toEqual([]);
    }
  });
});
