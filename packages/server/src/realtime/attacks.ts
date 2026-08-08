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
  RangeDvTable,
  ResolvedWeapon,
  RollAreaMeta,
  RollAttackMeta,
  RollForcedCheck,
  RollGesture,
  RollResult,
  ScenePoint,
  SessionUser,
  TokenHp,
  WeaponReloadPayload,
} from '@vtt/shared';
import {
  CPRED_ACTION_ATTACK,
  CPRED_ACTION_RELOAD,
  CPRED_AUTOFIRE_SKILL_ID,
  CPRED_EVASION_SKILL_ID,
  CPRED_STAT_LABELS,
  CPRED_SUPPRESSIVE_RANGE_M,
  ROLE_GM,
  ammoDealsDamage,
  ammoFitsWeapon,
  ammoOffersSecondRoll,
  ammoProfilesOf,
  concentrationBase,
  cpredSmokeModifiers,
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
  readSheetCombatProfile,
  sheetCombatProfileEvasionDv,
  sheetDodgeBlock,
  sheetFromCombatProfile,
  sheetHumanShieldCovers,
  sheetSituationModifiers,
  type SheetCombatProfile,
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
import { pinToken } from './turn-effects.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { grappleStateForToken, readTokenStatuses } from './combat.js';
import { requireTurnSpend } from './combat-actions.js';
import { requireRollableCharacter } from './character-rolls.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import {
  emitTokensById,
  emitTokensOfCharacter,
  requireCampaignToken,
  toTokenView,
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
async function resolveWeaponRow(
  deps: RealtimeDeps,
  campaignId: string,
  data: CpredCharacterData,
  weaponRowId: unknown,
): Promise<{
  row: CpredCharacterData['weapons'][number];
  resolved: ResolvedWeapon | null;
  typeId: string | null;
  ammo: CpredAmmoProfile | null;
}> {
  if (typeof weaponRowId !== 'string') throw new RealtimeError('BAD_REQUEST');
  const row = data.weapons.find((weapon) => weapon.id === weaponRowId);
  if (!row) throw new RealtimeError('UNKNOWN_WEAPON');
  if (!row.compendiumId) return { row, resolved: null, typeId: null, ammo: null };

  const compendium = await buildCompendiumSync(deps, campaignId);
  const entry = compendium.entries.find((candidate) => candidate.id === row.compendiumId);
  if (!entry || !isWeaponEntry(entry)) return { row, resolved: null, typeId: null, ammo: null };
  const weaponTypeById = new Map(compendium.weaponTypes.map((type) => [type.id, type]));
  const resolved = resolveWeapon(entry, { weaponTypeById });
  return {
    row,
    resolved,
    typeId: entry.weaponTypeId,
    // Stage 16g: what is actually in the magazine. Read here rather than in the
    // planner for the same reason the weapon is — the catalogue is the server's,
    // and the planner is handed facts, never a place to look them up.
    ammo: loadedAmmoFor(row, resolved, ammoLookup(compendium.entries)),
  };
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
 * Two sources since stage 16b, and the fallback order is the point: a sheet
 * first, then the token's own combat profile, and only a token with neither
 * drops through to the everyday DV. Before 16b every extra defended itself at
 * 13 whatever the GM had in mind for it.
 */
async function targetEvasionDv(
  deps: RealtimeDeps,
  registry: CpredRegistry,
  token: Token,
): Promise<number | undefined> {
  if (token.characterId) {
    const character = await deps.ctx.prisma.character.findUnique({
      where: { id: token.characterId },
    });
    if (character) return passiveEvasionDv(parseCharacterData(character.data, registry), registry);
  }
  const profile = readSheetCombatProfile(token.combatProfile);
  if (!profile) return undefined;
  return sheetCombatProfileEvasionDv(profile, registry, tokenHpOf(token));
}

/** The token's own HP pair, with a sane stand-in for a token that has no bar. */
function tokenHpOf(token: Token): TokenHp {
  if (token.hpMax === null) return { current: 1, max: 1 };
  return { current: token.hpCurrent ?? 0, max: token.hpMax };
}

/**
 * Who is making this attack (stage 16b): a character sheet, or a token's own
 * combat profile.
 *
 * Both arms end up carrying a `CpredCharacterData`, which is the whole design —
 * everything downstream (the planner, the breakdown, the turn budget, the chat
 * card) works on a sheet and never learns that statists exist. What differs is
 * only where the numbers came from and where the spent rounds are written back.
 */
type AttackSource =
  | { kind: 'character'; character: Character; token: Token; data: CpredCharacterData }
  | { kind: 'statist'; token: Token; profile: SheetCombatProfile; data: CpredCharacterData };

/** Name shown as the actor of the roll — the sheet's, or the token's. */
function sourceName(source: AttackSource): string {
  return source.kind === 'character' ? source.character.name : source.token.name;
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
): Promise<Token> {
  if (typeof attackerTokenId !== 'string' || attackerTokenId.length === 0) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const { token } = await requireCampaignToken(deps.ctx.prisma, campaignId, attackerTokenId);
  if (token.sceneId !== sceneId) throw new RealtimeError('ATTACKER_ON_OTHER_SCENE');
  if (user.role !== ROLE_GM && token.ownerId !== user.id) {
    throw new RealtimeError('CHARACTER_NOT_FOUND');
  }
  return token;
}

/**
 * Spends Luck and ammunition in one write, and re-emits whatever holds them.
 *
 * The two arms differ only in the destination: a sheet writes the whole
 * `CpredCharacterData` back, a statist writes the magazine into its own profile
 * column. A statist never spends Luck — its synthesised sheet has none, and the
 * planner refuses the request long before this.
 */
async function spendAttackCosts(
  deps: RealtimeDeps,
  campaignId: string,
  source: AttackSource,
  meta: CpredAttackMeta,
  luckSpent: number,
): Promise<void> {
  if (luckSpent === 0 && meta.ammoCost === 0) return;

  if (source.kind === 'statist') {
    const saved = await deps.ctx.prisma.token.update({
      where: { id: source.token.id },
      data: {
        combatProfile: JSON.stringify({ ...source.profile, ammoCurrent: meta.ammoAfter }),
      },
    });
    source.token = saved;
    await emitTokensById(deps, campaignId, [saved.id]);
    return;
  }

  const { character, data } = source;
  const weapons = data.weapons.map((row) =>
    row.id === meta.weaponRowId ? { ...row, ammoCurrent: meta.ammoAfter } : row,
  );
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

/** „24 m (13–25 m) · PT 15 · magazynek 7/8" — the card's explanation line. */
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
  if (meta.ammoCost > 0) {
    // Capacity, not „what was in there a moment ago" — the two agree only while
    // the weapon started the shot full, which is why a single shot looked right
    // and a ten-round burst printed „29/39" on a forty-round magazine.
    const capacity = meta.ammoMax ?? meta.ammoCost + meta.ammoAfter;
    parts.push(`magazynek ${meta.ammoAfter}/${capacity}`);
  }
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
  attack: { melee: boolean; aimed: boolean },
): Promise<{ tokenId: string; name: string } | null> {
  if (!sheetHumanShieldCovers({ melee: attack.melee, aimedAtHead: attack.aimed })) return null;
  const state = await grappleStateForToken(deps.ctx.prisma, sceneId, targetTokenId);
  if (!state.shieldOf) return null;
  return { tokenId: state.shieldOf.tokenId, name: state.shieldOf.token.name };
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
 * Dresses a statist token as an attacker (stage 16b).
 *
 * Two passes, and the second one is not laziness: which skill fires the weapon
 * is a property of the *weapon type* in the compendium, so the sheet has to
 * exist before the catalogue can be asked, and the answer then decides which
 * skill on that sheet carries the profile's level. Building it in one pass would
 * mean either hard-coding the skill or giving the statist every skill at once —
 * and „trained in everything" is exactly what a statist must not be.
 */
async function buildStatistSource(
  deps: RealtimeDeps,
  campaignId: string,
  registry: CpredRegistry,
  token: Token,
  request: CpredAttackRequest | undefined,
): Promise<AttackSource> {
  const profile = readSheetCombatProfile(token.combatProfile);
  if (!profile) throw new RealtimeError('TOKEN_HAS_NO_PROFILE');
  const hp = tokenHpOf(token);

  // Pass one: a sheet good enough to look the weapon up with.
  const bare = sheetFromCombatProfile(profile, hp, null);
  const weapon = await resolveWeaponRow(deps, campaignId, bare, SHEET_STATIST_WEAPON_ROW_ID);
  const skillId =
    request?.mode === 'autofire' || request?.mode === 'suppressive'
      ? CPRED_AUTOFIRE_SKILL_ID
      : (weapon.resolved?.skillId ?? request?.skillId ?? null);

  // Pass two: the same sheet with that one skill at the profile's level.
  return {
    kind: 'statist',
    token,
    profile,
    data: sheetFromCombatProfile(profile, hp, skillId),
  };
}

export const attackRollEvent = defineEvent<AttackRollPayload<CpredAttackRequest>, AttackRollResult>(
  {
    name: 'attack:roll',
    handler: async ({ deps, socket, user, payload }) => {
      const campaignId = requireCampaignId(socket.data);
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
        : await resolveStatistToken(deps, campaignId, user, scene.id, payload?.attackerTokenId);
      if (target && attacker.id === target.id) throw new RealtimeError('BAD_REQUEST');

      const source = character
        ? ({
            kind: 'character',
            character,
            token: attacker,
            data: parseCharacterData(character.data, registry),
          } satisfies AttackSource)
        : await buildStatistSource(deps, campaignId, registry, attacker, payload?.request);
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

      const weapon = await resolveWeaponRow(deps, campaignId, data, payload?.request?.weaponRowId);
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
          aimed: payload?.request?.aimed === true,
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

      await spendAttackCosts(deps, campaignId, source, meta, plan.luckSpent);

      const gesture: RollGesture | undefined = sanitizeGesture(payload?.gesture);
      const result: RollResult = rollFormula(plan.formula, createMixedRng(gesture?.entropy), {
        checkRule: true,
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
              stat: data.stats[meta.statId],
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
      return { messageId: view.id };
    },
  },
);

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

  if (meta.dv === null) {
    // Suppressive fire sets the DV instead of beating one.
    const targets = await suppressionTargets(deps, scene, attacker, fire);
    const checks = await resolveSuppression(deps, campaignId, registry, targets, result.total);
    return {
      system: { ...meta },
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
      ...meta,
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

    // Only the target's own sheet may dodge — and only its owner or the GM.
    const character = await requireRollableCharacter(deps, campaignId, user, payload.characterId);
    const target = await deps.ctx.prisma.token.findUnique({ where: { id: meta.targetTokenId } });
    if (!target || target.characterId !== character.id) throw new RealtimeError('NOT_THE_TARGET');

    // „Dopóki ją trzymasz, twoja Ludzka tarcza nie może unikać Ataków
    // dystansowych, nawet jeśli jej REF wynosi 8 lub więcej" (s. 178). Melee is
    // untouched: being a shield does not stop you ducking a machete.
    const defence = await grappleStateForToken(deps.ctx.prisma, target.sceneId, target.id);
    if (defence.humanShield && !meta.melee) throw new RealtimeError('SHIELD_CANNOT_DODGE');
    const registry = deps.ctx.cpred;
    const data = parseCharacterData(character.data, registry);
    // A dodge is a reaction, not an Action, so the Hold's −2 stays off it
    // (stage 14d decision) — but the status table still gets a say, and from
    // stage 14e so do the Critical Injuries: „Odcięta noga … nie możesz Unikać
    // ataków" lives on the sheet, not on the token.
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
        detail: `${roll.attack.detail} · Unik ${character.name}: ${evasion.total} → ${
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
    { kind: 'action', actionId: CPRED_ACTION_RELOAD },
    user,
    CPRED_ACTION_RELOAD,
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
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const character = await requireRollableCharacter(deps, campaignId, user, payload?.characterId);
    const registry = deps.ctx.cpred;
    const data = parseCharacterData(character.data, registry);
    const row = data.weapons.find((weapon) => weapon.id === payload?.weaponRowId);
    if (!row) throw new RealtimeError('UNKNOWN_WEAPON');

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
    await spendCharacterAction(deps, campaignId, socket.data.viewedSceneId, character, user);

    await saveWeaponRow(deps, campaignId, character, data, row.id, {
      ammoCurrent: row.ammoMax,
      ...(changing ? (nextAmmoId ? { ammoId: nextAmmoId } : { ammoId: undefined }) : {}),
    });
    return { ammo: row.ammoMax };
  },
});

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
): Promise<CpredAmmoProfile | null | undefined> {
  if (ammoId === undefined) return undefined;
  if (ammoId === null || ammoId === '') return null;
  if (typeof ammoId !== 'string') throw new RealtimeError('BAD_REQUEST');

  const compendium = await buildCompendiumSync(deps, campaignId);
  const ammo = ammoLookup(compendium.entries)(ammoId);
  if (!ammo) throw new RealtimeError('UNKNOWN_AMMO');

  const entry = row.compendiumId
    ? compendium.entries.find((candidate) => candidate.id === row.compendiumId)
    : undefined;
  const weaponTypeById = new Map(compendium.weaponTypes.map((type) => [type.id, type]));
  const resolved = entry && isWeaponEntry(entry) ? resolveWeapon(entry, { weaponTypeById }) : null;
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
