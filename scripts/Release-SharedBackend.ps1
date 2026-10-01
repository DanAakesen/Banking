param([ValidateSet('Package','Inspect','Stage','Migrate','Publish','Status')][string]$Step,
    [ValidatePattern('^[a-z0-9-]+$')][string]$Release='full-20260927')
$ErrorActionPreference='Stop'
$subscription='0ac7d719-89bc-4100-be87-a79d33e953a7'
$repo=Split-Path -Parent $PSScriptRoot
$package=Join-Path $repo ('artifacts/release-'+$release)
$zip=Join-Path $repo ('artifacts/'+$release+'.zip')
if($Step -eq 'Package'){
    if(!(Test-Path -LiteralPath "$package/Banking.Api.dll")){throw 'Publish the current Linux API first.'}
    Copy-Item -LiteralPath "$repo/artifacts/release-saxo-20260917/runtime" -Destination $package -Recurse -Force
    $advisor=New-Item -ItemType Directory -Path "$package/advisor" -Force
    Get-ChildItem "$repo/prototypes/advisor" -File -Filter '*.mjs' | Where-Object Name -NotLike '*.test.mjs' | Copy-Item -Destination $advisor.FullName -Force
    foreach($folder in @('public','examples')){Copy-Item -LiteralPath "$repo/prototypes/advisor/$folder" -Destination $advisor.FullName -Recurse -Force}
    Copy-Item -LiteralPath "$repo/scripts/start-cloud.sh" -Destination $package -Force
    $development=Join-Path $package 'appsettings.Development.json'
    if(Test-Path -LiteralPath $development){Remove-Item -LiteralPath $development}
    if(Get-ChildItem $package -Recurse -File | Where-Object {$_.Name -match 'appsettings.Local|appsettings.Development|\.env$|\.dpapi$|\.pfx$|\.pem$|\.mdf$|\.ldf$|\.test\.mjs$'}){throw 'Private/development/test files found in package.'}
    Compress-Archive -Path ($package+'/*') -DestinationPath $zip -Force
    Write-Output ('Release SHA256 '+(Get-FileHash $zip -Algorithm SHA256).Hash)
    exit
}
$auth=az account get-access-token --subscription $subscription --resource https://management.azure.com/ -o json | ConvertFrom-Json
if($LASTEXITCODE -ne 0){throw 'Azure authentication failed.'}
$headers=@{Authorization='Bearer '+$auth.accessToken}
$scm='https://banking-dan-0ac7d719.scm.azurewebsites.net'
function Command([string]$Command){
    if($Command.Contains('"')){throw 'Unexpected shell quoting.'}
    $r=Invoke-RestMethod -Uri ($scm+'/api/command') -Method Post -Headers $headers -ContentType application/json -Body (@{command=('bash -c "'+$Command+'"');dir='/home'}|ConvertTo-Json) -TimeoutSec 240
    if($r.ExitCode -ne 0){throw ('Remote command failed: '+$r.Output+' '+$r.Error)}
    $r.Output
}
switch($Step){
    'Inspect'{
        Invoke-RestMethod -Uri ($scm+'/api/deployments/latest') -Headers $headers -TimeoutSec 60 | Select-Object id,status,complete,active,start_time,end_time
        Command 'test -f /home/site/wwwroot/Banking.Api.dll && sha256sum /home/site/wwwroot/Banking.Api.dll /home/site/wwwroot/runtime/node'
    }
    'Stage'{
        Command "mkdir -p /home/Banking/releases/$release /home/Banking/deployment && if [ ! -f /home/Banking/releases/before-$release.zip ]; then cd /home/site/wwwroot && zip -qr /home/Banking/releases/before-$release.zip .; fi"
        $null=Invoke-RestMethod -Uri ($scm+'/api/vfs/Banking/releases/'+$release+'.zip') -Method Put -Headers ($headers+@{'If-Match'='*'}) -InFile $zip -ContentType application/zip -TimeoutSec 240
        Command "unzip -oq /home/Banking/releases/$release.zip -d /home/Banking/releases/$release && chmod +x /home/Banking/releases/$release/runtime/node && /home/Banking/releases/$release/runtime/node --version && sha256sum /home/Banking/releases/$release.zip /home/Banking/releases/before-$release.zip"
    }
    'Migrate'{
        & 'C:/Program Files/dotnet/x64/dotnet.exe' "$repo/artifacts/deployment-tool-current/Banking.Deployment.dll" refresh-operator
        if($LASTEXITCODE -ne 0){throw 'Could not prepare encrypted operator token.'}
        $tokenPath=Join-Path $env:LOCALAPPDATA 'Banking/cloud/operator.protected'
        try{
            $null=Invoke-RestMethod -Uri ($scm+'/api/vfs/Banking/deployment/operator.protected') -Method Put -Headers ($headers+@{'If-Match'='*'}) -InFile $tokenPath -ContentType application/octet-stream -TimeoutSec 60
            Command "cd /home/Banking/releases/$release && dotnet Banking.Api.dll --Maintenance:Action=cloud-schema"
        }finally{if(Test-Path -LiteralPath $tokenPath){Remove-Item -LiteralPath $tokenPath -Force}}
    }
    'Publish'{
        if(!(Test-Path -LiteralPath $zip)){throw 'Package first.'}
        Command "test -s /home/Banking/releases/before-$release.zip"
        $null=Invoke-WebRequest -Uri ($scm+'/api/zipdeploy?isAsync=true') -Method Post -Headers $headers -InFile $zip -ContentType application/zip -TimeoutSec 240
        Write-Output 'Upload accepted; completion and hosted behavior still require verification.'
    }
    'Status'{Invoke-RestMethod -Uri ($scm+'/api/deployments/latest') -Headers $headers -TimeoutSec 60 | Select-Object id,status,complete,active,start_time,end_time}
}
