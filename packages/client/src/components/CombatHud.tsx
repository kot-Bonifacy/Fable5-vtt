import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type {
  CpredStatEffect,
  CpredAttackMode,
  CpredHotbarSingleGroup,
  CpredHotbarSlot,
  CpredHotbarWeaponGroup,
  CpredHotbarWeaponSlot,
  CpredSlotCost,
  NetDeviceMoveSlot,
  NetDeviceVerbSlot,
  NetOperatedState,
  TokenContainerView,
} from '@vtt/shared';
import {
  describeCpredStatEffect,
  describeCpredStatEffectTimer,
  describeCpredStatEffectValue,
  CONTAINER_LOCK_LABELS,
  CPRED_ATTACK_MODE_LABELS,
  CPRED_ACTION_JUMP,
  CPRED_ACTION_RUN,
  CPRED_ACTION_SNEAK,
  CPRED_BURST_AMMO_COST,
  CPRED_WOUND_LABELS,
  JUMP_COST_M,
  ROLE_GM,
  cpredStatusSeverity,
  cpredWeaponModeSlot,
  dvForRange,
  formatMetres,
  tokenHpShareOf,
  woundStateFromHp,
} from '@vtt/shared';
import { hpRingTone } from '../map/token-ring.js';
import {
  activateGroup,
  activateSlot,
  currentHudContext,
  hudSignature,
  takeFigure,
  type HudContext,
  type HudVitals,
} from '../hud.js';
import { IconEye } from './MapIcons.js';
import { useAuthStore } from '../stores/authStore.js';
import { useChaseStore } from '../stores/chaseStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useCombatStore } from '../stores/combatStore.js';
import { gmSteerLocked } from '../combat-steer.js';
import { useCompendiumStore } from '../stores/compendiumStore.js';
import { activeWeaponOf, fireModeKey, useHudStore } from '../stores/hudStore.js';
import { useRollStore } from '../stores/rollStore.js';
import { useSelectionStore } from '../stores/selectionStore.js';
import { useTargetStore } from '../stores/targetStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { useGameTimeStore } from '../stores/gameTimeStore.js';
import { useNetRunStore } from '../stores/netRunStore.js';
import { activateDeviceVerb, useDeviceAimStore } from '../net-operated.js';
import { notifyInfo, notifyRefusal } from '../notices.js';
import { usePortraitFrameStyle } from '../portrait-banner.js';
import { CombatAwarenessPanel } from './CombatAwarenessPanel.js';
import { BackupPanel } from './BackupPanel.js';
import { FigureInjuries } from './FigureInjuries.js';
import { FigureSkills } from './FigureSkills.js';
import {
  GrapplePanel,
  HoldActionForm,
  StabilizeNearbyPicker,
  StabilizePicker,
} from './CombatForms.js';
import { HudIcon, StatusIcon } from './HudIcon.js';
import { HudTipLayer, useHudTip, type HudTipContent } from './HudTip.js';
import { TurnBudget } from './TurnBudget.js';
import { HudEndTurn, HudEndTurnCompact } from './HudEndTurn.js';
import { HudVehicle, useCockpitVehicle } from './HudVehicle.js';

/**
 * The combat HUD (stage 16f) — a rail down the left edge of the table.
 *
 * It answers the two questions a turn is made of without opening anything:
 * **who am I** (portrait, HP, armour, statuses, what is left of the turn) and
 * **what can I do** (weapons with their fire modes, a reload, the handful of
 * catalogue actions worth a key). Everything it offers already existed behind a
 * panel; that stage only stopped the fight from being played through panels.
 *
 * Stage 27h gave it a face. Until then it was nine identical boxes with words
 * in them — a weapon, a reload and an Action were the same rectangle, the
 * magazine was a fraction to be read, and nothing on screen moved when the
 * figure lost hit points. Now the shape of a slot says what kind of thing it is
 * (`CpredSlotIcon` from `shared`), the magazine is a gauge, and damage arrives
 * as a number that flies off the bar.
 *
 * Not a second rulebook. The slots come from `hotbarSlotsFor` in `shared` with
 * their refusals attached, the budget arrives from the server already computed,
 * and pressing a slot ends in an event that stage 14b, 14d or 16b already
 * defined. The three forms that need words or a target are the *same*
 * components the „Walka" tab renders.
 */

/** Statuses as chips: the registry's glyph plus the name it prints. */
function StatusChips({ statuses }: { statuses: readonly string[] }) {
  const registry = useTokenStore((s) => s.statuses);
  const byId = useMemo(() => new Map(registry.map((row) => [row.id, row])), [registry]);
  if (statuses.length === 0) return null;
  return (
    <ul className="hud-statuses">
      {statuses.map((id) => {
        const definition = byId.get(id);
        // The registry's `icon` is a *file* („/public/cpred/status-icons/…"),
        // not a glyph — the map draws it as a sprite, the panel as a mask that
        // takes the chip's colour (`StatusIcon`). A status whose registry entry
        // has not arrived yet still gets its id rather than vanishing.
        return (
          <li key={id} className={`hud-status hud-status--${cpredStatusSeverity(id)}`}>
            {definition && <StatusIcon src={definition.icon} />}
            <span>{definition?.name ?? id}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Efekty czasowe na Cechach jako chipy (etap 39).
 *
 * Stoją tuż pod naklejkami, bo odpowiadają na to samo pytanie („co jest z tą
 * figurą teraz"), a nad budżetem tury, bo tłumaczą liczby, które ten budżet
 * pokazuje: figura pod Skorpionem przejdzie krótszy dystans i ma prawo
 * powiedzieć dlaczego, zanim gracz zdąży pomyśleć, że mapa się zepsuła.
 *
 * Zdejmowanie jest **wyłącznie na karcie**, nie tutaj: guzik ⌫ w pasku byłby
 * czwartym miejscem, w którym MG kasuje coś jednym kliknięciem obok slotów
 * broni, a pasek jest tym panelem, w którym pomyłkowe kliknięcie jest najtańsze.
 */
function StatEffectChips({ effects }: { effects: readonly CpredStatEffect[] }) {
  const minutes = useGameTimeStore((s) => s.minutes);
  if (effects.length === 0) return null;
  return (
    <ul className="hud-stat-effects">
      {effects.map((effect) => (
        <li
          key={effect.id}
          className={`hud-stat-effect${
            effect.value < 0 ? ' hud-stat-effect--down' : ' hud-stat-effect--up'
          }`}
          title={`${describeCpredStatEffect(effect)} — ${describeCpredStatEffectTimer(effect, {
            round: null,
            minutes,
          })}`}
        >
          <span className="hud-stat-effect-value">{describeCpredStatEffectValue(effect)}</span>
          <span className="hud-stat-effect-source">{effect.source}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * „28 / 35" plus the bar, coloured by the wound state the rules name.
 *
 * Two things were added in 27h, and both exist to make a hit *visible*. The
 * notch is the Seriously Wounded threshold — half the maximum, rounded up
 * (`seriousWoundThreshold`), computed here from the maximum alone because that
 * is all a token carries; crossing it is the moment every check turns −2.
 * The number that flies off is the change itself: at the table the bar moving
 * by four pixels is not something anybody notices in the middle of a turn.
 *
 * Od etapu 69 belka jest pociągnięciem pędzla pod imieniem, a liczba stoi za
 * nią — na papierze, bez czarnego obrysu, którego wymagało wypełnienie.
 */
function HealthBar({ hp }: { hp: { current: number; max: number } }) {
  const state = woundStateFromHp(hp.current, hp.max);
  // Colour from the map ring's thresholds (17.10), the label from the rung.
  const tone = hpRingTone(tokenHpShareOf(hp));
  const ratio = hp.max > 0 ? Math.max(0, Math.min(1, hp.current / hp.max)) : 0;
  const threshold = hp.max > 0 ? Math.ceil(hp.max / 2) / hp.max : 0;
  const [delta, setDelta] = useState<{ value: number; id: number } | null>(null);
  const previous = useRef(hp.current);

  useEffect(() => {
    const change = hp.current - previous.current;
    previous.current = hp.current;
    if (change === 0) return;
    // Keyed by a counter rather than by the value: two hits for the same six
    // points in a row have to restart the animation, and an identical key
    // would leave the first number hanging where it was.
    const id = Date.now();
    setDelta({ value: change, id });
    const timer = window.setTimeout(() => {
      setDelta((current) => (current?.id === id ? null : current));
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [hp.current]);

  return (
    <div
      className={`hud-hp hud-hp--${tone}`}
      title={`Punkty Wytrzymałości: ${hp.current}/${hp.max} · ${CPRED_WOUND_LABELS[state]}`}
    >
      <span className="hud-hp-label">PW</span>
      <span className="hud-hp-track">
        <span className="hud-hp-fill" style={{ width: `${ratio * 100}%` }} />
        {/* The rung stage 15 judges on, drawn where it actually falls. */}
        <span className="hud-hp-notch" style={{ left: `${threshold * 100}%` }} />
      </span>
      <span className="hud-hp-value">
        {hp.current}
        <span className="hud-hp-max">/{hp.max}</span>
      </span>
      {delta && (
        <span
          key={delta.id}
          className={`hud-hp-delta${delta.value > 0 ? ' hud-hp-delta--heal' : ''}`}
          aria-live="polite"
        >
          {delta.value > 0 ? `+${delta.value}` : delta.value}
        </span>
      )}
    </div>
  );
}

/** Rounds left, as something to glance at rather than to read. */
const MAGAZINE_PIP_LIMIT = 12;

function Magazine({ ammo }: { ammo: { current: number; max: number } }) {
  const ratio = ammo.max > 0 ? Math.max(0, Math.min(1, ammo.current / ammo.max)) : 0;
  // „Empty" and „nearly empty" are the two states worth a colour: the first is
  // a refusal waiting to happen, the second is the reason to reload *now*.
  const level = ammo.current === 0 ? 'empty' : ratio <= 0.25 ? 'low' : 'ok';
  return (
    <span className={`hud-mag hud-mag--${level}`} title={`Magazynek: ${ammo.current}/${ammo.max}`}>
      {/* A pistol's twelve rounds are countable; a rifle's thirty are not, and
          thirty dots two pixels apart would be a texture rather than a number. */}
      {ammo.max <= MAGAZINE_PIP_LIMIT ? (
        <span className="hud-mag-pips" aria-hidden>
          {Array.from({ length: ammo.max }, (_, index) => (
            <span
              key={index}
              className={`hud-mag-pip${index < ammo.current ? ' hud-mag-pip--live' : ''}`}
            />
          ))}
        </span>
      ) : (
        <span className="hud-mag-bar" aria-hidden>
          <span className="hud-mag-bar-fill" style={{ width: `${ratio * 100}%` }} />
        </span>
      )}
      <span className="hud-mag-count">
        {ammo.current}
        <span className="hud-mag-max">/{ammo.max}</span>
      </span>
    </span>
  );
}

/**
 * Akcje, po które sięga się co turę (etap 69, decyzja MG z 10.11): dostają
 * średni kafel z nazwą. Reszta katalogu to małe przyciski z samą ikoną —
 * nazwa i koszt wychodzą po najechaniu. Podział jest sprawą wyglądu, więc
 * mieszka tu, nie w `shared`.
 */
const MEDIUM_ACTION_IDS: ReadonlySet<string> = new Set([
  CPRED_ACTION_RUN,
  CPRED_ACTION_JUMP,
  CPRED_ACTION_SNEAK,
]);

function isMediumAction(slot: CpredHotbarSlot): boolean {
  return slot.kind === 'action' && MEDIUM_ACTION_IDS.has(slot.actionId);
}

/** Czym się płaci, słowami — to samo, co znaczek na przycisku mówi kształtem. */
function costText(slot: CpredHotbarSlot): string {
  if (slot.cost === 'net') return 'Akcja Sieciowa';
  if (slot.cost === 'action') return 'Akcja';
  if (slot.cost === 'free') return 'za darmo';
  return slot.kind === 'action' && slot.moveCostM !== null
    ? `${formatMetres(slot.moveCostM)} ruchu`
    : 'Akcja Ruchu';
}

/**
 * Znaczek kosztu: kropka to Akcja, skośna kreska to metry ruchu — te same
 * kształty, którymi budżet tury nad bronią pokazuje, co jeszcze zostało.
 */
function CostMark({ cost }: { cost: CpredSlotCost }) {
  if (cost === 'free') return null;
  return <span className={`hud-cost hud-cost--${cost}`} aria-hidden />;
}

function slotTip(slot: CpredHotbarSlot): HudTipContent {
  return {
    title: slot.label,
    cost: costText(slot),
    body: slot.hint,
    refusal: slot.disabled,
  };
}

/**
 * Ile ataków tej broni zostało w Akcji tury (etap 63a): ●● przy SS 2,
 * ● przy SS 1 i serii — zgaszona kropka to atak już wydany.
 */
function AttackPips({ attacks }: { attacks: { left: number; max: number } }) {
  const label =
    attacks.left === 0
      ? 'Ta broń nie ma już ataku w tej turze'
      : `Ataki w tej turze: ${attacks.left} z ${attacks.max}`;
  return (
    <span className="hud-attacks" title={label} aria-label={label}>
      {Array.from({ length: attacks.max }, (_, index) => (
        <span
          key={index}
          className={`hud-attacks-pip${index >= attacks.left ? ' hud-attacks-pip--spent' : ''}`}
        />
      ))}
    </span>
  );
}

/**
 * Przycisk z samą ikoną: rzadka akcja w rządku pod średnimi kaflami albo
 * przeładowanie i usuwanie usterki na kaflu swojej broni (`tool`).
 *
 * Nazwa zostaje w drzewie dla czytników i testów (`.hud-slot-label`); na
 * ekranie mówi ją dymek, razem z kosztem i opisem. Linijka z nazwą pod
 * rządkiem ikon i cyfry klawiszy zniknęły 11.11.2026 (MG: nadmiarowe).
 */
function IconSlot({
  slot,
  armed,
  tool,
  onActivate,
}: {
  slot: CpredHotbarSlot;
  armed: boolean;
  tool?: boolean;
  onActivate: () => void;
}) {
  const tip = useHudTip(slotTip(slot));
  return (
    <button
      type="button"
      className={`hud-slot hud-slot--icon hud-slot--${slot.kind}${tool ? ' hud-slot--tool' : ''}${
        armed ? ' hud-slot--armed' : ''
      }${slot.disabled ? ' hud-slot--refused' : ''}`}
      onClick={onActivate}
      {...tip}
    >
      <HudIcon name={slot.icon} className="hud-slot-icon" />
      <span className="visually-hidden">
        <span className="hud-slot-label">{slot.label}</span> — {costText(slot)}
      </span>
      <CostMark cost={slot.cost} />
    </button>
  );
}

/** Średni kafel: ikona, nazwa i koszt słowami — akcje brane co turę. */
function MediumSlot({
  slot,
  armed,
  onActivate,
}: {
  slot: CpredHotbarSlot;
  armed: boolean;
  onActivate: () => void;
}) {
  const tip = useHudTip(slotTip(slot));
  return (
    <button
      type="button"
      className={`hud-slot hud-slot--medium hud-slot--${slot.kind}${armed ? ' hud-slot--armed' : ''}${
        slot.disabled ? ' hud-slot--refused' : ''
      }`}
      onClick={onActivate}
      {...tip}
    >
      <HudIcon name={slot.icon} className="hud-slot-icon" />
      <span className="hud-slot-body">
        <span className="hud-slot-label">{slot.label}</span>
        <span className="hud-slot-cost">
          <CostMark cost={slot.cost} />
          {/* Na kaflu krótko („8 m”) — pełne „8 m ruchu” mówi dymek. */}
          <span>
            {slot.kind === 'action' && slot.moveCostM !== null
              ? formatMetres(slot.moveCostM)
              : costText(slot)}
          </span>
        </span>
      </span>
    </button>
  );
}

/** Co stan aktywacji przejętego urządzenia znaczy dla gracza — jedno zdanie. */
const DEVICE_STATE_TEXT: Record<NetOperatedState, string> = {
  ready: 'pierwsza czynność: Akcja Sieciowa',
  active: 'aktywne w tej Turze',
  spent: 'czynność wykonana',
  'node-used': 'węzeł użyty w tej Turze',
  free: 'poza walką bez kosztu',
};

const DEVICE_VERB_GLYPHS: Partial<Record<string, string>> = { turn: '⟳', off: '⏻' };

/**
 * Czynność przejętego urządzenia poza strzałem (etap 70b): „Obróć” kamery
 * i „Wyłącz”. Średni kafel jak Bieg i Skok — bierze się je co turę.
 */
function DeviceVerbTile({
  slot,
  armed,
  onActivate,
}: {
  slot: NetDeviceVerbSlot;
  armed: boolean;
  onActivate: () => void;
}) {
  const cost =
    slot.cost === 'net' ? 'Akcja Sieciowa' : slot.cost === 'action' ? 'czynność' : 'za darmo';
  const tip = useHudTip({ title: slot.label, cost, body: slot.hint, refusal: slot.disabled });
  return (
    <button
      type="button"
      className={`hud-slot hud-slot--medium hud-slot--action${armed ? ' hud-slot--armed' : ''}${
        slot.disabled ? ' hud-slot--refused' : ''
      }`}
      data-device-verb={slot.verb}
      onClick={onActivate}
      {...tip}
    >
      <span className="hud-slot-icon hud-device-glyph" aria-hidden>
        {DEVICE_VERB_GLYPHS[slot.verb] ?? '⚙'}
      </span>
      <span className="hud-slot-body">
        <span className="hud-slot-label">{slot.label}</span>
        <span className="hud-slot-cost">
          <CostMark cost={slot.cost} />
          <span>{cost}</span>
        </span>
      </span>
    </button>
  );
}

/**
 * Kafel „Ruch” przejętego drona (etap 70c): ile metrów zostało z aktywacji
 * i czym się za nie płaci. Jeździ się klikiem w podłoże — kafel bierze figurę
 * w rękę i mówi zdaniem, dokąd kliknąć (albo czemu nie).
 */
function DeviceMoveTile({ slot, onActivate }: { slot: NetDeviceMoveSlot; onActivate: () => void }) {
  const cost =
    slot.cost === 'net' ? 'Akcja Sieciowa' : slot.cost === 'action' ? 'z aktywacji' : 'za darmo';
  const metres = slot.metres === null ? 'bez limitu' : formatMetres(slot.metres);
  const tip = useHudTip({
    title: slot.label,
    cost: slot.metres === null ? cost : `${metres} · ${cost}`,
    body: slot.hint,
    refusal: slot.disabled,
  });
  return (
    <button
      type="button"
      className={`hud-slot hud-slot--medium hud-slot--action${slot.disabled ? ' hud-slot--refused' : ''}`}
      data-device-move
      onClick={onActivate}
      {...tip}
    >
      <HudIcon name="move" className="hud-slot-icon" />
      <span className="hud-slot-body">
        <span className="hud-slot-label">{slot.label}</span>
        <span className="hud-slot-cost">
          <CostMark cost={slot.cost === 'net' ? 'net' : 'move'} />
          <span data-device-metres>{metres}</span>
        </span>
      </span>
    </button>
  );
}

/**
 * Strzałka szuflady trybów ognia — osobny przycisk, bo przycisk w przycisku
 * to nie HTML. Zwykły `title`: co robi, mówi w trzech słowach.
 */
function DrawerToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`hud-slot-drawer${open ? ' hud-slot-drawer--open' : ''}`}
      title="Tryb ognia"
      aria-label="Tryb ognia"
      aria-expanded={open}
      onClick={onToggle}
    >
      ▾
    </button>
  );
}

/**
 * Duży kafel broni w trybie, w którym stoi (etap 69).
 *
 * Bez ramki: broń rozpoznaje się po sylwetce, a tę w ręku — po czerwonej
 * plamie pod nią. Na kaflu stoją liczby, po które dotąd otwierało się kartę
 * (obrażenia, SS), a w prawym dolnym rogu to, co robi się **z tą bronią**:
 * przeładowanie, usunięcie usterki i szuflada trybów. Odmowa gasi sam kafel,
 * nie narzędzia — pusty magazynek ma zostawić „Przeładuj” zapalone.
 */
function WeaponTile({
  slot,
  armed,
  modeCount,
  drawerOpen,
  tools,
  onActivate,
  onToggleDrawer,
  onTool,
}: {
  slot: CpredHotbarWeaponSlot;
  armed: boolean;
  modeCount: number;
  drawerOpen: boolean;
  tools: readonly CpredHotbarSingleGroup[];
  onActivate: () => void;
  onToggleDrawer: () => void;
  onTool: (group: CpredHotbarSingleGroup) => void;
}) {
  const tip = useHudTip(slotTip(slot));
  const hasDrawer = modeCount > 1;
  // Miejsce, które narzędzia zajmują w prawym dolnym rogu — linie statystyk
  // i magazynka zawijają się przed nim zamiast pod nie wjeżdżać.
  const toolsStyle = {
    '--hud-tools': `${tools.length * 2.6 + (hasDrawer ? 1.6 : 0)}rem`,
  } as CSSProperties;
  return (
    <div
      className={`hud-slot-row hud-slot--weapon${armed ? ' hud-slot--armed' : ''}`}
      style={toolsStyle}
    >
      <button
        type="button"
        className={`hud-slot hud-slot--large${slot.disabled ? ' hud-slot--refused' : ''}`}
        onClick={onActivate}
        {...tip}
      >
        <span className="hud-slot-art">
          <HudIcon name={slot.icon} className="hud-slot-icon" />
        </span>
        <span className="hud-slot-body">
          <span className="hud-slot-line">
            <span className="hud-slot-label">{slot.label}</span>
            {/* What is loaded (stage 16g): „Strzelba · Śrut" is a different
                attack from „Strzelba · Zapalająca", and the slot has to say
                which. */}
            {slot.ammoLabel && <span className="hud-chip hud-chip--ammo">{slot.ammoLabel}</span>}
          </span>
          <span className="hud-slot-line hud-slot-line--stats">
            {slot.damage && (
              <span className="hud-slot-stat" title="Obrażenia jednego trafienia">
                <strong className="hud-slot-damage">{slot.damage}</strong> obr.
              </span>
            )}
            {slot.mode === 'single' && (
              <span className="hud-slot-stat" title="Szybkostrzelność: ataki w jednej Akcji">
                SS {slot.rof}
              </span>
            )}
            {/* Only a weapon with a choice says which choice is live: on a
                pistol „pojedynczy" is not information, it is noise. */}
            {hasDrawer && <span className="hud-slot-mode">{slot.modeLabel ?? 'pojedynczy'}</span>}
            {slot.attacks && <AttackPips attacks={slot.attacks} />}
          </span>
          {(slot.ammo || slot.stock !== null) && (
            <span className="hud-slot-line hud-slot-line--mag">
              {slot.ammo && <Magazine ammo={slot.ammo} />}
              {/* Etap 46c: zapas w ekwipunku — null u karty „bez dna”. */}
              {slot.stock !== null && (
                <span
                  className={`hud-stock${slot.stock === 0 ? ' hud-stock--empty' : ''}`}
                  title={`Zapas w ekwipunku: ${slot.stock}`}
                >
                  zapas {slot.stock}
                </span>
              )}
            </span>
          )}
        </span>
      </button>
      {(tools.length > 0 || hasDrawer) && (
        <span className="hud-slot-tools">
          {tools.map((group) => (
            <IconSlot
              key={group.id}
              slot={group.slot}
              armed={false}
              tool
              onActivate={() => onTool(group)}
            />
          ))}
          {hasDrawer && <DrawerToggle open={drawerOpen} onToggle={onToggleDrawer} />}
        </span>
      )}
    </div>
  );
}

/**
 * Co kafel broni w ręku mówi o strzale, zanim padnie (etap 69): figura ma
 * trwały cel — jego nazwa, dystans i PT z tabeli zasięgu; inaczej, gdzie
 * kliknąć. PT nie liczy osłon ani Celowania — te dokłada okno przy celu.
 */
function aimText(slot: CpredHotbarWeaponSlot, target: HudContext['target']): string {
  if (!target) return slot.pointTarget ? 'kliknij pole na mapie' : 'kliknij cel na mapie';
  const parts = [target.name, formatMetres(target.metres)];
  if (slot.rangeDv) {
    const dv = dvForRange(slot.rangeDv, target.metres);
    parts.push(dv === null ? 'poza zasięgiem' : `PT ${dv}`);
  }
  return parts.join(' · ');
}

/**
 * The fire modes of one weapon, opened under its tile (the shape Argon's HUD
 * uses for variants of one item).
 *
 * Full names here, not the chips from the tile: this is the place where the
 * choice is *made*, and „Ogień zaporowy" is what the rulebook calls it. The
 * price in rounds is spelled out for the same reason — ten of them is the whole
 * reason a burst is a decision rather than a default.
 */
function ModeDrawer({
  group,
  current,
  onPick,
}: {
  group: CpredHotbarWeaponGroup;
  current: CpredAttackMode;
  onPick: (slot: CpredHotbarWeaponSlot) => void;
}) {
  return (
    <ul className="hud-modes">
      {group.modes.map((slot) => (
        <li key={slot.id}>
          <button
            type="button"
            className={`hud-mode${slot.mode === current ? ' hud-mode--current' : ''}${
              slot.disabled ? ' hud-mode--refused' : ''
            }`}
            title={slot.disabled ?? slot.hint}
            aria-current={slot.mode === current}
            onClick={() => onPick(slot)}
          >
            <span className="hud-mode-name">{CPRED_ATTACK_MODE_LABELS[slot.mode]}</span>
            {slot.mode !== 'single' && (
              <span className="hud-mode-cost">{CPRED_BURST_AMMO_COST} naboi</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Akcje z katalogu w dwóch rozmiarach (etap 69): średnie kafle po dwa
 * w rzędzie, pod nimi rządek ikon — ich nazwę, koszt i opis mówi dymek.
 */
function ActionSlots({
  medium,
  small,
  isArmed,
  onActivate,
}: {
  medium: readonly CpredHotbarSingleGroup[];
  small: readonly CpredHotbarSingleGroup[];
  isArmed: (slot: CpredHotbarSlot) => boolean;
  onActivate: (group: CpredHotbarSingleGroup) => void;
}) {
  return (
    <>
      {medium.length > 0 && (
        <div className="hud-slots hud-slots--medium">
          {medium.map((group) => (
            <MediumSlot
              key={group.id}
              slot={group.slot}
              armed={isArmed(group.slot)}
              onActivate={() => onActivate(group)}
            />
          ))}
        </div>
      )}
      {small.length > 0 && (
        <div className="hud-slots hud-slots--small">
          {small.map((group) => (
            <IconSlot
              key={group.id}
              slot={group.slot}
              armed={isArmed(group.slot)}
              onActivate={() => onActivate(group)}
            />
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Kadr portretu w banerze (zlecenie MG, 25.09): własny kadr banera, jeśli
 * właściciel go ustawił, inaczej kadr żetonu przeniesiony na baner, a portret
 * bez żadnego kadru — od góry grafiki (`portraitBannerFor`). Portret spoza puli
 * zostaje przy `object-position` z CSS.
 */
function useBannerCrop(imageUrl: string | null): CSSProperties | null {
  return usePortraitFrameStyle(imageUrl);
}

/** Portrait, name, role and the three numbers a fight is fought with. */
function IdentityCard({
  name,
  imageUrl,
  hp,
  vitals,
  container,
}: {
  name: string;
  imageUrl: string | null;
  hp: { current: number; max: number } | null | undefined;
  vitals: HudVitals | null;
  /** Pojemnik (46b2) nie ma PW — pod nazwą stoi stan zamka. */
  container?: TokenContainerView | undefined;
}) {
  // Etap 69: portret bez ramki — dół obrazu rozpływa się w papier, a imię
  // stoi na tym przejściu. Podpis jest **obok** ramki, nie w niej: maska,
  // która gasi obraz, zgasiłaby też litery.
  const banner = useBannerCrop(imageUrl);
  // Imię jest największym napisem belki; długie schodzi o stopień, zamiast
  // kończyć się wielokropkiem po ośmiu literach.
  const length = name.trim().length;
  const nameSize =
    length > 16 ? ' hud-card-name--longer' : length > 8 ? ' hud-card-name--long' : '';
  return (
    <div className={`hud-card${imageUrl ? '' : ' hud-card--no-portrait'}`}>
      <span className="hud-portrait-frame">
        {imageUrl ? (
          <img
            className={`hud-portrait${banner ? ' hud-portrait--cropped' : ''}`}
            src={imageUrl}
            alt=""
            {...(banner ? { style: banner } : {})}
          />
        ) : (
          <span className="hud-portrait hud-portrait--empty">
            {name.trim().charAt(0).toUpperCase() || '?'}
          </span>
        )}
      </span>
      <span className="hud-portrait-caption">
        <span className="hud-card-title">
          <span className={`hud-card-name${nameSize}`} title={name}>
            {name}
          </span>
          {vitals?.roleName && <span className="hud-card-role">{vitals.roleName}</span>}
        </span>
        {/* HP is redacted by the server (stage 05): a token whose points this
            viewer may not see arrives without them, so „no bar" is the honest
            rendering rather than a hidden one. */}
        {hp ? (
          <HealthBar hp={hp} />
        ) : (
          <span className="hud-hp-none">
            {container ? CONTAINER_LOCK_LABELS[container.lock] : 'PW ukryte'}
          </span>
        )}
      </span>
      {vitals && <Vitals vitals={vitals} />}
    </div>
  );
}

/**
 * SP · RUCH · EMP — the numbers that decide a fight and never used to show.
 * Od etapu 69 liczba ze słowem zamiast ikony w ramce: trzy sylwetki obok
 * siebie trzeba było znać, a „4 RUCH” się czyta.
 */
function Vitals({ vitals }: { vitals: HudVitals }) {
  const armor = vitals.armor;
  return (
    <div className="hud-vitals">
      {armor && (
        <span
          className="hud-vital"
          title={`Pancerz: korpus ${armor.body} SP, głowa ${armor.head} SP`}
        >
          <span className="hud-vital-value">
            {armor.body === armor.head ? armor.body : `${armor.body}/${armor.head}`}
          </span>
          <span className="hud-vital-label">Pancerz</span>
        </span>
      )}
      {vitals.move && (
        <span
          className="hud-vital"
          title={
            vitals.move.note
              ? `RUCH ${vitals.move.points} — ${vitals.move.metres} m na Akcję Ruchu (${vitals.move.note})`
              : `RUCH ${vitals.move.points} — ${vitals.move.metres} m na Akcję Ruchu`
          }
        >
          <span className="hud-vital-value">{vitals.move.points}</span>
          {vitals.move.note && <span className="hud-vital-flag">!</span>}
          <span className="hud-vital-label">Ruch</span>
        </span>
      )}
      {vitals.emp && (
        <span
          className="hud-vital"
          title={`EMP z bieżącego Człowieczeństwa: ${vitals.emp.current} (maksimum ${vitals.emp.max})`}
        >
          <span className="hud-vital-value">{vitals.emp.current}</span>
          <span className="hud-vital-label">Emp</span>
        </span>
      )}
    </div>
  );
}

/**
 * Keeps a fresh `HudContext` without re-rendering on every frame of a march.
 *
 * The stores it watches change at pointer rate; what the panel *shows* changes
 * a few times a turn. `hudSignature` is the difference between the two.
 */
function useHudContext(): HudContext {
  const [context, setContext] = useState<HudContext>(() => currentHudContext());

  useEffect(() => {
    let last = hudSignature(context);
    const refresh = () => {
      const next = currentHudContext();
      const signature = hudSignature(next);
      if (signature === last) return;
      last = signature;
      setContext(next);
    };
    refresh();
    const unsubs = [
      useSelectionStore.subscribe(refresh),
      useTokenStore.subscribe(refresh),
      useCombatStore.subscribe(refresh),
      useCharacterStore.subscribe(refresh),
      useCompendiumStore.subscribe(refresh),
      useAuthStore.subscribe(refresh),
      // Etap 65d2: magazynek broni pokładowej jedzie z widokiem auta.
      useChaseStore.subscribe(refresh),
      // Etap 69: trwały cel figury stoi na kaflu broni w ręku.
      useTargetStore.subscribe(refresh),
      // Etap 70b: przejęte urządzenia jadą z runem, a „Obróć” czeka na klik.
      useNetRunStore.subscribe(refresh),
      useDeviceAimStore.subscribe(refresh),
    ];
    return () => {
      for (const unsub of unsubs) unsub();
    };
    // Mount-only on purpose: the closure reads the stores directly, so nothing
    // it needs can go stale, and re-subscribing on every render would undo the
    // whole point of comparing signatures.
  }, []);

  return context;
}

export function CombatHud() {
  const context = useHudContext();
  const focusId = context.token?.id ?? null;
  const activeWeapon = useHudStore((s) => s.activeWeapon);
  const jump = useHudStore((s) => s.jump);
  const form = useHudStore((s) => s.form);
  const collapsed = useHudStore((s) => s.collapsed);
  const setCollapsed = useHudStore((s) => s.setCollapsed);
  const setForm = useHudStore((s) => s.setForm);
  const combat = useCombatStore((s) => s.combat);
  const cupBusy = useRollStore((s) => s.pending !== null);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const myId = useAuthStore((s) => s.user?.id ?? null);
  // Gracz bez żadnej własnej karty (#58) — szkic z kreatora też się liczy.
  const noCharacter = useCharacterStore(
    (s) => !isGm && !Object.values(s.characters).some((character) => character.ownerId === myId),
  );

  const token = context.token;
  // Etap 72b2: kierowca w walce na scenie pościgu dostaje grupę „Pojazd”.
  const cockpit = useCockpitVehicle(token);
  const armed = activeWeaponOf(activeWeapon, token?.id ?? null);
  // Skok wzięty z paska (19.10.2026) — jego slot świeci jak broń w ręku.
  const jumping = jump !== null && jump.tokenId === token?.id;
  const fireModes = useHudStore((s) => s.fireModes);
  const setFireMode = useHudStore((s) => s.setFireMode);
  // Which weapon has its fire modes open; one at a time, and never across a
  // change of figure.
  const [openDrawer, setOpenDrawer] = useState<string | null>(null);
  const weapons = context.groups.filter(
    (group): group is CpredHotbarWeaponGroup => group.kind === 'weapon',
  );
  // A reload is not a weapon: it is an Action that happens to name one, and
  // leaving it among the guns is what made a character with a single pistol
  // look like a character with an arsenal.
  const actions = context.groups.filter(
    (group): group is CpredHotbarSingleGroup => group.kind !== 'weapon',
  );

  /**
   * A freshly selected figure comes with its first weapon in hand.
   *
   * That is what makes a click on an enemy mean something without a mode: in
   * the games this HUD is modelled on you do not „equip" before shooting, you
   * click. Only the first *usable* weapon is taken — arming an empty magazine
   * would put a crosshair on a gun that cannot fire.
   *
   * Steering is the condition, not merely being on screen: the rail describes a
   * figure by default, and a panel that raised a gun the moment it opened would
   * turn „look at my character" into „aim at whatever I click next".
   */
  useEffect(() => {
    const state = useHudStore.getState();
    if (!token || !context.steering) {
      if (state.activeWeapon) state.setActiveWeapon(null);
      return;
    }
    if (state.activeWeapon?.tokenId === token.id) {
      // A weapon put away or crowded out of the hands leaves the cursor too:
      // the bar kept „W ręku: nóż" under a greyed knife after the rifle came
      // out (25.09). Only that — an empty magazine or a spent Action keeps it,
      // since the player's next move is to reload or wait, not to switch.
      const held = state.activeWeapon.slotId;
      const current = context.slots.find((entry) => entry.id === held);
      if (current && !(current.kind === 'weapon' && current.outOfHand)) return;
    }
    const slot = context.slots.find((entry) => entry.kind === 'weapon' && !entry.disabled);
    if (!slot || slot.kind !== 'weapon') {
      state.setActiveWeapon(null);
      return;
    }
    state.setActiveWeapon({
      tokenId: token.id,
      slotId: slot.id,
      weaponRowId: slot.weaponRowId,
      attachmentId: slot.attachmentId,
      mode: slot.mode,
      name: slot.modeLabel ? `${slot.label} — ${slot.modeLabel}` : slot.label,
      melee: slot.melee,
      pointTarget: slot.pointTarget,
      ...(slot.coneRangeM !== null ? { coneRangeM: slot.coneRangeM } : {}),
    });
  }, [token, context.steering, context.slots]);

  // A form belongs to the figure it was opened for; switching figures closes it,
  // and so does an open drawer of fire modes.
  useEffect(() => {
    useHudStore.getState().setForm(null);
    setOpenDrawer(null);
  }, [focusId]);

  // #60 (T8b): formularz rozwija się pod akcjami, czyli zwykle pod dolną
  // krawędzią panelu — gracz widział ucięte „Zapisz” pod kubkiem i nie wiedział,
  // że wystarczy przewinąć. Otwarty formularz sam wjeżdża w widok
  // (`scroll-margin-bottom` w CSS trzyma go nad kubkiem).
  const railRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!form) return;
    const frame = requestAnimationFrame(() => {
      railRef.current
        ?.querySelector('.hud-form')
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [form]);

  // Collapsed is a strip, not a hole: the portrait and a sliver of the health
  // bar survive, because „I do not know how hurt I am" is not a saving of space
  // anybody asked for.
  if (collapsed) {
    return (
      <aside
        className="hud-rail hud-rail--collapsed"
        aria-label="Panel aktywnej postaci (zwinięty)"
      >
        <button
          type="button"
          className="hud-collapse"
          title="Pokaż panel postaci i pasek akcji"
          aria-label="Pokaż panel postaci"
          onClick={() => setCollapsed(false)}
        >
          ▸
        </button>
        {token && (
          <span className="hud-collapsed-figure" title={token.name}>
            {token.imageUrl ? (
              <img className="hud-portrait" src={token.imageUrl} alt="" />
            ) : (
              <span className="hud-portrait hud-portrait--empty">
                {token.name.trim().charAt(0).toUpperCase() || '?'}
              </span>
            )}
            {token.hp && (
              <span
                className={`hud-collapsed-hp hud-hp--${hpRingTone(tokenHpShareOf(token.hp))}`}
                title={`Punkty Wytrzymałości: ${token.hp.current}/${token.hp.max}`}
              >
                <span
                  className="hud-collapsed-hp-fill"
                  style={{
                    height: `${
                      token.hp.max > 0
                        ? Math.max(0, Math.min(1, token.hp.current / token.hp.max)) * 100
                        : 0
                    }%`,
                  }}
                />
              </span>
            )}
          </span>
        )}
        <HudEndTurnCompact />
      </aside>
    );
  }

  // Etap 69: przeładowanie i usuwanie usterki stoją na kaflu swojej broni,
  // a nie w „Akcjach”. Klucz jest ten sam, którym `shared` skleja ich id
  // (`reload:<klucz>`, `weapon:<klucz>`); narzędzie bez kafla (nie powinno
  // się zdarzyć — filtr rąk zdejmuje je razem z bronią) zostaje małą akcją.
  const weaponKeys = new Set(weapons.map((group) => group.id.slice('weapon:'.length)));
  const toolsByWeapon = new Map<string, CpredHotbarSingleGroup[]>();
  const loose: CpredHotbarSingleGroup[] = [];
  for (const group of actions) {
    const owner = group.kind === 'action' ? null : group.id.slice(group.id.indexOf(':') + 1);
    if (owner !== null && weaponKeys.has(owner)) {
      toolsByWeapon.set(owner, [...(toolsByWeapon.get(owner) ?? []), group]);
    } else loose.push(group);
  }
  // Grupa „Pojazd” zajmuje miejsce Biegu, Skoku i Skradania — w fotelu
  // kierowcy i tak odmawiają (etap 72, punkt 5).
  const medium = cockpit ? [] : loose.filter((group) => isMediumAction(group.slot));
  const small = loose.filter((group) => !isMediumAction(group.slot));
  const isArmedGroup = (group: CpredHotbarWeaponGroup) =>
    armed !== null &&
    armed.weaponRowId === group.weaponRowId &&
    armed.attachmentId === group.attachmentId;
  // Broń w ręku, której kafla nie ma na belce, mówi o sobie zdaniem u dołu.
  const armedOffRail = armed !== null && !weapons.some(isArmedGroup);
  const gmAimHint =
    isGm && !gmSteerLocked(isGm, combat) ? 'Alt+klik celuje we własny token.' : undefined;

  return (
    <HudTipLayer>
      <aside ref={railRef} className="hud-rail" aria-label="Panel aktywnej postaci">
        <div className="hud-head">
          <span className="hud-head-title">{context.device ? 'Urządzenie' : 'Postać'}</span>
          <button
            type="button"
            className="hud-collapse"
            title="Zwiń panel"
            aria-label="Zwiń panel"
            onClick={() => setCollapsed(true)}
          >
            ◂
          </button>
        </div>

        {!token && (
          <p className="hud-empty">
            <HudIcon name="stand-up" className="hud-empty-icon" />
            <span>
              {/* #58: nowy gracz bez postaci dostawał radę o tokenie, którego nie ma. */}
              {noCharacter
                ? 'Nie masz jeszcze postaci — poproś o nią MG w zakładce „Postacie” po prawej.'
                : 'Kliknij token, którym chcesz sterować. Potem klik w podłoże prowadzi go tam (w walce cel poza zielonymi śladami kliknij drugi raz), a klik w przeciwnika celuje.'}
            </span>
          </p>
        )}

        {token && (
          <>
            {/* Whose turn it is, said where the hand already is — for the GM. The
                end-turn block at the bottom of the rail (16.10) says whose turn
                the queue is on, whatever the rail describes. */}
            {context.acting && context.isGm && <p className="hud-turn-banner">Tura tej figury</p>}

            {/* Klucz figury (17.10): bez niego pasek PW pamiętał poprzednią
                figurę i przełączenie panelu pokazywało jej różnicę („+5”)
                jak leczenie. */}
            <IdentityCard
              key={token.id}
              name={token.name}
              imageUrl={token.imageUrl}
              hp={context.device ? context.device.hp : token.hp}
              vitals={context.vitals}
              container={token.container}
            />

            <StatusChips statuses={token.statuses} />
            <StatEffectChips effects={context.statEffects} />

            {/* Etap 70b: przejęte urządzenie mówi, przez co je trzymasz i co
                zostało z aktywacji — budżetu tury nie ma, płaci netrunner. */}
            {context.device && (
              <p className="hud-device-via" data-testid="hud-device">
                <span>
                  przez: <strong>{context.device.nodeLabel}</strong>
                </span>
                <span data-device-state={context.device.state}>
                  {DEVICE_STATE_TEXT[context.device.state]}
                </span>
              </p>
            )}

            {/* Showing is not steering: the rail fills itself in with this
                figure, but the map still belongs to nobody until the user says
                so. Without this line an unmoving token after a click on the floor
                reads as a broken map rather than as „you have not picked me up". */}
            {/* Etap 50b: MG w trwającej walce nie bierze figury klikiem na mapie. */}
            {!context.steering && (
              <p
                className="hud-preview"
                title={
                  gmSteerLocked(isGm, combat)
                    ? 'Panel pokazuje figurę, ale nią nie sterujesz — w walce weź ją z portretu na pasie inicjatywy, z menu figury albo naciśnij slot.'
                    : 'Panel pokazuje figurę, ale nią nie sterujesz — kliknij ją na mapie albo naciśnij slot.'
                }
              >
                {/* Plakietka zamiast zdania (17.10, MG): „jak przejąć” mówi
                    podpowiedź wyżej, na pasku wystarczy, że to nie twoja ręka. */}
                <IconEye size={15} />
                <strong className="hud-preview-tag">Podgląd</strong>
                <span>nie sterujesz</span>
              </p>
            )}

            {context.turn && <TurnBudget budget={context.turn} variant="rail" />}
            {context.refusal && <p className="hud-refusal">{context.refusal}</p>}

            {/* Karta jest, ale nie twoja (28.08) — i to **nie** jest przypadek
                pustego paska niżej. Akcje z katalogu (Ustabilizowanie, Bieg…)
                nie potrzebują karty, więc `slots` nigdy nie jest puste i wygląda
                to jak figura, która po prostu nie ma broni. Przy oględzinach
                wyszło, że pierwsza wersja tej poprawki wisiała pod
                `slots.length === 0` i z tego powodu nie pokazywała się nigdy. */}
            {context.sheetNotMine && (
              <p className="hud-refusal">
                Ta figura ma kartę postaci, ale nie jest przypisana do ciebie — dlatego pasek nie
                zna jej broni. Poproś MG, żeby ustawił cię właścicielem karty.
              </p>
            )}

            {/* Etap 31.08: rany i Testy figury bez karty. Stoją **nad** bronią,
                bo obie odpowiadają na pytanie „w jakim ona jest stanie", a nie
                „co może zrobić" — i bo rana zabierająca Akcję tłumaczy wyszarzone
                przyciski niżej. Przy figurze z kartą, którą ten klient ma, nie
                ma ich wcale: tam jedno i drugie mieszka na karcie. Gracz widzi
                tu rany postaci kolegi z drużyny (71h2, #88) — i leczy je swoją. */}
            {context.injuries.length > 0 || (context.isGm && !token.characterId) ? (
              <FigureInjuries tokenId={token.id} injuries={context.injuries} />
            ) : null}
            {context.figureSkills.length > 0 && (
              <FigureSkills
                tokenId={token.id}
                name={token.name}
                skills={context.figureSkills}
                disabled={context.refusal}
              />
            )}

            {context.slots.length === 0 && !context.device && (
              <p className="hud-empty">
                <HudIcon name="pistol" className="hud-empty-icon" />
                <span>
                  Ten token nie ma broni ani profilu bojowego — podłącz kartę postaci albo uzupełnij
                  profil w „Edytuj…”.
                </span>
              </p>
            )}

            {weapons.length > 0 && (
              <section className="hud-group">
                <h3 className="hud-group-title">Broń</h3>
                <div className="hud-slots">
                  {weapons.map((group) => {
                    const slot = cpredWeaponModeSlot(
                      group,
                      fireModes[fireModeKey(token.id, group.id)],
                    );
                    // Armed is about the *weapon*: the tile is one box, so
                    // highlighting it per mode would leave the gun in hand
                    // looking unarmed after a switch to burst.
                    const inHand = isArmedGroup(group);
                    return (
                      <div key={group.id} className="hud-slot-stack">
                        <WeaponTile
                          slot={slot}
                          armed={inHand}
                          modeCount={group.modes.length}
                          drawerOpen={openDrawer === group.id}
                          tools={toolsByWeapon.get(group.id.slice('weapon:'.length)) ?? []}
                          onActivate={() => {
                            setOpenDrawer(null);
                            activateGroup(group, token.id);
                          }}
                          onToggleDrawer={() =>
                            setOpenDrawer((current) => (current === group.id ? null : group.id))
                          }
                          onTool={(tool) => activateGroup(tool, token.id)}
                        />
                        {openDrawer === group.id && (
                          <ModeDrawer
                            group={group}
                            current={slot.mode}
                            onPick={(picked: CpredHotbarWeaponSlot) => {
                              // Pod tym samym kluczem, pod którym kafel i klawisze
                              // czytają tryb (`group.id`) — zapis pod `weaponRowId`
                              // zostawiał na kaflu „pojedynczy” przy serii w kubku
                              // (66e, pkt 5).
                              setFireMode(token.id, group.id, picked.mode);
                              setOpenDrawer(null);
                              // Picking a mode also takes the weapon in hand: at
                              // the table „przełączam na serię" and „strzelam
                              // serią" are one sentence.
                              activateSlot(picked, token.id);
                            }}
                          />
                        )}
                        {/* „W ręku” stoi pod bronią, której dotyczy (etap 69) —
                            z celem, dystansem i PT, gdy figura ma trwały cel.
                            Przy odmowie tury bez zachęty do celowania (#63). */}
                        {inHand && armed && !jumping && (
                          <p className="hud-armed" title={gmAimHint}>
                            <span className="hud-armed-tag">
                              W ręku<span className="visually-hidden">: {armed.name}</span>
                            </span>
                            {!context.refusal && (
                              <span className="hud-armed-aim">{aimText(slot, context.target)}</span>
                            )}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {cockpit && (
              <HudVehicle token={token} vehicle={cockpit} turnRefusal={context.refusal} />
            )}

            {context.device && (context.device.verbs.length > 0 || context.device.move) && (
              <section className="hud-group">
                <h3 className="hud-group-title">Urządzenie</h3>
                <div className="hud-slots hud-slots--medium">
                  {context.device.move && (
                    <DeviceMoveTile
                      slot={context.device.move}
                      onActivate={() => {
                        const move = context.device!.move!;
                        takeFigure(token.id, false);
                        if (move.disabled) notifyRefusal('action', move.disabled);
                        else
                          notifyInfo('Kliknij podłoże, dokąd urządzenie ma pojechać.', {
                            title: move.label,
                            topic: 'net',
                          });
                      }}
                    />
                  )}
                  {context.device.verbs.map((slot) => (
                    <DeviceVerbTile
                      key={slot.id}
                      slot={slot}
                      armed={slot.verb === 'turn' && context.device!.turning}
                      onActivate={() => {
                        takeFigure(token.id, false);
                        activateDeviceVerb(token.id, slot);
                      }}
                    />
                  ))}
                </div>
              </section>
            )}
            {context.device?.turning && (
              <p className="hud-armed hud-armed--note">
                <span className="hud-armed-mark" aria-hidden />
                <span>
                  <strong>Obróć</strong> — kliknij punkt mapy, na który kamera ma patrzeć.
                  <span className="hud-armed-hint"> Esc odkłada obrót.</span>
                </span>
              </p>
            )}

            {/* 03.11.2026 (MG): schowanej broni pasek nie wymienia wcale — co jest
                w rękach, a co w plecaku, mówi „Ekwipunek” karty (sekcje „Używane”
                i „Plecak”). */}

            {medium.length + small.length > 0 && (
              <section className="hud-group">
                <h3 className="hud-group-title">Akcje</h3>
                <ActionSlots
                  medium={medium}
                  small={small}
                  isArmed={(slot) =>
                    slot.kind === 'action' &&
                    ((jumping && slot.actionId === CPRED_ACTION_JUMP) ||
                      // Etap 61: slot trybu świeci, póki figura się skrada.
                      (token.sneaking === true && slot.actionId === CPRED_ACTION_SNEAK))
                  }
                  onActivate={(group) => activateGroup(group, token.id)}
                />
              </section>
            )}

            {token.sneaking && (
              <p className="hud-armed hud-armed--note" data-testid="hud-sneaking">
                <span className="hud-armed-mark" aria-hidden />
                <span>
                  <strong>Skradasz się</strong>
                  {typeof token.sneakDv === 'number' ? ` — wynik ${token.sneakDv}.` : '.'}
                  <span className="hud-armed-hint"> Atak i Bieg kończą tryb.</span>
                </span>
              </p>
            )}
            {jumping && (
              <p className="hud-armed hud-armed--note">
                <span className="hud-armed-mark" aria-hidden />
                <span>
                  <strong>Skok</strong> — kliknij podświetlone pole ({JUMP_COST_M} m ruchu).
                  <span className="hud-armed-hint"> Esc albo klik obok odkłada skok.</span>
                </span>
              </p>
            )}
            {!jumping && armedOffRail && armed && (
              <p className="hud-armed hud-armed--note" title={gmAimHint}>
                <span className="hud-armed-mark" aria-hidden />
                <span>
                  W ręku: <strong>{armed.name}</strong>
                  {context.refusal ? '.' : ' — kliknij cel na mapie.'}
                </span>
              </p>
            )}

            {/* Etap 30a: jedyny formularz paska, który działa też poza walką —
                „poza walką, gdy rozpoczyna się walka albo w trakcie walki"
                (s. 146). Dlatego stoi przed blokiem, który wymaga kolejki. */}
            {form === 'awareness' && token.characterId && (
              <div className="hud-form">
                <CombatAwarenessPanel
                  characterId={token.characterId}
                  tokenId={token.id}
                  onDone={() => setForm(null)}
                />
              </div>
            )}
            {/* Etap 30c: to samo dotyczy radia — „będąc w niebezpieczeństwie"
                obejmuje też chwilę przed pierwszą inicjatywą. */}
            {form === 'backup' && token.characterId && (
              <div className="hud-form">
                <BackupPanel
                  characterId={token.characterId}
                  tokenId={token.id}
                  onDone={() => setForm(null)}
                />
              </div>
            )}

            {/* #42 (01.10): Ustabilizowanie nie czeka na walkę — ranny po starciu
                bez niego nie zaczyna naturalnego leczenia. Poza walką pacjentem
                jest każda figura na wyciągnięcie ręki, a Akcji nikt nie liczy. */}
            {form === 'stabilize' && !combat && (
              <div className="hud-form">
                <StabilizeNearbyPicker tokenId={token.id} onDone={() => setForm(null)} />
              </div>
            )}
            {form && form !== 'awareness' && form !== 'backup' && combat && context.combatant && (
              <div className="hud-form">
                {form === 'hold' && (
                  <HoldActionForm combatant={context.combatant} onDone={() => setForm(null)} />
                )}
                {form === 'stabilize' && (
                  <StabilizePicker
                    combat={combat}
                    combatant={context.combatant}
                    onDone={() => setForm(null)}
                  />
                )}
                {form === 'grapple' && (
                  <GrapplePanel
                    combat={combat}
                    combatant={context.combatant}
                    cupBusy={cupBusy}
                    startOpen
                    onDone={() => setForm(null)}
                  />
                )}
              </div>
            )}
            {form &&
              form !== 'awareness' &&
              form !== 'backup' &&
              !(form === 'stabilize' && !combat) &&
              !context.combatant && (
                <p className="hud-refusal">
                  Ta akcja wymaga trwającej walki — dodaj token do kolejki inicjatywy.
                </p>
              )}

            {/* Ściągawka ze skrótami zniknęła w 27f: pełną listę — z tymi
                czterema i całą resztą — otwiera `?` w górnym pasku. Pasek boczny
                wraca do tego, czym jest, czyli do stanu figury. */}
          </>
        )}

        {/* Stopka belki (etap 69): lewą część trzyma kubek stojący w rogu okna,
            prawą — koniec tury (16.10: jedno miejsce dla MG i graczy, działa
            bez zaznaczenia). Przyklejona do dołu, więc długa belka przewija
            się pod nią. */}
        <div className="hud-foot">
          <HudEndTurn />
        </div>
      </aside>
    </HudTipLayer>
  );
}
