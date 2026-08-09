import { useMemo, useState, type FormEvent } from 'react';
import type { CompendiumCategory, CompendiumEntry, WeaponQuality } from '@vtt/shared';
import {
  ARMOR_LOCATIONS,
  ARMOR_LOCATION_LABELS,
  COMPENDIUM_CATEGORIES,
  CPRED_AMMO_PATTERNS,
  CPRED_AMMO_PATTERN_LABELS,
  CPRED_CONE_RANGE_M,
  CPRED_SMOKE_PENALTY,
  CPRED_ON_FIRE_STATUS_ID,
  COMPENDIUM_CATEGORY_LABELS,
  COST_CATEGORIES,
  CRITICAL_INJURY_ROLL_MAX,
  CRITICAL_INJURY_ROLL_MIN,
  CRITICAL_INJURY_TABLES,
  CRITICAL_INJURY_TABLE_LABELS,
  CYBERWARE_INSTALLS,
  CYBERWARE_INSTALL_LABELS,
  CYBERWARE_SLOTS_MAX,
  CYBERWARE_TYPES,
  CYBERWARE_TYPE_LABELS,
  COST_CATEGORY_LABELS,
  WEAPON_QUALITIES,
  WEAPON_QUALITY_LABELS,
  validateCompendiumEntry,
} from '@vtt/shared';
import { saveCompendiumEntry } from '../socket.js';
import { useCompendiumStore } from '../stores/compendiumStore.js';

/**
 * GM editor for the campaign's own compendium entries (stage 13).
 *
 * It exists because the free source material is incomplete: whole weapon
 * classes are missing from it, so the GM must be able to type in what the
 * table needs. The same validation runs here and on the server, so the Polish
 * messages match what the server would reject.
 */
export function CompendiumEditor() {
  const editing = useCompendiumStore((s) => s.editing);
  const entries = useCompendiumStore((s) => s.entries);
  const weaponTypes = useCompendiumStore((s) => s.weaponTypes);
  const close = () => useCompendiumStore.getState().edit(null);

  const existing = editing && editing !== 'new' ? entries[editing] : undefined;
  const [form, setForm] = useState(() => toForm(existing));
  const [issues, setIssues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const meleeTypeIds = useMemo(
    () => new Set(weaponTypes.filter((type) => type.melee).map((type) => type.id)),
    [weaponTypes],
  );

  function patch(next: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...next }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const candidate = fromForm(form, existing?.id);
    const result = validateCompendiumEntry(candidate);
    if (!result.ok) {
      setIssues(result.issues.map((issue) => issue.message));
      return;
    }
    setIssues([]);
    setSaving(true);
    const ack = await saveCompendiumEntry(candidate);
    setSaving(false);
    if (!ack.ok) {
      setIssues([ackErrorText(ack.error)]);
      return;
    }
    close();
  }

  return (
    <div className="dialog-backdrop" onClick={close}>
      <div className="dialog compendium-editor" onClick={(event) => event.stopPropagation()}>
        <h3>{existing ? `Edycja: ${existing.name}` : 'Nowy wpis kompendium'}</h3>
        <form onSubmit={submit}>
          <label className="bot-field">
            Kategoria
            <select
              value={form.category}
              disabled={Boolean(existing)}
              onChange={(event) => patch({ category: event.target.value as CompendiumCategory })}
            >
              {COMPENDIUM_CATEGORIES.map((id) => (
                <option key={id} value={id}>
                  {COMPENDIUM_CATEGORY_LABELS[id]}
                </option>
              ))}
            </select>
          </label>

          <label className="bot-field">
            Nazwa
            <input
              value={form.name}
              maxLength={80}
              onChange={(event) => patch({ name: event.target.value })}
            />
          </label>

          <label className="bot-field">
            {form.category === 'criticalInjury' ? 'Efekt rany' : 'Opis'}
            <textarea
              value={form.description}
              rows={2}
              maxLength={1000}
              onChange={(event) => patch({ description: event.target.value })}
            />
          </label>

          <div className="bot-row-inline" hidden={form.category === 'criticalInjury'}>
            <label className="bot-field bot-field--inline">
              Cena (ed)
              <input
                type="number"
                min={0}
                value={form.cost}
                onChange={(event) => patch({ cost: event.target.value })}
              />
            </label>
            <label className="bot-field bot-field--inline">
              Próg cenowy
              <select
                value={form.costCategory}
                onChange={(event) => patch({ costCategory: event.target.value })}
              >
                <option value="">—</option>
                {COST_CATEGORIES.map((id) => (
                  <option key={id} value={id}>
                    {COST_CATEGORY_LABELS[id]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {form.category === 'weapon' ? (
            <>
              <label className="bot-field">
                Typ broni
                <select
                  value={form.weaponTypeId}
                  onChange={(event) => patch({ weaponTypeId: event.target.value })}
                >
                  <option value="">— własny (podaj obrażenia) —</option>
                  {weaponTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name} ({type.damage})
                    </option>
                  ))}
                </select>
              </label>
              <div className="bot-row-inline">
                <label className="bot-field bot-field--inline">
                  OBR.
                  <input
                    value={form.damage}
                    placeholder={form.weaponTypeId ? 'jak typ' : '3k6'}
                    onChange={(event) => patch({ damage: event.target.value })}
                  />
                </label>
                <label className="bot-field bot-field--inline">
                  LA
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={form.rof}
                    onChange={(event) => patch({ rof: event.target.value })}
                  />
                </label>
                <label className="bot-field bot-field--inline">
                  Magazynek
                  <input
                    type="number"
                    min={0}
                    value={form.magazine}
                    disabled={meleeTypeIds.has(form.weaponTypeId)}
                    onChange={(event) => patch({ magazine: event.target.value })}
                  />
                </label>
              </div>
              <label className="bot-field">
                Jakość
                <select
                  value={form.quality}
                  onChange={(event) => patch({ quality: event.target.value as WeaponQuality })}
                >
                  {WEAPON_QUALITIES.map((id) => (
                    <option key={id} value={id}>
                      {WEAPON_QUALITY_LABELS[id]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="bot-field">
                Cechy specjalne (po przecinku)
                <input
                  value={form.features}
                  onChange={(event) => patch({ features: event.target.value })}
                />
              </label>
            </>
          ) : null}

          {form.category === 'ammo' ? (
            <>
              <fieldset className="bot-field">
                <legend title="Bron komorowa jeden z tych ksztaltow - inaczej naboj do niej nie pasuje.">
                  Rodzaje naboju
                </legend>
                {CPRED_AMMO_PATTERNS.map((pattern) => (
                  <label key={pattern} className="bot-checkbox">
                    <input
                      type="checkbox"
                      checked={form.ammoPatterns.includes(pattern)}
                      onChange={(event) =>
                        patch({
                          ammoPatterns: event.target.checked
                            ? [...form.ammoPatterns, pattern]
                            : form.ammoPatterns.filter((value) => value !== pattern),
                        })
                      }
                    />
                    {CPRED_AMMO_PATTERN_LABELS[pattern]}
                  </label>
                ))}
              </fieldset>
              <div className="bot-row-inline">
                <label className="bot-field bot-field--inline">
                  Pancerz -
                  <input
                    type="number"
                    min={0}
                    max={9}
                    value={form.ablationBonus}
                    placeholder="0"
                    title="Ile punktow OB ponad zwykly 1 zdejmuje ten naboj (przeciwpancerny: 1)."
                    onChange={(event) => patch({ ablationBonus: event.target.value })}
                  />
                </label>
                <label className="bot-field bot-field--inline">
                  Podpalenie
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={form.ammoIgniteDamage}
                    placeholder="0"
                    title="Obrazenia na koniec kazdej tury celu, gdy naboj przebije pancerz."
                    onChange={(event) => patch({ ammoIgniteDamage: event.target.value })}
                  />
                </label>
              </div>
              <div className="bot-row-inline">
                <label className="bot-checkbox">
                  <input
                    type="checkbox"
                    checked={form.ammoNoAblation}
                    onChange={(event) => patch({ ammoNoAblation: event.target.checked })}
                  />
                  Nie uszkadza pancerza
                </label>
                <label className="bot-checkbox">
                  <input
                    type="checkbox"
                    checked={form.ammoNoCritical}
                    onChange={(event) => patch({ ammoNoCritical: event.target.checked })}
                  />
                  Bez ran krytycznych
                </label>
                <label className="bot-checkbox">
                  <input
                    type="checkbox"
                    checked={form.ammoNonLethal}
                    onChange={(event) => patch({ ammoNonLethal: event.target.checked })}
                  />
                  Zostawia 1 PW
                </label>
                <label className="bot-checkbox">
                  <input
                    type="checkbox"
                    checked={form.ammoNoAim}
                    onChange={(event) => patch({ ammoNoAim: event.target.checked })}
                  />
                  Bez Celowania
                </label>
              </div>
              <div className="bot-row-inline">
                <label className="bot-field bot-field--inline">
                  Stozek: PT
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={form.ammoSpreadDv}
                    placeholder="-"
                    title="Wypelnij, jesli naboj obejmuje stozek zamiast jednego celu (srut)."
                    onChange={(event) => patch({ ammoSpreadDv: event.target.value })}
                  />
                </label>
                <label className="bot-field bot-field--inline">
                  Obrazenia
                  <input
                    value={form.ammoSpreadDamage}
                    placeholder="3k6"
                    onChange={(event) => patch({ ammoSpreadDamage: event.target.value })}
                  />
                </label>
                <label className="bot-field bot-field--inline">
                  Zasieg (m)
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={form.ammoSpreadRange}
                    placeholder={String(CPRED_CONE_RANGE_M)}
                    onChange={(event) => patch({ ammoSpreadRange: event.target.value })}
                  />
                </label>
              </div>

              {/*
                Stage 16h - the half of the table that hurts nobody directly.
                The ids are typed rather than picked from a list on purpose: the
                status registry and the injury table are campaign data, and a
                dropdown built from them would go stale the moment the GM edits
                either. The validator refuses a malformed id, so a typo is caught
                on save rather than at the table.
              */}
              <label className="bot-checkbox">
                <input
                  type="checkbox"
                  checked={form.ammoNoDamage}
                  onChange={(event) => patch({ ammoNoDamage: event.target.checked })}
                />
                Nie zadaje obrazen
              </label>
              <div className="bot-row-inline">
                <label className="bot-field bot-field--inline">
                  Test: umiejetnosc
                  <input
                    value={form.ammoCheckSkillId}
                    placeholder="resist-torture-drugs"
                    title="Identyfikator umiejetnosci z rejestru; puste = brak wymuszonego testu."
                    onChange={(event) => patch({ ammoCheckSkillId: event.target.value })}
                  />
                </label>
                <label className="bot-field bot-field--inline">
                  Nazwa
                  <input
                    value={form.ammoCheckSkillLabel}
                    placeholder="Odpornosc na tortury/narkotyki"
                    title="Uzywana, gdy kampania nie ma tej umiejetnosci w rejestrze."
                    onChange={(event) => patch({ ammoCheckSkillLabel: event.target.value })}
                  />
                </label>
                <label className="bot-field bot-field--inline">
                  Cecha
                  <input
                    value={form.ammoCheckStatId}
                    placeholder="will"
                    title="Cecha, na ktorej odbywa sie test, gdy umiejetnosci brak (will, tech...)."
                    onChange={(event) => patch({ ammoCheckStatId: event.target.value })}
                  />
                </label>
                <label className="bot-field bot-field--inline">
                  PT
                  <input
                    type="number"
                    min={1}
                    max={40}
                    value={form.ammoCheckDv}
                    placeholder="-"
                    title="Wypelnij, zeby naboj wymusil test na trafionych."
                    onChange={(event) => patch({ ammoCheckDv: event.target.value })}
                  />
                </label>
              </div>
              <div className="bot-row-inline">
                <label className="bot-field bot-field--inline">
                  Porazka: obrazenia
                  <input
                    value={form.ammoFailDamage}
                    placeholder="3k6"
                    title="Obrazenia bezposrednie - pancerz ich nie zatrzymuje."
                    onChange={(event) => patch({ ammoFailDamage: event.target.value })}
                  />
                </label>
                <label className="bot-field bot-field--inline">
                  Statusy
                  <input
                    value={form.ammoFailStatuses}
                    placeholder="prone, unconscious"
                    title="Identyfikatory statusow po przecinku."
                    onChange={(event) => patch({ ammoFailStatuses: event.target.value })}
                  />
                </label>
                <label className="bot-field bot-field--inline">
                  Rany
                  <input
                    value={form.ammoFailInjuries}
                    placeholder="injury.head-uraz-oka"
                    title="Identyfikatory ran krytycznych z kompendium, po przecinku."
                    onChange={(event) => patch({ ammoFailInjuries: event.target.value })}
                  />
                </label>
                <label className="bot-field bot-field--inline">
                  Czas (s)
                  <input
                    type="number"
                    min={0}
                    max={600}
                    value={form.ammoFailDurationS}
                    placeholder="60"
                    title="Jak dlugo trzymaja sie statusy i rany; puste = do odwolania."
                    onChange={(event) => patch({ ammoFailDurationS: event.target.value })}
                  />
                </label>
              </div>
              <label className="bot-checkbox">
                <input
                  type="checkbox"
                  checked={form.ammoCheckBiological}
                  onChange={(event) => patch({ ammoCheckBiological: event.target.checked })}
                />
                Dziala tylko na cele biologiczne
              </label>
              <div className="bot-row-inline">
                <label className="bot-field bot-field--inline">
                  Dym: bok (m)
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={form.ammoSmokeSide}
                    placeholder="-"
                    title="Wypelnij, jesli naboj zasnuwa kwadrat dymu."
                    onChange={(event) => patch({ ammoSmokeSide: event.target.value })}
                  />
                </label>
                <label className="bot-field bot-field--inline">
                  Kara
                  <input
                    type="number"
                    min={-10}
                    max={-1}
                    value={form.ammoSmokePenalty}
                    placeholder={String(CPRED_SMOKE_PENALTY)}
                    onChange={(event) => patch({ ammoSmokePenalty: event.target.value })}
                  />
                </label>
                <label className="bot-field bot-field--inline">
                  Poprawka: premia
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={form.ammoSmartBonus}
                    placeholder="-"
                    title="Wypelnij, jesli naboj proponuje drugi rzut po bliskim pudle."
                    onChange={(event) => patch({ ammoSmartBonus: event.target.value })}
                  />
                </label>
                <label className="bot-field bot-field--inline">
                  Max chybienie
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={form.ammoSmartMaxMiss}
                    placeholder="4"
                    onChange={(event) => patch({ ammoSmartMaxMiss: event.target.value })}
                  />
                </label>
                <label className="bot-field bot-field--inline">
                  Wymaga
                  <input
                    value={form.ammoSmartRequires}
                    placeholder="Celownik optyczny"
                    title="Ostrzezenie na karcie ataku; VTT tego nie sprawdza (etap 23)."
                    onChange={(event) => patch({ ammoSmartRequires: event.target.value })}
                  />
                </label>
              </div>
            </>
          ) : null}

          {form.category === 'armor' ? (
            <>
              <div className="bot-row-inline">
                <label className="bot-field bot-field--inline">
                  OB
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={form.sp}
                    onChange={(event) => patch({ sp: event.target.value })}
                  />
                </label>
                <label className="bot-field bot-field--inline">
                  Kara
                  <input
                    type="number"
                    min={-6}
                    max={0}
                    value={form.penalty}
                    onChange={(event) => patch({ penalty: event.target.value })}
                  />
                </label>
              </div>
              <fieldset className="bot-field">
                <legend>Lokacje</legend>
                {ARMOR_LOCATIONS.map((location) => (
                  <label key={location} className="bot-checkbox">
                    <input
                      type="checkbox"
                      checked={form.locations.includes(location)}
                      onChange={(event) =>
                        patch({
                          locations: event.target.checked
                            ? [...form.locations, location]
                            : form.locations.filter((value) => value !== location),
                        })
                      }
                    />
                    {ARMOR_LOCATION_LABELS[location]}
                  </label>
                ))}
              </fieldset>
            </>
          ) : null}

          {form.category === 'cyberware' ? (
            <>
              <div className="bot-row-inline">
                <label className="bot-field bot-field--inline">
                  Rodzina
                  <select
                    value={form.cyberwareType}
                    onChange={(event) => patch({ cyberwareType: event.target.value })}
                  >
                    <option value="">— nieokreślona —</option>
                    {CYBERWARE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {CYBERWARE_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="bot-field bot-field--inline">
                  Montaż
                  <select
                    value={form.cyberwareInstall}
                    onChange={(event) => patch({ cyberwareInstall: event.target.value })}
                  >
                    <option value="">— nieokreślony —</option>
                    {CYBERWARE_INSTALLS.map((install) => (
                      <option key={install} value={install}>
                        {CYBERWARE_INSTALL_LABELS[install]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {/* „7 (2k6)" z tabeli: stała przy tworzeniu Postaci, kości w grze. */}
              <div className="bot-row-inline">
                <label className="bot-field bot-field--inline">
                  UC stałe
                  <input
                    type="number"
                    min={0}
                    value={form.humanityLossFixed}
                    placeholder="7"
                    onChange={(event) => patch({ humanityLossFixed: event.target.value })}
                  />
                </label>
                <label className="bot-field bot-field--inline">
                  UC kośćmi
                  <input
                    value={form.humanityLoss}
                    placeholder="2k6"
                    onChange={(event) => patch({ humanityLoss: event.target.value })}
                  />
                </label>
                <label className="bot-checkbox">
                  <input
                    type="checkbox"
                    checked={form.humanityLossHalved}
                    onChange={(event) => patch({ humanityLossHalved: event.target.checked })}
                  />
                  Połowa, w górę
                </label>
              </div>
              <div className="bot-row-inline">
                <label className="bot-checkbox">
                  <input
                    type="checkbox"
                    checked={form.foundation}
                    onChange={(event) => patch({ foundation: event.target.checked })}
                  />
                  Wszczep podstawowy
                </label>
                <label className="bot-field bot-field--inline">
                  {form.foundation ? 'Daje gniazd' : 'Zajmuje gniazd'}
                  <input
                    type="number"
                    min={0}
                    max={CYBERWARE_SLOTS_MAX}
                    value={form.foundation ? form.slots : form.slotCost}
                    onChange={(event) =>
                      patch(
                        form.foundation
                          ? { slots: event.target.value }
                          : { slotCost: event.target.value },
                      )
                    }
                  />
                </label>
                <label className="bot-field bot-field--inline">
                  Wymaga
                  <input
                    value={form.cyberwareRequires}
                    placeholder="cyberoka"
                    onChange={(event) => patch({ cyberwareRequires: event.target.value })}
                  />
                </label>
              </div>
            </>
          ) : null}

          {form.category === 'criticalInjury' ? (
            <>
              <div className="bot-row-inline">
                <label className="bot-field bot-field--inline">
                  Tabela
                  <select
                    value={form.injuryTable}
                    onChange={(event) => patch({ injuryTable: event.target.value })}
                  >
                    {CRITICAL_INJURY_TABLES.map((id) => (
                      <option key={id} value={id}>
                        {CRITICAL_INJURY_TABLE_LABELS[id]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="bot-field bot-field--inline">
                  Wynik 2k6
                  <input
                    type="number"
                    min={CRITICAL_INJURY_ROLL_MIN}
                    max={CRITICAL_INJURY_ROLL_MAX}
                    value={form.injuryRoll}
                    onChange={(event) => patch({ injuryRoll: event.target.value })}
                  />
                </label>
                <label className="bot-field bot-field--inline">
                  Test Przeżywalności
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={form.deathSavePenalty}
                    placeholder="+0"
                    title="O ile ta rana podnosi podstawową trudność Testu Przeżywalności."
                    onChange={(event) => patch({ deathSavePenalty: event.target.value })}
                  />
                </label>
              </div>
              <div className="bot-row-inline">
                <label className="bot-field bot-field--inline">
                  Łatanie
                  <input
                    value={form.quickFix}
                    placeholder="Ratownictwo medyczne PT 13"
                    onChange={(event) => patch({ quickFix: event.target.value })}
                  />
                </label>
                <label className="bot-field bot-field--inline">
                  Leczenie
                  <input
                    value={form.treatment}
                    placeholder="Chirurgia PT 15"
                    onChange={(event) => patch({ treatment: event.target.value })}
                  />
                </label>
              </div>
              <p className="compendium-note">
                Efekt rany wpisz w polu „Opis” — to on trafia na kartę postaci.
              </p>
            </>
          ) : null}

          {issues.length > 0 ? (
            <ul className="sheet-issues">
              {issues.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}

          <div className="form-row">
            <button type="submit" className="small-button" disabled={saving}>
              {saving ? 'Zapisywanie…' : 'Zapisz'}
            </button>
            <button type="button" className="small-button" onClick={close}>
              Anuluj
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface EditorForm {
  category: CompendiumCategory;
  name: string;
  description: string;
  cost: string;
  costCategory: string;
  weaponTypeId: string;
  quality: WeaponQuality;
  damage: string;
  rof: string;
  magazine: string;
  features: string;
  sp: string;
  penalty: string;
  locations: string[];
  /** Stage 16g — which rounds this ammunition is made in, and what it does. */
  ammoPatterns: string[];
  ablationBonus: string;
  /* Stage 16h — the rounds that hurt nobody directly. */
  ammoNoDamage: boolean;
  ammoCheckSkillId: string;
  ammoCheckSkillLabel: string;
  ammoCheckStatId: string;
  ammoCheckDv: string;
  ammoCheckBiological: boolean;
  ammoFailDamage: string;
  ammoFailStatuses: string;
  ammoFailInjuries: string;
  ammoFailDurationS: string;
  ammoSmokeSide: string;
  ammoSmokePenalty: string;
  ammoSmartMaxMiss: string;
  ammoSmartBonus: string;
  ammoSmartRequires: string;
  ammoNoAblation: boolean;
  ammoNoCritical: boolean;
  ammoNonLethal: boolean;
  ammoNoAim: boolean;
  ammoIgniteDamage: string;
  ammoSpreadDv: string;
  ammoSpreadDamage: string;
  ammoSpreadRange: string;
  humanityLoss: string;
  humanityLossFixed: string;
  humanityLossHalved: boolean;
  cyberwareType: string;
  cyberwareInstall: string;
  slots: string;
  slotCost: string;
  cyberwareRequires: string;
  foundation: boolean;
  injuryTable: string;
  injuryRoll: string;
  quickFix: string;
  treatment: string;
  deathSavePenalty: string;
}

function toForm(entry: CompendiumEntry | undefined): EditorForm {
  return {
    category: entry?.category ?? 'weapon',
    name: entry?.name ?? '',
    description: entry?.description ?? '',
    cost: entry?.cost === null || entry?.cost === undefined ? '' : String(entry.cost),
    costCategory: entry?.costCategory ?? '',
    weaponTypeId: entry?.category === 'weapon' ? (entry.weaponTypeId ?? '') : '',
    quality: entry?.category === 'weapon' ? entry.quality : 'standard',
    damage: entry?.category === 'weapon' ? (entry.damage ?? '') : '',
    rof: entry?.category === 'weapon' && entry.rof !== undefined ? String(entry.rof) : '',
    magazine:
      entry?.category === 'weapon' && entry.magazine !== undefined && entry.magazine !== null
        ? String(entry.magazine)
        : '',
    features: entry?.category === 'weapon' ? (entry.features ?? []).join(', ') : '',
    sp: entry?.category === 'armor' ? String(entry.sp) : '',
    penalty: entry?.category === 'armor' && entry.penalty ? String(entry.penalty) : '',
    locations: entry?.category === 'armor' ? [...entry.locations] : ['body'],
    ammoPatterns: entry?.category === 'ammo' ? [...entry.patterns] : ['bullet'],
    ablationBonus:
      entry?.category === 'ammo' && entry.ablationBonus ? String(entry.ablationBonus) : '',
    ammoNoAblation: entry?.category === 'ammo' ? Boolean(entry.noAblation) : false,
    ammoNoCritical: entry?.category === 'ammo' ? Boolean(entry.noCriticalInjury) : false,
    ammoNonLethal: entry?.category === 'ammo' ? Boolean(entry.nonLethal) : false,
    ammoNoDamage: entry?.category === 'ammo' ? Boolean(entry.noDamage) : false,
    ammoCheckSkillId: entry?.category === 'ammo' && entry.check ? entry.check.skillId : '',
    ammoCheckSkillLabel:
      entry?.category === 'ammo' && entry.check ? (entry.check.skillLabel ?? '') : '',
    ammoCheckStatId: entry?.category === 'ammo' && entry.check ? (entry.check.statId ?? '') : '',
    ammoCheckDv: entry?.category === 'ammo' && entry.check ? String(entry.check.dv) : '',
    ammoCheckBiological:
      entry?.category === 'ammo' && entry.check ? Boolean(entry.check.biologicalOnly) : false,
    ammoFailDamage:
      entry?.category === 'ammo' && entry.check ? (entry.check.failure.damage ?? '') : '',
    ammoFailStatuses:
      entry?.category === 'ammo' && entry.check
        ? (entry.check.failure.statuses ?? []).join(', ')
        : '',
    ammoFailInjuries:
      entry?.category === 'ammo' && entry.check
        ? (entry.check.failure.injuries ?? []).join(', ')
        : '',
    ammoFailDurationS:
      entry?.category === 'ammo' && entry.check?.failure.durationS
        ? String(entry.check.failure.durationS)
        : '',
    ammoSmokeSide: entry?.category === 'ammo' && entry.smoke ? String(entry.smoke.sideM) : '',
    ammoSmokePenalty: entry?.category === 'ammo' && entry.smoke ? String(entry.smoke.penalty) : '',
    ammoSmartMaxMiss: entry?.category === 'ammo' && entry.smart ? String(entry.smart.maxMiss) : '',
    ammoSmartBonus: entry?.category === 'ammo' && entry.smart ? String(entry.smart.bonus) : '',
    ammoSmartRequires:
      entry?.category === 'ammo' && entry.smart ? (entry.smart.requires ?? '') : '',
    ammoNoAim: entry?.category === 'ammo' ? Boolean(entry.noAim) : false,
    ammoIgniteDamage:
      entry?.category === 'ammo' && entry.ignites ? String(entry.ignites.damage) : '',
    ammoSpreadDv: entry?.category === 'ammo' && entry.spread ? String(entry.spread.dv) : '',
    ammoSpreadDamage: entry?.category === 'ammo' && entry.spread ? entry.spread.damage : '',
    ammoSpreadRange:
      entry?.category === 'ammo' && entry.spread ? String(entry.spread.coneRangeM) : '',
    humanityLoss: entry?.category === 'cyberware' ? (entry.humanityLoss ?? '') : '',
    humanityLossFixed:
      entry?.category === 'cyberware' && entry.humanityLossFixed !== undefined
        ? String(entry.humanityLossFixed)
        : '',
    humanityLossHalved: entry?.category === 'cyberware' ? Boolean(entry.humanityLossHalved) : false,
    cyberwareType: entry?.category === 'cyberware' ? (entry.type ?? '') : '',
    cyberwareInstall: entry?.category === 'cyberware' ? (entry.install ?? '') : '',
    slots: entry?.category === 'cyberware' && entry.slots !== undefined ? String(entry.slots) : '',
    slotCost:
      entry?.category === 'cyberware' && entry.slotCost !== undefined ? String(entry.slotCost) : '',
    cyberwareRequires: entry?.category === 'cyberware' ? (entry.requires ?? '') : '',
    foundation: entry?.category === 'cyberware' ? Boolean(entry.foundation) : false,
    injuryTable: entry?.category === 'criticalInjury' ? entry.table : 'body',
    injuryRoll: entry?.category === 'criticalInjury' ? String(entry.roll) : '',
    quickFix: entry?.category === 'criticalInjury' ? (entry.quickFix ?? '') : '',
    treatment: entry?.category === 'criticalInjury' ? (entry.treatment ?? '') : '',
    deathSavePenalty:
      entry?.category === 'criticalInjury' && entry.deathSavePenalty
        ? String(entry.deathSavePenalty)
        : '',
  };
}

/**
 * A comma-separated list of ids as typed by the GM (stage 16h). Trimmed and
 * emptied of blanks; the server's validator is what refuses a malformed one, so
 * a typo comes back as a named issue rather than being silently dropped here.
 */
function idList(value: string): string[] {
  return value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function numberOrUndefined(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function fromForm(form: EditorForm, existingId: string | undefined): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ...(existingId ? { id: existingId } : {}),
    category: form.category,
    name: form.name,
    description: form.description || undefined,
    cost: numberOrUndefined(form.cost) ?? null,
    costCategory: form.costCategory || undefined,
    custom: true,
  };
  if (form.category === 'weapon') {
    return {
      ...base,
      weaponTypeId: form.weaponTypeId || null,
      quality: form.quality,
      damage: form.damage || undefined,
      rof: numberOrUndefined(form.rof),
      magazine: numberOrUndefined(form.magazine),
      features: form.features
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    };
  }
  if (form.category === 'ammo') {
    const ignite = numberOrUndefined(form.ammoIgniteDamage);
    const spreadDv = numberOrUndefined(form.ammoSpreadDv);
    const checkDv = numberOrUndefined(form.ammoCheckDv);
    const failDuration = numberOrUndefined(form.ammoFailDurationS);
    const smokeSide = numberOrUndefined(form.ammoSmokeSide);
    const smartBonus = numberOrUndefined(form.ammoSmartBonus);
    return {
      ...base,
      patterns: form.ammoPatterns,
      ablationBonus: numberOrUndefined(form.ablationBonus),
      noAblation: form.ammoNoAblation,
      noCriticalInjury: form.ammoNoCritical,
      nonLethal: form.ammoNonLethal,
      noAim: form.ammoNoAim,
      // Burning is the only status ammunition sets in this stage, so the editor
      // offers the number rather than a free-text status id nobody could guess.
      ...(ignite ? { ignites: { statusId: CPRED_ON_FIRE_STATUS_ID, damage: ignite } } : {}),
      ...(spreadDv
        ? {
            spread: {
              dv: spreadDv,
              damage: form.ammoSpreadDamage,
              coneRangeM: numberOrUndefined(form.ammoSpreadRange) ?? CPRED_CONE_RANGE_M,
            },
          }
        : {}),
      // Stage 16h. The DV is what decides whether there is a check at all — a
      // row with a skill and no DV is half-typed, and the validator says so.
      noDamage: form.ammoNoDamage,
      ...(checkDv
        ? {
            check: {
              skillId: form.ammoCheckSkillId.trim(),
              ...(form.ammoCheckSkillLabel.trim()
                ? { skillLabel: form.ammoCheckSkillLabel.trim() }
                : {}),
              ...(form.ammoCheckStatId.trim() ? { statId: form.ammoCheckStatId.trim() } : {}),
              dv: checkDv,
              biologicalOnly: form.ammoCheckBiological,
              failure: {
                ...(form.ammoFailDamage.trim() ? { damage: form.ammoFailDamage.trim() } : {}),
                ...(idList(form.ammoFailStatuses).length > 0
                  ? { statuses: idList(form.ammoFailStatuses) }
                  : {}),
                ...(idList(form.ammoFailInjuries).length > 0
                  ? { injuries: idList(form.ammoFailInjuries) }
                  : {}),
                ...(failDuration ? { durationS: failDuration } : {}),
              },
            },
          }
        : {}),
      ...(smokeSide
        ? {
            smoke: {
              sideM: smokeSide,
              penalty: numberOrUndefined(form.ammoSmokePenalty) ?? CPRED_SMOKE_PENALTY,
            },
          }
        : {}),
      ...(smartBonus !== undefined
        ? {
            smart: {
              maxMiss: numberOrUndefined(form.ammoSmartMaxMiss) ?? 4,
              bonus: smartBonus,
              ...(form.ammoSmartRequires.trim() ? { requires: form.ammoSmartRequires.trim() } : {}),
            },
          }
        : {}),
    };
  }
  if (form.category === 'armor') {
    return {
      ...base,
      sp: numberOrUndefined(form.sp) ?? Number.NaN,
      penalty: numberOrUndefined(form.penalty),
      locations: form.locations,
    };
  }
  if (form.category === 'cyberware') {
    return {
      ...base,
      humanityLoss: form.humanityLoss || undefined,
      humanityLossFixed: numberOrUndefined(form.humanityLossFixed),
      humanityLossHalved: form.humanityLossHalved,
      type: form.cyberwareType || undefined,
      install: form.cyberwareInstall || undefined,
      slots: numberOrUndefined(form.slots),
      slotCost: numberOrUndefined(form.slotCost),
      requires: form.cyberwareRequires || undefined,
      foundation: form.foundation,
    };
  }
  if (form.category === 'criticalInjury') {
    return {
      ...base,
      table: form.injuryTable,
      roll: numberOrUndefined(form.injuryRoll) ?? Number.NaN,
      quickFix: form.quickFix || undefined,
      treatment: form.treatment || undefined,
      deathSavePenalty: numberOrUndefined(form.deathSavePenalty),
    };
  }
  return base;
}

function ackErrorText(code: string): string {
  if (code.startsWith('INVALID_ENTRY:')) return code.slice('INVALID_ENTRY:'.length);
  switch (code) {
    case 'ID_TAKEN':
      return 'Wpis o tej nazwie już jest w kompendium — zmień nazwę.';
    case 'ENTRY_NOT_FOUND':
      return 'Nie znaleziono wpisu — odśwież stronę.';
    case 'NO_CAMPAIGN':
      return 'Brak aktywnej kampanii.';
    case 'FORBIDDEN':
      return 'Tylko MG może zmieniać kompendium.';
    default:
      return `Błąd zapisu: ${code}`;
  }
}
