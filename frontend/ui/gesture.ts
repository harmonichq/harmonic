// A finger drawn sideways across a row, for the stories: down, along, up. It
// drives the same pointer events a touch does, so a play or a replay swipes
// through the row's own handlers.
const frame = () => new Promise((done) => requestAnimationFrame(() => done(undefined)));

/** Swipe `target` by `dx` px (negative is left) in `steps` moves, a frame apart. */
export async function swipe(target: HTMLElement, dx: number, steps = 12) {
  const box = target.getBoundingClientRect();
  const y = box.top + box.height / 2;
  const x = box.left + box.width * 0.7;
  const at = (offset: number) => ({
    bubbles: true, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x + offset, clientY: y,
  });
  target.dispatchEvent(new PointerEvent('pointerdown', at(0)));
  for (let i = 1; i <= steps; i += 1) {
    await frame();
    target.dispatchEvent(new PointerEvent('pointermove', at((dx * i) / steps)));
  }
  target.dispatchEvent(new PointerEvent('pointerup', at(dx)));
}
