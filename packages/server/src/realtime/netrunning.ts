import type {
  CpredNetArchitecture,
  NetArchitectureDeleteBroadcast,
  NetArchitectureGetPayload,
  NetArchitectureIdPayload,
  NetArchitectureListPayload,
  NetArchitectureRollPayload,
  NetArchitectureRollResult,
  NetArchitectureSavePayload,
  NetArchitectureSummary,
  NetArchitectureView,
  NetDifficulty,
} from '@vtt/shared';
import {
  NET_ARCHITECTURE_NAME_MAX,
  NET_BRANCHES_MAX,
  NET_FLOORS_MAX,
  ROLE_GM,
  generateNetArchitecture,
  isNetDifficulty,
  netFloorCount,
  netrunningDataOf,
  validateNetArchitecture,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import { createMixedRng } from './dice-rng.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { gmRoom } from './state.js';

/**
 * Biblioteka Architektur Sieciowych (etap 26a).
 *
 * Trzy rzeczy warto tu wiedzieć:
 *
 *  1. **Nic z tego nie opuszcza pokoju MG.** Architektura to komplet PT, Czarnych
 *     LOD-ów i notatek MG o tym, czym każde piętro steruje naprawdę — czyli
 *     dokładnie ta wiedza, po którą netrunner idzie. Zdarzenia lecą wyłącznie do
 *     `gmRoom`, tak jak baza wiedzy z 19b. Gracz zobaczy dopiero **run** (26b),
 *     złożony z pięter, które sam odkrył.
 *  2. **Kształt waliduje `shared`**, tą samą funkcją co edytor u klienta, więc
 *     obie strony odmawiają tego samego i tym samym zdaniem.
 *  3. **Losowanie nie zapisuje.** „Wylosuj" zwraca szkic, który MG poprawia
 *     i zapisuje osobno — rzut, który się nie spodobał, nie kosztuje nic.
 */

interface ArchitectureRow {
  id: string;
  name: string;
  difficulty: string;
  data: string;
  updatedAt: Date;
}

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

/**
 * A stored row read back. A row whose JSON no longer validates is *not* thrown
 * away — the GM would lose a build and never learn why. It comes back as an
 * empty shaft under its own name, which is visibly wrong and still editable.
 */
function toView(row: ArchitectureRow): NetArchitectureView {
  const difficulty: NetDifficulty = isNetDifficulty(row.difficulty) ? row.difficulty : 'standard';
  let architecture: CpredNetArchitecture = {
    id: row.id,
    name: row.name,
    difficulty,
    branches: [{ id: 'trunk', parentFloor: null, floors: [] }],
  };
  try {
    const parsed = validateNetArchitecture({ ...JSON.parse(row.data), id: row.id, name: row.name });
    if (parsed.ok) architecture = parsed.architecture;
  } catch {
    // Falls through to the empty shaft above.
  }
  return {
    id: row.id,
    name: row.name,
    difficulty,
    floors: netFloorCount(architecture),
    branches: architecture.branches.length,
    updatedAt: row.updatedAt.toISOString(),
    architecture,
    notes: architecture.notes ?? '',
  };
}

function toSummary(view: NetArchitectureView): NetArchitectureSummary {
  return {
    id: view.id,
    name: view.name,
    difficulty: view.difficulty,
    floors: view.floors,
    branches: view.branches,
    updatedAt: view.updatedAt,
  };
}

async function fetchArchitectures(
  prisma: PrismaClient,
  campaignId: string,
): Promise<NetArchitectureView[]> {
  const rows = await prisma.netArchitecture.findMany({
    where: { campaignId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, difficulty: true, data: true, updatedAt: true },
  });
  return rows.map(toView);
}

async function emitList(deps: RealtimeDeps, campaignId: string): Promise<void> {
  const architectures = (await fetchArchitectures(deps.ctx.prisma, campaignId)).map(toSummary);
  const payload: NetArchitectureListPayload = { architectures };
  deps.io.to(gmRoom(campaignId)).emit('net:architectures', payload);
}

export const netArchitectureListEvent = defineEvent<undefined, NetArchitectureListPayload>({
  name: 'net:list',
  role: ROLE_GM,
  handler: async ({ deps, socket }) => {
    const campaignId = requireCampaignId(socket.data);
    const architectures = (await fetchArchitectures(deps.ctx.prisma, campaignId)).map(toSummary);
    return { architectures };
  },
});

export const netArchitectureGetEvent = defineEvent<NetArchitectureGetPayload, NetArchitectureView>({
  name: 'net:get',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const id = payload?.id;
    if (typeof id !== 'string' || id.length === 0) throw new RealtimeError('BAD_REQUEST');
    const row = await deps.ctx.prisma.netArchitecture.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        difficulty: true,
        data: true,
        updatedAt: true,
        campaignId: true,
      },
    });
    if (!row || row.campaignId !== campaignId) throw new RealtimeError('ARCHITECTURE_NOT_FOUND');
    return toView(row);
  },
});

export const netArchitectureSaveEvent = defineEvent<
  NetArchitectureSavePayload,
  NetArchitectureView
>({
  name: 'net:save',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const result = validateNetArchitecture(payload?.architecture);
    if (!result.ok) {
      throw new RealtimeError(`INVALID_ARCHITECTURE:${result.issues[0]?.message ?? ''}`);
    }
    const architecture = result.architecture;

    const id = typeof payload?.id === 'string' && payload.id.length > 0 ? payload.id : null;
    if (id) {
      const existing = await deps.ctx.prisma.netArchitecture.findUnique({
        where: { id },
        select: { campaignId: true },
      });
      if (!existing || existing.campaignId !== campaignId) {
        throw new RealtimeError('ARCHITECTURE_NOT_FOUND');
      }
    }

    // The row's own id is the key sheets and runs will point at, so the
    // architecture's slug id (minted from the name) never overwrites it.
    const data = JSON.stringify({ ...architecture, id: undefined });
    const stored = id
      ? await deps.ctx.prisma.netArchitecture.update({
          where: { id },
          data: { name: architecture.name, difficulty: architecture.difficulty, data },
        })
      : await deps.ctx.prisma.netArchitecture.create({
          data: {
            campaignId,
            name: architecture.name,
            difficulty: architecture.difficulty,
            data,
          },
        });

    const view = toView(stored);
    await emitList(deps, campaignId);
    return view;
  },
});

export const netArchitectureDeleteEvent = defineEvent<NetArchitectureIdPayload, void>({
  name: 'net:delete',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const id = payload?.id;
    if (typeof id !== 'string' || id.length === 0) throw new RealtimeError('BAD_REQUEST');
    const removed = await deps.ctx.prisma.netArchitecture.deleteMany({ where: { campaignId, id } });
    if (removed.count === 0) throw new RealtimeError('ARCHITECTURE_NOT_FOUND');

    const broadcast: NetArchitectureDeleteBroadcast = { id };
    deps.io.to(gmRoom(campaignId)).emit('net:deleted', broadcast);
    await emitList(deps, campaignId);
  },
});

/** „Wylosuj architekturę" — kroki 1 i 2 z s. 210, rzucane na serwerze. */
export const netArchitectureRollEvent = defineEvent<
  NetArchitectureRollPayload,
  NetArchitectureRollResult
>({
  name: 'net:roll',
  role: ROLE_GM,
  handler: ({ deps, socket, payload }) => {
    requireCampaignId(socket.data);
    const data = netrunningDataOf(deps.ctx.cpred);
    if (data.contentTable.length === 0) throw new RealtimeError('NET_DATA_MISSING');

    const name =
      typeof payload?.name === 'string' && payload.name.trim().length > 0
        ? payload.name.trim().slice(0, NET_ARCHITECTURE_NAME_MAX)
        : 'Nowa architektura';
    const difficulty: NetDifficulty = isNetDifficulty(payload?.difficulty)
      ? payload.difficulty
      : 'standard';

    const floors = clampOption(payload?.floors, 1, NET_FLOORS_MAX);
    const branches = clampOption(payload?.branches, 0, NET_BRANCHES_MAX);
    const rolled = generateNetArchitecture(createMixedRng(), data, {
      name,
      difficulty,
      ...(floors !== undefined ? { floors } : {}),
      ...(branches !== undefined ? { branches } : {}),
    });

    const parts = [
      rolled.trace.floorsRolled
        ? `pięter 3k6 = ${rolled.trace.floors}`
        : `pięter ${rolled.trace.floors} (bez rzutu)`,
      rolled.trace.branchesRolled
        ? `odgałęzień 1k10: ${rolled.trace.branches}`
        : `odgałęzień ${rolled.trace.branches} (bez rzutu)`,
    ];
    return { architecture: rolled.architecture, summary: parts.join(' · ') };
  },
});

function clampOption(raw: unknown, min: number, max: number): number | undefined {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return undefined;
  return Math.max(min, Math.min(max, raw));
}
