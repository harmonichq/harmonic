#!/opt/homebrew/bin/python3.14
"""Builds mockup.html and provenance.tsv from the captured engine payloads.

Run from this folder:  python3 -I build.py
Every visible number and data label is produced through v(), which records its source.
"""
import json, pathlib, re, statistics as st
from datetime import datetime, timedelta

HERE = pathlib.Path(__file__).parent
API = HERE.parent.parent / "api"
CSS = (HERE / "style.css.txt").read_text()
J = lambda name: json.loads((API / name).read_text())

guid, find, status = J("guidance.json"), J("findings.json"), J("status.json")
out = {d: J(f"outcomes_{d}.json")["metrics"] for d in (14, 30, 90)}
cov = {d: J(f"outcomes_{d}.json")["coverage"] for d in (14, 30, 90)}
trials, plan, pump = J("trials.json"), J("plan.json"), J("pump_settings.json")
tod, day = J("time_of_day.json"), J("timeline_2026-09-29.json")
prompts, carbs = J("prompts.json"), J("carbs.json")["carb_entries"]
PENDING = [x for x in prompts if x["answer"] is None]
SYNC_FAILED = bool(status.get("last_error"))
LAST_CARB = max(carbs, key=lambda x: x["t"])

PROV = []
SCREEN = [""]
def v(value, src, label=None):
    """Return value for display and record one provenance line on the current screen."""
    PROV.append((SCREEN[0], label or str(value), str(value), src))
    return value
def lab(text, src="UI label (no data)"):
    return v(text, src)

def fmt_d(iso):  # '2026-09-19 20:06:59' -> '19 Sep'
    return datetime.fromisoformat(iso[:19]).strftime("%-d %b")
def fmt_t(iso):
    return datetime.fromisoformat(iso[:19]).strftime("%H:%M")

# ── engine facts ──
cand = {c["subject"]: c for c in guid["candidates"]}
QUEUE_SUBJECTS = [c["subject"] for c in sorted(
    (c for c in guid["candidates"] if c["admitted"] and isinstance(c["priority"], int)
     and not c["preference"]["set_aside"]), key=lambda c: (-c["priority"], c["subject"]))]
assert QUEUE_SUBJECTS == ["pattern:highs_after_meals", "pattern:highs_after_treating_lows",
                          "pattern:lows_after_meals", "pattern:lows_after_correcting_highs"], QUEUE_SUBJECTS
SET_ASIDE = sum(c["preference"]["set_aside"] for c in guid["candidates"])
frow = {r["id"]: r for r in find["rows"]}
top = cand[QUEUE_SUBJECTS[0]]
top_find = frow["pattern:highs_after_meals"]["count_sentences"][0]
fw = find["findings_window"]
WINDOW = f'{fmt_d(fw["start"])} – {fmt_d(fw["end"])}'
TODAY = datetime(2026, 10, 12)  # status.last_attempt_at date
LAST_DATA = out_span_end = J("outcomes_14.json")["span_end"]
DATA_AGE = (TODAY.date() - datetime.fromisoformat(LAST_DATA).date()).days
SNOOZE_UNTIL = (TODAY + timedelta(days=14)).strftime("%-d %b")
hist = frow["ich1_WzQyMCw2NjAsIjQiXQ"]
seg_pump = next(s for s in pump["profile"]["segments"] if s["start_min"] == hist["span"]["start_min"])
last_trial = max(trials["trials"], key=lambda t: t["changed_at"])
lt_out = {o["key"]: o for o in last_trial["ending"]["assessment"]["outcomes"]}
days_required = last_trial["maturing"]["days_required"]

# ── glyphs, frames ──
GLYPH = {
    "Queue": '<path d="M4 6h14M4 11h14M4 16h9"/>',
    "Changes": '<path d="M4 8h12l-3-3M18 14H6l3 3"/>',
    "Overview": '<path d="M5 18v-6M11 18V5M17 18v-9"/>',
    "Day": '<rect x="3.5" y="4.5" width="15" height="14" rx="2"/><path d="M3.5 9h15M8 2.5v4M14 2.5v4"/>',
    "Settings": '<circle cx="11" cy="11" r="3"/><path d="M11 2.5v3M11 16.5v3M2.5 11h3M16.5 11h3M5 5l2.1 2.1M14.9 14.9 17 17M5 17l2.1-2.1M14.9 7.1 17 5"/>',
}
def glyph(n):
    return f'<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">{GLYPH[n]}</svg>'
def tab_badge(n):
    if n == "Settings" and SYNC_FAILED:
        return f'<span class="tb alert">{v("!", "status.json last_error != null (alert badge)")}</span>'
    if n == "Day" and PENDING:
        return f'<span class="tb count">{v(len(PENDING), "derived: count prompts.json[] where answer = null")}</span>'
    return ""
def tab_icon(n):
    return f'<span class="ic">{glyph(n)}{tab_badge(n)}</span>'
def tabs(on):
    return '<div class="tabs">' + "".join(f'<div{" class=on" if n == on else ""}>{tab_icon(n)}<span>{n}</span></div>' for n in GLYPH) + "</div>"
SNOOZE_SVG = ('<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.6" '
              'stroke-linecap="round" stroke-linejoin="round"><circle cx="9.5" cy="12.5" r="6.5"/><path d="M9.5 9v3.5l2.2 1.4"/>'
              '<path d="M14.5 2.5h4.5l-4.5 4.5h4.5"/></svg>')
LOGBTN = '<span class="lbtn"><b>+</b> Log carbs</span>'
def right(*parts):
    return '<span class="tr">' + "".join(parts) + "</span>"
def rail(on):
    return '<div class="rail">' + "".join(f'<span{" class=on" if n == on else ""}>{tab_icon(n)}<span>{n}</span></span>' for n in GLYPH) + "</div>"
def status_bar():
    return f'<div class="status"><span>9:41</span><span>{v("Mon 12 Oct", "status.json last_attempt_at (date of today)")}</span></div>'
def sysbar():
    return ""  # round 8: no system bar; sync state lives on Settings
    if not (SYNC_FAILED or DATA_AGE >= 1):
        return ""
    return ('<div class="sysbar"><span class="warn">⚠</span>'
            f'{lab("Data")} {v(datetime.fromisoformat(LAST_DATA).strftime("%-d %b %H:%M"), "outcomes_14.json span_end")} · '
            f'{v(f"{DATA_AGE} d", "derived: today (status.last_attempt_at) − outcomes_14.span_end")}'
            + (f' · <b>{v("Sync failed", "status.json last_error != null")}</b>' if SYNC_FAILED else "") + "</div>")
CAPN = [0]
def capnum(cap):
    CAPN[0] += 1
    return f"{CAPN[0]} · " + re.sub(r"^\d+ · ", "", cap)
def phone(cap, body_fn, tab, extra_fn=None):
    cap = capnum(cap); SCREEN[0] = cap
    sb = status_bar(); sy = sysbar(); body = body_fn(); extra = extra_fn() if extra_fn else ""
    return (f'<div class="screen"><div class="cap">{cap}</div><div class="phone">{sb}{sy}'
            f'<div class="view{" kbview" if not tab else ""}">{body}</div>{extra}{tabs(tab) if tab else ""}</div></div>')
def framed(kind, cap, on, panes):
    cap = capnum(cap); SCREEN[0] = cap
    sy = sysbar()
    html = "".join(f'<div class="pane" style="{st_}">{fn()}</div>' for fn, st_ in panes)
    return f'<div class="screen"><div class="cap">{cap}</div><div class="{kind}{" sys" if sy else ""}">{sy}{rail(on)}{html}</div></div>'
def desktop(cap, on, panes):
    return framed("desktop", cap, on, panes)
def tablet(cap, on, panes):
    return framed("tablet", cap, on, panes)

# ── components ──
def title(name, right_html):
    return f'<div class="title"><h2>{name}</h2>{right_html}</div>'
def hidden_kicker():
    return f'<span class="kicker">{lab("Hidden")} {v(SET_ASIDE, "derived: count guidance.candidates[].preference.set_aside")}</span>'
def fmt_clock(m):
    return f"{m // 60:02d}:{m % 60:02d}"

op = {p["key"]: p for p in find["outcome_patterns"]}
def headline(key):
    """Pattern headline: outcome words from the findings sentence whose count/denominator equal the outcome pattern's k/n."""
    p = op[key]
    for r in find["rows"]:
        for c in r.get("count_sentences") or []:
            if c["count"] == p["k"] and c["denominator"] == p["n"] and (r["id"] == f"pattern:{key}" or r.get("claimed_by") is None):
                return c, f'findings.rows[id={r["id"]}].count_sentences[noun={c["noun"]}]'
    raise KeyError(key)

CAUSES = {  # pattern -> fold sentences on the pattern's own denominator (scope = pattern)
    k: [(m, frow[m["subject"].replace("habit:", "finding:")]) for m in op[k]["members"]
        if m["subject"].startswith("habit:") and m["subject"].replace("habit:", "finding:") in frow]
    for k in op}

def mtitle(subj, member):
    return next(x["title"] for x in cand[subj]["members"] if x["subject"] == member)

def episode_rows(subj, limit, all_by_date=False):
    c = cand[subj]; eps = []
    for e in c["evidence"]:
        facts = {x["operation"].split(".")[-1]: x["facts"] for x in e["citations"]}
        eps.append((e["episode_id"], facts))
    peaks = sorted((x for x in eps if "peak" in x[1]), key=lambda x: -x[1]["peak"]["glucose_mgdl"])
    lows = [x for x in eps if "nadir" in x[1] and x[1]["nadir"]["glucose_mgdl"] < tod["target_range"]["low"]]
    chosen = (peaks[:limit - len(lows[:1])] + lows[:1])[:limit]
    if all_by_date:
        ref = lambda x: (x[1].get("nadir") or x[1].get("peak"))["event_refs"][0]
        chosen = sorted((x for x in eps if "peak" in x[1] or "nadir" in x[1]), key=ref)
    html = ""
    for eid, f in chosen:
        low = "nadir" in f
        ev = f["nadir"] if low else f["peak"]
        ref = ev["event_refs"][0]
        src = f"guidance.candidates[{subj}].evidence[episode_id={eid}].citations"
        when = v(f"{fmt_d(ref)} {fmt_t(ref)}", src + f"[{'nadir' if low else 'peak'}].facts.event_refs[0]")
        val = v(int(ev["glucose_mgdl"]), src + f"[{'nadir' if low else 'peak'}].facts.glucose_mgdl")
        res = v(int(f["resolution"]["glucose_mgdl"]), src + "[resolution].facts.glucose_mgdl")
        kind = lab("Nadir") if low else lab("Peak")
        html += (f'<div class="ep{" low" if low else ""}"><div><span class="d">{when}</span>'
                 f'<span class="v">{kind} <b>{val}</b>{" ▼" if low else " ▲"} → {res} {lab("mg/dL")}</span></div><span class="go">›</span></div>')
    return html

def detail_lines(subj):
    c = cand[subj]; key = c["pattern_key"]
    hc, hsrc = headline(key)
    cnt = v(f'{hc["count"]} / {hc["denominator"]}', f"findings.outcome_patterns[key={key}].k / .n")
    outcome = v(f'{hc["noun"].capitalize()} {hc["outcome"]}', hsrc + ".noun + .outcome")
    lines = f'<div class="ln lead"><span>{outcome}</span><span class="num">{cnt}</span></div>'
    w = op[key].get("wilson")
    if w:
        lines += (f'<div class="ln"><span>{lab("Range")}</span><span class="num">'
                  f'{v(f"{w["lo"] * 100:.0f}–{w["hi"] * 100:.0f}%", f"findings.outcome_patterns[key={key}].wilson.lo/.hi (same k/n as headline)")}</span></div>')
    for m, row in CAUSES[key]:
        fs = next((x for x in (row.get("fold_sentences") or []) if x["scope"] == "pattern"
                   and x["denominator"] == hc["denominator"] and x["noun"] == hc["noun"]), None)
        if fs:
            lines += (f'<div class="ln"><span>{v(mtitle(subj, m["subject"]), f"guidance.candidates[{subj}].members[{m["subject"]}].title")}</span>'
                      f'<span class="num">{v(f"{fs["count"]} / {fs["denominator"]}", f"findings.rows[id={row["id"]}].fold_sentences[scope=pattern].count / .denominator")}</span></div>')
    for m, row in CAUSES[key]:
        fs = next((x for x in (row.get("fold_sentences") or []) if x["scope"] == "outside"
                   and x["noun"] != hc["noun"] and m["subject"] == "habit:high_carb_sequence"), None)
        if fs:
            lines += (f'<div class="ln"><span>{v("High-carb sequences", f"guidance.candidates[{subj}].members[{m["subject"]}].title (plural)")}</span>'
                      f'<span class="num">{v(f"{fs["count"]} / {fs["denominator"]}", f"findings.rows[id={row["id"]}].fold_sentences[scope=outside].count / .denominator")} '
                      f'{v("less in range", f"findings.rows[id={row["id"]}].fold_sentences[0].outcome (ran less in range)")}'
                      + (f' · {v(f"{c["support"]["lo"] * 100:.0f}–{c["support"]["hi"] * 100:.0f}%", f"guidance.candidates[{subj}].support.lo/.hi (k={c["support"]["k"]}, n={c["support"]["n"]} = this line)")}'
                         if c["support"].get("k") == fs["count"] and c["support"].get("n") == fs["denominator"] else "")
                      + '</span></div>')
    return lines

def qcard(rank, subj, expanded=False, swipe=False, eps=4, hover=False):
    c = cand[subj]; key = c["pattern_key"]
    hc, hsrc = headline(key)
    cnt = v(f'{hc["count"]} / {hc["denominator"]}', f"findings.outcome_patterns[key={key}].k / .n")
    kind = v(c["kind"].capitalize(), f"guidance.candidates[{subj}].kind")
    rk = v(rank, "derived: rank of guidance.candidates where admitted ∧ ¬preference.set_aside, sorted by −priority")
    wide = (f'<span class="pill wait">{v("Wide", f"guidance.candidates[{subj}].support.wide = true")}</span>'
            if c["support"].get("wide") and expanded else "")
    head = (f'<div class="qc-h"><span class="kicker">{rk} · {kind}</span>{wide}<span class="chev">{"⌃" if expanded else "⌄"}</span></div>'
            f'<div class="qc-t"><span class="qc-name">{v(c["title"], f"guidance.candidates[{subj}].title")}</span>'
            + ("" if expanded else f'<span class="qc-n">{cnt}</span>') + "</div>")
    if not expanded:
        card = (f'<div class="card qc row1" tabindex="0"><span class="rk">{rk}</span>'
                f'<span><span class="qc-name">{v(c["title"], f"guidance.candidates[{subj}].title")}</span><span class="kicker qk">{kind}</span></span>'
                f'<span class="qc-n">{cnt}</span><span class="chev">⌄</span></div>')
        if swipe:
            card = (f'<div class="swipewrap snz"><div class="reveal">{lab(SNOOZE_SVG, "UI icon: swipe = snooze 14 d (guidance preference until today + 14 d)")}</div>{card}</div>')
        return card
    lines = detail_lines(subj)
    body = (f'<div class="lines">{lines}</div>'
            f'<div class="sect" style="margin-top:12px"><span>{lab("Episodes")}</span><span></span></div>'
            f'<div>{episode_rows(subj, eps)}</div>'
            f'<div class="pinwrap"><div class="primary">{lab("Pin", "UI action: POST /api/focus (pattern_key)")}</div></div>')
    return f'<div class="hero qc">{head}{body}</div>'

def stack(expanded_rank=1, swipe_rank=None, eps=4, hover_rank=None):
    return '<div class="stack">' + "".join(
        qcard(i, s, expanded=(i == expanded_rank), swipe=(i == swipe_rank), eps=eps, hover=(i == hover_rank))
        for i, s in enumerate(QUEUE_SUBJECTS, start=1)) + "</div>"

EX = "example state (Trial not yet created: no data since the change); "
def trial_card(mini=False, compact=False):
    span = hist["span"]
    since = datetime.fromisoformat(hist["regime_end"]).strftime("%-d %b")
    ticks = '<div class="ticks"' + (' style="margin:14px 0 6px"' if not mini else ' style="margin:12px 0 6px"') + ">" + "<i></i>" * days_required + "</div>"
    head = (f'<span class="kicker">{v("Trial", EX + "kind")} · {lab("since")} {v(since, EX + "findings.rows[ich1_WzQyMCw2NjAsIjQiXQ].regime_end")}</span>'
            f'<span class="pill wait">{v("Maturing", EX + "derived: 0 post-change data days < days_required")}</span>')
    name = (f'{v("Carb ratio", EX + "guidance.candidates[setting:carb_ratio].title")} '
            f'{v(f"{fmt_clock(span["start_min"])}–{fmt_clock(span["end_min"])}", EX + "findings.rows[ich1_WzQyMCw2NjAsIjQiXQ].span")}')
    val = (f'{v(f"{hist["past_setting"]:g} → {hist["programmed_now"]:g}", EX + "findings.rows[ich1_WzQyMCw2NjAsIjQiXQ].past_setting → .programmed_now")}'
           f'<span class="unit">{v(cand["setting:carb_ratio"]["units"], EX + "guidance.candidates[setting:carb_ratio].units")}</span>')
    days = (f'<div class="kv" style="border:0;padding-top:0"><span>{lab("Days")}</span><span class="num">'
            f'{v(0, EX + "derived: status.latest_data_day 2026-09-30 precedes regime_end 2026-10-12")} / '
            f'{v(days_required, EX + "trials.json trials[].maturing.days_required")}</span></div>')
    m = out[14]
    rows = [("In range", f'{m["tir"]}%', "outcomes_14.metrics.tir"),
            ("Below 70", f'{m["tbr_lvl1"]}%', "outcomes_14.metrics.tbr_lvl1"),
            ("Above 180", f'{m["tar_lvl1"]}%', "outcomes_14.metrics.tar_lvl1"),
            ("Mean", f'{m["mean_glucose"]:.0f} mg/dL', "outcomes_14.metrics.mean_glucose (rounded)")]
    if compact:
        rows = rows[:1]
    ba = "".join(f'<div class="ba"><span>{lab(n)}</span><span>{v(x, EX + s)}</span><span class="na">{lab("—", "no post-change data")}</span></div>' for n, x, s in rows)
    cls = "card" if mini else "hero"
    return (f'<div class="{cls}"><div class="title" style="align-items:center">{head}</div><div class="hname">{name}</div>'
            f'<div style="margin:8px 0 0"><span class="big" style="font-size:{30 if mini else 44}px">{val}</span></div>{ticks}{days}'
            f'<div style="margin-top:6px"><div class="ba h"><span></span><span>{lab("Before 14 d", "outcomes_14 window")}</span><span>{lab("After")}</span></div>{ba}</div></div>')

def last_change():
    o = lt_out["tir"]; a = o["assessment"]
    src = f"trials.json trials[id={last_trial['id']}]"
    return (f'<div class="card"><div class="lc">'
            f'<span><span class="kicker">{v("Trial", src + " (trials.json = Trials)")}</span> · {v("Profile", src + ".parameter")} · {v(fmt_d(last_trial["changed_at"]), src + ".changed_at")}</span>'
            f'<span class="pill wait">{v(a["state"].capitalize(), src + ".ending.assessment.outcomes[key=tir].assessment.state")}</span>'
            f'<span class="num">{lab("In range")} {v(f"{o["before"]}% → {o["after"]}%", src + ".ending.assessment.outcomes[tir].before → .after")}</span>'
            f'<span class="delta down flat">{v(f"{abs(o["difference"]):.1f} pts", src + ".outcomes[tir].difference")}</span></div></div>')


def bands(d):
    m = out[d]
    return (m["tbr_lvl2"], round(m["tbr_lvl1"] - m["tbr_lvl2"], 1), m["tir"],
            round(m["tar_lvl1"] - m["tar_lvl2"], 1), m["tar_lvl2"])
def ov_hero(sup=False):
    m14, m90 = out[14], out[90]
    rows = ""
    for d in (14, 30, 90):
        vl, l, r, h, vh = bands(d)
        rows += (f'<div class="tirrow{" s" if d == 14 else ""}"><span>{lab(f"{d} d")}</span><div class="tir"><i class="vl" style="width:{vl}%"></i>'
                 f'<i class="l" style="width:{l}%"></i><i class="r" style="width:{r}%"></i><i class="h" style="width:{h}%"></i>'
                 f'<i class="vh" style="width:{vh}%"></i></div><span class="v">{v(f"{r}%", f"outcomes_{d}.metrics.tir; bar bands derived: tbr_lvl2, tbr_lvl1−tbr_lvl2, tir, tar_lvl1−tar_lvl2, tar_lvl2")}</span></div>')
    bl = ('<div class="bandlab"><span></span><div>'
          + "".join(f"<span>{lab(x, 'band label: outcomes metric level definition (openspec outcomes spec)')}</span>" for x in ("&lt;70", "70–180", "&gt;180", "&gt;250"))
          + '</div><span></span></div>')
    h = (f'<div class="hero"><div class="title"><span class="kicker">{lab("In range · 14 d")}</span>'
         f'<span class="delta down worse">{v(f"{m90["tir"] - m14["tir"]:.1f} pts vs 90 d", "derived: outcomes_90.tir − outcomes_14.tir")}</span></div>'
         f'<div style="margin-top:8px"><span class="big" style="font-size:44px">{v(m14["tir"], "outcomes_14.metrics.tir")}</span><span class="unit">%</span></div>'
         f'<div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">{rows}{bl}</div>')
    if sup:
        cells = [("GMI", f'{m14["gmi"]}%', "outcomes_14.metrics.gmi", m14["gmi"] - m90["gmi"], "flat"),
                 ("Above 250", f'{m14["tar_lvl2"]}%', "outcomes_14.metrics.tar_lvl2", m14["tar_lvl2"] - m90["tar_lvl2"], "worse"),
                 ("CV", f'{m14["cv"]}%', "outcomes_14.metrics.cv", m14["cv"] - m90["cv"], "flat")]
        h += '<div class="sup">' + "".join(
            f'<div><span>{lab(n)}</span><b>{v(x, s)}</b> <span class="delta up {cl}">{v(f"{dv:.1f}", "derived: 14 d − 90 d of same metric")}</span></div>'
            for n, x, s, dv, cl in cells) + "</div>"
    return h + "</div>"

PRE = {14: 150, 30: 142, 90: 136}; POST = {14: 170, 30: 161, 90: 141}
def mrows(full):
    def r(name, key, unit="%", better_when_down=None, nd=1):
        vals = []
        for d in (14, 30, 90):
            x = out[d][key]
            vals.append((f"{x:.{nd}f}{unit}" if unit == "%" else f"{x:.0f}", f"outcomes_{d}.metrics.{key}"))
        dv = out[14][key] - out[90][key]
        cl = "flat" if better_when_down is None else ("better" if (dv < 0) == better_when_down else "worse")
        return (name, vals, dv, cl, nd)
    rows = [r("Below 70", "tbr_lvl1", better_when_down=True)]
    if full: rows.append(r("Below 54", "tbr_lvl2", better_when_down=True))
    rows.append(r("Above 180", "tar_lvl1", better_when_down=True))
    if full: rows.append(r("Above 250", "tar_lvl2", better_when_down=True))
    rows.append(r("Mean", "mean_glucose", unit="mg/dL", nd=0))
    if full:
        rows.append(r("GMI", "gmi")); rows.append(r("CV", "cv"))
    rows.append(("Pre-meal", [(str(PRE[d]), "prototype") for d in (14, 30, 90)], PRE[14] - PRE[90], "flat", 0))
    rows.append(("Post-meal 2 h", [(str(POST[d]), "prototype") for d in (14, 30, 90)], POST[14] - POST[90], "flat", 0))
    if full:
        rows.append(("CGM active", [(f'{cov[d]["cgm_active"]:.0f}%', f"outcomes_{d}.coverage.cgm_active") for d in (14, 30, 90)],
                     cov[14]["cgm_active"] - cov[90]["cgm_active"], "flat", 1))
    return rows
def mtable(full):
    head = (f'<tr><th></th><th class="s">{lab("14 d")}</th><th>{lab("30 d")}</th><th>{lab("90 d")}</th>'
            f'<th>{lab("Δ 14 / 90")}</th></tr>')
    body = ""
    for name, vals, dv, cl, nd in mrows(full):
        cells = "".join(f'<td class="{"s" if i == 0 else ""}">{v(x, s)}</td>' for i, (x, s) in enumerate(vals))
        arrow = "up" if dv > 0 else "down" if dv < 0 else "same"
        src = "prototype (derived 14 d − 90 d)" if vals[0][1] == "prototype" else "derived: 14 d − 90 d"
        body += (f'<tr><td>{lab(name)}</td>{cells}<td><span class="delta {arrow} {cl}">'
                 f'{v(f"{abs(dv):.{max(nd, 0) if nd else 0}f}", src)}</span></td></tr>')
    return f'<table class="m">{head}{body}</table>'

def tod_strip(legend=False):
    bins = tod["pooled"]["bins"]; lo, hi = 40, 300
    pct = lambda g: (g - lo) / (hi - lo) * 100
    band_l, band_w = pct(tod["target_range"]["low"]), pct(tod["target_range"]["high"]) - pct(tod["target_range"]["low"])
    html = ""
    for a, b in ((0, 360), (360, 720), (720, 1080), (1080, 1440)):
        bs = [x for x in bins if a <= x["minute"] < b]
        q = {k: st.median(x[k] for x in bs) for k in ("median", "p10", "p25", "p75", "p90")}
        hx = ""
        if q["p75"] > tod["target_range"]["high"]:
            hx = f'<i class="hx" style="left:{pct(tod["target_range"]["high"]):.1f}%;width:{pct(q["p75"]) - pct(tod["target_range"]["high"]):.1f}%"></i>'
        html += (f'<div class="tod"><span>{lab(f"{a // 60:02d}–{b // 60:02d}", "block label")}</span><div class="track">'
                 f'<i class="bd" style="left:{band_l:.1f}%;width:{band_w:.1f}%"></i>'
                 f'<i class="wh" style="left:{pct(q["p10"]):.1f}%;width:{pct(q["p90"]) - pct(q["p10"]):.1f}%"></i>'
                 f'<i class="iq" style="left:{pct(q["p25"]):.1f}%;width:{pct(q["p75"]) - pct(q["p25"]):.1f}%"></i>{hx}'
                 f'<i class="md" style="left:{pct(q["median"]):.1f}%"></i></div>'
                 f'<span class="v">{v(round(q["median"]), "derived: median of time_of_day.pooled.bins[].median in block (p10/p25/p75/p90 likewise)")}</span></div>')
    html += ('<div class="scale" style="margin-left:54px;margin-right:50px">'
             + "".join(f"<span>{lab(x, 'axis label')}</span>" for x in ("40", "70", "180", "300")) + "</div>")
    if legend:
        html += ('<div class="legend" style="margin-top:6px">'
                 f'<span><i class="mk" style="background:var(--ink);width:2px;height:12px;border-radius:0"></i>{lab("Median")}</span>'
                 f'<span><i class="mk" style="background:var(--ink3);width:14px;height:6px;border-radius:1px"></i>{lab("IQR")}</span>'
                 f'<span><i class="mk" style="background:var(--high);width:10px;height:6px;border-radius:0"></i>{lab("IQR &gt;180")}</span>'
                 f'<span><i class="mk" style="background:#b9b6ae;width:14px;height:2px;border-radius:0"></i>{lab("p10–p90")}</span></div>')
    return f"<div>{html}</div>"
def tod_head():
    return (f'<div class="sect"><span>{lab("Time of day")} · {v(f"{tod["window"]["data_days"]} d", "time_of_day.window.data_days")}</span>'
            f'<span>{lab("mg/dL")}</span></div>')

# ── Day (timeline_2026-09-29) ──
W, H, LO, HI = 320, 130, 40, 300
mm = lambda t: int(t[11:13]) * 60 + int(t[14:16])
X = lambda m: round(m / 1440 * W, 1)
Y = lambda g: round(H - (g - LO) / (HI - LO) * H, 1)
cgm = [(mm(c["t"]), c["bg"]) for c in day["cgm"] if c.get("bg")]
bg = [g for _, g in cgm]
day_logged = [c for c in carbs if c["t"].startswith(day["start"][:10])]
bol = day["boluses"]; meals = [b for b in bol if b["carbs"] is not None]
basal_u = sum((s["basal_rate"] or 0) * s["duration_mins"] / 60 for s in day["basal"])
bolus_u = sum(b["insulin"] or 0 for b in bol)

NAV = J("day_navigator_2026-09.json")
NAVD = {d["iso"]: d for d in NAV["days"]}
SEL = day["start"][:10]
from datetime import date as _date
def ntile(iso, strip=False, big=False):
    d = NAVD.get(iso); dt = _date.fromisoformat(iso)
    src = f"day_navigator_2026-09.json days[iso={iso}]"
    sel = " sel" if iso == SEL else ""
    wd = f'<span class="wd">{lab("SMTWTFS"[(dt.weekday() + 1) % 7], "weekday label")}</span>' if strip else ""
    num = f'<span class="dn">{v(dt.day, src + ".iso")}</span>'
    if not d or not d["has_data"]:
        return f'<div class="nt nd{sel}">{wd}{num}<span class="nx">—</span></div>'
    tint = "t-low" if d["lows"] else ("t-high" if d["highs"] else "t-clean")
    w, h = (64, 20) if big else (38, 14)
    pts = " ".join(f'{c["x"] * w:.1f},{h - (min(max(c["bg"], 40), 300) - 40) / 260 * h:.1f}' for c in d["curve"])
    v("curve", src + ".curve[] (sparkline)", "nav sparkline")
    sp = f'<svg class="ns" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><polyline points="{pts}" fill="none" stroke="var(--ink2)" stroke-width="1"/></svg>'
    if d["lows"] or d["highs"]:
        g = ((f'<span class="lo">▽{v(d["lows"], src + ".lows")}</span>' if d["lows"] else "")
             + (f'<span class="hi">△{v(d["highs"], src + ".highs")}</span>' if d["highs"] else ""))
    else:
        g = f'<span class="ok">{v("✓", src + " lows = highs = 0")}</span>'
    return (f'<div class="nt {tint}{sel}" tabindex="0">{wd}{num}{sp}<span class="ng">{g}</span>'
            f'<span class="nr">{v(f"{d["tir"]}%", src + ".tir")}</span></div>')
def week_strip():
    start = _date.fromisoformat(SEL); start = start.fromordinal(start.toordinal() - (start.weekday() + 1) % 7)
    days = [start.fromordinal(start.toordinal() + i).isoformat() for i in range(7)]
    return (f'<div class="mrow"><span class="ml">{v("Sep 2026", "day_navigator_2026-09.json month")} ⌄</span><span class="muted small">‹ ›</span></div>'
            '<div class="wstrip">' + "".join(ntile(x, strip=True) for x in days) + "</div>")
def month_grid(big=False):
    first = _date(2026, 9, 1); start = first.fromordinal(first.toordinal() - (first.weekday() + 1) % 7)
    end = _date(2026, 9, 30); stop = end.fromordinal(end.toordinal() + (5 - end.weekday()) % 7)
    days = [start.fromordinal(o).isoformat() for o in range(start.toordinal(), stop.toordinal() + 1)]
    head = "".join(f'<span>{lab(c, "weekday label")}</span>' for c in "SMTWTFS")
    legend = (f'<div class="legend" style="margin-top:8px"><span><i class="mk" style="background:var(--low-soft)"></i><span class="lo">▽</span> {lab("Lows")}</span>'
              f'<span><i class="mk" style="background:var(--high-soft)"></i><span class="hi">△</span> {lab("Highs")}</span>'
              f'<span><i class="mk" style="background:var(--inrange-soft)"></i><span class="ok">✓</span> {lab("Clean")}</span><span>{lab("% in range")}</span></div>')
    return (f'<div class="mhead{" big" if big else ""}">{head}</div><div class="mgrid{" big" if big else ""}">' + "".join(ntile(x, big=big) for x in days) + "</div>" + legend)
def month_sheet():
    return ('<div class="dim"></div><div class="sheet"><div class="grab"></div>'
            f'<div class="title" style="align-items:center"><span style="font-size:20px;font-weight:650">{v("September 2026", "day_navigator_2026-09.json month")}</span><span class="x">✕</span></div>'
            + month_grid() + "</div>")

def day_view(prompts=True, events=True, nav=True):
    tr = tod["target_range"]
    stats = [("Mean", f'{st.mean(bg):.0f}', "mg/dL", "derived: mean(timeline.cgm[].bg)"),
             ("In range", f'{sum(tr["low"] <= g <= tr["high"] for g in bg) / len(bg) * 100:.0f}', "%", "derived: share of timeline.cgm[].bg within time_of_day.target_range"),
             ("Carbs", f'{sum(b["carbs"] for b in meals):.0f}', "g", "derived: sum timeline.boluses[].carbs"),
             ("Insulin", f'{bolus_u + basal_u:.1f}', "U", "derived: sum timeline.boluses[].insulin + sum basal[].basal_rate×duration_mins/60")]
    s4 = '<div class="stats4">' + "".join(
        f'<div><span>{lab(n)}</span><b>{v(x, s)}</b> <small>{lab(u)}</small></div>' for n, x, u, s in stats) + "</div>"
    path = "M" + " L".join(f"{X(m)},{Y(g)}" for m, g in cgm[::2])
    sleep = "".join(f'<rect x="{X(mm(w["start"]))}" y="0" width="{X(mm(w["end"]) or 1440) - X(mm(w["start"])) if mm(w["end"]) else W - X(mm(w["start"]))}" height="{H}" fill="#1d2326" opacity=".035"/>'
                    for w in day["sleep_windows"])
    marks = "".join(
        (f'<circle cx="{X(mm(b["t"]))}" cy="0" r="4" fill="var(--ink)"/>' if b["carbs"] is not None
         else f'<circle cx="{X(mm(b["t"]))}" cy="0" r="3.5" fill="#fff" stroke="var(--ink2)" stroke-width="1.5"/>') for b in bol)
    marks += "".join(f'<path d="M{X(mm(e["t"]))} -5 l5 5 l-5 5 l-5 -5z" fill="none" stroke="var(--ink)" stroke-width="1.4"/>' for e in day_logged)
    marks += "".join(f'<rect x="{X(mm(e["t"])) - 3.5}" y="-3.5" width="7" height="7" fill="var(--ink3)"/>'
                     for e in day["pump_events"] if e["event_type"] == "User Suspended")
    hr = {h: [0.0, 0.0] for h in range(24)}
    for s in day["basal"]:
        h = int(s["t"][11:13]); hr[h][0] += (s["basal_rate"] or 0) * s["duration_mins"] / 60; hr[h][1] += (s["profile_basal_rate"] or 0) * s["duration_mins"] / 60
    bars = "".join(f'<rect x="{h * W / 24 + 1:.1f}" y="{34 - d / 2 * 34:.1f}" width="{W / 24 - 2:.1f}" height="{d / 2 * 34:.1f}"/>' for h, (d, p) in hr.items())
    prog = " ".join(f'{h * W / 24:.1f},{34 - p / 2 * 34:.1f} {(h + 1) * W / 24:.1f},{34 - p / 2 * 34:.1f}' for h, (d, p) in hr.items())
    axes = "".join(f'<text class="ax" x="322" y="{Y(g) + 3}">{lab(str(g), "axis label")}</text>' for g in (tr["low"], tr["high"], 250))
    chart = (f'<svg class="chart" width="330" height="236" viewBox="-4 -4 334 240">{sleep}'
             f'<rect class="band" x="0" y="{Y(tr["high"])}" width="{W}" height="{Y(tr["low"]) - Y(tr["high"])}"/>'
             f'<line class="grid" x1="0" x2="{W}" y1="{Y(250)}" y2="{Y(250)}"/>{axes}'
             f'<path class="line" d="{path}"/><g transform="translate(0,146)">{marks}</g>'
             f'<g transform="translate(0,160)"><line class="grid" x1="0" x2="{W}" y1="34" y2="34"/><g fill="#bcc6c6">{bars}</g>'
             f'<polyline points="{prog}" fill="none" stroke="var(--ink)" stroke-width="1.3" stroke-dasharray="3 2"/>'
             f'<text class="ax" x="322" y="4">{lab("2", "axis label")}</text><text class="ax" x="322" y="36">{lab("0 U/h", "axis label")}</text></g>'
             '<g class="ax">' + "".join(f'<text x="{x}" y="230">{lab(t, "axis label")}</text>' for x, t in ((0, "00"), (76, "06"), (156, "12"), (236, "18"), (308, "24")))
             + "</g></svg>")
    v("glucose line, bolus markers, basal bars", "timeline_2026-09-29 cgm[] (every 2nd point), boluses[] (carbs≠null = meal), basal[] hourly sums of basal_rate vs profile_basal_rate, pump_events[], sleep_windows[]", "Day chart")
    legend = ('<div class="legend" style="margin-top:6px">'
              f'<span><i class="mk meal"></i>{lab("Meal bolus")}</span><span><i class="mk corr"></i>{lab("Bolus, no carbs")}</span>'
              f'<span><i class="mk sus"></i>{lab("Suspend")}</span><span><i class="mk del"></i>{lab("Basal")}</span>'
              f'<span><i class="mk prog"></i>{lab("Programmed")}</span><span>▒ {lab("Sleep")}</span>'
              f'<span><i class="mk logc"></i>{lab("Logged carbs")} {v(len(day_logged), "derived: count carbs.json carb_entries[] on 2026-09-29")}</span></div>')
    ev = "".join(
        f'<div class="ev"><span class="tm">{v(b["t"][11:16], "timeline.boluses[].t")}</span><i class="mk meal"></i>'
        f'<span>{lab("Meal")} · {v(f"{b["carbs"]:.0f} g", "timeline.boluses[].carbs")}</span>'
        f'<span class="val">{v(f"{b["insulin"]:.2f} U", "timeline.boluses[].insulin")}</span></div>' for b in meals)
    return (title("Day", lab(LOGBTN, "UI control: opens Log carbs (POST /api/carbs)")) + (prompt_row() if prompts else "")
            + (week_strip() if nav else f'<div class="dsel">{v("Mon 29 Sep 2026", "timeline_2026-09-29.start")}</div>')
            + s4 + f'<div class="hero dayc">{chart}{legend}</div>'
            + (f'<div class="list">{ev}</div>' if events else ""))

# ── screens: each owns only its own content ──
def hidden_footer():
    if not SET_ASIDE:
        return ""
    return f'<div class="lfoot">{lab("Snoozed")} · {v(SET_ASIDE, "derived: count guidance.candidates[].preference.set_aside")} ›</div>'
def queue_body(expanded=1, swipe=None, eps=4):
    return lambda: title("Queue", "") + stack(expanded, swipe, eps) + hidden_footer()
def prompt_row():
    if not PENDING:
        return ""
    det = PENDING[0]["detector"]
    return (f'<div class="navrow pr"><span><span style="color:var(--low)">▼</span> '
            f'{v("Lows" if det == "low" else "Missed meals", "prompts.json[].detector = " + det)} · '
            f'<b>{v(len(PENDING), "derived: count prompts.json[] where answer = null")}</b></span><span class="chev">›</span></div>')
def hidden_screen():
    a = cand["pattern:highs_after_treating_lows"]
    hc, _ = headline(a["pattern_key"])
    return (title("‹ Snoozed", "")
            + f'<div class="hero" style="padding:4px 16px"><div class="sa"><span>{v(a["title"], "example state; guidance.candidates[pattern:highs_after_treating_lows].title")}</span>'
              f'<span class="secondary">{lab("Restore")}</span><span class="m">{lab("Until")} {v(SNOOZE_UNTIL, "example state; derived: today + 14 d")} · '
              f'{v(f"{hc["count"]} / {hc["denominator"]}", "example state; findings.outcome_patterns[key=highs_after_treating_lows].k / .n")}</span></div></div>')
def changes_body():
    return (title("Changes", "") + trial_card()
            + f'<div class="sect"><span>{lab("Last change")}</span><span></span></div>' + last_change())

def spark(p, w=300, h=40):
    tr = [(datetime.fromisoformat(x["t"]), x["bg"]) for x in p["cgm"] if x.get("bg")]
    t0, t1 = tr[0][0], tr[-1][0]; lo, hi = 40, max(g for _, g in tr) + 10
    X_ = lambda t: (t - t0).total_seconds() / (t1 - t0).total_seconds() * w
    Y_ = lambda g: h - (g - lo) / (hi - lo) * h
    pts = " ".join(f"{X_(t):.1f},{Y_(g):.1f}" for t, g in tr)
    at = datetime.fromisoformat(p["anchor_t"]); ax, ay = X_(at), Y_(p["key_bg"])
    y70 = Y_(tod["target_range"]["low"])
    v("trace", f"prompts.json[anchor_t={p['anchor_t']}].cgm[] (sparkline)", "sparkline")
    return (f'<svg class="chart" width="{w}" height="{h + 14}" viewBox="0 -2 {w + 22} {h + 16}">'
            f'<line x1="0" x2="{w}" y1="{y70:.1f}" y2="{y70:.1f}" stroke="var(--low)" stroke-width=".8" stroke-dasharray="3 2"/>'
            f'<text class="ax" x="{w + 3}" y="{y70 + 3:.1f}">{lab("70", "axis label")}</text>'
            f'<polyline points="{pts}" fill="none" stroke="var(--ink)" stroke-width="1.4"/>'
            f'<circle cx="{ax:.1f}" cy="{ay:.1f}" r="3.2" fill="var(--low)"/>'
            f'<text x="{ax - 4:.1f}" y="{h + 11}" font-size="9" fill="var(--low)">▼</text>'
            f'<text class="ax" x="0" y="{h + 11}">{v(tr[0][0].strftime("%H:%M"), "prompts.json[].cgm[0].t")}</text>'
            f'<text class="ax" x="{w - 24}" y="{h + 11}">{v(tr[-1][0].strftime("%H:%M"), "prompts.json[].cgm[-1].t")}</text></svg>')

def keypad(done=False):
    keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ("Done" if done else "."), "0", "⌫"]
    return '<div class="keypad">' + "".join(f'<span>{lab(x, "numeric keypad") if x == "Done" else x}</span>' for x in keys) + "</div>"

def prompt_card(p, state="open", cls="card"):
    src = f"prompts.json[anchor_t={p['anchor_t']}]"
    head = (f'<div class="ph"><span style="color:var(--low)">▼</span> '
            f'{v("Low" if p["detector"] == "low" else "Missed meal", src + ".detector")} · '
            f'{v(f"{fmt_d(p["anchor_t"])} {fmt_t(p["anchor_t"])}", src + ".anchor_t")} · '
            f'<b style="color:var(--low)">{v(f"{p["key_bg"]:.0f}", src + ".key_bg")}</b> {lab("mg/dL")}</div>'
            f'<div style="margin:6px 0 4px">{spark(p)}</div>')
    if state == "recorded":
        tail = (f'<div class="rec"><span>{lab("Carbs")}</span><span class="chipbtn on">{lab("Yes", "answer carbs: POST /api/prompts/answer {answer: carbs, entry: {grams: null, certainty: unknown}}")}</span>'
                f'<span class="pill wait">{lab("Recorded")}</span></div>'
                f'<div class="kv" style="margin-top:8px"><span>{lab("Grams")}</span><span class="muted small">{lab("Optional")}</span></div>'
                f'<div class="gfield sm"><span class="ph0">{lab("0", "input placeholder; PATCH /api/carbs/{carb_entry_id} {grams, certainty: exact}")}</span><span class="u">{lab("g")}</span></div>')
    else:
        btns = [("Yes", "answer carbs, grams null, certainty unknown"), ("No", "answer no"), ("False low", "answer false-low (low detector only)")]
        if p["detector"] != "low":
            btns = btns[:2]
        tail = (f'<div class="sect" style="margin:2px 0 6px"><span>{lab("Carbs")}</span><span></span></div>'
                '<div class="chips three">' + "".join(f'<span class="chipbtn">{lab(t, "POST /api/prompts/answer " + d)}</span>' for t, d in btns) + "</div>")
    card = f'<div class="{cls} pc" tabindex="0">{head}{tail}</div>'
    if state == "swipe":
        card = (f'<div class="swipewrap"><div class="reveal">{lab("Not sure", "swipe: POST /api/prompts/answer {answer: not-sure}")}</div>{card}</div>')
    return card

def ioskb():
    keys = [("1", ""), ("2", "ABC"), ("3", "DEF"), ("4", "GHI"), ("5", "JKL"), ("6", "MNO"),
            ("7", "PQRS"), ("8", "TUV"), ("9", "WXYZ"), ("", ""), ("0", ""), ("⌫", "")]
    v("system keyboard", "UI: native numeric keyboard (inputmode=numeric); drawn as iOS system chrome", "keyboard")
    return ('<div class="ioskb">' + "".join(
        f'<span class="{"blank" if not d else ""}"><b>{d}</b><i>{l}</i></span>' for d, l in keys) + '<div class="home"></div></div>')

def toast():
    return (f'<div class="toast">{lab(SNOOZE_SVG, "UI icon: snooze")}<span>{lab("Snoozed")} · {lab("Until")} {v(SNOOZE_UNTIL, "derived: today + 14 d")}</span>'
            f'<span class="undo">{lab("Undo", "UI action: DELETE /api/guidance/preferences/{subject}")}</span></div>')

def queue_snoozed():
    rest = QUEUE_SUBJECTS[1:]
    return title("Queue", "") + '<div class="stack">' + "".join(qcard(i, sj) for i, sj in enumerate(rest, start=1)) + "</div>"

def prompt_one(p, state="open"):
    src = f"prompts.json[anchor_t={p['anchor_t']}]"
    pos = v(f"1 / {len(PENDING)}", "derived: position of first unanswered prompt / count prompts.json[] where answer = null")
    head = (f'<div class="ph big"><span style="color:var(--low)">▼</span> '
            f'{v("Low" if p["detector"] == "low" else "Missed meal", src + ".detector")} · '
            f'{v(f"{fmt_d(p["anchor_t"])} {fmt_t(p["anchor_t"])}", src + ".anchor_t")} · '
            f'<b style="color:var(--low)">{v(f"{p["key_bg"]:.0f}", src + ".key_bg")}</b> {lab("mg/dL")}</div>'
            f'<div class="pspark">{spark(p, w=330, h=84 if state == "open" else 56)}</div>')
    if state == "yes":
        tail = (f'<div class="rec"><span>{lab("Carbs")}</span><span class="chipbtn on">{lab("Yes", "answer carbs: POST /api/prompts/answer {answer: carbs, entry: {grams: null, certainty: unknown}}")}</span>'
                f'<span class="pill wait">{lab("Recorded")}</span></div>'
                f'<div class="kv" style="margin-top:6px"><span>{lab("Grams")}</span><span class="muted small">{lab("Optional")}</span></div>'
                f'<div class="gfield sm focus"><span class="ph0">{lab("0", "input placeholder; PATCH /api/carbs/{carb_entry_id} {grams, certainty: exact}")}<i class="caret"></i></span><span class="u">{lab("g")}</span></div>'
                f'<div class="nextrow"><span class="tlink">{lab("Next", "UI action: advance to next prompt")} ›</span></div>')
    else:
        btns = [("Yes", "answer carbs, grams null, certainty unknown"), ("No", "answer no"), ("False low", "answer false-low (low detector only)")]
        tail = (f'<div class="sect" style="margin:10px 0 8px"><span>{lab("Carbs")}</span><span></span></div>'
                '<div class="chips three">' + "".join(f'<span class="chipbtn" tabindex="0">{lab(t, "POST /api/prompts/answer " + d)}</span>' for t, d in btns) + "</div>")
        v("swipe = Not sure", "UI gesture: swipe active prompt → POST /api/prompts/answer {answer: not-sure}", "swipe")
    return title("‹ Prompts", f'<span class="kicker">{pos}</span>') + f'<div class="pone">{head}{tail}</div>'

def log_sheet():
    return ('<div class="dim"></div><div class="sheet abovekb"><div class="grab"></div>'
            f'<div class="title" style="align-items:center"><span style="font-size:20px;font-weight:650">{lab("Log carbs")}</span><span class="x">✕</span></div>'
            f'<div class="gfield focus"><span class="ph0">{lab("0", "input placeholder (inputmode=numeric)")}<i class="caret"></i></span><span class="u">{lab("g")}</span></div>'
            f'<div class="kv" style="margin-top:10px"><span>{lab("Time")}</span><span class="num">{lab("Now", "UI default: POST /api/carbs t = now")} · {v("12 Oct 09:41", "UI default: device clock")} ›</span></div>'
            f'<div class="pinwrap"><div class="primary">{lab("Save", "POST /api/carbs {t, grams, certainty: exact, source: manual}")}</div></div></div>'
            + ioskb())

def day_bg():
    return title("Day", lab(LOGBTN, "UI control: opens Log carbs"))


import re as _re
def settings_screen():
    err = status.get("last_error") or ""
    m = _re.search(r"HTTP (\d{3})", err); keys = _re.findall(r'keys\\?":\s*\[\s*\\?"(\w+)', err) or _re.findall(r"eventIds", err)
    code = f"HTTP {m.group(1)} · {keys[0]}" if m and keys else (f"HTTP {m.group(1)}" if m else "")
    fd = lambda x: datetime.fromisoformat(x).strftime("%-d %b %H:%M")
    fday = lambda x: datetime.fromisoformat(x).strftime("%-d %b %Y")
    sync = (f'<div class="card setsec"><div class="sect"><span>{lab("Sync")}</span><span></span></div>'
            f'<div class="kv first"><span>{lab("State")}</span><span class="bad">⚠ {v("Failed", "status.json last_error != null")}</span></div>'
            f'<div class="kv"><span>{lab("Last success")}</span><span class="num">{v(fd(status["last_success_at"]), "status.json last_success_at")}</span></div>'
            f'<div class="kv"><span>{lab("Last attempt")}</span><span class="num">{v(fd(status["last_attempt_at"]), "status.json last_attempt_at")}</span></div>'
            f'<div class="kv"><span>{lab("Error")}</span><span class="num">{v(code, "derived: status.json last_error → HTTP status + unrecognized key")}</span></div>'
            f'<div class="kv"><span>{lab("Data")}</span><span class="num">{v(f"{fday(status["earliest_data_day"])} – {fday(status["latest_data_day"])}", "status.json earliest_data_day / latest_data_day")} · '
            f'{v(f"{status["data_day_count"]} d", "status.json data_day_count")}</span></div></div>')
    mask = "•" * 6 + "@" + "•" * 12
    acct = (f'<div class="card setsec"><div class="sect"><span>{lab("Account")}</span><span></span></div>'
            f'<div class="kv first"><span>{lab("Email")} · {lab("Region")}</span><span class="num">{v(mask, "GET /api/credentials .email (masked: length + @ position only)")} · {v("US", "GET /api/credentials .region (work.db credentials.region)")}</span></div>'
            f'<div class="kv"><span>{lab("Password")}</span><span class="acc-row">{v("Set", "derived: GET /api/credentials .configured = true (value never served)")}'
            f'<span class="secondary sm">{lab("Update", "POST /api/credentials {email, password, region}")}</span></span></div></div>')
    pr = pump["profile"]
    rows = "".join(
        f'<tr><td>{v(fmt_clock(x["start_min"]), "pump_settings.profile.segments[].start_min")}</td>'
        f'<td>{v(f"{x["basal_rate"]:g}", "pump_settings.profile.segments[].basal_rate")}</td>'
        f'<td>{v(x["isf"], "pump_settings.profile.segments[].isf")}</td>'
        f'<td>{v(f"{x["carb_ratio"]:g}", "pump_settings.profile.segments[].carb_ratio")}</td></tr>' for x in pr["segments"])
    tgt = {x["target_bg"] for x in pr["segments"]}
    prof = (f'<div class="card setsec"><div class="sect"><span>{lab("Pump profile")}</span>'
            f'<span>{v(pr["name"], "pump_settings.profile.name")} · {lab("Other")} {v(pump["other_profile_count"], "pump_settings.other_profile_count")} · {v(datetime.fromisoformat(pump["fetched_at"]).strftime("%-d %b %H:%M"), "pump_settings.fetched_at")}</span></div>'
            f'<div class="kv first"><span>{lab("DIA")} · {lab("Max bolus")} · {lab("Target")}</span><span class="num">'
            f'{v(f"{pr["dia_hours"]:g} h", "pump_settings.profile.dia_hours")} · {v(f"{pr["max_bolus"]:g} U", "pump_settings.profile.max_bolus")} · '
            f'{v(f"{min(tgt)} mg/dL", "pump_settings.profile.segments[].target_bg (all equal)")}</span></div>'
            f'<table class="pt"><tr><th>{lab("Start")}</th><th>{lab("Basal U/h")}</th><th>{lab("CF mg/dL/U")}</th><th>{lab("CR g/U")}</th></tr>{rows}</table>'
            '</div>')
    return sync, acct, prof
def settings_root():
    pr = pump["profile"]
    rows = (f'<div class="grow"><span>{lab("Tandem Source")}</span><span class="bad">⚠ {v("Failed", "status.json last_error != null")}</span><span class="chev">›</span></div>'
            f'<div class="grow"><span>{lab("Pump profile")}</span><span class="muted">{v(pr["name"], "pump_settings.profile.name")}</span><span class="chev">›</span></div>'
            f'<div class="grow"><span>{lab("Glossary")}</span><span></span><span class="chev">›</span></div>')
    return title("Settings", "") + f'<div class="glist">{rows}</div>'
def settings_tandem():
    sync, acct, _ = settings_screen()
    return title("‹ Tandem Source", "") + sync + acct
def settings_pump():
    _, _, prof = settings_screen()
    return title("‹ Pump profile", "") + prof


ANALYZE = J("analyze.json")
BASAL = {x["label"]: x for x in ANALYZE["basal"]}
SET_SLOTS = ["07:00", "07:30"]
EXS = "example state (setting not admitted today); "
def setting_detail(desktop=False):
    sl = [BASAL[x] for x in SET_SLOTS]
    span = f"{SET_SLOTS[0]}–08:00"
    rows = "".join(
        f'<tr><td>{v(x["label"], EXS + f"analyze.json basal[label={x["label"]}].label")}</td>'
        f'<td>{v(f"{x["current"]:g}", EXS + f"analyze.json basal[{x["label"]}].current")} → <b>{v(f"{x["estimate"]["value"]:.3f}".rstrip("0"), EXS + f"analyze.json basal[{x["label"]}].estimate.value")}</b></td>'
        f'<td>{v(f"{x["estimate"]["lo"]:.3f}".rstrip("0") + "–" + f"{x["estimate"]["hi"]:.3f}".rstrip("0"), EXS + f"analyze.json basal[{x["label"]}].estimate.lo/.hi")}</td>'
        f'<td>{v(f"{x["days"]} days", EXS + f"analyze.json basal[{x["label"]}].days")}</td></tr>' for x in sl)
    table = (f'<table class="st"><tr><th>{lab("Slot")}</th><th>{lab("U/h")}</th><th>{lab("Range")}</th><th>{lab("n")}</th></tr>{rows}</table>')
    # chart 05:00–09:30
    labels = [f"{h:02d}:{m:02d}" for h in range(5, 10) for m in (0, 30)]
    W, H, lo, hi = (520 if desktop else 300), 96, 0.4, 1.8
    n = len(labels); sw = W / n
    Y = lambda u: H - (u - lo) / (hi - lo) * H
    band = cur = est = ""
    for i, lb in enumerate(labels):
        x = BASAL[lb]; e = x["estimate"]; x0, x1 = i * sw, (i + 1) * sw
        if e["lo"] is not None:
            band += f'<rect x="{x0:.1f}" y="{Y(e["hi"]):.1f}" width="{sw:.1f}" height="{max(Y(e["lo"]) - Y(e["hi"]), 1):.1f}" fill="var(--accent-soft)"/>'
            est += f'<line x1="{x0 + 2:.1f}" x2="{x1 - 2:.1f}" y1="{Y(e["value"]):.1f}" y2="{Y(e["value"]):.1f}" stroke="var(--ink)" stroke-width="2"/>'
        cur += f"{x0:.1f},{Y(x['current']):.1f} {x1:.1f},{Y(x['current']):.1f} "
    hl0 = labels.index(SET_SLOTS[0]) * sw; hl1 = (labels.index(SET_SLOTS[-1]) + 1) * sw
    ticks = "".join(f'<text class="ax" x="{labels.index(t) * sw:.1f}" y="{H + 12}">{lab(t[:2], "axis label")}</text>' for t in ("05:00", "07:00", "09:00"))
    v("chart", EXS + "analyze.json basal[05:00..09:30] current (step), estimate.value (bar), estimate.lo/.hi (band)", "setting chart")
    chart = (f'<svg class="chart" width="{W + 26}" height="{H + 16}" viewBox="0 0 {W + 26} {H + 16}">'
             f'<rect x="{hl0:.1f}" y="0" width="{hl1 - hl0:.1f}" height="{H}" fill="#1d2326" opacity=".05"/>{band}'
             f'<polyline points="{cur}" fill="none" stroke="var(--ink3)" stroke-width="1.5" stroke-dasharray="4 2"/>{est}'
             f'<text class="ax" x="{W + 3}" y="{Y(1.5) + 3:.1f}">{lab("1.5", "axis label")}</text><text class="ax" x="{W + 3}" y="{Y(0.5) + 3:.1f}">{lab("0.5", "axis label")}</text>'
             f'{ticks}</svg>'
             f'<div class="legend"><span><i class="mk prog"></i>{lab("Current")}</span><span><i class="mk" style="width:12px;height:2px;border-radius:0;background:var(--ink)"></i>{lab("Estimate")}</span>'
             f'<span><i class="mk" style="width:12px;height:8px;border-radius:1px;background:var(--accent-soft)"></i>{lab("Range")}</span><span>{lab("U/h")}</span></div>')
    head = (f'<div class="qc-h"><span class="kicker">{v("Setting", EXS + "kind")}</span><span class="chev">⌃</span></div>'
            f'<div class="qc-t"><span class="qc-name">{v("Basal", EXS + "guidance.candidates[setting:basal_rate].title")} {v(span, EXS + "analyze.json basal slots 07:00, 07:30")}</span></div>')
    if desktop:
        return (f'<div class="hero dd"><div class="dd-h"><span class="kicker">{v("Setting", EXS + "kind")}</span>'
                f'<span class="ibtn" role="button" tabindex="0" aria-label="Snooze 14 days">{lab(SNOOZE_SVG, "UI icon button: snooze 14 d")}</span></div>'
                f'<div class="dd-t">{v("Basal", EXS + "guidance.candidates[setting:basal_rate].title")} {v(span, EXS + "analyze.json basal slots")}</div>'
                f'{table}<div style="margin-top:14px">{chart}</div></div>')
    return f'<div class="hero qc">{head}{table}<div style="margin-top:10px">{chart}</div></div>'

def queue_setting_body():
    return title("Queue", "") + '<div class="stack">' + setting_detail() + "".join(
        qcard(i, sj) for i, sj in enumerate(QUEUE_SUBJECTS, start=1)) + "</div>"

def dlist_setting():
    row = (f'<div class="drow sel" tabindex="0"><span class="rk">—</span><span><span class="qc-name">{v("Basal 07:00–08:00", EXS + "analyze.json basal slots")}</span>'
           f'<span class="kicker qk">{v("Setting", EXS + "kind")}</span></span>'
           f'<span class="qc-n">{v("1.037 → 1.164", EXS + "analyze.json basal[07:00].current → estimate.value")}</span></div>')
    return dlist(0).replace('<div class="dlist">', '<div class="dlist">' + row, 1)


GLOSSARY = [
    ("Carb ratio", "Grams of carbs one unit covers.", "frontend/glossary.js I:C"),
    ("Carb undercount", "Meal held more carbs than dosed.", "api/catalog.json levers[carb_undercount].meaning (shortened)"),
    ("Correction factor", "Glucose drop per unit of insulin.", "frontend/glossary.js ISF"),
    ("CV", "Coefficient of variation.", "CONTEXT.md glycemic metric; openspec outcomes spec"),
    ("False low", "A sub-70 reading that wasn't real.", "ciq_autotune/api.py false-low answer (#381)"),
    ("Focus", "A habit you pin by hand.", "CONTEXT.md Focus"),
    ("GMI", "A1c estimate from mean glucose.", "openspec outcomes spec (GMI, A1c-analog)"),
    ("Snooze", "Off the queue 14 d; back early if evidence changes.", "guidance.py preference_status return_reason + 14-day snooze addition"),
    ("High-carb sequences", "Largest eating sequences vs the rest.", "CONTEXT.md Sequence habit; catalog high_carb_sequence"),
    ("In range", "Readings at 70–180 mg/dL.", "openspec outcomes spec (TIR)"),
    ("Late bolus", "Dose landed after glucose rose.", "api/catalog.json levers[late_bolus].meaning (shortened)"),
    ("Maturing", "A Trial inside its 14-day window.", "CONTEXT.md Maturing"),
    ("Pattern", "An outcome counted on one denominator.", "CONTEXT.md Pattern"),
    ("Pin", "Follow a Pattern as a Focus.", "CONTEXT.md Focus (pins by hand)"),
    ("Range", "Where the true value likely falls.", "frontend/glossary.js CI"),
    ("Setting", "A pump value: basal, CF or carb ratio.", "CONTEXT.md tunable parameters"),
    ("Trial", "A setting change Harmonic watches.", "CONTEXT.md Trial"),
    ("Unclear", "The interval includes zero.", "follow_up_comparison assessment reason"),
    ("Wide", "A range too wide to be certain.", "frontend/glossary.js Wide CI"),
]
def glossary_screen():
    rows = "".join(f'<div class="g-row"><b>{lab(t, "glossary term: " + src)}</b><span>{lab(d, "glossary definition: " + src)}</span></div>'
                   for t, d, src in sorted(GLOSSARY, key=lambda x: x[0].lower()))
    return title("‹ Glossary", "") + f'<div class="glossary">{rows}</div>'

S = [
    phone("Queue", queue_body(1, eps=3), "Queue"),
    phone("Queue · card 2", queue_body(2, eps=3), "Queue"),
    phone("Queue · snoozed toast", queue_snoozed, "Queue", toast),
    phone("Queue · snoozed list (example)", hidden_screen, "Queue"),
    phone("Queue · setting (example)", queue_setting_body, "Queue"),
    phone("Changes (example)", changes_body, "Changes"),
    phone("Overview", lambda: title("Overview", f'<span class="kicker">{lab("To")} {v("30 Sep", "outcomes_14.span_end")}</span>')
          + f'<div class="seg"><span class="on">{lab("14 d")}</span><span>{lab("30 d")}</span><span>{lab("90 d")}</span></div>'
          + ov_hero() + mtable(False) + tod_head() + tod_strip(), "Overview"),
    phone("Day", day_view, "Day"),
    phone("Day · month", day_bg, "Day", month_sheet),
    phone("Day · prompt", lambda: prompt_one(PENDING[0]), "Day"),
    phone("Day · prompt · grams", lambda: prompt_one(PENDING[0], "yes"), None, ioskb),
    phone("Day · log carbs", day_bg, None, log_sheet),
    phone("Settings", settings_root, "Settings"),
    phone("Settings · Tandem Source", settings_tandem, "Settings"),
    phone("Settings · Pump profile", settings_pump, "Settings"),
    phone("Settings · glossary", glossary_screen, "Settings"),
]
def overview_wide():
    return [
        (lambda: title("Overview", f'<span class="kicker">{lab("To")} {v("30 Sep", "outcomes_14.span_end")}</span>')
         + f'<div class="seg" style="max-width:360px"><span class="on">{lab("14 d")}</span><span>{lab("30 d")}</span><span>{lab("90 d")}</span></div>'
         + ov_hero() + tod_head() + f'<div class="card">{tod_strip(legend=True)}</div>', "flex:0 0 46%"),
        (lambda: f'<div class="sect"><span>{lab("Metrics")}</span><span>{lab("14 / 30 / 90 d")}</span></div>'
         + f'<div class="card" style="padding:12px 18px">{mtable(True)}</div>', "flex:1"),
    ]

# ── desktop (pointer + keyboard; master–detail; no hover reveal, no swipe) ──
def dlist(sel=1, keys=True):
    rows = ""
    for i, subj in enumerate(QUEUE_SUBJECTS, start=1):
        c = cand[subj]; hc, _ = headline(c["pattern_key"])
        rows += (f'<div class="drow{" sel" if i == sel else ""}" tabindex="0">'
                 f'<span class="rk">{v(i, "derived: rank of admitted ∧ ¬set_aside guidance.candidates by −priority")}</span>'
                 f'<span><span class="qc-name">{v(c["title"], f"guidance.candidates[{subj}].title")}</span>'
                 f'<span class="kicker qk">{v(c["kind"].capitalize(), f"guidance.candidates[{subj}].kind")}</span></span>'
                 f'<span class="qc-n">{v(f"{hc["count"]} / {hc["denominator"]}", f"findings.outcome_patterns[key={c["pattern_key"]}].k / .n")}</span></div>')
    keys = keys and f'<span class="keys"><kbd>↑</kbd><kbd>↓</kbd> {lab("Select")} <kbd>{lab("Enter", "key label")}</kbd> {lab("Open")}</span>'
    return f'<div class="dlist">{rows}</div>' + (keys if keys else "")

def ddetail(rank=1, inert=False):
    subj = QUEUE_SUBJECTS[rank - 1]; c = cand[subj]
    wide = f'<span class="pill wait">{v("Wide", f"guidance.candidates[{subj}].support.wide = true")}</span>' if c["support"].get("wide") else ""
    return (f'<div class="hero dd"><div class="dd-h"><span class="kicker">{v(rank, "derived: rank")} · {v(c["kind"].capitalize(), f"guidance.candidates[{subj}].kind")}</span>{wide}'
            f'<span class="ibtn" role="button" tabindex="0" aria-label="Snooze 14 days">{lab(SNOOZE_SVG, "UI icon button: snooze 14 d (guidance preference until today + 14 d)")}</span></div>'
            f'<div class="dd-t">{v(c["title"], f"guidance.candidates[{subj}].title")}</div>'
            f'<div class="lines">{detail_lines(subj)}</div>'
            f'<div class="sect" style="margin-top:16px"><span>{lab("Episodes")}</span><span>{v(len([e for e in c["evidence"]]), f"len(guidance.candidates[{subj}].evidence)")}</span></div>'
            f'<div>{episode_rows(subj, 0, all_by_date=True)}</div>'
            f'<div class="dd-f"><div class="{"pin-inert" if inert else "primary"}">{lab("Pin", "UI action: POST /api/focus (pattern_key)")}</div></div></div>')

def dprompt(p, recorded=False):
    src = f"prompts.json[anchor_t={p['anchor_t']}]"
    head = (f'<div class="ph"><span style="color:var(--low)">▼</span> '
            f'{v("Low" if p["detector"] == "low" else "Missed meal", src + ".detector")} · '
            f'{v(f"{fmt_d(p["anchor_t"])} {fmt_t(p["anchor_t"])}", src + ".anchor_t")} · '
            f'<b style="color:var(--low)">{v(f"{p["key_bg"]:.0f}", src + ".key_bg")}</b> {lab("mg/dL")}</div>'
            f'<div style="margin:6px 0 4px">{spark(p, w=290, h=60)}</div>')
    if recorded:
        tail = (f'<div class="rec"><span>{lab("Carbs")}</span><span class="chipbtn on">{lab("Yes", "answer carbs, grams null, certainty unknown")}</span>'
                f'<span class="pill wait">{lab("Recorded")}</span></div>'
                f'<div class="kv" style="margin-top:6px"><span>{lab("Grams")}</span><span class="muted small">{lab("Optional")}</span></div>'
                f'<div class="gfield sm"><span class="ph0">{lab("0", "input placeholder; PATCH /api/carbs/{carb_entry_id} {grams, certainty: exact}")}</span><span class="u">{lab("g")}</span></div>')
    else:
        btns = [("Yes", "answer carbs, grams null"), ("No", "answer no"), ("False low", "answer false-low"), ("Not sure", "answer not-sure (desktop button; swipe on touch)")]
        tail = (f'<div class="sect" style="margin:2px 0 6px"><span>{lab("Carbs")}</span><span></span></div>'
                '<div class="chips four">' + "".join(f'<span class="chipbtn" tabindex="0">{lab(t, "POST /api/prompts/answer " + d)}</span>' for t, d in btns) + "</div>")
    return f'<div class="card pc" tabindex="0">{head}{tail}</div>'

def popover():
    return (f'<div class="popover"><div class="pop-h"><span class="kicker">{lab("Log carbs")}</span><span class="x">✕</span></div>'
            f'<div class="pop-r"><div class="gfield"><span class="ph0">{lab("0", "input placeholder")}</span><span class="u">{lab("g")}</span></div>'
            f'<span class="num small">{lab("Now", "UI default: t = now")} · {v("09:41", "UI default: device clock")} ›</span>'
            f'<div class="primary">{lab("Save", "POST /api/carbs {t, grams, certainty: exact, source: manual}")}</div></div></div>')

T = [
    tablet("13 · Tablet · Queue", "Queue", [
        (lambda: title("Queue", "") + dlist(1, keys=False) + hidden_footer(), "flex:0 0 380px"),
        (lambda: ddetail(1), "flex:1"),
    ]),
    tablet("14 · Tablet · Overview", "Overview", overview_wide()),
    tablet("Tablet · Day", "Day", [
        (lambda: title("Day", "") + f'<div class="mrow"><span class="ml">{v("September 2026", "day_navigator_2026-09.json month")}</span><span class="muted small">‹ ›</span></div>' + month_grid(big=True), "flex:0 0 470px"),
        (lambda: '<div class="dday">' + day_view(prompts=True, nav=False) + "</div>", "flex:1"),
    ]),
]
DESK = [
    desktop("15 · Desktop · Queue", "Queue", [
        (lambda: title("Queue", "") + dlist(1) + hidden_footer(), "flex:0 0 400px"),
        (lambda: ddetail(1), "flex:1"),
    ]),
    desktop("16 · Desktop · Overview", "Overview", overview_wide()),
    desktop("18 · Desktop · Queue · setting (example)", "Queue", [
        (lambda: title("Queue", "") + dlist_setting(), "flex:0 0 400px"),
        (lambda: setting_detail(desktop=True), "flex:1"),
    ]),
    desktop("Desktop · Day", "Day", [
        (lambda: title("Day", "") + f'<div class="mrow"><span class="ml">{v("September 2026", "day_navigator_2026-09.json month")}</span><span class="muted small">‹ ›</span></div>' + month_grid(big=True), "flex:0 0 470px"),
        (lambda: '<div class="dday">' + day_view(prompts=False, nav=False) + "</div>" + popover(), "flex:1;position:relative"),
        (lambda: f'<div class="sect"><span>{lab("Prompts")}</span><span>{v(f"1 / {len(PENDING)}", "derived: position / count prompts.json[] where answer = null")}</span></div>'
         + dprompt(PENDING[0]), "flex:0 0 360px"),
    ]),
]

HTML = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Harmonic Final Mockup</title>
<link rel="stylesheet" href="../../harness/harness.css"><script src="../../harness/harness.js"></script>
<style>{CSS}</style></head><body><div class="page"><h1>Harmonic · final</h1>
<div class="row">{"".join(S[:5])}</div><div class="row">{"".join(S[5:8])}</div><div class="row">{"".join(S[8:12])}</div><div class="row">{"".join(S[12:])}</div>
<div class="row">{T[0]}</div><div class="row">{T[1]}</div><div class="row">{T[2]}</div>
<div class="row">{DESK[0]}</div><div class="row">{DESK[1]}</div><div class="row">{DESK[2]}</div><div class="row">{DESK[3]}</div>
</div></body></html>'''
(HERE / "mockup.html").write_text(HTML)
seen, lines = set(), ["screen\tlabel\tvalue\tsource"]
for row in PROV:
    if row not in seen:
        seen.add(row); lines.append("\t".join(x.replace("\t", " ") for x in row))
(HERE / "provenance.tsv").write_text("\n".join(lines) + "\n")
print("ok", len(HTML), "provenance rows", len(lines) - 1, "queue", QUEUE_SUBJECTS)
