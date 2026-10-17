import type { AppContext } from './context.js';

/**
 * Przełączniki serwera, które administrator zmienia w panelu (etap 53).
 * Wiersz `ServerSetting` wygrywa z `.env`; brak wiersza — wartość z `.env`,
 * jak przed etapem 53, więc instalacja bez panelu działa po staremu.
 */

const REGISTRATION_KEY = 'registration';

/** Czy ekran logowania pokazuje „Załóż konto MG”, a trasa rejestracji je zakłada. */
export async function registrationOpen(ctx: AppContext): Promise<boolean> {
  const row = await ctx.prisma.serverSetting.findUnique({ where: { key: REGISTRATION_KEY } });
  if (row) return row.value !== 'closed';
  return ctx.config.registrationOpen !== false;
}

export async function setRegistrationOpen(ctx: AppContext, open: boolean): Promise<void> {
  const value = open ? 'open' : 'closed';
  await ctx.prisma.serverSetting.upsert({
    where: { key: REGISTRATION_KEY },
    create: { key: REGISTRATION_KEY, value },
    update: { value },
  });
}
