@echo off
REM © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
REM ROCKET SOFTWARE, INC. CONFIDENTIAL

setlocal

REM Go To Administrator
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
if '%errorlevel%' NEQ '0' (
goto UACPrompt
) else ( goto gotAdmin )
:UACPrompt
echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin.vbs"
echo UAC.ShellExecute "%~s0", "", "", "runas", 1 >> "%temp%\getadmin.vbs"
"%temp%\getadmin.vbs"
exit /B
:gotAdmin

echo ---------------------------------------------------------------------
echo Checking environment variables
set ZLUX_NODE_LOG_DIR="%~dp0../log"
if not exist "%~dp0../log" mkdir %ZLUX_NODE_LOG_DIR%

set PROXY_SERVER_LIB=%~dp0../lib/zlux/zlux-proxy-server
set NODE_PATH=%PROXY_SERVER_LIB%/js/node_modules;%NODE_PATH%
echo NODE_PATH = %NODE_PATH%
REM PM2 HOME path should remove double quotes when set it.
set PM2_SERVER_LIB=%~dp0../lib/zlux/zlux-proxy-server/js/node_modules/.bin
set PATH=%PATH%;%PM2_SERVER_LIB%
set PM2_HOME=%PM2_SERVER_LIB%
echo PM2_HOME=%PM2_HOME%

echo ---------------------------------------------------------------------
echo Checking node.js installation

node -v
if errorlevel 1  (
  echo ******************************************
  echo ERROR: node.js executable not found
  echo Please set node.js installation path as the value of env variable: "NODE_HOME"
  TIMEOUT /T 10
  exit /b %errorlevel%
)

echo ---------------------------------------------------------------------
echo Checking server deployment

call node --harmony "%~dp0../lib/server/formatConfig.js"
if errorlevel 1 ( 
  echo Failed to format the config file, please check the "%~dp0..\lib\server\windowServer.json"
  TIMEOUT /T 10
  goto eof
)

REM reads the service display name from windowServerFormat.json
FOR /F delims^=^"^ tokens^=4 %%G IN ('type "%~dp0..\lib\server\windowServerformat.json" ^| findstr "\"name\":" ') do (
  set SERVICE_DISP_NAME=%%G
)
REM sets the default value if the above read fails
IF "%SERVICE_DISP_NAME%" == "" (
  echo Could not find the server name, please check the "%~dp0..\lib\server\windowServer.json"
  REM set SERVICE_DISP_NAME="Rocket BlueZone Web"  
  TIMEOUT /T 10
  goto eof
)

echo Server name is: %SERVICE_DISP_NAME%

if not exist "%~dp0../deploy/instance/ZLUX" (
  echo Required instance dir missing, please run ../build/bzwDeploy.bat
  pause
  goto eof
)
if not exist "%~dp0../deploy/product/ZLUX" (
  echo Required product dir missing, please run ../build/bzwDeploy.bat
  pause
  goto eof
)

echo ---------------------------------------------------------------------
echo Clearing the pid record

call del "%~dp0..\lib\server\pid.txt" > nul 2>&1

echo ---------------------------------------------------------------------
echo Checking server status

REM check whether application already running.
call pm2 show "%SERVICE_DISP_NAME%" > nul 2>&1
if not errorlevel 1 ( 
  echo '%SERVICE_DISP_NAME%' is already running.
  echo If you want to restart, please shutdown it and try again.
  TIMEOUT /T 10
  goto eof
)

setlocal enabledelayedexpansion

REM copy and change config.json which used for pm2 start / restart
set fn="%~dp0../lib/server/windowServer.json"
set base_path=%~dp0
set char_path=%base_path:\=/%

copy "%~dp0..\lib\server\windowServer.json" "%~dp0..\lib\server\config.json"

(for /f "usebackq tokens=*" %%i in (%fn%) do (
set s=%%i
set s=!s:"#BZW_CWD#"="%char_path%"!
echo !s!))>"%~dp0../lib/server/config.json"

echo Pre-start checking
call node --harmony "%~dp0../lib/server/preStartCheck.js"
if errorlevel 1  (
  if %errorlevel% NEQ 200 ( REM 200 means the config.json is changed, but not an error
     echo Server pre-start check failed. This command will close in 10 seconds.
     TIMEOUT /T 10
     exit /b %errorlevel%
  )
)

echo ---------------------------------------------------------------------
echo Starting server

REM The start script should not shutdown the old version server silently.
REM set SERVICE_ORIG_NAME="Rocket BlueZone Web Server"
rem call pm2 delete %SERVICE_ORIG_NAME% > %ZLUX_NODE_LOG_DIR%\nodeServer_shutdown.log 2>&1

REM Avoid showing the warnings when it starts on node.js V14
call pm2 start "%~dp0../lib/server/config.json" > "%~dp0../log/nodeServer_start.log" 2>&1
call pm2 list --no-color

echo ---------------------------------------------------------------------
call pm2 show "%SERVICE_DISP_NAME%" > nul 2>&1
if not errorlevel 1 ( 
  echo Server starting completed
) else (
  echo '%SERVICE_DISP_NAME%' start failed
)

TIMEOUT /T 10
endlocal
@echo on

:eof
REM (C) 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
