import type {
  CharacterTeamHirePayload,
  CharacterTeamLoyaltyPayload,
  CharacterView,
  CpredCharacterData,
  CpredTeamMember,
  CpredTeamProfession,
  CpredTeamStatRow,
} from '@vtt/shared';
import {
  CPRED_LOYALTY_REPLACEMENT,
  CPRED_LOYALTY_REPLACEMENT_FEE,
  CPRED_TEAM_ARMOR,
  CPRED_TEAM_WEAPON,
  CPRED_TEAMWORK_ABILITY,
  ROLE_GM,
  cpredLoyaltyAfterSession,
  cpredLoyaltyChange,
  cpredLoyaltyObeys,
  cpredLoyaltyTreacherous,
  cpredRoleAbilityRank,
  cpredStartingLoyalty,
  cpredTeamProblem,
  cpredTeamProfession,
  cpredTeamSlots,
  cpredTeamStats,
  createDefaultCharacterData,
  createDefaultLifepath,
  describeTeamMember,
  isWeaponEntry,
  mergeCharacterData,
  parseCharacterData,
  resolveWeapon,
  rollFormula,
  sanitizeCharacterName,
  CPRED_LOYALTY_MAX,
  CPRED_LOYALTY_MIN,
  CPRED_STAT_MIN,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Character } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { buildCompendiumSync } from './compendium.js';
import { INCLUDE_CHAT_NAMES, deliverRollMessage, toChatMessageView } from './chat-io.js';
import { createMixedRng } from './dice-rng.js';

/**
 * Praca Zespołowa (stage 30c) — the Korpo's team (s. 153–157).
 *
 * The decision that shapes this whole module: an employee is a **real sheet**,
 * not a statist's combat profile. „Członkowie zespołu zbudowani są tak samo jak
 * Postacie Graczy" (s. 154) is the rulebook's own sentence, and the Corporate
 * Netrunner is the proof it means something — his package hands him a cyberdeck
 * and Interfejs 2, and a figure with a combat profile has neither. Same for the
 * Szofer's Prowadzenie pojazdów and the Technik's Cyberinżynieria: four of the
 * five professions exist mostly for what they do *outside* a firefight.
 *
 * What does **not** become a sheet row is the chrome. „Nie musisz obniżać
 * Empatii tej Postaci z uwagi na Utratę Człowieczeństwa […] Wzięto to już pod
 * uwagę" — real cyberware rows would cost Humanity twice, so the package's
 * chrome is written down as prose and the numbers stay as HR rolled them.
 *
 * Loyalty lives on the **employer's** sheet (`data.team`), because it is a fact
 * about a working relationship rather than about a person: the same bodyguard
 * hired by somebody else starts again at 1k6+1.
 */

/** Row ids of the two things the package turns into real rows. */
const TEAM_WEAPON_ROW = 'team-weapon';
const TEAM_ARMOR_ROW = 'team-armor';

async function requireCampaignCharacter(
  prisma: PrismaClient,
  campaignId: string,
  characterId: unknown,
): Promise<Character> {
  if (typeof characterId !== 'string' || characterId.length === 0) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character || character.campaignId !== campaignId) {
    throw new RealtimeError('CHARACTER_NOT_FOUND');
  }
  return character;
}

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

/**
 * The employee's sheet, built from the package HR hands out.
 *
 * Everything here is copied from the printed block; the only thing rolled is
 * which of the six stat rows applies, and that happens before this is called.
 */
async function teamMemberData(
  deps: RealtimeDeps,
  campaignId: string,
  profession: CpredTeamProfession,
  stats: CpredTeamStatRow,
): Promise<CpredCharacterData> {
  const base = createDefaultCharacterData();
  const compendium = await buildCompendiumSync(deps, campaignId);
  const weaponTypeById = new Map(compendium.weaponTypes.map((type) => [type.id, type]));
  const wanted = CPRED_TEAM_WEAPON.name.trim().toLowerCase();
  const entry = compendium.entries.find(
    (candidate) => isWeaponEntry(candidate) && candidate.name.trim().toLowerCase() === wanted,
  );
  const resolved = entry && isWeaponEntry(entry) ? resolveWeapon(entry, { weaponTypeById }) : null;
  const magazine = resolved?.magazine ?? CPRED_TEAM_WEAPON.magazine;

  // „Interfejs (Zdolność Specjalna Netrunnera)" is a Role, and the Role is
  // found by the **ability's name** — the ids come from `roles.json`, which the
  // group may have renamed (the same contract `cpredRoleAbilityRank` keeps).
  const role = profession.ability
    ? (deps.ctx.cpred.roles.find(
        (candidate) =>
          candidate.ability.trim().toLowerCase() === profession.ability!.name.trim().toLowerCase(),
      ) ?? null)
    : null;

  return mergeCharacterData(base, {
    stats: {
      ...stats,
      // No Szczęście column in any of the five tables, and that is the rulebook
      // drawing a line: Luck is what a Player Character spends. The sheet's own
      // floor is 1 (a stat of 0 is not a legal sheet and the whole block would
      // be rejected on read), so the entitlement is the minimum and the **pool
      // is empty** — which is the same thing at the table.
      luck: CPRED_STAT_MIN,
    },
    luckCurrent: 0,
    roleId: role?.id ?? null,
    roleAbilityRank: profession.ability?.rank ?? 1,
    skills: { ...profession.skills },
    skillSpecialties: { ...profession.skillSpecialties },
    lifepath: {
      ...createDefaultLifepath(),
      // Where 25b put every language, including this one.
      language: profession.language ?? '',
    },
    weapons: [
      {
        id: TEAM_WEAPON_ROW,
        name: CPRED_TEAM_WEAPON.name,
        notes: '',
        damage: resolved?.damage ?? CPRED_TEAM_WEAPON.damage,
        ammoCurrent: magazine,
        ammoMax: magazine,
        ammoType: '',
        rof: '1',
        ...(entry ? { compendiumId: entry.id } : {}),
      },
    ],
    armor: [
      {
        id: TEAM_ARMOR_ROW,
        name: CPRED_TEAM_ARMOR.name,
        notes:
          '„Najcięższym pancerzem […] jest Lekka kurtka kuloodporna. Taka polityka Korporacji.',
        sp: CPRED_TEAM_ARMOR.sp,
        spCurrent: CPRED_TEAM_ARMOR.sp,
        location: 'body',
      },
    ],
    notes:
      `${profession.name} — ${profession.duty}\n` +
      `Przykrywka: ${profession.cover}\n\n` +
      `Cyborgizacje (wliczone w Cechy — Empatii nie obniżamy): ${profession.cyberware}\n\n` +
      `Osprzęt: ${profession.gear}\n\n` +
      'Nie może podnosić poziomu swoich Umiejętności (s. 154).',
  });
}

/** The Korpo's roster, and the rank that pays for it. */
function rosterOf(
  data: CpredCharacterData,
  deps: RealtimeDeps,
): { team: CpredTeamMember[]; rank: number } {
  const rank = cpredRoleAbilityRank(data, deps.ctx.cpred, CPRED_TEAMWORK_ABILITY);
  if (rank === null) throw new RealtimeError('NO_ABILITY');
  return { team: data.team, rank };
}

async function saveRoster(
  deps: RealtimeDeps,
  campaignId: string,
  employer: Character,
  data: CpredCharacterData,
  team: CpredTeamMember[],
): Promise<CharacterView> {
  const problem = cpredTeamProblem(
    team,
    cpredRoleAbilityRank(data, deps.ctx.cpred, CPRED_TEAMWORK_ABILITY),
  );
  if (problem !== null) throw new RealtimeError(problem);
  const saved = await deps.ctx.prisma.character.update({
    where: { id: employer.id },
    data: { data: JSON.stringify(mergeCharacterData(data, { team })) },
  });
  const view = toCharacterView(saved, deps.ctx.cpred);
  await emitCharacterUpsert(deps, campaignId, view);
  return view;
}

/**
 * „Korpo decyduje, jakiego rodzaju pracownika potrzebuje, a następnie losuje
 * w odpowiedniej tabeli Cechy tej Postaci — taką osobę znalazł dla ciebie HR!"
 *
 * Two dice on the chat card, because both are the table's business: which of
 * the six rows HR sent, and how loyal they start. The replacement's flat 1 is
 * not rolled at all — „słyszeli już, co się stało z poprzednikiem".
 */
export const characterTeamHireEvent = defineEvent<CharacterTeamHirePayload, CharacterView>({
  name: 'character:team-hire',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const employer = await requireCampaignCharacter(
      deps.ctx.prisma,
      campaignId,
      payload?.characterId,
    );
    const isGm = user.role === ROLE_GM;
    if (!isGm && employer.ownerId !== user.id) throw new RealtimeError('CHARACTER_NOT_FOUND');

    const data = parseCharacterData(employer.data, deps.ctx.cpred);
    const { team, rank } = rosterOf(data, deps);
    if (team.length >= cpredTeamSlots(rank)) throw new RealtimeError('TEAM_FULL');
    const profession = cpredTeamProfession(payload?.professionId ?? '');
    if (!profession) throw new RealtimeError('UNKNOWN_PROFESSION');
    const name = sanitizeCharacterName(payload?.name);
    if (name === null) throw new RealtimeError('INVALID_NAME');

    const rng = createMixedRng(undefined);
    const die = { terms: [{ kind: 'dice' as const, sign: 1 as const, count: 1, sides: 6 }] };
    // `plain` on both: these are row numbers and a starting value, not tests —
    // a 1 here is „row one", not a fumble (the 27d rule for creator throws).
    const statsRoll = rollFormula(die, rng, { checkRule: false, plain: true });
    const stats = cpredTeamStats(profession, statsRoll.total);
    if (!stats) throw new RealtimeError('BAD_REQUEST');
    const replacement = payload?.replacement === true;
    const loyaltyRoll = rollFormula(die, rng, { checkRule: false, plain: true });
    const loyalty = replacement
      ? CPRED_LOYALTY_REPLACEMENT
      : cpredStartingLoyalty(loyaltyRoll.total);

    const memberData = await teamMemberData(deps, campaignId, profession, stats);
    const member = await deps.ctx.prisma.character.create({
      data: {
        campaignId,
        name,
        // „Członków zespołu kontroluje MG" (s. 154) — an NPC sheet, owned by
        // nobody, exactly like every other person the GM runs.
        ownerId: null,
        data: JSON.stringify(memberData),
      },
    });
    await emitCharacterUpsert(deps, campaignId, toCharacterView(member, deps.ctx.cpred));

    statsRoll.title = `HR przysyła: ${profession.name}`;
    statsRoll.actor = employer.name;
    statsRoll.outcome = {
      success: true,
      label: name,
      detail:
        `wiersz ${statsRoll.total} · Lojalność ${loyalty}` +
        (replacement
          ? ` (następca — opłata manipulacyjna ${CPRED_LOYALTY_REPLACEMENT_FEE} ed)`
          : ''),
    };
    const stored = await deps.ctx.prisma.chatMessage.create({
      data: {
        campaignId,
        authorId: user.id,
        kind: 'roll',
        text: 'Praca Zespołowa',
        payload: JSON.stringify(statsRoll),
      },
      include: INCLUDE_CHAT_NAMES,
    });
    await deliverRollMessage(deps, campaignId, user.id, toChatMessageView(stored));

    return saveRoster(deps, campaignId, employer, data, [
      ...team,
      { characterId: member.id, professionId: profession.id, loyalty },
    ]);
  },
});

/**
 * Everything that happens to a Loyalty afterwards (s. 154).
 *
 * One event for four verbs, because all four are „the number on this row
 * changes" and splitting them would put the same clamp in four places: the Test
 * („MG musi rzucić 1k6"), the table of gains and losses, the between-sessions
 * trim, and letting somebody go.
 *
 * The Test **changes nothing**. It answers a question — „does this person do
 * what they were told" — and what follows is the GM's scene, not a number.
 */
export const characterTeamLoyaltyEvent = defineEvent<CharacterTeamLoyaltyPayload, CharacterView>({
  name: 'character:team-loyalty',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const employer = await requireCampaignCharacter(
      deps.ctx.prisma,
      campaignId,
      payload?.characterId,
    );
    const data = parseCharacterData(employer.data, deps.ctx.cpred);
    const { team } = rosterOf(data, deps);
    const member = team.find((row) => row.characterId === payload?.memberId);
    if (!member) throw new RealtimeError('TEAM_MEMBER_NOT_FOUND');
    const employee = await deps.ctx.prisma.character.findUnique({
      where: { id: member.characterId },
    });
    const memberName = employee?.name ?? describeTeamMember(member);

    if (payload?.dismiss === true) {
      // The sheet stays: a person the Korpo stopped employing is still a person,
      // and deleting them would take a figure off the map that somebody may be
      // standing behind. „Zniknie z zespołu Korpo" is exactly this much.
      return saveRoster(
        deps,
        campaignId,
        employer,
        data,
        team.filter((row) => row.characterId !== member.characterId),
      );
    }

    if (payload?.test === true) {
      const roll = rollFormula(
        { terms: [{ kind: 'dice', sign: 1, count: 1, sides: 6 }] },
        createMixedRng(undefined),
        { checkRule: false, plain: true },
      );
      const obeys = cpredLoyaltyObeys(roll.total, member.loyalty);
      roll.title = `Test Lojalności: ${memberName}`;
      roll.actor = employer.name;
      roll.outcome = {
        success: obeys,
        label: obeys ? 'Wykonuje polecenie' : 'Odmawia albo zawala',
        detail: `${roll.total} ${obeys ? '<' : '≥'} Lojalność ${member.loyalty}${
          cpredLoyaltyTreacherous(member.loyalty) ? ' · czynnie zdradza' : ''
        }`,
      };
      const stored = await deps.ctx.prisma.chatMessage.create({
        data: {
          campaignId,
          authorId: user.id,
          kind: 'roll',
          text: 'Test Lojalności',
          payload: JSON.stringify(roll),
        },
        include: INCLUDE_CHAT_NAMES,
      });
      await deliverRollMessage(deps, campaignId, user.id, toChatMessageView(stored));
      return toCharacterView(employer, deps.ctx.cpred);
    }

    let loyalty = member.loyalty;
    if (payload?.endSession === true) {
      loyalty = cpredLoyaltyAfterSession(loyalty);
    } else {
      const change = cpredLoyaltyChange(payload?.changeId ?? '');
      if (!change) throw new RealtimeError('BAD_REQUEST');
      loyalty = Math.min(CPRED_LOYALTY_MAX, Math.max(CPRED_LOYALTY_MIN, loyalty + change.value));
    }
    return saveRoster(
      deps,
      campaignId,
      employer,
      data,
      team.map((row) => (row.characterId === member.characterId ? { ...row, loyalty } : row)),
    );
  },
});

/**
 * A team member's sheet being deleted has to leave the roster with it —
 * otherwise the panel shows a row pointing at nothing and the cap counts a
 * person who no longer exists.
 *
 * Swept over the campaign rather than hunted down through a foreign key,
 * because the roster is JSON: there is nothing for the database to cascade.
 */
export async function dropFromTeams(
  deps: RealtimeDeps,
  campaignId: string,
  memberId: string,
): Promise<void> {
  const sheets = await deps.ctx.prisma.character.findMany({ where: { campaignId } });
  for (const sheet of sheets) {
    if (sheet.id === memberId) continue;
    const data = parseCharacterData(sheet.data, deps.ctx.cpred);
    if (!data.team.some((row) => row.characterId === memberId)) continue;
    const saved = await deps.ctx.prisma.character.update({
      where: { id: sheet.id },
      data: {
        data: JSON.stringify(
          mergeCharacterData(data, {
            team: data.team.filter((row) => row.characterId !== memberId),
          }),
        ),
      },
    });
    await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
  }
}
