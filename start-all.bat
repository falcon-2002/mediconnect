@echo off
REM MediConnect - Start All Services
REM Works correctly even when stdin is piped/redirected (e.g. from CI or agent)

SET ROOT=%~dp0
SET BACKEND=%ROOT%backend
SET FRONTEND=%ROOT%frontend
SET LOGS=%ROOT%logs

IF NOT EXIST "%LOGS%" mkdir "%LOGS%"

echo Stopping any existing services on ports 8761, 8081, 8080, 5173...
FOR /F "tokens=5" %%P IN ('netstat -ano 2^>nul ^| findstr /R ":8761 \|:8081 \|:8080 \|:5173 "') DO (
    IF NOT "%%P"=="0" IF NOT "%%P"=="" (
        taskkill /PID %%P /F >nul 2>&1
    )
)
REM Short pause via ping (timeout.exe fails when stdin is piped)
ping -n 3 127.0.0.1 >nul

echo.
echo [1/4] Starting Eureka Discovery Server on port 8761...
start "Eureka-Discovery" /min cmd /c "java -jar "%BACKEND%\discovery-server\target\discovery-server-0.1.0-SNAPSHOT.jar" 1>"%LOGS%\eureka.log" 2>&1 <nul"

echo Waiting 22s for Eureka to be ready...
ping -n 23 127.0.0.1 >nul

netstat -ano | findstr ":8761 " >nul 2>&1
IF ERRORLEVEL 1 (
    echo WARNING: Eureka does not appear to be up yet. Check %LOGS%\eureka.log
) ELSE (
    echo Eureka is UP on :8761
)

echo.
echo [2/4] Starting Patient Service on port 8081...
start "Patient-Service" /min cmd /c "java -jar "%BACKEND%\patient-service\target\patient-service-0.1.0-SNAPSHOT.jar" 1>"%LOGS%\patient-service.log" 2>&1 <nul"

echo [3/4] Starting API Gateway on port 8080...
start "API-Gateway" /min cmd /c "java -jar "%BACKEND%\api-gateway\target\api-gateway-0.1.0-SNAPSHOT.jar" 1>"%LOGS%\api-gateway.log" 2>&1 <nul"

echo Waiting 22s for services to register with Eureka...
ping -n 23 127.0.0.1 >nul

echo.
echo [4/4] Starting Frontend (Vite) on port 5173...
start "Frontend-Vite" /min cmd /c "cd /d "%FRONTEND%" && npm run dev 1>"%LOGS%\frontend.log" 2>&1 <nul"

echo Waiting 10s for Vite...
ping -n 11 127.0.0.1 >nul

echo.
echo ============================================================
echo  PORT STATUS
echo ============================================================
netstat -ano | findstr ":8761 " >nul 2>&1 && (echo   OK  Eureka       :8761) || (echo   !!  Eureka       :8761 NOT listening - see %LOGS%\eureka.log)
netstat -ano | findstr ":8081 " >nul 2>&1 && (echo   OK  PatientSvc   :8081) || (echo   !!  PatientSvc   :8081 NOT listening - see %LOGS%\patient-service.log)
netstat -ano | findstr ":8080 " >nul 2>&1 && (echo   OK  APIGateway   :8080) || (echo   !!  APIGateway   :8080 NOT listening - see %LOGS%\api-gateway.log)
netstat -ano | findstr ":5173 " >nul 2>&1 && (echo   OK  Frontend     :5173) || (echo   !!  Frontend     :5173 NOT listening - see %LOGS%\frontend.log)

echo.
echo ============================================================
echo  URLS
echo ============================================================
echo   Frontend  -^> http://localhost:5173
echo   Eureka    -^> http://localhost:8761
echo   Gateway   -^> http://localhost:8080
echo   Patients  -^> http://localhost:8080/api/patients
echo   Swagger   -^> http://localhost:8081/swagger-ui.html
echo.
echo Services are running in minimized windows in the taskbar.
echo Run stop-all.bat to stop everything.
echo Logs: %LOGS%
