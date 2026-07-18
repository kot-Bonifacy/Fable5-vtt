import { useEffect, useMemo, useRef, useState } from 'react';
import type { RollGesture } from '@vtt/shared';
import { MAX_GESTURE_STRENGTH, formatRollNotation, parseChatInput } from '@vtt/shared';
import { playFunRoll } from '../dice3d.js';
import { sendChatInput } from '../socket.js';
import { useChatStore } from '../stores/chatStore.js';

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

function playRattle(volume: number): void {
  const src = RATTLE_SOUNDS[Math.floor(Math.random() * RATTLE_SOUNDS.length)]!;
  const audio = new Audio(src);
  audio.volume = Math.min(0.12 + volume * 0.25, 0.5);
  void audio.play().catch(() => undefined);
}

type CupMode = { kind: 'fun' } | { kind: 'roll'; visibility: 'public' | 'gm'; notation: string };

/**
 * The dice cup: always available on the table. Grab it, shake, release to
 * throw. When the chat draft holds a roll command the throw is REAL — the
 * shake's entropy is mixed into the server's RNG (the gesture genuinely
 * influences the outcome; the server stays authoritative). Otherwise the
 * throw is a local toy roll with no game meaning.
 */
export function DiceCup() {
  const draft = useChatStore((s) => s.draft);
  const synced = useChatStore((s) => s.synced);
  const campaign = useChatStore((s) => s.campaign);

  const [shaking, setShaking] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const samplesRef = useRef<ShakeSample[]>([]);
  const rattleRef = useRef({ lastAt: 0, travel: 0, lastX: 0, lastY: 0 });
  const modeRef = useRef<CupMode>({ kind: 'fun' });

  const mode = useMemo<CupMode>(() => {
    const parsed = parseChatInput(draft);
    if (parsed.kind === 'roll') {
      return {
        kind: 'roll',
        visibility: parsed.visibility,
        notation: formatRollNotation(parsed.formula),
      };
    }
    return { kind: 'fun' };
  }, [draft]);
  modeRef.current = mode;

  useEffect(() => {
    if (!shaking) return;

    const onMove = (e: PointerEvent) => {
      const samples = samplesRef.current;
      if (samples.length < MAX_SAMPLES) {
        samples.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      }
      setPos({ x: e.clientX, y: e.clientY });

      const r = rattleRef.current;
      r.travel += Math.hypot(e.clientX - r.lastX, e.clientY - r.lastY);
      r.lastX = e.clientX;
      r.lastY = e.clientY;
      const now = performance.now();
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
      const first = samples[0];
      const last = samples[samples.length - 1];
      let speed = 0;
      if (first && last && last.t > first.t) {
        let path = 0;
        for (let i = 1; i < samples.length; i++) {
          path += Math.hypot(samples[i]!.x - samples[i - 1]!.x, samples[i]!.y - samples[i - 1]!.y);
        }
        speed = path / (last.t - first.t);
      }
      const strength = Math.min(strengthFromSpeed(speed), MAX_GESTURE_STRENGTH);

      const current = modeRef.current;
      if (current.kind === 'roll') {
        lastFunNotation = current.notation;
        void digestSamples(samples).then((entropy) => {
          const gesture: RollGesture = { entropy, strength };
          sendChatInput(useChatStore.getState().draft, gesture);
          useChatStore.getState().setDraft('');
        });
      } else {
        void playFunRoll(lastFunNotation, strength);
      }
    };

    const onCancel = () => {
      setShaking(false);
      setPos(null);
      samplesRef.current = [];
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', throwDice);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', throwDice);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
    };
  }, [shaking]);

  if (!synced || !campaign) return null;

  const startShake = (e: React.PointerEvent) => {
    e.preventDefault();
    samplesRef.current = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    rattleRef.current = { lastAt: 0, travel: 0, lastX: e.clientX, lastY: e.clientY };
    setPos({ x: e.clientX, y: e.clientY });
    setShaking(true);
  };

  const modeClass =
    mode.kind === 'roll' ? (mode.visibility === 'gm' ? ' dice-cup--gm' : ' dice-cup--hot') : '';
  const title =
    mode.kind === 'roll'
      ? `Potrząśnij i rzuć: ${mode.notation}${mode.visibility === 'gm' ? ' (do MG)' : ''} — wynik liczy się w grze`
      : 'Potrząśnij i rzuć na niby (wpisz /r <formuła>, by rzut się liczył)';

  return (
    <div
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
    </div>
  );
}
