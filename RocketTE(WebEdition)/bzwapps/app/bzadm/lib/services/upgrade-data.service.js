const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const sessionSettingsService = require('./session-settings.service');
// const InternalDataSteward = require('../../../bzshared/lib/services/internal-data-steward.service');
// const DataEntities = require('./data-entities.config');
const Utiles =  require('./utils.service');
const authConfigService=require("../../../bzshared/lib/services/authConfigService")
const userDataServiceFile= require('./userDataServiceFile');
const bzdb = require('../../../bzshared/lib/services/bzdb.service');
const connUtils = require('../../../bzshared/lib/services/conn-utils');
const autoScalingService = require('../../../bzshared/lib/services/auto-scaling.service');
const INSTANCE_USERS_PATH = `/instance/users`;   // private data
const INSTANCE_BZW_PATH = `/instance/ZLUX/pluginStorage/com.rs.bzw`;   // public data
const PRODUCT_BZW_PATH = `/product/ZLUX/pluginStorage/com.rs.bzw`;    // public data
const SITE_BZW_PATH = `/site/ZLUX/pluginStorage/com.rs.bzw`;       // public data

const BZADM_PATH = '/instance/ZLUX/pluginStorage/com.rs.bzadm';
const BZW_PATH = '/ZLUX/pluginStorage/com.rs.bzw';
const Promise = require('bluebird');
const DEFAULTPASSWORD="password";
const BZADMIN = 'bzadmin';
const SERVER_CONFIG_PATH = '/instance/ZLUX/serverConfig';
const DB_STORE_PATH = '/instance/ZLUX/pluginStorage/com.rs.bzshared/_db_store';
const zoweService = require('../../../bzshared/lib/services/zowe.service');
const jsonUtils = zoweService.jsonUtils;
const sym = String.fromCharCode(255);
const ServerRuntimeService = require('../../../bzshared/lib/services/server-runtime.service');
const UpgradeTo10_1_1 = require('../upgrade/upgradeTo10_1_1.service'); // upgrad to 10.1.1
const UpgradeTo10_1_2 = require('../upgrade/upgradeTo10_1_2.service'); // upgrad to 10.1.2
const UpgradeTo10_1_3 = require('../upgrade/upgradeTo10_1_3.service'); // upgrad to 10.1.3
const UpgradeTo10_1_4 = require('../upgrade/upgradeTo10_1_4.service'); // upgrad to 10.1.4
const UpgradeTo10_1_5 = require('../upgrade/upgradeTo10_1_5.service'); // upgrad to 10.1.5
const UpgradeTo10_2_0 = require('../upgrade/upgradeTo10_2_0.service'); // upgrad to 10.2.0
const UpgradeTo10_2_1 = require('../upgrade/upgradeTo10_2_1.service'); // upgrad to 10.2.1
class UpgradeDataService {

    /**
     * Constructor
     * @param {Object} context - The plugin context of which invoking this class
     */
    constructor(context){
        this.context = context;
        this.logger = context.logger;
        // this.deployPath = path.join(this.context.plugin.server.config.user.instanceDir, '../');
        this.deployPath = this.context.plugin.server.config.user.rootDir;
        // this.upgradePath = this.deployPath.replace('deploy', 'migrate');
        // this.backupPath = this.deployPath.replace('deploy', 'backup');
        this.upgradePath = path.join(path.dirname(this.deployPath), 'migrate');
        this.backupPath = path.join(path.dirname(this.deployPath), 'backup');
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
        this.instanceDir = this.context.plugin.server.config.user.instanceDir;
        this.upgradeTo10_1_1 = new UpgradeTo10_1_1(context); // upgrade to 10.1.0
        this.upgradeTo10_1_2 = new UpgradeTo10_1_2(context); // upgrade to 10.1.0
        this.upgradeTo10_1_3 = new UpgradeTo10_1_3(context); // upgrade to 10.1.0
        this.upgradeTo10_1_4 = new UpgradeTo10_1_4(context); // upgrade to 10.1.4
        this.upgradeTo10_1_5 = new UpgradeTo10_1_5(context); // upgrade to 10.1.5
        this.upgradeTo10_2_0 = new UpgradeTo10_2_0(context); // upgrade to 10.2.0
        this.upgradeTo10_2_1 = new UpgradeTo10_2_1(context); // upgrade to 10.2.1
    }

    async getHost(req) {
        const serverRuntime = new ServerRuntimeService(this.context);
        //cannot get domain...
        const serverName = await serverRuntime.getHostInfo();
        this.host = serverName ? serverName.hostFullName : (req.hostname || req.host);
    }

    getPort() {
        const protocol = this.context.plugin.server.config.user.node?.https?'https':'http'
        this.port = this.context.plugin.server.config.user.node[protocol]?.port || 8543;
    }
    getHostProtocol() {
        this.protocol = this.context.plugin.server.config.user.node?.https?'https':'http'
    }
    
    /**
     * get time stamp
     */
    getTimeStamp() {
        const date = new Date();
        return date.getTime();
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

    /**
     * check if current file is a json file
     * @param {string} fileName 
     */
    isJsonFile(fileName) {
        return fileName.slice(-5) === '.json';
    }

    /**
     * encode method copy from v1.1.5/v1.1.6
     * @param {string} value 
     */
    percentEncode(value) {
        var i;
        var pos = 0;
        var buffer = '';

        for (i = 0; i < value.length; i++) {
            var c = value.charAt(i);
            switch (c) {
                case ' ':
                    buffer += '%';
                    buffer += '2';
                    buffer += '0';
                    break;
                case '!':
                    buffer += '%';
                    buffer += '2';
                    buffer += '1';
                    break;
                case '"':
                    buffer += '%';
                    buffer += '2';
                    buffer += '2';
                    break;
                case '#':
                    buffer += '%';
                    buffer += '2';
                    buffer += '3';
                    break;
                case '%':
                    buffer += '%';
                    buffer += '2';
                    buffer += '5';
                    break;
                case '&':
                    buffer += '%';
                    buffer += '2';
                    buffer += '6';
                    break;
                case '\'':
                    buffer += '%';
                    buffer += '2';
                    buffer += '7';
                    break;
                case '*':
                    buffer += '%';
                    buffer += '2';
                    buffer += 'A';
                    break;
                case '+':
                    buffer += '%';
                    buffer += '2';
                    buffer += 'B';
                    break;
                case ',':
                    buffer += '%';
                    buffer += '2';
                    buffer += 'C';
                    break;
                case ':':
                    buffer += '%';
                    buffer += '3';
                    buffer += 'A';
                    break;
                case ';':
                    buffer += '%';
                    buffer += '3';
                    buffer += 'B';
                    break;
                case '<':
                    buffer += '%';
                    buffer += '3';
                    buffer += 'C';
                    break;
                case '=':
                    buffer += '%';
                    buffer += '3';
                    buffer += 'D';
                    break;
                case '>':
                    buffer += '%';
                    buffer += '3';
                    buffer += 'E';
                    break;
                case '?':
                    buffer += '%';
                    buffer += '3';
                    buffer += 'F';
                    break;
                case '[':
                    buffer += '%';
                    buffer += '5';
                    buffer += 'B';
                    break;
                case '\\':
                    buffer += '%';
                    buffer += '5';
                    buffer += 'C';
                    break;
                case ']':
                    buffer += '%';
                    buffer += '5';
                    buffer += 'D';
                    break;
                case '^':
                    buffer += '%';
                    buffer += '5';
                    buffer += 'E';
                    break;
                case '`':
                    buffer += '%';
                    buffer += '6';
                    buffer += '0';
                    break;
                case '{':
                    buffer += '%';
                    buffer += '7';
                    buffer += 'B';
                    break;
                case '|':
                    buffer += '%';
                    buffer += '7';
                    buffer += 'C';
                    break;
                case '}':
                    buffer += '%';
                    buffer += '7';
                    buffer += 'D';
                    break;
                default:
                    buffer += c;
                    break;
            }
        }
        return buffer;
    }

    hasTwoFolders(path, name) {
        const decodeName = decodeURIComponent(name);
        const percentEncodeName = this.percentEncode(decodeName);
        const hasPercentEncodeName = fs.existsSync(`${path}/${percentEncodeName}`);
        return (name === decodeName) && (name !== percentEncodeName) && hasPercentEncodeName;
    }

    /**
     * @param {string} name - filename
     * @param {boolean} isUsername
     */
    isEncodeNeeded(path, name, isUsername) {
        const decodeName = decodeURIComponent(name);
        const encodeName = encodeURIComponent(decodeName);
        if (!isUsername) {
            return name !== encodeName;
        } else {
            if (this.hasTwoFolders(path, name)) {
                const percentEncodeName = this.percentEncode(decodeName);
                const accountPath = `${path}/${name}/ZLUX/account`;
                if (fs.existsSync(accountPath)) {
                    const copyPath = `${path}/${percentEncodeName}/ZLUX/account`;
                    this.createDirs(copyPath);
                    fse.copySync(accountPath, copyPath);
                }
                return false;
            }
            return name !== encodeName;
        }
    }

        /**
     * 
     * @param {string} path 
     * @param {boolean} isUsername
     */
    encodePathFileNames(path, isUsername) {
        const that = this;
        let promiseArray = [];
        if (fs.existsSync(path)) {
            (fs.readdirSync(path) || []).forEach(name => {
                const decodeName = decodeURIComponent(name);
                const encodeName = encodeURIComponent(decodeName);
                if (this.isEncodeNeeded(path, name, isUsername)) {
                    let renamePromise = new Promise((resolve, reject) => {
                        let fileName = `${path}/${name}`;
                        fs.rename(fileName, `${path}/${encodeName}`, err => {
                            if (err) {
                                that.logger.severe(`Error occurs when rename ${fileName}: ${err.stack || JSON.stringify(err)}`)
                                resolve({status: false, message: `Error occurs when rename ${fileName}: ${JSON.stringify(err)}`, name: name});
                            } 
                            resolve({status: true, message: `Rename ${fileName} success`, name: encodeName});
                        });
                    })
                    promiseArray.push(renamePromise); 
                }
            });
        }
        return promiseArray;
    }
    
    /**
     * 
     * @param {string} path 
     * @param {boolean} isUsername
     */
    encodePathFileNamesSync(path, isUsername) {
        if (fs.existsSync(path)) {
            (fs.readdirSync(path) || []).forEach(name => {
                if (name !== 'superadmin' && name !== '_anonymous_access') {
                    const decodeName = decodeURIComponent(name);
                    const encodeName = encodeURIComponent(decodeName);
                    if (this.isEncodeNeeded(path, name, isUsername)) {
                        const fileName = `${path}/${name}`;
                        const renamePath = `${path}/${encodeName}`;
                        if (!fs.existsSync(renamePath)) {
                            try {
                                fs.renameSync(fileName, renamePath);
                            }
                            catch (err) {
                                fs.renameSync(fileName, renamePath);
                                this.logger.severe(`Rename ${fileName} to ${renamePath} failed: ${err.stack || JSON.stringify(err)}`);
                            }
                        }
                    }
                }
            });
        }
    }

    /**
     * Check if the parent folder contains all children filder that it should have
     * @param {string} path - parent folder path
     * @param {array} children - the children folder name that the parent path must contain
     */
    isValidPath(path, children) {
        if (!fs.existsSync(path)) {
            return false;
        }

        let childNames = fs.readdirSync(path);
        if (!childNames || childNames.length < children.length) {
            return false;
        }
        
        let valid = true;
        children.forEach(child => {
            if (childNames.indexOf(child) === -1) {
                valid = false;
            }
        });
        return valid;
    }

    getLuInfo() {
        let luObj = {};
        const MAX_LU_COLUMNS = 32;
        const LU_PREFIX = 'LU';
        for (let n = 1; n <= MAX_LU_COLUMNS; n++) {
			const key = LU_PREFIX + n;
			luObj[key] = '';
        }
        return luObj;
    }

    getUserInfo(username, luInfo) {
        const userId = decodeURIComponent(username);
        const account_path = `${this.upgradePath}${INSTANCE_USERS_PATH}/${userId}/ZLUX/account`;
        const path = `${account_path}/login.json`;
        let userInfo = {
            timeStamp: this.getTimeStamp(),
            userName: '',
            mail: '',
            phone: '',
            groupNames: []
        };
        userInfo = Object.assign(userInfo, luInfo);
        try {
            if (fs.existsSync(path)) {
                const dataObj = fse.readJsonSync(path);
                userInfo = Object.assign(userInfo, {
                    userId: dataObj.username,
                    authentication: dataObj.authentication || '',
                    iv: dataObj.iv || '',
                    salt: dataObj.salt || ''
                });
            } else {
                userInfo = Object.assign(userInfo, {
                    userId: userId,
                    password: DEFAULTPASSWORD
                });
            }
            return userInfo;
        }
        catch (e) {
            this.logger.severe(`Get user info failed: ${e.stack}`);
            this.loginParseInfo.hasError = true;
            this.loginParseInfo.errorFiles.push(path);
            this.loginParseInfo.users.push(userId);
            // for login.json parse problem in Z/os with node 8
            // reset user password to default password like ldap user
            userInfo = Object.assign(userInfo, {
                userId: userId,
                password: DEFAULTPASSWORD
            });
            return userInfo;
        }
        
    }

     /**
     * 1. get private user data under /instance/users
     * 2. generate login_newName.json and userInfo_newName.json to /instance/ZLUX/pluginStorage/com.rs.bzadm/users
     * newName = encodeURIComponent(username)
     * login_newName.json
     * userInfo_newName.json
     */
    async getInternalUsersData(req, res) {
        try {
            let promiseArray = [];
            const usersPath = `${this.upgradePath}${INSTANCE_USERS_PATH}`;
            if (fs.existsSync(usersPath)) {
                let userInfoArray = [];
                const luInfo = this.getLuInfo();
                let userDataObj = {
                    sessions: [],
                    hotspots: [],
                    keyboardmapping: [],
                    launchpad: []
                }
                fs.readdirSync(usersPath)
                .forEach(user => {
                    const originUser = decodeURIComponent(user);
                    const username = encodeURIComponent(originUser);
                    if (originUser !== 'superadmin' && originUser !== '_anonymous_access' && !this.hasTwoFolders(usersPath, user)) {
                        const userInfo = this.getUserInfo(username, luInfo);
                        userInfoArray.push(userInfo);
                    }
                    this.getUserPrivateData(`${usersPath}/${user}`, decodeURIComponent(username), userDataObj);
                });
                this.removeUserWithInvalidData(userInfoArray);

                promiseArray.push(bzdb.bulkLoad('sessionPrivate', userDataObj.sessions));
                promiseArray.push(bzdb.bulkLoad('keyboardMappingPrivate', userDataObj.keyboardmapping));
                promiseArray.push(bzdb.bulkLoad('hotspotPrivate', userDataObj.hotspots));
                promiseArray.push(bzdb.bulkLoad('launchpadPrivate', userDataObj.launchpad));
                const loginInfoArray = await this.userDataService.createUploadUserlogins(userInfoArray, '');
                promiseArray.push(bzdb.bulkLoad('userLogin', loginInfoArray));
                promiseArray.push(bzdb.bulkLoad('userInfo', userInfoArray));
            }
            return promiseArray;
        }
        catch(e) {
            return {message: e.message || '', stack: e.stack || ''};
        }
    }

        /**
     * get original files info of sessions, keyboard mapping, launchpad and hotspots folder under {username}/ZLUX/pluginStorage/com.rs.bzw
     * @param {string} userId 
     * @param {object} dataObj - {sessions: [], hotspots:[], keyboardmapping: [], launchpad: []}
     * */
    getUserPrivateData(userPath, userId, dataObj) {
        const path = `${userPath}/ZLUX/pluginStorage/com.rs.bzw`
        const folderNames = ['sessions', 'hotspots', 'keyboardmapping', 'launchpad'];
        const originLen = dataObj && dataObj.sessions && dataObj.sessions.length || 0;
        let sessionFileName=[];
        folderNames.forEach(name => {
            const folderPath = `${path}/${name}`;
            if (fs.existsSync(folderPath)) {
                fs.readdirSync(folderPath).forEach((fileName, idx) => {
                    let filePath = `${folderPath}/${fileName}`;
                    if (this.isJsonFile(filePath)) {
                        try {
                            let data = fse.readJsonSync(filePath);
                            if (name === 'sessions') {
                                sessionFileName.push(fileName.slice(0, -5)) //only put the name into array
                                if (data.sessions && data.sessions.session) {
                                    data = data.sessions.session;
                                    data.id = `${userId}${sym}${data.name}`; 
                                    // for v1.1.4 upgrade
                                    if (!data.sessionAliasType) {
                                        data.sessionAliasType = this.getSessionAliasType(data);
                                    }
                                }
                            } else {
                                // JSTE-2783: for 1.1.6 bug: '+' displays as backspace'%20' in file name
                                let fileNameWithoutSuffix=fileName.substring(1,fileName.lastIndexOf("_")) //_d%20ds_hotspots.json
                                let index=sessionFileName.findIndex(e=>e===fileNameWithoutSuffix)
                                const matchSession = dataObj['sessions'][index] || {};
                                data.name = `_${matchSession.name || ''}_${name === 'keyboardmapping' ? 'keyboardMapping' : name}`;
                                 //data.name = decodeURIComponent(fileName.slice(0, -5));
                                data.id = `${userId}${sym}${matchSession.name || ''}_${name === 'keyboardmapping' ? 'keyboardMapping' : name}`; 
                            }
                            data.userId = userId;
                            dataObj[name].push(data);
                        }
                        catch (e) {
                            // for json parse problem in Z/os with node 8
                            // save the error info to this.otherParseInfo
                            this.logger.severe(`Get user private data failed: ${e.stack}`);
                            this.otherParseInfo.hasError = true;
                            this.otherParseInfo.errorFiles.push(filePath);
                            if (this.otherParseInfo.users.indexOf(userId) === -1) {
                                this.otherParseInfo.users.push(userId);
                            }
                        }
                    }
                });
            }
        });
    }

     /**
     * Do not create the user if the user data has some error occurs
     * get original files info of sessions, keyboard mapping, launchpad and hotspots folder under site/product/instance
     * @param {array} users - all usres info
     */
    removeUserWithInvalidData(users) {
        users = users || [];
        (this.otherParseInfo.users || []).forEach(userId => {
            const index = users.findIndex(user => user.userId === userId);
            if (index > -1) {
                users.splice(index, 1);
            }
        });
    }

    /**
     * get original files info of sessions, keyboard mapping, launchpad and hotspots folder under site/product/instance
     * @returns {object} - {originData, namesArray}
     * @returns {array} originData - get each file content promise array
     * @returns {array} namesArray: file names array
     */
    getOriginPublicData() {
        const paths = [SITE_BZW_PATH, PRODUCT_BZW_PATH, INSTANCE_BZW_PATH];
        const folderNames = ['sessions', 'hotspots', 'keyboardmapping', 'launchpad'];
        let originData = [];
        let namesArray = [];
        paths.forEach(path => {
            if (this.isValidPath(`${this.upgradePath}${path}`, folderNames)) {
                folderNames.forEach(name => {
                    const folderPath = `${this.upgradePath}${path}/${name}`;
                    fs.readdirSync(folderPath).forEach(fileName => {
                        let filePath = `${folderPath}/${fileName}`;
                        if (this.isJsonFile(filePath)) {
                            try {
                                const data = fse.readJsonSync(filePath);
                                if (data) {
                                    namesArray.push(`${name}$$${this.processFileName(name, fileName)}`);
                                    originData.push(fse.readJsonSync(filePath));
                                }
                            }
                            catch (e) {
                                // for json parse problem in Z/os with node 8
                                // save the error info to this.otherParseInfo
                                this.logger.severe(`Get user public data failed: ${e.stack}`);
                                this.otherParseInfo.hasError = true;
                                this.otherParseInfo.errorFiles.push(filePath);
                            }
                        }
                    });
                });
            }
        });
  
        return {originData: originData, namesArray: namesArray};
    }

    /**
     * copy original script files under site/product/instance
     * @returns {array} promiseArray
     */
    copyPublicScripts() {
        const paths = [SITE_BZW_PATH, PRODUCT_BZW_PATH, INSTANCE_BZW_PATH];
        let promiseArray = [];
        paths.forEach(path => {
            let srcPath = `${this.upgradePath}${path}/scripts`;
            let destPath = `${this.deployPath}${path}/scripts`;
            if (fs.existsSync(srcPath)) {
                if (!fs.existsSync(destPath)) {
                    this.createDirs(destPath);
                }
                fse.copySync(srcPath, destPath);
                promiseArray = promiseArray.concat(this.getEncodeScripts(destPath));
            }
        });
        return promiseArray;
    }

    /**
     * process product data for mapping data in bzadm
     * @param {array} data - the file contents 
     * @param {array} names - The file names
     * @returns {object} for example: {3270_11: {sessions: {...}, keyboardmapping: {...}, launchpad: {...}, hotspots: {...}, preference: {...}}} 
     */
    mapPublicData(data, names) {
        let newData = {};
        data.forEach((item, idx) => {
            let nameArray = (names[idx] || '').split('$$') || [];
            if (nameArray.length === 2) {
                let fileType = nameArray[0];
                let sessionName = nameArray[1];
                if (newData[sessionName] == undefined) {
                    newData[sessionName] = {};
                }
                if (fileType === 'sessions') {
                    let session = item.sessions && item.sessions.session;
                    if (session) {
                        let sessionData = this.processSessionData(session);
                        newData[sessionName]['sessions'] = sessionData.sessionObj;
                        newData[sessionName]['preference'] = sessionData.preferenceObj;
                    }
                } else {
                    newData[sessionName][fileType] = item;
                }
            }
        });
        return this.removeInvalidPublicData(newData);
    }

    /**
     * remove session object if its childen key not contains all childKeys: ['sessions', 'keyboardmapping', 'launchpad', 'hotspots', 'preference']
     * remove session object if session name is undefined or ''
     * @param {object} data - for example: {3270_11: {sessions: {...}, keyboardmapping: {...}, launchpad: {...}, hotspots: {...}, preference: {...}}} 
     */
    removeInvalidPublicData(data) {
        let newData = {};
        Object.keys(data).forEach(key => {
            let sessionObj = data[key];
            if (Object.keys(sessionObj).length === 5 && sessionObj['sessions'] && sessionObj['keyboardmapping'] && sessionObj['launchpad']
              && sessionObj['hotspots'] && sessionObj['preference'] && sessionObj['sessions'].name && sessionObj['sessions'].name !== '') {
                 newData[key] = sessionObj;
             }
        });
        return newData;
    }

    /**
     * 
     * @param {string} session - sessionAliasType, for example '3270Model2'
     */
    getTerminalType(session) {
        // JSTE-2851: v1.1.4 has session.sessionType but not have session.sessionAliasType or session.type
        const type = session.sessionType ? this.getSessionAliasType(session) : session.sessionAliasType || session.type || '';
        if (type.indexOf('3270') > -1) {
            return '3270';
        } else if (type.indexOf('5250') > -1) {
            return '5250';
        } else if (type.indexOf('VT') > -1) {
            return 'VT';
        }
        return '3270';
    }

    
    /**
     * 
     * @param {string} path 
     */
    getExistMappingIDs(path) {
        if (!fs.existsSync(path)) {
            return [];
        }
        try{
            return fse.readJsonSync(path);
        }catch(err){
            return [];
        }
        
    }

    getExistedID(name, dataArray) {
        const existedIDs = dataArray.filter(dataObj => dataObj.name === name);
        if (existedIDs && existedIDs.length === 1) {
            return existedIDs[0].id;
        }
        return undefined;
    }

    getExistedIDIdx(name, dataArray) {
        return dataArray.findIndex(dataObj => dataObj.name === name);
    }

      /**
     * check if the same name keyboard/session setting template already exist
     * if exist, use the exist ID
     * otherwise create new ID with session name
     * @param {object} sessionsObj
     * @returns {object} 
     */
    processKeyboardsessionSettingIDs(sessionsObj) {
        const path = `${this.deployPath}/${BZADM_PATH}/sessionSettings`;
        const keyboardMappingPath = `${path}/keyboardMapping.json`;
        const sessionSettingMappingPath = `${path}/sessionSettingMapping.json`;
        const existKMObjs = this.getExistMappingIDs(keyboardMappingPath);
        const existSSObjs = this.getExistMappingIDs(sessionSettingMappingPath);
        
        let newKMIds = [];        // new keyboard template checked id info
        let newSSIds = [];        // new session setting template checked id info
        let uniqueKMObjs = [];    // the whole keyboard mapping data without duplicated name
        let uniqueSSObjs = [];    // the whole session setting mapping data without duplicated name

        Object.keys(sessionsObj).forEach(sessionName => {
            const session = sessionsObj[sessionName].sessions || {};
            const name = session.name || '';
            const existedKMIdIdx = this.getExistedIDIdx(name, existKMObjs);
            const existedSSIdIdx = this.getExistedIDIdx(name, existSSObjs);
            const currentKMId = existedKMIdIdx > -1 ? existKMObjs[existedKMIdIdx].id : name;
            const currentSSId = existedSSIdIdx > -1 ? existSSObjs[existedSSIdIdx].id : name;
            const dataObj = {
                name: name, 
                type: this.getTerminalType(session),
                isUpgrade: true
            };
 
            newKMIds.push(currentKMId);
            newSSIds.push(currentSSId);

            // assign template id to session
            sessionsObj[sessionName].sessions.keyboardMapping = currentKMId;
            sessionsObj[sessionName].sessions.sessionSettings = currentSSId;

            if (existedKMIdIdx === -1) {
                uniqueKMObjs.push(Object.assign({id: currentKMId}, dataObj));
            } else {
                // get new session type
                existKMObjs[existedKMIdIdx].type = dataObj.type;
                existKMObjs[existedKMIdIdx].isUpgrade = true;
            }

            if (existedSSIdIdx === -1) {
                uniqueSSObjs.push(Object.assign({id: currentSSId}, dataObj));
            } else {
                existSSObjs[existedSSIdIdx].type = dataObj.type;
                existSSObjs[existedSSIdIdx].isUpgrade = true;
            }
        });
        return {
            newKMIds: newKMIds,
            newSSIds: newSSIds,
            uniqueKMObjs: uniqueKMObjs.concat(existKMObjs),
            uniqueSSObjs: uniqueSSObjs.concat(existSSObjs)
        };
    }

    /**
     * need update keyboardMapping.json and sessionSetingMapping.json after generate new keyboard template and session setting template
     * @param {array} keyboardObjs
     * @param {array} sessionSettingObjs
     * @returns {promise} [write keyboardMapping.json, write sessionSettingMapping.json]
     */
    updateKeyboardsessionSettingIDMappingData(keyboardObjs, sessionSettingObjs) {
        const path = `${this.deployPath}${BZADM_PATH}/sessionSettings`;
        const keyboardMappingPath = `${path}/keyboardMapping.json`;
        const sessionSettingMappingPath = `${path}/sessionSettingMapping.json`;
        this.createDirs(keyboardMappingPath);
        this.createDirs(sessionSettingMappingPath);
        return [
            fse.writeJSON(keyboardMappingPath, keyboardObjs, { mode: 0o770 }),
            fse.writeJSON(sessionSettingMappingPath, sessionSettingObjs, { mode: 0o770 })
        ];
    }

    processFileName(folderName, fileName) {
        if (folderName === 'sessions') {
            // for example: 3270_11.json
            return fileName.slice(0, -5);
        } else {
            // for example: _3270_11_launchpad.json
            let partStr = folderName === 'keyboardmapping' ? 'keyboardMapping' : folderName;
            let index = fileName.indexOf(partStr) - 1;
            return fileName.slice(1, index);
        }
    }

    processSessionData(session) {
        const keys = ['font', 'contextRightClick', 'color', 'cursor', 'language', 'hotspots', 'launchpadConfig'];
        let preferenceObj = {};
        Object.keys(session).forEach(key => {
            if (keys.indexOf(key) > -1) {
                preferenceObj[key] = session[key];
                // map special changes for vt color
                if (key === 'color' && this.getTerminalType(session) === 'VT') {
                    preferenceObj[key]['backgroundBold'] = '#000000';
                    preferenceObj[key]['foregroundBlinking'] = '#008000';
                    preferenceObj[key]['backgroundBlinking'] = '#000000';
                    preferenceObj[key]['foregroundBoldBlinking'] = '#00f000';
                    preferenceObj[key]['backgroundBoldBlinking'] = '#000000';
                    preferenceObj[key]['inverseForegroundBlinking'] = '#000000';
                    preferenceObj[key]['inverseBackgroundBlinking'] = '#008000';
                    preferenceObj[key]['inverseForegroundBoldBlinking'] = '#000000';
                    preferenceObj[key]['inverseBackgroundBoldBlinking'] = '#00f000';
                }
                // map special changes for vt scrollbar
                // JSTE-2851: v1.1.4 does not have sessionScrollbackEnabled
                if (key === 'font' && session['vtHistoryScrollBufferLines'] !== undefined) {
                    preferenceObj[key]['sessionScrollbackEnabled'] = session['sessionScrollbackEnabled'] === undefined ? true :
                      session['sessionScrollbackEnabled'] || false;
                    preferenceObj[key]['vtHistoryScrollBufferLines'] = session['vtHistoryScrollBufferLines'];
                }
            }
        });
        return {sessionObj: this.mapSessionData(session), preferenceObj: preferenceObj};
    }

    getSessionAliasType(session) {
        const sessionTypes = {
            "3270Model2": "TN3270E_DEVICE_TYPE_3278_2",
            "3270Model3": "TN3270E_DEVICE_TYPE_3278_3",
            "3270Model4": "TN3270E_DEVICE_TYPE_3278_4",
            "3270Model5": "TN3270E_DEVICE_TYPE_3278_5",
            "3270dynamic": "TN3270E_DEVICE_TYPE_DYNAMIC",
            "3270Model2_3279": "TN3270E_DEVICE_TYPE_3279_2",
            "3270Model3_3279": "TN3270E_DEVICE_TYPE_3279_3",
            "3270Model4_3279": "TN3270E_DEVICE_TYPE_3279_4",
            "3270Model5_3279": "TN3270E_DEVICE_TYPE_3279_5",
            "3270dynamic_3279": "TN3270E_DEVICE_TYPE_DYNAMIC_3279",            
            "3287Model2": "TN3270E_DEVICE_TYPE_3287_2",
            "5250Model3179-2": "TN5250_DEVICE_TYPE_3179_2",
            "5250Model3180-2": "TN5250_DEVICE_TYPE_3180_2",
            "5250Model3196-A1": "TN5250_DEVICE_TYPE_3196_A1",
            "5250Model3477-FC": "TN5250_DEVICE_TYPE_3477_FC",
            "5250Model3477-FG": "TN5250_DEVICE_TYPE_3477_FG",
            "5250Model5251-11": "TN5250_DEVICE_TYPE_5251_11",
            "5250Model5291-1": "TN5250_DEVICE_TYPE_5291 _1",
            "5250Model5292-2": "TN5250_DEVICE_TYPE_5292_2",
            "5250Model5555-B01": "TN5250_DEVICE_TYPE_5555_B01",
            "5250Model5555-C01-132": "TN5250_DEVICE_TYPE_5555_C01_132",
            "5250Model5555-C01-80": "TN5250_DEVICE_TYPE_5555_C01_80",
            "VTlinux": "VT_TERM_TYPE_LINUX",
            "VT220": "VT_TERM_TYPE_VT220",
            "VT320": "VT_TERM_TYPE_VT320",
            "VT420": "VT_TERM_TYPE_VT420"
        };
        let sessionAliasType = '';
        Object.keys(sessionTypes).forEach(key => {
            if (sessionTypes[key] === session.sessionType) {
                sessionAliasType = key;
            }
        });
        return sessionAliasType;
    }

    mapSessionData(session) {
        return {
            name: session.name,
            host: session.TCPHost,
            port: session.TCPPort,
            // connectionType:
            // compability with v1.1.4 
            securityType: session.securityType !== undefined ? session.securityType : `${session.security.type}`,
            type: session.sessionAliasType ? session.sessionAliasType : this.getSessionAliasType(session),
            invalidCertificateHandling: session.invalidCertificateHandling !== undefined ? session.invalidCertificateHandling : `${session.security.badCert}`,
            columns: session.sessionColumns || (session.isVTSession ? '160' : '80'),
            rows: session.sessionRows || (session.isVTSession ? '62' : '24'),
            sessionMaxSize: session.sessionMaxSize || false,
            keyboardMapping: session.name,
            sessionSettings: session.name
        };
    }

    createSessionSettingsFolder() {
        this.sessionSettingDataService.createSessionSettingsPath();
    }

    createSessionsFolder() {
        this.createDirs(`${this.deployPath}${BZADM_PATH}/sessions`);
    }

     /**
     * Creates session
     * @param {object} data - session data  
     */
    createSession(req, sessionObj) {
        const date = new Date();
        const timestamp = date.getTime();
        let sessions = sessionObj.sessions;
        const sessionData = Object.assign(sessions, {timestamp: timestamp, id: sessions && sessions.name || ''});
        return bzdb.updateOrInsert('sessionShared', sessionData);
    }

    /**
     * Creates keyboard template
     * @param {request} req
     * @param {object} sessionObj - for example: {3270_11: {sessions: {...}, keyboardmapping: {...}, launchpad: {...}, hotspots: {...}, preference: {...}}}   
     */
    createKeyboardTemplate(req, sessionObj, id) {
        const date = new Date();
        const data = Object.assign(sessionObj.keyboardmapping, { timestamp: date.getTime(), id: id });
        return bzdb.updateOrInsert('keyboardMappingShared', data);
    }

    /**
     * Creates session settings template
     * @param {request} req
     * @param {object} sessionObj - for example: {3270_11: {sessions: {...}, keyboardmapping: {...}, launchpad: {...}, hotspots: {...}, preference: {...}}}   
     */
    createSessionSettingsTemplate(req, sessionObj, id) {
        const dataObj = {timestamp: Date.now(), id: id };
        const prefsValue = Object.assign({}, sessionObj.preference, dataObj);
        const launchpadsValue = Object.assign({}, sessionObj.launchpad, dataObj);
        const hotspotsValue = Object.assign({}, sessionObj.hotspots, dataObj);
        return [
            bzdb.updateOrInsert('preferenceShared', prefsValue),
            bzdb.updateOrInsert('launchpadShared', launchpadsValue),
            bzdb.updateOrInsert('hotspotShared', hotspotsValue)
        ];
    }

     /**
     * process public data for mapping data in bzadm
     * @param {array} data - the file contents 
     * @param {array} names - The file names
     */
    processPublicData(req, data, names) {
        let newData = this.mapPublicData(data, names);
        const templateIds = this.processKeyboardsessionSettingIDs(newData);
        this.createSessionSettingsFolder();
        this.createSessionsFolder();
        let promiseArray = [];
        Object.keys(newData).forEach((sessionObj, idx) => {
            // create session with keyboard, session settings assigned
            // create keyboard mapping template
            // create session settings template
            promiseArray.push(this.createSession(req, newData[sessionObj]));
            promiseArray.push(this.createKeyboardTemplate(req, newData[sessionObj], templateIds.newKMIds[idx]));
            promiseArray.concat(this.createSessionSettingsTemplate(req, newData[sessionObj], templateIds.newSSIds[idx]));
        });
        return promiseArray.concat(this.updateKeyboardsessionSettingIDMappingData(templateIds.uniqueKMObjs, templateIds.uniqueSSObjs));
    }

    /**
     * 
     * @param {string} path 
     */
    getEncodeScripts(path) {
        const folders = ['3270', '5250', 'editor', 'vt'];
        let promiseArray = [];
        folders.forEach(folderName => {
            const folderPath = `${path}/${folderName}`;
            if (fs.existsSync(folderPath)) {
                promiseArray = promiseArray.concat(this.encodePathFileNames(folderPath) || []);
            }
        });
        return promiseArray;
    }

    /**
     * encode all private path names
     * 1. encode /instance/users path
     * 2. encode /instance/users/username/ZLUX/pluginStorage/com.rs.bzw/[sessions, scripts, launchpad, keyboardmapping, hotspots]
     */
    encodePrivatePaths() {
        const that = this;
        return new Promise((resolve, reject) => {
            const usersPath = `${this.deployPath}${INSTANCE_USERS_PATH}`;
            if (fs.existsSync(usersPath)) {
                this.encodePathFileNamesSync(usersPath, true);
                let bzwEncodePromise = [];
                (fs.readdirSync(usersPath) || []).forEach(user => {
                    const bzwPath = `${usersPath}/${user}${BZW_PATH}`;
                    const folderNames = [/*'sessions', */'scripts'/*, 'launchpad', 'keyboardmapping', 'hotspots'*/];
                    folderNames.forEach(folderName => {
                        const folderPath = `${bzwPath}/${folderName}`;
                        if (fs.existsSync(folderPath)) {
                            if (folderName === 'scripts') {
                                bzwEncodePromise = bzwEncodePromise.concat(this.getEncodeScripts(folderPath));
                            } else {
                                bzwEncodePromise = bzwEncodePromise.concat(this.encodePathFileNames(folderPath) || []);
                            }
                        }
                    });
                });
                Promise.all(bzwEncodePromise || []).then(data => {
                    that.logger.info('Encode private paths success.');
                    resolve({status: true, message: 'Encode private paths success.'});
                }, err => {
                    that.logger.severe(`Encode private paths failed: ${err.stack || JSON.stringify(err)}`);
                    resolve({status: false, message: 'Encode private paths failed.'})
                });
            } else {
                that.logger.info('Encode private paths success.');
                resolve({status: true, message: 'Encode private paths success.'});
            }
        });
    }

     /**
     * get private data under /instance/users
     * 1. copy instance folder
     * 2. create user in bzadm
     * 3. rename folder name(encode folder name: [username, sessions, scripts, launchpad, keyboardmapping, hotspots])
     * @param req - request
     * @param res - response
     */
    getPrivateData(req, res) {
        const that = this;
        return new Promise((resolve, reject) => {
            try {
                this.encodePrivatePaths().then(async data => {
                    const promiseArray = await this.getInternalUsersData(req, res);
                    if (!Array.isArray(promiseArray)) {
                        that.logger.severe(`Upgrade private data failed: ${promiseArray.stack}`);
                        resolve({status: false, message: `Upgrade private data failed: ${promiseArray.message || 'unknown error occurs'}`});
                    } else {
                        Promise.all(promiseArray).then(response => {
                            that.logger.info(`Upgrade private data success`);
                            resolve({status: true, message: 'Upgrade private data success.'});
                        }, err => {
                            that.logger.severe(`Upgrade private data failed: ${JSON.stringify(err)}`);
                            resolve({status: false, message: 'Upgrade private data failed: Unknown error occurs'});
                        })
                    }
                }, err => {
                    that.logger.severe(`Encode private data for upgrading failed: ${JSON.stringify(err)}`);
                    resolve({status: false, message: 'Upgrade private data failed.'});
                });
            }
            catch(err) {
                that.logger.severe(`Copy private data for upgrading failed: ${JSON.stringify(err)}`);
                resolve({status: false, message: 'Upgrade data failed: Copy private data failed.'});
            }
        });
    }

    /**
     * get public data under /[site/product/instance]/ZLUX/pluginStorage/com.rs.bzw
     * 1. same name priority(low -> high): site -> product -> instance
     * 2. sessions: each session has a seperate keyboard template and session setting template
     * 3. scripts: bzadm does not support scripts yet, just copy scripts to corresponding folder
     * 
     * special changes:
     * 1. session max size, columns, rows
     * 2. vt default prefernce file changed
     * 
     * process:
     * 1. process [site/product/instance] sessions, launchpad, hotspots, keyboardmapping
     * 2. copy scripts folder to [site/product/instance] folder
     * 3. create keyboard mapping and create session setting
     * 4. create session with keyboard mapping and session setting
     * 5. update keyboardMapping.json and sessionSettingMapping.json
     * 
     * @param req - request
     * @param res - response
     */
    getPublicData(req, res) {
        const that = this;
        return new Promise((resolve, reject) => {
            try {
                const publicData = this.getOriginPublicData();
                try {
                    const promiseArray = this.processPublicData(req, publicData.originData || [], publicData.namesArray || []);
                    Promise.all(promiseArray).then(response => {
                        that.logger.info(`Upgrade public data success`);
                        resolve({status: true, message: 'Upgrade public data success.'});
                    }, err => {
                        that.logger.severe(`Upgrade public data failed: ${JSON.stringify(err)}`);
                        resolve({status: false, message: 'Upgrade public data failed: Unknown error occurs'});
                    })
                }
                catch(error) {
                    that.logger.severe(`Upgrade public data failed: ${error.stack}`);
                    resolve({status: false, message: 'Upgrade public data failed: Unknown error occurs'});
                }
            }
            catch(error) {
                that.logger.severe(`Upgrade public data failed: ${error.stack}`);
                resolve({status: false, message: 'Upgrade public data failed: Unknown error occurs'});
            }
        });
    }

    fixUpgradePath() {
        const DEPLOY_PATH = `${this.upgradePath}/deploy`;
        const MIGRATE_PATH = `${this.upgradePath}/migrate`;
        const MIGRAGE_DEPLOY_PATH = `${this.upgradePath}/migrate/deploy`;
        if (fs.existsSync(MIGRAGE_DEPLOY_PATH)) {
            this.upgradePath = MIGRAGE_DEPLOY_PATH;
        } else if (fs.existsSync(DEPLOY_PATH)) {
            this.upgradePath = DEPLOY_PATH;
        } else if (fs.existsSync(MIGRATE_PATH)) {
            this.upgradePath = MIGRATE_PATH;
        }
    }

    uniqueArray(arr) {
        return arr.filter((item, index) => arr.indexOf(item) >= index);
    }

    handleDataBeforeV120(req, res) {
        // for z/os login.json or other json files parse problem
        this.loginParseInfo = {
            hasError: false,
            users: [],
            errorFiles: []
        };
        this.otherParseInfo = {
            hasError: false,
            users: [],
            errorFiles: []
        };
        return new Promise((resolve, reject) => {
            Promise.all([this.getPrivateData(req, res), this.getPublicData(req, res)])
            .then(async (result) => {
                const loginParseError = this.loginParseInfo.hasError ? JSON.stringify(this.loginParseInfo.errorFiles) : '';
                const JSONParseError = this.otherParseInfo.hasError ? JSON.stringify(this.otherParseInfo.errorFiles) : '';
                if (result[0].status && result[1].status && !this.otherParseInfo.hasError) {
                    //await this.upgradeTo10_1_1.convertKeyboardMapping('before120'); // update keyboard mappings
                    this.logger.info('Upgrade data success');
                    resolve({
                        status: true, 
                        message: 'Update data success', 
                        loginParseError: loginParseError,
                        users: this.loginParseInfo.users,
                        updatedUrl: `${this.protocol}://${this.host}:${this.port}/${BZADMIN}`,
                        handleParse:'handleDataBeforeV120'
                    });
                } else {
                    const message = (result[0].status ? '' : result[0].message) + (result[1].status ? '' : result[1].message)
                        + (JSONParseError ? 'JSON parse error: '+ JSONParseError : '');
                    this.logger.severe(`Upgrade data failed: ${message}`);
                    resolve({
                        status: false,
                        message: {
                            privateData: result[0].message,
                            publicData: result[1].message,
                            loginParseError: loginParseError,
                            JSONParseError: JSONParseError,
                            users: this.uniqueArray(this.loginParseInfo.users.concat(this.otherParseInfo.users))
                        }
                    });
                }
            }, err => {
                this.logger.severe(`Upgrade data failed: ${JSON.stringify(err)}`);
                resolve({status: false, message: `Upgrade data failed: ${JSON.stringify(err)}`});
            });
        });
    }

    copyDataForV120(paths, updateFlag, limit) {
        this.logger.info('== Begin copyDataForV120(), path is '+paths);
        (paths || []).forEach(path => {
            const srcPath = `${this.upgradePath}${path}`;
            const destPath = `${this.deployPath}${path}`;
            if (fs.existsSync(srcPath)) {
                if (!fs.existsSync(destPath)) {
                    this.logger.info(`== Create folder '${destPath}'`);
                    this.createDirs(destPath);
                }
                if (limit) {
                    fs.readdirSync(srcPath).forEach(file => {
                        const fileExt = file.split('.')[1];
                        if (limit.indexOf(`.${fileExt}`) > -1) {
                            fse.copySync(`${srcPath}/${file}`, `${destPath}/${file}`);
                        }
                        if(!limit.includes(file)){
                            fse.copySync(`${srcPath}/${file}`, `${destPath}/${file}`);
                        }
                    });
                } else if (updateFlag) {
                    fs.readdirSync(srcPath).forEach(file => {
                        if (fs.existsSync(`${srcPath}/${file}`) && file != 'installation.json' && file != 'adminConfig.json' && file != 'agency.txt') {  //installation.json should not be cover //agency.txt shouldn't be convered
                            let originalData = {};
                            let oldData = {};

                            this.logger.info('== start to read old data: ' + `${srcPath}/${file}`);
                            oldData = JSON.parse(fs.readFileSync(`${srcPath}/${file}`, 'utf8'));
                            this.logger.info('== end to read old data: ' + JSON.stringify(oldData));

                            if (fs.existsSync(`${destPath}/${file}`)) {
                                this.logger.info('== start to read origin data: ' + `${destPath}/${file}`);
                                originalData = JSON.parse(fs.readFileSync(`${destPath}/${file}`, 'utf8'));
                                this.logger.info('== end to read origin data: ' + JSON.stringify(originalData));
                            }

                            let data = Object.assign(originalData, oldData);
                            // the upgrade status saved in serverSettings.json
                            if (file === 'serverSettings.json') {
                                data.hasUpgrade = false;
                            }
                            fs.writeFileSync(`${destPath}/${file}`, JSON.stringify(data, null, 2), { mode: 0o770 });
                        }else if(fs.existsSync(`${srcPath}/${file}`) && file != 'installation.json' && file != 'adminConfig.json' && file == 'agency.txt'){
                            fse.copyFile(`${srcPath}/${file}`, `${destPath}/${file}`);// agency.txt file should be copy to configuation folder
                        }
                    });
                } else {
                    fse.copySync(srcPath, destPath);
                }
            }
        });
        this.logger.info('== End copyDataForV120()');
    }


    updateZluxServerConfig() {
        this.logger.info('== Begin updateZluxServerConfig()');
        const configPath = '/instance/ZLUX/serverConfig/zluxserver.json';
        const destPath = path.resolve(`${this.deployPath}${configPath}`);
        const srcPath = path.resolve(`${this.upgradePath}${configPath}`);
        let destData = {};
        try {
            this.logger.info('== Start to read origin zluxserver.json');
            destData = jsonUtils.parseJSONWithComments(destPath);
            this.logger.info('== End to read origin zluxserver.json');
        }
        catch(err) {
            this.logger.severe(`read origin zluxserver.json failed: ${JSON.stringify(err)}`);
        }
        this.logger.info('== Start to read migrate zluxserver.json');
        let srcData =  jsonUtils.parseJSONWithComments(srcPath);
            srcData = this.reparse(srcData);
        this.logger.info('== End to read migrate zluxserver.json');

        this.fixZluxserverConfig(srcData);
        destData = Object.assign(destData, srcData);
        this.logger.info('== Start to write zluxserver.json...');
        fs.writeFileSync(destPath, JSON.stringify(destData,null, 2), { mode: 0o770 });
        this.logger.info('== End updateZluxServerConfig()');
        return this.getUpdatedServerUrl(destData);
    }

    fixZluxserverConfig(preData) {
        const oldVersion = this.getVersion();       // 1.2.0: false; else version: version number
        // v1.2.0: no auth defaults to use default group
        // v1.2.1: no auth can use default group and customized groups, the default value is to use customized groups
        // v1.2.0 - v1.2.1, if no auth, need change onlyDefaultGroupMode to true
        // The fix only for v1.2.0 to v1.2.1
        // v1.2.1 and after version will has version number, and no need to do the change for [onlyDefaultGroupMode]
        let authObj = preData && preData.dataserviceAuthentication;
        if (!oldVersion && authObj && authObj.isAnonymousAccessAllowed) {
            authObj.onlyDefaultGroupMode = true;
        }

        // JSTE-5129: fix path '\' to '/' for 1.2.0
        const fixPath = (filePath) => filePath.replace(/\\/g, "/");
        let https = preData && preData.node && preData.node.https;
        if (!oldVersion && https) {
            if (https.pfx) {
                https.pfx = fixPath(https.pfx);
            }

            if (https.keys) {
                https.keys.forEach((key, idx) => https.keys[idx] = fixPath(key));
            }

            if (https.certificates) {
                https.certificates.forEach((certificate, idx) => https.certificates[idx] = fixPath(certificate));
            }
        }

        // handle new added okta mfa from 1.2.2
        let mfaAuth = authObj && authObj.twoFactorAuthentication;
        if (mfaAuth && !mfaAuth.okta) {
            mfaAuth.okta = {
                config: {
                    org_url: '',
                    client_id: '',
                    client_secret: '',
                    loginCallback: ''
                }
            };
        }
    }

    getVersion() {
        return this.getVersionByPath(this.upgradePath);
    }
    getCurrentVersion() {
        return this.getVersionByPath(this.deployPath);
    }
    getVersionByPath(path) {
        const versionPath = `${path}/product/ZLUX/pluginStorage/com.rs.bzshared/_internal/services/version/version.json`;
        if (fs.existsSync(versionPath)) {
            const data = fse.readJSONSync(versionPath);
            return data && data.pluginVersion;
        }
        return false;
    }
    getUpdatedServerUrl(configData) {
        const node = configData && configData.node;
        if (node) {
            this.protocol = node.https ? 'https' : 'http';
            this.port = node.https ? node.https.port : node.http.port;   
        }
        return `${this.protocol}://${this.host}:${this.port}/${BZADMIN}`;
    }

    async handleDataAfterV120(req, res) {
        this.logger.info('== Begin handleDataAfterV120()');
        const copyDirs = [
            '/instance/groups',
            '/instance/users',
            '/instance/ZLUX/pluginStorage/com.rs.bzadm/sessionSettings'
         ];

        const copy_db_store = {
            paths:[
                '/instance/ZLUX/pluginStorage/com.rs.bzshared/_db_store',
            ],
            limit : ['_metadata', '_extend']  //exclude _metadata
        }
        ///  JSTE-14315
        ///  fse.copySync have error {"errno":-4048,"syscall":"stat","code":"EPERM} when copy to a opening stream files.
        ///  so skip such log files
        const copy_wc_history = {
            paths:[
                '/instance/ZLUX/pluginStorage/com.rs.bzadm/history',
            ],
            limit : ['error.log','import.log','warn.log']  //exclude _metadata
        }
        // only copy  ['.key', '.cert', '.cer', '.pfx'] files
        const copyAuthFiles = {
            paths: [
                '/instance/ZLUX/serverConfig/',      // for deploy
                '/product/ZLUX/serverConfig/'       // for sso
            ],
            limit : ['.key', '.cert', '.cer', '.pfx', '.pem']
        };
        const copyAndUpdateConfigs = [
            '/instance/ZLUX/pluginStorage/com.rs.ldapAuth/_internal/plugin',
            '/instance/ZLUX/pluginStorage/com.rs.mssqlAuth/_internal/plugin',
            '/instance/ZLUX/pluginStorage/com.rs.ssoAuth/_internal/plugin',
            '/instance/ZLUX/pluginStorage/com.rs.bzw/configurations',
            '/instance/ZLUX/pluginStorage/com.rs.bzadm/configurations'
         
        ];

        return new Promise(async (resolve, reject) => {
            try {
                this.logger.info('== Start to copy data...');
                this.copyDataForV120(copyDirs);
                this.copyDataForV120(copy_db_store.paths,true,copy_db_store.limit);
                this.copyDataForV120(copyAuthFiles.paths, false, copyAuthFiles.limit);
                this.copyDataForV120(copyAndUpdateConfigs, true);
                this.copyDataForV120(copy_wc_history.paths,false,copy_wc_history.limit);
                this.copyMetaConfig();
        
                this.logger.info(`start to upgrade server logging.`);
                await this.upgradeServerLogging();
                this.logger.info(`end to upgrade server logging.`);
        
                this.logger.info(`start to upgrade admin config.`);
                await this.upgradeAdminConfig();
                this.logger.info(`end to upgrade admin config.`);
        
                this.logger.info(`start to upgrade security header.`);
                await this.upgradeSecurityHeader();
                this.logger.info(`end to upgrade security header`);
        
                this.logger.info(`start to upgrade nodejs config.`);
                await this.upgradeNodeConfigPath();
                this.logger.info(`end to upgrade nodejs config.`);

                //start upgrade to 10.1.1
                //await this.upgradeTo10_1_1.upgrade('after120'); // conver keyboard mappings
                
                this.logger.info('== Start to update zluxserver.json');
                const updatedUrl = this.updateZluxServerConfig();
                resolve({
                    status: true, 
                    message: 'Update data success',
                    needRestart: true,
                    updatedUrl: updatedUrl,
                    handleParse:'handleDataAfterV120'
                });
            }
            catch(err) {
                this.logger.severe(`Upgrade data failed: ${JSON.stringify(err)}`);
                resolve({status: false, message: `Upgrade data failed: ${JSON.stringify(err)}`});
            }
        });
    }

     async copyMetaConfig() {
        try {
            const filePath = path.join(this.upgradePath, DB_STORE_PATH, '_metadata/config/config.json');
            const content = fs.existsSync(filePath) ? fse.readFileSync(filePath) : null;

            if(content) {
                await bzdb.updateOrInsert('meta_config', JSON.parse(String(content))) // update meta_config
            }

        } catch(err) {
            this.logger.info(`Update meta_config failed: ${JSON.stringify(err.message)}`);
        }

    }

        
    async upgradeServerLogging() {
        // copy file from instance
        const loggingPath = path.join(this.upgradePath, SERVER_CONFIG_PATH, 'logging.json');

        if(fse.existsSync(loggingPath)) {
            try {
                const data = jsonUtils.parseJSONWithComments(loggingPath);
                const result = await bzdb.updateOrInsert('serverLogging', data);
    
                if(!result.status) {
                    this.logger.severe(`failed to insert serverLogging, ${result.message}`);
                }
            } catch(err) {
                this.logger.severe(`failed to insert serverLogging, ${err}`);
            }
           
        } else {
            this.logger.info(`no serverLogging need to be insert`);
        }
    }

    async upgradeAdminConfig() {
        const adminConfigPath = path.join(this.upgradePath, '/instance/ZLUX/pluginStorage/com.rs.bzadm/configurations', 'adminConfig.json');
        
        if(fse.existsSync(adminConfigPath)) {
            try {
                const data = jsonUtils.parseJSONWithComments(adminConfigPath);

                if(!data.node || !data.node.sessionTimeoutMs) {
                    const configPath = '/instance/ZLUX/serverConfig/zluxserver.json';
                    const zluxserverPath = path.resolve(`${this.upgradePath}${configPath}`);

                    const config = jsonUtils.parseJSONWithComments(zluxserverPath);

                    if(data.node == null) {
                        data.node = {};
                    }

                    if(config.node?.session?.cookie?.timeoutMS) {
                        data.node.sessionTimeoutMs = config.node.session.cookie.timeoutMS;
                    } else {
                        data.node.sessionTimeoutMs = 60 * 60 * 1000
                    }
                }

                const curData = await bzdb.select('adminConfig');
                const adminConfigs = curData.data[0] || {};
                const updateDate = Object.assign(adminConfigs, data);

                const result = await bzdb.updateOrInsert('adminConfig', updateDate);
        
                if(!result.status) {
                    this.logger.severe(`failed to insert adminConfig, ${result.message}`);
                }
            } catch(err) {
                this.logger.severe(`failed to insert adminConfig, ${err}`);
            }
           
        } else {
            this.logger.info(`no adminConfig need to be insert`);
        }
    }

    async upgradeSecurityHeader() {
        const securityHeadPath = path.join(this.upgradePath, SERVER_CONFIG_PATH, 'securityHeader.json');
        
        if(fse.existsSync(securityHeadPath)) {
            try {
                const data = jsonUtils.parseJSONWithComments(securityHeadPath);
                const result = await bzdb.updateOrInsert('securityHeader', data);
        
                if(!result.status) {
                    this.logger.severe(`failed to insert securityHeader, ${result.message}`);
                }
            } catch(err) {
                this.logger.severe(`failed to insert securityHeader, ${err}`);
            }
           
        } else {
            this.logger.info(`no securityHead need to be insert`);
        }
    }

    async upgradeNodeConfigPath() {
        const nodeConfigPath = path.join(this.upgradePath, SERVER_CONFIG_PATH, 'nodejsConfig.json');

        if(fse.existsSync(nodeConfigPath)) {
            try {
                const data = jsonUtils.parseJSONWithComments(nodeConfigPath);
                const result = await bzdb.updateOrInsert('nodejsConfig', data);
    
                if(!result.status) {
                    this.logger.severe(`failed to insert nodejsConfig, ${result.message}`);
                }
            } catch(err) {
                this.logger.severe(`failed to insert nodejsConfig, ${err}`);
            }
            
        } else {
            this.logger.info(`no nodejsConfig need to be insert`);
        }
    }
    
    async cleanUpCurrentData() {
        try {
            this.logger.info('== Begin cleanUpCurrentData()');
            const cleanPath = `${this.deployPath}/instance/ZLUX/pluginStorage/com.rs.bzshared/_db_store`;
            if(fs.existsSync(cleanPath)) {
                fs.readdirSync(cleanPath)
                .forEach(folder => {
                    const folderPath = `${cleanPath}/${folder}`;
                    if (fs.existsSync(folderPath) && folder !== '_metadata' && folder !== '_extend') {
                        fs.readdirSync(folderPath).forEach(file => {
                            const filePath = `${folderPath}/${file}`;
                            this.logger.info(`== Begin unlink file ${filePath}`);
                            if (fs.existsSync(filePath)) {
                                if(fs.statSync(filePath).isFile()){ //remove file
                                    fs.unlinkSync(filePath);
                                }else{ //remove folder
                                    fse.removeSync(filePath)
                                }
                                
                               
                            }
                            this.logger.info(`== End unlink file ${filePath}`);
                        });
                    }
                });
                
                // fs.renameSync(cleanPath, `${cleanPath}-${new Date().getTime()}`);
            }
            await this.refreshBzdb(); // Refresh bzdb data entities
            this.logger.info('== End cleanUpCurrentData()');
        }
        catch(err) {
            this.logger.severe('clean up data failed : ' + err);
            throw err;
        }
    }

    /**
     * Refresh bzdb data entities
     */
    async refreshBzdb() {
        try {
            const bzdbInstance = await bzdb.getBZDBInstance();
            const metaData = bzdbInstance.metadata && bzdbInstance.metadata._metadata;
            if (metaData) {
                const data = metaData.dataEntities || [];
                if (data && data.length !== 0) {
                    const entities = Object.keys(data).map(d => data[d].name);
                    for (const e of entities) {
                        await bzdb.refreshDataEntity(e);
                    }
                    this.logger.info(`Refresh bzdb entities successed`);
                }
            } else {
                this.logger.info(`No need to refresh bzdb entities.`);
            }
        } catch (error) {
            this.logger.severe(`Refresh bzdb entities failed: ${error.message}`);
        }
    }

    /**
     * get upgrade data
     * 1. get private data
     * 2. get public data
     * @param req - request
     * @param res - response
     * @returns {promise}
     */
    async doUpgrade(req, res) {        
        this.logger.info('== Start to upgrade...');

        /*
        // BZ-19202, move the check to upgrade-controller.js
        const inClusterMode=await this.isInClusterMode();
        this.logger.info('inClusterMode:'+inClusterMode);
        if(inClusterMode){
            return {
                status:false,
                message:'Failed to upgrade data: Could not do upgradation in cluster mode.',
                type:'cluserMode'
            }
        }
        */
        //backup need files
        this.backFile();
        // clean up current data then handle upgrade data
        await this.cleanUpCurrentData();
        let result, before1011 = false;
        const oldVersion = this.getVersion();
        this.logger.info('migration package version:'+oldVersion);
        if (!this.needRestart) {
            result= await this.handleDataBeforeV120(req, res);
        } else {
            result= await this.handleDataAfterV120(req, res);
            if (!this.isBzw2hMode() && this.hasExtend()) {
                this.handleExtend();
            }
        }
        if(!result.status){
            return result;
        }
        this.logger.info('finished data copy and merge, next process - schema upgrade');
        // after finished above steps,  now we are at the 10.1.0 data structure
        //start upgrade from 10.1.0  to 10.1.1
        if(result.status && (!oldVersion || this.compareVer('10.1.1',oldVersion))){
            before1011 = true;
            const result10_1_1=await this.upgradeTo10_1_1.doUpgrade(result.handleParse, this.upgradePath); 
            result=Object.assign(result,result10_1_1);
        }
        //start upgrade from 10.1.1  to 10.1.2
        // 1. remove the private session settings if there is no change compared with the default template. 
        // 2. migrate the sessiong setting location from BZA to BZDB, after migrated, delete them from the 
        // 3. unified the private session setting ID format like '{userId}+{ÿ}+{sessionId}+"_preferences"', meanwhile,  {sessionId} is {sessionId}+{timestamp}
        if(result.status && (!oldVersion || this.compareVer('10.1.2',oldVersion))){
            await this.refreshBzdb(); // Refresh bzdb data entities
            const result10_1_2=await this.upgradeTo10_1_2.doUpgrade(result.handleParse, this.upgradePath,oldVersion); 
            result=Object.assign(result,result10_1_2);
        }

        if(result.status && (!oldVersion || this.compareVer('10.1.3',oldVersion))){
            const result10_1_3=await this.upgradeTo10_1_3.doUpgrade(result.handleParse, this.upgradePath,oldVersion, before1011); 
            result=Object.assign(result,result10_1_3);
        }
        // all the 10.1.4 version will run into
        if(result.status && (!oldVersion || this.compareVer('10.1.4',oldVersion))){
            await this.refreshBzdb(); // Refresh bzdb data entities
            const result10_1_4=await this.upgradeTo10_1_4.doUpgrade(this.upgradePath); 
            result=Object.assign(result,result10_1_4);
        }

        if(result.status && (!oldVersion || this.compareVer('10.1.5.2',oldVersion))){
            await this.refreshBzdb(); // Refresh bzdb data entities
            const result10_1_5=await this.upgradeTo10_1_5.doUpgrade(this.upgradePath); 
            result=Object.assign(result,result10_1_5);
        }

        if(result.status && (!oldVersion || this.compareVer('10.2.0',oldVersion))){
            await this.refreshBzdb();
            const result10_2_0=await this.upgradeTo10_2_0.doUpgrade(this.upgradePath); 
            result=Object.assign(result,result10_2_0);
        }

        if(result.status && (!oldVersion || this.compareVer('10.2.1',oldVersion))){
            await this.refreshBzdb();
            const result10_2_1=await this.upgradeTo10_2_1.doUpgrade(this.upgradePath); 
            result=Object.assign(result,result10_2_1);
        }
        // check whether need to recreate service(pm2 or windows service)
        if(result.status){ 
            this.logger.info(`start do upgrade - Node js configuration change check.`);
            const nodeCheckResult = await this.checkNodeJsConfig(); 
            result = Object.assign(result,nodeCheckResult);
        }

        if(result.status) {
            await autoScalingService.overwriteAutoScalingData(bzdb); // overwrite configurations in auto scaling folder
        }

        // remove the backup 
        this.removeBack();

        return result;
    }


    async isInClusterMode(){
        const metaNode = await bzdb.select('meta_peers');
        if(metaNode.data.length > 1) {
           return true;
        } else {
           return false;
        }
    }
    /**
     * check if upgrade folder exists
     */
    async isExistUpgradData(req) {
        let existed = fs.existsSync(this.upgradePath);
        if(!existed){// fixes for JSTE-17572, upgradePath is updated, re-check the migrate folder if exist.
            let migratePath = path.join(path.dirname(this.deployPath), 'migrate');
            if(existed = fs.existsSync(migratePath)){
                this.upgradePath = migratePath;
            }
        }
        const upgradedInfo = await this.hasUpgrade();
        if (existed) {
            this.getHostProtocol();
            this.getHost(req);
            this.getPort();
            this.fixUpgradePath();
            this.needRestart = this.hasDBStore() || this.context.plugin.server.config.user.bzw2hMode;
        }
        return {exist: existed, upgrade: upgradedInfo.hasUpgrade, upgradeDate: upgradedInfo.upgradeDate};
    }
    
    /*
    ver1 is new version, ver2 is oldVersion
    ver1 > ver2: true
    ver1 <= ver2: false
    ver1 or ver2 is NULL: false
    */
    compareVer(ver1, ver2)
    {
        if(ver1 && ver2) {
            let newVersion = ver1.split('.');
            let oldVersion = ver2.split('.');
            let minLen = Math.min(newVersion.length, oldVersion.length);
            let index = 0;
            while( index < minLen ) {
                if(oldVersion[index].includes('-') && newVersion.length > minLen){
                    oldVersion[index] = oldVersion[index].replace('-','.');
                    if(parseFloat(newVersion[index] + "." + newVersion[index +1]) > parseFloat(oldVersion[index])){
                        return true;
                    }else{
                        return false;
                    } 
                }
                if(parseInt(newVersion[index]) > parseInt(oldVersion[index])){
                    return true;
                }else if(parseInt(newVersion[index]) == parseInt(oldVersion[index])){
                    index++;
                }else{
                    return false;
                } 
            }
            if(index >= minLen) return false;//same version
        }
        return false;
    }
  
    /**
     * check if upgrade folder exists
     */
    getWCdata(dirkey,keepfilext = false) {
        var uncompress_folder = this.instanceDir+"/ZLUX/pluginStorage/com.rs.bzadm/temp/";
        var fileLocMap = new Map();
            fileLocMap.set("atm",uncompress_folder+"profile/atm");
            fileLocMap.set("clk",uncompress_folder+"profile/clk");
            fileLocMap.set("clm",uncompress_folder+"profile/clm");
            fileLocMap.set("hsp",uncompress_folder+"profile/hsp");
            fileLocMap.set("keymap",uncompress_folder+"profile/keymap");
            fileLocMap.set("user",uncompress_folder+"profile/users");
            fileLocMap.set("admin_ses",uncompress_folder+"cfgdir/ses");
            fileLocMap.set("admin_atm",uncompress_folder+"cfgdir/atm");
            fileLocMap.set("admin_clm",uncompress_folder+"cfgdir/clm");
            fileLocMap.set("admin_hsp",uncompress_folder+"cfgdir/hsp");
            fileLocMap.set("admin_keymap",uncompress_folder+"cfgdir/keymap");
            fileLocMap.set("group",uncompress_folder+"cfgdir/ini");
            
         var path=fileLocMap.get(dirkey);
         var dir = path;
        
        var dirPath = dir.replace('\\','/');
        if(!fs.existsSync(dirPath)) return "{}";
        var ut = this.utiles;
        var bodyString = "{}";
        return new Promise((resolve, reject) => {
            var path="";
            ut.readAllMap(dirPath,keepfilext,function(data){
            
                if(data!=null && (data.length>0||data.size>0))
                {
                    
                    bodyString = ut.toJsonString(data);
                   
                   
                }
                Promise.all(bodyString || []).then(response => {
               
                    resolve(bodyString);
                }, err => {
                    
                    resolve(bodyString);
                });
            });
            
            
        });
       
    }

    /**
     * check if the version is after 1.2.0
     * (has \instance\ZLUX\pluginStorage\com.rs.bzshared\_db_store )
     */
    hasDBStore() {
        return fs.existsSync(this.upgradePath + DB_STORE_PATH);
    }

    async getServerSettingsContent() {
        // serverSettings.json is moved to db_store
        const dbEntityName = 'configurations';
        const fileName = 'serverSettings.json';
        let fileData = await bzdb.select(dbEntityName, { fileName: fileName });
        if (fileData && Array.isArray(fileData.data) && fileData.data.length === 1) {
            return fileData.data[0];
        } else {
            return null;
        }
    }

    async hasUpgrade() {
        const data = await this.getServerSettingsContent();

        return {
            hasUpgrade: data && data.hasUpgrade || false,
            upgradeDate: data && data.upgradeDate || ''
        };
    }

    async setUpgradeStatus() {
        try {
            // serverSettings.json is moved to db_store
            const dbEntityName = 'configurations';
            const fileName = 'serverSettings.json';
            let data =  await this.getServerSettingsContent();
            data = data ? data : {};
            data.hasUpgrade = true;
            const now = new Date();
            const year = now.getFullYear();
            const month = (now.getMonth() + 1).toString().padStart(2, '0');
            const date = now.getDate().toString().padStart(2, '0');
            data.upgradeDate = `${month}/${date}/${year}`;
            const result = await bzdb.insert(dbEntityName, {data: data, fileName: fileName});
            if (result && result.status) {
                this.logger.info('set upgrade status successfully');
            } else {
                this.logger.severe('set upgrade status error : ' + result);
            }
        }
        catch (e) {
            this.logger.severe('set upgrade status error : ' + e);
        }
    }

    // the _extend entities is introduced from 10.1.2 
    hasExtend() {
        const path = `${this.upgradePath}${DB_STORE_PATH}/_extend`;
        return fs.existsSync(path);
    }

    // save old server map into _metadata_upgrade
    async handleExtend() {
        const metaPath = `${this.upgradePath}${DB_STORE_PATH}/_metadata`;
        const peersPath = `${metaPath}/peers`;
        let data = [];
        if (fs.existsSync(peersPath)) {
            fs.readdirSync(peersPath).forEach(file => {
                const item = JSON.parse(fs.readFileSync(`${peersPath}/${file}`, 'utf8')); 
                if (item.localIp) {
                    const truncIp = connUtils.truncLocalIp(item.localIp);
                    data.push({ip: truncIp, serverURL: item.serverURL})
                }
            });
        }

        if (data.length > 0) {
            const entity = connUtils.getUpgradeMetaEntity();
            await bzdb.bulkLoad(entity, data);
        }
    }

    isBzw2hMode() {
        return this.context.plugin.server.config.user.bzw2hMode;
    }

    reparse(jsonObj){
        let parsed = jsonObj;
        try {
          //const https = jsonObj?.node?.https;  //does not support by Nodejs 12
          const https = (jsonObj && jsonObj.node && jsonObj.node.https)?jsonObj.node.https:undefined;
          if(https) {
            let jsonString = JSON.stringify(https).replace(/\\\\/g,"/");
            parsed.node.https = JSON.parse(jsonString);
          }
        } catch (error) {
          return parsed;
        }
        return parsed;
    }

    backFile(){
        const paths= [{
            path:'/instance/ZLUX/serverConfig',
            fileName:'nodejsConfig.json'
        }]
        paths.forEach(path => {
            const oldFile = `${this.deployPath}${path.path}/${path.fileName}`;
            const newFilePath =`${this.backupPath}${path.path}`;
            const newFile = `${newFilePath}/${path.fileName}`;
            if (fse.existsSync(oldFile)) {
                if(!fse.existsSync(newFilePath)){
                    fse.mkdirSync(newFilePath,{recursive:true})
                }
                // fse.renameSync(oldFile,newFile) //cross-device link not permitted when using rename
                fse.copyFile(oldFile, newFile, (err) => {
                    if (err) {
                        this.logger.severe('failed to copy nodejsConfig to target folder error : ' + error);
                        throw err;
                    }
                    fs.unlink(oldFile, (err) => {
                      if (err) {
                        this.logger.severe('failed to delete nodejsConfig from source folder error : ' + error);
                        throw err;
                      }
                      this.logger.info(`move nodejsConfig to new position`)
                    });
                });
            } 
        });
    }
    removeBack(){
       try {
        if(fse.existsSync(this.backupPath)){
            fse.rmSync(this.backupPath,{recursive:true,force: true})
        }
       } catch (error) {
        this.logger.severe('remove backup folder error : ' + error);
        throw error
       }
    }    
    async checkNodeJsConfig(){
        const NODEJSCONFIG_PATH  = '/instance/ZLUX/serverConfig/nodejsConfig.json';
        const migPath=path.join(this.upgradePath,NODEJSCONFIG_PATH)  //nodejsConfig.json
        const deployPath=path.join(this.backupPath,NODEJSCONFIG_PATH)  //nodejsConfig.json
        if(fse.existsSync(migPath)){
            if(fse.existsSync(deployPath)){
                const migPathContent=await this.utiles.readFilePromise(migPath)
                const deployPathContent=await this.utiles.readFilePromise(deployPath)
                if(!this.utiles.isSameObj(migPathContent,deployPathContent)){
                    this.logger.info(`nodejsConfig is not same between running and migrate`)
                    return {status:true,needReCreateService:true}
                }else{
                    this.logger.info(`nodejsConfig are same between running and migrate`)
                    return {status:true}
                }
            }else{
                this.logger.info(`nodejsConfig exist in migrate folder but does not exist in running package`)
                return {status:true,needReCreateService:true}
            }
        }else{
            this.logger.info(`nodejsConfig does not exist in migrate folder`)
            return {status:true}
        }
    }
}

module.exports = UpgradeDataService;
