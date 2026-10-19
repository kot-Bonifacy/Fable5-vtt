import type { ScenePoint, TokenJumpOption } from '@vtt/shared';
import { CPRED_DEATH_SAVE_PENDING_MESSAGE } from '@vtt/shared';
import { PLAYER_MOVE_STOP_NOTE } from './map/player-move.js';
import { noteAck, notifyRefusal } from './notices.js';
import { requestJumpOptions, sendTokenJump } from './socket.js';
import { useHudStore, type HudJump } from './stores/hudStore.js';
import { useSceneStore } from './stores/sceneStore.js';
import { useSelectionStore } from './stores/selectionStore.js';
import { useTokenStore } from './stores/tokenStore.js';

/**
 * Skok z paska (zlecenie MG z 19.10.2026) po stronie klienta.
 *
 * Slot „Skok” pyta serwer, dokąd figura może teraz skoczyć
 * (`token:jump-options`) — gracz dostaje ściany bez rodzaju, więc tylko serwer
 * wie, która kreska to bariera do przeskoczenia. Mapa rysuje te pola, klik
 * w jedno skacze, klik gdziekolwiek indziej, `Esc`, prawy klik i zmiana figury
 * odkładają skok. Zasady (koszt, przeszkody, widzenie) są wyłącznie na serwerze.
 */

/** Wszystkie osiem pól zamknięte — zdanie dla gracza, nie kod. */
export const JUMP_NOWHERE_NOTE =
  'Nie ma dokąd skoczyć — każde pole dwie kratki dalej jest za ścianą, zajęte, w osłonie albo poza zasięgiem wzroku.';

/** Odpowiedź, która przyszła po zmianie zdania, nie uzbraja skoku. */
let armTicket = 0;

/**
 * Bierze Skok dla tej figury albo, gdy już jest w ręku, odkłada go — to samo
 * „nieważne”, co drugie naciśnięcie slotu broni.
 */
export async function armJump(tokenId: string): Promise<void> {
  const hud = useHudStore.getState();
  if (hud.jump?.tokenId === tokenId) {
    disarmJump();
    return;
  }
  hud.setForm(null);
  const ticket = ++armTicket;
  const ack = await requestJumpOptions(tokenId);
  if (ticket !== armTicket) return;
  if (!ack.ok || !ack.data) {
    notifyRefusal('action', jumpErrorText(ack.ok ? 'NO_DATA' : ack.error));
    return;
  }
  const { options, refusal } = ack.data;
  if (refusal) {
    notifyRefusal('action', refusal);
    return;
  }
  if (options.length === 0) {
    notifyRefusal('action', JUMP_NOWHERE_NOTE);
    return;
  }
  // Gracz zdążył wziąć inną figurę — skok tamtej nie dotyczy.
  if (useSelectionStore.getState().tokenId !== tokenId) return;
  useHudStore.getState().setJump({ tokenId, options });
}

/** Odkłada skok — także ten, na którego pola jeszcze czekamy. */
export function disarmJump(): void {
  armTicket++;
  if (useHudStore.getState().jump) useHudStore.getState().setJump(null);
}

/** Pole lądowania pod punktem: figura o boku `extentPx` stanęłaby w nim. */
export function jumpOptionAt(
  jump: HudJump,
  extentPx: number,
  point: ScenePoint,
): TokenJumpOption | null {
  return (
    jump.options.find(
      (option) =>
        point.x >= option.x &&
        point.x < option.x + extentPx &&
        point.y >= option.y &&
        point.y < option.y + extentPx,
    ) ?? null
  );
}

/**
 * Klik w mapę ze Skokiem w ręku. Zwraca true, gdy klik należał do skoku —
 * także wtedy, gdy padł obok pól: to odkłada skok, a nie wysyła figurę marszem.
 */
export function jumpAtPoint(worldX: number, worldY: number): boolean {
  const jump = useHudStore.getState().jump;
  if (!jump) return false;
  disarmJump();
  const token = useTokenStore.getState().tokens[jump.tokenId];
  const scene = useSceneStore.getState().scene;
  if (!token || !scene || useSelectionStore.getState().tokenId !== jump.tokenId) return true;
  const option = jumpOptionAt(jump, token.size * scene.grid.sizePx, { x: worldX, y: worldY });
  if (!option) return true;
  void sendTokenJump(jump.tokenId, option.dx, option.dy).then((ack) => {
    if (!noteAck('action', ack, jumpErrorText) || !ack.data) return;
    useTokenStore.getState().applyMove(jump.tokenId, ack.data.x, ack.data.y);
  });
  return true;
}

/** Odmowy `token:jump` i `token:jump-options` po polsku. */
export function jumpErrorText(code: string): string {
  switch (code) {
    case 'MOVE_BLOCKED_BY_TERRAIN':
      return 'Tam nie doskoczysz — ściany, drzwi ani okna nie przeskoczysz, a w osłonie nie wylądujesz.';
    case 'MOVE_BLOCKED_BY_FIGURE':
      return 'Ktoś stoi na drodze — przez wroga nie przeskoczysz, a na zajętym polu nie wylądujesz.';
    case 'MOVE_INTO_FOG':
    case 'JUMP_NOT_VISIBLE':
      return 'Nie widzisz miejsca, w które chcesz skoczyć.';
    case 'JUMP_OFF_MAP':
      return 'Tam kończy się mapa.';
    case 'JUMP_STATUS':
      return 'W tym stanie nie skoczysz.';
    case 'JUMP_NO_METRES':
      return 'Na skok nie starczy ci ruchu.';
    case 'MOVE_PACE':
      return 'Złap oddech — na skok potrzeba więcej metrów z puli. Odnowi się w kilka sekund.';
    case 'MOVE_LOCKED':
      return PLAYER_MOVE_STOP_NOTE;
    case 'NOT_YOUR_TURN':
      return 'To nie jest twoja tura.';
    case 'MOVE_BLOCKED':
      return 'Rana krytyczna zabiera ci Akcję Ruchu w tej turze.';
    case 'DEATH_SAVE_PENDING':
      return CPRED_DEATH_SAVE_PENDING_MESSAGE;
    case 'FORBIDDEN':
      return 'Nie możesz ruszać tym tokenem.';
    case 'TOKEN_NOT_FOUND':
      return 'Nie znaleziono tokenu — odśwież stronę.';
    default:
      return `Skok się nie udał: ${code}.`;
  }
}
