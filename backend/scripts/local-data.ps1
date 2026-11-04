param(
    [ValidateSet('Inspect', 'RegisterAdmin', 'Seed', 'SeedTwice', 'Verify')]
    [string]$Mode = 'Inspect',
    [switch]$AccountAbsenceConfirmed
)
$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'local-data.mjs'
if ($Mode -eq 'Inspect') {
    & node $scriptPath inspect
    exit $LASTEXITCODE
}
if ($Mode -eq 'RegisterAdmin' -and -not $AccountAbsenceConfirmed) {
    throw 'First verify zero rows for the exact chosen email in mediconnect_auth.accounts, then pass -AccountAbsenceConfirmed. No request was sent.'
}

$role = if ($Mode -in @('Seed', 'SeedTwice')) { 'ADMIN' } else { 'fictional PATIENT with an existing profile' }
$emailPrompt = if ($Mode -eq 'RegisterAdmin') { 'NEW dedicated development account email (use an unused address)' } else { "Existing local $role email" }
$email = Read-Host $emailPrompt
$secret = Read-Host 'Password (kept in memory only)' -AsSecureString
$process = $null
$inputWriter = $null
try {
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = (Get-Command node.exe -ErrorAction Stop).Source
    $info.Arguments = '"' + $scriptPath + '" ' + $Mode.ToLowerInvariant()
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    $supportsInputEncoding = $null -ne $info.PSObject.Properties['StandardInputEncoding']
    if ($supportsInputEncoding) {
        $info.StandardInputEncoding = $utf8
    }
    $process = [System.Diagnostics.Process]::Start($info)
    if ($supportsInputEncoding) {
        $inputWriter = $process.StandardInput
    } else {
        # Windows PowerShell 5.1/.NET Framework lacks StandardInputEncoding.
        # Bypass its default code page; write BOM-free UTF-8 to the same stdin pipe.
        $inputWriter = [System.IO.StreamWriter]::new($process.StandardInput.BaseStream, $utf8)
    }
    $payload = @{ email = $email; password = [System.Net.NetworkCredential]::new('', $secret).Password; accountAbsenceConfirmed = [bool]$AccountAbsenceConfirmed } | ConvertTo-Json -Compress
    $inputWriter.Write($payload)
    $inputWriter.Dispose() # Flush UTF-8 and close stdin so the child receives EOF.
    $inputWriter = $null
    $payload = $null
    $process.WaitForExit()
    $result = $process.ExitCode
} finally {
    $payload = $null
    if ($inputWriter) { $inputWriter.Dispose() }
    $secret.Dispose()
    if ($process) { $process.Dispose() }
}
exit $result
