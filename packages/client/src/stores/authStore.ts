import { create } from 'zustand';
import type { AuthEndedReason, AuthState, CampaignSummary, SessionUser } from '@vtt/shared';
import { ROLE_ADMIN, ROLE_GM } from '@vtt/shared';
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
  loginGm: (login: string, password: string) => Promise<void>;
  /** Nowe konto MG (44a) — serwer od razu loguje. */
  registerGm: (login: string, password: string, repeat: string) => Promise<void>;
  /** Hasło z linku od właściciela (44a) — też od razu loguje. */
  resetPassword: (token: string, password: string, repeat: string) => Promise<void>;
  /** Wejście z imiennego linku (etap 44b) — imię jest na linku, nie w formularzu. */
  joinCampaign: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Nowy stan konta po zmianie hasła (etap 53) — zdjęte hasło tymczasowe
   * wpuszcza dalej bez ponownego logowania.
   */
  adoptUser: (user: SessionUser) => void;
  /** Serwer zakończył sesję tego gniazda (`auth:ended`) albo odbił ponowne połączenie. */
  sessionEnded: (reason: AuthEndedReason) => void;
}

function endedNoteFor(reason: AuthEndedReason, user: SessionUser | null): string {
  const again =
    user?.role === ROLE_GM || user?.role === ROLE_ADMIN
      ? 'zaloguj się ponownie.'
      : 'wejdź ponownie linkiem zaproszenia od MG.';
  switch (reason) {
    case 'logout':
      return `Wylogowano w innej karcie — ${again}`;
    case 'password':
      return 'Hasło tego konta zmieniono — zaloguj się nowym hasłem.';
    case 'blocked':
      return 'To konto zostało zablokowane przez administratora serwera.';
    case 'deleted':
      return 'To konto zostało usunięte przez administratora serwera.';
    default:
      return `Sesja wygasła — ${again}`;
  }
}

function signedIn(state: AuthState) {
  adoptSession(state);
  return {
    status: 'authenticated' as const,
    user: state.user,
    activeCampaign: state.activeCampaign,
    endedNote: null,
  };
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

  loginGm: async (login, password) => {
    set(signedIn(await apiPost<AuthState>('/api/auth/login', { login, password })));
  },

  registerGm: async (login, password, repeat) => {
    set(signedIn(await apiPost<AuthState>('/api/auth/register', { login, password, repeat })));
  },

  resetPassword: async (token, password, repeat) => {
    const url = `/api/auth/reset/${encodeURIComponent(token)}`;
    set(signedIn(await apiPost<AuthState>(url, { password, repeat })));
  },

  joinCampaign: async (token) => {
    set(signedIn(await apiPost<AuthState>(`/api/join/${encodeURIComponent(token)}`)));
  },

  logout: async () => {
    // Gniazdo najpierw: serwer rozłącza gniazda wylogowanej sesji z notką
    // „wylogowano w innej karcie" (#11), a ta karta wylogowała się sama.
    disconnectSocket();
    await apiPost('/api/auth/logout');
    leaveFullscreenOnLogout();
    set({ status: 'anonymous', user: null, activeCampaign: null, endedNote: null });
  },

  adoptUser: (user) => set((state) => (state.status === 'authenticated' ? { user } : state)),

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
