@echo off
REM  get the node arguments from windowServer.json file
node "%~dp0/../lib/server/enviorment.js" > node_args.txt
set /p node_args= < node_args.txt
del node_args.txt
call node %node_args% "%~dp0/setup.js" %node_args%
