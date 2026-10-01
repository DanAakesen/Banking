# Legacy normal-start entrypoint. Backend engineering tests use disposable fixtures;
# the normal app never starts SQL LocalDB or a local business service.
param(
    [switch]$NoBuild,
    [switch]$Https,
    [ValidateSet(5443, 5444)]
    [int]$Port = 5443
)
$ErrorActionPreference = 'Stop'
Write-Host 'Starting the local frontend with the deployed Azure backend. HTTPS is always enabled.'
& (Join-Path $PSScriptRoot 'Start-Frontend.ps1') -Port $Port -NoBuild:$NoBuild
