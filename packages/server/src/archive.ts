import type {
  ArchiveFile,
  ArchiveKind,
  ArchiveManifest,
  ArchiveRefusalCode,
  CpredRegistry,
} from '@vtt/shared';
import { ARCHIVE_APP, ARCHIVE_VERSION, archiveRefusal, parseCharacterData } from '@vtt/shared';
import type { PrismaClient } from './db.js';

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

/** Adresy `/uploads/...` w dowolnym ładunku — do listy plików w manifeście. */
const UPLOAD_URL_PATTERN = /\/uploads\/[A-Za-z0-9_\-.]+\/[A-Za-z0-9_\-.]+/g;

/** Kolumna tekstowa, która w bazie trzyma JSON; w pliku ma być obiektem. */
function parseJsonColumn(value: string | null): unknown {
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
function stringifyJsonColumn(value: unknown, fallback: string): string {
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
      data: true,
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
      'Właściciel (konto gracza) — id konta z innej instalacji nic tu nie znaczy.',
    ],
  );
  return { manifest, payload };
}

export interface ImportRefusal {
  code: ArchiveRefusalCode | 'ARCHIVE_EMPTY';
}

export interface CharacterImportOptions {
  campaignId: string;
  /** Komu przypisać kartę; `null` = NPC prowadzony przez MG. */
  ownerId: string | null;
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
): Promise<{ id: string } | ImportRefusal> {
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

  const created = await prisma.character.create({
    data: {
      campaignId: options.campaignId,
      name,
      ownerId: options.ownerId,
      portraitUrl: typeof payload.portraitUrl === 'string' ? payload.portraitUrl : null,
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
  if (advancement.length) await prisma.advancementEntry.createMany({ data: advancement });

  return { id: created.id };
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
  metersPerSquare: true,
  visibility: true,
  dark: true,
  darkSightM: true,
  explore: true,
  spawnX: true,
  spawnY: true,
  playerMoveLocked: true,
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
          kind: true,
          open: true,
          playerToggle: true,
          locked: true,
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
    ownerIds.length
      ? prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true } })
      : Promise.resolve([]),
  ]);
  return {
    characters: new Set(characters.map((row) => row.id)),
    owners: new Set(owners.map((row) => row.id)),
  };
}

const asRows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? (value.filter((row) => row && typeof row === 'object') as Record<string, unknown>[])
    : [];

const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;
const bool = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;
const maybeStr = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const maybeNum = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

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
  let droppedBindings = 0;

  // Scena wjeżdża zawsze jako NIEaktywna: import ma dołożyć mapę do listy,
  // a nie przestawić stół w środku sesji.
  const scene = await prisma.scene.create({
    data: {
      campaignId: options.campaignId,
      name,
      active: false,
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
      metersPerSquare: num(sceneColumns.metersPerSquare, 2),
      visibility: str(sceneColumns.visibility, 'fog'),
      dark: bool(sceneColumns.dark, false),
      darkSightM: num(sceneColumns.darkSightM, 2),
      explore: bool(sceneColumns.explore, true),
      spawnX: maybeNum(sceneColumns.spawnX),
      spawnY: maybeNum(sceneColumns.spawnY),
      // Domyślnie **zamknięta**, jak przy nowej scenie (12.09): mapa wjeżdżająca
      // z pliku jest dla stołu tak samo nieznana, jak dopiero co narysowana.
      playerMoveLocked: bool(sceneColumns.playerMoveLocked, true),
    },
    select: { id: true },
  });
  const sceneId = scene.id;

  if (tokenRows.length) {
    await prisma.token.createMany({
      data: tokenRows.map((row) => {
        const characterId = maybeStr(row.characterId);
        const ownerId = maybeStr(row.ownerId);
        const character = characterId && kept.characters.has(characterId) ? characterId : null;
        const owner = ownerId && kept.owners.has(ownerId) ? ownerId : null;
        if ((characterId && !character) || (ownerId && !owner)) droppedBindings += 1;
        return {
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
          statuses: stringifyJsonColumn(row.statuses, '[]'),
          statusData: stringifyJsonColumn(row.statusData, '{}'),
          facing: maybeNum(row.facing),
          visionRange: maybeNum(row.visionRange),
          lightBrightM: num(row.lightBrightM),
          lightDimM: num(row.lightDimM),
          lightColor: str(row.lightColor, '#ffd9a0'),
          lightFlicker: bool(row.lightFlicker),
          lightOn: bool(row.lightOn, true),
        };
      }),
    });
  }

  const walls = asRows(payload.walls);
  if (walls.length) {
    await prisma.wall.createMany({
      data: walls.map((row) => ({
        sceneId,
        kind: str(row.kind, 'wall'),
        open: bool(row.open),
        playerToggle: bool(row.playerToggle),
        locked: bool(row.locked),
        x1: num(row.x1),
        y1: num(row.y1),
        x2: num(row.x2),
        y2: num(row.y2),
      })),
    });
  }

  const covers = asRows(payload.covers);
  if (covers.length) {
    await prisma.cover.createMany({
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
      })),
    });
  }

  const lights = asRows(payload.lights);
  if (lights.length) {
    await prisma.mapLight.createMany({
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
    await prisma.mapNote.createMany({
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
    await prisma.mapDrawing.createMany({
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
    await prisma.fogShape.createMany({
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
    await prisma.smoke.createMany({
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
    await prisma.sceneExploration.create({
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

/* ------------------------------------------------------------------ */
/* Cała kampania                                                       */
/* ------------------------------------------------------------------ */

export interface CampaignArchive {
  campaign: Record<string, unknown>;
  /** Kto tu jest kim — sama nazwa i rola; **nigdy** skrót hasła. */
  users: { id: string; name: string; role: string }[];
  members: { userId: string; joinedAt: string }[];
  characters: (CharacterArchive & { id: string; ownerId: string | null })[];
  scenes: (SceneArchive & { active: boolean })[];
  bots: Record<string, unknown>[];
  compendium: Record<string, unknown>[];
  knowledge: Record<string, unknown>[];
  journal: Record<string, unknown>[];
  handouts: Record<string, unknown>[];
  relations: Record<string, unknown>[];
  architectures: Record<string, unknown>[];
  tokenAssets: Record<string, unknown>[];
  portraitAssets: Record<string, unknown>[];
  /** Log czatu — pomijany, gdy MG tak każe (to 4/5 objętości bazy). */
  chat: Record<string, unknown>[] | null;
}

export interface CampaignExportOptions {
  /** Czy zabrać log czatu (decyzja MG z 05.09: domyślnie tak, z przełącznikiem). */
  includeChat: boolean;
}

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
      sandbox: true,
      createdAt: true,
      // Zegar świata (etap 37) — kopia kampanii bez daty w Night City nie jest
      // kopią tej kampanii, tylko jej wersją sprzed pierwszej nocy.
      gameTime: true,
      settledMonth: true,
    },
  });
  if (!campaign) return null;

  const [characterRows, sceneRows, members] = await Promise.all([
    prisma.character.findMany({ where: { campaignId }, select: { id: true, ownerId: true } }),
    prisma.scene.findMany({ where: { campaignId }, select: { id: true, active: true } }),
    prisma.campaignMember.findMany({
      where: { campaignId },
      select: { userId: true, joinedAt: true },
    }),
  ]);

  const characters: CampaignArchive['characters'] = [];
  for (const row of characterRows) {
    const file = await exportCharacter(prisma, row.id);
    if (file) characters.push({ ...file.payload, id: row.id, ownerId: row.ownerId });
  }
  const scenes: CampaignArchive['scenes'] = [];
  for (const row of sceneRows) {
    const file = await exportScene(prisma, row.id);
    if (file) scenes.push({ ...file.payload, active: row.active });
  }

  const [bots, compendium, knowledge, journal, handouts, relations, architectures] =
    await Promise.all([
      prisma.botProfile.findMany({ where: { campaignId } }),
      prisma.compendiumEntry.findMany({ where: { campaignId } }),
      prisma.knowledgeEntry.findMany({ where: { campaignId } }),
      prisma.journalEntry.findMany({ where: { campaignId } }),
      prisma.handout.findMany({ where: { campaignId } }),
      prisma.botRelation.findMany({}),
      prisma.netArchitecture.findMany({ where: { campaignId } }),
    ]);
  const [tokenAssets, portraitAssets] = await Promise.all([
    prisma.tokenAsset.findMany({ where: { campaignId } }),
    prisma.portraitAsset.findMany({ where: { campaignId } }),
  ]);

  const chat = options.includeChat
    ? await prisma.chatMessage.findMany({ where: { campaignId }, orderBy: { id: 'asc' } })
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
    relations: plain(relations),
    architectures: plain(architectures),
    tokenAssets: plain(tokenAssets),
    portraitAssets: plain(portraitAssets),
    chat: chat ? plain(chat) : null,
  };

  const omitted = [
    'Konta i hasła — plik niesie wyłącznie nazwę i rolę, nigdy skrótu hasła.',
    'Sesje logowania i zaproszenia — wygasają, więc nie ma czego przenosić.',
    'Trwające walki i przebiegi w Sieci — stan chwili, umiera razem z nią.',
    'Pliki graficzne — w manifeście jest ich lista, same pliki leżą w `uploads/`.',
  ];
  if (!options.includeChat) {
    omitted.unshift('Czat — pominięty na życzenie MG przy eksporcie.');
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

export function archiveFileName(kind: ArchiveKind, label: string, now = new Date()): string {
  const folded = label
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (char) => DIACRITICS[char] ?? char)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const day = now.toISOString().slice(0, 10);
  return `${kind}-${folded || kind}-${day}.json`;
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
): string {
  const ascii = archiveFileName(kind, label, now);
  const day = now.toISOString().slice(0, 10);
  const pretty = `${kind}-${label.trim().slice(0, 40) || kind}-${day}.json`;
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(pretty)}`;
}
