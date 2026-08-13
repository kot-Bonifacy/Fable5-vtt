import { Link } from 'react-router-dom';
import { CombatBar } from './CombatBar.js';
import { ConnectionStatus } from './ConnectionStatus.js';
import { ThemeToggle } from './ThemeToggle.js';
import { TypewriterToggle } from './TypewriterToggle.js';
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
        <ConnectionStatus />
        <ThemeToggle />
        <TypewriterToggle />
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
