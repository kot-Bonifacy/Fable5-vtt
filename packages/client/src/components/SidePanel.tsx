import { useState } from 'react';
import { ROLE_GM } from '@vtt/shared';
import { PresenceList } from './PresenceList.js';
import { ChatPanel } from './ChatPanel.js';
import { ScenePanel } from './ScenePanel.js';
import { TokenPanel } from './TokenPanel.js';
import { useAuthStore } from '../stores/authStore.js';

type Tab = 'chat' | 'scenes' | 'tokens';

export function SidePanel() {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const [tab, setTab] = useState<Tab>('chat');
  const activeTab: Tab = isGm ? tab : 'chat';

  return (
    <aside className="side-panel">
      <PresenceList />
      {isGm && (
        <nav className="side-tabs">
          <button
            type="button"
            className={`side-tab ${activeTab === 'chat' ? 'side-tab--active' : ''}`}
            onClick={() => setTab('chat')}
          >
            Czat
          </button>
          <button
            type="button"
            className={`side-tab ${activeTab === 'scenes' ? 'side-tab--active' : ''}`}
            onClick={() => setTab('scenes')}
          >
            Sceny
          </button>
          <button
            type="button"
            className={`side-tab ${activeTab === 'tokens' ? 'side-tab--active' : ''}`}
            onClick={() => setTab('tokens')}
          >
            Tokeny
          </button>
        </nav>
      )}
      {activeTab === 'chat' ? (
        <ChatPanel />
      ) : activeTab === 'scenes' ? (
        <ScenePanel />
      ) : (
        <TokenPanel />
      )}
    </aside>
  );
}
