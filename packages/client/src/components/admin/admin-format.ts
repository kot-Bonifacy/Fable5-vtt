/** Data i godzina w panelu administratora — „17 paź 2026, 14:30”, brak — „—”. */
export function adminWhen(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pl-PL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Czas trwania sesji: „2 h 15 min”, „40 min”, „< 1 min”. */
export function adminDuration(startIso: string, endIso: string | null, now = Date.now()): string {
  const end = endIso ? new Date(endIso).getTime() : now;
  const minutes = Math.floor((end - new Date(startIso).getTime()) / 60_000);
  if (minutes < 1) return '< 1 min';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
