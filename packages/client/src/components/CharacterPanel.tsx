import { useEffect, useState } from 'react';
import type { CampaignDetail, CpredCharacterData } from '@vtt/shared';
import {
  CPRED_CREATION_STEP_LABELS,
  ADVANCEMENT_AWARD_MAX,
  ADVANCEMENT_LABEL_MAX,
  ROLE_GM,
  cyberpsychosisFor,
  formatEddies,
  isContainerCard,
} from '@vtt/shared';
import { apiGet } from '../api.js';
import { confirmDestructive } from '../confirm.js';
import {
  advanceErrorText,
  awardImprovementPoints,
  deleteCharacter,
  economyErrorText,
  settleMonth,
  updateCharacter,
} from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { ensureCpredDataLoaded, useCharacterStore } from '../stores/characterStore.js';
import { useCheckStore } from '../stores/checkStore.js';
import { useCreationStore } from '../stores/creationStore.js';
import { useMapToolStore } from '../stores/mapToolStore.js';
import { useNpcCreateStore } from '../stores/npcCreateStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { plural, pluralWord } from '../plural.js';
import { CreationGate } from './CreationGate.js';
import { CreationRankPanel } from './CreationRankPanel.js';
import { CharacterReadyPanel, useWaitingCharacters } from './CharacterReadyPanel.js';
import { PortraitPicker } from './PortraitPicker.js';
import { startTokenDrag } from '../map/token-drag.js';

interface PlayerOption {
  id: string;
  name: string;
}

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
  players: PlayerOption[];
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
 * Side-panel tab with the campaign's characters. The GM sees all of them
 * (with owner assignment); a player sees only their own. Clicking a row opens
 * the floating sheet window.
 */
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

  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [settlement, setSettlement] = useState<string | null>(null);
  const [xpAmount, setXpAmount] = useState('');
  const [xpLabel, setXpLabel] = useState('');

  useEffect(() => {
    ensureCpredDataLoaded();
  }, []);

  useEffect(() => {
    if (!isGm) return;
    apiGet<CampaignDetail[]>('/api/campaigns')
      .then((campaigns) => {
        const active = campaigns.find((c) => c.open);
        setPlayers(active?.players.map((p) => ({ id: p.id, name: p.name })) ?? []);
      })
      .catch(() => setPlayers([]));
  }, [isGm]);

  async function changeOwner(characterId: string, ownerId: string) {
    const ack = await updateCharacter(characterId, { ownerId: ownerId === '' ? null : ownerId });
    if (!ack.ok) setError(ackErrorText(ack.error));
  }

  async function toggleTemplate(characterId: string, template: boolean) {
    const ack = await updateCharacter(characterId, { template });
    if (!ack.ok) setError(ackErrorText(ack.error));
  }

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
    if (stale.length === 0) return;
    const who = plural(stale.length, 'postaci', 'postaciom', 'postaciom');
    if (!window.confirm(`Odnowić pulę Szczęścia ${who} (nowa sesja)?`)) return;
    for (const character of stale) {
      if (!character) continue;
      const ack = await updateCharacter(character.id, {
        data: { luckCurrent: character.data.stats.luck },
      });
      if (!ack.ok) {
        setError(ackErrorText(ack.error));
        return;
      }
    }
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
      setSettlement(economyErrorText(ack.ok ? undefined : ack.error));
      return;
    }
    const { charged, shortfall, settled, skipped } = ack.data;
    setSettlement(
      `${preview ? 'Do pobrania' : 'Pobrano'} ${formatEddies(charged)} ed od ${settled} postaci` +
        (shortfall > 0 ? ` · niedopłata ${formatEddies(shortfall)} ed` : '') +
        (skipped > 0 ? ` · pominięto ${skipped} bez Poziomu życia` : '') +
        '. Szczegóły na czacie.',
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
      setSettlement('Podaj liczbę PD — tabela na s. 410 idzie od 10 do 80 na sesję.');
      return;
    }
    const ack = await awardImprovementPoints({
      everyone: true,
      amount,
      label: xpLabel.trim(),
    });
    if (!ack.ok || !ack.data) {
      setSettlement(advanceErrorText(ack.ok ? 'BAD_REQUEST' : ack.error));
      return;
    }
    // `pluralWord`, nie `plural`: liczba stoi w zdaniu obok, a `plural` dokleja
    // własną — tak powstało „Przyznano 20 PD — 5 5 postaci" (oględziny 02.09).
    const who = pluralWord(ack.data.awarded, 'postać', 'postaci', 'postaci');
    setSettlement(
      `${amount > 0 ? 'Przyznano' : 'Zabrano'} ${Math.abs(amount)} PD — ${ack.data.awarded} ${who}.`,
    );
    setXpAmount('');
    setXpLabel('');
  }

  async function removeCharacter(characterId: string, name: string) {
    if (!confirmDestructive(`Usunąć postać „${name}”?`)) return;
    const ack = await deleteCharacter(characterId);
    if (!ack.ok) setError(ackErrorText(ack.error));
  }

  const roleName = (roleId: string | null) =>
    registry.roles.find((r) => r.id === roleId)?.name ?? '';
  const ownerName = (ownerId: string | null) =>
    ownerId === null ? 'NPC' : (players.find((p) => p.id === ownerId)?.name ?? 'gracz');

  // Pojemniki (46b) mają karty bez Cech i PW — osobna grupa na dole listy.
  // Etap 49a: wzorce statystów i ich kopie też mają własne grupy — pięciu
  // gangerów z jednej walki nie może spychać drużyny pod krawędź panelu.
  const people = order.filter((id) => {
    const card = characters[id];
    return card !== undefined && !isContainerCard(card.data) && !card.template && !card.templateId;
  });
  const templates = order.filter((id) => characters[id]?.template === true);
  const copies = order.filter((id) => {
    const card = characters[id];
    return card !== undefined && !card.template && !!card.templateId;
  });
  const containers = order.filter((id) => {
    const card = characters[id];
    return card !== undefined && isContainerCard(card.data);
  });

  const renderRow = (id: string) => {
    const character = characters[id];
    if (!character) return null;
    return (
      // Etap 43a: dwa wiersze na postać, portret przez oba (zlecenie MG
      // z 26.09) — imię u góry w całości, niżej Rola, a po prawej
      // właściciel i przyciski MG.
      <li key={id} className="character-row character-row--card">
        <button
          type="button"
          className="character-open"
          onClick={() => openSheet(id)}
          // MG wyciąga postać prosto na mapę (26.09) — ten sam żeton
          // co „⊕", z kartą i właścicielem.
          draggable={isGm}
          onDragStart={
            isGm
              ? (event) =>
                  startTokenDrag(event, {
                    name: character.name,
                    imageUrl: character.portraitUrl,
                    characterId: id,
                    ownerId: character.ownerId,
                  })
              : undefined
          }
          title={
            !isGm
              ? 'Otwórz kartę'
              : character.template
                ? 'Otwórz wzorzec — albo przeciągnij na mapę: każda figura dostanie własną kopię karty'
                : 'Otwórz kartę — albo przeciągnij postać na mapę'
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
              {roleName(character.data.roleId) || '—'}
              {/* #58 (T8b): gracz po „Utwórz postać” nie był pewien, czy
                          w ogóle ją oddał — lista nie mówiła, że czeka na MG. */}
              {!character.playReady && (
                <span className="character-row-pending"> · czeka na przyjęcie przez MG</span>
              )}
              {character.template && ' · wzorzec — przeciągnij na mapę'}
            </span>
          </span>
        </button>
        {isGm && (
          <span className="character-row-actions">
            {/* Pojemnik (46b2) nie ma właściciela, nie rzuca i stoi już na mapie. */}
            {!isContainerCard(character.data) && (
              <>
                {!character.template && (
                  <OwnerPicker
                    ownerId={character.ownerId}
                    label={ownerName(character.ownerId)}
                    players={players}
                    onChange={(ownerId) => void changeOwner(id, ownerId)}
                  />
                )}
                {/* Etap 49a: wzorzec statysty — każda figura z niego to kopia.
                    Karta gracza i kopia wzorca wzorcem nie zostają. */}
                {character.ownerId === null && !character.templateId && (
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
                {/* Etap 32: wezwanie do Testu stoi przy postaci, nie przy
                        żetonie — nietypowe wydarzenie trafia też kogoś, kto
                        akurat nie stoi na aktywnej scenie. */}
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
                <PlaceOnSceneButton
                  characterId={id}
                  name={character.name}
                  portraitUrl={character.portraitUrl}
                  ownerId={character.ownerId}
                />
              </>
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

  return (
    <div className="character-panel">
      {/* Naprawa 2b: a player waiting for a pool comes first. */}
      {isGm ? <CreationRankPanel /> : null}
      {/* Naprawa 3c: karty prosto z kreatora, z tym, co po Roli zostało. */}
      {isGm ? <CharacterReadyPanel rows={waiting} /> : null}
      {isGm ? <NewCharacterButton resume={resume} /> : null}
      {isGm ? <PortraitPicker manage /> : null}
      {isGm && order.length > 0 && (
        <div className="character-panel-actions">
          <button
            type="button"
            className="small-button"
            onClick={() => void refreshAllLuck()}
            title="Ustawia pulę Szczęścia wszystkich postaci na maksimum (start sesji)"
          >
            ↻ Odnów Szczęście wszystkim
          </button>
          {/* Stage 23b. Two clicks on purpose: the preview lists the bill for
              every sheet with a Lifestyle and touches nothing, and only the
              second press moves money — a mis-click here empties wallets. */}
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
      )}
      {/* Etap 29a, s. 410: „Po każdej sesji gry MG przyznaje wszystkim graczom
          Punkty Doświadczenia". Rytuał całego stołu, więc stoi obok odnowienia
          Szczęścia i rozliczenia miesiąca, a nie w jednej karcie. */}
      {isGm && order.length > 0 && (
        <form
          className="character-panel-actions character-xp"
          onSubmit={(event) => {
            event.preventDefault();
            void awardPoints();
          }}
        >
          <label className="character-xp-field">
            PD po sesji
            <input
              type="number"
              min={-ADVANCEMENT_AWARD_MAX}
              max={ADVANCEMENT_AWARD_MAX}
              value={xpAmount}
              onChange={(e) => setXpAmount(e.target.value)}
              aria-label="Punkty Doświadczenia do przyznania"
              title="Tabela na s. 410–411 idzie od 10 do 80 na sesję; liczba ujemna zabiera."
            />
          </label>
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
      )}
      {settlement ? <p className="character-panel-note">{settlement}</p> : null}
      {order.length === 0 ? (
        <p className="placeholder-text">
          {isGm ? 'Brak postaci — „＋ Nowa postać…” powyżej.' : 'Nie masz jeszcze żadnej postaci.'}
        </p>
      ) : (
        <>
          <ul className="character-list">{people.map(renderRow)}</ul>
          {templates.length > 0 && (
            <details className="character-group" data-character-group="templates" open>
              <summary title="Przeciągnij wzorzec na mapę — każda figura dostaje własną kopię karty z numerem">
                Wzorce statystów ({templates.length})
              </summary>
              <ul className="character-list">{templates.map(renderRow)}</ul>
            </details>
          )}
          {copies.length > 0 && (
            <details className="character-group" data-character-group="copies">
              <summary title="Karty figur postawionych z wzorców — giną razem ze swoją figurą">
                Statyści z wzorców ({copies.length})
              </summary>
              <ul className="character-list">{copies.map(renderRow)}</ul>
            </details>
          )}
          {/* Etap 46b2 (decyzja MG z 09.10): karty skrzyń i stosów to nie postacie —
              zwinięta grupa, żeby nie spychały drużyny w dół listy. */}
          {containers.length > 0 && (
            <details className="character-group" data-character-group="containers">
              <summary>Pojemniki ({containers.length})</summary>
              <ul className="character-list">{containers.map(renderRow)}</ul>
            </details>
          )}
        </>
      )}

      {/* 24.09: a player's new character starts with the GM's consent and the
          rules. The GM's door is „＋ Nowa postać…” at the top (etap 49a). */}
      {!isGm && <CreationGate resume={resume} another={order.length > 0} />}

      {error && <p className="auth-error">{error}</p>}
    </div>
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
    <div className="character-panel-actions character-new">
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
    </div>
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

/**
 * „Postaw na scenie" — druga droga do żetonu postaci (28.08).
 *
 * Do tej pory żeton związany z kartą powstawał **wyłącznie** w kreatorze
 * (`creation.ts` woła `createCharacterToken`). Kto skasował żeton — albo dostał
 * kartę zaimportowaną, nie zbudowaną — nie miał jak dorobić drugiego: panel
 * „Tokeny" stawia same krążki z biblioteki, a `token:create` przyjmuje
 * `characterId` od zawsze, tylko nikt go z UI nie podawał. Wyszło przy
 * odtwarzaniu „Kolca" na Poligonie: karta stała nietknięta, figury nie było
 * i jedyną drogą była konsola.
 *
 * Portret idzie na żeton, a właściciel przepisuje się z karty — te same dwie
 * decyzje, które podejmuje kreator, żeby żeton dorobiony ręcznie niczym się nie
 * różnił od postawionego automatem.
 */
function PlaceOnSceneButton({
  characterId,
  name,
  portraitUrl,
  ownerId,
}: {
  characterId: string;
  name: string;
  portraitUrl: string | null;
  ownerId: string | null;
}) {
  const armed = useMapToolStore((s) => s.tokenPlacement?.characterId === characterId);
  // Figura tej postaci już na scenie — przycisk nadal działa (dubler bywa
  // potrzebny), ale mówi, że to będzie druga.
  const onScene = useTokenStore((s) =>
    Object.values(s.tokens).some((token) => token.characterId === characterId),
  );

  return (
    <button
      type="button"
      className={`small-button ${armed ? 'small-button--armed' : ''}`}
      draggable
      onDragStart={(event) =>
        startTokenDrag(event, { name, imageUrl: portraitUrl, characterId, ownerId })
      }
      onClick={() =>
        useMapToolStore
          .getState()
          .setTokenPlacement(armed ? null : { name, imageUrl: portraitUrl, characterId, ownerId })
      }
      title={
        armed
          ? 'Kliknij na mapie, żeby postawić figurę (Esc anuluje)'
          : onScene
            ? `Ta postać ma już figurę na scenie — postawi się druga (kliknij albo przeciągnij na mapę)`
            : 'Postaw figurę tej postaci na aktywnej scenie (kliknij albo przeciągnij na mapę)'
      }
      aria-label={`Postaw na scenie: ${name}`}
    >
      {armed ? '◎' : '⊕'}
    </button>
  );
}
