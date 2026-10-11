import type { SessionUser, TokenAimBroadcast, TokenAimPayload } from '@vtt/shared';
import { ROLE_GM, sanitizeFacing } from '@vtt/shared';
import type { Scene, Token } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { campaignRoom } from './state.js';
import {
  type Concealment,
  concealedFrom,
  concealmentFor,
  requireCampaignToken,
  requireTokenControl,
} from './tokens.js';
import { loadVisionContext, type SceneVisionContext } from './vision.js';

/**
 * Grot strzelca widzi cały stół (03.10, zlecenie MG: „to zwiększy interakcję
 * między graczami i pokaże, w którą stronę patrzy w danej chwili dana postać”).
 *
 * Ulotne jak linijka i ping: kąt celowania nie trafia do bazy, nie dostaje
 * `seq` i nie wraca przy resynchronizacji. Zapisuje go dopiero strzał
 * (`turnTokenToward`, 27j) — wycelowanie to jeszcze nie decyzja, więc po zdjęciu
 * celownika figura wraca do kąta z serwera.
 *
 * Widownia to ci, którzy **widzą figurę** — ta sama miara co przy `token:upsert`
 * (ukryta tylko MG, mgła i pole widzenia po swojemu dla każdego gracza). Kto
 * dostał grot, ten dostanie też jego zdjęcie, nawet gdy figura zniknęła mu
 * z oczu w międzyczasie: inaczej zostałaby u niego obrócona na zawsze.
 */

interface LiveAim {
  sceneId: string;
  tokenId: string;
  /** Gniazda, które dostały ten grot — im należy się jego zdjęcie. */
  audience: Set<string>;
}

/** Kto teraz celuje, po id gniazda. Gniazdo ma jeden celownik, więc jeden wpis. */
const liveAims = new Map<string, LiveAim>();

type AimSocket = {
  id: string;
  data: { user: SessionUser; viewedSceneId: string | null };
  emit: (event: 'token:aim', broadcast: TokenAimBroadcast) => boolean;
};

/** Gniazda, które widzą tę figurę na tej scenie — poza celującym. */
async function aimAudience(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  token: Token,
  senderId: string,
): Promise<AimSocket[]> {
  return (await sceneAudience(deps, campaignId, scene, [token], senderId)) as AimSocket[];
}

/** Gniazdo widza z tym, czego potrzebuje rachunek widowni. */
export type AudienceSocket = {
  id: string;
  data: { user: SessionUser; viewedSceneId: string | null };
};

/**
 * Gniazda oglądające scenę, które widzą **każdą** z podanych figur — ta sama
 * miara co przy `token:upsert` (ukryta tylko MG, mgła i pole widzenia po swojemu
 * dla każdego gracza, kontrolerzy figury zawsze). Grot (`token:aim`) pyta o
 * jedną figurę, trwały cel (`token:target`, etap 50c) o strzelca i cel naraz.
 * `senderId` pomija nadawcę; null — nikogo.
 */
export async function sceneAudience(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  tokens: readonly Token[],
  senderId: string | null,
): Promise<AudienceSocket[]> {
  const sockets = (await deps.io
    .in(campaignRoom(campaignId))
    .fetchSockets()) as unknown as AudienceSocket[];
  const viewers = sockets.filter(
    (member) => member.id !== senderId && member.data.viewedSceneId === scene.id,
  );
  if (viewers.every((member) => member.data.user.role === ROLE_GM)) return viewers;

  const controllers = new Map<string, Set<string>>();
  for (const token of tokens) {
    const ids = new Set<string>();
    if (token.ownerId) ids.add(token.ownerId);
    if (token.characterId) {
      const character = await deps.ctx.prisma.character.findUnique({
        where: { id: token.characterId },
        select: { ownerId: true },
      });
      if (character?.ownerId) ids.add(character.ownerId);
    }
    controllers.set(token.id, ids);
  }
  // Ściany są te same dla każdego — liczone raz, jak w `emitSceneTokensToPlayers`.
  let context: SceneVisionContext | undefined;
  const audience: AudienceSocket[] = [];
  for (const member of viewers) {
    const user = member.data.user;
    if (user.role === ROLE_GM) {
      audience.push(member);
      continue;
    }
    let concealment: Concealment | undefined;
    let seesAll = true;
    for (const token of tokens) {
      if (controllers.get(token.id)?.has(user.id)) continue;
      if (token.hidden) {
        seesAll = false;
        break;
      }
      context ??= await loadVisionContext(deps.ctx.prisma, scene);
      concealment ??= await concealmentFor(deps.ctx.prisma, scene, user, context);
      if (concealedFrom(token, scene, concealment, null, user.id)) {
        seesAll = false;
        break;
      }
    }
    if (seesAll) audience.push(member);
  }
  return audience;
}

/** Zdejmuje grot, który rozesłało to gniazdo — ze zmianą celu, sceny albo z rozłączeniem. */
export function releaseSocketAim(deps: RealtimeDeps, socketId: string): void {
  const live = liveAims.get(socketId);
  if (!live) return;
  liveAims.delete(socketId);
  if (live.audience.size === 0) return;
  const broadcast: TokenAimBroadcast = {
    sceneId: live.sceneId,
    tokenId: live.tokenId,
    facing: null,
  };
  deps.io.to([...live.audience]).emit('token:aim', broadcast);
}

export const tokenAimEvent = defineEvent<TokenAimPayload, void>({
  name: 'token:aim',
  handler: async ({ deps, socket, user, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    const facing = sanitizeFacing(payload?.facing);
    if (facing === undefined) throw new RealtimeError('BAD_REQUEST');
    if (typeof payload?.tokenId !== 'string' || payload.tokenId.length === 0) {
      throw new RealtimeError('BAD_REQUEST');
    }

    // Zdjęcie celownika niczego nie sprawdza: zdejmuje grot tego gniazda (ma
    // jeden celownik) i idzie tylko do tych, którzy go dostali. Figura mogła
    // w międzyczasie zniknąć, a celujący — przejść na inną scenę; zdjęcie i tak
    // musi dojść.
    if (facing === null) {
      releaseSocketAim(deps, socket.id);
      return;
    }

    const { token, scene } = await requireCampaignToken(
      deps.ctx.prisma,
      campaign.id,
      payload.tokenId,
    );
    await requireTokenControl(deps.ctx.prisma, user, token);
    // Celuje się na mapie, na którą się patrzy — jak przy pingu i linijce.
    if (socket.data.viewedSceneId !== scene.id) throw new RealtimeError('SCENE_NOT_VIEWED');

    const previous = liveAims.get(socket.id);
    if (previous && previous.tokenId !== token.id) releaseSocketAim(deps, socket.id);

    const audience = await aimAudience(deps, campaign.id, scene, token, socket.id);
    const broadcast: TokenAimBroadcast = { sceneId: scene.id, tokenId: token.id, facing };
    const reached = new Set<string>();
    for (const member of audience) {
      member.emit('token:aim', broadcast);
      reached.add(member.id);
    }
    // Kto widział grot poprzednio, a teraz figury nie widzi, dostaje zdjęcie —
    // inaczej u niego figura patrzyłaby w stary cel do następnego ruchu.
    const kept = liveAims.get(socket.id);
    if (kept) {
      const lost = [...kept.audience].filter((id) => !reached.has(id));
      if (lost.length > 0) deps.io.to(lost).emit('token:aim', { ...broadcast, facing: null });
    }
    liveAims.set(socket.id, {
      sceneId: scene.id,
      tokenId: token.id,
      audience: reached,
    });
  },
});
