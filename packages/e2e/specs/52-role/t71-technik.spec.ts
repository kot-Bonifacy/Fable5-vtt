import type { Locator } from '@playwright/test';
import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { queryOne } from '../../fixtures/db.ts';
import { characterId } from '../../fixtures/nocna-zmiana.ts';
import {
  ROLES,
  breakdownRow,
  calledTest,
  cardData,
  dataOf,
  gmSocket,
  lastMessageId,
  rollAfter,
  seatRole,
  startFromRoleStart,
} from '../../fixtures/role.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { shakeCup } from '../../fixtures/table.ts';
import { closeSheet, openSheet } from '../../fixtures/walka.ts';
import { pendingDice, scriptDice } from '../../instance/instance.ts';

/**
 * Etap 71b — Technik, Twórca (s. 147–149). Wiersze macierzy: TEC-01, TEC-02,
 * TEC-04 (#85), TEC-06 (#86), TEC-10, TEC-11. Od 71c0 Prowizorka to Test przez
 * kubek, a zużyta łata blokuje następną do pełnej naprawy.
 * Od 71c2: zwykła naprawa Testem (TEC-19, G11) z czasem dla zegara MG, montaż
 * ulepszenia auta Technikiem (TEC-18, G10) i bieżące OB gracza tylko w dół (P5).
 * Od 71d1: Prowizorka puszcza sama z zegarem świata (TEC-05, G12), a skutki
 * Ulepszania stempluje MG przy przedmiocie (TEC-12, TEC-13, G14, G15).
 * Od 71d2: Ulepszanie przedmiotu drużyny i Wytwarzanie z Kompendium to Testy
 * przez kubek w robotach drużyny (TEC-03, TEC-07–TEC-09, G13); Wynajdywanie
 * zostaje u MG (TEC-20).
 * Od 71h: znaleziony wszczep po „Łagodniejszej cyborgizacji” kosztuje przy
 * montażu 1k6 mniej (TEC-16, G16).
 */

const TECH = ROLES.tech;
type Armor = {
  id: string;
  sp: number;
  spCurrent: number;
  fieldRepair?: unknown;
  fieldRepairSpent?: boolean;
  upgrade?: unknown;
};
const armor = () =>
  cardData<{ armor: Armor[] }>(TECH.card).armor.find((row) => row.id === 'r71-kurtka')!;
const fabrication = () => cardData<{ fabrication: Record<string, number> }>(TECH.card).fabrication;
const eddies = () => cardData<{ eddies: number }>(TECH.card).eddies;
const gameTime = () =>
  queryOne<{ gameTime: number }>(
    'SELECT c.gameTime FROM Campaign c JOIN Character ch ON ch.campaignId = c.id WHERE ch.id = ?',
    characterId(TECH.card),
  )!.gameTime;
const techCar = () => {
  const row = queryOne<{ id: string; name: string; system: string }>(
    'SELECT id, name, system FROM Vehicle WHERE ownerCharacterId = ?',
    characterId(TECH.card),
  )!;
  return {
    ...row,
    stats: JSON.parse(row.system) as { upgrades: { upgradeId: string; techUpgrade?: true }[] },
  };
};

test.describe.serial('@szybkie T71 Technik — Twórca', () => {
  let mg: Actor;
  let bartek: Actor;
  let card: Locator;
  let gm: Socket;
  const panel = () => card.locator('[data-sheet-panel="fabrication"]');
  const plus = (name: string) =>
    panel().getByRole('button', { name: `Dołóż punkt: ${name}`, exact: true });

  test.beforeAll(async ({ cast }) => {
    await startFromRoleStart();
    ({ mg, player: bartek, card } = await seatRole(cast, 'tech'));
    gm = await gmSocket();
  });

  test.afterAll(async ({ cast }) => {
    gm?.close();
    await cast.closeAll();
  });

  test('TEC-01 punkt na poziom w dwóch różnych Specjalizacjach: 4 + 4 i koniec puli', async () => {
    await expect(panel()).toContainText('Do rozdzielenia: 8 z 8');
    for (const name of ['Naprawa', 'Ulepszanie']) {
      for (let guard = 0; guard < 8 && (await plus(name).isEnabled()); guard += 1) {
        const before = JSON.stringify(fabrication());
        await plus(name).click();
        await expect.poll(() => JSON.stringify(fabrication())).not.toBe(before);
      }
    }
    expect(fabrication()).toEqual({ repair: 4, upgrade: 4 });
    await expect(panel()).toContainText('Wszystkie punkty rozdzielone');
    const refused = await emitAck(await bartek.socket(), 'character:update', {
      characterId: characterId(TECH.card),
      patch: { data: { fabrication: { repair: 5, upgrade: 3 } } },
    });
    expect(refused).toMatchObject({ ok: false });
    expect(fabrication()).toEqual({ repair: 4, upgrade: 4 });
  });

  test('TEC-02 Naprawa dokłada poziom do Testu Podstaw techniki', async () => {
    const roll = await calledTest(
      gm,
      bartek,
      TECH.card,
      { kind: 'skill', skillId: 'basic-tech' },
      13,
      [4],
    );
    expect(breakdownRow(roll, 'Naprawa')?.value, JSON.stringify(roll.breakdown)).toBe(4);
    // TECH 8 + Podstawy techniki 6 + Naprawa 4 + kość 4.
    expect(roll.total).toBe(22);
    expect(pendingDice()).toBe('');
  });

  test('#85 TEC-04 Prowizorka to Test przez kubek: PT naprawy kurtki (Premium 17), Naprawa w rozbiciu', async () => {
    card = await openSheet(bartek, TECH.card);
    await card.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    const since = lastMessageId();
    scriptDice([5]);
    await card.getByRole('button', { name: 'Prowizorka', exact: true }).click();
    await shakeCup(bartek.page);
    const roll = await rollAfter(since, 'Prowizorka', 'roll');
    expect(breakdownRow(roll, 'Naprawa')?.value, JSON.stringify(roll.breakdown)).toBe(4);
    // TECH 8 + Podstawowe naprawy 6 + Naprawa 4 + kość 5 = 23 > PT 17 (Premium, s. 140).
    expect(roll.total).toBe(23);
    expect(roll.outcome?.success, JSON.stringify(roll.outcome)).toBe(true);
    expect(roll.outcome?.detail).toContain('PT 17');
    expect(pendingDice()).toBe('');
    await expect.poll(() => armor().spCurrent).toBe(11);
    expect(armor().fieldRepair).toBeTruthy();
  });

  test('#86 TEC-06 „Koniec prowizorki” zostawia ślad — drugiej łaty nie ma do pełnej naprawy', async () => {
    await card.getByRole('button', { name: 'Koniec prowizorki', exact: true }).click();
    await expect.poll(() => armor().spCurrent).toBe(7);
    expect(armor().fieldRepair ?? null).toBeNull();
    expect(armor().fieldRepairSpent).toBe(true);
    await expect(card.getByRole('button', { name: 'Prowizorka', exact: true })).toBeDisabled();
    const ack = await emitAck(await bartek.socket(), 'character:roll', {
      characterId: characterId(TECH.card),
      request: { kind: 'fieldRepair', fieldRepairArmorRowId: 'r71-kurtka' },
      visibility: 'public',
    });
    expect(ack).toEqual({ ok: false, error: 'PATCH_SPENT' });
    // Stara droga bez rzutu też odmawia.
    const direct = await emitAck(await bartek.socket(), 'character:field-repair', {
      characterId: characterId(TECH.card),
      armorRowId: 'r71-kurtka',
    });
    expect(direct).toEqual({ ok: false, error: 'FIELD_REPAIR_NEEDS_ROLL' });
  });

  test('TEC-10 TEC-11 Ulepszanie +1 OB klika MG, raz na przedmiot', async () => {
    await expect(card.locator('.armor-actions')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Ulepsz: +1 OB' })).toHaveCount(0);
    await closeSheet(bartek.page);
    const gmCard = await openSheet(mg, TECH.card);
    await gmCard.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    await gmCard.getByRole('button', { name: 'Ulepsz: +1 OB' }).click();
    await expect.poll(() => armor().sp).toBe(12);
    expect(armor().upgrade).toBeTruthy();
    await expect(gmCard.getByRole('button', { name: 'Ulepsz: +1 OB' })).toHaveCount(0);
    await closeSheet(mg.page);
    for (const actor of [mg, bartek]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
  });

  // ───────────── 71c2: naprawa i montaż Technikiem (G11, G10, P5) ─────────────

  test('P5 gracz bieżące OB własnego pancerza tylko obniża', async () => {
    const row = armor();
    const refused = await emitAck(await bartek.socket(), 'character:update', {
      characterId: characterId(TECH.card),
      patch: {
        data: {
          armor: cardData<{ armor: Armor[] }>(TECH.card).armor.map((entry) =>
            entry.id === row.id ? { ...entry, spCurrent: entry.spCurrent + 1 } : entry,
          ),
        },
      },
    });
    expect(refused).toEqual({ ok: false, error: 'ITEM_LOCKED' });
    expect(armor().spCurrent).toBe(row.spCurrent);
  });

  test('TEC-19 G11 „Napraw” przy pancerzu: Test przez kubek, pełne OB, ślad łaty schodzi, MG przesuwa zegar', async () => {
    card = await openSheet(bartek, TECH.card);
    await card.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    const since = lastMessageId();
    scriptDice([5]);
    await card.getByRole('button', { name: 'Napraw', exact: true }).click();
    await shakeCup(bartek.page);
    const roll = await rollAfter(since, 'Naprawa', 'roll');
    // TECH 8 + Podstawowe naprawy 6 + Naprawa 4 + kość 5 = 23 > PT 17 (Premium, s. 140).
    expect(roll.total).toBe(23);
    expect(breakdownRow(roll, 'Naprawa 4')?.value).toBe(4);
    expect(roll.outcome?.success, JSON.stringify(roll.outcome)).toBe(true);
    expect(roll.outcome?.detail).toContain('PT 17');
    expect(roll.clock).toMatchObject({ minutes: 24 * 60 });
    expect(pendingDice()).toBe('');
    await expect.poll(() => armor().spCurrent).toBe(armor().sp);
    expect(armor().fieldRepairSpent ?? false).toBe(false);
    await expect(card.getByRole('button', { name: 'Napraw', exact: true })).toHaveCount(0);
    await closeSheet(bartek.page);
    await bartek.page.getByRole('button', { name: /^Czat/ }).first().click();
    await expect(
      bartek.page.getByText('Praca zajmuje 1 dzień — zegar przesuwa MG.').last(),
    ).toBeVisible();

    const before = gameTime();
    await mg.page.getByRole('button', { name: /^Czat/ }).first().click();
    await mg.page.getByRole('button', { name: /Przesuń zegar o 1 dzień/ }).click();
    await expect.poll(gameTime).toBe(before + 24 * 60);
    await expect(mg.page.getByText('Zegar przesunięty o 1 dzień.').last()).toBeVisible();
    expect(await emitAck(gm, 'roll:clock', { messageId: roll.id })).toEqual({
      ok: false,
      error: 'CLOCK_ALREADY_MOVED',
    });
    expect(gameTime()).toBe(before + 24 * 60);
  });

  test('TEC-18 G10 Technik montuje kolczatkę w aucie: Test PT 24, surowce przy sukcesie, raz na auto', async () => {
    dataOf(
      await emitAck(gm, 'character:update', {
        characterId: characterId(TECH.card),
        patch: { data: { eddies: 20_000 } },
      }),
      'character:update 20 000 ed',
    );
    card = await openSheet(bartek, TECH.card);
    const car = techCar();
    const shop = panel().locator('details.team-workshop');
    await shop.locator('summary').click();
    const row = shop.locator(`[data-repair-target="${car.id}"]`);
    await row.getByRole('combobox', { name: /Ulepszenie Technika/ }).selectOption('spikes');
    const since = lastMessageId();
    scriptDice([9]);
    await row.getByRole('button', { name: 'Zamontuj', exact: true }).click();
    await shakeCup(bartek.page);
    const roll = await rollAfter(since, 'Ulepszanie', 'roll');
    // TECH 8 + Naprawa pojazdów lądowych 4 + Ulepszanie 4 + kość 9 = 25 > PT 24 (s. 148).
    expect(roll.total).toBe(25);
    expect(breakdownRow(roll, 'Ulepszanie')?.value).toBe(4);
    expect(breakdownRow(roll, 'Naprawa 4')).toBeUndefined();
    expect(roll.outcome?.label, JSON.stringify(roll.outcome)).toBe('Zamontowane');
    expect(roll.clock).toMatchObject({ minutes: 14 * 24 * 60 });
    expect(pendingDice()).toBe('');
    await expect
      .poll(() => techCar().stats.upgrades.map((entry) => entry.upgradeId))
      .toContain('spikes');
    expect(
      techCar().stats.upgrades.find((entry) => entry.upgradeId === 'spikes')?.techUpgrade,
    ).toBe(true);
    expect(eddies()).toBeLessThan(20_000);
    const forged = await emitAck(await bartek.socket(), 'character:roll', {
      characterId: characterId(TECH.card),
      request: {
        kind: 'vehicleUpgrade',
        repairTarget: { kind: 'vehicle', vehicleId: car.id },
        vehicleUpgradeId: 'nitro',
      },
      visibility: 'public',
    });
    expect(forged).toEqual({ ok: false, error: 'TECH_UPGRADE_USED' });
    await shop.getByRole('button', { name: 'Odśwież listę' }).click();
    await expect(row.locator('option[value="nitro"]')).toBeDisabled();
    await closeSheet(bartek.page);
    for (const actor of [mg, bartek]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
  });

  // ───────────── 71d1: Prowizorka z zegarem, skutki Ulepszania (G12, G14, G15) ─────────────

  test('TEC-05 G12 Prowizorka puszcza sama, gdy MG przesunie zegar świata', async () => {
    // Kurtka po 71c2 jest cała — MG ją obija, żeby było co łatać.
    const ablated = cardData<{ armor: Armor[] }>(TECH.card).armor.map((entry) =>
      entry.id === 'r71-kurtka' ? { ...entry, spCurrent: 7 } : entry,
    );
    dataOf(
      await emitAck(gm, 'character:update', {
        characterId: characterId(TECH.card),
        patch: { data: { armor: ablated } },
      }),
      'character:update kurtka 7',
    );
    card = await openSheet(bartek, TECH.card);
    await card.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    const since = lastMessageId();
    scriptDice([5]);
    await card.getByRole('button', { name: 'Prowizorka', exact: true }).click();
    await shakeCup(bartek.page);
    await rollAfter(since, 'Prowizorka', 'roll');
    await expect.poll(() => armor().spCurrent).toBe(armor().sp);
    // Naprawa 4 → 40 minut zegara świata.
    const patch = armor().fieldRepair as { minutes: number; expiresAtMinute?: number };
    expect(patch.minutes).toBe(40);
    expect(patch.expiresAtMinute).toBe(gameTime() + 40);
    await expect(
      card.getByRole('button', { name: 'Koniec prowizorki', exact: true }),
    ).toHaveAttribute('title', /puści sama/);

    dataOf(await emitAck(gm, 'time:set', { step: 'hour' }), 'time:set +1 h');
    await expect.poll(() => armor().fieldRepair ?? null).toBeNull();
    expect(armor().spCurrent).toBe(7);
    expect(armor().fieldRepairSpent).toBe(true);
    await closeSheet(bartek.page);
    await bartek.page.getByRole('button', { name: /^Czat/ }).first().click();
    await expect(
      bartek.page.getByText(/Prowizorka puściła: Lekka kurtka kuloodporna/).last(),
    ).toBeVisible();
  });

  test('TEC-12 TEC-13 G14 G15 MG stempluje Ulepszenie przy broni — gracz widzi plakietkę, sam go nie wpisze', async () => {
    type Weapon = { id: string; upgrade?: string };
    const pistol = () =>
      cardData<{ weapons: Weapon[] }>(TECH.card).weapons.find((row) => row.id === 'r71-pistolet')!;
    const forged = await emitAck(await bartek.socket(), 'character:update', {
      characterId: characterId(TECH.card),
      patch: {
        data: {
          weapons: cardData<{ weapons: Weapon[] }>(TECH.card).weapons.map((row) =>
            row.id === 'r71-pistolet' ? { ...row, upgrade: 'excellent' } : row,
          ),
        },
      },
    });
    expect(forged).toEqual({ ok: false, error: 'ITEM_LOCKED' });

    card = await openSheet(bartek, TECH.card);
    await card.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    // Gracz menu nie ma — stempel wpisuje MG; Test Technika (71d2) idzie robotami drużyny.
    await expect(
      card.getByRole('combobox', { name: /Ulepszenie Technika: Ciężki pistolet/ }),
    ).toHaveCount(0);
    await closeSheet(bartek.page);

    const gmCard = await openSheet(mg, TECH.card);
    await gmCard.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    const menu = gmCard.getByRole('combobox', { name: /Ulepszenie Technika: Ciężki pistolet/ });
    // Pistolet z gniazdami: gniazdo i jakość tak, egzotyka nie.
    await expect(menu.locator('option[value="slot"]')).toHaveCount(1);
    await expect(menu.locator('option[value="exoticSlot"]')).toHaveCount(0);
    await menu.selectOption('excellent');
    await expect.poll(() => pistol().upgrade).toBe('excellent');
    await expect(menu).toHaveCount(0);
    await expect(
      gmCard.locator('.item-upgrade-chip', { hasText: 'Jakość Doskonała' }),
    ).toBeVisible();
    await closeSheet(mg.page);

    card = await openSheet(bartek, TECH.card);
    await card.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    await expect(
      card.locator('.item-upgrade-chip', { hasText: 'Jakość Doskonała' }),
    ).toHaveAttribute('title', /\+1 do Testów ataku/);
    await closeSheet(bartek.page);
    for (const actor of [mg, bartek]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
  });

  // ───────────── 71d2: Praca Twórcy — Ulepszanie i Wytwarzanie Testem (G13) ─────────────

  test('TEC-03 TEC-07 TEC-09 G13 Ulepszanie Testem: cudzy pistolet, PT z pasma, surowce przy sukcesie, stempel', async () => {
    type Weapon = { id: string; upgrade?: string };
    const solo = ROLES.solo.card;
    const soloPistol = () =>
      cardData<{ weapons: Weapon[] }>(solo).weapons.find((row) => row.id === 'r71-pistolet')!;
    expect(soloPistol().upgrade).toBeUndefined();
    const before = eddies();
    card = await openSheet(bartek, TECH.card);
    const shop = panel().locator('details.team-workshop');
    await shop.locator('summary').click();
    const row = shop.locator(`[data-upgrade-target="${characterId(solo)}:weapons:r71-pistolet"]`);
    await row
      .getByRole('combobox', { name: `Sposób Ulepszania: Ciężki pistolet (${solo})` })
      .selectOption('slot');
    const since = lastMessageId();
    scriptDice([7]);
    await row.getByRole('button', { name: `Ulepsz: Ciężki pistolet (${solo})` }).click();
    await shakeCup(bartek.page);
    const roll = await rollAfter(since, 'Ulepszanie', 'roll');
    // TECH 8 + Naprawa broni 4 + Ulepszanie 4 + kość 7 = 23 > PT 17 (Premium, s. 148);
    // Naprawa Technika do Ulepszania nie dochodzi (TEC-03).
    expect(roll.total).toBe(23);
    expect(breakdownRow(roll, 'Ulepszanie 4')?.value).toBe(4);
    expect(breakdownRow(roll, 'Naprawa 4')).toBeUndefined();
    expect(roll.outcome?.label, JSON.stringify(roll.outcome)).toBe('Ulepszone');
    expect(roll.outcome?.detail).toContain('PT 17');
    // Premium: dzień pracy, surowce z tego samego pasma (100 ed × cennik broni).
    expect(roll.clock).toMatchObject({ minutes: 24 * 60 });
    expect(pendingDice()).toBe('');
    await expect.poll(() => soloPistol().upgrade).toBe('slot');
    expect(eddies()).toBe(before - 1000);

    // Raz ulepszona rzecz znika z listy, a podrobione zdarzenie odmawia.
    await shop.getByRole('button', { name: 'Odśwież listę' }).click();
    await expect(row).toHaveCount(0);
    const forged = await emitAck(await bartek.socket(), 'character:roll', {
      characterId: characterId(TECH.card),
      request: {
        kind: 'itemUpgrade',
        repairTarget: {
          kind: 'item',
          characterId: characterId(solo),
          list: 'weapons',
          rowId: 'r71-pistolet',
        },
        itemUpgradeId: 'excellent',
      },
      visibility: 'public',
    });
    expect(forged).toEqual({ ok: false, error: 'ALREADY_UPGRADED' });
    for (const actor of [mg, bartek]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
  });

  test('TEC-07 TEC-08 TEC-09 G13 Wytwarzanie z Kompendium: latarka na kartę Technika, surowce o pasmo niżej', async () => {
    type Gear = { name: string; compendiumId?: string };
    const lamps = () =>
      cardData<{ gear: Gear[] }>(TECH.card).gear.filter(
        (row) => row.compendiumId === 'gear.latarka',
      ).length;
    const refused = await emitAck(await bartek.socket(), 'character:roll', {
      characterId: characterId(TECH.card),
      request: { kind: 'fabricate', repairTarget: { kind: 'entry', entryId: 'gear.latarka' } },
      visibility: 'public',
    });
    expect(refused).toEqual({ ok: false, error: 'NO_FABRICATE_SPECIALTY' });
    dataOf(
      await emitAck(gm, 'character:update', {
        characterId: characterId(TECH.card),
        patch: { data: { fabrication: { repair: 4, upgrade: 2, fabricate: 2 } } },
      }),
      'character:update Wytwarzanie 2',
    );
    const shop = panel().locator('details.team-workshop');
    const search = shop.getByRole('searchbox', { name: 'Wytwarzanie: szukaj w Kompendium' });
    await search.fill('latarka');
    const row = shop.locator('[data-fabricate-entry="gear.latarka"]');
    await expect(row).toContainText('PT 9');
    const before = { eddies: eddies(), lamps: lamps() };
    const since = lastMessageId();
    scriptDice([5]);
    await row.getByRole('button', { name: 'Wytwórz: Latarka', exact: true }).click();
    await shakeCup(bartek.page);
    const roll = await rollAfter(since, 'Wytwarzanie', 'roll');
    // TECH 8 + Podstawowe naprawy 6 + Wytwarzanie 2 + kość 5 = 21 > PT 9 (Codzienne).
    expect(roll.total).toBe(21);
    expect(breakdownRow(roll, 'Wytwarzanie 2')?.value).toBe(2);
    expect(roll.outcome?.label, JSON.stringify(roll.outcome)).toBe('Wytworzone');
    expect(roll.clock).toMatchObject({ minutes: 60 });
    expect(pendingDice()).toBe('');
    await expect.poll(lamps).toBe(before.lamps + 1);
    // Codzienne → surowce z pasma Tanie: 10 ed × 3 (cennik drobnego sprzętu).
    expect(eddies()).toBe(before.eddies - 30);
    // Amunicji Technik nie wytwarza (zasada domowa 71d2).
    const ammo = await emitAck(await bartek.socket(), 'character:roll', {
      characterId: characterId(TECH.card),
      request: {
        kind: 'fabricate',
        repairTarget: { kind: 'entry', entryId: 'ammo.standard' },
      },
      visibility: 'public',
    });
    expect(ammo).toEqual({ ok: false, error: 'NOT_FABRICABLE' });
    await closeSheet(bartek.page);
    for (const actor of [mg, bartek]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
  });

  test('TEC-16 G16 wszczep po „Łagodniejszej cyborgizacji”: montaż rzuca UC 1k6 zamiast 2k6', async () => {
    type Gear = { id: string; name: string; compendiumId?: string; upgrade?: string };
    const gear = () => cardData<{ gear: Gear[] }>(TECH.card).gear;
    const eye = () => gear().find((row) => row.id === 'r71-oko');
    // Znalezione Cyberoko (UC 2k6) trafia do Wyposażenia Technika ręką MG.
    dataOf(
      await emitAck(gm, 'character:update', {
        characterId: characterId(TECH.card),
        patch: {
          data: {
            gear: [
              ...gear(),
              {
                id: 'r71-oko',
                name: 'Cyberoko',
                notes: '',
                compendiumId: 'cyberware.cyberoko',
                qty: 1,
              },
            ],
          },
        },
      }),
      'character:update Cyberoko',
    );
    const gmCard = await openSheet(mg, TECH.card);
    await gmCard.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    const menu = gmCard.getByRole('combobox', { name: 'Ulepszenie Technika: Cyberoko' });
    await menu.selectOption('humanity');
    await expect.poll(() => eye()?.upgrade).toBe('humanity');
    await expect(
      gmCard.locator('.item-upgrade-chip', { hasText: 'Łagodniejsza cyborgizacja' }),
    ).toBeVisible();
    await closeSheet(mg.page);

    const before = cardData<{ humanityCurrent: number }>(TECH.card).humanityCurrent;
    const since = lastMessageId();
    scriptDice([4]);
    dataOf(
      await emitAck(gm, 'character:cyberware', {
        characterId: characterId(TECH.card),
        action: 'install',
        entryId: 'cyberware.cyberoko',
        payment: 'installOnly',
      }),
      'character:cyberware install',
    );
    const roll = await rollAfter(since, 'Łagodniejsza cyborgizacja', 'roll');
    expect(roll.notation, JSON.stringify(roll)).toBe('1d6');
    expect(roll.outcome?.detail).toContain('2k6 → 1k6');
    expect(pendingDice()).toBe('');
    expect(eye()).toBeUndefined();
    await expect
      .poll(() => cardData<{ humanityCurrent: number }>(TECH.card).humanityCurrent)
      .toBe(before - 4);
    for (const actor of [mg, bartek]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
  });
});
