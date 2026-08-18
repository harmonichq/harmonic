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


if __name__ == "__main__":
    unittest.main()
