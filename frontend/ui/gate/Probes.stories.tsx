// The keyboard walk's own probes (#582, ADR 582): each story draws one defect
// on purpose, and its `gate` parameter names the rules it probes and exactly
// what the walk must find there (scripts/ui-stories.mjs). A probe that finds
// nothing is a rule that cannot fail. The probes are not the app: they draw
// with plain elements where a defect needs one, and the library's own
// components where the defect is the library's.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../components/Button/Button';
import { useDialogFocus } from '../dialog';

const meta = { title: 'Gate/Probes' } satisfies Meta;
export default meta;
type Story = StoryObj;
type Gate = { rules: string[]; expect: string[]; owner?: boolean };
const probe = (gate: Gate, render: () => JSX.Element, frame?: { width: number; height?: number }): Story => ({
  render, parameters: { gate, ...(frame ? { frame } : {}) },
});
const DESKTOP = { width: 1440, height: 900 };
const Plain = (p: { label: string; onClick?: () => void; popup?: boolean; open?: boolean; style?: object }) => (
  <button type="button" data-role="text" style={{ height: 44, ...p.style }} onClick={p.onClick}
    aria-haspopup={p.popup ? 'dialog' : undefined} aria-expanded={p.popup ? Boolean(p.open) : undefined}>{p.label}</button>
);

// (g) reachable.
export const TapWithNoRole = probe({ rules: ['g'], expect: ['(g) "Pin" responds to a tap but has no role'] },
  () => <div onClick={() => {}}>Pin</div>);
export const InvisibleTabStop = probe({ rules: ['g'], expect: ['(g) Tab stops on "Snooze", which is not a visible control'] },
  () => <><Plain label="Pin" /><Plain label="Snooze" style={{ opacity: 0 }} /></>);

// (h) visible focus.
export const SameFocused = probe({ rules: ['h'], expect: ['(h) "Pin" looks the same focused'] },
  () => <Plain label="Pin" style={{ outline: 'none' }} />);

// (i) named.
export const NoName = probe({ rules: ['i'], expect: ['(i) button "button" has no accessible name'] },
  () => <button type="button" data-role="text" style={{ height: 44, width: 44 }}><svg aria-hidden="true" width="10" height="10" /></button>);
export const WordRunIntoNumber = probe({ rules: ['i'], expect: ['(i) "Peak43" runs text together'] },
  () => <button type="button" data-role="text" style={{ height: 44 }}><span>Peak</span><span>43</span></button>);
export const WordRunIntoWord = probe({ rules: ['i'], expect: ['(i) "GlucoseBasal" runs text together'] },
  () => <button type="button" data-role="text" style={{ height: 44 }}><span>Glucose</span><span>Basal</span></button>);
export const BadgeInName = probe({ rules: ['i'], expect: ['(i) "5 Day" carries its badge "5" in its name'] },
  () => <button type="button" data-role="text" style={{ height: 44 }}><span className="ui-badge">5</span> <span>Day</span></button>);
export const ImageHidesItsText = probe({ rules: ['i'], expect: ['(i) a graphic drawn as an image (svg) hides its text "No data"'] },
  () => <svg role="img" aria-label="Glucose" width="120" height="40"><text x="4" y="24">No data</text></svg>);
export const GroupKeepsItsText = probe({ rules: ['i'], expect: [] },
  () => <svg role="group" aria-label="Glucose" width="120" height="40"><text x="4" y="24">No data</text></svg>);
export const CoveredStillNamed = probe({ rules: ['i'], expect: ['(i) button "button" has no accessible name'] },
  () => <CoveredByScrim />);

// (j) order.
export const PositiveTabindex = probe({ rules: ['j'], expect: ['(j) "Snooze" has a positive tabindex (2)'] },
() => <div style={{ display: 'flex', gap: 8 }}><Plain label="Pin" /><button type="button" data-role="text" tabIndex={2} style={{ height: 44 }}>Snooze</button></div>);
export const ReversedRow = probe({ rules: ['j'], expect: ['(j) Tab goes left from "Pin" to "Snooze"'] },
  () => <div style={{ display: 'flex', flexDirection: 'row-reverse', justifyContent: 'flex-end', gap: 8 }}><Plain label="Pin" /><Plain label="Snooze" /></div>);

// (l) target size, on phone, and a pinned bar's own taps at any width.
export const UnderTarget = probe({ rules: ['l'], expect: ['(l) "Pin" takes no tap 22 px left, right, above, below of its centre'] },
  () => <Plain label="Pin" style={{ height: 40, width: 40, padding: 0 }} />);
/** A hit area that stacks over the page (the defect #676's review found):
 *  scrolled under a pinned bar, a button's hit area takes the bar's taps. */
export const HitAreaOverBar = probe({ rules: ['l'], expect: ['(l) "Retry" loses a tap to "End" scrolled under it'] },
  () => <UnderBar hit="over" />, DESKTOP);
/** The library's own secondary and text buttons under the same bar. */
export const ButtonsUnderBar = probe({ rules: ['l'], expect: [] }, () => <UnderBar hit="button" />, DESKTOP);

// (m) announced.
export const StatusNotLive = probe({ rules: ['m'], expect: ['(m) "Not saved" is not in a live region'] },
  () => <span>Not saved</span>);
export const BarLabelNotLive = probe({ rules: ['m'], expect: ['(m) "Saved" is not in a live region'] },
  () => <div className="ui-bar"><span className="ui-bar__label">Saved</span></div>);

// (k) Escape and return, walked as a screen walks them.
export const DialogKeepsNoFocus = probe({ owner: true, rules: ['k'], expect: [
  '(k) dialog "End" from "End" does not take focus when it opens',
  '(k) dialog "End" from "End" does not close on Escape',
  '(k) dialog "End" from "End" does not give focus back to its trigger',
] }, () => <Unhooked popup />);
export const DialogUndeclared: Story = {
  ...probe({ owner: true, rules: ['k'], expect: [
    '(k) "End" opens dialog "End" but does not declare it (aria-haspopup)',
    '(k) dialog "End" does not take focus when it opens',
    '(k) dialog "End" does not close on Escape',
  ] }, () => <Unhooked popup={false} />),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'End' }));
  },
};
export const ReadsOpenDrawsNothing = probe({ owner: true, rules: ['k'], expect: ['(k) "End" reads open but draws no dialog'] },
  () => <NeverOpens />);
/** A modal dialog with a control beside it that still takes a tap: that
 *  control is out of Tab's reach while it is open (#674's Not saved bar). */
export const ModalBesideAControl = probe({ owner: true, rules: ['g', 'k'], expect: [
  '(g) "Retry" is not reached by Tab',
  '(k) dialog "End" is marked modal, but 1 control(s) beside it still take a tap',
  '(k) dialog "End" does not close on Escape',
] }, () => <ModalWithBar />);
/** Closing took the trigger away (an End confirmed ends what it was drawn on):
 *  focus goes to the nearest heading that is still there, not the page. */
export const TriggerGoneAtClose: Story = {
  ...probe({ owner: true, rules: ['k'], expect: [] }, () => <EndsItself />),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'End' }));
    await waitFor(() => expect(canvas.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement));
    await userEvent.click(canvas.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(document.activeElement).toBe(canvas.getByRole('heading', { name: 'Changes' })));
  },
};

function CoveredByScrim() {
  const ref = useDialogFocus<HTMLElement>(true);
  return <>
    <button type="button" data-role="text" style={{ height: 44, width: 44 }}><svg aria-hidden="true" width="10" height="10" /></button>
    <div className="ui-scrim" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)' }}>
      <section ref={ref} role="dialog" aria-label="End" style={{ background: 'var(--wk-surface)', padding: 16 }}>
        <Plain label="Cancel" />
      </section>
    </div>
  </>;
}

function UnderBar({ hit }: { hit: 'over' | 'button' }) {
  return (
    <div data-scroll="page" style={{ height: 300, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      {hit === 'over' && <style>{'.gate-hit { position: relative; } .gate-hit::after { content: ""; position: absolute; '
        + 'z-index: 1; inset: -6px 0; }'}</style>}
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} style={{ height: 40, flex: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
          {hit === 'over'
            ? <button type="button" data-role="secondary" className="gate-hit" style={{ height: 32 }}>End</button>
            : <><Button kind="secondary" label="End" /><Button kind="text" label="Snooze" /></>}
        </div>
      ))}
      <div style={{ position: 'sticky', bottom: 0, flex: 'none', paddingTop: 24, background: 'var(--wk-canvas)' }}>
        {hit === 'over' ? <Plain label="Retry" style={{ height: 32 }} /> : <Button kind="text" label="Retry" />}
      </div>
    </div>
  );
}

function Unhooked({ popup }: { popup: boolean }) {
  const [open, set] = useState(false);
  return <>
    <Plain label="End" popup={popup} open={open} onClick={() => set(true)} />
    {open && <section role="dialog" aria-label="End"><Plain label="Cancel" onClick={() => set(false)} /></section>}
    <Plain label="Snooze" />
  </>;
}

function NeverOpens() {
  const [open, set] = useState(false);
  return <><Plain label="End" popup open={open} onClick={() => set(true)} /><Plain label="Snooze" /></>;
}

function ModalWithBar() {
  const ref = useDialogFocus<HTMLElement>(true);
  return <>
    <Plain label="Retry" />
    <section ref={ref} role="dialog" aria-label="End"><Plain label="Cancel" /></section>
  </>;
}

/** A screen-like story whose End dialog, confirmed, removes the End button. */
function EndsItself() {
  const [open, setOpen] = useState(false);
  const [ended, setEnded] = useState(false);
  const ref = useDialogFocus<HTMLElement>(open);
  return (
    <section>
      <h1>Changes</h1>
      {!ended && <article>
        <Plain label="End" popup open={open} onClick={() => setOpen(true)} />
        {open && (
          <div className="ui-scrim" style={{ position: 'fixed', inset: 0 }}
            onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}>
            <section ref={ref} role="dialog" aria-label="End">
              <Plain label="Done" onClick={() => { setEnded(true); setOpen(false); }} />
            </section>
          </div>
        )}
      </article>}
    </section>
  );
}
