@echo off
echo Stopping all MediConnect services...
FOR /F "tokens=5" %%P IN ('netstat -ano ^| findstr ":8761 " 2^>nul') DO (
    IF NOT "%%P"=="0" (echo Killing PID %%P on :8761 & taskkill /PID %%P /F >nul 2>&1)
)
FOR /F "tokens=5" %%P IN ('netstat -ano ^| findstr ":8081 " 2^>nul') DO (
    IF NOT "%%P"=="0" (echo Killing PID %%P on :8081 & taskkill /PID %%P /F >nul 2>&1)
)
FOR /F "tokens=5" %%P IN ('netstat -ano ^| findstr ":8080 " 2^>nul') DO (
    IF NOT "%%P"=="0" (echo Killing PID %%P on :8080 & taskkill /PID %%P /F >nul 2>&1)
)
FOR /F "tokens=5" %%P IN ('netstat -ano ^| findstr ":5173 " 2^>nul') DO (
    IF NOT "%%P"=="0" (echo Killing PID %%P on :5173 & taskkill /PID %%P /F >nul 2>&1)
)
echo Done.
pause
