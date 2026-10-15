import hashlib
import importlib.util
import json
from types import SimpleNamespace
import tempfile
import unittest
import urllib.error
from argparse import Namespace
from pathlib import Path
from unittest.mock import patch
import zipfile


MODULE_PATH = Path(__file__).parents[2] / "scripts" / "deploy-banking.py"
SPEC = importlib.util.spec_from_file_location("deploy_banking", MODULE_PATH)
deploy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(deploy)


class DeployBankingTests(unittest.TestCase):
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
            command_results = [f"{backup_digest}  /home/Banking/releases/before-{sha}.zip\n100\n"]
            command_results.extend(["d" * 64 + "  -\n"] * 4)
            with patch.object(deploy, "verify_azure_context"), \
                 patch.object(deploy, "read_hosted_baseline", return_value=({}, previous_runtime, previous_deployment)), \
                 patch.object(deploy, "access_token", return_value="token"), \
                 patch.object(deploy, "remote_command", side_effect=command_results) as remote:
                snapshot = deploy.capture(capture_args)
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
                "webapp", "restart", "--subscription", deploy.SUBSCRIPTION, "--resource-group", deploy.RESOURCE_GROUP,
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
            def wait_terminal(*_):
                order.append("terminal")
                return terminal_success
            def verify_files(*_):
                order.append("files")
                return {"Banking.Api.dll": "hash"}
            def restart(*args):
                order.append("restart")
                self.assertEqual(args, ("webapp", "restart", "--subscription", deploy.SUBSCRIPTION, "--resource-group", deploy.RESOURCE_GROUP,
                                        "--name", deploy.APP, "--output", "none"))
            def hosted(*_args, **_kwargs):
                order.append("hosted")
                return {"health": "running", "build": manifest["build"]}
            with patch.object(deploy, "verify_azure_context"), \
                 patch.object(deploy, "read_hosted_baseline", return_value=baseline), \
                 patch.object(deploy, "access_token", return_value="token"), \
                 patch.object(deploy, "remote_command", return_value=""), \
                 patch.object(deploy, "post_zip"), \
                 patch.object(deploy, "wait_after_publish", side_effect=wait_terminal), \
                 patch.object(deploy, "verify_runtime_files", side_effect=verify_files), \
                 patch.object(deploy, "run_az", side_effect=restart) as restart_mock, \
                 patch.object(deploy, "verify_hosted", side_effect=hosted):
                result = deploy.publish(args)
            self.assertEqual(order, ["terminal", "files", "restart", "hosted"])
            restart_mock.assert_called_once()
            self.assertTrue(result["controlledRestartIssued"])

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
