import type {
  DrawingClearBroadcast,
  DrawingClearPayload,
  DrawingCreatePayload,
  DrawingDeleteBroadcast,
  DrawingDeletePayload,
  DrawingUpdatePayload,
  DrawingUpsertBroadcast,
  DrawingView,
} from '@vtt/shared';
import {
  DRAWING_MAX_PER_SCENE,
  ROLE_GM,
  sanitizeDrawingShape,
  sanitizeDrawingStyle,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { MapDrawing, Scene } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { requireCampaignScene } from './scenes.js';
import { rememberDeletion, scalarRow } from './undo-buffer.js';
import { campaignRoom, gmRoom, sceneRoom } from './state.js';

/**
 * Map drawings (stage 17b) — core VTT, no game system involved.
 *
 * The geometry lives in `@vtt/shared` (`drawings.ts`); this module stores it,
 * decides who may erase what and — the part that matters — who hears about it
 * at all.
 *
 * Two audiences, one rule: a drawing with `gmOnly` goes to `gmRoom` and
 * nowhere else, exactly like a note pin from 17a, while a public one follows
 * the fog's pattern (sequenced campaign-wide on the active scene, targeted at
 * the scene room when the GM is painting on a map nobody else is looking at).
 * There is no third branch where a GM-layer drawing could slip into a player
 * payload — the check happens once, here.
 *
 * Deliberate limit: public drawings are **not** filtered by fog. A drawing is
 * a shared annotation, and the fog hides it visually the moment it is painted
 * over; anything that must stay secret belongs on the GM layer, which is why
 * that is the GM's default in the toolbar.
 */

type DrawingRow = MapDrawing & { author: { name: string } };

/** Rebuilds a stored row into the shared view; null when the JSON is unusable. */
export function toDrawingView(row: DrawingRow): DrawingView | null {
  let geometry: unknown;
  try {
    geometry = JSON.parse(row.data);
  } catch {
    return null;
  }
  if (typeof geometry !== 'object' || geometry === null) return null;
  // Validated on the way in; re-validated on the way out, so a hand-edited
  // database can never reach the renderer or the hit test.
  const shape = sanitizeDrawingShape({ ...geometry, kind: row.kind });
  if (!shape) return null;
  return {
    id: row.id,
    sceneId: row.sceneId,
    authorId: row.authorId,
    authorName: row.author.name,
    gmOnly: row.gmOnly,
    shape,
    style: sanitizeDrawingStyle({ color: row.color, width: row.width, filled: row.filled }),
  };
}

/** Flattens a shape into the columns the table stores. */
function toDrawingRowData(shape: NonNullable<ReturnType<typeof sanitizeDrawingShape>>): {
  kind: string;
  data: string;
} {
  const { kind, ...geometry } = shape;
  return { kind, data: JSON.stringify(geometry) };
}

/**
 * Drawings of one scene, in paint order. `includeGmLayer` is the whole access
 * control: a player call simply never selects those rows.
 */
export async function fetchSceneDrawings(
  prisma: PrismaClient,
  sceneId: string,
  includeGmLayer: boolean,
): Promise<DrawingView[]> {
  const rows = await prisma.mapDrawing.findMany({
    where: { sceneId, ...(includeGmLayer ? {} : { gmOnly: false }) },
    orderBy: { id: 'asc' },
    include: { author: { select: { name: true } } },
  });
  return rows.map(toDrawingView).filter((drawing): drawing is DrawingView => drawing !== null);
}

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

/**
 * Sends one drawing event to the audience that may see it. `gmOnly` short-
 * circuits to the GM room; everything else follows the scene, sequenced only
 * when it goes campaign-wide (a targeted emission must never consume a seq —
 * the gap would make every other client think it had missed an event).
 */
export function emitDrawingEvent(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Pick<Scene, 'id' | 'active'>,
  gmOnly: boolean,
  event: string,
  payload: Record<string, unknown>,
): void {
  if (gmOnly) {
    deps.io.to(gmRoom(campaignId)).emit(event, payload);
    return;
  }
  if (!scene.active) {
    deps.io.to(sceneRoom(scene.id)).emit(event, payload);
    return;
  }
  const room = campaignRoom(campaignId);
  deps.io.to(room).emit(event, { ...payload, seq: deps.seqs.next(room) });
}

export const drawingCreateEvent = defineEvent<DrawingCreatePayload, DrawingView>({
  name: 'drawing:create',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    // Drawing is an act of looking at a map: a client may only annotate the
    // scene its own socket is in, which keeps a player from scribbling on a
    // scene the GM is preparing.
    if (socket.data.viewedSceneId !== scene.id) throw new RealtimeError('SCENE_NOT_VIEWED');

    const shape = sanitizeDrawingShape(payload?.shape);
    if (!shape) throw new RealtimeError('BAD_REQUEST');
    const style = sanitizeDrawingStyle(payload?.style);
    // The GM layer is a role, not a client flag — a player asking for it is
    // simply drawing in public.
    const gmOnly = user.role === ROLE_GM && payload?.gmOnly === true;

    const stored = await deps.ctx.prisma.mapDrawing.count({ where: { sceneId: scene.id } });
    if (stored >= DRAWING_MAX_PER_SCENE) throw new RealtimeError('DRAWING_LIMIT_REACHED');

    const row = await deps.ctx.prisma.mapDrawing.create({
      data: {
        sceneId: scene.id,
        authorId: user.id,
        ...toDrawingRowData(shape),
        color: style.color,
        width: style.width,
        filled: style.filled,
        gmOnly,
      },
      include: { author: { select: { name: true } } },
    });
    const view = toDrawingView(row);
    if (!view) throw new RealtimeError('INTERNAL');

    emitDrawingEvent(deps, campaignId, scene, gmOnly, 'drawing:upsert', {
      drawing: view,
    } satisfies Omit<DrawingUpsertBroadcast, 'seq'>);
    return view;
  },
});

/**
 * Karta rysunku (etap 27l) — kolor, grubość, wypełnienie, warstwa i treść
 * etykiety **po** postawieniu kreski.
 *
 * Do 27l kreska była niezmienna: literówka w podpisie albo szkic postawiony
 * na warstwie MG znaczyły „skasuj i narysuj od nowa". Prawo do edycji jest tu
 * dokładnie takie jak prawo do gumki — swoje kreski są twoje, mapa należy do
 * MG — bo to jest ta sama umowa wspólnej tablicy.
 *
 * Najtrudniejszą częścią nie jest zapis, tylko **zmiana publiczności**.
 * Przeniesienie z warstwy MG na wspólną daje graczom rysunek, którego nigdy
 * nie dostali (zwykły `drawing:upsert`), ale przeniesienie w drugą stronę
 * musi im go **zabrać**: ich klienty trzymają go od chwili narysowania i żaden
 * upsert do pokoju MG tego nie odwróci. Stąd `drawing:delete` do publiczności
 * przed upsertem do MG — inaczej „schowałem to za ekran" byłoby wyłącznie
 * moim wrażeniem.
 */
export const drawingUpdateEvent = defineEvent<DrawingUpdatePayload, DrawingView>({
  name: 'drawing:update',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const drawingId = payload?.drawingId;
    if (typeof drawingId !== 'number' || !Number.isInteger(drawingId)) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const row = await deps.ctx.prisma.mapDrawing.findUnique({
      where: { id: drawingId },
      include: { scene: { select: { campaignId: true, active: true } } },
    });
    if (!row || row.scene.campaignId !== campaignId) throw new RealtimeError('DRAWING_NOT_FOUND');
    if (socket.data.viewedSceneId !== row.sceneId) throw new RealtimeError('SCENE_NOT_VIEWED');
    // Ta sama reguła, co przy gumce: swoje kreski są twoje, mapa należy do MG.
    if (user.role !== ROLE_GM && row.authorId !== user.id) throw new RealtimeError('FORBIDDEN');

    const patch = payload?.patch;
    if (typeof patch !== 'object' || patch === null) throw new RealtimeError('BAD_REQUEST');

    const style = sanitizeDrawingStyle({
      color: patch.style?.color ?? row.color,
      width: patch.style?.width ?? row.width,
      filled: patch.style?.filled ?? row.filled,
    });

    let geometry: { kind: string; data: string } | null = null;
    if (patch.shape !== undefined) {
      const shape = sanitizeDrawingShape(patch.shape);
      if (!shape) throw new RealtimeError('BAD_REQUEST');
      // Rodzaj kształtu jest tożsamością rysunku, nie jego ustawieniem: karta
      // otwarta nad prostokątem nie ma jak zamienić go w napis, a payload,
      // który tego próbuje, jest pomyłką klienta.
      if (shape.kind !== row.kind) throw new RealtimeError('BAD_REQUEST');
      geometry = toDrawingRowData(shape);
    }

    // Warstwa MG jest rolą, nie flagą klienta — gracz, który o nią prosi,
    // po prostu rysuje publicznie (tak samo jak przy `drawing:create`).
    const gmOnly =
      user.role === ROLE_GM && patch.gmOnly !== undefined ? patch.gmOnly === true : row.gmOnly;

    const updated = await deps.ctx.prisma.mapDrawing.update({
      where: { id: row.id },
      data: {
        ...(geometry ?? {}),
        color: style.color,
        width: style.width,
        filled: style.filled,
        gmOnly,
      },
      include: { author: { select: { name: true } } },
    });
    const view = toDrawingView(updated);
    if (!view) throw new RealtimeError('INTERNAL');

    const scene = { id: row.sceneId, active: row.scene.active };
    if (row.gmOnly && !gmOnly) {
      // Za ekran → na stół: gracze dostają go pierwszy raz, więc zwykły upsert
      // do publiczności wystarcza.
      emitDrawingEvent(deps, campaignId, scene, false, 'drawing:upsert', {
        drawing: view,
      } satisfies Omit<DrawingUpsertBroadcast, 'seq'>);
      return view;
    }
    if (!row.gmOnly && gmOnly) {
      emitDrawingEvent(deps, campaignId, scene, false, 'drawing:delete', {
        sceneId: row.sceneId,
        drawingId: row.id,
      } satisfies Omit<DrawingDeleteBroadcast, 'seq'>);
      emitDrawingEvent(deps, campaignId, scene, true, 'drawing:upsert', {
        drawing: view,
      } satisfies Omit<DrawingUpsertBroadcast, 'seq'>);
      return view;
    }
    emitDrawingEvent(deps, campaignId, scene, gmOnly, 'drawing:upsert', {
      drawing: view,
    } satisfies Omit<DrawingUpsertBroadcast, 'seq'>);
    return view;
  },
});

export const drawingDeleteEvent = defineEvent<DrawingDeletePayload>({
  name: 'drawing:delete',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const drawingId = payload?.drawingId;
    if (typeof drawingId !== 'number' || !Number.isInteger(drawingId)) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const row = await deps.ctx.prisma.mapDrawing.findUnique({
      where: { id: drawingId },
      include: { scene: { select: { campaignId: true, active: true } } },
    });
    if (!row || row.scene.campaignId !== campaignId) throw new RealtimeError('DRAWING_NOT_FOUND');
    // The shared whiteboard rule: your own lines are yours, the GM owns the map.
    if (user.role !== ROLE_GM && row.authorId !== user.id) throw new RealtimeError('FORBIDDEN');

    // Także graczowi: `Ctrl+Z` u gracza cofa jego własną kreskę, bo to jedyna
    // rzecz, którą gracz w ogóle może usunąć (etap 27k). Rozstrzyga `userId` w
    // buforze, nie rola.
    const { scene: _scene, ...columns } = row;
    rememberDeletion({
      campaignId,
      userId: user.id,
      sceneId: row.sceneId,
      kind: 'drawing',
      rows: [scalarRow(columns)],
    });
    await deps.ctx.prisma.mapDrawing.delete({ where: { id: row.id } });
    emitDrawingEvent(
      deps,
      campaignId,
      { id: row.sceneId, active: row.scene.active },
      row.gmOnly,
      'drawing:delete',
      { sceneId: row.sceneId, drawingId: row.id } satisfies Omit<DrawingDeleteBroadcast, 'seq'>,
    );
  },
});

export const drawingClearEvent = defineEvent<DrawingClearPayload>({
  name: 'drawing:clear',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    const scope = payload?.scope;
    if (scope !== 'mine' && scope !== 'all') throw new RealtimeError('BAD_REQUEST');
    if (scope === 'all' && user.role !== ROLE_GM) throw new RealtimeError('FORBIDDEN');

    const authorId = scope === 'mine' ? user.id : null;
    const where = { sceneId: scene.id, ...(authorId ? { authorId } : {}) };
    const doomed = await deps.ctx.prisma.mapDrawing.findMany({ where });
    rememberDeletion({
      campaignId,
      userId: user.id,
      sceneId: scene.id,
      kind: 'drawing',
      rows: doomed.map(scalarRow),
    });
    await deps.ctx.prisma.mapDrawing.deleteMany({ where });

    // The broadcast carries the rule rather than the resulting list: every
    // client already holds the drawings it is allowed to see, so „drop the
    // ones by this author" lands correctly on each of them without the server
    // composing a different payload per viewer. It goes to the public audience
    // because a sweep can take public drawings with it; a GM applying it also
    // drops their own GM-layer ones, which is exactly what was deleted.
    emitDrawingEvent(deps, campaignId, scene, false, 'drawing:clear', {
      sceneId: scene.id,
      authorId,
    } satisfies Omit<DrawingClearBroadcast, 'seq'>);
  },
});
