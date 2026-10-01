$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    & node tests/ui/local-mvp.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Browser workflow checks failed; inspect artifacts/ui-review.' }
}
finally { Pop-Location }
