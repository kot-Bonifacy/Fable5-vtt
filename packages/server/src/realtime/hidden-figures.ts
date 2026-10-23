import type { ScenePoint, SessionUser } from '@vtt/shared';
import {
  ZONE_SPOT_RANGE_M,
  cpredCheckBase,
  cpredHidingDv,
  cpredHidingDvText,
  CPRED_STEALTH_SKILL_ID,
  distanceToRect,
  metresPerPixel,
  parseCharacterData,
  readTokenSightings,
  tokenTableName,
  writeTokenSightings,
  zoneWithinReachOfPath,
} from '@vtt/shared';
import type { Scene, Token } from '../generated/prisma/client.js';
import { containerTokenIds } from './containers.js';
import { createMixedRng } from './dice-rng.js';
import type { HiddenSpot } from './hidden-notice.js';
import { rollSecretPerception } from './character-rolls.js';
import type { RealtimeDeps } from './registry.js';
import { toSceneView } from './scenes.js';
import { emitTokenUpsert } from './tokens.js';
import { controllerOf, systemHand } from './zone-effects.js';
import { logGmZoneLine } from './zones.js';

/**
 * Ukryta figura przeciw Percepcji (etap 58d, decyzja MG 7 z 22.10).
 *
 * Postać gracza, która dochodzi na cztery metry do figury ukrytej przez MG,
 * rzuca w ukryciu Test Percepcji — ten sam haczyk co strefa z 58a
 * (`hiddenNoticeDue` w `hidden-notice.ts`): porażka nie zatrzymuje marszu,
 * sukces zatrzymuje i pokazuje rzut (24.10). PT to rzut Skradania figury
 * (ZW + Skradanie + 1k10, `cpredHidingDv`) z tej samej chwili; figura bez karty
 * bierze PT od MG (`Token.spotDv`), a bez karty i bez PT nie rzuca się wcale.
 *
 * Sukces odsłania figurę **temu kontu** (`Token.sightings.users`, filtr
 * w `fetchSceneTokensFor`), raz na postać (`tried`), dopóki figura stoi —
 * ruch figury zeruje listę (`performTokenMove`), bo to nowa kryjówka.
 *
 * Rzucają tylko figury graczy, i tylko przeciw figurom MG: strażnik wie, gdzie
 * stoją jego koledzy, a pojemnik nie skrada się wcale.
 */

/**
 * Ukryte figury sceny, które da się zauważyć Testem: prowadzone przez MG, nie
 * pojemniki, z kartą albo z PT od MG. Jedno zapytanie, gdy nikt się nie kryje
 * — pytanie pada przy każdej klatce marszu gracza.
 */
async function hidersOnScene(
  deps: RealtimeDeps,
  sceneId: string,
  spotter: Token,
): Promise<Token[]> {
  const rows = await deps.ctx.prisma.token.findMany({
    where: { sceneId, hidden: true, ownerId: null, id: { not: spotter.id } },
    include: { character: { select: { ownerId: true } } },
  });
  if (rows.length === 0) return [];
  const npc = rows.filter((row) => !row.character?.ownerId);
  const candidates = npc.filter((row) => row.characterId !== null || row.spotDv !== null);
  if (candidates.length === 0) return [];
  const containers = await containerTokenIds(deps.ctx.prisma, candidates);
  return candidates
    .filter((row) => !containers.has(row.id))
    .map(({ character: _character, ...token }) => token);
}

/** Podstawa Skradania z karty figury (ZW + Skradanie); `null` — bez karty. */
async function stealthOf(
  deps: RealtimeDeps,
  token: Token,
): Promise<{ total: number; label: string } | null> {
  if (!token.characterId) return null;
  const character = await deps.ctx.prisma.character.findUnique({
    where: { id: token.characterId },
  });
  if (!character) return null;
  const base = cpredCheckBase(parseCharacterData(character.data, deps.ctx.cpred), deps.ctx.cpred, {
    skillId: CPRED_STEALTH_SKILL_ID,
    skillLabel: 'Skradanie',
    statId: 'dex',
  });
  return { total: base.total, label: base.label };
}

/** Prostokąt figury w pikselach sceny — do miary „cztery metry od niej”. */
function figureRect(token: Pick<Token, 'x' | 'y' | 'size'>, scene: Scene) {
  const side = token.size * scene.gridSizePx;
  return { x: token.x, y: token.y, width: side, height: side };
}

/** Zasięg Percepcji tej sceny w pikselach — te same 4 m co przy strefie. */
function spotRangePx(scene: Scene): number {
  const perPixel = metresPerPixel(toSceneView(scene));
  return perPixel > 0 ? ZONE_SPOT_RANGE_M / perPixel : 0;
}

function halfOf(token: Pick<Token, 'size'>, scene: Scene): number {
  return (token.size * scene.gridSizePx) / 2;
}

/** Czy ta postać ma jeszcze szansę zauważyć tę figurę. */
function untried(hider: Token, ownerId: string, key: string): boolean {
  const sightings = readTokenSightings(hider.sightings);
  return !sightings.users.includes(ownerId) && !sightings.tried.includes(key);
}

/**
 * Czy na tym polu figurze należy się rzut przeciw ukrytej figurze (58d) —
 * pytanie z klatki marszu, więc najpierw tanie odpowiedzi. Odbija pomijania
 * `spotFigure`.
 */
export async function hiddenFiguresNoticeDue(
  deps: RealtimeDeps,
  _campaignId: string,
  scene: Scene,
  token: Token,
  stand: ScenePoint,
): Promise<boolean> {
  const hiders = await hidersOnScene(deps, scene.id, token);
  if (hiders.length === 0) return false;
  const half = halfOf(token, scene);
  const centre = { x: stand.x + half, y: stand.y + half };
  const rangePx = spotRangePx(scene);
  const near = hiders.filter(
    (hider) => distanceToRect(centre, figureRect(hider, scene)) <= rangePx,
  );
  if (near.length === 0) return false;
  const ownerId = await controllerOf(deps, token);
  if (!ownerId) return false;
  const key = token.characterId ?? token.id;
  return near.some((hider) => untried(hider, ownerId, key));
}

/**
 * Po lądowaniu (`performTokenMove`, obok `runZonesAfterMove`): Percepcja przeciw
 * każdej ukrytej figurze, obok której przeszła ta figura — z całej drogi, jak
 * strefa w 58a, bo lądowanie bez trasy (MG, skok) nie zna zatrzymania.
 */
export async function runHiddenFiguresAfterMove(
  deps: RealtimeDeps,
  input: {
    campaignId: string;
    user: SessionUser;
    scene: Scene;
    token: Token;
    from: ScenePoint;
    to: ScenePoint;
    path: readonly ScenePoint[];
  },
): Promise<HiddenSpot[]> {
  const half = halfOf(input.token, input.scene);
  const walked = [input.from, ...input.path, input.to].map((point) => ({
    x: point.x + half,
    y: point.y + half,
  }));
  return spotHiddenFigures(deps, { ...input, walked });
}

/**
 * Ukryte figury w zasięgu Percepcji tej drogi (`walked` — środki figury) —
 * każda raz na postać, rzutem serwera w ukryciu (24.10, zlecenie MG).
 */
export async function spotHiddenFigures(
  deps: RealtimeDeps,
  input: {
    campaignId: string;
    user: SessionUser;
    scene: Scene;
    token: Token;
    walked: readonly ScenePoint[];
  },
): Promise<HiddenSpot[]> {
  const { campaignId, user, scene, token } = input;
  const hiders = await hidersOnScene(deps, scene.id, token);
  if (hiders.length === 0) return [];
  const rangePx = spotRangePx(scene);
  const spots: HiddenSpot[] = [];
  for (const hider of hiders) {
    if (!zoneWithinReachOfPath(figureRect(hider, scene), input.walked, rangePx)) continue;
    const spot = await spotFigure(deps, campaignId, scene, hider, token, user);
    if (spot) spots.push(spot);
  }
  return spots;
}

/**
 * Jedna szansa tej postaci przeciw tej figurze: ukryty Test Percepcji
 * (`rollSecretPerception`) przeciw rzutowi Skradania figury z tej chwili.
 * Postać idzie na listę `tried` w każdym wypadku. Wynik zna MG; sukces
 * wraca jako `HiddenSpot`, który pokaże `showHiddenSpots`.
 */
async function spotFigure(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  hider: Token,
  spotter: Token,
  user: SessionUser,
): Promise<HiddenSpot | null> {
  const ownerId = await controllerOf(deps, spotter);
  if (!ownerId) return null;
  const key = spotter.characterId ?? spotter.id;
  if (!untried(hider, ownerId, key)) return null;
  const hiding = cpredHidingDv(
    { stealth: await stealthOf(deps, hider), spotDv: hider.spotDv },
    createMixedRng(),
  );
  if (!hiding) return null;

  const sightings = readTokenSightings(hider.sightings);
  await deps.ctx.prisma.token.update({
    where: { id: hider.id },
    data: { sightings: writeTokenSightings({ ...sightings, tried: [...sightings.tried, key] }) },
  });

  const roll = await rollSecretPerception(deps, spotter, hiding.dv);
  const success = roll?.outcome?.success === true && (await addSpotter(deps, hider.id, ownerId));
  const verdict = roll ? `wynik ${roll.total}` : 'bez rzutu';
  await logGmZoneLine(
    deps,
    campaignId,
    await systemHand(deps, campaignId, user),
    tokenTableName(spotter, spotter.name),
    'Percepcja — ukryta figura w pobliżu',
    `${verdict} vs ${cpredHidingDvText(hiding)} — ${success ? 'zauważa' : 'nie zauważa'}: ${hider.name}`,
  );
  if (!success || !roll) return null;
  return {
    name: tokenTableName(hider, hider.name),
    ownerId,
    roll,
    // MG — „zauważona”; gracze — listy figur (ukryta z zauważającymi idzie
    // `emitSceneTokensToPlayers`), a przez `checkSighting` na ich końcu walka z 56.
    reveal: async () => {
      const fresh = await deps.ctx.prisma.token.findUnique({ where: { id: hider.id } });
      if (fresh) await emitTokenUpsert(deps, campaignId, scene, fresh);
    },
  };
}

/** Dopisuje konto do zauważających — świeży odczyt, bo lista prób już się zmieniła. */
async function addSpotter(deps: RealtimeDeps, hiderId: string, ownerId: string): Promise<boolean> {
  const fresh = await deps.ctx.prisma.token.findUnique({ where: { id: hiderId } });
  if (!fresh || !fresh.hidden) return false;
  const sightings = readTokenSightings(fresh.sightings);
  if (sightings.users.includes(ownerId)) return false;
  await deps.ctx.prisma.token.update({
    where: { id: hiderId },
    data: {
      sightings: writeTokenSightings({ ...sightings, users: [...sightings.users, ownerId] }),
    },
  });
  return true;
}
