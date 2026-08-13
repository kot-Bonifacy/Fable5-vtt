/**
 * Handouty — materiały MG podawane graczom do ręki (etap 24a).
 *
 * Rdzeń VTT, nie system RPG: „kartka z grafiką i tekstem" nie wie nic
 * o Cyberpunku i nic z `systems/cpred` tu nie wchodzi.
 *
 * Trzy rzeczy niosą ten plik.
 *
 * 1. **Lista odbiorców jest własnością handoutu i nigdy nie opuszcza MG.**
 *    Gracz dostaje handout albo go nie dostaje — nie dowiaduje się, komu jeszcze
 *    MG go pokazał. Dlatego `sharedWith` jest polem **opcjonalnym** widoku:
 *    obecność listy znaczy „patrzy na to MG", a nie „lista jest pusta".
 * 2. **Filtruje zapytanie, nie klient.** Handout nieudostępniony nie pojawia się
 *    w żadnym payloadzie gracza — to ta sama reguła, którą tokeny trzymają od
 *    etapu 05.
 * 3. **Treść jest markdownem, a nie HTML-em.** Renderuje ją `markdown.ts` do
 *    drzewa bloków; w całej drodze do ekranu nie ma wstrzykiwanego HTML-u.
 *
 * Etap 24c dokłada `kind`: screamsheet to ten sam handout w gazetowym
 * przebraniu, więc udostępnianie, kosz i pływające okno nie mają o nim własnej
 * gałęzi — różni się wyłącznie tym, jak się rysuje i o trzy pola `screamsheet`.
 */

import {
  normalizeScreamsheetMeta,
  parseHandoutKind,
  type HandoutKind,
  type ScreamsheetMeta,
} from './screamsheets.js';

export const HANDOUT_TITLE_MAX_LENGTH = 120;
/** Handout to kartka do ręki, nie rozdział — kilka ekranów tekstu wystarczy. */
export const HANDOUT_BODY_MAX_LENGTH = 20000;

/** Grafika handoutu: adres z uploadu plus wymiary (proporcje znane przed wczytaniem). */
export interface HandoutImage {
  url: string;
  width: number;
  height: number;
}

/**
 * Jeden handout, jak widzi go odbiorca. `sharedWith` dostaje wyłącznie MG.
 */
export interface HandoutView {
  id: string;
  title: string;
  /** Markdown; pusty, gdy handout jest samą grafiką. */
  body: string;
  image: HandoutImage | null;
  /** `note` — kartka z 24a, `screamsheet` — wycinek z brukowca (24c). */
  kind: HandoutKind;
  /** Lead, winieta i data; obecne wyłącznie przy `kind: 'screamsheet'`. */
  screamsheet: ScreamsheetMeta | null;
  /** Id kont, którym MG go udostępnił — pole obecne TYLKO w widoku MG. */
  sharedWith?: string[];
  createdAt: string;
  updatedAt: string;
}

/** Kandydat na odbiorcę — gracze kampanii, tak jak widzi ich panel MG. */
export interface HandoutRecipient {
  userId: string;
  name: string;
}

export interface HandoutUpsertPayload {
  /** Pusty przy tworzeniu nowego handoutu. */
  id?: string;
  title: string;
  body: string;
  image: HandoutImage | null;
  kind?: HandoutKind;
  screamsheet?: ScreamsheetMeta | null;
}

export interface HandoutIdPayload {
  id: string;
}

/**
 * Pełna lista odbiorców po zmianie — nie „dodaj tego jednego".
 *
 * MG zaznacza pola wyboru i klika „Udostępnij", więc stanem jest lista, a nie
 * ciąg operacji. Serwer sam wyliczy, kto doszedł (dostaje okno i linię na
 * czacie) i komu zabrano (handout znika mu z zakładki).
 */
export interface HandoutSharePayload {
  id: string;
  userIds: string[];
}

export interface HandoutSyncPayload {
  handouts: HandoutView[];
  /** Kandydaci na odbiorców — tylko dla MG; u gracza pusta. */
  recipients: HandoutRecipient[];
}

export interface HandoutUpsertBroadcast {
  handout: HandoutView;
}

export interface HandoutDeleteBroadcast {
  id: string;
}

/** „Otwórz to teraz" — serwer wysyła je wyłącznie świeżo dopisanym odbiorcom. */
export interface HandoutOpenBroadcast {
  handout: HandoutView;
}

/** Linia na czacie towarzysząca udostępnieniu (rodzaj wiadomości `handout`). */
export interface HandoutLogEntry {
  handoutId: string;
  title: string;
  hasImage: boolean;
  /** Brak pola = `note`: wiersze zapisane przed 24c zostają notatkami. */
  kind?: HandoutKind;
}

export interface HandoutValidationIssue {
  field: string;
  message: string;
}

/** Adresy grafik, które serwer sam wystawił — nic spoza `/uploads/handouts/`. */
const HANDOUT_IMAGE_URL = /^\/uploads\/handouts\/[A-Za-z0-9_-]+\.(png|jpg|webp)$/;

function parseImage(raw: unknown): HandoutImage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Record<string, unknown>;
  const url = typeof input.url === 'string' ? input.url : '';
  if (!HANDOUT_IMAGE_URL.test(url)) return null;
  const width = Number(input.width);
  const height = Number(input.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  return { url, width: Math.round(width), height: Math.round(height) };
}

/**
 * Waliduje handout. Ta sama funkcja chodzi u klienta (podpowiedź w formularzu)
 * i na serwerze (rozstrzygnięcie), więc oba odrzucają to samo tym samym zdaniem.
 *
 * Reguła, której nie da się wyrazić limitem pola: **handout musi coś nieść**.
 * Sam tytuł bez grafiki i bez tekstu jest pustą kartką, a wyskakuje graczowi
 * na ekran jak każdy inny. Screamsheet ma tę regułę ostrzejszą: gazeta bez
 * artykułu to sama winieta, więc sama grafika mu nie wystarczy (24c).
 */
export function validateHandout(
  raw: unknown,
):
  | { ok: true; handout: Required<Omit<HandoutUpsertPayload, 'id'>> }
  | { ok: false; issues: HandoutValidationIssue[] } {
  const issues: HandoutValidationIssue[] = [];
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, issues: [{ field: 'handout', message: 'Nieprawidłowe dane handoutu.' }] };
  }
  const input = raw as Record<string, unknown>;

  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (title.length === 0) issues.push({ field: 'title', message: 'Handout musi mieć tytuł.' });
  if (title.length > HANDOUT_TITLE_MAX_LENGTH) {
    issues.push({
      field: 'title',
      message: `Tytuł jest za długi (limit ${HANDOUT_TITLE_MAX_LENGTH} znaków).`,
    });
  }

  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (body.length > HANDOUT_BODY_MAX_LENGTH) {
    issues.push({
      field: 'body',
      message: `Treść jest za długa (limit ${HANDOUT_BODY_MAX_LENGTH} znaków).`,
    });
  }

  const image = parseImage(input.image);
  const kind = parseHandoutKind(input.kind);
  if (kind === 'screamsheet') {
    if (body.length === 0) {
      issues.push({ field: 'body', message: 'Screamsheet musi mieć treść artykułu.' });
    }
  } else if (body.length === 0 && !image) {
    issues.push({ field: 'body', message: 'Handout musi mieć treść albo grafikę.' });
  }

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    handout: {
      title,
      body,
      image,
      kind,
      // Meble gazety zapisujemy tylko przy gazecie — notatka, która kiedyś była
      // screamsheetem, nie ma nosić po nim winiety.
      screamsheet: kind === 'screamsheet' ? normalizeScreamsheetMeta(input.screamsheet) : null,
    },
  };
}

/** Lista id odbiorców w postaci porównywalnej: bez duplikatów, bez śmieci. */
export function normalizeRecipientIds(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (id.length > 0 && !seen.includes(id)) seen.push(id);
  }
  return seen;
}

/** Polski komunikat odmowy — jeden słownik dla wszystkich wejść klienta. */
export function handoutErrorText(code: string): string {
  if (code.startsWith('INVALID_HANDOUT:')) {
    return code.slice('INVALID_HANDOUT:'.length) || 'Nieprawidłowe dane handoutu.';
  }
  switch (code) {
    case 'HANDOUT_NOT_FOUND':
      return 'Tego handoutu już nie ma.';
    case 'UNKNOWN_RECIPIENT':
      return 'Ktoś z zaznaczonych nie należy do tej kampanii.';
    case 'NO_CAMPAIGN':
      return 'Brak aktywnej kampanii.';
    case 'FORBIDDEN':
      return 'Handouty tworzy Mistrz Gry.';
    default:
      return 'Nie udało się wykonać operacji na handoucie.';
  }
}
