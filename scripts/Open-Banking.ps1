param([switch]$NoOpen, [switch]$SetupPassword, [ValidateSet(5443, 5444)][int]$Port = 5443)
$ErrorActionPreference = 'Stop'
# Azure issues the browser session after the user chooses Demo or signs in as Dan.
if ($SetupPassword) { throw 'Owner password setup is managed on Azure. Open the app and use the deployed sign-in flow.' }
$launchUrl = "https://localhost:$Port/#/overview"
if ($NoOpen) { Write-Output $launchUrl }
else {
    $chromeCandidates = @(
        (Join-Path $env:ProgramFiles 'Google/Chrome/Application/chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google/Chrome/Application/chrome.exe'),
        (Join-Path $env:LOCALAPPDATA 'Google/Chrome/Application/chrome.exe')
    )
    $chromeExecutable = $chromeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $chromeExecutable) { throw 'Chrome was not found. Use -NoOpen to obtain the local frontend URL.' }
    Start-Process -FilePath $chromeExecutable -ArgumentList $launchUrl
}
$launchUrl = $null
