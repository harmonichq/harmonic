// #447 browser half: render the dock's view and Changes' Watch maturity over the
// served payloads docs/scope/447-day-count.repro.py dumped, through the shipped
// modules themselves (both are DOM-free). Exits 1 when the two printers print
// different day counts for the one served Trial, 0 when they agree.
import { readFileSync } from 'node:fs';
import { watchDockView } from '../../frontend/watched-change-dock.js';
import { maturitySection } from '../../frontend/follow-up.js';

const served = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const dock = watchDockView({ watched: served.dock });
const dockText = dock.detail.map((part) => part.text ?? part.strong).join('');
const figureHtml = maturitySection(served.changes).match(/<div class="gf-figure">(.*?)<\/div>/)[1];
const changesText = figureHtml.replace(/<small>/, ' · ').replace(/<[^>]+>/g, '');
// The first number each surface prints is its day count.
const dockCount = Number(dockText.match(/(\d+)/)[1]);
const changesCount = Number(changesText.match(/(\d+)/)[1]);
console.log(JSON.stringify({
  served_days_elapsed: served.changes.maturing.days_elapsed,
  served_days_required: served.changes.maturing.days_required,
  dock: dockText,
  changes: changesText,
  dock_count: dockCount,
  changes_count: changesCount,
  agree: dockCount === changesCount,
}, null, 1));
process.exit(dockCount === changesCount ? 0 : 1);
