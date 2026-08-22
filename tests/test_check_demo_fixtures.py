"""Tests for scripts/check_demo_fixtures.py (#716).

Drives the check through its public interface (`check_set`/`main`) against a
tiny fake generator and a temporary "committed" directory the test controls —
never the real slow generators, except for one end-to-end smoke test against
the actual unmodified tree.
"""

import importlib.util
import pathlib
import subprocess
import sys
import tempfile
import unittest

_REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
_SCRIPT = _REPO_ROOT / "scripts" / "check_demo_fixtures.py"

_spec = importlib.util.spec_from_file_location("check_demo_fixtures", _SCRIPT)
check_demo_fixtures = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(check_demo_fixtures)


def _write_fake_generator(path: pathlib.Path, files: dict, exit_code: int = 0,
                           stderr: str = "") -> None:
    """A tiny stdlib-only generator: writes `files` (name -> text) into argv[1]."""
    body = [
        "import os, sys",
        "outdir = sys.argv[1]",
        "os.makedirs(outdir, exist_ok=True)",
    ]
    for name, content in files.items():
        body.append(
            f"open(os.path.join(outdir, {name!r}), 'w').write({content!r})"
        )
    if stderr:
        body.append(f"sys.stderr.write({stderr!r})")
    body.append(f"raise SystemExit({exit_code})")
    path.write_text("\n".join(body) + "\n")


def _entry(name, generator_path, committed_dir):
    def cmd_fn(outdir):
        return [sys.executable, str(generator_path), str(outdir)]

    return {
        "name": name,
        "cmd_fn": cmd_fn,
        "committed_dir": str(committed_dir),
        "regen_cmd": f"python3 {generator_path} <outdir>",
    }


class CheckSetTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp_path = pathlib.Path(self._tmp.name)
        self.repo_root = self.tmp_path / "repo"
        self.repo_root.mkdir()

    def _committed_dir(self, name="demo.synthetic"):
        d = self.repo_root / "mockups" / name
        d.mkdir(parents=True)
        return d

    def test_matching_set_passes(self):
        committed = self._committed_dir()
        (committed / "a.json").write_text('{"x": 1}\n')
        gen = self.repo_root / "gen.py"
        _write_fake_generator(gen, {"a.json": '{"x": 1}\n'})
        entry = _entry("demo", gen, "mockups/demo.synthetic")

        ok, message = check_demo_fixtures.check_set(entry, repo_root=self.repo_root)

        self.assertTrue(ok, message)
        self.assertIn("current", message)

    def test_altered_value_fails_and_names_file(self):
        committed = self._committed_dir()
        (committed / "a.json").write_text('{"x": 1}\n')
        gen = self.repo_root / "gen.py"
        _write_fake_generator(gen, {"a.json": '{"x": 2}\n'})
        entry = _entry("demo", gen, "mockups/demo.synthetic")

        ok, message = check_demo_fixtures.check_set(entry, repo_root=self.repo_root)

        self.assertFalse(ok)
        self.assertIn("a.json", message)
        self.assertIn("1", message)
        self.assertIn("2", message)

    def test_indentation_only_change_still_fails_but_reports_formatting(self):
        committed = self._committed_dir()
        (committed / "a.json").write_text('{"x": 1, "y": 2}\n')
        gen = self.repo_root / "gen.py"
        _write_fake_generator(gen, {"a.json": '{\n  "x": 1,\n  "y": 2\n}\n'})
        entry = _entry("demo", gen, "mockups/demo.synthetic")

        ok, message = check_demo_fixtures.check_set(entry, repo_root=self.repo_root)

        self.assertFalse(ok)
        self.assertIn("a.json", message)
        self.assertIn("formatting", message.lower())
        self.assertIn("first differing byte offset: 1", message)
        self.assertIn("committed   : b'{\"x\": 1, \"y\": 2}\\n'", message)
        self.assertIn("regenerated : b'{\\n  \"x\": 1,\\n  \"y\": 2\\n}\\n'", message)

    def test_generator_nonzero_exit_fails_and_surfaces_output(self):
        committed = self._committed_dir()
        (committed / "a.json").write_text('{"x": 1}\n')
        gen = self.repo_root / "gen.py"
        _write_fake_generator(gen, {}, exit_code=1, stderr="boom: something broke\n")
        entry = _entry("demo", gen, "mockups/demo.synthetic")

        ok, message = check_demo_fixtures.check_set(entry, repo_root=self.repo_root)

        self.assertFalse(ok)
        self.assertIn("exited 1", message)
        self.assertIn("boom: something broke", message)
        self.assertNotIn("no differences", message.lower())

    def test_generator_producing_no_files_never_reads_as_no_differences(self):
        committed = self._committed_dir()
        (committed / "a.json").write_text('{"x": 1}\n')
        gen = self.repo_root / "gen.py"
        _write_fake_generator(gen, {})  # writes nothing, exits 0
        entry = _entry("demo", gen, "mockups/demo.synthetic")

        ok, message = check_demo_fixtures.check_set(entry, repo_root=self.repo_root)

        self.assertFalse(ok)
        # A zero-file run must never be reported as a passing/clean result.
        self.assertNotIn("current", message.lower())

    def test_missing_committed_file_fails(self):
        committed = self._committed_dir()
        (committed / "a.json").write_text('{"x": 1}\n')
        (committed / "b.json").write_text('{"y": 1}\n')
        gen = self.repo_root / "gen.py"
        _write_fake_generator(gen, {"a.json": '{"x": 1}\n'})  # missing b.json
        entry = _entry("demo", gen, "mockups/demo.synthetic")

        ok, message = check_demo_fixtures.check_set(entry, repo_root=self.repo_root)

        self.assertFalse(ok)
        self.assertIn("b.json", message)
        self.assertIn("missing", message.lower())

    def test_extra_generated_file_fails(self):
        committed = self._committed_dir()
        (committed / "a.json").write_text('{"x": 1}\n')
        gen = self.repo_root / "gen.py"
        _write_fake_generator(gen, {"a.json": '{"x": 1}\n', "b.json": '{"y": 1}\n'})
        entry = _entry("demo", gen, "mockups/demo.synthetic")

        ok, message = check_demo_fixtures.check_set(entry, repo_root=self.repo_root)

        self.assertFalse(ok)
        self.assertIn("b.json", message)
        self.assertIn("extra", message.lower())

    def test_exact_file_owned_by_an_independent_generator_is_excluded(self):
        committed = self._committed_dir()
        (committed / "a.json").write_text('{"x": 1}\n')
        (committed / "independent.json").write_text('{"owned": "elsewhere"}\n')
        gen = self.repo_root / "gen.py"
        _write_fake_generator(gen, {"a.json": '{"x": 1}\n'})
        entry = _entry("demo", gen, "mockups/demo.synthetic")
        entry["externally_generated"] = ["independent.json"]

        ok, message = check_demo_fixtures.check_set(entry, repo_root=self.repo_root)

        self.assertTrue(ok, message)


class MainTest(unittest.TestCase):
    def test_main_returns_nonzero_when_any_entry_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = pathlib.Path(tmp)
            committed = repo_root / "mockups" / "demo.synthetic"
            committed.mkdir(parents=True)
            (committed / "a.json").write_text('{"x": 1}\n')
            gen = repo_root / "gen.py"
            _write_fake_generator(gen, {"a.json": '{"x": 2}\n'})
            entry = _entry("demo", gen, "mockups/demo.synthetic")

            code = check_demo_fixtures.main(entries=[entry], repo_root=repo_root)

        self.assertEqual(code, 1)

    def test_main_returns_zero_when_all_entries_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = pathlib.Path(tmp)
            committed = repo_root / "mockups" / "demo.synthetic"
            committed.mkdir(parents=True)
            (committed / "a.json").write_text('{"x": 1}\n')
            gen = repo_root / "gen.py"
            _write_fake_generator(gen, {"a.json": '{"x": 1}\n'})
            entry = _entry("demo", gen, "mockups/demo.synthetic")

            code = check_demo_fixtures.main(entries=[entry], repo_root=repo_root)

        self.assertEqual(code, 0)


class RealEndToEndTest(unittest.TestCase):
    """Runs the REAL check against the real committed tree (slow: real generators)."""

    def test_real_check_passes_on_unmodified_tree(self):
        result = subprocess.run(
            [sys.executable, str(_SCRIPT)],
            cwd=str(_REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=120,
        )
        self.assertEqual(
            result.returncode, 0,
            f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}",
        )
        self.assertIn("verify-660-story", result.stdout)
        self.assertIn("diagnose-workstation", result.stdout)


if __name__ == "__main__":
    unittest.main()
