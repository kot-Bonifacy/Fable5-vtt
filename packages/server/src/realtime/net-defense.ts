import type {
  CpredNetRuntime,
  NetDefenseCue,
  NetDefensePausePayload,
  SessionUser,
} from '@vtt/shared';
import { ROLE_GM, netDefenseAutoStep, readNetRuntime } from '@vtt/shared';
import type { Scene } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import type { CombatantRow } from './combat.js';
import { emitCombatOfScene } from './combat.js';
import { flushPresentation } from './presentation.js';
import { systemHand } from './zone-effects.js';
import { iceDetects, iceTakesTurn, loadRun, requireRun, roundOfScene } from './netcombat.js';
import { demonDetects, demonTakesTurn } from './netdemons.js';
import { emitRuns, updateRuntime } from './netrun-io.js';

/**
 * Automat obrony Sieci (etap 70e, decyzja MG nr 4 z 11.11).
 *
 * Do etapu Czarny LOD i Demon ruszały się wyłącznie na klik MG (decyzja
 * z 15.08) — a w środku walki fizycznej łatwo o tym zapomnieć, więc obrona
 * Architektury stała, dopóki ktoś nie przypomniał. Teraz robi to, co
 * podręcznik każe jej robić, sama:
 *
 *  - **wykrycie LOD-u** — netrunner staje na jego piętrze (ruch, Ślizg,
 *    podłączenie): ten sam test sporny i ten sam skutek co pod przyciskiem MG;
 *  - **Demon zaczyna ścigać** — netrunner wchodzi na jego piętro albo przejmie
 *    węzeł kontrolny jego Architektury;
 *  - **Tura w kolejce** — wskaźnik inicjatywy staje na wierszu LOD-u albo
 *    Demona, ten gra swoją Turę, a kolejka idzie dalej (`passForfeitedTurns`).
 *
 * Co robić, mówi czysta funkcja `netDefenseAutoStep` (`shared`); ten plik tylko
 * wykonuje — tymi samymi funkcjami, które stoją za przyciskami MG
 * (`iceDetects`, `iceTakesTurn`, `demonDetects`, `demonTakesTurn`). Ręka to
 * **konto MG** (`systemHand`, #39): obrona należy do MG, więc karta, kości
 * i wiersz dziennika nie idą na konto gracza, którego ruch je wywołał.
 *
 * **Hamulec MG** (`CpredNetRuntime.defensePaused`, na Architekturę): wstrzymana
 * obrona zachowuje się jak przed etapem, a przyciski MG działają w obu trybach.
 * Zdjęcie hamulca nie nadrabia niczego wstecz — automat rusza od następnego
 * zdarzenia, więc „Następna tura” MG nie przeskakuje nikogo.
 */

/** Is the defence of this Architecture on the GM's brake? */
export function defensePausedOf(runtime: CpredNetRuntime): boolean {
  return runtime.defensePaused === true;
}

/**
 * The defence answers something the netrunner did — a move, a Ślizg, the
 * jack-in floor, a node taken. Moves are executed one by one on a freshly read
 * run: the first detection may end the run (an emergency jack-out), and the
 * next one must not act on a netrunner who is no longer there.
 *
 * Returns whether anything happened, so the caller knows its reply is stale.
 */
export async function answerNetDefense(
  deps: RealtimeDeps,
  input: {
    campaignId: string;
    user: SessionUser;
    runId: string;
    cue: Exclude<NetDefenseCue, { kind: 'turn' }>;
  },
): Promise<boolean> {
  const { campaignId, runId } = input;
  const first = await loadRun(deps, campaignId, runId);
  if (!first) return false;
  const paused = defensePausedOf(readNetRuntime(first.row.architecture.runtime));
  const moves = netDefenseAutoStep(first.state, input.cue, { paused });
  if (moves.length === 0) return false;

  const hand = await systemHand(deps, campaignId, input.user);
  // What the netrunner did reaches the table before the defence's dice.
  await flushPresentation(deps);
  let acted = false;
  for (const move of moves) {
    const run = await loadRun(deps, campaignId, runId);
    if (!run) break;
    if (move.kind === 'detect-ice') {
      const ice = run.state.ice.find((entry) => entry.id === move.iceId);
      if (!ice || ice.mode !== 'lurking' || ice.detected) continue;
      await iceDetects(deps, { campaignId, user: hand, run, ice });
      acted = true;
    } else if (move.kind === 'wake-demon') {
      const demon = run.state.demons.find((entry) => entry.id === move.demonId);
      if (!demon || demon.mode !== 'lurking') continue;
      await demonDetects(deps, { campaignId, user: hand, run, demon });
      acted = true;
    }
    await flushPresentation(deps);
  }
  return acted;
}

/** What the queue does after a Net participant's seat came up. */
export type NetFoeTurnOutcome = 'played' | 'passed' | 'wait';

/**
 * A Black ICE or a Demon reached the head of the queue (its row has no figure,
 * only `netRunId` and `netIceId`). With the defence running it plays its Turn
 * here and the caller hands the turn on; `wait` leaves the pointer on it for
 * the GM — the brake is on, or the row is not the Net's.
 *
 * The tracker is shown with the pointer on the foe **before** its dice, so the
 * table sees whose Turn it is while they roll („krótka pauza na kości”: the
 * client holds the next view until the dice land).
 */
export async function playNetFoeTurn(
  deps: RealtimeDeps,
  input: {
    campaignId: string;
    scene: Scene;
    combatant: CombatantRow;
    user: SessionUser;
  },
): Promise<NetFoeTurnOutcome> {
  const { campaignId, combatant } = input;
  if (!combatant.netRunId || !combatant.netIceId) return 'wait';
  const run = await loadRun(deps, campaignId, combatant.netRunId);
  // A row left over from a run that is gone — nobody is there to be hunted.
  if (!run) return 'passed';
  const paused = defensePausedOf(readNetRuntime(run.row.architecture.runtime));
  const round = await roundOfScene(deps, run.scene.id);
  const [move] = netDefenseAutoStep(
    run.state,
    { kind: 'turn', foeId: combatant.netIceId, round },
    { paused },
  );
  if (!move) return 'wait';
  if (move.kind !== 'ice-turn' && move.kind !== 'demon-turn') return 'passed';

  const hand = await systemHand(deps, campaignId, input.user);
  await emitCombatOfScene(deps, campaignId, input.scene);
  await flushPresentation(deps);
  if (move.kind === 'ice-turn') {
    const ice = run.state.ice.find((entry) => entry.id === move.iceId)!;
    await iceTakesTurn(deps, { campaignId, user: hand, run, ice });
  } else {
    const demon = run.state.demons.find((entry) => entry.id === move.demonId)!;
    await demonTakesTurn(deps, { campaignId, user: hand, run, demon });
  }
  return 'played';
}

/**
 * „Obrona Sieci: działa sama / wstrzymana” — the GM's brake, per Architecture.
 * Nothing is caught up on release (see the module's comment).
 */
export const netDefensePauseEvent = defineEvent<NetDefensePausePayload, void>({
  name: 'netrun:defense:pause',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    if (!socket.data.campaign) throw new RealtimeError('NO_CAMPAIGN');
    const campaignId = socket.data.campaign.id;
    if (typeof payload?.paused !== 'boolean') throw new RealtimeError('BAD_REQUEST');
    const { row } = await requireRun(deps, campaignId, user, payload.runId);
    const paused = payload.paused;
    await updateRuntime(deps.ctx.prisma, row.architectureId, (runtime) => {
      const { defensePaused: _was, ...rest } = runtime;
      return paused ? { ...rest, defensePaused: true } : rest;
    });
    await emitRuns(deps, campaignId);
  },
});
