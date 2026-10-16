# PI Studio - Quick Test Script
# Run this in PowerShell on Windows to verify the installed app works

$InstallerPath = Join-Path $PSScriptRoot "dist\PI Studio Setup.exe"
$AppPath = Join-Path $env:LOCALAPPDATA "Programs\PI Studio\PI Studio.exe"

if (-not (Test-Path $InstallerPath)) {
    Write-Host "ERROR: Installer not found at $InstallerPath (run: npm run build)" -ForegroundColor Red
    exit 1
}

Write-Host "=== PI Studio Test ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Installer path: $InstallerPath" -ForegroundColor Green
Write-Host "Installer size: $([math]::Round((Get-Item $InstallerPath).Length / 1MB, 1)) MB" -ForegroundColor Green
Write-Host ""

# Test 1: Check installer is a valid PE
$bytes = [System.IO.File]::ReadAllBytes($InstallerPath)
$peSignature = [System.Text.Encoding]::ASCII.GetString($bytes[0..1])
if ($peSignature -eq "MZ") {
    Write-Host "[PASS] Valid PE executable (MZ header found)" -ForegroundColor Green
} else {
    Write-Host "[FAIL] Not a valid PE executable" -ForegroundColor Red
    exit 1
}

# Test 2: Install silently, then run the installed app
Write-Host ""
Write-Host "Installing silently..." -ForegroundColor Yellow
$installer = Start-Process -FilePath $InstallerPath -ArgumentList "/S" -PassThru -Wait -ErrorAction SilentlyContinue
if ($installer -eq $null -or $installer.ExitCode -ne 0) {
    Write-Host "[FAIL] Silent install failed (exit code: $($installer.ExitCode))" -ForegroundColor Red
    exit 1
}
Write-Host "[PASS] Silent install finished" -ForegroundColor Green

Write-Host ""
Write-Host "Starting installed app (will show connect page if no PI STUDIO running)..." -ForegroundColor Yellow
Write-Host "Close the window to continue the test." -ForegroundColor Yellow
Write-Host ""

# Start the app and wait for it to exit
$process = Start-Process -FilePath $AppPath -PassThru -Wait -ErrorAction SilentlyContinue

if ($process -eq $null) {
    Write-Host "[FAIL] Could not start the installed app" -ForegroundColor Red
} else {
    Write-Host "[PASS] Exe started and exited cleanly (exit code: $($process.ExitCode))" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Test Complete ===" -ForegroundColor Cyan