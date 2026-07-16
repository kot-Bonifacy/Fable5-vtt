import { ConnectionStatus } from './ConnectionStatus.js';

export function TopBar() {
  return (
    <header className="top-bar">
      <span className="top-bar-title">VTT — Cyberpunk RED</span>
      <ConnectionStatus />
    </header>
  );
}
