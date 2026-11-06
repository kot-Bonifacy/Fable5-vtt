import { useEffect, useState } from 'react';
import {
  CPRED_VEHICLE_DAMAGE,
  CPRED_VEHICLE_UPGRADE_BUY_PROBLEMS,
  cpredHaggledPrice,
  cpredVehicleDerived,
  cpredVehicleRepairQuote,
  cpredVehicleUpgrade,
  cpredVehicleUpgradeBuyProblem,
  readCpredVehicle,
  type CharacterView,
  type MerchantVehicleUpgradeOfferView,
  type VehicleUpgradeEntry,
  type VehicleView,
} from '@vtt/shared';
import { clearNotices, notifyInfo, notifyRefusal } from '../notices.js';
import { buyVehicleUpgrade, repairVehicle, vehicleWorkshopErrorText } from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useVehicleStore, vehiclesOf } from '../stores/vehicleStore.js';
import { formatEd } from './exchange/items.js';

/**
 * Warsztat (etap 68, zlecenie MG z 06.11.2026): ulepszenie kupione do
 * własnego auta i naprawa auta za eurodolary. Jedna oferta ulepszenia dla
 * Kompendium i warsztatu handlarza, jak `VehicleOffer` dla aut — drugie
 * kliknięcie potwierdza („Na pewno? N ed”), bo ulepszenie kosztuje 3000
 * albo 15 000 ed. Reguły montażu i cenę naprawy liczą te same funkcje
 * `shared`, co serwer (`cpredVehicleUpgradeBuyProblem`, `cpredVehicleRepairQuote`).
 */

/** Pojazdy karty z magazynu — gracz dostaje tylko swoje, MG wszystkie. */
export function useCharacterVehicles(characterId: string): VehicleView[] {
  const all = useVehicleStore((s) => s.vehicles);
  return vehiclesOf(all, characterId);
}

/** Targ Fixera i portfel karty — cena przycisku liczy się tak samo jak na serwerze. */
function useWallet(characterId: string) {
  const card = useCharacterStore((s) => s.characters[characterId]);
  const discount =
    card?.data.haggle && card.data.haggle.discount > 0 ? card.data.haggle.discount : 0;
  return { card, discount, wallet: card?.data.eddies ?? 0 };
}

/** Przycisk z potwierdzeniem drugim kliknięciem, gasnącym po 5 s. */
function ConfirmPayButton({
  label,
  price,
  hint,
  title,
  onPay,
}: {
  label: string;
  price: number;
  hint: string | null;
  title: string;
  onPay: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 5000);
    return () => clearTimeout(timer);
  }, [confirming]);
  return (
    <button
      type="button"
      className={`small-button vehicle-offer-buy${confirming ? ' vehicle-offer-buy--confirm' : ''}`}
      disabled={busy || hint !== null}
      title={hint ?? title}
      onClick={() => {
        if (!confirming) {
          setConfirming(true);
          return;
        }
        setConfirming(false);
        setBusy(true);
        void onPay().finally(() => setBusy(false));
      }}
      onBlur={() => setConfirming(false)}
    >
      {confirming ? `Na pewno? ${formatEd(price)}` : `${label} — ${formatEd(price)}`}
    </button>
  );
}

/** Wybór auta, do którego idzie ulepszenie albo naprawa. */
export function VehicleChoice({
  vehicles,
  value,
  onChange,
}: {
  vehicles: readonly VehicleView[];
  value: string;
  onChange: (vehicleId: string) => void;
}) {
  return (
    <select value={value} aria-label="Auto" onChange={(event) => onChange(event.target.value)}>
      {vehicles.map((vehicle) => (
        <option key={vehicle.id} value={vehicle.id}>
          {vehicle.name}
          {readCpredVehicle(vehicle.system).fleetRowId ? ' (Tabor)' : ''}
        </option>
      ))}
    </select>
  );
}

/** Pierwsze auto spoza Taboru — tam zwykle idzie ulepszenie. */
export function defaultWorkshopVehicle(vehicles: readonly VehicleView[]): string {
  return (
    vehicles.find((vehicle) => !readCpredVehicle(vehicle.system).fleetRowId)?.id ??
    vehicles[0]?.id ??
    ''
  );
}

export function VehicleUpgradeOffer({
  characterId,
  vehicle,
  entryId,
  upgradeId,
  name,
  detail,
  listed,
  merchantId,
  blockedHint,
}: {
  characterId: string;
  vehicle: VehicleView | null;
  entryId: string;
  upgradeId: string;
  name: string;
  detail: string;
  /** Cena przed targiem: katalogu albo lady (z mnożnikiem handlarza). */
  listed: number;
  merchantId?: string;
  blockedHint?: string | null;
}) {
  const { card, discount, wallet } = useWallet(characterId);
  const price = cpredHaggledPrice(listed, discount);
  const upgrade = cpredVehicleUpgrade(upgradeId);
  const problem =
    vehicle && upgrade
      ? cpredVehicleUpgradeBuyProblem(readCpredVehicle(vehicle.system), upgrade.id)
      : null;
  const hint =
    blockedHint ??
    (!vehicle
      ? 'Postać nie ma auta — najpierw kup auto (Kompendium → Pojazdy albo salon handlarza).'
      : problem
        ? CPRED_VEHICLE_UPGRADE_BUY_PROBLEMS[problem]
        : card !== undefined && wallet < price
          ? `Za mało eurodolców — ${card.name} ma ${formatEd(wallet)}.`
          : null);

  async function pay() {
    if (!vehicle) return;
    const topic = merchantId ? 'exchange' : 'character';
    const ack = await buyVehicleUpgrade({
      characterId,
      vehicleId: vehicle.id,
      entryId,
      expectPrice: price,
      ...(merchantId ? { merchantId } : {}),
    });
    if (!ack.ok) {
      notifyRefusal(topic, vehicleWorkshopErrorText(ack.error));
      return;
    }
    clearNotices(topic);
    notifyInfo(
      `${name} siedzi w aucie ${vehicle.name} — ${formatEd(ack.data?.price ?? price)}. Zostało ${formatEd(ack.data?.balance ?? wallet - price)}.`,
      { title: 'Zamontowane', topic },
    );
  }

  return (
    <li className="vehicle-offer vehicle-upgrade-offer" data-vehicle-upgrade-offer={entryId}>
      <div className="vehicle-offer-body">
        <b className="vehicle-offer-name">{name}</b>
        <span className="vehicle-offer-detail">{detail}</span>
      </div>
      <ConfirmPayButton
        label="Kup i zamontuj"
        price={price}
        hint={hint}
        title={
          discount > 0
            ? `Cena ${formatEd(listed)} − ${discount}% z dobitego targu`
            : 'Cena schodzi z konta postaci, a ulepszenie od razu siedzi w aucie.'
        }
        onPay={pay}
      />
    </li>
  );
}

/** Jedno zdanie o stanie auta przy naprawie: „PUK 15/65 · Poważne uszkodzenia (1 dzień)”. */
function repairDetail(vehicle: VehicleView): string {
  const stats = readCpredVehicle(vehicle.system);
  const quote = cpredVehicleRepairQuote(stats);
  const hp = `PUK ${stats.hp}/${cpredVehicleDerived(stats).hpMax}`;
  if (!quote) return `${hp} · auto jest całe`;
  const band = CPRED_VEHICLE_DAMAGE[quote.damage];
  return [
    hp,
    quote.windows > 0 ? `szyby do wymiany: ${quote.windows}` : null,
    `${band.label} (${band.time})`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function VehicleRepairOffer({
  characterId,
  vehicle,
  merchantId,
  priceMul,
  blockedHint,
}: {
  characterId: string;
  vehicle: VehicleView;
  merchantId: string;
  priceMul: number;
  blockedHint?: string | null;
}) {
  const { card, discount, wallet } = useWallet(characterId);
  const quote = cpredVehicleRepairQuote(readCpredVehicle(vehicle.system), { priceMul, discount });
  const price = quote?.price ?? 0;
  const hint =
    blockedHint ??
    (!quote
      ? 'Auto jest całe — nie ma czego naprawiać.'
      : card !== undefined && wallet < price
        ? `Za mało eurodolców — ${card.name} ma ${formatEd(wallet)}.`
        : null);

  async function pay() {
    const ack = await repairVehicle({
      characterId,
      vehicleId: vehicle.id,
      merchantId,
      expectPrice: price,
    });
    if (!ack.ok) {
      notifyRefusal('exchange', vehicleWorkshopErrorText(ack.error));
      return;
    }
    clearNotices('exchange');
    notifyInfo(
      `Naprawione: ${vehicle.name} — ${formatEd(ack.data?.price ?? price)}. Zostało ${formatEd(ack.data?.balance ?? wallet - price)}.`,
      { title: 'Naprawa auta', topic: 'exchange' },
    );
  }

  return (
    <li className="vehicle-offer vehicle-upgrade-offer" data-vehicle-repair={vehicle.id}>
      <div className="vehicle-offer-body">
        <b className="vehicle-offer-name">Naprawa auta</b>
        <span className="vehicle-offer-detail">{repairDetail(vehicle)}</span>
      </div>
      {quote ? (
        <ConfirmPayButton
          label="Napraw"
          price={price}
          hint={hint}
          title="50 ed za każdy brakujący PUK (z mnożnikiem warsztatu), szyby w cenie. Auto wraca od razu."
          onPay={pay}
        />
      ) : null}
    </li>
  );
}

/**
 * Warsztat w oknie „Wymiana” (etap 68): pod salonem, u handlarza z kategorią
 * „Ulepszenia pojazdów”. Auto gracza wybiera się na górze — ulepszenie
 * i naprawa idą do niego.
 */
export function MerchantWorkshop({
  characterId,
  merchantId,
  offers,
  repairs,
  priceMul,
  blockedHint,
}: {
  characterId: string;
  merchantId: string;
  offers: readonly MerchantVehicleUpgradeOfferView[];
  repairs: boolean;
  priceMul: number;
  blockedHint: string | null;
}) {
  const vehicles = useCharacterVehicles(characterId);
  const [picked, setPicked] = useState('');
  const vehicleId = vehicles.some((vehicle) => vehicle.id === picked)
    ? picked
    : defaultWorkshopVehicle(vehicles);
  const vehicle = vehicles.find((row) => row.id === vehicleId) ?? null;
  // Ulepszenia, których w aucie tego rodzaju nie ma (zespolenie motocykla przy
  // pickupie), nie zajmują miejsca — reszta odmów zostaje wygaszona z powodem.
  const kind = vehicle ? readCpredVehicle(vehicle.system).kind : null;
  const fitting = offers.filter(
    (offer) => !kind || cpredVehicleUpgrade(offer.upgradeId)?.kinds.includes(kind) !== false,
  );
  if (offers.length === 0 && !repairs) return null;
  return (
    <section className="trade-salon trade-workshop" aria-label="Warsztat — ulepszenia i naprawa">
      <div className="trade-workshop-head">
        <p className="trade-column-title">Warsztat — ulepszenia i naprawa</p>
        {vehicles.length > 0 ? (
          <VehicleChoice vehicles={vehicles} value={vehicleId} onChange={setPicked} />
        ) : (
          <span className="vehicle-hint">Postać nie ma auta.</span>
        )}
      </div>
      <ul className="vehicle-offers">
        {repairs && vehicle ? (
          <VehicleRepairOffer
            characterId={characterId}
            vehicle={vehicle}
            merchantId={merchantId}
            priceMul={priceMul}
            blockedHint={blockedHint}
          />
        ) : null}
        {fitting.map((offer) => (
          <VehicleUpgradeOffer
            key={offer.entryId}
            characterId={characterId}
            vehicle={vehicle}
            entryId={offer.entryId}
            upgradeId={offer.upgradeId}
            name={offer.name}
            detail={offer.text}
            listed={offer.price}
            merchantId={merchantId}
            blockedHint={blockedHint}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * Kompendium (etap 68): „Kup i zamontuj” na karcie wpisu ulepszenia — dla
 * której postaci i do którego jej auta. Bramki poziomu i „tylko u
 * handlarzy” podaje karta wpisu w `blockedHint`, jak przy aucie.
 */
export function CompendiumUpgradeBuy({
  entry,
  targets,
  target,
  onTarget,
  listed,
  blockedHint,
}: {
  entry: VehicleUpgradeEntry;
  targets: readonly CharacterView[];
  target: string;
  onTarget: (characterId: string) => void;
  listed: number;
  blockedHint: string | null;
}) {
  const vehicles = useCharacterVehicles(target);
  const [picked, setPicked] = useState('');
  const vehicleId = vehicles.some((vehicle) => vehicle.id === picked)
    ? picked
    : defaultWorkshopVehicle(vehicles);
  const vehicle = vehicles.find((row) => row.id === vehicleId) ?? null;
  return (
    <div className="compendium-assign compendium-vehicle-buy">
      <select
        value={target}
        aria-label="Dla kogo ulepszenie"
        onChange={(event) => onTarget(event.target.value)}
      >
        {targets.map((character) => (
          <option key={character.id} value={character.id}>
            {character.name}
          </option>
        ))}
      </select>
      {vehicles.length > 0 ? (
        <VehicleChoice vehicles={vehicles} value={vehicleId} onChange={setPicked} />
      ) : null}
      <ul className="vehicle-offers">
        <VehicleUpgradeOffer
          characterId={target}
          vehicle={vehicle}
          entryId={entry.id}
          upgradeId={entry.upgradeId}
          name={entry.name}
          detail={vehicle ? `do auta: ${vehicle.name}` : 'postać nie ma auta'}
          listed={listed}
          blockedHint={blockedHint}
        />
      </ul>
    </div>
  );
}
