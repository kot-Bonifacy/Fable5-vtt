import type { AiStatus } from './ai.js';
import type { CampaignSummary, Role } from './auth.js';
import type { BotView } from './bots/types.js';
import type { ChatMessageView } from './chat.js';
import type { CombatView } from './combat.js';
import type { CharacterView } from './characters.js';
import type { CoverView } from './covers.js';
import type { SmokeView } from './smoke.js';
import type {
  CompendiumEntry,
  ShopTier,
  WeaponTypeDefinition,
} from './systems/cpred/compendium.js';
import type { LedgerEntryView } from './systems/cpred/economy.js';
import type { RollToss } from './dice.js';
import type { DrawingView } from './drawings.js';
import type { ExplorationMask } from './exploration.js';
import type { FogState } from './fog.js';
import type { LightView } from './lights.js';
import type { ScenePoint } from './measure.js';
import type { MapNoteView } from './notes.js';
import type { SceneSummary, SceneView } from './scenes.js';
import type { TokenView } from './tokens.js';
import type { VisionSyncBroadcast } from './vision.js';
import type { WallView } from './walls.js';

/** Server → client payload confirming a successful Socket.IO handshake. */
export interface ServerHello {
  serverTime: string;
  version: string;
}

/** One online user in a campaign room (deduplicated across tabs). */
export interface PresenceEntry {
  userId: string;
  name: string;
  role: Role;
}

/**
 * Full room state pushed by the server on connect, after reconnect and on
 * `state:request`. `seq` is the room's sequence counter — room-wide broadcasts
 * carry consecutive values, a gap on the client means a missed event and
 * triggers a resync.
 */
export interface StateSyncPayload {
  seq: number;
  campaign: CampaignSummary | null;
  presence: PresenceEntry[];
  /** Latest chat messages visible to this user, ascending by id. */
  messages: ChatMessageView[];
  hasMoreHistory: boolean;
  /** Scene this socket is viewing (players: the active scene; GM: any). */
  scene: SceneView | null;
  /** All campaign scenes — GM only, always empty for players. */
  scenes: SceneSummary[];
  /** Tokens of the viewed scene, already filtered for this viewer. */
  tokens: TokenView[];
  /**
   * Fog of the viewed scene (stage 17). The mask itself is public — it is the
   * shape of what players may see — while the tokens it conceals are already
   * gone from `tokens` above. Null when no scene is viewed.
   */
  fog: FogState | null;
  /**
   * Drawings of the viewed scene (stage 17b), already filtered: a player never
   * receives one from the GM layer. Ascending by id — that is the paint order.
   */
  drawings: DrawingView[];
  /** GM layer notes of the viewed scene — GM only, always empty for players. */
  notes: MapNoteView[];
  /**
   * Walls of the viewed scene (stage 18a) — **GM only, always empty for a
   * player**. A floor plan is what the party is meant to discover; players get
   * `vision` below, which is the finished result of the raycast.
   */
  walls: WallView[];
  /**
   * Cover standing on the viewed scene (stage 16c) — **for everybody**, and the
   * only scene object of which that is true.
   *
   * The rule the walls obey („data a player cannot see does not leave the
   * server") is what puts a car here rather than next to them: everyone at the
   * table is looking straight at it. A client needs it to draw the car, to
   * plan a route round it and to offer it as a target.
   */
  covers: CoverView[];
  /**
   * Smoke hanging on the viewed scene (stage 16h) — **for everybody**, for the
   * same reason the covers are: a bank of smoke in the street is not a secret,
   * and a client that cannot draw it cannot show a player why their roll was
   * −4.
   */
  smoke: SmokeView[];
  /**
   * Lights of the viewed scene (stage 18b) — **GM only, always empty for a
   * player**, for the reason the walls are: a light's shape is the shape of the
   * room it stands in. Players get light *levels* inside `vision` below.
   */
  lights: LightView[];
  /**
   * Field of view of this viewer's own tokens, on a scene with dynamic
   * visibility; null in every other mode (and for the GM, who sees all).
   */
  vision: VisionSyncBroadcast | null;
  /**
   * Doors and windows this player may operate and can currently see; empty for
   * the GM, who works the wall layer directly.
   */
  openings: WallView[];
  /**
   * Where the party has already been on the viewed scene (stage 18c); null when
   * the scene does not remember. Shared by the whole group and safe to hand
   * over whole: it only ever describes cells somebody has actually seen, and
   * the tokens that were standing in them are long gone from `tokens` above.
   */
  exploration: ExplorationMask | null;
  /** Characters this user may see: the GM gets all, a player only their own. */
  characters: CharacterView[];
  /** Bot profiles — GM only (they carry secrets), always empty for players. */
  bots: BotView[];
  /** Bot availability, filtered by role (players get no diagnostics). */
  ai: AiStatus;
  /** Item catalogue — the same for everyone; players pick gear from it. */
  compendium: CompendiumSyncPayload;
  /**
   * Highest shop tier unlocked in this campaign (stage 25c). It rides here
   * rather than on `campaign` above so that raising it can be one broadcast
   * instead of a whole re-sync — and so it cannot go stale in `socket.data`.
   */
  shopTier: ShopTier;
  /** Combat of the viewed scene, filtered for this viewer; null = no fight. */
  combat: CombatView | null;
}

/** GM moves the campaign's shop tier (stage 25c). */
export interface ShopTierPayload {
  tier: number;
}

export interface ShopTierBroadcast {
  seq: number;
  tier: ShopTier;
}

/** Weapon base rows plus every entry: imported ones and the GM's own. */
export interface CompendiumSyncPayload {
  weaponTypes: WeaponTypeDefinition[];
  entries: CompendiumEntry[];
}

/** GM writes one of the campaign's own compendium entries. */
export interface CompendiumUpsertPayload {
  entry: unknown;
}

export interface CompendiumIdPayload {
  id: string;
}

export interface CompendiumUpsertBroadcast {
  seq: number;
  entry: CompendiumEntry;
}

export interface CompendiumDeleteBroadcast {
  seq: number;
  id: string;
}

/** Payload of `chat:message`. `seq` is absent for targeted whisper deliveries. */
export interface ChatMessageBroadcast {
  seq?: number;
  message: ChatMessageView;
}

/** Payload of `presence:update`. */
export interface PresenceBroadcast {
  seq: number;
  presence: PresenceEntry[];
}

/**
 * Physical shake gesture accompanying a roll command. The entropy digest is
 * MIXED into the server's crypto randomness (the gesture genuinely influences
 * the outcome, but can never be predicted or steered); the strength and toss
 * only drive the 3D animation.
 */
export interface RollGesture {
  /** Digest of the mouse-shake samples (hex, client-computed). */
  entropy: string;
  /** Toss strength 0–3 (shake speed) — animation boost for all viewers. */
  strength: number;
  /** Release direction + point, so every viewer replays the same throw. */
  toss?: RollToss;
}

export const MAX_GESTURE_ENTROPY_LENGTH = 256;
export const MAX_GESTURE_STRENGTH = 3;

/** Client → server payload of `chat:send`. Raw input — the server parses commands. */
export interface ChatSendPayload {
  text: string;
  /** Present when the roll was thrown with the dice cup. */
  gesture?: RollGesture;
}

/**
 * Client → server payload of `character:roll` — a check rolled from a sheet.
 * The request itself is system-specific (CP RED: `CpredRollRequest`), so the
 * core protocol only carries it; the server's system module validates it.
 */
export interface CharacterRollPayload<TRequest = unknown> {
  characterId: string;
  request: TRequest;
  /** `gm` = result visible to the author and the GM only (whisper pattern). */
  visibility: 'public' | 'gm';
  /** Present when the roll was thrown with the dice cup. */
  gesture?: RollGesture;
}

/**
 * Client → server payload of `character:cyberware` (stage 23a).
 *
 * Installing is a server action rather than a sheet edit, because the Humanity
 * it costs is *rolled* (s. 111): the client may not decide how much a piece of
 * chrome took out of somebody. Removal and therapy ride the same event for the
 * same reason — one of them moves the Humanity ceiling, the other rolls dice.
 */
export interface CharacterCyberwarePayload {
  characterId: string;
  action: 'install' | 'remove' | 'therapy';
  /** `install`: compendium id of the entry being fitted. */
  entryId?: string;
  /** `remove`: id of the sheet row to pull out. */
  rowId?: string;
  /** `therapy`: which of the two treatments of s. 230 was paid for. */
  therapy?: string;
  /**
   * Who pays for the hardware (stage 23b). „Znaleziona cyborgizacja" is a row
   * of the price list (s. 375), so a piece pulled off a corpse costs the fitting
   * and nothing else; `none` is the GM's gift and is refused for players.
   */
  payment?: 'full' | 'installOnly' | 'none';
  /** Present when the roll was thrown with the dice cup. */
  gesture?: RollGesture;
}

/* ------------------------------------------------------------------ *
 * Eddies (stage 23b)
 *
 * Every one of these moves a balance, so every one of them is an event rather
 * than a sheet patch: the sheet is the wallet, and a wallet the client may
 * rewrite has no audit worth reading.
 * ------------------------------------------------------------------ */

/** Client → server payload of `economy:buy` — one catalogue entry, paid for. */
export interface EconomyBuyPayload {
  characterId: string;
  /** Compendium id of the thing being bought. */
  entryId: string;
  /**
   * GM's override of the printed price („u tego fixera to kosztuje 300"). Sent
   * only by the GM; a player's override is refused rather than ignored.
   */
  price?: number;
}

/** Client → server payload of `economy:transfer` — eddies changing hands. */
export interface EconomyTransferPayload {
  /** Payer; must be the sender's own character unless the sender is the GM. */
  fromCharacterId: string;
  toCharacterId: string;
  amount: number;
  /** Optional one-liner shown on the chat line and in both ledgers. */
  note?: string;
}

/** GM only: sets a balance outright (`economy:adjust`), leaving a ledger row. */
export interface EconomyAdjustPayload {
  characterId: string;
  /** The new balance. A delta would race with the sheet the GM is reading. */
  balance: number;
  reason?: string;
}

/** GM only: `economy:settle` — the first of the month for the whole campaign. */
export interface EconomySettlePayload {
  /** Dry run: computes and reports the bill without touching a single wallet. */
  preview?: boolean;
}

/** Client → server payload of `economy:history` — the audit of one character. */
export interface EconomyHistoryPayload {
  characterId: string;
}

/**
 * What the wallet section of a sheet needs, in one round trip.
 *
 * The payee list rides along with the audit because a player's client holds
 * only their **own** characters — sheets travel to their owner and the GM, and
 * nobody else (stage 08). Paying somebody therefore needs a roster the client
 * cannot assemble, and it is deliberately names only: „kto gra w tej kampanii"
 * is written on every token already.
 */
export interface EconomyHistoryResult {
  entries: LedgerEntryView[];
  payees: { id: string; name: string }[];
}

/**
 * A player (or the GM) rolls initiative for one participant. Lives here rather
 * than in `combat.ts` because it carries the cup gesture — the tracker itself
 * knows nothing about dice.
 */
export interface CombatRollPayload {
  combatantId: string;
  gesture?: RollGesture;
}

/**
 * GM applies a stored damage roll to a token (stage 15). The client sends only
 * the intention: which roll, which target and the GM's overrides. Every number
 * that decides the outcome is re-read on the server from the roll message and
 * the target's sheet.
 */
export interface DamageApplyPayload {
  /** Chat message id of the damage roll. */
  messageId: number;
  /** Token taking the hit; omitted when a cover does (stage 16c). */
  tokenId?: string;
  /**
   * Cover taking the hit instead of a token (stage 16c). An object has no
   * armour, no Critical Injuries and no Death Save, and whatever is left over
   * once it is wrecked simply stops („pozostałe obrażenia tego ataku
   * przepadają", s. 179).
   */
  coverId?: number;
  /** Overrides the location the roll was made for. */
  location?: string;
  /** SP protecting the target — for statists without a sheet. */
  armorSp?: number;
  /** Armor stops nothing this time (falls, injury effects). */
  ignoreArmor?: boolean;
}

/** GM takes back an applied damage entry; the id is the log message's. */
export interface DamageUndoPayload {
  messageId: number;
}

/**
 * An attack made from the map (stage 16). Like every other roll, the client
 * sends an intention only: who attacks, with which weapon and at which token.
 * The distance is *measured on the server* from the two tokens' positions —
 * it is never sent, precisely because it decides the difficulty.
 */
export interface AttackRollPayload<TRequest = unknown> {
  /**
   * Sheet making the attack. Omitted for a statist (stage 16b) — a token with
   * no sheet, fighting from the combat profile stored on it. `attackerTokenId`
   * is then required, because there is nothing else to look the fighter up by.
   */
  characterId?: string;
  /** Token being shot at. Omitted when the target is a cover (stage 16c). */
  targetTokenId?: string;
  /**
   * Cover being shot at instead of a token (stage 16c) — „ostrzelaj samochód".
   * Exactly one of the two target fields may be present.
   */
  targetCoverId?: number;
  /**
   * A patch of ground being aimed at instead of a token or a cover (stage 16d)
   * — where a grenade is meant to land, in scene pixels.
   *
   * The server snaps it to a grid square before anything else happens, because
   * the rules centre the blast on a square rather than on the click („twój cel
   * (pole 2x2 metry, nie osoba)", s. 174). Exactly one of the three target
   * fields may be present.
   */
  targetPoint?: ScenePoint;
  /** Which of the character's tokens is shooting; derived when omitted. */
  attackerTokenId?: string;
  request: TRequest;
  /** Present when the roll was thrown with the dice cup. */
  gesture?: RollGesture;
}

/**
 * Why a shot did not happen (stage 16c) — something stops the round, and the
 * table has to choose what to do about it.
 *
 * Returned as a **result**, not thrown as an error, and that is the whole point:
 * nothing was rolled, nothing was spent, and the client has everything it needs
 * to offer the two answers the rules allow — shoot the obstacle instead, or
 * declare that the target leaned out (`ignoreCover`).
 */
export type AttackBlocked =
  | {
      kind: 'cover';
      coverId: number;
      name: string;
      hpCurrent: number;
      hpMax: number;
    }
  | {
      kind: 'shield';
      /** The Human Shield itself — „PW tarczy to PW trzymanego" (s. 181). */
      tokenId: string;
      name: string;
    };

/** Ack of `attack:roll`: the card that was posted, or what stood in the way. */
export type AttackRollResult =
  { messageId: number; blocked?: undefined } | { blocked: AttackBlocked };

/**
 * The defender contests an attack that already resolved (stage 16): the DV
 * from the range table is replaced by a real DEX + Evasion roll, and the
 * attack's chat card is rewritten with the new verdict.
 */
export interface AttackEvadePayload {
  /** Chat message id of the attack. */
  messageId: number;
  /** Sheet rolling the evasion; must own the targeted token. */
  characterId: string;
  /**
   * Which figure is jumping clear of an area attack (stage 16d).
   *
   * Absent for an ordinary attack, which has exactly one target and therefore
   * nothing to name. A blast has many, and each of them gets their own attempt:
   * „Osoba z REF 8 lub wyższym może zdecydować się na odskoczenie poza obszar
   * wybuchu" (s. 174) is a decision per person, not per grenade.
   */
  tokenId?: string;
  gesture?: RollGesture;
}

/**
 * The shooter takes the second roll a smart round earned (stage 16h).
 *
 * Its own payload rather than a flag on the evasion: this one is rolled by the
 * *attacker*, may spend Luck, and leaves the defender's dodge untouched — three
 * differences that would each need a branch inside `attack:evade`.
 */
export interface AttackSmartPayload {
  /** Chat message id of the attack that missed. */
  messageId: number;
  /** The shooter's sheet — must be the one carrying the weapon row. */
  characterId: string;
  /** „możesz też wydać Szczęście" (s. 347), spent on this roll alone. */
  luckSpent?: number;
  gesture?: RollGesture;
}

/** Reloading a weapon row to a full magazine (an Action at the table). */
export interface WeaponReloadPayload {
  characterId: string;
  weaponRowId: string;
  /**
   * Load this kind of round while reloading (stage 16g); `null` goes back to
   * ordinary ammunition, and leaving the field out keeps whatever is in the gun.
   *
   * Changing the round travels through *this* event rather than through a sheet
   * edit, and that is the whole enforcement of „zmiana naboju kosztuje
   * Przeładowanie": out of a fight nothing is charged (there is no budget), and
   * in one the Action is booked exactly as a refill's would be.
   */
  ammoId?: string | null;
}

/** Client → server payload of `chat:history`. */
export interface ChatHistoryRequest {
  /** Return messages with id lower than this (exclusive). */
  beforeId: number;
  limit?: number;
}

/** Ack data of `chat:history`. Messages ascending by id. */
export interface ChatHistoryPage {
  messages: ChatMessageView[];
  hasMore: boolean;
}

export const PROTOCOL_VERSION = '0.1.0';

export function createServerHello(now: Date = new Date()): ServerHello {
  return {
    serverTime: now.toISOString(),
    version: PROTOCOL_VERSION,
  };
}
