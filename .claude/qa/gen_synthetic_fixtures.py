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
import time
from copy import deepcopy
from datetime import datetime, timedelta

from ciq_autotune.explore_exposures import build_exposures as build_endpoint_exposures
from ciq_autotune.explore_time_of_day import build_time_of_day
from ciq_autotune.analyzers.scenario import build_scenarios
from ciq_autotune.analyzers.isf import isf_asserts_move
from ciq_autotune.analyzers.scenario.levers import Exposure, Lever, exposure, title as lever_title
from ciq_autotune.analyzers.scenario.opportunities import Opportunity
from ciq_autotune.events import BasalEvent, BolusEvent, CarbEntry, CgmReading
from ciq_autotune.finding_case_file import Member, PreparedCases, wrap
from ciq_autotune.store import Store
from ciq_autotune.window_membership import WindowQuery

OUT = sys.argv[1] if len(sys.argv) > 1 else 'mockups/diagnose-workstation.synthetic'
SEED = 620
DATES = ['2020-03-01', '2020-03-02', '2020-03-03']
WINDOW = {'start': '2020-02-01', 'end': '2020-03-03'}
COMPARISON_POPULATION_SIZE = 20

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
    lows += [occurrence(100 + i, m, Lever.OVER_TREATED_LOW, rng)
             for i, m in enumerate((55, 365, 515, 755, 835))]
    # The expanded source population supplies event-comparison coverage, not
    # twenty instances of one queue finding. Two daytime late boluses retain
    # the fired-meal shape; the remaining source rows are counter-examples, so
    # the unpriced correction finding stays ahead of it and Overnight stays
    # all-hidden after its Highs chip is deselected.
    meals = [occurrence(70 + i, m, Lever.LATE_BOLUS, rng)
             for i, m in enumerate((455, 780))]
    meals += [occurrence(72 + i, m, Lever.LATE_BOLUS, rng, matched=False)
              for i, m in enumerate((1150, 465, 790, 1010, 80, 365, 730, 1085,
                                     290, 560, 920, 1235, 205, 650, 990, 350,
                                     845, 1180))]
    # S32 proves that an episode-and-time pair only joins an occurrence: the
    # endpoint's opaque id selects it. Keep one duplicate in the SOURCE rows;
    # the event fixture must never manufacture it by reusing a shorter list.
    meals[11]['ep_id'] = meals[2]['ep_id']
    meals[11]['t'] = meals[2]['t']
    meals[11]['date'] = meals[2]['date']
    assert len(lows) == COMPARISON_POPULATION_SIZE
    assert len(meals) == COMPARISON_POPULATION_SIZE
    highs = [occurrence(80 + i, m, Lever.MISSED_MEAL, rng)
             for i, m in enumerate((520, 830, 1200))]
    # #63 — one high the engine accounts for NOTHING about, so the browser gates
    # actually render the unexplained-highs line beneath the queue. Without it the
    # count is zero, the server publishes no sentence, and the whole surface is
    # certified by a fixture that can never show it.
    highs += [occurrence(83, 1310, Lever.MISSED_MEAL, rng, matched=False)]
    clusters = [occurrence(90 + i, m, Lever.CORRECTION_ON_IOB, rng)
                for i, m in enumerate((610, 900))]

    def family(rows):
        by_cause = {}
        for o in rows:
            if o['attributed'] and o['cause_title']:
                by_cause[o['cause_title']] = by_cause.get(o['cause_title'], 0) + 1
        # RESCOPABLE requires occurrences to be COMPLETE: len == n.
        # `uncaused` counts occurrences whose EPISODE drew no lever anywhere (#63).
        # Every occurrence here carries its own `ep_id`, so no episode is shared
        # across families and an unattributed occurrence is alone in its episode —
        # which is the one arrangement where this equals the unattributed count.
        # Production does NOT have that property and must not derive it this way.
        return {'n': len(rows), 'attributed': sum(1 for o in rows if o['attributed']),
                'clean': sum(1 for o in rows if not o['attributed']),
                'uncaused': sum(1 for o in rows if not o['attributed']),
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
                          'annotation': 'not enough nights of steady data yet to point one way',
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
    current_isf = 42.0
    direction = None
    recommended_isf = None
    isf = [{'start_min': 0, 'label': 'Fasting', 'parameter': 'isf', 'current': current_isf,
            'estimate': estimate(31.4, 18.2, 46.9, 1583, wide=True), 'recommended': None,
            'annotation': 'corrections keep overshooting into lows, so the correction factor '
                          'eases weaker',
            # 27 detected rest windows, 24 of which produced a per-night fit: the
            # estimate is clustered on the fits (#177), and the surface counts THAT
            # list. A capture carrying only the windows cannot tell the two apart.
            'evidence': {'rest_windows': [{'date': d} for d in DATES] * 9,
                         'night_fits': [{'date': d, 'isf': isf}
                                        for d, isf in zip(DATES * 8,
                                                          [28.5, 31.4, 34.2] * 8)]},
            'asserts_move': isf_asserts_move(current_isf, direction, recommended_isf),
            'block_id': None}]
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
        'pump_settings': {
            'configured': True,
            'fetched_at': f'{WINDOW["end"]} 00:00:00',
            'other_profile_count': 0,
            'profile': {
                'idp': 1, 'name': 'Synthetic multi-segment', 'dia_hours': 5.0,
                'max_bolus': 10.0, 'carb_entry': True,
                'segments': [
                    {'start_min': 0, 'basal_rate': 0.8, 'isf': 42,
                     'carb_ratio': 5.6, 'target_bg': 110},
                    {'start_min': 360, 'basal_rate': 0.9, 'isf': 45,
                     'carb_ratio': 6.0, 'target_bg': 110},
                    {'start_min': 780, 'basal_rate': 0.75, 'isf': 38,
                     'carb_ratio': 5.2, 'target_bg': 110},
                    {'start_min': 1200, 'basal_rate': 0.7, 'isf': 50,
                     'carb_ratio': 6.4, 'target_bg': 110},
                ],
            },
        },
    }


def build_case_file_capture():
    """Serialize both ADR 79 endpoint bodies from one retained preparation."""
    base = datetime(2020, 3, 1, 8)
    verdicts = ('fired', 'fired', 'fired', 'fired', 'fired', 'fired',
                'outranked', 'near_miss', 'no_data', 'clean')
    families = {}
    seq = 1000
    for family in Exposure:
        rows = []
        source_keys = set()
        for index in range(len(verdicts)):
            # Keep the legacy fixed-seed schedule.  The three-day wrap makes
            # indices 1 and 9 land on the same timestamp; within a family that
            # timestamp contributes to the opaque source key for timestamped
            # opportunities.  Advance only a repeated anchor, by the smallest
            # stable amount, so every fixture source-key roster is a partition.
            anchor = base + timedelta(hours=index * 3 + list(Exposure).index(family),
                                      days=index % 3)
            while True:
                if family is Exposure.MEALS:
                    dose = BolusEvent(t=anchor, insulin=4.0, carbs=40, seq_num=seq)
                    row = Opportunity(family, (seq,), anchor, 'meal', 130, members=(dose,))
                elif family is Exposure.LOWS:
                    row = Opportunity(family,
                        (anchor - timedelta(minutes=25), anchor + timedelta(minutes=15), anchor),
                        anchor, 'low', 62)
                elif family is Exposure.CORRECTION_CLUSTERS:
                    first = BolusEvent(t=anchor - timedelta(minutes=90), insulin=1.5, seq_num=seq)
                    second = BolusEvent(t=anchor, insulin=2.0, seq_num=seq + 1)
                    row = Opportunity(family, (seq, seq + 1), anchor, 'correction', 175,
                                      members=(first, second))
                else:
                    row = Opportunity(family,
                        (anchor - timedelta(minutes=40), anchor + timedelta(minutes=15), anchor),
                        anchor, 'high', 265, reach_start=anchor - timedelta(minutes=30))
                if row.source_key not in source_keys:
                    break
                anchor += timedelta(minutes=1)
            source_keys.add(row.source_key)
            if family is Exposure.MEALS:
                seq += 1
            elif family is Exposure.CORRECTION_CLUSTERS:
                seq += 2
            rows.append(row)
        families[family] = tuple(rows)

    all_members, associations, recurrence = {}, {}, {}
    rows = []
    for priority, lever in enumerate(Lever, start=1):
        opportunities = families[exposure(lever)]
        members = tuple(Member(item,
            item.anchor_t + (timedelta(minutes=180) if lever is Lever.OVER_TREATED_LOW else timedelta()),
            verdict) for item, verdict in zip(opportunities, verdicts))
        # Meal over-delivery deliberately proves claimed < fired.
        claimed = frozenset({members[0].id})
        all_members[lever] = members
        associations[lever] = claimed
        recurrence[lever] = (len(claimed), len(members))
        rows.append({
            'id': f'finding:{lever.value}', 'register': 'finding', 'kind': 'habit',
            'title': lever_title(lever), 'priority': 100 - priority, 'tier': 'worth_a_look',
            'parameter': None, 'label': None, 'span': None, 'direction': None,
            'lean': None, 'current': None, 'recommended': None, 'estimate': None,
            'support': None, 'reason': None, 'annotation': None, 'members': None,
            'lever': lever.value, 'appearances': [], 'episodes': 1, 'evidence': [],
            'verdict_counts': {}, 'verdict_counts_by_family': {},
            'chips': ['corrections' if exposure(lever) is Exposure.CORRECTION_CLUSTERS
                      else exposure(lever).value], 'window_scope': 'window',
        })

    opportunities = tuple(item for family in Exposure for item in families[family])
    cgm = []
    for item in opportunities:
        for minute in range(-300, 301, 30):
            cgm.append(CgmReading(item.anchor_t + timedelta(minutes=minute),
                                  max(45, min(295, 125 + minute / 8)), 'EGV'))
    bolus = tuple(sorted((dose for item in opportunities for dose in item.members),
                         key=lambda dose: dose.seq_num))
    basal = tuple(BasalEvent(item.anchor_t + timedelta(minutes=20), 'suspended',
                             basal_rate=0, profile_basal_rate=0.9)
                  for item in families[Exposure.LOWS])
    carbs = tuple(CarbEntry(item.anchor_t + timedelta(minutes=10), 15, 'exact', 'low-prompt')
                  for item in families[Exposure.LOWS])
    findings = {
        'schema': 'diagnose-findings-v1', 'window': WindowQuery.whole_day().to_dict(),
        'findings_window': {'start': WINDOW['start'], 'end': WINDOW['end'], 'days': 30},
        'rows': rows, 'counts': {'total': len(rows)},
        'chip_counts': {'meals': 10, 'lows': 10, 'highs': 10, 'corrections': 10},
        'uncaused_highs': {'count': 1, 'text': '1 high had no cause detected by the app'},
    }
    prepared = PreparedCases(
        'fp_' + '7' * 32, 79, WindowQuery.whole_day(), findings, recurrence,
        all_members, associations, {lever: () for lever in Lever}, frozenset(),
        tuple(sorted(cgm, key=lambda row: row.t)), basal, bolus, carbs,
        time.monotonic() + 60,
    )
    cases = {}
    for lever in Lever:
        finding_id = f'finding:{lever.value}'
        cases[finding_id] = {
            'clock': prepared.case(finding_id, 'clock', None),
            'event': prepared.case(finding_id, 'event', None),
            'selected_clock': {member.id: prepared.case(finding_id, 'clock', member.id)
                               for member in all_members[lever]},
            'selected_event': {member.id: prepared.case(finding_id, 'event', member.id)
                               for member in all_members[lever]},
            'unavailable_clock': prepared.case(finding_id, 'clock', 'o_' + '9' * 32),
            'unavailable_event': prepared.case(finding_id, 'event', 'o_' + '9' * 32),
        }
    held_rows = [
        {'id': 'basal:0-30', 'register': 'held', 'kind': 'setting', 'title': 'Basal 00:00',
         'tier': 'noted', 'priority': None, 'parameter': 'basal_rate', 'reason': 'thin support',
         'chips': ['lows'], 'window_scope': 'window'},
        {'id': 'basal:210-240', 'register': 'held', 'kind': 'setting', 'title': 'Basal 03:30',
         'tier': 'noted', 'priority': None, 'parameter': 'basal_rate', 'reason': 'thin support',
         'chips': ['lows'], 'window_scope': 'window'},
        {'id': 'ic:660', 'register': 'held', 'kind': 'setting', 'title': 'I:C Evening',
         'tier': 'noted', 'priority': None, 'parameter': 'carb_ratio', 'reason': 'harm gate',
         'chips': ['meals'], 'window_scope': 'window'},
        {'id': 'isf', 'register': 'held', 'kind': 'setting', 'title': 'ISF',
         'tier': 'noted', 'priority': None, 'parameter': 'isf', 'reason': 'insufficient evidence',
         'chips': ['highs'], 'window_scope': 'whole_day'},
    ]
    overnight_findings = deepcopy(findings)
    overnight_findings['window'] = WindowQuery.clock(0, 360).to_dict()
    overnight_findings['rows'] = [*rows, *held_rows]
    overnight = PreparedCases(
        'fp_' + '8' * 32, 79, WindowQuery.clock(0, 360), overnight_findings, recurrence,
        all_members, associations, {lever: () for lever in Lever}, frozenset(),
        tuple(sorted(cgm, key=lambda row: row.t)), basal, bolus, carbs,
        time.monotonic() + 60,
    )
    return {
        '_generated_by': '.claude/qa/gen_synthetic_fixtures.py',
        '_note': 'SYNTHETIC ADR 79 endpoint capture; fixed construction, no personal data.',
        'preparation': wrap(prepared), 'cases': cases,
        'scoped': {'0-360': {'preparation': wrap(overnight), 'cases': {}}},
    }


os.makedirs(OUT, exist_ok=True)
day, manufactured_exposures, audit = build_day(), build_exposures(), build_audit()
ic, ic_asserting = build_ic(False), build_ic(True)
evidence, endpoint_exposures, scenarios = endpoint_feeds(day)
# The manufactured three-day trace does not yield enough production anchors for
# the replay's capped-factor and counter-example stories, so preserve those
# locked shapes with the endpoint's exact exposure schema and invariants.
if not has_replay_exposure_shapes(endpoint_exposures):
    endpoint_exposures = {
        'window': endpoint_exposures['window'],
        'exposures': manufactured_exposures['exposures'],
    }
# The workstation capture and payload publish this one selected object. The
# reader remains the authority where its manufactured trace has enough shape;
# otherwise the fixed-seed fallback supplies the replay population.
browser_exposures = {
    'window': endpoint_exposures['window'],
    'exposures': endpoint_exposures['exposures'],
}
files = {
    'explore-day.capture.json': day,
    'explore-exposures.capture.json': {**LABEL, **browser_exposures},
    'settings-audit.capture.json': audit,
    'ic-blocks.capture.json': ic,
    'ic-blocks-asserting.capture.json': ic_asserting,
    'payload.json': build_payload(scenarios, evidence, browser_exposures, audit, ic,
                                  ic_asserting),
    'finding-case-files.json': build_case_file_capture(),
}
for name, body in files.items():
    with open(os.path.join(OUT, name), 'w') as f:
        json.dump(body, f, indent=1, sort_keys=True)
        f.write('\n')
    print('wrote', os.path.join(OUT, name))
