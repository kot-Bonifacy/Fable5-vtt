import {
  test as base,
  chromium,
  expect,
  firefox,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { io, type Socket } from 'socket.io-client';
import { BASE_URL, GM_LOGIN, SERVER_URL } from '../instance/paths.ts';
import { Sniffer } from './sniffer.ts';

export type Engine = 'chromium' | 'firefox';
type Prepare = (context: BrowserContext) => Promise<unknown>;

/**
 * Błędy konsoli, które nie są błędami (pułapki `ogledziny`, `testy.md` 6.4):
 * 401 z `/api/auth/me` przed zalogowaniem i brak `favicon.ico`.
 */
const KNOWN_CONSOLE_ERRORS = [/status of 401/, /favicon\.ico/];

/**
 * Jeden człowiek przy stole: własna przeglądarka (silnik), własny kontekst
 * (ciasteczka), własna karta **na wierzchu** — Playwright Test, nie karty w tle,
 * więc `rAF` i timery nie dławią się do 1 Hz (pułapka `ogledziny`).
 */
export class Actor {
  readonly name: string;
  readonly engine: Engine;
  readonly context: BrowserContext;
  readonly page: Page;
  readonly sniffer: Sniffer;
  readonly consoleErrors: string[] = [];
  private readonly sockets: Socket[] = [];

  constructor(name: string, engine: Engine, context: BrowserContext, page: Page) {
    this.name = name;
    this.engine = engine;
    this.context = context;
    this.page = page;
    this.sniffer = new Sniffer(page);
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      // „Failed to load resource” nie mówi, czego — adres zasobu siedzi w `location`.
      const url = message.location().url;
      this.consoleErrors.push(url ? `${message.text()} @ ${url}` : message.text());
    });
    page.on('pageerror', (error) => this.consoleErrors.push(`pageerror: ${error.message}`));
    // `window.confirm` zawiesza kartę pod automatem — przechwycony od pierwszej chwili.
    void page.addInitScript(() => {
      window.confirm = () => true;
    });
  }

  /** Błędy konsoli poza znanymi. */
  unexpectedErrors(): string[] {
    return this.consoleErrors.filter((text) => !KNOWN_CONSOLE_ERRORS.some((re) => re.test(text)));
  }

  /** Stan magazynu klienta przez hak E2E (`auth`, `chat`, `scene`, …). */
  async store<T = unknown>(name: string): Promise<T> {
    return (await this.page.evaluate(
      (key) => window.__vttE2E?.stores[key]?.getState() ?? null,
      name,
    )) as T;
  }

  /**
   * Osobne gniazdo `socket.io-client` z ciasteczkiem tego aktora — do czytania
   * stanu serwera i do wysyłania surowych intencji (T2), obok jego karty.
   */
  async socket(): Promise<Socket> {
    const cookies = await this.context.cookies(BASE_URL);
    const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const socket = io(SERVER_URL, { extraHeaders: { cookie }, transports: ['websocket'] });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    this.sockets.push(socket);
    return socket;
  }

  async close(): Promise<void> {
    for (const socket of this.sockets) socket.disconnect();
    await this.context.close();
  }
}

async function waitSignedIn(actor: Actor): Promise<void> {
  await expect
    .poll(async () => (await actor.store<{ status: string } | null>('auth'))?.status, {
      message: `${actor.name} signs in`,
    })
    .toBe('authenticated');
}

/**
 * Obsada scenariusza. Zasięg pracownika: aktorzy przeżywają kolejne testy
 * `describe.serial` (krok = test), a sprząta ich `closeAll()` w `afterAll` pliku
 * albo koniec pracownika.
 */
export class Cast {
  readonly actors: Actor[] = [];
  /** Okno nowych aktorów; T7c mierzy mapę w Full HD (decyzja MG z 02.10). */
  viewport = { width: 1600, height: 900 };
  private readonly browsers = new Map<Engine, Browser>();

  private async browser(engine: Engine): Promise<Browser> {
    let browser = this.browsers.get(engine);
    if (!browser) {
      const headless = !process.env.E2E_HEADED;
      // Chromium: nowy tryb headless (`channel: 'chromium'`) — domyślny `headless_shell`
      // renderuje WebGL programowo (SwiftShader), a ciemna scena z oświetleniem schodzi
      // wtedy do 2–8 kl./s i marsz figury wlecze się 5× wolniej (T3b, pułapka `testy`).
      browser = await (engine === 'chromium'
        ? chromium.launch({ headless, channel: 'chromium' })
        : firefox.launch({ headless }));
      this.browsers.set(engine, browser);
    }
    return browser;
  }

  /**
   * `prepare` dostaje kontekst przed pierwszym `goto` — np. pośrednik gniazda
   * z `fixtures/network.ts` (T7), który musi stać, zanim karta się połączy.
   */
  async open(name: string, engine: Engine, prepare?: Prepare): Promise<Actor> {
    const browser = await this.browser(engine);
    const context = await browser.newContext({
      baseURL: BASE_URL,
      viewport: this.viewport,
      locale: 'pl-PL',
    });
    await prepare?.(context);
    const actor = new Actor(name, engine, context, await context.newPage());
    this.actors.push(actor);
    return actor;
  }

  /** MG loguje się przez formularz loginem i hasłem instancji (losowym na przebieg). */
  async mg(engine: Engine = 'chromium', prepare?: Prepare): Promise<Actor> {
    const password = process.env.E2E_GM_PASSWORD;
    if (!password) throw new Error('E2E: no E2E_GM_PASSWORD — run through playwright test');
    const actor = await this.open('MG', engine, prepare);
    await actor.page.goto('/');
    await actor.page.locator('#gm-login').fill(GM_LOGIN);
    await actor.page.locator('#gm-password').fill(password);
    await actor.page.getByRole('button', { name: 'Zaloguj się' }).click();
    await waitSignedIn(actor);
    return actor;
  }

  /** Gracz wchodzi z linku zaproszenia pod swoim imieniem. */
  async gracz(
    name: string,
    engine: Engine,
    invitationToken: string,
    prepare?: Prepare,
  ): Promise<Actor> {
    const actor = await this.open(name, engine, prepare);
    await actor.page.goto(`/join/${encodeURIComponent(invitationToken)}`);
    await actor.page.locator('#player-name').fill(name);
    await actor.page.getByRole('button', { name: 'Dołącz do gry' }).click();
    await waitSignedIn(actor);
    return actor;
  }

  async closeAll(): Promise<void> {
    for (const actor of this.actors.splice(0)) await actor.close();
    for (const browser of this.browsers.values()) await browser.close();
    this.browsers.clear();
  }
}

export const test = base.extend<{ actorShots: void }, { cast: Cast }>({
  cast: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const cast = new Cast();
      await use(cast);
      await cast.closeAll();
    },
    { scope: 'worker' },
  ],
  // Zrzut każdego aktora przy porażce — wbudowany `screenshot` widzi tylko `page` Playwrighta.
  actorShots: [
    async ({ cast }, use, testInfo) => {
      await use();
      if (testInfo.status === testInfo.expectedStatus) return;
      for (const actor of cast.actors) {
        if (actor.page.isClosed()) continue;
        await testInfo.attach(`${actor.name}-${actor.engine}.png`, {
          body: await actor.page.screenshot(),
          contentType: 'image/png',
        });
        // Plik obok zrzutu, nie treść w raporcie HTML — do czytania bez przeglądarki.
        const frames = testInfo.outputPath(`${actor.name}-ramki.txt`);
        writeFileSync(frames, actor.sniffer.recentFrames());
        await testInfo.attach(`${actor.name}-ramki.txt`, {
          path: frames,
          contentType: 'text/plain',
        });
      }
    },
    { auto: true },
  ],
});

export { expect };
