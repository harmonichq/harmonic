"""A deterministic, seeded synthetic Control-IQ wearer for the UI fixtures (#483).

Nothing here is anyone's data: every value is manufactured from ``SEED`` and
the parameters below, so the history is byte-reproducible and safe to run in
CI. It exists so the component stories render what a real wearer's served
answers look like, through the real engine, rather than hand-shaped cases.

The person: twelve weeks on a Tandem pump with Control-IQ and a CGM.

* **Physiology.** Glucose moves by insulin acting against a true basal need
  (lowest in the small hours, a dawn rise, day-to-day variation and the odd
  resistant day or cold), by carbohydrate absorbed at a mixed, fast or slow
  meal's pace, and by the kidneys spilling glucose above about 160 mg/dL. Insulin
  acts on the exponential curve the engine's own IOB model uses, taken up a
  little less well on an infusion site's third day. The CGM reads it every
  5 minutes with correlated sensor noise, a warm-up gap at each sensor change
  and the odd dropped reading.
* **Pump profile.** Basal, correction factor and carb ratio segments, some of
  them mis-set: the 02:00 basal is more than twice what the small hours need,
  so on the nights Control-IQ cannot pull it back in time (about one in four)
  the person runs low across the block, mostly by 04:00-05:00; the 00:00 block runs a little high; and the 11:00 carb
  ratio is weaker than this person's response, so lunches run high. The
  programmed correction factor is stronger than the true one, so corrections
  overshoot now and then. On ``TRIAL_DAY`` the person lowers the 02:00 basal
  most of the way, which the engine detects as a Trial and measures as fewer
  small-hours lows. A second wearer has the 02:00 block right and raises it in
  the wrong direction instead.
* **Control-IQ.** Every 5 minutes it predicts glucose 30 minutes out and
  raises, lowers or suspends basal against the profile, gently through the
  sleep schedule, and adds an automatic correction bolus of at least 0.35 U
  when glucose is predicted above 180 net of bolus insulin on board, at most
  hourly. Each basal row carries what was delivered against what was
  programmed, and the source: Profile, Algorithm, Temp or Suspended.
* **Behaviour.** Three meals and up to three snacks a day, mostly 15 to 60 g:
  a mid-afternoon snack, sometimes an early-evening one, and most nights a
  slow, fatty late-evening one whose carbs are undercounted, so the night
  drifts up. Breakfast is skipped now and then, and some days are light and
  low-carb. Most boluses are on time, with carb counts that scatter and run a
  little low; some are late, some undercount, a few are forgotten until the
  high alert and a few are overridden short, and small snacks often go
  unbolused. Highs are corrected through the calculator, and now and then
  corrected again on top of insulin still acting. Lows are treated with fast
  carbs, a little later when asleep, sometimes too many. Exercise three
  evenings a week, with a temp basal, and a more insulin-sensitive night
  after it.
* **Units.** Insulin doses, rates, ratios and the correction factor sit on a
  scale like a real adult wearer's: about 4 to 6 U for a meal and 1 to 2 U/h
  of basal.

Only ``materialize`` touches a store, and only through ``Store`` writes, the
same rows a Tandem Source ingestion writes.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import List

from ciq_autotune.settings import ProfileSegment, ProfileSettings, PumpSettings, SleepSchedule

SEED = 483
START = datetime(2025, 3, 3)
DAYS = 84
STEP = 5  # minutes
STEPS_PER_DAY = 24 * 60 // STEP
TRIAL_DAY = 56
TRIAL_SEGMENT_START = 120
# The person's change on ``TRIAL_DAY``: most of the way down to what the
# 02:00 block needs, which ends its 04:00-05:00 lows.
TRIAL_BASAL = 1.00

# The programmed profile: (start_min, basal U/h, ISF mg/dL/U, carb ratio g/U, target).
PROFILE = (
    (0, 1.00, 28, 7.0, 110),      # a little high: 00:00-02:00 needs about 0.85
    # Mis-set: 02:00-05:00 needs about 0.80. A basal Trial reads its whole
    # block (#506), so the block's lows must be frequent enough before the
    # change for the lowered rate to read as fewer lows.
    (120, 1.80, 28, 7.0, 110),
    (300, 1.40, 28, 7.0, 110),
    (660, 1.20, 28, 8.5, 110),    # mis-set: lunch responds to about 6.8 g/U
    (840, 1.20, 28, 7.0, 110),
    (960, 1.25, 28, 7.0, 110),
    (1260, 1.05, 28, 7.0, 110),
)
# A second wearer, for the Worse Trial: the same person with the 02:00 block
# set right, who on ``TRIAL_DAY`` raises it in the wrong direction (as if for
# the breakfast highs). Control-IQ trims the extra insulin but cannot stop it
# all, so the small hours start running low.
WORSE_PROFILE_BASAL = 0.85
WORSE_TRIAL_BASAL = 2.40
SLEEP = (23 * 60, 7 * 60)
DIA_MIN = 300

# The person's true response, by minute of day.
TRUE_ISF = 34.0
# A cold late in the history: three days of insulin resistance, which the
# latest month's outcomes show against the longer windows.
COLD_DAYS = range(64, 67)
COLD_RESISTANCE = 1.35


def true_basal_need(minute: int) -> float:
    """U/h the body uses at this time of day: lowest in the small hours, then a
    dawn rise from 05:00. The 02:00 block's 1.80 U/h is more than twice what 02:00-05:00
    needs and, on the nights Control-IQ cannot pull it back in time, runs them
    low by 04:00-05:00."""
    hour = minute / 60
    if hour < 2:
        return 0.85
    if hour < 5:
        return 0.80
    if hour < 6.5:  # the dawn rise
        return 0.80 + 0.73 * (hour - 5)
    if hour < 8:
        return 1.90 - 0.20 * (hour - 6.5)
    if hour < 10:
        return 1.60
    if hour < 11:  # easing into the day
        return 1.60 - 0.40 * (hour - 10)
    if hour < 17:
        return 1.20
    if hour < 21:
        return 1.26
    return 1.06


def true_carb_ratio(minute: int) -> float:
    return 6.8 if 11 * 60 <= minute < 14 * 60 else 7.0


def _profile_at(segments, minute: int):
    current = segments[0]
    for segment in segments:
        if segment[0] <= minute:
            current = segment
    return current


def settings(profiles, active: int = 1) -> PumpSettings:
    """The pump's settings: ``profiles`` maps each profile's idp to its segments,
    and ``active`` is the one running. The first is the wearer's own profile."""
    return PumpSettings(
        active_idp=active,
        profiles=tuple(ProfileSettings(
            idp=idp, name="Synthetic wearer" if idp == 1 else f"Synthetic wearer {idp}",
            dia_min=DIA_MIN, carb_entry=True, max_bolus=15.0,
            segments=tuple(ProfileSegment(start, basal, isf, ratio, target)
                           for start, basal, isf, ratio, target in segments),
        ) for idp, segments in sorted(profiles.items())),
        sleep_schedules=(SleepSchedule(SLEEP[0], SLEEP[1], tuple(range(7))),))


def trial_profile(trial_basal: float = TRIAL_BASAL, profile=PROFILE):
    """``profile`` with its 02:00 block set to ``trial_basal``."""
    return tuple((start, trial_basal if start == TRIAL_SEGMENT_START else basal, isf, ratio, target)
                 for start, basal, isf, ratio, target in profile)


# A carb ratio change: the 11:00 block moved from 8.5 to this person's own
# lunch response (#524), which the engine detects as a carb ratio Trial.
LUNCH_RATIO = 6.8


def lunch_profile(profile=PROFILE):
    """``profile`` with its 11:00 carb ratio set to ``LUNCH_RATIO``."""
    return tuple((start, basal, isf, LUNCH_RATIO if start == 660 else ratio, target)
                 for start, basal, isf, ratio, target in profile)


def switch_profile(profile=PROFILE):
    """A second profile that moves both mis-set blocks at once, the 02:00 basal
    and the 11:00 carb ratio: switched to, it is a whole-profile change (#524)."""
    return lunch_profile(trial_profile(profile=profile))


def _changes(trial: bool, trial_basal: float, profile, changes):
    """The person's changes, ``(day, idp, segments)``: the given ones, else the
    one Trial-day change to the 02:00 basal when ``trial``."""
    if changes is not None:
        return tuple(changes)
    return ((TRIAL_DAY, 1, trial_profile(trial_basal, profile)),) if trial else ()


def _segments_on(day: int, profile, changes):
    """The running profile's segments on ``day``."""
    current = profile
    for at, _, segments in changes:
        if day >= at:
            current = segments
    return current


# --- insulin and carbohydrate kernels, per 5-minute step ---------------------

def _insulin_kernel(peak: float = 75.0, dia: float = DIA_MIN) -> List[float]:
    """Fraction of a unit acting in each 5-minute step (oref0's exponential curve)."""
    tau = peak * (1 - peak / dia) / (1 - 2 * peak / dia)
    a = 2 * tau / dia
    s = 1 / (1 - a + (1 + a) * math.exp(-dia / tau))
    weights = []
    for k in range(int(dia // STEP)):
        t = (k + 0.5) * STEP
        weights.append(s / tau ** 2 * t * (1 - t / dia) * math.exp(-t / tau) * STEP)
    total = sum(weights)
    return [w / total for w in weights]


def _carb_kernel(peak: float, duration: float, onset: float = 10.0) -> List[float]:
    """Fraction of a carb dose absorbed in each step: a delayed triangle."""
    weights = []
    for k in range(int((onset + duration) // STEP) + 1):
        t = k * STEP + STEP / 2 - onset
        if t <= 0 or t >= duration:
            weights.append(0.0)
        elif t < peak:
            weights.append(t / peak)
        else:
            weights.append((duration - t) / (duration - peak))
    total = sum(weights)
    return [w / total for w in weights]


INSULIN = _insulin_kernel()
INSULIN_ON_BOARD = [1 - sum(INSULIN[:k + 1]) for k in range(len(INSULIN))]
# Meals absorb at one of three speeds: mostly a mixed meal, sometimes a fast
# one (cereal, toast), sometimes a slow fatty one. Against the insulin curve
# above, an on-time 60 g mixed meal at the person's own ratio rises about
# 95 mg/dL and peaks about 110 minutes after the bolus.
MEALS = (
    (0.70, _carb_kernel(peak=35, duration=150)),
    (0.10, _carb_kernel(peak=30, duration=120)),
    (0.20, _carb_kernel(peak=55, duration=220, onset=15)),
)
FAST = _carb_kernel(peak=20, duration=60, onset=5)
LONGEST_MEAL = max(len(kernel) for _, kernel in MEALS)
# Above about 160 mg/dL the kidneys spill glucose into the urine, in proportion
# to the excess (Hovorka's renal clearance: 0.003/min of the excess over
# 9 mmol/L). It is what bends an unbolused meal's rise over before the CGM's
# 400 ceiling.
RENAL_THRESHOLD = 162.0
# The hour of exercise itself: working muscle takes up glucose without
# insulin, about 42 mg/dL over the session (mg/dL per step).
EXERCISE_UPTAKE = 3.5
# An infusion site takes up insulin less well as it ages: by its third day a
# tenth or so less, which is why third-day afternoons run higher.
SITE_ABSORPTION = (1.0, 0.97, 0.88)
RENAL_CLEARANCE = 0.003 * STEP


@dataclass
class History:
    cgm: list = field(default_factory=list)
    basal: list = field(default_factory=list)
    bolus: list = field(default_factory=list)
    pump: list = field(default_factory=list)
    # Lows the person treated, for the manual carb log and the prompts.
    treated_lows: list = field(default_factory=list)


def _stamp(t: datetime) -> str:
    return t.strftime("%Y-%m-%d %H:%M:%S")


def simulate(*, trial: bool, trial_basal: float = TRIAL_BASAL, profile=PROFILE, changes=None) -> History:
    """Run the wearer for ``DAYS`` days on ``profile``. ``trial`` makes the
    ``TRIAL_DAY`` change to the 02:00 block, to ``trial_basal`` U/h; ``changes``,
    ``(day, idp, segments)`` each, replaces it with the person's own."""
    changes = _changes(trial, trial_basal, profile, changes)
    rng = random.Random(SEED)
    steps = DAYS * STEPS_PER_DAY
    insulin_excess = [0.0] * (steps + len(INSULIN))   # U above the body's need
    carbs = [0.0] * (steps + LONGEST_MEAL)            # g absorbed per step
    bolus_iob = [0.0] * (steps + len(INSULIN))        # pump-visible bolus IOB
    history = History()

    # Per-day plans, drawn up front so the day's behaviour doesn't depend on the
    # glucose it produces (only reactions — corrections, treatments — do).
    # Insulin resistance by day: ordinary day-to-day variation, and now and
    # then a resistant day (a stressful day, a cold) that runs high.
    resistance = []
    for day in range(DAYS):
        varied, resistant = math.exp(rng.gauss(0, 0.13)), rng.random() < 0.12
        resistance.append(varied * (COLD_RESISTANCE if day in COLD_DAYS else 1.35 if resistant else 1.0))
    exercise = {day for day in range(DAYS) if day % 7 in (1, 3, 5)}
    sensor_changes = {day for day in range(DAYS) if day % 10 == 3}
    site_changes = {day for day in range(DAYS) if day % 3 == 0}

    def site_uptake(step: int) -> float:
        """The share of delivered insulin the infusion site takes up: full on a
        fresh site, falling off on its third day, until the 10:00 change."""
        day, minute = divmod(step, STEPS_PER_DAY)
        age = day % 3 if minute * STEP >= 10 * 60 else (day - 1) % 3
        return SITE_ABSORPTION[age]

    meals = []  # (step, g, behaviour, two rolls, kernel)
    for day in range(DAYS):
        base = day * STEPS_PER_DAY
        # Three meals and up to three snacks: mid-afternoon, early evening
        # and late evening. Breakfast is skipped now and then.
        plan = [
            (rng.uniform(7.0, 8.75), rng.uniform(15, 40) if rng.random() < 0.93 else 0),
            (rng.uniform(12.0, 13.5), rng.uniform(30, 60)),
            (rng.uniform(18.0, 19.75), rng.uniform(35, 62)),
        ]
        snacks = [
            (rng.uniform(14.75, 15.75), rng.uniform(20, 45) if rng.random() < 0.8 else 0),
            (rng.uniform(16.5, 17.5), rng.uniform(20, 40) if rng.random() < 0.4 else 0),
            (rng.uniform(20.75, 22.5), rng.uniform(20, 48) if rng.random() < 0.85 else 0),
        ]
        light = rng.random() < 0.10  # a light, low-carb day: small meals, no snacks
        if light:
            plan = [(hour, grams * 0.4) for hour, grams in plan]
        else:
            plan += snacks
        plan = [(hour, grams) for hour, grams in plan if grams]
        for index, (hour, grams) in enumerate(plan):
            step = base + int(hour * 60 // STEP)
            roll = rng.random()
            # Most boluses are on time. Some come 15-40 minutes into the meal,
            # some undercount the carbs, a few are forgotten until the CGM's
            # high alert 30-55 minutes in, and a few are overridden short.
            behaviour = ("on_time" if roll < 0.50 else "late" if roll < 0.66 else
                         "undercount" if roll < 0.78 else "forgotten" if roll < 0.90 else "short")
            if grams < 15 and rng.random() < 0.5:
                behaviour = "missed"  # small snacks often go unbolused
            speed, pick = rng.random(), 0
            while speed > MEALS[pick][0]:
                speed -= MEALS[pick][0]
                pick += 1
            if hour >= 20.5:
                # The late-evening snack is a slow, fatty one whose carbs are
                # undercounted, so the night drifts up after it.
                pick = len(MEALS) - 1
                if behaviour in ("on_time", "late"):
                    behaviour = "undercount"
            meals.append((step, round(grams), behaviour, rng.random(), rng.random(), MEALS[pick][1]))
    meal_at = {}
    for meal in meals:
        meal_at.setdefault(meal[0], []).append(meal)

    bolus_at = {}  # step -> list of (kind, payload) scheduled user boluses
    for step, grams, behaviour, r1, r2, _ in meals:
        if behaviour == "missed":
            continue
        offset = (3 + int(r1 * 6) if behaviour == "late" else 6 + int(r1 * 6) if behaviour == "forgotten"
                  else -int(r1 * 3))
        bolus_at.setdefault(step + offset, []).append((behaviour, grams, r2))

    bg = 118.0
    drift = 0.0
    sensor_error = 0.0
    cgm_history: List[float] = []
    seq = {"basal": 1_000_000, "bolus": 2_000_000, "pump": 3_000_000}
    last_auto = -100
    last_user_bolus = -100
    last_correction = -100
    stacked_pending = None
    low_episode = False
    treat_at = None

    def pump_profile(day: int):
        return _segments_on(day, profile, changes)

    def bolus(step: int, *, insulin: float, requested: float, carbs_g, bg_read, food, correction,
              option: int, override: int, segment) -> None:
        insulin = round(max(insulin, 0.0), 2)
        if insulin <= 0:
            return
        seq["bolus"] += 1
        history.bolus.append({
            "seq_num": seq["bolus"], "request_time": _stamp(START + timedelta(minutes=step * STEP)),
            "description": "Bolus", "completion": "Completed",
            "insulin": insulin, "requested_insulin": round(requested, 2),
            "carbs": carbs_g, "bg": round(bg_read) if bg_read else None,
            "completion_time": _stamp(START + timedelta(minutes=step * STEP)),
            "bolus_options": option, "user_override": override,
            "food_insulin": round(food, 2), "correction_insulin": round(correction, 2),
            "pump_iob": round(bolus_iob[step], 2),
            "isf": segment[2], "target_bg": segment[4],
            "carb_ratio": segment[3] if carbs_g else None,
        })
        for k, weight in enumerate(INSULIN):
            insulin_excess[step + k] += insulin * site_uptake(step) * weight
            bolus_iob[step + k] += insulin * INSULIN_ON_BOARD[k]

    for step in range(steps):
        day, minute = divmod(step, STEPS_PER_DAY)
        if minute == 0:
            # Each day's noise and reactions draw from that day's own stream, so
            # wearers that differ by one setting change share every other draw:
            # the difference between them is the change, not a reshuffled path.
            rng = random.Random(SEED * 1000 + day)
        minute *= STEP
        now = START + timedelta(minutes=step * STEP)
        segment = _profile_at(pump_profile(day), minute)
        asleep = minute >= SLEEP[0] or minute < SLEEP[1]
        # A session starts at 17:00, 18:00 or 19:00; its first hour is the
        # exercise itself, the next two its after-effect.
        session = (17 + day % 3) * 60
        exercising = day in exercise and session <= minute < session + 180
        in_session = exercising and minute < session + 60
        # Muscle refilling its glycogen keeps the night after exercise more
        # sensitive to insulin: the delayed post-exercise low, 22:00-05:00.
        recovering = ((day in exercise and minute >= 22 * 60)
                      or (day - 1 in exercise and minute < 5 * 60))

        # -- the CGM reads this step, unless the sensor is warming up or drops one
        drift = 0.96 * drift + rng.gauss(0, 1.1)
        sensor_error = 0.75 * sensor_error + rng.gauss(0, 2.0)
        reading = bg + drift + sensor_error
        warming = day in sensor_changes and 9 * 60 <= minute < 11 * 60
        dropped = rng.random() < 0.035
        cgm = None if warming or dropped else max(40, min(400, round(reading)))
        if cgm is not None:
            history.cgm.append({"EventDateTime": _stamp(now), "Readings (CGM / BGM)": cgm,
                                "Description": "EGV"})
            cgm_history.append(cgm)
        seen = cgm_history[-1] if cgm_history else bg
        # Control-IQ's trend: a least-squares slope over the last four readings.
        recent = cgm_history[-4:]
        trend = ((3 * (recent[3] - recent[0]) + (recent[2] - recent[1])) / (10 * STEP)
                 if len(recent) == 4 else 0.0)
        predicted = seen + 30 * trend
        # Raising basal or correcting, Control-IQ counts the bolus insulin still
        # to act, so a covered meal's rise does not draw extra insulin on top.
        predicted_with_iob = predicted - 0.5 * segment[2] * bolus_iob[step]

        # -- Control-IQ sets this step's basal
        programmed = segment[1]
        if in_session:
            delivered, source = programmed * 0.5, "tempDelivery"
        elif predicted < 70:
            delivered, source = 0.0, "algorithmDelivery (control-iq suspension)"
        elif predicted < 112.5:
            delivered = programmed * max(0.0, 1 - (112.5 - predicted) / 40)
            source = "algorithmDelivery" if delivered > 0 else "algorithmDelivery (control-iq suspension)"
        elif asleep and predicted_with_iob > 120:  # gently through the sleep schedule
            delivered = programmed * min(2.0, 1 + (predicted_with_iob - 120) / 120)
            source = "algorithmDelivery"
        elif not asleep and predicted_with_iob > 160:
            delivered = programmed * min(3.0, 1 + (predicted_with_iob - 160) / 40)
            source = "algorithmDelivery"
        else:
            delivered, source = programmed, "profileDelivery"
        delivered = round(delivered, 3)
        seq["basal"] += 1
        history.basal.append({"seq_num": seq["basal"], "time": _stamp(now), "delivery_type": source,
                              "duration_mins": STEP, "basal_rate": delivered,
                              "profile_basal_rate": programmed})
        need = (true_basal_need(minute) * resistance[day]
                * (0.85 if exercising else 0.6 if recovering else 1.0))
        for k, weight in enumerate(INSULIN):
            insulin_excess[step + k] += (delivered * site_uptake(step) - need) * STEP / 60 * weight

        # -- Control-IQ's automatic correction: when glucose is predicted above
        # 180 net of bolus insulin on board, 60% of the correction to 110 net of insulin on board, at most
        # hourly, never asleep
        if (not asleep and predicted_with_iob > 180 and step - last_auto >= 12):
            wanted = 0.6 * ((predicted - 110) / segment[2] - bolus_iob[step])
            if wanted >= 0.35:
                bolus(step, insulin=wanted, requested=wanted, carbs_g=None, bg_read=seen,
                      food=0.0, correction=wanted, option=3, override=0, segment=segment)
                last_auto = step

        # -- the person: meal boluses as planned
        for behaviour, grams, roll in bolus_at.get(step, ()):
            entered = grams * (rng.uniform(0.65, 0.8) if behaviour == "undercount"
                               else rng.gauss(0.92, 0.2))  # counts run a little low
            entered = max(5, round(entered))
            food = entered / segment[3]
            correction = max(0.0, (seen - segment[4]) / segment[2] - bolus_iob[step])
            calculated = food + correction
            given = calculated * (0.6 + 0.15 * roll) if behaviour == "short" else calculated
            bolus(step, insulin=given, requested=given, carbs_g=entered, bg_read=seen,
                  food=food, correction=correction, option=0,
                  override=1 if behaviour == "short" else 0, segment=segment)
            last_user_bolus = step

        # -- the person: corrections when high, sometimes stacked
        if (cgm is not None and not asleep and cgm > 200 and trend > -0.5
                and step - last_user_bolus >= 24 and rng.random() < 0.12):
            correction = (cgm - segment[4]) / segment[2] - bolus_iob[step]
            if correction >= 0.4:
                bolus(step, insulin=correction, requested=correction, carbs_g=None, bg_read=cgm,
                      food=0.0, correction=correction, option=0, override=0, segment=segment)
                last_user_bolus = last_correction = step
                if rng.random() < 0.3:
                    stacked_pending = step + rng.randint(9, 15)
        if stacked_pending == step:
            stacked_pending = None
            if cgm is not None and cgm > 200:
                full = (cgm - segment[4]) / segment[2]
                calculated = max(0.0, full - bolus_iob[step])
                bolus(step, insulin=full, requested=full, carbs_g=None, bg_read=cgm,
                      food=0.0, correction=calculated, option=0, override=1, segment=segment)
                last_user_bolus = step

        # -- the person: lows, treated after a few minutes, sometimes too well,
        # and treated early on a fast-falling arrow
        if cgm is not None and (cgm < 70 or (cgm < 80 and trend < -1.0)) and not low_episode:
            low_episode = True
            # noticed a little later asleep, when the alarm has to wake them
            treat_at = step + (rng.randint(3, 7) if asleep else rng.randint(2, 5))
        if cgm is not None and cgm > 85:
            low_episode = False
        if treat_at == step:
            treat_at = None
            roll = rng.random()
            # With a meal due within the hour, the meal finishes the job, so
            # the person never over-treats then.
            meal_due = any(step + k in meal_at for k in range(1, 13))
            if roll < 0.97:
                grams = rng.uniform(12, 20) if roll < 0.55 or meal_due else rng.uniform(26, 36)
                for k, weight in enumerate(FAST):
                    carbs[step + k] += grams * weight
                history.treated_lows.append((now, round(grams)))

        # -- meals are eaten as planned
        for meal_step, grams, behaviour, r1, r2, kernel in meal_at.get(step, ()):
            absorbed = grams * rng.gauss(1.0, 0.1)
            for k, weight in enumerate(kernel):
                carbs[step + k] += absorbed * weight

        # -- the pump's own events
        if day in site_changes and minute == 10 * 60:
            seq["pump"] += 1
            history.pump.append({"seq_num": seq["pump"], "time": _stamp(now),
                                 "event_type": "Site/Cartridge Change", "duration_mins": 0})

        # -- glucose moves to the next step
        # A unit of insulin acts more on a sensitive day; a gram of carbohydrate
        # raises glucose the same whatever the insulin sensitivity.
        isf = TRUE_ISF / resistance[day] * (1.2 if exercising else 1.3 if recovering else 1.0)
        bg += (TRUE_ISF / true_carb_ratio(minute)) * carbs[step] - isf * insulin_excess[step]
        bg -= RENAL_CLEARANCE * max(0.0, bg - RENAL_THRESHOLD)
        if in_session:
            bg -= EXERCISE_UPTAKE  # working muscle takes up glucose without insulin
        bg = max(42.0, min(420.0, bg))

    return history


def materialize(store, *, trial: bool, days: int = DAYS, trial_basal: float = TRIAL_BASAL,
                profile=PROFILE, changes=None) -> History:
    """Ingest the simulated history into ``store`` as a Tandem Source pull would:
    the profile read at the start (and again after each change the pull reaches),
    then CGM, basal, bolus and pump events. ``days`` stops the pull at the end of
    that day, as a sync made early in the wearer's history would. A change to
    another idp is a switch: every read holds each profile the person keeps, as
    it stands that day, and names the running one."""
    changes = _changes(trial, trial_basal, profile, changes)
    history = simulate(trial=trial, profile=profile, changes=changes)
    cut = _stamp(START + timedelta(days=days))
    history.cgm = [row for row in history.cgm if row["EventDateTime"] < cut]
    history.basal = [row for row in history.basal if row["time"] < cut]
    history.bolus = [row for row in history.bolus if row["request_time"] < cut]
    history.pump = [row for row in history.pump if row["time"] < cut]
    history.treated_lows = [low for low in history.treated_lows if _stamp(low[0]) < cut]
    profiles = {1: profile}
    for _, idp, segments in changes:
        profiles.setdefault(idp, segments)
    active = 1
    store.upsert_settings_snapshot(_stamp(START), settings(profiles, active))
    for at, idp, segments in changes:
        if days <= at:
            break
        profiles[idp], active = segments, idp
        store.upsert_settings_snapshot(_stamp(START + timedelta(days=at)), settings(profiles, active))
    store.upsert_cgm(history.cgm)
    store.upsert_basal(history.basal)
    store.upsert_bolus(history.bolus)
    store.upsert_pump(history.pump)
    return history
