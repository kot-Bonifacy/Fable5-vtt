import { useAuthStore } from '../stores/authStore.js';
import { useChatStore } from '../stores/chatStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { formatSessionClock } from '../session-view.js';

/** Ile kart naraz wypisujemy w ramce — więcej się w niej nie zmieści. */
const MAX_SHEET_BUTTONS = 3;

/**
 * Widok gracza między sesjami (etap 44c), w miejscu mapy.
 *
 * Nigdy pusta plansza (decyzja MG z 04.10: „gracz nigdy i nigdzie nie
 * powinien mieć pustego ekranu”) — stoi na tym samym plakacie Night City co
 * logowanie, a napisy siedzą w jego czerwonej ramce celownika, tą samą
 * kotwicą co formularz wejścia (tylko liczoną od kontenera, nie od okna).
 * Karty, dziennik, handouty i historia czatu są w panelu po prawej; stół
 * otworzy się sam, gdy MG kliknie „Rozpocznij sesję”.
 */
export function BetweenSessions() {
  const campaign = useChatStore((s) => s.campaign);
  const user = useAuthStore((s) => s.user);
  const order = useCharacterStore((s) => s.order);
  const characters = useCharacterStore((s) => s.characters);
  const openSheet = useCharacterStore((s) => s.openSheet);
  if (!campaign) return null;

  const mine = order
    .map((id) => characters[id])
    .filter((sheet) => sheet !== undefined && sheet.ownerId === user?.id)
    .slice(0, MAX_SHEET_BUTTONS);
  const ended = campaign.lastSessionEndedAt;

  return (
    <section className="between-sessions" aria-label="Między sesjami">
      <div className="between-sessions-card">
        <p className="between-sessions-eyebrow">Między sesjami</p>
        <h1 className="between-sessions-title">{campaign.name}</h1>
        <div className="auth-rule" aria-hidden="true" />
        <p className="between-sessions-text">
          {ended
            ? `Ostatnia sesja skończyła się ${formatSessionClock(ended)}.`
            : 'Pierwsza sesja jeszcze przed wami.'}{' '}
          Stół otworzy się sam, gdy MG ją rozpocznie.
        </p>
        <p className="between-sessions-hint">
          Do tego czasu masz swoją kartę, dziennik, handouty i historię czatu w panelu obok.
        </p>
        {mine.length > 0 && (
          <div className="between-sessions-actions">
            {mine.map((sheet) => (
              <button
                key={sheet!.id}
                type="button"
                className="between-sessions-button"
                onClick={() => openSheet(sheet!.id)}
              >
                {mine.length === 1 ? 'Otwórz kartę' : sheet!.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
