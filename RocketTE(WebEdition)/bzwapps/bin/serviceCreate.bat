@echo off
REM © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
REM ROCKET SOFTWARE, INC. CONFIDENTIAL

@echo off
REM validate the applicaiton is deployed
if not exist "%~dp0../deploy/instance/ZLUX" (
  echo please run ../build/bzwDeploy first
  pause
  goto :eof
)

REM Use Administrator to start window service
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
echo ================================================
echo serviceCreate.bat starts running
echo ------------------------------------------------
echo Checking server environment...

set bzwNodePath=%~dp0../lib/zlux/zlux-proxy-server/js/node_modules
REM set bzwappsPath="%~dp0";

REM don't set node_path, if the path contains spaces and parentheses in windows 2022, it could't start service when try 'Run as administrator' from right menu
REM set NODE_PATH= %bzwNodePath%;%NODE_PATH% 
REM echo NODE_PATH=%NODE_PATH%


echo ------------------------------------------------
echo Starts format the config file
call node --harmony "%~dp0../lib/server/formatConfig.js"
if errorlevel 1 ( 
  echo Failed to format the config file, please check the "%~dp0..\lib\server\windowServer.json"
  TIMEOUT /T 10
  exit /b %errorlevel%
)


node --harmony "%~dp0../lib/server/genNssmCmd.js" 
if errorlevel 1  (
  echo Service creation failed. This command will close in 5 seconds.
  TIMEOUT /T 5
  exit /b %errorlevel%
)

echo ------------------------------------------------
echo Server pre-start check begin
call node --harmony "%~dp0../lib/server/preStartCheck.js"
if errorlevel 1  (
  if %errorlevel% NEQ 200 ( REM 200 means the config.json is changed, but not an error
     echo Server pre-start check failed. This command will close in 10 seconds.
     TIMEOUT /T 10
     exit /b %errorlevel%
  )
)


echo ------------------------------------------------
echo Starts windows service creation
call "%~dp0..\lib\server\nssmInstall.bat"
if errorlevel 1  (
  echo Service creation failed. This command will close in 10 seconds.
  TIMEOUT /T 10
  exit /b %errorlevel%
)

echo ------------------------------------------------
echo Windows service creation succeed
TIMEOUT /T 5

endlocal
@echo on

REM 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
REM ROCKET SOFTWARE, INC. CONFIDENTIAL
