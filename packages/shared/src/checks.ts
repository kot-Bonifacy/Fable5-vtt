/**
 * Wezwanie do Testu (etap 32) i prośba o Test (etap 40) — dwie strony jednej
 * rozmowy: MG prosi postać o rzut, gracz prosi MG o zgodę na rzut.
 *
 * Rdzeń VTT, nie CP RED: tutaj mieszka wyłącznie to, co karta czatu musi
 * narysować (kto, o co prosi, jaki próg, jak poszło) i stan wezwania. Czym
 * właściwie się rzuca — Umiejętnością, Cechą, czymkolwiek, co wymyśli następny
 * system RPG — jedzie w `system` jako nieprzezroczysta paczka, dokładnie tak,
 * jak `RollOpposedMeta.system` wozi kontekst rzutu przeciwstawnego od etapu 14d.
 *
 * Dwie rzeczy, które w tym pliku **nie** stoją i stać nie powinny:
 *
 *  - rozstrzygnięcie „zdane czy nie" — to reguła systemu (`cpredCheckOutcome`),
 *    bo o remisie przy PT decyduje podręcznik, a nie karta czatu,
 *  - lista Umiejętności — wezwanie zna jedynie **etykietę** tego, co ma paść
 *    („Percepcja (INT)"), złożoną przez system w chwili wystawiania.
 *
 * Prośba (`CheckRequestEntry`, niżej) nie dokłada do tego ani jednej reguły:
 * zgoda MG wytwarza zwykłe wezwanie i od tego miejsca wszystko dzieje się tak,
 * jakby wezwanie padło z góry.
 */

/**
 * Kto zobaczy **wynik** wezwania. Samo wezwanie idzie zawsze wzorem szeptu — do
 * MG i do wezwanego — bo niesie prośbę adresowaną do jednej osoby; dopiero
 * karta rzutu obiera jedną z tych dwóch dróg, tych samych, którymi od etapu 06
 * chodzi każdy inny rzut.
 */
export type CheckCallVisibility = 'public' | 'gm';

export const CHECK_CALL_VISIBILITY_LABELS: Record<CheckCallVisibility, string> = {
  public: 'Jawny — widzi cały stół',
  gm: 'Do MG i gracza',
};

/** Najdłuższy opis wydarzenia, jaki MG dopisze do wezwania. */
export const CHECK_CALL_PROMPT_MAX = 300;

/** Widełki progu, który MG wpisuje z ręki (drabinka podręcznika mieści się w nich). */
export const CHECK_CALL_DV_MIN = 1;
export const CHECK_CALL_DV_MAX = 60;

/** Widełki liczby drugiej strony w rzucie przeciwstawnym (Cecha + Umiejętność). */
export const CHECK_CALL_OPPONENT_MIN = 0;
export const CHECK_CALL_OPPONENT_MAX = 30;

/**
 * Wezwanie do Testu, tak jak je widzi karta czatu.
 *
 * Zapisywane w `payload` wiadomości rodzaju `check` i **jedyne** źródło prawdy
 * o tym, co zaraz padnie: kiedy gracz sięgnie po kubek, serwer czyta stąd
 * Umiejętność, modyfikator i próg. Klient ich nie podaje — tak samo jak nie
 * podaje mnożnika serii przy obrażeniach (umowa z etapu 16).
 */
export interface CheckCallEntry {
  /** Karta, która ma rzucić. */
  characterId: string;
  /** Nazwa postaci, zdenormalizowana — karta ma przeżyć skasowanie karty. */
  characterName: string;
  /** Właściciel karty; `null` znaczy „NPC, rzuca MG". */
  ownerId: string | null;
  /** „Percepcja (INT)" — co ma paść, nazwane przez system przy wystawianiu. */
  rollLabel: string;
  /** Opis wydarzenia od MG: „Coś brzęknęło pod stopą…". */
  prompt?: string;
  /** Poziom Trudności. Nieobecny, gdy wezwanie jest przeciwstawne. */
  dv?: number;
  /** Nazwa szczebla drabinki, gdy PT wzięto z tabeli („Trudny"). */
  dvLabel?: string;
  /** Rzut przeciwstawny: stała druga strony, do której serwer dorzuci 1k10. */
  opponentBonus?: number;
  /** Modyfikator sytuacyjny narzucony przez MG — jedzie do rzutu jako wiersz rozbicia. */
  modifier?: number;
  /** Kto zobaczy wynik. */
  visibility: CheckCallVisibility;
  /** Żądanie dla systemu (CP RED: `CpredRollRequest`) — tu nieprzezroczyste. */
  system: Record<string, unknown>;
  /** Kto wystawił wezwanie — karta mówi to wezwanemu. */
  calledByName: string;
  /** Wypełniane, gdy kości już padły. */
  resolved?: {
    /** Karta rzutu, która z tego wyszła. */
    messageId: number;
    /** Kto potrząsnął kubkiem — gracz albo MG w jego zastępstwie. */
    byName: string;
    success: boolean;
    /** Wynik rzutu, żeby karta wezwania nie musiała szukać tamtej wiadomości. */
    total: number;
  };
  /** Wypełniane, gdy MG odwołał wezwanie, zanim ktokolwiek rzucił. */
  cancelled?: { byName: string };
}

/** Wezwanie, na które nikt jeszcze nie rzucił i którego nikt nie odwołał. */
export function isCheckCallOpen(entry: CheckCallEntry): boolean {
  return entry.resolved === undefined && entry.cancelled === undefined;
}

/**
 * Kto może potrząsnąć kubkiem: właściciel karty albo MG (etap 32, decyzja MG
 * z 02.09 — gracz offline, NPC i bot nie mogą zatrzymać sceny).
 */
export function mayAnswerCheckCall(entry: CheckCallEntry, userId: string, isGm: boolean): boolean {
  if (!isCheckCallOpen(entry)) return false;
  return isGm || entry.ownerId === userId;
}

/** „PT 15 (Profesjonalny)" albo „przeciw 14 + 1k10" — próg jednym zwrotem. */
export function checkCallTargetText(entry: CheckCallEntry): string {
  if (entry.opponentBonus !== undefined) {
    return `przeciwstawny — druga strona: ${entry.opponentBonus} + 1k10`;
  }
  if (entry.dv === undefined) return 'bez progu';
  return entry.dvLabel ? `PT ${entry.dv} (${entry.dvLabel})` : `PT ${entry.dv}`;
}

/* ------------------------------------------------------------------ *
 * Prośba gracza o Test (etap 40)
 * ------------------------------------------------------------------ */

/**
 * Brakująca połowa pętli z etapu 32: gracz wskazuje z karty Umiejętność albo
 * Cechę i pyta MG, czy da się tym rzucić.
 *
 * Prośba **nie jest** drugą mechaniką Testu. Zgoda MG tworzy zwykłe
 * `CheckCallEntry` — z kartą, wołającym kubkiem, Szczęściem i werdyktem — a ta
 * struktura żyje wyłącznie po to, żeby karta czatu miała co narysować, zanim
 * MG kliknie. Dlatego nie ma tu ani progu, ani widoczności: **jedno i drugie
 * należy do MG** i pojawia się dopiero w wezwaniu, które z prośby powstanie.
 *
 * `system` jedzie nieprzezroczyste, tą samą umową, co w `CheckCallEntry`: czym
 * się rzuca, wie CP RED, a karta zna wyłącznie napis „Odczytywanie emocji
 * (EMP)", złożony przy wystawianiu prośby.
 */
export interface CheckRequestEntry {
  /** Karta, którą gracz chce rzucić — zawsze jego własna. */
  characterId: string;
  /** Nazwa postaci, zdenormalizowana — karta ma przeżyć skasowanie karty. */
  characterName: string;
  /** Kto prosi. Do **rysowania**; prawo do działania czyta się z bazy. */
  askedById: string;
  askedByName: string;
  /** „Odczytywanie emocji (EMP)" — nazwane przez system przy wystawianiu. */
  rollLabel: string;
  /** Zdanie „po co": „chcę zrozumieć, co znaczy ta mina". */
  reason?: string;
  /** Żądanie dla systemu (CP RED: `CpredRollRequest`) — tu nieprzezroczyste. */
  system: Record<string, unknown>;
  /** Wypełniane, gdy sprawa jest zamknięta; brak znaczy „czeka na MG". */
  resolution?: CheckRequestResolution;
}

/** Jak skończyła się prośba. */
export type CheckRequestResolutionKind = 'approved' | 'refused' | 'withdrawn';

export const CHECK_REQUEST_RESOLUTION_LABELS: Record<CheckRequestResolutionKind, string> = {
  approved: 'Zgoda',
  refused: 'Odmowa',
  withdrawn: 'Wycofana',
};

export interface CheckRequestResolution {
  kind: CheckRequestResolutionKind;
  /** Kto zamknął — MG przy zgodzie i odmowie, proszący przy wycofaniu. */
  byName: string;
  /** Wezwanie, które z tej zgody powstało — karta odsyła do niego numerem. */
  callMessageId?: number;
  /** „PT 15 (Trudny)" albo „przeciw 14 + 1k10" — próg, na który MG przystał. */
  targetText?: string;
  /** Zdanie MG przy odmowie: „nie ma na to rzutu — po prostu widzisz, że…". */
  note?: string;
}

/** Ile próśb naraz może czekać od jednego gracza (decyzja MG z 06.09.2026). */
export const CHECK_REQUEST_OPEN_MAX = 3;

/** Prośba, na którą MG jeszcze nie odpowiedział i której nikt nie wycofał. */
export function isCheckRequestOpen(entry: CheckRequestEntry): boolean {
  return entry.resolution === undefined;
}

/**
 * Kto może wycofać prośbę: ten, kto ją wysłał.
 *
 * MG **nie** jest tu wymieniony, w odróżnieniu od `mayCancelInventoryMove` —
 * i to jest różnica, nie przeoczenie: MG ma na tej karcie własne wyjście
 * („Odmów"), które zostawia graczowi zdanie wyjaśniające. Ciche wycofanie
 * cudzej prośby wyglądałoby u gracza jak zgubiona wiadomość.
 */
export function mayCancelCheckRequest(entry: CheckRequestEntry, userId: string): boolean {
  return isCheckRequestOpen(entry) && entry.askedById === userId;
}

/** „Zgoda — PT 15 (Trudny)", „Odmowa", „Wycofana" — plakietka zamkniętej karty. */
export function checkRequestResolutionLabel(entry: CheckRequestEntry): string {
  const resolution = entry.resolution;
  if (!resolution) return '';
  const label = CHECK_REQUEST_RESOLUTION_LABELS[resolution.kind];
  return resolution.targetText ? `${label} — ${resolution.targetText}` : label;
}
