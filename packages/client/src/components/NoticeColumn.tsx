import { useEffect, useRef, useState } from 'react';
import { useNoticeStore, type Notice, type NoticeTone } from '../stores/noticeStore.js';

/**
 * Kolumna komunikatów na górze-środku nad mapą (etap 55, wzór: Foundry).
 *
 * Na górze stany przypięte — podaje je ten, kto zna stan (`MapArea`: Stop,
 * stawianie, celowanie, legenda śladów) i znikają razem z nim, bez ✕. Pod nimi
 * komunikaty z `noticeStore`. Jedna skóra dla wszystkich: pasek w kolorze
 * rodzaju z nagłówkiem wersalikami, jak „Tura tej figury” w lewym panelu.
 */

export interface PinnedNotice {
  key: string;
  tone: NoticeTone;
  title: string;
  text: string;
}

export function NoticeColumn({ pinned = [] }: { pinned?: PinnedNotice[] }) {
  const notices = useNoticeStore((s) => s.notices);
  if (pinned.length === 0 && notices.length === 0) return null;
  return (
    <div className="notice-column">
      {pinned.map((p) => (
        <div
          key={p.key}
          className={`notice notice--${p.tone} notice--pinned`}
          role="status"
          data-notice={p.key}
        >
          <p className="notice-title">{p.title}</p>
          <p className="notice-text">{p.text}</p>
        </div>
      ))}
      {notices.map((n) => (
        <NoticeRow key={n.id} notice={n} />
      ))}
    </div>
  );
}

function NoticeRow({ notice }: { notice: Notice }) {
  const dismiss = useNoticeStore((s) => s.dismiss);
  const [held, setHeld] = useState(false);
  // Pozostały czas żyje między renderami: najechanie zatrzymuje zegar, zejście
  // kursora liczy dalej od tego miejsca, a ponowne zdanie liczy od nowa.
  // (Reset w efekcie, nie w renderze: sprzątanie poprzedniego zegara biegnie
  // po renderze i odjęłoby swój czas od świeżo przywróconej puli.)
  const left = useRef(notice.lifetime);
  const raised = useRef(notice.raised);
  useEffect(() => {
    if (raised.current !== notice.raised) {
      raised.current = notice.raised;
      left.current = notice.lifetime;
    }
    if (held || left.current === null) return;
    const started = Date.now();
    const timer = window.setTimeout(() => dismiss(notice.id), left.current);
    return () => {
      window.clearTimeout(timer);
      if (left.current !== null) left.current = Math.max(0, left.current - (Date.now() - started));
    };
  }, [held, notice.id, notice.raised, notice.lifetime, dismiss]);

  return (
    <div
      // Ponowne zdanie gra wejście jeszcze raz: inaczej powtórzona odmowa
      // wyglądałaby jak brak reakcji na klik.
      key={notice.raised}
      className={`notice notice--${notice.tone}`}
      role={notice.tone === 'danger' ? 'alert' : 'status'}
      data-notice-topic={notice.topic ?? undefined}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div className="notice-head">
        <p className="notice-title">{notice.title}</p>
        <button
          type="button"
          className="notice-close"
          title="Zamknij"
          aria-label="Zamknij"
          onClick={() => dismiss(notice.id)}
        >
          ✕
        </button>
      </div>
      <p className="notice-text">{notice.text}</p>
      {notice.actions && notice.actions.length > 0 && (
        <div className="notice-actions">
          {notice.actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className="notice-action"
              {...(action.title ? { title: action.title } : {})}
              onClick={() => {
                dismiss(notice.id);
                action.run();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
