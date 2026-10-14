// Motion (tokens.css). Three hooks; the motion itself is CSS.
//
// useMotionGate marks a screen's root [data-motion] once the screen has first
// drawn. Everything that enters a screen (a sheet, a popover, the bar, the
// month, a card opening) is a transition from its @starting-style under that
// attribute, so it moves only when it arrives after the screen did: a screen
// that opens with a sheet up or the month down shows it at rest, and every
// motion ends exactly where the element already rests.
//
// usePresence keeps what is closing on screen while it animates out: a sheet,
// a popover, the month, the bar, a card collapsing. Its element takes
// [data-closing], which the CSS turns into the reverse of its entry, and
// aria-hidden, so it has already left for assistive tech and for every query
// by role. It goes from the DOM once its own transitions end, at once where
// nothing transitions (outside a gated screen).
//
// useSwipe is a row's horizontal swipe over its reveal (Snooze on a Queue row,
// Not sure on a Prompt): the row follows the finger; released past half the
// reveal it does the reveal's action (or, with none, settles open over it),
// and short of half it settles closed.
import {
  useId, useLayoutEffect, useRef, useState, type PointerEvent, type SyntheticEvent, type TransitionEvent,
} from 'react';

export function useMotionGate<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    // Style what the first render drew before the gate opens, so none of it
    // takes a starting style.
    root.getBoundingClientRect();
    root.dataset.motion = '';
  }, []);
  return ref;
}

/** `value` is what is shown while present; pass a stable one (a flag, a state). */
export function usePresence<V>(value: V | null | undefined | false) {
  const id = useId();
  const [kept, setKept] = useState<V | null>(value || null);
  if (value && value !== kept) setKept(value);
  const closing = !value && kept !== null;
  useLayoutEffect(() => {
    if (!closing) return undefined;
    let stale = false;
    // Style the closing state, so its transitions exist to be waited on.
    document.body.getBoundingClientRect();
    // Its own closing transitions, not what loops inside it (a busy spinner).
    const leaving = document.getAnimations()
      .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime)
        && ((animation.effect as KeyframeEffect | null)?.target as Element | null)
          ?.closest(`[data-closing="${CSS.escape(id)}"]`));
    void Promise.allSettled(leaving.map((animation) => animation.finished)).then(() => { if (!stale) setKept(null); });
    return () => { stale = true; };
  }, [closing, id]);
  return {
    /** The value shown: the live one, or the last one while it closes. */
    value: value || kept,
    closing,
    /** Spread on each element that leaves. */
    exit: closing ? { 'data-closing': id, 'aria-hidden': true } : {},
  };
}

type Gesture = { x: number; y: number; from: number; offset: number; moving: boolean };

/** How far the finger travels before a press becomes a swipe. */
const SLOP = 8;

export function useSwipe(reveal: number, held = false, onCommit?: () => void) {
  const [open, setOpen] = useState(held);
  const [dragged, setDragged] = useState<number | null>(null);
  // The reveal is drawn while open, under the finger, and until a close settles.
  const [revealed, setRevealed] = useState(held);
  const gesture = useRef<Gesture | null>(null);
  const swallow = useRef(false);

  const release = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.moving) return;
    const past = g.offset < -reveal / 2;
    const opens = past && !onCommit;
    setOpen(opens);
    setDragged(null);
    if (!opens && g.offset === 0) setRevealed(false);
    if (past) onCommit?.();
  };

  const bind = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      const from = open ? -reveal : 0;
      swallow.current = false;
      gesture.current = { x: event.clientX, y: event.clientY, from, offset: from, moving: false };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const g = gesture.current;
      if (!g) return;
      const dx = event.clientX - g.x;
      if (!g.moving) {
        if (Math.abs(dx) < SLOP || Math.abs(dx) < Math.abs(event.clientY - g.y)) return;
        g.moving = true;
        swallow.current = true;
        setRevealed(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      g.offset = Math.min(0, Math.max(-reveal, g.from + dx));
      setDragged(g.offset);
    },
    onPointerUp: release,
    onPointerCancel: release,
    // A swipe is not a tap on what it started over.
    onClickCapture: (event: SyntheticEvent) => {
      if (!swallow.current) return;
      swallow.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    onTransitionEnd: (event: TransitionEvent<HTMLElement>) => {
      if (event.propertyName === 'translate' && event.target === event.currentTarget.lastElementChild && !open) {
        setRevealed(false);
      }
    },
  };

  return {
    revealed,
    dragging: dragged !== null,
    /** Settled open over the reveal. */
    open: open && dragged === null,
    /** Under the finger: the row's offset. */
    style: dragged === null ? undefined : { translate: `${dragged}px 0` },
    bind,
  };
}
