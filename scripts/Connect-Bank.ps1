param(
    [ValidateSet('Demo', 'Live')][string]$Mode = 'Live',
    [string]$Bank = 'Danske Bank',
    [string]$Country = 'DK',
    [Guid]$ReconnectId
)
$ErrorActionPreference = 'Stop'
$invoke = Join-Path $PSScriptRoot 'Invoke-Banking.ps1'
$provider = if ($Mode -eq 'Live') { 'enable-banking' } else { 'simulator' }
$banks = @(& $invoke -Path '/api/banks' -Mode $Mode)
if (-not ($banks | Where-Object { $_.name -eq $Bank -and $_.country -eq $Country })) { throw 'The exact bank/country is not in the current personal bank catalogue. Inspect /api/banks before continuing.' }
$body = @{ provider = $provider; bank = $Bank; country = $Country }
if ($PSBoundParameters.ContainsKey('ReconnectId')) { $body.reconnectId = $ReconnectId }
$authorization = & $invoke -Path '/api/connections/authorize' -Mode $Mode -Method POST -Body $body
# The signed authorization URL is needed by the user, but must not be recorded in an ordinary transcript/log.
Write-Output 'Open this short-lived authorization URL in your personal Chrome browser; complete approval only on the official bank/MitID pages:'
Write-Output $authorization.authorizationUrl
