# MediConnect - Stop All Services
# Stops MediConnect services safely by verifying process identity and project ownership.
# Never terminates unrelated applications that happen to use a MediConnect port.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File stop-all.ps1
#   .\stop-all.bat
#   .\stop-all.bat -DryRun

[CmdletBinding()]
param(
    [Alias("n")]
    [switch]$DryRun,
    [string[]]$Service = @(),
    [switch]$Force
)

$ErrorActionPreference = "Continue"

$root     = $PSScriptRoot
$backend  = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$logDir   = Join-Path $root "logs"

# Define all MediConnect services with their expected ports, paths, and types
$serviceDefs = [ordered]@{
    "Eureka" = @{
        Port       = 8761
        Type       = "java"
        JarRel     = "backend\discovery-server\target\discovery-server-0.1.0-SNAPSHOT.jar"
        JarName    = "discovery-server-0.1.0-SNAPSHOT.jar"
    }
    "AuthService" = @{
        Port       = 8082
        Type       = "java"
        JarRel     = "backend\auth-service\target\auth-service-0.1.0-SNAPSHOT.jar"
        JarName    = "auth-service-0.1.0-SNAPSHOT.jar"
    }
    "PatientService" = @{
        Port       = 8081
        Type       = "java"
        JarRel     = "backend\patient-service\target\patient-service-0.1.0-SNAPSHOT.jar"
        JarName    = "patient-service-0.1.0-SNAPSHOT.jar"
    }
    "DoctorService" = @{
        Port       = 8083
        Type       = "java"
        JarRel     = "backend\doctor-service\target\doctor-service-0.1.0-SNAPSHOT.jar"
        JarName    = "doctor-service-0.1.0-SNAPSHOT.jar"
    }
    "APIGateway" = @{
        Port       = 8080
        Type       = "java"
        JarRel     = "backend\api-gateway\target\api-gateway-0.1.0-SNAPSHOT.jar"
        JarName    = "api-gateway-0.1.0-SNAPSHOT.jar"
    }
    "Frontend" = @{
        Port       = 5173
        Type       = "node"
        DirRel     = "frontend"
    }
}

function Get-CandidatePIDs {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port,
        [Parameter(Mandatory = $true)]
        [string]$ServiceName
    )
    $pids = [System.Collections.Generic.HashSet[int]]::new()

    # 1. Inspect TCP listening connections on the port
    try {
        $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if ($conns) {
            foreach ($c in $conns) {
                if ($c.OwningProcess -and $c.OwningProcess -gt 0) {
                    [void]$pids.Add([int]$c.OwningProcess)
                }
            }
        }
    } catch {}

    # 2. Fallback to netstat if Get-NetTCPConnection found nothing
    if ($pids.Count -eq 0) {
        try {
            $lines = netstat -ano 2>$null | Select-String ":$port\s+.*LISTENING"
            foreach ($line in $lines) {
                $parts = $line.Line.Trim() -split '\s+'
                $pVal = $parts[-1]
                if ($pVal -match '^\d+$' -and $pVal -ne '0') {
                    [void]$pids.Add([int]$pVal)
                }
            }
        } catch {}
    }

    # 3. Check for recorded PID file if present
    $pidFile = Join-Path $logDir "$serviceName.pid"
    if (Test-Path $pidFile) {
        try {
            $raw = (Get-Content $pidFile -ErrorAction SilentlyContinue).Trim()
            if ($raw -match '^\d+$') {
                [void]$pids.Add([int]$raw)
            }
        } catch {}
    }

    return @($pids)
}

function Test-ProcessOwnership {
    param(
        [int]$ProcessId,
        [hashtable]$ServiceInfo,
        [string]$ProjectRoot
    )

    $result = [PSCustomObject]@{
        Verified     = $false
        Reason       = ""
        ProcessName  = ""
        Executable   = ""
        CommandLine  = ""
        ExpectedPath = ""
    }

    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if (-not $proc) {
        $result.Reason = "Process not found or cannot be inspected (PID $ProcessId)"
        return $result
    }

    $result.ProcessName = $proc.Name
    $result.Executable  = $proc.ExecutablePath
    $result.CommandLine = $proc.CommandLine

    $type     = $ServiceInfo.Type
    $normCmd  = if ($proc.CommandLine) { $proc.CommandLine.Replace('/', '\') } else { "" }
    $normRoot = [System.IO.Path]::GetFullPath($ProjectRoot).Replace('/', '\')

    if ($type -eq "java") {
        $expectedJar = [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot $ServiceInfo.JarRel)).Replace('/', '\')
        $result.ExpectedPath = $expectedJar

        # Executable verification: must be java.exe
        $isJavaExe = ($proc.Name -ieq "java.exe" -or ($proc.ExecutablePath -and (Split-Path $proc.ExecutablePath -Leaf) -ieq "java.exe"))
        if (-not $isJavaExe) {
            $result.Reason = "Executable is '$($proc.Name)', expected 'java.exe'"
            return $result
        }

        # Command line verification:
        # Must contain exact canonical project JAR path
        if ($normCmd.IndexOf($expectedJar, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
            $result.Verified = $true
            return $result
        }

        # Or project root and JAR relative path
        $jarRel = $ServiceInfo.JarRel.Replace('/', '\')
        if ($normCmd.IndexOf($normRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and
            $normCmd.IndexOf($jarRel, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
            $result.Verified = $true
            return $result
        }

        # Or exact JAR filename combined with backend service folder path in project
        if ($normCmd.IndexOf($jarRel, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
            $result.Verified = $true
            return $result
        }

        $result.Reason = "CommandLine does not contain expected project JAR path: '$expectedJar'"
        return $result
    }
    elseif ($type -eq "node") {
        $expectedDir = [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot $ServiceInfo.DirRel)).Replace('/', '\')
        $result.ExpectedPath = $expectedDir

        $isNodeOrShell = ($proc.Name -imatch '^(node|cmd|powershell)\.exe$')
        if (-not $isNodeOrShell) {
            $result.Reason = "Executable is '$($proc.Name)', expected 'node.exe' or dev shell"
            return $result
        }

        if ($normCmd.IndexOf($expectedDir, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or
            ($normCmd -imatch 'vite' -and $normCmd.IndexOf($normRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0)) {
            $result.Verified = $true
            return $result
        }

        $result.Reason = "CommandLine does not reference project frontend directory: '$expectedDir'"
        return $result
    }

    $result.Reason = "Unknown service type: $type"
    return $result
}

# --- Execution ---

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " MediConnect - Stopping Services" -ForegroundColor Cyan
if ($DryRun) {
    Write-Host " [DRY-RUN MODE: Process checks only; no processes will be terminated]" -ForegroundColor Yellow
}
Write-Host "============================================================" -ForegroundColor Cyan

$servicesToProcess = if ($Service.Count -gt 0) {
    $serviceDefs.Keys | Where-Object { $Service -contains $_ }
} else {
    $serviceDefs.Keys
}

$summaryVerified = 0
$summarySkipped  = 0
$summaryNotRun   = 0

foreach ($name in $servicesToProcess) {
    $info = $serviceDefs[$name]
    $port = $info.Port

    $candidatePids = Get-CandidatePIDs -port $port -serviceName $name

    if (-not $candidatePids -or $candidatePids.Count -eq 0) {
        Write-Host "[-] $name is not running on port $port." -ForegroundColor DarkGray
        $summaryNotRun++
        continue
    }

    foreach ($pidVal in $candidatePids) {
        $check = Test-ProcessOwnership -ProcessId $pidVal -ServiceInfo $info -ProjectRoot $root

        if ($check.Verified) {
            $summaryVerified++
            Write-Host "[VERIFIED] PID $pidVal on port $port belongs to MediConnect $name." -ForegroundColor Green
            Write-Host "           Exe: $($check.Executable)" -ForegroundColor DarkGray
            Write-Host "           Jar: $($check.ExpectedPath)" -ForegroundColor DarkGray

            if ($DryRun) {
                Write-Host "           [DRY-RUN] Process verified; skipping termination." -ForegroundColor Yellow
            } else {
                Write-Host "           Stopping process $pidVal..." -ForegroundColor Cyan
                try {
                    Stop-Process -Id $pidVal -Force -ErrorAction SilentlyContinue
                    $pObj = Get-Process -Id $pidVal -ErrorAction SilentlyContinue
                    if ($pObj) {
                        $null = $pObj.WaitForExit(3000)
                    }
                } catch {}

                # Fallback taskkill if still alive
                $stillAlive = Get-Process -Id $pidVal -ErrorAction SilentlyContinue
                if ($stillAlive) {
                    taskkill /PID $pidVal /T /F >$null 2>&1
                    Start-Sleep -Milliseconds 500
                }

                $stillAlive = Get-Process -Id $pidVal -ErrorAction SilentlyContinue
                if (-not $stillAlive) {
                    Write-Host "           [OK] $name (PID $pidVal) stopped successfully." -ForegroundColor Green
                } else {
                    Write-Host "           [WARNING] Process $pidVal ($name) could not be terminated." -ForegroundColor Yellow
                }

                # Clean up PID file if present
                $pidFile = Join-Path $logDir "$name.pid"
                if (Test-Path $pidFile) {
                    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
                }
            }
        } else {
            $summarySkipped++
            Write-Host "[SKIP] Process on port $port (PID $pidVal, $($check.ProcessName)) does NOT belong to MediConnect $name!" -ForegroundColor Red
            Write-Host "       Reason: $($check.Reason)" -ForegroundColor Yellow
            if ($check.CommandLine) {
                Write-Host "       Command line: $($check.CommandLine)" -ForegroundColor DarkGray
            }
            Write-Host "       [PROTECTED] Process left untouched to prevent terminating unrelated applications." -ForegroundColor Red
        }
    }
}

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host " Stop Summary" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
if ($DryRun) {
    Write-Host " Verified MediConnect processes (would stop): $summaryVerified" -ForegroundColor Green
} else {
    Write-Host " Stopped MediConnect processes              : $summaryVerified" -ForegroundColor Green
}
Write-Host " Skipped unverified / unrelated processes   : $summarySkipped" -ForegroundColor $(if ($summarySkipped -gt 0) { "Red" } else { "DarkGray" })
Write-Host " Services not running                       : $summaryNotRun" -ForegroundColor DarkGray
Write-Host "============================================================" -ForegroundColor Cyan
