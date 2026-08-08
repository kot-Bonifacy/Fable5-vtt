/**
 * Budżet promptu i czasu bota z doklejoną bazą wiedzy (etap 19b).
 *
 *     pnpm --filter @vtt/server exec tsx scripts/bot-context-budget.ts
 *
 * Wymaga działającego AI Gatewaya (`pwsh ai-gateway/scripts/start-gateway.ps1`).
 *
 * Mierzy DOKŁADNIE to, co etap 19b dokłada do tury bota z etapu 11, i mierzy to
 * na prawdziwym modelu, nie na oszacowaniu:
 *
 *  1. **wyszukiwanie** — jedno `/rag/search` w kolekcji kampanii; ten czas siedzi
 *     PRZED generacją, więc wchodzi wprost do limitu odpowiedzi,
 *  2. **koszt kontekstu** — prompt liczony tokenizerem modelu (`/tokenize`),
 *     z fragmentami i bez, na tej samej historii czatu,
 *  3. **cała tura** — od pytania do ostatniego tokenu, przez `/chat`.
 *
 * Prompt składa `compileBotPrompt` z `@vtt/shared` — ten sam kod, który jedzie do
 * modelu w sesji. Skrypt zakłada własną kolekcję (`campaign:bench`) i kasuje ją
 * na końcu, więc nie dotyka indeksu kampanii.
 */

import {
  compileBotPrompt,
  createDefaultBotData,
  knowledgeDocumentText,
  mergeBotData,
  type BotChatTurn,
  type KnowledgePassage,
} from '@vtt/shared';

const GATEWAY = process.env.AI_GATEWAY_URL ?? 'http://127.0.0.1:8100';
const API_KEY = process.env.AI_GATEWAY_API_KEY ?? '';
const COLLECTION = 'campaign:bench';
const RUNS = 5;

/** Wpisy w skali, w jakiej MG naprawdę pisze bazę: kilka akapitów na wpis. */
const ENTRIES = [
  {
    title: 'Klub Afterlife',
    tags: ['miejsca', 'watson'],
    body: `Bar w podziemiach dawnej kliniki ratunkowej przy Sixth Street. Wejście jest od zaplecza pralni,
a bramkarz nazywa się Kolec i pamięta każdego, kto kiedykolwiek nie zapłacił. Drinki nazywają się po
solówkach, które zginęły na robocie — zamówienie „Johnny Silverhand" to podwójna tequila i cisza przy barze.
Na zapleczu jest osobna sala, w której fikserzy przyjmują klientów; wstęp tylko z polecenia.
Klub jest neutralnym gruntem: gangi zostawiają broń u bramkarza, a kto łamie tę zasadę, nie wraca.`,
  },
  {
    title: 'Gang Maelstrom',
    tags: ['gangi', 'watson'],
    body: `Cybergang z Watson, poznawalny po chromie zamiast twarzy i czerwonych diodach zamiast oczu.
Handlują cyberware wątpliwego pochodzenia i wynajmują się do brudnej roboty, ale nie zdradzają zleceniodawcy.
Ich kryjówką jest dawna fabryka Totentanz przy północnym skraju dzielnicy.
Z klubem Afterlife mają rozejm — barman leczył kiedyś ich bossa i to się liczy.`,
  },
  {
    title: 'Fikserka Vex',
    tags: ['ludzie', 'watson'],
    body: `Cyniczna fikserka po trzydziestce, urzęduje w bocznej sali Afterlife przy trzeciej kolejce kawy.
Zna każdego kuriera w Watson i połowę tych z Heywood. Bierze piętnaście procent i nigdy nie negocjuje.
Ma dług u Tygrysich Pazurów, o którym nie mówi, i dlatego coraz częściej przyjmuje zlecenia, których wcześniej by nie tknęła.`,
  },
  {
    title: 'Militech w Night City',
    tags: ['korporacje'],
    body: `Korporacja zbrojeniowa, po Czwartej Wojnie Korporacyjnej wciąż największy dostawca broni dla NCPD.
Ich biuro regionalne stoi w Corpo Plaza; rekrutują solówki przez pośredników, nigdy bezpośrednio.
Płacą dobrze i na czas, ale kontrakt zawiera klauzulę o milczeniu, której egzekwowaniem zajmuje się osobny dział.`,
  },
  {
    title: 'Kurier z przesyłką',
    tags: ['intrygi'],
    body: `Militech szuka kuriera, który zniknął z przesyłką gdzieś między Watson a Santo Domingo.
Przesyłka to shard z danymi personalnymi; korporacja nie mówi czyimi.
Kurier nazywa się Sasha i ostatni raz widziano go w Afterlife trzy noce temu, rozmawiającego z kimś od Maelstromu.`,
  },
  {
    title: 'Pralnia Sixth Street',
    tags: ['miejsca', 'watson'],
    body: `Całodobowa pralnia samoobsługowa, przez którą wchodzi się do Afterlife. Osiem pralek, z czego trzy działają.
Właścicielka nazywa się pani Nguyen i udaje, że nie wie, co jest za ścianą.`,
  },
  {
    title: 'Tygrysie Pazury',
    tags: ['gangi'],
    body: `Gang z Japantown, prowadzi kluby walki i pożycza pieniądze na procent, którego nikt nie liczy na głos.
W Watson pojawiają się rzadko i tylko po odbiór długu.`,
  },
  {
    title: 'Zasady lokalu',
    tags: ['miejsca'],
    body: `W Afterlife nie wolno: wyciągać broni, nagrywać, pytać barmana o klientów.
Za pierwsze dwa wylatujesz, za trzecie wylatujesz i nikt cię już nie wpuści.`,
  },
];

/** Historia czatu w skali z etapu 11: krótkie kwestie przy stole. */
const HISTORY: BotChatTurn[] = Array.from({ length: 18 }, (_, index) =>
  index % 2 === 0
    ? {
        role: 'user' as const,
        text: 'Rozglądam się po sali i próbuję ocenić, kto tu dziś jest.',
        speaker: 'Johnny',
      }
    : { role: 'bot' as const, text: 'Same znajome twarze. Nikt, kogo nie chciałbyś tu spotkać.' },
);

const QUESTION = 'Barman, co wiesz o klubie Afterlife i kto tu dziś przyjmuje zlecenia?';

function headers(): Record<string, string> {
  return { 'content-type': 'application/json', ...(API_KEY ? { 'x-api-key': API_KEY } : {}) };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${GATEWAY}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} → HTTP ${response.status}: ${await response.text()}`);
  return (await response.json()) as T;
}

function botData() {
  return mergeBotData(createDefaultBotData('npc'), {
    persona: {
      personality: 'Barman w Afterlife. Widział wszystko i niczym się nie przejmuje.',
      motivations: 'Dotrwać do końca zmiany i nie wchodzić nikomu w drogę.',
      secrets: 'Wie, kto wyniósł shard, ale nie powie tego za darmo.',
      speechStyle: 'Krótkie zdania, sucho, bez uprzejmości.',
      catchphrases: ['Pijesz albo wychodzisz.'],
    },
    knowledge: {
      world: 'Night City, 2045. Po Czwartej Wojnie Korporacyjnej.',
      campaign: 'Ekipa szuka zaginionego kuriera Militechu.',
      people: 'Zna z widzenia większość stałych bywalców.',
      forbidden: 'Nie wie, co jest na shardzie.',
    },
    knowledgeContext: { sources: ['campaign'], tags: [], topK: 3 },
  });
}

/** Prompt tak, jak zbuduje go serwer: profil + fragmenty, potem historia czatu. */
function fullPrompt(passages: KnowledgePassage[]): { system: string; measured: string } {
  const system = compileBotPrompt({
    name: 'Barman',
    data: botData(),
    participants: ['Johnny', 'Rogue'],
    scene: 'Bar Afterlife',
    mode: 'chat',
    knowledgePassages: passages,
  });
  const measured = [
    system,
    ...HISTORY.map((turn) => `${turn.speaker ?? ''}: ${turn.text}`),
    `Johnny: ${QUESTION}`,
  ].join('\n');
  return { system, measured };
}

async function tokens(text: string): Promise<number> {
  const body = await post<{ count: number }>('/tokenize', { text });
  return body.count;
}

async function chatMs(system: string): Promise<{ ms: number; completion: number }> {
  const started = Date.now();
  const response = await fetch(`${GATEWAY}/chat`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      messages: [
        { role: 'system', content: system },
        ...HISTORY.map((turn) =>
          turn.role === 'bot'
            ? { role: 'assistant', content: turn.text }
            : { role: 'user', content: `${turn.speaker}: ${turn.text}` },
        ),
        { role: 'user', content: `Johnny: ${QUESTION}` },
      ],
      purpose: 'npc',
      reasoning: false,
      max_tokens: 200,
      temperature: 0.85,
    }),
  });
  if (!response.body) throw new Error('brak strumienia z /chat');
  const decoder = new TextDecoder();
  let completion = 0;
  let raw = '';
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    raw += decoder.decode(chunk, { stream: true });
  }
  const usage = /"completion_tokens":\s*(\d+)/.exec(raw);
  if (usage) completion = Number(usage[1]);
  return { ms: Date.now() - started, completion };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

async function main(): Promise<void> {
  console.log(`gateway: ${GATEWAY}`);

  const indexed = await post<{ chunks: number; duration_ms: number }>('/rag/index', {
    collection: COLLECTION,
    documents: ENTRIES.map((entry) => ({
      source: `entry:${entry.title}`,
      text: knowledgeDocumentText({ ...entry, type: 'place' }),
      title: entry.title,
      format: 'markdown',
      tags: entry.tags,
      visibility: 'bots',
    })),
  });
  console.log(
    `indeks: ${ENTRIES.length} wpisów → ${indexed.chunks} fragmentów w ${indexed.duration_ms} ms`,
  );

  try {
    // 1. Wyszukiwanie — koszt doklejony PRZED generacją.
    const searchMs: number[] = [];
    let passages: KnowledgePassage[] = [];
    for (let run = 0; run < RUNS; run += 1) {
      const started = Date.now();
      const found = await post<{ hits: { chunk_id: number; text: string; chapter: string }[] }>(
        '/rag/search',
        { query: QUESTION, collection: COLLECTION, top_k: 3, tags: [], visibility: ['bots'] },
      );
      searchMs.push(Date.now() - started);
      passages = found.hits.map((hit) => ({
        chunkId: hit.chunk_id,
        entryId: '',
        title: hit.chapter,
        text: hit.text,
        score: 0,
      }));
    }
    console.log(
      `wyszukiwanie: mediana ${median(searchMs)} ms (${searchMs.join(', ')} ms) · trafienia: ${passages
        .map((passage) => passage.title)
        .join(', ')}`,
    );

    // 2. Koszt kontekstu — tokenizerem modelu, nie heurystyką.
    const withRag = fullPrompt(passages);
    const without = fullPrompt([]);
    const [withTokens, withoutTokens] = await Promise.all([
      tokens(withRag.measured),
      tokens(without.measured),
    ]);
    console.log(
      `prompt: ${withoutTokens} → ${withTokens} tokenów (+${withTokens - withoutTokens} za ${passages.length} fragmenty)`,
    );

    // 3. Cała tura na żywym modelu.
    const turns: number[] = [];
    let completion = 0;
    for (let run = 0; run < 3; run += 1) {
      const result = await chatMs(withRag.system);
      turns.push(result.ms);
      completion = result.completion;
    }
    const total = turns.map((ms, index) => ms + (searchMs[index] ?? median(searchMs)));
    console.log(`generacja: ${turns.join(' / ')} ms (${completion} tokenów odpowiedzi)`);
    console.log(
      `RAZEM (wyszukiwanie + generacja): mediana ${(median(total) / 1000).toFixed(2)} s,` +
        ` najgorszy ${(Math.max(...total) / 1000).toFixed(2)} s — limit etapu 11 to 20 s`,
    );
  } finally {
    const removed = await fetch(`${GATEWAY}/rag/collections/${encodeURIComponent(COLLECTION)}`, {
      method: 'DELETE',
      headers: headers(),
    });
    console.log(`sprzątanie kolekcji ${COLLECTION}: HTTP ${removed.status}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
