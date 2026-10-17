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
 * T8c, Zdolności Ról spoza scenariusza (`testy.md` 6.4): scenariusz gra Solo
 * (Kowal) i Netrunnerkę z Medycyną (Iskra), więc siedem pozostałych Zdolności
 * nikt dotąd nie kliknął w przeglądarce. Nowy gracz Kuba dostaje od MG jedną
 * kartę wieloklasową (Rocker 2 — Rola bieżąca — oraz Media, Nomada, Fixer,
 * Stróż Prawa, Korpo i Technik jako dawne Role): każda dawna Rola zachowuje
 * swoją Zdolność (wieloklasowość, etap 29b), więc wszystkie panele stoją na
 * jednej karcie. Przygotowanie karty idzie gniazdem MG — to nie przedmiot testu.
 * Do tego Reputacja z Konfrontacją i styl życia z rozliczeniem miesiąca.
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
  fabrication: Record<string, number>;
  team: { characterId: string; loyalty: number }[];
  haggle: unknown;
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

test.describe.serial('T8c Zdolności: siedem Ról poza scenariuszem, Reputacja, styl życia', () => {
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

  test('Efekt Charyzmy (Rocker 2): fani na rzut z kubka; prośby do dużej grupy nie ma jeszcze w zasięgu', async () => {
    const strip = card.locator('.cp-role-strip');
    await expect(strip).toContainText('Efekt Charyzmy 2');
    await strip.getByRole('button', { name: 'Poproś fanów o przysługę' }).click();
    await expect(
      strip.getByRole('button', { name: 'Rzuć Efekt Charyzmy: Duża grupa' }),
    ).toBeDisabled();
    await strip.getByRole('button', { name: 'Zrób z nich fanów' }).click();
    const since = lastMessageId();
    scriptDice([6]);
    await strip.getByRole('button', { name: 'Rzuć Efekt Charyzmy: Pojedynczy fan' }).click();
    await shakeCup(kuba.page);
    await expect
      .poll(() => messagesAfter(since).filter((m) => m.authorId === userId('Kuba')).length, {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
    expect(pendingDice()).toBe('');
    test.info().annotations.push({
      type: 'karta Charyzmy',
      description: JSON.stringify(messagesAfter(since)),
    });
  });

  test('Wiarygodność (Media 4): „Publikuj” rzuca Rzetelność; Pogłoski tylko u MG', async () => {
    const strip = card.locator('.cp-role-strip');
    await expect(strip).toContainText('Wiarygodność 4');
    await expect(strip.getByRole('button', { name: 'Pogłoski' })).toHaveCount(0);
    await strip.getByLabel('Dowody w materiale').selectOption({ index: 1 });
    const since = lastMessageId();
    scriptDice([2]);
    await strip.getByRole('button', { name: 'Publikuj' }).click();
    await shakeCup(kuba.page);
    await expect
      .poll(() => messagesAfter(since).filter((m) => m.authorId === userId('Kuba')).length, {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
    expect(pendingDice()).toBe('');
    const gmCard = await openSheet(mg, CARD);
    await expect(
      gmCard.locator('.cp-role-strip').getByRole('button', { name: 'Pogłoski' }),
    ).toBeVisible();
    await closeSheet(mg.page);
  });

  test('Moto (Nomada 2): dwa wpisy Taboru, trzeci zablokowany — także dla gniazda', async () => {
    const strip = card.locator('.cp-role-strip');
    const add = strip.getByRole('button', { name: 'Dołóż wpis' });
    await add.click();
    await expect.poll(() => sheet().fleet.length).toBe(1);
    await add.click();
    await expect.poll(() => sheet().fleet.length).toBe(2);
    await expect(add).toBeDisabled();
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

  test('Znajomości (Fixer 4): targ przeciw drugiej stronie; nieznanego targu serwer nie przyjmie', async () => {
    const strip = card.locator('.cp-role-strip');
    await expect(strip).toContainText('Znajomości 4');
    const since = lastMessageId();
    scriptDice([10, 1]);
    await strip
      .getByRole('button', { name: /^Targuj się: / })
      .first()
      .click();
    await expect(kuba.page.locator('.notice', { hasText: /Targ dobity|nie ustąpiła/ })).toBeVisible(
      {
        timeout: 20_000,
      },
    );
    test
      .info()
      .annotations.push(
        { type: 'targ', description: JSON.stringify(sheet().haggle) },
        { type: 'czat po targu', description: JSON.stringify(messagesAfter(since)) },
        { type: 'kości w kolejce', description: pendingDice() },
      );
    const refused = await emitAck(await kuba.socket(), 'character:haggle', {
      characterId: cardId,
      dealId: 'nie-ma-takiego',
      opponent: 0,
    });
    expect(refused).toMatchObject({ ok: false });
  });

  test('Wsparcie (Stróż Prawa 4): wezwanie odebrane, karta na czacie; poziom ponad rangę odmówiony', async () => {
    const strip = card.locator('.cp-role-strip');
    await expect(strip).toContainText('Wsparcie 4');
    const since = lastMessageId();
    scriptDice([2, 3]);
    await strip
      .getByRole('button', { name: /^Wezwij: / })
      .first()
      .click();
    await expect(kuba.page.locator('.notice', { hasText: 'Odsiecz w drodze' })).toBeVisible({
      timeout: 20_000,
    });
    expect(pendingDice()).toBe('');
    expect(messagesAfter(since).map((m) => m.text)).toContain('Wezwanie Wsparcia');
    const refused = await emitAck(await kuba.socket(), 'character:backup-call', {
      characterId: cardId,
      level: 9,
    });
    expect(refused).toEqual({ ok: false, error: 'BACKUP_LEVEL_TOO_HIGH' });
  });

  test('Praca Zespołowa (Korpo 4): HR zatrudnia pracownika z własną kartą, Test Lojalności; obcy gracz nie zatrudni', async ({
    cast,
  }) => {
    test.setTimeout(3 * 60_000);
    const strip = card.locator('.cp-role-strip');
    await expect(strip).toContainText('Praca Zespołowa 4');
    await strip.getByRole('button', { name: 'Poproś HR o pracownika' }).click();
    await strip.getByLabel('Imię pracownika').fill('Jan Wiśniewski');
    await strip.getByRole('button', { name: 'Zatrudnij' }).click();
    await expect.poll(() => sheet().team.length, { timeout: 20_000 }).toBe(1);
    const member = sheet().team[0]!;
    expect(
      queryOne<{ name: string }>('SELECT name FROM Character WHERE id = ?', member.characterId)
        ?.name,
    ).toBe('Jan Wiśniewski');
    // Karta pracownika jest NPC-em MG („członków zespołu kontroluje MG”, s. 154) —
    // imię niesie wpis zespołu (#74, test niżej).
    await expect(strip.locator('.team-row')).toHaveCount(1);
    // Test Lojalności rzuca MG (zdarzenie MG) — gracz nie ma guzików (#75, test
    // niżej), a podrobione zdarzenie dostaje odmowę.
    expect(
      await emitAck(await kuba.socket(), 'character:team-loyalty', {
        characterId: cardId,
        memberId: member.characterId,
        test: true,
      }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
    const since = lastMessageId();
    const gmCard = await openSheet(mg, CARD);
    await gmCard
      .locator('.cp-role-strip')
      .getByRole('button', { name: 'Test Lojalności: Jan Wiśniewski' })
      .click();
    await expect.poll(() => messagesAfter(since).length, { timeout: 20_000 }).toBeGreaterThan(0);
    test.info().annotations.push({
      type: 'Test Lojalności MG',
      description: JSON.stringify(messagesAfter(since)),
    });
    await closeSheet(mg.page);
    card = await openSheet(kuba, CARD);

    // Odmowa: Marek zatrudnia na cudzej karcie.
    const marek = await cast.gracz(
      'Marek',
      PLAYER_ENGINE,
      await createInvitation(mg, campaignId(), 'Marek'),
    );
    const refused = await emitAck(await marek.socket(), 'character:team-hire', {
      characterId: cardId,
      professionId: 'bodyguard',
      name: 'Podstawiony',
    });
    expect(refused).toMatchObject({ ok: false });
    expect(sheet().team.length).toBe(1);
    await marek.close();
  });

  test('#74 Kuba widzi imię pracownika, którego sam nazwał przy zatrudnieniu', async () => {
    await expect(card.locator('.cp-role-strip .team-row')).toContainText('Jan Wiśniewski', {
      timeout: 3_000,
    });
  });

  test('#75 gracz nie dostaje przycisków Lojalności, które serwer zostawia MG', async () => {
    await expect(
      card.locator('.cp-role-strip').getByRole('button', { name: /^Test Lojalności: / }),
    ).toHaveCount(0, { timeout: 3_000 });
  });

  test('Twórca (Technik 4): punkty w Specjalizacje do wyczerpania puli; więcej serwer nie przyjmie', async () => {
    const strip = card.locator('.cp-role-strip');
    const fabrication = strip.locator('[data-sheet-panel="fabrication"]');
    await expect(fabrication).toContainText('Do rozdzielenia');
    const plus = fabrication.getByRole('button', { name: /^Dołóż punkt: / }).first();
    for (let guard = 0; guard < 12 && (await plus.isEnabled()); guard += 1) {
      const before = JSON.stringify(sheet().fabrication);
      await plus.click();
      await expect.poll(() => JSON.stringify(sheet().fabrication)).not.toBe(before);
    }
    await expect(plus).toBeDisabled();
    const spent = Object.values(sheet().fabrication).reduce((a, b) => a + b, 0);
    expect(spent).toBeGreaterThan(0);
    const [first] = Object.keys(sheet().fabrication);
    const refused = await emitAck(await kuba.socket(), 'character:update', {
      characterId: cardId,
      patch: { data: { fabrication: { ...sheet().fabrication, [first!]: 99 } } },
    });
    expect(refused).toMatchObject({ ok: false });
    test.info().annotations.push({
      type: 'Twórca',
      description: `${JSON.stringify(sheet().fabrication)} — ${await fabrication.locator('.awareness-head').textContent()}`,
    });
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
