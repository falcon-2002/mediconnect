@echo off
echo Stopping all MediConnect services...
FOR /F "tokens=5" %%P IN ('netstat -ano 2^>nul ^| findstr ":8761 " ^| findstr "LISTENING"') DO (
    IF NOT "%%P"=="0" (echo Stopping Eureka on :8761 (PID %%P) & taskkill /PID %%P /F >nul 2>&1)
)
FOR /F "tokens=5" %%P IN ('netstat -ano 2^>nul ^| findstr ":8082 " ^| findstr "LISTENING"') DO (
    IF NOT "%%P"=="0" (echo Stopping AuthService on :8082 (PID %%P) & taskkill /PID %%P /F >nul 2>&1)
)
FOR /F "tokens=5" %%P IN ('netstat -ano 2^>nul ^| findstr ":8081 " ^| findstr "LISTENING"') DO (
    IF NOT "%%P"=="0" (echo Stopping PatientService on :8081 (PID %%P) & taskkill /PID %%P /F >nul 2>&1)
)
FOR /F "tokens=5" %%P IN ('netstat -ano 2^>nul ^| findstr ":8083 " ^| findstr "LISTENING"') DO (
    IF NOT "%%P"=="0" (echo Stopping DoctorService on :8083 (PID %%P) & taskkill /PID %%P /F >nul 2>&1)
)
FOR /F "tokens=5" %%P IN ('netstat -ano 2^>nul ^| findstr ":8080 " ^| findstr "LISTENING"') DO (
    IF NOT "%%P"=="0" (echo Stopping APIGateway on :8080 (PID %%P) & taskkill /PID %%P /F >nul 2>&1)
)
FOR /F "tokens=5" %%P IN ('netstat -ano 2^>nul ^| findstr ":5173 " ^| findstr "LISTENING"') DO (
    IF NOT "%%P"=="0" (echo Stopping Frontend on :5173 (PID %%P) & taskkill /PID %%P /F >nul 2>&1)
)
echo Done.
pause
