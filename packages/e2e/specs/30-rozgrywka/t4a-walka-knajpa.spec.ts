import type { Page } from '@playwright/test';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { query, queryOne, stateFingerprint } from '../../fixtures/db.ts';
import { LLM_TIMEOUT_MS, requireGateway } from '../../fixtures/llm.ts';
import { KNAJPA } from '../../fixtures/maps.ts';
import { clickOnMap, drawCover, fitCamera, tokenCentre } from '../../fixtures/scene.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { canariesInDatabase, ONLY_FROM } from '../../fixtures/nocna-zmiana.ts';
import { Canaries } from '../../fixtures/sniffer.ts';
import { createInvitation } from '../../fixtures/table.ts';
import { giveEntry } from '../../fixtures/kompendium.ts';
import {
  activeName,
  aim,
  cellCentre,
  chipInitiatives,
  closeSheet,
  combatantOf,
  combatants,
  endPlayerTurn,
  expectClean,
  lastMessageId,
  noDodge,
  nextTurn,
  openSheet,
  queueOf,
  rollAndWait,
  rollById,
  sceneRow,
  settledWithoutApply,
  sheet,
  sumOf,
  token,
  type RollJson,
  beginFight,
  damageToCup,
} from '../../fixtures/walka.ts';
import {
  hasCheckpoint,
  pendingDice,
  restoreCheckpoint,
  saveCheckpoint,
  scriptDice,
  startInstance,
} from '../../instance/instance.ts';
import type { WorldPoint } from '../../fixtures/canvas.ts';

/**
 * T4a (`testy.md` 5.2, kroki 4.1–4.5): walka pierwsza w „Knajpie” od punktu
 * `po-T3` do połowy pierwszej rundy — przygotowanie (Zmysł Walki Kowala, broń
 * z własnych wpisów Kompendium, przewrócony stół, łup Zbira), inicjatywa, tura
 * Marka (ruch, strzał zza osłony), tura Oli (dwie prośby o Test, pięść za daleko),
 * tura bota „Rzeźnik” na żywym modelu i odsłonięcie „Cienia” w jego turze;
 * na końcu punkt kontrolny `po-T4a`.
 *
 * Decyzje MG z 26.09 (sesja T4): T4 dzielony na T4a (4.1–4.5) i T4b (4.6–4.10);
 * granat z własnego wpisu Kompendium (#18), Bijatyka Iskry z urzędu (od 47b;
 * do 10.10 własny wpis „Pięści”, #17); Zmysł Walki: Błyskawiczna reakcja 1 + Precyzyjny atak 3; Cień
 * w kolejce od startu, ukryty; tura bota — nielegalna akcja przepuszczona przez
 * serwer = B1, zawieszona tura = B2, głupia, ale legalna = obserwacja.
 *
 * Kości: asercje niezmiennicze tam, gdzie wynik nie zmienia drogi; skrypt kości
 * (`testy.md` 4.2) dla inicjatywy (stała kolejka), trafienia Kowala i rzutu Oli.
 */

/** Pole formularza w panelu (etykieta obejmuje pole, a jej nazwa niesie też opcje listy). */
function panelField(page: Page, label: string) {
  return page
    .locator('.side-panel label')
    .filter({ hasText: new RegExp(`^${label}`) })
    .locator('select, input, textarea')
    .first();
}

/** Własny wpis broni w Kompendium MG („+ Własny wpis”). */
async function customWeapon(
  page: Page,
  name: string,
  typeId: string,
  extra: { magazine?: number; cost?: number } = {},
) {
  await page.getByRole('button', { name: 'Kompendium', exact: true }).click();
  await page.getByRole('button', { name: '+ Własny wpis' }).click();
  await panelField(page, 'Kategoria').selectOption('weapon');
  await panelField(page, 'Nazwa').fill(name);
  await panelField(page, 'Typ broni').selectOption(typeId);
  if (extra.magazine !== undefined)
    await panelField(page, 'Magazynek').fill(String(extra.magazine));
  if (extra.cost !== undefined) await panelField(page, 'Cena \\(ed\\)').fill(String(extra.cost));
  await page.locator('.side-panel').getByRole('button', { name: 'Zapisz', exact: true }).click();
  await expect
    .poll(() => query('SELECT id FROM CompendiumEntry WHERE data LIKE ?', `%"name":"${name}"%`))
    .toHaveLength(1);
}

/** Własny wpis sprzętu w Kompendium MG — rzecz fabularna spoza podręcznika (48c). */
async function customGear(page: Page, name: string) {
  await page.getByRole('button', { name: 'Kompendium', exact: true }).click();
  await page.getByRole('button', { name: '+ Własny wpis' }).click();
  await panelField(page, 'Kategoria').selectOption('gear');
  await panelField(page, 'Nazwa').fill(name);
  await page.locator('.side-panel').getByRole('button', { name: 'Zapisz', exact: true }).click();
  await expect
    .poll(() => query('SELECT id FROM CompendiumEntry WHERE data LIKE ?', `%"name":"${name}"%`))
    .toHaveLength(1);
}

/** „+ Broń z katalogu” na karcie i wybór wpisu po nazwie. */
async function weaponFromCatalogue(actor: Actor, character: string, weapon: string) {
  const page = actor.page;
  await openSheet(actor, character);
  await page.getByRole('button', { name: '+ Broń z katalogu' }).click();
  const search = page.getByPlaceholder('Szukaj w katalogu broni…');
  await search.fill(weapon);
  await search.locator('xpath=ancestor::div[2]').getByText(weapon, { exact: true }).click();
  await expect
    .poll(() => sheet<{ weapons: { name: string }[] }>(character).weapons.map((w) => w.name))
    .toContain(weapon);
  await closeSheet(page);
}

test.describe.serial('T4a: walka pierwsza w „Knajpie” — inicjatywa i pierwsze tury', () => {
  let mg: Actor;
  let marek: Actor;
  let ola: Actor;
  let campaignId: string;
  let cell: number;
  /** Tajne przed obojgiem graczy (Cień do odsłonięcia, łup, PW statysty). */
  const fromPlayers = new Canaries();
  /** Tajne przed Markiem (szept i handout Oli z T3b, odrzucona prośba Oli o Test). */
  const fromMarek = new Canaries();
  /** Tajne przed Olą (szept MG do Marka i notatka Kowala z T3). */
  const fromOla = new Canaries();
  /** Wszystko, czego ten gracz nie może mieć w tej chwili. */
  const secretsFor = (player: Actor) => [
    ...fromPlayers.secretNow,
    ...(player === marek ? fromMarek : fromOla).secretNow,
  ];
  /**
   * Podsłuch sprzed „Kończę turę” (znacznik `Sniffer.mark`): ack tego zdarzenia
   * niósł pełny widok walki MG (#19, naprawione), więc 4.3 patrzy właśnie na nie.
   */
  const beforeEndTurn = new Map<Actor, number>();
  async function endTurnMarked(player: Actor) {
    beforeEndTurn.set(player, await player.sniffer.mark());
    await endPlayerTurn(player);
    await player.page.waitForTimeout(500);
  }
  /** Pole, z którego Kowal strzela zza przewróconego stołu (osłona w kratce 11,13). */
  let firingSpot: WorldPoint;

  test.beforeAll(() => {
    // Pełny przebieg idzie tu wprost po T3b; osobno — `E2E_FROM=po-T3`.
    const campaign = queryOne<{ id: string }>(
      `SELECT id FROM Campaign WHERE name = 'Nocna zmiana'`,
    );
    if (!campaign || !queryOne(`SELECT id FROM Scene WHERE name = 'Knajpa' AND active = 1`)) {
      throw new Error('E2E: T4a needs the po-T3 state (E2E_FROM=po-T3)');
    }
    campaignId = campaign.id;
    cell = sceneRow().gridSizePx;
    firingSpot = cellCentre(cell, 12, 14);
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('start z po-T3: MG, Marek i Ola przy „Knajpie”, walki jeszcze nie ma', async ({ cast }) => {
    mg = await cast.mg('chromium');
    // Zaproszenia z punktu wygasają po tygodniu — świeże z API MG (pułapka w `testy`).
    marek = await cast.gracz('Marek', 'chromium', await createInvitation(mg, campaignId, 'Marek'));
    ola = await cast.gracz('Ola', 'firefox', await createInvitation(mg, campaignId, 'Ola'));
    expect(query('SELECT id FROM Combat')).toEqual([]);
    for (const actor of [mg, marek, ola]) {
      await expect
        .poll(
          async () => (await actor.store<{ scene: { name: string } | null }>('scene'))?.scene?.name,
        )
        .toBe('Knajpa');
      // Gracz nie ma paska narzędzi MG, więc kadr kończy się wyżej, niż zakłada asercja
      // `fitCamera` — scena i tak staje na ekranie w całości (jak w T3b).
      await fitCamera(actor.page, KNAJPA.width, KNAJPA.height).catch(() => undefined);
    }
    fromPlayers.track(token('Cień').id);
    // Kanarki z T3 leżą w bazie — pilnujemy ich przez całą walkę, nie tylko nowych.
    for (const [code, label] of canariesInDatabase()) {
      const onlyFrom = ONLY_FROM[label];
      (onlyFrom === 'Marek' ? fromMarek : onlyFrom === 'Ola' ? fromOla : fromPlayers).track(code);
    }
  });

  test('przed walką: Marek rozdziela Zmysł Walki (Błyskawiczna reakcja 1, Precyzyjny atak 3)', async () => {
    const page = marek.page;
    await openSheet(marek, 'Kowal');
    // Baner „Po kreatorze zostało” prowadzi prosto do panelu.
    await page.getByRole('button', { name: 'Przejdź' }).first().click();
    await expect(page.getByText('Wolne punkty: 4 z 4')).toBeVisible();
    await page.getByRole('button', { name: 'Dołóż punkty: Błyskawiczna reakcja' }).click();
    await page.getByRole('button', { name: 'Dołóż punkty: Precyzyjny atak' }).click();
    await expect(page.getByText('Wszystkie punkty rozdzielone')).toBeVisible();
    await page.getByRole('button', { name: 'Zapisz przydział' }).click();
    await expect
      .poll(() => sheet<{ combatAwareness: Record<string, number> }>('Kowal').combatAwareness)
      .toEqual({ fastReflexes: 1, preciseAttack: 3 });
    await closeSheet(page);
  });

  test('#17 kompendium z podręcznika ma broń typu Bijatyka — pięść bez własnego wpisu MG', async () => {
    await mg.page.getByRole('button', { name: 'Kompendium', exact: true }).click();
    // Filtr typów broni pokazuje tylko typy, które mają wpisy (`title` = „Typ — liczba”).
    await expect(mg.page.locator('.side-panel button[title^="Średni pistolet"]')).toBeVisible();
    await expect(mg.page.locator('.side-panel button[title^="Bijatyka"]')).toBeVisible({
      timeout: 2_000,
    });
  });

  test('#18 kompendium z podręcznika ma granat ręczny do wzięcia na kartę', async () => {
    await mg.page.getByRole('button', { name: 'Kompendium', exact: true }).click();
    await expect(mg.page.locator('.side-panel button[title^="Granatnik"]')).toBeVisible();
    await expect(mg.page.locator('.side-panel button[title^="Granat —"]')).toBeVisible({
      timeout: 2_000,
    });
  });

  test('przed walką: MG — granaty z własnego wpisu, przewrócony stół, łup Zbira', async () => {
    test.setTimeout(4 * 60_000);
    const page = mg.page;
    // Etap 47b: Bijatykę ma każda karta z urzędu — Iskra nie potrzebuje już
    // własnego wpisu „Pięści” od MG (obejście #17 z 27.09).
    expect(sheet<{ weapons: { name: string }[] }>('Iskra').weapons.map((w) => w.name)).toEqual([
      'Bijatyka',
    ]);
    // Obejście #18: własny wpis Kompendium i broń z katalogu na karcie.
    await customWeapon(page, 'Granat odłamkowy', 'weapon-type.grenade', { magazine: 2, cost: 50 });
    await weaponFromCatalogue(mg, 'Kowal', 'Granat odłamkowy');
    const grenade = sheet<{ weapons: { name: string; ammoCurrent: number; ammoMax: number }[] }>(
      'Kowal',
    ).weapons.find((w) => w.name === 'Granat odłamkowy');
    expect([grenade?.ammoCurrent, grenade?.ammoMax]).toEqual([2, 2]);

    // Przewrócony stół w kratce (11, 13) — między polem strzału Kowala a Zbirem.
    await fitCamera(page, KNAJPA.width, KNAJPA.height);
    await drawCover(
      page,
      { x: 11 * cell + 3, y: 13 * cell + 3 },
      { x: 12 * cell - 3, y: 14 * cell - 3 },
    );
    await expect
      .poll(() => query('SELECT id FROM Cover WHERE sceneId = ?', sceneRow().id).length)
      .toBe(1);

    // Łup w kieszeni Zbira — tajny, dopóki nikt go nie przeszuka (T4b, 4.9).
    // Od etapu 48c karta nie ma pustych wierszy: rzecz fabularną MG zakłada
    // własnym wpisem w Kompendium, daje „Dodaj za darmo”, a sekret dopisuje
    // w uwagach wiersza (wpis widzi cały stół, uwagi — tylko karta).
    const loot = fromPlayers.secret('lup-Zbira');
    await customGear(page, 'Chip z kodem do chłodni');
    await giveEntry(mg, 'Zbir', 'Chip z kodem do chłodni');
    await expect
      .poll(() => sheet<{ gear: { name: string }[] }>('Zbir').gear.map((row) => row.name))
      .toContain('Chip z kodem do chłodni');
    await openSheet(mg, 'Zbir');
    await page.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    const card = page.getByRole('region', { name: 'Karta postaci: Zbir' });
    await card.getByLabel('Uwagi', { exact: true }).last().fill(`Klucz Rzeźnika. ${loot}`);
    await card.getByLabel('Uwagi', { exact: true }).last().press('Tab');
    await expect
      .poll(() => JSON.stringify(sheet<{ gear: unknown[] }>('Zbir').gear))
      .toContain(loot);
    await closeSheet(page);
  });

  test('4.1 tryb turowy: Cień w kolejce ukryty, inicjatywa kubkiem, ta sama kolejność u trojga', async () => {
    test.setTimeout(3 * 60_000);
    const page = mg.page;
    await page.getByRole('button', { name: 'Walka', exact: true }).first().click();
    for (const name of [/^Zbir$/, /^Szrama/, /^Rzeźnik$/, /^Cień/]) {
      await page.getByRole('checkbox', { name }).check();
    }
    await expect(page.getByRole('checkbox', { name: /^Paser$/ })).not.toBeChecked();
    await page.getByRole('button', { name: /Załóż starcie/ }).click();
    await expect.poll(() => combatants().length).toBe(6);
    fromPlayers.track(combatantOf('Cień').id);

    // Kolejność rzutu „Rzuć wszystkim” = kolejność dodania (Zbir, klon, Rzeźnik, Cień):
    // Zbir 2 + 6 = 8, klon 1 + 6 = 7, Rzeźnik 3 + 7 = 10, Cień 1 + 8 = 9. Cechy Kowala
    // losuje kreator T3a (Krawędziarz), więc kości graczy dobiera się z kart: Kowal na
    // dziesiątce, Iskra tuż pod nim — oboje nad Rzeźnikiem.
    async function rollInitiative(actor: Actor, face: number): Promise<RollJson> {
      scriptDice([face]);
      // Od 43a kubek inicjatywy siedzi na własnym żetonie czarnego pasa.
      await actor.page.getByRole('button', { name: /^Rzuć inicjatywę:/ }).click();
      const id = await rollAndWait(actor, lastMessageId(), 'Inicjatywa');
      const roll = rollById(id);
      // Klient wstrzymuje skutek rzutu do końca animacji kości (umowa `serwer`, 22.09),
      // więc MG widzi wynik po kilku sekundach — następny rzuca dopiero wtedy, jak przy stole.
      await expect
        .poll(() => chipInitiatives(mg), { timeout: 30_000, message: `${actor.name} na pasie MG` })
        .toContain(String(roll.total));
      return roll;
    }
    const sum = sumOf;

    const kowalRoll = await rollInitiative(marek, 10);
    test.info().annotations.push({
      type: 'karta inicjatywy Kowala',
      description: `${kowalRoll.total} · ${JSON.stringify(kowalRoll.breakdown)}`,
    });
    expect(kowalRoll.breakdown?.map((row) => row.label).join(' ')).toContain(
      'Błyskawiczna reakcja 1',
    );
    expect(kowalRoll.total).toBe(10 + sum(kowalRoll));
    // Iskra bez pancerza: modyfikator = REF z karty.
    const iskraRef = sheet<{ stats: { ref: number } }>('Iskra').stats.ref;
    const iskraFace = Math.min(10, kowalRoll.total - 1 - iskraRef);
    expect(iskraRef + iskraFace, 'Iskra nad Rzeźnikiem (10)').toBeGreaterThan(10);
    const iskraRoll = await rollInitiative(ola, iskraFace);
    expect(iskraRoll.total).toBe(iskraRef + iskraFace);

    scriptDice([2, 1, 3, 1]);
    await page.getByRole('button', { name: 'Rzuć wszystkim', exact: true }).click();
    await expect.poll(() => combatants().every((c) => c.initiative !== null)).toBe(true);
    expect(pendingDice()).toBe('');

    const init = Object.fromEntries(
      ['Kowal', 'Iskra', 'Rzeźnik', 'Cień', 'Zbir', 'Szrama'].map((n) => [
        n,
        combatantOf(n).initiative,
      ]),
    );
    test.info().annotations.push({ type: 'inicjatywa', description: JSON.stringify(init) });
    expect(init).toEqual({
      Kowal: kowalRoll.total,
      Iskra: iskraRoll.total,
      Rzeźnik: 10,
      Cień: 9,
      Zbir: 8,
      Szrama: 7,
    });

    await beginFight(page);
    await expect.poll(activeName).toBe('Kowal');

    // Czarny pas: ta sama kolejność u MG i u graczy; Cień tylko u MG, klon pod aliasem.
    await expect
      .poll(async () => (await queueOf(mg)).map((n) => n.replace(/ KANAREK.*$/, '')), {
        message: 'MG',
        timeout: 30_000,
      })
      .toEqual(['Kowal', 'Iskra', 'Rzeźnik', 'Cień', 'Zbir', 'Szrama']);
    for (const player of [marek, ola]) {
      await expect
        .poll(() => queueOf(player), { message: player.name, timeout: 30_000 })
        .toEqual(['Kowal', 'Iskra', 'Rzeźnik', 'Zbir', 'Ochroniarz']);
      await expect(player.page.getByRole('group', { name: 'Kolejka inicjatywy' })).toContainText(
        /Kowal[\s\S]*Iskra[\s\S]*Rzeźnik[\s\S]*Zbir[\s\S]*Ochroniarz/,
      );
    }
  });

  test('4.2 tura Marka: ukryty cel odmówiony, ruch w budżecie, strzał zza stołu w Zbira', async () => {
    test.setTimeout(3 * 60_000);
    const kowal = token('Kowal');
    const cien = token('Cień');
    const socket = await marek.socket();
    // Ukryta figura nie istnieje dla gracza — odmowa nie może jej potwierdzić.
    expect(
      await emitAck(socket, 'attack:roll', {
        characterId: kowal.characterId,
        targetTokenId: cien.id,
        request: {
          mode: 'single',
          weaponRowId: sheet<{ weapons: { id: string }[] }>('Kowal').weapons[0]!.id,
        },
      }),
    ).toEqual({ ok: false, error: 'TOKEN_NOT_FOUND' });

    // Ruch klikiem: dwie kratki na zachód, pod przewrócony stół. Cechy Kowala losuje
    // kreator T3a, więc budżet liczy się z karty: RUCH − 2 (kara kurtki OB 12) × 2 m.
    const kowalStats = sheet<{ stats: { move: number; ref: number } }>('Kowal').stats;
    const page = marek.page;
    await clickOnMap(page, tokenCentre(kowal, cell));
    await clickOnMap(page, firingSpot);
    await expect
      .poll(() => [Math.round(token('Kowal').x), Math.round(token('Kowal').y)], { timeout: 20_000 })
      .toEqual([Math.round(12 * cell), Math.round(14 * cell)]);
    const turn = JSON.parse(combatantOf('Kowal').turnState!) as {
      metresUsed: number;
      metresPerMove: number;
      overspent: number;
    };
    expect(turn.metresPerMove).toBe((kowalStats.move - 2) * 2);
    expect(turn.metresUsed).toBeLessThanOrEqual(turn.metresPerMove);
    expect(turn.overspent).toBe(0);

    // Strzał zza własnej osłony: kość + REF + Broń krótka − 2 (kurtka) + 1 (Precyzyjny
    // atak) ≥ 21 trafia w każdym przedziale do 25 m; obrażenia 5 + 4 + 3 + 2 = 14 − OB 11 = 3.
    const zbir = token('Zbir');
    let before = lastMessageId();
    await aim(marek, firingSpot, tokenCentre(zbir, cell));
    // REF Kowala losuje kreator — kość dobiera się do modyfikatora z kubka, żeby suma
    // przekroczyła 20 (bez 10, która eksploduje).
    const cup = await marek.store<{ attack: { modifierTotal: number } | null }>('roll');
    const face = Math.min(9, Math.max(2, 21 - (cup?.attack?.modifierTotal ?? 0)));
    scriptDice([face]);
    const attackId = await rollAndWait(marek, before, 'Bardzo ciężki pistolet → Zbir');
    const attack = rollById(attackId);
    test.info().annotations.push({ type: 'karta strzału', description: JSON.stringify(attack) });
    const shotTotal = attack.total;
    expect(shotTotal).toBe(face + sumOf(attack));
    expect(shotTotal).toBeGreaterThanOrEqual(21);
    expect(attack.breakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Refleks (REF)', value: kowalStats.ref }),
      ]),
    );
    expect(attack.breakdown).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'Precyzyjny atak 1', value: 1 })]),
    );
    expect(attack.attack?.hit).toBe(true);
    expect(attack.attack?.system?.dvSource).toBe('range');

    // Ta sama karta u trojga: liczba z bazy na ostatniej karcie rzutu każdego.
    for (const actor of [mg, marek, ola]) {
      await actor.page.getByRole('button', { name: /^Czat/ }).first().click();
      await expect(
        actor.page.locator('.chat-roll', { hasText: 'Bardzo ciężki pistolet → Zbir' }).last(),
        actor.name,
      ).toContainText(String(shotTotal));
    }

    await noDodge(mg, attackId, 'Bardzo ciężki pistolet → Zbir');
    scriptDice([5, 4, 3, 2]);
    before = lastMessageId();
    await damageToCup(marek.page, 'Bardzo ciężki pistolet → Zbir');
    await rollAndWait(marek, before, 'Bardzo ciężki pistolet — obrażenia');

    // Obrażenia rozliczają się same na celu z karty strzału (decyzja MG z 03.10):
    // nikt nie klika „Zastosuj”, a MG nie ma go już na karcie.
    await expect.poll(() => sheet<{ hpCurrent: number }>('Zbir').hpCurrent).toBe(22);
    await settledWithoutApply(mg, 'Bardzo ciężki pistolet — obrażenia');
    await expect(
      marek.page
        .locator('.chat-message', { hasText: 'Bardzo ciężki pistolet — obrażenia' })
        .last()
        .getByRole('button', { name: 'Zastosuj' }),
    ).toHaveCount(0);
    const armor = sheet<{ armor: { location: string; spCurrent: number }[] }>('Zbir').armor;
    expect(armor.find((a) => a.location === 'body')?.spCurrent).toBe(10);
    expect(armor.find((a) => a.location === 'head')?.spCurrent).toBe(11);
    expect(
      sheet<{ weapons: { name: string; ammoCurrent: number }[] }>('Kowal').weapons.find(
        (w) => w.name === 'Bardzo ciężki pistolet',
      )?.ammoCurrent,
    ).toBe(7);

    // Cudze PW nie opuszczają serwera: gracz widzi „stracił 3”, nie „25 → 22”.
    fromPlayers.track('"hp":{"before":25,"after":22');
    for (const player of [marek, ola]) {
      await expect
        .poll(
          async () => {
            const chat = await player.store<{
              items: { message?: { kind: string; damage?: Record<string, unknown> } }[];
            }>('chat');
            const card = chat?.items.filter((i) => i.message?.kind === 'damage').pop()
              ?.message?.damage;
            return card ? [card.hpLost, 'hp' in card] : null;
          },
          { message: player.name },
        )
        .toEqual([3, false]);
      const tokenState = await player.store<{ tokens: Record<string, { hp?: unknown }> }>('token');
      expect(tokenState?.tokens[zbir.id]?.hp ?? null, player.name).toBeNull();
    }

    await endTurnMarked(marek);
    expect(activeName()).toBe('Iskra');
  });

  test('4.3 tura Oli: prośba o Test przyciskiem i Alt+klikiem, pięść za daleko', async () => {
    test.setTimeout(3 * 60_000);
    const page = ola.page;
    // Droga pierwsza: klik w wiersz Umiejętności → okno rzutu → „Poproś MG”.
    await openSheet(ola, 'Iskra');
    await page
      .getByRole('button', { name: /^Percepcja \(INT\)/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Poproś MG', exact: true }).click();
    await page.locator('#check-request-reason').fill('Czy widzę, skąd strzela Rzeźnik?');
    await page.getByRole('button', { name: 'Wyślij prośbę' }).click();
    // Droga druga: Alt + klik w wiersz Umiejętności — od razu okno prośby.
    await page
      .getByRole('button', { name: /^Skradanie się \(ZW\)/ })
      .first()
      .click({ modifiers: ['Alt'] });
    await expect(page.locator('.check-request-dialog')).toContainText('Iskra — Skradanie się (ZW)');
    await page
      .locator('#check-request-reason')
      .fill(`Chcę przemknąć pod oknem do drzwi. ${fromMarek.secret('prosba-Oli')}`);
    await page.getByRole('button', { name: 'Wyślij prośbę' }).click();
    await closeSheet(page);

    // Obie prośby czekają u MG; gracz Marek ich nie widzi.
    const badge = mg.page.locator('.gm-attention-badge');
    await expect(badge).toContainText('2');
    const requests = mg.page.locator('.chat-message.chat-request');
    await expect(requests).toHaveCount(2);
    await expect(marek.page.locator('.chat-message.chat-request')).toHaveCount(0);

    // Odmowa z powodem: „Odmów” otwiera pole, „Wyślij odmowę” zamyka sprawę.
    const stealth = requests.filter({ hasText: 'Skradanie się' });
    await stealth.getByRole('button', { name: 'Odmów' }).click();
    await stealth
      .locator('input[type=text]')
      .fill('Pod oknem stoi Rzeźnik — tędy nie przemkniesz.');
    await stealth.getByRole('button', { name: 'Wyślij odmowę' }).click();
    await requests
      .filter({ hasText: 'Percepcja' })
      .getByRole('button', { name: /^Codzienny/ })
      .click();
    await page.getByRole('button', { name: /^Czat/ }).first().click();
    const call = page.locator('.chat-message.chat-check', { hasText: 'Percepcja (INT)' }).last();
    await expect(call).toContainText('PT 13');
    await expect(
      marek.page.locator('.chat-message.chat-check', { hasText: 'Percepcja' }),
    ).toHaveCount(0);

    // Rzut z wezwania: 7 + INT 7 + Percepcja 4 = 18 > PT 13.
    scriptDice([7]);
    const before = lastMessageId();
    await call.getByRole('button', { name: 'Rzuć' }).click();
    await page.locator('.dialog').last().getByRole('button', { name: 'Weź kubek' }).click();
    const rolled = await rollAndWait(ola, before, 'Wezwanie: Percepcja');
    expect(rollById(rolled).total).toBe(18);
    await expect(call).toContainText(/Zdane/);
    await expect(mg.page.locator('.gm-attention-badge', { hasText: /[12]/ })).toHaveCount(0);
    const refused = page.locator('.chat-message.chat-request', { hasText: 'Skradanie się' });
    await expect(refused).toContainText('Pod oknem stoi Rzeźnik');
    await expect(refused).not.toContainText('Czeka na MG');
    await expectClean(marek, secretsFor(marek));

    // Bijatyka w Zbira (widać go z tarasu przez okno, T3b): odmowa „za daleko” notatką
    // przy stole, bez rzutu. Klik w figurę, której gracz nie widzi, byłby rozkazem marszu.
    const iskra = token('Iskra');
    const zbir = token('Zbir');
    expect(
      Object.keys((await ola.store<{ tokens: Record<string, unknown> }>('token')).tokens),
    ).toContain(zbir.id);
    await clickOnMap(page, tokenCentre(iskra, cell));
    // Pasek sam bierze jedyną broń do ręki — klik w slot by ją odłożył.
    await expect(page.getByRole('complementary', { name: 'Panel aktywnej postaci' })).toContainText(
      'W ręku: Bijatyka',
    );
    const after = lastMessageId();
    await clickOnMap(page, tokenCentre(zbir, cell));
    await page.getByRole('button', { name: /^Czat/ }).first().click();
    await expect(
      page.locator('.chat-note', { hasText: 'Do ataku wręcz cel musi być nie dalej niż 2 m.' }),
    ).toBeVisible();
    await page.waitForTimeout(500);
    expect(lastMessageId(), 'odmowa bez rzutu i bez wiersza w bazie').toBe(after);
    expect([token('Iskra').x, token('Iskra').y], 'klik w cel nie ruszył Iskry').toEqual([
      iskra.x,
      iskra.y,
    ]);

    await endTurnMarked(ola);
    expect(activeName()).toBe('Rzeźnik');
  });

  test('4.3 „Kończę turę” nie oddaje graczowi widoku walki MG (#19)', async () => {
    // Oboje gracze kończyli turę — wycieki zbierane u obojga, zanim cokolwiek padnie.
    const leaks: string[] = [];
    for (const player of [marek, ola]) {
      const since = beforeEndTurn.get(player) ?? 0;
      for (const code of await player.sniffer.found(secretsFor(player), since)) {
        leaks.push(`${player.name}: ${code}`);
        test.info().annotations.push({
          type: `wyciek u ${player.name}`,
          description: `${code} … ${await player.sniffer.evidence(code, since)}`,
        });
      }
    }
    expect(leaks).toEqual([]);
  });

  test('#20 propozycję bota zatwierdza się raz — drugi klik odmówiony', async () => {
    await requireGateway();
    // Pierwszy krok Rzeźnika (tura nietknięta, więc bot na pewno coś proponuje)
    // i dwa zatwierdzenia tej samej propozycji naraz — jak niecierpliwy MG, którego
    // karta długo nie zmienia się na „Zatwierdzone” (klient czeka na animację kości).
    // Dwie ODMOWY naraz serwer rozstrzyga dobrze — wyścig ma tylko zatwierdzenie,
    // bo wykonuje akcję i czeka na następny krok bota, zanim zapisze rozstrzygnięcie.
    const socket = await mg.socket();
    const before = lastMessageId();
    const played = await emitAck<{ outcome?: string }>(
      socket,
      'bot:play-turn',
      { tokenId: token('Rzeźnik').id },
      LLM_TIMEOUT_MS,
    );
    const pending = queryOne<{ id: number }>(
      `SELECT id FROM ChatMessage WHERE id > ? AND kind = 'proposal' ORDER BY id`,
      before,
    );
    test.skip(!pending, `bot nie zaproponował kroku (${JSON.stringify(played)})`);
    try {
      const answers = await Promise.all([
        emitAck(socket, 'bot:proposal', { messageId: pending!.id, approve: true }, LLM_TIMEOUT_MS),
        emitAck(socket, 'bot:proposal', { messageId: pending!.id, approve: true }, LLM_TIMEOUT_MS),
      ]);
      test
        .info()
        .annotations.push(
          { type: 'dwa zatwierdzenia naraz', description: JSON.stringify(answers) },
          { type: 'budżet Rzeźnika po nich', description: combatantOf('Rzeźnik').turnState ?? '' },
        );
      expect(answers.filter((answer) => !answer.ok)).toEqual([
        { ok: false, error: 'PROPOSAL_ALREADY_RESOLVED' },
      ]);
    } finally {
      // Sprzątanie: zaległe propozycje odrzucone, Rzeźnik z pełną turą — 4.4 gra od nowa.
      const leftovers = query<{ id: number; payload: string }>(
        `SELECT id, payload FROM ChatMessage WHERE id > ? AND kind = 'proposal'`,
        before,
      ).filter((row) => !(JSON.parse(row.payload) as { resolution?: string }).resolution);
      for (const row of leftovers) {
        await emitAck(socket, 'bot:proposal', { messageId: row.id, approve: false });
      }
      expect(
        await emitAck(socket, 'combat:reset-turn', { combatantId: combatantOf('Rzeźnik').id }),
      ).toMatchObject({ ok: true });
    }
  });

  test('4.4 @llm tura Rzeźnika: „Graj turę”, propozycje, akceptacja MG, budżet tury', async () => {
    await requireGateway();
    const page = mg.page;
    const started = Date.now();
    const proposals = page.locator('.chat-message.chat-proposal');
    const seen = await proposals.count();
    await page
      .getByRole('group', { name: 'Kolejka inicjatywy' })
      .getByRole('button', { name: '🤖 Graj turę' })
      .click();
    const steps: string[] = [];
    // Bot proponuje krok po kroku; MG zatwierdza każdy. Koniec: brak nowej propozycji.
    for (let step = 0; step < 5; step += 1) {
      const next = proposals.nth(seen + step);
      const arrived = await next
        .waitFor({ timeout: step === 0 ? LLM_TIMEOUT_MS : 60_000 })
        .then(() => true)
        .catch(() => false);
      if (!arrived) break;
      steps.push((await next.innerText()).replace(/\s+/g, ' '));
      const approve = next.getByRole('button', { name: 'Zatwierdź' });
      if ((await approve.count()) === 0) break;
      // Jeden klik, jak człowiek — i cierpliwość. Serwer rozstrzyga propozycję,
      // wykonuje akcję i dopiero potem przepisuje kartę, a klient MG wstrzymuje
      // zmiany do końca animacji kości: „Zatwierdzone” potrafi przyjść po kilkunastu
      // sekundach. Ponowny klik w tym czasie wykonuje akcję jeszcze raz (#20).
      await next.scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await approve.click();
      await expect(next).toContainText(/Zatwierdzone/, { timeout: 90_000 });
    }
    test
      .info()
      .annotations.push(
        { type: 'tura Rzeźnika', description: steps.join(' || ') },
        { type: 'czas tury bota', description: `${Math.round((Date.now() - started) / 1000)} s` },
      );
    expect(steps.length, 'bot zaproponował choć jeden krok').toBeGreaterThan(0);
    for (const text of steps) expect(text).not.toMatch(/POZA BUDŻETEM/);

    const turn = JSON.parse(combatantOf('Rzeźnik').turnState!) as {
      moveMax: number;
      moveUsed: number;
      metresUsed: number;
      metresPerMove: number;
      overspent: number;
    };
    test.info().annotations.push({ type: 'budżet Rzeźnika', description: JSON.stringify(turn) });
    expect(turn.overspent).toBe(0);
    expect(turn.moveUsed).toBeLessThanOrEqual(turn.moveMax);
    expect(turn.metresUsed).toBeLessThanOrEqual(turn.metresPerMove * Math.max(turn.moveMax, 1));
    // Karta ataku bota (jeśli strzelał) — najwyżej dwa strzały z ciężkiego pistoletu na Akcję.
    const shots = query<{ payload: string }>(
      `SELECT payload FROM ChatMessage WHERE kind = 'roll' AND text LIKE 'Ciężki pistolet →%' AND authorId IN
         (SELECT id FROM User WHERE role = 'GM')`,
    );
    expect(shots.length).toBeLessThanOrEqual(2);
    for (const shot of shots) {
      const roll = JSON.parse(shot.payload) as RollJson;
      test.info().annotations.push({
        type: 'strzał Rzeźnika',
        description: `${roll.total} · ${JSON.stringify(roll.breakdown)}`,
      });
    }
    for (const player of [marek, ola]) {
      await expectClean(player, secretsFor(player));
    }
  });

  test('#16 statysta z karty strzela z poziomem broni (Zbir: Broń krótka 6)', async () => {
    // MG celuje Zbirem w Kowala z Alt (poza turą Zbira — MG nie trzyma się kolejki).
    // Ścianka 2: 2 + 6 + 6 = 14 — pudło w każdym przedziale, więc nic nie zmienia stanu walki.
    scriptDice([2]);
    const before = lastMessageId();
    await aim(mg, tokenCentre(token('Zbir'), cell), tokenCentre(token('Kowal'), cell), true);
    // Kowal kuca za przewróconym stołem — wybór przy celowniku ładuje kubek dopiero po decyzji.
    await mg.page.getByRole('button', { name: 'Strzelaj mimo osłony' }).last().click();
    const id = await rollAndWait(mg, before, 'Ciężki pistolet → Kowal');
    const roll = rollById(id);
    test.info().annotations.push({
      type: 'rozbicie strzału Zbira',
      description: JSON.stringify(roll.breakdown),
    });
    expect(roll.breakdown).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'Broń krótka', value: 6 })]),
    );
  });

  test('4.5 tura Cienia: ukryty nie wychodzi do graczy, MG odsłania go w trakcie rundy', async () => {
    const page = mg.page;
    // Po Rzeźniku kolej ukrytego Cienia (9) — gracze nie widzą ani jego, ani tego, że to jego tura.
    await nextTurn(mg);
    expect(activeName()).toBe('Cień');
    for (const player of [marek, ola]) {
      await expect
        .poll(
          async () => {
            const state = await player.store<{
              combat: { activeCombatantId: string | null } | null;
            }>('combat');
            return state?.combat?.activeCombatantId ?? null;
          },
          { message: player.name },
        )
        .toBeNull();
      expect(await queueOf(player), player.name).not.toContain('Cień');
      await expectClean(player, secretsFor(player));
    }

    // Odsłonięcie z menu figury — kolejka graczy dostaje Cienia bez F5.
    await fitCamera(page, KNAJPA.width, KNAJPA.height);
    await clickOnMap(page, tokenCentre(token('Cień'), cell), 'right');
    await page.getByRole('button', { name: /Pokaż graczom/ }).click();
    await expect.poll(() => token('Cień').hidden).toBe(0);
    fromPlayers.reveal(token('Cień').id);
    fromPlayers.reveal(combatantOf('Cień').id);
    for (const player of [marek, ola]) {
      await expect
        .poll(() => queueOf(player), { message: player.name })
        .toEqual(['Kowal', 'Iskra', 'Rzeźnik', 'Cień', 'Zbir', 'Ochroniarz']);
      await expect
        .poll(
          async () => {
            const state = await player.store<{
              combat: { activeCombatantId: string | null } | null;
            }>('combat');
            return state?.combat?.activeCombatantId ?? null;
          },
          { message: player.name },
        )
        .toBe(combatantOf('Cień').id);
    }
  });

  test('4.5 kanarki po T4a: nic tajnego u graczy, konsola bez błędów', async () => {
    for (const player of [marek, ola]) {
      await expectClean(player, secretsFor(player));
    }
    // Kontrola podsłuchu: odsłonięty Cień dotarł do obojga.
    for (const player of [marek, ola]) {
      expect(await player.sniffer.found([token('Cień').id]), player.name).toEqual([
        token('Cień').id,
      ]);
    }
    for (const actor of [mg, marek, ola]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
  });

  test('4.5 punkt kontrolny po-T4a: kopia i odtworzenie w środku rundy', async () => {
    const before = stateFingerprint();
    saveCheckpoint('po-T4a');
    expect(hasCheckpoint('po-T4a')).toBe(true);
    await restoreCheckpoint('po-T4a');
    await startInstance();
    expect(stateFingerprint()).toEqual(before);
  });
});
