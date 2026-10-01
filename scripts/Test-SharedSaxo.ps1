param([string]$BaseUrl='https://banking-dan-0ac7d719.azurewebsites.net',[switch]$CheckReview,[string]$ExpectedBuild='2026.09.27-saxo-quote-status')
$ErrorActionPreference='Stop'
if($BaseUrl -notin @('https://banking-dan-0ac7d719.azurewebsites.net','https://localhost:5444')){throw 'Unexpected verification target.'}
$session=[Microsoft.PowerShell.Commands.WebRequestSession]::new()
$headers=@{'X-Banking-Client'='web';Origin=$BaseUrl;'X-Banking-Mode'='Demo'}
function Request([string]$Method,[string]$Path,$Body=$null){
    $p=@{Uri=$BaseUrl+$Path;Method=$Method;WebSession=$session;Headers=$headers;SkipHttpErrorCheck=$true;TimeoutSec=60}
    if($null -ne $Body){$p.Body=$Body|ConvertTo-Json -Compress;$p.ContentType='application/json'}
    Invoke-WebRequest @p
}
function Expect($r,[int]$Code,[string]$Name){
    if([int]$r.StatusCode -ne $Code){throw "$Name returned $($r.StatusCode), expected $Code."}
    Write-Output "PASS $Name ($Code)"
}
Expect (Request GET '/health') 200 'health'
$runtime=(Request GET '/api/runtime-info').Content|ConvertFrom-Json
if($runtime.build -ne $ExpectedBuild){throw 'Wrong deployed build.'}
Write-Output "PASS runtime build $($runtime.build)"
Expect (Request POST '/api/browser/demo' @{}) 200 'Demo session'
try {
    $status=Request GET '/api/investments/saxo/status?environment=SIM'
    Expect $status 200 'SIM status'
    $s=$status.Content|ConvertFrom-Json
    if(-not $s.configured -or -not $s.trading.enabled -or -not $s.trading.allowed -or $s.trading.ownerRequired -or -not $s.trading.confirmationRequired){throw 'Unexpected SIM access flags.'}
    Write-Output 'PASS Demo SIM trading enabled, explicit confirmation required'
    $preview=Request POST '/api/investments/saxo/preview?environment=SIM' @{}
    Expect $preview 200 'SIM account and holdings read'
    $p=$preview.Content|ConvertFrom-Json
    if(-not $p.simulation){throw 'Expected simulation data.'}
    $search=Request GET '/api/investments/saxo/instruments?environment=SIM&q=Genmab'
    Expect $search 200 'instrument search'
    $instruments=@($search.Content|ConvertFrom-Json)
    $instrument=@($instruments|Where-Object symbol -EQ 'GMAB:xcse')[0]
    if(-not $instrument){throw 'Expected instrument not returned.'}
    $ticket=Request GET ('/api/investments/saxo/ticket?environment=SIM&uic='+$instrument.uic)
    Expect $ticket 200 'instrument/account ticket details'
    $t=$ticket.Content|ConvertFrom-Json
    if(($t.quote.Quote.PriceTypeAsk -eq 'NoAccess' -or $t.quote.Quote.PriceTypeBid -eq 'NoAccess') -and $t.quoteError -ne 'SAXO_MARKET_DATA_NO_ACCESS'){throw 'Denied prices must carry an explicit quote error.'}
    Write-Output "INFO quote status: $($t.quoteError); supported order types: $($t.supportedOrderTypes -join ', ')"
    if($CheckReview){
        $ask=$t.quote.Quote.Ask
        if($ask -gt 0 -and $t.quote.Quote.PriceTypeAsk -ne 'NoAccess' -and @($t.accounts).Count -eq 1){
            $review=Request POST '/api/investments/saxo/orders/precheck?environment=SIM' @{uic=$t.uic;accountKey=$t.accounts[0].key;side='Buy';quantity=1;limitPrice=$ask;duration='DayOrder'}
            Expect $review 200 'unsubmitted broker review using quoted ask'
            $reviewData=$review.Content|ConvertFrom-Json
            Write-Output "INFO broker review state: $($reviewData.state); precheck: $($reviewData.precheck.PreCheckResult)"
            if($reviewData.state -ne 'Reviewed'){throw 'Broker did not approve the unsubmitted review.'}
            Expect (Request GET ('/api/investments/saxo/orders/'+$reviewData.ticketId+'?environment=SIM')) 200 'own review readable'
            $other=[Microsoft.PowerShell.Commands.WebRequestSession]::new()
            $null=Invoke-WebRequest -Uri ($BaseUrl+'/api/browser/demo') -Method Post -WebSession $other -Headers $headers -ContentType application/json -Body '{}' -TimeoutSec 30
            try {
                $private=Invoke-WebRequest -Uri ($BaseUrl+'/api/investments/saxo/orders/'+$reviewData.ticketId+'?environment=SIM') -WebSession $other -Headers $headers -SkipHttpErrorCheck -TimeoutSec 30
                Expect $private 404 'another Demo session cannot read this review'
            } finally { $null=Invoke-WebRequest -Uri ($BaseUrl+'/api/browser/logout') -Method Post -WebSession $other -Headers $headers -ContentType application/json -Body '{}' -TimeoutSec 30 }
        } else { Write-Output 'NOT RUN broker review: no usable Saxo ask quote or ambiguous account; no invented limit used.' }
    }
    Expect (Request GET '/api/investments/saxo/orders?environment=SIM') 200 'broker orders and activity'
    # Deliberately invalid ticket and false confirmation: this probe cannot place an order.
    $write=Request POST '/api/investments/saxo/orders?environment=SIM' @{ticketId=[Guid]::Empty.ToString();confirm=$false}
    Expect $write 400 'unconfirmed Demo submission denied'
    if(($write.Content|ConvertFrom-Json).error -ne 'SAXO_CONFIRMATION_REQUIRED'){throw 'Wrong submission denial.'}
    $draft=Request POST '/api/investments/saxo/orders/precheck?environment=SIM' @{uic=0;accountKey='';side='Buy';quantity=0;limitPrice=0}
    Expect $draft 400 'Demo preparation reaches input validation'
    if(($draft.Content|ConvertFrom-Json).error -ne 'INVALID_ORDER'){throw 'Wrong preparation validation.'}
    Expect (Request GET ('/api/investments/saxo/orders/'+[Guid]::Empty+'?environment=SIM')) 404 'unknown receipt denied'
    foreach($path in @('/instruments?q=Genmab',('/ticket?uic='+$instrument.uic),'/orders?')){
        $separator=if($path.EndsWith('?')){''}else{'&'}
        Expect (Request GET ('/api/investments/saxo'+$path+$separator+'environment=LIVE')) 403 'LIVE route denied'
    }
    Write-Output 'PASS no broker order submission performed'
} finally { $null=Request POST '/api/browser/logout' @{} }
