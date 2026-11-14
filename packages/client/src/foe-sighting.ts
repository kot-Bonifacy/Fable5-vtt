import { useEffect, useRef } from 'react';
import { ROLE_GM, type CombatNetSighting } from '@vtt/shared';
import type { PinnedNotice } from './components/NoticeColumn.js';
import { noteAck } from './notices.js';
import { combatErrorText, endCombat, nextCombatTurn } from './socket.js';
import { useAuthStore } from './stores/authStore.js';
import { useCombatStore } from './stores/combatStore.js';
import { useTokenStore } from './stores/tokenStore.js';

/**
 * Walka z zauważenia wroga po stronie MG (etap 56, zlecenie MG z 19.10).
 *
 * Serwer sam zakłada starcie „Przed walką”, gdy drużyna zobaczy wroga, i stawia
 * graczy w miejscu. MG dostaje nad mapą bursztynowe wezwanie z dwiema
 * odpowiedziami — „⚔ Rozpocznij walkę” (runda 1, NPC-om inicjatywa jak z pasa)
 * albo „Odwołaj” (skradanie, rozmowa: drużyna wraca do Eksploracji, a widoczni
 * wrogowie przechodzą na Neutralną, dopóki MG nie przełączy ich na Wroga). Dobór uczestników
 * zostaje w zakładce „Walka”, na którą prawy panel przeskakuje sam.
 */

/** „Vex widzi wroga: Bandzior” / „Vex i Kowal widzą wrogów: Bandzior, Zbir”. */
export function sightingText(spotters: readonly string[], foes: readonly string[]): string {
  const who =
    spotters.length === 0
      ? 'Drużyna'
      : spotters.length === 1
        ? spotters[0]!
        : `${spotters.slice(0, -1).join(', ')} i ${spotters[spotters.length - 1]}`;
  const sees = spotters.length > 1 ? 'widzą' : 'widzi';
  const whom = foes.length > 1 ? 'wrogów' : 'wroga';
  return `${who} ${sees} ${whom}: ${foes.join(', ')}. Drużyna stoi, dopóki nie zdecydujesz.`;
}

/**
 * „Kolec wykryty w Sieci: Sowa.” / „Kolec nie zatarł śladów w Sieci.” — starcie
 * założyła obrona Sieci (decyzja MG z 14.11), `spotters` to wykryci netrunnerzy.
 */
export function netSightingText(spotters: readonly string[], net: CombatNetSighting): string {
  const who = spotters.length === 0 ? 'Netrunner' : spotters.join(', ');
  const parts: string[] = [];
  if (net.foes.length > 0) parts.push(`${who} — wykrycie w Sieci: ${net.foes.join(', ')}.`);
  if (net.traces) {
    parts.push(
      net.foes.length > 0
        ? 'Maskowanie też nieudane.'
        : `${who} — Maskowanie nieudane, ślady zostały w Sieci.`,
    );
  }
  if (parts.length === 0) parts.push(`${who} — wykrycie w Sieci.`);
  return `${parts.join(' ')} Drużyna stoi, dopóki nie zdecydujesz.`;
}

/** Wezwanie nad mapą, dopóki starcie z zauważenia czeka w rundzie 0. */
export function useSightingNotice(): PinnedNotice | null {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const combat = useCombatStore((s) => s.combat);
  const tokens = useTokenStore((s) => s.tokens);
  if (!isGm || !combat || combat.round !== 0 || !combat.sighting) return null;
  const inFight = new Set(combat.combatants.map((row) => row.tokenId));
  const nameOf = (id: string) => tokens[id]?.name;
  const spotters = combat.sighting.spotterIds
    .map(nameOf)
    .filter((name): name is string => Boolean(name));
  // Wróg zdjęty przez MG ze starcia znika z wezwania.
  const foes = combat.sighting.foeIds
    .filter((id) => inFight.has(id))
    .map(nameOf)
    .filter((name): name is string => Boolean(name));
  const net = combat.sighting.net;
  const text =
    foes.length > 0
      ? sightingText(spotters, foes)
      : net
        ? netSightingText(spotters, net)
        : 'Drużyna stoi, dopóki nie zdecydujesz.';
  return {
    key: 'foe-sighting',
    tone: 'warn',
    title: foes.length === 0 && net ? 'Wykrycie w Sieci' : 'Wróg w zasięgu wzroku',
    text,
    actions: [
      {
        label: '⚔ Rozpocznij walkę',
        title: 'Runda 1 — inicjatywę NPC-om rzuca serwer, gracze rzucają kubkiem',
        run: () => void nextCombatTurn().then((ack) => noteAck('action', ack, combatErrorText)),
      },
      {
        label: 'Odwołaj',
        title:
          'Drużyna wraca do Eksploracji. Widoczni teraz wrogowie przechodzą na Neutralną — walkę zaczną znowu dopiero, gdy przełączysz ich na Wroga',
        run: () => void endCombat().then((ack) => noteAck('action', ack, combatErrorText)),
      },
    ],
  };
}

/**
 * Prawy panel MG przeskakuje na „Walka”, gdy serwer założy starcie z
 * zauważenia (raz na starcie — MG może potem wrócić do czatu).
 */
export function useSightingTabSwitch(isGm: boolean, open: () => void): void {
  const sightedCombatId = useCombatStore((s) =>
    isGm && s.combat?.round === 0 && s.combat.sighting ? s.combat.id : null,
  );
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!sightedCombatId || seen.current === sightedCombatId) return;
    seen.current = sightedCombatId;
    open();
  }, [sightedCombatId, open]);
}
