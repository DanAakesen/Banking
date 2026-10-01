param([string]$ExpectedBuild='2026.09.28-complete-investments',[string]$Release='complete-investments-20260928')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$proof=New-Item -ItemType Directory -Force -Path (Join-Path $repo 'artifacts/complete-release-parity')
$hashes=@()
foreach($base in @('https://banking-dan-0ac7d719.azurewebsites.net','https://localhost:5444')){
 $label=if($base -match 'localhost'){'local'}else{'azure'}
 $runtime=Invoke-RestMethod ($base+'/api/runtime-info') -TimeoutSec 30
 if($runtime.build -ne $ExpectedBuild){throw "Wrong build on $label"}
 foreach($asset in @('app.js','overview.js','overview.css','wealth-ui.js','wealth.css','goals-ui.js','goals.css','markets.css','markets-ui.js')){
  $file=Join-Path $proof.FullName ($label+'-'+$asset)
  Invoke-WebRequest ($base+'/'+$asset) -OutFile $file -TimeoutSec 30
  $expected=Join-Path $repo ('artifacts/release-'+$Release+'/wwwroot/'+$asset)
  if((Get-FileHash $file).Hash -ne (Get-FileHash $expected).Hash){throw "Asset mismatch: $label / $asset"}
 }
 $session=[Microsoft.PowerShell.Commands.WebRequestSession]::new()
 $headers=@{Origin=$base;'X-Banking-Client'='web';'X-Banking-Mode'='Demo'}
 $null=Invoke-RestMethod ($base+'/api/browser/demo') -Method Post -Headers $headers -WebSession $session -ContentType application/json -Body '{}'
 try{
  $accounts=Invoke-RestMethod ($base+'/api/accounts') -Headers $headers -WebSession $session -TimeoutSec 60
  $canonical=($accounts|Sort-Object id|Select-Object id,name,currency|ConvertTo-Json -Depth 6 -Compress)
  $hash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($canonical)))
  $hashes+=$hash
  foreach($path in @('investments/saxo/portfolio?environment=LIVE','investments/saxo/orders?environment=LIVE')){
   $denied=Invoke-WebRequest ($base+'/api/'+$path) -Headers $headers -WebSession $session -SkipHttpErrorCheck -TimeoutSec 30
   if($denied.StatusCode -ne 403){throw "LIVE boundary failed on $label"}
  }
  Write-Output "PASS $label : build, nine asset hashes, Demo account read and LIVE denial"
 }finally{$null=Invoke-RestMethod ($base+'/api/browser/logout') -Method Post -Headers $headers -WebSession $session -ContentType application/json -Body '{}'}
}
if($hashes[0] -ne $hashes[1]){throw 'Frontends do not return identical shared account identities.'}
Write-Output 'PASS Azure and localhost:5444 use the same deployed build and shared Demo accounts.'
