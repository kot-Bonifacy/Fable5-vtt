import type { BrowserContext, WebSocketRoute } from '@playwright/test';
import { expect, type Actor } from './actors.ts';

/**
 * Sieć gracza pod kontrolą testu (T7, `testy.md` 6.3): opóźnienie VPS i zerwanie
 * połączenia. Gniazdo Socket.IO karty idzie przez `routeWebSocket` Playwrighta —
 * pośrednik w procesie testów, ten sam w Chromium i Firefoksie (łata
 * `WebSocket.prototype.send` z pułapki `ogledziny` opóźniała tylko wysyłkę,
 * a CDP działa wyłącznie w Chromium).
 *
 * Opóźnienie idzie w obie strony, z rozrzutem, ale **w kolejce**: ramka nie
 * wyprzedza poprzedniej, jak w TCP — sam `setTimeout` z losowym czasem
 * przestawiałby ramki, czego żadna sieć nie robi.
 *
 * Zerwanie zamyka żywe gniazda i odbija nowe, a `setOffline` odcina HTTP
 * (long-polling Socket.IO przed przejściem na WebSocket, `/api/*`).
 */
export class Network {
  private readonly routes = new Set<WebSocketRoute>();
  private offline = false;
  private delayMs = 0;
  private jitterMs = 0;
  private readonly lanes = { up: 0, down: 0 };
  /** Ile razy karta próbowała połączyć się, gdy sieć leżała. */
  refused = 0;
  /** Ramki serwer → karta zapisywane od `capture()` (nazwa zdarzenia i początek treści). */
  private captured: string[] | null = null;

  private constructor(private readonly context: BrowserContext) {}

  /** Przed pierwszym `goto` — gniazdo otwarte wcześniej idzie obok pośrednika. */
  static async install(context: BrowserContext): Promise<Network> {
    const network = new Network(context);
    await context.routeWebSocket(/\/socket\.io\//, (route) => network.attach(route));
    return network;
  }

  private attach(route: WebSocketRoute): void {
    if (this.offline) {
      this.refused += 1;
      void route.close({ code: 1001, reason: 'E2E offline' });
      return;
    }
    const server = route.connectToServer();
    this.routes.add(route);
    route.onMessage((message) => this.later('up', () => server.send(message)));
    server.onMessage((message) => {
      if (this.captured && typeof message === 'string') {
        this.captured.push(`${Date.now() % 100_000} ${message}`);
      }
      this.later('down', () => route.send(message));
    });
    route.onClose((code, reason) => {
      this.routes.delete(route);
      void server.close({ code, reason });
    });
    server.onClose((code, reason) => {
      this.routes.delete(route);
      void route.close({ code, reason });
    });
  }

  private later(lane: 'up' | 'down', deliver: () => void): void {
    if (this.delayMs === 0 && this.lanes[lane] <= Date.now()) {
      deliver();
      return;
    }
    const wanted = Date.now() + this.delayMs + (Math.random() * 2 - 1) * this.jitterMs;
    const at = Math.max(wanted, this.lanes[lane]);
    this.lanes[lane] = at;
    setTimeout(
      () => {
        try {
          deliver();
        } catch {
          // Gniazdo zamknięte w czasie lotu ramki — ramka ginie jak w zerwanym TCP.
        }
      },
      Math.max(0, at - Date.now()),
    );
  }

  /**
   * Opóźnienie VPS: `ms` ± `jitter` w każdą stronę (domyślnie połowa RTT, więc
   * 150 ± 50 ms daje ack po ~300 ms). Zero wyłącza.
   */
  latency(ms: number, jitter = 0): void {
    this.delayMs = ms;
    this.jitterMs = Math.min(jitter, ms);
  }

  /** Zaczyna zapisywać ramki od serwera; `stop` oddaje zapis i kończy podsłuch. */
  capture(): { stop: () => string[] } {
    this.captured = [];
    return {
      stop: () => {
        const frames = this.captured ?? [];
        this.captured = null;
        return frames;
      },
    };
  }

  get connections(): number {
    return this.routes.size;
  }

  async goOffline(): Promise<void> {
    this.offline = true;
    await this.context.setOffline(true);
    for (const route of [...this.routes]) {
      this.routes.delete(route);
      await route.close({ code: 1001, reason: 'E2E offline' }).catch(() => undefined);
    }
  }

  async goOnline(): Promise<void> {
    this.offline = false;
    await this.context.setOffline(false);
  }
}

/** Napis wskaźnika połączenia w nagłówku („Połączono” / „Rozłączono”). */
export function connectionStatus(actor: Actor) {
  return actor.page.locator('.connection-status').first();
}

/** Gniazdo karty znów połączone i stan ze świeżego `state:sync` (czat zsynchronizowany). */
export async function expectReconnected(actor: Actor, timeout = 30_000): Promise<void> {
  await expect(connectionStatus(actor), actor.name).toContainText('Połączono', { timeout });
  await expect
    .poll(async () => (await actor.store<{ synced: boolean }>('chat'))?.synced, {
      message: `${actor.name}: czat po ponownym połączeniu`,
      timeout,
    })
    .toBe(true);
}
