import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { App, type Live } from './App';
import { createLive } from './live.js';

// The app itself (#651, #652, #653): the live adapter over a fake client, so a
// play drives how the app marks a screen as its reads land, fail or catch up.
// The screens draw the stories' generated answers, as every story does; the
// fake client's answers only settle each read. A read none of these stories
// makes (the Queue's, which the app opens on) never answers, so the Queue
// shows its skeleton until the play opens the Overview from the rail.
const meta: Meta<typeof App> = {
  title: 'App/Reads',
  component: App,
  parameters: { frame: { width: 1440, height: 900, padding: 0 } },
};
export default meta;

type Story = StoryObj<typeof App>;

const EARLIER = { input_data_age: { revision: 1, covers_to: '2026-01-01 00:00:00' } };
const later = <T,>(ms: number, value: T) => new Promise<T>((resolve) => { setTimeout(() => resolve(value), ms); });

/** The Overview's reads and the badges, each answered unless `reads` answers it; any other read never answers. */
function client(reads: Record<string, (window: number) => Promise<unknown>> = {}) {
  const answered: Record<string, (window: number) => Promise<unknown>> = {
    fetchStatus: async () => ({ last_attempt_at: null, last_success_at: null, last_error: null }),
    fetchPrompts: async () => [],
    fetchOutcomes: async () => ({}),
    fetchExploreTimeOfDay: async () => ({}),
    fetchAnalysis: async () => ({ basal: [], ic_blocks: [] }),
    fetchMealSize: async () => ({ window: null, sizes: [] }),
    fetchInsulin: async () => ({ window: null, delivery_days: 0 }),
    ...reads,
  };
  return new Proxy(answered, { get: (all, name: string) => all[name] ?? (() => new Promise(() => {})) });
}

const unavailable = (canvas: HTMLElement) => within(canvas).queryByText('Unavailable', { exact: true });
const openOverview = (canvas: HTMLElement) =>
  userEvent.click(within(canvas).getByRole('button', { name: /Overview/ }));

// #652: the Overview drawn from an earlier visit, whose metrics cannot be read
// again, stays marked when its glucose profile lands after the failure.
const remembered = createLive({
  client: client({
    fetchOutcomes: () => Promise.reject(new Error('refused')),
    fetchExploreTimeOfDay: () => later(300, {}),
  }),
  glossary: [],
  memory: { load: () => ({ tabs: ['overview'], answers: {} }), save: () => undefined },
}) as Live;
export const FailedReadStaysMarked: Story = {
  args: { live: remembered },
  play: async ({ canvasElement }) => {
    await openOverview(canvasElement);
    await waitFor(() => expect(unavailable(canvasElement)).not.toBeNull());
    await later(600, null);
    await expect(unavailable(canvasElement), 'the profile landing leaves the failed metrics marked').not.toBeNull();
  },
};

// #653: a window switched to whose read fails marks the screen Unavailable with Retry.
const windowRefused = createLive({
  client: client({
    fetchInsulin: (window) => (window === 30 ? Promise.reject(new Error('no answer'))
      : Promise.resolve({ window: null, delivery_days: 0 })),
  }),
  glossary: [],
}) as Live;
export const FailedWindowIsUnavailable: Story = {
  args: { live: windowRefused },
  play: async ({ canvasElement }) => {
    await openOverview(canvasElement);
    const thirty = await within(canvasElement).findByRole('button', { name: '30 d' });
    await expect(unavailable(canvasElement)).toBeNull();
    await userEvent.click(thirty);
    await waitFor(() => expect(unavailable(canvasElement)).not.toBeNull());
    await expect(within(canvasElement).getByRole('button', { name: 'Retry' })).toBeVisible();
  },
};

// #651: a catch-up stopped while the page was hidden goes on once it is shown,
// and the mark clears by itself once the answers are current.
const page = { shown: false, current: false };
const resumed = createLive({
  client: client({
    fetchInsulin: async (window) => ({ window: null, delivery_days: 0, ...(window === 14 && !page.current ? EARLIER : {}) }),
  }),
  glossary: [],
  visible: () => page.shown,
  pause: () => later(10, undefined),
}) as Live;
export const CatchUpResumesWhenShown: Story = {
  args: { live: resumed },
  play: async ({ canvasElement }) => {
    await openOverview(canvasElement);
    await waitFor(() => expect(unavailable(canvasElement)).not.toBeNull());
    await later(200, null);
    await expect(unavailable(canvasElement), 'nothing is read again while the page is hidden').not.toBeNull();
    page.current = true;
    page.shown = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(unavailable(canvasElement)).toBeNull(), { timeout: 3000 });
  },
};
