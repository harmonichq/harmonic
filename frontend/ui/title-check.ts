// The stories' check of a screen's title (§2.5, 2026-10-20): the nav already
// shows a tab screen selected, so the screen's name stays its h1, read by a
// screen reader, and draws nothing; a header left with nothing else takes no
// height, and the content moves up. A sub-screen's title, which the nav does
// not name, draws at title size above its content.
import { expect, within } from 'storybook/test';

const heading = (canvasElement: HTMLElement, name: string) =>
  within(canvasElement).getByRole('heading', { level: 1, name });

/** A tab screen's name: its h1, drawn as nothing. Returns its header. */
export async function expectTitleUnprinted(canvasElement: HTMLElement, name: string): Promise<HTMLElement> {
  const title = heading(canvasElement, name);
  const box = title.getBoundingClientRect();
  await expect(box.width).toBeLessThanOrEqual(1);
  await expect(box.height).toBeLessThanOrEqual(1);
  return title.closest('header') as HTMLElement;
}

/** A tab screen whose header carries nothing besides its name: it takes no height. */
export async function expectHeaderEmpty(canvasElement: HTMLElement, name: string): Promise<void> {
  const header = await expectTitleUnprinted(canvasElement, name);
  await expect(header.getBoundingClientRect().height).toBe(0);
}

/** Desktop: what follows a header that draws nothing starts at its pane's top,
 *  level with the pane beside it, with no gap left for the absent title. */
export async function expectAtPaneTop(element: HTMLElement): Promise<void> {
  const pane = element.closest<HTMLElement>('[data-scroll="page"]')!;
  const top = pane.getBoundingClientRect().top + parseFloat(getComputedStyle(pane).paddingTop);
  await expect(element.getBoundingClientRect().top).toBe(top);
}

/** A sub-screen's title: drawn, one 28 px line. */
export async function expectTitlePrinted(canvasElement: HTMLElement, name: string): Promise<void> {
  await expect(heading(canvasElement, name).getBoundingClientRect().height).toBe(28);
}
