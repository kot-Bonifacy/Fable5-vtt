import type {
  AttackEvadePayload,
  AttackSmartPayload,
  AttackRollPayload,
  AttackRollResult,
  ChatMessageView,
  CoverView,
  CompendiumEntry,
  CpredAmmoProfile,
  CpredAttackMeta,
  CpredAttackRequest,
  CpredCharacterData,
  CpredRegistry,
  MapFxEffect,
  RangeDvTable,
  ResolvedWeapon,
  RollAreaMeta,
  RollAttackMeta,
  RollBreakdownEntry,
  RollForcedCheck,
  RollGesture,
  RollResult,
  ScenePoint,
  SessionUser,
  WeaponAttachmentPayload,
  WeaponAttachmentResult,
  WeaponClearJamPayload,
  WeaponDrawPayload,
  WeaponReloadPayload,
} from '@vtt/shared';
import {
  cpredDrawnWeapons,
  cpredEffectiveStats,
  CPRED_ACTION_ATTACK,
  CPRED_ACTION_CLEAR_JAM,
  CPRED_ACTION_HOLSTER,
  CPRED_ACTION_RELOAD,
  CPRED_HANDS,
  CPRED_AUTOFIRE_SKILL_ID,
  CPRED_EVASION_SKILL_ID,
  CPRED_STAT_LABELS,
  CPRED_SUPPRESSIVE_RANGE_M,
  MAP_FX_MAX_TRACERS,
  ROLE_GM,
  ammoDealsDamage,
  ammoFitsWeapon,
  ammoOffersSecondRoll,
  ammoProfilesOf,
  attachmentMountProblem,
  attachmentProfilesOf,
  attachmentSlotsFree,
  fittedAttachmentsFor,
  resolveAttachmentWeapon,
  weaponMagazineWith,
  type CpredAttachmentProfile,
  cpredSheetOperatedBy,
  cpredSheetWithCombatValue,
  concentrationBase,
  cpredSmokeModifiers,
  cpredReloadSound,
  cpredWeaponFx,
  distanceToCover,
  loadedAmmoFor,
  formatMetres,
  isTokenInFog,
  metresPerPixel,
  isWeaponEntry,
  mergeCharacterData,
  metresBetween,
  metresBetweenTokens,
  metresForRules,
  parseCharacterData,
  passiveEvasionDv,
  planCpredAttack,
  planCpredRoll,
  resolveCpredAttack,
  resolveWeapon,
  rollFormula,
  tokenCentre,
} from '@vtt/shared';
import type { Character, Scene, Token } from '../generated/prisma/client.js';
import {
  SHEET_STATIST_WEAPON_ROW_ID,
  SHEET_SUPPRESSED_STATUS_ID,
  sheetDodgeBlock,
  sheetForRoll,
  sheetFacedownPenalty,
  sheetHumanShieldCovers,
  sheetSituationModifiers,
} from '../sheets.js';
import {
  areaTargets,
  describeArea,
  requireScenePoint,
  scatterBlast,
  toAreaMeta,
  type AreaShape,
  type BlastTarget,
} from './areas.js';
import { resolveAmmoChecks, type AmmoCheckTarget } from './ammo-effects.js';
import { placeSmoke, smokeModifiersAt } from './smoke.js';
import { emitMapFx, fxCentre } from './fx.js';
import { pinToken } from './turn-effects.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { grappleStateForToken, readTokenStatuses } from './combat.js';
import { claimRoundOnce } from './round-once.js';
import { requireTurnSpend } from './combat-actions.js';
import { requireRollableCharacter } from './character-rolls.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import {
  emitTokensById,
  emitTokensOfCharacter,
  requireCampaignToken,
  toTokenView,
  turnTokenToward,
} from './tokens.js';
import { buildCompendiumSync } from './compendium.js';
import { fetchFogState } from './fog-io.js';
import {
  coverBetween,
  hasClearShot,
  hasLineOfFire,
  loadVisionContext,
  type SceneVisionContext,
} from './vision.js';
import { toCoverView } from './covers-io.js';
import { toSceneView } from './scenes.js';
import {
  INCLUDE_CHAT_NAMES,
  broadcastRedactedChatMessage,
  deliverRollMessage,
  toChatMessageView,
} from './chat-io.js';
import { createMixedRng } from './dice-rng.js';
import { sanitizeGesture } from './chat.js';

/**
 * Attacks from the map (stage 16).
 *
 * The rule that shapes this module: **the client never sends a distance.** It
 * names an attacker, a weapon and a target token; the server reads both token
 * positions and the scene's scale, measures, and only then looks up the DV.
 * Anything else would let a client pick its own difficulty.
 *
 * The chain matches stage 15: the attack lands as a `roll` chat message whose
 * `attack` metadata carries the verdict and the follow-up damage notation, so
 * pressing „Obrażenia" is an ordinary damage roll that already knows its
 * target, and „Zastosuj" is the stage 15 flow, untouched.
 */

/**
 * Rounds a burst draws on the map.
 *
 * „Seria" spends ten rounds (`CPRED_BURST_AMMO_COST`) and ten separate tracers
 * over a metre of screen are a smear, not a burst. Five reads as automatic fire
 * and still lets the eye follow the line — the same „draw what is legible, not
 * what is counted" call `MAP_FX_MAX_TRACERS` makes for suppressive fire.
 */
const CPRED_BURST_TRACERS = 5;

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

/** Name of a target that is a patch of ground rather than somebody (stage 16d). */
const POINT_TARGET_NAME = 'wybrane pole';

/** Catalogue row every throw reads its DV off (s. 177). */
const GRENADE_LAUNCHER_TYPE_ID = 'weapon-type.grenade-launcher';

/**
 * The range line a thrown object is judged by.
 *
 * Read from the catalogue rather than written here, because it *is* catalogue
 * data — the rulebook numbers live in `data/private`. A campaign whose
 * compendium never got the launcher falls back to whatever else is thrown, and
 * only then gives up: without a table there is no DV, which the planner says in
 * plain Polish.
 */
async function throwProfileOf(
  deps: RealtimeDeps,
  campaignId: string,
): Promise<{ rangeDv: RangeDvTable } | undefined> {
  const compendium = await buildCompendiumSync(deps, campaignId);
  const type =
    compendium.weaponTypes.find((candidate) => candidate.id === GRENADE_LAUNCHER_TYPE_ID) ??
    compendium.weaponTypes.find((candidate) => candidate.thrown === true && candidate.rangeDv);
  return type?.rangeDv ? { rangeDv: type.rangeDv } : undefined;
}

/**
 * The weapon row plus everything the catalogue knows about it. A row typed in
 * by hand resolves to nothing, which the planner rejects for ranged attacks —
 * without a range table there is no DV.
 */
interface ResolvedWeaponRow {
  row: CpredCharacterData['weapons'][number];
  resolved: ResolvedWeapon | null;
  typeId: string | null;
  ammo: CpredAmmoProfile | null;
  /** Attachments bolted to the row, resolved from the catalogue (stage 31). */
  attachments: CpredAttachmentProfile[];
  /** The weapon `attachmentId` names, when the caller asked for one. */
  secondary: ResolvedWeapon | null;
  /** The round in *that* weapon's own magazine (02.09). */
  secondaryAmmo: CpredAmmoProfile | null;
}

async function resolveWeaponRow(
  deps: RealtimeDeps,
  campaignId: string,
  data: CpredCharacterData,
  weaponRowId: unknown,
  /**
   * Attachment the shot is being fired *with* (stage 31). Resolved here rather
   * than in the planner for the reason the weapon and the round are: the
   * catalogue is the server's, and the planner is handed facts.
   */
  attachmentId?: unknown,
): Promise<ResolvedWeaponRow> {
  if (typeof weaponRowId !== 'string') throw new RealtimeError('BAD_REQUEST');
  const row = data.weapons.find((weapon) => weapon.id === weaponRowId);
  if (!row) throw new RealtimeError('UNKNOWN_WEAPON');
  const bare = {
    row,
    resolved: null,
    typeId: null,
    ammo: null,
    attachments: [],
    secondary: null,
    secondaryAmmo: null,
  };
  if (!row.compendiumId) return bare;

  const compendium = await buildCompendiumSync(deps, campaignId);
  const entry = compendium.entries.find((candidate) => candidate.id === row.compendiumId);
  if (!entry || !isWeaponEntry(entry)) return bare;
  const weaponTypeById = new Map(compendium.weaponTypes.map((type) => [type.id, type]));
  const resolved = resolveWeapon(entry, { weaponTypeById });
  const attachments = fittedAttachmentsFor(
    row.attachmentIds,
    attachmentProfilesOf(compendium.entries),
    resolved,
  );
  const firedWith =
    typeof attachmentId === 'string'
      ? attachments.find((candidate) => candidate.id === attachmentId)
      : undefined;
  const lookup = ammoLookup(compendium.entries);
  const secondary = firedWith ? resolveAttachmentWeapon(firedWith, { weaponTypeById }) : null;
  return {
    row,
    resolved,
    typeId: entry.weaponTypeId,
    // Stage 16g: what is actually in the magazine. Read here rather than in the
    // planner for the same reason the weapon is — the catalogue is the server's,
    // and the planner is handed facts, never a place to look them up.
    ammo: loadedAmmoFor(row, resolved, lookup),
    attachments,
    secondary,
    // The bolted-on weapon's own magazine has its own load (02.09), read the
    // same way and from the same catalogue.
    secondaryAmmo:
      firedWith && secondary
        ? loadedAmmoFor({ ...(attachmentAmmoIdOf(row, firedWith.id) ?? {}) }, secondary, lookup)
        : null,
  };
}

/** The round loaded in one bolted-on weapon, as `loadedAmmoFor` wants it. */
function attachmentAmmoIdOf(
  row: CpredCharacterData['weapons'][number],
  attachmentId: string,
): { ammoId: string } | null {
  const ammoId = row.attachmentAmmoId?.[attachmentId];
  return ammoId ? { ammoId } : null;
}

/** Catalogue lookup for one campaign's ammunition rows (stage 16g). */
function ammoLookup(entries: readonly CompendiumEntry[]): (id: string) => CpredAmmoProfile | null {
  const byId = new Map(ammoProfilesOf(entries).map((ammo) => [ammo.id, ammo]));
  return (id) => byId.get(id) ?? null;
}

/** The token doing the shooting: the one named, or the character's on that scene. */
async function resolveAttackerToken(
  deps: RealtimeDeps,
  campaignId: string,
  character: Character,
  sceneId: string,
  attackerTokenId: unknown,
): Promise<Token> {
  if (typeof attackerTokenId === 'string' && attackerTokenId.length > 0) {
    const { token } = await requireCampaignToken(deps.ctx.prisma, campaignId, attackerTokenId);
    if (token.characterId !== character.id) throw new RealtimeError('ATTACKER_NOT_LINKED');
    if (token.sceneId !== sceneId) throw new RealtimeError('ATTACKER_ON_OTHER_SCENE');
    return token;
  }
  const token = await deps.ctx.prisma.token.findFirst({
    where: { characterId: character.id, sceneId },
  });
  if (!token) throw new RealtimeError('ATTACKER_NOT_ON_SCENE');
  return token;
}

/**
 * Which scene a point-aimed attack happens on (stage 16d).
 *
 * A token target brings its own scene and a cover brings its own; a patch of
 * ground brings nothing, so the thrower supplies it. Authorisation has already
 * happened by the time this runs — the character was proven rollable, and a
 * statist's token is proven controllable a few lines further down.
 */
async function requireAttackerScene(
  deps: RealtimeDeps,
  campaignId: string,
  character: Character | null,
  attackerTokenId: unknown,
): Promise<Scene> {
  if (typeof attackerTokenId === 'string' && attackerTokenId.length > 0) {
    const { scene } = await requireCampaignToken(deps.ctx.prisma, campaignId, attackerTokenId);
    return scene;
  }
  if (character) {
    const token = await deps.ctx.prisma.token.findFirst({
      where: { characterId: character.id, scene: { campaignId } },
      include: { scene: true },
    });
    if (token) return token.scene;
  }
  throw new RealtimeError('ATTACKER_NOT_ON_SCENE');
}

/**
 * Stand-in evasion DV of the defender.
 *
 * Jedno źródło od etapu 38a: karta figury. Figura bez karty wraca `undefined`
 * i spada na codzienne PT — przed 16b robił tak **każdy** statysta, cokolwiek
 * MG dla niego wymyślił. Wartość bojowa wchodzi tu przez `sheetForRoll`, więc
 * funkcjonariusz Wsparcia broni się czternastką, a nie Unikiem 0.
 */
async function targetEvasionDv(
  deps: RealtimeDeps,
  registry: CpredRegistry,
  token: Token,
): Promise<number | undefined> {
  if (!token.characterId) return undefined;
  const character = await deps.ctx.prisma.character.findUnique({
    where: { id: token.characterId },
  });
  if (!character) return undefined;
  const data = sheetForRoll(parseCharacterData(character.data, registry), null);
  return passiveEvasionDv(data, registry);
}

/**
 * The −2 this shooter owes a Konfrontacja they lost to this particular target
 * (stage 23c), as zero or one breakdown row. Empty for a shot at a cover or at
 * bare ground: fear is of a person, and neither of those is one.
 */
function facedownPenaltyRows(
  attacker: Token,
  targetTokenId: string | undefined,
): RollBreakdownEntry[] {
  const row = sheetFacedownPenalty(
    { statuses: readTokenStatuses(attacker.statuses), statusData: attacker.statusData },
    targetTokenId,
  );
  return row ? [row] : [];
}

/**
 * Who is making this attack.
 *
 * **Jedno ramię od etapu 38a.** Do 38a były dwa — karta postaci i „profil
 * bojowy" żetonu — i to drugie zniknęło razem z profilem: każda figura, którą
 * ktoś ostatystykował, ma odtąd prawdziwą kartę. Cała reszta ścieżki ataku
 * (planer, rozbicie rzutu, budżet tury, karta czatu) pracowała na
 * `CpredCharacterData` już wcześniej i nigdy nie dowiedziała się o statystach;
 * teraz nie ma się czego nie dowiadywać.
 */
interface AttackSource {
  character: Character;
  token: Token;
  data: CpredCharacterData;
}

/**
 * Name shown as the actor of the roll.
 *
 * Figura prowadzona przez MG mówi nazwą **żetonu**, nie karty: to ona stoi na
 * mapie i to ją zmienia klonowanie („Ganger" → „Ganger 2"). Karta gracza mówi
 * swoją — tam nazwa karty jest imieniem postaci, a żeton bywa byle jaki.
 */
function sourceName(source: AttackSource): string {
  return source.character.ownerId === null ? source.token.name : source.character.name;
}

/**
 * The statist token this socket may fire with.
 *
 * A statist has no owner in the sheet sense, so control follows the token: the
 * GM always, a player only for a token that is theirs. The refusals reuse the
 * codes the character path already speaks, so the client's error table did not
 * have to grow a second vocabulary.
 */
async function resolveStatistToken(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  sceneId: string,
  attackerTokenId: unknown,
  /**
   * Stage 26d: the caller has already proved the right to fire this one. A
   * netrunner holding the turret's control node does not own its figure and
   * never will — the node *is* the permission, and it was checked upstream.
   */
  authorised = false,
): Promise<Token> {
  if (typeof attackerTokenId !== 'string' || attackerTokenId.length === 0) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const { token } = await requireCampaignToken(deps.ctx.prisma, campaignId, attackerTokenId);
  if (token.sceneId !== sceneId) throw new RealtimeError('ATTACKER_ON_OTHER_SCENE');
  if (!authorised && user.role !== ROLE_GM && token.ownerId !== user.id) {
    throw new RealtimeError('CHARACTER_NOT_FOUND');
  }
  return token;
}

/**
 * Spends Luck and ammunition in one write, and re-emits whatever holds them.
 *
 * Jedno miejsce zapisu od etapu 38a: cała `CpredCharacterData` wraca na kartę.
 * Figura ostatystykowana szybkim edytorem nie wydaje Szczęścia — jej karta go
 * nie ma, a planer odmawia takiej prośbie na długo przed tym miejscem.
 */
async function spendAttackCosts(
  deps: RealtimeDeps,
  campaignId: string,
  source: AttackSource,
  meta: CpredAttackMeta,
  luckSpent: number,
): Promise<void> {
  if (luckSpent === 0 && meta.ammoCost === 0) return;

  const { character, data } = source;
  // Stage 31: a shot from a bolted-on weapon spends the *attachment's* rounds.
  // The card already carries which weapon fired („attachmentId"), so the write
  // needs no second lookup — and the rifle's magazine is left alone, which is
  // the whole point of the underbarrel having one of its own.
  const weapons = data.weapons.map((row) => {
    if (row.id !== meta.weaponRowId) return row;
    if (!meta.attachmentId) return { ...row, ammoCurrent: meta.ammoAfter };
    return {
      ...row,
      attachmentAmmo: { ...(row.attachmentAmmo ?? {}), [meta.attachmentId]: meta.ammoAfter },
    };
  });
  const updated = mergeCharacterData(data, {
    weapons,
    ...(luckSpent > 0 ? { luckCurrent: data.luckCurrent - luckSpent } : {}),
  });
  const saved = await deps.ctx.prisma.character.update({
    where: { id: character.id },
    data: { data: JSON.stringify(updated) },
  });
  await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
  await emitTokensOfCharacter(deps, campaignId, saved);
}

/** What the attack card adds when the shot broke the gun that made it. */
const CPRED_JAM_DETAIL = 'broń niskiej jakości zacięła się — usuń usterkę (Akcja)';

/**
 * „Broń niskiej jakości zaczyna źle działać zawsze, gdy dojdzie do Krytycznej
 * Porażki (wyrzucisz 1 w Teście ataku). Dopóki w ramach Akcji nie usuniesz
 * usterki, broń nie nadaje się do użytku" (s. 244).
 *
 * Three conditions, and each of them earns its place:
 *
 *  - the die was a **natural 1 that counted**. A Solo who bought Wyjście
 *    z opresji „ignoruje Krytyczne porażki … wyrzucone w Testach ataku"
 *    (s. 146) — an ignored fumble is not a fumble, so their Dai Lung holds;
 *  - the shot came from the **host weapon**, not from something bolted under
 *    it: an attachment's weapon is built from a weapon *type* and has no
 *    quality to be poor;
 * Jakość broni czyta się z wpisu kompendium, więc figura, której broń nie ma
 * wpisu (gołe pięści, broń wklepana ręcznie), po prostu nie dostaje tego
 * pytania — i tak było, gdy ta broń mieszkała w profilu bojowym.
 *
 * Returns whether the gun jammed, so the card can say so.
 */
async function jamPoorWeapon(
  deps: RealtimeDeps,
  campaignId: string,
  source: AttackSource,
  meta: CpredAttackMeta,
  resolved: ResolvedWeapon | null | undefined,
  result: RollResult,
): Promise<boolean> {
  if (meta.attachmentId) return false;
  if (resolved?.quality !== 'poor') return false;
  const critical = result.critical;
  if (!critical || critical.type !== 'fumble' || critical.ignored === true) return false;
  const { character, data } = source;
  const row = data.weapons.find((weapon) => weapon.id === meta.weaponRowId);
  if (!row || row.jammed === true) return false;
  await saveWeaponRow(deps, campaignId, character, data, row.id, { jammed: true });
  return true;
}

/** „24 m (13–25 m) · PT 15" — the card's explanation line. */
function attackDetail(meta: CpredAttackMeta): string {
  const parts: string[] = [];
  if (!meta.melee) {
    parts.push(
      meta.rangeLabel
        ? `${formatMetres(meta.metres)} (${meta.rangeLabel})`
        : formatMetres(meta.metres),
    );
  } else {
    parts.push(`zwarcie · ${formatMetres(meta.metres)}`);
  }
  if (meta.dv !== null) {
    parts.push(
      meta.dvSource === 'evasion'
        ? `PT ${meta.dv} (Unik celu)`
        : meta.dvSource === 'everyday'
          ? `PT ${meta.dv} (bez karty — PT codzienny)`
          : meta.dvSource === 'spread'
            ? `PT ${meta.dv} (śrut — stały)`
            : `PT ${meta.dv}`,
    );
  }
  // What was in the magazine (stage 16g). Ordinary ammunition says nothing,
  // because „Nie ma cech specjalnych" is not worth a line on every card.
  if (meta.ammo) parts.push(`nabój: ${meta.ammo.name}`);
  if (meta.mode !== 'single') parts.push(meta.modeLabel);
  // Stan magazynka celowo NIE trafia na kartę (decyzja MG z 01.09.2026): licznik
  // naboi stoi w panelu postaci przy broni i odświeża się tym samym strzałem, a
  // druga kopia tej samej liczby na końcu każdej linii ataku była szumem.
  // `meta.ammoAfter` i `meta.ammoMax` zostają w metadanych — czyta je serwer
  // (odmowa strzału pustą bronią) i bot planujący turę.
  return parts.join(' · ');
}

/**
 * Everyone the suppressing volley can reach: tokens within 25 m that the
 * shooter has a line to.
 *
 * The line of fire is stage 16b closing a hole the rule always had. RAW is
 * explicit — „wszystkie … osoby w zasięgu 25 m, **które widzisz**" (s. 174) —
 * and until now the radius was the whole of it, so a burst down a corridor
 * pinned everyone in the neighbouring flat.
 */
async function suppressionTargets(
  deps: RealtimeDeps,
  scene: Scene,
  attacker: Token,
  fire: FireContext,
): Promise<{ token: Token; metres: number }[]> {
  const tokens = await deps.ctx.prisma.token.findMany({ where: { sceneId: scene.id } });
  const view = toSceneView(scene);
  const found: { token: Token; metres: number }[] = [];
  for (const token of tokens) {
    if (token.id === attacker.id) continue;
    const metres = metresForRules(
      metresBetweenTokens(toTokenView(attacker, true), toTokenView(token, true), view),
    );
    if (metres > CPRED_SUPPRESSIVE_RANGE_M) continue;
    if (!(await clearShotBetween(deps, scene, attacker, token, fire))) continue;
    found.push({ token, metres });
  }
  return found.sort((a, b) => a.metres - b.metres);
}

/**
 * The scene geometry an attack is judged against, loaded at most once per
 * attack. A cache rather than a plain call because suppressive fire asks the
 * same question of every token in a 25 m radius, and the wall list does not
 * change between those questions.
 */
interface FireContext {
  loaded: SceneVisionContext | null;
}

/**
 * Can the volley reach that token at all — walls, shut doors *and* cover?
 *
 * Suppressive fire is the one place the two obstacles get the same answer
 * (stage 16c). It has no card to write and no target to offer instead: it
 * sprays a cone and asks each figure in it to keep its head down, and somebody
 * already behind a car is not going to be impressed. So a cover simply takes
 * them off the list, exactly as a wall does.
 */
async function clearShotBetween(
  deps: RealtimeDeps,
  scene: Scene,
  from: Token,
  to: Token,
  fire: FireContext,
): Promise<boolean> {
  const context = fire.loaded ?? (await loadVisionContext(deps.ctx.prisma, scene));
  fire.loaded = context;
  if (context.walls.length === 0 && context.covers.length === 0) return true;
  const view = toSceneView(scene);
  return hasClearShot(
    context,
    tokenCentre(toTokenView(from, true), view),
    tokenCentre(toTokenView(to, true), view),
  );
}

/** The same question between two bare points — cover is a rectangle, not a token. */
async function lineOfFireTo(
  deps: RealtimeDeps,
  scene: Scene,
  from: ScenePoint,
  to: ScenePoint,
  fire: FireContext,
): Promise<boolean> {
  const context = fire.loaded ?? (await loadVisionContext(deps.ctx.prisma, scene));
  fire.loaded = context;
  // A scene nobody has drawn walls on cannot block anything, and paying for the
  // raycast there would tax every attack in the campaign for nothing.
  if (context.walls.length === 0) return true;
  return hasLineOfFire(context, from, to);
}

/**
 * The cover standing in the way, if any (stage 16c).
 *
 * `exceptCoverId` takes the target itself out of the test: shooting *at* a car
 * would otherwise be refused because of the car, since a segment that ends
 * inside a rectangle counts as crossing it.
 */
async function blockingCoverFor(
  deps: RealtimeDeps,
  scene: Scene,
  from: ScenePoint,
  to: ScenePoint,
  fire: FireContext,
  exceptCoverId: number | null,
): Promise<CoverView | null> {
  const context = fire.loaded ?? (await loadVisionContext(deps.ctx.prisma, scene));
  fire.loaded = context;
  if (context.covers.length === 0) return null;
  const found = coverBetween(context, from, to);
  if (!found || found.id === exceptCoverId) return null;
  return found;
}

/**
 * Where a shot at a cover lands: the point of the rectangle nearest the
 * shooter. „Aim at the middle of the car" would send the line through the near
 * half of the bodywork and let the car block a shot at itself.
 */
function coverAimPoint(origin: ScenePoint, cover: CoverView): ScenePoint {
  return {
    x: Math.min(Math.max(origin.x, cover.x), cover.x + cover.width),
    y: Math.min(Math.max(origin.y, cover.y), cover.y + cover.height),
  };
}

/** Loads a cover row and proves it belongs to this campaign. */
async function requireCampaignCover(deps: RealtimeDeps, campaignId: string, coverId: unknown) {
  if (typeof coverId !== 'number' || !Number.isInteger(coverId)) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const row = await deps.ctx.prisma.cover.findUnique({
    where: { id: coverId },
    include: { scene: true },
  });
  if (!row || row.scene.campaignId !== campaignId) throw new RealtimeError('COVER_NOT_FOUND');
  return { ...toCoverView(row), scene: row.scene };
}

/**
 * The Human Shield this target is hiding behind (stages 14d, 16c), or null.
 *
 * „Dopóki zasłaniasz się Ludzką tarczą, uznaje się, że jesteś za osłoną"
 * (s. 181) — and cover, in this project since stage 16c, means the shot has to
 * go through the thing in front. `sheetHumanShieldCovers` still decides *when*
 * the shield counts: it does nothing against a melee swing, and nothing against
 * a shot aimed at the head above it.
 */
async function humanShieldOf(
  deps: RealtimeDeps,
  sceneId: string,
  targetTokenId: string,
  attack: { melee: boolean; aimedAtHead: boolean },
): Promise<{ tokenId: string; name: string } | null> {
  if (!sheetHumanShieldCovers({ melee: attack.melee, aimedAtHead: attack.aimedAtHead }))
    return null;
  const state = await grappleStateForToken(deps.ctx.prisma, sceneId, targetTokenId);
  const shield = state.shieldOf;
  if (!shield || !shield.token || !shield.tokenId) return null;
  return { tokenId: shield.tokenId, name: shield.token.name };
}

/**
 * Rolls each target's forced WILL + Concentration check against the volley.
 *
 * The rules make this check mandatory, so the server rolls it rather than
 * waiting for every target to pick up a cup — the criterion of the stage is
 * that suppressive fire *forces* the checks and logs them. Targets with no
 * sheet use their bare WILL of 5, the statist default.
 */
async function resolveSuppression(
  deps: RealtimeDeps,
  campaignId: string,
  registry: CpredRegistry,
  targets: { token: Token; metres: number }[],
  dv: number,
): Promise<RollForcedCheck[]> {
  const rng = createMixedRng();
  const checks: RollForcedCheck[] = [];
  for (const { token, metres } of targets) {
    let modifier = 5;
    if (token.characterId) {
      const character = await deps.ctx.prisma.character.findUnique({
        where: { id: token.characterId },
      });
      if (character)
        modifier = concentrationBase(parseCharacterData(character.data, registry), registry);
    }
    const die = rng(10);
    const total = die + modifier;
    // Ties go to the defender here too: the target has to *fail* to be pinned.
    const resisted = total > dv;
    checks.push({
      name: token.name,
      detail: `${formatMetres(metres)} · SW+Koncentracja ${die}+${modifier} = ${total} vs ${dv}${
        resisted ? '' : ' — do osłony'
      }`,
      success: resisted,
      // Stage 16h closes the leak this list has had since 16: the card goes to
      // the whole table, and it names every figure within 25 m — hidden ones and
      // ones standing in unrevealed fog included.
      ownerId: await controllerOfToken(deps, token),
    });
    // Stage 14e closes the loop the card opened: whoever failed the check is
    // marked „Przygwożdżony" until the end of their own next turn. Soft by
    // design — the map has no cover model, so the status nags rather than
    // refuses, which is exactly what the POMYSLY entry from 28.07 asked for.
    if (!resisted) await pinToken(deps, campaignId, token.id, SHEET_SUPPRESSED_STATUS_ID);
  }
  return checks;
}

/** Who may read a card row naming this figure — its owner, or its sheet's. */
async function controllerOfToken(deps: RealtimeDeps, token: Token): Promise<string | null> {
  if (token.ownerId) return token.ownerId;
  if (!token.characterId) return null;
  const character = await deps.ctx.prisma.character.findUnique({
    where: { id: token.characterId },
    select: { ownerId: true },
  });
  return character?.ownerId ?? null;
}

/**
 * Karta figury, którą prowadzi się przez żeton (etap 38a).
 *
 * Wspólna droga dla ataku, przeładowania i uniku figury, która nie jest niczyją
 * postacią: ganger, wieżyczka, funkcjonariusz Wsparcia. Odmowa zostaje ta sama,
 * którą klient zna od 16b — `TOKEN_HAS_NO_PROFILE` znaczy dziś „ta figura nie
 * ma karty", i to jest dokładnie ten sam stan co „nikt jej nie ostatystykował".
 */
async function requireFigureSheet(
  deps: RealtimeDeps,
  campaignId: string,
  registry: CpredRegistry,
  token: Token,
): Promise<{ character: Character; data: CpredCharacterData }> {
  if (!token.characterId) throw new RealtimeError('TOKEN_HAS_NO_PROFILE');
  const character = await deps.ctx.prisma.character.findUnique({
    where: { id: token.characterId },
  });
  if (!character || character.campaignId !== campaignId) {
    throw new RealtimeError('TOKEN_HAS_NO_PROFILE');
  }
  return { character, data: parseCharacterData(character.data, registry) };
}

/**
 * Dresses a token-run figure as an attacker.
 *
 * Two passes, and the second one is not laziness: which skill fires the weapon
 * is a property of the *weapon type* in the compendium, so the sheet has to
 * exist before the catalogue can be asked, and the answer then decides which
 * skill carries the figure's combat level (`statBlock.weaponSkill`). Building
 * it in one pass would mean either hard-coding the skill or handing the figure
 * every skill at once — and „trained in everything" is exactly what a figure
 * statted from the token menu must not be.
 */
async function buildFigureSource(
  deps: RealtimeDeps,
  campaignId: string,
  registry: CpredRegistry,
  token: Token,
  request: CpredAttackRequest | undefined,
  /**
   * Whose hand is on the trigger, when it is not the figure's own.
   *
   * Stage 26d: a netrunner's Skills — „rzucając na Umiejętności tego
   * Netrunnera" (s. 213). Stage 26e: a Demon's single „Wartość bojowa", the one
   * number a machine rolls with (s. 212, s. 214). The magazine and the plating
   * stay the turret's in both cases, which is why the *stored* card below is
   * never the substituted one.
   */
  hands?: { operator?: CpredCharacterData; combatValue?: number },
): Promise<AttackSource> {
  const { character, data } = await requireFigureSheet(deps, campaignId, registry, token);

  // Pass one: a sheet good enough to look the weapon up with.
  const weapon = await resolveWeaponRow(deps, campaignId, data, SHEET_STATIST_WEAPON_ROW_ID);
  const skillId =
    request?.mode === 'autofire' || request?.mode === 'suppressive'
      ? CPRED_AUTOFIRE_SKILL_ID
      : (weapon.resolved?.skillId ?? request?.skillId ?? null);

  // Pass two: the same sheet with that one skill filled in — from the figure's
  // own combat level, or from whoever is aiming it instead.
  const firing = hands?.operator
    ? cpredSheetOperatedBy(data, hands.operator, skillId)
    : hands?.combatValue !== undefined
      ? cpredSheetWithCombatValue(data, hands.combatValue)
      : data;
  return { character, token, data: sheetForRoll(firing, skillId) };
}

export const attackRollEvent = defineEvent<AttackRollPayload<CpredAttackRequest>, AttackRollResult>(
  {
    name: 'attack:roll',
    handler: async ({ deps, socket, user, payload }) =>
      performAttackRoll(deps, { campaignId: requireCampaignId(socket.data), user, payload }),
  },
);

/**
 * One attack, from the intention to the card on chat.
 *
 * Split out of the handler in stage 20b for the same reason `performCharacterRoll`
 * was split out in 20a: a bot taking its turn has no socket, and „the bot shoots
 * through exactly the code a player shoots through" is only true while there is
 * one copy of it. Everything the handler used to read off the socket is a
 * parameter now — and nothing else changed.
 */
export async function performAttackRoll(
  deps: RealtimeDeps,
  options: {
    campaignId: string;
    /** Whose permissions apply; a bot borrows the GM account (stage 11). */
    user: SessionUser;
    payload: AttackRollPayload<CpredAttackRequest> | undefined;
    /**
     * A defence system fired from a control node. The token shoots, the hand
     * named here rolls, and the Net Action that bought the shot has already
     * been billed — so the figure's own turn budget is left alone.
     *
     * Stage 26d puts a netrunner's whole sheet here; stage 26e puts a Demon's
     * „Wartość bojowa", which is one number standing for Stat and Skill at once.
     */
    device?: { operator?: CpredCharacterData; combatValue?: number };
  },
): Promise<AttackRollResult> {
  {
    const { campaignId, user, payload, device } = options;
    {
      const registry = deps.ctx.cpred;
      // Stage 16b: an attack no longer has to come from a sheet. Naming no
      // character means „the token itself is the fighter", and the profile on it
      // supplies the numbers a sheet would have.
      const statist = typeof payload?.characterId !== 'string' || payload.characterId.length === 0;
      const character = statist
        ? null
        : await requireRollableCharacter(deps, campaignId, user, payload?.characterId);

      // Stage 16c: the thing being shot at is a token **or** a cover; stage 16d
      // adds a third — a patch of ground. All three arms end in the same planner
      // call, and only where the name, the distance and the defence come from
      // differs. A point has no scene of its own, so the attacker's supplies it.
      const pointAim = payload?.targetPoint !== undefined;
      const coverTarget =
        !pointAim && payload?.targetCoverId !== undefined
          ? await requireCampaignCover(deps, campaignId, payload.targetCoverId)
          : null;
      const tokenTarget =
        pointAim || coverTarget
          ? null
          : await requireCampaignToken(deps.ctx.prisma, campaignId, payload?.targetTokenId);
      const target = tokenTarget?.token ?? null;
      const scene = coverTarget
        ? coverTarget.scene
        : tokenTarget
          ? tokenTarget.scene
          : await requireAttackerScene(deps, campaignId, character, payload?.attackerTokenId);

      // A hidden token must not even be targetable by a player: a rejected
      // attack would tell them exactly where it stands. Unrevealed fog conceals
      // a token just as completely (stage 17), so it gets the same answer —
      // unless the player controls the token, in which case they can see it.
      if (target && user.role !== ROLE_GM) {
        if (target.hidden) throw new RealtimeError('TOKEN_NOT_FOUND');
        const fog = await fetchFogState(deps.ctx.prisma, scene);
        const controlledByPlayer =
          target.ownerId === user.id ||
          (target.characterId !== null && target.characterId === character?.id);
        if (
          fog.enabled &&
          !controlledByPlayer &&
          isTokenInFog(toTokenView(target, false), toSceneView(scene), fog)
        ) {
          throw new RealtimeError('TOKEN_NOT_FOUND');
        }
      }

      const attacker = character
        ? await resolveAttackerToken(
            deps,
            campaignId,
            character,
            scene.id,
            payload?.attackerTokenId,
          )
        : await resolveStatistToken(
            deps,
            campaignId,
            user,
            scene.id,
            payload?.attackerTokenId,
            device !== undefined,
          );
      if (target && attacker.id === target.id) throw new RealtimeError('BAD_REQUEST');

      const source = character
        ? ({
            character,
            token: attacker,
            data: parseCharacterData(character.data, registry),
          } satisfies AttackSource)
        : await buildFigureSource(deps, campaignId, registry, attacker, payload?.request, device);
      const data = source.data;

      const sceneView = toSceneView(scene);
      const origin = tokenCentre(toTokenView(attacker, true), sceneView);
      // Where this attack is pointed. A token is aimed at its middle, a cover at
      // its nearest edge (16c), and a patch of ground at the middle of its square
      // — the point the client clicked, snapped by the server and never trusted.
      const aimPoint = target
        ? tokenCentre(toTokenView(target, true), sceneView)
        : coverTarget
          ? coverAimPoint(origin, coverTarget)
          : requireScenePoint(payload?.targetPoint, scene);
      const metres = target
        ? metresForRules(
            metresBetweenTokens(toTokenView(attacker, true), toTokenView(target, true), sceneView),
          )
        : coverTarget
          ? metresForRules(distanceToCover(origin, coverTarget) * metresPerPixel(sceneView))
          : metresForRules(metresBetween(origin, aimPoint, sceneView));

      const weapon = await resolveWeaponRow(
        deps,
        campaignId,
        data,
        payload?.request?.weaponRowId,
        payload?.request?.attachmentId,
      );
      // Being in a Hold is −2 to everything and takes two-handed weapons away
      // (stage 14d). Read from the tracker, never from the request.
      const attackerGrapple = await grappleStateForToken(deps.ctx.prisma, scene.id, attacker.id);
      // What stands between the two of them (stage 16b). Measured here, never
      // sent: the walls do not leave the server, so the client's preview cannot
      // know and deliberately does not guess.
      const fire: FireContext = { loaded: null };
      const explosive = weapon.resolved?.explosive === true;
      const lineOfFire = await lineOfFireTo(deps, scene, origin, aimPoint, fire);
      // Cover, on the other hand, *is* client-visible, so the same obstacle is
      // reported by name — and answered with a choice rather than an error.
      //
      // A wall outranks it: with both a wall and a car in the way, offering
      // „ostrzelaj samochód" would send somebody through a whole exchange to
      // arrive at „cel za przeszkodą" anyway. So the cover is only looked for
      // once the geometry has already said the shot could get there.
      //
      // Nothing blocks a grenade on the way out (stage 16d): it is lobbed over
      // the bonnet, and the car has its say where the charge goes off instead.
      const blocking =
        lineOfFire === false || explosive
          ? null
          : await blockingCoverFor(deps, scene, origin, aimPoint, fire, coverTarget?.id ?? null);
      if (blocking && payload?.request?.ignoreCover !== true) {
        return {
          blocked: {
            kind: 'cover',
            coverId: blocking.id,
            name: blocking.name,
            hpCurrent: blocking.hpCurrent,
            hpMax: blocking.hpMax,
          },
        };
      }

      // „Dopóki zasłaniasz się Ludzką tarczą, uznaje się, że jesteś za osłoną"
      // (s. 181). Since stage 16c that sentence has teeth: the shot is stopped by
      // the person in the way, and the card offers them as the target — their
      // body points are the cover's, because they *are* the cover.
      if (target && payload?.request?.ignoreCover !== true) {
        const shield = await humanShieldOf(deps, scene.id, target.id, {
          melee: weapon.resolved?.melee ?? false,
          // „nie można nimi zasłaniać się … przed atakami dystansowymi
          // wycelowanymi w twoją **głowę**" (s. 181) — a shot aimed at the leg
          // or at a held gun goes into the shield like any other.
          aimedAtHead: payload?.request?.aimedAt === 'head',
        });
        if (shield) {
          return { blocked: { kind: 'shield', tokenId: shield.tokenId, name: shield.name } };
        }
      }

      const planned = planCpredAttack(
        data,
        registry,
        payload?.request ?? ({} as CpredAttackRequest),
        // The row, its catalogue entry and the round in the magazine — the three
        // things that decide what leaves the barrel (stage 16g).
        weapon,
        target
          ? {
              name: target.name,
              tokenId: target.id,
              metres,
              ...(weapon.resolved?.melee
                ? { evasionDv: await targetEvasionDv(deps, registry, target) }
                : {}),
            }
          : coverTarget
            ? { name: coverTarget.name, coverId: coverTarget.id, metres, cover: true }
            : { name: POINT_TARGET_NAME, metres, point: true },
        {
          modifiers: [
            ...sheetSituationModifiers({
              grappled: attackerGrapple.grappled,
              injuries: data.criticalInjuries,
            }),
            // „−2 do wszystkich Akcji wymierzonych w tego przeciwnika" (s. 194,
            // stage 23c). Charged here rather than inside `sheetSituationModifiers`
            // because it is the only modifier in this project that depends on
            // *who* is being shot at — a shooter who backed down from this one
            // is steady as a rock aiming at anybody else.
            ...facedownPenaltyRows(attacker, target?.id),
            // Standing in smoke is −4 to everything the shooter does (s. 347,
            // stage 16h) — a named row in the breakdown like every other
            // situational modifier, never a silent correction of the total.
            ...cpredSmokeModifiers(await smokeModifiersAt(deps, scene, origin)),
          ],
          ...(attackerGrapple.grappled ? { grappled: true } : {}),
          lineOfFire,
          // „PT określasz, używając wiersza Granatnika w tabeli PT zasięgów"
          // (s. 177) — the line lives in the catalogue, so the planner is handed
          // it rather than allowed to go looking.
          ...(payload?.request?.thrown === true
            ? { throwProfile: await throwProfileOf(deps, campaignId) }
            : {}),
        },
      );
      if (!planned.ok) throw new RealtimeError(planned.error);
      const { plan } = planned;
      const meta = plan.attack;

      // The turn budget is charged *before* anything is spent for real: an attack
      // that has no Action left must not eat ammunition or Luck on its way to the
      // refusal. „Liczba Ataków" decides whether this one fits (stage 14b).
      //
      // A turret fired from a control node is the one exception (stage 26d): the
      // Net Action that bought the shot has already been charged to the
      // netrunner, and the turret is a device, not a combatant with a Turn of
      // its own. Billing it twice would make one Action cost two.
      if (!device) {
        await requireTurnSpend(
          deps,
          campaignId,
          scene,
          attacker.id,
          {
            kind: 'attack',
            weaponRowId: meta.weaponRowId,
            weaponName: meta.weaponName,
            rof: weapon.resolved?.rof ?? 1,
            ...(meta.aimed ? { aimed: true } : {}),
          },
          user,
          CPRED_ACTION_ATTACK,
          // The roll card that follows says „Zgrzyt → Kurier" already; a second
          // line reading „Vex — Atak" underneath it is noise.
          { silent: true },
        );
      }

      await spendAttackCosts(deps, campaignId, source, meta, plan.luckSpent);

      const gesture: RollGesture | undefined = sanitizeGesture(payload?.gesture);
      const result: RollResult = rollFormula(plan.formula, createMixedRng(gesture?.entropy), {
        checkRule: true,
        // „Za 4 punkty ignorujesz Krytyczne porażki … wyrzucone w Testach ataku"
        // (Wyjście z opresji, s. 146). Decided before the die falls, which is why
        // it is the one Combat Awareness ability that rides the plan rather than
        // being applied to the result.
        ...(meta.ignoresFumble ? { ignoreFumble: true } : {}),
      });
      result.title = plan.title;
      result.actor = sourceName(source);
      result.breakdown = plan.breakdown;
      if (gesture && gesture.strength > 0) result.tossStrength = gesture.strength;
      if (gesture?.toss) result.toss = gesture.toss;

      result.attack = await buildAttackMeta(
        deps,
        campaignId,
        registry,
        result,
        meta,
        scene,
        attacker,
        fire,
        target,
        user.id,
        // An explosion is judged where it went off, so the blast needs the aim
        // point and the stat that threw — the one the scatter is measured
        // against when the throw misses. A spread of shot is judged from the
        // muzzle instead, and the target only sets the direction (stage 16g).
        meta.blastSideM !== undefined
          ? {
              kind: 'blast' as const,
              aim: aimPoint,
              sideM: meta.blastSideM,
              stat: cpredEffectiveStats(data)[meta.statId],
              statLabel: CPRED_STAT_LABELS[meta.statId].abbr,
            }
          : meta.coneRangeM !== undefined
            ? {
                kind: 'cone' as const,
                origin,
                towards: aimPoint,
                rangeM: meta.coneRangeM,
              }
            : undefined,
      );
      // Whoever fired past a cover said so out loud (stage 16c): the card carries
      // the decision, because „he leaned out" is a ruling the table made and the
      // log is where rulings live.
      if (payload?.request?.ignoreCover === true) {
        result.attack.detail = `${result.attack.detail} · strzał mimo osłony`;
      }
      // „Broń niskiej jakości zaczyna źle działać zawsze, gdy dojdzie do
      // Krytycznej Porażki" (s. 244). After the card is built and before it is
      // stored, so the line the table reads and the flag on the sheet come from
      // the same die.
      if (await jamPoorWeapon(deps, campaignId, source, meta, weapon.resolved, result)) {
        result.attack.detail = `${result.attack.detail} · ${CPRED_JAM_DETAIL}`;
      }

      const stored = await deps.ctx.prisma.chatMessage.create({
        data: {
          campaignId,
          authorId: user.id,
          kind: 'roll',
          text: plan.title,
          payload: JSON.stringify(result),
        },
        include: INCLUDE_CHAT_NAMES,
      });
      const view: ChatMessageView = toChatMessageView(stored);
      await deliverRollMessage(deps, campaignId, user.id, view);
      // The shooter turns to look at what they shot at (stage 27j). After the
      // card, for the same reason the bang is after it: an attack that never
      // happened must not leave the figure staring down a corridor it never
      // fired into.
      await turnTokenToward(deps, campaignId, scene, attacker, aimPoint);
      // The map hears about it *after* the card has been sent, and holds the
      // bang until that card is revealed (stage 27i): the dice are still
      // rolling on everybody's screen, and a shot that landed before them
      // would tell the table the verdict early. Emitting second also means
      // every client already has the message the batch is waiting for.
      await emitMapFx(
        deps,
        campaignId,
        scene,
        attackMapFx(meta, result.attack, weapon.resolved, origin, aimPoint),
        view.id,
      );
      return { messageId: view.id };
    }
  }
}

/**
 * The area this attack covers, when it covers one. Absent for every ordinary
 * attack — one bullet, one person.
 *
 * A blast carries where it was aimed and whose steadiness the scatter is
 * measured against (stage 16d); a cone carries where the shooter stands and
 * which way they pointed (stage 16g). Neither carries a target list: who is
 * standing in it is measured when the dice have already fallen.
 */
type AreaRequest =
  | { kind: 'blast'; aim: ScenePoint; sideM: number; stat: number; statLabel: string }
  | { kind: 'cone'; origin: ScenePoint; towards: ScenePoint; rangeM: number };

/** The verdict block the chat card renders, including suppressive fire's checks. */
async function buildAttackMeta(
  deps: RealtimeDeps,
  campaignId: string,
  registry: CpredRegistry,
  result: RollResult,
  meta: CpredAttackMeta,
  scene: Scene,
  attacker: Token,
  fire: FireContext,
  /** The figure being shot at, when the target is one (stage 16h needs the row). */
  target: Token | null,
  /** Who fired — the author of the cards the round's effects post. */
  authorId: string,
  blast?: AreaRequest,
): Promise<RollAttackMeta> {
  const label = `${meta.weaponName} → ${meta.targetName}`;
  // Who fired, written onto the card (stage 16b). The planner never learns that
  // statists exist, so the token is stamped on here — and from here, because
  // both arms below return the same `system` and a shooter must not be on only
  // one of them.
  const system: CpredAttackMeta = { ...meta, attackerTokenId: attacker.id };

  if (meta.dv === null) {
    // Suppressive fire sets the DV instead of beating one.
    const targets = await suppressionTargets(deps, scene, attacker, fire);
    const checks = await resolveSuppression(deps, campaignId, registry, targets, result.total);
    return {
      system: { ...system },
      label: `${meta.weaponName} → ogień zaporowy`,
      // Deliberately countless (stage 16h). „w zasięgu 25 m: 4" walked straight
      // past the per-viewer filter on the rows below and told the table exactly
      // how many people are standing in the dark room — the same leak 16d closed
      // for the blast card by making `describeArea` countless.
      detail: `${attackDetail(meta)} · PT dla celów ${result.total} · zasięg ${formatMetres(
        CPRED_SUPPRESSIVE_RANGE_M,
      )}`,
      forcedChecks: checks,
    };
  }

  const outcome = resolveCpredAttack(result.total, meta.dv, meta.autofireMax);
  // „+1 do obrażeń … zadanych pierwszym udanym Atakiem w Rundzie" (Wykrycie
  // słabości, s. 146). The planner put the Solo's whole allocation on the card;
  // here it is either earned — and booked, so the second hit of the Round does
  // not earn it again — or taken back off. A miss claims nothing.
  if (system.weakSpot !== undefined) {
    const earned =
      outcome.hit && (await claimRoundOnce(deps.ctx.prisma, scene.id, attacker.id, 'weakSpot'));
    if (!earned) delete system.weakSpot;
  }
  let detail = outcome.hit
    ? `${attackDetail(meta)}${
        outcome.multiplier
          ? ` · przerzut o ${outcome.margin} → obrażenia ×${outcome.multiplier}`
          : ''
      }`
    : `${attackDetail(meta)} · brakło ${Math.abs(outcome.margin) + 1}`;

  // A charge that missed still goes off — it just goes off somewhere else
  // (s. 174). That is why the blast is resolved on both branches and why the
  // damage roll is offered even on a miss: „nie trafiłeś" is about the square
  // that was aimed at, not about whether anything exploded.
  //
  // A spread of shot is the opposite case and the rule says so plainly: „Jeśli
  // rzut się uda, każdy cel … otrzymuje 3k6" (s. 174). Miss and the pellets go
  // into the wall behind, so there is nobody to list and nothing to roll.
  let area: RollAreaMeta | undefined;
  /** Whoever the round reached, for the check it forces on them (stage 16h). */
  let reached: AmmoCheckTarget[] = [];
  /** Where the round went off — where a cloud of smoke would settle. */
  let landedAt: ScenePoint | null = null;
  if (blast?.kind === 'blast') {
    const context = fire.loaded ?? (await loadVisionContext(deps.ctx.prisma, scene));
    fire.loaded = context;
    const scattered = outcome.hit
      ? null
      : scatterBlast(blast.aim, scene, blast.stat, blast.statLabel, createMixedRng());
    const centre = scattered ? scattered.centre : blast.aim;
    const shape: AreaShape = { kind: 'blast', centre, sideM: blast.sideM };
    const targets = await areaTargets(deps, scene, registry, shape, context);
    area = toAreaMeta(scene, shape, targets, scattered?.scatter ?? null);
    detail = `${detail} · ${describeArea(area)}`;
    landedAt = centre;
    reached = checkTargetsIn(targets);
  } else if (blast?.kind === 'cone' && outcome.hit) {
    const context = fire.loaded ?? (await loadVisionContext(deps.ctx.prisma, scene));
    fire.loaded = context;
    const shape: AreaShape = {
      kind: 'cone',
      origin: blast.origin,
      towards: blast.towards,
      rangeM: blast.rangeM,
    };
    // The shooter is standing at the muzzle and is not shot by their own gun.
    const targets = await areaTargets(deps, scene, registry, shape, context, {
      excludeTokenId: attacker.id,
    });
    area = toAreaMeta(scene, shape, targets, null);
    detail = `${detail} · ${describeArea(area)}`;
    landedAt = blast.towards;
    reached = checkTargetsIn(targets);
  }

  /* --- Stage 16h: the round that hurts nobody directly --------------- */

  const ammo = meta.ammo;
  // An ordinary shot at one person reaches exactly that person, and only on a
  // hit. An area reached whoever the geometry said it did, hit or miss — a gas
  // grenade that lands short still gasses the wrong square.
  if (!area && outcome.hit && target && ammo?.check) {
    reached = [{ token: target, metres: meta.metres }];
  }
  const forcedChecks =
    ammo?.check && reached.length > 0
      ? await resolveAmmoChecks(deps, campaignId, registry, scene, ammo, reached, authorId)
      : undefined;
  if (ammo?.check) {
    const skill = registry.skills.find((entry) => entry.id === ammo.check!.skillId);
    const checkLabel = skill?.name ?? ammo.check.skillLabel ?? ammo.check.skillId;
    detail = `${detail} · test ${checkLabel} PT ${ammo.check.dv}`;
  }

  // „Zasnuwa kwadrat 10 m × 10 m gęstym dymem" (s. 347). Laid down where the
  // round went off, which on a miss is the square the scatter chose — smoke does
  // not care whether the throw was good.
  if (ammo?.smoke && landedAt) {
    const cloud = await placeSmoke(deps, campaignId, scene, landedAt, {
      sideM: ammo.smoke.sideM,
      penalty: ammo.smoke.penalty,
      name: 'Dym',
    });
    if (cloud) {
      detail = `${detail} · dym ${cloud.sideM}×${cloud.sideM} m (${cloud.penalty} do testów)`;
    }
  }

  // „Ta amunicja nie zadaje obrażeń": no button, no notation, nothing to apply.
  // Checked here rather than in the planner because the planner still needs a
  // valid damage notation on the weapon — what changes is only what is offered.
  const damages = (outcome.hit || area !== undefined) && ammoDealsDamage(ammo);

  // „Jeśli chybisz o 4 lub mniej … dostajesz drugi rzut" (s. 347). Offered, not
  // taken: Luck may be spent on it, and spending Luck is never the server's
  // decision. `missedBy` is the number the card already prints.
  const missedBy = Math.abs(outcome.margin) + 1;
  const smart =
    !outcome.hit && meta.mode === 'single' && ammoOffersSecondRoll(ammo, missedBy)
      ? {
          missedBy,
          bonus: ammo!.smart!.bonus,
          ...(ammo!.smart!.requires ? { requires: ammo!.smart!.requires } : {}),
        }
      : undefined;

  return {
    system: {
      ...system,
      margin: outcome.margin,
      ...(outcome.multiplier ? { multiplier: outcome.multiplier } : {}),
    },
    label,
    detail,
    hit: outcome.hit,
    ...(meta.targetTokenId ? { targetTokenId: meta.targetTokenId } : {}),
    // Stage 16c: „Zastosuj" has to know it is denting a car rather than a
    // person, because the two take damage down different paths.
    ...(meta.targetCoverId !== undefined ? { targetCoverId: meta.targetCoverId } : {}),
    ...(area ? { area } : {}),
    ...(forcedChecks ? { forcedChecks } : {}),
    ...(smart ? { smart } : {}),
    ...(damages
      ? {
          damageNotation: meta.damage,
          ...(outcome.multiplier && outcome.multiplier > 1
            ? { damageMultiplier: outcome.multiplier }
            : {}),
        }
      : {}),
  };
}

/**
 * What one attack looks like on the map (stage 27i).
 *
 * A translation, not a decision: everything here is read off the card the rules
 * already wrote — the verdict, where the charge went off, how wide the wedge
 * was — so the picture and the chat entry can never disagree. Which is also why
 * it takes `RollAttackMeta` rather than the raw roll: the scatter of a missed
 * grenade has already been rolled by the time the card exists, and the flash has
 * to happen where the charge landed, not where it was aimed.
 *
 * The one thing the map knows that the card does not is *the weapon's voice*,
 * and that comes from `cpredWeaponFx` — one table on top of the slot picture of
 * stage 27h, so a gun can never draw a shotgun and bang like a pistol.
 */
function attackMapFx(
  meta: CpredAttackMeta,
  attack: RollAttackMeta,
  weapon: ResolvedWeapon | null,
  origin: ScenePoint,
  aimPoint: ScenePoint,
): MapFxEffect[] {
  const voice = cpredWeaponFx(weapon);
  const area = attack.area;

  // A spread of shot is a wedge in front of the muzzle, and the figure it was
  // aimed at only set the direction (stage 16g) — so there is no line to draw
  // and no single impact to flash.
  if (area?.shape === 'cone' && area.cone) {
    return [
      {
        kind: 'cone',
        from: area.cone.origin,
        angleDeg: area.cone.angleDeg,
        halfAngleDeg: area.cone.halfAngleDeg,
        rangeM: area.cone.rangeM,
        sound: voice.sound,
      },
    ];
  }

  // Suppressive fire beats no DV — it *sets* one (stage 16). Nobody is hit and
  // nothing lands, so it is a long spray down range and no verdict.
  const suppressive = meta.dv === null;
  const landing = area ? area.centre : aimPoint;
  const hit = attack.hit === true;
  const effects: MapFxEffect[] = [
    {
      kind: 'shot',
      style: voice.style,
      from: origin,
      to: landing,
      hit: hit && !suppressive,
      shots: suppressive ? MAP_FX_MAX_TRACERS : meta.mode === 'single' ? 1 : CPRED_BURST_TRACERS,
      sound: voice.sound,
    },
  ];

  if (area) {
    // „Ta amunicja nie zadaje obrażeń" (stage 16h): a gas or smoke round makes
    // a cloud, not a fireball. Read off the same flag the card reads when it
    // decides whether to offer a damage roll at all.
    const harmless = !ammoDealsDamage(meta.ammo);
    effects.push(
      harmless
        ? {
            kind: 'cloud',
            at: area.centre,
            sideM: meta.ammo?.smoke?.sideM ?? area.sideM,
            variant: meta.ammo?.smoke ? 'smoke' : 'gas',
            sound: 'gas',
          }
        : { kind: 'blast', at: area.centre, sideM: area.sideM, sound: 'explosion' },
    );
  }

  // A hit says so with its own impact and, a moment later, with the number the
  // damage card puts there. A miss has nothing else coming, so it says it here.
  if (!suppressive && !hit) {
    effects.push({ kind: 'float', at: landing, text: 'PUDŁO', tone: 'miss' });
  }
  return effects;
}

/**
 * Figures an area actually reached — the ones a wall or a car did not spare.
 *
 * A cover in the list is dropped rather than checked: „Test Odporności na
 * tortury" means nothing to a parked car, and gas does not care about it either.
 */
function checkTargetsIn(targets: readonly BlastTarget[]): AmmoCheckTarget[] {
  return targets
    .filter((entry) => entry.token !== undefined && entry.view.spared === undefined)
    .map((entry) => ({ token: entry.token!, metres: entry.view.metres }));
}

/**
 * The defender contests an attack after the fact (stage 16 decision): the DV
 * from the range table is replaced by a real DEX + Evasion roll and the stored
 * attack card is rewritten. RAW lets a defender with REF 8+ make this choice
 * for ranged attacks and always for melee; the check on REF is deliberately
 * left to the table, because a GM may rule that a target saw the shot coming.
 */
export const attackEvadeEvent = defineEvent<AttackEvadePayload, { total: number; hit: boolean }>({
  name: 'attack:evade',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    if (typeof payload?.messageId !== 'number' || !Number.isInteger(payload.messageId)) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const message = await deps.ctx.prisma.chatMessage.findUnique({
      where: { id: payload.messageId },
      include: INCLUDE_CHAT_NAMES,
    });
    if (!message || message.campaignId !== campaignId || !message.payload) {
      throw new RealtimeError('MESSAGE_NOT_FOUND');
    }
    const roll = JSON.parse(message.payload) as RollResult;
    const meta = roll.attack?.system as CpredAttackMeta | undefined;
    if (!roll.attack || !meta || meta.dv === null) throw new RealtimeError('NOT_AN_ATTACK');

    // Jumping clear of a blast is the same roll against the same total, but it
    // belongs to one figure out of many rather than to the attack (stage 16d),
    // so it forks before the single-target checks — which all assume there is
    // exactly one defender to talk about.
    if (roll.attack.area && typeof payload.tokenId === 'string') {
      return evadeArea(deps, campaignId, user, message, roll, payload);
    }

    if (roll.attack.evaded) throw new RealtimeError('ALREADY_EVADED');
    // A car does not duck (stage 16c).
    if (!meta.targetTokenId) throw new RealtimeError('NOT_THE_TARGET');

    // Whoever is being shot at may duck — and only their owner or the GM says
    // so. Until the repair session of 22.08 this asked for a **sheet**, which
    // meant a statist could never press the button: their defence DV was read
    // off their combat profile (stage 16b) but the dodge was not.
    const target = await deps.ctx.prisma.token.findUnique({
      where: { id: meta.targetTokenId },
      include: { scene: true },
    });
    if (!target || target.scene.campaignId !== campaignId) {
      throw new RealtimeError('NOT_THE_TARGET');
    }

    const registry = deps.ctx.cpred;
    let defenderName: string;
    let data: CpredCharacterData;
    // Kartą czy żetonem — o tym rozstrzyga **prośba**, a nie to, czy figura ma
    // kartę (etap 38a: ma ją każda ostatystykowana). Gracz uchylający się swoją
    // postacią podaje jej id; MG kliknięciem na figurze nie podaje żadnego,
    // i wtedy uprawnienie płynie z żetonu, tak jak od 22.08.
    if (typeof payload.characterId === 'string') {
      const character = await requireRollableCharacter(deps, campaignId, user, payload.characterId);
      if (target.characterId !== character.id) throw new RealtimeError('NOT_THE_TARGET');
      defenderName = character.name;
      data = parseCharacterData(character.data, registry);
    } else {
      // Figura prowadzona przez żeton uchyla się swoją kartą — tą samą, z której
      // `attack:roll` liczy jej strzały, więc bierne PT, które pobił strzelec,
      // i czynny rzut nie mają jak się rozjechać.
      if (user.role !== ROLE_GM && target.ownerId !== user.id) {
        throw new RealtimeError('NOT_THE_TARGET');
      }
      const figure = await requireFigureSheet(deps, campaignId, registry, target);
      // „Funkcjonariusze Wsparcia nie mogą Unikać pocisków" (s. 158, stage 30c).
      // Ranged only, exactly as printed — an officer parries a machete with his
      // Wartość bojowa like anybody else. Checked here rather than by zeroing
      // Unik, because a zero would still buy them a 1k10 against the shot.
      if (figure.data.statBlock?.noBulletDodge === true && !meta.melee) {
        throw new RealtimeError('BACKUP_CANNOT_DODGE');
      }
      defenderName = target.name;
      data = sheetForRoll(figure.data, null);
    }

    // „Dopóki ją trzymasz, twoja Ludzka tarcza nie może unikać Ataków
    // dystansowych, nawet jeśli jej REF wynosi 8 lub więcej" (s. 178). Melee is
    // untouched: being a shield does not stop you ducking a machete.
    const defence = await grappleStateForToken(deps.ctx.prisma, target.sceneId, target.id);
    if (defence.humanShield && !meta.melee) throw new RealtimeError('SHIELD_CANNOT_DODGE');
    // A dodge is a reaction, not an Action, so the Hold's −2 stays off it
    // (stage 14d decision) — but the status table still gets a say, and from
    // stage 14e so do the Critical Injuries: „Odcięta noga … nie możesz Unikać
    // ataków" lives on the sheet, not on the token. A statist carries none of
    // the latter, which is the same simplification stage 16b made of their gear.
    const dodgeBlock = sheetDodgeBlock(readTokenStatuses(target.statuses), data.criticalInjuries);
    if (dodgeBlock) throw new RealtimeError('DODGE_BLOCKED');

    const planned = planCpredRoll(data, registry, {
      kind: 'skill',
      skillId: CPRED_EVASION_SKILL_ID,
    });
    if (!planned.ok) throw new RealtimeError(planned.error);

    const gesture: RollGesture | undefined = sanitizeGesture(payload.gesture);
    const evasion = rollFormula(planned.plan.formula, createMixedRng(gesture?.entropy), {
      checkRule: true,
    });

    // The dodge replaces the DV: the attacker's original total now has to beat
    // the defender's roll, and ties still go to the defender.
    const outcome = resolveCpredAttack(roll.total, evasion.total, meta.autofireMax);
    const updated: RollResult = {
      ...roll,
      attack: {
        ...roll.attack,
        hit: outcome.hit,
        evaded: true,
        detail: `${roll.attack.detail} · Unik ${defenderName}: ${evasion.total} → ${
          outcome.hit ? 'trafienie mimo uniku' : 'pudło'
        }`,
        ...(outcome.hit
          ? {
              damageNotation: meta.damage,
              ...(outcome.multiplier && outcome.multiplier > 1
                ? { damageMultiplier: outcome.multiplier }
                : {}),
            }
          : { damageNotation: undefined, damageMultiplier: undefined }),
      },
    };
    const saved = await deps.ctx.prisma.chatMessage.update({
      where: { id: message.id },
      data: { payload: JSON.stringify(updated) },
      include: INCLUDE_CHAT_NAMES,
    });
    await broadcastRedactedChatMessage(deps, campaignId, toChatMessageView(saved), 'chat:update');
    return { total: evasion.total, hit: outcome.hit };
  },
});

/**
 * The round corrects a near miss (stage 16h, „Amunicja inteligentna").
 *
 * „Jeśli chybisz o 4 lub mniej, dostajesz drugi rzut na trafienie: 1k10 + 10
 * (możesz też wydać Szczęście)" (s. 347). Three things make this its own event
 * rather than a second `attack:roll`:
 *
 *  - the DV is the *original* one, read off the stored card, so nothing about
 *    the shot may drift between the two rolls — not the range, not the cover,
 *    not the ammunition;
 *  - it costs no Action and no round of ammunition. The bullet is already in
 *    the air; this is the bullet steering;
 *  - „cel mogący Unikać dalej może Unikać" — so the dodge is deliberately *not*
 *    marked as spent, and a defender who was going to duck still may.
 *
 * The card is rewritten in place, exactly as a dodge rewrites it.
 */
export const attackSmartEvent = defineEvent<AttackSmartPayload, { total: number; hit: boolean }>({
  name: 'attack:smart',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    if (typeof payload?.messageId !== 'number' || !Number.isInteger(payload.messageId)) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const message = await deps.ctx.prisma.chatMessage.findUnique({
      where: { id: payload.messageId },
      include: INCLUDE_CHAT_NAMES,
    });
    if (!message || message.campaignId !== campaignId || !message.payload) {
      throw new RealtimeError('MESSAGE_NOT_FOUND');
    }
    const roll = JSON.parse(message.payload) as RollResult;
    const meta = roll.attack?.system as CpredAttackMeta | undefined;
    const smart = roll.attack?.smart;
    if (!roll.attack || !meta || meta.dv === null) throw new RealtimeError('NOT_AN_ATTACK');
    // Offered once. The offer is taken off the card below, so a second press
    // finds nothing to take — which is also what a reloaded page will see.
    if (!smart) throw new RealtimeError('NO_SECOND_ROLL');
    // Only the shooter may steer their own bullet.
    const character = await requireRollableCharacter(deps, campaignId, user, payload.characterId);
    const registry = deps.ctx.cpred;
    const data = parseCharacterData(character.data, registry);
    if (!data.weapons.some((weapon) => weapon.id === meta.weaponRowId)) {
      throw new RealtimeError('NOT_THE_SHOOTER');
    }

    const luckSpent = Math.max(0, Math.round(payload.luckSpent ?? 0));
    if (luckSpent > data.luckCurrent) throw new RealtimeError('NOT_ENOUGH_LUCK');

    const modifier = smart.bonus + luckSpent;
    const gesture: RollGesture | undefined = sanitizeGesture(payload.gesture);
    const second = rollFormula(
      {
        terms: [
          { kind: 'dice', sign: 1, count: 1, sides: 10 },
          { kind: 'modifier', sign: 1, value: modifier },
        ],
      },
      createMixedRng(gesture?.entropy),
      { checkRule: true },
    );
    if (luckSpent > 0) {
      const spent = mergeCharacterData(data, { luckCurrent: data.luckCurrent - luckSpent });
      const saved = await deps.ctx.prisma.character.update({
        where: { id: character.id },
        data: { data: JSON.stringify(spent) },
      });
      await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, registry));
    }

    const outcome = resolveCpredAttack(second.total, meta.dv, meta.autofireMax);
    const { smart: _offered, ...rest } = roll.attack;
    const updated: RollResult = {
      ...roll,
      // The stored roll *becomes* the corrected one — total and dice together.
      //
      // The total has to change because everything downstream measures against
      // it: a dodge beats `roll.total`, and leaving the old miss there would
      // have the defender ducking a shot that never came. The terms have to
      // change with it, or the card would print one die and a total that does
      // not follow from it.
      total: second.total,
      terms: second.terms,
      criticalDamage: second.criticalDamage,
      ...(second.critical ? { critical: second.critical } : { critical: undefined }),
      attack: {
        ...rest,
        hit: outcome.hit,
        detail: `${roll.attack.detail} · poprawka naboju: 1k10+${modifier} = ${second.total}${
          luckSpent > 0 ? ` (Szczęście ${luckSpent})` : ''
        } → ${outcome.hit ? 'trafienie' : 'znowu pudło'}`,
        ...(outcome.hit
          ? {
              damageNotation: meta.damage,
              ...(outcome.multiplier && outcome.multiplier > 1
                ? { damageMultiplier: outcome.multiplier }
                : {}),
            }
          : { damageNotation: undefined, damageMultiplier: undefined }),
      },
    };
    const saved = await deps.ctx.prisma.chatMessage.update({
      where: { id: message.id },
      data: { payload: JSON.stringify(updated) },
      include: INCLUDE_CHAT_NAMES,
    });
    await broadcastRedactedChatMessage(deps, campaignId, toChatMessageView(saved), 'chat:update');
    return { total: second.total, hit: outcome.hit };
  },
});

/**
 * One figure jumps clear of a blast (stage 16d).
 *
 * „Osoba z REF 8 lub wyższym może zdecydować się na odskoczenie poza obszar
 * wybuchu. W tym celu musi rzucić więcej niż twój rzut na atak ładunkiem
 * wybuchowym" (s. 174) — so the roll is the ordinary Evasion roll and the DV is
 * the attacker's own total, exactly as in a dodge. What differs is the bookkeeping:
 * the verdict lands on **this target's row**, not on the attack, because the
 * other three people in the square are still standing in it.
 */
async function evadeArea(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  message: { id: number },
  roll: RollResult,
  payload: AttackEvadePayload,
): Promise<{ total: number; hit: boolean }> {
  const area = roll.attack!.area!;
  const index = area.targets.findIndex((entry) => entry.tokenId === payload.tokenId);
  const entry = index === -1 ? undefined : area.targets[index]!;
  if (!entry) throw new RealtimeError('NOT_THE_TARGET');
  // Somebody a wall already saved has nothing to jump out of, and nobody jumps
  // twice out of the same explosion.
  if (entry.spared) throw new RealtimeError('ALREADY_EVADED');
  // REF 8+ is the price of admission, and it was read off the sheet when the
  // blast was resolved — never off this request.
  if (entry.canEvade !== true) throw new RealtimeError('DODGE_BLOCKED');

  const character = await requireRollableCharacter(deps, campaignId, user, payload.characterId);
  const target = await deps.ctx.prisma.token.findUnique({ where: { id: entry.tokenId } });
  if (!target || target.characterId !== character.id) throw new RealtimeError('NOT_THE_TARGET');

  const registry = deps.ctx.cpred;
  const data = parseCharacterData(character.data, registry);
  const dodgeBlock = sheetDodgeBlock(readTokenStatuses(target.statuses), data.criticalInjuries);
  if (dodgeBlock) throw new RealtimeError('DODGE_BLOCKED');

  const planned = planCpredRoll(data, registry, {
    kind: 'skill',
    skillId: CPRED_EVASION_SKILL_ID,
  });
  if (!planned.ok) throw new RealtimeError(planned.error);

  const gesture: RollGesture | undefined = sanitizeGesture(payload.gesture);
  const evasion = rollFormula(planned.plan.formula, createMixedRng(gesture?.entropy), {
    checkRule: true,
  });
  // Ties go to the attacker here, unusually: the rule asks the dodger to roll
  // *more* than the attack, so an equal roll is not enough to get out of the way.
  const cleared = evasion.total > roll.total;

  const targets = area.targets.map((candidate, position) =>
    position === index
      ? {
          ...candidate,
          ...(cleared ? { spared: 'evaded' as const, sparedBy: character.name } : {}),
          canEvade: false,
        }
      : candidate,
  );
  const updated: RollResult = {
    ...roll,
    attack: {
      ...roll.attack!,
      area: { ...area, targets },
      detail: `${roll.attack!.detail} · Odskok ${character.name}: ${evasion.total} vs ${
        roll.total
      } → ${cleared ? 'poza obszarem' : 'nie zdążył'}`,
    },
  };
  const saved = await deps.ctx.prisma.chatMessage.update({
    where: { id: message.id },
    data: { payload: JSON.stringify(updated) },
    include: INCLUDE_CHAT_NAMES,
  });
  await broadcastRedactedChatMessage(deps, campaignId, toChatMessageView(saved), 'chat:update');
  return { total: evasion.total, hit: !cleared };
}

/**
 * Charges an Action to whichever token the character is playing on the scene
 * this socket is looking at. Outside a running fight — and for a character with
 * no token on that scene — there is no budget to charge and nothing happens.
 */
async function spendCharacterAction(
  deps: RealtimeDeps,
  campaignId: string,
  sceneId: string | null,
  character: Character,
  user: SessionUser,
  actionId: string = CPRED_ACTION_RELOAD,
): Promise<void> {
  if (!sceneId) return;
  const scene = await deps.ctx.prisma.scene.findUnique({ where: { id: sceneId } });
  if (!scene || scene.campaignId !== campaignId) return;
  const token = await deps.ctx.prisma.token.findFirst({
    where: { characterId: character.id, sceneId },
  });
  if (!token) return;
  await requireTurnSpend(
    deps,
    campaignId,
    scene,
    token.id,
    { kind: 'action', actionId },
    user,
    actionId,
  );
}

/**
 * Reloading: an Action at the table, one click here — and since stage 16g also
 * the one way the round in the magazine changes.
 *
 * Both halves are the same event because at the table they are the same motion:
 * „żeby zmienić nabój, trzeba przeładować". A change therefore costs an Action
 * in a fight even when the magazine was full, and costs nothing outside one,
 * where `spendCharacterAction` finds no budget to charge.
 */
export const weaponReloadEvent = defineEvent<WeaponReloadPayload, { ammo: number }>({
  name: 'weapon:reload',
  handler: async ({ deps, socket, user, payload }) =>
    performWeaponReload(deps, {
      campaignId: requireCampaignId(socket.data),
      user,
      sceneId: socket.data.viewedSceneId,
      payload,
    }),
});

/**
 * „Dopóki w ramach Akcji nie usuniesz usterki, broń nie nadaje się do użytku.
 * Usunięcie problemu nie wymaga Testu" (s. 244).
 *
 * An Action and a flag, and deliberately nothing else: no roll to plan, no card
 * to deliver, no sound on the map. The one thing worth saying about the order
 * is that the Action is booked *before* the flag is cleared — a character with
 * nothing left in the turn must not end up with a working gun and an unpaid
 * Action, which is the bargain `weapon:reload` strikes one function below.
 */
export const weaponClearJamEvent = defineEvent<WeaponClearJamPayload, { jammed: boolean }>({
  name: 'weapon:clear-jam',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const character = await requireRollableCharacter(deps, campaignId, user, payload?.characterId);
    const data = parseCharacterData(character.data, deps.ctx.cpred);
    const row = data.weapons.find((weapon) => weapon.id === payload?.weaponRowId);
    if (!row) throw new RealtimeError('UNKNOWN_WEAPON');
    // A gun nobody jammed costs nothing: the click was a misfire, not an
    // Action — the same answer a full magazine gets from a reload.
    if (row.jammed !== true) return { jammed: false };
    await spendCharacterAction(
      deps,
      campaignId,
      socket.data.viewedSceneId,
      character,
      user,
      CPRED_ACTION_CLEAR_JAM,
    );
    await saveWeaponRow(deps, campaignId, character, data, row.id, { jammed: undefined });
    return { jammed: false };
  },
});

/* ------------------------------------------------------------------ *
 * weapon:draw — co postać bierze do rąk (etap 41)
 * ------------------------------------------------------------------ */

/**
 * Dobycie, schowanie i upuszczenie broni — trzy gesty, jedno zdarzenie.
 *
 * Ceny są podręcznikowe (s. 168) i to one różnią gesty: dobycie i upuszczenie
 * nic nie kosztują, schowanie kosztuje Akcję. Akcja księguje się **przed**
 * zapisem, tym samym rachunkiem sumienia, co przy usuwaniu usterki: postać,
 * której nie starczyło tury, nie ma prawa skończyć z pustą kaburą i niezapłaconą
 * Akcją.
 *
 * **Pierwsze wywołanie deklaruje ręce.** Punktem wyjścia jest to, co do tej pory
 * *pokazywały* oględziny (`cpredDrawnWeapons` — czyli pierwsza broń z karty),
 * a nie pustka: co stół widział, to postać miała. Bez tego pierwsze „schowaj
 * pistolet" zostawiałoby w rękach karabin, którego nikt nie dobywał.
 */
export const weaponDrawEvent = defineEvent<WeaponDrawPayload, { hands: string[] }>({
  name: 'weapon:draw',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const character = await requireRollableCharacter(deps, campaignId, user, payload?.characterId);
    const data = parseCharacterData(character.data, deps.ctx.cpred);
    const row = data.weapons.find((weapon) => weapon.id === payload?.weaponRowId);
    if (!row) throw new RealtimeError('UNKNOWN_WEAPON');
    const mode = payload?.mode ?? 'draw';
    if (mode !== 'draw' && mode !== 'holster' && mode !== 'drop') {
      throw new RealtimeError('BAD_REQUEST');
    }

    const before: string[] = cpredDrawnWeapons(data).map((weapon) => weapon.id);
    let hands: string[];
    if (mode === 'draw') {
      // Już w rękach — gest był omyłkowy, nie Akcją. Ta sama odpowiedź, którą
      // pełny magazynek daje przeładowaniu i sprawna broń usuwaniu usterki.
      if (before.includes(row.id)) return { hands: before };
      // „Sięgnięcie **wolną ręką**" (s. 168): miejsce w rękach jest warunkiem,
      // nie formalnością. Ile rąk zajmuje broń, wie katalog — a katalog należy
      // do serwera, więc pytamy go tutaj, a nie w silniku zasad.
      const needed = (await resolveWeaponRow(deps, campaignId, data, row.id)).resolved?.hands ?? 1;
      const held = await handsInUse(deps, campaignId, data, before);
      if (held + needed > CPRED_HANDS) throw new RealtimeError('HANDS_FULL');
      hands = [...before, row.id];
    } else {
      if (!before.includes(row.id)) return { hands: before };
      if (mode === 'holster') {
        await spendCharacterAction(
          deps,
          campaignId,
          socket.data.viewedSceneId,
          character,
          user,
          CPRED_ACTION_HOLSTER,
        );
      }
      hands = before.filter((id) => id !== row.id);
    }

    const saved = await deps.ctx.prisma.character.update({
      where: { id: character.id },
      data: { data: JSON.stringify(mergeCharacterData(data, { drawnWeaponRowIds: hands })) },
    });
    await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
    return { hands };
  },
});

/** Ile rąk zajmuje to, co figura już trzyma — po katalogu, broń po broni. */
async function handsInUse(
  deps: RealtimeDeps,
  campaignId: string,
  data: CpredCharacterData,
  rowIds: readonly string[],
): Promise<number> {
  let used = 0;
  for (const rowId of rowIds) {
    const resolved = await resolveWeaponRow(deps, campaignId, data, rowId);
    used += resolved.resolved?.hands ?? 1;
  }
  return used;
}

/** One reload, socket-free — see `performAttackRoll` for why it is split out. */
export async function performWeaponReload(
  deps: RealtimeDeps,
  options: {
    campaignId: string;
    user: SessionUser;
    /** Scene the Action is booked on; decides which fight charges for it. */
    sceneId: string | null;
    payload: WeaponReloadPayload | undefined;
  },
): Promise<{ ammo: number }> {
  {
    const { campaignId, user, sceneId, payload } = options;
    // A statist reloads too (29.08). Its magazine lives in the profile column
    // rather than in a sheet row, which is the whole of the difference — the
    // Action is booked the same way, the sound plays the same way, and „żeby
    // zmienić nabój, trzeba przeładować" is enforced the same way.
    if (!payload?.characterId) {
      return performFigureReload(deps, { campaignId, user, sceneId, payload });
    }
    const character = await requireRollableCharacter(deps, campaignId, user, payload?.characterId);
    const registry = deps.ctx.cpred;
    const data = parseCharacterData(character.data, registry);
    const row = data.weapons.find((weapon) => weapon.id === payload?.weaponRowId);
    if (!row) throw new RealtimeError('UNKNOWN_WEAPON');

    // Stage 31: refilling what is bolted on rather than the gun. Its own
    // magazine, its own Action — and since 02.09 its own choice of round, for
    // the reason the host row has one: „Amunicja dymna" is fired from a Grenade
    // Launcher, and the launcher on this sheet is usually the underbarrel.
    if (typeof payload?.attachmentId === 'string') {
      return reloadAttachment(deps, {
        campaignId,
        user,
        sceneId,
        character,
        data,
        row,
        attachmentId: payload.attachmentId,
        ammoId: payload?.ammoId,
      });
    }

    // What is being loaded: an id, „ordinary" (null), or „leave it alone".
    const requested = await requireLoadableAmmo(deps, campaignId, row, payload?.ammoId);
    const nextAmmoId = requested === undefined ? row.ammoId : (requested?.id ?? undefined);
    const changing = nextAmmoId !== row.ammoId;

    if (row.ammoMax <= 0) {
      // Nothing to refill. A weapon whose rounds the rules do not count (a bow)
      // still gets to swap what it shoots — that is a choice of arrow, not a
      // magazine change, so it is free and needs no Action.
      if (!changing) throw new RealtimeError('WEAPON_HAS_NO_MAGAZINE');
      await saveWeaponRow(deps, campaignId, character, data, row.id, {
        ...(nextAmmoId ? { ammoId: nextAmmoId } : { ammoId: undefined }),
      });
      return { ammo: row.ammoCurrent };
    }
    // A full magazine costs nothing: the click was a misfire, not an Action.
    // Unless the round is changing — then the full magazine comes out.
    if (row.ammoCurrent >= row.ammoMax && !changing) return { ammo: row.ammoCurrent };

    // „Przeładowanie — Załadowujesz magazynek do pełna" is an Action (s. 169).
    // Unlike an attack it produces no card of its own, so the chat line is the
    // only trace the table gets — hence not silent.
    await spendCharacterAction(deps, campaignId, sceneId, character, user);

    await saveWeaponRow(deps, campaignId, character, data, row.id, {
      ammoCurrent: row.ammoMax,
      ...(changing ? (nextAmmoId ? { ammoId: nextAmmoId } : { ammoId: undefined }) : {}),
    });
    // A magazine going in is the one non-attack sound the map plays, and it
    // earns it: „he is reloading" is the whole reason the other side breaks
    // cover. No card to wait for — a reload writes a plain chat line, not a
    // roll — so it goes off at once.
    await emitReloadMapFx(deps, campaignId, sceneId, character, data, row.id);
    return { ammo: row.ammoMax };
  }
}

/**
 * Refilling the weapon somebody bolted under the barrel (stage 31).
 *
 * The host's magazine is not touched, which is the whole reason the underbarrel
 * carries one of its own — and an attachment that holds nothing (a bayonet)
 * refuses with the same code a bow gets, because the answer is the same: there
 * is no magazine here to fill.
 *
 * Which round goes in is chosen here too (02.09), by the same bargain the host
 * row strikes: „żeby zmienić nabój, trzeba przeładować", so a swap books the
 * Action even when the launcher was already loaded. Without it the underbarrel
 * was wired to ordinary ammunition and the smoke round had no barrel to leave.
 */
async function reloadAttachment(
  deps: RealtimeDeps,
  options: {
    campaignId: string;
    user: SessionUser;
    sceneId: string | null;
    character: Character;
    data: CpredCharacterData;
    row: CpredCharacterData['weapons'][number];
    attachmentId: string;
    /** Round to load; `null` is ordinary, `undefined` leaves it alone. */
    ammoId?: unknown;
  },
): Promise<{ ammo: number }> {
  const { campaignId, user, sceneId, character, data, row, attachmentId } = options;
  const weapon = await resolveWeaponRow(deps, campaignId, data, row.id, attachmentId);
  const fitted = weapon.attachments.find((entry) => entry.id === attachmentId);
  if (!fitted || !weapon.secondary) throw new RealtimeError('UNKNOWN_ATTACHMENT');
  const capacity = weapon.secondary.magazine ?? 0;
  if (capacity <= 0) throw new RealtimeError('WEAPON_HAS_NO_MAGAZINE');

  // Judged against the *bolted-on* weapon, not the gun holding it: a rifle round
  // does not fit the launcher under it, and neither does the launcher's grenade
  // fit the rifle.
  const requested = await requireLoadableAmmo(deps, campaignId, row, options.ammoId, {
    resolved: weapon.secondary,
  });
  const current = row.attachmentAmmoId?.[attachmentId];
  const nextAmmoId = requested === undefined ? current : (requested?.id ?? undefined);
  const changing = nextAmmoId !== current;

  const loaded = row.attachmentAmmo?.[attachmentId] ?? capacity;
  // A full magazine costs nothing — unless the round is changing, and then the
  // full magazine comes out, exactly as it does on the host row.
  if (loaded >= capacity && !changing) return { ammo: loaded };

  const attachmentAmmoId = { ...(row.attachmentAmmoId ?? {}) };
  if (nextAmmoId) attachmentAmmoId[attachmentId] = nextAmmoId;
  else delete attachmentAmmoId[attachmentId];

  await spendCharacterAction(deps, campaignId, sceneId, character, user);
  await saveWeaponRow(deps, campaignId, character, data, row.id, {
    attachmentAmmo: { ...(row.attachmentAmmo ?? {}), [attachmentId]: capacity },
    attachmentAmmoId,
  });
  await emitReloadMapFx(deps, campaignId, sceneId, character, data, row.id);
  return { ammo: capacity };
}

/**
 * Bolting something onto a weapon, and taking it off again (stage 31, s. 342).
 *
 * Its own event rather than a sheet patch, and for the reason `eddies` got one
 * in 23b: the change has consequences the sheet cannot compute from the field
 * being written. Mounting a drum grows the magazine off a table that lives in
 * the catalogue; taking one off shrinks it and has to clamp the rounds still in
 * it; and „Efekty dwóch jednakowych dodatków nie kumulują się" is a refusal, not
 * a value. All three are decided here, once, on the merged sheet.
 */
export const weaponAttachmentEvent = defineEvent<WeaponAttachmentPayload, WeaponAttachmentResult>({
  name: 'weapon:attachment',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const character = await requireRollableCharacter(deps, campaignId, user, payload?.characterId);
    const registry = deps.ctx.cpred;
    const data = parseCharacterData(character.data, registry);
    const row = data.weapons.find((weapon) => weapon.id === payload?.weaponRowId);
    if (!row) throw new RealtimeError('UNKNOWN_WEAPON');
    if (typeof payload?.attachmentId !== 'string') throw new RealtimeError('BAD_REQUEST');
    const mounting = payload.action !== 'unmount';

    const compendium = await buildCompendiumSync(deps, campaignId);
    const weaponTypeById = new Map(compendium.weaponTypes.map((type) => [type.id, type]));
    const entry = row.compendiumId
      ? compendium.entries.find((candidate) => candidate.id === row.compendiumId)
      : undefined;
    // The same refusal a hand-typed row gets when it tries to shoot: without a
    // catalogue entry there is no weapon to bolt anything to.
    if (!entry || !isWeaponEntry(entry)) throw new RealtimeError('UNKNOWN_WEAPON');
    const resolved = resolveWeapon(entry, { weaponTypeById });
    const catalogue = attachmentProfilesOf(compendium.entries);
    const fitted = fittedAttachmentsFor(row.attachmentIds, catalogue, resolved);

    let next: CpredAttachmentProfile[];
    if (mounting) {
      const attachment = catalogue.find((candidate) => candidate.id === payload.attachmentId);
      if (!attachment) throw new RealtimeError('UNKNOWN_ATTACHMENT');
      const problem = attachmentMountProblem(attachment, resolved, fitted);
      if (problem) throw new RealtimeError(problem);
      next = [...fitted, attachment];
    } else {
      if (!fitted.some((candidate) => candidate.id === payload.attachmentId)) {
        throw new RealtimeError('UNKNOWN_ATTACHMENT');
      }
      next = fitted.filter((candidate) => candidate.id !== payload.attachmentId);
    }

    // „Broń może wystrzelić tyle pocisków, ile wyszczególniono w tabeli"
    // (s. 344). The magazine follows what is bolted on, and the rounds in it are
    // clamped rather than kept: taking a drum off a rifle holding forty leaves
    // twenty-five, because the other fifteen went with the drum.
    const ammoMax = weaponMagazineWith(resolved, next) ?? row.ammoMax;
    const ammoCurrent = Math.min(row.ammoCurrent, ammoMax);
    // An attachment coming off takes its own magazine with it, so the sheet does
    // not carry a count for a launcher that is no longer there.
    const attachmentAmmo = Object.fromEntries(
      Object.entries(row.attachmentAmmo ?? {}).filter(([id]) =>
        next.some((candidate) => candidate.id === id),
      ),
    );
    // And with it the round it was holding (02.09) — a load without a magazine
    // to sit in would come back the moment the same launcher was bolted on again.
    const attachmentAmmoId = Object.fromEntries(
      Object.entries(row.attachmentAmmoId ?? {}).filter(([id]) =>
        next.some((candidate) => candidate.id === id),
      ),
    );
    // A bolted-on weapon arrives loaded: nobody buys an empty underbarrel, and
    // the alternative is a launcher that needs an Action before it can ever fire.
    if (mounting) {
      const secondary = resolveAttachmentWeapon(next[next.length - 1] as CpredAttachmentProfile, {
        weaponTypeById,
      });
      if (secondary && (secondary.magazine ?? 0) > 0) {
        attachmentAmmo[payload.attachmentId] = secondary.magazine as number;
      }
    }

    const attachmentIds = next.map((candidate) => candidate.id);
    await saveWeaponRow(deps, campaignId, character, data, row.id, {
      attachmentIds,
      attachmentAmmo,
      attachmentAmmoId,
      ammoMax,
      ammoCurrent,
    });
    return {
      attachmentIds,
      slotsFree: attachmentSlotsFree(resolved, next),
      ammoMax,
      ammoCurrent,
    };
  },
});

/**
 * Przeładowanie figury prowadzonej przez żeton (29.08, przepisane w 38a).
 *
 * Do 38a magazynek statysty był dwiema liczbami w kolumnie JSON żetonu, więc
 * zapis szedł przez `token.update`; od 38a to zwykły wiersz broni na karcie
 * i zapis jest ten sam, co u gracza. Zostaje jedna różnica, i jest nią
 * uprawnienie: tę figurę prowadzi się żetonem, nie kartą.
 *
 * Zmiany rodzaju amunicji nadal się tu nie oferuje: broń wpisana szybkim
 * edytorem nie niesie `ammoId`, więc nie ma na co zmieniać.
 */
async function performFigureReload(
  deps: RealtimeDeps,
  options: {
    campaignId: string;
    user: SessionUser;
    sceneId: string | null;
    payload: WeaponReloadPayload | undefined;
  },
): Promise<{ ammo: number }> {
  const { campaignId, user, sceneId, payload } = options;
  if (!sceneId) throw new RealtimeError('NO_SCENE');
  const token = await resolveStatistToken(
    deps,
    campaignId,
    user,
    sceneId,
    payload?.attackerTokenId,
  );
  const { character, data } = await requireFigureSheet(deps, campaignId, deps.ctx.cpred, token);
  if (payload?.weaponRowId !== SHEET_STATIST_WEAPON_ROW_ID) {
    throw new RealtimeError('UNKNOWN_WEAPON');
  }
  const row = data.weapons.find((weapon) => weapon.id === SHEET_STATIST_WEAPON_ROW_ID);
  if (!row) throw new RealtimeError('UNKNOWN_WEAPON');
  if (row.ammoMax <= 0) throw new RealtimeError('WEAPON_HAS_NO_MAGAZINE');
  // A full magazine costs nothing: the click was a misfire, not an Action.
  if (row.ammoCurrent >= row.ammoMax) return { ammo: row.ammoCurrent };

  const scene = await deps.ctx.prisma.scene.findUnique({ where: { id: sceneId } });
  if (!scene || scene.campaignId !== campaignId) throw new RealtimeError('SCENE_NOT_FOUND');
  await requireTurnSpend(
    deps,
    campaignId,
    scene,
    token.id,
    { kind: 'action', actionId: CPRED_ACTION_RELOAD },
    user,
    CPRED_ACTION_RELOAD,
  );

  await saveWeaponRow(deps, campaignId, character, data, row.id, { ammoCurrent: row.ammoMax });
  await emitTokensById(deps, campaignId, [token.id]);

  // The same two beats or four the sheet path plays — which one depends on the
  // weapon, so the catalogue is opened for exactly that question.
  const { resolved } = await resolveWeaponRow(deps, campaignId, data, SHEET_STATIST_WEAPON_ROW_ID);
  await emitMapFx(deps, campaignId, scene, [
    { kind: 'spark', at: fxCentre(token, scene), sound: cpredReloadSound(resolved) },
  ]);
  return { ammo: row.ammoMax };
}

/**
 * The click of a fresh magazine, over whichever token this character is playing.
 *
 * Silent off the map on purpose: a reload done from the sheet with no token on
 * the viewed scene has nowhere to sound from, exactly as it has no Action to be
 * charged (`spendCharacterAction` takes the same way out).
 */
async function emitReloadMapFx(
  deps: RealtimeDeps,
  campaignId: string,
  sceneId: string | null,
  character: Character,
  data: CpredCharacterData,
  weaponRowId: string,
): Promise<void> {
  if (!sceneId) return;
  const scene = await deps.ctx.prisma.scene.findUnique({ where: { id: sceneId } });
  if (!scene || scene.campaignId !== campaignId) return;
  const token = await deps.ctx.prisma.token.findFirst({
    where: { characterId: character.id, sceneId },
  });
  if (!token) return;
  // Which magazine went in: a handgun's two beats or a long arm's four. The
  // catalogue is only opened once there is a token to sound from — a reload
  // done off the map costs nothing and looks nothing up.
  const { resolved } = await resolveWeaponRow(deps, campaignId, data, weaponRowId);
  await emitMapFx(deps, campaignId, scene, [
    { kind: 'spark', at: fxCentre(token, scene), sound: cpredReloadSound(resolved) },
  ]);
}

/**
 * The round the client asked for, proven to exist and to fit this weapon.
 *
 * `undefined` means the request said nothing about ammunition (a plain reload);
 * `null` means ordinary ammunition, which has no catalogue row.
 */
async function requireLoadableAmmo(
  deps: RealtimeDeps,
  campaignId: string,
  row: CpredCharacterData['weapons'][number],
  ammoId: unknown,
  /**
   * Weapon the round has to fit, when it is not the row's own (02.09): reloading
   * the underbarrel judges the round against the launcher, never against the
   * rifle carrying it.
   */
  against?: { resolved: ResolvedWeapon | null },
): Promise<CpredAmmoProfile | null | undefined> {
  if (ammoId === undefined) return undefined;
  if (ammoId === null || ammoId === '') return null;
  if (typeof ammoId !== 'string') throw new RealtimeError('BAD_REQUEST');

  const compendium = await buildCompendiumSync(deps, campaignId);
  const ammo = ammoLookup(compendium.entries)(ammoId);
  if (!ammo) throw new RealtimeError('UNKNOWN_AMMO');

  let resolved: ResolvedWeapon | null;
  if (against) {
    resolved = against.resolved;
  } else {
    const entry = row.compendiumId
      ? compendium.entries.find((candidate) => candidate.id === row.compendiumId)
      : undefined;
    const weaponTypeById = new Map(compendium.weaponTypes.map((type) => [type.id, type]));
    resolved = entry && isWeaponEntry(entry) ? resolveWeapon(entry, { weaponTypeById }) : null;
  }
  // The same test the planner would apply — said now, so nobody discovers it
  // with a target already picked out.
  if (!ammoFitsWeapon(ammo, resolved)) throw new RealtimeError('AMMO_MISMATCH');
  return ammo;
}

/** Writes one weapon row back and pushes the sheet to everyone who may see it. */
async function saveWeaponRow(
  deps: RealtimeDeps,
  campaignId: string,
  character: Character,
  data: CpredCharacterData,
  rowId: string,
  patch: Partial<CpredCharacterData['weapons'][number]>,
): Promise<void> {
  const weapons = data.weapons.map((weapon) =>
    weapon.id === rowId ? { ...weapon, ...patch } : weapon,
  );
  const saved = await deps.ctx.prisma.character.update({
    where: { id: character.id },
    data: { data: JSON.stringify(mergeCharacterData(data, { weapons })) },
  });
  await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
}
