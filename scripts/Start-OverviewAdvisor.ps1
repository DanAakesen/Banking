# Compatibility entrypoint: local frontend assets, shared Azure API and advisor.
param(
    [switch]$NoBuild,
    [ValidateSet(5443, 5444)]
    [int]$Port = 5443
)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'Start-Frontend.ps1') -Port $Port -NoBuild:$NoBuild
