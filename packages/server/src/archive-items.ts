import type { ArchiveFile, CpredRegistry } from '@vtt/shared';
import {
  archiveRefusal,
  isContainerCardJson,
  matchArchiveName,
  parseBotData,
  sanitizeBotName,
} from '@vtt/shared';
import type { PrismaClient } from './db.js';
import {
  bool,
  buildManifest,
  exportCharacter,
  importCharacter,
  num,
  parseJsonColumn,
  str,
  stringifyJsonColumn,
  type CharacterArchive,
  type ImportRefusal,
} from './archive.js';

/**
 * Pojedyncze rzeczy do przenoszenia między kampaniami jednego MG (etap 57c,
 * decyzja MG 10): sklep z kartą handlarza, profil bota z relacjami i karty
 * wszystkich graczy kampanii jedną paczką.
 *
 * **Wszystko wchodzi jako nowe**, jak karta i scena z etapu 33 — nic nie
 * nadpisuje tego, co w kampanii docelowej już stoi.
 *
 * **Bot zna rozmówców po imieniu, nie po id.** Relacja i karta towarzysza
 * wskazują karty kampanii źródłowej; w docelowej te same postacie mają inne
 * id (wczytanie kampanii 57a nadaje nowe). Plik niesie więc imię, a import
 * szuka karty o tym imieniu (`matchArchiveName`, tylko jednoznacznie). Czego
 * nie znajdzie, przepada i trafia do zdania dla MG.
 */

/* ------------------------------------------------------------------ */
/* Sklep                                                               */
/* ------------------------------------------------------------------ */

export interface ShopArchive {
  /** Ustawienia handlarza (`Merchant`) z nakładką MG na wiersze towaru. */
  merchant: Record<string, unknown>;
  /** Karta handlarza — jej ekwipunek jest towarem. */
  character: CharacterArchive;
}

export async function exportShop(
  prisma: PrismaClient,
  merchantId: string,
): Promise<ArchiveFile<ShopArchive> | null> {
  const row = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: {
      characterId: true,
      sign: true,
      open: true,
      access: true,
      betweenSessions: true,
      priceMul: true,
      buyBackPct: true,
      cashInfinite: true,
      rows: true,
    },
  });
  if (!row) return null;
  const card = await exportCharacter(prisma, row.characterId);
  if (!card) return null;
  const { characterId: _card, rows, ...settings } = row;
  const payload: ShopArchive = {
    merchant: { ...settings, rows: parseJsonColumn(rows) },
    character: card.payload,
  };
  const manifest = buildManifest(
    'shop',
    card.manifest.campaignName,
    payload,
    { ledger: card.payload.ledger.length },
    [
      'Figura handlarza na scenie — sklep „przy figurze” trzeba po wczytaniu postawić na mapie.',
      'Sklep wchodzi zamknięty — otwiera go MG na karcie handlarza.',
    ],
  );
  return { manifest, payload };
}

export async function importShop(
  prisma: PrismaClient,
  registry: CpredRegistry,
  file: unknown,
  options: { campaignId: string },
): Promise<{ id: string; characterId: string; name: string } | ImportRefusal> {
  const refusal = archiveRefusal(file, 'shop');
  if (refusal) return { code: refusal };
  const payload = (file as ArchiveFile<Partial<ShopArchive>>).payload;
  if (!payload?.character || !payload.merchant || typeof payload.merchant !== 'object') {
    return { code: 'ARCHIVE_MALFORMED' };
  }
  // Karta handlarza jest kartą NPC-a — nawet gdy w kampanii źródłowej
  // prowadził ją gracz, sklep w nowej kampanii prowadzi MG.
  const card = await importCharacter(
    prisma,
    registry,
    {
      manifest: { ...(file as ArchiveFile<unknown>).manifest, kind: 'character' },
      payload: payload.character,
    },
    { campaignId: options.campaignId, ownerId: null },
  );
  if ('code' in card) return card;
  const source = payload.merchant;
  const created = await prisma.merchant.create({
    data: {
      campaignId: options.campaignId,
      characterId: card.id,
      sign: str(source.sign).slice(0, 64),
      // Sklep nie otwiera się graczom sam w chwili wczytania (rozstrzygnięcie 57c).
      open: false,
      access: source.access === 'remote' ? 'remote' : 'reach',
      betweenSessions: bool(source.betweenSessions),
      priceMul: num(source.priceMul, 100),
      buyBackPct: num(source.buyBackPct, 50),
      cashInfinite: bool(source.cashInfinite),
      // Nakładka jest kluczowana id wierszy karty, a te jadą w `data` bez zmian.
      rows: stringifyJsonColumn(source.rows, '{}'),
    },
    select: { id: true },
  });
  const name = str(source.sign) || (await cardName(prisma, card.id));
  return { id: created.id, characterId: card.id, name };
}

async function cardName(prisma: PrismaClient, id: string): Promise<string> {
  const row = await prisma.character.findUnique({ where: { id }, select: { name: true } });
  return row?.name ?? 'Sklep';
}

/* ------------------------------------------------------------------ */
/* Profil bota                                                         */
/* ------------------------------------------------------------------ */

export interface BotArchive {
  bot: { name: string; portraitUrl: string | null; archived: boolean; data: unknown };
  /** Karta towarzysza (bot z własnymi statystykami) — po imieniu. */
  character: { name: string } | null;
  /** Relacje z postaciami — po imieniu postaci. */
  relations: { characterName: string; value: number; note: string }[];
}

export async function exportBot(
  prisma: PrismaClient,
  botId: string,
): Promise<ArchiveFile<BotArchive> | null> {
  const row = await prisma.botProfile.findUnique({
    where: { id: botId },
    select: {
      name: true,
      portraitUrl: true,
      archived: true,
      data: true,
      character: { select: { name: true } },
      campaign: { select: { name: true } },
      relations: {
        select: { value: true, note: true, character: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!row) return null;
  const payload: BotArchive = {
    bot: {
      name: row.name,
      portraitUrl: row.portraitUrl,
      archived: row.archived,
      data: parseJsonColumn(row.data),
    },
    character: row.character,
    relations: row.relations.map((relation) => ({
      characterName: relation.character.name,
      value: relation.value,
      note: relation.note,
    })),
  };
  const manifest = buildManifest(
    'bot',
    row.campaign.name,
    payload,
    { relations: payload.relations.length },
    [
      'Rozmówcy po id — relacje i karta towarzysza wracają do kart o tym samym imieniu w kampanii docelowej; reszta przepada.',
      'Przypięcie do sceny i to, czy bot jest aktywny — wczytany bot czeka nieaktywny, bez sceny.',
      'Dziennik decyzji i wiersze czatu bota — należą do kampanii, nie do profilu.',
    ],
  );
  return { manifest, payload };
}

export interface BotImportSummary {
  id: string;
  name: string;
  relations: number;
  /** Imiona rozmówców, których w kampanii docelowej nie ma (albo są dwa). */
  missing: string[];
  /** Karta towarzysza z pliku, której tu nie ma. */
  missingCharacter: string | null;
}

export async function importBot(
  prisma: PrismaClient,
  file: unknown,
  options: { campaignId: string },
): Promise<BotImportSummary | ImportRefusal> {
  const refusal = archiveRefusal(file, 'bot');
  if (refusal) return { code: refusal };
  const payload = (file as ArchiveFile<Partial<BotArchive>>).payload;
  const source = payload?.bot;
  if (!source || typeof source !== 'object') return { code: 'ARCHIVE_MALFORMED' };
  const name = sanitizeBotName(source.name);
  if (!name) return { code: 'ARCHIVE_EMPTY' };

  const [cards, members] = await Promise.all([
    prisma.character.findMany({
      where: { campaignId: options.campaignId, template: false },
      select: { id: true, name: true, data: true },
    }),
    prisma.campaignMember.findMany({
      where: { campaignId: options.campaignId },
      select: { userId: true },
    }),
  ]);
  // Skrzynia i stos (46b) to też karty — z nimi bot nie rozmawia.
  const people = cards.filter((card) => !isContainerCardJson(card.data));
  const data = parseBotData(source.data);
  // Sterujący gracz (20a) to konto — zostaje tylko, gdy siedzi w tej kampanii.
  if (data.controllerUserId && !members.some((m) => m.userId === data.controllerUserId)) {
    data.controllerUserId = null;
  }

  const wantedCharacter = payload.character?.name ?? null;
  const linked = wantedCharacter ? matchArchiveName(people, wantedCharacter) : null;
  const created = await prisma.botProfile.create({
    data: {
      campaignId: options.campaignId,
      name,
      portraitUrl: typeof source.portraitUrl === 'string' ? source.portraitUrl : null,
      data: JSON.stringify(data),
      active: false,
      archived: source.archived === true,
      characterId: linked?.id ?? null,
    },
    select: { id: true },
  });

  const missing: string[] = [];
  const kept = new Map<string, { characterId: string; value: number; note: string }>();
  for (const relation of Array.isArray(payload.relations) ? payload.relations : []) {
    const target = matchArchiveName(people, str(relation?.characterName));
    if (!target) {
      if (relation?.characterName) missing.push(str(relation.characterName));
      continue;
    }
    kept.set(target.id, {
      characterId: target.id,
      value: Math.max(-3, Math.min(3, Math.trunc(num(relation.value)))),
      note: str(relation.note).slice(0, 500),
    });
  }
  if (kept.size > 0) {
    await prisma.botRelation.createMany({
      data: [...kept.values()].map((row) => ({ botId: created.id, ...row })),
    });
  }
  return {
    id: created.id,
    name,
    relations: kept.size,
    missing,
    missingCharacter: wantedCharacter && !linked ? wantedCharacter : null,
  };
}

/* ------------------------------------------------------------------ */
/* Karty graczy                                                        */
/* ------------------------------------------------------------------ */

export interface PlayerCardsArchive {
  characters: CharacterArchive[];
}

/** Karty graczy kampanii — z właścicielem albo czekające na gracza (57a). */
export async function exportPlayerCards(
  prisma: PrismaClient,
  campaignId: string,
): Promise<ArchiveFile<PlayerCardsArchive> | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { name: true },
  });
  if (!campaign) return null;
  const rows = await prisma.character.findMany({
    where: { campaignId, OR: [{ ownerId: { not: null } }, { pendingOwnerName: { not: null } }] },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  const characters: CharacterArchive[] = [];
  for (const row of rows) {
    const card = await exportCharacter(prisma, row.id);
    if (card) characters.push(card.payload);
  }
  const payload: PlayerCardsArchive = { characters };
  const manifest = buildManifest(
    'characters',
    campaign.name,
    payload,
    { characters: characters.length },
    [
      'Karty NPC-ów, wzorce statystów i pojemniki — paczka niesie wyłącznie karty graczy.',
      'Konta graczy — każda karta niesie id i imię swojego gracza; wraca do niego tylko w kampanii, w której on siedzi, inaczej czeka na gracza.',
    ],
  );
  return { manifest, payload };
}

export async function importPlayerCards(
  prisma: PrismaClient,
  registry: CpredRegistry,
  file: unknown,
  options: { campaignId: string; gmId: string },
): Promise<{ ids: string[]; returned: number; pending: string[] } | ImportRefusal> {
  const refusal = archiveRefusal(file, 'characters');
  if (refusal) return { code: refusal };
  const payload = (file as ArchiveFile<Partial<PlayerCardsArchive>>).payload;
  const cards = Array.isArray(payload?.characters) ? payload.characters : null;
  if (!cards) return { code: 'ARCHIVE_MALFORMED' };
  if (cards.length === 0) return { code: 'ARCHIVE_EMPTY' };
  const manifest = (file as ArchiveFile<unknown>).manifest;
  const ids: string[] = [];
  const pending: string[] = [];
  let returned = 0;
  for (const card of cards) {
    const result = await importCharacter(
      prisma,
      registry,
      { manifest: { ...manifest, kind: 'character' }, payload: card },
      { campaignId: options.campaignId, gmId: options.gmId },
    );
    // Karta bez imienia nie zatrzymuje reszty paczki.
    if ('code' in result) continue;
    ids.push(result.id);
    if (result.pendingOwner) pending.push(result.pendingOwner);
    else if (result.ownerId) returned += 1;
  }
  if (ids.length === 0) return { code: 'ARCHIVE_EMPTY' };
  return { ids, returned, pending };
}
