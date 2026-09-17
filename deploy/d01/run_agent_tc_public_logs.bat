@echo off
setlocal

set "DEPLOY_DIR=%~dp0"
set "DEPLOY_DIR=%DEPLOY_DIR:~0,-1%"
set "ENV_FILE=%DEPLOY_DIR%\web.env"
set "COMPOSE_FILE=%DEPLOY_DIR%\docker-compose.public.yml"

cd /d "%DEPLOY_DIR%"
docker compose --env-file "%ENV_FILE%" -f "%COMPOSE_FILE%" logs -f --tail 120
exit /b %ERRORLEVEL%
