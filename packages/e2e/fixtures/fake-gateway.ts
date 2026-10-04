import { createServer, type Server, type ServerResponse } from 'node:http';

/**
 * Atrapa AI Gatewaya (T7, `testy.md` 6.3 — decyzja MG z 01.10: degradację AI
 * sprawdza atrapa, prawdziwy gateway i llama-server zostają nietknięte).
 * Mówi tym samym językiem co `ai-gateway/` (`GET /health`, `POST /chat` jako SSE),
 * ale stan wybiera test:
 *
 * - `llama-down` — gateway żyje, llama-server nie (`status: degraded`, `/chat` → 503);
 * - `slow` — zdrowy (`llama: ready`, pułapka `testy`), a `/chat` oddaje kolejkę
 *   i milczy `slowMs` (domyślnie 3 min), zanim skończy pustą odpowiedzią;
 * - `reply` — zdrowy i od razu odpowiada `replyText`; RAG bez trafień, `/tokenize`
 *   liczy znaki / 4 (T9b: boty MG-B na AI właściciela, decyzja MG z 04.10).
 *
 * Każde żądanie poza `/health` ląduje w `requests` z treścią — to „log gatewaya”,
 * z którego T9b liczy, czy żądanie kampanii bez prawa do AI w ogóle dotarło.
 */
export type FakeGatewayMode = 'llama-down' | 'slow' | 'reply';

export interface FakeGatewayRequest {
  at: number;
  method: string;
  url: string;
  body: string;
}

export class FakeGateway {
  mode: FakeGatewayMode = 'llama-down';
  slowMs = 180_000;
  replyText = 'Spadaj stąd, chłopcze. Bez zaproszenia nikt tu nie wchodzi.';
  /** Czas każdego `POST /chat` (ms od epoki) — do sprawdzenia, czy serwer w ogóle pytał. */
  readonly chats: number[] = [];
  /** Każde żądanie poza `/health`, z treścią, w kolejności przyjścia. */
  readonly requests: FakeGatewayRequest[] = [];
  private server: Server | null = null;
  private readonly open = new Set<ServerResponse>();

  constructor(readonly port: number) {}

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  async start(): Promise<void> {
    this.server = createServer((request, response) => {
      if (request.method === 'GET' && request.url === '/health') {
        const ready = this.mode !== 'llama-down';
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            status: ready ? 'ok' : 'degraded',
            llama: ready ? 'ready' : 'stopped',
            model: ready ? 'atrapa-e2e' : null,
            context_size: ready ? 32768 : null,
            queue_length: 0,
            busy: false,
            managed: true,
            restarts: ready ? 0 : 3,
            last_error: ready ? null : 'llama-server exited (E2E)',
            gpu: null,
          }),
        );
        return;
      }
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        this.requests.push({
          at: Date.now(),
          method: request.method ?? '',
          url: request.url ?? '',
          body: Buffer.concat(chunks).toString('utf8'),
        });
        this.answer(request.method ?? '', request.url ?? '', response);
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(this.port, '127.0.0.1', resolve));
  }

  private answer(method: string, url: string, response: ServerResponse): void {
    if (method === 'POST' && url === '/chat') {
      this.chats.push(Date.now());
      if (this.mode === 'reply') {
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.write('event: queue\ndata: {"position": 0}\n\n');
        response.write(`event: delta\ndata: ${JSON.stringify({ text: this.replyText })}\n\n`);
        response.end('event: done\ndata: {"usage": null}\n\n');
        return;
      }
      if (this.mode === 'llama-down') {
        response.writeHead(503, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ detail: 'llama-server nie działa (E2E)' }));
        return;
      }
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write('event: queue\ndata: {"position": 0}\n\n');
      this.open.add(response);
      const timer = setTimeout(() => {
        response.end('event: done\ndata: {"usage": null}\n\n');
        this.open.delete(response);
      }, this.slowMs);
      response.on('close', () => {
        clearTimeout(timer);
        this.open.delete(response);
      });
      return;
    }
    if (this.mode === 'reply' && method === 'POST' && url === '/rag/search') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ hits: [], took_ms: 1 }));
      return;
    }
    if (this.mode === 'reply' && method === 'POST' && url === '/tokenize') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ count: 64 }));
      return;
    }
    response.writeHead(404).end();
  }

  async stop(): Promise<void> {
    for (const response of this.open) response.destroy();
    this.open.clear();
    if (this.server) await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = null;
  }
}
