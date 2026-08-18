import os
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from ciq_autotune.cli import _load_env, main


class LoadEnvTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.env_path = Path(self.tmp.name) / ".env"
        self._saved = {k: os.environ.get(k) for k in
                       ("TIMEZONE_NAME", "CIQ_DB", "_LOAD_ENV_PRESET")}
        for k in self._saved:
            os.environ.pop(k, None)

    def tearDown(self):
        for k, v in self._saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        self.tmp.cleanup()

    def _write(self, text: str) -> str:
        self.env_path.write_text(text)
        return str(self.env_path)

    def test_populates_environ(self):
        path = self._write("TIMEZONE_NAME=America/Phoenix\nCIQ_DB=/tmp/x.db\n")
        _load_env(path)
        self.assertEqual(os.environ["TIMEZONE_NAME"], "America/Phoenix")
        self.assertEqual(os.environ["CIQ_DB"], "/tmp/x.db")

    def test_does_not_override_existing(self):
        os.environ["_LOAD_ENV_PRESET"] = "shell-wins"
        path = self._write("_LOAD_ENV_PRESET=file-loses\n")
        _load_env(path)
        self.assertEqual(os.environ["_LOAD_ENV_PRESET"], "shell-wins")

    def test_skips_comments_blanks_and_quotes(self):
        path = self._write('# comment\n\nTIMEZONE_NAME="Europe/London"\n')
        _load_env(path)
        self.assertEqual(os.environ["TIMEZONE_NAME"], "Europe/London")

    def test_missing_file_is_noop(self):
        _load_env(str(Path(self.tmp.name) / "nope.env"))
        self.assertIsNone(os.environ.get("TIMEZONE_NAME"))


class CliIdentityTest(unittest.TestCase):
    def test_help_names_harmonic_as_the_program(self):
        output = StringIO()
        with redirect_stdout(output), self.assertRaises(SystemExit) as exit_:
            main(["--help"])
        self.assertEqual(exit_.exception.code, 0)
        self.assertIn("usage: harmonic", output.getvalue())


if __name__ == "__main__":
    unittest.main()
