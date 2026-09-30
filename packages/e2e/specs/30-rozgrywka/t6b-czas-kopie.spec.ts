import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { query, queryOne, stateFingerprint } from '../../fixtures/db.ts';
import { LLM_TIMEOUT_MS, requireGateway } from '../../fixtures/llm.ts';
import { KNAJPA } from '../../fixtures/maps.ts';
import { canariesInDatabase, ONLY_FROM } from '../../fixtures/nocna-zmiana.ts';
import { clickOnMap, fitCamera, tokenCentre } from '../../fixtures/scene.ts';
import { Canaries } from '../../fixtures/sniffer.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { createCampaign, createInvitation, say, shakeCup } from '../../fixtures/table.ts';
import {
  cellCentre,
  characterRow,
  chipInitiatives,
  clientsSeeTurn,
  closeSheet,
  combatants,
  combatRow,
  activeName,
  expectClean,
  lastMessageId,
  messageAfter,
  nextTurn,
  openSheet,
  rollAndWait,
  rollById,
  sheet,
  token,
} from '../../fixtures/walka.ts';
import {
  hasCheckpoint,
  pendingDice,
  prepareFresh,
  restoreBackup,
  restoreCheckpoint,
  saveCheckpoint,
  scriptDice,
  startInstance,
  stopInstance,
} from '../../instance/instance.ts';
import { BACKUP_DIR, CHECKPOINT_DIR, E2E_DIR, UPLOADS_DIR } from '../../instance/paths.ts';

/**
 * T6b (`testy.md` 5.4, kroki 6.6–6.9): od punktu `po-T6a` — czas, kronika i kopie.
 *
 * - **6.6** MG nakłada Kowalowi efekt na Cesze (REF −2 na godzinę), Marek widzi
 *   go w rozbiciu Testu, efekt schodzi dokładnie po sześciu skokach „+10 min”.
 *   Ustabilizowanie poza walką nie ma drogi w UI (#42, B1) — obejście przy stole:
 *   MG zaczyna krótką walkę, Iskra stabilizuje Kowala w swojej turze, MG ją
 *   kończy. Potem „+1 dzień” i „Odpoczynek” z okna zegara; Iskra bez
 *   Ustabilizowania dostaje odmowę.
 * - **6.7** wpis dziennika „tylko MG” z kanarkiem, streszczenie sesji botem
 *   (`@llm`) udostępnione stołowi, jedna propozycja relacji przyjęta, screamsheet
 *   o strzelaninie pod bramą zapisany i udostępniony obojgu.
 * - **6.8a** eksport kampanii (z czatem i bez), kart Kowala i Iskry oraz sceny
 *   „Brama” z zakładki „Kopie”; gracz zrzutu nie dostanie.
 * - **6.9** kopia z harmonogramu (`BACKUP_INTERVAL_MINUTES=1`), odtworzenie na
 *   czystym katalogu (bez bazy i uploadów), stół wraca tymi samymi ciasteczkami.
 *   Punkt `po-T6`.
 * - **6.8b** import na **pustej** instancji: najpierw bez plików (notujemy, co
 *   pęka — obrazy i powiązania figur z kartami), potem z plikami z `manifest.files`
 *   skopiowanymi do `uploads/`, jak przy przenosinach na VPS (Z10).
 *
 * Decyzje MG z 30.09 (sesja T6b): Iskra stabilizuje; efekt z formularza MG;
 * streszczenie i gazeta jawne; import „obie drogi” — odpięte figury to zachowanie
 * etapu 33 (dopisek do Z10), nie błąd. #42: obejście krótką walką, B1, poprawka
 * ma dać Ustabilizowanie także poza walką.
 */

type Row = { name: string; qty?: number };
type Card = {
  eddies: number;
  hpCurrent: number;
  stats: Record<string, number>;
  skills: Record<string, number>;
  recovery: { stabilized: boolean; antibioticDays?: number };
  statEffects: { id: string; stat: string; value: number; source: string }[];
  criticalInjuries: { name: string }[];
  gear: Row[];
  weapons: Row[];
  cyberware: Row[];
  armor: Row[];
};
type Manifest = {
  app: string;
  kind: string;
  version: number;
  campaignName: string;
  counts: Record<string, number>;
  omitted: string[];
  files: string[];
};
type ArchiveFile = { manifest: Manifest; payload: Record<string, unknown> };

/** Pliki wymiany i teksty z modelu — poza repo, w `.e2e/tmp/t6b`. */
const OUT_DIR = join(E2E_DIR, 'tmp', 't6b');

test.describe.serial('T6b: czas, kronika, eksport, kopie', () => {
  let mg: Actor;
  let marek: Actor;
  let ola: Actor;
  let cell: number;
  let campaignId: string;
  let invitation: string;
  const fromPlayers = new Canaries();
  const fromMarek = new Canaries();
  const fromOla = new Canaries();
  const secretsFor = (player: Actor) => [
    ...fromPlayers.secretNow,
    ...(player === marek ? fromMarek : fromOla).secretNow,
  ];
  const card = (name: string) => sheet<Card>(name);
  const at = (name: string) => [Math.round(token(name).x / cell), Math.round(token(name).y / cell)];
  const gameTime = () =>
    queryOne<{ gameTime: number }>('SELECT gameTime FROM Campaign WHERE id = ?', campaignId)!
      .gameTime;
  const clock = (actor: Actor) => actor.page.getByRole('region', { name: 'Zegar świata' });
  /** Licznik „Zakończ sesję” u MG przed rozmową z Paserem (#43) i odpowiedź bota. */
  let pendingAtStart = 0;
  let paserReply = '';
  /** Wypowiedzi czatu po ostatnim streszczeniu — to, co liczy `pendingLineCount` serwera. */
  const pendingSay = () =>
    queryOne<{ n: number }>(
      `SELECT count(*) AS n FROM ChatMessage WHERE kind = 'say' AND id > coalesce(
         (SELECT max(throughMessageId) FROM JournalEntry), 0)`,
    )!.n;
  /** Pliki pobrane w 6.8a: nazwa → ścieżka. */
  const exported = new Map<string, string>();
  const readArchive = (name: string) =>
    JSON.parse(readFileSync(exported.get(name)!, 'utf8')) as ArchiveFile;

  async function openClock(actor: Actor) {
    if (
      !(await clock(actor)
        .isVisible()
        .catch(() => false))
    ) {
      await actor.page.locator('.top-bar-clock').click();
    }
    await expect(clock(actor)).toBeVisible();
    return clock(actor);
  }

  async function closeClock(actor: Actor) {
    if (
      await clock(actor)
        .isVisible()
        .catch(() => false)
    ) {
      await clock(actor).getByRole('button', { name: 'Zamknij zegar' }).click();
    }
    await expect(clock(actor)).toHaveCount(0);
  }

  async function jump(label: '+10 min' | '+1 h' | '+1 dzień') {
    const before = gameTime();
    await (await openClock(mg)).getByRole('button', { name: label, exact: true }).click();
    await expect.poll(gameTime).toBeGreaterThan(before);
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

  /** Plik z przycisku „Pobierz …” w zakładce „Kopie” MG. */
  async function download(name: string, click: () => Promise<void>) {
    const pending = mg.page.waitForEvent('download');
    await click();
    const file = await pending;
    const target = join(OUT_DIR, name);
    await file.saveAs(target);
    exported.set(name, target);
    return target;
  }

  test.beforeAll(async () => {
    // Pełny przebieg idzie tu wprost po T6a; osobno — `E2E_FROM=po-T6a`.
    if (
      queryOne('SELECT id FROM Combat') ||
      !queryOne(`SELECT id FROM Scene WHERE name = 'Knajpa' AND active = 1`) ||
      !(card('Kowal').cyberware ?? []).some((c) => c.name === 'Cyberoko') ||
      queryOne('SELECT id FROM JournalEntry')
    ) {
      throw new Error('E2E: T6b needs the po-T6a state (E2E_FROM=po-T6a)');
    }
    mkdirSync(OUT_DIR, { recursive: true });
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('start z po-T6a: drużyna w „Knajpie”, Kowal przy barze', async ({ cast }) => {
    mg = await cast.mg('chromium');
    campaignId = queryOne<{ id: string }>(
      `SELECT id FROM Campaign WHERE name = 'Nocna zmiana'`,
    )!.id;
    invitation = await createInvitation(mg, campaignId);
    marek = await cast.gracz('Marek', 'chromium', invitation);
    ola = await cast.gracz('Ola', 'firefox', invitation);
    cell = queryOne<{ gridSizePx: number }>(
      `SELECT gridSizePx FROM Scene WHERE name = 'Knajpa'`,
    )!.gridSizePx;
    for (const actor of [mg, marek, ola]) {
      await expect
        .poll(
          async () => (await actor.store<{ scene: { name: string } | null }>('scene'))?.scene?.name,
          { message: actor.name },
        )
        .toBe('Knajpa');
      await fitCamera(actor.page, KNAJPA.width, KNAJPA.height).catch(() => undefined);
    }
    // Tajemnice z końca T6a: łup Zbira jawny dla obojga (handel), piętra Sieci — dla Oli.
    for (const [code, label] of canariesInDatabase()) {
      const onlyFrom =
        label === 'lup-Zbira'
          ? undefined
          : label === 'pietro-LOD' || label === 'pietro-wezla'
            ? 'Marek'
            : ONLY_FROM[label];
      if (label === 'lup-Zbira') continue;
      (onlyFrom === 'Marek' ? fromMarek : onlyFrom === 'Ola' ? fromOla : fromPlayers).track(code);
    }
    test.info().annotations.push({
      type: 'stan startowy',
      description: JSON.stringify({
        gameTime: gameTime(),
        Kowal: [card('Kowal').hpCurrent, card('Kowal').recovery, at('Kowal')],
        Iskra: [card('Iskra').hpCurrent, card('Iskra').recovery, at('Iskra')],
      }),
    });
  });

  test('6.6a efekt na Cesze: REF −2 na godzinę — w rozbiciu Testu Marka, schodzi po 60 min', async () => {
    test.setTimeout(3 * 60_000);
    const source = 'Kac po Knajpie';
    const region = await openSheet(mg, 'Kowal');
    const panel = region.locator('.cp-stat-effects');
    await panel.getByLabel('Cecha efektu').selectOption({ label: 'REF' });
    await panel.getByLabel('O ile').fill('-2');
    await panel.getByLabel('Źródło efektu').fill(source);
    await panel.getByLabel('Czas trwania').selectOption({ label: 'na godzinę' });
    const appliedAt = gameTime();
    await panel.getByRole('button', { name: 'Nałóż', exact: true }).click();
    await expect
      .poll(() => card('Kowal').statEffects.map((e) => [e.stat, e.value]))
      .toEqual([['ref', -2]]);
    await closeSheet(mg.page);

    // Marek: chip na karcie i wiersz w rozbiciu Testu z REF (Broń krótka).
    const own = await openSheet(marek, 'Kowal');
    await expect(own.locator('.cp-stat-effects')).toContainText(source);
    await marek.page
      .getByRole('button', { name: /^Broń krótka \(REF\)/ })
      .first()
      .click();
    await marek.page.locator('.dialog').last().getByRole('button', { name: 'Weź kubek' }).click();
    await closeSheet(marek.page);
    scriptDice([5]);
    const mark = lastMessageId();
    const id = await rollAndWait(marek, mark, 'Broń krótka');
    const roll = rollById(id);
    test.info().annotations.push({ type: 'rozbicie Testu', description: JSON.stringify(roll) });
    expect(roll.breakdown).toContainEqual(
      expect.objectContaining({ value: -2, label: expect.stringContaining(source) }),
    );
    expect(pendingDice()).toBe('');

    // Pięć skoków po 10 minut — efekt trwa; szósty (60 min od nałożenia) go zdejmuje.
    const before = lastMessageId();
    for (let step = 0; step < 5; step += 1) await jump('+10 min');
    expect(gameTime() - appliedAt).toBe(50);
    expect(card('Kowal').statEffects).toHaveLength(1);
    await jump('+10 min');
    expect(gameTime() - appliedAt).toBe(60);
    await expect.poll(() => card('Kowal').statEffects).toEqual([]);
    const expired = messageAfter(before, 'Efekty wygasły', 'action');
    expect(expired, 'wiersz „Efekty wygasły” na czacie').toBeDefined();
    test.info().annotations.push({ type: 'wygaśnięcie', description: expired!.text });
    for (const player of [marek, ola]) {
      await player.page.getByRole('button', { name: 'Czat', exact: true }).click();
      await expect(
        player.page.locator('.chat-message', { hasText: 'Efekty wygasły' }).last(),
      ).toBeVisible({
        timeout: 20_000,
      });
    }
    await expect(
      marek.page.locator('.hud-rail .stat-effect, .cp-stat-effects', { hasText: source }),
    ).toHaveCount(0);
    await closeClock(mg);
  });

  test('6.6b #42 Ustabilizowanie poza walką: guzik na pasku Iskry nie otwiera wyboru pacjenta', async () => {
    test.fail(true, '#42 — Ustabilizowanie poza walką nie ma drogi w UI (B1)');
    // Kowal wraca od baru do Iskry (pole z końca T4b), żeby był na wyciągnięcie ręki.
    await walk(marek, 'Kowal', 8, 8);
    const page = ola.page;
    await page.keyboard.press('Escape');
    await clickOnMap(page, tokenCentre(token('Iskra'), cell));
    const slot = page.locator('.hud-slot', {
      has: page.locator('.hud-slot-label', { hasText: 'Ustabilizowanie' }),
    });
    test.info().annotations.push({
      type: 'pasek Iskry poza walką',
      description: await page
        .locator('.hud-rail')
        .ariaSnapshot()
        .catch(() => '(brak paska)'),
    });
    await expect(slot).toBeVisible();
    await slot.click();
    await expect(
      page
        .locator('.combat-picker-row', { hasText: 'Kowal' })
        .getByRole('button', { name: 'Ustabilizuj' }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('6.6c odpoczynek przed Ustabilizowaniem: guzik wyszarzony, serwer odmawia', async () => {
    const region = await openSheet(marek, 'Kowal');
    await expect(region.getByRole('button', { name: 'Dzień odpoczynku' })).toBeDisabled();
    await expect(region).toContainText('Naturalne leczenie nie ruszyło');
    await closeSheet(marek.page);
    const hp = card('Kowal').hpCurrent;
    const ack = await emitAck<{ healed: number; refusal: string | null }>(
      await marek.socket(),
      'character:rest',
      { characterId: characterRow('Kowal').id },
    );
    test.info().annotations.push({ type: 'odmowa odpoczynku', description: JSON.stringify(ack) });
    expect(ack.ok && ack.data?.refusal).toBe('notStabilized');
    expect(card('Kowal').hpCurrent).toBe(hp);
  });

  test('6.6d obejście #42: krótka walka, Iskra stabilizuje Kowala w swojej turze', async () => {
    test.setTimeout(4 * 60_000);
    const page = mg.page;
    await page.getByRole('button', { name: 'Walka', exact: true }).first().click();
    // Tylko drużyna — statyści z „Knajpy” zostają poza kolejką.
    await page.getByRole('button', { name: 'Tylko postacie graczy' }).click();
    await expect(page.getByRole('checkbox', { name: 'Kowal', exact: true })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Iskra', exact: true })).toBeChecked();
    await page.getByRole('button', { name: /Rozpocznij walkę/ }).click();
    await expect.poll(() => combatants().length).toBe(2);

    async function rollInitiative(actor: Actor, face: number) {
      scriptDice([face]);
      await actor.page.getByRole('button', { name: /^Rzuć inicjatywę:/ }).click();
      const id = await rollAndWait(actor, lastMessageId(), 'Inicjatywa');
      const roll = rollById(id);
      await expect
        .poll(() => chipInitiatives(mg), { timeout: 30_000, message: `${actor.name} na pasie MG` })
        .toContain(String(roll.total));
    }
    await rollInitiative(ola, 9);
    await rollInitiative(marek, 1);
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect.poll(() => combatRow()?.activeCombatantId ?? null).not.toBeNull();
    if (activeName() !== 'Iskra') await nextTurn(mg);
    expect(activeName()).toBe('Iskra');
    // Klik w slot przed tym, jak klient Oli dostanie turę, kończy się notką „To nie jest tura”.
    await clientsSeeTurn(ola);

    // Ola: własna figura, slot „Ustabilizowanie”, pacjent z listy, rzut kubkiem.
    const olaPage = ola.page;
    await olaPage.keyboard.press('Escape');
    await clickOnMap(olaPage, tokenCentre(token('Iskra'), cell));
    await olaPage
      .locator('.hud-slot', {
        has: olaPage.locator('.hud-slot-label', { hasText: 'Ustabilizowanie' }),
      })
      .click();
    await olaPage
      .locator('.combat-picker-row', { hasText: 'Kowal' })
      .getByRole('button', { name: 'Ustabilizuj' })
      .click();
    scriptDice([9]);
    const mark = lastMessageId();
    await shakeCup(olaPage);
    await expect
      .poll(() => messageAfter(mark, 'Ustabilizowanie')?.id ?? 0, { timeout: 20_000 })
      .toBeGreaterThan(0);
    const stabilizeId = messageAfter(mark, 'Ustabilizowanie')!.id;
    const roll = rollById(stabilizeId);
    test.info().annotations.push({ type: 'Ustabilizowanie', description: JSON.stringify(roll) });
    expect(pendingDice()).toBe('');
    await expect.poll(() => card('Kowal').recovery.stabilized).toBe(true);
    // Karta rzutu jawna dla stołu — u MG i Marka ten sam wynik, co w bazie.
    for (const actor of [mg, marek]) {
      await expect
        .poll(
          async () =>
            (
              await actor.store<{
                items: { message?: { id: number; roll?: { total: number } } }[];
              }>('chat')
            )?.items.find((i) => i.message?.id === stabilizeId)?.message?.roll?.total ?? null,
          { message: actor.name, timeout: 30_000 },
        )
        .toBe(roll.total);
    }

    // MG kończy walkę (✕ pyta `window.confirm` — fixture odpowiada „tak”).
    await page.getByRole('button', { name: 'Wyłącz tryb turowy' }).click();
    await expect.poll(() => combatRow() ?? null).toBeNull();
  });

  test('6.6e doba: „+1 dzień”, odpoczynek Kowala z okna zegara, Iskra bez Ustabilizowania', async () => {
    const kowal = card('Kowal');
    const iskra = card('Iskra');
    const days = gameTime();
    await jump('+1 dzień');
    expect(gameTime() - days).toBe(24 * 60);
    const window = await openClock(mg);
    await expect(window.getByRole('heading', { name: /Odpoczynek — minęła doba/ })).toBeVisible();
    const rows = window.locator('.clock-rest li');
    const mark = lastMessageId();
    await rows.filter({ hasText: 'Kowal' }).getByRole('button', { name: 'Odpoczynek' }).click();
    await expect.poll(() => card('Kowal').hpCurrent).toBeGreaterThan(kowal.hpCurrent);
    const healed = card('Kowal').hpCurrent - kowal.hpCurrent;
    await rows.filter({ hasText: 'Iskra' }).getByRole('button', { name: 'Odpoczynek' }).click();
    const cards = () =>
      query<{ kind: string; text: string }>(
        'SELECT kind, text FROM ChatMessage WHERE id > ? ORDER BY id',
        mark,
      );
    await expect.poll(() => cards().length).toBeGreaterThanOrEqual(2);
    test.info().annotations.push({
      type: 'doba odpoczynku',
      description: JSON.stringify({ healed, body: kowal.stats.body, cards: cards() }),
    });
    // Tempo z karty (s. 222): BODY PW na dobę, bez antybiotyku.
    expect(healed).toBe(kowal.stats.body);
    expect(card('Iskra').hpCurrent, 'Iskry nikt nie ustabilizował').toBe(iskra.hpCurrent);
    await closeClock(mg);

    // Gracz widzi nowe PW na swojej karcie.
    const region = await openSheet(marek, 'Kowal');
    await expect(region.locator('.cp-recovery-rate')).toBeVisible();
    await closeSheet(marek.page);
  });

  test('6.7a dziennik: wpis „tylko MG” z kanarkiem nie dociera do graczy', async () => {
    const page = mg.page;
    await page.getByRole('button', { name: 'Dziennik', exact: true }).click();
    await page.getByRole('button', { name: '+ Wpis ręcznie' }).click();
    const form = page.locator('form', {
      has: page.getByPlaceholder('np. Skok na skład Militechu'),
    });
    const secret = fromPlayers.secret('dziennik-MG');
    await form.getByPlaceholder('np. Skok na skład Militechu').fill('Notatki MG po nocnej zmianie');
    await form
      .getByPlaceholder('Co się wydarzyło na sesji. Pisz zdaniami — model czyta to jak notatkę.')
      .fill(`Paser kupuje chip od Rzeźnika za plecami drużyny. ${secret}`);
    await form.getByRole('button', { name: 'Dodaj wpis' }).click();
    await expect
      .poll(() => queryOne<{ n: number }>('SELECT count(*) AS n FROM JournalEntry')?.n)
      .toBe(1);
    const entry = queryOne<{ visibility: string; sharedWithPlayers: number }>(
      'SELECT visibility, sharedWithPlayers FROM JournalEntry',
    )!;
    expect(entry).toEqual({ visibility: 'gm', sharedWithPlayers: 0 });
    for (const player of [marek, ola]) {
      await player.page.getByRole('button', { name: 'Dziennik', exact: true }).click();
      await expect(player.page.locator('.journal-panel')).toContainText(
        'Mistrz Gry nie udostępnił jeszcze żadnego wpisu',
      );
      await expectClean(player, secretsFor(player));
    }
  });

  test('6.7b @llm koniec wieczoru w roli: Kowal dziękuje Paserowi, bot odpowiada', async () => {
    test.setTimeout(LLM_TIMEOUT_MS + 60_000);
    await requireGateway();
    pendingAtStart = Number(
      /\((\d+)\)/.exec(
        (await mg.page
          .getByRole('button', { name: /^Zakończ sesję i streść \(\d+\)/ })
          .textContent()) ?? '',
      )?.[1],
    );
    // Koniec wieczoru w roli: Kowal dziękuje Paserowi — materiał na relację w logu
    // (poza tym czat „Nocnej zmiany” to prawie same rzuty i akcje, nie wypowiedzi).
    const paser = queryOne<{ id: string }>(`SELECT id FROM BotProfile WHERE name = 'Paser'`)!.id;
    const talk = lastMessageId();
    await marek.page.getByRole('button', { name: 'Czat', exact: true }).click();
    await say(
      marek,
      'Paser, twój Ronin uratował mi skórę pod bramą. Jestem ci winien przysługę — następnym razem przyniosę ci chip z chłodni.',
    );
    await expect
      .poll(
        () =>
          queryOne<{ text: string }>(
            'SELECT text FROM ChatMessage WHERE botId = ? AND id > ? ORDER BY id DESC',
            paser,
            talk,
          )?.text ?? '',
        { timeout: LLM_TIMEOUT_MS, intervals: [2_000] },
      )
      .not.toBe('');
    paserReply =
      queryOne<{ text: string }>(
        'SELECT text FROM ChatMessage WHERE botId = ? AND id > ? ORDER BY id DESC',
        paser,
        talk,
      )?.text ?? '';
    test.info().annotations.push({ type: 'odpowiedź Pasera', description: paserReply });
    // Wypowiedź Marka i odpowiedź Pasera to dwie nowe linie do streszczenia.
    expect(pendingSay()).toBe(pendingAtStart + 2);
  });

  test('#45 wypowiedź gracza podpisana postacią — bot i kronikarz mówią do Kowala, nie do Marka', async () => {
    test.fail(
      true,
      '#45 — wiersz `say` gracza bez `speakerName`, historia bota i transkrypt biorą nazwę konta',
    );
    // Podpis wiersza jest źródłem obu: historii czatu w prompcie bota i transkryptu
    // streszczenia (`speakerName ?? author.name`). Odpowiedź modelu jest losowa — podpis nie.
    const lines = query<{ speakerName: string | null; text: string }>(
      `SELECT m.speakerName, m.text FROM ChatMessage m JOIN User u ON u.id = m.authorId
         WHERE m.kind = 'say' AND m.botId IS NULL AND u.name = 'Marek' ORDER BY m.id`,
    );
    test
      .info()
      .annotations.push(
        { type: 'podpisy wypowiedzi Marka', description: JSON.stringify(lines) },
        { type: 'odpowiedź Pasera', description: paserReply },
      );
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.map((line) => line.speakerName)).toEqual(lines.map(() => 'Kowal'));
  });

  test('6.7c #43 licznik „Zakończ sesję i streść (N)” u MG rośnie z nowymi wypowiedziami', async () => {
    test.fail(true, '#43 — licznik przychodzi tylko z `journal:list` (wejście w zakładkę)');
    const pending = pendingSay();
    test.info().annotations.push({
      type: 'licznik',
      description: JSON.stringify({ przedRozmowa: pendingAtStart, wBazie: pending }),
    });
    await expect(
      mg.page.getByRole('button', { name: `Zakończ sesję i streść (${pending})` }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('6.7d @llm streszczenie sesji botem, udostępnione stołowi, relacja NPC z propozycji', async () => {
    test.setTimeout(15 * 60_000);
    await requireGateway();
    const paser = queryOne<{ id: string }>(`SELECT id FROM BotProfile WHERE name = 'Paser'`)!.id;
    const page = mg.page;
    // Obejście #43: zakładka od nowa — licznik przychodzi z `journal:list`.
    await page.getByRole('button', { name: 'Czat', exact: true }).click();
    await page.getByRole('button', { name: 'Dziennik', exact: true }).click();
    const summarize = page.getByRole('button', { name: /^Zakończ sesję i streść \(\d+\)/ });
    const draft = page.locator('form.journal-draft');
    const hint = page.getByPlaceholder('Opcjonalnie: na czym się skupić — np. wątek z Militechem');
    let lines = 0;
    let title = '';
    let body = '';
    let proposals: string[] = [];
    const attempts: { seconds: number; proposals: number }[] = [];
    // Model bywa oszczędny w propozycjach — MG streszcza drugi raz, jak przy stole.
    for (let attempt = 0; attempt < 2 && proposals.length === 0; attempt += 1) {
      if (attempt > 0) await draft.getByRole('button', { name: 'Odrzuć szkic' }).click();
      await expect(summarize).toBeEnabled();
      lines = Number(/\((\d+)\)/.exec((await summarize.textContent()) ?? '')?.[1]);
      await hint.fill('Jak po tej nocy zmieniło się nastawienie Pasera do Kowala?');
      const started = Date.now();
      await summarize.click();
      await expect(draft).toBeVisible({ timeout: 12 * 60_000 });
      const seconds = Math.round((Date.now() - started) / 1000);
      title = await draft.getByLabel('Tytuł').inputValue();
      body = await draft.getByLabel('Treść').inputValue();
      proposals = await draft.locator('.journal-proposal').allTextContents();
      attempts.push({ seconds, proposals: proposals.length });
      writeFileSync(
        join(OUT_DIR, `streszczenie-${attempt + 1}.txt`),
        [`${lines} wypowiedzi, ${seconds} s`, title, body, 'Propozycje:', ...proposals, ''].join(
          '\n\n',
        ),
      );
    }
    test.info().annotations.push({
      type: 'streszczenie',
      description: JSON.stringify({ lines, attempts, title, body, proposals }),
    });
    expect(body.length).toBeGreaterThan(100);
    expect(body).toMatch(/[ąćęłńóśźż]/);
    expect(body).not.toMatch(/<think>|\p{Script=Han}/u);

    // Relacja: pierwsza propozycja przyjęta ręką MG — zapis dopiero po kliknięciu.
    // Bez propozycji (obserwacja do `testy.md` 8) MG ustawia nastawienie sam.
    const relationsBefore = query('SELECT * FROM BotRelation').length;
    const marekMark = await marek.sniffer.mark();
    const olaMark = await ola.sniffer.mark();
    if (proposals.length > 0) {
      await draft
        .locator('.journal-proposal')
        .first()
        .getByRole('button', { name: 'Zastosuj' })
        .click();
    } else {
      test.info().annotations.push({
        type: 'obserwacja',
        description:
          'model nie zaproponował relacji w dwóch streszczeniach — MG ustawia ją ręcznie',
      });
      const ack = await emitAck(await mg.socket(), 'relation:set', {
        botId: paser,
        characterId: characterRow('Kowal').id,
        value: 1,
        note: 'Kowal obiecał Paserowi chip z chłodni za Ronina',
      });
      expect(ack.ok).toBe(true);
    }
    await expect.poll(() => query('SELECT * FROM BotRelation').length).toBe(relationsBefore + 1);
    const relation = queryOne<{ value: number; note: string; bot: string; who: string }>(
      `SELECT r.value, r.note, b.name AS bot, c.name AS who FROM BotRelation r
         JOIN BotProfile b ON b.id = r.botId JOIN Character c ON c.id = r.characterId`,
    )!;
    test.info().annotations.push({ type: 'relacja', description: JSON.stringify(relation) });

    // Streszczenie: widzi stół, pamięć botów bez zmian (Tylko MG).
    await draft.getByLabel(/Widzi stół/).check();
    await draft.getByRole('button', { name: 'Zapisz do dziennika' }).click();
    await expect
      .poll(
        () =>
          queryOne<{ n: number }>(
            'SELECT count(*) AS n FROM JournalEntry WHERE sharedWithPlayers = 1',
          )?.n,
        { timeout: 60_000 },
      )
      .toBe(1);
    const saved = queryOne<{ title: string; lineCount: number; throughMessageId: number }>(
      'SELECT title, lineCount, throughMessageId FROM JournalEntry WHERE sharedWithPlayers = 1',
    )!;
    expect(saved.lineCount).toBe(lines);
    for (const player of [marek, ola]) {
      await player.page.getByRole('button', { name: 'Dziennik', exact: true }).click();
      await expect(player.page.locator('.journal-panel'), player.name).toContainText(saved.title, {
        timeout: 20_000,
      });
      await expect(player.page.locator('.journal-panel')).not.toContainText(
        'Notatki MG po nocnej zmianie',
      );
      // Relacje nie opuszczają pokoju MG — ani zdarzeniem, ani notatką.
      const since = player === marek ? marekMark : olaMark;
      expect(await player.sniffer.found(['relation:upsert'], since), player.name).toEqual([]);
      if (relation.note.length >= 12) {
        expect(await player.sniffer.found([relation.note], since), player.name).toEqual([]);
      }
      await expectClean(player, secretsFor(player));
    }
  });

  test('6.7e @llm screamsheet o strzelaninie pod bramą: szkic u MG, zapis, potem obojgu', async () => {
    test.setTimeout(6 * 60_000);
    await requireGateway();
    const page = mg.page;
    await page.getByRole('button', { name: 'Handouty', exact: true }).click();
    await page.getByRole('button', { name: /\+ Screamsheet/ }).click();
    const form = page.locator('form.handout-form');
    await form
      .getByPlaceholder('np. strzelanina w Kabuki')
      .fill('strzelanina pod bramą strefy przemysłowej');
    const started = Date.now();
    await form.getByRole('button', { name: '✨ Napisz artykuł' }).click();
    await expect(form.getByText(/Artykuł napisany w/)).toBeVisible({ timeout: LLM_TIMEOUT_MS });
    const seconds = Math.round((Date.now() - started) / 1000);
    const headline = await form
      .getByRole('textbox', { name: 'Nagłówek', exact: true })
      .inputValue();
    const lead = await form.getByRole('textbox', { name: 'Lead', exact: true }).inputValue();
    const body = await form.getByRole('textbox', { name: /^Treść artykułu/ }).inputValue();
    writeFileSync(
      join(OUT_DIR, 'screamsheet.txt'),
      `${seconds} s\n\n${headline}\n\n${lead}\n\n${body}\n`,
    );
    test.info().annotations.push({
      type: 'screamsheet',
      description: JSON.stringify({ seconds, headline, lead, body }),
    });
    expect(headline.length).toBeGreaterThan(5);
    expect(body.length).toBeGreaterThan(200);
    expect(`${headline} ${lead} ${body}`).toMatch(/[ąćęłńóśźż]/);
    expect(body).not.toMatch(/<think>|\p{Script=Han}/u);

    // Szkic i zapisana, nieudostępniona gazeta zostają u MG.
    const marekMark = await marek.sniffer.mark();
    const olaMark = await ola.sniffer.mark();
    await form.getByRole('button', { name: 'Dodaj handout' }).click();
    await expect
      .poll(() => queryOne<{ id: string }>(`SELECT id FROM Handout WHERE kind = 'screamsheet'`)?.id)
      .toBeTruthy();
    const handoutId = queryOne<{ id: string }>(
      `SELECT id FROM Handout WHERE kind = 'screamsheet'`,
    )!.id;
    const probe = headline.slice(0, 40);
    for (const player of [marek, ola]) {
      expect(await player.sniffer.found([probe], player === marek ? marekMark : olaMark)).toEqual(
        [],
      );
    }

    // „Wszystkim” — oboje dostają gazetę w zakładce „Handouty”.
    const row = page.locator('.handout-row--gm', { hasText: headline.slice(0, 30) });
    await row.getByRole('button', { name: 'Wszystkim' }).click();
    await expect
      .poll(() => query('SELECT userId FROM HandoutShare WHERE handoutId = ?', handoutId).length)
      .toBe(2);
    for (const player of [marek, ola]) {
      await player.page.getByRole('button', { name: 'Handouty', exact: true }).click();
      await expect(
        player.page.locator('.handout-row', { hasText: headline.slice(0, 30) }),
      ).toBeVisible({
        timeout: 20_000,
      });
    }
  });

  test('6.8a eksport z „Kopii”: kampania z czatem i bez, karty Kowala i Iskry, scena „Brama”', async () => {
    const page = mg.page;
    await page.getByRole('button', { name: 'Kopie', exact: true }).click();
    const panel = page.locator('.archive-section', { hasText: 'Zrzut całej kampanii' });
    const chatBox = panel.getByRole('checkbox');
    await expect(chatBox).toBeChecked();
    await download('kampania-z-czatem.json', () =>
      panel.getByRole('button', { name: 'Pobierz zrzut' }).click(),
    );
    await chatBox.uncheck();
    await download('kampania-bez-czatu.json', () =>
      panel.getByRole('button', { name: 'Pobierz zrzut' }).click(),
    );
    const cards = page.locator('.archive-section', { hasText: 'Karta postaci' });
    for (const name of ['Kowal', 'Iskra']) {
      await cards.getByLabel('Karta do pobrania').selectOption({ label: name });
      await download(`karta-${name}.json`, () =>
        cards.getByRole('button', { name: 'Pobierz kartę' }).click(),
      );
    }
    const scenes = page.locator('.archive-section', { hasText: 'Scena' }).filter({
      has: page.getByLabel('Scena do pobrania'),
    });
    await scenes.getByLabel('Scena do pobrania').selectOption({ label: 'Brama' });
    await download('scena-Brama.json', () =>
      scenes.getByRole('button', { name: 'Pobierz scenę' }).click(),
    );

    const withChat = readArchive('kampania-z-czatem.json');
    const noChat = readArchive('kampania-bez-czatu.json');
    const sizes = Object.fromEntries(
      [...exported].map(([name, path]) => [name, readFileSync(path).length]),
    );
    test.info().annotations.push({
      type: 'eksport',
      description: JSON.stringify({
        sizes,
        withChat: withChat.manifest,
        noChat: noChat.manifest,
      }),
    });
    expect(withChat.manifest).toMatchObject({
      app: 'vtt',
      kind: 'campaign',
      campaignName: 'Nocna zmiana',
    });
    expect(withChat.manifest.counts.characters).toBe(
      queryOne<{ n: number }>(
        'SELECT count(*) AS n FROM Character WHERE campaignId = ?',
        campaignId,
      )!.n,
    );
    expect(noChat.manifest.omitted.join(' ')).toMatch(/Czat/);
    expect(sizes['kampania-bez-czatu.json']!).toBeLessThan(sizes['kampania-z-czatem.json']!);
    // Zrzut to cała prawda o kampanii — łącznie z tajemnicami MG — ale bez kont i haseł.
    const dump = readFileSync(exported.get('kampania-z-czatem.json')!, 'utf8');
    expect(dump).toContain('dziennik-MG');
    expect(dump).not.toMatch(/passwordHash|"password"|cookie/i);
    expect(withChat.manifest.files.length).toBeGreaterThan(0);
    const scene = readArchive('scena-Brama.json');
    expect(scene.manifest.kind).toBe('scene');
    expect(scene.manifest.files.some((f) => f.includes('/uploads/'))).toBe(true);

    // Gracz zrzutu nie dostanie — kontrola pozytywna MG obok.
    const gmResponse = await mg.page.request.get('/api/archive/campaign?chat=0');
    expect(gmResponse.status()).toBe(200);
    for (const player of [marek, ola]) {
      const response = await player.page.request.get('/api/archive/campaign?chat=0');
      expect(response.status(), player.name).toBe(403);
      const character = await player.page.request.get(
        `/api/archive/character/${characterRow('Kowal').id}`,
      );
      expect(character.status(), player.name).toBe(403);
    }
  });

  let backupName = '';
  /** Zdanie po wczytaniu sceny w 6.8b — do #44. */
  let sceneImportNote = '';
  let before: ReturnType<typeof stateFingerprint>;

  test('6.9a kopia z harmonogramu: restart z kopią co minutę, zakładka „Kopie” ją pokazuje', async () => {
    test.setTimeout(5 * 60_000);
    await stopInstance();
    await startInstance({ BACKUP_INTERVAL_MINUTES: '1' });
    // Stół wraca sam (gniazdo łączy się ponownie), bez logowania.
    for (const actor of [mg, marek, ola]) {
      await actor.page.reload();
      await expect
        .poll(async () => (await actor.store<{ status: string } | null>('auth'))?.status, {
          message: actor.name,
          timeout: 30_000,
        })
        .toBe('authenticated');
    }
    // Znacznik przed kopią: ten wiersz musi przeżyć odtworzenie.
    await marek.page.getByRole('button', { name: 'Czat', exact: true }).click();
    await say(marek, 'Idę spać, rano pogadamy z Paserem.');
    await expect
      .poll(() => messageAfter(0, 'Idę spać, rano pogadamy', 'say')?.id ?? 0)
      .toBeGreaterThan(0);

    const timerCopies = () =>
      (existsSync(BACKUP_DIR) ? readdirSync(BACKUP_DIR) : [])
        .filter((name) => name.startsWith('snapshot-'))
        .map((name) => ({
          name,
          manifest: existsSync(join(BACKUP_DIR, name, 'manifest.json'))
            ? (JSON.parse(readFileSync(join(BACKUP_DIR, name, 'manifest.json'), 'utf8')) as {
                reason: string;
                takenAt: string;
                files: number;
              })
            : null,
        }));
    const sayAt = Date.now();
    await expect
      .poll(
        () =>
          timerCopies().find(
            (copy) =>
              copy.manifest?.reason === 'timer' && Date.parse(copy.manifest.takenAt) > sayAt,
          )?.name ?? '',
        { timeout: 150_000, intervals: [2_000] },
      )
      .not.toBe('');
    const copy = timerCopies().find(
      (c) => c.manifest?.reason === 'timer' && Date.parse(c.manifest.takenAt) > sayAt,
    )!;
    backupName = copy.name;
    before = stateFingerprint();
    test.info().annotations.push({ type: 'kopie', description: JSON.stringify(timerCopies()) });
    expect(copy.manifest!.files).toBeGreaterThan(0);

    const page = mg.page;
    await page.getByRole('button', { name: 'Kopie', exact: true }).click();
    const section = page.locator('.archive-section', { hasText: 'Kopie zapasowe' });
    await expect(section).toContainText('kopia co 1 min');
    await expect(section.locator('.archive-row', { hasText: backupName })).toBeVisible();

    // Po kopii: ten wiersz odtworzenie ma cofnąć.
    await say(marek, 'Jeszcze jedno piwo na drogę.');
    await expect
      .poll(() => messageAfter(0, 'Jeszcze jedno piwo', 'say')?.id ?? 0)
      .toBeGreaterThan(0);
  });

  test('6.9b odtworzenie na czystym katalogu: stół wraca tymi samymi ciasteczkami', async () => {
    test.setTimeout(4 * 60_000);
    // Stan kopii odczytany z jej własnego pliku — to z nim porównujemy odtworzoną bazę.
    await restoreBackup(backupName);
    await startInstance();
    const restored = stateFingerprint();
    // Odcisk sprzed kopii zrobiony chwilę po niej — różni się co najwyżej wierszem czatu „po kopii”.
    const differ = Object.keys(restored).filter(
      (table) => JSON.stringify(restored[table]) !== JSON.stringify(before[table]),
    );
    test.info().annotations.push({
      type: 'tabele różne od stanu przy kopii',
      description: differ.join(', '),
    });
    expect(differ.filter((table) => table !== 'ChatMessage')).toEqual([]);
    expect(messageAfter(0, 'Idę spać, rano pogadamy', 'say'), 'wiersz sprzed kopii').toBeDefined();
    expect(messageAfter(0, 'Jeszcze jedno piwo', 'say'), 'wiersz po kopii').toBeUndefined();

    for (const actor of [mg, marek, ola]) {
      await actor.page.reload();
      await expect
        .poll(async () => (await actor.store<{ status: string } | null>('auth'))?.status, {
          message: `${actor.name} — to samo ciasteczko po odtworzeniu`,
          timeout: 30_000,
        })
        .toBe('authenticated');
      await expect
        .poll(
          async () => (await actor.store<{ scene: { name: string } | null }>('scene'))?.scene?.name,
          { message: actor.name },
        )
        .toBe('Knajpa');
    }
    // Uploady wróciły z kopią: mapa „Knajpy” i portret Kowala.
    const scene = queryOne<{ backgroundUrl: string }>(
      `SELECT backgroundUrl FROM Scene WHERE name = 'Knajpa'`,
    )!;
    expect((await ola.page.request.get(scene.backgroundUrl)).status()).toBe(200);
    // Link zaproszenia dalej prowadzi do tego samego konta.
    const again = await marek.page.request.post(`/api/join/${invitation}`, {
      data: { name: 'Marek' },
    });
    test
      .info()
      .annotations.push({ type: 'link po odtworzeniu', description: String(again.status()) });
    expect(again.status()).toBe(200);
    expect(queryOne<{ n: number }>(`SELECT count(*) AS n FROM User WHERE name = 'Marek'`)!.n).toBe(
      1,
    );
  });

  test('6.9c kanarki po T6b i punkt kontrolny po-T6', async () => {
    for (const player of [marek, ola]) await expectClean(player, secretsFor(player));
    for (const actor of [mg, marek, ola]) {
      test.info().annotations.push({
        type: `konsola ${actor.name}`,
        description: JSON.stringify(actor.unexpectedErrors()),
      });
    }
    // Restart instancji w 6.9 zrywa gniazdo i odmawia pobrań z `vite preview`, który w tej
    // chwili leży — „WebSocket … interrupted”, ERR_CONNECTION_REFUSED i u Firefoksa font
    // ze `status=2152398861` (NS_ERROR_CONNECTION_REFUSED) to nie błędy aplikacji.
    const real = (actor: Actor) =>
      actor
        .unexpectedErrors()
        .filter(
          (text) =>
            !/WebSocket|socket\.io|NS_ERROR_NET|ERR_CONNECTION_REFUSED|status=2152398861/.test(
              text,
            ),
        );
    for (const actor of [mg, marek, ola]) expect(real(actor), actor.name).toEqual([]);

    const state = stateFingerprint();
    saveCheckpoint('po-T6');
    expect(hasCheckpoint('po-T6')).toBe(true);
    await restoreCheckpoint('po-T6');
    await startInstance();
    expect(stateFingerprint()).toEqual(state);
  });

  test('6.8b import na pustej instancji: bez plików, potem z plikami z manifestu (Z10)', async ({
    cast,
  }) => {
    test.setTimeout(5 * 60_000);
    const originals = {
      Kowal: card('Kowal'),
      Iskra: card('Iskra'),
      brama: {
        walls: queryOne<{ n: number }>(
          `SELECT count(*) AS n FROM Wall w JOIN Scene s ON s.id = w.sceneId WHERE s.name = 'Brama'`,
        )!.n,
        tokens: query<{ name: string; characterId: string | null }>(
          `SELECT t.name, t.characterId FROM Token t JOIN Scene s ON s.id = t.sceneId WHERE s.name = 'Brama'`,
        ),
      },
    };
    await cast.closeAll();
    await prepareFresh();
    await startInstance();
    mg = await cast.mg('chromium');
    const fresh = await createCampaign(mg, 'Nocna zmiana — import');
    // Nowa kampania jest aktywna od razu; stół MG wczytuje ją po odświeżeniu.
    await mg.page.reload();
    await expect
      .poll(async () => (await mg.store<{ status: string } | null>('auth'))?.status)
      .toBe('authenticated');
    const page = mg.page;
    await page.getByRole('button', { name: 'Kopie', exact: true }).click();
    const cards = page.locator('.archive-section', { hasText: 'Karta postaci' });
    const notes: Record<string, string> = {};
    for (const name of ['Kowal', 'Iskra']) {
      await cards
        .getByLabel('Plik karty do wczytania')
        .setInputFiles(exported.get(`karta-${name}.json`)!);
      await expect(cards.locator('.archive-ok')).toContainText(`Wczytano „${name}"`);
      notes[name] = (await cards.locator('.archive-ok').textContent()) ?? '';
    }
    const scenes = page
      .locator('.archive-section')
      .filter({ has: page.getByLabel('Plik sceny do wczytania') });
    await scenes
      .getByLabel('Plik sceny do wczytania')
      .setInputFiles(exported.get('scena-Brama.json')!);
    await expect(scenes.locator('.archive-ok')).toContainText('Wczytano');
    notes.Brama = (await scenes.locator('.archive-ok').textContent()) ?? '';
    sceneImportNote = notes.Brama;

    // Karty: to samo, co w oryginale (import normalizuje, więc porównujemy pola gry).
    const pick = (c: Card) => ({
      hpCurrent: c.hpCurrent,
      stats: c.stats,
      skills: c.skills,
      eddies: c.eddies,
      gear: c.gear.map((g) => g.name).sort(),
      weapons: c.weapons.map((g) => g.name).sort(),
      cyberware: c.cyberware.map((g) => g.name).sort(),
      injuries: c.criticalInjuries.map((i) => i.name).sort(),
    });
    for (const name of ['Kowal', 'Iskra'] as const) {
      const row = queryOne<{ campaignId: string; ownerId: string | null; data: string }>(
        'SELECT campaignId, ownerId, data FROM Character WHERE name = ?',
        name,
      )!;
      expect(row.campaignId).toBe(fresh);
      expect(pick(JSON.parse(row.data) as Card), name).toEqual(pick(originals[name]));
    }

    // Scena: ściany i figury są; powiązania figur z kartami i graczami — nie (nowe id).
    const scene = queryOne<{ id: string; backgroundUrl: string; active: number }>(
      `SELECT id, backgroundUrl, active FROM Scene WHERE name = 'Brama'`,
    )!;
    expect(scene.active).toBe(0);
    const tokens = query<{
      name: string;
      characterId: string | null;
      ownerId: string | null;
      imageUrl: string | null;
    }>('SELECT name, characterId, ownerId, imageUrl FROM Token WHERE sceneId = ?', scene.id);
    expect(
      queryOne<{ n: number }>('SELECT count(*) AS n FROM Wall WHERE sceneId = ?', scene.id)!.n,
    ).toBe(originals.brama.walls);
    expect(tokens.map((t) => t.name).sort()).toEqual(
      originals.brama.tokens.map((t) => t.name).sort(),
    );
    const bound = tokens.filter((t) => t.characterId !== null).length;

    // Droga pierwsza: bez plików. Obrazy z pliku wymiany wskazują w próżnię.
    const images = [scene.backgroundUrl, ...tokens.map((t) => t.imageUrl)].filter(
      (url): url is string => typeof url === 'string' && url.startsWith('/'),
    );
    const status = async () =>
      Object.fromEntries(
        await Promise.all(
          images.map(async (url) => [url, (await mg.page.request.get(url)).status()] as const),
        ),
      );
    const withoutFiles = await status();

    // Droga druga: pliki z `manifest.files` przeniesione z kopii `po-T6` (jak przy VPS).
    const manifest = readArchive('scena-Brama.json').manifest;
    const source = join(CHECKPOINT_DIR, 'po-T6', 'uploads');
    let copied = 0;
    for (const url of new Set([
      ...manifest.files,
      ...readArchive('karta-Kowal.json').manifest.files,
      ...readArchive('karta-Iskra.json').manifest.files,
    ])) {
      const relative = url.replace(/^\/(api\/)?uploads\//, '');
      const from = join(source, relative);
      if (!existsSync(from)) continue;
      mkdirSync(join(UPLOADS_DIR, relative, '..'), { recursive: true });
      cpSync(from, join(UPLOADS_DIR, relative));
      copied += 1;
    }
    const withFiles = await status();
    test.info().annotations.push({
      type: 'import na pustej instancji',
      description: JSON.stringify({
        notes,
        figury: tokens.length,
        powiazane: bound,
        oryginalnie: originals.brama.tokens.filter((t) => t.characterId).length,
        pliki: { manifest: manifest.files, copied },
        withoutFiles,
        withFiles,
      }),
    });
    expect(bound, 'karty z pliku dostały nowe id — figury tracą powiązanie (etap 33, Z10)').toBe(0);
    expect(Object.values(withoutFiles).some((code) => code === 404)).toBe(true);
    expect(Object.values(withFiles).every((code) => code === 200)).toBe(true);
  });

  test('#44 zdanie po imporcie sceny odmienia liczbę figur po polsku', async () => {
    test.fail(
      true,
      '#44 — „4 figur straciło” zamiast „4 figury straciły” (dwie formy zamiast trzech)',
    );
    const count = Number(/(\d+) figur/.exec(sceneImportNote)?.[1]);
    expect(count).toBe(4);
    expect(sceneImportNote).toContain('4 figury straciły powiązanie');
  });
});
