import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { creatorWindow, goToStep, openCreator } from '../../fixtures/creator.ts';
import { compendiumEntry, pickCalibre } from '../../fixtures/kompendium.ts';
import { LLM_TIMEOUT_MS, requireGateway } from '../../fixtures/llm.ts';
import { KNAJPA } from '../../fixtures/maps.ts';
import { MEASUREMENTS_DIR } from '../../fixtures/pomiary.ts';
import { campaignId, characterId } from '../../fixtures/nocna-zmiana.ts';
import { queryOne, startFromPoT6, viewedScene } from '../../fixtures/regresja.ts';
import { clickOnMap, fitCamera, tokenCentre } from '../../fixtures/scene.ts';
import { emitAck, type Ack } from '../../fixtures/socket.ts';
import { createInvitation } from '../../fixtures/table.ts';
import { cellCentre, closeSheet, openSheet, sheet, token } from '../../fixtures/walka.ts';

/**
 * Etap 46c — zapas amunicji (`etap-46-wymiana-sklepy.md`, tabela „E2E 46c”).
 * Start z `po-T6` („Nocna zmiana”, „Knajpa”): Marek gra Kowalem, Ola Iskrą,
 * Paser stoi przy barze. MG i Marek w Chromium, **Ola w Firefoksie**.
 *
 * Od 46c2 łańcuch T3a–T5b kupuje i zużywa amunicję (zwykła z kreatora,
 * przeciwpancerna od MG, granat z pudełka), więc 46c.0 sprawdza stan, który
 * zostawił; kolejne kroki ustawiają pudełka ręką MG. Odstępstwa od tabeli:
 * 46c.1–46c.3 idą poza walką (Akcję i `NO_AMMO` bez Akcji sprawdza
 * `ammo-stock.test.ts` na serwerze), 46c.8 kończy się na podsumowaniu kreatora
 * (karta, którą zapisze „Utwórz”, to `creationOutcome` — test serwera trzyma
 * oba wyniki równo). 46c.9 (`@llm`) pomija się bez gatewaya.
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
  ammoStock?: string;
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

  test.beforeAll(async () => {
    // Gateway żywy (o ile stoi) — 46c.9 gra turę bota; reszta pliku modelu nie woła.
    await startFromPoT6();
  });

  test.afterAll(async ({ cast }) => {
    for (const socket of [gmSocket, marekSocket, olaSocket]) socket?.disconnect();
    await cast.closeAll();
  });

  test('46c.0 stół: zapas z łańcucha; stary tekst „Amunicja (zapas)” to notatka', async ({
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
    okData(await gm('economy:adjust', { characterId: characterId('Kowal'), balance: 1000 }));

    // Łańcuch od 46c2: zwykła z kreatora (T3a, 20) + 7 oddanych przy zmianie rodzaju
    // (T5b 5.9), przeciwpancerna od MG (T5a, 20) − 8 do magazynka; granat 2/2 (#82, T4b).
    expect(stock('Kowal', VHP)).toBe(27);
    expect(stock('Kowal', VHP, 'ammo.armour-piercing')).toBe(12);
    expect(weapon('Kowal', 'Granat odłamkowy')).toMatchObject({ ammoCurrent: 2, ammoMax: 2 });
    expect(card('Kowal').ammoStock ?? '').toBe('');

    // Migracja „nic” (decyzja MG 12): stary tekst z kart sprzed 46c zostaje
    // notatką do przepisania — bez pola do wpisywania.
    await setCard('Kowal', { ammoStock: 'Przeciwpancerna do B.C. pistoletu × 16' });
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
    await setCard('Kowal', {
      gear: [...card('Kowal').gear.filter((row) => !row.ammo), box(20, VHP)],
    });
    await openSheet(marek, 'Kowal');
    await marek.page.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
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
    await marek.page.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
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
    await marek.page.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
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
    // Po T4b granat jest pełny (2/2) — MG zostawia jedną sztukę, żeby rzut go opróżnił.
    await setCard('Kowal', {
      weapons: card('Kowal').weapons.map((row) =>
        row.name === 'Granat odłamkowy' ? { ...row, ammoCurrent: 1 } : row,
      ),
    });
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
    // Cennik domowy: amunicja w cenach podręcznika — paczka zwykłej 10 ed.
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

    // MG wykłada pudełko u Pasera „Dodaj za darmo”, Marek kupuje pięć naboi po 3 ed.
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
        expectTotal: 15,
      }),
    );
    await expect.poll(() => stock('Kowal', VHP)).toBe(50);
    expect(stock('Paser', VHP)).toBe(25);
    expect(boxes('Kowal', VHP).filter((row) => row.ammo?.ammoId === null)).toHaveLength(1);
  });

  test('46c.7b Ola w Firefoksie: karta i pasek pokazują zapas', async () => {
    await setCard('Iskra', { gear: [...card('Iskra').gear, box(16, HEAVY, null, 'iskra-c')] });
    await openSheet(ola, 'Iskra');
    await ola.page.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
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
    // Cennik domowy (47a): Średni pistolet to 500 ed — cały budżet Krawędziarza,
    // więc MG bierze Kompletny Pakiet (2550 ed), żeby starczyło na paczkę naboi.
    await goToStep(page, /Rola/);
    // Radio odbija stan szkicu z serwera — `check()` nie doczekałby się zmiany.
    await window.getByRole('radio', { name: /Kompletny Pakiet/ }).click();
    await expect(window.getByRole('radio', { name: /Kompletny Pakiet/ })).toBeChecked();
    await goToStep(page, /Wyposażenie/);
    await expect(window.getByText(/2\s550 ed startowych/)).toBeVisible();
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

  test('46c.9 @llm towarzysz-bot bez amunicji kończy turę wyborem, nie pętlą odmów', async () => {
    await requireGateway();
    // Kumpel: karta bez właściciela z profilem towarzysza — drużyna, więc liczy
    // amunicję (`cpredTracksAmmo`). Pistolet pusty, pudełek brak, w drugiej ręce
    // broń biała; Paser przy barze to drugi uczestnik walki.
    const kumpel = okData(await gm('character:create', { name: 'Kumpel' })) as { id: string };
    const pistol = weapon('Kowal', 'Bardzo ciężki pistolet');
    const { ammoId: _loaded, ...unloaded } = pistol;
    void _loaded;
    await setCard('Kumpel', {
      weapons: [
        { ...unloaded, id: 'kumpel-vhp', ammoCurrent: 0 },
        { ...weapon('Kowal', 'Średnia broń biała'), id: 'kumpel-noz' },
      ],
      gear: [],
    });
    const scene = queryOne<{ id: string }>(`SELECT id FROM Scene WHERE name = 'Knajpa'`)!;
    const near = token('Paser');
    const placed = okData(
      await gm('token:create', {
        sceneId: scene.id,
        name: 'Kumpel',
        x: near.x - cell,
        y: near.y + cell,
        characterId: kumpel.id,
      }),
    ) as { id: string };
    const bot = okData(
      await gm('bot:create', {
        name: 'Kumpel',
        data: {
          type: 'companion',
          autonomy: 'auto',
          persona: {
            personality: 'Małomówny ochroniarz, który trzyma się Kowala.',
            motivations: 'Wyjść z Knajpy w jednym kawałku.',
            secrets: '',
            speechStyle: 'Krótko, po ulicznemu.',
            catchphrases: [],
          },
        },
      }),
    ) as { id: string };
    okData(
      await gm('bot:update', { botId: bot.id, patch: { characterId: kumpel.id, active: true } }),
    );
    const started = okData(
      await gm('combat:start', { sceneId: scene.id, tokenIds: [placed.id, near.id] }),
    ) as { combatants: { id: string; tokenId: string }[] };
    for (const row of started.combatants) {
      okData(
        await gm('combat:set-initiative', {
          combatantId: row.id,
          initiative: row.tokenId === placed.id ? 20 : 5,
        }),
      );
    }
    okData(await gm('combat:next', {}));

    const traces: {
      decision: string | null;
      outcome: string;
      refusal?: string;
      optionLabel?: string;
    }[] = [];
    gmSocket.on('bot:action-trace', (trace: (typeof traces)[number]) => traces.push(trace));
    try {
      const played = okData(
        await emitAck(gmSocket, 'bot:play-turn', { tokenId: placed.id }, LLM_TIMEOUT_MS),
      ) as { outcome: string; steps: number; refusal?: string };
      test
        .info()
        .annotations.push(
          { type: 'tura Kumpla', description: JSON.stringify(played) },
          { type: 'ślad decyzji', description: JSON.stringify(traces) },
        );
      // Menu bez „przeładuj” (zapas 0): bot wybiera wręcz, ruch albo pas. Odmowa
      // z poprawką kończy turę (serwer zgłasza wtedy `refused`, nawet gdy druga
      // decyzja to pas) — pętli nie ma, bo tura ma najwyżej dwa kroki.
      expect(played.steps).toBeGreaterThan(0);
      expect(played.steps).toBeLessThanOrEqual(2);
      expect(traces.map((trace) => trace.decision)).not.toContain('reload');
      expect(traces.filter((trace) => /amunicji/.test(trace.refusal ?? ''))).toEqual([]);
      expect(card('Kumpel').weapons[0]!.ammoCurrent, 'magazynek nie napełnił się z niczego').toBe(
        0,
      );
    } finally {
      gmSocket.off('bot:action-trace');
      await gm('combat:end', {});
    }
  });
});
