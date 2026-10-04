import type { Socket } from 'socket.io-client';
import { query, queryOne, tableNames } from './db.ts';
import { probe, rawSocket, type Probe, type ProbeOutcome } from './security.ts';

/**
 * T9a (`testy.md` 6.5): izolacja dwóch MG na rozegranym stanie. Stan MG-A to
 * cały punkt `po-T6`, więc „wiersze A” = wszystko, co było w bazie przed wejściem
 * MG-B. Wyrocznie macierzy zapisu: wiersze A nietknięte, żaden nowy wiersz nie
 * wskazuje obiektu A, a do gniazd B nie dociera id ani kanarek A.
 */

/** Tabele, które żyją niezależnie od kampanii: sesje logowania i linki resetu. */
const VOLATILE_TABLES = ['Session', 'PasswordReset'];
/** Kolumny, które zmienia samo wejście konta (`lastSeenAt`) — nie stan gry. */
const VOLATILE_COLUMNS: Record<string, string[]> = { User: ['lastSeenAt'] };

export type RowSnapshot = Map<string, Map<string, string>>;

function rowKey(row: Record<string, unknown>): string {
  return typeof row.id === 'string' || typeof row.id === 'number'
    ? String(row.id)
    : JSON.stringify(row);
}

function rowJson(table: string, row: Record<string, unknown>): string {
  const copy = { ...row };
  for (const column of VOLATILE_COLUMNS[table] ?? []) delete copy[column];
  return JSON.stringify(copy);
}

/** Każdy wiersz każdej tabeli (bez sesji i resetów) pod kluczem `id`. */
export function rowSnapshot(): RowSnapshot {
  const snapshot: RowSnapshot = new Map();
  for (const table of tableNames()) {
    if (VOLATILE_TABLES.includes(table)) continue;
    const rows = new Map<string, string>();
    for (const row of query(`SELECT * FROM "${table}"`)) rows.set(rowKey(row), rowJson(table, row));
    snapshot.set(table, rows);
  }
  return snapshot;
}

/** Wiersze migawki, które zmieniły się albo zniknęły (`Tabela:id`). */
export function changedRows(before: RowSnapshot): string[] {
  const now = rowSnapshot();
  const changed: string[] = [];
  for (const [table, rows] of before) {
    const current = now.get(table) ?? new Map<string, string>();
    for (const [key, json] of rows) {
      const after = current.get(key);
      if (after === undefined) changed.push(`${table}:${key} zniknął`);
      else if (after !== json) changed.push(`${table}:${key} zmieniony`);
    }
  }
  return changed;
}

/** Wiersze spoza migawki (nowe) — tabela i treść. */
export function newRows(before: RowSnapshot): { table: string; json: string }[] {
  const found: { table: string; json: string }[] = [];
  for (const [table, rows] of rowSnapshot()) {
    const old = before.get(table) ?? new Map<string, string>();
    for (const [key, json] of rows) if (!old.has(key)) found.push({ table, json });
  }
  return found;
}

/**
 * Napisowe id wierszy migawki (cuid, ≥ 20 znaków — liczbowe id czatu dałyby
 * fałszywe trafienia) — kanarki „obiekt istnieje” dla drugiej strony.
 */
export function stringIds(snapshot: RowSnapshot): string[] {
  const ids = new Set<string>();
  for (const [table, rows] of snapshot) {
    if (VOLATILE_TABLES.includes(table)) continue;
    for (const key of rows.keys()) if (/^[a-z0-9]{20,}$/i.test(key)) ids.add(key);
  }
  return [...ids];
}

/** Adresy plików kampanii (`/uploads/campaigns/<id>/…`) z każdego pola bazy. */
export function uploadUrls(campaignId: string): string[] {
  const pattern = new RegExp(`/uploads/campaigns/${campaignId}/[\\w./-]+?\\.\\w{2,5}`, 'g');
  const found = new Set<string>();
  for (const table of tableNames()) {
    for (const row of query(`SELECT * FROM "${table}"`)) {
      for (const value of Object.values(row)) {
        if (typeof value !== 'string' || !value.includes('/uploads/campaigns/')) continue;
        for (const match of value.matchAll(pattern)) found.add(match[0]);
      }
    }
  }
  return [...found].sort();
}

/** Pierwsze id z tabeli w kampanii (przez jej kolumnę albo złączenie) — albo nic. */
function firstId(sql: string, ...params: string[]): string | undefined {
  return queryOne<{ id: string }>(sql, ...params)?.id;
}

export interface CampaignObjects {
  campaign: string;
  scene?: string;
  token?: string;
  character?: string;
  user?: string;
  bot?: string;
  handout?: string;
  journal?: string;
  knowledge?: string;
  compendium?: string;
  table?: string;
  tableRow?: string;
  wall?: string;
  cover?: string;
  light?: string;
  note?: string;
  drawing?: string | number;
  smoke?: string;
  zone?: string;
  architecture?: string;
  accessPoint?: string;
  run?: string;
  combatant?: string;
  draft?: string;
  tokenAsset?: string;
  portraitAsset?: string;
  invitation?: string;
  message?: number;
}

/** Po jednym obiekcie każdego rodzaju z kampanii — cele macierzy zapisu. */
export function campaignObjects(campaignId: string, playerName: string): CampaignObjects {
  const inScene = (table: string) =>
    firstId(
      `SELECT x.id FROM "${table}" x JOIN Scene s ON s.id = x.sceneId WHERE s.campaignId = ? LIMIT 1`,
      campaignId,
    );
  const own = (table: string) =>
    firstId(`SELECT id FROM "${table}" WHERE campaignId = ? LIMIT 1`, campaignId);
  return {
    campaign: campaignId,
    scene: firstId(
      'SELECT id FROM Scene WHERE campaignId = ? ORDER BY active DESC LIMIT 1',
      campaignId,
    ),
    token: firstId(
      `SELECT t.id FROM Token t JOIN Scene s ON s.id = t.sceneId
        WHERE s.campaignId = ? AND t.characterId IS NOT NULL LIMIT 1`,
      campaignId,
    ),
    character: firstId(
      `SELECT c.id FROM Character c JOIN User u ON u.id = c.ownerId
        WHERE c.campaignId = ? AND u.name = ? LIMIT 1`,
      campaignId,
      playerName,
    ),
    user: firstId(
      `SELECT u.id FROM User u JOIN CampaignMember m ON m.userId = u.id
        WHERE m.campaignId = ? AND u.name = ? LIMIT 1`,
      campaignId,
      playerName,
    ),
    bot: own('BotProfile'),
    handout: own('Handout'),
    journal: own('JournalEntry'),
    knowledge: own('KnowledgeEntry'),
    compendium: own('CompendiumEntry'),
    table: own('RandomTable'),
    tableRow: firstId(
      `SELECT r.id FROM RandomTableRow r JOIN RandomTable t ON t.id = r.tableId
        WHERE t.campaignId = ? LIMIT 1`,
      campaignId,
    ),
    wall: inScene('Wall'),
    cover: inScene('Cover'),
    light: inScene('MapLight'),
    note: inScene('MapNote'),
    drawing: inScene('MapDrawing'),
    smoke: inScene('Smoke'),
    zone: inScene('DefenseZone'),
    architecture: own('NetArchitecture'),
    accessPoint: inScene('NetAccessPoint'),
    run: own('NetRun'),
    combatant: firstId(
      `SELECT c.id FROM Combatant c JOIN Combat k ON k.id = c.combatId
        JOIN Scene s ON s.id = k.sceneId WHERE s.campaignId = ? LIMIT 1`,
      campaignId,
    ),
    draft: own('CharacterDraft'),
    tokenAsset: own('TokenAsset'),
    portraitAsset: own('PortraitAsset'),
    invitation: own('Invitation'),
    message: queryOne<{ id: number }>(
      'SELECT id FROM ChatMessage WHERE campaignId = ? ORDER BY id DESC LIMIT 1',
      campaignId,
    )?.id,
  };
}

/**
 * Klucz ładunku → obiekt kampanii. Dwa warianty, bo `entryId` i `assetId`
 * znaczą w różnych zdarzeniach co innego (dziennik albo baza wiedzy, żeton
 * albo portret). Klucze wnętrza obiektu (`skillId`, `weaponRowId`…) zostają
 * puste — granica własności leży na obiekcie, nie na jego wierszu.
 */
export function idPayload(
  objects: CampaignObjects,
  keys: readonly string[],
  variant: 1 | 2,
): Record<string, unknown> {
  const pick = (key: string): unknown => {
    const k = key.toLowerCase();
    const one = (value: unknown) => value;
    const many = (value: unknown) => (value === undefined ? undefined : [value]);
    const list = k.endsWith('ids');
    const wrap = list ? many : one;
    const stem = list ? k.slice(0, -1) : k;
    if (stem.endsWith('messageid')) return wrap(objects.message);
    if (stem.endsWith('tokenid')) return wrap(objects.token);
    if (stem === 'sceneid') return wrap(objects.scene);
    if (stem.endsWith('characterid') || stem === 'patientid') return wrap(objects.character);
    if (stem === 'campaignid') return wrap(objects.campaign);
    if (stem.endsWith('botid')) return wrap(objects.bot);
    if (
      stem.endsWith('userid') ||
      stem.endsWith('ownerid') ||
      ['authorid', 'memberid', 'surgeonid', 'recipientid'].includes(stem)
    ) {
      return wrap(objects.user);
    }
    if (stem === 'handoutid') return wrap(objects.handout);
    if (stem === 'entryid') return wrap(variant === 1 ? objects.journal : objects.knowledge);
    if (stem === 'compendiumid') return wrap(objects.compendium);
    if (stem === 'tableid' || stem === 'subtableid') return wrap(objects.table);
    if (stem === 'rowid') return wrap(objects.tableRow);
    if (stem === 'wallid') return wrap(objects.wall);
    if (stem.endsWith('coverid')) return wrap(objects.cover);
    if (stem === 'lightid') return wrap(objects.light);
    if (stem === 'noteid') return wrap(objects.note);
    if (stem === 'drawingid') return wrap(objects.drawing);
    if (stem === 'smokeid') return wrap(objects.smoke);
    if (stem === 'zoneid') return wrap(objects.zone);
    if (stem === 'architectureid') return wrap(objects.architecture);
    if (stem === 'accesspointid' || stem === 'deviceid') return wrap(objects.accessPoint);
    if (stem === 'runid') return wrap(objects.run);
    if (stem.endsWith('combatantid')) return wrap(objects.combatant);
    if (stem === 'draftid') return wrap(objects.draft);
    if (stem === 'assetid') {
      return wrap(variant === 1 ? objects.tokenAsset : objects.portraitAsset);
    }
    return undefined;
  };
  const payload: Record<string, unknown> = {};
  for (const key of keys) {
    const value = pick(key);
    if (value !== undefined) payload[key] = value;
  }
  return payload;
}

/**
 * Gołe `id` zdarzeń CRUD (`wall:delete { id }`, `knowledge:upsert { id }`…) —
 * obiekt rodzaju z przedrostka nazwy zdarzenia; bez dopasowania figura albo scena.
 */
function bareId(objects: CampaignObjects, event: string, variant: 1 | 2): unknown {
  const byDomain: Record<string, unknown> = {
    scene: objects.scene,
    token: objects.token,
    character: objects.character,
    wall: objects.wall,
    cover: objects.cover,
    light: objects.light,
    note: objects.note,
    drawing: objects.drawing,
    smoke: objects.smoke,
    zone: objects.zone,
    knowledge: objects.knowledge,
    journal: objects.journal,
    handout: objects.handout,
    bot: objects.bot,
    table: objects.table,
    compendium: objects.compendium,
    net: objects.architecture,
    netpoint: objects.accessPoint,
    netrun: objects.run,
    portrait: objects.portraitAsset,
  };
  const domain = event.split(':')[0]!;
  return byDomain[domain] ?? (variant === 1 ? objects.token : objects.scene);
}

/** Trzy próby na zdarzenie: id A (dwa warianty) i id A ze śmieciem `null` w reszcie pól. */
export function ownershipProbes(
  objects: CampaignObjects,
  keys: readonly string[],
  event: string,
): Probe[] {
  const first = { ...idPayload(objects, keys, 1), id: bareId(objects, event, 1) };
  const second = { ...idPayload(objects, keys, 2), id: bareId(objects, event, 2) };
  const junk = Object.fromEntries(keys.map((key) => [key, null]));
  return [
    { label: 'id A (1)', payload: first },
    { label: 'id A (2)', payload: second },
    { label: 'id A + null', payload: { ...junk, ...first } },
  ];
}

/**
 * Surowe gniazdo aktora z zapisem **wszystkiego**, co do niego przyszło
 * (`onAny`) — podsłuch po stronie serwera dla macierzy, obok podsłuchu karty.
 */
export class TappedSocket {
  readonly received: string[] = [];
  socket: Socket | null = null;
  sync: unknown = null;

  constructor(private readonly cookie: string) {}

  async connect(): Promise<this> {
    const { socket, error, sync } = await rawSocket(this.cookie);
    if (!socket) throw new Error(`E2E: raw socket refused (${error})`);
    this.socket = socket;
    this.sync = sync;
    this.received.push(JSON.stringify(sync));
    socket.onAny((event: string, ...args: unknown[]) => {
      this.received.push(`${event} ${JSON.stringify(args)}`);
    });
    return this;
  }

  /** Próba z ponownym połączeniem, gdy zdarzenie zerwało gniazdo. */
  async probe(event: string, sample: Probe): Promise<ProbeOutcome> {
    if (!this.socket?.connected) await this.connect();
    const outcome = await probe(this.socket!, event, sample);
    if (outcome.kind === 'ack') this.received.push(`ack ${event} ${JSON.stringify(outcome.ack)}`);
    return outcome;
  }

  found(codes: readonly string[]): string[] {
    return codes.filter((code) => this.received.some((text) => text.includes(code)));
  }

  close(): void {
    this.socket?.disconnect();
  }
}

/** Wiersze jednej kampanii: ona sama, wiersze z jej `campaignId` i wiersze jej scen (`sceneId`). */
function campaignRows(campaignId: string): Record<string, unknown>[] {
  const rows = query('SELECT * FROM Campaign WHERE id = ?', campaignId);
  const scenes = query<{ id: string }>('SELECT id FROM Scene WHERE campaignId = ?', campaignId).map(
    (row) => row.id,
  );
  for (const table of tableNames()) {
    if (table === 'Campaign') continue;
    const columns = query<{ name: string }>(`PRAGMA table_info("${table}")`).map((c) => c.name);
    if (columns.includes('campaignId')) {
      rows.push(...query(`SELECT * FROM "${table}" WHERE campaignId = ?`, campaignId));
    } else if (columns.includes('sceneId') && scenes.length > 0) {
      rows.push(
        ...query(
          `SELECT * FROM "${table}" WHERE sceneId IN (${scenes.map(() => '?').join(', ')})`,
          ...scenes,
        ),
      );
    }
  }
  return rows;
}

const CANARY = /KANAREK-[\w-]+?-[0-9A-F]{4}/g;

/**
 * Tajne jednej kampanii (T9b) na bazie z dwiema kampaniami: napisowe id jej
 * wierszy, konta, które są członkami **tylko** jej, i kanarki z treści jej
 * wierszy. Dla drugiej grupy to kanarki „obiekt istnieje” — jak `stringIds`
 * w T9a, gdzie cała baza była kampanią A.
 */
export function campaignSecrets(campaignId: string): { ids: string[]; canaries: string[] } {
  const ids = new Set<string>();
  const canaries = new Set<string>();
  for (const row of campaignRows(campaignId)) {
    if (typeof row.id === 'string' && /^[a-z0-9]{20,}$/i.test(row.id)) ids.add(row.id);
    for (const value of Object.values(row)) {
      if (typeof value !== 'string' || !value.includes('KANAREK-')) continue;
      for (const match of value.matchAll(CANARY)) canaries.add(match[0]);
    }
  }
  for (const { userId } of query<{ userId: string }>(
    `SELECT userId FROM CampaignMember WHERE campaignId = ?
       AND userId NOT IN (SELECT userId FROM CampaignMember WHERE campaignId <> ?)`,
    campaignId,
    campaignId,
  )) {
    ids.add(userId);
  }
  return { ids: [...ids], canaries: [...canaries] };
}
