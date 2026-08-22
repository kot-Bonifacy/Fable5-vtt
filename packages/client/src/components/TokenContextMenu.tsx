import { useEffect, useState } from 'react';
import type {
  CampaignDetail,
  CpredCombatProfile,
  TokenPatch,
  TokenView,
  WeaponEntry,
} from '@vtt/shared';
import {
  ARMOR_SP_MAX,
  CPRED_INTIMIDATED_STATUS_ID,
  CPRED_STAT_MAX,
  CPRED_STAT_MIN,
  LIGHT_COLORS,
  LIGHT_DEFAULT_COLOR,
  LIGHT_RADIUS_MAX_METRES,
  TOKEN_HP_LIMIT,
  TOKEN_LIGHT_DEFAULT_BRIGHT_M,
  TOKEN_LIGHT_DEFAULT_DIM_M,
  TOKEN_SIZE_MAX,
  TOKEN_SIZE_MIN,
  VISION_RANGE_MAX_METRES,
  createDefaultCombatProfile,
  isWeaponEntry,
  resolveWeapon,
  sanitizeCombatProfile,
} from '@vtt/shared';
import { apiGet } from '../api.js';
import {
  addToCombat,
  deleteToken,
  removeFromCombat,
  toggleTokenLight,
  setTokenFeared,
  updateToken,
} from '../socket.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useCombatStore } from '../stores/combatStore.js';
import { useCompendiumStore } from '../stores/compendiumStore.js';
import { AttackLauncher } from './AttackLauncher.js';
import { FacedownLauncher } from './FacedownLauncher.js';
import type { TokenMenuState } from './MapArea.js';

const MENU_WIDTH = 240;

interface PlayerOption {
  id: string;
  name: string;
}

/**
 * The statist's fighting numbers (stage 16b).
 *
 * Twelve fields instead of a character sheet, and the shortness is the feature:
 * a ganger who exists to fire three shots and fall over should be statted
 * between two sentences of narration. Everything not asked for here is the
 * rulebook's ordinary human — see `systems/cpred/statist.ts`.
 */
function StatistProfileFields({
  profile,
  onChange,
}: {
  profile: CpredCombatProfile;
  onChange: (next: CpredCombatProfile) => void;
}) {
  const entries = useCompendiumStore((s) => s.entries);
  const order = useCompendiumStore((s) => s.order);
  const weaponTypeById = useCompendiumStore((s) => s.weaponTypeById);

  const weapons = order
    .map((id) => entries[id])
    .filter((entry): entry is WeaponEntry => !!entry && isWeaponEntry(entry));

  function set<K extends keyof CpredCombatProfile>(key: K, value: CpredCombatProfile[K]) {
    onChange({ ...profile, [key]: value });
  }

  /**
   * Picking a weapon copies its numbers, the way a sheet row does — and like a
   * sheet row it has to read them *resolved*. Obrażenia i magazynek mieszkają na
   * typie broni, nie na wpisie: żaden ze stu wpisów katalogu nie niesie własnego
   * `damage` ani `magazine`, więc czytanie ich wprost z wpisu dawało statyście
   * pięści (1k6) i magazynek 0 niezależnie od tego, co MG wybrał.
   */
  function pickWeapon(compendiumId: string) {
    const entry = weapons.find((weapon) => weapon.id === compendiumId);
    if (!entry) {
      onChange({ ...profile, weaponId: null, weaponName: 'Pięści', weaponDamage: '1k6' });
      return;
    }
    const resolved = resolveWeapon(entry, {
      weaponTypeById: new Map(Object.entries(weaponTypeById)),
    });
    const magazine = resolved.magazine ?? 0;
    onChange({
      ...profile,
      weaponId: entry.id,
      weaponName: entry.name,
      weaponDamage: resolved.damage,
      ammoMax: magazine,
      ammoCurrent: magazine,
    });
  }

  const statFields: { key: 'ref' | 'dex' | 'body' | 'will'; label: string }[] = [
    { key: 'ref', label: 'REF' },
    { key: 'dex', label: 'ZW' },
    { key: 'body', label: 'BC' },
    { key: 'will', label: 'SW' },
  ];

  return (
    <>
      <div className="scene-editor-row">
        {statFields.map((field) => (
          <label key={field.key} className="auth-label" title={`Cecha ${field.label}`}>
            {field.label}
            <input
              type="number"
              className="scene-number-input"
              min={CPRED_STAT_MIN}
              max={CPRED_STAT_MAX}
              value={profile[field.key]}
              onChange={(e) => set(field.key, Number(e.target.value))}
            />
          </label>
        ))}
      </div>
      <div className="scene-editor-row">
        <label className="auth-label" title="Poziom umiejętności, którą strzela ta broń">
          Umiejętność
          <input
            type="number"
            className="scene-number-input"
            min={0}
            max={10}
            value={profile.skillLevel}
            onChange={(e) => set('skillLevel', Number(e.target.value))}
          />
        </label>
        <label className="auth-label" title="Poziom Uniku — z niego liczy się PT obrony statysty">
          Unik
          <input
            type="number"
            className="scene-number-input"
            min={0}
            max={10}
            value={profile.evasion}
            onChange={(e) => set('evasion', Number(e.target.value))}
          />
        </label>
        <label className="auth-label" title="OB pancerza; schodzi automatycznie przy trafieniu">
          Pancerz OB
          <input
            type="number"
            className="scene-number-input"
            min={0}
            max={ARMOR_SP_MAX}
            value={profile.armorSp}
            onChange={(e) => set('armorSp', Number(e.target.value))}
          />
        </label>
      </div>

      <label className="auth-label" htmlFor="statist-weapon">
        Broń
      </label>
      <select
        id="statist-weapon"
        value={profile.weaponId ?? ''}
        onChange={(e) => pickWeapon(e.target.value)}
      >
        <option value="">— bez broni (pięści) —</option>
        {weapons.map((weapon) => (
          <option key={weapon.id} value={weapon.id}>
            {weapon.name}
          </option>
        ))}
      </select>
      <div className="scene-editor-row">
        <label className="auth-label" title="Naboje w magazynku">
          Amunicja
          <input
            type="number"
            className="scene-number-input"
            min={0}
            max={profile.ammoMax}
            value={profile.ammoCurrent}
            onChange={(e) => set('ammoCurrent', Number(e.target.value))}
          />
        </label>
        <span className="auth-hint">z {profile.ammoMax}</span>
      </div>
      <p className="auth-hint">
        Reszta cech statysty to 5 (przeciętny człowiek). PW bierze się z paska powyżej, nie z
        profilu.
      </p>
    </>
  );
}

function TokenEditDialog({ token, onClose }: { token: TokenView; onClose: () => void }) {
  const [name, setName] = useState(token.name);
  const [size, setSize] = useState(token.size);
  const [ownerId, setOwnerId] = useState<string | ''>(token.ownerId ?? '');
  const [characterId, setCharacterId] = useState<string | ''>(token.characterId ?? '');
  const [hasHp, setHasHp] = useState(token.hp != null);
  const [hpCurrent, setHpCurrent] = useState(token.hp?.current ?? 10);
  const [hpMax, setHpMax] = useState(token.hp?.max ?? 10);
  const [visionRange, setVisionRange] = useState(
    token.visionRange == null ? '' : String(token.visionRange),
  );
  const [hasLight, setHasLight] = useState(token.light != null);
  const [lightBrightM, setLightBrightM] = useState(
    token.light?.brightM ?? TOKEN_LIGHT_DEFAULT_BRIGHT_M,
  );
  const [lightDimM, setLightDimM] = useState(token.light?.dimM ?? TOKEN_LIGHT_DEFAULT_DIM_M);
  const [lightColor, setLightColor] = useState(token.light?.color ?? LIGHT_DEFAULT_COLOR);
  const [lightFlicker, setLightFlicker] = useState(token.light?.flicker ?? false);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hasProfile, setHasProfile] = useState(token.combatProfile != null);
  const [profile, setProfile] = useState<CpredCombatProfile>(() =>
    token.combatProfile ? sanitizeCombatProfile(token.combatProfile) : createDefaultCombatProfile(),
  );
  const characters = useCharacterStore((s) => s.characters);
  const characterOrder = useCharacterStore((s) => s.order);
  const linked = characterId !== '';

  useEffect(() => {
    apiGet<CampaignDetail[]>('/api/campaigns')
      .then((campaigns) => {
        const active = campaigns.find((c) => c.active);
        setPlayers(active?.players.map((p) => ({ id: p.id, name: p.name })) ?? []);
      })
      .catch(() => setPlayers([]));
  }, []);

  async function save() {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError('Nazwa nie może być pusta.');
      return;
    }
    setSaving(true);
    setError(null);
    const parsedRange = visionRange.trim() === '' ? null : Number(visionRange);
    if (parsedRange !== null && (!Number.isFinite(parsedRange) || parsedRange <= 0)) {
      setError('Zasięg widzenia musi być liczbą metrów większą od zera (albo pusty).');
      return;
    }
    const patch: TokenPatch = {
      name: trimmed,
      size,
      ownerId: ownerId === '' ? null : ownerId,
      characterId: characterId === '' ? null : characterId,
      visionRange: parsedRange,
      // Taking the lamp away is `null`, not a lamp of radius zero — see
      // `sanitizeTokenLight`. The switch keeps whatever state it was in, so
      // retuning a lit torch does not put it out.
      light: hasLight
        ? {
            brightM: lightBrightM,
            dimM: lightDimM,
            color: lightColor,
            flicker: lightFlicker,
            on: token.light?.on ?? true,
          }
        : null,
      // A linked token takes its HP from the sheet — never write them here.
      ...(linked ? {} : { hp: hasHp ? { current: hpCurrent, max: hpMax } : null }),
      // A token with a real sheet has no use for a statist profile, and keeping
      // both would give the attack path two sources for one weapon (stage 16b).
      combatProfile: linked || !hasProfile ? null : { ...profile },
    };
    const ack = await updateToken(token.id, patch);
    setSaving(false);
    if (ack.ok) onClose();
    else setError('Nie udało się zapisać tokenu.');
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="panel-section-title">Edycja tokenu</h3>

        <label className="auth-label" htmlFor="token-name">
          Nazwa
        </label>
        <input
          id="token-name"
          type="text"
          maxLength={64}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <label className="auth-label" htmlFor="token-size">
          Rozmiar (kratki)
        </label>
        <select id="token-size" value={size} onChange={(e) => setSize(Number(e.target.value))}>
          {Array.from(
            { length: TOKEN_SIZE_MAX - TOKEN_SIZE_MIN + 1 },
            (_, i) => TOKEN_SIZE_MIN + i,
          ).map((s) => (
            <option key={s} value={s}>
              {s}×{s}
            </option>
          ))}
        </select>

        <label className="auth-label" htmlFor="token-vision">
          Zasięg widzenia (m)
        </label>
        <input
          id="token-vision"
          type="number"
          min={1}
          max={VISION_RANGE_MAX_METRES}
          step={0.5}
          placeholder="bez ograniczenia"
          value={visionRange}
          onChange={(e) => setVisionRange(e.target.value)}
          title="Działa na scenach w trybie „Dynamiczna”. Puste pole = widzi tak daleko, jak pozwalają ściany."
        />
        <p className="auth-hint">
          Puste pole = ograniczają tylko ściany. Ma znaczenie na scenach z trybem „Dynamiczna”.
        </p>

        <label className="auth-label">
          <input
            type="checkbox"
            checked={hasLight}
            onChange={(e) => setHasLight(e.target.checked)}
          />{' '}
          Nosi światło (latarka, pochodnia)
        </label>
        {hasLight && (
          <>
            <div className="scene-editor-row">
              <label className="auth-label" htmlFor="token-light-bright">
                jasno (m)
              </label>
              <input
                id="token-light-bright"
                type="number"
                className="scene-number-input"
                min={0}
                max={LIGHT_RADIUS_MAX_METRES}
                step={1}
                value={lightBrightM}
                onChange={(e) => setLightBrightM(Number(e.target.value))}
              />
              <label className="auth-label" htmlFor="token-light-dim">
                mrok (m)
              </label>
              <input
                id="token-light-dim"
                type="number"
                className="scene-number-input"
                min={0}
                max={LIGHT_RADIUS_MAX_METRES}
                step={1}
                value={lightDimM}
                onChange={(e) => setLightDimM(Number(e.target.value))}
              />
            </div>
            <div className="map-color-row" role="group" aria-label="Barwa światła tokenu">
              {LIGHT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`map-color${lightColor === color ? ' map-color--active' : ''}`}
                  style={{ background: color }}
                  title={`Barwa ${color}`}
                  aria-label={`Barwa ${color}`}
                  aria-pressed={lightColor === color}
                  onClick={() => setLightColor(color)}
                />
              ))}
            </div>
            <label className="auth-label">
              <input
                type="checkbox"
                checked={lightFlicker}
                onChange={(e) => setLightFlicker(e.target.checked)}
              />{' '}
              Migotanie (ogień, psujący się neon)
            </label>
            <p className="auth-hint">
              Latarkę zapala i gasi także sam gracz — z paska mapy albo z menu tokenu. Widać ją
              tylko na ciemnych scenach w trybie „Dynamiczna”.
            </p>
          </>
        )}

        <label className="auth-label" htmlFor="token-owner">
          Właściciel
        </label>
        <select id="token-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
          <option value="">— MG (NPC) —</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <label className="auth-label" htmlFor="token-character">
          Karta postaci
        </label>
        <select
          id="token-character"
          value={characterId}
          onChange={(e) => setCharacterId(e.target.value)}
          title="Powiązanie z kartą: pasek PW tokenu czyta wtedy wartości z karty"
        >
          <option value="">— brak (własne HP tokenu) —</option>
          {characterOrder.map((id) => {
            const character = characters[id];
            if (!character) return null;
            return (
              <option key={id} value={id}>
                {character.name}
              </option>
            );
          })}
        </select>

        {linked ? (
          <p className="placeholder-text">
            Pasek PW pochodzi z karty postaci — zmieniaj go na karcie albo skrótami +/− w menu
            tokenu.
          </p>
        ) : (
          <label className="auth-label">
            <input type="checkbox" checked={hasHp} onChange={(e) => setHasHp(e.target.checked)} />{' '}
            Pasek HP
          </label>
        )}
        {!linked && hasHp && (
          <div className="scene-editor-row">
            <input
              type="number"
              className="scene-number-input"
              min={0}
              max={TOKEN_HP_LIMIT}
              value={hpCurrent}
              onChange={(e) => setHpCurrent(Number(e.target.value))}
            />
            <span>/</span>
            <input
              type="number"
              className="scene-number-input"
              min={1}
              max={TOKEN_HP_LIMIT}
              value={hpMax}
              onChange={(e) => setHpMax(Number(e.target.value))}
            />
          </div>
        )}

        {!linked && (
          <>
            <label className="auth-label">
              <input
                type="checkbox"
                checked={hasProfile}
                onChange={(e) => setHasProfile(e.target.checked)}
              />{' '}
              Profil bojowy (statysta bez karty postaci)
            </label>
            {hasProfile && <StatistProfileFields profile={profile} onChange={setProfile} />}
          </>
        )}

        {error && <p className="auth-error">{error}</p>}
        <div className="scene-editor-row">
          <button
            className="primary-button"
            type="button"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? 'Zapisywanie…' : 'Zapisz'}
          </button>
          <button type="button" className="small-button" onClick={onClose}>
            Anuluj
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Naklejki, które **same** niczego nie liczą — i muszą to powiedzieć.
 *
 * „Onieśmielony" bierze się z przegranej Konfrontacji (23c) i kara −2 wymaga
 * dwóch rzeczy naraz: naklejki i adresu przeciwnika zapisanego przy figurze.
 * Od 22.08 drugą połowę da się dopisać ręcznie — listą „Boi się:" pod statusami
 * (`token:feared`) — więc zdanie mówi, gdzie ją znaleźć, zamiast samo ostrzegać.
 */
const STATUS_HINTS: Record<string, string> = {
  [CPRED_INTIMIDATED_STATUS_ID]:
    'Sama naklejka nie nakłada −2 — kara należy się konkretnemu przeciwnikowi. Zaznacz go na liście „Boi się:" poniżej, inaczej naklejka jest tylko oznaczeniem opisowym.',
};

/**
 * „Boi się:" — druga połowa kary za przegraną Konfrontację (23c).
 *
 * Lista figur sceny z polami wyboru, bo Konfrontacji można przegrać kilka
 * naraz. Bez zaznaczonego kogoś naklejka „Onieśmielony" nic nie liczy, i to
 * jest jedyny powód, dla którego ta sekcja istnieje — pokazuje się wyłącznie
 * przy zaznaczonym statusie, żeby nie zaśmiecać menu każdego żetonu.
 */
function FearedPicker({ token }: { token: TokenView }) {
  const tokens = useTokenStore((s) => s.tokens);
  const feared = token.feared ?? [];
  const others = Object.values(tokens)
    .filter((other) => other.sceneId === token.sceneId && other.id !== token.id)
    .sort((a, b) => a.name.localeCompare(b.name, 'pl'));

  function toggle(otherId: string) {
    const next = feared.includes(otherId)
      ? feared.filter((id) => id !== otherId)
      : [...feared, otherId];
    void setTokenFeared(token.id, next);
  }

  return (
    <>
      <p className="context-menu-section">
        Boi się{feared.length === 0 ? ' — nikogo, więc −2 nie działa' : ''}
      </p>
      {others.length === 0 ? (
        <p className="context-menu-empty">Na scenie nie ma nikogo innego.</p>
      ) : (
        <div className="context-menu-statuses">
          {others.map((other) => (
            <label
              key={other.id}
              className="context-menu-status"
              title={`−2 do Testów tej figury przeciwko: ${other.name}`}
            >
              <input
                type="checkbox"
                checked={feared.includes(other.id)}
                onChange={() => toggle(other.id)}
              />
              {other.name}
            </label>
          ))}
        </div>
      )}
    </>
  );
}

export function TokenContextMenu({ menu, onClose }: { menu: TokenMenuState; onClose: () => void }) {
  const token = useTokenStore((s) => s.tokens[menu.tokenId]);
  const statuses = useTokenStore((s) => s.statuses);
  const combat = useCombatStore((s) => s.combat);
  const [editing, setEditing] = useState(false);
  const [aiming, setAiming] = useState(false);
  const [staring, setStaring] = useState(false);
  const combatant = combat?.combatants.find((c) => c.tokenId === menu.tokenId) ?? null;

  // The token can vanish under the open menu (deleted in another tab).
  useEffect(() => {
    if (!token) onClose();
  }, [token, onClose]);
  if (!token) return null;

  if (editing) {
    return (
      <TokenEditDialog
        token={token}
        onClose={() => {
          setEditing(false);
          onClose();
        }}
      />
    );
  }

  const left = Math.min(menu.x, window.innerWidth - MENU_WIDTH - 8);
  const top = Math.min(menu.y, window.innerHeight - 320);

  function toggleStatus(statusId: string) {
    if (!token) return;
    const next = token.statuses.includes(statusId)
      ? token.statuses.filter((s) => s !== statusId)
      : [...token.statuses, statusId];
    void updateToken(token.id, { statuses: next });
  }

  /**
   * Quick damage/healing from the map. For a linked token the server writes
   * the value through to the sheet, so both stay in sync.
   */
  function changeHp(delta: number) {
    const hp = token?.hp;
    if (!token || !hp) return;
    const current = Math.max(0, Math.min(hp.max, hp.current + delta));
    if (current === hp.current) return;
    void updateToken(token.id, { hp: { current, max: hp.max } });
  }

  function openSheet() {
    if (!token?.characterId) return;
    useCharacterStore.getState().openSheet(token.characterId);
    onClose();
  }

  async function remove() {
    if (!token) return;
    if (!window.confirm(`Usunąć token „${token.name}”?`)) return;
    await deleteToken(token.id);
    onClose();
  }

  return (
    <>
      <div
        className="context-menu-backdrop"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div className="context-menu" style={{ left, top, width: MENU_WIDTH }}>
        <p className="context-menu-title">{token.name}</p>
        {token.hp && (
          <div className="context-menu-hp">
            <span className="context-menu-hp-value" title="Punkty Wytrzymałości">
              PW {token.hp.current}/{token.hp.max}
            </span>
            <span className="context-menu-hp-buttons">
              {[-5, -1, 1, 5].map((delta) => (
                <button
                  key={delta}
                  type="button"
                  className="small-button"
                  onClick={() => changeHp(delta)}
                  title={delta < 0 ? `Obrażenia ${-delta}` : `Leczenie ${delta}`}
                >
                  {delta > 0 ? `+${delta}` : delta}
                </button>
              ))}
            </span>
          </div>
        )}
        {token.characterId && (
          <button type="button" className="context-menu-item" onClick={openSheet}>
            📄 Otwórz kartę postaci
          </button>
        )}
        {/* Stage 16b: the map's own way into the attack. Before it, firing meant
            opening somebody's sheet — and an NPC without one could not fire. */}
        <button
          type="button"
          className="context-menu-item"
          onClick={() => setAiming((open) => !open)}
        >
          🎯 Atak…
        </button>
        {aiming && <AttackLauncher token={token} onArmed={onClose} />}
        {/* Stage 23c: „pojedynek spojrzeń" — the other way a conflict on the
            Street gets settled, and the only one that costs no Action. */}
        <button
          type="button"
          className="context-menu-item"
          onClick={() => setStaring((open) => !open)}
        >
          😠 Konfrontacja…
        </button>
        {staring && <FacedownLauncher target={token} onArmed={onClose} />}
        <button
          type="button"
          className="context-menu-item"
          onClick={() => void updateToken(token.id, { hidden: !token.hidden }).then(onClose)}
        >
          {token.hidden ? '👁 Pokaż graczom' : '🚫 Ukryj przed graczami'}
        </button>
        {token.light && (
          <button
            type="button"
            className="context-menu-item"
            onClick={() => void toggleTokenLight(token.id).then(onClose)}
          >
            {token.light.on ? '🌑 Zgaś latarkę' : '🔆 Zapal latarkę'}
          </button>
        )}
        {/* Reinforcements arriving mid-fight — and whoever just fled it. */}
        {combat &&
          (combatant ? (
            <button
              type="button"
              className="context-menu-item"
              onClick={() => void removeFromCombat(combatant.id).then(onClose)}
            >
              ⚔ Usuń z walki
            </button>
          ) : (
            <button
              type="button"
              className="context-menu-item"
              onClick={() => void addToCombat([menu.tokenId]).then(onClose)}
            >
              ⚔ Dodaj do walki
            </button>
          ))}
        <button type="button" className="context-menu-item" onClick={() => setEditing(true)}>
          ✏️ Edytuj…
        </button>
        <button
          type="button"
          className="context-menu-item context-menu-item--danger"
          onClick={() => void remove()}
        >
          🗑 Usuń
        </button>
        {statuses.length > 0 && (
          <>
            <p className="context-menu-section">Statusy</p>
            <div className="context-menu-statuses">
              {statuses.map((status) => (
                <label
                  key={status.id}
                  className="context-menu-status"
                  title={STATUS_HINTS[status.id] ?? status.name}
                >
                  <input
                    type="checkbox"
                    checked={token.statuses.includes(status.id)}
                    onChange={() => toggleStatus(status.id)}
                  />
                  <img src={status.icon} alt="" width={18} height={18} />
                  {status.name}
                </label>
              ))}
            </div>
            {token.statuses.includes(CPRED_INTIMIDATED_STATUS_ID) && <FearedPicker token={token} />}
          </>
        )}
      </div>
    </>
  );
}
