# MediConnect - Start All Services
# Run this from the mediconnect root: powershell -ExecutionPolicy Bypass -File start-all.ps1

$root     = $PSScriptRoot
$backend  = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$logDir   = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Start-JavaService($name, $jar, $logFile) {
    # Use cmd /c so the quoted jar path with spaces is handled correctly
    $cmd = "java -jar `"$jar`""
    $proc = Start-Process cmd `
        -ArgumentList @("/c", $cmd) `
        -WorkingDirectory $backend `
        -RedirectStandardOutput $logFile `
        -RedirectStandardError  "$logFile.err" `
        -NoNewWindow `
        -PassThru
    Write-Host "[$name] Started  PID=$($proc.Id)  log=$logFile"
    return $proc
}

# --- Kill any leftovers on our ports ---
foreach ($port in @(8761, 8081, 8080, 5173)) {
    $lines = netstat -ano | Select-String ":$port\s"
    foreach ($line in $lines) {
        $p = ($line.Line -split '\s+')[-1]
        if ($p -match '^\d+$' -and $p -ne '0') {
            Stop-Process -Id ([int]$p) -Force -ErrorAction SilentlyContinue
            Write-Host "Killed PID $p on port $port"
        }
    }
}
Start-Sleep -Seconds 2

# --- Jar paths ---
$eurekaJar  = Join-Path $backend "discovery-server\target\discovery-server-0.1.0-SNAPSHOT.jar"
$patientJar = Join-Path $backend "patient-service\target\patient-service-0.1.0-SNAPSHOT.jar"
$gatewayJar = Join-Path $backend "api-gateway\target\api-gateway-0.1.0-SNAPSHOT.jar"

# --- 1. Start Eureka first ---
Start-JavaService "Eureka"         $eurekaJar  (Join-Path $logDir "eureka.log") | Out-Null
Write-Host "Waiting 20s for Eureka..."
Start-Sleep -Seconds 20

# --- 2. Start Patient Service + API Gateway ---
Start-JavaService "PatientService" $patientJar (Join-Path $logDir "patient-service.log") | Out-Null
Start-JavaService "APIGateway"     $gatewayJar (Join-Path $logDir "api-gateway.log")     | Out-Null
Write-Host "Waiting 20s for Patient Service + Gateway..."
Start-Sleep -Seconds 20

# --- 3. Start Frontend via cmd /c npm run dev ---
$feLog = Join-Path $logDir "frontend.log"
$feCmd = "cd /d `"$frontend`" && npm run dev"
$pFe   = Start-Process cmd `
    -ArgumentList @("/c", $feCmd) `
    -WorkingDirectory $frontend `
    -RedirectStandardOutput $feLog `
    -RedirectStandardError  "$feLog.err" `
    -NoNewWindow `
    -PassThru
Write-Host "[Frontend]  Started  PID=$($pFe.Id)  log=$feLog"
Start-Sleep -Seconds 8

# --- Verify ports ---
Write-Host "`n=== Port Status ==="
@(
    @{Port=8761; Name="Eureka"},
    @{Port=8081; Name="PatientService"},
    @{Port=8080; Name="APIGateway"},
    @{Port=5173; Name="Frontend"}
) | ForEach-Object {
    $hit = netstat -ano | Select-String ":$($_.Port)\s"
    if ($hit) {
        Write-Host "  OK  [$($_.Name)] :$($_.Port) LISTENING"
    } else {
        Write-Host "  !!  [$($_.Name)] :$($_.Port) NOT listening"
    }
}

# --- Test the gateway ---
Write-Host "`n=== Patient endpoint via gateway ==="
try {
    $r = Invoke-RestMethod "http://localhost:8080/api/patients/0aa93d24-0fff-43b5-bccf-b0b28acbcf86" -ErrorAction Stop
    Write-Host "  OK  $($r | ConvertTo-Json -Compress)"
} catch {
    Write-Host "  !!  $($_.Exception.Message)"
}

Write-Host "`nURLs:"
Write-Host "  Frontend  -> http://localhost:5173"
Write-Host "  Eureka    -> http://localhost:8761"
Write-Host "  Gateway   -> http://localhost:8080"
Write-Host "Logs: $logDir"
