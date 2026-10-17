import type { SocketAck } from '@vtt/shared';
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
 * - `notifyRefusal` — odmowa w temacie, stoi do następnej próby w tym temacie;
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
  options: { title?: string; tone?: Exclude<NoticeTone, 'info'> } = {},
): void {
  const tone = options.tone ?? 'danger';
  useNoticeStore.getState().show({
    tone,
    title: options.title ?? TITLES[tone],
    text,
    topic,
    lifetime: null,
  });
  if (tone === 'danger') ring('refusal');
}

/** Pytanie z przyciskami: znika po wyborze, ✕ albo następnej próbie w temacie. */
export function notifyChoice(
  topic: NoticeTopic,
  text: string,
  actions: NoticeAction[],
  options: { title?: string; tone?: NoticeTone; silent?: boolean } = {},
): void {
  const tone = options.tone ?? 'warn';
  useNoticeStore.getState().show({
    tone,
    title: options.title ?? 'Do decyzji',
    text,
    topic,
    actions,
    lifetime: null,
  });
  // `silent`: zdarzenie ma już własny dźwięk (np. „handout” przy zgodzie MG).
  if (!options.silent) ring('request');
}

/** Udana próba w temacie zamyka jego odmowy i pytania. */
export function clearNotices(topic: NoticeTopic): void {
  useNoticeStore.getState().clearTopic(topic);
}

/**
 * Odpowiedź serwera na próbę w temacie: zgoda zamyka temat, odmowa staje
 * w kanale. Zwraca `ack.ok`, żeby wołający mógł iść dalej jednym `if`.
 */
export function noteAck<T>(
  topic: NoticeTopic,
  ack: SocketAck<T>,
  text: (code: string) => string,
): ack is Extract<SocketAck<T>, { ok: true }> {
  if (ack.ok) {
    clearNotices(topic);
    return true;
  }
  notifyRefusal(topic, text(ack.error));
  return false;
}
