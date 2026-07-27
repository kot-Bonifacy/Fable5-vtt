import type { CpredAttackRequest } from '@vtt/shared';
import {
  CPRED_ATTACK_PROBLEM_MESSAGES,
  formatMetres,
  isWeaponEntry,
  metresBetweenTokens,
  metresForRules,
  planCpredAttack,
  resolveWeapon,
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
 */
export function loadAttackAtToken(targetTokenId: string): void {
  const targeting = useAttackStore.getState().targeting;
  if (!targeting) return;

  const chat = useChatStore.getState();
  const tokens = useTokenStore.getState().tokens;
  const scene = useSceneStore.getState().effectiveScene;
  const target = tokens[targetTokenId];
  if (!target || !scene) return;

  const character = useCharacterStore.getState().characters[targeting.characterId];
  if (!character) {
    chat.addNote('Nie mam dostępu do karty tej postaci.');
    return;
  }
  const attackerToken = targeting.attackerTokenId
    ? tokens[targeting.attackerTokenId]
    : Object.values(tokens).find((token) => token.characterId === targeting.characterId);
  if (!attackerToken) {
    chat.addNote(`„${character.name}” nie ma tokenu na tej scenie.`);
    return;
  }
  if (attackerToken.id === target.id) {
    chat.addNote('Wybierz cel inny niż atakujący.');
    return;
  }

  const data = character.data;
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
    characterId: character.id,
    characterName: character.name,
    attackerTokenId: attackerToken.id,
    targetTokenId: target.id,
    targetName: target.name,
    request,
    title: cupTitle(row.name, target.name, metres, attack.dv, attack.modeLabel, attack.mode),
    modifierTotal: planned.plan.modifierTotal,
  });
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
