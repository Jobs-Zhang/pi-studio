@echo off
echo === PI Studio Quick Test ===
echo.
echo Checking installer...
if exist "dist\PI Studio Setup.exe" (
    echo [OK] Installer found
    for %%A in ("dist\PI Studio Setup.exe") do echo [OK] File size: %%~zA bytes
) else (
    echo [FAIL] Installer not found. Run: npm run build
    exit /b 1
)
echo.
echo Installing silently...
start /wait "" "dist\PI Studio Setup.exe" /S
echo.
echo Starting app... Close the window when done testing.
start "" "%LOCALAPPDATA%\Programs\PI Studio\PI Studio.exe"
echo.
echo === Done ========
