import { create } from 'zustand';
import type { RandomTableView } from '@vtt/shared';

/**
 * Tabele losowe u klienta (etap 34).
 *
 * Store istnieje wyłącznie u MG — serwer emituje `table:*` do `gmRoom`, a
 * `table:list` jest zdarzeniem z rolą MG, więc u gracza ta lista nigdy się nie
 * zapełnia i nie ma tu czego filtrować. Listę przynosi dopiero wejście
 * w zakładkę, nie `state:sync`: tabel bywa kilkadziesiąt, a otwiera się je raz
 * na sesję (ta sama decyzja, co przy bazie wiedzy z 19b).
 */
interface TableState {
  tables: Record<string, RandomTableView>;
  /** Kolejność wyświetlania, po nazwie; przeliczana przy każdej zmianie. */
  order: string[];
  /** Tabela otwarta w edytorze; `new` = nowa, null = edytor zamknięty. */
  editing: string | 'new' | null;
  loaded: boolean;

  replaceAll: (tables: RandomTableView[]) => void;
  upsert: (table: RandomTableView) => void;
  remove: (id: string) => void;
  setEditing: (editing: string | 'new' | null) => void;
}

const collator = new Intl.Collator('pl');

function sortIds(tables: Record<string, RandomTableView>): string[] {
  return Object.values(tables)
    .sort((a, b) => collator.compare(a.name, b.name))
    .map((table) => table.id);
}

export const useTableStore = create<TableState>((set) => ({
  tables: {},
  order: [],
  editing: null,
  loaded: false,

  replaceAll: (tables) => {
    const byId: Record<string, RandomTableView> = {};
    for (const table of tables) byId[table.id] = table;
    set({ tables: byId, order: sortIds(byId), loaded: true });
  },

  upsert: (table) =>
    set((state) => {
      const tables = { ...state.tables, [table.id]: table };
      return { tables, order: sortIds(tables) };
    }),

  remove: (id) =>
    set((state) => {
      const tables = { ...state.tables };
      delete tables[id];
      return {
        tables,
        order: sortIds(tables),
        editing: state.editing === id ? null : state.editing,
      };
    }),

  setEditing: (editing) => set({ editing }),
}));
