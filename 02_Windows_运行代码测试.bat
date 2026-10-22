@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 is required to run the JavaScript regression tests.
  pause
  exit /b 1
)
set FAIL=0
for %%F in (tests\*.js) do (
  echo RUN %%F
  node "%%F"
  if errorlevel 1 set FAIL=1
)
if "%FAIL%"=="1" (
  echo FAILED: at least one code test reported an error.
  pause
  exit /b 1
)
echo All JavaScript regression tests passed. This is NOT a substitute for device testing.
pause
