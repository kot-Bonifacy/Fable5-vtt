import type { CombatSightingView } from '@vtt/shared';
import { readNetRuntime } from '@vtt/shared';
import type { Scene } from '../generated/prisma/client.js';
import type { RealtimeDeps } from './registry.js';
import {
  emitCombatOfScene,
  emitReloaded,
  foundEncounter,
  loadCombat,
  readCombatSighting,
  renumberOrder,
  loadCombatById,
  type CombatRow,
} from './combat.js';
import { encounterCanStart, haltPartyMarches } from './foe-sighting.js';
import { loadRun } from './netcombat.js';
import { saveRunState } from './netrun-io.js';

/**
 * Wykrycie w Sieci zaczyna walkę (decyzja MG z 14.11).
 *
 * Netrunner, którego wykrył Czarny LOD albo którego zaczął ścigać Demon, i ten,
 * któremu ostatecznie nie udało się Maskowanie, zakłada starcie tak samo jak
 * drużyna, która zobaczyła wroga (etap 56): runda 0 „Przed walką”, drużyna
 * staje, MG dostaje pasek „⚔ Rozpocznij walkę / Odwołaj” — z tekstem o Sieci
 * (`CombatSightingView.net`). W starciu jest drużyna i LOD albo Demon, który
 * wykrył; nieudane Maskowanie nie dokłada nikogo (MG dokłada ręką).
 *
 * W trwającej walce LOD i Demon wchodzą do kolejki jak dotąd — na czoło
 * (`pushNetFoeIntoQueue`, s. 205). LOD-y dołożone w rundzie 0 dostają czoło
 * kolejki dopiero przy „Rozpocznij walkę” (`liftNetFoesToTop`), bo wcześniej
 * nikt inny nie ma inicjatywy.
 *
 * Tylko na aktywnej scenie trwającej sesji, jak zauważenie: przygotowanie MG
 * niczego nie zakłada, a LOD wykryty poza nią poluje bez kolejki, jak przed
 * 14.11. Hamulec MG („Wstrzymaj obronę”, 70e) też wraca do stanu sprzed 14.11:
 * ręczne „LOD wykrywa intruza” dokłada LOD-a tylko do trwającej walki.
 */

/** LOD albo Demon, który ma stanąć w kolejce. */
export interface NetFightFoe {
  runId: string;
  foeId: string;
  label: string;
}

/**
 * Wciąga wykrytego netrunnera do walki. Zwraca id wierszy kolejki po id
 * Programu (`combatantId` LOD-u i Demona) — pusta mapa, gdy nie ma walki.
 *
 * `queue: false` — wykrywający nie staje w kolejce (darmowy atak wyrzucił
 * netrunnera z Sieci, run się kończy), ale jego nazwa idzie do paska MG.
 */
export async function bringNetIntoFight(
  deps: RealtimeDeps,
  input: {
    campaignId: string;
    scene: Scene;
    runnerTokenId: string;
    foes: readonly NetFightFoe[];
    traces?: boolean;
    queue?: boolean;
    /** Hamulec MG na tej Architekturze — wtedy jak przed 14.11: tylko kolejka. */
    paused: boolean;
  },
): Promise<Map<string, string>> {
  const { campaignId, scene, runnerTokenId } = input;
  const prisma = deps.ctx.prisma;
  const names = input.foes.map((foe) => foe.label);
  const traces = input.traces === true;
  let combat = await loadCombat(prisma, scene.id);

  if (input.paused) {
    if (!combat || input.queue === false) return new Map();
  } else if (!combat) {
    if (!(await encounterCanStart(deps, campaignId, scene))) return new Map();
    const sighting: CombatSightingView = {
      spotterIds: [runnerTokenId],
      foeIds: [],
      net: { foes: names, traces },
    };
    try {
      await foundEncounter(prisma, scene.id, [runnerTokenId], sighting);
    } catch (error) {
      // Równoległe zauważenie zdążyło założyć starcie — dołączamy do niego.
      deps.log.warn({ err: error, sceneId: scene.id }, 'net encounter: founding raced');
    }
    combat = await loadCombat(prisma, scene.id);
    if (!combat) return new Map();
    await haltPartyMarches(deps, campaignId, scene);
  } else {
    await joinRunner(deps, combat, runnerTokenId);
    if (combat.round === 0) {
      await noteNetSighting(deps, combat, runnerTokenId, names, traces);
      await haltPartyMarches(deps, campaignId, scene);
    }
  }

  const seats = new Map<string, string>();
  if (input.queue !== false) {
    for (const foe of input.foes) {
      const id = await pushNetFoeIntoQueue(deps, campaignId, scene, foe);
      if (id) seats.set(foe.foeId, id);
    }
  }
  await emitReloaded(deps, campaignId, scene, combat.id);
  return seats;
}

/**
 * Maskowanie ostatecznie nieudane na `floorIds` (ostatnia próba Tury albo
 * zejście z piętra w połowie prób): ślady zostały, Sieć wie o intruzie.
 * W starciu staje drużyna i to, co już ściga netrunnera na tych piętrach
 * (strażnik piętra) — nikogo nie budzi (decyzja MG z 14.11: „tylko drużyna”).
 * Z hamulcem MG („Wstrzymaj obronę”) nic się nie dzieje, jak przy wykryciu.
 */
export async function raiseTracesAlarm(
  deps: RealtimeDeps,
  input: { campaignId: string; runId: string; floorIds: readonly string[] },
): Promise<void> {
  if (input.floorIds.length === 0) return;
  const run = await loadRun(deps, input.campaignId, input.runId);
  if (!run) return;
  // Hamulec MG (70e) wstrzymuje każdą samodzielną odpowiedź obrony — także tę.
  if (netDefensePausedOf(run.row.architecture.runtime)) return;
  const floors = new Set(input.floorIds);
  const { state, row } = run;
  const foes: NetFightFoe[] = [
    ...state.ice
      .filter((ice) => floors.has(ice.floorId) && ice.mode === 'hunting' && ice.detected)
      .map((ice) => ({ runId: row.id, foeId: ice.id, label: ice.name })),
    ...state.demons
      .filter((demon) => floors.has(demon.floorId) && demon.mode === 'hunting')
      .map((demon) => ({ runId: row.id, foeId: demon.id, label: demon.name })),
  ];
  const seats = await bringNetIntoFight(deps, {
    campaignId: input.campaignId,
    scene: run.scene,
    runnerTokenId: row.tokenId,
    foes,
    traces: true,
    paused: false,
  });
  if (seats.size === 0) return;
  await saveRunState(deps.ctx.prisma, row.id, {
    ...state,
    ice: state.ice.map((ice) => {
      const combatantId = seats.get(ice.id);
      return combatantId ? { ...ice, combatantId } : ice;
    }),
    demons: state.demons.map((demon) => {
      const combatantId = seats.get(demon.id);
      return combatantId ? { ...demon, combatantId } : demon;
    }),
  });
}

/** Czy MG trzyma hamulec obrony tej Architektury (`CpredNetRuntime.defensePaused`). */
export function netDefensePausedOf(runtime: string | null): boolean {
  return readNetRuntime(runtime).defensePaused === true;
}

/** Netrunner, którego nie było w walce, wchodzi do niej — gracz rzuci kubkiem. */
async function joinRunner(deps: RealtimeDeps, combat: CombatRow, tokenId: string): Promise<void> {
  if (combat.combatants.some((row) => row.tokenId === tokenId)) return;
  await deps.ctx.prisma.combatant.create({
    data: { combatId: combat.id, tokenId, order: combat.combatants.length },
  });
}

/** Starcie jeszcze czeka: pasek MG rośnie o wykrycie w Sieci. */
async function noteNetSighting(
  deps: RealtimeDeps,
  combat: CombatRow,
  runnerTokenId: string,
  names: readonly string[],
  traces: boolean,
): Promise<void> {
  const before = readCombatSighting(combat.sighting);
  const sighting: CombatSightingView = {
    ...(before ?? { foeIds: [] }),
    spotterIds: [...new Set([...(before?.spotterIds ?? []), runnerTokenId])],
    net: {
      foes: [...new Set([...(before?.net?.foes ?? []), ...names])],
      traces: before?.net?.traces === true || traces,
    },
  };
  await deps.ctx.prisma.combat.update({
    where: { id: combat.id },
    data: { sighting: JSON.stringify(sighting) },
  });
}

/**
 * A Black ICE (stage 26c) or a Demon (26e) that noticed the netrunner takes
 * the head of the queue: „LOD zajmuje pierwsze miejsce w Kolejce Inicjatywy,
 * o jeden punkt wyżej niż Netrunner lub Program, który do tej pory zajmował to
 * miejsce" (s. 205). The row has no figure — only `netRunId` and `netIceId`.
 *
 * Stage 26e sends Demons through the same door, so `netIceId` carries the id of
 * either. No combat on the scene — no row (`bringNetIntoFight` founds one).
 */
export async function pushNetFoeIntoQueue(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  input: NetFightFoe,
): Promise<string | null> {
  const combat = await loadCombat(deps.ctx.prisma, scene.id);
  if (!combat) return null;
  const existing = combat.combatants.find((entry) => entry.netIceId === input.foeId);
  if (existing) return existing.id;
  const top = combat.combatants.reduce((best, entry) => Math.max(best, entry.initiative ?? 0), 0);
  const created = await deps.ctx.prisma.combatant.create({
    data: {
      combatId: combat.id,
      label: input.label,
      netRunId: input.runId,
      netIceId: input.foeId,
      initiative: top + 1,
      order: -1,
    },
  });
  await emitCombatOfScene(deps, campaignId, scene);
  return created.id;
}

/**
 * „Rozpocznij walkę” ze starcia, do którego Sieć dołożyła LOD-y w rundzie 0:
 * inicjatywa reszty dopiero co padła, więc LOD-y i Demony idą teraz na czoło
 * kolejki, w kolejności, w jakiej stały między sobą (s. 205: „LOD wchodzi do
 * walki na pierwszym miejscu Kolejki Inicjatywy, nawet jeśli byłeś szybszy”).
 * Zwraca, czy coś się zmieniło.
 */
export async function liftNetFoesToTop(deps: RealtimeDeps, combat: CombatRow): Promise<boolean> {
  const net = combat.combatants
    .filter((row) => row.tokenId === null && row.netIceId !== null)
    .sort((a, b) => (a.initiative ?? 0) - (b.initiative ?? 0));
  if (net.length === 0) return false;
  const top = combat.combatants
    .filter((row) => !net.includes(row))
    .reduce((best, row) => Math.max(best, row.initiative ?? 0), 0);
  for (const [index, row] of net.entries()) {
    await deps.ctx.prisma.combatant.update({
      where: { id: row.id },
      data: { initiative: top + 1 + index },
    });
  }
  await renumberOrder(deps.ctx.prisma, await loadCombatById(deps.ctx.prisma, combat.id));
  return true;
}
