import { ROLE_GM } from '@vtt/shared';
import { useAttackStore } from '../stores/attackStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { useRulerStore } from '../stores/rulerStore.js';

/**
 * The map's own little toolbar (stage 16): the ruler, its privacy switch and
 * the range-ring toggle. It deliberately holds no game logic — every button
 * flips a store flag that the renderer reads.
 */
export function MapTools() {
  const toolActive = useRulerStore((s) => s.toolActive);
  const privateMode = useRulerStore((s) => s.privateMode);
  const toggleTool = useRulerStore((s) => s.toggleTool);
  const setPrivateMode = useRulerStore((s) => s.setPrivateMode);
  const overlay = useAttackStore((s) => s.overlay);
  const setOverlay = useAttackStore((s) => s.setOverlay);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);

  return (
    <div className="map-tools" role="toolbar" aria-label="Narzędzia mapy">
      <button
        type="button"
        className={`map-tool${toolActive ? ' map-tool--active' : ''}`}
        title="Linijka (M) — przeciągnij po mapie, Spacja dokłada załamanie, Esc kończy"
        aria-pressed={toolActive}
        onClick={toggleTool}
      >
        📏
      </button>
      {isGm && (
        <button
          type="button"
          className={`map-tool${privateMode ? ' map-tool--active' : ''}`}
          title={
            privateMode
              ? 'Pomiar prywatny: gracze nie widzą twojej linijki'
              : 'Pomiar widoczny dla wszystkich przy stole'
          }
          aria-pressed={privateMode}
          onClick={() => setPrivateMode(!privateMode)}
        >
          {privateMode ? '🙈' : '👁'}
        </button>
      )}
      {overlay && (
        <button
          type="button"
          className="map-tool map-tool--active"
          title={`Pierścienie zasięgu: ${overlay.weaponName}${
            overlay.autofire ? ' (ogień ciągły)' : ''
          } — kliknij, by schować`}
          onClick={() => setOverlay(null)}
        >
          ◎
        </button>
      )}
    </div>
  );
}
