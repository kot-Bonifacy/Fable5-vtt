import { useEffect, useRef, useState } from 'react';
import type {
  ArchiveImportResult,
  ArchiveKind,
  CampaignDetail,
  SnapshotListView,
} from '@vtt/shared';
import {
  ARCHIVE_DOWNLOAD_PATHS,
  ARCHIVE_REFUSAL_MESSAGES,
  archiveRefusalText,
  formatArchiveBytes,
  snapshotDateOf,
} from '@vtt/shared';
import { apiGet } from '../api.js';
import {
  downloadArchive,
  fetchSnapshots,
  importCharacterFile,
  importSceneFile,
  takeSnapshotNow,
} from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { plural } from '../plural.js';
import { EmptyState } from './EmptyState.js';

/**
 * Kopie zapasowe i pliki wymiany (etap 33) — zakładka MG.
 *
 * Panel odpowiada na trzy pytania i **świadomie nie odpowiada na czwarte**:
 * „czy kopia w ogóle powstaje", „gdzie ona leży" i „jak wyjąć stąd jedną
 * rzecz". Czwartego — „jak wrócić do kopii" — tu nie ma i nie będzie: przywrócenie
 * kasuje bieżący stan, więc robi się je skryptem przy zatrzymanym serwerze.
 * Zamiast guzika stoi w panelu polecenie do skopiowania.
 */

/** Zdanie dla kodu odmowy z serwera — importu albo samej kopii. */
function importErrorText(code: string, kind: ArchiveKind): string {
  if (code in ARCHIVE_REFUSAL_MESSAGES) {
    return archiveRefusalText(code as keyof typeof ARCHIVE_REFUSAL_MESSAGES, kind);
  }
  switch (code) {
    case 'ARCHIVE_EMPTY':
      return 'Plik nie ma nazwy — nie ma czego wczytać.';
    case 'BACKUP_DISABLED':
      return 'Kopie są wyłączone w konfiguracji serwera (BACKUP_DIR).';
    case 'OWNER_NOT_FOUND':
      return 'Wybrany gracz już nie istnieje — odśwież listę.';
    case 'NO_CAMPAIGN':
      return 'Brak aktywnej kampanii.';
    default:
      return `Nie udało się: ${code}`;
  }
}

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

function SnapshotSection() {
  const [view, setView] = useState<SnapshotListView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchSnapshots().then((ack) => {
      if (ack.ok && ack.data) setView(ack.data);
    });
  }, []);

  async function snapshotNow() {
    setBusy(true);
    setError(null);
    const ack = await takeSnapshotNow();
    if (ack.ok && ack.data) setView(ack.data);
    else if (!ack.ok) setError(importErrorText(ack.error, 'campaign'));
    setBusy(false);
  }

  const enabled = view !== null && view.directory !== '';

  return (
    <section className="archive-section">
      <h3 className="panel-section-title">Kopie zapasowe</h3>
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

/** Wybór pliku + wczytanie; wspólny dla karty i sceny. */
function useFileImport(kind: ArchiveKind) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function pick(
    file: File,
    send: (parsed: unknown) => Promise<{ ok: boolean; error?: string; data?: ArchiveImportResult }>,
  ) {
    setMessage(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text()) as unknown;
    } catch {
      setFailed(true);
      setMessage('To nie jest plik JSON.');
      return;
    }
    const ack = await send(parsed);
    if (!ack.ok) {
      setFailed(true);
      setMessage(importErrorText(ack.error ?? 'UNKNOWN', kind));
      return;
    }
    setFailed(false);
    setMessage([`Wczytano „${ack.data?.name ?? ''}".`, ack.data?.note].filter(Boolean).join(' '));
  }

  return { inputRef, message, failed, pick, setMessage };
}

function CharacterSection() {
  const characters = useCharacterStore((s) => s.characters);
  const order = useCharacterStore((s) => s.order);
  const [players, setPlayers] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const { inputRef, message, failed, pick } = useFileImport('character');

  useEffect(() => {
    apiGet<CampaignDetail[]>('/api/campaigns')
      .then((campaigns) => {
        const active = campaigns.find((c) => c.active);
        setPlayers(active?.players.map((p) => ({ id: p.id, name: p.name })) ?? []);
      })
      .catch(() => setPlayers([]));
  }, []);

  const chosen = selected || order[0] || '';

  return (
    <section className="archive-section">
      <h3 className="panel-section-title">Karta postaci</h3>
      <div className="archive-row-controls">
        <select
          className="archive-select"
          value={chosen}
          onChange={(event) => setSelected(event.target.value)}
          aria-label="Karta do pobrania"
        >
          {order.map((id) => (
            <option key={id} value={id}>
              {characters[id]?.name ?? id}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="small-button"
          disabled={!chosen}
          onClick={() => downloadArchive(ARCHIVE_DOWNLOAD_PATHS.character(chosen))}
        >
          Pobierz kartę
        </button>
      </div>

      <div className="archive-row-controls">
        <select
          className="archive-select"
          value={ownerId}
          onChange={(event) => setOwnerId(event.target.value)}
          aria-label="Właściciel wczytywanej karty"
        >
          <option value="">NPC (MG)</option>
          {players.map((player) => (
            <option key={player.id} value={player.id}>
              {player.name}
            </option>
          ))}
        </select>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="archive-file"
          aria-label="Plik karty do wczytania"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) {
              void pick(file, (parsed) =>
                importCharacterFile({ file: parsed, ownerId: ownerId || null }),
              );
            }
          }}
        />
      </div>
      <p className="archive-hint">
        Karta z pliku wchodzi zawsze jako <strong>nowa</strong> — obok tej, która już jest. Niczego
        nie nadpisuje.
      </p>
      {message && <p className={failed ? 'ai-status-error' : 'archive-ok'}>{message}</p>}
    </section>
  );
}

function SceneSection() {
  const scenes = useSceneStore((s) => s.scenes);
  const [selected, setSelected] = useState('');
  const { inputRef, message, failed, pick } = useFileImport('scene');

  const chosen = selected || scenes[0]?.id || '';

  return (
    <section className="archive-section">
      <h3 className="panel-section-title">Scena</h3>
      <div className="archive-row-controls">
        <select
          className="archive-select"
          value={chosen}
          onChange={(event) => setSelected(event.target.value)}
          aria-label="Scena do pobrania"
        >
          {scenes.map((scene) => (
            <option key={scene.id} value={scene.id}>
              {scene.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="small-button"
          disabled={!chosen}
          onClick={() => downloadArchive(ARCHIVE_DOWNLOAD_PATHS.scene(chosen))}
        >
          Pobierz scenę
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="archive-file"
          aria-label="Plik sceny do wczytania"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void pick(file, (parsed) => importSceneFile({ file: parsed }));
          }}
        />
      </div>
      <p className="archive-hint">
        Scena z pliku wjeżdża w podglądzie, nigdy jako aktywna. Figury zachowują powiązanie z kartą
        tylko wtedy, gdy ta karta jest w tej kampanii.
      </p>
      {message && <p className={failed ? 'ai-status-error' : 'archive-ok'}>{message}</p>}
    </section>
  );
}

function CampaignSection() {
  const [withChat, setWithChat] = useState(true);

  return (
    <section className="archive-section">
      <h3 className="panel-section-title">Zrzut całej kampanii</h3>
      <div className="archive-row-controls">
        <label className="archive-check">
          <input
            type="checkbox"
            checked={withChat}
            onChange={(event) => setWithChat(event.target.checked)}
          />
          <span>Z logiem czatu</span>
        </label>
        <button
          type="button"
          className="small-button"
          onClick={() => downloadArchive(ARCHIVE_DOWNLOAD_PATHS.campaign(withChat))}
        >
          Pobierz zrzut
        </button>
      </div>
      <p className="archive-hint">
        Jeden plik JSON z manifestem na górze: co, ile i <strong>czego w nim nie ma</strong>. Czat
        to zwykle cztery piąte objętości — bez niego zrzut jest mały i czytelny, ale traci historię
        sesji. Kont ani haseł plik nie niesie nigdy.
      </p>
    </section>
  );
}

export function ArchivePanel() {
  return (
    <div className="archive-panel">
      <SnapshotSection />
      <CampaignSection />
      <CharacterSection />
      <SceneSection />
    </div>
  );
}
