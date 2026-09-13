import type {
  CpredNetArchitecture,
  CpredNetDemon,
  CpredNetRuntime,
  NetDemonActPayload,
  NetDemonNodeView,
  NetRunAbilityResult,
  RollResult,
} from '@vtt/shared';
import {
  ROLE_GM,
  isNetDefenseEntry,
  metresBetween,
  netBonusTotal,
  netBrainArmour,
  netControlDv,
  netDemonActions,
  netDemonById,
  netDemonCombatValue,
  netDemonControlBonuses,
  netDemonFloors,
  netDemonHoldDv,
  netDemonInstance,
  netDemonLosesNode,
  netDemonPafPlan,
  netDemonTakesNode,
  netDeviceStateOf,
  netMarkNodeUse,
  netNodeIsFree,
  nextDemonStep,
  readNetRuntime,
  rollFormula,
  tokenCentre,
  tokenTableName,
} from '@vtt/shared';
import type { Scene, Token } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { campaignEntry } from './compendium.js';
import { createMixedRng } from './dice-rng.js';
import { emitTokensById, toTokenView } from './tokens.js';
import { toSceneView } from './scenes.js';
import { hasLineOfFire, loadVisionContext } from './vision.js';
import {
  postExchange,
  pushNetFoeIntoQueue,
  requireRun,
  rollExchange,
  rollSide,
  roundOfScene,
} from './netcombat.js';
import { damageBrain, type FullRunState } from './netice.js';
import { fireDevice } from './netdevices.js';
import { emitRuns, logNetLine, netActionsForRun, saveRunState } from './netrun-io.js';

/**
 * Demony (etap 26e) — Architektura, która broni się sama.
 *
 * Cztery decyzje niosą cały plik:
 *
 *  1. **Demon rusza się wyłącznie na klik MG** — tak samo jak Czarny LOD z 26c
 *     (decyzja MG z 15.08, powtórzona 16.08). Dwa przyciski: „Demon wykrywa
 *     intruza" i „Tura Demona". Pierwszy nie ma za sobą żadnego testu, bo Demon
 *     nie ma PRĘDKOŚCI — wykrycie jest faktem, nie rzutem.
 *  2. **Tura idzie jednym klikiem, z celami wybranymi przez silnik**
 *     (decyzja MG z 16.08). Karta obrażeń ma „Cofnij", więc wybór, który MG się
 *     nie spodoba, kosztuje jedno kliknięcie.
 *  3. **Kolejność kroków jest czystą funkcją.** `nextDemonStep` w `shared`
 *     odpowiada „co teraz", a ten plik tylko wykonuje: odbiera węzeł Testem
 *     Kontroli, strzela z wieżyczki albo Pafa. Krok po kroku, a nie z gotowej
 *     listy, bo Test Kontroli może się nie udać — a węzeł odebrany w tej Turze
 *     wolno w tej samej Turze wykorzystać.
 *  4. **Wieżyczka Demona strzela tą samą drogą co wieżyczka netrunnera.**
 *     `fireDevice` z 26d dostaje w rękę „Wartość bojową" zamiast arkusza
 *     netrunnera i to jest cała różnica — zasięg, PT, osłona, linia strzału,
 *     magazynek i karta obrażeń działają bez jednej linijki nowego kodu.
 */

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

// ─────────────────────────── stawianie Demonów ───────────────────────────

/**
 * Instantiates every Demon the GM put in this Architecture, at jack-in.
 *
 * Unlike a Black ICE, which is met by opening the door of its floor (26c), a
 * Demon exists from the first moment somebody is inside: „Demon wie o wszystkim,
 * co dzieje się w jego Architekturze" (s. 212). What the netrunner *learns*
 * about it is a different question — one that has not started hunting is absent
 * from a player's payload entirely (`netDemonViews`).
 */
export async function spawnDemons(
  deps: RealtimeDeps,
  campaignId: string,
  architecture: CpredNetArchitecture,
  state: FullRunState,
): Promise<FullRunState> {
  const known = new Set(state.demons.map((demon) => demon.id));
  const spawned: CpredNetDemon[] = [];
  for (const floor of netDemonFloors(architecture)) {
    for (const [index, entryId] of (floor.programIds ?? []).entries()) {
      const entry = await campaignEntry(deps, campaignId, entryId);
      if (!entry || !isNetDefenseEntry(entry) || entry.defenseKind !== 'demon') continue;
      const demon = netDemonInstance({
        floorId: floor.id,
        index,
        entryId,
        name: entry.name,
        profile: entry,
      });
      if (!known.has(demon.id)) spawned.push(demon);
    }
  }
  if (spawned.length === 0) return state;
  return { ...state, demons: [...state.demons, ...spawned] };
}

// ─────────────────────────── wspólne narzędzia ───────────────────────────

function requireDemon(state: FullRunState, demonId: unknown): CpredNetDemon {
  if (typeof demonId !== 'string' || demonId.length === 0) throw new RealtimeError('BAD_REQUEST');
  const demon = netDemonById(state, demonId);
  if (!demon) throw new RealtimeError('NET_DEMON_UNKNOWN');
  if (demon.mode === 'derezzed' || demon.mode === 'destroyed') {
    throw new RealtimeError('NET_DEMON_DOWN');
  }
  return demon;
}

/** One Check of a Demon: „Interfejs + 1k10 przeciw PT". */
function rollDemonCheck(
  demon: CpredNetDemon,
  title: string,
  dv: number,
): { roll: RollResult; total: number; success: boolean } {
  // A Demon's roll neither explodes nor fumbles, for the reason 26c gave a
  // Program's: the critical rule of the rulebook hangs on Skill Checks, and a
  // Demon has an Interface, not a Skill.
  const { result, breakdown } = rollSide(netDemonControlBonuses(demon), undefined, false);
  result.title = `${title} · PT ${dv}`;
  result.actor = demon.name;
  if (breakdown.length > 0) result.breakdown = breakdown;
  return { roll: result, total: result.total, success: result.total > dv };
}

/**
 * Every control node of the shaft, in the shape the Demon's Turn reads.
 *
 * Built fresh before each step, because the previous step may have changed who
 * holds what. `used` folds in two different reasons to skip a node: the shared
 * „raz na Turę" ledger of 26d (one node fires once per Round, whosever hand is
 * on it) and whatever this Turn has already tried and failed at.
 */
function nodeViews(
  architecture: CpredNetArchitecture,
  state: FullRunState,
  runtime: CpredNetRuntime,
  round: number | null,
  spent: ReadonlySet<string>,
): NetDemonNodeView[] {
  const held = new Set(state.controlled.map((hold) => hold.floorId));
  const nodes: NetDemonNodeView[] = [];
  for (const branch of architecture.branches) {
    for (const floor of branch.floors) {
      if (floor.kind !== 'controlNode') continue;
      nodes.push({
        floorId: floor.id,
        ...(floor.dv !== undefined ? { dv: floor.dv } : {}),
        heldByRunner: held.has(floor.id) && !spent.has(floor.id),
        used: spent.has(floor.id) || !netNodeIsFree(state.nodeUse, floor.id, round),
        devices: (floor.devices ?? []).map((device) => ({
          id: device.id,
          name: device.name,
          deviceKind: device.deviceKind,
          on: netDeviceStateOf(runtime.devices, device.id).on,
          hasToken: device.tokenId !== undefined,
        })),
      });
    }
  }
  return nodes;
}

function floorOfId(architecture: CpredNetArchitecture, floorId: string) {
  return architecture.branches.flatMap((branch) => branch.floors).find((f) => f.id === floorId);
}

/** Every figure that *is* a device of this Architecture — never a target. */
function deviceTokenIds(architecture: CpredNetArchitecture): Set<string> {
  const ids = new Set<string>();
  for (const branch of architecture.branches) {
    for (const floor of branch.floors) {
      for (const device of floor.devices ?? []) {
        if (device.tokenId) ids.add(device.tokenId);
      }
    }
  }
  return ids;
}

/**
 * Who the turret shoots at.
 *
 * A **VTT reading, not RAW**: the rulebook says a Demon works the systems it
 * controls and leaves the choice of victim to the table. Since the GM asked for
 * one click (16.08), somebody has to choose, so the rule is: the intruder it is
 * fighting — the netrunner's own figure — whenever there is a line of fire to
 * them, and otherwise the nearest figure that is not one of the Architecture's
 * own devices. A turret shooting the drone standing next to it would be a worse
 * guess than any of the alternatives.
 */
async function pickTurretTarget(
  deps: RealtimeDeps,
  campaignId: string,
  input: { turretTokenId: string; runnerTokenId: string; devices: ReadonlySet<string> },
): Promise<Token | null> {
  const turret = await deps.ctx.prisma.token.findUnique({
    where: { id: input.turretTokenId },
    include: { scene: true },
  });
  if (!turret || turret.scene.campaignId !== campaignId) return null;
  const scene: Scene = turret.scene;
  const view = toSceneView(scene);
  const from = tokenCentre(toTokenView(turret, true), view);
  const context = await loadVisionContext(deps.ctx.prisma, scene);

  const candidates = (
    await deps.ctx.prisma.token.findMany({ where: { sceneId: scene.id } })
  ).filter((token) => token.id !== turret.id && !input.devices.has(token.id));

  let best: { token: Token; metres: number } | null = null;
  for (const token of candidates) {
    const to = tokenCentre(toTokenView(token, true), view);
    if (!hasLineOfFire(context, from, to)) continue;
    if (token.id === input.runnerTokenId) return token;
    const metres = metresBetween(from, to, view);
    if (!best || metres < best.metres) best = { token, metres };
  }
  return best?.token ?? null;
}

// ─────────────────────────── „Demon wykrywa intruza" ───────────────────────────

/**
 * „Demony … nie mają Prędkości" (s. 212), so noticing an intruder is not the
 * contest of s. 205 — there is nothing to roll against and no free attack. What
 * is left of the encounter is the half that matters at the table: the Demon
 * starts hunting and takes the head of the initiative queue.
 */
export const netDemonDetectEvent = defineEvent<NetDemonActPayload, NetRunAbilityResult>({
  name: 'netrun:demon:detect',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { row, state, scene } = await requireRun(deps, campaignId, user, payload?.runId);
    const demon = requireDemon(state, payload?.demonId);
    if (demon.mode === 'hunting') throw new RealtimeError('NET_DEMON_ALREADY_DETECTED');

    let next: FullRunState = {
      ...state,
      demons: state.demons.map((entry) =>
        entry.id === demon.id ? { ...entry, mode: 'hunting' as const } : entry,
      ),
    };
    const combatantId = await pushNetFoeIntoQueue(deps, campaignId, scene, {
      runId: row.id,
      foeId: demon.id,
      label: demon.name,
    });
    if (combatantId) {
      next = {
        ...next,
        demons: next.demons.map((entry) =>
          entry.id === demon.id ? { ...entry, combatantId } : entry,
        ),
      };
    }
    await saveRunState(deps.ctx.prisma, row.id, next);

    const summary = `${demon.name} wie już o intruzie — Architektura zaczyna się bronić.`;
    const message = await logNetLine(
      deps,
      campaignId,
      user,
      tokenTableName(row.token, row.token.character?.name ?? row.token.name),
      'Demon',
      `${demon.name} — wykrycie intruza`,
    );
    await emitRuns(deps, campaignId);
    return { messageId: message.id, total: 0, success: true, summary };
  },
});

// ─────────────────────────────── „Tura Demona" ───────────────────────────────

/**
 * One whole Turn of a Demon, in one click.
 *
 * „Demon używa Akcji Sieciowych przede wszystkim na obsługę węzłów kontrolnych,
 * a Pafa dopiero z tego, co mu zostanie" (s. 212). The order comes out of
 * `nextDemonStep`; everything here is the doing of it.
 */
export const netDemonTurnEvent = defineEvent<NetDemonActPayload, NetRunAbilityResult>({
  name: 'netrun:demon:turn',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { row, architecture, state, scene } = await requireRun(
      deps,
      campaignId,
      user,
      payload?.runId,
    );
    const demon = requireDemon(state, payload?.demonId);
    if (demon.mode !== 'hunting') throw new RealtimeError('NET_DEMON_NOT_DETECTED');
    const round = await roundOfScene(deps, scene.id);
    if (round !== null && demon.lastTurnRound === round) {
      throw new RealtimeError('NET_DEMON_ALREADY_ACTED');
    }
    let actionsLeft = netDemonActions(demon.profile);
    if (actionsLeft <= 0) throw new RealtimeError('NET_DEMON_NO_ACTIONS');

    const runtime = readNetRuntime(row.architecture.runtime);
    const devices = deviceTokenIds(architecture);
    const runnerName = tokenTableName(row.token, row.token.character?.name ?? row.token.name);
    const runnerOwnerId = row.token.character?.ownerId ?? row.token.ownerId;
    const { rank } = await netActionsForRun(deps.ctx.prisma, deps.ctx.cpred, row.characterId);

    let next: FullRunState = {
      ...state,
      demons: state.demons.map((entry) =>
        entry.id === demon.id ? { ...entry, lastTurnRound: round ?? entry.lastTurnRound } : entry,
      ),
    };
    /** Nodes this Turn is done with: fired from, or failed to take back. */
    const spent = new Set<string>();
    const lines: string[] = [];
    const tokenIds: string[] = [];

    while (actionsLeft > 0) {
      const step = nextDemonStep({
        nodes: nodeViews(architecture, next, runtime, round, spent),
        actionsLeft,
        canPaf: true,
      });
      if (!step) break;

      // ── odebranie węzła netrunnerowi ──
      if (step.kind === 'reclaim' && step.floorId) {
        const floorId = step.floorId;
        const floor = floorOfId(architecture, floorId);
        const runnerHold = next.controlled.find((hold) => hold.floorId === floorId);
        const dv = netControlDv(floor?.dv, runnerHold?.dv) ?? 0;
        const nodeName = floor?.label || 'Węzeł kontrolny';
        const check = rollDemonCheck(demon, `Kontrola — ${nodeName}`, dv);
        check.roll.outcome = {
          success: check.success,
          label: check.success ? `${nodeName} — odebrany` : `${nodeName} — został u netrunnera`,
          detail: check.success
            ? `PT odebrania go Demonowi: ${check.total}`
            : `PT ${dv} — węzeł nie ustąpił`,
        };
        if (check.success) {
          const stripped: FullRunState = {
            ...next,
            controlled: next.controlled.filter((hold) => hold.floorId !== floorId),
          };
          next = { ...stripped, ...netDemonTakesNode(stripped, floorId, check.total) };
          lines.push(`${nodeName} odebrany — PT odebrania go Demonowi: ${check.total}.`);
        } else {
          // One Test Kontroli per node per Turn: without this the Demon would
          // spend every remaining Action re-rolling the same lock.
          spent.add(floorId);
          lines.push(`${nodeName} — Test Kontroli nieudany (PT ${dv}).`);
        }
        await postExchange(deps, {
          campaignId,
          user,
          sceneId: scene.id,
          roll: check.roll,
          runnerOwnerId,
        });
        actionsLeft -= 1;
        continue;
      }

      // ── strzał z wieżyczki albo drona ──
      if (step.kind === 'fire' && step.floorId && step.deviceId) {
        const floorId = step.floorId;
        const device = floorOfId(architecture, floorId)?.devices?.find(
          (entry) => entry.id === step.deviceId,
        );
        if (!device?.tokenId) {
          spent.add(floorId);
          continue;
        }
        const target = await pickTurretTarget(deps, campaignId, {
          turretTokenId: device.tokenId,
          runnerTokenId: row.tokenId,
          devices,
        });
        if (!target) {
          // Nothing in sight from this barrel, so nothing is spent on it.
          spent.add(floorId);
          lines.push(`${device.name} — nie ma do kogo strzelić.`);
          continue;
        }
        const shot = await fireDevice(deps, {
          campaignId,
          user,
          device,
          hands: { combatValue: netDemonCombatValue(demon.profile) },
          targetTokenId: target.id,
          summary: `${device.name} → ${tokenTableName(target, target.name)}`,
        });
        lines.push(
          shot.blocked
            ? `${shot.blocked.text}.`
            : `${device.name} strzela do: ${tokenTableName(target, target.name)} (Wartość bojowa ${netDemonCombatValue(demon.profile)}).`,
        );
        next = { ...next, nodeUse: netMarkNodeUse(next.nodeUse, floorId, round) };
        spent.add(floorId);
        actionsLeft -= 1;
        continue;
      }

      // ── Paf, „z resztek" ──
      const plan = netDemonPafPlan({ demon, netrunner: { name: runnerName, interfaceRank: rank } });
      const exchange = rollExchange(plan, {
        attackerIsHuman: false,
        detail: `cel: ${runnerName} — ${plan.dice}k6 w mózg`,
        actor: demon.name,
      });
      if (exchange.won) {
        const rolled = rollFormula(
          { terms: [{ kind: 'dice', sign: 1, count: plan.dice, sides: 6 }] },
          createMixedRng(),
        ).total;
        const armour = netBonusTotal(netBrainArmour(next));
        const through = Math.max(0, rolled - armour);
        const card = await damageBrain(deps, {
          campaignId,
          user,
          characterId: row.characterId,
          token: row.token,
          damage: through,
          note:
            armour > 0
              ? `${demon.name}: Paf ${plan.dice}k6 = ${rolled} · Pancerz (Program) −${armour}`
              : `${demon.name}: Paf ${plan.dice}k6 = ${rolled} — bezpośrednio w mózg`,
        });
        if (card) tokenIds.push(row.tokenId);
        lines.push(
          armour > 0
            ? `Paf: ${plan.dice}k6 = ${rolled}, Pancerz zdjął ${armour} — ${through} w mózg.`
            : `Paf: ${plan.dice}k6 = ${rolled} bezpośrednio w mózg.`,
        );
        exchange.roll.opposed = {
          ...exchange.roll.opposed!,
          detail: `${exchange.roll.opposed!.detail} · ${through} w mózg`,
        };
      } else {
        lines.push('Paf chybia.');
      }
      await postExchange(deps, {
        campaignId,
        user,
        sceneId: scene.id,
        roll: exchange.roll,
        runnerOwnerId,
      });
      actionsLeft -= 1;
    }

    await saveRunState(deps.ctx.prisma, row.id, next);
    const summary =
      lines.length === 0 ? `${demon.name} nie ma czym zagrać Tury.` : lines.join(' · ');
    const message = await logNetLine(deps, campaignId, user, demon.name, 'Tura Demona', summary);
    if (tokenIds.length > 0) await emitTokensById(deps, campaignId, [...new Set(tokenIds)]);
    await emitRuns(deps, campaignId);
    return { messageId: message.id, total: 0, success: true, summary };
  },
});

// ─────────────────────────── węzły w rękach obrony ───────────────────────────

/**
 * The DV a netrunner's Kontrola has to beat, with the defence's own hold folded
 * in (stage 26e).
 *
 * „Demon trzyma wszystkie węzły swojej Architektury od startu" (decyzja MG
 * z 16.08), so a node nobody has taken is the Demon's at the floor's printed DV,
 * and a node it has rolled a Test Kontroli for is its at that total. A rival
 * netrunner's hold from 26d goes through the same `max`.
 */
export function netrunnerControlDv(
  state: FullRunState,
  floorId: string,
  floorDv: number | undefined,
  rivalDv: number | undefined,
): number | null {
  const held = [netDemonHoldDv(state, floorId), rivalDv].filter(
    (value): value is number => value !== undefined,
  );
  return netControlDv(floorDv, held.length > 0 ? Math.max(...held) : undefined);
}

/** After a netrunner's successful Kontrola: the defence stops holding that node. */
export function releaseDemonHold(state: FullRunState, floorId: string): FullRunState {
  return { ...state, ...netDemonLosesNode(state, floorId) };
}
