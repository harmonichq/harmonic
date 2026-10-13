"""A deterministic, seeded synthetic Control-IQ wearer for the UI fixtures (#483).

Nothing here is anyone's data: every value is manufactured from ``SEED`` and
the parameters below, so the history is byte-reproducible and safe to run in
CI. It exists so the component stories render what a real wearer's served
answers look like, through the real engine, rather than hand-shaped cases.

The person: twelve weeks on a Tandem pump with Control-IQ and a CGM.

* **Physiology.** Glucose moves by insulin acting against a true basal need
  (lowest in the small hours, a rise on waking, day-to-day variation and the
  odd resistant day or cold), by carbohydrate absorbed at a mixed, fast or slow meal's
  pace, and by the kidneys spilling glucose above about 160 mg/dL. Insulin
  acts on the exponential curve the engine's own IOB model uses, taken up a
  little less well on an infusion site's third day. The CGM reads it every
  5 minutes with correlated sensor noise, a warm-up gap at each sensor change
  and the odd dropped reading.
* **Pump profile.** Basal, correction factor and carb ratio segments, two of
  them mis-set: the 03:00 basal is more than twice what the night needs, so on the
  nights Control-IQ cannot pull it back in time the person runs low by
  06:00-07:00, and the lunch carb ratio is weaker than this person's response,
  so lunches run high. The programmed correction factor is stronger than the
  true one, so corrections overshoot now and then. On ``TRIAL_DAY`` the person
  lowers the 03:00 basal most of the way, which the engine detects as a Trial
  and measures as fewer early-morning lows.
* **Control-IQ.** Every 5 minutes it predicts glucose 30 minutes out and
  raises, lowers or suspends basal against the profile, with a tighter target
  through the sleep schedule, counting bolus insulin still to act before it
  raises, and adds an automatic correction bolus when glucose is predicted
  above 180, at most hourly. Each basal row carries what was delivered against
  what was programmed, and the source: Profile, Algorithm, Temp or Suspended.
* **Behaviour.** Three meals and an occasional snack, 8 to 75 g, at varied
  times, and now and then a light, low-carb day. Most meal boluses are on
  time, with carb counts that run a little low; some are late, some
  undercount the carbs, a few are forgotten until the high alert and a few
  are overridden short, and small snacks often go unbolused. Highs are corrected through the calculator, and now and then
  corrected again on top of insulin still acting. Lows are treated with fast
  carbs, sometimes too many. Exercise three evenings a week, with a temp
  basal, and a more insulin-sensitive night after it.

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
TRIAL_SEGMENT_START = 180
# The person's change on ``TRIAL_DAY``: most of the way down to what the
# 03:00 block needs, which ends its early-morning lows.
TRIAL_BASAL = 0.80

# The programmed profile: (start_min, basal U/h, ISF mg/dL/U, carb ratio g/U, target).
PROFILE = (
    (0, 0.70, 40, 10.0, 110),
    (180, 1.50, 40, 10.0, 110),   # mis-set: 03:00-07:00 needs about 0.58
    (420, 1.05, 40, 10.0, 110),
    (660, 0.85, 40, 12.0, 110),   # mis-set: lunch responds to about 9.5 g/U
    (960, 0.90, 40, 10.0, 110),
    (1260, 0.75, 40, 10.0, 110),
)
SLEEP = (23 * 60, 7 * 60)
DIA_MIN = 300

# The person's true response, by minute of day.
TRUE_ISF = 52.0
# A cold late in the history: three days of insulin resistance, which the
# latest month's outcomes show against the longer windows.
COLD_DAYS = range(64, 67)
COLD_RESISTANCE = 1.35


def true_basal_need(minute: int) -> float:
    """U/h the body uses at this time of day: lowest in the small hours, then a
    rise on waking. This person has little dawn phenomenon before 07:00, so the
    03:00 block's 1.50 U/h is more than the night needs and, on the nights
    Control-IQ cannot pull it back in time, runs them low by 06:00-07:00."""
    hour = minute / 60
    if hour < 3:
        return 0.70
    if hour < 7:
        return 0.58
    if hour < 8:  # the waking rise, steep once up
        return 0.58 + 0.47 * (hour - 7)
    if hour < 10:
        return 1.05
    if hour < 11:  # easing into the day
        return 1.05 - 0.19 * (hour - 10)
    if hour < 17:
        return 0.86
    if hour < 21:
        return 0.90
    return 0.76


def true_carb_ratio(minute: int) -> float:
    return 9.5 if 11 * 60 <= minute < 16 * 60 else 10.0


def _profile_at(segments, minute: int):
    current = segments[0]
    for segment in segments:
        if segment[0] <= minute:
            current = segment
    return current


def settings(segments=PROFILE, idp: int = 1, name: str = "Synthetic wearer") -> PumpSettings:
    profile = ProfileSettings(
        idp=idp, name=name, dia_min=DIA_MIN, carb_entry=True, max_bolus=15.0,
        segments=tuple(ProfileSegment(start, basal, isf, ratio, target)
                       for start, basal, isf, ratio, target in segments),
    )
    return PumpSettings(active_idp=idp, profiles=(profile,),
                        sleep_schedules=(SleepSchedule(SLEEP[0], SLEEP[1], tuple(range(7))),))


def trial_profile():
    return tuple((start, TRIAL_BASAL if start == TRIAL_SEGMENT_START else basal, isf, ratio, target)
                 for start, basal, isf, ratio, target in PROFILE)


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
# insulin, about 54 mg/dL over the session (mg/dL per step).
EXERCISE_UPTAKE = 4.5
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


def simulate(*, trial: bool) -> History:
    """Run the wearer for ``DAYS`` days. ``trial`` makes the ``TRIAL_DAY`` change."""
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
        varied, resistant = math.exp(rng.gauss(0, 0.10)), rng.random() < 0.12
        resistance.append(varied * (COLD_RESISTANCE if day in COLD_DAYS else 1.25 if resistant else 1.0))
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
        plan = [
            (rng.uniform(7.0, 8.75), rng.uniform(20, 60)),
            (rng.uniform(12.0, 13.75), rng.uniform(30, 70)),
            (rng.uniform(18.0, 20.0), rng.uniform(35, 75)),
        ]
        light = rng.random() < 0.10  # a light, low-carb day: small meals, no snack
        if light:
            plan = [(hour, grams * 0.4) for hour, grams in plan]
        if rng.random() < 0.5:
            snack = (rng.choice((16.5, 21.5)) + rng.uniform(-0.5, 0.5), rng.uniform(8, 25))
            if not light:
                plan.append(snack)
        for index, (hour, grams) in enumerate(plan):
            step = base + int(hour * 60 // STEP)
            roll = rng.random()
            # Most boluses are on time. Some come 15-40 minutes into the meal,
            # some undercount the carbs, a few are forgotten until the CGM's
            # high alert 30-55 minutes in, and a few are overridden short.
            behaviour = ("on_time" if roll < 0.52 else "late" if roll < 0.70 else
                         "undercount" if roll < 0.82 else "forgotten" if roll < 0.90 else "short")
            if index == 3 and grams < 26 and rng.random() < 0.5:
                behaviour = "missed"  # small snacks often go unbolused
            speed, pick = rng.random(), 0
            while speed > MEALS[pick][0]:
                speed -= MEALS[pick][0]
                pick += 1
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
        return trial_profile() if trial and day >= TRIAL_DAY else PROFILE

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
        dropped = rng.random() < 0.004
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
        # Raising basal, Control-IQ counts the bolus insulin still to act, so a
        # covered meal's rise does not draw extra insulin on top of its bolus.
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
        elif predicted_with_iob > (120 if asleep else 160):
            delivered = programmed * min(3.0, 1 + (predicted_with_iob - (120 if asleep else 160)) / 90)
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
        # 180, 60% of the correction to 110 net of insulin on board, at most
        # hourly, never asleep
        if (not asleep and predicted > 180 and step - last_auto >= 12):
            wanted = 0.6 * ((predicted - 110) / segment[2] - bolus_iob[step])
            if wanted >= 0.1:
                bolus(step, insulin=wanted, requested=wanted, carbs_g=None, bg_read=seen,
                      food=0.0, correction=wanted, option=3, override=0, segment=segment)
                last_auto = step

        # -- the person: meal boluses as planned
        for behaviour, grams, roll in bolus_at.get(step, ()):
            entered = grams * (rng.uniform(0.65, 0.8) if behaviour == "undercount"
                               else rng.gauss(0.92, 0.12))  # counts run a little low
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
            if correction >= 0.3:
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
            treat_at = step + rng.randint(1, 4)
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


def materialize(store, *, trial: bool, days: int = DAYS) -> History:
    """Ingest the simulated history into ``store`` as a Tandem Source pull would:
    the profile read at the start (and again after the ``TRIAL_DAY`` change),
    then CGM, basal, bolus and pump events. ``days`` stops the pull at the end of
    that day, as a sync made early in the wearer's history would."""
    history = simulate(trial=trial)
    cut = _stamp(START + timedelta(days=days))
    history.cgm = [row for row in history.cgm if row["EventDateTime"] < cut]
    history.basal = [row for row in history.basal if row["time"] < cut]
    history.bolus = [row for row in history.bolus if row["request_time"] < cut]
    history.pump = [row for row in history.pump if row["time"] < cut]
    history.treated_lows = [low for low in history.treated_lows if _stamp(low[0]) < cut]
    store.upsert_settings_snapshot(_stamp(START), settings())
    if trial and days > TRIAL_DAY:
        store.upsert_settings_snapshot(_stamp(START + timedelta(days=TRIAL_DAY)),
                                       settings(trial_profile()))
    store.upsert_cgm(history.cgm)
    store.upsert_basal(history.basal)
    store.upsert_bolus(history.bolus)
    store.upsert_pump(history.pump)
    return history
