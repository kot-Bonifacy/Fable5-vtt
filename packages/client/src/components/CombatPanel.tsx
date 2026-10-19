import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type {
  CombatantView,
  CpredStatEffect,
  StatusDefinition,
  TokenView,
  TurnBudgetView,
} from '@vtt/shared';
import {
  CPRED_BACKUP_TIERS,
  CPRED_MANAGED_WOUND_STATUS_IDS,
  ROLE_GM,
  conditionRegistry,
  cpredStatusSeverity,
  describeCpredStatEffect,
  describeCpredStatEffectTimer,
  formatMetres,
  tokenCondition,
  tokenHpShare,
} from '@vtt/shared';
import {
  addToCombat,
  combatErrorText,
  endCombat,
  releaseCombatHold,
  removeFromCombat,
  resetCombatTurn,
  resolveBackup,
  startCombat,
} from '../socket.js';
import { usePortraitFrameStyle } from '../portrait-banner.js';
import {
  DISPOSITION_HINTS,
  DISPOSITION_RANK,
  TOKEN_DISPOSITION_LABELS,
  dispositionOf,
} from '../disposition.js';
import { BotTurnButton } from './BotTurnButton.js';
import { CombatActions } from './CombatActions.js';
import { HudIcon, StatusIcon } from './HudIcon.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useCombatStore } from '../stores/combatStore.js';
import { useGameTimeStore } from '../stores/gameTimeStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { noteAck } from '../notices.js';
import { EmptyState } from './EmptyState.js';

/** Tokens likely to fight: the players' characters come pre-ticked. */
function defaultSelection(tokens: TokenView[]): string[] {
  return tokens.filter((token) => token.ownerId !== null).map((token) => token.id);
}

/** The picker the GM starts a fight from (no combat running yet). */
function CombatSetup({ tokens }: { tokens: TokenView[] }) {
  const sceneId = useSceneStore((s) => s.effectiveScene?.id ?? null);
  const selection = useCombatStore((s) => s.selection);
  const toggleSelection = useCombatStore((s) => s.toggleSelection);
  const setSelection = useCombatStore((s) => s.setSelection);
  const [starting, setStarting] = useState(false);
  const initialized = useRef(false);

  // Pre-tick the player tokens once, then leave the GM's choices alone.
  useEffect(() => {
    if (initialized.current || tokens.length === 0) return;
    initialized.current = true;
    setSelection(defaultSelection(tokens));
  }, [tokens, setSelection]);

  async function begin() {
    if (!sceneId || selection.length === 0) return;
    setStarting(true);
    const ack = await startCombat(sceneId, selection);
    setStarting(false);
    noteAck('action', ack, () => 'Nie udało się założyć starcia.');
  }

  return (
    <div className="combat-panel">
      <p className="combat-hint">
        Zaznacz uczestników i załóż starcie — walkę zaczyna „⚔ Rozpocznij walkę” na pasie
        inicjatywy. Posiłki dodasz w trakcie — z tej listy albo przez „⚔ Do starcia” w menu figury.
      </p>
      {tokens.length === 0 ? (
        <EmptyState
          text={
            'Na scenie nie ma jeszcze żadnych figur — postaw je z zakładki „Postacie” albo „Grafiki”, zanim zaczniesz walkę.'
          }
        />
      ) : (
        <ul className="combat-picker">
          {byDisposition(tokens).map((token) => (
            <li key={token.id}>
              <label className="combat-picker-row">
                <input
                  type="checkbox"
                  checked={selection.includes(token.id)}
                  onChange={() => toggleSelection(token.id)}
                />
                <span className="combat-picker-name">{token.name}</span>
                <DispositionTag token={token} />
                {token.hidden && <span className="combat-tag">ukryty</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="scene-editor-row">
        <button
          className="primary-button"
          type="button"
          onClick={() => void begin()}
          disabled={starting || selection.length === 0}
        >
          {starting ? 'Zakładanie…' : `Załóż starcie (${selection.length})`}
        </button>
        <button
          type="button"
          className="small-button"
          onClick={() => setSelection(defaultSelection(tokens))}
        >
          Tylko postacie graczy
        </button>
      </div>
    </div>
  );
}

/** Znaczek postawy przy figurze na liście (etap 56) — widzi go tylko MG. */
function DispositionTag({ token }: { token: TokenView }) {
  const disposition = dispositionOf(token);
  return (
    <span
      className={`combat-tag disposition-tag disposition-tag--${disposition}`}
      title={DISPOSITION_HINTS[disposition]}
    >
      {TOKEN_DISPOSITION_LABELS[disposition]}
    </span>
  );
}

/** Wrogie na górze, potem neutralne i przyjazne; w grupie — kolejność sceny. */
function byDisposition(tokens: TokenView[]): TokenView[] {
  return [...tokens].sort(
    (a, b) => DISPOSITION_RANK[dispositionOf(a)] - DISPOSITION_RANK[dispositionOf(b)],
  );
}

/**
 * „Dołącz do walki” (etap 56, wzór: Combat Tracker z Foundry): figury sceny
 * spoza kolejki, wrogie na górze, z wyborem wielu naraz. NPC dołożony
 * w trwającej walce dostaje inicjatywę od serwera, gracz rzuca kubkiem.
 */
function JoinFightPicker({ outsiders }: { outsiders: TokenView[] }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => byDisposition(outsiders), [outsiders]);
  // Figura, która w międzyczasie weszła do walki albo zeszła ze sceny, wypada z wyboru.
  const chosen = picked.filter((id) => outsiders.some((token) => token.id === id));

  async function add(ids: string[]) {
    if (ids.length === 0) return;
    setBusy(true);
    const ack = await addToCombat(ids);
    setBusy(false);
    noteAck('action', ack, combatErrorText);
    if (ack.ok) setPicked([]);
  }

  return (
    <>
      <p className="panel-section-title">Dołącz do walki</p>
      <ul className="combat-picker">
        {rows.map((token) => (
          <li key={token.id} className="combat-picker-row">
            <label className="combat-picker-pick">
              <input
                type="checkbox"
                checked={chosen.includes(token.id)}
                onChange={() =>
                  setPicked((now) =>
                    now.includes(token.id)
                      ? now.filter((id) => id !== token.id)
                      : [...now, token.id],
                  )
                }
              />
              <span className="combat-picker-name">{token.name}</span>
            </label>
            <DispositionTag token={token} />
            {token.hidden && <span className="combat-tag">ukryty</span>}
            <button
              type="button"
              className="small-button"
              disabled={busy}
              onClick={() => void add([token.id])}
            >
              Dodaj
            </button>
          </li>
        ))}
      </ul>
      <div className="scene-editor-row">
        <button
          type="button"
          className="small-button"
          disabled={busy || chosen.length === 0}
          onClick={() => void add(chosen)}
        >
          {`Dodaj zaznaczone (${chosen.length})`}
        </button>
      </div>
    </>
  );
}

/** „Ruch 0/1 · Akcja 1/1 · Ataki 2/2" — the budget squeezed into a row. */
function budgetSummary(budget: TurnBudgetView): string {
  const parts = budget.resources.map(
    (resource) => `${resource.label} ${resource.used}/${resource.max}`,
  );
  if (budget.distance) {
    const used = formatMetres(budget.distance.used);
    const max = formatMetres(budget.distance.max);
    const metres = `${budget.distance.label} ${used}/${max}`;
    parts.push(budget.distance.hard ? `${metres} (utrudniony ×2)` : metres);
  }
  if (budget.overspent) parts.push(`poza budżetem ×${budget.overspent}`);
  if (budget.bypass) parts.push('przepustka MG');
  return parts.join(' · ');
}

/** Proporcje portretu w zakładce (wysokość przez szerokość) — pod `usePortraitFrameStyle`. */
const PORTRAIT_ASPECT = 1.2;

/** Ile naklejek mieści się na portrecie, zanim reszta zejdzie do „+N". */
const PORTRAIT_MARKS_MAX = 4;

/** Jedna ikona na portrecie: skąd obrazek, jak groźna i co mówi po najechaniu. */
interface PortraitMark {
  key: string;
  title: string;
  tone: 'info' | 'warn' | 'critical' | 'up' | 'down';
  /** Plik naklejki z rejestru (`StatusIcon`) albo sylwetka HUD-u (`HudIcon`). */
  status?: string;
  hud?: string;
  /** Znak zamiast ikony — strzałka efektu na Cesze. */
  glyph?: string;
}

/**
 * Portret uczestnika z ranami (etap 43a, zlecenie MG z 26.09).
 *
 * Odsetek utraconych PW barwi portret **od dołu**: 40 % ran to dolne 40 %
 * obrazu w czerwono-czarnym monochromie. Druga kopia obrazu leży na pierwszej,
 * przycięta `clip-path` do wysokości ran — szarość z filtra, czerwień z warstwy
 * `multiply`, więc biel staje się czerwienią, a czerń zostaje czernią. 0 PW
 * (Śmiertelnie ranny) to cały portret w czerwieni; czarno-biały jest dopiero
 * trup — naklejka ze stanem `dead`.
 */
function WoundPortrait({
  name,
  imageUrl,
  damage,
  dead,
  marks,
}: {
  name: string;
  imageUrl: string | null;
  /** Utracone PW, 0…1; `null` — figura bez PW (albo bez figury). */
  damage: number | null;
  dead: boolean;
  marks: readonly PortraitMark[];
}) {
  const crop = usePortraitFrameStyle(imageUrl, PORTRAIT_ASPECT);
  const picture = imageUrl ? (
    <img
      className={`combat-portrait-img${crop ? ' combat-portrait-img--cropped' : ''}`}
      src={imageUrl}
      alt=""
      draggable={false}
      {...(crop ? { style: crop } : {})}
    />
  ) : (
    <span className="combat-portrait-img combat-portrait-img--empty">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
  const wound = !dead && damage !== null && damage > 0 ? damage : 0;
  const shown = marks.slice(0, PORTRAIT_MARKS_MAX);
  const rest = marks.slice(PORTRAIT_MARKS_MAX);
  return (
    <span
      className={`combat-portrait${dead ? ' combat-portrait--dead' : ''}`}
      style={{ '--wound': wound } as CSSProperties}
    >
      {picture}
      {wound > 0 && (
        <>
          <span className="combat-portrait-wound" aria-hidden>
            {picture}
          </span>
          {wound < 1 && <span className="combat-portrait-waterline" aria-hidden />}
        </>
      )}
      {marks.length > 0 && (
        <ul className="combat-portrait-marks">
          {shown.map((mark) => (
            <li
              key={mark.key}
              className={`combat-mark combat-mark--${mark.tone}`}
              title={mark.title}
            >
              {mark.status ? (
                <StatusIcon src={mark.status} />
              ) : mark.hud ? (
                <HudIcon name={mark.hud} />
              ) : (
                <span className="combat-mark-glyph" aria-hidden>
                  {mark.glyph}
                </span>
              )}
              <span className="visually-hidden">{mark.title}</span>
            </li>
          ))}
          {rest.length > 0 && (
            <li
              className="combat-mark combat-mark--more"
              title={rest.map((mark) => mark.title).join('\n')}
            >
              +{rest.length}
            </li>
          )}
        </ul>
      )}
    </span>
  );
}

/**
 * Wszystko, co wisi na figurze, jako ikony na portret (decyzja MG z 26.09):
 * naklejki stanów, efekty na Cechach, chwyt, wstrzymana Akcja i to, co jej
 * następna tura jest winna ranom krytycznym. Stany ran pomija — o nich mówi
 * czerwień, a „Martwy" — czarno-biały portret.
 */
function portraitMarks(
  combatant: CombatantView,
  token: TokenView | undefined,
  registry: ReadonlyMap<string, StatusDefinition>,
  effects: readonly CpredStatEffect[],
  clock: { round: number | null; minutes: number },
): PortraitMark[] {
  const marks: PortraitMark[] = [];
  for (const id of token?.statuses ?? []) {
    const definition = registry.get(id);
    if (CPRED_MANAGED_WOUND_STATUS_IDS.includes(id) || definition?.condition === 'dead') continue;
    // Chwyt ma własną ikonę z nazwą drugiej strony (niżej) — naklejka byłaby dublem.
    if (id === 'grappled' && combatant.grapple) continue;
    marks.push({
      key: `status:${id}`,
      title: definition?.name ?? id,
      tone: cpredStatusSeverity(id),
      ...(definition ? { status: definition.icon } : { glyph: '?' }),
    });
  }
  for (const effect of effects) {
    marks.push({
      key: `effect:${effect.id}`,
      title: `${describeCpredStatEffect(effect)} — ${describeCpredStatEffectTimer(effect, clock)}`,
      tone: effect.value < 0 ? 'down' : 'up',
      glyph: effect.value < 0 ? '▼' : '▲',
    });
  }
  if (combatant.grapple) {
    const grapple = combatant.grapple;
    marks.push({
      key: 'grapple',
      title:
        (grapple.role === 'attacker'
          ? `Trzyma: ${grapple.otherName}`
          : `W Trzymaniu: ${grapple.otherName}`) +
        (grapple.shield ? ' · Ludzka tarcza' : '') +
        (grapple.chokeStreak ? ` · Duszenie ×${grapple.chokeStreak}` : ''),
      tone: 'warn',
      hud: 'grab',
    });
  }
  if (combatant.held) {
    marks.push({
      key: 'held',
      title: combatant.held.ready
        ? 'Akcja wstrzymana: wchodzi po tej turze'
        : combatant.held.initiative !== null
          ? `Akcja wstrzymana przy ${combatant.held.initiative}`
          : `Akcja wstrzymana: ${combatant.held.trigger ?? 'wyzwalacz opisany'}`,
      tone: 'info',
      hud: 'hourglass',
    });
  }
  for (const line of combatant.owes ?? []) {
    marks.push({ key: `owes:${line}`, title: line, tone: 'critical', hud: 'first-aid' });
  }
  return marks;
}

/** One card of the fight: portrait with its wounds, the name, the turn left. */
function CombatantCard({
  combatant,
  token,
  isActive,
  isDone,
  isGm,
  isMine,
  marks,
  dead,
}: {
  combatant: CombatantView;
  token: TokenView | undefined;
  isActive: boolean;
  isDone: boolean;
  isGm: boolean;
  /** The viewer plays this participant — they may say „Działam teraz”. */
  isMine: boolean;
  marks: PortraitMark[];
  dead: boolean;
}) {
  const share = token ? tokenHpShare(token) : null;
  const damage = share ? 1 - share.ratio : null;
  const hp = token?.hp ?? null;
  // Liczby tylko temu, kto je dostał (MG, właściciel); reszta stołu widzi
  // odsetek — to on decyduje o czerwieni, więc może też stać słowem.
  const hpLabel = hp
    ? `PW ${hp.current}/${hp.max}`
    : share
      ? `Rany ${Math.round((1 - share.ratio) * 100)}%`
      : null;
  return (
    <li
      className={`combat-card${isActive ? ' combat-card--active' : ''}${
        isDone ? ' combat-card--done' : ''
      }${combatant.hidden ? ' combat-card--hidden' : ''}`}
      aria-current={isActive ? 'true' : undefined}
    >
      <WoundPortrait
        name={combatant.name}
        imageUrl={combatant.imageUrl}
        damage={damage}
        dead={dead}
        marks={marks}
      />
      <span className="combat-card-body">
        <span className="combat-card-name">
          {/* Figura, której MG nie dał graczom żadnej nazwy: na mapie stoi bez
              podpisu, ale wiersz listy musi się dać wskazać palcem. */}
          {combatant.name.trim() === '' ? <em>Nieznana figura</em> : combatant.name}
        </span>
        <span className="combat-card-tags">
          {isActive && <span className="combat-card-now">Tura</span>}
          {dead && <span className="combat-tag">martwy</span>}
          {combatant.hidden && <span className="combat-tag">ukryty</span>}
          {combatant.tokenId === null && <span className="combat-tag">w Sieci</span>}
        </span>
        {hpLabel && <span className="combat-card-hp">{hpLabel}</span>}
        {combatant.turn && (
          <span className="combat-card-budget">{budgetSummary(combatant.turn)}</span>
        )}
        {/* „Działam teraz” (19.10): wstrzymanie to obniżona inicjatywa na tę
            Rundę — nikogo nie przerywa, wchodzi zaraz po bieżącej turze. */}
        {(isGm || isMine) && combatant.held && !combatant.held.ready && !isActive && (
          <button
            type="button"
            className="small-button combat-card-release"
            onClick={() =>
              void releaseCombatHold(combatant.id).then((ack) =>
                noteAck('action', ack, combatErrorText),
              )
            }
            title="Wstrzymana Akcja wejdzie do kolejki zaraz po bieżącej turze"
          >
            Działam teraz
          </button>
        )}
        {combatant.held?.ready && !isActive && (
          <span className="combat-tag">wchodzi po tej turze</span>
        )}
      </span>
      {isGm && (
        <span className="combat-card-tools">
          {/* Etap 20b: pokazuje się samo przy figurze prowadzonej przez bota. */}
          <BotTurnButton tokenId={combatant.tokenId} />
          {combatant.turn && (
            <button
              type="button"
              className="small-button"
              onClick={() => void resetCombatTurn(combatant.id)}
              title="Zwróć turę — pełny budżet Ruchu i Akcji"
              aria-label="Zwróć turę — pełny budżet Ruchu i Akcji"
            >
              ↺
            </button>
          )}
          <button
            type="button"
            className="small-button"
            onClick={() => void removeFromCombat(combatant.id)}
            title="Usuń z walki"
            aria-label="Usuń z walki"
          >
            ✕
          </button>
        </span>
      )}
    </li>
  );
}

/**
 * Zakładka „Walka" w trakcie walki (etap 43a): portrety z ranami zamiast
 * tabelki inicjatywy. Kolejka, liczby inicjatywy, rzuty, remisy i przestawianie
 * kolejności mieszkają na czarnym pasie nad mapą (`CombatBar`) — tu zostaje to,
 * czego pas nie pomieści: kto jak oberwał, co na kim wisi, ile zostało z tury,
 * posiłki w drodze i Akcje tego, kto gra.
 */
export function CombatPanel() {
  const combat = useCombatStore((s) => s.combat);
  const user = useAuthStore((s) => s.user);
  const isGm = user?.role === ROLE_GM;
  // Raw store slices only — a selector deriving a new array on every render
  // loops React (the trap from stages 10 and 13).
  const tokenMap = useTokenStore((s) => s.tokens);
  const statusRows = useTokenStore((s) => s.statuses);
  const characters = useCharacterStore((s) => s.characters);
  const minutes = useGameTimeStore((s) => s.minutes);

  // Pojemniki (46b) nie walczą — serwer i tak pomija je w `combat:start`/`add`.
  const tokens = useMemo(
    () => Object.values(tokenMap).filter((token) => token.container === undefined),
    [tokenMap],
  );
  const registry = useMemo(() => new Map(statusRows.map((row) => [row.id, row])), [statusRows]);
  const conditions = useMemo(() => conditionRegistry(statusRows), [statusRows]);
  const outsiders = useMemo(() => {
    if (!combat) return [];
    const inFight = new Set(combat.combatants.map((c) => c.tokenId));
    return tokens.filter((token) => !inFight.has(token.id));
  }, [combat, tokens]);

  if (!combat) {
    return isGm ? (
      <CombatSetup tokens={tokens} />
    ) : (
      <div className="combat-panel">
        <EmptyState text="Walka nie trwa — portrety uczestników pojawią się tutaj, gdy MG włączy tryb turowy." />
      </div>
    );
  }

  /** The participant this viewer may spend a turn for, if any (stage 14b). */
  const active = combat.combatants.find((c) => c.id === combat.activeCombatantId) ?? null;
  const actor = isGm
    ? active
    : (combat.combatants.find(
        (c) => user !== null && c.ownerId === user.id && c.id === active?.id,
      ) ?? null);
  // Ci przed grającym mieli już swoją turę w tej Rundzie — jak na pasie.
  const activeIndex = combat.combatants.findIndex((c) => c.id === combat.activeCombatantId);
  const clock = { round: combat.round, minutes };

  return (
    <div className="combat-panel">
      <ol className="combat-cards" aria-label="Uczestnicy walki">
        {combat.combatants.map((combatant, index) => {
          const token = combatant.tokenId ? tokenMap[combatant.tokenId] : undefined;
          const characterId = token?.characterId ?? null;
          const effects = characterId ? (characters[characterId]?.data.statEffects ?? []) : [];
          return (
            <Fragment key={combatant.id}>
              <CombatantCard
                combatant={combatant}
                token={token}
                isActive={combatant.id === combat.activeCombatantId}
                isDone={combat.round > 0 && activeIndex >= 0 && index < activeIndex}
                isGm={isGm}
                isMine={user !== null && combatant.ownerId === user.id}
                marks={portraitMarks(combatant, token, registry, effects, clock)}
                dead={token ? tokenCondition(token, conditions) === 'dead' : false}
              />
              {/* Akcje stoją pod kartą tego, kto je wydaje (uwaga MG z 26.09:
                  pod całą listą były za daleko od jego portretu). Należą do
                  MG (zawsze, za grającego) i do gracza w jego turze — także
                  tej, którą dała mu wstrzymana Akcja (od 19.10 poza turą
                  wstrzymana Akcja nie działa; jest „Działam teraz”). */}
              {actor?.id === combatant.id && (
                <li className="combat-card-turn">
                  <CombatActions combat={combat} combatant={actor} />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>

      {/* Etap 30c: kto jest w drodze, ale jeszcze nie stoi na mapie. Wiersz nie
          jest uczestnikiem — nie ma inicjatywy ani tury — więc siedzi pod
          kolejką, a nie w niej. Gracze widzą, że pomoc jedzie; pytanie o drugą
          grupę jest wycięte po ich stronie. */}
      {(combat.reinforcements ?? []).length > 0 && (
        <ul className="combat-reinforcements">
          {(combat.reinforcements ?? []).map((row) => (
            <li key={row.id} className="combat-reinforcement">
              <span className="combat-reinforcement-name">
                {row.label} ×{row.count}
              </span>
              <span className="combat-tag">
                {row.round > combat.round
                  ? `za ${row.round - combat.round} ${roundsWord(row.round - combat.round)}`
                  : 'lada moment'}
              </span>
              {isGm && row.question && (
                <span className="combat-reinforcement-ask">{row.question}</span>
              )}
              {isGm && (
                <span className="combat-reinforcement-buttons">
                  {row.question && (
                    <select
                      defaultValue=""
                      aria-label="Druga grupa Wsparcia"
                      onChange={(e) => {
                        if (e.target.value) void resolveBackup(row.id, 'second', e.target.value);
                      }}
                    >
                      <option value="">— wybierz drugą grupę —</option>
                      {CPRED_BACKUP_TIERS.map((tier) => (
                        <option key={tier.id} value={tier.id}>
                          {tier.name} ×{tier.count}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    className="small-button"
                    onClick={() => void resolveBackup(row.id, 'place')}
                    title="Przybywają teraz, nie czekając na swoją rundę"
                  >
                    Postaw
                  </button>
                  <button
                    type="button"
                    className="small-button small-button--danger"
                    onClick={() => void resolveBackup(row.id, 'cancel')}
                    title="Nikt jednak nie przyjedzie"
                  >
                    Odwołaj
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {isGm && outsiders.length > 0 && <JoinFightPicker outsiders={outsiders} />}

      {isGm && (
        <div className="scene-editor-row">
          <button
            type="button"
            className="small-button small-button--danger"
            onClick={() => {
              if (window.confirm('Zakończyć walkę? Kolejka inicjatywy zostanie skasowana.')) {
                void endCombat();
              }
            }}
          >
            Zakończ walkę
          </button>
        </div>
      )}
    </div>
  );
}

/** „za 1 Rundę" / „za 3 Rundy" / „za 5 Rund" — polski liczy na trzy sposoby. */
function roundsWord(count: number): string {
  if (count === 1) return 'Rundę';
  const tens = count % 100;
  const ones = count % 10;
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return 'Rundy';
  return 'Rund';
}
