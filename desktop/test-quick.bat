@echo off
echo === PI Desktop Quick Test ===
echo.
echo Checking installer...
if exist "dist\PI Desktop Setup.exe" (
    echo [OK] Installer found
    for %%A in ("dist\PI Desktop Setup.exe") do echo [OK] File size: %%~zA bytes
) else (
    echo [FAIL] Installer not found. Run: npm run build
    exit /b 1
)
echo.
echo Installing silently...
start /wait "" "dist\PI Desktop Setup.exe" /S
echo.
echo Starting app... Close the window when done testing.
start "" "%LOCALAPPDATA%\Programs\PI Desktop\PI Desktop.exe"
echo.
echo === Done ========
