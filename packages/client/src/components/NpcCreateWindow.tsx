import { useMemo, useState } from 'react';
import type { ArmorEntry, CpredNpcInput, CpredStatId, WeaponEntry } from '@vtt/shared';
import {
  CPRED_BRAWLING_ENTRY_ID,
  CPRED_MARTIAL_ARTS_ENTRY_ID,
  CPRED_NPC_SKILLS_MAX,
  CPRED_NPC_WEAPONS_MAX,
  CPRED_STAT_IDS,
  CPRED_STAT_LABELS,
  CPRED_STAT_MAX,
  CPRED_STAT_MIN,
  CPRED_STATBLOCK_HP_MAX,
  SKILL_LEVEL_MAX,
  createDefaultNpcInput,
  isArmorEntry,
  isWeaponEntry,
  statBlockHpMax,
} from '@vtt/shared';
import { createCharacter } from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useCompendiumStore } from '../stores/compendiumStore.js';
import { useCreationStore } from '../stores/creationStore.js';
import { useNpcCreateStore } from '../stores/npcCreateStore.js';
import { useWindowPlacement } from '../window-placement.js';
import { PortraitPicker } from './PortraitPicker.js';
import { WindowResizeGrip } from './WindowResizeGrip.js';

/**
 * Typ nowej postaci — o kopiach na mapie decyduje on, nie osobny przełącznik
 * (decyzja MG z 10.10, wzór: aktor niepowiązany / powiązany w Foundry VTT).
 */
type NpcKind = 'statist' | 'named' | 'player';

const KINDS: { id: NpcKind; label: string; hint: string }[] = [
  {
    id: 'statist',
    label: 'Statysta',
    hint: 'Ganger, ochroniarz, glina. Karta jest wzorcem: każda figura postawiona na mapie dostaje własną kopię karty z numerem (Ganger 1, Ganger 2…).',
  },
  {
    id: 'named',
    label: 'Nazwany NPC',
    hint: 'Fikser, boss, informator. Jedna karta i jedna postać, z którą drużyna rozmawia, walczy i handluje.',
  },
  {
    id: 'player',
    label: 'Postać gracza',
    hint: 'Pełny kreator według podręcznika: Rola, Cechy, Umiejętności, Ścieżka Życia i zakupy. Właściciela przypiszesz na liście „Postacie”.',
  },
];

function createErrorText(code: string): string {
  switch (code) {
    case 'INVALID_NAME':
      return 'Imię musi mieć od 1 do 64 znaków.';
    case 'NO_CAMPAIGN':
      return 'Brak aktywnej kampanii.';
    default:
      return `Nie udało się utworzyć postaci (${code}).`;
  }
}

/**
 * Okno „Nowa postać” MG (etap 49a, zlecenie MG z 10.10).
 *
 * Jedne drzwi zamiast trzech: kreator, jednowierszowy formularz pustej karty
 * i szybkie liczby w menu figury zostawiały MG z pytaniem „którędy do
 * gangera?”. Tu MG wybiera typ, a dla NPC-a wypełnia statblok tak, jak go
 * drukuje podręcznik — dziesięć Cech, PW, pancerz na głowie i tułowiu, broń
 * i kilka Umiejętności. Kartę buduje serwer (`cpredNpcSheet`) tymi samymi
 * wierszami co „Dodaj za darmo”, więc ganger rozwija się potem na zwykłej
 * karcie, a łup z jego ciała to zwykłe przedmioty.
 */
export function NpcCreateWindow() {
  const open = useNpcCreateStore((s) => s.open);
  if (!open) return null;
  return <NpcCreateWindowBody />;
}

function NpcCreateWindowBody() {
  const setOpen = useNpcCreateStore((s) => s.setOpen);
  const registry = useCharacterStore((s) => s.registry);
  const openSheet = useCharacterStore((s) => s.openSheet);
  const openCreator = useCreationStore((s) => s.openCreator);
  const entries = useCompendiumStore((s) => s.entries);
  const order = useCompendiumStore((s) => s.order);

  const [kind, setKind] = useState<NpcKind>('statist');
  const [name, setName] = useState('');
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [input, setInput] = useState<CpredNpcInput>(createDefaultNpcInput);
  const [hpText, setHpText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placement = useWindowPlacement('npc-create', () => ({
    x: Math.max(12, Math.round(window.innerWidth / 2 - 280)),
    y: 64,
  }));

  const { weapons, armor } = useMemo(() => {
    const all = order.map((id) => entries[id]).filter((entry) => entry !== undefined);
    const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, 'pl');
    return {
      // Gołe ręce karta dostaje sama (47b) — na liście byłyby drugim wierszem.
      weapons: all
        .filter((entry): entry is WeaponEntry => isWeaponEntry(entry))
        .filter(
          (entry) =>
            entry.id !== CPRED_BRAWLING_ENTRY_ID && entry.id !== CPRED_MARTIAL_ARTS_ENTRY_ID,
        )
        .sort(byName),
      armor: all.filter((entry): entry is ArmorEntry => isArmorEntry(entry)).sort(byName),
    };
  }, [entries, order]);

  const skills = useMemo(
    () => [...registry.skills].sort((a, b) => a.name.localeCompare(b.name, 'pl')),
    [registry.skills],
  );
  const skillName = (id: string) => registry.skills.find((skill) => skill.id === id)?.name ?? id;
  const hpFromStats = statBlockHpMax(input.stats, null);

  const close = () => setOpen(false);

  function setStat(id: CpredStatId, value: number) {
    if (!Number.isFinite(value)) return;
    const clamped = Math.min(CPRED_STAT_MAX, Math.max(CPRED_STAT_MIN, Math.round(value)));
    setInput((current) => ({ ...current, stats: { ...current.stats, [id]: clamped } }));
  }

  function setSkill(id: string, level: number) {
    setInput((current) => ({
      ...current,
      skills: {
        ...current.skills,
        [id]: Math.min(SKILL_LEVEL_MAX, Math.max(0, Math.round(level) || 0)),
      },
    }));
  }

  function dropSkill(id: string) {
    setInput((current) => {
      const next = { ...current.skills };
      delete next[id];
      return { ...current, skills: next };
    });
  }

  function setWeapon(index: number, id: string) {
    setInput((current) => {
      const next = [...current.weaponIds];
      if (id === '') next.splice(index, 1);
      else next[index] = id;
      return { ...current, weaponIds: next };
    });
  }

  async function submit() {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError('Podaj imię albo nazwę (np. „Ganger Maelstromu”).');
      return;
    }
    const hp = hpText.trim() === '' ? null : Number.parseInt(hpText, 10);
    const npc: CpredNpcInput = {
      ...input,
      hpMax: hp !== null && Number.isFinite(hp) && hp > 0 ? hp : null,
      // Poziom 0 to „nie umie” — serwer i tak go wyrzuci.
      skills: Object.fromEntries(Object.entries(input.skills).filter(([, level]) => level > 0)),
    };
    setBusy(true);
    setError(null);
    const ack = await createCharacter({
      name: trimmed,
      ownerId: null,
      portraitUrl,
      template: kind === 'statist',
      npc,
    });
    setBusy(false);
    if (!ack.ok) {
      setError(createErrorText(ack.error));
      return;
    }
    close();
    // Nazwany NPC to ktoś, komu MG jeszcze coś dopisze; wzorzec statysty idzie
    // prosto na mapę z grupy „Wzorce”, więc karta nie zasłania stołu.
    if (kind === 'named' && ack.data) openSheet(ack.data.id);
  }

  const skillIds = Object.keys(input.skills);
  const freeSkills = skills.filter((skill) => input.skills[skill.id] === undefined);
  const hint = KINDS.find((entry) => entry.id === kind)?.hint ?? '';

  return (
    <section
      ref={placement.ref}
      className="settings-window npc-create-window"
      style={placement.style}
      aria-label="Nowa postać"
      data-owns-keys
    >
      <div className="settings-window-header" {...placement.dragProps}>
        <span className="settings-window-title">＋ Nowa postać</span>
        <button
          type="button"
          className="sheet-close"
          onClick={close}
          title="Zamknij"
          aria-label="Zamknij okno nowej postaci"
        >
          ✕
        </button>
      </div>

      <div className="settings-window-body">
        <div className="npc-create-kinds" role="radiogroup" aria-label="Typ postaci">
          {KINDS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={kind === entry.id}
              className={`small-button ${kind === entry.id ? 'small-button--on' : ''}`}
              onClick={() => setKind(entry.id)}
              title={entry.hint}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <p className="npc-create-hint">{hint}</p>

        {kind === 'player' ? (
          <button
            type="button"
            className="small-button small-button--primary"
            onClick={() => {
              close();
              void openCreator();
            }}
          >
            🧬 Otwórz kreator postaci
          </button>
        ) : (
          <form
            className="npc-create-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label className="npc-create-name">
              <span>{kind === 'statist' ? 'Nazwa' : 'Imię'}</span>
              <input
                type="text"
                maxLength={64}
                autoFocus
                value={name}
                placeholder={kind === 'statist' ? 'np. Ganger Maelstromu' : 'np. Fikserka Rosa'}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <label className="npc-create-role">
              <span>Rola</span>
              <select
                value={input.roleId ?? ''}
                onChange={(event) =>
                  setInput((current) => ({ ...current, roleId: event.target.value || null }))
                }
              >
                <option value="">— bez Roli —</option>
                {registry.roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="npc-create-stats">
              <legend>Cechy</legend>
              {CPRED_STAT_IDS.map((id) => (
                <label key={id} title={CPRED_STAT_LABELS[id].name}>
                  <span>{CPRED_STAT_LABELS[id].abbr}</span>
                  <input
                    type="number"
                    min={CPRED_STAT_MIN}
                    max={CPRED_STAT_MAX}
                    value={input.stats[id]}
                    onChange={(event) => setStat(id, Number(event.target.value))}
                  />
                </label>
              ))}
              <label
                className="npc-create-hp"
                title="Puste = z Cech (10 + 5 × połowa BC + SW). Wpisz, gdy statblok drukuje inne PW."
              >
                <span>PW</span>
                <input
                  type="number"
                  min={1}
                  max={CPRED_STATBLOCK_HP_MAX}
                  value={hpText}
                  placeholder={String(hpFromStats)}
                  onChange={(event) => setHpText(event.target.value)}
                />
              </label>
            </fieldset>

            <fieldset className="npc-create-gear">
              <legend>Pancerz i broń (z Kompendium)</legend>
              {(['head', 'body'] as const).map((location) => {
                const key = location === 'head' ? 'armorHeadId' : 'armorBodyId';
                return (
                  <label key={location}>
                    <span>{location === 'head' ? 'Głowa' : 'Tułów'}</span>
                    <select
                      value={input[key] ?? ''}
                      onChange={(event) =>
                        setInput((current) => ({ ...current, [key]: event.target.value || null }))
                      }
                    >
                      <option value="">— bez pancerza —</option>
                      {armor.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name} (OB {entry.sp})
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
              {[...input.weaponIds, ''].slice(0, CPRED_NPC_WEAPONS_MAX).map((id, index) => (
                <label key={`${index}-${id}`}>
                  <span>Broń {index + 1}</span>
                  <select value={id} onChange={(event) => setWeapon(index, event.target.value)}>
                    <option value="">{id === '' ? '— dodaj broń —' : '— usuń —'}</option>
                    {weapons.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </fieldset>

            <fieldset className="npc-create-skills">
              <legend>Umiejętności</legend>
              {skillIds.map((id) => (
                <div key={id} className="npc-create-skill">
                  <span>{skillName(id)}</span>
                  <input
                    type="number"
                    min={0}
                    max={SKILL_LEVEL_MAX}
                    value={input.skills[id]}
                    aria-label={`Poziom: ${skillName(id)}`}
                    onChange={(event) => setSkill(id, Number(event.target.value))}
                  />
                  <button
                    type="button"
                    className="small-button"
                    onClick={() => dropSkill(id)}
                    title="Usuń Umiejętność"
                    aria-label={`Usuń Umiejętność ${skillName(id)}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {skillIds.length < CPRED_NPC_SKILLS_MAX && (
                <select
                  className="npc-create-skill-add"
                  value=""
                  onChange={(event) => {
                    if (event.target.value) setSkill(event.target.value, 2);
                  }}
                  aria-label="Dodaj Umiejętność"
                >
                  <option value="">+ dodaj Umiejętność…</option>
                  {freeSkills.map((skill) => (
                    <option key={skill.id} value={skill.id}>
                      {skill.name}
                    </option>
                  ))}
                </select>
              )}
            </fieldset>

            <details className="npc-create-portrait">
              <summary>Portret {portraitUrl ? '✓' : '(opcjonalnie)'}</summary>
              <PortraitPicker
                npc
                selectedUrl={portraitUrl}
                onPick={(url) => {
                  setPortraitUrl(url);
                }}
              />
            </details>

            {error && <p className="auth-error">{error}</p>}
            <div className="npc-create-actions">
              <button type="submit" className="small-button small-button--primary" disabled={busy}>
                {kind === 'statist' ? 'Utwórz wzorzec' : 'Utwórz NPC-a'}
              </button>
              {kind === 'statist' && (
                <span className="npc-create-note">
                  Potem przeciągnij wzorzec z listy „Postacie” na mapę — tyle razy, ilu wrogów
                  potrzebujesz.
                </span>
              )}
            </div>
          </form>
        )}
      </div>
      <WindowResizeGrip resizeProps={placement.resizeProps} />
    </section>
  );
}
