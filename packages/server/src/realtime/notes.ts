import type {
  MapNoteView,
  NoteCreatePayload,
  NoteDeleteBroadcast,
  NoteIdPayload,
  NoteUpdatePayload,
  NoteUpsertBroadcast,
} from '@vtt/shared';
import { ROLE_GM, sanitizeNoteIcon, sanitizeNoteText, sanitizeNotePatch } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { MapNote } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { requireCampaignScene } from './scenes.js';
import { gmRoom } from './state.js';
import { rememberDeletion, scalarRow } from './undo-buffer.js';

/**
 * The GM layer (stage 17): pinned notes only the GM ever receives.
 *
 * There is no player-facing branch anywhere in this module — every emission
 * goes to `gmRoom`, and `state:sync` fills the list only for a GM socket. That
 * is the whole point: „warstwa MG" is a server-side audience, not a CSS class
 * a curious player could flip in devtools.
 *
 * Notes carry no seq for the same reason whispers do not: the campaign
 * sequence counts events every client should receive, and a targeted emission
 * that consumed one would make players think they had missed something.
 */

export function toNoteView(note: MapNote): MapNoteView {
  return {
    id: note.id,
    sceneId: note.sceneId,
    x: note.x,
    y: note.y,
    icon: sanitizeNoteIcon(note.icon),
    text: note.text,
  };
}

/** Notes of a scene — callers must already have established the viewer is GM. */
export async function fetchSceneNotes(
  prisma: PrismaClient,
  sceneId: string,
): Promise<MapNoteView[]> {
  const rows = await prisma.mapNote.findMany({
    where: { sceneId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(toNoteView);
}

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

/** Loads a note and proves it belongs to this campaign. */
async function requireCampaignNote(
  prisma: PrismaClient,
  campaignId: string,
  noteId: unknown,
): Promise<MapNote> {
  if (typeof noteId !== 'string' || noteId.length === 0) throw new RealtimeError('BAD_REQUEST');
  const note = await prisma.mapNote.findUnique({
    where: { id: noteId },
    include: { scene: { select: { campaignId: true } } },
  });
  if (!note || note.scene.campaignId !== campaignId) throw new RealtimeError('NOTE_NOT_FOUND');
  const { scene: _scene, ...row } = note;
  return row as MapNote;
}

export function emitNoteUpsert(deps: RealtimeDeps, campaignId: string, note: MapNoteView): void {
  deps.io.to(gmRoom(campaignId)).emit('note:upsert', { note } satisfies NoteUpsertBroadcast);
}

export const noteCreateEvent = defineEvent<NoteCreatePayload, MapNoteView>({
  name: 'note:create',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    const text = sanitizeNoteText(payload?.text);
    if (text === null) throw new RealtimeError('BAD_REQUEST');
    if (typeof payload?.x !== 'number' || typeof payload?.y !== 'number') {
      throw new RealtimeError('BAD_REQUEST');
    }
    if (!Number.isFinite(payload.x) || !Number.isFinite(payload.y)) {
      throw new RealtimeError('BAD_REQUEST');
    }

    const note = await deps.ctx.prisma.mapNote.create({
      data: {
        sceneId: scene.id,
        x: Math.round(payload.x),
        y: Math.round(payload.y),
        icon: sanitizeNoteIcon(payload.icon),
        text,
      },
    });
    const view = toNoteView(note);
    emitNoteUpsert(deps, campaignId, view);
    return view;
  },
});

export const noteUpdateEvent = defineEvent<NoteUpdatePayload, MapNoteView>({
  name: 'note:update',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const note = await requireCampaignNote(deps.ctx.prisma, campaignId, payload?.noteId);
    const patch = sanitizeNotePatch(payload?.patch);
    if (patch === null) throw new RealtimeError('BAD_REQUEST');

    const updated = await deps.ctx.prisma.mapNote.update({
      where: { id: note.id },
      data: {
        ...(patch.x !== undefined ? { x: patch.x } : {}),
        ...(patch.y !== undefined ? { y: patch.y } : {}),
        ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
        ...(patch.text !== undefined ? { text: patch.text } : {}),
      },
    });
    const view = toNoteView(updated);
    emitNoteUpsert(deps, campaignId, view);
    return view;
  },
});

export const noteDeleteEvent = defineEvent<NoteIdPayload>({
  name: 'note:delete',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const note = await requireCampaignNote(deps.ctx.prisma, campaignId, payload?.noteId);
    rememberDeletion({
      campaignId,
      userId: user.id,
      sceneId: note.sceneId,
      kind: 'note',
      rows: [scalarRow(note)],
    });
    await deps.ctx.prisma.mapNote.delete({ where: { id: note.id } });
    deps.io.to(gmRoom(campaignId)).emit('note:delete', {
      sceneId: note.sceneId,
      noteId: note.id,
    } satisfies NoteDeleteBroadcast);
  },
});
