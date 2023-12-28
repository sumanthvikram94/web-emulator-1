@echo off
REM © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
REM ROCKET SOFTWARE, INC. CONFIDENTIAL

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
echo serviceDelete.bat starts running
echo ------------------------------------------------
echo Checking server environment...
echo NODE_PATH=%NODE_PATH%

node --harmony "%~dp0../lib/server/genNssmCmd.js" "d"
if errorlevel 1  (
  echo Service deletion failed. This command will close in 5 seconds.
  TIMEOUT /T 5
  exit /b %errorlevel%
)

echo ------------------------------------------------
echo Starts windows service deletion
call "%~dp0..\lib\server\nssmRemove.bat"
if errorlevel 1  (
  echo Service deletion failed. This command will close in 10 seconds.
  TIMEOUT /T 10
  exit /b %errorlevel%
)

echo ------------------------------------------------
echo Windows service deletion succeed
TIMEOUT /T 5

endlocal
@echo on

REM 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
REM ROCKET SOFTWARE, INC. CONFIDENTIAL
