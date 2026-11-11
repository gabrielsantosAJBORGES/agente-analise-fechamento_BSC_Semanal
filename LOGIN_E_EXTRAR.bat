@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ====================================================
echo 1. Abrindo janela isolada para login com gabriel.santos@ajborges.com
echo ====================================================
node src/login.js
if %ERRORLEVEL% EQU 0 (
    echo ====================================================
    echo 2. Sessao salva! Executando analise das 4 paginas...
    echo ====================================================
    node src/analyze.js
)
pause
