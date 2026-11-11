@echo off
chcp 65001 > nul
echo ====================================================
echo   ENVIANDO PROJETO PARA O GITHUB (gabrielsantosAJBORGES)
echo ====================================================
cd /d "%~dp0"
git remote set-url origin https://gabrielsantosAJBORGES@github.com/gabrielsantosAJBORGES/agente-analise-fechamento_BSC_Semanal.git
git push -u origin main
echo.
echo Concluido! Pressione qualquer tecla para fechar...
pause > nul
