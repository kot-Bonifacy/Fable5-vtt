import type { FastifyBaseLogger } from 'fastify';
import { CPRED_AMMO_PATTERNS, cpredAmmoPatternCounted, type CpredAmmoPattern } from '@vtt/shared';
import type { PrismaClient } from './db.js';

/**
 * Sprzątanie kart po zasadzie domowej MG z 23.10.2026 (jednorazowe, przy
 * starcie, idempotentne): kule, śrut i strzały się nie kończą, więc z kart
 * znikają ich pudełka, a z nimi pole „Licz amunicję” (`ammoTracked`).
 *
 * Odczyt karty i tak je pomija (`normalizeCharacterData`), ale surowy JSON
 * jedzie też do kopii kampanii, eksportów i zapytań E2E — bez tego przejścia
 * pudełko leżałoby w bazie do pierwszego zapisu karty. Rusza wyłącznie te dwa
 * klucze; reszta arkusza zostaje bajt w bajt, bez normalizacji.
 */
export async function dropBottomlessAmmo(
  prisma: PrismaClient,
  log: FastifyBaseLogger,
): Promise<number> {
  const candidates = await prisma.character.findMany({
    where: {
      OR: [{ data: { contains: '"pattern"' } }, { data: { contains: '"ammoTracked"' } }],
    },
    select: { id: true, data: true },
  });
  let cleaned = 0;
  for (const row of candidates) {
    const next = withoutBottomlessAmmo(row.data);
    if (next === null) continue;
    await prisma.character.update({ where: { id: row.id }, data: { data: next } });
    cleaned += 1;
  }
  if (cleaned > 0) log.info({ cleaned }, 'kule, śrut i strzały bez dna — pudełka zdjęte z kart');
  return cleaned;
}

/** Nowy JSON karty albo `null`, gdy nie ma czego zdejmować (albo JSON jest zepsuty). */
export function withoutBottomlessAmmo(raw: string): string | null {
  let sheet: unknown;
  try {
    sheet = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet)) return null;
  const record = sheet as Record<string, unknown>;
  let changed = false;
  if ('ammoTracked' in record) {
    delete record.ammoTracked;
    changed = true;
  }
  if (Array.isArray(record.gear)) {
    const kept = record.gear.filter((row) => !isBottomlessBox(row));
    if (kept.length !== record.gear.length) {
      record.gear = kept;
      changed = true;
    }
  }
  return changed ? JSON.stringify(record) : null;
}

function isBottomlessBox(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const ammo = (row as { ammo?: unknown }).ammo;
  if (!ammo || typeof ammo !== 'object') return false;
  const pattern = (ammo as { pattern?: unknown }).pattern;
  return (
    (CPRED_AMMO_PATTERNS as readonly unknown[]).includes(pattern) &&
    !cpredAmmoPatternCounted(pattern as CpredAmmoPattern)
  );
}
