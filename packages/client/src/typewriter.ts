import type { ChatMessageView } from '@vtt/shared';
import { useTypewriterStore } from './stores/typewriterStore.js';

/**
 * Wypowiedź NPC-a dopisuje się na czacie słowo po słowie, w równym tempie
 * czytania — jak gdyby ktoś przy stole zapisywał to, co NPC właśnie mówi.
 *
 * Trzy rzeczy warto wiedzieć:
 *
 * 1. **To jest wyłącznie efekt tej przeglądarki.** Serwer wysyła wypowiedź
 *    w całości i nie wie o rytmie nic — do etapu 12 rytm liczyło się z pliku
 *    audio, więc jechał w payloadzie; po wycofaniu mowy botów nie ma czego
 *    synchronizować i tempo jest stałe.
 * 2. **Jedna linia naraz.** Dwa boty odpowiadające po sobie piszą się po kolei,
 *    nigdy równocześnie — inaczej dwie rosnące wypowiedzi robią na czacie
 *    bałagan.
 * 3. **Nic się nie ukrywa.** Wypowiedź jest już u klienta; efekt tylko odsłania
 *    ją stopniowo, bez opóźniania danych z serwera.
 */

/**
 * Znaków na sekundę. 15 zn/s to mniej więcej tempo, w jakim NPC-e mówiły
 * w etapie 12 — stół zna ten rytm, a wolniejsze tempo daje czas na przeczytanie
 * zdania, zanim dojdzie następne.
 */
const CHARS_PER_SECOND = 15;

/**
 * Twardy limit na jedną wypowiedź. Bez niego monolog na 600 znaków blokowałby
 * czat na 40 sekund — a tekst i tak jest już u klienta, więc dłuższa linia po
 * prostu pisze się szybciej.
 */
const MAX_DURATION_MS = 12_000;

interface TypewriterJob {
  messageId: number;
  text: string;
}

const queue: TypewriterJob[] = [];
let running = false;

/** Czy tę linię w ogóle pisać: świeża wypowiedź NPC-a, nie historia ani rzut. */
export function shouldTypeOut(message: ChatMessageView): boolean {
  if (!message.botId) return false;
  if (message.kind !== 'say' && message.kind !== 'whisper') return false;
  return message.text.length > 0;
}

/** Kolejkuje świeżo dostarczoną wypowiedź NPC-a (nigdy historię). */
export function typeOutMessage(message: ChatMessageView): void {
  queue.push({ messageId: message.id, text: message.text });
  useTypewriterStore.getState().start(message.id);
  void drain();
}

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    let job = queue.shift();
    while (job) {
      await runJob(job);
      job = queue.shift();
    }
  } finally {
    running = false;
  }
}

/** Ile milisekund powinna zająć linia tej długości. */
export function durationFor(length: number): number {
  return Math.min((length / CHARS_PER_SECOND) * 1000, MAX_DURATION_MS);
}

function runJob(job: TypewriterJob): Promise<void> {
  const duration = durationFor(job.text.length);
  const startedAt = performance.now();
  return new Promise((resolve) => {
    let frame = 0;
    const step = () => {
      const state = useTypewriterStore.getState();
      const elapsed = performance.now() - startedAt;
      if (elapsed >= duration) {
        state.finish(job.messageId);
        window.cancelAnimationFrame(frame);
        resolve();
        return;
      }
      state.setRevealed(job.messageId, charsAt(job.text, elapsed, duration));
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
  });
}

/**
 * Ile pierwszych znaków jest widocznych po `elapsed` ms.
 *
 * Postęp jest równy w czasie, ale ucina się na granicy słowa: bez tego ostatni
 * wyraz rośnie literami i czyta się gorzej niż całe słowa pojawiające się po
 * kolei. Stąd „słowo po słowie", a nie „znak po znaku".
 */
export function charsAt(text: string, elapsed: number, duration: number): number {
  if (duration <= 0) return text.length;
  const raw = Math.floor((Math.min(elapsed, duration) / duration) * text.length);
  if (raw >= text.length) return text.length;
  // Następny znak zaczyna nowe słowo ⇒ to, co widać, jest już całym słowem.
  if (/\s/.test(text[raw] ?? '')) return raw;
  const lastBreak = text.lastIndexOf(' ', raw);
  return lastBreak > 0 ? lastBreak : 0;
}
