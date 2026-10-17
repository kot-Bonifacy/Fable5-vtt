import { Link } from 'react-router-dom';
import { ClockChip } from './ClockWindow.js';
import { TurnModeSlot } from './CombatBar.js';
import { ConnectionStatus } from './ConnectionStatus.js';
import { SettingsButton } from './SettingsButton.js';
import { ShortcutsButton } from './ShortcutsWindow.js';
import { SessionControl } from './SessionControl.js';
import { useAuthStore } from '../stores/authStore.js';

export function TopBar() {
  const user = useAuthStore((s) => s.user);
  const activeCampaign = useAuthStore((s) => s.activeCampaign);
  const logout = useAuthStore((s) => s.logout);

  return (
    <header className="top-bar">
      <span className="top-bar-title">VTT — Cyberpunk RED</span>
      {/* The queue itself lives in a strip over the map column (25.09); the bar
          keeps only the GM's way into turn mode. */}
      <TurnModeSlot />
      <div className="top-bar-right">
        {activeCampaign && <span className="top-bar-campaign">{activeCampaign.name}</span>}
        {/* Przygotowanie albo sesja (etap 44c) — tylko u MG. */}
        <SessionControl />
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
        <div className="top-bar-tools">
          <ShortcutsButton />
          <SettingsButton />
        </div>
        {/* Konto: MG podpisany loginem (każde konto MG siedzi przy stole jako
            „MG”, więc samo imię nic tu nie mówi), gracz imieniem. Rolę niesie
            „Panel MG” obok, nie dopisek w nawiasie. */}
        <div className="top-bar-account">
          {user && (
            <span className="top-bar-user" title={user.role === 'GM' ? 'Prowadzący grę' : 'Gracz'}>
              {user.role === 'GM' ? (user.login ?? user.name) : user.name}
            </span>
          )}
          {user?.role === 'GM' && (
            <Link className="small-button" to="/gm">
              Panel MG
            </Link>
          )}
          <button type="button" className="small-button" onClick={() => void logout()}>
            Wyloguj
          </button>
        </div>
      </div>
    </header>
  );
}
