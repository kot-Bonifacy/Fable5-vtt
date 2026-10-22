import { randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import type { ArchiveFile } from '@vtt/shared';
import { CARD_SUBMISSION_TTL_HOURS } from '@vtt/shared';
import type { ServerConfig } from './config.js';

/**
 * Poczekalnia kart zgłoszonych przez graczy (etap 57c, decyzja MG 9).
 *
 * Gracz wgrywa paczkę swojej karty, a ta **nie wchodzi** do kampanii — leży
 * rozpakowana w `<poczekalnia>/<id>/` (dane + grafiki), aż MG ją przyjmie
 * albo odrzuci na karcie czatu. Grafiki nie trafiają do `uploads/` przed
 * przyjęciem: odrzucona karta nie zostawia tam sierot, a sprzątacz uploadów
 * nie musi wiedzieć o poczekalni.
 *
 * Termin ważności (`CARD_SUBMISSION_TTL_HOURS`) zapisuje się w pliku zgłoszenia
 * i na karcie czatu; `sweepCardSubmissions` kasuje katalogi po terminie przy
 * każdym nowym zgłoszeniu.
 */

/** `submission.json` w katalogu zgłoszenia. */
export interface StoredSubmission {
  campaignId: string;
  userId: string;
  expiresAt: string;
  file: ArchiveFile<unknown>;
  /** Adres z danych → plik względem katalogu zgłoszenia. */
  files: [string, string][];
  /** Portret karty względem katalogu zgłoszenia (podgląd dla MG). */
  portrait: string | null;
}

const SUBMISSION_FILE = 'submission.json';
/** Katalog zgłoszenia: losowe 24 znaki szesnastkowe — nic z zewnątrz. */
const SUBMISSION_ID = /^[0-9a-f]{24}$/;

export function cardSubmissionsRoot(config: Pick<ServerConfig, 'cardSubmissionsDir'>): string {
  return config.cardSubmissionsDir ?? join(tmpdir(), 'vtt-card-submissions');
}

export function newSubmissionId(): string {
  return randomBytes(12).toString('hex');
}

export function isSubmissionId(value: unknown): value is string {
  return typeof value === 'string' && SUBMISSION_ID.test(value);
}

export function submissionDir(root: string, id: string): string {
  return join(root, id);
}

export function submissionExpiry(now = Date.now()): string {
  return new Date(now + CARD_SUBMISSION_TTL_HOURS * 3_600_000).toISOString();
}

/** Ścieżka pliku w katalogu zgłoszenia, zapisana względnie (z `/`). */
export function relativeInside(dir: string, path: string): string {
  return relative(dir, path).split(sep).join('/');
}

export async function writeSubmission(
  root: string,
  id: string,
  stored: StoredSubmission,
): Promise<void> {
  const dir = submissionDir(root, id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, SUBMISSION_FILE), JSON.stringify(stored));
}

export async function readSubmission(root: string, id: string): Promise<StoredSubmission | null> {
  if (!isSubmissionId(id)) return null;
  try {
    const text = await readFile(join(submissionDir(root, id), SUBMISSION_FILE), 'utf8');
    return JSON.parse(text) as StoredSubmission;
  } catch {
    return null;
  }
}

/** Plik zgłoszenia po ścieżce względnej — `null`, gdy wychodzi poza katalog. */
export function submissionFile(root: string, id: string, path: string): string | null {
  const dir = submissionDir(root, id);
  const full = join(dir, ...path.split('/'));
  return relative(dir, full).startsWith('..') ? null : full;
}

export async function dropSubmission(root: string, id: string): Promise<void> {
  if (!isSubmissionId(id)) return;
  await rm(submissionDir(root, id), { recursive: true, force: true });
}

/**
 * Skasuj zgłoszenia po terminie. Katalog bez czytelnego pliku zgłoszenia
 * (przerwany zapis) schodzi po tym samym czasie, liczonym od jego powstania.
 */
export async function sweepCardSubmissions(root: string, now = Date.now()): Promise<number> {
  let names: string[];
  try {
    names = await readdir(root);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    if (!isSubmissionId(name)) continue;
    const stored = await readSubmission(root, name);
    let expired: boolean;
    if (stored) {
      expired = Date.parse(stored.expiresAt) <= now;
    } else {
      const info = await stat(submissionDir(root, name)).catch(() => null);
      expired = !info || now - info.mtimeMs > CARD_SUBMISSION_TTL_HOURS * 3_600_000;
    }
    if (expired) {
      await dropSubmission(root, name);
      removed += 1;
    }
  }
  return removed;
}
