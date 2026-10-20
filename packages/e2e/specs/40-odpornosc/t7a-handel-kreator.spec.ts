import type { BrowserContext } from '@playwright/test';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { creatorWindow, openCreator } from '../../fixtures/creator.ts';
import { query, queryOne, stateFingerprint } from '../../fixtures/db.ts';
import { KNAJPA } from '../../fixtures/maps.ts';
import { connectionStatus, expectReconnected, Network } from '../../fixtures/network.ts';
import { userId } from '../../fixtures/nocna-zmiana.ts';
import { clickOnMap, fitCamera, tokenCentre, walkOnMap } from '../../fixtures/scene.ts';
import { DEAD_GATEWAY } from '../../fixtures/security.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { createInvitation, shakeCup } from '../../fixtures/table.ts';
import { cellCentre, characterRow, sceneRow, sheet, token } from '../../fixtures/walka.ts';
import {
  pendingDice,
  restoreCheckpoint,
  scriptDice,
  startInstance,
  startServer,
  stopServer,
} from '../../instance/instance.ts';

/**
 * T7a, część 2 (`testy.md` 6.3): od punktu `po-T6a` (po walkach, „Knajpa”, bez
 * trybu turowego) — Ola offline 30 s w środku handlu z Markiem, potem nowy gracz
 * Kuba w kreatorze i zabicie serwera między rzutami Cech. Gateway martwy.
 *
 * Wagi jak w części 1 (decyzja MG z 01.10).
 */

type Card = { eddies: number; gear: { name: string }[] };

test.describe.serial('T7a odporność: handel bez sieci i restart w kreatorze @odpornosc', () => {
  let mg: Actor;
  let marek: Actor;
  let ola: Actor;
  let kuba: Actor;
  let cell: number;
  let campaignId: string;
  const net = new Map<Actor, Network>();
  // Etap 46a: jedno okno „Wymiana” — handel to jego tryb `trade`.
  const tradeWindow = (actor: Actor) =>
    actor.page.locator('section[aria-label="Wymiana"][data-exchange-mode="trade"]');
  const dock = (actor: Actor) => actor.page.locator('.trade-dock');
  const at = (name: string) => [Math.round(token(name).x / cell), Math.round(token(name).y / cell)];
  const rolledStats = () =>
    creatorWindow(kuba.page)
      .getByText(/^rzut \d+$/)
      .count();
  const draftOf = (name: string) =>
    queryOne<{ id: string; revision: number; data: string; updatedAt: number }>(
      `SELECT d.id, d.revision, d.data, d.updatedAt FROM CharacterDraft d JOIN User u ON u.id = d.userId
         WHERE u.name = ?`,
      name,
    );

  test.beforeAll(async () => {
    test.setTimeout(3 * 60_000);
    await restoreCheckpoint('po-T6a');
    await startInstance(DEAD_GATEWAY);
    cell = sceneRow().gridSizePx;
    campaignId = queryOne<{ id: string }>(
      `SELECT id FROM Campaign WHERE name = 'Nocna zmiana'`,
    )!.id;
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('start z po-T6a: Marek i Ola przez pośrednika gniazda, Kowal podchodzi do Iskry', async ({
    cast,
  }) => {
    test.setTimeout(3 * 60_000);
    let network: Network | undefined;
    const prepare = async (context: BrowserContext) => {
      network = await Network.install(context);
    };
    mg = await cast.mg('chromium');
    marek = await cast.gracz(
      'Marek',
      'chromium',
      await createInvitation(mg, campaignId, 'Marek'),
      prepare,
    );
    net.set(marek, network!);
    ola = await cast.gracz(
      'Ola',
      'firefox',
      await createInvitation(mg, campaignId, 'Ola'),
      prepare,
    );
    net.set(ola, network!);
    for (const actor of [mg, marek, ola]) {
      await expect
        .poll(
          async () => (await actor.store<{ scene: { name: string } | null }>('scene'))?.scene?.name,
        )
        .toBe('Knajpa');
      await fitCamera(actor.page, KNAJPA.width, KNAJPA.height).catch(() => undefined);
    }
    // Koniec T6a zostawia Kowala przy barze — do handlu trzeba stanąć obok Iskry (8, 9).
    await marek.page.keyboard.press('Escape');
    await clickOnMap(marek.page, tokenCentre(token('Kowal'), cell));
    await marek.page.waitForTimeout(300);
    await walkOnMap(marek.page, cellCentre(cell, 8, 8));
    await expect.poll(() => at('Kowal'), { timeout: 30_000 }).toEqual([8, 8]);
    await marek.page.keyboard.press('Escape');
  });

  test('7.2 Ola offline 30 s w środku handlu: oferta Marka czeka, wymiana po powrocie bez F5', async () => {
    test.setTimeout(4 * 60_000);
    const before = { kowal: sheet<Card>('Kowal'), iskra: sheet<Card>('Iskra') };
    const picks = 'Zestaw wytrychów';
    expect(before.kowal.gear.map((g) => g.name)).toContain(picks);

    // Zaproszenie z karty Kowala („Wymiana…”), przyjęcie z doku Oli — jak 6.1 w T6a.
    await marek.page.getByRole('button', { name: 'Postacie', exact: true }).click();
    await marek.page.locator('.side-panel').getByText('Kowal', { exact: true }).first().click();
    await marek.page.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    await marek.page.getByRole('button', { name: 'Wymiana…' }).click();
    await marek.page.getByRole('button', { name: 'Zamknij kartę' }).click();
    // Wybór drugiej strony od razu zaprasza (etap 46a).
    const partner = marek.page.getByLabel('Druga strona');
    const iskra = partner.locator('option', { hasText: '🤝 Iskra' });
    await expect(iskra).not.toHaveAttribute('disabled');
    await partner.selectOption((await iskra.getAttribute('value'))!);
    await dock(ola).getByRole('button', { name: 'Przyjmij' }).click();
    for (const actor of [marek, ola]) {
      // Okno otwiera się samo chwilę po „Przyjmij” albo czeka na „Otwórz” w doku —
      // migawka `isVisible()` łapała Olę w pół drogi i test czekał 4 min na
      // przycisk, którego już nie było (01.10). Najpierw jedno albo drugie.
      const open = dock(actor).getByRole('button', { name: 'Otwórz' });
      await expect(tradeWindow(actor).or(open).first()).toBeVisible();
      if (!(await tradeWindow(actor).isVisible())) {
        await open.click({ timeout: 5_000 }).catch(() => undefined);
      }
      await expect(tradeWindow(actor)).toBeVisible();
    }
    const olaMoney = tradeWindow(ola).getByLabel('Ile eurodolców w polu wymiany');
    await olaMoney.fill('100');
    await olaMoney.press('Enter');
    await expect(tradeWindow(marek)).toContainText('100 ed');

    // Ola wypada z sieci; Marek kładzie wytrychy i się zgadza.
    const ola$ = net.get(ola)!;
    await ola$.goOffline();
    const offlineAt = Date.now();
    await expect(connectionStatus(ola)).toContainText('Rozłączono', { timeout: 10_000 });
    await tradeWindow(marek)
      .getByRole('button', { name: `Połóż w polu wymiany: ${picks}` })
      .click();
    await tradeWindow(marek).getByRole('button', { name: 'Zgadzam się' }).click();
    await expect(tradeWindow(marek).locator('.trade-zone--mine')).toContainText('✔ zgoda');
    const shot = await marek.page.screenshot();
    await test
      .info()
      .attach('Marek czeka na Olę offline', { body: shot, contentType: 'image/png' });
    // Okno Oli offline: czy da się kliknąć „Zgadzam się” bez sieci — i co z tym robi klient.
    test.info().annotations.push({
      type: 'okno handlu Oli offline',
      description: (await tradeWindow(ola).innerText()).replace(/\s+/g, ' ').slice(0, 400),
    });

    await ola.page.waitForTimeout(Math.max(0, 30_000 - (Date.now() - offlineAt)));
    await expect(connectionStatus(ola)).toContainText('Rozłączono');
    await ola$.goOnline();
    await expectReconnected(ola);

    // Bez F5: okno handlu Oli pokazuje wytrychy i zgodę Marka.
    if (
      !(await tradeWindow(ola)
        .isVisible()
        .catch(() => false))
    ) {
      test.info().annotations.push({
        type: 'okno handlu Oli po powrocie',
        description: 'zamknięte — otwarte z doku',
      });
      await dock(ola).getByRole('button', { name: 'Otwórz' }).click();
    }
    await expect(tradeWindow(ola)).toContainText(picks, { timeout: 15_000 });
    await expect(tradeWindow(ola).locator('.trade-zone', { hasText: 'Kowal' })).toContainText(
      '✔ zgoda',
    );
    // Własna kwota Oli stoi w polu (`input`), nie w tekście okna.
    await expect(tradeWindow(ola).getByLabel('Ile eurodolców w polu wymiany')).toHaveValue('100');
    await expect(tradeWindow(marek)).toContainText('100 ed');
    expect(sheet<Card>('Kowal').eddies, 'nic się nie ruszyło przed drugą zgodą').toBe(
      before.kowal.eddies,
    );

    await tradeWindow(ola).getByRole('button', { name: 'Zgadzam się' }).click();
    await expect.poll(() => sheet<Card>('Iskra').gear.map((g) => g.name)).toContain(picks);
    expect(sheet<Card>('Kowal').gear.map((g) => g.name)).not.toContain(picks);
    expect(sheet<Card>('Kowal').eddies).toBe(before.kowal.eddies + 100);
    expect(sheet<Card>('Iskra').eddies).toBe(before.iskra.eddies - 100);
    await expect(tradeWindow(marek)).toHaveCount(0);
    await expect(tradeWindow(ola)).toHaveCount(0);
  });

  test('7.3 restart serwera w kreatorze: Kuba nie traci szkicu ani rzuconych Cech', async ({
    cast,
  }) => {
    test.setTimeout(6 * 60_000);
    kuba = await cast.gracz('Kuba', 'firefox', await createInvitation(mg, campaignId, 'Kuba'));
    await kuba.page.getByRole('button', { name: 'Postacie', exact: true }).click();
    await kuba.page.getByRole('button', { name: /Poproś MG o stworzenie postaci/ }).click();
    await expect(kuba.page.getByText(/Prośba wysłana — czekasz na zgodę MG/)).toBeVisible();
    expect(
      await emitAck(await mg.socket(), 'creation:permit', {
        userId: userId('Kuba'),
        grant: true,
        terms: { method: 'edgerunner', statRankId: 'starting', skillPoints: 86 },
      }),
    ).toMatchObject({ ok: true });

    const window = await openCreator(kuba.page);
    await window.getByText('Nomada', { exact: true }).click();
    await creatorWindow(kuba.page)
      .getByRole('navigation', { name: 'Kroki kreatora' })
      .getByRole('button', { name: /Cechy/ })
      .click();
    scriptDice([7, 6, 5, 8]);
    await window.getByRole('button', { name: '🥤 Weź kubek', exact: true }).click();
    for (let rolled = 0; rolled < 3; rolled += 1) {
      await shakeCup(kuba.page);
      await expect.poll(rolledStats, { timeout: 25_000 }).toBeGreaterThan(rolled);
    }
    await expect.poll(() => draftOf('Kuba')?.data ?? '').toContain('nomad');
    const draft = draftOf('Kuba')!;
    test
      .info()
      .annotations.push({ type: 'szkic Kuby przed padem', description: draft.data.slice(0, 600) });

    await stopServer();
    const saved = stateFingerprint();
    await expect(connectionStatus(kuba)).toContainText('Rozłączono', { timeout: 15_000 });
    await startServer(DEAD_GATEWAY);
    expect(stateFingerprint()).toEqual(saved);
    await expectReconnected(kuba, 45_000);
    await expectReconnected(mg, 45_000);

    // Kreator dalej otwarty z tym samym szkicem: rola, trzy Cechy, kubek bierze czwartą.
    await expect(creatorWindow(kuba.page)).toBeVisible();
    await expect.poll(rolledStats).toBe(3);
    expect(draftOf('Kuba')).toEqual(draft);
    const loaded = await creatorWindow(kuba.page)
      .getByRole('button', { name: '🥤 Weź kubek', exact: true })
      .isVisible()
      .catch(() => false);
    if (loaded) {
      await creatorWindow(kuba.page)
        .getByRole('button', { name: '🥤 Weź kubek', exact: true })
        .click();
    }
    test.info().annotations.push({
      type: 'kubek po restarcie',
      description: loaded ? 'trzeba wziąć kubek jeszcze raz' : 'kubek został załadowany',
    });
    await shakeCup(kuba.page);
    await expect.poll(rolledStats, { timeout: 25_000 }).toBe(4);
    expect(pendingDice()).toBe('');
    const rolls = query<{ text: string }>(
      `SELECT text FROM ChatMessage WHERE campaignId = ? AND kind = 'roll' AND text LIKE '%— Nomada'`,
      campaignId,
    );
    expect(rolls, 'cztery rzuty Cech, żaden podwójny po restarcie').toHaveLength(4);
    expect(characterRow('Kowal')).toBeTruthy();
  });
});
