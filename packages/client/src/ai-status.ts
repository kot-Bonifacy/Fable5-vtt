import type { AiStatus } from '@vtt/shared';
import { aiAccessReasonOfText, aiAccessReasonText } from '@vtt/shared';
import { useAiStore } from './stores/aiStore.js';

/**
 * Dlaczego AI nie odpowiada tej kampanii (etap 44d) — zdanie bramy AI
 * właściciela albo null, gdy to zwykły stan gatewaya.
 *
 * Odmowa gniazda niesie sam kod `AI_UNAVAILABLE`, więc powód czyta się ze
 * statusu (`reason`, tylko u MG); błąd strumienia niesie gotowe zdanie
 * w `detail`. Gracz powodu nie dostaje — dla niego to po prostu „niedostępne”.
 */
export function aiAccessSentence(detail?: string): string | null {
  if (detail && aiAccessReasonOfText(detail)) return detail;
  const reason = useAiStore.getState().status.reason;
  return reason && reason !== 'offline' ? aiAccessReasonText(reason) : null;
}

/** `AI_UNAVAILABLE` po polsku: powód bramy albo zdanie wołającego o gatewayu. */
export function aiUnavailableMessage(fallback: string, detail?: string): string {
  return aiAccessSentence(detail) ?? fallback;
}

/** Plakietka stanu botów w panelach MG: „boty dostępne”, „AI zajęte”, „boty offline”. */
export function aiBadgeText(status: AiStatus): string {
  if (status.available) return 'boty dostępne';
  switch (status.reason) {
    case 'busy':
      return 'AI zajęte';
    case 'no-consent':
    case 'sharing-off':
    case 'owner-absent':
      return 'AI niedostępne';
    default:
      return 'boty offline';
  }
}

/** Zdanie pod plakietką — tylko gdy powodem jest AI właściciela, nie gateway. */
export function aiReasonLine(status: AiStatus): string | null {
  if (status.available || !status.reason || status.reason === 'offline') return null;
  return aiAccessReasonText(status.reason);
}
