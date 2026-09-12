/**
 * Powrót do zdrowia poza walką: dzień odpoczynku, partia dawek i zastrzyk.
 *
 * Trzy zdarzenia w jednym module, bo są jednym łańcuchem podręcznika (s. 150,
 * 222–223): Ustabilizowanie otwiera proces, dzień odpoczynku go posuwa,
 * a farmaceutyk Medyka go przyspiesza. Rozdzielenie ich po plikach rozdzieliłoby
 * też komentarze, które i tak tłumaczą jedno zdanie z dwóch stron.
 *
 * Wszystkie trzy liczą po stronie serwera z tego samego powodu co reszta
 * mechaniki: PW, eurodolce i dawki to trzy liczby, które klient miałby ochotę
 * sobie ustawić, a każda z nich ma tu swoją księgę — karta czatu, wiersz
 * ekwipunku i `LedgerEntry`.
 */

import type {
  CharacterCraftPharmaPayload,
  CharacterRestPayload,
  CharacterUseDosePayload,
  CpredGearRow,
  CpredPharmaceutical,
  RecoveryLogEntry,
  SessionUser,
} from '@vtt/shared';
import {
  cpredEffectiveStats,
  CPRED_ACTION_DOSE,
  CPRED_MELEE_REACH_M,
  CPRED_PHARMA_BATCH_COST,
  CPRED_PHARMA_BATCH_HOURS,
  CPRED_PHARMA_CRAFT_DV,
  CPRED_POISONED_STATUS_ID,
  CPRED_REST_REFUSALS,
  ROLE_GM,
  cpredApplyAntibiotic,
  cpredCanCraftPharma,
  cpredHealRate,
  cpredPharmaceutical,
  cpredRestDay,
  cpredSheetMedicine,
  cpredSheetHpMax,
  mergeCharacterData,
  metresBetweenTokens,
  metresForRules,
  parseCharacterData,
  rollFormula,
} from '@vtt/shared';
import type { Character, Scene, Token } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { applyBalance } from './economy.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import {
  emitTokensById,
  emitTokensOfCharacter,
  requireCampaignToken,
  toTokenView,
} from './tokens.js';
import { toSceneView } from './scenes.js';
import { requireTurnSpend } from './combat-actions.js';
import { removeTokenStatus } from './grapple-state.js';
import {
  INCLUDE_CHAT_NAMES,
  broadcastChatMessage,
  deliverRollMessage,
  toChatMessageView,
} from './chat-io.js';
import { sanitizeGesture } from './chat.js';
import { createMixedRng } from './dice-rng.js';

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

/**
 * Karta, którą wolno ruszać: właściciel albo MG.
 *
 * Ta sama bramka co przy Prowizorce i wezwaniu Wsparcia. Dzień odpoczynku
 * **nie jest** zarezerwowany dla MG, choć zmienia PW: to gracz decyduje, że
 * jego postać przez dzień leży, a jedyna liczba, jaką przy tym wpisuje, to
 * zero — resztę liczy `cpredRestDay`.
 */
async function requireOwnCharacter(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  characterId: unknown,
): Promise<Character> {
  if (typeof characterId !== 'string' || characterId.length === 0) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const character = await deps.ctx.prisma.character.findUnique({ where: { id: characterId } });
  if (!character || character.campaignId !== campaignId) {
    throw new RealtimeError('CHARACTER_NOT_FOUND');
  }
  if (user.role !== ROLE_GM && character.ownerId !== user.id) {
    throw new RealtimeError('CHARACTER_NOT_FOUND');
  }
  return character;
}

/** Karta powrotu do zdrowia na czacie — publiczna, bez bezwzględnych PW. */
async function postRecoveryCard(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  entry: RecoveryLogEntry,
  sceneId: string | null,
): Promise<void> {
  const stored = await deps.ctx.prisma.chatMessage.create({
    data: {
      campaignId,
      authorId: user.id,
      kind: 'recovery',
      text: entry.title,
      payload: JSON.stringify(entry),
      ...(sceneId ? { sceneId } : {}),
    },
    include: INCLUDE_CHAT_NAMES,
  });
  broadcastChatMessage(deps, campaignId, toChatMessageView(stored));
}

/**
 * „Po każdym pełnym dniu odpoczynku…" (s. 222) — jeden dzień, jedna karta.
 *
 * Zdarzenie zamiast łatki karty, bo cała wartość jest w liczeniu: BC, chrom
 * i antybiotyk sumują się w `cpredRestDay`, a warunek „po udanej stabilizacji"
 * jest tam, gdzie nikt go nie ominie. Odmowa też dostaje kartę — dzień, który
 * niczego nie dał, jest informacją, a nie ciszą.
 */
export const characterRestEvent = defineEvent<
  CharacterRestPayload,
  { healed: number; hpCurrent: number; refusal: string | null }
>({
  name: 'character:rest',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const character = await requireOwnCharacter(deps, campaignId, user, payload?.characterId);
    const data = parseCharacterData(character.data, deps.ctx.cpred);
    const result = cpredRestDay(data, { strained: payload?.strained === true });

    let saved = character;
    if (Object.keys(result.patch).length > 0) {
      saved = await deps.ctx.prisma.character.update({
        where: { id: character.id },
        data: { data: JSON.stringify(mergeCharacterData(data, result.patch)) },
      });
      await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
      // Pasek PW figury czyta kartę (etap 08), więc musi usłyszeć o dniu, który
      // zdjął postać z progu „Poważnie ranny".
      await emitTokensOfCharacter(deps, campaignId, saved);
    }

    const lines = result.rate.sources.map((row) => `${row.label} · +${row.value} PW`);
    if (result.armorRepaired.length > 0) {
      for (const row of result.armorRepaired) {
        lines.push(`${row.name}: nanomaszyny zrastają OB ${row.from} → ${row.to}`);
      }
    }
    if (result.antibioticEnded) lines.push('Antybiotyk się skończył — tydzień minął.');
    await postRecoveryCard(
      deps,
      campaignId,
      user,
      {
        actor: character.name,
        title: 'Dzień odpoczynku',
        hp: result.healed,
        lines: result.refusal ? [] : lines,
        ...(result.refusal ? { note: CPRED_REST_REFUSALS[result.refusal] } : {}),
        tone: result.refusal ? 'warn' : 'success',
      },
      socket.data.viewedSceneId,
    );

    return {
      healed: result.healed,
      hpCurrent: result.hpAfter,
      refusal: result.refusal,
    };
  },
});

/**
 * „Z surowców wartych 200 ed w ciągu godziny Medyk potrafi wytworzyć liczbę
 * dawek równą wartości swojej Umiejętności Technologia Medyczna" (s. 150).
 *
 * Kolejność jest kolejnością zdania i ma znaczenie przy porażce: **surowce
 * schodzą z konta zawsze** („W przypadku porażki surowce przepadają"), a dawki
 * tylko po zdanym Teście o PT 13. Ta asymetria jest całą treścią reguły — bez
 * niej wytwarzanie byłoby przyciskiem, a nie ryzykiem.
 *
 * Rzut idzie na czat jak każdy inny (etap 08): Medyk, który właśnie spalił
 * dwie stówy, ma prawo zobaczyć kość.
 */
export const characterCraftPharmaEvent = defineEvent<
  CharacterCraftPharmaPayload,
  { doses: number; balance: number }
>({
  name: 'character:craft-pharma',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const character = await requireOwnCharacter(deps, campaignId, user, payload?.characterId);
    const data = parseCharacterData(character.data, deps.ctx.cpred);

    const drug = cpredPharmaceutical(payload?.pharmaId);
    if (!drug) throw new RealtimeError('UNKNOWN_PHARMA');
    const medicine = cpredSheetMedicine(data, deps.ctx.cpred);
    // „Zawsze, gdy przydzielasz punkt do Farmaceutyków, zyskujesz dostęp do
    // jednego z poniższych środków" — bez punktu nie ma do czego sięgnąć.
    if (!cpredCanCraftPharma(medicine.pharma, drug.id)) {
      throw new RealtimeError('PHARMA_NOT_UNLOCKED');
    }
    if (medicine.medtechSkill < 1) throw new RealtimeError('NO_MEDTECH_SKILL');
    if (data.eddies < CPRED_PHARMA_BATCH_COST) throw new RealtimeError('NOT_ENOUGH_EDDIES');

    const gesture = sanitizeGesture(payload?.gesture);
    const rng = createMixedRng(gesture?.entropy);
    // Test Umiejętności jak każdy inny: TECHNIKA + Technologia Medyczna + 1k10,
    // z wybuchającą dziesiątką. Kar za rany tu nie ma świadomie — partię robi
    // się przez godzinę w pracowni, a nie w ramach Akcji w cudzej turze.
    // Etap 39: TECHNIKA **jak teraz**, jak w każdym innym Teście.
    const tech = cpredEffectiveStats(data).tech;
    const bonus = tech + medicine.medtechSkill;
    const roll = rollFormula(
      {
        terms: [
          { kind: 'dice', sign: 1, count: 1, sides: 10 },
          { kind: 'modifier', sign: 1, value: bonus },
        ],
      },
      rng,
      { checkRule: true },
    );
    roll.title = `Technologia Medyczna — ${drug.name}`;
    roll.actor = character.name;
    roll.breakdown = [
      { label: 'TECHNIKA', value: tech, kind: 'stat' },
      { label: 'Technologia Medyczna', value: medicine.medtechSkill, kind: 'skill' },
    ];
    const success = roll.total > CPRED_PHARMA_CRAFT_DV;
    const doses = success ? medicine.medtechSkill : 0;
    roll.outcome = {
      success,
      label: success ? `Wytworzone: ${doses} dawek` : 'Surowce przepadły',
      detail: success
        ? `${roll.total} vs PT ${CPRED_PHARMA_CRAFT_DV} · ${CPRED_PHARMA_BATCH_HOURS} h pracy · −${CPRED_PHARMA_BATCH_COST} ed`
        : `${roll.total} vs PT ${CPRED_PHARMA_CRAFT_DV} · −${CPRED_PHARMA_BATCH_COST} ed i nic z tego`,
    };
    if (gesture && gesture.strength > 0) roll.tossStrength = gesture.strength;
    if (gesture?.toss) roll.toss = gesture.toss;

    // Surowce najpierw i bez względu na wynik — tak mówi zdanie o porażce.
    let next = await applyBalance(
      deps,
      campaignId,
      character,
      data,
      {
        kind: 'purchase',
        amount: -CPRED_PHARMA_BATCH_COST,
        label: `Surowce — ${drug.name}`,
      },
      user.id,
      // Jedno powiadomienie na całą czynność: karta postaci poleci niżej razem
      // z dawkami, a dwa `character:upsert` pod rząd migają panelem.
      { emit: doses === 0 },
    );

    if (doses > 0) {
      next = mergeCharacterData(next, { gear: addDoses(next.gear, drug, doses) });
      const saved = await deps.ctx.prisma.character.update({
        where: { id: character.id },
        data: { data: JSON.stringify(next) },
      });
      await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
    }

    const stored = await deps.ctx.prisma.chatMessage.create({
      data: {
        campaignId,
        authorId: user.id,
        kind: 'roll',
        text: `Wytwarzanie: ${drug.name}`,
        payload: JSON.stringify(roll),
        ...(socket.data.viewedSceneId ? { sceneId: socket.data.viewedSceneId } : {}),
      },
      include: INCLUDE_CHAT_NAMES,
    });
    await deliverRollMessage(deps, campaignId, user.id, toChatMessageView(stored));

    return { doses, balance: next.eddies };
  },
});

/**
 * Dawki na kartę: do istniejącego wiersza albo do nowego.
 *
 * Wiersz jest rozpoznawany po `consumable`, nie po nazwie — Medyk, który
 * przemianuje „Antybiotyk" na „ampułki od Zeda", nadal dokłada do tego samego
 * stosu, a wiersz o nazwie „Antybiotyk" bez `consumable` (wpisany ręką jako
 * notatka) zostaje notatką.
 */
function addDoses(
  gear: readonly CpredGearRow[],
  drug: CpredPharmaceutical,
  doses: number,
): CpredGearRow[] {
  const existing = gear.find((row) => row.consumable === drug.id);
  if (existing) {
    return gear.map((row) =>
      row.id === existing.id ? { ...row, qty: row.qty + doses } : { ...row },
    );
  }
  return [
    ...gear.map((row) => ({ ...row })),
    {
      // Krótkie id, bo walidacja wiersza tnie je na 32 znakach — `gear-` plus
      // id środka plus znacznik czasu mieściło się przy „Antybiotyku" i nie
      // mieściło przy „Turbo uzdrawiaczu", więc **cała** lista ekwipunku
      // wracała z odczytu pusta. Ta sama długość co `newRowId` u klienta.
      id: Math.random().toString(36).slice(2, 10),
      name: drug.name,
      notes: drug.effect,
      qty: doses,
      consumable: drug.id,
    },
  ];
}

/**
 * „Wstrzyknięcie jednej dawki środka farmakologicznego zajmuje Akcję" (s. 150).
 *
 * Dawka schodzi z ekwipunku **podającego**, a skutek ląduje na **celu** — dwie
 * różne karty postaci, i dlatego to jedno zdarzenie, a nie dwie łatki: między
 * zdjęciem dawki a jej podaniem nie ma miejsca, w którym wolno się rozjechać.
 *
 * Bramka Medyka jest twarda: „Postać niebędąca Medykiem nie potrafi poprawnie
 * podawać farmaceutyków. Nie są to narkotyki uliczne, a dobranie odpowiednich
 * dawek wymaga odpowiedniego wyszkolenia". Nosić fiolkę może każdy — wbić ją
 * komuś umie Medyk z punktem w Farmaceutykach.
 */
export const characterUseDoseEvent = defineEvent<
  CharacterUseDosePayload,
  { qtyLeft: number; healed: number }
>({
  name: 'character:use-dose',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const medic = await requireOwnCharacter(deps, campaignId, user, payload?.characterId);
    const medicData = parseCharacterData(medic.data, deps.ctx.cpred);

    const row = medicData.gear.find((entry) => entry.id === payload?.gearRowId);
    if (!row || !row.consumable) throw new RealtimeError('NOT_A_CONSUMABLE');
    if (row.qty < 1) throw new RealtimeError('NO_DOSES_LEFT');
    const drug = cpredPharmaceutical(row.consumable);
    if (!drug) throw new RealtimeError('UNKNOWN_PHARMA');
    if (cpredSheetMedicine(medicData, deps.ctx.cpred).pharma < 1) {
      throw new RealtimeError('NOT_A_MEDIC');
    }

    // Kto dostaje zastrzyk. Brak żetonu znaczy „sobie" — najczęstszy przypadek
    // przy stole i jedyny, który nie potrzebuje mapy.
    const target = await resolveDoseTarget(deps, campaignId, medic, payload?.targetTokenId);

    // Akcja przed skutkiem, tak jak przy Ustabilizowaniu: odmowa „nie masz już
    // Akcji" nie ma prawa zjeść dawki. Poza walką `requireTurnSpend` przepuszcza.
    if (target.token && target.scene) {
      const injector = await deps.ctx.prisma.token.findFirst({
        where: { characterId: medic.id, sceneId: target.scene.id },
      });
      if (injector) {
        await requireTurnSpend(
          deps,
          campaignId,
          target.scene,
          injector.id,
          { kind: 'action', actionId: CPRED_ACTION_DOSE },
          user,
          CPRED_ACTION_DOSE,
          { silent: true, note: `${drug.name} → ${target.token.name}` },
        );
      }
    }

    // Dawka schodzi z ekwipunku niezależnie od tego, co środek zrobi: fiolka
    // jest pusta także wtedy, gdy Turbo uzdrawiacz trafił na Śmiertelnie
    // Rannego, któremu podręcznik go odmawia.
    const qtyLeft = row.qty - 1;
    const medicSaved = await deps.ctx.prisma.character.update({
      where: { id: medic.id },
      data: {
        data: JSON.stringify(
          mergeCharacterData(medicData, {
            gear: medicData.gear.map((entry) =>
              entry.id === row.id ? { ...entry, qty: qtyLeft } : { ...entry },
            ),
          }),
        ),
      },
    });
    await emitCharacterUpsert(deps, campaignId, toCharacterView(medicSaved, deps.ctx.cpred));

    // Medyk podający **sobie**: cel to ta sama karta, którą właśnie zapisano.
    // Bez tej podmiany `applyDose` scaliłby skutek środka na wiersz sprzed
    // zapisu i cofnął zdjętą dawkę — fiolka zostawała pełna po zastrzyku
    // (znalezione w oględzinach 03.09).
    const effectTarget: DoseTarget =
      target.character?.id === medic.id ? { ...target, character: medicSaved } : target;
    const applied = await applyDose(deps, campaignId, drug, effectTarget);
    await postRecoveryCard(
      deps,
      campaignId,
      user,
      {
        actor: effectTarget.name,
        // „Antybiotyk — od: Frank" ma sens tylko wtedy, gdy podaje ktoś inny.
        // Medyk kłujący sam siebie dostawał kartę „Frank / Antybiotyk — od:
        // Frank", co przy stole czytało się jak pomyłka.
        title:
          effectTarget.character?.id === medic.id ? drug.name : `${drug.name} — od: ${medic.name}`,
        hp: applied.healed,
        lines: [drug.effect, ...(drug.limit ? [drug.limit] : [])],
        ...(applied.note ? { note: applied.note } : {}),
        // Zabarwienie mówi `applyDose`, a nie „czy jest przypis": Antybiotyk
        // działa **i** ma co powiedzieć, a karta pomarańczowa przy udanym
        // zastrzyku czytała się jak odmowa (poprawione w oględzinach 03.09).
        tone: applied.tone ?? 'success',
      },
      effectTarget.scene?.id ?? socket.data.viewedSceneId,
    );

    return { qtyLeft, healed: applied.healed };
  },
});

interface DoseTarget {
  name: string;
  character: Character | null;
  token: Token | null;
  scene: Scene | null;
}

/**
 * Komu wjeżdża igła — i czy podający w ogóle do niego sięga.
 *
 * Zasięg jest ten sam co przy Ustabilizowaniu (długość ramienia), z tego samego
 * powodu: zastrzyk to dotknięcie. Sprawdzany tylko wtedy, gdy obaj stoją na
 * mapie — Medyk bez żetonu na tej scenie podaje w fikcji, a nie w geometrii,
 * i to jedyny wyjątek, bo bez żetonu nie ma też Akcji do zapłacenia.
 */
async function resolveDoseTarget(
  deps: RealtimeDeps,
  campaignId: string,
  medic: Character,
  targetTokenId: unknown,
): Promise<DoseTarget> {
  if (typeof targetTokenId !== 'string' || targetTokenId.length === 0) {
    return { name: medic.name, character: medic, token: null, scene: null };
  }
  const { token, scene } = await requireCampaignToken(deps.ctx.prisma, campaignId, targetTokenId);
  const injector = await deps.ctx.prisma.token.findFirst({
    where: { characterId: medic.id, sceneId: scene.id },
  });
  if (injector && injector.id !== token.id) {
    const metres = metresForRules(
      metresBetweenTokens(
        toTokenView(injector, true),
        toTokenView(token, true),
        toSceneView(scene),
      ),
    );
    if (metres > CPRED_MELEE_REACH_M) throw new RealtimeError('DOSE_OUT_OF_REACH');
  }
  const character = token.characterId
    ? await deps.ctx.prisma.character.findUnique({ where: { id: token.characterId } })
    : null;
  return { name: character?.name ?? token.name, character, token, scene };
}

/**
 * Co dawka robi celowi.
 *
 * Dwa z pięciu środków rusza tu mechaniką (Antybiotyk, Turbo uzdrawiacz), jeden
 * zdejmuje naklejkę (Dynadetoks), a dwa zostają zdaniem na karcie. **Stym jest
 * świadomie wśród tych ostatnich**: „ignoruje kary wynikające z bycia Poważnie
 * Rannym" znaczy zawieszenie −2 w każdym Teście, a to jedyna kara w projekcie,
 * którą liczy siedem różnych ścieżek naraz (rzut, atak, Zwarcie, Konfrontacja,
 * Sieć). Zawieszanie jej z naklejki to ta sama maszyneria, której potrzebuje
 * etap 39 — patrz `zaleglosci.md`.
 */
async function applyDose(
  deps: RealtimeDeps,
  campaignId: string,
  drug: CpredPharmaceutical,
  target: DoseTarget,
): Promise<{ healed: number; note?: string; tone?: 'success' | 'warn' }> {
  if (drug.applies === 'cleanse') {
    if (!target.token) {
      return {
        healed: 0,
        note: 'Nie ma figury na mapie — status zdejmuje MG.',
        tone: 'warn',
      };
    }
    await removeTokenStatus(deps, campaignId, target.token.id, CPRED_POISONED_STATUS_ID);
    return { healed: 0, note: 'Zatrucie zeszło.' };
  }
  if (drug.applies === 'narrative') {
    return { healed: 0, note: 'Bez skutku w mechanice — reszta należy do stołu.' };
  }
  if (drug.applies === 'ignoreSeriousWound') {
    return {
      healed: 0,
      note: 'Kary za Poważnie Rannego zawiesza MG na godzinę — VTT ich nie zdejmuje samo.',
      tone: 'warn',
    };
  }
  if (!target.character) {
    return {
      healed: 0,
      note: 'Figura bez karty postaci nie ma gdzie zapisać tego środka.',
      tone: 'warn',
    };
  }

  const data = parseCharacterData(target.character.data, deps.ctx.cpred);
  if (drug.applies === 'antibiotic') {
    const saved = await deps.ctx.prisma.character.update({
      where: { id: target.character.id },
      data: {
        data: JSON.stringify(
          mergeCharacterData(data, { recovery: cpredApplyAntibiotic(data.recovery) }),
        ),
      },
    });
    await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
    const rate = cpredHealRate({ ...data, recovery: cpredApplyAntibiotic(data.recovery) });
    return data.recovery.stabilized
      ? { healed: 0, note: `Przez tydzień dzień odpoczynku daje ${rate.perDay} PW.` }
      : {
          healed: 0,
          note: 'Zadziała, gdy ktoś wykona Ustabilizowanie — antybiotyk wspiera proces, nie zaczyna go.',
          tone: 'warn',
        };
  }

  // Turbo uzdrawiacz: „o ile cel nie jest Śmiertelnie Ranny".
  if (data.hpCurrent < 1) {
    return {
      healed: 0,
      note: 'Cel jest Śmiertelnie Ranny — Turbo uzdrawiacz na niego nie działa.',
    };
  }
  const gain = data.stats.body + data.stats.will;
  const hpAfter = Math.min(cpredSheetHpMax(data), data.hpCurrent + gain);
  const saved = await deps.ctx.prisma.character.update({
    where: { id: target.character.id },
    data: { data: JSON.stringify(mergeCharacterData(data, { hpCurrent: hpAfter })) },
  });
  await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
  await emitTokensOfCharacter(deps, campaignId, saved);
  if (target.token) await emitTokensById(deps, campaignId, [target.token.id]);
  return { healed: hpAfter - data.hpCurrent };
}
