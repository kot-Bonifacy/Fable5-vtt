import type { Scene, Token } from '../generated/prisma/client.js';
import type {
  BackupResolvePayload,
  CombatActionLogEntry,
  CpredBackupPending,
  CpredBackupTier,
  CpredCombatProfile,
  SessionUser,
} from '@vtt/shared';
import {
  CPRED_ACTION_BACKUP,
  ROLE_GM,
  cpredBackupProfile,
  cpredBackupSkillLevels,
  describeBackupTier,
  isWeaponEntry,
  readCpredCombatState,
  resolveWeapon,
} from '@vtt/shared';
import { backupDue, backupTierById } from '../sheets.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { requireCampaignScene } from './scenes.js';
import { createStatistToken, freeSpotsNear } from './tokens.js';
import {
  emitCombatOfScene,
  loadCombat,
  requireCampaignId,
  rollFlatInitiative,
  type CombatRow,
} from './combat.js';
import { buildCompendiumSync } from './compendium.js';
import { INCLUDE_CHAT_NAMES, broadcastChatMessage, toChatMessageView } from './chat-io.js';

/**
 * Wsparcie on the map (stage 30c) — „Dzięki tej zdolności Stróż Prawa może
 * wezwać na pomoc grupę innych funkcjonariuszy" (s. 158).
 *
 * The whole of this module is one idea: a category from the rulebook's table is
 * already the shape of a statist's combat profile (stage 16b), so calling for
 * help does not introduce a new kind of figure — it introduces a *delay* before
 * a familiar one appears. Everything below is either that delay or the four
 * lines it takes to turn a printed block into tokens.
 *
 * Its own module rather than a corner of `characters.ts` because two very
 * different callers need it: the Lawman's Action (which lives with the other
 * sheet events) and the turn hook that counts the rounds down. `turn-effects.ts`
 * imports the second, and importing the first would drag the whole sheet layer
 * into the tracker's own hooks.
 */

/** Longest a group waits; the die is 1k6, this only guards a hand-edited row. */
const MAX_WAIT_ROUNDS = 6;

/** The system's memory of one running fight, read off the opaque column. */
function stateOf(combat: CombatRow): { backup: CpredBackupPending[] } {
  return readCpredCombatState(combat.systemState);
}

async function writeState(
  deps: RealtimeDeps,
  combatId: string,
  backup: CpredBackupPending[],
): Promise<void> {
  await deps.ctx.prisma.combat.update({
    where: { id: combatId },
    // An empty list clears the column rather than storing `{"backup":[]}` — a
    // fight nobody called anybody into has to look exactly like it did before
    // this stage existed.
    data: { systemState: backup.length > 0 ? JSON.stringify({ backup }) : null },
  });
}

/**
 * The weapon numbers a category carries, looked up **by name**.
 *
 * By name and not by id, for the reason `criticalInjuryAt` matches names: the
 * catalogue's ids are minted by the importer from a Polish string, and a table
 * that has been re-imported since this code was written may not have the same
 * ones. A name that finds nothing degrades to bare fists with the printed name
 * still on the row, which is a readable figure rather than a broken one.
 */
async function weaponFor(
  deps: RealtimeDeps,
  campaignId: string,
  name: string,
): Promise<{ weaponId: string | null; weaponDamage: string; ammoMax: number }> {
  const compendium = await buildCompendiumSync(deps, campaignId);
  const wanted = name.trim().toLowerCase();
  const entry = compendium.entries.find(
    (candidate) => isWeaponEntry(candidate) && candidate.name.trim().toLowerCase() === wanted,
  );
  if (!entry || !isWeaponEntry(entry)) return { weaponId: null, weaponDamage: '1k6', ammoMax: 0 };
  const weaponTypeById = new Map(compendium.weaponTypes.map((type) => [type.id, type]));
  const resolved = resolveWeapon(entry, { weaponTypeById });
  return {
    weaponId: entry.id,
    weaponDamage: resolved.damage,
    ammoMax: resolved.magazine ?? 0,
  };
}

/**
 * One officer's full combat profile — the printed block plus their gun.
 *
 * Od 31.08 także piętnaście Testów federalnych (s. 159). Wpisane w profil przy
 * stawianiu figury, a nie odczytywane później z kategorii, bo po przybyciu po
 * kategorii nie zostaje ślad: `tierId` żyje w `Combat.systemState` wyłącznie
 * na czas drogi, a nazwa żetonu jest tym, co MG może zmienić jednym kliknięciem.
 * Figura ma nieść to, co umie, tak samo jak niesie to, czym strzela.
 */
async function profileFor(
  deps: RealtimeDeps,
  campaignId: string,
  tier: CpredBackupTier,
): Promise<CpredCombatProfile> {
  const seed = cpredBackupProfile(tier);
  const weapon = await weaponFor(deps, campaignId, tier.weapon);
  const skills = cpredBackupSkillLevels(tier, deps.ctx.cpred);
  return {
    ...seed,
    weaponId: weapon.weaponId,
    weaponName: tier.weapon,
    weaponDamage: weapon.weaponDamage,
    ammoMax: weapon.ammoMax,
    ammoCurrent: weapon.ammoMax,
    ...(Object.keys(skills).length > 0 ? { skills } : {}),
  };
}

/**
 * Puts a category on the map and into the queue, in one move.
 *
 * „Udane wezwanie stawia figury na mapie z pełnym profilem bojowym i wierszem
 * inicjatywy" is the stage's own completion criterion, and the two halves are
 * done together on purpose: a GM who has to remember the second half is a GM
 * whose reinforcements act a round late.
 *
 * Initiative is rolled on a bare 1k10. The rulebook gives a Backup group a
 * Wartość bojowa, an OB, PW, RUCH and BC — and **no REF**, which is the stat
 * initiative is made of. Adding the combat value instead would put a C-SWAT
 * trooper permanently at the top of every queue; leaving the row unrolled would
 * hide the officers at the bottom until somebody noticed. The die alone is the
 * honest reading of a block that does not print the number (session decision,
 * 2026-08-29).
 */
export async function spawnBackup(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  tier: CpredBackupTier,
  options: { near: { x: number; y: number } | null; user: SessionUser; callerName: string },
): Promise<Token[]> {
  const profile = await profileFor(deps, campaignId, tier);
  const spots = await freeSpotsNear(deps.ctx.prisma, scene, options.near, tier.count);
  const tokens: Token[] = [];
  for (let index = 0; index < tier.count; index += 1) {
    tokens.push(
      await createStatistToken(deps, campaignId, scene, {
        name: tier.count > 1 ? `${tier.unit} ${index + 1}` : tier.unit,
        at: spots[index]!,
        hp: tier.hp,
        profile: { ...profile },
      }),
    );
  }

  const combat = await loadCombat(deps.ctx.prisma, scene.id);
  if (combat) {
    let order = combat.combatants.length;
    for (const token of tokens) {
      const initiative = rollFlatInitiative();
      await deps.ctx.prisma.combatant.create({
        data: {
          combatId: combat.id,
          tokenId: token.id,
          order: order++,
          initiative,
          tieBreak: 0,
        },
      });
    }
    await emitCombatOfScene(deps, campaignId, scene);
  }

  await logBackupLine(
    deps,
    campaignId,
    options.user,
    options.callerName,
    'Wsparcie przybywa',
    `${tier.name} ×${tier.count} — ${describeBackupTier(tier)}`,
  );
  return tokens;
}

/**
 * Records a group that is still on its way, or places it at once when there is
 * no fight to wait a number of rounds inside.
 *
 * The second half is the honest half: outside combat a Round is not a unit this
 * VTT counts, so „za 4 Rundy" would be a countdown that never ticks. The
 * officers arrive, the chat line says how long they took in the fiction, and
 * the table gets on with it.
 */
export async function scheduleBackup(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  tier: CpredBackupTier,
  options: {
    rounds: number;
    near: { x: number; y: number } | null;
    callerTokenId: string | null;
    callerName: string;
    user: SessionUser;
    awaitingSecond?: boolean;
  },
): Promise<{ placed: boolean; pendingId: string | null }> {
  const combat = await loadCombat(deps.ctx.prisma, scene.id);
  // Round 0 is „PRZED WALKĄ": the queue exists but no round has begun, so there
  // is nothing to count from — same reasoning as the trap of 26f.
  if (!combat || combat.round < 1) {
    await spawnBackup(deps, campaignId, scene, tier, {
      near: options.near,
      user: options.user,
      callerName: options.callerName,
    });
    return { placed: true, pendingId: null };
  }
  const state = stateOf(combat);
  const entry: CpredBackupPending = {
    id: `bk${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    tierId: tier.id,
    arriveAtRound:
      combat.round + Math.min(MAX_WAIT_ROUNDS, Math.max(1, Math.round(options.rounds))),
    callerTokenId: options.callerTokenId,
    callerName: options.callerName,
    ...(options.awaitingSecond ? { awaitingSecond: true as const } : {}),
  };
  await writeState(deps, combat.id, [...state.backup, entry]);
  await emitCombatOfScene(deps, campaignId, scene);
  return { placed: false, pendingId: entry.id };
}

/**
 * The round hook: whoever is due steps onto the map.
 *
 * Called from `advanceTurn` beside `sweepTimedEffects`, and swept over the
 * whole scene for the same reason that one is — arrival is a fact about the
 * fight, not about anybody's turn, and a group whose caller has meanwhile died
 * still turns up.
 */
export async function sweepBackupArrivals(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  round: number,
  user: SessionUser,
): Promise<void> {
  const combat = await loadCombat(deps.ctx.prisma, scene.id);
  if (!combat) return;
  const state = stateOf(combat);
  if (state.backup.length === 0) return;
  const due = backupDue(state, round);
  if (due.length === 0) return;

  const remaining = state.backup.filter((entry) => !due.some((row) => row.id === entry.id));
  await writeState(deps, combat.id, remaining);
  for (const entry of due) {
    const tier = backupTierById(entry.tierId);
    if (!tier) continue;
    await spawnBackup(deps, campaignId, scene, tier, {
      near: await spotOfCaller(deps, entry.callerTokenId),
      user,
      callerName: entry.callerName,
    });
  }
}

/** Where the caller is standing, or null when their figure is gone. */
async function spotOfCaller(
  deps: RealtimeDeps,
  tokenId: string | null,
): Promise<{ x: number; y: number } | null> {
  if (!tokenId) return null;
  const token = await deps.ctx.prisma.token.findUnique({
    where: { id: tokenId },
    select: { x: true, y: true },
  });
  return token ? { x: token.x, y: token.y } : null;
}

/**
 * What the GM does to a group in transit (stage 30c).
 *
 * Three verbs on one event because they are one decision — „what happens to
 * these officers" — and because all three end in the same two lines: rewrite
 * the opaque column, re-emit the tracker.
 *
 * `second` is the answer to the question a rank-10 six asks. „Przybywają dwie
 * różne grupy Wsparcia" and the rulebook never says which second one, so the
 * VTT refuses to guess: the row carries the question until a person answers it.
 */
export const backupResolveEvent = defineEvent<BackupResolvePayload, { placed: boolean }>({
  name: 'backup:resolve',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const sceneId = payload?.sceneId ?? socket.data.viewedSceneId;
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, sceneId);
    const combat = await loadCombat(deps.ctx.prisma, scene.id);
    if (!combat) throw new RealtimeError('COMBAT_NOT_FOUND');
    const state = stateOf(combat);
    const entry = state.backup.find((row) => row.id === payload?.pendingId);
    if (!entry) throw new RealtimeError('BACKUP_NOT_FOUND');

    if (payload?.action === 'cancel') {
      await writeState(
        deps,
        combat.id,
        state.backup.filter((row) => row.id !== entry.id),
      );
      await emitCombatOfScene(deps, campaignId, scene);
      await logBackupLine(
        deps,
        campaignId,
        user,
        entry.callerName,
        'Wsparcie odwołane',
        'Nikt nie przyjedzie.',
      );
      return { placed: false };
    }

    if (payload?.action === 'second') {
      const tier = backupTierById(payload?.tierId ?? '');
      if (!tier) throw new RealtimeError('UNKNOWN_BACKUP_TIER');
      // The question is answered by *adding* the second group, not by changing
      // the first: „dwie różne grupy" means two rows arriving together, and the
      // one already promised keeps the category the Lawman asked for.
      const second: CpredBackupPending = {
        id: `${entry.id}b`,
        tierId: tier.id,
        arriveAtRound: entry.arriveAtRound,
        callerTokenId: entry.callerTokenId,
        callerName: entry.callerName,
      };
      // The question is answered, so the flag comes off — rebuilt field by
      // field rather than spread, because `awaitingSecond` must be *absent*,
      // not present and false.
      const backup = state.backup.map((row) =>
        row.id === entry.id
          ? {
              id: row.id,
              tierId: row.tierId,
              arriveAtRound: row.arriveAtRound,
              callerTokenId: row.callerTokenId,
              callerName: row.callerName,
            }
          : row,
      );
      await writeState(deps, combat.id, [...backup, second]);
      await emitCombatOfScene(deps, campaignId, scene);
      await logBackupLine(
        deps,
        campaignId,
        user,
        entry.callerName,
        'Druga grupa Wsparcia',
        `${tier.name} ×${tier.count} — ${describeBackupTier(tier)}`,
      );
      return { placed: false };
    }

    const tier = backupTierById(entry.tierId);
    if (!tier) throw new RealtimeError('UNKNOWN_BACKUP_TIER');
    // „Place" is the GM saying the wait is over — the row leaves the column
    // whether or not its round has come, which is what a button that says
    // „przybywają teraz" has to mean.
    await writeState(
      deps,
      combat.id,
      state.backup.filter((row) => row.id !== entry.id),
    );
    await spawnBackup(deps, campaignId, scene, tier, {
      near: await spotOfCaller(deps, entry.callerTokenId),
      user,
      callerName: entry.callerName,
    });
    return { placed: true };
  },
});

/**
 * One public line about the radio. `kind: 'action'` like every other thing the
 * tracker narrates, so the fight's history reads in one voice — and so a bot
 * reading chat (stage 19) learns that four more guns just walked in.
 */
export async function logBackupLine(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  actorName: string,
  actionName: string,
  note?: string,
): Promise<void> {
  const entry: CombatActionLogEntry = {
    combatantId: '',
    actorName,
    actionId: CPRED_ACTION_BACKUP,
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
  broadcastChatMessage(deps, campaignId, toChatMessageView(stored));
}
