"""Execute the workflow's real public-report publisher against disposable files.

Only synthetic report contents are used. This tests the artifact boundary and
honest failure/skip summaries without credentials, Docker, YAML dependencies or
an alternative copy of the publisher implementation.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import textwrap
import unittest

REPOSITORY = Path(__file__).resolve().parents[2]
WORKFLOW = REPOSITORY / ".github/workflows/ci.yml"
PUBLIC_FILES = {
    ".local/coverage/frontend-unit/coverage-summary.json": "frontend-unit-summary.json",
    ".local/coverage/frontend-unit/source-manifest.json": "frontend-unit-source-manifest.json",
    ".local/coverage/browser/cases/use-cases.json": "use-cases.json",
    ".local/coverage/browser/cases/README.md": "coverage.md",
    ".local/coverage/browser/code/measurement.json": "measurement.json",
    ".local/coverage/browser/code/unit/coverage-summary.json": "validated-unit-summary.json",
    ".local/coverage/browser/code/combined/coverage-summary.json": "combined-summary.json",
}
PENDING_IDS = (
    "UC-ACC-0032", "UC-ACC-0033", "UC-ACC-0034", "UC-ACC-0058",
    "UC-MCP-0075", "UC-MCP-0085", "UC-MCP-0111", "UC-NTF-0065",
    "UC-NTF-0066", "UC-SYS-0028", "UC-SYS-0030", "UC-SYS-0031", "UC-SYS-0032",
)
PRIVATE_SENTINEL = "PRIVATE_CI_FIXTURE_SENTINEL_NEVER_PUBLISH_13d7c9"


def publisher_source() -> str:
    """Extract exactly the embedded Python shell heredoc, not a YAML imitation."""
    lines = WORKFLOW.read_text().splitlines(keepends=True)
    starts = [index for index, line in enumerate(lines) if line.strip() == "python3 - <<'PYREPORT'"]
    if len(starts) != 1:
        raise AssertionError("Expected exactly one real PYREPORT publisher in the workflow.")
    start = starts[0] + 1
    ends = [index for index in range(start, len(lines)) if lines[index].strip() == "PYREPORT"]
    if not ends:
        raise AssertionError("The real report publisher heredoc has no terminator.")
    source = textwrap.dedent("".join(lines[start:ends[0]]))
    compile(source, str(WORKFLOW) + ":PYREPORT", "exec")
    return source


class CiPublicReportsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="gategold-public-report-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.output = self.root / ".local/coverage/ci-public-coverage"
        self.run = self.root / ".local/browser-tests/owned-disposable-run"
        self.index = self.root / ".local/coverage/browser-run.json"
        self.step_summary = self.root / "github-step-summary.md"
        self.write("docs/use-cases/catalog.json", {"cases": [
            *({"id": case_id, "implementation": "external_pending" if index % 2 else "unclear"}
              for index, case_id in enumerate(reversed(PENDING_IDS))),
            {"id": "UC-LOCAL-0001", "implementation": "implemented"},
            {"id": "UC-LOCAL-0002", "implementation": "service_only"},
            {"id": "UC-LOCAL-0003", "implementation": "not_implemented"},
        ]})
        self.public_contents: dict[str, bytes] = {}
        for source, name in PUBLIC_FILES.items():
            value = "Public coverage explanation.\n" if name == "coverage.md" else {"publicReport": name}
            if name == "use-cases.json":
                value = {"sourceCoverage": {"valid": True, "lines": {"covered": 7, "total": 10}}}
            self.write(source, value)
            self.public_contents[name] = (self.root / source).read_bytes()
        # Include plausible neighbors and private run data; none is an allowed
        # artifact just because it sits alongside a public report.
        for path in [
            ".local/coverage/frontend-unit/coverage-final.json",
            ".local/coverage/browser/code/combined/coverage-final.json",
            ".local/coverage/browser/code/private-measurement.log",
            ".local/browser-tests/owned-disposable-run/identity/accounts.json",
            ".local/browser-tests/owned-disposable-run/identity/tokens/owner.token",
            ".local/browser-tests/owned-disposable-run/server.log",
            ".local/browser-tests/owned-disposable-run/js-coverage/precise-v8.json",
            ".local/browser-tests/owned-disposable-run/go-coverage/covcounters.private",
            ".local/browser-tests/owned-disposable-run/pictures/object.data",
            ".local/browser-tests/owned-disposable-run/results/trace.zip",
            ".local/browser-tests/owned-disposable-run/results/error-context.md",
        ]:
            self.write(path, PRIVATE_SENTINEL)

    def write(self, path: str, value: object) -> None:
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(value if isinstance(value, str) else json.dumps(value))

    def run_fixture(self, status: str = "passed", *, skips: bool = False) -> dict:
        tests = [
            {"testId": "plugin", "file": "e2e/antigravity-plugin.spec.ts"},
            {"testId": "native", "file": "e2e/coverage-native-boundaries.spec.ts"},
            {"testId": "ordinary", "file": "e2e/ordinary.spec.ts"},
            {"testId": "business", "file": "e2e/business.spec.ts"},
        ]
        attempts = [{"testId": test["testId"], "status": "skipped" if skips and index < 3 else status}
                    for index, test in enumerate(tests)]
        report = {"suiteStatus": status, "execution": {"selectedTests": tests, "attempts": attempts}}
        self.write(".local/browser-tests/owned-disposable-run/use-case-results.json", report)
        self.write(".local/browser-tests/owned-disposable-run/source/source-manifest.json", {"applicationSha256": "public-application-sha"})
        self.write(".local/coverage/browser-run.json", {"runDirectory": str(self.run), "status": status})
        return report

    def publish(self, *, strict: str | None = "1", native: str | None = "0") -> dict:
        environment = dict(os.environ)
        for name in ["GATEGOLD_STRICT_FULL_COVERAGE", "GATEGOLD_NATIVE_SDK_AVAILABLE"]:
            environment.pop(name, None)
        environment.update(MEASUREMENT="coverage", GATEGOLD_BROWSER_RUN_INDEX=str(self.index), GITHUB_STEP_SUMMARY=str(self.step_summary))
        if strict is not None:
            environment["GATEGOLD_STRICT_FULL_COVERAGE"] = strict
        if native is not None:
            environment["GATEGOLD_NATIVE_SDK_AVAILABLE"] = native
        completed = subprocess.run([sys.executable, "-c", publisher_source()], cwd=self.root,
                                   env=environment, capture_output=True, text=True, timeout=15)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        return json.loads((self.output / "ci-summary.json").read_text())

    def assert_no_private_artifacts(self) -> None:
        for path in self.output.rglob("*"):
            self.assertFalse(path.is_symlink(), str(path))
            if path.is_file():
                self.assertNotIn(PRIVATE_SENTINEL.encode(), path.read_bytes(), str(path))
        self.assertNotIn(PRIVATE_SENTINEL, self.step_summary.read_text())

    def test_exact_safe_allowlist_preserves_public_bytes_and_writes_an_append_only_summary(self) -> None:
        raw = self.run_fixture()
        self.step_summary.write_text("Earlier job summary stays intact.\n")
        summary = self.publish()
        self.assertEqual({path.name for path in self.output.iterdir()}, {
            *PUBLIC_FILES.values(), "browser-use-case-results.json", "browser-source-manifest.json", "ci-summary.json",
        })
        for name, contents in self.public_contents.items():
            self.assertEqual((self.output / name).read_bytes(), contents)
        self.assertEqual(json.loads((self.output / "browser-use-case-results.json").read_text()), raw)
        self.assertEqual(json.loads((self.output / "browser-source-manifest.json").read_text()), {"applicationSha256": "public-application-sha"})
        self.assertEqual(summary["sourceCoverage"], {"valid": True, "lines": {"covered": 7, "total": 10}})
        self.assertTrue(self.step_summary.read_text().startswith("Earlier job summary stays intact.\n"))
        self.assertIn("## GateGoldJira coverage acceptance", self.step_summary.read_text())
        self.assertIn("does not claim it has been reached", self.step_summary.read_text())
        self.assert_no_private_artifacts()

    def test_failed_suite_retains_exact_pending_ids_skips_and_strict_request_without_claiming_success(self) -> None:
        self.run_fixture("failed", skips=True)
        summary = self.publish(strict="1", native="0")
        self.assertEqual(summary["suiteStatus"], "failed")
        self.assertEqual(summary["pendingExternalOrUnclear"], sorted(PENDING_IDS))
        self.assertEqual(len(summary["pendingExternalOrUnclear"]), 13)
        self.assertEqual((summary["selectedTests"], summary["actualAttempts"]), (4, 4))
        self.assertEqual((summary["skippedTests"], summary["skippedNativeAcceptance"]), (3, 2))
        self.assertTrue(summary["strict100Requested"])
        self.assertFalse(summary["nativeSdkAvailable"])
        self.assertFalse(summary["full100Claimed"])
        markdown = self.step_summary.read_text()
        self.assertIn("Suite: `failed`", markdown)
        self.assertIn("skipped native SDK acceptance: 2", markdown)
        self.assertIn("Strict100 gate requested: True", markdown)
        for case_id in PENDING_IDS:
            self.assertIn(case_id, markdown)
        self.assert_no_private_artifacts()

    def test_missing_run_index_is_not_run_with_zero_attempts_and_no_fabricated_run_artifacts(self) -> None:
        summary = self.publish()
        self.assertEqual(summary["suiteStatus"], "not_run")
        self.assertEqual((summary["selectedTests"], summary["actualAttempts"], summary["skippedTests"]), (0, 0, 0))
        self.assertFalse(summary["full100Claimed"])
        self.assertEqual({path.name for path in self.output.iterdir()}, {*PUBLIC_FILES.values(), "ci-summary.json"})
        self.assertIn("Suite: `not_run`; selected: 0; actual attempts: 0", self.step_summary.read_text())
        self.assert_no_private_artifacts()

    def test_failed_run_index_without_a_report_does_not_turn_into_a_pass(self) -> None:
        self.write(".local/coverage/browser-run.json", {"runDirectory": str(self.run), "status": "failed"})
        summary = self.publish()
        self.assertEqual(summary["suiteStatus"], "not_run")
        self.assertEqual(summary["actualAttempts"], 0)
        self.assertFalse(summary["full100Claimed"])
        self.assertFalse((self.output / "browser-use-case-results.json").exists())
        self.assert_no_private_artifacts()

    def test_outside_run_directory_cannot_publish_private_neighbors(self) -> None:
        outside = self.root / "private-unowned-run"
        self.write("private-unowned-run/use-case-results.json", {"suiteStatus": "passed", "private": PRIVATE_SENTINEL})
        self.write("private-unowned-run/source/source-manifest.json", {"private": PRIVATE_SENTINEL})
        self.write(".local/coverage/browser-run.json", {"runDirectory": str(outside), "status": "passed"})
        summary = self.publish()
        self.assertEqual(summary["suiteStatus"], "not_run")
        self.assertEqual(summary["actualAttempts"], 0)
        self.assertFalse((self.output / "browser-use-case-results.json").exists())
        self.assert_no_private_artifacts()

    def test_allowlisted_source_symlink_is_not_uploaded(self) -> None:
        source = self.root / ".local/coverage/frontend-unit/coverage-summary.json"
        private = self.root / "private-summary.json"
        private.write_text(PRIVATE_SENTINEL)
        source.unlink()
        source.symlink_to(private)
        self.publish()
        self.assertFalse((self.output / "frontend-unit-summary.json").exists())
        self.assert_no_private_artifacts()

    def test_missing_optional_measurements_remain_missing_while_run_and_summary_are_retained(self) -> None:
        self.run_fixture("failed")
        for source in PUBLIC_FILES:
            (self.root / source).unlink()
        summary = self.publish()
        self.assertEqual(summary["sourceCoverage"], {})
        self.assertEqual(summary["suiteStatus"], "failed")
        self.assertEqual({path.name for path in self.output.iterdir()}, {
            "browser-use-case-results.json", "browser-source-manifest.json", "ci-summary.json",
        })
        self.assert_no_private_artifacts()

    def test_passing_suite_and_available_native_sdk_do_not_imply_an_unrequested_full_coverage_gate(self) -> None:
        self.run_fixture()
        summary = self.publish(strict=None, native="1")
        self.assertEqual(summary["suiteStatus"], "passed")
        self.assertTrue(summary["nativeSdkAvailable"])
        self.assertFalse(summary["strict100Requested"])
        self.assertFalse(summary["full100Claimed"])
        self.assertEqual((summary["skippedTests"], summary["skippedNativeAcceptance"]), (0, 0))
        self.assertEqual(summary["pendingExternalOrUnclear"], sorted(PENDING_IDS))
        self.assert_no_private_artifacts()


if __name__ == "__main__":
    unittest.main()
