import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { TopBar } from './components/TopBar.js';
import { MapArea } from './components/MapArea.js';
import { CombatHud } from './components/CombatHud.js';
import { SidePanel } from './components/SidePanel.js';
import { DiceCup } from './components/DiceCup.js';
import { CharacterSheets } from './components/CharacterSheet.js';
import { CharacterCreator } from './components/CharacterCreator.js';
import { HandoutWindows } from './components/HandoutWindow.js';
import { BotEditors } from './components/BotEditor.js';
import { NetArchitectureEditor } from './components/NetArchitectureEditor.js';
import { RollDialog } from './components/RollDialog.js';
import { LoginPage } from './pages/LoginPage.js';
import { JoinPage } from './pages/JoinPage.js';
import { GmPanel } from './pages/GmPanel.js';
import { useAuthStore } from './stores/authStore.js';
import { connectSocket, disconnectSocket } from './socket.js';

/**
 * At the table the right button belongs to the game — it opens the token menu
 * on the map — so the browser's own menu stays out of the way. Two exceptions
 * keep real work possible: text fields (paste, spellcheck) and a live text
 * selection (copying a line out of the chat log).
 */
function useGameContextMenu(): void {
  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      // The map is the game surface: never let the browser menu cover it.
      if (!target?.closest('.map-area')) {
        if (target?.closest('input, textarea, [contenteditable="true"]')) return;
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && selection.toString().trim() !== '') return;
      }
      event.preventDefault();
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, []);
}

function GameView() {
  useGameContextMenu();
  return (
    <div className="app-layout">
      <TopBar />
      <main className="app-main">
        {/* Stage 16f: the combat HUD is a rail of its own rather than an
            overlay, so the panel and the action bar never sit on top of the
            ground somebody is trying to click. */}
        <CombatHud />
        <MapArea />
        <SidePanel />
      </main>
      <CharacterSheets />
      <CharacterCreator />
      <HandoutWindows />
      <BotEditors />
      <NetArchitectureEditor />
      <RollDialog />
      <DiceCup />
    </div>
  );
}

export function App() {
  const status = useAuthStore((s) => s.status);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  // Keyed by user id: joining as somebody else in the same browser must not
  // keep the previous user's socket (and their state) alive.
  useEffect(() => {
    if (status === 'authenticated' && userId) {
      connectSocket(userId);
    } else if (status === 'anonymous') {
      disconnectSocket();
    }
  }, [status, userId]);

  if (status === 'loading') {
    return (
      <div className="auth-screen">
        <p className="placeholder-text">Ładowanie…</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/join/:token" element={<JoinPage />} />
      {status === 'anonymous' ? (
        <Route path="*" element={<LoginPage />} />
      ) : (
        <>
          <Route path="/" element={<GameView />} />
          <Route path="/gm" element={<GmPanel />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
    </Routes>
  );
}
