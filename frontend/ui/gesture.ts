// A finger drawn sideways across a row, for the stories: down, along, up. It
// drives the same pointer events a touch does, so a play or a replay swipes
// through the row's own handlers. Its moves are timed by the clock, not by
// frames, so a pace is the same speed at any refresh rate.
const pause = (ms: number) => new Promise((done) => window.setTimeout(done, ms));

/** How the finger moves: slow, at 250 px/s (half the flick speed) and then
 *  still for 150 ms, so it lifts with no speed; flick, every move inside
 *  60 ms and up at once, far over 500 px/s; cancel, as slow, and then the
 *  system takes the gesture (pointercancel) instead of the finger lifting. */
export type Pace = 'slow' | 'flick' | 'cancel';

const SLOW = 250;

/** Where the finger presses: `from` of the way across the target (0.7 unless
 *  a story presses nearer an edge), halfway down. */
const point = (target: HTMLElement, from = 0.7) => {
  const box = target.getBoundingClientRect();
  const y = box.top + box.height / 2;
  const x = box.left + box.width * from;
  return (dx: number, dy = 0) => ({
    bubbles: true, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x + dx, clientY: y + dy,
  });
};

/** Down on `target` and `dx` px across (negative is left) in `steps` moves, the
 *  finger left down; returns where it is, for the lift. */
async function drag(target: HTMLElement, dx: number, steps: number, pace: Pace, from?: number) {
  const at = point(target, from);
  target.dispatchEvent(new PointerEvent('pointerdown', at(0)));
  const gap = pace === 'flick' ? 60 / steps : (Math.abs(dx) / steps / SLOW) * 1000;
  for (let i = 1; i <= steps; i += 1) {
    await pause(gap);
    target.dispatchEvent(new PointerEvent('pointermove', at((dx * i) / steps)));
  }
  if (pace !== 'flick') await pause(150);
  return at(dx);
}

/** Swipe `target` by `dx` px (negative is left) in `steps` moves, at `pace`,
 *  pressing `from` of the way across it. */
export async function swipe(target: HTMLElement, dx: number, steps = 12, pace: Pace = 'slow', from?: number) {
  const end = await drag(target, dx, steps, pace, from);
  target.dispatchEvent(new PointerEvent(pace === 'cancel' ? 'pointercancel' : 'pointerup', end));
}

/** A slow swipe held at its end: the finger stays down, for a story that shows
 *  the row mid-gesture. */
export async function hold(target: HTMLElement, dx: number, steps = 12) {
  await drag(target, dx, steps, 'slow');
}

/** A press that moves 12 px down first, as a scroll does, then `dx` across. */
export async function scrollThenSwipe(target: HTMLElement, dx: number, steps = 12) {
  const at = point(target);
  target.dispatchEvent(new PointerEvent('pointerdown', at(0)));
  for (let i = 1; i <= 4; i += 1) {
    await pause(12 / 4 / SLOW * 1000);
    target.dispatchEvent(new PointerEvent('pointermove', at(0, i * 3)));
  }
  for (let i = 1; i <= steps; i += 1) {
    await pause((Math.abs(dx) / steps / SLOW) * 1000);
    target.dispatchEvent(new PointerEvent('pointermove', at((dx * i) / steps, 12)));
  }
  await pause(150);
  target.dispatchEvent(new PointerEvent('pointerup', at(dx, 12)));
}
