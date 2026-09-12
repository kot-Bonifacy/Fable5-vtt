import type {
  CoverView,
  CpredAimPoint,
  CpredAttackMeta,
  CpredAttackMode,
  CpredAttackRequest,
  CpredAttackTarget,
  CpredCharacterData,
  RangeDvTable,
  ScenePoint,
  SceneView,
  TokenView,
} from '@vtt/shared';
import {
  CPRED_ATTACK_PROBLEM_MESSAGES,
  STATIST_WEAPON_ROW_ID,
  WALL_REACH_M,
  cpredSheetRollSheet,
  coverInLineOfFire,
  distanceToCover,
  formatMetres,
  ammoProfilesOf,
  attachmentProfilesOf,
  fittedAttachmentsFor,
  resolveAttachmentWeapon,
  isWeaponEntry,
  loadedAmmoFor,
  metresBetween,
  metresBetweenTokens,
  metresForRules,
  metresPerPixel,
  planCpredAttack,
  resolveWeapon,
  snapToSquareCentre,
  tokenCentre,
} from '@vtt/shared';
import { useAimMenuStore } from './stores/aimMenuStore.js';
import { useAttackStore, type AttackTargeting } from './stores/attackStore.js';
import { useCoverStore } from './stores/coverStore.js';
import { useCharacterStore } from './stores/characterStore.js';
import { useChatStore } from './stores/chatStore.js';
import { useCompendiumStore } from './stores/compendiumStore.js';
import { useRollStore } from './stores/rollStore.js';
import { useSceneStore } from './stores/sceneStore.js';
import { useTokenStore } from './stores/tokenStore.js';

/**
 * Turning a click on a token into an attack loaded in the cup (stage 16).
 *
 * Everything computed here is a *preview*: the distance, the DV and the
 * modifier shown on the cup come from the same pure planner the server runs,
 * but the server measures the map again when the dice fly. That is deliberate
 * — the preview may be a frame behind a moving token, and the authoritative
 * answer must not be the one the client happened to see.
 *
 * One thing the preview genuinely **cannot** know is whether there is a wall in
 * the way (stage 16b): the geometry never leaves the server, so `lineOfFire`
 * stays unset here and only the server's refusal reports it.
 *
 * Stage 16f added a second caller. The crosshair on the map asks the *same*
 * planner for a tooltip before the click („24 m · 13–25 m · PT 20 · 8/12"), so
 * what the bubble promises and what the cup carries cannot disagree — they are
 * one call apart.
 */

/** Who is shooting and with what — the shape both callers boil down to. */
export interface AttackIntent {
  /** Sheet doing the shooting; absent for a statist (stage 16b). */
  characterId?: string;
  attackerTokenId: string;
  weaponRowId: string;
  mode: CpredAttackMode;
  /** Aimed Shot and what at (s. 170); absent means an ordinary attack. */
  aimedAt?: CpredAimPoint;
  modifier?: number;
  /**
   * The table ruled that the target leaned out from behind the car (stage 16c).
   * Carried on the intent rather than typed into the request so that the
   * decision survives the re-plan the refusal card triggers.
   */
  ignoreCover?: boolean;
  /**
   * Let go of this row instead of using it (stage 16d) — „Rzut przedmiotem".
   * Never set for a grenade, whose weapon type is thrown by definition.
   */
  thrown?: boolean;
  /**
   * Fire the weapon bolted onto this row rather than the row itself
   * (stage 31) — the bayonet, the underbarrel launcher, the underbarrel
   * shotgun. Carried on the intent, so it survives the re-plan an Aimed Shot
   * or a cover refusal triggers.
   */
  attachmentId?: string;
}

/**
 * What is being aimed at: somebody, the thing they are hiding behind (16c), or
 * the ground between them (16d).
 */
export type AttackTargetRef =
  | { kind: 'token'; tokenId: string }
  | { kind: 'cover'; coverId: number }
  | { kind: 'point'; point: ScenePoint };

/** A planned shot, or the sentence explaining why there is none. */
export type AttackPreview =
  | {
      ok: true;
      attack: CpredAttackMeta;
      /** Shooter's display name, as the cup labels it. */
      attackerName: string;
      request: CpredAttackRequest;
      modifierTotal: number;
      metres: number;
    }
  | {
      ok: false;
      message: string;
      /**
       * The cover the refusal is about (stage 16c). Present only for
       * `TARGET_BEHIND_COVER`, and it is what turns a dead-end message into a
       * card with two buttons.
       */
      cover?: CoverView;
    };

/**
 * Runs the planner for one intent against one target token.
 *
 * Returns rather than announces: the tooltip wants the refusal as text under
 * the cursor, while the click wants it on the chat log. Neither decision
 * belongs to the planner.
 */
export function planAttackPreview(
  intent: AttackIntent,
  target: string | AttackTargetRef,
): AttackPreview {
  const ref: AttackTargetRef =
    typeof target === 'string' ? { kind: 'token', tokenId: target } : target;
  const tokens = useTokenStore.getState().tokens;
  const scene = useSceneStore.getState().effectiveScene;
  const attackerToken = tokens[intent.attackerTokenId];
  if (!scene) return { ok: false, message: 'Nie znalazłem celu na tej scenie.' };
  if (!attackerToken) {
    return { ok: false, message: 'Atakujący nie ma tokenu na tej scenie.' };
  }

  // Where the target's name and distance come from. Two shapes, and everything
  // downstream sees only the third one the planner takes — which is the reason
  // shooting a car needed no second code path (stage 16c).
  const aim =
    ref.kind === 'token'
      ? tokenAim(attackerToken, tokens[ref.tokenId], scene)
      : ref.kind === 'point'
        ? pointAim(attackerToken, ref.point, scene)
        : coverAim(
            attackerToken,
            useCoverStore.getState().covers.find((c) => c.id === ref.coverId),
            scene,
          );
  if (typeof aim === 'string') return { ok: false, message: aim };

  // Where the numbers come from: a sheet, or the token's own combat profile.
  const fighter = intent.characterId
    ? sheetFighter(intent.characterId)
    : statistFighter(attackerToken, intent.weaponRowId);
  if (typeof fighter === 'string') return { ok: false, message: fighter };
  const { data, name } = fighter;

  const row = data.weapons.find((weapon) => weapon.id === intent.weaponRowId);
  if (!row) return { ok: false, message: 'Nie znalazłem tej broni na karcie.' };

  const compendium = useCompendiumStore.getState();
  const entry = row.compendiumId ? compendium.entries[row.compendiumId] : undefined;
  const resolved =
    entry && isWeaponEntry(entry)
      ? resolveWeapon(entry, {
          weaponTypeById: new Map(Object.entries(compendium.weaponTypeById)),
        })
      : null;

  const request: CpredAttackRequest = {
    weaponRowId: row.id,
    mode: intent.mode,
    ...(intent.aimedAt ? { aimedAt: intent.aimedAt } : {}),
    ...(intent.modifier ? { modifier: intent.modifier } : {}),
    ...(intent.ignoreCover ? { ignoreCover: true } : {}),
    ...(intent.thrown ? { thrown: true } : {}),
    ...(intent.attachmentId ? { attachmentId: intent.attachmentId } : {}),
  };

  // The one obstacle the client genuinely knows about (stage 16c). Walls stay
  // the server's secret, so `lineOfFire` is still left unset here — but a car
  // travels to every client, so refusing over it locally is the honest answer
  // and gets the choice in front of the player before the dice are picked up.
  const blocking =
    ref.kind === 'token' && !intent.ignoreCover
      ? coverBlockingShot(attackerToken, aim.point, scene)
      : null;

  // Stage 16g: what is in the magazine changes the shot the bubble is pricing —
  // buckshot has a flat DV and a 6 m cone instead of the range table. Read here
  // for the same reason the server reads it in `resolveAttackWeapon`: the
  // planner is handed facts, never a place to look them up. Until the repair
  // session of 22.08 this was the one fact the client did not pass, so the
  // crosshair quoted „Przedział 7–12 m · PT 15" for a round that cannot reach
  // past six — and the refusal arrived only after the dice were picked up.
  const ammoLookup = (id: string) =>
    ammoProfilesOf(Object.values(compendium.entries)).find((p) => p.id === id) ?? null;
  const ammo = loadedAmmoFor(row, resolved, ammoLookup);

  // Stage 31: what is bolted to this gun, and — when the shot is being fired
  // *with* one of them — the weapon that attachment is. Read from the same
  // catalogue the server reads, for the reason the round in the magazine is:
  // a preview that does not know about the underbarrel would price the rifle's
  // shot and be contradicted by the verdict a moment later.
  const weaponTypeById = new Map(Object.entries(compendium.weaponTypeById));
  const attachments = fittedAttachmentsFor(
    row.attachmentIds,
    attachmentProfilesOf(Object.values(compendium.entries)),
    resolved,
  );
  const firedWith = intent.attachmentId
    ? attachments.find((candidate) => candidate.id === intent.attachmentId)
    : undefined;
  const secondaryWeapon = firedWith ? resolveAttachmentWeapon(firedWith, { weaponTypeById }) : null;

  const planned = planCpredAttack(
    data,
    useCharacterStore.getState().registry,
    request,
    {
      row,
      resolved,
      typeId: entry && isWeaponEntry(entry) ? entry.weaponTypeId : null,
      ammo,
      attachments,
      secondary: secondaryWeapon,
      // The underbarrel's own magazine has its own load (02.09) — the bubble
      // reads it from the same catalogue the server does, so a grenade of smoke
      // is priced as smoke before the dice are picked up.
      secondaryAmmo:
        firedWith && secondaryWeapon && row.attachmentAmmoId?.[firedWith.id]
          ? loadedAmmoFor(
              { ammoId: row.attachmentAmmoId[firedWith.id] as string },
              secondaryWeapon,
              ammoLookup,
            )
          : null,
    },
    aim.target,
    {
      ...(blocking
        ? { cover: { name: blocking.name, hpCurrent: blocking.hpCurrent, hpMax: blocking.hpMax } }
        : {}),
      // The Grenade Launcher line every throw is judged by (s. 177). Read from
      // the same catalogue the server reads, so the preview and the verdict
      // cannot disagree about how hard the throw was.
      ...(intent.thrown ? { throwProfile: throwProfile() } : {}),
    },
  );
  if (!planned.ok) {
    return blocking
      ? { ok: false, message: CPRED_ATTACK_PROBLEM_MESSAGES[planned.error], cover: blocking }
      : { ok: false, message: CPRED_ATTACK_PROBLEM_MESSAGES[planned.error] };
  }
  return {
    ok: true,
    attack: planned.plan.attack,
    attackerName: name,
    request,
    modifierTotal: planned.plan.modifierTotal,
    metres: aim.target.metres,
  };
}

/** The target's name, distance and defence — whichever kind of target it is. */
type Aim =
  | string
  | { target: CpredAttackTarget & { tokenId?: string; coverId?: number }; point: ScenePoint };

function tokenAim(attacker: TokenView, target: TokenView | undefined, scene: SceneView): Aim {
  if (!target) return 'Nie znalazłem celu na tej scenie.';
  if (attacker.id === target.id) return 'Wybierz cel inny niż atakujący.';
  return {
    target: {
      name: target.name,
      tokenId: target.id,
      metres: metresForRules(metresBetweenTokens(attacker, target, scene)),
    },
    point: tokenCentre(target, scene),
  };
}

/**
 * Aiming at a cover (stage 16c). The distance is measured to the **nearest**
 * point of the rectangle rather than to its middle, for the reason the server
 * uses the same point: a line to the centre of a car goes through the near half
 * of the bodywork, and the car would block a shot at itself.
 */
function coverAim(attacker: TokenView, cover: CoverView | undefined, scene: SceneView): Aim {
  if (!cover) return 'Ta osłona już nie stoi na tej scenie.';
  const perPixel = metresPerPixel(scene);
  const origin = tokenCentre(attacker, scene);
  return {
    target: {
      name: cover.name,
      coverId: cover.id,
      cover: true,
      metres: metresForRules(distanceToCover(origin, cover) * perPixel),
    },
    point: {
      x: Math.min(Math.max(origin.x, cover.x), cover.x + cover.width),
      y: Math.min(Math.max(origin.y, cover.y), cover.y + cover.height),
    },
  };
}

/**
 * Aiming at a square of ground (stage 16d) — where a grenade is meant to land.
 *
 * The click is snapped to the middle of a grid square before anything is
 * measured, so the preview's distance is the one the server will measure: the
 * rules centre the blast on a square, not on the pixel somebody hit.
 */
function pointAim(attacker: TokenView, point: ScenePoint, scene: SceneView): Aim {
  const centre = snapToSquareCentre(point, scene);
  return {
    target: {
      name: POINT_TARGET_NAME,
      point: true,
      metres: metresForRules(metresBetween(tokenCentre(attacker, scene), centre, scene)),
    },
    point: centre,
  };
}

/** How a square of ground names itself on the cup and on the card. */
export const POINT_TARGET_NAME = 'wybrane pole';

/** Catalogue row every throw reads its DV off (s. 177) — mirrors the server. */
const GRENADE_LAUNCHER_TYPE_ID = 'weapon-type.grenade-launcher';

/** The range line a thrown object is judged by; undefined refuses the throw. */
function throwProfile(): { rangeDv: RangeDvTable } | undefined {
  const types = useCompendiumStore.getState().weaponTypeById;
  const type =
    types[GRENADE_LAUNCHER_TYPE_ID] ??
    Object.values(types).find((candidate) => candidate.thrown === true && candidate.rangeDv);
  return type?.rangeDv ? { rangeDv: type.rangeDv } : undefined;
}

/** Cover between the shooter and where they are aiming; null on a clear shot. */
function coverBlockingShot(
  attacker: TokenView,
  aimPoint: ScenePoint,
  scene: SceneView,
): CoverView | null {
  const covers = useCoverStore.getState().covers;
  if (covers.length === 0) return null;
  const perPixel = metresPerPixel(scene);
  if (perPixel <= 0) return null;
  return coverInLineOfFire(covers, tokenCentre(attacker, scene), aimPoint, WALL_REACH_M / perPixel);
}

/**
 * Loads the cup for an explicit intent — the action bar's path (stage 16f).
 *
 * The bar knows which weapon is active without arming anything, so it hands the
 * intent straight in. Everything after that is the same code the sheet's
 * „Atakuj" runs.
 */
export function loadAttackFor(intent: AttackIntent, target: string | AttackTargetRef): void {
  const ref: AttackTargetRef =
    typeof target === 'string' ? { kind: 'token', tokenId: target } : target;
  const chat = useChatStore.getState();
  // Poprzedni wybór Celowania schodzi razem z poprzednim ładunkiem kubka —
  // także wtedy, gdy ten strzał odbije się od odmowy („cel za osłoną").
  useAimMenuStore.getState().close();
  const preview = planAttackPreview(intent, ref);
  if (!preview.ok) {
    // „Cel za osłoną" is not a dead end — it is a question (stage 16c). The two
    // buttons are the two answers the rules allow, and nothing has been rolled
    // or spent while the card sits there.
    if (preview.cover && ref.kind === 'token') {
      offerCoverChoice(intent, ref.tokenId, preview.cover);
      return;
    }
    chat.addNote(preview.message);
    return;
  }
  const { attack } = preview;
  useAttackStore.getState().disarm();
  const scene = useSceneStore.getState().effectiveScene;
  useRollStore.getState().loadAttackCup({
    ...(intent.characterId ? { characterId: intent.characterId } : {}),
    characterName: preview.attackerName,
    attackerTokenId: intent.attackerTokenId,
    ...(ref.kind === 'token'
      ? { targetTokenId: ref.tokenId }
      : ref.kind === 'point'
        ? { targetPoint: scene ? snapToSquareCentre(ref.point, scene) : ref.point }
        : { targetCoverId: ref.coverId }),
    targetName: attack.targetName,
    request: preview.request,
    title: cupTitle(
      attack.weaponName,
      attack.targetName,
      preview.metres,
      attack.dv,
      attack.modeLabel,
      attack.mode,
    ),
    modifierTotal: preview.modifierTotal,
  });
  // Celowanie przy kursorze (naprawa 31.08). Ta jedna linia obsługuje **każdą**
  // drogę ataku, bo każda kończy się tutaj: kafel paska, „Atak" z karty, menu
  // żetonu i karta odmowy z osłoną. Do 31.08 guziki Celowania wisiały wyłącznie
  // na banerze uzbrojonego krzyżyka, więc dwie z tych dróg reguły nie znały.
  if (mayAimShot(intent, ref)) {
    useAimMenuStore.getState().open({
      intent,
      targetTokenId: ref.tokenId,
      ...(intent.aimedAt ? { aimedAt: intent.aimedAt } : {}),
    });
  }
}

/**
 * Czy w ten strzał wolno Celować (s. 170)?
 *
 * Pojedynczy strzał w figurę, i tyle: ogniem ciągłym Celować nie można
 * („Strzelając ogniem ciągłym, nie można Celować", s. 173), a ładunek rzucony
 * na kratkę i ostrzelana osłona nie mają głowy ani nogi. Reszta odmów należy
 * do planera — okno tylko nie proponuje tego, czego reguła nie zna.
 */
export function mayAimShot(
  intent: AttackIntent,
  ref: AttackTargetRef,
): ref is { kind: 'token'; tokenId: string } {
  return ref.kind === 'token' && intent.mode === 'single';
}

/**
 * The refusal card of „cel za osłoną" (stage 16c).
 *
 * Deliberately a local note rather than a chat message on the server: nothing
 * has happened yet, and the log should record the decision, not the hesitation.
 * The wording names the obstacle and its remaining body points, because that is
 * the number the choice actually turns on.
 */
export function offerCoverChoice(
  intent: AttackIntent,
  targetTokenId: string,
  cover: CoverBlock,
): void {
  const target = useTokenStore.getState().tokens[targetTokenId];
  const who = target?.name ?? 'Cel';
  useChatStore
    .getState()
    .addNote(`${who} jest za osłoną: ${cover.name} (${cover.hpCurrent}/${cover.hpMax} PW).`, [
      {
        label: 'Ostrzelaj osłonę',
        title: 'Strzał w osłonę: obrażenia schodzą z jej PW, nadwyżka przepada',
        run: () => loadAttackFor(intent, { kind: 'cover', coverId: cover.id }),
      },
      {
        label: 'Strzelaj mimo osłony',
        title: 'Cel się wychylił — decyzja stołu, zapisana na karcie rzutu',
        run: () => loadAttackFor({ ...intent, ignoreCover: true }, targetTokenId),
      },
    ]);
}

/** What the refusal card needs to know about the obstacle. */
export interface CoverBlock {
  id: number;
  name: string;
  hpCurrent: number;
  hpMax: number;
}

/**
 * The same card for a **Human Shield** (stages 14d, 16c) — „uznaje się, że
 * jesteś za osłoną" (s. 181).
 *
 * Only the server knows who is holding whom, so this one is raised from the
 * `attack:roll` ack rather than from the preview. „Ostrzelaj tarczę" is an
 * ordinary attack at the shield's own token, which is exactly what „PW tarczy
 * to PW trzymanego" means once you stop treating it as a special case.
 */
export function offerShieldChoice(
  intent: AttackIntent,
  targetTokenId: string,
  shield: { tokenId: string; name: string },
): void {
  const target = useTokenStore.getState().tokens[targetTokenId];
  useChatStore
    .getState()
    .addNote(`${target?.name ?? 'Cel'} zasłania się Ludzką tarczą: ${shield.name}.`, [
      {
        label: `Ostrzelaj tarczę (${shield.name})`,
        title: 'PW tarczy to PW trzymanego — strzał trafia w nią',
        run: () => loadAttackFor(intent, { kind: 'token', tokenId: shield.tokenId }),
      },
      {
        label: 'Strzelaj mimo tarczy',
        title: 'Cel się wychylił — decyzja stołu, zapisana na karcie rzutu',
        run: () => loadAttackFor({ ...intent, ignoreCover: true }, targetTokenId),
      },
    ]);
}

/**
 * Loads the cup from the armed crosshair — the sheet's and the „Walka" tab's
 * path (stages 16 and 16b). Resolves which token is doing the shooting, then
 * hands the same intent to `loadAttackFor`.
 */
export function loadAttackAtToken(targetTokenId: string): void {
  const targeting = useAttackStore.getState().targeting;
  if (!targeting) return;
  const intent = intentFromTargeting(targeting, useTokenStore.getState().tokens);
  if (!intent) {
    useChatStore.getState().addNote(`„${targeting.characterName}” nie ma tokenu na tej scenie.`);
    return;
  }
  loadAttackFor(intent, targetTokenId);
}

/**
 * The intent behind an armed crosshair, or null when whoever armed it has no
 * token on this scene.
 *
 * One function rather than one per caller, because there are two — the click
 * that loads the cup and the bubble that prices the shot a moment earlier — and
 * a field one of them forgets is a bubble that promises a different shot than
 * the one that fires. That is exactly what happened until 02.09: the bubble
 * built its own copy of this and left out `attachmentId`, so aiming the bayonet
 * quoted the rifle („Militech Dragon") while the banner over the map and the
 * attack card both said „Bagnet".
 */
export function intentFromTargeting(
  targeting: AttackTargeting,
  tokens: Record<string, TokenView>,
): AttackIntent | null {
  const attackerToken = targeting.attackerTokenId
    ? tokens[targeting.attackerTokenId]
    : targeting.characterId
      ? Object.values(tokens).find((token) => token.characterId === targeting.characterId)
      : undefined;
  if (!attackerToken) return null;
  return {
    ...(targeting.characterId ? { characterId: targeting.characterId } : {}),
    attackerTokenId: attackerToken.id,
    weaponRowId: targeting.weaponRowId,
    mode: targeting.mode,
    ...(targeting.aimedAt ? { aimedAt: targeting.aimedAt } : {}),
    modifier: targeting.modifier,
    ...(targeting.thrown ? { thrown: true } : {}),
    ...(targeting.attachmentId ? { attachmentId: targeting.attachmentId } : {}),
  };
}

/** Whoever is firing, as a sheet the planner understands, or a refusal to show. */
type Fighter = { data: CpredCharacterData; name: string } | string;

function sheetFighter(characterId: string): Fighter {
  const character = useCharacterStore.getState().characters[characterId];
  if (!character) return 'Nie mam dostępu do karty tej postaci.';
  return { data: character.data, name: character.name };
}

/**
 * Karta figury prowadzonej przez żeton, przygotowana do rzutu (etap 38a).
 *
 * To samo podstawienie, które robi serwer (`sheetForRoll`), żeby podgląd
 * i rozstrzygający rzut zgadzały się co do PT. Umiejętność bierze się z typu
 * broni: bez tego podgląd pokazywałby strzał jak niewyszkolony i kubek
 * reklamowałby modyfikator, którego serwer nie użyje.
 */
function statistFighter(token: TokenView, weaponRowId: string): Fighter {
  const character = token.characterId
    ? useCharacterStore.getState().characters[token.characterId]
    : undefined;
  if (!character) {
    return 'Ta figura nie ma karty — załóż ją w „Edytuj…” w menu figury.';
  }
  const compendium = useCompendiumStore.getState();
  const row = character.data.weapons.find((weapon) => weapon.id === STATIST_WEAPON_ROW_ID);
  const entry = row?.compendiumId ? compendium.entries[row.compendiumId] : undefined;
  const skillId =
    entry && isWeaponEntry(entry)
      ? (resolveWeapon(entry, {
          weaponTypeById: new Map(Object.entries(compendium.weaponTypeById)),
        }).skillId ?? null)
      : null;
  // The armed weapon row of a figure statted from the token menu is always the
  // one the quick editor writes; anything else in `targeting` would be a stale
  // id from a sheet.
  if (weaponRowId !== STATIST_WEAPON_ROW_ID) {
    return 'Ta figura strzela wyłącznie bronią wpisaną w menu figury.';
  }
  return { data: cpredSheetRollSheet(character.data, skillId), name: token.name };
}

/** „Zgrzyt 9 → Ganger · 24 m · PT 20" — what the cup says before the throw. */
function cupTitle(
  weaponName: string,
  targetName: string,
  metres: number,
  dv: number | null,
  modeLabel: string,
  mode: string,
): string {
  const parts = [`${weaponName} → ${targetName}`, formatMetres(metres)];
  if (dv !== null) parts.push(`PT ${dv}`);
  if (mode !== 'single') parts.push(modeLabel.toLowerCase());
  return parts.join(' · ');
}
