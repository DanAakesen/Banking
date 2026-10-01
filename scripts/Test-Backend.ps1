$ErrorActionPreference = 'Stop'
$previousX64Root = $env:DOTNET_ROOT_X64
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    if ([Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq 'Arm64' -and -not $env:DOTNET_ROOT_X64) {
        $installedX64Root = Join-Path $env:ProgramFiles 'dotnet/x64'
        if (Test-Path -LiteralPath (Join-Path $installedX64Root 'dotnet.exe')) { $env:DOTNET_ROOT_X64 = $installedX64Root }
    }
    & SqlLocalDB start Banking
    if ($LASTEXITCODE -ne 0) { throw 'Backend fixtures require the test LocalDB instance. Run SqlLocalDB create Banking, then retry. Normal frontend startup does not use LocalDB.' }
    & dotnet test Banking.sln --arch x64 --logger 'console;verbosity=minimal'
    if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed.' }
}
finally { $env:DOTNET_ROOT_X64 = $previousX64Root; Pop-Location }
