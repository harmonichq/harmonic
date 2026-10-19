#!/usr/bin/env python3
"""Generate the component library's fixtures and its word allowlist (#483).

Two committed outputs, one generator, one ``--check``:

* ``frontend/ui/__fixtures__/ui-fixtures.json`` holds the served answers the
  stories render. Their source is ``scripts/ui_patient.py``: a seeded synthetic
  Control-IQ wearer whose history is ingested into a scratch SQLite store and
  read back through the public HTTP API, in process, with the fetch loop off.
  Nothing is served on a port, nothing is fetched, and no real data is read.
  Two stores are built from the one wearer:

  - ``wearer`` changes the 03:00 basal on the simulator's Trial day, which the
    engine detects as a Trial. The person also logs a few treated lows in the
    manual carb log and answers one prompt, through ``POST /api/carbs`` and
    ``POST /api/prompts/answer``. Every top-level block (status, prompts,
    outcomes, guidance) is read from this store.
  - ``wearer-pinned`` is the same history without the profile change, with a
    Focus pinned through ``POST /api/focus`` (one change is active at a time,
    so the Trial and the Focus cannot share a store).

  Two more stores serve the Overview states the full history cannot:

  - ``wearer-first-days`` is the same wearer's first five days only, as a sync
    early on would hold: too few days for the glucose profile to support.
  - ``wearer-unsynced`` is a store before its first sync, with no readings, so
    every outcome metric is served as null.

  ``overview`` holds the Overview components' answers by store:
  ``/api/explore/time-of-day`` for each window (14, 30 and 90 days), the ISF
  estimate and the 48 basal slots of ``/api/analyze`` for each window, ``/api/day-navigator`` for the
  wearer's latest month, and ``/api/outcomes`` for each window where the
  top-level ``outcomes`` (the wearer's) does not already hold it. Every outcomes
  answer carries its previous period. The wearer's ISF is held at every window,
  so one more store, ``isf-supported``, serves an ISF the engine supports a
  change for: ``scripts/qa_e2e_cases.py``'s manufactured fasting nights (a true
  ISF of 33 under 8 mg/dL of sensor noise), read through the same API.
  ``/api/explore/meal-size`` (#501), trimmed to what the Meal size card draws,
  is served for the wearer (a meal in every size), its first days (one meal at
  60 g+), the unsynced store (no window), and ``showcase``, the QA catalog's
  showcase case, whose meals are all 40 g or more.

  ``changes`` holds the Changes components' answers by store (the admission,
  every Trial on the roster, the Focus records with their served titles). The
  active Trial carries its retained comparison, trimmed to what the screen
  draws (#524): the outcome rows, each arm's meals, and each arm's binned
  glucose trace and, for a basal Trial, Control-IQ's delivery against the
  programmed rate. The stores: ``wearer`` with its matured Trial;
  ``wearer-ended`` the same store once the person ends that Trial through
  ``POST /api/verify/trials/{id}/finish``; ``wearer-pinned`` with its Focus;
  ``wearer-focus``, a Focus pinned on the Trial day with four weeks synced
  after it, and ``wearer-focus-maturing``, the same cut a day after the pin;
  ``wearer-ended-pinned``, a Focus pinned after that Trial was ended, so the
  ended Trial is the last change beside an active one; ``wearer-first-days``
  with no active change; ``wearer-trial-maturing``,
  the wearer's history cut six days after the Trial day, so the Trial is still
  maturing; ``wearer-ic-maturing``, a change to the 11:00 carb ratio cut a
  few days later, its after period too few meals for a band;
  ``wearer-profile``, a switch to a second profile that moves the 02:00 basal
  and the 11:00 carb ratio at once, one whole-profile Trial;
  ``wearer-previous``, three changes in turn, each ending the one before and
  the last ended by the person, then a Focus pinned and ended at once, for
  the Previous list; and ``wearer-worse``,
  the second wearer, whose wrong-direction Trial matures Worse. The two
  matured results are checked, and so is each new store's state: the
  generator fails if any stops being served. ``wearer-worse`` also has its Queue
  answers in ``queue``.

  ``day`` holds ``/api/timeline`` and ``/api/carbs`` for four of the wearer's
  days, picked by rule: the latest day with readings, a site change and no
  logged carbs, the latest of the days with the most logged carbs, the first
  day after the history ends, and the latest day with readings, with each
  day's ``/api/model-view`` trimmed to what the Day chart marks: every
  episode's habit and every anchor's time, kind, state, glucose and matched
  verdicts. ``day.prompts``
  holds ``/api/prompts`` for the Day screen's Prompts: ``wearer-pending``, read
  before the person answers the one prompt the top-level ``prompts`` shows
  answered, and ``wearer-answered``, read after every other read of the wearer
  once the person answers the rest Yes. With the top-level answer they serve
  two, one and no unanswered lows. ``rises-pending``, ``rises`` and
  ``rises-answered`` are Day's Rises (#529): the same wearer with two lunches
  in the last week never bolused for, its lows answered but the latest, read
  before any rise is answered, after one No, and once the other is answered
  Yes, so they serve two, one and no unanswered rises beside one low. Every
  prompt is trimmed to what a PromptCard draws, as the live adapter trims it.

  ``settings`` holds the Settings screens' answers, read from the wearer's
  store after every other read of it: ``/api/credentials`` unset and then set
  with an invented address on a reserved domain (masked before it is written;
  the ``.env`` fallback is blocked, so no real credential is ever read),
  ``/api/status`` after a successful sync and after a later failed one, and
  ``/api/pump-settings`` for the wearer and for the unsynced store (no
  profile). ``snooze`` is a pattern the pinned store's person snoozes through
  ``PUT /api/guidance/preferences``, with the decision time the engine serves.
  ``glossary`` is §1.5's rows, for the Glossary page. For the Queue screen,
  each store's candidates carry their rank, admission and snooze; the pinned
  store's Queue is read again after its snooze (``wearer-pinned-snoozed``);
  ``wearer-before-done`` is a fresh wearer's Queue, and ``wearer-done`` (Queue
  and Changes) the same once the person presses Done on the basal card through
  ``POST /api/plan/apply`` (#518), waiting for the pump;
  ``wearer-not-on-pump`` is the same store after a later sync, one
  delivery row and a settings read whose profile is unchanged, written as a
  fetch would write them, so the card is back marked Not on pump.
  ``wearer-first-days-snoozed`` is the first days with everything snoozed (an
  empty Queue); ``isf-supported`` is the Overview's store of the same name,
  whose ISF the engine supports a change for and so queues;
  ``carb-ratio-supported`` is ``scripts/qa_e2e_cases.py``'s
  ``basal-and-carb-ratio-lower`` case, whose meals support lowering the carb
  ratio, so its I:C Setting queues; a standalone habit (ADR 528), the missed
  meal no Pattern owns, is queued in three: ``missed-meal`` is the
  ``behavioral-missed-meal`` case, two rises its habit claims, each drawn;
  ``missed-meal-pinned`` (Queue and Changes) the same once the person pins it
  through ``POST /api/focus``, its Focus under the habit's own key; and
  ``wearer-habit`` the wearer skipping the lunch bolus every weekday of the
  last four weeks, more rises than the chart draws one by one; and the unsynced
  store records its guidance disposition. Each Queue store's ``analyze`` holds
  its first ISF segment, trimmed as the Overview's is, for the Queue's ISF
  card, and each carb-ratio block the engine stages a move for, with the meal
  runs its estimate counts, for the I:C Setting card (ADR 523). Each
  Queue store also holds ``cases``: every admitted Pattern's event-aligned case
  file from ``/api/diagnose/finding-case-file``, trimmed to its trace chart
  (ADR 523): the Pattern's episodes or its median and band, and Typical's, for
  the open card's chart and impact line; and every admitted standalone habit's,
  by its lever, with the count its row and card print (ADR 528).

  ``status.failed`` adds one invented failed sync attempt, through
  ``Store.record_fetch_result``, so the Settings alert has a served
  ``last_error``. The wall clock every write stamps is pinned to one hour after
  the wearer's last reading, so the output is byte-reproducible.

  ``states`` names, for each story state, the store and the pattern, basal
  block, or ISF window that serves it, chosen by rule from what the engine served. A state
  the stories need that the engine no longer serves fails the generator; a
  state that does not arise naturally is ``null`` and its story is absent.
* ``frontend/ui/__fixtures__/ui-allowlist.json`` is every word a story may
  display. It is built from the glossary (§1.5) and the tab names (§1.1) of
  ``docs/design/recommendations-redesign.md``, plus the engine titles, nouns
  and units in the fixture above, plus the window unit and the "of" of a
  magnitude from §4.2.

    uv run python scripts/gen_ui_fixtures.py          # rewrite in place
    uv run python scripts/gen_ui_fixtures.py --check  # CI-style drift check
"""

from __future__ import annotations

import argparse
import contextlib
import json
import pathlib
import re
import sys
import tempfile
from datetime import datetime, timedelta
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from fastapi.testclient import TestClient  # noqa: E402

import qa_e2e_cases  # noqa: E402
import ui_patient  # noqa: E402
import requests  # noqa: E402
from ciq_autotune.api import create_app  # noqa: E402
from ciq_autotune.fetch_loop import fetch_error_label  # noqa: E402
from ciq_autotune.store import Store  # noqa: E402
from ciq_autotune.watched_change import reconcile_ingested_follow_up  # noqa: E402

DESIGN = ROOT / "docs" / "design" / "recommendations-redesign.md"
OUT_DIR = ROOT / "frontend" / "ui" / "__fixtures__"
FIXTURES = OUT_DIR / "ui-fixtures.json"
ALLOWLIST = OUT_DIR / "ui-allowlist.json"
GENERATED_BY = "scripts/gen_ui_fixtures.py"

WINDOWS = (14, 30, 90)
# The pinned wall clock: one hour after the wearer's last reading.
CLOCK = ui_patient.START + timedelta(days=ui_patient.DAYS, hours=1)
# The failed sync: a connection that never opened, in the shape requests reports
# it (a synthetic host), long enough to wrap at every width. Its label comes from
# the server's own classification of that error.
FAILED_ERROR = ("HTTPSConnectionPool(host='sso.example.invalid', port=443): Max retries "
                "exceeded with url: /login (Caused by NewConnectionError('Failed to "
                "establish a new connection: [Errno 101] Network is unreachable'))")
FAILED_LABEL = fetch_error_label(requests.exceptions.ConnectionError(FAILED_ERROR))
# The person logs the treated lows of the last fortnight by hand, all but the
# most recent few, which stay as prompts: about four entries a week, the rate
# a real wearer's manual carb log runs at.
LOGGING_DAYS = 14
UNLOGGED_LOWS = 2
# Day's Rises (#529): the wearer's lunches on these days of the last week,
# never bolused for, which the engine asks about as possible meals.
UNBOLUSED_LUNCHES = (79, 81)
# Day's Prompts rows and the drill-in each opens (§4.2 PromptCard): the plurals
# of the Low and the Rise they list.
PROMPT_ROWS = ("Lows", "Rises")
# §4.2 SegmentedControl: "14 / 30 / 90 d", and QueueRow's magnitude "9 of 71 lows".
# The Meal size card's To peak is in minutes, "min" (§2.5, 2026-10-19).
UNITS = ("d", "min")
CONNECTIVES = ("of",)
# EvidenceChart labels its two marks with the served field each one plots:
# analyze.basal[].current and analyze.basal[].estimate (approved 2026-10-12;
# not yet in glossary §1.5).
MARK_FIELDS = ("current", "estimate")
# §4.2 GlucoseProfile's insufficient-data label, quoted there; "data" is not yet
# in glossary §1.5.
STATE_LABELS = ("No data",)
# §4.2 SettingCard's captions, quoted in §2 ("Nights / Range"); Range is in
# glossary §1.5. Nights was once also an engine noun, the overnight-lows
# Pattern's, which ADR 499 cut. An I:C card counts its Meal runs (§2.5,
# 2026-10-14, ADR 523).
SETTING_CAPTIONS = ("Nights", "Meal runs")
# The Pattern card's trace chart labels its time axis "Minutes" (§2.5,
# 2026-10-14, ADR 523), a plain interface word.
CHART_LABELS = ("Minutes",)
# §1.3 Queue's empty-state label, "0 patterns".
QUEUE_LABELS = ("patterns",)
# §4.2 DayRibbon: "each day's weekday and date". The weekday abbreviations are
# not yet in glossary §1.5.
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
# The Overview's date line names its comparison once: "vs previous 14 d"
# (§2.5, 2026-10-14). "Previous" is already a plain interface word below.
OVERVIEW_LABELS = ("vs",)
# An ISF the engine supports a change for: qa_e2e_cases' manufactured fasting
# nights at a true ISF of 33 mg/dL/U under 8 mg/dL of sensor noise.
ISF_SUPPORTED = {"true_isf": 33.0, "noise_sd": 8.0}
CARB_RATIO_CASE = "basal-and-carb-ratio-lower"
# A standalone habit (ADR 528): the QA case whose two rises its missed-meal habit
# claims, and the wearer's lunch never bolused for on every weekday (the wearer's
# days start on a Monday) of the last four weeks, more rises than the chart draws
# one by one.
MISSED_MEAL_CASE = "behavioral-missed-meal"
HABIT_UNBOLUSED = tuple(day for day in range(ui_patient.DAYS - 28, ui_patient.DAYS) if day % 7 < 5)
# The Meal size card's sizes with no meal (#501): the QA showcase's meals are all 40 g or more.
MEAL_SIZE_CASE = "showcase"
# Dates print as "26 Sep" (§1.2 the Overview's span "30 Sep – 13 Oct", §1.3
# "Until <date>"); the month abbreviations are plain interface words (§2.5,
# 2026-10-13).
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
# Plain interface words the Changes and Day components quote from §1.2, §1.3
# and §4.2, exempt from glossary §1.5 by the 2026-10-13 amendment (§2.5):
# ChangeCard's "Before/After values" and "Days 0 / 14", the Prompt's "Next" text
# action, Log carbs' "Time" row (default now) and "Save", the write-failed
# "Not saved" with "Retry", "Cancel" beneath End's confirmation (§1.3a), and
# "Previous" and "Next", the names of the Day navigator's ‹ › (§1.4), and
# Changes' Previous list (§2.5, 2026-10-14). The Changes screen's basal
# module's "Delivered" rate and its meal trace's "Minutes" axis (#524). The
# "Readings" each glucose module is read from (§2.5, 2026-10-19).
CHANGE_DAY_LABELS = ("Before", "After", "Days", "Next", "Time", "Now", "Save", "Not saved", "Retry", "Cancel",
                     "Previous", "Delivered", "Minutes", "Readings")
# The wearer's first days: fewer than the glucose profile's eight supported days.
FIRST_DAYS = 5
# A Trial still maturing: the wearer's history cut this many days after the
# Trial day, short of the engine's fourteen.
MATURING_DAYS = 6
# A carb ratio Trial still maturing: the wearer's history cut this many days
# after a change to the 11:00 carb ratio, which two of its lunches fall in.
IC_MATURING_DAYS = 5
# The same change read a quarter of a day after it (#554): before its first
# lunch, so the after arm has read nothing yet.
IC_FIRST_HOURS_DAYS = 0.25
# The Previous list's wearer (#524): the 02:00 basal lowered four weeks before
# the Trial day, the 11:00 carb ratio two weeks before it, and the 02:00 basal
# again on it, each change ending the one before.
PREVIOUS_CHANGES = (
    (ui_patient.TRIAL_DAY - 28, 1, ui_patient.trial_profile(1.40)),
    (ui_patient.TRIAL_DAY - 14, 1, ui_patient.lunch_profile(ui_patient.trial_profile(1.40))),
    (ui_patient.TRIAL_DAY, 1, ui_patient.lunch_profile(ui_patient.trial_profile(1.00))),
)
# Settings (§1.1, §1.2, §1.3, and the Settings section of the brief): the root
# list's Glossary row, the sync rows, the account rows, the Token field, the pump profile, the
# snooze bar ("Snoozed · Until <date>") and the screen-level "Unavailable".
# Plain interface words (§2.5), but for DIA, a pump field the brief names.
# The Queue row's kind glyph is named "Pattern" or "Setting" for assistive
# tech (§2.5, 2026-10-13); "Setting" is no longer a §1.5 term, since no screen
# prints it, so the name is allowed here.
KIND_NAMES = ("Pattern", "Setting")
# The desktop rail's wordmark (§2.5, 2026-10-13): the H mark and the product's name.
BRAND = ("H", "Harmonic")
SETTINGS_LABELS = ("State", "OK", "Failed", "Last success", "Last attempt", "Error", "Data",
                   "Email", "Region", "Password", "Token", "Set", "Not set", "Update", "Start", "Target",
                   "Max bolus", "DIA", "No profile", "Unavailable", "Snoozed", "Until",
                   "Glossary")
# The account the stories show as set: an invented address on a reserved
# domain, posted through the API and masked before it is written anywhere.
SYNTHETIC_EMAIL = "wearer@example.invalid"
MASK = "••••••••"
# A successful sync after the failed one above, then a later failure: the
# Tandem Source screen's OK and Failed states.
SYNC_OK_AT = CLOCK + timedelta(minutes=10)
SYNC_FAILED_AT = CLOCK + timedelta(minutes=20)
# The day navigator's month: the month of the wearer's last day.
NAVIGATOR_MONTH = (ui_patient.START + timedelta(days=ui_patient.DAYS - 1)).strftime("%Y-%m")

WORD = re.compile(r"[A-Za-z][A-Za-z'’-]*")

# Every module that imported the server's wall clock by name.
_CLOCK_MODULES = ("analyze", "api", "cli", "credentials", "fetch_loop", "pattern_sweep",
                  "pending_prompts", "store", "sync", "watched_change")


# The wall clock's current reading: CLOCK, except inside ``clock_at``.
_now = [CLOCK]


def _clock(after=None):
    return max(_now[0], after + timedelta(seconds=1)) if after else _now[0]


@contextlib.contextmanager
def clock_at(moment: datetime):
    """Read the pinned wall clock as ``moment`` for the writes inside: a person
    acting earlier in the wearer's history, before the rest of it synced."""
    _now[0] = moment
    try:
        yield
    finally:
        _now[0] = CLOCK


@contextlib.contextmanager
def pinned_clock():
    with contextlib.ExitStack() as stack:
        for module in _CLOCK_MODULES:
            stack.enter_context(patch(f"ciq_autotune.{module}.wall_clock_now", _clock))
        yield


def _get(client: TestClient, path: str, **params) -> object:
    response = client.get(path, params=params or None)
    response.raise_for_status()
    return response.json()


def _post(client: TestClient, path: str, payload: dict) -> object:
    response = client.post(path, json=payload)
    response.raise_for_status()
    return response.json()


def _serve(database: pathlib.Path) -> TestClient:
    # The credential key lives beside the scratch store, never in tconnect-data/.
    return TestClient(create_app(
        db_path=str(database), token=None, enable_fetch_loop=False,
        analysis_incarnation="ui-fixtures", key_path=f"{database}.key",
    ))


def _wearer(scratch: pathlib.Path, name: str, *, trial: bool, days: int = ui_patient.DAYS, answer: bool = True,
            **change):
    """Ingest the wearer into a scratch store, as a sync would, and serve it.
    ``answer=False`` leaves the one prompt the person answers to the caller."""
    database = scratch / f"{name}.sqlite"
    with Store.open(str(database)) as store:
        history = ui_patient.materialize(store, trial=trial, days=days, **change)
        reconcile_ingested_follow_up(store)
    client = _serve(database)
    # The person's own writes: the fortnight's treated lows logged by hand, bar
    # the latest few, and one remaining prompt answered.
    window_start = ui_patient.START + timedelta(days=ui_patient.DAYS - LOGGING_DAYS)
    logged = [low for low in history.treated_lows if low[0] >= window_start][:-UNLOGGED_LOWS]
    for at, grams in logged:
        _post(client, "/api/carbs", {"t": at.strftime("%Y-%m-%d %H:%M:%S"), "grams": grams,
                                     "certainty": "estimate", "source": "manual"})
    if answer:
        _answer_prompts(client, "no", count=1)
    return database, client


def _answer_prompts(client: TestClient, answer: str, *, count: int | None = None,
                    detector: str | None = None) -> None:
    """The person answers the first ``count`` unanswered prompts (all, unset), of
    one ``detector`` when one is named. Yes ("carbs") records carbs of unknown
    grams at once, as the Prompt's Yes does."""
    pending = [p for p in _get(client, "/api/prompts")
               if p.get("answer") is None and detector in (None, p["detector"])]
    entry = {"entry": {"grams": None, "certainty": "unknown"}} if answer == "carbs" else {}
    for prompt in pending[:count]:
        _post(client, "/api/prompts/answer", {"detector": prompt["detector"],
                                              "anchor_t": prompt["anchor_t"], "answer": answer, **entry})


def fixtures() -> dict:
    """Build both wearer stores and read every endpoint the stories render."""
    with pinned_clock(), tempfile.TemporaryDirectory() as scratch:
        scratch = pathlib.Path(scratch)
        database, client = _wearer(scratch, "wearer", trial=True, answer=False)
        # The Day screen's Prompts before the person answers one, as the top-level
        # `prompts` serves them after it.
        day_prompts = {"wearer-pending": _get(client, "/api/prompts")}
        _answer_prompts(client, "no", count=1)
        status_ok = _get(client, "/api/status")
        outcomes = {str(w): _get(client, "/api/outcomes", window=w) for w in WINDOWS}
        prompts = _get(client, "/api/prompts")
        guidance = _get(client, "/api/guidance")
        queue = {"wearer": _queue_store(client)}
        # The matured Trial, then the same Trial once the person ends it; read
        # before the failed sync below, which leaves the watch to reconcile.
        changes = {"wearer": _changes_store(client)}
        _end_active_trial(client)
        changes["wearer-ended"] = _changes_store(client)
        with Store.open(str(database)) as store:
            store.record_fetch_result(attempted_at=CLOCK.strftime("%Y-%m-%d %H:%M:%S"),
                                      ok=False, error=FAILED_ERROR, error_label=FAILED_LABEL)
        status_failed = _get(client, "/api/status")

        overview = {"wearer": {
            "time_of_day": _profiles(client),
            "analyze": _windows(client),
            "meal_size": _meal_size(client),
            "day_navigator": _day_navigator(client),
        }}
        day = _days(client, overview["wearer"]["day_navigator"])
        settings = _settings(database, client)
        # After every other read of the wearer: the person answers the rest Yes,
        # and Day's Prompts row is gone.
        _answer_prompts(client, "carbs")
        day_prompts["wearer-answered"] = _get(client, "/api/prompts")
        day_prompts.update(_rises(scratch))
        day["prompts"] = _require_prompts({**day_prompts, "wearer": prompts})

        _, pinned = _wearer(scratch, "wearer-pinned", trial=False)
        _pin(pinned)
        queue["wearer-pinned"] = _queue_store(pinned)
        overview["wearer-pinned"] = {"outcomes": _outcomes(pinned)}
        changes["wearer-pinned"] = _changes_store(pinned)
        snooze = _snooze(pinned, pinned_pattern=next(
            f["pattern_key"] for f in changes["wearer-pinned"]["focuses"] if f["status"] == "active"))
        queue["wearer-pinned-snoozed"] = _queue_store(pinned)

        # Done (#518): the person presses Done on the basal card. The Queue and
        # Changes are read while it waits for the pump, then the Queue again
        # after a later sync whose read finds the setting unchanged.
        done_database, done = _wearer(scratch, "wearer-done", trial=False)
        queue["wearer-before-done"] = _queue_store(done)
        _done(done, "setting:basal_rate")
        queue["wearer-done"] = _queue_store(done)
        changes["wearer-done"] = _changes_store(done)
        _unchanged_sync(done_database)
        queue["wearer-not-on-pump"] = _queue_store(done)

        _, first_days = _wearer(scratch, "wearer-first-days", trial=False, days=FIRST_DAYS)
        overview["wearer-first-days"] = {"time_of_day": _profiles(first_days),
                                         "meal_size": _meal_size(first_days)}
        changes["wearer-first-days"] = _changes_store(first_days)
        # Everything the first days admit, snoozed: an empty Queue whose
        # Snoozed list holds them all (§1.3 Queue empty, Queue · Snoozed).
        _snooze_all(first_days)
        queue["wearer-first-days-snoozed"] = _queue_store(first_days)

        # The Changes screen's last change beside an active one: the wearer
        # ends the matured Trial, then pins a Focus (one change is active at a
        # time).
        _, ended_pinned = _wearer(scratch, "wearer-ended-pinned", trial=True)
        _end_active_trial(ended_pinned)
        _pin(ended_pinned)
        changes["wearer-ended-pinned"] = _changes_store(ended_pinned)

        # A Focus pinned on the Trial day, as the person would pin it then,
        # with the rest of the history synced after: matured, and cut a day
        # after the pin, still maturing.
        changes["wearer-focus"] = _changes_store(_focus_wearer(scratch, "wearer-focus"))
        changes["wearer-focus-maturing"] = _changes_store(
            _focus_wearer(scratch, "wearer-focus-maturing", days=ui_patient.TRIAL_DAY + 1))

        _, maturing = _wearer(scratch, "wearer-trial-maturing", trial=True,
                              days=ui_patient.TRIAL_DAY + MATURING_DAYS)
        changes["wearer-trial-maturing"] = _changes_store(maturing)

        # A carb ratio Trial a few days in, two lunches into its block (#524).
        _, ic_maturing = _wearer(scratch, "wearer-ic-maturing", trial=True,
                                 days=ui_patient.TRIAL_DAY + IC_MATURING_DAYS,
                                 changes=((ui_patient.TRIAL_DAY, 1, ui_patient.lunch_profile()),))
        changes["wearer-ic-maturing"] = _changes_store(ic_maturing)
        _require_few_meals(changes["wearer-ic-maturing"])
        # The same change in its first hours: the before arm, and an empty after (#554).
        _, ic_first_hours = _wearer(scratch, "wearer-ic-first-hours", trial=True,
                                    days=ui_patient.TRIAL_DAY + IC_FIRST_HOURS_DAYS,
                                    changes=((ui_patient.TRIAL_DAY, 1, ui_patient.lunch_profile()),))
        changes["wearer-ic-first-hours"] = _changes_store(ic_first_hours)
        _require_empty_after(changes["wearer-ic-first-hours"])
        # A switch to a second profile, which moves the basal and the carb ratio at once.
        _, switched = _wearer(scratch, "wearer-profile", trial=True,
                              changes=((ui_patient.TRIAL_DAY, 2, ui_patient.switch_profile()),))
        changes["wearer-profile"] = _changes_store(switched)
        _require_parameter(changes["wearer-profile"], "profile")
        # Several changes in turn, each ending the one before, and the last
        # ended by the person once matured: the Previous list.
        _, previous = _wearer(scratch, "wearer-previous", trial=True, changes=PREVIOUS_CHANGES)
        _end_active_trial(previous)
        # Then a Focus pinned and ended at once, before any data after its pin.
        _pin(previous)
        _resolve_active_focus(previous)
        changes["wearer-previous"] = _changes_store(previous)
        _require_previous(changes["wearer-previous"])

        _, worse = _wearer(scratch, "wearer-worse", trial=True,
                           profile=ui_patient.trial_profile(ui_patient.WORSE_PROFILE_BASAL),
                           trial_basal=ui_patient.WORSE_TRIAL_BASAL)
        changes["wearer-worse"] = _changes_store(worse)
        queue["wearer-worse"] = _queue_store(worse)
        # Its wrong-direction Trial adds lows: the Overview's served worsening.
        overview["wearer-worse"] = {"outcomes": _outcomes(worse)}
        _require_result(changes["wearer"], "favorable")
        _require_result(changes["wearer-worse"], "concerning")

        supported = scratch / "isf-supported.sqlite"
        with Store.open(str(supported)) as store:
            qa_e2e_cases._materialize_isf_coverage(store, **ISF_SUPPORTED)
        supported_client = _serve(supported)
        overview["isf-supported"] = {"analyze": _windows(supported_client)}
        queue["isf-supported"] = _queue_store(supported_client)

        # The wearer's I:C holds, so the carb-ratio Setting is queued from the QA
        # case whose meals support lowering it.
        carb_ratio = scratch / "carb-ratio-supported.sqlite"
        with Store.open(str(carb_ratio)) as store:
            qa_e2e_cases.materialize_case(store, next(
                case for case in qa_e2e_cases.QA_CASES if case.name == CARB_RATIO_CASE))
        queue["carb-ratio-supported"] = _queue_store(_serve(carb_ratio))

        # A standalone habit (ADR 528): its two rises, then pinned, and the
        # wearer's many.
        missed_meal = scratch / "missed-meal.sqlite"
        with Store.open(str(missed_meal)) as store:
            qa_e2e_cases.materialize_case(store, next(
                case for case in qa_e2e_cases.QA_CASES if case.name == MISSED_MEAL_CASE))
        missed_meal_client = _serve(missed_meal)
        queue["missed-meal"] = _queue_store(missed_meal_client)
        _pin_habit(missed_meal_client)
        queue["missed-meal-pinned"] = _queue_store(missed_meal_client)
        changes["missed-meal-pinned"] = _changes_store(missed_meal_client)
        _, habitual = _wearer(scratch, "wearer-habit", trial=False, unbolused=HABIT_UNBOLUSED)
        queue["wearer-habit"] = _queue_store(habitual)

        # The Meal size card with sizes no meal falls in: the QA showcase, whose
        # meals are all 40 g or more (#501).
        showcase = scratch / "qa-showcase.sqlite"
        with Store.open(str(showcase)) as store:
            qa_e2e_cases.materialize_case(store, next(
                case for case in qa_e2e_cases.QA_CASES if case.name == MEAL_SIZE_CASE))
        overview[MEAL_SIZE_CASE] = {"meal_size": _meal_size(_serve(showcase))}

        unsynced = scratch / "wearer-unsynced.sqlite"
        with Store.open(str(unsynced)):
            pass
        unsynced_client = _serve(unsynced)
        overview["wearer-unsynced"] = {"outcomes": _outcomes(unsynced_client),
                                       "meal_size": _meal_size(unsynced_client),
                                       "guidance": {"disposition": _get(unsynced_client, "/api/guidance")["disposition"]}}
        _require_meal_sizes(overview)
        settings["pump_settings"]["wearer-unsynced"] = _pump_settings(unsynced_client)
    return {
        "_generated_by": GENERATED_BY,
        "_note": ("Synthetic only: a seeded simulated Control-IQ wearer "
                  "(scripts/ui_patient.py) ingested into scratch stores and served "
                  "by the public API, in process. overview.isf-supported is "
                  "scripts/qa_e2e_cases.py's manufactured fasting nights, served "
                  "the same way. status.failed adds one invented failed sync "
                  "attempt."),
        "status": {"ok": status_ok, "failed": status_failed},
        "prompts": [prompt_marks(p) for p in prompts],
        "outcomes": {key: _outcome(answer) for key, answer in outcomes.items()},
        "guidance": {
            "candidates": [
                {field: candidate[field] for field in ("subject", "kind", "title", "priority")}
                for candidate in guidance["candidates"]
            ],
        },
        "queue": queue,
        "overview": overview,
        "changes": changes,
        "day": day,
        "settings": settings,
        "snooze": snooze,
        "glossary": glossary(),
        "states": {**states(queue), "isf": isf_states(overview)},
    }


def _credentials(client: TestClient) -> dict:
    """The account rows' answer, the email fully masked. The .env fallback is
    blocked (as in an api-only install) so no real credential is ever read."""
    with patch.dict(sys.modules, {"tconnectsync": None}):
        answer = _get(client, "/api/credentials")
    return {"configured": answer["configured"], "region": answer["region"],
            "email": MASK if answer["email"] else None}


def _pump_settings(client: TestClient) -> dict:
    answer = _get(client, "/api/pump-settings")
    if not answer["configured"]:
        return {"configured": False}
    profile = answer["profile"]
    return {"configured": True, "fetched_at": answer["fetched_at"],
            "profile": {**{field: profile[field] for field in ("name", "dia_hours", "max_bolus")},
                        "segments": profile["segments"]}}


def _status(answer: dict) -> dict:
    return {field: answer[field] for field in
            ("last_attempt_at", "last_success_at", "last_error", "last_error_label",
             "earliest_data_day", "latest_data_day", "data_day_count")}


def _settings(database: pathlib.Path, client: TestClient) -> dict:
    """The Settings screens' answers from the wearer's store, read after every
    other read of it: the account unset and then set, a sync that succeeds and
    then a later one that fails, and the pump profile."""
    unset = _credentials(client)
    _post(client, "/api/credentials", {"email": SYNTHETIC_EMAIL, "password": "synthetic", "region": "US"})
    configured = _credentials(client)
    stamp = "%Y-%m-%d %H:%M:%S"
    with Store.open(str(database)) as store:
        store.record_fetch_result(attempted_at=SYNC_OK_AT.strftime(stamp), ok=True)
    synced = _status(_get(client, "/api/status"))
    with Store.open(str(database)) as store:
        store.record_fetch_result(attempted_at=SYNC_FAILED_AT.strftime(stamp), ok=False, error=FAILED_ERROR,
                                  error_label=FAILED_LABEL)
    failed = _status(_get(client, "/api/status"))
    return {
        "credentials": {"unset": unset, "set": configured},
        "status": {"synced": synced, "failed": failed},
        "pump_settings": {"wearer": _pump_settings(client)},
    }


def _snooze(client: TestClient, *, pinned_pattern: str) -> dict:
    """The person snoozes the first admitted pattern other than the one their
    Focus watches, and the engine serves the decision time the snooze bar dates
    from."""
    answer = _get(client, "/api/guidance")
    candidate = next(c for c in answer["candidates"] if c["kind"] == "pattern" and c["admitted"]
                     and not c["preference"]["set_aside"] and c["subject"] != f"pattern:{pinned_pattern}")
    response = client.put(f"/api/guidance/preferences/{candidate['subject']}",
                          json={"generation": answer["analysis_generation"]})
    response.raise_for_status()
    after = next(c for c in _get(client, "/api/guidance")["candidates"] if c["subject"] == candidate["subject"])
    return {"subject": after["subject"], "title": after["title"],
            "set_aside": after["preference"]["set_aside"], "decided_at": after["decision"]["decided_at"]}


def _snooze_all(client: TestClient) -> None:
    """The person snoozes every candidate the Queue holds."""
    answer = _get(client, "/api/guidance")
    for candidate in answer["candidates"]:
        if candidate["admitted"] and not candidate["preference"]["set_aside"]:
            client.put(f"/api/guidance/preferences/{candidate['subject']}",
                       json={"generation": answer["analysis_generation"]}).raise_for_status()
            answer = _get(client, "/api/guidance")


def glossary() -> list[dict]:
    """§1.5's rows, the Glossary page's terms and their one-line definitions."""
    rows = []
    for line in _section(DESIGN.read_text(), "### 1.5 Glossary").splitlines():
        match = re.match(r"\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$", line)
        if match:
            # The table's Markdown code spans print as plain words.
            rows.append({"term": match.group(1), "kind": match.group(2),
                         "meaning": match.group(3).replace("`", "")})
    return sorted(rows, key=lambda row: row["term"].lower())


_OUTCOME_FIELDS = ("window_days", "span_start", "span_end", "coverage", "metrics")


def _outcome(answer: dict) -> dict:
    """An outcomes answer and its previous period, by the same fields."""
    return {**{field: answer[field] for field in _OUTCOME_FIELDS},
            "previous": {field: answer["previous"][field] for field in _OUTCOME_FIELDS}}


def _outcomes(client: TestClient) -> dict:
    return {str(w): _outcome(_get(client, "/api/outcomes", window=w)) for w in WINDOWS}


def _profiles(client: TestClient) -> dict:
    """The glucose profile for each window the Overview switches between."""
    return {str(w): _time_of_day(client, w) for w in WINDOWS}


def _time_of_day(client: TestClient, days: int) -> dict:
    """The glucose profile's answer: the pooled 15-minute bins and meal buckets."""
    answer = _get(client, "/api/explore/time-of-day", days=days)
    pooled = answer["pooled"]
    return {
        "window": answer["window"],
        "target_range": answer["target_range"],
        "pooled": pooled and {
            "bin_minutes": pooled["bin_minutes"],
            "bins": [{field: b[field] for field in ("minute", "supported", "median", "p10", "p25", "p75", "p90")}
                     for b in pooled["bins"]],
            "meals": [{field: m[field] for field in ("minute", "count")} for m in pooled["meals"]],
        },
    }


def _isf(analysis: dict) -> list[dict]:
    """``/api/analyze``'s first ISF segment, trimmed to what the ISF card reads."""
    return [
        {**{field: r[field] for field in ("current", "recommended", "asserts_move")},
         # A store too short for an estimate serves none.
         "estimate": r["estimate"] and {field: r["estimate"][field]
                                        for field in ("value", "lo", "hi", "wide", "n_clusters")},
         "evidence": {"night_fits": [{field: f[field] for field in ("date", "isf")}
                                     for f in r["evidence"]["night_fits"]]}}
        for r in analysis["isf"][:1]]


def _ic_blocks(analysis: dict) -> list[dict]:
    """``/api/analyze``'s carb-ratio blocks the engine stages a move for, trimmed to
    what the I:C Setting card reads: the block, its programmed and recommended
    ratios, its estimate, and the meal runs that estimate counts (ADR 523)."""
    return [
        {**{field: b[field] for field in
            ("block_id", "start_min", "end_min", "current_values", "recommended")},
         "estimate": {field: b["estimate"][field] for field in ("value", "lo", "hi")},
         "evidence": {"counted_runs": b["evidence"]["counted_runs"]}}
        for b in analysis["ic_blocks"] if b["asserts_move"]]


def _basal_slots(analysis: dict) -> list[dict]:
    """``/api/analyze``'s 48 basal slots, trimmed to what the Overview's basal card
    reads: the programmed rate, the estimate over its range, and the one staging
    verdict with its direction (ADR 523)."""
    return [
        {**{field: b[field] for field in ("slot", "current", "asserts_move", "direction")},
         "estimate": b["estimate"] and {field: b["estimate"][field] for field in ("value", "lo", "hi")}}
        for b in analysis["basal"]]


def _windows(client: TestClient) -> dict:
    """The Overview's ISF estimate and basal cards for each window, from one read."""
    out = {}
    for w in WINDOWS:
        analysis = _get(client, "/api/analyze", window=w)
        out[str(w)] = {"isf": _isf(analysis), "basal": _basal_slots(analysis)}
    return out


def _meal_size(client: TestClient) -> dict:
    """``/api/explore/meal-size``, trimmed to what the Meal size card reads: each
    meal as the dot it draws (its climb), each size's medians and counts, the
    window as the days its title prints, and the hours At 3 h is read at (#501)."""
    answer = _get(client, "/api/explore/meal-size")
    return {
        "window": answer["window"] and {"data_days": answer["window"]["data_days"]},
        "horizon_hours": answer["horizon_hours"],
        "sizes": [{**{field: size[field] for field in ("carbs_from", "carbs_to", "climb", "to_peak", "at_3h")},
                   "meals": [{"climb": meal["climb"]} for meal in size["meals"]]}
                  for size in answer["sizes"]],
    }


def _require_meal_sizes(overview: dict) -> None:
    """Fail unless each Meal size story's store still serves its state: the wearer
    a meal in every size, its first days a single 60 g+ meal, the showcase a size
    with no meal beside one with some, and the unsynced store no window."""
    def counts(store):
        return [len(size["meals"]) for size in overview[store]["meal_size"]["sizes"]]
    wearer, first, showcase = counts("wearer"), counts("wearer-first-days"), counts(MEAL_SIZE_CASE)
    if (min(wearer) == 0 or first[-1] != 1 or 0 not in showcase or not any(showcase)
            or overview["wearer-unsynced"]["meal_size"]["window"] is not None):
        raise SystemExit(f"the Meal size stores no longer serve their states: {wearer} {first} {showcase}")


def _day_navigator(client: TestClient) -> dict:
    answer = _get(client, "/api/day-navigator", month=NAVIGATOR_MONTH)
    return {
        "month": answer["month"],
        "days": [{field: d[field] for field in ("iso", "has_data", "lows", "highs", "tir", "curve")}
                 for d in answer["days"]],
    }


def _outcome_rows(rows: list[dict]) -> list[dict]:
    """A Trial comparison's outcome rows: Before, After and the per-outcome verdict."""
    return [{"key": r["key"], "unit": r["unit"], "before": r["before"], "after": r["after"],
             "assessment": {"state": r["assessment"]["state"]}} for r in rows]


# A trial roster row's fields the Changes screen reads: what changed, where and
# when, its state, its days, and (a whole-profile switch) the settings it moved.
TRIAL_FIELDS = ("id", "parameter", "slot", "changed_at", "before", "after", "state", "maturing",
                "target_metrics", "block")
CONSTITUENT_FIELDS = ("parameter", "slot", "before", "after")


def _comparison(answer: dict) -> dict:
    """The active Trial's retained comparison, trimmed to what the Changes
    screen draws (#524): its availability, the outcome rows, each arm's meals,
    and each arm's trace and (a basal Trial) Control-IQ's delivery against the
    programmed rate."""
    comparison = answer["selected"]["reassessment"]["comparison"]
    return {
        "availability": {"state": comparison["availability"]["state"]},
        # Each row with the readings it is read from (#554).
        "outcomes": [{**row, "denominators": served["denominators"]}
                     for row, served in zip(_outcome_rows(comparison["outcomes"]), comparison["outcomes"])],
        "denominators": {arm: {"contributing_meals": served["contributing_meals"]}
                         for arm, served in comparison.get("denominators", {}).items()},
        "views": {arm: {key: view[key] for key in ("trace", "basal") if key in view}
                  for arm, view in comparison.get("views", {}).items()},
    }


def _changes_store(client: TestClient) -> dict:
    """The Changes components' answers from one store: the admission, every
    Trial on the roster (the active one with its retained comparison, every
    other a previous change, #524), and the Focus records with their served
    titles."""
    answer = _get(client, "/api/verify/trials")
    admission = answer["admission"]
    trials = []
    for t in answer["trials"]:
        ending = t["ending"]
        row = {field: t[field] for field in TRIAL_FIELDS}
        if "changes" in t:
            row["changes"] = [{field: c[field] for field in CONSTITUENT_FIELDS} for c in t["changes"]]
        row["ending"] = ({"kind": ending["kind"], "effective_at": ending["effective_at"],
                          "assessment": {"outcomes": _outcome_rows(ending["assessment"].get("outcomes", []))}}
                         if "kind" in ending else {"state": ending["state"]})
        if t["watch_disposition"] == "active":
            row["reassessment"] = _comparison(
                _get(client, "/api/verify/trials", selected=t["id"], assessment="retained"))
        trials.append(row)
    focuses = []
    for f in answer["focuses"]:
        # The active Focus, and each ended one: a previous change (#524).
        if f["status"] != "active" and "kind" not in (f.get("ending") or {}):
            continue
        detail =_get(client, "/api/verify/trials", kind="focus", selected=str(f["id"]))["selected"]
        focuses.append({**{field: f.get(field) for field in ("id", "lever", "pattern_key", "pinned_at", "status")},
                        "title": detail["title"], "lever_title": detail["lever_title"],
                        **({"tracking": _focus_tracking(client, f["id"])} if f["status"] == "active" else {}),
                        **({"ending": _focus_ending(f["ending"])} if "kind" in (f.get("ending") or {}) else {})})
    return {
        "admission": {field: admission[field] for field in
                      ("state", "active_kind", "active_id", "can_finish_trial", "maturity")},
        "trials": trials,
        "focuses": focuses,
        # Each Setting a Done left waiting for the pump, served on the roster (#518).
        "waiting": answer["waiting"],
    }


def _done(client: TestClient, subject: str) -> None:
    """The person presses Done on ``subject``'s Setting card (#518)."""
    answer = _get(client, "/api/guidance")
    _post(client, "/api/plan/apply", {"subject": subject, "request_id": f"done {subject}",
                                       "input_revision": answer["input_revision"],
                                       "analysis_generation": answer["analysis_generation"]})


def _unchanged_sync(database: pathlib.Path) -> None:
    """A later sync, as a fetch would land it: pump data from after the Done
    and a settings read whose active profile is unchanged."""
    with Store.open(str(database)) as store:
        settings = store.settings_snapshots()[-1].settings
        segment = settings.active().segments[0]
        store.upsert_basal([{"seq_num": 10**9, "time": (CLOCK + timedelta(minutes=10)).strftime("%Y-%m-%d %H:%M:%S"),
                             "delivery_type": "profileDelivery", "duration_mins": 5,
                             "basal_rate": segment.basal_rate, "profile_basal_rate": segment.basal_rate}])
        store.upsert_settings_snapshot((CLOCK + timedelta(minutes=30)).strftime("%Y-%m-%d %H:%M:%S"), settings)
        reconcile_ingested_follow_up(store)


def _focus_wearer(scratch: pathlib.Path, name: str, *, days: int = ui_patient.DAYS) -> TestClient:
    """The wearer synced up to the Trial day, a Focus pinned then through
    ``POST /api/focus``, and the rest of the history (to ``days``) synced after,
    so the Focus has its own after period. No profile change: no Trial."""
    database = scratch / f"{name}.sqlite"
    with Store.open(str(database)) as store:
        ui_patient.materialize(store, trial=False, days=ui_patient.TRIAL_DAY)
        reconcile_ingested_follow_up(store)
    with clock_at(ui_patient.START + timedelta(days=ui_patient.TRIAL_DAY, hours=1)):
        _pin(_serve(database))
    with Store.open(str(database)) as store:
        ui_patient.materialize(store, trial=False, days=days)
        reconcile_ingested_follow_up(store)
    return _serve(database)


# The outcome rows a Focus card shows: the glossary metrics, and the peak and
# nadir a meal Pattern's Focus maps to.
FOCUS_OUTCOMES = ("tir", "tbr", "tar", "peak", "nadir")


def _focus_tracking(client: TestClient, focus_id: int) -> dict:
    """A Focus's served comparison, trimmed to what its card shows: the after
    period's readiness (meals counted against the engine's gate), adherence
    before and after with its verdict, and the outcome rows with their role;
    or, before any after period exists, the served unavailability."""
    comparison = _get(client, "/api/verify/trials", kind="focus", selected=str(focus_id),
                      assessment="retained")["selected"]["reassessment"]["comparison"]
    if "readiness" not in comparison:
        # Pinned at the end of the history: no after period to compare yet.
        return {"availability": comparison["availability"]}
    after = comparison["readiness"]["after"]
    adherence = comparison["adherence"]
    return {
        "readiness": {field: after[field] for field in ("unit", "count", "required", "criterion_met")},
        "adherence": {
            **{arm: {field: adherence[arm][field] for field in ("numerator", "opportunities", "rate")}
               for arm in ("before", "after")},
            "assessment": {"state": adherence["assessment"]["state"]},
        },
        "outcomes": [{**{field: row[field] for field in ("key", "unit", "before", "after", "role")},
                      "assessment": {"state": row["assessment"]["state"]}}
                     for row in comparison["outcomes"] if row["key"] in FOCUS_OUTCOMES],
    }


def _require_result(store: dict, state: str) -> None:
    """Fail unless the store's matured Trial serves ``state`` on its target metric:
    the ChangeCard's matured story reads it, and a story must never quietly
    show a result the engine no longer serves."""
    trial = next(t for t in store["trials"] if t["id"] == store["admission"]["active_id"])
    served = {row["assessment"]["state"] for row in trial["reassessment"]["outcomes"]
              if row["key"] in trial["target_metrics"]}
    if served != {state}:
        raise SystemExit(f"the simulated Trial {trial['id']} no longer serves {state}: {served}")


def _focus_ending(ending: dict) -> dict:
    """An ended Focus's saved ending, trimmed to what its Previous row prints:
    when it ended and, where the ending saved one, the verdict on the habit."""
    adherence = ending.get("assessment", {}).get("adherence")
    return {"kind": ending["kind"], "effective_at": ending["effective_at"],
            "assessment": ({"adherence": {"assessment": {"state": adherence["assessment"]["state"]}}}
                           if adherence else {})}


def _active_trial(store: dict) -> dict:
    return next(t for t in store["trials"] if t["id"] == store["admission"]["active_id"])


def _require_few_meals(store: dict) -> None:
    """Fail unless the store's active Trial is a maturing carb ratio Trial whose
    after period has fewer meals than a band needs, so its story draws each one."""
    trial = _active_trial(store)
    after = trial["reassessment"]["views"]["after"]["trace"]
    if (trial["parameter"], trial["state"]) != ("carb_ratio", "maturing") or not after["traces"]:
        raise SystemExit(f"the simulated carb ratio Trial no longer matures on a few meals: {trial['id']}")


def _require_empty_after(store: dict) -> None:
    """Fail unless the store's active Trial is a maturing carb ratio Trial whose
    comparison serves its before arm and an after arm with nothing read yet."""
    trial = _active_trial(store)
    comparison = trial["reassessment"]
    if ((trial["parameter"], trial["state"], comparison["availability"]["state"])
            != ("carb_ratio", "maturing", "available")
            or comparison["denominators"]["after"]["contributing_meals"]
            or any(row["after"] is not None for row in comparison["outcomes"])):
        raise SystemExit(f"the simulated carb ratio Trial's first hours no longer read nothing after: {trial['id']}")


def _require_parameter(store: dict, parameter: str) -> None:
    """Fail unless the store's active Trial is a ``parameter`` Trial."""
    if _active_trial(store)["parameter"] != parameter:
        raise SystemExit(f"the simulated Trial is no longer a {parameter} Trial")


def _require_previous(store: dict) -> None:
    """Fail unless the store holds three previous Trials, one with a served
    result on its target metric and one without, and one ended Focus."""
    served = [any(row["key"] in t["target_metrics"]
                  for row in t["ending"].get("assessment", {}).get("outcomes", []))
              for t in store["trials"]]
    ended = [f for f in store["focuses"] if "ending" in f]
    if (len(served) != 3 or store["admission"]["active_id"] is not None or set(served) != {True, False}
            or len(ended) != 1):
        raise SystemExit(f"the simulated changes no longer leave the previous changes: {served}, {len(ended)}")


def _end_active_trial(client: TestClient) -> None:
    """The person ends the matured active Trial, as the End action posts it."""
    answer = _get(client, "/api/verify/trials")
    active = answer["admission"]["active_id"]
    _post(client, f"/api/verify/trials/{active}/finish",
          {"request_id": "ui-fixtures-end", "input_revision": answer["input_revision"]})


def _resolve_active_focus(client: TestClient) -> None:
    """The person ends the active Focus, as the End action posts it."""
    active = _get(client, "/api/verify/trials")["admission"]["active_id"]
    _post(client, f"/api/focus/{active}/resolve", {})


def _days(client: TestClient, navigator: dict) -> dict:
    """One day's timeline and logged carbs for each Day story, by rule: the
    latest day with readings, a site change and no logged carbs, the latest of
    the days with the most logged carbs, the first day after the history ends,
    and the latest day with readings (the Day screen's default)."""
    logged: dict = {}
    for entry in _get(client, "/api/carbs")["carb_entries"]:
        logged[entry["t"][:10]] = logged.get(entry["t"][:10], 0) + 1
    with_data = [d["iso"] for d in navigator["days"] if d["has_data"]]

    def site_change(iso: str) -> bool:
        start = datetime.fromisoformat(f"{iso}T00:00:00")
        return bool(_get(client, "/api/timeline", start=start.isoformat(),
                         end=(start + timedelta(days=1)).isoformat())["pump_events"])

    picks = {
        "default": next(iso for iso in reversed(with_data) if iso not in logged and site_change(iso)),
        "with_carbs": max((iso for iso in with_data if iso in logged), key=lambda iso: (logged[iso], iso)),
        "no_data": next(d["iso"] for d in navigator["days"] if not d["has_data"] and d["iso"] > with_data[-1]),
        "latest": with_data[-1],
    }
    days = {}
    for iso in sorted(set(picks.values())):
        start = f"{iso}T00:00:00"
        end = (datetime.fromisoformat(start) + timedelta(days=1)).isoformat()
        timeline = _get(client, "/api/timeline", start=start, end=end)
        carbs = _get(client, "/api/carbs", start=start, end=end)
        model_view = _get(client, "/api/model-view", date=iso)
        days[iso] = {
            "timeline": {
                "cgm": timeline["cgm"],
                "boluses": [{field: b[field] for field in ("t", "insulin", "carbs")} for b in timeline["boluses"]],
                "basal": [{field: b[field] for field in ("t", "duration_mins", "basal_rate", "profile_basal_rate")}
                          for b in timeline["basal"]],
                "pump_events": timeline["pump_events"],
                "sleep_windows": timeline["sleep_windows"],
                # The day's insulin split (ADR 492), as the InsulinBar draws it.
                "insulin_totals": timeline["insulin_totals"] and {
                    field: timeline["insulin_totals"][field]
                    for field in ("basal", "meal", "correction", "control_iq_bolus", "total")},
            },
            "carbs": {"carb_entries": [{field: e[field] for field in ("id", "t", "grams", "certainty", "source")}
                                       for e in carbs["carb_entries"]]},
            "model_view": model_view_marks(model_view),
        }
    return {"states": picks, "days": days}


def model_view_marks(model_view: dict) -> dict:
    """``/api/model-view`` trimmed to what the Day chart marks (§4.2 DayChart):
    the day's findings, each anchor's time, kind and glucose and the habits it
    counts toward. The live adapter trims the same."""
    return {"date": model_view["date"], "findings": [{
        **{field: finding[field] for field in ("t", "kind", "bg")},
        "levers": [{field: lever[field] for field in ("lever", "title")} for lever in finding["levers"]],
    } for finding in model_view["findings"]]}


def _rises(scratch: pathlib.Path) -> dict:
    """Day's Rises (#529): the wearer with two lunches in the last week never
    bolused for, which the engine asks about as possible meals. The person
    answers every low but the latest, as the wearer's store has one open, then
    the rises one at a time: ``rises-pending`` before any, ``rises`` after a No,
    and ``rises-answered`` once the other is answered Yes."""
    _, client = _wearer(scratch, "wearer-rises", trial=True, answer=False, unbolused=UNBOLUSED_LUNCHES)
    lows = [p for p in _get(client, "/api/prompts") if p["detector"] == "low" and p["answer"] is None]
    _answer_prompts(client, "no", count=len(lows) - 1, detector="low")
    stores = {"rises-pending": _get(client, "/api/prompts")}
    _answer_prompts(client, "no", count=1, detector="missed-meal")
    stores["rises"] = _get(client, "/api/prompts")
    _answer_prompts(client, "carbs", detector="missed-meal")
    stores["rises-answered"] = _get(client, "/api/prompts")
    return stores


def prompt_marks(prompt: dict) -> dict:
    """``/api/prompts``'s prompt trimmed to what a PromptCard draws (§4.2): its
    identity, the reading it is about and when, the readings around it, and its
    answer. The engine's question and context sentences are never shown. The
    live adapter trims the same."""
    return {field: prompt[field] for field in ("detector", "anchor_t", "key_t", "key_bg", "cgm", "answer")}


def _require_prompts(stores: dict) -> dict:
    """Day's Prompts, trimmed: the wearer's stores serve lows only, stepping one
    answer apart from two unanswered to none, and the Rises stores step their
    rises the same way under one open low, so a prompt's place ("1 / 2") is the
    difference of two served counts. ``wearer`` is the top-level ``prompts`` and
    is not repeated."""
    def open_(name: str, detector: str) -> int:
        return sum(p["answer"] is None and p["detector"] == detector for p in stores[name])
    families = {("low", ("wearer-pending", "wearer", "wearer-answered")): [2, 1, 0],
                ("missed-meal", ("wearer-pending", "wearer", "wearer-answered")): [0, 0, 0],
                ("missed-meal", ("rises-pending", "rises", "rises-answered")): [2, 1, 0],
                ("low", ("rises-pending", "rises", "rises-answered")): [1, 1, 1]}
    for (detector, names), want in families.items():
        counts = [open_(name, detector) for name in names]
        if counts != want:
            raise SystemExit(f"the Day prompt stores {names} serve {counts} unanswered {detector}, not {want}")
    return {name: [prompt_marks(p) for p in served] for name, served in stores.items() if name != "wearer"}


def _pin(client: TestClient) -> None:
    """Pin a Focus on the first pattern whose habit the engine lets the person pin."""
    for candidate in _get(client, "/api/guidance")["candidates"]:
        if candidate["kind"] != "pattern":
            continue
        response = client.post("/api/focus", json={
            "pattern_key": candidate["pattern_key"],
            "outcome_window": {"start_min": 0, "end_min": 1440},
        })
        if response.status_code == 200:
            return
    raise SystemExit("the engine lets the wearer pin no pattern")


def _pin_habit(client: TestClient) -> None:
    """Pin a Focus on the first standalone habit the Queue holds (ADR 528)."""
    habit = next(c for c in _get(client, "/api/guidance")["candidates"]
                 if c["kind"] == "habit" and c["admitted"])
    _post(client, "/api/focus", {"lever": habit["lever"]})


ROW_FIELDS = ("id", "kind", "title", "chips", "claimed_by", "lever", "parameter",
              "count_sentences", "fold_sentences", "span", "members", "served_as")


def _queue_store(client: TestClient) -> dict:
    """The Queue components' answers from one store, trimmed to what they read."""
    findings = _get(client, "/api/diagnose/findings")
    guidance = _get(client, "/api/guidance")
    analyze = _get(client, "/api/analyze")
    trials = _get(client, "/api/verify/trials")
    focus = _get(client, "/api/focus")
    # A pattern that collapses to its one member is served as that member's
    # habit row ("finding:<lever>"), which the Queue reads it through; a
    # standalone habit's own row is its card's tone (ADR 528).
    habits = [c["subject"] for c in guidance["candidates"] if c["kind"] == "habit" and c["admitted"]]
    collapsed = {f"finding:{p['action'].split(':', 1)[1]}" for p in findings["outcome_patterns"]
                 if p.get("collapse") == "collapse_to_member" and p.get("action")}
    collapsed |= {f"finding:{subject.split(':', 1)[1]}" for subject in habits}
    return {
        "findings": {
            "outcome_patterns": [
                {**{field: p[field] for field in ("key", "subject", "title", "k", "n")},
                 "wide": p.get("wide"), "collapse": p.get("collapse"), "action": p.get("action")}
                for p in findings["outcome_patterns"]
            ],
            "rows": [
                {field: r.get(field) for field in ROW_FIELDS}
                for r in findings["rows"]
                if r["kind"] == "pattern" or r.get("claimed_by") or r["id"] in collapsed
                or (r["kind"] == "setting" and r.get("members"))
            ],
        },
        "guidance": {
            "candidates": [
                {"subject": c["subject"], "kind": c["kind"], "title": c["title"], "units": c["units"],
                 "priority": c["priority"], "admitted": c["admitted"],
                 "set_aside": c["preference"]["set_aside"],
                 "decided_at": (c.get("decision") or {}).get("decided_at"),
                 "acknowledgment": c.get("acknowledgment"),
                 # The Queue's order rule (the brief's Queue section): admitted,
                 # not set aside and not waiting for the pump after a Done
                 # (#518), ranked by priority.
                 "queued": (c["admitted"] and not c["preference"]["set_aside"]
                            and (c.get("acknowledgment") or {}).get("state") != "waiting")}
                for c in guidance["candidates"]
            ],
        },
        "analyze": {
            "basal": [
                {**{field: b[field] for field in
                    ("slot", "label", "current", "recommended", "estimate", "days")},
                 "evidence": {"night_roster": [
                     {field: night[field] for field in ("date", "delivered_rate", "programmed_rate")}
                     for night in b["evidence"]["night_roster"]
                 ]}}
                for b in analyze["basal"] if b.get("asserts_move")
            ],
            # The Queue's ISF card is the Overview's, over the engine's default window.
            "isf": _isf(analyze),
            "ic_blocks": _ic_blocks(analyze),
        },
        "trials": {
            "trials": [
                {field: t[field] for field in
                 ("id", "parameter", "slot", "block", "changed_at", "before", "after", "state", "maturing")}
                for t in trials["trials"]
            ],
        },
        "focus": {
            "focuses": [
                {field: f.get(field) for field in ("id", "lever", "subject", "pattern_key", "status")}
                for f in focus["focuses"]
            ],
        },
        "cases": _cases(client, [c["subject"] for c in guidance["candidates"]
                                 if c["kind"] == "pattern" and c["admitted"]] + habits),
    }


def _traces(served: dict) -> dict:
    """A case file's trace chart, trimmed to what the open Pattern card draws: the
    anchor and window, the Pattern's episodes and bins, and Typical's bins (ADR 523)."""
    return {"anchor": served["anchor"], "window_min": served["window_min"],
            "pattern": {field: served["pattern"][field] for field in ("episodes", "points")},
            "typical": {"points": served["typical"]["points"]}}


def _case_file(subject: str, served: dict) -> dict:
    """A case file trimmed to what its card reads: a Pattern's trace chart (ADR
    523), and a standalone habit's with the count its card prints, the habit's own
    claimed of its denominator (ADR 528). The live adapter trims the same."""
    if subject.startswith("habit:"):
        return {"summary": {field: served["summary"][field] for field in ("claimed", "denominator", "noun")},
                "traces": _traces(served["traces"])}
    return {"traces": _traces(served["traces"])}


def _cases(client: TestClient, subjects: list[str]) -> dict:
    """Each admitted Pattern's and standalone habit's event-aligned case file,
    trimmed to its card, by its key: the pattern key, or the habit's lever, whose
    case file is its finding's. One whose case file serves no inspectable member
    (404) has no entry."""
    preparation = _get(client, "/api/diagnose/finding-case-file-preparation")
    cases = {}
    for subject in subjects:
        kind, key = subject.split(":", 1)
        response = client.get("/api/diagnose/finding-case-file", params={
            "projection_id": preparation["projection_id"],
            "finding_id": f"finding:{key}" if kind == "habit" else subject, "alignment": "event"})
        if response.status_code == 404:
            continue
        response.raise_for_status()
        cases[key] = _case_file(subject, response.json())
    return cases


def _patterns(store: dict) -> list[dict]:
    """Queued patterns with a served trace chart: how many episodes it draws one by
    one (None when it serves their median and band), and whether one of them runs
    through a gap in its readings, longer than two 5-minute readings."""
    out = []
    for candidate in store["guidance"]["candidates"]:
        key = candidate["subject"].removeprefix("pattern:")
        if candidate["kind"] != "pattern" or not candidate["queued"] or key not in store["cases"]:
            continue
        episodes = store["cases"][key]["traces"]["pattern"]["episodes"]
        out.append({"key": key, "episodes": None if episodes is None else len(episodes),
                    "gap": any(b["minute"] - a["minute"] > 10 for episode in episodes or ()
                               for a, b in zip(episode, episode[1:]))})
    return out


def _habits(stores: dict) -> list[dict]:
    """Queued standalone habits with a served case file (ADR 528), by store: how
    many episodes the chart draws one by one (None for a median and band), and
    whether a Focus is pinned on the habit itself."""
    out = []
    for name, store in stores.items():
        for candidate in store["guidance"]["candidates"]:
            key = candidate["subject"].removeprefix("habit:")
            if candidate["kind"] != "habit" or not candidate["queued"] or key not in store["cases"]:
                continue
            episodes = store["cases"][key]["traces"]["pattern"]["episodes"]
            out.append({"store": name, "subject": candidate["subject"],
                        "episodes": None if episodes is None else len(episodes),
                        "pinned": any(f["status"] == "active" and f["subject"] == candidate["subject"]
                                      for f in store["focus"]["focuses"])})
    return out


def _blocks(store: dict) -> list[dict]:
    """Admitted basal blocks: their start, range, nights and whether a Trial matured there."""
    out = []
    for row in store["findings"]["rows"]:
        if row["kind"] != "setting" or row.get("parameter") != "basal_rate" or not row.get("members"):
            continue
        start = row["span"]["start_min"]
        slot = next(b for b in store["analyze"]["basal"] if b["slot"] * 30 == start)
        estimate = row["members"][0]["estimate"]
        out.append({
            "start": start,
            "collapsed": estimate["lo"] == estimate["hi"],
            "spread": len({n["delivered_rate"] for n in slot["evidence"]["night_roster"]}) > 1,
            "trial": any(t["parameter"] == "basal_rate" and t["state"] == "complete"
                         and _overlaps(row["span"], t) for t in store["trials"]["trials"]),
        })
    return out


def _overlaps(span: dict, trial: dict) -> bool:
    """Whether a queued basal block shares a half-hour with the block the Trial is
    measured across (#506), either of them wrapping midnight; the rule
    ``queue-model.ts`` ``maturedTrial`` applies. A Trial served with no block is
    read at its one slot, or over the whole day when it has none."""
    def minutes(start: int, end: int) -> set[int]:
        return {m % 1440 for m in range(start, end if end > start else end + 1440, 30)}
    block = trial["block"]
    if block is None:
        slot = trial["slot"]
        start = int(slot[:2]) * 60 + int(slot[3:]) if slot else 0
        block = (start, start + 30) if slot else (0, 1440)
    return bool(minutes(span["start_min"], span["end_min"]) & minutes(*block))


def states(queue: dict) -> dict:
    """The store and subject behind each story state, chosen from the served
    answers: the wearer's, or else the first other store that serves it."""
    stores = ("wearer", "wearer-pinned", "wearer-worse")
    patterns = _patterns(queue["wearer"])
    blocks = [{**b, "store": store} for store in stores for b in _blocks(queue[store])]

    def pattern(rule):
        for store in stores:
            found = sorted((p for p in _patterns(queue[store]) if rule(p)),
                           key=lambda p: (-(p["episodes"] or 0), p["key"]))
            if found:
                return {"store": store, "pattern": found[0]["key"]}
        return None

    def block(rule):
        found = [b for b in blocks if rule(b)]
        return {"store": found[0]["store"], "start_min": found[0]["start"]} if found else None

    pinned = next((f["pattern_key"] for f in queue["wearer-pinned"]["focus"]["focuses"]
                   if f["status"] == "active"), None)
    uncertain = next((p["key"] for p in queue["wearer"]["findings"]["outcome_patterns"]
                      if p.get("wide") is True and any(q["key"] == p["key"] for q in patterns)), None)
    habits = _habits({name: queue[name] for name in ("missed-meal", "missed-meal-pinned", "wearer-habit")})

    def habit(rule):
        found = [h for h in habits if rule(h)]
        return {"store": found[0]["store"], "subject": found[0]["subject"]} if found else None

    found = {
        # The trace chart's two forms (ADR 523): each episode, or the median and band.
        "traces_episodes": pattern(lambda p: p["episodes"]),
        "traces_band": pattern(lambda p: p["episodes"] is None),
        "pinned": {"store": "wearer-pinned", "pattern": pinned} if pinned else None,
        "setting": block(lambda b: b["spread"] and not b["collapsed"] and not b["trial"]),
        "setting_trial": block(lambda b: b["trial"]),
        # Optional: these arise only if the engine serves them naturally.
        "uncertain": {"store": "wearer", "pattern": uncertain} if uncertain else None,
        "range_collapsed": block(lambda b: b["collapsed"]),
        "zero_variance": block(lambda b: not b["spread"]),
        "traces_gap": pattern(lambda p: p["gap"]),
        # A standalone habit's card (ADR 528): its episodes each drawn, or their
        # median and band, and pinned.
        "habit_episodes": habit(lambda h: h["episodes"] and not h["pinned"]),
        "habit_band": habit(lambda h: h["episodes"] is None and not h["pinned"]),
        "habit_pinned": habit(lambda h: h["pinned"]),
    }
    required = ("traces_episodes", "traces_band", "pinned", "setting", "setting_trial",
                "habit_episodes", "habit_band", "habit_pinned")
    missing = [name for name in required if found[name] is None]
    if missing:
        raise SystemExit(f"the simulated wearer no longer serves: {', '.join(missing)}")
    return found


def isf_states(overview: dict) -> dict:
    """The store and window behind each ISF card story, chosen from the served
    answers: the engine supports a change; it holds; it is Uncertain; and the
    window with the most nights far beyond its marks, with some on each side,
    for the edge counts."""
    served = {(store, window): answer["isf"][0] for store, answers in overview.items()
              if "analyze" in answers for window, answer in answers["analyze"].items() if answer["isf"]}

    def beyond(row) -> tuple[int, int]:
        """Nights more than the marks' own span below and above them."""
        low = min(row["estimate"]["lo"], row["current"])
        high = max(row["estimate"]["hi"], row["current"])
        fits = [f["isf"] for f in row["evidence"]["night_fits"]]
        return sum(f < low - (high - low) for f in fits), sum(f > high + (high - low) for f in fits)

    def pick(rule, rank=lambda row: 0):
        found = sorted((pair for pair, row in served.items() if rule(row)), key=lambda pair: rank(served[pair]))
        return {"store": found[0][0], "window": found[0][1]} if found else None

    found = {
        "supported": pick(lambda row: row["asserts_move"] is True),
        "held": pick(lambda row: row["asserts_move"] is False and not row["estimate"]["wide"]),
        "uncertain": pick(lambda row: row["estimate"]["wide"] is True),
        "edges": pick(lambda row: min(beyond(row)) > 0, rank=lambda row: -sum(beyond(row))),
    }
    missing = [name for name, state in found.items() if state is None]
    if missing:
        raise SystemExit(f"the served ISF answers no longer serve: {', '.join(missing)}")
    return found


def _table_first_column(section: str) -> list[str]:
    """The bold first-column cells of the first table in ``section``."""
    cells = []
    for line in section.splitlines():
        match = re.match(r"\|\s*\*\*(.+?)\*\*\s*\|", line)
        if match:
            cells.append(match.group(1))
    return cells


def _section(text: str, heading: str) -> str:
    start = text.index(heading)
    end = text.find("\n### ", start + len(heading))
    return text[start:end if end != -1 else len(text)]


def allowlist(data: dict) -> dict:
    text = DESIGN.read_text()
    stores = data["queue"].values()
    rows = [r for store in stores for r in store["findings"]["rows"]]
    served = [r["served_as"] for r in rows if r.get("served_as")]
    sentences = [s for r in rows for s in (r["count_sentences"] or []) + (r["fold_sentences"] or [])]
    sentences += [s for p in served for s in p["count_sentences"] or []]
    sources = {
        "glossary §1.5": _table_first_column(_section(text, "### 1.5 Glossary")),
        "tabs §1.1": _table_first_column(_section(text, "### 1.1 Tabs")),
        "engine titles": [c["title"] for c in data["guidance"]["candidates"]]
        + [c["title"] for store in stores for c in store["guidance"]["candidates"]]
        + [r["title"] for r in rows if r["kind"] == "habit"]  # causes, and a collapsed pattern's member
        + [c["title"] for p in served for c in p["cause_counts"] or []],  # a collapsed pattern's causes
        "engine nouns": [s["noun"] for s in sentences],
        "engine units": [c["units"] for store in stores for c in store["guidance"]["candidates"]
                         if c["units"]],
        "units §4.2": list(UNITS),
        "connectives §4.2": list(CONNECTIVES),
        "state labels §4.2": list(STATE_LABELS),
        "SettingCard captions §4.2": list(SETTING_CAPTIONS),
        "chart labels §2.5": list(CHART_LABELS),
        "Queue labels §1.3": list(QUEUE_LABELS),
        "weekdays §4.2": list(WEEKDAYS),
        "months §1.1": list(MONTHS),
        "Overview labels §2.5": list(OVERVIEW_LABELS),
        "labels §1.2–§4.2": list(CHANGE_DAY_LABELS),
        "Prompts rows §4.2": list(PROMPT_ROWS),
        "engine habit titles": [f["lever_title"] for store in data["changes"].values()
                                for f in store["focuses"] if f["lever_title"]],
        "served day habit titles": [lever["title"] for day in data["day"]["days"].values()
                                    for finding in day["model_view"]["findings"]
                                    for lever in finding["levers"]],
        "labels Settings": list(SETTINGS_LABELS),
        "kind glyph names §2.5": list(KIND_NAMES),
        "rail wordmark §2.5": list(BRAND),
        "served pump profile names": [p["profile"]["name"] for p in data["settings"]["pump_settings"].values()
                                      if p["configured"]],
        "served account regions": [c["region"] for c in data["settings"]["credentials"].values() if c["region"]],
        "served sync errors": [s["last_error"] for s in data["settings"]["status"].values() if s["last_error"]],
        "served sync error labels": [s["last_error_label"] for s in data["settings"]["status"].values()
                                     if s["last_error_label"]],
        "chart mark fields": [field for field in MARK_FIELDS
                              if all(field in slot for store in stores
                                     for slot in store["analyze"]["basal"])],
    }
    # The metric row is one cell listing every metric, comma-separated; the
    # answer and result rows are slash-separated. Words are what is checked.
    words = sorted({word.lower() for cells in sources.values()
                    for cell in cells for word in WORD.findall(cell)})
    return {
        "_generated_by": GENERATED_BY,
        "_note": ("Every word a component story may display: the redesign "
                  "glossary, its tab names, the engine titles, nouns and units "
                  "served in ui-fixtures.json, the window unit, the \"of\" "
                  "of a magnitude, the served fields the evidence chart's "
                  "marks plot, the glucose profile's \"No data\", the day "
                  "tile's weekdays, the month abbreviations of a date, the "
                  "Changes and Day labels quoted in §1.2–§4.2, Day's "
                  "Prompts rows, the "
                  "engine's habit titles, the habit titles served on the "
                  "Day chart's days, the Settings labels, the kind "
                  "glyph's names, and the served pump profile name, account "
                  "region and sync error."),
        "words": words,
    }


def render(document: dict) -> str:
    return json.dumps(document, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    data = fixtures()
    outputs = {FIXTURES: render(data), ALLOWLIST: render(allowlist(data))}
    if args.check:
        stale = [path for path, body in outputs.items()
                 if not path.exists() or path.read_text() != body]
        for path in stale:
            print(f"{path.relative_to(ROOT)} is stale; rerun {pathlib.Path(__file__).name}")
        return 1 if stale else 0
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for path, body in outputs.items():
        path.write_text(body)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
