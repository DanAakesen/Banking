param([ValidateSet('Package','Configure','Publish','Status')][string]$Step)
$ErrorActionPreference='Stop'
$subscription='0ac7d719-89bc-4100-be87-a79d33e953a7'
$app='banking-dan-0ac7d719'
$group='rg-banking-prod-weu'
$release='saxo-20260917'
$repo=Split-Path -Parent $PSScriptRoot
$package=Join-Path $repo ('artifacts/release-'+$release)
$zip=Join-Path $repo ('artifacts/'+$release+'.zip')
if($Step -eq 'Package'){
    if(Test-Path -LiteralPath $package){throw 'Release directory already exists; inspect it before repackaging.'}
    New-Item -ItemType Directory -Path $package | Out-Null
    Copy-Item -Path (Join-Path $repo 'artifacts/saxo-cloud-ready-20260917/*') -Destination $package -Recurse
    Copy-Item -LiteralPath (Join-Path $repo 'artifacts/release-full-20260916/runtime') -Destination $package -Recurse
    $advisor=New-Item -ItemType Directory -Path (Join-Path $package 'advisor')
    Get-ChildItem (Join-Path $repo 'prototypes/advisor') -File -Filter '*.mjs' |
        Where-Object Name -NotLike '*.test.mjs' | Copy-Item -Destination $advisor.FullName
    foreach($folder in @('public','examples')){Copy-Item -LiteralPath (Join-Path $repo ('prototypes/advisor/'+$folder)) -Destination $advisor.FullName -Recurse}
    Copy-Item -LiteralPath (Join-Path $repo 'scripts/start-cloud.sh') -Destination $package
    if(Get-ChildItem $package -Recurse -File | Where-Object {$_.Name -match 'appsettings.Local|\.env$|\.dpapi$|\.pfx$|\.pem$|\.mdf$|\.ldf$|\.test\.mjs$'}){throw 'Private or test files found in release.'}
    Compress-Archive -Path ($package+'/*') -DestinationPath $zip
    Write-Output ('Package SHA256: '+(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash)
    exit
}
$auth=az account get-access-token --subscription $subscription --resource https://management.azure.com/ -o json | ConvertFrom-Json
if($LASTEXITCODE -ne 0){throw 'Azure authentication failed.'}
$headers=@{Authorization='Bearer '+$auth.accessToken}
$scm='https://'+$app+'.scm.azurewebsites.net'
$management="https://management.azure.com/subscriptions/$subscription/resourceGroups/$group/providers/Microsoft.Web/sites/$app"
switch($Step){
    'Configure'{
        Add-Type -AssemblyName System.Security
        $credentialPath=Join-Path $env:LOCALAPPDATA 'Banking/saxo-production-sim.dpapi'
        $credentials=[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($credentialPath),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))|ConvertFrom-Json
        if($credentials.RedirectUri -ne ('https://'+$app+'.azurewebsites.net/api/saxo/auth/callback')){throw 'Production callback mismatch.'}
        $settings=Invoke-RestMethod -Method Post -Uri ($management+'/config/appsettings/list?api-version=2023-12-01') -Headers $headers
        $backup=Join-Path $env:LOCALAPPDATA ('Banking/cloud/before-'+$release+'-settings.dpapi')
        if(!(Test-Path -LiteralPath $backup)){
            [IO.File]::WriteAllBytes($backup,[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes(($settings|ConvertTo-Json -Depth 10)),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))
        }
        foreach($field in @('AppKey','AppSecret','RedirectUri')){$settings.properties|Add-Member -NotePropertyName ('Saxo__SIM__'+$field) -NotePropertyValue $credentials.$field -Force}
        $null=Invoke-RestMethod -Method Put -Uri ($management+'/config/appsettings?api-version=2023-12-01') -Headers $headers -ContentType application/json -Body ($settings|ConvertTo-Json -Depth 10) -TimeoutSec 120
        Remove-Variable credentials,settings
        Write-Output 'Production SIM settings configured; existing settings preserved and protected backup saved.'
    }
    'Publish'{
        if(!(Test-Path -LiteralPath $zip)){throw 'Package first.'}
        $command="mkdir -p /home/Banking/releases && if [ ! -f /home/Banking/releases/before-$release.zip ]; then cd /home/site/wwwroot && zip -qr /home/Banking/releases/before-$release.zip .; fi"
        $backup=Invoke-RestMethod -Uri ($scm+'/api/command') -Method Post -Headers $headers -ContentType application/json -Body (@{command=('bash -c "'+$command+'"');dir='/home'}|ConvertTo-Json) -TimeoutSec 180
        if($backup.ExitCode -ne 0){throw 'Remote rollback backup failed.'}
        $null=Invoke-WebRequest -Uri ($scm+'/api/zipdeploy?isAsync=true') -Method Post -Headers $headers -InFile $zip -ContentType application/zip -TimeoutSec 180
        Write-Output 'Release uploaded; verify deployment status and hosted behavior.'
    }
    'Status'{Invoke-RestMethod -Uri ($scm+'/api/deployments/latest') -Headers $headers -TimeoutSec 60 | Select-Object id,status,complete,active,start_time,end_time}
}
