@echo off
REM Vanish Demo - Three Window Setup (Windows)
REM This script opens three terminals for the complete demo

echo ==========================================
echo    VANISH PRIVACY DEMO - Three Windows
echo ==========================================
echo.
echo Window 1: Pool Manager (The Settlement Layer)
echo Window 2: Sender (Account 0.0.8119040)
echo Window 3: Receiver (Account 0.0.8114260)
echo.
echo Press any key to start...
pause > nul

REM Start Pool Manager in Window 1
start "Pool Manager" cmd /k "cd /d %~dp0 && echo Pool Manager Starting... && npm run start:pool"

timeout /t 3 > nul

REM Start Sender in Window 2
start "Sender (0.0.8119040)" cmd /k "cd /d %~dp0 && echo Sender Agent Starting... && npm run start:vanish -- 0.0.8119040 302e020100300506032b657004220420a7940d2086e3cbf6fb541e55b5b9b6c3001b1164eb0f2d34ef51f2649174d171"

timeout /t 3 > nul

REM Start Receiver in Window 3
start "Receiver (0.0.8114260)" cmd /k "cd /d %~dp0 && echo Receiver Agent Starting... && npm run start:vanish -- 0.0.8114260 302e020100300506032b65700422042041484232ac82ef67ff45e3d45424ef64429583060d72222b20110c9cb187f11b"

echo.
echo ==========================================
echo Demo windows opened!
echo.
echo Demo Flow:
echo 1. In Sender window:   balance
echo 2. In Sender window:   transfer 0.0.8114260 2
echo 3. Watch Pool Manager process the batch
echo 4. In Receiver window: balance (should show 2 HBAR)
echo ==========================================
pause
