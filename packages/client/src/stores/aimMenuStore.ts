import { create } from 'zustand';
import type { CpredAimPoint } from '@vtt/shared';
import type { AttackIntent } from '../attack-targeting.js';

/**
 * Celowanie przy kursorze (naprawa 31.08).
 *
 * Reguła Celowania (s. 170) miała od etapu 16 cały silnik i jedną kontrolkę:
 * guziki na banerze nad mapą, które pojawiały się **wyłącznie** wtedy, gdy broń
 * uzbrojono „Atakiem" z karty. Figura wybrana na mapie i uzbrojona kaflem paska
 * strzelała bez możliwości Celowania — pułapka „mechanika bywa gotowa
 * i nieosiągalna z UI" w czystej postaci.
 *
 * Wybór stoi teraz tam, gdzie stoi kursor w chwili wskazania celu, i wychodzi
 * z **jednego** miejsca w kodzie (`loadAttackFor`), przez które przechodzą
 * wszystkie drogi ataku: kafel paska, „Atak" z karty, menu żetonu i karta
 * odmowy z osłoną. Drugiej drogi, która by o Celowaniu nie wiedziała, nie da
 * się już dopisać bez ominięcia ładowania kubka.
 *
 * Punkt Celowania nie jest lepki: to cecha **tego strzału**, nie broni, więc
 * nie mieszka przy uzbrojonej broni, tylko w zamiarze (`AttackIntent`), który
 * właśnie wylądował w kubku. Wybór przeładowuje kubek tym samym zamiarem
 * z dopisanym `aimedAt` — nic nie zostało jeszcze rzucone ani zapłacone.
 */

export interface AimOffer {
  /** Zamiar, którym załadowano kubek — wybór dokłada do niego `aimedAt`. */
  intent: AttackIntent;
  targetTokenId: string;
  /** Punkt już wybrany dla tego strzału; brak znaczy zwykły strzał w korpus. */
  aimedAt?: CpredAimPoint;
  /** Współrzędne klienta: okno staje przy kursorze, nie przy mapie. */
  x: number;
  y: number;
}

interface AimMenuState {
  offer: AimOffer | null;
  /**
   * Gdzie stał kursor przy ostatnim wskazaniu celu.
   *
   * Ładowanie kubka nie wie nic o ekranie — wie o nim klik w mapę i menu
   * żetonu, więc to one zostawiają tu adres, pod którym ma stanąć okno.
   * Bez adresu okno się nie pokazuje: strzał wywołany z czatu (karta „strzelaj
   * mimo tarczy") nie ma kursora, przy którym miałoby wyskoczyć.
   */
  at: { x: number; y: number } | null;

  placeAt: (x: number, y: number) => void;
  open: (offer: Omit<AimOffer, 'x' | 'y'>) => void;
  close: () => void;
}

export const useAimMenuStore = create<AimMenuState>((set, get) => ({
  offer: null,
  at: null,

  placeAt: (x, y) => set({ at: { x, y } }),
  open: (offer) => {
    const at = get().at;
    if (!at) return;
    set({ offer: { ...offer, x: at.x, y: at.y } });
  },
  close: () => set({ offer: null }),
}));
