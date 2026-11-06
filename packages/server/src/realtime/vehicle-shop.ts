import type {
  SessionUser,
  VehicleBuyPayload,
  VehicleBuyResult,
  VehicleRepairPayload,
  VehicleUpgradeBuyPayload,
} from '@vtt/shared';
import {
  CPRED_VEHICLE_DAMAGE,
  LEDGER_KIND_LABELS,
  ROLE_GM,
  cpredVehicleForSale,
  cpredVehicleFromCatalog,
  cpredVehiclePatch,
  cpredVehicleQuote,
  cpredVehicleRepairQuote,
  cpredVehicleRepaired,
  cpredVehicleUpgradeBuyProblem,
  cpredVehicleUpgradeForSale,
  formatEddies,
  mergeCharacterData,
  parseCharacterData,
  readCpredVehicle,
  shopTierOf,
  type CompendiumEntry,
} from '@vtt/shared';
import type { Character, Prisma, Vehicle } from '../generated/prisma/client.js';
import { createVehicle, toVehicleView, vehicleSeatColumns } from '../vehicles.js';
import { emitCharacterUpsert, refuseAwaitingGm, toCharacterView } from './character-io.js';
import { refuseInCombat } from './combat-lock.js';
import { campaignEntry } from './compendium.js';
import { applyBalance, postEconomyCard, requireWallet } from './economy.js';
import { campaignCatalogShopping, requireVehicleCounter, withCampaignLock } from './merchant.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { campaignShopTier, campaignShopTierOverrides, requireUnlockedTier } from './shop.js';
import { emitTokensOfCharacter } from './tokens.js';
import { emitVehicleUpsert } from './vehicles.js';

/**
 * Zakup auta (etap 67) oraz warsztat — ulepszenia i naprawa auta (etap 68),
 * zlecenia MG z 06.11.2026.
 *
 * Pojazd to `Vehicle`, a nie wiersz karty, więc nic stąd nie idzie przez
 * `economy:buy` ani przez koszyk handlarza: osobne zdarzenia, ta sama lada.
 *
 *  - **Kompendium** (bez `merchantId`): jak „Kup” każdej rzeczy — gracz tylko
 *    przy „Kup: wszędzie” i do poziomu sklepu odblokowanego w kampanii.
 *  - **Handlarz** (`merchantId`): bramki „Zapłać” (dostęp, otwarty sklep,
 *    zasięg) i towar w zakresie handlarza („Pojazdy” albo „Ulepszenia
 *    pojazdów”); cena z mnożnikiem sklepu, a zapłata ląduje w kasie
 *    handlarza, chyba że kasa jest „bez dna”. Naprawa — wyłącznie tutaj.
 *
 * Gotówka, targ Fixera i zmiana pojazdu zapisują się w jednej transakcji.
 */

type Tx = Prisma.TransactionClient;
type Counter = Awaited<ReturnType<typeof requireVehicleCounter>>;

/** Kompendium: te same bramki co `economy:buy`. MG kupuje przez każdy poziom. */
async function requireCatalogPurchase(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  entry: CompendiumEntry,
): Promise<void> {
  if (user.role === ROLE_GM) return;
  const prisma = deps.ctx.prisma;
  if ((await campaignCatalogShopping(prisma, campaignId)) === 'merchants') {
    throw new RealtimeError('CATALOG_CLOSED');
  }
  const overrides = await campaignShopTierOverrides(prisma, campaignId);
  requireUnlockedTier(shopTierOf(entry, { overrides }), await campaignShopTier(prisma, campaignId));
}

function requireExpectPrice(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new RealtimeError('BAD_REQUEST');
  return value;
}

/**
 * Płaci za auto, ulepszenie albo naprawę: karta czytana w transakcji (saldo
 * i targ z tej chwili), cena z `quoteOf` (ta sama funkcja co przycisk),
 * `QUOTE_CHANGED`, gdy przycisk pokazał co innego, targ Fixera schodzi w tym
 * samym zapisie, a u lady zapłata trafia do kasy handlarza.
 */
async function payAtCounter(
  deps: RealtimeDeps,
  tx: Tx,
  campaignId: string,
  user: SessionUser,
  buyerId: string,
  counter: Counter | null,
  expectPrice: number,
  label: string,
  quoteOf: (options: {
    priceMul?: number;
    discount: number;
  }) => { listed: number; price: number } | null,
): Promise<{
  card: Character;
  balance: number;
  quote: { listed: number; price: number };
  discount: number;
}> {
  const card = await tx.character.findUnique({ where: { id: buyerId } });
  if (!card || card.campaignId !== campaignId) throw new RealtimeError('CHARACTER_NOT_FOUND');
  const data = parseCharacterData(card.data, deps.ctx.cpred);
  const struck = data.haggle && data.haggle.discount > 0 ? data.haggle : null;
  const quote = quoteOf({
    ...(counter ? { priceMul: counter.priceMul } : {}),
    discount: struck?.discount ?? 0,
  });
  if (!quote) throw new RealtimeError('NOT_PURCHASABLE');
  if (quote.price !== expectPrice) throw new RealtimeError('QUOTE_CHANGED');
  if (data.eddies < quote.price) throw new RealtimeError('NOT_ENOUGH_EDDIES');

  const where = counter ? `${counter.name}: ` : '';
  const paid = await applyBalance(
    deps,
    campaignId,
    card,
    // Targ schodzi w tym samym zapisie, który go wydaje (jak `economy:buy`).
    struck ? mergeCharacterData(data, { haggle: null }) : data,
    {
      kind: 'purchase',
      amount: -quote.price,
      label: `${where}${label}`,
      ...(counter ? { counterpartyId: counter.card.id } : {}),
    },
    user.id,
    { tx, emit: false },
  );
  if (counter && !counter.cashInfinite) {
    await applyBalance(
      deps,
      campaignId,
      counter.card,
      counter.data,
      {
        kind: 'sale',
        amount: quote.price,
        label: `sprzedaż: ${label} — ${card.name}`,
        counterpartyId: card.id,
      },
      user.id,
      { tx, emit: false },
    );
  }
  return { card, balance: paid.eddies, quote, discount: struck?.discount ?? 0 };
}

/** Emisje po transakcji: karty obu stron (karta handlarza odświeża też półkę) i pojazd. */
async function emitAfterPurchase(
  deps: RealtimeDeps,
  campaignId: string,
  cardIds: readonly string[],
  vehicle: Vehicle,
): Promise<void> {
  for (const id of cardIds) {
    const saved = await deps.ctx.prisma.character.findUniqueOrThrow({ where: { id } });
    await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
    await emitTokensOfCharacter(deps, campaignId, saved);
  }
  await emitVehicleUpsert(deps, campaignId, vehicle);
}

/** Pojazd kupującego, czytany w transakcji — cudze auto wygląda jak nieistniejące. */
async function requireOwnVehicle(
  tx: Tx,
  campaignId: string,
  ownerCharacterId: string,
  vehicleId: unknown,
): Promise<Vehicle> {
  if (typeof vehicleId !== 'string' || vehicleId.length === 0) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const row = await tx.vehicle.findUnique({ where: { id: vehicleId } });
  if (!row || row.campaignId !== campaignId || row.ownerCharacterId !== ownerCharacterId) {
    throw new RealtimeError('VEHICLE_NOT_FOUND');
  }
  return row;
}

/**
 * Zakup auta (etap 67) — `vehicle:buy`. Kupuje się wyłącznie **model na
 * sprzedaż** (`cpredVehicleForSale`): klasa z podręcznika nie ma wyglądu,
 * a służby daje MG. Auto dostaje nazwę i wygląd modelu, liczby klasy
 * i właściciela — kartę kupującego.
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
    const expectPrice = requireExpectPrice(payload?.expectPrice);
    const atCounter = payload?.merchantId !== undefined;
    if (!atCounter) await requireCatalogPurchase(deps, campaign.id, user, entry);

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
        const paid = await payAtCounter(
          deps,
          tx,
          campaign.id,
          user,
          buyer.id,
          counter,
          expectPrice,
          entry.name,
          (options) => cpredVehicleQuote(entry, options),
        );
        const vehicle = await createVehicle(
          tx,
          campaign.id,
          paid.card.id,
          entry.name,
          cpredVehicleFromCatalog(entry),
          entry.art,
        );
        return { ...paid, counter, vehicle };
      }),
    );

    await emitAfterPurchase(
      deps,
      campaign.id,
      [outcome.card.id, ...(outcome.counter ? [outcome.counter.card.id] : [])],
      outcome.vehicle,
    );
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

/**
 * Ulepszenie do własnego auta (etap 68) — `vehicle:upgrade-buy`. Montaż od
 * razu po zapłacie (decyzja MG z 06.11), z regułami podręcznika
 * (`cpredVehicleUpgradeBuyProblem`: rodzaj, „tylko raz”, Wzmocniona
 * konstrukcja) i bez aut z Taboru. Lista, PUK (Wzmocniona konstrukcja +20),
 * układ i bryła (Ulepszenie foteli) liczą się tak samo jak w oknie MG.
 */
export const vehicleUpgradeBuyEvent = defineEvent<VehicleUpgradeBuyPayload, VehicleBuyResult>({
  name: 'vehicle:upgrade-buy',
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
    if (!cpredVehicleUpgradeForSale(entry)) throw new RealtimeError('NOT_PURCHASABLE');
    const expectPrice = requireExpectPrice(payload?.expectPrice);
    const atCounter = payload?.merchantId !== undefined;
    if (!atCounter) await requireCatalogPurchase(deps, campaign.id, user, entry);

    const outcome = await withCampaignLock(campaign.id, () =>
      prisma.$transaction(async (tx) => {
        const current = await requireOwnVehicle(tx, campaign.id, buyer.id, payload?.vehicleId);
        const before = readCpredVehicle(current.system);
        const problem = cpredVehicleUpgradeBuyProblem(before, entry.upgradeId);
        if (problem) throw new RealtimeError(problem);
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
        const paid = await payAtCounter(
          deps,
          tx,
          campaign.id,
          user,
          buyer.id,
          counter,
          expectPrice,
          `${entry.name} — ${current.name}`,
          (options) => cpredVehicleQuote(entry, options),
        );
        const result = cpredVehiclePatch(before, {
          upgrades: [
            ...before.upgrades.filter((row) => !row.fleetRowId),
            { id: Math.random().toString(36).slice(2, 10), upgradeId: entry.upgradeId, notes: '' },
          ],
        });
        if (!result.ok) throw new RealtimeError(result.code);
        const vehicle = await tx.vehicle.update({
          where: { id: current.id },
          data: {
            system: JSON.stringify(result.stats),
            ...vehicleSeatColumns(current, before, result.stats),
          },
        });
        return { ...paid, counter, vehicle };
      }),
    );

    await emitAfterPurchase(
      deps,
      campaign.id,
      [outcome.card.id, ...(outcome.counter ? [outcome.counter.card.id] : [])],
      outcome.vehicle,
    );
    const where = outcome.counter ? ` u: ${outcome.counter.name}` : '';
    await postEconomyCard(
      deps,
      campaign.id,
      user,
      {
        title: `${LEDGER_KIND_LABELS.purchase} — ${entry.name}`,
        lines: [
          `${outcome.card.name} — ${entry.name} do auta: ${outcome.vehicle.name}${where} · −${formatEddies(outcome.quote.price)} ed · saldo ${formatEddies(outcome.balance)} ed`,
          ...(outcome.discount > 0
            ? [`Targ Fixera −${outcome.discount}% · cena ${formatEddies(outcome.quote.listed)} ed`]
            : []),
          'Ulepszenie siedzi już w aucie (karta → Ekwipunek → „Pojazdy”).',
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

/**
 * Naprawa auta w warsztacie (etap 68) — `vehicle:repair`, wyłącznie u lady
 * handlarza z kategorią „Ulepszenia pojazdów”. 50 ed za brakujący PUK, szyby
 * w cenie, wrak też (decyzje MG z 06.11); auto wraca od razu na pełne PUK,
 * a PT i czas z „Naprawy pojazdów” (s. 147) stoją tylko na karcie czatu.
 * Auto z Taboru też — „zwykłe naprawy należą do obowiązków Nomady” (s. 162).
 */
export const vehicleRepairEvent = defineEvent<VehicleRepairPayload, VehicleBuyResult>({
  name: 'vehicle:repair',
  handler: async ({ deps, socket, user, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    const prisma = deps.ctx.prisma;
    const buyer = await requireWallet(deps, campaign.id, user, payload?.characterId);
    refuseAwaitingGm(buyer, user);
    await refuseInCombat(prisma, campaign.id, user);
    const expectPrice = requireExpectPrice(payload?.expectPrice);
    if (typeof payload?.merchantId !== 'string') throw new RealtimeError('BAD_REQUEST');

    const outcome = await withCampaignLock(campaign.id, () =>
      prisma.$transaction(async (tx) => {
        const current = await requireOwnVehicle(tx, campaign.id, buyer.id, payload.vehicleId);
        const before = readCpredVehicle(current.system);
        if (!cpredVehicleRepairQuote(before)) throw new RealtimeError('NOTHING_TO_REPAIR');
        const counter = await requireVehicleCounter(
          deps,
          tx,
          socket,
          campaign.id,
          payload.merchantId,
          buyer.id,
          'repair',
        );
        const damage = cpredVehicleRepairQuote(before)!.damage;
        const paid = await payAtCounter(
          deps,
          tx,
          campaign.id,
          user,
          buyer.id,
          counter,
          expectPrice,
          `naprawa auta — ${current.name}`,
          (options) => cpredVehicleRepairQuote(before, options),
        );
        const vehicle = await tx.vehicle.update({
          where: { id: current.id },
          data: { system: JSON.stringify(cpredVehicleRepaired(before)) },
        });
        return { ...paid, counter, vehicle, before, damage };
      }),
    );

    await emitAfterPurchase(
      deps,
      campaign.id,
      [outcome.card.id, outcome.counter.card.id],
      outcome.vehicle,
    );
    const band = CPRED_VEHICLE_DAMAGE[outcome.damage];
    const after = readCpredVehicle(outcome.vehicle.system);
    await postEconomyCard(
      deps,
      campaign.id,
      user,
      {
        title: `Naprawa auta — ${outcome.vehicle.name}`,
        lines: [
          `${outcome.card.name} — u: ${outcome.counter.name} · −${formatEddies(outcome.quote.price)} ed · saldo ${formatEddies(outcome.balance)} ed`,
          ...(outcome.discount > 0
            ? [`Targ Fixera −${outcome.discount}% · cena ${formatEddies(outcome.quote.listed)} ed`]
            : []),
          `PUK ${outcome.before.hp} → ${after.hp}${Object.keys(outcome.before.windows).length > 0 ? ' · szyby wstawione' : ''}`,
          `${band.label} — w warsztacie to ${band.time} pracy (s. 147, Naprawa pojazdów PT ${band.dv}).`,
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
