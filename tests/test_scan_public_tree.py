"""Tests for the public-tree contamination scan (#728, cutover plan §3.1).

The scan is the one mechanical check standing between a private health record
and a public repository, so these exercise it through its public interface —
``scan_file`` over real bytes and ``scan_tree`` over a real directory — rather
than asserting on internals. Every rule, every accepted stamp, the stamp set's
closure, the span boundary, the fail-closed path, and the pin refusal.
"""
import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import scan_public_tree as scan  # noqa: E402

CONFIG = scan.parse_config("span-start 2025-07-01\n")
# The same span, plus one path cleared to carry rule 2's `authorized` +
# `synthetic` stamp. Everything else in the tree carrying those two keys is
# scanned as if they were not there.
AUTHORIZED_CONFIG = scan.parse_config(
    "span-start 2025-07-01\n"
    "authorized-synthetic f.json | a seeded-PRNG fixture, byte-compared in CI\n"
)


def rules_of(findings):
    return sorted(finding.rule for finding in findings)


def sample(*fragments):
    """Join fragments into one sample string.

    Rule 5's samples are assembled here rather than written as literals so
    this suite does not itself trip the scan it tests. The gate has to be able
    to scan its own test file with no exemption: an exempt path is a hole in
    the one mechanical check standing between a health record and a public
    repository, and the gate's own tests are the last place that hole belongs.
    """
    return "".join(fragments)


def scan_text(name, text, config=CONFIG):
    """Findings a run would actually report — pin-suppressed ones excluded,
    the way scan_tree partitions them."""
    findings, stamp = scan.scan_file(name, text.encode("utf-8"), config)
    return [f for f in findings if not f.suppressed_by], stamp


class Rule1StructuralTest(unittest.TestCase):
    """A sensitive numeric field co-occurring with an in-span timestamp."""

    def test_json_numeric_field_with_in_span_date_is_flagged(self):
        payload = json.dumps({"readings": [{"t": "2026-06-29T08:00:00", "bg": 125.0}]})
        findings, _ = scan_text("daily.json", payload)
        self.assertIn("rule1-structural", rules_of(findings))
        self.assertIn("bg=125.0", findings[0].detail)

    def test_the_field_is_found_at_any_nesting_depth(self):
        payload = json.dumps(
            {"a": {"b": [{"c": {"worst_bg": 68.0}}]}, "when": "2026-06-26"}
        )
        findings, _ = scan_text("nested.json", payload)
        self.assertIn("rule1-structural", rules_of(findings))

    def test_a_non_numeric_sensitive_field_does_not_fire(self):
        payload = json.dumps({"bg": "unknown", "when": "2026-06-26"})
        findings, _ = scan_text("prose.json", payload)
        self.assertNotIn("rule1-structural", rules_of(findings))

    def test_yaml_and_csv_are_parsed_too(self):
        yaml_findings, _ = scan_text("f.yml", "window:\n  start: 2026-06-26\n  isf: 28.9\n")
        self.assertIn("rule1-structural", rules_of(yaml_findings))

        csv_findings, _ = scan_text("f.csv", "when,bg\n2026-06-26,125\n")
        self.assertIn("rule1-structural", rules_of(csv_findings))

    def test_an_out_of_span_date_passes_silently(self):
        """Invented fixtures use old dates; that is the intended behaviour."""
        payload = json.dumps({"readings": [{"t": "2020-01-05", "bg": 125.0}]})
        findings, _ = scan_text("invented.json", payload)
        self.assertEqual([], rules_of(findings))


class Rule2StampTest(unittest.TestCase):
    """The four accepted stamps exempt; anything outside the closed set does not."""

    def contaminated(self, extra):
        document = {"readings": [{"t": "2026-06-29", "bg": 125.0}]}
        document.update(extra)
        return json.dumps(document)

    def test_generated_by_and_note_exempts(self):
        findings, stamp = scan_text(
            "f.json", self.contaminated({"_generated_by": "gen.py", "_note": "why"})
        )
        self.assertEqual("_generated_by + _note", stamp)
        self.assertEqual([], rules_of(findings))

    def test_source_beginning_manufactured_fixture_exempts(self):
        findings, stamp = scan_text(
            "f.json", self.contaminated({"_source": "MANUFACTURED FIXTURE — not real"})
        )
        self.assertEqual("_source: MANUFACTURED FIXTURE", stamp)
        self.assertEqual([], rules_of(findings))

    def test_fixture_labeled_synthetic_exempts(self):
        findings, stamp = scan_text(
            "f.json", self.contaminated({"fixture": "labeled-synthetic"})
        )
        self.assertEqual('fixture: "labeled-synthetic"', stamp)
        self.assertEqual([], rules_of(findings))

    def test_authorized_and_synthetic_exempts_an_enumerated_path(self):
        findings, stamp = scan_text(
            "f.json", self.contaminated({"authorized": "operator", "synthetic": True}),
            config=AUTHORIZED_CONFIG,
        )
        self.assertEqual("authorized + synthetic", stamp)
        self.assertEqual([], rules_of(findings))

    def test_authorized_and_synthetic_exempts_nothing_unenumerated(self):
        """The whole point of the path gate: this stamp asserts that a human
        cleared the file, and its value is free text nobody validates. On
        presence alone, any new file could exempt itself from rule 1 — the rule
        that caught all three contaminated fixtures — by typing two keys."""
        document = self.contaminated({"authorized": "operator", "synthetic": True})
        findings, stamp = scan_text("newcomer.json", document, config=AUTHORIZED_CONFIG)
        self.assertIsNone(stamp)
        self.assertIn("rule1-structural", rules_of(findings))

    def test_the_gate_is_the_path_not_the_authorized_text(self):
        """An enumerated path is cleared whatever its `authorized` value says,
        and an unenumerated one is not, however convincing its value."""
        for value in ("operator, 2026-08-10, behaviour ledger Q2", "", "trust me"):
            with self.subTest(authorized=value):
                document = self.contaminated({"authorized": value, "synthetic": True})
                _, cleared = scan_text("f.json", document, config=AUTHORIZED_CONFIG)
                _, uncleared = scan_text("g.json", document, config=AUTHORIZED_CONFIG)
                self.assertEqual("authorized + synthetic", cleared)
                self.assertIsNone(uncleared)

    def test_a_stamp_outside_the_closed_set_does_not_exempt(self):
        """The plan named a `SYNTHETIC` convention none of the four sets uses."""
        for unaccepted in (
            {"SYNTHETIC": True},
            {"_generated_by": "gen.py"},  # without _note
            {"_source": "synthetic, honest"},  # wrong prefix
            {"fixture": "synthetic"},  # wrong literal
            {"synthetic": True},  # without authorized
            # with both keys, but at a path the config does not enumerate
            {"authorized": "operator", "synthetic": True},
        ):
            with self.subTest(stamp=unaccepted):
                findings, stamp = scan_text("f.json", self.contaminated(unaccepted))
                self.assertIsNone(stamp)
                self.assertIn("rule1-structural", rules_of(findings))


class Rule3DateCountTest(unittest.TestCase):
    """>= 8 distinct in-span dates, subordinate to the stamp."""

    def dated(self, count, year=2026, stamp=""):
        dates = "\n".join(f"# {year}-06-{day:02d}" for day in range(1, count + 1))
        return stamp + dates

    def test_eight_distinct_in_span_dates_is_flagged(self):
        findings, _ = scan_text("notes.py", self.dated(8))
        self.assertIn("rule3-date-count", rules_of(findings))

    def test_seven_is_not(self):
        findings, _ = scan_text("notes.py", self.dated(7))
        self.assertEqual([], rules_of(findings))

    def test_the_rule_applies_whatever_the_extension(self):
        findings, _ = scan_text("notes.lock", self.dated(12))
        self.assertIn("rule3-date-count", rules_of(findings))

    def test_a_stamped_file_skips_the_date_rule(self):
        payload = json.dumps({
            "_generated_by": "gen.py",
            "_note": "why",
            "days": [f"2026-06-{day:02d}" for day in range(1, 13)],
        })
        findings, stamp = scan_text("f.json", payload)
        self.assertIsNotNone(stamp)
        self.assertEqual([], rules_of(findings))

    def test_out_of_span_dates_do_not_count(self):
        findings, _ = scan_text("notes.py", self.dated(20, year=2024))
        self.assertEqual([], rules_of(findings))


class SpanBoundaryTest(unittest.TestCase):
    """In span is `date >= 2025-07-01`, open-ended, evaluated at scan time."""

    def test_the_first_in_span_day_counts(self):
        payload = json.dumps({"t": "2025-07-01", "bg": 125.0})
        findings, _ = scan_text("f.json", payload)
        self.assertIn("rule1-structural", rules_of(findings))

    def test_the_day_before_does_not(self):
        payload = json.dumps({"t": "2025-06-30", "bg": 125.0})
        findings, _ = scan_text("f.json", payload)
        self.assertEqual([], rules_of(findings))

    def test_the_range_is_open_ended(self):
        """No upper bound: the data accrues daily, so a fixed end goes stale."""
        payload = json.dumps({"t": "2099-01-01", "bg": 125.0})
        findings, _ = scan_text("f.json", payload)
        self.assertIn("rule1-structural", rules_of(findings))


class Rule4TimestampSeriesTest(unittest.TestCase):
    """A timestamp series is a data carrier in any extension."""

    def series(self, count, start=0):
        return ",".join(
            f"{(start + i * 5) // 60:02d}:{(start + i * 5) % 60:02d}:{120 + i}"
            for i in range(count)
        )

    def test_twenty_monotonic_timestamps_paired_with_numerics_is_flagged(self):
        findings, _ = scan_text("engine.py", f'_CGM = "{self.series(20)}"')
        self.assertIn("rule4-timestamp-series", rules_of(findings))

    def test_nineteen_is_not(self):
        findings, _ = scan_text("engine.py", f'_CGM = "{self.series(19)}"')
        self.assertEqual([], rules_of(findings))

    def test_the_rule_reaches_a_python_string_literal_with_no_date_or_field_name(self):
        """The artefact the other four rules all pass (plan §3.1 [R7])."""
        text = f'# a test\n_JUL1_CGM = (\n    "{self.series(60)}"\n)\n'
        findings, _ = scan_text("test_scenario_engine.py", text)
        self.assertEqual(["rule4-timestamp-series"], rules_of(findings))

    def test_runs_restart_so_two_short_arcs_do_not_add_up(self):
        text = f'A = "{self.series(15)}"\nB = "{self.series(15)}"\n'
        findings, _ = scan_text("arcs.py", text)
        self.assertEqual([], rules_of(findings))

    def test_a_stamped_file_skips_it(self):
        payload = json.dumps({
            "authorized": "operator", "synthetic": True, "cgm": self.series(60),
        })
        findings, _ = scan_text("f.json", payload, config=AUTHORIZED_CONFIG)
        self.assertEqual([], rules_of(findings))


class SyntheticFixtureMarkerTest(unittest.TestCase):
    """Rule 2's stamp is a top-level JSON key, so it can never reach a source
    file. This is rule 4's source-file equivalent (#728 Task 3): a comment
    reading ``# SYNTHETIC-FIXTURE: <reason>`` directly above one assignment
    exempts *that assignment only* from rule 4 — never a whole file, never
    rules 1, 3 or 5, and never without a reason."""

    def series(self, count, start=0):
        return ",".join(
            f"{(start + i * 5) // 60:02d}:{(start + i * 5) % 60:02d}:{120 + i}"
            for i in range(count)
        )

    def test_a_marker_with_a_reason_exempts_its_assignment(self):
        text = (
            "# SYNTHETIC-FIXTURE: invented; preserves a rebound shape\n"
            f'_ARC = "{self.series(20)}"\n'
        )
        findings, _ = scan_text("engine.py", text)
        self.assertEqual([], rules_of(findings))

    def test_a_bare_marker_with_no_reason_does_not_exempt(self):
        """An unexplained exemption is how a real leak ships — same principle
        as a config pin with an empty reason."""
        text = (
            "# SYNTHETIC-FIXTURE:\n"
            f'_ARC = "{self.series(20)}"\n'
        )
        findings, _ = scan_text("engine.py", text)
        self.assertIn("rule4-timestamp-series", rules_of(findings))

    def test_a_marker_not_directly_above_the_assignment_does_not_exempt(self):
        text = (
            "# SYNTHETIC-FIXTURE: a real reason\n"
            "# a stray comment sits between the marker and the assignment\n"
            f'_ARC = "{self.series(20)}"\n'
        )
        findings, _ = scan_text("engine.py", text)
        self.assertIn("rule4-timestamp-series", rules_of(findings))

    def test_the_exemption_is_scoped_to_the_marked_assignment_only(self):
        """Marking one constant must never exempt its neighbour — the mechanism
        is per-assignment, not per-file. The second series repeats the first
        (rather than continuing its clock forward) so the two stay separate
        monotonic runs instead of merging into one long carrier."""
        text = (
            "# SYNTHETIC-FIXTURE: invented; preserves a rebound shape\n"
            f'_MARKED = "{self.series(20)}"\n'
            f'_UNMARKED = "{self.series(20)}"\n'
        )
        findings, _ = scan_text("engine.py", text)
        self.assertEqual(["rule4-timestamp-series"], rules_of(findings))
        self.assertEqual(3, findings[0].line)  # the unmarked one, not the marked one

    def test_the_marker_never_reaches_rule_5_prose(self):
        text = (
            "# SYNTHETIC-FIXTURE: invented; preserves a rebound shape\n"
            f'_ARC = "{self.series(20)}"\n'
            + sample("# the owner took 5.0 ", "U here\n")
        )
        findings, _ = scan_text("engine.py", text)
        # rule4 is suppressed by the marker; the unrelated rule5 hit still fires.
        self.assertEqual(["rule5-dose-ratio"], rules_of(findings))

    def test_the_marker_never_reaches_rule_3_date_count(self):
        dates = "\n".join(f"# 2026-06-{day:02d}" for day in range(1, 9))
        text = (
            dates + "\n"
            "# SYNTHETIC-FIXTURE: invented; preserves a rebound shape\n"
            f'_ARC = "{self.series(20)}"\n'
        )
        findings, _ = scan_text("engine.py", text)
        # rule4 is suppressed by the marker; the unrelated rule3 hit still fires.
        self.assertEqual(["rule3-date-count"], rules_of(findings))

    def test_the_marker_never_reaches_rule_1_structural(self):
        text = (
            "# SYNTHETIC-FIXTURE: invented; preserves a rebound shape\n"
            f'_ARC = "{self.series(20)}"\n'
            "bg: 125\n"
            "when: 2026-06-29\n"
        )
        findings, _ = scan_text("readings.yaml", text)
        # rule4 is suppressed by the marker; the unrelated rule1 hit still fires.
        self.assertEqual(["rule1-structural"], rules_of(findings))

    def test_an_unmarked_series_still_fires(self):
        """The baseline the marker is an exception to."""
        text = f'_ARC = "{self.series(20)}"\n'
        findings, _ = scan_text("engine.py", text)
        self.assertEqual(["rule4-timestamp-series"], rules_of(findings))


class Rule5ProseTest(unittest.TestCase):
    def test_a_dose_claim_in_prose_is_flagged(self):
        findings, _ = scan_text("start-here.md", sample("a 9.0 ", "U bolus at 18:40, BG hitting 64"))
        self.assertIn("rule5-dose-ratio", rules_of(findings))

    def test_a_ratio_claim_is_flagged(self):
        findings, _ = scan_text("d.md", sample("correction strength 1 ", "U : 36 mg/dL"))
        self.assertIn("rule5-dose-ratio", rules_of(findings))

    def test_a_dose_in_a_code_expression_is_copy_illustration_not_a_claim(self):
        findings, _ = scan_text("t.py", "bolus(insulin=5.0)  # arbitrary\n")
        self.assertEqual([], rules_of(findings))

    def test_but_the_same_dose_in_a_comment_is_flagged(self):
        findings, _ = scan_text("t.py", sample("# the owner took 5.0 ", "U here\n"))
        self.assertIn("rule5-dose-ratio", rules_of(findings))

    def test_a_dated_health_event_is_flagged(self):
        findings, _ = scan_text("c.py", sample("# Jun ", "30 the nadir was 64 after a suspend\n"))
        self.assertIn("rule5-dated-health-event", rules_of(findings))

    def test_a_date_with_no_clinical_term_is_not(self):
        findings, _ = scan_text("c.py", sample("# Jun ", "30 the release shipped\n"))
        self.assertEqual([], rules_of(findings))

    def test_a_hardcoded_credential_is_flagged(self):
        findings, _ = scan_text("c.py", sample('password = "s3cr', 't-value"\n'))
        self.assertIn("rule5-credential", rules_of(findings))

    def test_reading_a_password_from_storage_is_not_a_credential_leak(self):
        findings, _ = scan_text("c.py", "password = _fernet(key).decrypt(row[2])\n")
        self.assertEqual([], rules_of(findings))

    def test_an_absolute_path_carrying_a_username_is_flagged(self):
        findings, _ = scan_text("s.py", sample('"/Users', '/someone/Code/thing"\n'))
        self.assertIn("rule5-user-path", rules_of(findings))

    def test_the_owner_name_and_sanction_idioms_are_flagged(self):
        for text in (sample("# Con", "nor's real candy sizes"),
                     sample("# sanctioned ", "by the owner"),
                     sample("# the operator ", "ruled otherwise"),
                     # The possessive form slipped past the older pattern by a
                     # single word, which is how an attribution to a private
                     # review round shipped in a source docstring.
                     sample("# the operator", "'s round-2 coverage finding"),
                     sample("# the operator", "'s call, recorded elsewhere")):
            with self.subTest(text=text):
                findings, _ = scan_text("f.js", text)
                self.assertIn("rule5-owner-name", rules_of(findings))

    def test_the_reader_facing_second_person_is_not_an_attribution(self):
        """The app's own copy calls whoever is reading a surface "the operator".
        That is an ordinary second person, not a citation of a private ruling,
        and widening the idiom must not start flagging it."""
        findings, _ = scan_text(
            "f.js", sample("// a coincidence the operator ", "can follow\n")
        )
        self.assertEqual([], rules_of(findings))


class FailClosedTest(unittest.TestCase):
    """A file the scan cannot read is a FAILURE, never a skip."""

    def test_unparseable_json_is_a_failure(self):
        findings, _ = scan_text("broken.json", "{not json,")
        self.assertEqual(["FAILURE"], rules_of(findings))

    def test_undecodable_bytes_are_a_failure(self):
        findings, _ = scan.scan_file("blob.json", b"\xff\xfe\x00bad", CONFIG)
        self.assertEqual(["FAILURE"], rules_of(findings))

    def test_an_unreadable_file_in_the_tree_is_a_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "dangling.md").symlink_to(root / "absent.md")
            result = scan.scan_tree(root, CONFIG)
        self.assertEqual(["FAILURE"], rules_of(result.findings))


class PinTest(unittest.TestCase):
    def config_with_pin(self, path, reason="invented round test dates"):
        return scan.parse_config(f"span-start 2025-07-01\n{path} | {reason}\n")

    def test_a_pin_suppresses_the_date_rule(self):
        text = "\n".join(f"# 2026-06-{day:02d}" for day in range(1, 13))
        findings, _ = scan_text("uv.lock", text, self.config_with_pin("uv.lock"))
        self.assertEqual([], rules_of(findings))

    def test_a_suppressed_finding_is_kept_with_its_reason(self):
        """The scan reports what each pin hides rather than leaving a reviewer
        to infer it, and a pin that hid nothing is reported as unused."""
        text = "\n".join(f"# 2026-06-{day:02d}" for day in range(1, 13))
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "uv.lock").write_text(text)
            (root / "quiet.md").write_text("nothing here")
            config = scan.parse_config(
                "span-start 2025-07-01\nuv.lock | upload stamps\nquiet.md | stale\n"
            )
            result = scan.scan_tree(root, config)
        self.assertEqual([], rules_of(result.findings))
        self.assertEqual(["rule3-date-count"], rules_of(result.suppressed))
        self.assertEqual("upload stamps", result.suppressed[0].suppressed_by)
        self.assertEqual(["quiet.md"], result.unused_pins)

    def test_a_pin_naming_an_absent_path_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = scan.parse_config("span-start 2025-07-01\ngone.md | ruled out\n")
            result = scan.scan_tree(Path(tmp), config)
        self.assertEqual(["gone.md"], result.missing_pins)

    def test_a_pin_does_not_reach_the_structural_field_rule(self):
        """Pinning is reserved for the date rule (plan §0.5.5.3), which is why
        the pinned analysis.json is still flagged as contaminated."""
        payload = json.dumps({"t": "2026-06-29", "bg": 125.0})
        config = self.config_with_pin("frontend/__fixtures__/analysis.json")
        findings, _ = scan_text("frontend/__fixtures__/analysis.json", payload, config)
        self.assertIn("rule1-structural", rules_of(findings))

    def test_a_pin_is_refused_on_a_prose_finding(self):
        config = self.config_with_pin("tests/test_store.py")
        findings, _ = scan_text(
            "tests/test_store.py", sample("# the owner took 6.06 ", "U\n"), config
        )
        self.assertEqual(["rule5-dose-ratio"], rules_of(findings))
        self.assertTrue(findings[0].pin_refused)
        self.assertIn("PIN REFUSED", findings[0].render())

    def test_a_pin_without_a_reason_is_a_config_error(self):
        with self.assertRaises(scan.ConfigError):
            scan.parse_config("span-start 2025-07-01\nuv.lock\n")
        with self.assertRaises(scan.ConfigError):
            scan.parse_config("span-start 2025-07-01\nuv.lock | \n")

    def test_a_config_without_a_span_is_an_error(self):
        with self.assertRaises(scan.ConfigError):
            scan.parse_config("uv.lock | a reason\n")

    def test_a_pin_is_an_exact_path_not_a_glob(self):
        with self.assertRaises(scan.ConfigError):
            scan.parse_config("span-start 2025-07-01\ntests/** | a reason\n")

    def test_the_prose_exemption_is_scoped_to_one_named_check(self):
        config = scan.parse_config(
            "span-start 2025-07-01\n"
            "prose-exempt pyproject.toml owner-name | deliberate authorship\n"
        )
        findings, _ = scan_text(
            "pyproject.toml",
            sample('authors = [{ name = "Con', 'nor Griffin" }]\n',
                   'password = "s3cr', 't-value"\n'),
            config,
        )
        self.assertEqual(["rule5-credential"], rules_of(findings))

    def test_an_unknown_prose_check_is_a_config_error(self):
        with self.assertRaises(scan.ConfigError):
            scan.parse_config(
                "span-start 2025-07-01\nprose-exempt a.toml nonsense | why\n"
            )

    def test_an_authorized_synthetic_clearance_needs_a_reason(self):
        with self.assertRaises(scan.ConfigError):
            scan.parse_config("span-start 2025-07-01\nauthorized-synthetic a.json\n")

    def test_an_authorized_synthetic_clearance_is_an_exact_path(self):
        with self.assertRaises(scan.ConfigError):
            scan.parse_config(
                "span-start 2025-07-01\nauthorized-synthetic a/*.json | why\n"
            )

    def test_a_duplicate_authorized_synthetic_clearance_is_a_config_error(self):
        with self.assertRaises(scan.ConfigError):
            scan.parse_config(
                "span-start 2025-07-01\n"
                "authorized-synthetic a.json | first\n"
                "authorized-synthetic a.json | second\n"
            )


class ShippedConfigTest(unittest.TestCase):
    """The committed config parses and carries the plan's ruled values."""

    def test_it_parses_and_pins_carry_reasons(self):
        config = scan.load_config()
        self.assertEqual("2025-07-01", config.span_start)
        self.assertTrue(all(reason for reason in config.pins.values()))
        self.assertIn("uv.lock", config.pins)
        self.assertIn(
            ("pyproject.toml", "owner-name"), config.prose_exempt,
        )

    def test_every_authorized_synthetic_clearance_is_named_and_reasoned(self):
        """The stamp that says "a human cleared this" is honoured only where the
        config says so, one path at a time. If this list ever grows, somebody
        read the new file and wrote down why."""
        config = scan.load_config()
        self.assertTrue(all(reason for reason in config.authorized_synthetic.values()))
        self.assertEqual(
            sorted(config.authorized_synthetic),
            sorted(
                f"mockups/diagnose-workstation.synthetic/{name}.capture.json"
                for name in (
                    "explore-day", "explore-exposures", "ic-blocks",
                    "ic-blocks-asserting", "settings-audit",
                )
            ),
        )


class DoseRatioBaselineTest(unittest.TestCase):
    """The acknowledged dose-ratio set, keyed on content rather than count.

    The rule cannot reach zero — a dosing application's prose says "U" — so the
    set is acknowledged and the scan fails on any CHANGE to it. Every other
    rule still hard-fails on a single finding.
    """

    # Assembled, like every rule-5 sample here, so this suite does not alter
    # the very baseline it tests when the scan runs over the public tree.
    DOSE = sample("0.5 ", "U")
    OTHER_DOSE = sample("9.0 ", "U")

    def build(self, tmp, files, acknowledged=None):
        root = Path(tmp) / "tree"
        root.mkdir()
        for name, text in files.items():
            (root / name).write_text(text)

        lines = ["span-start 2025-07-01", scan._BASELINE_BEGIN]
        if acknowledged is not None:
            entries = [scan.normalised_entry(*e) for e in acknowledged]
            lines.append(f"dose-ratio-baseline {len(entries)} {scan.digest_of(entries)}")
            lines += [f"dose-ratio-ack {p}:{n} | {x}" for p, n, x in acknowledged]
        lines.append(scan._BASELINE_END)

        config = Path(tmp) / "config.txt"
        config.write_text("\n".join(lines) + "\n")
        return root, config

    def run_scan(self, root, config, *extra):
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            code = scan.main([str(root), "--config", str(config), *extra])
        return code, buffer.getvalue()

    def test_an_unchanged_set_matches_and_the_scan_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, config = self.build(
                tmp, {"a.md": f"dose {self.DOSE}\n"}, [("a.md", 1, self.DOSE)],
            )
            code, out = self.run_scan(root, config)
        self.assertEqual(0, code)
        self.assertIn("match the acknowledged baseline", out)

    def test_an_added_finding_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, config = self.build(
                tmp,
                {"a.md": f"dose {self.DOSE}\n", "b.md": f"dose {self.DOSE}\n"},
                [("a.md", 1, self.DOSE)],
            )
            code, out = self.run_scan(root, config)
        self.assertEqual(1, code)
        self.assertIn("has CHANGED", out)
        self.assertIn(f"+ b.md:1", out)

    def test_a_removed_finding_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, config = self.build(
                tmp,
                {"a.md": f"dose {self.DOSE}\n"},
                [("a.md", 1, self.DOSE), ("gone.md", 4, self.DOSE)],
            )
            code, out = self.run_scan(root, config)
        self.assertEqual(1, code)
        self.assertIn("- gone.md:4", out)

    def test_a_one_for_one_swap_fails_even_though_the_count_is_identical(self):
        """The case a bare count would wave through, and the way a real value
        would slip in behind an acknowledged number."""
        with tempfile.TemporaryDirectory() as tmp:
            root, config = self.build(
                tmp, {"a.md": f"dose {self.OTHER_DOSE}\n"}, [("a.md", 1, self.DOSE)],
            )
            code, out = self.run_scan(root, config)
        self.assertEqual(1, code)
        self.assertIn("(1 added, 1 removed)", out)

    def test_the_delta_names_both_sides(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, config = self.build(
                tmp, {"a.md": f"dose {self.OTHER_DOSE}\n"}, [("b.md", 7, self.DOSE)],
            )
            _code, out = self.run_scan(root, config)
        self.assertIn(f"+ a.md:1\t{self.OTHER_DOSE}", out)
        self.assertIn(f"- b.md:7\t{self.DOSE}", out)

    def test_the_other_rules_hard_fail_independently_of_the_baseline(self):
        dates = "\n".join(f"# 2026-06-{day:02d}" for day in range(1, 13))
        with tempfile.TemporaryDirectory() as tmp:
            root, config = self.build(
                tmp,
                {"a.md": f"dose {self.DOSE}\n", "dated.py": dates},
                [("a.md", 1, self.DOSE)],
            )
            code, out = self.run_scan(root, config)
        self.assertEqual(1, code)
        self.assertIn("rule3-date-count", out)
        self.assertIn("match the acknowledged baseline", out)

    def test_with_no_baseline_recorded_a_dose_finding_hard_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, config = self.build(tmp, {"a.md": f"dose {self.DOSE}\n"})
            code, _out = self.run_scan(root, config)
        self.assertEqual(1, code)

    def test_the_baseline_is_recorded_only_on_explicit_invocation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, config = self.build(
                tmp,
                {"a.md": f"dose {self.DOSE}\n", "b.md": f"dose {self.DOSE}\n"},
                [("a.md", 1, self.DOSE)],
            )
            before = config.read_text()
            code, _out = self.run_scan(root, config)
            self.assertEqual(1, code)
            self.assertEqual(before, config.read_text(), "a normal run must not rewrite")

            code, out = self.run_scan(root, config, "--accept-dose-ratio-baseline")
            self.assertEqual(0, code)
            self.assertIn("+ b.md:1", out, "accepting must print the delta first")
            self.assertNotEqual(before, config.read_text())

            # And the re-recorded set now passes a normal run.
            self.assertEqual(0, self.run_scan(root, config)[0])

    def test_a_hand_edited_baseline_fails_the_config_closed(self):
        """The digest is what makes editing the generated block detectable."""
        with tempfile.TemporaryDirectory() as tmp:
            _root, config = self.build(
                tmp, {"a.md": f"dose {self.DOSE}\n"}, [("a.md", 1, self.DOSE)],
            )
            config.write_text(config.read_text().replace(self.DOSE, self.OTHER_DOSE))
            with self.assertRaises(scan.ConfigError):
                scan.load_config(config)

    def test_a_pure_line_shift_passes(self):
        """The case the digest deliberately ignores: identical content, moved.

        Keying on line numbers would fail this, and a gate that fires on
        ordinary edits is one whose operator re-accepts without reading.
        """
        with tempfile.TemporaryDirectory() as tmp:
            root, config = self.build(
                tmp,
                {"a.md": f"a new line above\ndose {self.DOSE}\n"},
                [("a.md", 1, self.DOSE)],
            )
            code, out = self.run_scan(root, config)
        self.assertEqual(0, code)
        self.assertIn("match the acknowledged baseline", out)

    def test_a_second_hit_matching_an_acknowledged_one_in_the_same_file_fails(self):
        """The multiset's load-bearing case: a leak whose text happens to match
        an acknowledged generic in the same file still moves the count."""
        with tempfile.TemporaryDirectory() as tmp:
            root, config = self.build(
                tmp,
                {"a.md": f"dose {self.DOSE}\ndose {self.DOSE}\n"},
                [("a.md", 1, self.DOSE)],
            )
            code, out = self.run_scan(root, config)
        self.assertEqual(1, code)
        self.assertIn("(1 added, 0 removed)", out)

    def test_the_digest_counts_duplicates_rather_than_collapsing_them(self):
        one = [scan.normalised_entry("a.md", 1, self.DOSE)]
        two = one + [scan.normalised_entry("a.md", 9, self.DOSE)]
        self.assertNotEqual(scan.digest_of(one), scan.digest_of(two))

    def test_the_digest_ignores_the_line_number(self):
        here = [scan.normalised_entry("a.md", 1, self.DOSE)]
        moved = [scan.normalised_entry("a.md", 400, self.DOSE)]
        self.assertEqual(scan.digest_of(here), scan.digest_of(moved))

    def test_a_swap_changes_the_digest(self):
        first = [scan.normalised_entry("a.md", 1, self.DOSE)]
        second = [scan.normalised_entry("a.md", 1, self.OTHER_DOSE)]
        self.assertEqual(len(first), len(second))
        self.assertNotEqual(scan.digest_of(first), scan.digest_of(second))


class ShippedBaselineTest(unittest.TestCase):
    def test_the_committed_baseline_parses_and_matches_its_digest(self):
        config = scan.load_config()
        self.assertIsNotNone(config.dose_baseline)
        count, digest = config.dose_baseline
        self.assertEqual(count, len(config.dose_ack))
        self.assertEqual(digest, scan.digest_of(config.dose_ack))


if __name__ == "__main__":
    unittest.main()
