@echo off
REM © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
REM ROCKET SOFTWARE, INC. CONFIDENTIAL

setlocal

REM Records the parameters into temp file, otherwise they are lost after getadmin

for %%i in (%1) do (
  echo %%i >"%~dp0sdArgs.temp"
)

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

setlocal enabledelayedexpansion

echo ---------------------------------------------------------------------
echo Checking environment variables

set PROXY_SERVER_LIB="%~dp0../lib/zlux/zlux-proxy-server"
set NODE_PATH=%PROXY_SERVER_LIB%/js/node_modules;%NODE_PATH%
echo NODE_PATH = %NODE_PATH%
REM PM2 HOME path should remove double quotes when set it.
set PM2_SERVER_LIB=%~dp0../lib/zlux/zlux-proxy-server/js/node_modules/.bin
set PATH=%PATH%;%PM2_SERVER_LIB%
set PM2_HOME=%PM2_SERVER_LIB%
echo PM2_HOME=%PM2_HOME%
set ZLUX_NODE_LOG_DIR="%~dp0../log"
if not exist %ZLUX_NODE_LOG_DIR% mkdir %ZLUX_NODE_LOG_DIR%

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
REM Gets the parameter
IF exist "%~dp0sdArgs.temp" (
    set /p SERVICE_DISP_NAME=<"%~dp0sdArgs.temp"
    call del "%~dp0sdArgs.temp"
    set SERVICE_DISP_NAME=!SERVICE_DISP_NAME:"=!
)

IF "!SERVICE_DISP_NAME!" == "" (
    REM echo SERVICE_DISP_NAME is empty
    call node --harmony "%~dp0../lib/server/formatConfig.js"
    if errorlevel 1 ( 
        echo Failed to format the config file, please check the "%~dp0..\lib\server\windowServer.json"
        TIMEOUT /T 10
        goto :eof
    )

    REM reads the service display name from windowServerFormat.json
    FOR /F delims^=^"^ tokens^=4 %%G IN ('type "%~dp0..\lib\server\windowServerformat.json" ^| findstr "\"name\":" ') do (
        set SERVICE_DISP_NAME=%%G
    )
    REM sets the default value if the above read fails
    IF "!SERVICE_DISP_NAME!" == "" (
        echo Could not find the server name, please check the "%~dp0..\lib\server\windowServer.json"
        REM set SERVICE_DISP_NAME="Rocket BlueZone Web"  
        TIMEOUT /T 10
        goto :eof
    )
    echo Server name is: !SERVICE_DISP_NAME!
) else (
    echo Server name received from argument: !SERVICE_DISP_NAME!
)


echo ---------------------------------------------------------------------
echo Checking server status

REM This is to hide the warnings when pm2 deamon starts on node.js V14. 
REM Seems node.js V14 doesn't like one of the pm2 dependencies: shelljs 
call pm2 list > nul 2>&1

REM check whether application already running.
call pm2 show "!SERVICE_DISP_NAME!" > nul 2>&1
if errorlevel 1 ( 
  echo Server with name "!SERVICE_DISP_NAME!" is not running
  echo shutdown skipped
  TIMEOUT /T 10
  goto :eof
)
echo Found running server: !SERVICE_DISP_NAME!

echo ---------------------------------------------------------------------
echo Stopping the application "!SERVICE_DISP_NAME!"
call pm2 delete "!SERVICE_DISP_NAME!" > !ZLUX_NODE_LOG_DIR!\nodeServer_shutdown.log 2>&1
echo Application stopped, list of active applciations:
call pm2 list --no-color
REM kill the pm2 deamon if no application is running
FOR /F "usebackq" %%G IN (`pm2 jlist`) do (
    if /I "%%G" EQU "[]" (
      echo Stopping PM2 deamon process
      call pm2 kill > nul 2>&1
  ) 
)
echo ---------------------------------------------------------------------
echo !SERVICE_DISP_NAME! server shutdown successfully
TIMEOUT /T 5
endlocal
