import { randomBytes } from 'node:crypto';
import type { ArchiveFile, CpredRegistry } from '@vtt/shared';
import { archiveRefusal, parseCharacterData } from '@vtt/shared';
import type { PrismaClient } from './db.js';
import type { Prisma } from './generated/prisma/client.js';
import {
  asRows,
  bool,
  insertScene,
  knownPlayers,
  maybeNum,
  maybeStr,
  num,
  str,
  stringifyJsonColumn,
  type CampaignArchive,
  type CharacterLedgerRow,
  type ImportRefusal,
} from './archive.js';

/**
 * Wczytanie zrzutu kampanii jako **nowej** kampanii (etap 57a, decyzja MG 2).
 *
 * **Mapa id najpierw, zapis potem.** Każdy wiersz z pliku dostaje nowe id,
 * zanim cokolwiek trafi do bazy (`newRowId`), więc figura od razu wskazuje
 * nową kartę, bot nową scenę, strefa nową figurę, a sklep nową kartę
 * handlarza. Klucze obce przepisuje się wprost; id **w środku** kolumn JSON
 * (karta, `statusData`, architektura Sieci, wiersze sklepu, strefy…) przepisuje
 * jedno głębokie przejście `remap`: napis równy staremu id dostaje nowe, a cuid
 * wewnątrz tekstu — też. Jedyne id liczbowe w JSON-ie to `wallId` drzwi Sieci;
 * te ściany wchodzą pojedynczo, żeby ich nowe id było znane przed architekturą.
 *
 * **Wszystko w jednej transakcji.** Plik, który wywróci się na piątej tabeli,
 * nie zostawia pół kampanii. Grafiki kopiuje wołający przed transakcją (do
 * katalogu kampanii o id z góry) i sprząta je, gdy transakcja padnie.
 *
 * **Czego nie wczytuje** (poza tym, czego plik nie niesie — `CAMPAIGN_ARCHIVE_OMITTED`):
 * czatu (autorzy to konta innej kampanii, a karty czatu wskazują figury sprzed
 * wczytania — log zostaje w pliku do przeczytania), trwającej walki i przebiegów
 * w Sieci (stan chwili, jak w etapie 33), członków (wczytana kampania zaprasza
 * od nowa). Karta gracza wchodzi jako „czeka na gracza” (decyzja MG 3).
 */

/** Id w kształcie cuid (jak `@default(cuid())`), żeby nowy wiersz nie odstawał od reszty. */
export function newRowId(): string {
  const bytes = randomBytes(24);
  let id = 'c';
  for (const byte of bytes) id += (byte % 36).toString(36);
  return id;
}

/** Cuid w tekście (markdown, JSON w kolumnie tekstowej) — kandydat do przepisania. */
const EMBEDDED_ID = /\bc[a-z0-9]{24}\b/g;

/** Głębokie przepisanie id: napis równy id, cuid w tekście, `wallId` liczbowy. */
export function makeRemap(
  ids: Map<string, string>,
  walls: Map<number, number | null> = new Map(),
): (value: unknown) => unknown {
  const remap = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const exact = ids.get(value);
      if (exact !== undefined) return exact;
      const trimmed = value.trimStart();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        // Kolumna JSON zapisana w zrzucie tekstem (`data` bota, wiersze sklepu…).
        try {
          return JSON.stringify(remap(JSON.parse(value) as unknown));
        } catch {
          // Markdown zaczynający się od „[” — to nie JSON, idzie jak tekst.
        }
      }
      return value.replace(EMBEDDED_ID, (id) => ids.get(id) ?? id);
    }
    if (Array.isArray(value)) return value.map(remap);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, inner]) => [
          key,
          key === 'wallId' && typeof inner === 'number' && walls.has(inner)
            ? (walls.get(inner) ?? undefined)
            : remap(inner),
        ]),
      );
    }
    return value;
  };
  return remap;
}

/** Numery ścian, na które wskazują drzwi w architekturach (`wallId`). */
function referencedWallIds(architectures: Record<string, unknown>[]): Set<number> {
  const found = new Set<number>();
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      if (value.includes('wallId')) {
        try {
          walk(JSON.parse(value) as unknown);
        } catch {
          // nie JSON — nie ma tu drzwi
        }
      }
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') {
      for (const [key, inner] of Object.entries(value)) {
        if (key === 'wallId' && typeof inner === 'number') found.add(inner);
        else walk(inner);
      }
    }
  };
  architectures.forEach(walk);
  return found;
}

const jsonText = (value: unknown, fallback: string): string => stringifyJsonColumn(value, fallback);
const date = (value: unknown): Date | undefined => {
  if (typeof value !== 'string') return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

export interface CampaignImportOptions {
  /** Id nowej kampanii — nadany z góry, bo pod nim leżą już skopiowane grafiki. */
  campaignId: string;
  gmId: string;
  name: string;
}

export interface CampaignImportSummary {
  id: string;
  name: string;
  /** Karty, które czekają na gracza (imiona z pliku). */
  pendingPlayers: string[];
  /** Ile odnośników przepadło, bo w pliku nie było ich drugiego końca. */
  droppedBindings: number;
}

type Tx = Prisma.TransactionClient;

/**
 * Wczytaj zrzut kampanii (po przepisaniu adresów grafik) jako nową kampanię
 * tego MG. Nowa kampania nie zostaje otwarta — pojawia się na liście.
 */
export async function importCampaign(
  prisma: PrismaClient,
  registry: CpredRegistry,
  file: unknown,
  options: CampaignImportOptions,
): Promise<CampaignImportSummary | ImportRefusal> {
  const refusal = archiveRefusal(file, 'campaign');
  if (refusal) return { code: refusal };
  const payload = (file as ArchiveFile<Partial<CampaignArchive>>).payload;
  if (!payload || typeof payload !== 'object') return { code: 'ARCHIVE_MALFORMED' };
  const name = options.name.trim();
  if (!name) return { code: 'ARCHIVE_EMPTY' };

  const characters = asRows(payload.characters);
  const scenes = asRows(payload.scenes);
  const bots = asRows(payload.bots);
  const compendium = asRows(payload.compendium);
  const knowledge = asRows(payload.knowledge);
  const journal = asRows(payload.journal);
  const handouts = asRows(payload.handouts);
  const handoutShares = asRows(payload.handoutShares);
  const journalHandouts = asRows(payload.journalHandouts);
  const relations = asRows(payload.relations);
  const architectures = asRows(payload.architectures);
  const tokenAssets = asRows(payload.tokenAssets);
  const portraitAssets = asRows(payload.portraitAssets);
  const merchants = asRows(payload.merchants);
  const randomTables = asRows(payload.randomTables);
  const users = new Map(
    asRows(payload.users).map((user) => [str(user.id), str(user.name, 'gracz')] as const),
  );

  // 1. Mapa id: każdy wiersz z id w pliku dostaje nowe, zanim cokolwiek wejdzie.
  const ids = new Map<string, string>();
  const claim = (value: unknown): void => {
    if (typeof value === 'string' && value && !ids.has(value)) ids.set(value, newRowId());
  };
  for (const row of characters) claim(row.id);
  for (const scene of scenes) {
    claim(scene.id);
    for (const token of asRows(scene.tokens)) claim(token.id);
  }
  for (const rows of [bots, compendium, knowledge, journal, handouts, architectures]) {
    for (const row of rows) claim(row.id);
  }
  for (const rows of [tokenAssets, portraitAssets, merchants, randomTables]) {
    for (const row of rows) claim(row.id);
  }
  for (const table of randomTables) for (const row of asRows(table.rows)) claim(row.id);
  // `null` — ściana jeszcze nie weszła; drzwi bez ściany w pliku tracą `wallId`.
  const walls = new Map<number, number | null>(
    [...referencedWallIds(architectures)].map((id) => [id, null] as const),
  );
  const remap = makeRemap(ids, walls);
  const mapped = (value: unknown): string | null =>
    typeof value === 'string' ? (ids.get(value) ?? null) : null;

  // Członkowie kampanii docelowej — nowej nie ma żadnych, ale ta sama droga
  // posłuży cofnięciu (57b), gdzie gracze zostają.
  const members = new Set(
    (
      await prisma.campaignMember.findMany({
        where: { campaignId: options.campaignId },
        select: { userId: true },
      })
    ).map((row) => row.userId),
  );
  const member = (value: unknown): string | null =>
    typeof value === 'string' && members.has(value) ? value : null;
  // Id konta przy czekającej karcie — tylko gracza tego MG (jak `resolveArchiveOwner`).
  const known = await knownPlayers(
    prisma,
    characters.flatMap((row) => {
      const pending = row.pendingOwner as { id?: unknown } | null;
      return [row.ownerId, pending?.id].filter((id): id is string => typeof id === 'string');
    }),
    options.gmId,
  );

  let droppedBindings = 0;
  const pendingPlayers: string[] = [];
  const source = (payload.campaign ?? {}) as Record<string, unknown>;

  await prisma.$transaction(
    async (tx: Tx) => {
      await tx.campaign.create({
        data: {
          id: options.campaignId,
          name,
          gmId: options.gmId,
          shopTier: num(source.shopTier, 1),
          shopTierOverrides: jsonText(remap(source.shopTierOverrides), '{}'),
          music: jsonText(source.music, '{}'),
          sandbox: bool(source.sandbox),
          gameTime: num(source.gameTime, 39447840),
          settledMonth: maybeStr(source.settledMonth),
          catalogShopping: jsonText(remap(source.catalogShopping), 'everywhere'),
        },
      });

      // 2. Karty — wzorzec podpina się po wstawieniu wszystkich (klucz do siebie).
      const templates: { id: string; templateId: string }[] = [];
      for (const row of characters) {
        const id = mapped(row.id) ?? newRowId();
        const ownerId = member(row.ownerId);
        const pendingSource = row.pendingOwner as { id?: unknown; name?: unknown } | null;
        let pending: { id: string | null; name: string } | null = null;
        if (!ownerId && typeof row.ownerId === 'string') {
          pending = { id: row.ownerId, name: users.get(row.ownerId) ?? 'gracz' };
        } else if (!ownerId && pendingSource && typeof pendingSource.name === 'string') {
          pending = { id: maybeStr(pendingSource.id), name: pendingSource.name };
        }
        if (pending?.id && !known.has(pending.id)) pending = { id: null, name: pending.name };
        const pendingMember = pending?.id ? member(pending.id) : null;
        if (pending && !pendingMember) pendingPlayers.push(pending.name);
        const owner = ownerId ?? pendingMember;
        const data = parseCharacterData(jsonText(remap(row.data), '{}'), registry);
        await tx.character.create({
          data: {
            id,
            campaignId: options.campaignId,
            name: str(row.name, 'Postać'),
            ownerId: owner,
            pendingOwnerName: owner ? null : (pending?.name ?? null),
            pendingOwnerId: owner ? null : (pending?.id ?? null),
            portraitUrl: maybeStr(row.portraitUrl),
            playReady: row.playReady !== false,
            template: row.template === true && !owner && !pending,
            creationTokenDone: row.creationTokenDone === true,
            data: JSON.stringify(data),
          },
        });
        const templateId = mapped(row.templateId);
        if (templateId) templates.push({ id, templateId });
        const history = (rows: unknown) =>
          asRows(rows).map((entry) => {
            const typed = entry as Partial<CharacterLedgerRow>;
            return {
              campaignId: options.campaignId,
              characterId: id,
              kind: str(typed.kind),
              amount: num(typed.amount),
              balance: num(typed.balance),
              label: str(typed.label),
              createdAt: date(typed.createdAt) ?? new Date(),
            };
          });
        const ledger = history(row.ledger);
        if (ledger.length) await tx.ledgerEntry.createMany({ data: ledger });
        const advancement = history(row.advancement);
        if (advancement.length) {
          await tx.advancementEntry.createMany({
            data: advancement.map((entry) => ({ ...entry, seenAt: entry.createdAt })),
          });
        }
      }
      for (const { id, templateId } of templates) {
        await tx.character.update({ where: { id }, data: { templateId } });
      }

      // 3. Sceny z figurami (karta i gracz po nowych id), Sieć na scenach później.
      for (const scene of scenes) {
        const columns = (scene.scene ?? {}) as Record<string, unknown>;
        const created = await insertScene(tx, scene, {
          campaignId: options.campaignId,
          actorId: options.gmId,
          name: str(columns.name, 'Scena'),
          active: scene.active === true,
          id: mapped(scene.id) ?? undefined,
          tokenId: (old) => (old ? (ids.get(old) ?? undefined) : undefined),
          character: (old) => ids.get(old) ?? null,
          owner: (old) => member(old),
          wallIds: walls,
          remap,
        });
        droppedBindings += created.droppedBindings;
      }

      // 4. Architektury (po ścianach — drzwi znają już nowe numery) i Sieć na scenach.
      for (const row of architectures) {
        await tx.netArchitecture.create({
          data: {
            id: mapped(row.id) ?? newRowId(),
            campaignId: options.campaignId,
            name: str(row.name, 'Architektura'),
            difficulty: str(row.difficulty, 'standard'),
            data: jsonText(remap(row.data), '{}'),
            runtime: jsonText(remap(row.runtime), '{}'),
          },
        });
      }
      for (const scene of scenes) {
        const sceneId = mapped(scene.id);
        if (!sceneId) continue;
        const points = asRows(scene.accessPoints);
        if (points.length) {
          await tx.netAccessPoint.createMany({
            data: points.map((row) => ({
              sceneId,
              architectureId: mapped(row.architectureId),
              name: str(row.name, 'Punkt dostępu'),
              x: num(row.x),
              y: num(row.y),
              hidden: bool(row.hidden),
              notes: str(row.notes),
            })),
          });
        }
        const zones = asRows(scene.defenseZones);
        if (zones.length) {
          await tx.defenseZone.createMany({
            data: zones.map((row) => ({
              sceneId,
              entryId: str(row.entryId),
              name: str(row.name, 'Strefa'),
              x: num(row.x),
              y: num(row.y),
              width: num(row.width, 1),
              height: num(row.height, 1),
              armed: bool(row.armed, true),
              hidden: bool(row.hidden, true),
              hpMax: num(row.hpMax),
              hpCurrent: num(row.hpCurrent),
              exempt: jsonText(remap(row.exempt), '[]'),
              sightings: jsonText(remap(row.sightings), '{}'),
              tokenId: mapped(row.tokenId),
              architectureId: mapped(row.architectureId),
              floorId: maybeStr(row.floorId),
              deviceId: maybeStr(row.deviceId),
              notes: str(row.notes),
            })),
          });
        }
      }

      // 5. Boty z relacjami, kompendium, wiedza, dziennik, handouty.
      for (const row of bots) {
        await tx.botProfile.create({
          data: {
            id: mapped(row.id) ?? newRowId(),
            campaignId: options.campaignId,
            name: str(row.name, 'Bot'),
            portraitUrl: maybeStr(row.portraitUrl),
            data: jsonText(remap(row.data), '{}'),
            active: bool(row.active),
            archived: bool(row.archived),
            characterId: mapped(row.characterId),
            sceneId: mapped(row.sceneId),
          },
        });
      }
      const keptRelations = relations.filter((row) => mapped(row.botId) && mapped(row.characterId));
      droppedBindings += relations.length - keptRelations.length;
      if (keptRelations.length) {
        await tx.botRelation.createMany({
          data: keptRelations.map((row) => ({
            botId: mapped(row.botId)!,
            characterId: mapped(row.characterId)!,
            value: num(row.value),
            note: str(row.note),
          })),
        });
      }
      if (compendium.length) {
        await tx.compendiumEntry.createMany({
          data: compendium.map((row) => ({
            id: mapped(row.id) ?? newRowId(),
            campaignId: options.campaignId,
            slug: str(row.slug),
            category: str(row.category),
            data: jsonText(remap(row.data), '{}'),
          })),
        });
      }
      // Wiedza i dziennik wjeżdżają bez śladu indeksu RAG — nowa kampania
      // indeksuje się od nowa (inaczej asystent szukałby w cudzej kolekcji).
      if (knowledge.length) {
        await tx.knowledgeEntry.createMany({
          data: knowledge.map((row) => ({
            id: mapped(row.id) ?? newRowId(),
            campaignId: options.campaignId,
            title: str(row.title),
            body: str(remap(row.body) as string),
            type: str(row.type, 'note'),
            tags: str(row.tags, '[]'),
            visibility: str(row.visibility, 'bots'),
            createdAt: date(row.createdAt),
          })),
        });
      }
      if (journal.length) {
        await tx.journalEntry.createMany({
          data: journal.map((row) => ({
            id: mapped(row.id) ?? newRowId(),
            campaignId: options.campaignId,
            title: str(row.title),
            body: str(remap(row.body) as string),
            sessionDate: str(row.sessionDate),
            worldDate: maybeStr(row.worldDate),
            tags: str(row.tags, '[]'),
            visibility: str(row.visibility, 'gm'),
            sharedWithPlayers: bool(row.sharedWithPlayers),
            // Czat nie wjeżdża — wpis nie wskazuje wiersza, którego tu nie ma.
            throughMessageId: null,
            lineCount: num(row.lineCount),
            createdAt: date(row.createdAt),
          })),
        });
      }
      if (handouts.length) {
        await tx.handout.createMany({
          data: handouts.map((row) => ({
            id: mapped(row.id) ?? newRowId(),
            campaignId: options.campaignId,
            title: str(row.title),
            body: str(remap(row.body) as string),
            imageUrl: maybeStr(row.imageUrl),
            imageWidth: maybeNum(row.imageWidth),
            imageHeight: maybeNum(row.imageHeight),
            kind: str(row.kind, 'note'),
            lead: maybeStr(row.lead),
            outlet: maybeStr(row.outlet),
            dateline: maybeStr(row.dateline),
            createdAt: date(row.createdAt),
          })),
        });
      }
      const shares = handoutShares.filter((row) => mapped(row.handoutId) && member(row.userId));
      if (shares.length) {
        await tx.handoutShare.createMany({
          data: shares.map((row) => ({
            handoutId: mapped(row.handoutId)!,
            userId: member(row.userId)!,
            sharedAt: date(row.sharedAt),
          })),
        });
      }
      const links = journalHandouts.filter((row) => mapped(row.entryId) && mapped(row.handoutId));
      if (links.length) {
        await tx.journalHandout.createMany({
          data: links.map((row) => ({
            entryId: mapped(row.entryId)!,
            handoutId: mapped(row.handoutId)!,
          })),
        });
      }

      // 6. Biblioteki grafik, sklepy, tabele losowe.
      if (tokenAssets.length) {
        await tx.tokenAsset.createMany({
          data: tokenAssets.map((row) => ({
            id: mapped(row.id) ?? newRowId(),
            campaignId: options.campaignId,
            name: str(row.name),
            url: str(row.url),
            width: num(row.width),
            height: num(row.height),
          })),
        });
      }
      if (portraitAssets.length) {
        await tx.portraitAsset.createMany({
          data: portraitAssets.map((row) => ({
            id: mapped(row.id) ?? newRowId(),
            campaignId: options.campaignId,
            name: str(row.name),
            url: str(row.url),
            width: num(row.width),
            height: num(row.height),
            cropX: num(row.cropX, 0.5),
            cropY: num(row.cropY, 0.5),
            cropZoom: num(row.cropZoom, 1),
            bannerX: maybeNum(row.bannerX),
            bannerY: maybeNum(row.bannerY),
            bannerZoom: maybeNum(row.bannerZoom),
            retired: bool(row.retired),
            gmOnly: bool(row.gmOnly),
          })),
        });
      }
      const shops = merchants.filter((row) => mapped(row.characterId));
      droppedBindings += merchants.length - shops.length;
      if (shops.length) {
        await tx.merchant.createMany({
          data: shops.map((row) => ({
            id: mapped(row.id) ?? newRowId(),
            campaignId: options.campaignId,
            characterId: mapped(row.characterId)!,
            sign: str(row.sign),
            open: bool(row.open),
            access: str(row.access, 'reach'),
            betweenSessions: bool(row.betweenSessions),
            priceMul: num(row.priceMul, 100),
            buyBackPct: num(row.buyBackPct, 50),
            cashInfinite: bool(row.cashInfinite),
            rows: jsonText(remap(row.rows), '{}'),
          })),
        });
      }
      // Tabele najpierw, wiersze potem — wiersz może odsyłać do innej tabeli.
      for (const table of randomTables) {
        await tx.randomTable.create({
          data: {
            id: mapped(table.id) ?? newRowId(),
            campaignId: options.campaignId,
            name: str(table.name, 'Tabela'),
            formula: str(table.formula, '1d10'),
            description: str(table.description),
            visibility: str(table.visibility, 'gm'),
          },
        });
      }
      for (const table of randomTables) {
        const tableId = mapped(table.id);
        const rows = asRows(table.rows);
        if (!tableId || rows.length === 0) continue;
        await tx.randomTableRow.createMany({
          data: rows.map((row, index) => ({
            id: mapped(row.id) ?? newRowId(),
            tableId,
            min: num(row.min, 1),
            max: num(row.max, 1),
            text: str(row.text),
            subTableId: mapped(row.subTableId),
            position: num(row.position, index),
          })),
        });
      }
    },
    // Duża kampania to setki wierszy — domyślne 5 s transakcji to za mało.
    { timeout: 120_000, maxWait: 10_000 },
  );

  return { id: options.campaignId, name, pendingPlayers, droppedBindings };
}
