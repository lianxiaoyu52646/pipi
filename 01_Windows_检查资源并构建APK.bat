@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title PIPI 5.12.6 Offline Android Build

echo ===================================================
echo   PIPI V5.12.6 - 20 English classics offline APK build
echo ===================================================
echo   Source folder: %CD%
echo   Existing APK data and models will NOT be deleted.
echo.
where python >nul 2>nul
if errorlevel 1 (
  echo ERROR: Python 3 was not found. Install Python 3, then retry.
  goto :failed
)
echo [1/4] Get and validate all bundled English novels and wordbooks.
python prepare_offline.py
if errorlevel 1 (
  echo ERROR: Missing offline novel or dictionary asset.
  echo    All 20 complete Project Gutenberg novels must be present.
  echo    Full book is mandatory for a release-ready build.
  goto :failed
)
echo [2/4] Verify entire offline asset inventory.
python check_v5_release.py
if errorlevel 1 goto :failed
python verify_assets.py
if errorlevel 1 goto :failed
echo [3/4] Check available local voice model source.
if not defined PIPI_VOICE_SOURCE (
  if exist "%USERPROFILE%\Downloads\9 (2)\app\libs\sherpa-onnx-1.13.8.aar" (
    set "PIPI_VOICE_SOURCE=%USERPROFILE%\Downloads\9 (2)"
  ) else if exist "%USERPROFILE%\Downloads\3\app\libs\sherpa-onnx-1.13.8.aar" (
    set "PIPI_VOICE_SOURCE=%USERPROFILE%\Downloads\3"
  )
)
if defined PIPI_VOICE_SOURCE echo   Existing model source: %PIPI_VOICE_SOURCE%
if not defined PIPI_VOICE_SOURCE (
  echo ERROR: Cannot find an earlier project containing BOTH Piper and Kokoro.
  echo     Set PIPI_VOICE_SOURCE to your older complete Android Studio project.
  echo     Models are copied into this new APK at BUILD TIME, not downloaded on the phone.
  goto :failed
)
if not exist "%PIPI_VOICE_SOURCE%\app\src\main\assets\tts\vits-piper-en_US-lessac-low\en_US-lessac-low.onnx" (
  echo ERROR: Piper model not found in your existing project.
  goto :failed
)
if not exist "%PIPI_VOICE_SOURCE%\app\src\main\assets\tts\kokoro-int8-en-v0_19\model.int8.onnx" (
  echo ERROR: Kokoro model not found in your existing project.
  goto :failed
)
echo [4/4] Build with local Gradle or finish in Android Studio.
if exist "gradlew.bat" (
  call gradlew.bat --no-daemon :app:assembleDebug
  if errorlevel 1 goto :failed
  goto :success
)
where gradle >nul 2>nul
if not errorlevel 1 (
  call gradle --no-daemon :app:assembleDebug
  if errorlevel 1 goto :failed
  goto :success
)
echo   Your PC has no Gradle command on PATH.
echo   Open THIS directory in Android Studio and run :app:assembleDebug.
echo   Gradle will automatically import the old Piper/Kokoro binaries.
echo   Do not uninstall the old phone APK before checking matching signatures.
pause
exit /b 0
:success
echo.
echo BUILD SUCCESS. APK: app\build\outputs\apk\debug\app-debug.apk
echo IMPORTANT: Same applicationId does not guarantee same debug signature.
echo Export an in-app JSON backup before attempting an in-place upgrade.
pause
exit /b 0
:failed
echo.
echo BUILD STOPPED: the project was not verified as a complete APK.
echo Do not uninstall or clear data in the current phone App.
pause
exit /b 1
