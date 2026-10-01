param([ValidateSet('Infrastructure','Network','Settings','Publish')][string]$Step)
$ErrorActionPreference = 'Stop'
$subscription = '0ac7d719-89bc-4100-be87-a79d33e953a7'
$group = 'rg-banking-prod-weu'
$app = 'banking-dan-0ac7d719'
$sql = 'banking-sql-0ac7d719'
$repo = Split-Path -Parent $PSScriptRoot
$cloudRoot = Join-Path $env:LOCALAPPDATA 'Banking\cloud'
function Invoke-Azure([string[]]$Arguments) {
    & az @Arguments --subscription $subscription --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw 'Azure operation failed. No secrets are included in this error.' }
}
Push-Location $repo
try {
    switch ($Step) {
        'Infrastructure' {
            Invoke-Azure @('deployment','group','create','--resource-group',$group,'--name','banking-initial','--template-file','infra/main.bicep','--query','properties.provisioningState','-o','tsv')
        }
        'Network' {
            $ips = (& az webapp show --subscription $subscription --resource-group $group --name $app --query outboundIpAddresses -o tsv).Trim().Split(',')
            if ($LASTEXITCODE -ne 0 -or $ips.Count -eq 0) { throw 'Could not resolve application egress.' }
            $index = 0
            foreach ($ip in $ips) {
                $parsed = $null
                if (-not [Net.IPAddress]::TryParse($ip,[ref]$parsed)) { throw 'Invalid application egress address.' }
            }
            @{appOutboundIps=@{value=$ips}} | ConvertTo-Json -Depth 4 | Set-Content artifacts/network.parameters.json
            Invoke-Azure @('deployment','group','create','--resource-group',$group,'--name','banking-network','--template-file','infra/network.bicep','--parameters','@artifacts/network.parameters.json','--output','none')
            Write-Output 'Explicit app egress SQL rules configured; no operator or broad Azure rule. Migration runs through authenticated SCM.'
        }
        'Settings' {
            & 'C:\Program Files\dotnet\x64\dotnet.exe' artifacts/deployment-tool/Banking.Deployment.dll settings-file
            if ($LASTEXITCODE -ne 0) { throw 'Settings preparation failed.' }
            $file = Join-Path $cloudRoot 'settings.transient.json'
            try {
                # Only the protected filename enters CLI arguments. Never print response bodies or debug traces.
                $output = & az rest --subscription $subscription --method put --url "https://management.azure.com/subscriptions/$subscription/resourceGroups/$group/providers/Microsoft.Web/sites/$app/config/appsettings?api-version=2023-12-01" --body "@$file" --output none 2>&1
                if ($LASTEXITCODE -ne 0) { throw 'Secret settings upload failed; response intentionally suppressed.' }
            }
            finally { if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force } }
            Write-Output 'Application settings applied without exposing secret values.'
        }
        'Publish' {
            $publish = Join-Path $repo 'artifacts\publish'
            $private = Get-ChildItem -LiteralPath $publish -Recurse -File | Where-Object { $_.Name -match 'appsettings.Local|\.dpapi$|\.pfx$|\.pem$|\.mdf$|\.ldf$' }
            if ($private) { throw 'Private files found in application artifact.' }
            $archive = Join-Path $repo ('artifacts\banking-'+(Get-Date -Format 'yyyyMMddHHmmss')+'.zip')
            Compress-Archive -Path (Join-Path $publish '*') -DestinationPath $archive
            # Use Entra bearer authentication; basic SCM publishing remains disabled.
            $auth = & az account get-access-token --subscription $subscription --resource https://management.azure.com/ -o json | ConvertFrom-Json
            if ($LASTEXITCODE -ne 0) { throw 'Deployment authentication failed.' }
            $headers = @{Authorization=('Bearer '+$auth.accessToken)}
            $scm = 'https://'+$app+'.scm.azurewebsites.net'
            $null = Invoke-RestMethod -Method Post -Uri ($scm+'/api/command') -Headers $headers -ContentType 'application/json' -Body '{"command":"mkdir -p /home/Banking/keys","dir":"/home"}' -TimeoutSec 30
            foreach ($key in Get-ChildItem -LiteralPath (Join-Path $cloudRoot 'keys') -Filter '*.xml') {
                if ((Get-Content -LiteralPath $key.FullName -Raw) -notmatch 'encryptedSecret') { throw 'Unencrypted key-ring file rejected.' }
                $null = Invoke-RestMethod -Method Put -Uri ($scm+'/api/vfs/Banking/keys/'+$key.Name) -Headers ($headers+@{'If-Match'='*'}) -InFile $key.FullName -ContentType 'application/octet-stream' -TimeoutSec 30
            }
            $null = Invoke-WebRequest -Method Post -Uri ($scm+'/api/zipdeploy?isAsync=true') -Headers $headers -InFile $archive -ContentType 'application/zip' -TimeoutSec 120
            Remove-Variable auth,headers
            Write-Output 'Upload accepted. Verify SCM deployment status and hosted health before calling the release complete.'
            Write-Output ('Application artifact SHA256: '+(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash)
        }
    }
}
finally { Pop-Location }
