import { expect, test, type Actor, type Engine } from '../../fixtures/actors.ts';
import { creatorWindow, openCreator } from '../../fixtures/creator.ts';
import { KNAJPA } from '../../fixtures/maps.ts';
import { campaignId } from '../../fixtures/nocna-zmiana.ts';
import { fitCamera } from '../../fixtures/scene.ts';
import { DEAD_GATEWAY } from '../../fixtures/security.ts';
import { createInvitation, goToGmAttention } from '../../fixtures/table.ts';
import { reachabilityProblems, survey } from '../../fixtures/uklad.ts';
import {
  activeName,
  clientsSeeTurn,
  closeSheet,
  combatRow,
  nextTurn,
  openSheet,
} from '../../fixtures/walka.ts';
import { hasCheckpoint, restoreCheckpoint, startInstance } from '../../instance/instance.ts';

/**
 * T8a, ekrany (`testy.md` 6.4): walka w „Knajpie” z punktu `po-T4a`, tura Kowala
 * w rundzie 2 — widok MG, widok gracza w swojej turze, wszystkie zakładki panelu,
 * cztery strony karty i kroki kreatora, w nocy i w dzień. Ekrany graczy to
 * 1920 × 1080 i 2560 × 1440 przy 100 % (decyzja MG z 03.10), w obu układach silników.
 *
 * Asercja to osiągalność (B2): każda widoczna kontrolka stoi w oknie albo pokaże
 * ją przewijany przodek. Ucięte napisy, nachodzące obszary i niski kontrast to
 * adnotacje (B3), a zrzuty leżą w `.e2e/pomiary/t8a` do obejrzenia.
 */

const SCREENS = [
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
] as const;
const LAYOUTS: { mg: Engine; gracz: Engine }[] = [
  { mg: 'chromium', gracz: 'firefox' },
  { mg: 'firefox', gracz: 'chromium' },
];
const TABLE_TABS = ['Czat', 'Postacie', 'Walka', 'Kompendium', 'Handouty', 'Dziennik'];
const GM_TABS = ['Sceny', 'Tokeny', 'Boty', 'Zasady', 'Wiedza', 'Losowe', 'Sieć', 'AI', 'Kopie'];

/** Zebrane problemy osiągalności jednego kroku — jedna miękka asercja na koniec. */
class Problems {
  readonly list: string[] = [];
  add(view: string, found: string[]) {
    for (const problem of found) this.list.push(`${view}: ${problem}`);
  }
  expectNone() {
    expect.soft(this.list).toEqual([]);
  }
}

async function sideTab(actor: Actor, label: string) {
  await actor.page
    .locator('.side-tabs button.side-tab', { hasText: new RegExp(`^${label}`) })
    .click();
  await actor.page.waitForTimeout(250);
}

async function setTheme(actor: Actor, theme: 'night' | 'day') {
  const page = actor.page;
  const now = await page.evaluate(() => document.documentElement.dataset.theme);
  if (now === theme) return;
  await page.getByRole('button', { name: /^Ustawienia — kości/ }).click();
  // Okno pamięta ostatnią zakładkę (11.10) — tryb dzienny stoi w „Ogólnych”.
  await page.getByRole('tab', { name: 'Ogólne' }).click();
  const box = page.getByRole('checkbox', { name: /Tryb dzienny/ });
  await (theme === 'day' ? box.check() : box.uncheck());
  await page.getByRole('button', { name: 'Zamknij ustawienia' }).click();
  // Pułapka `ogledziny`: motyw dzienny to `day`, a papier karty idzie za nim —
  // jasny w dzień, ciemny w nocy (bez wartości na sztywno, skórka się zmienia).
  await expect
    .poll(() =>
      page.evaluate(() => {
        const hex = getComputedStyle(document.documentElement)
          .getPropertyValue('--cp-paper')
          .trim();
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
        return { theme: document.documentElement.dataset.theme, light: r! + g! + b! > 1.5 };
      }),
    )
    .toEqual({ theme, light: theme === 'day' });
}

for (const screen of SCREENS) {
  for (const layout of LAYOUTS) {
    const tag = `${screen.width}x${screen.height}-mg-${layout.mg}`;
    test.describe
      .serial(`T8a ekrany ${screen.width} × ${screen.height}: MG ${layout.mg}, gracz ${layout.gracz}`, () => {
      let mg: Actor;
      let marek: Actor;
      let kuba: Actor;
      const shot = (who: Actor, state: string) => `${tag}-${who.name}-${who.engine}-${state}`;

      test.beforeAll(async () => {
        test.skip(!hasCheckpoint('po-T4a'), 'brak punktu po-T4a — najpierw pełny przebieg T3–T4a');
        test.setTimeout(3 * 60_000);
        await restoreCheckpoint('po-T4a');
        await startInstance(DEAD_GATEWAY);
      });

      test.afterAll(async ({ cast }) => {
        await cast.closeAll();
      });

      test('start z po-T4a: MG i Marek przy „Knajpie”, runda 2 od Kowala', async ({ cast }) => {
        test.setTimeout(3 * 60_000);
        cast.viewport = { ...screen };
        mg = await cast.mg(layout.mg);
        marek = await cast.gracz(
          'Marek',
          layout.gracz,
          await createInvitation(mg, campaignId(), 'Marek'),
        );
        for (const actor of [mg, marek]) {
          await expect
            .poll(
              async () =>
                (await actor.store<{ scene: { name: string } | null }>('scene'))?.scene?.name,
            )
            .toBe('Knajpa');
          await fitCamera(actor.page, KNAJPA.width, KNAJPA.height).catch(() => undefined);
        }
        while (combatRow()?.round === 1) await nextTurn(mg);
        expect(activeName()).toBe('Kowal');
        await clientsSeeTurn(marek);
      });

      test('MG: widok walki i wszystkie zakładki panelu', async () => {
        test.setTimeout(3 * 60_000);
        const problems = new Problems();
        problems.add('MG ekran', reachabilityProblems(await survey(mg.page, shot(mg, 'walka'))));
        for (const label of [...TABLE_TABS, ...GM_TABS]) {
          await sideTab(mg, label);
          const report = await survey(mg.page, shot(mg, `panel-${label}`), '.side-panel');
          problems.add(`MG panel ${label}`, reachabilityProblems(report));
        }
        await sideTab(mg, 'Czat');
        problems.expectNone();
      });

      test('Marek: własna tura, pasek akcji, zakładki panelu', async () => {
        test.setTimeout(3 * 60_000);
        const problems = new Problems();
        await expect(marek.page.getByRole('button', { name: 'Kończę turę' })).toBeVisible();
        problems.add(
          'Marek ekran',
          reachabilityProblems(await survey(marek.page, shot(marek, 'tura'))),
        );
        for (const label of TABLE_TABS) {
          await sideTab(marek, label);
          const report = await survey(marek.page, shot(marek, `panel-${label}`), '.side-panel');
          problems.add(`Marek panel ${label}`, reachabilityProblems(report));
        }
        await sideTab(marek, 'Czat');
        problems.expectNone();
      });

      test('karta Kowala u Marka i karta Zbira u MG: wszystkie strony w nocy i w dzień', async () => {
        test.setTimeout(4 * 60_000);
        const problems = new Problems();
        for (const [actor, name] of [
          [marek, 'Kowal'],
          [mg, 'Zbir'],
        ] as const) {
          const region = await openSheet(actor, name);
          const scope = `[role="region"][aria-label="Karta postaci: ${name}"]`;
          for (const theme of ['night', 'day'] as const) {
            await setTheme(actor, theme);
            for (const page of ['Karta', 'Ścieżka Życia', 'Cyborgizacje', 'Ekwipunek']) {
              const tab = region.getByRole('button', { name: page, exact: true });
              if (!(await tab.count())) continue;
              await tab.click();
              await actor.page.waitForTimeout(250);
              const report = await survey(
                actor.page,
                shot(actor, `karta-${name}-${page}-${theme}`),
                scope,
              );
              problems.add(
                `${actor.name} karta ${name} ${page} (${theme})`,
                reachabilityProblems(report),
              );
            }
          }
          await setTheme(actor, 'night');
          await closeSheet(actor.page);
        }
        problems.expectNone();
      });

      test('kreator Kuby (Na skróty): wszystkie kroki w nocy i w dzień', async ({ cast }) => {
        test.setTimeout(4 * 60_000);
        kuba = await cast.gracz(
          'Kuba',
          layout.gracz,
          await createInvitation(mg, campaignId(), 'Kuba'),
        );
        await kuba.page.getByRole('button', { name: 'Postacie', exact: true }).click();
        await kuba.page.getByRole('button', { name: /Poproś MG o stworzenie postaci/ }).click();
        await goToGmAttention(mg, 'Kuba prosi o zgodę na nową postać');
        const row = mg.page.locator('.creation-rank-row', { hasText: 'Kuba' });
        await row.getByLabel('Metoda tworzenia: Kuba').selectOption('edgerunner');
        await row.getByRole('button', { name: 'Zgoda' }).click();
        await expect(row.getByText('zgoda — czeka na gracza')).toBeVisible();

        const problems = new Problems();
        const window = await openCreator(kuba.page);
        await window.getByText('Solo', { exact: true }).click();
        const steps = creatorWindow(kuba.page)
          .getByRole('navigation', { name: 'Kroki kreatora' })
          .getByRole('button');
        const count = await steps.count();
        for (const theme of ['night', 'day'] as const) {
          await setTheme(kuba, theme);
          for (let i = 0; i < count; i += 1) {
            const step = steps.nth(i);
            if (await step.isDisabled()) continue;
            await step.click();
            await kuba.page.waitForTimeout(300);
            const label = ((await step.textContent()) ?? `krok-${i}`).replace(/[^\p{L}\d]+/gu, '-');
            const report = await survey(
              kuba.page,
              shot(kuba, `kreator-${i}-${label}-${theme}`),
              '[role="region"][aria-label="Kreator postaci"]',
            );
            problems.add(`Kuba kreator ${label} (${theme})`, reachabilityProblems(report));
          }
        }
        await setTheme(kuba, 'night');
        problems.expectNone();
      });

      test('konsola bez nowych błędów u MG, Marka i Kuby', () => {
        for (const actor of [mg, marek, kuba].filter(Boolean)) {
          expect.soft(actor.unexpectedErrors(), `${actor.name} (${actor.engine})`).toEqual([]);
        }
      });
    });
  }
}
