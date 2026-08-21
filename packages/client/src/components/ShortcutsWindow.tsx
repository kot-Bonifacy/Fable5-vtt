import { useEffect, useMemo } from 'react';
import { ROLE_GM } from '@vtt/shared';
import { shortcutGroupsFor } from '../shortcuts.js';
import { useAuthStore } from '../stores/authStore.js';
import { useHelpStore } from '../stores/helpStore.js';
import { useWindowPlacement } from '../window-placement.js';
import { WindowResizeGrip } from './WindowResizeGrip.js';

/**
 * Okno skrótów klawiszowych — `?` (etap 27f).
 *
 * Wpis w `POMYSLY.md` z 01.08: „pasek nosi skróty w `title` i w stopce, ale
 * pełnej listy nie ma nigdzie". Okno jest z tej samej rodziny co ustawienia
 * i karta postaci — pływa, przeciąga się i pamięta, gdzie je postawiono.
 *
 * Gracz nie ogląda skrótów MG. To nie jest kwestia bezpieczeństwa (klawisz
 * i tak nic u niego nie zrobi), tylko uczciwości listy: rozdział „Ściany,
 * drzwi i okna" w oknie gracza obiecywałby narzędzie, którego u niego nie ma.
 */
export function ShortcutsWindow() {
  const open = useHelpStore((s) => s.open);
  const setOpen = useHelpStore((s) => s.setOpen);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);

  const groups = useMemo(() => shortcutGroupsFor(isGm), [isGm]);
  const placement = useWindowPlacement('shortcuts', () => ({
    x: Math.max(12, Math.round(window.innerWidth / 2) - 260),
    y: 72,
  }));

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <section
      ref={placement.ref}
      className="settings-window shortcuts-window"
      style={placement.style}
      aria-label="Skróty klawiszowe"
    >
      <div className="settings-window-header" {...placement.dragProps}>
        <span className="settings-window-title">⌨ Skróty klawiszowe</span>
        <button
          type="button"
          className="sheet-close"
          onClick={() => setOpen(false)}
          title="Zamknij listę skrótów"
          aria-label="Zamknij listę skrótów"
        >
          ✕
        </button>
      </div>
      <div className="settings-window-body">
        {groups.map((group) => (
          <section key={group.title} className="shortcuts-group">
            <h3 className="settings-group-title">{group.title}</h3>
            {group.note && <p className="shortcuts-note">{group.note}</p>}
            <dl className="shortcuts-list">
              {group.items.map((item) => (
                <div key={`${item.keys}:${item.what}`} className="shortcuts-row">
                  <dt>
                    {/* Każdy człon osobno, żeby „Shift + 1…9" wyglądało jak dwa
                        klawisze i plus, a nie jak jeden długi napis w ramce. */}
                    {item.keys.split(' + ').map((part, index) => (
                      <span key={part}>
                        {index > 0 && <span className="shortcuts-plus">+</span>}
                        <kbd>{part}</kbd>
                      </span>
                    ))}
                  </dt>
                  <dd>{item.what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <WindowResizeGrip resizeProps={placement.resizeProps} />
    </section>
  );
}

/**
 * Wejście do okna z górnego paska. Sam klawisz `?` nie wystarczy — trzeba
 * wiedzieć, że istnieje, a to jest dokładnie ta wiedza, której okno pomocy
 * ma dostarczyć.
 */
export function ShortcutsButton() {
  const open = useHelpStore((s) => s.open);
  const toggleOpen = useHelpStore((s) => s.toggleOpen);

  const title = 'Skróty klawiszowe (?)';

  return (
    <button
      type="button"
      className={`small-button${open ? ' small-button--on' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={open}
      onClick={toggleOpen}
    >
      ?
    </button>
  );
}
