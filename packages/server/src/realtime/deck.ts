import type {
  CharacterDeckPayload,
  CharacterView,
  CompendiumEntry,
  CpredCharacterData,
  CpredDeckResult,
} from '@vtt/shared';
import {
  ROLE_GM,
  cpredInstallFromGear,
  cpredPlugDeck,
  cpredRowId,
  cpredSetDeckSlots,
  cpredUninstallToGear,
  cpredUnplugDeck,
  parseCharacterData,
} from '@vtt/shared';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { requireCampaignId } from './combat.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { campaignEntry } from './compendium.js';
import { requireOwnCharacter } from './inventory.js';
import { emitRuns } from './netrun-io.js';

/**
 * Cyberdek jako towar (etap 48b, decyzja MG z 10.10.2026).
 *
 * Dek podpina się z wiersza Wyposażenia, Program i Ulepszenie Sprzętowe
 * wkłada się z niego i do niego wyjmuje — zawsze jednym zapisem karty, bo
 * plecak i gniazda to dwie połowy tej samej zmiany. Logika w `shared`
 * (`systems/cpred/cyberdeck.ts`); tu tylko prawa, katalog kampanii i emisje.
 *
 * Tą drogą idzie **także MG** (decyzja MG z 10.10: bez listy z kompendium na
 * karcie) — jego łata `cyberdeck` zostaje wyłącznie furtką sędziego na
 * naprawę karty. Liczbę gniazd zmienia tylko MG.
 */

/** Katalog kampanii dla wierszy Wyposażenia — wpisy MG wygrywają z plikami. */
async function gearLookup(
  deps: RealtimeDeps,
  campaignId: string,
  data: CpredCharacterData,
): Promise<(entryId: string) => CompendiumEntry | undefined> {
  const byId = new Map<string, CompendiumEntry>();
  for (const id of new Set(data.gear.map((row) => row.compendiumId).filter(Boolean))) {
    const entry = await campaignEntry(deps, campaignId, id!);
    if (entry) byId.set(id!, entry);
  }
  return (entryId) => byId.get(entryId);
}

export const characterDeckEvent = defineEvent<CharacterDeckPayload, CharacterView>({
  name: 'character:deck',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const character = await requireOwnCharacter(
      deps.ctx.prisma,
      campaignId,
      user,
      payload?.characterId,
    );
    const isGm = user.role === ROLE_GM;
    const data = parseCharacterData(character.data, deps.ctx.cpred);
    const action = payload?.action;
    const rowId = typeof payload?.rowId === 'string' ? payload.rowId : '';

    // Dek przepięty w trakcie runu zostawiłby run bez sprzętu, na którym stoi
    // (`NET_NO_DECK` przy starcie) — Programy wkłada się i wyjmuje jak dotąd.
    const inRun =
      (await deps.ctx.prisma.netRun.count({ where: { characterId: character.id } })) > 0;
    if ((action === 'plug' || action === 'unplug') && inRun) {
      throw new RealtimeError('NET_RUN_ACTIVE');
    }

    let result: CpredDeckResult;
    switch (action) {
      case 'plug':
        result = cpredPlugDeck(data, rowId, await gearLookup(deps, campaignId, data), cpredRowId);
        break;
      case 'install':
        result = cpredInstallFromGear(
          data,
          rowId,
          await gearLookup(deps, campaignId, data),
          cpredRowId,
        );
        break;
      case 'unplug':
        result = cpredUnplugDeck(data, cpredRowId);
        break;
      case 'remove':
        result = cpredUninstallToGear(data, rowId, cpredRowId);
        break;
      case 'slots':
        if (!isGm) throw new RealtimeError('FORBIDDEN');
        result = cpredSetDeckSlots(data, typeof payload?.slots === 'number' ? payload.slots : NaN);
        break;
      default:
        throw new RealtimeError('BAD_REQUEST');
    }
    if (!result.ok) throw new RealtimeError(result.error);

    const saved = await deps.ctx.prisma.character.update({
      where: { id: character.id },
      data: { data: JSON.stringify(result.data) },
    });
    const view = toCharacterView(saved, deps.ctx.cpred);
    await emitCharacterUpsert(deps, campaignId, view);
    // Okno runu rysuje gniazda tej karty (26c) — Program włożony w trakcie
    // runu ma w nim stanąć od razu, jak przy łacie karty.
    if (inRun) await emitRuns(deps, campaignId);
    return view;
  },
});
