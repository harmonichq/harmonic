from __future__ import annotations
import importlib.util
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
GENERATOR = ROOT / "mockups/diagnose-evidence-canvas.exploration/generate.py"


def load_generator():
    spec = importlib.util.spec_from_file_location("evidence_canvas_generator", GENERATOR)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class EvidenceCanvasGeneratorTest(unittest.TestCase):
    def test_fixed_point_primitives_are_stable(self):
        generator = load_generator()
        for seed, count, scale in ((135, 240, 39), (420, 24, 66)):
            offsets = generator.synthetic_jitter_milli(seed, count, scale)
            self.assertEqual(len(offsets), count)
            self.assertTrue(all(isinstance(offset, int) for offset in offsets))
            self.assertGreater(len(set(offsets)), count // 2)
            self.assertTrue(any(a > b for a, b in zip(offsets, offsets[1:])))
            self.assertTrue(any(a < b for a, b in zip(offsets, offsets[1:])))
            pairs = list(zip(offsets, offsets[1:]))
            pair_count = len(pairs)
            correlation = (pair_count * sum(a * b for a, b in pairs)
                           - sum(a for a, _ in pairs) * sum(b for _, b in pairs))
            left = pair_count * sum(a * a for a, _ in pairs) - sum(a for a, _ in pairs) ** 2
            right = pair_count * sum(b * b for _, b in pairs) - sum(b for _, b in pairs) ** 2
            self.assertLess(4 * correlation ** 2, left * right,
                            "adjacent synthetic marks must not be strongly correlated")
        with self.assertRaises(ValueError):
            generator.synthetic_jitter_milli(0, 1, 1)
        self.assertEqual(generator.rounded_fraction(-5, 2), -3)
        self.assertEqual(generator.fit_milli([(0, 0), (10_000, 12_345)]), (12_345, 0))
        self.assertEqual(generator.fit_milli([(10_000, 100), (20_000, 101), (30_000, 105)]),
                         (3, 97))
        isf = generator.payload()["isf"]
        serialized = [point[1] for point in isf["pts"]]
        serialized.extend(night[1] for night in isf["nights"])
        serialized.extend((isf["slope"], isf["intercept"]))
        self.assertTrue(all(value == round(value, 3) for value in serialized))

    def test_generator_is_deterministic_and_check_detects_drift(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = pathlib.Path(tmp) / "index.html"
            first = subprocess.run([sys.executable, str(GENERATOR), "--out", str(out)], cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(first.returncode, 0, first.stderr)
            original = out.read_bytes()
            second = subprocess.run([sys.executable, str(GENERATOR), "--out", str(out)], cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertEqual(out.read_bytes(), original)
            self.assertEqual(
                original,
                (ROOT / "mockups/diagnose-evidence-canvas.exploration/index.html").read_bytes(),
                "the public generator output must match its committed artifact",
            )
            out.write_text(out.read_text() + "drift\n")
            check = subprocess.run([sys.executable, str(GENERATOR), "--check", "--out", str(out)], cwd=ROOT, capture_output=True, text=True)
            self.assertNotEqual(check.returncode, 0)
            self.assertIn("stale generated exploration", check.stdout)
