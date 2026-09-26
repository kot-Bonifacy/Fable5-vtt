import type { Page } from '@playwright/test';

/**
 * Podsłuch gracza (`testy.md` 4.5): każda ramka gniazda i każda tekstowa odpowiedź
 * HTTP, jaką dostała jego karta, przez cały przebieg. Kanarek to napis z unikalnym
 * kodem wpisany w pole, które widzi tylko MG; asercja sprawdza, że żaden kanarek
 * „tajny w tej chwili” nie pojawił się w tym, co gracz odebrał.
 *
 * Long-polling Socket.IO (przed przejściem na WebSocket) przychodzi jako zwykłe
 * odpowiedzi HTTP, więc łapie go druga połowa podsłuchu.
 */
export class Sniffer {
  private readonly received: string[] = [];
  private readonly pending = new Set<Promise<void>>();

  constructor(page: Page) {
    page.on('websocket', (socket) => {
      socket.on('framereceived', (frame) => {
        this.received.push(
          typeof frame.payload === 'string' ? frame.payload : frame.payload.toString('utf8'),
        );
      });
    });
    page.on('response', (response) => {
      const type = response.headers()['content-type'] ?? '';
      if (!/json|text|javascript/.test(type)) return;
      const read = response
        .text()
        .then((text) => {
          this.received.push(text);
        })
        .catch(() => {
          // Odpowiedź bez treści (przekierowanie, zamknięta strona) — nic do podsłuchania.
        })
        .finally(() => this.pending.delete(read));
      this.pending.add(read);
    });
  }

  /** Czeka na treści odpowiedzi, które jeszcze się czytają. */
  async settle(): Promise<void> {
    await Promise.all([...this.pending]);
  }

  /** Kody kanarków z listy, które trafiły do gracza. */
  async found(codes: Iterable<string>): Promise<string[]> {
    await this.settle();
    return [...codes].filter((code) => this.received.some((chunk) => chunk.includes(code)));
  }

  get size(): number {
    return this.received.length;
  }
}

/**
 * Rejestr kanarków scenariusza. `secret()` wydaje napis do wpisania w pole MG;
 * `reveal()` przenosi kanarek na „jawne” w chwili, gdy zasady go ujawniają
 * (odsłonięta figura, pokazany handout) — od tej chwili gracz może go mieć.
 */
export class Canaries {
  private readonly secretCodes = new Set<string>();
  private counter = 0;

  secret(label: string): string {
    this.counter += 1;
    const code = `KANAREK-${label}-${this.counter.toString(16).toUpperCase().padStart(4, '0')}`;
    this.secretCodes.add(code);
    return code;
  }

  reveal(code: string): void {
    this.secretCodes.delete(code);
  }

  get secretNow(): string[] {
    return [...this.secretCodes];
  }
}
