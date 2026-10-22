"""Release-disk retention, exercised against disposable files; no Azure, host app or SQL."""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from argparse import Namespace
from pathlib import Path
from unittest.mock import patch

import test_deploy_banking as fixtures

deploy = fixtures.deploy
ROOT = Path(__file__).parents[2]
LIVE = "a" * 40
CANDIDATE = "b" * 40


def rollback(digit):
    return f"before-{str(digit) * 40}.zip"


class PrunePlanTests(unittest.TestCase):
    def listing(self, *rows):
        return "".join(f"{mtime} {kind} {name}\n" for mtime, kind, name in rows)

    def test_plan_removes_only_staging_dirs_and_surplus_rollback_zips(self):
        rows = [(1000 + i, "f", rollback(i)) for i in range(1, 9)]
        rows += [
            (1, "f", f"before-{LIVE}.zip"), (2, "f", f"before-{CANDIDATE}.zip"), (3, "f", "before-full-20260916.zip"),
            (5, "d", LIVE), (6, "d", f"restore-{CANDIDATE}"), (7, "f", f"{'c' * 40}.zip"),
            (8, "d", ".schema-preflight"), (9, "d", "wwwroot-copy"), (10, "l", "d" * 40),
            (11, "l", rollback("e")), (12, "f", "before-x y.zip"), (13, "f", f"{'f' * 40}.zip.sha256-{'0' * 64}.backup"),
            ("not-a-time", "f", rollback("9")),
        ]
        plan = deploy.plan_release_prune(self.listing(*rows), LIVE, CANDIDATE)
        self.assertEqual(plan, sorted([LIVE, f"restore-{CANDIDATE}", rollback(1), rollback(2), rollback(3),
                                       "before-full-20260916.zip"]))

    def test_unknown_live_build_only_clears_regenerable_staging(self):
        rows = [(1000 + i, "f", rollback(i)) for i in range(1, 9)] + [(5, "d", LIVE)]
        self.assertEqual(deploy.plan_release_prune(self.listing(*rows), None, CANDIDATE), [LIVE])

    def test_plan_is_bounded(self):
        rows = [(i, "d", f"{i:040x}") for i in range(1, 300)]
        self.assertEqual(len(deploy.plan_release_prune(self.listing(*rows), LIVE, CANDIDATE)), deploy.MAX_PRUNE_ENTRIES)

    def test_command_and_workflow_wiring(self):
        argv = ["deploy-banking.py", "prune-release-storage", "--source-sha", CANDIDATE, "--evidence-dir", "evidence"]
        with patch.object(sys, "argv", argv):
            self.assertEqual(deploy.parse_args().command, "prune-release-storage")
        workflow = (ROOT / ".github/workflows/publish-banking.yml").read_text()
        deploy_job, diagnostic_job = workflow.split("\n  deploy:\n", 1)[1].split("\n  schema-diagnostic:\n", 1)
        self.assertLess(deploy_job.index("deploy-banking.py prune-release-storage"),
                        deploy_job.index("deploy-banking.py capture"))
        self.assertNotIn("prune-release-storage", diagnostic_job)


class PruneReleaseStorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="banking-prune-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.home = self.root / "home"
        self.releases = self.home / "Banking/releases"
        self.releases.mkdir(parents=True)
        self.wwwroot = self.home / "site/wwwroot"
        self.wwwroot.mkdir(parents=True)
        (self.wwwroot / "Banking.Api.dll").write_bytes(b"live")
        self.evidence = self.root / "evidence"
        self.outside = self.root / "outside"
        self.outside.mkdir()
        (self.outside / "keep.txt").write_text("keep")
        self.args = Namespace(source_sha=CANDIDATE, evidence_dir=str(self.evidence))

    def make(self, name, age, directory=False):
        path = self.releases / name
        if directory:
            path.mkdir()
            (path / "Banking.Api.dll").write_bytes(b"staged")
        else:
            path.write_bytes(b"zip")
        os.utime(path, (age, age))
        return path

    def run_remote(self, token, command):
        self.assertEqual(token, "synthetic-token")
        result = subprocess.run(["bash", "-c", command.replace("/home/", f"{self.home}/")],
                                capture_output=True, timeout=20)
        if result.returncode:
            raise deploy.ReleaseError("Synthetic SCM command failed; output suppressed.")
        return result.stdout.decode()

    def prune(self, minimum_free=0):
        with patch.object(deploy, "verify_azure_context"), \
             patch.object(deploy, "read_hosted_baseline", return_value=({}, {"build": "git-" + LIVE}, {})), \
             patch.object(deploy, "access_token", return_value="synthetic-token"), \
             patch.object(deploy, "remote_command", side_effect=self.run_remote), \
             patch.object(deploy, "MIN_FREE_STORAGE_KIB", minimum_free):
            return deploy.prune_release_storage(self.args)

    def seed(self):
        for number in range(1, 9):
            self.make(rollback(number), 1000 + number)
        self.make(f"before-{LIVE}.zip", 1)
        self.make("before-full-20260916.zip", 3)
        self.make(f"{LIVE}.zip", 4)
        self.make(f"{CANDIDATE}.zip", 5)
        self.make(LIVE, 6, directory=True)
        self.make(f"restore-{CANDIDATE}", 7, directory=True)
        self.make(".schema-preflight", 8, directory=True)
        (self.releases / ("d" * 40)).symlink_to(self.outside)

    def test_prune_deletes_only_authorised_leftovers_and_records_evidence(self):
        self.seed()
        result = self.prune()
        gone = [LIVE, f"restore-{CANDIDATE}", rollback(1), rollback(2), rollback(3), "before-full-20260916.zip"]
        self.assertEqual(result["removed"], sorted(gone))
        kept = [rollback(number) for number in range(4, 9)] + [
            f"before-{LIVE}.zip", f"{LIVE}.zip", f"{CANDIDATE}.zip", ".schema-preflight", "d" * 40]
        for name in gone:
            self.assertFalse((self.releases / name).exists(), name)
        for name in kept:
            self.assertTrue((self.releases / name).is_symlink() or (self.releases / name).exists(), name)
        self.assertEqual((self.outside / "keep.txt").read_text(), "keep")
        self.assertEqual((self.wwwroot / "Banking.Api.dll").read_bytes(), b"live")
        recorded = json.loads((self.evidence / "prune-result.json").read_text())
        self.assertEqual(recorded["removedCount"], 6)
        for name in ("storage-before-prune.json", "storage-after-prune.json"):
            self.assertTrue((self.evidence / name).exists(), name)

    def test_prune_fails_closed_when_disk_is_still_nearly_full(self):
        self.seed()
        for report in ({"available": True, "diskFreeKiB": 100}, {"available": False}):
            with self.subTest(report=report), \
                 patch.object(deploy, "release_storage_report", return_value=report), \
                 patch.object(deploy, "verify_azure_context"), \
                 patch.object(deploy, "read_hosted_baseline", return_value=({}, {"build": "git-" + LIVE}, {})), \
                 patch.object(deploy, "access_token", return_value="synthetic-token"), \
                 patch.object(deploy, "remote_command", side_effect=self.run_remote):
                with self.assertRaisesRegex(deploy.ReleaseError, "nearly full"):
                    deploy.prune_release_storage(self.args)
                if self.evidence.exists():
                    for stale in self.evidence.glob("prune-result.json"):
                        stale.unlink()


if __name__ == "__main__":
    unittest.main()
