import type {
  CpredAttackMeta,
  CpredAttackMode,
  CpredAttackRequest,
  CpredCharacterData,
  TokenView,
} from '@vtt/shared';
import {
  CPRED_ATTACK_PROBLEM_MESSAGES,
  STATIST_WEAPON_ROW_ID,
  combatProfileSheetForSkill,
  formatMetres,
  isWeaponEntry,
  metresBetweenTokens,
  metresForRules,
  planCpredAttack,
  resolveWeapon,
  sanitizeCombatProfile,
} from '@vtt/shared';
import { useAttackStore } from './stores/attackStore.js';
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
  aimed?: boolean;
  modifier?: number;
}

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
  | { ok: false; message: string };

/**
 * Runs the planner for one intent against one target token.
 *
 * Returns rather than announces: the tooltip wants the refusal as text under
 * the cursor, while the click wants it on the chat log. Neither decision
 * belongs to the planner.
 */
export function planAttackPreview(intent: AttackIntent, targetTokenId: string): AttackPreview {
  const tokens = useTokenStore.getState().tokens;
  const scene = useSceneStore.getState().effectiveScene;
  const target = tokens[targetTokenId];
  const attackerToken = tokens[intent.attackerTokenId];
  if (!target || !scene) return { ok: false, message: 'Nie znalazłem celu na tej scenie.' };
  if (!attackerToken) {
    return { ok: false, message: 'Atakujący nie ma tokenu na tej scenie.' };
  }
  if (attackerToken.id === target.id) {
    return { ok: false, message: 'Wybierz cel inny niż atakujący.' };
  }

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

  const metres = metresForRules(metresBetweenTokens(attackerToken, target, scene));
  const request: CpredAttackRequest = {
    weaponRowId: row.id,
    mode: intent.mode,
    ...(intent.aimed ? { aimed: true } : {}),
    ...(intent.modifier ? { modifier: intent.modifier } : {}),
  };

  const planned = planCpredAttack(
    data,
    useCharacterStore.getState().registry,
    request,
    { row, resolved, typeId: entry && isWeaponEntry(entry) ? entry.weaponTypeId : null },
    { name: target.name, tokenId: target.id, metres },
  );
  if (!planned.ok) return { ok: false, message: CPRED_ATTACK_PROBLEM_MESSAGES[planned.error] };
  return {
    ok: true,
    attack: planned.plan.attack,
    attackerName: name,
    request,
    modifierTotal: planned.plan.modifierTotal,
    metres,
  };
}

/**
 * Loads the cup for an explicit intent — the action bar's path (stage 16f).
 *
 * The bar knows which weapon is active without arming anything, so it hands the
 * intent straight in. Everything after that is the same code the sheet's
 * „Atakuj" runs.
 */
export function loadAttackFor(intent: AttackIntent, targetTokenId: string): void {
  const chat = useChatStore.getState();
  const preview = planAttackPreview(intent, targetTokenId);
  if (!preview.ok) {
    chat.addNote(preview.message);
    return;
  }
  const target = useTokenStore.getState().tokens[targetTokenId];
  const { attack } = preview;
  useAttackStore.getState().disarm();
  useRollStore.getState().loadAttackCup({
    ...(intent.characterId ? { characterId: intent.characterId } : {}),
    characterName: preview.attackerName,
    attackerTokenId: intent.attackerTokenId,
    targetTokenId,
    targetName: target?.name ?? attack.targetName,
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
}

/**
 * Loads the cup from the armed crosshair — the sheet's and the „Walka" tab's
 * path (stages 16 and 16b). Resolves which token is doing the shooting, then
 * hands the same intent to `loadAttackFor`.
 */
export function loadAttackAtToken(targetTokenId: string): void {
  const targeting = useAttackStore.getState().targeting;
  if (!targeting) return;
  const tokens = useTokenStore.getState().tokens;
  const attackerToken = targeting.attackerTokenId
    ? tokens[targeting.attackerTokenId]
    : targeting.characterId
      ? Object.values(tokens).find((token) => token.characterId === targeting.characterId)
      : undefined;
  if (!attackerToken) {
    useChatStore.getState().addNote(`„${targeting.characterName}” nie ma tokenu na tej scenie.`);
    return;
  }
  loadAttackFor(
    {
      ...(targeting.characterId ? { characterId: targeting.characterId } : {}),
      attackerTokenId: attackerToken.id,
      weaponRowId: targeting.weaponRowId,
      mode: targeting.mode,
      aimed: targeting.aimed,
      modifier: targeting.modifier,
    },
    targetTokenId,
  );
}

/** Whoever is firing, as a sheet the planner understands, or a refusal to show. */
type Fighter = { data: CpredCharacterData; name: string } | string;

function sheetFighter(characterId: string): Fighter {
  const character = useCharacterStore.getState().characters[characterId];
  if (!character) return 'Nie mam dostępu do karty tej postaci.';
  return { data: character.data, name: character.name };
}

/**
 * A statist's profile dressed as a sheet (stage 16b) — the same synthesis the
 * server runs, so the preview and the authoritative roll agree on the DV.
 *
 * The skill is filled in from the weapon type here as well; without it the
 * preview would show the shot as untrained and the cup would advertise a
 * modifier the server does not use.
 */
function statistFighter(token: TokenView, weaponRowId: string): Fighter {
  if (!token.combatProfile) {
    return 'Ten token nie ma profilu bojowego — uzupełnij go w „Edytuj…” w menu tokenu.';
  }
  const profile = sanitizeCombatProfile(token.combatProfile);
  const hp = token.hp ?? { current: 1, max: 1 };
  const compendium = useCompendiumStore.getState();
  const entry = profile.weaponId ? compendium.entries[profile.weaponId] : undefined;
  const skillId =
    entry && isWeaponEntry(entry)
      ? (resolveWeapon(entry, {
          weaponTypeById: new Map(Object.entries(compendium.weaponTypeById)),
        }).skillId ?? null)
      : null;
  const data = combatProfileSheetForSkill(profile, hp, skillId);
  // The armed weapon row of a statist is always the synthesised one; anything
  // else in `targeting` would be a stale id from a sheet.
  if (weaponRowId !== STATIST_WEAPON_ROW_ID) {
    return 'Ten token strzela wyłącznie bronią ze swojego profilu bojowego.';
  }
  return { data, name: token.name };
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
