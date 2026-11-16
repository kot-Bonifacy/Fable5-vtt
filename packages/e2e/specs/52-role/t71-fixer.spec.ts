import type { Locator } from '@playwright/test';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { compendiumEntry } from '../../fixtures/kompendium.ts';
import { characterId } from '../../fixtures/nocna-zmiana.ts';
import { queryOne } from '../../fixtures/db.ts';
import {
  MERCHANT,
  ROLES,
  cardData,
  gmSocket,
  lastMessageId,
  messagesAfter,
  seatRole,
  startFromRoleStart,
} from '../../fixtures/role.ts';
import { closeSheet } from '../../fixtures/walka.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { pendingDice, scriptDice } from '../../instance/instance.ts';

/**
 * Etap 71b — Fixer, Znajomości (s. 159–161). Wiersze macierzy: FIX-01, FIX-02,
 * FIX-03, FIX-08, FIX-15; od 71e także FIX-05 i FIX-14 (G20, G22): sumę drugiej
 * strony poza sklepem podaje MG, przy ladzie liczy ją serwer z karty
 * handlarza, szósta sztuka gratis w koszyku. Targ procentowy przy sprzedaży
 * (G21) i rata „pół teraz, pół za miesiąc” (G23, Znajomości 7) — test serwera
 * `trade71e.test.ts`.
 */

const FIXER = ROLES.fixer;
type Sheet = {
  haggle: { dealId: string; discount: number; merchantId?: string } | null;
  haggleOpponent: { bonus: number; label: string } | null;
  counterHaggle: { merchantId: string; won: boolean } | null;
  eddies: number;
  gear: { compendiumId?: string; qty?: number }[];
};
const sheet = () => cardData<Sheet>(FIXER.card);
const merchantIdOf = (name: string): string =>
  queryOne<{ id: string }>(
    'SELECT m.id FROM Merchant m JOIN Character c ON c.id = m.characterId WHERE c.name = ?',
    name,
  )!.id;

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

  test('FIX-01 FIX-15 G20 poza sklepem sumę podaje MG; udany targ czeka na karcie', async () => {
    // Bez sumy od MG gracz nie ma przeciw komu rzucać (71b: druga strona „0”).
    await expect(panel()).toContainText('Poza sklepem sumę drugiej strony podaje MG');
    await expect(
      panel()
        .getByRole('button', { name: /^Targuj się: / })
        .first(),
    ).toBeDisabled();
    const gm = await gmSocket();
    expect(
      await emitAck(gm, 'character:haggle', {
        characterId: characterId(FIXER.card),
        opponent: { bonus: 3, label: 'Paser' },
      }),
    ).toMatchObject({ ok: true });
    gm.disconnect();
    await expect(panel()).toContainText('Druga strona: Paser, 3 + 1k10');
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
    // Rzut zużył sumę od MG; targ z MG działa wszędzie (bez lady).
    expect(sheet().haggleOpponent).toBeNull();
    expect(sheet().haggle?.merchantId).toBeUndefined();
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

  test('FIX-01 FIX-14 G20 przy ladzie: druga strona z karty handlarza, jeden rzut do transakcji', async () => {
    await card.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    await ewa.page.getByRole('button', { name: 'Wymiana…' }).click();
    await closeSheet(ewa.page);
    const window = ewa.page.locator('section[aria-label="Wymiana"]');
    await expect(window).toBeVisible();
    const counterpart = window.getByLabel('Druga strona');
    await counterpart.focus();
    const option = counterpart.locator('option', { hasText: MERCHANT }).first();
    await counterpart.selectOption((await option.getAttribute('value'))!);
    await expect(window).toHaveAttribute('data-exchange-mode', 'merchant');

    const haggle = window.getByTestId('counter-haggle');
    await haggle.getByLabel('Targ').selectOption({ label: 'Dziesięć procent' });
    const since = lastMessageId();
    scriptDice([9, 1]);
    await haggle.getByRole('button', { name: 'Targuj się' }).click();
    await expect(window.getByTestId('counter-haggle-result')).toContainText('wygrane');
    expect(pendingDice()).toBe('');
    // Lada 71: CHA 6 + Handel 4, bez Znajomości — liczy serwer, gracz nic nie wpisuje.
    test.info().annotations.push({
      type: 'karta targu przy ladzie',
      description: JSON.stringify(messagesAfter(since).map((m) => m.text)),
    });
    await expect.poll(() => sheet().haggle?.merchantId).toBe(merchantIdOf(MERCHANT));
    // Drugi rzut przy tej samej ladzie — dopiero po transakcji.
    const again = await emitAck(await ewa.socket(), 'character:haggle', {
      characterId: characterId(FIXER.card),
      dealId: 'percent10',
      merchantId: merchantIdOf(MERCHANT),
    });
    expect(again).toEqual({ ok: false, error: 'ALREADY_HAGGLED' });

    // Latarka: 20 ed × 3 (cennik domowy) = 60 ed; targ −10% = 54 ed.
    const shelf = window.locator('.trade-zone', { hasText: `Towar: ${MERCHANT}` });
    await shelf.locator('.item-tile[data-item-name="Latarka"]').dblclick();
    await expect(window.getByTestId('exchange-total')).toContainText('Płacisz 54 ed');
    await expect(window.getByTestId('exchange-total')).toContainText('targ: −6 ed');
    const eddies = sheet().eddies;
    await window.getByRole('button', { name: 'Zapłać' }).click();
    await expect.poll(() => sheet().eddies).toBe(eddies - 54);
    expect(sheet().haggle).toBeNull();
    expect(sheet().counterHaggle).toBeNull();
    // Po transakcji rzut przy ladzie znów czeka.
    await expect(haggle.getByRole('button', { name: 'Targuj się' })).toBeVisible();
  });

  test('FIX-05 G22 szósta sztuka gratis w koszyku sklepu', async () => {
    const window = ewa.page.locator('section[aria-label="Wymiana"]');
    const gm = await gmSocket();
    // Latarki „bez dna” — Lada ma ich pięć, a targ chce sześciu.
    expect(
      await emitAck(gm, 'merchant:row', {
        merchantId: merchantIdOf(MERCHANT),
        list: 'gear',
        rowId: 'r71-latarka',
        overlay: { infinite: true },
      }),
    ).toMatchObject({ ok: true });
    gm.disconnect();
    const haggle = window.getByTestId('counter-haggle');
    await haggle.getByLabel('Targ').selectOption({ label: 'Szósta sztuka gratis' });
    scriptDice([9, 1]);
    await haggle.getByRole('button', { name: 'Targuj się' }).click();
    await expect(window.getByTestId('counter-haggle-result')).toContainText('wygrane');
    const shelf = window.locator('.trade-zone', { hasText: `Towar: ${MERCHANT}` });
    await shelf.locator('.item-tile[data-item-name="Latarka"]').dblclick();
    const basket = window.locator('[data-exchange-drop="basket"]');
    await basket.locator('.item-tile[data-item-name="Latarka"]').click();
    await window.getByLabel('Ile sztuk kupujesz: Latarka').fill('6');
    // 6 × 60 ed, jedna gratis.
    await expect(window.getByTestId('exchange-total')).toContainText('Płacisz 300 ed');
    await expect(window.getByTestId('exchange-total')).toContainText('targ: −60 ed');
    const eddies = sheet().eddies;
    await window.getByRole('button', { name: 'Zapłać' }).click();
    await expect.poll(() => sheet().eddies).toBe(eddies - 300);
    expect(sheet().haggle).toBeNull();
    expect(ewa.unexpectedErrors()).toEqual([]);
  });
});
