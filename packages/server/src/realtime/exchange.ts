import type {
  ExchangeCounterpartView,
  ExchangeCounterpartsPayload,
  ExchangeCounterpartsResult,
  SessionUser,
} from '@vtt/shared';
import {
  CPRED_MELEE_REACH_M,
  ROLE_GM,
  compareExchangeCounterparts,
  cpredInventoryView,
  exchangeOptionsFor,
  parseCharacterData,
  tokenTableName,
} from '@vtt/shared';
import type { Character } from '../generated/prisma/client.js';
import { defineEvent } from './registry.js';
import { requireCampaignId } from './combat.js';
import {
  closestMetres,
  conditionsOf,
  metresBetweenPlaced,
  requireOwnCharacter,
  searchableCondition,
  tokensOf,
  type PlacedToken,
} from './inventory.js';
import { merchantsOfCampaign } from './merchant.js';
import { requireCampaignToken } from './tokens.js';
import { teamCardsWhere } from './team-cards.js';

/**
 * `exchange:counterparts` (etap 46a) — z kim mogę teraz coś wymienić.
 *
 * Jedna lista zamiast dwóch (`inventory:sources` z 38b i `trade:partners`
 * z 38c) i jedna reguła rodzaju (`exchangeOptionsFor`): kolega to handel,
 * ciało to łup, handlarz to sklep, a MG ma do tego tryb MG. Warunki zostają
 * te same, co w obu starych listach — zasięg ramienia `CPRED_MELEE_REACH_M`,
 * ukryte figury nie istnieją dla gracza, id karty NPC-a jedzie tylko do MG
 * (#40) — bo odmowy przy wykonaniu (`inventory:take`, `trade:invite`,
 * `merchant:deal`) stoją na nich dalej.
 *
 * Różnica jest jedna: **sklep przy figurze widać także z daleka**, wyszarzony
 * „Za daleko” — gracz ma wiedzieć, że do baru trzeba podejść (E2E 46a.9).
 * Między sesjami nie ma mapy: zostaje drużyna i sklepy oznaczone przez MG.
 */

/** Ile pozycji niesie lista — tyle, ile mieści się w rozwijanym nagłówku okna. */
const COUNTERPARTS_MAX = 24;

function isGmUser(user: SessionUser): boolean {
  return user.role === ROLE_GM;
}

export const exchangeCounterpartsEvent = defineEvent<
  ExchangeCounterpartsPayload,
  ExchangeCounterpartsResult
>({
  name: 'exchange:counterparts',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const isGm = isGmUser(user);
    const atTable = isGm || socket.data.atTable === true;
    const anchor = await requireOwnCharacter(prisma, campaignId, user, payload?.characterId);
    // Kto prowadzi kartę: gracz swoją, MG — NPC-a. Z kartą, którą prowadzę
    // sam, nie ma z kim handlować (`SAME_OPERATOR` w `trade:invite`).
    const operates = (card: Character) => (card.ownerId === null ? isGm : card.ownerId === user.id);

    const targets = await prisma.character.findMany({
      where: {
        AND: [
          { campaignId, id: { not: anchor.id } },
          await teamCardsWhere(prisma, campaignId, user),
        ],
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    const merchants = await merchantsOfCampaign(deps, campaignId);
    const conditions = conditionsOf(deps.ctx.statuses.list);
    const found = new Map<string, ExchangeCounterpartView>();
    const add = (view: ExchangeCounterpartView) => {
      const known = found.get(view.key);
      if (known && (known.metres ?? Infinity) <= (view.metres ?? Infinity)) return;
      found.set(view.key, view);
    };

    /* ----- Figury na scenach, na których stoję ----- */

    const listedCards = new Set<string>();
    if (atTable) {
      const mine = await tokensOf(prisma, anchor.id);
      const candidates = new Map<string, PlacedToken>();
      for (const stand of mine) {
        const neighbours = await prisma.token.findMany({
          where: {
            sceneId: stand.scene.id,
            characterId: { not: null },
            id: { not: stand.token.id },
          },
        });
        for (const token of neighbours) candidates.set(token.id, { token, scene: stand.scene });
      }
      // Figura wskazana z menu żetonu — u MG także spoza moich scen.
      if (typeof payload?.tokenId === 'string' && payload.tokenId.length > 0) {
        const { token, scene } = await requireCampaignToken(prisma, campaignId, payload.tokenId);
        candidates.set(token.id, { token, scene });
      }

      // Najbliższa figura każdej karty (umowa `ekwipunek`: karta potrafi stać
      // dwiema figurami, a serwer mierzy zasięg po najbliższej parze).
      const nearest = new Map<string, { placed: PlacedToken; metres: number | null }>();
      for (const placed of candidates.values()) {
        const characterId = placed.token.characterId;
        if (!characterId || characterId === anchor.id) continue;
        if (!isGm && placed.token.hidden) continue;
        const distances = mine
          .filter((stand) => stand.scene.id === placed.scene.id)
          .map((stand) => metresBetweenPlaced(stand, placed));
        const metres = distances.length > 0 ? Math.min(...distances) : null;
        const known = nearest.get(characterId);
        if (known && (known.metres ?? Infinity) <= (metres ?? Infinity)) continue;
        nearest.set(characterId, { placed, metres });
      }

      for (const [characterId, { placed, metres }] of nearest) {
        const card = await prisma.character.findUnique({ where: { id: characterId } });
        if (!card || card.campaignId !== campaignId) continue;
        const data = parseCharacterData(card.data, deps.ctx.cpred);
        const merchant = merchants.get(card.id) ?? null;
        const token = placed.token;
        const options = exchangeOptionsFor({
          isGm,
          anchorOwnerId: anchor.ownerId,
          ownerId: card.ownerId,
          condition: searchableCondition(token, data, conditions),
          merchant: merchant ? { closed: merchant.closed } : null,
        });
        const far = metres === null || metres > CPRED_MELEE_REACH_M;
        const tableName =
          card.ownerId !== null ? card.name : isGm ? token.name : tokenTableName(token, token.name);
        for (const option of options) {
          if (option.kind === 'trade' && operates(card)) continue;
          // Gracz nie dostaje handlu ani łupu poza zasięgiem — jak w starych
          // listach; sklep przy figurze widać wyszarzony.
          if (!isGm && far && (option.kind === 'trade' || option.kind === 'loot')) continue;
          const shop = option.kind === 'merchant' && merchant;
          const unavailable =
            option.unavailable ??
            (far && (option.kind === 'trade' || (shop && merchant.settings.access === 'reach'))
              ? 'OUT_OF_REACH'
              : undefined);
          add({
            kind: option.kind,
            key: shop ? `merchant:${merchant.row.id}` : `${option.kind}:${token.id}`,
            name: shop ? merchant.name : tableName,
            ...(metres === null ? {} : { metres }),
            tokenId: token.id,
            ...(shop ? { merchantId: merchant.row.id } : {}),
            ...(isGm || card.ownerId !== null ? { characterId: card.id } : {}),
            ...(unavailable ? { unavailable } : {}),
            ...(option.kind === 'loot'
              ? { items: cpredInventoryView(data), eddies: data.eddies }
              : {}),
          });
        }
        listedCards.add(card.id);
      }
    }

    /* ----- Drużyna poza wspólną sceną ----- */

    // Karty graczy, z którymi nie stoję na żadnej wspólnej scenie — warunku
    // zasięgu wtedy nie ma (przerwa między scenami, jak przy przekazaniu z 38b).
    // MG handluje NPC-em wyłącznie z graczami, nigdy za gracza.
    if (!isGm || anchor.ownerId === null) {
      const players = await prisma.character.findMany({
        where: { campaignId, ownerId: { not: null }, id: { not: anchor.id } },
        orderBy: { name: 'asc' },
      });
      for (const card of players) {
        if (listedCards.has(card.id) || operates(card)) continue;
        const metres = await closestMetres(prisma, anchor.id, card.id);
        if (metres !== null && atTable) continue;
        add({
          kind: 'trade',
          key: `trade:card:${card.id}`,
          name: card.name,
          characterId: card.id,
          ...(metres !== null && metres > CPRED_MELEE_REACH_M
            ? { metres, unavailable: 'OUT_OF_REACH' as const }
            : {}),
        });
      }
    }

    /* ----- Sklepy zdalne i sklepy „między sesjami” ----- */

    for (const merchant of merchants.values()) {
      if (merchant.card.id === anchor.id || found.has(`merchant:${merchant.row.id}`)) continue;
      const usable = atTable
        ? merchant.settings.access === 'remote'
        : merchant.settings.betweenSessions;
      if (!isGm && (!usable || merchant.closed !== null)) continue;
      if (isGm && merchant.closed !== null) continue;
      add({
        kind: 'merchant',
        key: `merchant:${merchant.row.id}`,
        name: merchant.name,
        merchantId: merchant.row.id,
        ...(isGm ? { characterId: merchant.card.id } : {}),
        ...(isGm && atTable && merchant.settings.access === 'reach'
          ? { unavailable: 'OUT_OF_REACH' as const }
          : {}),
      });
    }

    const counterparts = [...found.values()]
      .sort(compareExchangeCounterparts)
      .slice(0, COUNTERPARTS_MAX);
    return { counterparts, targets };
  },
});
