/**
 * Tryb skradania figury gracza (etap 61, zlecenie MG z 28.10) — część rdzenia.
 *
 * Rdzeń wie tylko tyle: figura się skrada, ma próg, który musi przebić
 * patrzący, i listę figur, które już patrzyły. Że próg to wynik Testu
 * Skradania, a patrzy się Percepcją, wie warstwa systemu
 * (`systems/cpred/sneak.ts`) — tak samo, jak przy ukrytej figurze MG (58d).
 *
 * Kto zauważy, kończy tryb (decyzja MG 5), więc lista zauważających nie
 * istnieje: dopóki tryb trwa, nikt skradającego się nie zauważył.
 */

/**
 * Stan z kolumny `Token.sneak`. `dv` — próg Percepcji (remis wygrywa
 * skradający się), `modifier` — modyfikator sytuacyjny MG z chwili zgody (już
 * w `dv`, trzymany dla wiersza MG), `tried` — figury, które już rzucały i nie
 * zauważyły.
 */
export interface TokenSneak {
  dv: number;
  modifier: number;
  tried: string[];
}

/** Stan z kolumny `Token.sneak`; `null` — figura się nie skrada (też zepsuta kolumna). */
export function readTokenSneak(raw: string | null | undefined): TokenSneak | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const value = parsed as { dv?: unknown; modifier?: unknown; tried?: unknown };
    if (typeof value.dv !== 'number' || !Number.isFinite(value.dv)) return null;
    return {
      dv: Math.round(value.dv),
      modifier:
        typeof value.modifier === 'number' && Number.isFinite(value.modifier)
          ? Math.round(value.modifier)
          : 0,
      tried: Array.isArray(value.tried)
        ? value.tried.filter((id): id is string => typeof id === 'string')
        : [],
    };
  } catch {
    return null;
  }
}

export function writeTokenSneak(sneak: TokenSneak): string {
  return JSON.stringify({
    dv: sneak.dv,
    modifier: sneak.modifier,
    tried: [...new Set(sneak.tried)],
  });
}

/** Czy ta figura już patrzyła na skradającego się (i go nie zauważyła). */
export function sneakTriedBy(sneak: TokenSneak, observerId: string): boolean {
  return sneak.tried.includes(observerId);
}

/** Co skończyło tryb — zdanie dla gracza i wiersz MG. */
export type SneakEndReason = 'noticed' | 'player' | 'gm' | 'attack' | 'run' | 'scene';

/** Pasek u właściciela figury: „Zauważono cię — Vex przestaje się skradać.” */
export function sneakEndedText(reason: SneakEndReason, name: string): string {
  switch (reason) {
    case 'noticed':
      return `Zauważono cię — ${name} przestaje się skradać.`;
    case 'player':
      return `${name} przestaje się skradać.`;
    case 'gm':
      return `MG przerywa skradanie: ${name}.`;
    case 'attack':
      return `Atak zdradza ${name} — koniec skradania.`;
    case 'run':
      return `Bieg zdradza ${name} — koniec skradania.`;
    case 'scene':
      return `Zmiana sceny — ${name} przestaje się skradać.`;
  }
}

/** Client → server: `sneak:request` — gracz prosi MG o wejście w tryb. */
export interface SneakRequestPayload {
  tokenId: string;
}

/** Client → server: `sneak:stop` — gracz albo MG kończy tryb. */
export interface SneakStopPayload {
  tokenId: string;
}

/** Server → właściciel figury: `sneak:ended` — tryb się skończył nie jego ręką. */
export interface SneakEndedBroadcast {
  sceneId: string;
  tokenId: string;
  text: string;
}

/** Server → MG: `sneak:noticed` — Neutralny NPC zauważył skradającego się (decyzja MG 7). */
export interface SneakNoticedBroadcast {
  sceneId: string;
  observerId: string;
  sneakerId: string;
  text: string;
}
