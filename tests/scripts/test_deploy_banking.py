import hashlib
import http.client
import importlib.util
import io
import json
import re
import socket
import ssl
import traceback
from types import SimpleNamespace
import tempfile
import unittest
import urllib.error
from argparse import Namespace
from contextlib import redirect_stderr
from pathlib import Path
from unittest.mock import MagicMock, patch
import zipfile


MODULE_PATH = Path(__file__).parents[2] / "scripts" / "deploy-banking.py"
SPEC = importlib.util.spec_from_file_location("deploy_banking", MODULE_PATH)
deploy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(deploy)


class DeploymentClock:
    def __init__(self):
        self.now = 0.0
        self.sleeps = []

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds


class DeployBankingTests(unittest.TestCase):
    def test_workflow_artifacts_are_attempt_unique_and_downloaded_by_immutable_id(self):
        workflow = (MODULE_PATH.parents[1] / ".github/workflows/publish-banking.yml").read_text()
        names = re.findall(
            r"uses: actions/upload-artifact@[^\n]+\n        with:\n          name: ([^\n]+)",
            workflow,
        )
        expected = [
            "banking-release-${{ steps.source.outputs.sha }}",
            "banking-release-evidence-${{ needs.validate-and-package.outputs.source_sha }}",
            "banking-schema-diagnostic-${{ needs.validate-and-package.outputs.source_sha }}",
        ]
        self.assertEqual(names, [name + "-attempt-${{ github.run_attempt }}" for name in expected])
        rendered = {
            name.replace("${{ steps.source.outputs.sha }}", "a" * 40)
                .replace("${{ needs.validate-and-package.outputs.source_sha }}", "a" * 40)
                .replace("${{ github.run_attempt }}", str(attempt))
            for name in names for attempt in (1, 2)
        }
        self.assertEqual(len(rendered), 6)
        self.assertIn("artifact_id: ${{ steps.upload.outputs.artifact-id }}", workflow)
        self.assertIn("artifact_digest: ${{ steps.upload.outputs.artifact-digest }}", workflow)
        deploy_job, diagnostic_job = workflow.split("\n  deploy:\n", 1)[1].split("\n  schema-diagnostic:\n", 1)
        for job in (deploy_job, diagnostic_job):
            self.assertIn("ARTIFACT_ID: ${{ needs.validate-and-package.outputs.artifact_id }}", job)
            self.assertIn("ARTIFACT_DIGEST: ${{ needs.validate-and-package.outputs.artifact_digest }}", job)
            self.assertIn('gh api "repos/$GITHUB_REPOSITORY/actions/artifacts/$ARTIFACT_ID/zip"', job)
        self.assertNotIn("actions/download-artifact", workflow)
        self.assertNotIn("overwrite:", workflow)

    def response(self, body, headers=None):
        response = MagicMock()
        response.__enter__.return_value = response
        response.status = 200
        response.headers = headers or {}
        response.read.return_value = body
        return response

    def package(self, folder):
        files = {"Banking.Api.dll": b"binary", "wwwroot/index.html": b"<html>"}
        archive_path = folder / "banking-release.zip"
        with zipfile.ZipFile(archive_path, "w") as archive:
            for name, content in files.items():
                archive.writestr(name, content)
        entries = [dict(path=name, sha256=hashlib.sha256(data).hexdigest(), size=len(data))
                   for name, data in files.items()]
        sha = "a" * 40
        manifest = dict(schemaVersion=1, sourceSha=sha, build="git-" + sha,
                        archive=dict(name=archive_path.name,
                                     sha256=deploy.sha256_file(archive_path),
                                     size=archive_path.stat().st_size), files=entries)
        manifest_path = folder / "manifest.json"
        manifest_path.write_text(json.dumps(manifest))
        return archive_path, manifest_path, manifest, sha

    def test_manifest_checks_every_archive_file_hash(self):
        with tempfile.TemporaryDirectory() as temp:
            archive, manifest_path, manifest, sha = self.package(Path(temp))
            deploy.verify_manifest(archive, manifest_path, sha)
            manifest["files"][0]["sha256"] = "0" * 64
            manifest_path.write_text(json.dumps(manifest))
            with self.assertRaises(deploy.ReleaseError):
                deploy.verify_manifest(archive, manifest_path, sha)

    def test_manifest_rejects_zip_traversal_and_extra_entries(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            archive, manifest_path, manifest, sha = self.package(folder)
            with zipfile.ZipFile(archive, "a") as output:
                output.writestr("../escape", b"x")
            manifest["archive"].update(sha256=deploy.sha256_file(archive), size=archive.stat().st_size)
            manifest_path.write_text(json.dumps(manifest))
            with self.assertRaises(deploy.ReleaseError):
                deploy.verify_manifest(archive, manifest_path, sha)

    def test_schema_preflight_uploads_verified_archive_only_outside_wwwroot(self):
        with tempfile.TemporaryDirectory() as temp:
            package, _, manifest, sha = self.package(Path(temp))
            commands = []
            def remote(_token, command):
                commands.append(command)
                return "UPLOAD\n" if len(commands) == 1 else ""
            with patch.object(deploy, "remote_command", side_effect=remote), \
                 patch.object(deploy, "request", return_value=(201, b"", {})) as upload:
                result = deploy.stage_pension_candidate(
                    "token", package, sha, manifest["archive"]["sha256"]
                )
            self.assertEqual(result["stagedPath"], f"/home/Banking/releases/{sha}")
            upload.assert_called_once()
            self.assertEqual(upload.call_args.args[:2],
                             ("PUT", f"{deploy.SCM_URL}/api/vfs/Banking/releases/{sha}.zip"))
            self.assertIn("sha256sum -c -", commands[-1])
            self.assertNotIn("dotnet", commands[-1])
            self.assertNotIn("/home/site/wwwroot", " ".join(commands))

    def test_schema_preflight_reuses_exact_archive_and_rebuilds_stage(self):
        with tempfile.TemporaryDirectory() as temp:
            package, _, manifest, sha = self.package(Path(temp))
            commands = []
            def remote(_token, command):
                commands.append(command)
                return "REUSE\n" if len(commands) == 1 else ""
            with patch.object(deploy, "remote_command", side_effect=remote), \
                 patch.object(deploy, "request") as upload:
                deploy.stage_pension_candidate(
                    "token", package, sha, manifest["archive"]["sha256"]
                )
            upload.assert_not_called()
            self.assertIn(manifest["archive"]["sha256"], commands[0])
            self.assertIn("sha256sum -c -", commands[0])
            self.assertIn("rm -rf -- /home/Banking/releases/" + sha, commands[-1])
            self.assertIn("unzip -oq /home/Banking/releases/" + sha + ".zip", commands[-1])

    def test_schema_preflight_refuses_different_existing_archive(self):
        with tempfile.TemporaryDirectory() as temp:
            package, _, manifest, sha = self.package(Path(temp))
            with patch.object(deploy, "remote_command",
                              side_effect=deploy.ReleaseError("archive checksum mismatch")), \
                 patch.object(deploy, "request") as upload:
                with self.assertRaises(deploy.ReleaseError):
                    deploy.stage_pension_candidate(
                        "token", package, sha, manifest["archive"]["sha256"]
                    )
            upload.assert_not_called()

    def test_rollback_requires_new_terminal_deployment(self):
        self.assertFalse(deploy.rollback_is_safe("old", None))
        self.assertFalse(deploy.rollback_is_safe("old", {"id": "new", "complete": False}))
        self.assertFalse(deploy.rollback_is_safe("old", {"id": "old", "complete": True}))
        self.assertTrue(deploy.rollback_is_safe("old", {"id": "new", "complete": True}))

    def test_http_202_is_pending_only_for_the_fixed_deployment_status_endpoint(self):
        body = json.dumps({"id": "new", "status": 4, "complete": True}).encode()
        with patch.object(deploy, "request", return_value=(202, body, {})) as request:
            pending = deploy.latest_deployment("synthetic-token")
            request.assert_called_once_with("GET", deploy.SCM_URL + "/api/deployments/latest",
                                            "synthetic-token", timeout=90, max_bytes=4 * 1024 * 1024)
            self.assertEqual(pending["id"], "new")
            self.assertFalse(deploy.is_terminal(pending))
            self.assertFalse(deploy.is_success(pending))
            self.assertFalse(deploy.rollback_is_safe("before", pending))
            with self.assertRaisesRegex(deploy.ReleaseError, "HTTP 202"):
                deploy.get_json(deploy.SCM_URL + "/unrelated", "synthetic-token")

    def test_deployment_status_requires_bounded_json_and_a_string_identity(self):
        invalid = [b"PRIVATE_RESPONSE", b"[]", b"null", b"{}", b'{"id":42}', b'{"id":" "}', b""]
        for status in (200, 202):
            for body in invalid:
                with self.subTest(status=status, body=body), \
                     patch.object(deploy, "request", return_value=(status, body, {})), \
                     self.assertRaises(deploy.ReleaseError) as caught:
                    deploy.latest_deployment("synthetic-token")
                rendered = ''.join(traceback.format_exception(caught.exception))
                self.assertNotIn("PRIVATE_RESPONSE", rendered)
        response = self.response(b"", {"Content-Length": str(4 * 1024 * 1024 + 1)})
        response.status = 202
        with patch.object(deploy.urllib.request.OpenerDirector, "open", return_value=response), \
             self.assertRaisesRegex(deploy.ReleaseError, "size bound"):
            deploy.latest_deployment("synthetic-token")
        response.read.assert_not_called()

    def test_deployment_status_refuses_other_http_statuses_and_redirects(self):
        for status in (201, 204, 301, 401, 403, 500):
            with self.subTest(status=status), \
                 patch.object(deploy, "request", return_value=(status, b"PRIVATE_RESPONSE", {})), \
                 self.assertRaises(deploy.ReleaseError):
                deploy.latest_deployment("synthetic-token")
        redirect = urllib.error.HTTPError("url", 302, "redirect", {"Location": "https://attacker.invalid/"}, None)
        with patch.object(deploy.urllib.request.OpenerDirector, "open", side_effect=redirect), \
             self.assertRaisesRegex(deploy.ReleaseError, "redirect"):
            deploy.latest_deployment("synthetic-token")

    def test_async_poll_waits_for_new_http_200_terminal_success_or_failure(self):
        for terminal_status in (3, 4):
            with self.subTest(terminal_status=terminal_status):
                clock = DeploymentClock()
                terminal = {"id": "new", "status": terminal_status, "complete": True}
                replies = [(200, {"id": "before", "status": 4, "complete": True}),
                           (202, {"id": "new", "status": 4, "complete": True}),
                           (200, terminal)]
                def read(*args, **kwargs):
                    status, body = replies.pop(0)
                    return status, json.dumps(body).encode(), {}
                with patch.object(deploy, "request", side_effect=read) as request, \
                     patch.object(deploy.time, "monotonic", side_effect=clock.monotonic), \
                     patch.object(deploy.time, "sleep", side_effect=clock.sleep):
                    result = deploy.wait_for_deployment("synthetic-token", "before", timeout_seconds=12)
                self.assertEqual(result, terminal)
                self.assertEqual(deploy.is_success(result), terminal_status == 4)
                self.assertEqual(clock.sleeps, [5, 5])
                self.assertEqual([call.kwargs["timeout"] for call in request.call_args_list], [12, 7, 2])

    def test_async_pending_times_out_without_inventing_terminal_success(self):
        clock = DeploymentClock()
        body = json.dumps({"id": "new", "status": 4, "complete": True}).encode()
        with patch.object(deploy, "request", return_value=(202, body, {})) as request, \
             patch.object(deploy.time, "monotonic", side_effect=clock.monotonic), \
             patch.object(deploy.time, "sleep", side_effect=clock.sleep), \
             self.assertRaisesRegex(deploy.ReleaseError, "terminal state before the timeout"):
            deploy.wait_for_deployment("synthetic-token", "before", timeout_seconds=12)
        self.assertEqual(request.call_count, 3)
        self.assertEqual(clock.now, 12)
        self.assertEqual(clock.sleeps, [5, 5, 2])

    def test_late_terminal_response_does_not_pass_poll_deadline(self):
        clock = DeploymentClock()
        def read(*args, **kwargs):
            self.assertEqual(kwargs["timeout"], 2)
            clock.now = 3
            return 200, b'{"id":"new","status":4,"complete":true}', {}
        with patch.object(deploy, "request", side_effect=read), \
             patch.object(deploy.time, "monotonic", side_effect=clock.monotonic), \
             patch.object(deploy.time, "sleep") as sleep, \
             self.assertRaisesRegex(deploy.ReleaseError, "terminal state before the timeout"):
            deploy.wait_for_deployment("synthetic-token", "before", timeout_seconds=2)
        sleep.assert_not_called()

    def test_final_status_reconciliation_never_treats_http_202_as_terminal(self):
        body = b'{"id":"new","status":4,"complete":true}'
        with patch.object(deploy, "wait_for_deployment", side_effect=deploy.ReleaseError("timed out")), \
             patch.object(deploy, "request", return_value=(202, body, {})), \
             self.assertRaisesRegex(deploy.ReleaseError, "timed out"):
            deploy.wait_after_publish("synthetic-token", "before")

    def test_http_401_is_returned_only_when_explicitly_allowed(self):
        error = urllib.error.HTTPError("url", 401, "denied", {}, None)
        with patch.object(deploy.urllib.request.OpenerDirector, "open", side_effect=error):
            with self.assertRaises(deploy.ReleaseError):
                deploy.request("GET", deploy.APP_URL + "/api/accounts")
        with patch.object(deploy.urllib.request.OpenerDirector, "open", side_effect=error):
            status, body, _ = deploy.request("GET", deploy.APP_URL + "/api/accounts", allow_http_error=True)
        self.assertEqual((status, body), (401, b""))

    def test_request_errors_classify_without_remote_text_and_keep_limits(self):
        secret = "PRIVATE_REMOTE_DETAIL"
        errors = [(TimeoutError(secret), "timeout"),
                  (urllib.error.URLError(TimeoutError(secret)), "timeout"),
                  (urllib.error.URLError(socket.gaierror(secret)), "dns"),
                  (urllib.error.URLError(ssl.SSLError(secret)), "tls"),
                  (ConnectionResetError(secret), "connection"),
                  (http.client.IncompleteRead(secret.encode()), "protocol"),
                  (urllib.error.URLError(secret), "network"), (OSError(secret), "network")]
        for error, category in errors:
            with self.subTest(category=category, error=type(error).__name__):
                output = io.StringIO()
                url = deploy.SCM_URL + "/api/command?signature=" + secret
                with redirect_stderr(output), \
                     patch.object(deploy.urllib.request.OpenerDirector, "open", side_effect=error) as opened:
                    try:
                        with deploy.capture_phase("capture-backup"):
                            deploy.request("POST", url, token=secret, body=secret.encode(), timeout=180)
                    except deploy.ReleaseError as failure:
                        rendered = "".join(traceback.format_exception(failure))
                    else:
                        self.fail("Request failure was swallowed")
                events = [json.loads(line) for line in output.getvalue().splitlines()]
                failed = next(e for e in events if e["event"] == "app-service-request" and e["outcome"] == "failed")
                self.assertEqual((failed["phase"], failed["endpoint"], failed["category"]),
                                 ("capture-backup", "scm-command", category))
                self.assertEqual(failed["timeoutSeconds"], 180)
                self.assertIsNone(failed["httpStatus"])
                self.assertGreaterEqual(failed["elapsedMs"], 0)
                self.assertEqual(events[-1]["outcome"], "failed")
                self.assertNotIn(secret, output.getvalue() + rendered)
                self.assertNotIn("signature", output.getvalue())
                self.assertEqual(deploy.CURRENT_PHASE.get(), "release")
                self.assertEqual(opened.call_args.kwargs["timeout"], 180)

    def test_http_failure_evidence_redacts_urls_headers_bodies_and_reason(self):
        secret = "PRIVATE_HTTP_DETAIL"
        url = deploy.SCM_URL + "/api/deployments/latest?signature=" + secret
        for code, allowed in ((401, False), (403, False), (500, False), (302, False), (401, True)):
            with self.subTest(code=code, allowed=allowed):
                output = io.StringIO()
                error = urllib.error.HTTPError(url, code, secret, {"X-Private": secret}, io.BytesIO(secret.encode()))
                with redirect_stderr(output), patch.object(deploy.urllib.request.OpenerDirector, "open", side_effect=error):
                    if allowed:
                        self.assertEqual(deploy.request("GET", url, allow_http_error=True)[:2], (401, b""))
                    else:
                        with self.assertRaises(deploy.ReleaseError) as caught:
                            deploy.request("GET", url, token=secret)
                        self.assertNotIn(secret, "".join(traceback.format_exception(caught.exception)))
                event = json.loads(output.getvalue().splitlines()[-1])
                self.assertEqual((event["endpoint"], event["httpStatus"]), ("scm-latest-deployment", code))
                self.assertEqual(event["category"], "redirect-refused" if code == 302 else "http")
                self.assertEqual(event["outcome"], "allowed" if allowed else "failed")
                self.assertNotIn(secret, output.getvalue())
                self.assertNotIn("X-Private", output.getvalue())

    def test_response_timing_and_invalid_header_are_sanitized(self):
        for length, expected in (("2", "succeeded"), ("PRIVATE_HEADER_DETAIL", "failed")):
            with self.subTest(length=length):
                output = io.StringIO()
                with redirect_stderr(output), patch.object(deploy.urllib.request.OpenerDirector, "open",
                        return_value=self.response(b"ok", {"Content-Length": length})):
                    if expected == "succeeded":
                        self.assertEqual(deploy.request("GET", deploy.APP_URL + "/health")[1], b"ok")
                    else:
                        with self.assertRaises(deploy.ReleaseError):
                            deploy.request("GET", deploy.APP_URL + "/health")
                event = json.loads(output.getvalue().splitlines()[-1])
                self.assertEqual((event["endpoint"], event["outcome"]), ("app-health", expected))
                self.assertGreaterEqual(event["elapsedMs"], 0)
                self.assertNotIn("PRIVATE_HEADER_DETAIL", output.getvalue())

    def test_unknown_endpoint_and_response_bounds_never_echo_private_details(self):
        secret = "PRIVATE_PATH_DETAIL"
        output = io.StringIO()
        with redirect_stderr(output), patch.object(deploy.urllib.request.OpenerDirector, "open",
                return_value=self.response(b"private response body", {"Content-Length": "21"})):
            with self.assertRaises(deploy.ReleaseError):
                deploy.request("GET", deploy.SCM_URL + "/api/vfs/" + secret + "?token=" + secret, max_bytes=1)
        event = json.loads(output.getvalue().splitlines()[-1])
        self.assertEqual((event["endpoint"], event["category"]), ("scm-other", "response-bound"))
        for private in (secret, "private response body", "/api/vfs/", "token="):
            self.assertNotIn(private, output.getvalue())

    def test_probe_unexpected_output_is_suppressed_and_stops_before_backup(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            package, manifest_path, _, sha = self.package(folder)
            args = Namespace(package=str(package), manifest=str(manifest_path), source_sha=sha,
                             evidence_dir=str(folder / "evidence"), artifact_digest="digest")
            output = io.StringIO()
            with redirect_stderr(output), patch.object(deploy, "verify_azure_context"), \
                 patch.object(deploy, "read_hosted_baseline", return_value=({}, {}, {})), \
                 patch.object(deploy, "access_token", return_value="token"), \
                 patch.object(deploy, "remote_command", return_value="PRIVATE_PROBE_DETAIL") as remote:
                with self.assertRaises(deploy.ReleaseError) as caught:
                    deploy.capture(args)
            remote.assert_called_once_with("token", "pwd")
            self.assertFalse((folder / "evidence/rollback-manifest.json").exists())
            self.assertEqual(json.loads(output.getvalue().splitlines()[-1])["phase"], "capture-scm-probe")
            self.assertNotIn("PRIVATE_PROBE_DETAIL", output.getvalue() + str(caught.exception))

    def test_capture_probe_and_backup_failures_have_distinct_phases_and_no_manifest(self):
        for phase in ("capture-scm-probe", "capture-backup"):
            with self.subTest(phase=phase), tempfile.TemporaryDirectory() as temp:
                folder = Path(temp)
                package, manifest_path, _, sha = self.package(folder)
                args = Namespace(package=str(package), manifest=str(manifest_path), source_sha=sha,
                                 evidence_dir=str(folder / "evidence"), artifact_digest="digest")
                output = io.StringIO()
                error = urllib.error.URLError(TimeoutError("PRIVATE_CAPTURE_DETAIL"))
                results = [error] if phase == "capture-scm-probe" else [
                    self.response(json.dumps({"ExitCode": 0, "Output": "/home\n"}).encode()), error]
                with redirect_stderr(output), patch.object(deploy, "verify_azure_context"), \
                     patch.object(deploy, "read_hosted_baseline", return_value=({}, {"build": "old"}, {"id": "before"})), \
                     patch.object(deploy, "access_token", return_value="PRIVATE_CAPTURE_DETAIL"), \
                     patch.object(deploy.urllib.request.OpenerDirector, "open", side_effect=results) as opened:
                    with self.assertRaises(deploy.ReleaseError):
                        deploy.capture(args)
                events = [json.loads(line) for line in output.getvalue().splitlines()]
                failed = [e for e in events if e["outcome"] == "failed"]
                self.assertEqual([e["phase"] for e in failed], [phase, phase])
                self.assertEqual(failed[0]["category"], "timeout")
                probe = json.loads(opened.call_args_list[0].args[0].data)
                self.assertEqual(probe["command"], "bash -c pwd")
                self.assertEqual(probe["dir"], "/home")
                self.assertEqual(opened.call_count, 1 if phase == "capture-scm-probe" else 2)
                self.assertFalse((folder / "evidence/rollback-manifest.json").exists())
                self.assertNotIn("PRIVATE_CAPTURE_DETAIL", output.getvalue())

    def test_capture_baseline_failure_identifies_runtime_request_before_any_scm_command(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            package, manifest_path, _, sha = self.package(folder)
            args = Namespace(package=str(package), manifest=str(manifest_path), source_sha=sha,
                             evidence_dir=str(folder / "evidence"), artifact_digest="digest")
            output = io.StringIO()
            with redirect_stderr(output), patch.object(deploy, "verify_azure_context"), \
                 patch.object(deploy.urllib.request.OpenerDirector, "open", side_effect=[
                     self.response(b'{"status":"running","environment":"azure"}'),
                     urllib.error.URLError("PRIVATE_RUNTIME_DETAIL")]) as opened:
                with self.assertRaises(deploy.ReleaseError):
                    deploy.capture(args)
            events = [json.loads(line) for line in output.getvalue().splitlines()]
            failed = next(e for e in events if e["event"] == "app-service-request" and e["outcome"] == "failed")
            self.assertEqual((failed["phase"], failed["endpoint"], failed["category"]),
                             ("capture-baseline", "app-runtime", "network"))
            self.assertEqual(opened.call_count, 2)
            self.assertFalse((folder / "evidence").exists())
            self.assertNotIn("PRIVATE_RUNTIME_DETAIL", output.getvalue())

    def test_phase_rejects_untrusted_labels_without_echoing_them(self):
        output = io.StringIO()
        with redirect_stderr(output), self.assertRaisesRegex(deploy.ReleaseError, "Unknown capture phase"):
            with deploy.capture_phase("PRIVATE_PHASE_DETAIL"):
                self.fail("Untrusted phase was accepted")
        self.assertEqual(output.getvalue(), "")

    def test_remote_command_failure_suppresses_output_and_error(self):
        output = io.StringIO()
        with redirect_stderr(output), patch.object(deploy, "request", return_value=(200, json.dumps(
                {"ExitCode": 2, "Output": "PRIVATE_REMOTE_OUTPUT", "Error": "PRIVATE_REMOTE_ERROR"}).encode(), {})):
            with self.assertRaisesRegex(deploy.ReleaseError, "SCM command failed") as caught:
                deploy.remote_command("token", 'printf "%s\\n" "$checkdir"')
        self.assertNotIn("PRIVATE_REMOTE", output.getvalue() + str(caught.exception))

    def test_redirects_are_not_followed_and_hosts_are_fixed(self):
        redirect = urllib.error.HTTPError("url", 302, "redirect", {"Location": "https://attacker.invalid/"}, None)
        with patch.object(deploy.urllib.request.OpenerDirector, "open", side_effect=redirect):
            with self.assertRaisesRegex(deploy.ReleaseError, "redirect"):
                deploy.request("GET", deploy.SCM_URL + "/api/deployments/latest", token="bearer")
        with self.assertRaisesRegex(deploy.ReleaseError, "fixed Banking"):
            deploy.request("GET", "https://attacker.invalid/", token="bearer")

    def test_capture_then_failed_terminal_publish_restores_remote_snapshot(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            package, manifest_path, manifest, sha = self.package(folder)
            evidence = folder / "evidence"
            capture_args = Namespace(package=str(package), manifest=str(manifest_path),
                                     source_sha=sha, evidence_dir=str(evidence),
                                     artifact_digest="sha256:" + "b" * 64)
            previous_runtime = {"build": "2026.10.14.1"}
            previous_deployment = {"id": "before", "status": 4, "complete": True}
            backup_digest = "c" * 64
            command_results = ["/home\n", f"{backup_digest}  /home/Banking/releases/before-{sha}.zip\n100\n"]
            command_results.extend(["d" * 64 + "  -\n"] * 4)
            with patch.object(deploy, "verify_azure_context"), \
                 patch.object(deploy, "read_hosted_baseline", return_value=({}, previous_runtime, previous_deployment)), \
                 patch.object(deploy, "access_token", return_value="token"), \
                 patch.object(deploy, "remote_command", side_effect=command_results) as remote:
                snapshot = deploy.capture(capture_args)
            self.assertEqual(remote.call_args_list[0].args[1], "pwd")
            capture_command = remote.call_args_list[1].args[1]
            self.assertIn("if test -e " + snapshot["rollbackLocation"], capture_command)
            self.assertIn("diff -qr /home/site/wwwroot", capture_command)
            self.assertTrue(any('wwwroot/index.html' in call.args[1] for call in remote.call_args_list))
            self.assertEqual(snapshot["rollbackSha256"], backup_digest)
            publish_args = Namespace(source_sha=sha, package=str(package), manifest=str(manifest_path),
                                     artifact_digest=capture_args.artifact_digest,
                                     evidence_dir=str(evidence), repo=str(Path(__file__).parents[2]))
            failed = {"id": "new-deploy", "status": 3, "complete": True}
            with patch.object(deploy, "verify_azure_context"), \
                 patch.object(deploy, "read_hosted_baseline", return_value=({}, previous_runtime, previous_deployment)), \
                 patch.object(deploy, "access_token", return_value="token"), \
                 patch.object(deploy, "remote_command", return_value=""), \
                 patch.object(deploy, "stage_and_verify_pension_schema", return_value={"verified": True}), \
                 patch.object(deploy, "post_zip"), \
                 patch.object(deploy, "wait_after_publish", return_value=failed), \
                 patch.object(deploy, "latest_deployment", return_value=failed), \
                 patch.object(deploy, "restore_remote_backup", return_value={"build": previous_runtime["build"]}) as restore:
                with self.assertRaises(deploy.ReleaseError):
                    deploy.publish(publish_args)
            restore.assert_called_once()
            result = json.loads((evidence / "release-evidence.json").read_text())
            self.assertEqual(result["rollbackOutcome"], "succeeded")
            remote.assert_called()

    def test_unknown_or_in_progress_deployment_never_starts_rollback(self):
        for latest in (None, {"id": "new-deploy", "status": 1, "complete": False}):
            with self.subTest(latest=latest), tempfile.TemporaryDirectory() as temp:
                folder = Path(temp)
                package, manifest_path, manifest, sha = self.package(folder)
                evidence = folder / "evidence"
                evidence.mkdir()
                snapshot = dict(schemaVersion=1, app=deploy.APP, resourceId=deploy.RESOURCE_ID,
                                sourceSha=sha, releaseArchiveSha256=manifest["archive"]["sha256"],
                                artifactDigest="digest", rollbackLocation=f"/home/Banking/releases/before-{sha}.zip",
                                rollbackSha256="c" * 64, previousBuild="old", previousDeploymentId="before")
                (evidence / "rollback-manifest.json").write_text(json.dumps(snapshot))
                args = Namespace(source_sha=sha, package=str(package), manifest=str(manifest_path),
                                 artifact_digest="digest", evidence_dir=str(evidence), repo=temp)
                baseline = ({}, {"build": "old"}, {"id": "before", "status": 4, "complete": True})
                with patch.object(deploy, "verify_azure_context"), \
                     patch.object(deploy, "read_hosted_baseline", return_value=baseline), \
                     patch.object(deploy, "access_token", return_value="token"), \
                     patch.object(deploy, "remote_command", return_value=""), \
                     patch.object(deploy, "stage_and_verify_pension_schema", return_value={"verified": True}), \
                     patch.object(deploy, "post_zip"), \
                     patch.object(deploy, "wait_after_publish", side_effect=deploy.ReleaseError("state unknown")), \
                     patch.object(deploy, "latest_deployment", return_value=latest), \
                     patch.object(deploy, "restore_remote_backup") as restore:
                    with self.assertRaises(deploy.ReleaseError):
                        deploy.publish(args)
                restore.assert_not_called()

    def test_publish_never_restarts_rolls_back_or_resubmits_while_http_202_is_pending(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            package, manifest_path, manifest, sha = self.package(folder)
            evidence = folder / "evidence"
            evidence.mkdir()
            snapshot = dict(schemaVersion=1, app=deploy.APP, resourceId=deploy.RESOURCE_ID,
                            sourceSha=sha, releaseArchiveSha256=manifest["archive"]["sha256"],
                            artifactDigest="digest", rollbackLocation=f"/home/Banking/releases/before-{sha}.zip",
                            rollbackSha256="c" * 64, previousBuild="old", previousDeploymentId="before")
            (evidence / "rollback-manifest.json").write_text(json.dumps(snapshot))
            args = Namespace(source_sha=sha, package=str(package), manifest=str(manifest_path),
                             artifact_digest="digest", evidence_dir=str(evidence), repo=temp)
            clock = DeploymentClock()
            original_wait = deploy.wait_for_deployment
            def bounded_wait(token, previous_id):
                return original_wait(token, previous_id, timeout_seconds=6)
            # Even a contradictory complete:true body is pending when the HTTP status is 202.
            body = b'{"id":"new","status":4,"complete":true}'
            with patch.object(deploy, "verify_azure_context"), \
                 patch.object(deploy, "read_hosted_baseline", return_value=(
                     {}, {"build": "old"}, {"id": "before", "status": 4, "complete": True})), \
                 patch.object(deploy, "access_token", return_value="synthetic-token"), \
                 patch.object(deploy, "remote_command", return_value=""), \
                 patch.object(deploy, "stage_and_verify_pension_schema", return_value={"verified": True}), \
                 patch.object(deploy, "request", return_value=(202, body, {})), \
                 patch.object(deploy, "wait_for_deployment", side_effect=bounded_wait), \
                 patch.object(deploy.time, "monotonic", side_effect=clock.monotonic), \
                 patch.object(deploy.time, "sleep", side_effect=clock.sleep), \
                 patch.object(deploy, "post_zip") as upload, \
                 patch.object(deploy, "run_az") as restart, \
                 patch.object(deploy, "verify_runtime_files") as files, \
                 patch.object(deploy, "restore_remote_backup") as rollback:
                with self.assertRaises(deploy.ReleaseError):
                    deploy.publish(args)
            upload.assert_called_once_with("synthetic-token", package)
            restart.assert_not_called()
            files.assert_not_called()
            rollback.assert_not_called()
            result = json.loads((evidence / "release-evidence.json").read_text())
            self.assertFalse(result["rollbackAttempted"])
            self.assertFalse(result["controlledRestartIssued"])

    def test_postdeploy_smoke_failure_after_terminal_success_restores_backup(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            package, manifest_path, manifest, sha = self.package(folder)
            evidence = folder / "evidence"
            evidence.mkdir()
            snapshot = dict(schemaVersion=1, app=deploy.APP, resourceId=deploy.RESOURCE_ID,
                            sourceSha=sha, releaseArchiveSha256=manifest["archive"]["sha256"],
                            artifactDigest="digest", rollbackLocation=f"/home/Banking/releases/before-{sha}.zip",
                            rollbackSha256="c" * 64, previousBuild="old", previousDeploymentId="before")
            (evidence / "rollback-manifest.json").write_text(json.dumps(snapshot))
            args = Namespace(source_sha=sha, package=str(package), manifest=str(manifest_path),
                             artifact_digest="digest", evidence_dir=str(evidence), repo=temp)
            baseline = ({}, {"build": "old"}, {"id": "before", "status": 4, "complete": True})
            terminal_success = {"id": "new", "status": 4, "complete": True}
            with patch.object(deploy, "verify_azure_context"), \
                 patch.object(deploy, "read_hosted_baseline", return_value=baseline), \
                 patch.object(deploy, "access_token", return_value="token"), \
                 patch.object(deploy, "remote_command", return_value=""), \
                 patch.object(deploy, "stage_and_verify_pension_schema", return_value={"verified": True}), \
                 patch.object(deploy, "post_zip"), \
                 patch.object(deploy, "wait_after_publish", return_value=terminal_success), \
                 patch.object(deploy, "verify_runtime_files", return_value={}), \
                 patch.object(deploy, "run_az", return_value="") as restart, \
                 patch.object(deploy, "verify_hosted", side_effect=deploy.ReleaseError("smoke failed")), \
                 patch.object(deploy, "latest_deployment", return_value=terminal_success), \
                 patch.object(deploy, "restore_remote_backup", return_value={"build": "old"}) as restore:
                with self.assertRaises(deploy.ReleaseError):
                    deploy.publish(args)
            restore.assert_called_once()
            restart.assert_called_once_with(
                "webapp", "restart", "--resource-group", deploy.RESOURCE_GROUP,
                "--name", deploy.APP, "--output", "none",
            )
            result = json.loads((evidence / "release-evidence.json").read_text())
            self.assertEqual(result["rollbackOutcome"], "succeeded")

    def test_success_restarts_once_between_runtime_hashes_and_hosted_checks(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            package, manifest_path, manifest, sha = self.package(folder)
            evidence = folder / "evidence"
            evidence.mkdir()
            snapshot = dict(schemaVersion=1, app=deploy.APP, resourceId=deploy.RESOURCE_ID,
                            sourceSha=sha, releaseArchiveSha256=manifest["archive"]["sha256"],
                            artifactDigest="digest", rollbackLocation=f"/home/Banking/releases/before-{sha}.zip",
                            rollbackSha256="c" * 64, previousBuild="old", previousDeploymentId="before")
            (evidence / "rollback-manifest.json").write_text(json.dumps(snapshot))
            args = Namespace(source_sha=sha, package=str(package), manifest=str(manifest_path),
                             artifact_digest="digest", evidence_dir=str(evidence), repo=temp)
            baseline = ({}, {"build": "old"}, {"id": "before", "status": 4, "complete": True})
            terminal_success = {"id": "new", "status": 4, "complete": True}
            order = []
            def schema_gate(*_):
                order.append("schema")
                return {"verified": True}
            def upload(*_):
                order.append("zip")
            def wait_terminal(*_):
                order.append("terminal")
                return terminal_success
            def verify_files(*_):
                order.append("files")
                return {"Banking.Api.dll": "hash"}
            def restart(*args):
                order.append("restart")
                self.assertEqual(args, ("webapp", "restart", "--resource-group", deploy.RESOURCE_GROUP,
                                        "--name", deploy.APP, "--output", "none"))
            def hosted(*_args, **_kwargs):
                order.append("hosted")
                return {"health": "running", "build": manifest["build"]}
            with patch.object(deploy, "verify_azure_context"), \
                 patch.object(deploy, "read_hosted_baseline", return_value=baseline), \
                 patch.object(deploy, "access_token", return_value="token"), \
                 patch.object(deploy, "remote_command", return_value=""), \
                 patch.object(deploy, "stage_and_verify_pension_schema", side_effect=schema_gate), \
                 patch.object(deploy, "post_zip", side_effect=upload), \
                 patch.object(deploy, "wait_after_publish", side_effect=wait_terminal), \
                 patch.object(deploy, "verify_runtime_files", side_effect=verify_files), \
                 patch.object(deploy, "run_az", side_effect=restart) as restart_mock, \
                 patch.object(deploy, "verify_hosted", side_effect=hosted):
                result = deploy.publish(args)
            self.assertEqual(order, ["schema", "zip", "terminal", "files", "restart", "hosted"])
            restart_mock.assert_called_once()
            self.assertTrue(result["controlledRestartIssued"])
            self.assertTrue(result["pensionSchemaVerified"])

    def test_missing_pension_schema_gate_blocks_live_upload_and_restart(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            package, manifest_path, manifest, sha = self.package(folder)
            evidence = folder / "evidence"
            evidence.mkdir()
            snapshot = dict(schemaVersion=1, app=deploy.APP, resourceId=deploy.RESOURCE_ID,
                            sourceSha=sha, releaseArchiveSha256=manifest["archive"]["sha256"],
                            artifactDigest="digest", rollbackLocation=f"/home/Banking/releases/before-{sha}.zip",
                            rollbackSha256="c" * 64, previousBuild="old", previousDeploymentId="before")
            (evidence / "rollback-manifest.json").write_text(json.dumps(snapshot))
            args = Namespace(source_sha=sha, package=str(package), manifest=str(manifest_path),
                             artifact_digest="digest", evidence_dir=str(evidence), repo=temp)
            baseline = ({}, {"build": "old"}, {"id": "before", "status": 4, "complete": True})
            with patch.object(deploy, "verify_azure_context"), \
                 patch.object(deploy, "read_hosted_baseline", return_value=baseline), \
                 patch.object(deploy, "access_token", return_value="token"), \
                 patch.object(deploy, "remote_command", return_value=""), \
                 patch.object(deploy, "stage_and_verify_pension_schema",
                              side_effect=deploy.ReleaseError("required schema missing")), \
                 patch.object(deploy, "post_zip") as live_upload, \
                 patch.object(deploy, "latest_deployment") as latest, \
                 patch.object(deploy, "run_az") as restart, \
                 patch.object(deploy, "restore_remote_backup") as rollback:
                with self.assertRaises(deploy.ReleaseError):
                    deploy.publish(args)
            live_upload.assert_not_called()
            latest.assert_not_called()
            restart.assert_not_called()
            rollback.assert_not_called()
            result = json.loads((evidence / "release-evidence.json").read_text())
            self.assertFalse(result["pensionSchemaVerified"])
            self.assertFalse(result["controlledRestartIssued"])
            self.assertFalse(result["rollbackAttempted"])

    def test_runtime_hash_failure_does_not_restart_and_uses_terminal_rollback(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            package, manifest_path, manifest, sha = self.package(folder)
            evidence = folder / "evidence"
            evidence.mkdir()
            snapshot = dict(schemaVersion=1, app=deploy.APP, resourceId=deploy.RESOURCE_ID,
                            sourceSha=sha, releaseArchiveSha256=manifest["archive"]["sha256"],
                            artifactDigest="digest", rollbackLocation=f"/home/Banking/releases/before-{sha}.zip",
                            rollbackSha256="c" * 64, previousBuild="old", previousDeploymentId="before")
            (evidence / "rollback-manifest.json").write_text(json.dumps(snapshot))
            args = Namespace(source_sha=sha, package=str(package), manifest=str(manifest_path),
                             artifact_digest="digest", evidence_dir=str(evidence), repo=temp)
            baseline = ({}, {"build": "old"}, {"id": "before", "status": 4, "complete": True})
            terminal_success = {"id": "new", "status": 4, "complete": True}
            with patch.object(deploy, "verify_azure_context"), \
                 patch.object(deploy, "read_hosted_baseline", return_value=baseline), \
                 patch.object(deploy, "access_token", return_value="token"), \
                 patch.object(deploy, "remote_command", return_value=""), \
                 patch.object(deploy, "stage_and_verify_pension_schema", return_value={"verified": True}), \
                 patch.object(deploy, "post_zip"), \
                 patch.object(deploy, "wait_after_publish", return_value=terminal_success), \
                 patch.object(deploy, "verify_runtime_files", side_effect=deploy.ReleaseError("hash mismatch")), \
                 patch.object(deploy, "run_az") as restart, \
                 patch.object(deploy, "latest_deployment", return_value=terminal_success), \
                 patch.object(deploy, "restore_remote_backup", return_value={"build": "old"}) as restore:
                with self.assertRaises(deploy.ReleaseError):
                    deploy.publish(args)
            restart.assert_not_called()
            restore.assert_called_once()
            result = json.loads((evidence / "release-evidence.json").read_text())
            self.assertFalse(result["controlledRestartIssued"])

    def test_hosted_readiness_retries_until_expected_build(self):
        asset_names = ("index.html", "app.js", "styles.css", "saxo-session.js")
        files = [dict(path="wwwroot/" + name, sha256=hashlib.sha256(name.encode()).hexdigest())
                 for name in asset_names]
        manifest = {"files": files}
        healthy = {"status": "running", "environment": "azure"}
        runtime = {"backend": "azure", "build": "git-" + "a" * 40}
        values = iter([deploy.ReleaseError("starting"), None])
        def fake_app_json(path, **_kwargs):
            attempt = next(values, None)
            if attempt:
                raise attempt
            return (healthy if path == "/health" else runtime), {}
        def fake_request(method, url, **kwargs):
            if url.endswith("/api/accounts"):
                return 401, b"", {}
            for name in asset_names:
                if url.endswith("/" + name):
                    return 200, name.encode(), {}
            return 200, b"", {"Content-Security-Policy": ""}
        with patch.object(deploy, "app_json", side_effect=fake_app_json), \
             patch.object(deploy, "request", side_effect=fake_request), \
             patch.object(deploy, "expected_csp_hashes", return_value=set()), \
             patch.object(deploy, "expected_csp_policy", return_value=""), \
             patch.object(deploy.subprocess, "run", return_value=SimpleNamespace(
                 returncode=0, stdout=json.dumps(dict(mode="Demo", provider="product-demo",
                   aggregateParity=True, anonymousLiveStatus=401, demoLiveStatus=403, financialWrites=0)))), \
             patch.object(deploy.time, "sleep"):
            result = deploy.verify_hosted(Path("unused"), manifest, runtime["build"], Path("."))
        self.assertEqual(result["build"], runtime["build"])

    def test_runtime_hashes_and_node_version_are_verified(self):
        paths = ("Banking.Api.dll", "start-cloud.sh", "runtime/node", "advisor/server.mjs",
                 "advisor/app-tools.mjs", "advisor/banking-context.mjs", "advisor/public/app.js")
        manifest = {'files': [{'path': p, 'sha256': 'a' * 64} for p in paths], 'nodeVersion': '24.19.0'}
        output = '\n'.join('a' * 64 + '  ' + p for p in paths)
        with patch.object(deploy, 'remote_command', side_effect=[output, 'v24.19.0\n']):
            self.assertEqual(len(deploy.verify_runtime_files('token', manifest)), len(paths))
        with patch.object(deploy, 'remote_command', return_value=output.replace('a' * 64, 'b' * 64, 1)):
            with self.assertRaisesRegex(deploy.ReleaseError, 'hashes disagree'):
                deploy.verify_runtime_files('token', manifest)


    def test_readiness_accepts_old_build_then_503_timeouts_then_expected_build_after_180_seconds(self):
        clock = DeploymentClock()
        expected = "git-" + "a" * 40
        seen, evidence, logs = [], {}, io.StringIO()
        def read(method, url, **kwargs):
            timeout = kwargs["timeout"]
            self.assertGreater(timeout, 0)
            self.assertLessEqual(timeout, min(30, 600 - clock.now))
            seen.append((clock.now, url, timeout))
            clock.now += 2
            if 180 <= clock.now < 220:
                return 503, b"private response must not enter evidence", {}
            if 220 <= clock.now < 260:
                clock.now += timeout - 2
                raise deploy.ReleaseError("private timeout detail")
            value = {"status": "running", "environment": "azure"} if url.endswith("/health") else {
                "backend": "azure", "build": "git-" + "b" * 40 if clock.now < 180 else expected,
                "private": "private runtime detail"}
            return 200, json.dumps(value).encode(), {}
        with patch.object(deploy, "request", side_effect=read), \
             patch.object(deploy.time, "monotonic", side_effect=clock.monotonic), \
             patch.object(deploy.time, "sleep", side_effect=clock.sleep), redirect_stderr(logs):
            health, runtime = deploy.wait_for_hosted_runtime(expected, "hosted-readiness", 0, evidence)
        self.assertGreater(clock.now, 260)
        self.assertLess(clock.now, 600)
        self.assertEqual(runtime["build"], expected)
        self.assertEqual(health["environment"], "azure")
        self.assertEqual(evidence["outcome"], "succeeded")
        self.assertEqual(evidence["polls"], evidence["healthReads"])
        self.assertEqual(evidence["lastObservedBuild"], expected)
        self.assertNotIn("private", json.dumps(evidence) + logs.getvalue())
        self.assertTrue(all(deploy.APP_URL in url for _, url, _ in seen))

    def test_readiness_clamps_every_read_and_sleep_to_one_original_deadline(self):
        for scenario in ("timeouts", "last-sleep"):
            with self.subTest(scenario=scenario):
                clock = DeploymentClock()
                if scenario == "last-sleep":
                    clock.now = 599.25
                reads, evidence = [], {}
                def read(_method, url, **kwargs):
                    timeout = kwargs["timeout"]
                    self.assertGreater(timeout, 0)
                    self.assertLessEqual(timeout, min(30, 600 - clock.now))
                    reads.append((clock.now, timeout))
                    if scenario == "timeouts":
                        clock.now += timeout
                        raise deploy.ReleaseError("timeout")
                    value = {"status": "running", "environment": "azure"} if url.endswith("/health") else {"backend": "azure", "build": "git-" + "b" * 40}
                    return 200, json.dumps(value).encode(), {}
                with patch.object(deploy, "request", side_effect=read), \
                     patch.object(deploy.time, "monotonic", side_effect=clock.monotonic), \
                     patch.object(deploy.time, "sleep", side_effect=clock.sleep), redirect_stderr(io.StringIO()):
                    with self.assertRaisesRegex(deploy.ReleaseError, "hosted-readiness.*600"):
                        deploy.wait_for_hosted_runtime("git-" + "a" * 40, "hosted-readiness", 0, evidence)
                self.assertEqual(clock.now, 600)
                self.assertEqual(evidence["elapsedMs"], 600000)
                self.assertEqual(evidence["outcome"], "timed-out")
                self.assertTrue(all(0 < s <= 5 for s in clock.sleeps))
                if scenario == "last-sleep":
                    self.assertEqual(clock.sleeps, [.75])
                    self.assertEqual([timeout for _, timeout in reads], [.75, .75])
                else:
                    self.assertEqual(reads[-1], (595, 5))

    def test_late_valid_health_or_runtime_cannot_pass_readiness(self):
        for late_path in ("/health", "/api/runtime-info"):
            with self.subTest(late_path=late_path):
                clock = DeploymentClock(); clock.now = 599
                evidence, reads = {}, []
                def read(_method, url, **kwargs):
                    self.assertGreater(kwargs["timeout"], 0)
                    self.assertLessEqual(kwargs["timeout"], 600 - clock.now)
                    reads.append(url)
                    if url.endswith(late_path):
                        clock.now = 600.01  # A transport returning after its budget is never success.
                    body = {"status": "running", "environment": "azure"} if url.endswith("/health") else {"backend": "azure", "build": "git-" + "a" * 40}
                    return 200, json.dumps(body).encode(), {}
                with patch.object(deploy, "request", side_effect=read), \
                     patch.object(deploy.time, "monotonic", side_effect=clock.monotonic), \
                     patch.object(deploy.time, "sleep", side_effect=clock.sleep), redirect_stderr(io.StringIO()):
                    with self.assertRaisesRegex(deploy.ReleaseError, "hosted-readiness"):
                        deploy.wait_for_hosted_runtime("git-" + "a" * 40, "hosted-readiness", 0, evidence)
                self.assertEqual(evidence["outcome"], "timed-out")
                self.assertEqual(evidence["lastOutcome"], "late-health-response" if late_path == "/health" else "late-runtime-response")
                self.assertEqual(len(reads), 1 if late_path == "/health" else 2)
                self.assertEqual(clock.sleeps, [])

    def test_readiness_never_accepts_wrong_azure_state_or_unbounded_private_build_text(self):
        for fault in ("status", "environment", "backend", "build", "invalid-json", "json-array"):
            with self.subTest(fault=fault):
                clock, evidence, logs = DeploymentClock(), {}, io.StringIO()
                def read(_method, url, **_kwargs):
                    if url.endswith("/health"):
                        value = {"status": "crashed" if fault == "status" else "running", "environment": "local" if fault == "environment" else "azure"}
                    else:
                        if fault == "invalid-json": return 200, b"private invalid JSON", {}
                        if fault == "json-array": return 200, b"[]", {}
                        value = {"backend": "local" if fault == "backend" else "azure", "build": "private owner token" if fault == "build" else "git-" + "a" * 40}
                    return 200, json.dumps(value).encode(), {}
                with patch.object(deploy, "request", side_effect=read), \
                     patch.object(deploy.time, "monotonic", side_effect=clock.monotonic), \
                     patch.object(deploy.time, "sleep", side_effect=clock.sleep), redirect_stderr(logs):
                    with self.assertRaises(deploy.ReleaseError):
                        deploy.wait_for_hosted_runtime("git-" + "a" * 40, "hosted-readiness", 0, evidence)
                self.assertEqual(evidence["outcome"], "timed-out")
                self.assertNotIn("private", json.dumps(evidence) + logs.getvalue())
                if fault == "build": self.assertNotIn("lastObservedBuild", evidence)

    def test_rollback_keeps_prior_build_and_assets_gate_with_one_restart_and_shared_deadline(self):
        clock, evidence = DeploymentClock(), {}
        expected = "git-" + "b" * 40
        snapshot = dict(previousBuild=expected, sourceSha="a" * 40, rollbackSha256="c" * 64,
                        rollbackLocation="/home/Banking/releases/before-" + "a" * 40 + ".zip",
                        rollbackAssets={"app.js": hashlib.sha256(b"prior asset").hexdigest()})
        def read(_method, url, **kwargs):
            remaining = 612 - clock.now  # restart returns at t=12, not t=0.
            self.assertLessEqual(kwargs["timeout"], remaining)
            if url.endswith("/health"):
                return 200, b'{"status":"running","environment":"azure"}', {}
            if url.endswith("/api/runtime-info"):
                body = {"backend": "azure", "build": expected if clock.now >= 220 else "git-" + "a" * 40}
                return 200, json.dumps(body).encode(), {}
            return 200, b"prior asset" if clock.now >= 300 else b"old asset", {}
        def restart(*_): clock.now += 12
        with patch.object(deploy, "remote_command") as restore, patch.object(deploy, "run_az", side_effect=restart) as restart_call, \
             patch.object(deploy, "request", side_effect=read), \
             patch.object(deploy.time, "monotonic", side_effect=clock.monotonic), \
             patch.object(deploy.time, "sleep", side_effect=clock.sleep), redirect_stderr(io.StringIO()):
            result = deploy.restore_remote_backup("token", snapshot, evidence=evidence)
        restore.assert_called_once(); restart_call.assert_called_once()
        self.assertGreater(clock.now, 180); self.assertLess(clock.now, 612)
        self.assertEqual(result["build"], expected); self.assertEqual(result["assetsVerified"], ["app.js"])
        self.assertIn("rollbackRestartRequestedAt", evidence); self.assertIn("rollbackRestartCompletedAt", evidence)
        self.assertEqual(evidence["rollbackReadiness"]["phase"], "rollback-readiness")
        self.assertGreater(evidence["rollbackReadiness"]["assetReads"], 1)
        self.assertEqual(evidence["rollbackReadiness"]["elapsedMs"], round((clock.now - 12) * 1000))

    def test_rollback_rejects_a_late_matching_asset_and_a_persistent_asset_mismatch(self):
        for fault in ("late", "mismatch"):
            with self.subTest(fault=fault):
                clock, evidence = DeploymentClock(), {}
                if fault == "late": clock.now = 599
                snapshot = {"previousBuild": "git-" + "b" * 40, "rollbackAssets": {"app.js": hashlib.sha256(b"prior").hexdigest()}}
                def read(_method, url, **kwargs):
                    self.assertLessEqual(kwargs["timeout"], 600 - clock.now)
                    if url.endswith("/health"): return 200, b'{"status":"running","environment":"azure"}', {}
                    if url.endswith("/api/runtime-info"): return 200, json.dumps({"backend": "azure", "build": snapshot["previousBuild"]}).encode(), {}
                    if fault == "late": clock.now = 600.01
                    return 200, b"prior" if fault == "late" else b"wrong", {}
                with patch.object(deploy, "request", side_effect=read), \
                     patch.object(deploy.time, "monotonic", side_effect=clock.monotonic), \
                     patch.object(deploy.time, "sleep", side_effect=clock.sleep), redirect_stderr(io.StringIO()):
                    with self.assertRaisesRegex(deploy.ReleaseError, "rollback-readiness.*600"):
                        deploy.verify_rollback(snapshot, readiness_started=0, readiness_evidence=evidence)
                self.assertEqual(evidence["outcome"], "timed-out")
                self.assertEqual(evidence["lastOutcome"], "late-rollback-asset-response" if fault == "late" else "rollback-asset-mismatch")

    def test_persistent_old_build_or_crash_triggers_terminal_rollback_without_extra_upload_or_restart(self):
        for fault in ("old-build", "crash"):
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as temp:
                folder = Path(temp); package, manifest_path, manifest, sha = self.package(folder)
                evidence = folder / "evidence"; evidence.mkdir()
                snapshot = dict(schemaVersion=1, app=deploy.APP, resourceId=deploy.RESOURCE_ID,
                                sourceSha=sha, releaseArchiveSha256=manifest["archive"]["sha256"],
                                artifactDigest="digest", rollbackLocation=f"/home/Banking/releases/before-{sha}.zip",
                                rollbackSha256="c" * 64, previousBuild="git-" + "b" * 40, previousDeploymentId="before")
                (evidence / "rollback-manifest.json").write_text(json.dumps(snapshot))
                args = Namespace(source_sha=sha, package=str(package), manifest=str(manifest_path), artifact_digest="digest", evidence_dir=str(evidence), repo=temp)
                baseline = ({}, {"build": snapshot["previousBuild"]}, {"id": "before", "status": 4, "complete": True})
                terminal = {"id": "new", "status": 4, "complete": True}
                clock = DeploymentClock()
                def restart_request(*_): clock.now += 12
                def read(_method, url, **_kwargs):
                    if fault == "crash": return 503, b"", {}
                    value = {"status": "running", "environment": "azure"} if url.endswith("/health") else {"backend": "azure", "build": snapshot["previousBuild"]}
                    return 200, json.dumps(value).encode(), {}
                with patch.object(deploy, "verify_azure_context"), \
                     patch.object(deploy, "read_hosted_baseline", return_value=baseline), \
                     patch.object(deploy, "access_token", return_value="token"), patch.object(deploy, "remote_command"), \
                     patch.object(deploy, "stage_and_verify_pension_schema", return_value={"verified": True}), \
                     patch.object(deploy, "post_zip") as upload, patch.object(deploy, "wait_after_publish", return_value=terminal), \
                     patch.object(deploy, "verify_runtime_files", return_value={}), patch.object(deploy, "run_az", side_effect=restart_request) as restart, \
                     patch.object(deploy, "request", side_effect=read), patch.object(deploy, "latest_deployment", return_value=terminal), \
                     patch.object(deploy, "restore_remote_backup", return_value={"build": snapshot["previousBuild"]}) as rollback, \
                     patch.object(deploy.time, "monotonic", side_effect=clock.monotonic), \
                     patch.object(deploy.time, "sleep", side_effect=clock.sleep), redirect_stderr(io.StringIO()):
                    with self.assertRaises(deploy.ReleaseError): deploy.publish(args)
                upload.assert_called_once(); restart.assert_called_once(); rollback.assert_called_once()
                result = json.loads((evidence / "release-evidence.json").read_text())
                self.assertEqual(result["rollbackOutcome"], "succeeded")
                self.assertEqual(clock.now, 612)
                self.assertEqual(result["hostedReadiness"]["elapsedMs"], 600000)
                self.assertEqual(result["hostedReadiness"]["phase"], "hosted-readiness")
                self.assertIn("hosted-readiness", result["failureMessage"])
                self.assertTrue(result["controlledRestartIssued"])
                self.assertIn("controlledRestartRequestedAt", result); self.assertIn("controlledRestartCompletedAt", result)

    def test_security_and_asset_gates_remain_mandatory_after_ready_runtime(self):
        names = ("index.html", "app.js", "styles.css", "saxo-session.js")
        manifest = {"files": [dict(path="wwwroot/" + n, sha256=hashlib.sha256(n.encode()).hexdigest()) for n in names]}
        for fault in ("auth", "asset", "csp", "demo"):
            with self.subTest(fault=fault):
                def read(_method, url, **_kwargs):
                    if url.endswith("/health"): return 200, b'{"status":"running","environment":"azure"}', {}
                    if url.endswith("/api/runtime-info"): return 200, json.dumps({"backend": "azure", "build": "git-" + "a" * 40}).encode(), {}
                    if url.endswith("/api/accounts"): return (200 if fault == "auth" else 401), b"", {}
                    for name in names:
                        if url.endswith("/" + name): return 200, b"wrong" if fault == "asset" else name.encode(), {}
                    return 200, b"", {"Content-Security-Policy": "wrong" if fault == "csp" else "expected"}
                with patch.object(deploy, "request", side_effect=read), \
                     patch.object(deploy, "expected_csp_hashes", return_value=set()), patch.object(deploy, "expected_csp_policy", return_value="expected"), \
                     patch.object(deploy.subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout=json.dumps(dict(
                         mode="Live" if fault == "demo" else "Demo", provider="product-demo", aggregateParity=True,
                         anonymousLiveStatus=401, demoLiveStatus=403, financialWrites=0)))), redirect_stderr(io.StringIO()):
                    with self.assertRaises(deploy.ReleaseError):
                        deploy.verify_hosted(Path("unused"), manifest, "git-" + "a" * 40, Path("."))



if __name__ == "__main__":
    unittest.main()
