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


class _Opened(Exception):
    """Carries the path a subcommand tried to open, without touching a DB."""

    def __init__(self, path):
        super().__init__(path)
        self.path = path


def _raise_opened(path):
    raise _Opened(path)


class DbResolutionTest(unittest.TestCase):
    """#14: --db wins when typed, else HARMONIC_DB (then CIQ_DB), else the default."""

    def setUp(self):
        self._saved = {k: os.environ.get(k) for k in ("HARMONIC_DB", "CIQ_DB")}
        for k in self._saved:
            os.environ.pop(k, None)

    def tearDown(self):
        for k, v in self._saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def _opened_by(self, argv):
        from unittest.mock import patch

        with patch("ciq_autotune.cli.Store") as store:
            store.open.side_effect = _raise_opened
            with self.assertRaises(_Opened) as caught:
                main(argv)
        return caught.exception.path

    def test_analyze_honours_environment_variable(self):
        os.environ["HARMONIC_DB"] = "/somewhere/else/mine.db"
        self.assertEqual(self._opened_by(["analyze"]), "/somewhere/else/mine.db")

    def test_typed_flag_beats_environment_variable(self):
        os.environ["HARMONIC_DB"] = "/somewhere/else/mine.db"
        self.assertEqual(self._opened_by(["analyze", "--db", "/explicit/path.db"]),
                         "/explicit/path.db")

    def test_default_unchanged_when_nothing_set(self):
        self.assertEqual(self._opened_by(["analyze"]), "tconnect-data/ciq.db")

    def test_legacy_alias_still_works_and_loses_to_canonical(self):
        os.environ["CIQ_DB"] = "/legacy/spelling.db"
        with self.assertLogs("ciq_autotune.config", level="WARNING") as logs:
            self.assertEqual(self._opened_by(["backtest"]), "/legacy/spelling.db")
        self.assertTrue(any("deprecated" in line for line in logs.output))
        os.environ["HARMONIC_DB"] = "/canonical/wins.db"
        self.assertEqual(self._opened_by(["backtest"]), "/canonical/wins.db")

    def test_serve_passes_resolved_path_to_app_factory(self):
        from unittest.mock import MagicMock, patch

        os.environ["HARMONIC_DB"] = "/somewhere/else/mine.db"
        with patch("ciq_autotune.api.create_app") as create_app, \
             patch("uvicorn.run"), redirect_stdout(StringIO()) as banner:
            create_app.return_value = MagicMock()
            main(["serve", "--no-fetch"])
            _, kwargs = create_app.call_args
        self.assertEqual(kwargs.get("db_path"), "/somewhere/else/mine.db")
        self.assertIn("/somewhere/else/mine.db", banner.getvalue())


class CliIdentityTest(unittest.TestCase):
    def test_help_names_harmonic_as_the_program(self):
        output = StringIO()
        with redirect_stdout(output), self.assertRaises(SystemExit) as exit_:
            main(["--help"])
        self.assertEqual(exit_.exception.code, 0)
        self.assertIn("usage: harmonic", output.getvalue())


if __name__ == "__main__":
    unittest.main()
