import type {
  CpredAttackRequest,
  CpredCharacterData,
  CpredNetDevice,
  CpredNetFloor,
  NetOperatedFigure,
  NetRunAbilityResult,
  NetRunDevicePayload,
  RollGesture,
  SessionUser,
} from '@vtt/shared';
import {
  CPRED_METRES_PER_MOVE_POINT,
  NET_DEVICE_KIND_LABELS,
  cpredDrawnWeapons,
  isNetDeviceOperation,
  netApplyDeviceState,
  CPRED_EVASION_SKILL_ID,
  ROLE_GM,
  createDefaultCharacterData,
  cpredSheetWithCombatValue,
  facingFromDelta,
  isNetDefenseEntry,
  netCameraFacingAfterTurn,
  netDeviceFigureProfile,
  netDeviceLine,
  netDeviceNeedsWall,
  netDeviceOperations,
  netDeviceStateAfter,
  netDeviceStateOf,
  netDeviceTurnOf,
  netDeviceUse,
  netOperatedState,
  netFloorAt,
  parseCharacterData,
  readNetRuntime,
  tokenTableName,
} from '@vtt/shared';
import { SHEET_STATIST_WEAPON_ROW_ID, readSheetMoveBudget } from '../sheets.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { emitTokenUpsert, requireCampaignToken } from './tokens.js';
import {
  architectureOf,
  controlsRun,
  emitRuns,
  loadRunRow,
  logNetLineWithSecret,
  netActionsForRun,
  readFullRun,
  refreshNetCameraSight,
  runnerOwnerOf,
  saveRunState,
  saveRuntime,
} from './netrun-io.js';
import { roundOfScene, spendNetAction } from './netcombat.js';
import { findCombatantForToken, loadCombat, spendTurnForCombatant } from './combat.js';
import { outsideHandsOf, performAttackRoll } from './attacks.js';
import { campaignEntry } from './compendium.js';
import { loadNetDeviceGrants, operatorOf, type NetDeviceGrant } from './net-control.js';
import { toLinkedSheet } from '../sheets.js';
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
  // Etap 70a: najpierw „nie trzymasz”, dopiero potem „co to za piętro” — id
  // piętra, którego nie ma, i id węzła, do którego netrunner nie doszedł,
  // dostają tę samą odmowę, więc `floorId` nie jest wyrocznią szybu.
  if (!state.controlled.some((hold) => hold.floorId === floorId)) {
    throw new RealtimeError('NET_NODE_NOT_HELD');
  }
  const floor = architecture.branches
    .flatMap((branch) => branch.floors)
    .find((entry) => entry.id === floorId);
  if (!floor || floor.kind !== 'controlNode') throw new RealtimeError('NET_WRONG_FLOOR');

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

    // Etap 70b: strzela się z mapy — przejętą figurą, celownikiem i kubkiem
    // (`attack:roll`). Lista „Cel strzału” i płatne pytanie o osłonę zniknęły.
    if (operation === 'fire') throw new RealtimeError('NET_DEVICE_FIRES_FROM_MAP');

    const { scene, token } = await requireCampaignToken(deps.ctx.prisma, campaignId, row.tokenId);
    const round = await roundOfScene(deps, scene.id);
    // Jedna księga dla okna i dla mapy (70b): przełącznik z listy jest tą samą
    // czynnością, co „Wyłącz” z belki przejętej figury.
    const use = netDeviceUse(state, {
      floorId: floor.id,
      deviceId: device.id,
      round,
      use: 'action',
    });
    if (!use.ok) throw new RealtimeError(use.error);

    const runtime = readNetRuntime(row.architecture.runtime);
    const before = netDeviceStateOf(runtime.devices, device.id);
    // A device somebody switched off does nothing until it is switched back on
    // — and the switch itself is the one operation that must still work.
    if (!before.on && operation !== 'on') throw new RealtimeError('NET_DEVICE_OFF');
    if (netDeviceNeedsWall(operation) && device.wallId === undefined) {
      throw new RealtimeError('NET_DEVICE_NO_WALL');
    }

    const actorName = tokenTableName(row.token, row.token.character?.name ?? row.token.name);
    let next: FullRunState = use.charge
      ? await spendNetAction(deps, {
          campaignId,
          scene,
          tokenId: token.id,
          user,
          label: `${device.name}: obsługa`,
          characterId: row.characterId,
          state,
        })
      : state;

    const shownAs = await publicDeviceName(deps, device);
    let summary: string;
    let publicSummary: string;
    if (operation === 'turn' && device.deviceKind === 'camera' && device.tokenId) {
      // Kamera stojąca na mapie (20.10) obraca się naprawdę: kierunek figury
      // to oś stożka, przez który patrzy netrunner. Od 70b celem jest punkt
      // mapy (`lookAt`), nie jedna z ośmiu stron świata.
      const facing = await turnCamera(
        deps,
        campaignId,
        device.tokenId,
        payload?.facing,
        payload?.lookAt,
      );
      summary = netDeviceLine(device, operation, before, facing);
      publicSummary = netDeviceLine({ ...device, name: shownAs }, operation, before, facing);
    } else if (operation === 'open' || operation === 'close') {
      await setOpening(deps, campaignId, device.wallId!, operation === 'open');
      summary = netDeviceLine(device, operation, before);
      publicSummary = netDeviceLine({ ...device, name: shownAs }, operation, before);
    } else {
      const after = netDeviceStateAfter(before, operation) ?? before;
      await saveRuntime(deps.ctx.prisma, row.architectureId, {
        ...runtime,
        devices: netApplyDeviceState(runtime.devices, after),
      });
      summary = netDeviceLine(device, operation, after);
      publicSummary = netDeviceLine({ ...device, name: shownAs }, operation, after);
    }

    next = { ...next, nodeUse: use.nodeUse, deviceTurns: use.deviceTurns };
    await saveRunState(deps.ctx.prisma, row.id, next);

    const nodeName =
      floor.label || netFloorAt(architecture, state.position)?.label || 'Węzeł kontrolny';
    // Etykieta piętra i nazwa urządzenia z edytora Architektury to jej zawartość
    // — reszta stołu dostaje skrót, MG i netrunner pełny wiersz (#37).
    const line = await logNetLineWithSecret(deps, campaignId, user, {
      actorName,
      actionName: `Węzeł kontrolny: ${shownAs}`,
      publicNote: `węzeł kontrolny · ${publicSummary}`,
      secretNote: `${nodeName} · ${summary}`,
      runnerOwnerId: runnerOwnerOf(row),
    });
    await emitRuns(deps, campaignId);
    return {
      messageId: line.id,
      total: 0,
      success: true,
      summary,
    };
  },
});

// ───────────────────── strzał przejętą figurą z mapy (70b) ─────────────────────

/**
 * Strzał przejętej figury, zanim padnie rzut — wszystko, co ścieżka ataku
 * musi wiedzieć, żeby potraktować go jak strzał z mapy.
 */
export interface OperatedShot {
  grant: NetDeviceGrant;
  /**
   * Czym rzuca urządzenie (decyzja MG nr 7 z 11.11, wbrew s. 213): własną
   * Wartością bojową, nie Umiejętnością netrunnera. `combatValue` z wpisu
   * systemu obronnego, gdy go ma; inaczej rozstrzyga karta figury, a jej
   * brak liczb kończy się odmową (`requireValue`).
   */
  hands: { combatValue?: number; requireValue: true; operatorUserId: string };
  /** Lufa — netrunner jej nie wybiera (`deviceWeaponRowId`). */
  weaponRowId: string;
  /**
   * Księguje czynność: pierwsza w rundzie aktywuje urządzenie (Akcja Sieciowa
   * netrunnera, znacznik węzła), kolejna idzie z budżetu aktywacji. Wołana
   * tam, gdzie strzelec przy mapie płaci Akcją — po wszystkich odmowach
   * i po pytaniu o osłonę.
   */
  bill: () => Promise<void>;
}

/**
 * Czy ten strzał oddaje figura przejęta w Sieci — a jeśli tak, na jakich
 * warunkach. Null dla każdej innej figury (zwykła ścieżka statysty).
 *
 * Odmowy, które nie potrzebują geometrii, padają tutaj: urządzenie, które nie
 * strzela, węzeł zużyty w tej Turze, czynność już wykonana. Nic nie jest
 * jeszcze zapłacone.
 */
export async function operatedShotFor(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  attackerTokenId: unknown,
): Promise<OperatedShot | null> {
  if (user.role === ROLE_GM) return null;
  const grant = await operatorOf(deps.ctx.prisma, campaignId, attackerTokenId, user);
  if (!grant) return null;
  if (!netDeviceFigureProfile(grant.deviceKind).verbs.includes('fire')) {
    throw new RealtimeError('NET_DEVICE_WRONG_OPERATION');
  }
  const probe = await operatedUse(deps, campaignId, grant, user);
  if (!probe.use.ok) throw new RealtimeError(probe.use.error);
  const combatValue = await netDeviceCombatValue(deps, campaignId, grant);
  return {
    grant,
    hands: {
      ...(combatValue !== undefined ? { combatValue } : {}),
      requireValue: true,
      operatorUserId: user.id,
    },
    weaponRowId: await deviceWeaponRowId(deps, campaignId, grant.tokenId),
    bill: () => billOperatedUse(deps, campaignId, grant, user, 'strzał'),
  };
}

/**
 * Marsz przejętej figury (etap 70c) — to, czym ścieżka ruchu zastępuje budżet
 * Tury figury: metry z aktywacji urządzenia (`netDeviceUse` z `use: 'move'`),
 * a pierwsza czynność w rundzie płaci Akcją Sieciową netrunnera. Przekazywane
 * do `validateTokenMove` jako `intent.operated`.
 */
export interface OperatedMove {
  grant: NetDeviceGrant;
  /** Na sucho (`token:walk`): czy trasa się zmieści i czy jest czym zapłacić. */
  check: (metres: number) => Promise<void>;
  /** Lądowanie: księguje metry (i Akcję Sieciową przy aktywacji). */
  bill: (metres: number) => Promise<void>;
}

/**
 * Czy ten ruch to marsz figury przejętej w Sieci — a jeśli tak, na jakich
 * warunkach. Null dla każdej figury, której to konto przez węzeł nie prowadzi
 * (i zawsze u MG). Przejęta figura, która nie jeździ, odmawia od razu:
 * operator ją widzi, więc „nie wolno” byłoby nieprawdą.
 */
export async function operatedMoveFor(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  tokenId: string,
): Promise<OperatedMove | null> {
  if (user.role === ROLE_GM) return null;
  const grant = await operatorOf(deps.ctx.prisma, campaignId, tokenId, user);
  if (!grant) return null;
  if (!netDeviceFigureProfile(grant.deviceKind).moves) {
    throw new RealtimeError('NET_DEVICE_STATIONARY');
  }
  if ((await netDeviceMoveMetres(deps, campaignId, grant)) <= 0) {
    throw new RealtimeError('NET_DEVICE_NO_MOVE');
  }
  return {
    grant,
    check: (metres) => checkOperatedUse(deps, campaignId, grant, user, metres),
    bill: (metres) => billOperatedUse(deps, campaignId, grant, user, 'ruch', metres),
  };
}

/**
 * Stan runu trzymającego figurę i to, co księga powie o następnej czynności
 * (`spendM` — o ruchu tylu metrów). Urządzenie, które jeździ, dostaje przy
 * aktywacji swój RUCH niezależnie od tego, czym zaczęło: dron, który najpierw
 * strzelił, dalej może podjechać (70c).
 */
async function operatedUse(
  deps: RealtimeDeps,
  campaignId: string,
  grant: NetDeviceGrant,
  user: SessionUser,
  spendM?: number,
) {
  const row = await loadRunRow(deps.ctx.prisma, campaignId, grant.runId);
  const state = row ? readFullRun(row.data) : null;
  if (!row || !state || !controlsRun(row, user)) throw new RealtimeError('FORBIDDEN');
  const { scene, token } = await requireCampaignToken(deps.ctx.prisma, campaignId, row.tokenId);
  const round = await roundOfScene(deps, scene.id);
  const moveM = netDeviceFigureProfile(grant.deviceKind).moves
    ? await netDeviceMoveMetres(deps, campaignId, grant)
    : 0;
  const use = netDeviceUse(state, {
    floorId: grant.floorId,
    deviceId: grant.deviceId,
    round,
    ...(spendM === undefined ? { use: 'action' as const } : { use: 'move' as const, spendM }),
    moveM,
  });
  return { row, state, scene, token, round, use };
}

/** Czy netrunner jest teraz w swojej Turze — budżet aktywacji gaśnie z jej końcem. */
async function requireRunnerTurn(deps: RealtimeDeps, sceneId: string, runnerTokenId: string) {
  const combat = await loadCombat(deps.ctx.prisma, sceneId);
  const active = combat?.combatants.find((entry) => entry.id === combat.activeCombatantId);
  if (active?.tokenId !== runnerTokenId) throw new RealtimeError('NOT_YOUR_TURN');
}

/**
 * Marsz na sucho (`token:walk`, 70c): ta sama księga co przy lądowaniu, a przy
 * aktywacji — czy netrunner ma czym zapłacić (`requireTurnSpend` na sucho),
 * żeby dron nie przejechał pół mapy i nie wrócił skokiem z odmową.
 */
async function checkOperatedUse(
  deps: RealtimeDeps,
  campaignId: string,
  grant: NetDeviceGrant,
  user: SessionUser,
  metres: number,
): Promise<void> {
  const { row, state, scene, token, round, use } = await operatedUse(
    deps,
    campaignId,
    grant,
    user,
    metres,
  );
  if (!use.ok) throw new RealtimeError(use.error);
  if (round === null) return;
  if (!use.charge) {
    await requireRunnerTurn(deps, scene.id, token.id);
    return;
  }
  const found = await findCombatantForToken(deps.ctx.prisma, scene.id, token.id);
  if (!found) return;
  const { actions } = await netActionsForRun(
    deps.ctx.prisma,
    deps.ctx.cpred,
    row.characterId,
    state.netActionDebt,
  );
  const outcome = await spendTurnForCombatant(
    deps,
    found.combat,
    found.combatant,
    { kind: 'net', label: `${grant.deviceName}: ruch`, max: Math.max(1, actions) },
    user,
    { dryRun: true },
  );
  if (outcome.kind === 'refused') throw new RealtimeError(outcome.error);
}

/**
 * Jedna czynność albo jeden ruch przejętej figury zaksięgowany w runie:
 * aktywacja płaci Akcją Sieciową netrunnera (`spendNetAction` — a więc tylko
 * w jego Turze), kolejna czynność aktywowanego urządzenia wymaga, żeby ta Tura
 * dalej trwała. `spendM` — ruch tylu metrów zamiast czynności (70c).
 */
async function billOperatedUse(
  deps: RealtimeDeps,
  campaignId: string,
  grant: NetDeviceGrant,
  user: SessionUser,
  what: string,
  spendM?: number,
): Promise<void> {
  const { row, state, scene, token, round, use } = await operatedUse(
    deps,
    campaignId,
    grant,
    user,
    spendM,
  );
  if (!use.ok) throw new RealtimeError(use.error);
  let next: FullRunState = state;
  if (use.charge) {
    next = await spendNetAction(deps, {
      campaignId,
      scene,
      tokenId: token.id,
      user,
      label: `${grant.deviceName}: ${what}`,
      characterId: row.characterId,
      state,
    });
  } else if (round !== null) {
    // Budżet aktywacji gaśnie z końcem Tury netrunnera, nie dopiero z rundą.
    await requireRunnerTurn(deps, scene.id, token.id);
  }
  await saveRunState(deps.ctx.prisma, row.id, {
    ...next,
    nodeUse: use.nodeUse,
    deviceTurns: use.deviceTurns,
  });
  await emitRuns(deps, campaignId);
}

/**
 * Figury, które ten run trzyma przez swoje węzły — jak je widzi belka (70b).
 *
 * Gracz dostaje do każdej kartę do podglądu strzału: broń w lufie i liczby,
 * którymi serwer rzuci (Wartość bojowa z wpisu wchodzi w `statBlock`), bez
 * reszty karty figury — ekwipunku, notatek, Ścieżki. MG karty ma i tak.
 */
export async function operatedFiguresOf(
  deps: RealtimeDeps,
  campaignId: string,
  runId: string,
  state: Pick<FullRunState, 'nodeUse' | 'deviceTurns'>,
  round: number | null,
  gm: boolean,
): Promise<NetOperatedFigure<CpredCharacterData>[]> {
  const grants = [...(await loadNetDeviceGrants(deps.ctx.prisma, campaignId)).values()].filter(
    (grant) => grant.runId === runId,
  );
  if (grants.length === 0) return [];
  const tokens = await deps.ctx.prisma.token.findMany({
    where: { id: { in: grants.map((grant) => grant.tokenId) }, scene: { campaignId } },
    include: { character: true },
  });
  const figures: NetOperatedFigure<CpredCharacterData>[] = [];
  for (const grant of grants) {
    const token = tokens.find((entry) => entry.id === grant.tokenId);
    if (!token) continue;
    const profile = netDeviceFigureProfile(grant.deviceKind);
    const data = token.character ? parseCharacterData(token.character.data, deps.ctx.cpred) : null;
    const figure: NetOperatedFigure<CpredCharacterData> = {
      tokenId: token.id,
      sceneId: token.sceneId,
      floorId: grant.floorId,
      deviceId: grant.deviceId,
      deviceKind: grant.deviceKind,
      name: grant.deviceName,
      nodeLabel: grant.nodeLabel,
      verbs: [...profile.verbs],
      state: netOperatedState(state, grant.floorId, grant.deviceId, round),
    };
    if (profile.moves) {
      // Etap 70c: kafel „Ruch” i zasięg marszu drona — RUCH z aktywacji
      // i to, co z niego zostało w tej Turze.
      figure.moveM = await netDeviceMoveMetres(deps, campaignId, grant);
      const turn = netDeviceTurnOf(state.deviceTurns, grant.floorId, grant.deviceId, round);
      if (turn) figure.moveLeftM = turn.moveLeftM;
    }
    const hp = token.character
      ? toLinkedSheet(token.character, deps.ctx.cpred).hp
      : token.hpMax === null
        ? null
        : { current: token.hpCurrent ?? 0, max: token.hpMax };
    if (hp) figure.hp = hp;
    if (data && profile.verbs.includes('fire')) {
      const weaponRowId = await deviceWeaponRowId(deps, campaignId, token.id);
      const row = data.weapons.find((weapon) => weapon.id === weaponRowId);
      const combatValue = await netDeviceCombatValue(deps, campaignId, grant);
      const firing =
        combatValue !== undefined ? cpredSheetWithCombatValue(data, combatValue) : data;
      if (row) figure.weaponRowId = row.id;
      if (
        combatValue === undefined &&
        data.statBlock?.combatValue == null &&
        (data.statBlock?.weaponSkill ?? 0) <= 0 &&
        Object.entries(data.skills).every(
          ([id, level]) => id === CPRED_EVASION_SKILL_ID || level <= 0,
        )
      ) {
        figure.noCombatValue = true;
      }
      if (!gm) {
        figure.sheet = {
          ...createDefaultCharacterData(),
          stats: { ...firing.stats, luck: 0 },
          skills: firing.skills,
          statBlock: firing.statBlock,
          weapons: row ? [row] : [],
          hpCurrent: firing.hpCurrent,
          luckCurrent: 0,
          criticalInjuries: firing.criticalInjuries,
        };
      }
    }
    figures.push(figure);
  }
  return figures;
}

/**
 * Wartość bojowa przejętego urządzenia z wpisu systemu obronnego: najpierw
 * obszar straży przypięty do figury (etap 51), potem wpis urządzenia
 * w Architekturze. Brak — rozstrzyga karta figury (statysta ma ją w bloku
 * statystyk, pełna karta NPC-a strzela własną Umiejętnością).
 */
export async function netDeviceCombatValue(
  deps: RealtimeDeps,
  campaignId: string,
  grant: Pick<NetDeviceGrant, 'tokenId' | 'entryId'>,
): Promise<number | undefined> {
  for (const entry of await netDeviceEntries(deps, campaignId, grant)) {
    if (entry.combatValue !== undefined) return entry.combatValue;
  }
  return undefined;
}

/**
 * Wpisy systemu obronnego przejętej figury w kolejności źródeł: obszar straży
 * przypięty do figury (etap 51), potem wpis urządzenia w Architekturze.
 */
async function netDeviceEntries(
  deps: RealtimeDeps,
  campaignId: string,
  grant: Pick<NetDeviceGrant, 'tokenId' | 'entryId'>,
) {
  const zone = await deps.ctx.prisma.defenseZone.findFirst({
    where: { tokenId: grant.tokenId },
    select: { entryId: true },
  });
  const entries = [];
  for (const entryId of [zone?.entryId, grant.entryId]) {
    if (!entryId) continue;
    const entry = await campaignEntry(deps, campaignId, entryId);
    if (entry && isNetDefenseEntry(entry)) entries.push(entry);
  }
  return entries;
}

/**
 * Metry, które daje aktywacja przejętej figury, która jeździ (etap 70c): RUCH
 * z wpisu systemu obronnego („RUCH 8”, ta sama kolejność źródeł co Wartość
 * bojowa), a bez wpisu — z karty figury, jak Akcja Ruchu postaci (RUCH × 2,
 * `readSheetMoveBudget`). Figura bez żadnego z nich stoi (0).
 */
export async function netDeviceMoveMetres(
  deps: RealtimeDeps,
  campaignId: string,
  grant: Pick<NetDeviceGrant, 'tokenId' | 'entryId'>,
): Promise<number> {
  for (const entry of await netDeviceEntries(deps, campaignId, grant)) {
    if (entry.move !== undefined) return Math.max(0, entry.move) * CPRED_METRES_PER_MOVE_POINT;
  }
  const token = await deps.ctx.prisma.token.findUnique({
    where: { id: grant.tokenId },
    include: { character: true },
  });
  if (!token?.character) return 0;
  return Math.max(0, readSheetMoveBudget(token.character, deps.ctx.cpred).metresPerMove);
}

/**
 * Urządzenie tak, jak nazywa je stół (#37): figura na mapie pod swoją nazwą
 * stołu (alias też), a urządzenie bez figury albo figura ukryta — rodzajem
 * („Drzwi lub winda"). Nazwa z edytora Architektury jest jej zawartością.
 */
export async function publicDeviceName(
  deps: RealtimeDeps,
  device: Pick<CpredNetDevice, 'deviceKind' | 'tokenId'>,
): Promise<string> {
  const kind = NET_DEVICE_KIND_LABELS[device.deviceKind];
  if (!device.tokenId) return kind;
  const token = await deps.ctx.prisma.token.findUnique({ where: { id: device.tokenId } });
  if (!token || token.hidden) return kind;
  return tokenTableName(token, token.name);
}

/**
 * The turret pulls its own trigger, with somebody else's hand behind it.
 *
 * Nothing is re-implemented here: `performAttackRoll` does the range, the DV,
 * the cover, the line of fire, the magazine and the card with „Obrażenia" on
 * it. All this function does is say who is shooting from where, and hand over
 * the numbers the dice are read off — a netrunner's Skills in 26d, a Demon's
 * „Wartość bojowa" in 26e.
 *
 * The cover question comes back as a **value**, not an exception, because the
 * two callers want different things from it: the netrunner is told to shoot
 * again, while a Demon walking its Turn simply notes the miss and spends the
 * next Net Action on something else.
 */
export async function fireDevice(
  deps: RealtimeDeps,
  input: {
    campaignId: string;
    user: SessionUser;
    device: CpredNetDevice;
    hands: { operator?: CpredCharacterData; combatValue?: number };
    /** One Polish line for the log when the shot went through. */
    summary: string;
    targetTokenId?: string;
    request?: Partial<CpredAttackRequest>;
    gesture?: RollGesture;
  },
): Promise<{
  messageId: number;
  summary: string;
  /** Kod dla okna Sieci, zdanie dla logu — patrz `NET_DEVICE_MESSAGES`. */
  blocked?: {
    code: 'NET_SHOT_COVERED' | 'NET_SHOT_BLOCKED';
    text: string;
    blockerName: string;
  };
}> {
  const weaponRowId = await deviceWeaponRowId(deps, input.campaignId, input.device.tokenId!);
  const result = await performAttackRoll(deps, {
    campaignId: input.campaignId,
    user: input.user,
    payload: {
      attackerTokenId: input.device.tokenId!,
      ...(input.targetTokenId ? { targetTokenId: input.targetTokenId } : {}),
      // Nobody ever names the barrel (`deviceWeaponRowId`). Anything else the
      // request asks for (celowany, seria) passes straight through.
      request: {
        weaponRowId,
        ...(input.request ?? {}),
      } as CpredAttackRequest,
      ...(input.gesture ? { gesture: input.gesture } : {}),
    },
    device: input.hands,
  });
  if (result.blocked) {
    // A blocked shot never became a card, so there is no message to point at.
    const code = result.blocked.kind === 'cover' ? 'NET_SHOT_COVERED' : 'NET_SHOT_BLOCKED';
    return {
      messageId: 0,
      summary: input.summary,
      blocked: {
        code,
        text: deviceShotBlockedText(input.device.name, code, result.blocked.name),
        blockerName: result.blocked.name,
      },
    };
  }
  return { messageId: result.messageId ?? 0, summary: input.summary };
}

/**
 * The barrel a device fires with. A turret statted from the token menu carries
 * exactly one row, the statist's, and that stays the answer. A figure with a
 * full NPC card — every drone of a scene template (66b) — has its weapons under
 * ordinary row ids, so it fires the one it holds, by the same rule a shooter at
 * the map follows (`cpredDrawnWeapons`, 29.10). Before 07.11 such a drone
 * refused every shot with `UNKNOWN_WEAPON`.
 */
export async function deviceWeaponRowId(
  deps: RealtimeDeps,
  campaignId: string,
  tokenId: string,
): Promise<string> {
  const token = await deps.ctx.prisma.token.findUnique({
    where: { id: tokenId },
    include: { character: true },
  });
  if (!token?.character) return SHEET_STATIST_WEAPON_ROW_ID;
  const data = parseCharacterData(token.character.data, deps.ctx.cpred);
  if (data.weapons.some((row) => row.id === SHEET_STATIST_WEAPON_ROW_ID)) {
    return SHEET_STATIST_WEAPON_ROW_ID;
  }
  const held = cpredDrawnWeapons(data, await outsideHandsOf(deps, campaignId, data))[0];
  return held?.id ?? SHEET_STATIST_WEAPON_ROW_ID;
}

/** Zdanie o strzale, który nie poszedł — z nazwą urządzenia, jaką zna czytelnik (#37). */
export function deviceShotBlockedText(
  deviceName: string,
  code: 'NET_SHOT_COVERED' | 'NET_SHOT_BLOCKED',
  blockerName: string,
): string {
  return code === 'NET_SHOT_COVERED'
    ? `${deviceName}: strzał zasłania ${blockerName} — strzel jeszcze raz mimo osłony`
    : `${deviceName}: na linii strzału stoi ${blockerName}`;
}

/**
 * „Obróć" for a camera that stands on the map (zlecenie MG z 20.10): the
 * figure's facing is the axis of its cone, so turning the camera is turning
 * the figure — everybody who can see it sees it turn. The netrunner's view is
 * pushed by hand, because a hidden camera's upsert goes to the GM alone.
 */
async function turnCamera(
  deps: RealtimeDeps,
  campaignId: string,
  tokenId: string,
  asked: unknown,
  lookAt?: unknown,
): Promise<number> {
  const token = await deps.ctx.prisma.token.findUnique({
    where: { id: tokenId },
    include: { scene: true },
  });
  if (!token || token.scene.campaignId !== campaignId)
    throw new RealtimeError('NET_DEVICE_NO_TOKEN');
  const facing = netCameraFacingAfterTurn(
    token.facing,
    cameraFacingToward(token, token.scene.gridSizePx, lookAt) ?? asked,
  );
  const { scene, ...row } = token;
  const updated = await deps.ctx.prisma.token.update({ where: { id: row.id }, data: { facing } });
  await emitTokenUpsert(deps, campaignId, scene, updated);
  await refreshNetCameraSight(deps, campaignId, { force: true });
  return facing;
}

/**
 * Kierunek kamery patrzącej na wskazany punkt mapy (70b) — dowolny kąt, liczony
 * ze środka figury. Null, gdy punktu nie podano albo leży w samym środku.
 */
function cameraFacingToward(
  token: { x: number; y: number; size: number },
  gridSizePx: number,
  lookAt: unknown,
): number | null {
  const point = lookAt as { x?: unknown; y?: unknown } | null | undefined;
  if (typeof point?.x !== 'number' || typeof point.y !== 'number') return null;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  const half = (token.size * gridSizePx) / 2;
  return facingFromDelta(point.x - (token.x + half), point.y - (token.y + half));
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
