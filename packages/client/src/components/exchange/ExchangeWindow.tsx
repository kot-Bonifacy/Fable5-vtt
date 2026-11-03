import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExchangeCounterpartView, TradeView } from '@vtt/shared';
import {
  EXCHANGE_KIND_LABELS,
  EXCHANGE_UNAVAILABLE_LABELS,
  ROLE_GM,
  isTradeActive,
} from '@vtt/shared';
import { clearNotices, notifyInfo, notifyRefusal } from '../../notices.js';
import { fetchExchangeCounterparts, inventoryErrorText } from '../../socket.js';
import { useAuthStore } from '../../stores/authStore.js';
import { useCharacterStore } from '../../stores/characterStore.js';
import { useTokenStore } from '../../stores/tokenStore.js';
import {
  GM_ANY_KEY,
  liveTradeKey,
  tradeIdOfKey,
  useExchangeStore,
  type ExchangeWindowState,
} from '../../stores/exchangeStore.js';
import { useWindowPlacement } from '../../window-placement.js';
import { WindowResizeGrip } from '../WindowResizeGrip.js';
import { ContainerPane } from './ContainerPane.js';
import { GmPane } from './GmPane.js';
import { LootPane } from './LootPane.js';
import { MerchantPane } from './MerchantPane.js';
import { OwnInventoryColumn } from './OwnInventoryColumn.js';
import { TradePane } from './TradePane.js';
import { ownCards, startTrade } from './open.js';

/**
 * Jedno okno „Wymiana” (etap 46a, wzór: Item Piles z Foundry VTT).
 *
 * Zastępuje trzy okna z 38b/38c: przekazanie, łup i handel. Lewa kolumna to
 * zawsze moja karta i portfel; o tym, co stoi po prawej, decyduje **druga
 * strona** wybrana w nagłówku (decyzja MG 5):
 *
 *  - kolega, towarzysz, żywy NPC — handel z dwoma polami i dwiema zgodami;
 *  - ciało — łup od ręki;
 *  - handlarz — półka, koszyk i pole sprzedaży;
 *  - pojemnik (46b) — zamek, potem bierze i wkłada się od ręki;
 *  - tryb MG — „Dokąd” na dowolną kartę.
 *
 * Bez wybranej drugiej strony okno pokazuje mój ekwipunek, z którego wiersz
 * da się przeciągnąć na mapę — powstaje „Stos” (46b2).
 *
 * Listę drugich stron buduje serwer (`exchange:counterparts`), bo o zasięgu
 * i o tym, czyja karta stoi za figurą, gracz nie wie. Zmiana strony nie
 * zamyka okna, a trwający handel czeka w doku, gdy patrzy się gdzie indziej
 * (decyzja MG z 08.10). Wybór kolegi albo NPC-a **od razu** zaprasza.
 */

const KIND_ICONS: Record<ExchangeCounterpartView['kind'], string> = {
  trade: '🤝',
  loot: '🎒',
  merchant: '🛒',
  gm: '🛠',
  container: '📦',
};

function counterpartLabel(row: ExchangeCounterpartView, isGm: boolean): string {
  const where = row.metres === undefined ? '' : ` · ${row.metres} m`;
  const kind = isGm ? ` — ${EXCHANGE_KIND_LABELS[row.kind]}` : '';
  const why = row.unavailable ? ` — ${EXCHANGE_UNAVAILABLE_LABELS[row.unavailable]}` : '';
  return `${KIND_ICONS[row.kind]} ${row.name}${where}${kind}${why}`;
}

function tradeLabel(trade: TradeView): string {
  const other = trade.sides.find((side) => !side.mine) ?? trade.sides[1];
  const state = trade.status === 'invited' ? 'czeka na przyjęcie' : 'handel trwa';
  return `🤝 ${other.name} — ${state}`;
}

/** Czy któraś figura obecna w obu podpisach (`id:naklejki;…`) zmieniła naklejki. */
function changedSticker(before: string, after: string): boolean {
  const parse = (text: string) =>
    new Map(
      text
        .split(';')
        .filter(Boolean)
        .map((part) => {
          const at = part.indexOf(':');
          return [part.slice(0, at), part.slice(at + 1)] as const;
        }),
    );
  const old = parse(before);
  for (const [id, stickers] of parse(after)) {
    const was = old.get(id);
    if (was !== undefined && was !== stickers) return true;
  }
  return false;
}

export function ExchangeWindow() {
  const win = useExchangeStore((s) => s.window);
  if (!win) return null;
  return <ExchangeWindowBody key={win.anchorId ?? 'spectator'} win={win} />;
}

function ExchangeWindowBody({ win }: { win: ExchangeWindowState }) {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const anchorId = win.anchorId;
  const anchor = useCharacterStore((s) => (anchorId ? s.characters[anchorId] : undefined));
  const trades = useExchangeStore((s) => s.trades);
  const shops = useExchangeStore((s) => s.shops);
  const shelves = useExchangeStore((s) => s.shelves);
  const close = () => useExchangeStore.getState().closeWindow();

  const [counterparts, setCounterparts] = useState<ExchangeCounterpartView[]>([]);
  const [targets, setTargets] = useState<{ id: string; name: string }[]>([]);
  const [inviting, setInviting] = useState(false);

  const savedAt = anchor?.updatedAt;
  const refresh = useCallback(async () => {
    if (!anchorId) return;
    const ack = await fetchExchangeCounterparts({
      characterId: anchorId,
      ...(win.tokenId ? { tokenId: win.tokenId } : {}),
    });
    if (!ack.ok) {
      // Figura, od której okno otwarto, zniknęła (pusty stos, skasowane ciało,
      // ukryta przez MG) — okno zostaje na mojej karcie bez drugiej strony.
      if (ack.error === 'TOKEN_NOT_FOUND' && win.tokenId) {
        useExchangeStore.getState().openWindow(anchorId);
        return;
      }
      notifyRefusal('exchange', inventoryErrorText(ack.error));
      return;
    }
    const rows = ack.data?.counterparts ?? [];
    setCounterparts(rows);
    setTargets(ack.data?.targets ?? []);
    // Ciało wstało (MG zdjął „Ogłuszony”, postać odzyskała PW): łupu na liście
    // już nie ma, więc okno schodzi do wyboru drugiej strony — tam stoi ta sama
    // figura jako handel. Handlu nie zaczynamy sami, bo wybór handlu zaprasza.
    const selected = useExchangeStore.getState().window?.selected ?? null;
    if (selected?.startsWith('loot:') && !rows.some((row) => row.key === selected)) {
      const tokenId = selected.slice('loot:'.length);
      const now = rows.find((row) => row.tokenId === tokenId);
      useExchangeStore.getState().select(null);
      notifyInfo(
        now
          ? `${now.name} już nie leży — przeszukanie się skończyło.`
          : 'Ciała nie ma już w zasięgu — przeszukanie się skończyło.',
        { topic: 'exchange' },
      );
    }
  }, [anchorId, win.tokenId]);

  // Odświeżenie po każdym zapisie mojej karty: `updatedAt` jest stemplem
  // serwera, więc zmienia się dokładnie wtedy, gdy ekwipunek naprawdę
  // pojechał — a nie przy optymistycznej łacie (pułapka z 23b).
  useEffect(() => {
    void refresh();
  }, [refresh, savedAt]);

  // Naklejki stanu (Ogłuszony, Pochwycony, rany) siedzą na figurze, a nie na
  // karcie — to one rozstrzygają, czy figura to łup, czy handel. Zmiana naklejek
  // którejkolwiek figury z listy (albo tej, od której otwarto okno) przynosi
  // listę od nowa (zaległość z 31.10: ciało wstało, okno dalej było łupem).
  const watched = [
    ...new Set([
      ...(win.tokenId ? [win.tokenId] : []),
      ...counterparts.flatMap((row) => (row.tokenId ? [row.tokenId] : [])),
    ]),
  ];
  const stickers = useTokenStore((s) =>
    watched.map((id) => `${id}:${(s.tokens[id]?.statuses ?? []).join(',')}`).join(';'),
  );
  const seenStickers = useRef<string | null>(null);
  useEffect(() => {
    const before = seenStickers.current;
    seenStickers.current = stickers;
    // Lista figur zmienia się też z samym odświeżeniem — liczy się tylko zmiana
    // naklejek figury, którą widzieliśmy już wcześniej.
    if (before === null || !changedSticker(before, stickers)) return;
    void refresh();
  }, [stickers, refresh]);

  const placement = useWindowPlacement('exchange', () => ({ x: 160, y: 96 }));

  const liveId = tradeIdOfKey(win.selected);
  const live = liveId ? trades[liveId] : undefined;
  // Trwający handel tej karty — na jeden front naraz (`CHARACTER_BUSY`).
  const running = anchorId
    ? Object.values(trades).find(
        (trade) =>
          isTradeActive(trade) && trade.sides.some((side) => side.characterId === anchorId),
      )
    : undefined;
  const selectedRow = counterparts.find((row) => row.key === win.selected);

  async function choose(key: string) {
    clearNotices('exchange');
    if (key === '') {
      useExchangeStore.getState().select(null);
      return;
    }
    const row = counterparts.find((candidate) => candidate.key === key);
    if (!row || row.kind !== 'trade' || !anchorId) {
      useExchangeStore.getState().select(key);
      return;
    }
    // Decyzja MG z 08.10 (46a2): wybór kolegi albo NPC-a zaprasza od razu.
    setInviting(true);
    const refusal = await startTrade(anchorId, row);
    setInviting(false);
    if (refusal) notifyRefusal('exchange', refusal);
  }

  const mine = ownCards();
  // Sklep poznaje się po kluczu, nie po liście: okno otwarte z doku albo
  // z ekranu „Między sesjami” pokazuje półkę, zanim lista w ogóle przyjdzie.
  const merchantId = win.selected?.startsWith('merchant:')
    ? win.selected.slice('merchant:'.length)
    : null;
  const kind: 'trade' | 'loot' | 'merchant' | 'gm' | 'container' | null = live
    ? 'trade'
    : win.selected === GM_ANY_KEY
      ? 'gm'
      : merchantId
        ? 'merchant'
        : selectedRow &&
            (selectedRow.kind === 'loot' ||
              selectedRow.kind === 'gm' ||
              selectedRow.kind === 'container')
          ? selectedRow.kind
          : null;
  const wide = kind === 'trade' || kind === 'merchant';
  const title = anchor ? `Wymiana — ${anchor.name}` : 'Wymiana — podgląd MG';

  return (
    <section
      ref={placement.ref}
      className={`inventory-window exchange-window${wide ? ' exchange-window--wide' : ''}`}
      style={placement.style}
      aria-label="Wymiana"
      data-exchange-mode={kind ?? 'none'}
      data-owns-keys
      // Klik w puste miejsce okna też bierze fokus — inaczej `Esc` szedłby do mapy.
      tabIndex={-1}
      onKeyDown={(event) => {
        // `Esc` w oknie zamyka okno (zaległość z 31.10), jak w `SceneObjectCard`
        // — chyba że zjadła go siatka kafli, czyszcząc zaznaczenie
        // (`stopPropagation`). Trwający handel czeka w doku.
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        close();
      }}
    >
      <div className="inventory-window-header" {...placement.dragProps}>
        <span className="inventory-window-title">{title}</span>
        <button
          type="button"
          className="sheet-close"
          onClick={close}
          title="Zamknij — trwający handel czeka w rogu mapy"
          aria-label="Zamknij okno wymiany"
        >
          ✕
        </button>
      </div>

      <div className="inventory-window-body">
        {anchorId && (
          <div className="inventory-ends exchange-ends">
            {!isGm && mine.length > 1 ? (
              <label className="inventory-end">
                Moja karta
                <select
                  value={anchorId}
                  aria-label="Moja karta"
                  onChange={(e) =>
                    useExchangeStore.getState().openWindow(e.target.value, {
                      ...(win.tokenId ? { tokenId: win.tokenId } : {}),
                    })
                  }
                >
                  {mine.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="inventory-end exchange-anchor">{anchor?.name}</span>
            )}
            <span className="inventory-arrow" aria-hidden="true">
              ⇄
            </span>
            <label className="inventory-end">
              Druga strona
              <select
                value={win.selected ?? ''}
                aria-label="Druga strona"
                disabled={inviting}
                onFocus={() => void refresh()}
                onChange={(e) => void choose(e.target.value)}
              >
                <option value="">— wybierz, z kim —</option>
                {running && <option value={liveTradeKey(running.id)}>{tradeLabel(running)}</option>}
                {isGm && <option value={GM_ANY_KEY}>🛠 Tryb MG — dowolna karta</option>}
                {merchantId && !selectedRow && (
                  <option value={win.selected ?? ''}>
                    🛒{' '}
                    {shelves[merchantId]?.name ??
                      shops.find((shop) => shop.id === merchantId)?.name ??
                      'Sklep'}
                  </option>
                )}
                {counterparts.map((row) => (
                  <option
                    key={row.key}
                    value={row.key}
                    disabled={
                      row.unavailable !== undefined ||
                      (row.kind === 'trade' && running !== undefined)
                    }
                  >
                    {counterpartLabel(row, isGm)}
                    {row.kind === 'trade' && running ? ' — najpierw skończ trwający handel' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {kind === null && anchorId && (
          <>
            <p className="inventory-hint">
              {inviting
                ? 'Wysyłam zaproszenie…'
                : counterparts.length === 0 && !running
                  ? 'W zasięgu ręki nie ma nikogo, z kim dałoby się wymienić. Podejdź bliżej albo otwórz sklep z doku w rogu mapy.'
                  : 'Wybierz, z kim wymieniasz: z kolegą i NPC-em handlujesz za zgodą obu stron, ciało i otwarty pojemnik przeszukujesz od ręki, u handlarza kupujesz i sprzedajesz.'}
            </p>
            {!inviting && (
              <div className="exchange-columns">
                <OwnInventoryColumn anchorId={anchorId} />
              </div>
            )}
            <p className="inventory-hint">
              Wiersz przeciągnięty na mapę kładzie się na ziemi obok ciebie jako „Stos”.
            </p>
          </>
        )}
        {live && <TradePane key={live.id} trade={live} />}
        {kind === 'loot' && selectedRow && anchorId && (
          <LootPane anchorId={anchorId} body={selectedRow} onChanged={() => void refresh()} />
        )}
        {kind === 'container' && selectedRow && anchorId && (
          <ContainerPane
            key={selectedRow.key}
            anchorId={anchorId}
            container={selectedRow}
            onChanged={() => void refresh()}
          />
        )}
        {kind === 'merchant' && merchantId && anchorId && (
          <MerchantPane key={merchantId} anchorId={anchorId} merchantId={merchantId} />
        )}
        {kind === 'gm' && anchorId && (
          <GmPane
            key={win.selected ?? ''}
            anchorId={anchorId}
            targets={targets}
            initialTarget={selectedRow?.characterId ?? null}
          />
        )}
      </div>
      <WindowResizeGrip resizeProps={placement.resizeProps} />
    </section>
  );
}
