param([ValidateSet('Stage','Unpack','Migrate','Publish','EnableAdvisor','Status')][string]$Step)
$ErrorActionPreference='Stop'
$subscription='0ac7d719-89bc-4100-be87-a79d33e953a7'
$app='banking-dan-0ac7d719'
$group='rg-banking-prod-weu'
$release='full-20260916'
$repo=Split-Path -Parent $PSScriptRoot
$package=Join-Path $repo ('artifacts/release-'+$release)
$zip=Join-Path $repo ('artifacts/'+$release+'.zip')
$auth=az account get-access-token --subscription $subscription --resource https://management.azure.com/ -o json | ConvertFrom-Json
if($LASTEXITCODE -ne 0){throw 'Azure authentication failed.'}
$headers=@{Authorization='Bearer '+$auth.accessToken}
$scm='https://'+$app+'.scm.azurewebsites.net'
$management="https://management.azure.com/subscriptions/$subscription/resourceGroups/$group/providers/Microsoft.Web/sites/$app"
function Command([string]$Command){
 if($Command.Contains('"')){throw 'Unexpected shell quoting in deployment command.'}
 $result=Invoke-RestMethod -Uri ($scm+'/api/command') -Method Post -Headers $headers -ContentType application/json -Body (@{command=('bash -c "'+$Command+'"');dir='/home'}|ConvertTo-Json) -TimeoutSec 180
 if($result.ExitCode -ne 0){throw ('Remote command failed: '+$result.Output+' '+$result.Error)}
 $result.Output
}
switch($Step){
 'Stage'{
  if(Get-ChildItem $package -Recurse -File | Where-Object {$_.Name -match 'appsettings.Local|\.env$|\.dpapi$|\.pfx$|\.pem$|\.mdf$|\.ldf$|\.test\.mjs$'}){throw 'Private or test files found in release.'}
  Compress-Archive -Path ($package+'/*') -DestinationPath $zip -Force
  Command "mkdir -p /home/Banking/releases/$release /home/Banking/deployment"
  $null=Invoke-RestMethod -Uri ($scm+'/api/vfs/Banking/releases/'+$release+'.zip') -Method Put -Headers ($headers+@{'If-Match'='*'}) -InFile $zip -ContentType application/zip -TimeoutSec 180
  Command "unzip -oq /home/Banking/releases/$release.zip -d /home/Banking/releases/$release && chmod +x /home/Banking/releases/$release/runtime/node && /home/Banking/releases/$release/runtime/node --version"
  Write-Output ('Staged release SHA256 '+(Get-FileHash $zip -Algorithm SHA256).Hash)
 }
 'Unpack'{Command "unzip -oq /home/Banking/releases/$release.zip -d /home/Banking/releases/$release && chmod +x /home/Banking/releases/$release/runtime/node && /home/Banking/releases/$release/runtime/node --version"}
 'Migrate'{
  & 'C:/Program Files/dotnet/x64/dotnet.exe' (Join-Path $repo 'artifacts/deployment-tool-current/Banking.Deployment.dll') refresh-operator
  if($LASTEXITCODE -ne 0){throw 'Could not prepare encrypted operator token.'}
  $tokenPath=Join-Path $env:LOCALAPPDATA 'Banking/cloud/operator.protected'
  try{
   $null=Invoke-RestMethod -Uri ($scm+'/api/vfs/Banking/deployment/operator.protected') -Method Put -Headers ($headers+@{'If-Match'='*'}) -InFile $tokenPath -ContentType application/octet-stream -TimeoutSec 60
   Command "cd /home/Banking/releases/$release && dotnet Banking.Api.dll --Maintenance:Action=cloud-schema"
  }finally{if(Test-Path -LiteralPath $tokenPath){Remove-Item -LiteralPath $tokenPath -Force}}
 }
 'Publish'{
  Command "if [ ! -f /home/Banking/releases/before-$release.zip ]; then cd /home/site/wwwroot && zip -qr /home/Banking/releases/before-$release.zip .; fi"
  $null=Invoke-WebRequest -Uri ($scm+'/api/zipdeploy?isAsync=true') -Method Post -Headers $headers -InFile $zip -ContentType application/zip -TimeoutSec 180
  Write-Output 'Full application upload accepted; deployment completion still must be checked.'
 }
 'EnableAdvisor'{
  $settings=Invoke-RestMethod -Method Post -Uri ($management+'/config/appsettings/list?api-version=2023-12-01') -Headers $headers
  $original=$settings|ConvertTo-Json -Depth 8
  $backup=Join-Path $env:LOCALAPPDATA 'Banking/cloud/before-full-20260916-settings.dpapi'
  if(!(Test-Path -LiteralPath $backup)){[IO.File]::WriteAllBytes($backup,[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($original),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))}
  $keyLine=Get-Content (Join-Path $repo '.env') | Where-Object {$_ -match '^OPENAI_API_KEY='} | Select-Object -First 1
  if(!$keyLine){throw 'Existing advisor key not found.'}
  $key=$keyLine.Substring(15).Trim().Trim('"').Trim("'")
  $settings.properties | Add-Member -NotePropertyName OPENAI_API_KEY -NotePropertyValue $key -Force
  $settings.properties | Add-Member -NotePropertyName Advisor__Enabled -NotePropertyValue 'true' -Force
  $null=Invoke-RestMethod -Method Put -Uri ($management+'/config/appsettings?api-version=2023-12-01') -Headers $headers -ContentType application/json -Body ($settings|ConvertTo-Json -Depth 8) -TimeoutSec 120
  $null=Invoke-RestMethod -Method Patch -Uri ($management+'/config/web?api-version=2023-12-01') -Headers $headers -ContentType application/json -Body '{"properties":{"appCommandLine":"bash /home/site/wwwroot/start-cloud.sh"}}' -TimeoutSec 120
  Write-Output 'Existing protected settings preserved; advisor key configured without logging its value.'
 }
 'Status'{
  Invoke-RestMethod -Uri ($scm+'/api/deployments/latest') -Headers $headers -TimeoutSec 60 | Select-Object id,status,complete,active,start_time,end_time
 }
}
