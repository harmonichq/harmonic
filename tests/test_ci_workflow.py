"""Regression guard for CI concurrency on pushes and pull requests."""

import unittest
from pathlib import Path


_REPO = Path(__file__).resolve().parent.parent


class CiWorkflowTest(unittest.TestCase):
    def test_only_pull_requests_cancel_superseded_runs(self):
        workflow = (_REPO / ".github" / "workflows" / "ci.yml").read_text()

        self.assertIn("  group: ci-${{ github.ref }}", workflow)
        cancel_declarations = [
            line
            for line in workflow.splitlines()
            if line.lstrip().startswith("cancel-in-progress:")
        ]
        self.assertEqual(
            cancel_declarations,
            ["  cancel-in-progress: ${{ github.event_name == 'pull_request' }}"],
        )

    def test_every_job_declares_a_timeout(self):
        workflow = (_REPO / ".github" / "workflows" / "ci.yml").read_text()
        lines = workflow.splitlines()

        jobs_index = lines.index("jobs:")
        job_starts = []  # (job_id, line_index)
        for i in range(jobs_index + 1, len(lines)):
            line = lines[i]
            if line and not line.startswith(" "):
                break
            if line.startswith("  ") and not line.startswith("   ") and line.endswith(":"):
                job_starts.append((line.strip()[:-1], i))

        self.assertTrue(job_starts, "no jobs discovered under 'jobs:' — parsing regression")

        missing = []
        for idx, (job_id, start) in enumerate(job_starts):
            end = job_starts[idx + 1][1] if idx + 1 < len(job_starts) else len(lines)
            block = lines[start:end]
            if not any(l.lstrip().startswith("timeout-minutes:") for l in block):
                missing.append(job_id)

        self.assertEqual(missing, [], f"job(s) missing timeout-minutes: {missing}")


if __name__ == "__main__":
    unittest.main()
