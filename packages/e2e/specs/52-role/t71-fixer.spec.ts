import type { Locator } from '@playwright/test';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { compendiumEntry } from '../../fixtures/kompendium.ts';
import { characterId } from '../../fixtures/nocna-zmiana.ts';
import {
  ROLES,
  cardData,
  lastMessageId,
  messagesAfter,
  seatRole,
  startFromRoleStart,
} from '../../fixtures/role.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { pendingDice, scriptDice } from '../../instance/instance.ts';

/**
 * Etap 71b — Fixer, Znajomości (s. 159–161), stan dzisiejszy. Wiersze macierzy:
 * FIX-01, FIX-02, FIX-03, FIX-08, FIX-15. Targ przy sprzedaży (FIX-04) i reszta
 * targów (FIX-05…07) to ❌/📜 — nie ma czego klikać.
 */

const FIXER = ROLES.fixer;
type Sheet = {
  haggle: { dealId: string; discount: number } | null;
  eddies: number;
  gear: { compendiumId?: string }[];
};
const sheet = () => cardData<Sheet>(FIXER.card);

test.describe.serial('@szybkie T71 Fixer — Znajomości', () => {
  let ewa: Actor;
  let card: Locator;
  const panel = () => card.locator('.cp-role-strip');

  test.beforeAll(async ({ cast }) => {
    await startFromRoleStart();
    ({ player: ewa, card } = await seatRole(cast, 'fixer'));
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('FIX-02 FIX-08 menu targów sięga poziomu Znajomości; Zasięg z rangi', async () => {
    await expect(panel()).toContainText('Znajomości 4');
    await expect(panel()).toContainText(/Zasięg: \S/);
    const deals = panel().getByRole('button', { name: /^Targuj się: / });
    // Targi poziomu 1–2 i 3–4.
    await expect(deals).toHaveCount(2);
    test.info().annotations.push({
      type: 'targi',
      description: (await deals.allTextContents()).join(' | '),
    });
  });

  test('FIX-01 FIX-15 udany targ czeka na karcie; gniazdo go nie dopisze ani nie podmieni', async () => {
    const since = lastMessageId();
    scriptDice([5, 2]);
    await panel()
      .getByRole('button', { name: /^Targuj się: / })
      .first()
      .click();
    await expect(ewa.page.locator('.notice', { hasText: 'Targ dobity' })).toBeVisible({
      timeout: 20_000,
    });
    expect(pendingDice()).toBe('');
    await expect.poll(() => sheet().haggle?.discount ?? 0).toBe(10);
    test.info().annotations.push({
      type: 'czat targu',
      description: JSON.stringify(messagesAfter(since).map((m) => m.text)),
    });
    const forged = await emitAck(await ewa.socket(), 'character:update', {
      characterId: characterId(FIXER.card),
      patch: { data: { haggle: { dealId: 'percent20', discount: 20, note: '' } } },
    });
    expect(forged).toMatchObject({ ok: false });
    expect(sheet().haggle?.dealId).not.toBe('percent20');
  });

  test('FIX-03 najbliższy zakup z Kompendium jest tańszy o 10% i zużywa targ', async () => {
    const eddies = sheet().eddies;
    const entry = await compendiumEntry(ewa, 'Zestaw wytrychów', { prefix: true });
    const buy = entry.getByRole('button', { name: /^Kup — / });
    test
      .info()
      .annotations.push({ type: 'przycisk zakupu', description: (await buy.textContent()) ?? '' });
    await buy.click();
    await expect
      .poll(() => sheet().gear.map((row) => row.compendiumId))
      .toContain('gear.zestaw-wytrychow');
    // Cennik domowy: 20 ed × 3 = 60 ed; targ −10% = 54 ed.
    expect(eddies - sheet().eddies).toBe(54);
    expect(sheet().haggle).toBeNull();
    expect(ewa.unexpectedErrors()).toEqual([]);
  });
});
