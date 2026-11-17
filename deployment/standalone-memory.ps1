param([Parameter(Mandatory = $true)][int]$WatchedProcessId)
# Read-only monitor of the one child JVM, never enumerate commands/environments.
$ErrorActionPreference = 'Stop'
while ($true) {
    try { $watchedProcess = Get-Process -Id $WatchedProcessId -ErrorAction Stop }
    catch { break }
    [pscustomobject]@{
        residentBytes = [long]$watchedProcess.WorkingSet64
        peakResidentBytes = [long]$watchedProcess.PeakWorkingSet64
        privateBytes = [long]$watchedProcess.PrivateMemorySize64
    } | ConvertTo-Json -Compress
    Start-Sleep -Milliseconds 250
}
