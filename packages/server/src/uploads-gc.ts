import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type { PrismaClient } from './db.js';

/**
 * Sprzątanie osieroconych plików z `uploads/` (sesja naprawcza 22.08).
 *
 * Do tej pory nikt ich nie sprzątał: usunięcie handoutu, sceny, postaci albo
 * tokenu kasowało wiersz w bazie, a plik zostawał na dysku na zawsze — tak samo
 * jak podmiana grafiki na inną. Przez cztery katalogi naraz („mapy, portrety,
 * tokeny, handouty") osobny mechanizm zbierania sierot był świadomie odkładany;
 * to jest ten mechanizm.
 *
 * Zasada jest jedna i celowo ostrożna: **plik ginie tylko wtedy, gdy nikt go
 * nie wymienia i jest starszy niż okno łaski**. Okno bierze się stąd, że plik
 * powstaje o krok wcześniej niż wiersz, który go nazywa — kreator postaci wgrywa
 * portret, zanim postać w ogóle istnieje, a MG wgrywa mapę, zanim wybierze ją
 * na scenę. Godzina to dużo więcej, niż zajmuje którykolwiek z tych kroków.
 *
 * Odnośniki zbierane są **dwiema drogami**, bo dwiema drogami są zapisywane:
 * z kolumn, które trzymają sam adres, i wyrażeniem regularnym z kolumn
 * tekstowych, w których adres siedzi w środku JSON-a (szkic kreatora, ładunek
 * wiadomości czatu). Nowa kolumna z adresem, która nie trafi na żadną z tych
 * list, znaczy skasowany plik — dlatego lista jest tu, w jednym miejscu, a nie
 * rozsypana po miejscach usuwania.
 */

/** Katalogi, które zbieracz w ogóle ogląda. Nic poza nimi nie jest ruszane. */
const SWEPT_DIRECTORIES = ['maps', 'portraits', 'tokens', 'handouts'] as const;

/** Ile plik musi mieć lat, żeby brak odnośnika uznać za sierotę, nie za wyścig. */
export const UPLOAD_GRACE_MS = 60 * 60 * 1000;

const UPLOAD_URL_PATTERN = /\/uploads\/[A-Za-z0-9_\-.]+\/[A-Za-z0-9_\-.]+/g;

/** Każdy adres `/uploads/...`, który cokolwiek w bazie jeszcze wymienia. */
export async function referencedUploadUrls(prisma: PrismaClient): Promise<Set<string>> {
  const urls = new Set<string>();
  const add = (value: string | null | undefined): void => {
    if (value && value.startsWith('/uploads/')) urls.add(value);
  };
  const scan = (value: string | null | undefined): void => {
    if (!value) return;
    for (const match of value.matchAll(UPLOAD_URL_PATTERN)) urls.add(match[0]);
  };

  for (const row of await prisma.scene.findMany({ select: { backgroundUrl: true } })) {
    add(row.backgroundUrl);
  }
  for (const row of await prisma.token.findMany({ select: { imageUrl: true } })) {
    add(row.imageUrl);
  }
  for (const row of await prisma.tokenAsset.findMany({ select: { url: true } })) add(row.url);
  // Pula portretów kampanii (23.08): plik leży w bibliotece, zanim ktokolwiek
  // wybierze go na kartę — bez tej linii zbieracz skasowałby całą pulę po
  // godzinie od wgrania.
  for (const row of await prisma.portraitAsset.findMany({ select: { url: true } })) add(row.url);
  for (const row of await prisma.handout.findMany({ select: { imageUrl: true } })) {
    add(row.imageUrl);
  }
  for (const row of await prisma.character.findMany({
    select: { portraitUrl: true, data: true },
  })) {
    add(row.portraitUrl);
    // Karta sama portretu nie trzyma, ale trzyma ją JSON — a JSON bywa
    // rozszerzany. Skanowanie jest tanie, skasowany portret nie.
    scan(row.data);
  }
  for (const row of await prisma.botProfile.findMany({ select: { portraitUrl: true } })) {
    add(row.portraitUrl);
  }
  // Szkic kreatora: portret wgrywa się **przed** postacią (etap 25c), więc
  // adres leży w JSON-ie szkicu i nigdzie indziej.
  for (const row of await prisma.characterDraft.findMany({ select: { data: true } })) {
    scan(row.data);
  }
  // Stara linia czatu z portretem mówiącego (etap 11) — obrazek zniknięty
  // z historii wygląda jak awaria, a nie jak sprzątanie.
  for (const row of await prisma.chatMessage.findMany({ select: { payload: true } })) {
    scan(row.payload);
  }
  return urls;
}

export interface UploadSweepResult {
  /** Pliki usunięte (adresy `/uploads/...`). */
  removed: string[];
  /** Pliki bez odnośnika, ale młodsze niż okno łaski — zostawione. */
  spared: number;
  /** Bajty odzyskane z dysku. */
  freedBytes: number;
}

/**
 * Usuwa z `uploads/` pliki, których nikt nie wymienia.
 *
 * `dryRun` liczy to samo, nie kasując niczego — tym trybem sprawdza się, co
 * zbieracz **by** zrobił, zanim mu się na to pozwoli.
 */
export async function sweepOrphanUploads(
  prisma: PrismaClient,
  uploadsDir: string,
  options: { now?: number; graceMs?: number; dryRun?: boolean } = {},
): Promise<UploadSweepResult> {
  const now = options.now ?? Date.now();
  const graceMs = options.graceMs ?? UPLOAD_GRACE_MS;
  const referenced = await referencedUploadUrls(prisma);
  const result: UploadSweepResult = { removed: [], spared: 0, freedBytes: 0 };

  for (const directory of SWEPT_DIRECTORIES) {
    const path = join(uploadsDir, directory);
    let names: string[];
    try {
      names = await readdir(path);
    } catch {
      // Katalog, do którego nikt jeszcze nic nie wgrał, to nie błąd.
      continue;
    }
    for (const name of names) {
      const url = `/uploads/${directory}/${name}`;
      if (referenced.has(url)) continue;
      const file = join(path, name);
      let size = 0;
      try {
        const info = await stat(file);
        if (!info.isFile()) continue;
        if (now - info.mtimeMs < graceMs) {
          result.spared += 1;
          continue;
        }
        size = info.size;
      } catch {
        continue;
      }
      if (options.dryRun) {
        result.removed.push(url);
        result.freedBytes += size;
        continue;
      }
      try {
        await unlink(file);
        result.removed.push(url);
        result.freedBytes += size;
      } catch {
        // Windows potrafi trzymać plik, który ktoś właśnie pobiera. Wróci
        // przy następnym starcie — sierota nie ucieknie.
      }
    }
  }
  return result;
}

/**
 * Przebieg przy starcie serwera. Nie blokuje wstawania aplikacji i nigdy nie
 * przewraca jej swoim błędem — sprzątanie nie jest ważniejsze od stołu.
 */
export function sweepUploadsInBackground(
  prisma: PrismaClient,
  uploadsDir: string,
  log: FastifyBaseLogger,
): void {
  void sweepOrphanUploads(prisma, uploadsDir)
    .then((result) => {
      if (result.removed.length === 0) return;
      log.info(
        { removed: result.removed.length, freedBytes: result.freedBytes },
        'swept orphaned uploads',
      );
    })
    .catch((error: unknown) => {
      log.error({ err: error }, 'upload sweep failed');
    });
}
