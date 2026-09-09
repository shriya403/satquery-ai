@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
cd /d "%ROOT%" || (
  echo Failed to enter project directory: %ROOT%
  exit /b 1
)

set "BACKEND_PORT=8000"
set "FRONTEND_PORT=3000"
set "PYTHON=.venv\Scripts\python.exe"
set "DEMO_TIF=data\demo\sentinel2_pune_khadakwasla_20240304.tif"
set "NEXT_CMD=frontend\node_modules\.bin\next.cmd"

echo SatQuery AI demo startup
echo Project: %ROOT%
echo.

if not exist "%PYTHON%" (
  echo Missing Python virtual environment: %PYTHON%
  echo Create it first:
  echo   python -m venv .venv
  echo   .venv\Scripts\python.exe -m pip install -e ".[dev]"
  exit /b 1
)

if not exist "%DEMO_TIF%" (
  echo Missing real demo dataset: %DEMO_TIF%
  echo Create it first:
  echo   .venv\Scripts\python.exe tools\create_demo_dataset.py
  exit /b 1
)

if not exist "%NEXT_CMD%" (
  echo Missing frontend dependencies: %NEXT_CMD%
  echo Install them first:
  echo   cd frontend
  echo   npm.cmd install
  exit /b 1
)

call :FindListeningPid %BACKEND_PORT% BACKEND_PID
if defined BACKEND_PID (
  echo Port %BACKEND_PORT% is already in use by PID !BACKEND_PID!.
  call :ShowProcess !BACKEND_PID!
  echo.
  echo start-demo.cmd will not terminate existing processes.
  echo Stop or move the process using port %BACKEND_PORT%, then run this script again.
  exit /b 1
)

call :FindListeningPid %FRONTEND_PORT% FRONTEND_PID
if defined FRONTEND_PID (
  echo Port %FRONTEND_PORT% is already in use by PID !FRONTEND_PID!.
  call :ShowProcess !FRONTEND_PID!
  echo.
  echo start-demo.cmd will not terminate existing processes.
  echo Stop or move the process using port %FRONTEND_PORT%, then run this script again.
  exit /b 1
)

echo Starting backend on http://127.0.0.1:%BACKEND_PORT%
start "SatQuery AI API :%BACKEND_PORT%" /D "%ROOT%" cmd /k "set SATQUERY_ALLOWED_ORIGINS=http://localhost:%FRONTEND_PORT%,http://127.0.0.1:%FRONTEND_PORT%&& .venv\Scripts\python.exe -m uvicorn satquery.api:app --host 127.0.0.1 --port %BACKEND_PORT%"

echo Starting frontend on http://localhost:%FRONTEND_PORT%
start "SatQuery AI Frontend :%FRONTEND_PORT%" /D "%ROOT%\frontend" cmd /k "set NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:%BACKEND_PORT%&& npm.cmd run dev"

echo.
echo When both windows say they are ready, open:
echo   http://localhost:%FRONTEND_PORT%
echo.
echo API health:
echo   http://127.0.0.1:%BACKEND_PORT%/health
exit /b 0

:FindListeningPid
set "%~2="
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /R /C:":%~1 .*LISTENING"') do (
  set "%~2=%%P"
  goto :eof
)
exit /b 0

:ShowProcess
tasklist /FI "PID eq %~1"
exit /b 0
