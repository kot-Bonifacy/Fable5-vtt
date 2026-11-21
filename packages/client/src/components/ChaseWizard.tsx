import { useEffect, useState } from 'react';
import { CHASE_DIRECTION_LABELS, chaseRoadByUrl, cpredSpeedMph } from '@vtt/shared';
import { plural } from '../plural.js';
import { updateScene } from '../socket.js';
import { useChaseStore } from '../stores/chaseStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { useWindowPlacement } from '../window-placement.js';
import {
  useFrameBesideWindow,
  ChaseDriveSection,
  ChaseGridSection,
  ChaseRoadPicker,
  ChaseRoadSection,
  ChaseVehiclesSection,
  sceneLanes,
} from './ChaseSetup.js';
import { WindowResizeGrip } from './WindowResizeGrip.js';
import { ChasePlanEditor } from './ChasePlanEditor.js';

/**
 * Kreator sceny pościgu (zlecenie MG z 03.11, wzór: kreatory scen z Foundry
 * i Owlbeara). „Utwórz → Pościg” w panelu scen otwiera go zamiast Edycji sceny
 * i prowadzi przez cztery kroki: **Tło** (wbudowana droga albo własna mapa),
 * **Droga** (pas jezdni przeciągany na mapie, liczba pasów, kierunek, goni /
 * ucieka, prędkość startowa — od 72f1 zamiast tempa), **Auta** (drużyna
 * i wrogowie na wolnych miejscach jezdni, zamiar auta NPC-a), **Plan**
 * (od 72f3, opcjonalny: plan rund — posiłki, przeszkody, Manewry, notatki)
 * i **Gotowe**.
 *
 * Kroki Tło i Droga piszą do szkicu sceny, jak Edycja — mapa pokazuje wybór na
 * żywo. Przejście z „Droga” do „Auta” zapisuje szkic, bo auta stawia serwer
 * w zapisanym pasie. Zamknięcie okna zapisuje to, co już wybrano: MG, który
 * przerwał w połowie, nie traci drogi.
 */

type Step = 'background' | 'road' | 'cars' | 'plan' | 'done';

const STEPS: { id: Step; label: string }[] = [
  { id: 'background', label: 'Tło' },
  { id: 'road', label: 'Droga' },
  { id: 'cars', label: 'Auta' },
  { id: 'plan', label: 'Plan' },
  { id: 'done', label: 'Gotowe' },
];

export function ChaseWizard() {
  const open = useSceneStore((s) => s.chaseWizardOpen);
  if (!open) return null;
  return <ChaseWizardBody />;
}

function ChaseWizardBody() {
  const scene = useSceneStore((s) => s.effectiveScene);
  const draft = useSceneStore((s) => s.draft);
  const setDraft = useSceneStore((s) => s.setDraft);
  const setScene = useSceneStore((s) => s.setScene);
  const setOpen = useSceneStore((s) => s.setChaseWizardOpen);
  const setEditorOpen = useSceneStore((s) => s.setEditorOpen);
  const setBandEdit = useSceneStore((s) => s.setChaseBandEdit);
  const carsOnRoad = useChaseStore((s) => s.vehicles.length);
  const planRows = useChaseStore((s) => s.plan.length);
  const [step, setStep] = useState<Step>('background');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placement = useWindowPlacement('chase-wizard', () => {
    const map = document.querySelector('.map-area')?.getBoundingClientRect();
    const right = map ? map.right : window.innerWidth;
    return {
      x: Math.max(12, Math.round(right - Math.min(440, window.innerWidth - 24) - 12)),
      y: Math.round((map?.top ?? 56) + 56),
    };
  });

  // Uchwyty pasa na mapie tylko w kroku „Droga”; zamknięcie okna je gasi.
  useEffect(() => {
    setBandEdit(step === 'road');
  }, [step, setBandEdit]);
  useEffect(() => () => setBandEdit(false), [setBandEdit]);

  // Nowa droga albo krok „Auta”: cała scena w kadrze obok okna kreatora.
  useFrameBesideWindow(placement.ref, scene?.background?.url ?? null, step);

  // Scena zniknęła albo przestała być pościgiem — kreator nie ma czego ustawiać.
  useEffect(() => {
    if (!scene || scene.kind !== 'chase') setOpen(false);
  }, [scene, setOpen]);

  if (!scene || scene.kind !== 'chase') return null;
  const index = STEPS.findIndex((entry) => entry.id === step);
  const builtIn = chaseRoadByUrl(scene.background?.url);

  async function persist(): Promise<boolean> {
    if (!scene || !draft) return true;
    setSaving(true);
    setError(null);
    const ack = await updateScene(scene.id, draft);
    setSaving(false);
    if (ack.ok && ack.data) {
      setScene(ack.data);
      setDraft(null);
      return true;
    }
    setError('Nie udało się zapisać sceny.');
    return false;
  }

  async function go(next: Step) {
    // Auta stawia serwer w zapisanym pasie, więc przed nimi szkic idzie na serwer.
    if (STEPS.findIndex((entry) => entry.id === next) >= 2 && !(await persist())) return;
    setStep(next);
  }

  async function close() {
    if (!(await persist())) return;
    setOpen(false);
  }

  async function openEditor() {
    if (!(await persist())) return;
    setOpen(false);
    setEditorOpen(true);
  }

  const canLeaveBackground = scene.background !== null;
  const roadText = scene.chase.road
    ? `wiersze ${scene.chase.road.from}–${scene.chase.road.to}`
    : 'cała szerokość sceny';

  return (
    <section
      ref={placement.ref}
      className="settings-window scene-config-window chase-wizard"
      style={placement.style}
      aria-label="Kreator pościgu"
      data-owns-keys
    >
      <div className="settings-window-header" {...placement.dragProps}>
        <h2 className="settings-window-title scene-config-title">Kreator pościgu: {scene.name}</h2>
        <button
          type="button"
          className="sheet-close"
          onClick={() => void close()}
          title="Zamknij kreator — wybrane ustawienia zostają zapisane"
          aria-label="Zamknij kreator pościgu"
        >
          ✕
        </button>
      </div>

      <ol className="chase-wizard-steps" aria-label="Kroki kreatora">
        {STEPS.map((entry, at) => (
          <li
            key={entry.id}
            className={`chase-wizard-step${at === index ? ' is-current' : ''}${at < index ? ' is-done' : ''}`}
            aria-current={at === index ? 'step' : undefined}
          >
            <span className="chase-wizard-step-no">{at < index ? '✓' : at + 1}</span>
            {entry.label}
          </li>
        ))}
      </ol>

      <div className="settings-window-body">
        {step === 'background' && (
          <section className="settings-group">
            <h3 className="settings-group-title">Po jakiej drodze jedzie pościg?</h3>
            <ChaseRoadPicker scene={scene} />
          </section>
        )}

        {step === 'road' && (
          <>
            <ChaseRoadSection scene={scene} />
            <ChaseDriveSection scene={scene} />
            <ChaseGridSection scene={scene} />
          </>
        )}

        {step === 'cars' && <ChaseVehiclesSection />}

        {step === 'plan' && (
          <section className="settings-group">
            <h3 className="settings-group-title">Plan rund (opcjonalnie)</h3>
            <p className="settings-hint">
              Co ma się stać w której rundzie: posiłki z rezerwy, przeszkoda, wezwanie do Manewru
              albo przypomnienie. Na początku rundy serwer zapyta cię o to w panelu decyzji — gracze
              nic nie widzą, a bez twojego „Wypuść” nic się nie stanie.
            </p>
            <ChasePlanEditor scene={scene} round={null} />
          </section>
        )}

        {step === 'done' && (
          <section className="settings-group">
            <h3 className="settings-group-title">Scena gotowa</h3>
            <dl className="chase-wizard-summary">
              <dt>Droga</dt>
              <dd>{builtIn ? builtIn.label : 'własna mapa'}</dd>
              <dt>Kierunek</dt>
              <dd>{CHASE_DIRECTION_LABELS[scene.chase.direction]}</dd>
              <dt>Pas jezdni</dt>
              <dd>
                {roadText} · {plural(sceneLanes(scene), 'pas', 'pasy', 'pasów')}
              </dd>
              <dt>Drużyna</dt>
              <dd>{scene.chase.role === 'flee' ? 'ucieka' : 'goni'}</dd>
              <dt>Prędkość startowa</dt>
              <dd>
                {cpredSpeedMph(scene.chase.tempo)} mil/h ·{' '}
                {scene.chase.running ? 'droga jedzie' : 'droga stoi'}
              </dd>
              <dt>Auta na drodze</dt>
              <dd>{carsOnRoad}</dd>
              <dt>Plan rund</dt>
              <dd>
                {planRows > 0 ? plural(planRows, 'zdarzenie', 'zdarzenia', 'zdarzeń') : 'brak'}
              </dd>
            </dl>
            <p className="settings-hint">
              Graczom pokażesz scenę przyciskiem aktywacji na liście scen. W walce prowadzisz pościg
              z okna „Pościg” (prędkościomierz na pasku narzędzi): prędkości, posiłki, przeszkody i
              plan rund. Drogę i auta poprawisz później w Edycji sceny → zakładka „Pościg”.
            </p>
          </section>
        )}
      </div>

      <div className="scene-config-footer">
        {error && <p className="auth-error">{error}</p>}
        {index > 0 && (
          <button
            type="button"
            className="small-button"
            disabled={saving}
            onClick={() => setStep(STEPS[index - 1]!.id)}
          >
            ← Wstecz
          </button>
        )}
        {step === 'done' ? (
          <>
            <button
              type="button"
              className="primary-button"
              disabled={saving}
              onClick={() => void close()}
            >
              Zakończ
            </button>
            <button
              type="button"
              className="small-button"
              disabled={saving}
              onClick={() => void openEditor()}
            >
              Pełna edycja sceny…
            </button>
          </>
        ) : (
          <button
            type="button"
            className="primary-button"
            disabled={saving || (step === 'background' && !canLeaveBackground)}
            title={
              step === 'background' && !canLeaveBackground
                ? 'Najpierw wybierz drogę albo wgraj własną mapę'
                : undefined
            }
            onClick={() => void go(STEPS[index + 1]!.id)}
          >
            {saving ? 'Zapisywanie…' : 'Dalej →'}
          </button>
        )}
      </div>
      <WindowResizeGrip resizeProps={placement.resizeProps} />
    </section>
  );
}
