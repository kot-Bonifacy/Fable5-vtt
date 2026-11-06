import { readCpredVehicle, type VehicleView } from '@vtt/shared';
import { useCharacterStore } from '../stores/characterStore.js';
import { useVehicleStore } from '../stores/vehicleStore.js';

/**
 * Auto bokiem, przodem w lewo — jak na wystawie (06.11, MG: „lepsza widoczność
 * kupowanych i posiadanych pojazdów”). Grafiki pojazdów są rysowane przodem do
 * góry dla pościgu, więc tu obraca je CSS. Trzy rozmiary: wiersz listy
 * Kompendium, karta pojazdu (oferta, „Pojazdy” na karcie postaci) i duży
 * podgląd wpisu Kompendium. Bez grafiki (motocykl z bryły) — ikona.
 */
export function VehicleArt({
  url,
  size,
  wrecked = false,
}: {
  url: string | null;
  size: 'row' | 'card' | 'hero';
  wrecked?: boolean;
}) {
  return (
    <span
      className={`vehicle-art vehicle-art--${size}${wrecked ? ' vehicle-art--wrecked' : ''}`}
      aria-hidden="true"
    >
      {url ? <img src={url} alt="" draggable={false} /> : <span>🏍</span>}
    </span>
  );
}

/**
 * Auta tego modelu w garażach kart, które klient widzi (gracz — swoich, MG —
 * wszystkich): nazwy właścicieli, po jednej na auto. Pusta lista — nikt go nie ma.
 */
export function useModelOwners(entryId: string): string[] {
  const vehicles = useVehicleStore((s) => s.vehicles);
  const characters = useCharacterStore((s) => s.characters);
  return Object.values(vehicles)
    .filter(
      (vehicle: VehicleView) =>
        vehicle.ownerCharacterId !== null && readCpredVehicle(vehicle.system).catalogId === entryId,
    )
    .map((vehicle) => characters[vehicle.ownerCharacterId!]?.name ?? 'postać');
}
