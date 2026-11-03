import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type {
  CpredItemEquipped,
  CpredItemIcon,
  CpredItemList,
  CpredItemIconSource,
} from '@vtt/shared';
import { CPRED_ITEM_LIST_LABELS } from '@vtt/shared';
import { HudIcon } from '../HudIcon.js';
import { useRowIcon } from '../ItemIcons.js';
import { itemKey } from './items.js';

/**
 * Siatka kafelków okna „Wymiana” (etap 64b, wzór: ekwipunek z Baldur's Gate 3).
 *
 * Każda kolumna okna — mój ekwipunek, pole wymiany, ciało, pojemnik, półka —
 * to ta sama siatka: kafel z sylwetką, nazwą i liczbą sztuk w rogu, puste
 * kratki dopełniające rzędy. Zaznacza się jak pliki w eksploratorze: klik —
 * jeden, Ctrl+klik — dołóż albo zdejmij, Shift+klik — zakres, Ctrl+A —
 * wszystko, Esc — nic. Przeciągnięcie kafla z zaznaczenia niesie całe
 * zaznaczenie, dwuklik (albo Enter) robi akcję kolumny na zaznaczeniu.
 *
 * Pasek pod siatką mówi, co jest wybrane (nazwa i szczegóły — kafel ich nie
 * mieści), trzyma pole ilości dla stosu i przycisk akcji z liczbą rzeczy.
 *
 * Siatka niczego nie wysyła: zaznaczenie trzyma `useGridSelection` u rodzica,
 * a akcję i przeciąganie podaje kolumna — bo „co znaczy upuścić tutaj” wie
 * tryb okna, nie kafel.
 */

/** Szerokość kafla i odstęp w pikselach — te same liczby stoją w `.item-grid`. */
const TILE_PX = 76;
const GAP_PX = 4;

export interface GridTile {
  key: string;
  name: string;
  /** Sylwetka rodzaju; `null` — torba (kafel bez sylwetki wyglądałby jak pusta kratka). */
  icon: CpredItemIcon | null;
  /** Liczba w rogu: sztuki stosu albo „∞” na półce bez dna. */
  badge?: string;
  /** Szczegóły na pasku pod siatką: „7/8 · B.C. Pistolet”, „OB 12/12”. */
  detail?: string;
  /** Cena na dole kafla (odkup, półka, pole sprzedaży). */
  price?: string;
  /** Rodzaj przedmiotu w dymku. */
  kind?: string;
  /** Widać, ale nie da się złapać ani wybrać (handlarz tego nie wyceni). */
  blocked?: boolean;
  /** Dymek kafla zablokowanego — dlaczego. */
  blockedHint?: string;
  stackable?: boolean;
  /** Ile sztuk ma stos — pole ilości na pasku ma taki sufit. */
  qty?: number;
  /**
   * Rzecz w użyciu na karcie (03.11.2026, wzór z cRPG): znaczek w rogu kafla
   * i słowo na pasku — oddajesz broń z ręki albo kurtkę z grzbietu.
   */
  equipped?: CpredItemEquipped;
}

/** Sylwetka znaczka „w użyciu” w lewym górnym rogu kafla. */
const EQUIPPED_ICONS: Record<CpredItemEquipped, string> = {
  hands: 'fist',
  worn: 'armor',
  'in-use': 'grab',
};

/** Słowo znaczka „w użyciu” — dymek kafla i pasek pod siatką. */
export const ITEM_EQUIPPED_LABELS: Record<CpredItemEquipped, string> = {
  hands: 'w rękach',
  worn: 'na sobie',
  'in-use': 'w użyciu',
};

/** Kafel z wiersza ekwipunku albo półki: klucz, sylwetka, liczba sztuk. */
export function useItemTile(): (
  item: CpredItemIconSource & {
    list: CpredItemList;
    rowId: string;
    name: string;
    qty: number;
    stackable: boolean;
    detail: string;
    equipped?: CpredItemEquipped;
  },
  extra?: Partial<GridTile>,
) => GridTile {
  const rowIcon = useRowIcon();
  return useCallback(
    (item, extra) => ({
      key: itemKey(item),
      name: item.name,
      icon: rowIcon(item.list, item),
      stackable: item.stackable,
      qty: item.qty,
      ...(item.stackable && item.qty > 1 ? { badge: `×${item.qty}` } : {}),
      ...(item.stackable ? {} : { detail: item.detail }),
      kind: CPRED_ITEM_LIST_LABELS[item.list],
      ...(item.equipped ? { equipped: item.equipped } : {}),
      ...extra,
    }),
    [rowIcon],
  );
}

/** „1 przedmiot”, „3 przedmioty”, „5 przedmiotów”. */
export function countLabel(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  if (count === 1) return '1 przedmiot';
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return `${count} przedmioty`;
  return `${count} przedmiotów`;
}

export interface GridSelection {
  /** Zaznaczone klucze w kolejności siatki. */
  selected: string[];
  /** Ostatnio kliknięty kafel, o ile jest zaznaczony — jego opisuje pasek. */
  focus: string | null;
  isSelected: (key: string) => boolean;
  click: (key: string, event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => void;
  toggle: (key: string) => void;
  selectAll: () => void;
  clear: () => void;
  /** Co niesie przeciągnięcie albo dwuklik tego kafla: całe zaznaczenie, gdy kafel w nim jest. */
  carry: (key: string) => string[];
  /** Dwuklik w kafel z większego zaznaczenia nie może go zwinąć do jednego (patrz `click`). */
  holdSelection: () => void;
}

/** Zaznaczenie jednej siatki. Klucze, których już nie ma, wypadają same. */
export function useGridSelection(keys: readonly string[]): GridSelection {
  const [picked, setPicked] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const collapse = useRef<number | null>(null);

  const order = useMemo(() => new Map(keys.map((key, index) => [key, index])), [keys]);
  const selected = useMemo(
    () => picked.filter((key) => order.has(key)).sort((a, b) => order.get(a)! - order.get(b)!),
    [picked, order],
  );

  const holdSelection = useCallback(() => {
    if (collapse.current !== null) window.clearTimeout(collapse.current);
    collapse.current = null;
  }, []);
  useEffect(() => holdSelection, [holdSelection]);

  const click: GridSelection['click'] = (key, event) => {
    holdSelection();
    if (event.ctrlKey || event.metaKey) {
      setPicked((current) =>
        current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
      );
      setAnchor(key);
      return;
    }
    if (event.shiftKey && anchor !== null && order.has(anchor)) {
      const ends = [order.get(anchor)!, order.get(key)!];
      setPicked(keys.slice(Math.min(...ends), Math.max(...ends) + 1));
      return;
    }
    setAnchor(key);
    // Zwykły klik w kafel z większego zaznaczenia zwija je do jednego dopiero
    // po chwili — dwuklik w ten kafel ma zadziałać na całym zaznaczeniu, jak
    // w eksploratorze plików.
    if (selected.length > 1 && selected.includes(key)) {
      collapse.current = window.setTimeout(() => {
        collapse.current = null;
        setPicked([key]);
      }, 350);
      return;
    }
    setPicked([key]);
  };

  return {
    selected,
    focus: anchor !== null && selected.includes(anchor) ? anchor : (selected.at(-1) ?? null),
    isSelected: (key) => selected.includes(key),
    click,
    toggle: (key) => click(key, { ctrlKey: true, metaKey: false, shiftKey: false }),
    selectAll: () => setPicked([...keys]),
    clear: () => {
      holdSelection();
      setPicked([]);
    },
    carry: (key) => (selected.includes(key) ? selected : [key]),
    holdSelection,
  };
}

type DragHandlers = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
};

/** Ile kafli mieści się w rzędzie — dopełnienie pustymi kratkami ma kończyć rzędy. */
function useColumns(): [React.RefObject<HTMLUListElement | null>, number] {
  const ref = useRef<HTMLUListElement>(null);
  const [columns, setColumns] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const width = node.clientWidth;
      setColumns(Math.max(1, Math.floor((width + GAP_PX) / (TILE_PX + GAP_PX))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, columns];
}

export interface GridQty {
  /** Etykieta pola dla czytnika i testów: „Ile sztuk: Latarka”. */
  label: (tile: GridTile) => string;
  value: (tile: GridTile) => string;
  placeholder?: (tile: GridTile) => string;
  onChange: (tile: GridTile, raw: string) => void;
  /** Wysyłka po Enter albo po wyjściu z pola (pole wymiany jest stanem serwera). */
  onCommit?: (tile: GridTile) => void;
  min?: number;
  /** Sufit pola; domyślnie stos kafla, `null` — bez sufitu (pole wymiany przycina serwer). */
  max?: (tile: GridTile) => number | null;
  /** Kiedy pokazać pole; domyślnie stos większy niż jedna sztuka. */
  show?: (tile: GridTile) => boolean;
}

export interface GridAction {
  /** Napis przycisku; liczba rzeczy dochodzi w nawiasie przy kilku. */
  label: string;
  title: string;
  run: (keys: string[]) => void;
  disabled?: boolean;
}

export function ItemGrid({
  tiles,
  selection,
  label,
  emptyText,
  hint,
  action,
  qty,
  drag,
  minRows = 2,
  showStrip = true,
}: {
  tiles: GridTile[];
  selection: GridSelection;
  /** Nazwa siatki dla czytnika: „Mój ekwipunek”, „Pole wymiany: Iskra”. */
  label: string;
  emptyText?: string;
  /** Podpowiedź na pasku, gdy nic nie jest zaznaczone. */
  hint?: string;
  /** Dwuklik, Enter i przycisk na pasku. */
  action?: GridAction;
  qty?: GridQty;
  /** Uchwyty przeciągania kafla (`useExchangeDrag`) — dostają niesione klucze. */
  drag?: (keys: string[]) => DragHandlers;
  minRows?: number;
  /** Pole drugiej strony nie ma paska — nic się w nim nie wybiera. */
  showStrip?: boolean;
}) {
  const [ref, columns] = useColumns();
  const byKey = useMemo(() => new Map(tiles.map((tile) => [tile.key, tile])), [tiles]);
  const focus = selection.focus ? byKey.get(selection.focus) : undefined;
  const count = selection.selected.length;

  const slots =
    columns > 0
      ? Math.max(minRows * columns, Math.ceil(tiles.length / columns) * columns)
      : tiles.length;
  const filler = Math.max(0, slots - tiles.length);

  function activate(key: string) {
    if (!action || action.disabled) return;
    const keys = selection.carry(key).filter((k) => !byKey.get(k)?.blocked);
    if (keys.length > 0) action.run(keys);
  }

  function onGridKey(event: ReactKeyboardEvent<HTMLUListElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      selection.selectAll();
    } else if (event.key === 'Escape' && count > 0) {
      event.stopPropagation();
      selection.clear();
    }
  }

  function onTileKey(event: ReactKeyboardEvent<HTMLLIElement>, tile: GridTile) {
    if (tile.blocked) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      activate(tile.key);
    } else if (event.key === ' ') {
      event.preventDefault();
      selection.toggle(tile.key);
    }
  }

  const showQty =
    qty !== undefined &&
    focus !== undefined &&
    count === 1 &&
    (qty.show ? qty.show(focus) : focus.stackable === true && (focus.qty ?? 0) > 1);
  const qtyMax = qty && focus ? (qty.max ? qty.max(focus) : (focus.qty ?? null)) : null;

  return (
    <div className="item-grid-wrap">
      <div className="item-grid-frame">
        <ul
          ref={ref}
          className="item-grid"
          role="listbox"
          aria-multiselectable
          aria-label={label}
          onKeyDown={onGridKey}
          onClick={(event) => {
            // Klik w pustą kratkę albo w tło siatki zdejmuje zaznaczenie.
            if (!(event.target as HTMLElement).closest('.item-tile')) selection.clear();
          }}
        >
          {tiles.map((tile) => {
            const selected = selection.isSelected(tile.key);
            const title = tile.blocked
              ? `${tile.name} — ${tile.blockedHint ?? 'niedostępne'}`
              : [
                  tile.name,
                  tile.equipped ? ITEM_EQUIPPED_LABELS[tile.equipped] : '',
                  tile.detail,
                  tile.price,
                  tile.kind,
                ]
                  .filter(Boolean)
                  .join(' — ');
            return (
              <li
                key={tile.key}
                className={`item-tile${selected ? ' item-tile--selected' : ''}${tile.equipped ? ' item-tile--equipped' : ''}${tile.blocked ? ' item-tile--blocked' : drag ? ' trade-draggable' : ''}`}
                role="option"
                aria-selected={selected}
                aria-disabled={tile.blocked || undefined}
                aria-label={tile.badge ? `${tile.name} ${tile.badge}` : tile.name}
                title={title}
                tabIndex={0}
                data-item-name={tile.name}
                {...(drag && !tile.blocked ? drag(selection.carry(tile.key)) : {})}
                onClick={(event) => {
                  if (!tile.blocked) selection.click(tile.key, event);
                }}
                onDoubleClick={() => {
                  selection.holdSelection();
                  activate(tile.key);
                }}
                onKeyDown={(event) => onTileKey(event, tile)}
              >
                <HudIcon name={tile.icon ?? 'swap-bag'} className="item-tile-glyph" />
                <span className="item-tile-name">{tile.name}</span>
                {tile.equipped && (
                  <span
                    className={`item-tile-equipped item-tile-equipped--${tile.equipped}`}
                    aria-label={ITEM_EQUIPPED_LABELS[tile.equipped]}
                    data-equipped={tile.equipped}
                  >
                    <HudIcon name={EQUIPPED_ICONS[tile.equipped]} />
                  </span>
                )}
                {tile.badge && <span className="item-tile-badge">{tile.badge}</span>}
                {tile.price && <span className="item-tile-price">{tile.price}</span>}
              </li>
            );
          })}
          {Array.from({ length: filler }, (_, index) => (
            <li key={`slot-${index}`} className="item-tile item-tile--slot" aria-hidden />
          ))}
        </ul>
        {tiles.length === 0 && emptyText && (
          <p className="inventory-empty item-grid-empty">{emptyText}</p>
        )}
      </div>
      {showStrip && tiles.length > 0 && (
        <div className="item-grid-strip">
          <span className="item-grid-strip-text">
            {count === 0 ? (
              <span className="item-grid-strip-hint">{hint}</span>
            ) : count === 1 && focus ? (
              <>
                <strong>{focus.name}</strong>
                {focus.equipped ? ` · ${ITEM_EQUIPPED_LABELS[focus.equipped]}` : ''}
                {focus.detail ? ` · ${focus.detail}` : ''}
                {focus.price ? ` · ${focus.price}` : ''}
              </>
            ) : (
              `Zaznaczone: ${countLabel(count)}`
            )}
          </span>
          {showQty && qty && focus && (
            <input
              type="number"
              className="inventory-row-qty"
              min={qty.min ?? 1}
              {...(qtyMax !== null ? { max: qtyMax } : {})}
              aria-label={qty.label(focus)}
              placeholder={qty.placeholder?.(focus)}
              value={qty.value(focus)}
              onChange={(event) => qty.onChange(focus, event.target.value)}
              onBlur={() => qty.onCommit?.(focus)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') qty.onCommit?.(focus);
              }}
            />
          )}
          {action && count > 0 && (
            <button
              type="button"
              className="small-button"
              disabled={action.disabled}
              title={action.title}
              onClick={() => action.run(selection.selected.filter((k) => !byKey.get(k)?.blocked))}
            >
              {count > 1 ? `${action.label} (${count})` : action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
