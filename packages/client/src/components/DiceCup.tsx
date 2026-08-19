import { useEffect, useMemo, useRef, useState } from 'react';
import type { RollGesture, RollToss } from '@vtt/shared';
import { MAX_GESTURE_STRENGTH, formatRollNotation, parseChatInput } from '@vtt/shared';
import { playFunRoll, sweepDice } from '../dice3d.js';
import {
  sendAttackEvade,
  sendAttackSmart,
  sendAttackRoll,
  sendCharacterRoll,
  sendChatInput,
  sendFacedownAttempt,
  sendFacedownResist,
  sendGrappleAttempt,
  sendGrappleResist,
  sendInitiativeRoll,
} from '../socket.js';
import { useChatStore } from '../stores/chatStore.js';
import { useSettingsStore } from '../stores/settingsStore.js';
import { rollCreationWithGesture } from '../stores/creationStore.js';
import {
  useRollStore,
  type PendingAttack,
  type PendingCreation,
  type PendingEvasion,
  type PendingFacedown,
  type PendingGrapple,
  type PendingInitiative,
  type PendingRoll,
} from '../stores/rollStore.js';

interface ShakeSample {
  x: number;
  y: number;
  t: number;
}

/** Last real formula thrown — reused for fun rolls; CP RED check by default. */
let lastFunNotation = '1d10';

const RATTLE_SOUNDS = [3, 5, 7, 9, 11].map((n) => `/dice/sounds/dicehit/dicehit_metal${n}.mp3`);
const RATTLE_MIN_GAP_MS = 90;
const RATTLE_MIN_TRAVEL_PX = 45;
const MAX_SAMPLES = 512;
/** How far back into the shake the release direction looks. */
const TOSS_WINDOW_MS = 120;
/** Below this travel the release has no readable direction — random throw. */
const TOSS_MIN_TRAVEL_PX = 8;

/** Shake speed (px/ms) → toss strength 0–3. */
function strengthFromSpeed(speed: number): number {
  if (speed >= 1.5) return 3;
  if (speed >= 0.8) return 2;
  if (speed >= 0.3) return 1;
  return 0;
}

/** SHA-256 digest of the shake samples (hex). Falls back to FNV-1a. */
async function digestSamples(samples: ShakeSample[]): Promise<string> {
  const data = new Float64Array(samples.length * 3);
  samples.forEach((s, i) => {
    data[i * 3] = s.x;
    data[i * 3 + 1] = s.y;
    data[i * 3 + 2] = s.t;
  });
  try {
    const hash = await crypto.subtle.digest('SHA-256', data.buffer);
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    let h = 0x811c9dc5;
    for (const byte of new Uint8Array(data.buffer)) {
      h = Math.imul(h ^ byte, 0x01000193) >>> 0;
    }
    return h.toString(16);
  }
}

/**
 * Release direction + point from the tail of the shake: the throw continues
 * the hand's last motion. A hand that is (nearly) still at release tips the
 * cup over in a random direction — the dice still pour out at the cursor.
 */
function tossFromRecent(recent: ShakeSample[], now: number): RollToss | undefined {
  const last = recent[recent.length - 1];
  if (!last) return undefined;
  const windowStart = now - TOSS_WINDOW_MS;
  let start = last;
  for (let i = recent.length - 2; i >= 0; i--) {
    if (recent[i]!.t < windowStart) break;
    start = recent[i]!;
  }
  const dx = last.x - start.x;
  const dy = last.y - start.y;
  const travel = Math.hypot(dx, dy);
  const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);
  const originX = clamp01(last.x / window.innerWidth);
  const originY = clamp01(last.y / window.innerHeight);
  if (travel < TOSS_MIN_TRAVEL_PX || last.t < windowStart) {
    const angle = Math.random() * 2 * Math.PI;
    return { dirX: Math.cos(angle), dirY: Math.sin(angle), originX, originY };
  }
  return { dirX: dx / travel, dirY: dy / travel, originX, originY };
}

/**
 * Shake speed (px/ms) over the tail of the gesture — what the hand was doing
 * AT the moment of release, not averaged over the whole shake. Idle time
 * counts as slowdown, so shaking hard, stopping and letting go throws gently.
 */
function tailSpeed(recent: ShakeSample[], now: number): number {
  const tail = recent.filter((s) => s.t >= now - TOSS_WINDOW_MS);
  if (tail.length < 2) return 0;
  let path = 0;
  for (let i = 1; i < tail.length; i++) {
    path += Math.hypot(tail[i]!.x - tail[i - 1]!.x, tail[i]!.y - tail[i - 1]!.y);
  }
  return path / (now - tail[0]!.t);
}

/**
 * `energy` (0–1) is how hard the hand is shaking; the user's cup slider
 * (0–100, stage 27d) scales the whole thing, and zero silences it outright.
 */
function playRattle(energy: number): void {
  const setting = useSettingsStore.getState().cupVolume / 100;
  if (setting <= 0) return;
  const src = RATTLE_SOUNDS[Math.floor(Math.random() * RATTLE_SOUNDS.length)]!;
  const audio = new Audio(src);
  audio.volume = Math.min(0.12 + energy * 0.25, 0.5) * setting;
  void audio.play().catch(() => undefined);
}

type CupMode =
  | { kind: 'fun' }
  | { kind: 'roll'; visibility: 'public' | 'gm'; notation: string }
  | { kind: 'sheet'; pending: PendingRoll }
  | { kind: 'initiative'; pending: PendingInitiative }
  | { kind: 'attack'; pending: PendingAttack }
  | { kind: 'evasion'; pending: PendingEvasion }
  | { kind: 'grapple'; pending: PendingGrapple }
  | { kind: 'facedown'; pending: PendingFacedown }
  | { kind: 'creation'; pending: PendingCreation };

/** Cup label for a loaded sheet check, e.g. `Percepcja (INT) +11`. */
function sheetLabel(pending: PendingRoll): string {
  // Damage rolls and Death Saves carry no running modifier — their title
  // already says everything („Zgrzyt-9 — obrażenia (Głowa)").
  if (pending.kind === 'damage' || pending.kind === 'deathSave') return pending.title;
  // Stabilizing names its target, not its modifier — the PT is the server's.
  if (pending.kind === 'stabilize') return pending.title;
  const sign = pending.modifierTotal < 0 ? '−' : '+';
  return `${pending.title} ${sign}${Math.abs(pending.modifierTotal)}`;
}

/** Cup label for a loaded initiative roll, e.g. `Inicjatywa +8`. */
function initiativeLabel(pending: PendingInitiative): string {
  const sign = pending.modifierTotal < 0 ? '−' : '+';
  return `Inicjatywa ${sign}${Math.abs(pending.modifierTotal)}`;
}

/**
 * The dice cup: always available on the table. Grab it, shake, release to
 * throw. The throw is REAL when a sheet check is loaded (clicked on a
 * character sheet) or the chat draft holds a roll command — the shake's
 * entropy is mixed into the server's RNG (the gesture genuinely influences
 * the outcome; the server stays authoritative). Otherwise the throw is a
 * local toy roll with no game meaning.
 */
export function DiceCup() {
  const draft = useChatStore((s) => s.draft);
  const synced = useChatStore((s) => s.synced);
  const campaign = useChatStore((s) => s.campaign);
  const pending = useRollStore((s) => s.pending);
  const initiative = useRollStore((s) => s.initiative);
  const attack = useRollStore((s) => s.attack);
  const evasion = useRollStore((s) => s.evasion);
  const grapple = useRollStore((s) => s.grapple);
  const facedown = useRollStore((s) => s.facedown);
  const creation = useRollStore((s) => s.creation);

  const [shaking, setShaking] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const cupRef = useRef<HTMLDivElement | null>(null);
  const samplesRef = useRef<ShakeSample[]>([]);
  /** Tail of the shake (uncapped, trimmed to the toss window) — throw direction. */
  const recentRef = useRef<ShakeSample[]>([]);
  const rattleRef = useRef({ lastAt: 0, travel: 0, lastX: 0, lastY: 0 });
  /** 0–1 wobble amplitude fed by motion, decaying when the cursor stops. */
  const energyRef = useRef(0);
  const modeRef = useRef<CupMode>({ kind: 'fun' });

  const mode = useMemo<CupMode>(() => {
    // A check loaded from a sheet wins over whatever sits in the chat draft.
    if (pending) return { kind: 'sheet', pending };
    if (initiative) return { kind: 'initiative', pending: initiative };
    if (attack) return { kind: 'attack', pending: attack };
    if (evasion) return { kind: 'evasion', pending: evasion };
    if (grapple) return { kind: 'grapple', pending: grapple };
    if (facedown) return { kind: 'facedown', pending: facedown };
    if (creation) return { kind: 'creation', pending: creation };
    const parsed = parseChatInput(draft);
    if (parsed.kind === 'roll') {
      return {
        kind: 'roll',
        visibility: parsed.visibility,
        notation: formatRollNotation(parsed.formula),
      };
    }
    return { kind: 'fun' };
  }, [draft, pending, initiative, attack, evasion, grapple, facedown, creation]);
  modeRef.current = mode;

  // Esc puts a loaded check back on the shelf (as long as we are not mid-shake).
  useEffect(() => {
    if (
      (!pending && !initiative && !attack && !evasion && !grapple && !facedown && !creation) ||
      shaking
    )
      return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useRollStore.getState().clearCup();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, initiative, attack, evasion, grapple, facedown, creation, shaking]);

  useEffect(() => {
    if (!shaking) return;

    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      const samples = samplesRef.current;
      if (samples.length < MAX_SAMPLES) {
        samples.push({ x: e.clientX, y: e.clientY, t: now });
      }
      const recent = recentRef.current;
      const prev = recent[recent.length - 1];
      recent.push({ x: e.clientX, y: e.clientY, t: now });
      while (recent.length > 2 && now - recent[1]!.t >= TOSS_WINDOW_MS) recent.shift();
      if (prev && now > prev.t) {
        const v = Math.hypot(e.clientX - prev.x, e.clientY - prev.y) / (now - prev.t);
        energyRef.current = Math.max(energyRef.current, Math.min(v / 1.5, 1));
      }
      setPos({ x: e.clientX, y: e.clientY });

      const r = rattleRef.current;
      r.travel += Math.hypot(e.clientX - r.lastX, e.clientY - r.lastY);
      r.lastX = e.clientX;
      r.lastY = e.clientY;
      if (r.travel >= RATTLE_MIN_TRAVEL_PX && now - r.lastAt >= RATTLE_MIN_GAP_MS) {
        playRattle(Math.min(r.travel / 200, 1));
        r.lastAt = now;
        r.travel = 0;
      }
    };

    const throwDice = () => {
      setShaking(false);
      setPos(null);
      const samples = samplesRef.current;
      samplesRef.current = [];
      const recent = recentRef.current;
      recentRef.current = [];
      const now = performance.now();
      const strength = Math.min(strengthFromSpeed(tailSpeed(recent, now)), MAX_GESTURE_STRENGTH);
      const toss = tossFromRecent(recent, now);

      const current = modeRef.current;
      if (current.kind === 'sheet') {
        const { pending: loaded } = current;
        lastFunNotation = '1d10';
        useRollStore.getState().clearCup();
        void digestSamples(samples).then((entropy) => {
          const gesture: RollGesture = { entropy, strength, toss };
          sendCharacterRoll(loaded.characterId, loaded.request, loaded.visibility, gesture);
        });
      } else if (current.kind === 'initiative') {
        const { pending: loaded } = current;
        lastFunNotation = '1d10';
        useRollStore.getState().clearCup();
        void digestSamples(samples).then((entropy) => {
          sendInitiativeRoll(loaded.combatantId, { entropy, strength, toss });
        });
      } else if (current.kind === 'attack') {
        const { pending: loaded } = current;
        lastFunNotation = '1d10';
        useRollStore.getState().clearCup();
        void digestSamples(samples).then((entropy) => {
          sendAttackRoll(
            loaded.characterId,
            {
              ...(loaded.targetTokenId ? { tokenId: loaded.targetTokenId } : {}),
              ...(loaded.targetCoverId !== undefined ? { coverId: loaded.targetCoverId } : {}),
              ...(loaded.targetPoint ? { point: loaded.targetPoint } : {}),
            },
            loaded.request,
            loaded.attackerTokenId,
            {
              entropy,
              strength,
              toss,
            },
          );
        });
      } else if (current.kind === 'evasion') {
        const { pending: loaded } = current;
        lastFunNotation = '1d10';
        useRollStore.getState().clearCup();
        void digestSamples(samples).then((entropy) => {
          // Stage 16h: the same gesture, the opposite side of the table. A
          // smart round is corrected by whoever fired it, so it goes to its own
          // event — which leaves the defender's dodge unspent.
          if (loaded.kind === 'smart') {
            sendAttackSmart(loaded.messageId, loaded.characterId, { entropy, strength, toss });
            return;
          }
          sendAttackEvade(
            loaded.messageId,
            loaded.characterId,
            { entropy, strength, toss },
            loaded.tokenId,
          );
        });
      } else if (current.kind === 'grapple') {
        const { pending: loaded } = current;
        lastFunNotation = '1d10';
        useRollStore.getState().clearCup();
        void digestSamples(samples).then((entropy) => {
          const gesture: RollGesture = { entropy, strength, toss };
          // The same roll either way — only the address differs (stage 14d).
          if (loaded.resist) {
            sendGrappleResist(loaded.resist.messageId, loaded.characterId, gesture);
          } else if (loaded.attempt) {
            sendGrappleAttempt(
              loaded.characterId,
              loaded.attempt.targetTokenId,
              loaded.attempt.intent,
              loaded.attempt.attackerTokenId,
              gesture,
            );
          }
        });
      } else if (current.kind === 'facedown') {
        const { pending: loaded } = current;
        lastFunNotation = '1d10';
        useRollStore.getState().clearCup();
        void digestSamples(samples).then((entropy) => {
          const gesture: RollGesture = { entropy, strength, toss };
          // One roll, two addresses (stage 23c) — the same shape the grapple
          // slot above uses, and for the same reason.
          if (loaded.resist) {
            sendFacedownResist(loaded.resist.messageId, loaded.characterId, gesture);
          } else if (loaded.attempt) {
            sendFacedownAttempt(
              loaded.characterId,
              loaded.attempt.targetTokenId,
              loaded.attempt.challengerTokenId,
              gesture,
            );
          }
        });
      } else if (current.kind === 'creation') {
        lastFunNotation = '10k10';
        useRollStore.getState().clearCup();
        void digestSamples(samples).then((entropy) => {
          // The creator holds the draft, so it takes the answer; the cup's job
          // ends with the gesture (stage 25a).
          void rollCreationWithGesture({ entropy, strength, toss });
        });
      } else if (current.kind === 'roll') {
        lastFunNotation = current.notation;
        void digestSamples(samples).then((entropy) => {
          const gesture: RollGesture = { entropy, strength, toss };
          sendChatInput(useChatStore.getState().draft, gesture);
          useChatStore.getState().setDraft('');
        });
      } else {
        void playFunRoll(lastFunNotation, strength, toss);
      }
    };

    const onCancel = () => {
      setShaking(false);
      setPos(null);
      samplesRef.current = [];
      recentRef.current = [];
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };

    // Wobble amplitude follows the hand: impulses from pointer moves decay
    // exponentially, so a stopped cursor means a still cup within ~0.5 s.
    let raf = 0;
    let lastFrame = performance.now();
    const animateRattle = (t: number) => {
      energyRef.current *= Math.exp(-(t - lastFrame) / 180);
      lastFrame = t;
      if (energyRef.current < 0.02) energyRef.current = 0;
      cupRef.current?.style.setProperty('--rattle', (energyRef.current * 9).toFixed(2));
      raf = requestAnimationFrame(animateRattle);
    };
    raf = requestAnimationFrame(animateRattle);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', throwDice);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      cupRef.current?.style.removeProperty('--rattle');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', throwDice);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
    };
  }, [shaking]);

  if (!synced || !campaign) return null;

  const startShake = (e: React.PointerEvent) => {
    e.preventDefault();
    // Grabbing the cup scoops any dice still tumbling back into it.
    sweepDice();
    samplesRef.current = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    recentRef.current = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    rattleRef.current = { lastAt: 0, travel: 0, lastX: e.clientX, lastY: e.clientY };
    energyRef.current = 0;
    setPos({ x: e.clientX, y: e.clientY });
    setShaking(true);
  };

  const modeClass =
    mode.kind === 'attack'
      ? ' dice-cup--attack'
      : mode.kind === 'creation'
        ? ' dice-cup--creation'
        : mode.kind === 'evasion' || mode.kind === 'grapple' || mode.kind === 'facedown'
          ? ' dice-cup--sheet'
          : mode.kind === 'initiative'
            ? ' dice-cup--sheet'
            : mode.kind === 'sheet'
              ? mode.pending.visibility === 'gm'
                ? ' dice-cup--gm'
                : ' dice-cup--sheet'
              : mode.kind === 'roll'
                ? mode.visibility === 'gm'
                  ? ' dice-cup--gm'
                  : ' dice-cup--hot'
                : '';
  const title =
    mode.kind === 'creation'
      ? `Potrząśnij i rzuć Cechy: ${mode.pending.title} · Esc odkłada kubek`
      : mode.kind === 'attack'
        ? `Potrząśnij i strzel: ${mode.pending.title} · Esc odkłada atak`
        : mode.kind === 'evasion'
          ? `Potrząśnij i rzuć: ${mode.pending.title} · Esc odkłada rzut`
          : mode.kind === 'grapple' || mode.kind === 'facedown'
            ? `Potrząśnij i rzuć: ${mode.pending.title} · Esc odkłada rzut`
            : mode.kind === 'initiative'
              ? `Potrząśnij i rzuć inicjatywę: ${mode.pending.name} — ${initiativeLabel(mode.pending)} · Esc odkłada rzut`
              : mode.kind === 'sheet'
                ? `Potrząśnij i rzuć: ${mode.pending.characterName} — ${sheetLabel(mode.pending)}${
                    mode.pending.visibility === 'gm' ? ' (do MG)' : ''
                  } · Esc odkłada rzut`
                : mode.kind === 'roll'
                  ? `Potrząśnij i rzuć: ${mode.notation}${mode.visibility === 'gm' ? ' (do MG)' : ''} — wynik liczy się w grze`
                  : 'Potrząśnij i rzuć na niby (wpisz /r <formuła>, by rzut się liczył)';

  return (
    <div
      ref={cupRef}
      className={`dice-cup${modeClass}${shaking ? ' dice-cup--shaking' : ''}`}
      style={
        shaking && pos
          ? { left: pos.x, top: pos.y, bottom: 'auto', transform: 'translate(-50%, -50%)' }
          : undefined
      }
      title={title}
      onPointerDown={startShake}
      role="button"
      aria-label={title}
    >
      <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
        {/* dice cup: tapered tumbler with two pips */}
        <path
          d="M5 3h14l-2 13.5a2.5 2.5 0 0 1-2.5 2.5h-5A2.5 2.5 0 0 1 7 16.5L5 3Z"
          fill="currentColor"
          opacity="0.9"
        />
        <ellipse cx="12" cy="3" rx="7" ry="1.6" fill="currentColor" />
        <circle cx="10" cy="10" r="1.2" fill="var(--bg, #14151a)" />
        <circle cx="14" cy="13" r="1.2" fill="var(--bg, #14151a)" />
      </svg>
      {mode.kind === 'roll' && <span className="dice-cup-label">{mode.notation}</span>}
      {(mode.kind === 'attack' ||
        mode.kind === 'evasion' ||
        mode.kind === 'grapple' ||
        mode.kind === 'facedown') && <span className="dice-cup-label">{mode.pending.title}</span>}
      {mode.kind === 'creation' && <span className="dice-cup-label">{mode.pending.title}</span>}
      {mode.kind === 'sheet' && <span className="dice-cup-label">{sheetLabel(mode.pending)}</span>}
      {mode.kind === 'initiative' && (
        <span className="dice-cup-label">{initiativeLabel(mode.pending)}</span>
      )}
    </div>
  );
}
