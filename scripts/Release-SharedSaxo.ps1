param([ValidateSet('Stage','Publish','Enable','Status')][string]$Step)
$ErrorActionPreference='Stop'
$subscription='0ac7d719-89bc-4100-be87-a79d33e953a7'
$app='banking-dan-0ac7d719'
$release='saxo-shared-demo-20260927'
$repo=Split-Path -Parent $PSScriptRoot
$zip=Join-Path $repo "artifacts/$release.zip"
if($Step -eq 'Enable'){
    az webapp config appsettings set --subscription $subscription --resource-group rg-banking-prod-weu --name $app --settings Saxo__SIM__TradingEnabled=true --output none --only-show-errors
    if($LASTEXITCODE -ne 0){throw 'SIM setting update failed.'}
    Write-Output 'SIM trading enabled; existing settings retained.'
    exit
}
$auth=az account get-access-token --subscription $subscription --resource https://management.azure.com/ -o json | ConvertFrom-Json
if($LASTEXITCODE -ne 0){throw 'Azure authentication failed.'}
$headers=@{Authorization='Bearer '+$auth.accessToken}
$scm="https://$app.scm.azurewebsites.net"
function Command([string]$Command){
    if($Command.Contains('"')){throw 'Unexpected shell quoting.'}
    $r=Invoke-RestMethod -Uri ($scm+'/api/command') -Method Post -Headers $headers -ContentType application/json -Body (@{command=('bash -c "'+$Command+'"');dir='/home'}|ConvertTo-Json) -TimeoutSec 120
    if($r.ExitCode -ne 0){throw 'Remote release check failed.'}
    $r.Output
}
switch($Step){
    'Stage'{
        if((Get-FileHash $zip).Hash -ne '0470958009F920BF55415D6C60AE43C6564061CF9B33DF5E9AB8828CB4B8AED9'){throw 'Unexpected package hash.'}
        Command "mkdir -p /home/Banking/releases && if [ ! -f /home/Banking/releases/before-$release.zip ]; then cd /home/site/wwwroot && zip -qr /home/Banking/releases/before-$release.zip .; fi"
        Command "sha256sum /home/Banking/releases/before-$release.zip && test -d /home/Banking/keys"
    }
    'Publish'{
        if((Get-FileHash $zip).Hash -ne '0470958009F920BF55415D6C60AE43C6564061CF9B33DF5E9AB8828CB4B8AED9'){throw 'Unexpected package hash.'}
        Command "test -s /home/Banking/releases/before-$release.zip"
        $null=Invoke-WebRequest -Uri ($scm+'/api/zipdeploy?isAsync=true') -Method Post -Headers $headers -InFile $zip -ContentType application/zip -TimeoutSec 180
        Write-Output 'Upload accepted; verify completion before enabling SIM trading.'
    }
    'Status'{Invoke-RestMethod -Uri ($scm+'/api/deployments/latest') -Headers $headers -TimeoutSec 45 | Select-Object id,status,complete,active,start_time,end_time}
}
