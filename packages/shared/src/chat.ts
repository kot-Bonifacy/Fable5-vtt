/** Chat message types and the chat command parser (pure logic, no IO). */

import {
  parseRollNotation,
  type RollFormula,
  type RollParseError,
  type RollResult,
} from './dice.js';
import type { BotActionProposal } from './bots/types.js';
import { checkCallTargetText, type CheckCallEntry } from './checks.js';
import type { HandoutLogEntry } from './handouts.js';
import type { JournalLogEntry } from './journal.js';
import type { TimeLogEntry } from './gametime.js';

/**
 * `action` is the public log of a spent combat action (stage 14b); `gmaction`
 * is its refused twin, delivered only to the GM and the player who tried —
 * the same split `roll`/`gmroll` has had since stage 06.
 *
 * `proposal` (stage 20a) is a bot's intention waiting to be waved through. It is
 * never public: what reaches the table is the roll that follows approval, and it
 * looks exactly like anybody else's — a bot's mechanics stay as indistinguishable
 * as its speech has been since stage 11.
 *
 * `check` (stage 32) is the GM asking one character for a roll. It travels the
 * whisper pattern for the same reason `proposal` does — it is a request put to
 * one person, not a line for the table — and the roll that answers it is an
 * ordinary card, public or GM-only exactly as the call decided.
 */
export type ChatKind =
  | 'say'
  | 'whisper'
  | 'roll'
  | 'gmroll'
  | 'damage'
  | 'action'
  | 'gmaction'
  | 'proposal'
  | 'economy'
  | 'handout'
  | 'journal'
  /** Wezwanie MG do Testu, czekające na kubek wezwanego (etap 32). */
  | 'check'
  /** Dzień odpoczynku albo podana dawka — ciało zmienia stan poza walką. */
  | 'recovery'
  /** Skok zegara świata (etap 37) — „Minęła noc, 15 marca 2045". */
  | 'time';

/**
 * Powrót do zdrowia, jak zapisuje go czat (s. 222–223, s. 150).
 *
 * Jedna karta na dwie czynności — dzień odpoczynku i podaną dawkę — bo z miejsca
 * stołu to jedno zdarzenie: „komuś zrobiło się lepiej i wiadomo dlaczego".
 * Rozdzielenie ich dałoby dwa niemal identyczne kształty i dwa miejsca do
 * poprawienia, kiedy dojdzie trzeci sposób odzyskiwania PW.
 *
 * Karta jest **publiczna**, w odróżnieniu od karty obrażeń: liczby PW nie ma
 * na niej wcale (`hp` niesie **różnicę**, nie stan), a to, że ktoś przespał
 * dzień albo dostał zastrzyk, dzieje się przy całym stole.
 */
export interface RecoveryLogEntry {
  /** Czyje ciało — nazwa postaci. */
  actor: string;
  /** „Dzień odpoczynku" albo nazwa środka. */
  title: string;
  /** Odzyskane PW; 0, gdy dzień albo dawka nic nie dały. */
  hp: number;
  /** Rozbicie tempa albo zdanie z tabeli farmaceutyków — po wierszu na powód. */
  lines: string[];
  /** Zdanie zamykające: odmowa („nie jest ustabilizowany") albo skutek uboczny. */
  note?: string;
  /** Zabarwienie karty — odmowa czyta się inaczej niż siedem odzyskanych PW. */
  tone?: 'success' | 'warn';
}

/**
 * A movement of eddies, as the chat records it (stage 23b).
 *
 * Never public. A balance is not a secret worth a rule of its own, but it is
 * nobody's business either, so the card reaches the GM, the payer and the payee
 * — the whisper pattern, exactly like a refused action (`gmaction`).
 */
export interface EconomyLogEntry {
  /** „Zakup", „Przelew", „Rozliczenie miesiąca". */
  title: string;
  /** One line per operation: „Rico — Zgrzyt 9 · −100 ed · saldo 400 ed". */
  lines: string[];
  /** Closing line of a settlement („Pobrano 3 400 ed · niedopłata 800 ed"). */
  summary?: string;
}

/**
 * One combat action, as the chat log records it (stage 14b). Written by the
 * server: the budget it spent is the server's own arithmetic, and a refusal is
 * the server's verdict, so nothing here comes off the wire.
 */
export interface CombatActionLogEntry {
  /** Participant the action belonged to — the „przepuść" button needs it. */
  combatantId: string;
  /** Who acted, denormalized so the line survives a removed participant. */
  actorName: string;
  /** Catalogue id of the action (system-specific, opaque here). */
  actionId: string;
  /** Polish name of the action, e.g. „Przeładowanie". */
  actionName: string;
  /** Free-text detail the actor added. */
  note?: string;
  /**
   * Why the action was refused; absent on a successful one. The code is the
   * machine-readable half, the message the one a human reads.
   */
  refusal?: { code: string; message: string };
  /** Set once the GM waved a refusal through. */
  passed?: boolean;
  /** The GM ran their own NPC past the budget — logged, never blocked. */
  overspent?: boolean;
}

/**
 * Result of applying a damage roll to a target (stage 15). Written by the
 * server, never by a client — the numbers come from the stored roll and the
 * target's sheet, so nobody can type their own damage.
 *
 * Locations are opaque strings plus a label: the chat core stays free of game
 * system knowledge, exactly like `RollDamageMeta`.
 *
 * Visibility: everything here is public except `hp` and `characterId`, which
 * are stripped for anyone but the GM and the target's owner — the same rule
 * tokens follow since stage 05 (absolute HP never leave the server).
 */
export interface DamageLogEntry {
  /** Chat message the damage roll came from. */
  sourceMessageId?: number;
  /** Token that took the damage; absent when a cover did (stage 16c). */
  targetTokenId?: string;
  /** Cover that took the damage instead of a token (stage 16c). */
  targetCoverId?: number;
  targetName: string;
  /** Sheet that took the damage; absent for statists and for redacted views. */
  characterId?: string | null;
  /** Who may see the HP numbers (token owner or sheet owner). */
  targetOwnerId?: string | null;
  location: string;
  locationLabel: string;
  /** What the dice showed. */
  damageRolled: number;
  /** SP subtracted (0 when unarmored or when the damage ignores armor). */
  armorSp: number;
  /**
   * Only half the worn SP counted, rounded up (s. 176) — a blade or a martial
   * art. On the card because the number in `armorSp` is otherwise unexplainable:
   * a player who knows the target wears OB 11 has to be told why 6 was
   * subtracted, or the arithmetic reads as a bug.
   */
  armorHalved?: boolean;
  /**
   * HP a Solo's „Redukcja obrażeń" kept off this hit (stage 30a, s. 146) —
   * absent when none was. On the card for the same reason `armorHalved` is:
   * without it the difference between what got through the armour and what
   * came off the HP bar has no explanation.
   */
  damageReduced?: number;
  /** Damage that reached HP, after armor, the head multiplier and Damage Reduction. */
  damageThrough: number;
  doubled: boolean;
  /**
   * What a head hit multiplied by, when it was not the printed ×2 — „Pęknięta
   * czaszka" makes it ×3 (s. 188). Absent on every ordinary head hit, so the
   * card only says it when the number is surprising.
   */
  headMultiplier?: number;
  /** Critical injury bonus damage included in `hpLost`. */
  bonusDamage: number;
  hpLost: number;
  /** Absolute HP — GM and owner only. */
  hp?: { before: number; after: number; max: number };
  /** Ablated armor piece, when one was hit. */
  armor?: { rowId: string; name: string; before: number; after: number };
  /** Wound state change, e.g. „Poważnie ranny → Śmiertelnie ranny". */
  woundLabel?: string;
  /** Critical injury drawn from the table (2d6). */
  injury?: { id: string; name: string; effect: string; rolled: number };
  /**
   * A second injury the same hit inflicted (stage 16g: dumdum rounds re-roll a
   * „Ciało obce" and the target takes both wounds). Absent for every ordinary
   * hit; „Cofnij" takes it off with the first one.
   */
  injuryExtra?: { id: string; name: string; effect: string; rolled: number };
  /** Why no injury was drawn, e.g. „brak tabeli dla głowy". */
  injuryNote?: string;
  /**
   * What the Aimed Shot was pointed at (s. 170), when the hit came from one.
   * The head needs nothing here — its ×2 is already in `doubled` — but a leg
   * and a held item have consequences that only exist once the damage lands,
   * and the card has to be able to say which aim earned them.
   */
  aimedAt?: string;
  /**
   * The consequence of the aim that is not a wound: „Cel upuszcza trzymany
   * przedmiot" (s. 170). Prose rather than an inventory move — the VTT does not
   * model what is in whose hands, so the sentence is the whole effect, exactly
   * as `injuryNote` is for a statist.
   */
  aimNote?: string;
  /**
   * „Złamana noga" inflicted by an aimed leg shot — a wound the rules name
   * outright instead of rolling for (s. 170).
   *
   * Its own field rather than `injury`, because the same hit may both roll two
   * sixes *and* break the leg, and „Cofnij" has to be able to take all three
   * wounds off. No `rolled`: nobody rolled for it.
   */
  injuryAimed?: { id: string; name: string; effect: string };
  /**
   * The round that landed and what it changed (stage 16g) — „pancerz −2
   * (zamiast −1)", „cel zatrzymany na 1 PW". Named entries rather than a silent
   * correction, the treatment „Trzymanie −2" got in 14d.
   */
  ammo?: {
    name: string;
    notes?: string[];
    /**
     * What to call this line on the card; absent means „nabój" (stage 16g).
     * A defended zone of stage 26f names itself „system" here, because
     * „nabój: Podłoga elektryczna" would be the card lying about where the
     * damage came from.
     */
    label?: string;
  };
  /**
   * Statuses this hit put on the target token (stage 14d: a choke knocks out,
   * a throw knocks down). „Cofnij" takes them off again — restoring the HP and
   * leaving the character unconscious would be a half-undo nobody can see.
   */
  statusesAdded?: string[];
  /**
   * Numbers those statuses carried before the hit (stage 16g), so „Cofnij" can
   * put a fire that was already burning back to its old intensity instead of
   * leaving the flamethrower's 4 on a target that was burning for 2. `null`
   * means the status had no number of its own.
   */
  statusValuesBefore?: Record<string, number | null>;
  /**
   * Effects this hit put on for a limited time (stage 16h) — what the GM's
   * „Minęła minuta" button lifts.
   *
   * Distinct from „Cofnij", and the difference is the whole point of the field:
   * undoing says the hit should never have happened and puts the HP back, while
   * this says the minute has passed and leaves everything the round earned. In
   * a fight the round counter presses it first; outside one, nothing else can.
   */
  timed?: {
    statusIds?: string[];
    injuryIds?: string[];
    /** „na minutę — poza walką, zdejmuje MG" — what the button explains. */
    label: string;
    /** Set once somebody pressed it, so the card stops offering it. */
    expired?: boolean;
  };
  /**
   * Tokens this hit stopped being afraid of the target (stage 23c): dropping to
   * 0 HP is „pokonać wroga", so everybody who backed down from them loses the
   * −2 there and then.
   *
   * Recorded for the same reason as `statusesAdded` — without it „Cofnij" puts
   * the Hit Points back and leaves the Konfrontacja won, which is a half-undo
   * nobody at the table can see. The list is addresses, not stickers: a token
   * afraid of somebody else too keeps its badge either way.
   */
  fearCleared?: string[];
  /** Set once the GM took the application back. */
  undone?: boolean;
  undoneByName?: string;
}

/** A chat message as seen by clients. Whisper fields are present only for whispers. */
export interface ChatMessageView {
  id: number;
  kind: ChatKind;
  /**
   * Author's user account. An NPC line (bot-generated or typed by the GM with
   * `/jako`) is authored by the GM who runs the bot — the two are
   * indistinguishable on purpose, so players cannot tell a bot from the GM.
   */
  authorId: string;
  /** Display name: the user's, or the NPC's when `botId` is set. */
  authorName: string;
  /** Set when the line was spoken by a bot profile. */
  botId?: string;
  /** NPC portrait (`/uploads/...`); NPC lines only. */
  portraitUrl?: string | null;
  recipientId?: string;
  /** Whisper addressed to a bot. */
  recipientBotId?: string;
  recipientName?: string;
  /** For rolls: the optional label typed after the notation. */
  text: string;
  /** Structured roll outcome — present only for kinds `roll` and `gmroll`. */
  roll?: RollResult;
  /** Applied damage — present only for kind `damage` (stage 15). */
  damage?: DamageLogEntry;
  /** Spent (or refused) combat action — kinds `action` and `gmaction`. */
  action?: CombatActionLogEntry;
  /** A bot's intention awaiting approval — kind `proposal` only (stage 20a). */
  proposal?: BotActionProposal;
  /** Eddies changing hands — kind `economy` only (stage 23b). */
  economy?: EconomyLogEntry;
  /** Handout put in a player's hands — kind `handout` only (stage 24a). */
  handout?: HandoutLogEntry;
  /** Journal entry opened to the table — kind `journal` only (stage 24b). */
  journal?: JournalLogEntry;
  /** GM's call for a roll — kind `check` only (stage 32). */
  check?: CheckCallEntry;
  /** Dzień odpoczynku albo podana dawka — kind `recovery` only. */
  recovery?: RecoveryLogEntry;
  /** Skok zegara świata — kind `time` only (etap 37). */
  time?: TimeLogEntry;
  /** ISO timestamp — always assigned by the server. */
  createdAt: string;
}

export const MAX_CHAT_MESSAGE_LENGTH = 2000;
export const CHAT_HISTORY_PAGE_SIZE = 50;

/** Aliases accepted for the whisper command (without the leading slash). */
export const WHISPER_ALIASES = ['w', 'whisper', 'szept'];

/** Aliases of the public roll command. */
export const ROLL_ALIASES = ['r', 'roll', 'rzut'];

/** Aliases of the GM roll command (result visible to the author and GMs only). */
export const GM_ROLL_ALIASES = ['gr', 'gmroll'];

/** Aliases of „speak as this NPC" — GM only, no model involved. */
export const AS_BOT_ALIASES = ['jako', 'as'];

/** One-line help shown next to "unknown command" errors. */
export const CHAT_COMMANDS_HELP =
  'Dostępne komendy: /w <imię> <treść> (szept), /r <formuła> [etykieta] (rzut), /gr <formuła> (rzut widoczny dla MG), /jako <bot> <treść> (MG mówi jako NPC)';

export type ParsedChatInput =
  | { kind: 'empty' }
  | { kind: 'say'; text: string }
  | { kind: 'whisper'; targetName: string; text: string }
  | { kind: 'invalid-whisper'; reason: 'MISSING_TARGET' | 'MISSING_TEXT' }
  | { kind: 'roll'; visibility: 'public' | 'gm'; formula: RollFormula; label?: string }
  | { kind: 'invalid-roll'; reason: 'MISSING_NOTATION' | RollParseError }
  /** GM speaks in a bot's name; `targetName` is the bot. */
  | { kind: 'as-bot'; targetName: string; text: string }
  | { kind: 'invalid-as-bot'; reason: 'MISSING_TARGET' | 'MISSING_TEXT' }
  | { kind: 'unknown-command'; command: string };

/**
 * Splits „<target> <text>" arguments (whisper, `/jako`) into name and text.
 *
 * Target resolution order:
 * 1. a name in quotes: `"Jan Kowalski" cześć`,
 * 2. the longest case-insensitive prefix matching one of `knownNames`
 *    (handles names with spaces without quoting),
 * 3. the first whitespace-separated token.
 *
 * A leading `@` is accepted and dropped, so `/w @Vex` works exactly like the
 * `@Vex` mention syntax used to call bots in ordinary messages.
 */
function splitTargetArgs(
  rawArgs: string,
  knownNames: string[],
): { targetName: string; text: string } | null {
  const args = rawArgs.startsWith('@') ? rawArgs.slice(1).trimStart() : rawArgs;
  if (args.length === 0) return null;
  const quoted = /^"([^"]+)"\s*(.*)$/s.exec(args) ?? /^'([^']+)'\s*(.*)$/s.exec(args);
  if (quoted) {
    return { targetName: quoted[1]!.trim(), text: quoted[2]!.trim() };
  }

  const argsLower = args.toLowerCase();
  let match: { name: string; length: number } | null = null;
  for (const name of knownNames) {
    const nameLower = name.toLowerCase();
    if (!argsLower.startsWith(nameLower)) continue;
    const rest = args.slice(name.length);
    if (rest.length > 0 && !/^\s/.test(rest)) continue; // name must end on a word boundary
    if (!match || name.length > match.length) {
      match = { name, length: name.length };
    }
  }
  if (match) {
    return { targetName: match.name, text: args.slice(match.length).trim() };
  }

  const firstToken = /^(\S+)\s*(.*)$/s.exec(args);
  if (!firstToken) return null;
  return { targetName: firstToken[1]!, text: firstToken[2]!.trim() };
}

/**
 * Splits roll-command arguments into notation and label. The whole argument
 * string is tried first (so `/r 1d10 + 5` works); otherwise the first token
 * is the notation and the rest becomes the label (`/r 1d10+5 atak z bliska`).
 */
function parseRollArgs(visibility: 'public' | 'gm', args: string): ParsedChatInput {
  if (args.length === 0) return { kind: 'invalid-roll', reason: 'MISSING_NOTATION' };

  const whole = parseRollNotation(args);
  if (whole.ok) return { kind: 'roll', visibility, formula: whole.formula };

  const split = /^(\S+)\s*(.*)$/s.exec(args);
  const first = parseRollNotation(split?.[1] ?? '');
  if (!first.ok) return { kind: 'invalid-roll', reason: first.error };

  const label = (split?.[2] ?? '').trim();
  return { kind: 'roll', visibility, formula: first.formula, ...(label ? { label } : {}) };
}

/**
 * Parses raw chat input into an intention. Extensible: new commands get their
 * own alias list and branch here.
 *
 * `knownNames` (campaign roster plus the GM's bots) improves parsing of names
 * with spaces; the caller (server) remains authoritative for target resolution
 * and for who may be addressed at all.
 */
export function parseChatInput(raw: string, knownNames: string[] = []): ParsedChatInput {
  const input = raw.trim();
  if (input.length === 0) return { kind: 'empty' };

  // "//tekst" escapes the command prefix and sends "/tekst" as a message.
  if (input.startsWith('//')) return { kind: 'say', text: input.slice(1) };
  if (!input.startsWith('/')) return { kind: 'say', text: input };

  const parsed = /^\/(\S*)\s*(.*)$/s.exec(input);
  const command = (parsed?.[1] ?? '').toLowerCase();
  const args = (parsed?.[2] ?? '').trim();

  if (ROLL_ALIASES.includes(command) || GM_ROLL_ALIASES.includes(command)) {
    const visibility = GM_ROLL_ALIASES.includes(command) ? 'gm' : 'public';
    return parseRollArgs(visibility, args);
  }

  if (WHISPER_ALIASES.includes(command)) {
    if (args.length === 0) return { kind: 'invalid-whisper', reason: 'MISSING_TARGET' };
    const split = splitTargetArgs(args, knownNames);
    if (!split) return { kind: 'invalid-whisper', reason: 'MISSING_TARGET' };
    if (split.text.length === 0) return { kind: 'invalid-whisper', reason: 'MISSING_TEXT' };
    return { kind: 'whisper', targetName: split.targetName, text: split.text };
  }

  if (AS_BOT_ALIASES.includes(command)) {
    if (args.length === 0) return { kind: 'invalid-as-bot', reason: 'MISSING_TARGET' };
    const split = splitTargetArgs(args, knownNames);
    if (!split) return { kind: 'invalid-as-bot', reason: 'MISSING_TARGET' };
    if (split.text.length === 0) return { kind: 'invalid-as-bot', reason: 'MISSING_TEXT' };
    return { kind: 'as-bot', targetName: split.targetName, text: split.text };
  }

  return { kind: 'unknown-command', command };
}

/**
 * Cztery grupy, na jakie dzieli się feed czatu przy filtrowaniu (01.09.2026).
 *
 * Podział jest po **tym, po co się na wiersz patrzy**, a nie po `kind`: stół
 * czyta rozmowę, sprawdza rzut, rozlicza walkę albo zagląda w papiery. Dlatego
 * szept siedzi w jednej grupie z mową (to nadal rozmowa), a odmowa akcji
 * z obrażeniami (to nadal walka), choć w każdej z tych par `kind` są dwa.
 */
export type ChatCategory = 'talk' | 'dice' | 'combat' | 'table';

/** Grupa, do której należy wiersz danego rodzaju. */
export function chatCategoryOf(kind: ChatKind): ChatCategory {
  switch (kind) {
    case 'say':
    case 'whisper':
      return 'talk';
    // `check` (etap 32) jest zapowiedzią rzutu i chowa się razem z rzutami:
    // grupa „Rzuty" gasi wtedy całą parę, a nie połowę z niej.
    case 'roll':
    case 'gmroll':
    case 'check':
      return 'dice';
    case 'damage':
    case 'action':
    case 'gmaction':
      return 'combat';
    case 'proposal':
    case 'economy':
    case 'handout':
    case 'journal':
      return 'table';
    // Odpoczynek i zastrzyk to nie walka, choć zmieniają PW: patrzy się na nie
    // przy rozliczaniu przerwy między scenami, razem z papierami i pieniędzmi.
    // Skok zegara jest cezurą tej samej przerwy — „minęła noc" czyta się
    // dokładnie wtedy, co „Vex odzyskał 7 PW".
    case 'recovery':
    case 'time':
      return 'table';
  }
}

/**
 * Wiersz czatu ściśnięty do jednej linii (tryb zwarty, 01.09.2026).
 *
 * `null` znaczy „ten wiersz zostaje w całości" — wypowiedzi się nie streszcza,
 * bo streszczenie rozmowy jest jej utratą. Ściska się wyłącznie mechanikę,
 * której karta ma sześć linii, a pamięta się z niej jedną liczbę.
 */
export interface ChatCompactLine {
  /** Kto — postać, cel ciosu albo tytuł karty. */
  actor: string;
  /** Jedno zdanie: co padło i z jakim skutkiem. */
  summary: string;
  /** Zabarwienie, gdy karta niesie werdykt — zwarty wiersz ma go nie gubić. */
  tone?: 'success' | 'failure' | 'warn';
}

/** „Trafienie", „Pudło" albo „Ogień zaporowy" — werdykt ataku jednym słowem. */
function attackVerdict(hit: boolean | undefined): { text: string; tone: 'success' | 'failure' } {
  if (hit === undefined) return { text: 'Ogień zaporowy', tone: 'success' };
  return hit ? { text: 'Trafienie', tone: 'success' } : { text: 'Pudło', tone: 'failure' };
}

function compactRoll(message: ChatMessageView): ChatCompactLine | null {
  const roll = message.roll;
  if (!roll) return null;
  const head = roll.title ?? roll.notation;
  const parts: string[] = [
    roll.title || !message.text
      ? `${head} · ${roll.total}`
      : `${head} · ${roll.total} — ${message.text}`,
  ];
  let tone: ChatCompactLine['tone'];
  if (roll.attack) {
    const verdict = attackVerdict(roll.attack.hit);
    parts.push(verdict.text, roll.attack.detail);
    tone = verdict.tone;
  } else if (roll.opposed) {
    // Remis jest własnym wynikiem tylko tam, gdzie zasady go znają (Konfrontacja,
    // etap 23c); wszędzie indziej `won` niesie całą odpowiedź.
    const opposed = roll.opposed;
    const verdict =
      opposed.outcome === 'tie'
        ? 'remis'
        : (opposed.outcome ? opposed.outcome === 'win' : opposed.won)
          ? 'wygrana'
          : 'przegrana';
    parts.push(verdict, opposed.detail);
    tone = verdict === 'remis' ? 'warn' : verdict === 'wygrana' ? 'success' : 'failure';
  }
  if (roll.outcome) {
    parts.push(
      roll.outcome.detail ? `${roll.outcome.label} · ${roll.outcome.detail}` : roll.outcome.label,
    );
    tone ??= roll.outcome.success ? 'success' : 'failure';
  }
  if (roll.critical?.type === 'crit') parts.push('Krytyk!');
  if (roll.critical?.type === 'fumble' && !roll.critical.ignored) parts.push('Fumble!');
  if (roll.criticalDamage) parts.push('Rana krytyczna!');
  return {
    actor: roll.actor ?? message.authorName,
    summary: parts.filter((part) => part.length > 0).join(' · '),
    ...(tone ? { tone } : {}),
  };
}

function compactDamage(entry: DamageLogEntry): ChatCompactLine {
  const stopped = entry.damageThrough === 0 && entry.bonusDamage === 0;
  const parts: string[] = [entry.locationLabel];
  if (stopped) {
    parts.push(`pancerz zatrzymał cios (${entry.damageRolled} obr.)`);
  } else {
    // PW bezwzględne dostaje tylko ten, komu serwer je przysłał — zwarty wiersz
    // niczego nie odsłania, bo czyta dokładnie to samo pole co pełna karta.
    parts.push(
      entry.hp ? `−${entry.hpLost} PW (${entry.hp.after}/${entry.hp.max})` : `−${entry.hpLost} PW`,
    );
  }
  if (entry.woundLabel) parts.push(entry.woundLabel);
  const injury = entry.injury ?? entry.injuryAimed ?? entry.injuryExtra;
  if (injury) parts.push(injury.name);
  if (entry.undone) parts.push('cofnięte');
  return {
    actor: entry.targetName,
    summary: parts.join(' · '),
    tone: entry.undone ? 'warn' : stopped ? 'success' : 'failure',
  };
}

function compactAction(entry: CombatActionLogEntry): ChatCompactLine {
  const parts: string[] = [entry.actionName];
  if (entry.note) parts.push(entry.note);
  if (entry.overspent) parts.push('poza budżetem tury');
  if (entry.refusal) parts.push(`odmowa: ${entry.refusal.message}`);
  if (entry.passed) parts.push('przepuszczone przez MG');
  return {
    actor: entry.actorName,
    summary: parts.join(' · '),
    ...(entry.refusal && !entry.passed ? { tone: 'failure' as const } : {}),
  };
}

function compactProposal(proposal: BotActionProposal): ChatCompactLine {
  const parts: string[] = [
    proposal.combat ? proposal.combat.summary : `Chce rzucić: ${proposal.optionLabel}`,
  ];
  if (proposal.resolution === 'approved') parts.push('zatwierdzone');
  if (proposal.resolution === 'rejected') parts.push('odrzucone');
  return {
    actor: proposal.botName,
    summary: parts.join(' · '),
    ...(proposal.resolution === 'rejected' ? { tone: 'failure' as const } : {}),
  };
}

function compactEconomy(entry: EconomyLogEntry): ChatCompactLine {
  const first = entry.summary ?? entry.lines[0] ?? '';
  const rest = entry.summary ? entry.lines.length : Math.max(entry.lines.length - 1, 0);
  return {
    actor: entry.title,
    summary: rest > 0 ? `${first} · +${rest} poz.` : first,
  };
}

/**
 * Wezwanie do Testu (etap 32). Otwarte wezwanie **nie daje się ścisnąć** — ma
 * przycisk „Rzuć", a zwarty wiersz przycisków nie ma; to ta sama zasada, którą
 * 01.09 dostała nierozstrzygnięta propozycja bota. Ściska się dopiero rozliczone
 * albo odwołane, czyli takie, z którego został sam zapis w dzienniku.
 */
function compactCheckCall(entry: CheckCallEntry): ChatCompactLine | null {
  if (entry.cancelled) {
    return { actor: entry.characterName, summary: `${entry.rollLabel} — wezwanie odwołane` };
  }
  if (!entry.resolved) return null;
  const target = checkCallTargetText(entry);
  return {
    actor: entry.characterName,
    summary: `${entry.rollLabel} · ${target} — ${
      entry.resolved.success ? 'Zdane' : 'Niezdane'
    } (${entry.resolved.total})`,
    tone: entry.resolved.success ? 'success' : 'failure',
  };
}

/**
 * Ściska wiersz do jednej linii albo mówi „zostaw go w spokoju" (`null`).
 *
 * Funkcja **niczego nie ukrywa i niczego nie dopowiada**: czyta wyłącznie pola,
 * które i tak są w wiadomości, więc na cudzym ekranie ściska dokładnie to, co
 * serwer temu ekranowi przysłał (redakcja jest po stronie serwera, etap 15).
 */
export function chatCompactLine(message: ChatMessageView): ChatCompactLine | null {
  switch (message.kind) {
    case 'say':
    case 'whisper':
      return null;
    case 'roll':
    case 'gmroll':
      return compactRoll(message);
    case 'damage':
      return message.damage ? compactDamage(message.damage) : null;
    case 'action':
    case 'gmaction':
      return message.action ? compactAction(message.action) : null;
    case 'proposal':
      return message.proposal ? compactProposal(message.proposal) : null;
    case 'economy':
      return message.economy ? compactEconomy(message.economy) : null;
    case 'handout':
      return message.handout
        ? {
            actor: message.handout.kind === 'screamsheet' ? 'Screamsheet' : 'Handout',
            summary: message.recipientName
              ? `${message.handout.title} — do ${message.recipientName}`
              : message.handout.title,
          }
        : null;
    case 'journal':
      return message.journal
        ? {
            actor: 'Wpis w dzienniku',
            summary: `${message.journal.title} · sesja z ${message.journal.sessionDate}`,
          }
        : null;
    case 'check':
      return message.check ? compactCheckCall(message.check) : null;
    case 'recovery':
      return message.recovery ? compactRecovery(message.recovery) : null;
    case 'time':
      return message.time ? compactTime(message.time) : null;
  }
}

/** „Zegar świata · Minęła noc — 15 marca 2045, 06:00 · rano". */
function compactTime(entry: TimeLogEntry): ChatCompactLine {
  return {
    actor: 'Zegar świata',
    summary: `${entry.title} — ${entry.to}`,
    ...(entry.backwards ? { tone: 'warn' as const } : {}),
  };
}

/** „Vex · Dzień odpoczynku — +7 PW" albo „Vex · Antybiotyk — tydzień". */
function compactRecovery(entry: RecoveryLogEntry): ChatCompactLine {
  return {
    actor: entry.actor,
    summary:
      entry.hp > 0
        ? `${entry.title} — +${entry.hp} PW`
        : `${entry.title} — ${entry.note ?? 'bez zmian'}`,
    ...(entry.tone ? { tone: entry.tone } : {}),
  };
}
