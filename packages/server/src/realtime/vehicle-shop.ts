import type { VehicleBuyPayload, VehicleBuyResult } from '@vtt/shared';
import {
  LEDGER_KIND_LABELS,
  ROLE_GM,
  cpredVehicleForSale,
  cpredVehicleFromCatalog,
  cpredVehicleQuote,
  formatEddies,
  mergeCharacterData,
  parseCharacterData,
  shopTierOf,
} from '@vtt/shared';
import { createVehicle, toVehicleView } from '../vehicles.js';
import { emitCharacterUpsert, refuseAwaitingGm, toCharacterView } from './character-io.js';
import { refuseInCombat } from './combat-lock.js';
import { campaignEntry } from './compendium.js';
import { applyBalance, postEconomyCard, requireWallet } from './economy.js';
import { campaignCatalogShopping, requireVehicleCounter, withCampaignLock } from './merchant.js';
import { RealtimeError, defineEvent } from './registry.js';
import { campaignShopTier, campaignShopTierOverrides, requireUnlockedTier } from './shop.js';
import { emitTokensOfCharacter } from './tokens.js';
import { emitVehicleUpsert } from './vehicles.js';

/**
 * Zakup auta (etap 67, zlecenie MG z 06.11.2026) — `vehicle:buy`.
 *
 * Pojazd to `Vehicle`, a nie wiersz karty, więc nie idzie przez `economy:buy`
 * ani przez koszyk handlarza: jedno zdarzenie, dwie drogi do tej samej lady.
 *
 *  - **Kompendium** (bez `merchantId`): jak „Kup” każdej rzeczy — gracz tylko
 *    przy „Kup: wszędzie” i do poziomu sklepu odblokowanego w kampanii.
 *  - **Handlarz** (`merchantId`): bramki „Zapłać” (dostęp, otwarty sklep,
 *    zasięg) i model w zakresie „Pojazdy”; cena z mnożnikiem sklepu, a zapłata
 *    ląduje w kasie handlarza, chyba że kasa jest „bez dna”.
 *
 * Kupuje się wyłącznie **model na sprzedaż** (`cpredVehicleForSale`): klasa
 * z podręcznika nie ma wyglądu, a służby daje MG. Auto dostaje nazwę i wygląd
 * modelu, liczby klasy i właściciela — kartę kupującego. Gotówka, targ Fixera
 * i nowy pojazd zapisują się w jednej transakcji.
 */
export const vehicleBuyEvent = defineEvent<VehicleBuyPayload, VehicleBuyResult>({
  name: 'vehicle:buy',
  handler: async ({ deps, socket, user, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    const prisma = deps.ctx.prisma;
    const buyer = await requireWallet(deps, campaign.id, user, payload?.characterId);
    refuseAwaitingGm(buyer, user);
    await refuseInCombat(prisma, campaign.id, user);
    const entry = await campaignEntry(
      deps,
      campaign.id,
      typeof payload?.entryId === 'string' ? payload.entryId : '',
    );
    if (!entry) throw new RealtimeError('ENTRY_NOT_FOUND');
    if (!cpredVehicleForSale(entry)) throw new RealtimeError('NOT_PURCHASABLE');
    const expectPrice = payload?.expectPrice;
    if (typeof expectPrice !== 'number' || !Number.isInteger(expectPrice)) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const atCounter = payload?.merchantId !== undefined;

    // Kompendium: te same bramki co `economy:buy`. MG (i bot na jego koncie)
    // kupuje przez każdy poziom — pokrętło odmierza tempo stołu, nie MG.
    if (!atCounter && user.role !== ROLE_GM) {
      if ((await campaignCatalogShopping(prisma, campaign.id)) === 'merchants') {
        throw new RealtimeError('CATALOG_CLOSED');
      }
      const overrides = await campaignShopTierOverrides(prisma, campaign.id);
      requireUnlockedTier(
        shopTierOf(entry, { overrides }),
        await campaignShopTier(prisma, campaign.id),
      );
    }

    const outcome = await withCampaignLock(campaign.id, () =>
      prisma.$transaction(async (tx) => {
        const counter = atCounter
          ? await requireVehicleCounter(
              deps,
              tx,
              socket,
              campaign.id,
              payload?.merchantId,
              buyer.id,
              entry,
            )
          : null;
        // Karta czytana w transakcji: saldo i targ z tej chwili, nie z początku.
        const card = await tx.character.findUnique({ where: { id: buyer.id } });
        if (!card || card.campaignId !== campaign.id) {
          throw new RealtimeError('CHARACTER_NOT_FOUND');
        }
        const data = parseCharacterData(card.data, deps.ctx.cpred);
        const struck = data.haggle && data.haggle.discount > 0 ? data.haggle : null;
        const quote = cpredVehicleQuote(entry, {
          ...(counter ? { priceMul: counter.priceMul } : {}),
          discount: struck?.discount ?? 0,
        });
        if (!quote) throw new RealtimeError('NOT_PURCHASABLE');
        if (quote.price !== expectPrice) throw new RealtimeError('QUOTE_CHANGED');
        if (data.eddies < quote.price) throw new RealtimeError('NOT_ENOUGH_EDDIES');

        const where = counter ? `${counter.name}: ` : '';
        const paid = await applyBalance(
          deps,
          campaign.id,
          card,
          // Targ schodzi w tym samym zapisie, który go wydaje (jak `economy:buy`).
          struck ? mergeCharacterData(data, { haggle: null }) : data,
          {
            kind: 'purchase',
            amount: -quote.price,
            label: `${where}${entry.name}`,
            ...(counter ? { counterpartyId: counter.card.id } : {}),
          },
          user.id,
          { tx, emit: false },
        );
        if (counter && !counter.cashInfinite) {
          await applyBalance(
            deps,
            campaign.id,
            counter.card,
            counter.data,
            {
              kind: 'sale',
              amount: quote.price,
              label: `sprzedaż: ${entry.name} — ${card.name}`,
              counterpartyId: card.id,
            },
            user.id,
            { tx, emit: false },
          );
        }
        const vehicle = await createVehicle(
          tx,
          campaign.id,
          card.id,
          entry.name,
          cpredVehicleFromCatalog(entry),
          entry.art,
        );
        return {
          card,
          counter,
          vehicle,
          balance: paid.eddies,
          quote,
          discount: struck?.discount ?? 0,
        };
      }),
    );

    // Emisje po transakcji: karty obu stron (karta handlarza odświeża też
    // półkę oglądającym — `notifyMerchantCard`) i nowy pojazd.
    const touched = [outcome.card.id, ...(outcome.counter ? [outcome.counter.card.id] : [])];
    for (const id of touched) {
      const saved = await prisma.character.findUniqueOrThrow({ where: { id } });
      await emitCharacterUpsert(deps, campaign.id, toCharacterView(saved, deps.ctx.cpred));
      await emitTokensOfCharacter(deps, campaign.id, saved);
    }
    await emitVehicleUpsert(deps, campaign.id, outcome.vehicle);

    const where = outcome.counter ? ` u: ${outcome.counter.name}` : '';
    await postEconomyCard(
      deps,
      campaign.id,
      user,
      {
        title: `${LEDGER_KIND_LABELS.purchase} — ${entry.name}`,
        lines: [
          `${outcome.card.name} — ${entry.name}${where} · −${formatEddies(outcome.quote.price)} ed · saldo ${formatEddies(outcome.balance)} ed`,
          ...(outcome.discount > 0
            ? [`Targ Fixera −${outcome.discount}% · cena ${formatEddies(outcome.quote.listed)} ed`]
            : []),
          'Auto czeka w sekcji „Pojazdy” na karcie (zakładka Ekwipunek).',
        ],
      },
      [outcome.card.ownerId],
    );
    return {
      vehicle: toVehicleView(outcome.vehicle),
      balance: outcome.balance,
      price: outcome.quote.price,
    };
  },
});
