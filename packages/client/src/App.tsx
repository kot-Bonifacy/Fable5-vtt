import { TopBar } from './components/TopBar.js';
import { MapArea } from './components/MapArea.js';
import { SidePanel } from './components/SidePanel.js';

export function App() {
  return (
    <div className="app-layout">
      <TopBar />
      <main className="app-main">
        <MapArea />
        <SidePanel />
      </main>
    </div>
  );
}
