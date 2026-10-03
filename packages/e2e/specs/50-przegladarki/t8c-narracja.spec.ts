import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { LLM_TIMEOUT_MS, requireGateway } from '../../fixtures/llm.ts';
import { chatLine, query, queryOne, seat, startFromPoT6 } from '../../fixtures/regresja.ts';
import { Canaries } from '../../fixtures/sniffer.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { say } from '../../fixtures/table.ts';
import { pendingDice, scriptDice } from '../../instance/instance.ts';

/**
 * T8c, narracja i AI (`testy.md` 6.4): tabele losowe (formularz MG, losowanie
 * ukryte i jawne, „Pokaż stołowi”, `/tab`), asystent zasad MG na podręczniku
 * i baza wiedzy kampanii z uprawnieniem bota. Dwa ostatnie wołają prawdziwy
 * gateway (`@llm`) — bez niego się pomijają, tabele idą zawsze.
 */

const TABLE = 'Co leci w radiu';

test.describe.serial('T8c narracja: tabele losowe, asystent zasad, baza wiedzy', () => {
  let mg: Actor;
  let marek: Actor;
  const fromMarek = new Canaries();

  test.beforeAll(async () => {
    // Prawdziwy gateway MG (`E2E_AI_GATEWAY_URL` albo :8100) — jak w scenariuszu.
    await startFromPoT6();
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('start z po-T6: MG i Marek przy „Knajpie”', async ({ cast }) => {
    const table = await seat(cast, ['Marek']);
    mg = table.mg;
    marek = table.players[0]!;
  });

  test('tabele losowe: MG zakłada tabelę, losuje w ukryciu i pokazuje, losuje jawnie i z /tab; gracz nie losuje', async () => {
    test.setTimeout(3 * 60_000);
    const page = mg.page;
    const secret = fromMarek.secret('tabela');
    await page.getByRole('button', { name: 'Tabele', exact: true }).click();
    await page.getByRole('button', { name: '+ Nowa tabela' }).click();
    const form = page.locator('form.table-form');
    await form.locator('label', { hasText: 'Nazwa' }).locator('input').fill(TABLE);
    await form.locator('label', { hasText: 'Formuła' }).locator('input').fill('1d10');
    await form
      .locator('label', { hasText: 'Domyślna widoczność' })
      .locator('select')
      .selectOption('gm');
    const rows = form.locator('.table-row');
    while ((await rows.count()) < 2) await form.getByRole('button', { name: '+ Wiersz' }).click();
    const fill = async (index: number, min: number, max: number, text: string) => {
      const row = rows.nth(index);
      await row.getByLabel('Od', { exact: true }).fill(String(min));
      await row.getByLabel('Do', { exact: true }).fill(String(max));
      await row.locator('textarea').fill(text);
    };
    await fill(0, 1, 5, 'Stary kawałek Samuraia, ktoś podkręca głośność.');
    await fill(1, 6, 10, `Reklama Kiroshi przerywa muzykę. ${secret}`);
    await expect(form.locator('.table-issues')).toHaveCount(0);
    // #72: pole treści z fokusem ma 7rem i kurczy się przy kliknięciu obok — Tab
    // zdejmuje fokus wcześniej, żeby „Dodaj tabelę” nie uciekło spod kursora.
    await rows.nth(1).locator('textarea').press('Tab');
    await form.getByRole('button', { name: 'Dodaj tabelę' }).click();
    await expect(form).toBeHidden();
    await expect
      .poll(() => queryOne<{ n: number }>('SELECT count(*) AS n FROM RandomTable')?.n)
      .toBe(1);
    const entry = page.locator('.knowledge-list li', { hasText: TABLE });

    // Ukryte losowanie (domyślna widoczność „Tylko MG”) — Marek nic nie dostaje.
    const mark = await marek.sniffer.mark();
    scriptDice([8]);
    await entry.getByRole('button', { name: '🎲 Losuj' }).click();
    await page.getByRole('button', { name: 'Czat', exact: true }).click();
    const hidden = page.locator('[data-testid="rolltable"].chat-table--secret', {
      hasText: 'Reklama Kiroshi',
    });
    await expect(hidden).toBeVisible({ timeout: 20_000 });
    await expect(hidden).toContainText('tylko MG');
    expect(pendingDice()).toBe('');
    await mg.page.waitForTimeout(1_000);
    expect(await marek.sniffer.found(fromMarek.secretNow, mark)).toEqual([]);
    await expect(marek.page.locator('[data-testid="rolltable"]')).toHaveCount(0);

    // „Pokaż stołowi” — od tej chwili wynik jest jawny.
    fromMarek.reveal(secret);
    await hidden.getByRole('button', { name: 'Pokaż stołowi' }).click();
    await expect(hidden).toContainText('Pokazane stołowi');
    await expect(
      marek.page.locator('[data-testid="rolltable"]', { hasText: 'Reklama Kiroshi' }),
    ).toBeVisible({ timeout: 20_000 });

    // Jawne losowanie przyciskiem 🔊 i `/tab` na czacie (domyślna widoczność — u MG).
    await page.getByRole('button', { name: 'Tabele', exact: true }).click();
    scriptDice([2]);
    await entry.getByRole('button', { name: '🔊' }).click();
    await expect(
      marek.page.locator('[data-testid="rolltable"]', { hasText: 'Stary kawałek Samuraia' }),
    ).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Czat', exact: true }).click();
    const before = await page.locator('[data-testid="rolltable"]').count();
    scriptDice([3]);
    await say(mg, `/tab ${TABLE}`);
    await expect(page.locator('[data-testid="rolltable"]')).toHaveCount(before + 1, {
      timeout: 20_000,
    });
    expect(pendingDice()).toBe('');

    // Odmowa: gracz nie losuje z tabel MG — ani gniazdem, ani `/tab`.
    const tableId = queryOne<{ id: string }>('SELECT id FROM RandomTable')!.id;
    const refused = await emitAck(await marek.socket(), 'table:roll', {
      id: tableId,
      visibility: 'public',
    });
    expect(refused).toEqual({ ok: false, error: 'FORBIDDEN' });
    const rolled = queryOne<{ n: number }>(
      `SELECT count(*) AS n FROM ChatMessage WHERE kind IN ('rolltable', 'gmrolltable')`,
    )!.n;
    await say(marek, `/tab ${TABLE}`);
    // Odmowa dochodzi notką (jej treść — #73, test niżej), losowania nie ma.
    await expect(marek.page.locator('.chat-note').last()).toContainText('MG');
    expect(
      queryOne<{ n: number }>(
        `SELECT count(*) AS n FROM ChatMessage WHERE kind IN ('rolltable', 'gmrolltable')`,
      )!.n,
    ).toBe(rolled);
  });

  test('#73 gracz po /tab dostaje zdanie o tabelach, nie o mówieniu za NPC-a', async () => {
    test.fail(true, '#73: odmowa /tab mapuje się na zdanie „Tylko MG może mówić w imieniu NPC-a.”');
    await say(marek, `/tab ${TABLE}`);
    await expect(chatLine(marek.page, 'Tabele losowe są narzędziem MG.')).toBeVisible({
      timeout: 3_000,
    });
  });

  test('#72 „Dodaj tabelę” zaraz po wpisaniu treści wiersza zapisuje tabelę za pierwszym klikiem', async () => {
    test.fail(true, '#72: kurczące się pole treści przesuwa przycisk spod kursora');
    const page = mg.page;
    await page.getByRole('button', { name: 'Tabele', exact: true }).click();
    await page.getByRole('button', { name: '+ Nowa tabela' }).click();
    const form = page.locator('form.table-form');
    try {
      await form.locator('label', { hasText: 'Nazwa' }).locator('input').fill('Szum ulicy');
      await form.getByRole('button', { name: 'Rozpisz zakres' }).click();
      const rows = form.locator('.table-row');
      for (let i = 0; i < 10; i += 1)
        await rows
          .nth(i)
          .locator('textarea')
          .fill(`Odgłos ${i + 1}`);
      await form.getByRole('button', { name: 'Dodaj tabelę' }).click();
      await expect(form).toBeHidden({ timeout: 3_000 });
    } finally {
      if (await form.isVisible()) await form.getByRole('button', { name: 'Anuluj' }).click();
    }
  });

  test('@llm asystent zasad: pytanie MG dostaje odpowiedź z cytatami, nie idzie na czat; gracz nie pyta', async () => {
    await requireGateway();
    const page = mg.page;
    const chatBefore = queryOne<{ n: number }>('SELECT count(*) AS n FROM ChatMessage')!.n;
    await page.getByRole('button', { name: 'Zasady', exact: true }).click();
    const question = page.getByLabel('Pytanie o zasady');
    await expect(question).toBeEnabled({ timeout: 30_000 });
    await question.fill('Ile Punktów Wytrzymałości traci pancerz, kiedy obrażenia go przebiją?');
    await page.locator('label', { hasText: 'Pokaż rozumowanie' }).locator('input').uncheck();
    const started = Date.now();
    await page.getByRole('button', { name: 'Zapytaj' }).click();
    const exchange = page.locator('.ai-exchange').first();
    await expect(exchange.locator('.ai-exchange-usage')).toBeVisible({ timeout: LLM_TIMEOUT_MS });
    const answer = (await exchange.locator('.ai-exchange-answer').textContent()) ?? '';
    const citations = await exchange.locator('.rules-passage-citation').allTextContents();
    test
      .info()
      .annotations.push(
        { type: 'odpowiedź asystenta', description: answer },
        { type: 'cytaty', description: citations.join(' | ') },
        { type: 'czas', description: `${Math.round((Date.now() - started) / 1000)} s` },
      );
    expect(citations.length).toBeGreaterThan(0);
    expect(answer.length).toBeGreaterThan(20);
    expect(answer).toMatch(/[ąćęłńóśźż]/i);
    await expect(exchange.locator('.ai-status-error')).toHaveCount(0);
    expect(queryOne<{ n: number }>('SELECT count(*) AS n FROM ChatMessage')!.n).toBe(chatBefore);

    const refused = await emitAck(await marek.socket(), 'rules:ask', {
      question: 'Jak działa Unik?',
      reasoning: false,
    });
    expect(refused).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  test('@llm baza wiedzy: wpis „dla botów” trafia do promptu Pasera, wpis „tylko MG” nigdy; gracz nie czyta bazy', async () => {
    await requireGateway();
    const page = mg.page;
    const gmOnly = fromMarek.secret('wiedza-MG');
    await page.getByRole('button', { name: 'Wiedza', exact: true }).click();
    const addEntry = async (title: string, visibility: 'bots' | 'gm', body: string) => {
      await page.getByRole('button', { name: '+ Nowy wpis' }).click();
      const form = page.locator('form.knowledge-form');
      await form.locator('label', { hasText: 'Tytuł' }).locator('input').fill(title);
      await form
        .locator('label', { hasText: 'Widoczność' })
        .locator('select')
        .selectOption(visibility);
      await form.locator('label', { hasText: 'Tagi' }).locator('input').fill('lombard');
      await form.locator('label', { hasText: 'Treść' }).locator('textarea').fill(body);
      await form.getByRole('button', { name: 'Dodaj wpis' }).click();
      await expect(form).toBeHidden({ timeout: 60_000 });
      await expect
        .poll(() =>
          queryOne<{ visibility: string }>(
            'SELECT visibility FROM KnowledgeEntry WHERE title = ?',
            title,
          ),
        )
        .toEqual({ visibility });
    };
    await addEntry(
      'Sejf Pasera',
      'bots',
      'Paser trzyma kody do sejfu w zeszycie pod ladą. Hasło do sejfu brzmi „Czerwony Lotos”.',
    );
    await addEntry(
      'Paser i Arasaka',
      'gm',
      `Paser donosi Arasace o każdym, kto kupuje u niego broń. ${gmOnly}`,
    );

    // Paser dostaje źródło „Baza wiedzy kampanii”; podgląd promptu pokazuje, co doklei.
    await page.getByRole('button', { name: 'Boty', exact: true }).click();
    await page.locator('.bot-row', { hasText: 'Paser' }).locator('button.bot-open').click();
    const editor = page.getByLabel('Edytor bota: Paser');
    await expect(editor).toBeVisible();
    await editor.getByRole('button', { name: 'Wiedza i model' }).click();
    await editor.locator('label', { hasText: 'Baza wiedzy kampanii' }).locator('input').check();
    await expect
      .poll(
        () =>
          queryOne<{ data: string }>(`SELECT data FROM BotProfile WHERE name = 'Paser'`)?.data ??
          '',
      )
      .toContain('"sources":["campaign"]');
    await editor.getByRole('button', { name: 'Prompt', exact: true }).click();
    await editor
      .locator('form.bot-teach input')
      .fill('Gdzie trzymasz kody do sejfu i komu donosisz?');
    await editor.getByRole('button', { name: 'Sprawdź prompt' }).click();
    const preview = editor.locator('.bot-knowledge-preview');
    await expect(preview).toContainText('Sejf Pasera', { timeout: 60_000 });
    await expect(editor.locator('pre.bot-prompt')).toContainText('Czerwony Lotos');
    await expect(editor.locator('pre.bot-prompt')).not.toContainText(gmOnly);
    await expect(preview).not.toContainText('Paser i Arasaka');
    await editor.getByRole('button', { name: 'Zamknij edytor' }).click();

    // Odmowa: gracz nie czyta bazy wiedzy.
    const refused = await emitAck(await marek.socket(), 'knowledge:list', {});
    expect(refused).toEqual({ ok: false, error: 'FORBIDDEN' });

    // Rozmowa — tylko obserwacja (czy bot sięga po wpis); kanarek „tylko MG” nie wyjdzie.
    const botId = queryOne<{ id: string }>(`SELECT id FROM BotProfile WHERE name = 'Paser'`)!.id;
    const last = queryOne<{ id: number }>('SELECT max(id) AS id FROM ChatMessage')!.id;
    await marek.page.getByRole('button', { name: 'Czat', exact: true }).click();
    await say(marek, 'Paser, gdzie trzymasz kody do sejfu? Pytam dla kolegi.');
    const reply = () =>
      queryOne<{ text: string }>(
        'SELECT text FROM ChatMessage WHERE botId = ? AND id > ? ORDER BY id DESC',
        botId,
        last,
      )?.text ?? '';
    await expect.poll(reply, { timeout: LLM_TIMEOUT_MS, intervals: [2_000] }).not.toBe('');
    test
      .info()
      .annotations.push(
        { type: 'odpowiedź Pasera', description: reply() },
        { type: 'czy sięga po wpis', description: String(/zeszyt|lad|lotos/i.test(reply())) },
      );
    expect(reply()).not.toContain('KANAREK');
    await marek.page.waitForTimeout(1_000);
    expect(await marek.sniffer.found(fromMarek.secretNow)).toEqual([]);
    expect(query('SELECT id FROM KnowledgeEntry').length).toBe(2);
    for (const actor of [mg, marek]) {
      expect(actor.unexpectedErrors(), actor.name).toEqual([]);
    }
  });
});
