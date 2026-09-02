import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  type UIEvent,
} from 'react';
import type {
  BotActionProposal,
  BotActivityEntry,
  BotTraceBroadcast,
  ChatCategory,
  ChatMessageView,
  CombatActionLogEntry,
  EconomyLogEntry,
  HandoutLogEntry,
  JournalLogEntry,
  RollResult,
} from '@vtt/shared';
import { ROLE_GM, chatCategoryOf, chatCompactLine, isCheckCallOpen } from '@vtt/shared';
import {
  allowCombatAction,
  fetchHandouts,
  loadOlderHistory,
  resolveBotProposal,
  sendChatInput,
  stopBots,
} from '../socket.js';
import { AttackRow } from './AttackControls.js';
import { IconNewspaper } from './UiIcons.js';
import { OpposedRow } from './GrappleControls.js';
import { DamageApplyControls, DamageRow } from './DamageControls.js';
import { CheckCallRow } from './CheckCall.js';
import { useAuthStore } from '../stores/authStore.js';
import { useChatFilterStore } from '../stores/chatFilterStore.js';
import { useChatStore, type ChatItem } from '../stores/chatStore.js';
import { useHandoutStore } from '../stores/handoutStore.js';
import { useJournalStore } from '../stores/journalStore.js';
import { useTypewriterStore } from '../stores/typewriterStore.js';

const LOAD_MORE_THRESHOLD_PX = 48;
const STICK_TO_BOTTOM_PX = 64;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

/**
 * The dice breakdown: one chip per die (max/min highlighted) plus modifiers.
 *
 * A `plain` roll leaves the extremes unpainted (stage 27d): the creator's
 * stat and Lifepath throws are row numbers of a table, so a ten there means
 * „the tenth row", not a critical, and green would be a lie.
 */
function RollDice({ roll }: { roll: RollResult }) {
  const parts: ReactNode[] = [];
  roll.terms.forEach((term, i) => {
    if (i > 0 || term.sign === -1) {
      parts.push(
        <span key={`sign-${i}`} className="chat-roll-sign">
          {term.sign === -1 ? '−' : '+'}
        </span>,
      );
    }
    if (term.kind === 'dice') {
      term.rolls.forEach((value, j) => {
        const extreme = roll.plain
          ? ''
          : value === term.sides
            ? ' chat-die--max'
            : value === 1
              ? ' chat-die--min'
              : '';
        parts.push(
          <span key={`die-${i}-${j}`} className={`chat-die${extreme}`} title={`d${term.sides}`}>
            {value}
          </span>,
        );
      });
    } else {
      parts.push(
        <span key={`mod-${i}`} className="chat-roll-mod">
          {term.value}
        </span>,
      );
    }
  });
  if (roll.critical) {
    const { type, extraRoll } = roll.critical;
    parts.push(
      <span key="extra-sign" className="chat-roll-sign">
        {type === 'crit' ? '+' : '−'}
      </span>,
      <span
        key="extra-die"
        className={`chat-die chat-die--extra chat-die--${type}`}
        title="dorzut d10"
      >
        {extraRoll}
      </span>,
    );
  }
  return <div className="chat-roll-dice">{parts}</div>;
}

/** Named modifier sources of a sheet roll ("Percepcja +4, Poważnie ranny −2"). */
function RollBreakdown({ roll }: { roll: RollResult }) {
  if (!roll.breakdown || roll.breakdown.length === 0) return null;
  return (
    <div className="chat-roll-breakdown">
      {roll.breakdown.map((entry) => (
        <span
          key={`${entry.kind}-${entry.label}`}
          className={`chat-roll-source chat-roll-source--${entry.kind ?? 'other'}`}
        >
          {entry.label} {entry.value >= 0 ? '+' : '−'}
          {Math.abs(entry.value)}
        </span>
      ))}
    </div>
  );
}

/** A roll result card — visually distinct from plain chat messages. */
function RollRow({ message, isGm }: { message: ChatMessageView; isGm: boolean }) {
  const roll = message.roll;
  if (!roll) return null;
  const isGmRoll = message.kind === 'gmroll';
  // Sheet rolls speak for the character; chat commands for the user.
  const label = roll.actor ?? message.authorName;

  return (
    <div className={`chat-message chat-roll${isGmRoll ? ' chat-roll--gm' : ''}`}>
      <div className="chat-message-meta">
        <span className="chat-message-author">{label}</span>
        {roll.actor && <span className="chat-roll-actor-by">({message.authorName})</span>}
        {isGmRoll && <span className="chat-roll-gm-label">rzut do MG</span>}
        <span className="chat-message-time">{formatTime(message.createdAt)}</span>
      </div>
      <div className="chat-roll-body">
        <div className="chat-roll-header">
          <span className="chat-roll-notation">
            {roll.title ?? roll.notation}
            {roll.title && <span className="chat-roll-formula"> · {roll.notation}</span>}
            {message.text && !roll.title && (
              <span className="chat-roll-flavor"> — {message.text}</span>
            )}
          </span>
          <span className="chat-roll-total">{roll.total}</span>
        </div>
        <RollDice roll={roll} />
        <RollBreakdown roll={roll} />
        {(roll.critical || roll.criticalDamage) && (
          <div className="chat-roll-badges">
            {roll.critical?.type === 'crit' && (
              <span className="chat-roll-badge chat-roll-badge--crit">
                Krytyk! dorzut +{roll.critical.extraRoll}
              </span>
            )}
            {/* Wyjście z opresji (etap 30a, s. 146): jedynka padła i nic nie
                kosztowała. Milczące pominięcie kary czytałoby się jak błąd
                w kościach, więc kafel mówi, co ją zdjęło. */}
            {roll.critical?.type === 'fumble' && (
              <span
                className={
                  roll.critical.ignored
                    ? 'chat-roll-badge chat-roll-badge--fumble chat-roll-badge--shrugged'
                    : 'chat-roll-badge chat-roll-badge--fumble'
                }
                title={
                  roll.critical.ignored
                    ? 'Wyjście z opresji: ignorujesz Krytyczne porażki w Testach ataku. Wynik nadal liczy się jako 1.'
                    : undefined
                }
              >
                {roll.critical.ignored
                  ? 'Fumble zignorowany (Wyjście z opresji)'
                  : `Fumble! dorzut −${roll.critical.extraRoll}`}
              </span>
            )}
            {roll.criticalDamage && (
              <span className="chat-roll-badge chat-roll-badge--injury">Rana krytyczna!</span>
            )}
          </div>
        )}
        {roll.outcome && (
          <div className="chat-roll-badges">
            <span
              className={`chat-roll-badge chat-roll-badge--${roll.outcome.success ? 'success' : 'failure'}`}
            >
              {roll.outcome.label}
              {roll.outcome.detail ? ` · ${roll.outcome.detail}` : ''}
            </span>
          </div>
        )}
        {roll.attack && <AttackRow message={message} attack={roll.attack} />}
        {roll.opposed && <OpposedRow message={message} opposed={roll.opposed} />}
        {/* Damage is applied by the GM only — players never see the button. */}
        {isGm && roll.damage && <DamageApplyControls message={message} roll={roll} />}
      </div>
    </div>
  );
}

/**
 * A spent — or refused — combat action (stage 14b).
 *
 * A refusal is not a wall: it lands here with the reason and, for the GM, a
 * „Przepuść" button that grants one single-use pass. The player then clicks
 * their own button again, which is the table's „no, go ahead" turned into two
 * clicks instead of an argument.
 */
/**
 * Karta propozycji bota (etap 20a) — widzi ją MG i sterujący gracz, nigdy stół.
 *
 * Rzut, który po niej przyjdzie, jest zwyczajną kartą rzutu: gracze nie mają jak
 * poznać, że kośćmi rzucił model, dokładnie tak jak nie poznają wypowiedzi bota
 * od wypowiedzi MG przez `/jako` (decyzja etapu 11).
 */
function BotProposalRow({
  message,
  proposal,
  canResolve,
}: {
  message: ChatMessageView;
  proposal: BotActionProposal;
  canResolve: boolean;
}) {
  const answered = proposal.resolution !== undefined;
  return (
    <div
      className={`chat-message chat-proposal${
        proposal.resolution === 'rejected' ? ' chat-proposal--rejected' : ''
      }`}
    >
      <div className="chat-message-meta">
        <span className="chat-message-author">{proposal.botName}</span>
        <span className="chat-message-time">{formatTime(message.createdAt)}</span>
      </div>
      <div className="chat-action-body">
        <span className="chat-action-name">
          {/* Etap 20b: ta sama karta niesie akcję bojową, i wtedy „chce rzucić"
              byłoby nieprawdą — podejście do wroga nie jest rzutem. */}
          {proposal.combat ? proposal.combat.summary : `Chce rzucić: ${proposal.optionLabel}`}
        </span>
        {proposal.characterName && (
          <span className="chat-action-note">— karta {proposal.characterName}</span>
        )}
      </div>
      {proposal.reason && <p className="chat-proposal-reason">„{proposal.reason}"</p>}
      <p className="chat-proposal-request">W odpowiedzi na: {proposal.request}</p>
      {answered ? (
        <span className="chat-action-badge">
          {proposal.resolution === 'approved' ? 'Zatwierdzone' : 'Odrzucone'}
          {proposal.resolvedByName ? ` — ${proposal.resolvedByName}` : ''}
          {/* Zatwierdzona akcja, która i tak się nie odbyła — sytuacja zmieniła
              się między propozycją a kliknięciem. Bez tego MG widzi
              „ZATWIERDZONE" i nic więcej się nie dzieje. */}
          {proposal.blocked ? ` · ${proposal.blocked}` : ''}
        </span>
      ) : (
        canResolve && (
          <div className="chat-note-actions">
            <button
              type="button"
              className="small-button"
              onClick={() => void resolveBotProposal(message.id, true)}
            >
              Zatwierdź
            </button>
            <button
              type="button"
              className="small-button"
              onClick={() => void resolveBotProposal(message.id, false)}
            >
              Odrzuć
            </button>
          </div>
        )
      )}
    </div>
  );
}

/**
 * Eddies changing hands (stage 23b). Never public — the card reaches the GM,
 * the payer and the payee — so it needs no „who may see this" branch here: the
 * server decided that before it left.
 */
function EconomyRow({ message, entry }: { message: ChatMessageView; entry: EconomyLogEntry }) {
  return (
    <div className="chat-message chat-economy">
      <div className="chat-message-meta">
        <span className="chat-message-author">{entry.title}</span>
        <span className="chat-message-time">{formatTime(message.createdAt)}</span>
      </div>
      <ul className="chat-economy-lines">
        {entry.lines.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
      {entry.summary ? <p className="chat-economy-summary">{entry.summary}</p> : null}
    </div>
  );
}

/**
 * „Masz to w ręku" (etap 24a). Wiersz jest szeptem — jeden na odbiorcę — więc
 * u gracza pojawia się tylko wtedy, gdy handout naprawdę do niego trafił,
 * a u MG raz na każdego, komu go dał.
 *
 * Przycisk otwiera okno z pamięci klienta; gdy handoutu tam nie ma (MG czyta
 * archiwalny wiersz materiału, który już usunął), pozostaje sama linia.
 *
 * Warunek `!s.loaded` jest tu tak samo istotny jak sama obecność w pamięci:
 * listę handoutów przynosi dopiero wejście w zakładkę, więc na świeżo
 * przeładowanej stronie brak wpisu znaczy „jeszcze nie pytałem", a nie
 * „materiał wycofany" (błąd 24a, znaleziony przy 24b).
 */
function HandoutRow({ message, entry }: { message: ChatMessageView; entry: HandoutLogEntry }) {
  const loaded = useHandoutStore((s) => s.loaded);
  const known = useHandoutStore((s) => !s.loaded || entry.handoutId in s.handouts);
  const openHandout = useHandoutStore((s) => s.openHandout);

  /**
   * Na świeżo przeładowanej stronie klient nie zna jeszcze żadnego handoutu —
   * listę przynosi dopiero wejście w zakładkę. Bez tego pobrania „Otwórz"
   * wpychało na stos okno, dla którego nie było treści, więc klik nie robił
   * nic (błąd 24a, widziany po stronie gracza przy 24c).
   */
  async function open() {
    if (!loaded) await fetchHandouts();
    openHandout(entry.handoutId);
  }
  return (
    <div className="chat-message chat-handout">
      <div className="chat-message-meta">
        <span className="chat-message-author">
          {entry.kind === 'screamsheet' ? (
            <>
              <IconNewspaper /> Screamsheet od {message.authorName}
            </>
          ) : (
            `${entry.hasImage ? '🖼️' : '📄'} Handout od ${message.authorName}`
          )}
        </span>
        {message.recipientName ? (
          <span className="chat-message-whisper-target">do {message.recipientName}</span>
        ) : null}
        <span className="chat-message-time">{formatTime(message.createdAt)}</span>
      </div>
      <div className="chat-handout-body">
        <span className="chat-handout-title">{entry.title}</span>
        {known ? (
          <button type="button" className="small-button" onClick={() => void open()}>
            Otwórz
          </button>
        ) : (
          <span className="chat-handout-gone">materiał wycofany</span>
        )}
      </div>
    </div>
  );
}

/**
 * „Nowy wpis w dzienniku" (etap 24b). Inaczej niż handout — nic nie wyskakuje
 * samo (rozstrzygnięcie MG): kronikę czyta się przed grą, nie w środku sceny,
 * więc wiersz jest zaproszeniem, a przycisk przenosi do zakładki „Dziennik".
 */
function JournalRow({ message, entry }: { message: ChatMessageView; entry: JournalLogEntry }) {
  const setFocus = useJournalStore((s) => s.setFocus);
  // Wpis może być skasowany albo zdjęty ze stołu, a wiersz na czacie zostaje —
  // wtedy nie ma dokąd prowadzić. Ta sama zasada, co przy handoucie z 24a:
  // sprawdzamy pamięć klienta (u MG `entries`, u gracza `shared`; wypełniona
  // jest zawsze dokładnie jedna z nich).
  // …ale dopiero gdy ta pamięć w ogóle istnieje: listę przynosi wejście
  // w zakładkę, więc przed pierwszym wczytaniem „nie znam" znaczy „nie pytałem".
  const known = useJournalStore(
    (s) => !s.loaded || entry.entryId in s.entries || entry.entryId in s.shared,
  );
  return (
    <div className="chat-message chat-handout">
      <div className="chat-message-meta">
        <span className="chat-message-author">📓 Wpis w dzienniku</span>
        <span className="chat-message-whisper-target">sesja z {entry.sessionDate}</span>
        <span className="chat-message-time">{formatTime(message.createdAt)}</span>
      </div>
      <div className="chat-handout-body">
        <span className="chat-handout-title">{entry.title}</span>
        {known ? (
          <button type="button" className="small-button" onClick={() => setFocus(entry.entryId)}>
            Otwórz
          </button>
        ) : (
          <span className="chat-handout-gone">wpis wycofany</span>
        )}
      </div>
    </div>
  );
}

function CombatActionRow({
  message,
  entry,
  isGm,
}: {
  message: ChatMessageView;
  entry: CombatActionLogEntry;
  isGm: boolean;
}) {
  const refused = entry.refusal !== undefined;
  return (
    <div
      className={`chat-message chat-action${refused ? ' chat-action--refused' : ''}${
        entry.overspent ? ' chat-action--overspent' : ''
      }`}
    >
      <div className="chat-message-meta">
        <span className="chat-message-author">{entry.actorName}</span>
        <span className="chat-message-time">{formatTime(message.createdAt)}</span>
      </div>
      <div className="chat-action-body">
        <span className="chat-action-name">{entry.actionName}</span>
        {entry.note && <span className="chat-action-note">— {entry.note}</span>}
        {entry.overspent && <span className="chat-action-badge">poza budżetem tury</span>}
        {entry.passed && !refused && (
          <span className="chat-action-badge">przepuszczone przez MG</span>
        )}
      </div>
      {entry.refusal && (
        <div className="chat-action-refusal">
          <span>Odmowa: {entry.refusal.message}</span>
          {entry.passed ? (
            <span className="chat-action-badge">przepuszczone — powtórz akcję</span>
          ) : (
            isGm && (
              <button
                type="button"
                className="small-button"
                title="Jednorazowe zezwolenie — gracz klika swoją akcję jeszcze raz"
                onClick={() => void allowCombatAction(entry.combatantId, message.id)}
              >
                Przepuść
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

/** Small portrait next to an NPC line (bot-spoken or typed by the GM). */
function Speaker({ message }: { message: ChatMessageView }) {
  if (!message.botId) return null;
  return message.portraitUrl ? (
    <img className="chat-portrait" src={message.portraitUrl} alt="" />
  ) : (
    <span className="chat-portrait chat-portrait--empty" aria-hidden>
      ☻
    </span>
  );
}

/**
 * GM-only badge under a bot line: how the answer was produced. Players never
 * receive this payload, so for them a bot line and a `/jako` line are the same.
 */
function BotTrace({ trace }: { trace: BotTraceBroadcast }) {
  const parts: string[] = ['bot'];
  if (trace.generationMs !== null) parts.push(`${(trace.generationMs / 1000).toFixed(1)} s`);
  if (trace.completionTokens !== null) parts.push(`${trace.completionTokens} tok`);
  parts.push(`kontekst: ${trace.historyTurns} wypowiedzi`);
  if (trace.promptTokens !== null) parts.push(`${trace.promptTokens} tok promptu`);
  if (trace.knowledgeMs !== undefined) parts.push(`wiedza ${trace.knowledgeMs} ms`);
  if (trace.retried) parts.push('powtórka');
  const knowledge = trace.knowledgeTitles ?? [];
  return (
    <div className="chat-bot-trace">
      <span className="chat-bot-trace-badge">{parts.join(' · ')}</span>
      {/* Same tytuły wpisów: „dlaczego bot to powiedział" da się sprawdzić w
          trakcie gry, bez otwierania edytora. Treść zostaje w zakładce „Wiedza". */}
      {knowledge.length > 0 && (
        <span className="chat-bot-trace-badge" title="Wpisy bazy wiedzy doklejone do promptu">
          📖 {knowledge.join(' · ')}
        </span>
      )}
      {trace.warning && <span className="chat-bot-trace-warning">⚠ {trace.warning}</span>}
    </div>
  );
}

function MessageRow({
  message,
  myUserId,
  trace,
}: {
  message: ChatMessageView;
  myUserId: string;
  trace?: BotTraceBroadcast;
}) {
  const isWhisper = message.kind === 'whisper';
  const whisperLabel =
    message.authorId === myUserId
      ? `szept do: ${message.recipientName ?? '?'}`
      : `szept od: ${message.authorName}`;
  // Wypowiedź NPC-a, która właśnie się dopisuje, pokazuje tylko to, co „padło".
  // Wszystko inne (historia, ludzie, linia po dopisaniu) renderuje się w całości.
  const revealedChars = useTypewriterStore((state) => state.revealed[message.id]);
  const typing = revealedChars !== undefined;
  const text = typing ? message.text.slice(0, revealedChars) : message.text;

  return (
    <div
      className={`chat-message${isWhisper ? ' chat-message--whisper' : ''}${
        message.botId ? ' chat-message--npc' : ''
      }`}
    >
      <div className="chat-message-meta">
        <Speaker message={message} />
        <span className="chat-message-author">{message.authorName}</span>
        {isWhisper && <span className="chat-whisper-label">{whisperLabel}</span>}
        <span className="chat-message-time">{formatTime(message.createdAt)}</span>
      </div>
      <div className="chat-message-text">
        {text}
        {typing && <span className="chat-typewriter-cursor" aria-hidden />}
      </div>
      {trace && <BotTrace trace={trace} />}
    </div>
  );
}

/**
 * Tura bota w locie: stół widzi „NPC pisze…" i miejsce w kolejce, nigdy
 * podglądu samej wypowiedzi — ta pojawia się dopiero jako zwyczajna wiadomość
 * (dopisująca się słowo po słowie), gdy przejdzie przez guardraile.
 */
function BotActivityRow({ entry, canStop }: { entry: BotActivityEntry; canStop: boolean }) {
  const queued = entry.state === 'queued';
  return (
    <div className="chat-message chat-message--npc chat-message--pending">
      <div className="chat-message-meta">
        {entry.portraitUrl ? (
          <img className="chat-portrait" src={entry.portraitUrl} alt="" />
        ) : (
          <span className="chat-portrait chat-portrait--empty" aria-hidden>
            ☻
          </span>
        )}
        <span className="chat-message-author">{entry.name}</span>
        <span className="chat-typing-label">
          {queued ? `w kolejce (${entry.position})` : 'pisze…'}
        </span>
        {entry.whisperToUserId && <span className="chat-whisper-label">szeptem</span>}
        {canStop && (
          <button
            type="button"
            className="small-button chat-stop"
            title="Przerwij wypowiedź bota"
            aria-label="Przerwij wypowiedź bota"
            onClick={() => stopBots(entry.turnId)}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

/** Notatka lokalna: podpowiedź, błąd albo pytanie z przyciskami (etap 16c). */
function NoteRow({ item }: { item: Extract<ChatItem, { type: 'note' }> }) {
  return (
    <p className="chat-note">
      {item.text}
      {/* Buttons on a note (stage 16c): the „cel za osłoną" card asks
          which of the two answers the rules allow the table wants, and
          neither has cost anything yet. Pressing one is what turns the
          choice into a roll — and into a line of the log. */}
      {item.actions && (
        <span className="chat-note-actions">
          {item.actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className="small-button"
              {...(action.title ? { title: action.title } : {})}
              onClick={() => action.run()}
            >
              {action.label}
            </button>
          ))}
        </span>
      )}
    </p>
  );
}

/**
 * Zaznaczanie tekstu kończy się kliknięciem, więc bez tego sprawdzenia każde
 * skopiowanie linijki rozwijałoby wiersz pod palcami.
 */
function clickWithoutSelection(event: MouseEvent, run: () => void): void {
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed && selection.toString().length > 0) return;
  event.preventDefault();
  run();
}

/**
 * Wypowiedź w trybie zwartym (01.09.2026).
 *
 * Tekst zostaje **w całości** — rozmowy się nie streszcza, bo streszczenie
 * rozmowy jest jej utratą. Zwija się wyłącznie meta: imię i godzina wchodzą
 * w tę samą linię, więc „Wchodzę." zajmuje jeden wiersz zamiast dwóch.
 */
function CompactTalkRow({
  message,
  myUserId,
  onExpand,
}: {
  message: ChatMessageView;
  myUserId: string;
  onExpand: () => void;
}) {
  const isWhisper = message.kind === 'whisper';
  const whisperLabel =
    message.authorId === myUserId
      ? `→ ${message.recipientName ?? '?'}`
      : `szept od ${message.authorName}`;
  const revealedChars = useTypewriterStore((state) => state.revealed[message.id]);
  const typing = revealedChars !== undefined;
  const text = typing ? message.text.slice(0, revealedChars) : message.text;

  return (
    <button
      type="button"
      className={`chat-message chat-compact-row chat-compact-row--talk${
        isWhisper ? ' chat-message--whisper' : ''
      }${message.botId ? ' chat-message--npc' : ''}`}
      title="Kliknij, aby rozwinąć wiersz"
      onClick={(event) => clickWithoutSelection(event, onExpand)}
    >
      <span className="chat-message-time">{formatTime(message.createdAt)}</span>
      <Speaker message={message} />
      <span className="chat-message-author">{message.authorName}</span>
      {isWhisper && <span className="chat-whisper-label">{whisperLabel}</span>}
      <span className="chat-compact-text">
        {text}
        {typing && <span className="chat-typewriter-cursor" aria-hidden />}
      </span>
    </button>
  );
}

/**
 * Karta mechaniczna ściśnięta do jednej linii. Treść bierze się z
 * `chatCompactLine` — funkcji czystej, wspólnej i pokrytej testami — więc
 * zwarty wiersz nigdy nie powie czegoś, czego nie ma w pełnej karcie.
 */
function CompactCardRow({
  message,
  line,
  onExpand,
}: {
  message: ChatMessageView;
  line: NonNullable<ReturnType<typeof chatCompactLine>>;
  onExpand: () => void;
}) {
  return (
    <button
      type="button"
      className={`chat-message chat-compact-row chat-compact-row--${chatCategoryOf(message.kind)}`}
      title="Kliknij, aby rozwinąć pełną kartę"
      onClick={(event) => clickWithoutSelection(event, onExpand)}
    >
      <span className="chat-message-time">{formatTime(message.createdAt)}</span>
      <span className="chat-message-author">{line.actor}</span>
      <span
        className={`chat-compact-summary${line.tone ? ` chat-compact-summary--${line.tone}` : ''}`}
      >
        {line.summary}
      </span>
    </button>
  );
}

/** Pełna karta wiadomości — ten sam wybór rodzaju, co przed filtrami. */
function FullMessageRow({
  message,
  isGm,
  myUserId,
  trace,
  canResolveProposal,
}: {
  message: ChatMessageView;
  isGm: boolean;
  myUserId: string;
  trace?: BotTraceBroadcast;
  canResolveProposal: boolean;
}) {
  if (message.kind === 'roll' || message.kind === 'gmroll') {
    return <RollRow message={message} isGm={isGm} />;
  }
  if (message.kind === 'damage' && message.damage) {
    return <DamageRow message={message} entry={message.damage} isGm={isGm} />;
  }
  if (message.kind === 'proposal' && message.proposal) {
    return (
      <BotProposalRow
        message={message}
        proposal={message.proposal}
        canResolve={canResolveProposal}
      />
    );
  }
  if (message.kind === 'economy' && message.economy) {
    return <EconomyRow message={message} entry={message.economy} />;
  }
  if (message.kind === 'handout' && message.handout) {
    return <HandoutRow message={message} entry={message.handout} />;
  }
  if (message.kind === 'journal' && message.journal) {
    return <JournalRow message={message} entry={message.journal} />;
  }
  if (message.kind === 'check' && message.check) {
    return <CheckCallRow message={message} entry={message.check} />;
  }
  if ((message.kind === 'action' || message.kind === 'gmaction') && message.action) {
    return <CombatActionRow message={message} entry={message.action} isGm={isGm} />;
  }
  return <MessageRow message={message} myUserId={myUserId} {...(trace ? { trace } : {})} />;
}

/**
 * Jeden wiersz feedu: zwarty albo pełny.
 *
 * Rozwinięcie jest **per wiersz i tymczasowe** (żyje w stanie panelu, nie
 * w `localStorage`): tryb zwarty jest nastawieniem na całą sesję, a rozwinięcie
 * — jednym zajrzeniem w kartę, po której wraca się do przeglądania.
 */
function FeedRow({
  item,
  isGm,
  myUserId,
  trace,
  compact,
  expanded,
  onToggleExpand,
  canResolveProposal,
}: {
  item: ChatItem;
  isGm: boolean;
  myUserId: string;
  trace?: BotTraceBroadcast;
  compact: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  canResolveProposal: boolean;
}) {
  if (item.type === 'note') return <NoteRow item={item} />;
  const { message } = item;
  const full = (
    <FullMessageRow
      message={message}
      isGm={isGm}
      myUserId={myUserId}
      canResolveProposal={canResolveProposal}
      {...(trace ? { trace } : {})}
    />
  );
  if (!compact) return full;
  if (expanded) {
    // Rozwinięta karta ma własne przyciski, więc nie da się jej zwinąć
    // kliknięciem w tło — od tego jest strzałka w rogu.
    return (
      <div className="chat-expanded">
        <button
          type="button"
          className="chat-collapse"
          title="Zwiń wiersz z powrotem do jednej linii"
          aria-label="Zwiń wiersz"
          onClick={onToggleExpand}
        >
          ▴
        </button>
        {full}
      </div>
    );
  }
  const line = chatCompactLine(message);
  if (!line) {
    return <CompactTalkRow message={message} myUserId={myUserId} onExpand={onToggleExpand} />;
  }
  return <CompactCardRow message={message} line={line} onExpand={onToggleExpand} />;
}

const CATEGORY_BUTTONS: { id: ChatCategory; icon: string; label: string; title: string }[] = [
  { id: 'talk', icon: '💬', label: 'Rozmowy', title: 'Wypowiedzi i szepty — także NPC-ów' },
  { id: 'dice', icon: '🎲', label: 'Rzuty', title: 'Karty rzutów: testy, ataki, obrażenia' },
  { id: 'combat', icon: '⚔', label: 'Walka', title: 'Rozliczone obrażenia i akcje tury' },
  {
    id: 'table',
    icon: '📋',
    label: 'Stół',
    title: 'Eurodolce, handouty, dziennik, propozycje botów i notatki systemowe',
  },
];

/** „1 ukryty wiersz" · „3 ukryte wiersze" · „7 ukrytych wierszy". */
function hiddenLabel(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  if (count === 1) return '1 ukryty wiersz';
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return `${count} ukryte wiersze`;
  return `${count} ukrytych wierszy`;
}

/**
 * Wiersze, których filtr nie rusza: te, które czekają na czyjąś decyzję.
 *
 * Propozycja bota bez odpowiedzi i notatka z przyciskami nie są logiem — są
 * pytaniem, a pytanie schowane pod separatorem po prostu zawiśnie, i to
 * w środku cudzej tury.
 */
function isPending(item: ChatItem, myUserId: string, isGm: boolean): boolean {
  if (item.type === 'note') return (item.actions?.length ?? 0) > 0;
  const { proposal, check, kind } = item.message;
  // Wezwanie do Testu (etap 32) jest tym samym, czym propozycja bota: decyzją
  // czekającą na kliknięcie, a nie wpisem w dzienniku. Schowane pod
  // separatorem albo ściśnięte do jednej linii zawisłoby w środku cudzej tury.
  if (kind === 'check') return check !== undefined && isCheckCallOpen(check);
  if (kind !== 'proposal' || !proposal || proposal.resolution !== undefined) return false;
  return isGm || proposal.controllerUserId === myUserId;
}

function itemKey(item: ChatItem): string {
  return item.type === 'message' ? `m${item.message.id}` : item.id;
}

/**
 * Feed po filtrach: widoczne wiersze pojedynczo, ukryte — zbite w klikalne
 * separatory. Ukryty wiersz **nie znika**: czat jest logiem sesji, więc filtr
 * ma go zwinąć, a nie skasować z ekranu.
 */
type FeedEntry =
  | { kind: 'item'; key: string; item: ChatItem }
  | { kind: 'hidden'; key: string; items: ChatItem[]; open: boolean };

export function ChatPanel() {
  const user = useAuthStore((s) => s.user);
  const synced = useChatStore((s) => s.synced);
  const campaign = useChatStore((s) => s.campaign);
  const items = useChatStore((s) => s.items);
  const hasMoreHistory = useChatStore((s) => s.hasMoreHistory);
  const loadingHistory = useChatStore((s) => s.loadingHistory);
  const botActivity = useChatStore((s) => s.botActivity);
  const botTraces = useChatStore((s) => s.botTraces);
  const isGm = user?.role === ROLE_GM;
  const myUserId = user?.id ?? '';

  const categories = useChatFilterStore((s) => s.categories);
  const compact = useChatFilterStore((s) => s.compact);
  const toggleCategory = useChatFilterStore((s) => s.toggleCategory);
  const soloCategory = useChatFilterStore((s) => s.soloCategory);
  const showAll = useChatFilterStore((s) => s.showAll);
  const toggleCompact = useChatFilterStore((s) => s.toggleCompact);
  /** Rozwinięte grupy ukrytych wierszy — klucz bierze się z pierwszego w grupie. */
  const [openRuns, setOpenRuns] = useState<ReadonlySet<string>>(() => new Set());
  /** Karty rozwinięte mimo trybu zwartego, po id wiadomości. */
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<number>>(() => new Set());

  // Draft lives in the store so the dice cup can read and execute commands.
  const draft = useChatStore((s) => s.draft);
  const setDraft = useChatStore((s) => s.setDraft);
  const feedRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  /** scrollHeight captured when older-history loading starts (to keep position). */
  const prependHeightRef = useRef<number | null>(null);

  const feed = useMemo<FeedEntry[]>(() => {
    const out: FeedEntry[] = [];
    let run: ChatItem[] = [];
    const flush = () => {
      if (run.length === 0) return;
      const key = `hidden-${itemKey(run[0]!)}`;
      out.push({ kind: 'hidden', key, items: run, open: openRuns.has(key) });
      run = [];
    };
    for (const item of items) {
      const category = item.type === 'note' ? 'table' : chatCategoryOf(item.message.kind);
      if (categories[category] || isPending(item, myUserId, isGm)) {
        flush();
        out.push({ kind: 'item', key: itemKey(item), item });
      } else {
        run.push(item);
      }
    }
    flush();
    return out;
  }, [items, categories, openRuns, myUserId, isGm]);

  const hiddenCount = useMemo(
    () =>
      feed.reduce((sum, entry) => (entry.kind === 'hidden' ? sum + entry.items.length : sum), 0),
    [feed],
  );

  useLayoutEffect(() => {
    const feedEl = feedRef.current;
    if (!feedEl) return;
    if (prependHeightRef.current !== null && !loadingHistory) {
      feedEl.scrollTop += feedEl.scrollHeight - prependHeightRef.current;
      prependHeightRef.current = null;
    } else if (stickToBottomRef.current) {
      feedEl.scrollTop = feedEl.scrollHeight;
    }
    // Streamed bot text grows the feed too — follow it like a new message.
    // Zmiana filtrów albo gęstości przestawia całą wysokość feedu, więc feed
    // trzyma się dna dokładnie tak samo jak przy nowej wiadomości.
  }, [feed, compact, expandedIds, loadingHistory, botActivity]);

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const feedEl = event.currentTarget;
    stickToBottomRef.current =
      feedEl.scrollHeight - feedEl.scrollTop - feedEl.clientHeight < STICK_TO_BOTTOM_PX;
    if (feedEl.scrollTop < LOAD_MORE_THRESHOLD_PX && hasMoreHistory && !loadingHistory) {
      prependHeightRef.current = feedEl.scrollHeight;
      loadOlderHistory();
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (draft.trim().length === 0) return;
    sendChatInput(draft);
    setDraft('');
    stickToBottomRef.current = true;
  };

  function toggleRun(key: string) {
    setOpenRuns((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  function toggleExpanded(id: number) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function renderItem(item: ChatItem, key: string) {
    const trace = item.type === 'message' ? botTraces[item.message.id] : undefined;
    return (
      <FeedRow
        key={key}
        item={item}
        isGm={isGm}
        myUserId={myUserId}
        compact={compact}
        expanded={item.type === 'message' && expandedIds.has(item.message.id)}
        onToggleExpand={() => {
          if (item.type === 'message') toggleExpanded(item.message.id);
        }}
        canResolveProposal={
          item.type === 'message' && (isGm || item.message.proposal?.controllerUserId === myUserId)
        }
        {...(trace ? { trace } : {})}
      />
    );
  }

  if (!user) return null;

  return (
    <section className="chat-panel">
      <div className="chat-panel-head">
        <h2 className="panel-section-title">Czat</h2>
        <div className="chat-filter-bar" role="group" aria-label="Filtry czatu">
          {CATEGORY_BUTTONS.map((category) => (
            <button
              key={category.id}
              type="button"
              className={`chat-filter${categories[category.id] ? ' chat-filter--on' : ''}`}
              aria-pressed={categories[category.id]}
              title={`${category.title}. Alt+klik — pokaż tylko tę grupę.`}
              onClick={(event) =>
                event.altKey ? soloCategory(category.id) : toggleCategory(category.id)
              }
            >
              <span aria-hidden>{category.icon}</span> {category.label}
            </button>
          ))}
          <button
            type="button"
            className={`chat-filter${compact ? ' chat-filter--on' : ''}`}
            aria-pressed={compact}
            title="Tryb zwarty: karty mechaniki kurczą się do jednej linii (wypowiedzi zostają w całości). Klik w wiersz rozwija go z powrotem."
            onClick={toggleCompact}
          >
            <span aria-hidden>≡</span> Zwarty
          </button>
          {hiddenCount > 0 && (
            <button
              type="button"
              className="chat-filter chat-filter--reset"
              title="Włącz z powrotem wszystkie grupy"
              onClick={showAll}
            >
              Pokaż wszystko
            </button>
          )}
        </div>
      </div>
      <div
        className={`chat-feed${compact ? ' chat-feed--compact' : ''}`}
        ref={feedRef}
        onScroll={onScroll}
      >
        {!synced && <p className="placeholder-text">Synchronizacja…</p>}
        {synced && !campaign && (
          <p className="placeholder-text">Brak aktywnej kampanii — czat jest niedostępny.</p>
        )}
        {loadingHistory && <p className="chat-note">Wczytywanie historii…</p>}
        {feed.map((entry) =>
          entry.kind === 'item' ? (
            renderItem(entry.item, entry.key)
          ) : (
            <div key={entry.key} className="chat-hidden-run">
              <button
                type="button"
                className="chat-hidden-toggle"
                aria-expanded={entry.open}
                title={
                  entry.open
                    ? 'Zwiń z powrotem wiersze spoza filtra'
                    : 'Pokaż wiersze ukryte filtrem — bez zmiany samego filtra'
                }
                onClick={() => toggleRun(entry.key)}
              >
                {entry.open
                  ? `⋯ ${entry.items.length} spoza filtra — zwiń ⋯`
                  : `⋯ ${hiddenLabel(entry.items.length)} ⋯`}
              </button>
              {entry.open && entry.items.map((item) => renderItem(item, itemKey(item)))}
            </div>
          ),
        )}
        {categories.talk &&
          botActivity.map((entry) => (
            <BotActivityRow key={entry.turnId} entry={entry} canStop={isGm} />
          ))}
      </div>
      {isGm && botActivity.length > 1 && (
        <div className="chat-queue-row">
          <span className="chat-note">Boty w kolejce: {botActivity.length - 1}</span>
          <button type="button" className="small-button" onClick={() => stopBots()}>
            Przerwij wszystkie
          </button>
        </div>
      )}
      <form className="chat-input-row" onSubmit={onSubmit}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          // Rolling is deliberately absent from the hint: dice are thrown by
          // grabbing and shaking the cup, and advertising `/r` here nudged
          // people to type what they should be throwing. The command still
          // works for anyone who wants it.
          placeholder={
            campaign
              ? isGm
                ? 'Wiadomość… (/w — szept, /jako <NPC> — mów jako NPC)'
                : 'Wiadomość… (/w <imię> — szept)'
              : 'Czat niedostępny'
          }
          disabled={!synced || !campaign}
          aria-label="Wiadomość czatu"
        />
        <button
          className="primary-button"
          type="submit"
          disabled={!synced || !campaign || draft.trim().length === 0}
        >
          Wyślij
        </button>
      </form>
    </section>
  );
}
