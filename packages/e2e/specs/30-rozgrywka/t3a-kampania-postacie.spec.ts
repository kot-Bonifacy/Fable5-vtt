import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { query, queryOne, stateFingerprint } from '../../fixtures/db.ts';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import {
  buy,
  goToStep,
  lifepathAnswers,
  lifepathLeft,
  openCreator,
  pickPortrait,
  rollLifepathWithCup,
  rollStatsWithCup,
  setSkillLevels,
} from '../../fixtures/creator.ts';
import { material, materialAs } from '../../fixtures/materials.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { Canaries } from '../../fixtures/sniffer.ts';
import { goToGmAttention } from '../../fixtures/table.ts';
import {
  hasCheckpoint,
  prepareFresh,
  restoreCheckpoint,
  saveCheckpoint,
  startInstance,
} from '../../instance/instance.ts';
import { REPO_DIR } from '../../instance/paths.ts';

/**
 * T3a (`testy.md` 5.1, kroki 3.1–3.8): kampania „Nocna zmiana” od pustej
 * instancji, dwa zaproszenia, zgody z warunkami, Kowal (Solo, Krawędziarz,
 * MG + Marek w Chromium) i Iskra (Netrunner, Kompletny Pakiet, Ola w Firefoksie,
 * F5 w połowie Ścieżki Życia), przyjęcie do gry i punkt kontrolny `po-T3a`.
 *
 * Wszystko przez UI; baza tylko do asercji, gniazdo tylko do odmów.
 */

type CharacterRow = { id: string; name: string; ownerId: string; playReady: number; data: string };

const character = (name: string): CharacterRow => {
  const row = queryOne<CharacterRow>('SELECT * FROM Character WHERE name = ?', name);
  if (!row) throw new Error(`E2E: no character "${name}"`);
  return row;
};

const sheetOf = (name: string) => JSON.parse(character(name).data) as Record<string, unknown>;

/**
 * Karta własnej postaci. Po „Utwórz postać” kreator otwiera ją sam, a w oknie
 * 1600 px zasłania zakładki panelu — więc klik w listę tylko wtedy, gdy jej nie ma.
 */
async function openSheet(actor: Actor, name: string) {
  const sheet = actor.page.getByRole('region', { name: `Karta postaci: ${name}` });
  if (!(await sheet.isVisible())) {
    await actor.page.getByRole('button', { name: 'Postacie', exact: true }).click();
    await actor.page.locator('.character-panel').getByText(name, { exact: true }).first().click();
  }
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe.serial('T3a: kampania, gracze, zgody i oba kreatory', () => {
  let mg: Actor;
  let marek: Actor;
  let ola: Actor;
  let campaignId: string;
  const invites: string[] = [];
  /** Tajne przed obojgiem graczy (portret NPC w puli MG). */
  const fromPlayers = new Canaries();
  /** Tajne przed Olą (notatki na karcie Kowala widzi Marek i MG). */
  const fromOla = new Canaries();

  test.beforeAll(async () => {
    // Pełny przebieg idzie tu po `01-dym`, który zostawia kampanię — T3 startuje z pustej bazy.
    await prepareFresh();
    await startInstance();
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('3.1 MG na pustej instancji: stany puste bez błędów', async ({ cast }) => {
    mg = await cast.mg('chromium');
    await expect(
      mg.page.getByText('Brak aktywnej kampanii — czat jest niedostępny.'),
    ).toBeVisible();
    await mg.page.getByText('Panel MG', { exact: true }).click();
    await expect(
      mg.page.getByText('Nie masz jeszcze żadnej kampanii — utwórz pierwszą.'),
    ).toBeVisible();
    expect(mg.unexpectedErrors()).toEqual([]);
  });

  test('3.2 kampania „Nocna zmiana”, sklep na poziomie 2, zegar na 14 marca 2045, 22:00', async () => {
    await mg.page.locator('#campaign-name').fill('Nocna zmiana');
    await mg.page.getByRole('button', { name: 'Utwórz' }).click();
    await expect(mg.page.getByRole('heading', { name: 'Nocna zmiana' })).toBeVisible();
    campaignId = queryOne<{ id: string }>(
      `SELECT id FROM Campaign WHERE name = 'Nocna zmiana'`,
    )!.id;

    await mg.page.getByText('← Wróć do gry').click();
    await mg.page.getByRole('button', { name: 'Kompendium', exact: true }).click();
    await mg.page.locator('.shop-tier-step', { hasText: '2' }).click();
    await expect(mg.page.locator('.shop-tier-step--active')).toHaveText('2');

    await mg.page.locator('.top-bar-clock').click();
    const clock = mg.page.getByRole('region', { name: 'Zegar świata' });
    await clock.getByLabel('Data w świecie gry').fill('2045-03-14');
    await clock.getByLabel('Godzina w świecie gry').fill('22:00');
    await clock.getByRole('button', { name: 'Ustaw' }).click();
    await expect(mg.page.locator('.top-bar-clock')).toHaveAttribute(
      'aria-label',
      /14 marca 2045, 22:00/,
    );
    // Świeża kampania nie ma kogo rozliczać, a zegar i tak zgłasza zaległość (#3):
    // MG czyści ją jednym „Rozlicz” — bez postaci nic nie kosztuje.
    if (await clock.getByRole('button', { name: 'Rozlicz' }).isVisible()) {
      await clock.getByRole('button', { name: 'Rozlicz' }).click();
    }
    await expect(clock.getByText(/Nic nie czeka/)).toBeVisible();
    const pomin = clock.getByRole('button', { name: 'Pomiń' });
    if (await pomin.isVisible()) await pomin.click();
    await clock.getByRole('button', { name: 'Zamknij zegar' }).click();

    expect(
      queryOne('SELECT shopTier, settledMonth FROM Campaign WHERE id = ?', campaignId),
    ).toEqual({ shopTier: 2, settledMonth: '2045-03' });
  });

  test('3.3 dwa zaproszenia; Marek (Chromium) i Ola (Firefox) wchodzą z linków', async ({
    cast,
  }) => {
    await mg.page.getByText('Panel MG', { exact: true }).click();
    const newLink = mg.page.getByRole('button', { name: /Nowy link zaproszenia/ });
    await newLink.click();
    await expect(mg.page.locator('.invite-url')).toHaveCount(1);
    await newLink.click();
    await expect(mg.page.locator('.invite-url')).toHaveCount(2);
    for (const url of await mg.page.locator('.invite-url').allTextContents()) {
      invites.push(url.split('/join/')[1]!);
    }

    marek = await cast.gracz('Marek', 'chromium', invites[0]!);
    ola = await cast.gracz('Ola', 'firefox', invites[1]!);
    for (const player of [marek, ola]) {
      await expect(player.page.getByText('Nocna zmiana').first()).toBeVisible();
      // Gracz nie dostaje roboczego zdania MG o zakładce „Sceny”.
      await expect(player.page.getByText(/utwórz i aktywuj ją/)).toHaveCount(0);
    }
    expect(
      query<{ name: string }>(
        `SELECT u.name FROM CampaignMember m JOIN User u ON u.id = m.userId
          WHERE m.campaignId = ? ORDER BY u.name`,
        campaignId,
      ).map((row) => row.name),
    ).toEqual(['Marek', 'Ola']);
    await mg.page.getByText('← Wróć do gry').click();
  });

  test('3.4 Marek prosi o postać; MG zgadza się: Krawędziarz (Na skróty)', async () => {
    await marek.page.getByRole('button', { name: 'Postacie', exact: true }).click();
    await marek.page.getByRole('button', { name: /Poproś MG o stworzenie postaci/ }).click();
    await expect(marek.page.getByText('Czekasz na zgodę MG na nową postać.')).toBeVisible();

    await expect(mg.page).toHaveTitle(/^\(1\) /);
    await expect(mg.page.locator('.gm-attention-count')).toHaveText('1');
    await goToGmAttention(mg, 'Marek prosi o zgodę na nową postać');
    const row = mg.page.locator('.creation-rank-row', { hasText: 'Marek' });
    await row.getByLabel('Metoda tworzenia: Marek').selectOption('edgerunner');
    // Na skróty nie liczy punktów Cech — pole Rangi znika.
    await expect(row.getByLabel('Ranga Postaci: Marek')).toHaveCount(0);
    await row.getByRole('button', { name: 'Zgoda' }).click();
    await expect(row.getByText('zgoda — czeka na gracza')).toBeVisible();
    await expect(mg.page).not.toHaveTitle(/^\(\d+\) /);

    await expect(
      marek.page.getByText('Warunki od MG: Krawędziarz (Na skróty) · 86 pkt umiejętności.'),
    ).toBeVisible();
  });

  test('3.5 Ola prosi; MG: Kompletny Pakiet, Postać początkująca, 80 pkt umiejętności', async () => {
    await ola.page.getByRole('button', { name: 'Postacie', exact: true }).click();
    await ola.page.getByRole('button', { name: /Poproś MG o stworzenie postaci/ }).click();
    await goToGmAttention(mg, 'Ola prosi o zgodę na nową postać');
    const row = mg.page.locator('.creation-rank-row', { hasText: 'Ola' });
    await row.getByLabel('Metoda tworzenia: Ola').selectOption('complete');
    await row.getByLabel('Ranga Postaci: Ola').selectOption('starting');
    await row.getByLabel('Pula umiejętności: Ola').fill('80');
    await row.getByRole('button', { name: 'Zgoda' }).click();
    await expect(row.getByText('zgoda — czeka na gracza')).toBeVisible();

    await expect(
      ola.page.getByText(
        'Warunki od MG: Kompletny Pakiet (Wyliczanie) · Postać początkująca (62 pkt Cech) · 80 pkt umiejętności.',
      ),
    ).toBeVisible();
    const terms = query<{ name: string; creationTerms: string }>(
      `SELECT u.name, m.creationTerms FROM CampaignMember m JOIN User u ON u.id = m.userId
        WHERE m.campaignId = ? ORDER BY u.name`,
      campaignId,
    ).map((row) => [row.name, JSON.parse(row.creationTerms) as unknown]);
    expect(terms).toEqual([
      ['Marek', { method: 'edgerunner', statRankId: 'starting', skillPoints: 86 }],
      ['Ola', { method: 'complete', statRankId: 'starting', skillPoints: 80 }],
    ]);
  });

  test('3.6a MG wgrywa portrety do puli; portret NPC jest kanarkiem', async () => {
    const marekPortrait = material('avatary/avatar11.png');
    const olaPortrait = material('avatary/avatar13.png');
    const npcName = fromPlayers.secret('portret-NPC');
    const npcPortrait = materialAs('avatary/avatar12.png', `${npcName}.png`);

    await mg.page.getByRole('button', { name: 'Postacie', exact: true }).click();
    await mg.page.getByRole('button', { name: 'Portrety — biblioteka MG' }).click();
    await mg.page
      .locator('.portrait-pool-head input[type=file]')
      .setInputFiles([marekPortrait, olaPortrait, npcPortrait]);
    await expect(mg.page.getByText('Dodano: 3 z 3. Nie dodano: 0.')).toBeVisible();
    await mg.page
      .getByRole('button', { name: `Przenieś portret „${npcName}” do portretów NPC` })
      .click();
    await expect
      .poll(
        () =>
          queryOne<{ gmOnly: number }>('SELECT gmOnly FROM PortraitAsset WHERE name = ?', npcName)
            ?.gmOnly,
      )
      .toBe(1);
    await mg.page.getByRole('button', { name: 'Zamknij', exact: true }).click();

    const pool = await marek.page.request.get('/api/portrait-assets');
    expect(await pool.text()).not.toContain(npcName);
  });

  test('3.6 Marek tworzy Solo „Kowal”: Cechy i Ścieżka kubkiem, zakupy, portret z kadrami', async () => {
    test.setTimeout(8 * 60_000);
    const page = marek.page;
    const window = await openCreator(page);
    await window.getByText('Solo', { exact: true }).click();
    await goToStep(page, /Cechy/);
    await rollStatsWithCup(page);

    // Każdą Cechę rzuca się raz — drugi rzut tej samej odmawia serwer.
    const socket = await marek.socket();
    expect(await emitAck(socket, 'creation:roll', { statId: 'ref' })).toEqual({
      ok: false,
      error: 'STAT_ALREADY_ROLLED',
    });
    const statCards = query<{ payload: string }>(
      `SELECT payload FROM ChatMessage WHERE campaignId = ? AND kind = 'roll' AND text LIKE '%— Solo'`,
      campaignId,
    );
    expect(statCards).toHaveLength(10);
    for (const card of statCards) {
      const roll = JSON.parse(card.payload) as { terms: { rolls: number[] }[] };
      expect(roll.terms[0]!.rolls).toHaveLength(1);
    }

    await goToStep(page, /Umiejętności/);
    await setSkillLevels(page, {
      handgun: 6,
      'shoulder-arms': 6,
      autofire: 4,
      evasion: 6,
      brawling: 4,
      perception: 6,
      athletics: 6,
      stealth: 4,
      'resist-torture-drugs': 2,
      tactics: 2,
      'melee-weapon': 4,
      concentration: 4,
      interrogation: 2,
      'local-expert': 4,
      'first-aid': 4,
      conversation: 4,
      persuasion: 4,
      'human-perception': 4,
      education: 4,
    });
    await expect(
      window.getByText('Punkty umiejętności: wydane 86 z 86 · pozostało 0'),
    ).toBeVisible();

    await goToStep(page, /Ścieżka Życia/);
    await rollLifepathWithCup(page);
    // Lista języków zależy od wylosowanej kultury — polski tylko dla Europy Wschodniej.
    const language = window.locator('[data-creation-field="lifepath.language"] select');
    const languages = (await language.locator('option').allTextContents()).slice(1);
    await language.selectOption({ label: languages.includes('Polski') ? 'Polski' : languages[0]! });

    await goToStep(page, /Wyposażenie/);
    await buy(page, 'Broń', ['Bardzo ciężki pistolet', 'Średnia broń biała']);
    await buy(page, 'Pancerz', ['Średnia kurtka kuloodporna']);
    await expect(window.getByText(/wydane 250 ed/)).toBeVisible();

    await goToStep(page, /Opis/);
    await window
      .getByRole('textbox', { name: 'Ksywa na Ulicy' })
      .pressSequentially('Kowal', { delay: 30 });
    await pickPortrait(page, 'avatar11', { tokenZoom: 1.5, bannerZoom: 1.25 });

    await goToStep(page, /Podsumowanie/);
    await expect(
      window.getByText('Wszystkie wymagania kreatora spełnione — możesz utworzyć postać.'),
    ).toBeVisible();
    await window.getByRole('button', { name: 'Utwórz postać' }).click();
    await expect(window.getByText(/Postać „Kowal” utworzona/)).toBeVisible();

    const kowal = character('Kowal');
    expect(kowal.playReady).toBe(0);
    const sheet = sheetOf('Kowal');
    expect(sheet.eddies).toBe(250);
    expect(Object.keys(sheet.skills as object)).toHaveLength(20);
    expect(
      queryOne('SELECT cropZoom, bannerZoom FROM PortraitAsset WHERE name = ?', 'avatar11'),
    ).toEqual({ cropZoom: 1.5, bannerZoom: 1.25 });
    // Karta przed przyjęciem: tylko do podglądu — zapis i rzut odmawiają.
    expect(
      await emitAck(socket, 'character:update', {
        characterId: kowal.id,
        patch: { name: 'Kowal2' },
      }),
    ).toEqual({ ok: false, error: 'CHARACTER_AWAITING_GM' });
    expect(
      await emitAck(socket, 'character:roll', {
        characterId: kowal.id,
        request: { kind: 'stat', statId: 'ref' },
      }),
    ).toEqual({ ok: false, error: 'CHARACTER_AWAITING_GM' });
    await window.getByRole('button', { name: 'Zamknij kreator' }).click();
  });

  test('3.7 Ola tworzy Netrunnera „Iskra”; F5 w połowie Ścieżki Życia nie gubi wyborów', async () => {
    test.setTimeout(8 * 60_000);
    const page = ola.page;
    const window = await openCreator(page);
    await window.getByText('Netrunner', { exact: true }).click();
    await goToStep(page, /Cechy/);
    await expect(window.getByText('Punkty Cech: wydane 0 z 62 · pozostało 62')).toBeVisible();
    const stats = {
      int: 7,
      ref: 7,
      dex: 6,
      tech: 7,
      cool: 5,
      will: 6,
      luck: 6,
      move: 6,
      body: 6,
      emp: 6,
    };
    for (const [id, value] of Object.entries(stats)) {
      const input = window.locator(`[data-creation-field="stats.${id}"]`);
      await input.click();
      await input.pressSequentially(String(value), { delay: 30 });
    }
    await expect(window.getByText('Punkty Cech: wydane 62 z 62 · pozostało 0')).toBeVisible();

    await goToStep(page, /Umiejętności/);
    await expect(
      window.getByText('Punkty umiejętności: wydane 26 z 80 · pozostało 54'),
    ).toBeVisible();
    await setSkillLevels(page, {
      'electronics-security': 6,
      'basic-tech': 4,
      cybertech: 4,
      'library-search': 4,
      handgun: 4,
      evasion: 4,
      education: 4,
      perception: 4,
      stealth: 4,
      cryptography: 4,
      'conceal-reveal-object': 2,
      concentration: 4,
      athletics: 4,
      'local-expert': 4,
      'human-perception': 4,
      conversation: 4,
      deduction: 2,
    });
    await expect(
      window.getByText('Punkty umiejętności: wydane 80 z 80 · pozostało 0'),
    ).toBeVisible();

    await goToStep(page, /Ścieżka Życia/);
    const total = await lifepathLeft(page);
    await rollLifepathWithCup(page, Math.floor(total / 2));
    const language = window.locator('[data-creation-field="lifepath.language"] select');
    const options = await language.locator('option').allTextContents();
    await language.selectOption({
      label: options.find((o) => /Bengal|Hindi/.test(o)) ?? options[1]!,
    });
    await expect(window.getByText('Zapisywanie…')).toHaveCount(0);
    const before = await lifepathAnswers(page);

    await page.reload();
    await openCreator(page);
    await goToStep(page, /Ścieżka Życia/);
    expect(await lifepathAnswers(page)).toEqual(before);

    await rollLifepathWithCup(page);
    await goToStep(page, /Wyposażenie/);
    await expect(window.getByText(/2\s550 ed startowych/)).toBeVisible();
    // Dek ze sklepu to zwykły wiersz sprzętu (decyzje, 17.09) — gracz i tak go kupuje.
    await buy(page, 'Sprzęt', ['Cyberdek (zwykłej jakości)', 'Agent', 'Radiokomunikator']);

    await goToStep(page, /Opis/);
    await window
      .getByRole('textbox', { name: 'Ksywa na Ulicy' })
      .pressSequentially('Iskra', { delay: 30 });
    await pickPortrait(page, 'avatar13', { tokenZoom: 1.3, bannerZoom: 1.1 });

    await goToStep(page, /Podsumowanie/);
    await window.getByRole('button', { name: 'Utwórz postać' }).click();
    await expect(window.getByText(/Postać „Iskra” utworzona/)).toBeVisible();
    await window.getByRole('button', { name: 'Zamknij kreator' }).click();
    expect(sheetOf('Iskra').eddies).toBe(1_850);
  });

  test('3.8 MG przyjmuje obie karty; 66 umiejętności; pola z ceną zablokowane', async () => {
    await expect(mg.page).toHaveTitle(/^\(2\) /);
    await goToGmAttention(mg, '„Kowal” czeka na przyjęcie do gry');
    // Każde „Przyjmij do gry” zdejmuje swój wiersz z listy — dwa kliknięcia w pierwszy.
    const accept = mg.page
      .locator('.character-panel')
      .getByRole('button', { name: 'Przyjmij do gry' });
    await expect(accept).toHaveCount(2);
    await accept.first().click();
    await expect(accept).toHaveCount(1);
    await accept.first().click();
    await expect
      .poll(() => [character('Kowal').playReady, character('Iskra').playReady])
      .toEqual([1, 1]);
    await expect(mg.page).not.toHaveTitle(/^\(\d+\) /);

    // Karta gracza ma pełną listę z kompendium, nie 42 umiejętności próbki.
    const sheet = await openSheet(marek, 'Kowal');
    const skills = await sheet.evaluate((root) => {
      const names = Array.from(root.querySelectorAll('*'))
        .filter((e) => e.childElementCount <= 1)
        .map((e) => e.textContent?.trim() ?? '')
        .filter((t) => t.length < 60 && /^\S.*\((INT|REF|ZW|TECH|CHA|SW|EMP|BC|RUCH)\)$/.test(t));
      return new Set(names).size;
    });
    expect(skills).toBe(66);

    // Notatka na karcie Kowala: widzi ją Marek i MG, Ola nie.
    const note = fromOla.secret('notatka-Kowala');
    await sheet.getByPlaceholder(/Ścieżka życia, kontakty/).fill(note);
    await expect.poll(() => sheetOf('Kowal').notes).toBe(note);

    const kowal = character('Kowal');
    const socket = await marek.socket();
    for (const data of [
      { skills: { handgun: 10 } },
      { improvementPoints: 500 },
      { roleAbilityRank: 9 },
      { eddies: 99_999 },
    ]) {
      expect(
        await emitAck(socket, 'character:update', { characterId: kowal.id, patch: { data } }),
        JSON.stringify(data),
      ).toEqual({ ok: false, error: 'FORBIDDEN' });
    }
  });

  test('3.8 gracz nie podnosi sobie Cechy po przyjęciu (#2)', async () => {
    test.fail(true, '#2: character:update przyjmuje od gracza nowe Cechy');
    const kowal = character('Kowal');
    const stats = sheetOf('Kowal').stats as Record<string, number>;
    const socket = await marek.socket();
    const ack = await emitAck(socket, 'character:update', {
      characterId: kowal.id,
      patch: { data: { stats: { ...stats, cool: stats.cool! + 1 } } },
    });
    // Test sprzątający po sobie: gdy łata przeszła, Cecha wraca do wylosowanej.
    if (ack.ok) {
      await emitAck(socket, 'character:update', {
        characterId: kowal.id,
        patch: { data: { stats } },
      });
    }
    expect(ack).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  test('3.8 Iskra wskazuje cyberdek i wkłada Programy na karcie', async () => {
    const page = ola.page;
    const sheet = await openSheet(ola, 'Iskra');
    await sheet.getByRole('button', { name: 'Przejdź' }).first().click();
    const deck = page.locator('[data-sheet-panel="cyberdeck"]');
    await deck.locator('select').selectOption('gear.cyberdek-zwyklej-jakosci');
    const programs = [
      'program.miecz',
      'program.robak',
      'program.pancerz',
      'program.tarcza',
      'program.piekielny-pocisk',
      'program.mam-cie',
    ];
    for (const [index, id] of programs.entries()) {
      await deck.locator('.cp-deck-install select').selectOption(id);
      await expect(deck.locator('tbody tr')).toHaveCount(index + 1);
    }
    await expect(deck.locator('.cp-deck-slots')).toHaveText('gniazda 6 / 7');
    await expect
      .poll(() => (sheetOf('Iskra').cyberdeck as { installed: unknown[] } | null)?.installed.length)
      .toBe(6);
  });

  test('3.8 kanarki: portret NPC u nikogo, notatka Kowala nie u Oli', async () => {
    expect(await marek.sniffer.found(fromPlayers.secretNow)).toEqual([]);
    expect(await ola.sniffer.found([...fromPlayers.secretNow, ...fromOla.secretNow])).toEqual([]);
    // Kontrola podsłuchu: Marek swoją notatkę dostał — inaczej pusty wynik nic nie znaczy.
    expect(await marek.sniffer.found(fromOla.secretNow)).toEqual(fromOla.secretNow);
    for (const actor of [mg, marek, ola]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
  });

  test('3.8 punkt kontrolny po-T3a: kopia i odtworzenie dają ten sam stan', async () => {
    const before = stateFingerprint();
    saveCheckpoint('po-T3a');
    expect(hasCheckpoint('po-T3a')).toBe(true);
    await restoreCheckpoint('po-T3a');
    await startInstance();
    expect(stateFingerprint()).toEqual(before);
  });
});

/**
 * Błędy znalezione w T3a (`testy-rejestr.md`) — każdy test opisuje zachowanie
 * oczekiwane i zostaje z `test.fail()`, dopóki poprawka nie przejdzie retestu.
 * Czytają stan zostawiony przez opis wyżej, więc idą po nim.
 */
test.describe.serial('T3a: znalezione błędy', () => {
  test('#4 karta rzutu Ścieżki Życia pokazuje wynik kości, nie liczbę odpowiedzi', () => {
    test.fail(true, '#4: total = liczba odpowiedzi (zawsze 1 przy rzucie po jednej tabeli)');
    const cards = query<{ payload: string }>(
      `SELECT payload FROM ChatMessage WHERE kind = 'roll' AND text LIKE 'Ścieżka Życia — %'`,
    ).map((row) => JSON.parse(row.payload) as { total: number; terms: { rolls: number[] }[] });
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) expect(card.total).toBe(card.terms[0]!.rolls[0]);
  });

  test('#5 kompendium z podręcznika nie miesza się z wymyśloną próbką z repo', async ({ cast }) => {
    test.fail(true, '#5: wpisy `data/public/.../sample.json` stoją obok podręcznikowych');
    const sample = JSON.parse(
      readFileSync(join(REPO_DIR, 'data/public/cpred/compendium/sample.json'), 'utf8'),
    ) as { entries?: { id: string }[] } | { id: string }[];
    const ids = new Set((Array.isArray(sample) ? sample : (sample.entries ?? [])).map((e) => e.id));
    const mg = await cast.mg('chromium');
    const socket = await mg.socket();
    const sync = new Promise<{ compendium: { entries: { id: string }[] } }>((resolve) =>
      socket.once('state:sync', resolve),
    );
    await emitAck(socket, 'state:request', {});
    const leaked = (await sync).compendium.entries.filter((e) => ids.has(e.id)).map((e) => e.id);
    expect(leaked).toEqual([]);
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });
});
