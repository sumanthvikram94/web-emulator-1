/**
 * Sets process.env.XXXX
 */
'use strict';
const path = require('path');
const jsonUtils = require("../zlux/zlux-proxy-server/js/jsonUtils.js");
const os = require("os");
const cpuCount = os.cpus().length;

class BzwEnvSetter{
    constructor(){
    }

    setEnvs(){
        this.setAppMode();
        this.setBzRunOnPm2();
        /*
        * bcrypto library uses NODE_BACKEND to decide whether to use "js" or "native" libraries. "native" is OS dependent, we should use "js".
        */
        process.env.NODE_BACKEND = 'js'
    }

    setDefaultLoggerType(){
        process.env.BZ_LOGGER_TYPE = 'console';
        // process.env.BZ_LOGGER_FILE_NAME = null;
    }

    setAppMode(){
        process.env.APP_MODE = 'STANDALONE';
    }

    setBzRunOnPm2(){
        // there is another ENV Varible "BZ_RUN_ON_PM2" which is provided by PM2.
        const serverConfig = jsonUtils.parseJSONWithComments(path.resolve(__dirname, 'windowServer.json'));
        const appConfig = serverConfig && serverConfig.apps? serverConfig.apps[0]: null;
        const appName = appConfig.name
        process.env.BZ_APP_NAME = (appName && appName.length) > 0? appName: 'Rocket TE Web Edition'
        if (appConfig && appConfig.exec_mode && appConfig.exec_mode.toLowerCase() === 'cluster'){
            process.env.BZ_EXEC_MODE = 'CLUSTER';
            
            if (appConfig.instances){
                let instances = 0;
                instances = Number.parseInt(appConfig.instances);
                if (instances < 0 ){
                    instances = cpuCount + instances;
                }
                if (instances > 0 ){
                    process.env.minWorkers=instances;
                }
            }
        }else {
            process.env.BZ_EXEC_MODE = 'FORK';
        }
    }
}

const bzwEnvSetter = new BzwEnvSetter();

module.exports = bzwEnvSetter;
