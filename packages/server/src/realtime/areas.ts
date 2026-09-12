import type {
  CpredRegistry,
  CpredScatter,
  RollAreaMeta,
  RollAreaTarget,
  ScenePoint,
} from '@vtt/shared';
import {
  cpredEffectiveStats,
  CPRED_EVADE_AREA_MIN_REF,
  blastAreaAt,
  coneAreaTowards,
  coverInLineOfFire,
  describeScatter,
  isInBlast,
  isInCone,
  metresBetween,
  metresForRules,
  parseCharacterData,
  rollBlastScatter,
  scatteredCentre,
  snapToSquareCentre,
  tokenCentre,
} from '@vtt/shared';
import type { Scene, Token } from '../generated/prisma/client.js';
import { RealtimeError, type RealtimeDeps } from './registry.js';
import { toSceneView } from './scenes.js';
import { toTokenView } from './tokens.js';
import { hasLineOfFire, type SceneVisionContext } from './vision.js';

/**
 * Explosions on the map (stage 16d).
 *
 * The whole module exists because of one sentence: „Wszystkie bronie eksplodujące
 * zadają obrażenia wszystkim celom (w tym terenowi) na obszarze 10 m x 10 m
 * (5 pól na 5 pól), przy czym twój cel (pole 2x2 metry, nie osoba) jest środkiem
 * tego obszaru" (s. 174). Three things follow, and they are the whole design:
 *
 *  - the centre is a **square**, so a thrown charge is aimed at the ground and
 *    snapped to the grid before anything is measured;
 *  - the blast is judged **from where it went off**, not from the thrower — the
 *    wall that spares somebody is the wall between them and the crater;
 *  - everyone inside takes the **same** damage („Każdy cel otrzymuje tyle samo
 *    obrażeń"), which is why one damage roll is applied N times rather than
 *    rolled N times.
 *
 * Stage 16g added the second shape without adding a second module: a shotgun
 * shell asks the same three questions of a **cone** („każdy cel znajdujący się
 * do 6 m przed tobą (3 pola) i w polu twojego widzenia", s. 174), so the shape
 * became a parameter and everything else stayed where it was.
 *
 * Like every other geometric question in this project, the client may draw the
 * square but never decides who is standing in it.
 */

/** Reads and validates a client-sent aim point, then snaps it to a square. */
export function requireScenePoint(raw: unknown, scene: Scene): ScenePoint {
  if (typeof raw !== 'object' || raw === null) throw new RealtimeError('BAD_REQUEST');
  const point = raw as Record<string, unknown>;
  if (
    typeof point.x !== 'number' ||
    !Number.isFinite(point.x) ||
    typeof point.y !== 'number' ||
    !Number.isFinite(point.y)
  ) {
    throw new RealtimeError('BAD_REQUEST');
  }
  // Clamped to the map: a charge cannot go off past the edge of the world, and
  // an unclamped coordinate is the cheapest way to make the geometry loop.
  const clamped = {
    x: Math.min(Math.max(point.x, 0), scene.width),
    y: Math.min(Math.max(point.y, 0), scene.height),
  };
  return snapToSquareCentre(clamped, toSceneView(scene));
}

/**
 * Where a missed charge ends up, and the roll that put it there.
 *
 * `stat` is the attribute the throw was made with — DEX by hand, REF from a
 * launcher — so the same steady arm that aims well also drops it close. The
 * rule is a house rule (see `rollBlastScatter`); the card says so.
 */
export function scatterBlast(
  aim: ScenePoint,
  scene: Scene,
  stat: number,
  statLabel: string,
  rng: (sides: number) => number,
): { centre: ScenePoint; scatter: CpredScatter } {
  const view = toSceneView(scene);
  const scatter = rollBlastScatter(rng, stat, statLabel, view);
  return { centre: scatteredCentre(aim, scatter, view), scatter };
}

/** Something the area reached, with the row behind it for the damage step. */
export interface BlastTarget {
  /** The figure, when this target is one; absent when it is a cover. */
  token?: Token;
  view: RollAreaTarget;
}

/**
 * The patch of map an attack covers, as the caller describes it.
 *
 * Two shapes, and the difference between them is not only geometric: the blast
 * is judged **from the crater**, the cone **from the muzzle**. Which is why the
 * shape carries its own origin rather than the caller passing one alongside.
 */
export type AreaShape =
  | { kind: 'blast'; centre: ScenePoint; sideM: number }
  | {
      kind: 'cone';
      /** The shooter's own position — the tip of the wedge (stage 16g). */
      origin: ScenePoint;
      /** Any point along the axis; the aim decides only the direction. */
      towards: ScenePoint;
      rangeM: number;
    };

/**
 * Everyone and everything inside the area, and why the ones who walk away walk
 * away.
 *
 * For a blast the obstacle test runs from the centre outwards, which is what
 * makes cover worth standing behind: RAW spares „cele ukryte za osłoną" (s. 174),
 * and the car only hides you from the crater it is actually between you and. A
 * wall gets the same answer even though the rule names only cover — a mortar
 * round through a brick wall would need a rule of its own, and the rulebook does
 * not give it one.
 *
 * A cone is measured from the person holding the gun, and that changes one thing
 * on purpose: the shooter *may* fire over the bonnet they are leaning on
 * (`coverBetween`'s reach exemption), because unlike an explosion they have arms.
 * „w polu twojego widzenia" (s. 174) is the same line of fire every other shot
 * asks about.
 */
export async function areaTargets(
  deps: RealtimeDeps,
  scene: Scene,
  registry: CpredRegistry,
  shape: AreaShape,
  context: SceneVisionContext,
  options: { excludeTokenId?: string } = {},
): Promise<BlastTarget[]> {
  const view = toSceneView(scene);
  const area = resolveArea(shape, view);
  const tokens = await deps.ctx.prisma.token.findMany({ where: { sceneId: scene.id } });

  const found: BlastTarget[] = [];
  for (const token of tokens) {
    if (token.id === options.excludeTokenId) continue;
    const point = tokenCentre(toTokenView(token, true), view);
    if (!area.contains(point)) continue;

    const metres = metresForRules(metresBetween(area.from, point, view));
    const obstacle = obstacleBetween(context, area.from, point, area.coverReachPx);
    const target: RollAreaTarget = {
      tokenId: token.id,
      name: token.name,
      metres,
      ownerId: await controllerOf(deps, token),
      ...(obstacle ? { spared: obstacle.kind, sparedBy: obstacle.name } : {}),
      ...(obstacle ? {} : { canEvade: await canJumpClear(deps, registry, token) }),
    };
    found.push({ token, view: target });
  }

  // „w tym terenowi" — the car in the blast takes it too, and unlike a person it
  // has neither armour nor anywhere to jump. A cone of shot treats it the same:
  // pellets do not part around a bonnet.
  for (const cover of context.covers) {
    if (cover.hpCurrent <= 0) continue;
    if (!area.touchesCover(cover)) continue;
    found.push({
      view: {
        coverId: cover.id,
        name: cover.name,
        metres: metresForRules(metresBetween(area.from, coverCentre(cover), view)),
      },
    });
  }

  return found.sort((a, b) => a.view.metres - b.view.metres);
}

/** Geometry of one area, plus the two facts the judgement needs. */
interface ResolvedArea {
  /** Point everything is measured and sighted from. */
  from: ScenePoint;
  contains: (point: ScenePoint) => boolean;
  touchesCover: (cover: CoverRect) => boolean;
  /**
   * Reach that exempts a cover from blocking. Zero for an explosion — see
   * `obstacleBetween` — and the scene's arm's length for a shooter.
   */
  coverReachPx: number;
}

type CoverRect = { x: number; y: number; width: number; height: number };

function resolveArea(shape: AreaShape, view: ReturnType<typeof toSceneView>): ResolvedArea {
  if (shape.kind === 'blast') {
    const area = blastAreaAt(shape.centre, view, shape.sideM);
    return {
      from: area.centre,
      contains: (point) => isInBlast(area, point),
      touchesCover: (cover) => coverOverlapsBlast(area.centre, area.sidePx, cover),
      coverReachPx: 0,
    };
  }
  const cone = coneAreaTowards(shape.origin, shape.towards, view, shape.rangeM);
  return {
    from: cone.origin,
    contains: (point) => isInCone(cone, point),
    // A rectangle is in the wedge if any of its corners or its middle is: close
    // enough for a car, and it errs towards including the thing being shot at.
    touchesCover: (cover) => coverPoints(cover).some((point) => isInCone(cone, point)),
    coverReachPx: view.grid.sizePx > 0 ? COVER_REACH_SQUARES * view.grid.sizePx : 0,
  };
}

/**
 * How close a shooter has to be to a cover before it stops blocking their own
 * shot — one grid square, the same „within arm's reach" the doors use (18d).
 */
const COVER_REACH_SQUARES = 1;

/** The five points a cover is tested with: its corners and its centre. */
function coverPoints(cover: CoverRect): ScenePoint[] {
  return [
    { x: cover.x, y: cover.y },
    { x: cover.x + cover.width, y: cover.y },
    { x: cover.x, y: cover.y + cover.height },
    { x: cover.x + cover.width, y: cover.y + cover.height },
    coverCentre(cover),
  ];
}

/**
 * Who may read this row off the card: the token's owner, or the owner of the
 * sheet it is linked to. A figure with neither belongs to the GM alone, which
 * is exactly the case the redaction exists for.
 */
async function controllerOf(deps: RealtimeDeps, token: Token): Promise<string | null> {
  if (token.ownerId) return token.ownerId;
  if (!token.characterId) return null;
  const character = await deps.ctx.prisma.character.findUnique({
    where: { id: token.characterId },
    select: { ownerId: true },
  });
  return character?.ownerId ?? null;
}

/** Rectangle centre of a cover — good enough for „how far from the crater". */
function coverCentre(cover: { x: number; y: number; width: number; height: number }): ScenePoint {
  return { x: cover.x + cover.width / 2, y: cover.y + cover.height / 2 };
}

/** Does the blast square touch this cover's rectangle at all? */
function coverOverlapsBlast(
  centre: ScenePoint,
  sidePx: number,
  cover: { x: number; y: number; width: number; height: number },
): boolean {
  const half = sidePx / 2;
  return (
    cover.x <= centre.x + half &&
    cover.x + cover.width >= centre.x - half &&
    cover.y <= centre.y + half &&
    cover.y + cover.height >= centre.y - half
  );
}

/** What stands between the origin of the area and this figure, if anything. */
function obstacleBetween(
  context: SceneVisionContext,
  from: ScenePoint,
  to: ScenePoint,
  coverReachPx: number,
): { kind: 'wall' | 'cover'; name: string } | null {
  // A wall is asked first because it is the harder fact: with both a wall and a
  // car in the way, „ocalił go samochód" would be a smaller truth than the one
  // available.
  if (context.walls.length > 0 && !hasLineOfFire(context, from, to)) {
    return { kind: 'wall', name: 'ściana' };
  }
  // Reach zero for an explosion, and that is the difference between a shooter
  // and a crater: a person leans over the bonnet they are standing at, an
  // explosion has no arm to lean over, so a car right next to it still shields
  // whoever is behind it. A cone comes from a person, so it keeps the reach.
  const cover = coverInLineOfFire(context.covers, from, to, coverReachPx);
  return cover ? { kind: 'cover', name: cover.name } : null;
}

/**
 * May this figure jump clear? „Osoba z REF 8 lub wyższym może zdecydować się na
 * odskoczenie poza obszar wybuchu" (s. 174).
 *
 * A permission, not an outcome — the roll happens only if somebody presses the
 * button, and the button is on the card.
 */
async function canJumpClear(
  deps: RealtimeDeps,
  registry: CpredRegistry,
  token: Token,
): Promise<boolean> {
  if (token.characterId) {
    const character = await deps.ctx.prisma.character.findUnique({
      where: { id: token.characterId },
    });
    if (!character) return false;
    const data = parseCharacterData(character.data, registry);
    return cpredEffectiveStats(data).ref >= CPRED_EVADE_AREA_MIN_REF;
  }
  // Figura bez karty nie ma REF-u, którym mogłaby to zrobić (etap 38a).
  return false;
}

/** The block the chat card renders and the client redraws the template from. */
export function toAreaMeta(
  scene: Scene,
  shape: AreaShape,
  targets: readonly BlastTarget[],
  scatter: CpredScatter | null,
): RollAreaMeta {
  const view = toSceneView(scene);
  const common = {
    sceneId: scene.id,
    ...(scatter ? { scatter: describeScatter(scatter) } : {}),
    targets: targets.map((entry) => entry.view),
  };
  if (shape.kind === 'blast') {
    return { ...common, shape: 'blast', centre: shape.centre, sideM: shape.sideM };
  }
  const cone = coneAreaTowards(shape.origin, shape.towards, view, shape.rangeM);
  return {
    ...common,
    shape: 'cone',
    // The centre keeps its meaning — „where this went off" — so a card that
    // predates cones still reads, and the client has one field to focus on.
    centre: shape.origin,
    sideM: shape.rangeM,
    cone: {
      origin: cone.origin,
      angleDeg: (cone.angle * 180) / Math.PI,
      rangeM: cone.rangeM,
      halfAngleDeg: (cone.halfAngle * 180) / Math.PI,
    },
  };
}

/**
 * „obszar 10×10 m · odchylenie — …" — the line under the roll.
 *
 * Deliberately **countless**. How many figures the area found is in the target
 * list, which the delivery layer filters per viewer (`redactChatMessage`); a
 * count baked into a string would walk straight past that filter and tell a
 * player exactly how many people are in the dark room they just grenaded.
 */
export function describeArea(meta: RollAreaMeta): string {
  const parts = [
    meta.shape === 'cone' ? `stożek ${meta.sideM} m` : `obszar ${meta.sideM}×${meta.sideM} m`,
  ];
  if (meta.scatter) parts.push(`odchylenie — ${meta.scatter}`);
  return parts.join(' · ');
}
