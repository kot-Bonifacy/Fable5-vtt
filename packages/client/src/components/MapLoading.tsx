import {
  backgroundLoadFraction,
  backgroundLoadText,
  type BackgroundLoad,
} from '../map/background-load.js';

/**
 * Mapa sceny w drodze (20.10, zlecenie MG). Dopóki nie ma podglądu, gracz
 * patrzy na plakat Night City z licznikiem, a nie w czarne pole z kręciołkiem.
 * Gdy podgląd stoi już na mapie, zostaje tylko pasek u dołu: mapa jest, tylko
 * jeszcze nieostra.
 */
export function MapLoading({ load }: { load: BackgroundLoad }) {
  const text = backgroundLoadText(load);
  const fraction = backgroundLoadFraction(load);
  const bar = (
    <div
      className="map-loading-bar"
      role="progressbar"
      aria-label="Wczytywanie mapy"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={fraction === null ? undefined : Math.round(fraction * 100)}
      data-indeterminate={fraction === null || undefined}
    >
      <span style={fraction === null ? undefined : { width: `${fraction * 100}%` }} />
    </div>
  );

  if (load.preview) {
    return (
      <div className="map-loading-pill" aria-live="polite">
        <span className="map-loading-pill-label">Mapa się wyostrza{text ? ` · ${text}` : '…'}</span>
        {bar}
      </div>
    );
  }
  return (
    <section className="between-sessions between-sessions--map" aria-label="Wczytywanie mapy">
      <div className="between-sessions-card">
        <p className="between-sessions-eyebrow">Nowa scena</p>
        <h1 className="between-sessions-title">Wczytywanie mapy</h1>
        <div className="auth-rule" aria-hidden="true" />
        {bar}
        <p className="between-sessions-hint">{text ?? 'Łączenie z serwerem…'}</p>
      </div>
    </section>
  );
}
