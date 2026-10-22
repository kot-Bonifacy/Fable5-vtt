/**
 * Kopie zapasowe i pliki wymiany (etap 33) — czysta część, wspólna dla serwera,
 * skryptów konsolowych i klienta.
 *
 * Nazwa „archive", a nie „backup", jest wymuszona: `realtime/backup.ts` na
 * serwerze i `BackupPanel.tsx` u klienta to od etapu 30c Zdolność Roli
 * **Wsparcie** (ang. *Backup*), czyli wezwanie posiłków na mapę. Dwie różne
 * rzeczy o tej samej nazwie w jednym repozytorium kosztowałyby znacznie więcej
 * niż jedno słowo różnicy.
 *
 * Są tu trzy rzeczy i wszystkie trzy są czystymi funkcjami, bo dochodzi do nich
 * więcej niż jedna strona:
 *  - **kształt pliku wymiany** (`ArchiveFile` = manifest + ładunek) z wersją
 *    schematu,
 *  - **odmowa importu** — jedna funkcja i jedna tabela zdań, jak przy odmowach
 *    montażu chromu i limitach wgrywanych obrazów,
 *  - **plan rotacji** snapshotów: który plik zostaje, a który schodzi z dysku.
 *
 * Rotacja liczy się z samych **nazw**, nigdy z czasu modyfikacji pliku: czas
 * pliku zmienia zwykłe skopiowanie katalogu, a nazwa niesie chwilę, w której
 * kopia naprawdę powstała. Nazwa rozstrzyga też dobę, o którą nikt nie musi
 * pytać strefy czasowej — doba jest tym, co w nazwie widać.
 */

/** Kto zapisał plik; obcy plik odmawia się, zanim ktokolwiek go rozpakuje. */
export const ARCHIVE_APP = 'vtt';

/**
 * Wersja schematu pliku wymiany.
 *
 * Podnosi się ją, gdy zmienia się **kształt ładunku**, a nie gdy przybywa
 * kolumna, którą stary import po prostu zignoruje. Import odmawia pliku
 * nowszego, niż potrafi przeczytać — i tylko w tę stronę, bo plik starszy
 * czyta się tym samym kodem.
 */
export const ARCHIVE_VERSION = 1;

/**
 * Co jest w pliku: jedna karta, jedna scena albo cała kampania; od 57c także
 * karty wszystkich graczy kampanii, jeden sklep z kartą handlarza i jeden
 * profil bota z relacjami.
 */
export type ArchiveKind = 'character' | 'scene' | 'campaign' | 'characters' | 'shop' | 'bot';

export const ARCHIVE_KINDS: readonly ArchiveKind[] = [
  'character',
  'scene',
  'campaign',
  'characters',
  'shop',
  'bot',
];

/**
 * Nagłówek pliku wymiany — pierwsza rzecz, jaką widzi człowiek otwierający go
 * w edytorze tekstu, i jedyna, o którą pyta import.
 *
 * `omitted` jest listą **zdań po polsku**, nie kodów: manifest ma odpowiadać na
 * pytanie „czego w tym pliku nie ma" komuś, kto trzyma go pół roku później.
 */
export interface ArchiveManifest {
  app: typeof ARCHIVE_APP;
  kind: ArchiveKind;
  version: number;
  /** Chwila eksportu w ISO 8601 — jedyna data, której plik jest pewien. */
  exportedAt: string;
  /** Nazwa kampanii, z której plik wyszedł; przy imporcie tylko do przeczytania. */
  campaignName: string;
  /** Ile czego jedzie w ładunku: `{ tokens: 13, walls: 16 }`. */
  counts: Record<string, number>;
  /** Czego świadomie nie ma, zdaniami: „Czat — pominięty na życzenie MG". */
  omitted: string[];
  /** Adresy `/uploads/...`, których ładunek się trzyma; same pliki są obok. */
  files: string[];
}

/** Plik wymiany: nagłówek plus to, co naprawdę wyjechało. */
export interface ArchiveFile<TPayload> {
  manifest: ArchiveManifest;
  payload: TPayload;
}

/**
 * Kody odmowy importu; zdania do nich — w `ARCHIVE_REFUSAL_MESSAGES`.
 * `ARCHIVE_PACKAGE_*` (etap 57a) dotyczą samej paczki ZIP, zanim ktokolwiek
 * przeczyta jej dane.
 */
export type ArchiveRefusalCode =
  | 'ARCHIVE_MALFORMED'
  | 'ARCHIVE_FOREIGN'
  | 'ARCHIVE_WRONG_KIND'
  | 'ARCHIVE_TOO_NEW'
  | 'ARCHIVE_PACKAGE_CORRUPT'
  | 'ARCHIVE_PACKAGE_TOO_LARGE'
  | 'ARCHIVE_PACKAGE_UNLISTED'
  | 'ARCHIVE_PACKAGE_UNSAFE_PATH';

export const ARCHIVE_REFUSAL_MESSAGES: Readonly<Record<ArchiveRefusalCode, string>> = {
  ARCHIVE_MALFORMED: 'To nie jest plik wymiany VTT — brakuje nagłówka.',
  ARCHIVE_FOREIGN: 'Plik pochodzi z innego programu.',
  ARCHIVE_WRONG_KIND: 'Plik niesie co innego, niż tu wczytujemy.',
  ARCHIVE_TOO_NEW: 'Plik zapisała nowsza wersja VTT — ta nie umie go przeczytać.',
  ARCHIVE_PACKAGE_CORRUPT:
    'Paczka jest uszkodzona — nie da się jej rozpakować albo plik w środku nie zgadza się z listą.',
  ARCHIVE_PACKAGE_TOO_LARGE: 'Paczka jest za duża, żeby ją tu wczytać.',
  ARCHIVE_PACKAGE_UNLISTED: 'W paczce leży plik, którego nie ma na liście w manifeście.',
  ARCHIVE_PACKAGE_UNSAFE_PATH: 'Paczka próbuje zapisać plik poza swoim katalogiem.',
};

export function isArchiveKind(value: unknown): value is ArchiveKind {
  return ARCHIVE_KINDS.includes(value as ArchiveKind);
}

/** Jak nazywamy zawartość w zdaniu odmowy. */
const ARCHIVE_KIND_LABELS: Readonly<Record<ArchiveKind, string>> = {
  character: 'kartę postaci',
  scene: 'scenę',
  campaign: 'kampanię',
  characters: 'karty graczy',
  shop: 'sklep',
  bot: 'profil bota',
};

/**
 * Czy ten plik wolno wczytać jako `expected`? `null` znaczy „wolno".
 *
 * Sprawdzenie jest świadomie płytkie: pyta wyłącznie o nagłówek. O to, czy
 * ładunek ma sens, pyta się przy zapisie — tam, gdzie i tak trzeba obejrzeć
 * każde pole, a odmowa umie powiedzieć **które**.
 */
export function archiveRefusal(value: unknown, expected?: ArchiveKind): ArchiveRefusalCode | null {
  if (typeof value !== 'object' || value === null) return 'ARCHIVE_MALFORMED';
  const manifest = (value as { manifest?: unknown }).manifest;
  if (typeof manifest !== 'object' || manifest === null) return 'ARCHIVE_MALFORMED';
  const head = manifest as Partial<ArchiveManifest>;
  if (typeof head.version !== 'number' || typeof head.kind !== 'string') return 'ARCHIVE_MALFORMED';
  if (head.app !== ARCHIVE_APP) return 'ARCHIVE_FOREIGN';
  // Bez `expected` (wczytanie z jednego przycisku, etap 57a) rodzaj mówi plik.
  if (expected ? head.kind !== expected : !isArchiveKind(head.kind)) return 'ARCHIVE_WRONG_KIND';
  if (head.version > ARCHIVE_VERSION) return 'ARCHIVE_TOO_NEW';
  return null;
}

/**
 * Zdanie odmowy — z dopowiedzeniem, czego się spodziewaliśmy, bo „plik niesie
 * co innego" bez tego zostawia człowieka z pytaniem „to co ma nieść?".
 */
export function archiveRefusalText(code: ArchiveRefusalCode, expected?: ArchiveKind): string {
  const message = ARCHIVE_REFUSAL_MESSAGES[code];
  if (code === 'ARCHIVE_WRONG_KIND' && expected) {
    return `${message} Wczytujemy tu ${ARCHIVE_KIND_LABELS[expected]}.`;
  }
  return message;
}

/* ------------------------------------------------------------------ */
/* Snapshoty bazy: nazwa i rotacja                                     */
/* ------------------------------------------------------------------ */

/** Ile kopii zostaje: godzinowe od najświeższej, potem po jednej na dobę. */
export interface SnapshotRules {
  /** Ile najświeższych kopii zostaje bez pytania o dobę. */
  keepHourly: number;
  /** Ile dób wstecz zostaje po jednej (najświeższej z danej doby) kopii. */
  keepDaily: number;
}

/**
 * Domyślna rotacja (decyzja MG z 05.09.2026): doba co godzinę plus dwa tygodnie
 * po jednej dziennie.
 */
export const SNAPSHOT_RULES_DEFAULT: SnapshotRules = { keepHourly: 24, keepDaily: 14 };

const SNAPSHOT_PREFIX = 'snapshot-';
/** `snapshot-2026-09-05-1430` — doba widoczna gołym okiem, porządek = sortowanie. */
const SNAPSHOT_NAME_PATTERN = /^snapshot-(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})$/;

/** Nazwa katalogu kopii z chwili, w której powstała (czas lokalny maszyny). */
export function snapshotName(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${SNAPSHOT_PREFIX}${day}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

/** Doba z nazwy (`2026-09-05`) albo `null`, gdy to nie jest nazwa kopii. */
export function snapshotDayOf(name: string): string | null {
  const match = SNAPSHOT_NAME_PATTERN.exec(name);
  return match?.[1] ?? null;
}

/** Chwila z nazwy — do wyświetlenia w panelu, nie do rotacji. */
export function snapshotDateOf(name: string): Date | null {
  const match = SNAPSHOT_NAME_PATTERN.exec(name);
  if (!match?.[1]) return null;
  const [year = 0, month = 1, day = 1] = match[1].split('-').map(Number);
  return new Date(year, month - 1, day, Number(match[2]), Number(match[3]));
}

export interface SnapshotRotationPlan {
  /** Kopie, które zostają na dysku (nazwy rozpoznane), od najświeższej. */
  keep: string[];
  /** Kopie do skasowania, od najstarszej — kolejność, w jakiej się je usuwa. */
  drop: string[];
  /**
   * Nazwy, których rotacja **nie rozumie** i dlatego nigdy nie skasuje.
   *
   * To nie jest usterka, tylko furtka: kopię, która ma przeżyć wszystko,
   * wystarczy przemianować (`snapshot-2026-09-05-1430` → `przed-refaktorem`).
   */
  ignored: string[];
}

/**
 * Które kopie zostają, a które schodzą.
 *
 * Najświeższe `keepHourly` zostają bez pytania. Ze **starszej reszty** zostaje
 * po jednej — najświeższej — kopii z doby, dla `keepDaily` najświeższych dób,
 * jakie w tej reszcie w ogóle są. Doby liczy się z tego, co leży na dysku, a nie
 * z kalendarza: serwer wyłączony na tydzień ma zostawić dwa tygodnie **kopii**,
 * a nie dwa tygodnie pustki.
 */
export function planSnapshotRotation(names: string[], rules: SnapshotRules): SnapshotRotationPlan {
  const ignored: string[] = [];
  const known: string[] = [];
  for (const name of names) {
    if (snapshotDayOf(name)) known.push(name);
    else ignored.push(name);
  }
  // Format nazwy jest tak dobrany, że porządek leksykalny = porządek czasu.
  known.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

  const keep = new Set(known.slice(0, Math.max(0, rules.keepHourly)));
  const rest = known.slice(Math.max(0, rules.keepHourly));

  const newestPerDay = new Map<string, string>();
  for (const name of rest) {
    const day = snapshotDayOf(name);
    // `rest` idzie od najświeższej, więc pierwszy wpis doby jest tym właściwym.
    if (day && !newestPerDay.has(day)) newestPerDay.set(day, name);
  }
  for (const name of [...newestPerDay.values()].slice(0, Math.max(0, rules.keepDaily))) {
    keep.add(name);
  }

  return {
    keep: known.filter((name) => keep.has(name)),
    drop: known.filter((name) => !keep.has(name)).reverse(),
    ignored,
  };
}

/* ------------------------------------------------------------------ */
/* Widok kopii w panelu MG                                             */
/* ------------------------------------------------------------------ */

/** Jedna kopia tak, jak widzi ją MG w panelu „Kopie". */
export interface SnapshotSummary {
  /** Nazwa katalogu — jednocześnie argument dla `restore`. */
  name: string;
  /** Chwila z nazwy w ISO; `null` dla kopii przemianowanej ręką. */
  takenAt: string | null;
  /** Rozmiar samej bazy w bajtach. */
  dbBytes: number;
  /** Ile plików z `uploads/` leży w tej kopii. */
  files: number;
  /** Czy rotacja tę kopię w ogóle rozważa (nazwa rozpoznana). */
  rotated: boolean;
}

/** Stan katalogu kopii — to, co odsyła `archive:list`. */
export interface SnapshotListView {
  /** Katalog, w którym kopie leżą; MG ma wiedzieć, gdzie ich szukać. */
  directory: string;
  snapshots: SnapshotSummary[];
  rules: SnapshotRules;
  /** Co ile minut powstaje kopia; `0` znaczy „tylko ręcznie". */
  intervalMinutes: number;
}

/** „1,1 MB", „812 kB" — dla wiersza w panelu, nie dla logu. */
export function formatArchiveBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  const mb = Math.round((bytes / (1024 * 1024)) * 10) / 10;
  return `${String(mb).replace('.', ',')} MB`;
}

/* ------------------------------------------------------------------ */
/* Paczka ZIP (etap 57a)                                               */
/* ------------------------------------------------------------------ */

/**
 * Wersja układu paczki — osobna od `ARCHIVE_VERSION`, bo mówi o tym, **jak**
 * dane leżą w ZIP-ie (`manifest.json`, `data.json`, `files/`), a nie o kształcie
 * samych danych.
 */
export const ARCHIVE_PACKAGE_VERSION = 1;
export const ARCHIVE_PACKAGE_MANIFEST = 'manifest.json';
export const ARCHIVE_PACKAGE_DATA = 'data.json';
export const ARCHIVE_PACKAGE_FILES_DIR = 'files';

/** Jeden plik graficzny w paczce: skąd w danych, gdzie w ZIP-ie, ile i jaki skrót. */
export interface ArchivePackageEntry {
  /** Ścieżka w paczce: `files/<katalog>/<plik>`. */
  path: string;
  /** Adres, którym dane się do niego odwołują (przy imporcie przepisywany). */
  url: string;
  bytes: number;
  /** SHA-256 zawartości, szesnastkowo — import porównuje go z tym, co rozpakował. */
  sha256: string;
}

/** Manifest paczki: nagłówek pliku wymiany plus lista plików w `files/`. */
export interface ArchivePackageManifest extends ArchiveManifest {
  package: number;
  entries: ArchivePackageEntry[];
}

/** Katalogi plików kampanii, które jadą w paczce — te same co w `uploads/`. */
const PACKAGE_DIRS = new Set(['maps', 'tokens', 'handouts', 'portraits', 'music']);
const PACKAGE_UPLOAD_URL =
  /^\/uploads\/(?:campaigns\/[A-Za-z0-9_-]+\/)?(maps|tokens|handouts|portraits|music)\/([A-Za-z0-9_-]+\.[A-Za-z0-9]+)$/;
const PACKAGE_FILE_NAME = /^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;

/**
 * Gdzie w paczce leży plik spod tego adresu, albo `null`, gdy adres nie jedzie:
 * pliki wspólne (`/uploads/art/`) i dane `/public/` są na każdym serwerze.
 * Plik kampanii i stary płaski dostają tę samą ścieżkę — liczy się katalog
 * i nazwa, nie to, z której kampanii wyszły.
 */
export function archivePackagePath(url: string): string | null {
  const match = PACKAGE_UPLOAD_URL.exec(url);
  if (!match) return null;
  return `${ARCHIVE_PACKAGE_FILES_DIR}/${match[1]}/${match[2]}`;
}

/**
 * Czy tę ścieżkę z ZIP-a wolno rozpakować (zip slip): tylko manifest, dane
 * i `files/<katalog>/<plik>` z gołych liter — bez `..`, ukośnika na początku,
 * litery dysku i odwrotnego ukośnika.
 */
export function isSafeArchivePath(path: string): boolean {
  if (path === ARCHIVE_PACKAGE_MANIFEST || path === ARCHIVE_PACKAGE_DATA) return true;
  const parts = path.split('/');
  return (
    parts.length === 3 &&
    parts[0] === ARCHIVE_PACKAGE_FILES_DIR &&
    PACKAGE_DIRS.has(parts[1]!) &&
    PACKAGE_FILE_NAME.test(parts[2]!)
  );
}

/** Limity rozpakowania (zip bomb): ile bajtów razem i ile plików. */
export interface ArchivePackageLimits {
  maxBytes: number;
  maxEntries: number;
}

/** Jeden wpis katalogu ZIP tak, jak go widzi czytnik, zanim cokolwiek rozpakuje. */
export interface ArchivePackageListing {
  path: string;
  /** Rozmiar po rozpakowaniu, deklarowany w ZIP-ie (czytnik pilnuje, by się zgadzał). */
  bytes: number;
}

/**
 * Czy wolno rozpakować sam katalog ZIP-a — przed przeczytaniem czegokolwiek,
 * także manifestu: ścieżki (zip slip), liczba plików i łączny rozmiar po
 * rozpakowaniu (zip bomb), komplet `manifest.json` + `data.json`.
 */
export function archiveListingRefusal(
  listing: ArchivePackageListing[],
  limits: ArchivePackageLimits,
): ArchiveRefusalCode | null {
  if (listing.some((entry) => !isSafeArchivePath(entry.path))) return 'ARCHIVE_PACKAGE_UNSAFE_PATH';
  if (listing.length > limits.maxEntries) return 'ARCHIVE_PACKAGE_TOO_LARGE';
  const total = listing.reduce((sum, entry) => sum + Math.max(0, entry.bytes), 0);
  if (total > limits.maxBytes) return 'ARCHIVE_PACKAGE_TOO_LARGE';
  const paths = new Set(listing.map((entry) => entry.path));
  if (paths.size !== listing.length) return 'ARCHIVE_PACKAGE_CORRUPT';
  if (!paths.has(ARCHIVE_PACKAGE_MANIFEST) || !paths.has(ARCHIVE_PACKAGE_DATA)) {
    return 'ARCHIVE_PACKAGE_CORRUPT';
  }
  return null;
}

/**
 * Czy manifest zgadza się z katalogiem ZIP-a: każdy plik graficzny jest na
 * liście z tym samym rozmiarem, każdy z listy leży w paczce, a adres prowadzi
 * do tej samej ścieżki. Skrót SHA-256 sprawdza się dopiero przy rozpakowaniu —
 * tu go jeszcze nie ma. Nagłówek (`app`, `kind`, `version`) pyta osobno
 * `archiveRefusal`.
 */
export function archivePackageRefusal(
  listing: ArchivePackageListing[],
  manifest: unknown,
): ArchiveRefusalCode | null {
  if (typeof manifest !== 'object' || manifest === null) return 'ARCHIVE_MALFORMED';
  const head = manifest as Partial<ArchivePackageManifest>;
  if (typeof head.package !== 'number') return 'ARCHIVE_MALFORMED';
  if (head.package > ARCHIVE_PACKAGE_VERSION) return 'ARCHIVE_TOO_NEW';
  if (!Array.isArray(head.entries)) return 'ARCHIVE_MALFORMED';

  const listed = new Map<string, number>();
  for (const entry of head.entries as unknown[]) {
    const row = entry as Partial<ArchivePackageEntry> | null;
    if (
      !row ||
      typeof row.path !== 'string' ||
      typeof row.url !== 'string' ||
      typeof row.bytes !== 'number' ||
      typeof row.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(row.sha256)
    ) {
      return 'ARCHIVE_MALFORMED';
    }
    if (!isSafeArchivePath(row.path) || archivePackagePath(row.url) !== row.path) {
      return 'ARCHIVE_PACKAGE_UNSAFE_PATH';
    }
    // Dwa adresy z dwóch kampanii mogą prowadzić do jednej ścieżki — wtedy
    // muszą nieść ten sam plik.
    const known = listed.get(row.path);
    if (known !== undefined && known !== row.bytes) return 'ARCHIVE_PACKAGE_CORRUPT';
    listed.set(row.path, row.bytes);
  }
  const paths = new Set(listing.map((entry) => entry.path));
  for (const entry of listing) {
    if (entry.path === ARCHIVE_PACKAGE_MANIFEST || entry.path === ARCHIVE_PACKAGE_DATA) continue;
    const bytes = listed.get(entry.path);
    if (bytes === undefined) return 'ARCHIVE_PACKAGE_UNLISTED';
    if (bytes !== entry.bytes) return 'ARCHIVE_PACKAGE_CORRUPT';
  }
  // Plik z listy, którego w ZIP-ie nie ma: dane wskazywałyby pustkę.
  for (const path of listed.keys()) if (!paths.has(path)) return 'ARCHIVE_PACKAGE_CORRUPT';
  return null;
}

/* ------------------------------------------------------------------ */
/* Protokół: eksport i import trasami REST                             */
/* ------------------------------------------------------------------ */

/** Co odsyła udany import: co powstało i o czym trzeba MG powiedzieć. */
export interface ArchiveImportResult {
  kind: ArchiveKind;
  id: string;
  name: string;
  /** Zdanie o tym, czego nie dało się odtworzyć; `null`, gdy weszło wszystko. */
  note: string | null;
}

/**
 * Trasy pobierania — jedno miejsce, żeby klient nie sklejał adresów ręką.
 * Od etapu 57a każda oddaje paczkę ZIP z grafikami.
 */
export const ARCHIVE_DOWNLOAD_PATHS = {
  character: (id: string): string => `/api/archive/character/${encodeURIComponent(id)}`,
  scene: (id: string): string => `/api/archive/scene/${encodeURIComponent(id)}`,
  campaign: (includeChat: boolean): string =>
    `/api/archive/campaign?chat=${includeChat ? '1' : '0'}`,
  /** Etap 57c: karty wszystkich graczy otwartej kampanii (także czekające na gracza). */
  players: '/api/archive/players',
  /** Etap 57c: sklep po id handlarza (`Merchant.id`) — z kartą i towarem. */
  shop: (id: string): string => `/api/archive/shop/${encodeURIComponent(id)}`,
  /** Etap 57c: profil bota z relacjami. */
  bot: (id: string): string => `/api/archive/bot/${encodeURIComponent(id)}`,
} as const;

/**
 * Wczytanie z pliku (etap 57a): `multipart/form-data` z jednym plikiem — paczką
 * ZIP albo plikiem JSON z etapu 33. Rodzaj mówi manifest: karta i scena wjeżdżają
 * do kampanii otwartej u MG, kampania — zawsze jako nowa.
 */
export const ARCHIVE_IMPORT_PATH = '/api/archive/import';

/** Domyślny sufit wczytywanego pliku (bajty ZIP-a albo JSON-a). */
export const ARCHIVE_IMPORT_MAX_BYTES_DEFAULT = 512 * 1024 * 1024;

/** Domyślne limity rozpakowania paczki. */
export const ARCHIVE_PACKAGE_LIMITS_DEFAULT: ArchivePackageLimits = {
  maxBytes: 2 * 1024 * 1024 * 1024,
  maxEntries: 20_000,
};

/* ------------------------------------------------------------------ */
/* Kopie kampanii i cofnięcie (etap 57b)                               */
/* ------------------------------------------------------------------ */

/**
 * Po co powstała kopia kampanii: start sesji, godzina w jej trakcie, koniec
 * sesji albo kopia bezpieczeństwa tuż przed cofnięciem (decyzje MG 5 i 6).
 */
export type CampaignCopyReason = 'start' | 'hourly' | 'end' | 'rollback';

export const CAMPAIGN_COPY_REASON_LABELS: Readonly<Record<CampaignCopyReason, string>> = {
  start: 'start sesji',
  hourly: 'w trakcie sesji',
  end: 'koniec sesji',
  rollback: 'przed cofnięciem',
};

function isCampaignCopyReason(value: string): value is CampaignCopyReason {
  return value === 'start' || value === 'hourly' || value === 'end' || value === 'rollback';
}

/** Domyślnie zostają kopie z 10 ostatnich sesji (decyzja MG 5). */
export const CAMPAIGN_COPY_KEEP_SESSIONS_DEFAULT = 10;
/** Co ile minut trwającej sesji powstaje kopia „w trakcie” (decyzja MG 5). */
export const CAMPAIGN_COPY_INTERVAL_MINUTES_DEFAULT = 60;

/**
 * `copy-20261022-143005-123-start` — chwila z dokładnością do milisekundy,
 * bo start i koniec krótkiej sesji (i każdy test) mieszczą się w jednej
 * sekundzie, a porządek nazw ma dalej być porządkiem czasu. Czas UTC: nazwy
 * nie czyta człowiek (panel pokazuje `takenAt`), czyta ją rotacja.
 */
const CAMPAIGN_COPY_NAME = /^copy-(\d{8})-(\d{6})-(\d{3})-(start|hourly|end|rollback)$/;

export function campaignCopyName(date: Date, reason: CampaignCopyReason): string {
  const iso = date.toISOString(); // 2026-10-22T14:30:05.123Z
  const day = iso.slice(0, 10).replace(/-/g, '');
  const time = iso.slice(11, 19).replace(/:/g, '');
  return `copy-${day}-${time}-${iso.slice(20, 23)}-${reason}`;
}

/** Chwila i powód z nazwy katalogu kopii, albo `null` dla nazwy spoza schematu. */
export function parseCampaignCopyName(
  name: string,
): { takenAt: Date; reason: CampaignCopyReason } | null {
  const match = CAMPAIGN_COPY_NAME.exec(name);
  if (!match) return null;
  const [, day = '', time = '', ms = '', reason = ''] = match;
  const takenAt = new Date(
    `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}.${ms}Z`,
  );
  if (Number.isNaN(takenAt.getTime()) || !isCampaignCopyReason(reason)) return null;
  return { takenAt, reason };
}

/** Kopia do planu rotacji: nazwa katalogu i sesja, do której należy. */
export interface CampaignCopyRef {
  name: string;
  /** Klucz sesji (chwila jej startu); `null` — kopia spoza sesji (przed cofnięciem). */
  session: string | null;
}

/**
 * Które kopie kampanii zostają: wszystkie z `keepSessions` najświeższych
 * sesji. Kopie jednej sesji (start, co godzinę, koniec) liczą się jako **jedna
 * pozycja** (decyzja MG 5); kopia spoza sesji — jako osobna. Świeżość sesji
 * mówi jej najnowsza kopia, a porządek nazw jest porządkiem czasu, jak
 * w `planSnapshotRotation`. Nazwa spoza schematu nie ginie nigdy.
 */
export function planCampaignCopyRotation(
  copies: CampaignCopyRef[],
  keepSessions: number,
): SnapshotRotationPlan {
  const ignored: string[] = [];
  const known: CampaignCopyRef[] = [];
  for (const copy of copies) {
    if (parseCampaignCopyName(copy.name)) known.push(copy);
    else ignored.push(copy.name);
  }
  known.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));

  const positions: string[] = [];
  const positionOf = (copy: CampaignCopyRef): string =>
    copy.session === null ? `copy:${copy.name}` : `session:${copy.session}`;
  for (const copy of known) {
    const position = positionOf(copy);
    if (!positions.includes(position)) positions.push(position);
  }
  const kept = new Set(positions.slice(0, Math.max(0, keepSessions)));
  return {
    keep: known.filter((copy) => kept.has(positionOf(copy))).map((copy) => copy.name),
    drop: known
      .filter((copy) => !kept.has(positionOf(copy)))
      .map((copy) => copy.name)
      .reverse(),
    ignored,
  };
}

/** Jedna kopia kampanii tak, jak widzi ją MG w zakładce „Kopie”. */
export interface CampaignCopySummary {
  /** Nazwa katalogu — argument pobrania i cofnięcia. */
  name: string;
  takenAt: string;
  reason: CampaignCopyReason;
  /** Start sesji, do której kopia należy (ISO); `null` — kopia spoza sesji. */
  sessionStartedAt: string | null;
  /** Dane plus grafiki — tyle, ile waży pobrana paczka (przed ZIP-em). */
  bytes: number;
  /** Ile grafik leży w kopii. */
  files: number;
  /** Ile kart, scen… — liczniki z manifestu. */
  counts: Record<string, number>;
}

/** Odpowiedź `GET` listy kopii otwartej kampanii. */
export interface CampaignCopyListView {
  /** `false` — ten serwer kopii nie robi (brak `BACKUP_DIR`). */
  enabled: boolean;
  campaignId: string;
  campaignName: string;
  /** Trwa sesja — cofnąć nie wolno (decyzja MG 8). */
  sessionRunning: boolean;
  keepSessions: number;
  intervalMinutes: number;
  /** Od najświeższej. */
  copies: CampaignCopySummary[];
}

/** Co odsyła udane cofnięcie. */
export interface CampaignRollbackResult {
  /** Kopia, do której kampania wróciła. */
  copy: CampaignCopySummary;
  /** Kampania z zawartością sprzed cofnięcia — bez graczy, do ręcznego usunięcia. */
  previous: { id: string; name: string };
  /** Kopia bezpieczeństwa stanu sprzed cofnięcia (na liście kopii tej kampanii). */
  safetyCopy: string;
  /** Ile kart czeka na gracza, którego w kampanii już nie ma. */
  pendingPlayers: string[];
}

/** `archive:copy-failed` — kopia kampanii się nie udała; do MG tej kampanii, nigdy do graczy. */
export interface CampaignCopyFailedPush {
  text: string;
}

/** Trasy kopii kampanii — jedno miejsce, żeby klient nie sklejał adresów ręką. */
export const CAMPAIGN_COPY_PATHS = {
  list: '/api/archive/copies',
  download: (name: string): string => `/api/archive/copies/${encodeURIComponent(name)}`,
  restore: (name: string): string => `/api/archive/copies/${encodeURIComponent(name)}/restore`,
} as const;

/** Odmowy cofnięcia i usunięcia kampanii — zdania dla MG. */
export const CAMPAIGN_COPY_REFUSALS: Readonly<Record<string, string>> = {
  SESSION_ACTIVE: 'Trwa sesja — najpierw ją zakończ.',
  CAMPAIGN_OPEN: 'To jest otwarta kampania — otwórz najpierw inną.',
  CONFIRM_MISMATCH: 'Nazwa nie zgadza się z nazwą kampanii.',
  COPIES_DISABLED: 'Ten serwer nie robi kopii kampanii.',
  NO_CAMPAIGN: 'Brak otwartej kampanii.',
  NOT_FOUND: 'Nie ma takiej kopii — mogła zejść w rotacji.',
  CAMPAIGN_NOT_FOUND: 'Nie ma takiej kampanii.',
};

/** Potwierdzenie nazwą (decyzja MG 8): bez wielkości liter i spacji na brzegach. */
export function confirmsCampaignName(typed: string, name: string): boolean {
  return typed.trim().toLocaleLowerCase('pl') === name.trim().toLocaleLowerCase('pl');
}

/** Sesja kopii w jednym zdaniu: „sesja 22.10, 18:00” albo „poza sesją”. */
export function campaignCopySessionLabel(sessionStartedAt: string | null): string {
  if (!sessionStartedAt) return 'poza sesją';
  const date = new Date(sessionStartedAt);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `sesja ${pad(date.getDate())}.${pad(date.getMonth() + 1)}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/* ------------------------------------------------------------------ */
/* Pojedyncze rzeczy i karta gracza (etap 57c)                         */
/* ------------------------------------------------------------------ */

/** Imię do porównania: bez wielkości liter, spacji na brzegach i podwójnych spacji. */
export function archiveNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pl');
}

/**
 * Wiersz kampanii docelowej o tym imieniu — **tylko jednoznaczny**. Profil bota
 * z innej kampanii zna swoich rozmówców po imieniu, nie po id (id karty w innej
 * kampanii jest inne), więc relacja trafia w kartę o tym samym imieniu. Dwie
 * karty o jednym imieniu to zgadywanie — relacja wtedy przepada i trafia do
 * zdania „czego tu nie ma”.
 */
export function matchArchiveName<T extends { name: string }>(
  rows: readonly T[],
  name: string,
): T | null {
  const key = archiveNameKey(name);
  if (!key) return null;
  const found = rows.filter((row) => archiveNameKey(row.name) === key);
  return found.length === 1 ? found[0]! : null;
}

/**
 * Zgłoszenie karty przez gracza (decyzja MG 9): gracz wgrywa paczkę swojej
 * karty, serwer trzyma ją w poczekalni kampanii do `expiresAt`, a MG
 * przyjmuje albo odrzuca na karcie czatu `cardsubmission`. Gracz kartą nie
 * wchodzi do kampanii sam.
 */
export type CardSubmissionStatus = 'open' | 'accepted' | 'refused' | 'expired';

export interface CardSubmissionEntry {
  /** Katalog poczekalni na serwerze — losowy, nie id karty. */
  submissionId: string;
  /** Gracz, który zgłosił, i jego imię przy stole. */
  userId: string;
  userName: string;
  /** Podgląd dla MG: imię z pliku, Rola i jej Poziom, portret (gdy paczka go niesie). */
  name: string;
  roleName: string | null;
  roleRank: number | null;
  hasPortrait: boolean;
  /** Do kiedy plik czeka w poczekalni (ISO). */
  expiresAt: string;
  status: CardSubmissionStatus;
  /** Po przyjęciu: nowa karta gracza. */
  characterId?: string;
  /** Kto rozstrzygnął (MG). */
  byName?: string;
}

/** Jak długo zgłoszona karta czeka na MG, zanim plik zejdzie z serwera. */
export const CARD_SUBMISSION_TTL_HOURS = 72;

/** Stan zgłoszenia „na teraz” — otwarte po terminie to już wygasłe. */
export function cardSubmissionStatus(
  entry: Pick<CardSubmissionEntry, 'status' | 'expiresAt'>,
  now: number = Date.now(),
): CardSubmissionStatus {
  if (entry.status !== 'open') return entry.status;
  return Date.parse(entry.expiresAt) <= now ? 'expired' : 'open';
}

export function isCardSubmissionOpen(
  entry: Pick<CardSubmissionEntry, 'status' | 'expiresAt'>,
  now: number = Date.now(),
): boolean {
  return cardSubmissionStatus(entry, now) === 'open';
}

/** „Kira — Solo 4” — imię z Rolą i Poziomem, tak jak MG zna postać z listy. */
export function cardSubmissionLabel(
  entry: Pick<CardSubmissionEntry, 'name' | 'roleName' | 'roleRank'>,
): string {
  if (!entry.roleName) return entry.name;
  return `${entry.name} — ${entry.roleName}${entry.roleRank !== null ? ` ${entry.roleRank}` : ''}`;
}

/** Nagłówek karty czatu i tekst w „Czeka na MG”. */
export function cardSubmissionHeadline(
  entry: Pick<CardSubmissionEntry, 'userName' | 'name'>,
): string {
  return `${entry.userName} zgłasza kartę „${entry.name}” do wczytania`;
}

export const CARD_SUBMISSION_STATUS_LABELS: Readonly<Record<CardSubmissionStatus, string>> = {
  open: 'Czeka na MG',
  accepted: 'Przyjęta',
  refused: 'Odrzucona',
  expired: 'Wygasła',
};

/** Trasy zgłoszeń — jedno miejsce, żeby klient nie sklejał adresów ręką. */
export const CARD_SUBMISSION_PATHS = {
  /** `POST`, multipart z paczką karty — wyłącznie gracz. */
  submit: '/api/archive/submissions',
  /** `POST { action: 'accept' | 'refuse' }` — wyłącznie MG kampanii. */
  respond: (messageId: number): string => `/api/archive/submissions/${messageId}/respond`,
  /** `GET` — portret ze zgłoszonej paczki, dla MG kampanii i zgłaszającego. */
  portrait: (submissionId: string): string =>
    `/api/archive/submissions/${encodeURIComponent(submissionId)}/portrait`,
} as const;

/** Odmowy zgłoszenia i decyzji MG — zdania dla gracza i MG. */
export const CARD_SUBMISSION_REFUSALS: Readonly<Record<string, string>> = {
  COMBAT_LOCKED: 'Trwa starcie — kartę zgłosisz, gdy walka się skończy.',
  SUBMISSION_PENDING: 'Twoja poprzednia karta jeszcze czeka na MG.',
  SUBMISSION_CLOSED: 'To zgłoszenie jest już rozstrzygnięte.',
  SUBMISSION_EXPIRED: 'Zgłoszenie wygasło — gracz może zgłosić kartę jeszcze raz.',
  SUBMISSION_CONTAINER: 'To karta skrzyni albo stosu, nie postaci.',
  NOT_MEMBER: 'Gracza nie ma już w tej kampanii.',
  NO_CAMPAIGN: 'Nie siedzisz w żadnej kampanii.',
  FORBIDDEN: 'Kartę zgłasza gracz — MG wczytuje pliki w zakładce „Kopie”.',
  NOT_FOUND: 'Nie ma takiego zgłoszenia.',
};
