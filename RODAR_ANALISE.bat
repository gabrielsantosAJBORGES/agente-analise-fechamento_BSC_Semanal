@echo off
chcp 65001 > nul
echo ====================================================
echo   INICIANDO AGENTE DE ANALISE DE FECHAMENTO SEMANAL
echo ====================================================
cd /d "%~dp0"
node src/analyze.js
echo.
echo Pressione qualquer tecla para sair...
pause > nul
