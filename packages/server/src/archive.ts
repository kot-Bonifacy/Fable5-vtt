import type {
  ArchiveFile,
  ArchiveKind,
  ArchiveManifest,
  ArchiveRefusalCode,
  CpredRegistry,
  PlayerMoveMode,
} from '@vtt/shared';
import {
  ARCHIVE_APP,
  ARCHIVE_VERSION,
  archiveRefusal,
  isPlayerMoveMode,
  isTokenDisposition,
  parseCharacterData,
  sanitizeWallArmor,
  sanitizeConcealPenalty,
  UPLOAD_URL_PATTERN,
} from '@vtt/shared';
import type { PrismaClient } from './db.js';
import type { Prisma } from './generated/prisma/client.js';

/** Klient albo transakcja — wczytanie kampanii (57a) pisze wszystko w jednej. */
export type ArchiveDb = PrismaClient | Prisma.TransactionClient;

/**
 * Pliki wymiany (etap 33): karta, scena i cała kampania do jednego JSON-a.
 *
 * **Dlaczego wiersze, a nie widoki.** Opis etapu proponował eksport przez
 * `toCharacterView`/`toSceneView`, żeby plik nie zamarzł na kształcie tabeli.
 * Tu jest odwrotnie i świadomie: widok jest tym, co **wolno pokazać komuś przy
 * stole** — `toTokenView` podmienia nazwę figury na `publicName`, a `toZoneView`
 * pyta, czy strefa została wypatrzona. Kopia zapasowa, która gubi prawdziwą
 * nazwę żetonu, nie jest kopią zapasową. Jadą więc **wiersze z wypisanymi
 * kolumnami** (nigdy `select` hurtem — nowa kolumna ma się tu dopisać ręką,
 * bo tylko wtedy ktoś zdecyduje, czy ma jechać).
 *
 * **Kolumny JSON-owe idą jako prawdziwy JSON.** `Character.data`,
 * `Token.statuses`, `MapDrawing.data` i reszta rodziny są w bazie tekstem;
 * w pliku są obiektami. Bez tego zrzut kampanii byłby JSON-em, w którym
 * co ciekawsze rzeczy stoją jako `"{\\"hp\\":25,...}"` — nie do przeczytania
 * w edytorze, a to jedno z kryteriów ukończenia etapu.
 *
 * **Eksport wypisuje surową kolumnę, import ją normalizuje** — i ta asymetria
 * jest zamierzona. Kopia zapasowa ma być prawdą o tym, co leży w bazie, więc
 * `data` jedzie taka, jaka jest. Wczytanie idzie przez `parseCharacterData`,
 * czyli ten sam parser, którym czyta kartę reszta serwera — karta zapisana przed
 * etapem 30b wraca z dopisanymi polami, których wtedy nie było. Nic nie ginie,
 * dochodzą wartości domyślne; bez tego plik otwierałby panel pytający o pole,
 * którego w karcie nie ma.
 *
 * **Import nigdy nie odtwarza cudzych id.** Każdy wiersz dostaje nowe, a te,
 * które wskazują na kogoś (`ownerId`, `characterId`, `authorId`), przeżywają
 * **tylko wtedy, gdy taki wiersz naprawdę istnieje w tej instalacji**. Reszta
 * schodzi do `null` — id z innego komputera nic tu nie znaczy.
 */

/** Kolumna tekstowa, która w bazie trzyma JSON; w pliku ma być obiektem. */
export function parseJsonColumn(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    // Kolumna, której nikt nie umie sparsować, jedzie tekstem — plik ma
    // przenieść stan nawet wtedy, gdy stan jest uszkodzony.
    return value;
  }
}

/** Odwrotność `parseJsonColumn` przy zapisie. */
export function stringifyJsonColumn(value: unknown, fallback: string): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function buildManifest(
  kind: ArchiveKind,
  campaignName: string,
  payload: unknown,
  counts: Record<string, number>,
  omitted: string[],
): ArchiveManifest {
  const serialized = JSON.stringify(payload);
  const files = [...new Set(serialized.match(UPLOAD_URL_PATTERN) ?? [])].sort();
  return {
    app: ARCHIVE_APP,
    kind,
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    campaignName,
    counts,
    omitted,
    files,
  };
}

/* ------------------------------------------------------------------ */
/* Karta postaci                                                       */
/* ------------------------------------------------------------------ */

export interface CharacterLedgerRow {
  kind: string;
  amount: number;
  balance: number;
  label: string;
  createdAt: string;
}

export interface CharacterArchive {
  name: string;
  portraitUrl: string | null;
  /**
   * Etap 57a: gracz, do którego karta należała — id konta i imię przy stole.
   * Import oddaje kartę temu samemu kontu, gdy siedzi w kampanii docelowej,
   * a inaczej zostawia ją „czeka na gracza: <imię>”. Brak pola (plik z etapu 33)
   * i `null` — karta NPC.
   */
  owner?: { id: string; name: string } | null;
  /** Etap 57a: zgoda MG na grę (naprawa 3c) — brak w starszych plikach = `true`. */
  playReady?: boolean;
  /** Etap 49a: karta-wzorzec statysty (brak w starszych plikach = `false`). */
  template?: boolean;
  /** `CpredCharacterData` jako obiekt — wersja schematu siedzi w środku. */
  data: unknown;
  /** Historia eurodolców (23b) i Punktów Doświadczenia (29a) — bez id. */
  ledger: CharacterLedgerRow[];
  advancement: CharacterLedgerRow[];
}

export async function exportCharacter(
  prisma: PrismaClient,
  characterId: string,
): Promise<ArchiveFile<CharacterArchive> | null> {
  const row = await prisma.character.findUnique({
    where: { id: characterId },
    select: {
      name: true,
      portraitUrl: true,
      playReady: true,
      template: true,
      data: true,
      owner: { select: { id: true, name: true } },
      campaign: { select: { name: true } },
    },
  });
  if (!row) return null;

  const columns = {
    kind: true,
    amount: true,
    balance: true,
    label: true,
    createdAt: true,
  } as const;
  const [ledger, advancement] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: { characterId },
      select: columns,
      orderBy: { id: 'asc' },
    }),
    prisma.advancementEntry.findMany({
      where: { characterId },
      select: columns,
      orderBy: { id: 'asc' },
    }),
  ]);
  const toRow = (entry: (typeof ledger)[number]): CharacterLedgerRow => ({
    kind: entry.kind,
    amount: entry.amount,
    balance: entry.balance,
    label: entry.label,
    createdAt: entry.createdAt.toISOString(),
  });

  const payload: CharacterArchive = {
    name: row.name,
    portraitUrl: row.portraitUrl,
    owner: row.owner,
    playReady: row.playReady,
    template: row.template,
    data: parseJsonColumn(row.data),
    ledger: ledger.map(toRow),
    advancement: advancement.map(toRow),
  };
  const manifest = buildManifest(
    'character',
    row.campaign.name,
    payload,
    { ledger: payload.ledger.length, advancement: payload.advancement.length },
    [
      'Żetony na scenach — figura jest własnością sceny, nie karty.',
      'Konto gracza — plik niesie jego id i imię; karta wraca do tego konta tylko w kampanii, w której ono siedzi, inaczej czeka na gracza.',
    ],
  );
  return { manifest, payload };
}

export interface ImportRefusal {
  code: ArchiveRefusalCode | 'ARCHIVE_EMPTY';
}

export interface CharacterImportOptions {
  campaignId: string;
  /** MG, który wczytuje — id konta z pliku zostaje tylko, gdy to gracz jego kampanii. */
  gmId?: string;
  /**
   * Komu przypisać kartę; `null` = NPC prowadzony przez MG. Brak pola (57a) —
   * rozstrzyga `owner` z pliku: to samo konto w kampanii dostaje kartę od razu,
   * inne — karta czeka na gracza.
   */
  ownerId?: string | null;
  /** Nazwa, jeśli MG chce inną niż w pliku (import obok istniejącej karty). */
  name?: string;
}

/**
 * Wczytaj kartę z pliku jako **nową** kartę tej kampanii.
 *
 * Zwraca id nowej karty albo kod odmowy. Właściciel przychodzi z zewnątrz i to
 * jest cały punkt: plik pamięta cudze `ownerId`, którego tu nie ma.
 */
export async function importCharacter(
  prisma: PrismaClient,
  registry: CpredRegistry,
  file: unknown,
  options: CharacterImportOptions,
): Promise<{ id: string; ownerId: string | null; pendingOwner: string | null } | ImportRefusal> {
  const refusal = archiveRefusal(file, 'character');
  if (refusal) return { code: refusal };
  const payload = (file as ArchiveFile<Partial<CharacterArchive>>).payload;
  if (!payload || typeof payload !== 'object') return { code: 'ARCHIVE_MALFORMED' };
  const name = (options.name ?? payload.name ?? '').trim();
  if (!name) return { code: 'ARCHIVE_EMPTY' };

  // Karta przechodzi przez ten sam parser, którym czyta ją reszta serwera:
  // plik z brakami albo z polem, którego ta wersja nie zna, ma dać kartę
  // dającą się otworzyć, a nie wiersz, który wywraca panel przy pierwszym
  // odczycie.
  const data = parseCharacterData(stringifyJsonColumn(payload.data, '{}'), registry);
  const owner =
    options.ownerId !== undefined
      ? { ownerId: options.ownerId, pending: null }
      : await resolveArchiveOwner(prisma, options.campaignId, payload.owner, options.gmId);

  const created = await prisma.character.create({
    data: {
      campaignId: options.campaignId,
      name,
      ownerId: owner.ownerId,
      pendingOwnerName: owner.pending?.name ?? null,
      pendingOwnerId: owner.pending?.id ?? null,
      portraitUrl: typeof payload.portraitUrl === 'string' ? payload.portraitUrl : null,
      playReady: payload.playReady !== false,
      template: payload.template === true && owner.ownerId === null && owner.pending === null,
      data: JSON.stringify(data),
    },
    select: { id: true },
  });

  const history = (rows: CharacterLedgerRow[] | undefined) =>
    (Array.isArray(rows) ? rows : []).map((row) => ({
      campaignId: options.campaignId,
      characterId: created.id,
      kind: String(row.kind ?? ''),
      amount: Number(row.amount ?? 0),
      balance: Number(row.balance ?? 0),
      label: String(row.label ?? ''),
      createdAt: new Date(row.createdAt ?? Date.now()),
    }));
  const ledger = history(payload.ledger);
  const advancement = history(payload.advancement);
  if (ledger.length) await prisma.ledgerEntry.createMany({ data: ledger });
  // An imported award was told about in its own campaign — the player of the
  // copy is not greeted with every session of it again (20.10.2026).
  if (advancement.length) {
    await prisma.advancementEntry.createMany({
      data: advancement.map((row) => ({ ...row, seenAt: row.createdAt })),
    });
  }

  return { id: created.id, ownerId: owner.ownerId, pendingOwner: owner.pending?.name ?? null };
}

/**
 * Właściciel karty z pliku (57a, decyzja MG 3): konto w kampanii albo „czeka na
 * gracza”. Id konta zostaje przy czekającej karcie tylko wtedy, gdy to gracz
 * którejś kampanii **tego** MG — id gracza innego MG nie ma czego szukać w tej
 * bazie (izolacja kampanii, 44b), a imię z pliku wystarcza do przypisania.
 */
export async function resolveArchiveOwner(
  prisma: ArchiveDb,
  campaignId: string,
  owner: unknown,
  gmId?: string,
): Promise<{ ownerId: string | null; pending: { id: string | null; name: string } | null }> {
  if (!owner || typeof owner !== 'object') return { ownerId: null, pending: null };
  const { id, name } = owner as { id?: unknown; name?: unknown };
  const ownerId = typeof id === 'string' ? id : null;
  if (ownerId) {
    const member = await prisma.campaignMember.findUnique({
      where: { campaignId_userId: { campaignId, userId: ownerId } },
      select: { userId: true },
    });
    if (member) return { ownerId, pending: null };
  }
  const known = ownerId ? await knownPlayers(prisma, [ownerId], gmId) : new Set<string>();
  const label = typeof name === 'string' && name.trim() ? name.trim().slice(0, 64) : 'gracz';
  return {
    ownerId: null,
    pending: { id: ownerId && known.has(ownerId) ? ownerId : null, name: label },
  };
}

/** Które z tych kont to gracze kampanii prowadzonych przez tego MG. */
export async function knownPlayers(
  prisma: ArchiveDb,
  userIds: string[],
  gmId: string | undefined,
): Promise<Set<string>> {
  if (!gmId || userIds.length === 0) return new Set();
  const rows = await prisma.campaignMember.findMany({
    where: { userId: { in: userIds }, campaign: { gmId } },
    select: { userId: true },
  });
  return new Set(rows.map((row) => row.userId));
}

/* ------------------------------------------------------------------ */
/* Scena                                                               */
/* ------------------------------------------------------------------ */

export interface SceneArchive {
  scene: Record<string, unknown>;
  tokens: Record<string, unknown>[];
  walls: Record<string, unknown>[];
  covers: Record<string, unknown>[];
  lights: Record<string, unknown>[];
  notes: Record<string, unknown>[];
  drawings: Record<string, unknown>[];
  fog: Record<string, unknown>[];
  smoke: Record<string, unknown>[];
  exploration: Record<string, unknown> | null;
  /**
   * Etap 57a, tylko w zrzucie kampanii: punkty dostępu i strefy bronione Sieci.
   * Należą do architektury (26a), więc pojedyncza scena ich nie niesie —
   * w kampanii architektura jedzie razem z nimi.
   */
  accessPoints?: Record<string, unknown>[];
  defenseZones?: Record<string, unknown>[];
}

/** Kolumny sceny, które opisują scenę — bez `id`, `campaignId` i `active`. */
const SCENE_COLUMNS = {
  name: true,
  backgroundUrl: true,
  backgroundWidth: true,
  backgroundHeight: true,
  width: true,
  height: true,
  gridMode: true,
  gridSizePx: true,
  gridOffsetX: true,
  gridOffsetY: true,
  gridColor: true,
  gridAlpha: true,
  gridVisible: true,
  gridPlayers: true,
  metersPerSquare: true,
  visibility: true,
  dark: true,
  darkSightM: true,
  explore: true,
  spawnX: true,
  spawnY: true,
  playerMove: true,
  ambience: true,
} as const;

export async function exportScene(
  prisma: PrismaClient,
  sceneId: string,
): Promise<ArchiveFile<SceneArchive> | null> {
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    select: { ...SCENE_COLUMNS, campaign: { select: { name: true } } },
  });
  if (!scene) return null;
  const { campaign, ...sceneColumns } = scene;

  const [tokens, walls, covers, lights, notes, drawings, fog, smoke, exploration] =
    await Promise.all([
      prisma.token.findMany({
        where: { sceneId },
        select: {
          // Id jedzie od 57a: strefy, kamery i chwyty wskazują figurę po id,
          // a wczytanie kampanii przepisuje je na nowe.
          id: true,
          name: true,
          publicName: true,
          imageUrl: true,
          x: true,
          y: true,
          size: true,
          hidden: true,
          ownerId: true,
          characterId: true,
          hpCurrent: true,
          hpMax: true,
          statuses: true,
          statusData: true,
          facing: true,
          visionRange: true,
          sharedVision: true,
          disposition: true,
          lightBrightM: true,
          lightDimM: true,
          lightColor: true,
          lightFlicker: true,
          lightOn: true,
        },
      }),
      prisma.wall.findMany({
        where: { sceneId },
        select: {
          // Drzwi Sieci (`wallId` w architekturze) wskazują ścianę po id (57a).
          id: true,
          kind: true,
          open: true,
          playerToggle: true,
          locked: true,
          armor: true,
          hidesFigures: true,
          concealPenalty: true,
          x1: true,
          y1: true,
          x2: true,
          y2: true,
        },
      }),
      prisma.cover.findMany({
        where: { sceneId },
        select: {
          typeId: true,
          name: true,
          x: true,
          y: true,
          width: true,
          height: true,
          hpMax: true,
          hpCurrent: true,
          hidden: true,
        },
      }),
      prisma.mapLight.findMany({
        where: { sceneId },
        select: {
          x: true,
          y: true,
          brightM: true,
          dimM: true,
          color: true,
          flicker: true,
          enabled: true,
        },
      }),
      prisma.mapNote.findMany({
        where: { sceneId },
        select: { x: true, y: true, icon: true, text: true },
      }),
      prisma.mapDrawing.findMany({
        where: { sceneId },
        select: {
          authorId: true,
          kind: true,
          data: true,
          color: true,
          width: true,
          filled: true,
          gmOnly: true,
        },
      }),
      prisma.fogShape.findMany({
        where: { sceneId },
        select: { mode: true, kind: true, data: true, override: true },
      }),
      prisma.smoke.findMany({
        where: { sceneId },
        select: { name: true, x: true, y: true, sideM: true, penalty: true },
      }),
      prisma.sceneExploration.findUnique({
        where: { sceneId },
        select: { cell: true, cols: true, rows: true, data: true },
      }),
    ]);

  const payload: SceneArchive = {
    scene: sceneColumns,
    tokens: tokens.map((row) => ({
      ...row,
      statuses: parseJsonColumn(row.statuses),
      statusData: parseJsonColumn(row.statusData),
    })),
    walls,
    covers,
    lights,
    notes,
    drawings: drawings.map((row) => ({ ...row, data: parseJsonColumn(row.data) })),
    fog: fog.map((row) => ({ ...row, data: parseJsonColumn(row.data) })),
    smoke,
    exploration,
  };

  const manifest = buildManifest(
    'scene',
    campaign.name,
    payload,
    {
      tokens: payload.tokens.length,
      walls: payload.walls.length,
      covers: payload.covers.length,
      lights: payload.lights.length,
      notes: payload.notes.length,
      drawings: payload.drawings.length,
      fog: payload.fog.length,
      smoke: payload.smoke.length,
    },
    [
      'Trwająca walka — kolejka inicjatywy umiera razem ze sceną i tak jest chciane.',
      'Punkty dostępu i strefy bronione Sieci — należą do architektury (26a), nie do sceny.',
    ],
  );
  return { manifest, payload };
}

export interface SceneImportOptions {
  campaignId: string;
  /** Kto stawia scenę — autor rysunków, których autora nie da się odtworzyć. */
  actorId: string;
  name?: string;
}

/** Które id z pliku da się utrzymać: te, pod którymi coś tu naprawdę stoi. */
async function survivingIds(
  prisma: PrismaClient,
  campaignId: string,
  characterIds: string[],
  ownerIds: string[],
): Promise<{ characters: Set<string>; owners: Set<string> }> {
  const [characters, owners] = await Promise.all([
    characterIds.length
      ? prisma.character.findMany({
          where: { campaignId, id: { in: characterIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
    // Właściciel figury to gracz tej kampanii (etap 44b), nie dowolne konto.
    ownerIds.length
      ? prisma.campaignMember.findMany({
          where: { campaignId, userId: { in: ownerIds } },
          select: { userId: true },
        })
      : Promise.resolve([]),
  ]);
  return {
    characters: new Set(characters.map((row) => row.id)),
    owners: new Set(owners.map((row) => row.userId)),
  };
}

export const asRows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? (value.filter((row) => row && typeof row === 'object') as Record<string, unknown>[])
    : [];

export const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
export const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;
export const bool = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;
export const maybeStr = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;
export const maybeNum = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Ruch graczy sceny z archiwum (etap 45). Plik sprzed etapu niesie logiczne
 * `playerMoveLocked` — otwarta mapa była wtedy „Swobodnym", zamknięta „Stop".
 * „Swobodny” (`free`) zniknął w etapie 52 i wraca jako Eksploracja.
 */
function importedPlayerMove(columns: Record<string, unknown>): PlayerMoveMode {
  if (isPlayerMoveMode(columns.playerMove)) return columns.playerMove;
  if (columns.playerMove === 'free') return 'explore';
  return columns.playerMoveLocked === false ? 'explore' : 'stop';
}

/**
 * Jak wstawić scenę z pliku — jedna droga dla pojedynczej sceny (33) i dla
 * scen w kampanii (57a). Różnią się wyłącznie tym, skąd biorą nowe id
 * i co robią z odnośnikiem do karty i gracza.
 */
export interface SceneInsertOptions {
  campaignId: string;
  actorId: string;
  name: string;
  active: boolean;
  /** Id nowej sceny; brak — nada je baza. */
  id?: string;
  /** Nowe id figury dla starego; brak — nada je baza. */
  tokenId?: (oldId: string | null) => string | undefined;
  /** Karta figury w nowym miejscu albo `null`, gdy jej tu nie ma. */
  character: (oldId: string) => string | null;
  /** Gracz figury w nowym miejscu albo `null`, gdy go tu nie ma. */
  owner: (oldId: string) => string | null;
  /** Ściany, których nowe id trzeba znać (drzwi Sieci); reszta idzie hurtem. */
  wallIds?: Map<number, number | null>;
  /** Przepisanie kolumn JSON-owych (id w środku); brak — bez zmian. */
  remap?: (value: unknown) => unknown;
  /** Etap 57b: chwila założenia z kopii — lista scen po cofnięciu w tej samej kolejności. */
  createdAt?: Date;
}

export async function insertScene(
  db: ArchiveDb,
  payload: Partial<SceneArchive>,
  options: SceneInsertOptions,
): Promise<{ id: string; droppedBindings: number }> {
  const sceneColumns = (payload.scene ?? {}) as Record<string, unknown>;
  const remap = options.remap ?? ((value: unknown) => value);
  let droppedBindings = 0;

  const scene = await db.scene.create({
    data: {
      ...(options.id ? { id: options.id } : {}),
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      campaignId: options.campaignId,
      name: options.name,
      active: options.active,
      backgroundUrl: maybeStr(sceneColumns.backgroundUrl),
      backgroundWidth: maybeNum(sceneColumns.backgroundWidth),
      backgroundHeight: maybeNum(sceneColumns.backgroundHeight),
      width: num(sceneColumns.width, 4000),
      height: num(sceneColumns.height, 3000),
      gridMode: str(sceneColumns.gridMode, 'grid'),
      gridSizePx: num(sceneColumns.gridSizePx, 100),
      gridOffsetX: num(sceneColumns.gridOffsetX, 0),
      gridOffsetY: num(sceneColumns.gridOffsetY, 0),
      gridColor: str(sceneColumns.gridColor, '#000000'),
      gridAlpha: num(sceneColumns.gridAlpha, 0.35),
      gridVisible: bool(sceneColumns.gridVisible, true),
      gridPlayers: bool(sceneColumns.gridPlayers, false),
      metersPerSquare: num(sceneColumns.metersPerSquare, 2),
      visibility: str(sceneColumns.visibility, 'fog'),
      dark: bool(sceneColumns.dark, false),
      darkSightM: num(sceneColumns.darkSightM, 2),
      explore: bool(sceneColumns.explore, true),
      spawnX: maybeNum(sceneColumns.spawnX),
      spawnY: maybeNum(sceneColumns.spawnY),
      // Domyślnie **Stop**, jak przy nowej scenie (12.09, etap 45): mapa
      // wjeżdżająca z pliku jest dla stołu tak samo nieznana, jak dopiero co
      // narysowana. Archiwum sprzed etapu 45 niesie jeszcze `playerMoveLocked`.
      playerMove: importedPlayerMove(sceneColumns),
      ambience: str(sceneColumns.ambience, 'none'),
    },
    select: { id: true },
  });
  const sceneId = scene.id;

  const tokenRows = asRows(payload.tokens);
  if (tokenRows.length) {
    await db.token.createMany({
      data: tokenRows.map((row) => {
        const characterId = maybeStr(row.characterId);
        const ownerId = maybeStr(row.ownerId);
        const character = characterId ? options.character(characterId) : null;
        const owner = ownerId ? options.owner(ownerId) : null;
        if ((characterId && !character) || (ownerId && !owner)) droppedBindings += 1;
        const id = options.tokenId?.(maybeStr(row.id));
        return {
          ...(id ? { id } : {}),
          sceneId,
          name: str(row.name, 'Figura'),
          publicName: maybeStr(row.publicName),
          imageUrl: maybeStr(row.imageUrl),
          x: num(row.x),
          y: num(row.y),
          size: num(row.size, 1),
          hidden: bool(row.hidden),
          ownerId: owner,
          characterId: character,
          hpCurrent: maybeNum(row.hpCurrent),
          hpMax: maybeNum(row.hpMax),
          statuses: stringifyJsonColumn(remap(row.statuses), '[]'),
          statusData: stringifyJsonColumn(remap(row.statusData), '{}'),
          facing: maybeNum(row.facing),
          visionRange: maybeNum(row.visionRange),
          sharedVision: typeof row.sharedVision === 'boolean' ? row.sharedVision : null,
          disposition: isTokenDisposition(row.disposition) ? row.disposition : null,
          lightBrightM: num(row.lightBrightM),
          lightDimM: num(row.lightDimM),
          lightColor: str(row.lightColor, '#ffd9a0'),
          lightFlicker: bool(row.lightFlicker),
          lightOn: bool(row.lightOn, true),
        };
      }),
    });
  }

  const wallData = (row: Record<string, unknown>) => ({
    sceneId,
    kind: str(row.kind, 'wall'),
    open: bool(row.open),
    playerToggle: bool(row.playerToggle),
    locked: bool(row.locked),
    // Plik sprzed etapu 42b nie ma tej kolumny — bariera wraca bez pancerza,
    // tak jak stała. Liczba spoza zakresu nie wchodzi do bazy.
    armor: sanitizeWallArmor(row.armor) ?? 0,
    hidesFigures: row.hidesFigures === true,
    concealPenalty: sanitizeConcealPenalty(row.concealPenalty) ?? -4,
    x1: num(row.x1),
    y1: num(row.y1),
    x2: num(row.x2),
    y2: num(row.y2),
  });
  const walls = asRows(payload.walls);
  const tracked = options.wallIds;
  const plainWalls = tracked ? walls.filter((row) => !tracked.has(num(row.id, -1))) : walls;
  if (plainWalls.length) await db.wall.createMany({ data: plainWalls.map(wallData) });
  if (tracked) {
    // Ściana, na którą wskazują drzwi Sieci, wchodzi pojedynczo — jej nowe id
    // trafia do mapy, zanim architektura zostanie zapisana.
    for (const row of walls) {
      const oldId = num(row.id, -1);
      if (!tracked.has(oldId)) continue;
      const created = await db.wall.create({ data: wallData(row), select: { id: true } });
      tracked.set(oldId, created.id);
    }
  }

  const covers = asRows(payload.covers);
  if (covers.length) {
    await db.cover.createMany({
      data: covers.map((row) => ({
        sceneId,
        typeId: str(row.typeId),
        name: str(row.name, 'Osłona'),
        x: num(row.x),
        y: num(row.y),
        width: num(row.width, 1),
        height: num(row.height, 1),
        hpMax: num(row.hpMax, 1),
        hpCurrent: num(row.hpCurrent, 1),
        hidden: bool(row.hidden),
      })),
    });
  }

  const lights = asRows(payload.lights);
  if (lights.length) {
    await db.mapLight.createMany({
      data: lights.map((row) => ({
        sceneId,
        x: num(row.x),
        y: num(row.y),
        brightM: num(row.brightM, 4),
        dimM: num(row.dimM, 10),
        color: str(row.color, '#ffd9a0'),
        flicker: bool(row.flicker),
        enabled: bool(row.enabled, true),
      })),
    });
  }

  const notes = asRows(payload.notes);
  if (notes.length) {
    await db.mapNote.createMany({
      data: notes.map((row) => ({
        sceneId,
        x: num(row.x),
        y: num(row.y),
        icon: str(row.icon, '📌'),
        text: str(row.text),
      })),
    });
  }

  const drawings = asRows(payload.drawings);
  if (drawings.length) {
    await db.mapDrawing.createMany({
      data: drawings.map((row) => ({
        sceneId,
        // Rysunek MUSI mieć autora (klucz obcy, kaskada) — autora z innej
        // instalacji nie ma, więc rysunki przejmuje ten, kto stawia scenę.
        authorId: options.actorId,
        kind: str(row.kind, 'free'),
        data: stringifyJsonColumn(row.data, '{}'),
        color: str(row.color, '#ffffff'),
        width: num(row.width, 3),
        filled: bool(row.filled),
        gmOnly: bool(row.gmOnly),
      })),
    });
  }

  const fog = asRows(payload.fog);
  if (fog.length) {
    await db.fogShape.createMany({
      data: fog.map((row) => ({
        sceneId,
        mode: str(row.mode, 'reveal'),
        kind: str(row.kind, 'poly'),
        data: stringifyJsonColumn(row.data, '{}'),
        override: bool(row.override),
      })),
    });
  }

  const smoke = asRows(payload.smoke);
  if (smoke.length) {
    await db.smoke.createMany({
      data: smoke.map((row) => ({
        sceneId,
        name: str(row.name, 'Dym'),
        x: num(row.x),
        y: num(row.y),
        sideM: num(row.sideM, 1),
        penalty: num(row.penalty, -4),
      })),
    });
  }

  const exploration = payload.exploration;
  if (exploration && typeof exploration === 'object') {
    const row = exploration as Record<string, unknown>;
    await db.sceneExploration.create({
      data: {
        sceneId,
        cell: num(row.cell, 1),
        cols: num(row.cols, 1),
        rows: num(row.rows, 1),
        data: str(row.data),
      },
    });
  }

  return { id: sceneId, droppedBindings };
}

export async function importScene(
  prisma: PrismaClient,
  file: unknown,
  options: SceneImportOptions,
): Promise<{ id: string; droppedBindings: number } | ImportRefusal> {
  const refusal = archiveRefusal(file, 'scene');
  if (refusal) return { code: refusal };
  const payload = (file as ArchiveFile<Partial<SceneArchive>>).payload;
  if (!payload || typeof payload !== 'object') return { code: 'ARCHIVE_MALFORMED' };
  const sceneColumns = (payload.scene ?? {}) as Record<string, unknown>;
  const name = (options.name ?? str(sceneColumns.name)).trim();
  if (!name) return { code: 'ARCHIVE_EMPTY' };

  const tokenRows = asRows(payload.tokens);
  const kept = await survivingIds(
    prisma,
    options.campaignId,
    tokenRows.map((row) => maybeStr(row.characterId)).filter((id): id is string => id !== null),
    tokenRows.map((row) => maybeStr(row.ownerId)).filter((id): id is string => id !== null),
  );
  // Scena wjeżdża zawsze jako NIEaktywna: import ma dołożyć mapę do listy,
  // a nie przestawić stół w środku sesji.
  return insertScene(prisma, payload, {
    campaignId: options.campaignId,
    actorId: options.actorId,
    name,
    active: false,
    character: (id) => (kept.characters.has(id) ? id : null),
    owner: (id) => (kept.owners.has(id) ? id : null),
  });
}

/* ------------------------------------------------------------------ */
/* Cała kampania                                                       */
/* ------------------------------------------------------------------ */

export interface CampaignArchive {
  campaign: Record<string, unknown>;
  /** Kto tu jest kim — sama nazwa i rola; **nigdy** skrót hasła. */
  users: { id: string; name: string; role: string }[];
  members: { userId: string; joinedAt: string }[];
  characters: (CharacterArchive & {
    id: string;
    ownerId: string | null;
    /** Etap 49a: wzorzec, z którego zrobiono kartę. */
    templateId?: string | null;
    /** Etap 57a: kreator dał już figurę na mapę (naprawa 3d). */
    creationTokenDone?: boolean;
    /** Etap 57a: karta, która już czekała na gracza w kampanii źródłowej. */
    pendingOwner?: { id: string | null; name: string } | null;
    /** Etap 57b: kolejność kart na liście po cofnięciu. */
    createdAt?: string;
  })[];
  /** `id` od 57a — boty i strefy wskazują scenę po id; `createdAt` od 57b (kolejność). */
  scenes: (SceneArchive & { active: boolean; id?: string; createdAt?: string })[];
  bots: Record<string, unknown>[];
  compendium: Record<string, unknown>[];
  knowledge: Record<string, unknown>[];
  journal: Record<string, unknown>[];
  handouts: Record<string, unknown>[];
  /** Etap 57a: komu handout udostępniono (`handoutId`, `userId`). */
  handoutShares?: Record<string, unknown>[];
  /** Etap 57a: handouty przypięte do wpisów dziennika (`entryId`, `handoutId`). */
  journalHandouts?: Record<string, unknown>[];
  relations: Record<string, unknown>[];
  architectures: Record<string, unknown>[];
  tokenAssets: Record<string, unknown>[];
  portraitAssets: Record<string, unknown>[];
  /**
   * Sklepy (etap 46a) — ustawienia handlarzy z nakładką MG; towar jedzie
   * w kartach. Archiwum sprzed etapu nie ma pola, czyli „brak sklepów”.
   */
  merchants?: Record<string, unknown>[];
  /** Etap 57a: tabele losowe z wierszami (`rows`). Brak pola — brak tabel. */
  randomTables?: Record<string, unknown>[];
  /**
   * Etap 57b: trackery walki z uczestnikami (`combatants`) — tylko w kopii
   * automatycznej, bo walka może trwać między sesjami (blokada rozwoju
   * z 21.10). Plik do pobrania ich nie niesie; wczytanie jako nowa kampania
   * i tak by je pominęło.
   */
  combats?: Record<string, unknown>[];
  /** Log czatu — pomijany, gdy MG tak każe (to 4/5 objętości bazy). */
  chat: Record<string, unknown>[] | null;
}

export interface CampaignExportOptions {
  /** Czy zabrać log czatu (decyzja MG z 05.09: domyślnie tak, z przełącznikiem). */
  includeChat: boolean;
  /** Etap 57b: trackery walki — kopia automatyczna, z której się cofa. */
  includeCombat?: boolean;
}

/**
 * Czego zrzut kampanii **nie** niesie i dlaczego — przegląd `schema.prisma`
 * model po modelu z 22.10 (etap 57a). Wszystko inne z `campaignId` jedzie:
 * kampania (kolumny gry), karty z historią eurodolców i PD, sceny z figurami,
 * ścianami, osłonami, światłami, notatkami, rysunkami, mgłą, dymem,
 * eksploracją, punktami dostępu i strefami bronionymi, boty z relacjami,
 * kompendium, baza wiedzy, dziennik z przypiętymi handoutami, handouty
 * z udostępnieniami, architektury Sieci, biblioteki żetonów i portretów,
 * sklepy, tabele losowe i (na życzenie) czat.
 */
export const CAMPAIGN_ARCHIVE_OMITTED = [
  'Konta i hasła — plik niesie wyłącznie id, imię i rolę, nigdy skrótu hasła.',
  'Członkostwo, zaproszenia i sesje logowania — należą do kampanii, nie do jej zawartości; wczytana kampania zaprasza graczy od nowa.',
  'Dziennik sesji gry (GameSession) — historia slotów serwera, nie stan gry.',
  'Szkice kreatora (CharacterDraft) — niedokończone postaci graczy zostają przy kampanii, w której je zaczęto.',
  'Trwające walki i przebiegi w Sieci — stan chwili, umiera razem z nią.',
];

/** Kopia automatyczna niesie walki — z listy „czego nie ma” zostają przebiegi w Sieci. */
const CAMPAIGN_COPY_RUNS_OMITTED =
  'Przebiegi w Sieci — stan chwili; netrunner po cofnięciu zaczyna od punktu dostępu.';

export async function exportCampaign(
  prisma: PrismaClient,
  campaignId: string,
  options: CampaignExportOptions,
): Promise<ArchiveFile<CampaignArchive> | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      name: true,
      shopTier: true,
      // Wyjątki dostępności MG (naprawa 3b) — bez nich kopia kampanii otworzyłaby
      // albo zamknęła sklep inaczej, niż grał stół.
      shopTierOverrides: true,
      music: true,
      sandbox: true,
      createdAt: true,
      // Zegar świata (etap 37) — kopia kampanii bez daty w Night City nie jest
      // kopią tej kampanii, tylko jej wersją sprzed pierwszej nocy.
      gameTime: true,
      settledMonth: true,
      // Etap 46a: „Zakupy z katalogu” — kopia kampanii sprzedaje tak, jak stół.
      catalogShopping: true,
    },
  });
  if (!campaign) return null;

  const [characterRows, sceneRows, members] = await Promise.all([
    prisma.character.findMany({
      where: { campaignId },
      select: {
        id: true,
        ownerId: true,
        templateId: true,
        creationTokenDone: true,
        pendingOwnerId: true,
        pendingOwnerName: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.scene.findMany({
      where: { campaignId },
      select: { id: true, active: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.campaignMember.findMany({
      where: { campaignId },
      select: { userId: true, joinedAt: true },
    }),
  ]);

  const characters: CampaignArchive['characters'] = [];
  for (const row of characterRows) {
    const file = await exportCharacter(prisma, row.id);
    if (file) {
      characters.push({
        ...file.payload,
        id: row.id,
        ownerId: row.ownerId,
        templateId: row.templateId,
        creationTokenDone: row.creationTokenDone,
        pendingOwner: row.pendingOwnerName
          ? { id: row.pendingOwnerId, name: row.pendingOwnerName }
          : null,
        createdAt: row.createdAt.toISOString(),
      });
    }
  }
  const scenes: CampaignArchive['scenes'] = [];
  for (const row of sceneRows) {
    const file = await exportScene(prisma, row.id);
    if (!file) continue;
    const [accessPoints, defenseZones] = await Promise.all([
      prisma.netAccessPoint.findMany({
        where: { sceneId: row.id },
        select: { architectureId: true, name: true, x: true, y: true, hidden: true, notes: true },
      }),
      prisma.defenseZone.findMany({
        where: { sceneId: row.id },
        select: {
          // Etap 57b: cofnięcie zachowuje id strefy — wskazuje ją uczestnik walki (pułapka).
          id: true,
          entryId: true,
          name: true,
          x: true,
          y: true,
          width: true,
          height: true,
          armed: true,
          hidden: true,
          hpMax: true,
          hpCurrent: true,
          exempt: true,
          sightings: true,
          tokenId: true,
          architectureId: true,
          floorId: true,
          deviceId: true,
          notes: true,
        },
      }),
    ]);
    scenes.push({
      ...file.payload,
      id: row.id,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      accessPoints,
      defenseZones: defenseZones.map((zone) => ({
        ...zone,
        exempt: parseJsonColumn(zone.exempt),
        sightings: parseJsonColumn(zone.sightings),
      })),
    });
  }

  const [bots, compendium, knowledge, journal, handouts, relations, architectures] =
    await Promise.all([
      prisma.botProfile.findMany({ where: { campaignId } }),
      prisma.compendiumEntry.findMany({ where: { campaignId } }),
      prisma.knowledgeEntry.findMany({ where: { campaignId } }),
      prisma.journalEntry.findMany({ where: { campaignId } }),
      prisma.handout.findMany({ where: { campaignId } }),
      // Relacje botów tej kampanii — do 44b szły wszystkie z serwera, więc zrzut
      // kampanii MG-B niósł relacje (i notatki) botów MG-A.
      prisma.botRelation.findMany({ where: { bot: { campaignId } } }),
      prisma.netArchitecture.findMany({ where: { campaignId } }),
    ]);
  const [tokenAssets, portraitAssets, merchants, randomTables, handoutShares, journalHandouts] =
    await Promise.all([
      prisma.tokenAsset.findMany({ where: { campaignId } }),
      prisma.portraitAsset.findMany({ where: { campaignId } }),
      prisma.merchant.findMany({ where: { campaignId } }),
      prisma.randomTable.findMany({
        where: { campaignId },
        include: { rows: { orderBy: { position: 'asc' } } },
      }),
      prisma.handoutShare.findMany({
        where: { handout: { campaignId } },
        select: { handoutId: true, userId: true, sharedAt: true },
      }),
      prisma.journalHandout.findMany({
        where: { entry: { campaignId } },
        select: { entryId: true, handoutId: true },
      }),
    ]);

  const chat = options.includeChat
    ? await prisma.chatMessage.findMany({ where: { campaignId }, orderBy: { id: 'asc' } })
    : null;
  const combats = options.includeCombat
    ? await prisma.combat.findMany({
        where: { scene: { campaignId } },
        include: { combatants: { orderBy: { createdAt: 'asc' } } },
      })
    : null;

  const userIds = new Set<string>([...members.map((m) => m.userId)]);
  for (const character of characters) if (character.ownerId) userIds.add(character.ownerId);
  const users = await prisma.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, name: true, role: true },
  });

  const plain = (rows: unknown[]): Record<string, unknown>[] =>
    JSON.parse(JSON.stringify(rows)) as Record<string, unknown>[];

  const payload: CampaignArchive = {
    campaign: { ...campaign, createdAt: campaign.createdAt.toISOString() },
    users,
    members: members.map((row) => ({ userId: row.userId, joinedAt: row.joinedAt.toISOString() })),
    characters,
    scenes,
    bots: plain(bots),
    compendium: plain(compendium),
    knowledge: plain(knowledge),
    journal: plain(journal),
    handouts: plain(handouts),
    handoutShares: plain(handoutShares),
    journalHandouts: plain(journalHandouts),
    relations: plain(relations),
    architectures: plain(architectures),
    tokenAssets: plain(tokenAssets),
    portraitAssets: plain(portraitAssets),
    merchants: plain(merchants),
    randomTables: plain(randomTables),
    ...(combats ? { combats: plain(combats) } : {}),
    chat: chat ? plain(chat) : null,
  };

  const omitted = combats
    ? CAMPAIGN_ARCHIVE_OMITTED.map((line) =>
        line.startsWith('Trwające walki') ? CAMPAIGN_COPY_RUNS_OMITTED : line,
      )
    : [...CAMPAIGN_ARCHIVE_OMITTED];
  if (!options.includeChat) {
    omitted.unshift('Czat — pominięty na życzenie MG przy eksporcie.');
  } else {
    omitted.push(
      'Czat przy wczytaniu — log jedzie w pliku do przeczytania, ale nowa kampania zaczyna z pustym czatem.',
    );
  }

  const manifest = buildManifest(
    'campaign',
    campaign.name,
    payload,
    {
      characters: payload.characters.length,
      scenes: payload.scenes.length,
      bots: payload.bots.length,
      compendium: payload.compendium.length,
      knowledge: payload.knowledge.length,
      journal: payload.journal.length,
      handouts: payload.handouts.length,
      architectures: payload.architectures.length,
      merchants: merchants.length,
      randomTables: randomTables.length,
      ...(combats ? { combats: combats.length } : {}),
      chat: payload.chat?.length ?? 0,
    },
    omitted,
  );
  return { manifest, payload };
}

/**
 * Nazwa pliku do pobrania.
 *
 * **Wyłącznie ASCII, i to nie jest kwestia gustu.** Nagłówek `Content-Disposition`
 * jedzie po HTTP jako latin-1, więc „Bezpański" w nazwie pliku wywraca całą
 * odpowiedź błędem `ERR_INVALID_CHAR` — 500 zamiast pobrania. Polskie znaki są
 * tu więc składane do gołych liter, a prawdziwa nazwa z ogonkami wraca osobno,
 * parametrem `filename*` (RFC 5987) — patrz `contentDisposition` niżej.
 */
const DIACRITICS: Readonly<Record<string, string>> = {
  ą: 'a',
  ć: 'c',
  ę: 'e',
  ł: 'l',
  ń: 'n',
  ó: 'o',
  ś: 's',
  ź: 'z',
  ż: 'z',
};

export function archiveFileName(
  kind: ArchiveKind,
  label: string,
  now = new Date(),
  ext: 'json' | 'zip' = 'json',
): string {
  const folded = label
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (char) => DIACRITICS[char] ?? char)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const day = now.toISOString().slice(0, 10);
  return `${kind}-${folded || kind}-${day}.${ext}`;
}

/**
 * Wartość nagłówka `Content-Disposition` z obiema nazwami: złożoną do ASCII
 * (czyta ją każda przeglądarka) i prawdziwą, procentowo zakodowaną w UTF-8
 * (czyta ją każda przeglądarka z ostatniej dekady i to ją zapisuje na dysk).
 */
export function archiveContentDisposition(
  kind: ArchiveKind,
  label: string,
  now = new Date(),
  ext: 'json' | 'zip' = 'json',
): string {
  const ascii = archiveFileName(kind, label, now, ext);
  const day = now.toISOString().slice(0, 10);
  const pretty = `${kind}-${label.trim().slice(0, 40) || kind}-${day}.${ext}`;
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(pretty)}`;
}
