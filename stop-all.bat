@echo off
setlocal
set "SCRIPT_DIR=%~dp0"

REM MediConnect - Stop All Services
REM Stops MediConnect services safely by verifying process identity and project ownership.
REM Verifies each candidate process belongs to this project before stopping it,
REM using its executable and command line containing the exact project JAR path.
REM Skips and reports any process that cannot be verified to protect unrelated applications.

where powershell.exe >nul 2>&1
if errorlevel 1 (
    echo [ERROR] powershell.exe was not found in PATH.
    echo PowerShell is required to safely inspect process command lines and verify ownership.
    exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%stop-all.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

exit /b %EXIT_CODE%
