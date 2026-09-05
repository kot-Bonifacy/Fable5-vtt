import { Link } from 'react-router-dom';
import { ClockChip } from './ClockWindow.js';
import { CombatBar } from './CombatBar.js';
import { ConnectionStatus } from './ConnectionStatus.js';
import { SettingsButton } from './SettingsButton.js';
import { ShortcutsButton } from './ShortcutsWindow.js';
import { useAuthStore } from '../stores/authStore.js';

export function TopBar() {
  const user = useAuthStore((s) => s.user);
  const activeCampaign = useAuthStore((s) => s.activeCampaign);
  const logout = useAuthStore((s) => s.logout);

  return (
    <header className="top-bar">
      <span className="top-bar-title">VTT — Cyberpunk RED</span>
      {/* The turn tracker sits in the middle of the bar rather than over the
          map: the table stays uncovered, and the queue gets a full-width row. */}
      <CombatBar />
      <div className="top-bar-right">
        {activeCampaign && <span className="top-bar-campaign">{activeCampaign.name}</span>}
        {/* Zegar świata (etap 37). Data i pora dnia są wspólne dla stołu, więc
            napis widzi każdy; guzikiem — czyli wejściem do okna z przesuwaniem
            czasu — jest wyłącznie u MG. `flex: none` jak każdy element prawej
            grupy. */}
        {activeCampaign && <ClockChip isGm={user?.role === 'GM'} />}
        {/* Chip poligonu (postulat MG z 22.08). `flex: none` jak każdy nowy
            element prawej grupy — miejsce oddaje wyłącznie tytuł i nazwa
            kampanii. Kampania produkcyjna nie nosi nic: brak chipu **jest**
            drugim stanem, a dwa chipy obok siebie zamieniłyby ostrzeżenie
            w ozdobę. */}
        {activeCampaign?.sandbox && (
          <span
            className="top-bar-sandbox"
            title="Kampania testowa — wolno tu wszystko zepsuć. Chip zdejmuje się w Panelu MG."
          >
            poligon
          </span>
        )}
        <ConnectionStatus />
        {/* Etap 27d: ☀/☾ i ⌨ przeniosły się do okna ustawień — pasek nosi
            stan gry, a nie listę preferencji jednego użytkownika. */}
        <ShortcutsButton />
        <SettingsButton />
        {user && (
          <span className="top-bar-user">
            {user.name} ({user.role === 'GM' ? 'MG' : 'Gracz'})
          </span>
        )}
        {user?.role === 'GM' && (
          <Link className="top-bar-link" to="/gm">
            Panel MG
          </Link>
        )}
        <button type="button" className="small-button" onClick={() => void logout()}>
          Wyloguj
        </button>
      </div>
    </header>
  );
}
