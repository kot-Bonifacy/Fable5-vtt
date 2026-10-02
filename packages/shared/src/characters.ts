/**
 * Core (system-agnostic) character wire types. The sheet's contents live in
 * the opaque `data` payload — its shape, validation and derived values belong
 * to the game-system module (`systems/cpred`), never to the VTT core.
 *
 * Visibility rule: a character is delivered only to its owner and the GM.
 * All character emissions are targeted (owner sockets + GM room) and carry no
 * room seq — the pattern used by whispers and gmrolls.
 */

// Type-only: `protocol.ts` imports `CharacterView` from here, so a value
// import would close a cycle. The gesture lives there with the other roll
// payloads that carry one.
import type { RollGesture } from './protocol.js';
import type { PortraitCrop } from './portrait-crop.js';

export const CHARACTER_NAME_MAX_LENGTH = 64;

/** A character as seen by someone allowed to see it (the owner or the GM). */
export interface CharacterView<TData = unknown> {
  id: string;
  name: string;
  /** Owning player's user id; null = GM-controlled (NPC). */
  ownerId: string | null;
  /** `/uploads/...` portrait; null renders a placeholder. */
  portraitUrl: string | null;
  /** System-specific sheet payload (validated by the system module). */
  data: TData;
  /**
   * Naprawa 3c: czy MG uznał tę postać za gotową do gry.
   *
   * `false` niesie wyłącznie karta świeżo z kreatora, którą prowadzi gracz —
   * wszystko inne (import, ręczna karta, statysta, karta sprzed 3c) jest gotowe
   * od razu. Znacznik niczego nie blokuje: liczy znaczek na zakładce
   * „Postacie" i stawia na karcie napis „czeka na MG".
   */
  playReady: boolean;
  /**
   * #49 (02.10): numer zapisu wiersza — rośnie przy każdym. Widok z mniejszym
   * numerem niż ten, który klient już ma, jest echem starszego zapisu
   * (przyszedł za animacją rzutu) i nie może cofnąć karty.
   */
  revision: number;
  updatedAt: string;
}

/**
 * Klient → serwer: MG nadaje ranę krytyczną z ręki (sesja naprawcza 22.08).
 *
 * Sam identyfikator wpisu — resztę (nazwę, efekt, kary, flagi tur) serwer
 * czyta z kompendium tą samą drogą, którą czyta ją rzut na obrażenia.
 */
export interface CharacterInjuryPayload {
  characterId?: string;
  /**
   * Figura bez karty, której MG nadaje ranę (31.08) — zamiast `characterId`,
   * nigdy obok. Statysta nosi Rany Krytyczne od 29.08, ale wchodziły mu
   * wyłącznie regułą (gaz, granat, strefa, Celowanie); ręka MG kończyła się
   * na zdaniu „ranę rozstrzyga MG", a rana rozstrzygnięta narracyjnie nie
   * odbierała figurze Akcji ani nie dawała się potem załatać.
   */
  tokenId?: string;
  injuryId: string;
}

/**
 * Client → server payload of `character:create` — GM only (a blank sheet for a
 * quick NPC); a player's character goes through the creator (`creation:*`).
 */
export interface CharacterCreatePayload {
  name: string;
  /** `null` or absent: an NPC. */
  ownerId?: string | null;
}

/** Mutable character fields; a patch carries any subset. */
export interface CharacterPatch {
  name?: string;
  /** GM only. */
  ownerId?: string | null;
  portraitUrl?: string | null;
  /** Partial system data — top-level keys replace the stored ones. */
  data?: Record<string, unknown>;
}

/** Client → server payload of `character:update`. */
export interface CharacterUpdatePayload {
  characterId: string;
  patch: CharacterPatch;
}

/**
 * Client → server payload of `character:combat-awareness` (stage 30a).
 *
 * The Solo's allocation has its own event rather than riding a sheet patch,
 * because saving it can cost an Action: „w trakcie walki (w ramach Akcji)"
 * (s. 146). A price with an unpriced door beside it is not a price.
 */
export interface CharacterCombatAwarenessPayload {
  characterId: string;
  /** Ability id → points; anything missing is zero. */
  allocation: Record<string, number>;
  /**
   * The figure spending the Action, when this sheet is standing on the scene.
   * Absent means „nobody is in a fight over this" — the change is then free,
   * which is also what happens outside combat.
   */
  tokenId?: string;
}

/**
 * Client → server payload of `character:field-repair` (stage 30b).
 *
 * „Prowizorka" costs an Action (s. 147), so it leaves the sheet-patch path for
 * the same reason the Solo's allocation did — and it is the only way to end one
 * as well: `undo` puts the ablated SP back, which costs nothing.
 */
export interface CharacterFieldRepairPayload {
  characterId: string;
  /** Row of `data.armor` being bodged back together. */
  armorRowId: string;
  /** The figure spending the Action, when this sheet is standing on a scene. */
  tokenId?: string;
  /** Ending a bodge rather than making one — free, and no Action is booked. */
  undo?: boolean;
}

/**
 * Client → server payload of `character:backup-call` (stage 30c).
 *
 * „Aby wezwać Wsparcie, w ramach Akcji musisz wyrzucić na 1k10…" (s. 158) — an
 * Action and two dice, so it leaves the sheet-patch path for the same reason
 * the two before it did. The Action is charged whether or not anybody answers.
 */
export interface CharacterBackupCallPayload {
  characterId: string;
  /**
   * Category being called, as a Backup **level** 1–10: „grupę Wsparcia
   * o poziomie równym lub niższym wartości Zdolności Specjalnej". The choice is
   * the Lawman's, so it travels rather than being derived from the rank.
   */
  level: number;
  /** The figure calling — they arrive next to it, and it pays the Action. */
  tokenId?: string;
  /** Dice gesture, so the roll lands on chat like any other (stage 08). */
  gesture?: RollGesture;
}

/**
 * Client → server payload of `backup:resolve` (stage 30c, GM only).
 *
 * One event for the three things a GM does to a group in transit: name the
 * second category a rank-10 six promised (`tierId`), bring them in early or
 * out of combat (`place`), or call the whole thing off (`cancel`).
 */
export interface BackupResolvePayload {
  /** Row of `Combat.systemState.backup`; absent when placing a fresh call. */
  pendingId?: string;
  /** Category the GM names for the second group. */
  tierId?: string;
  /** Scene they arrive on; defaults to the one the GM is viewing. */
  sceneId?: string;
  action: 'second' | 'place' | 'cancel';
}

/**
 * Client → server payload of `character:team-hire` (stage 30c).
 *
 * „Korpo decyduje, jakiego rodzaju pracownika potrzebuje, a następnie losuje
 * w odpowiedniej tabeli Cechy tej Postaci" (s. 155) — the profession is chosen,
 * the numbers are not.
 */
export interface CharacterTeamHirePayload {
  characterId: string;
  professionId: string;
  /** Employee's name; HR does not roll for that. */
  name: string;
  /** „początkowa Lojalność tego pracownika wynosi tylko 1" — a replacement. */
  replacement?: boolean;
}

/** Client → server payload of `character:team-loyalty` (stage 30c). */
export interface CharacterTeamLoyaltyPayload {
  characterId: string;
  /** The employee's own character id. */
  memberId: string;
  /**
   * What just happened, as an id of `CPRED_LOYALTY_CHANGES`; absent when the
   * GM is rolling a Loyalty Test instead of adjusting the number.
   */
  changeId?: string;
  /** Roll the Test („MG musi rzucić 1k6") rather than change the number. */
  test?: boolean;
  /** „jeśli na koniec sesji wynosi powyżej 10" — the between-sessions trim. */
  endSession?: boolean;
  /** Let them go: the row leaves the roster, the sheet stays. */
  dismiss?: boolean;
}

/**
 * Client → server payload of `character:haggle` (stage 30d).
 *
 * „Targowanie się to zdolność dobicia targu. Gdy z kimś się targujesz, rzucasz
 * CHA + Handel + Poziom […] Znajomości + 1k10 przeciw rzutowi przeciwnika"
 * (s. 159) — two rolls, and a struck bargain that changes what the next
 * purchase costs. Both are prices a sheet patch has no way to pay, so this
 * leaves the patch path exactly as `eddies` and the Korpo's roster did.
 */
export interface CharacterHagglePayload {
  characterId: string;
  /**
   * Which bargain is being struck, as an id of `CPRED_HAGGLE_DEALS`. The choice
   * is the Fixer's („o poziomie Znajomości **lub niższym**"), so it travels
   * rather than being derived from the rank. Absent when the Fixer is dropping
   * a struck bargain instead of making one.
   */
  dealId?: string;
  /**
   * The other side's own CHA + Handel + Znajomości, as one number the GM names.
   * Their d10 is rolled here — a merchant is fiction, not a sheet, and asking
   * the GM for three separate numbers would be asking three times for one.
   */
  opponentBonus?: number;
  /** Dice gesture, so the roll lands on chat like any other (stage 08). */
  gesture?: RollGesture;
  /** Drop the bargain waiting on the sheet; no roll, no card. */
  clear?: boolean;
}

/**
 * Klient → serwer: `character:stat-effect` (etap 39) — MG nakłada albo zdejmuje
 * efekt czasowy modyfikujący Cechę.
 *
 * Zdarzenie, a nie łata karty, z tego samego powodu co `eddies` w 23b: efekt
 * ma **cenę**, którą trzeba zapłacić przy nałożeniu — wylosować 1k6 i zapisać
 * wynik, a potem policzyć oba terminy z bieżącej rundy i zegara świata. Gracz,
 * który mógłby wpisać sobie listę, zdejmowałby z siebie narkotyk bez pytania;
 * MG, który mógłby ją wpisać, omijałby losowanie i zapis terminu, a efekt bez
 * terminu nigdy by nie zszedł.
 *
 * `stat` jedzie **napisem**, nie typem CP RED: ten plik jest rdzeniem VTT
 * i o Cechach Cyberpunka nie wie nic — sprawdza je serwer przez `isCpredStatId`,
 * tak samo jak `injuryId` wyżej sprawdza kompendium.
 */
export interface CharacterStatEffectPayload {
  characterId: string;
  /** Zdejmowanie: id wiersza z karty. Bez tego pola żądanie jest nałożeniem. */
  effectId?: string;
  /** Nakładanie: id Cechy („ref", „move"). */
  stat?: string;
  /**
   * Zmiana ze znakiem, gdy MG zna liczbę. Wyklucza się z `formula` — dwa
   * wejścia naraz znaczyłyby, że jedno z nich jest po cichu ignorowane.
   */
  value?: number;
  /** Notacja, którą **rzuca serwer** („1k6"); znak bierze się z `negative`. */
  formula?: string;
  /** Rzut z `formula` ma obniżyć Cechę (Nerwosol), a nie ją podnieść. */
  negative?: boolean;
  /** „Nerwosol" — co pisze chip i karta czatu. */
  source?: string;
  /** Długość w sekundach fikcji; domyślnie godzina. */
  durationS?: number;
  /** Wpis kompendium, z którego efekt przyszedł. */
  compendiumId?: string;
}

/**
 * Klient → serwer: `character:rest` — jeden pełny dzień odpoczynku (s. 222–223).
 *
 * Zdarzenie, a nie łatka karty, z tego samego powodu co Prowizorka i wezwanie
 * Wsparcia wyżej: dzień odpoczynku **liczy** PW z Budowy Ciała, chromu
 * i antybiotyku, a liczenie po stronie klienta byłoby zaproszeniem do wpisania
 * sobie dowolnej liczby. Karta czatu jest przy okazji jedynym śladem, jaki
 * upływ czasu w ogóle zostawia — zegara świata projekt nie ma do etapu 37.
 */
export interface CharacterRestPayload {
  characterId: string;
  /**
   * „Jeśli pacjent przesadzi, za ten dzień nie odzyskuje PW, a jego rany
   * otwierają się" (s. 223). Deklaracja MG albo gracza, bo VTT nie ma jak
   * sprawdzić, czy ktoś się nadwyrężył — tak samo jak ruch utrudniony z 14c.
   */
  strained?: boolean;
}

/**
 * Klient → serwer: `character:craft-pharma` — partia dawek farmaceutyku (s. 150).
 *
 * „Z surowców wartych 200 ed w ciągu godziny Medyk potrafi wytworzyć liczbę
 * dawek równą wartości swojej Umiejętności Technologia Medyczna", a wcześniej
 * musi zdać Test o PT 13 — „W przypadku porażki surowce przepadają". Rzut robi
 * serwer i to on zdejmuje eurodolce, bo obie te rzeczy mają swoje księgi.
 */
export interface CharacterCraftPharmaPayload {
  characterId: string;
  /** Id środka z `CPRED_PHARMACEUTICALS`. */
  pharmaId: string;
  gesture?: RollGesture;
}

/**
 * Klient → serwer: `character:use-dose` — podanie jednej dawki (s. 150).
 *
 * „Wstrzyknięcie jednej dawki środka farmakologicznego zajmuje Akcję", a
 * „Postać niebędąca Medykiem nie potrafi poprawnie podawać farmaceutyków".
 * Dawka schodzi z wiersza ekwipunku podającego, skutek ląduje na celu — to dwie
 * różne karty postaci i dlatego payload niesie oba końce.
 */
export interface CharacterUseDosePayload {
  /** Kto podaje — właściciel wiersza ekwipunku z dawkami. */
  characterId: string;
  /** Wiersz `data.gear` z `consumable`. */
  gearRowId: string;
  /**
   * Komu — żeton na scenie. Pominięty znaczy „sobie", co jest najczęstszym
   * przypadkiem przy stole i jedynym, który nie potrzebuje mapy.
   */
  targetTokenId?: string;
  /**
   * Cel się broni (s. 150): „w ramach Akcji wykonujesz jeden Atak bronią białą
   * i jeśli trafisz, zamiast zadać obrażenia, wstrzykujesz" — strzykawką
   * bezigłową z ekwipunku. Serwer rzuca ZW + Broń biała przeciw ZW + Unik celu;
   * pudło kosztuje Akcję, ale dawka zostaje w strzykawce (decyzja MG z 25.09).
   */
  hostile?: boolean;
  /** Gest rzutu ataku — tylko przy `hostile`. */
  gesture?: RollGesture;
}

/** Client → server payload of `character:delete` (owner or GM). */
export interface CharacterIdPayload {
  characterId: string;
}

/**
 * Klient → serwer: MG przyjmuje postać do gry albo cofa gotowość (naprawa 3c).
 *
 * Osobne zdarzenie, nie pole łaty karty — to decyzja MG, a nie wartość
 * zapisywana autozapisem arkusza (ta sama umowa, co `eddies` z 23b).
 */
export interface CharacterPlayReadyPayload {
  characterId: string;
  ready: boolean;
}

/** Server → client `character:upsert` — always targeted, never sequenced. */
export interface CharacterUpsertBroadcast {
  character: CharacterView;
}

/** Server → client `character:delete` — also sent to a player who lost ownership. */
export interface CharacterDeleteBroadcast {
  characterId: string;
}

/**
 * Server → client: the wizard's stored draft (stage 25a).
 *
 * The draft's contents are opaque here for the same reason a sheet's are —
 * their shape belongs to the game-system module, not to the VTT core.
 */
export interface CreationDraftView<TDraft = unknown> {
  id: string;
  rankApproved: boolean;
  revision: number;
  draft: TDraft;
  updatedAt: string;
}

/** Client → server `creation:patch`; top-level keys replace the stored ones. */
export interface CreationPatchPayload {
  patch: Record<string, unknown>;
  draftId?: string;
  revision?: number;
  requestId?: string;
}

/**
 * Client → server `creation:roll` — one d10 for one stat (zlecenie MG z 17.09).
 *
 * The gesture is the point rather than a decoration: the shake's entropy is
 * mixed into the server's RNG, so the hand that threw the cup genuinely picks
 * the face. A player rolls each stat once, through the cup, and cannot throw a
 * stat that already has a die — only the GM's „Pozwól przerzucić" takes it
 * off. Without `statId` the GM's plain button rolls every stat still missing
 * in one card, because a GM builds five NPCs in an evening; a player sending
 * that is refused.
 */
export interface CreationRollPayload {
  statId?: string;
  gesture?: RollGesture;
}

/**
 * Client → server `creation:reroll` (GM only) — takes the dice off one stat,
 * or all of them, in any draft of the campaign, so its owner can throw again.
 */
export interface CreationRerollPayload {
  draftId: string;
  statId?: string;
}

/** Server → the draft's owner `creation:rerolled` — which stats lost their dice. */
export interface CreationRerolledPush {
  draftId: string;
  statIds: string[];
}

/**
 * Client → server `creation:buy` (stage 25c) — one item into or out of the
 * wizard's basket.
 *
 * A delta rather than a quantity, so two clicks on „+" that race each other
 * cannot land on the same total: the server reads the basket, applies the step
 * and writes it back, exactly as the skill „+" does with a patch.
 */
export interface CreationBuyPayload {
  entryId: string;
  /** +1 adds a copy, −1 removes one; nothing else is accepted. */
  delta: number;
}

/** Client → server `creation:finish` — turns the draft into a real character. */
export interface CreationFinishPayload {
  draftId?: string;
  /** GM only; players always own what they create. */
  ownerId?: string | null;
}

export interface CreationFinishResult extends CharacterView {
  /**
   * `awaiting-gm` (24.09): a player's character waits for „Przyjmij do gry"
   * and walks onto the map only then.
   */
  tokenStatus: 'not-requested' | 'placed' | 'no-scene' | 'failed' | 'awaiting-gm';
}

/**
 * One player's Kompletny Pakiet draft on the GM's rank list (naprawa 2b). The
 * list reaches only the GM — as the `creation:ranks` answer and, after every
 * change to it, pushed as `creation:ranks-sync` — and carries metadata alone,
 * never the player's choices or biography.
 */
export interface CreationRankDraft {
  id: string;
  userName: string;
  characterName: string;
  /**
   * Since 24.09 the list holds Krawędziarz drafts as well: the GM is the only
   * one who can let a player roll a stat again.
   */
  method: 'complete' | 'edgerunner';
  /** Stats of a Krawędziarz draft that already have their die. */
  rolledStats: string[];
  /** The draft's skill budget — the GM's number or the book's 86 (24.09). */
  skillPoints: number;
  /** The GM chose the method with the consent; the player cannot switch it. */
  methodFixed: boolean;
  /** The GM's pick; `null` until one is made (or when it no longer exists). */
  statRankId: string | null;
  /** False while the player waits — what the tab badge counts. */
  rankApproved: boolean;
}

/**
 * Server → client answer to `creation:peek` (naprawa 3d): is there a draft of
 * mine in this campaign, and what does it look like from the outside. After F5
 * the „Postacie" tab showed a plain „Kreator postaci…" — nothing said a
 * half-built Medyk was waiting on the server. The header alone (name, Role,
 * method, step) is enough for „Wznów szkic: Medyk „Igła” · Wyposażenie"; the
 * choices themselves come only with `creation:start`, as before.
 */
/**
 * Where a player stands with the GM's consent to a new character (24.09).
 * Without a draft a player first asks („requested"), the GM agrees („granted"),
 * and the wizard opens only after the rules were read and accepted. The GM
 * never needs one.
 */
export interface CreationPermitState {
  status: 'none' | 'requested' | 'granted';
  rulesAccepted: boolean;
  /** What the GM set with the consent; null before it (or for an old consent). */
  terms?: CreationTerms | null;
  /** Set on the push that answers a refusal, so the panel can say so once. */
  refused?: boolean;
}

/**
 * What the GM decides with the consent (decyzja MG z 24.09): the method, the
 * „Ranga Postaci" that pays for Kompletny Pakiet's stats, and the skill
 * budget — the book's 86, or the GM's own number.
 */
export interface CreationTerms {
  method: 'edgerunner' | 'complete';
  statRankId: string;
  skillPoints: number;
}

/** One player on the GM's list who asked for, or holds, a consent without a draft yet. */
export interface CreationPermitRow {
  userId: string;
  userName: string;
  status: 'requested' | 'granted';
  rulesAccepted: boolean;
  terms: CreationTerms | null;
}

/**
 * Client → server `creation:permit` (GM only) — agree to (with the terms),
 * refuse or revoke a request. Agreeing again to a consent not used yet
 * rewrites its terms.
 */
export interface CreationPermitPayload {
  userId: string;
  grant: boolean;
  terms?: CreationTerms;
}

/** Client → server `creation:terms` (GM only) — new terms for a player's draft. */
export interface CreationTermsPayload {
  draftId: string;
  terms: CreationTerms;
}

export interface CreationDraftPeek {
  id: string;
  /** The nickname typed so far — may be empty. */
  name: string;
  /** Role name in the table's language, or `null` before a Role is picked. */
  roleName: string | null;
  method: string;
  step: string;
  updatedAt: string;
}

/**
 * Client → server `creation:lifepath-roll` (stage 25b) — one throw covering one
 * Lifepath table, from the dice cup (zlecenie MG z 17.09).
 *
 * Only the GM may list more than one table: that is the plain „Rzuć brakujące"
 * button for NPCs. `index` picks which friend, enemy or tragic love the row is
 * for and is ignored by the tables that fill a single field.
 */
export interface CreationLifepathRollPayload {
  tableIds: string[];
  index?: number;
  gesture?: RollGesture;
}

/**
 * Client → server `creation:lifepath-count` — „Rzuć 1k10 i odejmij 7" for the
 * number of friends, enemies or tragic loves (s. 50–52).
 */
export interface CreationLifepathCountPayload {
  group: string;
  gesture?: RollGesture;
}

/**
 * Body of `GET /api/cpred` — the system data files as the **server** reads
 * them.
 *
 * Until stage 25a the client fetched `/public/cpred/skills.json` straight off
 * the static route, which meant it only ever saw the sample list in the repo
 * while the server validated against the full private one: 24 skills existed
 * on the server and could not be set on a sheet. One endpoint, one registry.
 */
export interface CpredDataPayload {
  skills: unknown[];
  roles: unknown[];
  /** Character-creation tables (stage 25a); null when no data file was found. */
  creation: unknown;
  /** Lifepath tables (stage 25b); null when no data file was found. */
  lifepath: unknown;
}

/**
 * Jeden portret z puli kampanii (`GET /api/portrait-assets`).
 *
 * Pula jest wspólna dla stołu: dokłada do niej wyłącznie MG, a gracz wybiera
 * z gotowego zestawu — stąd widok jest publiczny dla każdego zalogowanego,
 * inaczej niż biblioteka żetonów, którą ogląda sam MG.
 */
export interface PortraitAssetView {
  /** Wycofany z wyboru; kadr istniejących przypisań pozostaje dostępny. */
  retired?: boolean;
  /**
   * Portret NPC widoczny tylko dla MG (23.09). Gracz dostaje taki wiersz
   * wyłącznie wtedy, gdy coś go już nosi — z pustą nazwą, tylko po kadr.
   */
  gmOnly?: boolean;
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  /** Zajęty przez kartę, figurę, bota lub cudzy szkic; bez danych właściciela. */
  assigned?: boolean;
  /**
   * Jak ta grafika jest ujęta w krążku żetonu (12.09).
   *
   * Kadr jedzie razem z portretem, bo jest cechą **obrazka**, a nie postaci:
   * MG ustawia go raz, dokładając portret do puli, i obowiązuje wszędzie, gdzie
   * ten plik stanie na mapie. Od 25.09 czyta go też baner lewego panelu,
   * gdy nie ma własnego kadru; karta, kreator i czat pokazują oryginał.
   */
  crop: PortraitCrop;
  /**
   * Własny kadr banera portretu w lewym panelu (25.09, zlecenie MG) —
   * `null`, dopóki właściciel go nie ustawi: wtedy baner wylicza się z kadru
   * żetonu. Znaczenie liczb: `portraitBannerCropPlacement`.
   */
  bannerCrop: PortraitCrop | null;
}

/** Najdłuższa nazwa portretu w bibliotece — jak przy żetonach. */
export const PORTRAIT_NAME_MAX_LENGTH = 60;

/** Trims and validates a character name; returns null when invalid. */
export function sanitizeCharacterName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > CHARACTER_NAME_MAX_LENGTH) return null;
  return trimmed;
}
