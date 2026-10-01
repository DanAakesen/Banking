param(
    [Parameter(Mandatory)][string]$Path,
    [ValidateSet('GET', 'POST', 'PUT', 'DELETE')][string]$Method = 'GET',
    [ValidateSet('Demo', 'Live')][string]$Mode = 'Demo',
    [object]$Body
)
$ErrorActionPreference = 'Stop'
if (-not $Path.StartsWith('/api/', [StringComparison]::Ordinal) -and $Path -ne '/openapi/v1.json') { throw 'Use a local API path.' }
$uri = [Uri]::new([Uri]'http://127.0.0.1:5080', $Path)
if ($uri.Host -ne '127.0.0.1' -or $uri.Port -ne 5080) { throw 'Only the local backend is allowed.' }
$tokenFile = Join-Path $env:LOCALAPPDATA 'Banking\api-token.dpapi'
if (-not (Test-Path -LiteralPath $tokenFile)) { throw 'Start the backend first.' }
$secretBytes = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($tokenFile), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
try {
    $request = @{ Uri = $uri; Method = $Method; Headers = @{ Authorization = 'Bearer ' + [Text.Encoding]::UTF8.GetString($secretBytes); 'X-Banking-Mode' = $Mode } }
    if ($PSBoundParameters.ContainsKey('Body')) { $request.Body = ConvertTo-Json -InputObject $Body -Depth 10; $request.ContentType = 'application/json' }
    $response = Invoke-RestMethod @request
    Write-Output $response
}
finally { [Array]::Clear($secretBytes, 0, $secretBytes.Length); $request = $null }
