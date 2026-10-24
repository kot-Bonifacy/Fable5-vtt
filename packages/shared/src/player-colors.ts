/**
 * Kolor gracza (etap 60c) — tożsamość przy stole, wspólna dla wszystkich ekranów.
 *
 * Kolor należy do gracza, nie do postaci (decyzja MG z 24.10): gracz z dwiema
 * postaciami ma jeden. Paleta to **nazwy**, nie wartości — barwę każdej nazwy
 * podaje motyw (`--player-<nazwa>` w `client/src/theme.css`), osobno w nocy
 * i w dzień, bo jeden odcień nie trzyma kontrastu 3:1 jednocześnie na czarnym
 * kartonie i na pożółkłym papierze. Kolejność palety jest dobrana tak, żeby
 * sąsiednie pary (także ósmy z pierwszym) rozróżniał wzrok z deuteranopią
 * i protanopią — pilnuje tego `client/src/player-palette.test.ts`.
 */

export const PLAYER_COLORS = [
  'sky',
  'vermilion',
  'sea',
  'pink',
  'lemon',
  'lavender',
  'lime',
  'cornflower',
] as const;

export type PlayerColor = (typeof PLAYER_COLORS)[number];

/** Kolor MG — stały, spoza palety (bursztyn ostrzeżeń motywu). */
export const GM_AUTHOR_COLOR = 'gm';

/** To, co niesie karta czatu: kolor gracza albo MG. */
export type ChatAuthorColor = PlayerColor | typeof GM_AUTHOR_COLOR;

export const PLAYER_COLOR_LABELS: Record<PlayerColor, string> = {
  sky: 'błękit',
  vermilion: 'cynober',
  sea: 'morska zieleń',
  pink: 'róż',
  lemon: 'cytryna',
  lavender: 'lawenda',
  lime: 'limonka',
  cornflower: 'chaber',
};

export function isPlayerColor(value: unknown): value is PlayerColor {
  return typeof value === 'string' && (PLAYER_COLORS as readonly string[]).includes(value);
}

export interface PlayerColorMember {
  userId: string;
  /** Kolor wybrany przez MG; `null` (albo nieznana nazwa) — z palety. */
  color?: string | null;
  joinedAt: string | Date;
}

/**
 * Kolor każdego członka kampanii. Wybrany przez MG wygrywa; reszta bierze
 * kolor z palety według kolejności dołączenia (dziewiąty gracz zaczyna paletę
 * od nowa). Wybór MG nie przesuwa nikogo innego — tylko jego pozycja w palecie
 * stoi pusta albo się powtarza, co MG widzi w „Graczach”.
 */
export function playerColors(members: readonly PlayerColorMember[]): Map<string, PlayerColor> {
  const ordered = [...members].sort(
    (a, b) =>
      new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime() ||
      a.userId.localeCompare(b.userId),
  );
  const out = new Map<string, PlayerColor>();
  ordered.forEach((member, index) => {
    out.set(
      member.userId,
      isPlayerColor(member.color) ? member.color : PLAYER_COLORS[index % PLAYER_COLORS.length]!,
    );
  });
  return out;
}

/** Inicjał na kropce koloru — pierwsza litera nazwy, wielką. */
export function playerInitial(name: string): string {
  const first = [...name.trim()][0];
  return first ? first.toLocaleUpperCase('pl-PL') : '?';
}
