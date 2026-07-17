import { PresenceList } from './PresenceList.js';
import { ChatPanel } from './ChatPanel.js';

export function SidePanel() {
  return (
    <aside className="side-panel">
      <PresenceList />
      <ChatPanel />
    </aside>
  );
}
