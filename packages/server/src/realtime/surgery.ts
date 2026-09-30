import type {
  CyberwareEntry,
  CyberwareRequestPayload,
  CyberwareRespondPayload,
  CyberwareSurgeonsPayload,
  CyberwareSurgeonsResult,
  SessionUser,
  SurgeryRequestEntry,
} from '@vtt/shared';
import {
  CYBERWARE_INSTALL_COST,
  CYBERWARE_INSTALL_DV,
  CYBERWARE_INSTALL_LABELS,
  EDDIES_MAX,
  ITEM_ROWS_MAX,
  ROLE_GM,
  cpredMedicineSkillLevel,
  cyberwareInstallRefusal,
  entryPrice,
  isSurgeryOpen,
  mayPatientAnswer,
  maySurgeonAnswer,
  parseCharacterData,
  surgeryHeadline,
  surgeryNeedsApproval,
} from '@vtt/shared';
import type { Character } from '../generated/prisma/client.js';
import { requireRollableCharacter } from './character-rolls.js';
import { refuseAwaitingGm } from './character-io.js';
import {
  INCLUDE_CHAT_NAMES,
  deliverChatMessageTo,
  insertChatMessage,
  toChatMessageView,
} from './chat-io.js';
import { requireCampaignId } from './combat.js';
import { performInstall, requireCyberwareEntry, surgeonRollFor } from './cyberware.js';
import { findCampaignCharacter } from './inventory.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';

/**
 * Prośba o operację u Medyka innego gracza (#41, 30.09.2026) — pacjent prosi,
 * Medyk przyjmuje, zasady w `shared/src/surgery.ts`.
 *
 * Czemu osobne zdarzenia, a nie gałąź `character:cyberware`: tamto zdarzenie
 * wykonuje montaż od ręki i wymaga, żeby klikający prowadził **obie** karty.
 * Tu są dwie osoby i zgoda między nimi, więc stan musi przeżyć na karcie czatu
 * — tak samo jak propozycja przekazania z 38b. Sam montaż (Test, Człowieczeństwo,
 * zapłata) idzie tą samą `performInstall`, więc karty rzutów są identyczne.
 */

/** Karta prośby w trakcie wykonania — drugie „Operuję" nie zoperuje dwa razy (wzór #20). */
const inFlight = new Set<number>();

/** Ile kosztuje to, co pacjent kliknął w Kompendium — cena z guzika. */
function defaultPriceOf(entry: CyberwareEntry, payment: 'full' | 'installOnly'): number {
  if (payment === 'installOnly') return entry.install ? CYBERWARE_INSTALL_COST[entry.install] : 0;
  const price = entryPrice(entry);
  if (price === null) throw new RealtimeError('NO_PRICE');
  return price;
}

/** Medyk innego gracza z Chirurgią — jedyny, u którego prosi się o operację. */
function surgeryOf(deps: RealtimeDeps, card: Character): number {
  const data = parseCharacterData(card.data, deps.ctx.cpred);
  return cpredMedicineSkillLevel(data, deps.ctx.cpred, 'medicine.surgery');
}

/* ------------------------------------------------------------------ *
 * cyberware:surgeons — u kogo mogę poprosić
 * ------------------------------------------------------------------ */

export const cyberwareSurgeonsEvent = defineEvent<
  CyberwareSurgeonsPayload,
  CyberwareSurgeonsResult
>({
  name: 'cyberware:surgeons',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const patient = await requireRollableCharacter(deps, campaignId, user, payload?.patientId);
    // Karty innych graczy — własnego Medyka pacjent wybiera w Kompendium
    // wprost, a NPC-a-chirurga prowadzi MG („Ripperdoc MG").
    const cards = await deps.ctx.prisma.character.findMany({
      where: {
        campaignId,
        id: { not: patient.id },
        ownerId: { notIn: [user.id] },
        NOT: { ownerId: null },
        playReady: true,
      },
      orderBy: { name: 'asc' },
    });
    const surgeons = cards
      .map((card) => ({ characterId: card.id, name: card.name, surgery: surgeryOf(deps, card) }))
      .filter((row) => row.surgery > 0);
    return { surgeons };
  },
});

/* ------------------------------------------------------------------ *
 * cyberware:request — „poproś o operację"
 * ------------------------------------------------------------------ */

export const cyberwareRequestEvent = defineEvent<CyberwareRequestPayload, { messageId: number }>({
  name: 'cyberware:request',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    // MG prowadzi obie karty i montuje wprost (`character:cyberware`). Prośba
    // z jego konta nie trafiłaby też pacjentowi do historii — widzi ją autor
    // (`authorId`) i adresat (`recipientId`), a pacjentem byłby ktoś trzeci.
    if (user.role === ROLE_GM) throw new RealtimeError('FORBIDDEN');
    const patient = await requireRollableCharacter(deps, campaignId, user, payload?.patientId);
    const surgeon = await findCampaignCharacter(deps.ctx.prisma, campaignId, payload?.surgeonId);
    // Prośba jest do **innego gracza**: własnego Medyka wskazuje się w montażu
    // wprost, a karty bez właściciela nie ma kto przyjąć.
    if (surgeon.ownerId === null || surgeon.ownerId === user.id || surgeon.id === patient.id) {
      throw new RealtimeError('CHARACTER_NOT_FOUND');
    }
    if (!surgeon.playReady) throw new RealtimeError('CHARACTER_NOT_FOUND');
    const payment = payload?.payment;
    if (payment !== 'full' && payment !== 'installOnly') throw new RealtimeError('BAD_REQUEST');

    const entry = requireCyberwareEntry(deps, payload?.entryId);
    // „Bez operacji" (chip w gnieździe) nie ma Testu, więc nie ma o co prosić.
    const dv = entry.install ? CYBERWARE_INSTALL_DV[entry.install] : null;
    if (dv === null || dv === undefined) throw new RealtimeError('NO_SURGERY_NEEDED');
    const data = parseCharacterData(patient.data, deps.ctx.cpred);
    if (data.cyberware.length >= ITEM_ROWS_MAX) throw new RealtimeError('TOO_MANY_ROWS');
    const refusal = cyberwareInstallRefusal(data.cyberware, entry);
    if (refusal) throw new RealtimeError(refusal);
    // Te same odmowy, co przy operacji, tylko wcześniej — Medyk nie ma dostać
    // prośby, której i tak nie mógłby spełnić.
    const surgeonRoll = surgeonRollFor(deps, surgeon, patient, entry);

    const entryView: SurgeryRequestEntry = {
      patientId: patient.id,
      patientName: patient.name,
      patientOwnerId: patient.ownerId,
      surgeonId: surgeon.id,
      surgeonName: surgeon.name,
      surgeonOwnerId: surgeon.ownerId,
      entryId: entry.id,
      entryName: entry.name,
      payment,
      dv,
      place: entry.install ? CYBERWARE_INSTALL_LABELS[entry.install] : '',
      defaultPrice: defaultPriceOf(entry, payment),
      surgery: surgeonRoll.breakdown.find((row) => row.kind === 'skill')?.value ?? 0,
    };
    const message = await insertChatMessage(deps.ctx.prisma, {
      campaignId,
      authorId: user.id,
      kind: 'surgery',
      text: surgeryHeadline(entryView),
      recipientId: surgeon.ownerId,
      payload: JSON.stringify(entryView),
    });
    await deliverChatMessageTo(
      deps,
      campaignId,
      message,
      [patient.ownerId, surgeon.ownerId, user.id],
      true,
    );
    return { messageId: message.id };
  },
});

/* ------------------------------------------------------------------ *
 * cyberware:respond — „Operuję", „Zgadzam się", „Odmawiam", „Wycofaj"
 * ------------------------------------------------------------------ */

async function emitSurgeryUpdate(
  deps: RealtimeDeps,
  campaignId: string,
  messageId: number,
  entry: SurgeryRequestEntry,
  audience: (string | null)[],
): Promise<void> {
  const stored = await deps.ctx.prisma.chatMessage.update({
    where: { id: messageId },
    data: { payload: JSON.stringify(entry) },
    include: INCLUDE_CHAT_NAMES,
  });
  await deliverChatMessageTo(
    deps,
    campaignId,
    toChatMessageView(stored),
    audience,
    true,
    'chat:update',
  );
}

/** Operacja po zgodzie obu stron — wszystko czytane od nowa z bazy. */
async function operate(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  entry: SurgeryRequestEntry,
  price: number,
): Promise<void> {
  const prisma = deps.ctx.prisma;
  const patient = await findCampaignCharacter(prisma, campaignId, entry.patientId);
  const surgeon = await findCampaignCharacter(prisma, campaignId, entry.surgeonId);
  refuseAwaitingGm(patient, user);
  const cyberware = requireCyberwareEntry(deps, entry.entryId);
  const surgeonRoll = surgeonRollFor(deps, surgeon, patient, cyberware);

  const data = parseCharacterData(patient.data, deps.ctx.cpred);
  if (data.cyberware.length >= ITEM_ROWS_MAX) throw new RealtimeError('TOO_MANY_ROWS');
  const refusal = cyberwareInstallRefusal(data.cyberware, cyberware);
  if (refusal && user.role !== ROLE_GM) throw new RealtimeError(refusal);
  // Pieniądze przed kośćmi, jak w `installCyberware`: karta prośby zostaje
  // otwarta, pacjent może dozbierać albo Medyk zejść z ceny.
  if (data.eddies < price) throw new RealtimeError('NOT_ENOUGH_EDDIES');

  await performInstall(deps, campaignId, user, patient, data, {
    entry: cyberware,
    surgeon: surgeonRoll,
    bill: {
      cost: price,
      label: `${cyberware.name} — operacja: ${surgeon.name}`,
      ...(price > 0 ? { payee: surgeon } : {}),
    },
    gesture: undefined,
    refusal,
  });
}

function readPrice(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > EDDIES_MAX) {
    throw new RealtimeError('BAD_PRICE');
  }
  return raw;
}

export const cyberwareRespondEvent = defineEvent<CyberwareRespondPayload, { pending: boolean }>({
  name: 'cyberware:respond',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const messageId = payload?.messageId;
    if (typeof messageId !== 'number' || !Number.isInteger(messageId)) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const action = payload?.action;
    if (
      action !== 'operate' &&
      action !== 'approve' &&
      action !== 'decline' &&
      action !== 'cancel'
    ) {
      throw new RealtimeError('BAD_REQUEST');
    }
    if (inFlight.has(messageId)) throw new RealtimeError('SURGERY_CLOSED');
    inFlight.add(messageId);
    try {
      const stored = await deps.ctx.prisma.chatMessage.findUnique({ where: { id: messageId } });
      if (
        !stored ||
        stored.campaignId !== campaignId ||
        stored.kind !== 'surgery' ||
        !stored.payload
      ) {
        throw new RealtimeError('SURGERY_NOT_FOUND');
      }
      const entry = JSON.parse(stored.payload) as SurgeryRequestEntry;
      if (!isSurgeryOpen(entry)) throw new RealtimeError('SURGERY_CLOSED');

      const isGm = user.role === ROLE_GM;
      const audience = [entry.patientOwnerId, entry.surgeonOwnerId, stored.authorId];
      const close = async (kind: 'operated' | 'declined' | 'cancelled', price?: number) => {
        entry.resolution = { kind, byName: user.name, ...(price === undefined ? {} : { price }) };
        delete entry.quote;
        await emitSurgeryUpdate(deps, campaignId, messageId, entry, audience);
      };

      switch (action) {
        case 'operate': {
          if (!maySurgeonAnswer(entry, user.id, isGm)) throw new RealtimeError('SURGERY_NOT_YOURS');
          // Wycena już czeka na pacjenta — Medyk może jeszcze tylko odmówić.
          if (entry.quote !== undefined) throw new RealtimeError('SURGERY_QUOTED');
          const price = readPrice(payload?.price);
          if (surgeryNeedsApproval(entry, price)) {
            entry.quote = price;
            await emitSurgeryUpdate(deps, campaignId, messageId, entry, audience);
            return { pending: true };
          }
          await operate(deps, campaignId, user, entry, price);
          await close('operated', price);
          return { pending: false };
        }
        case 'approve': {
          if (!mayPatientAnswer(entry, user.id, isGm)) throw new RealtimeError('SURGERY_NOT_YOURS');
          if (entry.quote === undefined) throw new RealtimeError('SURGERY_NOT_QUOTED');
          const price = entry.quote;
          await operate(deps, campaignId, user, entry, price);
          await close('operated', price);
          return { pending: false };
        }
        case 'decline': {
          if (!maySurgeonAnswer(entry, user.id, isGm)) throw new RealtimeError('SURGERY_NOT_YOURS');
          await close('declined');
          return { pending: false };
        }
        case 'cancel': {
          if (!mayPatientAnswer(entry, user.id, isGm)) throw new RealtimeError('SURGERY_NOT_YOURS');
          await close('cancelled');
          return { pending: false };
        }
      }
    } finally {
      inFlight.delete(messageId);
    }
  },
});
