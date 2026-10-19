import { useEffect, useState } from 'react';
import { ROLE_GM, isCheckRequestOpen } from '@vtt/shared';
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
import { TablePanel } from './TablePanel.js';
import { NetPanel } from './NetPanel.js';
import { JournalPanel } from './JournalPanel.js';
import { HandoutPanel } from './HandoutPanel.js';
import { ArchivePanel } from './ArchivePanel.js';
import { SidePanelResizer, useSidePanelWidth } from './SidePanelResizer.js';
import { useAuthStore } from '../stores/authStore.js';
import { useChatStore } from '../stores/chatStore.js';
import { useCreationRankStore, waitingRankCount } from '../stores/creationRankStore.js';
import { useGmAttentionStore } from '../stores/gmAttentionStore.js';
import { useWaitingCharacters } from './CharacterReadyPanel.js';
import { useBetweenSessions } from '../session-view.js';
import { useJournalStore } from '../stores/journalStore.js';
import { useSightingTabSwitch } from '../foe-sighting.js';

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
  | 'tables'
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
  // „Grafiki”, dawniej „Tokeny” (15.10): sama biblioteka obrazków figur —
  // postaci z kartą stawia się z „Postaci”, a obrazek stojącej figury zmienia
  // „🖼 Zmień grafikę…” w jej menu.
  { id: 'tokens', label: 'Grafiki' },
  { id: 'bots', label: 'Boty' },
  { id: 'rules', label: 'Zasady' },
  { id: 'knowledge', label: 'Wiedza' },
  { id: 'tables', label: 'Losowe' },
  { id: 'net', label: 'Sieć' },
  { id: 'ai', label: 'AI' },
  { id: 'archive', label: 'Kopie' },
];

/**
 * Ile próśb o Test czeka na MG (etap 40).
 *
 * Prośba jest **cicha** — nie ma dźwięku, nie odsłania się nikomu poza MG
 * i szybko odjeżdża w górę feedu — więc bez tej liczby przy zakładce ginie
 * między rzutami, a gracz czeka w ciszy. Liczone wprost z feedu, tak jak kubek
 * szuka otwartego wezwania: dwa magazyny stanu o tym samym rozjechałyby się
 * przy pierwszym „Odmów".
 */
function useWaitingRequestCount(isGm: boolean): number {
  return useChatStore((state) =>
    isGm
      ? state.items.reduce(
          (count, item) =>
            item.type === 'message' &&
            item.message.request !== undefined &&
            isCheckRequestOpen(item.message.request)
              ? count + 1
              : count,
          0,
        )
      : 0,
  );
}

/**
 * Jedna plakietka na zakładce „Postacie", dwa powody (naprawa 3c): szkice bez
 * Rangi Postaci z 2b i karty czekające na przyjęcie do gry. Dwa znaczki obok
 * siebie czytałyby się jak liczba i jej poprawka.
 */
function badgeTitle(ranks: number, ready: number): string {
  const parts: string[] = [];
  if (ranks > 0) parts.push(`szkice czekające na Rangę Postaci: ${ranks}`);
  if (ready > 0) parts.push(`nowe postaci czekające na gotowość do gry: ${ready}`);
  return `W zakładce „Postacie" — ${parts.join('; ')}`;
}

export function SidePanel() {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const width = useSidePanelWidth();
  const [tab, setTab] = useState<Tab>('chat');
  const journalFocus = useJournalStore((s) => s.focus);
  const waitingRequests = useWaitingRequestCount(isGm);
  // Naprawa 2b: players' drafts waiting for the GM's rank. The list is empty
  // for a player, so the badge never shows there.
  const waitingRanks = useCreationRankStore((s) =>
    isGm ? waitingRankCount(s.rows, s.permits) : 0,
  );
  // Naprawa 3c: karty prosto z kreatora, które czekają na „Przyjmij do gry".
  // Liczone z magazynu postaci, a nie z osobnej listy — MG widzi wszystkie
  // karty kampanii, więc drugi tor synchronizacji tylko by się rozjeżdżał.
  const waitingReady = useWaitingCharacters(isGm).length;
  const waitingCharacters = waitingRanks + waitingReady;
  const gmOnly = GM_TABS.some((entry) => entry.id === tab);
  const betweenSessions = useBetweenSessions();
  const activeTab: Tab = (!isGm && gmOnly) || (betweenSessions && tab === 'combat') ? 'chat' : tab;

  // Etap 56: drużyna zobaczyła wroga — MG dobiera uczestników w „Walka”.
  useSightingTabSwitch(isGm, () => setTab('combat'));

  // „Otwórz" przy linii dziennika na czacie przełącza zakładkę; sam wpis
  // rozwija już panel, który wtedy dostaje ognisko w store.
  useEffect(() => {
    if (journalFocus) setTab('journal');
  }, [journalFocus]);

  // „Czeka na MG” (25.09): „Przejdź” otwiera zakładkę decyzji, a gdy panel
  // się narysuje — przewija do wiersza z tym samym kluczem i go podświetla.
  const attentionFocus = useGmAttentionStore((s) => s.focus);
  useEffect(() => {
    if (!attentionFocus) return;
    setTab(attentionFocus.tab);
    const highlight = () => {
      const row = document.querySelector<HTMLElement>(
        `.side-panel [data-attention="${CSS.escape(attentionFocus.key)}"]`,
      );
      if (!row) return;
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      row.classList.remove('attention-flash');
      void row.offsetWidth;
      row.classList.add('attention-flash');
    };
    // Two frames: the first lets React commit the switched tab.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(highlight);
    });
    return () => cancelAnimationFrame(frame);
  }, [attentionFocus]);

  const renderTab = (entry: { id: Tab; label: string }) => (
    <button
      key={entry.id}
      type="button"
      className={`side-tab ${activeTab === entry.id ? 'side-tab--active' : ''}`}
      onClick={() => setTab(entry.id)}
    >
      {entry.label}
      {entry.id === 'chat' && waitingRequests > 0 && (
        <span
          className="side-tab-badge"
          title={`Prośby o Test czekające na twoją decyzję: ${waitingRequests}`}
        >
          {waitingRequests}
        </span>
      )}
      {entry.id === 'characters' && waitingCharacters > 0 && (
        <span className="side-tab-badge" title={badgeTitle(waitingRanks, waitingReady)}>
          {waitingCharacters}
        </span>
      )}
    </button>
  );

  return (
    <aside className="side-panel" style={{ width: `${width}px` }}>
      <SidePanelResizer width={width} />
      <PresenceList />
      <div className="side-tab-rows">
        <nav className="side-tabs">
          {/* Między sesjami (44c) nie ma walki — reszta rzędu stołu zostaje. */}
          {TABLE_TABS.filter((entry) => !betweenSessions || entry.id !== 'combat').map(renderTab)}
        </nav>
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
      ) : activeTab === 'tables' ? (
        <TablePanel />
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
