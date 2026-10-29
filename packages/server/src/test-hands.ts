import type { PrismaClient } from './db.js';

/**
 * Broń w ręku strzelca dla testów dymnych — tylko dla `*.test.ts`.
 *
 * Od 29.10.2026 (decyzja MG) postać trzyma jedną broń, a karta, której nikt nie
 * pytał, trzyma pierwszą z listy. Suity, które strzelają z kilku broni jednej
 * karty, nie są o rękach — więc przed `attack:roll` kładą broń do ręki wprost
 * w bazie, bez `weapon:draw`, które w walce wzięłoby Akcję i rozjechało budżet
 * tury. Ręce sprawdza `sighting.test.ts` i silnik zasad.
 */
export async function holdFiredWeapon(
  built: { prisma: PrismaClient },
  payload: unknown,
): Promise<void> {
  const body = payload as
    { characterId?: unknown; tokenId?: unknown; request?: { weaponRowId?: unknown } } | undefined;
  const rowId = body?.request?.weaponRowId;
  if (typeof rowId !== 'string') return;
  let characterId = typeof body?.characterId === 'string' ? body.characterId : null;
  if (!characterId && typeof body?.tokenId === 'string') {
    const token = await built.prisma.token.findUnique({ where: { id: body.tokenId } });
    characterId = token?.characterId ?? null;
  }
  if (!characterId) return;
  const character = await built.prisma.character.findUnique({ where: { id: characterId } });
  if (!character) return;
  const data = JSON.parse(character.data) as {
    weapons?: { id: string }[];
    drawnWeaponRowIds?: string[];
  };
  if (!data.weapons?.some((row) => row.id === rowId)) return;
  if (data.drawnWeaponRowIds?.[0] === rowId) return;
  data.drawnWeaponRowIds = [rowId];
  await built.prisma.character.update({
    where: { id: characterId },
    data: { data: JSON.stringify(data) },
  });
}
