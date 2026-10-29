import type { ChatMessageView, RollAttackMeta, SessionUser, TokenView } from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import type { CharacterSheetView } from './stores/characterStore.js';
import type { ChatItem } from './stores/chatStore.js';
import type { PendingRoll } from './stores/rollStore.js';

/**
 * Rzut na obrażenia po trafieniu czeka na kubku, nie na czacie (14.10, MG).
 *
 * Karta ataku wystawiała guzik „Obrażenia", który ładował kubek — dwa kroki
 * w dwóch miejscach ekranu. Teraz kubek strzelca sam woła, gdy trafienie jest
 * gotowe do rozliczenia (bez czekania na Unik, jeszcze nierzucone), tak jak woła
 * przy wezwaniu MG. Kto ma rzucać, mówi ta sama reguła, którą karta szukała
 * strzelca od #23 — przeniesiona tutaj, żeby kubek i karta jej nie rozjechały.
 */

export interface AttackShooter {
  name: string;
  address: { characterId: string } | { attackerTokenId: string };
}

interface AttackSystem {
  weaponRowId?: string;
  weaponName?: string;
  attackerTokenId?: string;
  operatorUserId?: string;
}

/**
 * Karta, z której padł strzał, i adres, pod którym ten widz może rzucić jej
 * obrażenia (karta gracza po `characterId`, figura NPC-a i wieżyczka po
 * `attackerTokenId`). `shooter` puste = ten widz nie rzuca za strzelca.
 *
 * `leads` mówi, czy to **ten widz prowadzi strzelca** — i tylko jego kubek woła:
 * operator wieżyczki, właściciel karty gracza, właściciel figury, a figury bez
 * właściciela (NPC-e, wieżyczki strzelające same) prowadzi MG. Autor karty nie
 * jest tu dobrym tropem: strzał bronionej strefy wystawia serwer.
 */
export function attackShooterFor(
  message: ChatMessageView,
  attack: RollAttackMeta,
  characters: Record<string, CharacterSheetView>,
  tokens: Record<string, TokenView>,
  user: SessionUser | null,
): { attackerSheet?: CharacterSheetView; shooter?: AttackShooter; leads: boolean } {
  const isGm = user?.role === ROLE_GM;
  const system = attack.system as AttackSystem;
  // Po żetonie strzelca (#23, 27.09); po id wiersza broni tylko na kartach
  // sprzed 16b — id `statist-weapon` powtarza się na każdym statyście.
  const attackerToken = system.attackerTokenId ? tokens[system.attackerTokenId] : undefined;
  const attackerSheet =
    system.attackerTokenId === undefined
      ? Object.values(characters).find((character) =>
          character.data.weapons.some((weapon) => weapon.id === system.weaponRowId),
        )
      : attackerToken?.characterId
        ? characters[attackerToken.characterId]
        : undefined;
  // Karta gracza rzuca sama; karta NPC-a — przez swój żeton (alias, `statBlock`).
  const playerSheet = attackerSheet?.ownerId != null ? attackerSheet : undefined;
  // Figura NPC-a zadaje obrażenia przez żeton (38a) — MG albo jej właściciel.
  const statistAttacker =
    !playerSheet && attackerToken?.characterId
      ? isGm || (user?.id !== undefined && attackerToken.ownerId === user.id)
        ? attackerToken
        : undefined
      : undefined;
  // Netrunner na spuście wieżyczki przejętego węzła (#38): figury zwykle nie
  // widzi, więc adres idzie wprost z karty ataku, a imię — z karty rzutu.
  const operatedTurret =
    !playerSheet &&
    !statistAttacker &&
    system.attackerTokenId !== undefined &&
    user?.id !== undefined &&
    system.operatorUserId === user.id
      ? {
          name: attackerToken?.name ?? message.roll?.actor ?? 'Wieżyczka',
          address: { attackerTokenId: system.attackerTokenId },
        }
      : undefined;
  const sheetShooter =
    playerSheet ?? (system.attackerTokenId === undefined ? attackerSheet : undefined);
  const shooter: AttackShooter | undefined = sheetShooter
    ? { name: sheetShooter.name, address: { characterId: sheetShooter.id } }
    : statistAttacker
      ? { name: statistAttacker.name, address: { attackerTokenId: statistAttacker.id } }
      : operatedTurret;
  const leadsOwned = (ownerId: string | null | undefined) =>
    ownerId != null ? ownerId === user?.id : isGm;
  const leads =
    shooter !== undefined &&
    (system.operatorUserId !== undefined
      ? system.operatorUserId === user?.id
      : sheetShooter
        ? leadsOwned(sheetShooter.ownerId)
        : leadsOwned(statistAttacker?.ownerId));
  return {
    ...(attackerSheet ? { attackerSheet } : {}),
    ...(shooter ? { shooter } : {}),
    leads,
  };
}

/** Rzut obrażeń za tę kartę ataku, gotowy do włożenia w kubek. */
export function damageRollFor(
  messageId: number,
  attack: RollAttackMeta,
  shooter: AttackShooter,
): PendingRoll | null {
  const system = attack.system as AttackSystem;
  if (!system.weaponRowId || attack.damageNotation === undefined) return null;
  const dice =
    attack.damageMultiplier && attack.damageMultiplier > 1
      ? `${attack.damageNotation} ×${attack.damageMultiplier}`
      : attack.damageNotation;
  return {
    ...shooter.address,
    characterName: shooter.name,
    kind: 'damage',
    weaponRowId: system.weaponRowId,
    // Notację, mnożnik, lokację i cel serwer czyta z zapisanej karty ataku —
    // to id jest całym żądaniem.
    request: { kind: 'damage', weaponRowId: system.weaponRowId, attackMessageId: messageId },
    visibility: 'public',
    title: `${system.weaponName ?? 'Broń'} — obrażenia ${dice}`,
    modifierTotal: 0,
  };
}

/** Trafienie czeka na rzut obrażeń: jest co rzucać, nikt nie czeka z Unikiem, nie rzucono. */
export function attackAwaitsDamage(attack: RollAttackMeta): boolean {
  return (
    attack.damageNotation !== undefined &&
    attack.damageRollId === undefined &&
    (attack.evasionPending ?? []).length === 0
  );
}

/**
 * Najnowsza karta ataku, której obrażenia czekają na kubek **tego widza**.
 *
 * Woła tylko ten, kto prowadzi strzelca (`leads`) — strzał gracza nie dzwoni
 * u MG, choć MG ma w ręku każdą kartę. Karty starsze niż `maxAgeMs` milczą (zapomniany rzut sprzed
 * przerwy nie ma wołać przez całą następną sesję), a `skip` to karty odłożone
 * `Esc` albo właśnie rzucone, zanim serwer zdążył je oznaczyć.
 */
export function openDamageCallFor(
  items: ChatItem[],
  user: SessionUser | null,
  characters: Record<string, CharacterSheetView>,
  tokens: Record<string, TokenView>,
  skip: ReadonlySet<number>,
  now: number = Date.now(),
  maxAgeMs: number = 2 * 60 * 60 * 1000,
): { messageId: number; pending: PendingRoll } | null {
  if (!user) return null;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (item.type !== 'message') continue;
    const message = item.message;
    const attack = message.roll?.attack;
    if (!attack) continue;
    if (now - new Date(message.createdAt).getTime() > maxAgeMs) break;
    if (skip.has(message.id) || !attackAwaitsDamage(attack)) continue;
    const { shooter, leads } = attackShooterFor(message, attack, characters, tokens, user);
    if (!shooter || !leads) continue;
    const pending = damageRollFor(message.id, attack, shooter);
    if (pending) return { messageId: message.id, pending };
  }
  return null;
}
