import type { Socket } from 'socket.io-client';
import { expect, test, type Actor, type Cast, type Engine } from '../../fixtures/actors.ts';
import { query, queryOne, tableNames } from '../../fixtures/db.ts';
import { apiGm, apiPlayer, cookieHeader, invite } from '../../fixtures/nocna-zmiana.ts';
import {
  recordMeasurement,
  spread,
  startFrameMeter,
  stopFrameMeter,
  storageSizes,
  tableBytes,
} from '../../fixtures/pomiary.ts';
import { DEAD_GATEWAY, rawSocket } from '../../fixtures/security.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { lastMessageId } from '../../fixtures/walka.ts';
import { restoreCheckpoint, startInstance } from '../../instance/instance.ts';

/**
 * T7b, część 2 (`testy.md` 6.3, „długi czat” i „rozmiar bazy”): od punktu `po-T6`
 * (pełny scenariusz „Nocna zmiana”) rozmiar bazy, uploadów i kopii; potem 3000
 * wierszy czatu przez gniazdo (decyzja MG z 02.10: prawdziwe zdarzenia, ~50%
 * mowy, ~35% rzutów, ~10% szeptów, ~5% wtrąceń poza grą) i wejście nowego gracza
 * w obu silnikach — przed i po. Na koniec przewijanie całej historii z licznikiem
 * klatek. Liczby bez progów (decyzja MG z 02.10) — `.e2e/pomiary/t7b-czat-baza.json`.
 */

const FILE = 't7b-czat-baza';
const LINES = 3000;

type ChatStore = {
  synced: boolean;
  hasMoreHistory: boolean;
  items: { message?: { id: number } }[];
};

test.describe.serial('T7b odporność: długi czat i rozmiar bazy @odpornosc', () => {
  let gm: Socket;

  test.beforeAll(async () => {
    test.setTimeout(3 * 60_000);
    await restoreCheckpoint('po-T6');
    await startInstance(DEAD_GATEWAY);
    const { socket } = await rawSocket(await cookieHeader(await apiGm()));
    gm = socket!;
  });

  test.afterAll(async ({ cast }) => {
    gm?.close();
    await cast.closeAll();
  });

  /** Wiersze czatu w bazie: liczba i średnie bajty treści (tekst + ładunek) na rodzaj. */
  function chatByKind() {
    return Object.fromEntries(
      query<{ kind: string; n: number; avg: number }>(
        `SELECT kind, count(*) AS n, avg(length(text) + coalesce(length(payload), 0)) AS avg
           FROM ChatMessage GROUP BY kind ORDER BY n DESC`,
      ).map((row) => [row.kind, { wierszy: row.n, sredniBajtow: Math.round(row.avg) }]),
    );
  }

  function rowCounts() {
    return Object.fromEntries(
      tableNames().map((name) => [
        name,
        queryOne<{ n: number }>(`SELECT count(*) AS n FROM "${name}"`)!.n,
      ]),
    );
  }

  /** „Zrób kopię teraz” z gniazda MG: czas i rozmiar nowej kopii. */
  async function snapshot() {
    const before = storageSizes().backups;
    const t0 = performance.now();
    const ack = await emitAck<{ rules: unknown; snapshots: unknown[] }>(
      gm,
      'archive:snapshot',
      undefined,
      60_000,
    );
    const ms = Math.round(performance.now() - t0);
    expect(ack, JSON.stringify(ack).slice(0, 300)).toMatchObject({ ok: true });
    const after = storageSizes().backups;
    return {
      ms,
      bajtowKopii: after.bytes - before.bytes,
      plikow: after.files - before.files,
      rotacja: ack.ok ? ack.data?.rules : null,
      kopiiWKatalogu: ack.ok ? ack.data?.snapshots.length : null,
    };
  }

  /**
   * Nowy gracz z linku zaproszenia: od `goto` do gotowego stołu — zalogowany,
   * czat zsynchronizowany i narysowany, scena w magazynie, kamera mapy działa.
   */
  async function newPlayer(cast: Cast, name: string, engine: Engine) {
    const token = await invite(await apiGm());
    const actor = await cast.open(name, engine);
    actor.page.setDefaultTimeout(20_000);
    const t0 = Date.now();
    await actor.page.goto(`/join/${encodeURIComponent(token)}`);
    const form = Date.now() - t0;
    await actor.page.locator('#player-name').fill(name);
    const t1 = Date.now();
    await actor.page.getByRole('button', { name: 'Dołącz do gry' }).click();
    const mark = async (check: () => Promise<boolean>) => {
      await expect.poll(check, { timeout: 60_000, intervals: [50] }).toBe(true);
      return Date.now() - t1;
    };
    const signedIn = await mark(
      async () =>
        (await actor.store<{ status: string } | null>('auth'))?.status === 'authenticated',
    );
    const synced = await mark(async () => {
      const chat = await actor.store<ChatStore>('chat');
      return Boolean(chat?.synced && chat.items.length > 0);
    });
    const scene = await mark(async () =>
      Boolean((await actor.store<{ scene: unknown }>('scene'))?.scene),
    );
    const map = await mark(() =>
      actor.page.evaluate(() => window.__vttE2E?.worldToClient({ x: 0, y: 0 }) != null),
    );
    // Czat jako zakładka: nowy gracz bez postaci może stać gdzie indziej.
    const input = actor.page.getByLabel('Wiadomość czatu');
    if (!(await input.isVisible())) {
      await actor.page.getByRole('button', { name: /^Czat/ }).first().click();
    }
    const rows = await mark(async () => (await actor.page.locator('.chat-message').count()) > 0);
    const chat = await actor.store<ChatStore>('chat');
    return {
      actor,
      timing: {
        formularzMs: form,
        zalogowanyMs: signedIn,
        czatZsynchronizowanyMs: synced,
        scenaMs: scene,
        mapaMs: map,
        wierszeNaEkranieMs: rows,
        wierszyWMagazynie: chat.items.length,
        wierszyWDom: await actor.page.locator('.chat-message').count(),
      },
    };
  }

  /**
   * Przewijanie całej historii kółkiem myszy nad czatem: każda strona (50 wierszy)
   * dochodzi po zbliżeniu do góry. Liczy klatki, czas dociągnięcia strony
   * i wielkość DOM-u na końcu.
   */
  async function scrollHistory(actor: Actor) {
    const page = actor.page;
    const feed = page.locator('.chat-feed');
    const box = (await feed.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await startFrameMeter(page, 'scroll');
    const pages: number[] = [];
    const deadline = Date.now() + 4 * 60_000;
    let count = (await actor.store<ChatStore>('chat')).items.length;
    let pageStart = Date.now();
    while (Date.now() < deadline) {
      await page.mouse.wheel(0, -1_200);
      await page.waitForTimeout(80);
      const chat = await actor.store<ChatStore>('chat');
      if (chat.items.length > count) {
        pages.push(Date.now() - pageStart);
        count = chat.items.length;
        pageStart = Date.now();
      }
      if (!chat.hasMoreHistory && (await feed.evaluate((el) => el.scrollTop)) === 0) break;
    }
    const up = await stopFrameMeter(page, 'scroll');
    const chat = await actor.store<ChatStore>('chat');
    // I z powrotem na dół — przewijanie po pełnym DOM-ie.
    await startFrameMeter(page, 'down');
    for (let step = 0; step < 200; step += 1) {
      await page.mouse.wheel(0, 2_400);
      await page.waitForTimeout(40);
      const atBottom = await feed.evaluate(
        (el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 4,
      );
      if (atBottom) break;
    }
    const down = await stopFrameMeter(page, 'down');
    const heap = await page.evaluate(
      () =>
        (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
          ?.usedJSHeapSize ?? null,
    );
    return {
      stronHistorii: pages.length,
      dociagniecieStronyMs: spread(pages),
      doGory: !chat.hasMoreHistory,
      wierszyWMagazynie: chat.items.length,
      wierszyWDom: await page.locator('.chat-message').count(),
      wezlowDom: await page.evaluate(() => document.getElementsByTagName('*').length),
      stertaJsMb: heap === null ? null : Math.round(heap / 1024 / 1024),
      klatkiWGoreMs: up,
      klatkiWDolMs: down,
    };
  }

  test('rozmiar bazy po pełnym scenariuszu (po-T6): pliki, tabele, kopia', async () => {
    const sizes = storageSizes();
    const tables = tableBytes();
    const copy = await snapshot();
    recordMeasurement(FILE, 'po-T6', {
      rozmiar: sizes,
      tabeleBajty: tables,
      wierszy: rowCounts(),
      czat: chatByKind(),
      kopia: copy,
    });
    test.info().annotations.push({
      type: 'po-T6',
      description: `baza ${sizes.dbBytes} B, uploady ${sizes.uploads.bytes} B (${sizes.uploads.files} plików), kopia ${copy.bajtowKopii} B w ${copy.ms} ms`,
    });
    expect(sizes.dbBytes).toBeGreaterThan(0);
  });

  test('wejście nowego gracza przy czacie z po-T6 — Chromium i Firefox (odniesienie)', async ({
    cast,
  }) => {
    test.setTimeout(4 * 60_000);
    const lines = lastMessageId();
    const result: Record<string, unknown> = {};
    for (const [name, engine] of [
      ['Adam', 'chromium'],
      ['Basia', 'firefox'],
    ] as const) {
      const { timing } = await newPlayer(cast, name, engine);
      result[`${name} (${engine})`] = timing;
    }
    recordMeasurement(FILE, 'wejscie-przed', { wierszyCzatu: lines, ...result });
    test
      .info()
      .annotations.push({ type: 'wejście przy po-T6', description: JSON.stringify(result) });
    await cast.closeAll();
  });

  test(`${LINES} wierszy czatu przez gniazdo: MG, Marek i Ola naraz`, async () => {
    test.setTimeout(10 * 60_000);
    const token = await invite(await apiGm());
    const sockets: Record<string, Socket> = { MG: gm };
    for (const name of ['Marek', 'Ola'] as const) {
      const { socket } = await rawSocket(await cookieHeader(await apiPlayer(name, token)));
      sockets[name] = socket!;
    }
    const whisperTo: Record<string, string> = { MG: 'Marek', Marek: 'MG', Ola: 'MG' };
    const says = [
      'Słyszałem, że Paser ma nowy towar z Watson.',
      'Zażółć gęślą jaźń — długi czat sprawdza polskie znaki.',
      'Kto stoi na czatach przy bramie?',
      'Mam jeszcze dwa magazynki i granat dymny.',
      'Strażnik zmienia wartę co dwie godziny.',
    ];
    /** Wiersz `i` — rodzaj z rozkładu na dwudziestkę: 10 mowy, 7 rzutów, 2 szepty, 1 wtrącenie. */
    const line = (author: string, i: number) => {
      const slot = i % 20;
      if (slot < 10) return `${says[i % says.length]} (#${i})`;
      if (slot < 17) return `/r ${1 + (i % 3)}d${i % 2 ? 10 : 6}+${i % 5}`;
      if (slot < 19) return `/w ${whisperTo[author]} Na stronie: plan B, wiersz ${i}.`;
      return `(OOC) przerwa na herbatę ☕, wracam za 5 min — #${i}`;
    };
    const before = lastMessageId();
    const acks: number[] = [];
    const refused: string[] = [];
    const t0 = Date.now();
    const authors = Object.keys(sockets);
    await Promise.all(
      authors.map(async (author, a) => {
        for (let i = a; i < LINES; i += authors.length) {
          const s = performance.now();
          const ack = await emitAck(sockets[author]!, 'chat:send', { text: line(author, i) });
          acks.push(performance.now() - s);
          if (!ack.ok) refused.push(`${author} #${i}: ${ack.error}`);
        }
      }),
    );
    const totalMs = Date.now() - t0;
    for (const name of ['Marek', 'Ola']) sockets[name]!.close();
    const added = queryOne<{ n: number }>(
      'SELECT count(*) AS n FROM ChatMessage WHERE id > ?',
      before,
    )!.n;
    recordMeasurement(FILE, 'generowanie', {
      wierszy: LINES,
      dodanychWBazie: added,
      czasMs: totalMs,
      wierszyNaSekunde: Math.round((LINES / totalMs) * 1000),
      ackMs: spread(acks),
      odmowy: refused.slice(0, 20),
    });
    expect(refused, 'odmowy serwera').toEqual([]);
    expect(added).toBe(LINES);
  });

  test(`rozmiar bazy po ${LINES} wierszach: przyrost na wiersz, kopia, rzut na sezon`, async () => {
    const sizes = storageSizes();
    const tables = tableBytes();
    const copy = await snapshot();
    const chat = chatByKind();
    const lines = queryOne<{ n: number }>('SELECT count(*) AS n FROM ChatMessage')!.n;
    const chatBytes = tables.ChatMessage ?? 0;
    const perLine = Math.round(chatBytes / lines);
    // Sezon: 20 sesji po ~1000 wierszy (rzut do budżetu kopii etapu 28).
    const season = 20 * 1000 * perLine;
    recordMeasurement(FILE, 'po-3000', {
      rozmiar: sizes,
      tabeleBajty: tables,
      wierszy: rowCounts(),
      czat: chat,
      bajtowNaWierszCzatu: perLine,
      kopia: copy,
      sezon20x1000: {
        czatBajtow: season,
        bazaBajtow: sizes.dbBytes - chatBytes + season,
        uwaga:
          'baza bez czatu z po-T6 + czat sezonu; uploady liczą się osobno (twarde dowiązania w kopiach)',
      },
    });
    test.info().annotations.push({
      type: `po ${lines} wierszach`,
      description: `baza ${sizes.dbBytes} B, czat ${chatBytes} B (${perLine} B/wiersz), kopia ${copy.bajtowKopii} B w ${copy.ms} ms, sezon ~${Math.round(season / 1024 / 1024)} MB czatu`,
    });
  });

  test(`wejście nowego gracza przy ${LINES}+ wierszach i przewijanie całej historii — Chromium i Firefox`, async ({
    cast,
  }) => {
    test.setTimeout(15 * 60_000);
    const lines = lastMessageId();
    const result: Record<string, unknown> = {};
    for (const [name, engine] of [
      ['Celina', 'chromium'],
      ['Darek', 'firefox'],
    ] as const) {
      const { actor, timing } = await newPlayer(cast, name, engine);
      const scroll = await scrollHistory(actor);
      result[`${name} (${engine})`] = { ...timing, przewijanie: scroll };
      expect.soft(scroll.doGory, `${name}: historia do pierwszego wiersza`).toBe(true);
      expect.soft(actor.unexpectedErrors(), `konsola ${name}`).toEqual([]);
    }
    recordMeasurement(FILE, 'wejscie-po', { wierszyCzatu: lines, ...result });
    test.info().annotations.push({
      type: `wejście i przewijanie przy ${lines} wierszach`,
      description: JSON.stringify(result).slice(0, 3_000),
    });
  });
});
