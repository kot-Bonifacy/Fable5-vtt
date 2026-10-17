import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type {
  AdminSessionsView,
  AdminSettingsView,
  AiStatus,
  AiStatusBroadcast,
  AuthEndedPush,
  GmAccountView,
  OwnerAiState,
} from '@vtt/shared';
import { apiGet, apiPost } from '../api.js';
import { useAuthStore } from '../stores/authStore.js';
import { freshAiRequests, useOwnerAiStore } from '../stores/ownerAiStore.js';
import { notifyGame } from '../game-notifications.js';
import { OwnerAiPanel } from '../components/OwnerAi.js';
import { PasswordChange } from '../components/PasswordChange.js';
import { AdminAccounts } from '../components/admin/AdminAccounts.js';
import { AdminSessions } from '../components/admin/AdminSessions.js';
import { AdminBackups } from '../components/admin/AdminBackups.js';

/**
 * Panel administratora (etap 53). Konto `ADMIN` nie siada przy stole: zamiast
 * mapy ma sesje i ich dziennik, konta MG, AI właściciela i ustawienia serwera.
 *
 * Gniazdo jest tu własne i małe, nie stołowe `socket.ts`: serwer nie sadza
 * administratora przy żadnej kampanii, a gniazdo służy dwóm rzeczom — jest
 * obecnością właściciela dla „Udostępniam AI” (44d) i niesie sygnały
 * `admin:changed` / `ai-access:owner`, po których panel dociąga swoje trasy.
 */

/** Co ile panel odświeża się sam — gracz przy stole nie wysyła sygnału, gdy wychodzi. */
const REFRESH_MS = 30_000;

function useAdminSocket(onChanged: () => void): AiStatus | null {
  const [status, setStatus] = useState<AiStatus | null>(null);
  useEffect(() => {
    const socket = io();
    socket.on('admin:changed', onChanged);
    socket.on('ai:status', (push: AiStatusBroadcast) => setStatus(push.status));
    socket.on('ai-access:owner', (state: OwnerAiState) => {
      const store = useOwnerAiStore.getState();
      const fresh = freshAiRequests(store.state, state);
      store.setState(state);
      if (fresh.length > 0) {
        notifyGame('request');
        onChanged();
      }
    });
    socket.on('auth:ended', (push: AuthEndedPush) =>
      useAuthStore.getState().sessionEnded(push.reason),
    );
    socket.on('connect_error', (error: Error) => {
      if (error.message === 'UNAUTHORIZED') useAuthStore.getState().sessionEnded('expired');
    });
    socket.on('connect', onChanged);
    return () => {
      socket.disconnect();
    };
  }, [onChanged]);
  return status;
}

function gatewayText(status: AiStatus | null): string {
  if (!status) return 'sprawdzam…';
  if (!status.available) return status.error ? `niedostępny — ${status.error}` : 'niedostępny';
  return status.model ? `działa · ${status.model}` : 'działa';
}

function ServerSettings() {
  const [settings, setSettings] = useState<AdminSettingsView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<AdminSettingsView>('/api/admin/settings')
      .then(setSettings)
      .catch(() => setError('Nie udało się odczytać ustawień.'));
  }, []);

  async function setRegistration(registration: boolean) {
    setError(null);
    // Od razu w oknie — jak „Udostępniam AI”; przy błędzie wraca do poprzedniego.
    const previous = settings;
    setSettings({ registration });
    try {
      setSettings(await apiPost<AdminSettingsView>('/api/admin/settings', { registration }));
    } catch {
      setSettings(previous);
      setError('Nie udało się zapisać ustawienia.');
    }
  }

  return (
    <section className="panel-card">
      <header className="panel-card-header">
        <h2>Serwer</h2>
      </header>
      <label
        className="settings-row"
        title="Odnośnik „Załóż konto MG” na ekranie logowania. Wyłączony — nowe konto MG nie powstanie, istniejące logują się dalej. Ustawienie z panelu wygrywa z VTT_REGISTRATION w .env."
      >
        <input
          type="checkbox"
          checked={settings?.registration ?? false}
          disabled={settings === null}
          onChange={(event) => void setRegistration(event.target.checked)}
        />
        <span className="settings-label">Rejestracja nowych kont MG otwarta</span>
      </label>
      {error && <p className="auth-error">{error}</p>}
    </section>
  );
}

export function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [accounts, setAccounts] = useState<GmAccountView[] | null>(null);
  const [sessions, setSessions] = useState<AdminSessionsView | null>(null);

  const refresh = useCallback(() => {
    void apiGet<GmAccountView[]>('/api/admin/accounts')
      .then(setAccounts)
      .catch(() => undefined);
    void apiGet<AdminSessionsView>('/api/admin/sessions')
      .then(setSessions)
      .catch(() => undefined);
    void useOwnerAiStore.getState().load();
  }, []);

  const aiStatus = useAdminSocket(refresh);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <div className="gm-panel admin-panel">
      <header className="gm-panel-header">
        <h1>Panel administratora</h1>
        <span className="admin-panel-account">
          <span className="invite-expiry">{user?.login ?? user?.name}</span>
          <button type="button" className="top-bar-link" onClick={() => void logout()}>
            Wyloguj
          </button>
        </span>
      </header>

      <AdminSessions view={sessions} onChanged={refresh} />
      <AdminAccounts accounts={accounts} onChanged={refresh} />

      <section className="panel-card">
        <header className="panel-card-header">
          <h2>AI właściciela</h2>
          <span
            className={`badge ${aiStatus?.available ? 'badge--ok' : 'badge--off'}`}
            title="AI Gateway na PC właściciela"
          >
            gateway: {gatewayText(aiStatus)}
          </span>
        </header>
        <OwnerAiPanel />
      </section>

      <ServerSettings />
      <AdminBackups />

      <section className="panel-card">
        <header className="panel-card-header">
          <h2>Twoje konto</h2>
        </header>
        <PasswordChange />
      </section>
    </div>
  );
}
