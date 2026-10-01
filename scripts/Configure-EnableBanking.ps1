param(
    [Parameter(Mandatory)][Guid]$ApplicationId,
    [switch]$LiveAccessApproved,
    [switch]$DiskEncryptionConfirmed,
    [Uri]$CallbackUrl = 'https://localhost:5443/api/auth/callback/live'
)
$ErrorActionPreference = 'Stop'
if (-not $LiveAccessApproved -or -not $DiskEncryptionConfirmed) { throw 'Live access approval and verified disk encryption are required before enabling real data.' }
if ($CallbackUrl.AbsoluteUri -ne 'https://localhost:5443/api/auth/callback/live') { throw 'This local configuration supports the HTTPS loopback callback only. Any different callback needs a reviewed configuration.' }
$bankingRoot = Join-Path $env:LOCALAPPDATA 'Banking'
$keyFile = Join-Path $bankingRoot 'enable-banking-private.dpapi'
if (-not (Test-Path -LiteralPath $keyFile)) { throw 'Run Prepare-BankConnection.ps1 first.' }
$destination = Join-Path (Split-Path -Parent $PSScriptRoot) 'src\Banking.Api\appsettings.Local.json'
if (Test-Path -LiteralPath $destination) { throw 'Local configuration exists; review and merge it instead of overwriting it.' }
$liveFile = Join-Path $bankingRoot 'data\Banking_Live_Dan.mdf'
$configuration = @{
    ConnectionStrings = @{ BankingLive = "Server=(localdb)\Banking;Database=Banking_Live_Dan;AttachDbFilename=$liveFile;Integrated Security=true;TrustServerCertificate=true" }
    EnableBanking = @{ Enabled = $true; LiveAccessApproved = $true; ApplicationId = $ApplicationId.ToString(); ProtectedKeyFile = $keyFile }
    Local = @{ RealDataProtectionVerified = $true; LiveCallbackUrl = $CallbackUrl.AbsoluteUri }
}
$configuration | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $destination -Encoding utf8
Write-Output 'Local live configuration written. No external request or registration was made. Start the backend only after the application has been linked to your own accounts.'
