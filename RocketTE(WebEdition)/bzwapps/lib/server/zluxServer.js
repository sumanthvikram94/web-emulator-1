
/*
  © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
  ROCKET SOFTWARE, INC. CONFIDENTIAL
*/
'use strict';
// const resourceLoadService = require('../../app/bzshared/lib/services/resource-load.service');
const bzwEnvSetter = require('./bzwEnvSetter');
// Sets environment variables
bzwEnvSetter.setEnvs();

/**
 * Creates the global.COM_RS_COMMON_LOGGER. And create a default logger for 'com.rs.rte'.
 * The logger creation in zlux-proxy-server/js/util.js is invoked late, and not availabe for some services. So, invoking a similar logic earlier here.
 */
function initGlobalLogger() {
  if (!global.COM_RS_COMMON_LOGGER) {
      const loggerFile = require('../zlux/zlux-shared/src/logging/logger.js');
      global.COM_RS_COMMON_LOGGER = new loggerFile.Logger();
      global.COM_RS_COMMON_LOGGER.addDestination(global.COM_RS_COMMON_LOGGER.makeDefaultDestination(true,true,true));
  }
  global.COM_RS_RTE = {
      defaultLogger: global.COM_RS_COMMON_LOGGER.makeComponentLogger('com.rs.rte')
  }
}
initGlobalLogger();

// Sets logger
const BzwLogging = require('./bzwLogging');
const bzwLogger = new BzwLogging()
// Change the log configuration file before reading the same configuration
bzwLogger.applyLogConfigToken();
bzwLogger.setLogger();
bzwLogger.setLoggerRotate();

// Print the ENV variables
console.log(process.env);


// Apply auto-scaling configs
const autoScalingService = require('../../app/bzshared/lib/services/auto-scaling.service');
autoScalingService.applyAutoScalingConfigs();

/**
 * Exits the current process
 */
function exitProcess() {
  process.nextTick(() => {
    process.exit(1);
  });
}

const KNOWN_ERROR_CODES = [
  'ECONNRESET' // Socket connection failes. Especially for tls.connect(), the error can't be caught by .catch or error event.
];

/**
 * Close the logger before exit process
 * @param {*} err 
 */
function handleException(err){
  const msg = err.stack? err.stack: err.message;
  if (err.code && KNOWN_ERROR_CODES.includes(err.code)) { // In case some know error but can't be caught, print the error and don't shutdown.
    console.error(msg);
    return;
  }
  bzwLogger.closeOnError(msg, exitProcess);
}

/**
 * Log the unhandledRejection error
 * @param {*} err 
 */
function handleRejection(err){
  console.log('unhandledRejection :' + err);
}

/**
 * 
 * 
 */
function getHostSpecificIp(zluxConfig){
  return zluxConfig.node.hostIp
}

/**
 * Prepend the listners.
 */
process.prependListener('uncaughtException', handleException);
process.prependListener('unhandledRejection', handleRejection);

try{
  (
    //ok to require within function - only called once, at startup
    function(){
      // const process = require('process');
      console.log('NODE_PATH: ' + process.env.NODE_PATH);
      console.log('Runtime node.js version: ' + process.version + ';arch:'+process.arch +';platform:'+ process.platform);
      console.log('Starting application: ' + process.env.BZ_APP_NAME); // Write the app name and version into log file
      if (process.pid) {
  
        const fs = require('../zlux/zlux-proxy-server/js/node_modules/fs-extra');
        fs.writeFile('../lib/server/pid.txt', process.pid.toString(), (err) => {  
          if (err) throw err;
          // else success
          console.log('BZW PID = ' + process.pid + ' stored OK');
        });
        
      }
    }()
  );
  
  if (process.execArgv[0]) {
    process.execArgv[0] = process.execArgv[0].replace('-brk', ''); //JERRY for DEBUG purpose
  }

  // Reads arguments
  const {appConfig, configJSON, startUpConfig} = require('./zluxArgs')();

  //set logConfig to gobal config object
  configJSON.logConfig=bzwLogger.config
  //set hostSpecific Ip to environment for DB
  const hostSpicificIp=getHostSpecificIp(configJSON);
  if(hostSpicificIp){
    process.env.BZ_APP_HOSTADDRESS=hostSpicificIp;
  }
  // This is the case that server is started by PM2 or it's the "master" node
  if (process.env.BZ_EXEC_MODE === 'FORK' || process.env.BZ_RUN_ON_PM2 === 'TRUE'){
    const ProxyServer = require('../zlux/zlux-proxy-server/js/index');
    const bzdb = require('../../app/bzshared/lib/services/bzdb.service');
    const ClusterReqSerice = require('../../app/bzshared/lib/services/cluster-request.service');
    const context = {
      logger: console,
      plugin: {
        server: {
          config: {
            user: {
              node: configJSON.node
            }
          }
        }
      }
    }
    const crs = new ClusterReqSerice(context)
    const proxyServer = new ProxyServer(appConfig, configJSON, startUpConfig);
    console.log('BZDB service is starting!');
      bzdb.waitLoadReady().then(async () => {
        console.log('BZDB service is ready!');
        await crs.updatePeers()
        proxyServer.start().then(() =>{
          if (process.send) {
            process.send('ready');
          }
          console.log('Application server is ready!');
        }).catch(e => {
          console.warn('Application start failed!');
          handleException(e);
        });
      }).catch(e => {
        console.warn('BZDB service start failed!');
        handleException(e);
      });
  } else { // "slave" node and not on PM2
    const clusterManager = require('../zlux/zlux-proxy-server/js/clusterManager').clusterManager;
    clusterManager.start(appConfig, configJSON, startUpConfig);
  }
} catch (e) {
  handleException(e);
}
// run as:
// node --harmony mvdServer.js --config=../config/zluxserver.json [--hostServer=<z/os system>] [--hostPort=#]


/*
  © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
  ROCKET SOFTWARE, INC. CONFIDENTIAL
*/
