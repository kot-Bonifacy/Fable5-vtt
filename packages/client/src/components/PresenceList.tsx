import { useChatStore } from '../stores/chatStore.js';

export function PresenceList() {
  const presence = useChatStore((s) => s.presence);
  const campaign = useChatStore((s) => s.campaign);

  return (
    <section className="presence">
      <h2 className="panel-section-title">Online{campaign ? ` — ${campaign.name}` : ''}</h2>
      {presence.length === 0 ? (
        <p className="placeholder-text">Nikogo nie ma online.</p>
      ) : (
        <ul className="presence-list">
          {presence.map((entry) => (
            <li key={entry.userId} className="presence-entry">
              <span className="status-dot status-dot--connected" />
              <span className="presence-name">{entry.name}</span>
              <span className="badge badge--ok">{entry.role === 'GM' ? 'MG' : 'Gracz'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
