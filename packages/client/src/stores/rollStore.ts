import { create } from 'zustand';
import type {
  CpredAttackRequest,
  CpredCareOption,
  CpredCharacterData,
  CpredHitLocation,
  CpredRegistry,
  CpredRollRequest,
  CpredCharismaAudience,
  CpredCharismaPurpose,
  CpredProofLevel,
  ScenePoint,
} from '@vtt/shared';
import {
  CPRED_FIRST_AID_SKILL_ID,
  CPRED_PARAMEDIC_SKILL_ID,
  cpredMedicineSkillLevel,
  isCpredMedicineSkillId,
  planCpredRoll,
  woundCheckPenalty,
  woundState,
} from '@vtt/shared';

/**
 * Sheet-driven rolls (stage 08). Clicking a skill or a stat opens the roll
 * dialog; confirming it loads the dice cup — the throw itself happens when
 * the player shakes and releases the cup, so every real roll keeps its
 * physical gesture (and its entropy).
 */

/** What the dialog is being opened for. */
export interface RollTarget {
  characterId: string;
  characterName: string;
  kind: CpredRollRequest['kind'];
  skillId?: string;
  statId?: CpredRollRequest['statId'];
  /** Weapon row for `kind: 'damage'`. */
  weaponRowId?: string;
}

/** A check waiting in the cup: everything the server needs, plus the label. */
export interface PendingRoll extends Omit<RollTarget, 'characterId'> {
  /**
   * Sheet making the roll. Absent for a statist (stage 16b) — the dialog never
   * opens one, but an attack card can load a damage roll for a figure that has
   * no sheet, and until it could, „Obrażenia" was simply missing from its card.
   */
  characterId?: string;
  /** Token rolling instead of a sheet; the only address the server then has. */
  attackerTokenId?: string;
  request: CpredRollRequest;
  visibility: 'public' | 'gm';
  /** Chat-card title, e.g. `Percepcja (INT)`. */
  title: string;
  /** Total modifier — shown on the cup so the thrower knows what they carry. */
  modifierTotal: number;
}

/**
 * An initiative roll loaded into the cup (stage 14). It carries no sheet
 * request: the server derives the modifier from the participant's sheet, the
 * player only supplies the throw.
 */
export interface PendingInitiative {
  combatantId: string;
  /** Participant's name, shown on the cup. */
  name: string;
  /** REF, or 0 for a statist without a sheet. */
  modifierTotal: number;
}

/**
 * An attack loaded into the cup (stage 16). The distance and the DV are not
 * here on purpose: the client shows an estimate on the cup, but the server
 * measures the map when the dice actually fly.
 */
export interface PendingAttack {
  /**
   * Sheet firing the shot. Absent for a statist (stage 16b): the token's own
   * combat profile supplies the numbers, and `attackerTokenId` is then the only
   * address the server needs.
   */
  characterId?: string;
  /** Whoever is shooting, sheet or token — shown on the cup. */
  characterName: string;
  attackerTokenId?: string;
  /** Token being shot at; absent when the shot is aimed at a cover (16c). */
  targetTokenId?: string;
  /** Cover being shot at instead — „ostrzelaj samochód" (stage 16c). */
  targetCoverId?: number;
  /** Square the charge is aimed at instead of anybody (stage 16d). */
  targetPoint?: ScenePoint;
  targetName: string;
  request: CpredAttackRequest;
  /** Cup label, e.g. „Zgrzyt 9 → Ganger · 24 m". */
  title: string;
  modifierTotal: number;
}

/**
 * A grapple test loaded into the cup (stage 14d) — either an attempt at
 * somebody, or the answer to an attempt already on the chat („Broń się").
 *
 * One slot for both because they are the same roll (ZW + Bijatyka) and the same
 * gesture; only the address differs, which is what the two optional halves are.
 */
export interface PendingGrapple {
  characterId: string;
  characterName: string;
  title: string;
  modifierTotal: number;
  /** Starting a contest: whom, with which token, and what for. */
  attempt?: {
    targetTokenId: string;
    attackerTokenId?: string;
    intent: 'hold' | 'item' | 'escape';
  };
  /** Answering one: the chat card being contested. */
  resist?: { messageId: number };
}

/**
 * A follow-up 1d10 roll on an attack card already on the chat.
 *
 * Two of them share the shape, and `kind` is the only thing that differs at the
 * cup: the defender's Evasion (stage 16), and the shooter correcting a near
 * miss with a smart round (stage 16h). Both name a stored message, roll one
 * die, and have the server rewrite that card — which is why they are one slot
 * rather than two nearly identical ones.
 */
export interface PendingEvasion {
  /** Which follow-up this is; absent means the defender's dodge. */
  kind?: 'evade' | 'smart';
  /** Chat message id of the attack being contested. */
  messageId: number;
  /** Null when a figure without a sheet dodges with its combat profile (16b). */
  characterId: string | null;
  characterName: string;
  /**
   * Which figure is jumping clear of a blast (stage 16d). Absent for an
   * ordinary dodge, which has one target and nothing to name.
   */
  tokenId?: string;
  title: string;
  modifierTotal: number;
}

/**
 * A Konfrontacja loaded into the cup (stage 23c) — starting one, or answering
 * one already on the chat („Postaw się").
 *
 * Its own slot rather than a third `intent` on `PendingGrapple`: the two roll
 * different things (CHA + Reputacja against ZW + Bijatyka), cost different
 * amounts of turn (nothing against an Action) and go to different events. What
 * they share is the gesture, which is the cup's business, not theirs.
 */
export interface PendingFacedown {
  characterId: string;
  characterName: string;
  title: string;
  modifierTotal: number;
  /** Starting one: whom, and with which token. */
  attempt?: { targetTokenId: string; challengerTokenId?: string };
  /** Answering one: the chat card being contested. */
  resist?: { messageId: number };
}

/**
 * The character creator's stat spread waiting in the cup (stage 25a).
 *
 * It carries nothing but a label, because unlike every other slot it names no
 * character and no request: the server already knows whose draft it is and
 * what to roll. What it borrows from the others is the only thing that matters
 * here — the gesture, so a player rolls their Cechy the same way they roll
 * everything else at this table.
 */
export interface PendingCreation {
  /** Cup label, e.g. `Rozkład Cech — Solo`. */
  title: string;
}

interface RollStoreState {
  /** Open roll dialog (null = closed). */
  target: RollTarget | null;
  /** Check loaded into the cup, waiting for the throw. */
  pending: PendingRoll | null;
  /** Initiative loaded into the cup (mutually exclusive with `pending`). */
  initiative: PendingInitiative | null;
  /** Attack loaded into the cup (stage 16). */
  attack: PendingAttack | null;
  /** Evasion loaded into the cup (stage 16). */
  evasion: PendingEvasion | null;
  /** Grapple test loaded into the cup (stage 14d). */
  grapple: PendingGrapple | null;
  /** Konfrontacja loaded into the cup (stage 23c). */
  facedown: PendingFacedown | null;
  /** Character-creator stat spread loaded into the cup (stage 25a). */
  creation: PendingCreation | null;
  /** Last dialog choices, reused for the next roll (and by Shift+click). */
  lastModifier: number;
  lastVisibility: 'public' | 'gm';
  /** Last aimed location of a damage roll (stage 15). */
  lastLocation: CpredHitLocation;

  openDialog: (target: RollTarget) => void;
  closeDialog: () => void;
  loadCup: (pending: PendingRoll) => void;
  loadInitiativeCup: (initiative: PendingInitiative) => void;
  loadAttackCup: (attack: PendingAttack) => void;
  loadEvasionCup: (evasion: PendingEvasion) => void;
  loadGrappleCup: (grapple: PendingGrapple) => void;
  loadFacedownCup: (facedown: PendingFacedown) => void;
  loadCreationCup: (creation: PendingCreation) => void;
  clearCup: () => void;
  remember: (modifier: number, visibility: 'public' | 'gm') => void;
  rememberLocation: (location: CpredHitLocation) => void;
}

/** Every slot of the cup, cleared. Spread it before setting the new one. */
const EMPTY_CUP = {
  pending: null,
  initiative: null,
  attack: null,
  evasion: null,
  grapple: null,
  facedown: null,
  creation: null,
} as const;

export const useRollStore = create<RollStoreState>((set) => ({
  target: null,
  pending: null,
  initiative: null,
  attack: null,
  evasion: null,
  grapple: null,
  facedown: null,
  creation: null,
  lastModifier: 0,
  lastVisibility: 'public',
  lastLocation: 'body',

  openDialog: (target) => set({ target }),
  closeDialog: () => set({ target: null }),
  // Only one thing can sit in the cup at a time — loading anything empties it.
  loadCup: (pending) => set({ ...EMPTY_CUP, pending, target: null }),
  loadInitiativeCup: (initiative) => set({ ...EMPTY_CUP, initiative, target: null }),
  loadAttackCup: (attack) => set({ ...EMPTY_CUP, attack, target: null }),
  loadEvasionCup: (evasion) => set({ ...EMPTY_CUP, evasion, target: null }),
  loadGrappleCup: (grapple) => set({ ...EMPTY_CUP, grapple, target: null }),
  loadFacedownCup: (facedown) => set({ ...EMPTY_CUP, facedown, target: null }),
  loadCreationCup: (creation) => set({ ...EMPTY_CUP, creation, target: null }),
  clearCup: () => set({ ...EMPTY_CUP }),
  remember: (lastModifier, lastVisibility) => set({ lastModifier, lastVisibility }),
  rememberLocation: (lastLocation) => set({ lastLocation }),
}));

/**
 * Shift+click path: skips the dialog and loads the cup straight away with the
 * last used modifier and visibility (no Luck — spending it is always a
 * deliberate choice).
 */
export function quickLoadCup(
  target: RollTarget,
  data: CpredCharacterData,
  registry: CpredRegistry,
): void {
  const store = useRollStore.getState();
  const isCheck = target.kind === 'skill' || target.kind === 'stat';
  const request: CpredRollRequest = {
    kind: target.kind,
    ...(target.skillId ? { skillId: target.skillId } : {}),
    ...(target.statId ? { statId: target.statId } : {}),
    ...(target.weaponRowId ? { weaponRowId: target.weaponRowId } : {}),
    ...(target.kind === 'damage' ? { location: store.lastLocation } : {}),
    // Damage and Death Saves take no situational modifier by default: the
    // remembered check modifier must not silently ride along.
    modifier: isCheck ? store.lastModifier : 0,
    luckSpent: 0,
  };
  const planned = planCpredRoll(data, registry, request);
  if (!planned.ok) return;
  store.loadCup({
    ...target,
    request,
    // A damage roll or a Death Save is always public: the table needs to see
    // what happened to the target.
    visibility: isCheck ? store.lastVisibility : 'public',
    title: planned.plan.title,
    modifierTotal: planned.plan.modifierTotal,
  });
}

/** Loads a Death Save into the cup — no dialog, the rules leave no choices. */
export function loadDeathSaveCup(
  characterId: string,
  characterName: string,
  data: CpredCharacterData,
  registry: CpredRegistry,
): void {
  quickLoadCup({ characterId, characterName, kind: 'deathSave' }, data, registry);
}

/**
 * Loads „Ustabilizowanie" into the cup (stage 14b).
 *
 * Planned by hand rather than through `planCpredRoll`, because the DV depends
 * on the *target's* wound threshold and only the server may read it — the cup
 * label therefore shows the modifier the medic carries, and the card that lands
 * on chat shows the PT it was measured against.
 */
export function loadStabilizeCup(
  medic: { characterId: string; characterName: string },
  target: { tokenId: string; name: string },
  data: CpredCharacterData,
  registry: CpredRegistry,
): void {
  const store = useRollStore.getState();
  const candidates = registry.skills.filter(
    (skill) => skill.id === CPRED_FIRST_AID_SKILL_ID || skill.id === CPRED_PARAMEDIC_SKILL_ID,
  );
  if (candidates.length === 0) return;
  const skill = candidates.reduce((best, entry) =>
    (data.skills[entry.id] ?? 0) > (data.skills[best.id] ?? 0) ? entry : best,
  );
  const modifierTotal =
    data.stats[skill.stat] +
    (data.skills[skill.id] ?? 0) +
    woundCheckPenalty(woundState(data.hpCurrent, data.stats));

  store.loadCup({
    characterId: medic.characterId,
    characterName: medic.characterName,
    kind: 'stabilize',
    skillId: skill.id,
    request: {
      kind: 'stabilize',
      skillId: skill.id,
      stabilizeTokenId: target.tokenId,
      modifier: 0,
      luckSpent: 0,
    },
    // A stabilization is the table's business: somebody is bleeding out.
    visibility: 'public',
    title: `Ustabilizowanie → ${target.name}`,
    modifierTotal,
  });
}

/**
 * Loads „Leczenie" of one Critical Injury into the cup (stage 30b).
 *
 * Hand-planned like `loadStabilizeCup` above and for the same reason: the PT is
 * printed beside the *target's* wound and only the server may read it, so the
 * cup shows what the healer brings and the chat card shows what it was measured
 * against. The Medyk-only branch is the one place a skill level does not come
 * from `data.skills` — Chirurgia is bought with Medycyna points, not skill ones.
 */
export function loadTreatInjuryCup(
  healer: { characterId: string; characterName: string },
  target: { tokenId: string; name: string },
  injury: { id: string; name: string },
  option: CpredCareOption,
  data: CpredCharacterData,
  registry: CpredRegistry,
): void {
  const store = useRollStore.getState();
  const level = isCpredMedicineSkillId(option.skillId)
    ? cpredMedicineSkillLevel(data, registry, option.skillId)
    : (data.skills[option.skillId] ?? 0);
  // Both Medyk-only Skills are TECH-based (s. 149), so the fallback is theirs.
  const stat = registry.skills.find((skill) => skill.id === option.skillId)?.stat ?? 'tech';
  const modifierTotal =
    data.stats[stat] + level + woundCheckPenalty(woundState(data.hpCurrent, data.stats));

  store.loadCup({
    characterId: healer.characterId,
    characterName: healer.characterName,
    kind: 'treatInjury',
    request: {
      kind: 'treatInjury',
      treatTokenId: target.tokenId,
      treatInjuryId: injury.id,
      treatSkillId: option.skillId,
      modifier: 0,
      luckSpent: 0,
    },
    // Somebody's arm is being sewn back on: the table watches.
    visibility: 'public',
    title: `Leczenie: ${injury.name} → ${target.name}`,
    modifierTotal,
  });
}

/**
 * Ładuje Test Efektu Charyzmy do kubka (etap 30d, s. 144).
 *
 * Planowane przez `planCpredRoll`, bo cały rachunek stoi na karcie: ranga plus
 * kara za rany. PT nie jedzie w prośbie — zna je serwer z liczebności
 * publiczności, a kubek pokazuje tylko to, co Rocker do niego wkłada.
 */
export function loadCharismaCup(
  rocker: { characterId: string; characterName: string },
  audience: CpredCharismaAudience,
  purpose: CpredCharismaPurpose,
  data: CpredCharacterData,
  registry: CpredRegistry,
): void {
  const store = useRollStore.getState();
  const request: CpredRollRequest = {
    kind: 'charisma',
    charismaAudience: audience,
    charismaPurpose: purpose,
    modifier: store.lastModifier,
    luckSpent: 0,
  };
  const planned = planCpredRoll(data, registry, request);
  if (!planned.ok) return;
  store.loadCup({
    characterId: rocker.characterId,
    characterName: rocker.characterName,
    kind: 'charisma',
    request,
    visibility: store.lastVisibility,
    title: planned.plan.title,
    modifierTotal: planned.plan.modifierTotal,
  });
}

/**
 * Ładuje Test Rzetelności do kubka (etap 30d, s. 151).
 *
 * Kubek pokazuje `0`, bo tu naprawdę nie ma czego dodać: ranga kupuje
 * **szansę**, a nie modyfikator, i kość leci goła. Rzut jest publiczny —
 * publikacja jest sprawą stołu.
 */
export function loadReliabilityCup(
  media: { characterId: string; characterName: string },
  proof: CpredProofLevel,
  data: CpredCharacterData,
  registry: CpredRegistry,
): void {
  const store = useRollStore.getState();
  const request: CpredRollRequest = { kind: 'reliability', reliabilityProof: proof };
  const planned = planCpredRoll(data, registry, request);
  if (!planned.ok) return;
  store.loadCup({
    characterId: media.characterId,
    characterName: media.characterName,
    kind: 'reliability',
    request,
    visibility: 'public',
    title: planned.plan.title,
    modifierTotal: 0,
  });
}

/** Ładuje potajemny Test Pogłosek MG (etap 30d, s. 151) — zawsze szeptem. */
export function loadRumourCup(
  media: { characterId: string; characterName: string },
  data: CpredCharacterData,
  registry: CpredRegistry,
): void {
  const store = useRollStore.getState();
  const request: CpredRollRequest = { kind: 'rumour', modifier: 0, luckSpent: 0 };
  const planned = planCpredRoll(data, registry, request);
  if (!planned.ok) return;
  store.loadCup({
    characterId: media.characterId,
    characterName: media.characterName,
    kind: 'rumour',
    request,
    // „potajemny Test" — karta idzie do MG i do autora, nigdy na stół.
    visibility: 'gm',
    title: planned.plan.title,
    modifierTotal: planned.plan.modifierTotal,
  });
}
