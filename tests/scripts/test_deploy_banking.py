import hashlib
import http.client
import importlib.util
import io
import json
import shlex
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


class DeployBankingTests(unittest.TestCase):
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
                result = deploy.stage_and_verify_pension_schema(
                    "token", package, sha, manifest["archive"]["sha256"]
                )
            self.assertEqual(result["stagedPath"], f"/home/Banking/releases/{sha}")
            upload.assert_called_once()
            self.assertEqual(upload.call_args.args[:2],
                             ("PUT", f"{deploy.SCM_URL}/api/vfs/Banking/releases/{sha}.zip"))
            self.assertIn("sha256sum -c -", commands[-1])
            self.assertIn("dotnet Banking.Api.dll --verify-pension-schema", commands[-1])
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
                deploy.stage_and_verify_pension_schema(
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
                    deploy.stage_and_verify_pension_schema(
                        "token", package, sha, manifest["archive"]["sha256"]
                    )
            upload.assert_not_called()

    def test_rollback_requires_new_terminal_deployment(self):
        self.assertFalse(deploy.rollback_is_safe("old", None))
        self.assertFalse(deploy.rollback_is_safe("old", {"id": "new", "complete": False}))
        self.assertFalse(deploy.rollback_is_safe("old", {"id": "old", "complete": True}))
        self.assertTrue(deploy.rollback_is_safe("old", {"id": "new", "complete": True}))

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
                self.assertEqual(shlex.split(probe["command"]), ["bash", "-c", "pwd"])
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

    def test_remote_shell_command_preserves_inner_variables_and_quotes(self):
        with patch.object(deploy, "request", return_value=(200, json.dumps(
                {"ExitCode": 0, "Output": "ok"}).encode(), {})) as mocked:
            self.assertEqual(deploy.remote_command("token", 'printf "%s\\n" "$checkdir"'), "ok")
        payload = json.loads(mocked.call_args.args[3])
        self.assertEqual(shlex.split(payload["command"]),
                         ["bash", "-c", 'printf "%s\\n" "$checkdir"'])

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
        def fake_app_json(path):
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


if __name__ == "__main__":
    unittest.main()
