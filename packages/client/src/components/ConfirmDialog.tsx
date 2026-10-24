import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

/** Pola i guziki, po których chodzi `Tab` — także w kreatorze (szukanie braku). */
export const FOCUSABLE =
  'input:not([disabled]), select:not([disabled]), button:not([disabled]), textarea:not([disabled])';

/**
 * Pytanie w oknie zamiast `window.confirm` — wspólne dla kreatora (naprawa 2b)
 * i karty postaci (usuwanie przedmiotu, 24.10.2026).
 *
 * Kładzie się na najbliższym przodku z `position` (okno karty albo kreatora),
 * zaczyna od „Anuluj", trzyma `Tab` w sobie, zamyka się `Esc` i kliknięciem
 * w tło, a po zamknięciu oddaje klawiaturę temu, co je otworzyło. Fokus na
 * „Anuluj" to cała ochrona przed pomyłką: drugi klik w to samo miejsce albo
 * `Enter` niczego nie usuwa.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  /** Treść pod tytułem — co przepadnie i co jeszcze się stanie. */
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancel.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      // Stops here: Esc also puts a loaded dice cup down, which is not what
      // closing this question means.
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !box.current) return;
    const focusable = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="confirm-dialog-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={box}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={onKeyDown}
      >
        <h3 id={titleId}>{title}</h3>
        <div id={bodyId} className="confirm-dialog-body">
          {children}
        </div>
        <div className="confirm-dialog-actions">
          <button ref={cancel} type="button" className="small-button" onClick={onClose}>
            Anuluj
          </button>
          <button
            type="button"
            className="small-button small-button--danger"
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
