import { useEffect, useState } from 'react';
import { ROLE_GM } from '@vtt/shared';
import { PresenceList } from './PresenceList.js';
import { ChatPanel } from './ChatPanel.js';
import { ScenePanel } from './ScenePanel.js';
import { TokenPanel } from './TokenPanel.js';
import { CharacterPanel } from './CharacterPanel.js';
import { CompendiumPanel } from './CompendiumPanel.js';
import { CombatPanel } from './CombatPanel.js';
import { AiPanel } from './AiPanel.js';
import { BotPanel } from './BotPanel.js';
import { RulesPanel } from './RulesPanel.js';
import { KnowledgePanel } from './KnowledgePanel.js';
import { NetPanel } from './NetPanel.js';
import { JournalPanel } from './JournalPanel.js';
import { HandoutPanel } from './HandoutPanel.js';
import { ArchivePanel } from './ArchivePanel.js';
import { SidePanelResizer, useSidePanelWidth } from './SidePanelResizer.js';
import { useAuthStore } from '../stores/authStore.js';
import { useJournalStore } from '../stores/journalStore.js';

type Tab =
  | 'chat'
  | 'scenes'
  | 'tokens'
  | 'characters'
  | 'compendium'
  | 'combat'
  | 'bots'
  | 'rules'
  | 'knowledge'
  | 'net'
  | 'journal'
  | 'handouts'
  | 'ai'
  | 'archive';

/**
 * Side panel tabs in two rows: what everyone at the table uses, and the GM's
 * tools. Splitting them by audience rather than simply wrapping keeps both
 * rows meaningful as later stages add tabs (initiative, journal, handouts),
 * and a player still sees one short row.
 */
const TABLE_TABS: { id: Tab; label: string }[] = [
  { id: 'chat', label: 'Czat' },
  { id: 'characters', label: 'Postacie' },
  { id: 'combat', label: 'Walka' },
  { id: 'compendium', label: 'Kompendium' },
  // Handouty stoją w rzędzie stołu, nie MG: to jedyna lista materiałów MG,
  // którą gracz też otwiera — u siebie widzi wyłącznie to, co dostał.
  { id: 'handouts', label: 'Handouty' },
  // Dziennik przeszedł tu z rzędu MG w etapie 24b, z tego samego powodu:
  // gracz czyta kronikę, tyle że wyłącznie wpisy odsłonięte stołowi.
  { id: 'journal', label: 'Dziennik' },
];

const GM_TABS: { id: Tab; label: string }[] = [
  { id: 'scenes', label: 'Sceny' },
  { id: 'tokens', label: 'Tokeny' },
  { id: 'bots', label: 'Boty' },
  { id: 'rules', label: 'Zasady' },
  { id: 'knowledge', label: 'Wiedza' },
  { id: 'net', label: 'Sieć' },
  { id: 'ai', label: 'AI' },
  { id: 'archive', label: 'Kopie' },
];

export function SidePanel() {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const width = useSidePanelWidth();
  const [tab, setTab] = useState<Tab>('chat');
  const journalFocus = useJournalStore((s) => s.focus);
  const gmOnly = GM_TABS.some((entry) => entry.id === tab);
  const activeTab: Tab = !isGm && gmOnly ? 'chat' : tab;

  // „Otwórz" przy linii dziennika na czacie przełącza zakładkę; sam wpis
  // rozwija już panel, który wtedy dostaje ognisko w store.
  useEffect(() => {
    if (journalFocus) setTab('journal');
  }, [journalFocus]);

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
    <aside className="side-panel" style={{ width: `${width}px` }}>
      <SidePanelResizer width={width} />
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
      ) : activeTab === 'combat' ? (
        <CombatPanel />
      ) : activeTab === 'compendium' ? (
        <CompendiumPanel />
      ) : activeTab === 'bots' ? (
        <BotPanel />
      ) : activeTab === 'rules' ? (
        <RulesPanel />
      ) : activeTab === 'knowledge' ? (
        <KnowledgePanel />
      ) : activeTab === 'net' ? (
        <NetPanel />
      ) : activeTab === 'journal' ? (
        <JournalPanel />
      ) : activeTab === 'handouts' ? (
        <HandoutPanel />
      ) : activeTab === 'ai' ? (
        <AiPanel />
      ) : activeTab === 'archive' ? (
        <ArchivePanel />
      ) : (
        <CharacterPanel />
      )}
    </aside>
  );
}
