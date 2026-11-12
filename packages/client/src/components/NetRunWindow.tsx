import { useEffect, useRef, useState } from 'react';
import type {
  CpredNetPosition,
  NetAbilityId,
  NetDeviceOperation,
  NetDeviceView,
  NetRunView,
} from '@vtt/shared';
import { ROLE_GM, conditionRegistry, tokenCondition } from '@vtt/shared';
import {
  attackInNet,
  clearNetGlue,
  resetNetHacks,
  copyNetFile,
  demonDetects,
  demonTakesTurn,
  iceDetects,
  iceTakesTurn,
  leaveNetRun,
  moveNetRun,
  operateNetDevice,
  slideInNet,
  toggleNetProgram,
  useNetAbility,
} from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCombatStore } from '../stores/combatStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { showNetDevice, showNetDevices } from '../map-frame.js';
import { currentRun, useNetRunStore } from '../stores/netRunStore.js';
import { netErrorText } from '../netErrors.js';
import { clearNotices, notifyChoice, notifyInfo, notifyRefusal } from '../notices.js';
import { InlineNotice } from './NoticeColumn.js';
import { useWindowPlacement } from '../window-placement.js';
import { WindowResizeGrip } from './WindowResizeGrip.js';
import { NetDeckSection } from './netrun/NetDeckSection.js';
import { NetExits } from './netrun/NetExits.js';
import { NetFloorCard, type VirusDraft } from './netrun/NetFloorCard.js';
import { NetGmShaft } from './netrun/NetGmShaft.js';
import { NetNodeDevices, type NetNodeLike, type OperateExtra } from './netrun/NetNodeDevices.js';
import { NetThreats } from './netrun/NetThreats.js';
import { NetTrail } from './netrun/NetTrail.js';
import { floorName } from './netrun/net-glyphs.js';

/**
 * Okno SIEĆ (etap 70a) — jedno piętro zamiast całego szybu.
 *
 * Okno, nie zakładka: run dzieje się w trakcie walki fizycznej, więc mapa musi
 * zostać widoczna (decyzja MG z 14.08). Do 70a rysowało cały szyb z „?” na
 * nieodkrytych piętrach, czyli zdradzało, ile ich jest. Teraz gracz dostaje
 * z serwera piętro pod stopami, wyjścia z niego i ślad odwiedzonych — i tylko
 * to da się tu narysować. Klient niczego nie ukrywa, bo nie ma czego.
 *
 * Kolejność sekcji jest stała, a pusta sekcja nie istnieje: belka stanu, ślad,
 * karta piętra, wyjścia, zagrożenia (LOD i Demony), przejęte węzły, cyberdek.
 * MG ma obok zwijaną kolumnę „Plan Architektury” z całym szybem.
 *
 * Zwykły DOM, świadomie: to lista, a nie mapa, i nie ma powodu dokładać jej do
 * canvasu Pixi, który w tym czasie rysuje strzelaninę.
 */

/** Odstęp okna runu od pasa, znacznika i krawędzi mapy. */
const NET_RUN_GAP = 8;
/** Szerokość okna gracza i kolumny planu MG (`17-net.css`). */
const NET_RUN_WIDTH = 360;
const NET_PLAN_WIDTH = 320;
const PLAN_OPEN_KEY = 'vtt.net.plan';

function readPlanOpen(): boolean {
  try {
    return window.localStorage.getItem(PLAN_OPEN_KEY) !== '0';
  } catch {
    return true;
  }
}

function writePlanOpen(open: boolean): void {
  try {
    window.localStorage.setItem(PLAN_OPEN_KEY, open ? '1' : '0');
  } catch {
    // Prywatne okno bez pamięci: plan po prostu otworzy się przy następnym runie.
  }
}

/**
 * Gdzie okno runu staje za pierwszym razem (#34, 29.09, decyzja MG).
 *
 * Przy prawej krawędzi mapy, górą pod pasem kolejki i pod znacznikiem „Czeka
 * na MG". Oba miejsca rezerwuje się także wtedy, gdy ich jeszcze nie ma: run
 * zaczyna się zwykle przed walką, a pas wchodzi nad mapę dopiero z nią i spycha
 * ją (razem ze znacznikiem) w dół — okno postawione pod gołą mapą wylądowałoby
 * wtedy na pasie. Od 70a liczone dla wąskiego okna (360 px, u MG z planem 680):
 * zostaje w prawym pasie mapy, z dala od kubka i lewej belki.
 */
function netRunFallback(isGm: boolean, width: number): { x: number; y: number } {
  const box = (selector: string) => {
    const rect = document.querySelector(selector)?.getBoundingClientRect();
    return rect && rect.height > 0 ? rect : undefined;
  };
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const map = box('.map-area');
  const bar = box('.combat-bar');
  const badge = box('.gm-attention-badge');
  // Pas kolejki: `height: 3.5rem` i czerwona kreska 2 px (`09-turn.css`).
  const barShift = bar ? 0 : 3.5 * rem + 2;
  const mapTop = (map?.top ?? 0) + barShift;
  // Znacznik: `top: 0.75rem` kolumny rogu mapy i jeden wiersz odznaki.
  const badgeBottom = badge ? badge.bottom + barShift : isGm ? mapTop + 2.75 * rem : 0;
  const fitted = Math.min(width, window.innerWidth - 32);
  const right = map?.right ?? window.innerWidth;
  return {
    x: Math.max(0, right - fitted - NET_RUN_GAP * 2),
    y: Math.max(mapTop, bar?.bottom ?? 0, badgeBottom) + NET_RUN_GAP,
  };
}

/** Węzły runu z listą urządzeń: piętro pod stopami i przejęte na śladzie. */
function heldNodes(view: NetRunView): NetNodeLike[] {
  const nodes: NetNodeLike[] = [];
  if (view.here?.devices?.length) nodes.push(view.here);
  for (const step of view.trail) {
    if (!step.here && step.devices?.length) nodes.push(step);
  }
  return nodes;
}

/**
 * Kropki Akcji Sieciowych (etap 70a; kropka = Akcja, jak na lewej belce z 69).
 *
 * Liczone z budżetu tury uczestnika walki: wiersz „Sieć” pojawia się z pierwszą
 * Akcją Sieciową, a Akcja wydana w Somie zamyka Sieć na tę Turę („albo Soma,
 * albo Sieć”). Poza walką nikt Akcji nie liczy — wszystkie kropki są pełne.
 */
function NetActionDots({ tokenId, max }: { tokenId: string; max: number }) {
  const combat = useCombatStore((s) => s.combat);
  const turn =
    combat && combat.round > 0
      ? combat.combatants.find((entry) => entry.tokenId === tokenId)?.turn
      : undefined;
  const net = turn?.resources.find((resource) => resource.id === 'net');
  const action = turn?.resources.find((resource) => resource.id === 'action');
  const total = net?.max ?? max;
  const left = !turn
    ? total
    : net
      ? Math.max(0, net.max - net.used)
      : action && action.used >= action.max
        ? 0
        : total;
  const title = !turn
    ? `Akcje Sieciowe: ${total} na Turę — poza walką nikt ich nie liczy`
    : `Akcje Sieciowe w tej Turze: zostało ${left} z ${total}`;
  return (
    <span className="net-actions" title={title} role="img" aria-label={title}>
      <span className="net-actions-label">Akcje Sieciowe</span>
      <span className="net-actions-dots" aria-hidden>
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={`net-action-dot${index < left ? '' : ' net-action-dot--spent'}`}
          />
        ))}
      </span>
    </span>
  );
}

/**
 * Okno runu żyje tylko wtedy, gdy jest run — żeby pierwsze położenie liczyło
 * się w chwili otwarcia, a nie przy starcie aplikacji, kiedy nie ma jeszcze ani
 * pasa kolejki, ani mapy (#34).
 */
export function NetRunWindow() {
  const run = useNetRunStore(currentRun);
  return run ? <NetRunWindowBody /> : null;
}

function NetRunWindowBody() {
  const run = useNetRunStore(currentRun);
  const runs = useNetRunStore((s) => s.runs);
  const openRun = useNetRunStore((s) => s.openRun);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const tokens = useTokenStore((s) => s.tokens);
  const statusRows = useTokenStore((s) => s.statuses);
  const [planOpen, setPlanOpen] = useState(readPlanOpen);
  // Liczone raz, przy otwarciu: miejsce pierwszego otwarcia i zarazem granica
  // wysokości okna (niżej), żeby klamra nie wypychała go z powrotem na pas.
  const [fit] = useState(() =>
    netRunFallback(isGm, NET_RUN_WIDTH + (isGm && planOpen ? NET_PLAN_WIDTH : 0)),
  );
  // Klucz z numerem etapu: położenie i rozmiar zapamiętane dla okna 560 px
  // sprzed 70a nie pasują do wąskiego — pierwsze otwarcie liczy się na nowo.
  const placement = useWindowPlacement('net-run-70', () => fit);
  const [busy, setBusy] = useState(false);
  const sceneId = useSceneStore((s) => s.effectiveScene?.id ?? null);
  /**
   * Węzeł, którego urządzenia mapa ma pokazać, gdy przyjdzie ich lista
   * (zlecenie MG z 20.10). Lista jedzie `netrun:sync`, który może dojść przed
   * potwierdzeniem Kontroli albo po nim — stąd próba w obu miejscach.
   */
  const frameNode = useRef<string | null>(null);

  useEffect(() => {
    if (run) frameTakenNode(run.run, run.tokenId);
  }, [run]);

  if (!run) return null;
  const view = run.run;
  const here = view.here;
  const showPlan = isGm && view.shaft !== undefined;

  /** Kadr na urządzeniach węzła, który ten klient właśnie przejął. */
  function frameTakenNode(latest: NetRunView, runnerTokenId: string) {
    const floorId = frameNode.current;
    if (!floorId) return;
    const node = heldNodes(latest).find((entry) => entry.id === floorId);
    if (!node?.devices?.length) return;
    frameNode.current = null;
    showNetDevices(node.devices, runnerTokenId);
  }

  async function guard<T>(work: Promise<{ ok: boolean; error?: string; data?: T }>) {
    setBusy(true);
    const ack = await work;
    setBusy(false);
    if (!ack.ok && ack.error !== 'NET_SHOT_COVERED') notifyRefusal('net', netErrorText(ack.error));
    return ack;
  }

  /** Wynik akcji w Sieci („Hasło złamane…”) — informacja w kanale nad mapą (etap 55b). */
  function report(summary: string | undefined) {
    if (summary) notifyInfo(summary, { title: 'Sieć', topic: 'net' });
    else clearNotices('net');
  }

  /** Jedna obsługa urządzenia; `ignoreCover` wraca tu z przycisku powtórki. */
  async function operate(
    floorId: string,
    deviceId: string,
    operation: NetDeviceOperation,
    extra: OperateExtra,
    ignoreCover?: boolean,
  ) {
    const { targetTokenId, facing } = extra;
    const ack = await guard(
      operateNetDevice({
        runId: run!.runId,
        floorId,
        deviceId,
        operation,
        ...(targetTokenId ? { targetTokenId } : {}),
        ...(facing !== undefined ? { facing } : {}),
        ...(ignoreCover ? { request: { ignoreCover: true } } : {}),
      }),
    );
    if (ack.ok) report(ack.data?.summary);
    // Strzał wieżyczki: rzut oka na nią i powrót do netrunnera (20.10).
    if (ack.ok && operation === 'fire') {
      const device = nodes
        .find((node) => node.id === floorId)
        ?.devices?.find((entry) => entry.id === deviceId);
      if (device) showNetDevice(device, run!.tokenId);
    }
    /*
     * Strzał odrzucony przez osłonę (16c/26d) — pytanie z powtórką. Urządzenie
     * strzela od razu, więc wybór może przyjść dopiero po odmowie i musi mieć
     * przycisk. Znika w 70b razem ze strzałem z listy: przejęta figura celuje
     * z mapy i pyta o osłonę przed zapłatą.
     */
    if (ack.error === 'NET_SHOT_COVERED') {
      notifyChoice(
        'net',
        netErrorText(ack.error),
        [
          {
            label: 'Strzelaj mimo osłony',
            title: 'Cel się wychylił — decyzja stołu, kosztuje drugą Akcję Sieciową',
            run: () => void operate(floorId, deviceId, operation, extra, true),
          },
        ],
        { title: 'Osłona' },
      );
    }
  }

  async function move(to: CpredNetPosition) {
    const ack = await guard(moveNetRun(run!.runId, to));
    if (ack.ok) clearNotices('net');
  }

  async function ability(id: NetAbilityId, virus?: VirusDraft) {
    // Kontrola: piętro, na którym netrunner stoi, to węzeł, który przejmuje.
    const standing = id === 'control' ? here?.id : undefined;
    const ack = await guard(
      useNetAbility({ runId: run!.runId, ability: id, ...(virus ? { virus } : {}) }),
    );
    if (ack.ok) report(ack.data?.summary);
    if (ack.ok && ack.data?.success && standing) {
      frameNode.current = standing;
      const latest = currentRun(useNetRunStore.getState());
      if (latest) frameTakenNode(latest.run, latest.tokenId);
    }
  }

  /** Każde wejście do walki w Sieci wraca tym samym zdaniem nad mapą. */
  async function fight<T extends { summary: string }>(
    work: Promise<{ ok: boolean; error?: string; data?: T }>,
  ) {
    const ack = await guard(work);
    if (ack.ok) report(ack.data?.summary);
  }

  const nodes = heldNodes(view);
  /*
   * Figury, w które wieżyczka może wycelować (etap 26d). Lista jest tym, co
   * ten klient **i tak już widzi** na mapie — u gracza po filtrze widoczności
   * z 18a, u MG wszystko. Serwer i tak sprawdza mgłę i ukrycie celu, więc to
   * jest wygoda, nie uprawnienie. Bez pojemników, martwych i figur-urządzeń
   * (66e, pkt 22).
   */
  const conditions = conditionRegistry(statusRows);
  const deviceTokens = new Set(
    nodes.flatMap((node) => (node.devices ?? []).map((device) => device.tokenId)),
  );
  const targets = Object.values(tokens)
    .filter(
      (token) =>
        token.container === undefined &&
        !deviceTokens.has(token.id) &&
        tokenCondition(token, conditions) !== 'dead',
    )
    .map((token) => ({ id: token.id, name: token.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  const fightState = view.combat;
  /** Przejęte węzły, na których netrunner teraz nie stoi — obsługa bez wracania. */
  const awayNodes = view.trail.filter((step) => !step.here && step.devices?.length);
  const showDevice = (device: NetDeviceView) => showNetDevice(device);

  return (
    <section
      ref={placement.ref}
      className={`sheet-window net-run-window${showPlan && planOpen ? ' net-run-window--plan' : ''}`}
      style={{
        ...placement.style,
        // Okno bez własnej wysokości mieści się pod pasem w całości: z samym
        // arkuszowym `100vh − 120px` klamra podciągała je z powrotem na pas
        // kolejki, gdy stało niżej niż 120 px (#34).
        ...(placement.style.height === undefined
          ? { maxHeight: `calc(100vh - ${fit.y + NET_RUN_GAP}px)` }
          : {}),
        zIndex: 330,
      }}
      aria-label={`Sieć: ${view.architectureName ?? 'SIEĆ'}`}
    >
      <div className="sheet-header" {...placement.dragProps}>
        <span className="sheet-name net-run-title">
          {/* Nazwa przychodzi tylko do MG (#32); gracz widzi „SIEĆ”. */}
          {view.architectureName ?? 'SIEĆ'}
          <span className="net-entry-meta"> · {run.characterName}</span>
        </span>
        {runs.length > 1 && (
          <select
            value={run.runId}
            onChange={(event) => openRun(event.target.value)}
            title="Który run oglądasz"
          >
            {runs.map((entry) => (
              <option key={entry.runId} value={entry.runId}>
                {entry.characterName}
              </option>
            ))}
          </select>
        )}
        {showPlan && (
          <button
            type="button"
            className="small-button"
            aria-pressed={planOpen}
            title="Plan Architektury — cały szyb, widoczny tylko dla MG"
            onClick={() => {
              writePlanOpen(!planOpen);
              setPlanOpen(!planOpen);
            }}
          >
            Plan
          </button>
        )}
        <button
          type="button"
          className="small-button"
          title="Bezpieczne odłączenie — kosztuje Akcję Sieciową i resetuje obronę Architektury"
          disabled={busy}
          onClick={() => void guard(leaveNetRun(run.runId))}
        >
          Odłącz się
        </button>
      </div>

      <div className="net-run-cols">
        <div className="net-run-body">
          <div className="net-run-status">
            <NetActionDots tokenId={run.tokenId} max={view.netActionsMax} />
            <span>Interfejs {run.interfaceRank}</span>
            {fightState.netActionDebt > 0 && (
              <span className="net-run-debt">
                W kolejnej Turze −{fightState.netActionDebt} Akcji Sieciowej
              </span>
            )}
            {fightState.slideMarks > 0 && (
              <span className="net-run-debt">
                Ślizg −{2 * fightState.slideMarks} (Skunks ×{fightState.slideMarks})
              </span>
            )}
          </div>

          {fightState.glue && (
            <InlineNotice tone="warn" title="Klej" className="net-run-notice--glue" role="status">
              {fightState.glue.source}: ani niżej, ani bezpiecznego odłączenia
              {fightState.glue.untilRound !== null
                ? ` — do rundy ${fightState.glue.untilRound}`
                : ' — do zdjęcia przez MG'}
              . Awaryjne odłączenie wciąż działa.
              {isGm && (
                <button
                  type="button"
                  className="small-button"
                  disabled={busy}
                  onClick={() => void guard(clearNetGlue(run.runId))}
                >
                  Zdejmij
                </button>
              )}
            </InlineNotice>
          )}

          <NetTrail trail={view.trail} busy={busy} onMove={(to) => void move(to)} />

          {here && (
            <NetFloorCard
              here={here}
              run={view}
              busy={busy}
              sceneId={sceneId}
              targets={targets}
              onAbility={(id, virus) => void ability(id, virus)}
              onCopy={(floorId) => void guard(copyNetFile(run.runId, floorId))}
              onOperate={(floorId, deviceId, operation, extra) =>
                void operate(floorId, deviceId, operation, extra)
              }
              onShow={showDevice}
            />
          )}

          <NetExits exits={view.exits} busy={busy} onMove={(to) => void move(to)} />

          <NetThreats
            combat={fightState}
            demons={view.demons}
            isGm={isGm}
            busy={busy}
            onAttackIce={(iceId, rowId) =>
              void fight(attackInNet({ runId: run.runId, iceId, ...(rowId ? { rowId } : {}) }))
            }
            onAttackDemon={(demonId, rowId) =>
              void fight(attackInNet({ runId: run.runId, demonId, ...(rowId ? { rowId } : {}) }))
            }
            onSlide={(iceId, to) =>
              void fight(slideInNet({ runId: run.runId, iceId, ...(to ? { to } : {}) }))
            }
            onIceDetect={(iceId) => void fight(iceDetects({ runId: run.runId, iceId }))}
            onIceTurn={(iceId) => void fight(iceTakesTurn({ runId: run.runId, iceId }))}
            onDemonDetect={(demonId) => void fight(demonDetects({ runId: run.runId, demonId }))}
            onDemonTurn={(demonId) => void fight(demonTakesTurn({ runId: run.runId, demonId }))}
          />

          {awayNodes.length > 0 && (
            <div className="net-section net-held">
              <h4 className="net-section-title">Przejęte węzły</h4>
              {awayNodes.map((step) => (
                <div key={step.id} className="net-held-node">
                  <button
                    type="button"
                    className="net-held-name"
                    disabled={busy}
                    title="Wróć na ten węzeł — ruch nic nie kosztuje"
                    onClick={() => void move(step.position)}
                  >
                    ⚙ {floorName(step)}
                  </button>
                  <NetNodeDevices
                    node={step}
                    targets={targets}
                    busy={busy}
                    sceneId={sceneId}
                    onOperate={(deviceId, operation, extra) =>
                      void operate(step.id, deviceId, operation, extra)
                    }
                    onShow={showDevice}
                  />
                </div>
              ))}
            </div>
          )}

          <NetDeckSection
            combat={fightState}
            busy={busy}
            onToggle={(rowId, action) =>
              void fight(toggleNetProgram({ runId: run.runId, rowId, action }))
            }
          />

          {view.viruses.length > 0 && (
            <ul className="net-virus-list">
              {view.viruses.map((virus) => (
                <li key={virus.id}>
                  <strong>Wirus PT {virus.dv}</strong> — {virus.description}
                  {virus.author ? ` (${virus.author})` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>

        {showPlan && planOpen && (
          <NetGmShaft
            shaft={view.shaft!}
            spentTries={view.spentTries}
            busy={busy}
            onMove={(to) => void move(to)}
            onResetTries={() => void guard(resetNetHacks(run.runId))}
          />
        )}
      </div>
      <WindowResizeGrip resizeProps={placement.resizeProps} />
    </section>
  );
}
