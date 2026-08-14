import { useMemo, useState } from 'react';
import type { CompendiumEntry, WeaponTypeDefinition } from '@vtt/shared';
import {
  NET_DEFENSE_KIND_LABELS,
  NET_PROGRAM_CLASS_LABELS,
  NET_PROGRAM_TARGET_LABELS,
  netProgramSlots,
  ARMOR_LOCATION_LABELS,
  COMPENDIUM_CATEGORIES,
  COMPENDIUM_CATEGORY_LABELS,
  CPRED_RANGE_BANDS,
  CPRED_AMMO_PATTERN_LABELS,
  CYBERWARE_INSTALL_COST,
  CYBERWARE_INSTALL_DV,
  CYBERWARE_INSTALL_LABELS,
  CYBERWARE_TYPE_LABELS,
  describeAmmoFailure,
  CRITICAL_INJURY_TABLE_LABELS,
  ROLE_GM,
  SHOP_TIERS,
  SHOP_TIER_LABELS,
  SHOP_TIER_NOTES,
  WEAPON_QUALITY_LABELS,
  entryPrice,
  formatCost,
  formatPurchasePrice,
  rangeBandLabel,
  resolveWeapon,
  shopTierOf,
  shopTierRefusalText,
} from '@vtt/shared';
import {
  deleteCompendiumEntry,
  economyErrorText,
  sendCyberwareAction,
  setShopTier,
} from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { countByCategory, useCompendiumStore, visibleEntries } from '../stores/compendiumStore.js';
import {
  addCompendiumItemToCharacter,
  buyCompendiumItemForCharacter,
} from '../compendium-items.js';
import { CompendiumEditor } from './CompendiumEditor.js';

/**
 * Side-panel tab with the item catalogue (stage 13). Everyone browses the same
 * data — picking gear is a player activity — while adding, editing and
 * deleting the campaign's own entries stays with the GM.
 *
 * Labels follow the Polish edition: OBR. (damage), OB (armor), LA (rate of
 * fire), PT (difficulty value).
 */
export function CompendiumPanel() {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const category = useCompendiumStore((s) => s.category);
  const query = useCompendiumStore((s) => s.query);
  const selectedId = useCompendiumStore((s) => s.selectedId);
  const editing = useCompendiumStore((s) => s.editing);
  const setCategory = useCompendiumStore((s) => s.setCategory);
  const setQuery = useCompendiumStore((s) => s.setQuery);
  const select = useCompendiumStore((s) => s.select);
  const edit = useCompendiumStore((s) => s.edit);
  // Raw slices only: a selector that derives a new array or object on every
  // render loops React (learned in stage 10, same trap).
  const entriesById = useCompendiumStore((s) => s.entries);
  const order = useCompendiumStore((s) => s.order);
  const weaponTypeById = useCompendiumStore((s) => s.weaponTypeById);
  const shopTier = useCompendiumStore((s) => s.shopTier);
  const entries = useMemo(
    () => visibleEntries(entriesById, order, query, category),
    [entriesById, order, query, category],
  );
  const counts = useMemo(() => countByCategory(entriesById, order), [entriesById, order]);

  const selected = selectedId ? (entriesById[selectedId] ?? null) : null;

  return (
    <section className="compendium-panel">
      <div className="compendium-head">
        <input
          className="compendium-search"
          type="search"
          value={query}
          placeholder="Szukaj przedmiotu…"
          onChange={(event) => setQuery(event.target.value)}
        />
        {isGm ? (
          <button type="button" className="small-button" onClick={() => edit('new')}>
            + Własny wpis
          </button>
        ) : null}
      </div>

      <nav className="compendium-categories">
        {COMPENDIUM_CATEGORIES.map((id) => (
          <button
            key={id}
            type="button"
            className={`compendium-category ${category === id ? 'compendium-category--active' : ''}`}
            onClick={() => setCategory(id)}
          >
            {COMPENDIUM_CATEGORY_LABELS[id]} <span className="compendium-count">{counts[id]}</span>
          </button>
        ))}
      </nav>

      <ShopTierBar isGm={isGm} />

      {selected ? (
        <EntryCard entry={selected} isGm={isGm} onBack={() => select(null)} />
      ) : (
        <ul className="compendium-list">
          {entries.length === 0 ? (
            <li className="placeholder-text">Brak wpisów w tej kategorii.</li>
          ) : null}
          {entries.map((entry) => {
            const tier = shopTierOf(entry);
            // Injuries are not merchandise, so the tier chip would be noise.
            const priced = entry.category !== 'criticalInjury';
            const locked = priced && tier > shopTier;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  className={`compendium-row ${locked ? 'compendium-row--locked' : ''}`}
                  onClick={() => select(entry.id)}
                >
                  <span className="compendium-row-name">
                    {entry.name}
                    {entry.custom ? <span className="compendium-tag">własny</span> : null}
                    {entry.incomplete ? (
                      <span className="compendium-tag compendium-tag--warn" title="Dane niepełne">
                        ?
                      </span>
                    ) : null}
                    {locked ? (
                      <span
                        className="compendium-tag compendium-tag--tier"
                        title={shopTierRefusalText(tier, shopTier)}
                      >
                        {SHOP_TIER_LABELS[tier]}
                      </span>
                    ) : null}
                  </span>
                  <span className="compendium-row-meta">{shortStats(entry, weaponTypeById)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editing ? <CompendiumEditor /> : null}
    </section>
  );
}

/**
 * The shop's opening hours (stage 25c): a dial for the GM, a sentence for
 * everybody else.
 *
 * It sits here rather than on the „Panel MG" page because this is where the GM
 * is already looking at the catalogue — and because the change goes out over
 * the socket, so a player watching the same list sees it open up mid-sentence.
 */
function ShopTierBar({ isGm }: { isGm: boolean }) {
  const shopTier = useCompendiumStore((s) => s.shopTier);
  const [note, setNote] = useState<string | null>(null);

  async function move(tier: number) {
    const ack = await setShopTier(tier);
    setNote(ack.ok ? null : economyErrorText(ack.error));
  }

  return (
    <div className="shop-tier">
      <span className="shop-tier-label">
        Sklep: <strong>{SHOP_TIER_LABELS[shopTier]}</strong>
        <span className="shop-tier-note"> {SHOP_TIER_NOTES[shopTier]}</span>
      </span>
      {isGm ? (
        <span className="shop-tier-steps">
          {SHOP_TIERS.map((tier) => (
            <button
              key={tier}
              type="button"
              className={`shop-tier-step ${tier === shopTier ? 'shop-tier-step--active' : ''}`}
              title={`${SHOP_TIER_LABELS[tier]} — ${SHOP_TIER_NOTES[tier]}`}
              onClick={() => void move(tier)}
            >
              {tier}
            </button>
          ))}
        </span>
      ) : null}
      {note ? <span className="compendium-note">{note}</span> : null}
    </div>
  );
}

/**
 * One-line summary for the list. Weapon damage usually lives on the base type,
 * not on the entry, so it has to be resolved — otherwise every imported weapon
 * would show a dash where its dice belong.
 */
function shortStats(
  entry: CompendiumEntry,
  weaponTypeById: Record<string, WeaponTypeDefinition>,
): string {
  switch (entry.category) {
    case 'weapon': {
      const damage =
        entry.damage ??
        (entry.weaponTypeId ? weaponTypeById[entry.weaponTypeId]?.damage : undefined) ??
        '—';
      return `${damage} · ${formatCost(entry)}`;
    }
    case 'ammo':
      return `${entry.patterns.map((id) => CPRED_AMMO_PATTERN_LABELS[id]).join(', ')} · ${formatCost(
        entry,
      )}`;
    case 'armor':
      return `OB ${entry.sp} · ${formatCost(entry)}`;
    case 'criticalInjury':
      return `2k6 = ${entry.roll} · ${CRITICAL_INJURY_TABLE_LABELS[entry.table]}`;
    case 'program':
      return `${entry.blackIce ? 'Czarny LOD' : NET_PROGRAM_CLASS_LABELS[entry.programClass]} · ATK ${entry.atk} / OBR ${entry.def} / REZ ${entry.rez} · ${formatCost(entry)}`;
    case 'netDefense':
      return `${NET_DEFENSE_KIND_LABELS[entry.defenseKind]} · Interfejs ${entry.interfaceRank} · ${formatCost(entry)}`;
    default:
      return formatCost(entry);
  }
}

function EntryCard({
  entry,
  isGm,
  onBack,
}: {
  entry: CompendiumEntry;
  isGm: boolean;
  onBack: () => void;
}) {
  const weaponTypeById = useCompendiumStore((s) => s.weaponTypeById);
  const characters = useCharacterStore((s) => s.characters);
  const order = useCharacterStore((s) => s.order);
  const edit = useCompendiumStore((s) => s.edit);
  const [note, setNote] = useState<string | null>(null);
  const [targetId, setTargetId] = useState('');

  const resolved = useMemo(
    () =>
      entry.category === 'weapon'
        ? resolveWeapon(entry, { weaponTypeById: new Map(Object.entries(weaponTypeById)) })
        : null,
    [entry, weaponTypeById],
  );

  const targets = order.map((id) => characters[id]).filter((c) => c !== undefined);
  const target = targetId || targets[0]?.id || '';

  // Stage 23b: a band is a price („50 ed (Drogie)" and „(Drogie)" cost the
  // same), so an entry priced only by its band is still buyable.
  const price = entryPrice(entry);
  const priceLabel = formatPurchasePrice(entry) ?? '—';
  const shopTier = useCompendiumStore((s) => s.shopTier);
  const tier = shopTierOf(entry);
  const locked = tier > shopTier;
  const fitting =
    entry.category === 'cyberware' && entry.install ? CYBERWARE_INSTALL_COST[entry.install] : 0;

  async function addToSheet() {
    if (!target) return;
    const result = await addCompendiumItemToCharacter(target, entry, resolved);
    setNote(result);
  }

  async function buy() {
    if (!target) return;
    setNote(await buyCompendiumItemForCharacter(target, entry));
  }

  /** Cyberware never goes through `economy:buy` — the Humanity is rolled. */
  async function install(payment: 'full' | 'installOnly') {
    if (!target) return;
    sendCyberwareAction({ characterId: target, action: 'install', entryId: entry.id, payment });
    setNote(
      payment === 'installOnly'
        ? `Montaż „${entry.name}” — ${fitting} ed. Rzut na Utratę Człowieczeństwa idzie na czat.`
        : `Instaluję „${entry.name}” — ${(price ?? 0) + fitting} ed. Rzut na Utratę Człowieczeństwa idzie na czat.`,
    );
  }

  return (
    <div className="compendium-card">
      <div className="compendium-card-head">
        <button type="button" className="small-button" onClick={onBack}>
          ← Lista
        </button>
        {isGm && entry.custom ? (
          <span className="compendium-card-actions">
            <button type="button" className="small-button" onClick={() => edit(entry.id)}>
              Edytuj
            </button>
            <button
              type="button"
              className="small-button small-button--danger"
              onClick={() => void deleteCompendiumEntry(entry.id)}
            >
              Usuń
            </button>
          </span>
        ) : null}
      </div>

      <h3 className="compendium-card-name">{entry.name}</h3>
      {entry.nameOriginal && entry.nameOriginal !== entry.name ? (
        <p className="compendium-card-original">{entry.nameOriginal}</p>
      ) : null}

      <dl className="compendium-stats">
        {entry.category === 'weapon' && resolved ? (
          <>
            <Stat
              label="Obrażenia"
              value={resolved.damage}
              hint="Pula kości k6 — na karcie postaci pole OBR."
            />
            <Stat
              label="Liczba ataków"
              value={String(resolved.rof)}
              hint="Ile ataków tą bronią można wykonać w jednej turze (na karcie: LA)."
            />
            <Stat
              label="Magazynek"
              value={resolved.magazine === null ? '—' : String(resolved.magazine)}
            />
            <Stat label="Chwyt" value={resolved.hands === 2 ? 'oburęczna' : 'jednoręczna'} />
            <Stat label="Da się ukryć" value={resolved.concealable ? 'tak' : 'nie'} />
            <Stat label="Jakość" value={WEAPON_QUALITY_LABELS[entry.quality]} />
            {resolved.typeName ? <Stat label="Typ broni" value={resolved.typeName} /> : null}
            {resolved.attachmentSlots > 0 ? (
              <Stat
                label="Gniazda na dodatki"
                value={String(resolved.attachmentSlots)}
                hint="Ile dodatków (celownik, tłumik, magazynek) można zamontować."
              />
            ) : null}
          </>
        ) : null}
        {entry.category === 'ammo' ? (
          <>
            <Stat
              label="Pasuje do"
              value={entry.patterns.map((id) => CPRED_AMMO_PATTERN_LABELS[id]).join(', ')}
              hint="Rodzaje naboi, w których ta amunicja jest produkowana — broń musi je komorować."
            />
            {entry.ablationBonus ? (
              <Stat
                label="Uszkodzenie pancerza"
                value={`−${1 + entry.ablationBonus} OB`}
                hint="Zwykły nabój zdejmuje 1 punkt OB; ten zdejmuje więcej."
              />
            ) : null}
            {entry.spread ? (
              <Stat
                label="Stożek"
                value={`${entry.spread.coneRangeM} m · PT ${entry.spread.dv} · ${entry.spread.damage}`}
                hint="Jeden test trafienia przeciw stałemu PT; obrażenia dostają wszyscy w stożku."
              />
            ) : null}
            {entry.ignites ? (
              <Stat
                label="Podpalenie"
                value={`${entry.ignites.damage} obr./turę`}
                hint="Cel płonie, dopóki nie ugasi ognia Akcją. Efekty się nie kumulują."
              />
            ) : null}
            {entry.nonLethal ? (
              <Stat
                label="Obezwładniająca"
                value="cel zostaje na 1 PW"
                hint="Nie zbija celu, który miał więcej niż 1 PW, poniżej 1 PW."
              />
            ) : null}
            {entry.noCriticalInjury ? <Stat label="Rany krytyczne" value="nie powoduje" /> : null}
            {entry.noAblation ? <Stat label="Pancerz celu" value="nie ulega uszkodzeniu" /> : null}
            {entry.noAim ? <Stat label="Celowanie" value="niedostępne" /> : null}
            {/* Stage 16h — the half of the table that hurts nobody directly. */}
            {entry.noDamage ? (
              <Stat
                label="Obrażenia"
                value="nie zadaje"
                hint="Zamiast rzutu na obrażenia trafiony zdaje test albo dostaje efekt obszarowy."
              />
            ) : null}
            {entry.check ? (
              <Stat
                label="Wymuszony test"
                value={`${entry.check.skillLabel ?? entry.check.skillId} · PT ${entry.check.dv}`}
                hint={`Porażka: ${describeAmmoFailure(entry.check.failure)}${
                  entry.check.biologicalOnly ? ' · tylko cele biologiczne' : ''
                }`}
              />
            ) : null}
            {entry.smoke ? (
              <Stat
                label="Dym"
                value={`${entry.smoke.sideM}×${entry.smoke.sideM} m · ${entry.smoke.penalty} do testów`}
                hint="Kwadrat na mapie; każdy test wykonywany w dymie dostaje tę karę. Podręcznik nie mówi, kiedy dym opada — rozwiewa go MG."
              />
            ) : null}
            {entry.smart ? (
              <Stat
                label="Poprawka po pudle"
                value={`chybienie ≤ ${entry.smart.maxMiss} → 1k10 + ${entry.smart.bonus}`}
                hint={
                  entry.smart.requires
                    ? `Wymaga cyborgizacji „${entry.smart.requires}" — VTT tego nie sprawdza (etap 23).`
                    : 'Drugi rzut przeciw temu samemu PT.'
                }
              />
            ) : null}
          </>
        ) : null}
        {entry.category === 'armor' ? (
          <>
            <Stat
              label="Ochrona"
              value={String(entry.sp)}
              hint="Ile obrażeń zatrzymuje pancerz — na karcie postaci pole OB."
            />
            <Stat
              label="Chroni"
              value={entry.locations.map((l) => ARMOR_LOCATION_LABELS[l]).join(', ')}
            />
            {entry.penalty ? (
              <Stat
                label="Kara"
                value={String(entry.penalty)}
                hint="Modyfikator do Zwinności i Ruchu, gdy pancerz jest założony."
              />
            ) : null}
          </>
        ) : null}
        {entry.category === 'program' ? (
          <>
            <Stat
              label="Klasa"
              value={
                entry.blackIce
                  ? `Czarny LOD ${entry.target ? NET_PROGRAM_TARGET_LABELS[entry.target] : ''}`.trim()
                  : `${NET_PROGRAM_CLASS_LABELS[entry.programClass]}${entry.target ? ` ${NET_PROGRAM_TARGET_LABELS[entry.target]}` : ''}`
              }
              hint="Przeciwbiałkowy bije Netrunnera, przeciwprogramowy — jego Programy."
            />
            <Stat
              label="ATK"
              value={String(entry.atk)}
              hint="Dodawane do Testu ataku tym Programem."
            />
            <Stat
              label="OBR"
              value={String(entry.def)}
              hint="Dodawane do Testu obrony tym Programem."
            />
            <Stat
              label="REZ"
              value={String(entry.rez)}
              hint="Wytrzymałość Programu — przy 0 zostaje zderezowany, nie zniszczony."
            />
            {entry.blackIce ? (
              <>
                <Stat
                  label="PER"
                  value={String(entry.per ?? 0)}
                  hint="Trudność ucieczki temu LOD-owi za pomocą Ślizgu."
                />
                <Stat
                  label="PRĘ"
                  value={String(entry.speed ?? 0)}
                  hint="Szybkość reakcji — decyduje o darmowym ataku przy wykryciu intruza."
                />
              </>
            ) : null}
            <Stat
              label="Gniazda"
              value={String(netProgramSlots(entry))}
              hint="Ile miejsca zajmuje na cyberdeku."
            />
            {entry.icon ? <Stat label="Ikona" value={entry.icon} /> : null}
          </>
        ) : null}
        {entry.category === 'netDefense' ? (
          <>
            <Stat label="Rodzaj" value={NET_DEFENSE_KIND_LABELS[entry.defenseKind]} />
            <Stat label="REZ" value={String(entry.rez)} />
            <Stat
              label="Interfejs"
              value={String(entry.interfaceRank)}
              hint="Demon broni się Testem Interfejsu — nie ma wartości Obrony."
            />
            <Stat label="Akcje Sieciowe" value={String(entry.netActions)} />
            <Stat
              label="Wartość bojowa"
              value={String(entry.combatValue)}
              hint="Cecha + Umiejętność w jednej liczbie — tym rzuca obsługiwane urządzenie."
            />
            {entry.icon ? <Stat label="Ikona" value={entry.icon} /> : null}
          </>
        ) : null}
        {entry.category === 'criticalInjury' ? (
          <>
            <Stat
              label="Tabela"
              value={CRITICAL_INJURY_TABLE_LABELS[entry.table]}
              hint="Trafienie w korpus albo w głowę (strzał celowany)."
            />
            <Stat
              label="Wynik 2k6"
              value={String(entry.roll)}
              hint="Rzut, przy którym wypada ta rana."
            />
            {entry.quickFix ? (
              <Stat label="Łatanie" value={entry.quickFix} hint="Znosi efekt rany do końca dnia." />
            ) : null}
            {entry.treatment ? (
              <Stat label="Leczenie" value={entry.treatment} hint="Usuwa ranę na stałe." />
            ) : null}
            {entry.deathSavePenalty ? (
              <Stat
                label="Test Przeżywalności"
                value={`+${entry.deathSavePenalty} do trudności`}
                hint="Rana podnosi podstawową trudność Testu Przeżywalności."
              />
            ) : null}
          </>
        ) : null}
        {entry.category === 'cyberware' ? (
          <>
            {entry.type ? <Stat label="Rodzina" value={CYBERWARE_TYPE_LABELS[entry.type]} /> : null}
            {entry.install ? (
              <Stat
                label="Montaż"
                value={CYBERWARE_INSTALL_LABELS[entry.install]}
                hint={
                  CYBERWARE_INSTALL_DV[entry.install] === null
                    ? 'Bez operacji — wystarczy gniazdo.'
                    : `PT montażu ${CYBERWARE_INSTALL_DV[entry.install]}, ` +
                      `koszt operacji ${CYBERWARE_INSTALL_COST[entry.install]} ed (s. 226).`
                }
              />
            ) : null}
            {entry.humanityLoss || entry.humanityLossFixed ? (
              <Stat
                label="Utrata człowieczeństwa"
                value={
                  // „7 (2k6)" — stała przy tworzeniu Postaci, kości w trakcie gry.
                  `−${entry.humanityLossFixed ?? entry.humanityLoss}` +
                  (entry.humanityLoss && entry.humanityLossFixed
                    ? ` (${entry.humanityLoss}${entry.humanityLossHalved ? ' / 2 w górę' : ''})`
                    : '')
                }
                hint="Stała wartość przy tworzeniu Postaci, rzut kośćmi w trakcie gry (s. 111)."
              />
            ) : (
              <Stat
                label="Utrata człowieczeństwa"
                value="brak"
                hint="Wszczep bez UC nie obniża też maksymalnego Człowieczeństwa (s. 230)."
              />
            )}
            {entry.foundation ? (
              <Stat
                label="Wszczep podstawowy"
                value={`${entry.slots ?? 0} gniazd`}
                hint="Podstawa pod kolejne opcje (np. cyberoko przyjmuje wkładki)."
              />
            ) : entry.slotCost !== undefined ? (
              <Stat
                label="Zajmuje gniazd"
                value={String(entry.slotCost)}
                hint="Ile gniazd modyfikacji zabiera w cyborgizacji podstawowej."
              />
            ) : null}
            {entry.requires ? (
              <Stat label="Wymaga" value={entry.requires} hint="Bez tego wszczep nie zadziała." />
            ) : null}
          </>
        ) : null}
        {entry.category === 'criticalInjury' ? null : (
          <>
            <Stat label="Cena" value={formatCost(entry)} />
            <Stat
              label="Dostępność"
              value={`${tier} — ${SHOP_TIER_LABELS[tier]}`}
              hint={
                entry.tier
                  ? 'Poziom wpisany ręcznie przez MG — nie wynika z ceny.'
                  : 'Poziom wyliczony z ceny. MG odblokowuje kolejne w miarę kampanii.'
              }
            />
          </>
        )}
      </dl>

      {entry.category === 'weapon' && resolved?.rangeDv ? (
        <div className="compendium-range-wrap">
          <table className="compendium-range">
            <caption title="Poziom trudności testu ataku na danym dystansie.">
              Poziom trudności (PT) w walce dystansowej
            </caption>
            <thead>
              <tr>
                {CPRED_RANGE_BANDS.map((band) => (
                  <th key={band.id}>{rangeBandLabel(band)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {CPRED_RANGE_BANDS.map((band, index) => (
                  <td key={band.id}>{resolved.rangeDv?.[index] ?? 'Nd.'}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      {entry.description ? <p className="compendium-card-text">{entry.description}</p> : null}
      {entry.descriptionOriginal ? (
        <details className="compendium-original">
          <summary>Oryginał (EN)</summary>
          <p>{entry.descriptionOriginal}</p>
        </details>
      ) : null}
      {entry.category === 'weapon' && entry.features?.length ? (
        <ul className="compendium-features">
          {entry.features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      ) : null}

      {entry.incomplete ? (
        <p className="compendium-warning">
          Dane niepełne — w darmowych materiałach nie ma wszystkich wartości. Uzupełnij je własnym
          wpisem albo z podręcznika.
        </p>
      ) : null}
      {entry.source ? <p className="compendium-source">Źródło: {entry.source}</p> : null}

      {/* Ammunition is loaded into a weapon row (stage 16g), not carried as an
          item, so the sheet has nowhere to put it — the picker in the weapon
          table is where it belongs. */}
      {targets.length > 0 &&
      entry.category !== 'criticalInjury' &&
      entry.category !== 'ammo' &&
      entry.category !== 'program' &&
      entry.category !== 'netDefense' ? (
        <div className="compendium-assign">
          <select value={target} onChange={(event) => setTargetId(event.target.value)}>
            {targets.map((character) => (
              <option key={character.id} value={character.id}>
                {character.name}
              </option>
            ))}
          </select>
          {entry.category === 'cyberware' ? (
            <>
              <button
                type="button"
                className="small-button"
                title={
                  price === null
                    ? 'Ten wpis nie ma ceny — uzupełnij ją w kompendium.'
                    : `Wszczep ${price} ed${fitting > 0 ? ` + montaż ${fitting} ed` : ''}`
                }
                disabled={price === null}
                onClick={() => void install('full')}
              >
                Zainstaluj{price === null ? '' : ` — ${price + fitting} ed`}
              </button>
              {/* „Montaż znalezionej cyborgizacji" (s. 375): chrome pulled off
                  a corpse costs the ripperdoc's time and nothing else. */}
              <button
                type="button"
                className="small-button"
                title="Wszczep już masz — płacisz tylko za montaż (s. 375)."
                onClick={() => void install('installOnly')}
              >
                Znaleziony — montaż {fitting} ed
              </button>
            </>
          ) : (
            <button
              type="button"
              className="small-button"
              title={
                price === null
                  ? 'Ten wpis nie ma ceny — uzupełnij ją w kompendium.'
                  : locked
                    ? shopTierRefusalText(tier, shopTier)
                    : `Cena schodzi z konta postaci: ${priceLabel}`
              }
              // The GM buys through every tier — the dial paces the *table*,
              // and the server exempts the GM for the same reason.
              disabled={price === null || (locked && !isGm)}
              onClick={() => void buy()}
            >
              Kup{price === null ? '' : ` — ${price} ed`}
            </button>
          )}
          {isGm ? (
            <button
              type="button"
              className="small-button"
              title="Bez opłaty — łup, ekwipunek startowy, nagroda za zlecenie."
              onClick={() => void addToSheet()}
            >
              Dodaj za darmo
            </button>
          ) : null}
        </div>
      ) : null}
      {note ? <p className="compendium-note">{note}</p> : null}
    </div>
  );
}

/** `hint` becomes a tooltip — the place to explain a rulebook abbreviation. */
function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="compendium-stat">
      <dt {...(hint ? { title: hint } : {})}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
