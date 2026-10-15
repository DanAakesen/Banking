"""Candidate-bound terminal metadata; submission never proves execution."""
import copy
import json
import unittest
from unittest.mock import patch

import test_deploy_banking as fixtures

deploy = fixtures.deploy


class SchemaResultTests(unittest.TestCase):
    def invocation(self):
        with patch.object(deploy.time, "time", return_value=1000):
            return deploy.schema_invocation("a" * 40, "b" * 64)

    def result(self, invocation):
        return {"schemaVersion": 1, "app": deploy.APP, "check": invocation["check"],
                **{key: invocation[key] for key in ("sourceSha", "archiveSha256", "invocationId", "requestedAt", "expiresAt")},
                "startedAt": 1001, "finishedAt": 1005, "state": "completed", "exitCode": 0,
                "scope": ["Demo", "Live"]}

    def test_new_invocations_are_unique_and_paths_are_source_bound_and_private(self):
        first, second = self.invocation(), self.invocation()
        self.assertNotEqual(first["invocationId"], second["invocationId"])
        self.assertNotEqual(first["markerPath"], second["markerPath"])
        self.assertTrue(first["markerPath"].startswith("/home/Banking/releases/.schema-preflight/" + "a" * 40 + "/"))
        self.assertNotIn("wwwroot", first["markerPath"])
        for sha, nonce in (("../escape", "a" * 32), ("a" * 40, "../escape"), ("a" * 40, "A" * 32)):
            with self.subTest(sha=sha, nonce=nonce), self.assertRaises(deploy.ReleaseError):
                deploy.schema_marker_path(sha, nonce)

    def test_only_completed_matching_success_for_both_databases_passes(self):
        invocation = self.invocation()
        result = deploy.validate_schema_result(json.dumps(self.result(invocation)).encode(), invocation, 1006)
        self.assertTrue(result["verified"])
        self.assertEqual(result["scope"], ["Demo", "Live"])

    def test_acceptance_without_completion_times_out(self):
        invocation = self.invocation()
        # The control plane accepted a command, but no private terminal marker ever appeared.
        with patch.object(deploy.time, "time", return_value=1006), \
             patch.object(deploy.time, "monotonic", side_effect=[0, 0, 0, 181]), \
             patch.object(deploy.time, "sleep"):
            with self.assertRaisesRegex(deploy.ReleaseError, "no verified terminal result"):
                deploy.wait_for_schema_result(invocation, lambda _path: None)

    def test_missing_then_completed_is_polled_by_exact_private_path(self):
        invocation = self.invocation()
        data = [None, json.dumps(self.result(invocation)).encode()]
        paths = []
        def read(path):
            paths.append(path)
            return data.pop(0)
        with patch.object(deploy.time, "time", return_value=1006), \
             patch.object(deploy.time, "monotonic", return_value=0), patch.object(deploy.time, "sleep"):
            self.assertTrue(deploy.wait_for_schema_result(invocation, read)["verified"])
        self.assertEqual(paths, [invocation["markerPath"]] * 2)

    def test_bad_path_is_rejected_before_any_private_read(self):
        invocation = self.invocation()
        invocation["markerPath"] = "/home/site/wwwroot/not-a-result.json"
        with patch("builtins.print"), patch.object(deploy, "request") as request:
            with self.assertRaises(deploy.ReleaseError):
                deploy.wait_for_schema_result(invocation, request)
        request.assert_not_called()

    def test_result_arriving_after_wait_deadline_is_not_accepted(self):
        invocation = self.invocation()
        with patch.object(deploy.time, "time", return_value=1006), \
             patch.object(deploy.time, "monotonic", side_effect=[0, 0, 181]):
            with self.assertRaisesRegex(deploy.ReleaseError, "no verified terminal result"):
                deploy.wait_for_schema_result(invocation, lambda _path: json.dumps(self.result(invocation)).encode())

    def test_failure_unknown_inflight_stale_or_mismatched_markers_fail_closed(self):
        invocation = self.invocation()
        changes = [("exitCode", 2), ("exitCode", False), ("state", "accepted"), ("state", "running"),
                   ("state", "unknown"), ("sourceSha", "c" * 40), ("archiveSha256", "d" * 64),
                   ("invocationId", "e" * 32), ("requestedAt", 999), ("expiresAt", 1300),
                   ("startedAt", 900), ("startedAt", 1007), ("finishedAt", 1200),
                   ("scope", ["Demo"]), ("check", "marker"), ("app", "another-app"), ("schemaVersion", True)]
        for key, value in changes:
            with self.subTest(key=key, value=value):
                result = self.result(invocation)
                result[key] = value
                with self.assertRaises(deploy.ReleaseError):
                    deploy.validate_schema_result(json.dumps(result).encode(), invocation, 1006)
        with self.assertRaises(deploy.ReleaseError):
            deploy.validate_schema_result(json.dumps(self.result(invocation)).encode(), invocation, 1181)
        changed = copy.deepcopy(invocation)
        changed["markerPath"] = "/home/site/wwwroot/result.json"
        with self.assertRaises(deploy.ReleaseError):
            deploy.validate_schema_result(json.dumps(self.result(invocation)).encode(), changed, 1006)

    def test_malformed_excessive_or_extra_private_content_is_never_echoed(self):
        invocation = self.invocation()
        extra = self.result(invocation)
        extra["private"] = "PRIVATE_MARKER_DETAIL"
        for raw in (b"PRIVATE_MARKER_DETAIL", b"x" * 4097, json.dumps(extra).encode()):
            with self.subTest(length=len(raw)), self.assertRaises(deploy.ReleaseError) as caught:
                deploy.validate_schema_result(raw, invocation, 1006)
            self.assertNotIn("PRIVATE_MARKER_DETAIL", str(caught.exception))
