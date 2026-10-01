param([switch]$NoBuild)
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    $arguments = @('run', '--project', 'src/Banking.Api', '--arch', 'x64', '--launch-profile', 'local')
    if ($NoBuild) { $arguments += '--no-build' }
    $arguments += @('--', '--Maintenance:Action', 'prepare-key')
    & dotnet @arguments
    if ($LASTEXITCODE -ne 0) { throw 'Local key preparation failed.' }
}
finally { Pop-Location }
