import type { ScenePoint, SessionUser } from '@vtt/shared';
import {
  ZONE_SPOT_RANGE_M,
  cpredAmmoCheckOutcome,
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
  type CpredHidingDv,
} from '@vtt/shared';
import type { Scene, Token } from '../generated/prisma/client.js';
import { createCheckCall, type CheckFrame } from './checks.js';
import { containerTokenIds } from './containers.js';
import { createMixedRng } from './dice-rng.js';
import { emitHiddenSpotted } from './hidden-notice.js';
import type { RealtimeDeps } from './registry.js';
import { toSceneView } from './scenes.js';
import { emitTokenUpsert } from './tokens.js';
import {
  CPRED_PERCEPTION_SKILL_ID,
  checkPerceptionOf,
  controllerOf,
  systemHand,
} from './zone-effects.js';
import { campaignGmHand, logGmZoneLine } from './zones.js';

/**
 * Ukryta figura przeciw Percepcji (etap 58d, decyzja MG 7 z 22.10).
 *
 * Postać gracza, która dochodzi na cztery metry do figury ukrytej przez MG,
 * staje i rzuca Test Percepcji z kubka — ten sam haczyk co strefa z 58a
 * (`hiddenNoticeDue` w `hidden-notice.ts`), ta sama droga wezwania i ta sama
 * blokada ruchu do rzutu. PT to rzut Skradania figury (ZW + Skradanie + 1k10,
 * `cpredHidingDv`), który serwer rzuca w chwili wezwania; figura bez karty
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
 * `callSpotFigure`: zatrzymanie bez rzutu stawiałoby gracza na darmo.
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
 * Zwraca nazwy figur, które odsłonił rzut serwera (figura gracza bez karty).
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
): Promise<string[]> {
  const { campaignId, user, scene, token } = input;
  const hiders = await hidersOnScene(deps, scene.id, token);
  if (hiders.length === 0) return [];
  const half = halfOf(token, scene);
  const walked = [input.from, ...input.path, input.to].map((point) => ({
    x: point.x + half,
    y: point.y + half,
  }));
  const rangePx = spotRangePx(scene);
  const spotted: string[] = [];
  for (const hider of hiders) {
    if (!zoneWithinReachOfPath(figureRect(hider, scene), walked, rangePx)) continue;
    if (await callSpotFigure(deps, campaignId, scene, hider, token, user)) {
      spotted.push(tokenTableName(hider, hider.name));
    }
  }
  return spotted;
}

/**
 * Jedna szansa tej postaci przeciw tej figurze. Postać idzie na listę `tried`
 * **od razu**, jak przy strefie: samo wezwanie jest szansą, a odwołane przez
 * MG — jego rozstrzygnięciem. Figura gracza bez karty nie ma kubka, więc
 * rzuca za nią serwer w ukryciu (zwraca true przy sukcesie).
 */
async function callSpotFigure(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  hider: Token,
  spotter: Token,
  user: SessionUser,
): Promise<boolean> {
  const ownerId = await controllerOf(deps, spotter);
  if (!ownerId) return false;
  const key = spotter.characterId ?? spotter.id;
  if (!untried(hider, ownerId, key)) return false;
  const hiding = cpredHidingDv(
    { stealth: await stealthOf(deps, hider), spotDv: hider.spotDv },
    createMixedRng(),
  );
  if (!hiding) return false;

  const sightings = readTokenSightings(hider.sightings);
  await deps.ctx.prisma.token.update({
    where: { id: hider.id },
    data: { sightings: writeTokenSightings({ ...sightings, tried: [...sightings.tried, key] }) },
  });

  if (!spotter.characterId) {
    return serverSpot(deps, campaignId, scene, hider, spotter, ownerId, hiding, user);
  }
  // Karta jak każde wezwanie MG (uwaga MG z 23.10): Percepcja i PT, bez słowa
  // o tym, że to rzut przeciw komuś — „druga strona: 12 + 1k10” zdradzałaby
  // czającego się, zanim gracz zda Test.
  const frame: CheckFrame = { dv: hiding.dv, modifier: 0, visibility: 'gm' };
  await createCheckCall(deps, {
    campaignId,
    user: await systemHand(deps, campaignId, user),
    characterId: spotter.characterId,
    request: { kind: 'skill', skillId: CPRED_PERCEPTION_SKILL_ID },
    frame,
    hiddenFigure: { hiddenTokenId: hider.id, tokenId: spotter.id },
  });
  await logGmZoneLine(
    deps,
    campaignId,
    await systemHand(deps, campaignId, user),
    tokenTableName(spotter, spotter.name),
    'Percepcja — ukryta figura w pobliżu',
    `${hider.name} kryje się: ${cpredHidingDvText(hiding)}`,
  );
  return false;
}

/** Rzut serwera za figurę gracza bez karty — wynik zna tylko MG. */
async function serverSpot(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  hider: Token,
  spotter: Token,
  ownerId: string,
  hiding: CpredHidingDv,
  user: SessionUser,
): Promise<boolean> {
  const base = await checkPerceptionOf(deps, spotter);
  const outcome = cpredAmmoCheckOutcome(createMixedRng()(10), base.total, hiding.dv);
  if (outcome.resisted && (await addSpotter(deps, hider.id, ownerId))) {
    const fresh = await deps.ctx.prisma.token.findUnique({ where: { id: hider.id } });
    if (fresh) await emitTokenUpsert(deps, campaignId, scene, fresh);
  }
  const roll = `${base.label} ${outcome.die}+${outcome.modifier} = ${outcome.total} vs ${cpredHidingDvText(hiding)}`;
  await logGmZoneLine(
    deps,
    campaignId,
    await systemHand(deps, campaignId, user),
    tokenTableName(spotter, spotter.name),
    'Percepcja — ukryta figura w pobliżu',
    `${roll} — ${outcome.resisted ? 'zauważa' : 'nie zauważa'}: ${hider.name}`,
  );
  return outcome.resisted;
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

/**
 * Rozliczenie Testu Percepcji przy ukrytej figurze (58d) — woła je rzut na
 * wezwanie z `hiddenTokenId`. Zdany odsłania figurę kontu właściciela postaci:
 * jego lista figur dostaje ją (a z nią walka z zauważenia z 56, jeśli to
 * wróg), a on sam pasek „X zauważa: …”. MG dostaje wiersz w obu przypadkach.
 */
export async function settleSpotFigureTest(
  deps: RealtimeDeps,
  campaignId: string,
  input: {
    hiddenTokenId: string;
    tokenId: string;
    characterId: string;
    success: boolean;
    total: number;
    dv: number | undefined;
  },
): Promise<void> {
  const hider = await deps.ctx.prisma.token.findUnique({
    where: { id: input.hiddenTokenId },
    include: { scene: true },
  });
  if (!hider || hider.scene.campaignId !== campaignId) return;
  const spotter = await deps.ctx.prisma.token.findUnique({ where: { id: input.tokenId } });
  const owner = await deps.ctx.prisma.character.findUnique({
    where: { id: input.characterId },
    select: { ownerId: true, name: true },
  });
  const actorName = spotter ? tokenTableName(spotter, spotter.name) : (owner?.name ?? '');
  const hand = await campaignGmHand(deps, campaignId);
  if (hand) {
    const against = input.dv === undefined ? '' : ` vs PT ${input.dv}`;
    await logGmZoneLine(
      deps,
      campaignId,
      hand,
      actorName,
      'Percepcja — ukryta figura w pobliżu',
      `wynik ${input.total}${against} — ${input.success ? 'zauważa' : 'nie zauważa'}: ${hider.name}`,
    );
  }
  if (!input.success || !owner?.ownerId) return;
  // Figura odsłonięta ręką MG albo przeniesiona w nową kryjówkę między
  // wezwaniem a rzutem nie ma już czego odsłaniać temu jednemu kontu.
  if (!(await addSpotter(deps, hider.id, owner.ownerId))) return;
  const { scene } = hider;
  const token = await deps.ctx.prisma.token.findUnique({ where: { id: hider.id } });
  if (!token) return;
  // MG — „zauważona”; gracze — listy figur (ukryta z zauważającymi idzie
  // `emitSceneTokensToPlayers`), a przez `checkSighting` na ich końcu walka z 56.
  await emitTokenUpsert(deps, campaignId, scene, token);
  if (spotter) {
    await emitHiddenSpotted(deps, campaignId, scene, spotter, [tokenTableName(token, token.name)]);
  }
}
