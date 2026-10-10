import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import type {
  CampaignDetail,
  CompendiumCategory,
  CompendiumEntry,
  CpredCharacterData,
  CpredCreationData,
  CpredCreationDraft,
  CpredCreationMethod,
  CpredCreationSkillRow,
  CpredCreationStep,
  CpredValidationIssue,
  CreationFinishResult,
  CreationShopRules,
  CpredLifepath,
  CpredLifepathBotKind,
  CpredLifepathGroup,
  CpredLifepathTable,
  CpredSkillDefinition,
  CpredStatId,
  PortraitAssetView,
} from '@vtt/shared';
import {
  ARMOR_LOCATION_LABELS,
  NET_PROGRAM_CLASS_LABELS,
  cyberdeckSlotsUsed,
  netProgramSlots,
  cpredIsBareHandsEntry,
  CPRED_CREATION_METHODS,
  CPRED_CREATION_METHOD_LABELS,
  CPRED_CREATION_STEPS,
  CPRED_CREATION_STEP_LABELS,
  CPRED_STAT_HINTS,
  CPRED_STAT_IDS,
  CPRED_STAT_LABELS,
  CREATION_ROLE_TOOL_TIER,
  CREATION_SHOP_TIER,
  LIFEPATH_FIELD_TABLES,
  LIFEPATH_GROUP_LABELS,
  LIFEPATH_GROUP_MAX,
  ROLE_GM,
  SHOP_TIER_LABELS,
  SKILL_SPECIALTY_MAX_LENGTH,
  WEAPON_QUALITY_LABELS,
  cpredSkillLabel,
  cpredSkillNeedsSpecialty,
  creationAvailableSkills,
  creationBudget,
  creationChangeEffect,
  creationDataOf,
  creationIssueStep,
  creationIssues,
  creationLeftOutside,
  creationRoleKit,
  creationRoleKitChoices,
  creationMissingSkillMinima,
  creationOutcome,
  creationBasketEntry,
  cpredWeaponsWithoutStock,
  cpredCalibreKey,
  cpredCalibreOptions,
  CPRED_AMMO_PACK_SIZE,
  isAmmoEntry,
  isAttachmentEntry,
  describeAttachment,
  toAttachmentProfile,
  toAmmoProfile,
  cpredRoleChores,
  creationPreview,
  creationPurchases,
  creationRole,
  creationSkillPool,
  creationSkillPointsSpent,
  creationShopRefusalText,
  creationShopVerdict,
  creationSkillRow,
  creationStatPointsSpent,
  creationStatPool,
  creationSpentEddies,
  creationStats,
  emptyLifepathEnemy,
  emptyLifepathPerson,
  entryPrice,
  formatEddies,
  formatLifestyle,
  groupedSkills,
  isLifepathFieldTable,
  lifepathBotDraft,
  lifepathDataOf,
  lifepathUnanswered,
  lifepathRoleTables,
  lifepathRollLabel,
  resolveWeapon,
  isElectronicsGear,
  isGearEntry,
  isWeaponEntry,
  searchCompendium,
  shopTierVerdict,
} from '@vtt/shared';
import { apiGet, apiUpload } from '../api.js';
import { UPLOAD_ACCEPT_ATTRIBUTE, uploadRequirementText } from '@vtt/shared';
import { fileRejectionText, uploadErrorText } from '../uploads.js';
import { botErrorText, createBot, creationErrorText, finishCreation } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { usePortraitStore } from '../stores/portraitStore.js';
import { PortraitPicker } from './PortraitPicker.js';
import { PortraitCropButton } from './PortraitCropEditor.js';
import { useBotStore } from '../stores/botStore.js';
import { ensureCpredDataLoaded, useCharacterStore } from '../stores/characterStore.js';
import { shopTierContextOf, useCompendiumStore } from '../stores/compendiumStore.js';
import {
  buyCreationEntry,
  clearCreationCup,
  enqueueCreationCall,
  creationCountCup,
  creationLifepathCup,
  creationStatCup,
  loadCreationCup,
  nextCreationCup,
  rollLifepathTablesPlain,
  rollMissingStatsPlain,
  useCreationStore,
} from '../stores/creationStore.js';
import { useRollStore, type PendingCreation } from '../stores/rollStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { useWindowPlacement } from '../window-placement.js';
import { WindowResizeGrip } from './WindowResizeGrip.js';
import { RoleChoresList } from './RoleChores.js';
import { ItemIcon, WeaponTypeFilter, filterWeaponsByType, useEntryIcon } from './ItemIcons.js';

/** Same wording as the sheet's own portrait upload (stage 07). */

/**
 * The character creator (stage 25a) — a floating window in the same idiom as
 * the sheet, so the map stays visible and the day/night theme from 27a already
 * fits it.
 *
 * Seven steps with free movement between them: Role, Stats, Skills, Lifepath
 * (stage 25b), Gear, Description and Summary (stage 25c). Nothing here computes
 * a rule on its own — the pools, the ceilings, the Lifepath tables, the prices
 * and the list of what is still missing all come from `shared/systems/cpred`,
 * which is the same code the server refuses with.
 */
export function CharacterCreator() {
  const open = useCreationStore((s) => s.open);
  if (!open) return null;
  return <CreatorWindow />;
}

function CreatorWindow() {
  const user = useAuthStore((s) => s.user);
  const isGm = user?.role === ROLE_GM;
  const registry = useCharacterStore((s) => s.registry);
  const draft = useCreationStore((s) => s.draft);
  const error = useCreationStore((s) => s.error);
  const busy = useCreationStore((s) => s.busy);
  const patch = useCreationStore((s) => s.patch);
  const setDraft = useCreationStore((s) => s.setDraft);
  const setError = useCreationStore((s) => s.setError);
  const setBusy = useCreationStore((s) => s.setBusy);
  const closeCreator = useCreationStore((s) => s.closeCreator);
  const discard = useCreationStore((s) => s.discard);
  const openSheet = useCharacterStore((s) => s.openSheet);

  const placement = useWindowPlacement('creator', () => ({ x: 120, y: 60 }));
  const [ownerId, setOwnerId] = useState('');
  const [finished, setFinished] = useState<CreatorFinished | null>(null);
  // Naprawa 3d: „Przejdź" and „Pokaż kartę" on the last screen open the card
  // **under** this window (sheets sit at z-index 300+, the wizard at 320), so
  // at laptop widths the panel they promised was hidden. The wizard steps
  // behind the sheets instead of closing — the retry for the token lives here
  // — and comes back to the front at the first click into it.
  const [behind, setBehind] = useState(false);
  const draftId = useCreationStore((s) => s.draftId);
  const rankApproved = useCreationStore((s) => s.rankApproved);
  const pendingPatch = useCreationStore((s) => s.pendingPatch);
  const retry = useCreationStore((s) => s.retry);
  const visited = useCreationStore((s) => s.visited);
  const markVisited = useCreationStore((s) => s.markVisited);
  const focusField = useCreationStore((s) => s.focusField);
  const clearFocusField = useCreationStore((s) => s.clearFocusField);
  const goToField = useCreationStore((s) => s.goToField);
  const [players, setPlayers] = useState<{ id: string; name: string }[]>([]);
  const [question, setQuestion] = useState<CreatorQuestion | null>(null);
  const campaign = useAuthStore((s) => s.activeCampaign);
  const step = draft?.step;

  useEffect(() => {
    if (step) markVisited(step);
  }, [step, draftId, markVisited]);

  // „Przejdź" in the summary: once the step it asked for is on screen, bring
  // the field into view and give it the keyboard.
  useEffect(() => {
    // The step is committed by the time an effect runs; no frame is awaited,
    // because a hidden tab gets none.
    if (!focusField || !step || creationIssueStep(focusField) !== step) return;
    const root = placement.ref.current;
    if (root) focusCreationField(root, focusField);
    clearFocusField();
  }, [focusField, step, clearFocusField, placement.ref]);

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

  const data = useMemo(() => creationDataOf(registry), [registry]);

  async function finish() {
    if (!(await retry())) return;
    setBusy(true);
    setError(null);
    const ack = await enqueueCreationCall(() =>
      useCreationStore.getState().pendingPatch
        ? Promise.resolve({ ok: false as const, error: 'CREATION_SAVE_PENDING' })
        : finishCreation({
            draftId: draftId ?? undefined,
            ...(isGm ? { ownerId: ownerId === '' ? null : ownerId } : {}),
          }),
    );
    setBusy(false);
    if (!ack.ok || !ack.data) {
      setError(creationErrorText(ack.ok ? undefined : ack.error));
      return;
    }
    // The finished sheet opens straight away, and the wizard stays on a last
    // screen (naprawa 3a): where the token went, and what the book gives that
    // the wizard did not — a silent close read as „wszystko gotowe".
    if (!finished) openSheet(ack.data.id);
    const finishedDraft = finished?.draft ?? draft;
    if (finishedDraft) setFinished({ result: ack.data, draft: finishedDraft });
    // The draft is gone from the server — „Wznów szkic…" must not outlive it
    // on the „Postacie" tab. The last screen reads `finished.draft`, so the
    // store's copy can go now rather than when the window closes.
    useCreationStore.getState().setPeek(null);
    // The consent bought this one character (24.09); the next one is asked for.
    if (!isGm) useCreationStore.getState().setPermit({ status: 'none', rulesAccepted: false });
    setDraft(null);
    setBehind(false);
  }

  // The catalogue goes in so the wizard can price the basket: without it the
  // list of what is missing would quietly skip „wydane 3000 z 2550 ed".
  const entriesById = useCompendiumStore((s) => s.entries);
  const shopRules = useCreationShopRules();
  const issues = draft
    ? creationIssues(draft, data, registry, (entryId: string) => entriesById[entryId], shopRules, {
        requirePurchases: !isGm,
      })
    : [];
  if (draft?.method === 'complete' && !isGm && !rankApproved)
    issues.push({ field: 'statRankId', message: 'MG musi ustalić Rangę Postaci dla tego szkicu.' });
  const stepIndex = draft ? CPRED_CREATION_STEPS.indexOf(draft.step) : 0;
  const visitedIndex = visited.draftId === draftId ? visited.index : stepIndex;
  // Counted as the summary lists them: ten unset stats are one line there, so
  // they are one on the tab and in the footer too.
  const issueLines = summaryLines(issues);
  const openByStep = countIssuesByStep(issueLines);

  return (
    <section
      ref={placement.ref}
      className="sheet-window sheet-window--paper creator-window"
      style={{ ...placement.style, zIndex: behind ? 290 : 320 }}
      onPointerDownCapture={() => setBehind(false)}
      aria-label="Kreator postaci"
      // Naprawa 2b: keys pressed inside the window are the window's — Tab
      // walks its fields instead of cycling figures on the map.
      data-owns-keys
    >
      <div className="sheet-header" {...placement.dragProps}>
        <span className="sheet-title">
          <span className="sheet-title-name">Kreator postaci</span>
          {draft && (
            <span className="sheet-title-role">{CPRED_CREATION_METHOD_LABELS[draft.method]}</span>
          )}
        </span>
        <span className={`sheet-save sheet-save--${busy ? 'saving' : 'idle'}`}>
          {busy ? 'Zapisywanie…' : ''}
        </span>
        <button
          type="button"
          className="sheet-close"
          onClick={closeCreator}
          title="Schowaj kreator"
          aria-label="Schowaj kreator"
        >
          ✕
        </button>
      </div>

      {pendingPatch && (
        <div role="alert" className="creator-error">
          Zapis wymaga ponowienia. Kolejne zmiany czekają.
          <button type="button" disabled={busy} onClick={() => void retry()}>
            Ponów zapis
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              setQuestion({
                title: 'Wczytać szkic z serwera?',
                lost: [
                  'Zmiany, których serwer nie potwierdził: ta, która czeka na ponowienie, i wszystkie wprowadzone po niej.',
                ],
                confirmLabel: 'Odrzuć zmiany i wczytaj',
                onConfirm: () => void useCreationStore.getState().reload(),
              })
            }
          >
            Wczytaj zapis serwera
          </button>
        </div>
      )}

      {finished ? (
        <CreatorFinishedScreen
          finished={finished}
          busy={busy}
          onRetryToken={() => void finish()}
          onOpenSheet={() => {
            openSheet(finished.result.id);
            setBehind(true);
          }}
          onGo={() => setBehind(true)}
          onClose={() => {
            closeCreator();
            setDraft(null);
          }}
        />
      ) : data.roles.length === 0 ? (
        <p className="creator-empty">
          Brak danych tworzenia postaci — kreator nie ma z czego czytać tabel Ról. Uruchom
          <code> tools/import/parse-creation.py</code>.
        </p>
      ) : !draft ? (
        <p className="creator-empty">Wczytuję szkic…</p>
      ) : (
        <>
          <nav className="sheet-tabs creator-steps" aria-label="Kroki kreatora">
            {CPRED_CREATION_STEPS.map((tab, index) => {
              const current = draft.step === tab;
              const open = openByStep.get(tab) ?? 0;
              // A step counts once the player has been there and moved on;
              // the one on screen explains itself field by field.
              const judged = index <= visitedIndex && !current && tab !== 'summary';
              const state = !judged ? 'none' : open > 0 ? 'open' : 'done';
              const label = CPRED_CREATION_STEP_LABELS[tab];
              return (
                <button
                  key={tab}
                  type="button"
                  className={`sheet-tab ${current ? 'sheet-tab--active' : ''}`}
                  aria-current={current ? 'step' : undefined}
                  title={
                    state === 'open'
                      ? `${label}: ${open} do uzupełnienia`
                      : state === 'done'
                        ? `${label}: gotowe`
                        : label
                  }
                  onClick={() => void patch({ step: tab })}
                >
                  <span className="creator-step-number">{index + 1}</span>
                  {label}
                  {state === 'open' && (
                    <span className="creator-step-badge creator-step-badge--open">
                      {open}
                      <span className="visually-hidden"> do uzupełnienia</span>
                    </span>
                  )}
                  {state === 'done' && (
                    <span className="creator-step-badge creator-step-badge--done" aria-hidden>
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="sheet-body creator-body">
            {draft.step === 'role' && <RoleStep draft={draft} ask={setQuestion} />}
            {draft.step === 'stats' && <StatsStep draft={draft} />}
            {draft.step === 'skills' && <SkillsStep draft={draft} />}
            {draft.step === 'lifepath' && <LifepathStep draft={draft} />}
            {draft.step === 'gear' && <GearStep draft={draft} />}
            {draft.step === 'details' && <DetailsStep draft={draft} />}
            {draft.step === 'summary' && (
              <SummaryStep
                draft={draft}
                isGm={isGm}
                players={players}
                ownerId={ownerId}
                onOwnerChange={setOwnerId}
                issues={issueLines}
                onGoTo={goToField}
              />
            )}
          </div>

          <footer className="creator-footer">
            <button
              type="button"
              className="small-button"
              disabled={stepIndex === 0}
              onClick={() => void patch({ step: CPRED_CREATION_STEPS[stepIndex - 1] })}
            >
              ← Wstecz
            </button>
            {issues.length === 0 ? (
              // Not „Postać gotowa": the wizard's rules are met, the book's
              // starting kit is not (Moda, pakiet, cyborgizacje — naprawa 3a).
              <span className="creator-issues-count">Wymagania kreatora spełnione</span>
            ) : draft.step === 'summary' ? (
              <span className="creator-issues-count">
                {issuesCountText(issueLines.length)} — lista wyżej
              </span>
            ) : (
              <button
                type="button"
                className="creator-issues-count creator-issues-link"
                onClick={() => void patch({ step: 'summary' })}
                title="Pokaż wszystkie braki w podsumowaniu"
              >
                {issuesCountText(issueLines.length)} — pokaż
              </button>
            )}
            {draft.step === 'summary' ? (
              <button
                type="button"
                className="small-button small-button--primary"
                disabled={busy || issues.length > 0}
                onClick={() => void finish()}
              >
                Utwórz postać
              </button>
            ) : (
              <button
                type="button"
                className="small-button"
                onClick={() => void patch({ step: CPRED_CREATION_STEPS[stepIndex + 1] })}
              >
                Dalej →
              </button>
            )}
            {/* Decyzja MG z 24.09: a player's draft goes only by the GM's hand. */}
            {isGm ? (
              <button
                type="button"
                className="small-button small-button--danger"
                onClick={() =>
                  setQuestion({
                    title: 'Wyrzucić szkic postaci?',
                    lost: draftSummaryLines(draft, registry.roles),
                    note:
                      campaign && !campaign.sandbox
                        ? `Kampania „${campaign.name}” nie jest oznaczona jako poligon.`
                        : undefined,
                    confirmLabel: 'Wyrzuć szkic',
                    onConfirm: () => void discard(),
                  })
                }
                title="Kasuje szkic razem z tym, co już wybrano"
              >
                🗑 Wyrzuć szkic
              </button>
            ) : (
              <span
                className="creator-hint creator-footer-hint"
                title="Zasada z początku kreatora: szkic wyrzuca tylko MG"
              >
                Szkic wyrzuca tylko MG
              </span>
            )}
          </footer>

          {error && <p className="auth-error creator-error">{error}</p>}
        </>
      )}
      {question && <CreatorDialog question={question} onClose={() => setQuestion(null)} />}
      <WindowResizeGrip resizeProps={placement.resizeProps} />
    </section>
  );
}

/** „1 brak", „3 braki", „5 braków" — the Polish plural of the footer count. */
function issuesCountText(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  const word =
    count === 1 ? 'brak' : ones >= 2 && ones <= 4 && (tens < 12 || tens > 14) ? 'braki' : 'braków';
  return `${count} ${word} do uzupełnienia`;
}

/** An in-window question before something nothing undoes (naprawa 2b). */
interface CreatorQuestion {
  title: string;
  /** What goes, one line per kind; the list is the point of asking. */
  lost: string[];
  /** Consequences that take nothing away. */
  notes?: string[];
  /** One more sentence under the lists (a campaign that is not a sandbox). */
  note?: string;
  confirmLabel: string;
  onConfirm: () => void;
}

/**
 * The creator's own confirmation, drawn over its body instead of a browser
 * `window.confirm` (naprawa 2b, the GM's decision): it lists what the change
 * throws away, starts on „Anuluj", keeps Tab inside itself, closes on Esc and
 * gives the keyboard back to the control that opened it.
 */
function CreatorDialog({ question, onClose }: { question: CreatorQuestion; onClose: () => void }) {
  const titleId = useId();
  const bodyId = useId();
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancel.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      // Stops here: Esc also puts a loaded dice cup down, which is not what
      // closing this question means.
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !box.current) return;
    const focusable = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="creator-dialog-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={box}
        className="creator-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={onKeyDown}
      >
        <h3 id={titleId}>{question.title}</h3>
        <div id={bodyId} className="creator-dialog-body">
          {question.lost.length > 0 && (
            <>
              <p className="creator-dialog-lead">Przepadnie:</p>
              <ul className="creator-dialog-list creator-dialog-list--lost">
                {question.lost.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          )}
          {question.notes && question.notes.length > 0 && (
            <>
              <p className="creator-dialog-lead">Poza tym:</p>
              <ul className="creator-dialog-list">
                {question.notes.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          )}
          {question.note && <p className="creator-hint">{question.note}</p>}
          <p className="creator-dialog-lead">Tego nie da się cofnąć.</p>
        </div>
        <div className="creator-dialog-actions">
          <button ref={cancel} type="button" className="small-button" onClick={onClose}>
            Anuluj
          </button>
          <button
            type="button"
            className="small-button small-button--danger"
            onClick={() => {
              onClose();
              question.onConfirm();
            }}
          >
            {question.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** What „Wyrzuć szkic" throws away, in the words of the steps. */
function draftSummaryLines(
  draft: CpredCreationDraft,
  roles: readonly { id: string; name: string }[],
): string[] {
  const lines: string[] = [];
  const role = roles.find((entry) => entry.id === draft.roleId)?.name;
  const name = draft.name.trim();
  lines.push(
    `${name ? `„${name}”` : 'Szkic bez ksywy'} · ${CPRED_CREATION_METHOD_LABELS[draft.method]}${
      role ? ` · ${role}` : ''
    }.`,
  );
  const stats = CPRED_STAT_IDS.filter((id) => draft.stats[id] !== undefined).length;
  if (stats > 0) lines.push(`Cechy: ${stats} z ${CPRED_STAT_IDS.length}.`);
  const skills = Object.values(draft.skills).filter((level) => level > 0).length;
  if (skills > 0) lines.push(`Umiejętności: ${skills}.`);
  const pieces = Object.values(draft.purchases).reduce((sum, qty) => sum + qty, 0);
  if (pieces > 0) lines.push(`Koszyk: ${pieces} szt.`);
  const { lifepath } = draft;
  const people = lifepath.friends.length + lifepath.enemies.length + lifepath.tragicLoves.length;
  if (lifepath.culture || lifepath.roleAnswers.length > 0 || people > 0) {
    lines.push('Ścieżka Życia wypełniona do tej pory.');
  }
  if (draft.portraitUrl) lines.push('Wybrany portret (sam obraz zostaje w galerii).');
  return lines;
}

function countIssuesByStep(issues: CpredValidationIssue[]): Map<CpredCreationStep, number> {
  const counts = new Map<CpredCreationStep, number>();
  for (const issue of issues) {
    const step = creationIssueStep(issue.field);
    counts.set(step, (counts.get(step) ?? 0) + 1);
  }
  return counts;
}

const FOCUSABLE =
  'input:not([disabled]), select:not([disabled]), button:not([disabled]), textarea:not([disabled])';

/**
 * Finds the element a validation field names (`data-creation-field`) — or the
 * nearest one the step renders for it: `stats.body` falls back to `stats` when
 * a Krawędziarz has no input to type in — scrolls to it and focuses it.
 */
function focusCreationField(root: HTMLElement, field: string): void {
  let target: HTMLElement | null = null;
  let name = field;
  while (name && !target) {
    target = root.querySelector<HTMLElement>(`[data-creation-field="${CSS.escape(name)}"]`);
    name = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : '';
  }
  if (!target) return;
  const found = target;
  found.scrollIntoView({ block: 'center' });
  const focusable = found.matches(FOCUSABLE) ? found : found.querySelector<HTMLElement>(FOCUSABLE);
  focusable?.focus({ preventScroll: true });
  // A short outline says „tutaj" even when the field itself takes no focus.
  found.classList.add('creator-field--flash');
  window.setTimeout(() => found.classList.remove('creator-field--flash'), 1600);
}

// ─────────────────────────────── krok 1: Rola ───────────────────────────────

function RoleStep({
  draft,
  ask,
}: {
  draft: CpredCreationDraft;
  ask: (question: CreatorQuestion) => void;
}) {
  const registry = useCharacterStore((s) => s.registry);
  const patch = useCreationStore((s) => s.patch);
  const entriesById = useCompendiumStore((s) => s.entries);
  const shopRules = useCreationShopRules();
  const data = creationDataOf(registry);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  // Decyzja MG z 24.09: the GM chose the method with the consent.
  const methodLocked = draft.methodFixed && !isGm;
  const skillPool = creationSkillPool(data, draft);

  /**
   * Naprawa 2b: a change that takes something off the draft asks first, with
   * the list read off the same merge the server applies. A change that loses
   * nothing (the first Role, a method switch on an empty draft) goes straight.
   */
  function change(next: { method: CpredCreationMethod } | { roleId: string }) {
    const current = useCreationStore.getState().draft ?? draft;
    const effect = creationChangeEffect(
      current,
      next,
      data,
      registry,
      (entryId: string) => entriesById[entryId],
      shopRules,
    );
    if (effect.lost.length === 0) {
      void patch(next);
      return;
    }
    const title =
      'method' in next
        ? `Zmienić metodę na „${CPRED_CREATION_METHOD_LABELS[next.method]}”?`
        : `Zmienić Rolę na: ${registry.roles.find((role) => role.id === next.roleId)?.name ?? next.roleId}?`;
    ask({
      title,
      lost: effect.lost,
      notes: effect.notes,
      confirmLabel: 'method' in next ? 'Zmień metodę' : 'Zmień Rolę',
      onConfirm: () => void patch(next),
    });
  }

  return (
    <div className="creator-step">
      <fieldset className="creator-methods">
        <legend>Metoda tworzenia</legend>
        {CPRED_CREATION_METHODS.map((method) => (
          <label
            key={method}
            className={`creator-method ${
              methodLocked && draft.method !== method ? 'creator-method--locked' : ''
            }`}
            title={
              methodLocked && draft.method !== method
                ? 'Metodę ustalił MG, udzielając zgody na postać.'
                : undefined
            }
          >
            <input
              type="radio"
              name="creation-method"
              checked={draft.method === method}
              disabled={methodLocked && draft.method !== method}
              onChange={() => change({ method })}
            />
            <span>
              <strong>{CPRED_CREATION_METHOD_LABELS[method]}</strong>
              <span className="creator-method-note">
                {method === 'edgerunner'
                  ? `1k10 na każdą Cechę z szablonu Roli · ${skillPool} pkt na 20 umiejętności Roli`
                  : `pula punktów na Cechy · ${skillPool} pkt na dowolne umiejętności`}
              </span>
            </span>
          </label>
        ))}
        {methodLocked && (
          <p className="creator-hint">Metodę i pulę punktów ustalił MG, udzielając zgody.</p>
        )}
        {/* Naprawa 2b: the window lists the losses before the change is made. */}
        <p className="creator-hint">
          Zmiana metody albo Roli może skasować wpisane Cechy, umiejętności, koszyk i odpowiedzi
          Ścieżki Życia Roli — kreator najpierw pokaże, co dokładnie przepadnie. Wylosowane rzuty
          Cech zostają zawsze.
        </p>
      </fieldset>

      {draft.roleId === null && (
        <p className="creator-notice">Wybierz Rolę — od niej zależą Cechy i lista umiejętności.</p>
      )}
      <div className="creator-roles" data-creation-field="roleId">
        {data.roles.map((role) => {
          const definition = registry.roles.find((entry) => entry.id === role.id);
          const chosen = draft.roleId === role.id;
          return (
            <button
              key={role.id}
              type="button"
              className={`creator-role ${chosen ? 'creator-role--chosen' : ''}`}
              aria-pressed={chosen}
              onClick={() => {
                if (!chosen) change({ roleId: role.id });
              }}
            >
              <strong className="creator-role-name">
                {definition?.name ?? role.id}
                {chosen && <span className="creator-role-check">✓ wybrana</span>}
              </strong>
              {definition?.summary && (
                <span className="creator-role-summary">{definition.summary}</span>
              )}
              <span className="creator-role-ability">
                Zdolność Specjalna: {/* #71: „Zmysł Walki 4” nie łamie się przed liczbą. */}
                <span className="creator-role-ability-name">
                  {definition?.ability ?? '—'} {data.roleAbilityStart}
                </span>
              </span>
              <span className="creator-role-skills">
                {role.skills.length} umiejętności na liście Roli
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────── krok 2: Cechy ───────────────────────────────

function StatsStep({ draft }: { draft: CpredCreationDraft }) {
  const rankApproved = useCreationStore((s) => s.rankApproved);
  const user = useAuthStore((s) => s.user);
  const isGm = user?.role === ROLE_GM;
  const registry = useCharacterStore((s) => s.registry);
  const patch = useCreationStore((s) => s.patch);
  const busy = useCreationStore((s) => s.busy);
  const cup = useRollStore((s) => s.creation);
  const inCup = cup !== null;
  const data = creationDataOf(registry);
  const role = creationRole(data, draft.roleId);

  const preview = creationPreview(creationStats(draft, data));
  // Kompletny Pakiet startuje z minimum na każdej Cesze, więc liczby są prawdą
  // od początku; rzucane metody czekają na ostatni rzut.
  const statsSet =
    draft.method === 'complete' || CPRED_STAT_IDS.every((id) => draft.stats[id] !== undefined);
  const derived = (value: number) => (statsSet ? value : '—');
  const pool = creationStatPool(data, draft);
  const spent = creationStatPointsSpent(draft);
  const unrolled = CPRED_STAT_IDS.filter((id) => draft.statRolls[id] === undefined).length;
  const next = nextCreationCup(draft, 'stats');
  // Naprawa 2a: the pool is the GM's call, so a player types nothing until it
  // is made — the server refuses the write the same way.
  const locked = draft.method === 'complete' && !isGm && !rankApproved;

  const rollable = role !== null && draft.method === 'edgerunner' && role.statTemplates.length > 0;

  // The cup may only hold a spread it can still throw. Switching to Kompletny
  // Pakiet, or backing out of the Role, has to put it down.
  useEffect(() => {
    if (!rollable) clearCreationCup();
    return clearCreationCup;
  }, [rollable]);

  if (role === null) {
    return (
      <p className="creator-empty">Najpierw wybierz Rolę — bez niej nie ma z czego losować.</p>
    );
  }

  return (
    <div className="creator-step">
      <div className="creator-stats-head" data-creation-field="stats">
        {draft.method === 'edgerunner' ? (
          <>
            {/* One die per stat, through the cup (zlecenie MG z 17.09): shaking
                it is what a player came here for, and the shake really seeds
                the server's dice. „Weź kubek" walks the stats in order and
                reloads after each throw. The GM keeps a plain button for the
                stats still missing — five NPCs in an evening is not a ceremony. */}
            <button
              type="button"
              className={`small-button ${inCup ? '' : 'small-button--primary'}`}
              disabled={busy || (!inCup && next === null)}
              onClick={() => (inCup ? clearCreationCup() : next && loadCreationCup(next))}
            >
              {inCup ? '↩ Odłóż kubek' : '🥤 Weź kubek'}
            </button>
            {isGm && unrolled > 0 && (
              <button
                type="button"
                className="small-button"
                disabled={busy}
                onClick={() => void rollMissingStatsPlain()}
                title="Skrót dla MG: rzuca brakujące Cechy naraz, bez kubka"
              >
                🎲 Rzuć brakujące
              </button>
            )}
            <span className="creator-hint">
              {inCup
                ? cup.chain
                  ? 'Kubek czeka w rogu ekranu — złap go, potrząśnij i puść. Po rzucie weźmie następną Cechę. Esc odkłada.'
                  : 'Kubek czeka w rogu ekranu — złap go, potrząśnij i puść. Esc odkłada.'
                : isGm
                  ? 'Jedna kość na Cechę; rzuca serwer i zostawia kartę na czacie. Kubek przy wylosowanej Cesze ją przerzuca.'
                  : 'Jedna kość na Cechę; rzuca serwer i zostawia kartę na czacie. Każdą Cechę rzuca się raz — przerzut może pozwolić tylko MG.'}
            </span>
            {unrolled > 0 && !inCup && (
              <span className="creator-pool creator-pool--open">
                {unrolled === CPRED_STAT_IDS.length
                  ? 'Cechy jeszcze nie wylosowane'
                  : `Do wylosowania: ${unrolled}`}
              </span>
            )}
          </>
        ) : (
          <>
            <label className="creator-rank">
              Ranga Postaci (ustala MG)
              <select
                data-creation-field="statRankId"
                disabled={!isGm}
                value={draft.statRankId}
                onChange={(e) => void patch({ statRankId: e.target.value })}
              >
                {data.statRanks.map((rank) => (
                  <option key={rank.id} value={rank.id}>
                    {rank.name} — {rank.points} pkt
                  </option>
                ))}
              </select>
            </label>
            {!isGm && rankApproved && (
              <span className="creator-hint">Pula zatwierdzona przez MG dla tego szkicu.</span>
            )}
            {!locked && (
              <span className={`creator-pool ${poolStateClass(spent, pool)}`} role="status">
                Punkty Cech: wydane {spent} z {pool} · pozostało {pool - spent}
              </span>
            )}
          </>
        )}
      </div>
      {locked && (
        <p className="creator-notice" role="status">
          MG ustala Rangę Postaci, a z nią pulę punktów Cech. Do tego czasu pola Cech są zablokowane
          — w międzyczasie możesz przejść do Umiejętności i Ścieżki Życia.
        </p>
      )}

      <table className="creator-stats">
        <tbody>
          {CPRED_STAT_IDS.map((id) => (
            <StatRow key={id} statId={id} draft={draft} locked={locked} />
          ))}
        </tbody>
      </table>

      {/* #67 (T8b): przed rzutami i w ich połowie liczby liczyły się z Cech,
          których jeszcze nie ma (PW 20 przed pierwszym rzutem) — kreska, jak
          w podsumowaniu, dopóki wszystkie Cechy nie są ustalone. */}
      <dl className="creator-derived">
        <div>
          <dt>Punkty Wytrzymałości</dt>
          <dd>{derived(preview.hpMax)}</dd>
        </div>
        <div>
          <dt>Poważnie Ranny</dt>
          <dd>{derived(preview.seriousWound)}</dd>
        </div>
        <div>
          <dt>Przeżywalność</dt>
          <dd>{derived(preview.deathSave)}</dd>
        </div>
        <div>
          <dt>Człowieczeństwo</dt>
          <dd>{derived(preview.humanity)}</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * The text of a field saved on every keystroke. The server's copy trails the
 * keyboard by a round trip, and an input bound to it gets its old text put back
 * by React after each key — on a slow link fast typing dropped characters and
 * a spinner's second click re-sent the first value. While focused the field
 * keeps what was typed; otherwise it follows each draft the server hands back
 * (reload, another window, a retried write).
 */
function useDraftFieldText(serverText: string, draft: CpredCreationDraft, field: string) {
  const [text, setText] = useState(serverText);
  const editing = useRef(false);
  // Naprawa 2b: writes of this field still on their way. Until the last one is
  // back, a draft the server returns is an older text than the one typed, and
  // following it made the field replay each intermediate state after leaving.
  const outstanding = useRef(0);
  const [settled, setSettled] = useState(0);
  // A refused write keeps the typed text on screen until it is retried or the
  // server's copy is reloaded — the change is waiting, not gone.
  const pendingPatch = useCreationStore((s) => s.pendingPatch);
  useEffect(() => {
    if (!editing.current && outstanding.current === 0 && !pendingPatch) setText(serverText);
  }, [serverText, draft, pendingPatch, settled]);
  return {
    text,
    setText,
    /** Sends the field's write; a newer one replaces it while it still waits. */
    write: (
      patch: Record<string, unknown> | ((current: CpredCreationDraft) => Record<string, unknown>),
    ) => {
      outstanding.current += 1;
      void useCreationStore
        .getState()
        .patch(patch, { field })
        .finally(() => {
          outstanding.current -= 1;
          setSettled((count) => count + 1);
        });
    },
    onFocus: () => {
      editing.current = true;
    },
    onBlur: () => {
      editing.current = false;
      setSettled((count) => count + 1);
    },
  };
}

function statInputValue(text: string, limits: { statMin: number; statMax: number }) {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isInteger(value) && value >= limits.statMin && value <= limits.statMax
    ? value
    : null;
}

/** Colour of a pool line: over the pool, spent exactly, or points still to give out. */
function poolStateClass(spent: number, pool: number): string {
  if (spent > pool) return 'creator-pool--over';
  return spent === pool ? 'creator-pool--done' : 'creator-pool--open';
}

function StatRow({
  statId,
  draft,
  locked,
}: {
  statId: CpredStatId;
  draft: CpredCreationDraft;
  locked: boolean;
}) {
  const registry = useCharacterStore((s) => s.registry);
  const data = creationDataOf(registry);
  const label = CPRED_STAT_LABELS[statId];
  const value = draft.stats[statId];
  const roll = draft.statRolls[statId];
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const busy = useCreationStore((s) => s.busy);
  const inThisCup = useRollStore(
    (s) => s.creation?.roll.kind === 'stat' && s.creation.roll.statId === statId,
  );
  const roleName = registry.roles.find((entry) => entry.id === draft.roleId)?.name ?? '';
  const field = useDraftFieldText(
    value === undefined ? '' : String(value),
    draft,
    `stats.${statId}`,
  );
  const hintId = useId();

  return (
    <tr>
      <th scope="row">
        <span className="creator-stat-abbr">{label.abbr}</span>
        <span className="creator-stat-name">{label.name}</span>
        <span id={hintId} className="creator-stat-hint">
          {CPRED_STAT_HINTS[statId]}
        </span>
      </th>
      <td className="creator-stat-value">
        {draft.method === 'complete' ? (
          <input
            type="number"
            data-creation-field={`stats.${statId}`}
            aria-label={`${label.name} (${label.abbr})`}
            aria-describedby={hintId}
            disabled={locked}
            min={data.limits.statMin}
            max={data.limits.statMax}
            value={field.text}
            placeholder="—"
            onFocus={field.onFocus}
            onChange={(e) => {
              field.setText(e.target.value);
              const next = statInputValue(e.target.value, data.limits);
              // An empty or half-typed field is not an intent yet; nothing leaves.
              if (next === null) return;
              field.write((current) => ({ stats: { ...current.stats, [statId]: next } }));
            }}
            onBlur={() => {
              field.onBlur();
              // Leftovers that were never sent give way to what is stored.
              if (statInputValue(field.text, data.limits) === null) {
                field.setText(value === undefined ? '' : String(value));
              }
            }}
          />
        ) : (
          <strong>{value ?? '—'}</strong>
        )}
      </td>
      <td className="creator-stat-roll">
        {/* The dice stay in the draft under Kompletny Pakiet (decyzja MG
            z 24.09), but they mean nothing there. */}
        {draft.method === 'edgerunner' && roll !== undefined && `rzut ${roll}`}
        {draft.method === 'edgerunner' && (roll === undefined || isGm) && (
          <button
            type="button"
            className={`small-button creator-stat-cup${inThisCup ? ' small-button--primary' : ''}`}
            disabled={busy || locked}
            aria-pressed={inThisCup}
            title={
              inThisCup
                ? 'Odłóż kubek'
                : roll === undefined
                  ? `Weź kubek: ${label.name}`
                  : `Przerzuć ${label.name} (tylko MG)`
            }
            aria-label={
              inThisCup
                ? 'Odłóż kubek'
                : roll === undefined
                  ? `Weź kubek: ${label.name}`
                  : `Przerzuć ${label.name}`
            }
            onClick={() =>
              inThisCup ? clearCreationCup() : loadCreationCup(creationStatCup(statId, roleName))
            }
          >
            🥤
          </button>
        )}
      </td>
    </tr>
  );
}

// ──────────────────────────── krok 3: Umiejętności ────────────────────────────

type SkillFilter = 'all' | 'missing' | 'taken' | 'role';

/** „Wiedza lokalna" finds „wiedza", „wiedza lok" and „wiedza lokalna" alike. */
function searchText(text: string): string {
  return text
    .toLocaleLowerCase('pl')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/** A skill whose field the rulebook makes you name, bought without one. */
function specialtyMissing(draft: CpredCreationDraft, row: CpredCreationSkillRow): boolean {
  return (
    cpredSkillNeedsSpecialty(row.skillId) &&
    !row.free &&
    !row.basic &&
    row.level > 0 &&
    !(draft.skillSpecialties[row.skillId] ?? '').trim()
  );
}

/**
 * The skills step (naprawa 2a). Every requirement sits on the row it is about:
 * „Podstawowa · min. 2", the points still owed, the ×2 price and the Check
 * base (stat + level). The counter stays on screen while the list scrolls, and
 * the search and the „Braki" filter get the player to a row without reading
 * sixty-six of them.
 */
function SkillsStep({ draft }: { draft: CpredCreationDraft }) {
  const registry = useCharacterStore((s) => s.registry);
  const patch = useCreationStore((s) => s.patch);
  const busy = useCreationStore((s) => s.busy);
  const goToField = useCreationStore((s) => s.goToField);
  const data = creationDataOf(registry);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SkillFilter>('all');

  const rows = useMemo(
    () =>
      new Map(
        creationAvailableSkills(draft, data, registry).map((id) => [
          id,
          creationSkillRow(draft, data, registry, id),
        ]),
      ),
    [draft, data, registry],
  );
  const spent = creationSkillPointsSpent(draft, data, registry);
  const skillPool = creationSkillPool(data, draft);
  const left = skillPool - spent;
  const legacyMinima = draft.skillMinimaAuto
    ? []
    : creationMissingSkillMinima(draft, data, registry);
  const legacyCost = legacyMinima.reduce((sum, row) => sum + row.cost, 0);
  const names = new Map(registry.skills.map((skill) => [skill.id, skill.name]));
  const freeRow = data.freeLanguage ? rows.get(data.freeLanguage.skillId) : undefined;
  const roleChosen = draft.roleId !== null;
  const needle = searchText(query.trim());

  const listed = [...rows.values()].filter((row) => !row.free);
  const counts: Record<SkillFilter, number> = {
    all: listed.length,
    missing: listed.filter((row) => row.missingPoints > 0 || specialtyMissing(draft, row)).length,
    taken: listed.filter((row) => row.level > 0).length,
    role: listed.filter((row) => row.roleListed).length,
  };
  const filters: { id: SkillFilter; label: string }[] = [
    { id: 'all', label: 'Wszystkie' },
    { id: 'missing', label: 'Braki' },
    { id: 'taken', label: 'Wybrane' },
    ...(draft.method === 'complete' && roleChosen
      ? [{ id: 'role' as const, label: 'Lista Roli' }]
      : []),
  ];

  function shown(skill: CpredSkillDefinition): boolean {
    const row = rows.get(skill.id);
    if (!row || row.free) return false;
    if (needle && !searchText(skill.name).includes(needle)) return false;
    if (filter === 'missing') return row.missingPoints > 0 || specialtyMissing(draft, row);
    if (filter === 'taken') return row.level > 0;
    if (filter === 'role') return row.roleListed;
    return true;
  }
  const groups = groupedSkills(registry)
    .map((group) => ({ ...group, skills: group.skills.filter(shown) }))
    .filter((group) => group.skills.length > 0);

  if (draft.method === 'edgerunner' && !roleChosen) {
    return (
      <div className="creator-step">
        <div className="creator-notice">
          <p>Krawędziarz wydaje punkty wyłącznie na umiejętności z listy swojej Roli.</p>
          <button type="button" className="small-button" onClick={() => goToField('roleId')}>
            Wybierz Rolę
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="creator-step">
      <div className="creator-sticky" data-creation-field="skills">
        <div className="creator-sticky-row">
          <span className={`creator-pool ${poolStateClass(spent, skillPool)}`} role="status">
            Punkty umiejętności: wydane {spent} z {skillPool} · pozostało {left}
          </span>
          {counts.missing > 0 && (
            <span className="creator-pool creator-pool--over">
              Wiersze z brakami: {counts.missing}
            </span>
          )}
        </div>
        <div className="creator-sticky-row">
          <input
            type="search"
            className="creator-search"
            value={query}
            placeholder="Szukaj umiejętności…"
            aria-label="Szukaj umiejętności"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Esc empties the search first; an empty field lets it through.
              if (event.key === 'Escape' && query) {
                event.stopPropagation();
                setQuery('');
              }
            }}
          />
          <div className="creator-filters" role="group" aria-label="Pokaż umiejętności">
            {filters.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`creator-filter ${filter === entry.id ? 'creator-filter--on' : ''}`}
                aria-pressed={filter === entry.id}
                onClick={() => setFilter(entry.id)}
              >
                {entry.label} <span className="creator-filter-count">{counts[entry.id]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="creator-hint">
        {draft.method === 'edgerunner'
          ? `Punkty idą tylko na listę Roli. Podstawowe mają od razu poziom ${data.limits.skillMin}, każda inna wybrana umiejętność — co najmniej ${data.limits.skillMin}; najwyżej ${data.limits.skillMax}.`
          : `Podstawowe mają co najmniej poziom ${data.limits.skillMin} — kreator przydziela je od razu i wlicza koszt do puli. Pozostałe: od 1 do ${data.limits.skillMax}. „Lista Roli” to umiejętności, które Rola zwykle zna — podpowiedź, nie wymóg.`}{' '}
        Oznaczenie ×2: każdy poziom kosztuje 2 pkt.
      </p>

      {legacyMinima.length > 0 && (
        <div className="creator-notice creator-notice--warn" role="status">
          <p>
            <strong>Ten szkic powstał przed automatycznym przydziałem minimów.</strong> Poniżej
            poziomu {data.limits.skillMin}:{' '}
            {legacyMinima
              .map((row) => `${names.get(row.skillId) ?? row.skillId} ${row.level} → ${row.min}`)
              .join(', ')}
            . Przydział kosztuje {legacyCost} pkt: pozostanie {left - legacyCost} zamiast {left}.
            Poziomów wybranych wcześniej nic nie obniży.
          </p>
          <button
            type="button"
            className="small-button small-button--primary"
            disabled={busy}
            onClick={() => void patch({ skillMinimaAuto: true })}
          >
            Przydziel minima (−{legacyCost} pkt)
          </button>
        </div>
      )}

      {freeRow && data.freeLanguage && (
        <FreeLanguageCard
          draft={draft}
          row={freeRow}
          onPickName={() => goToField('lifepath.language')}
        />
      )}

      {groups.length === 0 && (
        <p className="creator-empty">Żadna umiejętność nie pasuje do wyszukiwania i filtra.</p>
      )}
      {groups.map((group) => (
        <section key={group.id} className="creator-skill-group">
          <h4>{group.label}</h4>
          <ul>
            {group.skills.map((skill) => (
              <SkillRow key={skill.id} skill={skill} draft={draft} row={rows.get(skill.id)!} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * The free Culture of Origin language, apart from the list: it has no buttons,
 * costs nothing as a language and still carries the street slang's minimum.
 */
function FreeLanguageCard({
  draft,
  row,
  onPickName,
}: {
  draft: CpredCreationDraft;
  row: CpredCreationSkillRow;
  onPickName: () => void;
}) {
  const registry = useCharacterStore((s) => s.registry);
  const skill = registry.skills.find((entry) => entry.id === row.skillId);
  const name = draft.lifepath.language.trim();
  const stat = skill ? CPRED_STAT_LABELS[skill.stat] : null;
  return (
    <div className="creator-free-language">
      <p>
        <strong>Język kultury pochodzenia: {name || 'jeszcze nie wybrany'}</strong> · poziom{' '}
        {row.level} za darmo
        {stat && (
          <span className="creator-skill-stat">
            {' '}
            ·{' '}
            {row.statValue === null
              ? `${stat.name}: jeszcze nieustalona`
              : `${stat.name} ${row.statValue} + ${row.level} = ${row.checkBase}`}
          </span>
        )}
      </p>
      {row.cost > 0 && (
        <p className="creator-hint">
          Minimum slangu ulicznego (umiejętność podstawowa) kosztuje {row.cost} pkt i jest wliczone
          w pulę — na karcie oba języki dzielą jeden wiersz „Język {row.level}”.
        </p>
      )}
      {!name && (
        <button type="button" className="small-button" onClick={onPickName}>
          Wybierz język w Ścieżce Życia
        </button>
      )}
    </div>
  );
}

/**
 * Przykłady dziedzin wprost z opisów umiejętności w danych — to lista
 * przykładów, nie enum, więc podpowiedź, a nie wybór z listy.
 */
const CREATOR_SPECIALTY_HINTS: Record<string, string> = {
  science: 'np. Fizyka',
  'local-expert': 'np. Watson',
  'play-instrument': 'np. gitara',
  'martial-arts': 'np. karate',
};

function SkillRow({
  skill,
  draft,
  row,
}: {
  skill: CpredSkillDefinition;
  draft: CpredCreationDraft;
  row: CpredCreationSkillRow;
}) {
  const registry = useCharacterStore((s) => s.registry);
  const patch = useCreationStore((s) => s.patch);
  const data = creationDataOf(registry);
  const stat = CPRED_STAT_LABELS[skill.stat];
  const [explained, setExplained] = useState(false);
  const descriptionId = useId();

  // „W czym?" — Nauka, Wiedza lokalna, Gra na instrumencie i Sztuki walki nie
  // znaczą nic bez dziedziny (s. 81), a Język ma swoją przy kulturze pochodzenia.
  const needsSpecialty = cpredSkillNeedsSpecialty(skill.id) && !row.free;
  const specialtyField = useDraftFieldText(
    draft.skillSpecialties[skill.id] ?? '',
    draft,
    `skillSpecialties.${skill.id}`,
  );
  const specialty = specialtyField.text;
  const missingSpecialty = needsSpecialty && !row.basic && row.level > 0 && !specialty.trim();
  const missing = row.missingPoints > 0 || missingSpecialty;

  // The next level is read off the newest draft inside the queue, so two quick
  // clicks step twice instead of sending the same level twice.
  function changeLevel(direction: 'up' | 'down') {
    void patch((current) => {
      const fresh = creationSkillRow(current, data, registry, skill.id);
      const next = direction === 'up' ? fresh.up : fresh.down;
      return next === null ? {} : { skills: { ...current.skills, [skill.id]: next } };
    });
  }

  function setSpecialty(next: string) {
    specialtyField.setText(next);
    specialtyField.write((current) => ({
      skillSpecialties: { ...current.skillSpecialties, [skill.id]: next },
    }));
  }

  // Naprawa 2b: the level is one keyboard stop — arrows step it the way the
  // buttons do, and the buttons stay out of the Tab order (66 rows × 2).
  function onLevelKey(event: KeyboardEvent<HTMLElement>) {
    const up = event.key === 'ArrowUp' || event.key === 'ArrowRight' || event.key === '+';
    const down = event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === '-';
    if (!up && !down) return;
    event.preventDefault();
    if (up ? row.up !== null : row.down !== null) changeLevel(up ? 'up' : 'down');
  }

  const upTitle =
    row.up === null
      ? `${skill.name}: najwyżej poziom ${row.max}`
      : `Podnieś ${skill.name} do ${row.up} (+${(row.up - row.level) * row.multiplier} pkt)`;
  const downTitle =
    row.down === null
      ? row.basic && row.level > 0
        ? `${skill.name} jest podstawowa — nie schodzi poniżej ${row.min}`
        : `${skill.name}: poziom 0`
      : `Obniż ${skill.name} do ${row.down} (−${(row.level - row.down) * row.multiplier} pkt)`;

  return (
    <li
      className={`creator-skill${row.level > 0 ? ' creator-skill--taken' : ''}${
        missing ? ' creator-skill--missing' : ''
      }`}
      data-creation-field={`skills.${skill.id}`}
    >
      <div className="creator-skill-main">
        <span className="creator-skill-name">
          {skill.name}
          {skill.description && (
            <button
              type="button"
              className="creator-skill-explain"
              aria-expanded={explained}
              aria-controls={descriptionId}
              title={explained ? `Schowaj opis: ${skill.name}` : `Co obejmuje ${skill.name}?`}
              aria-label={explained ? `Schowaj opis: ${skill.name}` : `Opis: ${skill.name}`}
              onClick={() => setExplained((open) => !open)}
            >
              ?
            </button>
          )}
        </span>
        <span className="creator-skill-controls">
          <button
            type="button"
            className="small-button"
            tabIndex={-1}
            title={downTitle}
            aria-label={downTitle}
            disabled={row.down === null}
            onClick={() => changeLevel('down')}
          >
            −
          </button>
          <strong
            className={`creator-skill-level${row.level === 0 ? ' creator-skill-level--zero' : ''}`}
            role="spinbutton"
            tabIndex={0}
            aria-label={`${skill.name}: poziom`}
            aria-valuenow={row.level}
            aria-valuemin={row.basic ? row.min : 0}
            aria-valuemax={row.max}
            title={`${skill.name}: poziom ${row.level}. Strzałki ↑ ↓ zmieniają poziom.`}
            onKeyDown={onLevelKey}
          >
            {row.level}
          </strong>
          <button
            type="button"
            className="small-button"
            tabIndex={-1}
            title={upTitle}
            aria-label={upTitle}
            disabled={row.up === null}
            onClick={() => changeLevel('up')}
          >
            +
          </button>
        </span>
        <span className="creator-skill-cost">{row.cost} pkt</span>
      </div>
      <div className="creator-skill-meta">
        {row.basic && (
          <span className="creator-tag creator-tag--required">Podstawowa · min. {row.min}</span>
        )}
        {row.multiplier > 1 && (
          <span
            className="creator-tag creator-tag--x2"
            title={`Każdy poziom kosztuje ${row.multiplier} pkt`}
          >
            ×{row.multiplier}
          </span>
        )}
        {draft.method === 'complete' && row.roleListed && (
          <span
            className="creator-tag creator-tag--hint"
            title="Umiejętność z listy wybranej Roli — podpowiedź, nie wymóg"
          >
            lista Roli
          </span>
        )}
        <span
          className="creator-skill-stat"
          title={`Test: ${stat.name} + poziom umiejętności + 1k10`}
        >
          {row.statValue === null
            ? `${stat.name}: jeszcze nieustalona`
            : `${stat.name} ${row.statValue} + ${row.level} = ${row.checkBase}`}
        </span>
      </div>
      {explained && skill.description && (
        <p id={descriptionId} className="creator-skill-description">
          {skill.description}
        </p>
      )}
      {row.missingPoints > 0 && (
        <p className="creator-skill-problem">
          Brakuje {row.missingPoints} pkt do minimum {row.min}.
        </p>
      )}
      {needsSpecialty && (row.level > 0 || specialty) && (
        <label className="creator-skill-specialty-row">
          <span>{row.basic ? 'Dziedzina (opcjonalnie)' : 'Dziedzina'}</span>
          <input
            type="text"
            className={`creator-skill-specialty${
              missingSpecialty ? ' creator-skill-specialty--missing' : ''
            }`}
            data-creation-field={`skillSpecialties.${skill.id}`}
            value={specialty}
            maxLength={SKILL_SPECIALTY_MAX_LENGTH}
            placeholder={CREATOR_SPECIALTY_HINTS[skill.id] ?? 'w czym?'}
            onFocus={specialtyField.onFocus}
            onBlur={specialtyField.onBlur}
            onChange={(e) => setSpecialty(e.target.value)}
            aria-invalid={missingSpecialty || undefined}
          />
        </label>
      )}
      {missingSpecialty && (
        <p className="creator-skill-problem">
          Wpisz dziedzinę — podręcznik każe ją wybrać, bez niej postaci nie da się utworzyć.
        </p>
      )}
    </li>
  );
}

// ───────────────────────── krok 4: Ścieżka Życia ─────────────────────────

/**
 * The Lifepath step (stage 25b).
 *
 * Every row is „wylosuj albo wybierz" — the two the book offers, side by side,
 * and never one without the other: „Jeśli wylosujesz coś, co nie pasuje do
 * twojej wizji Postaci, odpowiednio zmień wynik" (s. 44). The dice always
 * belong to the server; the picker writes straight into the draft.
 *
 * The step is **not** required to finish the character. That is the book's own
 * position on the chapter (a set of prompts, not a rule), and it keeps the GM's
 * five-NPCs-an-evening path as short as it was in 25a.
 */
function LifepathStep({ draft }: { draft: CpredCreationDraft }) {
  const registry = useCharacterStore((s) => s.registry);
  const data = useMemo(() => lifepathDataOf(registry), [registry]);
  const roleTables = useMemo(() => lifepathRoleTables(data, draft.roleId), [data, draft.roleId]);
  const roleName = registry.roles.find((entry) => entry.id === draft.roleId)?.name ?? '';
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const busy = useCreationStore((s) => s.busy);
  const cup = useRollStore((s) => s.creation);
  const inCup = cup !== null;

  if (data.general.length === 0) {
    return (
      <p className="creator-empty">
        Brak danych Ścieżki Życia — kreator nie ma z czego czytać tabel. Uruchom
        <code> tools/import/parse-lifepath.py</code>.
      </p>
    );
  }

  const fieldTables = data.general.filter((table) => isLifepathFieldTable(table.id));
  const unanswered = lifepathUnanswered(draft.lifepath, data, draft.roleId);
  const missing = unanswered.length;
  const next = nextCreationCup(draft, 'lifepath');

  return (
    <div className="creator-step">
      <div className="creator-stats-head">
        {/* One table per throw, through the cup (zlecenie MG z 17.09).
            „Weź kubek" walks the unanswered tables in the order below; the GM
            keeps a plain button for NPCs. */}
        <button
          type="button"
          className={`small-button ${inCup ? '' : 'small-button--primary'}`}
          disabled={busy || (!inCup && next === null)}
          onClick={() => (inCup ? clearCreationCup() : next && loadCreationCup(next))}
        >
          {inCup ? '↩ Odłóż kubek' : '🥤 Weź kubek'}
        </button>
        {isGm && missing > 0 && (
          <button
            type="button"
            className="small-button"
            disabled={busy}
            title="Skrót dla MG: rzuca wszystkie tabele bez odpowiedzi naraz, bez kubka"
            onClick={() => void rollLifepathTablesPlain(unanswered.map((table) => table.id))}
          >
            🎲 Rzuć brakujące
          </button>
        )}
        {/* #71 (T8b): pogrubiony licznik wyglądał jak wymóg, a wymagany jest
            tylko język — reszta Ścieżki to opowieść, nie warunek utworzenia. */}
        <span
          className={`creator-pool ${missing > 0 ? 'creator-pool--optional' : 'creator-pool--done'}`}
          title={
            missing > 0
              ? 'Wymagany jest tylko język ojczysty. Resztę Ścieżki Życia można dopisać później na karcie.'
              : undefined
          }
        >
          {missing === 0 ? 'Ścieżka wypełniona' : `Nieobowiązkowe: ${missing} bez odpowiedzi`}
        </span>
        <span className="creator-hint">
          {inCup && cup.chain
            ? 'Kubek czeka w rogu ekranu — po rzucie weźmie następną tabelę bez odpowiedzi. Esc odkłada.'
            : 'Jedna kość na tabelę; rzuca serwer i zostawia kartę na czacie. Każdy wynik można zmienić ręcznie — tak mówi podręcznik.'}
        </span>
      </div>

      <section className="creator-lifepath-group">
        <h4>Kim jesteś</h4>
        {fieldTables.map((table) => (
          <LifepathFieldRow key={table.id} draft={draft} table={table} />
        ))}
      </section>

      <LifepathPeople draft={draft} group="friends" tables={data.general} />
      <LifepathPeople draft={draft} group="enemies" tables={data.general} />
      <LifepathPeople draft={draft} group="tragicLoves" tables={data.general} />

      {roleTables.length > 0 && (
        <section className="creator-lifepath-group">
          <h4>Ścieżka Życia Roli{roleName ? ` — ${roleName}` : ''}</h4>
          {roleTables.map((table) => (
            <LifepathFieldRow key={table.id} draft={draft} table={table} />
          ))}
        </section>
      )}
      {draft.roleId === null && (
        <p className="creator-hint">
          Ścieżka Życia Roli pojawi się po wybraniu Roli w kroku pierwszym.
        </p>
      )}
    </div>
  );
}

/** Writes a whole Lifepath back to the server; every edit goes through here. */
function useLifepathPatch() {
  const patch = useCreationStore((s) => s.patch);
  return (update: (lifepath: CpredLifepath) => CpredLifepath) =>
    void patch((current) => ({ lifepath: update(current.lifepath) }));
}

/**
 * A line of Lifepath prose — a friend's name, an answer written by hand.
 *
 * It keeps what is being typed locally and sends it on blur, and that is not a
 * nicety. Every patch replaces the whole Lifepath and is built from the draft
 * the server last returned, so a field that saved on each keystroke would build
 * the second letter's patch on top of the state from before the first — typing
 * „Stary Vex" into an enemy left „x" behind. The sheet gets away with
 * per-keystroke saves because it patches one field at a time; this does not.
 */
function LifepathTextInput({
  value,
  placeholder,
  className,
  autoFocus,
  onCommit,
  onDone,
}: {
  value: string;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  onCommit: (next: string) => void;
  onDone?: () => void;
}) {
  const [local, setLocal] = useState(value);
  // Esc (naprawa 2b) leaves without writing: blur reads this, not the state
  // the same key press is still setting.
  const cancelled = useRef(false);
  // A roll elsewhere brings a fresh draft back; nothing is in flight for this
  // field at that moment, so following it is safe and keeps re-rolls visible.
  useEffect(() => setLocal(value), [value]);

  return (
    <input
      className={className}
      type="text"
      autoFocus={autoFocus}
      value={local}
      placeholder={placeholder}
      onChange={(event) => setLocal(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          event.stopPropagation();
          cancelled.current = true;
          setLocal(value);
          event.currentTarget.blur();
        }
      }}
      onBlur={() => {
        if (!cancelled.current && local !== value) onCommit(local);
        cancelled.current = false;
        onDone?.();
      }}
    />
  );
}

/**
 * A row's own cup (zlecenie MG z 17.09): loads this one roll and nothing after
 * it; pressed again while it waits, it puts the cup down.
 */
function CreationCupButton({
  cup,
  label,
  children = '🥤',
}: {
  cup: PendingCreation;
  label: string;
  children?: string;
}) {
  const busy = useCreationStore((s) => s.busy);
  const key = JSON.stringify(cup.roll);
  const loaded = useRollStore(
    (s) => s.creation !== null && JSON.stringify(s.creation.roll) === key,
  );
  return (
    <button
      type="button"
      className={`small-button${loaded ? ' small-button--primary' : ''}`}
      disabled={busy}
      aria-pressed={loaded}
      title={loaded ? 'Odłóż kubek' : label}
      aria-label={loaded ? 'Odłóż kubek' : label}
      onClick={() => (loaded ? clearCreationCup() : loadCreationCup(cup))}
    >
      {children}
    </button>
  );
}

/** The value a table currently holds on the draft, whatever kind of table it is. */
function lifepathValue(lifepath: CpredLifepath, table: CpredLifepathTable): string {
  if (isLifepathFieldTable(table.id)) return lifepath[LIFEPATH_FIELD_TABLES[table.id]];
  return lifepath.roleAnswers.find((answer) => answer.id === table.id)?.answer ?? '';
}

/**
 * One question: what it says now, a picker holding the table, and a die.
 *
 * The picker keeps an extra row for a value that is not in the table — an
 * answer typed by hand, or one left over from an older import — so choosing
 * nothing never silently rewrites what the player wrote.
 */
function LifepathFieldRow({
  draft,
  table,
}: {
  draft: CpredCreationDraft;
  table: CpredLifepathTable;
}) {
  const write = useLifepathPatch();
  const [typing, setTyping] = useState(false);
  const value = lifepathValue(draft.lifepath, table);
  const known = table.entries.some((entry) => entry.text === value);
  const entry = table.entries.find((row) => row.text === value);

  function set(next: string) {
    write((current) => {
      const lifepath = { ...current };
      if (isLifepathFieldTable(table.id)) {
        lifepath[LIFEPATH_FIELD_TABLES[table.id]] = next;
        // A new Culture means a new shortlist of languages; the old pick is a lie.
        if (table.id === 'culture') lifepath.language = '';
      } else {
        const answers = [...lifepath.roleAnswers];
        const at = answers.findIndex((answer) => answer.id === table.id);
        const row = { id: table.id, question: table.question ?? table.label, answer: next };
        if (at === -1) answers.push(row);
        else answers[at] = row;
        lifepath.roleAnswers = answers;
      }
      return lifepath;
    });
  }

  return (
    <>
      <div className="creator-lifepath-row">
        <span className="creator-lifepath-label" title={table.question ?? table.label}>
          {table.label}
        </span>
        {typing ? (
          <LifepathTextInput
            className="creator-lifepath-input"
            autoFocus
            value={value}
            placeholder="Własnymi słowami…"
            onCommit={set}
            onDone={() => setTyping(false)}
          />
        ) : (
          <select
            className="creator-lifepath-select"
            value={known ? value : ''}
            onChange={(e) => set(e.target.value)}
          >
            <option value="">{value && !known ? value : '— nie wybrano —'}</option>
            {table.entries.map((row) => (
              <option key={row.roll} value={row.text}>
                {lifepathRollLabel(row)} · {row.text}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="small-button"
          title="Wpisz własnymi słowami"
          aria-label="Wpisz własnymi słowami"
          onClick={() => setTyping((on) => !on)}
        >
          ✎
        </button>
        <CreationCupButton
          cup={creationLifepathCup(table)}
          label={`Weź kubek: ${table.label} (1k${table.sides})`}
        />
      </div>
      {/* „Tło rodzinne" prints a paragraph beside the answer; it is the half of
          that table a player actually reads back at the session. */}
      {entry?.detail && <p className="creator-lifepath-detail">{entry.detail}</p>}
      {table.id === 'culture' && <LifepathLanguageRow draft={draft} table={table} />}
    </>
  );
}

/**
 * „Język ten traktuje się jak Umiejętność i jego początkowy poziom wynosi 4"
 * (s. 45). Stage 25a granted the level and had nowhere to write the name — this
 * row is that place, and it is why the Lifepath sits in the creator rather than
 * only on the sheet.
 */
function LifepathLanguageRow({
  draft,
  table,
}: {
  draft: CpredCreationDraft;
  table: CpredLifepathTable;
}) {
  const write = useLifepathPatch();
  const entry = table.entries.find((row) => row.text === draft.lifepath.culture);
  const options = entry?.options ?? [];

  const missing = !draft.lifepath.language.trim();
  return (
    <div
      className={`creator-lifepath-row creator-lifepath-row--sub${
        missing ? ' creator-lifepath-row--missing' : ''
      }`}
      data-creation-field="lifepath.language"
    >
      <span className="creator-lifepath-label">Język ojczysty</span>
      {options.length > 0 ? (
        <select
          className="creator-lifepath-select"
          value={draft.lifepath.language}
          onChange={(e) => {
            const language = e.target.value;
            write((current) => ({ ...current, language }));
          }}
        >
          <option value="">— nie wybrano —</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <LifepathTextInput
          className="creator-lifepath-input"
          value={draft.lifepath.language}
          placeholder={
            draft.lifepath.culture ? 'Wpisz język' : 'Najpierw ustal kulturę pochodzenia'
          }
          onCommit={(next) => write((current) => ({ ...current, language: next }))}
        />
      )}
      <span className="creator-lifepath-note">
        {missing ? 'wymagany · ' : ''}poziom 4, za darmo
      </span>
    </div>
  );
}

/** Which kind of NPC each rolled list turns into (stage 10 bot profiles). */
const BOT_KINDS: Record<CpredLifepathGroup, CpredLifepathBotKind> = {
  friends: 'friend',
  enemies: 'enemy',
  tragicLoves: 'love',
};

/** Table ids that fill a cell of one of the three rolled lists. */
const GROUP_COLUMNS: Record<CpredLifepathGroup, { tableId: string; field: string }[]> = {
  friends: [{ tableId: 'friend', field: 'note' }],
  enemies: [
    { tableId: 'enemyWho', field: 'who' },
    { tableId: 'enemyCause', field: 'cause' },
    { tableId: 'enemyResources', field: 'resources' },
    { tableId: 'revenge', field: 'revenge' },
  ],
  tragicLoves: [{ tableId: 'tragicLove', field: 'note' }],
};

/**
 * Friends, enemies and tragic loves: a list whose *length* is rolled („1k10 − 7,
 * minimum 0"), then one throw per column per row.
 *
 * The names are always typed. No table in the book names anybody — that is the
 * table's job, and the sheet is where the name has to survive.
 */
function LifepathPeople({
  draft,
  group,
  tables,
}: {
  draft: CpredCreationDraft;
  group: CpredLifepathGroup;
  tables: CpredLifepathTable[];
}) {
  const user = useAuthStore((s) => s.user);
  const isGm = user?.role === ROLE_GM;
  const setError = useCreationStore((s) => s.setError);
  const write = useLifepathPatch();
  const botKind = BOT_KINDS[group];
  // Its own flag rather than the window's `busy`: naming somebody and pressing
  // 🤖 straight after put a patch in flight, and a button greyed out by `busy`
  // simply swallowed the click. Everything here is queued anyway — the only
  // thing worth blocking is a second bot for the same person.
  const [makingBot, setMakingBot] = useState(false);

  /**
   * Somebody the Lifepath invented becomes a bot profile in one click.
   *
   * The whole point is that the enemy already exists — a reason and a grudge
   * were rolled at session zero — and retyping that into the bot editor by hand
   * is the step at which most of these NPCs quietly stop existing. GM only,
   * because `bot:create` is; a player's enemy is the GM's to bring to life.
   */
  async function toBot(index: number) {
    // The profile is built *inside* the queued call, from the store rather than
    // from this render's props. Typing a name and clicking 🤖 straight after
    // leaves the name's patch still in flight: the queue has already applied it
    // by the time this runs, and the props have not caught up. Reading them
    // here named the bot „Wróg — Kanciarz" instead of „Radna Okoye".
    setMakingBot(true);
    const ack = await enqueueCreationCall(() => {
      const current = useCreationStore.getState().draft;
      const person = current?.lifepath[group][index];
      if (!person) return Promise.resolve({ ok: false as const, error: 'DRAFT_NOT_FOUND' });
      const seed = lifepathBotDraft(botKind, person, current.name);
      return createBot({ name: seed.name, data: seed.data });
    });
    setMakingBot(false);
    if (!ack.ok || !ack.data) {
      setError(botErrorText(ack.ok ? 'INVALID_DATA' : ack.error));
      return;
    }
    useBotStore.getState().openEditor(ack.data.id);
  }
  const columns = GROUP_COLUMNS[group].filter((column) =>
    tables.some((table) => table.id === column.tableId),
  );
  const rows = draft.lifepath[group];
  const groupRoll = lifepathDataOf(useCharacterStore((s) => s.registry)).groupRoll;

  function add() {
    write((current) => {
      const lifepath = { ...current };
      const at = current[group].length + 1;
      if (group === 'enemies') {
        lifepath.enemies = [...lifepath.enemies, emptyLifepathEnemy(`enemy${at}`)];
      } else {
        const prefix = group === 'friends' ? 'friend' : 'love';
        lifepath[group] = [...lifepath[group], emptyLifepathPerson(`${prefix}${at}`)];
      }
      return lifepath;
    });
  }

  function remove(index: number) {
    const id = rows[index]?.id;
    write((current) => {
      const lifepath = { ...current };
      if (group === 'enemies') lifepath.enemies = lifepath.enemies.filter((row) => row.id !== id);
      else lifepath[group] = lifepath[group].filter((row) => row.id !== id);
      return lifepath;
    });
  }

  function edit(index: number, field: string, value: string) {
    const id = rows[index]?.id;
    write((current) => {
      const lifepath = { ...current };
      if (group === 'enemies') {
        lifepath.enemies = lifepath.enemies.map((row) =>
          row.id === id ? { ...row, [field]: value } : row,
        );
      } else {
        lifepath[group] = lifepath[group].map((row) =>
          row.id === id ? { ...row, [field]: value } : row,
        );
      }
      return lifepath;
    });
  }

  return (
    <section className="creator-lifepath-group">
      <h4>
        {LIFEPATH_GROUP_LABELS[group]}
        <span className="creator-lifepath-count">{rows.length}</span>
        <CreationCupButton
          cup={creationCountCup(group, groupRoll.sides)}
          label={`Weź kubek: 1k${groupRoll.sides} − ${Math.abs(groupRoll.modifier)} (minimum 0)`}
        >
          🥤 ilu
        </CreationCupButton>
        <button
          type="button"
          className="small-button"
          disabled={rows.length >= LIFEPATH_GROUP_MAX}
          onClick={add}
        >
          + dopisz
        </button>
      </h4>
      {rows.length === 0 && <p className="creator-hint">Na razie nikogo.</p>}
      {rows.map((row, index) => (
        <div key={row.id} className="creator-lifepath-person">
          <LifepathTextInput
            className="creator-lifepath-input creator-lifepath-input--name"
            value={row.name}
            placeholder={group === 'enemies' ? 'Kto to jest?' : 'Imię'}
            onCommit={(next) => edit(index, 'name', next)}
          />
          {columns.map((column) => {
            const table = tables.find((entry) => entry.id === column.tableId);
            if (!table) return null;
            const value = (row as unknown as Record<string, string>)[column.field] ?? '';
            const known = table.entries.some((entry) => entry.text === value);
            return (
              <span key={column.tableId} className="creator-lifepath-cell">
                <select
                  className="creator-lifepath-select"
                  title={table.label}
                  value={known ? value : ''}
                  onChange={(e) => edit(index, column.field, e.target.value)}
                >
                  <option value="">{value && !known ? value : `— ${table.label} —`}</option>
                  {table.entries.map((entry) => (
                    <option key={entry.roll} value={entry.text}>
                      {lifepathRollLabel(entry)} · {entry.text}
                    </option>
                  ))}
                </select>
                <CreationCupButton
                  cup={creationLifepathCup(table, index)}
                  label={`Weź kubek: ${table.label} (1k${table.sides})`}
                />
              </span>
            );
          })}
          {isGm && (
            <button
              type="button"
              className="small-button"
              disabled={makingBot}
              title="Zrób z tego szkic bota i otwórz edytor"
              aria-label="Zrób z tego szkic bota i otwórz edytor"
              onClick={() => void toBot(index)}
            >
              🤖
            </button>
          )}
          <button
            type="button"
            className="small-button small-button--danger"
            title="Usuń"
            aria-label="Usuń"
            onClick={() => remove(index)}
          >
            🗑
          </button>
        </div>
      ))}
    </section>
  );
}

// ───────────────────────── krok 5: Wyposażenie ─────────────────────────

/** Półki z miniaturą rodzaju — na „Sprzęcie” stałaby przy garstce pozycji. */
function shelfIcons(category: CompendiumCategory): boolean {
  return category === 'weapon' || category === 'armor' || category === 'ammo';
}

/**
 * Półka sklepu kreatora: kategoria Kompendium, a Sprzęt w dwóch częściach
 * (10.10) — jedna lista ciągnęła się przez trzy ekrany.
 */
type CreatorShelf = CompendiumCategory | 'electronics';

const CREATOR_SHELVES: { id: CreatorShelf; label: string }[] = [
  { id: 'weapon', label: 'Broń' },
  { id: 'armor', label: 'Pancerz' },
  { id: 'gear', label: 'Sprzęt' },
  { id: 'electronics', label: 'Elektronika' },
  // Etap 48b: Program jest towarem — kupiony ląduje w gniazdach deku.
  { id: 'program', label: 'Programy' },
  // Etap 48c: dodatek do broni też — kupiony leży w Wyposażeniu, na broń
  // montuje się go z karty („+ Dodatek”) po „Przyjmij do gry”.
  { id: 'attachment', label: 'Dodatki' },
  // Etap 46c: przeładowanie bierze naboje z ekwipunku, więc sklep startowy
  // sprzedaje amunicję (poziom 1 — zwykła i śrut) do kalibru wybranej broni.
  { id: 'ammo', label: 'Amunicja' },
];

/**
 * „Broń bez zapasu amunicji: …” (etap 46c) — kupiona broń przychodzi
 * załadowana, ale bez naboi w ekwipunku przeładowanie odmówi.
 */
function CreatorNoStockWarning({ sheet }: { sheet: CpredCharacterData }) {
  const entriesById = useCompendiumStore((s) => s.entries);
  const weaponTypes = useCompendiumStore((s) => s.weaponTypeById);
  const names = useMemo(() => {
    const types = new Map(Object.entries(weaponTypes));
    // Dwie sztuki tej samej broni (gratis Roli i koszyk) to jedna nazwa.
    return [
      ...new Set(
        cpredWeaponsWithoutStock(sheet, (compendiumId) => {
          const entry = compendiumId ? entriesById[compendiumId] : undefined;
          return entry && isWeaponEntry(entry)
            ? resolveWeapon(entry, { weaponTypeById: types })
            : null;
        }),
      ),
    ];
  }, [sheet, entriesById, weaponTypes]);
  if (names.length === 0) return null;
  return (
    <p className="creator-no-stock" role="note">
      Broń bez zapasu amunicji: {names.join(', ')}. Magazynek jest pełny, ale przeładować się nie da
      — dokup amunicję na półce „Amunicja”.
    </p>
  );
}

/**
 * Starting purchases (stage 25c, shelf reworked in naprawa 3b).
 *
 * The shop is the catalogue of stage 13 and the money is the rulebook's
 * (500 ed for a Krawędziarz, 2550 for a Kompletny Pakiet) — but the shelf is
 * street level plus the Role's own tools up to Zawodowe, which is the GM's
 * wish for session zero: a fresh character buys what any kiosk sells, and a
 * Medyk a medbag, not what a Fixer keeps in the back. Everything else is simply
 * not on this list; the whole catalogue with its greyed-out rows is one tab
 * away in „Kompendium".
 *
 * A row opens into what the item *is* before it goes into the basket (naprawa
 * 3b): the name used to be the buy button, so reading a pistol cost 50 ed.
 */
function GearStep({ draft }: { draft: CpredCreationDraft }) {
  const registry = useCharacterStore((s) => s.registry);
  const busy = useCreationStore((s) => s.busy);
  const patch = useCreationStore((s) => s.patch);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const entriesById = useCompendiumStore((s) => s.entries);
  const order = useCompendiumStore((s) => s.order);
  const shopRules = useCreationShopRules();
  const [shelf, setShelf] = useState<CreatorShelf>('weapon');
  /** Rzecz oglądana w prawej kolumnie (10.10: zamiast rozwijania wiersza). */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const data = creationDataOf(registry);
  const roleName = creationRole(data, draft.roleId)
    ? registry.roles.find((role) => role.id === draft.roleId)?.name
    : undefined;

  const weaponTypes = useCompendiumStore((s) => s.weaponTypeById);
  const weaponTypeMap = useMemo(() => new Map(Object.entries(weaponTypes)), [weaponTypes]);
  const lookup = useMemo(() => (entryId: string) => entriesById[entryId], [entriesById]);
  const lines = useMemo(
    () => creationPurchases(draft, lookup, weaponTypeMap),
    [draft, lookup, weaponTypeMap],
  );
  // Etap 46c: ostrzeżenie o broni bez naboi czyta kartę, którą zapisze „Utwórz”.
  const outcomeSheet = useMemo(
    () =>
      creationOutcome(draft, data, registry, lookup, { weaponTypeById: weaponTypeMap }, true).sheet,
    [draft, data, registry, lookup, weaponTypeMap],
  );
  /** Kaliber wybrany przy wpisie amunicji na półce (typ broni). */
  const [calibreOf, setCalibreOf] = useState<Record<string, string>>({});
  const unavailable = Object.entries(draft.purchases).filter(
    ([id]) => !lines.some((line) => line.entryId === id),
  );
  const spent = creationSpentEddies(lines);
  const budget = creationBudget(data, draft);
  const left = budget - spent;

  // Półka broni: filtr typem i kolejność typami (24.09), jak w Kompendium.
  const [weaponType, setWeaponType] = useState<string | null>(null);
  const entryIcon = useEntryIcon();
  const onShelf = useMemo(() => {
    const all = order.map((id) => entriesById[id]).filter((e): e is CompendiumEntry => !!e);
    return (
      searchCompendium(all, '', shelf === 'electronics' ? 'gear' : shelf)
        .filter(
          (entry) => !isGearEntry(entry) || isElectronicsGear(entry) === (shelf === 'electronics'),
        )
        // Gołe ręce (47b) każda karta dostaje z urzędu — na półce byłyby za 0 ed.
        .filter((entry) => entryPrice(entry) !== null && !cpredIsBareHandsEntry(entry.id))
        .map((entry) => ({ entry, verdict: creationShopVerdict(entry, draft.roleId, shopRules) }))
        .filter((row) => row.verdict.allowed)
    );
  }, [entriesById, order, shelf, draft.roleId, shopRules]);
  const shelfWeapons = useMemo(
    () => onShelf.map((row) => row.entry).filter(isWeaponEntry),
    [onShelf],
  );
  const shelfEntries = useMemo(() => {
    if (shelf !== 'weapon') return onShelf;
    const verdicts = new Map(onShelf.map((row) => [row.entry.id, row.verdict]));
    return filterWeaponsByType(shelfWeapons, weaponType).map((entry) => ({
      entry: entry as CompendiumEntry,
      verdict: verdicts.get(entry.id)!,
    }));
  }, [shelf, onShelf, shelfWeapons, weaponType]);

  const selectedEntry = selectedId ? entriesById[selectedId] : undefined;

  return (
    <div className="creator-step creator-gear">
      <section className="creator-gear-shop" aria-label="Sklep">
        <div className="creator-shop-head">
          {CREATOR_SHELVES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`compendium-category ${shelf === entry.id ? 'compendium-category--active' : ''}`}
              onClick={() => setShelf(entry.id)}
            >
              {entry.label}
            </button>
          ))}
          {/* Etap 48a (decyzja MG z 10.10): pusty koszyk gracza jest brakiem, dopóki
              gracz nie powie wprost, że rusza bez zakupów — żeby nikt nie wyszedł
              z kreatora z gołymi rękami tylko dlatego, że zapomniał o tym kroku. */}
          {!isGm ? (
            <label
              className="creator-checkbox creator-skip-purchases"
              title={
                lines.length > 0
                  ? 'Koszyk nie jest pusty.'
                  : 'Cała gotówka zostanie na karcie — wyposażenie kupisz później u handlarza.'
              }
            >
              <input
                type="checkbox"
                checked={draft.skipPurchases && lines.length === 0}
                disabled={busy || lines.length > 0}
                onChange={(event) => void patch({ skipPurchases: event.target.checked })}
              />
              <span>Ruszam bez zakupów</span>
            </label>
          ) : null}
        </div>

        <p className="creator-hint">
          Na półce: {SHOP_TIER_LABELS[CREATION_SHOP_TIER]} dla wszystkich
          {roleName
            ? ` i narzędzia Roli ${roleName} do poziomu ${SHOP_TIER_LABELS[CREATION_ROLE_TOOL_TIER]}.`
            : '; narzędzia Roli pojawią się po jej wyborze.'}{' '}
          Kliknij rzecz, żeby zobaczyć jej opis obok.
        </p>

        {shelf === 'weapon' ? (
          <WeaponTypeFilter weapons={shelfWeapons} value={weaponType} onChange={setWeaponType} />
        ) : null}

        <ul className="creator-shop">
          {shelfEntries.length === 0 ? (
            <li className="placeholder-text">
              Nic na poziomie 1 ({SHOP_TIER_LABELS[CREATION_SHOP_TIER]})
              {roleName ? ' ani wśród narzędzi Roli' : ''} w tej kategorii.
            </li>
          ) : null}
          {shelfEntries.map(({ entry, verdict }) => {
            const price = entryPrice(entry) ?? 0;
            // Etap 46c: amunicja leży w koszyku pod kluczem z kalibrem — „×N”
            // przy nazwie liczy paczki wszystkich kalibrów tego wpisu.
            const held = Object.entries(draft.purchases)
              .filter(([key]) => creationBasketEntry(key).entryId === entry.id)
              .reduce((sum, [, qty]) => sum + qty, 0);
            const calibres = isAmmoEntry(entry)
              ? cpredCalibreOptions(toAmmoProfile(entry), Object.values(weaponTypes))
              : [];
            const ownCalibre = calibres.find((option) =>
              outcomeSheet.weapons.some(
                (row) => cpredCalibreKey(row.ammoType) === cpredCalibreKey(option.calibre),
              ),
            );
            const calibre =
              calibres.find((option) => option.weaponTypeId === calibreOf[entry.id]) ??
              ownCalibre ??
              calibres[0];
            if (isAmmoEntry(entry) && !calibre) return null;
            const selected = selectedId === entry.id;
            return (
              <li
                key={entry.id}
                className={`creator-shop-item${selected ? ' creator-shop-item--selected' : ''}`}
              >
                <div className="creator-shop-row">
                  <button
                    type="button"
                    className="creator-shop-name"
                    aria-pressed={selected}
                    aria-controls="creator-shop-details"
                    onClick={() => setSelectedId(entry.id)}
                  >
                    {shelfIcons(entry.category) ? <ItemIcon icon={entryIcon(entry)} /> : null}
                    {entry.name}
                    {held > 0 ? <span className="creator-basket-qty">×{held}</span> : null}
                    {verdict.roleTool ? (
                      <span className="creator-tag creator-tag--hint">narzędzie Roli</span>
                    ) : null}
                  </button>
                  {calibre ? (
                    <select
                      className="creator-shop-calibre"
                      value={calibre.weaponTypeId}
                      title={`Kaliber — do jakiej broni. Paczka to ${CPRED_AMMO_PACK_SIZE[calibre.pattern]} szt. (s. 344).`}
                      aria-label={`Kaliber: ${entry.name}`}
                      onChange={(event) =>
                        setCalibreOf((current) => ({ ...current, [entry.id]: event.target.value }))
                      }
                    >
                      {calibres.map((option) => (
                        <option key={option.weaponTypeId} value={option.weaponTypeId}>
                          {option.calibre}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <span className="creator-shop-price">
                    {formatEddies(price)} ed
                    {calibre ? ` / ${CPRED_AMMO_PACK_SIZE[calibre.pattern]} szt.` : ''}
                  </span>
                  <button
                    type="button"
                    className="small-button"
                    disabled={busy || price > left}
                    title={price > left ? 'Za mało startowych eurodolców.' : `Dołóż — ${price} ed`}
                    aria-label={`Dołóż do koszyka: ${entry.name}`}
                    onClick={() => void buyCreationEntry(entry.id, 1, calibre?.weaponTypeId)}
                  >
                    + Dołóż
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <aside className="creator-gear-cart" aria-label="Twoje wyposażenie">
        <div className="creator-budget" data-creation-field="purchases">
          <strong>{formatEddies(left)} ed</strong>
          <span className="creator-hint">
            z {formatEddies(budget)} ed startowych · reszta zostaje na karcie
          </span>
        </div>
        {selectedEntry ? (
          <section
            className="creator-summary-section creator-shop-selected"
            aria-label="Wybrana rzecz"
          >
            <h4>
              <span>{selectedEntry.name}</span>
              <button
                type="button"
                className="small-button"
                title="Zamknij opis"
                aria-label="Zamknij opis"
                onClick={() => setSelectedId(null)}
              >
                ✕
              </button>
            </h4>
            <CreatorShopDetails
              id="creator-shop-details"
              entry={selectedEntry}
              roleTool={creationShopVerdict(selectedEntry, draft.roleId, shopRules).roleTool}
            />
          </section>
        ) : null}
        <CreatorRoleKit draft={draft} data={data} />
        <section className="creator-summary-section" aria-label="Koszyk">
          <h4>Koszyk{spent > 0 ? ` — ${formatEddies(spent)} ed` : ''}</h4>
          {unavailable.length > 0 && (
            <ul className="creator-basket">
              {unavailable.map(([id, qty]) => (
                <li key={id}>
                  <span>
                    {entriesById[creationBasketEntry(id).entryId]?.name ??
                      'Niedostępna pozycja koszyka'}{' '}
                    ×{qty} — brak wpisu lub ceny. Usuń przed zakończeniem.
                  </span>
                  <button
                    type="button"
                    className="small-button"
                    disabled={busy}
                    onClick={() => void buyCreationEntry(id, -1)}
                  >
                    Odłóż jedną sztukę
                  </button>
                </li>
              ))}
            </ul>
          )}
          {lines.length > 0 ? (
            <ul className="creator-basket">
              {lines.map((line) => {
                const entry = entriesById[creationBasketEntry(line.entryId).entryId];
                // A row the shelf no longer carries (the GM moved it, or it was
                // bought under the old price ladder) says so where it can be fixed.
                const onShelf = entry ? creationShopVerdict(entry, draft.roleId, shopRules) : null;
                return (
                  <li key={line.entryId}>
                    <span className="creator-basket-name">
                      {entry && shelfIcons(entry.category) ? (
                        <ItemIcon icon={entryIcon(entry)} />
                      ) : null}
                      {line.name}
                      {line.qty > 1 ? (
                        <span className="creator-basket-qty">×{line.qty}</span>
                      ) : null}
                      {onShelf && !onShelf.allowed ? (
                        <span className="creator-basket-locked">
                          {' '}
                          — {creationShopRefusalText(onShelf.tier, onShelf.roleTool)}
                        </span>
                      ) : null}
                    </span>
                    <span className="creator-basket-price">{formatEddies(line.total)} ed</span>
                    <button
                      type="button"
                      className="small-button"
                      disabled={busy}
                      title="Odłóż jedną sztukę"
                      aria-label={`Odłóż jedną sztukę: ${line.name}`}
                      onClick={() => void buyCreationEntry(line.entryId, -1)}
                    >
                      −
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : unavailable.length === 0 ? (
            <p className="creator-hint">
              Pusty — wybierz rzecz z półki i kliknij „+ Dołóż”. Resztę dokupisz w grze.
            </p>
          ) : null}
        </section>
        <CreatorNoStockWarning sheet={outcomeSheet} />
        <CreatorLeftOutside draft={draft} data={data} compact />
      </aside>
    </div>
  );
}

/**
 * The creator's shelf rules for this campaign: Role tools from the data files
 * and the GM's per-entry choices, both from the compendium store.
 */
function useCreationShopRules(): CreationShopRules {
  const roleTools = useCompendiumStore((s) => s.roleTools);
  const overrides = useCompendiumStore((s) => s.shopTierOverrides);
  const weaponTypeById = useCompendiumStore((s) => s.weaponTypeById);
  return useMemo(
    () => ({ roleTools, ...shopTierContextOf(overrides, weaponTypeById) }),
    [roleTools, overrides, weaponTypeById],
  );
}

/**
 * What a shelf row is, opened under it (naprawa 3b): the numbers the sheet will
 * carry, where it sits on the availability ladder and why, and the catalogue's
 * own description. Only the three categories the creator sells.
 */
function CreatorShopDetails({
  id,
  entry,
  roleTool,
}: {
  id: string;
  entry: CompendiumEntry;
  roleTool: boolean;
}) {
  const registry = useCharacterStore((s) => s.registry);
  const weaponTypeById = useCompendiumStore((s) => s.weaponTypeById);
  const shopRules = useCreationShopRules();
  const availability = shopTierVerdict(entry, shopRules);
  const facts: { label: string; value: string }[] = [];

  if (entry.category === 'weapon') {
    const weapon = resolveWeapon(entry, {
      weaponTypeById: new Map(Object.entries(weaponTypeById)),
    });
    const skill = weapon.skillId
      ? registry.skills.find((row) => row.id === weapon.skillId)?.name
      : undefined;
    facts.push({ label: 'Obrażenia', value: weapon.damage });
    facts.push({ label: 'LA', value: String(weapon.rof) });
    if (weapon.magazine !== null) {
      facts.push({ label: 'Magazynek', value: String(weapon.magazine) });
    }
    facts.push({ label: 'Chwyt', value: weapon.hands === 2 ? 'oburęczna' : 'jednoręczna' });
    facts.push({ label: 'Da się ukryć', value: weapon.concealable ? 'tak' : 'nie' });
    facts.push({ label: 'Jakość', value: WEAPON_QUALITY_LABELS[entry.quality] });
    if (weapon.typeName) facts.push({ label: 'Typ', value: weapon.typeName });
    if (skill) facts.push({ label: 'Umiejętność', value: skill });
  } else if (entry.category === 'armor') {
    facts.push({ label: 'OB', value: String(entry.sp) });
    facts.push({
      label: 'Chroni',
      value: entry.locations.map((location) => ARMOR_LOCATION_LABELS[location]).join(', '),
    });
    facts.push({
      label: 'Kara',
      value: entry.penalty ? `−${Math.abs(entry.penalty)} do REF, ZW i RUCH` : 'brak',
    });
  } else if (entry.category === 'program') {
    facts.push({
      label: 'Klasa',
      value: entry.blackIce ? 'Czarny LOD' : NET_PROGRAM_CLASS_LABELS[entry.programClass],
    });
    facts.push({ label: 'ATK / OBR / REZ', value: `${entry.atk} / ${entry.def} / ${entry.rez}` });
    facts.push({ label: 'Zajmuje gniazd deku', value: String(netProgramSlots(entry)) });
  } else if (isAttachmentEntry(entry)) {
    facts.push({ label: 'Działanie', value: describeAttachment(toAttachmentProfile(entry)) });
  } else if (entry.category === 'gear') {
    if (entry.deckSlots) facts.push({ label: 'Gniazda deku', value: String(entry.deckSlots) });
    if (entry.deckSlotCost) {
      facts.push({ label: 'Zajmuje gniazd deku', value: String(entry.deckSlotCost) });
    }
  }

  return (
    <div id={id} className="creator-shop-details">
      {facts.length > 0 ? (
        <dl className="creator-shop-facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className="creator-hint">
        Dostępność: {availability.tier} — {SHOP_TIER_LABELS[availability.tier]} (
        {availability.reason}){roleTool ? ' · w kreatorze jako narzędzie Roli' : ''}
      </p>
      {entry.category === 'weapon' && entry.features?.length ? (
        <p className="creator-shop-text">{entry.features.join(' · ')}</p>
      ) : null}
      {entry.description ? (
        <p className="creator-shop-text">{entry.description}</p>
      ) : (
        <p className="creator-hint">Kompendium nie ma opisu tego przedmiotu.</p>
      )}
    </div>
  );
}

// ───────────────────────── krok 6: Opis ─────────────────────────

/**
 * Everything the sheet shows before a single number: the street name, the face
 * and whether the character walks onto the map when the wizard closes.
 */
function DetailsStep({ draft }: { draft: CpredCreationDraft }) {
  const patch = useCreationStore((s) => s.patch);
  const busy = useCreationStore((s) => s.busy);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  // Local while typed; follows the server after a reload (see useDraftFieldText).
  const nameField = useDraftFieldText(draft.name, draft, 'name');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function uploadPortrait(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const rejection = fileRejectionText(file, 'portrait');
    if (rejection) {
      setUploadError(rejection);
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      // Patrz `CharacterSheet`: jedna trasa, wiersz w puli i kadr na mapie.
      const asset = await apiUpload<PortraitAssetView>('/api/uploads/portrait-assets', file);
      usePortraitStore.getState().applyUpsert(asset);
      await patch({ portraitUrl: asset.url });
      usePortraitStore.getState().openCrop(asset.id);
    } catch (error) {
      setUploadError(uploadErrorText(error, 'portrait'));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="creator-step creator-details">
      <label className="creator-name">
        <span>
          Ksywa na Ulicy
          {!nameField.text.trim() && <span className="creator-required"> · wymagana</span>}
        </span>
        {/* Sent on every keystroke, like the sheet saves. Saving on blur alone
            cost „Utwórz postać" a click in 25a: the button is disabled until
            the name reaches the server, so the press that blurred the field
            found it still greyed out. The raw value goes out (the space in a
            two-word ksywa has to survive — that was the 13.08 bug) and the
            server trims when it writes the character. */}
        <input
          type="text"
          data-creation-field="name"
          maxLength={64}
          value={nameField.text}
          placeholder="np. Zgrzyt"
          onFocus={nameField.onFocus}
          onBlur={nameField.onBlur}
          onChange={(event) => {
            nameField.setText(event.target.value);
            nameField.write({ name: event.target.value });
          }}
        />
      </label>

      <div className="creator-portrait">
        {draft.portraitUrl ? (
          <img src={draft.portraitUrl} alt="Portret postaci" />
        ) : (
          <span className="creator-portrait-empty">brak portretu</span>
        )}
        {/* Wgranie wprost z kreatora zostaje **tylko MG** (23.08); gracz
            wybiera z puli niżej. Osobna etykieta zamiast arkuszowej
            `cp-portrait-upload`: tamta jest nakładką przypiętą do ramki
            portretu na karcie i tutaj byłaby niewidoczna. */}
        {isGm ? (
          <label className="small-button creator-portrait-upload">
            {uploading ? 'Wgrywanie…' : draft.portraitUrl ? 'Zmień portret' : 'Wgraj portret'}
            <input
              type="file"
              accept={UPLOAD_ACCEPT_ATTRIBUTE}
              title={uploadRequirementText('portrait')}
              onChange={(event) => void uploadPortrait(event)}
              disabled={uploading || busy}
              hidden
            />
          </label>
        ) : null}
        {draft.portraitUrl ? (
          <button
            type="button"
            className="small-button"
            disabled={busy}
            onClick={() => void patch({ portraitUrl: null })}
          >
            Usuń portret
          </button>
        ) : null}
        {/* Kreator jest jedynym miejscem, w którym gracz wybiera twarz (decyzja
            MG z 12.09) — więc i jedynym, w którym warto ją od razu skadrować
            pod mapę. Potem zostaje mu już tylko ten kadr. */}
        <PortraitCropButton portraitUrl={draft.portraitUrl} disabled={busy} />
        {uploadError ? <p className="auth-error">{uploadError}</p> : null}
        <PortraitPicker
          selectedUrl={draft.portraitUrl}
          disabled={busy}
          onPick={(url) => patch({ portraitUrl: url })}
        />
      </div>

      <label className="creator-checkbox">
        <input
          type="checkbox"
          checked={draft.placeToken}
          disabled={busy}
          onChange={(event) => void patch({ placeToken: event.target.checked })}
        />
        <span>
          Postaw żeton na aktywnej scenie
          <span className="creator-hint">
            Portret posłuży za obrazek żetonu, dopóki MG nie wybierze innego.
          </span>
        </span>
      </label>
    </div>
  );
}

// ───────────────────────── krok 7: Podsumowanie ─────────────────────────

function SummaryStep({
  draft,
  isGm,
  players,
  ownerId,
  onOwnerChange,
  issues,
  onGoTo,
}: {
  draft: CpredCreationDraft;
  isGm: boolean;
  players: { id: string; name: string }[];
  ownerId: string;
  onOwnerChange: (value: string) => void;
  issues: CpredValidationIssue[];
  onGoTo: (field: string) => void;
}) {
  const registry = useCharacterStore((s) => s.registry);
  const entriesById = useCompendiumStore((s) => s.entries);
  const weaponTypes = useCompendiumStore((s) => s.weaponTypeById);
  const userName = useAuthStore((s) => s.user?.name ?? '');
  const scenes = useSceneStore((s) => s.scenes);
  const viewedScene = useSceneStore((s) => s.scene);
  const data = creationDataOf(registry);
  const role = registry.roles.find((entry) => entry.id === draft.roleId);
  const owned = !isGm || ownerId !== '';
  // Naprawa 3a: the summary reads the sheet `creation:finish` is about to write
  // — rows, change and lifestyle — not a second description of the draft.
  const outcome = useMemo(
    () =>
      creationOutcome(
        draft,
        data,
        registry,
        (entryId: string) => entriesById[entryId],
        { weaponTypeById: new Map(Object.entries(weaponTypes)) },
        owned,
      ),
    [draft, data, registry, entriesById, weaponTypes, owned],
  );
  const { sheet } = outcome;
  const preview = creationPreview(sheet.stats);
  // Unset stats read as the minimum in `creationStats`; a „PW 20" computed from
  // them would look like a result, so the derived values wait for all ten.
  const statsSet = CPRED_STAT_IDS.every((id) => draft.stats[id] !== undefined);
  const derived = (value: number) => (statsSet ? value : '—');
  // A player only ever sees the scene the table is on; the GM has the list.
  const activeScene = isGm
    ? (scenes.find((scene) => scene.active) ?? null)
    : viewedScene
      ? { name: viewedScene.name }
      : null;

  return (
    <div className="creator-step creator-summary">
      <SummaryIssues issues={issues} onGoTo={onGoTo} />
      {/* The name lives in „Opis" — one field, one place. Here it is what the
          card will say, next to the face that goes with it. */}
      <p className="creator-summary-name">
        {draft.portraitUrl ? <img src={draft.portraitUrl} alt="" /> : null}
        <strong>{draft.name.trim() || 'Bez imienia'}</strong>
        <span className="creator-hint">
          {role?.name ?? 'Rola niewybrana'} · {CPRED_CREATION_METHOD_LABELS[draft.method]}
          {draft.portraitUrl ? '' : ' · bez portretu'}
        </span>
      </p>

      <dl className="creator-facts">
        <div>
          <dt>Właściciel</dt>
          <dd>
            {isGm ? (
              <select
                aria-label="Właściciel postaci"
                value={ownerId}
                onChange={(e) => onOwnerChange(e.target.value)}
              >
                <option value="">NPC (MG)</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            ) : (
              `Ty (${userName})`
            )}
          </dd>
        </div>
        <div>
          <dt>Żeton</dt>
          <dd>
            {!draft.placeToken
              ? 'Bez żetonu na mapie.'
              : activeScene
                ? `Stanie na aktywnej scenie „${activeScene.name}”.`
                : 'Brak aktywnej sceny — stanie sam, gdy MG ją włączy.'}
          </dd>
        </div>
        <div>
          <dt>Zdolność Specjalna</dt>
          <dd>{role ? `${role.ability} ${sheet.roleAbilityRank}` : '—'}</dd>
        </div>
      </dl>

      <section className="creator-summary-section" aria-label="Cechy i wartości pochodne">
        <h4>Cechy</h4>
        <dl className="creator-summary-stats">
          {CPRED_STAT_IDS.map((id) => (
            <div key={id} title={CPRED_STAT_LABELS[id].name}>
              <dt>{CPRED_STAT_LABELS[id].abbr}</dt>
              <dd>{draft.stats[id] ?? '—'}</dd>
            </div>
          ))}
        </dl>
        {statsSet ? null : (
          <p className="creator-hint">
            Wartości pochodne policzą się po ustaleniu wszystkich Cech.
          </p>
        )}
        <dl className="creator-derived">
          <div>
            <dt>Punkty Wytrzymałości</dt>
            <dd>{derived(preview.hpMax)}</dd>
          </div>
          <div>
            <dt>Poważnie Ranny</dt>
            <dd>{derived(preview.seriousWound)}</dd>
          </div>
          <div>
            <dt>Przeżywalność</dt>
            <dd>{derived(preview.deathSave)}</dd>
          </div>
          <div>
            <dt>Człowieczeństwo</dt>
            <dd>{derived(preview.humanity)}</dd>
          </div>
          <div>
            <dt>Szczęście</dt>
            <dd>{derived(sheet.luckCurrent)}</dd>
          </div>
        </dl>
      </section>

      <SummarySkills sheet={sheet} data={data} />

      <SummaryGear sheet={sheet} budget={outcome.budget} spent={outcome.spent} npc={!owned} />
      <CreatorNoStockWarning sheet={sheet} />

      <section className="creator-summary-section" aria-label="Po utworzeniu postaci">
        <h4>Po utworzeniu postaci</h4>
        <CreatorLeftOutside draft={draft} data={data} />
      </section>

      <CreatorRoleChores sheet={sheet} upcoming />

      <section className="creator-summary-section" aria-label="Ścieżka Życia">
        <h4>Ścieżka Życia</h4>
        <LifepathSummary draft={draft} />
      </section>
    </div>
  );
}

/** The skills exactly as the sheet will list them — free language included. */
function SummarySkills({ sheet, data }: { sheet: CpredCharacterData; data: CpredCreationData }) {
  const registry = useCharacterStore((s) => s.registry);
  const taken = registry.skills.filter((skill) => (sheet.skills[skill.id] ?? 0) > 0);
  return (
    <section className="creator-summary-section" aria-label="Umiejętności">
      <h4>Umiejętności ({taken.length})</h4>
      {taken.length === 0 ? (
        <p className="creator-hint">Żadnej.</p>
      ) : (
        <ul className="creator-summary-skills">
          {taken.map((skill) => (
            <li key={skill.id}>
              {cpredSkillLabel(skill, sheet)} <b>{sheet.skills[skill.id]}</b>
              {data.freeLanguage?.skillId === skill.id ? (
                <span className="creator-hint"> · darmowy język kultury</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The goods as rows of the sheet, then the money: what came in, what went out,
 * what stays on the card — and the rent that starts running (s. 105).
 */
function SummaryGear({
  sheet,
  budget,
  spent,
  npc,
}: {
  sheet: CpredCharacterData;
  budget: number;
  spent: number;
  npc: boolean;
}) {
  const empty =
    sheet.weapons.length + sheet.armor.length + sheet.gear.length === 0 && !sheet.cyberdeck;
  return (
    <section className="creator-summary-section" aria-label="Wyposażenie i pieniądze">
      <h4>Wyposażenie i pieniądze</h4>
      {empty ? (
        <p className="creator-hint">Nic kupionego — eurodolce zostają na karcie.</p>
      ) : (
        <ul className="creator-summary-gear">
          {sheet.weapons.map((row) => (
            <li key={row.id}>
              <span className="creator-summary-kind">Broń</span> {row.name}
              <span className="creator-hint">
                {` · OBR ${row.damage || '—'}`}
                {row.rof ? ` · LA ${row.rof}` : ''}
                {row.ammoMax > 0 ? ` · magazynek ${row.ammoMax}` : ''}
              </span>
            </li>
          ))}
          {sheet.armor.map((row) => (
            <li key={row.id}>
              <span className="creator-summary-kind">Pancerz</span> {row.name}
              <span className="creator-hint">
                {` · OB ${row.sp} · ${ARMOR_LOCATION_LABELS[row.location]}`}
              </span>
            </li>
          ))}
          {/* Etap 48b: dek z pakietu albo koszyka kreator podpina sam, a Programy
              wkłada do gniazd, ile wejdzie — w Wyposażeniu ich już nie ma. */}
          {sheet.cyberdeck ? (
            <li>
              <span className="creator-summary-kind">Cyberdek</span> {sheet.cyberdeck.name}
              <span className="creator-hint">
                {` · gniazda ${cyberdeckSlotsUsed(sheet.cyberdeck)} / ${sheet.cyberdeck.slots}`}
                {sheet.cyberdeck.installed.length > 0
                  ? ` · ${sheet.cyberdeck.installed.map((row) => row.name).join(', ')}`
                  : ''}
              </span>
            </li>
          ) : null}
          {sheet.gear.map((row) => (
            <li key={row.id}>
              <span className="creator-summary-kind">{row.ammo ? 'Amunicja' : 'Sprzęt'}</span>{' '}
              {row.name}
              {row.qty > 1 ? <span className="creator-hint">{` × ${row.qty}`}</span> : null}
            </li>
          ))}
        </ul>
      )}
      <dl className="creator-facts">
        <div>
          <dt>Na start</dt>
          <dd>{formatEddies(budget)} ed</dd>
        </div>
        <div>
          <dt>Wydane</dt>
          <dd>{formatEddies(spent)} ed</dd>
        </div>
        <div>
          <dt>Na karcie</dt>
          <dd>{formatEddies(sheet.eddies)} ed</dd>
        </div>
        <div>
          <dt>Poziom życia</dt>
          <dd>
            {sheet.lifestyle ? formatLifestyle(sheet.lifestyle) : npc ? 'NPC — bez rachunków' : '—'}
          </dd>
        </div>
      </dl>
      {sheet.lifestyle ? (
        <p className="creator-hint">
          Pierwszy miesiąc bez opłat (s. 105) — rozliczenie miesiąca uruchamia MG. Inne mieszkanie
          albo Poziom życia MG ustawia na karcie.
        </p>
      ) : null}
    </section>
  );
}

/**
 * „Po utworzeniu postaci" (naprawa 3a, przepisane 10.10) — the deliberate gaps
 * of 25c from one shared list, said as what comes next, so the gear step, the
 * summary and the last screen cannot say three different things. In the gear
 * step (`compact`) it sits small under the basket and skips the Role's chrome,
 * which the gratis list right above already names.
 */
function CreatorLeftOutside({
  draft,
  data,
  compact = false,
}: {
  draft: Pick<CpredCreationDraft, 'method' | 'roleId' | 'kitChoice'>;
  data: CpredCreationData;
  compact?: boolean;
}) {
  const entriesById = useCompendiumStore((s) => s.entries);
  const lines = creationLeftOutside(
    draft,
    creationRoleKit(draft, data, (entryId) => entriesById[entryId]),
  ).filter((line) => !compact || line.id !== 'kit');
  const list = (
    <ul className={`creator-outside-list${compact ? ' creator-hint' : ''}`}>
      {lines.map((line) => (
        <li key={line.id}>
          <strong>{line.title}.</strong> {line.text}
        </li>
      ))}
    </ul>
  );
  if (!compact) return list;
  return (
    <section className="creator-summary-section" aria-label="Po utworzeniu postaci">
      <h4>Po utworzeniu postaci</h4>
      {list}
    </section>
  );
}

/**
 * Czynności, które zostaną po kreatorze (naprawa 3c).
 *
 * Kreator ustawia rangę Zdolności Specjalnej na 4 i tam kończy: punktów Zmysłu
 * Walki nie rozdziela, zespołu Korpo nie obsadza, Taboru Nomady nie wybiera,
 * a Netrunner wychodzi bez wskazanego deku. Do 3c nie mówił o tym nic — MG
 * zgłosił w audycie (A10), że „Rola na randze 4" wygląda na skończoną
 * konfigurację.
 *
 * Sekcja stoi dwa razy: w podsumowaniu jako zapowiedź (`upcoming` — postaci
 * jeszcze nie ma, więc nie ma dokąd prowadzić) i na ekranie końcowym z
 * „Przejdź” do właściwego panelu karty. Liczy ją ta sama `cpredRoleChores`,
 * którą czyta karta i lista MG, z tej samej karty, którą zapisze serwer.
 */
function CreatorRoleChores({
  sheet,
  characterId,
  upcoming = false,
  waiting = false,
  onGo,
}: {
  sheet: CpredCharacterData;
  characterId?: string;
  upcoming?: boolean;
  /**
   * Karta czeka na „Przyjmij do gry” (#59, T8b): jest tylko do podglądu, więc
   * „Przejdź” prowadziło do wyłączonych przycisków bez słowa wyjaśnienia.
   */
  waiting?: boolean;
  onGo?: () => void;
}) {
  const registry = useCharacterStore((s) => s.registry);
  const chores = useMemo(() => cpredRoleChores(sheet, registry), [sheet, registry]);
  if (chores.length === 0) return null;

  return (
    <section className="creator-summary-section" aria-label="Co zostanie po kreatorze">
      <h4>{upcoming ? 'Co zostanie do zrobienia' : 'Co zostało do zrobienia'}</h4>
      <p className="creator-hint">
        {upcoming
          ? 'Kreator ustawia Zdolność Specjalną na poziom 4, ale jej wyborów za ciebie nie dokonuje. Te decyzje podejmiesz na karcie po utworzeniu postaci.'
          : waiting
            ? 'Te decyzje podejmiesz na karcie, gdy MG przyjmie postać do gry — do tego czasu karta jest tylko do podglądu.'
            : 'Te decyzje podejmuje się na karcie — nic nie przepada i nic nie blokuje gry.'}
      </p>
      <RoleChoresList chores={chores} characterId={waiting ? undefined : characterId} onGo={onGo} />
    </section>
  );
}

/** What the last screen needs once the draft is gone from the server. */
interface CreatorFinished {
  result: CreationFinishResult;
  draft: CpredCreationDraft;
}

/**
 * The wizard's last screen (naprawa 3a). The sheet is already open beside it;
 * this says where the token went — with the retry when it did not — and what
 * the character still lacks compared to the book, before the window closes.
 *
 * The approval and the figure are read **live** (#8, 26.09): the screen stays
 * open while the GM presses „Przyjmij do gry", and a promise frozen at
 * „Utwórz postać" kept saying „czeka na zatwierdzenie" after it had come.
 */
function CreatorFinishedScreen({
  finished,
  busy,
  onRetryToken,
  onOpenSheet,
  onGo,
  onClose,
}: {
  finished: CreatorFinished;
  busy: boolean;
  onRetryToken: () => void;
  onOpenSheet: () => void;
  /** After „Przejdź" to a panel of the card — the wizard steps aside. */
  onGo: () => void;
  onClose: () => void;
}) {
  const registry = useCharacterStore((s) => s.registry);
  const data = creationDataOf(registry);
  const { result, draft } = finished;
  const sheet = result.data as CpredCharacterData;
  const playReady = useCharacterStore(
    (s) => s.characters[result.id]?.playReady ?? result.playReady,
  );
  // The player always stands on the active scene, so a figure placed there
  // reaches this store — the server sends it before the approved sheet.
  const standing = useTokenStore((s) =>
    Object.values(s.tokens).some((token) => token.characterId === result.id),
  );
  const tokenStatus = standing ? 'placed' : result.tokenStatus;
  // #9: a figure owed without an active scene walks on at the next activation.
  const retry = tokenStatus === 'failed';

  return (
    <div className="sheet-body creator-body">
      <div className="creator-step creator-finished">
        <p className="creator-notice creator-notice--done" role="status">
          Postać „{result.name}” utworzona — karta, eurodolce i zakupy są zapisane, a karta jest
          otwarta obok.
          {!playReady
            ? ' Teraz czeka na zatwierdzenie MG: do tego czasu karta jest tylko do podglądu.'
            : !result.playReady
              ? ' MG przyjął ją do gry — karta jest już w pełni twoja.'
              : null}
        </p>

        <dl className="creator-facts">
          <div>
            <dt>Żeton</dt>
            <dd>
              {tokenStatus === 'placed'
                ? 'Stoi na aktywnej scenie.'
                : tokenStatus === 'awaiting-gm'
                  ? playReady
                    ? 'Nie stoi: nie ma aktywnej sceny — stanie sam, gdy MG ją włączy.'
                    : 'Stanie na aktywnej scenie, gdy MG przyjmie postać do gry.'
                  : tokenStatus === 'not-requested'
                    ? 'Nie stawiano — tak wybrano w kroku „Opis”.'
                    : tokenStatus === 'no-scene'
                      ? 'Nie stoi: nie ma aktywnej sceny — stanie sam, gdy MG ją włączy.'
                      : 'Nie udało się potwierdzić postawienia.'}
            </dd>
          </div>
          <div>
            <dt>Na karcie</dt>
            <dd>{formatEddies(sheet.eddies)} ed</dd>
          </div>
          <div>
            <dt>Poziom życia</dt>
            <dd>{sheet.lifestyle ? formatLifestyle(sheet.lifestyle) : 'NPC — bez rachunków'}</dd>
          </div>
        </dl>
        {retry ? (
          <div className="creator-notice creator-notice--warn" role="alert">
            <p>
              Ponowienie nie utworzy drugiej karty. Po zamknięciu kreatora żeton postawi już tylko
              MG (⊕ przy postaci w zakładce „Postacie”).
            </p>
            <button type="button" className="small-button" disabled={busy} onClick={onRetryToken}>
              Ponów postawienie żetonu
            </button>
          </div>
        ) : null}

        <section className="creator-summary-section" aria-label="Co jeszcze dojdzie">
          <h4>Co jeszcze dojdzie</h4>
          <CreatorLeftOutside draft={draft} data={data} />
        </section>

        <CreatorRoleChores sheet={sheet} characterId={result.id} waiting={!playReady} onGo={onGo} />

        <div className="creator-finished-actions">
          <button type="button" className="small-button" onClick={onOpenSheet}>
            Pokaż kartę
          </button>
          <button type="button" className="small-button small-button--primary" onClick={onClose}>
            Zamknij kreator
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * What still stands between the draft and „Utwórz postać", grouped by the step
 * that fixes it — the same list the server refuses with, each line one click
 * away from its field. Ten unset stats read as one line, not ten.
 */
function SummaryIssues({
  issues,
  onGoTo,
}: {
  issues: CpredValidationIssue[];
  onGoTo: (field: string) => void;
}) {
  if (issues.length === 0) {
    return (
      <p className="creator-notice creator-notice--done" role="status">
        Wszystkie wymagania kreatora spełnione — możesz utworzyć postać.
      </p>
    );
  }
  return (
    <section className="creator-issues" aria-label="Braki do uzupełnienia">
      <h4>Zanim utworzysz postać</h4>
      {CPRED_CREATION_STEPS.map((step) => {
        const lines = issues.filter((issue) => creationIssueStep(issue.field) === step);
        if (lines.length === 0) return null;
        return (
          <div key={step} className="creator-issues-group">
            <h5>{CPRED_CREATION_STEP_LABELS[step]}</h5>
            <ul>
              {lines.map((line) => (
                <li key={`${line.field}:${line.message}`}>
                  <span>{line.message}</span>
                  <button
                    type="button"
                    className="small-button"
                    onClick={() => onGoTo(line.field)}
                    aria-label={`Przejdź do pola: ${line.message}`}
                  >
                    Przejdź
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

/** Folds „Cecha X nie została ustalona" ×N into one line naming the stats. */
function summaryLines(issues: CpredValidationIssue[]): CpredValidationIssue[] {
  return groupBasicSkills(groupUnsetStats(issues));
}

function groupUnsetStats(issues: CpredValidationIssue[]): CpredValidationIssue[] {
  const unset = issues.filter(
    (issue) => issue.field.startsWith('stats.') && issue.message.includes('nie została ustalona'),
  );
  if (unset.length < 2) return issues;
  const names = unset
    .map((issue) => CPRED_STAT_LABELS[issue.field.slice('stats.'.length) as CpredStatId]?.abbr)
    .filter(Boolean)
    .join(', ');
  return [
    { field: unset[0]!.field, message: `Nieustalone Cechy (${unset.length}): ${names}.` },
    ...issues.filter((issue) => !unset.includes(issue)),
  ];
}

const BASIC_SKILL_ISSUE = /^Umiejętność podstawowa (.+) musi być co najmniej na poziomie (\d+)\.$/;

/**
 * #71 (T8b): przed wyborem Roli każda umiejętność podstawowa była osobnym
 * brakiem, więc licznik pokazywał 17, a po Roli (szablon wpisuje podstawowe)
 * spadał do 4. Jedna linia, jak przy Cechach — liczy się sprawa, nie pole.
 */
function groupBasicSkills(issues: CpredValidationIssue[]): CpredValidationIssue[] {
  const low = issues.filter((issue) => BASIC_SKILL_ISSUE.test(issue.message));
  if (low.length < 2) return issues;
  const names = low.map((issue) => BASIC_SKILL_ISSUE.exec(issue.message)![1]).join(', ');
  const min = BASIC_SKILL_ISSUE.exec(low[0]!.message)![2];
  const line = {
    field: low[0]!.field,
    message: `Umiejętności podstawowe poniżej poziomu ${min} (${low.length}): ${names}.`,
  };
  return issues.flatMap((issue) =>
    issue === low[0] ? [line] : low.includes(issue) ? [] : [issue],
  );
}

/** What the Lifepath step collected, in one paragraph. */
function LifepathSummary({ draft }: { draft: CpredCreationDraft }) {
  const { lifepath } = draft;
  const said = [
    lifepath.culture && `pochodzenie: ${lifepath.culture}`,
    lifepath.personality && `charakter: ${lifepath.personality}`,
    lifepath.familyBackground && `rodzina: ${lifepath.familyBackground}`,
    lifepath.lifeGoal && `cel: ${lifepath.lifeGoal}`,
  ].filter(Boolean);
  const people = [
    lifepath.friends.length > 0 && `przyjaciele: ${lifepath.friends.length}`,
    lifepath.enemies.length > 0 && `wrogowie: ${lifepath.enemies.length}`,
    lifepath.tragicLoves.length > 0 && `miłości: ${lifepath.tragicLoves.length}`,
  ].filter(Boolean);

  return (
    <p className="creator-hint">
      {said.length === 0 && people.length === 0
        ? 'Pusta — można ją wypełnić teraz albo później na karcie.'
        : [...said, ...people].join(' · ')}
      {lifepath.roleAnswers.length > 0 && ` · Rola: ${lifepath.roleAnswers.length} odpowiedzi`}
    </p>
  );
}

/**
 * Wyposażenie Roli gratis Kompletnego Pakietu (etap 47a): stałe rzeczy Roli
 * i — u Solo — broń do wyboru. Na kartę trafia przy „Utwórz postać”, bez
 * wiersza w historii eurodolców; chrom wszczepia potem MG.
 */
function CreatorRoleKit({ draft, data }: { draft: CpredCreationDraft; data: CpredCreationData }) {
  const patch = useCreationStore((s) => s.patch);
  const busy = useCreationStore((s) => s.busy);
  const entriesById = useCompendiumStore((s) => s.entries);
  const lookup = (entryId: string) => entriesById[entryId];
  const choices = creationRoleKitChoices(draft, data, lookup);
  const lines = creationRoleKit(draft, data, lookup).filter(
    (line) => line.entryId !== draft.kitChoice,
  );
  if (lines.length === 0 && choices.length === 0) return null;
  const value = (amount: number | null) => (amount === null ? '—' : `${formatEddies(amount)} ed`);
  return (
    <section
      className="creator-summary-section creator-kit"
      aria-label="Wyposażenie Roli gratis"
      data-creation-field="kitChoice"
    >
      <h4>Wyposażenie Roli — gratis</h4>
      <p className="creator-hint">
        Kompletny Pakiet dostaje podstawowe narzędzie Roli za darmo; gotówka zostaje na resztę.
      </p>
      {lines.length > 0 ? (
        <ul className="creator-basket">
          {lines.map((line) => (
            <li key={line.entryId}>
              <span className="creator-basket-name">
                {line.name}
                {line.onSheet ? null : (
                  <span className="creator-hint"> — chrom, wszczepia MG po utworzeniu</span>
                )}
              </span>
              <span className="creator-basket-price">{value(line.value)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {choices.length > 0 ? (
        <label className="bot-field">
          Do wyboru (jedna rzecz)
          <select
            value={draft.kitChoice ?? ''}
            disabled={busy}
            onChange={(event) => void patch({ kitChoice: event.target.value || null })}
          >
            <option value="">— wybierz —</option>
            {choices.map((line) => (
              <option key={line.entryId} value={line.entryId}>
                {line.name} ({value(line.value)})
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </section>
  );
}
