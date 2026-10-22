#!/usr/bin/env python3
"""Entra-authenticated, code-only deployment to the existing Banking App Service."""

from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import os
import re
import secrets
import socket
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SUBSCRIPTION = "0ac7d719-89bc-4100-be87-a79d33e953a7"
TENANT = "802efa29-17f2-4a79-8f5f-38f087aed96a"
RESOURCE_GROUP = "rg-banking-prod-weu"
APP = "banking-dan-0ac7d719"
RESOURCE_ID = (
    f"/subscriptions/{SUBSCRIPTION}/resourceGroups/{RESOURCE_GROUP}"
    f"/providers/Microsoft.Web/sites/{APP}"
)
APP_URL = f"https://{APP}.azurewebsites.net"
SCM_URL = f"https://{APP}.scm.azurewebsites.net"
MAX_SITE_ZIP = 512 * 1024 * 1024
POLL_SECONDS = 5
DEPLOY_TIMEOUT_SECONDS = 900
HOSTED_READINESS_SECONDS = 600
HOSTED_PROBE_SECONDS = 30
SCHEMA_RESULT_TTL_SECONDS = 180
# Fixed early CLI exit contract. No provider/SQL text is captured by the launcher.
SCHEMA_GATE_FAILURES = {
    base + suffix: (scope, stage, category)
    for base, scope in ((100, "Demo"), (110, "Live"))
    for suffix, stage, category in (
        (1, "configuration", "configuration-invalid"),
        (2, "connection", "connection-unavailable"),
        (3, "query", "schema-missing"),
        (4, "query", "query-unavailable"),
        (5, "configuration", "deadline-cancelled"),
        (6, "connection", "deadline-cancelled"),
        (7, "query", "deadline-cancelled"),
    )
}
CAPTURE_PHASES = frozenset({
    "capture-artifact", "capture-azure-context", "capture-baseline", "capture-token",
    "capture-scm-probe", "capture-backup", "capture-assets", "capture-evidence",
})
CURRENT_PHASE = ContextVar("release_phase", default="release")


class ReleaseError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def diagnostic(event: str, **fields: Any) -> None:
    # Callers supply fixed labels and numeric timing/status only, never remote text.
    print(json.dumps({"event": event, "phase": CURRENT_PHASE.get(), "at": utc_now(),
                      **fields}, sort_keys=True), file=sys.stderr, flush=True)


@contextmanager
def capture_phase(label: str):
    if label not in CAPTURE_PHASES:
        raise ReleaseError("Unknown capture phase.")
    previous = CURRENT_PHASE.set(label)
    started = time.monotonic()
    diagnostic("release-phase", outcome="started")
    try:
        yield
    except Exception:
        diagnostic("release-phase", outcome="failed",
                   elapsedMs=round((time.monotonic() - started) * 1000))
        raise
    else:
        diagnostic("release-phase", outcome="succeeded",
                   elapsedMs=round((time.monotonic() - started) * 1000))
    finally:
        CURRENT_PHASE.reset(previous)


def endpoint_label(parsed: urllib.parse.ParseResult) -> str:
    # No raw URL, query, path, headers or command may enter diagnostic evidence.
    if parsed.netloc == f"{APP}.scm.azurewebsites.net":
        return {"/api/command": "scm-command", "/exec/execute": "main-container-execute",
                "/api/deployments/latest": "scm-latest-deployment",
                "/api/zipdeploy": "scm-zipdeploy"}.get(parsed.path, "scm-other")
    return {"/health": "app-health", "/api/runtime-info": "app-runtime"}.get(parsed.path, "app-other")


def network_category(error: BaseException) -> str:
    reason = error.reason if isinstance(error, urllib.error.URLError) else error
    if isinstance(reason, TimeoutError):
        return "timeout"
    if isinstance(reason, ssl.SSLError):
        return "tls"
    if isinstance(reason, socket.gaierror):
        return "dns"
    if isinstance(reason, ConnectionError):
        return "connection"
    if isinstance(reason, http.client.HTTPException):
        return "protocol"
    return "network"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def require_sha(value: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{40}", value):
        raise ReleaseError("The source SHA must be a full lowercase Git commit SHA.")
    return value


def schema_invocation(source_sha: str, archive_sha256: str, check: str = "schema") -> dict[str, Any]:
    """Private result contract; submitting a command never establishes completion."""
    require_sha(source_sha)
    if check not in {"marker", "schema"} or not re.fullmatch(r"[0-9a-f]{64}", archive_sha256):
        raise ReleaseError("Schema invocation archive checksum is invalid.")
    invocation = secrets.token_hex(16)
    issued = int(time.time())
    return {"app": APP, "scope": ["Demo", "Live"], "check": check,
            "sourceSha": source_sha, "archiveSha256": archive_sha256,
            "invocationId": invocation, "requestedAt": issued,
            "expiresAt": issued + SCHEMA_RESULT_TTL_SECONDS,
            "markerPath": schema_marker_path(source_sha, invocation)}


def schema_marker_path(source_sha: str, invocation_id: str) -> str:
    require_sha(source_sha)
    if not re.fullmatch(r"[0-9a-f]{32}", invocation_id):
        raise ReleaseError("Schema invocation identity is invalid.")
    return f"/home/Banking/releases/.schema-preflight/{source_sha}/{invocation_id}/result.json"


def validate_schema_invocation(invocation: dict[str, Any]) -> None:
    try:
        if (not isinstance(invocation, dict) or set(invocation) !=
            {"app", "scope", "check", "sourceSha", "archiveSha256", "invocationId", "requestedAt", "expiresAt", "markerPath"}
            or invocation["app"] != APP or invocation["scope"] != ["Demo", "Live"]
            or invocation["check"] not in {"marker", "schema"}
            or not all(isinstance(invocation[key], str) for key in ("sourceSha", "archiveSha256", "invocationId", "markerPath"))
            or not re.fullmatch(r"[0-9a-f]{64}", invocation["archiveSha256"])
            or invocation["markerPath"] != schema_marker_path(invocation["sourceSha"], invocation["invocationId"])
            or type(invocation["requestedAt"]) is not int or type(invocation["expiresAt"]) is not int
            or invocation["requestedAt"] < 0
            or invocation["expiresAt"] - invocation["requestedAt"] != SCHEMA_RESULT_TTL_SECONDS):
            raise ValueError()
    except (ValueError, TypeError, KeyError, ReleaseError):
        raise ReleaseError("Schema invocation binding is invalid.") from None


def validate_schema_result(raw: bytes, invocation: dict[str, Any], now: int,
                           *, require_success: bool = True) -> dict[str, Any]:
    """Accept bounded terminal metadata only. Never echo marker contents or exceptions."""
    validate_schema_invocation(invocation)
    try:
        if not raw or len(raw) > 4096:
            raise ValueError()
        result = json.loads(raw)
        expected = {"schemaVersion", "app", "check", "sourceSha", "archiveSha256", "invocationId", "requestedAt",
                    "expiresAt", "startedAt", "finishedAt", "state", "exitCode", "scope"}
        if not isinstance(result, dict) or set(result) != expected:
            raise ValueError()
        if (type(result["schemaVersion"]) is not int or result["schemaVersion"] != 1
            or result["app"] != APP or result["scope"] != ["Demo", "Live"] or result["check"] != invocation["check"]
            or any(result[key] != invocation[key] for key in
                   ("sourceSha", "archiveSha256", "invocationId", "requestedAt", "expiresAt"))
            or any(type(result[key]) is not int for key in
                   ("requestedAt", "expiresAt", "startedAt", "finishedAt", "exitCode"))
            or not invocation["requestedAt"] - 30 <= result["startedAt"] <= result["finishedAt"] <= invocation["expiresAt"]
            or not invocation["requestedAt"] - 30 <= now <= invocation["expiresAt"]
            or result["finishedAt"] > now + 30
            or result["state"] != "completed" or not 0 <= result["exitCode"] <= 255
            or (require_success and result["exitCode"] != 0)):
            raise ValueError()
    except (ValueError, TypeError, KeyError, UnicodeDecodeError):
        raise ReleaseError("Schema result is invalid, stale, incomplete or unsuccessful.") from None
    evidence = {"verified": result["exitCode"] == 0, "completed": True,
                "check": invocation["check"], "exitCode": result["exitCode"], "sourceSha": invocation["sourceSha"],
                "archiveSha256": invocation["archiveSha256"], "invocationId": invocation["invocationId"],
                "scope": ["Demo", "Live"], "finishedAt": result["finishedAt"]}
    failure = SCHEMA_GATE_FAILURES.get(result["exitCode"]) if invocation["check"] == "schema" else None
    if failure is not None:
        evidence.update(failedScope=failure[0], failedStage=failure[1], failureCategory=failure[2])
    return evidence


def wait_for_schema_result(invocation: dict[str, Any], read_metadata,
                           *, require_success: bool = True) -> dict[str, Any]:
    """Adapter-independent polling: accepted/inflight/missing can never pass a release."""
    validate_schema_invocation(invocation)
    deadline = time.monotonic() + SCHEMA_RESULT_TTL_SECONDS
    while time.monotonic() < deadline and time.time() <= invocation["expiresAt"]:
        raw = read_metadata(invocation["markerPath"])
        if time.monotonic() >= deadline:
            break
        if raw is not None:
            return validate_schema_result(raw, invocation, int(time.time()), require_success=require_success)
        time.sleep(POLL_SECONDS)
    raise ReleaseError("Schema command has no verified terminal result before its deadline.")


def run_az(*args: str) -> str:
    try:
        result = subprocess.run(
            ["az", *args], check=False, capture_output=True, text=True, timeout=120
        )
    except (OSError, subprocess.TimeoutExpired):
        raise ReleaseError("Azure CLI is unavailable or did not finish; output was suppressed.") from None
    if result.returncode:
        # Azure CLI errors can contain account or service details. Do not echo its output.
        raise ReleaseError("Azure CLI command failed; output was suppressed.")
    return result.stdout.strip()


def access_token() -> str:
    token = run_az(
        "account", "get-access-token", "--subscription", SUBSCRIPTION,
        "--resource", "https://management.azure.com/", "--query", "accessToken",
        "--output", "tsv",
    )
    if not token or "\n" in token:
        raise ReleaseError("Azure did not provide a usable Entra access token.")
    return token


def verify_azure_context() -> dict[str, Any]:
    subscription = run_az("account", "show", "--query", "id", "--output", "tsv")
    tenant = run_az("account", "show", "--query", "tenantId", "--output", "tsv")
    if subscription.lower() != SUBSCRIPTION.lower() or tenant.lower() != TENANT.lower():
        raise ReleaseError("Azure login is not scoped to the expected Banking tenant/subscription.")
    raw = run_az(
        "webapp", "show", "--resource-group", RESOURCE_GROUP, "--name", APP,
        "--query", "{id:id,name:name,resourceGroup:resourceGroup,kind:kind,state:state,hostNames:hostNames}",
        "--output", "json",
    )
    try:
        site = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ReleaseError("Azure returned invalid App Service metadata.") from exc
    if (
        str(site.get("id", "")).rstrip("/").lower() != RESOURCE_ID.lower()
        or site.get("name") != APP
        or site.get("resourceGroup", "").lower() != RESOURCE_GROUP.lower()
        or "linux" not in str(site.get("kind", "")).lower()
        or f"{APP}.azurewebsites.net" not in site.get("hostNames", [])
    ):
        raise ReleaseError("Azure App Service identity does not match the fixed Banking target.")
    return site


def request(
    method: str,
    url: str,
    token: str | None = None,
    body: bytes | None = None,
    content_type: str | None = None,
    timeout: float = 90,
    max_bytes: int = MAX_SITE_ZIP,
    allow_http_error: bool = False,
) -> tuple[int, bytes, Any]:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.netloc not in {f"{APP}.azurewebsites.net", f"{APP}.scm.azurewebsites.net"}:
        raise ReleaseError("Request target is outside the fixed Banking App Service hosts.")
    if token and parsed.netloc != f"{APP}.scm.azurewebsites.net":
        raise ReleaseError("The deployment bearer token is restricted to the SCM host.")
    headers = {"Accept": "application/json, application/zip, */*"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if content_type:
        headers["Content-Type"] = content_type
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    endpoint = endpoint_label(parsed)
    started = time.monotonic()
    diagnostic("app-service-request", endpoint=endpoint, outcome="started", timeoutSeconds=timeout)

    def finish(outcome: str, category: str, status: int | None = None) -> None:
        safe_status = status if type(status) is int and 100 <= status <= 599 else None
        diagnostic("app-service-request", endpoint=endpoint, outcome=outcome, category=category,
                   httpStatus=safe_status, elapsedMs=round((time.monotonic() - started) * 1000),
                   timeoutSeconds=timeout)

    try:
        with urllib.request.build_opener(_NoRedirect()).open(req, timeout=timeout) as response:
            content_length = response.headers.get("Content-Length")
            if content_length and int(content_length) > max_bytes:
                raise ReleaseError("App Service response exceeded the configured size bound.")
            data = response.read(max_bytes + 1)
            if len(data) > max_bytes:
                raise ReleaseError("App Service response exceeded the configured size bound.")
            finish("succeeded", "http", response.status)
            return response.status, data, response.headers
    except urllib.error.HTTPError as exc:
        # Do not emit response bodies: Kudu deployment logs can contain application detail.
        status = exc.code if type(exc.code) is int and 100 <= exc.code <= 599 else None
        if allow_http_error:
            finish("allowed", "http", status)
            return exc.code, b"", exc.headers
        if status is not None and 300 <= status < 400:
            finish("failed", "redirect-refused", status)
            raise ReleaseError(f"App Service redirect was refused ({endpoint}).") from None
        finish("failed", "http", status)
        raise ReleaseError(f"App Service request failed with HTTP {status or 'unknown'} ({endpoint}).") from None
    except (urllib.error.URLError, OSError, http.client.HTTPException) as exc:
        category = network_category(exc)
        finish("failed", category)
        raise ReleaseError(f"App Service request failed ({endpoint}; {category}); details suppressed.") from None
    except ValueError:
        finish("failed", "invalid-response")
        raise ReleaseError(f"App Service response was invalid ({endpoint}); details suppressed.") from None
    except ReleaseError:
        finish("failed", "response-bound")
        raise


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def get_json(url: str, token: str | None = None) -> dict[str, Any]:
    status, data, _ = request("GET", url, token, max_bytes=4 * 1024 * 1024)
    if status != 200:
        raise ReleaseError(f"App Service read returned HTTP {status}.")
    try:
        value = json.loads(data)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ReleaseError("App Service returned invalid JSON.") from exc
    if not isinstance(value, dict):
        raise ReleaseError("App Service returned an unexpected response shape.")
    return value


def app_json(path: str, *, timeout_seconds: float = 90) -> tuple[dict[str, Any], Any]:
    status, data, headers = request("GET", APP_URL + path, timeout=timeout_seconds, max_bytes=4 * 1024 * 1024)
    if status != 200:
        raise ReleaseError(f"Hosted read-only check {path} returned HTTP {status}.")
    try:
        value = json.loads(data)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ReleaseError(f"Hosted read-only check {path} returned invalid JSON.") from exc
    if not isinstance(value, dict):
        raise ReleaseError(f"Hosted read-only check {path} returned an unexpected response.")
    return value, headers


def remote_command(token: str, command: str) -> str:
    # Kudu parses ProcessStartInfo.Arguments with .NET/CRT double-quote rules,
    # then starter.sh execs argv directly. POSIX shlex.quote loses compound commands.
    # list2cmdline preserves the entire script as one argument, without outer-shell expansion.
    payload = json.dumps({"command": "bash -c " + subprocess.list2cmdline([command]), "dir": "/home"}).encode()
    status, data, _ = request(
        "POST", SCM_URL + "/api/command", token, payload,
        "application/json", timeout=180, max_bytes=4 * 1024 * 1024,
    )
    if status not in (200, 201, 202):
        raise ReleaseError(f"SCM command returned HTTP {status}.")
    try:
        result = json.loads(data)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ReleaseError("SCM command returned an invalid response.") from exc
    if not isinstance(result, dict) or result.get("ExitCode") != 0:
        raise ReleaseError("SCM command failed; remote output was suppressed.")
    output = result.get("Output", "")
    return output if isinstance(output, str) else ""


def latest_deployment(token: str, *, timeout_seconds: float = 90) -> dict[str, Any]:
    # Only this deployment-status endpoint may return HTTP 202 while work is in progress.
    status, data, _ = request("GET", SCM_URL + "/api/deployments/latest", token,
                             timeout=min(90, timeout_seconds), max_bytes=4 * 1024 * 1024)
    if status not in (200, 202):
        raise ReleaseError(f"SCM deployment-status read returned HTTP {status}.")
    try:
        deployment = json.loads(data)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ReleaseError("SCM deployment status returned invalid JSON.") from None
    if not isinstance(deployment, dict):
        raise ReleaseError("SCM deployment status returned an unexpected response shape.")
    if not isinstance(deployment.get("id"), str) or not deployment["id"].strip():
        raise ReleaseError("SCM did not identify the latest deployment.")
    if status == 202:
        # HTTP acceptance/in-progress can never establish terminal success or permit rollback.
        deployment["complete"] = False
    return deployment


def is_terminal(deployment: dict[str, Any]) -> bool:
    return deployment.get("complete") is True


def is_success(deployment: dict[str, Any]) -> bool:
    try:
        return is_terminal(deployment) and int(deployment.get("status")) == 4
    except (TypeError, ValueError):
        return False


def rollback_is_safe(previous_id: str, latest: dict[str, Any] | None) -> bool:
    """Never start another deploy while the latest deployment is unknown or in progress."""
    return bool(
        latest
        and latest.get("id")
        and latest.get("id") != previous_id
        and is_terminal(latest)
    )


def wait_for_deployment(token: str, previous_id: str, timeout_seconds: int = DEPLOY_TIMEOUT_SECONDS) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_seconds
    latest: dict[str, Any] | None = None
    while (remaining := deadline - time.monotonic()) > 0:
        latest = latest_deployment(token, timeout_seconds=remaining)
        if time.monotonic() >= deadline:
            break
        if latest.get("id") != previous_id and is_terminal(latest):
            return latest
        time.sleep(min(POLL_SECONDS, max(0, deadline - time.monotonic())))
    raise ReleaseError("Deployment did not reach a terminal state before the timeout.")


def verify_manifest(package: Path, manifest_path: Path, source_sha: str) -> dict[str, Any]:
    require_sha(source_sha)
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ReleaseError("Release manifest is missing or invalid.") from exc
    if (
        manifest.get("schemaVersion") != 1
        or manifest.get("sourceSha") != source_sha
        or manifest.get("build") != f"git-{source_sha}"
        or manifest.get("archive", {}).get("name") != "banking-release.zip"
    ):
        raise ReleaseError("Release manifest does not match the requested source SHA.")
    archive = manifest["archive"]
    if not package.is_file() or package.name != "banking-release.zip":
        raise ReleaseError("Release package is missing or has an unexpected name.")
    if package.stat().st_size != archive.get("size") or sha256_file(package) != archive.get("sha256"):
        raise ReleaseError("Release package checksum does not match its manifest.")
    files = manifest.get("files")
    if not isinstance(files, list):
        raise ReleaseError("Release manifest has no per-file inventory.")
    seen: set[str] = set()
    for entry in files:
        path = entry.get("path") if isinstance(entry, dict) else None
        if not isinstance(path, str) or not path or path.startswith("/") or ".." in Path(path).parts:
            raise ReleaseError("Release manifest contains an unsafe file path.")
        if path in seen or not re.fullmatch(r"[0-9a-f]{64}", str(entry.get("sha256", ""))):
            raise ReleaseError("Release manifest contains duplicate or invalid file hashes.")
        seen.add(path)
    with zipfile.ZipFile(package) as archive_file:
        bad = archive_file.testzip()
        if bad:
            raise ReleaseError("Release archive failed its integrity check.")
        names = archive_file.namelist()
        if any(".." in Path(name).parts or name.startswith("/") for name in names):
            raise ReleaseError("Release archive contains an unsafe path.")
        if not any(name.endswith("/Banking.Api.dll") or name == "Banking.Api.dll" for name in names):
            raise ReleaseError("Release archive does not contain the Banking API.")
        archived_files = {name for name in names if not name.endswith("/")}
        expected_files = {entry["path"] for entry in files}
        if archived_files != expected_files or len(archived_files) != len(names):
            raise ReleaseError("Release archive files do not match the per-file manifest.")
        for entry in files:
            content = archive_file.read(entry["path"])
            if len(content) != entry.get("size") or hashlib.sha256(content).hexdigest() != entry["sha256"]:
                raise ReleaseError("Release archive contains a file that disagrees with the manifest.")
    return manifest


def read_hosted_baseline() -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    health, _ = app_json("/health")
    runtime, _ = app_json("/api/runtime-info")
    if health.get("status") != "running" or health.get("environment") != "azure":
        raise ReleaseError("Current hosted health response is not the expected Azure app.")
    if runtime.get("backend") != "azure" or not runtime.get("build"):
        raise ReleaseError("Current runtime identity is missing or is not the Azure backend.")
    token = access_token()
    deployment = latest_deployment(token)
    if not is_success(deployment):
        raise ReleaseError("Current SCM deployment is not known to be complete and successful.")
    return health, runtime, deployment


def capture(args: argparse.Namespace) -> dict[str, Any]:
    with capture_phase("capture-artifact"):
        manifest = verify_manifest(Path(args.package), Path(args.manifest), args.source_sha)
    with capture_phase("capture-azure-context"):
        verify_azure_context()
    with capture_phase("capture-baseline"):
        _, runtime, deployment = read_hosted_baseline()
    with capture_phase("capture-token"):
        token = access_token()
    evidence_dir = Path(args.evidence_dir)
    evidence_dir.mkdir(parents=True, exist_ok=False)
    with capture_phase("capture-scm-probe"):
        if remote_command(token, "pwd").strip() != "/home":
            raise ReleaseError("SCM read-only probe did not confirm its fixed working directory.")
    remote_path = f"/home/Banking/releases/before-{args.source_sha}.zip"
    command = (
        "set -e; mkdir -p /home/Banking/releases; "
        "cd /home/site/wwwroot; "
        f"if test -e {remote_path}; then "
        f"test -f {remote_path}; test ! -L {remote_path}; "
        "checkdir=$(mktemp -d /home/Banking/releases/backup-check-XXXXXX); "
        "trap 'rm -rf -- \"$checkdir\"' EXIT; "
        f"unzip -oq {remote_path} -d \"$checkdir\"; "
        "diff -qr /home/site/wwwroot \"$checkdir\" >/dev/null; "
        "rm -rf -- \"$checkdir\"; "
        "trap - EXIT; "
        "else "
        f"zip -qr {remote_path} .; "
        "fi; "
        f"zip -T {remote_path} >/dev/null; "
        f"sha256sum {remote_path}; stat -c %s {remote_path}"
    )
    with capture_phase("capture-backup"):
        output = remote_command(token, command)
        hashes = re.findall(r"\b([0-9a-f]{64})\s+", output)
        sizes = re.findall(r"(?:^|\n)(\d+)(?:\n|$)", output)
        if not hashes or not sizes:
            raise ReleaseError("SCM did not return rollback checksum and size evidence.")
        rollback_hash = hashes[0]
        rollback_size = int(sizes[0])
        if rollback_size <= 0 or rollback_size > MAX_SITE_ZIP:
            raise ReleaseError("Remote rollback archive is empty or exceeds the size bound.")
    asset_hashes: dict[str, str] = {}
    with capture_phase("capture-assets"):
        for asset in ("index.html", "app.js", "styles.css", "saxo-session.js"):
            output = remote_command(token, f"set -eo pipefail; unzip -p {remote_path} wwwroot/{asset} | sha256sum")
            match = re.search(r"\b([0-9a-f]{64})\s+", output)
            if match:
                asset_hashes[asset] = match.group(1)
    snapshot = {
        "schemaVersion": 1,
        "app": APP,
        "resourceId": RESOURCE_ID,
        "sourceSha": args.source_sha,
        "releaseArchiveSha256": manifest["archive"]["sha256"],
        "artifactDigest": args.artifact_digest,
        "previousBuild": runtime["build"],
        "previousDeploymentId": deployment["id"],
        "previousDeploymentStatus": deployment.get("status"),
        "rollbackLocation": remote_path,
        "rollbackSha256": rollback_hash,
        "rollbackSize": rollback_size,
        "rollbackAssets": asset_hashes,
        "capturedAt": utc_now(),
    }
    with capture_phase("capture-evidence"):
        (evidence_dir / "rollback-manifest.json").write_text(
            json.dumps(snapshot, indent=2) + "\n", encoding="utf-8"
        )
    print(json.dumps({key: snapshot[key] for key in (
        "app", "sourceSha", "previousBuild", "previousDeploymentId",
        "rollbackLocation", "rollbackSha256", "rollbackSize", "capturedAt",
    )}, sort_keys=True))
    return snapshot


def expected_asset_files(manifest: dict[str, Any]) -> dict[str, str]:
    wanted = ("index.html", "app.js", "styles.css", "saxo-session.js")
    found: dict[str, str] = {}
    for entry in manifest["files"]:
        path = entry["path"].replace("\\", "/")
        for filename in wanted:
            if path.endswith(f"wwwroot/{filename}"):
                found[filename] = entry["sha256"]
    missing = set(wanted) - found.keys()
    if missing:
        raise ReleaseError("Release manifest is missing a required hosted asset.")
    return found


def expected_csp_policy(repo: Path) -> str:
    sources = [
        repo / "src/Banking.Api/Security/LocalSecurity.cs",
        repo / "tools/frontend-host/Program.cs",
    ]
    patterns = [r'Headers\["Content-Security-Policy"\] = "([^"]+)"',
                r'MainContentSecurityPolicy = "([^"]+)"']
    values: list[str] = []
    for source, pattern in zip(sources, patterns):
        try:
            content = source.read_text(encoding="utf-8-sig")
        except OSError as exc:
            raise ReleaseError("Expected CSP source file is missing from the release checkout.") from exc
        match = re.search(pattern, content)
        if not match:
            raise ReleaseError("Expected CSP source policy was not found.")
        values.append(match.group(1))
    if values[0] != values[1]:
        raise ReleaseError("Backend and frontend-host CSP policies disagree in the source checkout.")
    return values[0]


def expected_csp_hashes(repo: Path) -> set[str]:
    return set(re.findall(r"'sha256-[A-Za-z0-9+/]+=*'", expected_csp_policy(repo)))


def verify_runtime_files(token: str, manifest: dict[str, Any]) -> dict[str, str]:
    paths = ("Banking.Api.dll", "start-cloud.sh", "runtime/node", "advisor/server.mjs",
             "advisor/app-tools.mjs", "advisor/banking-context.mjs", "advisor/public/app.js")
    inventory = {entry["path"]: entry["sha256"] for entry in manifest["files"]}
    if any(path not in inventory for path in paths):
        raise ReleaseError("Release manifest is missing an API/advisor/runtime file.")
    output = remote_command(token, "set -e; cd /home/site/wwwroot; sha256sum " + " ".join(paths))
    hashes = dict((name, digest) for digest, name in
                  re.findall(r"^([0-9a-f]{64})  (.+)$", output, re.MULTILINE))
    if any(hashes.get(path) != inventory[path] for path in paths):
        raise ReleaseError("Deployed API/advisor/runtime hashes disagree with the release manifest.")
    version = remote_command(token, "/home/site/wwwroot/runtime/node --version").strip()
    if version != "v" + manifest["nodeVersion"]:
        raise ReleaseError("Deployed portable Node runtime did not report the expected version.")
    return hashes


def wait_for_hosted_runtime(expected_build: str, phase: str, started: float,
                            evidence: dict[str, Any], rollback_assets: dict[str, str] | None = None
                            ) -> tuple[dict[str, Any], dict[str, Any]]:
    if phase not in {"hosted-readiness", "rollback-readiness"}:
        raise ReleaseError("Unknown readiness phase.")
    deadline = started + HOSTED_READINESS_SECONDS
    evidence.clear()
    evidence.update(phase=phase, startedAt=utc_now(), budgetSeconds=HOSTED_READINESS_SECONDS,
                    polls=0, healthReads=0, runtimeReads=0, assetReads=0,
                    outcome="pending", lastOutcome="not-started")
    previous = CURRENT_PHASE.set(phase)

    def probe() -> tuple[dict[str, Any], dict[str, Any]] | None:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            evidence["lastOutcome"] = "health-probe-deadline"
            return None
        evidence["lastOutcome"] = "health-read-failed"
        evidence["healthReads"] += 1
        health, _ = app_json("/health", timeout_seconds=min(HOSTED_PROBE_SECONDS, remaining))
        if time.monotonic() >= deadline:
            evidence["lastOutcome"] = "late-health-response"
            return None
        if health.get("status") != "running" or health.get("environment") != "azure":
            evidence["lastOutcome"] = "health-not-running-in-azure"
            return None
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            evidence["lastOutcome"] = "runtime-probe-deadline"
            return None
        evidence["lastOutcome"] = "runtime-read-failed"
        evidence["runtimeReads"] += 1
        runtime, _ = app_json("/api/runtime-info", timeout_seconds=min(HOSTED_PROBE_SECONDS, remaining))
        build = runtime.get("build")
        # Runtime responses may contain arbitrary strings. Only this approved source-build
        # syntax can enter readiness evidence; never include any other body fields or errors.
        if isinstance(build, str) and re.fullmatch(r"git-[0-9a-f]{40}", build):
            evidence["lastObservedBuild"] = build
        else:
            evidence.pop("lastObservedBuild", None)
        if time.monotonic() >= deadline:
            evidence["lastOutcome"] = "late-runtime-response"
            return None
        if runtime.get("backend") != "azure":
            evidence["lastOutcome"] = "runtime-not-azure"
            return None
        if build != expected_build:
            evidence["lastOutcome"] = "runtime-build-mismatch"
            return None
        for name, digest in (rollback_assets or {}).items():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                evidence["lastOutcome"] = "rollback-asset-deadline"
                return None
            evidence["lastOutcome"] = "rollback-asset-read-failed"
            evidence["assetReads"] += 1
            status, body, _ = request("GET", APP_URL + "/" + urllib.parse.quote(name),
                                     timeout=min(90, remaining), max_bytes=32 * 1024 * 1024)
            if time.monotonic() >= deadline:
                evidence["lastOutcome"] = "late-rollback-asset-response"
                return None
            if status != 200 or hashlib.sha256(body).hexdigest() != digest:
                evidence["lastOutcome"] = "rollback-asset-mismatch"
                return None
        evidence["lastOutcome"] = "expected-build-ready"
        return health, runtime

    try:
        while time.monotonic() < deadline:
            evidence["polls"] += 1
            try:
                result = probe()
                if result is not None:
                    if time.monotonic() < deadline:
                        evidence["outcome"] = "succeeded"
                        return result
                    evidence["lastOutcome"] = "late-readiness-proof"
            except ReleaseError:
                pass  # request() already emits fixed endpoint/status/category diagnostics only.
            remaining = deadline - time.monotonic()
            if remaining > 0:
                time.sleep(min(POLL_SECONDS, remaining))
        evidence["outcome"] = "timed-out"
        raise ReleaseError(f"{phase} did not verify the expected build, Azure health and required assets within {HOSTED_READINESS_SECONDS} seconds.")
    except Exception:
        if evidence["outcome"] == "pending":
            evidence["outcome"] = "failed"
        raise
    finally:
        evidence["elapsedMs"] = round((time.monotonic() - started) * 1000)
        evidence["finishedAt"] = utc_now()
        diagnostic("readiness-phase", **evidence)
        CURRENT_PHASE.reset(previous)


def verify_hosted(package: Path, manifest: dict[str, Any], expected_build: str, repo: Path,
                  check_csp: bool = True, *, readiness_started: float | None = None,
                  readiness_evidence: dict[str, Any] | None = None) -> dict[str, Any]:
    started = time.monotonic() if readiness_started is None else readiness_started
    health, runtime = wait_for_hosted_runtime(expected_build, "hosted-readiness", started,
                                             readiness_evidence if readiness_evidence is not None else {})

    # This checks that private account data remains authenticated without requesting any data.
    status, _, _ = request(
        "GET", APP_URL + "/api/accounts", max_bytes=1024 * 1024, allow_http_error=True
    )
    if status != 401:
        raise ReleaseError("Unauthenticated account access did not return HTTP 401.")

    assets = expected_asset_files(manifest)
    for name, expected_hash in assets.items():
        status, body, _ = request("GET", APP_URL + "/" + urllib.parse.quote(name), max_bytes=32 * 1024 * 1024)
        if status != 200 or hashlib.sha256(body).hexdigest() != expected_hash:
            raise ReleaseError(f"Hosted asset check failed for {name}.")

    csp_hashes: set[str] = set()
    if check_csp:
        _, _, headers = request("GET", APP_URL + "/", max_bytes=4 * 1024 * 1024)
        header = headers.get("Content-Security-Policy", "")
        csp_hashes = set(re.findall(r"'sha256-[A-Za-z0-9+/]+=*'", header))
        expected = expected_csp_hashes(repo)
        if not expected.issubset(csp_hashes) or header != expected_csp_policy(repo):
            raise ReleaseError("Hosted Content-Security-Policy differs from the reviewed policy.")
    try:
        smoke = subprocess.run(
            [sys.executable, str(repo / "scripts/smoke-banking-release.py")],
            check=False, capture_output=True, text=True, timeout=240,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ReleaseError("Read-only product-demo release smoke check did not finish.") from exc
    if smoke.returncode != 0:
        raise ReleaseError("Read-only product-demo release smoke check failed; output was suppressed.")
    try:
        smoke_result = json.loads(smoke.stdout)
    except json.JSONDecodeError as exc:
        raise ReleaseError("Read-only product-demo release smoke check returned invalid evidence.") from exc
    if (
        smoke_result.get("mode") != "Demo"
        or smoke_result.get("provider") != "product-demo"
        or smoke_result.get("aggregateParity") is not True
        or smoke_result.get("anonymousLiveStatus") != 401
        or smoke_result.get("demoLiveStatus") != 403
        or smoke_result.get("financialWrites") != 0
    ):
        raise ReleaseError("Read-only product-demo release smoke evidence failed its required checks.")
    return {
        "health": "running",
        "backend": runtime.get("backend"),
        "build": runtime.get("build"),
        "unauthenticatedAccountsStatus": 401,
        "assetsVerified": sorted(assets),
        "cspHashesVerified": sorted(csp_hashes),
        "demoSmoke": smoke_result,
    }


def wait_after_publish(token: str, previous_id: str) -> dict[str, Any]:
    try:
        return wait_for_deployment(token, previous_id)
    except ReleaseError:
        # One last read distinguishes an incomplete/unknown deployment from a terminal one.
        try:
            latest = latest_deployment(token)
        except ReleaseError:
            raise
        if latest.get("id") == previous_id or not is_terminal(latest):
            raise
        return latest


def post_zip(token: str, archive: Path) -> None:
    status, _, _ = request(
        "POST", SCM_URL + "/api/zipdeploy?isAsync=true", token,
        body=archive.read_bytes(), content_type="application/zip", timeout=180,
    )
    if status not in (200, 201, 202):
        raise ReleaseError(f"SCM upload returned HTTP {status}.")


def stage_pension_candidate(token: str, package: Path, source_sha: str,
                            expected_sha256: str) -> dict[str, Any]:
    """SCM can stage files, but cannot authenticate the SQL gate as the main app MI."""
    require_sha(source_sha)
    if not re.fullmatch(r"[0-9a-f]{64}", expected_sha256):
        raise ReleaseError("Release archive checksum is invalid for the schema preflight.")
    if sha256_file(package) != expected_sha256:
        raise ReleaseError("Local schema-preflight archive checksum differs from the candidate.")
    remote_root = "/home/Banking/releases"
    remote_zip = f"{remote_root}/{source_sha}.zip"
    remote_stage = f"{remote_root}/{source_sha}"
    decision_output = remote_command(
        token,
        "set -e; " + private_path_guard() + "; mkdir -p /home/Banking/releases; "
        f"if test -L {remote_zip}; then exit 17; "
        f"elif test -f {remote_zip}; then "
        f"printf '%s  %s\\n' {expected_sha256} {remote_zip} | sha256sum -c -; "
        "printf 'REUSE\\n'; "
        f"elif test -e {remote_zip}; then exit 18; else printf 'UPLOAD\\n'; fi",
    )
    decision = decision_output.strip().splitlines()[-1:]
    if decision == ["UPLOAD"]:
        status, _, _ = request(
            "PUT", f"{SCM_URL}/api/vfs/Banking/releases/{source_sha}.zip", token,
            body=package.read_bytes(), content_type="application/zip", timeout=180,
        )
        if status not in (200, 201, 202):
            raise ReleaseError(f"SCM staging upload returned HTTP {status}.")
    elif decision != ["REUSE"]:
        raise ReleaseError("SCM did not confirm a safe schema-preflight archive reuse or upload.")
    command = (
        "set -e; " + private_path_guard() + "; "
        f"printf '%s  %s\\n' {expected_sha256} {remote_zip} | sha256sum -c -; "
        f"test ! -L {remote_stage}; "
        f"rm -rf -- {remote_stage}; mkdir {remote_stage}; "
        f"unzip -oq {remote_zip} -d {remote_stage}; "
        f"test -s {remote_stage}/Banking.Api.dll"
    )
    remote_command(token, command)
    return {"archiveSha256": expected_sha256, "stagedPath": remote_stage}


def private_path_guard() -> str:
    return ('for path in /home /home/Banking /home/Banking/releases '
            '/home/Banking/releases/.schema-preflight; do test ! -L "$path" || exit 1; done')


# Read-only and always exits 0. Emits only byte counts and fixed paths, never file contents or environment values.
STORAGE_REPORT_COMMAND = (
    "df -Pk /home/Banking/releases | tail -n 1; echo '--'; "
    "du -sk /home/Banking/releases /home/site/wwwroot /home/site/deployments /home/LogFiles /home/data 2>/dev/null; "
    "echo '--'; "
    "du -sk /home/Banking/releases/* /home/Banking/releases/.schema-preflight 2>/dev/null; exit 0"
)
STORAGE_DF_LINE = re.compile(r"^\S+\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)%\s+/\S*$")
STORAGE_DU_LINE = re.compile(r"^(\d+)\s+(/home/[A-Za-z0-9._/-]{1,200})$")
STORAGE_REPORT_FOLDERS = 30
# A release needs the candidate zip, its unzipped copy, the rollback zip and a restore copy (~0.5 GiB).
MIN_FREE_STORAGE_KIB = 768 * 1024
RELEASE_ROOT = "/home/Banking/releases"
KEEP_ROLLBACK_ZIPS = 5
MAX_PRUNE_ENTRIES = 200
PRUNE_BATCH = 20
PRUNABLE_STAGING_DIR = re.compile(r"(?:restore-)?[0-9a-f]{40}")
PRUNABLE_ROLLBACK_ZIP = re.compile(r"before-[A-Za-z0-9._-]{1,120}\.zip")
PRUNE_LIST_COMMAND = (
    "set -e; for path in /home /home/Banking /home/Banking/releases; do test ! -L \"$path\" || exit 1; done; "
    "find /home/Banking/releases -mindepth 1 -maxdepth 1 -printf '%T@ %y %f\\n'"
)


def release_storage_report(token: str, evidence_dir: Path, name: str = "storage-report") -> dict[str, Any]:
    """Best-effort disk evidence so an unexplained staging failure can be diagnosed. Never authorizes a release."""
    report: dict[str, Any] = {"available": False}
    try:
        output = remote_command(token, STORAGE_REPORT_COMMAND)
    except ReleaseError:
        output = ""
    entries: list[dict[str, Any]] = []
    for line in output.splitlines()[:400]:
        line = line.strip()
        disk = STORAGE_DF_LINE.match(line)
        usage = STORAGE_DU_LINE.match(line)
        if disk:
            total, used, free, percent = (int(value) for value in disk.groups())
            report.update(available=True, diskTotalKiB=total, diskUsedKiB=used, diskFreeKiB=free, diskUsedPercent=percent)
        elif usage:
            entries.append({"path": usage.group(2), "kiB": int(usage.group(1))})
    entries.sort(key=lambda entry: (-entry["kiB"], entry["path"]))
    report["folderCount"] = len(entries)
    report["folders"] = entries[:STORAGE_REPORT_FOLDERS]
    try:
        private_json(evidence_dir / f"{name}.json", report)
    except OSError:
        pass
    print(json.dumps({"event": "release-storage-report", "name": name, **report}, sort_keys=True))
    return report


def plan_release_prune(listing: str, live_sha: str | None, source_sha: str) -> list[str]:
    """Names to delete under the release root. Only regenerable staging folders and surplus rollback zips qualify."""
    entries: list[tuple[float, str, str]] = []
    for line in listing.splitlines()[:5000]:
        parts = line.split(" ", 2)
        if len(parts) != 3:
            continue
        try:
            entries.append((float(parts[0]), parts[1], parts[2]))
        except ValueError:
            continue
    doomed = [name for _, kind, name in entries if kind == "d" and PRUNABLE_STAGING_DIR.fullmatch(name)]
    if live_sha is not None:
        protected = {f"before-{live_sha}.zip", f"before-{source_sha}.zip"}
        rollback = sorted(
            ((mtime, name) for mtime, kind, name in entries
             if kind == "f" and PRUNABLE_ROLLBACK_ZIP.fullmatch(name) and name not in protected),
            reverse=True,
        )
        doomed.extend(name for _, name in rollback[KEEP_ROLLBACK_ZIPS:])
    return sorted(doomed)[:MAX_PRUNE_ENTRIES]


def prune_release_storage(args: argparse.Namespace) -> dict[str, Any]:
    """Bounded retention for the App Service disk. Never touches wwwroot, the live build's files or the database."""
    source_sha = require_sha(args.source_sha)
    verify_azure_context()
    _, runtime, _ = read_hosted_baseline()
    live = re.fullmatch(r"git-([0-9a-f]{40})", str(runtime.get("build", "")))
    live_sha = live.group(1) if live else None
    token = access_token()
    evidence_dir = Path(args.evidence_dir)
    evidence_dir.mkdir(parents=True, exist_ok=True)
    before = release_storage_report(token, evidence_dir, "storage-before-prune")
    doomed = plan_release_prune(remote_command(token, PRUNE_LIST_COMMAND), live_sha, source_sha)
    for start in range(0, len(doomed), PRUNE_BATCH):
        paths = " ".join(f"{RELEASE_ROOT}/{name}" for name in doomed[start:start + PRUNE_BATCH])
        remote_command(token, "set -e; " + private_path_guard() + f"; rm -rf -- {paths}")
    after = release_storage_report(token, evidence_dir, "storage-after-prune")
    result = {
        "liveSha": live_sha, "keptRollbackZips": KEEP_ROLLBACK_ZIPS, "removed": doomed,
        "removedCount": len(doomed), "diskFreeKiBBefore": before.get("diskFreeKiB"),
        "diskFreeKiBAfter": after.get("diskFreeKiB"),
    }
    private_json(evidence_dir / "prune-result.json", result)
    print(json.dumps({"event": "release-storage-prune", **result}, sort_keys=True))
    free = after.get("diskFreeKiB")
    if free is None or free < MIN_FREE_STORAGE_KIB:
        raise ReleaseError("Release storage is still nearly full or could not be measured after pruning; free space manually before releasing.")
    return result


def private_json(path: Path, value: dict[str, Any]) -> None:
    # Write-once receipt is durable before asynchronous submission. No secrets are accepted.
    data = (json.dumps(value, sort_keys=True, indent=2) + "\n").encode()
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def main_container_script(invocation: dict[str, Any], receipt_sha256: str) -> bytes:
    """Only fixed read-only commands; never launch the web host or capture its output."""
    validate_schema_invocation(invocation)
    if not re.fullmatch(r"[0-9a-f]{64}", receipt_sha256):
        raise ReleaseError("Invalid invocation receipt checksum.")
    folder = str(Path(invocation["markerPath"]).parent)
    source = invocation["sourceSha"]
    archive = f"/home/Banking/releases/{source}.zip"
    common = {"schemaVersion": 1, **{key: invocation[key] for key in
              ("app", "scope", "check", "sourceSha", "archiveSha256", "invocationId", "requestedAt", "expiresAt")}}
    # All embedded values have been validated as fixed labels, integers or hex; no env values are serialized.
    prefix = json.dumps(common, separators=(",", ":"))[:-1]
    schema = ""
    if invocation["check"] == "schema":
        schema = f'''
  mkdir -m 700 {folder}/candidate
  unzip -oq {archive} -d {folder}/candidate
  cd {folder}/candidate
  test -s Banking.Api.dll
  remaining=$(({invocation['expiresAt']} - $(date +%s) - 5))
  test "$remaining" -gt 0
  if test "$remaining" -gt 60; then remaining=60; fi
  timeout --signal=TERM --kill-after=5s "${{remaining}}s" dotnet Banking.Api.dll --verify-pension-schema
'''
    return f'''#!/usr/bin/env bash
exec >/dev/null 2>&1
set -u
umask 077
{private_path_guard()} || exit 1
test ! -L /home/Banking/releases/.schema-preflight/{source} || exit 1
test ! -L {folder} || exit 1
cd {folder} || exit 1
mkdir -m 700 run.lock || exit 1
started=$(date +%s) || exit 1
remaining=$(({invocation['expiresAt']} - started - 5))
test "$remaining" -gt 0 || exit 1
timeout --signal=TERM --kill-after=5s "${{remaining}}s" bash -e <<'BANKING_READ_ONLY'
  test "$(date +%s)" -ge {invocation['requestedAt'] - 30}
  test "$(date +%s)" -lt {invocation['expiresAt']}
  test "${{WEBSITE_SITE_NAME:-}}" = {APP}
  # Presence only; no MI endpoint/header/token or configuration is emitted or exported.
  test -n "${{IDENTITY_ENDPOINT:-}}"
  test -n "${{IDENTITY_HEADER:-}}"
  printf '%s  %s\\n' {receipt_sha256} {folder}/request.json | sha256sum -c -
  test ! -L {archive}
  printf '%s  %s\\n' {invocation['archiveSha256']} {archive} | sha256sum -c -
{schema}
BANKING_READ_ONLY
code=$?
finished=$(date +%s) || exit 1
if test "$finished" -gt {invocation['expiresAt']}; then code=124; fi
printf '%s,"startedAt":%s,"finishedAt":%s,"state":"completed","exitCode":%s}}\\n' '{prefix}' "$started" "$finished" "$code" > result.tmp
chmod 600 result.tmp
test ! -e result.json && test ! -L result.json || exit 1
mv -n result.tmp result.json
# Delete only this invocation's extracted candidate; retain private terminal metadata.
rm -rf -- {folder}/candidate
'''.encode()


def read_schema_metadata(token: str, invocation: dict[str, Any], path: str) -> bytes | None:
    validate_schema_invocation(invocation)
    if path != invocation["markerPath"]:
        raise ReleaseError("Schema metadata path does not match its invocation.")
    remaining = invocation["expiresAt"] - int(time.time())
    if remaining <= 0:
        raise ReleaseError("Schema metadata deadline expired.")
    status, data, _ = request(
        "GET", SCM_URL + "/api/vfs" + path.removeprefix("/home"), token,
        timeout=min(10, remaining), max_bytes=4096, allow_http_error=True,
    )
    if status == 404:
        return None
    if status != 200:
        raise ReleaseError("Private schema metadata could not be read.")
    return data


def run_main_container_check(token: str, source_sha: str, archive_sha256: str,
                             check: str, evidence_dir: Path) -> dict[str, Any]:
    invocation = schema_invocation(source_sha, archive_sha256, check)
    evidence_dir.mkdir(parents=True, exist_ok=True)
    stem = f"{check}-{invocation['invocationId']}"
    receipt = evidence_dir / f"{stem}-invocation.json"
    private_json(receipt, invocation)  # Persist identity/path before any launch or remote writes.
    folder = str(Path(invocation["markerPath"]).parent)
    parent = str(Path(folder).parent)
    remote_command(token, f"set -e; umask 077; {private_path_guard()}; "
                   f"test ! -L {parent}; mkdir -p {parent}; chmod 700 {parent}; mkdir -m 700 {folder}")
    script = main_container_script(invocation, sha256_file(receipt))
    for name, data in (("request.json", receipt.read_bytes()), ("command.sh", script)):
        status, _, _ = request("PUT", SCM_URL + "/api/vfs" + folder.removeprefix("/home") + "/" + name,
                               token, body=data, content_type="application/octet-stream", timeout=15, max_bytes=4096)
        if status not in (200, 201, 202, 204):
            raise ReleaseError("Private invocation staging failed.")
    remote_command(token, f"set -e; {private_path_guard()}; test ! -L {parent}; test ! -L {folder}; "
                   f"chmod 600 {folder}/request.json {folder}/command.sh; "
                   f"printf '%s  %s\\n' {hashlib.sha256(script).hexdigest()} {folder}/command.sh | sha256sum -c -")
    remaining = invocation["expiresAt"] - int(time.time())
    if remaining <= 0:
        raise ReleaseError("Main-container invocation expired before submission.")
    # Azure CLI's webapp_exec.py uses this authenticated main-container endpoint.
    # Args is an actual array, not Kudu /api/command's .NET Arguments string.
    # HTTP 202 proves acceptance only; response content is never used as execution evidence.
    status, _, _ = request(
        "POST", SCM_URL + "/exec/execute", token,
        body=json.dumps({"Command": "/bin/bash", "Args": [folder + "/command.sh"],
                         "WorkingDirectory": folder}).encode(),
        content_type="application/json", timeout=min(30, remaining), max_bytes=4096,
    )
    if status != 202:
        raise ReleaseError("Main-container command was not accepted.")
    result = wait_for_schema_result(
        invocation, lambda path: read_schema_metadata(token, invocation, path), require_success=False,
    )
    private_json(evidence_dir / f"{stem}-result.json", result)
    if not result["verified"]:
        failure = SCHEMA_GATE_FAILURES.get(result["exitCode"]) if check == "schema" else None
        detail = " (" + "/".join(failure) + ")" if failure is not None else ""
        raise ReleaseError(f"Main-container {check} check completed unsuccessfully{detail}; see bounded terminal evidence.")
    return result


def stage_and_verify_pension_schema(token: str, package: Path, source_sha: str,
                                    expected_sha256: str, evidence_dir: Path) -> dict[str, Any]:
    stage = stage_pension_candidate(token, package, source_sha, expected_sha256)
    marker = run_main_container_check(token, source_sha, expected_sha256, "marker", evidence_dir)
    schema = run_main_container_check(token, source_sha, expected_sha256, "schema", evidence_dir)
    return {**stage, **schema, "mainContainerMarker": marker}


def diagnose_schema(args: argparse.Namespace) -> dict[str, Any]:
    source_sha = require_sha(args.source_sha)
    if not re.fullmatch(r"[0-9a-f]{64}", args.artifact_digest):
        raise ReleaseError("Diagnostic artifact digest is invalid.")
    package = Path(args.package)
    manifest = verify_manifest(package, Path(args.manifest), source_sha)
    verify_azure_context()
    evidence_dir = Path(args.evidence_dir)
    evidence_dir.mkdir(parents=True, exist_ok=True)
    private_json(evidence_dir / "diagnostic.json", {
        "sourceSha": source_sha, "archiveSha256": manifest["archive"]["sha256"],
        "artifactDigest": args.artifact_digest,
        "executionTransport": "scm-exec-array", "publishes": False, "migrations": False,
    })
    token = access_token()
    release_storage_report(token, evidence_dir)
    return stage_and_verify_pension_schema(token, package, source_sha,
                                           manifest["archive"]["sha256"], evidence_dir)


def verify_snapshot(snapshot_path: Path, source_sha: str,
                    manifest: dict[str, Any], artifact_digest: str) -> dict[str, Any]:
    try:
        snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ReleaseError("Rollback evidence is missing or invalid.") from exc
    if (
        snapshot.get("schemaVersion") != 1
        or snapshot.get("app") != APP
        or snapshot.get("resourceId", "").lower() != RESOURCE_ID.lower()
        or snapshot.get("sourceSha") != source_sha
        or snapshot.get("releaseArchiveSha256") != manifest["archive"]["sha256"]
        or snapshot.get("artifactDigest") != artifact_digest
        or snapshot.get("rollbackLocation") != f"/home/Banking/releases/before-{source_sha}.zip"
        or not re.fullmatch(r"[0-9a-f]{64}", str(snapshot.get("rollbackSha256", "")))
    ):
        raise ReleaseError("Remote rollback evidence does not match this release and fixed site.")
    return snapshot


def publish(args: argparse.Namespace) -> dict[str, Any]:
    source_sha = require_sha(args.source_sha)
    package = Path(args.package)
    manifest = verify_manifest(package, Path(args.manifest), source_sha)
    evidence_dir = Path(args.evidence_dir)
    snapshot = verify_snapshot(
        evidence_dir / "rollback-manifest.json", source_sha,
        manifest, args.artifact_digest,
    )
    verify_azure_context()
    _, current_runtime, current_deployment = read_hosted_baseline()
    if (
        current_deployment["id"] != snapshot["previousDeploymentId"]
        or current_runtime["build"] != snapshot["previousBuild"]
    ):
        raise ReleaseError("Production changed after rollback capture; refusing to overwrite it.")

    result: dict[str, Any] = {
        "sourceSha": source_sha,
        "releaseBuild": manifest["build"],
        "releaseArchiveSha256": manifest["archive"]["sha256"],
        "artifactDigest": args.artifact_digest,
        "previousBuild": snapshot["previousBuild"],
        "previousDeploymentId": snapshot["previousDeploymentId"],
        "rollbackSha256": snapshot["rollbackSha256"],
        "controlledRestartIssued": False,
        "pensionSchemaVerified": False,
        "startedAt": utc_now(),
    }
    token = access_token()
    remote_path = snapshot["rollbackLocation"]
    remote_command(
        token,
        "set -e; "
        f"printf '%s  %s\\n' {snapshot['rollbackSha256']} {remote_path} | sha256sum -c -",
    )
    attempted = False
    new_deployment: dict[str, Any] | None = None
    try:
        result["pensionSchemaGate"] = stage_and_verify_pension_schema(
            token, package, source_sha, manifest["archive"]["sha256"], evidence_dir
        )
        result["pensionSchemaVerified"] = True
        attempted = True
        post_zip(token, package)
        new_deployment = wait_after_publish(token, snapshot["previousDeploymentId"])
        if new_deployment.get("id") == snapshot["previousDeploymentId"] or not is_terminal(new_deployment):
            raise ReleaseError("New deployment has no confirmed terminal status.")
        result["deploymentId"] = new_deployment["id"]
        result["deploymentStatus"] = new_deployment.get("status")
        result["deploymentComplete"] = new_deployment.get("complete")
        if not is_success(new_deployment):
            raise ReleaseError("App Service reported that the new deployment failed.")
        result["runtimeFilesVerified"] = verify_runtime_files(token, manifest)
        result["controlledRestartRequestedAt"] = utc_now()
        run_az(
            "webapp", "restart", "--resource-group", RESOURCE_GROUP,
            "--name", APP, "--output", "none",
        )
        readiness_started = time.monotonic()
        result["controlledRestartCompletedAt"] = utc_now()
        result["controlledRestartIssued"] = True
        result["postDeploy"] = verify_hosted(
            package, manifest, manifest["build"], Path(args.repo), check_csp=True,
            readiness_started=readiness_started, readiness_evidence=result.setdefault("hostedReadiness", {}),
        )
        result["outcome"] = "succeeded"
        result["finishedAt"] = utc_now()
        write_result(evidence_dir, result)
        print(json.dumps(result, sort_keys=True))
        return result
    except Exception as exc:
        result["failure"] = exc.__class__.__name__
        result["failureMessage"] = str(exc)
        # Re-read status. Roll back only when a new deployment is confirmed terminal.
        latest = new_deployment
        if attempted:
            try:
                latest = latest_deployment(token)
            except ReleaseError:
                latest = None
        if rollback_is_safe(snapshot["previousDeploymentId"], latest):
            result["rollbackAttempted"] = True
            result["failedDeploymentId"] = latest["id"]
            result["failedDeploymentStatus"] = latest.get("status")
            # A terminal failed ZipDeploy may have partially changed wwwroot too.
            try:
                result["rollbackVerification"] = restore_remote_backup(token, snapshot, evidence=result)
                result["rollbackOutcome"] = "succeeded"
            except Exception as rollback_exc:
                result["rollbackOutcome"] = "failed"
                result["rollbackFailure"] = rollback_exc.__class__.__name__
                result["rollbackFailureMessage"] = str(rollback_exc)
        else:
            result["rollbackAttempted"] = False
            result["rollbackOutcome"] = "not-safe-to-start; inspect terminal deployment state"
        result["outcome"] = "failed"
        result["finishedAt"] = utc_now()
        write_result(evidence_dir, result)
        print(json.dumps(result, sort_keys=True))
        raise ReleaseError("Release gates failed; see sanitized release evidence and rollback status.") from exc


def verify_rollback(snapshot: dict[str, Any], *, readiness_started: float | None = None,
                    readiness_evidence: dict[str, Any] | None = None) -> dict[str, Any]:
    assets = snapshot.get("rollbackAssets", {})
    started = time.monotonic() if readiness_started is None else readiness_started
    health, runtime = wait_for_hosted_runtime(snapshot["previousBuild"], "rollback-readiness", started,
                                             readiness_evidence if readiness_evidence is not None else {}, assets)
    return {"health": health.get("status"), "build": runtime.get("build"), "assetsVerified": sorted(assets)}


def restore_remote_backup(token: str, snapshot: dict[str, Any], *, evidence: dict[str, Any] | None = None) -> dict[str, Any]:
    backup = snapshot["rollbackLocation"]
    stage = f"/home/Banking/releases/restore-{snapshot['sourceSha']}"
    command = (
        "set -e; "
        f"printf '%s  %s\\n' {snapshot['rollbackSha256']} {backup} | sha256sum -c -; "
        f"rm -rf {stage}; mkdir -p {stage}; unzip -oq {backup} -d {stage}; "
        "find /home/site/wwwroot -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +; "
        f"cp -a {stage}/. /home/site/wwwroot/; test -s /home/site/wwwroot/Banking.Api.dll"
    )
    remote_command(token, command)
    evidence = evidence if evidence is not None else {}
    evidence["rollbackRestartRequestedAt"] = utc_now()
    run_az("webapp", "restart", "--subscription", SUBSCRIPTION, "--resource-group", RESOURCE_GROUP, "--name", APP, "--output", "none")
    readiness_started = time.monotonic()
    evidence["rollbackRestartCompletedAt"] = utc_now()
    return verify_rollback(snapshot, readiness_started=readiness_started,
                           readiness_evidence=evidence.setdefault("rollbackReadiness", {}))


def write_result(directory: Path, result: dict[str, Any]) -> None:
    (directory / "release-evidence.json").write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    prune = subparsers.add_parser("prune-release-storage")
    prune.add_argument("--source-sha", required=True)
    prune.add_argument("--evidence-dir", required=True)
    for command in ("capture", "publish", "diagnose-schema"):
        child = subparsers.add_parser(command)
        child.add_argument("--source-sha", required=True)
        child.add_argument("--package", required=True)
        child.add_argument("--manifest", required=True)
        child.add_argument("--artifact-digest", required=True)
        child.add_argument("--evidence-dir", required=True)
        if command == "publish":
            child.add_argument("--repo", default=".")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        if args.command == "capture":
            capture(args)
        elif args.command == "diagnose-schema":
            diagnose_schema(args)
        elif args.command == "prune-release-storage":
            prune_release_storage(args)
        else:
            publish(args)
        return 0
    except ReleaseError as exc:
        print(f"Release gate failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
