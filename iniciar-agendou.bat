@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Agendou
where node >nul 2>nul || (echo Instale o Node.js 22 ou mais novo: https://nodejs.org & pause & exit /b 1)
echo Verificando dependencias (na primeira vez leva alguns minutos)...
call npm install --no-audit --no-fund || (echo Falha no npm install & pause & exit /b 1)
echo.
echo Agendou rodando em http://localhost:3000
echo   Pagina publica: http://localhost:3000/barbearia-exemplo
echo   Painel:         http://localhost:3000/painel  (dono@agendou.dev / agendou123)
echo Para parar, feche esta janela.
echo.
start "" cmd /c "timeout /t 10 >nul & start http://localhost:3000"
call npm run dev
pause
