import type {
  SceneTemplate,
  SceneTemplateCreatePayload,
  SceneTemplateCreateResult,
  SceneTemplateSummary,
} from '@vtt/shared';
import {
  CONTAINER_PRESET_LOOKS,
  NET_SCENE_CONTROL_DV,
  ROLE_GM,
  clampChaseVehicle,
  cpredKeyRow,
  cpredTemplateContainerSheet,
  cpredTemplateLockRule,
  cpredTemplateNetArchitecture,
  cpredTemplateNetProgramIds,
  cpredTemplateNpcEntryIds,
  cpredTemplateNpcFinish,
  cpredTemplateNpcInput,
  cpredTemplateVehicleStats,
  isNetDefenseEntry,
  isVehicleEntry,
  mergeCharacterData,
  netDifficultyDv,
  netrunningDataOf,
  purchasedSheetRow,
  readCpredTemplateContainer,
  readCpredTemplateNets,
  readCpredTemplateNpc,
  readCpredTemplateNpcExtras,
  readCpredTemplateVehicle,
  readCpredTemplateZone,
  resolveWeapon,
  sceneTemplatePoint,
  sceneTemplateSummary,
  seatedTokenPosition,
  vehicleSeatCentre,
  type CompendiumEntry,
  type CpredCharacterData,
  type CpredTemplatePlacedFigure,
  type PurchasedRow,
} from '@vtt/shared';
import { randomBytes } from 'node:crypto';
import type { Character, Scene, Vehicle } from '../generated/prisma/client.js';
import { loadSceneTemplate, loadSceneTemplates, sceneTemplatesRoot } from '../scene-templates.js';
import { vehicleBodyColumns, vehicleCatalog } from '../vehicles.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { npcSheetFrom } from './characters.js';
import { chaseBodyOf, chaseGeometry } from './chase.js';
import { campaignEntry } from './compendium.js';
import { nextRowId } from './economy.js';
import { emitList as emitNetList } from './netrunning.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { emitSceneList } from './scenes.js';
import { emitVehicleUpsert } from './vehicles.js';

/**
 * Sceny przykładowe (etap 66): lista wzorców z repo i założenie kopii
 * w kampanii MG. Kopia jest zwykłą sceną kampanii — z jej autami (pojazdy MG
 * bez właściciela), kartami NPC-ów, notatkami warstwy MG, od 66b także
 * ścianami, osłonami, gniazdami Sieci i Architekturami, a od 66e światłami,
 * zamkami otworów, strefami bronionymi i pojemnikami — więc dalej żyje jak
 * każda inna: edycja, paczka, kopia zapasowa, usunięcie.
 */

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

export const sceneTemplatesEvent = defineEvent<void, SceneTemplateSummary[]>({
  name: 'scene:templates',
  role: ROLE_GM,
  handler: async ({ deps, socket }) => {
    requireCampaignId(socket.data);
    const templates = await loadSceneTemplates(sceneTemplatesRoot(deps.ctx.config), deps.log);
    return templates.map(sceneTemplateSummary);
  },
});

export const sceneFromTemplateEvent = defineEvent<
  SceneTemplateCreatePayload,
  SceneTemplateCreateResult
>({
  name: 'scene:from-template',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    if (typeof payload?.templateId !== 'string') throw new RealtimeError('BAD_REQUEST');
    const template = await loadSceneTemplate(
      sceneTemplatesRoot(deps.ctx.config),
      payload.templateId,
      deps.log,
    );
    if (!template) throw new RealtimeError('TEMPLATE_NOT_FOUND');
    const created = await instantiateSceneTemplate(deps, campaignId, template);
    await emitSceneList(deps, campaignId);
    for (const vehicle of created.vehicles) await emitVehicleUpsert(deps, campaignId, vehicle);
    for (const character of created.characters) {
      await emitCharacterUpsert(deps, campaignId, toCharacterView(character, deps.ctx.cpred));
    }
    if (created.architectures > 0) await emitNetList(deps, campaignId);
    return { sceneId: created.scene.id, missing: created.missing };
  },
});

/** Nazwa kopii: nazwa wzorca, a gdy już jest w kampanii — z numerem („… 2”). */
async function freeSceneName(
  deps: RealtimeDeps,
  campaignId: string,
  name: string,
): Promise<string> {
  const taken = new Set(
    (await deps.ctx.prisma.scene.findMany({ where: { campaignId }, select: { name: true } })).map(
      (row) => row.name,
    ),
  );
  if (!taken.has(name)) return name;
  for (let n = 2; ; n += 1) {
    const candidate = `${name} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Zakłada scenę ze wzorca. Wszystko, co wymaga kompendium (auta z katalogu,
 * karty NPC-ów), liczy się przed transakcją; sama transakcja tylko pisze, więc
 * nieudany wzorzec nie zostawia pół sceny.
 */
export async function instantiateSceneTemplate(
  deps: RealtimeDeps,
  campaignId: string,
  template: SceneTemplate,
): Promise<{
  scene: Scene;
  vehicles: Vehicle[];
  characters: Character[];
  /** Ile Architektur Sieci założono (biblioteka MG do odświeżenia). */
  architectures: number;
  missing: string[];
}> {
  const prisma = deps.ctx.prisma;
  const missing = new Set<string>();

  const catalog = await vehicleCatalog(prisma, deps.ctx.compendium, campaignId);
  const vehicleSpecs = template.vehicles.map((vehicle) => {
    const built = cpredTemplateVehicleStats(readCpredTemplateVehicle(vehicle.system), (id) =>
      catalog.find((entry) => entry.id === id && isVehicleEntry(entry)),
    );
    built.missing.forEach((id) => missing.add(id));
    return { vehicle, stats: built.stats };
  });

  const npcs = template.figures.map((figure) => readCpredTemplateNpc(figure.system));
  const known = new Set<string>();
  for (const id of new Set(npcs.flatMap(cpredTemplateNpcEntryIds))) {
    if (await campaignEntry(deps, campaignId, id)) known.add(id);
  }
  const sheets: Awaited<ReturnType<typeof npcSheetFrom>>[] = [];
  for (const [index, npc] of npcs.entries()) {
    const { input, missing: lacking } = cpredTemplateNpcInput(npc, (id) => known.has(id));
    lacking.forEach((id) => missing.add(id));
    const sheet = await npcSheetFrom(deps, campaignId, input);
    const extras = readCpredTemplateNpcExtras(template.figures[index]!.system);
    sheets.push(cpredTemplateNpcFinish(sheet, extras, nextRowId));
  }

  // Sieć: Programy LOD-u sprawdza się przed transakcją jak broń NPC-ów.
  const nets = readCpredTemplateNets(template.system);
  const knownPrograms = new Set<string>();
  for (const id of new Set(cpredTemplateNetProgramIds(nets))) {
    if (await campaignEntry(deps, campaignId, id)) knownPrograms.add(id);
  }
  const netData = netrunningDataOf(deps.ctx.cpred);

  // Strefy bronione (66e): pierwszy znany wpis „Obrony Sieci” z alternatyw.
  // Strefa bez wpisu nie powstaje (prostokąt bez liczb nic by nie robił),
  // a urządzenie węzła, które ją wskazuje, wypada do `missing` jak figura.
  const zoneEntries = new Map<string, CompendiumEntry>();
  const zoneSpecs = [] as { zone: (typeof template.zones)[number]; entry: CompendiumEntry }[];
  for (const zone of template.zones) {
    const { entryIds } = readCpredTemplateZone(zone.system);
    let entry: CompendiumEntry | undefined;
    for (const id of entryIds) {
      const found = zoneEntries.get(id) ?? (await campaignEntry(deps, campaignId, id));
      if (found && isNetDefenseEntry(found)) {
        zoneEntries.set(id, found);
        entry = found;
        break;
      }
    }
    if (entry) zoneSpecs.push({ zone, entry });
    else missing.add(entryIds[0] ?? `zone:${zone.key ?? zone.name ?? '?'}`);
  }

  // Pojemniki (66e): zawartość z kompendium jak zakup, klucz u figury wzorca
  // (wiersz plecaka jak z „Wydaj klucz”), wszystko przed transakcją.
  const figureIndex = new Map(
    template.figures.flatMap((figure, index) => (figure.key ? [[figure.key, index]] : [])),
  );
  const containerSheets: CpredCharacterData[] = [];
  for (const container of template.containers) {
    const spec = readCpredTemplateContainer(container.system);
    const rows: { row: PurchasedRow; qty: number }[] = [];
    for (const item of spec.items) {
      let entry: CompendiumEntry | undefined;
      for (const id of item.ids) {
        entry = await campaignEntry(deps, campaignId, id);
        if (entry) break;
      }
      const resolved =
        entry?.category === 'weapon'
          ? resolveWeapon(entry, { weaponTypeById: deps.ctx.compendium.weaponTypeById })
          : null;
      const row = entry ? purchasedSheetRow(entry, resolved, nextRowId()) : null;
      if (row) rows.push({ row, qty: item.qty });
      else missing.add(item.ids[0]!);
    }
    let keyId: string | null = null;
    if (spec.keyHolder !== null) {
      const holder = figureIndex.get(spec.keyHolder);
      if (holder === undefined) {
        missing.add(`figure:${spec.keyHolder}`);
      } else {
        keyId = randomBytes(12).toString('base64url');
        const sheet = sheets[holder]!;
        sheets[holder] = {
          ...sheet,
          gear: [...sheet.gear, cpredKeyRow(nextRowId(), keyId, container.name)],
        };
      }
    }
    containerSheets.push(cpredTemplateContainerSheet(spec, rows, keyId));
  }

  // Stany figur (66c) z listy systemu, jak `token:update` — nieznany id do `missing`.
  const figureStatuses = template.figures.map((figure) =>
    figure.statuses.filter((id) => {
      if (deps.ctx.statuses.ids.has(id)) return true;
      missing.add(`status:${id}`);
      return false;
    }),
  );

  const name = await freeSceneName(deps, campaignId, template.name);
  const t = template.scene;
  const point = (at: { x: number; y: number }) => sceneTemplatePoint(t, at);

  const result = await prisma.$transaction(async (tx) => {
    const scene = await tx.scene.create({
      data: {
        campaignId,
        name,
        active: false,
        backgroundUrl: t.backgroundUrl,
        backgroundWidth: t.backgroundWidth,
        backgroundHeight: t.backgroundHeight,
        width: t.width,
        height: t.height,
        gridSizePx: t.gridSizePx,
        gridOffsetX: t.gridOffsetX,
        gridOffsetY: t.gridOffsetY,
        gridVisible: t.gridVisible,
        gridPlayers: t.gridPlayers,
        metersPerSquare: t.metersPerSquare,
        visibility: t.visibility,
        dark: t.dark,
        darkSightM: t.darkSightM,
        explore: t.explore,
        partySight: t.partySight,
        playerMove: t.playerMove,
        ambience: t.ambience,
        spawnX: t.spawn ? point(t.spawn).x : null,
        spawnY: t.spawn ? point(t.spawn).y : null,
        kind: t.kind,
        ...(t.chase
          ? {
              chaseDirection: t.chase.direction,
              chaseTempo: t.chase.tempo,
              chaseRunning: t.chase.running,
              chaseRoadFrom: t.chase.road?.from ?? null,
              chaseRoadTo: t.chase.road?.to ?? null,
            }
          : {}),
      },
    });

    const { settings, frame } = chaseGeometry(scene);
    const vehicles: Vehicle[] = [];
    const placed = new Map<string, { id: string; vehicle: Vehicle; x: number; y: number }>();
    for (const { vehicle: spec, stats } of vehicleSpecs) {
      const vehicle = await tx.vehicle.create({
        data: {
          campaignId,
          ownerCharacterId: null,
          name: spec.name,
          imageUrl: spec.imageUrl,
          ...vehicleBodyColumns(stats),
          system: JSON.stringify(stats),
        },
      });
      vehicles.push(vehicle);
      const centre = clampChaseVehicle(point(spec), chaseBodyOf(vehicle), settings, frame);
      // Auto w rezerwie (66c) stoi w kadrze, ale poza pościgiem: gracz go nie
      // widzi, a MG wprowadza je „Przywróć do pościgu” w tym samym miejscu.
      const row = await tx.sceneVehicle.create({
        data: {
          sceneId: scene.id,
          vehicleId: vehicle.id,
          x: centre.x,
          y: centre.y,
          status: spec.status,
        },
      });
      placed.set(spec.key, { id: row.id, vehicle, x: centre.x, y: centre.y });
    }

    const characters: Character[] = [];
    const placedFigures = new Map<string, CpredTemplatePlacedFigure>();
    for (const [index, figure] of template.figures.entries()) {
      const character = await tx.character.create({
        data: {
          campaignId,
          name: figure.name,
          ownerId: null,
          data: JSON.stringify(mergeCharacterData(sheets[index]!, {})),
        },
      });
      characters.push(character);
      const car = figure.vehicle ? placed.get(figure.vehicle.key) : undefined;
      const seatCentre =
        car && figure.vehicle
          ? vehicleSeatCentre(
              car,
              chaseBodyOf(car.vehicle),
              figure.vehicle.seat,
              settings.direction,
              scene.gridSizePx,
            )
          : null;
      // Fotel, którego układ auta nie ma (mniejszy pojazd z próbki), — figura
      // staje obok na jezdni, jak przy przesiadce do mniejszego auta.
      const at = seatCentre
        ? seatedTokenPosition(seatCentre, 1, scene.gridSizePx)
        : car
          ? { x: car.x, y: car.y }
          : point(figure);
      // `point()` daje środek kratki, a figura stoi lewym górnym rogiem.
      const corner = car ? at : { x: at.x - scene.gridSizePx / 2, y: at.y - scene.gridSizePx / 2 };
      const token = await tx.token.create({
        data: {
          sceneId: scene.id,
          name: figure.name,
          x: corner.x,
          y: corner.y,
          size: 1,
          hidden: figure.hidden,
          ownerId: null,
          characterId: character.id,
          disposition: figure.disposition,
          glyph: figure.glyph,
          facing: figure.facing,
          visionRange: figure.visionRange,
          statuses: JSON.stringify(figureStatuses[index]!),
          ...(seatCentre && car && figure.vehicle
            ? { sceneVehicleId: car.id, vehicleSeat: figure.vehicle.seat }
            : {}),
        },
      });
      if (figure.key) {
        placedFigures.set(figure.key, {
          tokenId: token.id,
          name: figure.name,
          glyph: figure.glyph,
        });
      }
    }

    // Ściany: łańcuch wzorca → odcinki, jak gest edytora. Zamek (66e) to zapis
    // CP RED w `lockRule`, jak po „Zamek…” MG; otwór z kluczem powstaje sam,
    // bo jego id wskaże urządzenie „drzwi” w Architekturze.
    const wallRows = template.walls.map((wall) =>
      wall.points.slice(1).map((end, at) => {
        const from = point(wall.points[at]!);
        const to = point(end);
        return {
          sceneId: scene.id,
          kind: wall.kind,
          open: wall.open,
          playerToggle: wall.playerToggle,
          locked: wall.locked,
          armor: wall.armor,
          hidesFigures: wall.hidesFigures,
          lockRule:
            wall.lockRule === null ? null : JSON.stringify(cpredTemplateLockRule(wall.lockRule)),
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
        };
      }),
    );
    const keyedWalls = new Map<string, { wallId: number }>();
    for (const [index, wall] of template.walls.entries()) {
      if (!wall.key) continue;
      const row = await tx.wall.create({ data: wallRows[index]![0]! });
      keyedWalls.set(wall.key, { wallId: row.id });
    }
    const plainWalls = template.walls.flatMap((wall, index) => (wall.key ? [] : wallRows[index]!));
    if (plainWalls.length > 0) await tx.wall.createMany({ data: plainWalls });

    if (template.lights.length > 0) {
      await tx.mapLight.createMany({
        data: template.lights.map((light) => ({
          sceneId: scene.id,
          ...point(light),
          brightM: light.brightM,
          dimM: light.dimM,
          color: light.color,
          flicker: light.flicker,
          enabled: light.enabled,
        })),
      });
    }

    // Pojemniki (66e): karta z polem `container` i figura z grafiką rodzaju,
    // jak „📦” w pasku mapy — tylko od razu z zamkiem i zawartością.
    for (const [index, container] of template.containers.entries()) {
      const card = await tx.character.create({
        data: {
          campaignId,
          name: container.name,
          ownerId: null,
          data: JSON.stringify(mergeCharacterData(containerSheets[index]!, {})),
        },
      });
      characters.push(card);
      const at = point(container);
      await tx.token.create({
        data: {
          sceneId: scene.id,
          name: container.name,
          imageUrl: CONTAINER_PRESET_LOOKS[container.preset].imageUrl,
          x: at.x - scene.gridSizePx / 2,
          y: at.y - scene.gridSizePx / 2,
          size: 1,
          hidden: container.hidden,
          ownerId: null,
          characterId: card.id,
        },
      });
    }

    for (const cover of template.covers) {
      const corner = point(cover);
      await tx.cover.create({
        data: {
          sceneId: scene.id,
          typeId: 'generic',
          name: cover.name,
          x: corner.x,
          y: corner.y,
          width: cover.width * scene.gridSizePx,
          height: cover.height * scene.gridSizePx,
          hpMax: cover.hp,
          hpCurrent: cover.hp,
          hidden: cover.hidden,
        },
      });
    }

    // Architektury po figurach i otworach — urządzenie to id figury albo
    // `Wall` na tej scenie; strefy (66e) dostają wiązanie z węzłem po Architekturze.
    const zonesByKey = new Map(
      zoneSpecs.flatMap((spec) =>
        spec.zone.key
          ? [[spec.zone.key, { name: spec.zone.name ?? spec.entry.name.slice(0, 40) }]]
          : [],
      ),
    );
    const zoneLinks = new Map<
      string,
      { architectureId: string; floorId: string; deviceId: string }
    >();
    const architectureIds = new Map<string, string>();
    for (const net of nets) {
      const built = cpredTemplateNetArchitecture(net, {
        figure: (key) => placedFigures.get(key),
        zone: (key) => zonesByKey.get(key),
        wall: (key) => keyedWalls.get(key),
        defaultDv: netDifficultyDv(net.difficulty, netData) || NET_SCENE_CONTROL_DV,
        knownProgram: (id) => knownPrograms.has(id),
      });
      built.missing.forEach((id) => missing.add(id));
      const row = await tx.netArchitecture.create({
        data: {
          campaignId,
          name: built.architecture.name,
          difficulty: built.architecture.difficulty,
          data: JSON.stringify({ ...built.architecture, id: undefined }),
          runtime: JSON.stringify(
            built.devices.length > 0 ? { viruses: [], devices: built.devices } : { viruses: [] },
          ),
        },
      });
      architectureIds.set(net.key, row.id);
      for (const link of built.zones) {
        zoneLinks.set(link.zone, {
          architectureId: row.id,
          floorId: link.floorId,
          deviceId: link.deviceId,
        });
      }
    }

    for (const { zone, entry } of zoneSpecs) {
      const corner = point(zone);
      const hp = isNetDefenseEntry(entry) ? (entry.hp ?? 0) : 0;
      await tx.defenseZone.create({
        data: {
          sceneId: scene.id,
          entryId: entry.id,
          name: zone.name ?? entry.name.slice(0, 40),
          x: corner.x,
          y: corner.y,
          width: zone.width * scene.gridSizePx,
          height: zone.height * scene.gridSizePx,
          armed: zone.armed,
          hidden: zone.hidden,
          hpMax: hp,
          hpCurrent: hp,
          spotDv: zone.spotDv,
          disarmDv: zone.disarmDv,
          notes: zone.notes,
          ...(zone.key ? (zoneLinks.get(zone.key) ?? {}) : {}),
        },
      });
    }
    for (const access of template.accessPoints) {
      await tx.netAccessPoint.create({
        data: {
          sceneId: scene.id,
          architectureId: access.net ? (architectureIds.get(access.net) ?? null) : null,
          name: access.name,
          ...point(access),
          hidden: access.hidden,
          notes: access.notes,
        },
      });
    }

    for (const note of template.notes) {
      await tx.mapNote.create({
        data: { sceneId: scene.id, ...point(note), icon: note.icon, text: note.text },
      });
    }
    return { scene, vehicles, characters, architectures: architectureIds.size };
  });

  return { ...result, missing: [...missing] };
}
