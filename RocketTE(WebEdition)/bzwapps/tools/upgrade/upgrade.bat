
@echo off
REM © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
REM ROCKET SOFTWARE, INC. CONFIDENTIAL
node "%~dp0/../../lib/server/enviorment.js" > node_args.txt
set /p node_args= < node_args.txt
del node_args.txt
call node %node_args% "%~dp0/lib/one-stop.js" %*

TIMEOUT /T 10
@echo on
