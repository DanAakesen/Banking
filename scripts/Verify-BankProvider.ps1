param([Guid]$ApplicationId, [switch]$NoBuild)
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    $arguments = @('run', '--project', 'src/Banking.Api', '--arch', 'x64', '--launch-profile', 'local')
    if ($NoBuild) { $arguments += '--no-build' }
    $arguments += @('--', '--Maintenance:Action', 'verify-provider')
    if ($PSBoundParameters.ContainsKey('ApplicationId')) {
        if ($ApplicationId -eq [Guid]::Empty) { throw 'A nonempty Application ID is required.' }
        $arguments += @('--EnableBanking:ApplicationId', $ApplicationId.ToString(), '--EnableBanking:ProtectedKeyFile', (Join-Path $env:LOCALAPPDATA 'Banking\enable-banking-private.dpapi'))
    }
    & dotnet @arguments
    if ($LASTEXITCODE -ne 0) { throw 'Read-only Enable Banking verification failed.' }
}
finally { Pop-Location }
