import { useEffect, useRef, useState } from 'react';
import type { CpredItemViewWire, ExchangeCounterpartView, InventoryItemRefWire } from '@vtt/shared';
import { CONTAINER_LOCK_LABELS, CPRED_ITEM_LIST_LABELS } from '@vtt/shared';
import {
  inventoryErrorText,
  openContainer,
  putIntoContainer,
  takeInventory,
} from '../../socket.js';
import { clearNotices, notifyInfo, notifyRefusal } from '../../notices.js';
import { useCharacterStore } from '../../stores/characterStore.js';
import { useTokenStore } from '../../stores/tokenStore.js';
import { takeCallCup } from '../../call-cup.js';
import { ItemViewIcon } from '../ItemIcons.js';
import { clampQty, formatEd, itemDetail, itemKey, refOf } from './items.js';
import { OwnInventoryColumn } from './OwnInventoryColumn.js';

/**
 * Tryb `container` okna „Wymiana” (etap 46b2, wzór: *Container* z Item Piles).
 *
 * Skrzynia, bagażnik, schowek albo „Stos” z upuszczenia. Zawartość przychodzi
 * z serwera **tylko otwartego** pojemnika (`exchange:counterparts`, decyzja
 * MG 14) — nieotwarty pokazuje sam stan zamka i drogę do otwarcia:
 *
 *  - zamknięty — „Otwórz” jednym kliknięciem;
 *  - na zamek — „Otwórz kluczem”, gdy klucz leży na karcie, a bez niego
 *    „Otwórz zamek”: serwer wystawia wezwanie do Testu wybranej Umiejętności
 *    z PT od MG i kubek otwiera się od razu; jedna próba na postać (decyzja MG
 *    z 09.10), potem „spróbować znowu” pozwala tylko MG.
 *
 * Otwarty bierze i wkłada od ręki każdy w zasięgu ręki: „←” / „Zabierz
 * wszystko” z pojemnika, „→” albo przeciągnięcie do pojemnika z mojej karty.
 * Cudza karta nie jedzie do gracza, więc lista odświeża się po każdej zmianie
 * figury pojemnika (serwer rozsyła ją po każdym zapisie karty pojemnika).
 */
export function ContainerPane({
  anchorId,
  container,
  onChanged,
}: {
  anchorId: string;
  container: ExchangeCounterpartView;
  onChanged: () => void;
}) {
  const anchor = useCharacterStore((s) => s.characters[anchorId]);
  const registry = useCharacterStore((s) => s.registry);
  const token = useTokenStore((s) => (container.tokenId ? s.tokens[container.tokenId] : undefined));
  const [qty, setQty] = useState<Record<string, string>>({});
  const [money, setMoney] = useState('');
  const [busy, setBusy] = useState(false);
  const [skillId, setSkillId] = useState<string>(container.lockSkills?.[0] ?? '');
  const [hover, setHover] = useState<string | null>(null);

  // Każdy zapis karty pojemnika (ktoś coś włożył, zamek puścił po Teście)
  // przychodzi jako nowa figura — wtedy lista ma przyjść od nowa. Pierwsze
  // przejście pomijamy: listę dopiero co przyniosło otwarcie okna.
  const seen = useRef(token);
  useEffect(() => {
    if (seen.current === token) return;
    seen.current = token;
    onChanged();
  }, [token, onChanged]);

  const lock = container.lock ?? 'open';
  const isOpen = lock === 'open';
  const items = container.items ?? [];
  const purse = container.eddies ?? 0;
  const skills = container.lockSkills ?? [];
  const skillName = (id: string) => registry.skills.find((skill) => skill.id === id)?.name ?? id;

  async function open() {
    if (!container.tokenId) return;
    setBusy(true);
    const ack = await openContainer({
      tokenId: container.tokenId,
      characterId: anchorId,
      ...(lock === 'locked' && !container.hasKey && skillId ? { skillId } : {}),
    });
    setBusy(false);
    if (!ack.ok || !ack.data) {
      notifyRefusal('exchange', inventoryErrorText(ack.ok ? 'BAD_REQUEST' : ack.error));
      return;
    }
    clearNotices('exchange');
    if (ack.data.outcome === 'open') {
      onChanged();
      return;
    }
    notifyInfo('Test zamka — rzuć kubkiem. Wezwanie czeka też na czacie.', {
      title: 'Test zamka',
      topic: 'exchange',
    });
    if (ack.data.callMessageId !== undefined) takeCallCup(ack.data.callMessageId);
  }

  async function take(refs: InventoryItemRefWire[], eddies: number) {
    if (!container.tokenId) return;
    setBusy(true);
    const ack = await takeInventory({
      fromTokenId: container.tokenId,
      toCharacterId: anchorId,
      items: refs,
      ...(eddies > 0 ? { eddies } : {}),
    });
    setBusy(false);
    if (!ack.ok) {
      notifyRefusal('exchange', inventoryErrorText(ack.error));
      return;
    }
    setQty({});
    setMoney('');
    notifyInfo(`Zabrane na kartę: ${anchor?.name ?? 'twoja karta'}.`, { topic: 'exchange' });
    onChanged();
  }

  async function put(refs: InventoryItemRefWire[], eddies: number) {
    if (!container.tokenId) return;
    setBusy(true);
    const ack = await putIntoContainer({
      fromCharacterId: anchorId,
      tokenId: container.tokenId,
      items: refs,
      ...(eddies > 0 ? { eddies } : {}),
    });
    setBusy(false);
    if (!ack.ok) {
      notifyRefusal('exchange', inventoryErrorText(ack.error));
      return;
    }
    notifyInfo(`Włożone: ${container.name}.`, { topic: 'exchange' });
    onChanged();
  }

  function refFor(item: CpredItemViewWire): InventoryItemRefWire {
    return refOf(item, item.stackable ? clampQty(qty[itemKey(item)], item.qty) : item.qty);
  }

  return (
    <>
      <div className="exchange-columns exchange-columns--two">
        <OwnInventoryColumn
          anchorId={anchorId}
          busy={busy}
          {...(isOpen ? { putZone: 'container', onPut: (r, e) => void put(r, e) } : {})}
          onHoverZone={setHover}
        />

        <div
          className={`trade-zone container-zone${hover === 'container' ? ' trade-zone--hover' : ''}`}
          data-exchange-drop={isOpen ? 'container' : undefined}
          data-container-lock={lock}
        >
          <p className="trade-column-title">
            📦 {container.name}
            <span className="container-lock-state"> — {CONTAINER_LOCK_LABELS[lock]}</span>
          </p>

          {!isOpen && (
            <div className="container-lock">
              {lock === 'closed' && (
                <button
                  type="button"
                  className="small-button small-button--primary"
                  disabled={busy}
                  onClick={() => void open()}
                >
                  Otwórz
                </button>
              )}
              {lock === 'locked' && container.hasKey && (
                <button
                  type="button"
                  className="small-button small-button--primary"
                  disabled={busy}
                  title="Klucz leży na twojej karcie — zamek puszcza bez Testu"
                  onClick={() => void open()}
                >
                  🔑 Otwórz kluczem
                </button>
              )}
              {lock === 'locked' && !container.hasKey && container.lockTried && (
                <p className="inventory-hint">
                  Ta postać już próbowała i zamek nie puścił. Spróbować znowu pozwala MG — albo
                  zdobądź klucz.
                </p>
              )}
              {lock === 'locked' && !container.hasKey && !container.lockTried && (
                <>
                  {skills.length > 1 && (
                    <label className="container-skill">
                      Umiejętność
                      <select
                        value={skillId}
                        aria-label="Umiejętność Testu zamka"
                        onChange={(e) => setSkillId(e.target.value)}
                      >
                        {skills.map((id) => (
                          <option key={id} value={id}>
                            {skillName(id)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button
                    type="button"
                    className="small-button small-button--primary"
                    disabled={busy}
                    title={`Test: ${skillName(skillId || skills[0] || '')} — jedna próba na postać`}
                    onClick={() => void open()}
                  >
                    Otwórz zamek
                  </button>
                </>
              )}
              <p className="inventory-hint">Zawartość zobaczysz dopiero po otwarciu.</p>
            </div>
          )}

          {isOpen && items.length === 0 && purse === 0 && <p className="inventory-empty">Pusto.</p>}
          {isOpen && (
            <ul className="inventory-list">
              {items.map((item) => (
                <li key={itemKey(item)} className="inventory-row">
                  <button
                    type="button"
                    className="small-button"
                    disabled={busy}
                    title="Weź na swoją kartę"
                    aria-label={`Weź: ${item.name}`}
                    onClick={() => void take([refFor(item)], 0)}
                  >
                    ←
                  </button>
                  <ItemViewIcon item={item} />
                  <span className="inventory-row-name" title={CPRED_ITEM_LIST_LABELS[item.list]}>
                    {item.name}
                  </span>
                  <span className="inventory-row-detail">{itemDetail(item) || item.detail}</span>
                  {item.stackable && item.qty > 1 && (
                    <input
                      type="number"
                      className="inventory-row-qty"
                      min={1}
                      max={item.qty}
                      placeholder={String(item.qty)}
                      aria-label={`Ile sztuk wziąć: ${item.name}`}
                      value={qty[itemKey(item)] ?? ''}
                      onChange={(e) =>
                        setQty((current) => ({ ...current, [itemKey(item)]: e.target.value }))
                      }
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
          {isOpen && purse > 0 && (
            <div className="inventory-money">
              <button
                type="button"
                className="small-button"
                disabled={busy}
                title="Weź eurodolce — zostawia wpis w historii karty"
                aria-label="Weź eurodolce"
                onClick={() => void take([], clampQty(money, purse))}
              >
                ←
              </button>
              <span className="inventory-row-name">Gotówka</span>
              <span className="inventory-row-detail">{formatEd(purse)}</span>
              <input
                type="number"
                className="inventory-row-qty"
                min={1}
                max={purse}
                placeholder={String(purse)}
                aria-label="Ile eurodolców wziąć"
                value={money}
                onChange={(e) => setMoney(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      <div className="trade-footer">
        <p className="inventory-hint">
          {isOpen
            ? 'Otwarty pojemnik — bierze i wkłada każdy, kto stoi obok. Wiersz przeciągnięty na mapę kładzie się na ziemi.'
            : 'Wiersz przeciągnięty na mapę kładzie się na ziemi obok ciebie.'}
        </p>
        {isOpen && (
          <div className="inventory-actions">
            <button
              type="button"
              className="small-button small-button--primary"
              disabled={busy || (items.length === 0 && purse === 0)}
              title="Wyjmij wszystko naraz, razem z gotówką"
              onClick={() =>
                void take(
                  items.map((item) => refOf(item)),
                  purse,
                )
              }
            >
              Zabierz wszystko
            </button>
          </div>
        )}
      </div>
    </>
  );
}
