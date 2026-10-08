import { useEffect, useState } from 'react';
import type { MerchantRowOverlay, MerchantSettings, MerchantShelfRowView } from '@vtt/shared';
import {
  ITEM_ROWS_MAX,
  MERCHANT_BUY_BACK_MAX,
  MERCHANT_PRICE_MUL_MAX,
  MERCHANT_SIGN_MAX,
} from '@vtt/shared';
import { confirmDestructive } from '../../confirm.js';
import { configMerchant, merchantErrorText, setMerchantRow, viewMerchant } from '../../socket.js';
import { useExchangeStore } from '../../stores/exchangeStore.js';
import { ItemViewIcon } from '../ItemIcons.js';

/**
 * Sekcja „Sklep” w karcie NPC-a (etap 46a, tylko MG).
 *
 * Handlarz to zwykła karta NPC-a z wierszem `Merchant` — towarem jest jej
 * ekwipunek, więc MG dopisuje towar tak, jak dopisuje rzeczy każdej karcie,
 * a tutaj mówi tylko, **jak** sklep sprzedaje: szyld, „Otwarte”, przy figurze
 * albo zdalnie, między sesjami, mnożnik ceny, odkup i kasę „bez dna”. Przy
 * każdym wierszu towaru: „∞” (kopie bez końca), „ukryty” (gracz go nie
 * dostaje — filtr serwera, nie CSS) i własna cena (bez mnożnika).
 *
 * Ustawienia nie jadą autozapisem karty — to decyzja MG (umowa `eddies`,
 * `playReady`), więc każdy przełącznik to osobne `merchant:config`.
 */
export function MerchantSection({ characterId }: { characterId: string }) {
  const shop = useExchangeStore((s) => s.shops.find((row) => row.characterId === characterId));
  const view = useExchangeStore((s) => (shop ? s.shelves[shop.id] : undefined));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!shop) return;
    let alive = true;
    void viewMerchant(shop.id).then((ack) => {
      if (!alive) return;
      if (ack.ok && ack.data) useExchangeStore.getState().applyShelf(ack.data.merchant);
      else if (!ack.ok) setMessage(merchantErrorText(ack.error));
    });
    return () => {
      alive = false;
    };
  }, [shop?.id]);

  async function config(merchant: Partial<MerchantSettings> | null) {
    setBusy(true);
    const ack = await configMerchant({ characterId, merchant });
    setBusy(false);
    setMessage(ack.ok ? null : merchantErrorText(ack.error));
  }

  if (!shop) {
    return (
      <div className="cp-panel cp-shop">
        <div className="cp-field cp-field--notch">
          <span className="cp-label">Sklep</span>
          <button
            type="button"
            className="cp-add"
            disabled={busy}
            title="Ta karta zostaje handlarzem — jej ekwipunek to towar. Sklep startuje zamknięty."
            onClick={() => void config({})}
          >
            🛒 Zrób z niego handlarza
          </button>
        </div>
        {message && <p className="cp-shop-message">{message}</p>}
      </div>
    );
  }

  const settings = view?.settings;
  return (
    <div className="cp-panel cp-shop" data-testid="merchant-section">
      <div className="cp-field cp-field--notch cp-shop-head">
        <span className="cp-label">Sklep</span>
        <label className="cp-shop-toggle">
          <input
            type="checkbox"
            checked={settings?.open ?? false}
            disabled={busy || !settings}
            onChange={(e) => void config({ open: e.target.checked })}
          />
          Otwarte
        </label>
        <button
          type="button"
          className="cp-add"
          disabled={busy}
          title="Karta przestaje być handlarzem — ekwipunek zostaje, ustawienia i oznaczenia wierszy znikają"
          onClick={() => {
            if (confirmDestructive('Ta karta przestanie być handlarzem.')) void config(null);
          }}
        >
          Przestań handlować
        </button>
      </div>
      {settings && <SettingsFields settings={settings} busy={busy} onChange={config} />}
      {message && <p className="cp-shop-message">{message}</p>}
      {view && <ShopRows merchantId={shop.id} rows={view.rows} onError={setMessage} />}
      <p className="cp-shop-hint">
        Towar to ekwipunek tej karty — dopisujesz go w Broni, Pancerzu i Wyposażeniu. Broń i pancerz
        nie mają ilości: pięć pistoletów to pięć wierszy albo jeden wiersz „∞”. Karta mieści{' '}
        {ITEM_ROWS_MAX} wierszy na listę.
      </p>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  title,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  title: string;
  disabled: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const parsed = Number.parseInt(draft, 10);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      setDraft(String(value));
      return;
    }
    if (parsed !== value) onCommit(parsed);
  };
  return (
    <label className="cp-shop-number" title={title}>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={draft}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
    </label>
  );
}

function SettingsFields({
  settings,
  busy,
  onChange,
}: {
  settings: MerchantSettings;
  busy: boolean;
  onChange: (patch: Partial<MerchantSettings>) => Promise<void>;
}) {
  const [sign, setSign] = useState(settings.sign);
  useEffect(() => setSign(settings.sign), [settings.sign]);
  return (
    <div className="cp-shop-settings">
      <label className="cp-shop-sign">
        Szyld
        <input
          type="text"
          maxLength={MERCHANT_SIGN_MAX}
          value={sign}
          placeholder="pusty — nazwa figury"
          disabled={busy}
          aria-label="Szyld"
          onChange={(e) => setSign(e.target.value)}
          onBlur={() => {
            if (sign.trim() !== settings.sign) void onChange({ sign });
          }}
        />
      </label>
      <label
        className="cp-shop-access"
        title="Przy figurze — kupuje się na wyciągnięcie ręki; zdalny — z doku „Sklepy” w rogu mapy, bez figury"
      >
        Gdzie
        <select
          value={settings.access}
          disabled={busy}
          aria-label="Gdzie sprzedaje"
          onChange={(e) => void onChange({ access: e.target.value as MerchantSettings['access'] })}
        >
          <option value="reach">przy figurze</option>
          <option value="remote">zdalny</option>
        </select>
      </label>
      <NumberField
        label="Cena %"
        value={settings.priceMul}
        min={1}
        max={MERCHANT_PRICE_MUL_MAX}
        title="Procent ceny katalogowej przy sprzedaży graczom (100 = katalog)"
        disabled={busy}
        onCommit={(priceMul) => void onChange({ priceMul })}
      />
      <NumberField
        label="Odkup %"
        value={settings.buyBackPct}
        min={0}
        max={MERCHANT_BUY_BACK_MAX}
        title="Ile procent ceny katalogowej handlarz płaci za rzecz gracza (0 — nie skupuje)"
        disabled={busy}
        onCommit={(buyBackPct) => void onChange({ buyBackPct })}
      />
      <label
        className="cp-shop-toggle"
        title="Handlarz płaci zawsze, a jego karta nie zapisuje ruchów gotówki"
      >
        <input
          type="checkbox"
          checked={settings.cashInfinite}
          disabled={busy}
          onChange={(e) => void onChange({ cashInfinite: e.target.checked })}
        />
        Kasa bez dna
      </label>
      <label
        className="cp-shop-toggle"
        title="Gracz kupuje tu także na ekranie „Między sesjami” — bez mapy i bez zasięgu"
      >
        <input
          type="checkbox"
          checked={settings.betweenSessions}
          disabled={busy}
          onChange={(e) => void onChange({ betweenSessions: e.target.checked })}
        />
        Między sesjami
      </label>
    </div>
  );
}

function overlayOf(row: MerchantShelfRowView): MerchantRowOverlay {
  return {
    ...(row.infinite ? { infinite: true as const } : {}),
    ...(row.hidden ? { hidden: true as const } : {}),
    ...(row.priceOverride !== undefined ? { price: row.priceOverride } : {}),
  };
}

function ShopRows({
  merchantId,
  rows,
  onError,
}: {
  merchantId: string;
  rows: MerchantShelfRowView[];
  onError: (message: string | null) => void;
}) {
  async function patch(row: MerchantShelfRowView, change: Partial<MerchantRowOverlay>) {
    const next: MerchantRowOverlay = { ...overlayOf(row), ...change };
    for (const key of Object.keys(change) as (keyof MerchantRowOverlay)[]) {
      if (change[key] === undefined) delete next[key];
    }
    const ack = await setMerchantRow({
      merchantId,
      list: row.list,
      rowId: row.rowId,
      overlay: Object.keys(next).length > 0 ? next : null,
    });
    onError(ack.ok ? null : merchantErrorText(ack.error));
  }

  if (rows.length === 0) {
    return <p className="cp-shop-hint">Półka jest pusta — dopisz karcie ekwipunek.</p>;
  }
  return (
    <ul className="cp-shop-rows">
      {rows.map((row) => (
        <li key={`${row.list}:${row.rowId}`} className={row.hidden ? 'cp-shop-row--hidden' : ''}>
          <ItemViewIcon item={row} />
          <span className="cp-shop-name">{row.name}</span>
          <span className="cp-shop-qty">{row.stackable ? `× ${row.qty}` : row.detail}</span>
          <span className="cp-shop-price">
            {row.price === null ? '⚠ bez ceny' : `${row.price} ed`}
          </span>
          <label className="cp-shop-flag" title="Sprzedaje kopie bez końca — wiersz nie ubywa">
            <input
              type="checkbox"
              checked={row.infinite}
              aria-label={`Bez dna: ${row.name}`}
              onChange={(e) => void patch(row, { infinite: e.target.checked ? true : undefined })}
            />
            ∞
          </label>
          <label className="cp-shop-flag" title="Gracze tego wiersza nie widzą na półce">
            <input
              type="checkbox"
              checked={row.hidden === true}
              aria-label={`Ukryty: ${row.name}`}
              onChange={(e) => void patch(row, { hidden: e.target.checked ? true : undefined })}
            />
            ukryty
          </label>
          <PriceOverride row={row} onCommit={(price) => void patch(row, { price })} />
        </li>
      ))}
    </ul>
  );
}

function PriceOverride({
  row,
  onCommit,
}: {
  row: MerchantShelfRowView;
  onCommit: (price: number | undefined) => void;
}) {
  const [draft, setDraft] = useState(
    row.priceOverride === undefined ? '' : String(row.priceOverride),
  );
  useEffect(
    () => setDraft(row.priceOverride === undefined ? '' : String(row.priceOverride)),
    [row.priceOverride],
  );
  const commit = () => {
    if (draft.trim() === '') {
      if (row.priceOverride !== undefined) onCommit(undefined);
      return;
    }
    const value = Number.parseInt(draft, 10);
    if (!Number.isInteger(value) || value < 0) {
      setDraft(row.priceOverride === undefined ? '' : String(row.priceOverride));
      return;
    }
    if (value !== row.priceOverride) onCommit(value);
  };
  return (
    <input
      type="number"
      className="cp-shop-override"
      min={0}
      placeholder="cena"
      title="Własna cena za sztukę — wygrywa z katalogiem i nie mnoży się przez „Cena %”. Puste — katalog."
      aria-label={`Własna cena: ${row.name}`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
}
