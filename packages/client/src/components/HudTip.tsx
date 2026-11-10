import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

/**
 * Opis przycisku lewej belki, który wychodzi po chwili trzymania kursora
 * (etap 69, zlecenie MG z 10.11.2026).
 *
 * Belka bez ramek ma przyciski z samą ikoną, więc „co to robi” nie może
 * mieszkać w systemowym `title`: ten pokazuje gołe zdanie, bez kosztu i bez
 * powodu odmowy, a w Firefoksie znika po kilku sekundach. Dymek stoi **obok**
 * belki, nad mapą — w belce zasłaniałby sąsiednie przyciski, a `overflow`
 * panelu i tak by go uciął, stąd portal do `body`.
 *
 * Jedna warstwa na całą belkę: dymek jest jeden, więc przejście kursorem
 * z przycisku na przycisk nie zostawia dwóch naraz.
 */
export interface HudTipContent {
  title: string;
  /** „Akcja”, „8 m ruchu” — to, co mówi znaczek kosztu na przycisku. */
  cost?: string | null;
  /** Zdanie z katalogu akcji albo opis broni. */
  body?: string | null;
  /** Dlaczego przycisk jest wyszarzony — stoi na czerwono pod opisem. */
  refusal?: string | null;
  keyLabel?: string | null;
}

interface HudTipApi {
  show: (anchor: HTMLElement, content: HudTipContent) => void;
  update: (anchor: HTMLElement, content: HudTipContent) => void;
  hide: (anchor?: HTMLElement) => void;
}

const NOOP: HudTipApi = { show: () => {}, update: () => {}, hide: () => {} };
const HudTipContext = createContext<HudTipApi>(NOOP);

/** Ile kursor ma postać na przycisku, zanim wyjdzie opis. */
const HUD_TIP_DELAY_MS = 450;
/** Odstęp dymka od krawędzi belki i od brzegów okna. */
const HUD_TIP_GAP_PX = 10;

interface Shown {
  anchor: HTMLElement;
  content: HudTipContent;
}

export function HudTipLayer({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const timer = useRef<number | null>(null);
  const pending = useRef<Shown | null>(null);
  const bubble = useRef<HTMLDivElement | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
  }, []);

  const api = useMemo<HudTipApi>(
    () => ({
      show: (anchor, content) => {
        clear();
        pending.current = { anchor, content };
        timer.current = window.setTimeout(() => {
          timer.current = null;
          const next = pending.current;
          pending.current = null;
          if (next && next.anchor.isConnected) setShown(next);
        }, HUD_TIP_DELAY_MS);
      },
      update: (anchor, content) => {
        if (pending.current?.anchor === anchor) pending.current = { anchor, content };
        setShown((current) => (current?.anchor === anchor ? { anchor, content } : current));
      },
      hide: (anchor) => {
        if (!anchor || pending.current?.anchor === anchor) clear();
        setShown((current) => (!anchor || current?.anchor === anchor ? null : current));
      },
    }),
    [clear],
  );

  useEffect(() => clear, [clear]);

  // Dymek stoi przy prawej krawędzi belki, na wysokości przycisku; po pomiarze
  // dosuwa się, żeby nie wyjść pod dół okna.
  useLayoutEffect(() => {
    if (!shown) {
      setPlace(null);
      return;
    }
    const anchorRect = shown.anchor.getBoundingClientRect();
    const rail = shown.anchor.closest('.hud-rail');
    const edge = rail ? rail.getBoundingClientRect().right : anchorRect.right;
    const height = bubble.current?.offsetHeight ?? 0;
    const top = Math.max(
      HUD_TIP_GAP_PX,
      Math.min(anchorRect.top, window.innerHeight - height - HUD_TIP_GAP_PX),
    );
    setPlace({ left: edge + HUD_TIP_GAP_PX, top });
  }, [shown]);

  // Przewinięcie belki, Esc i klik gdziekolwiek zamykają opis — przycisk mógł
  // wyjechać spod kursora, a dymek wisiałby przy pustym miejscu.
  useEffect(() => {
    if (!shown) return;
    const close = () => api.hide();
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', close, true);
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', close, true);
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('resize', close);
    };
  }, [shown, api]);

  const content = shown?.content ?? null;
  return (
    <HudTipContext.Provider value={api}>
      {children}
      {content &&
        createPortal(
          <div
            ref={bubble}
            className="hud-tip"
            role="tooltip"
            style={
              place
                ? { left: place.left, top: place.top }
                : { left: 0, top: 0, visibility: 'hidden' }
            }
          >
            <div className="hud-tip-head">
              <strong className="hud-tip-title">{content.title}</strong>
              {content.keyLabel && <kbd className="hud-tip-key">{content.keyLabel}</kbd>}
            </div>
            {content.cost && <div className="hud-tip-cost">{content.cost}</div>}
            {content.body && <p className="hud-tip-body">{content.body}</p>}
            {content.refusal && <p className="hud-tip-refusal">{content.refusal}</p>}
          </div>,
          document.body,
        )}
    </HudTipContext.Provider>
  );
}

/**
 * Uchwyty dymka dla jednego przycisku. `null` — przycisk jest oczywisty
 * i opisu nie ma; poza `HudTipLayer` uchwyty nic nie robią.
 */
export function useHudTip(content: HudTipContent | null) {
  const api = useContext(HudTipContext);
  const anchor = useRef<HTMLElement | null>(null);
  const latest = useRef(content);
  latest.current = content;

  const signature = content
    ? [content.title, content.cost, content.body, content.refusal, content.keyLabel].join('\u0001')
    : null;

  // Treść zmienia się pod kursorem (wydana Akcja wyszarza przycisk) — otwarty
  // dymek ma to powiedzieć od razu, nie po ponownym najechaniu.
  useEffect(() => {
    const element = anchor.current;
    if (!element) return;
    if (latest.current) api.update(element, latest.current);
    else api.hide(element);
  }, [api, signature]);

  useEffect(
    () => () => {
      if (anchor.current) api.hide(anchor.current);
    },
    [api],
  );

  return useMemo(() => {
    const open = (element: HTMLElement) => {
      anchor.current = element;
      if (latest.current) api.show(element, latest.current);
    };
    const close = (element: HTMLElement) => api.hide(element);
    return {
      onPointerEnter: (event: React.PointerEvent<HTMLElement>) => {
        // Dotyk nie ma „najechania” — tam dymek wisiałby po każdym stuknięciu.
        if (event.pointerType !== 'touch') open(event.currentTarget);
      },
      onPointerLeave: (event: React.PointerEvent<HTMLElement>) => close(event.currentTarget),
      onFocus: (event: React.FocusEvent<HTMLElement>) => {
        if (event.currentTarget.matches(':focus-visible')) open(event.currentTarget);
      },
      onBlur: (event: React.FocusEvent<HTMLElement>) => close(event.currentTarget),
    };
  }, [api]);
}
