/**
 * We are seaking to make the logging configurable programmatically. This is not supported by pm2-logrotate, so, we have to write one.
 * @author Jian Gao
 * 
 */

'use strict';
// Only set to true when doing unit test for file rotation. This will change the rotate interval to 1 minute
const utMode = false;

const fs = require('../zlux/zlux-proxy-server/js/node_modules/fs-extra');
const path = require('path');
const jsonUtils = require("../../lib/zlux/zlux-proxy-server/js/jsonUtils.js");
const cron = require('node-cron');
// Default configurations
const defaultType = 'console';
const defaultLogDir = '../log';
const defaultPrefix = 'server';
const defaultSurfix = '.log';
const defaultKeepDays = 0;
const defaultDailyRotate = false;
const { util } = require('../../app/bzshared/lib/services/utils.service');

// constants
const ROTATE_CRON_RULE = utMode? '1 * * * * *': '0 0 * * *';

class BzwLogging{

    constructor(appender){
        // backup the standard console functions
        global.stdoutWrite = process.stdout.write;
        global.stderrWrite = process.stderr.write;
        this.config = {
            type: defaultType,
            dir: defaultLogDir,
            prefix: defaultPrefix,
            surfix: defaultSurfix,
            keepDays: defaultKeepDays,
            dailyRotate: defaultDailyRotate
        }
        this.writeStream = null;
        this.loggerDir = '';
        this.appender= appender //output to different folder
        this.isLogToFile=true;
        this.appenderConfig=null;
        this.hasNameRule=true;
        this.autoscalePath = path.join(process.cwd(), '../config/autoscale');
    }

    /**
     * 
     * @param {*} dateObj an entity of Date class
     * @returns string of the date value in "YYYYMMDD" format. e.g. 20191028 for Oct. 28th, 2019
     */
    formatDate( dateObj ) {
        const iYear = dateObj.getFullYear();
        const iMonth = dateObj.getMonth() + 1;
        const sMonth = iMonth < 10? `0${iMonth}`: iMonth;
        const iDay = dateObj.getDate();
        const sDay = iDay < 10? `0${iDay}`: iDay;
        if (utMode){
            return `${iYear}${sMonth}${sDay}${dateObj.getHours()}${dateObj.getMinutes()}`;
        }
        return `${iYear}-${sMonth}-${sDay}`;
    }

        /**
     * 
     * @param {*} dateObj an entity of Date class
     * @returns string of the date value in "YYYYMMDD" format. e.g. 20191028 for Oct. 28th, 2019
     */
    formatDateTime( dateObj ) {
        const iYear = dateObj.getFullYear();
        const iMonth = dateObj.getMonth() + 1;
        const sMonth = iMonth < 10? `0${iMonth}`: iMonth;
        const iDay = dateObj.getDate();
        const sDay = iDay < 10? `0${iDay}`: iDay;
        const iHour = dateObj.getHours();
        const sHour = iHour < 10? `0${iHour}`: iHour;
        const iMin = dateObj.getMinutes();
        const sMin = iMin < 10? `0${iMin}`: iMin;
        return `${iYear}-${sMonth}-${sDay}_${sHour}-${sMin}`;
    }

    /**
     * Read the configure file and assign to config property
     */
    readConfig(){
        try{
            let config = '';
            const bzdbLogFile = path.join(process.cwd(), '../deploy/instance/ZLUX/serverConfig/logging.json');
            if(fs.existsSync(bzdbLogFile)) {
                config = jsonUtils.parseJSONWithComments(bzdbLogFile);
            } else {
                const configFile = path.join(process.cwd(), '../config/server/logging.json');
                config = jsonUtils.parseJSONWithComments(configFile);
            }
           
            this.config = Object.assign({},this.config, config); //Cannot assign to read only property 'type' of object '#<Object>'
            //don't check the child type
            this.isLogToFile=this.config && this.config.type && this.config.type.toLowerCase() === 'file';
            //inherit the main config, output to another folder
            if(this.appender && Object.keys(config[this.appender]).length>0){ 
                this.appenderConfig=config[this.appender];
                this.hasNameRule=this.appenderConfig.dir || this.appenderConfig.prefix; //neither dir nor prefix
                this.config = Object.assign({},this.config,this.appenderConfig );
            }
        }catch (err){
            console.error('Error while reading logging config file: ' + err.message);
        }
    }

    /**
     * 
     * @param {*} dateObj an entity of Date class
     * @returns timestamp of 00:00:00.0000 of next date
     */
    getNextDateTs( dateObj ) {
        let dt = new Date(dateObj);
        dt.setHours(0,0,0,0);
        dt.setDate(dateObj.getDate() + 1);
        if (utMode){
            dt = new Date(dateObj);
            dt.setMinutes(dateObj.getMinutes() + 1);
            dt.setSeconds(0,0);
        }
        return dt.getTime();
    }

    /**
     * 
     * @param {*} filename Name of log file
     * @returns fileWriteStream to write log into 
     */
    getWriteStream( filename ) {
        this.createDirs(this.loggerDir);
        return fs.createWriteStream(filename, {flags: 'a', encoding: 'utf8', mode: 0o644, emitClose: true});
    }

    /**
     * Ends the file stream while the server stop on error
     * @param {*} msg 
     * @param {*} callback 
     */
    closeOnError(msg, callback){
        console.error(msg);
        this.streamCloseSafe(this.writeStream, callback);
    }

    streamCloseSafe(fileSteam, callback){
        const endfileStream = () => {
            setTimeout(() => {
                if(fileSteam){
                    if (fileSteam.writableLength > 0) {
                        endfileStream();
                    } else {
                        fileSteam.end();
                        fileSteam.destroy();
                        fileSteam = null;
                        if (callback) callback();
                    }
                } else if(callback) {
					callback();
				}
            }, 500);
        }
        endfileStream();
    }

    /**
     * Creates the dir and the parent dirs if not exist.
     * @param {string} dir
     */
    createDirs(dir) {
        const tmpPath = dir;
        if (!fs.existsSync(path.dirname(tmpPath))) {
            this.createDirs(path.dirname(tmpPath));
        }
        if (!fs.existsSync(tmpPath)) {
            fs.mkdirSync(tmpPath);
        }
     }

    /**
     * reset console functions
     */
    recoverLogger(){
        process.stdout.write = global.stdoutWrite.bind(process.stdout);
        process.stderr.write = global.stderrWrite.bind(process.stderr);
        if (this.writeStream){
            this.streamCloseSafe(this.writeStream);
        }
    }

    /**
     * Clean the old log files. this can be controlled by config file
     */
    cleanLogFile(){
        try{
            if (this.config.keepDays > 0){
                fs.readdir(this.loggerDir, ( err, files ) => {
                    if (err){
                        console.warn('Error while reading lod dir: ' + err.message);
                        return;
                    }
                    if (files){
                        files = files.filter((val) => val.startsWith(this.config.prefix + '_') && val.endsWith(this.config.surfix))
                                     .sort();
                        if (files.length > this.config.keepDays){
                            console.log('Clearing outdated log files. Count of logs to keep: ' + this.config.keepDays);
                            files = files.slice(0, files.length - this.config.keepDays);
                            files.forEach(file => {
                                fs.unlink(path.join(this.loggerDir, file), (err) => {
                                    if (err) {
                                        console.warn('Error while removing outdated log file.')
                                        console.error(err);
                                    } else {
                                        console.log('Outdated log file removed: ' + file);
                                    }
                                });
                            })
                        }
                    }
                })
            }
        }catch (err){
            console.warn('Error while clean log file: ' + err.message);
        }
    }

    /**
     * triggers the log clean function in asynchronized mode. 
     */
    triggerFileClean(){
        const that = this;
        setTimeout(()=>{
            that.cleanLogFile();
        });
    }

    getLoggerDir() {
        const configDir = path.normalize(this.config.dir || defaultLogDir);
        // console.log('configDir', configDir);
        this.loggerDir = path.resolve(configDir);
        console.log('Log file directory is: ', this.loggerDir);
    }

    getFileName() {
        let currentDt = new Date();
        return `${this.loggerDir}/${this.config.prefix}_${this.formatDate(currentDt)}${this.config.surfix}`;
    }

    //TODO Should leverage Winston in future??
    /**
     * The logger in ZOWE always write into console, so, we are redirecting console.log/warn/error to another function, so that we can control the log file better. 
     */
    setLogger(){
        this.readConfig();
        this.getLoggerDir();
        if (this.isLogToFile){ // write log with write stream
            try{
                process.env.BZ_LOGGER_TYPE = 'file'; // bzdb will need this to set its logger
                // Creates the file stream for logging
                const fileName = this.getFileName();
                this.writeStream = this.getWriteStream(fileName);
                // Redirects the console write into file stream
                process.stdout.write = process.stderr.write = this.writeStream.write.bind(this.writeStream);
                process.env.BZ_LOGGER_FILE_NAME = fileName;  // bzdb will need this to set its logger
            }catch(err){
                console.error('Error while set Logger: ' + err.message);
            }
        }
    }
    
    /**
     * Apply the log configuration provided with ENV vars
     */
    applyLogConfigToken() {
        try {
            const configPath = path.join(this.autoscalePath);
            const files = fs.readdirSync(configPath);
    
            files.forEach(d => {
                if(d === 'logging.json') {
                    const sourcePath = path.join(configPath, d);
                    const file = path.join(process.cwd(), '../deploy/instance/ZLUX/serverConfig/logging.json');
    
                    fs.ensureFileSync(file);
                    fs.copySync(sourcePath, file);
                    console.log('Successed to update logging setting before starting server.') 
                }
            });
        } catch(err) {
            console.error(err);

        }
    }

    //this is for the default log
    setLoggerRotate(){
        const that = this;
        // Rotates logger at 00:00 each day
        cron.schedule(ROTATE_CRON_RULE, () => {
            that.readConfig();
            if (this.config && this.config.type && this.config.type === 'file'){ // write log with write stream
                process.env.BZ_LOGGER_TYPE = 'file';
                // Log file rotates at 00:00 every day
                if (that.config && that.config.dailyRotate){
                    console.log('Log file rotates,Dir:'+this.loggerDir +',keepDays:'+that.config.keepDays);
                    let logWriteStreamOld = that.writeStream;
                    const fileName = that.getFileName();
                    that.writeStream = that.getWriteStream(fileName);
                    process.stdout.write = process.stderr.write = that.writeStream.write.bind(that.writeStream);
                    process.env.BZ_LOGGER_FILE_NAME = fileName;
                    that.streamCloseSafe(logWriteStreamOld);                
                    // Let bzdb log to the same file
                    const bzdb = require('../../app/bzshared/lib/services/bzdb.service');
                    bzdb.changeLogger({type:'file', fileName:fileName});
                }
            } else { // Write log into console. 
                process.env.BZ_LOGGER_TYPE = 'console';
                if (this.writeStream) this.recoverLogger();
                const bzdb = require('../../app/bzshared/lib/services/bzdb.service');
                bzdb.changeLogger({type:'console'});
            }
            // Triggers the file cleaning
            that.triggerFileClean();
        });
    }


    rotateLogStream() {
        this.readConfig()
        this._rotateLog();
        return this._writeLogStream();
    }

    _rotateLog(){
        const that = this;
        // Rotates logger at 00:00 each day
        cron.schedule(ROTATE_CRON_RULE, () => {
            that.readConfig();
            if (that.config && that.config.dailyRotate){
                console.log('Log file rotates,Dir:'+this.loggerDir +',keepDays:'+that.config.keepDays);
                let logWriteStreamOld = that.writeStream;
                that.streamCloseSafe(logWriteStreamOld);                
                this._writeLogStream()
                // Triggers the file cleaning
                if(fs.existsSync(this.loggerDir)){
                    that.triggerFileClean();
                }
            }
        });
    }

    _writeLogStream() {
        this.getLoggerDir();
        const fileName = this.getFileName();
        if (!this.appender || (this.appenderConfig && this.appenderConfig.enable)) {
            this.writeStream = this.getWriteStream(fileName);
        } else {
            this.writeStream = null;
        }
        return {
            write: (message) => {
                //whether enable the appender
                if (this.appenderConfig && this.appenderConfig.enable) {
                    if (this.isLogToFile && this.hasNameRule) {
                        //output to self defined log file
                        if (this.writeStream) this.writeStream.write(message)
                    } else {
                        //output to console
                        console.log(message.substring(0, message.lastIndexOf('\n')))
                    }
                }
            }
        }
    }

}

module.exports = BzwLogging
