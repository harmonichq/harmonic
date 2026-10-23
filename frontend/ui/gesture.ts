// A finger drawn sideways across a row, for the stories: down, along, up. It
// drives the same pointer events a touch does, so a play or a replay swipes
// through the row's own handlers.
const frame = () => new Promise((done) => requestAnimationFrame(() => done(undefined)));
const pause = (ms: number) => new Promise((done) => window.setTimeout(done, ms));

/** How the finger moves: steady, a move a frame and up at once; slow, the same
 *  and then still for 150 ms, so it lifts with no speed; flick, every move
 *  inside 60 ms and up at once, far over 500 px/s; cancel, as slow, and then
 *  the system takes the gesture (pointercancel) instead of the finger lifting. */
export type Pace = 'steady' | 'slow' | 'flick' | 'cancel';

const point = (target: HTMLElement) => {
  const box = target.getBoundingClientRect();
  const y = box.top + box.height / 2;
  const x = box.left + box.width * 0.7;
  return (dx: number, dy = 0) => ({
    bubbles: true, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x + dx, clientY: y + dy,
  });
};

/** Swipe `target` by `dx` px (negative is left) in `steps` moves, at `pace`. */
export async function swipe(target: HTMLElement, dx: number, steps = 12, pace: Pace = 'steady') {
  const at = point(target);
  target.dispatchEvent(new PointerEvent('pointerdown', at(0)));
  for (let i = 1; i <= steps; i += 1) {
    await (pace === 'flick' ? pause(60 / steps) : frame());
    target.dispatchEvent(new PointerEvent('pointermove', at((dx * i) / steps)));
  }
  if (pace === 'slow' || pace === 'cancel') await pause(150);
  target.dispatchEvent(new PointerEvent(pace === 'cancel' ? 'pointercancel' : 'pointerup', at(dx)));
}

/** A press that moves 12 px down first, as a scroll does, then `dx` across. */
export async function scrollThenSwipe(target: HTMLElement, dx: number, steps = 12) {
  const at = point(target);
  target.dispatchEvent(new PointerEvent('pointerdown', at(0)));
  for (let i = 1; i <= 4; i += 1) {
    await frame();
    target.dispatchEvent(new PointerEvent('pointermove', at(0, i * 3)));
  }
  for (let i = 1; i <= steps; i += 1) {
    await frame();
    target.dispatchEvent(new PointerEvent('pointermove', at((dx * i) / steps, 12)));
  }
  await pause(150);
  target.dispatchEvent(new PointerEvent('pointerup', at(dx, 12)));
}
