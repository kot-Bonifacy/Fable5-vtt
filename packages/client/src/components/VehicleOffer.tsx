import { useEffect, useState } from 'react';
import { cpredHaggledPrice, readCpredVehicle } from '@vtt/shared';
import { clearNotices, notifyInfo, notifyRefusal } from '../notices.js';
import { buyVehicle, vehicleBuyErrorText } from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useVehicleStore } from '../stores/vehicleStore.js';
import { VehicleArt } from './VehicleArt.js';
import { formatEd } from './exchange/items.js';

/**
 * Auto do kupienia (etap 67, zlecenie MG z 06.11.2026) — jedna karta oferty
 * dla Kompendium i salonu handlarza: miniatura modelu bokiem, nazwa, liczby
 * klasy i „Kup — N ed”. Auto kosztuje tyle, co kilka miesięcy czynszu, więc
 * przycisk pyta drugi raz („Na pewno? N ed”) zamiast płacić od pierwszego
 * kliknięcia. Cenę z targiem Fixera liczy tak samo jak serwer
 * (`cpredHaggledPrice` po cenie katalogu albo lady).
 */
export function VehicleOffer({
  characterId,
  entryId,
  name,
  art,
  detail,
  listed,
  merchantId,
  blockedHint,
}: {
  characterId: string;
  entryId: string;
  name: string;
  art: string;
  detail: string;
  /** Cena przed targiem: katalogu albo lady (z mnożnikiem handlarza). */
  listed: number;
  merchantId?: string;
  /** Powód, dla którego kupić się teraz nie da (walka, poziom, zamknięty sklep). */
  blockedHint?: string | null;
}) {
  const card = useCharacterStore((s) => s.characters[characterId]);
  const discount =
    card?.data.haggle && card.data.haggle.discount > 0 ? card.data.haggle.discount : 0;
  const price = cpredHaggledPrice(listed, discount);
  const wallet = card?.data.eddies ?? 0;
  // Ile aut tego modelu ta postać już ma (06.11) — drugi zakup ma być świadomy.
  const owned = useVehicleStore(
    (s) =>
      Object.values(s.vehicles).filter(
        (vehicle) =>
          vehicle.ownerCharacterId === characterId &&
          readCpredVehicle(vehicle.system).catalogId === entryId,
      ).length,
  );
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // Potwierdzenie gaśnie samo — nie czeka na kliknięcie godzinę później.
  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 5000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const short = card !== undefined && wallet < price;
  const hint =
    blockedHint ??
    (short ? `Za mało eurodolców — ${card?.name ?? 'postać'} ma ${formatEd(wallet)}.` : null);

  async function buy() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setBusy(true);
    const ack = await buyVehicle({
      characterId,
      entryId,
      expectPrice: price,
      ...(merchantId ? { merchantId } : {}),
    });
    setBusy(false);
    if (!ack.ok) {
      notifyRefusal(merchantId ? 'exchange' : 'character', vehicleBuyErrorText(ack.error));
      return;
    }
    clearNotices(merchantId ? 'exchange' : 'character');
    notifyInfo(
      `${name} — ${formatEd(ack.data?.price ?? price)}. Zostało ${formatEd(ack.data?.balance ?? wallet - price)}. Auto stoi w sekcji „Pojazdy” na karcie (Ekwipunek).`,
      { title: 'Kupione auto', topic: merchantId ? 'exchange' : 'character' },
    );
  }

  return (
    <li className="vehicle-offer" data-vehicle-offer={entryId}>
      <VehicleArt url={art} size="card" />
      <div className="vehicle-offer-body">
        <b className="vehicle-offer-name">{name}</b>
        <span className="vehicle-offer-detail">{detail}</span>
        {owned > 0 ? (
          <span
            className="vehicle-owned-tag"
            title={`${card?.name ?? 'Postać'} ma już ${owned === 1 ? 'to auto' : `${owned} takie auta`} — stoi w sekcji „Pojazdy” na karcie (Ekwipunek).`}
          >
            W garażu{owned > 1 ? ` ×${owned}` : ''}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        className={`small-button vehicle-offer-buy${confirming ? ' vehicle-offer-buy--confirm' : ''}`}
        disabled={busy || hint !== null}
        title={
          hint ??
          (discount > 0
            ? `Cena ${formatEd(listed)} − ${discount}% z dobitego targu`
            : 'Cena schodzi z konta postaci, a auto ląduje w sekcji „Pojazdy” na karcie.')
        }
        onClick={() => void buy()}
        onBlur={() => setConfirming(false)}
      >
        {confirming ? `Na pewno? ${formatEd(price)}` : `Kup — ${formatEd(price)}`}
      </button>
    </li>
  );
}
