import { useAuthStore } from '../stores/authStore.js';
import { useCharacterStore } from '../stores/characterStore.js';

/**
 * Gracz, który na scenie z widocznością Dynamiczną nie ma czyimi oczami
 * patrzeć (15.10, zlecenie MG): zamiast czarnej mapy z małym napisem — ten sam
 * plakat Night City co „Między sesjami”, z tym, na co postać czeka. Czerń
 * czytała się jak zerwane połączenie i psuła wejście w świat (decyzja MG
 * z 04.10: gracz nigdy nie dostaje pustego ekranu).
 */
export function NoFigurePoster() {
  const userId = useAuthStore((s) => s.user?.id);
  const order = useCharacterStore((s) => s.order);
  const characters = useCharacterStore((s) => s.characters);
  const openSheet = useCharacterStore((s) => s.openSheet);

  const mine = order
    .map((id) => characters[id])
    .filter((sheet) => sheet !== undefined && sheet.ownerId === userId && !sheet.template);
  const ready = mine.find((sheet) => sheet!.playReady);
  const sheet = ready ?? mine[0];

  let title: string;
  let text: string;
  let hint: string;
  if (!sheet) {
    title = 'Jeszcze bez postaci';
    text = 'Twoja postać nie weszła jeszcze do gry, więc nie masz czyimi oczami patrzeć na mapę.';
    hint = 'Poproś MG o zgodę na nową postać w zakładce „Postacie” po prawej.';
  } else if (!ready) {
    title = sheet.name;
    text = 'Postać czeka, aż MG przyjmie ją do gry — wtedy stanie na mapie i zobaczysz to, co ona.';
    hint = 'Kartę możesz już przeglądać. Czat z drużyną działa w panelu obok.';
  } else {
    title = sheet.name;
    text = 'Twojej postaci nie ma w tej scenie. Gdy MG ją wprowadzi, zobaczysz to, co ona.';
    hint = 'Do tego czasu masz kartę i czat z drużyną w panelu obok.';
  }

  return (
    <section className="between-sessions between-sessions--map" aria-label="Poza sceną">
      <div className="between-sessions-card">
        <p className="between-sessions-eyebrow">Poza sceną</p>
        <h1 className="between-sessions-title">{title}</h1>
        <div className="auth-rule" aria-hidden="true" />
        <p className="between-sessions-text">{text}</p>
        <p className="between-sessions-hint">{hint}</p>
        {sheet && (
          <div className="between-sessions-actions">
            <button
              type="button"
              className="between-sessions-button"
              onClick={() => openSheet(sheet.id)}
            >
              Otwórz kartę
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
