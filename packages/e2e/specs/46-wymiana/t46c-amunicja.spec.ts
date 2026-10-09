import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator } from '@playwright/test';
import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { creatorWindow, goToStep, openCreator } from '../../fixtures/creator.ts';
import { KNAJPA } from '../../fixtures/maps.ts';
import { MEASUREMENTS_DIR } from '../../fixtures/pomiary.ts';
import { campaignId, characterId } from '../../fixtures/nocna-zmiana.ts';
import { queryOne, startFromPoT6, viewedScene } from '../../fixtures/regresja.ts';
import { clickOnMap, fitCamera, tokenCentre } from '../../fixtures/scene.ts';
import { DEAD_GATEWAY } from '../../fixtures/security.ts';
import { emitAck, type Ack } from '../../fixtures/socket.ts';
import { createInvitation } from '../../fixtures/table.ts';
import { cellCentre, closeSheet, openSheet, sheet, token } from '../../fixtures/walka.ts';

/**
 * Etap 46c1 — zapas amunicji (`etap-46-wymiana-sklepy.md`, tabela „E2E 46c”).
 * Start z `po-T6` („Nocna zmiana”, „Knajpa”): Marek gra Kowalem, Ola Iskrą,
 * Paser stoi przy barze. MG i Marek w Chromium, **Ola w Firefoksie**.
 *
 * Łańcuch T3a–T5b jeszcze nie kupuje amunicji (to 46c2), więc `po-T6` ma stan
 * sprzed 46c: Kowal ma tylko to, co w magazynkach, i stary tekst „Amunicja
 * (zapas)”. Ten plik sam rozdaje pudełka ręką MG. Odstępstwa od tabeli:
 * 46c.1–46c.3 idą poza walką (Akcję i `NO_AMMO` bez Akcji sprawdza
 * `ammo-stock.test.ts` na serwerze), 46c.8 kończy się na podsumowaniu kreatora
 * (karta, którą zapisze „Utwórz”, to `creationOutcome` — test serwera trzyma
 * oba wyniki równo), a 46c.9 (`@llm`, bot bez amunicji) przechodzi do 46c2.
 */

type Ammo = { ammoId: string | null; calibre: string; pattern: string };
type Row = {
  id: string;
  name: string;
  qty?: number;
  ammo?: Ammo;
  ammoCurrent?: number;
  ammoMax?: number;
  ammoId?: string;
};
type Card = {
  eddies: number;
  gear: Row[];
  weapons: Row[];
  ammoStock: string;
  ammoTracked?: boolean;
};

const VHP = 'B.C. Pistolet';
const HEAVY = 'C. Pistolet';

function okData<T>(ack: Ack<T>): T {
  if (!ack.ok) throw new Error(`E2E: ${JSON.stringify(ack)}`);
  return ack.data as T;
}

function box(qty: number, calibre: string, ammoId: string | null = null, id?: string): Row {
  return {
    // Krótko: id wiersza ma w walidacji karty limit długości.
    id: id ?? `e2e-${ammoId ? 'ap' : 'zw'}-${calibre.length}`,
    name: `${ammoId ? 'Amunicja przeciwpancerna' : 'Amunicja zwykła'} · ${calibre}`,
    qty,
    ammo: { ammoId, calibre, pattern: calibre === 'Granaty' ? 'grenade' : 'bullet' },
  };
}

test.describe.serial('T46c zapas amunicji', () => {
  let mg: Actor;
  let marek: Actor;
  let ola: Actor;
  let gmSocket: Socket;
  let marekSocket: Socket;
  let olaSocket: Socket;
  let cell: number;

  const card = (name: string) => sheet<Card>(name);
  const weapon = (name: string, weaponName: string) =>
    card(name).weapons.find((row) => row.name === weaponName)!;
  /** Naboje rodzaju i kalibru w pudełkach karty. */
  const stock = (name: string, calibre: string, ammoId: string | null = null) =>
    card(name)
      .gear.filter((row) => row.ammo?.calibre === calibre && row.ammo.ammoId === ammoId)
      .reduce((sum, row) => sum + (row.qty ?? 0), 0);
  const boxes = (name: string, calibre: string) =>
    card(name).gear.filter((row) => row.ammo?.calibre === calibre);

  const gm = (event: string, payload: unknown) => emitAck(gmSocket, event, payload);

  async function setCard(name: string, patch: Partial<Card>) {
    okData(
      await gm('character:update', { characterId: characterId(name), patch: { data: patch } }),
    );
  }

  /** Pistolet Kowala w zadanym stanie — reszta broni bez zmian. */
  async function setVhp(ammoCurrent: number, ammoId?: string) {
    const weapons = card('Kowal').weapons.map((row) => {
      if (row.name !== 'Bardzo ciężki pistolet') return row;
      const { ammoId: _drop, ...rest } = row;
      void _drop;
      return { ...rest, ammoCurrent, ...(ammoId ? { ammoId } : {}) };
    });
    await setCard('Kowal', { weapons });
  }

  /** Zrzut do oględzin (`.e2e/pomiary/46c1`), przewinięty do tego, co pokazuje. */
  async function shot(actor: Actor, name: string, focus?: string) {
    const dir = join(MEASUREMENTS_DIR, '46c1');
    mkdirSync(dir, { recursive: true });
    if (focus) await actor.page.locator(focus).first().scrollIntoViewIfNeeded();
    await actor.page.screenshot({ path: join(dir, `${name}-${actor.name}-${actor.engine}.png`) });
  }

  async function place(name: string, column: number, row: number) {
    const at = cellCentre(cell, column, row);
    okData(
      await gm('token:move', {
        tokenId: token(name).id,
        x: at.x - cell / 2,
        y: at.y - cell / 2,
        final: true,
      }),
    );
    await expect
      .poll(() => [Math.round(token(name).x / cell), Math.round(token(name).y / cell)])
      .toEqual([column, row]);
  }

  /** Karta z Kompendium: szukanie po nazwie, po kategoriach, klik w wiersz. */
  async function compendiumEntry(actor: Actor, name: string) {
    const page = actor.page;
    await page.getByRole('button', { name: 'Kompendium', exact: true }).click();
    const panel = page.locator('.compendium-panel');
    const back = panel.getByRole('button', { name: '← Lista' });
    if (await back.isVisible().catch(() => false)) await back.click();
    await panel.getByPlaceholder('Szukaj przedmiotu…').fill(name);
    const row = panel.locator('.compendium-row', {
      has: page.locator('.compendium-row-name', { hasText: new RegExp(`^${name}$`) }),
    });
    for (const category of await panel.locator('.compendium-category').all()) {
      if (
        await row
          .first()
          .isVisible()
          .catch(() => false)
      )
        break;
      await category.click();
    }
    await row.first().click();
    const entry = panel.locator('.compendium-card');
    await expect(entry).toBeVisible();
    return entry;
  }

  /** Wybór kalibru po fragmencie etykiety („B.C. Pistolet — …”). */
  async function pickCalibre(select: Locator, calibre: string) {
    const option = select.locator('option', {
      hasText: new RegExp(`^${calibre.replace(/\./g, '\\.')}`),
    });
    await select.selectOption((await option.first().getAttribute('value'))!);
  }

  test.beforeAll(async () => {
    await startFromPoT6(DEAD_GATEWAY);
  });

  test.afterAll(async ({ cast }) => {
    for (const socket of [gmSocket, marekSocket, olaSocket]) socket?.disconnect();
    await cast.closeAll();
  });

  test('46c.0 stół: stary tekst „Amunicja (zapas)” to notatka, nie zapas', async ({ cast }) => {
    test.setTimeout(4 * 60_000);
    cast.viewport = { width: 1920, height: 1080 };
    mg = await cast.mg('chromium');
    marek = await cast.gracz(
      'Marek',
      'chromium',
      await createInvitation(mg, campaignId(), 'Marek'),
    );
    ola = await cast.gracz('Ola', 'firefox', await createInvitation(mg, campaignId(), 'Ola'));
    for (const actor of [mg, marek, ola]) {
      await expect.poll(() => viewedScene(actor)).toBe('Knajpa');
      await fitCamera(actor.page, KNAJPA.width, KNAJPA.height).catch(() => undefined);
    }
    gmSocket = await mg.socket();
    marekSocket = await marek.socket();
    olaSocket = await ola.socket();
    cell = queryOne<{ gridSizePx: number }>(
      `SELECT gridSizePx FROM Scene WHERE name = 'Knajpa'`,
    )!.gridSizePx;
    okData(await gm('economy:adjust', { characterId: characterId('Kowal'), balance: 1000 }));

    // Migracja „nic” (decyzja MG 12): Kowal ma tylko magazynki, a tekst T5a
    // zostaje notatką do przepisania — bez pola do wpisywania.
    expect(card('Kowal').ammoStock).toContain('× 16');
    expect(card('Kowal').gear.some((row) => row.ammo)).toBe(false);
    await openSheet(marek, 'Kowal');
    await marek.page.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    await expect(marek.page.getByText('Amunicja (stary zapis)')).toBeVisible();
    await expect(marek.page.getByLabel('Amunicja (zapas)')).toHaveCount(0);
    // „Licz amunicję” przestawia wyłącznie MG.
    await expect(marek.page.getByLabel('Licz amunicję')).toHaveCount(0);
    await closeSheet(marek.page);
  });

  test('46c.1 przeładowanie ze zwykłego zapasu: magazynek pełny, zapas mniejszy o tyle, ile weszło', async () => {
    await setVhp(0);
    await setCard('Kowal', { gear: [...card('Kowal').gear, box(20, VHP)] });
    await openSheet(marek, 'Kowal');
    const reload = marek.page.getByRole('button', { name: `Przeładuj do pełna (${VHP})` });
    await expect(marek.page.locator('.weapon-ammo-stock').first()).toHaveText('zapas 20');
    await reload.click();
    await expect.poll(() => weapon('Kowal', 'Bardzo ciężki pistolet').ammoCurrent).toBe(8);
    expect(stock('Kowal', VHP)).toBe(12);
    await expect(marek.page.locator('.weapon-ammo-stock').first()).toHaveText('zapas 12');
    await shot(marek, '1-karta-zapas', '.weapon-table');
    await closeSheet(marek.page);
  });

  test('46c.2–3 mały zapas ładuje resztę, pudełko znika; bez zapasu NO_AMMO i szary ⟳', async () => {
    await setVhp(0);
    await setCard('Kowal', {
      gear: [...card('Kowal').gear.filter((row) => !row.ammo), box(3, VHP)],
    });
    await openSheet(marek, 'Kowal');
    await marek.page.getByRole('button', { name: `Przeładuj do pełna (${VHP})` }).click();
    await expect.poll(() => weapon('Kowal', 'Bardzo ciężki pistolet').ammoCurrent).toBe(3);
    expect(boxes('Kowal', VHP)).toHaveLength(0);
    // Przeładowanie bez naboi: guzik szary, a wprost — odmowa bez zmian na karcie.
    await expect(
      marek.page.getByRole('button', { name: `Przeładuj do pełna (${VHP})` }),
    ).toBeDisabled();
    await expect(marek.page.locator('.weapon-ammo-stock--empty').first()).toHaveText('zapas 0');
    const vhp = weapon('Kowal', 'Bardzo ciężki pistolet');
    expect(
      await emitAck(marekSocket, 'weapon:reload', {
        characterId: characterId('Kowal'),
        weaponRowId: vhp.id,
      }),
    ).toEqual({ ok: false, error: 'NO_AMMO' });
    expect(weapon('Kowal', 'Bardzo ciężki pistolet').ammoCurrent).toBe(3);
    await closeSheet(marek.page);
  });

  test('46c.4 zmiana na przeciwpancerną: stare naboje wracają do zapasu zwykłej', async () => {
    await setVhp(5);
    await setCard('Kowal', {
      gear: [
        ...card('Kowal').gear.filter((row) => !row.ammo),
        box(10, VHP),
        box(16, VHP, 'ammo.armour-piercing'),
      ],
    });
    await openSheet(marek, 'Kowal');
    const picker = marek.page.getByLabel('Rodzaj naboju: Bardzo ciężki pistolet');
    await expect(
      picker.locator('option', { hasText: 'Amunicja przeciwpancerna — 16' }),
    ).toHaveCount(1);
    await expect(picker.locator('option', { hasText: 'Zwykła — 10' })).toHaveCount(1);
    // Rodzaj bez zapasu jest wyszarzony.
    await expect(
      picker.locator('option', { hasText: /^Amunicja zapalająca — 0$/ }),
    ).toHaveAttribute('disabled', '');
    await picker.selectOption('ammo.armour-piercing');
    await expect
      .poll(() => weapon('Kowal', 'Bardzo ciężki pistolet'))
      .toMatchObject({ ammoCurrent: 8, ammoId: 'ammo.armour-piercing' });
    expect(stock('Kowal', VHP)).toBe(15);
    expect(stock('Kowal', VHP, 'ammo.armour-piercing')).toBe(8);
    await shot(marek, '4-wybor-naboju', '.weapon-table');
    await closeSheet(marek.page);
  });

  test('46c.5 granat: rzut, przeładowanie bez granatów — NO_AMMO; gracz nie dopisze naboi ręką', async () => {
    const grenade = weapon('Kowal', 'Granat odłamkowy');
    expect(grenade).toMatchObject({ ammoCurrent: 1, ammoMax: 2 });
    const from = tokenCentre(token('Kowal'), cell);
    okData(
      await emitAck(marekSocket, 'attack:roll', {
        characterId: characterId('Kowal'),
        attackerTokenId: token('Kowal').id,
        targetPoint: { x: from.x + 3 * cell, y: from.y },
        request: { weaponRowId: grenade.id, mode: 'single' },
      }),
    );
    await expect.poll(() => weapon('Kowal', 'Granat odłamkowy').ammoCurrent).toBe(0);
    // #82: do 46c przeładowanie napełniało granat „z niczego”.
    expect(
      await emitAck(marekSocket, 'weapon:reload', {
        characterId: characterId('Kowal'),
        weaponRowId: grenade.id,
      }),
    ).toEqual({ ok: false, error: 'NO_AMMO' });
    expect(weapon('Kowal', 'Granat odłamkowy').ammoCurrent).toBe(0);
    // Decyzja MG 6: łata karty gracza nie podniesie magazynka.
    const raised = card('Kowal').weapons.map((row) =>
      row.id === grenade.id ? { ...row, ammoCurrent: 2 } : row,
    );
    expect(
      await emitAck(marekSocket, 'character:update', {
        characterId: characterId('Kowal'),
        patch: { data: { weapons: raised } },
      }),
    ).toEqual({ ok: false, error: 'AMMO_LOCKED' });
    // Granat z zapasu granatów — ten sam kaliber pasuje do ręki i granatnika.
    await setCard('Kowal', { gear: [...card('Kowal').gear, box(1, 'Granaty')] });
    okData(
      await emitAck(marekSocket, 'weapon:reload', {
        characterId: characterId('Kowal'),
        weaponRowId: grenade.id,
      }),
    );
    await expect.poll(() => weapon('Kowal', 'Granat odłamkowy').ammoCurrent).toBe(1);
    expect(boxes('Kowal', 'Granaty')).toHaveLength(0);
  });

  test('46c.6 NPC MG jest „bez dna”, dopóki MG nie zaznaczy „Licz amunicję”', async () => {
    const pistol = () => card('Paser').weapons[0]!;
    const empty = async () => setCard('Paser', { weapons: [{ ...pistol(), ammoCurrent: 0 }] });
    await empty();
    okData(
      await gm('weapon:reload', { characterId: characterId('Paser'), weaponRowId: pistol().id }),
    );
    await expect.poll(() => pistol().ammoCurrent).toBe(12);

    await openSheet(mg, 'Paser');
    await mg.page.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    const tracked = mg.page.getByLabel('Licz amunicję');
    await expect(tracked).not.toBeChecked();
    await tracked.click();
    await expect.poll(() => card('Paser').ammoTracked).toBe(true);
    await shot(mg, '6-licz-amunicje', '.sheet-ammo-tracked');
    await closeSheet(mg.page);
    await empty();
    expect(
      await gm('weapon:reload', { characterId: characterId('Paser'), weaponRowId: pistol().id }),
    ).toEqual({ ok: false, error: 'NO_AMMO' });
  });

  test('46c.7 pudełko z Kompendium, od Oli i u Pasera skleja się w jeden wiersz', async () => {
    // Kompendium: kaliber wymagany, dwie paczki po 10 (s. 344).
    const eddies = card('Kowal').eddies;
    const entry = await compendiumEntry(marek, 'Amunicja zwykła');
    await pickCalibre(entry.getByLabel('Kaliber'), VHP);
    await entry.getByLabel('Liczba paczek').fill('2');
    await entry.getByRole('button', { name: 'Kup — 20 ed' }).click();
    await expect.poll(() => stock('Kowal', VHP)).toBe(15 + 20);
    expect(card('Kowal').eddies).toBe(eddies - 20);
    expect(boxes('Kowal', VHP).filter((row) => row.ammo?.ammoId === null)).toHaveLength(1);
    await shot(marek, '7-kompendium');
    expect(
      await emitAck(marekSocket, 'economy:buy', {
        characterId: characterId('Kowal'),
        entryId: 'ammo.standard',
      }),
    ).toEqual({ ok: false, error: 'AMMO_CALIBRE_REQUIRED' });

    // Ola (Firefox) oddaje Kowalowi swoje pudełko — przekazanie z „Przyjmij”.
    await setCard('Iskra', { gear: [...card('Iskra').gear, box(10, VHP, null, 'iskra-bc')] });
    okData(
      await emitAck(olaSocket, 'inventory:give', {
        fromCharacterId: characterId('Iskra'),
        toCharacterId: characterId('Kowal'),
        items: [{ list: 'gear', rowId: 'iskra-bc', qty: 10 }],
      }),
    );
    await marek.page.getByRole('button', { name: 'Czat', exact: true }).click();
    const proposal = marek.page.locator('[data-testid="inventory-move"]', { hasText: VHP }).last();
    await proposal.getByRole('button', { name: 'Przyjmij', exact: true }).click();
    await expect.poll(() => stock('Kowal', VHP)).toBe(45);
    expect(boxes('Kowal', VHP).filter((row) => row.ammo?.ammoId === null)).toHaveLength(1);

    // MG wykłada pudełko u Pasera „Dodaj za darmo”, Marek kupuje pięć naboi po 1 ed.
    const gmEntry = await compendiumEntry(mg, 'Amunicja zwykła');
    await gmEntry
      .locator('select', { has: mg.page.locator('option', { hasText: /^Paser$/ }) })
      .selectOption({ label: 'Paser' });
    await pickCalibre(gmEntry.getByLabel('Kaliber'), VHP);
    await gmEntry.getByLabel('Liczba paczek').fill('3');
    await gmEntry.getByRole('button', { name: 'Dodaj za darmo' }).click();
    await expect.poll(() => stock('Paser', VHP)).toBe(30);
    const merchantId = okData(
      await gm('merchant:config', {
        characterId: characterId('Paser'),
        merchant: { open: true, priceMul: 100 },
      }),
    ) as { merchantId: string };
    await place('Kowal', 12, 13);
    const paserBox = boxes('Paser', VHP)[0]!;
    okData(
      await emitAck(marekSocket, 'merchant:deal', {
        merchantId: merchantId.merchantId,
        characterId: characterId('Kowal'),
        buy: [{ list: 'gear', rowId: paserBox.id, qty: 5 }],
        sell: [],
        expectTotal: 5,
      }),
    );
    await expect.poll(() => stock('Kowal', VHP)).toBe(50);
    expect(stock('Paser', VHP)).toBe(25);
    expect(boxes('Kowal', VHP).filter((row) => row.ammo?.ammoId === null)).toHaveLength(1);
  });

  test('46c.7b Ola w Firefoksie: karta i pasek pokazują zapas', async () => {
    await setCard('Iskra', { gear: [...card('Iskra').gear, box(16, HEAVY, null, 'iskra-c')] });
    await openSheet(ola, 'Iskra');
    await expect(ola.page.locator('.weapon-ammo-stock').first()).toHaveText('zapas 16');
    await shot(ola, '7b-karta', '.weapon-table');
    await closeSheet(ola.page);
    await ola.page.keyboard.press('Escape');
    await clickOnMap(ola.page, tokenCentre(token('Iskra'), cell));
    await expect(ola.page.locator('.hud-stock').first()).toHaveText('zapas 16');
    await shot(ola, '7b-pasek');
  });

  test('46c.8 kreator: amunicja na półce startowej, ostrzeżenie o broni bez zapasu', async () => {
    const page = mg.page;
    await openCreator(page);
    const window = creatorWindow(page);
    await goToStep(page, /Wyposażenie/);
    await window.getByRole('button', { name: 'Broń', exact: true }).click();
    await window
      .getByRole('button', { name: 'Dołóż do koszyka: Średni pistolet', exact: true })
      .click();
    await expect(window.locator('.creator-no-stock')).toContainText('Średni pistolet');
    await window.getByRole('button', { name: 'Amunicja', exact: true }).click();
    const row = window.locator('.creator-shop-item', {
      has: page.getByRole('button', { name: 'Dołóż do koszyka: Amunicja zwykła', exact: true }),
    });
    // Kaliber podpowiada się sam z broni w koszyku (rodzina „Ś. Pistolet”).
    await expect(row.getByLabel('Kaliber: Amunicja zwykła').locator('option:checked')).toHaveText(
      'Ś. Pistolet',
    );
    await row.getByRole('button', { name: 'Dołóż do koszyka: Amunicja zwykła' }).click();
    await expect(window.locator('.creator-no-stock')).toHaveCount(0);
    await goToStep(page, /Podsumowanie/);
    await expect(window.locator('.creator-summary-gear')).toContainText(
      'Amunicja zwykła · Ś. Pistolet × 10',
    );
    await shot(mg, '8-kreator', '.creator-summary-gear');
    await goToStep(page, /Wyposażenie/);
    await window
      .locator('.creator-basket li', { hasText: 'Amunicja zwykła · Ś. Pistolet' })
      .getByRole('button', { name: /Odłóż jedną sztukę/ })
      .click();
    await expect(window.locator('.creator-no-stock')).toContainText('Średni pistolet');
  });
});
