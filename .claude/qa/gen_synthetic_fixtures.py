"""Manufacture the CI gate's fixture set for the Diagnose workstation.

The behaviour replay (frontend/diagnose-workstation-behavior.replay.mjs) has two
runs: a local one on the real captures, and a CI one that cannot have them —
`mockups/*.capture.json` is gitignored. This builds the committed stand-in: one
file per capture name the mock loads, plus the API-shaped payload the app
opener serves.

Operator-authorized 2026-08-10 (behaviour ledger Q2). Nothing here reads the
snapshot: every number is manufactured from a fixed seed, so the set is
PHI-free by construction and byte-reproducible in CI. It exists to hold the
SHAPES each story needs — 48 basal slots with exactly one asserting, a wrapping
and a non-wrapping I:C block, a factor with more than five occurrences, meal
glyphs, occurrence dots — not to look like anyone's data.

    python3 .claude/qa/gen_synthetic_fixtures.py [outdir]

Default outdir is mockups/diagnose-workstation.synthetic/ (committed: the
nested path escapes the top-level `mockups/*.capture.json` ignore, which does
not cross a slash).
"""
import json
import math
import os
import random
import sys

from ciq_autotune.explore_exposures import build_exposures as build_endpoint_exposures
from ciq_autotune.explore_time_of_day import build_time_of_day
from ciq_autotune.analyzers.scenario import build_scenarios
from ciq_autotune.analyzers.scenario.levers import Lever, title as lever_title
from ciq_autotune.store import Store

OUT = sys.argv[1] if len(sys.argv) > 1 else 'mockups/diagnose-workstation.synthetic'
SEED = 620
DATES = ['2020-03-01', '2020-03-02', '2020-03-03']
WINDOW = {'start': '2020-02-01', 'end': '2020-03-03'}

LABEL = {
    'synthetic': True,
    'why': 'Manufactured fixture for the behaviour-replay CI gate. No real CGM, '
           'pump or personal data. Shapes only — see .claude/qa/gen_synthetic_fixtures.py.',
    'authorized': 'operator, 2026-08-10, behaviour ledger Q2',
}


def hhmm(m):
    return f'{m // 60:02d}:{m % 60:02d}'


def curve(minute, rng):
    """A day's glucose shape: overnight dip, three meal rises, gentle noise."""
    base = 128 + 26 * math.sin((minute - 300) / 1440 * 2 * math.pi)
    for peak, height in ((450, 52), (780, 44), (1140, 60)):
        base += height * math.exp(-(((minute - peak) / 70) ** 2))
    if 60 <= minute <= 240:
        base -= 34 * math.exp(-(((minute - 150) / 60) ** 2))
    return round(max(48, min(310, base + rng.gauss(0, 7))), 1)


def day_record(date, rng):
    cgm = [{'t': f'{date} {hhmm(m)}:00', 'bg': curve(m, rng)} for m in range(0, 1440, 5)]
    # meal boluses land in a few 30-min buckets, several deep, so the glyph track
    # carries counts of 1..3 the way the real capture does
    boluses = []
    for minute, carbs in ((445, 38), (455, 22), (770, 51), (1130, 44), (1145, 27), (1150, 19)):
        boluses.append({'t': f'{date} {hhmm(minute)}:00', 'insulin': round(carbs / 5.6, 2),
                        'carbs': carbs, 'bg': curve(minute, rng), 'extended': False})
    return {
        'date': date,
        'midnight': f'{date} 00:00:00',
        'chart_start': f'{date} 00:00:00',
        'chart_end': f'{date} 23:55:00',
        'episodes': [],
        'window': {'start': f'{date} 00:00:00', 'end': f'{date} 23:55:00',
                   'cgm': cgm, 'boluses': boluses, 'basal': [], 'pump_events': [],
                   'sleep_windows': [], 'rest_windows': [], 'carb_exclusion_spans': []},
    }


def verdicts(matched, tier, detail):
    out = [{'classifier': 'over_treated_low', 'matched': matched,
            'detail': detail, 'evidence_tier': tier if matched else 'not_in_data',
            'silence_reason': None if matched else 'insufficient_data'}]
    out.append({'classifier': 'iob_stacking', 'matched': False,
                'detail': 'no stacked correction precedes this episode',
                'evidence_tier': 'not_in_data', 'silence_reason': 'no_signal'})
    return out


def occurrence(i, minute, lever, rng, matched=True):
    """One attributed (or deliberately unattributed) exposure.

    The LEVER is the input and the title is DERIVED from it, because that is the
    relationship production guarantees: `explore_exposures` sets
    `cause_title = title(Lever(lever))`, so the two are strictly 1:1 and a fixture
    that varies one without the other encodes a state the analyzers cannot reach.
    That is not hypothetical — this generator used to stamp one uniform lever across
    four differently-titled behaviours, and the Diagnose findings queue groups rows
    BY LEVER (lock term 35, one row per finding). Five distinct behaviours therefore
    collapsed into a single queue row named after whichever occurrence sorted first,
    whose drill opened another finding's evidence table. Deriving the title here
    makes the invariant structural rather than something two humans keep in sync.
    """
    date = DATES[i % len(DATES)]
    entry = round(rng.uniform(58, 78), 1)
    worst = round(entry - rng.uniform(4, 22), 1)
    return {
        't': f'{date} {hhmm(minute)}:00', 'date': date, 'bg': entry, 'worst_bg': worst,
        'kind': 'low', 'label': 'Low', 'state': 'fired' if matched else 'no_data',
        'attributed': matched, 'cause_lever': Lever(lever).value if matched else None,
        'cause_title': lever_title(Lever(lever)) if matched else None,
        'text': (f'Treated a low at {hhmm(minute)} and the glucose kept falling to {worst:.0f} '
                 'before it turned — the treatment was larger than the fall needed.')
        if matched else '',
        'verdicts': verdicts(matched, 'inferred',
                             f'glucose fell to {worst:.0f} mg/dL after the treatment'),
        'ep_id': f'{date}-ep{i}',
    }


def estimate(value, lo, hi, n, wide=False):
    return {'value': value, 'lo': lo, 'hi': hi, 'n': n, 'confidence': 0.8,
            'method': 'bootstrap-median', 'wide': wide}


def build_day():
    rng = random.Random(SEED)
    return {**LABEL, 'isf': 42.0, 'programmed_ic': 5.6,
            'days': {d: day_record(d, rng) for d in DATES}}


def build_exposures():
    rng = random.Random(SEED + 1)
    # the ranked factor must hold MORE than five occurrences inside the 24 h
    # scope, or the evidence cap has nothing to toggle (stories S10, S12)
    spread = [95, 140, 185, 230, 275, 320, 505, 640, 905, 1075]
    lows = [occurrence(i, m, Lever.OVER_TREATED_LOW, rng) for i, m in enumerate(spread)]
    lows += [occurrence(50 + i, m, Lever.CORRECTION_ON_IOB, rng)
             for i, m in enumerate((410, 700, 1015))]
    # a counter-example: attributed to the family, no classifier fired
    lows += [occurrence(60 + i, m, Lever.OVER_TREATED_LOW, rng, matched=False)
             for i, m in enumerate((160, 980))]
    meals = [occurrence(70 + i, m, Lever.LATE_BOLUS, rng)
             for i, m in enumerate((455, 780, 1150, 465, 790))]
    highs = [occurrence(80 + i, m, Lever.MISSED_MEAL, rng)
             for i, m in enumerate((520, 830, 1200))]
    clusters = [occurrence(90 + i, m, Lever.CORRECTION_ON_IOB, rng)
                for i, m in enumerate((610, 900))]

    def family(rows):
        by_cause = {}
        for o in rows:
            if o['attributed'] and o['cause_title']:
                by_cause[o['cause_title']] = by_cause.get(o['cause_title'], 0) + 1
        # RESCOPABLE requires occurrences to be COMPLETE: len == n.
        return {'n': len(rows), 'attributed': sum(1 for o in rows if o['attributed']),
                'clean': sum(1 for o in rows if not o['attributed']),
                'levers': list(dict.fromkeys(
                    o['cause_lever'] for o in rows if o['cause_lever'] is not None)),
                'by_cause': by_cause, 'occurrences': rows}

    return {**LABEL, 'window': WINDOW,
            'exposures': {'lows': family(lows), 'meals': family(meals),
                          'highs': family(highs), 'correction_clusters': family(clusters)}}


def build_audit():
    rng = random.Random(SEED + 2)
    basal = []
    for i in range(48):
        current = round(0.80 + 0.25 * math.sin(i / 48 * 2 * math.pi), 3)
        if i == 14:
            # exactly ONE slot clears the support floor and asserts a raise —
            # stories S16 and S15 both key off it
            basal.append({'slot': i, 'label': hhmm(i * 30), 'current': current,
                          'estimate': estimate(round(current + 0.09, 3), current,
                                               round(current + 0.33, 3), 20),
                          'recommended': round(current + 0.09, 3),
                          'annotation': 'a conservative one-step move would raise this slot',
                          'days': 20, 'evidence': {'points': []},
                          # `direction` is a real field alongside `safety_status` on the
                          # API shape (SlotEstimate.to_dict(), ciq_autotune/result.py) —
                          # an actionable safety_status always carries it. This fixture
                          # had dropped it, leaving the one asserting slot with
                          # direction: undefined, which the port's read-not-derive
                          # verdict lane (diagnose-workstation-chart.js buildSlotLane)
                          # correctly refused to read as "up" (#654).
                          'asserts_move': True, 'safety_status': 'raise', 'direction': 'raise'})
        elif i % 7 == 0:
            n = rng.randint(1, 6)          # below the 8-night floor: INSUFFICIENT
            basal.append({'slot': i, 'label': hhmm(i * 30), 'current': current,
                          'estimate': estimate(round(current + 0.06, 3), round(current - 0.30, 3),
                                               round(current + 0.44, 3), n, wide=True),
                          'recommended': None,
                          'annotation': 'too few clean nights to assert a direction here',
                          'days': n, 'evidence': {'points': []},
                          'asserts_move': False, 'safety_status': 'insufficient evidence'})
        else:
            basal.append({'slot': i, 'label': hhmm(i * 30), 'current': current,
                          'estimate': estimate(current, round(current - 0.05, 3),
                                               round(current + 0.05, 3), rng.randint(12, 26)),
                          'recommended': None,
                          'annotation': 'delivery matches the programmed rate through these hours',
                          'days': 22, 'evidence': {'points': []},
                          'asserts_move': False, 'safety_status': 'no change'})
    state = {'as_of': WINDOW['end'],
             'analysis': {'window_days': 30, 'basal': basal, 'behavioral': []},
             'habit_levers': [], 'trial': None}
    return {**LABEL, 'states': {'trial': state, 'dense': state, 'typical': state, 'empty': state}}


def ic_block(block_id, start, end, label, current, est, asserts, recommended, runs, meals,
             annotation, held_reason=None):
    return {'block_id': block_id, 'start_min': start, 'end_min': end, 'label': label,
            'member_start_mins': [start], 'current_values': [current], 'estimate': est,
            'recommended': recommended, 'n_runs': runs, 'n_meals': meals,
            'state': 'numeric', 'asserts_move': asserts, 'annotation': annotation,
            'held_reason': held_reason}


def build_ic(asserting):
    """Two blocks tiling the circular day: one WRAPS midnight, one does not.

    Story S17 needs the non-wrapping one (a block segment with no grab handles);
    the wrapping one exercises the two-span path and the stated-not-shaded rule.
    """
    evening = ic_block(660, 660, 420, 'Evening', 5.6,
                       estimate(4.94, 4.73, 5.13, 45),
                       asserting, 5.30 if asserting else 5.6, 45, 274,
                       'a conservative one-step move would tighten this ratio' if asserting
                       else 'meal-owned low printed — the stronger meal-bolus move is withheld',
                       None if asserting else 'harm gate: a meal-owned low is already printed')
    morning = ic_block(420, 420, 660, 'Morning', 5.6,
                       estimate(4.25, 3.81, 4.75, 2, wide=True),
                       False, None, 2, 9,
                       'too few meal runs in these hours to assert a direction',
                       'unmeasured-alone')
    isf = [{'start_min': 0, 'label': 'Fasting', 'parameter': 'isf', 'current': 42.0,
            'estimate': estimate(31.4, 18.2, 46.9, 1583, wide=True), 'recommended': None,
            'annotation': 'corrections keep overshooting into lows, so the correction factor '
                          'eases weaker',
            'evidence': {'rest_windows': [{'date': d} for d in DATES] * 9},
            'asserts_move': None, 'block_id': None}]
    out = {**LABEL, 'schema_version': 8, 'generated': f'{WINDOW["end"]}T00:00:00+00:00',
           'ic': [], 'ic_blocks': [evening, morning], 'isf': isf}
    if asserting:
        # the mock renders THIS as its in-band demonstration note; it is the one
        # label the surface itself prints
        out['synthetic'] = {
            'lifted': ['recommended'],
            'real_and_untouched': [],
            'why': LABEL['why'],
        }
    return out


def endpoint_feeds(day):
    """Build the Explore and Scenario responses through their production readers."""
    cgm = []
    boluses = []
    for record in day['days'].values():
        cgm.extend({
            'EventDateTime': reading['t'],
            'Readings (CGM / BGM)': reading['bg'],
            'Description': 'EGV',
        } for reading in record['window']['cgm'])
        boluses.extend({
            'seq_num': index,
            'request_time': bolus['t'],
            'description': 'Bolus',
            'insulin': bolus['insulin'],
            'carbs': bolus['carbs'],
            'bg': bolus['bg'],
        } for index, bolus in enumerate(record['window']['boluses'], start=len(boluses) + 1))

    with Store.open(':memory:') as store:
        store.upsert_cgm(cgm)
        store.upsert_bolus(boluses)
        return (build_time_of_day(store), build_endpoint_exposures(store),
                build_scenarios(store).to_dict())


def has_replay_exposure_shapes(exposures):
    """Whether production anchors retain every locked inspector story shape."""
    families = exposures['exposures']
    occurrences = [row for family in families.values() for row in family['occurrences']]
    return (all(family['n'] for family in families.values())
            and any(family['n'] > 5 for family in families.values())
            and any(not row['attributed'] for row in occurrences))


def build_payload(scenarios, evidence, exposures, audit, ic, ic_asserting):
    """The API-shaped snapshot the app opener stubs — same data, app field names.

    Unlike the ``*.capture.json`` siblings above, this one is never spread with
    ``LABEL`` (its consumers stub API responses keyed on ``analyze`` /
    ``scenarios`` / ``evidence`` / ``exposures`` directly, so an extra
    ``synthetic``/``why``/``authorized`` triplet at this level would be an unused
    field, not a read one). It still owes a provenance marker a structural scanner
    can find (#728) — ``_generated_by``/``_note``, the same convention
    ``scripts/gen_annotation_fixtures.py`` and ``scripts/gen_ic_block_fixtures.py``
    stamp their fixtures with.
    """
    return {
        '_generated_by': '.claude/qa/gen_synthetic_fixtures.py',
        '_note': ('SYNTHETIC. Manufactured for the CI behaviour-replay gate — no '
                  'real CGM, pump or personal data, every number from a fixed '
                  'seed. See the module docstring.'),
        'analyze': {'generated_at': f'{WINDOW["end"]}T00:00:00+00:00',
                    'window_days': 30,
                    'basal': audit['states']['trial']['analysis']['basal'],
                    'ic_blocks': ic['ic_blocks'],
                    'ic_blocks_asserting': ic_asserting['ic_blocks'],
                    'isf': ic['isf'],
                    'data_quality': {'counts': {'cgm': 3 * 288, 'boluses': 18}}},
        'scenarios': scenarios,
        'evidence': evidence,
        'exposures': exposures,
    }


os.makedirs(OUT, exist_ok=True)
day, exposures, audit = build_day(), build_exposures(), build_audit()
ic, ic_asserting = build_ic(False), build_ic(True)
evidence, endpoint_exposures, scenarios = endpoint_feeds(day)
# The manufactured three-day trace does not yield enough production anchors for
# the replay's capped-factor and counter-example stories, so preserve those
# locked shapes with the endpoint's exact exposure schema and invariants.
if not has_replay_exposure_shapes(endpoint_exposures):
    endpoint_exposures = {
        'window': endpoint_exposures['window'],
        'exposures': exposures['exposures'],
    }
files = {
    'explore-day.capture.json': day,
    'explore-exposures.capture.json': exposures,
    'settings-audit.capture.json': audit,
    'ic-blocks.capture.json': ic,
    'ic-blocks-asserting.capture.json': ic_asserting,
    'payload.json': build_payload(scenarios, evidence, endpoint_exposures, audit, ic,
                                  ic_asserting),
}
for name, body in files.items():
    with open(os.path.join(OUT, name), 'w') as f:
        json.dump(body, f, indent=1, sort_keys=True)
        f.write('\n')
    print('wrote', os.path.join(OUT, name))
