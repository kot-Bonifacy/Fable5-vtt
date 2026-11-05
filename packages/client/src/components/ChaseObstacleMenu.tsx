import { useEffect } from 'react';
import {
  CHASE_OBSTACLE_PRESETS,
  ROLE_GM,
  chaseObstacleUnbreakable,
  type ChaseObstacleChoice,
  type ChaseObstacleView,
  type SceneVehicleView,
  type TokenView,
} from '@vtt/shared';
import { useAuthStore } from '../stores/authStore.js';
import { useChaseStore } from '../stores/chaseStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { answerChaseObstacle, answerChaseVehicle, removeChaseObstacle } from '../socket.js';
import { clearNotices, notifyChoice, notifyRefusal } from '../notices.js';
import { chaseErrorText } from './ChaseVehicleMenu.js';
import { chaseRamText } from '../chase-ram.js';
import { useMenuEscape, useMenuTop } from './TokenContextMenu.js';

/**
 * Przeszkody na scenie pościgu (etap 65e) — menu przeszkody u MG i pasek
 * wyboru dla kierowcy, przed którego zderzakiem przeszkoda stanęła.
 */

const MENU_WIDTH = 260;

function answer(obstacleId: string, choice: ChaseObstacleChoice): void {
  void answerChaseObstacle(obstacleId, choice).then((ack) => {
    if (!ack.ok) notifyRefusal('chase', chaseErrorText(ack.error));
  });
}

/** Kierowca auta: figura w fotelu 0 albo `undefined`. */
function driverOf(
  tokens: Record<string, TokenView>,
  sceneVehicleId: string,
): TokenView | undefined {
  return Object.values(tokens).find(
    (token) => token.vehicleSeat?.sceneVehicleId === sceneVehicleId && token.vehicleSeat.seat === 0,
  );
}

/** Menu przeszkody u MG: PW, auto, przed którym czeka, odpowiedź za kierowcę, zdjęcie z drogi. */
export function ChaseObstacleMenu() {
  const menu = useChaseStore((s) => s.obstacleMenu);
  const obstacles = useChaseStore((s) => s.obstacles);
  const vehicles = useChaseStore((s) => s.vehicles);
  const close = useChaseStore((s) => s.closeObstacleMenu);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const placement = useMenuTop((menu?.clientY ?? 0) + 12);
  const obstacle = menu ? obstacles.find((entry) => entry.id === menu.obstacleId) : undefined;
  useMenuEscape(menu !== null && obstacle !== undefined && isGm, close);
  if (!menu || !obstacle || !isGm) return null;
  const blocked = obstacle.blockingVehicleId
    ? vehicles.find((entry) => entry.id === obstacle.blockingVehicleId)
    : undefined;
  const left = Math.max(8, Math.min(menu.clientX + 12, window.innerWidth - MENU_WIDTH - 8));
  const act = (run: () => void) => {
    run();
    close();
  };
  return (
    <>
      <div
        className="context-menu-backdrop"
        onClick={close}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div
        ref={placement.ref}
        className="context-menu chase-menu"
        style={{ left, top: placement.top, width: MENU_WIDTH }}
        role="menu"
        aria-label={`Przeszkoda: ${obstacle.name}`}
      >
        <p className="context-menu-title">{obstacle.name}</p>
        <p className="chase-menu-state">{obstacleStateLine(obstacle, blocked)}</p>
        {blocked && (
          <>
            <p className="context-menu-section">{`Za kierowcę: ${blocked.name}`}</p>
            <button
              type="button"
              className="context-menu-item"
              title="Test REF + Prowadzenie przeciw PT 13. Porażka — utrata kontroli i zderzenie."
              onClick={() => act(() => answer(obstacle.id, 'swerve'))}
            >
              Gwałtowny skręt (PT 13)
            </button>
            <button
              type="button"
              className="context-menu-item"
              title={chaseRamText(
                chaseObstacleUnbreakable(obstacle.kind) ? 'concrete' : 'obstacle',
                blocked.ramPlow,
                true,
              )}
              onClick={() => act(() => answer(obstacle.id, 'ram'))}
            >
              Taranuj
            </button>
          </>
        )}
        <button
          type="button"
          className="context-menu-item context-menu-item--danger"
          onClick={() =>
            act(() => {
              void removeChaseObstacle(obstacle.id).then((ack) => {
                if (!ack.ok) notifyRefusal('chase', chaseErrorText(ack.error));
              });
            })
          }
        >
          Zdejmij z drogi
        </button>
      </div>
    </>
  );
}

/** „Barykada · 30/30 PW · czeka na: Furgon Vex” — stan przeszkody jednym wierszem. */
function obstacleStateLine(
  obstacle: ChaseObstacleView,
  blocked: SceneVehicleView | undefined,
): string {
  const kind = CHASE_OBSTACLE_PRESETS[obstacle.kind].label;
  const hp =
    obstacle.kind === 'spikes'
      ? 'po niej się przejeżdża'
      : chaseObstacleUnbreakable(obstacle.kind)
        ? 'beton — nie do rozbicia'
        : `${obstacle.hp}/${obstacle.hpMax} PW`;
  const wait = blocked ? ` · czeka na: ${blocked.name}` : '';
  return `${kind} · ${hp}${wait}`;
}

/**
 * Pasek „Przeszkoda na drodze” (65e): stoi u kierowcy-gracza, przed którego
 * autem przeszkoda stanęła, a u MG — przy aucie, którego kierowcy nie prowadzi
 * żaden gracz (NPC). Jedna sprawa naraz, jak wezwanie do Manewru.
 */
export function useObstacleNotice(): void {
  const obstacles = useChaseStore((s) => s.obstacles);
  const vehicles = useChaseStore((s) => s.vehicles);
  const tokens = useTokenStore((s) => s.tokens);
  const user = useAuthStore((s) => s.user);
  // Przeszkoda MG (65e) albo stojące auto — wrak, zgaszony silnik (przegląd 03.11).
  type Blocker = {
    id: string;
    name: string;
    hp: number;
    kind: 'obstacle' | 'vehicle';
    /** Beton (04.11.2026): taranowanie i nieudany skręt robią z auta wrak. */
    concrete?: boolean;
  };
  const blockers: { blocker: Blocker; vehicleId: string }[] = [
    ...obstacles
      .filter((entry) => entry.blockingVehicleId !== null)
      .map((entry) => ({
        blocker: {
          id: entry.id,
          name: entry.name,
          hp: entry.hp,
          kind: 'obstacle' as const,
          concrete: chaseObstacleUnbreakable(entry.kind),
        },
        vehicleId: entry.blockingVehicleId!,
      })),
    ...vehicles
      .filter((entry) => entry.blockingVehicleId !== null)
      .map((entry) => ({
        blocker: { id: entry.id, name: entry.name, hp: entry.hp, kind: 'vehicle' as const },
        vehicleId: entry.blockingVehicleId!,
      })),
  ];
  let call: { blocker: Blocker; vehicle: SceneVehicleView } | null = null;
  for (const { blocker, vehicleId } of blockers) {
    if (!user) break;
    const vehicle = vehicles.find((entry) => entry.id === vehicleId);
    if (!vehicle) continue;
    const driver = driverOf(tokens, vehicle.id);
    const playerDriven = typeof driver?.ownerId === 'string' && driver.ownerId.length > 0;
    const mine =
      user.role === ROLE_GM ? !playerDriven : driver !== undefined && driver.ownerId === user.id;
    if (mine) {
      call = { blocker, vehicle };
      break;
    }
  }
  const key = call ? `${call.blocker.kind}:${call.blocker.id}:${call.vehicle.id}` : null;
  useEffect(() => {
    if (!call) {
      clearNotices('obstacle');
      return;
    }
    const { blocker, vehicle } = call;
    const run = (choice: ChaseObstacleChoice) =>
      blocker.kind === 'obstacle'
        ? answer(blocker.id, choice)
        : void answerChaseVehicle(blocker.id, choice).then((ack) => {
            if (!ack.ok) notifyRefusal('chase', chaseErrorText(ack.error));
          });
    const hp =
      blocker.kind === 'obstacle'
        ? blocker.concrete
          ? ' (beton)'
          : blocker.hp > 0
            ? ` (${blocker.hp} PW)`
            : ''
        : ` (${blocker.hp > 0 ? 'stoi na drodze' : 'wrak'})`;
    // Stojąca przeszkoda trafia zawsze w przód (dryf na zderzak).
    const ram = chaseRamText(
      blocker.kind === 'obstacle' ? (blocker.concrete ? 'concrete' : 'obstacle') : 'vehicle',
      vehicle.ramPlow,
      true,
    );
    notifyChoice(
      'obstacle',
      blocker.concrete
        ? `Na drodze: ${blocker.name}${hp}. Gwałtowny skręt to Test PT 13 — porażka to utrata kontroli i rozbicie auta. Taranuj: ${ram}`
        : `Na drodze: ${blocker.name}${hp}. Gwałtowny skręt to Test PT 13 — porażka to utrata kontroli i zderzenie. Taranuj: ${ram}`,
      [
        { label: 'Gwałtowny skręt', run: () => run('swerve') },
        { label: 'Taranuj', run: () => run('ram') },
      ],
      { title: vehicle.name },
    );
    // Klucz mówi wszystko, co pasek pokazuje — nowa przeszkoda to nowy pasek.
  }, [key]);
}
