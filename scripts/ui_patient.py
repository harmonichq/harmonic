"""A deterministic, seeded synthetic Control-IQ wearer for the UI fixtures (#483).

Nothing here is anyone's data: every value is manufactured from ``SEED`` and
the parameters below, so the history is byte-reproducible and safe to run in
CI. It exists so the component stories render what a real wearer's served
answers look like, through the real engine, rather than hand-shaped cases.

The person: twelve weeks on a Tandem pump with Control-IQ and a CGM.

* **Physiology.** Glucose moves by insulin acting against a true basal need
  (with a dawn rise and day-to-day variation), by carbohydrate absorption, and
  by a slow physiological drift. Insulin acts on the exponential curve the
  engine's own IOB model uses. The CGM reads it every 5 minutes with
  correlated sensor noise, a warm-up gap at each sensor change and the odd
  dropped reading.
* **Pump profile.** Basal, correction factor and carb ratio segments, two of
  them mis-set: the 03:00 basal runs above what the night needs, and the lunch
  carb ratio is weaker than this person's response, so lunches run high. The
  programmed correction factor is stronger than the true one, so corrections
  overshoot now and then. On ``TRIAL_DAY`` the person lowers the 03:00 basal
  part of the way, which the engine detects as a Trial.
* **Control-IQ.** Every 5 minutes it predicts glucose 30 minutes out and
  raises, lowers or suspends basal against the profile, with a tighter target
  through the sleep schedule, and adds an automatic correction bolus at most
  hourly. Each basal row carries what was delivered against what was
  programmed, and the source: Profile, Algorithm, Temp or Suspended.
* **Behaviour.** Three meals and an occasional snack, 8 to 90 g, at varied
  times. Most meal boluses are on time; some are late, some undercount the
  carbs, a few are skipped and a few are overridden short. Highs are
  corrected through the calculator, and now and then corrected again on top
  of insulin still acting. Lows are treated with fast carbs, sometimes too
  many. Exercise twice a week, with a temp basal.

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
TRIAL_DAY = 66
TRIAL_SEGMENT_START = 180
TRIAL_BASAL = 0.85

# The programmed profile: (start_min, basal U/h, ISF mg/dL/U, carb ratio g/U, target).
PROFILE = (
    (0, 0.70, 40, 10.0, 110),
    (180, 0.95, 40, 10.0, 110),   # mis-set: 03:00-05:00 needs about 0.62
    (420, 1.05, 40, 10.0, 110),
    (660, 0.85, 40, 12.0, 110),   # mis-set: lunch responds to about 9 g/U
    (960, 0.90, 40, 10.0, 110),
    (1260, 0.75, 40, 10.0, 110),
)
SLEEP = (23 * 60, 7 * 60)
DIA_MIN = 300

# The person's true response, by minute of day.
TRUE_ISF = 50.0


def true_basal_need(minute: int) -> float:
    """U/h the body uses at this time of day: low overnight, a dawn rise."""
    hour = minute / 60
    if hour < 3:
        return 0.70
    if hour < 5:
        return 0.62
    if hour < 8:  # the dawn rise, then easing into the day
        return 0.62 + 0.48 * math.sin(math.pi * (hour - 5) / 6)
    if hour < 17:
        return 0.86
    if hour < 21:
        return 0.90
    return 0.76


def true_carb_ratio(minute: int) -> float:
    return 9.0 if 11 * 60 <= minute < 16 * 60 else 10.0


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
MEAL = _carb_kernel(peak=55, duration=200)
FAST = _carb_kernel(peak=20, duration=60, onset=5)


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
    carbs = [0.0] * (steps + len(MEAL))               # g absorbed per step
    bolus_iob = [0.0] * (steps + len(INSULIN))        # pump-visible bolus IOB
    history = History()

    # Per-day plans, drawn up front so the day's behaviour doesn't depend on the
    # glucose it produces (only reactions — corrections, treatments — do).
    sensitivity = [math.exp(rng.gauss(0, 0.07)) for _ in range(DAYS)]
    exercise = {day for day in range(DAYS) if day % 7 in (1, 4)}
    sensor_changes = {day for day in range(DAYS) if day % 10 == 3}
    site_changes = {day for day in range(DAYS) if day % 3 == 0}

    meals = []  # (step, actual g, bolus plan)
    for day in range(DAYS):
        base = day * STEPS_PER_DAY
        plan = [
            (rng.uniform(7.0, 8.75), rng.uniform(20, 60)),
            (rng.uniform(12.0, 13.75), rng.uniform(30, 80)),
            (rng.uniform(18.0, 20.0), rng.uniform(35, 90)),
        ]
        if rng.random() < 0.5:
            plan.append((rng.choice((15.5, 21.5)) + rng.uniform(-0.5, 0.5), rng.uniform(8, 25)))
        for hour, grams in plan:
            step = base + int(hour * 60 // STEP)
            roll = rng.random()
            behaviour = ("on_time" if roll < 0.56 else "late" if roll < 0.71 else
                         "undercount" if roll < 0.84 else "missed" if roll < 0.89 else "short")
            if grams < 26 and rng.random() < 0.5:
                behaviour = "missed"  # small snacks often go unbolused
            meals.append((step, round(grams), behaviour, rng.random(), rng.random()))
    meal_at = {}
    for meal in meals:
        meal_at.setdefault(meal[0], []).append(meal)

    bolus_at = {}  # step -> list of (kind, payload) scheduled user boluses
    for step, grams, behaviour, r1, r2 in meals:
        if behaviour == "missed":
            continue
        offset = (-int(r1 * 3) if behaviour != "late" else 4 + int(r1 * 6))
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
            insulin_excess[step + k] += insulin * weight
            bolus_iob[step + k] += insulin * INSULIN_ON_BOARD[k]

    for step in range(steps):
        day, minute = divmod(step, STEPS_PER_DAY)
        minute *= STEP
        now = START + timedelta(minutes=step * STEP)
        segment = _profile_at(pump_profile(day), minute)
        asleep = minute >= SLEEP[0] or minute < SLEEP[1]
        exercising = day in exercise and 17 * 60 <= minute < 20 * 60

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

        # -- Control-IQ sets this step's basal
        programmed = segment[1]
        if exercising and minute < 18 * 60:
            delivered, source = programmed * 0.5, "tempDelivery"
        elif predicted < 70:
            delivered, source = 0.0, "algorithmDelivery (control-iq suspension)"
        elif predicted < 112.5:
            delivered = programmed * max(0.0, 1 - (112.5 - predicted) / 40)
            source = "algorithmDelivery" if delivered > 0 else "algorithmDelivery (control-iq suspension)"
        elif predicted > (120 if asleep else 160):
            delivered = programmed * min(3.0, 1 + (predicted - (120 if asleep else 160)) / 90)
            source = "algorithmDelivery"
        else:
            delivered, source = programmed, "profileDelivery"
        delivered = round(delivered, 3)
        seq["basal"] += 1
        history.basal.append({"seq_num": seq["basal"], "time": _stamp(now), "delivery_type": source,
                              "duration_mins": STEP, "basal_rate": delivered,
                              "profile_basal_rate": programmed})
        need = true_basal_need(minute) * sensitivity[day] * (0.85 if exercising else 1.0)
        for k, weight in enumerate(INSULIN):
            insulin_excess[step + k] += (delivered - need) * STEP / 60 * weight

        # -- Control-IQ's automatic correction, at most hourly, never asleep
        if (not asleep and seen > 180 and trend > 0 and step - last_auto >= 12):
            wanted = 0.6 * ((seen - 110) / segment[2] - bolus_iob[step])
            if wanted >= 0.1:
                bolus(step, insulin=wanted, requested=wanted, carbs_g=None, bg_read=seen,
                      food=0.0, correction=wanted, option=3, override=0, segment=segment)
                last_auto = step

        # -- the person: meal boluses as planned
        for behaviour, grams, roll in bolus_at.get(step, ()):
            entered = grams * (rng.uniform(0.5, 0.68) if behaviour == "undercount"
                               else rng.gauss(1.0, 0.08))
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
        if (cgm is not None and not asleep and cgm > 230 and trend > -0.5
                and step - last_user_bolus >= 30 and rng.random() < 0.12):
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

        # -- the person: lows, treated after a few minutes, sometimes too well
        if cgm is not None and cgm < 70 and not low_episode:
            low_episode = True
            treat_at = step + rng.randint(1, 4)
        if cgm is not None and cgm > 85:
            low_episode = False
        if treat_at == step:
            treat_at = None
            roll = rng.random()
            if roll < 0.85:
                grams = rng.uniform(12, 20) if roll < 0.55 else rng.uniform(32, 55)
                for k, weight in enumerate(FAST):
                    carbs[step + k] += grams * weight
                history.treated_lows.append((now, round(grams)))

        # -- meals are eaten as planned
        for meal_step, grams, behaviour, r1, r2 in meal_at.get(step, ()):
            absorbed = grams * rng.gauss(1.0, 0.1)
            for k, weight in enumerate(MEAL):
                carbs[step + k] += absorbed * weight

        # -- the pump's own events
        if day in site_changes and minute == 10 * 60:
            seq["pump"] += 1
            history.pump.append({"seq_num": seq["pump"], "time": _stamp(now),
                                 "event_type": "Site/Cartridge Change", "duration_mins": 0})

        # -- glucose moves to the next step
        isf = TRUE_ISF * sensitivity[day] * (1.2 if exercising else 1.0)
        bg += (isf / true_carb_ratio(minute)) * carbs[step] - isf * insulin_excess[step]
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
