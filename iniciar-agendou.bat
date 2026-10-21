@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Agendou
where node >nul 2>nul || (echo Instale o Node.js 22 ou mais novo: https://nodejs.org & pause & exit /b 1)
if not exist node_modules (
  echo Instalando dependencias pela primeira vez. Isso leva alguns minutos...
  call npm install || (echo Falha no npm install & pause & exit /b 1)
)
echo.
echo Agendou rodando em http://localhost:3000
echo   Pagina publica: http://localhost:3000/barbearia-exemplo
echo   Painel:         http://localhost:3000/painel  (dono@agendou.dev / agendou123)
echo Para parar, feche esta janela.
echo.
start "" cmd /c "timeout /t 8 >nul & start http://localhost:3000/barbearia-exemplo"
call npm run dev
pause
