import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { TopBar } from './components/TopBar.js';
import { MapArea } from './components/MapArea.js';
import { SidePanel } from './components/SidePanel.js';
import { DiceCup } from './components/DiceCup.js';
import { CharacterSheets } from './components/CharacterSheet.js';
import { BotEditors } from './components/BotEditor.js';
import { RollDialog } from './components/RollDialog.js';
import { LoginPage } from './pages/LoginPage.js';
import { JoinPage } from './pages/JoinPage.js';
import { GmPanel } from './pages/GmPanel.js';
import { useAuthStore } from './stores/authStore.js';
import { connectSocket, disconnectSocket } from './socket.js';

function GameView() {
  return (
    <div className="app-layout">
      <TopBar />
      <main className="app-main">
        <MapArea />
        <SidePanel />
      </main>
      <CharacterSheets />
      <BotEditors />
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
