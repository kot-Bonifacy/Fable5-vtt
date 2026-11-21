import type { ChaseEntrySide } from './chase.js';
import {
  CHASE_OBSTACLE_PRESETS,
  isChaseObstacleKind,
  type ChaseObstacleKind,
} from './chase-obstacles.js';

/**
 * Plan rund sceny pościgu (etap 72f3, decyzja MG 11 z 15.11): wiersze
 * „runda N → zdarzenie”, o które serwer pyta MG na początku rundy — w panelu
 * decyzji, kartą czatu widoczną wyłącznie dla MG. Nic nie dzieje się bez
 * zgody MG („Wypuść / Pomiń / Odłóż o rundę”), runda przy tym nie stoi,
 * a zdarzenie bez odpowiedzi czeka dalej (decyzje MG z 21.11).
 *
 * Rdzeń, nie system: Manewr to nieprzejrzysty identyfikator (sprawdza go
 * serwer z listą Manewrów systemu), a auta i przeszkody są pojęciami sceny.
 * Plan jest tajemnicą MG — graczom nie jedzie w żadnym widoku.
 */

export const CHASE_PLAN_KINDS = ['reinforce', 'obstacle', 'maneuver', 'note'] as const;
export type ChasePlanKind = (typeof CHASE_PLAN_KINDS)[number];

export const CHASE_PLAN_KIND_LABELS: Record<ChasePlanKind, string> = {
  reinforce: 'Posiłki',
  obstacle: 'Przeszkoda',
  maneuver: 'Manewr na wezwanie',
  note: 'Notatka',
};

/** Najwięcej wierszy planu jednej sceny. */
export const CHASE_PLAN_MAX = 40;
/** Najdalsza runda planu. */
export const CHASE_PLAN_ROUND_MAX = 99;
/** Najdłuższy dopisek MG przy zdarzeniu. */
export const CHASE_PLAN_TEXT_MAX = 200;

/** Przeszkody planu — z palety (własna z grafiką zostaje w oknie „Pościg”). */
export type ChasePlanObstacleKind = Exclude<ChaseObstacleKind, 'custom'>;

interface ChasePlanBase {
  /** Stały klucz wiersza (karta czatu i odpowiedź MG wskazują nim zdarzenie). */
  id: string;
  /** Runda, na której początku serwer pyta MG (od 1). */
  round: number;
  /** Dopisek MG — okrzyk, przypomnienie; w notatce to cała treść. */
  text: string | null;
}

/** Auto spoza kadru wjeżdża — jak „Przywróć do pościgu” w oknie. */
export interface ChasePlanReinforce extends ChasePlanBase {
  kind: 'reinforce';
  vehicleId: string;
  lane: number;
  side: ChaseEntrySide;
  /** Prędkość wjazdu w punktach Ruchu; `null` — prędkość pościgu. */
  speed: number | null;
}

/** Przeszkoda na pas, przed autem — jak formularz przeszkody w oknie. */
export interface ChasePlanObstacle extends ChasePlanBase {
  kind: 'obstacle';
  obstacle: ChasePlanObstacleKind;
  lane: number;
  /** Przed którym autem; `null` — przed autem kadru z chwili wypuszczenia. */
  beforeId: string | null;
  /** Odstęp od przedniego zderzaka w kratkach; `null` — przy przedniej krawędzi kadru. */
  gapSq: number | null;
}

/** Wezwanie do Manewru — jednego auta albo wszystkich z kierowcą w kadrze. */
export interface ChasePlanManeuver extends ChasePlanBase {
  kind: 'maneuver';
  /** `null` — każde auto w kadrze z kierowcą. */
  vehicleId: string | null;
  maneuver: string;
}

/** Samo przypomnienie dla MG. */
export interface ChasePlanNote extends ChasePlanBase {
  kind: 'note';
  text: string;
}

export type ChasePlanEvent =
  ChasePlanReinforce | ChasePlanObstacle | ChasePlanManeuver | ChasePlanNote;

/**
 * Stan wiersza: `planned` — czeka na swoją rundę, `asked` — karta czeka na
 * odpowiedź MG, `done` — wypuszczone, `skipped` — pominięte.
 */
export const CHASE_PLAN_STATUSES = ['planned', 'asked', 'done', 'skipped'] as const;
export type ChasePlanStatus = (typeof CHASE_PLAN_STATUSES)[number];

/** Wiersz planu ze stanem — tak leży w `Scene.chasePlan` i jedzie do MG. */
export type ChasePlanEntry = ChasePlanEvent & {
  status: ChasePlanStatus;
  /**
   * Runda, w której serwer zapyta (albo zapytał); „Odłóż o rundę” ją
   * przesuwa, a nowa walka wraca do `round`.
   */
  dueRound: number;
  /** Karta czatu ostatniego pytania. */
  messageId: number | null;
};

/** Odpowiedź MG na zdarzenie planu. */
export const CHASE_PLAN_ANSWERS = ['release', 'skip', 'defer'] as const;
export type ChasePlanAnswer = (typeof CHASE_PLAN_ANSWERS)[number];

/** MG: `chase:plan` — cały plan sceny (edycja w oknie i w kreatorze). */
export interface ChasePlanPayload {
  sceneId: string;
  /** Wiersze bez stanu; id istniejącego wiersza zachowuje jego stan. */
  plan: ChasePlanEvent[];
}

/** MG: `chase:plan-answer` — odpowiedź na kartę planu. */
export interface ChasePlanAnswerPayload {
  messageId: number;
  answer: ChasePlanAnswer;
}

export const CHASE_PLAN_CARD_STATUSES = [
  'waiting',
  'released',
  'skipped',
  'deferred',
  'cancelled',
] as const;
export type ChasePlanCardStatus = (typeof CHASE_PLAN_CARD_STATUSES)[number];

/** Karta czatu `chaseplan` — jedno pytanie planu, wyłącznie dla MG. */
export interface ChasePlanLogEntry {
  sceneId: string;
  /** Runda, na której początku padło pytanie. */
  round: number;
  entryId: string;
  kind: ChasePlanKind;
  /** Nagłówek z chwili pytania — „Posiłki: Radiowóz NCPD, pas 2, od tyłu”. */
  title: string;
  text: string | null;
  status: ChasePlanCardStatus;
  /** Przy `deferred` — runda, w której serwer zapyta znowu. */
  deferredTo?: number;
  /** Kto odpowiedział (konto MG). */
  byName?: string;
}

/** Czy karta planu czeka na MG. */
export function chasePlanCardOpen(entry: Pick<ChasePlanLogEntry, 'status'>): boolean {
  return entry.status === 'waiting';
}

// ───────────────────────── Odczyt ─────────────────────────

const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

function isObj(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return undefined;
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text.length > CHASE_PLAN_TEXT_MAX) return undefined;
  return text === '' ? null : text;
}

function readIndex(raw: unknown, max: number): number | undefined {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= max
    ? raw
    : undefined;
}

function readRef(raw: unknown, pattern: RegExp): string | undefined {
  return typeof raw === 'string' && pattern.test(raw) ? raw : undefined;
}

/** Klucz odwołania do auta: id auta sceny albo klucz auta wzorca. */
const REF_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Jedno zdarzenie planu albo `null` (zły kształt). Pasy sprawdza się do
 * `maxLane` (liczba pasów sceny może się jeszcze zmienić — serwer przycina
 * pas przy wypuszczeniu). Odwołania do aut to tylko kształt; to, czy auto
 * jest na scenie, sprawdza wołający.
 */
export function readChasePlanEvent(raw: unknown, id?: string): ChasePlanEvent | null {
  if (!isObj(raw)) return null;
  const key = id ?? readRef(raw.id, ID_PATTERN);
  if (!key) return null;
  const round = raw.round;
  if (
    typeof round !== 'number' ||
    !Number.isInteger(round) ||
    round < 1 ||
    round > CHASE_PLAN_ROUND_MAX
  ) {
    return null;
  }
  const text = readText(raw.text);
  if (text === undefined) return null;
  const base = { id: key, round, text };
  switch (raw.kind) {
    case 'reinforce': {
      const vehicleId = readRef(raw.vehicleId, REF_PATTERN);
      const lane = readIndex(raw.lane, 15);
      if (!vehicleId || lane === undefined) return null;
      if (raw.side !== 'front' && raw.side !== 'rear') return null;
      let speed: number | null = null;
      if (raw.speed !== undefined && raw.speed !== null) {
        const value = readIndex(raw.speed, 1000);
        if (value === undefined) return null;
        speed = value;
      }
      return { ...base, kind: 'reinforce', vehicleId, lane, side: raw.side, speed };
    }
    case 'obstacle': {
      if (!isChaseObstacleKind(raw.obstacle) || raw.obstacle === 'custom') return null;
      const lane = readIndex(raw.lane, 15);
      if (lane === undefined) return null;
      let beforeId: string | null = null;
      if (raw.beforeId !== undefined && raw.beforeId !== null) {
        const ref = readRef(raw.beforeId, REF_PATTERN);
        if (!ref) return null;
        beforeId = ref;
      }
      let gapSq: number | null = null;
      if (raw.gapSq !== undefined && raw.gapSq !== null) {
        if (typeof raw.gapSq !== 'number' || !Number.isFinite(raw.gapSq) || raw.gapSq < 0) {
          return null;
        }
        gapSq = Math.min(1000, raw.gapSq);
      }
      return { ...base, kind: 'obstacle', obstacle: raw.obstacle, lane, beforeId, gapSq };
    }
    case 'maneuver': {
      const maneuver = readRef(raw.maneuver, ID_PATTERN);
      if (!maneuver) return null;
      let vehicleId: string | null = null;
      if (raw.vehicleId !== undefined && raw.vehicleId !== null) {
        const ref = readRef(raw.vehicleId, REF_PATTERN);
        if (!ref) return null;
        vehicleId = ref;
      }
      return { ...base, kind: 'maneuver', vehicleId, maneuver };
    }
    case 'note':
      if (text === null) return null;
      return { ...base, kind: 'note', text };
    default:
      return null;
  }
}

/**
 * Lista zdarzeń planu albo `null` — zły kształt jednego wiersza, za dużo
 * wierszy albo powtórzone id. Kolejność: po rundzie, w rundzie jak podano.
 */
export function readChasePlanEvents(raw: unknown): ChasePlanEvent[] | null {
  if (!Array.isArray(raw) || raw.length > CHASE_PLAN_MAX) return null;
  const events: ChasePlanEvent[] = [];
  const ids = new Set<string>();
  for (const row of raw) {
    const event = readChasePlanEvent(row);
    if (!event || ids.has(event.id)) return null;
    ids.add(event.id);
    events.push(event);
  }
  return sortChasePlan(events);
}

/** Po rundzie; w jednej rundzie — kolejność wpisania (sortowanie stabilne). */
export function sortChasePlan<T extends Pick<ChasePlanEvent, 'round'>>(events: T[]): T[] {
  return [...events].sort((a, b) => a.round - b.round);
}

/** Zdarzenie bez stanu (do edycji i do wzorca). */
export function chasePlanEventOf(entry: ChasePlanEntry): ChasePlanEvent {
  const { status: _status, dueRound: _due, messageId: _message, ...event } = entry;
  return event as ChasePlanEvent;
}

/** Świeży wiersz planu: czeka na swoją rundę. */
export function freshChasePlanEntry(event: ChasePlanEvent): ChasePlanEntry {
  return { ...event, status: 'planned', dueRound: event.round, messageId: null };
}

/**
 * Plan zapisany w `Scene.chasePlan` — wiersze zepsute (stara wersja, ręczna
 * edycja bazy) wypadają po cichu, reszta zostaje.
 */
export function parseChasePlan(raw: string | null | undefined): ChasePlanEntry[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const entries: ChasePlanEntry[] = [];
  const ids = new Set<string>();
  for (const row of parsed) {
    const event = readChasePlanEvent(row);
    if (!event || ids.has(event.id) || !isObj(row)) continue;
    ids.add(event.id);
    const status = (CHASE_PLAN_STATUSES as readonly unknown[]).includes(row.status)
      ? (row.status as ChasePlanStatus)
      : 'planned';
    const dueRound =
      typeof row.dueRound === 'number' && Number.isInteger(row.dueRound) && row.dueRound >= 1
        ? row.dueRound
        : event.round;
    const messageId =
      typeof row.messageId === 'number' && Number.isInteger(row.messageId) ? row.messageId : null;
    entries.push({ ...event, status, dueRound, messageId });
  }
  return sortChasePlan(entries);
}

/**
 * Nowy plan z edycji MG złożony ze starym stanem: wiersz o znanym id zachowuje
 * stan, a wiersz, o który karta właśnie pyta (`asked`), nie zmienia się wcale
 * i nie znika — najpierw odpowiedź, potem edycja. Zmiana rundy wiersza
 * `planned` przestawia też rundę pytania.
 */
export function mergeChasePlan(
  previous: readonly ChasePlanEntry[],
  events: readonly ChasePlanEvent[],
): ChasePlanEntry[] {
  const byId = new Map(previous.map((entry) => [entry.id, entry]));
  const result: ChasePlanEntry[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    const old = byId.get(event.id);
    seen.add(event.id);
    if (!old) {
      result.push(freshChasePlanEntry(event));
    } else if (old.status === 'asked') {
      result.push(old);
    } else {
      result.push({
        ...event,
        status: old.status,
        dueRound:
          old.status === 'planned' && old.round !== event.round ? event.round : old.dueRound,
        messageId: old.messageId,
      });
    }
  }
  for (const entry of previous) {
    if (entry.status === 'asked' && !seen.has(entry.id)) result.push(entry);
  }
  return sortChasePlan(result);
}

/**
 * Wiersze, o które serwer pyta na początku rundy `round`: czekające, których
 * runda pytania już nadeszła — także wpisane w trakcie walki na rundę, która
 * minęła (zapyta o nie najbliższa runda).
 */
export function chasePlanDue(plan: readonly ChasePlanEntry[], round: number): ChasePlanEntry[] {
  return plan.filter((entry) => entry.status === 'planned' && entry.dueRound <= round);
}

/** Nowa walka: cały plan od nowa — odłożenia i odpowiedzi znikają. */
export function resetChasePlan(plan: readonly ChasePlanEntry[]): ChasePlanEntry[] {
  return plan.map((entry) => ({
    ...entry,
    status: 'planned',
    dueRound: entry.round,
    messageId: null,
  }));
}

/** Plan wzorca (klucze aut) albo paczki (stare id) z nowymi id aut; nieznane odwołanie — wiersz wypada. */
export function remapChasePlan<T extends ChasePlanEvent>(
  plan: readonly T[],
  ids: ReadonlyMap<string, string>,
): T[] {
  const out: T[] = [];
  for (const event of plan) {
    if (event.kind === 'reinforce') {
      const vehicleId = ids.get(event.vehicleId);
      if (vehicleId) out.push({ ...event, vehicleId });
    } else if (event.kind === 'obstacle') {
      if (event.beforeId === null) out.push(event);
      else {
        const beforeId = ids.get(event.beforeId);
        if (beforeId) out.push({ ...event, beforeId });
      }
    } else if (event.kind === 'maneuver') {
      if (event.vehicleId === null) out.push(event);
      else {
        const vehicleId = ids.get(event.vehicleId);
        if (vehicleId) out.push({ ...event, vehicleId });
      }
    } else {
      out.push(event);
    }
  }
  return out;
}

/** Auta, do których plan się odwołuje (sprawdzenie, że są na scenie / we wzorcu). */
export function chasePlanVehicleRefs(plan: readonly ChasePlanEvent[]): string[] {
  const refs: string[] = [];
  for (const event of plan) {
    if (event.kind === 'reinforce') refs.push(event.vehicleId);
    if (event.kind === 'obstacle' && event.beforeId) refs.push(event.beforeId);
    if (event.kind === 'maneuver' && event.vehicleId) refs.push(event.vehicleId);
  }
  return refs;
}

// ───────────────────────── Podpis ─────────────────────────

export interface ChasePlanNames {
  /** Nazwa auta sceny po id (brak — „auto spoza sceny”). */
  vehicle: (id: string) => string | null;
  /** Podpis Manewru systemu po id. */
  maneuver: (id: string) => string | null;
  /** Metry na kratkę sceny. */
  metersPerSquare: number;
}

function metres(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${String(rounded).replace('.', ',')} m`;
}

/**
 * Nagłówek zdarzenia po polsku — wiersz w oknie, tytuł karty czatu:
 * „Posiłki: Radiowóz NCPD — pas 2, od tyłu, 150 mil/h”.
 * `mph` zamienia punkty Ruchu na mile (system), żeby rdzeń nie liczył mil.
 */
export function chasePlanTitle(
  event: ChasePlanEvent,
  names: ChasePlanNames,
  mph: (speed: number) => number,
): string {
  const car = (id: string) => names.vehicle(id) ?? 'auto spoza sceny';
  switch (event.kind) {
    case 'reinforce': {
      const side = event.side === 'rear' ? 'od tyłu' : 'od przodu';
      const speed = event.speed === null ? 'prędkość pościgu' : `${mph(event.speed)} mil/h`;
      return `Posiłki: ${car(event.vehicleId)} — pas ${event.lane + 1}, ${side}, ${speed}`;
    }
    case 'obstacle': {
      const label = CHASE_OBSTACLE_PRESETS[event.obstacle].label;
      const before = event.beforeId === null ? 'autem kadru' : car(event.beforeId);
      const where =
        event.gapSq === null
          ? `przy przedniej krawędzi kadru`
          : `${metres(event.gapSq * names.metersPerSquare)} przed: ${before}`;
      return `Przeszkoda: ${label} — pas ${event.lane + 1}, ${where}`;
    }
    case 'maneuver': {
      const maneuver = names.maneuver(event.maneuver) ?? event.maneuver;
      const who = event.vehicleId === null ? 'wszystkie auta z kierowcą' : car(event.vehicleId);
      return `Manewr na wezwanie: ${maneuver} — ${who}`;
    }
    case 'note':
      return `Notatka: ${event.text}`;
  }
}
