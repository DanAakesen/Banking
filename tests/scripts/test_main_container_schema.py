"""Run the actual private wrapper against disposable files; no Azure, host app or SQL."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from argparse import Namespace
from unittest.mock import patch

import test_deploy_banking as fixtures

deploy = fixtures.deploy
ROOT = Path(__file__).parents[2]


class MainContainerSchemaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="banking-main-schema-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.home = self.root / "home"
        self.evidence = self.root / "evidence"
        self.package, self.manifest_path, self.manifest, self.sha = fixtures.DeployBankingTests().package(self.root)
        self.digest = self.manifest["archive"]["sha256"]
        self.environment = dict(os.environ, WEBSITE_SITE_NAME=deploy.APP,
                                IDENTITY_ENDPOINT="synthetic-endpoint", IDENTITY_HEADER="SYNTHETIC_PRIVATE_HEADER")
        bins = self.root / "bin"
        bins.mkdir()
        self.trace = self.root / "dotnet-arguments.json"
        self.stub = bins / "dotnet"
        self.stub.write_text('#!/usr/bin/env python3\nimport json, os, sys\nfrom pathlib import Path\n'
                             'Path(os.environ["SCHEMA_TRACE"]).write_text(json.dumps(sys.argv[1:]))\n'
                             'assert sys.argv[1:] == ["Banking.Api.dll", "--verify-pension-schema"]\n'
                             'print("SYNTHETIC_PRIVATE_OUTPUT"); print("SYNTHETIC_PRIVATE_ERROR", file=sys.stderr)\n'
                             'sys.exit(int(os.environ.get("SCHEMA_STUB_EXIT", "0")))\n')
        self.stub.chmod(0o700)
        self.environment.update(PATH=str(bins) + os.pathsep + os.environ["PATH"], SCHEMA_TRACE=str(self.trace))
        self.requests = []
        self.exec_invocations = []

    def local(self, remote):
        self.assertTrue(remote.startswith("/home/"))
        return self.home / remote.removeprefix("/home/")

    def remote_command(self, token, command):
        self.assertEqual(token, "synthetic-token")
        command = command.replace("/home/", str(self.home) + "/")
        # The root guard includes a standalone /home, which is harmless/read-only in this fixture.
        result = subprocess.run(["bash", "-c", command], capture_output=True, timeout=20,
                                env=self.environment)
        if result.returncode:
            raise deploy.ReleaseError("Synthetic SCM command failed; output suppressed.")
        return result.stdout.decode()

    def request(self, method, url, token=None, body=None, *args, **kwargs):
        self.assertEqual(token, "synthetic-token")
        self.requests.append((method, url, kwargs))
        prefix = deploy.SCM_URL + "/api/vfs"
        if url.startswith(prefix):
            path = self.local("/home" + url.removeprefix(prefix))
            if method == "PUT":
                path.write_bytes(body)
                return 201, b"", {}
            self.assertEqual(method, "GET")
            self.assertEqual(kwargs["max_bytes"], 4096)
            return (200, path.read_bytes(), {}) if path.exists() else (404, b"", {})
        self.assertEqual((method, url), ("POST", deploy.SCM_URL + "/exec/execute"))
        self.assertEqual(kwargs["content_type"], "application/json")
        self.assertLessEqual(kwargs["timeout"], 30)
        payload = json.loads(body)
        self.assertEqual(set(payload), {"Command", "Args", "WorkingDirectory"})
        self.assertEqual(payload["Command"], "/bin/bash")
        self.assertEqual(len(payload["Args"]), 1)
        script = self.local(payload["Args"][0])
        self.assertEqual(script.parent, self.local(payload["WorkingDirectory"]))
        receipt = json.loads((script.parent / "request.json").read_text())
        self.exec_invocations.append(receipt)
        # The persisted local receipt and private remote receipt must predate submission.
        recorded = self.evidence / f'{receipt["check"]}-{receipt["invocationId"]}-invocation.json'
        self.assertEqual(json.loads(recorded.read_text()), receipt)
        self.assertEqual(recorded.stat().st_mode & 0o777, 0o600)
        if not getattr(self, "accept_only", False):
            script.write_text(script.read_text().replace("/home/", str(self.home) + "/"))
            result = subprocess.run([payload["Command"], str(script)],
                                    capture_output=True, timeout=20, env=self.environment)
            self.assertEqual(result.stdout, b"")
            self.assertEqual(result.stderr, b"")
        return 202, b'REMOTE_RESPONSE_MUST_NOT_BE_LOGGED', {}

    def transport(self):
        return (patch.object(deploy, "remote_command", side_effect=self.remote_command),
                patch.object(deploy, "request", side_effect=self.request))

    def stage(self):
        return deploy.stage_pension_candidate("synthetic-token", self.package, self.sha, self.digest)

    def check(self, check="schema"):
        return deploy.run_main_container_check("synthetic-token", self.sha, self.digest, check, self.evidence)

    def test_real_marker_then_schema_wrappers_use_exact_candidate_and_early_cli(self):
        remote, request = self.transport()
        with remote, request:
            result = deploy.stage_and_verify_pension_schema(
                "synthetic-token", self.package, self.sha, self.digest, self.evidence)
        self.assertTrue(result["verified"])
        self.assertTrue(result["mainContainerMarker"]["verified"])
        self.assertEqual([r["check"] for r in self.exec_invocations], ["marker", "schema"])
        self.assertEqual(json.loads(self.trace.read_text()), ["Banking.Api.dll", "--verify-pension-schema"])
        for receipt in self.exec_invocations:
            folder = self.local(receipt["markerPath"]).parent
            self.assertFalse((folder / "candidate").exists())
            self.assertEqual((folder / "result.json").stat().st_mode & 0o777, 0o600)
            self.assertEqual((folder / "request.json").stat().st_mode & 0o777, 0o600)
            self.assertEqual((folder / "command.sh").stat().st_mode & 0o777, 0o600)
            self.assertEqual(folder.stat().st_mode & 0o777, 0o700)
            # Running the same invocation twice never overwrites its original terminal marker.
            before = (folder / "result.json").read_bytes()
            subprocess.run(["bash", str(folder / "command.sh")], check=False, capture_output=True, env=self.environment)
            self.assertEqual((folder / "result.json").read_bytes(), before)
        self.assertNotIn("SYNTHETIC_PRIVATE", "".join(p.read_text() for p in self.evidence.glob("*.json")))
        self.assertFalse((self.home / "site/wwwroot").exists())

    def test_harmless_marker_never_launches_dotnet(self):
        remote, request = self.transport()
        with remote, request:
            self.stage()
            self.assertTrue(self.check("marker")["completed"])
        self.assertFalse(self.trace.exists())

    def test_main_context_required_and_schema_does_not_follow_failed_marker(self):
        self.environment.pop("IDENTITY_ENDPOINT")
        remote, request = self.transport()
        with remote, request, self.assertRaisesRegex(deploy.ReleaseError, "marker check completed unsuccessfully"):
            deploy.stage_and_verify_pension_schema("synthetic-token", self.package, self.sha, self.digest, self.evidence)
        self.assertEqual([r["check"] for r in self.exec_invocations], ["marker"])
        self.assertFalse(self.trace.exists())
        result = json.loads(next(self.evidence.glob("*-result.json")).read_text())
        self.assertTrue(result["completed"])
        self.assertFalse(result["verified"])

    def test_failed_schema_is_terminal_evidence_but_cannot_pass(self):
        self.environment["SCHEMA_STUB_EXIT"] = "2"
        remote, request = self.transport()
        with remote, request, self.assertRaisesRegex(deploy.ReleaseError, "schema check completed unsuccessfully"):
            deploy.stage_and_verify_pension_schema("synthetic-token", self.package, self.sha, self.digest, self.evidence)
        result = json.loads(next(self.evidence.glob("schema-*-result.json")).read_text())
        self.assertEqual((result["completed"], result["verified"], result["exitCode"]), (True, False, 2))
        self.assertEqual(result["scope"], ["Demo", "Live"])

    def test_timed_out_schema_process_cannot_pass(self):
        self.environment["SCHEMA_STUB_EXIT"] = "124"  # GNU timeout's terminal process status.
        remote, request = self.transport()
        with remote, request, self.assertRaises(deploy.ReleaseError):
            deploy.stage_and_verify_pension_schema("synthetic-token", self.package, self.sha, self.digest, self.evidence)
        result = json.loads(next(self.evidence.glob("schema-*-result.json")).read_text())
        self.assertEqual((result["verified"], result["exitCode"]), (False, 124))

    def test_http_202_without_terminal_result_never_proves_execution(self):
        self.accept_only = True
        remote, request = self.transport()
        with remote, request:
            self.stage()
            with patch.object(deploy.time, "monotonic", side_effect=[0, 0, 0, 181]), \
                 patch.object(deploy.time, "sleep"), \
                 self.assertRaisesRegex(deploy.ReleaseError, "no verified terminal result"):
                self.check("marker")
        self.assertEqual(len(self.exec_invocations), 1)
        self.assertFalse(self.trace.exists())
        self.assertEqual(len(list(self.evidence.glob("*-invocation.json"))), 1)
        self.assertEqual(len(list(self.evidence.glob("*-result.json"))), 0)

    def test_diagnostic_entrypoint_only_stages_and_runs_the_two_read_only_checks(self):
        remote, request = self.transport()
        args = Namespace(source_sha=self.sha, package=str(self.package), manifest=str(self.manifest_path),
                         evidence_dir=str(self.evidence), artifact_digest="d" * 64)
        with remote, request, patch.object(deploy, "verify_azure_context"), \
             patch.object(deploy, "access_token", return_value="synthetic-token"), \
             patch.object(deploy, "run_az") as cli, patch.object(deploy, "post_zip") as publish, \
             patch.object(deploy, "restore_remote_backup") as rollback:
            self.assertTrue(deploy.diagnose_schema(args)["verified"])
        cli.assert_not_called()  # No exec-version dependency, restart or other control-plane mutation.
        publish.assert_not_called()
        rollback.assert_not_called()
        summary = json.loads((self.evidence / "diagnostic.json").read_text())
        self.assertEqual(summary["artifactDigest"], "d" * 64)
        self.assertEqual((summary["publishes"], summary["migrations"]), (False, False))

    def test_non_accepted_exec_response_never_starts_polling(self):
        original = self.request
        def reject(method, url, *args, **kwargs):
            if url.endswith("/exec/execute"):
                return 200, b"PRIVATE_OUTPUT", {}
            return original(method, url, *args, **kwargs)
        with patch.object(deploy, "remote_command", side_effect=self.remote_command), \
             patch.object(deploy, "request", side_effect=reject), \
             patch.object(deploy, "wait_for_schema_result") as wait:
            self.stage()
            with self.assertRaisesRegex(deploy.ReleaseError, "not accepted"):
                self.check("marker")
        wait.assert_not_called()
        self.assertFalse(self.trace.exists())

    def test_candidate_or_receipt_tampering_never_launches_schema(self):
        for target in ("archive", "receipt"):
            with self.subTest(target=target):
                # Each unique invocation checks its private receipt and the exact remote ZIP before dotnet.
                invocation = deploy.schema_invocation(self.sha, self.digest)
                folder = self.local(invocation["markerPath"]).parent
                folder.mkdir(parents=True)
                receipt = folder / "request.json"
                receipt.write_text(json.dumps(invocation))
                receipt_hash = deploy.sha256_file(receipt)
                archive = self.home / f"Banking/releases/{self.sha}.zip"
                archive.write_bytes(self.package.read_bytes())
                if target == "archive":
                    archive.write_bytes(b"tampered")
                else:
                    receipt.write_text("tampered")
                script = deploy.main_container_script(invocation, receipt_hash).decode().replace("/home/", str(self.home) + "/")
                executed = subprocess.run(["bash"], input=script, text=True, capture_output=True,
                                          timeout=20, env=self.environment)
                self.assertEqual((executed.stdout, executed.stderr), ("", ""))
                result = json.loads((folder / "result.json").read_text())
                self.assertNotEqual(result["exitCode"], 0)
                self.assertFalse(self.trace.exists())

    def test_expired_command_cannot_execute_or_create_success_marker(self):
        invocation = deploy.schema_invocation(self.sha, self.digest)
        invocation["requestedAt"] = int(time.time()) - 181
        invocation["expiresAt"] = invocation["requestedAt"] + 180
        folder = self.local(invocation["markerPath"]).parent
        folder.mkdir(parents=True)
        script = deploy.main_container_script(invocation, "b" * 64).decode().replace("/home/", str(self.home) + "/")
        subprocess.run(["bash"], input=script, text=True, capture_output=True, timeout=20, env=self.environment)
        self.assertFalse((folder / "result.json").exists())
        self.assertFalse(self.trace.exists())

    def test_symlinked_private_root_is_rejected_before_execution(self):
        releases = self.home / "Banking/releases"
        releases.mkdir(parents=True)
        target = self.root / "untrusted"
        target.mkdir()
        (releases / ".schema-preflight").symlink_to(target, target_is_directory=True)
        remote, request = self.transport()
        with remote, request, self.assertRaises(deploy.ReleaseError):
            self.check("marker")
        self.assertEqual(list(target.iterdir()), [])
        self.assertEqual(self.exec_invocations, [])

    def test_reader_rejects_unexpected_status_and_path_without_exposing_response(self):
        invocation = deploy.schema_invocation(self.sha, self.digest)
        for status in (202, 301, 401, 403, 500):
            with self.subTest(status=status), \
                 patch.object(deploy, "request", return_value=(status, b"SYNTHETIC_PRIVATE", {})), \
                 self.assertRaises(deploy.ReleaseError) as caught:
                deploy.read_schema_metadata("token", invocation, invocation["markerPath"])
            self.assertNotIn("SYNTHETIC_PRIVATE", str(caught.exception))
        with patch.object(deploy, "request") as request:
            with self.assertRaises(deploy.ReleaseError):
                deploy.read_schema_metadata("token", invocation, "/home/site/wwwroot/anything")
        request.assert_not_called()

    def test_transport_and_cli_failures_never_emit_remote_secret_output(self):
        error = subprocess.TimeoutExpired(["az", "exec", "PRIVATE_ARG"], 1, output="PRIVATE_OUT", stderr="PRIVATE_ERR")
        with patch.object(deploy.subprocess, "run", side_effect=error), self.assertRaises(deploy.ReleaseError) as caught:
            deploy.run_az("synthetic")
        self.assertIsNone(caught.exception.__cause__)
        self.assertNotIn("PRIVATE", str(caught.exception))
        self.assertEqual(deploy.endpoint_label(deploy.urllib.parse.urlparse(deploy.SCM_URL + "/exec/execute")),
                         "main-container-execute")

    def test_workflow_diagnostic_is_manual_main_only_and_mutually_exclusive_with_deploy(self):
        workflow = (ROOT / ".github/workflows/publish-banking.yml").read_text()
        diagnostic = workflow.split("\n  schema-diagnostic:\n", 1)[1]
        self.assertIn("github.event_name == 'workflow_dispatch'", diagnostic)
        self.assertIn("github.ref == 'refs/heads/main'", diagnostic)
        self.assertIn("vars.BANKING_AZURE_DEPLOY_ENABLED == 'false'", diagnostic)
        self.assertIn("inputs.confirm_deploy == ''", diagnostic)
        self.assertIn('[[ "$DEPLOY_ENABLED" == "false" ]]', diagnostic)
        self.assertIn("banking-azure-production", diagnostic)
        self.assertIn("id-token: write", diagnostic)
        self.assertIn("!inputs.diagnose_schema", workflow.split("\n  schema-diagnostic:\n", 1)[0])
        self.assertIn("diagnose-schema", diagnostic)
        for forbidden in ("deploy-banking.py publish", "deploy-banking.py capture", "webapp restart", "cloud-schema",
                          "cloud-grant", "refresh-operator", "appsettings", "continue-on-error"):
            self.assertNotIn(forbidden, diagnostic)
