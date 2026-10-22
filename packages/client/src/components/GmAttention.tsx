import { useEffect, useRef, useState } from 'react';
import { gmAttentionTitle, type GmAttentionItem, type GmAttentionKind } from '../gm-attention.js';
import { viewScene } from '../socket.js';
import { useGmAttention, useGmAttentionStore } from '../stores/gmAttentionStore.js';
import { useMapToolStore } from '../stores/mapToolStore.js';
import { useSceneStore } from '../stores/sceneStore.js';

/** Jak długo świeża sprawa wisi kaflem, zanim zostanie sam znacznik. */
const TOAST_MS = 9000;

const KIND_ICON: Record<GmAttentionKind, string> = {
  permit: '✋',
  rank: '🎲',
  ready: '📋',
  portrait: '🖼',
  request: '❓',
  proposal: '🤖',
  scene: '🗺',
  spawn: '🚩',
  player: '👤',
  card: '📂',
};

/**
 * „Czeka na MG” w prawym górnym rogu mapy (25.09, zlecenie MG).
 *
 * Znacznik z liczbą stoi, dopóki cokolwiek czeka, i rozwija listę spraw;
 * świeża sprawa wyskakuje pod nim kaflem na kilka sekund. „Przejdź” niczego nie
 * rozstrzyga — przenosi na zakładkę, gdzie decyzja już ma swój formularz (zgoda
 * na postać niesie warunki, prośba o Test — próg), i podświetla ten wiersz.
 * Licznik trafia też do tytułu karty przeglądarki, bo MG bywa w Discordzie.
 */
export function GmAttention() {
  const items = useGmAttention();
  const toasts = useGmAttentionStore((s) => s.toasts);
  const dismiss = useGmAttentionStore((s) => s.dismiss);
  const goTo = useGmAttentionStore((s) => s.goTo);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = gmAttentionTitle(document.title, items.length);
  }, [items.length]);
  useEffect(() => () => void (document.title = gmAttentionTitle(document.title, 0)), []);

  // Kafel sprawy, którą MG rozstrzygnął gdzie indziej, znika od razu.
  const live = toasts.filter((toast) => items.some((item) => item.key === toast.key));
  useEffect(() => {
    const timers = toasts.map((toast) =>
      window.setTimeout(() => dismiss(toast.key), Math.max(0, toast.at + TOAST_MS - Date.now())),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [toasts, dismiss]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  const follow = (item: GmAttentionItem) => {
    setOpen(false);
    goTo(item);
    // Brak miejsca startu (15.10): od razu ta scena na ekranie i chorągiewka
    // w ręce — jeden klik w mapę zamyka sprawę.
    if (item.sceneId) {
      if (useSceneStore.getState().scene?.id !== item.sceneId) void viewScene(item.sceneId);
      useMapToolStore.getState().setTool('spawn');
    }
  };

  return (
    <div className="gm-attention" ref={rootRef}>
      <button
        type="button"
        className="gm-attention-badge"
        aria-expanded={open}
        title={open ? 'Zwiń listę spraw' : 'Pokaż, co czeka na twoją decyzję'}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden>⚠</span> Czeka na MG
        <span className="gm-attention-count">{items.length}</span>
      </button>
      {open ? (
        <ul className="gm-attention-list" aria-label="Sprawy czekające na MG">
          {items.map((item) => (
            <li key={item.key} className="gm-attention-row">
              <span className="gm-attention-icon" aria-hidden>
                {KIND_ICON[item.kind]}
              </span>
              <span className="gm-attention-text">{item.text}</span>
              <button type="button" className="small-button" onClick={() => follow(item)}>
                Przejdź
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="gm-attention-toasts" aria-live="polite">
          {live.map((item) => (
            // Skóra paska kanału (etap 55b): sprawa do decyzji to bursztyn.
            <div key={item.key} className="notice notice--warn gm-attention-toast">
              <div className="notice-head">
                <p className="notice-title">Czeka na MG</p>
                <button
                  type="button"
                  className="notice-close"
                  title="Schowaj — sprawa zostaje na liście"
                  aria-label="Schowaj"
                  onClick={() => dismiss(item.key)}
                >
                  ✕
                </button>
              </div>
              <p className="notice-text">
                <span aria-hidden>{KIND_ICON[item.kind]}</span> {item.text}
              </p>
              <div className="notice-actions">
                <button type="button" className="notice-action" onClick={() => follow(item)}>
                  Przejdź
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
