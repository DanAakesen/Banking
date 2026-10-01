param(
 [ValidateSet('https://banking-dan-0ac7d719.azurewebsites.net','https://localhost:5444')][string]$BaseUrl='https://banking-dan-0ac7d719.azurewebsites.net',
 [switch]$BeforeDeployment,
 [string]$ExpectedBuild='2026.09.28-complete-investments'
)
$ErrorActionPreference='Stop'
$session=[Microsoft.PowerShell.Commands.WebRequestSession]::new()
$headers=@{Origin=$BaseUrl;'X-Banking-Client'='web';'X-Banking-Mode'='Demo'}
function ReadApi([string]$Path){Invoke-RestMethod ($BaseUrl+'/api/'+$Path) -Headers $headers -WebSession $session -TimeoutSec 120}
$null=Invoke-RestMethod ($BaseUrl+'/api/browser/demo') -Method Post -Headers $headers -WebSession $session -ContentType application/json -Body '{}'
try {
 $runtime=ReadApi 'runtime-info'
 if(!$BeforeDeployment -and $runtime.build -ne $ExpectedBuild){throw 'Unexpected deployed build.'}
 if($BeforeDeployment){
  $portfolio=Invoke-RestMethod ($BaseUrl+'/api/investments/saxo/preview') -Method Post -Headers $headers -WebSession $session -ContentType application/json -Body '{}' -TimeoutSec 120
  $activity=ReadApi 'investments/saxo/orders?environment=SIM'
  $snapshot=[pscustomobject]@{environment='SIM';simulation=$portfolio.simulation;status='Ok';portfolio=$portfolio;orders=$activity.orders;ordersHasMore=$activity.hasMore;ordersObservedAt=$activity.observedAt;activity=$activity.history;activityError=$activity.historyError;activityHasMore=$activity.historyHasMore}
 }else{
  try{$snapshot=ReadApi 'investments/saxo/portfolio?environment=SIM'}
  catch{
   $code=try{($_.ErrorDetails.Message|ConvertFrom-Json).error}catch{$null}
   if($code -notin @('SAXO_ACCESS_REQUIRED','SAXO_SIGN_IN_REQUIRED')){throw}
   $suffix=if($BaseUrl -match 'localhost'){'local'}else{'azure'}
   $dependency=[ordered]@{frontend=$suffix;build=$runtime.build;status='ProviderSignInRequired';error=$code;holdings=$null;orders=$null;verifiedAt=[DateTimeOffset]::UtcNow}
   $dependency|ConvertTo-Json|Set-Content (Join-Path $PSScriptRoot "../artifacts/investment-release-$suffix.json")
   $dependency|ConvertTo-Json
   return
  }
 }
 if($snapshot.environment -ne 'SIM' -or !$snapshot.simulation){throw 'Wrong Saxo environment.'}
 # Deliberately export only financial test values and broker order references, never account keys or credentials.
 $p=$snapshot.portfolio
 $clean=[ordered]@{environment='SIM';simulation=$true;status=$snapshot.status;portfolioError=$snapshot.portfolioError;
  portfolio=if($p){[ordered]@{currency=$p.currency;reliability=$p.reliability;observedAt=$p.observedAt;cash=$p.cash;totalValue=$p.totalValue;hasMore=$p.hasMore;
   accounts=@($p.accounts|Select-Object currency,cash,value,invested,unbooked,commission,exchangeFee,shareValue,reliability);
   positions=@($p.positions|Select-Object symbol,name,quantity,currency,baseCurrency,openPrice,openPriceIncludingCosts,marketValue,marketValueInBaseCurrency,profitLossInBaseCurrency,openCosts,openCostsInBaseCurrency,sourceOrderId,reliability)}}else{$null};
  orders=if($null -ne $snapshot.orders){@($snapshot.orders|Select-Object orderId,symbol,quantity,filledQuantity,price,currency,status)}else{$null};
  ordersError=$snapshot.ordersError;ordersHasMore=$snapshot.ordersHasMore;ordersObservedAt=$snapshot.ordersObservedAt;
  activityCount=if($null -ne $snapshot.activity){@($snapshot.activity).Count}else{$null};activity=if($null -ne $snapshot.activity){@($snapshot.activity|Select-Object orderId,status,subStatus,quantity,filled,time)}else{$null};activityError=$snapshot.activityError;activityHasMore=$snapshot.activityHasMore}
 $suffix=if($BeforeDeployment){'before'}elseif($BaseUrl -match 'localhost'){'local'}else{'azure'}
 $proof=Join-Path $PSScriptRoot "../artifacts/investment-release-$suffix.json"
 $clean|ConvertTo-Json -Depth 10|Set-Content $proof
 [pscustomobject]@{frontend=$suffix;build=$runtime.build;status=$snapshot.status;currency=$p.currency;portfolioValue=$p.totalValue;cash=$p.cash;holdings=if($null -ne $p.positions){@($p.positions).Count}else{$null};orders=if($null -ne $snapshot.orders){@($snapshot.orders).Count}else{$null};activity=$clean.activityCount;portfolioError=$snapshot.portfolioError;ordersError=$snapshot.ordersError;activityError=$snapshot.activityError}|ConvertTo-Json
 $clean.orders|Format-Table
}finally{$null=Invoke-RestMethod ($BaseUrl+'/api/browser/logout') -Method Post -Headers $headers -WebSession $session -ContentType application/json -Body '{}'}
