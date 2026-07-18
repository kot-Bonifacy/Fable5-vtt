import { useState } from 'react';
import { ROLE_GM } from '@vtt/shared';
import { PresenceList } from './PresenceList.js';
import { ChatPanel } from './ChatPanel.js';
import { ScenePanel } from './ScenePanel.js';
import { TokenPanel } from './TokenPanel.js';
import { CharacterPanel } from './CharacterPanel.js';
import { useAuthStore } from '../stores/authStore.js';

type Tab = 'chat' | 'scenes' | 'tokens' | 'characters';

export function SidePanel() {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const [tab, setTab] = useState<Tab>('chat');
  // Players get chat + characters; the GM additionally scenes + tokens.
  const activeTab: Tab = !isGm && (tab === 'scenes' || tab === 'tokens') ? 'chat' : tab;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'chat', label: 'Czat' },
    ...(isGm
      ? ([
          { id: 'scenes', label: 'Sceny' },
          { id: 'tokens', label: 'Tokeny' },
        ] as const)
      : []),
    { id: 'characters', label: 'Postacie' },
  ];

  return (
    <aside className="side-panel">
      <PresenceList />
      <nav className="side-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`side-tab ${activeTab === t.id ? 'side-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {activeTab === 'chat' ? (
        <ChatPanel />
      ) : activeTab === 'scenes' ? (
        <ScenePanel />
      ) : activeTab === 'tokens' ? (
        <TokenPanel />
      ) : (
        <CharacterPanel />
      )}
    </aside>
  );
}
