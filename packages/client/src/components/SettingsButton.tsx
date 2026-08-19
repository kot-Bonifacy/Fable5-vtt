import { useSettingsStore } from '../stores/settingsStore.js';

/**
 * Wejście do okna ustawień (etap 27d).
 *
 * Zastąpiło dwa osobne przełączniki w górnym pasku (☀/☾ z 27a i ⌨ z etapu 11):
 * pasek nosi tyle informacji o grze, że nie ma w nim miejsca na rosnącą listę
 * preferencji jednego użytkownika.
 */
export function SettingsButton() {
  const open = useSettingsStore((s) => s.open);
  const toggleOpen = useSettingsStore((s) => s.toggleOpen);

  const title = 'Ustawienia — kości, dźwięk, tryb dzienny, maszynopis';

  return (
    <button
      type="button"
      className={`small-button${open ? ' small-button--on' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={open}
      onClick={toggleOpen}
    >
      ⚙
    </button>
  );
}
