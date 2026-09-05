/**
 * Zegar świata kampanii (etap 37) — rdzeń VTT.
 *
 * Ten moduł **nie wie, czym są Punkty Wytrzymałości ani eurodolce** i to jest
 * jego jedyna reguła architektoniczna. Przesuwa jedną liczbę na `Campaign`,
 * rozgłasza ją i odkłada kartę na czacie; wszystko, co z upływu czasu wynika
 * — rozliczenie miesiąca, doba odpoczynku — dzieje się dalej, w module, który
 * zna system RPG, i **wyłącznie na kliknięcie MG**.
 *
 * Zasada „zegar podpowiada, nie rządzi" (decyzja MG z 05.09.2026) jest tu
 * widoczna jako brak: nie ma żadnego wywołania `economy:settle`, żadnego
 * leczenia i żadnego tykania w tle. Serwer, który sam sobie przesuwa zegar,
 * obudziłby się po nocy z rozliczonym miesiącem, którego nikt nie rozegrał.
 */

import type { GameTimeAck, GameTimeBroadcast, GameTimeSetPayload, TimeLogEntry } from '@vtt/shared';
import {
  GAME_TIME_DEFAULT,
  ROLE_GM,
  applyGameTimeStep,
  formatGameDayTime,
  gameDaysBetween,
  gameMonthKey,
  isGameTime,
  isGameTimeStepId,
  timeLogTitle,
} from '@vtt/shared';
import type { GameTimeState } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { campaignRoom } from './state.js';
import { INCLUDE_CHAT_NAMES, broadcastChatMessage, toChatMessageView } from './chat-io.js';

/**
 * Stan zegara jednej kampanii; brak kampanii daje domyślny start.
 *
 * Wiersz zapisany przed tym etapem — albo ręką — musi dać czytelny zegar tak
 * samo, jak `campaignShopTier` musi dać czytelny poziom sklepu: kalendarz nie
 * ma prawa pokazać roku 1970 przez jedną liczbę spoza zakresu.
 */
export async function campaignGameTime(
  prisma: PrismaClient,
  campaignId: string | null,
): Promise<GameTimeState> {
  if (!campaignId) return { minutes: GAME_TIME_DEFAULT, settledMonth: null };
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { gameTime: true, settledMonth: true },
  });
  return {
    minutes: isGameTime(campaign?.gameTime) ? campaign.gameTime : GAME_TIME_DEFAULT,
    settledMonth: campaign?.settledMonth ?? null,
  };
}

/** Rozgłasza nowy stan zegara całemu pokojowi kampanii. */
export function broadcastGameTime(
  deps: RealtimeDeps,
  campaignId: string,
  time: GameTimeState,
): void {
  const room = campaignRoom(campaignId);
  const broadcast: GameTimeBroadcast = { seq: deps.seqs.next(room), time };
  deps.io.to(room).emit('time:set', broadcast);
}

/**
 * Stempluje rozliczony miesiąc i rozsyła zegar (woła `economy:settle`).
 *
 * Tu, a nie w module ekonomii, bo pilnuje tego jedna kolumna i jedno pojęcie:
 * „ten miesiąc świata jest już rozliczony". Ekonomia wie, ile komu zabrać —
 * kalendarz wie, kiedy przestać o to pytać.
 */
export async function markMonthSettled(deps: RealtimeDeps, campaignId: string): Promise<void> {
  const state = await campaignGameTime(deps.ctx.prisma, campaignId);
  const month = gameMonthKey(state.minutes);
  if (state.settledMonth === month) return;
  await deps.ctx.prisma.campaign.update({
    where: { id: campaignId },
    data: { settledMonth: month },
  });
  broadcastGameTime(deps, campaignId, { ...state, settledMonth: month });
}

/**
 * MG przesuwa zegar: skokiem z katalogu albo ustawiając chwilę wprost.
 *
 * Skok liczy **serwer** z identyfikatora („+1 h" to intencja, nie arytmetyka),
 * a ustawienie wprost przyjmuje liczbę minut i sprawdza ją `isGameTime` — bez
 * przycinania, bo przycięta data ukryłaby błąd za działającym polem.
 *
 * Cofnięcie zegara jest dozwolone i **niczego nie odwraca**: pobrany czynsz
 * zostaje pobrany, wyleczone PW wyleczone, a `settledMonth` się nie zmienia.
 * Karta czatu mówi to wprost, bo jedyną szkodą byłoby przekonanie MG, że
 * cofnięcie coś naprawia.
 */
export const timeSetEvent = defineEvent<GameTimeSetPayload, GameTimeAck>({
  name: 'time:set',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');

    const before = await campaignGameTime(deps.ctx.prisma, campaign.id);
    const step = payload?.step;
    let minutes: number;
    if (step !== undefined) {
      if (!isGameTimeStepId(step)) throw new RealtimeError('BAD_REQUEST');
      minutes = applyGameTimeStep(before.minutes, step);
    } else if (isGameTime(payload?.minutes)) {
      minutes = payload.minutes;
    } else {
      throw new RealtimeError('BAD_REQUEST');
    }

    // Zegar postawiony tam, gdzie już stoi, nie jest skokiem: karta „Minęło
    // zero minut" byłaby szumem w dzienniku sesji.
    if (minutes === before.minutes) return { time: before, days: 0 };

    await deps.ctx.prisma.campaign.update({
      where: { id: campaign.id },
      data: { gameTime: minutes },
    });
    const after: GameTimeState = { ...before, minutes };
    broadcastGameTime(deps, campaign.id, after);

    const backwards = minutes < before.minutes;
    const entry: TimeLogEntry = {
      title: timeLogTitle(step ?? null, backwards),
      // Bez minut — dla wszystkich, także dla MG. Karta jest **cezurą**
      // („minęła noc"), a nie stemplem czasu: dokładna godzina mieszka w oknie
      // zegara, gdzie da się ją zmienić, a nie w dzienniku sesji, gdzie zostaje
      // na zawsze. Zostawienie jej tutaj odsłoniłoby też to, co pasek chowa.
      from: formatGameDayTime(before.minutes),
      to: formatGameDayTime(minutes),
      days: gameDaysBetween(before.minutes, minutes),
      ...(backwards ? { backwards: true } : {}),
    };
    const stored = await deps.ctx.prisma.chatMessage.create({
      data: {
        campaignId: campaign.id,
        authorId: user.id,
        kind: 'time',
        text: entry.title,
        payload: JSON.stringify(entry),
        ...(socket.data.viewedSceneId ? { sceneId: socket.data.viewedSceneId } : {}),
      },
      include: INCLUDE_CHAT_NAMES,
    });
    broadcastChatMessage(deps, campaign.id, toChatMessageView(stored));

    return { time: after, days: entry.days };
  },
});
