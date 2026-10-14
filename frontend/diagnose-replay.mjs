// The Diagnose replay helpers the desk's suites share.
//
// #416 — these were the desk's last reach into v1's two behaviour replays. The
// surviving tree imported fifteen exports from
// frontend/diagnose-workstation-behavior.replay.mjs and
// frontend/diagnose-event-comparison-behavior.replay.mjs, and those two files
// retire with v1. Every one of the fifteen is copied here verbatim, together
// with everything each of them calls. The one edit is the `export` keyword: a
// helper no surviving caller names is this module's own, so it is not handed
// out.
//
// The desk seats the same shipped Diagnose workstation v1 seated, so these
// assertions read the DOM they have always read.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { waitForReplayAssertion } from './replay-assertions.mjs';
import { projectPatternCaseFile } from '../mockups/diagnose-event-comparison.synthetic/project.mjs';

/* ----------------------------------------------- evidence capture */

const evidenceDir = process.env.DIAGNOSE_EVIDENCE_DIR || null;

const evidenceViewport = () => process.env.VIEWPORT || '1440x900';

export async function captureEvidence(page, label) {
  if (!evidenceDir) return;
  const expected = evidenceViewport().split('x').map(Number);
  const viewport = page.viewportSize();
  if (!viewport || viewport.width !== expected[0] || viewport.height !== expected[1]) {
    fail(`evidence viewport for ${label}: expected ${evidenceViewport()}, got ${viewport
      ? `${viewport.width}x${viewport.height}` : 'unavailable'}`);
  }
  await mkdir(evidenceDir, { recursive: true });
  const image = await page.screenshot({
    path: join(evidenceDir, `${label}-${evidenceViewport()}.png`),
    fullPage: false,
  });
  const actual = [image.readUInt32BE(16), image.readUInt32BE(20)];
  if (actual[0] !== expected[0] || actual[1] !== expected[1]) {
    fail(`evidence PNG for ${label}: expected ${evidenceViewport()}, got ${actual.join('x')}`);
  }
  console.log(`evidence ${label}: viewport ${viewport.width}x${viewport.height}; PNG ${actual.join('x')}`);
}

/* ---------------------------------------------------------------- assertions */

class ReplayError extends Error {}

const fail = (msg) => { throw new ReplayError(msg); };

const is = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) fail(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
};

const ok = (cond, what) => { if (!cond) fail(what); };

const near = (got, want, tol, what) => {
  if (!(Math.abs(got - want) <= tol)) fail(`${what}: ${got} not within ${tol} of ${want}`);
};

/** The brace is a plot-only clock gate. Its visual edge and the chart's edge
    gesture both stop at the glucose x-axis, above the click-only basal strip. */
const assertGateContained = async (page, story) => {
  const { geometry } = await waitForReplayAssertion(async seen => {
    const geometry = seen(await page.evaluate(() => {
      const chart = document.getElementById('chart').getBoundingClientRect();
      const lane = document.getElementById('lane').getBoundingClientRect();
      const plotTop = chart.top + 20;
      const plotBottom = chart.bottom - 26;
      return {
        plotTop,
        plotBottom,
        laneTop: lane.top,
        edges: ['brace-a', 'brace-b'].map((id) => {
          const r = document.getElementById(id).getBoundingClientRect();
          /* `installDrag` is chart-owned and rejects pointer rows outside this
             same plot span, making this the effective whole-height hit zone. */
          return { id, left: r.left, top: r.top, bottom: r.bottom, hitTop: plotTop, hitBottom: plotBottom };
        }),
      };
    }));
    for (const edge of geometry.edges) {
      near(edge.top, geometry.plotTop, 1, `${story} ${edge.id} starts at the plot top`);
      near(edge.bottom, geometry.plotBottom, 1, `${story} ${edge.id} ends at the glucose x-axis`);
      near(edge.hitTop, geometry.plotTop, 1, `${story} ${edge.id} hit zone starts at the plot top`);
      near(edge.hitBottom, geometry.plotBottom, 1, `${story} ${edge.id} hit zone ends at the glucose x-axis`);
      ok(edge.bottom <= geometry.laneTop, `${story} ${edge.id} does not intersect the basal strip`);
      ok(edge.hitBottom <= geometry.laneTop, `${story} ${edge.id} hit zone does not intersect the basal strip`);
    }
    return { geometry };
  }, "assertGateContained");
  await page.mouse.move(geometry.edges[0].left, geometry.plotBottom + 4);
  await waitForReplayAssertion(async seen => {
    is((seen(await state(page))).cursor, 'crosshair',
      `${story} an edge below the glucose x-axis is not an active resize gate`);
  }, "assertGateContained");
};

// A loading=false level may still be translating during its 90ms push/pop.
// Geometry assertions wait for that presentation to finish, including re-renders
// after Watching expands. Do not wait for data here: S41 measures loading copy.
export const waitForLevelAnimations = page => page.waitForFunction(() => {
  const level = document.getElementById('level');
  return level && level.getAnimations().length === 0;
}, undefined, { timeout: 30000 });

/** One structured read of everything the stories assert on. */
const state = (page) => page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const txt = (s) => q(s)?.textContent.trim() ?? null;
  const display = (node) => node ? getComputedStyle(node).display : null;
  const rendered = (node) => node ? display(node) !== 'none' && node.getClientRects().length > 0 : false;
  const textLeft = (node) => {
    if (!node) return null;
    const range = document.createRange();
    range.selectNodeContents(node);
    return Math.round(range.getBoundingClientRect().left);
  };
  return {
    chip: q('#seg-window [data-follow]')?.textContent.replace('×', '').trim() || null,
    pressed: [...document.querySelectorAll('#seg-window button')]
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
      .map((b) => b.textContent.replace('×', '').trim()),
    crumb: [...document.querySelectorAll('#crumb-trail > *')]
      .map((n) => n.textContent.trim()).filter((t) => t !== '›'),
    crumbMeta: txt('#crumb-meta'),
    levelText: txt('#level'),
    scope: txt('#canvas-scope'),
    /* #62 — the case file's own head, and the line the panel prints when the
       finding the reader is standing on has no row in the selected window. */
    levelWho: q('#level .who')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
    levelStat: q('#level .statline')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
    levelEmpty: txt('#level .empty'),
    levelEmptyLeft: textLeft(q('#level .empty')),
    levelLoading: q('#level')?.dataset.loading ?? null,
    bandKeys: [...document.querySelectorAll('#level .vband .key .lead')].map((n) => n.textContent.trim()),
    pool: txt('#canvas-pool'),
    braceHidden: q('#brace')?.hidden ?? null,
    braceEdges: ['brace-a', 'brace-b'].map((id) => {
      const r = document.getElementById(id)?.getBoundingClientRect();
      return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom) } : null;
    }),
    gripA: parseFloat(q('#grip-a')?.style.left || 'NaN'),
    gripB: parseFloat(q('#grip-b')?.style.left || 'NaN'),
    live: ['brace-a', 'brace-b'].filter((i) => document.getElementById(i)?.classList.contains('live')),
    readout: q('#brace-readout')?.hidden ? null : (q('#brace-readout')?.textContent.trim() ?? null),
    panOffset: Number(q('#chart')?.parentElement?.dataset.clockPan || 0),
    badge: txt('#plan-badge'),
    /* #735 — `#inspector-meta` is GONE (lock term 47): the pane header's staged
       status named only the Plan branch of a four-branch object, so it could read
       "nothing staged" while a Trial was being watched. The dock below is the single
       reporter now, and story S16's header assertion retires with it. */
    dock: (() => {
      const w = q('.inspector > .watch');
      if (!w) return null;
      const how = w.querySelector('.how');
      return {
        state: w.dataset.state ?? null,
        kind: w.querySelector('.kind')?.textContent.trim() ?? null,
        what: w.querySelector('.what')?.textContent.trim() ?? null,
        how: how?.textContent.trim() ?? null,
        // term 49 — the detail line WRAPS and may never ellipsize
        howClipped: how ? how.scrollHeight > how.clientHeight + 1
          || how.scrollWidth > how.clientWidth + 1 : null,
        route: w.querySelector('.go')?.textContent.trim() ?? null,
        box: (() => { const r = w.getBoundingClientRect(); return { top: Math.round(r.top), height: Math.round(r.height) }; })(),
      };
    })(),
    // select-in-place (2026-08-19 revision): `.occ-head` can now stand ALONGSIDE
    // `.who` on the same factor level (P35 retired — no level swap clears one
    // away), so this can no longer be a single comma-list querySelector, which
    // would return whichever sits first in DOM order regardless of which one a
    // reader actually cares about. The occurrence's own header wins when a
    // selection stands; otherwise it falls back to the level's own headline.
    levelHead: (q('#level .occ-head') || q('#level .slot-head') || q('#level .who'))
      ?.innerText.replace(/\s+/g, ' ').trim() ?? null,
    evRows: document.querySelectorAll('#level .ev-row').length,
    // The `data-counter` split retired with select-in-place (P35, ADR 31 part 5).
    evCounterGone: document.querySelectorAll('#level .ev-row[data-counter]').length,
    stage: q('#level .stagebtn')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
    stageStaged: q('#level .stagebtn')?.dataset.staged ?? null,
    filter: (() => {
      const wrap = q('#filter-wrap');
      const menu = q('#filter-menu');
      return {
        visible: rendered(wrap),
        open: rendered(menu),
        trigger: txt('#filter-trigger'),
        sift: [...document.querySelectorAll('#filter-menu [role="menuitemcheckbox"]')]
          .map((button) => ({
            text: button.getAttribute('aria-label'),
            checked: button.getAttribute('aria-checked'),
            disabled: button.disabled,
          })),
        view: [...document.querySelectorAll('#filter-menu [role="menuitemradio"]')]
          .map((button) => ({
            text: button.getAttribute('aria-label'),
            checked: button.getAttribute('aria-checked'),
            disabled: button.disabled,
          })),
      };
    })(),
    slotLink: q('#level .slotlink')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
    linkBtns: [...document.querySelectorAll('#level .slotlink .linkbtn')].map((b) => b.textContent.trim()),
    // #735 — level 1 is the findings queue (terms 34-45), not a factor grid over
    // three per-parameter entry rows
    queue: [...document.querySelectorAll('#level .qrow')].map((n) => ({
      title: n.querySelector('.lab')?.textContent.trim() ?? null,
      tag: n.querySelector('.tag')?.textContent.trim() ?? null,
      register: n.dataset.state ?? null,
      tier: n.dataset.tier ?? null,
      tagX: Math.round(n.querySelector('.tag')?.getBoundingClientRect().right ?? -1),
    })),
    queueLeft: q('#level .qrow .lab')
      ? Math.round(q('#level .qrow .lab').getBoundingClientRect().left) : null,
    levelScroll: q('#level')?.scrollTop ?? null,
    crumbLeft: q('#crumb-trail')
      ? Math.round(q('#crumb-trail').getBoundingClientRect().left) : null,
    queueSeam: txt('#level .tailnote'),
    queueEmpty: txt('#level .quiet-line'),
    // term 44 — no hairline between queue rows, in any state
    queueRules: [...document.querySelectorAll('#level .qrow')].filter((n) => {
      const s = getComputedStyle(n);
      return ['Top', 'Bottom'].some((side) => parseFloat(s[`border${side}Width`]) > 0);
    }).length,
    laneSelected: [...document.querySelectorAll('#lane button')].findIndex((b) => b.getAttribute('aria-pressed') === 'true'),
    laneCells: document.querySelectorAll('#lane button').length,
    basalPaint: [...document.querySelectorAll('#lane button:not([data-clock-copy])')].map((button) => {
      const style = getComputedStyle(button);
      return { backgroundColor: style.backgroundColor, boxShadow: style.boxShadow, opacity: style.opacity };
    }),
    laneKey: q('#lane-key')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
    hover: q('#canvas-head')?.dataset.hover ?? null,
    rd: {
      time: txt('#rd-time'), med: txt('#rd-med'), verdict: q('#rd-med')?.dataset.verdict ?? null,
      iqr: txt('#rd-iqr'), band: txt('#rd-band'), n: txt('#rd-n'), note: txt('#rd-note'),
      statsShown: q('#rd-p-med')?.style.display !== 'none',
    },
    cursor: q('#chart')?.style.cursor ?? null,
    hScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    vScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    advisoryFits: (() => { const a = q('.status .advisory'); return a ? a.scrollWidth <= a.clientWidth + 1 : null; })(),
    advisory: txt('.status .advisory'),
    rangeArtifacts: {
      scrub: Boolean(q('#scrub')),
      fill: Boolean(q('#scrub-fill')),
      titled: Boolean(q('[title*="Date range scrubber"]')),
      label: [...document.querySelectorAll('.instruments .cap')].some((n) => n.textContent.trim() === 'Range'),
      fourteenDayStrip: [...document.querySelectorAll('.instruments [data-label]')]
        .some((n) => /(^|\s)14 d($|\s)/.test(n.dataset.label || '')),
    },
  };
});

const plot = (page) => page.evaluate(() => {
  const r = document.getElementById('chart').getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});

const settle = (page, ms = 350) => page.waitForTimeout(ms);

/** Both browser routes answer Pattern coordinates from the requested preparation. */
export function patternCaseResponse(capture, url, window) {
  const id = url.searchParams.get('finding_id');
  if (!id?.startsWith('pattern:')) return null;
  return projectPatternCaseFile(capture, {
    patternChart: { key: id.slice('pattern:'.length), window },
    projectionId: url.searchParams.get('projection_id'),
    alignment: url.searchParams.get('alignment') || 'clock',
    occurrenceId: url.searchParams.get('occ'),
  });
}

const touchDrag = async (page, from, to, { end = 'up', steps = 1 } = {}) => {
  const session = await page.context().newCDPSession(page);
  const point = (x, y) => ({ x, y, id: 1, radiusX: 1, radiusY: 1, force: 1 });
  const inspectEnd = end === 'cancel' || end === 'lost-capture';
  if (inspectEnd) {
    await page.evaluate(() => {
      window.__diagnoseReplayPointerId = null;
      document.getElementById('chart').addEventListener('pointerdown', (event) => {
        window.__diagnoseReplayPointerId = event.pointerId;
      }, { once: true });
    });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(from.x, from.y)] });
  for (let step = 1; step <= steps; step += 1) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(
      from.x + (to.x - from.x) * step / steps,
      from.y + (to.y - from.y) * step / steps,
    )] });
  }
  const beforeEnd = inspectEnd ? await page.evaluate(() => {
    const chart = document.getElementById('chart');
    const pointerId = window.__diagnoseReplayPointerId;
    return {
      pointerId,
      captured: pointerId !== null && chart.hasPointerCapture(pointerId),
    };
  }) : null;
  if (end === 'cancel') {
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  } else if (end === 'lost-capture') {
    await page.evaluate((id) => {
      const chart = document.getElementById('chart');
      if (id !== null && chart.hasPointerCapture(id)) chart.releasePointerCapture(id);
    }, beforeEnd.pointerId);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await session.detach();
  return beforeEnd;
};

// LOCK:diagnose-workstation:6 LOCK:diagnose-workstation:8
export const S03 = async (page) => {
  const start = await state(page);
  await assertGateContained(page, 'S03');
  const b = await plot(page);
  const y = b.y + b.h * 0.5;      // mid-plot, far below the grip band
  await page.mouse.move(b.x + start.gripB, y);
  await waitForReplayAssertion(async seen => {
    is((seen(await state(page))).cursor, 'col-resize', 'S03 cursor says resize on the edge at mid-plot');
  }, "S03");
  await page.mouse.down();
  await page.mouse.move(b.x + start.gripB + 90, y, { steps: 8 });
  await waitForReplayAssertion(async seen => {
    const during = seen(await state(page));
    is(during.live, ['brace-b'], 'S03 the grabbed edge is live');
    ok(during.readout !== null, 'S03 the grabbed edge reads its snapped time');
  }, "S03");
  await page.mouse.up();
  await settle(page);
  await waitForReplayAssertion(async seen => {
    const after = seen(await state(page));
    near(after.gripA, start.gripA, 1, 'S03 the far edge did not move');
    ok(after.gripB > start.gripB + 40, 'S03 the grabbed edge moved');
    ok(after.chip !== start.chip, 'S03 the chip reports the resized window');
  }, "S03");

  // Each gesture keeps its own live observation window. A failed left proof
  // must not prevent the right gesture and its two claims from being reported.
  const failures = [];
  const checkTouch = async (description, assertions) => {
    try {
      await waitForReplayAssertion(async seen => {
        const failed = [];
        const check = assertion => {
          try { assertion(); } catch (error) { failed.push(error.message); }
        };
        await assertions(seen, check);
        if (failed.length) fail(failed.join('; '));
      }, description);
    } catch (error) { failures.push(error.message); }
  };
  const leftStart = await state(page);
  await touchDrag(page,
    { x: b.x + leftStart.gripA, y }, { x: b.x + leftStart.gripA + 30, y });
  await settle(page);
  await checkTouch('S03 left touch', async (seen, check) => {
    const leftAfter = seen(await state(page));
    check(() => ok(leftAfter.gripA > leftStart.gripA + 10,
      'S03 primary touch moves the left full-height gate'));
    check(() => near(leftAfter.gripB, leftStart.gripB, 1,
      'S03 left primary touch holds the far gate'));
  });

  const rightStart = await state(page);
  await touchDrag(page,
    { x: b.x + rightStart.gripB, y }, { x: b.x + rightStart.gripB + 70, y });
  await settle(page);
  await checkTouch('S03 right touch', async (seen, check) => {
    const rightAfter = seen(await state(page));
    check(() => ok(rightAfter.gripB > rightStart.gripB + 20,
      'S03 primary touch moves the right full-height gate'));
    check(() => near(rightAfter.gripA, rightStart.gripA, 1,
      'S03 right primary touch holds the far gate'));
  });
  if (failures.length) fail(failures.join('; '));
};

/* The ordinary generated projection withholds some case-file rows. A story may
 * pose one generated production-shaped row without changing that roster policy. */
const generatedFindingPreparation = (preparation, caseFiles, findingId) => {
  const sourceRow = caseFiles.preparation.findings.rows.find((row) => row.id === findingId);
  const sourceRendered = caseFiles.preparation.rendered_rows.find((row) => row.id === findingId);
  const sourceHeader = caseFiles.preparation.behavioral_case_headers[findingId];
  if (!sourceRow || !sourceRendered || !sourceHeader) {
    fail(`generated case-file fixture has no ${findingId} pose`);
  }
  const next = structuredClone(preparation);
  /* A replay can pose a row through both the queue projection and preparation.
     The preparation is a validated server contract, where duplicate ready ids
     are invalid; preserve the projected row when it is already present. */
  if (!next.findings.rows.some((row) => row.id === findingId)) {
    next.findings.rows.push(structuredClone(sourceRow));
  }
  next.findings.counts = { ...next.findings.counts, total: next.findings.rows.length };
  if (!next.rendered_rows.some((row) => row.id === findingId)) {
    next.rendered_rows.push(structuredClone(sourceRendered));
  }
  next.behavioral_case_headers[findingId] = structuredClone(sourceHeader);
  return next;
};

export const generatedFindingPose = (findingId) => ({ preparation, caseFiles }) => ({
  body: generatedFindingPreparation(preparation, caseFiles, findingId),
});

export const generatedFindingProjection = (findingId) => (projected, caseFiles) => {
  if (projected.rows.some((row) => row.id === findingId)) return projected;
  return {
    ...projected,
    rows: [...projected.rows, structuredClone(caseFiles.preparation.rendered_rows
      .find((row) => row.id === findingId))],
  };
};

export const openAllCharts = async (page) => {
  if (await page.locator('#tile-field').getAttribute('data-explorer') === null) {
    await page.getByRole('button', { name: 'All charts', exact: true }).click();
    await page.locator('#tile-field[data-explorer]').waitFor();
    await page.waitForTimeout(300);
  }
};

// #413 — a claimed cause folds under its parent Pattern; it is never a
// sibling `.qrow`. The resolver stays correct for a claimed cause and an
// unclaimed ranked row alike, rather than assuming which shape the served row
// takes. ADR 457: it reads that shape only from a settled, painted rail. While
// the rail still reads "Loading findings…" there is neither a row nor a fold,
// so it first waits for `#level` to settle holding a row; the rail paints in
// one pass, folds included.
export async function railRowLocator(page, id) {
  try {
    await page.waitForFunction(() => {
      const level = document.querySelector('#level');
      return level?.dataset.loading === 'false' && Boolean(level.querySelector('.qrow'));
    }, null, { timeout: 30000 });
  } catch (error) {
    if (error.name !== 'TimeoutError') throw error;
    throw new Error(`the Findings rail never settled with a row while resolving ${id}`);
  }
  const row = page.locator(`#level .qrow[data-id="${id}"]`);
  if (await row.count()) return row;
  for (;;) {
    const closed = page.locator('#level .qfold[aria-expanded="false"]').first();
    if (!(await closed.count())) break;
    await closed.click();
  }
  const member = page.locator(`#level .qmember[data-id="${id}"]`);
  await member.waitFor({ timeout: 30000 });
  return member;
}

/* ------------------------------ from the event-comparison behaviour replay */

const SPOTLIGHT_CURSOR_SANCTION = 'sanction: live-judging ruling · 2026-08-28 · "The visible comparison chart keeps its keyboard cursor; it is the reader\'s keyboard route into comparison evidence."';

async function use(open, browser, options, fn) {
  const page = await open(browser, options);
  try { await fn(page); } finally { await page.close(); }
}

// AMENDED (issue #135) — live-judging ruling · 2026-08-28. The global
// comparison canvas remains retired, but its keyboard cursor is un-retired on
// the visible, focusable comparison chart in the spotlight. It is the reader's
// keyboard route into the served cohort evidence.
export const S8 = async (open, browser) => use(open, browser, {}, async (page) => {
  const findingId = page.__comparisonFindingId;
  const chart = page.locator(
    `#tile-focal .evidence-tile[data-chart-id="${findingId}"] #ec-chart`,
  );
  await waitForReplayAssertion(async seen => {
    ok(seen(await chart.isVisible()),
      'the successor comparison tile is not visible');
    ok(seen(await chart.getAttribute('tabindex')) === '0',
      'the spotlight comparison chart is not keyboard focusable');
  }, 'S100 / Event S8 chart');
  await chart.focus();
  await waitForReplayAssertion(async seen => {
    ok(seen(await chart.evaluate((element) => document.activeElement === element)),
      'the spotlight comparison chart did not take keyboard focus');
  }, 'S100 / Event S8 focus');

  const caseFile = page.__comparisonServedByFinding.get(findingId);
  const cursorMinute = 15;
  const expected = caseFile.projection.cohorts.map((cohort) => {
    const point = cohort.points.find((row) => row.minute === cursorMinute);
    const unavailable = !point || point.support === 'withheld';
    return {
      name: cohort.name,
      label: unavailable ? 'unavailable' : String(Math.round(point.median)),
      readout: unavailable ? 'unavailable' : `${Math.round(point.median)} · n${point.n}`,
    };
  });
  const restingLabel = await chart.getAttribute('aria-label');
  for (let step = 0; step < 3; step += 1) {
    await chart.press('ArrowRight');
  }
  await waitForReplayAssertion(async seen => {
    const cursorLabel = '+15 min'; // #389 HV2-32 / amended Event S8
    const readout = page.locator('#canvas-head[data-full] #canvas-fullhead #ec-readout');
    ok(seen(await readout.isVisible()), 'the keyboard cursor did not reveal its on-screen readout');
    const shown = seen(await readout.evaluate((element) => ({
      time: element.querySelector('.rd-time')?.textContent ?? null,
      cohorts: [...element.querySelectorAll('.rd-pair')].map((pair) => ({
        name: pair.querySelector('.k')?.textContent ?? null,
        value: pair.querySelector('.v')?.textContent ?? null,
      })),
    })));
    ok(shown.time === cursorLabel,
      `the keyboard cursor did not move three five-minute points: ${shown.time}`);
    ok(JSON.stringify(shown.cohorts) === JSON.stringify(expected.map((row) => ({
      name: row.name, value: row.readout,
    }))), `the on-screen cursor readout diverged from served cohort evidence: ${JSON.stringify(shown.cohorts)}`);
    const expectedLabel = `${caseFile.finding.title} response comparison. ${cursorLabel}. `
      + `${expected.map((row) => `${row.name} ${row.label}`).join('. ')}.`;
    const inspectedLabel = seen(await chart.getAttribute('aria-label'));
    ok(inspectedLabel !== restingLabel && inspectedLabel === expectedLabel,
      `the accessible cursor label diverged from served cohort evidence: ${inspectedLabel}`);
    ok(seen(await page.locator('#ec-chart').evaluateAll((charts) => charts.length > 0
      && charts.every((element) => Boolean(element.closest('.evidence-tile'))))),
    'the retired global comparison canvas became user-reachable again outside a tile');
  }, 'S100 / Event S8 cursor readout and accessible label');
  process.stdout.write(`UNRETIRED S8 — ${SPOTLIGHT_CURSOR_SANCTION}\n`);
});
