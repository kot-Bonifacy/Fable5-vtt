import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ArchiveImportResult,
  CampaignCopyListView,
  CampaignCopySummary,
  CampaignRollbackResult,
  MerchantListItem,
} from '@vtt/shared';
import {
  ARCHIVE_DOWNLOAD_PATHS,
  ARCHIVE_IMPORT_PATH,
  ARCHIVE_REFUSAL_MESSAGES,
  CAMPAIGN_COPY_PATHS,
  CAMPAIGN_COPY_REASON_LABELS,
  CAMPAIGN_COPY_REFUSALS,
  archiveRefusalText,
  campaignCopySessionLabel,
  confirmsCampaignName,
  formatArchiveBytes,
  isContainerCard,
  polishPlural,
  sessionErrorText,
} from '@vtt/shared';
import { ApiError, apiGet, apiPost, apiUpload } from '../api.js';
import { clearNotices, notifyChoice, notifyInfo, notifyRefusal } from '../notices.js';
import {
  downloadArchive,
  listMerchants,
  openCampaign,
  subscribeCampaignCopies,
} from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useBotStore } from '../stores/botStore.js';
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
  characters: 'Wczytano karty graczy',
  shop: 'Wczytano sklep',
  bot: 'Wczytano bota',
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
  const botMap = useBotStore((s) => s.bots);
  const [character, setCharacter] = useState('');
  const [scene, setScene] = useState('');
  const [shop, setShop] = useState('');
  const [bot, setBot] = useState('');
  const [withChat, setWithChat] = useState(true);
  const [shops, setShops] = useState<MerchantListItem[]>([]);

  // Etap 57c: sklepy nie mieszkają w magazynie MG — lista z serwera przy wejściu.
  useEffect(() => {
    let live = true;
    void listMerchants().then((ack) => {
      if (live && ack.ok && ack.data) setShops(ack.data.merchants);
    });
    return () => {
      live = false;
    };
  }, []);

  // Skrzynia i stos (46b) żyją na scenie — eksport ich karty do pliku nic nie daje.
  const cards = order.filter((id) => {
    const card = characters[id];
    return card !== undefined && !isContainerCard(card.data);
  });
  const chosenCard = character || cards[0] || '';
  const chosenScene = scene || scenes[0]?.id || '';
  const chosenShop = shop || shops[0]?.id || '';
  const bots = Object.values(botMap).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  const chosenBot = bot || bots[0]?.id || '';
  const hasPlayerCards = cards.some((id) => {
    const card = characters[id];
    return card !== undefined && (card.ownerId !== null || card.pendingOwner !== null);
  });

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
        <select
          className="archive-select"
          value={chosenShop}
          disabled={shops.length === 0}
          onChange={(event) => setShop(event.target.value)}
          aria-label="Sklep do pobrania"
        >
          {shops.length === 0 && <option value="">brak sklepów</option>}
          {shops.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="small-button"
          disabled={!chosenShop}
          title="Sklep z kartą handlarza i towarem — w innej kampanii wejdzie zamknięty"
          onClick={() => downloadArchive(ARCHIVE_DOWNLOAD_PATHS.shop(chosenShop))}
        >
          Pobierz sklep
        </button>
      </div>
      <div className="archive-row-controls">
        <select
          className="archive-select"
          value={chosenBot}
          disabled={bots.length === 0}
          onChange={(event) => setBot(event.target.value)}
          aria-label="Bot do pobrania"
        >
          {bots.length === 0 && <option value="">brak botów</option>}
          {bots.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="small-button"
          disabled={!chosenBot}
          title="Profil bota z relacjami — w innej kampanii relacje wrócą do postaci o tych samych imionach"
          onClick={() => downloadArchive(ARCHIVE_DOWNLOAD_PATHS.bot(chosenBot))}
        >
          Pobierz bota
        </button>
      </div>
      <div className="archive-row-controls">
        <button
          type="button"
          className="small-button"
          disabled={!hasPlayerCards}
          title="Karty wszystkich graczy tej kampanii jedną paczką, z portretami"
          onClick={() => downloadArchive(ARCHIVE_DOWNLOAD_PATHS.players)}
        >
          Pobierz karty graczy
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
      const head =
        result.kind === 'characters'
          ? `Wczytano karty graczy z kampanii „${result.name}”.`
          : `${KIND_DONE[result.kind]} „${result.name}”.`;
      const text = [head, result.note].filter(Boolean).join(' ');
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
        Rodzaj rozpozna się sam, a nic nie zostanie nadpisane. <strong>Karta</strong>,{' '}
        <strong>scena</strong>, <strong>sklep</strong> i <strong>bot</strong> wejdą do tej kampanii
        jako nowe (scena w podglądzie, sklep zamknięty, bot nieaktywny). <strong>Kampania</strong>{' '}
        wejdzie zawsze jako nowa, na listę w Panelu MG, bez graczy — ich karty poczekają, aż
        przypiszesz je na karcie albo przy „Nowy gracz”. Stare pliki .json też się wczytają, tyle że
        bez grafik.
      </p>
    </section>
  );
}

/** „22.10, 18:42” — chwila kopii w wierszu. */
function copyClock(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Kopie pogrupowane po sesjach, od najświeższej — tak, jak liczy je rotacja. */
function bySession(copies: CampaignCopySummary[]): [string, CampaignCopySummary[]][] {
  const groups = new Map<string, CampaignCopySummary[]>();
  for (const copy of copies) {
    const key = copy.sessionStartedAt ?? `poza:${copy.name}`;
    groups.set(key, [...(groups.get(key) ?? []), copy]);
  }
  return [...groups.values()].map((rows) => [
    campaignCopySessionLabel(rows[0]!.sessionStartedAt),
    rows,
  ]);
}

/**
 * Kopie automatyczne kampanii (etap 57b): serwer odkłada je sam przy starcie
 * i końcu sesji oraz co godzinę w jej trakcie. Z każdej można pobrać paczkę
 * albo cofnąć kampanię — tylko bez trwającej sesji i po wpisaniu nazwy.
 */
function CopiesSection() {
  const campaign = useAuthStore((s) => s.activeCampaign);
  const [view, setView] = useState<CampaignCopyListView | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setView(await apiGet<CampaignCopyListView>(CAMPAIGN_COPY_PATHS.list));
    } catch {
      setView(null);
    }
  }, []);

  // Start i koniec sesji zmieniają listę i to, czy wolno cofać.
  useEffect(() => {
    void load();
  }, [load, campaign?.id, campaign?.sessionStartedAt]);
  useEffect(() => subscribeCampaignCopies(() => void load()), [load]);

  async function rollback(copy: CampaignCopySummary) {
    if (!view) return;
    clearNotices('archive');
    setBusy(true);
    try {
      const result = await apiPost<CampaignRollbackResult>(CAMPAIGN_COPY_PATHS.restore(copy.name), {
        confirm: typed,
      });
      const waiting = result.pendingPlayers.length;
      notifyInfo(
        [
          `Kampania cofnięta do kopii z ${copyClock(copy.takenAt)} (${CAMPAIGN_COPY_REASON_LABELS[copy.reason]}).`,
          `Stan sprzed cofnięcia jest w kampanii „${result.previous.name}” w Panelu MG — bez graczy, do obejrzenia albo usunięcia.`,
          waiting > 0
            ? `${waiting} ${polishPlural(waiting, 'karta czeka', 'karty czekają', 'kart czeka')} na gracza, którego nie ma już w kampanii.`
            : '',
        ]
          .filter(Boolean)
          .join(' '),
        { title: 'Kopie', topic: 'archive' },
      );
      setConfirming(null);
      setTyped('');
      await load();
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'NETWORK';
      notifyRefusal(
        'archive',
        CAMPAIGN_COPY_REFUSALS[code] ?? `Nie udało się cofnąć kampanii (${code}).`,
      );
    } finally {
      setBusy(false);
    }
  }

  if (!view) return null;
  return (
    <section className="archive-section">
      <h3 className="panel-section-title">Kopie automatyczne</h3>
      {!view.enabled ? (
        <p className="archive-hint">Ten serwer nie robi kopii kampanii.</p>
      ) : view.copies.length === 0 ? (
        <p className="archive-hint">Jeszcze żadnej — pierwsza powstanie przy „Rozpocznij sesję”.</p>
      ) : (
        <ul className="archive-list archive-list--copies">
          {bySession(view.copies).map(([label, rows]) => (
            <li key={rows[0]!.name} className="archive-session">
              <span className="archive-session-title">{label}</span>
              <ul className="archive-session-copies">
                {rows.map((copy) => (
                  <li key={copy.name} className="archive-row">
                    <span className="archive-row-meta archive-row-when">
                      {copyClock(copy.takenAt)} · {CAMPAIGN_COPY_REASON_LABELS[copy.reason]}
                    </span>
                    <span className="archive-row-meta">{formatArchiveBytes(copy.bytes)}</span>
                    <span className="archive-row-actions">
                      <button
                        type="button"
                        className="small-button"
                        title="Paczka ZIP tej kopii — „Wczytaj z pliku…” wczyta ją jako nową kampanię"
                        onClick={() => downloadArchive(CAMPAIGN_COPY_PATHS.download(copy.name))}
                      >
                        Pobierz
                      </button>
                      <button
                        type="button"
                        className="small-button"
                        disabled={view.sessionRunning}
                        title={
                          view.sessionRunning
                            ? 'Trwa sesja — cofnąć można dopiero po „Zakończ sesję”'
                            : 'Kampania wraca do tej chwili; gracze, czat i zaproszenia zostają'
                        }
                        onClick={() => {
                          setConfirming(confirming === copy.name ? null : copy.name);
                          setTyped('');
                        }}
                      >
                        Cofnij…
                      </button>
                    </span>
                    {confirming === copy.name && !view.sessionRunning && (
                      <span className="archive-confirm">
                        <span className="archive-row-meta">
                          Wpisz nazwę kampanii <strong>{view.campaignName}</strong>:
                        </span>
                        <input
                          type="text"
                          className="archive-select"
                          aria-label={`Potwierdź nazwę kampanii ${view.campaignName}`}
                          value={typed}
                          onChange={(event) => setTyped(event.target.value)}
                          spellCheck={false}
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          className="small-button small-button--danger"
                          disabled={busy || !confirmsCampaignName(typed, view.campaignName)}
                          onClick={() => void rollback(copy)}
                        >
                          {busy ? 'Cofam…' : 'Cofnij kampanię'}
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {view.enabled && (
        <p className="archive-hint">
          Kopia powstaje przy starcie i końcu sesji oraz co {view.intervalMinutes} min w jej
          trakcie; zostają kopie z {view.keepSessions} ostatnich sesji. <strong>Cofnięcie</strong>{' '}
          wymienia karty, sceny, tabele, sklepy, boty i dziennik na te z kopii — gracze, czat i
          zaproszenia zostają, a obecny stan trafia do osobnej kampanii „(przed cofnięciem)”.
        </p>
      )}
    </section>
  );
}

export function ArchivePanel() {
  // Kopie całej bazy niosą kampanie wszystkich MG — od etapu 53 są w panelu
  // administratora (`AdminBackups`), nie tutaj.
  return (
    <div className="archive-panel">
      <CopiesSection />
      <DownloadSection />
      <ImportSection />
    </div>
  );
}
