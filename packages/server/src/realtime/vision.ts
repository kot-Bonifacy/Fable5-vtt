import type {
  FogShapeView,
  LightGlow,
  LightMask,
  LightSource,
  LightView,
  ScenePoint,
  SceneView,
  SessionUser,
  WallView,
} from '@vtt/shared';
import {
  ROLE_GM,
  blockingSegments,
  buildLightMask,
  computeVisionPolygon,
  fogOverrideAt,
  isPointLit,
  isPointVisible,
  isSegmentClear,
  lightMaskCellPx,
  lightReachPx,
  metresPerPixel,
  polygonsBounds,
  sceneBoundsSegments,
  tokenCentre,
  wallMidpoint,
  type Segment,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Scene, Token } from '../generated/prisma/client.js';
import type { RealtimeDeps } from './registry.js';
import { emitExploration, recordSight } from './exploration.js';
import { fetchFogState } from './fog-io.js';
import { fetchSceneWalls } from './walls-io.js';
import { fetchSceneLights, lightSourceOf, toLightScene, tokenLightOf } from './lights-io.js';
import { campaignRoom, emitToCampaignUser } from './state.js';

/**
 * Server-side field of view (stages 18a, 18b) — core VTT, no game system.
 *
 * This module is the reason walls and lights never leave the server. It answers
 * two questions and emits one event:
 *
 *  - **„may this viewer see that point?"** — asked by the token layer before a
 *    token goes into anybody's payload. Hiding by omission is the only kind of
 *    hiding this project accepts. On a dark scene the question grew a second
 *    half: being *in view* is no longer the same as being *visible*, because an
 *    unlit corridor hides whatever stands in it (stage 18b);
 *  - **„what does this viewer see?"** — the finished polygons plus, on a dark
 *    scene, the light levels inside them, pushed as `vision:sync`.
 *
 * The client receives the *result* of the raycast and never the geometry behind
 * it. Light levels travel as a coarse grid clipped to the viewer's own field of
 * view rather than as light polygons, because a light polygon is clipped by
 * walls and therefore *is* a floor plan — see `shared/lights.ts`.
 *
 * The GM is exempt from all of it: they see every token anyway, so they never
 * pay for a raycast or a light mask.
 */

/** Scene fields the measurement helpers need off a database row. */
function toMeasureScene(scene: Scene): Pick<SceneView, 'grid' | 'metersPerSquare'> {
  return toLightScene(scene);
}

/** Does this scene decide visibility from walls at all? */
export function usesDynamicVision(scene: Pick<Scene, 'visibility'>): boolean {
  return scene.visibility === 'dynamic';
}

/**
 * Does this scene decide visibility from *light* as well (stage 18b)? Darkness
 * only means anything where sight comes from tokens, so it is deliberately
 * gated on the dynamic mode rather than standing on its own: „dark" on an open
 * scene would be a switch that does nothing.
 */
export function usesDarkness(scene: Pick<Scene, 'visibility' | 'dark'>): boolean {
  return usesDynamicVision(scene) && scene.dark;
}

/** Token geometry a carried light needs to follow its bearer. */
type TokenGeometry = Pick<Token, 'x' | 'y' | 'size'>;

/**
 * A light carried by one token, with what decides who it shines for.
 *
 * A hidden token is one the GM has taken off every player's map, and its lamp
 * has to disappear with it: the light mask would otherwise show a lit patch
 * creeping down the corridor and the glow layer would mark the bearer's exact
 * position — the ambush given away by the thing that was supposed to be hidden.
 * It cannot simply be dropped from the scene either, or a player whose *own*
 * token is hidden would be blinded by their own torch. So the switch is per
 * viewer: the bearer keeps their light, everybody else never hears of it.
 */
interface CarriedLight {
  source: LightSource;
  token: TokenGeometry;
  hidden: boolean;
  /** Users who control the bearer: its owner, and the owner of its character. */
  owners: Set<string>;
}

/**
 * Everything the raycast needs for one scene: the walls (for door lookups), the
 * segments that currently block sight (scene border included) and — on a dark
 * scene — everything that emits light.
 */
export interface SceneVisionContext {
  walls: WallView[];
  segments: Segment[];
  /** Stored lights; the GM's list, and the source of `staticSources`. */
  lights: LightView[];
  /** Lamps standing on the map, switched on, in scene pixels. */
  staticSources: LightSource[];
  /** Lights carried by tokens and switched on, keyed by token id. */
  carried: Map<string, CarriedLight>;
  /**
   * Windows, as bare segments (stage 18c). They are deliberately *not* in
   * `segments` — a window stops neither sight nor light — but light that passes
   * through one arrives dimmer, and this is the list that says where they are.
   */
  windows: Segment[];
  /**
   * The GM's overrides painted over this scene (stage 18c), in paint order.
   * Empty on a scene the GM has not drawn on, which is the usual case.
   */
  overrides: FogShapeView[];
  /** Is light part of the answer here? */
  dark: boolean;
  /** How far a token sees with no light at all, in scene pixels. */
  darkSightPx: number;
  /** Cell edge of the light mask, in scene pixels. */
  maskCellPx: number;
}

export async function loadVisionContext(
  prisma: PrismaClient,
  scene: Scene,
): Promise<SceneVisionContext> {
  const walls = await fetchSceneWalls(prisma, scene.id);
  const fog = await fetchFogState(prisma, scene);
  const dark = usesDarkness(scene);
  // A lit scene never asks about light, so it never pays for the queries: the
  // lamp rows and the carried torches are only read where they can matter.
  const lights = dark ? await fetchSceneLights(prisma, scene.id) : [];
  const carried = dark ? await loadCarriedLights(prisma, scene) : new Map();
  const measure = toMeasureScene(scene);
  const perPixel = metresPerPixel(measure);
  return {
    walls,
    // The scene border is always part of the set: without it a ray fired
    // through an open door would run to infinity and the polygon would be
    // unbounded.
    segments: [...blockingSegments(walls), ...sceneBoundsSegments(scene)],
    windows: walls
      .filter((wall) => wall.kind === 'window')
      .map((wall) => ({ x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 })),
    lights,
    staticSources: lights
      .map((light) => lightSourceOf(light, scene))
      .filter((source): source is LightSource => source !== null),
    carried,
    overrides: fog.overrides,
    dark,
    darkSightPx: perPixel > 0 ? Math.max(0, scene.darkSightM) / perPixel : 0,
    maskCellPx: lightMaskCellPx({
      gridMode: scene.gridMode === 'gridless' ? 'gridless' : 'grid',
      grid: measure.grid,
    }),
  };
}

/** Torches, lamps and flares carried by tokens on this scene, switched on. */
async function loadCarriedLights(
  prisma: PrismaClient,
  scene: Scene,
): Promise<Map<string, CarriedLight>> {
  const tokens = await prisma.token.findMany({
    where: { sceneId: scene.id },
    include: { character: { select: { ownerId: true } } },
  });
  const carried = new Map<string, CarriedLight>();
  const measure = toMeasureScene(scene);
  for (const token of tokens) {
    const light = tokenLightOf(token);
    if (!light || !light.on) continue;
    const source = lightSourceAt(tokenCentre(token, measure), light, scene);
    if (!source) continue;
    const owners = new Set<string>();
    if (token.ownerId) owners.add(token.ownerId);
    if (token.character?.ownerId) owners.add(token.character.ownerId);
    carried.set(token.id, {
      source,
      token: { x: token.x, y: token.y, size: token.size },
      hidden: token.hidden,
      owners,
    });
  }
  return carried;
}

/** A carried light placed at a point; null when it reaches nowhere. */
function lightSourceAt(
  origin: ScenePoint,
  light: { brightM: number; dimM: number; color: string; flicker: boolean },
  scene: Scene,
): LightSource | null {
  const perPixel = metresPerPixel(toMeasureScene(scene));
  if (perPixel <= 0) return null;
  const brightPx = light.brightM / perPixel;
  const dimPx = Math.max(brightPx, light.dimM / perPixel);
  if (dimPx <= 0) return null;
  return { origin, brightPx, dimPx, color: light.color, flicker: light.flicker };
}

/**
 * Everything emitting light for one viewer right now.
 *
 * `viewerId` is who is asking, and it is a required argument on purpose: a
 * carried light belonging to a hidden token only exists for whoever controls it
 * (see `CarriedLight`), and a call site that forgot to say who it was building
 * the world for would leak that token's position. `null` means „nobody" and
 * drops every hidden bearer's light — the safe answer, and the right one for
 * the GM, who is never filtered by any of this in the first place.
 *
 * `liveOverride` moves one token's torch to where the pointer is, so the light
 * travels with the token during a drag instead of snapping into place when the
 * mover lets go.
 */
export function lightSourcesOf(
  scene: Scene,
  context: SceneVisionContext,
  viewerId: string | null,
  liveOverride?: { tokenId: string; x: number; y: number },
): LightSource[] {
  const sources = [...context.staticSources];
  const measure = toMeasureScene(scene);
  for (const [tokenId, entry] of context.carried) {
    if (entry.hidden && !(viewerId !== null && entry.owners.has(viewerId))) continue;
    if (liveOverride && liveOverride.tokenId === tokenId) {
      const moved = tokenCentre({ ...entry.token, x: liveOverride.x, y: liveOverride.y }, measure);
      sources.push({ ...entry.source, origin: moved });
      continue;
    }
    sources.push(entry.source);
  }
  return sources;
}

/**
 * Tokens that give this user sight on this scene: the ones they own, plus the
 * ones bound to a character they own.
 *
 * Hidden tokens count. A player who was given a hidden token can still see with
 * it — hiding is about what *others* may see, and the alternative would blind a
 * player for a reason they cannot observe.
 */
async function fetchVisionTokens(
  prisma: PrismaClient,
  sceneId: string,
  userId: string,
): Promise<Token[]> {
  return prisma.token.findMany({
    where: {
      sceneId,
      OR: [{ ownerId: userId }, { character: { ownerId: userId } }],
    },
  });
}

/** One thing that sees: where from, and how far. */
interface SightSource {
  origin: ScenePoint;
  radiusPx: number | null;
}

/** Turns one token into the origin and radius its sight is cast from. */
function visionSourceOf(
  token: Pick<Token, 'x' | 'y' | 'size' | 'visionRange'>,
  scene: Scene,
): SightSource {
  const measure = toMeasureScene(scene);
  // Sight is measured from the token's centre — the same point the ruler and
  // the range bands use, so „where a token is" means one thing across the VTT.
  const origin = tokenCentre(token, measure);
  if (token.visionRange === null) return { origin, radiusPx: null };
  const perPixel = metresPerPixel(measure);
  if (perPixel <= 0) return { origin, radiusPx: null };
  return { origin, radiusPx: token.visionRange / perPixel };
}

/**
 * The lighting one viewer's world is subject to — the sources plus the blockers
 * that shape them. Null on a scene that is not dark, where „in view" is the
 * whole of „visible".
 */
export interface ViewerLighting {
  sources: LightSource[];
  segments: Segment[];
  /** Panes the light gets through, at the cost of half its reach each. */
  windows: Segment[];
}

/**
 * What a viewer makes out with no light at all: a small disc around each of
 * their own tokens, blocked by the same walls.
 *
 * Deliberately *per viewer* rather than a property of the token. Modelling it as
 * a real light would mean a token in a pitch-black room glows for everyone and
 * darkness stops hiding anybody — the point of the setting is that you always
 * see your own square, not that everyone sees you in it.
 */
function darkSightSources(sources: readonly SightSource[], darkSightPx: number): LightSource[] {
  if (darkSightPx <= 0) return [];
  return sources.map((source) => ({
    origin: source.origin,
    // Dim, not bright: your own square in the dark should read as „made out",
    // and a token standing next to you in it is someone you would bump into.
    brightPx: 0,
    dimPx: source.radiusPx === null ? darkSightPx : Math.min(darkSightPx, source.radiusPx),
    color: '#ffffff',
    flicker: false,
  }));
}

/**
 * The polygons one player sees on this scene. Empty means „sees nothing" —
 * which is exactly what a player with no token on the scene gets, and is a
 * deliberate answer rather than a missing one.
 *
 * `liveOverride` lets a drag in flight be reflected before it is persisted: the
 * token being dragged is cast from where the pointer is, not from the position
 * still in the database.
 */
export async function visionPolygonsFor(
  prisma: PrismaClient,
  scene: Scene,
  userId: string,
  context: SceneVisionContext,
  liveOverride?: { tokenId: string; x: number; y: number },
): Promise<ScenePoint[][]> {
  return (await viewerSightFor(prisma, scene, userId, context, liveOverride)).polygons;
}

/** What one viewer's own tokens see, and what light they see it by. */
export interface ViewerSight {
  polygons: ScenePoint[][];
  lighting: ViewerLighting | null;
  /** The sight sources themselves — the door test and the glow list need them. */
  sources: SightSource[];
}

/**
 * The whole sight of one viewer in one pass: polygons, and on a dark scene the
 * lighting those polygons are read by.
 *
 * One function rather than two because the two answers share the expensive
 * inputs — the same wall list, the same token query, the same origins — and
 * because every caller that needs one of them needs the other in the next line.
 */
export async function viewerSightFor(
  prisma: PrismaClient,
  scene: Scene,
  userId: string,
  context: SceneVisionContext,
  liveOverride?: { tokenId: string; x: number; y: number },
): Promise<ViewerSight> {
  const tokens = await fetchVisionTokens(prisma, scene.id, userId);
  const sources = tokens.map((token) => {
    const positioned =
      liveOverride && liveOverride.tokenId === token.id
        ? { ...token, x: liveOverride.x, y: liveOverride.y }
        : token;
    return visionSourceOf(positioned, scene);
  });
  const polygons = sources.map((source) =>
    computeVisionPolygon(source.origin, context.segments, source.radiusPx),
  );
  const lighting: ViewerLighting | null = context.dark
    ? {
        sources: [
          ...lightSourcesOf(scene, context, userId, liveOverride),
          ...darkSightSources(sources, context.darkSightPx),
        ],
        segments: context.segments,
        windows: context.windows,
      }
    : null;
  return { polygons, lighting, sources };
}

/**
 * Can this viewer see that point right now?
 *
 * The single definition of visible in the project, and the reason it lives here
 * rather than being spelled out at each call site: on a lit scene it is „inside
 * the polygon", and on a dark one it also has to be „and something is shining on
 * it". A token that satisfies the first and not the second is standing in the
 * dark, and a player must not be told it exists.
 *
 * The GM's brush (stage 18c) speaks before either of them and settles it both
 * ways. That is the whole point of an override — a GM who painted an area black
 * did so knowing where the walls are — and it has to be answered here rather
 * than in the renderer, or „hidden" would mean a black rectangle with the token
 * list still describing what stands behind it.
 */
export function isPointObservable(
  point: ScenePoint,
  polygons: readonly (readonly ScenePoint[])[],
  lighting: ViewerLighting | null,
  overrides: readonly FogShapeView[],
): boolean {
  if (overrides.length > 0) {
    const override = fogOverrideAt(point, overrides);
    if (override === 'hide') return false;
    if (override === 'reveal') return true;
  }
  if (!isPointVisible(point, polygons)) return false;
  if (!lighting) return true;
  return isPointLit(point, lighting.sources, lighting.segments, lighting.windows);
}

/**
 * Doors this player may operate *and* can currently see.
 *
 * The one crack in „walls never reach a player", and a deliberate one: a door
 * nobody can see is a door nobody can open. The GM decides which doors are the
 * players' to work by flagging them, and even those only travel once they are
 * in line of sight — so a marked door deep in an unexplored building still
 * gives nothing away.
 *
 * On a dark scene the light has a say too (corrected in stage 18c). Stage 18a
 * exempted doors from darkness on the grounds that a door you have walked up to
 * is not a secret — which is true, and stays true, because „walked up to" is
 * inside the „po omacku" disc and that disc is a light source like any other.
 * What the exemption also did, and should not have, was hand a player the glyph
 * of a door across a pitch-black map: the door marker is drawn above the
 * darkness cover, so it read as a handle floating in the black. Anything a lamp
 * or a torch does not reach is now left out, the same as a token would be.
 */
export function visibleDoorsFor(
  context: SceneVisionContext,
  sources: readonly SightSource[],
  lighting: ViewerLighting | null,
): WallView[] {
  const doors = context.walls.filter((wall) => wall.kind === 'door' && wall.playerToggle);
  if (doors.length === 0 || sources.length === 0) return [];
  return doors.filter((door) => {
    const midpoint = wallMidpoint(door);
    // The GM's brush outranks the geometry here as it does everywhere else: a
    // door under a „hide" stroke is a door the players are not being shown.
    if (context.overrides.length > 0) {
      const override = fogOverrideAt(midpoint, context.overrides);
      if (override === 'hide') return false;
    }
    if (lighting && !isPointLit(midpoint, lighting.sources, lighting.segments, lighting.windows)) {
      return false;
    }
    // The door being tested is removed from the blockers: a closed door must
    // not hide itself.
    const others = context.segments.filter(
      (segment) =>
        !(
          segment.x1 === door.x1 &&
          segment.y1 === door.y1 &&
          segment.x2 === door.x2 &&
          segment.y2 === door.y2
        ),
    );
    return sources.some((source) => {
      if (source.radiusPx !== null) {
        const distance = Math.hypot(midpoint.x - source.origin.x, midpoint.y - source.origin.y);
        if (distance > source.radiusPx) return false;
      }
      return isSegmentClear(source.origin, midpoint, others);
    });
  });
}

/**
 * The lamps a viewer can actually see, for the coloured layer over the map.
 *
 * A lamp in line of sight is a lamp the character is looking at, so its
 * position, reach and colour are not a secret — and that is all this carries.
 * The walls that shape its light stay behind; whatever the glow spills past a
 * corner is trimmed by the darkness cover drawn over it.
 */
export function visibleGlowsFor(
  lightSources: readonly LightSource[],
  sight: readonly SightSource[],
  segments: readonly Segment[],
): LightGlow[] {
  if (sight.length === 0) return [];
  const glows: LightGlow[] = [];
  for (const light of lightSources) {
    const reach = lightReachPx(light);
    if (reach <= 0) continue;
    const seen = sight.some((viewer) => {
      const distance = Math.hypot(
        light.origin.x - viewer.origin.x,
        light.origin.y - viewer.origin.y,
      );
      // Beyond your own sight limit you cannot see the lamp itself — but its
      // light may still reach you, and the mask says so on its own.
      if (viewer.radiusPx !== null && distance > viewer.radiusPx) return false;
      return isSegmentClear(viewer.origin, light.origin, segments);
    });
    if (!seen) continue;
    glows.push({
      x: light.origin.x,
      y: light.origin.y,
      brightPx: light.brightPx,
      dimPx: light.dimPx,
      color: light.color,
      flicker: light.flicker,
    });
  }
  return glows;
}

/** What one player's socket needs after any change to what they can see. */
export interface ViewerVision {
  polygons: ScenePoint[][];
  doors: WallView[];
  /** Light levels inside the polygons; null on a scene that is not dark. */
  light: LightMask | null;
  glows: LightGlow[];
}

/**
 * Builds the light mask of one viewer: the levels inside their own field of
 * view, and nothing outside it. Null when there is no field of view to describe
 * — a player with no token gets black from the empty polygon list alone.
 */
export function lightMaskFor(
  context: SceneVisionContext,
  polygons: readonly ScenePoint[][],
  lighting: ViewerLighting,
): LightMask | null {
  const bounds = polygonsBounds(polygons);
  if (!bounds) return null;
  return buildLightMask({
    bounds,
    cellPx: context.maskCellPx,
    sources: lighting.sources,
    segments: lighting.segments,
    windows: lighting.windows,
    polygons,
  });
}

/**
 * Everything one viewer sees on a dynamic scene. Returns null for the GM and
 * for scenes that do not use walls — the caller then sends nothing, and the
 * client renders no cover.
 */
export async function computeViewerVision(
  prisma: PrismaClient,
  scene: Scene,
  user: SessionUser,
  context?: SceneVisionContext,
): Promise<ViewerVision | null> {
  if (!usesDynamicVision(scene) || user.role === ROLE_GM) return null;
  const ctx = context ?? (await loadVisionContext(prisma, scene));
  const sight = await viewerSightFor(prisma, scene, user.id, ctx);
  return {
    polygons: sight.polygons,
    doors: visibleDoorsFor(ctx, sight.sources, sight.lighting),
    light: sight.lighting ? lightMaskFor(ctx, sight.polygons, sight.lighting) : null,
    glows: sight.lighting
      ? visibleGlowsFor(lightSourcesOf(scene, ctx, user.id), sight.sources, ctx.segments)
      : [],
  };
}

/**
 * How often a player's own field of view is recomputed while they drag a token,
 * in milliseconds. Ten pushes a second is smooth enough that the darkness feels
 * attached to the token, and it is the price of keeping the walls on the server:
 * a client holding the geometry could redraw every frame, and would also hold
 * the floor plan.
 */
const DRAG_VISION_INTERVAL_MS = 100;
/** userId:sceneId → when their vision was last pushed mid-drag. */
const lastDragPush = new Map<string, number>();

/**
 * Pushes one moving player their own field of view, at most ten times a second.
 * `force` (the drop) always goes through — the position that got persisted must
 * never be the one frame that was throttled away.
 */
export async function emitDragVision(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  userId: string,
  live: { tokenId: string; x: number; y: number },
  force: boolean,
): Promise<void> {
  if (!scene.active || !usesDynamicVision(scene)) return;
  const key = `${userId}:${scene.id}`;
  const now = Date.now();
  if (!force && now - (lastDragPush.get(key) ?? 0) < DRAG_VISION_INTERVAL_MS) return;
  lastDragPush.set(key, now);

  const context = await loadVisionContext(deps.ctx.prisma, scene);
  const sight = await viewerSightFor(deps.ctx.prisma, scene, userId, context, live);
  const light = sight.lighting ? lightMaskFor(context, sight.polygons, sight.lighting) : null;
  await emitToCampaignUser(deps.io, campaignId, userId, 'vision:sync', {
    sceneId: scene.id,
    polygons: sight.polygons,
    light,
    glows: sight.lighting
      ? visibleGlowsFor(
          lightSourcesOf(scene, context, userId, live),
          sight.sources,
          context.segments,
        )
      : [],
  });
  // Walking is how a map gets discovered, so the memory grows mid-drag too —
  // and only when it actually grew does anybody hear about it.
  if (await recordSight(deps.ctx.prisma, scene, { polygons: sight.polygons, mask: light })) {
    await emitExploration(deps, campaignId, scene);
  }
}

/**
 * Pushes every player viewing this scene their own field of view, light mask and
 * door list.
 *
 * Targeted per socket without a seq, like `token:sync`: every player's polygons
 * differ, so this could never be a room broadcast. Only the active scene has
 * player viewers, so a GM's private preview costs nothing.
 */
export async function emitVisionToPlayers(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  options?: { onlyUserIds?: ReadonlySet<string> },
): Promise<void> {
  if (!scene.active || !usesDynamicVision(scene)) return;
  const context = await loadVisionContext(deps.ctx.prisma, scene);
  const sockets = await deps.io.in(campaignRoom(campaignId)).fetchSockets();
  let discovered = false;
  for (const member of sockets) {
    const data = member.data as { user: SessionUser; viewedSceneId: string | null };
    if (data.user.role === ROLE_GM || data.viewedSceneId !== scene.id) continue;
    if (options?.onlyUserIds && !options.onlyUserIds.has(data.user.id)) continue;
    const vision = await computeViewerVision(deps.ctx.prisma, scene, data.user, context);
    if (!vision) continue;
    member.emit('vision:sync', {
      sceneId: scene.id,
      polygons: vision.polygons,
      light: vision.light,
      glows: vision.glows,
    });
    member.emit('door:sync', { sceneId: scene.id, doors: vision.doors });
    // Every player's sight goes into the same memory: what the scout sees, the
    // group knows. Accumulated over the loop and pushed once at the end.
    if (
      await recordSight(deps.ctx.prisma, scene, {
        polygons: vision.polygons,
        mask: vision.light,
      })
    ) {
      discovered = true;
    }
  }
  if (discovered) await emitExploration(deps, campaignId, scene);
}
