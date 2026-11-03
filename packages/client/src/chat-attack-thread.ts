import type { ChatMessageView, DamageLogEntry, RollAttackMeta, RollOpposedMeta } from '@vtt/shared';
import type { ChatItem } from './stores/chatStore.js';

/**
 * Przebieg ataku na czacie (03.11, zlecenie MG z `POMYSLY.md`).
 *
 * Atak, Unik, rzut obrażeń i ich nałożenie przychodzą w różnych chwilach jako
 * osobne wiersze — i takie zostają w bazie, w historii, u botów i w eksporcie.
 * Skleja je wyłącznie widok: karta ataku zbiera rzut obrażeń
 * (`RollDamageMeta.attackMessageId`), wpisy nałożenia tego rzutu
 * (`DamageLogEntry.sourceMessageId`) i skutki amunicji z Testem
 * (`DamageLogEntry.attackMessageId`). Unik i obrona w starciu już dziś
 * przepisują kartę w miejscu, więc nie ma ich tu osobno.
 *
 * Decyzje MG (03.11):
 *  - przebieg stoi tam, gdzie jego **najnowszy** krok — zjeżdża na dół, gdy
 *    dochodzi rzut obrażeń albo ich nałożenie;
 *  - rozliczony zwija się do jednej linii z werdyktem i skutkiem
 *    (`attackThreadSettled`, `attackThreadSummary`);
 *  - widać go, gdy włączone są „Rzuty” **albo** „Walka” (`isCombatThreadRoot`).
 *
 * Widz, który nie dostał karty-matki (atak MG rzucony w ukryciu, starsza
 * historia jeszcze niewczytana), widzi kroki osobno, jak przed zmianą — nic
 * tu nie zgaduje powiązań, których serwer nie zapisał.
 */

/** Feed z przebiegami: kroki wyjęte, karta-matka na miejscu najnowszego kroku. */
export interface AttackThreads {
  items: ChatItem[];
  /** Kroki przebiegu po id karty-matki, od najstarszego. Bez wpisu — karta bez kroków. */
  steps: ReadonlyMap<number, readonly ChatMessageView[]>;
}

const NO_STEPS: ReadonlyMap<number, readonly ChatMessageView[]> = new Map();

function isRollKind(message: ChatMessageView): boolean {
  return message.kind === 'roll' || message.kind === 'gmroll';
}

/** Karta ataku — korzeń przebiegu. */
function attackOf(message: ChatMessageView): RollAttackMeta | undefined {
  return isRollKind(message) ? message.roll?.attack : undefined;
}

/** Karta starcia (Pochwycenie, Konfrontacja) — bez kroków, ale zwija się tak samo. */
function opposedOf(message: ChatMessageView): RollOpposedMeta | undefined {
  return isRollKind(message) ? message.roll?.opposed : undefined;
}

/**
 * Karta walki, którą filtr pokazuje przy „Rzutach” albo „Walce” (decyzja MG):
 * atak i starcie. Gracz, który zgasił „Rzuty”, dalej widzi, kto ile oberwał.
 */
export function isCombatThreadRoot(message: ChatMessageView): boolean {
  return attackOf(message) !== undefined || opposedOf(message) !== undefined;
}

/** Id karty, pod którą ten wiersz staje jako krok — albo `null`. */
function parentIdOf(
  message: ChatMessageView,
  byId: ReadonlyMap<number, ChatMessageView>,
): number | null {
  if (isRollKind(message)) {
    const attackId = message.roll?.damage?.attackMessageId;
    if (attackId === undefined) return null;
    const attack = byId.get(attackId);
    return attack && attackOf(attack) ? attackId : null;
  }
  if (message.kind !== 'damage' || !message.damage) return null;
  const { attackMessageId, sourceMessageId } = message.damage;
  if (attackMessageId !== undefined) {
    const attack = byId.get(attackMessageId);
    if (attack && attackOf(attack)) return attackMessageId;
  }
  if (sourceMessageId === undefined) return null;
  const source = byId.get(sourceMessageId);
  if (!source || !isRollKind(source) || !source.roll?.damage) return null;
  // Rzut obrażeń za atak stoi pod atakiem, a jego nałożenie razem z nim.
  // Rzut bez ataku (z karty, `/r` i „Zastosuj”) sam jest korzeniem.
  return parentIdOf(source, byId) ?? sourceMessageId;
}

/**
 * Składa przebiegi. `items` przychodzą w kolejności feedu (id rosnąco,
 * z notkami na swoich kotwicach); wynik zachowuje tę kolejność dla wszystkiego
 * poza przebiegami, które stają na miejscu swojego najnowszego kroku.
 */
export function foldAttackThreads(items: readonly ChatItem[]): AttackThreads {
  const byId = new Map<number, ChatMessageView>();
  for (const item of items) if (item.type === 'message') byId.set(item.message.id, item.message);

  const rootOf = new Map<number, number>();
  const steps = new Map<number, ChatMessageView[]>();
  const lastAt = new Map<number, number>();
  items.forEach((item, index) => {
    if (item.type !== 'message') return;
    const root = parentIdOf(item.message, byId);
    if (root === null) return;
    rootOf.set(item.message.id, root);
    const list = steps.get(root);
    if (list) list.push(item.message);
    else steps.set(root, [item.message]);
    lastAt.set(root, index);
  });
  if (steps.size === 0) return { items: [...items], steps: NO_STEPS };

  const rootItems = new Map<number, ChatItem>();
  for (const item of items) {
    if (item.type === 'message' && steps.has(item.message.id)) {
      rootItems.set(item.message.id, item);
    }
  }
  const out: ChatItem[] = [];
  items.forEach((item, index) => {
    if (item.type !== 'message') {
      out.push(item);
      return;
    }
    const { id } = item.message;
    // Karta-matka czeka na swój ostatni krok.
    if (steps.has(id)) return;
    const root = rootOf.get(id);
    if (root === undefined) {
      out.push(item);
      return;
    }
    if (lastAt.get(root) === index) out.push(rootItems.get(root)!);
  });
  return { items: out, steps };
}

/** Żywe (niecofnięte) wpisy nałożenia w krokach przebiegu. */
function liveDamage(steps: readonly ChatMessageView[]): DamageLogEntry[] {
  return steps.flatMap((step) =>
    step.kind === 'damage' && step.damage && !step.damage.undone ? [step.damage] : [],
  );
}

/** Czy rzut obrażeń ma już na kim wylądować — wybuch, który wszystkich ominął, nie ma. */
function damageRollHasTargets(roll: ChatMessageView | undefined): boolean {
  const damage = roll?.roll?.damage;
  if (!damage) return true;
  const area = damage.areaTargets;
  if (area === undefined) return true;
  return area.some((target) => target.spared === undefined);
}

/**
 * Przebieg rozliczony — nic na nikogo już nie czeka, więc karta może się
 * zwinąć. Nierozliczony zostaje rozwinięty: tam stoją przyciski Uniku,
 * „Bez uniku”, „Na kubek”, „Popraw strzał”, odpowiedź w starciu i „Zastosuj”.
 */
export function attackThreadSettled(
  root: ChatMessageView,
  steps: readonly ChatMessageView[] = [],
): boolean {
  const attack = attackOf(root);
  if (attack) {
    if ((attack.evasionPending?.length ?? 0) > 0) return false;
    // „Popraw strzał” czeka na strzelca, aż go użyje.
    if (attack.smart) return false;
    // Ogień zaporowy rozstrzyga Testy od razu; pudło, Unik i amunicja bez
    // obrażeń nie mają czego rzucać.
    if (attack.hit === undefined || attack.damageNotation === undefined) return true;
    if (attack.damageRollId === undefined) return false;
    const rolled = steps.find((step) => step.id === attack.damageRollId);
    const live = liveDamage(steps).some((entry) => entry.sourceMessageId === attack.damageRollId);
    return live || (rolled !== undefined && !damageRollHasTargets(rolled));
  }
  const opposed = opposedOf(root);
  if (opposed) {
    const answerable =
      opposed.defenderTokenId !== undefined &&
      opposed.answerLabel !== undefined &&
      !opposed.answered &&
      opposed.concede?.chosen === undefined;
    const conceding = opposed.concede !== undefined && opposed.concede.chosen === undefined;
    return !answerable && !conceding;
  }
  // Rzut obrażeń bez ataku: rozliczony, gdy obrażenia gdzieś leżą.
  if (isRollKind(root) && root.roll?.damage) {
    return liveDamage(steps).some((entry) => entry.sourceMessageId === root.id);
  }
  return false;
}

export type ThreadTone = 'success' | 'failure' | 'neutral' | 'suppressive';

/** Skutek na jednym celu: „Ganger −9 PW · Rana krytyczna: Złamane żebra”. */
export interface ThreadEffect {
  name: string;
  text: string;
  /** Rany i stan ran — plakietki, których nie wolno przeoczyć (MG 03.11). */
  badges: string[];
}

/** Zwinięta linia przebiegu (decyzja MG 03.11: werdykt + skutek, bez kości). */
export interface ThreadSummary {
  actor: string;
  title: string;
  verdict: { text: string; tone: ThreadTone };
  effects: ThreadEffect[];
  /** Krótkie dopiski: kto odskoczył, kto przygwożdżony, kto ustąpił. */
  notes: string[];
}

/** „PW 30 → 26” u MG i właściciela celu, „−4 PW” u reszty stołu (`redactChatMessage`). */
function hpText(entry: DamageLogEntry): string {
  if (entry.hp) return `PW ${entry.hp.before} → ${entry.hp.after}`;
  if (entry.hpLost > 0) return `−${entry.hpLost} PW`;
  return 'bez utraty PW';
}

function effectOf(entry: DamageLogEntry): ThreadEffect {
  const stopped = entry.damageThrough === 0 && entry.bonusDamage === 0;
  const parts: string[] = [];
  if (entry.ammo && entry.damageRolled === 0) {
    parts.push(entry.ammo.name);
  } else if (stopped) {
    parts.push(
      entry.barrierSp !== undefined && entry.barrierSp >= entry.damageRolled
        ? 'bariera zatrzymała cios'
        : 'pancerz zatrzymał cios',
    );
  } else {
    parts.push(`przebicie ${entry.damageThrough}`);
  }
  if (!stopped || entry.hpLost > 0 || entry.hp) parts.push(hpText(entry));
  const badges: string[] = [];
  if (entry.woundLabel) badges.push(entry.woundLabel);
  for (const injury of [entry.injury, entry.injuryExtra, entry.injuryMortal, entry.injuryAimed]) {
    if (injury) badges.push(`Rana krytyczna: ${injury.name}`);
  }
  if (entry.mortalHit) badges.push('+1 do Testu Przeżywalności');
  return { name: entry.targetName, text: parts.join(' · '), badges };
}

function attackVerdict(attack: RollAttackMeta): ThreadSummary['verdict'] {
  if (attack.hit === undefined) return { text: 'Ogień zaporowy', tone: 'suppressive' };
  if (attack.hit) {
    return { text: attack.evaded ? 'Trafienie mimo uniku' : 'Trafienie', tone: 'success' };
  }
  return { text: attack.evaded ? 'Uniknięty' : 'Pudło', tone: 'failure' };
}

function opposedVerdict(opposed: RollOpposedMeta): ThreadSummary['verdict'] {
  if (opposed.outcome === 'win') return { text: 'Wygrana', tone: 'success' };
  if (opposed.outcome === 'loss') return { text: 'Przegrana', tone: 'failure' };
  if (opposed.outcome === 'tie') return { text: 'Remis', tone: 'neutral' };
  return opposed.won ? { text: 'Udane', tone: 'success' } : { text: 'Nieudane', tone: 'failure' };
}

/** Treść zwiniętej linii — czysta funkcja, rysuje ją `AttackThreadRow`. */
export function attackThreadSummary(
  root: ChatMessageView,
  steps: readonly ChatMessageView[] = [],
): ThreadSummary {
  const roll = root.roll;
  const actor = roll?.actor ?? root.authorName;
  const effects = liveDamage(steps).map(effectOf);
  const notes: string[] = [];
  const attack = attackOf(root);
  if (attack) {
    for (const target of attack.area?.targets ?? []) {
      if (target.spared === 'evaded') notes.push(`${target.name} odskoczył`);
      else if (target.spared) notes.push(`${target.name} zasłonięty`);
    }
    if (attack.hit === undefined) {
      const pinned = (attack.forcedChecks ?? []).filter((check) => !check.success);
      notes.push(
        pinned.length > 0
          ? `do osłony: ${pinned.map((check) => check.name).join(', ')}`
          : 'nikt nie musiał szukać osłony',
      );
    }
    return { actor, title: attack.label, verdict: attackVerdict(attack), effects, notes };
  }
  const opposed = roll ? opposedOf(root) : undefined;
  if (opposed) {
    if (opposed.concede?.chosen === 'withdraw') notes.push('przegrany się wycofał');
    if (opposed.concede?.chosen === 'stand') notes.push('przegrany nie ustępuje');
    return { actor, title: opposed.label, verdict: opposedVerdict(opposed), effects, notes };
  }
  return {
    actor,
    title: roll?.title ?? root.text,
    verdict: { text: `${roll?.total ?? ''} obr.`, tone: 'neutral' },
    effects,
    notes,
  };
}
