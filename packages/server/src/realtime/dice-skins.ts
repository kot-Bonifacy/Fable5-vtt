import type { DiceSkinId } from '@vtt/shared';
import { isDiceSkinId } from '@vtt/shared';
import { defineEvent, RealtimeError } from './registry.js';

/**
 * The roller's dice skin (stage 27d).
 *
 * Everything else a player can set about their own client — the theme, the
 * typewriter, whether dice animate at all — lives in their browser and stays
 * there. The skin cannot: what the table sees tumbling are *the roller's*
 * dice, so the choice has to reach other people's screens. That makes it the
 * one cosmetic setting the server owns, and `toChatMessageView` stamps it
 * onto every roll card it hands out.
 *
 * The event returns the saved value rather than nothing, so a client that
 * sent something the server refuses to store still ends up in sync.
 */
export const diceSkinEvent = defineEvent<{ skin?: unknown } | undefined, DiceSkinId>({
  name: 'dice:skin',
  handler: async ({ deps, socket, user, payload }) => {
    const skin = payload?.skin;
    if (!isDiceSkinId(skin)) throw new RealtimeError('UNKNOWN_DICE_SKIN');
    await deps.ctx.prisma.user.update({ where: { id: user.id }, data: { diceSkin: skin } });
    // The socket carries its own copy of the session user; without this the
    // rest of the connection would keep answering with the old skin.
    socket.data.user = { ...socket.data.user, diceSkin: skin };
    return skin;
  },
});
