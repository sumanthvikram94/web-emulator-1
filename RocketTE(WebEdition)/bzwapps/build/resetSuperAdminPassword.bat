@echo off
REM © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
REM ROCKET SOFTWARE, INC. CONFIDENTIAL

@echo off
choice /m "Are you sure to reset 'SuperAdmin' password to default? "
goto %ERRORLEVEL%
:1
goto reset
:2
echo "Cancelled reset 'SuperAdmin' password."
goto end
:reset
set filepath=..\deploy\product\ZLUX\pluginStorage\com.rs.bzadm\_internal\services\auth\
REM copy spadmahtctidt.json %filepath%
DEL /S %filepath%\spadmahtctidt.json
echo 'SuperAdmin' password have been reset to default
pause
:end
