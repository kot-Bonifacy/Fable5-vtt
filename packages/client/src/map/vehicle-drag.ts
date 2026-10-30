import type { DragEvent } from 'react';

/**
 * Auto przeciągane z okna „Pojazdy” MG na drogę sceny pościgu (etap 65b) —
 * ta sama droga HTML5 drag-and-drop, którą panel stawia żetony
 * (`token-drag.ts`), tylko z id pojazdu kampanii zamiast żetonu.
 */
export const VEHICLE_DRAG_MIME = 'application/x-vtt-vehicle';

export function startVehicleDrag(event: DragEvent<HTMLElement>, vehicleId: string): void {
  event.dataTransfer.setData(VEHICLE_DRAG_MIME, vehicleId);
  event.dataTransfer.effectAllowed = 'copy';
}

/** W `dragover` widać tylko typy danych — stąd osobne pytanie o rodzaj. */
export function isVehicleDrag(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes(VEHICLE_DRAG_MIME);
}

export function readVehicleDrag(event: DragEvent<HTMLElement>): string | null {
  const id = event.dataTransfer.getData(VEHICLE_DRAG_MIME);
  return id.length > 0 ? id : null;
}
