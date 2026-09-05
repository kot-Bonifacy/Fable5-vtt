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

/** Co jest w pliku: jedna karta, jedna scena albo cała kampania. */
export type ArchiveKind = 'character' | 'scene' | 'campaign';

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

/** Kody odmowy importu; zdania do nich — w `ARCHIVE_REFUSAL_MESSAGES`. */
export type ArchiveRefusalCode =
  'ARCHIVE_MALFORMED' | 'ARCHIVE_FOREIGN' | 'ARCHIVE_WRONG_KIND' | 'ARCHIVE_TOO_NEW';

export const ARCHIVE_REFUSAL_MESSAGES: Readonly<Record<ArchiveRefusalCode, string>> = {
  ARCHIVE_MALFORMED: 'To nie jest plik wymiany VTT — brakuje nagłówka.',
  ARCHIVE_FOREIGN: 'Plik pochodzi z innego programu.',
  ARCHIVE_WRONG_KIND: 'Plik niesie co innego, niż tu wczytujemy.',
  ARCHIVE_TOO_NEW: 'Plik zapisała nowsza wersja VTT — ta nie umie go przeczytać.',
};

/** Jak nazywamy zawartość w zdaniu odmowy. */
const ARCHIVE_KIND_LABELS: Readonly<Record<ArchiveKind, string>> = {
  character: 'kartę postaci',
  scene: 'scenę',
  campaign: 'kampanię',
};

/**
 * Czy ten plik wolno wczytać jako `expected`? `null` znaczy „wolno".
 *
 * Sprawdzenie jest świadomie płytkie: pyta wyłącznie o nagłówek. O to, czy
 * ładunek ma sens, pyta się przy zapisie — tam, gdzie i tak trzeba obejrzeć
 * każde pole, a odmowa umie powiedzieć **które**.
 */
export function archiveRefusal(value: unknown, expected: ArchiveKind): ArchiveRefusalCode | null {
  if (typeof value !== 'object' || value === null) return 'ARCHIVE_MALFORMED';
  const manifest = (value as { manifest?: unknown }).manifest;
  if (typeof manifest !== 'object' || manifest === null) return 'ARCHIVE_MALFORMED';
  const head = manifest as Partial<ArchiveManifest>;
  if (typeof head.version !== 'number' || typeof head.kind !== 'string') return 'ARCHIVE_MALFORMED';
  if (head.app !== ARCHIVE_APP) return 'ARCHIVE_FOREIGN';
  if (head.kind !== expected) return 'ARCHIVE_WRONG_KIND';
  if (head.version > ARCHIVE_VERSION) return 'ARCHIVE_TOO_NEW';
  return null;
}

/**
 * Zdanie odmowy — z dopowiedzeniem, czego się spodziewaliśmy, bo „plik niesie
 * co innego" bez tego zostawia człowieka z pytaniem „to co ma nieść?".
 */
export function archiveRefusalText(code: ArchiveRefusalCode, expected: ArchiveKind): string {
  const message = ARCHIVE_REFUSAL_MESSAGES[code];
  if (code === 'ARCHIVE_WRONG_KIND') {
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
/* Protokół: import przez gniazdo, eksport trasą REST                  */
/* ------------------------------------------------------------------ */

/**
 * `archive:character` — wczytanie karty z pliku.
 *
 * Właściciel jedzie osobno i to jest cały sens: plik pamięta `ownerId` z innej
 * instalacji, a tu kartę komuś się **przypisuje**, a nie odtwarza.
 */
export interface ArchiveCharacterImportPayload {
  /** Zawartość pliku, sparsowana u klienta (`JSON.parse`). */
  file: unknown;
  ownerId: string | null;
  /** Nazwa inna niż w pliku — gdy karta wjeżdża obok już istniejącej. */
  name?: string;
}

/** `archive:scene` — wczytanie sceny z pliku; wjeżdża zawsze jako nieaktywna. */
export interface ArchiveSceneImportPayload {
  file: unknown;
  name?: string;
}

/** Co odsyła udany import: co powstało i o czym trzeba MG powiedzieć. */
export interface ArchiveImportResult {
  id: string;
  name: string;
  /** Zdanie o tym, czego nie dało się odtworzyć; `null`, gdy weszło wszystko. */
  note: string | null;
}

/** Trasy pobierania — jedno miejsce, żeby klient nie sklejał adresów ręką. */
export const ARCHIVE_DOWNLOAD_PATHS = {
  character: (id: string): string => `/api/archive/character/${encodeURIComponent(id)}`,
  scene: (id: string): string => `/api/archive/scene/${encodeURIComponent(id)}`,
  campaign: (includeChat: boolean): string =>
    `/api/archive/campaign?chat=${includeChat ? '1' : '0'}`,
} as const;
