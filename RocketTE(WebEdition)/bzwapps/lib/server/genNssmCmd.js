/**
 * Generates the nssm commands into bat file.
 * @author: Jian Gao
 */

'use strict';
const path = require('path');
const jsonUtils = require('../zlux/zlux-proxy-server/js/jsonUtils.js');
const fs = require('../zlux/zlux-proxy-server/js/node_modules/fs-extra');

const nodeWorkDir = path.join(__dirname, '../../bin/');
const configFile = path.join(__dirname, './windowServer.json');
const nssmDir = path.join(__dirname, '/nssm-2.24', (isOSWin64() ? '/win64' : '/win32'));
const action = process.argv[2] && process.argv[2].toLowerCase() === 'd'? 'DELETE': 'CREATE';

try {
    const config = jsonUtils.parseJSONWithComments(configFile);
    const appConfig = config.apps[0];
    const nodeScript = path.join(nodeWorkDir, appConfig.script);
    const serviceName = appConfig.name.replace(/ /g,'');
    const nssmPathCmd = `set PATH=%PATH%;${nssmDir};`
    // Add """ to solve issues when space in the path.
    let nodeArgs=appConfig.node_args
    if(appConfig.env.NODE_OPTIONS){  // add options into arg
       nodeArgs+=(" "+ appConfig.env.NODE_OPTIONS)  
    }
    const nssmInstallCmd = `nssm install ${serviceName} "node" "${nodeArgs}" """${nodeScript}""" "${appConfig.args}" `;
    const exitOnErrCmd = 'if errorlevel 1  ( exit /b %errorlevel% )';
    const nssmAppDirCmd = `nssm set ${serviceName} AppDirectory ${nodeWorkDir}`;
    // const logFile = path.join(nodeWorkDir, appConfig.log_file? appConfig.log_file: '/../log/server.log');
    // const errFile = path.join(nodeWorkDir, appConfig.error_file? appConfig.error_file: '/../log/server.log');
    // const nssmOutCmd = `nssm set ${serviceName} AppStdout ${logFile}`; // Set out file
    // const nssmErrCmd = `nssm set ${serviceName} AppStderr ${errFile}`; // Set err file
    const nssmDisplayNameCmd = `nssm set ${serviceName} DisplayName ${appConfig.name}`; // Display name of the service
    const nssmDescriptionCmd = `nssm set ${serviceName} Description ${appConfig.desription}`; // Service description
    const nssmNodePathCmd = `nssm set ${serviceName} AppEnvironmentExtra  NODE_PATH=${appConfig.env.NODE_PATH};${process.env.NODE_PATH || ''}`; // ENV var NODE_PATH
    // const nssmOutShareModeCmd = `nssm set ${serviceName} AppStdoutShareMode 3`; // 3 - read and write, 7 read, write and delete
    // const nssmErrShareModeCmd = `nssm set ${serviceName} AppStderrShareMode 3`;
    // const nssmRotateFilesCmd = `nssm set ${serviceName} AppRotateFiles 1`; // Enable rotate on restart
    // const nssmRotateOnlineCmd = `nssm set ${serviceName} AppRotateOnline 1`; // Enalbe online rotate
    // const nssmRotateSecondsCmd = `nssm set ${serviceName} AppRotateSeconds 86400`; // 24 hours // Bypass rotate if file is created within 24 hours
    // const nssmRotateBytesCmd = `nssm set ${serviceName} AppRotateBytes 1048576`; // 1M // Bypass rotate if file is smaller than 1 M
    const nssmStartCmd = `nssm start ${serviceName}`; // Start service
    const nssmStopCmd = `nssm stop ${serviceName}`; // Stop service
    const nssmRemoveCmd = `nssm remove ${serviceName} confirm`; // Remove without nssm GUI

    // Output service info to command
    console.log('------------------------------------------------');
    console.log('Checking sevice information...');
    console.log('Service name is: ' + appConfig.name);
    console.log('Action is: ' + action);

    if (action === 'DELETE'){
        const cmdRemoveFile = path.join(__dirname, 'nssmRemove.bat');
        writeCmd(cmdRemoveFile, [nssmPathCmd, 
                                nssmStopCmd, exitOnErrCmd, 
                                nssmRemoveCmd]);
    } else {
        console.log('Node.js work directory: ' + nodeWorkDir);
        // console.log('Service log file will be: ' + logFile);
        // console.log('Service error file will be: ' + errFile);
        const cmdInstallFile = path.join(__dirname, 'nssmInstall.bat');
        writeCmd(cmdInstallFile, [nssmPathCmd, nssmInstallCmd, exitOnErrCmd, nssmAppDirCmd, 
            // BZW node.js will handle logging, so bypass all log related configurations.
            // nssmOutCmd, nssmErrCmd, nssmOutShareModeCmd, nssmErrShareModeCmd, nssmRotateFilesCmd, nssmRotateOnlineCmd, nssmRotateSecondsCmd, nssmRotateBytesCmd,
            nssmDisplayNameCmd, nssmDescriptionCmd, nssmNodePathCmd, 
            nssmStartCmd, exitOnErrCmd]);
    }

} catch(e) {
    console.error('Error encountered!');
    console.error(e);
    process.exit(1);
}

function isOSWin64() {
    return process.arch === 'x64' || process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432');
}

function writeCmd(cmdFile, cmds) {
    let cmdLines = '@ECHO OFF\n'+
        'setlocal enabledelayedexpansion\n';
    for (const cmd of cmds){
        cmdLines += cmd + '\n';
    }
    cmdLines += 'endlocal\n';
    fs.writeFileSync(cmdFile, cmdLines, {encoding:'utf8'});
}