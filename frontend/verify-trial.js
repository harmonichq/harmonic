// Verify's one crossing into Plan (#588).
//
// The Decision/Proof workbench this module used to format was retired with the
// Verify workstation port (#660) — the locked surface renders backend values
// directly, so the label/format adapters went with it. What survives is the one
// piece that is not formatting: Verify owns the decision boundary, Plan owns
// manual programming and fresh-snapshot confirmation, so Revert forwards the
// server's route rather than deriving a setting in the browser.

export function planRevertIntent(route) {
  const draft = route && route.mode === 'stage-prior' && route.draft ? route.draft : null;
  return {
    draft,
    guidance: [route && route.message,
      !draft && 'No prior setting was staged for this Verify action. Any existing Plan draft was left unchanged.']
      .filter(Boolean).join(' '),
  };
}
