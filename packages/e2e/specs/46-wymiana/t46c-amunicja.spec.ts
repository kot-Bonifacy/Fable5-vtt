import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { creatorWindow, goToStep, openCreator } from '../../fixtures/creator.ts';
import { compendiumEntry, giveAmmo } from '../../fixtures/kompendium.ts';
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
 * Etap 46c — zapas amunicji (`etap-46-wymiana-sklepy.md`, tabela „E2E 46c”),
 * od 23.10.2026 pod zasadą domową MG: **kule, śrut i strzały się nie kończą**
 * (Przeładowanie napełnia magazynek za darmo, pudełek nie ma), a granaty
 * i rakiety liczy każda karta — także NPC; „Licz amunicję” zniknęło.
 * Start z `po-T6` („Nocna zmiana”, „Knajpa”): Marek gra Kowalem, Ola Iskrą,
 * Paser stoi przy barze. MG i Marek w Chromium, **Ola w Firefoksie**.
 *
 * Odstępstwa od tabeli: kroki idą poza walką (Akcję i `NO_AMMO` bez Akcji
 * sprawdza `ammo-stock.test.ts` na serwerze), 46c.8 kończy się na
 * podsumowaniu kreatora. 46c.9 (`@llm`) pomija się bez gatewaya.
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
};

const VHP = 'B.C. Pistolet';

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

  test('46c.0 stół: pudełek kul nie ma; stary tekst „Amunicja (zapas)” to notatka', async ({
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

    // Zasada domowa MG z 23.10: kule, śrut i strzały się nie kończą — pudełek
    // nie ma ani z łańcucha, ani sprzed zasady (start serwera i odczyt karty
    // je zdejmują). Granat 2/2 (#82, T4b) dalej liczy sztuki.
    expect(card('Kowal').gear.filter((row) => row.ammo && row.ammo.pattern !== 'grenade')).toEqual(
      [],
    );
    expect(weapon('Kowal', 'Granat odłamkowy')).toMatchObject({ ammoCurrent: 2, ammoMax: 2 });
    expect(card('Kowal').ammoStock ?? '').toBe('');
    expect(card('Kowal')).not.toHaveProperty('ammoTracked');

    // Migracja „nic” (decyzja MG 12): stary tekst z kart sprzed 46c zostaje
    // notatką do przepisania — bez pola do wpisywania.
    await setCard('Kowal', { ammoStock: 'Granaty odłamkowe × 3' });
    await openSheet(marek, 'Kowal');
    await marek.page.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    await expect(marek.page.getByText('Amunicja (stary zapis)')).toBeVisible();
    await expect(marek.page.getByLabel('Amunicja (zapas)')).toHaveCount(0);
    await closeSheet(marek.page);
  });

  test('46c.1 kule się nie kończą: ⟳ napełnia magazynek bez pudełek, karta nie liczy zapasu', async () => {
    await setVhp(0);
    await openSheet(marek, 'Kowal');
    await marek.page.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    const reload = marek.page.getByRole('button', { name: `Przeładuj do pełna (${VHP})` });
    const row = marek.page.locator('tr', { has: reload });
    await expect(row.locator('.weapon-ammo-stock')).toHaveCount(0);
    await expect(reload).toBeEnabled();
    await reload.click();
    await expect.poll(() => weapon('Kowal', 'Bardzo ciężki pistolet').ammoCurrent).toBe(8);
    expect(boxes('Kowal', VHP)).toEqual([]);
    await shot(marek, '1-karta-bez-dna', '.weapon-table');
    await closeSheet(marek.page);
  });

  test('46c.2–3 granat: mały zapas ładuje resztę, pudełko znika; bez zapasu NO_AMMO i szary ⟳', async () => {
    await setCard('Kowal', {
      weapons: card('Kowal').weapons.map((row) =>
        row.name === 'Granat odłamkowy' ? { ...row, ammoCurrent: 0 } : row,
      ),
      gear: [...card('Kowal').gear.filter((row) => !row.ammo), box(1, 'Granaty')],
    });
    await openSheet(marek, 'Kowal');
    await marek.page.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    // Zapas pokazuje już tylko broń na granaty i rakiety.
    await expect(marek.page.locator('.weapon-ammo-stock')).toHaveText(['zapas 1']);
    const reload = marek.page.getByRole('button', { name: 'Przeładuj do pełna (Granaty)' });
    await reload.click();
    await expect.poll(() => weapon('Kowal', 'Granat odłamkowy').ammoCurrent).toBe(1);
    expect(boxes('Kowal', 'Granaty')).toHaveLength(0);
    // Przeładowanie bez granatów: guzik szary, a wprost — odmowa bez zmian na karcie.
    await expect(reload).toBeDisabled();
    await expect(marek.page.locator('.weapon-ammo-stock--empty')).toHaveText(['zapas 0']);
    expect(
      await emitAck(marekSocket, 'weapon:reload', {
        characterId: characterId('Kowal'),
        weaponRowId: weapon('Kowal', 'Granat odłamkowy').id,
      }),
    ).toEqual({ ok: false, error: 'NO_AMMO' });
    expect(weapon('Kowal', 'Granat odłamkowy').ammoCurrent).toBe(1);
    await closeSheet(marek.page);
  });

  test('46c.4 zmiana rodzaju kul: każdy pasujący rodzaj, bez liczb i bez pudełek', async () => {
    await setVhp(5);
    await openSheet(marek, 'Kowal');
    await marek.page.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    const picker = marek.page.getByLabel('Rodzaj naboju: Bardzo ciężki pistolet');
    await expect(picker.locator('option', { hasText: /^Amunicja przeciwpancerna$/ })).toHaveCount(
      1,
    );
    await expect(picker.locator('option', { hasText: /^Zwykła$/ })).toHaveCount(1);
    // Nic nie jest wyszarzone — rodzaj, którego „nie ma”, nie istnieje.
    await expect(
      picker.locator('option', { hasText: /^Amunicja zapalająca$/ }),
    ).not.toHaveAttribute('disabled', '');
    await picker.selectOption('ammo.armour-piercing');
    await expect
      .poll(() => weapon('Kowal', 'Bardzo ciężki pistolet'))
      .toMatchObject({ ammoCurrent: 8, ammoId: 'ammo.armour-piercing' });
    expect(boxes('Kowal', VHP)).toEqual([]);
    await shot(marek, '4-wybor-naboju', '.weapon-table');
    await closeSheet(marek.page);
  });

  test('46c.5 granat: rzut, przeładowanie bez granatów — NO_AMMO; gracz nie dopisze naboi ręką', async () => {
    // Granat po 46c.2–3 ma jedną sztukę — rzut go opróżnia.
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
    // Decyzja MG 6: łata karty gracza nie podniesie magazynka — granatu ani kul.
    await setVhp(5, 'ammo.armour-piercing');
    for (const name of ['Granat odłamkowy', 'Bardzo ciężki pistolet']) {
      const raised = card('Kowal').weapons.map((row) =>
        row.name === name ? { ...row, ammoCurrent: (row.ammoCurrent ?? 0) + 1 } : row,
      );
      expect(
        await emitAck(marekSocket, 'character:update', {
          characterId: characterId('Kowal'),
          patch: { data: { weapons: raised } },
        }),
        name,
      ).toEqual({ ok: false, error: 'AMMO_LOCKED' });
    }
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

  test('46c.6 NPC MG: kule bez dna, granaty liczy jak drużyna; „Licz amunicję” zniknęło', async () => {
    const pistol = () => card('Paser').weapons[0]!;
    const weapons = card('Paser').weapons;
    await setCard('Paser', { weapons: [{ ...pistol(), ammoCurrent: 0 }, ...weapons.slice(1)] });
    okData(
      await gm('weapon:reload', { characterId: characterId('Paser'), weaponRowId: pistol().id }),
    );
    await expect.poll(() => pistol().ammoCurrent).toBe(pistol().ammoMax);

    await openSheet(mg, 'Paser');
    await mg.page.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    await expect(mg.page.getByRole('button', { name: 'Wymiana…' })).toBeVisible();
    await expect(mg.page.getByLabel('Licz amunicję')).toHaveCount(0);
    await shot(mg, '6-npc-bez-przelacznika', '.sheet-gear-actions');
    await closeSheet(mg.page);

    // Granat w ręku NPC-a bierze sztuki z jego ekwipunku — pustego.
    const grenade = { ...weapon('Kowal', 'Granat odłamkowy'), id: 'paser-granat', ammoCurrent: 0 };
    await setCard('Paser', { weapons: [...card('Paser').weapons, grenade] });
    expect(
      await gm('weapon:reload', { characterId: characterId('Paser'), weaponRowId: grenade.id }),
    ).toEqual({ ok: false, error: 'NO_AMMO' });
    await setCard('Paser', { weapons });
  });

  test('46c.7 pudełko granatów od MG, od Oli i u Pasera skleja się w jeden wiersz; kul się nie kupuje', async () => {
    // Kompendium: zwykłej do broni palnej nie ma czego kupić — wpis mówi, że się nie kończy.
    const plain = await compendiumEntry(marek, 'Amunicja zwykła');
    await expect(plain.getByText(/Ta amunicja się nie kończy/)).toBeVisible();
    await expect(plain.getByRole('button', { name: /^Kup/ })).toHaveCount(0);
    await shot(marek, '7-kompendium');
    expect(
      await emitAck(marekSocket, 'economy:buy', {
        characterId: characterId('Kowal'),
        entryId: 'ammo.standard',
      }),
    ).toEqual({ ok: false, error: 'AMMO_CALIBRE_REQUIRED' });
    expect(
      await emitAck(marekSocket, 'economy:buy', {
        characterId: characterId('Kowal'),
        entryId: 'ammo.standard',
        weaponTypeId: 'weapon-type.very-heavy-pistol',
      }),
    ).toEqual({ ok: false, error: 'AMMO_MISMATCH' });

    // MG daje Kowalowi dwa granaty „Dodaj za darmo” (paczka = 1 sztuka, s. 344).
    await giveAmmo(mg, 'Kowal', {
      entry: 'Amunicja zwykła (granaty i rakiety)',
      calibre: 'Granaty',
      packs: 2,
    });
    await expect.poll(() => stock('Kowal', 'Granaty')).toBe(2);

    // Ola (Firefox) oddaje Kowalowi swój granat — przekazanie z „Przyjmij”.
    await setCard('Iskra', {
      gear: [...card('Iskra').gear, box(1, 'Granaty', null, 'iskra-gr')],
    });
    okData(
      await emitAck(olaSocket, 'inventory:give', {
        fromCharacterId: characterId('Iskra'),
        toCharacterId: characterId('Kowal'),
        items: [{ list: 'gear', rowId: 'iskra-gr', qty: 1 }],
      }),
    );
    await marek.page.getByRole('button', { name: 'Czat', exact: true }).click();
    const proposal = marek.page
      .locator('[data-testid="inventory-move"]', { hasText: 'Granaty' })
      .last();
    await proposal.getByRole('button', { name: 'Przyjmij', exact: true }).click();
    await expect.poll(() => stock('Kowal', 'Granaty')).toBe(3);
    expect(boxes('Kowal', 'Granaty').filter((row) => row.ammo?.ammoId === null)).toHaveLength(1);

    // MG wykłada trzy granaty u Pasera, Marek kupuje jeden (100 ed za sztukę, s. 344).
    await giveAmmo(mg, 'Paser', {
      entry: 'Amunicja zwykła (granaty i rakiety)',
      calibre: 'Granaty',
      packs: 3,
    });
    await expect.poll(() => stock('Paser', 'Granaty')).toBe(3);
    const merchantId = okData(
      await gm('merchant:config', {
        characterId: characterId('Paser'),
        merchant: { open: true, priceMul: 100 },
      }),
    ) as { merchantId: string };
    await place('Kowal', 12, 13);
    const paserBox = boxes('Paser', 'Granaty')[0]!;
    okData(
      await emitAck(marekSocket, 'merchant:deal', {
        merchantId: merchantId.merchantId,
        characterId: characterId('Kowal'),
        buy: [{ list: 'gear', rowId: paserBox.id, qty: 1 }],
        sell: [],
        expectTotal: 100,
      }),
    );
    await expect.poll(() => stock('Kowal', 'Granaty')).toBe(4);
    expect(stock('Paser', 'Granaty')).toBe(2);
    expect(boxes('Kowal', 'Granaty').filter((row) => row.ammo?.ammoId === null)).toHaveLength(1);
  });

  test('46c.7b Ola w Firefoksie: pistolet bez liczby zapasu, granat z liczbą', async () => {
    const grenade = { ...weapon('Kowal', 'Granat odłamkowy'), id: 'iskra-granat', ammoCurrent: 2 };
    await setCard('Iskra', {
      weapons: [...card('Iskra').weapons.filter((row) => row.id !== grenade.id), grenade],
      gear: [...card('Iskra').gear, box(2, 'Granaty', null, 'iskra-gr2')],
    });
    await openSheet(ola, 'Iskra');
    await ola.page.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    await expect(ola.page.locator('.weapon-ammo-stock')).toHaveText(['zapas 2']);
    await shot(ola, '7b-karta', '.weapon-table');
    await closeSheet(ola.page);
    await ola.page.keyboard.press('Escape');
    await clickOnMap(ola.page, tokenCentre(token('Iskra'), cell));
    // Slot granatu i jego „Przeładuj” — pistolet nie ma liczby zapasu wcale.
    await expect(ola.page.locator('.hud-stock')).toHaveText(['zapas 2', 'zapas 2']);
    await shot(ola, '7b-pasek');
  });

  test('46c.8 kreator: kul nie ma na półce, broń palna nie ostrzega o zapasie', async () => {
    const page = mg.page;
    await openCreator(page);
    const window = creatorWindow(page);
    // Cennik domowy (47a): Średni pistolet to 500 ed — cały budżet Krawędziarza,
    // więc MG bierze Kompletny Pakiet (2550 ed).
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
    // Kule się nie kończą — pistolet bez pudełek nie jest „bronią bez zapasu”.
    await expect(window.locator('.creator-basket')).toContainText('Średni pistolet');
    await expect(window.locator('.creator-no-stock')).toHaveCount(0);
    await window.getByRole('button', { name: 'Amunicja', exact: true }).click();
    await expect(
      window.getByRole('button', { name: 'Dołóż do koszyka: Amunicja zwykła', exact: true }),
    ).toHaveCount(0);
    await shot(mg, '8-kreator', '.creator-shop');
    await goToStep(page, /Podsumowanie/);
    await expect(window.locator('.creator-no-stock')).toHaveCount(0);
  });

  test('46c.9 @llm towarzysz-bot z pustym pistoletem przeładowuje bez pudełek, bez odmów', async () => {
    await requireGateway();
    // Kumpel: karta bez właściciela z profilem towarzysza. Pistolet pusty,
    // pudełek brak (kule się nie kończą, 23.10), w drugiej ręce broń biała;
    // Paser przy barze to drugi uczestnik walki.
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
      // „Przeładuj” jest w menu zawsze, gdy magazynek nie jest pełny — i nigdy
      // nie odmawia brakiem amunicji. Tura ma najwyżej dwa kroki.
      expect(played.steps).toBeGreaterThan(0);
      expect(played.steps).toBeLessThanOrEqual(2);
      expect(traces.filter((trace) => /amunicji/.test(trace.refusal ?? ''))).toEqual([]);
      if (traces.some((trace) => trace.decision === 'reload')) {
        expect(card('Kumpel').weapons[0]!.ammoCurrent, 'przeładowanie bez pudełek').toBe(
          pistol.ammoMax,
        );
      }
      expect(card('Kumpel').gear).toEqual([]);
    } finally {
      gmSocket.off('bot:action-trace');
      await gm('combat:end', {});
    }
  });
});
