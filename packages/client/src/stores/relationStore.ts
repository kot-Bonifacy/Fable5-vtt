import { create } from 'zustand';
import type { BotRelationView } from '@vtt/shared';

/**
 * Relacje NPC↔postacie u klienta (etap 19c).
 *
 * Klucz to para „bot + postać", bo taka jest też unikalność w bazie — jeden NPC
 * ma wobec jednej postaci dokładnie jedno nastawienie, a nie historię.
 */
interface RelationState {
  relations: Record<string, BotRelationView>;
  loaded: boolean;

  replaceAll: (relations: BotRelationView[]) => void;
  upsert: (relation: BotRelationView) => void;
  remove: (botId: string, characterId: string) => void;
}

export function relationKey(botId: string, characterId: string): string {
  return `${botId}:${characterId}`;
}

export const useRelationStore = create<RelationState>((set) => ({
  relations: {},
  loaded: false,

  replaceAll: (list) => {
    const byKey: Record<string, BotRelationView> = {};
    for (const relation of list)
      byKey[relationKey(relation.botId, relation.characterId)] = relation;
    set({ relations: byKey, loaded: true });
  },

  upsert: (relation) =>
    set((state) => ({
      relations: {
        ...state.relations,
        [relationKey(relation.botId, relation.characterId)]: relation,
      },
    })),

  remove: (botId, characterId) =>
    set((state) => {
      const relations = { ...state.relations };
      delete relations[relationKey(botId, characterId)];
      return { relations };
    }),
}));
