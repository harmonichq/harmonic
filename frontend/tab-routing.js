// Hash-tab routing stays Vue-free so both initial load and hashchange use the
// same migration and the fallback can be covered without a browser.
export const TABS = [
  // #248 (ADR 0027): Daily report + Model view merged into one Day surface.
  // #246 (ADR 0027): Diagnose fused Recommendations + Patterns into one queue;
  // #495 rebuilt that queue as the Settings audit clock-workspace surface —
  // the tab keeps its Diagnose name (maintainer call) and its `diagnose` id.
  { id: 'day', label: 'Day' },
  { id: 'diagnose', label: 'Diagnose' },
  { id: 'verify', label: 'Verify' },       // #245: Outcomes → Verify
  { id: 'plan', label: 'Plan' },
  // Keep the destination's established accessible label. The #634 cockpit
  // footer uses the shorter visible "Settings" label without changing its id.
  { id: 'settings', label: 'App settings' },
  { id: 'guide', label: 'Guide' },
];

const DEFAULT_TAB = 'diagnose';
const TAB_IDS = new Set(TABS.map((tab) => tab.id));

export function resolveTab(tab) {
  const migrated = (tab === 'dashboard' || tab === 'pump' || tab === 'review' || tab === 'patterns') ? 'diagnose'
    : (tab === 'daily' || tab === 'modelview') ? 'day'
    : tab === 'outcomes' ? 'verify'
    : tab;
  return TAB_IDS.has(migrated) ? migrated : DEFAULT_TAB;
}
