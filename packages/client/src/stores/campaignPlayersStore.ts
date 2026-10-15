import { create } from 'zustand';
import type { CampaignDetail } from '@vtt/shared';
import { apiGet } from '../api.js';

export interface CampaignPlayer {
  id: string;
  name: string;
}

/**
 * Gracze otwartej kampanii MG (członkowie, także nieobecni) — z REST, bo
 * `presence` zna tylko tych, którzy są online. Czyta je wybór właściciela
 * w „Postaciach” i przypomnienie o gotowości stołu (15.10).
 */
interface CampaignPlayersState {
  players: CampaignPlayer[];
  load: () => Promise<void>;
}

export const useCampaignPlayersStore = create<CampaignPlayersState>((set) => ({
  players: [],
  load: () =>
    apiGet<CampaignDetail[]>('/api/campaigns')
      .then((campaigns) => {
        const open = campaigns.find((campaign) => campaign.open);
        set({ players: open?.players.map((p) => ({ id: p.id, name: p.name })) ?? [] });
      })
      .catch(() => set({ players: [] })),
}));
