import { useChatStore } from '../stores/chatStore.js';

/**
 * Kto jest przy stole — jeden wiersz nad zakładkami (25.09, zlecenie MG).
 * Czarna belka „Online — kampania” i wiersz na osobę zjadały nad czatem tyle,
 * co trzy wiadomości; teraz nazwa kampanii stoi po lewej, a obecni idą obok
 * siebie jako żetony i zawijają się dopiero przy większym stole. Rola jest
 * w podpowiedzi, a MG ma dodatkowo drobną literę — to jedyna rola, której
 * szuka się wzrokiem.
 */
export function PresenceList() {
  const presence = useChatStore((s) => s.presence);
  const campaign = useChatStore((s) => s.campaign);

  return (
    <section className="presence" aria-label="Obecni przy stole">
      <h2 className="presence-campaign" title={campaign ? `Kampania: ${campaign.name}` : undefined}>
        {campaign ? campaign.name : 'Bez kampanii'}
      </h2>
      {presence.length === 0 ? (
        <p className="presence-empty">Nikogo nie ma online</p>
      ) : (
        <ul className="presence-list">
          {presence.map((entry) => {
            const gm = entry.role === 'GM';
            return (
              <li
                key={entry.userId}
                className={`presence-entry${gm ? ' presence-entry--gm' : ''}`}
                title={`${entry.name} — ${gm ? 'MG' : 'gracz'}, online`}
              >
                <span className="status-dot status-dot--connected" />
                <span className="presence-name">{entry.name}</span>
                {gm && entry.name.trim().toUpperCase() !== 'MG' && (
                  <span className="presence-role">MG</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
