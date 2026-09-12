import { create } from 'zustand';
import type { CpredCharacterData, CpredRegistry, CpredRollRequest } from '@vtt/shared';
import { planCpredRoll } from '@vtt/shared';
import { useRollStore, type RollTarget } from './rollStore.js';

/**
 * Dwa okna jednej rozmowy o Teście: prośba gracza (etap 40) i wezwanie MG
 * (etap 32).
 *
 * Oba siedzą w store, a nie w stanie panelu, bo oba mają **więcej niż jedno
 * wejście**. Prośbę otwiera Alt+klik w wiersz karty i przycisk „Poproś MG"
 * w oknie rzutu; wezwanie — przycisk ⚄ w panelu „Postacie" i „Ustaw…" na
 * karcie prośby na czacie. Trzymanie stanu przy którymkolwiek z tych miejsc
 * znaczyłoby, że okno da się otworzyć tylko wtedy, gdy ten panel akurat stoi.
 */

/** Czym gracz chce rzucić — Umiejętność albo Cecha, wzięta z wiersza karty. */
export interface CheckRequestDraft {
  characterId: string;
  characterName: string;
  request: CpredRollRequest;
  /** „Odczytywanie emocji (EMP)" — podgląd, serwer i tak złoży własny napis. */
  label: string;
}

/** Postać, dla której MG układa wezwanie, i ewentualna prośba, którą ono zamknie. */
export interface CheckCallDraft {
  characterId: string;
  characterName: string;
  /** Prośba z czatu, którą wysłanie wezwania rozstrzygnie zgodą (etap 40). */
  requestMessageId?: number;
  /** Umiejętność albo Cecha, o którą prosił gracz — wstępnie wybrana w oknie. */
  request?: CpredRollRequest;
  /** Zdanie „po co" od gracza, wstawione w pole opisu wydarzenia. */
  prompt?: string;
}

interface CheckStoreState {
  requestDraft: CheckRequestDraft | null;
  callDraft: CheckCallDraft | null;
  openRequest: (draft: CheckRequestDraft) => void;
  closeRequest: () => void;
  openCall: (draft: CheckCallDraft) => void;
  closeCall: () => void;
}

export const useCheckStore = create<CheckStoreState>((set) => ({
  requestDraft: null,
  callDraft: null,
  // Okna wykluczają się nawzajem: „Ustaw…" na karcie prośby otwiera wezwanie
  // i nie ma powodu, żeby pod nim stało jeszcze okno prośby.
  openRequest: (requestDraft) => set({ requestDraft, callDraft: null }),
  closeRequest: () => set({ requestDraft: null }),
  openCall: (callDraft) => set({ callDraft, requestDraft: null }),
  closeCall: () => set({ callDraft: null }),
}));

/**
 * Droga Alt+kliku z wiersza karty (etap 40): ten sam `RollTarget`, którym
 * chodzi zwykły rzut, zamieniony w prośbę.
 *
 * Etykietę składa **ten sam planer**, który złoży ją na serwerze — okno prośby
 * ma pokazywać dokładnie to, o co gracz prosi („Odczytywanie emocji (EMP)"),
 * a nie samą nazwę Umiejętności bez Cechy. Rzut, którego nie da się zaplanować,
 * nie otwiera okna: nie ma o co prosić.
 *
 * **Prośba zamyka okno rzutu**, bo jedno wyklucza drugie: kto pyta MG o zgodę,
 * ten w tej samej chwili nie bierze kubka. Bez tego okno rzutu zostawało pod
 * oknem prośby i po jej wysłaniu wracało na wierzch z guzikiem „Weź kubek" —
 * gracz stał przed przyciskiem znaczącym „rzuć bez zgody" i nie wiedział, czy
 * to jest właśnie ta zgoda (znalezione przez MG 06.09).
 */
export function askForCheck(
  target: RollTarget,
  data: CpredCharacterData,
  registry: CpredRegistry,
): void {
  // Prośba obejmuje Umiejętność i Cechę — dokładnie tyle, ile wezwanie z 32.
  // Atak, obrażenia i Unik mają własne zdarzenia i własne drogi.
  if (target.kind !== 'skill' && target.kind !== 'stat') return;
  const request: CpredRollRequest = {
    kind: target.kind,
    ...(target.skillId ? { skillId: target.skillId } : {}),
    ...(target.statId ? { statId: target.statId } : {}),
  };
  const planned = planCpredRoll(data, registry, request);
  if (!planned.ok) return;
  useRollStore.getState().closeDialog();
  useCheckStore.getState().openRequest({
    characterId: target.characterId,
    characterName: target.characterName,
    request,
    label: planned.plan.title,
  });
}
