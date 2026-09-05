import type {
  ChatMessageView,
  CpredStatId,
  CpredNetCombatState,
  CpredNetDemonState,
  CpredNetIce,
  CpredNetRunState,
  DamageLogEntry,
  SessionUser,
} from '@vtt/shared';
import {
  CPRED_HOUR_S,
  CPRED_ON_FIRE_STATUS_ID,
  NET_ACCESS_RANGE_M,
  NET_PROGRAM_HOOK_LABELS,
  netBonusTotal,
  netBrainArmour,
  netDamageRezzed,
  netHookIsManual,
  netJackOutBill,
  netProgramDamageDice,
  netRandomDeckProgram,
  netRandomDefender,
  netRandomRezzed,
  parseCharacterData,
  rollFormula,
  describeCpredStatEffectValue,
} from '@vtt/shared';
import type { Scene, Token } from '../generated/prisma/client.js';
import { applyForcedFailureToSheet } from '../sheets.js';
import { applyStatEffect } from './stat-effects.js';
import { campaignGameTime } from './gametime.js';
import type { RealtimeDeps } from './registry.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { emitCombatOfScene } from './combat.js';
import { INCLUDE_CHAT_NAMES, broadcastRedactedChatMessage, toChatMessageView } from './chat-io.js';
import {
  emitRuns,
  loadRunForToken,
  logNetLine,
  netAccessVerdict,
  readFullRun,
  saveRunState,
} from './netrun-io.js';

/**
 * What a Black ICE does when it lands (stage 26c).
 *
 * Split out of the events for one structural reason: a run also ends the hard
 * way from `tokens.ts`, when the netrunner simply walks out of range, and that
 * exit costs „efekty wszystkich zrezowanych LOD-ów, które napotkał" (s. 198).
 * The same effect code therefore has to be reachable from the token layer —
 * which is why nothing here imports it back. Callers get the ids of whatever
 * figures changed and emit them themselves.
 *
 * Two rules shape the code:
 *
 *  - **Brain damage is direct damage.** „Zadaje 3k6 obrażeń bezpośrednio
 *    mózgowi" goes through the `ignoreArmor` path stage 16h opened for gas, so
 *    it lands on the sheet as an ordinary undoable damage card. The only thing
 *    that stops any of it is a rezzed Pancerz (s. 203), which is a Program and
 *    not armour.
 *  - **An anti-program ICE hits a Program, never the person.** „Lub
 *    w przypadku LOD-u przeciwprogramowego, jeden z twoich losowo określonych
 *    uruchomionych Programów" — the class decides, not the name.
 */

/**
 * Every slice of one run in one object: 26b's shaft, 26c's fight and 26e's
 * Demons. Three interfaces rather than one because each stage's reader has to
 * be able to run without the others — merged here, where the server actually
 * needs all three at once.
 */
export type FullRunState = CpredNetRunState & CpredNetCombatState & CpredNetDemonState;

/** Everything the caller has to refresh after an effect landed. */
export interface IceEffectResult {
  state: FullRunState;
  /** Polish lines for the card — one per thing that happened. */
  lines: string[];
  /** Figures whose row changed (HP, statuses); the caller emits them. */
  tokenIds: string[];
  /** Set when the effect threw the netrunner out of the Architecture. */
  ejected: boolean;
  /** Set when the run has to end because of it. */
  endsRun: boolean;
}

interface IceEffectInput {
  campaignId: string;
  user: SessionUser;
  ice: CpredNetIce;
  state: FullRunState;
  runId: string;
  characterId: string;
  token: Pick<Token, 'id' | 'name' | 'ownerId'>;
  /** Combat round, when a fight is running — the glue and the debt need it. */
  round: number | null;
  rng: (sides: number) => number;
  /** „Z wyjątkiem efektu tego Olbrzyma" — do not re-bill the ICE doing this. */
  duringJackOut?: boolean;
}

function rollDice(count: number, sides: number, rng: (sides: number) => number): number {
  if (count <= 0) return 0;
  return rollFormula({ terms: [{ kind: 'dice', sign: 1, count, sides }] }, rng).total;
}

/**
 * Applies one Black ICE effect to whoever it is pointed at.
 *
 * Deliberately does not decide *whether* it landed — the attack roll happens in
 * the event that calls this, and the free hit on detection has no attack roll
 * at all („jeśli wynik LOD-u jest wyższy … natychmiast odczuwasz efekt").
 */
export async function applyIceEffect(
  deps: RealtimeDeps,
  input: IceEffectInput,
): Promise<IceEffectResult> {
  const { ice } = input;
  let state = input.state;
  const lines: string[] = [];
  const tokenIds: string[] = [];
  let ejected = false;
  let endsRun = false;

  const antiProgram = ice.profile.target === 'antiProgram';
  if (antiProgram) {
    const victim = netRandomRezzed(state, input.rng);
    if (!victim) {
      lines.push('Nie ma w co uderzyć — netrunner nie ma uruchomionych Programów.');
      return { state, lines, tokenIds, ejected, endsRun };
    }
    const dice = netProgramDamageDice(ice.profile, 'program');
    const damage = rollDice(dice, 6, input.rng);
    const hit = netDamageRezzed(state, victim.id, damage, ice.profile.effects?.destroys);
    state = { ...state, ...hit.state };
    const verdict = hit.outcome?.destroyed
      ? 'zniszczony'
      : hit.outcome?.derezzed
        ? 'zderezowany'
        : `REZ ${hit.outcome?.after ?? '?'}`;
    lines.push(`${victim.name}: ${dice}k6 = ${damage} — ${verdict}.`);
    return { state, lines, tokenIds, ejected, endsRun };
  }

  // ── przeciwbiałkowy: obrażenia w mózg ──
  const dice = netProgramDamageDice(ice.profile, 'brain');
  if (dice > 0) {
    const rolled = rollDice(dice, 6, input.rng);
    const armour = netBonusTotal(netBrainArmour(state));
    const through = Math.max(0, rolled - armour);
    const card = await damageBrain(deps, {
      campaignId: input.campaignId,
      user: input.user,
      characterId: input.characterId,
      token: input.token,
      damage: through,
      note:
        armour > 0
          ? `${ice.name}: ${dice}k6 = ${rolled} · Pancerz (Program) −${armour}`
          : `${ice.name}: ${dice}k6 = ${rolled} — bezpośrednio w mózg`,
    });
    if (card) tokenIds.push(input.token.id);
    lines.push(
      armour > 0
        ? `${dice}k6 = ${rolled}, Pancerz zdjął ${armour} — ${through} w mózg.`
        : `${dice}k6 = ${rolled} bezpośrednio w mózg.`,
    );
  }

  for (const hook of ice.profile.effects?.hooks ?? []) {
    // Etap 39. Do 05.09.2026 oba te haki kończyły się zdaniem „stosuje MG" —
    // decyzja z 15.08 uzasadniała je wprost brakiem modelu czasowych
    // modyfikatorów Cech. Model jest, więc serwer rzuca 1k6, zapisuje wynik
    // i sam nakłada efekt na godzinę. Nazwy Cech biorą się z haka, nie z opisu
    // Programu: opis jest prozą, a hak jest daną.
    if (hook === 'statDrain' || hook === 'moveDrain') {
      const stats = hook === 'statDrain' ? NET_STAT_DRAIN_STATS : NET_MOVE_DRAIN_STATS;
      const applied = await drainStats(deps, input, stats);
      lines.push(
        applied.length > 0
          ? `${ice.name}: ${applied.join(', ')} — na godzinę.`
          : `${NET_PROGRAM_HOOK_LABELS[hook]} — karta nie przyjęła efektu, stosuje MG.`,
      );
      if (applied.length > 0) tokenIds.push(input.token.id);
      continue;
    }
    if (netHookIsManual(hook)) {
      lines.push(`${NET_PROGRAM_HOOK_LABELS[hook]} — stosuje MG.`);
      continue;
    }
    if (hook === 'eject') {
      ejected = true;
      endsRun = true;
      lines.push('Wyrzucony z Architektury bez zachowania środków bezpieczeństwa.');
      continue;
    }
    if (hook === 'burn') {
      const lit = await igniteFigure(deps, input.token.id);
      if (lit) tokenIds.push(input.token.id);
      lines.push('Cyberdek i ubranie płoną — 2 obrażenia na koniec każdej Tury, aż ugasi.');
      continue;
    }
    if (hook === 'stealNetAction') {
      state = { ...state, netActionDebt: state.netActionDebt + 1 };
      lines.push('W kolejnej Turze o jedną Akcję Sieciową mniej (nie mniej niż 2).');
      continue;
    }
    if (hook === 'glue') {
      // Superklej „przez 1k6 Rund", Kraken „do końca swojej kolejnej Tury".
      const rounds = ice.profile.effects?.glue === 'nextTurn' ? 1 : rollDice(1, 6, input.rng);
      state = {
        ...state,
        glue: {
          source: ice.name,
          untilRound: input.round === null ? null : input.round + rounds,
        },
      };
      lines.push(
        input.round === null
          ? `${ice.name} przykleił netrunnera — ani niżej, ani bezpiecznego odłączenia (zdejmuje MG).`
          : `${ice.name} przykleił netrunnera na ${rounds} — ani niżej, ani bezpiecznego odłączenia.`,
      );
      continue;
    }
    if (hook === 'slidePenalty') {
      if (!state.slideMarks.includes(ice.id)) {
        state = { ...state, slideMarks: [...state.slideMarks, ice.id] };
      }
      lines.push('Ślizg z modyfikatorem −2, dopóki ten Program działa.');
      continue;
    }
    if (hook === 'derezDefender') {
      const victim = netRandomDefender(state, input.rng);
      if (!victim) {
        lines.push('Nie ma zrezowanego Obrońcy do zderezowania.');
        continue;
      }
      const hit = netDamageRezzed(state, victim.id, victim.rezCurrent);
      state = { ...state, ...hit.state };
      lines.push(`${victim.name} zderezowany.`);
      continue;
    }
    if (hook === 'destroyProgram') {
      const destroyed = await destroyDeckProgram(deps, input.characterId, input.rng);
      if (!destroyed) {
        lines.push('Na deku nie ma Programu do zniszczenia.');
        continue;
      }
      // A destroyed Program is gone from the deck, so a running copy of it is
      // gone too — „nie jest już zderezowany … musisz kupić nowy" (s. 201).
      state = { ...state, rezzed: state.rezzed.filter((copy) => copy.rowId !== destroyed.rowId) };
      lines.push(`${destroyed.name} skasowany z cyberdeku — trzeba kupić nowy.`);
      continue;
    }
  }

  return { state, lines, tokenIds, ejected, endsRun };
}

/** „Na godzinę obniża o 1k6 INT, REF oraz ZW" — Nerwosol i Lisz (s. 205). */
const NET_STAT_DRAIN_STATS = ['int', 'ref', 'dex'] as const;

/** „Na następną godzinę RUCH spada o 1k6" — Skorpion (s. 207). */
const NET_MOVE_DRAIN_STATS = ['move'] as const;

/**
 * Obniża wymienione Cechy o **jeden** rzut 1k6 na godzinę.
 *
 * Jeden rzut na wszystkie trzy Cechy, nie trzy osobne: „obniża o 1k6 INT, REF
 * oraz ZW" wymienia jedną kość i trzy Cechy, a trzy rzuty dałyby netrunnerowi
 * trzy różne liczby, których tabela nie obiecuje. Kość jedzie z `input.rng`,
 * czyli z tego samego strumienia co obrażenia tego trafienia — bez tego test
 * z ustalonym RNG-iem widziałby raz taki wynik, raz inny.
 */
async function drainStats(
  deps: RealtimeDeps,
  input: IceEffectInput,
  stats: readonly CpredStatId[],
): Promise<string[]> {
  const character = await deps.ctx.prisma.character.findUnique({
    where: { id: input.characterId },
  });
  if (!character || character.campaignId !== input.campaignId) return [];
  const drain = rollDice(1, 6, input.rng);
  if (drain <= 0) return [];
  const time = await campaignGameTime(deps.ctx.prisma, input.campaignId);
  const clock = { round: input.round, minutes: time.minutes };
  const applied: string[] = [];
  for (const stat of stats) {
    // Karta czytana **od nowa** przy każdej Cesze: `applyStatEffect` zapisuje
    // wiersz i zwraca zapisaną kartę do bazy, więc trzy wywołania na tym samym
    // obiekcie zostawiłyby tylko ostatni efekt (każde scala z tym, co przeczytało).
    const fresh = await deps.ctx.prisma.character.findUnique({ where: { id: character.id } });
    if (!fresh) break;
    const effect = await applyStatEffect(
      deps,
      input.campaignId,
      fresh,
      {
        stat,
        value: -drain,
        source: input.ice.name,
        durationS: CPRED_HOUR_S,
        rolled: '1k6',
      },
      clock,
    );
    if (effect) applied.push(describeCpredStatEffectValue(effect));
  }
  return applied;
}

/**
 * „Obrażenia bezpośrednio mózgowi" on the sheet, with the card „Cofnij" knows.
 *
 * Reuses the forced-failure path of 16h rather than opening a second way to
 * lower hit points: a netrunner burned down by a Kraken has to be restorable
 * exactly like somebody who breathed a gas grenade.
 */
export async function damageBrain(
  deps: RealtimeDeps,
  input: {
    campaignId: string;
    user: SessionUser;
    characterId: string;
    token: Pick<Token, 'id' | 'name' | 'ownerId'>;
    damage: number;
    note: string;
  },
): Promise<ChatMessageView | null> {
  if (input.damage <= 0) return null;
  const character = await deps.ctx.prisma.character.findUnique({
    where: { id: input.characterId },
  });
  if (!character) return null;
  const applied = applyForcedFailureToSheet(
    character,
    deps.ctx.cpred,
    { damage: input.damage },
    [],
  );
  const saved = await deps.ctx.prisma.character.update({
    where: { id: character.id },
    data: { data: applied.data },
  });
  await emitCharacterUpsert(deps, input.campaignId, toCharacterView(saved, deps.ctx.cpred));

  const entry: DamageLogEntry = {
    ...applied.log,
    targetTokenId: input.token.id,
    targetName: input.token.name,
    characterId: saved.id,
    targetOwnerId: saved.ownerId ?? input.token.ownerId,
    injuryNote: input.note,
  };
  const stored = await deps.ctx.prisma.chatMessage.create({
    data: {
      campaignId: input.campaignId,
      authorId: input.user.id,
      kind: 'damage',
      text: `${input.token.name} — Sieć`,
      payload: JSON.stringify(entry),
    },
    include: INCLUDE_CHAT_NAMES,
  });
  const view = toChatMessageView(stored);
  await broadcastRedactedChatMessage(deps, input.campaignId, view);
  return view;
}

/** Sets the figure alight — the same sticker and the same 2 points as 16h. */
async function igniteFigure(deps: RealtimeDeps, tokenId: string): Promise<boolean> {
  const token = await deps.ctx.prisma.token.findUnique({ where: { id: tokenId } });
  if (!token) return false;
  let statuses: string[];
  try {
    const parsed: unknown = JSON.parse(token.statuses);
    statuses = Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    statuses = [];
  }
  if (statuses.includes(CPRED_ON_FIRE_STATUS_ID)) return false;
  await deps.ctx.prisma.token.update({
    where: { id: tokenId },
    data: { statuses: JSON.stringify([...statuses, CPRED_ON_FIRE_STATUS_ID]) },
  });
  return true;
}

/** „Niszczy jeden losowy Program zainstalowany na cyberdeku celu" (s. 205). */
async function destroyDeckProgram(
  deps: RealtimeDeps,
  characterId: string,
  rng: (sides: number) => number,
): Promise<{ rowId: string; name: string } | null> {
  const character = await deps.ctx.prisma.character.findUnique({ where: { id: characterId } });
  if (!character) return null;
  const data = parseCharacterData(character.data, deps.ctx.cpred);
  const deck = data.cyberdeck;
  if (!deck) return null;
  const rows = deck.installed
    .filter((row) => row.kind === 'program')
    .map((row) => ({
      id: row.id,
      name: row.name,
      ...(row.program ? { profile: row.program } : {}),
    }));
  const victim = netRandomDeckProgram(rows, rng);
  if (!victim) return null;
  const next = {
    ...data,
    cyberdeck: { ...deck, installed: deck.installed.filter((row) => row.id !== victim.id) },
  };
  const saved = await deps.ctx.prisma.character.update({
    where: { id: character.id },
    data: { data: JSON.stringify(next) },
  });
  await emitCharacterUpsert(deps, saved.campaignId, toCharacterView(saved, deps.ctx.cpred));
  return { rowId: victim.id, name: victim.name };
}

// ─────────────────────── sprzątanie po runie ───────────────────────

/**
 * Takes a run's Black ICE out of the initiative queue.
 *
 * A run ends in four different places — a clean jack-out, an emergency one, the
 * GM deleting the socket, the figure dying — and a tracker row pointing at a
 * fight that no longer exists would sit there forever with a name and no Turn.
 * The `netRunId` column exists for exactly this sweep.
 */
export async function dropRunFromQueue(
  deps: RealtimeDeps,
  campaignId: string,
  runId: string,
): Promise<void> {
  const rows = await deps.ctx.prisma.combatant.findMany({
    where: { netRunId: runId },
    select: { id: true, combat: { select: { sceneId: true } } },
  });
  if (rows.length === 0) return;
  await deps.ctx.prisma.combatant.deleteMany({ where: { netRunId: runId } });
  const sceneIds = [...new Set(rows.map((row) => row.combat.sceneId))];
  for (const sceneId of sceneIds) {
    const scene = await deps.ctx.prisma.scene.findUnique({ where: { id: sceneId } });
    if (scene) await emitCombatOfScene(deps, campaignId, scene);
  }
}

// ─────────────────────── awaryjne odłączenie z rachunkiem ───────────────────────

/**
 * Tears a run down the hard way and charges for it.
 *
 * „Wyjście poza zasięg działania punktu dostępu bez uprzedniego odłączenia się
 * powoduje automatyczne (awaryjne) odłączenie" (s. 198), and an unsafe exit
 * means „odczuwa efekty wszystkich zrezowanych LOD-ów, które napotkał do tej
 * pory w tej Architekturze". Stage 26b wrote the list down for exactly this;
 * 26c is what finally hands over the bill.
 */
export async function emergencyJackOut(
  deps: RealtimeDeps,
  input: {
    campaignId: string;
    user: SessionUser;
    runId: string;
    reason: string;
    round: number | null;
    /** The ICE that did the throwing pays nothing — „z wyjątkiem tego Olbrzyma". */
    except?: string;
    rng: (sides: number) => number;
  },
): Promise<{ tokenIds: string[] }> {
  const row = await deps.ctx.prisma.netRun.findUnique({
    where: { id: input.runId },
    include: { token: { include: { character: { select: { name: true } } } } },
  });
  if (!row) return { tokenIds: [] };
  const state = readFullRun(row.data);
  const actorName = row.token.character?.name ?? row.token.name;
  const tokenIds: string[] = [];

  const bill = state ? netJackOutBill(state, input.except) : [];
  let carried = state;
  const lines: string[] = [];
  for (const ice of bill) {
    if (!carried) break;
    const outcome = await applyIceEffect(deps, {
      campaignId: input.campaignId,
      user: input.user,
      ice,
      state: carried,
      runId: row.id,
      characterId: row.characterId,
      token: row.token,
      round: input.round,
      rng: input.rng,
      duringJackOut: true,
    });
    carried = outcome.state;
    tokenIds.push(...outcome.tokenIds);
    lines.push(`${ice.name}: ${outcome.lines.join(' ')}`);
  }

  await deps.ctx.prisma.netRun.deleteMany({ where: { id: row.id } });
  await dropRunFromQueue(deps, input.campaignId, row.id);
  await logNetLine(
    deps,
    input.campaignId,
    input.user,
    actorName,
    'Awaryjne odłączenie',
    bill.length === 0
      ? input.reason
      : `${input.reason} · rachunek za ${bill.length}: ${lines.join(' · ')}`,
  );
  await emitRuns(deps, input.campaignId);
  return { tokenIds: [...new Set(tokenIds)] };
}

/**
 * Called after every drop of every figure: has this one just walked out on its
 * own run? Lives here rather than beside the rest of the run's reading side
 * because the answer now costs hit points, and that is this module's business.
 *
 * Returns the figures whose rows changed, for the token layer to emit.
 */
export async function enforceNetRunRange(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  token: Pick<Token, 'id' | 'x' | 'y' | 'size'>,
  user: SessionUser,
  rng: (sides: number) => number,
): Promise<{ ended: boolean; tokenIds: string[] }> {
  const run = await loadRunForToken(deps.ctx.prisma, token.id);
  if (!run || run.campaignId !== campaignId) return { ended: false, tokenIds: [] };
  const point = await deps.ctx.prisma.netAccessPoint.findUnique({
    where: { id: run.accessPointId },
  });
  // A socket the GM deleted mid-run is a socket that is no longer there.
  const verdict = point
    ? await netAccessVerdict(deps.ctx.prisma, scene, token, point)
    : ({ ok: false, reason: 'range' } as const);
  if (verdict.ok) return { ended: false, tokenIds: [] };

  const combat = await deps.ctx.prisma.combat.findUnique({
    where: { sceneId: scene.id },
    select: { round: true },
  });
  const { tokenIds } = await emergencyJackOut(deps, {
    campaignId,
    user,
    runId: run.id,
    reason:
      verdict.reason === 'wall'
        ? 'ściana odcięła połączenie z punktem dostępu'
        : `poza zasięgiem punktu dostępu (${NET_ACCESS_RANGE_M} m)`,
    round: combat && combat.round > 0 ? combat.round : null,
    rng,
  });
  return { ended: true, tokenIds };
}

/** Persists both halves of a run after an effect rewrote them. */
export async function saveFullRun(
  deps: RealtimeDeps,
  runId: string,
  state: FullRunState,
): Promise<void> {
  await saveRunState(deps.ctx.prisma, runId, state);
}
