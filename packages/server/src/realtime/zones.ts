import type {
  ChatMessageView,
  CombatActionLogEntry,
  CompendiumEntry,
  DefenseZoneClearPayload,
  DefenseZoneCreatePayload,
  DefenseZoneDeletePayload,
  DefenseZoneFirePayload,
  DefenseZoneUpdatePayload,
  DefenseZoneView,
  ScenePoint,
  SessionUser,
} from '@vtt/shared';
import {
  CPRED_ACTION_NET,
  ROLE_GM,
  ZONE_EXEMPT_MAX,
  ZONE_MAX_PER_SCENE,
  ZONE_NOTES_MAX,
  ZONE_SPOT_RANGE_M,
  cpredAmmoCheckOutcome,
  distanceToRect,
  isNetDefenseEntry,
  isPointInRect,
  metresPerPixel,
  netDefenseActs,
  netDefenseTrigger,
  netDeviceStateOf,
  readNetRuntime,
  sanitizeZoneName,
  sanitizeZoneRect,
  segmentCrossesRect,
  tokenCentre,
  tokenTableName,
} from '@vtt/shared';
import type { DefenseZone as ZoneRow, Scene, Token } from '../generated/prisma/client.js';
import { SHEET_SLOWED_STATUS_ID, writeSheetStatusData } from '../sheets.js';
import { buildCompendiumSync } from './compendium.js';
import { INCLUDE_CHAT_NAMES, broadcastChatMessage, toChatMessageView } from './chat-io.js';
import { createMixedRng } from './dice-rng.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { rememberDeletion, scalarRow } from './undo-buffer.js';
import { emitCombatOfScene, loadCombat } from './combat.js';
import { requireCampaignScene, toSceneView } from './scenes.js';
import { emitTokensById } from './tokens.js';
import { checkPerceptionOf, controllerOf, fireZone, type ZoneProfile } from './zone-effects.js';
import {
  emitZones,
  fetchSceneZones,
  readZoneExempt,
  readZoneSightings,
  toZoneView,
  writeZoneSightings,
} from './zones-io.js';

/**
 * Defended zones on the map (stage 26f) — storage, switches and the hook that
 * makes one go off.
 *
 * The geometry lives in `@vtt/shared` (`zones.ts`), what a system *does* lives
 * on its compendium row (`CpredNetDefenseEffects`), and applying that is
 * `zone-effects.ts`. What is left here is the part only the server may be
 * trusted with:
 *
 *  - **the numbers come from the catalogue, never from the wire.** A placement
 *    names an entry and a rectangle; body points, Combat Value and the whole
 *    effect are read off the entry, exactly as a cover's body points are read
 *    off its preset in 16c;
 *  - **the trigger hangs on the one hook every walk already lands on.** Stage
 *    26b put the emergency disconnect in `performTokenMove`; a second place
 *    that means „a figure moved" is how the two drift apart;
 *  - **a hidden zone stays hidden by being absent**, and the Perception roll
 *    that reveals it happens here, on the server, once per character.
 */

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

/** Loads a zone row and proves it belongs to this campaign. */
async function requireCampaignZone(deps: RealtimeDeps, campaignId: string, zoneId: unknown) {
  if (typeof zoneId !== 'number' || !Number.isInteger(zoneId)) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const row = await deps.ctx.prisma.defenseZone.findUnique({
    where: { id: zoneId },
    include: { scene: true },
  });
  if (!row || row.scene.campaignId !== campaignId) throw new RealtimeError('ZONE_NOT_FOUND');
  return row;
}

/**
 * The catalogue row behind a zone, reduced to what the engine reads.
 *
 * Returns null for an entry that has gone missing — a zone whose row the GM
 * deleted stays on the map as a rectangle and does nothing, which is the same
 * bargain a weapon row with a dangling `compendiumId` has had since stage 07.
 */
export function zoneProfileOf(
  entries: readonly CompendiumEntry[],
  entryId: string,
): (ZoneProfile & { spotDv: number | undefined; hp: number | undefined }) | null {
  const entry = entries.find((row) => row.id === entryId);
  if (!entry || !isNetDefenseEntry(entry)) return null;
  return {
    name: entry.name,
    effects: entry.effects,
    combatValue: entry.combatValue,
    spotDv: entry.spotDv,
    hp: entry.hp,
  };
}

// ─────────────────────────────── zdarzenia MG ───────────────────────────────

export const zoneCreateEvent = defineEvent<DefenseZoneCreatePayload, DefenseZoneView>({
  name: 'zone:create',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    const rect = sanitizeZoneRect({
      x: payload?.x,
      y: payload?.y,
      width: payload?.width,
      height: payload?.height,
    });
    if (!rect) throw new RealtimeError('BAD_REQUEST');
    if (typeof payload?.entryId !== 'string') throw new RealtimeError('BAD_REQUEST');

    const { entries } = await buildCompendiumSync(deps, campaignId);
    const profile = zoneProfileOf(entries, payload.entryId);
    if (!profile) throw new RealtimeError('ZONE_UNKNOWN_ENTRY');

    const stored = await deps.ctx.prisma.defenseZone.count({ where: { sceneId: scene.id } });
    if (stored >= ZONE_MAX_PER_SCENE) throw new RealtimeError('ZONE_LIMIT_REACHED');

    // A system with a Perception DV is a trap and starts hidden; a turret bolted
    // to the ceiling is a machine everybody can see. The GM's toggle overrides
    // both, which is why the default is only a default.
    const hidden =
      typeof payload.hidden === 'boolean' ? payload.hidden : profile.spotDv !== undefined;
    const hp = profile.hp ?? 0;

    const created = await deps.ctx.prisma.defenseZone.create({
      data: {
        sceneId: scene.id,
        entryId: payload.entryId,
        name: sanitizeZoneName(payload.name) ?? profile.name,
        ...rect,
        hidden,
        hpMax: hp,
        hpCurrent: hp,
      },
    });
    await emitZones(deps, campaignId, scene.id);
    return toZoneView(created, true, false);
  },
});

export const zoneUpdateEvent = defineEvent<DefenseZoneUpdatePayload, DefenseZoneView>({
  name: 'zone:update',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const row = await requireCampaignZone(deps, campaignId, payload?.zoneId);
    const patch = payload?.patch;
    if (typeof patch !== 'object' || patch === null) throw new RealtimeError('BAD_REQUEST');

    const data: Record<string, unknown> = {};

    if (
      patch.x !== undefined ||
      patch.y !== undefined ||
      patch.width !== undefined ||
      patch.height !== undefined
    ) {
      const rect = sanitizeZoneRect({
        x: patch.x ?? row.x,
        y: patch.y ?? row.y,
        width: patch.width ?? row.width,
        height: patch.height ?? row.height,
      });
      if (!rect) throw new RealtimeError('BAD_REQUEST');
      Object.assign(data, rect);
    }

    if (patch.name !== undefined) {
      const name = sanitizeZoneName(patch.name);
      if (!name) throw new RealtimeError('BAD_REQUEST');
      data.name = name;
    }
    if (typeof patch.armed === 'boolean') data.armed = patch.armed;
    if (typeof patch.hidden === 'boolean') data.hidden = patch.hidden;
    if (patch.hpCurrent !== undefined) {
      if (typeof patch.hpCurrent !== 'number' || !Number.isInteger(patch.hpCurrent)) {
        throw new RealtimeError('BAD_REQUEST');
      }
      data.hpCurrent = Math.max(0, Math.min(patch.hpCurrent, row.hpMax));
    }
    if (patch.exempt !== undefined) {
      if (!Array.isArray(patch.exempt)) throw new RealtimeError('BAD_REQUEST');
      const ids = patch.exempt
        .filter((id): id is string => typeof id === 'string')
        .slice(0, ZONE_EXEMPT_MAX);
      data.exempt = JSON.stringify([...new Set(ids)]);
    }
    if (patch.tokenId !== undefined) data.tokenId = patch.tokenId || null;
    if (patch.architectureId !== undefined) data.architectureId = patch.architectureId || null;
    if (patch.floorId !== undefined) data.floorId = patch.floorId || null;
    if (patch.deviceId !== undefined) data.deviceId = patch.deviceId || null;
    if (patch.notes !== undefined) {
      if (typeof patch.notes !== 'string') throw new RealtimeError('BAD_REQUEST');
      data.notes = patch.notes.slice(0, ZONE_NOTES_MAX);
    }

    if (Object.keys(data).length === 0) return toZoneView(row, true, false);
    const updated = await deps.ctx.prisma.defenseZone.update({ where: { id: row.id }, data });
    await emitZones(deps, campaignId, row.sceneId);
    // Rozbrojona albo rozstrzelana pułapka nie ma już czym zająć swojej Tury.
    const dead = updated.hpMax > 0 && updated.hpCurrent <= 0;
    if (!updated.armed || dead) await dropZoneFromQueue(deps, campaignId, row.sceneId, row.id);
    return toZoneView(updated, true, false);
  },
});

export const zoneDeleteEvent = defineEvent<DefenseZoneDeletePayload>({
  name: 'zone:delete',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const row = await requireCampaignZone(deps, campaignId, payload?.zoneId);
    rememberDeletion({
      campaignId,
      userId: user.id,
      sceneId: row.sceneId,
      kind: 'zone',
      rows: [scalarRow(row)],
    });
    await deps.ctx.prisma.defenseZone.delete({ where: { id: row.id } });
    await emitZones(deps, campaignId, row.sceneId);
    await dropZoneFromQueue(deps, campaignId, row.sceneId, row.id);
  },
});

export const zoneClearEvent = defineEvent<DefenseZoneClearPayload>({
  name: 'zone:clear',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    // Całe wiersze, nie same id: kosz odkłada je jako jedną pozycję cofania
    // (etap 27k), a strefa niesie PW, uzbrojenie i listę zwolnionych z pułapki.
    const doomed = await deps.ctx.prisma.defenseZone.findMany({ where: { sceneId: scene.id } });
    rememberDeletion({
      campaignId,
      userId: user.id,
      sceneId: scene.id,
      kind: 'zone',
      rows: doomed.map(scalarRow),
    });
    await deps.ctx.prisma.defenseZone.deleteMany({ where: { sceneId: scene.id } });
    await emitZones(deps, campaignId, scene.id);
    await dropSceneZonesFromQueue(
      deps,
      campaignId,
      scene,
      doomed.map((z) => z.id),
    );
  },
});

/**
 * „Odpal system" and „Tura systemu" — the GM's own hand on the trigger.
 *
 * The same button covers both because they are the same act: everybody standing
 * inside takes what the system has to give. The lift full of sleeping gas
 * („Pułapka zajmuje pierwsze miejsce w Kolejce Inicjatywy", s. 216) is exactly
 * this button pressed on the trap's Turn.
 */
export const zoneFireEvent = defineEvent<DefenseZoneFirePayload, { summary: string }>({
  name: 'zone:fire',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const row = await requireCampaignZone(deps, campaignId, payload?.zoneId);
    const scene = row.scene;
    const { entries } = await buildCompendiumSync(deps, campaignId);
    const profile = zoneProfileOf(entries, row.entryId);
    if (!profile) throw new RealtimeError('ZONE_UNKNOWN_ENTRY');
    if (!netDefenseActs(profile.effects)) throw new RealtimeError('ZONE_NO_EFFECT');

    const inside = await tokensInsideZone(deps, scene, row);
    const targets =
      typeof payload?.tokenId === 'string'
        ? inside.filter((token) => token.id === payload.tokenId)
        : inside;
    if (targets.length === 0) throw new RealtimeError('ZONE_NOBODY_INSIDE');

    const fired = await fireZone(deps, {
      campaignId,
      user,
      scene,
      zone: row,
      profile,
      targets,
      cause: 'Tura systemu',
    });
    const summary = fired.lines.join(' · ');
    await logZoneLine(deps, campaignId, user, row.name, 'Tura systemu', summary);
    return { summary };
  },
});

// ─────────────────────────── hak ruchu i hak tury ───────────────────────────

/**
 * Everything a walk owes the defence systems of a scene (stage 26f).
 *
 * Called from `performTokenMove` after the drop is judged and persisted — the
 * one place every walk lands, and the same hook the emergency disconnect of 26b
 * hangs on. Three things happen here, in this order and for a reason:
 *
 *  1. **the drain lifts.** „dopóki cel … nie opuści bronionego obszaru" (s. 216)
 *     — the sticky floor lets go the moment somebody steps off it, and a player
 *     who walked out and is still slowed would have to ask the GM;
 *  2. **Perception is rolled** for the hidden zones this figure has come near.
 *     Before the trigger, so that stepping onto a trap you spotted at four
 *     metres reads as „I saw it and stepped on it anyway", not as a surprise;
 *  3. **the systems go off** at whoever the walk touched.
 */
export async function runZonesAfterMove(
  deps: RealtimeDeps,
  input: {
    campaignId: string;
    user: SessionUser;
    scene: Scene;
    token: Token;
    from: ScenePoint;
    to: ScenePoint;
    path: readonly ScenePoint[];
  },
): Promise<void> {
  const { campaignId, user, scene, token } = input;
  const rows = await fetchSceneZones(deps.ctx.prisma, scene.id);
  if (rows.length === 0) return;

  const { entries } = await buildCompendiumSync(deps, campaignId);
  const view = toSceneView(scene);
  const half = tokenHalfPx(token, scene);

  // 1 — spotting, and 2 — the drain lifting, both need „where is this figure now".
  const now: ScenePoint = { x: input.to.x + half, y: input.to.y + half };
  const before: ScenePoint = { x: input.from.x + half, y: input.from.y + half };

  const live = rows.map((row) => ({ row, profile: zoneProfileOf(entries, row.entryId) }));

  // ── the drain lifts when the last sticky floor is behind you ──
  const stillStuck = live.some(
    ({ row, profile }) => profile?.effects?.moveDrain !== undefined && isPointInRect(row, now),
  );
  if (!stillStuck) await liftMoveDrain(deps, campaignId, token);

  // ── Perception, once per character per zone ──
  const perPixel = metresPerPixel(view);
  const spotRangePx = perPixel > 0 ? ZONE_SPOT_RANGE_M / perPixel : 0;
  for (const { row, profile } of live) {
    if (!row.hidden || !profile?.spotDv) continue;
    if (distanceToRect(now, row) > spotRangePx) continue;
    await trySpotZone(deps, campaignId, row, token, profile.spotDv, user);
  }

  // ── the systems themselves ──
  for (const { row, profile } of live) {
    if (!profile || !netDefenseActs(profile.effects)) continue;
    if (!row.armed) continue;
    if (row.hpMax > 0 && row.hpCurrent <= 0) continue;
    if (readZoneExempt(row.exempt).includes(token.id)) continue;
    if (await zoneDisarmedByNetrunner(deps, row)) continue;

    const trigger = netDefenseTrigger(profile.effects);
    // „W Turze pułapki" (s. 216) — a trap with its own place in the queue never
    // answers a footstep. What the footstep DOES do is wake it: the trap takes
    // „pierwsze miejsce w Kolejce Inicjatywy", and from there the GM's button
    // fires it in its own Turn. Firing stays a click (the line 26c/26e drew);
    // only the tracker row stopped being the GM's paperwork.
    if (trigger === 'turn') {
      if (pathTouchesZone(row, before, now, input.path, half)) {
        await pushZoneIntoQueue(deps, campaignId, user, scene, row);
      }
      continue;
    }

    const touched = pathTouchesZone(row, before, now, input.path, half);
    if (!touched) continue;
    // „Cel WCHODZI na broniony obszar": a figure that was already standing on
    // the electric floor does not step onto it again. „Każdy, kto wykona Akcję
    // Ruchu na tym obszarze" (Ślizgawka) is the other reading, and it is the one
    // `move` selects.
    if (trigger === 'enter' && isPointInRect(row, before)) continue;

    const fired = await fireZone(deps, {
      campaignId,
      user,
      scene,
      zone: row,
      profile,
      targets: [token],
      cause: trigger === 'move' ? 'ruch na obszarze' : 'wejście na obszar',
    });
    if (fired.lines.length > 0) {
      await logZoneLine(
        deps,
        campaignId,
        user,
        row.name,
        trigger === 'move' ? 'Ruch na bronionym obszarze' : 'Wejście na broniony obszar',
        fired.lines.join(' · '),
      );
    }
  }
}

/**
 * „Cel otrzymuje ponownie 6k6 obrażeń na koniec swojej kolejnej Tury oraz na
 * koniec każdej kolejnej Tury, chyba że zejdzie z podłogi" (s. 216).
 *
 * Called from `runTurnEnd`, next to the fire and the poison of 14e — which is
 * where it belongs: it is the same sentence with a different source.
 */
export async function runZonesAtTurnEnd(
  deps: RealtimeDeps,
  input: { campaignId: string; user: SessionUser; scene: Scene; token: Token },
): Promise<string[]> {
  const { campaignId, user, scene, token } = input;
  const rows = await fetchSceneZones(deps.ctx.prisma, scene.id);
  if (rows.length === 0) return [];
  const { entries } = await buildCompendiumSync(deps, campaignId);
  const half = tokenHalfPx(token, scene);
  const centre: ScenePoint = { x: token.x + half, y: token.y + half };

  const lines: string[] = [];
  for (const row of rows) {
    if (!row.armed) continue;
    if (row.hpMax > 0 && row.hpCurrent <= 0) continue;
    if (readZoneExempt(row.exempt).includes(token.id)) continue;
    const profile = zoneProfileOf(entries, row.entryId);
    if (!profile?.effects?.repeats) continue;
    if (!isPointInRect(row, centre)) continue;
    if (await zoneDisarmedByNetrunner(deps, row)) continue;

    const fired = await fireZone(deps, {
      campaignId,
      user,
      scene,
      zone: row,
      profile,
      targets: [token],
      cause: 'koniec Tury na obszarze',
    });
    lines.push(...fired.lines);
  }
  return lines;
}

/**
 * Has a netrunner switched this system off from the other end of the cable?
 *
 * The bridge to 26d, and it is one lookup rather than a copy: the device's state
 * lives in `NetArchitecture.runtime`, which is exactly where „a camera switched
 * off stays off" was put, so a zone wired to a control node reads the same
 * switch the run window flips.
 */
async function zoneDisarmedByNetrunner(deps: RealtimeDeps, row: ZoneRow): Promise<boolean> {
  if (!row.architectureId || !row.deviceId) return false;
  const architecture = await deps.ctx.prisma.netArchitecture.findUnique({
    where: { id: row.architectureId },
    select: { runtime: true },
  });
  if (!architecture) return false;
  const runtime = readNetRuntime(architecture.runtime);
  return netDeviceStateOf(runtime.devices, row.deviceId).on === false;
}

/** Did this walk touch the zone at all — by its path, or by its endpoints? */
function pathTouchesZone(
  zone: ZoneRow,
  from: ScenePoint,
  to: ScenePoint,
  path: readonly ScenePoint[],
  half: number,
): boolean {
  if (path.length >= 2) {
    for (let i = 1; i < path.length; i++) {
      const a = { x: path[i - 1]!.x + half, y: path[i - 1]!.y + half };
      const b = { x: path[i]!.x + half, y: path[i]!.y + half };
      if (segmentCrossesRect(zone, a, b)) return true;
    }
    return false;
  }
  return segmentCrossesRect(zone, from, to);
}

/**
 * One Perception Check against one hidden zone, at most once per character.
 *
 * The GM's own figures never roll: a guard knows where the building's floor
 * traps are, and asking the GM to roll against their own architecture would be
 * theatre. A player's success reveals the zone to *that account* — which is what
 * makes „gracz nie dostaje strefy, której nie zauważył" a fact about the payload
 * rather than a hope about the client.
 */
async function trySpotZone(
  deps: RealtimeDeps,
  campaignId: string,
  row: ZoneRow,
  token: Token,
  spotDv: number,
  user: SessionUser,
): Promise<void> {
  const ownerId = await controllerOf(deps, token);
  if (!ownerId) return;
  const sightings = readZoneSightings(row.sightings);
  if (sightings.users.includes(ownerId)) return;
  const key = token.characterId ?? token.id;
  if (sightings.tried.includes(key)) return;

  const base = await checkPerceptionOf(deps, token);
  const outcome = cpredAmmoCheckOutcome(createMixedRng()(10), base.total, spotDv);
  const next = outcome.resisted
    ? { users: [...sightings.users, ownerId], tried: [...sightings.tried, key] }
    : { users: sightings.users, tried: [...sightings.tried, key] };
  await deps.ctx.prisma.defenseZone.update({
    where: { id: row.id },
    data: { sightings: writeZoneSightings(next) },
  });
  await emitZones(deps, campaignId, row.sceneId);
  await logZoneLine(
    deps,
    campaignId,
    user,
    tokenTableName(token, token.name),
    'Percepcja — coś jest nie tak z tym miejscem',
    outcome.resisted
      ? `${base.label} ${outcome.die}+${outcome.modifier} = ${outcome.total} vs PT ${spotDv} — zauważa: ${row.name}`
      : `${base.label} ${outcome.die}+${outcome.modifier} = ${outcome.total} vs PT ${spotDv} — nic nie zauważa`,
  );
}

/** The sticky floor lets go — the sticker and its number come off together. */
async function liftMoveDrain(deps: RealtimeDeps, campaignId: string, token: Token): Promise<void> {
  const statuses = readTokenStatuses(token.statuses);
  if (!statuses.includes(SHEET_SLOWED_STATUS_ID)) return;
  await deps.ctx.prisma.token.update({
    where: { id: token.id },
    data: {
      statuses: JSON.stringify(statuses.filter((id) => id !== SHEET_SLOWED_STATUS_ID)),
      statusData: writeSheetStatusData(token.statusData, SHEET_SLOWED_STATUS_ID, null),
    },
  });
  await emitTokensById(deps, campaignId, [token.id]);
}

/** Figures standing inside a zone right now. */
async function tokensInsideZone(deps: RealtimeDeps, scene: Scene, row: ZoneRow): Promise<Token[]> {
  const tokens = await deps.ctx.prisma.token.findMany({ where: { sceneId: scene.id } });
  const view = toSceneView(scene);
  return tokens.filter((token) => {
    if (token.id === row.tokenId) return false;
    return isPointInRect(row, tokenCentre({ x: token.x, y: token.y, size: token.size }, view));
  });
}

/** Half a token's footprint, in scene pixels — its centre offset. */
function tokenHalfPx(token: Pick<Token, 'size'>, scene: Scene): number {
  return (token.size * scene.gridSizePx) / 2;
}

function readTokenStatuses(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** One line on the chat, in the `action` shape the tracker and the run use. */
/**
 * „Pułapka zajmuje pierwsze miejsce w Kolejce Inicjatywy" (s. 216) — wprost.
 *
 * Wzorowane na `pushNetFoeIntoQueue` z 26c i celowo tak samo skromne: wiersz
 * bez figury (`tokenId: null`, nazwa z `label`), inicjatywa o punkt wyżej od
 * najwyższej w kolejce, `order: -1`, żeby przy remisie stanął na górze. Nic
 * poza wierszem — pułapkę odpala MG przyciskiem „Odpal system" w jej Turze.
 *
 * Cisza w trzech przypadkach, bo w każdym z nich wiersz byłby kłamstwem:
 * walka nie trwa (nie ma kolejki), pułapka już w niej stoi, albo tryb turowy
 * stoi na „PRZED WALKĄ" — wtedy kolejka istnieje, ale rund jeszcze nie ma.
 */
async function pushZoneIntoQueue(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  scene: Scene,
  zone: ZoneRow,
): Promise<void> {
  const combat = await loadCombat(deps.ctx.prisma, scene.id);
  if (!combat) return;
  // Runda 0 = „PRZED WALKĄ": inicjatywy są jeszcze nierzucone, więc „o punkt
  // wyżej od najwyższej" dałoby pułapce 1 — czyli po rzutach OSTATNIE miejsce
  // zamiast pierwszego. Wiersz poczeka na następne wejście na obszar.
  if (combat.round < 1) return;
  if (combat.combatants.some((entry) => entry.zoneId === zone.id)) return;
  const top = combat.combatants.reduce((best, entry) => Math.max(best, entry.initiative ?? 0), 0);
  await deps.ctx.prisma.combatant.create({
    data: {
      combatId: combat.id,
      label: zone.name,
      zoneId: zone.id,
      initiative: top + 1,
      order: -1,
    },
  });
  await emitCombatOfScene(deps, campaignId, scene);
  await logZoneLine(
    deps,
    campaignId,
    user,
    zone.name,
    'Pułapka wchodzi do Kolejki Inicjatywy',
    `pierwsze miejsce, inicjatywa ${top + 1} — odpal ją w jej Turze`,
  );
}

/**
 * Wiersz pułapki znika razem z powodem, dla którego stał w kolejce: rozbrojeniem,
 * zniszczeniem albo usunięciem strefy. Bez tego kolejka trzymałaby Turę czegoś,
 * co nie ma już jak zadziałać, a MG klikałby „dalej" przez martwy wiersz.
 */
async function dropZoneFromQueue(
  deps: RealtimeDeps,
  campaignId: string,
  sceneId: string,
  zoneId: number,
): Promise<void> {
  const removed = await deps.ctx.prisma.combatant.deleteMany({ where: { zoneId } });
  if (removed.count === 0) return;
  const scene = await deps.ctx.prisma.scene.findUnique({ where: { id: sceneId } });
  if (scene) await emitCombatOfScene(deps, campaignId, scene);
}

/** Wszystkie wiersze pułapek sceny naraz — dla „wyczyść strefy". */
async function dropSceneZonesFromQueue(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  zoneIds: number[],
): Promise<void> {
  if (zoneIds.length === 0) return;
  const removed = await deps.ctx.prisma.combatant.deleteMany({
    where: { zoneId: { in: zoneIds } },
  });
  if (removed.count > 0) await emitCombatOfScene(deps, campaignId, scene);
}

async function logZoneLine(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  actorName: string,
  actionName: string,
  note?: string,
): Promise<ChatMessageView> {
  const entry: CombatActionLogEntry = {
    combatantId: '',
    actorName,
    actionId: CPRED_ACTION_NET,
    actionName,
    ...(note ? { note } : {}),
  };
  const stored = await deps.ctx.prisma.chatMessage.create({
    data: {
      campaignId,
      authorId: user.id,
      kind: 'action',
      text: actionName,
      payload: JSON.stringify(entry),
    },
    include: INCLUDE_CHAT_NAMES,
  });
  const view = toChatMessageView(stored);
  broadcastChatMessage(deps, campaignId, view);
  return view;
}
