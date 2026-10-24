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
// Not sure on a Prompt), the one swipe of the library (ADR 613). A press
// becomes a swipe once it has moved 10 px and more across than down; a press
// that goes down first is the page's scroll for the rest of it. The row then
// follows the finger one to one up to its reveal, resisted past it, never
// right of rest. A release commits when the finger has travelled half the
// row's width, or is moving left faster than 500 px/s having travelled the
// reveal; the reveal fills while a release would, by the same predicate. A
// commit does the reveal's action (or, with none, settles open over it); a
// row that `leaves` first slides off and closes its height, marked
// [data-closing] and aria-hidden as usePresence's exit, and calls the action
// at rest. Anything else, and a pointer cancel always, eases back.
//
// Its step form (ADR 619) is the Day body's swipe to the adjacent day, by the
// same axis, speed and cancel rules. A press that starts within 24 px of
// either edge of the screen is the platform's (its back gesture). The element
// follows the finger one to one either way a day lies, and 0.3 of it from rest
// where none does; which ways lie is read once, as the press becomes a swipe.
// A release steps the way the finger went when it has travelled half the
// element's width, or is moving that way faster than 500 px/s having
// travelled 48 px, and a day still lies that way. The element and the
// neighbour the caller draws beside it (`peek`) then slide until the
// neighbour is at rest, on the standard duration, and the step is taken at
// rest in the same update; anything else eases back as a row does. Under
// reduced motion nothing travels after release: the step is taken in place.
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
    return afterClosing(id, () => setKept(null));
  }, [closing, id]);
  return {
    /** The value shown: the live one, or the last one while it closes. */
    value: value || kept,
    closing,
    /** Spread on each element that leaves. */
    exit: closing ? { 'data-closing': id, 'aria-hidden': true } : {},
  };
}

/** Waits for the transitions of what is marked `[data-closing="id"]` and runs
 *  `done`, at once when nothing there transitions; the cleanup drops it. */
function afterClosing(id: string, done: () => void) {
  return afterMoving((target) => target.closest(`[data-closing="${CSS.escape(id)}"]`) !== null, done);
}

/** Waits for the transitions of the elements `moving` picks and runs `done`,
 *  at once when none of them transitions; the cleanup drops it. */
function afterMoving(moving: (target: Element) => boolean, done: () => void) {
  let stale = false;
  // Style the new state, so its transitions exist to be waited on.
  document.body.getBoundingClientRect();
  // Their own transitions, not what loops inside them (a busy spinner).
  const running = document.getAnimations()
    .filter((animation) => {
      const target = (animation.effect as KeyframeEffect | null)?.target as Element | null;
      return Number.isFinite(animation.effect?.getComputedTiming().endTime) && !!target && moving(target);
    });
  void Promise.allSettled(running.map((animation) => animation.finished)).then(() => { if (!stale) done(); });
  return () => { stale = true; };
}

type Gesture = {
  x: number; y: number; from: number; width: number; offset: number;
  /** Decided once the press has moved AXIS px: across swipes, down is the page's. */
  axis: 'x' | 'y' | null;
  /** The step form: the element pressed, and which ways a day lay when the axis was decided. */
  element: HTMLElement;
  ways?: Record<Way, boolean>;
  /** The finger's recent moves, for its speed at release. */
  moves: { t: number; x: number }[];
};

/** How far the press moves before its axis is decided. */
const AXIS = 10;
/** Past the reveal the row moves this fraction of the finger's further travel:
 *  the value the operator approved in the Snooze swipe replay (§2.5,
 *  2026-10-23; ADR 613). */
const RESISTANCE = 0.3;
/** A flick: the finger's leftward speed over its last 100 ms, in px/s. */
const FLICK = 500;
const FLICK_WINDOW = 100;
/** The step form: how near either edge of the screen a press is the platform's,
 *  and how far a flick travels to step, in px: the values the operator approved in
 *  the Day swipe replay (§2.5, 2026-10-24; ADR 619). */
const EDGE = 24;
const STEP_FLICK_MIN = 48;

/** The finger's speed at `t`, px/s, over its moves of the last 100 ms (right is positive). */
function speed(g: Gesture, t: number) {
  const recent = g.moves.filter((move) => t - move.t <= FLICK_WINDOW);
  if (recent.length < 2) return 0;
  const [first, last] = [recent[0], recent[recent.length - 1]];
  return last.t === first.t ? 0 : ((last.x - first.x) / (last.t - first.t)) * 1000;
}

/** A step's direction: 1 is the next day (the finger moving left), -1 the previous. */
export type Way = -1 | 1;

type Swipe = {
  /** Phone stories: start settled open over the reveal. */
  held?: boolean;
  /** The reveal's action; with none, a swipe that commits settles open. */
  onCommit?: () => void;
  /** A commit first takes the element away (slide-off, then close-up). */
  leaves?: boolean;
  /** The step form (ADR 619): whether a day lies `way`, and the step to it,
   *  taken at rest; the reveal and the options above are then unused. */
  step?: { can: (way: Way) => boolean; onStep: (way: Way) => void };
};

export function useSwipe(reveal: number, { held = false, onCommit, leaves = false, step }: Swipe = {}) {
  const id = useId();
  const [open, setOpen] = useState(held);
  const [dragged, setDragged] = useState<number | null>(null);
  // The reveal is drawn while open, under the finger, and until a close settles.
  const [revealed, setRevealed] = useState(held);
  const [filled, setFilled] = useState(false);
  // Leaving: sliding off where the finger left it, then closing its height.
  const [leaving, setLeaving] = useState<{ phase: 'off' | 'close'; from: number } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const swallow = useRef(false);
  const still = useRef<number>();
  const commit = useRef(onCommit);
  commit.current = onCommit;
  // The step form: sliding a step in, or easing back, the way it was drawn off rest.
  const [moving, setMoving] = useState<{ way: Way; steps: boolean; element: HTMLElement } | null>(null);
  // Just stepped: the neighbour, now the day, is drawn at rest with no transition.
  const [landed, setLanded] = useState(false);
  const stepper = useRef(step);
  stepper.current = step;

  /** The one would-commit predicate: half the width of finger travel, or a
   *  leftward flick having travelled the reveal; never moving right. */
  const commits = (g: Gesture, t: number) => {
    const travel = g.x - (g.moves[g.moves.length - 1]?.x ?? g.x);
    const v = speed(g, t);
    if (g.ways) {
      // Mirrored to the way the finger went, and only a way a day still lies.
      const way: Way = travel > 0 ? 1 : -1;
      const toward = way * -v;
      const far = Math.abs(travel);
      return travel !== 0 && g.ways[way] && !!stepper.current?.can(way) && toward >= 0
        && (far >= g.width / 2 || (far >= STEP_FLICK_MIN && toward > FLICK));
    }
    return v <= 0 && (travel >= g.width / 2 || (travel >= reveal && -v > FLICK));
  };

  const rest = () => {
    setLeaving(null);
    setOpen(false);
    setDragged(null);
    setRevealed(false);
    setFilled(false);
  };

  useLayoutEffect(() => {
    if (!leaving) return undefined;
    return afterClosing(id, () => {
      if (leaving.phase === 'off') {
        setLeaving({ ...leaving, phase: 'close' });
        return;
      }
      // At rest in the same update as the action: a row it removes never
      // shows again, and one it keeps is drawn at rest.
      rest();
      commit.current?.();
    });
  }, [leaving, id]);

  // The step form: once the track has slid or eased to where it rests, the
  // step is taken with the hook at rest, in the same update.
  useLayoutEffect(() => {
    if (!moving) return undefined;
    const { element, way, steps } = moving;
    return afterMoving((target) => target !== element && element.contains(target), () => {
      setMoving(null);
      setLanded(steps);
      if (steps) stepper.current?.onStep(way);
    });
  }, [moving]);
  useLayoutEffect(() => {
    if (!landed) return;
    // Style the day at rest untransitioned, so the ease-back restored after it starts nothing.
    document.body.getBoundingClientRect();
    setLanded(false);
  }, [landed]);

  const release = (event: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    gesture.current = null;
    window.clearTimeout(still.current);
    if (g?.axis !== 'x') return;
    // The system taking the gesture never commits.
    const past = event.type !== 'pointercancel' && commits(g, event.timeStamp);
    if (g.ways) {
      setDragged(null);
      if (g.offset !== 0) setMoving({ way: g.offset < 0 ? 1 : -1, steps: past, element: g.element });
      return;
    }
    if (past && commit.current && leaves) {
      setDragged(null);
      setLeaving({ phase: 'off', from: g.offset });
      return;
    }
    const opens = past && !commit.current;
    setOpen(opens);
    setDragged(null);
    setFilled(false);
    if (!opens && g.offset === 0) setRevealed(false);
    if (past) commit.current?.();
  };

  const bind = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      gesture.current = null;
      // Ignored while a step slides or the element eases back.
      if (leaving || moving) return;
      if (step) {
        // The screen's edges (its root, which the motion gate marks) are the platform's.
        const screen = (event.currentTarget.closest('[data-motion]') ?? document.documentElement).getBoundingClientRect();
        if (event.clientX - screen.left < EDGE || screen.right - event.clientX < EDGE) return;
      }
      const from = open ? -reveal : 0;
      swallow.current = false;
      gesture.current = {
        x: event.clientX, y: event.clientY, from, offset: from, axis: null, element: event.currentTarget,
        width: event.currentTarget.getBoundingClientRect().width, moves: [{ t: event.timeStamp, x: event.clientX }],
      };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const g = gesture.current;
      if (!g || g.axis === 'y') return;
      const dx = event.clientX - g.x;
      if (!g.axis) {
        const dy = event.clientY - g.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS) return;
        g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (g.axis === 'y') return;
        swallow.current = true;
        if (step) g.ways = { [-1]: step.can(-1), [1]: step.can(1) };
        else setRevealed(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      g.moves = [...g.moves.filter((move) => event.timeStamp - move.t <= FLICK_WINDOW), { t: event.timeStamp, x: event.clientX }];
      if (g.ways) {
        // One to one where a day lies, resisted from rest where none does.
        g.offset = g.ways[dx < 0 ? 1 : -1] ? dx : dx * RESISTANCE;
        setDragged(g.offset);
        return;
      }
      // One to one up to the reveal, resisted past it, never right of rest.
      const to = Math.min(0, g.from + dx);
      g.offset = to < -reveal ? -reveal + (to + reveal) * RESISTANCE : to;
      setDragged(g.offset);
      setFilled(commits(g, event.timeStamp));
      // A finger that stops has no speed: read the verdict again once it has
      // been still for the speed's window.
      window.clearTimeout(still.current);
      still.current = window.setTimeout(() => {
        if (gesture.current === g) setFilled(commits(g, performance.now()));
      }, FLICK_WINDOW + 1);
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
      if (event.propertyName === 'translate' && event.target === event.currentTarget.lastElementChild && !open && !leaving) {
        setRevealed(false);
      }
    },
  };

  const style = leaving
    // Off to the left by its own width; under reduced motion (--ui-motion-move
    // 0) it stays where the finger left it and fades.
    ? {
      translate: `calc(-100% * var(--ui-motion-move) + ${leaving.from}px * (1 - var(--ui-motion-move))) 0`,
      opacity: 'var(--ui-motion-move)',
    }
    // A step slides the element its own width, the neighbour coming to rest,
    // on the standard duration; under reduced motion it stays at rest.
    : moving?.steps ? {
      translate: `calc(${-moving.way} * 100% * var(--ui-motion-move)) 0`,
      transition: 'translate calc(var(--ui-motion-standard) * var(--ui-motion-move)) var(--ui-ease-standard)',
    }
    : landed ? { transition: 'none' }
    : dragged === null ? undefined : { translate: `${dragged}px 0` };

  return {
    revealed,
    /** A release now would commit: the reveal fills. */
    filled,
    dragging: dragged !== null,
    /** Settled open over the reveal. */
    open: open && dragged === null && !leaving,
    leaving: leaving !== null,
    /** Under the finger, or leaving: the element's offset. */
    style,
    /** The step form: the way the element is drawn off rest, or sliding, whose day the caller draws beside it. */
    peek: moving ? moving.way : dragged ? (dragged < 0 ? 1 : -1) as Way : null,
    bind,
    /** Spread on the element that leaves, as usePresence's exit. */
    exit: leaving ? { 'data-closing': id, 'aria-hidden': true, 'data-swipe-leaving': leaving.phase } : {},
  };
}
