$ErrorActionPreference = 'Stop'
$storageRoot = Join-Path $env:LOCALAPPDATA 'Banking'
$ownerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$allowed = @($ownerSid, 'S-1-5-18', 'S-1-5-32-544')
$directories = @($storageRoot, (Join-Path $storageRoot 'keys'), (Join-Path $storageRoot 'data'))
$aclVerified = $true
foreach ($directory in $directories) {
    if (-not (Test-Path -LiteralPath $directory)) { $aclVerified = $false; continue }
    $acl = Get-Acl -LiteralPath $directory
    if (-not $acl.AreAccessRulesProtected) { $aclVerified = $false }
    foreach ($rule in $acl.Access) {
        $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if ($rule.AccessControlType -eq 'Allow' -and $sid -notin $allowed) { $aclVerified = $false }
    }
}
$disk = 'Unknown: administrator read access required'
try {
    $volume = Get-CimInstance -Namespace 'root/CIMV2/Security/MicrosoftVolumeEncryption' -ClassName Win32_EncryptableVolume -Filter "DriveLetter='C:'" -ErrorAction Stop
    $protection = Invoke-CimMethod -InputObject $volume -MethodName GetProtectionStatus -ErrorAction Stop
    $conversion = Invoke-CimMethod -InputObject $volume -MethodName GetConversionStatus -ErrorAction Stop
    if ($protection.ReturnValue -eq 0 -and $conversion.ReturnValue -eq 0 -and $protection.ProtectionStatus -eq 1 -and $conversion.ConversionStatus -eq 1) { $disk = 'Verified: fully encrypted and protection on' }
    else { $disk = 'Not verified as fully encrypted with protection on' }
} catch { }
[pscustomobject]@{
    ProtectedDirectoriesVerified = $aclVerified
    ProtectedPrivateKeyExists = Test-Path -LiteralPath (Join-Path $storageRoot 'enable-banking-private.dpapi')
    PublicKeyFile = Join-Path $storageRoot 'enable-banking-public.pem'
    DiskEncryption = $disk
    LiveConfigurationExists = Test-Path -LiteralPath (Join-Path (Split-Path -Parent $PSScriptRoot) 'src\Banking.Api\appsettings.Local.json')
    ExternalActionsPerformed = $false
} | ConvertTo-Json
