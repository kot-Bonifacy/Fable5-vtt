import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { worldToClient, type WorldPoint } from '../../fixtures/canvas.ts';
import { KNAJPA } from '../../fixtures/maps.ts';
import { MEASUREMENTS_DIR } from '../../fixtures/pomiary.ts';
import { campaignId, characterId } from '../../fixtures/nocna-zmiana.ts';
import { query, queryOne, startFromPoT6, viewedScene } from '../../fixtures/regresja.ts';
import { clickOnMap, fitCamera, tokenCentre } from '../../fixtures/scene.ts';
import { DEAD_GATEWAY } from '../../fixtures/security.ts';
import { Canaries } from '../../fixtures/sniffer.ts';
import { emitAck, type Ack } from '../../fixtures/socket.ts';
import { createInvitation } from '../../fixtures/table.ts';
import {
  cellCentre,
  expectClean,
  openSheet,
  closeSheet,
  sheet,
  token,
} from '../../fixtures/walka.ts';
import { startServer, stopServer } from '../../instance/instance.ts';

/**
 * Etap 46a2 — jedno okno „Wymiana” i handlarze (`etap-46-wymiana-sklepy.md`,
 * tabela „E2E 46a”). Start z `po-T6` („Nocna zmiana”, „Knajpa”): Marek gra
 * Kowalem, Ola Iskrą, Paser stoi przy barze.
 *
 * MG i Marek w Chromium, **Ola w Firefoksie** (decyzja z pliku etapu). Kroki
 * 46a.1–46a.16 w kolejności stołu, z dwiema zmianami wobec projektu, bo
 * `po-T6` niesie inny ekwipunek niż szkic: stimpaki i fiolki zastępują
 * latarki i lina z katalogu, a 46a.16 (F5 i restart) idzie przed 46a.15
 * (śmierć Pasera), żeby było czego szukać na półce po restarcie.
 *
 * Decyzje MG z 08.10 (46a2): wybór drugiej strony od razu zaprasza; handel
 * zostaje w doku, gdy okno patrzy gdzie indziej; podwójny klik gracza otwiera
 * „Wymianę” tylko u handlarza i przy ciele.
 */

type Row = {
  id: string;
  name: string;
  qty?: number;
  compendiumId?: string;
  notes?: string;
  equipped?: boolean;
};
type Card = { eddies: number; hpCurrent: number; gear: Row[]; weapons: Row[]; armor: Row[] };

function okData<T>(ack: Ack<T>): T {
  if (!ack.ok) throw new Error(`E2E: ${JSON.stringify(ack)}`);
  return ack.data as T;
}

test.describe.serial('T46a jedno okno „Wymiana” i handlarze', () => {
  let mg: Actor;
  let marek: Actor;
  let ola: Actor;
  let gmSocket: Socket;
  let marekSocket: Socket;
  let olaSocket: Socket;
  let cell: number;
  let paserShop: string;
  let siecShop: string;
  const canaries = new Canaries();
  let hiddenName: string;

  const card = (name: string) => sheet<Card>(name);
  const exchange = (actor: Actor) => actor.page.locator('section[aria-label="Wymiana"]');
  const counterpart = (actor: Actor) => exchange(actor).getByLabel('Druga strona');
  const dock = (actor: Actor) => actor.page.locator('.trade-dock');
  const gear = (name: string, item: string) =>
    card(name)
      .gear.filter((row) => row.name === item)
      .reduce((sum, row) => sum + (row.qty ?? 0), 0);
  const money = () => card('Kowal').eddies + card('Iskra').eddies + card('Paser').eddies;
  const lastLedgerId = () =>
    queryOne<{ id: number }>('SELECT max(id) AS id FROM LedgerEntry')?.id ?? 0;
  const ledger = (name: string, after: number) =>
    query<{ kind: string; amount: number }>(
      'SELECT kind, amount FROM LedgerEntry WHERE characterId = ? AND id > ? ORDER BY id',
      characterId(name),
      after,
    ).map((row) => [row.kind, row.amount]);
  const merchantRow = (id: string) =>
    queryOne<{ open: number; priceMul: number; rows: string }>(
      'SELECT open, priceMul, rows FROM Merchant WHERE id = ?',
      id,
    );

  const gm = (event: string, payload: unknown) => emitAck(gmSocket, event, payload);

  /** Zrzut do oględzin (`.e2e/pomiary/46a2`): okno w każdym trybie, u Oli w Firefoksie. */
  async function shot(actor: Actor, name: string) {
    const dir = join(MEASUREMENTS_DIR, '46a2');
    mkdirSync(dir, { recursive: true });
    await actor.page.screenshot({ path: join(dir, `${name}-${actor.name}-${actor.engine}.png`) });
  }

  /** Figura przesunięta ręką MG — ruch nie jest tu tematem, a stół ma stać, gdzie trzeba. */
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

  async function menuOn(actor: Actor, name: string, item: string) {
    await actor.page.keyboard.press('Escape');
    await clickOnMap(actor.page, tokenCentre(token(name), cell), 'right');
    await actor.page.getByRole('button', { name: item }).click();
  }

  async function doubleClickOn(actor: Actor, point: WorldPoint) {
    const { x, y } = await worldToClient(actor.page, point);
    await actor.page.mouse.move(x - 4, y - 4);
    await actor.page.mouse.move(x, y, { steps: 4 });
    await actor.page.mouse.dblclick(x, y);
  }

  /** Druga strona po fragmencie etykiety — lista odświeża się przy fokusie. */
  async function chooseCounterpart(actor: Actor, text: string) {
    await counterpart(actor).focus();
    const option = counterpart(actor).locator('option', { hasText: text }).first();
    await expect(option).not.toHaveAttribute('disabled');
    await counterpart(actor).selectOption((await option.getAttribute('value'))!);
  }

  async function exchangeFromSheet(actor: Actor, name: string) {
    await openSheet(actor, name);
    await actor.page.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    await actor.page.getByRole('button', { name: 'Wymiana…' }).click();
    await closeSheet(actor.page);
    await expect(exchange(actor)).toBeVisible();
  }

  async function setStock(name: string, patch: Partial<Card>) {
    okData(
      await gm('character:update', { characterId: characterId(name), patch: { data: patch } }),
    );
  }

  test.beforeAll(async () => {
    await startFromPoT6(DEAD_GATEWAY);
  });

  test.afterAll(async ({ cast }) => {
    for (const socket of [gmSocket, marekSocket, olaSocket]) socket?.disconnect();
    await cast.closeAll();
  });

  test('46a.0 stół: MG i Marek w Chromium, Ola w Firefoksie, towar i kieszenie', async ({
    cast,
  }) => {
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

    hiddenName = canaries.secret('ukryty-towar');
    await setStock('Kowal', {
      gear: [
        ...card('Kowal').gear,
        {
          id: 'e2e-latarka',
          name: 'Latarka',
          qty: 2,
          compendiumId: 'gear.latarka',
          notes: '',
        } as Row,
      ],
    });
    await setStock('Zbir', {
      gear: [
        { id: 'e2e-lina', name: 'Lina (60 m)', qty: 1, compendiumId: 'gear.lina-60-m', notes: '' },
        {
          id: 'e2e-radio',
          name: 'Radioodtwarzacz',
          qty: 1,
          compendiumId: 'gear.radioodtwarzacz',
          notes: '',
        },
      ] as Row[],
    });
    const paser = card('Paser');
    await setStock('Paser', {
      gear: [
        { id: 'paser-latarka', name: 'Latarka', qty: 3, compendiumId: 'gear.latarka', notes: '' },
        {
          id: 'paser-lina',
          name: 'Lina (60 m)',
          qty: 2,
          compendiumId: 'gear.lina-60-m',
          notes: '',
        },
      ] as Row[],
      armor: [
        ...paser.armor,
        {
          id: 'paser-kurtka',
          name: 'Lekka kurtka kuloodporna',
          compendiumId: 'armor.light-armorjack',
          notes: '',
          sp: 11,
          spCurrent: 11,
          location: 'body',
        },
        {
          id: 'paser-kevlar',
          name: 'Kevlar',
          compendiumId: 'armor.kevlar',
          notes: '',
          sp: 7,
          spCurrent: 7,
          location: 'body',
        },
      ] as unknown as Row[],
      weapons: [
        ...paser.weapons,
        {
          id: 'paser-ukryty',
          name: hiddenName,
          compendiumId: 'weapon.militech-ronin',
          notes: '',
          damage: '3k6',
          ammoCurrent: 0,
          ammoMax: 6,
          ammoType: '',
          rof: '1',
        },
      ] as unknown as Row[],
    });
    okData(await gm('economy:adjust', { characterId: characterId('Kowal'), balance: 1000 }));
    okData(await gm('economy:adjust', { characterId: characterId('Zbir'), balance: 50 }));
    okData(await gm('economy:adjust', { characterId: characterId('Paser'), balance: 500 }));
    expect(card('Paser').weapons.map((row) => row.name)).toContain(hiddenName);
    expect(gear('Kowal', 'Latarka')).toBe(2);
  });

  test('46a.1 Marek z menu figury Iskry: okno od razu „czeka na Iskrę”, wytrychy w polu', async () => {
    await menuOn(marek, 'Iskra', '🤝 Wymiana…');
    await expect(exchange(marek)).toHaveAttribute('data-exchange-mode', 'trade');
    await expect(exchange(marek)).toContainText('Czekasz, aż Iskra przyjmie zaproszenie');
    await exchange(marek)
      .getByRole('button', { name: 'Połóż w polu wymiany: Zestaw wytrychów' })
      .click();
    await expect(exchange(marek).locator('.trade-zone--mine')).toContainText('Zestaw wytrychów');
    await shot(marek, '1-zaproszenie');
    await expect(dock(ola).locator('.trade-dock-row--invite')).toContainText('Kowal');
    // Pole to stan negocjacji — w bazie nic się nie ruszyło.
    expect(card('Kowal').gear.map((row) => row.name)).toContain('Zestaw wytrychów');
    expect(card('Iskra').gear.map((row) => row.name)).not.toContain('Zestaw wytrychów');
  });

  test('46a.2 dwie zgody: zmiana kwoty zdejmuje zgodę Marka, wymiana atomowa', async () => {
    const before = card('Kowal').eddies + card('Iskra').eddies;
    await dock(ola).getByRole('button', { name: 'Przyjmij' }).click();
    await expect(exchange(ola)).toHaveAttribute('data-exchange-mode', 'trade');
    const cash = exchange(ola).getByLabel('Ile eurodolców w polu wymiany');
    await cash.fill('100');
    await cash.press('Enter');
    await expect(exchange(marek).locator('.trade-zone', { hasText: 'Iskra' })).toContainText(
      '100 ed',
    );
    await exchange(marek).getByRole('button', { name: 'Zgadzam się' }).click();
    await expect(exchange(marek).locator('.trade-zone--mine')).toContainText('✔ zgoda');
    await shot(ola, '2-handel');
    await cash.fill('120');
    await cash.press('Enter');
    await expect(exchange(marek).locator('.trade-zone', { hasText: 'Iskra' })).toContainText(
      '120 ed',
    );
    await expect(exchange(marek).locator('.trade-zone--mine')).toContainText('bez zgody');
    await exchange(marek).getByRole('button', { name: 'Zgadzam się' }).click();
    await exchange(ola).getByRole('button', { name: 'Zgadzam się' }).click();
    await expect
      .poll(() => card('Iskra').gear.map((row) => row.name))
      .toContain('Zestaw wytrychów');
    expect(card('Kowal').gear.map((row) => row.name)).not.toContain('Zestaw wytrychów');
    expect(card('Kowal').eddies + card('Iskra').eddies).toBe(before);
    for (const actor of [marek, ola]) {
      await expect(
        actor.page
          .locator('[data-testid="inventory-move"]', { hasText: 'Zestaw wytrychów' })
          .last(),
      ).toContainText('Handel');
    }
    // Wymiana skończona: okno handlu znika, ślad zostaje w doku.
    await expect(exchange(marek)).toHaveCount(0);
    await expect(exchange(ola)).toHaveCount(0);
    await expect(dock(marek)).toContainText('Wymienione');
  });

  test('46a.3 „Wyślij bez czekania”: latarka idzie propozycją z „Przyjmij”', async () => {
    await menuOn(marek, 'Iskra', '🤝 Wymiana…');
    await expect(exchange(marek)).toContainText('Czekasz, aż Iskra przyjmie zaproszenie');
    await exchange(marek).getByRole('button', { name: 'Połóż w polu wymiany: Latarka' }).click();
    const qty = exchange(marek).getByLabel('Ile sztuk w polu: Latarka');
    await qty.fill('1');
    await qty.press('Enter');
    await expect(qty).toHaveValue('1');
    await exchange(marek).getByRole('button', { name: 'Wyślij bez czekania' }).click();
    const proposal = ola.page
      .locator('[data-testid="inventory-move"]', { hasText: 'Latarka' })
      .last();
    await expect(proposal).toContainText('Przekazanie');
    // Zaproszenie znikło razem z polem — nikt już na nikogo nie czeka.
    await expect(dock(ola).locator('.trade-dock-row--invite')).toHaveCount(0);
    expect(gear('Iskra', 'Latarka')).toBe(0);
    await proposal.getByRole('button', { name: 'Przyjmij', exact: true }).click();
    await expect.poll(() => gear('Iskra', 'Latarka')).toBe(1);
    expect(gear('Kowal', 'Latarka')).toBe(1);
    // Ślad po wycofanym zaproszeniu wisi w doku kilka sekund i znika sam.
    for (const actor of [marek, ola]) {
      await expect(dock(actor).getByText('Handel przerwany')).toHaveCount(0, { timeout: 15_000 });
    }
  });

  test('46a.4 podwójny klik w ciało Zbira: łup od ręki, „Zabierz wszystko” z gotówką', async () => {
    const eddies = card('Kowal').eddies;
    await marek.page.keyboard.press('Escape');
    await doubleClickOn(marek, tokenCentre(token('Zbir'), cell));
    await expect(exchange(marek)).toHaveAttribute('data-exchange-mode', 'loot');
    await expect(exchange(marek)).toContainText('Radioodtwarzacz');
    await expect(exchange(marek)).toContainText('50 ed');
    await shot(marek, '4-lup');
    // Karta Oli to handel, nigdy łup.
    await expect(counterpart(marek).locator('option', { hasText: '🎒 Iskra' })).toHaveCount(0);
    await exchange(marek).getByRole('button', { name: 'Zabierz wszystko' }).click();
    await expect.poll(() => card('Zbir').gear).toEqual([]);
    expect(card('Zbir').eddies).toBe(0);
    expect(gear('Kowal', 'Lina (60 m)')).toBe(1);
    expect(card('Kowal').eddies).toBe(eddies + 50);
    await exchange(marek).getByRole('button', { name: 'Zamknij okno wymiany' }).click();
  });

  test('46a.5 tryb MG z karty Pasera: na Kowala propozycja, na Rzeźnika od ręki', async () => {
    await place('Kowal', 12, 13);
    await place('Rzeźnik', 14, 13);
    await menuOn(mg, 'Paser', '🤝 Wymiana…');
    await expect(exchange(mg)).toHaveAttribute('data-exchange-mode', 'gm');
    const window = exchange(mg);
    await window.getByLabel('Dokąd').selectOption({ label: 'Kowal' });
    await window.getByLabel('Ile sztuk: Lina (60 m)').fill('1');
    await window.getByRole('button', { name: 'Przekaż: Lina (60 m)' }).click();
    await expect(window).toContainText('Wysłane do: Kowal — czeka na przyjęcie.');
    await shot(mg, '5-tryb-mg');
    expect(gear('Kowal', 'Lina (60 m)')).toBe(1);
    await window.getByLabel('Dokąd').selectOption({ label: 'Rzeźnik' });
    await window.getByLabel('Ile sztuk: Lina (60 m)').fill('1');
    await window.getByRole('button', { name: 'Przekaż: Lina (60 m)' }).click();
    await expect(window).toContainText('Przekazane: Rzeźnik.');
    await expect.poll(() => gear('Rzeźnik', 'Lina (60 m)')).toBe(1);
    await window.getByRole('button', { name: 'Zamknij okno wymiany' }).click();
  });

  test('46a.6 MG robi z Pasera handlarza: „Spod lady”, 120%, „∞” i ukryty towar', async () => {
    const page = mg.page;
    await openSheet(mg, 'Paser');
    await page.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    await page.getByRole('button', { name: '🛒 Zrób z niego handlarza' }).click();
    const section = page.getByTestId('merchant-section');
    await expect(section).toBeVisible();
    await section.getByLabel('Szyld').fill('Spod lady');
    await section.getByLabel('Szyld').press('Tab');
    await section.getByLabel('Cena %').fill('120');
    await section.getByLabel('Cena %').press('Enter');
    // Przełączniki pokazują stan serwera (nakładka przychodzi z `merchant:update`),
    // więc klik, a potem czekanie — `check()` chce zmiany w tej samej chwili.
    await section.getByLabel('Bez dna: Latarka').click();
    await expect(section.getByLabel('Bez dna: Latarka')).toBeChecked();
    await section.getByLabel(`Ukryty: ${hiddenName}`).click();
    await expect(section.getByLabel(`Ukryty: ${hiddenName}`)).toBeChecked();
    paserShop = queryOne<{ id: string }>(
      'SELECT id FROM Merchant WHERE characterId = ?',
      characterId('Paser'),
    )!.id;
    await expect.poll(() => merchantRow(paserShop)).toMatchObject({ open: 0, priceMul: 120 });
    await expect.poll(() => merchantRow(paserShop)?.rows ?? '').toContain('paser-ukryty');
    await shot(mg, '6-sekcja-sklep');
    await closeSheet(page);

    await menuOn(marek, 'Paser', '🤝 Wymiana…');
    const shopOption = counterpart(marek).locator('option', { hasText: 'Spod lady' });
    await expect(shopOption).toHaveText(/Zamknięte/);
    await expect(shopOption).toHaveAttribute('disabled', '');
    for (const player of [marek, ola]) await expectClean(player, canaries.secretNow);
  });

  test('46a.7 „🛒 Otwórz sklep” z menu figury; Marek kupuje dwie latarki i kurtkę', async () => {
    const mark = lastLedgerId();
    await menuOn(mg, 'Paser', '🛒 Otwórz sklep');
    await expect.poll(() => merchantRow(paserShop)?.open).toBe(1);
    // Okno Marka stoi na półce od 46a.6 — otwarcie przychodzi samo (`merchant:update`).
    const window = exchange(marek);
    await expect(window).toHaveAttribute('data-exchange-mode', 'merchant');
    await expect(window.locator('.exchange-closed')).toHaveCount(0);
    const shelf = window.locator('.trade-zone', { hasText: 'Towar: Spod lady' });
    await expect(shelf.locator('.inventory-row', { hasText: 'Latarka' })).toContainText('24 ed');
    await expect(shelf.locator('.inventory-row', { hasText: 'Latarka' })).toContainText('∞');
    await expect(
      shelf.locator('.inventory-row', { hasText: 'Lekka kurtka kuloodporna' }),
    ).toContainText('120 ed');
    await expect(shelf).not.toContainText(hiddenName);
    await window.getByRole('button', { name: 'Do koszyka: Latarka' }).click();
    await window.getByRole('button', { name: 'Do koszyka: Latarka' }).click();
    await window.getByRole('button', { name: 'Do koszyka: Lekka kurtka kuloodporna' }).click();
    await expect(window.getByTestId('exchange-total')).toContainText('Płacisz 168 ed');
    await shot(marek, '7-sklep-koszyk');
    const eddies = card('Kowal').eddies;
    await window.getByRole('button', { name: 'Zapłać' }).click();
    await expect.poll(() => card('Kowal').eddies).toBe(eddies - 168);
    expect(ledger('Kowal', mark)).toEqual([['purchase', -168]]);
    expect(ledger('Paser', mark)).toEqual([['sale', 168]]);
    // „∞” zostaje na półce, kurtka zeszła; kupiona przychodzi zdjęta.
    expect(gear('Paser', 'Latarka')).toBe(3);
    expect(card('Paser').armor.map((row) => row.name)).not.toContain('Lekka kurtka kuloodporna');
    expect(
      card('Kowal').armor.find((row) => row.name === 'Lekka kurtka kuloodporna')?.equipped,
    ).toBe(false);
    expect(gear('Kowal', 'Latarka')).toBe(3);
  });

  test('46a.8 kupno i sprzedaż w jednej transakcji; „Pancerz” bez katalogu wyszarzony', async () => {
    const mark = lastLedgerId();
    const window = exchange(marek);
    await expect(
      window.locator('.exchange-row--blocked', { hasText: 'Pancerz' }).first(),
    ).toHaveAttribute('title', 'Bez ceny w katalogu — handlarz tego nie wyceni.');
    await window.getByRole('button', { name: 'Sprzedaj: Bardzo ciężki pistolet' }).click();
    await window.getByRole('button', { name: 'Do koszyka: Latarka' }).click();
    const total = await window.getByTestId('exchange-total').innerText();
    const sold = Number(/dostajesz (\d+) ed/.exec(total)![1]);
    expect(sold).toBeGreaterThan(0);
    const before = { kowal: card('Kowal').eddies, paser: card('Paser').eddies };
    await window.getByRole('button', { name: 'Zapłać' }).click();
    await expect.poll(() => card('Kowal').eddies).toBe(before.kowal - 24 + sold);
    expect(card('Paser').eddies).toBe(before.paser + 24 - sold);
    expect(ledger('Kowal', mark)).toEqual([
      ['purchase', -24],
      ['sale', sold],
    ]);
    expect(card('Kowal').weapons.map((row) => row.name)).not.toContain('Bardzo ciężki pistolet');
    // Odkupiona rzecz od razu na półce (decyzja MG z 08.10).
    await expect(window.locator('.trade-zone', { hasText: 'Towar: Spod lady' })).toContainText(
      'Bardzo ciężki pistolet',
    );
  });

  test('46a.9 Ola daleko od baru: Paser wyszarzony „Za daleko”, surowe zlecenie — OUT_OF_REACH', async () => {
    await exchangeFromSheet(ola, 'Iskra');
    const option = counterpart(ola).locator('option', { hasText: 'Spod lady' });
    await expect(option).toHaveText(/Za daleko/);
    await expect(option).toHaveAttribute('disabled', '');
    const before = card('Iskra');
    expect(
      await emitAck(olaSocket, 'merchant:deal', {
        merchantId: paserShop,
        characterId: characterId('Iskra'),
        buy: [{ list: 'gear', rowId: 'paser-latarka', qty: 1 }],
        sell: [],
        expectTotal: 24,
      }),
    ).toEqual({ ok: false, error: 'OUT_OF_REACH' });
    expect(card('Iskra')).toEqual(before);
  });

  test('46a.10 ostatnia sztuka: Marek i Ola naraz po Kevlar — jedna sprzedaż', async () => {
    await place('Iskra', 13, 12);
    const before = money();
    const order = (socket: Socket, name: string) =>
      emitAck(socket, 'merchant:deal', {
        merchantId: paserShop,
        characterId: characterId(name),
        buy: [{ list: 'armor', rowId: 'paser-kevlar', qty: 1 }],
        sell: [],
        expectTotal: 60,
      });
    const results = await Promise.all([order(marekSocket, 'Kowal'), order(olaSocket, 'Iskra')]);
    expect(results.filter((ack) => ack.ok)).toHaveLength(1);
    expect(results.filter((ack) => !ack.ok)).toHaveLength(1);
    const kevlars = ['Kowal', 'Iskra'].flatMap((name) =>
      card(name).armor.filter((row) => row.name === 'Kevlar'),
    );
    expect(kevlars).toHaveLength(1);
    expect(card('Paser').armor.map((row) => row.name)).not.toContain('Kevlar');
    expect(money()).toBe(before);
  });

  test('46a.11 MG zmienia cenę przy pełnym koszyku Oli: QUOTE_CHANGED, potem nowa cena', async () => {
    await chooseCounterpart(ola, 'Spod lady');
    const window = exchange(ola);
    await expect(window).toHaveAttribute('data-exchange-mode', 'merchant');
    await window.getByRole('button', { name: 'Do koszyka: Latarka' }).click();
    await expect(window.getByTestId('exchange-total')).toContainText('Płacisz 24 ed');
    okData(
      await gm('merchant:config', {
        characterId: characterId('Paser'),
        merchant: { priceMul: 150 },
      }),
    );
    // Półka przychodzi sama (`merchant:update`), stopka liczy nową cenę.
    await expect(window.getByTestId('exchange-total')).toContainText('Płacisz 30 ed');
    await shot(ola, '11-sklep');
    expect(
      await emitAck(olaSocket, 'merchant:deal', {
        merchantId: paserShop,
        characterId: characterId('Iskra'),
        buy: [{ list: 'gear', rowId: 'paser-latarka', qty: 1 }],
        sell: [],
        expectTotal: 24,
      }),
    ).toEqual({ ok: false, error: 'QUOTE_CHANGED' });
    const eddies = card('Iskra').eddies;
    await window.getByRole('button', { name: 'Zapłać' }).click();
    await expect.poll(() => card('Iskra').eddies).toBe(eddies - 30);
    expect(gear('Iskra', 'Latarka')).toBe(2);
  });

  test('46a.12 drugi handlarz „Sieć Militechu”: zdalny, w doku „Sklepy (1)”, bez zasięgu', async () => {
    const siec = okData(await gm('character:create', { name: 'Kontakt Militechu' })) as {
      id: string;
    };
    okData(
      await gm('character:update', {
        characterId: siec.id,
        patch: {
          data: {
            gear: [
              { id: 'siec-agent', name: 'Agent', qty: 5, compendiumId: 'gear.agent', notes: '' },
            ],
          },
        },
      }),
    );
    siecShop = (
      okData(
        await gm('merchant:config', {
          characterId: siec.id,
          merchant: {
            sign: 'Sieć Militechu',
            access: 'remote',
            betweenSessions: true,
            open: true,
            cashInfinite: true,
          },
        }),
      ) as { merchantId: string }
    ).merchantId;
    for (const player of [marek, ola]) {
      await expect(dock(player).getByRole('button', { name: '🛒 Sklepy (1)' })).toBeVisible();
    }
    const mark = lastLedgerId();
    await dock(marek).getByRole('button', { name: '🛒 Sklepy (1)' }).click();
    await shot(marek, '12-dok-sklepy');
    await dock(marek).getByRole('button', { name: 'Sieć Militechu' }).click();
    const window = exchange(marek);
    await expect(window).toHaveAttribute('data-exchange-mode', 'merchant');
    await window.getByRole('button', { name: 'Do koszyka: Agent' }).click();
    await expect(window.getByTestId('exchange-total')).toContainText('Płacisz 100 ed');
    await window.getByRole('button', { name: 'Zapłać' }).click();
    await expect.poll(() => gear('Kowal', 'Agent')).toBe(1);
    expect(ledger('Kowal', mark)).toEqual([['purchase', -100]]);
    await window.getByRole('button', { name: 'Zamknij okno wymiany' }).click();
  });

  test('46a.13 między sesjami: Marek kupuje w „Sieci Militechu”, Paser — SESSION_NOT_RUNNING', async () => {
    okData(await gm('session:end', { campaignId: campaignId() }));
    const screen = marek.page.getByRole('region', { name: 'Między sesjami' });
    await expect(screen).toBeVisible();
    await expect(ola.page.getByRole('region', { name: 'Między sesjami' })).toBeVisible();
    // Półka Pasera z 46a.11 stoi dalej w oknie Oli — mówi, czemu nie kupi.
    await expect(exchange(ola)).toContainText('Ten sklep działa tylko w trakcie sesji.');
    await shot(ola, '13-miedzy-sesjami');
    await screen.getByRole('button', { name: '🛒 Sieć Militechu' }).click();
    const window = exchange(marek);
    await expect(window).toHaveAttribute('data-exchange-mode', 'merchant');
    await window.getByRole('button', { name: 'Do koszyka: Agent' }).click();
    await window.getByRole('button', { name: 'Zapłać' }).click();
    await expect.poll(() => gear('Kowal', 'Agent')).toBe(2);
    expect(
      await emitAck(marekSocket, 'merchant:deal', {
        merchantId: paserShop,
        characterId: characterId('Kowal'),
        buy: [{ list: 'gear', rowId: 'paser-latarka', qty: 1 }],
        sell: [],
        expectTotal: 30,
      }),
    ).toEqual({ ok: false, error: 'SESSION_NOT_RUNNING' });
    await window.getByRole('button', { name: 'Zamknij okno wymiany' }).click();
    okData(await gm('session:start', { campaignId: campaignId() }));
    await expect(screen).toHaveCount(0);
    for (const actor of [marek, ola]) {
      await expect.poll(() => viewedScene(actor)).toBe('Knajpa');
    }
  });

  test('46a.14 „Zakupy z katalogu: tylko u handlarzy”: gracz nie kupi w Kompendium, MG tak', async () => {
    okData(await gm('campaign:catalog-shopping', { mode: 'merchants' }));
    const page = marek.page;
    await page.getByRole('button', { name: 'Kompendium', exact: true }).click();
    const panel = page.locator('.compendium-panel');
    await expect(panel).toContainText('Kupujesz u handlarzy');
    await expect(panel.getByRole('button', { name: /^Kup — / })).toHaveCount(0);
    expect(
      await emitAck(marekSocket, 'economy:buy', {
        characterId: characterId('Kowal'),
        entryId: 'gear.latarka',
      }),
    ).toEqual({ ok: false, error: 'CATALOG_CLOSED' });
    okData(await gm('economy:buy', { characterId: characterId('Kowal'), entryId: 'gear.latarka' }));
    okData(await gm('campaign:catalog-shopping', { mode: 'everywhere' }));
  });

  test('46a.16 F5 Oli w handlu i przy półce; restart serwera: sklep stoi, handel znika', async () => {
    test.setTimeout(3 * 60_000);
    // Ola trzyma półkę Pasera (46a.11), Marek zaprasza ją do handlu.
    await menuOn(marek, 'Iskra', '🤝 Wymiana…');
    await expect(exchange(marek)).toContainText('Czekasz, aż Iskra przyjmie zaproszenie');
    await dock(ola).getByRole('button', { name: 'Przyjmij' }).click();
    await expect(exchange(ola)).toHaveAttribute('data-exchange-mode', 'trade');

    await ola.page.reload();
    await expect.poll(() => viewedScene(ola)).toBe('Knajpa');
    await expect(dock(ola)).toContainText('Handel: Kowal ⇄ Iskra');
    await exchangeFromSheet(ola, 'Iskra');
    await chooseCounterpart(ola, 'Spod lady');
    await expect(
      exchange(ola).locator('.inventory-row', { hasText: 'Latarka' }).last(),
    ).toContainText('30 ed');

    await stopServer();
    await startServer(DEAD_GATEWAY);
    // Po restarcie: sklep jest w bazie, otwarty handel był tylko w pamięci.
    await expect(dock(ola)).not.toContainText('Handel: Kowal ⇄ Iskra', { timeout: 45_000 });
    await expect(dock(marek)).not.toContainText('Handel: Kowal ⇄ Iskra', { timeout: 45_000 });
    expect(
      query<{ id: string }>('SELECT id FROM Merchant')
        .map((row) => row.id)
        .sort(),
    ).toEqual([paserShop, siecShop].sort());
    // Półka wraca do okna, które ją trzymało (`refreshMerchants` po `state:sync`).
    okData(
      await emitAck(await mg.socket(), 'merchant:config', {
        characterId: characterId('Paser'),
        merchant: { priceMul: 100 },
      }),
    );
    await expect(
      exchange(ola).locator('.inventory-row', { hasText: 'Latarka' }).last(),
    ).toContainText('20 ed', { timeout: 30_000 });
    await expect(dock(marek).getByRole('button', { name: '🛒 Sklepy (1)' })).toBeVisible();
    gmSocket = await mg.socket();
    marekSocket = await marek.socket();
    olaSocket = await ola.socket();
  });

  test('46a.15 Paser ginie: sklep zamknięty, ciało do przeszukania — w całości, z ukrytym', async () => {
    okData(
      await gm('character:update', {
        characterId: characterId('Paser'),
        patch: { data: { hpCurrent: 0 } },
      }),
    );
    okData(await gm('token:update', { tokenId: token('Paser').id, patch: { statuses: ['dead'] } }));
    await expect(
      exchange(ola).getByText('Handlarz nie obsłuży — półkę widać, kupić się nie da.'),
    ).toBeVisible();
    await exchange(ola).getByRole('button', { name: 'Zamknij okno wymiany' }).click();
    await menuOn(marek, 'Paser', '🤝 Wymiana…');
    await expect(exchange(marek)).toHaveAttribute('data-exchange-mode', 'loot');
    // Ukrycie dotyczy półki, nie kieszeni (decyzja z 08.10).
    canaries.reveal(hiddenName);
    await expect(exchange(marek)).toContainText(hiddenName);
    await shot(marek, '15-lup-handlarza');
    await expect(counterpart(marek).locator('option', { hasText: '🛒 Spod lady' })).toHaveCount(0);
    // F5 i restart z 46a.16 zostawiają w konsoli przerwane gniazda (Firefox:
    // „can’t establish a connection”, „interrupted while the page was loading”;
    // Chromium: 500 na `transport=polling`) — to skutek kroku, nie błąd.
    const restartNoise =
      /establish a connection|interrupted while the page was loading|transport=polling|ERR_CONNECTION_REFUSED/;
    for (const actor of [mg, marek, ola]) {
      expect(
        actor.unexpectedErrors().filter((text) => !restartNoise.test(text)),
        actor.name,
      ).toEqual([]);
    }
  });
});
