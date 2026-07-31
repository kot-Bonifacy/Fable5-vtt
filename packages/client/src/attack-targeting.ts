import type { CpredAttackRequest, CpredCharacterData, TokenView } from '@vtt/shared';
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
 */
export function loadAttackAtToken(targetTokenId: string): void {
  const targeting = useAttackStore.getState().targeting;
  if (!targeting) return;

  const chat = useChatStore.getState();
  const tokens = useTokenStore.getState().tokens;
  const scene = useSceneStore.getState().effectiveScene;
  const target = tokens[targetTokenId];
  if (!target || !scene) return;

  const attackerToken = targeting.attackerTokenId
    ? tokens[targeting.attackerTokenId]
    : targeting.characterId
      ? Object.values(tokens).find((token) => token.characterId === targeting.characterId)
      : undefined;
  if (!attackerToken) {
    chat.addNote(`„${targeting.characterName}” nie ma tokenu na tej scenie.`);
    return;
  }
  if (attackerToken.id === target.id) {
    chat.addNote('Wybierz cel inny niż atakujący.');
    return;
  }

  // Where the numbers come from: a sheet, or the token's own combat profile.
  const fighter = targeting.characterId
    ? sheetFighter(targeting.characterId)
    : statistFighter(attackerToken, targeting.weaponRowId);
  if (typeof fighter === 'string') {
    chat.addNote(fighter);
    return;
  }
  const { data, name } = fighter;

  const row = data.weapons.find((weapon) => weapon.id === targeting.weaponRowId);
  if (!row) {
    chat.addNote('Nie znalazłem tej broni na karcie.');
    return;
  }

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
    mode: targeting.mode,
    ...(targeting.aimed ? { aimed: true } : {}),
    ...(targeting.modifier !== 0 ? { modifier: targeting.modifier } : {}),
  };

  const planned = planCpredAttack(
    data,
    useCharacterStore.getState().registry,
    request,
    { row, resolved, typeId: entry && isWeaponEntry(entry) ? entry.weaponTypeId : null },
    { name: target.name, tokenId: target.id, metres },
  );
  if (!planned.ok) {
    chat.addNote(CPRED_ATTACK_PROBLEM_MESSAGES[planned.error]);
    return;
  }
  const { attack } = planned.plan;

  useAttackStore.getState().disarm();
  useRollStore.getState().loadAttackCup({
    ...(targeting.characterId ? { characterId: targeting.characterId } : {}),
    characterName: name,
    attackerTokenId: attackerToken.id,
    targetTokenId: target.id,
    targetName: target.name,
    request,
    title: cupTitle(row.name, target.name, metres, attack.dv, attack.modeLabel, attack.mode),
    modifierTotal: planned.plan.modifierTotal,
  });
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
