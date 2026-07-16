import { create } from 'zustand';
import type { AuthState, CampaignSummary, SessionUser } from '@vtt/shared';
import { apiGet, apiPost } from '../api.js';
import { disconnectSocket } from '../socket.js';

type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

interface AuthStoreState {
  status: AuthStatus;
  user: SessionUser | null;
  activeCampaign: CampaignSummary | null;
  initialize: () => Promise<void>;
  loginGm: (password: string) => Promise<void>;
  joinCampaign: (token: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthStoreState>((set) => ({
  status: 'loading',
  user: null,
  activeCampaign: null,

  initialize: async () => {
    try {
      const state = await apiGet<AuthState>('/api/auth/me');
      set({ status: 'authenticated', user: state.user, activeCampaign: state.activeCampaign });
    } catch {
      set({ status: 'anonymous', user: null, activeCampaign: null });
    }
  },

  loginGm: async (password) => {
    const state = await apiPost<AuthState>('/api/auth/login', { password });
    set({ status: 'authenticated', user: state.user, activeCampaign: state.activeCampaign });
  },

  joinCampaign: async (token, name) => {
    const state = await apiPost<AuthState>(`/api/join/${encodeURIComponent(token)}`, { name });
    set({ status: 'authenticated', user: state.user, activeCampaign: state.activeCampaign });
  },

  logout: async () => {
    await apiPost('/api/auth/logout');
    disconnectSocket();
    set({ status: 'anonymous', user: null, activeCampaign: null });
  },
}));
