import type { ChaseIntent } from '../../chase-drive.js';
import type { ChaseAutopilotPlan } from '../../chase.js';
import {
  CPRED_MOVE_PER_SQUARE,
  CPRED_PEDALS,
  cpredDriveAdvance,
  cpredPedalProblem,
  cpredPedalSpeed,
  type CpredPedal,
} from './chase-drive.js';

/**
 * Autopilot aut NPC-ów w pościgu (etap 72e, decyzje MG z 15.11 i 20.11).
 *
 * MG nadaje autu zamiar (Uciekaj, Goń X, Trzymaj dystans do X, Taranuj X,
 * Blokuj X), a w turze kierowcy-NPC-a ta funkcja wybiera pedał i pas — te
 * same, które kierowca-gracz wybrałby krzyżakiem kokpitu. Bez „Jedź” auto
 * jedzie tak na koniec tury; MG może plan nadpisać kokpitem.
 *
 * Wybór to mały przegląd naprzód: dla każdego pedału i pasa w tej turze
 * (najwyżej 3 × 3) funkcja symuluje jeszcze dwie rundy z najlepszymi pedałami
 * (pas stały) i liczy koszt położenia względem celu, plus kary za zderzenie
 * po drodze i za to, co stoi na wybranym pasie. Cel i inne auta jadą dalej
 * swoją prędkością — autopilot nie zgaduje cudzych pedałów.
 *
 * Położenia są w **kratkach wzdłuż drogi** (większe — dalej z przodu), pasy —
 * numerami od krawędzi `road.from`. Geometrię z pikseli składa wołający
 * (serwer), bo tylko on zna scenę. Zasady domowe; podręcznik nie opisuje jazdy
 * NPC-ów (s. 191–192).
 */

/** Bryła na drodze w oczach autopilota (cel, inne auto, przeszkoda, pieszy). */
export interface CpredPilotBody {
  id: string;
  /** Środek wzdłuż drogi w kratkach — większe dalej z przodu. */
  along: number;
  lengthSq: number;
  /** Pas środka bryły. */
  lane: number;
  /** Pasy, na które bryła zachodzi w poprzek (auto na środku pasa — jeden). */
  lanes: readonly number[];
  /** Prędkość w punktach Ruchu; przeszkoda i pieszy — 0 (stoją na drodze). */
  speed: number;
  /**
   * Ile kratek przesunie się jeszcze w tej rundzie (auto, które nie jechało:
   * `(prędkość − prędkość pościgu) / 4 + zryw`); 0 — już jechało albo stoi.
   */
  pending: number;
}

export interface CpredAutopilotSelf {
  along: number;
  lengthSq: number;
  lane: number;
  speed: number;
  maxSpeed: number;
  raceBonus: number;
  /** Ruch pojazdu, gdy w tej turze odpalono Nitro; inaczej 0. */
  nitroMove: number;
}

export interface CpredAutopilotInput {
  intent: Exclude<ChaseIntent, 'manual'>;
  self: CpredAutopilotSelf;
  /** Prędkość pościgu tej rundy (auta kadru). */
  pursuitSpeed: number;
  /** Liczba pasów jezdni. */
  lanes: number;
  /** Cel zamiaru; `null` przy „Uciekaj” (albo gdy cel zniknął z kadru). */
  target: CpredPilotBody | null;
  /** „Trzymaj dystans” — zapamiętany odstęp środków (to auto − cel) w kratkach. */
  keepGapSq: number | null;
  /** Wszystko inne na drodze — bez tego auta i bez celu. */
  others: readonly CpredPilotBody[];
}

/** „Goń” trzyma się tuż za celem, na jego pasie: zderzak ~2 m za nim (MG 20.11). */
export const CPRED_PILOT_PURSUE_GAP_SQ = 1;
/** „Blokuj” staje tuż przed celem, na jego pasie. */
export const CPRED_PILOT_BLOCK_GAP_SQ = 1;

/** Waga rund przeglądu: ta tura, następna i jeszcze jedna. */
const HORIZON_WEIGHTS = [1, 0.6, 0.35] as const;
/** Zderzenie w ruchu tej tury z czymś, czego zamiar nie chce taranować. */
const CONTACT_COST = 40;
/** To samo, gdy auto cofa się na coś za sobą — staje, ale nic się nie rozbija. */
const REAR_CONTACT_COST = 15;
/** Bryły zachodzą na siebie (albo minęły się przez siebie) w symulowanej rundzie. */
const OVERLAP_COST = 20;
/** Nagroda „Taranuj” za zderzenie z celem w tej turze. */
const RAM_BONUS = 30;
/** Każdy pas między autem a pasem celu („Goń”, „Blokuj”). */
const LANE_MISMATCH_COST = 4;
/** „Taranuj” ciągnie na pas celu mocniej. */
const RAM_LANE_COST = 2;
/** Sama zmiana pasa — bez powodu autopilot nie kluczy. */
const LANE_CHANGE_COST = 0.3;
/** „Blokuj” — kara za kratkę różnicy prędkości z celem na rundę. */
const BLOCK_SPEED_COST = 0.5;
/** Margines styku: bryły, które się tylko dotykają, nie zachodzą na siebie. */
const TOUCH_EPSILON = 0.05;

const LANE_STEPS = [0, -1, 1] as const;
const FIRST_PEDALS: readonly (CpredPedal | null)[] = [null, ...CPRED_PEDALS];

function front(along: number, length: number): number {
  return along + length / 2;
}

function rear(along: number, length: number): number {
  return along - length / 2;
}

/** Czy przedziały wzdłuż drogi zachodzą na siebie (dotknięcie się nie liczy). */
function overlaps(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] - TOUCH_EPSILON && b[0] < a[1] - TOUCH_EPSILON;
}

/** Odstęp brył wzdłuż drogi (0, gdy zachodzą na siebie). */
function bodyDistance(a: number, aLength: number, b: number, bLength: number): number {
  return Math.max(0, rear(b, bLength) - front(a, aLength), rear(a, aLength) - front(b, bLength));
}

/** Kolejne prędkości przy pedałach z listy (bez pedałów, które nic nie zmieniają). */
function nextSpeeds(speed: number, maxSpeed: number): number[] {
  const out: number[] = [];
  for (const pedal of FIRST_PEDALS) {
    const next = cpredPedalSpeed(speed, maxSpeed, pedal);
    if (!out.includes(next)) out.push(next);
  }
  return out;
}

/** Stan rundy w symulacji: to auto i bryły (cel pierwszy, gdy jest). */
interface SimState {
  self: number;
  speed: number;
  bodies: number[];
}

/**
 * Koszt położenia na koniec jednej symulowanej rundy (bez kar za zderzenia,
 * które liczy `overlapCost`).
 */
function placeCost(input: CpredAutopilotInput, lane: number, state: SimState): number {
  const { self, target } = input;
  if (input.intent === 'flee' || !target) return -(state.self - self.along);
  const at = state.bodies[0]!;
  const laneGap = Math.abs(lane - target.lane);
  switch (input.intent) {
    case 'pursue': {
      const gap = rear(at, target.lengthSq) - front(state.self, self.lengthSq);
      return Math.abs(gap - CPRED_PILOT_PURSUE_GAP_SQ) + LANE_MISMATCH_COST * laneGap;
    }
    case 'keep':
      return Math.abs(state.self - at - (input.keepGapSq ?? 0));
    case 'ram':
      return bodyDistance(state.self, self.lengthSq, at, target.lengthSq) + RAM_LANE_COST * laneGap;
    case 'block': {
      const lead = rear(state.self, self.lengthSq) - front(at, target.lengthSq);
      return (
        Math.abs(lead - CPRED_PILOT_BLOCK_GAP_SQ) +
        (lead >= 0 ? LANE_MISMATCH_COST * laneGap : 0) +
        // Zajeżdża drogę z prędkością celu — nie hamuje mu przed maską do zera.
        (BLOCK_SPEED_COST * Math.abs(state.speed - target.speed)) / CPRED_MOVE_PER_SQUARE
      );
    }
  }
}

/** Bryły, które w tej rundzie stoją na tym pasie i zachodzą na auto albo przez nie przejechały. */
function overlapCost(
  input: CpredAutopilotInput,
  bodies: readonly CpredPilotBody[],
  lane: number,
  before: SimState,
  after: SimState,
): number {
  let cost = 0;
  const length = input.self.lengthSq;
  bodies.forEach((body, index) => {
    if (!body.lanes.includes(lane)) return;
    // „Taranuj” chce zetknięcia z celem — kara go nie dotyczy.
    if (index === 0 && input.target && input.intent === 'ram') return;
    const was = before.self - before.bodies[index]!;
    const now = after.self - after.bodies[index]!;
    const reach = (length + body.lengthSq) / 2 - TOUCH_EPSILON;
    const crossed = (was > reach && now < -reach) || (was < -reach && now > reach);
    // „Blokuj” chce, żeby cel wjechał mu w tył — kara tylko za wjazd w cel od tyłu.
    const blocked = index === 0 && input.target && input.intent === 'block' && now >= 0;
    if ((Math.abs(now) < reach && !blocked) || crossed) cost += OVERLAP_COST;
  });
  return cost;
}

/**
 * Zderzenie w samym ruchu tej tury: auto przejeżdża od `along` do `along +
 * advance` i z pasa `from` na `to`, a bryły stoją tam, gdzie są teraz.
 */
function contactCost(
  input: CpredAutopilotInput,
  bodies: readonly CpredPilotBody[],
  fromLane: number,
  toLane: number,
  advance: number,
): number {
  const { self } = input;
  const start = self.along;
  const end = self.along + advance;
  const swept: [number, number] = [
    rear(Math.min(start, end), self.lengthSq),
    front(Math.max(start, end), self.lengthSq),
  ];
  let cost = 0;
  bodies.forEach((body, index) => {
    if (!body.lanes.includes(fromLane) && !body.lanes.includes(toLane)) return;
    // Na własnym pasie liczy się tylko to, co stoi w kierunku ruchu — bryła
    // za zderzakiem (tył przy jeździe naprzód) nie jest na drodze.
    const ahead = body.along > start;
    if (body.lanes.includes(fromLane) && !body.lanes.includes(toLane) && ahead !== advance > 0) {
      return;
    }
    const box: [number, number] = [
      rear(body.along, body.lengthSq),
      front(body.along, body.lengthSq),
    ];
    if (!overlaps(swept, box)) return;
    if (index === 0 && input.target && input.intent === 'ram') {
      cost -= RAM_BONUS;
      return;
    }
    cost += advance < 0 && !ahead ? REAR_CONTACT_COST : CONTACT_COST;
  });
  return cost;
}

/** Najmniejszy koszt dwóch kolejnych rund z najlepszymi pedałami (pas stały). */
function lookahead(
  input: CpredAutopilotInput,
  bodies: readonly CpredPilotBody[],
  lane: number,
  state: SimState,
  depth: number,
): number {
  if (depth >= HORIZON_WEIGHTS.length) return 0;
  const weight = HORIZON_WEIGHTS[depth]!;
  let best = Infinity;
  for (const speed of nextSpeeds(state.speed, input.self.maxSpeed)) {
    // Od drugiej rundy liczą się tylko prędkości względne — pościg „stoi”.
    const next: SimState = {
      self: state.self + speed / CPRED_MOVE_PER_SQUARE,
      speed,
      bodies: state.bodies.map(
        (along, index) => along + bodies[index]!.speed / CPRED_MOVE_PER_SQUARE,
      ),
    };
    const cost =
      weight * (placeCost(input, lane, next) + overlapCost(input, bodies, lane, state, next)) +
      lookahead(input, bodies, lane, next, depth + 1);
    if (cost < best) best = cost;
  }
  return best;
}

/**
 * Plan autopilota na tę turę: pedał i zmiana pasa o najwyżej jeden. Bez
 * Nitro, Manewrów i kolczatki — to dalej wybór MG. `null`, gdy zamiar
 * potrzebuje celu, a celu nie ma.
 */
export function cpredChaseAutopilot(input: CpredAutopilotInput): ChaseAutopilotPlan | null {
  if (input.intent !== 'flee' && !input.target) return null;
  const { self } = input;
  const bodies: CpredPilotBody[] = input.target
    ? [input.target, ...input.others]
    : [...input.others];
  const start: SimState = {
    self: self.along,
    speed: self.speed,
    bodies: bodies.map((body) => body.along),
  };
  const roundEnd = bodies.map((body) => body.along + body.pending);
  let best: { plan: ChaseAutopilotPlan; cost: number } | null = null;
  for (const laneDelta of LANE_STEPS) {
    const lane = self.lane + laneDelta;
    if (lane < 0 || lane >= input.lanes) continue;
    for (const pedal of FIRST_PEDALS) {
      if (pedal && cpredPedalProblem(self.speed, self.maxSpeed, pedal)) continue;
      const speed = cpredPedalSpeed(self.speed, self.maxSpeed, pedal);
      const advance = cpredDriveAdvance({
        speed,
        pursuitSpeed: input.pursuitSpeed,
        raceBonus: self.raceBonus,
        nitroMove: self.nitroMove,
      });
      const end: SimState = { self: self.along + advance, speed, bodies: roundEnd };
      const cost =
        contactCost(input, bodies, self.lane, lane, advance) +
        (laneDelta === 0 ? 0 : LANE_CHANGE_COST) +
        HORIZON_WEIGHTS[0] *
          (placeCost(input, lane, end) + overlapCost(input, bodies, lane, start, end)) +
        lookahead(input, bodies, lane, end, 1);
      if (!best || cost < best.cost - 1e-9) best = { plan: { pedal, laneDelta }, cost };
    }
  }
  return best?.plan ?? null;
}
