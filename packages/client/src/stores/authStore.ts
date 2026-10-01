import { create } from 'zustand';
import type { AuthEndedReason, AuthState, CampaignSummary, SessionUser } from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import { apiGet, apiPost } from '../api.js';
import { leaveFullscreenOnLogout } from '../fullscreen.js';
import { disconnectSocket } from '../socket.js';
import { useSettingsStore } from './settingsStore.js';

/**
 * Skórka kości (etap 27d) mieszka na serwerze, bo musi dojechać do cudzych
 * ekranów. Kopia w oknie ustawień bierze się stąd: przy każdym wejściu
 * przepisujemy ją z sesji, żeby nowa przeglądarka nie pokazywała domyślnego
 * Neonu komuś, kto od dawna rzuca Chromem.
 */
function adoptSession(state: AuthState): void {
  useSettingsStore.getState().applySkin(state.user.diceSkin);
}

type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

interface AuthStoreState {
  status: AuthStatus;
  user: SessionUser | null;
  activeCampaign: CampaignSummary | null;
  /**
   * Dlaczego wróciliśmy na ekran logowania bez kliknięcia „Wyloguj" (#11) —
   * pokazuje go strona logowania i zaproszenia; znika przy następnym wejściu.
   */
  endedNote: string | null;
  initialize: () => Promise<void>;
  loginGm: (password: string) => Promise<void>;
  joinCampaign: (token: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Serwer zakończył sesję tego gniazda (`auth:ended`) albo odbił ponowne połączenie. */
  sessionEnded: (reason: AuthEndedReason) => void;
}

function endedNoteFor(reason: AuthEndedReason, user: SessionUser | null): string {
  const again =
    user?.role === ROLE_GM ? 'zaloguj się ponownie.' : 'wejdź ponownie linkiem zaproszenia od MG.';
  return reason === 'logout' ? `Wylogowano w innej karcie — ${again}` : `Sesja wygasła — ${again}`;
}

export const useAuthStore = create<AuthStoreState>((set) => ({
  status: 'loading',
  user: null,
  activeCampaign: null,
  endedNote: null,

  initialize: async () => {
    try {
      const state = await apiGet<AuthState>('/api/auth/me');
      adoptSession(state);
      set({ status: 'authenticated', user: state.user, activeCampaign: state.activeCampaign });
    } catch {
      set({ status: 'anonymous', user: null, activeCampaign: null });
    }
  },

  loginGm: async (password) => {
    const state = await apiPost<AuthState>('/api/auth/login', { password });
    adoptSession(state);
    set({
      status: 'authenticated',
      user: state.user,
      activeCampaign: state.activeCampaign,
      endedNote: null,
    });
  },

  joinCampaign: async (token, name) => {
    const state = await apiPost<AuthState>(`/api/join/${encodeURIComponent(token)}`, { name });
    adoptSession(state);
    set({
      status: 'authenticated',
      user: state.user,
      activeCampaign: state.activeCampaign,
      endedNote: null,
    });
  },

  logout: async () => {
    // Gniazdo najpierw: serwer rozłącza gniazda wylogowanej sesji z notką
    // „wylogowano w innej karcie" (#11), a ta karta wylogowała się sama.
    disconnectSocket();
    await apiPost('/api/auth/logout');
    leaveFullscreenOnLogout();
    set({ status: 'anonymous', user: null, activeCampaign: null, endedNote: null });
  },

  sessionEnded: (reason) =>
    set((state) => {
      if (state.status !== 'authenticated') return state;
      disconnectSocket();
      leaveFullscreenOnLogout();
      return {
        status: 'anonymous',
        user: null,
        activeCampaign: null,
        endedNote: endedNoteFor(reason, state.user),
      };
    }),
}));
