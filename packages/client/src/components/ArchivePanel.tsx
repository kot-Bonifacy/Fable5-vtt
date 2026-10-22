import { useRef, useState } from 'react';
import type { ArchiveImportResult } from '@vtt/shared';
import {
  ARCHIVE_DOWNLOAD_PATHS,
  ARCHIVE_IMPORT_PATH,
  ARCHIVE_REFUSAL_MESSAGES,
  archiveRefusalText,
  isContainerCard,
  sessionErrorText,
} from '@vtt/shared';
import { ApiError, apiUpload } from '../api.js';
import { clearNotices, notifyChoice, notifyInfo, notifyRefusal } from '../notices.js';
import { downloadArchive, openCampaign } from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useSceneStore } from '../stores/sceneStore.js';

/**
 * Kopie (etap 33, od 57a paczki ZIP) — zakładka MG: pobranie karty, sceny
 * i całej kampanii oraz jedno „Wczytaj z pliku…” dla wszystkiego.
 *
 * Paczka niesie grafiki, więc wczytana w innej kampanii nie potrzebuje plików
 * tej, z której wyszła. Rodzaj pliku rozpoznaje serwer z manifestu: karta
 * i scena wchodzą do otwartej kampanii, kampania — zawsze jako nowa (decyzja
 * MG z 22.10). Kopie całej bazy od etapu 53 są w panelu administratora.
 */

/** Zdanie dla kodu odmowy wczytania. */
function importErrorText(code: string): string {
  if (code in ARCHIVE_REFUSAL_MESSAGES) {
    return archiveRefusalText(code as keyof typeof ARCHIVE_REFUSAL_MESSAGES);
  }
  switch (code) {
    case 'ARCHIVE_EMPTY':
      return 'Plik nie ma nazwy — nie ma czego wczytać.';
    case 'NO_CAMPAIGN':
      return 'Brak otwartej kampanii — kartę i scenę wczytuje się do otwartej.';
    case 'FILE_TOO_LARGE':
      return ARCHIVE_REFUSAL_MESSAGES.ARCHIVE_PACKAGE_TOO_LARGE;
    default:
      return `Nie udało się wczytać pliku (${code}).`;
  }
}

const KIND_DONE: Record<ArchiveImportResult['kind'], string> = {
  character: 'Wczytano kartę',
  scene: 'Wczytano scenę',
  campaign: 'Wczytano kampanię',
};

async function openImported(result: ArchiveImportResult): Promise<void> {
  const ack = await openCampaign(result.id);
  if (!ack.ok) {
    notifyRefusal(
      'archive',
      sessionErrorText(ack.error) ?? 'Nie udało się otworzyć wczytanej kampanii.',
    );
  }
}

function DownloadSection() {
  const characters = useCharacterStore((s) => s.characters);
  const order = useCharacterStore((s) => s.order);
  const scenes = useSceneStore((s) => s.scenes);
  const [character, setCharacter] = useState('');
  const [scene, setScene] = useState('');
  const [withChat, setWithChat] = useState(true);

  // Skrzynia i stos (46b) żyją na scenie — eksport ich karty do pliku nic nie daje.
  const cards = order.filter((id) => {
    const card = characters[id];
    return card !== undefined && !isContainerCard(card.data);
  });
  const chosenCard = character || cards[0] || '';
  const chosenScene = scene || scenes[0]?.id || '';

  return (
    <section className="archive-section">
      <h3 className="panel-section-title">Pobierz kopię</h3>
      <div className="archive-row-controls">
        <select
          className="archive-select"
          value={chosenCard}
          onChange={(event) => setCharacter(event.target.value)}
          aria-label="Karta do pobrania"
        >
          {cards.map((id) => (
            <option key={id} value={id}>
              {characters[id]?.name ?? id}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="small-button"
          disabled={!chosenCard}
          onClick={() => downloadArchive(ARCHIVE_DOWNLOAD_PATHS.character(chosenCard))}
        >
          Pobierz kartę
        </button>
      </div>
      <div className="archive-row-controls">
        <select
          className="archive-select"
          value={chosenScene}
          onChange={(event) => setScene(event.target.value)}
          aria-label="Scena do pobrania"
        >
          {scenes.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="small-button"
          disabled={!chosenScene}
          onClick={() => downloadArchive(ARCHIVE_DOWNLOAD_PATHS.scene(chosenScene))}
        >
          Pobierz scenę
        </button>
      </div>
      <div className="archive-row-controls">
        <label
          className="archive-check"
          title="Czat to zwykle większość objętości. W pliku jest do przeczytania — wczytana kampania i tak zaczyna z pustym czatem."
        >
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
          Pobierz kampanię
        </button>
      </div>
      <p className="archive-hint">
        Każda kopia to paczka ZIP <strong>z grafikami</strong> — mapami, portretami i żetonami —
        więc wczytana gdzie indziej nie potrzebuje plików tej kampanii. Manifest w środku mówi, co w
        niej jest i czego nie ma. Kont ani haseł paczka nie niesie nigdy.
      </p>
    </section>
  );
}

function ImportSection() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(file: File) {
    clearNotices('archive');
    setBusy(true);
    try {
      const result = await apiUpload<ArchiveImportResult>(ARCHIVE_IMPORT_PATH, file);
      const text = [`${KIND_DONE[result.kind]} „${result.name}”.`, result.note]
        .filter(Boolean)
        .join(' ');
      if (result.kind === 'campaign') {
        notifyChoice(
          'archive',
          text,
          [{ label: 'Otwórz kampanię', run: () => void openImported(result) }],
          { title: 'Kopie', tone: 'info', silent: true },
        );
      } else {
        notifyInfo(text, { title: 'Kopie', topic: 'archive' });
      }
    } catch (error) {
      // 413 bez JSON-a to sufit pośrednika (nginx na VPS), nie serwera VTT.
      const code =
        error instanceof ApiError
          ? error.status === 413
            ? 'ARCHIVE_PACKAGE_TOO_LARGE'
            : error.code
          : 'NETWORK';
      notifyRefusal('archive', importErrorText(code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="archive-section">
      <h3 className="panel-section-title">Wczytaj z pliku</h3>
      <div className="archive-row-controls">
        <button
          type="button"
          className="small-button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Wczytuję…' : 'Wczytaj z pliku…'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip,.json,application/json"
          className="visually-hidden"
          tabIndex={-1}
          aria-label="Plik kopii do wczytania"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void load(file);
          }}
        />
      </div>
      <p className="archive-hint">
        Rodzaj rozpozna się sam, a nic nie zostanie nadpisane. <strong>Karta</strong> i{' '}
        <strong>scena</strong> wejdą do tej kampanii jako nowe (scena w podglądzie).{' '}
        <strong>Kampania</strong> wejdzie zawsze jako nowa, na listę w Panelu MG, bez graczy — ich
        karty poczekają, aż przypiszesz je na karcie albo przy „Nowy gracz”. Stare pliki .json też
        się wczytają, tyle że bez grafik.
      </p>
    </section>
  );
}

export function ArchivePanel() {
  // Kopie całej bazy niosą kampanie wszystkich MG — od etapu 53 są w panelu
  // administratora (`AdminBackups`), nie tutaj.
  return (
    <div className="archive-panel">
      <DownloadSection />
      <ImportSection />
    </div>
  );
}
