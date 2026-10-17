import type { Server as SocketIOServer } from 'socket.io';

/**
 * Gniazda konta administratora (etap 53). Admin nie siada przy żadnym stole,
 * więc nie ma tu stanu gry — tylko sygnał „coś się zmieniło”, po którym panel
 * dociąga trasy `/api/admin/…`. Bez ładunku: widok i tak liczy serwer, a sam
 * sygnał niczego nie zdradza.
 */
export const ADMIN_ROOM = 'admin';

export function notifyAdmins(io: SocketIOServer): void {
  io.to(ADMIN_ROOM).emit('admin:changed');
}
