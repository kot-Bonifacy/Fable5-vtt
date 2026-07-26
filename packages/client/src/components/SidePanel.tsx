import { useState } from 'react';
import { ROLE_GM } from '@vtt/shared';
import { PresenceList } from './PresenceList.js';
import { ChatPanel } from './ChatPanel.js';
import { ScenePanel } from './ScenePanel.js';
import { TokenPanel } from './TokenPanel.js';
import { CharacterPanel } from './CharacterPanel.js';
import { CompendiumPanel } from './CompendiumPanel.js';
import { AiPanel } from './AiPanel.js';
import { BotPanel } from './BotPanel.js';
import { useAuthStore } from '../stores/authStore.js';

type Tab = 'chat' | 'scenes' | 'tokens' | 'characters' | 'compendium' | 'bots' | 'ai';

/**
 * Side panel tabs in two rows: what everyone at the table uses, and the GM's
 * tools. Splitting them by audience rather than simply wrapping keeps both
 * rows meaningful as later stages add tabs (initiative, journal, handouts),
 * and a player still sees one short row.
 */
const TABLE_TABS: { id: Tab; label: string }[] = [
  { id: 'chat', label: 'Czat' },
  { id: 'characters', label: 'Postacie' },
  { id: 'compendium', label: 'Kompendium' },
];

const GM_TABS: { id: Tab; label: string }[] = [
  { id: 'scenes', label: 'Sceny' },
  { id: 'tokens', label: 'Tokeny' },
  { id: 'bots', label: 'Boty' },
  { id: 'ai', label: 'AI' },
];

export function SidePanel() {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const [tab, setTab] = useState<Tab>('chat');
  const gmOnly = GM_TABS.some((entry) => entry.id === tab);
  const activeTab: Tab = !isGm && gmOnly ? 'chat' : tab;

  const renderTab = (entry: { id: Tab; label: string }) => (
    <button
      key={entry.id}
      type="button"
      className={`side-tab ${activeTab === entry.id ? 'side-tab--active' : ''}`}
      onClick={() => setTab(entry.id)}
    >
      {entry.label}
    </button>
  );

  return (
    <aside className="side-panel">
      <PresenceList />
      <div className="side-tab-rows">
        <nav className="side-tabs">{TABLE_TABS.map(renderTab)}</nav>
        {isGm ? (
          <nav className="side-tabs side-tabs--gm">
            <span className="side-tabs-label">MG</span>
            {GM_TABS.map(renderTab)}
          </nav>
        ) : null}
      </div>
      {activeTab === 'chat' ? (
        <ChatPanel />
      ) : activeTab === 'scenes' ? (
        <ScenePanel />
      ) : activeTab === 'tokens' ? (
        <TokenPanel />
      ) : activeTab === 'compendium' ? (
        <CompendiumPanel />
      ) : activeTab === 'bots' ? (
        <BotPanel />
      ) : activeTab === 'ai' ? (
        <AiPanel />
      ) : (
        <CharacterPanel />
      )}
    </aside>
  );
}
