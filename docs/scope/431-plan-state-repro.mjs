// #431 browser half: replay plan-view.js's reconcile()/phase() arithmetic over
// the served payloads repro_431.py dumped. plan-view.js itself imports DOM
// modules, so this transcribes its three private lines verbatim.
import { readFileSync } from 'node:fs';
import { buildDeliverable, reconcileDeliverable } from '../../frontend/plan.js';

const results = JSON.parse(readFileSync(process.argv[2], 'utf8'));
for (const r of results) {
  const records = r.browser.history.filter((x) => x.withdrawal?.state !== 'available');
  const pendingRecord = records.find((x) => x.reconciliation?.state !== 'available' && x.withdrawal?.state !== 'available') || null;
  const pump = r.browser.pump;
  const rows = buildDeliverable({ activeProfile: pendingRecord?.deliverable?.source_profile || pump.profile, acceptedItems: pendingRecord?.items || [] });
  const decidedAt = (pendingRecord || records.at(-1))?.applied_at;
  const readAt = String(pump.fetched_at || '').replace('T', ' ');
  const result = decidedAt && readAt <= decidedAt ? { state: 'pending' }
    : reconcileDeliverable(rows, pump.profile?.segments || null, pump.fetched_at, records.length > 0);
  const phase = pendingRecord ? (result.state === 'confirmed' ? 'On pump' : result.state === 'mismatch' ? 'Mismatch' : 'Pending') : records.length ? 'On pump' : null;
  console.log(JSON.stringify({ label: r.label, server_pending: r.server_pending_plan_id, browser_phase: phase, browser_state: result.state, matchedAt: result.matchedAt, disposition: r.guidance_disposition, focus_reason: r.focus_pin.reason }));
}

// Theory item: a reconciled Plan plus a newer draft that differs from the pump.
// plan-view.js with no pending record: rows() builds from the draft over the
// detected profile, and reconcile() passes records().length > 0 as committed.
const r = results[0];
const profile = r.browser.pump.profile;
const seg = profile.segments[0];
const draft = [{ type: 'basal', start_min: seg.start_min, value: Math.round((seg.basal_rate + 0.1) * 1000) / 1000 }];
const reconciledHistory = [{ ...r.browser.history[0], reconciliation: { state: 'available' } }];
const rows2 = buildDeliverable({ activeProfile: profile, acceptedItems: draft });
const res2 = reconcileDeliverable(rows2, profile.segments, r.browser.pump.fetched_at, reconciledHistory.length > 0);
console.log(JSON.stringify({ label: 'theory: reconciled Plan + newer differing draft', phase: 'On pump' /* records().length, no pending */, status_state: res2.state, cells: res2.groups.flatMap((g) => g.cells.map((c) => `${g.label} ${c.param} ${c.planned}->${c.actual}`)) }));
