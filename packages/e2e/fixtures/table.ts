import type { Page } from '@playwright/test';
import type { Actor } from './actors.ts';
import { playerLink } from './links.ts';
import { emitAck } from './socket.ts';

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
  await shakeCup(page);
}

/**
 * Sam gest kubka: chwyt, potrząśnięcie, puszczenie. Kubek musi być już
 * załadowany (formuła w polu czatu, „Weź kubek” w kreatorze, slot broni).
 */
export async function shakeCup(page: Page): Promise<void> {
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

/**
 * Kampania przez API kontem MG: zakłada (otwiera się u MG) i — chyba że
 * `session: false` — od razu rozpoczyna sesję, żeby gracze siedli przy stole
 * (etap 44c). Krok UI tego samego to T3a („Utwórz”, „Rozpocznij sesję”).
 */
export async function createCampaign(
  mg: Actor,
  name: string,
  { session = true }: { session?: boolean } = {},
): Promise<string> {
  const response = await mg.page.request.post('/api/campaigns', { data: { name } });
  if (response.status() !== 201) throw new Error(`E2E: campaign ${response.status()}`);
  const id = ((await response.json()) as { id: string }).id;
  if (session) await startSession(mg, id);
  return id;
}

/** „Rozpocznij sesję” gniazdem MG (etap 44c) — bez UI, dla fixture'ów. */
export async function startSession(mg: Actor, campaignId: string): Promise<void> {
  const socket = await mg.socket();
  try {
    const ack = await emitAck(socket, 'session:start', { campaignId });
    if (!ack.ok) throw new Error(`E2E: session:start ${ack.error}`);
  } finally {
    socket.disconnect();
  }
}

/** Imienny link dla gracza (etap 44b): nowy gracz albo odnowienie — `playerLink`. */
export async function createInvitation(
  mg: Actor,
  campaignId: string,
  name: string,
): Promise<string> {
  return playerLink(mg.page.request, campaignId, name);
}

/**
 * Sprawa ze znacznika „Czeka na MG” (prawy górny róg mapy): rozwija listę
 * i klika „Przejdź” przy wierszu z tekstem. Kafle same gasną po kilku
 * sekundach, więc droga przez znacznik jest jedyną pewną.
 */
export async function goToGmAttention(mg: Actor, text: string | RegExp): Promise<void> {
  const badge = mg.page.locator('.gm-attention-badge');
  if ((await badge.getAttribute('aria-expanded')) !== 'true') await badge.click();
  await mg.page
    .locator('.gm-attention-list .gm-attention-row', { hasText: text })
    .first()
    .getByRole('button', { name: 'Przejdź' })
    .click();
}
