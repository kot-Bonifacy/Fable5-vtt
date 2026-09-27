import { createConnection, createServer, type Server, type Socket } from 'node:net';

/**
 * Pośrednik TCP między instancją E2E a prawdziwym AI Gatewayem (`testy.md` 5.3,
 * decyzja MG z 27.09, sesja T5a): T5b zrywa nim połączenia **w trakcie** tury
 * bota i odmawia nowych, a w 5.10 go przywraca. Gateway i llama-server na
 * :8100/:8080 zostają nietknięte — pada tylko droga do nich.
 *
 * TCP, a nie HTTP: serwer VTT trzyma połączenia `keep-alive`, więc to samo
 * gniazdo niesie raz `GET /health`, raz `POST /chat`. Pośrednik czyta więc
 * w każdym kawałku od klienta wiersz żądania i zapamiętuje, kiedy ostatnio
 * poszło pytanie do modelu — test tnie dopiero, gdy to się stało.
 */
export class GatewayProxy {
  readonly port: number;
  private readonly target: { host: string; port: number };
  private server: Server | null = null;
  private readonly pairs = new Set<Socket>();
  /** Ścieżki żądań w kolejności przyjścia (np. `POST /chat`). */
  readonly requests: { at: number; line: string }[] = [];

  constructor(port: number, target: string) {
    this.port = port;
    const url = new URL(target);
    this.target = { host: url.hostname, port: Number(url.port || 80) };
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  get listening(): boolean {
    return this.server?.listening ?? false;
  }

  /** Czas ostatniego `POST /chat` po chwili `since` (albo `null`). */
  chatSince(since: number): number | null {
    const hit = this.requests.find((r) => r.at >= since && r.line.startsWith('POST /chat'));
    return hit?.at ?? null;
  }

  async start(): Promise<void> {
    if (this.listening) return;
    const server = createServer((client) => this.pipe(client));
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.port, '127.0.0.1', () => resolve());
    });
    this.server = server;
  }

  /**
   * Pad gatewaya widziany z VTT: otwarte połączenia zerwane w pół odpowiedzi,
   * nowe odrzucone (`ECONNREFUSED`), tak jak po zabiciu procesu.
   */
  async cut(): Promise<void> {
    const server = this.server;
    this.server = null;
    for (const socket of this.pairs) socket.destroy();
    this.pairs.clear();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  /** Gateway wraca pod tym samym adresem (5.10). */
  async restore(): Promise<void> {
    await this.start();
  }

  async close(): Promise<void> {
    await this.cut();
  }

  private pipe(client: Socket): void {
    const upstream = createConnection(this.target);
    this.pairs.add(client);
    this.pairs.add(upstream);
    const drop = () => {
      client.destroy();
      upstream.destroy();
      this.pairs.delete(client);
      this.pairs.delete(upstream);
    };
    client.on('data', (chunk: Buffer) => {
      const head = chunk.subarray(0, 200).toString('latin1');
      const line = /^(GET|POST|PUT|DELETE) (\S+) HTTP/.exec(head);
      if (line) this.requests.push({ at: Date.now(), line: `${line[1]} ${line[2]}` });
    });
    client.pipe(upstream);
    upstream.pipe(client);
    client.on('error', drop);
    upstream.on('error', drop);
    client.on('close', drop);
    upstream.on('close', drop);
  }
}
