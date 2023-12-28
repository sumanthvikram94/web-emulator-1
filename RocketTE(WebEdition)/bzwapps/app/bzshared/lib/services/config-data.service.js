const fs = require('fs-extra');
const path = require('path');
const zoweService = require('./zowe.service');
const jsonUtils = zoweService.jsonUtils;

class ConfigDataService {

    /**
     * Constructor
     * @param {Object} context - The plugin context of which invoking this class
     */
    constructor(context){
        this.logger = context.logger;
        // this.CLUSTER_CONFIG_FILE_PATH = 'ZLUX/pluginStorage/com.rs.bzw/_internal/plugin/cluster.json';
        this.SERVER_CONFIG_FILE_PATH = 'ZLUX/serverConfig/zluxserver.json';
        // this.serverConfig = context.plugin.server.config;
        // this.pluginDef = context.plugin.pluginDef;
    }

    // getClusterConfigFilePath(){
    //     return this.CLUSTER_CONFIG_FILE_PATH;
    // }
    getServerConfigFilePath(){
        return this.SERVER_CONFIG_FILE_PATH;
    }

    /**
     * Write or override a config file
     * @param {Object} option - The option for configuration file
     * @param {string} option.path - The file name and path of the config file
     * @param {Object} option.data - The configuration data
     */
    writeConfigFile(option){
        return new Promise((resolve, reject) => {
            if (!option || !option.path ){
                resolve({ status: false, message: 'Invalid option' }) ;
            }
            const configData = option.data?option.data:{};
    
            try{
                const dir = path.dirname(option.path);
                // const filename = path.basename(path);
                this.createDirs(dir);
                fs.writeFile(option.path, JSON.stringify(configData, null, 2), (err) => {
                    if (err) {
                       return resolve({ status: false, message: e.message, fileName: option.name || option.path});
                    }

                    resolve({status: true, message: 'success', fileName: option.name || option.path});
                });
            }catch(e){
                this.logger.severe('EXCEPTION writing config file : ' + e.message);
                resolve({ status: false, message: e.message, fileName: option.name || option.path});
            }
        });
    }

    /**
     * Write or override a config file
     * @param {Object} option - The option for configuration file
     * @param {string} option.path - The file name and path of the config file
     * @param {Object} option.data - The configuration data
     */
    writeBinaryFile(option){
        return new Promise((resolve, reject) => {
            if (!option || !option.path ){
                resolve({ status: false, message: 'Invalid option' }) ;
            }
            const configData = option.data ? option.data:{};
    
            try{
                const dir = path.dirname(option.path);
                // const filename = path.basename(path);
                this.createDirs(dir);
                fs.writeFile(option.path, configData, 'binary',function(err) { 
                    if (err) {
                        return resolve({ status: false, message: err.message, fileName: option.name || option.path});
                    }

                    resolve({status: true, message: 'success', fileName: option.name || option.path});
                });
            }catch(e){
                this.logger.severe('EXCEPTION writing config file : ' + e.message);
                resolve({ status: false, message: e.message, fileName: option.name || option.path});
            }
        });
    }


    /**
     * Update an existing config file
     * @param {Object} option - The option for configuration file
     * @param {string} option.path - The file name and path of the config file
     * @param {Object} option.data - The configuration data
     */
    updateConfigFile(option){
        const that = this;
        return new Promise((resolve, reject) => {
            if (!option || !option.path || !option.data || typeof(option.data) !== 'object' ){
                resolve({ status: false, message: 'Invalid option' }) ;
            }

            try{
                if (!fs.existsSync(option.path)){
                    resolve({ status: false, message: 'File Not Exist' }) ;
                }

                let dataObj = jsonUtils.parseJSONWithComments(option.path);

                Object.assign(dataObj,option.data);
                that.logger.log(that.logger.FINER, 'New Config Data: ' + JSON.stringify(dataObj) );
                fs.writeFile(option.path, JSON.stringify(dataObj, null, 2), (err) => {
                    if (err){
                        resolve({status: false, message: err.message});
                    }
                    resolve({status: true, message: 'success'});
                });
            }catch(e){
                this.logger.severe('EXCEPTION updating config file : ' + e.message);
                resolve({ status: false, message: e.message});
            }
        });
    }

    
    /**
     * Read an existing config file
     * @param {Object} option - The option for configuration file
     * @param {string} option.path - The file name and path of the config file
     */
    readConfigFile(option){
        const that = this;
        return new Promise((resolve, reject) => {
            if (!option || !option.path || typeof(option.path) !== 'string' ){
                resolve({ status: false, message: 'Invalid option' }) ;
            }

            try{
                if (!fs.existsSync(option.path)){
                    resolve({ status: false, message: 'File Not Exist' }) ;
                }
                let dataObj = jsonUtils.parseJSONWithComments(option.path);
                resolve({status: true, data: dataObj});
            }catch(e){
                this.logger.severe('EXCEPTION updating config file : ' + e.message);
                resolve({ status: false, message: e.message});
            }
        });
    }
    
    /**
     * Delete an existing config file
     * @param {Object} option - The option for configuration file
     * @param {string} option.path - The file name and path of the config file
     */
    deleteConfigFile(option){
        return new Promise((resolve, reject) => {
            if (!option || !option.path || typeof(option.path) !== 'string' ){
                resolve({ status: false, message: 'Invalid option' }) ;
            }

            try{
                if (!fs.existsSync(option.path)){
                    resolve({ status: false, message: 'File Not Exist' }) ;
                }

                fs.unlink(option.path, (err) => {
                    if (err){
                        resolve({status: false, message: err.message});
                    }
                    resolve({status: true, message: 'success', fileName: option.name || option.path});
                });
            }catch(e){
                this.logger.severe('EXCEPTION deleting file : ' + e.message);
                resolve({ status: false, message: e.message, fileName: option.name || option.path});
            }
        });
    }

    /**
     * Creates the dir and the parent dirs if not exist.
     * @param {string} dirpath 
     */
    createDirs(dirpath) {
        if(dirpath.indexOf(".json")>0){
           dirpath=path.dirname(dirpath); 
        }
        if (!fs.existsSync(path.dirname(dirpath))) {
            this.createDirs(path.dirname(dirpath));
        }
        if (!fs.existsSync(dirpath)) {
            fs.mkdirSync(dirpath);
        }
     }

     setLogLevelData(logLevels, context) {
        const LogLevelsKeys = Object.keys(context.plugin.server.config.user.logLevels);
        let logLevelData = {logLevels: {}};
        for (let key of LogLevelsKeys){
            logLevelData.logLevels[key] = logLevels;
        }
        return logLevelData;
     }

}

module.exports = ConfigDataService;
