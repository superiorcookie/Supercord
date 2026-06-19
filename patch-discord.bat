@echo off
echo ========================================================
echo Patching official Discord stable with Supercord-Core...
echo ========================================================
echo.

cd Supercord-core
call npm run inject

echo.
echo ========================================================
echo Done! Please fully restart Discord to see Supercord-Core.
echo ========================================================
pause
