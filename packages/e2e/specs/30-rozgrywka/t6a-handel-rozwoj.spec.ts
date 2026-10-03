import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { query, queryOne, stateFingerprint } from '../../fixtures/db.ts';
import { sceneByName, sceneListRow, visibleTokenIds } from '../../fixtures/brama.ts';
import { GATEWAY_URL, LLM_TIMEOUT_MS, requireGateway } from '../../fixtures/llm.ts';
import { KNAJPA } from '../../fixtures/maps.ts';
import { canariesInDatabase, ONLY_FROM } from '../../fixtures/nocna-zmiana.ts';
import { clickOnMap, fitCamera, tokenCentre } from '../../fixtures/scene.ts';
import { Canaries } from '../../fixtures/sniffer.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { createInvitation, say } from '../../fixtures/table.ts';
import {
  cellCentre,
  characterRow,
  closeSheet,
  expectClean,
  lastMessageId,
  openSheet,
  sheet,
  token,
} from '../../fixtures/walka.ts';
import {
  hasCheckpoint,
  pendingDice,
  restoreCheckpoint,
  saveCheckpoint,
  scriptDice,
  startInstance,
} from '../../instance/instance.ts';
import { LOG_DIR } from '../../instance/paths.ts';

/**
 * T6a (`testy.md` 5.4, kroki 6.1–6.5): po walkach, od punktu `po-T5` — Ola
 * odłącza się od Sieci, MG wraca drużyną do „Knajpy”; handel Marek ↔ Ola
 * (pola wymiany, dwie zgody, zgoda zdjęta zmianą oferty, odmowa ponad portfel),
 * zakup w sklepie kampanii i odmowa powyżej poziomu dostępności, rozmowa
 * z botem „Paser” (`@llm`) i handel z jego kartą (stronę NPC-a prowadzi MG),
 * PD po sesji, awans Marka (Zdolność i Umiejętność, blokady), wieloklasowość
 * Oli (Netrunner → Medyk, punkt w Chirurgii) i montaż Cyberoka Kowalowi rękami
 * Iskry — Marek prosi, Ola wycenia, Marek zatwierdza (#41, od 30.09; Test montażu
 * jej Chirurgią, Utrata Człowieczeństwa, cena na kartę Iskry). Na końcu punkt
 * `po-T6a`.
 *
 * Decyzje MG z 29.09 (sesja T6a): T6 dzielony na trzy części (T6a = 6.1–6.5,
 * T6b = 6.6–6.9, T6c = 6.10); Ola zostaje Medykiem i operuje Marka (6.3–6.5
 * spięte w łańcuch); u Pasera rozmowa z botem i wymiana oknem handlu.
 * Kolejność kroków: 6.4 przed 6.3, bo chirurgiem jest Medyk z 6.4.
 */

type Row = { name: string; compendiumId?: string; notes?: string; qty?: number };
type Card = {
  eddies: number;
  improvementPoints: number;
  humanityCurrent: number;
  roleId: string | null;
  roleAbilityRank: number;
  formerRoles: { roleId: string; rank: number }[];
  medicine: { surgery?: number };
  skills: Record<string, number>;
  stats: Record<string, number>;
  gear: Row[];
  weapons: Row[];
  cyberware: Row[];
};

test.describe.serial('T6a: po walkach — handel, sklep, Paser, PD, Medyk, cyborgizacja', () => {
  let mg: Actor;
  let marek: Actor;
  let ola: Actor;
  let cell: number;
  const fromPlayers = new Canaries();
  const fromMarek = new Canaries();
  const fromOla = new Canaries();
  /** Etykieta kanarka → kod (np. `lup-Zbira` → `KANAREK-lup-Zbira-0001`). */
  const codes = new Map<string, string>();
  const secretsFor = (player: Actor) => [
    ...fromPlayers.secretNow,
    ...(player === marek ? fromMarek : fromOla).secretNow,
  ];
  const card = (name: string) => sheet<Card>(name);
  const money = () => card('Kowal').eddies + card('Iskra').eddies;
  const ledger = (name: string, after: number) =>
    query<{ kind: string; amount: number; balance: number; label: string }>(
      'SELECT kind, amount, balance, label FROM LedgerEntry WHERE characterId = ? AND id > ? ORDER BY id',
      characterRow(name).id,
      after,
    );
  const lastLedgerId = () =>
    queryOne<{ id: number }>('SELECT max(id) AS id FROM LedgerEntry')?.id ?? 0;
  const advancements = (name: string) =>
    query<{ kind: string; amount: number; balance: number; label: string }>(
      'SELECT kind, amount, balance, label FROM AdvancementEntry WHERE characterId = ? ORDER BY id',
      characterRow(name).id,
    );
  const at = (name: string) => [Math.round(token(name).x / cell), Math.round(token(name).y / cell)];
  const tradeWindow = (actor: Actor) => actor.page.locator('section.trade-window');
  const dock = (actor: Actor) => actor.page.locator('.trade-dock');

  /**
   * Okno handlu otwiera się samo po „Przyjmij”, a gdy nie — zostaje „Otwórz” w doku.
   * Czeka na jedno z dwojga: samo `isVisible()` pytało, zanim okno MG zdążyło
   * wyskoczyć, i klikało „Otwórz”, którego już nie było (retest 03.10).
   */
  async function openTradeWindow(actor: Actor): Promise<void> {
    const open = dock(actor).getByRole('button', { name: 'Otwórz' });
    await expect(tradeWindow(actor).or(open).first()).toBeVisible();
    // „Otwórz” bywa widoczne ułamek sekundy przed samym oknem — wtedy klik nie
    // ma już w co trafić, a okno i tak stoi.
    if (!(await tradeWindow(actor).isVisible())) {
      await open.click({ timeout: 5_000 }).catch(() => undefined);
    }
    await expect(tradeWindow(actor)).toBeVisible();
  }

  /** Marsz figury klikiem właściciela; pozycję sprawdza baza, nie zrzut. */
  async function walk(actor: Actor, name: string, column: number, row: number) {
    const page = actor.page;
    await page.keyboard.press('Escape');
    await clickOnMap(page, tokenCentre(token(name), cell));
    await clickOnMap(page, cellCentre(cell, column, row));
    await expect
      .poll(() => at(name), { timeout: 30_000, message: `${name} → ${column},${row}` })
      .toEqual([column, row]);
    await page.keyboard.press('Escape');
  }

  /** Karta z Kompendium: szukanie po nazwie i klik w wiersz. */
  async function compendiumEntry(actor: Actor, name: string) {
    const page = actor.page;
    await page.getByRole('button', { name: 'Kompendium', exact: true }).click();
    const panel = page.locator('.compendium-panel');
    const back = panel.getByRole('button', { name: '← Lista' });
    if (await back.isVisible().catch(() => false)) await back.click();
    await panel.getByPlaceholder('Szukaj przedmiotu…').fill(name);
    // Wyszukiwanie działa w obrębie kategorii — przechodzi się po nich, aż wpis wyskoczy.
    const row = panel.locator('.compendium-row', {
      has: page.locator('.compendium-row-name', { hasText: new RegExp(`^${name}`) }),
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

  test.beforeAll(async () => {
    // Pełny przebieg idzie tu wprost po T5b; osobno — `E2E_FROM=po-T5`.
    if (
      queryOne('SELECT id FROM Combat') ||
      !queryOne(`SELECT id FROM Scene WHERE name = 'Brama' AND active = 1`) ||
      card('Kowal').improvementPoints !== 0
    ) {
      throw new Error('E2E: T6a needs the po-T5 state (E2E_FROM=po-T5)');
    }
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('start z po-T5: Iskra w Sieci na „Bramie”, walka skończona', async ({ cast }) => {
    mg = await cast.mg('chromium');
    const campaignId = queryOne<{ id: string }>(
      `SELECT id FROM Campaign WHERE name = 'Nocna zmiana'`,
    )!.id;
    marek = await cast.gracz('Marek', 'chromium', await createInvitation(mg, campaignId));
    ola = await cast.gracz('Ola', 'firefox', await createInvitation(mg, campaignId));
    for (const actor of [mg, marek, ola]) {
      await expect
        .poll(
          async () => (await actor.store<{ scene: { name: string } | null }>('scene'))?.scene?.name,
        )
        .toBe('Brama');
    }
    // Te same tajemnice, co na końcu T5b: piętra, na które Ola weszła, są jej,
    // łup Zbira leży na karcie Kowala (tajny przed Olą), reszta — przed obojgiem.
    for (const [code, label] of canariesInDatabase()) {
      codes.set(label, code);
      const onlyFrom =
        label === 'lup-Zbira'
          ? 'Ola'
          : label === 'pietro-LOD' || label === 'pietro-wezla'
            ? 'Marek'
            : ONLY_FROM[label];
      (onlyFrom === 'Marek' ? fromMarek : onlyFrom === 'Ola' ? fromOla : fromPlayers).track(code);
    }
    test.info().annotations.push({
      type: 'stan startowy',
      description: JSON.stringify({
        Kowal: [
          card('Kowal').eddies,
          card('Kowal').improvementPoints,
          card('Kowal').humanityCurrent,
        ],
        Iskra: [card('Iskra').eddies, card('Iskra').improvementPoints, card('Iskra').roleId],
        kanarki: codes.size,
      }),
    });
  });

  test('po walce: Ola odłącza się od Sieci, MG wraca drużyną do „Knajpy”', async () => {
    const window = ola.page.locator('.net-run-window');
    await expect(window).toBeVisible();
    await window.getByRole('button', { name: 'Odłącz się' }).click();
    await expect.poll(() => queryOne('SELECT id FROM NetRun')).toBeUndefined();
    await expect(window).toHaveCount(0);
    await expect(mg.page.locator('.net-run-window')).toHaveCount(0);

    const page = mg.page;
    await page.getByRole('button', { name: 'Sceny', exact: true }).click();
    await sceneListRow(page, 'Knajpa').getByRole('button', { name: 'Aktywuj' }).click();
    await expect.poll(() => sceneByName('Knajpa').active).toBe(1);
    cell = sceneByName('Knajpa').gridSizePx;
    // MG zostaje przy swoim podglądzie („Brama” — „podgląd”), gracze idą za aktywną
    // (`followActivation`); do „Knajpy” MG przechodzi sam.
    await expect(sceneListRow(page, 'Brama')).toContainText('podgląd');
    await sceneListRow(page, 'Knajpa').getByRole('button', { name: 'Pokaż' }).click();
    for (const actor of [mg, marek, ola]) {
      await expect
        .poll(
          async () => (await actor.store<{ scene: { name: string } | null }>('scene'))?.scene?.name,
        )
        .toBe('Knajpa');
      await fitCamera(actor.page, KNAJPA.width, KNAJPA.height).catch(() => undefined);
    }
    // Figury stoją tam, gdzie zostawił je koniec T4b: Kowal nad ciałem Zbira, Iskra obok.
    expect(at('Kowal')).toEqual([8, 8]);
    expect(at('Iskra')).toEqual([8, 9]);
  });

  test('6.1 handel Marek ↔ Ola: pola wymiany, zgoda zdjęta zmianą oferty, wymiana atomowa', async () => {
    test.setTimeout(3 * 60_000);
    const before = { kowal: card('Kowal'), iskra: card('Iskra'), money: money() };
    const ledgerMark = lastLedgerId();
    const chip = 'Chip z kodem do chłodni';

    // Marek: „Handel…” z karty Kowala → Iskra na wyciągnięcie ręki → „Zaproś”.
    await openSheet(marek, 'Kowal');
    await marek.page.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    await marek.page.getByRole('button', { name: 'Handel…' }).click();
    const picker = marek.page.getByRole('region', { name: 'Z kim handlować' });
    await expect(picker.locator('.inventory-row', { hasText: 'Iskra' })).toBeVisible();
    await picker
      .locator('.inventory-row', { hasText: 'Iskra' })
      .getByRole('button', { name: 'Zaproś' })
      .click();
    await closeSheet(marek.page);

    // Ola przyjmuje z doku; okno otwiera się u obojga (albo „Otwórz” w doku).
    await dock(ola).getByRole('button', { name: 'Przyjmij' }).click();
    for (const actor of [marek, ola]) await openTradeWindow(actor);
    // MG widzi handel w doku jako podgląd — zgody dać nie może.
    await expect(dock(mg)).toContainText('Kowal ⇄ Iskra');

    // Marek kładzie chip w polu — od tej chwili Ola widzi łup Zbira (jawny dla niej).
    fromOla.reveal(codes.get('lup-Zbira')!);
    await tradeWindow(marek)
      .getByRole('button', { name: `Połóż w polu wymiany: ${chip}` })
      .click();
    await expect(tradeWindow(ola)).toContainText(chip);

    // Odmowa: oferta ponad portfel z surowego gniazda Oli (UI przycina pole do salda).
    const trades = await ola.store<{ openId: string | null; trades: Record<string, unknown> }>(
      'trade',
    );
    const tradeId = trades?.openId ?? Object.keys(trades?.trades ?? {})[0];
    expect(tradeId).toBeTruthy();
    const refused = await emitAck(await ola.socket(), 'trade:offer', {
      tradeId,
      items: [],
      eddies: before.iskra.eddies + 1,
    });
    expect(refused).toEqual({ ok: false, error: 'NOT_ENOUGH_EDDIES' });

    const olaMoney = tradeWindow(ola).getByLabel('Ile eurodolców w polu wymiany');
    await olaMoney.fill('300');
    await olaMoney.press('Enter');
    await expect(tradeWindow(marek)).toContainText('300 ed');

    // Marek się zgadza; Ola podbija ofertę — zgoda Marka spada sama.
    await tradeWindow(marek).getByRole('button', { name: 'Zgadzam się' }).click();
    await expect(tradeWindow(ola).locator('.trade-zone', { hasText: 'Kowal' })).toContainText(
      '✔ zgoda',
    );
    await olaMoney.fill('350');
    await olaMoney.press('Enter');
    await expect(tradeWindow(marek)).toContainText('350 ed');
    await expect(
      tradeWindow(marek).locator('.trade-zone--mine'),
      'zgoda Marka zdjęta zmianą oferty Oli',
    ).toContainText('bez zgody');
    await expect(tradeWindow(marek).getByRole('button', { name: 'Zgadzam się' })).toBeVisible();
    expect(card('Kowal').eddies, 'nic nie ruszyło się przed drugą zgodą').toBe(before.kowal.eddies);

    await tradeWindow(marek).getByRole('button', { name: 'Zgadzam się' }).click();
    await tradeWindow(ola).getByRole('button', { name: 'Zgadzam się' }).click();
    await expect.poll(() => card('Iskra').gear.map((g) => g.name)).toContain(chip);

    const after = { kowal: card('Kowal'), iskra: card('Iskra') };
    expect(after.kowal.gear.map((g) => g.name)).not.toContain(chip);
    expect(after.kowal.eddies).toBe(before.kowal.eddies + 350);
    expect(after.iskra.eddies).toBe(before.iskra.eddies - 350);
    expect(money(), 'eurodolce nie giną i się nie dublują').toBe(before.money);
    expect(
      after.iskra.gear.filter((g) => g.name === chip).length +
        after.kowal.gear.filter((g) => g.name === chip).length,
    ).toBe(1);
    expect(after.kowal.gear.length + after.iskra.gear.length).toBe(
      before.kowal.gear.length + before.iskra.gear.length,
    );
    expect(ledger('Kowal', ledgerMark).map((r) => [r.kind, r.amount])).toEqual([['transfer', 350]]);
    expect(ledger('Iskra', ledgerMark).map((r) => [r.kind, r.amount])).toEqual([
      ['transfer', -350],
    ]);
    await expect(tradeWindow(marek)).toHaveCount(0);
    await expect(tradeWindow(ola)).toHaveCount(0);
    for (const actor of [marek, ola]) {
      await expect(dock(actor)).toContainText('Wymienione: Kowal ⇄ Iskra');
    }
  });

  test('6.2 sklep kampanii: Marek kupuje wytrychy, broni wojskowej sklep mu nie sprzeda', async () => {
    const ledgerMark = lastLedgerId();
    const eddies = card('Kowal').eddies;
    const entry = await compendiumEntry(marek, 'Zestaw wytrychów');
    await expect(entry.locator('select').first()).toHaveValue(characterRow('Kowal').id);
    await entry.getByRole('button', { name: /^Kup — 20 ed/ }).click();
    await expect
      .poll(() => card('Kowal').gear.map((g) => g.compendiumId))
      .toContain('gear.zestaw-wytrychow');
    expect(card('Kowal').eddies).toBe(eddies - 20);
    expect(ledger('Kowal', ledgerMark).map((r) => [r.kind, r.amount, r.label])).toEqual([
      ['purchase', -20, 'Zestaw wytrychów'],
    ]);

    // Karabin szturmowy: poziom wyżej niż sklep kampanii (2) — guzik wyszarzony,
    // a surowe gniazdo dostaje odmowę z oboma poziomami.
    const rifle = await compendiumEntry(marek, 'Militech Ronin');
    const buy = rifle.getByRole('button', { name: /^Kup/ });
    await expect(buy).toBeDisabled();
    const title = await buy.getAttribute('title');
    const refused = await emitAck(await marek.socket(), 'economy:buy', {
      characterId: characterRow('Kowal').id,
      entryId: 'weapon.militech-ronin',
    });
    test
      .info()
      .annotations.push(
        { type: 'dymek „Kup” Ronina u Marka', description: String(title) },
        { type: 'odmowa economy:buy', description: JSON.stringify(refused) },
      );
    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.error).toMatch(/^SHOP_TIER_LOCKED:[34]:2$/);
    expect(card('Kowal').eddies).toBe(eddies - 20);
    expect(card('Kowal').weapons.map((w) => w.name)).not.toContain('Militech Ronin');
  });

  test('6.2 Kowal podchodzi do baru; MG wykłada Paserowi Ronina spod lady', async () => {
    await walk(marek, 'Kowal', 12, 13);
    await expect.poll(() => visibleTokenIds(marek)).toContain(token('Paser').id);
    // Pierwszy `select` karty wpisu u MG to poziom sklepu — odbiorca stoi w `.compendium-assign`.
    const entry = await compendiumEntry(mg, 'Militech Ronin');
    const recipient = entry.locator('.compendium-assign select').first();
    await recipient.selectOption({ label: 'Paser' });
    await entry.getByRole('button', { name: 'Dodaj za darmo' }).click();
    await expect.poll(() => card('Paser').weapons.map((w) => w.name)).toContain('Militech Ronin');
    expect(card('Paser').eddies, 'darmowe — z nikogo nic nie zeszło').toBe(0);
  });

  test('6.2 @llm Marek targuje się z Paserem na czacie — bot odpowiada po polsku', async () => {
    await requireGateway();
    const botId = queryOne<{ id: string }>(`SELECT id FROM BotProfile WHERE name = 'Paser'`)!.id;
    const mark = lastMessageId();
    const started = Date.now();
    // Panel boczny Marka stoi na Kompendium z zakupów w 6.2.
    await marek.page.getByRole('button', { name: 'Czat', exact: true }).click();
    const question =
      'Paser, sklep mi nie sprzeda karabinu. Masz coś wojskowego spod lady? Płacę gotówką, od ręki.';
    await say(marek, question);
    // Najpierw sama wiadomość Marka — bez niej brak odpowiedzi nic nie mówi o bocie.
    await expect
      .poll(() =>
        queryOne<{ kind: string }>(
          'SELECT kind FROM ChatMessage WHERE id > ? AND text = ? AND botId IS NULL',
          mark,
          question,
        ),
      )
      .toEqual({ kind: 'say' });
    const answered = () =>
      queryOne<{ text: string }>(
        'SELECT text FROM ChatMessage WHERE botId = ? AND id > ? ORDER BY id DESC',
        botId,
        mark,
      )?.text ?? '';
    try {
      await expect.poll(answered, { timeout: LLM_TIMEOUT_MS, intervals: [2_000] }).not.toBe('');
    } catch (error) {
      // Log serwera instancji zeruje się przy każdym starcie — dowód trzeba wziąć teraz.
      const log = readFileSync(join(LOG_DIR, 'server.log'), 'utf8')
        .split('\n')
        .filter((line) => /bot|gateway|ai|llm|chat/i.test(line))
        .slice(-40)
        .join('\n');
      test.info().annotations.push(
        { type: 'log serwera (bot, gateway)', description: log },
        {
          type: 'wiersze czatu po pytaniu',
          description: JSON.stringify(
            query('SELECT id, kind, botId, text FROM ChatMessage WHERE id > ? ORDER BY id', mark),
          ),
        },
      );
      throw error;
    }
    const reply = queryOne<{ text: string }>(
      'SELECT text FROM ChatMessage WHERE botId = ? AND id > ? ORDER BY id DESC',
      botId,
      mark,
    )!.text;
    test
      .info()
      .annotations.push(
        { type: 'odpowiedź Pasera', description: reply },
        { type: 'czas odpowiedzi', description: `${Math.round((Date.now() - started) / 1000)} s` },
        { type: 'gateway', description: GATEWAY_URL },
        { type: 'czy wspomina Ronina z karty', description: String(/ronin|karabin/i.test(reply)) },
      );
    expect(reply.length).toBeGreaterThan(20);
    expect(reply).toMatch(/[ąćęłńóśźż]/i);
    expect(reply).not.toMatch(/KANAREK/);
  });

  test('6.2 handel z Paserem: Marek proponuje z mapy, MG prowadzi stronę NPC-a, Ronin za 400 ed', async () => {
    test.setTimeout(3 * 60_000);
    const ledgerMark = lastLedgerId();
    const eddies = card('Kowal').eddies;

    await clickOnMap(marek.page, tokenCentre(token('Paser'), cell), 'right');
    await marek.page.getByRole('button', { name: '🤝 Handluj…' }).click();
    const invite = dock(mg).locator('.trade-dock-row--invite', { hasText: 'Kowal' });
    await expect(invite).toContainText('(Paser)');
    await invite.getByRole('button', { name: 'Przyjmij' }).click();
    for (const actor of [marek, mg]) await openTradeWindow(actor);
    await tradeWindow(mg)
      .getByRole('button', { name: 'Połóż w polu wymiany: Militech Ronin' })
      .click();
    await expect(tradeWindow(marek)).toContainText('Militech Ronin');
    const cash = tradeWindow(marek).getByLabel('Ile eurodolców w polu wymiany');
    await cash.fill('400');
    await cash.press('Enter');
    await expect(tradeWindow(mg)).toContainText('400 ed');
    await tradeWindow(marek).getByRole('button', { name: 'Zgadzam się' }).click();
    await tradeWindow(mg).getByRole('button', { name: 'Zgadzam się' }).click();
    await expect.poll(() => card('Kowal').weapons.map((w) => w.name)).toContain('Militech Ronin');
    expect(card('Paser').weapons.map((w) => w.name)).not.toContain('Militech Ronin');
    expect(card('Kowal').eddies).toBe(eddies - 400);
    expect(card('Paser').eddies).toBe(400);
    expect(ledger('Kowal', ledgerMark).map((r) => [r.kind, r.amount])).toEqual([
      ['transfer', -400],
    ]);
  });

  test('#40 id karty NPC-a nie dociera do gracza — ani w karcie czatu handlu, ani na listach', async () => {
    // Umowa handlu (`trade:partners`): NPC-a gracz wskazuje figurą, id jego karty
    // nie poznaje. Do 30.09 niosła je karta czatu „Kowal ⇄ Paser” (`toCharacterId`),
    // a lista odbiorców przelewu miała wszystkie karty kampanii z prawdziwymi nazwami.
    const history = await emitAck<{ payees: { name: string }[] }>(
      await marek.socket(),
      'economy:history',
      { characterId: characterRow('Kowal').id },
    );
    if (!history.ok) throw new Error(`economy:history: ${history.error}`);
    const payees = (history.data?.payees ?? []).map((p) => p.name);
    test
      .info()
      .annotations.push({ type: 'odbiorcy przelewu Marka', description: JSON.stringify(payees) });
    expect(payees).toContain('Iskra');
    expect(payees).not.toContain('Paser');
    await expectClean(marek, [characterRow('Paser').id]);
  });

  test('6.4 MG przyznaje PD po sesji; Marek podnosi Zmysł Walki i Broń krótką, blokady trzymają', async () => {
    const page = mg.page;
    await page.getByRole('button', { name: 'Postacie', exact: true }).click();
    await page.getByLabel('Punkty Doświadczenia do przyznania').fill('500');
    await page.getByLabel('Powód przyznania PD').fill('Nocna zmiana — sesja pierwsza');
    await page.getByRole('button', { name: '✦ Przyznaj wszystkim' }).click();
    await expect(page.locator('.character-panel-note')).toContainText('Przyznano 500 PD — 2');
    for (const name of ['Kowal', 'Iskra']) {
      await expect.poll(() => card(name).improvementPoints).toBe(500);
      expect(advancements(name).map((r) => [r.kind, r.amount])).toEqual([['award', 500]]);
    }
    expect(card('Paser').improvementPoints).toBe(0);

    const handgun = card('Kowal').skills.handgun!;
    const region = await openSheet(marek, 'Kowal');
    await marek.page.getByRole('button', { name: 'Ścieżka Życia', exact: true }).click();
    const panel = region.locator('.advance');
    await expect(panel).toContainText('500 PD w zapasie');
    await panel.getByRole('button', { name: 'Podnieś: Zmysł Walki na poziom 5' }).click();
    await expect.poll(() => card('Kowal').roleAbilityRank).toBe(5);
    await panel
      .getByRole('button', { name: `Podnieś: Broń krótka na poziom ${handgun + 1}` })
      .click();
    await expect.poll(() => card('Kowal').skills.handgun).toBe(handgun + 1);
    const left = 500 - 300 - (handgun + 1) * 20;
    expect(card('Kowal').improvementPoints).toBe(left);
    await expect(panel).toContainText(`${left} PD w zapasie`);

    // Blokady: następny szczebel Zdolności za drogi (guzik), skok o dwa i brak PD (serwer).
    await expect(
      panel.getByRole('button', { name: 'Podnieś: Zmysł Walki na poziom 6' }),
    ).toBeDisabled();
    const socket = await marek.socket();
    const id = characterRow('Kowal').id;
    const skip = await emitAck(socket, 'character:advance', {
      characterId: id,
      kind: 'skill',
      skillId: 'handgun',
      to: handgun + 3,
    });
    const broke = await emitAck(socket, 'character:advance', {
      characterId: id,
      kind: 'ability',
      to: 6,
    });
    const forged = await emitAck(socket, 'character:update', {
      characterId: id,
      patch: { data: { improvementPoints: 999 } },
    });
    test
      .info()
      .annotations.push(
        { type: 'skok o dwa', description: JSON.stringify(skip) },
        { type: 'Zdolność bez PD', description: JSON.stringify(broke) },
        { type: 'PD łatą karty', description: JSON.stringify(forged) },
      );
    expect(skip).toEqual({ ok: false, error: 'LEVEL_SKIP' });
    expect(broke).toEqual({ ok: false, error: 'NO_POINTS' });
    expect(forged).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(card('Kowal').improvementPoints).toBe(left);
    expect(card('Kowal').roleAbilityRank).toBe(5);
    expect(advancements('Kowal').map((r) => [r.kind, r.amount])).toEqual([
      ['award', 500],
      ['spend', -300],
      ['spend', -(handgun + 1) * 20],
    ]);
    await closeSheet(marek.page);
  });

  test('6.4 wieloklasowość: Ola bierze Rolę Medyka za 60 PD i punkt Medycyny w Chirurgię', async () => {
    const region = await openSheet(ola, 'Iskra');
    await ola.page.getByRole('button', { name: 'Ścieżka Życia', exact: true }).click();
    const panel = region.locator('.advance');
    const role = panel.getByLabel('Nowa Rola');
    await role.selectOption({ label: 'Medyk — 60 PD' });
    await panel.getByRole('button', { name: 'Zmień', exact: true }).click();
    await expect.poll(() => card('Iskra').improvementPoints).toBe(440);
    const iskra = card('Iskra');
    test.info().annotations.push({
      type: 'Role Iskry',
      description: JSON.stringify({
        roleId: iskra.roleId,
        rank: iskra.roleAbilityRank,
        formerRoles: iskra.formerRoles,
      }),
    });
    expect(iskra.roleAbilityRank).toBe(1);
    expect(iskra.formerRoles.map((r) => [r.roleId, r.rank])).toContainEqual(['netrunner', 4]);
    expect(advancements('Iskra').at(-1)?.amount).toBe(-60);

    // Punkt Medycyny: panel Zdolności na stronie pierwszej.
    await ola.page.getByRole('button', { name: 'Karta', exact: true }).click();
    const medicine = region.locator('[data-sheet-panel="medicine"]');
    await expect(medicine).toBeVisible();
    await medicine.getByRole('button', { name: 'Dołóż punkt: Chirurgia' }).click();
    await expect.poll(() => card('Iskra').medicine.surgery).toBe(1);
    await expect(medicine.getByRole('button', { name: 'Dołóż punkt: Chirurgia' })).toBeDisabled();
    await closeSheet(ola.page);
  });

  test('6.3 i 6.5 Marek prosi Iskrę o Cyberoko, Ola wycenia, Marek zatwierdza — Test jej Chirurgią (#41)', async () => {
    // Montaż wprost z Medykiem innego gracza dalej odpada — drogą jest prośba.
    const direct = await emitAck(await marek.socket(), 'character:cyberware', {
      characterId: characterRow('Kowal').id,
      action: 'install',
      entryId: 'cyberware.cyberoko',
      payment: 'full',
      surgeon: { kind: 'character', characterId: characterRow('Iskra').id },
    });
    expect(direct).toEqual({ ok: false, error: 'CHARACTER_NOT_FOUND' });

    const before = card('Kowal');
    const surgeonEddies = card('Iskra').eddies;
    const ledgerMark = lastLedgerId();
    const mark = lastMessageId();

    // Marek: Kompendium → Cyberoko → „Iskra — Chirurgia 2 · poproś” → „Zainstaluj — 100 ed”.
    const entry = await compendiumEntry(marek, 'Cyberoko');
    const selects = entry.locator('.compendium-assign select');
    await selects.first().selectOption({ label: 'Kowal' });
    await selects.nth(1).selectOption({ label: 'Iskra — Chirurgia 2 · poproś' });
    await entry.getByRole('button', { name: 'Zainstaluj — 100 ed' }).click();
    await expect(entry.locator('.compendium-note')).toContainText('Prośba do: Iskra');
    // Prośba to nie operacja — nikt jeszcze nie zapłacił.
    expect(card('Kowal').eddies).toBe(before.eddies);

    // Ola (Firefox): karta prośby na czacie, pole ceny startuje od domyślnej 100 ed.
    await ola.page.getByRole('button', { name: 'Czat', exact: true }).click();
    const olaCard = ola.page.getByTestId('surgery-request').last();
    await expect(olaCard).toContainText('Kowal → Iskra: Cyberoko');
    await expect(olaCard).toContainText('Cena domyślna: 100 ed');
    const price = olaCard.getByLabel('Cena operacji w eurodolcach');
    await expect(price).toHaveValue('100');
    await price.fill('150');
    await olaCard.getByRole('button', { name: 'Wyceń na 150 ed' }).click();
    await expect(olaCard).toContainText('Wycena Medyka: 150 ed');
    expect(card('Kowal').eddies, 'wycena to jeszcze nie operacja').toBe(before.eddies);

    // Marek zatwierdza wyższą cenę. Test montażu (1k10) musi przejść — porażka niszczy
    // wszczep; 9, nie 10 (dziesiątka wybucha i bierze następną kość). 2k6 Człowieczeństwa = 3 + 4.
    scriptDice([9, 3, 4]);
    await marek.page.getByRole('button', { name: 'Czat', exact: true }).click();
    const marekCard = marek.page.getByTestId('surgery-request').last();
    await marekCard.getByRole('button', { name: 'Zgadzam się na 150 ed' }).click();
    await expect.poll(() => card('Kowal').cyberware.map((c) => c.name)).toContain('Cyberoko');
    expect(pendingDice()).toBe('');
    // Zamknięcie karty dochodzi po animacji obu rzutów (klient trzyma widoki do jej końca).
    for (const cardOf of [olaCard, marekCard]) {
      await expect(cardOf).toContainText('Zoperowane — 150 ed', { timeout: 20_000 });
    }

    const after = card('Kowal');
    expect(after.eddies).toBe(before.eddies - 150);
    expect(after.humanityCurrent).toBe(before.humanityCurrent - 7);
    expect(ledger('Kowal', ledgerMark).map((r) => [r.kind, r.amount])).toEqual([
      ['cyberware', -150],
    ]);
    expect(ledger('Iskra', ledgerMark).map((r) => [r.kind, r.amount])).toEqual([['transfer', 150]]);
    expect(card('Iskra').eddies, 'cała kwota trafia do Medyka').toBe(surgeonEddies + 150);

    const cards = query<{ id: number; kind: string; text: string; payload: string }>(
      'SELECT id, kind, text, payload FROM ChatMessage WHERE id > ? ORDER BY id',
      mark,
    );
    const surgery = cards.find((c) => c.text.startsWith('Montaż — Cyberoko'));
    const humanity = cards.find(
      (c) => c.text.startsWith('Człowieczeństwo') || /Człowiecz/.test(c.text),
    );
    test.info().annotations.push({
      type: 'karty montażu',
      description: JSON.stringify(cards.map((c) => [c.kind, c.text])),
    });
    expect(surgery, 'karta Testu montażu').toBeDefined();
    const surgeryRoll = JSON.parse(surgery!.payload) as {
      total: number;
      actor: string;
      outcome: { success: boolean };
      breakdown: { label: string; value: number }[];
    };
    expect(surgeryRoll.actor).toBe('Iskra');
    expect(surgeryRoll.outcome.success).toBe(true);
    expect(surgeryRoll.breakdown).toContainEqual({ label: 'Chirurgia', value: 2, kind: 'skill' });
    expect(surgeryRoll.total).toBe(9 + card('Iskra').stats.tech! + 2);
    expect(humanity, 'karta Utraty Człowieczeństwa').toBeDefined();
    expect((JSON.parse(humanity!.payload) as { total: number }).total).toBe(7);

    // Obie karty u pacjenta i u chirurga — z tym samym wynikiem, co w bazie.
    for (const player of [marek, ola]) {
      await expect
        .poll(
          async () => {
            const chat = await player.store<{
              items: { message?: { id: number; roll?: { total: number } } }[];
            }>('chat');
            return [surgery!.id, humanity!.id].map(
              (id) => chat?.items.find((i) => i.message?.id === id)?.message?.roll?.total ?? null,
            );
          },
          { message: player.name, timeout: 20_000 },
        )
        .toEqual([surgeryRoll.total, 7]);
    }
  });

  test('6.5 kanarki po T6a: nic tajnego u graczy, konsola bez błędów', async () => {
    for (const player of [marek, ola]) await expectClean(player, secretsFor(player));
    for (const actor of [mg, marek, ola]) {
      test.info().annotations.push({
        type: `konsola ${actor.name}`,
        description: JSON.stringify(actor.unexpectedErrors()),
      });
    }
    for (const actor of [mg, marek, ola]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
  });

  test('punkt kontrolny po-T6a: kopia i odtworzenie po handlu i rozwoju', async () => {
    const before = stateFingerprint();
    saveCheckpoint('po-T6a');
    expect(hasCheckpoint('po-T6a')).toBe(true);
    await restoreCheckpoint('po-T6a');
    await startInstance();
    expect(stateFingerprint()).toEqual(before);
  });
});
