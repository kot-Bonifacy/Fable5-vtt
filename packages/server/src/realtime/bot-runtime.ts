import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SessionUser } from '@vtt/shared';
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
    select: { id: true, name: true, role: true },
  });
  if (!user) throw new RealtimeError('INTERNAL');
  return { id: user.id, name: user.name, role: user.role as SessionUser['role'] };
}
