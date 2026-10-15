// The answers remembered in this browser (#522), so a page refresh draws the
// last answers at once while the engine is read again behind them.
//
// Only this person's own server's answers, kept in their own browser, under a
// key made of the build and a hash of the API token the answers were read
// under: a new build (a new answer shape) or another token never reads them,
// and saving drops every other key. Storage that refuses access (a private
// window, blocked site data, a full quota) keeps nothing, and the app reads the
// engine as it always did.
//
// Plain JS, DOM-free at import time; the adapter takes it injected.

const PREFIX = 'harmonic.answers:';
/** The days kept, the latest read: a day's timeline is the largest answer. */
const DAYS_KEPT = 7;

/** FNV-1a, 32-bit: a key, not a secret (the token itself is kept beside it). */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * @param {{ storage: Storage | undefined, build: string, token: () => string | null }} deps
 *   `token` is read at every call, so a token saved later keys what follows.
 */
export function createMemory({ storage, build, token }) {
  const key = () => `${PREFIX}${hash(build)}:${hash(token() ?? '')}`;

  function load() {
    try {
      const kept = storage?.getItem(key());
      return kept ? JSON.parse(kept) : null;
    } catch {
      return null;
    }
  }

  function save({ tabs, answers }) {
    const { glossary, ...rest } = answers;
    const days = Object.keys(rest.day.days).slice(-DAYS_KEPT);
    const kept = { ...rest, day: { ...rest.day, days: Object.fromEntries(days.map((iso) => [iso, rest.day.days[iso]])) } };
    const current = key();
    try {
      for (let i = storage.length - 1; i >= 0; i -= 1) {
        const other = storage.key(i);
        if (other?.startsWith(PREFIX) && other !== current) storage.removeItem(other);
      }
      storage.setItem(current, JSON.stringify({ tabs, answers: kept }));
    } catch {
      try { storage?.removeItem(current); } catch {}
    }
  }

  return { load, save };
}
