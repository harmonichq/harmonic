from __future__ import annotations
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
GENERATOR = ROOT / "mockups/diagnose-evidence-canvas.exploration/generate.py"

class EvidenceCanvasGeneratorTest(unittest.TestCase):
    def test_generator_is_deterministic_and_check_detects_drift(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = pathlib.Path(tmp) / "index.html"
            first = subprocess.run([sys.executable, str(GENERATOR), "--out", str(out)], cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(first.returncode, 0, first.stderr)
            original = out.read_bytes()
            second = subprocess.run([sys.executable, str(GENERATOR), "--out", str(out)], cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertEqual(out.read_bytes(), original)
            out.write_text(out.read_text() + "drift\n")
            check = subprocess.run([sys.executable, str(GENERATOR), "--check", "--out", str(out)], cwd=ROOT, capture_output=True, text=True)
            self.assertNotEqual(check.returncode, 0)
            self.assertIn("stale generated exploration", check.stdout)
