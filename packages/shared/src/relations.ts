/**
 * Relacje NPC↔postacie (etap 19c).
 *
 * Rdzeń VTT, nie system RPG: „ten NPC nie znosi tej postaci" nie wie nic o
 * Cyberpunku RED i nic z `systems/cpred` tu nie wchodzi.
 *
 * Dwie rzeczy niosą ten plik.
 *
 * 1. **Relacja to liczba I zdanie.** Sama liczba nie da się wstrzyknąć do
 *    promptu w sposób, który model zrozumie („−2" nie znaczy dla niego nic),
 *    a samo zdanie nie da się posortować ani pokazać w edytorze jednym rzutem
 *    oka. Stąd para: stopień z zamkniętej skali i notatka „skąd".
 * 2. **Relacja dotyczy postaci, nie konta gracza.** NPC zna Vexa, a nie Pawła —
 *    i gracz z dwiema postaciami ma dwa różne wejścia do tej samej rozmowy.
 */

/** Skala jest zamknięta i krótka: siedem stopni model rozróżnia, pięćdziesiąt nie. */
export const RELATION_MIN = -3;
export const RELATION_MAX = 3;

export const RELATION_LABELS: Record<number, string> = {
  [-3]: 'zaprzysięgły wróg',
  [-2]: 'wrogi',
  [-1]: 'nieufny',
  0: 'obojętny',
  1: 'przychylny',
  2: 'życzliwy',
  3: 'oddany przyjaciel',
};

/** Krótki znacznik do listy w edytorze („−2 wrogi"). */
export function relationBadge(value: number): string {
  const clamped = clampRelation(value);
  const sign = clamped > 0 ? `+${clamped}` : `${clamped}`;
  return `${sign} ${RELATION_LABELS[clamped] ?? ''}`.trim();
}

export const RELATION_NOTE_MAX_LENGTH = 300;

export function clampRelation(value: unknown): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
  return Math.max(RELATION_MIN, Math.min(RELATION_MAX, number));
}

/** Jedna relacja, jak widzi ją MG. Nigdy nie opuszcza pokoju MG. */
export interface BotRelationView {
  botId: string;
  botName: string;
  characterId: string;
  characterName: string;
  value: number;
  /** „Skąd" — jedno zdanie, które jedzie do promptu razem ze stopniem. */
  note: string;
  updatedAt: string;
}

export interface RelationSetPayload {
  botId: string;
  characterId: string;
  value: number;
  note: string;
}

export interface RelationDeletePayload {
  botId: string;
  characterId: string;
}

export interface RelationSyncPayload {
  relations: BotRelationView[];
}

export interface RelationUpsertBroadcast {
  relation: BotRelationView;
}

export interface RelationDeleteBroadcast {
  botId: string;
  characterId: string;
}

/**
 * Propozycja zmiany relacji wyciągnięta ze streszczenia sesji (etap 19c).
 *
 * Nigdy nie jest stosowana sama z siebie — to wyłącznie wiersz w liście, którą
 * MG zatwierdza po jednym kliknięciu na wiersz. Niesie ze sobą stan bieżący,
 * żeby MG widział „z 0 na −2", a nie samo „−2".
 */
export interface RelationProposal {
  botId: string;
  botName: string;
  characterId: string;
  characterName: string;
  /** Docelowy stopień po zmianie. */
  value: number;
  /** Stopień zapisany dziś; 0, gdy relacji jeszcze nie ma. */
  currentValue: number;
  note: string;
}

/**
 * Nastawienie NPC-a jako zdania w prompcie.
 *
 * Osobna funkcja, bo tę samą treść czyta model (prompt systemowy) i MG (podgląd
 * promptu w edytorze) — i musi to być dosłownie ten sam tekst.
 */
export function relationPromptLines(relation: {
  characterName: string;
  value: number;
  note: string;
}): string {
  const value = clampRelation(relation.value);
  const label = RELATION_LABELS[value] ?? RELATION_LABELS[0]!;
  const lines = [`Rozmawiasz z: ${relation.characterName}. Twoje nastawienie: ${label}.`];
  const note = relation.note.trim();
  if (note.length > 0) lines.push(`Skąd się wzięło: ${note}`);
  lines.push(
    value === 0
      ? 'Nie masz do tej osoby ani sympatii, ani urazy — mówisz do niej rzeczowo.'
      : 'To nastawienie słychać w tonie każdego zdania, ale nie mówisz o nim wprost' +
          ' ani nie streszczasz, co się między wami wydarzyło.',
  );
  return lines.join('\n');
}

export function sanitizeRelationNote(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, RELATION_NOTE_MAX_LENGTH) : '';
}
