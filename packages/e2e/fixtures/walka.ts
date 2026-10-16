import type { Page } from '@playwright/test';
import { expect, test, type Actor } from './actors.ts';
import { worldToClient, type WorldPoint } from './canvas.ts';
import { query, queryOne } from './db.ts';
import { clickOnMap } from './scene.ts';
import { shakeCup } from './table.ts';

/**
 * Walka na aktywnej scenie (T4a, T4b w „Knajpie”, T5 na „Bramie” — `testy.md`
 * 5.2, 5.3): stan walki czytany z bazy,
 * rzut kubkiem z czekaniem na wiersz czatu, tury, celowanie po płótnie
 * i kontrola podsłuchu. Wszystko po nazwach — punkty kontrolne zapisuje każdy
 * pełny przebieg od nowa, więc id się zmieniają.
 */

export type TokenRow = {
  id: string;
  name: string;
  publicName: string | null;
  x: number;
  y: number;
  size: number;
  hidden: number;
  characterId: string | null;
  statuses: string;
};
export type CombatantRow = {
  id: string;
  tokenId: string;
  initiative: number | null;
  order: number;
  turnState: string | null;
};
export type RollJson = {
  total: number;
  actor?: string;
  title?: string;
  breakdown?: { label: string; value: number }[];
  outcome?: { success?: boolean; label?: string };
  attack?: {
    hit?: boolean;
    area?: { targets: { tokenId: string; name: string }[] };
    /** Na kogo czekają obrażenia — Unik przed obrażeniami (03.10). */
    evasionPending?: string[];
    /** Rzut obrażeń za to trafienie (#56). */
    damageRollId?: number;
    system?: {
      dv?: number;
      metres?: number;
      dvSource?: string;
      ammoBefore?: number;
      ammoAfter?: number;
    };
  };
};

/** Aktywna scena — „Knajpa” w T4, „Brama” od aktywacji w T5a. */
export const sceneRow = () =>
  queryOne<{ id: string; gridSizePx: number }>(
    'SELECT id, gridSizePx FROM Scene WHERE active = 1',
  )!;
export const tokens = (): TokenRow[] =>
  query<TokenRow>('SELECT * FROM Token WHERE sceneId = ? ORDER BY createdAt', sceneRow().id);
export const token = (name: string): TokenRow => {
  const row = tokens().find((t) => t.name === name || t.name.startsWith(`${name} `));
  if (!row) throw new Error(`E2E: no token "${name}"`);
  return row;
};
export const statusesOf = (name: string): string[] =>
  JSON.parse(token(name).statuses || '[]') as string[];
export const characterRow = (name: string) =>
  queryOne<{ id: string; data: string }>('SELECT id, data FROM Character WHERE name = ?', name)!;
export const sheet = <T = Record<string, unknown>>(name: string) =>
  JSON.parse(characterRow(name).data) as T;
export const combatants = (): CombatantRow[] =>
  query<CombatantRow>(
    `SELECT c.id, c.tokenId, c.initiative, c."order", c.turnState FROM Combatant c
       JOIN Combat k ON k.id = c.combatId WHERE k.sceneId = ? ORDER BY c."order"`,
    sceneRow().id,
  );
export const combatantOf = (name: string) =>
  combatants().find((c) => c.tokenId === token(name).id)!;
export const combatRow = () =>
  queryOne<{ round: number; activeCombatantId: string | null }>(
    'SELECT round, activeCombatantId FROM Combat WHERE sceneId = ?',
    sceneRow().id,
  );
export const activeName = () => {
  const combat = combatRow();
  const active = combatants().find((c) => c.id === combat?.activeCombatantId);
  return active ? tokens().find((t) => t.id === active.tokenId)?.name : null;
};
export const lastMessageId = () =>
  queryOne<{ id: number }>('SELECT max(id) AS id FROM ChatMessage')?.id ?? 0;
/** Wiadomość czatu nowsza niż `after`, której tekst zawiera `text`. */
export const messageAfter = (after: number, text: string, kind = 'roll') =>
  queryOne<{ id: number; text: string; payload: string | null }>(
    `SELECT id, text, payload FROM ChatMessage WHERE id > ? AND kind = ? AND text LIKE ? ORDER BY id`,
    after,
    kind,
    `%${text}%`,
  );
export const rollById = (id: number): RollJson =>
  JSON.parse(
    queryOne<{ payload: string }>('SELECT payload FROM ChatMessage WHERE id = ?', id)!.payload ??
      '{}',
  ) as RollJson;
export const sumOf = (roll: RollJson) =>
  (roll.breakdown ?? []).reduce((acc, row) => acc + row.value, 0);

/** Środek kratki (kolumna, wiersz). */
export const cellCentre = (cell: number, column: number, row: number): WorldPoint => ({
  x: (column + 0.5) * cell,
  y: (row + 0.5) * cell,
});

/** Karta z listy „Postacie” (MG widzi wszystkie, gracz — swoją). */
export async function openSheet(actor: Actor, name: string) {
  const page = actor.page;
  await page.getByRole('button', { name: 'Postacie', exact: true }).click();
  await page.locator('.side-panel').getByText(name, { exact: true }).first().click();
  const region = page.getByRole('region', { name: `Karta postaci: ${name}` });
  await expect(region).toBeVisible();
  return region;
}

export async function closeSheet(page: Page) {
  await page.getByRole('button', { name: 'Zamknij kartę' }).click();
  await expect(page.getByRole('button', { name: 'Zamknij kartę' })).toHaveCount(0);
}

/**
 * MG bierze figurę z punktu sceny (etap 50b). W trwającej walce klik w figurę
 * inną niż prowadzona już jej nie zaznacza, więc idzie przez menu figury
 * („Prowadź tę figurę”). Pozycji nie ma przed walką i przy figurze już
 * prowadzonej — wtedy menu zamyka klik w tło, a zaznacza zwykły klik.
 */
export async function takeFigure(mg: Actor, point: WorldPoint) {
  const page = mg.page;
  await clickOnMap(page, point, 'right');
  await expect(page.locator('.context-menu')).toBeVisible();
  const item = page.getByRole('button', { name: /Prowadź tę figurę/ });
  if (await item.isVisible()) await item.click();
  else await page.locator('.context-menu-backdrop').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('.context-menu')).toHaveCount(0);
}

const activePanel = (page: Page) =>
  page.getByRole('complementary', { name: 'Panel aktywnej postaci' });

/**
 * Pierwsza broń paska do ręki — klawiszem slotu (`1…9`, z podpowiedzi slotu),
 * jak przy stole. Klawisz, nie klik: okno „Sieć” MG leży w T5b nad lewym panelem.
 */
export async function armFirstWeapon(page: Page) {
  const panel = activePanel(page);
  const slot = panel.locator('.hud-slot').first();
  const key = /\((\d)\)$/.exec((await slot.getAttribute('title')) ?? '')?.[1];
  if (key) await page.keyboard.press(key);
  else await slot.click();
  await expect(panel.getByText(/^W ręku:/)).toBeVisible();
}

/** Zaznacza własną figurę i celuje w punkt sceny (MG celuje z Alt), klik ładuje kubek. */
export async function aim(actor: Actor, from: WorldPoint, target: WorldPoint, alt = false) {
  const page = actor.page;
  if (alt) await takeFigure(actor, from);
  await clickOnMap(page, from);
  await page.waitForTimeout(300);
  // Etap 50b: NPC w turze jest u MG zaznaczony z urzędu, więc klik w niego już
  // nie uzbraja na nowo — broń opuszczoną `Esc` bierze się slotem, jak przy stole.
  if (
    alt &&
    !(await activePanel(page)
      .getByText(/^W ręku:/)
      .isVisible())
  ) {
    await armFirstWeapon(page);
  }
  if (alt) await page.keyboard.down('Alt');
  await clickOnMap(page, target);
  if (alt) await page.keyboard.up('Alt');
  await page.waitForTimeout(300);
}

/** Kubek załadowany przyciskiem (inicjatywa, wezwanie) albo celownikiem — rzut gestem. */
export async function rollAndWait(actor: Actor, after: number, text: string): Promise<number> {
  await shakeCup(actor.page);
  await expect
    .poll(() => messageAfter(after, text)?.id ?? 0, { timeout: 20_000, message: text })
    .toBeGreaterThan(0);
  return messageAfter(after, text)!.id;
}

export async function endPlayerTurn(actor: Actor) {
  const before = activeName();
  await actor.page.getByRole('button', { name: 'Kończę turę' }).click();
  await expect.poll(activeName).not.toBe(before);
}

export async function nextTurn(mg: Actor) {
  const before = combatRow()?.activeCombatantId;
  // Od 16.10 na dole lewego panelu, nie na pasie inicjatywy.
  await mg.page.getByRole('button', { name: 'Następna tura', exact: true }).click();
  await expect.poll(() => combatRow()?.activeCombatantId).not.toBe(before);
  // Marsz rozkazany, zanim klient MG dostanie nową turę, przerywa „Zmiana tury”.
  const now = combatRow()?.activeCombatantId;
  await expect
    .poll(
      async () =>
        (await mg.store<{ combat: { activeCombatantId: string | null } | null }>('combat'))?.combat
          ?.activeCombatantId,
      // Klient czeka z nową turą na koniec animacji kości (Tura Demona rzuca kilka razy).
      { timeout: 30_000 },
    )
    .toBe(now);
}

/** Inicjatywy na czarnym pasie (od lewej). */
export async function chipInitiatives(actor: Actor): Promise<string[]> {
  return actor.page
    .getByRole('group', { name: 'Kolejka inicjatywy' })
    .locator('.combat-chip-initiative')
    .allTextContents();
}

/** Nazwy uczestników tak, jak rysuje je czarny pas kolejki (od lewej). */
export async function queueOf(actor: Actor): Promise<string[]> {
  return actor.page
    .getByRole('group', { name: 'Kolejka inicjatywy' })
    .locator('.combat-chip-name')
    .allTextContents();
}

/**
 * Żaden z kodów nie dotarł do gracza; wyciek zostawia w raporcie wycinek ramki
 * albo odpowiedzi HTTP, którą przyszedł — dowód do rejestru.
 */
export async function expectClean(player: Actor, codes: string[], since = 0) {
  const leaked = await player.sniffer.found(codes, since);
  for (const code of leaked) {
    test.info().annotations.push({
      type: `wyciek u ${player.name}`,
      description: `${code} … ${await player.sniffer.evidence(code, since)}`,
    });
  }
  expect(leaked, player.name).toEqual([]);
}

/**
 * Ostatnia karta obrażeń (`kind = 'damage'`) w magazynie czatu gracza: ile
 * straciła figura i czy przyszły liczby PW. Cudze PW nie opuszczają serwera.
 */
export async function lastDamageCardOf(
  player: Actor,
  targetName: string,
): Promise<[unknown, boolean] | null> {
  const chat = await player.store<{
    items: { message?: { kind: string; text: string; damage?: Record<string, unknown> } }[];
  }>('chat');
  const card = chat?.items
    .filter((i) => i.message?.kind === 'damage' && i.message.text.startsWith(targetName))
    .pop()?.message?.damage;
  return card ? [card.hpLost, 'hp' in card] : null;
}

/**
 * Kamera bliżej punktu sceny (kółko myszy trzyma punkt pod kursorem). Przy całej
 * „Knajpie” na ekranie dwie sąsiednie figury zlewają się i klik łapie nie tę.
 */
export async function zoomAt(page: Page, point: WorldPoint, steps = 3): Promise<void> {
  for (let step = 0; step < steps; step += 1) {
    const at = await worldToClient(page, point);
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(250);
  }
}

/**
 * Karty czatu z tym tytułem — z rozróżnieniem wielkości liter: `hasText` z napisem
 * łapie „Bardzo ciężki pistolet — obrażenia” przy szukaniu „Ciężki pistolet — …”.
 */
export function chatCards(page: Page, title: string) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page.locator('.chat-message', { hasText: new RegExp(escaped) });
}

/** Czy kubek tej strony trzyma albo woła rzut obrażeń (tytuł kubka z „— obrażenia"). */
export async function cupHoldsDamage(page: Page): Promise<boolean> {
  return /— obrażenia/.test((await page.locator('.dice-cup').getAttribute('title')) ?? '');
}

/**
 * Obrażenia za kartę ataku do kubka (14.10, MG): kubek tego, kto prowadzi
 * strzelca, woła o nie sam; każdy inny uprawniony bierze je guzikiem „Na kubek”
 * z karty. Zwraca drogę, którą poszły — po niej #38 sprawdza, kto prowadzi.
 */
export async function damageToCup(page: Page, attackTitle: string): Promise<'cup' | 'button'> {
  const toCup = chatCards(page, attackTitle).last().getByRole('button', { name: 'Na kubek' });
  let via: 'cup' | 'button' | null = null;
  await expect
    .poll(
      async () => {
        via = (await cupHoldsDamage(page)) ? 'cup' : (await toCup.count()) > 0 ? 'button' : null;
        return via;
      },
      { timeout: 20_000, message: `obrażenia do kubka: ${attackTitle}` },
    )
    .not.toBeNull();
  if (via === 'button') await toCup.click();
  await expect.poll(() => cupHoldsDamage(page)).toBe(true);
  return via!;
}

/**
 * Karta, która pojawiła się po `seen` kartach o tym tytule. Klient wstrzymuje nową
 * kartę do końca animacji kości, a do tej chwili „ostatnia” to stara karta — jej
 * „Zastosuj” działa drugi raz (#26).
 */
export async function freshCard(page: Page, title: string, seen: number) {
  const cards = chatCards(page, title);
  await expect.poll(() => cards.count(), { timeout: 30_000, message: title }).toBeGreaterThan(seen);
  return cards.nth(seen);
}

/**
 * „Bez uniku” za każdego, na kogo czekają obrażenia tej karty ataku (03.10, decyzja
 * MG po T8b: Unik przed obrażeniami). Kto czeka, mówi baza; klika MG przez UI — za
 * figury bez gracza i tak odpowiada on, a scenariusz uników nie gra. Karta bez
 * oczekujących (cel bez REF 8+, figura bez karty) przechodzi bez kliknięcia.
 */
export async function noDodge(mg: Actor, attackId: number, title: string): Promise<void> {
  const pending = () => rollById(attackId).attack?.evasionPending ?? [];
  if (pending().length === 0) return;
  test
    .info()
    .annotations.push({ type: 'bez uniku', description: `${title}: ${pending().join(', ')}` });
  await mg.page.getByRole('button', { name: /^Czat/ }).first().click();
  const card = chatCards(mg.page, title).last();
  while (pending().length > 0) {
    const left = pending().length;
    await card.getByRole('button', { name: 'Bez uniku' }).first().click();
    await expect
      .poll(() => pending().length, { message: `bez uniku: ${title}` })
      .toBeLessThan(left);
  }
}

/**
 * Obrażenia za kartę ataku rozliczają się same (03.10) — MG nie ma już czego
 * „Zastosować”, a panel znika z jego karty, gdy dojdzie wpis rozliczenia.
 */
export async function settledWithoutApply(mg: Actor, damageCardTitle: string): Promise<void> {
  await expect(
    chatCards(mg.page, damageCardTitle).last().getByRole('button', { name: 'Zastosuj' }),
  ).toHaveCount(0);
}

/**
 * Klienci widzą tę samą turę co baza — zanim któryś z nich rozkaże marsz. Zmiana
 * tury czeka u klienta na koniec animacji kości poprzedniej tury (Tura Demona
 * rzuca kilka razy), więc limit jest jak dla karty rzutu.
 */
export async function clientsSeeTurn(...actors: Actor[]): Promise<void> {
  const now = combatRow()?.activeCombatantId;
  for (const actor of actors) {
    await expect
      .poll(
        async () =>
          (await actor.store<{ combat: { activeCombatantId: string | null } | null }>('combat'))
            ?.combat?.activeCombatantId,
        { message: actor.name, timeout: 30_000 },
      )
      .toBe(now);
  }
}

/**
 * „⚔ Rozpocznij walkę” na pasie inicjatywy (etap 50a, dawniej ▶ „Start”). Bez NPC-a
 * w kolejce pierwszy klik tylko ostrzega — wtedy drugi zaczyna rundę 1.
 */
export async function beginFight(page: Page) {
  await page.getByRole('button', { name: /Rozpocznij walkę/ }).click();
  const warned = page.getByRole('button', { name: /Brak NPC-ów/ });
  const armed = await warned
    .waitFor({ timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  if (armed) await warned.click();
}
