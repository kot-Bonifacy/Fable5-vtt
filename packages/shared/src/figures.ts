/**
 * How a figure *reads* on the map (stage 27j).
 *
 * Two questions the renderer keeps asking and must not answer for itself:
 * „which way is this one turned" and „what kind of trouble is it in". Both are
 * pure arithmetic over data the core already carries, and both have to give the
 * same answer on the server (which persists the angle) and in the browser
 * (which draws it), so they live here rather than in `TokenNode`.
 *
 * Nothing in this file knows what Cyberpunk RED is. The wound states arrive as
 * *data* — a status definition may declare which condition it puts a figure in
 * — exactly as the status icons themselves do (stage 05).
 */

import type { ScenePoint } from './measure.js';
import type { StatusDefinition, TokenHp, TokenView } from './tokens.js';

/**
 * Facing in degrees, 0 = up (north), growing clockwise.
 *
 * The convention Foundry's `rotation` uses, and the one a person reading the
 * number out of the database will guess right: 90 is east, 180 is down. Kept in
 * degrees rather than radians because it is a *stored* value — a column, a
 * payload and a tooltip — and only the renderer needs it in radians.
 */
export const FACING_UP = 0;
export const FACING_RIGHT = 90;
export const FACING_DOWN = 180;
export const FACING_LEFT = 270;

/** Folds any angle into [0, 360) and rounds it to a whole degree. */
export function normalizeFacing(degrees: number): number {
  if (!Number.isFinite(degrees)) return FACING_UP;
  const wrapped = Math.round(degrees) % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/**
 * Smallest movement that counts as „turned that way", in scene pixels.
 *
 * A drop half a pixel from where the figure stood is a hand that shook, not a
 * decision, and letting it set the facing would spin sentries at random. Two
 * pixels is well under a step on any grid this project draws.
 */
export const FACING_MIN_TRAVEL_PX = 2;

/**
 * Which way a figure ends up looking after moving (or aiming) by this delta,
 * or null when the delta is too small to mean anything.
 *
 * Scene coordinates grow downwards, so „up" is negative Y — the flip lives here
 * and nowhere else.
 */
export function facingFromDelta(dx: number, dy: number): number | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (Math.hypot(dx, dy) < FACING_MIN_TRAVEL_PX) return null;
  return normalizeFacing((Math.atan2(dx, -dy) * 180) / Math.PI);
}

/**
 * Facing at the end of a walked route: the direction of its last real leg.
 *
 * Measured from the last waypoint far enough back to count rather than from the
 * one before the end — the tail of a route is often a snap onto a square centre,
 * a fraction of a pixel long, and a figure that turned to face *that* would end
 * every march looking somewhere absurd.
 */
export function facingFromPath(points: readonly ScenePoint[]): number | null {
  const end = points[points.length - 1];
  if (!end) return null;
  for (let i = points.length - 2; i >= 0; i--) {
    const from = points[i]!;
    const facing = facingFromDelta(end.x - from.x, end.y - from.y);
    if (facing !== null) return facing;
  }
  return null;
}

/** Validates a facing off the wire; `undefined` = invalid, `null` = „forget it". */
export function sanitizeFacing(raw: unknown): number | null | undefined {
  if (raw === null) return null;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  return normalizeFacing(raw);
}

/**
 * What kind of shape a figure is in, from worst to best.
 *
 * Four states rather than a percentage because the map is answering a question
 * asked across a table — „is he still up?" — and a bar answers it with a length
 * nobody reads at a glance. `dead` and `down` are *facts about the figure*;
 * `wounded` is a warning; `ok` draws nothing extra.
 */
export type TokenCondition = 'ok' | 'wounded' | 'down' | 'dead';

const CONDITION_ORDER: Readonly<Record<TokenCondition, number>> = {
  ok: 0,
  wounded: 1,
  down: 2,
  dead: 3,
};

/**
 * Below this share of maximum HP a figure counts as wounded when nothing on it
 * says otherwise.
 *
 * CP RED's own Seriously Wounded threshold, and the server already keeps the
 * matching status on every token bound to hit points — so this is the fallback
 * for the tokens nobody statted, not the rule. Half, because that is the number
 * the rules use; the core does not know *why*.
 */
export const WOUNDED_HP_RATIO = 0.5;

/**
 * Szczeble paska punktów wytrzymałości — te same, na których stoi pasek PW
 * w panelu postaci (zlecenie MG, 12.09).
 *
 * Do 12.09 mapa miała własną drabinkę (zielone > 50 %, pomarańczowe > 25 %,
 * dalej czerwone), a panel swoją — czterostopniową, wziętą ze stanu ran. Ten
 * sam gracz widział więc na ekranie dwa paski tej samej postaci, w dwóch
 * kolorach i o dwóch znaczeniach. Teraz obie strony pytają o to samo.
 *
 * Progi wychodzą z `WOUNDED_HP_RATIO`, czyli tam, skąd rdzeń już raz je wziął —
 * i dają liczbowo **dokładnie** to, co `woundStateFromHp` w module CP RED
 * (`Math.ceil(max * 0.5)` to `Math.ceil(max / 2)`). Zgodności pilnuje test
 * w `figures.test.ts`; sam rdzeń dalej nie importuje niczego z `systems/cpred`,
 * bo nie wolno mu — i nadal nie wie, *dlaczego* połowa.
 */
export type TokenHpRung = 'healthy' | 'light' | 'serious' | 'mortal';

/** Który szczebel paska PW opisuje ten licznik. */
export function tokenHpRung(hp: Pick<TokenHp, 'current' | 'max'>): TokenHpRung {
  if (hp.current < 1) return 'mortal';
  if (hp.current <= Math.ceil(hp.max * WOUNDED_HP_RATIO)) return 'serious';
  if (hp.current < hp.max) return 'light';
  return 'healthy';
}

/**
 * Ile zostało z PW figury — bez samych liczb (etap 43a).
 *
 * Decyzja MG z 26.09: odsetek ran widzą **wszyscy** przy stole — obrączka na
 * żetonie i czerwień portretu w zakładce „Walka". Świadome odstępstwo od zasady,
 * że PW cudzej figury nie opuszczają serwera, ale tylko do połowy: gracz dostaje
 * ułamek i szczebel, a nie „17/35". Serwer liczy go z prawdziwego licznika
 * (`tokenHpShareOf`), więc drabinka szczebli jest ta sama co u MG.
 */
export interface TokenHpShare {
  /** Zostało PW, 0…1, zaokrąglone do setnych. */
  ratio: number;
  rung: TokenHpRung;
}

/**
 * Ułamek z licznika. Zaokrąglenie nie kłamie w dwie strony, które widać
 * gołym okiem: żywa figura nie spada do 0, a draśnięta nie wraca do pełna.
 */
export function tokenHpShareOf(hp: Pick<TokenHp, 'current' | 'max'>): TokenHpShare {
  const rung = tokenHpRung(hp);
  if (hp.max <= 0 || hp.current <= 0) return { ratio: 0, rung };
  const rounded = Math.round((hp.current / hp.max) * 100) / 100;
  const ceiling = hp.current < hp.max ? 0.99 : 1;
  return { ratio: Math.min(ceiling, Math.max(0.01, rounded)), rung };
}

/**
 * Ułamek dla tego widza: z pełnych PW, gdy je dostał, inaczej z jawnego
 * `hpShare`; `null` — figura bez PW.
 */
export function tokenHpShare(token: {
  hp?: TokenHp | null;
  hpShare?: TokenHpShare | null;
}): TokenHpShare | null {
  if (token.hp && token.hp.max > 0) return tokenHpShareOf(token.hp);
  return token.hpShare ?? null;
}

/** A figure at zero hit points is down whatever else it is wearing. */
function conditionFromHp(
  hp: TokenHp | null | undefined,
  share: TokenHpShare | null | undefined,
): TokenCondition {
  if (hp && hp.max > 0) {
    if (hp.current <= 0) return 'down';
    return hp.current / hp.max < WOUNDED_HP_RATIO ? 'wounded' : 'ok';
  }
  // Widz bez PW: zaokrąglony ułamek wystarcza, bo próg i tak mówi o połowie.
  if (!share) return 'ok';
  if (share.rung === 'mortal') return 'down';
  return share.ratio < WOUNDED_HP_RATIO ? 'wounded' : 'ok';
}

/**
 * The condition a figure is in, taking the worst of what its statuses say and
 * what its hit points say.
 *
 * `conditions` maps status id → condition and comes from the registry the
 * server serves (`data/public/cpred/statuses.json`); a viewer who was not sent
 * the HP simply falls back on the statuses, which everybody gets. That is why a
 * player can see an enemy drop without ever learning its hit points.
 */
export function tokenCondition(
  token: Pick<TokenView, 'statuses'> & { hp?: TokenHp | null; hpShare?: TokenHpShare | null },
  conditions: ReadonlyMap<string, TokenCondition>,
): TokenCondition {
  let worst = conditionFromHp(token.hp, token.hpShare);
  for (const statusId of token.statuses) {
    const condition = conditions.get(statusId);
    if (condition && CONDITION_ORDER[condition] > CONDITION_ORDER[worst]) worst = condition;
  }
  return worst;
}

/**
 * Czy cała drużyna na scenie nie żyje (17.10.2026, zlecenie MG) — warunek
 * planszy „Wszyscy zginęli”.
 *
 * Drużyna to figury z właścicielem-graczem (`ownerId`); NPC-e i towarzysze-boty
 * właściciela nie mają, więc się nie liczą. Scena bez ani jednej takiej figury
 * nie jest pogromem. Martwy znaczy stan `dead` — Nieprzytomny i Śmiertelnie
 * Ranny jeszcze żyją. Pytanie idzie wyłącznie o to, co widz dostał: figury
 * drużyny dzielą wzrok, więc gracz ma je wszystkie, a stany są jawne.
 */
export function partyWiped(
  tokens: Iterable<
    Pick<TokenView, 'ownerId' | 'statuses'> & { hp?: TokenHp | null; hpShare?: TokenHpShare | null }
  >,
  conditions: ReadonlyMap<string, TokenCondition>,
): boolean {
  let party = 0;
  for (const token of tokens) {
    if (token.ownerId === null) continue;
    if (tokenCondition(token, conditions) !== 'dead') return false;
    party += 1;
  }
  return party > 0;
}

/**
 * Status, którego ikonę trzeba dorysować, żeby stan figury był widoczny — albo
 * `null`, gdy któraś z naklejek już go niesie.
 *
 * Od 27j o tym, że figura wypadła z walki, mówi ikona (decyzja MG z 22.08:
 * przekreślony portret zostaje sam trupowi, reszta stanów ma się różnić
 * naklejką). Tylko że `down` bierze się także z samych punktów życia —
 * statysta bez karty schodzi do zera i nie dostaje żadnego statusu — a wtedy
 * na żetonie nie byłoby niczego. Stąd domyślna naklejka: pierwsza w rejestrze,
 * która ten stan opisuje.
 *
 * `ok` i `wounded` nie mają domyślnej naklejki i mieć nie powinny: zdrowa
 * figura niczego nie potrzebuje, a rana ma własny status z mechaniki.
 */
export function fallbackConditionStatusId(
  token: Pick<TokenView, 'statuses'>,
  condition: TokenCondition,
  conditions: ReadonlyMap<string, TokenCondition>,
): string | null {
  if (condition !== 'down' && condition !== 'dead') return null;
  for (const statusId of token.statuses) {
    if (conditions.get(statusId) === condition) return null;
  }
  for (const [statusId, value] of conditions) {
    if (value === condition) return statusId;
  }
  return null;
}

/** Builds the id → condition lookup from the status registry. */
export function conditionRegistry(
  statuses: readonly StatusDefinition[],
): Map<string, TokenCondition> {
  const map = new Map<string, TokenCondition>();
  for (const status of statuses) {
    if (status.condition) map.set(status.id, status.condition);
  }
  return map;
}
