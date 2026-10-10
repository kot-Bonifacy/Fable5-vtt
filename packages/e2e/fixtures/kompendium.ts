import type { Locator } from '@playwright/test';
import { expect, type Actor } from './actors.ts';

/**
 * Kompendium z panelu bocznego: karta wpisu i amunicja z kalibrem (etap 46c).
 * Wspólne dla T4b, T5a, T6a i `t46c-amunicja` — pudełka naboi rozdaje MG
 * przyciskiem „Dodaj za darmo”, gracz kupuje je „Kup”.
 */

/** Znaczki za nazwą wiersza: „własny”, „?” (dane niepełne), poziom sklepu („Wojskowe”). */
const ROW_TAGS = String.raw`(?:własny|\?|\p{Lu}\p{Ll}+)*`;

/**
 * Karta wpisu: szukanie po nazwie, po kategoriach, klik w wiersz. Domyślnie nazwa
 * dokładna („Amunicja zwykła” nie łapie „Amunicja zwykła (granaty i rakiety)”, „Granat”
 * nie łapie „Granatnik”),
 * `prefix` bierze pierwszy wpis zaczynający się od nazwy.
 */
export async function compendiumEntry(
  actor: Actor,
  name: string,
  { prefix = false }: { prefix?: boolean } = {},
): Promise<Locator> {
  const page = actor.page;
  await page.getByRole('button', { name: 'Kompendium', exact: true }).click();
  const panel = page.locator('.compendium-panel');
  const back = panel.getByRole('button', { name: '← Lista' });
  if (await back.isVisible().catch(() => false)) await back.click();
  await panel.getByPlaceholder('Szukaj przedmiotu…').fill(name);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Wyszukiwanie działa w obrębie kategorii — przechodzi się po nich, aż wpis wyskoczy.
  const row = panel.locator('.compendium-row', {
    has: page.locator('.compendium-row-name', {
      // Po nazwie stoją znaczki wiersza: „własny”, „?” i poziom sklepu ponad kampanią
      // („Wojskowe”) — dokładna nazwa dopuszcza je, ale nie dłuższą nazwę.
      hasText: prefix ? new RegExp(`^${escaped}`) : new RegExp(`^${escaped}${ROW_TAGS}$`, 'u'),
    }),
  });
  // Lista przerysowuje się po kliknięciu kategorii — samo `isVisible()` zaraz po
  // kliknięciu bywa za wczesne i pętla przeskakuje właściwą kategorię (46c2).
  const shown = (timeout: number) =>
    row
      .first()
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);
  if (!(await shown(500))) {
    for (const category of await panel.locator('.compendium-category').all()) {
      await category.click();
      if (await shown(1_500)) break;
    }
  }
  await row.first().click();
  const entry = panel.locator('.compendium-card');
  await expect(entry).toBeVisible();
  return entry;
}

/** Wybór kalibru po początku etykiety („B.C. Pistolet — …”). */
export async function pickCalibre(select: Locator, calibre: string): Promise<void> {
  const escaped = calibre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const option = select.locator('option', { hasText: new RegExp(`^${escaped}`) });
  await select.selectOption((await option.first().getAttribute('value'))!);
}

/**
 * MG daje postaci pudełko amunicji „Dodaj za darmo”: wpis, kaliber i liczba paczek
 * (paczka z podręcznika: 10 kul, 1 granat — s. 344).
 */
export async function giveAmmo(
  gm: Actor,
  character: string,
  ammo: { entry: string; calibre: string; packs: number },
): Promise<void> {
  const entry = await compendiumEntry(gm, ammo.entry);
  await entry
    .locator('select', {
      has: gm.page.locator('option', { hasText: new RegExp(`^${character}$`) }),
    })
    .selectOption({ label: character });
  await pickCalibre(entry.getByLabel('Kaliber'), ammo.calibre);
  await entry.getByLabel('Liczba paczek').fill(String(ammo.packs));
  await entry.getByRole('button', { name: 'Dodaj za darmo' }).click();
}

/**
 * MG daje postaci wpis „Dodaj za darmo” — broń, pancerz, sprzęt albo chrom (ten
 * ostatni z rzutem na Utratę Człowieczeństwa na serwerze). Pakiet Roli
 * Krawędziarza i chrom z wyposażenia Roli (etap 47b) idą tą drogą.
 */
export async function giveEntry(gm: Actor, character: string, name: string): Promise<void> {
  const entry = await compendiumEntry(gm, name);
  // Pierwszy `select` karty wpisu u MG to poziom sklepu — odbiorca stoi w `.compendium-assign`.
  await entry.locator('.compendium-assign select').first().selectOption({ label: character });
  await entry.getByRole('button', { name: 'Dodaj za darmo' }).click();
}
