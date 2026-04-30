@echo off
cd /d "%~dp0"
echo Starting ClaimShield AI backend on http://127.0.0.1:8000
node claimshield-backend.js
pause
