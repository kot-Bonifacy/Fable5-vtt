import type {
  SessionUser,
  TokenTargetBroadcast,
  TokenTargetPayload,
  TokenTargetView,
} from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { sceneAudience } from './aim.js';
import {
  concealedFrom,
  concealmentFor,
  requireCampaignToken,
  requireTokenControl,
} from './tokens.js';

/**
 * Trwały cel wzorem Foundry (etap 50c, decyzje MG z 10.10 i 11.10).
 *
 * `T` nad figurą albo podwójny prawy klik mówi „prowadzona figura mierzy
 * w tamtą”. Cel należy do **figury-strzelca**, nie do konta: Bandzior mierzy
 * w Kowala, Snajper w Olę, a MG przełącza figury i cele zostają przy nich.
 * Stół widzi go istniejącym grotem — klient obraca grot strzelca na cel
 * i trzyma go tak, dopóki cel trwa, także gdy któraś figura się przesunie.
 *
 * Wzorem `token:aim` cel nie trafia do bazy i nie dostaje `seq`: żyje w pamięci
 * serwera, przychodzi w `state:sync` (F5, zmiana sceny u MG) i znika z restartem.
 * Schodzi przy zmianie aktywnej sceny, końcu walki i skasowaniu którejś
 * z figur — strzał go nie zużywa (decyzja MG z 11.10).
 *
 * Widownia to ci, którzy widzą **obie** figury: id celu, którego ktoś nie
 * widzi, nie może do niego dojść. Kto dostał cel, ten dostanie jego zdjęcie.
 */

interface LiveTarget {
  campaignId: string;
  sceneId: string;
  targetId: string;
  /** Gniazda, które znają ten cel — im należy się jego zdjęcie. */
  audience: Set<string>;
}

/** Trwałe cele po id figury-strzelca. Figura ma jeden cel (decyzja MG z 11.10). */
const liveTargets = new Map<string, LiveTarget>();

type TargetSocket = {
  id: string;
  data: { user: SessionUser; viewedSceneId: string | null };
  emit: (event: 'token:target', broadcast: TokenTargetBroadcast) => boolean;
};

function emitRelease(deps: RealtimeDeps, tokenId: string, live: LiveTarget): void {
  if (live.audience.size === 0) return;
  const broadcast: TokenTargetBroadcast = { sceneId: live.sceneId, tokenId, targetId: null };
  deps.io.to([...live.audience]).emit('token:target', broadcast);
}

/** Zdejmuje cel figury, jeśli go ma — i mówi o tym tym, którzy go znali. */
function releaseTarget(deps: RealtimeDeps, tokenId: string): void {
  const live = liveTargets.get(tokenId);
  if (!live) return;
  liveTargets.delete(tokenId);
  emitRelease(deps, tokenId, live);
}

/** Zdejmuje cele spełniające warunek (scena przestała być aktywna, walka się skończyła). */
function releaseTargetsWhere(
  deps: RealtimeDeps,
  match: (tokenId: string, live: LiveTarget) => boolean,
): void {
  for (const [tokenId, live] of [...liveTargets]) {
    if (match(tokenId, live)) releaseTarget(deps, tokenId);
  }
}

/** Koniec walki na scenie zdejmuje jej cele (decyzja MG z 10.10). */
export function releaseSceneTargets(deps: RealtimeDeps, sceneId: string): void {
  releaseTargetsWhere(deps, (_tokenId, live) => live.sceneId === sceneId);
}

/** Zmiana aktywnej sceny zdejmuje cele z każdej innej sceny kampanii. */
export function releaseTargetsOffScene(
  deps: RealtimeDeps,
  campaignId: string,
  activeSceneId: string,
): void {
  releaseTargetsWhere(
    deps,
    (_tokenId, live) => live.campaignId === campaignId && live.sceneId !== activeSceneId,
  );
}

/** Skasowana figura nie mierzy i nie jest celem. */
export function releaseTokenTargets(deps: RealtimeDeps, tokenId: string): void {
  releaseTargetsWhere(deps, (shooter, live) => shooter === tokenId || live.targetId === tokenId);
}

/**
 * Cele sceny dla jednego widza do `state:sync` — tylko pary, z których widzi
 * obie figury (stoją w jego, już przefiltrowanej, liście). Gniazdo trafia do
 * widowni każdego celu, który dostało, żeby dostać też jego zdjęcie.
 */
export function targetsForSync(
  socketId: string,
  sceneId: string,
  visibleTokenIds: ReadonlySet<string>,
): TokenTargetView[] {
  const views: TokenTargetView[] = [];
  for (const [tokenId, live] of liveTargets) {
    if (live.sceneId !== sceneId) continue;
    if (!visibleTokenIds.has(tokenId) || !visibleTokenIds.has(live.targetId)) continue;
    live.audience.add(socketId);
    views.push({ tokenId, targetId: live.targetId });
  }
  return views;
}

export const tokenTargetEvent = defineEvent<TokenTargetPayload, TokenTargetBroadcast>({
  name: 'token:target',
  handler: async ({ deps, socket, user, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    const targetId = payload?.targetId;
    if (targetId !== null && (typeof targetId !== 'string' || targetId.length === 0)) {
      throw new RealtimeError('BAD_REQUEST');
    }

    const { token, scene } = await requireCampaignToken(
      deps.ctx.prisma,
      campaign.id,
      payload?.tokenId,
    );
    await requireTokenControl(deps.ctx.prisma, user, token);
    // Mierzy się na mapie, na którą się patrzy — jak przy grocie i pingu.
    if (socket.data.viewedSceneId !== scene.id) throw new RealtimeError('SCENE_NOT_VIEWED');

    if (targetId === null) {
      releaseTarget(deps, token.id);
      return { sceneId: scene.id, tokenId: token.id, targetId: null };
    }
    if (targetId === token.id) throw new RealtimeError('BAD_REQUEST');

    // Cel spoza sceny, ukryty albo schowany przed graczem we mgle czy za ścianą
    // odmawia się tak samo jak nieistniejący — odmowa nie może zdradzić figury.
    const { token: target } = await requireCampaignToken(deps.ctx.prisma, campaign.id, targetId);
    if (target.sceneId !== scene.id) throw new RealtimeError('TOKEN_NOT_FOUND');
    if (user.role !== ROLE_GM) {
      if (target.hidden) throw new RealtimeError('TOKEN_NOT_FOUND');
      const concealment = await concealmentFor(deps.ctx.prisma, scene, user);
      if (concealedFrom(target, scene, concealment, null, user.id)) {
        throw new RealtimeError('TOKEN_NOT_FOUND');
      }
    }

    const broadcast: TokenTargetBroadcast = {
      sceneId: scene.id,
      tokenId: token.id,
      targetId: target.id,
    };
    const audience = (await sceneAudience(
      deps,
      campaign.id,
      scene,
      [token, target],
      null,
    )) as TargetSocket[];
    const reached = new Set<string>();
    for (const member of audience) {
      member.emit('token:target', broadcast);
      reached.add(member.id);
    }
    // Kto znał poprzedni cel, a nowego nie widzi, dostaje zdjęcie — inaczej
    // grot strzelca wskazywałby u niego stary cel.
    const previous = liveTargets.get(token.id);
    if (previous) {
      const lost = [...previous.audience].filter((id) => !reached.has(id));
      if (lost.length > 0) {
        deps.io.to(lost).emit('token:target', { ...broadcast, targetId: null });
      }
    }
    liveTargets.set(token.id, {
      campaignId: campaign.id,
      sceneId: scene.id,
      targetId: target.id,
      audience: reached,
    });
    return broadcast;
  },
});
