// The stories' check of ChangeMetrics' columns (§2.5, 2026-10-19, #575): on a
// phone the operator saw "Above 180" run into its before value and
// "Readings" into its count, and each module's numbers start at another x.
// Every module in the frame must set its before, arrow, after, unit and Δ in
// the same columns, at the same x in every module, and nothing drawn in a row
// (its label, its values, its unit, its Δ) may overlap anything else in it or
// leave its module.
import { expect } from 'storybook/test';

const COLUMNS = ['before', 'arrow', 'after', 'unit', 'delta'] as const;

/** Where a cell's own text is drawn: its glyphs' box, not the column's. */
function ink(cell: Element): DOMRect | null {
  const range = document.createRange();
  range.selectNodeContents(cell);
  const box = range.getBoundingClientRect();
  return box.width > 0 ? box : null;
}

const overlaps = (a: DOMRect, b: DOMRect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const span = (box: DOMRect) => [Math.round(box.left), Math.round(box.right)];

export async function expectMetricsAligned(canvasElement: HTMLElement): Promise<void> {
  const modules = [...canvasElement.querySelectorAll<HTMLElement>('.ui-metrics')];
  await expect(modules.length).toBeGreaterThan(0);
  for (const column of COLUMNS) {
    // One column per role across the whole frame: each cell's box, every row of every module.
    const cells = modules.flatMap((module) => [...module.querySelectorAll(`.ui-metrics__${column}`)]);
    const spans = new Set(cells.map((cell) => span(cell.getBoundingClientRect()).join('–')));
    await expect({ column, spans: [...spans] }).toEqual({ column, spans: [[...spans][0]] });
  }
  for (const module of modules) {
    const inner = module.getBoundingClientRect();
    for (const row of module.querySelectorAll('.ui-metrics__row')) {
      const label = row.querySelector('.ui-metrics__label')!.textContent;
      const drawn = [row.querySelector('.ui-metrics__label')!, ...COLUMNS.map((c) => row.querySelector(`.ui-metrics__${c}`)!)]
        .map((cell) => ({ name: cell.className, box: ink(cell) }))
        .filter((cell): cell is { name: string; box: DOMRect } => cell.box !== null);
      for (const [i, a] of drawn.entries()) {
        await expect({ label, cell: a.name, inside: a.box.left >= inner.left && a.box.right <= inner.right })
          .toEqual({ label, cell: a.name, inside: true });
        for (const b of drawn.slice(i + 1)) {
          await expect({ label, cells: [a.name, b.name], overlap: overlaps(a.box, b.box) })
            .toEqual({ label, cells: [a.name, b.name], overlap: false });
        }
      }
    }
  }
}
