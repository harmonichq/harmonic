// The Settings screens' data, read from the served answers (#483). As with the
// other models, every number a Settings row prints is a Sourced value naming
// its field; the account's email arrives already masked from the generator,
// and nothing here invents a state.
import { answers, sourced, type Format, type Sourced } from './answers';

/** How the pump profile prints each setting, and so every screen that prints
 *  one: basal in U/h to two decimals (the engine serves no pump increment),
 *  ISF and the target in whole mg/dL, I:C to one decimal. */
export const PARAMETER_FORMATS: Record<'basal_rate' | 'isf' | 'carb_ratio' | 'target_bg', Format> = {
  basal_rate: 'fixed2', isf: 'round', carb_ratio: 'fixed1', target_bg: 'round',
};

/** The units each profile setting is printed in, under its column header: fixed by how the pump
 *  stores them, so the table never waits on the guidance to name them. */
export const PARAMETER_UNITS: Record<'basal_rate' | 'isf' | 'carb_ratio', string> = {
  basal_rate: 'U/h', isf: 'mg/dL/U', carb_ratio: 'g/U',
};

/** Each profile setting's name, the glossary's short form (§1.5 Basal, ISF,
 *  I:C), wherever a screen names one: the profile's columns, and Changes. */
export const PARAMETER_NAMES: Record<'basal_rate' | 'isf' | 'carb_ratio', string> = {
  basal_rate: 'Basal', isf: 'ISF', carb_ratio: 'I:C',
};

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

type Status = { last_attempt_at: string | null; last_error: string | null };

/** Whether a sync status says its last attempt failed; null before any attempt. */
const lastFailed = (served: Status) => (served.last_attempt_at ? served.last_error !== null : null);

/** The last sync failed: the Settings alert on every screen's NavBar (§1.1). */
export const syncFailed = () => lastFailed(answers.status.ok) === true;

export function tandemSource(sync: SyncState | null, account: AccountState): TandemSourceData {
  const status = sync ? `settings.status.${sync}` : 'status.ok';
  const served = sync ? answers.settings.status[sync] : answers.status.ok;
  // Before the account has been read there is none; the screen draws nothing from it until it is.
  const credentials = answers.settings.credentials[account] ?? { configured: false, email: null, region: null };
  return {
    failed: lastFailed(served),
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
  /** When the profile was read. */
  fetched: When;
  dia: Sourced<number>;
  maxBolus: Sourced<number>;
  target: Sourced<number>;
  segments: PumpSegment[];
} | null;

type PumpStore = keyof typeof answers.settings.pump_settings;

export function pumpProfile(store: PumpStore): PumpProfileData {
  const answer = answers.settings.pump_settings[store] as
    { configured: boolean; profile?: { name: string; segments: unknown[] } };
  if (!answer.configured || !answer.profile) return null;
  const root = `settings.pump_settings.${store}`;
  return {
    name: answer.profile.name,
    fetched: when(`${root}.fetched_at`),
    dia: sourced(`${root}.profile.dia_hours`, 'round'),
    maxBolus: sourced(`${root}.profile.max_bolus`, 'round'),
    // The engine serves a target per segment; the profile line shows the first's.
    target: sourced(`${root}.profile.segments.0.target_bg`, PARAMETER_FORMATS.target_bg),
    segments: answer.profile.segments.map((_, i) => {
      const path = `${root}.profile.segments.${i}`;
      return {
        start: sourced(`${path}.start_min`, 'clock'),
        basal: sourced(`${path}.basal_rate`, PARAMETER_FORMATS.basal_rate),
        isf: sourced(`${path}.isf`, PARAMETER_FORMATS.isf),
        carbRatio: sourced(`${path}.carb_ratio`, PARAMETER_FORMATS.carb_ratio),
      };
    }),
  };
}

export type GlossaryEntry = { term: string; meaning: string };

export const glossary = (): GlossaryEntry[] => answers.glossary.map(({ term, meaning }) => ({ term, meaning }));
