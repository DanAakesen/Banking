param([switch]$NoBuild)
$ErrorActionPreference = 'Stop'
$bankingRoot = Split-Path -Parent $PSScriptRoot
if (Get-Process Banking.Api -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($bankingRoot + '\', [StringComparison]::OrdinalIgnoreCase) }) {
    throw 'Stop this repository''s local backend before demo maintenance.'
}
Push-Location $bankingRoot
try {
    $arguments = @('run', '--project', 'src/Banking.Api', '--arch', 'x64', '--launch-profile', 'local')
    if ($NoBuild) { $arguments += '--no-build' }
    $arguments += @('--', '--Maintenance:Action', 'initialize-demo', '--Maintenance:Mode', 'Demo')
    & dotnet @arguments
    if ($LASTEXITCODE -ne 0) { throw 'Demo initialization failed. Existing data is never overwritten.' }
}
finally { Pop-Location }
