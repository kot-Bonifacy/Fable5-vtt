import { expect, test, type Actor } from '../../fixtures/actors.ts';
import type { WorldPoint } from '../../fixtures/canvas.ts';
import { queryOne, stateFingerprint } from '../../fixtures/db.ts';
import { giveAmmo } from '../../fixtures/kompendium.ts';
import { KNAJPA } from '../../fixtures/maps.ts';
import { canariesInDatabase, ONLY_FROM } from '../../fixtures/nocna-zmiana.ts';
import { clickOnMap, fitCamera, tokenCentre, walkOnMap } from '../../fixtures/scene.ts';
import { Canaries } from '../../fixtures/sniffer.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { createInvitation, shakeCup } from '../../fixtures/table.ts';
import {
  activeName,
  aim,
  cellCentre,
  chatCards,
  clientsSeeTurn,
  closeSheet,
  combatantOf,
  combatants,
  combatRow,
  endPlayerTurn,
  expectClean,
  freshCard,
  lastDamageCardOf,
  lastMessageId,
  messageAfter,
  nextTurn,
  noDodge,
  openSheet,
  queueOf,
  rollAndWait,
  rollById,
  sceneRow,
  settledWithoutApply,
  sheet,
  statusesOf,
  sumOf,
  token,
  tokens,
  zoomAt,
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

/**
 * T4b (`testy.md` 5.2, kroki 4.6–4.10): dalszy ciąg walki w „Knajpie” od punktu
 * `po-T4a` (tura odsłoniętego Cienia w 1. rundzie) do końca walki, łupu
 * i punktu `po-T4`.
 *
 * Decyzje MG z 27.09 (sesja T4b): rana krytyczna Kowala z ataku w walce (Cień,
 * strzał w głowę, dwie szóstki); Ochroniarz chwyta Iskrę (ona broni się ze
 * swojej karty); Zbir ginie (granat, nieudany Test Przeżywalności), Ochroniarz
 * zostaje pod progiem ran, Rzeźnik i Cień uciekają (ukryci), a walkę kończy MG;
 * tura Rzeźnika — ręką MG; Kowal zabiera pistolet Zbira i daje go Iskrze.
 *
 * Przebieg: Cień otwiera drzwi wahadłowe kuchni, strzela i zatrzaskuje je za sobą
 * → runda 2: strzał Kowala przez ścianę odmówiony, granat w Zbira i Ochroniarza,
 * Iskra podchodzi i trafia pięścią Rzeźnika, Rzeźnik strzela do niej, Zbir nie
 * zdaje Testu Przeżywalności, Ochroniarz biegnie pod taras → runda 3: Ochroniarz
 * chwyta Iskrę, MG wzywa Olę do Testu → koniec walki, łup, przekazanie.
 *
 * Kości: skrypt (`testy.md` 4.2) wszędzie tam, gdzie wynik wybiera drogę, plus
 * asercje niezmiennicze (suma rozbicia, PW z karty, ablacja o 1).
 */

type Sheet = {
  hpCurrent: number;
  armor: { location: string; spCurrent: number }[];
  weapons: { id: string; name: string; ammoCurrent: number }[];
  gear: { name: string; notes?: string; qty?: number; ammo?: { calibre: string } }[];
  criticalInjuries: { name: string }[];
};

/** Drzwi wahadłowe kuchni z bazy (`open` = 1 otwarte). */
const swingDoorOpen = () =>
  queryOne<{ open: number }>(
    `SELECT open FROM Wall WHERE sceneId = ? AND kind = 'door' AND x1 = 666 AND y1 = 753`,
    sceneRow().id,
  )?.open;

test.describe.serial('T4b: walka pierwsza w „Knajpie” — rany, granat, zwarcie, łup', () => {
  let mg: Actor;
  let marek: Actor;
  let ola: Actor;
  let cell: number;
  /** Tajne przed obojgiem graczy (łup Zbira, prawdziwe imię klona, PW statystów). */
  const fromPlayers = new Canaries();
  /** Tajne przed Markiem (szept i handout Oli, prośba Oli). */
  const fromMarek = new Canaries();
  /** Tajne przed Olą (szept MG do Marka, notatka Kowala). */
  const fromOla = new Canaries();
  const secretsFor = (player: Actor) => [
    ...fromPlayers.secretNow,
    ...(player === marek ? fromMarek : fromOla).secretNow,
  ];
  /** Karta obrażeń ze strzału Cienia — dowód #23. */
  let cienDamageId = 0;
  /** PW Kowala na starcie — Cechy (a z nimi PW) losuje kreator T3a. */
  let kowalHp = 0;
  /** Ostatnia wiadomość przed turą Zbira — jego Test Przeżywalności rzuca serwer (17.10). */
  let beforeZbirTurn = 0;

  /**
   * Punkt podłogi w dolnej części pola — środek pola pod cudzą figurą zajmuje jej
   * podpis, a klik w podpis to cel ataku, nie rozkaz marszu.
   */
  const floorOf = (column: number, row: number): WorldPoint => ({
    x: (column + 0.5) * cell,
    y: (row + 0.85) * cell,
  });

  /** Zaznacza figurę i klika pole marszu. */
  async function walk(actor: Actor, name: string, to: WorldPoint) {
    await actor.page.keyboard.press('Escape');
    // Środek żetonu, także gdy leży na nim grot kierunku sąsiada — od #25 grot
    // nie łapie kliknięć.
    await clickOnMap(actor.page, tokenCentre(token(name), cell));
    await actor.page.waitForTimeout(300);
    await walkOnMap(actor.page, to);
  }

  async function waitAt(name: string, column: number, row: number) {
    await expect
      .poll(() => [Math.round(token(name).x / cell), Math.round(token(name).y / cell)], {
        timeout: 20_000,
        message: `${name} → ${column},${row}`,
      })
      .toEqual([column, row]);
  }
  /** Ta sama karta rzutu u trojga — wynik z bazy na ostatniej karcie o tym tytule. */
  async function sameCardEverywhere(title: string, total: number) {
    for (const actor of [mg, marek, ola]) {
      await actor.page.getByRole('button', { name: /^Czat/ }).first().click();
      await expect(
        actor.page.locator('.chat-roll', { hasText: title }).last(),
        actor.name,
      ).toContainText(String(total));
    }
  }

  test.beforeAll(() => {
    // Pełny przebieg idzie tu wprost po T4a; osobno — `E2E_FROM=po-T4a`.
    const combat = combatRow();
    if (!combat || combat.round !== 1 || activeName() !== 'Cień' || token('Cień').hidden) {
      throw new Error('E2E: T4b needs the po-T4a state (E2E_FROM=po-T4a)');
    }
    cell = sceneRow().gridSizePx;
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('start z po-T4a: tura odsłoniętego Cienia, Kowal cały, Zbir draśnięty', async ({ cast }) => {
    mg = await cast.mg('chromium');
    const campaignId = queryOne<{ id: string }>(
      `SELECT id FROM Campaign WHERE name = 'Nocna zmiana'`,
    )!.id;
    marek = await cast.gracz('Marek', 'chromium', await createInvitation(mg, campaignId, 'Marek'));
    ola = await cast.gracz('Ola', 'firefox', await createInvitation(mg, campaignId, 'Ola'));
    for (const actor of [mg, marek, ola]) {
      await expect
        .poll(
          async () => (await actor.store<{ scene: { name: string } | null }>('scene'))?.scene?.name,
        )
        .toBe('Knajpa');
      await fitCamera(actor.page, KNAJPA.width, KNAJPA.height).catch(() => undefined);
      await expect
        .poll(() => queueOf(actor), { message: actor.name, timeout: 30_000 })
        .toHaveLength(6);
    }
    for (const [code, label] of canariesInDatabase()) {
      const onlyFrom = ONLY_FROM[label];
      (onlyFrom === 'Marek' ? fromMarek : onlyFrom === 'Ola' ? fromOla : fromPlayers).track(code);
    }
    // Gdzie skończył turę Rzeźnik, wybiera w T4a żywy model (na tarasie, w drzwiach, w sali
    // za oknem). MG stawia go w drzwiach tarasu (5, 18) — dalszy przebieg jest powtarzalny.
    const door = { x: 5 * cell, y: 18 * cell };
    if (
      Math.round(token('Rzeźnik').x) !== Math.round(door.x) ||
      Math.round(token('Rzeźnik').y) !== Math.round(door.y)
    ) {
      expect(
        await emitAck(await mg.socket(), 'token:move', {
          tokenId: token('Rzeźnik').id,
          ...door,
          final: true,
        }),
      ).toMatchObject({ ok: true });
    }
    await expect
      .poll(() => [Math.round(token('Rzeźnik').x / cell), Math.round(token('Rzeźnik').y / cell)])
      .toEqual([5, 18]);
    expect(sheet<Sheet>('Iskra').hpCurrent).toBe(40);
    // Strzał Cienia zabiera 33 PW — Kowal ma przeżyć jako Poważnie ranny.
    kowalHp = sheet<Sheet>('Kowal').hpCurrent;
    expect(kowalHp).toBeGreaterThan(33);
    expect(sheet<Sheet>('Zbir').hpCurrent).toBe(22);
    expect(swingDoorOpen()).toBe(0);
  });

  test('4.7 tura Cienia: drzwi kuchni, strzał w głowę Kowala — rana ciężka i krytyczna', async () => {
    test.setTimeout(3 * 60_000);
    const page = mg.page;
    // Drzwi wahadłowe otwiera klik MG (bez zaznaczonej figury).
    await page.keyboard.press('Escape');
    await clickOnMap(page, KNAJPA.swingDoor);
    await expect.poll(swingDoorOpen).toBe(1);

    // Marsz w drzwi staje, gdy Kowal wchodzi w pole widzenia (etap 43: „marsz przerwany”).
    const start = token('Cień');
    await walk(mg, 'Cień', cellCentre(cell, 16, 15));
    await expect.poll(() => token('Cień').x, { timeout: 20_000 }).toBeLessThan(start.x - cell);
    await page.waitForTimeout(2_000);
    const cienTurn = JSON.parse(combatantOf('Cień').turnState!) as {
      metresUsed: number;
      metresPerMove: number;
      overspent: number;
    };
    expect(cienTurn.metresUsed).toBeLessThanOrEqual(cienTurn.metresPerMove);
    expect(cienTurn.overspent).toBe(0);
    test.info().annotations.push({
      type: 'Cień po marszu',
      description: `kolumna ${token('Cień').x / cell}, ${cienTurn.metresUsed} m`,
    });

    // Strzał w głowę (Kowal nie ma hełmu): 9 + REF 8 + Broń krótka 7 − 8 = 16 > PT 15.
    scriptDice([9]);
    let before = lastMessageId();
    await aim(mg, tokenCentre(token('Cień'), cell), tokenCentre(token('Kowal'), cell), true);
    await page.getByRole('button', { name: 'Głowa', exact: true }).click();
    const shotId = await rollAndWait(mg, before, 'Bardzo ciężki pistolet → Kowal');
    const shot = rollById(shotId);
    test.info().annotations.push({ type: 'strzał Cienia', description: JSON.stringify(shot) });
    expect(shot.total).toBe(9 + sumOf(shot));
    expect(shot.breakdown).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'Celowanie (głowa)', value: -8 })]),
    );
    expect(shot.attack?.hit).toBe(true);
    await sameCardEverywhere('Bardzo ciężki pistolet → Kowal', shot.total);

    // Obrażenia 6 + 6 + 1 + 1 = 14: dwie szóstki = rana krytyczna (2k6 = 3 + 4 = 7,
    // tabela głowy), bez pancerza × 2 = 28, + 5 za ranę = 33 (Kowal 40 → 7).
    await noDodge(mg, shotId, 'Bardzo ciężki pistolet → Kowal');
    scriptDice([6, 6, 1, 1, 3, 4]);
    before = lastMessageId();
    const seenHead = await chatCards(page, 'obrażenia (Głowa)').count();
    await damageToCup(page, 'Bardzo ciężki pistolet → Kowal');
    cienDamageId = await rollAndWait(mg, before, 'obrażenia (Głowa)');
    // Rozliczenie samo, bez „Zastosuj” (decyzja MG z 03.10).
    await freshCard(page, 'obrażenia (Głowa)', seenHead);
    await expect.poll(() => sheet<Sheet>('Kowal').hpCurrent).toBe(kowalHp - 33);
    await settledWithoutApply(mg, 'obrażenia (Głowa)');
    expect(pendingDice()).toBe('');
    const kowal = sheet<Sheet>('Kowal');
    expect(kowal.criticalInjuries.map((i) => i.name)).toEqual(['Ciało obce']);
    // Głowa bez pancerza — kurtka na tułowiu bez ablacji.
    expect(kowal.armor.find((a) => a.location === 'body')?.spCurrent).toBe(12);

    // Kara za rany u Marka na panelu; PW Kowala zna on, Ola — tylko odsetek.
    await expect(
      marek.page.getByRole('complementary', { name: 'Panel aktywnej postaci' }),
    ).toContainText('Poważnie ranny');
    await expect.poll(() => lastDamageCardOf(marek, 'Kowal')).toEqual([33, true]);
    await expect.poll(() => lastDamageCardOf(ola, 'Kowal')).toEqual([33, false]);
    fromOla.track(`"hp":{"before":${kowalHp},"after":${kowalHp - 33}`);

    // Cień wraca za próg i zatrzaskuje drzwi wahadłowe.
    await page.keyboard.press('Escape');
    await clickOnMap(page, KNAJPA.swingDoor);
    await expect.poll(swingDoorOpen).toBe(0);
  });

  test('#23 karta obrażeń ze strzału statysty podpisana strzelcem (Cień), nie pierwszą kartą statysty', async () => {
    const damage = rollById(cienDamageId);
    test.info().annotations.push({
      type: 'karta obrażeń Cienia',
      description: `${damage.actor} · ${damage.title}`,
    });
    expect([damage.actor, damage.title]).toEqual([
      'Cień',
      'Bardzo ciężki pistolet — obrażenia (Głowa)',
    ]);
  });

  test('koniec 1. rundy: Zbir i Ochroniarz czekają, runda 2 od Kowala', async () => {
    await nextTurn(mg);
    expect(activeName()).toBe('Zbir');
    await nextTurn(mg);
    expect(activeName()).toMatch(/^Szrama/);
    await nextTurn(mg);
    expect(combatRow()?.round).toBe(2);
    expect(activeName()).toBe('Kowal');
    const reminder = mg.page.locator('.combat-bar-reminder');
    test.info().annotations.push({
      type: 'monit MG na początku tury Kowala',
      description: (await reminder.count()) ? await reminder.first().innerText() : '(brak)',
    });
    await expect(marek.page.getByRole('button', { name: 'Kończę turę' })).toBeVisible();
  });

  test('4.6 tura Marka: strzał przez ścianę odmówiony, granat w Zbira i Ochroniarza', async () => {
    test.setTimeout(3 * 60_000);
    // Cień za zamkniętymi drzwiami ciemnej kuchni: dla Marka go nie ma (umowa `atak` —
    // widoczność przed linią strzału), a MG, który widzi wszystko, dostaje odmowę ściany.
    const socket = await marek.socket();
    const pistol = sheet<Sheet>('Kowal').weapons.find((w) => w.name === 'Bardzo ciężki pistolet')!;
    const refused = await emitAck(socket, 'attack:roll', {
      characterId: token('Kowal').characterId,
      targetTokenId: token('Cień').id,
      request: { mode: 'single', weaponRowId: pistol.id },
    });
    test
      .info()
      .annotations.push({ type: 'strzał przez ścianę', description: JSON.stringify(refused) });
    expect(refused).toEqual({ ok: false, error: 'TOKEN_NOT_FOUND' });
    const wall = await emitAck(await mg.socket(), 'attack:roll', {
      characterId: token('Cień').characterId,
      targetTokenId: token('Kowal').id,
      request: { mode: 'single', weaponRowId: 'statist-weapon' },
    });
    test
      .info()
      .annotations.push({ type: 'Cień przez drzwi (MG)', description: JSON.stringify(wall) });
    expect(wall).toEqual({ ok: false, error: 'NO_LINE_OF_FIRE' });
    expect(JSON.parse(combatantOf('Kowal').turnState ?? '{}').action ?? null).toBeNull();
    expect(
      sheet<Sheet>('Cień').weapons.find((w) => w.name === 'Bardzo ciężki pistolet')?.ammoCurrent,
    ).toBe(7);

    // Granat: figura, slot granatu na pasku, klik w podłogę (7, 10) — obszar 10 × 10 m
    // obejmuje Zbira (7, 8) i Ochroniarza (8, 8). Klik w figurę nie ładuje kubka.
    const page = marek.page;
    await page.keyboard.press('Escape');
    await clickOnMap(page, tokenCentre(token('Kowal'), cell));
    await page
      .getByRole('complementary', { name: 'Panel aktywnej postaci' })
      .getByRole('button', { name: /Granat odłamkowy/ })
      .first()
      .click();
    await page.waitForTimeout(300);
    let before = lastMessageId();
    await clickOnMap(page, cellCentre(cell, 7, 10));
    // Rzut: kość + ZW + Atletyka − 2 (kurtka) − 2 (Poważnie ranny) + 1 (Precyzyjny atak) > PT 15.
    // ZW Kowala losuje kreator, więc kość dobiera się do modyfikatora z kubka (bez 10 — eksploduje).
    const cup = await marek.store<{ attack: { modifierTotal: number } | null }>('roll');
    const face = Math.min(9, Math.max(2, 16 - (cup?.attack?.modifierTotal ?? 0)));
    scriptDice([face]);
    const throwId = await rollAndWait(marek, before, 'Granat odłamkowy → wybrane pole');
    const thrown = rollById(throwId);
    test.info().annotations.push({ type: 'rzut granatem', description: JSON.stringify(thrown) });
    expect(thrown.total).toBe(face + sumOf(thrown));
    expect(thrown.breakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Poważnie ranny', value: -2 }),
        expect.objectContaining({ label: 'Precyzyjny atak 1', value: 1 }),
      ]),
    );
    expect(thrown.attack?.hit).toBe(true);
    expect(thrown.attack?.area?.targets.map((t) => t.tokenId).sort()).toEqual(
      [token('Zbir').id, token('Szrama').id].sort(),
    );
    // U graczy obszar nazywa klona aliasem.
    expect(thrown.attack?.area?.targets.map((t) => t.name).sort()).toEqual(['Ochroniarz', 'Zbir']);
    expect(
      sheet<Sheet>('Kowal').weapons.find((w) => w.name === 'Granat odłamkowy')?.ammoCurrent,
    ).toBe(1);
    await sameCardEverywhere('Granat odłamkowy → wybrane pole', thrown.total);

    // 6 + 6 + 5 + 5 + 4 + 2 = 28 (dwie szóstki: rana u obu, 2k6 = 4 + 5 = 9 — nie
    // „Ciało obce”, które przy biegu dobiłoby Ochroniarza). Zbir: 28 − OB 10 + 5 ≥ 22
    // → Śmiertelnie ranny; Ochroniarz: 28 − 11 + 5 = 22 → 25 − 22 = 3.
    await noDodge(mg, throwId, 'Granat odłamkowy → wybrane pole');
    scriptDice([6, 6, 5, 5, 4, 2, 4, 5, 4, 5]);
    before = lastMessageId();
    await damageToCup(page, 'Granat odłamkowy → wybrane pole');
    await rollAndWait(marek, before, 'Granat odłamkowy — obrażenia');
    // Granat rozlicza się sam na każdym, kogo dosięgnął (03.10) — bez „Zastosuj wszystkim”.
    await expect.poll(() => sheet<Sheet>('Zbir 2').hpCurrent).toBe(3);
    await expect.poll(() => sheet<Sheet>('Zbir').hpCurrent).toBeLessThanOrEqual(0);
    expect(pendingDice()).toBe('');
    for (const name of ['Zbir', 'Zbir 2']) {
      const card = sheet<Sheet>(name);
      test.info().annotations.push({
        type: `${name} po granacie`,
        description: `${card.hpCurrent} PW · ${card.criticalInjuries.map((i) => i.name).join(', ')}`,
      });
      expect(card.criticalInjuries).toHaveLength(1);
      expect(card.criticalInjuries[0]!.name).not.toBe('Ciało obce');
    }
    expect(sheet<Sheet>('Zbir').armor.find((a) => a.location === 'body')?.spCurrent).toBe(9);
    expect(sheet<Sheet>('Zbir 2').armor.find((a) => a.location === 'body')?.spCurrent).toBe(10);
    expect(statusesOf('Zbir')).toContain('mortally-wounded');
    // Cudze PW nie opuszczają serwera: gracze widzą stratę, nie „22 → 0”.
    for (const player of [marek, ola]) {
      await expect
        .poll(() => lastDamageCardOf(player, 'Zbir'), { message: player.name })
        .toEqual([expect.any(Number), false]);
      await expect
        .poll(() => lastDamageCardOf(player, 'Ochroniarz'), { message: player.name })
        .toEqual([22, false]);
      await expectClean(player, secretsFor(player));
    }

    await endPlayerTurn(marek);
    expect(activeName()).toBe('Iskra');
  });

  test('4.8 tura Oli: pod Rzeźnika i pięść, która trafia', async () => {
    test.setTimeout(3 * 60_000);
    const page = ola.page;
    // Z tarasu na pole pod Rzeźnikiem (5, 19), który stoi w drzwiach (5, 18).
    await clientsSeeTurn(ola);
    await walk(ola, 'Iskra', floorOf(5, 19));
    await waitAt('Iskra', 5, 19);
    const turn = JSON.parse(combatantOf('Iskra').turnState!) as {
      metresUsed: number;
      metresPerMove: number;
      overspent: number;
    };
    expect(turn.overspent).toBe(0);

    await expect(page.getByRole('complementary', { name: 'Panel aktywnej postaci' })).toContainText(
      'W ręku: Bijatyka',
    );
    scriptDice([8]);
    const before = lastMessageId();
    await clickOnMap(page, tokenCentre(token('Rzeźnik'), cell));
    const punchId = await rollAndWait(ola, before, 'Bijatyka → Rzeźnik');
    const punch = rollById(punchId);
    test.info().annotations.push({ type: 'pięść Iskry', description: JSON.stringify(punch) });
    expect(punch.total).toBe(8 + sumOf(punch));
    expect(punch.attack?.hit).toBe(true);
    await sameCardEverywhere('Bijatyka → Rzeźnik', punch.total);

    // Pięść (Bijatyka 2k6 przy BC 6) przeciw pełnemu OB 11 — Bijatyka nie połowi
    // pancerza (s. 177). Dwie szóstki: rana krytyczna (2k6 = 4 + 5 = 9, bez „Złamanej
    // ręki”, która wytrąciłaby Rzeźnikowi pistolet) i +5 prosto w PW.
    const hpBefore = sheet<Sheet>('Rzeźnik').hpCurrent;
    await noDodge(mg, punchId, 'Bijatyka → Rzeźnik');
    scriptDice([6, 6, 4, 5]);
    const damageBefore = lastMessageId();
    const seenPunch = await chatCards(mg.page, 'Bijatyka — obrażenia').count();
    await damageToCup(page, 'Bijatyka → Rzeźnik');
    const damageId = await rollAndWait(ola, damageBefore, 'Bijatyka — obrażenia');
    const rolled = rollById(damageId).total;
    await freshCard(mg.page, 'Bijatyka — obrażenia', seenPunch);
    await expect
      .poll(() => sheet<Sheet>('Rzeźnik').hpCurrent)
      .toBe(hpBefore - (Math.max(0, rolled - 11) + 5));
    expect(pendingDice()).toBe('');
    test.info().annotations.push({
      type: 'Rzeźnik po pięści',
      description: `rzut ${rolled}, PW ${hpBefore} → ${sheet<Sheet>('Rzeźnik').hpCurrent}`,
    });
    await endPlayerTurn(ola);
    expect(activeName()).toBe('Rzeźnik');
  });

  test('#26 tej samej karty obrażeń nie stosuje się drugi raz do tego samego celu', async () => {
    const punchDamage = messageAfter(0, 'Bijatyka — obrażenia')!;
    const socket = await mg.socket();
    // Dwie szóstki na karcie: gdyby przeszło, tabela ran rzuca od nowa — 2k6 = 9.
    scriptDice([4, 5]);
    const again = await emitAck<{ messageId: number }>(socket, 'damage:apply', {
      messageId: punchDamage.id,
      tokenId: token('Rzeźnik').id,
    });
    test.info().annotations.push({ type: 'drugie „Zastosuj”', description: JSON.stringify(again) });
    if (again.ok) {
      // Sprzątanie przed resztą scenariusza: „Cofnij” drugiego wpisu.
      expect(
        await emitAck(socket, 'damage:undo', { messageId: again.data!.messageId }),
      ).toMatchObject({
        ok: true,
      });
    }
    scriptDice([]);
    expect(again).toMatchObject({ ok: false });
  });

  test('tura Rzeźnika ręką MG: strzał z przyłożenia w Iskrę, Cień czeka', async () => {
    test.setTimeout(2 * 60_000);
    // Po #26 („Cofnij” drugiego zastosowania) Rzeźnik ma stan po jednej pięści.
    expect(sheet<Sheet>('Rzeźnik').hpCurrent).toBe(39);
    expect(sheet<Sheet>('Rzeźnik').criticalInjuries.map((i) => i.name)).toEqual([
      'Naderwany mięsień',
    ]);
    // 3 + REF 7 + Broń krótka 6 = 16 > PT 13 (0–6 m); 2 + 2 + 1 = 5, Iskra bez pancerza.
    scriptDice([3]);
    let before = lastMessageId();
    await mg.page.keyboard.press('Escape');
    await zoomAt(mg.page, tokenCentre(token('Rzeźnik'), cell));
    // Środek Rzeźnika przykrywa grot kierunku Iskry — retest #25: klik w sam środek.
    await aim(mg, tokenCentre(token('Rzeźnik'), cell), tokenCentre(token('Iskra'), cell), true);
    const shotId = await rollAndWait(mg, before, 'Ciężki pistolet → Iskra');
    expect(rollById(shotId).attack?.hit).toBe(true);
    await noDodge(mg, shotId, 'Ciężki pistolet → Iskra');
    scriptDice([2, 2, 1]);
    before = lastMessageId();
    const seenBody = await chatCards(mg.page, 'Ciężki pistolet — obrażenia (Korpus)').count();
    await damageToCup(mg.page, 'Ciężki pistolet → Iskra');
    await rollAndWait(mg, before, 'obrażenia');
    // Nowa karta, nie „ostatnia”: klient pokazuje ją dopiero po animacji kości. Rozlicza
    // się sama (03.10).
    await freshCard(mg.page, 'Ciężki pistolet — obrażenia (Korpus)', seenBody);
    await expect.poll(() => sheet<Sheet>('Iskra').hpCurrent).toBe(35);
    // Właścicielka widzi swoje PW, Marek — tylko stratę.
    await expect.poll(() => lastDamageCardOf(ola, 'Iskra')).toEqual([5, true]);
    await expect.poll(() => lastDamageCardOf(marek, 'Iskra')).toEqual([5, false]);
    fromMarek.track('"hp":{"before":40,"after":35');

    await fitCamera(mg.page, KNAJPA.width, KNAJPA.height);
    await nextTurn(mg);
    expect(activeName()).toBe('Cień');
    // Od 17.10 Test Przeżywalności statysty rzuca serwer na starcie jego tury —
    // kość skryptuje się przed przejściem tury, nie przed kliknięciem MG.
    scriptDice([10]);
    beforeZbirTurn = lastMessageId();
    await nextTurn(mg);
    // Zbir ginie w Teście na starcie swojej tury i oddaje ją sam (17.10) — dalej 4.7.
    await expect.poll(() => activeName()).toMatch(/^Szrama/);
  });

  test('4.7 tura Zbira: Test Przeżywalności rzuca serwer na starcie tury, naturalna 10 — śmierć i tura oddana', async () => {
    // Od 17.10 statysta i NPC nie czekają na MG: serwer rzuca za nich na starcie
    // tury (rzut dla MG), więc przycisku Testu nie ma nikt.
    for (const actor of [mg, marek, ola]) {
      await expect(actor.page.locator('.combat-bar-death-save'), actor.name).toHaveCount(0);
    }
    await expect
      .poll(() => messageAfter(beforeZbirTurn, 'Test Przeżywalności', 'gmroll')?.id ?? 0, {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
    const save = rollById(messageAfter(beforeZbirTurn, 'Test Przeżywalności', 'gmroll')!.id);
    test.info().annotations.push({
      type: 'Test Przeżywalności Zbira',
      description: JSON.stringify(save.outcome),
    });
    expect(save.outcome?.success).toBe(false);
    await expect.poll(() => statusesOf('Zbir')).toContain('dead');
    // Martwy statysta u graczy: ten sam stan na żetonie.
    for (const player of [marek, ola]) {
      await expect
        .poll(
          async () => {
            const state = await player.store<{
              tokens: Record<string, { statuses?: string[] }>;
            }>('token');
            return state?.tokens[token('Zbir').id]?.statuses ?? [];
          },
          { message: player.name },
        )
        .toContain('dead');
    }
    // Martwy nie ma tury (17.10): kolejka sama przechodzi dalej, wiersz na czacie mówi czemu.
    await expect.poll(() => activeName()).toMatch(/^Szrama/);
    expect(messageAfter(beforeZbirTurn, 'Tura oddana', 'action')?.payload).toContain('Martwy');
  });

  test('tura Ochroniarza: bieg pod drzwi tarasu (3 PW, bez rany od ruchu)', async () => {
    test.setTimeout(2 * 60_000);
    const page = mg.page;
    // Akcja Ruchu (10 m), potem „Bieg” — Akcja, która daje drugi ruch (RAW: po ruchu).
    await walk(mg, 'Szrama', cellCentre(cell, 6, 12));
    await waitAt('Szrama', 6, 12);
    await page
      .getByRole('complementary', { name: 'Panel aktywnej postaci' })
      .getByRole('button', { name: /^Bieg/ })
      .click();
    await expect.poll(() => JSON.parse(combatantOf('Szrama').turnState!).action?.id).toBe('run');
    await walk(mg, 'Szrama', cellCentre(cell, 5, 16));
    await waitAt('Szrama', 5, 16);
    const turn = JSON.parse(combatantOf('Szrama').turnState!) as { overspent: number };
    test.info().annotations.push({
      type: 'bieg Ochroniarza',
      description: combatantOf('Szrama').turnState ?? '',
    });
    expect(turn.overspent).toBe(0);
    await nextTurn(mg);
    expect(combatRow()?.round).toBe(3);
    expect(sheet<Sheet>('Zbir 2').hpCurrent).toBe(3);
  });

  test('runda 3: Kowal czeka, Iskra przechodzi obok Rzeźnika na pole po skosie', async () => {
    await endPlayerTurn(marek);
    expect(activeName()).toBe('Iskra');
    // Rzeźnik stoi w drzwiach tarasu (5, 18) — pole po skosie to (6, 19).
    await clientsSeeTurn(ola);
    await walk(ola, 'Iskra', floorOf(6, 19));
    await waitAt('Iskra', 6, 19);
  });

  test('#24 cios wręcz w figurę stojącą po skosie tuż obok (2,8 m) nie jest „za daleko”', async () => {
    const page = ola.page;
    const after = lastMessageId();
    await clickOnMap(page, tokenCentre(token('Rzeźnik'), cell));
    await page.waitForTimeout(800);
    const note = page.locator('.notice', {
      hasText: 'Do ataku wręcz cel musi być nie dalej niż 2 m.',
    });
    test.info().annotations.push({
      type: 'pięść po skosie',
      description: (await note.count()) ? 'odmowa „za daleko”' : 'bez odmowy',
    });
    // Po zdjęciu #24: kubek z ciosem, a nie notka; rzut zdejmuje kolejny krok.
    expect(await note.count()).toBe(0);
    expect(lastMessageId()).toBe(after);
  });

  test('4.8 runda 3: Ochroniarz chwyta Iskrę, Ola broni się ze swojej karty', async () => {
    test.setTimeout(3 * 60_000);
    await ola.page.keyboard.press('Escape');
    await endPlayerTurn(ola);
    // Rzeźnik i Cień czekają, martwy Zbir też ma swoje miejsce w kolejce.
    while (!/^Szrama/.test(activeName() ?? '')) await nextTurn(mg);

    const page = mg.page;
    await fitCamera(page, KNAJPA.width, KNAJPA.height);
    await zoomAt(page, cellCentre(cell, 5, 18));
    await walk(mg, 'Szrama', floorOf(5, 19));
    await waitAt('Szrama', 5, 19);
    await page
      .getByRole('complementary', { name: 'Panel aktywnej postaci' })
      .getByRole('button', { name: /^Pochwycenie/ })
      .click();
    scriptDice([9]);
    let before = lastMessageId();
    await page
      .locator('.combat-picker-row', { hasText: 'Iskra' })
      .getByRole('button', { name: 'Pochwyć' })
      .click();
    const grabId = await rollAndWait(mg, before, 'Pochwycenie → Iskra');
    const grab = rollById(grabId);
    test.info().annotations.push({ type: 'chwyt Ochroniarza', description: JSON.stringify(grab) });

    // Ola odpowiada z karty rzutu („Broń się”) — kubek jej karty.
    scriptDice([2]);
    before = lastMessageId();
    const card = chatCards(ola.page, 'Pochwycenie → Iskra').last();
    await card.getByRole('button', { name: /Broń się/ }).click();
    await shakeCup(ola.page);
    const heldBy = () =>
      queryOne<{ grappledById: string | null }>(
        'SELECT grappledById FROM Combatant WHERE id = ?',
        combatantOf('Iskra').id,
      )?.grappledById;
    await expect.poll(heldBy, { timeout: 30_000 }).toBe(combatantOf('Szrama').id);
    await expect.poll(() => statusesOf('Iskra')).toContain('grappled');
    // Zwarcie widać na figurze i w panelu u Oli; nazwa klona u graczy to alias.
    const olaPanel = ola.page.getByRole('complementary', { name: 'Panel aktywnej postaci' });
    await expect(olaPanel).toContainText('Pochwycony');
    await expect(olaPanel.getByRole('button', { name: /^Wyrwij się/ })).toBeVisible();
    for (const player of [marek, ola]) {
      await expect
        .poll(
          async () => {
            const state = await player.store<{
              tokens: Record<string, { statuses?: string[] }>;
            }>('token');
            return state?.tokens[token('Iskra').id]?.statuses ?? [];
          },
          { message: player.name },
        )
        .toContain('grappled');
      const shown = await chatCards(player.page, 'Pochwycenie → Iskra').last().innerText();
      test.info().annotations.push({ type: `karta chwytu u ${player.name}`, description: shown });
      await expectClean(player, secretsFor(player));
    }
  });

  test('4.8 wezwanie MG do Testu: dochodzi tylko do Oli, rzut z jej karty', async () => {
    test.setTimeout(2 * 60_000);
    const page = mg.page;
    await page.getByRole('button', { name: 'Postacie', exact: true }).click();
    await page
      .locator('.side-panel .character-row--card', { hasText: 'Iskra' })
      .getByRole('button', { name: 'Wezwij do Testu' })
      .click();
    const dialog = page.locator('.dialog', { hasText: 'Wezwij do Testu — Iskra' });
    await expect(dialog).toBeVisible();
    const athletics = await dialog
      .locator('#check-skill option', { hasText: 'Atletyka' })
      .first()
      .getAttribute('value');
    await dialog.locator('#check-skill').selectOption(athletics!);
    await dialog.getByRole('button', { name: /^Codzienny/ }).click();
    await dialog.locator('#check-prompt').fill('Utrzymasz się na nogach w uścisku Ochroniarza?');
    await dialog.getByRole('button', { name: 'Wezwij', exact: true }).click();

    await ola.page.getByRole('button', { name: /^Czat/ }).first().click();
    const call = ola.page.locator('.chat-message.chat-check', { hasText: 'Atletyka' }).last();
    await expect(call).toContainText('PT 13');
    await expect(
      marek.page.locator('.chat-message.chat-check', { hasText: 'Atletyka' }),
    ).toHaveCount(0);
    scriptDice([6]);
    const before = lastMessageId();
    await call.getByRole('button', { name: 'Rzuć' }).click();
    await ola.page.locator('.dialog').last().getByRole('button', { name: 'Weź kubek' }).click();
    const rolled = await rollAndWait(ola, before, 'Wezwanie: Atletyka');
    const roll = rollById(rolled);
    test.info().annotations.push({ type: 'wezwanie Oli', description: JSON.stringify(roll) });
    expect(roll.total).toBe(6 + sumOf(roll));
    await expect(call).toContainText(roll.total > 13 ? /Zdane/ : /Niezdane|Porażka/);
  });

  test('4.9 koniec walki: Ochroniarz puszcza, Rzeźnik i Cień uciekają, MG wyłącza tryb turowy', async () => {
    test.setTimeout(2 * 60_000);
    const page = mg.page;
    await page.keyboard.press('Escape');
    // Ochroniarz (5, 19) stoi pod Rzeźnikiem, którego żeton zachodzi na jego środek —
    // klik w dolną część żetonu.
    const guard = tokenCentre(token('Szrama'), cell);
    await clickOnMap(page, { x: guard.x, y: guard.y + 0.3 * cell });
    const panel = page.getByRole('complementary', { name: 'Panel aktywnej postaci' });
    // Trzymający ma na pasku „Zwarcie” zamiast „Pochwycenia”.
    await panel.getByRole('button', { name: /^Zwarcie/ }).click();
    await expect(page.getByText('Trzymasz: Iskra')).toBeVisible();
    await page.getByRole('button', { name: /Uwolnij/ }).click();
    await expect.poll(() => statusesOf('Iskra')).not.toContain('grappled');

    for (const name of ['Rzeźnik', 'Cień']) {
      await page.keyboard.press('Escape');
      await fitCamera(page, KNAJPA.width, KNAJPA.height);
      await zoomAt(page, tokenCentre(token(name), cell));
      await clickOnMap(page, tokenCentre(token(name), cell), 'right');
      await page.getByRole('button', { name: /Ukryj przed graczami/ }).click();
      await expect.poll(() => token(name).hidden, { message: name }).toBe(1);
    }
    for (const player of [marek, ola]) {
      await expect
        .poll(
          async () =>
            Object.keys(
              (await player.store<{ tokens: Record<string, unknown> }>('token'))?.tokens ?? {},
            ),
          { message: player.name },
        )
        .not.toContain(token('Rzeźnik').id);
    }

    // „✕” pyta `window.confirm` — fixture aktora odpowiada „tak”.
    await page.getByRole('button', { name: 'Wyłącz tryb turowy' }).click();
    await expect.poll(() => combatRow() ?? null).toBeNull();
    for (const player of [marek, ola]) {
      await expect(
        player.page.getByRole('group', { name: 'Kolejka inicjatywy' }),
        player.name,
      ).toHaveCount(0);
    }
    expect(combatants()).toEqual([]);
  });

  test('4.9 łup: Kowal przeszukuje martwego Zbira i oddaje jego pistolet Iskrze', async () => {
    test.setTimeout(3 * 60_000);
    const [lootCode] = [...canariesInDatabase()].find(([, label]) => label === 'lup-Zbira')!;
    // Przed przeszukaniem zawartość kieszeni Zbira jest tajna dla obojga.
    for (const player of [marek, ola]) await expectClean(player, secretsFor(player));
    expect(fromPlayers.secretNow).toContain(lootCode);

    // Kowal staje obok ciała (pole Ochroniarza sprzed biegu).
    await walk(marek, 'Kowal', cellCentre(cell, 8, 8));
    await waitAt('Kowal', 8, 8);
    await openSheet(marek, 'Kowal');
    const page = marek.page;
    await page.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    await page.getByRole('button', { name: 'Wymiana…' }).click();
    await closeSheet(page);
    // Etap 46a: jedno okno „Wymiana” — ciało to druga strona w trybie łupu.
    const exchange = page.locator('section[aria-label="Wymiana"]');
    const partner = exchange.getByLabel('Druga strona');
    const pick = async (text: string) => {
      await partner.focus();
      const option = partner.locator('option', { hasText: text }).first();
      await expect(option).not.toHaveAttribute('disabled');
      await partner.selectOption((await option.getAttribute('value'))!);
    };
    await pick('🎒 Zbir');
    await expect(exchange).toHaveAttribute('data-exchange-mode', 'loot');
    await expect(exchange).toContainText('Chip z kodem do chłodni');
    // Marek zobaczył łup — dla Oli zostaje tajny (leży teraz na karcie Kowala).
    fromPlayers.reveal(lootCode);
    fromOla.track(lootCode);
    await exchange.getByRole('button', { name: 'Zabierz wszystko' }).click();
    await expect
      .poll(() => sheet<Sheet>('Kowal').gear.map((g) => g.name))
      .toContain('Chip z kodem do chłodni');
    await expect
      .poll(() => sheet<Sheet>('Kowal').weapons.map((w) => w.name))
      .toContain('Ciężki pistolet');
    expect(sheet<Sheet>('Zbir').gear).toEqual([]);
    // Bijatyka z urzędu (47b) zostaje przy ciele — gołych rąk się nie zabiera.
    expect(sheet<Sheet>('Zbir').weapons.map((w) => w.id)).toEqual(['bare-hands.brawling']);

    // Iskra podchodzi pod Kowala, Kowal proponuje jej pistolet: wybór Iskry
    // zaprasza do handlu, a „Wyślij bez czekania” wysyła pole jako propozycję
    // z „Przyjmij” (46a, decyzja MG 6) — Ola przyjmuje z czatu.
    await fitCamera(ola.page, KNAJPA.width, KNAJPA.height).catch(() => undefined);
    await walk(ola, 'Iskra', floorOf(8, 9));
    await waitAt('Iskra', 8, 9);
    await pick('🤝 Iskra');
    await expect(exchange).toHaveAttribute('data-exchange-mode', 'trade');
    await exchange
      .getByRole('button', { name: 'Połóż w polu wymiany: Ciężki pistolet', exact: true })
      .click();
    await exchange.getByRole('button', { name: 'Wyślij bez czekania' }).click();
    await ola.page
      .locator('[data-testid="inventory-move"]', { hasText: 'Ciężki pistolet' })
      .last()
      .getByRole('button', { name: 'Przyjmij', exact: true })
      .click();
    await expect
      .poll(() => sheet<Sheet>('Iskra').weapons.map((w) => w.name))
      .toContain('Ciężki pistolet');
    expect(sheet<Sheet>('Kowal').weapons.map((w) => w.name)).not.toContain('Ciężki pistolet');
    test.info().annotations.push({
      type: 'pistolet na karcie Iskry',
      description: JSON.stringify(
        sheet<{ weapons: Record<string, unknown>[] }>('Iskra').weapons.find(
          (w) => w.name === 'Ciężki pistolet',
        ),
      ),
    });
    // Zaproszenie wycofane razem z wysłanym polem — okno handlu zamknęło się samo.
    await expect(exchange).toHaveCount(0);
  });

  test('#82 granat nie przeładowuje się z niczego: bez zapasu NO_AMMO, pudełko od MG ładuje', async () => {
    // Do 46c przeładowanie napełniało magazynek granatu „bez dna” (#82). Teraz
    // bierze sztukę z pudełek „Granaty” w ekwipunku — po walce, więc bez Akcji.
    const grenade = () => sheet<Sheet>('Kowal').weapons.find((w) => w.name === 'Granat odłamkowy')!;
    const grenadeBoxes = () =>
      sheet<Sheet>('Kowal').gear.filter((row) => row.ammo?.calibre === 'Granaty');
    expect(grenade().ammoCurrent).toBe(1);
    expect(grenadeBoxes()).toEqual([]);
    const page = marek.page;
    await openSheet(marek, 'Kowal');
    const reload = page.getByRole('button', { name: 'Przeładuj do pełna (Granaty)' });
    await expect(reload).toBeDisabled();
    expect(
      await emitAck(await marek.socket(), 'weapon:reload', {
        characterId: token('Kowal').characterId,
        weaponRowId: grenade().id,
      }),
    ).toEqual({ ok: false, error: 'NO_AMMO' });
    expect(grenade().ammoCurrent).toBe(1);
    await closeSheet(page);

    await giveAmmo(mg, 'Kowal', {
      entry: 'Amunicja zwykła (granaty i rakiety)',
      calibre: 'Granaty',
      packs: 1,
    });
    await expect.poll(() => grenadeBoxes().map((row) => row.qty)).toEqual([1]);
    await openSheet(marek, 'Kowal');
    await reload.click();
    await expect.poll(() => grenade().ammoCurrent).toBe(2);
    expect(grenadeBoxes()).toEqual([]);
    await expect(reload).toBeDisabled();
    await closeSheet(page);
  });

  test('#27 zdobyczny pistolet statysty nie robi z Iskry strzelca cudzych ataków', async () => {
    // Strzał Cienia w Kowala (4.7) — statysta, z którym Ola nie ma nic wspólnego.
    const shot = messageAfter(0, 'Bardzo ciężki pistolet → Kowal')!;
    const onOlaScreen = await chatCards(ola.page, 'Bardzo ciężki pistolet → Kowal')
      .last()
      .getByRole('button', { name: 'Na kubek' })
      .count();
    const before = lastMessageId();
    const answer = await emitAck(await ola.socket(), 'character:roll', {
      characterId: token('Iskra').characterId,
      request: { kind: 'damage', weaponRowId: 'statist-weapon', attackMessageId: shot.id },
      visibility: 'public',
    });
    test.info().annotations.push(
      { type: '„Na kubek” u Oli na strzale Cienia', description: String(onOlaScreen) },
      { type: 'rzut obrażeń Cienia z karty Iskry', description: JSON.stringify(answer) },
      {
        type: 'id wiersza pistoletu u Iskry',
        description: String(
          sheet<Sheet>('Iskra').weapons.find((w) => w.name === 'Ciężki pistolet')?.id,
        ),
      },
    );
    expect(onOlaScreen).toBe(0);
    expect(answer).toMatchObject({ ok: false });
    expect(lastMessageId()).toBe(before);
  });

  test('4.10 kanarki po T4b: nic tajnego u graczy, konsola bez błędów', async () => {
    for (const player of [marek, ola]) await expectClean(player, secretsFor(player));
    // Kontrola podsłuchu: łup dotarł do Marka, który przeszukał ciało.
    const [lootCode] = [...canariesInDatabase()].find(([, label]) => label === 'lup-Zbira')!;
    expect(await marek.sniffer.found([lootCode])).toEqual([lootCode]);
    for (const actor of [mg, marek, ola]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
    expect(
      tokens()
        .filter((t) => t.hidden)
        .map((t) => t.name)
        .sort(),
    ).toEqual(['Cień', 'Rzeźnik']);
  });

  test('4.10 punkt kontrolny po-T4: kopia i odtworzenie po walce', async () => {
    const before = stateFingerprint();
    saveCheckpoint('po-T4');
    expect(hasCheckpoint('po-T4')).toBe(true);
    await restoreCheckpoint('po-T4');
    await startInstance();
    expect(stateFingerprint()).toEqual(before);
  });
});
