// The Settings screens' data, read from the served answers (#483). As with the
// other models, every number a Settings row prints is a Sourced value naming
// its field; the account's email arrives already masked from the generator,
// and nothing here invents a state.
import { fixtures, sourced, type Sourced } from './fixtures';

export type SyncState = 'synced' | 'failed';
export type AccountState = 'set' | 'unset';

/** A sync time, printed as its date and its clock. */
export type When = { date: Sourced<string>; time: Sourced<string> };

const when = (path: string): When => ({ date: sourced(path, 'date'), time: sourced(path, 'time') });

export type TandemSourceData = {
  /** Null before any sync was attempted. */
  failed: boolean | null;
  lastSuccess: When | null;
  lastAttempt: When | null;
  error: string | null;
  data: { from: Sourced<string>; to: Sourced<string>; days: Sourced<number> } | null;
  account: { configured: boolean; email: string | null; region: string | null };
};

export function tandemSource(sync: SyncState | null, account: AccountState): TandemSourceData {
  const status = sync ? `settings.status.${sync}` : 'status.ok';
  const served = sync ? fixtures.settings.status[sync] : fixtures.status.ok;
  const credentials = fixtures.settings.credentials[account];
  return {
    failed: served.last_attempt_at ? served.last_error !== null : null,
    lastSuccess: served.last_success_at ? when(`${status}.last_success_at`) : null,
    lastAttempt: served.last_attempt_at ? when(`${status}.last_attempt_at`) : null,
    error: served.last_error,
    data: served.earliest_data_day ? {
      from: sourced(`${status}.earliest_data_day`, 'date'),
      to: sourced(`${status}.latest_data_day`, 'date'),
      days: sourced(`${status}.data_day_count`),
    } : null,
    account: { configured: credentials.configured, email: credentials.email, region: credentials.region },
  };
}

export type PumpSegment = {
  start: Sourced<number>; basal: Sourced<number>; isf: Sourced<number>; carbRatio: Sourced<number>;
};

export type PumpProfileData = {
  name: string;
  fetched: Sourced<string>;
  dia: Sourced<number>;
  maxBolus: Sourced<number>;
  target: Sourced<number>;
  segments: PumpSegment[];
} | null;

type PumpStore = keyof typeof fixtures.settings.pump_settings;

export function pumpProfile(store: PumpStore): PumpProfileData {
  const answer = fixtures.settings.pump_settings[store] as
    { configured: boolean; profile?: { name: string; segments: unknown[] } };
  if (!answer.configured || !answer.profile) return null;
  const root = `settings.pump_settings.${store}`;
  return {
    name: answer.profile.name,
    fetched: sourced(`${root}.fetched_at`, 'date'),
    dia: sourced(`${root}.profile.dia_hours`, 'round'),
    maxBolus: sourced(`${root}.profile.max_bolus`, 'round'),
    // The engine serves a target per segment; the profile line shows the first's.
    target: sourced(`${root}.profile.segments.0.target_bg`),
    segments: answer.profile.segments.map((_, i) => {
      const path = `${root}.profile.segments.${i}`;
      return {
        start: sourced(`${path}.start_min`, 'clock'),
        basal: sourced(`${path}.basal_rate`, 'fixed2'),
        isf: sourced(`${path}.isf`),
        carbRatio: sourced(`${path}.carb_ratio`, 'fixed1'),
      };
    }),
  };
}

export type GlossaryEntry = { term: string; meaning: string };

export const glossary = (): GlossaryEntry[] => fixtures.glossary.map(({ term, meaning }) => ({ term, meaning }));
