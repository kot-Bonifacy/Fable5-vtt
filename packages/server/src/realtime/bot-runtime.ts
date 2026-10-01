import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SessionUser } from '@vtt/shared';
import { DEFAULT_DICE_SKIN, isDiceSkinId } from '@vtt/shared';
import { RealtimeError, type RealtimeDeps } from './registry.js';

/**
 * Szwy wspólne dla obu przebiegów mechanicznych bota — tego poza walką (20a)
 * i tego w walce (20b).
 *
 * Osobny plik, a nie funkcje w jednym z nich, bo inaczej moduły importowałyby
 * się nawzajem: tura bojowa potrzebuje dziennika decyzji, a rozstrzyganie karty
 * propozycji potrzebuje tury bojowej.
 */

/**
 * Dziennik decyzji: jedna linia JSON na wywołanie, z menu i surową odpowiedzią.
 *
 * Strojenie promptu taktycznego jest iteracyjne, a bez zapisu „co bot w ogóle
 * widział" pytanie „dlaczego wybrał Atletykę" da się rozstrzygnąć wyłącznie
 * zgadywaniem. Zapis nigdy nie może przewrócić tury — błąd ląduje w logu
 * serwera i tyle.
 */
export async function logBotDecision(
  deps: RealtimeDeps,
  entry: Record<string, unknown>,
): Promise<void> {
  const path = deps.ctx.config.botDecisionLogPath;
  if (!path) return;
  try {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(
      path,
      `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`,
      'utf8',
    );
  } catch (error) {
    deps.log.warn({ err: error }, 'bot decision log write failed');
  }
}

/**
 * Konto, którym bot wykonuje mechanikę. To samo, którym mówi od etapu 11 —
 * autorem linii NPC-a jest MG, więc karta rzutu jest nieodróżnialna od rzutu
 * wykonanego ręką MG. Rola GM daje przy tym prawo do cudzej karty i zwalnia
 * z blokad, dlatego o „to jest figura TEGO bota" musi zadbać wołający.
 */
export async function botActorUser(deps: RealtimeDeps, authorId: string): Promise<SessionUser> {
  const user = await deps.ctx.prisma.user.findUnique({
    where: { id: authorId },
    select: { id: true, name: true, role: true, diceSkin: true },
  });
  if (!user) throw new RealtimeError('INTERNAL');
  return {
    id: user.id,
    name: user.name,
    role: user.role as SessionUser['role'],
    // A bot rolls on the GM's account, so it rolls with the GM's dice — the
    // same reason its chat line is indistinguishable from a GM speaking as it.
    diceSkin: isDiceSkinId(user.diceSkin) ? user.diceSkin : DEFAULT_DICE_SKIN,
  };
}

/**
 * Zdanie dla MG, gdy model nie oddał decyzji. Martwy gateway i gateway, który
 * żyje, ale odmawia (pełna kolejka, model jeszcze się ładuje — 503), to dwie
 * różne rady: pierwszy trzeba podnieść, na drugi wystarczy chwilę poczekać.
 * Jedno zdanie na oba kazało MG szukać awarii sieci (#21). Trzecia rada to
 * model, który nie zdążył w limicie (#46).
 */
export function botFailureText(code: string, detail?: string): string {
  switch (code) {
    case 'AI_UNREACHABLE':
      return 'Brak połączenia z AI Gateway.';
    case 'AI_UNAVAILABLE':
      return `Model jest zajęty albo jeszcze niegotowy${detail ? ` (${detail})` : ''} — AI Gateway działa, spróbuj za chwilę.`;
    // Gateway żyje, ale generacja nie zmieściła się w `AI_REQUEST_TIMEOUT_MS`
    // (#46) — to nie awaria serwera, a tura i tak idzie dalej ręką MG.
    case 'AI_TIMEOUT':
      return `Model nie odpowiedział w ${detail ?? 'limicie czasu'} — zagraj tę turę ręką albo kliknij „Graj turę” jeszcze raz.`;
    default:
      return `Model zwrócił błąd${detail ? `: ${detail}` : ''}.`;
  }
}
