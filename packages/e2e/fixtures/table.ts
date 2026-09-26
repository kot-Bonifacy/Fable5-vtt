import type { Page } from '@playwright/test';
import type { Actor } from './actors.ts';

/**
 * Drobne czynności przy stole, wspólne dla wielu plików — przez UI, jak u ludzi.
 */

/** Wiadomość czatu: pole „Wiadomość czatu” i Enter. */
export async function say(actor: Actor, text: string): Promise<void> {
  const input = actor.page.getByLabel('Wiadomość czatu');
  await input.fill(text);
  await input.press('Enter');
}

/**
 * Rzut kubkiem: formuła w polu czatu (np. `/r 1d10`), potem chwyt, potrząśnięcie
 * i puszczenie — ta sama droga, co gest gracza (pointerdown na kubku, ruchy
 * na `window`, pointerup).
 */
export async function rollWithCup(page: Page, notation: string): Promise<void> {
  await page.getByLabel('Wiadomość czatu').fill(notation);
  const cup = page.locator('.dice-cup');
  const box = await cup.boundingBox();
  if (!box) throw new Error('E2E: the dice cup is not on screen');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 0; i < 6; i += 1) {
    await page.mouse.move(x + (i % 2 ? 60 : -60), y - 40 - i * 10, { steps: 3 });
  }
  await page.mouse.up();
}

/** Wyniki kart rzutów na czacie, od najstarszej. */
export async function rollTotals(page: Page): Promise<string[]> {
  return page.locator('.chat-roll .chat-roll-total').allTextContents();
}

/** Kampania przez API kontem MG (zakłada i aktywuje) — krok UI tego samego to T3. */
export async function createCampaign(mg: Actor, name: string): Promise<string> {
  const response = await mg.page.request.post('/api/campaigns', { data: { name } });
  if (response.status() !== 201) throw new Error(`E2E: campaign ${response.status()}`);
  return ((await response.json()) as { id: string }).id;
}

export async function createInvitation(mg: Actor, campaignId: string): Promise<string> {
  const response = await mg.page.request.post(`/api/campaigns/${campaignId}/invitations`, {
    data: {},
  });
  if (response.status() !== 201) throw new Error(`E2E: invitation ${response.status()}`);
  return ((await response.json()) as { token: string }).token;
}
