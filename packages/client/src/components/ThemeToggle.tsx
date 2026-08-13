import { useThemeStore } from '../stores/themeStore.js';

/**
 * Przełącznik trybu dzień/noc w górnym pasku (etap 27a).
 *
 * Dziś zmienia skórkę karty postaci: „noc" to arkusz w negatywie (czarny papier,
 * czerwone panele), „dzień" to wydrukowana kartka — biała, dokładnie jak
 * oficjalna karta CP RED. Reszta widoków dołączy do motywu w etapie 27.
 */
export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);

  const title =
    theme === 'night'
      ? 'Tryb nocny — karta postaci na czarnym papierze. Kliknij, by przełączyć na dzienny (biała kartka jak z wydruku)'
      : 'Tryb dzienny — karta postaci jak wydrukowany arkusz. Kliknij, by przełączyć na nocny';

  return (
    <button
      type="button"
      className={`small-button${theme === 'day' ? ' small-button--on' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={theme === 'day'}
      onClick={toggle}
    >
      {theme === 'night' ? '☾ noc' : '☀ dzień'}
    </button>
  );
}
