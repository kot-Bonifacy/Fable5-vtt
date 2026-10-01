import { describe, expect, it } from 'vitest';
import { AiGateway, type AiStreamEvent } from './gateway.js';

/**
 * Strumień SSE zerwany w pół odpowiedzi (#35, 29.09).
 *
 * Pośrednik T5b ciął połączenie zaraz po `POST /chat`: pętla `parseSse` nie
 * miała `try`, więc `TypeError: terminated` wylatywał z generatora, a gniazdo
 * odpowiadało MG „(INTERNAL)". Zerwanie ma być zdarzeniem `AI_UNREACHABLE`,
 * jak odmowa połączenia — a przerwanie sygnałem wołającego dalej wyjątkiem.
 */

const encoder = new TextEncoder();

/** Odpowiedź, która oddaje jeden kawałek tekstu, a potem się urywa. */
function brokenStream(): Response {
  let sent = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!sent) {
        sent = true;
        controller.enqueue(encoder.encode('event: delta\ndata: {"text":"Strz"}\n\n'));
        return;
      }
      controller.error(new TypeError('terminated'));
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function gatewayWith(response: () => Response): AiGateway {
  return new AiGateway({
    url: 'http://gateway.test',
    apiKey: '',
    healthIntervalMs: 60_000,
    requestTimeoutMs: 5_000,
    fetchImpl: (async (input: string | URL | Request) => {
      if (String(input).endsWith('/health')) throw new TypeError('fetch failed');
      return response();
    }) as typeof fetch,
  });
}

async function collect(stream: AsyncGenerator<AiStreamEvent>): Promise<AiStreamEvent[]> {
  const events: AiStreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

describe('AiGateway.streamChat — zerwane połączenie', () => {
  it('oddaje AI_UNREACHABLE zamiast rzucać, gdy strumień urywa się w pół odpowiedzi (#35)', async () => {
    const gateway = gatewayWith(brokenStream);
    const events = await collect(
      gateway.streamChat({ messages: [{ role: 'user', content: 'Graj turę' }], purpose: 'npc' }),
    );
    expect(events[0]).toEqual({ type: 'delta', text: 'Strz' });
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'AI_UNREACHABLE' });
  });

  it('przerwanie sygnałem wołającego dalej leci wyjątkiem (stop MG, limit czasu)', async () => {
    const controller = new AbortController();
    const gateway = gatewayWith(() => {
      controller.abort();
      return brokenStream();
    });
    await expect(
      collect(
        gateway.streamChat(
          { messages: [{ role: 'user', content: 'Graj turę' }], purpose: 'npc' },
          controller.signal,
        ),
      ),
    ).rejects.toThrow('terminated');
  });
});

/**
 * Własny limit `AI_REQUEST_TIMEOUT_MS` bez sygnału wołającego (#46, T7a).
 *
 * „Graj turę” nie podaje sygnału, więc `streamChat` przerywał się własnym
 * `AbortSignal.timeout` i rzucał `TimeoutError` — gniazdo oddawało `INTERNAL`,
 * a MG czytał „coś poszło nie tak po stronie serwera”, choć to model nie zdążył.
 */
describe('AiGateway.streamChat — własny limit czasu', () => {
  /** Atrapa jak `fake-gateway.ts` w trybie `slow`: kolejka, potem cisza do przerwania. */
  function silentGateway(phase: 'headers' | 'body'): AiGateway {
    return new AiGateway({
      url: 'http://gateway.test',
      apiKey: '',
      healthIntervalMs: 60_000,
      requestTimeoutMs: 30,
      fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
        if (String(input).endsWith('/health')) throw new TypeError('fetch failed');
        const signal = init?.signal;
        const aborted = () =>
          new Promise<never>((_, reject) =>
            signal?.addEventListener('abort', () => reject(signal.reason as Error)),
          );
        if (phase === 'headers') return aborted();
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('event: queue\ndata: {"position":1}\n\n'));
            signal?.addEventListener('abort', () => controller.error(signal.reason));
          },
        });
        return new Response(body, { status: 200 });
      }) as typeof fetch,
    });
  }

  it('cisza po kolejce kończy się zdarzeniem AI_TIMEOUT z limitem, nie wyjątkiem', async () => {
    const events = await collect(
      silentGateway('body').streamChat({
        messages: [{ role: 'user', content: 'Graj turę' }],
        purpose: 'npc',
      }),
    );
    expect(events[0]).toEqual({ type: 'queue', position: 1 });
    expect(events.at(-1)).toEqual({ type: 'error', code: 'AI_TIMEOUT', detail: '0 s' });
  });

  it('brak nagłówków w limicie to też AI_TIMEOUT, a nie „brak połączenia”', async () => {
    const events = await collect(
      silentGateway('headers').streamChat({
        messages: [{ role: 'user', content: 'Graj turę' }],
        purpose: 'npc',
      }),
    );
    expect(events).toEqual([{ type: 'error', code: 'AI_TIMEOUT', detail: '0 s' }]);
  });
});
