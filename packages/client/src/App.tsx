import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { TopBar } from './components/TopBar.js';
import { MapArea } from './components/MapArea.js';
import { SidePanel } from './components/SidePanel.js';
import { DiceCup } from './components/DiceCup.js';
import { CharacterSheets } from './components/CharacterSheet.js';
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
      <DiceCup />
    </div>
  );
}

export function App() {
  const status = useAuthStore((s) => s.status);
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (status === 'authenticated') {
      connectSocket();
    } else if (status === 'anonymous') {
      disconnectSocket();
    }
  }, [status]);

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
