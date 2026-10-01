param(
    [ValidateSet(5443, 5444)]
    [int]$Port = 5443,
    [switch]$NoBuild
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) { throw '.NET 10 SDK is required.' }
    if (-not (Test-Path -LiteralPath 'src/Banking.Api/wwwroot/index.html')) { throw 'Banking frontend assets are missing.' }
    if (-not (Test-Path -LiteralPath 'prototypes/advisor/public/index.html')) { throw 'Advisor frontend assets are missing.' }

    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) { throw "Port $Port is already in use. The frontend host will not stop or replace that process." }

    $certificate = & dotnet dev-certs https --check 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw 'An ASP.NET HTTPS development certificate is required. Run `dotnet dev-certs https --trust` once, then retry.'
    }

    try {
        $runtime = Invoke-RestMethod -Uri 'https://banking-dan-0ac7d719.azurewebsites.net/api/runtime-info' -Method Get -TimeoutSec 8 -MaximumRedirection 0 -ErrorAction Stop
    }
    catch {
        throw 'The production API does not expose the required shared-demo frontend contract v1, or it is unavailable. The local shared-demo frontend will not start until that release is available.'
    }
    if ($runtime.apiContractVersion -ne 1 -or $runtime.backend -ne 'azure' -or $runtime.sharedDemo -ne $true -or $runtime.features.sharedDemoFinancialData -ne $true -or $runtime.features.relativeAdvisorRenderer -ne $true) {
        throw 'The production API frontend contract is incompatible or incomplete. The local shared-demo frontend requires contract v1, Azure shared-demo data, and the relative advisor renderer.'
    }

    $arguments = @('run', '--project', 'tools/frontend-host/FrontendHost.csproj', '--no-launch-profile', '--', '--port', "$Port")
    if ($NoBuild) { $arguments = @('run', '--project', 'tools/frontend-host/FrontendHost.csproj', '--no-build', '--no-launch-profile', '--', '--port', "$Port") }
    & dotnet @arguments
    if ($LASTEXITCODE -ne 0) { throw 'The frontend-only host stopped with an error.' }
}
finally { Pop-Location }
