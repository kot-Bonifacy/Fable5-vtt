import { useEffect, useRef, useState } from 'react';
import type { ArchiveImportResult, ArchiveKind, CampaignDetail } from '@vtt/shared';
import {
  ARCHIVE_DOWNLOAD_PATHS,
  ARCHIVE_REFUSAL_MESSAGES,
  archiveRefusalText,
  isContainerCard,
} from '@vtt/shared';
import { apiGet } from '../api.js';
import { clearNotices, notifyInfo, notifyRefusal } from '../notices.js';
import { downloadArchive, importCharacterFile, importSceneFile } from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useSceneStore } from '../stores/sceneStore.js';

/**
 * Pliki wymiany (etap 33) — zakładka MG: eksport kampanii, import kart i scen.
 * Kopie zapasowe całej bazy od etapu 53 są w panelu administratora
 * (`admin/AdminBackups.tsx`).
 */

/** Zdanie dla kodu odmowy z serwera — importu albo samej kopii. */
function importErrorText(code: string, kind: ArchiveKind): string {
  if (code in ARCHIVE_REFUSAL_MESSAGES) {
    return archiveRefusalText(code as keyof typeof ARCHIVE_REFUSAL_MESSAGES, kind);
  }
  switch (code) {
    case 'ARCHIVE_EMPTY':
      return 'Plik nie ma nazwy — nie ma czego wczytać.';
    case 'OWNER_NOT_FOUND':
      return 'Wybrany gracz już nie istnieje — odśwież listę.';
    case 'NO_CAMPAIGN':
      return 'Brak aktywnej kampanii.';
    default:
      return `Nie udało się: ${code}`;
  }
}

/** Wybór pliku + wczytanie; wspólny dla karty i sceny. */
function useFileImport(kind: ArchiveKind) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Karta i scena mają osobne tematy: wynik jednego wczytania nie zdejmuje drugiego.
  const topic = kind === 'character' ? 'character' : 'scene';

  async function pick(
    file: File,
    send: (parsed: unknown) => Promise<{ ok: boolean; error?: string; data?: ArchiveImportResult }>,
  ) {
    clearNotices(topic);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text()) as unknown;
    } catch {
      notifyRefusal(topic, 'To nie jest plik JSON.');
      return;
    }
    const ack = await send(parsed);
    if (!ack.ok) {
      notifyRefusal(topic, importErrorText(ack.error ?? 'UNKNOWN', kind));
      return;
    }
    notifyInfo([`Wczytano „${ack.data?.name ?? ''}".`, ack.data?.note].filter(Boolean).join(' '), {
      title: 'Kopie',
      topic,
    });
  }

  return { inputRef, pick };
}

function CharacterSection() {
  const characters = useCharacterStore((s) => s.characters);
  const order = useCharacterStore((s) => s.order);
  const [players, setPlayers] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const { inputRef, pick } = useFileImport('character');

  useEffect(() => {
    apiGet<CampaignDetail[]>('/api/campaigns')
      .then((campaigns) => {
        const active = campaigns.find((c) => c.open);
        setPlayers(active?.players.map((p) => ({ id: p.id, name: p.name })) ?? []);
      })
      .catch(() => setPlayers([]));
  }, []);

  // Skrzynia i stos (46b) żyją na scenie — eksport ich karty do pliku nic nie daje.
  const cards = order.filter((id) => {
    const card = characters[id];
    return card !== undefined && !isContainerCard(card.data);
  });
  const chosen = selected || cards[0] || '';

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
          {cards.map((id) => (
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
    </section>
  );
}

function SceneSection() {
  const scenes = useSceneStore((s) => s.scenes);
  const [selected, setSelected] = useState('');
  const { inputRef, pick } = useFileImport('scene');

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
  // Kopie całej bazy niosą kampanie wszystkich MG — od etapu 53 są w panelu
  // administratora (`AdminBackups`), nie tutaj.
  return (
    <div className="archive-panel">
      <CampaignSection />
      <CharacterSection />
      <SceneSection />
    </div>
  );
}
