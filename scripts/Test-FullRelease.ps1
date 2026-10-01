$ErrorActionPreference='Stop'
$base='https://banking-dan-0ac7d719.azurewebsites.net'
$headers=@{'X-Banking-Client'='web';Origin=$base;'X-Banking-Mode'='Demo'}
$a=[Microsoft.PowerShell.Commands.WebRequestSession]::new()
$b=[Microsoft.PowerShell.Commands.WebRequestSession]::new()
$memoryId=$null
$memoryText=$null
$cleanupFailure=$null
function Request($session,$path,$data=$null){
 $p=@{Uri=$base+$path;WebSession=$session;Headers=$headers;TimeoutSec=90}
 if($null -ne $data){$p.Method='POST';$p.ContentType='application/json';$p.Body=$data|ConvertTo-Json -Depth 10 -Compress}
 try { Invoke-RestMethod @p } catch { throw ("Production check failed at "+$path+": "+$_.ErrorDetails.Message) }
}
function Request-Web($session,$path){
 $p=@{Uri=$base+$path;WebSession=$session;Headers=$headers;TimeoutSec=30;SkipHttpErrorCheck=$true}
 Invoke-WebRequest @p
}
try{
 $null=Request $a '/api/browser/demo' @{}
 $null=Request $b '/api/browser/demo' @{}
 $status=Request $a '/api/browser/status'
 if(!$status.localAdvisor){throw 'Hosted advisor is not enabled.'}
 $context=Request $a '/api/advisor-context'
 if($context.source -ne 'Banking' -or $context.mode -ne 'Demo'){throw 'Wrong advisor data source.'}
 Write-Output 'PASS: authenticated financial context'
 # Authenticated Demo shares market research, never private LIVE brokerage data.
 foreach($path in @('/api/markets/search?q=Microsoft','/api/markets/chart?symbol=MSFT&range=1mo')){
  $market=Request-Web $a $path
  if($market.StatusCode -eq 200){
   $data=$market.Content|ConvertFrom-Json
   if($path -like '*/chart?*' -and $data.source -ne 'Saxo LIVE'){throw 'Market research did not use Saxo LIVE.'}
   if($market.Content -match '"(accountKey|accountId|clientKey|positionId|orderId|accessToken|refreshToken)"\s*:'){throw 'Private broker fields appeared in market research.'}
   Write-Output 'PASS: shared Saxo market-data response'
  } elseif($market.StatusCode -in @(502,503) -and $market.Content -match 'SAXO_(MARKET_(SIGN_IN_REQUIRED|DATA_NO_ACCESS|DATA_UNAVAILABLE|DATA_MISMATCH)|LIVE_READ_DISABLED|RATE_LIMITED)'){
   Write-Output 'PENDING: shared Saxo market feed is unavailable; provider verification still required'
  } else {throw 'Shared Demo market-data route failed its expected contract.'}
 }
 foreach($path in @('/api/investments/saxo/status?environment=LIVE','/api/investments/saxo/portfolio?environment=LIVE','/api/investments/saxo/orders?environment=LIVE')){
  $denied=Request-Web $a $path
  if($denied.StatusCode -ne 403 -or $denied.Content -notmatch 'SAXO_LIVE_OWNER_REQUIRED'){throw 'Private LIVE brokerage data crossed the Demo boundary.'}
 }
 Write-Output 'PASS: private LIVE brokerage isolation'
 $workspace=Request $a '/advisor/api/workspace'
 if(!$workspace.aiConfigured){throw 'Hosted AI key is unavailable.'}
 $null=Request $b '/advisor/api/workspace'
 $memoryText='Synthetic release verification '+[Guid]::NewGuid().ToString('N')
 $created=Request $a '/advisor/api/memory/save' @{title='Release verification';text=$memoryText}
 $memoryId=[string]$created.id
 if([string]::IsNullOrWhiteSpace($memoryId)){throw 'Release verification memory did not return an ID for cleanup.'}
 $other=Request $b '/advisor/api/memory'
 $sharedMemory=@($other.preferences|Where-Object{[string]$_.id -eq $memoryId})
 if($sharedMemory.Count -gt 0){throw 'Memory crossed visitor sessions.'}
 Write-Output 'PASS: private advisor memory isolation across Demo visitors'
 $library=Request $a '/advisor/api/library'
 if($null -eq $library.items){throw 'Analysis library unavailable.'}
 $artifactMarker='Visitor-A-only release artifact'
 $render=Request $a '/advisor/api/render' @{title='Release preview';format='html';content=('<p>'+$artifactMarker+'</p>');fallback=$artifactMarker;state=@{}}
 if($render.url -notmatch '^/advisor-render/artifact/[a-f0-9]{64}\?mode=Demo$'){throw 'Renderer URL is not a relative, mode-bound artifact path.'}
 $preview=Request-Web $a $render.url
 if($preview.StatusCode -ne 200){throw ('Owner visitor could not render its own artifact: '+$preview.StatusCode)}
 if($preview.Content -notmatch [regex]::Escape($artifactMarker)){throw 'The owner artifact preview content was not returned.'}
 if($preview.Headers['Content-Security-Policy'] -notmatch 'sandbox allow-scripts'){throw 'Renderer isolation missing.'}
 if($preview.Headers['Content-Security-Policy'] -notmatch "connect-src 'none'"){throw 'Renderer network access is not blocked.'}
 if($preview.Headers['Content-Security-Policy'] -notmatch "frame-ancestors 'self'"){throw 'Renderer does not allow its same-origin sandbox parent.'}
 $visitorPreview=Request-Web $b $render.url
 if($visitorPreview.StatusCode -notin @(403,404)){throw ('Another Demo visitor was not denied access to the private artifact: '+$visitorPreview.StatusCode)}
 if($visitorPreview.Content -match [regex]::Escape($artifactMarker)){throw 'Private artifact content crossed visitor sessions.'}
 Write-Output 'PASS: relative sandboxed renderer URL and cross-visitor artifact denial'
} finally {
 if($memoryText){
  try {
   $state=Request $a '/advisor/api/memory'
   $owned=@(($state.preferences|Where-Object{[string]$_.id -eq $memoryId -or [string]$_.text -eq $memoryText})|Select-Object -First 1)
   if($owned.Count -gt 0){$null=Request $a '/advisor/api/memory/delete' @{id=$owned[0].id;version=$owned[0].version}}
  } catch { $cleanupFailure=$_.Exception.Message }
 }
 foreach($s in @($a,$b)){try{$null=Request $s '/api/browser/logout' @{}}catch{}}
 if($cleanupFailure){throw ('Failed to clean up the exact release-verification memory: '+$cleanupFailure)}
}
