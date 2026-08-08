import { useTypewriterStore } from '../stores/typewriterStore.js';

/**
 * Przełącznik maszynopisu w górnym pasku.
 *
 * Ustawienie jest prywatne — trzymane w tej przeglądarce i nikomu nie
 * broadcastowane. Wypowiedź NPC-a jest u klienta w całości, zanim zacznie się
 * pisać, więc wyłączenie efektu nic nie ukrywa i niczego nie opóźnia; to
 * wyłącznie kwestia tego, czy tekst ma się pojawiać stopniowo, czy od razu.
 */
export function TypewriterToggle() {
  const enabled = useTypewriterStore((s) => s.enabled);
  const setEnabled = useTypewriterStore((s) => s.setEnabled);

  const title = enabled
    ? 'Wypowiedzi NPC-ów dopisują się słowo po słowie — kliknij, by pokazywać je od razu'
    : 'Wypowiedzi NPC-ów pojawiają się od razu — kliknij, by dopisywały się słowo po słowie';

  return (
    <button
      type="button"
      className={`small-button${enabled ? ' small-button--on' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={enabled}
      onClick={() => setEnabled(!enabled)}
    >
      {enabled ? '⌨ wł.' : '⌨ wył.'}
    </button>
  );
}
