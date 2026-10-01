param([string]$BaseUrl='https://banking-dan-0ac7d719.azurewebsites.net')
$ErrorActionPreference='Stop'
if($BaseUrl -ne 'https://banking-dan-0ac7d719.azurewebsites.net'){throw 'Explicit production target required.'}
$results=[System.Collections.Generic.List[object]]::new()
$headers=@{'X-Banking-Client'='web';Origin=$BaseUrl;'X-Banking-Mode'='Demo'}
function Request([string]$Method,[string]$Path,$Session,$Body,$RequestHeaders=$headers) {
    $parameters=@{Uri=($BaseUrl+$Path);Method=$Method;Headers=$RequestHeaders;SkipHttpErrorCheck=$true;TimeoutSec=120}
    if($Session){$parameters.WebSession=$Session}
    if($null -ne $Body){$parameters.Body=($Body|ConvertTo-Json -Compress);$parameters.ContentType='application/json'}
    Invoke-WebRequest @parameters
}
function Assert-Code($Response,[int]$Expected,[string]$Name){
    if($Response.StatusCode -ne $Expected){throw ($Name+': expected '+$Expected+', received '+$Response.StatusCode)}
    $results.Add(@{check=$Name;passed=$true})
}
Assert-Code (Request GET '/health' $null $null) 200 'HTTPS health'
Assert-Code (Request GET '/api/accounts' $null $null) 401 'Anonymous financial access denied'
Assert-Code (Request GET '/api/accounts' $null $null @{'X-MS-CLIENT-PRINCIPAL-NAME'='Dan@novaro.dk';'Authorization'='Bearer forged'}) 401 'Forged identity denied'
Assert-Code (Request POST '/api/browser/password' $null @{password='synthetic-not-used'}) 404 'Local setup endpoint disabled'
Assert-Code (Request POST '/api/browser/demo' $null @{} @{'X-Banking-Client'='web';Origin='https://example.invalid'}) 403 'Cross-origin writes denied'
$status=(Request GET '/api/browser/status' $null $null).Content|ConvertFrom-Json
if(-not $status.passwordConfigured -or $null -ne $status.role){throw 'Owner password configuration invalid.'}
$results.Add(@{check='Existing owner password configured';passed=$true})
$a=[Microsoft.PowerShell.Commands.WebRequestSession]::new()
$b=[Microsoft.PowerShell.Commands.WebRequestSession]::new()
$categoryId=$null
$cleanupFailure=$null
try {
    Assert-Code (Request POST '/api/browser/demo' $a @{}) 200 'Demo entry A'
    Assert-Code (Request GET '/api/accounts' $a $null) 200 'Demo account data loads'
    $liveHeaders=@{'X-Banking-Client'='web';Origin=$BaseUrl;'X-Banking-Mode'='Live'}
    Assert-Code (Request GET '/api/accounts' $a $null $liveHeaders) 403 'Demo cannot access Live'

    $testName='Shared release verification '+[Guid]::NewGuid().ToString('N')
    $created=Request POST '/api/categories' $a @{name=$testName}
    if($created.StatusCode -eq 201){
        try { $categoryId=[string](($created.Content|ConvertFrom-Json).id) } catch { $categoryId=$null }
        if([string]::IsNullOrWhiteSpace($categoryId)){
            $location=[string]$created.Headers.Location
            if($location -match '(?:^|/)api/categories/(?<id>[0-9a-fA-F-]{36})(?:[?#].*)?$'){$categoryId=$Matches.id}
        }
    }
    Assert-Code $created 201 'Demo category creation works'
    if([string]::IsNullOrWhiteSpace($categoryId)){throw 'Created test category did not return an ID for exact cleanup.'}
    $category=$created.Content|ConvertFrom-Json

    Assert-Code (Request POST '/api/browser/demo' $b @{}) 200 'Demo entry B'
    $other=Request GET '/api/categories' $b $null
    Assert-Code $other 200 'Second shared Demo session loads categories'
    $categoryB=@(($other.Content|ConvertFrom-Json|Where-Object{[string]$_.id -eq $categoryId})|Select-Object -First 1)
    if($categoryB.Count -ne 1 -or $categoryB[0].name -ne $testName){throw 'Second Demo session did not see the exact category created by the first session.'}
    $results.Add(@{check='Demo category is shared between sessions';passed=$true})

    $renamed='Shared release verification edited '+[Guid]::NewGuid().ToString('N')
    $updated=Request PUT ('/api/categories/'+$categoryId) $b @{name=$renamed;version=$categoryB[0].version}
    Assert-Code $updated 200 'Second Demo session edits shared category'
    $updatedCategory=$updated.Content|ConvertFrom-Json
    $visibleA=(Request GET '/api/categories' $a $null).Content|ConvertFrom-Json
    $categoryA=@(($visibleA|Where-Object{[string]$_.id -eq $categoryId})|Select-Object -First 1)
    if($categoryA.Count -ne 1 -or $categoryA[0].name -ne $renamed -or $categoryA[0].version -ne $updatedCategory.version){throw 'The shared category edit was not visible with its new version in session A.'}
    $results.Add(@{check='Shared category edit is visible across sessions';passed=$true})

    Assert-Code (Request PUT ('/api/categories/'+$categoryId) $a @{name='Stale release verification write';version=$category.version}) 409 'Optimistic concurrency rejects stale category version'
}
finally {
    if(-not [string]::IsNullOrWhiteSpace($categoryId)){
        try {
            $current=Request GET '/api/categories' $a $null
            if($current.StatusCode -ne 200){throw ('Category cleanup lookup returned '+$current.StatusCode)}
            $owned=@(($current.Content|ConvertFrom-Json|Where-Object{[string]$_.id -eq $categoryId})|Select-Object -First 1)
            if($owned.Count -ne 1){throw 'The exact release-test category was not found for cleanup.'}
            $version=[Uri]::EscapeDataString([string]$owned[0].version)
            $deleted=Request DELETE ('/api/categories/'+$categoryId+'?version='+$version) $a $null
            if($deleted.StatusCode -ne 204){throw ('Exact test-category cleanup returned '+$deleted.StatusCode)}
            $results.Add(@{check='Exact synthetic test category cleaned up';passed=$true})
        } catch { $cleanupFailure=$_.Exception.Message }
    }
    foreach($session in @($a,$b)){try{$null=Request POST '/api/browser/logout' $session @{}}catch{}}
    if($cleanupFailure){throw ('Failed to clean up the exact release-test category: '+$cleanupFailure)}
}
Assert-Code (Request GET '/api/accounts' $a $null) 401 'Sign-out revokes access'
$results|ConvertTo-Json -Depth 3
