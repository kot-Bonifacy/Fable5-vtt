import type {
  CpredAttackRequest,
  CpredNetDevice,
  CpredNetFloor,
  NetRunAbilityResult,
  NetRunDevicePayload,
  SessionUser,
} from '@vtt/shared';
import {
  NET_DEVICE_KIND_LABELS,
  isNetDeviceOperation,
  netApplyDeviceState,
  netDeviceLine,
  netDeviceNeedsToken,
  netDeviceNeedsWall,
  netDeviceOperations,
  netDeviceStateAfter,
  netDeviceStateOf,
  netFloorAt,
  netMarkNodeUse,
  netNodeIsFree,
  parseCharacterData,
  readNetRuntime,
} from '@vtt/shared';
import { SHEET_STATIST_WEAPON_ROW_ID } from '../sheets.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { requireCampaignToken } from './tokens.js';
import {
  architectureOf,
  controlsRun,
  emitRuns,
  loadRunRow,
  logNetLine,
  readFullRun,
  saveRunState,
  saveRuntime,
} from './netrun-io.js';
import { roundOfScene, spendNetAction } from './netcombat.js';
import { performAttackRoll } from './attacks.js';
import { afterWallChange } from './walls.js';
import type { FullRunState } from './netice.js';

/**
 * Węzły kontrolne i urządzenia (etap 26d) — jedyne miejsce, w którym Sieć
 * dotyka mapy.
 *
 * Trzy decyzje niosą cały plik:
 *
 *  1. **Obsługa urządzenia to zwykła Akcja Sieciowa.** Ten sam `spendNetAction`
 *     co Backdoor i Paf, więc „albo Akcja w Somie, albo Akcje Sieciowe" (s. 198)
 *     wychodzi z arytmetyki, a nie z osobnego warunku. Do tego jeden dodatkowy
 *     licznik: „dany węzeł kontrolny można aktywować tylko raz na Turę" (s. 199),
 *     i liczy się go **przy piętrze**, bo zdanie mówi o węźle, nie o rzeczy.
 *  2. **Wieżyczka strzela tym samym silnikiem co człowiek.** `performAttackRoll`
 *     dostaje żeton wieżyczki jako atakującego i kartę netrunnera jako rękę na
 *     spuście („rzucając na Umiejętności tego Netrunnera", s. 213). Żadnej
 *     gałęzi „strzela urządzenie" w planerze nie ma i mieć nie może — inaczej
 *     osłona, linia strzału i amunicja musiałyby się nauczyć drugiej drogi.
 *  3. **Uprawnienie to węzeł, nie własność żetonu.** Netrunner, który przejął
 *     węzeł wieżyczki, nie jest i nie będzie właścicielem jej figury. Sprawdza
 *     się więc trzymanie węzła, a ścieżce ataku mówi się, że sprawa jest już
 *     osądzona.
 */

interface LoadedNode {
  row: NonNullable<Awaited<ReturnType<typeof loadRunRow>>>;
  architecture: NonNullable<ReturnType<typeof architectureOf>>;
  state: FullRunState;
  floor: CpredNetFloor;
  device: CpredNetDevice;
}

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

/**
 * The run, the node and the device — with the three refusals that come before
 * anything is spent.
 *
 * The order matters and is the same order stage 26b used for the shaft: what
 * the netrunner has not taken, they do not learn about. A device on a node
 * nobody holds answers `NET_NODE_NOT_HELD`, never „there is no such device" —
 * because the first sentence is true and the second would be a lie that leaks.
 */
async function requireNode(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  payload: NetRunDevicePayload | undefined,
): Promise<LoadedNode> {
  const runId = payload?.runId;
  if (typeof runId !== 'string' || runId.length === 0) throw new RealtimeError('BAD_REQUEST');
  const row = await loadRunRow(deps.ctx.prisma, campaignId, runId);
  if (!row) throw new RealtimeError('NET_NOT_JACKED');
  if (!controlsRun(row, user)) throw new RealtimeError('FORBIDDEN');
  const architecture = architectureOf(row.architecture);
  const state = readFullRun(row.data);
  if (!architecture || !state) throw new RealtimeError('ARCHITECTURE_NOT_FOUND');

  const floorId = typeof payload?.floorId === 'string' ? payload.floorId : '';
  const floor = architecture.branches
    .flatMap((branch) => branch.floors)
    .find((entry) => entry.id === floorId);
  if (!floor || floor.kind !== 'controlNode') throw new RealtimeError('NET_WRONG_FLOOR');
  if (!state.controlled.some((hold) => hold.floorId === floor.id)) {
    throw new RealtimeError('NET_NODE_NOT_HELD');
  }

  const device = floor.devices?.find((entry) => entry.id === payload?.deviceId);
  if (!device) throw new RealtimeError('NET_DEVICE_UNKNOWN');
  return { row, architecture, state, floor, device };
}

/**
 * „Obsługa każdej rzeczy podłączonej do danego węzła wymaga użycia osobnej
 * Akcji Sieciowej na każdą z tych rzeczy" (s. 199).
 *
 * One event for all five operations, because they differ only in what happens
 * after the Net Action is booked: three of them write a flag, one opens a door
 * and one fires a gun. What they share — the node, the once-per-Turn ledger and
 * the bill — is the whole reason they are not five events.
 */
export const netDeviceEvent = defineEvent<NetRunDevicePayload, NetRunAbilityResult>({
  name: 'netrun:device',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { row, architecture, state, floor, device } = await requireNode(
      deps,
      campaignId,
      user,
      payload,
    );
    const operation = payload?.operation;
    if (!isNetDeviceOperation(operation)) throw new RealtimeError('BAD_REQUEST');
    if (!netDeviceOperations(device.deviceKind).includes(operation)) {
      throw new RealtimeError('NET_DEVICE_WRONG_OPERATION');
    }

    const { scene, token } = await requireCampaignToken(deps.ctx.prisma, campaignId, row.tokenId);
    const round = await roundOfScene(deps, scene.id);
    if (!netNodeIsFree(state.nodeUse, floor.id, round)) throw new RealtimeError('NET_NODE_USED');

    const runtime = readNetRuntime(row.architecture.runtime);
    const before = netDeviceStateOf(runtime.devices, device.id);
    // A device somebody switched off does nothing until it is switched back on
    // — and the switch itself is the one operation that must still work.
    if (!before.on && operation !== 'on') throw new RealtimeError('NET_DEVICE_OFF');
    if (netDeviceNeedsToken(operation) && !device.tokenId) {
      throw new RealtimeError('NET_DEVICE_NO_TOKEN');
    }
    if (netDeviceNeedsWall(operation) && device.wallId === undefined) {
      throw new RealtimeError('NET_DEVICE_NO_WALL');
    }

    const actorName = row.token.character?.name ?? row.token.name;
    let next: FullRunState = await spendNetAction(deps, {
      campaignId,
      scene,
      tokenId: token.id,
      user,
      label: `${device.name}: ${operation === 'fire' ? 'strzał' : 'obsługa'}`,
      characterId: row.characterId,
      state,
    });

    let summary: string;
    let messageId = 0;
    if (operation === 'fire') {
      const shot = await fireDevice(deps, {
        campaignId,
        user,
        device,
        characterId: row.characterId,
        payload,
      });
      messageId = shot.messageId;
      summary = shot.summary;
    } else if (operation === 'open' || operation === 'close') {
      await setOpening(deps, campaignId, device.wallId!, operation === 'open');
      summary = netDeviceLine(device, operation, before);
    } else {
      const after = netDeviceStateAfter(before, operation) ?? before;
      await saveRuntime(deps.ctx.prisma, row.architectureId, {
        ...runtime,
        devices: netApplyDeviceState(runtime.devices, after),
      });
      summary = netDeviceLine(device, operation, after);
    }

    next = { ...next, nodeUse: netMarkNodeUse(next.nodeUse, floor.id, round) };
    await saveRunState(deps.ctx.prisma, row.id, next);

    const nodeName =
      floor.label || netFloorAt(architecture, state.position)?.label || 'Węzeł kontrolny';
    const line = await logNetLine(
      deps,
      campaignId,
      user,
      actorName,
      `Węzeł kontrolny: ${device.name || NET_DEVICE_KIND_LABELS[device.deviceKind]}`,
      `${nodeName} · ${summary}`,
    );
    await emitRuns(deps, campaignId);
    return {
      messageId: messageId || line.id,
      total: 0,
      success: true,
      summary,
    };
  },
});

/**
 * The turret pulls its own trigger, with the netrunner's Skills behind it.
 *
 * Nothing is re-implemented here: `performAttackRoll` does the range, the DV,
 * the cover, the line of fire, the magazine and the card with „Obrażenia" on
 * it. All this function does is say who is shooting from where, and hand over
 * the sheet the dice are read off.
 */
async function fireDevice(
  deps: RealtimeDeps,
  input: {
    campaignId: string;
    user: SessionUser;
    device: CpredNetDevice;
    characterId: string;
    payload: NetRunDevicePayload | undefined;
  },
): Promise<{ messageId: number; summary: string }> {
  const character = await deps.ctx.prisma.character.findUnique({
    where: { id: input.characterId },
  });
  if (!character) throw new RealtimeError('CHARACTER_NOT_FOUND');
  const operator = parseCharacterData(character.data, deps.ctx.cpred);

  const result = await performAttackRoll(deps, {
    campaignId: input.campaignId,
    user: input.user,
    payload: {
      attackerTokenId: input.device.tokenId!,
      ...(input.payload?.targetTokenId ? { targetTokenId: input.payload.targetTokenId } : {}),
      // A turret has exactly one barrel, and it is the one row a statist sheet
      // carries — so the netrunner never has to name it. Anything else the
      // request asks for (celowany, seria) passes straight through.
      request: {
        weaponRowId: SHEET_STATIST_WEAPON_ROW_ID,
        ...(input.payload?.request ?? {}),
      } as CpredAttackRequest,
      ...(input.payload?.gesture ? { gesture: input.payload.gesture } : {}),
    },
    device: { operator },
  });
  // „Ostrzelaj osłonę czy strzelaj mimo niej" (16c) wraca jako pytanie, a nie
  // karta. Netrunner odpowiada na nie tak samo jak strzelec — strzelając
  // jeszcze raz z `ignoreCover` — ale Akcja Sieciowa poszła już wcześniej i
  // odmowa mówi to wprost. Sprawdzenie osłony przed rachunkiem znaczyłoby
  // policzenie geometrii drugi raz, a jednej geometrii pilnuje 16b.
  if (result.blocked) {
    throw new RealtimeError(
      result.blocked.kind === 'cover'
        ? `${input.device.name}: strzał zasłania ${result.blocked.name} (Akcja Sieciowa poszła — strzel jeszcze raz mimo osłony).`
        : `${input.device.name}: na linii strzału stoi ${result.blocked.name} (Akcja Sieciowa poszła).`,
    );
  }
  return {
    messageId: result.messageId ?? 0,
    summary: `${input.device.name} — strzał Umiejętnością netrunnera.`,
  };
}

/** Opening a door or window of stage 18d from the other end of the cable. */
async function setOpening(
  deps: RealtimeDeps,
  campaignId: string,
  wallId: number,
  open: boolean,
): Promise<void> {
  const row = await deps.ctx.prisma.wall.findUnique({
    where: { id: wallId },
    include: { scene: true },
  });
  if (!row || row.scene.campaignId !== campaignId) throw new RealtimeError('NET_DEVICE_NO_WALL');
  // The bolt is deliberately not consulted: „przejęcie kontroli nad węzłem"
  // *is* the answer to a lock, and a control node that could not unlock the
  // door it runs would be a control node that does nothing (s. 199).
  await deps.ctx.prisma.wall.update({ where: { id: row.id }, data: { open } });
  await afterWallChange(deps, campaignId, row.scene);
}
