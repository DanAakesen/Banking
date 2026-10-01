param(
    [ValidateSet('backup', 'restore')][string]$Action = 'backup',
    [Parameter(Mandatory)][string]$File,
    [ValidateSet('Demo', 'Live')][string]$Mode = 'Demo',
    [switch]$Portable,
    [string]$RestoreDatabase
)
$ErrorActionPreference = 'Stop'
$archivePath = [IO.Path]::GetFullPath($File)
if ($Action -eq 'restore' -and $RestoreDatabase -notmatch '^Banking_Restore_[A-Za-z0-9_]+$') { throw 'Restore requires a separate Banking_Restore_ database name.' }
if ($Action -eq 'restore' -and $Mode -eq 'Live' -and $RestoreDatabase -notmatch '^Banking_Restore_Live_[A-Za-z0-9_]+$') { throw 'Live recovery requires Banking_Restore_Live_.' }
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    $arguments = @('run', '--project', 'src/Banking.Api', '--arch', 'x64', '--launch-profile', 'local', '--', '--Maintenance:Action', $Action, '--Maintenance:File', $archivePath, '--Maintenance:Mode', $Mode)
    if ($Portable) { $arguments += @('--Maintenance:Portable', 'true') }
    if ($Action -eq 'restore') {
        $connectionOption = if ($Mode -eq 'Live') { '--ConnectionStrings:BankingLive' } else { '--ConnectionStrings:Banking' }
        $arguments += @($connectionOption, "Server=(localdb)\Banking;Database=$RestoreDatabase;Integrated Security=true;TrustServerCertificate=true")
    }
    & dotnet @arguments
    if ($LASTEXITCODE -ne 0) { throw 'Local maintenance failed.' }
}
finally { Pop-Location }
