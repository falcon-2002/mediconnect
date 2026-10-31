# MediConnect - Start All Services
# Run from mediconnect root: powershell -ExecutionPolicy Bypass -File start-all.ps1
#
# Options:
#   -RestartAll       : Restart all running services
#   -Restart <names>  : Restart specific service(s), e.g. -Restart APIGateway, DoctorService
#   -SkipFrontend     : Do not launch frontend Vite dev server

param(
    [switch]$RestartAll,
    [string[]]$Restart = @(),
    [switch]$SkipFrontend
)

$ErrorActionPreference = "Stop"

$root     = $PSScriptRoot
$backend  = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$logDir   = Join-Path $root "logs"

# Ensure logs directory exists
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
}

# --- Service definitions and ports ---
$services = [ordered]@{
    "Eureka"         = @{ Port = 8761; Jar = (Join-Path $backend "discovery-server\target\discovery-server-0.1.0-SNAPSHOT.jar"); Log = (Join-Path $logDir "eureka.log"); HealthUrl = "http://127.0.0.1:8761/eureka/apps" }
    "AuthService"    = @{ Port = 8082; Jar = (Join-Path $backend "auth-service\target\auth-service-0.1.0-SNAPSHOT.jar");       Log = (Join-Path $logDir "auth-service.log"); HealthUrl = "http://127.0.0.1:8082/actuator/health" }
    "PatientService" = @{ Port = 8081; Jar = (Join-Path $backend "patient-service\target\patient-service-0.1.0-SNAPSHOT.jar"); Log = (Join-Path $logDir "patient-service.log"); HealthUrl = "http://127.0.0.1:8081/actuator/health" }
    "DoctorService"  = @{ Port = 8083; Jar = (Join-Path $backend "doctor-service\target\doctor-service-0.1.0-SNAPSHOT.jar");   Log = (Join-Path $logDir "doctor-service.log"); HealthUrl = "http://127.0.0.1:8083/actuator/health" }
    "APIGateway"     = @{ Port = 8080; Jar = (Join-Path $backend "api-gateway\target\api-gateway-0.1.0-SNAPSHOT.jar");       Log = (Join-Path $logDir "api-gateway.log"); HealthUrl = "http://127.0.0.1:8080/actuator/health" }
}

# --- Helper functions ---

function Get-PortPID($port) {
    try {
        $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Select-Object -First 1
        if ($conn -and $conn.OwningProcess -gt 0) {
            return [int]$conn.OwningProcess
        }
    } catch {}

    $line = netstat -ano | Select-String ":$port\s+.*LISTENING" | Select-Object -First 1
    if ($line) {
        $parts = $line.Line.Trim() -split '\s+'
        $pidVal = $parts[-1]
        if ($pidVal -match '^\d+$' -and $pidVal -ne '0') {
            return [int]$pidVal
        }
    }
    return $null
}

function Stop-PortProcess($port, $name) {
    $p = Get-PortPID $port
    if ($p) {
        Write-Host "Stopping existing process for $name on port $port (PID $p)..."
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
}

function Test-ServiceHealth($url, $isEureka = $false) {
    try {
        $headers = if ($isEureka) { @{ Accept = "application/json" } } else { @{} }
        $resp = Invoke-RestMethod -Uri $url -Headers $headers -Method Get -TimeoutSec 3 -ErrorAction Stop
        if ($isEureka) {
            return ($null -ne $resp)
        }
        return ($resp.status -eq "UP")
    } catch {
        return $false
    }
}

function Start-JavaService {
    param(
        [string]$Name,
        [string]$JarPath,
        [string]$LogFile,
        [hashtable]$ServiceEnv = @{}
    )

    if (-not (Test-Path $JarPath)) {
        throw "JAR file not found: $JarPath. Please build backend with 'mvnw package -DskipTests' first."
    }

    # Temporarily set service-specific environment variables in current process
    $origEnv = @{}
    foreach ($k in $ServiceEnv.Keys) {
        $origEnv[$k] = [System.Environment]::GetEnvironmentVariable($k, "Process")
        [System.Environment]::SetEnvironmentVariable($k, $ServiceEnv[$k], "Process")
    }

    try {
        # Clean process start: no passwords or keys passed as CLI arguments
        # Escape quotes around $JarPath so Windows PowerShell 5.1 doesn't split on spaces
        $proc = Start-Process java `
            -ArgumentList @("-jar", "`"$JarPath`"") `
            -WorkingDirectory $backend `
            -RedirectStandardOutput $LogFile `
            -RedirectStandardError "$LogFile.err" `
            -NoNewWindow `
            -PassThru

        Write-Host "[$Name] Process launched (PID=$($proc.Id), log=$LogFile)"
        return $proc
    } finally {
        # Restore environment variables so sensitive keys (like private key) do not leak to other services
        foreach ($k in $ServiceEnv.Keys) {
            [System.Environment]::SetEnvironmentVariable($k, $origEnv[$k], "Process")
        }
    }
}

function Wait-ForHealth($name, $port, $healthUrl, $timeoutSec = 60) {
    Write-Host "Verifying $name on port $port" -NoNewline
    $isEureka = ($name -eq "Eureka")
    $elapsed = 0
    while ($elapsed -lt $timeoutSec) {
        $pidVal = Get-PortPID $port
        if ($pidVal -and (Test-ServiceHealth $healthUrl $isEureka)) {
            Write-Host " -> OK (Healthy, PID $pidVal, ${elapsed}s)" -ForegroundColor Green
            return $true
        }
        Start-Sleep -Seconds 2
        $elapsed += 2
        Write-Host "." -NoNewline
    }
    Write-Host " -> FAILED (timed out after ${timeoutSec}s)" -ForegroundColor Red
    return $false
}

# --- Prompt for Database Passwords securely if not already set ---
Write-Host "=== MediConnect Configuration ===" -ForegroundColor Cyan

# 1. Auth Service Database Password (auth_app)
if (-not $env:AUTH_DB_PASSWORD) {
    $sec = Read-Host "Enter Auth Service DB password (auth_app)" -AsSecureString
    $env:AUTH_DB_PASSWORD = [System.Net.NetworkCredential]::new("", $sec).Password
}

# 2. Patient Service Database Password (patient_app)
# Preserve existing credentials, prompt locally if needed rather than blindly assuming defaults
if (-not $env:PATIENT_DB_PASSWORD) {
    $sec = Read-Host "Enter Patient Service DB password (patient_app) [Press Enter to keep existing 'local_patient_password']" -AsSecureString
    $val = [System.Net.NetworkCredential]::new("", $sec).Password
    if ($val) {
        $env:PATIENT_DB_PASSWORD = $val
    } else {
        $env:PATIENT_DB_PASSWORD = "local_patient_password"
    }
}

# 3. Doctor Service Database Password (doctor_app)
if (-not $env:DOCTOR_DB_PASSWORD) {
    $sec = Read-Host "Enter Doctor Service DB password (doctor_app)" -AsSecureString
    $env:DOCTOR_DB_PASSWORD = [System.Net.NetworkCredential]::new("", $sec).Password
}

# --- Keys configuration ---
# Auth Service needs private and public key. Patient and Doctor services need ONLY public key.
$keyDir = "C:/Users/hp/.mediconnect-keys"
$privateKeyPath = if ($env:JWT_PRIVATE_KEY) { $env:JWT_PRIVATE_KEY } else { "file:$keyDir/private.pem" }
$publicKeyPath  = if ($env:JWT_PUBLIC_KEY)  { $env:JWT_PUBLIC_KEY }  else { "file:$keyDir/public.pem" }
$jwtIssuer      = if ($env:JWT_ISSUER)      { $env:JWT_ISSUER }      else { "mediconnect-auth" }

# --- Process each service ---
Write-Host "`n=== Starting MediConnect Backend Services ===" -ForegroundColor Cyan

foreach ($svcName in $services.Keys) {
    $info = $services[$svcName]
    $port = $info.Port
    $healthUrl = $info.HealthUrl
    $existingPid = Get-PortPID $port
    $shouldRestart = $RestartAll -or ($Restart -contains $svcName)

    if ($existingPid -and -not $shouldRestart) {
        if (Test-ServiceHealth $healthUrl ($svcName -eq "Eureka")) {
            Write-Host "[$svcName] Already running and healthy on port $port (PID $existingPid)" -ForegroundColor Green
            continue
        } else {
            Write-Host "[$svcName] Port $port is in use (PID $existingPid) but health check failed. Restarting..." -ForegroundColor Yellow
            Stop-PortProcess $port $svcName
        }
    } elseif ($existingPid -and $shouldRestart) {
        Stop-PortProcess $port $svcName
    }

    # Configure service-specific environment variables
    $svcEnv = @{}
    switch ($svcName) {
        "Eureka" {
            # No special env vars needed
        }
        "AuthService" {
            $svcEnv["AUTH_DB_PASSWORD"] = $env:AUTH_DB_PASSWORD
            if ($env:AUTH_DB_USER) { $svcEnv["AUTH_DB_USER"] = $env:AUTH_DB_USER }
            if ($env:AUTH_DB_URL)  { $svcEnv["AUTH_DB_URL"]  = $env:AUTH_DB_URL }
            # Only Auth Service receives JWT_PRIVATE_KEY
            $svcEnv["JWT_PRIVATE_KEY"]  = $privateKeyPath
            $svcEnv["JWT_PUBLIC_KEY"]   = $publicKeyPath
            $svcEnv["JWT_ISSUER"]       = $jwtIssuer
        }
        "PatientService" {
            $svcEnv["PATIENT_DB_PASSWORD"] = $env:PATIENT_DB_PASSWORD
            if ($env:PATIENT_DB_USER) { $svcEnv["PATIENT_DB_USER"] = $env:PATIENT_DB_USER }
            if ($env:PATIENT_DB_URL)  { $svcEnv["PATIENT_DB_URL"]  = $env:PATIENT_DB_URL }
            # Patient Service receives ONLY JWT_PUBLIC_KEY (no private key)
            $svcEnv["JWT_PUBLIC_KEY"]      = $publicKeyPath
            $svcEnv["JWT_ISSUER"]          = $jwtIssuer
        }
        "DoctorService" {
            $svcEnv["DOCTOR_DB_PASSWORD"] = $env:DOCTOR_DB_PASSWORD
            if ($env:DOCTOR_DB_USER) { $svcEnv["DOCTOR_DB_USER"] = $env:DOCTOR_DB_USER }
            if ($env:DOCTOR_DB_URL)  { $svcEnv["DOCTOR_DB_URL"]  = $env:DOCTOR_DB_URL }
            # Doctor Service receives ONLY JWT_PUBLIC_KEY (no private key)
            $svcEnv["JWT_PUBLIC_KEY"]     = $publicKeyPath
            $svcEnv["JWT_ISSUER"]         = $jwtIssuer
        }
        "APIGateway" {
            if ($env:EUREKA_URL) { $svcEnv["EUREKA_URL"] = $env:EUREKA_URL }
        }
    }

    Start-JavaService -Name $svcName -JarPath $info.Jar -LogFile $info.Log -ServiceEnv $svcEnv | Out-Null

    # Wait and verify actual health and listening port
    $healthy = Wait-ForHealth -name $svcName -port $port -healthUrl $healthUrl
    if (-not $healthy) {
        Write-Host "[$svcName] Startup check failed! Check log at $($info.Log)" -ForegroundColor Red
        if (Test-Path "$($info.Log).err") {
            Get-Content "$($info.Log).err" -Tail 15 | Write-Host -ForegroundColor DarkRed
        }
    }
}

# --- Optional Frontend ---
if (-not $SkipFrontend -and (Test-Path $frontend)) {
    $fePort = 5173
    $fePid = Get-PortPID $fePort
    if ($fePid -and -not $RestartAll -and -not ($Restart -contains "Frontend")) {
        Write-Host "[Frontend] Already running on port $fePort (PID $fePid)" -ForegroundColor Green
    } else {
        if ($fePid) { Stop-PortProcess $fePort "Frontend" }
        Write-Host "`n[Frontend] Starting Vite dev server..."
        $feLog = Join-Path $logDir "frontend.log"
        $feCmd = "cd /d `"$frontend`" && npm run dev"
        $pFe = Start-Process cmd `
            -ArgumentList @("/c", $feCmd) `
            -WorkingDirectory $frontend `
            -RedirectStandardOutput $feLog `
            -RedirectStandardError "$feLog.err" `
            -NoNewWindow `
            -PassThru
        Write-Host "[Frontend] Started (PID=$($pFe.Id), log=$feLog)"
    }
}

# --- Final Health Summary ---
Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "                SERVICE HEALTH STATUS" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

foreach ($svcName in $services.Keys) {
    $info = $services[$svcName]
    $port = $info.Port
    $pidVal = Get-PortPID $port
    $isHealthy = if ($pidVal) { Test-ServiceHealth $info.HealthUrl ($svcName -eq "Eureka") } else { $false }
    if ($isHealthy) {
        Write-Host ("  {0,-16} : {1,-5} [UP]  PID: {2}" -f $svcName, $port, $pidVal) -ForegroundColor Green
    } else {
        Write-Host ("  {0,-16} : {1,-5} [DOWN] - see {2}" -f $svcName, $port, $info.Log) -ForegroundColor Red
    }
}

Write-Host "`nEndpoints:"
Write-Host "  Eureka Dashboard : http://localhost:8761"
Write-Host "  API Gateway      : http://localhost:8080"
Write-Host "  Auth Service     : http://127.0.0.1:8082/actuator/health"
Write-Host "  Patient Service  : http://127.0.0.1:8081/actuator/health"
Write-Host "  Doctor Service   : http://127.0.0.1:8083/actuator/health"
Write-Host "  Doctor Catalog   : http://localhost:8080/api/doctors/catalog"
Write-Host "  Swagger UI       : http://localhost:8083/swagger-ui/index.html"
Write-Host "  Logs Directory   : $logDir`n"
