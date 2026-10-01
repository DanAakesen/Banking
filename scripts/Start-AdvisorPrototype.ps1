# Standalone synthetic prototype. Does not start Banking.Api or its bank sync worker.
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
& node (Join-Path $repoRoot 'prototypes/advisor/server.mjs')
if ($LASTEXITCODE -ne 0) { throw 'The advisor prototype stopped with an error.' }
