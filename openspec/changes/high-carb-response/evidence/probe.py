"""Read-only synthetic first-hour spike and deterministic plan facts for #410."""
from pathlib import Path
from datetime import datetime
import json
import sys

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))
from scripts.gen_eating_sequence_fixtures import products
from ciq_autotune.event_comparison import project_cohort
from ciq_autotune.analyzers.eating_sequence_config import EatingSequenceConfig

paths = [
 'ciq_autotune/explore_exposures.py', 'ciq_autotune/finding_case_file.py',
 'ciq_autotune/findings_projection.py', 'ciq_autotune/event_comparison.py',
 'ciq_autotune/analyzers/eating_sequences.py', 'ciq_autotune/false_low.py',
 'tests/test_finding_case_file.py', 'tests/test_findings_projection.py',
 'tests/test_eating_sequence_fixture.py', 'tests/test_eating_sequence_findings.py',
 'tests/test_explore_exposures.py', 'tests/test_event_comparison.py',
 'tests/eating_sequence_streams.py',
 'frontend/diagnose-eating-sequences.js', 'frontend/diagnose-eating-sequences.test.js',
 'frontend/diagnose-evidence-charts.js', 'frontend/diagnose-evidence-charts.test.js',
 'frontend/diagnose-event-comparison.js', 'frontend/diagnose-event-comparison.test.js',
 'frontend/diagnose-workstation.js', 'frontend/diagnose-workstation.css',
 'frontend/finding-case-file-validation.js', 'frontend/finding-case-file-validation.test.js',
 'frontend/diagnose-workstation-behavior.replay.mjs',
 'frontend/diagnose-canvas-composition.browser.test.mjs',
 'frontend/diagnose-event-comparison-behavior.replay.mjs',
 'frontend/diagnose-behavior-ledger-parity.test.js',
 'frontend-v2/desk.browser.test.mjs',
 'scripts/gen_eating_sequence_fixtures.py',
 'frontend/__fixtures__/eating-sequence-report.json',
 'mockups/eating-sequence-findings.synthetic/payload.json',
 'mockups/finding-evidence-routing.behavior.md', 'mockups/INDEX.md',
 'mockups/sweep/harmonic-v2-desktop/acceptance.py',
 'DESIGN.md', 'AGENTS.md', '.github/workflows/ci.yml',
]
print('Source and verification paths')
for path in paths:
 print(('exists ' if (ROOT / path).is_file() else 'MISSING ') + path)
print('\nExisting definitions')
print(json.dumps(EatingSequenceConfig().__dict__, sort_keys=True))
p, (_, cgm, _, _) = products('high_carb_sequence', covered=True)
records = p._exposures['sequence_evidence']['high_carb_sequence']['population']
print('\nSynthetic first-hour spike')
print('population_fields=' + ','.join(sorted(records[0])))
print('periods=' + ','.join(sorted({r['period'] for r in records})))
for candidate, key in [(True, 'matched'), (False, 'comparison')]:
 traces=[]
 for record in records:
  if record['candidate'] != candidate:
   continue
  anchor=datetime.fromisoformat(record['sequence_end'])
  lo,hi=map(datetime.fromisoformat,(record['start'],record['end']))
  observations=[{'minute':(r.t-anchor).total_seconds()/60,'bg':r.bg}
                for r in cgm if lo <= r.t < hi]
  traces.append({'id':record['id'],'trace':{'cgm':observations}})
 response=project_cohort(key,traces,(0,235))
 print(json.dumps({'cohort':key,'routed':response['routed_count'],
  'usable':response['usable_count'],'points':len(response['points']),
  'finite_medians':sum(x['median'] is not None for x in response['points']),
  'last_bin':response['points'][-1]}, sort_keys=True))
print('\nDocument references to the current chart')
for relative in ['DESIGN.md','CONTEXT.md','openspec/specs/surfaces/spec.md',
                 'openspec/specs/eating-sequences/spec.md','mockups/INDEX.md']:
 for number,line in enumerate((ROOT/relative).read_text().splitlines(),1):
  if any(term in line.lower() for term in ['eating-sequence', 'high-carb', 'quintile']):
   print(f'{relative}:{number}: {line}')

print('\nFull v2 ledger command inventory (planned; not executed during triage)')
import re
workflow = (ROOT / '.github/workflows/ci.yml').read_text()
shards = json.loads(re.search(r"REPLAY_SHARDS: '([^']+)'", workflow).group(1))['full']
viewports = re.search(r'viewport: \[([^]]+)\]', workflow).group(1).split(', ')
assert shards == ['1/4', '2/4', '3/4', '4/4']
assert viewports == ['1280x720', '1440x900']
print('Prerequisites: npm ci && npm run build; uv sync --frozen --extra api')
print('Browser environment: eval "$(python3 scripts/ensure_browser_gate_env.py)"')
print('Output root: replay_root=$(mktemp -d /tmp/harmonic-410-final.XXXXXX)')
print('Run the following eight commands serially, without --base:')
for viewport in viewports:
 for shard in shards:
  print('uv run python mockups/sweep/harmonic-v2-desktop/acceptance.py replay'
        f' --viewport {viewport} --shard {shard}'
        f' --out "$replay_root/{viewport}-{shard.replace("/", "-of-")}"')
print('Each --out is a fresh directory outside the checkout. Preserve its logs and selection.json.')
print('Every shard must report executed = selected, failed = 0, deferred = 0;')
print('the union of the four selections must equal the full registry at each viewport.')
