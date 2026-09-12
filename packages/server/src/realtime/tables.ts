import type {
  ChatMessageView,
  RandomTableDeleteBroadcast,
  RandomTableIdPayload,
  RandomTableListPayload,
  RandomTableRollEntry,
  RandomTableRollPayload,
  RandomTableShowPayload,
  RandomTableSource,
  RandomTableUpsertBroadcast,
  RandomTableUpsertPayload,
  RandomTableView,
  RandomTableVisibility,
  RollGesture,
  SessionUser,
} from '@vtt/shared';
import {
  RANDOM_TABLE_VISIBILITIES,
  ROLE_GM,
  randomTableNestingIssue,
  rollRandomTable,
  validateRandomTable,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import { createMixedRng } from './dice-rng.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import {
  INCLUDE_CHAT_NAMES,
  broadcastChatMessage,
  deliverChatMessageTo,
  insertChatMessage,
  toChatMessageView,
} from './chat-io.js';
import { gmRoom } from './state.js';

/**
 * Tabele losowe (etap 34).
 *
 * Rozstrzygnięcie, od którego zależy cały moduł: **losowanie z tabeli nie
 * dotyka kubka.** `rollStore` u klienta ma jeden slot naraz i każdy `load…Cup`
 * rozsypuje przed sobą pozostałe, więc gdyby „Losuj" ładowało kubek, MG
 * straciłby wzięty do ręki rzut Percepcji NPC-a, a graczowi zdmuchnęłoby
 * czekające wezwanie do Testu z etapu 32. Dlatego tabela jest **rzutem
 * serwera**, dokładnie jak `/r 1d10` wysłane Enterem: wynik wpada na czat
 * i nie zajmuje żadnego slotu.
 *
 * Dwie rzeczy, które łatwo tu zepsuć:
 *
 *  1. **Rzut idzie z `checkRule: false`** (w `rollRandomTable`). `1d10` jest
 *     formułą Testu w rozumieniu etapu 06 — bez tej flagi dziesiątka
 *     eksplodowałaby dorzutem i tabela dziesięciowierszowa dawałaby 11.
 *  2. **Widoczność rozstrzyga rodzaj wiersza czatu, nie pole w payloadzie.**
 *     `visibleTo` w `chat-io.ts` jest białą listą rodzajów w zapytaniu do bazy,
 *     więc jawny wynik to `rolltable`, a cichy — `gmrolltable`. „Pokaż stołowi"
 *     **dokłada** publiczny wiersz zamiast odsłaniać stary, bo wiersz raz
 *     zapisany jako `gmrolltable` nigdy nie wejdzie graczowi do historii.
 */

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

interface TableRowRecord {
  id: string;
  min: number;
  max: number;
  text: string;
  subTableId: string | null;
  position: number;
}

interface TableRecord {
  id: string;
  name: string;
  formula: string;
  description: string;
  visibility: string;
  updatedAt: Date;
  rows: TableRowRecord[];
}

const TABLE_INCLUDE = { rows: { orderBy: { position: 'asc' } } } as const;

function toVisibility(raw: string): RandomTableVisibility {
  return (RANDOM_TABLE_VISIBILITIES as readonly string[]).includes(raw)
    ? (raw as RandomTableVisibility)
    : 'gm';
}

function toTableView(row: TableRecord, names: Map<string, string>): RandomTableView {
  return {
    id: row.id,
    name: row.name,
    formula: row.formula,
    description: row.description,
    visibility: toVisibility(row.visibility),
    updatedAt: row.updatedAt.toISOString(),
    rows: row.rows.map((entry) => {
      const view: RandomTableView['rows'][number] = {
        id: entry.id,
        min: entry.min,
        max: entry.max,
        text: entry.text,
        subTableId: entry.subTableId,
      };
      const subName = entry.subTableId ? names.get(entry.subTableId) : undefined;
      if (subName !== undefined) view.subTableName = subName;
      return view;
    }),
  };
}

async function fetchTables(prisma: PrismaClient, campaignId: string): Promise<TableRecord[]> {
  return prisma.randomTable.findMany({
    where: { campaignId },
    include: TABLE_INCLUDE,
    orderBy: { name: 'asc' },
  });
}

function nameIndex(rows: TableRecord[]): Map<string, string> {
  return new Map(rows.map((row) => [row.id, row.name]));
}

export async function fetchRandomTables(
  prisma: PrismaClient,
  campaignId: string,
): Promise<RandomTableView[]> {
  const rows = await fetchTables(prisma, campaignId);
  const names = nameIndex(rows);
  return rows.map((row) => toTableView(row, names));
}

/**
 * Tabela po nazwie, bez oglądania się na wielkość liter — `/tab spotkania`
 * ma trafić w „Spotkania dzienne". Porównanie idzie w JS, nie w SQL-u: SQLite
 * porównuje `LIKE` bez ogonków tylko dla ASCII, a nazwy są polskie.
 */
export async function findRandomTableByName(
  prisma: PrismaClient,
  campaignId: string,
  name: string,
): Promise<{ id: string; name: string; visibility: RandomTableVisibility } | null> {
  const wanted = name.trim().toLowerCase();
  if (wanted.length === 0) return null;
  const rows = await prisma.randomTable.findMany({
    where: { campaignId },
    select: { id: true, name: true, visibility: true },
  });
  const exact = rows.find((row) => row.name.toLowerCase() === wanted);
  const match = exact ?? rows.find((row) => row.name.toLowerCase().startsWith(wanted));
  if (!match) return null;
  return { id: match.id, name: match.name, visibility: toVisibility(match.visibility) };
}

/**
 * Losuje i zapisuje kartę czatu. Wołane z dwóch stron — przycisku „Losuj"
 * w panelu i `/tab <nazwa>` w polu czatu — bo obie drogi mają dać dokładnie
 * ten sam wynik (kryterium ukończenia etapu).
 */
export async function rollTableToChat(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  sceneId: string | null,
  tableId: string,
  visibility: RandomTableVisibility | undefined,
  gesture: RollGesture | undefined,
): Promise<ChatMessageView> {
  const rows = await fetchTables(deps.ctx.prisma, campaignId);
  const table = rows.find((row) => row.id === tableId);
  if (!table) throw new RealtimeError('TABLE_NOT_FOUND');

  const sources = new Map<string, RandomTableSource>(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        formula: row.formula,
        rows: row.rows.map((entry) => ({
          min: entry.min,
          max: entry.max,
          text: entry.text,
          subTableId: entry.subTableId,
        })),
      },
    ]),
  );

  const steps = rollRandomTable(sources, table.id, createMixedRng(gesture?.entropy));
  if (steps.length === 0) throw new RealtimeError('TABLE_EMPTY');
  // Gest kubka zdobi wyłącznie pierwszy rzut: to on tumbla na ekranie, a dwa
  // podrzuty z jednego potrząśnięcia to dwie animacje z jednej ręki.
  const first = steps[0]!;
  if (gesture && gesture.strength > 0) first.roll.tossStrength = gesture.strength;
  if (gesture?.toss) first.roll.toss = gesture.toss;

  const entry: RandomTableRollEntry = {
    steps,
    tableId: table.id,
    tableName: table.name,
  };
  const chosen = visibility ?? toVisibility(table.visibility);
  const message = await insertChatMessage(deps.ctx.prisma, {
    campaignId,
    authorId: user.id,
    kind: chosen === 'public' ? 'rolltable' : 'gmrolltable',
    text: table.name,
    payload: JSON.stringify(entry),
    sceneId,
  });
  if (chosen === 'public') {
    broadcastChatMessage(deps, campaignId, message);
  } else {
    // Wzorem `gmroll`: autor plus wszyscy MG, bez seq — to nie jest
    // rozgłoszenie do pokoju, więc nie wolno mu zrobić luki w numeracji.
    await deliverChatMessageTo(deps, campaignId, message, [user.id], true);
  }
  return message;
}

export const tableListEvent = defineEvent<undefined, RandomTableListPayload>({
  name: 'table:list',
  role: ROLE_GM,
  handler: async ({ deps, socket }) => {
    const campaignId = requireCampaignId(socket.data);
    return { tables: await fetchRandomTables(deps.ctx.prisma, campaignId) };
  },
});

export const tableUpsertEvent = defineEvent<RandomTableUpsertPayload, RandomTableView>({
  name: 'table:upsert',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const result = validateRandomTable(payload);
    if (!result.ok) throw new RealtimeError(`INVALID_TABLE:${result.issues[0]?.message ?? ''}`);
    const data = result.table;

    const existing = await fetchTables(deps.ctx.prisma, campaignId);
    const id = typeof payload?.id === 'string' && payload.id.length > 0 ? payload.id : null;
    if (id && !existing.some((row) => row.id === id)) throw new RealtimeError('TABLE_NOT_FOUND');

    const clash = existing.find(
      (row) => row.id !== id && row.name.toLowerCase() === data.name.toLowerCase(),
    );
    if (clash) {
      // Nazwa jest adresem: `/tab <nazwa>` musi trafiać w jedną tabelę.
      throw new RealtimeError(`INVALID_TABLE:Tabela „${clash.name}" już istnieje.`);
    }

    const subIds = data.rows
      .map((row) => row.subTableId)
      .filter((value): value is string => typeof value === 'string');
    const known = new Set(existing.map((row) => row.id));
    for (const subId of subIds) {
      if (!known.has(subId)) throw new RealtimeError('SUBTABLE_NOT_FOUND');
    }

    // Graf sprawdza się na całej kampanii, z tą tabelą już podmienioną: nowy
    // podrzut potrafi przekroczyć limit tabeli, której nikt w tej chwili nie
    // edytuje (patrz `randomTableNestingIssue`).
    const candidateId = id ?? '__new__';
    const links = existing
      .filter((row) => row.id !== id)
      .map((row) => ({
        id: row.id,
        name: row.name,
        subIds: row.rows
          .map((entry) => entry.subTableId)
          .filter((value): value is string => value !== null),
      }));
    links.push({ id: candidateId, name: data.name, subIds });
    const nesting = randomTableNestingIssue(links);
    if (nesting) throw new RealtimeError(`INVALID_TABLE:${nesting}`);

    const stored = await deps.ctx.prisma.$transaction(async (tx) => {
      const table = id
        ? await tx.randomTable.update({
            where: { id },
            data: {
              name: data.name,
              formula: data.formula,
              description: data.description,
              visibility: data.visibility,
            },
          })
        : await tx.randomTable.create({
            data: {
              campaignId,
              name: data.name,
              formula: data.formula,
              description: data.description,
              visibility: data.visibility,
            },
          });
      // Wiersze przepisujemy w całości: zakresy są zbiorem, nie listą do
      // scalania, a próba dopasowania starych do nowych po id zostawiałaby
      // sieroty przy każdym przenumerowaniu tabeli.
      await tx.randomTableRow.deleteMany({ where: { tableId: table.id } });
      await tx.randomTableRow.createMany({
        data: data.rows.map((row, index) => ({
          tableId: table.id,
          min: row.min,
          max: row.max,
          text: row.text,
          subTableId: row.subTableId ?? null,
          position: index,
        })),
      });
      return tx.randomTable.findUniqueOrThrow({
        where: { id: table.id },
        include: TABLE_INCLUDE,
      });
    });

    const refreshed = await fetchTables(deps.ctx.prisma, campaignId);
    const view = toTableView(stored, nameIndex(refreshed));
    const broadcast: RandomTableUpsertBroadcast = { table: view };
    deps.io.to(gmRoom(campaignId)).emit('table:upsert', broadcast);
    return view;
  },
});

export const tableDeleteEvent = defineEvent<RandomTableIdPayload, void>({
  name: 'table:delete',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const id = payload?.id;
    if (typeof id !== 'string' || id.length === 0) throw new RealtimeError('BAD_REQUEST');
    const removed = await deps.ctx.prisma.randomTable.deleteMany({ where: { campaignId, id } });
    if (removed.count === 0) throw new RealtimeError('TABLE_NOT_FOUND');

    // Wiersze, które na nią wskazywały, tracą podrzut (`SetNull` w schemacie),
    // więc panel musi zobaczyć je od nowa — stąd pełna lista, nie samo id.
    const broadcast: RandomTableDeleteBroadcast = { id };
    deps.io.to(gmRoom(campaignId)).emit('table:delete', broadcast);
    for (const table of await fetchRandomTables(deps.ctx.prisma, campaignId)) {
      deps.io.to(gmRoom(campaignId)).emit('table:upsert', { table } as RandomTableUpsertBroadcast);
    }
  },
});

export const tableRollEvent = defineEvent<RandomTableRollPayload, void>({
  name: 'table:roll',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const id = payload?.id;
    if (typeof id !== 'string' || id.length === 0) throw new RealtimeError('BAD_REQUEST');
    const visibility = (RANDOM_TABLE_VISIBILITIES as readonly string[]).includes(
      payload?.visibility as string,
    )
      ? (payload.visibility as RandomTableVisibility)
      : undefined;
    await rollTableToChat(
      deps,
      campaignId,
      user,
      socket.data.viewedSceneId ?? null,
      id,
      visibility,
      undefined,
    );
  },
});

export const tableShowEvent = defineEvent<RandomTableShowPayload, void>({
  name: 'table:show',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const messageId = payload?.messageId;
    if (typeof messageId !== 'number' || !Number.isInteger(messageId)) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const stored = await deps.ctx.prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: INCLUDE_CHAT_NAMES,
    });
    if (!stored || stored.campaignId !== campaignId || stored.kind !== 'gmrolltable') {
      throw new RealtimeError('MESSAGE_NOT_FOUND');
    }
    // Treść bierze się z **zapisanej karty**, nie z żądania — ta sama umowa,
    // co obrażenia po ataku (16) i wezwanie do Testu (32): klient nie ma jak
    // podmienić tego, co stół zaraz zobaczy.
    const entry = JSON.parse(stored.payload ?? '{}') as RandomTableRollEntry;
    if (!Array.isArray(entry.steps) || entry.steps.length === 0) {
      throw new RealtimeError('MESSAGE_NOT_FOUND');
    }
    if (entry.shown) throw new RealtimeError('ALREADY_SHOWN');

    const publicEntry: RandomTableRollEntry = {
      steps: entry.steps,
      tableId: entry.tableId,
      tableName: entry.tableName,
    };
    const message = await insertChatMessage(deps.ctx.prisma, {
      campaignId,
      authorId: user.id,
      kind: 'rolltable',
      text: stored.text,
      payload: JSON.stringify(publicEntry),
      sceneId: stored.sceneId,
    });
    broadcastChatMessage(deps, campaignId, message);

    const updated = await deps.ctx.prisma.chatMessage.update({
      where: { id: messageId },
      data: { payload: JSON.stringify({ ...entry, shown: true }) },
      include: INCLUDE_CHAT_NAMES,
    });
    await deliverChatMessageTo(
      deps,
      campaignId,
      toChatMessageView(updated),
      [stored.authorId],
      true,
      'chat:update',
    );
  },
});
