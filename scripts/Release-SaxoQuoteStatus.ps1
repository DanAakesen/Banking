param([ValidateSet('Stage','Publish','Status')][string]$Step)
$ErrorActionPreference='Stop'
$subscription='0ac7d719-89bc-4100-be87-a79d33e953a7'
$app='banking-dan-0ac7d719'
$release='saxo-quote-status-20260927'
$repo=Split-Path -Parent $PSScriptRoot
$zip=Join-Path $repo "artifacts/$release.zip"
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
        if((Get-FileHash $zip).Hash -ne '34489249EADAEDC23F08683DDF4A02B81A86F6B5CFC8EF45C3618E6C60759E97'){throw 'Unexpected package hash.'}
        Command "mkdir -p /home/Banking/releases && if [ ! -f /home/Banking/releases/before-$release.zip ]; then cd /home/site/wwwroot && zip -qr /home/Banking/releases/before-$release.zip .; fi"
        Command "sha256sum /home/Banking/releases/before-$release.zip && test -d /home/Banking/keys"
    }
    'Publish'{
        if((Get-FileHash $zip).Hash -ne '34489249EADAEDC23F08683DDF4A02B81A86F6B5CFC8EF45C3618E6C60759E97'){throw 'Unexpected package hash.'}
        Command "test -s /home/Banking/releases/before-$release.zip"
        $null=Invoke-WebRequest -Uri ($scm+'/api/zipdeploy?isAsync=true') -Method Post -Headers $headers -InFile $zip -ContentType application/zip -TimeoutSec 180
        Write-Output 'Upload accepted; verify the deployed quote status before proceeding.'
    }
    'Status'{Invoke-RestMethod -Uri ($scm+'/api/deployments/latest') -Headers $headers -TimeoutSec 45 | Select-Object id,status,complete,active,start_time,end_time}
}
