param([switch]$Engineering)
$ErrorActionPreference = 'Stop'
$provider = if ($Engineering) { 'simulator' } else { 'product-demo' }
$bank = if ($Engineering) { 'Demo Bank' } else { 'Demo Household Bank' }
$expectedAccounts = if ($Engineering) { 2 } else { 3 }
$invoke = Join-Path $PSScriptRoot 'Invoke-Banking.ps1'
$connections = @(& $invoke -Path '/api/connections')
$demo = $connections | Where-Object { $_.provider -eq $provider -and $_.bank -eq $bank } | Select-Object -First 1
if (-not $demo) {
    $start = & $invoke -Path '/api/connections/authorize' -Method POST -Body @{ provider = $provider; bank = $bank; country = 'DK' }
    $callback = [Uri]$start.authorizationUrl
    if ($callback.Host -ne '127.0.0.1' -or $callback.Port -ne 5080 -or $callback.AbsolutePath -ne '/api/auth/callback') { throw 'Unexpected simulator callback.' }
    $connected = & $invoke -Path $callback.PathAndQuery
    $demo = @{ id = $connected.connectionId }
}
$deadline = [DateTimeOffset]::UtcNow.AddSeconds(45)
do {
    $accounts = @(& $invoke -Path '/api/accounts' | Where-Object { $_.connectionId -eq $demo.id })
    $complete = $accounts.Count -eq $expectedAccounts -and @($accounts | Where-Object { -not $_.initialImportCompleted }).Count -eq 0
    if (-not $complete) { Start-Sleep -Seconds 1 }
} until ($complete -or [DateTimeOffset]::UtcNow -ge $deadline)
if (-not $complete) { throw 'Demo import did not complete; inspect /api/jobs.' }
$count = 0
foreach ($account in $accounts) { $page = & $invoke -Path "/api/transactions?accountId=$($account.id)&limit=1"; $count += $page.total }
[pscustomobject]@{ Environment = 'Local simulator'; Accounts = $accounts.Count; Transactions = $count; LiveBankVerified = $false }
