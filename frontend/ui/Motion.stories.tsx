import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fixtures, sourced } from './fixtures';
import { Button } from './components/Button/Button';
import { ChangesScreen } from './screens/Changes/ChangesScreen';
import { DayScreen } from './screens/Day/DayScreen';
import { QueueScreen } from './screens/Queue/QueueScreen';

// The library's motion (tokens.css, motion.ts), one story per motion, each on
// the screen it ships in. Replay, outside the frame, starts the screen again at
// rest and runs the motion through the screen's own control, so what moves is
// what ships. Reduced motion holds [data-motion-reduce] on the stage, the state
// prefers-reduced-motion puts the whole library in, and replays any of them.

type Frame = { width: number; height: number; padding: number };
const PHONE: Frame = { width: 390, height: 844, padding: 0 };
const DESKTOP: Frame = { width: 1440, height: 900, padding: 0 };

const frame = () => new Promise((done) => requestAnimationFrame(() => done(undefined)));
const pause = (ms: number) => new Promise((done) => window.setTimeout(done, ms));

/** The screen's own control, by its visible label or accessible name. */
function control(stage: HTMLElement, label: string, within = 'button'): HTMLElement {
  const found = [...stage.querySelectorAll<HTMLElement>(within)]
    .find((element) => element.textContent?.trim() === label || element.getAttribute('aria-label') === label);
  if (!found) throw new Error(`no ${label} on the stage`);
  return found;
}

/** A finger drawn across a row: down, along the path, up. */
async function drag(target: HTMLElement, path: number[]) {
  const box = target.getBoundingClientRect();
  const y = box.top + box.height / 2;
  const at = (x: number) => ({ bubbles: true, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y });
  const x0 = box.left + box.width * 0.7;
  target.dispatchEvent(new PointerEvent('pointerdown', at(x0)));
  for (const dx of path) {
    await frame();
    target.dispatchEvent(new PointerEvent('pointermove', at(x0 + dx)));
  }
  target.dispatchEvent(new PointerEvent('pointerup', at(x0 + path[path.length - 1])));
}
const along = (to: number, steps = 14) => Array.from({ length: steps }, (_, i) => (to * (i + 1)) / steps);

type Motion = { name: string; frame: Frame; screen: () => ReactNode; run: (stage: HTMLElement) => Promise<void> };

const snooze = { subject: fixtures.snooze.subject, after: 'wearer-pinned-snoozed', until: sourced<string>('snooze.decided_at', 'until') } as const;

const MOTIONS = {
  sheet: {
    name: 'Sheet',
    frame: PHONE,
    screen: () => <DayScreen layout="phone" store="wearer" />,
    run: async (stage) => { control(stage, '+ Log carbs').click(); },
  },
  popover: {
    name: 'Popover',
    frame: DESKTOP,
    screen: () => <DayScreen layout="desktop" store="wearer" />,
    run: async (stage) => { control(stage, '+ Log carbs').click(); },
  },
  drillDown: {
    name: 'Drill-down',
    frame: PHONE,
    screen: () => <QueueScreen layout="phone" store="wearer-pinned-snoozed" />,
    run: async (stage) => {
      stage.querySelector<HTMLElement>('.ui-queue__list .ui-row--open')!.click();
      await pause(900);
      stage.querySelector<HTMLElement>('.ui-header__back')!.click();
    },
  },
  expand: {
    name: 'Expand',
    frame: PHONE,
    screen: () => <QueueScreen layout="phone" store="wearer" />,
    run: async (stage) => { stage.querySelector<HTMLElement>('.ui-queue__list .ui-qrow')!.click(); },
  },
  disclosure: {
    name: 'Disclosure',
    frame: PHONE,
    screen: () => <ChangesScreen layout="phone" store="wearer-ended-pinned" />,
    run: async (stage) => { stage.querySelector<HTMLElement>('.ui-row[aria-expanded]')!.click(); },
  },
  swipe: {
    name: 'Snooze swipe',
    frame: PHONE,
    screen: () => <QueueScreen layout="phone" store="wearer" />,
    run: async (stage) => {
      const row = () => stage.querySelector<HTMLElement>('.ui-queue__list .ui-qrow')!;
      await drag(row(), along(-64));
      await pause(900);
      await drag(row(), along(56, 10));
    },
  },
  bar: {
    name: 'Transient bar',
    frame: PHONE,
    screen: () => <QueueScreen layout="phone" store="wearer-pinned" open={fixtures.snooze.subject} snooze={snooze} />,
    run: async (stage) => { control(stage, 'Snooze').click(); },
  },
  month: {
    name: 'Month',
    frame: PHONE,
    screen: () => <DayScreen layout="phone" store="wearer" />,
    run: async (stage) => { stage.querySelector<HTMLElement>('.ui-header__day')!.click(); },
  },
  nextPrompt: {
    name: 'Next prompt',
    frame: PHONE,
    screen: () => <DayScreen layout="phone" store="wearer-pending" view="prompts" />,
    run: async (stage) => { control(stage, 'No').click(); },
  },
  recorded: {
    name: 'Recorded',
    frame: PHONE,
    screen: () => <DayScreen layout="phone" store="wearer-pending" view="prompts" />,
    run: async (stage) => { control(stage, 'Yes').click(); },
  },
  skeleton: {
    name: 'Skeleton',
    frame: PHONE,
    screen: () => <QueueScreen layout="phone" store="wearer" state="loading" />,
    run: async () => {},
  },
  press: {
    name: 'Button press',
    frame: { width: 390, height: 240, padding: 16 },
    screen: () => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
        <Button kind="primary" label="Pin" />
        <Button kind="secondary" label="Restore" />
        <Button kind="text" label="Snooze" />
      </div>
    ),
    run: async (stage) => {
      stage.classList.add('sb-pressed');
      await pause(160);
      stage.classList.remove('sb-pressed');
    },
  },
} satisfies Record<string, Motion>;

type Name = keyof typeof MOTIONS;
const PHONE_MOTIONS = (Object.keys(MOTIONS) as Name[]).filter((name) => MOTIONS[name].frame === PHONE);

const CONTROLS: React.CSSProperties = {
  position: 'fixed', right: 16, bottom: 16, display: 'flex', alignItems: 'center', gap: 12, padding: 8,
  border: '1px solid var(--wk-rule)', borderRadius: 'var(--wk-radius)', background: 'var(--wk-surface)',
  color: 'var(--wk-ink)', font: '13px var(--ui-font)', zIndex: 10,
};

/** One motion on its screen: Replay starts the screen again at rest and runs the motion. */
function Stage({ initial, picker = false, reducedFirst = false }: { initial: Name; picker?: boolean; reducedFirst?: boolean }) {
  const [name, setName] = useState(initial);
  const [take, setTake] = useState(0);
  const [reduced, setReduced] = useState(reducedFirst);
  const stage = useRef<HTMLDivElement>(null);
  const motion = MOTIONS[name];
  useEffect(() => {
    if (take === 0) return;
    // Two frames: the screen has drawn and opened its motion gate.
    void frame().then(frame).then(() => motion.run(stage.current!));
  }, [take]);
  return (
    <>
      <div key={`${name}-${take}`} ref={stage} data-motion-reduce={reduced ? '' : undefined} style={{ height: '100%' }}>
        {motion.screen()}
      </div>
      {createPortal(
        <div style={CONTROLS}>
          {picker && (
            <>
              <select value={name} onChange={(event) => { setName(event.currentTarget.value as Name); setTake(0); }}>
                {PHONE_MOTIONS.map((each) => <option key={each} value={each}>{MOTIONS[each].name}</option>)}
              </select>
              <label><input type="checkbox" checked={reduced} onChange={(event) => setReduced(event.currentTarget.checked)} /> Reduced motion</label>
            </>
          )}
          <button type="button" onClick={() => setTake((n) => n + 1)}>Replay</button>
        </div>,
        document.body,
      )}
    </>
  );
}

const meta = {
  title: 'Foundations/Motion',
  component: Stage,
} satisfies Meta<typeof Stage>;
export default meta;

type Story = StoryObj<typeof meta>;

const story = (initial: Name) => ({
  args: { initial },
  parameters: { frame: MOTIONS[initial].frame },
});

export const Sheet: Story = { ...story('sheet'), name: 'Sheet' };
export const Popover: Story = { ...story('popover'), name: 'Popover' };
export const DrillDown: Story = { ...story('drillDown'), name: 'Drill-down' };
export const Expand: Story = { ...story('expand'), name: 'Expand' };
export const Disclosure: Story = { ...story('disclosure'), name: 'Disclosure' };
export const SnoozeSwipe: Story = { ...story('swipe'), name: 'Snooze swipe' };
export const TransientBar: Story = { ...story('bar'), name: 'Transient bar' };
export const Month: Story = { ...story('month'), name: 'Month' };
export const NextPrompt: Story = { ...story('nextPrompt'), name: 'Next prompt' };
export const Recorded: Story = { ...story('recorded'), name: 'Recorded' };
export const Skeleton: Story = { ...story('skeleton'), name: 'Skeleton' };
export const ButtonPress: Story = { ...story('press'), name: 'Button press' };
export const ReducedMotion: Story = {
  name: 'Reduced motion',
  args: { initial: 'sheet', picker: true, reducedFirst: true },
  parameters: { frame: PHONE },
};
