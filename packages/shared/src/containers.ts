/**
 * Pojemniki na scenie (etap 46b, wzór: *Container* i *Item Pile* z Item Piles).
 *
 * Rdzeń VTT, nie CP RED. Pojemnik to **figura z kartą** (decyzja MG 13
 * z 08.10.2026): skrzynia, bagażnik, schowek albo „Stos” z upuszczenia
 * przedmiotu na mapę. Dzięki karcie łup, przenoszenie, limit 40 wierszy, mgła
 * i ukrycie przez MG działają na nim bez nowej gałęzi. Tu mieszka tylko to, co
 * rdzeń mówi o pojemniku: stan zamka, rodzaj i to, co z tego widzi stół. Jakim
 * Testem otwiera się zamek, wie system (`systems/cpred/container.ts`).
 */

/** Stan pojemnika: otwarty, zamknięty (jedno kliknięcie), na zamek (Test albo klucz). */
export type ContainerLock = 'open' | 'closed' | 'locked';

export const CONTAINER_LOCKS: readonly ContainerLock[] = ['open', 'closed', 'locked'];

export const CONTAINER_LOCK_LABELS: Record<ContainerLock, string> = {
  open: 'Otwarty',
  closed: 'Zamknięty',
  locked: 'Zamknięty na zamek',
};

export function isContainerLock(value: unknown): value is ContainerLock {
  return (CONTAINER_LOCKS as readonly unknown[]).includes(value);
}

/** Rodzaje, które MG stawia narzędziem w pasku mapy. Stos powstaje sam. */
export type ContainerPreset = 'chest' | 'trunk' | 'stash';

export const CONTAINER_PRESETS: readonly ContainerPreset[] = ['chest', 'trunk', 'stash'];

export function isContainerPreset(value: unknown): value is ContainerPreset {
  return (CONTAINER_PRESETS as readonly unknown[]).includes(value);
}

/** Domyślna nazwa i żeton rodzaju — MG zmienia jedno i drugie jak przy każdej figurze. */
export const CONTAINER_PRESET_LOOKS: Record<
  ContainerPreset | 'pile',
  { name: string; imageUrl: string }
> = {
  chest: { name: 'Skrzynia', imageUrl: '/public/tokens/containers/chest.svg' },
  trunk: { name: 'Bagażnik', imageUrl: '/public/tokens/containers/trunk.svg' },
  stash: { name: 'Schowek', imageUrl: '/public/tokens/containers/stash.svg' },
  pile: { name: 'Stos', imageUrl: '/public/tokens/containers/pile.svg' },
};

/**
 * Co o pojemniku wie cały stół — jedzie na `TokenView.container`.
 *
 * Nazwa i stan zamku są jawne (gracz widzi skrzynię i to, że jest zamknięta),
 * zawartość nie: nieotwarty pojemnik nie wysyła graczowi ani jednej nazwy
 * przedmiotu (decyzja MG 14).
 */
export interface TokenContainerView {
  lock: ContainerLock;
  /** Stos z upuszczenia — znika razem z kartą, gdy jest pusty. */
  pile: boolean;
}

/** Ile jednocześnie może wisieć stosów na jednej scenie — zabezpieczenie, nie reguła gry. */
export const CONTAINER_PILES_PER_SCENE_MAX = 60;
