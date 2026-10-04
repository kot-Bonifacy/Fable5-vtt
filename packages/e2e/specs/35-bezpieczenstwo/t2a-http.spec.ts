import { existsSync, readdirSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';
import { request, type APIRequestContext } from '@playwright/test';
import { expect, test } from '../../fixtures/actors.ts';
import { query, queryOne } from '../../fixtures/db.ts';
import {
  apiGm,
  apiPlayer,
  campaignId,
  cookieHeader,
  invite,
  startFromPoT3,
} from '../../fixtures/nocna-zmiana.ts';
import {
  DEAD_GATEWAY,
  png,
  rawSocket,
  ServerLog,
  serverAlive,
  signCookieValue,
} from '../../fixtures/security.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { startServer, stopServer } from '../../instance/instance.ts';
import { E2E_DIR, GM_LOGIN, SERVER_PORT, SERVER_URL, UPLOADS_DIR } from '../../instance/paths.ts';

/**
 * T2, trasy HTTP (`testy.md` 6.2, punkty 5–8, 10, 11): uploady, import muzyki,
 * zaproszenia, ciasteczko i sesja, nagłówki, hasło MG z internetu. Start z kopii
 * `po-T3` — plik może zmieniać stan (zaproszenia, druga kampania, restart serwera).
 *
 * Rzeczy, które plan każe zapisać jako zadanie, a nie błąd, lądują w adnotacji
 * testu `zadanie` (raport HTML) i w `testy-rejestr.md`.
 */

const IMAGE_ROUTES = [
  '/api/uploads/maps',
  '/api/uploads/tokens',
  '/api/uploads/handouts',
  '/api/uploads/portrait-assets',
] as const;

const file = (name: string, buffer: Buffer, mimeType = 'image/png') => ({
  multipart: { file: { name, mimeType, buffer } },
});

/** GET bez normalizacji ścieżki (`fetch` i Playwright zwijają `..` przed wysyłką). */
function rawGet(path: string, cookie?: string): Promise<{ status: number; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port: SERVER_PORT,
        path,
        method: 'GET',
        ...(cookie ? { headers: { cookie } } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function note(kind: 'zadanie' | 'obserwacja', description: string): void {
  test.info().annotations.push({ type: kind, description });
}

test.describe.serial('T2 HTTP: uploady, zaproszenia, sesja, nagłówki, hasło MG', () => {
  let gm: APIRequestContext;
  let marek: APIRequestContext;
  let anon: APIRequestContext;
  /** Gracz z zaproszenia do innej kampanii niż aktywna. */
  let obcy: APIRequestContext;
  /** Czy gniazdo otwarte przed wygaśnięciem sesji przyjęło potem wiadomość. */
  let liveAfterExpiry: boolean | undefined;
  /** Statusy odpowiedzi serii złych haseł MG. */
  let loginStatuses: number[] = [];
  let campaign: string;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    await startFromPoT3();
    campaign = campaignId();
    gm = await apiGm();
    marek = await apiPlayer('Marek', await invite(gm, 'Marek'));
    anon = await request.newContext({ baseURL: SERVER_URL });
  });

  test.afterAll(async () => {
    for (const api of [gm, marek, anon]) await api?.dispose();
  });

  test('6.2.5 uploady: bez logowania 401, gracz 403 na każdej trasie', async () => {
    const routes = [...IMAGE_ROUTES, `/api/music/${campaign}/upload`];
    for (const route of routes) {
      const image = file('mapa.png', png(64, 64));
      expect((await anon.post(route, image)).status(), `${route} anon`).toBe(401);
      expect((await marek.post(route, image)).status(), `${route} Marek`).toBe(403);
    }
  });

  test('6.2.5 uploady MG: nie-obraz z .png, SVG ze skryptem, plik audio z tekstu → 400', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script></svg>',
    );
    for (const route of IMAGE_ROUTES) {
      for (const [name, body, type] of [
        ['tekst.png', Buffer.from('to nie jest obraz, tylko tekst udający PNG'), 'image/png'],
        ['skrypt.svg', svg, 'image/svg+xml'],
        ['skrypt.png', svg, 'image/png'],
        ['pusty.png', Buffer.alloc(0), 'image/png'],
      ] as const) {
        const response = await gm.post(route, file(name, body, type));
        expect(response.status(), `${route} ${name}`).toBe(400);
      }
    }
    const music = await gm.post(
      `/api/music/${campaign}/upload`,
      file('muzyka.mp3', Buffer.from('<html>nie mp3</html>'), 'audio/mpeg'),
    );
    expect(music.status()).toBe(400);
  });

  test('6.2.5 uploady MG: za duży plik 413, za duże wymiary 400', async () => {
    test.setTimeout(120_000);
    // Limit tokenu 8 MB (mapy 40 MB — ta sama ścieżka `toBuffer()`).
    const tooBig = Buffer.concat([png(64, 64), Buffer.alloc(8 * 1024 * 1024 + 1)]);
    expect((await gm.post('/api/uploads/tokens', file('duzy.png', tooBig))).status()).toBe(413);
    const huge = Buffer.concat([png(64, 64), Buffer.alloc(40 * 1024 * 1024 + 1)]);
    expect((await gm.post('/api/uploads/maps', file('duza.png', huge))).status()).toBe(413);
    // Sam nagłówek PNG 20000 × 20000 — `imageSize` czyta wymiary bez dekodowania.
    const bomb = png(20_000, 20_000, false);
    for (const route of IMAGE_ROUTES) {
      const response = await gm.post(route, file('bomba.png', bomb));
      expect(response.status(), route).toBe(400);
    }
    expect(await serverAlive()).toBe(true);
  });

  test('6.2.5 uploady MG: nazwa z „../” nie wychodzi poza katalog', async () => {
    const before = new Set(readdirSync(E2E_DIR));
    for (const route of IMAGE_ROUTES) {
      const response = await gm.post(route, file('../../../zly.png', png(600, 600)));
      expect(response.status(), `${route} ${await response.text()}`).toBe(201);
      const body = (await response.json()) as { url: string; name?: string };
      // Etap 44b: plik ląduje w katalogu kampanii, nazwa dalej losowa.
      expect(body.url).toMatch(/^\/uploads\/campaigns\/[\w-]+\/[a-z]+\/[\w-]{16}\.(png|webp)$/);
      if (body.name !== undefined) expect(body.name).not.toMatch(/[/\\]|\.\./);
    }
    expect(readdirSync(E2E_DIR).filter((entry) => !before.has(entry))).toEqual([]);
    for (const dir of [E2E_DIR, join(E2E_DIR, '..'), UPLOADS_DIR]) {
      expect(existsSync(join(dir, 'zly.png')), dir).toBe(false);
    }
  });

  test('6.2.5 /uploads/: bez listy katalogu, bez wyjścia poza katalog', async () => {
    // Od 01.10 (#10 / Z7) `/uploads/` wymaga zalogowania — wyjście poza katalog
    // sprawdzamy więc i bez ciasteczka, i z ciasteczkiem MG, który przez bramkę
    // logowania przechodzi.
    const gmCookie = await cookieHeader(gm);
    for (const path of ['/uploads/', '/uploads/maps/', '/uploads/portraits/', '/public/']) {
      for (const cookie of [undefined, gmCookie]) {
        const response = await rawGet(path, cookie);
        expect(response.status, path).toBeGreaterThanOrEqual(400);
      }
    }
    for (const cookie of [undefined, gmCookie])
      for (const path of [
        '/uploads/../packages/server/e2e.db',
        '/uploads/..%2f..%2fpackages%2fserver%2fe2e.db',
        '/uploads/%2e%2e/%2e%2e/packages/server/e2e.db',
        '/uploads/..\\..\\packages\\server\\e2e.db',
        '/public/../private/cpred/skills.json',
        '/public/..%2fprivate%2fcpred%2fskills.json',
      ]) {
        const response = await rawGet(path, cookie);
        expect(response.status, path).toBeGreaterThanOrEqual(400);
        expect(response.body.subarray(0, 15).toString('latin1'), path).not.toBe('SQLite format 3');
      }
    // Pliki kampanii tylko dla zalogowanych (#10 / Z7, 01.10), a od etapu 44b —
    // tylko dla MG i graczy kampanii pliku (gracz spoza niej: test 6.2.7 niżej).
    const map = queryOne<{ backgroundUrl: string }>(
      `SELECT backgroundUrl FROM Scene WHERE backgroundUrl LIKE '/uploads/%' LIMIT 1`,
    );
    if (map) {
      expect((await anon.get(map.backgroundUrl)).status(), 'bez logowania').toBe(401);
      expect((await gm.get(map.backgroundUrl)).status(), 'MG').toBe(200);
      expect((await marek.get(map.backgroundUrl)).status(), 'gracz').toBe(200);
    }
  });

  test('6.2.6 import muzyki z adresu: tylko MG, adresy wewnętrzne odrzucone', async () => {
    const path = `/api/music/${campaign}/youtube`;
    expect((await anon.get(path)).status()).toBe(401);
    expect((await marek.get(path)).status()).toBe(403);
    expect(
      (await marek.post(path, { data: { url: 'https://youtu.be/dQw4w9WgXcQ' } })).status(),
    ).toBe(403);
    for (const url of [
      'http://127.0.0.1:8100/health',
      'http://localhost:3101/api/auth/me',
      'http://100.64.0.1/',
      'http://[::1]:8100/',
      'file:///C:/Windows/win.ini',
      'https://www.youtube.com.zly.example/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com@127.0.0.1:8100/watch?v=dQw4w9WgXcQ',
      'https://youtube.com:8100/watch?v=dQw4w9WgXcQ',
      'javascript:alert(1)',
    ]) {
      const response = await gm.post(path, { data: { url } });
      expect(response.status(), url).toBe(400);
    }
    expect(((await (await gm.get(path)).json()) as { phase: string }).phase).toBe('idle');
  });

  test('6.2.7 zaproszenia: unieważnione i wygasłe nie wpuszczają', async () => {
    const revoked = await gm.post(`/api/campaigns/${campaign}/invitations`, {
      data: { name: 'Intruz' },
    });
    const { id, token } = (await revoked.json()) as { id: string; token: string };
    expect((await gm.post(`/api/invitations/${id}/revoke`)).status()).toBe(200);
    expect((await anon.get(`/api/join/${token}`)).status()).toBe(404);
    expect((await anon.post(`/api/join/${token}`, { data: { name: 'Intruz' } })).status()).toBe(
      404,
    );

    const expiring = await gm.post(`/api/campaigns/${campaign}/invitations`, {
      data: { name: 'Spóźniony', expiresInHours: 1 / 3600 },
    });
    const expired = ((await expiring.json()) as { token: string }).token;
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    // Etap 44b: wygasły link mówi, że wygasł (410) — token był prawdziwy.
    expect((await anon.get(`/api/join/${expired}`)).status()).toBe(410);
    expect((await anon.post(`/api/join/${expired}`)).status()).toBe(410);
    expect(query(`SELECT id FROM User WHERE name IN ('Intruz', 'Spóźniony')`)).toEqual([]);
    // Nieważne i zmyślone tokeny.
    for (const bogus of ['x', 'a'.repeat(32), '../../api/auth/me', '%00']) {
      expect((await anon.get(`/api/join/${encodeURIComponent(bogus)}`)).status(), bogus).toBe(404);
    }
  });

  test('6.2.7 zaproszenia: imię MG nie przejmuje konta MG, link działa raz', async () => {
    // Etap 44b: imię wypisuje MG na linku — „MG” w żadnej pisowni nie przejdzie.
    for (const name of ['MG', 'mg', ' Mg ']) {
      const response = await gm.post(`/api/campaigns/${campaign}/invitations`, {
        data: { name },
      });
      expect(response.status(), name).toBe(409);
      expect(((await response.json()) as { error: string }).error).toBe('NAME_TAKEN');
    }
    // Imię z formularza nic nie znaczy: wchodzi się jako imię z linku, i tylko raz.
    const token = await invite(gm, 'Gapa');
    const first = await anon.post(`/api/join/${token}`, { data: { name: 'MG' } });
    expect(first.status()).toBe(200);
    expect(((await first.json()) as { user: { name: string; role: string } }).user).toMatchObject({
      name: 'Gapa',
      role: 'PLAYER',
    });
    const second = await anon.post(`/api/join/${token}`);
    expect(second.status()).toBe(410);
  });

  test('6.2.7 zaproszenie innej kampanii nie daje wstępu do aktywnej', async () => {
    const other = await gm.post('/api/campaigns', { data: { name: 'Obca kampania' } });
    expect(other.status()).toBe(201);
    const otherId = ((await other.json()) as { id: string }).id;
    const otherToken = await invite(gm, 'Obcy', otherId);
    // Etap 44c: nowa kampania nie zabiera MG stołu — sesja „Nocnej zmiany”
    // trwa, a „Obca kampania” czeka na liście bez sesji.

    obcy = await apiPlayer('Obcy', otherToken);
    const me = (await (await obcy.get('/api/auth/me')).json()) as {
      activeCampaign: { name: string } | null;
    };
    const { socket, sync } = await rawSocket(await cookieHeader(obcy));
    const frames: string[] = [JSON.stringify(sync)];
    socket!.onAny((event: string, ...args: unknown[]) => frames.push(event + JSON.stringify(args)));
    expect(
      await emitAck(socket!, 'chat:send', { text: 'Dzień dobry, jestem obcy.' }),
    ).toMatchObject({ ok: false });
    const history = await emitAck(socket!, 'chat:history', { beforeId: 1_000_000 });
    expect(history.ok ? JSON.stringify(history.data) : '').not.toContain('KANAREK');
    socket!.disconnect();
    const seen = frames.join('\n');
    for (const secret of ['Kowal', 'Knajpa', 'KANAREK']) expect(seen, secret).not.toContain(secret);
    expect(query(`SELECT id FROM ChatMessage WHERE text = 'Dzień dobry, jestem obcy.'`)).toEqual(
      [],
    );

    // Od 44c gracz dostaje swoją kampanię (tu: „Obca kampania” między sesjami),
    // nigdy cudzą.
    if (me.activeCampaign && me.activeCampaign.name !== 'Obca kampania') {
      note(
        'obserwacja',
        `/api/auth/me gracza spoza kampanii podaje nazwę cudzej kampanii („${me.activeCampaign.name}”).`,
      );
    }
  });

  test('6.2.7 gracz spoza kampanii nie dostaje jej puli portretów ani plików (#10, 44b)', async () => {
    const portraits = (await (await obcy.get('/api/portrait-assets')).json()) as unknown[];
    expect(portraits, 'pula portretów aktywnej kampanii u gracza spoza niej').toEqual([]);
    // Z7 (etap 44b): plik kampanii tylko dla jej MG i graczy — obcy dostaje 404
    // jak na nieistniejący adres, choć jest zalogowany.
    const map = queryOne<{ backgroundUrl: string }>(
      `SELECT backgroundUrl FROM Scene WHERE campaignId = ? AND backgroundUrl LIKE '/uploads/%' LIMIT 1`,
      campaign,
    );
    expect(map?.backgroundUrl).toMatch(/^\/uploads\/campaigns\//);
    expect((await obcy.get(map!.backgroundUrl)).status(), 'gracz spoza kampanii').toBe(404);
    expect((await marek.get(map!.backgroundUrl)).status(), 'gracz kampanii').toBe(200);
    await obcy.dispose();
  });

  test('6.2.8 ciasteczko sesji: httpOnly, SameSite, ważność SESSION_TTL_DAYS (rok)', async () => {
    const password = process.env.E2E_GM_PASSWORD!;
    const response = await anon.post('/api/auth/login', { data: { login: GM_LOGIN, password } });
    expect(response.status()).toBe(200);
    const header = response.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie');
    const cookie = header?.value ?? '';
    expect(cookie).toMatch(/^vtt_sid=[^;]+\.[^;]+;/); // podpisane
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*SameSite=Lax/i);
    expect(cookie).toMatch(/;\s*Path=\//i);
    const expires = new Date(/Expires=([^;]+)/i.exec(cookie)?.[1] ?? 0).getTime();
    const days = (expires - Date.now()) / 86_400_000;
    // Rok od 01.10 (decyzja MG przy poprawce #11) — wcześniej 30 dób.
    expect(days).toBeGreaterThan(364);
    expect(days).toBeLessThanOrEqual(365);
    if (!/;\s*Secure/i.test(cookie)) {
      note(
        'zadanie',
        'Ciasteczko vtt_sid bez flagi Secure — etap 28: za Caddy (HTTPS) ustawić Secure ' +
          "(np. `secure: 'auto'` albo z env), inaczej jedzie też po HTTP.",
      );
    }
    await anon.post('/api/auth/logout');
  });

  test('6.2.8 podrobione ciasteczko: bez podpisu, zły podpis, domyślny sekret → odmowa', async () => {
    const marekSession = queryOne<{ id: string }>(
      `SELECT s.id FROM Session s JOIN User u ON u.id = s.userId
         WHERE u.name = 'Marek' ORDER BY s.createdAt DESC LIMIT 1`,
    )!.id;
    const forged = [
      `vtt_sid=${marekSession}`,
      `vtt_sid=${marekSession}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`,
      `vtt_sid=${encodeURIComponent(signCookieValue(marekSession, 'dev-secret-change-me'))}`,
      `vtt_sid=${encodeURIComponent(signCookieValue('zmyslona-sesja', process.env.E2E_COOKIE_SECRET!))}`,
    ];
    for (const cookie of forged) {
      const response = await anon.get('/api/auth/me', { headers: { cookie } });
      expect(response.status(), cookie).toBe(401);
      const { socket, error } = await rawSocket(cookie);
      expect(socket, cookie).toBeNull();
      expect(error).toBe('UNAUTHORIZED');
    }
    // Kontrola: prawdziwy podpis tym samym sekretem przechodzi.
    const genuine = `vtt_sid=${encodeURIComponent(signCookieValue(marekSession, process.env.E2E_COOKIE_SECRET!))}`;
    expect((await anon.get('/api/auth/me', { headers: { cookie: genuine } })).status()).toBe(200);
  });

  test('6.2.8 wylogowanie unieważnia sesję po stronie serwera', async () => {
    const ola = await apiPlayer('Ola', await invite(gm, 'Ola'));
    const cookie = await cookieHeader(ola);
    const sessions = () =>
      query(`SELECT s.id FROM Session s JOIN User u ON u.id = s.userId WHERE u.name = 'Ola'`)
        .length;
    const before = sessions();
    expect((await ola.post('/api/auth/logout')).status()).toBe(200);
    expect(sessions()).toBe(before - 1);
    expect((await anon.get('/api/auth/me', { headers: { cookie } })).status()).toBe(401);
    expect((await rawSocket(cookie)).error).toBe('UNAUTHORIZED');
    await ola.dispose();
  });

  test('6.2.8 otwarte gniazdo po wylogowaniu traci prawa (#11)', async () => {
    const ola = await apiPlayer('Ola', await invite(gm, 'Ola'));
    const { socket } = await rawSocket(await cookieHeader(ola));
    expect((await emitAck(socket!, 'chat:history', { beforeId: 1_000_000 })).ok).toBe(true);
    await ola.post('/api/auth/logout');
    await new Promise((resolve) => setTimeout(resolve, 500));
    const after = socket!.connected
      ? await emitAck(socket!, 'chat:send', { text: 'Piszę po wylogowaniu.' })
      : { ok: false as const, error: 'DISCONNECTED' };
    socket!.disconnect();
    await ola.dispose();
    expect(after.ok, 'gniazdo sesji usuniętej dalej wysyła wiadomości').toBe(false);
  });

  test('6.2.8 sesja wygasa po SESSION_TTL_DAYS — HTTP i nowe gniazdo', async () => {
    test.setTimeout(120_000);
    await stopServer();
    // 0,00003 doby ≈ 2,6 s.
    await startServer({ ...DEAD_GATEWAY, SESSION_TTL_DAYS: '0.00003' });
    try {
      const ola = await apiPlayer('Ola', await invite(await apiGm(), 'Ola'));
      const cookie = await cookieHeader(ola);
      const { socket } = await rawSocket(cookie);
      expect((await ola.get('/api/auth/me')).status()).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 3_500));
      expect((await ola.get('/api/auth/me')).status()).toBe(401);
      expect((await rawSocket(cookie)).error).toBe('UNAUTHORIZED');
      // Od #11 (01.10) serwer sam rozłącza gniazdo w chwili wygaśnięcia sesji —
      // rozłączone gniazdo niczego już nie wyśle, i o to chodzi.
      const live = socket!.connected
        ? await emitAck(socket!, 'chat:send', { text: 'Piszę po wygaśnięciu sesji.' })
        : { ok: false as const, error: 'DISCONNECTED' };
      liveAfterExpiry = live.ok;
      socket!.disconnect();
      await ola.dispose();
    } finally {
      await stopServer();
      await startServer(DEAD_GATEWAY);
      gm = await apiGm();
    }
  });

  test('6.2.8 otwarte gniazdo wygasłej sesji traci prawa (#11)', async () => {
    expect(liveAfterExpiry, 'otwarte gniazdo wygasłej sesji dalej wysyła wiadomości').toBe(false);
  });

  test('6.2.8 produkcja z domyślnym COOKIE_SECRET', async () => {
    test.setTimeout(120_000);
    await stopServer();
    const log = new ServerLog();
    log.mark();
    let started = false;
    try {
      await startServer({
        ...DEAD_GATEWAY,
        NODE_ENV: 'production',
        COOKIE_SECRET: undefined,
      });
      started = await serverAlive();
    } catch {
      started = false;
    } finally {
      const warned = log
        .since()
        .some((row) => /COOKIE_SECRET|cookie secret/i.test(String(row.msg)));
      if (started) {
        note(
          'zadanie',
          `Produkcja (NODE_ENV=production) wstaje z domyślnym COOKIE_SECRET ` +
            `${warned ? 'z ostrzeżeniem w logu' : 'bez słowa w logu'} — etap 28: odmowa startu ` +
            'albo głośne ostrzeżenie; sekret w .env na VPS.',
        );
      }
      await stopServer().catch(() => undefined);
      await startServer(DEAD_GATEWAY);
      gm = await apiGm();
    }
  });

  test('6.2.10 nagłówki HTTP i pochodzenie — lista dla Caddy (etap 28)', async () => {
    const map = queryOne<{ backgroundUrl: string }>(
      `SELECT backgroundUrl FROM Scene WHERE backgroundUrl LIKE '/uploads/%' LIMIT 1`,
    );
    const wanted = [
      'strict-transport-security',
      'content-security-policy',
      'x-content-type-options',
      'x-frame-options',
      'referrer-policy',
      'permissions-policy',
    ];
    const report: string[] = [];
    for (const path of ['/health', '/api/auth/me', map?.backgroundUrl ?? '/health']) {
      const response = await gm.get(path);
      const headers = response.headers();
      const missing = wanted.filter((name) => !(name in headers));
      report.push(`${path}: brak ${missing.join(', ') || '—'}`);
      expect(headers['x-powered-by']).toBeUndefined();
    }
    note('zadanie', `Nagłówki bezpieczeństwa do dołożenia w Caddy — ${report.join('; ')}`);

    // CORS: obce pochodzenie nie dostaje zgody przeglądarki na odczyt z ciasteczkiem.
    const cors = await gm.get('/socket.io/?EIO=4&transport=polling', {
      headers: { origin: 'http://zly.example' },
    });
    expect(cors.headers()['access-control-allow-origin']).not.toBe('http://zly.example');
    // WebSocket nie ma CORS — serwer przyjmuje handshake z obcym Origin, gdy ciasteczko jest.
    const { socket } = await rawSocket(await cookieHeader(gm), { origin: 'http://zly.example' });
    if (socket) {
      note(
        'zadanie',
        'Gniazdo przyjmuje handshake WebSocket z obcym nagłówkiem Origin (zly.example) — ' +
          'dziś chroni tylko SameSite=Lax; etap 28: sprawdzanie Origin w `allowRequest` Socket.IO.',
      );
      socket.disconnect();
    }
  });

  test('6.2.11 hasło MG z internetu: 30 złych prób z jednego adresu nie blokują MG gdzie indziej', async () => {
    test.setTimeout(120_000);
    // Zgadujący stoi pod „obcym” adresem (`X-Forwarded-For`, instancja ma
    // `TRUST_PROXY=1` jak za Caddy). Limit liczy się per adres (#12, 01.10).
    const attacker = { 'x-forwarded-for': '203.0.113.50' };
    const started = Date.now();
    const statuses: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      statuses.push(
        (
          await anon.post('/api/auth/login', {
            data: { login: GM_LOGIN, password: `zgaduje-${i}` },
            headers: attacker,
          })
        ).status(),
      );
    }
    const seconds = (Date.now() - started) / 1000;
    test.info().annotations.push({
      type: 'pomiar',
      description: `30 złych haseł w ${seconds.toFixed(1)} s, statusy: ${[...new Set(statuses)].join(', ')}`,
    });
    // Z zablokowanego adresu nawet prawdziwe hasło dostaje 429 — inaczej
    // zgadujący dowiedziałby się o trafieniu mimo limitu.
    const fromAttacker = await anon.post('/api/auth/login', {
      data: { login: GM_LOGIN, password: process.env.E2E_GM_PASSWORD },
      headers: attacker,
    });
    expect(fromAttacker.status()).toBe(429);
    expect(Number(fromAttacker.headers()['retry-after'])).toBeGreaterThan(0);
    // MG z innego adresu wchodzi (brak blokady konta = brak DoS na MG).
    const ok = await anon.post('/api/auth/login', {
      data: { login: GM_LOGIN, password: process.env.E2E_GM_PASSWORD },
    });
    expect(ok.status()).toBe(200);
    await anon.post('/api/auth/logout');
    loginStatuses = statuses;
  });

  test('6.2.11 seria złych haseł MG trafia na limit (#12)', async () => {
    // 10 złych prób z adresu w 15 minut, potem 429 (decyzja MG z 01.10).
    expect(loginStatuses.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(loginStatuses.slice(10), 'limit prób logowania MG').toEqual(Array(20).fill(429));
  });
});
