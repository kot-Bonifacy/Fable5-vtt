import type { CpredCharacterData, CpredRegistry } from './character.js';
import { cpredInterfaceRank } from './netrun.js';
import {
  CPRED_COMBAT_AWARENESS_ABILITY,
  CPRED_FABRICATION_ABILITY,
  CPRED_FABRICATION_RULES,
  CPRED_MEDICINE_ABILITY,
  CPRED_MEDICINE_RULES,
  CPRED_MOTO_ABILITY,
  CPRED_TEAMWORK_ABILITY,
  CPRED_TEAM_MAX,
  cpredCombatAwarenessSpent,
  cpredRoleAbilityRank,
  cpredSpecialtyPool,
  cpredSpecialtySpent,
  cpredTeamSlots,
} from './roleability.js';

/**
 * Co zostaje do zrobienia po kreatorze (naprawa 3c).
 *
 * Kreator ustawia rangę Zdolności Specjalnej na 4 i na tym kończy: punktów
 * Zmysłu Walki nie rozdziela, zespołu Korpo nie obsadza, Taboru Nomady nie
 * wybiera, a Netrunner wychodzi bez cyberdeku. Do 3c nie mówił o tym nic — MG
 * zgłosił, że „Rola na randze 4" wygląda na skończoną konfigurację (A10
 * w audycie), a nią nie jest.
 *
 * Lista **liczy się z samej karty** (decyzja MG z 17.09): rozdzielone punkty
 * zdejmują wiersz same, więc nie ma tu żadnego stanu do odhaczania, nic się nie
 * rozjeżdża z kartą i ta sama funkcja odpowiada kreatorowi, karcie i MG.
 */
export type CpredRoleChoreId =
  'combatAwareness' | 'medicine' | 'fabrication' | 'team' | 'fleet' | 'nomadHousing' | 'cyberdeck';

/** Zakładka karty postaci, na której tę czynność się wykonuje. */
export type CpredRoleChoreTab = 'stats' | 'gear';

export interface CpredRoleChore {
  id: CpredRoleChoreId;
  /** Nagłówek wiersza — nazwa Zdolności albo rzeczy, w mianowniku. */
  title: string;
  /** Co zostało do zrobienia, jednym zdaniem. */
  text: string;
  /** Zakładka karty, którą trzeba otworzyć. */
  tab: CpredRoleChoreTab;
  /** Panel karty (`data-sheet-panel`), do którego prowadzi „Przejdź". */
  panel: string;
  /** Strona podręcznika. */
  page: number;
  /**
   * Ile rzeczy zostało (punktów, wpisów, miejsc w zespole) — 0, gdy czynność
   * jest wyborem, a nie pulą do wydania.
   */
  left: number;
}

/**
 * „Został 1 punkt", „Zostały 2 punkty", „Zostało 5 punktów”.
 *
 * Czasownik odmienia się razem z liczebnikiem, więc obie części muszą wyjść
 * z jednego miejsca — pierwsza wersja składała stałe „Zostało" z odmienianym
 * rzeczownikiem i pisała „Zostało 4 wpisy" (wyszło przy oględzinach).
 */
function leftPhrase(count: number, one: string, few: string, many: string): string {
  const last = count % 10;
  const teen = count % 100;
  if (count === 1) return `Został ${one}`;
  if (last >= 2 && last <= 4 && (teen < 12 || teen > 14)) return `Zostały ${count} ${few}`;
  return `Zostało ${count} ${many}`;
}

/** Ta sama odmiana dla najczęstszego rzeczownika tej listy. */
function pointsLeft(count: number): string {
  return leftPhrase(count, '1 punkt', 'punkty', 'punktów');
}

/**
 * Czynności wynikające z Roli, których kreator nie wykonuje.
 *
 * Kolejność jest kolejnością czytania karty: najpierw to, co stoi na stronie
 * pierwszej (pas „Zdolność Specjalna"), potem Ekwipunek. Pusta lista znaczy, że
 * postać niczego nie musi — i tak jest u sześciu z dziesięciu Ról.
 */
export function cpredRoleChores(
  data: CpredCharacterData,
  registry: CpredRegistry,
): CpredRoleChore[] {
  const chores: CpredRoleChore[] = [];

  const solo = cpredRoleAbilityRank(data, registry, CPRED_COMBAT_AWARENESS_ABILITY);
  if (solo !== null) {
    const left = solo - cpredCombatAwarenessSpent(data.combatAwareness);
    if (left > 0) {
      chores.push({
        id: 'combatAwareness',
        title: 'Zmysł Walki',
        text: `${pointsLeft(left)} do rozdzielenia między Precyzyjny atak, Uniki, Inicjatywę i pozostałe zdolności Solo.`,
        tab: 'stats',
        panel: 'combat-awareness',
        page: 146,
        left,
      });
    }
  }

  const medic = cpredRoleAbilityRank(data, registry, CPRED_MEDICINE_ABILITY);
  if (medic !== null) {
    const left =
      cpredSpecialtyPool(CPRED_MEDICINE_RULES, medic) - cpredSpecialtySpent(data.medicine);
    if (left > 0) {
      chores.push({
        id: 'medicine',
        title: 'Medycyna',
        text: `${pointsLeft(left)} na Chirurgię, Farmaceutyki albo Obsługę kriosystemów. Bez Chirurgii Medyk nie leczy najcięższych Ran Krytycznych ani nie wszczepia chromu.`,
        tab: 'stats',
        panel: 'medicine',
        page: 149,
        left,
      });
    }
  }

  const techie = cpredRoleAbilityRank(data, registry, CPRED_FABRICATION_ABILITY);
  if (techie !== null) {
    const left =
      cpredSpecialtyPool(CPRED_FABRICATION_RULES, techie) - cpredSpecialtySpent(data.fabrication);
    if (left > 0) {
      chores.push({
        id: 'fabrication',
        title: 'Twórca',
        text: `${pointsLeft(left)} na Naprawę, Ulepszanie, Wytwarzanie albo Wynalazczość — po dwa punkty za poziom, w dwie różne Specjalizacje.`,
        tab: 'stats',
        panel: 'fabrication',
        page: 147,
        left,
      });
    }
  }

  const korpo = cpredRoleAbilityRank(data, registry, CPRED_TEAMWORK_ABILITY);
  if (korpo !== null) {
    const left = Math.min(cpredTeamSlots(korpo), CPRED_TEAM_MAX) - data.team.length;
    if (left > 0) {
      chores.push({
        id: 'team',
        title: 'Zespół',
        text: `${leftPhrase(left, '1 miejsce', 'miejsca', 'miejsc')} w zespole do obsadzenia. Wybierz profesję — członek zespołu to pełna karta postaci, nie zdanie w opisie.`,
        tab: 'stats',
        panel: 'team',
        page: 154,
        left,
      });
    }
  }

  const nomad = cpredRoleAbilityRank(data, registry, CPRED_MOTO_ABILITY);
  if (nomad !== null) {
    const left = nomad - data.fleet.length;
    if (left > 0) {
      chores.push({
        id: 'fleet',
        title: 'Tabor Rodziny',
        text: `${leftPhrase(left, '1 wpis', 'wpisy', 'wpisów')} do wybrania: każdy poziom Moto to albo standardowy pojazd z tabeli, albo ulepszenie pojazdu, który już masz.`,
        tab: 'stats',
        panel: 'fleet',
        page: 162,
        left,
      });
    }
    // Kreator daje każdej postaci kontener za 1000 ed miesięcznie (s. 105),
    // a Nomada mieszka zwykle w swoim pojeździe. To wybór, nie brak, więc
    // wiersz stoi na liście także wtedy, gdy Tabor jest już wypełniony.
    if (data.lifestyle && data.lifestyle.housing !== 'streetVehicle') {
      chores.push({
        id: 'nomadHousing',
        title: 'Zakwaterowanie',
        text: 'Kreator wpisał kontener za 1000 ed miesięcznie. Nomada z zabudowanym pojazdem w Taborze mieszka w nim bez czynszu („Życie na Ulicy w pojeździe") — zmień Zakwaterowanie, jeśli tak grasz tę postać.',
        tab: 'gear',
        panel: 'lifestyle',
        page: 165,
        left: 0,
      });
    }
  }

  const netrunner = cpredInterfaceRank(data, registry);
  if (netrunner !== null && data.cyberdeck === null) {
    chores.push({
      id: 'cyberdeck',
      title: 'Cyberdek',
      text: 'Netrunner bez deku nie wejdzie do Sieci. Dek kupiony w kreatorze leży w Wyposażeniu jako zwykły wiersz — wskaż go w sekcji „Cyberdek" i włóż Programy (w VTT za Programy się nie płaci).',
      tab: 'gear',
      panel: 'cyberdeck',
      page: 199,
      left: 0,
    });
  }

  return chores;
}
