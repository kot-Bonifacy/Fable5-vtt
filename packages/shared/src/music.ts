export const MUSIC_MAX_BYTES = 40 * 1024 * 1024;
export const MUSIC_ACCEPT = '.mp3,.ogg,.wav';
export interface MusicTrack {
  id: string;
  name: string;
  url: string;
}
export interface MusicPlayback {
  track: MusicTrack;
  playing: boolean;
  position: number;
  startedAt: number;
  loop: boolean;
  volume: number;
}
export interface MusicState {
  campaignId: string;
  revision: number;
  tracks: MusicTrack[];
  playback: MusicPlayback | null;
  serverNow: number;
}
export type MusicCommand =
  | { action: 'play'; trackId: string; campaignId: string }
  | { action: 'pause' | 'resume' | 'stop'; campaignId: string }
  | { action: 'loop'; loop: boolean; campaignId: string }
  | { action: 'volume'; volume: number; campaignId: string }
  | { action: 'remove'; trackId: string; campaignId: string };

/** Only individual videos on recognized YouTube hosts; never arbitrary embeds. */
export function youtubeVideoId(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  try {
    const url = new URL(raw.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port)
      return null;
    let id: string | null = null;
    if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
    else if (
      ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(
        url.hostname,
      )
    ) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else id = /^\/(?:shorts|live|embed)\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export const AMBIENCE_PRESETS = {
  none: 'Cisza',
  rain: 'Deszcz',
  wind: 'Wiatr',
  fire: 'Ogień',
  street: 'Ulica',
  car: 'Jazda samochodem',
} as const;
export type AmbiencePreset = keyof typeof AMBIENCE_PRESETS;
/**
 * Otoczenie, z którym rusza każda scena pościgu (02.11.2026, decyzja MG):
 * warkot jadącego auta zamiast ruchu ulicznego. Nowa scena, przełączenie
 * rodzaju na „Pościg” i szablon bez własnego odgłosu biorą ten preset;
 * MG zmienia go dalej w ustawieniach jak każdy inny.
 */
export const CHASE_AMBIENCE = 'car' satisfies AmbiencePreset;
/**
 * Otoczenie sceny pościgu, gdy auto stoi (04.11.2026, decyzja MG): warkot
 * jazdy cichnie, gdy auto się zatrzyma albo jeszcze nie ruszyło, a zamiast
 * niego gra ruch uliczny.
 */
export const CHASE_STOPPED_AMBIENCE = 'street' satisfies AmbiencePreset;

/** Auto pościgu tyle, ile potrzeba do wyboru odgłosu (`SceneVehicleView`). */
export interface ChaseAmbienceVehicle {
  id: string;
  ownerCharacterId: string | null;
  moving: boolean;
}

/**
 * Odgłos, który ten klient słyszy na scenie (04.11.2026, decyzja MG). Poza
 * pościgiem i przy odgłosie innym niż warkot jazdy — ten wybrany przez MG.
 * W pościgu z warkotem: gracz w aucie słyszy jazdę tylko wtedy, gdy jego auto
 * jedzie (`moving` — silnik pracuje, pościg ruszył, nie wrak), inaczej ulicę.
 * MG i gracz poza autem słuchają aut drużyny (auta z kartą właściciela), a bez
 * nich — dowolnego auta sceny; żadne nie jedzie albo aut brak — ulica.
 */
export function chaseAmbienceFor(
  preset: AmbiencePreset,
  chase: boolean,
  vehicles: readonly ChaseAmbienceVehicle[],
  seatedVehicleIds: readonly string[],
): AmbiencePreset {
  if (!chase || preset !== CHASE_AMBIENCE) return preset;
  const seated = vehicles.filter((vehicle) => seatedVehicleIds.includes(vehicle.id));
  const party = vehicles.filter((vehicle) => vehicle.ownerCharacterId !== null);
  const heard = seated.length > 0 ? seated : party.length > 0 ? party : vehicles;
  return heard.some((vehicle) => vehicle.moving) ? CHASE_AMBIENCE : CHASE_STOPPED_AMBIENCE;
}
export function isAmbiencePreset(value: unknown): value is AmbiencePreset {
  return typeof value === 'string' && Object.hasOwn(AMBIENCE_PRESETS, value);
}

export interface MusicImportStatus {
  campaignId: string;
  phase: 'idle' | 'downloading' | 'converting' | 'complete' | 'error' | 'cancelled';
  progress: number;
  name?: string;
  error?: string;
}
