import type { LightView, SceneView, TokenLight } from '@vtt/shared';
import { LIGHT_DEFAULT_COLOR, orderLightRadii, toLightSource, type LightSource } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { MapLight, Scene, Token } from '../generated/prisma/client.js';

/**
 * Reading light rows (stage 18b).
 *
 * Split out of `lights.ts` for the reason `walls-io.ts` was split out of the
 * walls: the vision calculation needs „what is lit on this scene?" without
 * importing the event handlers, and the handlers need to push a fresh vision
 * after every edit without importing themselves back.
 */

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** A hand-edited colour must not reach the renderer; the fallback is the warm bulb. */
function safeColor(raw: string): string {
  return HEX_COLOR_RE.test(raw) ? raw.toLowerCase() : LIGHT_DEFAULT_COLOR;
}

export function toLightView(row: MapLight): LightView {
  const ordered = orderLightRadii(Math.max(0, row.brightM), Math.max(0, row.dimM));
  return {
    id: row.id,
    sceneId: row.sceneId,
    x: row.x,
    y: row.y,
    ...ordered,
    color: safeColor(row.color),
    flicker: row.flicker,
    enabled: row.enabled,
  };
}

/**
 * Lights of one scene, in creation order. Deliberately un-cached, like the
 * walls: a scene holds tens of rows, SQLite is local, and a cache invalidated
 * from every light edit, door toggle and token move is exactly the bookkeeping
 * that eventually shows a player a room they should not see.
 */
export async function fetchSceneLights(
  prisma: PrismaClient,
  sceneId: string,
): Promise<LightView[]> {
  const rows = await prisma.mapLight.findMany({ where: { sceneId }, orderBy: { id: 'asc' } });
  return rows.map(toLightView);
}

/** The light a token carries, as the shared view — null when it carries none. */
export function tokenLightOf(
  token: Pick<Token, 'lightBrightM' | 'lightDimM' | 'lightColor' | 'lightFlicker' | 'lightOn'>,
): TokenLight | null {
  const ordered = orderLightRadii(Math.max(0, token.lightBrightM), Math.max(0, token.lightDimM));
  if (ordered.dimM <= 0) return null;
  return {
    ...ordered,
    color: safeColor(token.lightColor),
    flicker: token.lightFlicker,
    on: token.lightOn,
  };
}

/** Scene fields the metre↔pixel conversion needs off a database row. */
export function toLightScene(scene: Scene): Pick<SceneView, 'grid' | 'metersPerSquare'> {
  return {
    grid: {
      sizePx: scene.gridSizePx,
      offsetX: scene.gridOffsetX,
      offsetY: scene.gridOffsetY,
      color: scene.gridColor,
      alpha: scene.gridAlpha,
      visible: scene.gridVisible,
    },
    metersPerSquare: scene.metersPerSquare,
  };
}

/** A stored light as a renderer-space source; switched-off lights are skipped. */
export function lightSourceOf(light: LightView, scene: Scene): LightSource | null {
  if (!light.enabled) return null;
  const source = toLightSource({ x: light.x, y: light.y }, light, toLightScene(scene));
  return source.dimPx > 0 || source.brightPx > 0 ? source : null;
}
