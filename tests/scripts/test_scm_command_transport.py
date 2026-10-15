"""Exercise Kudu's .NET Arguments parser and exec wrapper, not a POSIX parser imitation."""
import io
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile
import unittest
from argparse import Namespace
from contextlib import redirect_stderr, redirect_stdout
from unittest.mock import patch

import test_deploy_banking as fixtures

deploy = fixtures.deploy
ROOT = Path(__file__).parents[2]


@unittest.skipUnless(sys.platform.startswith("linux"), "The deployed Kudu transport runs on Linux")
class ScmCommandTransportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="banking-scm-harness-")
        cls.addClassCleanup(cls.temp.cleanup)
        cls.dotnet = shutil.which("dotnet")
        if not cls.dotnet:
            raise RuntimeError(".NET SDK is required for the real SCM transport regression")
        project = ROOT / "tests/ScmCommandTransport/ScmCommandTransport.csproj"
        for command in ([cls.dotnet, "restore", str(project), "--locked-mode"],
                        [cls.dotnet, "build", str(project), "--no-restore", "-c", "Release", "-o", cls.temp.name]):
            subprocess.run(command, check=True, capture_output=True, text=True, timeout=120)
        cls.harness = str(Path(cls.temp.name) / "ScmCommandTransport.dll")

    def payload(self, command):
        with patch.object(deploy, "request", return_value=(200, b'{"ExitCode":0,"Output":""}', {})) as sent:
            deploy.remote_command("synthetic-token", command)
        return json.loads(sent.call_args.args[3])

    def execute(self, payload, directory, *, argv_only=False, env=None):
        payload = dict(payload, dir=str(directory), argvOnly=argv_only)
        result = subprocess.run([self.dotnet, self.harness], input=json.dumps(payload),
                                capture_output=True, text=True, check=True, timeout=30, env=env)
        return json.loads(result.stdout)

    def test_real_dotnet_arguments_preserve_script_bytes(self):
        scripts = ["", "pwd", "set -e; printf '%s' \"$checkdir\"",
                   "quotes: 'single' \"double\"; $x $(touch injected) `touch injected`",
                   "backslashes \\\\" + '"' + " and trailing \\",
                   "first\nsecond\r\nthird\tfourth", "unicode: æøå 漢字", "ending quote\"",
                   "one\\two\\\\three\\\\\\\"four"]
        with tempfile.TemporaryDirectory() as temp:
            for script in scripts:
                with self.subTest(script=script):
                    result = self.execute(self.payload(script), temp, argv_only=True)
                    self.assertEqual(result["ExitCode"], 0)
                    self.assertEqual(json.loads(result["Output"]), ["bash", "-c", script])
            self.assertFalse((Path(temp) / "injected").exists())

    def test_legacy_single_quotes_fail_but_new_transport_executes_compound_script(self):
        script = 'set -e; value=PROBE_OK; printf "%s\\n" "$value"'
        with tempfile.TemporaryDirectory() as temp:
            legacy = self.execute({"command": "bash -c " + shlex.quote(script)}, temp)
            current = self.execute(self.payload(script), temp)
            literal = '$HOME $(touch injected) `touch injected` "double" \'single\' \\\nsecond line'
            quoted = self.execute(self.payload("set -e\nvalue=" + shlex.quote(literal) + '\nprintf "%s" "$value"'), temp)
            self.assertEqual((quoted["ExitCode"], quoted["Output"]), (0, literal))
            self.assertFalse((Path(temp) / "injected").exists())
        self.assertEqual(legacy["ExitCode"], 2)
        self.assertEqual((current["ExitCode"], current["Output"]), (0, "PROBE_OK\n"))

    def test_actual_backup_reuse_and_staging_commands_execute_through_dotnet(self):
        with tempfile.TemporaryDirectory(prefix="scm-transport-") as temp:
            root = Path(temp)
            home = root / "home"
            wwwroot = home / "site/wwwroot"
            (wwwroot / "wwwroot").mkdir(parents=True)
            original = {"Banking.Api.dll": b"synthetic-prior-code"}
            for name in ("index.html", "app.js", "styles.css", "saxo-session.js"):
                original["wwwroot/" + name] = ("synthetic " + name).encode()
            for name, content in original.items():
                (wwwroot / name).write_bytes(content)
            package, manifest_path, manifest, sha = fixtures.DeployBankingTests().package(root)
            env = dict(os.environ)
            calls = []

            def kudu(method, url, token=None, body=None, *args, **kwargs):
                self.assertEqual(token, "synthetic-token")
                if method == "PUT":
                    self.assertEqual(url, deploy.SCM_URL + f"/api/vfs/Banking/releases/{sha}.zip")
                    (home / f"Banking/releases/{sha}.zip").write_bytes(body)
                    return 201, b"", {}
                self.assertEqual((method, url), ("POST", deploy.SCM_URL + "/api/command"))
                payload = json.loads(body)
                calls.append(payload["command"])
                # Only fixed fixture paths are remapped; commands and .NET encoding remain unchanged.
                probe = payload["command"] == "bash -c pwd"
                payload["command"] = payload["command"].replace("/home/", str(home) + "/")
                result = self.execute(payload, home, env=env)
                if probe and result["ExitCode"] == 0:
                    self.assertEqual(result["Output"], str(home) + "\n")
                    result["Output"] = "/home\n"
                return 200, json.dumps(result).encode(), {}

            with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()), \
                 patch.object(deploy, "verify_azure_context"), \
                 patch.object(deploy, "read_hosted_baseline", return_value=({}, {"build":"old"}, {"id":"before","status":4})), \
                 patch.object(deploy, "access_token", return_value="synthetic-token"), \
                 patch.object(deploy, "request", side_effect=kudu):
                for index in range(2):
                    snapshot = deploy.capture(Namespace(package=str(package), manifest=str(manifest_path),
                        source_sha=sha, evidence_dir=str(root / ("evidence-" + str(index))), artifact_digest="synthetic"))
                    backup = home / f"Banking/releases/before-{sha}.zip"
                    self.assertEqual(snapshot["rollbackSha256"], deploy.sha256_file(backup))
                    self.assertEqual(snapshot["rollbackSize"], backup.stat().st_size)
                    self.assertEqual(len(snapshot["rollbackAssets"]), 4)
                for _ in range(2):
                    stage = deploy.stage_pension_candidate("synthetic-token", package, sha, manifest["archive"]["sha256"])
                    self.assertEqual(stage["archiveSha256"], manifest["archive"]["sha256"])
                self.assertTrue((home / f"Banking/releases/{sha}/Banking.Api.dll").exists())
            self.assertTrue(any("trap" in command and "$checkdir" in command for command in calls))
            for name, content in original.items():
                self.assertEqual((wwwroot / name).read_bytes(), content)
