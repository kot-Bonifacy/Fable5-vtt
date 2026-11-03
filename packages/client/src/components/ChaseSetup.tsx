import { useEffect, useState, type ChangeEvent, type RefObject } from 'react';
import type { ChaseDirection, MapUploadResult, SceneView, VehicleView } from '@vtt/shared';
import {
  CHASE_DIRECTIONS,
  CHASE_DIRECTION_LABELS,
  CHASE_ROADS,
  CHASE_TEMPO_MAX,
  CHASE_TEMPO_MIN,
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  UPLOAD_ACCEPT_ATTRIBUTE,
  chaseFreeSpot,
  chaseIsHorizontal,
  chaseRoadByUrl,
  chaseRoadCells,
  chaseRoadPatch,
  defaultChaseDirection,
  defaultVehicleArt,
  uploadRequirementText,
} from '@vtt/shared';
import { apiUpload } from '../api.js';
import { noteAck } from '../notices.js';
import { placeChaseVehicle, removeChaseVehicle } from '../socket.js';
import { useChaseStore } from '../stores/chaseStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { useVehicleStore } from '../stores/vehicleStore.js';
import { fileRejectionText, uploadErrorText } from '../uploads.js';
import { chaseErrorText } from './ChaseVehicleMenu.js';
import { Segmented } from './Segmented.js';
import { AddFromCatalog } from './VehiclePanel.js';

/**
 * Sekcje ustawień sceny pościgu (zlecenie MG z 03.11) — te same w kreatorze
 * (`ChaseWizard`) i na zakładce „Pościg” Edycji sceny. Wszystko poza autami
 * pisze do szkicu sceny (`patchDraft`), więc mapa pokazuje zmianę od razu,
 * a utrwala ją „Zapisz” albo przejście kreatora dalej. Auta stoją na serwerze
 * (`chase:place`), więc ich sekcja czyta zapisaną scenę.
 */

/**
 * Cała scena w kadrze obok okna przy prawej krawędzi mapy (kreator pościgu,
 * 03.11): po wyborze drogi (i przy każdej zmianie `trigger`) okno nie zasłania
 * jezdni ani aut stawianych na jej środku. Klatka zwłoki, bo nowe tło i rozmiar
 * sceny muszą najpierw dojść do renderera.
 */
export function useFrameBesideWindow(
  element: RefObject<HTMLElement | null>,
  backgroundUrl: string | null,
  trigger?: unknown,
): void {
  const requestFrame = useSceneStore((s) => s.requestFrame);
  useEffect(() => {
    if (!backgroundUrl) return;
    const timer = window.setTimeout(() => {
      const map = document.querySelector('.map-area')?.getBoundingClientRect();
      const box = element.current?.getBoundingClientRect();
      const inset = map && box && box.left > map.left ? Math.max(0, map.right - box.left) : 0;
      requestFrame(inset);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [backgroundUrl, trigger, element, requestFrame]);
  // Okno zamknięte — kamera wraca do zwykłej granicy, kadr zostaje.
  useEffect(() => () => requestFrame(0, false), [requestFrame]);
}

function sceneGrid(scene: SceneView) {
  return {
    width: scene.width,
    height: scene.height,
    gridSizePx: scene.grid.sizePx,
    gridOffsetX: scene.grid.offsetX,
    gridOffsetY: scene.grid.offsetY,
  };
}

/** Miniatura tła wgranego przez MG — podgląd z serwera zamiast całej mapy. */
function ownThumb(url: string): string {
  return url.startsWith('/uploads/') ? `${url}?preview` : url;
}

/**
 * Wybór drogi: cztery wbudowane (tło, pas, kierunek i skala jednym klikiem)
 * i „Własna mapa” — MG wgrywa swoją grafikę (uwaga MG z 03.11).
 */
export function ChaseRoadPicker({ scene }: { scene: SceneView }) {
  const patchDraft = useSceneStore((s) => s.patchDraft);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const builtIn = chaseRoadByUrl(scene.background?.url);
  const own = scene.background && !builtIn ? scene.background : null;

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const rejection = fileRejectionText(file, 'map');
    if (rejection) {
      setError(rejection);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const result = await apiUpload<MapUploadResult>('/api/uploads/maps', file);
      // Własna mapa: kierunek z proporcji, pas na całą szerokość — MG zawęzi
      // go uchwytami na mapie w następnym kroku.
      patchDraft({
        background: result,
        width: result.width,
        height: result.height,
        chase: { direction: defaultChaseDirection(result.width, result.height), road: null },
      });
    } catch (err) {
      setError(uploadErrorText(err, 'map'));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="chase-road-picker">
      <ul className="chase-road-grid" role="radiogroup" aria-label="Droga">
        {CHASE_ROADS.map((preset) => {
          const active = builtIn?.id === preset.id;
          return (
            <li key={preset.id}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                className={`chase-road-tile${active ? ' is-active' : ''}`}
                title={preset.hint}
                onClick={() => patchDraft(chaseRoadPatch(preset))}
              >
                <img src={preset.thumbUrl} alt="" loading="lazy" />
                <span className="chase-road-name">{preset.label}</span>
              </button>
            </li>
          );
        })}
        <li>
          <label
            className={`chase-road-tile chase-road-tile--own${own ? ' is-active' : ''}`}
            title={`Twoja grafika drogi. ${uploadRequirementText('map')}`}
          >
            {own ? (
              <img src={ownThumb(own.url)} alt="" />
            ) : (
              <span className="chase-road-plus" aria-hidden>
                ＋
              </span>
            )}
            <span className="chase-road-name">
              {uploading ? 'Wgrywanie…' : own ? 'Własna mapa · zmień' : 'Wgraj własną mapę'}
            </span>
            <input
              type="file"
              accept={UPLOAD_ACCEPT_ATTRIBUTE}
              onChange={(e) => void upload(e)}
              disabled={uploading}
              hidden
            />
          </label>
        </li>
      </ul>
      {error && <p className="auth-error">{error}</p>}
      <p className="settings-hint">
        {builtIn
          ? `${builtIn.hint} Pas jezdni, kierunek i skala (1 m na kratkę) są już ustawione.`
          : own
            ? 'Własna mapa zapętla się sama (szew chowa kod). Kierunek wzięty z proporcji obrazu — sprawdź go, pas jezdni i rozmiar kratki w następnych polach.'
            : 'Wybierz gotową drogę albo wgraj swoją mapę — droga przewija się pod autami w kółko.'}
      </p>
    </div>
  );
}

/** Kierunek jazdy, tempo i „Droga jedzie”. */
export function ChaseDriveSection({ scene }: { scene: SceneView }) {
  const patchDraft = useSceneStore((s) => s.patchDraft);
  const builtIn = chaseRoadByUrl(scene.background?.url);
  const across =
    builtIn && chaseIsHorizontal(builtIn.direction) !== chaseIsHorizontal(scene.chase.direction);
  return (
    <section className="settings-group">
      <h3 className="settings-group-title">Jazda</h3>
      <Segmented<ChaseDirection>
        label="Kierunek jazdy"
        options={CHASE_DIRECTIONS.map((id) => ({
          id,
          label: CHASE_DIRECTION_LABELS[id],
          hint: `Auta jadą ${CHASE_DIRECTION_LABELS[id]}, a droga przewija się w przeciwną stronę.`,
        }))}
        value={scene.chase.direction}
        onChange={(direction) => patchDraft({ chase: { direction } })}
      />
      {across && (
        <p className="settings-hint scene-config-warn">
          Ta droga biegnie poziomo — przy jeździe w pionie auta pojadą w poprzek jezdni.
        </p>
      )}
      <div
        className="settings-row"
        title="Ruch pościgu: tempo / 4 kratek na rundę. Tyle jedzie droga, a w walce auto wolniejsze od tempa traci dystans."
      >
        <label className="settings-label" htmlFor="chase-tempo">
          Tempo (Ruch)
        </label>
        <input
          id="chase-tempo"
          type="number"
          className="scene-number-input"
          min={CHASE_TEMPO_MIN}
          max={CHASE_TEMPO_MAX}
          step={5}
          value={scene.chase.tempo}
          onChange={(e) => patchDraft({ chase: { tempo: Number(e.target.value) } })}
        />
        <span className="scene-config-unit">{scene.chase.tempo / 4} kratek / rundę</span>
      </div>
      <label className="settings-row settings-row--switch">
        <input
          type="checkbox"
          checked={scene.chase.running}
          onChange={(e) => patchDraft({ chase: { running: e.target.checked } })}
        />
        <span>Droga jedzie</span>
      </label>
    </section>
  );
}

/**
 * Pas jezdni w kratkach od krawędzi sceny (65b), w poprzek kierunku jazdy.
 * Od 03.11 krawędzie przeciąga się też wprost na mapie — liczby zostają jako
 * zapas i odczyt, a uchwyty włącza otwarta zakładka albo krok kreatora.
 */
export function ChaseRoadSection({ scene }: { scene: SceneView }) {
  const patchDraft = useSceneStore((s) => s.patchDraft);
  const road = scene.chase.road;
  const horizontal = chaseIsHorizontal(scene.chase.direction);
  const cells = chaseRoadCells(scene.chase.direction, sceneGrid(scene));
  const onChange = (next: { from: number; to: number } | null) =>
    patchDraft({ chase: { road: next } });
  const set = (from: number, to: number) => {
    const a = Math.max(0, Math.min(cells - 1, Math.round(from)));
    const b = Math.max(a + 1, Math.min(cells, Math.round(to)));
    onChange({ from: a, to: b });
  };
  const span = road ?? { from: 0, to: cells };
  return (
    <section className="settings-group">
      <h3 className="settings-group-title">Pas jezdni</h3>
      <p className="settings-hint chase-band-hint">
        Przeciągnij {horizontal ? 'górną i dolną' : 'lewą i prawą'} krawędź pasa na mapie
        (bursztynowe linie z uchwytami). Poza pasem auto nie wjedzie; jezdnia ma teraz{' '}
        {span.to - span.from} kratek.
      </p>
      <label
        className="settings-row settings-row--switch"
        title="Auta mogą stanąć wszędzie w poprzek sceny."
      >
        <input
          type="checkbox"
          checked={road === null}
          onChange={(e) => (e.target.checked ? onChange(null) : set(span.from, span.to))}
        />
        <span>Cała szerokość sceny</span>
      </label>
      <div
        className="settings-row"
        title={`${horizontal ? 'Wiersze' : 'Kolumny'} kratek liczone od ${horizontal ? 'górnej' : 'lewej'} krawędzi sceny (od 0) — pierwsza zajęta przez jezdnię i pierwsza za nią.`}
      >
        <label className="settings-label" htmlFor="chase-road-from">
          {horizontal ? 'Wiersze' : 'Kolumny'}
        </label>
        <input
          id="chase-road-from"
          type="number"
          className="scene-number-input"
          aria-label="Pas jezdni od kratki"
          min={0}
          max={cells - 1}
          value={span.from}
          onChange={(e) => set(Number(e.target.value), span.to)}
        />
        <span className="scene-config-unit">–</span>
        <input
          type="number"
          className="scene-number-input"
          aria-label="Pas jezdni do kratki"
          min={1}
          max={cells}
          value={span.to}
          onChange={(e) => set(span.from, Number(e.target.value))}
        />
        <span className="scene-config-unit">z {cells}</span>
      </div>
    </section>
  );
}

/**
 * Rozmiar kratki na własnej mapie: auto ma 3×5 kratek, więc kratka mówi, jak
 * duże jest auto względem jezdni. Wbudowane drogi mają ją ustawioną.
 */
export function ChaseGridSection({ scene }: { scene: SceneView }) {
  const patchDraft = useSceneStore((s) => s.patchDraft);
  if (chaseRoadByUrl(scene.background?.url)) return null;
  const size = Math.round(scene.grid.sizePx * 10) / 10;
  const horizontal = chaseIsHorizontal(scene.chase.direction);
  const laneCells = Math.floor((horizontal ? scene.height : scene.width) / scene.grid.sizePx);
  return (
    <section className="settings-group">
      <h3 className="settings-group-title">Skala</h3>
      <div
        className="settings-row"
        title="Bok kratki w pikselach obrazu. Kompakt ma 3×5 kratek — dobierz kratkę tak, żeby auto zajmowało jeden pas ruchu na Twojej mapie."
      >
        <label className="settings-label" htmlFor="chase-grid-size">
          Kratka
        </label>
        <input
          id="chase-grid-size"
          type="number"
          className="scene-number-input"
          min={GRID_SIZE_MIN}
          max={GRID_SIZE_MAX}
          step="any"
          value={size}
          onChange={(e) => patchDraft({ grid: { sizePx: Number(e.target.value) } })}
        />
        <span className="scene-config-unit">px</span>
      </div>
      <p className="settings-hint">
        Scena ma {laneCells} kratek w poprzek, 1 m na kratkę. Auto ma szerokość 3 kratek — pas ruchu
        na mapie powinien mieć ich 3–4.
      </p>
    </section>
  );
}

function VehicleRow({
  vehicle,
  owner,
  placed,
  disabled,
  onPlace,
  onRemove,
}: {
  vehicle: VehicleView;
  owner: string | null;
  placed: boolean;
  disabled: boolean;
  onPlace: () => void;
  onRemove: () => void;
}) {
  const art = vehicle.imageUrl ?? defaultVehicleArt(vehicle.layout);
  return (
    <li className={`chase-car-row${placed ? ' is-placed' : ''}`} data-vehicle-id={vehicle.id}>
      <span className="chase-car-thumb" aria-hidden>
        {art ? <img src={art} alt="" /> : '🏍'}
      </span>
      <span className="chase-car-text">
        <b>{vehicle.name}</b>
        {owner && <span className="chase-car-owner">{owner}</span>}
      </span>
      {placed ? (
        <>
          <span className="chase-car-tag">Na drodze</span>
          <button
            type="button"
            className="small-button"
            title="Zdejmuje auto z drogi — figury z foteli zostają tam, gdzie siedziały"
            disabled={disabled}
            onClick={onRemove}
          >
            Zdejmij
          </button>
        </>
      ) : (
        <button
          type="button"
          className="small-button"
          title="Stawia auto na wolnym miejscu jezdni — obok tych, które już stoją"
          disabled={disabled}
          onClick={onPlace}
        >
          Na drogę
        </button>
      )}
    </li>
  );
}

/**
 * Auta na drodze: pojazdy drużyny (z kart) i MG/NPC-ów, „Na drogę” stawia
 * auto na pierwszym wolnym miejscu jezdni (`chaseFreeSpot`), a wóz wroga
 * MG dokłada z katalogu bez wychodzenia z okna.
 */
export function ChaseVehiclesSection({ blockedReason }: { blockedReason?: string | null }) {
  const saved = useSceneStore((s) => (s.scene?.kind === 'chase' ? s.scene : null));
  const all = useVehicleStore((s) => s.vehicles);
  const characters = useCharacterStore((s) => s.characters);
  const onRoad = useChaseStore((s) => s.vehicles);
  const [busy, setBusy] = useState(false);
  if (!saved) return null;
  const scene = saved;

  const placedIds = new Set(onRoad.map((row) => row.vehicleId));
  const vehicles = Object.values(all).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  const party = vehicles.filter((vehicle) => vehicle.ownerCharacterId !== null);
  const loose = vehicles.filter((vehicle) => vehicle.ownerCharacterId === null);
  const disabled = busy || Boolean(blockedReason);

  async function place(vehicle: VehicleView) {
    setBusy(true);
    const spot = chaseFreeSpot(
      vehicle,
      onRoad
        .filter((row) => row.status === 'racing')
        .map((row) => ({ x: row.x, y: row.y, widthSq: row.widthSq, lengthSq: row.lengthSq })),
      scene.chase,
      sceneGrid(scene),
    );
    const ack = await placeChaseVehicle({
      sceneId: scene.id,
      vehicleId: vehicle.id,
      x: spot.x,
      y: spot.y,
    });
    noteAck('chase', ack, chaseErrorText);
    setBusy(false);
  }

  async function remove(vehicle: VehicleView) {
    const row = onRoad.find((entry) => entry.vehicleId === vehicle.id);
    if (!row) return;
    setBusy(true);
    noteAck('chase', await removeChaseVehicle(row.id), chaseErrorText);
    setBusy(false);
  }

  const rows = (list: VehicleView[]) =>
    list.map((vehicle) => (
      <VehicleRow
        key={vehicle.id}
        vehicle={vehicle}
        owner={
          vehicle.ownerCharacterId ? (characters[vehicle.ownerCharacterId]?.name ?? null) : null
        }
        placed={placedIds.has(vehicle.id)}
        disabled={disabled}
        onPlace={() => void place(vehicle)}
        onRemove={() => void remove(vehicle)}
      />
    ));

  return (
    <section className="settings-group chase-cars">
      <h3 className="settings-group-title">
        Auta na drodze <span className="chase-cars-count">{onRoad.length}</span>
      </h3>
      {blockedReason && <p className="settings-hint scene-config-warn">{blockedReason}</p>}
      <h4 className="chase-cars-heading">Drużyna</h4>
      {party.length > 0 ? (
        <ul className="chase-car-list">{rows(party)}</ul>
      ) : (
        <p className="settings-hint">
          Żadna postać nie ma pojazdu. MG daje go na karcie (Ekwipunek → Pojazdy) albo w zakładce
          „Pojazdy”.
        </p>
      )}
      <h4 className="chase-cars-heading">MG i NPC-e</h4>
      {loose.length > 0 && <ul className="chase-car-list">{rows(loose)}</ul>}
      <AddFromCatalog ownerCharacterId={null} />
      <p className="settings-hint">
        Auto przestawisz przeciągnięciem po drodze. Figury sadzasz, upuszczając je na fotel; gracze
        siadają sami, klikając wolny fotel.
      </p>
    </section>
  );
}
