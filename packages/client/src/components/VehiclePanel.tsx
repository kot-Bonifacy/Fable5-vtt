import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  CPRED_VEHICLE_KINDS,
  CPRED_VEHICLE_KIND_LABELS,
  CPRED_VEHICLE_UPGRADE_PROBLEMS,
  ROLE_GM,
  VEHICLE_ART,
  VEHICLE_LAYOUT_IDS,
  VEHICLE_LAYOUT_LABELS,
  VEHICLE_SIZE_MAX,
  VEHICLE_SIZE_MIN,
  chaseFreeSpot,
  cpredVehicleDerived,
  cpredVehicleHpAfterUpgrades,
  cpredVehicleIsModel,
  cpredVehicleModelDetail,
  cpredVehicleToModel,
  defaultVehicleArt,
  cpredVehicleUpgrade,
  cpredVehicleUpgradeProblem,
  cpredVehicleUpgradesFor,
  formatCost,
  isVehicleEntry,
  readCpredVehicle,
  type CpredVehicleKind,
  type CpredVehicleStats,
  type CpredVehicleUpgradeId,
  type CpredVehicleUpgradeRow,
  type TokenAssetView,
  type VehicleEntry,
  type VehicleLayoutId,
  type VehicleView,
} from '@vtt/shared';
import { apiGet } from '../api.js';
import { noteAck, notifyInfo } from '../notices.js';
import {
  createVehicle,
  deleteVehicle,
  placeChaseVehicle,
  renameVehicle,
  updateVehicle,
} from '../socket.js';
import { startVehicleDrag } from '../map/vehicle-drag.js';
import { missingMountWeaponsText } from '../chase-mounts.js';
import { useChaseStore } from '../stores/chaseStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { chaseErrorText } from './ChaseVehicleMenu.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useCompendiumStore } from '../stores/compendiumStore.js';
import { useVehicleStore, vehiclesOf } from '../stores/vehicleStore.js';
import { EmptyState } from './EmptyState.js';
import { VehicleArt } from './VehicleArt.js';
import { FleetVehicleControls } from './FleetVehicleControls.js';
import { VehicleRepairButton } from './RepairWork.js';

/**
 * Pojazdy (etap 65a): karta pojazdu, sekcja „Pojazdy” na karcie postaci,
 * zakładka MG i okno edycji. Rdzeń widzi bryłę, a liczby CP RED czyta
 * `readCpredVehicle` — ta sama funkcja, którą serwer zapisuje.
 *
 * Kto co zmienia (decyzja MG 8 z 30.10): MG wszystko, właściciel karty nazwę.
 * Grafikę gracz wybierze z wbudowanych, gdy dojdą w 65b — dziś daje ją MG
 * z biblioteki „Grafik”.
 */

export function vehicleErrorText(code: string): string {
  if (code in CPRED_VEHICLE_UPGRADE_PROBLEMS) {
    return CPRED_VEHICLE_UPGRADE_PROBLEMS[code as keyof typeof CPRED_VEHICLE_UPGRADE_PROBLEMS];
  }
  switch (code) {
    case 'VEHICLE_IN_FLEET':
      return 'Ten pojazd jest wierszem Taboru Rodziny — zmienia go karta Nomady (panel Moto).';
    case 'VEHICLE_NOT_FOUND':
      return 'Tego pojazdu już nie ma.';
    case 'VEHICLE_NOT_IN_CATALOG':
      return 'Tego pojazdu nie ma w katalogu.';
    case 'VEHICLE_LOOK_LOCKED':
      return 'Wygląd to model auta — zmieniasz tylko nazwę. Inny wygląd daje MG.';
    case 'UPLOAD_NOT_FOUND':
      return 'Ta grafika nie należy do tej kampanii.';
    case 'FORBIDDEN':
      return 'Pojazd zmienia MG — ty nadajesz mu tylko nazwę.';
    default:
      return 'Serwer nie przyjął tej zmiany pojazdu.';
  }
}

function useVehicleCatalog(): VehicleEntry[] {
  const entries = useCompendiumStore((s) => s.entries);
  const order = useCompendiumStore((s) => s.order);
  return useMemo(
    () =>
      order
        .map((id) => entries[id])
        .filter((entry): entry is VehicleEntry => entry !== undefined && isVehicleEntry(entry)),
    [entries, order],
  );
}

/**
 * Liczby auta na karcie (06.11): rodzaj, Ruch, fotele, pancerz i szyby jako
 * plakietki, a PUK z paskiem — stan auta widać od razu, bez czytania zdania.
 */
function VehicleStats({ stats }: { stats: CpredVehicleStats }) {
  const derived = cpredVehicleDerived(stats);
  const chips = [
    CPRED_VEHICLE_KIND_LABELS[stats.kind],
    `Ruch ${stats.move}`,
    `fotele ${derived.seats}`,
    derived.hullSp ? `OB kadłuba ${derived.hullSp}` : '',
    derived.windowHp ? `szyby ${derived.windowHp} PW` : '',
  ].filter(Boolean);
  const share = derived.hpMax > 0 ? Math.max(0, Math.min(1, stats.hp / derived.hpMax)) : 0;
  return (
    <>
      <div
        className={`vehicle-card-hp${stats.hp === 0 ? ' is-wrecked' : ''}`}
        title="Punkty Uszkodzeń Kadłuba — przy zerze auto jest wrakiem."
      >
        <span className="vehicle-card-hp-label">
          PUK {stats.hp}/{derived.hpMax}
          {stats.hp === 0 ? ' · wrak' : ''}
        </span>
        <span className="vehicle-card-hp-bar" aria-hidden="true">
          <span style={{ width: `${share * 100}%` }} />
        </span>
      </div>
      <ul className="vehicle-card-chips">
        {chips.map((chip) => (
          <li key={chip}>{chip}</li>
        ))}
      </ul>
    </>
  );
}

export function VehicleCard({
  vehicle,
  canRename,
  onEdit,
}: {
  vehicle: VehicleView;
  canRename: boolean;
  onEdit?: () => void;
}) {
  const stats = readCpredVehicle(vehicle.system);
  // Etap 67 (MG 06.11): auto z modelu ma jego wygląd — gracz zmienia nazwę.
  const model = useCompendiumStore((s) =>
    stats.catalogId ? s.entries[stats.catalogId] : undefined,
  );
  const lookLocked = cpredVehicleIsModel(model);
  const [name, setName] = useState(vehicle.name);
  useEffect(() => setName(vehicle.name), [vehicle.name]);

  async function commitName() {
    const next = name.trim();
    if (!next || next === vehicle.name) {
      setName(vehicle.name);
      return;
    }
    const ack = await renameVehicle({ vehicleId: vehicle.id, name: next });
    if (!noteAck('character', ack, vehicleErrorText)) setName(vehicle.name);
  }

  // Etap 65b: MG ogląda scenę pościgu — auto daje się postawić na drodze
  // przyciskiem albo przeciągnięciem karty na mapę.
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const chaseScene = useSceneStore((s) => (s.scene?.kind === 'chase' ? s.scene : null));
  const onRoad = useChaseStore((s) => s.vehicles.some((entry) => entry.vehicleId === vehicle.id));
  const placeable = isGm && chaseScene !== null;

  async function placeOnRoad() {
    if (!chaseScene) return;
    // Pierwsze wolne miejsce jezdni (kreator pościgu, 03.11), a nie środek
    // sceny — drugie auto nie ląduje na pierwszym.
    const spot = chaseFreeSpot(
      vehicle,
      useChaseStore
        .getState()
        .vehicles.filter((row) => row.status === 'racing')
        .map((row) => ({ x: row.x, y: row.y, widthSq: row.widthSq, lengthSq: row.lengthSq })),
      chaseScene.chase,
      {
        width: chaseScene.width,
        height: chaseScene.height,
        gridSizePx: chaseScene.grid.sizePx,
        gridOffsetX: chaseScene.grid.offsetX,
        gridOffsetY: chaseScene.grid.offsetY,
      },
    );
    const ack = await placeChaseVehicle({
      sceneId: chaseScene.id,
      vehicleId: vehicle.id,
      x: spot.x,
      y: spot.y,
    });
    noteAck('chase', ack, chaseErrorText);
  }

  return (
    <li
      className="vehicle-card"
      data-vehicle-id={vehicle.id}
      draggable={placeable}
      onDragStart={placeable ? (event) => startVehicleDrag(event, vehicle.id) : undefined}
      title={placeable ? 'Przeciągnij na drogę sceny pościgu' : undefined}
    >
      <VehicleArt
        url={vehicle.imageUrl ?? defaultVehicleArt(vehicle.layout)}
        size="card"
        layout={vehicle.layout}
        wrecked={stats.hp === 0}
      />
      <div className="vehicle-card-body">
        <div className="vehicle-card-head">
          {canRename ? (
            <input
              className="vehicle-card-name"
              value={name}
              maxLength={80}
              aria-label="Nazwa pojazdu"
              onChange={(event) => setName(event.target.value)}
              onBlur={() => void commitName()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
          ) : (
            <b className="vehicle-card-name">{vehicle.name}</b>
          )}
          {stats.fleetRowId ? (
            <span
              className="vehicle-card-tag"
              title="Pojazd z Taboru Rodziny — wiersz w panelu Moto."
            >
              Tabor
            </span>
          ) : null}
          {lookLocked && model && model.name !== vehicle.name ? (
            <span className="vehicle-card-tag" title="Model auta — jego wygląd zmienia tylko MG.">
              {model.name}
            </span>
          ) : null}
          {placeable && onRoad ? <span className="vehicle-card-tag">Na drodze</span> : null}
          {placeable && !onRoad ? (
            <button
              type="button"
              className="cp-mini-button"
              title="Stawia auto na środku pasa jezdni oglądanej sceny pościgu"
              onClick={() => void placeOnRoad()}
            >
              Na drogę
            </button>
          ) : null}
          {onEdit ? (
            <button type="button" className="cp-mini-button" onClick={onEdit}>
              Edytuj…
            </button>
          ) : null}
        </div>
        <VehicleStats stats={stats} />
        {canRename && (isGm || !lookLocked) ? (
          <VehicleArtPicker vehicle={vehicle} isGm={isGm} />
        ) : null}
        {stats.upgrades.length > 0 ? (
          <ul className="vehicle-card-upgrades">
            {stats.upgrades.map((row) => {
              const upgrade = cpredVehicleUpgrade(row.upgradeId);
              return (
                <li
                  key={row.id}
                  title={`${upgrade?.text ?? ''} (s. ${upgrade?.page ?? '—'})${row.fleetRowId ? ' — z Taboru Rodziny.' : ''}`}
                  className={upgrade?.combat ? '' : 'vehicle-card-upgrade--prose'}
                >
                  {upgrade?.name ?? row.upgradeId}
                </li>
              );
            })}
          </ul>
        ) : null}
        {canRename ? <FleetVehicleControls vehicle={vehicle} stats={stats} /> : null}
        {canRename ? <VehicleRepairButton vehicle={vehicle} stats={stats} /> : null}
        {stats.notes ? <p className="vehicle-card-notes">{stats.notes}</p> : null}
      </div>
    </li>
  );
}

/**
 * Wbudowana grafika pojazdu (etap 65b). **Grafika to model** (zlecenie MG
 * z 10.11): MG wybiera grafikę modelu, a auto staje się tym modelem — rodzaj,
 * PUK, Ruch, fotele i bryła idą za nią (`vehicle:rename`). Gracz dostaje tylko
 * modele swojej klasy z tymi samymi fotelami — ten sam wóz w innym lakierze.
 * Grafika z biblioteki MG stoi na liście jako „własna MG”, żeby wybór jej nie
 * gubił po cichu.
 */
function VehicleArtPicker({ vehicle, isGm }: { vehicle: VehicleView; isGm: boolean }) {
  const entries = useCompendiumStore((s) => s.entries);
  const stats = readCpredVehicle(vehicle.system);
  const own = stats.catalogId ? entries[stats.catalogId] : undefined;
  const ownClass = (own && isVehicleEntry(own) ? own.classId : undefined) ?? stats.catalogId;
  const models = Object.values(entries).filter(
    (entry): entry is VehicleEntry & { art: string } =>
      entry !== undefined && isVehicleEntry(entry) && typeof entry.art === 'string',
  );
  const modelOf = (url: string) => models.find((entry) => entry.art === url);
  // Służby (taksówka, radiowóz, karetka, Militech) daje MG — gracz ich nie wybiera.
  const gallery = VEHICLE_ART.filter((art) => {
    if (isGm) return true;
    const model = modelOf(art.url);
    return (
      !art.gmOnly &&
      model !== undefined &&
      (model.classId ?? model.id) === ownClass &&
      model.seats === stats.seats &&
      (model.van === true) === stats.van
    );
  });
  if (!isGm && gallery.length === 0) return null;
  const builtIn = gallery.some((art) => art.url === vehicle.imageUrl);

  async function pick(value: string) {
    const model = value ? modelOf(value) : undefined;
    const switching =
      isGm && model !== undefined && model.id !== stats.catalogId && !stats.fleetRowId;
    const dropped = switching && model ? cpredVehicleToModel(stats, model).dropped : [];
    const ack = await renameVehicle({
      vehicleId: vehicle.id,
      imageUrl: value === '' ? null : value,
    });
    if (!noteAck('character', ack, vehicleErrorText) || !model || dropped.length === 0) return;
    const names = [...new Set(dropped.map((id) => cpredVehicleUpgrade(id)?.name ?? id))];
    notifyInfo(
      `${CPRED_VEHICLE_KIND_LABELS[model.vehicleKind]} nie przyjmuje: ${names.join(', ')} — zdjęte z „${vehicle.name}”.`,
    );
  }
  return (
    <label
      className="vehicle-card-art"
      title={
        isGm
          ? 'Grafika to model: auto bierze jego rodzaj, PUK, Ruch i fotele. Ulepszenia zostają, jeśli pasują.'
          : 'Ten sam wóz w innym lakierze — modele twojej klasy'
      }
    >
      <span>{isGm ? 'Model' : 'Grafika'}</span>
      <select value={vehicle.imageUrl ?? ''} onChange={(event) => void pick(event.target.value)}>
        <option value="">domyślna</option>
        {vehicle.imageUrl && !builtIn ? (
          <option value={vehicle.imageUrl} disabled>
            {VEHICLE_ART.some((art) => art.url === vehicle.imageUrl) ? 'od MG' : 'własna MG'}
          </option>
        ) : null}
        {gallery.map((art) => (
          <option key={art.url} value={art.url}>
            {art.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Grupy galerii modeli „＋ Dodaj pojazd” — w tej kolejności. */
const MODEL_GROUPS: readonly { label: string; test: (entry: VehicleEntry) => boolean }[] = [
  {
    label: 'Motocykle',
    test: (entry) => entry.forSale === true && entry.vehicleKind === 'motorcycle',
  },
  {
    label: 'Auta',
    test: (entry) => entry.forSale === true && entry.vehicleKind === 'car' && !entry.van,
  },
  { label: 'Furgony', test: (entry) => entry.forSale === true && entry.van === true },
  {
    label: 'Łodzie',
    test: (entry) =>
      entry.forSale === true && (entry.vehicleKind === 'jetski' || entry.vehicleKind === 'boat'),
  },
  { label: 'Służby', test: (entry) => entry.forSale !== true },
];

/**
 * MG: „＋ Dodaj pojazd” (zlecenie MG z 10.11) — galeria modeli w skali,
 * pogrupowana, a pod nią zwinięte „Inne z podręcznika” (klasy, łodzie,
 * aerodyny, wpisy MG bez grafiki). **Nic nie jest wybrane z góry** — dawna
 * lista alfabetyczna podsuwała Aerozep i MG dawał postaciom sterowce.
 */
export function AddFromCatalog({ ownerCharacterId }: { ownerCharacterId: string | null }) {
  const catalog = useVehicleCatalog();
  const entries = useCompendiumStore((s) => s.entries);
  const [chosen, setChosen] = useState('');
  const [busy, setBusy] = useState(false);
  if (catalog.length === 0) {
    return (
      <p className="vehicle-hint">
        Katalog pojazdów jest pusty — dopisz pojazd w Kompendium (kategoria „Pojazdy”).
      </p>
    );
  }
  const models = catalog.filter((entry) => typeof entry.art === 'string');
  const others = catalog
    .filter((entry) => typeof entry.art !== 'string')
    .sort(
      (a, b) =>
        CPRED_VEHICLE_KINDS.indexOf(a.vehicleKind) - CPRED_VEHICLE_KINDS.indexOf(b.vehicleKind) ||
        a.name.localeCompare(b.name, 'pl'),
    );
  const picked = catalog.find((entry) => entry.id === chosen);
  const detail = (entry: VehicleEntry) => {
    const base = entry.classId ? entries[entry.classId] : undefined;
    return cpredVehicleModelDetail(
      entry,
      base?.name ?? CPRED_VEHICLE_KIND_LABELS[entry.vehicleKind],
    );
  };
  const toggle = (id: string) => setChosen(id === chosen ? '' : id);
  return (
    <div className="vehicle-add">
      {MODEL_GROUPS.map((group) => {
        const rows = models.filter(group.test);
        if (rows.length === 0) return null;
        return (
          <div key={group.label} className="vehicle-add-group">
            <span className="vehicle-add-group-label">{group.label}</span>
            <div className="vehicle-add-gallery">
              {rows.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="vehicle-add-tile"
                  aria-pressed={entry.id === chosen}
                  title={`${entry.name} — ${detail(entry)}`}
                  onClick={() => toggle(entry.id)}
                >
                  <VehicleArt url={entry.art ?? null} size="tile" />
                  <span>{entry.name}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {others.length > 0 ? (
        <details className="vehicle-add-others">
          <summary>Inne z podręcznika ({others.length})</summary>
          <ul>
            {others.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  aria-pressed={entry.id === chosen}
                  onClick={() => toggle(entry.id)}
                >
                  <b>{entry.name}</b>
                  <span>
                    {CPRED_VEHICLE_KIND_LABELS[entry.vehicleKind]} · PUK {entry.hp} · Ruch{' '}
                    {entry.move} · {formatCost(entry)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="vehicle-add-bar">
        <span className="vehicle-hint">{picked ? detail(picked) : 'Wybierz model pojazdu.'}</span>
        <button
          type="button"
          disabled={busy || !picked}
          onClick={() => {
            if (!picked) return;
            setBusy(true);
            void createVehicle({ catalogId: picked.id, ownerCharacterId })
              .then((ack) => {
                if (noteAck('character', ack, vehicleErrorText)) setChosen('');
              })
              .finally(() => setBusy(false));
          }}
        >
          ＋ Dodaj {picked ? picked.name : 'pojazd'}
        </button>
      </div>
    </div>
  );
}

/** Sekcja „Pojazdy” na stronie Ekwipunku karty postaci. */
export function CharacterVehiclesSection({ characterId }: { characterId: string }) {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const all = useVehicleStore((s) => s.vehicles);
  const vehicles = vehiclesOf(all, characterId);
  const [editing, setEditing] = useState<string | null>(null);
  if (!isGm && vehicles.length === 0) return null;
  return (
    <div className="cp-panel vehicle-section" data-sheet-panel="vehicles">
      <div className="cp-field cp-field--notch">
        <span className="cp-label">
          Pojazdy{vehicles.length > 0 ? ` (${vehicles.length})` : ''}
        </span>
      </div>
      {vehicles.length > 0 ? (
        <ul className="vehicle-list">
          {vehicles.map((vehicle) => (
            <VehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              canRename
              {...(isGm ? { onEdit: () => setEditing(vehicle.id) } : {})}
            />
          ))}
        </ul>
      ) : (
        <p className="vehicle-hint">Postać nie ma pojazdu.</p>
      )}
      {isGm ? <AddFromCatalog ownerCharacterId={characterId} /> : null}
      {editing && all[editing] ? (
        <VehicleEditor vehicle={all[editing]} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

/** Zakładka MG „Pojazdy”: wozy MG i NPC-ów, a pod nimi pojazdy postaci. */
export function VehiclesTab() {
  const all = useVehicleStore((s) => s.vehicles);
  const characters = useCharacterStore((s) => s.characters);
  const [editing, setEditing] = useState<string | null>(null);
  const loose = vehiclesOf(all, null);
  const owned = Object.values(all)
    .filter((vehicle) => vehicle.ownerCharacterId !== null)
    .sort((a, b) =>
      (characters[a.ownerCharacterId!]?.name ?? '').localeCompare(
        characters[b.ownerCharacterId!]?.name ?? '',
        'pl',
      ),
    );
  return (
    <section className="panel-section vehicles-tab">
      <h3>Pojazdy MG i NPC-ów</h3>
      {loose.length > 0 ? (
        <ul className="vehicle-list">
          {loose.map((vehicle) => (
            <VehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              canRename
              onEdit={() => setEditing(vehicle.id)}
            />
          ))}
        </ul>
      ) : (
        <EmptyState text="Żadnego pojazdu bez właściciela. Wóz gangu czy radiowóz dodasz z katalogu." />
      )}
      <AddFromCatalog ownerCharacterId={null} />
      {owned.length > 0 ? (
        <>
          <h3>Pojazdy postaci</h3>
          <ul className="vehicle-list">
            {owned.map((vehicle) => (
              <div key={vehicle.id} className="vehicle-owned">
                <span className="vehicle-owner">
                  {characters[vehicle.ownerCharacterId!]?.name ?? 'karta spoza listy'}
                </span>
                <VehicleCard vehicle={vehicle} canRename onEdit={() => setEditing(vehicle.id)} />
              </div>
            ))}
          </ul>
        </>
      ) : null}
      {editing && all[editing] ? (
        <VehicleEditor vehicle={all[editing]} onClose={() => setEditing(null)} />
      ) : null}
    </section>
  );
}

/** Okno MG: wszystkie pola pojazdu, ulepszenia według reguł s. 163–165. */
export function VehicleEditor({ vehicle, onClose }: { vehicle: VehicleView; onClose: () => void }) {
  const stats = readCpredVehicle(vehicle.system);
  const characters = useCharacterStore((s) => s.characters);
  const order = useCharacterStore((s) => s.order);
  const [name, setName] = useState(vehicle.name);
  const [kind, setKind] = useState<CpredVehicleKind>(stats.kind);
  const [hpMax, setHpMax] = useState(stats.hpMax);
  const [hp, setHp] = useState(stats.hp);
  const [seats, setSeats] = useState(stats.seats);
  const [move, setMove] = useState(stats.move);
  const [notes, setNotes] = useState(stats.notes);
  const [layout, setLayout] = useState<VehicleLayoutId>(vehicle.layout);
  const [widthSq, setWidthSq] = useState(vehicle.widthSq);
  const [lengthSq, setLengthSq] = useState(vehicle.lengthSq);
  const [owner, setOwner] = useState(vehicle.ownerCharacterId ?? '');
  const [imageUrl, setImageUrl] = useState(vehicle.imageUrl ?? '');
  const [upgrades, setUpgrades] = useState<CpredVehicleUpgradeRow[]>(stats.upgrades);
  const [pick, setPick] = useState<CpredVehicleUpgradeId | ''>('');
  const [assets, setAssets] = useState<TokenAssetView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    apiGet<TokenAssetView[]>('/api/token-assets')
      .then((rows) => live && setAssets(rows))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const derived = cpredVehicleDerived({ hpMax, seats, upgrades });
  const choices = cpredVehicleUpgradesFor(kind).filter(
    (entry) => cpredVehicleUpgradeProblem(kind, upgrades, entry.id) !== 'UPGRADE_ONCE',
  );
  const pickProblem = pick ? cpredVehicleUpgradeProblem(kind, upgrades, pick) : null;
  const fleetOwned = stats.fleetRowId !== null;
  const missingMounts = missingMountWeaponsText(upgrades);

  // Wzmocniona konstrukcja przesuwa i bieżące PUK (MG 03.11) — na oczach MG,
  // bo łata okna niesie `hp` i serwer bierze je dosłownie.
  function changeUpgrades(next: CpredVehicleUpgradeRow[]) {
    setHp((value) => cpredVehicleHpAfterUpgrades(value, upgrades, next));
    setUpgrades(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const ack = await updateVehicle(vehicle.id, {
      name,
      imageUrl: imageUrl || null,
      layout,
      widthSq,
      lengthSq,
      ...(fleetOwned ? {} : { ownerCharacterId: owner || null }),
      system: { kind, hpMax, hp, seats, move, notes, upgrades },
    });
    setSaving(false);
    if (!ack.ok) {
      setError(vehicleErrorText(ack.error));
      return;
    }
    onClose();
  }

  async function remove() {
    const ack = await deleteVehicle(vehicle.id);
    if (!ack.ok) {
      setError(vehicleErrorText(ack.error));
      return;
    }
    onClose();
  }

  const number = (value: string, fallback: number) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog vehicle-editor" onClick={(event) => event.stopPropagation()}>
        <h3>Pojazd: {vehicle.name}</h3>
        <form onSubmit={submit}>
          <label className="bot-field">
            Nazwa
            <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
          </label>
          <div className="bot-row-inline">
            <label className="bot-field bot-field--inline">
              Rodzaj
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as CpredVehicleKind)}
              >
                {CPRED_VEHICLE_KINDS.map((id) => (
                  <option key={id} value={id}>
                    {CPRED_VEHICLE_KIND_LABELS[id]}
                  </option>
                ))}
              </select>
            </label>
            <label className="bot-field bot-field--inline">
              Właściciel
              <select
                value={owner}
                disabled={fleetOwned}
                title={fleetOwned ? 'Pojazd Taboru Rodziny należy do Nomady.' : undefined}
                onChange={(event) => setOwner(event.target.value)}
              >
                <option value="">— MG / NPC —</option>
                {order.map((id) =>
                  characters[id] && !characters[id].template ? (
                    <option key={id} value={id}>
                      {characters[id].name}
                    </option>
                  ) : null,
                )}
              </select>
            </label>
          </div>
          <div className="bot-row-inline">
            <label className="bot-field bot-field--inline" title="PUK bez Wzmocnionej konstrukcji">
              PUK bazowe
              <input
                type="number"
                min={1}
                value={hpMax}
                onChange={(event) => setHpMax(number(event.target.value, hpMax))}
              />
            </label>
            <label className="bot-field bot-field--inline" title={`Najwyżej ${derived.hpMax}`}>
              PUK teraz
              <input
                type="number"
                min={0}
                max={derived.hpMax}
                value={hp}
                onChange={(event) => setHp(number(event.target.value, hp))}
              />
            </label>
            <label className="bot-field bot-field--inline" title="Fotele bez Ulepszenia foteli">
              Fotele
              <input
                type="number"
                min={1}
                value={seats}
                onChange={(event) => setSeats(number(event.target.value, seats))}
              />
            </label>
            <label className="bot-field bot-field--inline" title="Szybkość bitewna">
              Ruch
              <input
                type="number"
                min={0}
                value={move}
                onChange={(event) => setMove(number(event.target.value, move))}
              />
            </label>
          </div>
          <p className="vehicle-hint">
            Z ulepszeniami: PUK {derived.hpMax}, fotele {derived.seats}
            {derived.hullSp ? `, OB kadłuba ${derived.hullSp}` : ''}
            {derived.windowHp ? `, szyby ${derived.windowHp} PW` : ''}.
          </p>

          <fieldset className="vehicle-upgrades-field">
            <legend>Ulepszenia (s. 163–165)</legend>
            <ul className="vehicle-upgrade-rows">
              {upgrades.map((row) => {
                const upgrade = cpredVehicleUpgrade(row.upgradeId);
                return (
                  <li key={row.id} title={upgrade?.text}>
                    <span>{upgrade?.name ?? row.upgradeId}</span>
                    {row.fleetRowId ? (
                      <span className="vehicle-card-tag" title="Zmienia je karta Nomady.">
                        Tabor
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="cp-mini-button"
                        title={`Zdejmij: ${upgrade?.name ?? row.upgradeId}`}
                        aria-label={`Zdejmij: ${upgrade?.name ?? row.upgradeId}`}
                        onClick={() =>
                          changeUpgrades(upgrades.filter((entry) => entry.id !== row.id))
                        }
                      >
                        ✕
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="vehicle-add">
              <select
                value={pick}
                aria-label="Ulepszenie do zamontowania"
                onChange={(event) => setPick(event.target.value as CpredVehicleUpgradeId | '')}
              >
                <option value="">— wybierz ulepszenie —</option>
                {choices.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name} (Moto {entry.motoLevel}){entry.combat ? '' : ' — opis'}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!pick || pickProblem !== null}
                title={pickProblem ? CPRED_VEHICLE_UPGRADE_PROBLEMS[pickProblem] : undefined}
                onClick={() => {
                  if (!pick) return;
                  changeUpgrades([
                    ...upgrades,
                    { id: Math.random().toString(36).slice(2, 10), upgradeId: pick, notes: '' },
                  ]);
                  setPick('');
                }}
              >
                Zamontuj
              </button>
            </div>
            {missingMounts ? <p className="vehicle-hint vehicle-warning">{missingMounts}</p> : null}
          </fieldset>

          <div className="bot-row-inline">
            <label className="bot-field bot-field--inline">
              Układ foteli na mapie
              <select
                value={layout}
                onChange={(event) => setLayout(event.target.value as VehicleLayoutId)}
              >
                {VEHICLE_LAYOUT_IDS.map((id) => (
                  <option key={id} value={id}>
                    {VEHICLE_LAYOUT_LABELS[id]}
                  </option>
                ))}
              </select>
            </label>
            <label className="bot-field bot-field--inline" title="Szerokość bryły w kratkach">
              Szer.
              <input
                type="number"
                min={VEHICLE_SIZE_MIN}
                max={VEHICLE_SIZE_MAX}
                value={widthSq}
                onChange={(event) => setWidthSq(number(event.target.value, widthSq))}
              />
            </label>
            <label className="bot-field bot-field--inline" title="Długość bryły w kratkach">
              Dł.
              <input
                type="number"
                min={VEHICLE_SIZE_MIN}
                max={VEHICLE_SIZE_MAX}
                value={lengthSq}
                onChange={(event) => setLengthSq(number(event.target.value, lengthSq))}
              />
            </label>
          </div>
          <label className="bot-field">
            Grafika (widok z góry, przodem do góry)
            <select value={imageUrl} onChange={(event) => setImageUrl(event.target.value)}>
              <option value="">— brak —</option>
              {vehicle.imageUrl && !assets.some((asset) => asset.url === vehicle.imageUrl) ? (
                <option value={vehicle.imageUrl}>obecna</option>
              ) : null}
              {assets.map((asset) => (
                <option key={asset.id} value={asset.url}>
                  {asset.name}
                </option>
              ))}
            </select>
          </label>
          <label className="bot-field">
            Uwagi
            <textarea
              rows={2}
              maxLength={400}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          <div className="form-row">
            <button type="submit" className="small-button" disabled={saving}>
              {saving ? 'Zapisywanie…' : 'Zapisz'}
            </button>
            <button type="button" className="small-button" onClick={onClose}>
              Anuluj
            </button>
            {fleetOwned ? null : (
              <button
                type="button"
                className="small-button vehicle-delete"
                onClick={() => void remove()}
              >
                Usuń pojazd
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
