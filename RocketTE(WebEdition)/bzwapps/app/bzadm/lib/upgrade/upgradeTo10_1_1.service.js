const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const sessionSettingsService = require('./../services/session-settings.service');
// const InternalDataSteward = require('../../../bzshared/lib/services/internal-data-steward.service');
// const DataEntities = require('./../services/data-entities.config');
const Utiles =  require('./../services/utils.service');
const authConfigService=require("../../../bzshared/lib/services/authConfigService")
const userDataServiceFile= require('./../services/userDataServiceFile');
const bzdb = require('../../../bzshared/lib/services/bzdb.service');

const INSTANCE_USERS_PATH = `/instance/users`;   // private data
const INSTANCE_BZW_PATH = `/instance/ZLUX/pluginStorage/com.rs.bzw`;   // public data
const PRODUCT_BZW_PATH = `/product/ZLUX/pluginStorage/com.rs.bzw`;    // public data
const SITE_BZW_PATH = `/site/ZLUX/pluginStorage/com.rs.bzw`;       // public data

const BZADM_PATH = '/instance/ZLUX/pluginStorage/com.rs.bzadm';
// const BZW_PATH = '/ZLUX/pluginStorage/com.rs.bzw';
// const UPGRADE_PATH = '/instance/ZLUX/pluginStorage/com.rs.bzadm/configurations/serverSettings.json';
const Promise = require('bluebird');
// const DEFAULTPASSWORD="password";
// const BZADMIN = 'bzadmin';

// const DB_STORE_PATH = '/instance/ZLUX/pluginStorage/com.rs.bzshared/_db_store';
const BZSHARED_DEFAULTS_PATH  = '/product/ZLUX/pluginStorage/com.rs.bzshared/defaults';
const zoweService = require('../../../bzshared/lib/services/zowe.service');
const jsonUtils = zoweService.jsonUtils;
const sym = String.fromCharCode(255);
// const ServerRuntimeService = require('../../../bzshared/lib/services/server-runtime.service');
class UpgradeTo10_1_1Service {

    /**
     * Constructor
     * @param {Object} context - The plugin context of which invoking this class
     */
    constructor(context){
        this.context = context;
        this.logger = context.logger;
        // this.deployPath = path.join(this.context.plugin.server.config.user.instanceDir, '../');
        this.deployPath = this.context.plugin.server.config.user.rootDir;
        this.upgradePath = this.deployPath.replace('deploy', 'migrate');
        this.sessionSettingDataService = sessionSettingsService.init(context);
        // this.dataSteward = InternalDataSteward.initWithContext(context);
        this.utiles = new Utiles(context);
        authConfigService.init(context).then((obj)=>{
            this.authConfigObj=obj;
            this.userDataService = userDataServiceFile.init(context,this.authConfigObj);
        })
        // this.authConfigObj = authConfigService.init(context);
        // this.userDataService = userDataServiceFile.init(context, this.authConfigObj);
        this.protocol = 'http';
        this.host = 'localhost';
        this.port = 8543;
        this.needRestart = false;
    }


    getVersion() {
        const versionPath = `${this.upgradePath}/product/ZLUX/pluginStorage/com.rs.bzshared/_internal/services/version/version.json`;
        if (fs.existsSync(versionPath)) {
            const data = fse.readJSONSync(versionPath);
            return data && data.pluginVersion;
        }
        return false;
    }

    async doUpgrade(versionFlag, migratePath){
        this.logger.info(`start the 10.1.1 upgradation.`);
        this.logger.info(`start do upgrade - configuration.`);
        this.upgradePath = migratePath?migratePath:this.upgradePath;
        let result=await this.configurationUpgrade();  //move auth configuration files to BZDB

        if(result.status){//scriptUpdate   move script files to BZDB
            this.logger.info(`start do upgrade - script.`);
            let scriptResult=await this.scriptUpdate();
            result=Object.assign(result,scriptResult);
        }
        if(result.status) { // session seting add id for create file
            this.logger.info(`start do upgrade - session settings`);
            let sessionSettingResult = await this.updateSessionSetting();
            result = Object.assign(result, sessionSettingResult);
        }

        if(result.status){ //convertKeyboardMapping    refactor the keyboard default template
            this.logger.info(`start do upgrade - KeyboardMapping.`);
            let keyboardresult=await this.convertKeyboardMapping(versionFlag); // conver keyboard mappings
            result=Object.assign(result,keyboardresult);
        }
        
        if(result.status){
            this.logger.info(`finished the 10.1.1 upgradation.`);
        }else{
            this.logger.severe(`failed the 10.1.1 upgradation.`);  
        }
        return result;
    }

    async convertKeyboardMapping(versionFlag) {
        const version = this.getVersion();
        const versionList = ["1.1.5", "1.1.6", "1.2.0", "1.2.1","10.1.0"];
        let versionIndex = !version?0:versionList.map(v => version.indexOf(v)).findIndex(d=>d>-1);
        if(!version || versionIndex > -1){ // Before 1.2.0 doesn't have version file
            this.logger.info('== Start to convert keyboardMapping');
            return await this.updateKeyboardMappingForNewDefaultConfiguration(versionFlag);
        }else {
            this.logger.info(`The keyboard doesn't need to convert to new key`);
            return {status: true};
        }
    }

    /**
     * Update the keyboard mapping with the new configuration
     * keycode as key
     */
    async updateKeyboardMappingForNewDefaultConfiguration(versionFlag) {
        try {
            let defaults = await this.getDefaultKeyboardMapping();
            const keyboardLayout = this.getKeyboardLayout();
            return new Promise((resolve, reject) => {
                Promise.all([this.updateAdminKeyboardMapping(defaults, 'com.rs.bzadm', keyboardLayout,versionFlag), this.updateBzdbKeyboardMapping(defaults, 'com.rs.bzw', keyboardLayout,versionFlag)])
                    .then(result => {
                        if (result[0].status && result[1].status) {
                            this.logger.info('Convert TE admin and web keyboard mapping to keycode success');
                            resolve({
                                status: true,
                                message: 'Convert TE admin and web keyboard mapping to keycode success'
                            });
                            this.logger.info('== End to convert keyboardMapping successed');
                        } else {
                            const message = (result[0].status ? '' : result[0].message) + (result[1].status ? '' : result[1].message);
                            this.logger.severe(`Convert TE admin and web keyboard mapping to keycode failed: ${message}`);
                            resolve({
                                status: false,
                                message: message
                            });
                            this.logger.info('== End to convert keyboardMapping failed');
                        }
                    }, err => {
                        this.logger.severe(`Convert keyboard mapping to keycode failed: ${JSON.stringify(err.message)}`);
                        resolve({ status: false, message: `Convert keyboard mapping to keycode failed: ${JSON.stringify(err.message)}` });
                        this.logger.info('== End to convert keyboardMapping error');
                    });
            });

        } catch (error) {
            this.logger.severe(`Convert keyboard mapping to keycode failed: ${JSON.stringify(error.message)}`);
        }
        
    }

    /**
     * update keyboard mapping for admin
     * @param {*} defaults 
     * @param {*} plugin 
     * @param {*} layout 
     */
    updateAdminKeyboardMapping(defaults, plugin, layout, versionFlag) {
        try {
            let userKeyboardMappingDatas = this.getUserKeyboardMapping();
            if(userKeyboardMappingDatas.length !== 0) {
                let currentPluginDefaultValue = this.getCurrentPluginDefaultValue(defaults, plugin)
                let customizedMappings = this.getCustomizedKeyboardMapping(userKeyboardMappingDatas, currentPluginDefaultValue, layout, plugin, versionFlag);
                let newMappingsWithKeyCode = this.compareWithNewConfigurationForAdmin(customizedMappings, currentPluginDefaultValue, plugin);
                this.updateKeyboardMappingWithNewConfigtuation(newMappingsWithKeyCode, plugin, versionFlag);
            }
            this.logger.info(`Convert TE admin keyboard mapping to keycode successed`);
            return {
                status: true,
                message: "Convert TE admin keyboard mapping to keycode successed"
            };

        } catch (error) {
            this.logger.info(`TE admin convert keyboard mapping to keycode failed: ${JSON.stringify(error.message)}`);
            return {
                stats:false,
                message: `TE admin convert keyboard mapping to keycode failed: ${JSON.stringify(error.message)}`
            };
        }
    }
    

    /**
     * update keyboard mapping for web
     * @param {*} defaults 
     * @param {*} plugin 
     * @param {*} layout 
     */
    async updateBzdbKeyboardMapping(defaults, plugin, layout, versionFlag) {
        try {
            let currentPluginDefaultValue = this.getCurrentPluginDefaultValue(defaults, plugin);
            let userKeyboardMappingDatas = this.getWebKeyboardMappingData(versionFlag);
            let customizedMappings = this.getCustomizedKeyboardMapping(userKeyboardMappingDatas, currentPluginDefaultValue, layout, plugin, versionFlag);
            let newMappingsWithKeyCode = this.compareWithNewConfigurationForWeb(customizedMappings, currentPluginDefaultValue, plugin);
            await this.updateKeyboardMappingWithNewConfigtuation(newMappingsWithKeyCode, plugin, versionFlag);
            this.logger.info(`Convert TE web keyboard mapping to keycode successed`);
            return {
                status: true,
                message:`Convert TE web keyboard mapping to keycode successed`
            };
        } catch (error) {
            this.logger.info(`TE web convert keyboard mapping to keycode failed: ${JSON.stringify(error.message)}`);
            return {
                status: false,
                message: `TE web convert keyboard mapping to keycode failed: ${JSON.stringify(error.message)}`
            };
        }
    }

    /**
     * get TE web create own keyboard mapping from bzdb 
     * @returns 
     */
     getWebKeyboardMappingData(versionFlag) {
         try {
            let sessionData = this.getSessionDataFromDB();
            // let keyboardData = await bzdb.selectSync('keyboardMappingPrivate');
            let keyboardData = this.getDBStoreFile('keyboardMappingPrivate');
            let keyboardUserData = Object.assign([], keyboardData); // Array
            //let keyboardId, idIndex, nameIndex, keyboardName;
            //let keyboardNames = this.getKeyboardNameList(keyboardData);
            // let keyboardNames = Object.keys(keyboardUserData.data).map(d => keyboardUserData.data[d].name).filter(v => v !== undefined);
            // let keyboardIDs = Object.keys(keyboardUserData.data).map(d => keyboardUserData.data[d].id).filter(v => v !== undefined);
            // let paramertValue = {
            //     data:keyboardUserData,
            //     index: '',
            //     session: [],
            //     flag:versionFlag
            // }
            for (let keyboard of keyboardUserData){
                if(keyboard){
                    const asession=this.getSessionBySettingID('_keyboardMapping',keyboard,sessionData)
                    if(asession){
                        keyboard.terminalType=asession.terminalType;
                        keyboard.dataEntityName = asession.dataEntityName;
                        keyboard.keyboardMappingId = asession.keyboardMappingId || "";
                    }else{
                        this.logger.info(`Orphan keyboard, can not find session by keyboard id ${keyboard.id} or keyboard name ${keyboard.name}` );  
                    }
                }
            }
            this.logger.info(`GetWebKeyboardMappingData successed`);
            return keyboardUserData;

            
            // for (const session of sessionData) {
            //     if (session.userId !== '') {
            //         if (session.id.indexOf(sym) > -1) { // keyboard ID contains 'y'
            //             keyboardId = `${session.id}_keyboardMapping`;
            //         } else {
            //             keyboardId = `${session.userId}${sym}${session.id}_keyboardMapping`;
            //         }
            //     }else if(session.dataEntityName === 'sessionShared') {
            //         keyboardId = `${sym}${session.id}_keyboardMapping`;
            //         let kIndex = keyboardNames.findIndex(i => i.includes(keyboardId));
            //         if(kIndex > -1) {
            //             paramertValue.index = kIndex;
            //             paramertValue.session = session;
            //             this.updateKeyboardData(paramertValue);
            //         }
            //     }
            //     let name = `_${session.name}_keyboardMapping`;
            //     // id constains string '.json'
            //     let keyboardMappingId = session.keyboardMappingId && session.keyboardMappingId.includes('.json')?session.keyboardMappingId.substing(0, session.keyboardMappingId.length - 5): session.keyboardMappingId;
            //     keyboardName = keyboardMappingId || name; // constains keyboard ID user keyboard ID, without ID uses _sessionName_keyboardMapping
            //     //let index = keyboardNames.findIndex(i => keyboardId === i || keyboardName === i || name === i);
            //     let index = keyboardNames.findIndex(i=>function(){
            //         if
            //     })
            //     if(index > -1) {
            //         paramertValue.index = index;
            //         paramertValue.session = session;
            //         this.updateKeyboardData(paramertValue);
            //     }else {
            //         idIndex = keyboardNames.findIndex(i => keyboardId === i); // uses different format keyboard name to search 
            //         if(idIndex > -1) {
            //             paramertValue.index = idIndex;
            //             paramertValue.session = session;
            //             this.updateKeyboardData(paramertValue);
            //         }
            //         nameIndex = keyboardNames.findIndex(i => keyboardName === i || name === i); // if id undefined, use name to search
            //         if(nameIndex > -1) {
            //             paramertValue.index = nameIndex;
            //             paramertValue.session = session;
            //             this.updateKeyboardData(paramertValue);
            //         }
            //     }
            // }
            // this.logger.info(`GetWebKeyboardMappingData successed`);
            // return keyboardUserData;
         } catch (error) {
             this.logger.info(`GetWebKeyboardMappingData failed: ${JSON.stringify(error.message)}`);
         }
        
    }

    updateKeyboardData(param) {
        let data = param.data;
        let index = param.index;
        let session = param.session;
        data[index].terminalType = session.terminalType;
        data[index].dataEntityName = session.dataEntityName;
        data[index].keyboardMappingId = session.keyboardMappingId || "";
        if (data[index].id === undefined) {
            if (session.id.indexOf(sym) > -1) {
                const ids = session.id.split(sym);
                const arr = [ids[0], sym, '_', ids[1]];

                session.id = arr.toString().split(',').join('');
            }
            if(param.flag === 'handleDataBeforeV120') {
                data[index].id = `${data[index].userId}${sym}${session.id}_keyboardMapping`; // 1.1.6 new id rule, userIdyuserId_sessionName_keyboardMapping
            }else {
                data[index].id = `_${session.id}_keyboardMapping`; // 1.2.0/1.2.1 use session name as keyboardMapping id
            }
        }
    }


        //hotspot ID rules, others are similar
    //{userId}ÿ{userId}ÿ{session.id}_hotspots  hotspot ID rule 1
    //{userId}ÿ{session.id}_hotspots  hotspot ID rule 2
    //ÿ{session.id}_hotspots`;hotspot ID rule 3
    //_{session.name}_hotspots; //rule 4
    //{userId}ÿ{session.name}_hotspots`; //rule 5
    //{userId}ÿ{userId}ÿ_{session.name}_hotspots  ////rule 6
    getSessionBySettingID(extend,settingObj,allSessions) {
        let session;
        let settingId=settingObj.id 
        let settingName=settingObj.name
        let settingUserId=settingObj.userId
        if(allSessions.length>0){
            for(let i=0; i<allSessions.length;i++){
                const aSession=allSessions[i];
                let idRule=[];
                if (aSession.id) {
                    if(aSession.userId){//private sessiion
                        idRule.push(`${aSession.userId}${sym}${aSession.userId}${sym}${aSession.id}${extend}`) //rule 1
                        idRule.push(`${aSession.userId}${sym}${aSession.id}${extend}`) //rule2
                    }else{ //public session
                        if(settingUserId){
                            idRule.push(`${settingUserId}${sym}${aSession.id}${extend}`) //rule2
                        }
                    }
                    idRule.push(`${sym}${aSession.id}${extend}`) //rule3
                }
                if(aSession.name){
                    if(aSession.userId){//private sessiion
                        idRule.push(`${aSession.userId}${sym}${aSession.userId}${sym}_${aSession.name}${extend}`) //rule6
                    }
                    idRule.push(`_${aSession.name}${extend}`) //rule4
                    idRule.push(`${aSession.userId}${sym}${aSession.name}${extend}`) //rule5
                }
                if(idRule.length>0){
                    if(settingId && idRule.includes(settingId)>0){
                        if(aSession.userId){
                            if(aSession.userId===settingUserId){
                                session= aSession;
                                break;
                            }
                        }else{
                            session= aSession;
                            break;
                        }
                    }
                    if(settingName && idRule.includes(settingName)>0){
                        if(aSession.userId){
                            if(aSession.userId===settingUserId){
                                session= aSession;
                                break;
                            }
                        }else{
                            session= aSession;
                            break;
                        }
                    }
                }
            }
        }
        return session;
    }
    /**
     * Get keyboard name list, it has id or name
     * @param {*} data 
     * @returns 
     */
    getKeyboardNameList(data) {
        let names = [];
        data.forEach(element => {
            if(element.id) {
                names.push(element.id);
            }else if(element.name) {
                names.push(element.name);
            }
        });
        return names;
    }

    /**
     * Get session data from bzdb, sessionPrivate , sessionShared.
     * @returns id, name, terminalType, keyboardMapping Id, userId, dataEntityName
     */
    getSessionDataFromDB() {
        let privateSession = this.getDBStoreFile('sessionPrivate');
        let sharedSession = this.getDBStoreFile('sessionShared');
        let sessionInfos = [];
        privateSession.forEach(session => {
                let config = {
                    id: session.id || session.name,
                    name: session.name,
                    terminalType: this.getSessionType(session.sessionType),
                    keyboardMappingId: session.keyboardMappingId,
                    userId: session.userId,
                    dataEntityName:"sessionPrivated"
                }
                sessionInfos.push(config);
            
        });
        sharedSession.forEach(session => {
            let config = {
                id: session.id || session.name,
                name: session.name,
                terminalType: this.getSessionType(session.type),
                keyboardMappingId: session.keyboardMapping,
                userId: session.userId || '',
                dataEntityName:"sessionShared"
            }
            sessionInfos.push(config);
        });
        return sessionInfos;
    }

    getSessionType(type) {
        if(!type) return '';
        if (type.indexOf('3270') > -1) {
          if(type.indexOf('3287_2') > -1){
            return '3270p';
          }else{
            return '3270';
          }
        } else if (type.indexOf('5250') > -1) {
            return '5250';
        } else {
            return 'VT';
        }
    }

    /**
     * Get db store data for sessionPrivated, sessionShared, keyboardMappingPrivated
     * @param {*} folder 
     * @returns 
     */
    getDBStoreFile(folder) {
        const path = `${this.deployPath}/instance/ZLUX/pluginStorage/com.rs.bzshared/_db_store/${folder}`;
        let fileContents = [];
        const fileNames = fse.readdirSync(path);
        if(fileNames && fileNames.length !== 0) {
            fileNames.forEach((file) => {
                let fileContent = fse.readJSONSync(`${path}/${file}`);
                let key = Object.keys(fileContent);
                key.map(k => fileContents.push(fileContent[k]));
               
            });
        }
        return fileContents;
    }

    /**
     * Get upgrade version and current version default keyboard mapping configuration
     * return format Map [ key:'com.rs.bzadm', value:{'3270:{upgradMappings:[],deployMappings:[]},'5250':{},"VT":{}]]
     */
     getDefaultKeyboardMapping(){
        this.logger.debug('Start == get default keyboard mapping');
        let allDefaultKeyboardConfiguration = new Map();
        let configList = {}; 
        let upgradeDefaultKeyboardMappingList, deployDefaultKeyboardMappingList;
        const types = ["3270","5250","VT"];
        const pluginName = ["com.rs.bzadm","com.rs.bzw"];
        pluginName.forEach( (plugin, index) => {
            let upgradeKeyboardPath = `${this.upgradePath}/product/ZLUX/pluginStorage/${plugin}/defaults`;
            let deployKeyboardPath  = `${this.deployPath}/product/ZLUX/pluginStorage/${plugin}/defaults`;
            types.forEach(type => {
                let upgradeDefaultKeyboardMappingPath = `${upgradeKeyboardPath}/default${type}KeyboardMapping.json`;
                let deployDefaultKeyboardMappingPath = `${deployKeyboardPath}/default${type}KeyboardMapping.json`;
                if(fs.existsSync(upgradeDefaultKeyboardMappingPath)) {
                    upgradeDefaultKeyboardMappingList = fse.readJSONSync(upgradeDefaultKeyboardMappingPath);
                }else {
                    upgradeDefaultKeyboardMappingList = {};
                    this.logger.severe(`There is no such file ${upgradeDefaultKeyboardMappingPath} for default keyboard mappings`);
                }
                if(fs.existsSync(deployDefaultKeyboardMappingPath)) {
                    deployDefaultKeyboardMappingList = fse.readJSONSync(deployDefaultKeyboardMappingPath);
                }else {
                    deployDefaultKeyboardMappingList = {};
                    this.logger.severe(`There is no such file ${deployDefaultKeyboardMappingPath} for default keyboard mappings`);
                }
                let config = {
                    upgradeMappings:upgradeDefaultKeyboardMappingList,
                    deployMappings:deployDefaultKeyboardMappingList
                }
                configList[type] = config;
                allDefaultKeyboardConfiguration.set(pluginName[index], configList);
            });
        });
        
        this.logger.debug('End == get default keyboard mapping');

        return allDefaultKeyboardConfiguration;
    }

    /**
     * Get upgrade version keyboard mapping values
     * @returns {Array} id:String, userMappingData: Array, defaultMappingData: Array
     */
    getUserKeyboardMapping() {
        this.logger.debug('Start == get Old Version user keyboard mapping');
        const {upgradeKeyboardPath, deployKeyboardPath, upgradeKeyboardIDPath, deployKeyboardIDPath} = this.getKeyboardPath();
        // const upgradeKeyboardPath = `${this.upgradePath}${BZADM_PATH}/sessionSettings/`;
        // const deployKeyboardPath = `${this.deployPath}${BZADM_PATH}/sessionSettings/`;
        // const upgradeKeyboardIDPath = `${upgradeKeyboardPath}/keyboardMapping.json`;
        // const deployKeyboardIDPath = `${deployKeyboardPath}/keyboardMapping.json`
        let keyboardMappingLists = [];
        if (fs.existsSync(upgradeKeyboardIDPath)) {
            keyboardMappingLists = this.getKeyboardMappingsWithIDForAdmin(upgradeKeyboardIDPath, upgradeKeyboardPath);
        }else if (fs.existsSync(deployKeyboardIDPath)) {
            keyboardMappingLists = this.getKeyboardMappingsWithIDForAdmin(deployKeyboardIDPath, deployKeyboardPath);
        } else {
            this.logger.info(`Current version missed keyboard mapping id file`);
        }
        this.logger.debug('End == get Old Version user keyboard mapping');
        return keyboardMappingLists;
    }

    getKeyboardPath() {
        const upgradeKeyboardPath = `${this.upgradePath}${BZADM_PATH}/sessionSettings/`;
        const deployKeyboardPath = `${this.deployPath}${BZADM_PATH}/sessionSettings/`;
        const upgradeKeyboardIDPath = `${upgradeKeyboardPath}/keyboardMapping.json`;
        const deployKeyboardIDPath = `${deployKeyboardPath}/keyboardMapping.json`

        return {upgradeKeyboardPath, deployKeyboardPath, upgradeKeyboardIDPath, deployKeyboardIDPath};
    }

    getUserKeyboardPath(kpath, id) {
        return `${kpath}/keyboardmapping/K_${id}.json`; 
    }

    /**
     * Get keyboard mapping from admin, before120 uses deploy path, after120 uses upgrade path
     * @param {*} path 
     * @param {*} parentPath 
     * @returns 
     */
    getKeyboardMappingsWithIDForAdmin(path, parentPath) {
        let userKeyboardMappingList, list = [];
        let keyboardIds = fse.readJSONSync(path);
        if (keyboardIds) {
            keyboardIds.forEach((key) => {
                let userKeyboardMappingPath = this.getUserKeyboardPath(parentPath, key.id);
                if (fs.existsSync(userKeyboardMappingPath)) {
                    userKeyboardMappingList = fse.readJSONSync(userKeyboardMappingPath);
                } else {
                    this.logger.severe(`There is no such file ${userKeyboardMappingPath}, please check it`);
                }
                let keyboardData = {
                    id: key.id,
                    type:key.type
                }
                keyboardData = Object.assign(userKeyboardMappingList, keyboardData);
                list.push(keyboardData);
            });
        }
        return list;
    }

    /**
     * Get customized keyboard mapping for admin and web
     * @param {*} data 
     * @param {*} defaults 
     * @param {*} plugin 
     * @param {*} keyboardLayout 
     * @returns 
     */
     getCustomizedKeyboardMapping(data, defaults, keyboardLayout, plugin, versionFlag) {
         try {
            let layout,fiterKeyboardMappingList = [];
            let keyCodeMap = keyboardLayout["standardKeyCode"];
            let mappingObj = Object.assign([], data);
            (data || []).forEach((value, dataIndex) => {
                if(Array.isArray(value.keyboardMapping)) { // 10.1.0 ftp/printer keyboarmapping is empty object
                    let customizeMapping = value.keyboardMapping || []; 
                    let keyboardLanguage = this.getKeyboardLanguage(value.keyboardLanguage);
                    let language = keyboardLanguage?keyboardLanguage['lang']:"en-us";
                    if(value.terminalType !== undefined || value.type !== undefined || customizeMapping.length !== 0){
                        let defaultMapping = defaults[value.terminalType || value.type]['upgradeMappings'].keyboardMapping ;
                        let customizedKeyboardMapping = [];
                        let defaultKeyboardMappingIds = Object.keys(defaultMapping).map(d => defaultMapping[d].key);
                        customizeMapping.forEach((element, customizedIndex) => {
                            let newMapKeyTemp = [null,null,null,null,null,null,null,null];
                            if(customizedIndex >= defaultMapping.length) {
                                if(customizedKeyboardMapping.findIndex(d => d.key === element.key) === -1) {
                                    element.mapping.forEach((m,i) => {
                                        if(m.type !== "null") {
                                            newMapKeyTemp[i] = m
                                        }
                                    })
                                    let obj = {
                                        key: element.key,
                                        mapping: newMapKeyTemp
                                    }
                                    if(obj.mapping.some(d=> d !== null)) {
                                        customizedKeyboardMapping.push(obj); //10.1.0 key is more than default.
                                    }
                                }
                            }else {
                                let index = defaultKeyboardMappingIds.findIndex(d => d === element.key);
                                let newKey;
                                if(index > -1) {
                                    element.mapping.forEach((m, i) => {
                                        newKey = {
                                            key: element.key,
                                            mapping: newMapKeyTemp
                                        }
                                        if (defaultMapping[index].mapping[i] === undefined) {
                                            if(m.type !== 'null') {
                                                newMapKeyTemp[i] = m;
                                            }
                                        } else if (m && m.value !== undefined && m.value !== null && defaultMapping[index].mapping[i]
                                            && (defaultMapping[index].mapping[i].value !== undefined && m.value !== defaultMapping[index].mapping[i].value)
                                            || (defaultMapping[index].mapping[i].type && m.type !== defaultMapping[index].mapping[i].type)) {
                                                if(plugin === 'com.rs.bzadm' && versionFlag == 'handleDataBeforeV120' && m.type === 'KEYMAP_TYPE_SCRIPT') {
                                                    newMapKeyTemp[i] = null; // bzadm doesn't support script, 1.1.6 data need ignore script in public data
                                                }else {
                                                    newMapKeyTemp[i] = m;
                                                }
                                                
                                        }
                                    });
                                    if (customizedKeyboardMapping.findIndex(d => d.key === element.key) === -1 && newMapKeyTemp.findIndex(d=> d!== null) > -1) { // only one value is not null in newMapKeyTemp 
                                        customizedKeyboardMapping.push(newKey); //compare with the previous default config, pick out the different value.    
                                    }
                                }
                            }
                            
                        });
                        mappingObj[dataIndex].keyboardMapping = customizedKeyboardMapping; // keep different value
                        layout = keyboardLayout["keyboardLayouts"][language]['layout']['keys']; // according to the keyboard type selected the keyboard layout, default en-us;
                        mappingObj[dataIndex].layout = layout; 
                        mappingObj[dataIndex].keyCodeMap = keyCodeMap; 
                        fiterKeyboardMappingList.push(mappingObj[dataIndex]);
                    }
                }
            });
            this.logger.info(`GetCustomizedKeyboardMapping successed`); 
            return fiterKeyboardMappingList;
         } catch (error) {
            this.logger.info(`GetCustomizedKeyboardMapping failed: ${JSON.stringify(error.message)}`);
         }
    }

    getKeyboardLanguage(data) {
        let language;
        if(Array.isArray(data)) {
            for (const i in data) {
                language = data[i];
            }
        }else {
            language = data;
        }
        return language;
    }

  
    /**
     * Get current plugin default value.
     * @param {*} defaultValue default keyboard mapping
     * @param {*} plugin com.rs.bzadm/com.rs.bzw
     * @returns 
     */
    getCurrentPluginDefaultValue(defaultValue, plugin) {
       return defaultValue.get(plugin);
    }

    /**
     * Compare with new configuration for admin keyboard mappings
     * @param {*} customizedData 
     * @param {*} defaults 
     * @param {*} plugin 
     * @returns 
     */
    compareWithNewConfigurationForAdmin(customizedData, defaults) {
        // convert character to keycode
        try {
            let newKeyboardMappingWithKeyCode = [];
            (customizedData || []).forEach(data => {
                let customizedDataKeyboardMapping = data.keyboardMapping;
                let newDefaultConfiguration = defaults[data.terminalType || data.type]["deployMappings"].keyboardMapping;
                let newKeyboardTemplate = this.copy(newDefaultConfiguration);
                let keyCodeList = this.getCurrentKeycode(data.keyCodeMap, data.layout);
                let index;
                let characters = Object.keys(customizedDataKeyboardMapping).map(d => customizedDataKeyboardMapping[d].key);
                let newDefaultKeys = Object.keys(newDefaultConfiguration).map(d => newDefaultConfiguration[d].key);
                let newConfig = Object.assign({}, data);
                if (characters.length !== 0) {
                    characters.forEach((char, charIndex) => {
                        let charInLayoutIndex = Object.keys(data.layout).map(d => data.layout[d].findIndex(v => v.includes(char)));
                        if (charInLayoutIndex.every(y => y <= -1)) { // it is not the character, like F1, Numpad1...
                            index = newDefaultKeys.findIndex(d => d === char);
                            if (index > -1) {
                                if (customizedDataKeyboardMapping[charIndex].mapping.length > 8) customizedDataKeyboardMapping[charIndex].mapping.pop(); // remove the last elem
                                let customizedKeyboardMapping = customizedDataKeyboardMapping[charIndex].mapping;
                                customizedKeyboardMapping.forEach((mapping, i) => {
                                    if (mapping !== null && ((newKeyboardTemplate[index].mapping[i] && newKeyboardTemplate[index].mapping[i].type !== mapping.type)
                                        || (newKeyboardTemplate[index].mapping[i] && newKeyboardTemplate[index].mapping[i].value !== mapping.value))) {
                                        newKeyboardTemplate[index].mapping[i] = mapping;
                                        newKeyboardTemplate[index].mapping[i].isAdminChanaged = true; //admin change flag
                                    }
                                });
                            }
                        } else {
                            charInLayoutIndex.forEach((charIdx, layoutIdx) => {
                                if (charIdx > -1) {
                                    let keyCode = keyCodeList[layoutIdx][charIdx][0]; // find keycode value
                                    index = newDefaultKeys.findIndex(d => d === keyCode);
                                    if (index > -1) {
                                        if (customizedDataKeyboardMapping[charIndex].mapping.length > 8) customizedDataKeyboardMapping[charIndex].mapping.pop(); // remove the last elem
                                        let customizedKeyboardMapping = customizedDataKeyboardMapping[charIndex].mapping;
                                        customizedKeyboardMapping.forEach((mapping, i) => {
                                            if (mapping !== null && ((newKeyboardTemplate[index].mapping[i]!== undefined && newKeyboardTemplate[index].mapping[i].type !== mapping.type)
                                        || (newKeyboardTemplate[index].mapping[i] && newKeyboardTemplate[index].mapping[i].value !== mapping.value))) {
                                                newKeyboardTemplate[index].mapping[i] = mapping;
                                                newKeyboardTemplate[index].mapping[i].isAdminChanaged = true; //admin change flag
                                            }
                                        });
                                    }
                                }
                            });
                        }
                    });
                }
                // if (newConfig.name === undefined) newConfig.name = `K_${data.id}.json`; // for the add keyboard configuration.
                if (newConfig.timeStamp) newConfig.timeStamp = new Date().timeStamp;
    
                newConfig.keyboardMapping = newKeyboardTemplate;
                newConfig = Object.keys(newConfig).filter(key => key !== "keyCodeMap").filter(k=> k !== "layout").reduce((obj, key) => {
                        obj[key] = newConfig[key];
                        return obj;
                    }, {}); // the object exclude keyCodeMap and layout
                newKeyboardMappingWithKeyCode.push(newConfig);
            });
            this.logger.info(`compareWithNewConfigurationForAdmin successed`);
            return newKeyboardMappingWithKeyCode;
        } catch (error) {
            this.logger.info(`compareWithNewConfigurationForAdmin failed: ${JSON.stringify(error.message)}`);
        }
    }

    /**
     * Compared with new configuration for TE web
     * @param {*} customizedData 
     * @param {*} defaults 
     */
    compareWithNewConfigurationForWeb(customizedData, defaults) {
        try {
            let newKeyboardMappingWithKeyCode = [];
            (customizedData || []).forEach(data => {
                let newConfig = Object.assign({}, data);
                if (data.keyboardMapping && data.keyboardMapping.length !== 0) {
                    let customizedDataKeyboardMapping = data.keyboardMapping;
                    let newDefaultConfiguration = [];
                    if (data.dataEntityName === 'sessionShared' && data.keyboardMappingId !== '') {
                        let list = this.getAdminKeyboardMapping(data.keyboardMappingId); // admin keyboard mapping as default for pre-session
                        newDefaultConfiguration = list.keyboardMapping
                    } 
                    if(newDefaultConfiguration.length === 0) {
                        newDefaultConfiguration = defaults[data.terminalType]["deployMappings"].keyboardMapping; // if doesn't have admin session, uses global default
                    }
                    let keyCodeMap = this.getCurrentKeycode(data.keyCodeMap, data.layout);
                    let index;
                    let characters = Object.keys(customizedDataKeyboardMapping).map(d => customizedDataKeyboardMapping[d].key);
                    let newDefaultKeys = Object.keys(newDefaultConfiguration).map(d => newDefaultConfiguration[d].key);
                    if (characters.length !== 0) {
                        characters.forEach((char, charIndex) => {
                            if (customizedDataKeyboardMapping[charIndex].mapping.length > 8) customizedDataKeyboardMapping[charIndex].mapping.pop(); // remove the last elem
                            let charInLayoutIndex = Object.keys(data.layout).map(d => data.layout[d].findIndex(v => v.includes(char)));
                            if (charInLayoutIndex.every(d => d === -1)) {
                                if(customizedDataKeyboardMapping[charIndex].key === " ") customizedDataKeyboardMapping[charIndex].key = 'Space'; // update empty string key is space
                                index = newDefaultKeys.findIndex(d => d === customizedDataKeyboardMapping[charIndex].key);
                                if(index > -1) {
                                    customizedDataKeyboardMapping[charIndex].mapping.forEach((v, i) => {
                                        if (v !== null && (v.type !== newDefaultConfiguration[index].mapping[i].type || v.value !== newDefaultConfiguration[index].mapping[i].value)) {
                                            v.isCustomize = true;
                                        }
                                    });
                                }
                                
                            }else {
                                let layoutIdx = charInLayoutIndex.findIndex(d=> d > -1);
                                if (layoutIdx > -1) {
                                    let charIdx = charInLayoutIndex[layoutIdx];
                                    let keyCode = keyCodeMap[layoutIdx][charIdx][0]; // find keycode value
                                    index = newDefaultKeys.findIndex(d => d === keyCode);
                                    if (index > -1) {
                                        customizedDataKeyboardMapping[charIndex].key = keyCode;
                                        customizedDataKeyboardMapping[charIndex].mapping.forEach((v, i) => {
                                            if(v !== null && (v.type !== newDefaultConfiguration[index].mapping[i].type || v.value !== newDefaultConfiguration[index].mapping[i].value)) {
                                                v.isCustomize = true;
                                            }
                                        });
                                    }
                                }
                            }
                        });
                    }
                
                   let keyboardMappingTemp = customizedDataKeyboardMapping.filter(d=> d.mapping.findIndex(v => v !== null && v.isCustomize !== undefined) > -1);
                   if(keyboardMappingTemp.length !== 0 ) {
                    newConfig.keyboardMapping = keyboardMappingTemp; //filter does not customize keyboardmapping
                   }
                }
                newConfig = Object.keys(newConfig).filter(key => key !== "keyCodeMap").filter(l=> l !== "layout").filter(keyId=> keyId !== "keyboardMappingId").filter(name=> name !== "dataEntityName").reduce((obj, key) => {
                    obj[key] = newConfig[key];
                    return obj;
                }, {}); // the object exclude keyCodeMap and layout
                newKeyboardMappingWithKeyCode.push(newConfig);
            });
            this.logger.info(`CompareWithNewConfigurationForWeb successed.`);
            return newKeyboardMappingWithKeyCode;
        } catch (error) {
            this.logger.info(`CompareWithNewConfigurationForWeb failed: ${JSON.stringify(error.message)}`);
        }
       
    }

    getAdminKeyboardMapping(id) {
        let adminKeyboardMappingList = [];
        const path = `${this.deployPath}${BZADM_PATH}/sessionSettings/keyboardmapping/K_${id}.json`;
        if (fs.existsSync(path)) {
            adminKeyboardMappingList = fse.readJSONSync(path);
        }
        return adminKeyboardMappingList;
    }

    /**
     * Get current key code list, need to distinguish the 101-keyboard and 102-keyboard
     */
    getCurrentKeycode(code, layout) {
        const specialCode = ['IntlBackslash', 'Backslash', 'IntlRo', 'IntlYen'];
        let keyCodeId = [];
        let codeList = this.copy(code);
        let layoutList = this.copy(layout);
        for (var x = 0, lyt, lytId; lytId = codeList[x], lyt = layoutList[x++];) {
            if (lytId.length > lyt.length) {
              lytId.forEach((element, index) => {
                if (specialCode.includes(element[0])) {
                  lytId.splice(index,1);
                  keyCodeId.push(lytId);
                }
              });
            }else {
              keyCodeId.push(lytId);
            }
        }
        return keyCodeId;
    }
    /**
     * Update keyboard mapping with new key for admin
     * @param {*} newMappings 
     * @param {*} plugin 
     */
    async updateKeyboardMappingWithNewConfigtuation(newMappings, plugin, flag) {
        try {
            if (plugin === 'com.rs.bzadm') {
                (newMappings || []).forEach(data => {
                    let fileName = data.id?`K_${data.id}.json`:data.name;
                    let filePath = `${this.deployPath}${BZADM_PATH}/sessionSettings/keyboardmapping/${fileName}`;
                    fse.writeFileSync(filePath, JSON.stringify(data), { mode: 0o770 }, (err) => {
                        if (err) {
                            this.logger.severe('set upgrade status error : ' + err.message);
                            throw err;
                        }
                        this.logger.info('set upgrade status successfully');
                    });
                })
    
            } else if (plugin === 'com.rs.bzw') {
                if(flag === 'handleDataBeforeV120') {
                    await bzdb.bulkLoad('keyboardMappingPrivate', newMappings);
                }else {
                    newMappings.map(e=>{
                        if(!e.id){
                            e.id=e.name;
                        }
                    })
                    if(newMappings.length !== 0) {
                        let result= await bzdb.delete('keyboardMappingPrivate')
                        if(result.status) {
                            //let bulkLoadConstraints=new BZDB.BulkLoadConstraints()
                            //bulkLoadConstraints.setReplaceAsDeleteInsert();
                            await bzdb.bulkLoad('keyboardMappingPrivate', newMappings);
                            this.logger.info(`Update keyboard mapping: ${JSON.stringify(newMappings)}`);
                        }
                        
                    }
                }
            }
        } catch (error) {
            this.logger.info(`Update TE admin and web keyboard infomation failed: ${JSON.stringify(error.message)}`);
        }

    }

    /**
     * Get keyboard layout 
     * @returns object/false
     */
    getKeyboardLayout() {
        let keyboardLayoutPath = `${this.deployPath}${BZSHARED_DEFAULTS_PATH}/keyboardLayout.json`;
        let layout;
        if (fs.existsSync(keyboardLayoutPath)) {
            this.logger.info(`get keyboard layout from path:${keyboardLayoutPath}`);
            layout = fse.readJSONSync(keyboardLayoutPath);
            return layout;
        }
        this.logger.info(`There is no keyboard layout file under path:${keyboardLayoutPath}`);
        return false;
    }
    copy(data) {
        return JSON.parse(JSON.stringify(data));
    }

    getPrivateScripts() {
        const upgradeUsersPath = `${this.upgradePath}${INSTANCE_USERS_PATH}`;
        const userNames = fs.readdirSync(upgradeUsersPath);
        let scripts = [];
        (userNames || []).forEach(userName => {
            let srcPath = `${upgradeUsersPath}/${userName}/ZLUX/pluginStorage/com.rs.bzw/scripts`;
            if (fs.existsSync(srcPath)) {
                ['3270', '5250', 'vt'].forEach(d => {
                    if (fs.existsSync(srcPath + `/${d}`)) {
                        const files = fs.readdirSync(srcPath + `/${d}`);
                        if((files || []).length) {
                            files.forEach(async (file) => {
                                const name  = decodeURIComponent(file);
                                const script = fse.readJsonSync(srcPath + `/${d}/${file}`);
                                const data = {id: `${userName}_${d}_${name}`, name: name, type: d, username: decodeURIComponent(userName), script: script};
    
                                scripts.push(data);
                            });
    
                        }
                    }
                })
            }
        });
        return scripts;
    }

    getSharedScript() {
        const paths = [SITE_BZW_PATH, PRODUCT_BZW_PATH, INSTANCE_BZW_PATH];
        let scripts = [];
        paths.forEach(path => {
            let srcPath = `${this.upgradePath}${path}/scripts`;
            if (fs.existsSync(srcPath)) {
                ['3270', '5250', 'vt'].forEach(d => {
                    if (fs.existsSync(srcPath + `/${d}`)) {
                        const files = fs.readdirSync(srcPath + `/${d}`);
                        if((files || []).length) {
                            files.forEach(async (file) => {
                                const name = decodeURIComponent(file);
                                const spath = srcPath + `/${d}/${file}`;
                                if (fs.existsSync(spath)) {
                                    const script = fse.readJsonSync(spath);
                                    const data = {id: `${d}_${name}`, name: name, type: d, script: script};
                                    const index = scripts.findIndex(s => s.name === name && s.type === d);
        
                                    if(index > 0) {
                                        scripts[index] = data;
                                    } else {
                                        scripts.push(data);
                                    }
                                }
                                
                            });
    
                        }
                    }
                    
                })
            }
        });
        
        return scripts;
    }

    async scriptUpdate(){
        const scripts = this.getPrivateScripts();  // using this start from 10.1.1
        const sharedScripts = this.getSharedScript(); // using this  start from 10.1.1

        const scriptPrivate = await bzdb.bulkLoad('scriptPrivate', scripts);

        if(scriptPrivate) {
            this.logger.info('== Upgrade private scripts successfully==');
        } else {
            this.logger.severe(`Upgrade private scripts failed: ${JSON.stringify(err)}`);
        }

        const scriptShared = await bzdb.bulkLoad('scriptShared', sharedScripts);
        
        if(scriptShared) {
            this.logger.info('== Upgrade shared scripts successfully==');
        } else {
            this.logger.severe(`Upgrade shared scripts failed: ${JSON.stringify(err)}`);
        }

        if(scriptPrivate && scriptShared){
            return {status: true, message: "Upgrade script success"};
        }else{
            return {status: false, message: "Upgrade script failed"};
        }
    }
    async configurationUpgrade(){
        const configObj=[
            {
                path:'/instance/ZLUX/pluginStorage/com.rs.ldapAuth/_internal/plugin',   //ldap
                fileName:'ldapServerConfig.json',
                dbEntityName:'authConfig'
            },
            {
                path:'/instance/ZLUX/pluginStorage/com.rs.ssoAuth/_internal/plugin',  //SSO
                fileName:'ssoServerConfig.json',
                dbEntityName:'authConfig'
            },
            {
                path:'/instance/ZLUX/pluginStorage/com.rs.mssqlAuth/_internal/plugin', //MSSQL
                fileName:'msSQLServerConfig.json',
                dbEntityName:'authConfig'
            },
            {
                path:'/instance/ZLUX/pluginStorage/com.rs.bzadm/configurations',   //dataSource
                fileName:'dataSourceSetting.json',
                dbEntityName:'configurations'
            },
            {
                path:'/instance/ZLUX/pluginStorage/com.rs.bzadm/configurations',   //serverSetting
                fileName:'serverSettings.json',
                dbEntityName:'configurations'
            }
        ]
        for(var i=0;i<configObj.length;i++){
            const obj=configObj[i];
            // all related config files have already been updated when execute handleDataAfterV120()
            // update the content into db_store
            const filePath=path.join(this.deployPath, obj.path, obj.fileName);
            const content=this.getFileContent(filePath);
            if(content){
                let contentObj={
                    data:content,
                    fileName:obj.fileName
                }
                if(obj.fileName==="ssoServerConfig.json"){ 
                    await this.moveCertification(content)// //copy the certification to BZDB
                    let ssoContent=JSON.parse(JSON.stringify(content))
                    // change certification path
                    this.updateCertificationPath(ssoContent);
                    contentObj.data=ssoContent;
                }

                await bzdb.insert(obj.dbEntityName, contentObj);
                // remove useless json files
                this.logger.info(`== Begin unlink file ${filePath}`);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
                this.logger.info(`== End unlink file ${filePath}`);
            }

        }
      
        let zluxServerPath='/instance/ZLUX/serverConfig/zluxserver.json'
        zluxServerPath=path.join(this.deployPath,zluxServerPath)
        const zluxContent=jsonUtils.parseJSONWithComments(zluxServerPath)
        if(zluxContent){
            let authentication={dataserviceAuthentication:{}};
            authentication.dataserviceAuthentication=zluxContent.dataserviceAuthentication;
            let contentObj={
                data:authentication,
                fileName:'authentication.json'
            }
            await bzdb.insert('authConfig', contentObj);
        }

        return {status: true};
    }

    getFileContent(path){
        if (fs.existsSync(path)) {
            return fse.readJsonSync(path);
        }
        return null
    }
    getFileRawContent(path){
        if (fs.existsSync(path)) {
            return fse.readFileSync(path);
        }
        return null
    }
    /**
     * Update Session setting id 
     * @returns 
     */
    async updateSessionSetting() {
        try {
            const parentPath = `${this.deployPath}${BZADM_PATH}/sessionSettings`;
            const sessionSettingPath = path.join(parentPath, 'sessionSettingMapping.json');
            let paths = [], batchTxnData = [];
            if (fs.existsSync(sessionSettingPath)) {
                const sessionSettingMap = fse.readJSONSync(sessionSettingPath);
                let data = sessionSettingMap?sessionSettingMap:[];
                (data || []).forEach((value) => {
                    let id = value.id;
                    const prefsTargetPath = path.join(parentPath, 'preference', `P_${id}.json`);
                    const launchpadTargetPath = path.join(parentPath, 'launchpad', `L_${id}.json`);
                    const hotspotsTargetPath = path.join(parentPath, 'hotspots', `H_${id}.json`);
                    paths = [
                        { entityName: 'preferenceShared', path: prefsTargetPath },
                        { entityName: 'launchpadShared', path: launchpadTargetPath },
                        { entityName: 'hotspotShared', path: hotspotsTargetPath }
                    ];
                    (paths || []).forEach(element => {
                        let fileData = fse.readJSONSync(element.path);
                        if (!fileData.id) {
                            fileData = Object.assign(fileData, { id: id });
                            batchTxnData.push({ dataEntityName: element.entityName, action: 'UPDATEORINSERT', value: fileData });
                        }
                    })
                });
                const result = await bzdb.batchTxn(batchTxnData);
                if (result.status) {
                    this.logger.debug(`Upgrade session setting id: ${JSON.stringify(batchTxnData)}`);
                    this.logger.info(`Upgrade session setting id message: ${JSON.stringify(result)}`);
                    this.logger.info(`End to upgrade session Setting`);
                    return result;
                } else {
                    this.logger.severe(`Batch update the session setting id failed:${JSON.stringify(result)}`);
                    return result;
                }
            } else {
                this.logger.severe(`SessionSettingMapping file doesn't exist`);
            }
        } catch (error) {
            this.logger.severe(`Update session setting id failed: ${error.message}`);
        }
    }

    async moveCertification(ssoContent){
        this.logger.info(`start move the SSO certifications to BZDB`);
        if(ssoContent){  //copy SSO certification
            let uploadFiles=[];
            let cetifications=[ssoContent.sp.private_key,ssoContent.sp.certificate,ssoContent.idp.certificates];
            for(let i=0;i<cetifications.length;i++){
                let cpath=cetifications[i]
                if (cpath.includes('/')) { // only use fileName;
                    cpath = cpath.substring(cpath.lastIndexOf("/") + 1);
                }
                uploadFiles.push(cpath)
            }
            for(let i=0;i<uploadFiles.length;i++){
                const aFileName=uploadFiles[i]
                const filePath=path.join(this.deployPath, "/product/ZLUX/serverConfig", aFileName);
                const content=this.getFileRawContent(filePath);
                if(content){
                    let bufDataStr=JSON.stringify(content);
                    const insertData = {fileName:aFileName, data:bufDataStr};
                    await bzdb.insert('upload', insertData);
                }
            }
        }
        this.logger.info(`finished to move the SSO certifications to BZDB`);
    }

    updateCertificationPath(ssoContent){
        if(ssoContent.sp.private_key.includes('/')){
            ssoContent.sp.private_key = ssoContent.sp.private_key.substring(ssoContent.sp.private_key.lastIndexOf("/") + 1);
        }
        if(ssoContent.sp.certificate.includes('/')){
            ssoContent.sp.certificate = ssoContent.sp.certificate.substring(ssoContent.sp.certificate.lastIndexOf("/") + 1);
        }
        if(ssoContent.idp.certificates.includes('/')){
            ssoContent.idp.certificates = ssoContent.idp.certificates.substring(ssoContent.idp.certificates.lastIndexOf("/") + 1);
        }
        return ssoContent;
    }
   
}

module.exports = UpgradeTo10_1_1Service;
