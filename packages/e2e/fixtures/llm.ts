import { test } from '@playwright/test';

/**
 * Testy z modelem oznacza się tagiem `@llm` (`testy.md` 4.3). Gdy gateway nie
 * odpowiada na `/health`, test się pomija z powodem, a nie pada — decyzja MG
 * z 26.09: T1 idzie bez modelu, boty w pełni od T3.
 */
export const GATEWAY_URL = process.env.E2E_AI_GATEWAY_URL ?? 'http://127.0.0.1:8100';

/** Tura bota liczy się w minutach (~50 tok/s na Qwen3.8-27B Q3). */
export const LLM_TIMEOUT_MS = 180_000;

export async function gatewayAlive(): Promise<boolean> {
  try {
    const response = await fetch(`${GATEWAY_URL}/health`, { signal: AbortSignal.timeout(2_000) });
    return response.ok;
  } catch {
    return false;
  }
}

/** Na początku testu `@llm`: pomija go przy martwym gatewayu i wydłuża limit. */
export async function requireGateway(): Promise<void> {
  test.skip(!(await gatewayAlive()), `AI gateway nie odpowiada (${GATEWAY_URL}/health)`);
  test.setTimeout(LLM_TIMEOUT_MS * 2);
}
