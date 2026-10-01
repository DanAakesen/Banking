param([switch]$Apply)
$ErrorActionPreference='Stop'
$receipt=Join-Path $PSScriptRoot '../artifacts/ui-review/review-demo-preparation.json'
if(-not $Apply){throw 'Use -Apply to prepare the explicitly requested local Demo review queue.'}
$session=New-Object Microsoft.PowerShell.Commands.WebRequestSession
$headers=@{'X-Banking-Client'='web';'X-Banking-Mode'='Demo';'Origin'='https://localhost:5443'}
function Invoke-DemoApi($Path,$Method='GET',$Body=$null){
 $args=@{Uri="https://localhost:5443/api/$Path";Method=$Method;Headers=$headers;WebSession=$session}
 if($null -ne $Body){$args.ContentType='application/json';$args.Body=ConvertTo-Json -Depth 12 -InputObject $Body}
 $result=Invoke-RestMethod @args
 if($result -is [array]){foreach($entry in $result){Write-Output $entry}}else{Write-Output $result}
}
Invoke-DemoApi 'browser/demo' 'POST' | Out-Null
if((Invoke-DemoApi 'mode').mode -ne 'Demo'){throw 'Demo workspace required'}
$accounts=@(Invoke-DemoApi 'accounts');$connections=@(Invoke-DemoApi 'connections')
if(!$accounts.Count -or @($accounts|Where-Object {-not $_.isDemo}).Count -or @($connections|Where-Object {$_.provider -ne 'product-demo'}).Count){throw 'Only synthetic product-demo accounts are allowed'}
if(Test-Path -LiteralPath $receipt){Invoke-DemoApi 'review' | Select-Object counts,total; Write-Output 'Already prepared; subsequent user review decisions are preserved.';return}
$rows=@();for($offset=0;;$offset+=200){$batch=Invoke-DemoApi "transactions?status=BOOK&limit=200&offset=$offset";$rows+= $batch.items;if($rows.Count -ge $batch.total){break}}
if(@($rows|Where-Object {-not $_.isDemo}).Count){throw 'Non-demo transaction found'}
$purchases=@($rows|Where-Object {$_.description -eq 'Kaffe' -and $_.amount -lt 0 -and -not $_.isInternalTransfer}|Sort-Object bookingDate -Descending|Select-Object -First 4)
foreach($description in @('Børnetøj og sko','Tankstation')){$purchases+=@($rows|Where-Object {$_.description -eq $description -and $_.amount -lt 0 -and -not $_.isInternalTransfer}|Sort-Object bookingDate -Descending|Select-Object -First 1)}
if($purchases.Count -ne 6){throw 'Expected exactly six known synthetic purchases'}
$matches=@();for($offset=0;;$offset+=200){$batch=@(Invoke-DemoApi "transfer-matches?offset=$offset");$matches+=$batch;if($batch.Count -lt 200){break}}
$selectedMatches=@();foreach($description in @('Overførsel til opsparing','Overførsel til bilopsparing')){
 $out=$rows|Where-Object {$_.description -eq $description -and $_.amount -lt 0 -and $_.isInternalTransfer}|Sort-Object bookingDate -Descending|Select-Object -First 1
 $match=$matches|Where-Object {$_.outgoingId -eq $out.id}|Select-Object -First 1
 if(!$match){throw "Expected a known matched Demo pair: $description"}
 $incoming=$rows|Where-Object {$_.id -eq $match.incomingId}|Select-Object -First 1
 if(!$incoming -or $out.amount+$incoming.amount -ne 0 -or $out.currency -ne $incoming.currency -or $out.bookingDate -ne $incoming.bookingDate){throw 'Pair does not reconcile'}
 $selectedMatches+=$match
}
# Keep a bounded receipt of the exact app-owned changes before starting. Never reset on startup.
@{status='prepared';workspace='Demo';purchases=@($purchases|Select-Object id,description,bookingDate,categoryId,classification);matches=$selectedMatches;bankAmountsChanged=$false}|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $receipt -Encoding utf8
foreach($row in $purchases){Invoke-DemoApi "transactions/$($row.id)/category" 'PUT' @{categoryId=$null;version=$row.version;manual=$true}|Out-Null}
foreach($match in $selectedMatches){Invoke-DemoApi "transfer-matches/$($match.id)" 'DELETE'|Out-Null}
$queue=Invoke-DemoApi 'review'
@{workspace='Demo';purchasesUncategorised=$purchases.Count;transferPairsToReview=$selectedMatches.Count;counts=$queue.counts;bankAmountsChanged=$false}|ConvertTo-Json -Depth 6
