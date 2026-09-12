import { useEffect, useMemo, useState } from 'react';
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
  const [query, setQuery] = useState('');

  const groups = useMemo(() => shortcutGroupsFor(isGm), [isGm]);
  const search = query.trim().toLocaleLowerCase('pl');
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        `${group.title} ${item.keys} ${item.what}`.toLocaleLowerCase('pl').includes(search),
      ),
    }))
    .filter((group) => group.items.length > 0);
  const resultCount = visibleGroups.reduce((count, group) => count + group.items.length, 0);
  const placement = useWindowPlacement('shortcuts', () => ({
    x: Math.max(12, Math.round(window.innerWidth / 2) - 320),
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
      onKeyDown={(event) => {
        // Nawigacja po pomocy nie może przełączać figur ani narzędzi mapy.
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          setOpen(false);
        }
        if (
          (event.key === '?' || (event.code === 'Slash' && event.shiftKey)) &&
          !(event.target as HTMLElement).closest(
            'input, textarea, select, [contenteditable="true"]',
          )
        ) {
          setOpen(false);
        }
      }}
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
      <div className="shortcuts-toolbar">
        <p className="shortcuts-intro">
          Klawiatura i gesty myszy <span>• {isGm ? 'Mistrz Gry' : 'Gracz'}</span>
        </p>
        <label className="shortcuts-search">
          <span>Szukaj skrótu lub czynności</span>
          <input
            type="search"
            value={query}
            placeholder="Np. linijka, Shift, rzut…"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="shortcuts-search-status">
          <span role="status">
            {search ? `Wyniki: ${resultCount}` : 'Wybierz czynność z listy poniżej'}
          </span>
          {query && (
            <button type="button" className="small-button" onClick={() => setQuery('')}>
              Wyczyść
            </button>
          )}
        </div>
      </div>
      <div className="settings-window-body shortcuts-body">
        {visibleGroups.length === 0 && (
          <p className="shortcuts-empty">
            Brak pasujących skrótów. Wpisz inną nazwę lub wyczyść wyszukiwanie.
          </p>
        )}
        {visibleGroups.map((group) => (
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
                      <span key={`${index}:${part}`} className="shortcuts-key-part">
                        {index > 0 && <span className="shortcuts-plus">+</span>}
                        <kbd>{part}</kbd>
                      </span>
                    ))}
                  </dt>
                  <dd>
                    {item.what}
                    {item.gmOnly && <span className="shortcuts-role">MG</span>}
                  </dd>
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
