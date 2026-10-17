import { useEffect, useState } from 'react';
import type { SnapshotListView } from '@vtt/shared';
import { adminErrorText, formatArchiveBytes, snapshotDateOf } from '@vtt/shared';
import { ApiError, apiGet, apiPost } from '../../api.js';
import { plural } from '../../plural.js';
import { EmptyState } from '../EmptyState.js';

/**
 * Kopie zapasowe całej bazy (etap 33) — od etapu 53 w panelu administratora,
 * bo niosą kampanie wszystkich MG (do 53: zakładka „Kopie” w Panelu MG
 * właściciela, zdarzenia gniazda `archive:list` / `archive:snapshot`).
 * Przywrócenia świadomie tu nie ma — kasuje bieżący stan, więc robi się je
 * skryptem przy zatrzymanym serwerze.
 */

/** „5 września, 14:30" — z nazwy katalogu, nie z czasu pliku. */
function snapshotWhen(name: string, takenAt: string | null): string {
  const date = snapshotDateOf(name) ?? (takenAt ? new Date(takenAt) : null);
  if (!date) return 'nazwa spoza schematu';
  return date.toLocaleString('pl-PL', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AdminBackups() {
  const [view, setView] = useState<SnapshotListView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<SnapshotListView>('/api/admin/backups')
      .then(setView)
      .catch(() => setError('Nie udało się odczytać katalogu kopii.'));
  }, []);

  async function snapshotNow() {
    setBusy(true);
    setError(null);
    try {
      setView(await apiPost<SnapshotListView>('/api/admin/backups'));
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.code : '';
      setError(adminErrorText(code) ?? 'Nie udało się zrobić kopii.');
    } finally {
      setBusy(false);
    }
  }

  const enabled = view !== null && view.directory !== '';

  return (
    <section className="panel-card archive-section">
      <header className="panel-card-header">
        <h2>Kopie zapasowe całej bazy</h2>
      </header>
      <div className="ai-status">
        <div className="ai-status-main">
          <span className={`badge ${enabled ? 'badge--ok' : 'badge--off'}`}>
            {enabled
              ? view.intervalMinutes > 0
                ? `kopia co ${view.intervalMinutes} min`
                : 'tylko ręcznie'
              : 'kopie wyłączone'}
          </span>
          {enabled && (
            <span className="ai-status-text">
              zostaje {view.rules.keepHourly} ostatnich i {view.rules.keepDaily} dób wstecz
            </span>
          )}
          <button
            type="button"
            className="small-button"
            onClick={() => void snapshotNow()}
            disabled={busy || !enabled}
            title="Robi kopię teraz i od razu przycina katalog do ustawionej rotacji"
          >
            {busy ? 'Robię kopię…' : 'Zrób kopię teraz'}
          </button>
        </div>
        {enabled && <p className="archive-path">{view.directory}</p>}
        {error && <p className="ai-status-error">{error}</p>}
      </div>

      {view && view.snapshots.length > 0 ? (
        <ul className="archive-list">
          {view.snapshots.map((entry) => (
            <li key={entry.name} className="archive-row">
              <span className="archive-row-name">{entry.name}</span>
              <span className="archive-row-meta">
                {snapshotWhen(entry.name, entry.takenAt)} · {formatArchiveBytes(entry.dbBytes)} ·{' '}
                {plural(entry.files, 'plik', 'pliki', 'plików')}
              </span>
              {!entry.rotated && (
                <span className="archive-flag" title="Nazwa spoza schematu — rotacja jej nie ruszy">
                  🔒 zachowana
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        enabled && (
          <EmptyState text="Nie ma jeszcze żadnej kopii — pierwsza powstanie przy starcie serwera." />
        )
      )}

      <p className="archive-hint">
        Przywrócenie kopii kasuje bieżący stan, więc nie ma go w tym panelu. Zatrzymaj serwer i
        uruchom: <code>pnpm --filter @vtt/server restore -- nazwa-kopii</code>. Skrypt zrobi
        najpierw kopię stanu sprzed przywrócenia.
      </p>
    </section>
  );
}
