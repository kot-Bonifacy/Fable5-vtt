import { GM_OVER_BUDGET, type SocketAck } from '@vtt/shared';
import { playNaturalNotification } from './cup-notification.js';
import {
  infoLifetime,
  useNoticeStore,
  type NoticeAction,
  type NoticeTone,
  type NoticeTopic,
} from './stores/noticeStore.js';

/**
 * Wejście do kanału komunikatów (etap 55) — zamiast `chatStore.addNote`.
 *
 * Trzy kształty, trzy sposoby znikania (decyzja MG z 17.10):
 * - `notifyInfo` — informacja bez wyboru, znika sama;
 * - `notifyRefusal` — odmowa w temacie, stoi do następnej próby w tym temacie
 *   (z `fades` znika sama jak informacja — relacja „co się stało”, 18.10);
 * - `notifyChoice` — pytanie z przyciskami, stoi do wyboru.
 * Czat zostaje dla rozmowy, kart serwera, botów i komend `/…`.
 */

const TITLES: Record<NoticeTone, string> = {
  info: 'Informacja',
  warn: 'Uwaga',
  danger: 'Odmowa',
};

/** Dźwięk tylko przy odmowie i wezwaniu (decyzja MG 17.10); seria kliknięć nie dzwoni serią. */
const SOUND_GAP_MS = 700;
let lastSoundAt = 0;
function ring(file: 'refusal' | 'request'): void {
  const now = Date.now();
  if (now - lastSoundAt < SOUND_GAP_MS) return;
  lastSoundAt = now;
  void playNaturalNotification(file);
}

interface NoticeOptions {
  title?: string;
  topic?: NoticeTopic;
}

export function notifyInfo(text: string, options: NoticeOptions = {}): void {
  useNoticeStore.getState().show({
    tone: 'info',
    title: options.title ?? TITLES.info,
    text,
    topic: options.topic ?? null,
    lifetime: infoLifetime(text),
  });
}

/**
 * Odmowa (albo niepowodzenie) próby w temacie. Kolejna próba w tym samym
 * temacie zdejmuje ją sama — udana przez `clearNotices`/`noteAck`, nieudana
 * podmienia zdanie. `tone: 'warn'` dla zdań, które nie odmawiają, tylko
 * mówią, co się teraz dzieje („Złap oddech…”, „kliknij jeszcze raz”).
 */
export function notifyRefusal(
  topic: NoticeTopic,
  text: string,
  options: { title?: string; tone?: Exclude<NoticeTone, 'info'>; fades?: boolean } = {},
): void {
  const tone = options.tone ?? 'danger';
  useNoticeStore.getState().show({
    tone,
    title: options.title ?? TITLES[tone],
    text,
    topic,
    // `fades` (MG, 18.10): „Marsz przerwany.” czy „Ruch wstrzymany przez MG.”
    // nie czekają na żaden ruch gracza — wisiały bez końca nad mapą.
    lifetime: options.fades ? infoLifetime(text) : null,
  });
  if (tone === 'danger') ring('refusal');
}

/**
 * Pytanie z przyciskami: znika po wyborze, ✕ albo następnej próbie w temacie.
 * Zwraca id paska — pytanie, które traci sens samo (kreator otwarty inną
 * drogą), zdejmuje się `useNoticeStore.getState().dismiss(id)`.
 */
export function notifyChoice(
  topic: NoticeTopic,
  text: string,
  actions: NoticeAction[],
  options: { title?: string; tone?: NoticeTone; silent?: boolean } = {},
): string {
  const tone = options.tone ?? 'warn';
  const id = useNoticeStore.getState().show({
    tone,
    title: options.title ?? 'Do decyzji',
    text,
    topic,
    actions,
    lifetime: null,
  });
  // `silent`: zdarzenie ma już własny dźwięk (np. „handout” przy zgodzie MG).
  if (!options.silent) ring('request');
  return id;
}

/** Udana próba w temacie zamyka jego odmowy i pytania. */
export function clearNotices(topic: NoticeTopic): void {
  useNoticeStore.getState().clearTopic(topic);
}

/**
 * Odpowiedź serwera na próbę w temacie: zgoda zamyka temat, odmowa staje
 * w kanale. Zwraca `ack.ok`, żeby wołający mógł iść dalej jednym `if`.
 *
 * Zgoda zdejmuje odmowy i pytania, ale nie informację (18.10): potwierdzenie
 * ostatniej zgody w handlu przychodzi już po rozgłoszeniu „Wymienione: …”
 * i gasiło je u tego, kto domknął wymianę.
 */
export function noteAck<T>(
  topic: NoticeTopic,
  ack: SocketAck<T>,
  text: (code: string) => string,
): ack is Extract<SocketAck<T>, { ok: true }> {
  if (ack.ok) {
    useNoticeStore.getState().settleTopic(topic);
    return true;
  }
  // Wydatek MG poza budżetem: pytanie stoi już w temacie `overspend`.
  if (ack.error === GM_OVER_BUDGET) return false;
  notifyRefusal(topic, text(ack.error));
  return false;
}
