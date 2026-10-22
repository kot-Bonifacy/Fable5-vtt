import { useEffect, useState, type ReactNode } from 'react';
import type { CpredCharacterData } from '@vtt/shared';
import {
  CPRED_CREATION_STEP_LABELS,
  ADVANCEMENT_AWARD_MAX,
  ADVANCEMENT_LABEL_MAX,
  ROLE_GM,
  cyberpsychosisFor,
  formatEddies,
  isContainerCard,
} from '@vtt/shared';
import { confirmDestructive } from '../confirm.js';
import { noteAck, notifyInfo, notifyRefusal } from '../notices.js';
import {
  advanceErrorText,
  awardImprovementPoints,
  deleteCharacter,
  economyErrorText,
  settleMonth,
  updateCharacter,
} from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCampaignPlayersStore, type CampaignPlayer } from '../stores/campaignPlayersStore.js';
import { ensureCpredDataLoaded, useCharacterStore } from '../stores/characterStore.js';
import { useCheckStore } from '../stores/checkStore.js';
import { useCreationStore } from '../stores/creationStore.js';
import { useNpcCreateStore } from '../stores/npcCreateStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { plural, pluralWord } from '../plural.js';
import { CreationGate } from './CreationGate.js';
import { CreationRankPanel } from './CreationRankPanel.js';
import { CharacterReadyPanel, useWaitingCharacters } from './CharacterReadyPanel.js';
import { PortraitPicker } from './PortraitPicker.js';
import { startTokenDrag } from '../map/token-drag.js';

/**
 * Właściciel postaci jako słowo, a lista dopiero po kliknięciu (etap 43a):
 * stały `<select>` zjadał połowę wiersza i ucinał imiona do trzech liter.
 */
function OwnerPicker({
  ownerId,
  label,
  players,
  onChange,
}: {
  ownerId: string | null;
  label: string;
  players: CampaignPlayer[];
  onChange: (ownerId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <select
        className="character-owner-select"
        autoFocus
        value={ownerId ?? ''}
        onChange={(e) => {
          setOpen(false);
          onChange(e.target.value);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        title="Właściciel postaci"
      >
        <option value="">NPC (MG)</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    );
  }
  return (
    <button
      type="button"
      className="character-owner"
      onClick={() => setOpen(true)}
      title="Właściciel postaci — kliknij, żeby zmienić"
    >
      {label}
    </button>
  );
}

function ackErrorText(code: string): string {
  switch (code) {
    case 'INVALID_NAME':
      return 'Nieprawidłowe imię postaci (1–64 znaki).';
    case 'OWNER_NOT_FOUND':
      return 'Wybrany gracz nie należy do kampanii.';
    case 'NO_CAMPAIGN':
      return 'Brak aktywnej kampanii.';
    default:
      return `Błąd: ${code}`;
  }
}

/**
 * „Medyk „Igła” · Wyposażenie" — what a resumable draft looks like from the
 * „Postacie" tab. Whatever is known goes in; an unnamed draft without a Role
 * still says which step it stopped on.
 */
export function creationResumeLabel(name: string, roleName: string | null, step: string): string {
  const who = [roleName, name.trim() ? `„${name.trim()}”` : ''].filter(Boolean).join(' ');
  const stepLabel = (CPRED_CREATION_STEP_LABELS as Record<string, string>)[step] ?? step;
  return `${who || 'bez Roli'} · ${stepLabel}`;
}

const DRAG_LEARNED_KEY = 'vtt.characterDragLearned';
const RITUALS_OPEN_KEY = 'vtt.characterRitualsOpen';

/** Wygoda jednego widza (podpowiedź, zwinięta sekcja) — nie stan gry. */
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    // Prywatne okno albo zablokowana pamięć — wróci stan domyślny.
  }
}

/**
 * Zakładka „Postacie” (przebudowa z 15.10.2026, zlecenie MG).
 *
 * MG: na górze pasek („＋ Nowa postać…”, szkic, biblioteka portretów), pod nim
 * zwinięte „Rytuały stołu”, a lista w grupach — Drużyna, NPC, Wzorce statystów,
 * Statyści z wzorców, Pojemniki. Figurę stawia się **wyłącznie przeciągnięciem
 * wiersza na mapę** — dawny przycisk „⊕ Postaw na scenie” (28.08) dublował to
 * przeciąganie od 26.09 i zniknął. Gracz widzi tylko swoje postacie, bez grup.
 */
export function CharacterPanel() {
  const user = useAuthStore((s) => s.user);
  const isGm = user?.role === ROLE_GM;
  const characters = useCharacterStore((s) => s.characters);
  const order = useCharacterStore((s) => s.order);
  const registry = useCharacterStore((s) => s.registry);
  const openSheet = useCharacterStore((s) => s.openSheet);
  const creationDraft = useCreationStore((s) => s.draft);
  const creationPeek = useCreationStore((s) => s.peek);
  const waiting = useWaitingCharacters(isGm);
  // Postacie z figurą na oglądanej scenie — napis, żeby marsz figury (zmiana
  // x/y) nie przerysowywał listy.
  const onSceneKey = useTokenStore((s) =>
    [
      ...new Set(
        Object.values(s.tokens)
          .map((token) => token.characterId)
          .filter((id): id is string => !!id),
      ),
    ]
      .sort()
      .join(' '),
  );
  const onScene = new Set(onSceneKey.split(' '));

  const players = useCampaignPlayersStore((s) => s.players);
  const [dragLearned, setDragLearned] = useState(() => readFlag(DRAG_LEARNED_KEY));

  useEffect(() => {
    ensureCpredDataLoaded();
  }, []);

  useEffect(() => {
    if (!isGm) return;
    void useCampaignPlayersStore.getState().load();
  }, [isGm]);

  async function changeOwner(characterId: string, ownerId: string) {
    const ack = await updateCharacter(characterId, { ownerId: ownerId === '' ? null : ownerId });
    noteAck('character', ack, ackErrorText);
  }

  async function toggleTemplate(characterId: string, template: boolean) {
    const ack = await updateCharacter(characterId, { template });
    noteAck('character', ack, ackErrorText);
  }

  async function removeCharacter(characterId: string, name: string) {
    if (!confirmDestructive(`Usunąć postać „${name}”?`)) return;
    const ack = await deleteCharacter(characterId);
    noteAck('character', ack, ackErrorText);
  }

  const roleName = (roleId: string | null) =>
    registry.roles.find((r) => r.id === roleId)?.name ?? '';
  const ownerName = (ownerId: string | null, pendingOwner?: string | null) =>
    ownerId === null
      ? pendingOwner
        ? `czeka: ${pendingOwner}`
        : 'NPC'
      : (players.find((p) => p.id === ownerId)?.name ?? 'gracz');

  // Pojemniki (46b) mają karty bez Cech i PW, a wzorce statystów i ich kopie
  // (49a) mnożą się w walce — każde w swojej grupie, żeby pięciu gangerów nie
  // spychało drużyny pod krawędź panelu.
  const live = order.filter((id) => characters[id] !== undefined);
  const isPlain = (id: string) => {
    const card = characters[id]!;
    return !isContainerCard(card.data) && !card.template && !card.templateId;
  };
  const party = live.filter((id) => isPlain(id) && characters[id]!.ownerId !== null);
  const npcs = live.filter((id) => isPlain(id) && characters[id]!.ownerId === null);
  const templates = live.filter((id) => characters[id]!.template);
  const copies = live.filter((id) => !characters[id]!.template && !!characters[id]!.templateId);
  const containers = live.filter((id) => isContainerCard(characters[id]!.data));

  const renderRow = (id: string) => {
    const character = characters[id];
    if (!character) return null;
    const container = isContainerCard(character.data);
    const role = roleName(character.data.roleId);
    return (
      // Etap 43a: portret przez dwa wiersze, imię w całości u góry, Rola pod
      // nim. Od 15.10 akcje MG stoją w prawej kolumnie, a nie na wierszu Roli.
      <li key={id} className="character-row character-row--card">
        <button
          type="button"
          className="character-open"
          onClick={() => openSheet(id)}
          // MG wyciąga postać prosto na mapę (26.09) — żeton z kartą
          // i właścicielem, tak samo jak z kreatora.
          draggable={isGm}
          onDragStart={
            isGm
              ? (event) => {
                  startTokenDrag(event, {
                    name: character.name,
                    imageUrl: character.portraitUrl,
                    characterId: id,
                    ownerId: character.ownerId,
                  });
                  if (!dragLearned) {
                    writeFlag(DRAG_LEARNED_KEY, true);
                    setDragLearned(true);
                  }
                }
              : undefined
          }
          title={
            !isGm
              ? 'Otwórz kartę'
              : character.template
                ? 'Kliknij — wzorzec. Przeciągnij na mapę — każda figura dostanie własną kopię karty.'
                : 'Kliknij — karta. Przeciągnij na mapę — figura tej postaci.'
          }
        >
          {character.portraitUrl ? (
            <img className="character-thumb" src={character.portraitUrl} alt="" />
          ) : (
            <span className="character-thumb character-thumb--empty" aria-hidden>
              ◇
            </span>
          )}
          <span className="character-row-text">
            <span className="character-row-name">
              {character.name}
              <CyberpsychosisChip data={character.data} />
            </span>
            <span className="character-row-meta">
              {container ? 'pojemnik' : role || 'bez Roli'}
              {/* #58 (T8b): gracz po „Utwórz postać” nie był pewien, czy
                  w ogóle ją oddał — lista nie mówiła, że czeka na MG. */}
              {!character.playReady && (
                <span className="character-row-pending"> · czeka na przyjęcie przez MG</span>
              )}
              {!container && onScene.has(id) && (
                <span className="character-row-scene" title="Ma figurę na oglądanej scenie">
                  {' '}
                  · na mapie
                </span>
              )}
            </span>
          </span>
        </button>
        {isGm && (
          <span className="character-row-side">
            <span className="character-row-actions">
              {/* Etap 32: wezwanie do Testu stoi przy postaci, nie przy
                  żetonie — nietypowe wydarzenie trafia też kogoś, kto
                  akurat nie stoi na aktywnej scenie. Pojemnik (46b2) nie rzuca. */}
              {!container && (
                <button
                  type="button"
                  className="small-button"
                  onClick={() =>
                    useCheckStore
                      .getState()
                      .openCall({ characterId: id, characterName: character.name })
                  }
                  title="Wezwij do Testu"
                  aria-label="Wezwij do Testu"
                >
                  ⚄
                </button>
              )}
              {/* Etap 49a: wzorzec statysty — każda figura z niego to kopia.
                  Karta gracza, kopia wzorca i pojemnik wzorcem nie zostają. */}
              {!container && character.ownerId === null && !character.templateId && (
                <button
                  type="button"
                  className={`small-button ${character.template ? 'small-button--on' : ''}`}
                  aria-pressed={character.template}
                  onClick={() => void toggleTemplate(id, !character.template)}
                  title={
                    character.template
                      ? 'Wzorzec statysty: każda figura postawiona z tej karty dostaje własną kopię karty. Kliknij, żeby zrobić z niego zwykłego NPC-a.'
                      : 'Zrób z tej karty wzorzec statysty: każda figura postawiona na mapie dostanie własną kopię karty z numerem.'
                  }
                  aria-label="Wzorzec statysty"
                >
                  ⧉
                </button>
              )}
              <button
                type="button"
                className="small-button character-delete"
                onClick={() => void removeCharacter(id, character.name)}
                title="Usuń postać"
                aria-label="Usuń postać"
              >
                ✕
              </button>
            </span>
            {/* Pojemnik nie ma właściciela; wzorzec należy zawsze do MG. */}
            {!container && !character.template && (
              <OwnerPicker
                ownerId={character.ownerId}
                label={ownerName(character.ownerId, character.pendingOwner)}
                players={players}
                onChange={(ownerId) => void changeOwner(id, ownerId)}
              />
            )}
          </span>
        )}
      </li>
    );
  };

  // Naprawa 3d: a draft on the server shows up here by name, so a player
  // back from F5 (or from another day) resumes instead of wondering
  // whether the wizard forgot. The open window's draft wins over the
  // header learnt at `state:sync`; finishing and discarding clear both.
  const resume = creationDraft
    ? creationResumeLabel(
        creationDraft.name,
        roleName(creationDraft.roleId) || null,
        creationDraft.step,
      )
    : creationPeek
      ? creationResumeLabel(creationPeek.name, creationPeek.roleName, creationPeek.step)
      : null;

  if (!isGm) {
    return (
      <div className="character-panel">
        {live.length === 0 ? (
          <p className="placeholder-text">Nie masz jeszcze żadnej postaci.</p>
        ) : (
          <ul className="character-list">{live.map(renderRow)}</ul>
        )}
        {/* 24.09: a player's new character starts with the GM's consent and
            the rules. */}
        <CreationGate resume={resume} another={live.length > 0} />
      </div>
    );
  }

  return (
    <div className="character-panel">
      {/* Naprawa 2b: a player waiting for a pool comes first. */}
      <CreationRankPanel />
      {/* Naprawa 3c: karty prosto z kreatora, z tym, co po Roli zostało. */}
      <CharacterReadyPanel rows={waiting} />
      <div className="character-toolbar">
        <NewCharacterButton resume={resume} />
        <PortraitPicker manage />
      </div>
      {live.length > 0 && <TableRituals />}
      {live.length === 0 ? (
        <p className="placeholder-text">Brak postaci — „＋ Nowa postać…” powyżej.</p>
      ) : (
        <>
          {/* Podpowiedź znika po pierwszym przeciągnięciu z listy. */}
          {!dragLearned && (
            <p className="character-drag-hint">
              Kliknij postać, żeby otworzyć kartę. Przeciągnij ją na mapę, żeby postawić figurę.
            </p>
          )}
          <CharacterGroup
            id="party"
            label="Drużyna"
            title="Postacie graczy (także bot-towarzysz z właścicielem)"
            rows={party}
            open
            render={renderRow}
          />
          <CharacterGroup
            id="npcs"
            label="NPC"
            title="Nazwani NPC-e — jedna karta, jedna figura"
            rows={npcs}
            open
            render={renderRow}
          />
          <CharacterGroup
            id="templates"
            label="Wzorce statystów"
            title="Przeciągnij wzorzec na mapę — każda figura dostaje własną kopię karty z numerem"
            rows={templates}
            open
            render={renderRow}
          />
          <CharacterGroup
            id="copies"
            label="Statyści z wzorców"
            title="Karty figur postawionych z wzorców — giną razem ze swoją figurą"
            rows={copies}
            render={renderRow}
          />
          {/* Etap 46b2 (decyzja MG z 09.10): karty skrzyń i stosów to nie
              postacie — zwinięta grupa na dole. */}
          <CharacterGroup
            id="containers"
            label="Pojemniki"
            title="Skrzynie, bagażniki i stosy stojące na mapach"
            rows={containers}
            render={renderRow}
          />
        </>
      )}
    </div>
  );
}

function CharacterGroup({
  id,
  label,
  title,
  rows,
  open = false,
  render,
}: {
  id: string;
  label: string;
  title: string;
  rows: string[];
  open?: boolean;
  render: (id: string) => ReactNode;
}) {
  if (rows.length === 0) return null;
  return (
    <details className="character-group" data-character-group={id} open={open}>
      <summary title={title}>
        {label} ({rows.length})
      </summary>
      <ul className="character-list">{rows.map(render)}</ul>
    </details>
  );
}

/**
 * Rytuały całego stołu — start sesji (Szczęście), koniec sesji (PD, etap 29a)
 * i pierwszy dzień miesiąca (etap 23b). Używa się ich raz na sesję, więc od
 * 15.10 leżą w zwiniętej sekcji zamiast spychać listę postaci w dół panelu.
 */
function TableRituals() {
  const [open, setOpen] = useState(() => readFlag(RITUALS_OPEN_KEY));
  const [xpAmount, setXpAmount] = useState('');
  const [xpLabel, setXpLabel] = useState('');

  /** Start-of-session ritual (RAW): every pool back to its maximum. */
  async function refreshAllLuck() {
    const store = useCharacterStore.getState();
    const stale = store.order
      .map((id) => store.characters[id])
      .filter(
        (character) =>
          character &&
          !isContainerCard(character.data) &&
          character.data.luckCurrent < character.data.stats.luck,
      );
    if (stale.length === 0) {
      notifyInfo('Wszyscy mają już pełną pulę Szczęścia.', { topic: 'character' });
      return;
    }
    const who = plural(stale.length, 'postaci', 'postaciom', 'postaciom');
    if (!window.confirm(`Odnowić pulę Szczęścia ${who} (nowa sesja)?`)) return;
    for (const character of stale) {
      if (!character) continue;
      const ack = await updateCharacter(character.id, {
        data: { luckCurrent: character.data.stats.luck },
      });
      if (!noteAck('character', ack, ackErrorText)) return;
    }
    notifyInfo(`Odnowiono Szczęście — ${who}.`, { topic: 'character' });
  }

  /** The first of the month (stage 23b) — preview first, then the real thing. */
  async function runSettlement(preview: boolean) {
    if (
      !preview &&
      !window.confirm('Pobrać Poziom życia i czynsz wszystkim postaciom z ustawionym rachunkiem?')
    ) {
      return;
    }
    const ack = await settleMonth({ preview });
    if (!ack.ok || !ack.data) {
      notifyRefusal('character', economyErrorText(ack.ok ? undefined : ack.error));
      return;
    }
    const { charged, shortfall, settled, skipped } = ack.data;
    notifyInfo(
      `${preview ? 'Do pobrania' : 'Pobrano'} ${formatEddies(charged)} ed od ${settled} postaci` +
        (shortfall > 0 ? ` · niedopłata ${formatEddies(shortfall)} ed` : '') +
        (skipped > 0 ? ` · pominięto ${skipped} bez Poziomu życia` : '') +
        '. Szczegóły na czacie.',
      { title: 'Miesiąc', topic: 'character' },
    );
  }

  /**
   * Etap 29a: pula po sesji dla całego stołu. Jedno zdarzenie, nie pętla po
   * kartach — „MG przyznaje wszystkim graczom" jest jedną czynnością, a pętla
   * u klienta zostawiłaby połowę stołu bez PD, gdyby łącze padło w środku.
   */
  async function awardPoints() {
    const amount = Number.parseInt(xpAmount, 10);
    if (!Number.isInteger(amount) || amount === 0) {
      notifyRefusal('character', 'Podaj liczbę PD — tabela na s. 410 idzie od 10 do 80 na sesję.');
      return;
    }
    const ack = await awardImprovementPoints({
      everyone: true,
      amount,
      label: xpLabel.trim(),
    });
    if (!ack.ok || !ack.data) {
      notifyRefusal('character', advanceErrorText(ack.ok ? 'BAD_REQUEST' : ack.error));
      return;
    }
    // `pluralWord`, nie `plural`: liczba stoi w zdaniu obok, a `plural` dokleja
    // własną — tak powstało „Przyznano 20 PD — 5 5 postaci" (oględziny 02.09).
    const who = pluralWord(ack.data.awarded, 'postać', 'postaci', 'postaci');
    notifyInfo(
      `${amount > 0 ? 'Przyznano' : 'Zabrano'} ${Math.abs(amount)} PD — ${ack.data.awarded} ${who}.`,
      { title: 'Punkty Doświadczenia', topic: 'character' },
    );
    setXpAmount('');
    setXpLabel('');
  }

  return (
    <details
      className="character-rituals"
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        setOpen(next);
        writeFlag(RITUALS_OPEN_KEY, next);
      }}
    >
      <summary title="Czynności dla całego stołu naraz — raz na sesję albo raz na miesiąc">
        Rytuały stołu
        <span className="character-rituals-sub">Szczęście · PD · miesiąc</span>
      </summary>
      <div className="character-ritual">
        <span className="character-ritual-when">Start sesji</span>
        <button
          type="button"
          className="small-button"
          onClick={() => void refreshAllLuck()}
          title="Ustawia pulę Szczęścia wszystkich postaci na maksimum"
        >
          ↻ Odnów Szczęście wszystkim
        </button>
      </div>
      {/* Etap 29a, s. 410: „Po każdej sesji gry MG przyznaje wszystkim graczom
          Punkty Doświadczenia". */}
      <form
        className="character-ritual"
        onSubmit={(event) => {
          event.preventDefault();
          void awardPoints();
        }}
      >
        <span className="character-ritual-when">Po sesji</span>
        <input
          type="number"
          className="character-xp-amount"
          min={-ADVANCEMENT_AWARD_MAX}
          max={ADVANCEMENT_AWARD_MAX}
          value={xpAmount}
          placeholder="PD"
          onChange={(e) => setXpAmount(e.target.value)}
          aria-label="Punkty Doświadczenia do przyznania"
          title="Tabela na s. 410–411 idzie od 10 do 80 na sesję; liczba ujemna zabiera."
        />
        <input
          type="text"
          className="character-xp-label"
          maxLength={ADVANCEMENT_LABEL_MAX}
          value={xpLabel}
          placeholder="za co (trafia do rejestru)"
          onChange={(e) => setXpLabel(e.target.value)}
          aria-label="Powód przyznania PD"
        />
        <button
          type="submit"
          className="small-button"
          title="Dopisuje tę pulę każdej postaci należącej do gracza"
        >
          ✦ Przyznaj wszystkim
        </button>
      </form>
      {/* Stage 23b. Two clicks on purpose: the preview lists the bill for
          every sheet with a Lifestyle and touches nothing, and only the
          second press moves money — a mis-click here empties wallets. */}
      <div className="character-ritual">
        <span className="character-ritual-when">1. dzień miesiąca</span>
        <button
          type="button"
          className="small-button"
          onClick={() => void runSettlement(true)}
          title="Podgląd: ile zejdzie każdej postaci pierwszego dnia miesiąca (nic nie pobiera)"
        >
          Podgląd miesiąca
        </button>
        <button
          type="button"
          className="small-button"
          onClick={() => void runSettlement(false)}
          title="Pobiera Poziom życia i czynsz wszystkim postaciom, które je mają ustawione"
        >
          💸 Rozlicz miesiąc
        </button>
      </div>
    </details>
  );
}

/**
 * Drzwi MG do nowej postaci (etap 49a, zlecenie MG z 10.10).
 *
 * Do 49a były trzy: „🧬 Kreator postaci…”, jednowierszowy formularz pustej
 * karty i szybkie liczby w menu figury — i stały **pod** listą, którą pięciu
 * gangerów spychało poza ekran. Teraz jest jedno okno z typem na górze panelu
 * (wzór: „Utwórz aktora” w Foundry VTT), a szkic z kreatora wznawia się obok.
 */
function NewCharacterButton({ resume }: { resume: string | null }) {
  const setOpen = useNpcCreateStore((s) => s.setOpen);
  const openCreator = useCreationStore((s) => s.openCreator);
  return (
    <>
      <button
        type="button"
        className="small-button small-button--primary"
        onClick={() => setOpen(true)}
        title="Statysta (wzorzec do kopiowania na mapę), nazwany NPC albo postać gracza z kreatora"
      >
        ＋ Nowa postać…
      </button>
      {resume && (
        <button
          type="button"
          className="small-button"
          onClick={() => void openCreator()}
          title="Wznów szkic postaci — kreator otworzy się tam, gdzie skończono"
        >
          🧬 Wznów szkic: {resume}
        </button>
      )}
    </>
  );
}

/**
 * How close this character is to the Edge (stage 23a), on the list rather than
 * only inside their sheet — the GM has to see „kto stoi na granicy" without
 * opening five windows. Silent above EMP 2, which is where the rules go quiet
 * too (s. 232).
 */
function CyberpsychosisChip({ data }: { data: CpredCharacterData }) {
  const state = cyberpsychosisFor(data.humanityCurrent);
  if (state.level === 'none') return null;
  return (
    <span className={`character-psychosis character-psychosis--${state.level}`} title={state.note}>
      EMP {state.emp} · {state.label}
    </span>
  );
}
