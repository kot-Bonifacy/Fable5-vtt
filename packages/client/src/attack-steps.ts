import type { ChatMessageView, RollAttackMeta, SessionUser, TokenView } from '@vtt/shared';
import { attackShooterFor } from './attack-damage-call.js';
import type { CharacterSheetView } from './stores/characterStore.js';
import type { ChatItem } from './stores/chatStore.js';

/**
 * Atak to jedna karta z krokami (etap 63c, decyzja MG 2 z 28.10).
 *
 * Przed etapem trafienie, Unik i obrażenia stały na czacie jako trzy karty
 * (trafienie z dopiskiem o Uniku, rzut obrażeń, rozliczenie na celu), a kubek
 * wołał o każdy krok bez słowa, który to krok. Teraz karta ataku rośnie na
 * żywo — ① trafienie → ② Unik celu → ③ obrażenia — a nad kubkiem stoi
 * „Krok X/3”. Serwer niczego tu nie skleja: rzut obrażeń i rozliczenia zostają
 * osobnymi wierszami w bazie (cofanie, widoczność, dziennik), a karta ataku
 * wciąga je dopiero w kanale klienta.
 */

/** Stan kroku: zrobiony, nieudany, teraz twój ruch, czeka na kogoś, nie dotyczy. */
export type AttackStepState = 'done' | 'failed' | 'now' | 'waiting' | 'skipped';

export interface AttackStepStates {
  /** ① Rzut na trafienie przeciw PT. */
  hit: 'done' | 'failed';
  /** ② Unik albo Odskok celu; `null` — po pudle nie ma czego unikać. */
  evasion: AttackStepState | null;
  /** ③ Obrażenia; `null` — po pudle nie ma czego rzucać. */
  damage: AttackStepState | null;
}

/**
 * Stany trzech kroków karty ataku, albo `null` dla ognia zaporowego (`hit`
 * nieobecne): ten rzut ustala PT dla innych i kroków nie ma.
 *
 * Krok ① liczy rzut strzelca, nie werdykt końcowy: udany Unik zmienia `hit`
 * na fałsz, ale strzelec swoje PT pobił. Ładunek obszarowy idzie dalej także
 * po pudle — chybiony granat i tak gdzieś wybucha.
 */
export function attackStepStates(attack: RollAttackMeta): AttackStepStates | null {
  if (attack.hit === undefined) return null;
  const landed = attack.hit || attack.evaded === true;
  const hit = landed ? 'done' : 'failed';
  if (!landed && !attack.area) return { hit, evasion: null, damage: null };

  const pending = attack.evasionPending ?? [];
  const answered = attack.area
    ? attack.area.targets.some((row) => row.jump !== undefined || row.spared === 'evaded')
    : attack.dodge !== undefined || attack.evaded === true || attack.noEvade === true;
  const evasion: AttackStepState = pending.length > 0 ? 'waiting' : answered ? 'done' : 'skipped';

  const damage: AttackStepState =
    attack.damageRollId !== undefined
      ? 'done'
      : attack.damageNotation === undefined
        ? 'skipped'
        : pending.length > 0
          ? 'waiting'
          : 'now';
  return { hit, evasion, damage };
}

/** Na kogo czeka krok ② — imiona z wiersza obszaru, figury albo „cel”. */
export function attackPendingNames(
  attack: RollAttackMeta,
  tokens: Record<string, TokenView>,
): string[] {
  return (attack.evasionPending ?? []).map(
    (tokenId) =>
      attack.area?.targets.find((target) => target.tokenId === tokenId)?.name ??
      tokens[tokenId]?.name ??
      'cel',
  );
}

export interface AttackFold {
  /** Karta ataku → wiersze jej kroku ③: rzut obrażeń i rozliczenia na celach. */
  children: Map<number, ChatMessageView[]>;
  /** Wiersze wciągnięte do karty ataku — kanał nie rysuje ich osobno. */
  folded: Set<number>;
}

/**
 * Które wiersze należą do której karty ataku.
 *
 * Rzut obrażeń wskazuje kartę ataku (`RollDamageMeta.attackMessageId`, #56),
 * a rozliczenie — swój rzut (`DamageLogEntry.sourceMessageId`). Wciąga się
 * tylko to, czego karta ataku jest w kanale: rzut, którego atak został za
 * granicą wczytanej historii albo nie doszedł do tego widza, stoi sam jak
 * przed etapem.
 */
export function foldAttackCards(items: readonly ChatItem[]): AttackFold {
  const attacks = new Set<number>();
  const damageRollOf = new Map<number, number>();
  const children = new Map<number, ChatMessageView[]>();
  const folded = new Set<number>();
  const adopt = (attackId: number, message: ChatMessageView) => {
    const list = children.get(attackId);
    if (list) list.push(message);
    else children.set(attackId, [message]);
    folded.add(message.id);
  };
  for (const item of items) {
    if (item.type !== 'message') continue;
    const message = item.message;
    if (message.roll?.attack) {
      attacks.add(message.id);
      continue;
    }
    const attackId = message.roll?.damage?.attackMessageId;
    if (attackId !== undefined && attacks.has(attackId)) {
      damageRollOf.set(message.id, attackId);
      adopt(attackId, message);
      continue;
    }
    const sourceId = message.kind === 'damage' ? message.damage?.sourceMessageId : undefined;
    const owner = sourceId !== undefined ? damageRollOf.get(sourceId) : undefined;
    if (owner !== undefined) adopt(owner, message);
  }
  return { children, folded };
}

/** Pasek nad kubkiem: „Krok 3/3 · Rzuć obrażenia 3k6”. */
export interface CupStep {
  step: 1 | 2 | 3;
  text: string;
}

/** „Krok 2/3 · Rzuć Unik: Iskra” — jeden zapis paska na wszystkie drogi. */
export function cupStepLabel(step: CupStep): string {
  return `Krok ${step.step}/3 · ${step.text}`;
}

/**
 * Atak tego widza, który czeka na Unik celu — wtedy kubek strzelca stoi pusty
 * i bez paska wyglądałby na zepsuty („czemu nie mogę rzucić obrażeń?”).
 * Najnowszy, tylko u tego, kto prowadzi strzelca (ta sama reguła, co wezwanie
 * obrażeń), karty starsze niż `maxAgeMs` milczą.
 */
export function awaitedDodgeStepFor(
  items: readonly ChatItem[],
  user: SessionUser | null,
  characters: Record<string, CharacterSheetView>,
  tokens: Record<string, TokenView>,
  now: number = Date.now(),
  maxAgeMs: number = 2 * 60 * 60 * 1000,
): CupStep | null {
  if (!user) return null;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (item.type !== 'message') continue;
    const message = item.message;
    const attack = message.roll?.attack;
    if (!attack) continue;
    if (now - new Date(message.createdAt).getTime() > maxAgeMs) return null;
    if (attack.damageRollId !== undefined || (attack.evasionPending ?? []).length === 0) continue;
    if (!attackShooterFor(message, attack, characters, tokens, user).leads) continue;
    const verb = attack.area?.shape === 'cone' || !attack.area ? 'Unik' : 'Odskok';
    return {
      step: 2,
      text: `Czeka na ${verb}: ${attackPendingNames(attack, tokens).join(', ')}`,
    };
  }
  return null;
}
