import { useEffect, useMemo, useState } from 'react';
import type {
  CompendiumEntry,
  CyberwareSurgeon,
  CyberwareSurgeonView,
  ShopTier,
  WeaponTypeDefinition,
} from '@vtt/shared';
import {
  CPRED_MARTIAL_ARTS_ENTRY_ID,
  cpredIsBareHandsEntry,
  isWeaponEntry,
  NET_DEFENSE_KIND_LABELS,
  describeNetDefenseEffects,
  netDefenseActs,
  NET_PROGRAM_CLASS_LABELS,
  NET_PROGRAM_TARGET_LABELS,
  describeNetProgramEffects,
  netProgramSlots,
  ARMOR_LOCATION_LABELS,
  COMPENDIUM_CATEGORIES,
  COMPENDIUM_CATEGORY_LABELS,
  CPRED_RANGE_BANDS,
  CPRED_AMMO_PATTERN_LABELS,
  CYBERWARE_INSTALL_COST,
  cpredHaggledPrice,
  cpredGearRowOfEntry,
  isAmmoEntry,
  toAmmoProfile,
  CPRED_AMMO_PACK_SIZE,
  CPRED_AMMO_PACKS_MAX,
  cpredCalibreKey,
  cpredCalibreOptions,
  CYBERWARE_INSTALL_DV,
  CYBERWARE_INSTALL_LABELS,
  CYBERWARE_SURGEON_SKILL_DEFAULT,
  CYBERWARE_SURGEON_SKILL_MAX,
  CYBERWARE_TYPE_LABELS,
  cpredMedicineSkillLevel,
  cyberwareAllowsSelfInstall,
  criticalInjuryNames,
  describeAmmoFailure,
  CRITICAL_INJURY_TABLE_LABELS,
  ROLE_GM,
  SHOP_TIERS,
  SHOP_TIER_LABELS,
  SHOP_TIER_NOTES,
  WEAPON_QUALITY_LABELS,
  entryPrice,
  formatCost,
  formatEddies,
  formatPurchasePrice,
  rangeBandLabel,
  resolveWeapon,
  shopTierOf,
  shopTierRefusalText,
  shopTierVerdict,
} from '@vtt/shared';
import {
  deleteCompendiumEntry,
  economyErrorText,
  fetchSurgeons,
  requestSurgery,
  sendCyberwareAction,
  surgeryErrorText,
  setShopEntryTier,
  setCatalogShopping,
  setShopTier,
} from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import {
  countByCategory,
  shopTierContextOf,
  useCompendiumStore,
  visibleEntries,
} from '../stores/compendiumStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import {
  addCompendiumItemToCharacter,
  addFoundCyberwareToCharacter,
  buyCompendiumItemForCharacter,
  showItemNote,
} from '../compendium-items.js';
import { noteAck, notifyInfo, notifyRefusal } from '../notices.js';
import { CompendiumEditor } from './CompendiumEditor.js';
import { EmptyState } from './EmptyState.js';
import { formatEd } from './exchange/items.js';
import { ItemIcon, WeaponTypeFilter, filterWeaponsByType, useEntryIcon } from './ItemIcons.js';

/**
 * Side-panel tab with the item catalogue (stage 13). Everyone browses the same
 * data — picking gear is a player activity — while adding, editing and
 * deleting the campaign's own entries stays with the GM.
 *
 * A player sees the shelf only up to the shop tier the GM has unlocked
 * (10.10, the GM's call): a crew starting out reads the street catalogue, not
 * the black market. The GM's own entries (story items) and critical injuries
 * stay visible whatever their tier; the GM sees everything.
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
  const shopTierOverrides = useCompendiumStore((s) => s.shopTierOverrides);
  const tierContext = useMemo(
    () => shopTierContextOf(shopTierOverrides, weaponTypeById),
    [shopTierOverrides, weaponTypeById],
  );
  const shelf = useMemo(
    () =>
      isGm
        ? order
        : order.filter((id) => {
            const entry = entriesById[id];
            return entry !== undefined && onPlayerShelf(entry, tierContext, shopTier);
          }),
    [isGm, order, entriesById, tierContext, shopTier],
  );
  const found = useMemo(
    () => visibleEntries(entriesById, shelf, query, category),
    [entriesById, shelf, query, category],
  );
  // Broń: filtr typem i kolejność typami (24.09) — reszta kategorii bez zmian.
  const [weaponType, setWeaponType] = useState<string | null>(null);
  const foundWeapons = useMemo(() => found.filter(isWeaponEntry), [found]);
  const entries = useMemo(
    () => (category === 'weapon' ? filterWeaponsByType(foundWeapons, weaponType) : found),
    [category, found, foundWeapons, weaponType],
  );
  const entryIcon = useEntryIcon();
  const counts = useMemo(() => countByCategory(entriesById, shelf), [entriesById, shelf]);

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

      {category === 'weapon' && !selected ? (
        <WeaponTypeFilter weapons={foundWeapons} value={weaponType} onChange={setWeaponType} />
      ) : null}

      {selected ? (
        <EntryCard entry={selected} isGm={isGm} onBack={() => select(null)} />
      ) : (
        <ul className="compendium-list">
          {entries.length === 0 ? (
            <li>
              {/* Trzy różne pustki, trzy różne odpowiedzi (27f): pusta baza
                  czeka na import, pusta kategoria na wpis, a pusty wynik
                  szukania na skasowanie frazy — nie na zakładanie niczego. */}
              {order.length === 0 ? (
                <EmptyState text="Kompendium jest puste — MG wczytuje je z rozdziałów podręcznika (skrypt importu w narzędziach)." />
              ) : query.trim().length > 0 ? (
                <EmptyState
                  text={`Nic nie pasuje do „${query.trim()}” w kategorii „${COMPENDIUM_CATEGORY_LABELS[category]}”.`}
                  action={{ label: 'Wyczyść szukanie', onClick: () => setQuery('') }}
                />
              ) : (
                <EmptyState
                  text="Ta kategoria jest pusta."
                  {...(isGm
                    ? { action: { label: '+ Własny wpis', onClick: () => edit('new') } }
                    : {})}
                />
              )}
            </li>
          ) : null}
          {entries.map((entry) => {
            const tier = shopTierOf(entry, tierContext);
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
                    {category === 'weapon' ||
                    category === 'ammo' ||
                    category === 'armor' ||
                    category === 'attachment' ? (
                      <ItemIcon icon={entryIcon(entry)} />
                    ) : null}
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

/** Is the entry on a player's shelf: unlocked tier, a GM's own entry, or an injury. */
function onPlayerShelf(
  entry: CompendiumEntry,
  context: ReturnType<typeof shopTierContextOf>,
  unlocked: ShopTier,
): boolean {
  if (entry.custom || entry.category === 'criticalInjury') return true;
  return shopTierOf(entry, context) <= unlocked;
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
  const catalogShopping = useCompendiumStore((s) => s.catalogShopping);

  async function move(tier: number) {
    const ack = await setShopTier(tier);
    noteAck('exchange', ack, economyErrorText);
  }

  async function toggleCatalog() {
    const ack = await setCatalogShopping(
      catalogShopping === 'merchants' ? 'everywhere' : 'merchants',
    );
    noteAck('exchange', ack, economyErrorText);
  }

  return (
    <div className="shop-tier">
      <span className="shop-tier-label">
        Sklep: <strong>{SHOP_TIER_LABELS[shopTier]}</strong>
        <span className="shop-tier-note"> {SHOP_TIER_NOTES[shopTier]}</span>
      </span>
      {isGm ? (
        // Etap 46a: jedna dźwignia z dymkiem zamiast sekcji ustawień — tu MG
        // i tak patrzy na katalog, a gracz widzi skutek w tej samej chwili.
        <button
          type="button"
          className={`shop-tier-step shop-tier-catalog${catalogShopping === 'merchants' ? ' shop-tier-step--active' : ''}`}
          title={
            catalogShopping === 'merchants'
              ? 'Zakupy z katalogu: tylko u handlarzy. Gracze nie mają „Kup” w Kompendium. Kliknij, żeby kupowali wszędzie.'
              : 'Zakupy z katalogu: wszędzie. Kliknij, żeby gracze kupowali wyłącznie u handlarzy na mapie i w sklepach zdalnych.'
          }
          onClick={() => void toggleCatalog()}
        >
          {catalogShopping === 'merchants' ? 'Kup: u handlarzy' : 'Kup: wszędzie'}
        </button>
      ) : catalogShopping === 'merchants' ? (
        <span className="shop-tier-note" title="MG ustawił „Zakupy z katalogu: tylko u handlarzy”.">
          Kupujesz u handlarzy
        </span>
      ) : null}
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
      // Wiersz listy niesie skrót; pełne „PT 17 Elektronika i zabezpieczenia ·
      // 5 min" czeka na karcie wpisu, bo tam jest na nie miejsce.
      return entry.defenseKind === 'demon'
        ? `${NET_DEFENSE_KIND_LABELS[entry.defenseKind]} · Interfejs ${entry.interfaceRank ?? 0} · ${formatCost(entry)}`
        : [
            NET_DEFENSE_KIND_LABELS[entry.defenseKind],
            entry.combatValue !== undefined ? `Wartość bojowa ${entry.combatValue}` : '',
            entry.hp !== undefined ? `${entry.hp} PW` : '',
            entry.disableDv !== undefined ? `PT ${entry.disableDv}` : '',
            formatCost(entry),
          ]
            .filter(Boolean)
            .join(' · ');
    default:
      return formatCost(entry);
  }
}

/** Wartość opcji „Medyk innego gracza" w liście chirurgów — prośba, nie montaż (#41). */
const ASK_SURGEON = 'ask:';

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
  const entriesById = useCompendiumStore((s) => s.entries);
  const statusRegistry = useTokenStore((s) => s.statuses);
  const cardIcon = useEntryIcon()(entry);
  const characters = useCharacterStore((s) => s.characters);
  const order = useCharacterStore((s) => s.order);
  const edit = useCompendiumStore((s) => s.edit);
  // Etap 46a: „Zakupy z katalogu: tylko u handlarzy” — gracz kupuje przy
  // ladzie. „Zainstaluj” i „Dodaj za darmo” MG działają bez zmian.
  const catalogClosed = useCompendiumStore((s) => s.catalogShopping === 'merchants') && !isGm;
  const [targetId, setTargetId] = useState('');
  const [confirming, setConfirming] = useState(false);
  // Kto operuje (s. 226). „—" zostaje domyślne: cena montażu jest wliczona
  // w cenę wszczepu, więc klinika bez Testu to nadal najczęstsza droga.
  const [surgeonId, setSurgeonId] = useState('');
  const [ripperdocSkill, setRipperdocSkill] = useState(CYBERWARE_SURGEON_SKILL_DEFAULT);

  const resolved = useMemo(
    () =>
      entry.category === 'weapon'
        ? resolveWeapon(entry, { weaponTypeById: new Map(Object.entries(weaponTypeById)) })
        : null,
    [entry, weaponTypeById],
  );

  const targets = order.map((id) => characters[id]).filter((c) => c !== undefined);
  const target = targetId || targets[0]?.id || '';
  // Etap 48c: „Znaleziony — montaż” tylko z wiersza Wyposażenia wybranej postaci.
  const foundInGear =
    entry.category === 'cyberware' &&
    cpredGearRowOfEntry(characters[target]?.data.gear ?? [], entry.id) !== undefined;

  // Stage 23b: a band is a price („50 ed (Drogie)" and „(Drogie)" cost the
  // same), so an entry priced only by its band is still buyable.
  const price = entryPrice(entry);
  const priceLabel = formatPurchasePrice(entry) ?? '—';
  // Etap 30d: dobity targ schodzi z pierwszego zakupu, więc guzik ma wyceniać
  // **ten** zakup. Bez tego pisał cenę z katalogu, a z konta schodziło o 10%
  // mniej — karta ekonomii mówiła prawdę dopiero po fakcie (znalezione przy
  // oględzinach 30d). Warunek `discount > 0` jest ten sam, co na serwerze:
  // cztery z sześciu targów opisują pieniądze, których projekt nie liczy.
  const struck = characters[target]?.data.haggle ?? null;
  const discount = struck && struck.discount > 0 ? struck.discount : 0;
  const payable = price === null ? null : cpredHaggledPrice(price, discount);
  const shopTier = useCompendiumStore((s) => s.shopTier);
  const shopTierOverrides = useCompendiumStore((s) => s.shopTierOverrides);
  const tierContext = useMemo(
    () => shopTierContextOf(shopTierOverrides, weaponTypeById),
    [shopTierOverrides, weaponTypeById],
  );
  const availability = shopTierVerdict(entry, tierContext);
  const tier = availability.tier;
  const locked = tier > shopTier;
  const fitting =
    entry.category === 'cyberware' && entry.install ? CYBERWARE_INSTALL_COST[entry.install] : 0;
  // PT montażu jest **tylko** tam, gdzie podręcznik przewiduje operację: chip
  // w gnieździe („Bez operacji") nie ma czego oblać, więc nie ma też wyboru
  // chirurga.
  const installDv =
    entry.category === 'cyberware' && entry.install ? CYBERWARE_INSTALL_DV[entry.install] : null;
  const registry = useCharacterStore((s) => s.registry);
  // Chirurgia jest Umiejętnością wyłącznie Medyka i wyłącznie ze Specjalizacji,
  // więc lista chirurgów to lista Medyków, którzy wydali na nią punkt.
  const surgeons = targets
    .map((character) => ({
      character,
      surgery: cpredMedicineSkillLevel(character.data, registry, 'medicine.surgery'),
    }))
    .filter((row) => row.surgery > 0);
  // „Nie możesz sam sobie wszczepić cyborgizacji, chyba że…" (s. 226). Serwer
  // i tak odmówi (`SELF_INSTALL`), ale lista nie powinna tego podsuwać —
  // pacjent zostaje na niej wyszarzony, żeby było widać, dlaczego go nie ma.
  const selfInstallBlocked =
    entry.category === 'cyberware' && !cyberwareAllowsSelfInstall(entry.install);
  const surgeonIsPatient = (id: string) => selfInstallBlocked && id === target;

  // Medycy innych graczy (#41, 30.09.2026): ich kart klient gracza nie trzyma,
  // więc listę podaje serwer. Wybór takiego Medyka nie montuje od ręki — wysyła
  // prośbę, a cenę podaje Medyk na karcie czatu. MG ma wszystkie karty
  // w `targets` i montuje wprost, więc go to nie dotyczy.
  const asksOthers = !isGm && installDv !== null && target !== '';
  const [remoteSurgeons, setRemoteSurgeons] = useState<CyberwareSurgeonView[]>([]);
  useEffect(() => {
    if (!asksOthers) return;
    let alive = true;
    void fetchSurgeons(target).then((ack) => {
      if (alive && ack.ok && ack.data) setRemoteSurgeons(ack.data.surgeons);
    });
    return () => {
      alive = false;
    };
  }, [asksOthers, target]);
  const askable = asksOthers ? remoteSurgeons : [];

  // Etap 46c: amunicja — kaliber (rodzina z pola „Amunicja” typu broni)
  // i liczba paczek (s. 344: 10 naboi albo 1 granat). Domyślny kaliber to
  // pierwszy, do którego postać ma broń.
  const calibres = useMemo(
    () =>
      isAmmoEntry(entry)
        ? cpredCalibreOptions(toAmmoProfile(entry), Object.values(weaponTypeById))
        : [],
    [entry, weaponTypeById],
  );
  const [calibreTypeId, setCalibreTypeId] = useState('');
  const [packs, setPacks] = useState(1);
  const targetWeapons = characters[target]?.data.weapons;
  const ownCalibre = calibres.find((option) =>
    (targetWeapons ?? []).some(
      (row) => cpredCalibreKey(row.ammoType) === cpredCalibreKey(option.calibre),
    ),
  );
  const calibre =
    calibres.find((option) => option.weaponTypeId === calibreTypeId) ?? ownCalibre ?? calibres[0];
  const ammoChoice = calibre ? { weaponTypeId: calibre.weaponTypeId, packs } : undefined;
  const packSize = calibre ? CPRED_AMMO_PACK_SIZE[calibre.pattern] : 1;
  const ammoPayable = payable === null ? null : payable * (isAmmoEntry(entry) ? packs : 1);

  async function addToSheet() {
    if (!target) return;
    showItemNote(await addCompendiumItemToCharacter(target, entry, resolved, ammoChoice));
  }

  async function buy() {
    if (!target) return;
    showItemNote(await buyCompendiumItemForCharacter(target, entry, undefined, ammoChoice));
  }

  /** Prośba do Medyka innego gracza (#41) — pieniądze i Test dopiero po jego „Operuję”. */
  async function askForSurgery(surgeonCardId: string, payment: 'full' | 'installOnly') {
    const ack = await requestSurgery({
      patientId: target,
      surgeonId: surgeonCardId,
      entryId: entry.id,
      payment,
    });
    if (!noteAck('character', ack, surgeryErrorText)) return;
    const name = askable.find((row) => row.characterId === surgeonCardId)?.name ?? 'Medyk';
    const listed = payment === 'installOnly' ? fitting : (price ?? 0);
    notifyInfo(
      `Prośba do: ${name} — czeka na czacie. Medyk poda cenę (domyślnie ${formatEd(listed)}); wyższą zatwierdzasz ty.`,
      { title: 'Prośba o operację', topic: 'character' },
    );
  }

  /** Kto operuje, w kształcie, którego oczekuje serwer — albo nikt. */
  function surgeonPayload(): CyberwareSurgeon {
    if (installDv === null || surgeonId === '') return { kind: 'none' };
    if (surgeonId === 'gm') return { kind: 'gm', skill: ripperdocSkill };
    if (surgeonIsPatient(surgeonId)) return { kind: 'none' };
    return { kind: 'character', characterId: surgeonId };
  }

  /** Cyberware never goes through `economy:buy` — the Humanity is rolled. */
  async function install(payment: 'full' | 'installOnly') {
    if (!target) return;
    if (surgeonId.startsWith(ASK_SURGEON)) {
      await askForSurgery(surgeonId.slice(ASK_SURGEON.length), payment);
      return;
    }
    const surgeon = surgeonPayload();
    // Notka dopiero po odpowiedzi serwera (13.09). Stała tu przed nią, więc
    // odmowa („Nie ma w co tego wszczepić…") zostawiała na karcie „Instaluję…",
    // a czat mówił co innego. Przy odmowie karta mówi teraz to samo co czat.
    const refusal = await sendCyberwareAction({
      characterId: target,
      action: 'install',
      entryId: entry.id,
      payment,
      surgeon,
    });
    if (refusal) {
      notifyRefusal('character', refusal);
      return;
    }
    const money =
      payment === 'installOnly'
        ? `Montaż „${entry.name}” — ${formatEd(fitting)}.`
        : `Instaluję „${entry.name}” — ${formatEd(price ?? 0)}.`;
    notifyInfo(
      surgeon.kind === 'none'
        ? `${money} Rzut na Utratę Człowieczeństwa idzie na czat.`
        : `${money} Najpierw Test montażu (PT ${installDv}), potem Utrata Człowieczeństwa — obie karty idą na czat.`,
      { topic: 'character' },
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
            {confirming ? (
              <>
                <span className="knowledge-flag">Usunąć?</span>
                <button
                  type="button"
                  className="small-button small-button--danger"
                  onClick={() => void deleteCompendiumEntry(entry.id)}
                >
                  Tak, usuń
                </button>
                <button type="button" className="small-button" onClick={() => setConfirming(false)}>
                  Anuluj
                </button>
              </>
            ) : (
              <button
                type="button"
                className="small-button small-button--danger"
                onClick={() => setConfirming(true)}
              >
                Usuń
              </button>
            )}
          </span>
        ) : null}
      </div>

      <h3 className="compendium-card-name">
        {cardIcon ? <ItemIcon icon={cardIcon} /> : null}
        {entry.name}
      </h3>
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
                hint={`Porażka: ${describeAmmoFailure(entry.check.failure, {
                  // Nazwy, nie id — karta wpisu mówi „Powalony · Uraz oka",
                  // a nie „prone · injury.head-uraz-oka" (błąd #6).
                  statuses: (entry.check.failure.statuses ?? []).map(
                    (id) => statusRegistry.find((status) => status.id === id)?.name ?? id,
                  ),
                  injuries: criticalInjuryNames(
                    Object.values(entriesById),
                    entry.check.failure.injuries ?? [],
                  ),
                })}${entry.check.biologicalOnly ? ' · tylko cele biologiczne' : ''}`}
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
            {describeNetProgramEffects(entry.effects) ? (
              <Stat
                label="Mechanika"
                value={describeNetProgramEffects(entry.effects)}
                hint="To, na czym działa silnik walki w Sieci — opis obok jest zdaniem z podręcznika, a to jest jego rachunkiem."
              />
            ) : null}
            {entry.icon ? <Stat label="Ikona" value={entry.icon} /> : null}
          </>
        ) : null}
        {entry.category === 'netDefense' ? (
          <>
            <Stat label="Rodzaj" value={NET_DEFENSE_KIND_LABELS[entry.defenseKind]} />
            {entry.rez !== undefined ? <Stat label="REZ" value={String(entry.rez)} /> : null}
            {entry.interfaceRank !== undefined ? (
              <Stat
                label="Interfejs"
                value={String(entry.interfaceRank)}
                hint="Demon broni się Testem Interfejsu — nie ma wartości Obrony."
              />
            ) : null}
            {entry.netActions !== undefined ? (
              <Stat label="Akcje Sieciowe" value={String(entry.netActions)} />
            ) : null}
            {entry.combatValue !== undefined ? (
              <Stat
                label="Wartość bojowa"
                value={String(entry.combatValue)}
                hint="Cecha + Umiejętność w jednej liczbie — tym rzuca obsługiwane urządzenie."
              />
            ) : null}
            {entry.hp !== undefined ? <Stat label="PW" value={String(entry.hp)} /> : null}
            {entry.move !== undefined ? <Stat label="RUCH" value={String(entry.move)} /> : null}
            {entry.disableDv !== undefined ? (
              <Stat
                label="Unieszkodliwienie"
                value={
                  entry.disableMinutes !== undefined
                    ? `PT ${entry.disableDv} · ${entry.disableMinutes} min`
                    : `PT ${entry.disableDv}`
                }
                hint="Test Elektroniki i zabezpieczeń z Somy — niekontrolowany system."
              />
            ) : null}
            {entry.spotDv !== undefined ? (
              <Stat
                label="Zauważenie"
                value={`Percepcja PT ${entry.spotDv}`}
                hint="Systemy środowiskowe są ukryte, dopóki ktoś ich nie wypatrzy."
              />
            ) : null}
            {entry.trigger ? <Stat label="Standardowa aktywacja" value={entry.trigger} /> : null}
            {netDefenseActs(entry.effects) ? (
              <Stat
                label="Efekt"
                value={describeNetDefenseEffects(entry.effects)}
                hint="To, co silnik zrobi sam, gdy ktoś wejdzie na strefę — opis obok jest zdaniem z podręcznika, a to jest jego rachunkiem."
              />
            ) : null}
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
                      `operacja wliczona w cenę; znaleziony wszczep — ${formatEd(CYBERWARE_INSTALL_COST[entry.install])} (s. 375).`
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
            {/* Skąd poziom — widoczne, nie w dymku (naprawa 3b): „dlaczego ten
                karabin jest zablokowany" pada przy stole, a nie przy myszce. */}
            <Stat
              label="Dostępność"
              value={`${tier} — ${SHOP_TIER_LABELS[tier]} (${availability.reason})`}
              hint="Poziom mówi, jak legalna jest rzecz: typ broni, OB, rodzina wszczepu, klasa programu; cena go tylko podnosi. MG odblokowuje kolejne w miarę kampanii."
            />
          </>
        )}
      </dl>
      {isGm && entry.category !== 'criticalInjury' ? (
        <ShopEntryTierChoice entry={entry} tierContext={tierContext} />
      ) : null}

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

      {/* Etap 47b: gołe ręce ma każda karta z urzędu — nie ma czego kupić. */}
      {cpredIsBareHandsEntry(entry.id) ? (
        <p className="compendium-note">
          Każda postać ma to na liście broni z urzędu
          {entry.id === CPRED_MARTIAL_ARTS_ENTRY_ID ? ' — od Umiejętności Sztuki walki 1' : ''}.
        </p>
      ) : null}
      {/* Od etapu 46c amunicja to pudełko w wyposażeniu — kupuje się ją
          i dodaje z kalibrem, jak każdą rzecz na kartę. Od 48b tak samo
          Program: ląduje w Wyposażeniu, do deku wkłada się go na karcie. */}
      {targets.length > 0 &&
      !cpredIsBareHandsEntry(entry.id) &&
      entry.category !== 'criticalInjury' &&
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
              {/* Test montażu (s. 226). Ripperdoc MG jest osobną pozycją, a nie
                  kartą postaci: przy stole to zdanie w opisie MG, więc jedyne,
                  czego potrzebuje, to liczba, którą doda do kości. */}
              {installDv === null ? null : (
                <>
                  <select
                    value={surgeonIsPatient(surgeonId) ? '' : surgeonId}
                    title={`Kto operuje. Bez wyboru montaż wchodzi bez Testu — PT ${installDv} (s. 226).`}
                    onChange={(event) => setSurgeonId(event.target.value)}
                  >
                    <option value="">Bez Testu montażu</option>
                    {isGm ? <option value="gm">Ripperdoc MG — PT {installDv}</option> : null}
                    {askable.map((row) => (
                      <option
                        key={row.characterId}
                        value={`${ASK_SURGEON}${row.characterId}`}
                        title="Medyk innego gracza — dostanie prośbę na czacie i poda cenę."
                      >
                        {row.name} — Chirurgia {row.surgery} · poproś
                      </option>
                    ))}
                    {surgeons.map((row) =>
                      surgeonIsPatient(row.character.id) ? (
                        <option
                          key={row.character.id}
                          value={row.character.id}
                          disabled
                          title="Poza galerią potrzebny jest ktoś drugi (s. 226)."
                        >
                          {row.character.name} — to pacjent
                        </option>
                      ) : (
                        <option key={row.character.id} value={row.character.id}>
                          {row.character.name} — Chirurgia {row.surgery}
                        </option>
                      ),
                    )}
                  </select>
                  {surgeonId === 'gm' ? (
                    <input
                      type="number"
                      className="compendium-surgeon-skill"
                      min={0}
                      max={CYBERWARE_SURGEON_SKILL_MAX}
                      value={ripperdocSkill}
                      title="TECHNIKA + Chirurgia ripperdoca — serwer dorzuci do tego 1k10."
                      onChange={(event) =>
                        setRipperdocSkill(
                          Math.max(
                            0,
                            Math.min(CYBERWARE_SURGEON_SKILL_MAX, Number(event.target.value) || 0),
                          ),
                        )
                      }
                    />
                  ) : null}
                </>
              )}
              <button
                type="button"
                className="small-button"
                title={
                  price === null
                    ? 'Ten wpis nie ma ceny — uzupełnij ją w kompendium.'
                    : `Wszczep ${formatEd(price)} — koszt operacji jest wliczony w cenę (s. 111).`
                }
                disabled={price === null}
                onClick={() => void install('full')}
              >
                Zainstaluj{price === null ? '' : ` — ${formatEd(price)}`}
              </button>
              {/* „Montaż znalezionej cyborgizacji" (s. 375): chrome pulled off
                  a corpse costs the ripperdoc's time and nothing else. Od etapu
                  48c znaleziony wszczep musi leżeć w Wyposażeniu postaci. */}
              <button
                type="button"
                className="small-button"
                title={
                  foundInGear
                    ? 'Wszczep leży w Wyposażeniu — płacisz tylko za montaż (s. 375), a wiersz schodzi z plecaka.'
                    : 'Znaleziony wszczep musi leżeć w Wyposażeniu postaci (łup, wymiana albo od MG).'
                }
                disabled={!foundInGear}
                onClick={() => void install('installOnly')}
              >
                Znaleziony — montaż {formatEd(fitting)}
              </button>
            </>
          ) : null}
          {isAmmoEntry(entry) && calibres.length > 0 ? (
            <>
              <select
                value={calibre?.weaponTypeId ?? ''}
                title="Kaliber — do jakiej broni ta amunicja. Pudełko pasuje do każdej broni tej rodziny."
                aria-label="Kaliber"
                onChange={(event) => setCalibreTypeId(event.target.value)}
              >
                {calibres.map((option) => (
                  <option key={option.weaponTypeId} value={option.weaponTypeId}>
                    {option.calibre} — {option.typeNames.join(', ')}
                  </option>
                ))}
              </select>
              <input
                type="number"
                className="compendium-ammo-packs"
                min={1}
                max={CPRED_AMMO_PACKS_MAX}
                value={packs}
                title={`Liczba paczek — paczka to ${packSize} szt. (s. 344).`}
                aria-label="Liczba paczek"
                onChange={(event) =>
                  setPacks(
                    Math.max(1, Math.min(CPRED_AMMO_PACKS_MAX, Number(event.target.value) || 1)),
                  )
                }
              />
              <span className="compendium-ammo-pack">× {packSize} szt.</span>
            </>
          ) : null}
          {entry.category === 'cyberware' ? null : catalogClosed ? (
            <span
              className="compendium-note"
              title="MG ustawił „Zakupy z katalogu: tylko u handlarzy” — podejdź do handlarza albo otwórz sklep z doku w rogu mapy."
            >
              Kupisz u handlarza
            </span>
          ) : (
            <button
              type="button"
              className="small-button"
              title={
                price === null
                  ? 'Ten wpis nie ma ceny — uzupełnij ją w kompendium.'
                  : locked
                    ? shopTierRefusalText(tier, shopTier)
                    : discount > 0
                      ? `Cena schodzi z konta postaci: ${priceLabel} − ${discount}% z dobitego targu`
                      : `Cena schodzi z konta postaci: ${priceLabel}`
              }
              // The GM buys through every tier — the dial paces the *table*,
              // and the server exempts the GM for the same reason.
              disabled={price === null || (locked && !isGm)}
              onClick={() => void buy()}
            >
              Kup{ammoPayable === null ? '' : ` — ${formatEddies(ammoPayable)} ed`}
            </button>
          )}
          {isGm && entry.category === 'cyberware' ? (
            <button
              type="button"
              className="small-button"
              title="Znaleziony wszczep do Wyposażenia — łup z ciała, nagroda w naturze. Wszczepia się go potem „Znaleziony — montaż” za samą robociznę."
              onClick={() => showItemNote(addFoundCyberwareToCharacter(target, entry))}
            >
              Do Wyposażenia
            </button>
          ) : null}
          {isGm ? (
            <button
              type="button"
              className="small-button"
              title={
                entry.category === 'cyberware'
                  ? 'Bez opłaty — łup, nagroda za zlecenie. Wszczep wchodzi bez Testu montażu, ale z rzutem na Utratę Człowieczeństwa.'
                  : 'Bez opłaty — łup, ekwipunek startowy, nagroda za zlecenie.'
              }
              onClick={() => void addToSheet()}
            >
              Dodaj za darmo
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The GM moves one entry for this campaign (naprawa 3b) — the only way to change
 * where an imported row sits, since the files are never written from the UI.
 * „Automatycznie" names the rung the data would give, so going back is not a
 * leap in the dark.
 */
function ShopEntryTierChoice({
  entry,
  tierContext,
}: {
  entry: CompendiumEntry;
  tierContext: ReturnType<typeof shopTierContextOf>;
}) {
  const chosen = tierContext.overrides?.[entry.id];
  const automatic = shopTierVerdict(entry, { ...tierContext, overrides: {} });

  async function choose(value: string) {
    const ack = await setShopEntryTier(entry.id, value === '' ? null : Number(value));
    noteAck('exchange', ack, economyErrorText);
  }

  return (
    <label className="compendium-tier-choice">
      <span>Poziom w tej kampanii</span>
      <select value={chosen ?? ''} onChange={(event) => void choose(event.target.value)}>
        <option value="">
          Automatycznie — {automatic.tier} {SHOP_TIER_LABELS[automatic.tier]}
        </option>
        {SHOP_TIERS.map((tier) => (
          <option key={tier} value={tier}>
            {tier} — {SHOP_TIER_LABELS[tier]}
          </option>
        ))}
      </select>
    </label>
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
