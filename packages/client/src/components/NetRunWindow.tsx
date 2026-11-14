import { useEffect, useRef, useState } from 'react';
import type {
  CpredNetPosition,
  NetAbilityId,
  NetDeviceOperation,
  NetRunAbilityPayload,
  NetRunView,
} from '@vtt/shared';
import { NET_ABILITIES_AVAILABLE, ROLE_GM } from '@vtt/shared';
import { loadNetRoll } from '../net-cup.js';
import {
  attackInNet,
  clearNetGlue,
  resetNetHacks,
  setNetDefensePaused,
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
import { useSceneStore } from '../stores/sceneStore.js';
import { releaseRunWindowInsets, showNetDevices } from '../map-frame.js';
import { currentRun, useNetRunStore } from '../stores/netRunStore.js';
import { netErrorText } from '../netErrors.js';
import { clearNotices, notifyInfo, notifyRefusal } from '../notices.js';
import { InlineNotice } from './NoticeColumn.js';
import { useWindowPlacement } from '../window-placement.js';
import { WindowResizeGrip } from './WindowResizeGrip.js';
import { NetDeckSection } from './netrun/NetDeckSection.js';
import { NetExits } from './netrun/NetExits.js';
import { NetFloorCard, type VirusDraft } from './netrun/NetFloorCard.js';
import { NetGmShaft } from './netrun/NetGmShaft.js';
import { NetEyesStrip, heldNodes } from './netrun/NetEyesStrip.js';
import { NetThreats } from './netrun/NetThreats.js';
import { NetTrail } from './netrun/NetTrail.js';

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
 * karta piętra, wyjścia, zagrożenia (LOD i Demony), oczy i urządzenia (70c),
 * cyberdek.
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
 * Hamulec MG na obronę Sieci (etap 70e, decyzja MG nr 4 z 11.11).
 *
 * Domyślnie Czarny LOD wykrywa intruza, a LOD i Demony grają swoje Tury
 * w kolejce same; zaznaczony — stoją, dopóki MG nie kliknie przycisku
 * w „Zagrożeniach”. Pole trzyma Architektura, nie run, więc zostaje po
 * odłączeniu. Gracz go nie ma: `defensePaused` przychodzi tylko do MG.
 */
function NetDefenseBrake({
  paused,
  busy,
  onChange,
}: {
  paused: boolean;
  busy: boolean;
  onChange: (paused: boolean) => void;
}) {
  return (
    <label
      className="net-defense-brake"
      title={
        paused
          ? 'Obrona tej Architektury stoi: Czarny LOD i Demony ruszają się tylko na przyciski MG w „Zagrożeniach”.'
          : 'Czarny LOD sam wykrywa intruza, a LOD i Demony grają swoje Tury w kolejce. Zaznacz, żeby ruszały się tylko na przyciski MG.'
      }
    >
      <input
        type="checkbox"
        checked={paused}
        disabled={busy}
        onChange={(event) => onChange(event.target.checked)}
      />
      Wstrzymaj obronę
    </label>
  );
}

/**
 * Okno runu żyje tylko wtedy, gdy jest run — żeby pierwsze położenie liczyło
 * się w chwili otwarcia, a nie przy starcie aplikacji, kiedy nie ma jeszcze ani
 * pasa kolejki, ani mapy (#34).
 */
export function NetRunWindow() {
  const run = useNetRunStore(currentRun);
  const open = run !== null && run !== undefined;
  // Kadr urządzenia poszerzył granicę kamery o zasłoniętą część mapy (70f
  // pkt 1) — bez okna nic już nie zasłania, więc granica wraca na scenę.
  useEffect(() => {
    if (!open) releaseRunWindowInsets();
  }, [open]);
  return run ? <NetRunWindowBody /> : null;
}

function NetRunWindowBody() {
  const run = useNetRunStore(currentRun);
  const runs = useNetRunStore((s) => s.runs);
  const openRun = useNetRunStore((s) => s.openRun);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
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
    if (!ack.ok) notifyRefusal('net', netErrorText(ack.error));
    return ack;
  }

  /** Wynik akcji w Sieci („Hasło złamane…”) — informacja w kanale nad mapą (etap 55b). */
  function report(summary: string | undefined) {
    if (summary) notifyInfo(summary, { title: 'Sieć', topic: 'net' });
    else clearNotices('net');
  }

  /**
   * Przełącznik urządzenia z paska oczu (bez figury, drzwi, „Włącz”). Strzał,
   * obrót kamery i jazda drona są na mapie: przejętą figurę prowadzi lewa belka.
   */
  async function operate(floorId: string, deviceId: string, operation: NetDeviceOperation) {
    const ack = await guard(operateNetDevice({ runId: run!.runId, floorId, deviceId, operation }));
    if (ack.ok) report(ack.data?.summary);
  }

  async function move(to: CpredNetPosition) {
    const ack = await guard(moveNetRun(run!.runId, to));
    if (ack.ok) clearNotices('net');
  }

  /**
   * Rzut Interfejsu idzie przez kubek (zlecenie MG z 14.11): klik ładuje kubek,
   * gracz nim potrząsa i może dorzucić Szczęście. Bez rzutu zostaje tylko krok
   * pisania Wirusa, który nie jest ostatni — ten leci od razu.
   */
  function loadRoll(
    title: string,
    send: Parameters<typeof loadNetRoll>[0]['send'],
    onDone?: Parameters<typeof loadNetRoll>[0]['onDone'],
  ) {
    loadNetRoll({
      characterId: run!.characterId,
      characterName: run!.characterName,
      title: `${title} · Interfejs ${run!.interfaceRank}`,
      send,
      ...(onDone ? { onDone } : {}),
    });
  }

  async function ability(id: NetAbilityId, virus?: VirusDraft) {
    const runId = run!.runId;
    // Kontrola: piętro, na którym netrunner stoi, to węzeł, który przejmuje.
    const standing = id === 'control' ? here?.id : undefined;
    const send = (extra: Partial<NetRunAbilityPayload>) =>
      useNetAbility({ runId, ability: id, ...(virus ? { virus } : {}), ...extra });
    const writing = view.virus;
    const rolls =
      id !== 'virus' ||
      (writing ? writing.actionsSpent + 1 >= writing.actionsNeeded : (virus?.actions ?? 1) <= 1);
    if (!rolls) {
      const ack = await guard(send({}));
      if (ack.ok) report(ack.data?.summary);
      return;
    }
    const name = NET_ABILITIES_AVAILABLE.find((entry) => entry.id === id)?.name ?? id;
    loadRoll(
      name,
      (gesture, luck) => send({ gesture, ...(luck > 0 ? { luckSpent: luck } : {}) }),
      (result) => {
        if (!result?.success || !standing) return;
        frameNode.current = standing;
        const latest = currentRun(useNetRunStore.getState());
        if (latest) frameTakenNode(latest.run, latest.tokenId);
      },
    );
  }

  /** Atak (Paf albo Agresor) w LOD-a lub Demona — na kubek, jak zdolność. */
  function attack(target: { iceId: string } | { demonId: string }, rowId?: string) {
    const runId = run!.runId;
    const foe =
      'iceId' in target
        ? fightState.ice.find((entry) => entry.id === target.iceId)?.name
        : view.demons.find((entry) => entry.id === target.demonId)?.name;
    const weapon = rowId ? fightState.deck.find((slot) => slot.rowId === rowId)?.name : 'Paf';
    loadRoll(`${weapon ?? 'Atak'}${foe ? ` → ${foe}` : ''}`, (gesture, luck) =>
      attackInNet({
        runId,
        ...target,
        ...(rowId ? { rowId } : {}),
        gesture,
        ...(luck > 0 ? { luckSpent: luck } : {}),
      }),
    );
  }

  /** Każde wejście do walki w Sieci wraca tym samym zdaniem nad mapą. */
  async function fight<T extends { summary: string }>(
    work: Promise<{ ok: boolean; error?: string; data?: T }>,
  ) {
    const ack = await guard(work);
    if (ack.ok) report(ack.data?.summary);
  }

  const fightState = view.combat;

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
            {isGm && view.defensePaused !== undefined && (
              <NetDefenseBrake
                paused={view.defensePaused}
                busy={busy}
                onChange={(paused) => void guard(setNetDefensePaused(run.runId, paused))}
              />
            )}
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
              onAbility={(id, virus) => void ability(id, virus)}
              onCopy={(floorId) => void guard(copyNetFile(run.runId, floorId))}
            />
          )}

          <NetExits exits={view.exits} busy={busy} onMove={(to) => void move(to)} />

          <NetThreats
            combat={fightState}
            demons={view.demons}
            isGm={isGm}
            busy={busy}
            onAttackIce={(iceId, rowId) => attack({ iceId }, rowId)}
            onAttackDemon={(demonId, rowId) => attack({ demonId }, rowId)}
            onSlide={(iceId, to) => {
              const runId = run.runId;
              const ice = fightState.ice.find((entry) => entry.id === iceId)?.name;
              loadRoll(`Ślizg${ice ? ` przed ${ice}` : ''}`, (gesture, luck) =>
                slideInNet({
                  runId,
                  iceId,
                  ...(to ? { to } : {}),
                  gesture,
                  ...(luck > 0 ? { luckSpent: luck } : {}),
                }),
              );
            }}
            onIceDetect={(iceId) => void fight(iceDetects({ runId: run.runId, iceId }))}
            onIceTurn={(iceId) => void fight(iceTakesTurn({ runId: run.runId, iceId }))}
            onDemonDetect={(demonId) => void fight(demonDetects({ runId: run.runId, demonId }))}
            onDemonTurn={(demonId) => void fight(demonTakesTurn({ runId: run.runId, demonId }))}
          />

          <NetEyesStrip
            view={view}
            operated={run.operated ?? []}
            runnerTokenId={run.tokenId}
            sceneId={sceneId}
            busy={busy}
            onOperate={(floorId, deviceId, operation) => void operate(floorId, deviceId, operation)}
          />

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
