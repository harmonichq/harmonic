"""#459 fixture measurement (triage, 2026-09-24).

Composes the manufactured basal-lower and ic-lower recipes on a scratch store,
with the carb-ratio source span stretched to end on the basal lane's last day,
and prints which basal slots and carb-ratio blocks assert a move and which
whole-day queue rows they serve. Synthetic inputs only. Run from the repo root:

    uv run python docs/scope/459-compose-case.py
"""
import sys, tempfile, os
from datetime import date, timedelta
sys.path.insert(0, 'scripts'); sys.path.insert(0, '.')
import qa_e2e_cases as q
from ciq_autotune.store import Store
basal_last = date(2024, 5, 1) + timedelta(days=q.BASAL_SOURCE_SPAN_DAYS - 1)
span = (basal_last - date(2024, 3, 1)).days + 1
def recipe(store):
    q._materialize_basal_coverage(store, clean_rate=0.54)
    q._materialize_ic_coverage(store, measured_ratio=8.0, source_span_days=span)
d = tempfile.mkdtemp(dir=os.environ.get('TMPDIR'))
with Store.open(os.path.join(d, 'c.sqlite')) as store:
    recipe(store)
    ex = q.execute_case(store)
a = ex.analysis
print('basal asserting:', [(s['label'], s['current'], s['recommended']) for s in a['basal'] if s.get('asserts_move')])
print('ic asserting:', [(b['block_id'], b.get('current_values'), b['recommended'], b.get('member_start_mins')) for b in a['ic_blocks'] if b.get('asserts_move')])
rows = ex.findings['whole_day']['rows']
print('queue:', [(r.get('parameter'), r.get('register'), r.get('title')) for r in rows if r.get('parameter') in ('basal_rate','carb_ratio')])
