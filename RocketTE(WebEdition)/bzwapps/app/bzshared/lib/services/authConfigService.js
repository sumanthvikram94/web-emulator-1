'use strict';

/**
 * Name:      authConfigService.js
 * Copyright: © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */
const path = require('path');
const encryption = require('./encryption.service');
const bzdb = require('./bzdb.service');
const constants = require('./constants.service');
const zoweService = require('./zowe.service');
const jsonUtils = zoweService.jsonUtils;
const deployDirectory = {
    instanceZluxPath: "deploy/instance/ZLUX",
    productZluxPath: "deploy/product/ZLUX",
    pluginStorageFolder: "pluginStorage",
    pluginFolder: "plugins",
    serverConfigFolder: "serverConfig",
}
const BASE_PATH = path.join(process.cwd(), '../');
const ZLUX_PATH = "/zluxserver.json";
const DATASOURCE_PATH = '/configurations/dataSourceSetting.json';
const defaultDataSource = { "defaultDataSource": 'fallback' };
const COOKIE_TIMEOUT = 5*60000 //5 MIN
const ATTR_COOKIE_TIMEOUT = 7*24*60*60*1000 //7d
const SSO_ATTR_COOKIES_NAME = 'rte.cluster.sso.attr' 
const SSO_AUTH_COOKIES_NAME = 'rte.cluster.sso.auth' 
const LDAP_CONFIG_COOKIES_NAME = 'rte.cluster.ldap.attr' 
const SSO_ATTR_COOKIE_CAPACITY = 2048
const LDAP_ATTR_COOKIE_CAPACITY = 3072
class authConfigService {

    constructor() {
        this.dataSourceConfig;
        this.zluxServerConfig;
        this.anthenticationConfig;
        this.authConfig;
        this.ldapConfig = [];
        this.intMatchedGroups = {};
        // this.ssoConfig;
        this._ssoAssert = '';
        this.isAllowDefaultGroup = false;
        this.initPromise=this.getAuthObj();
    }

    async init(context) {
        return this.initPromise;
    }

    getAuthObj(){
        return new Promise((resolve, reject) => {
            this.getFileContent("datasource").then((obj) => {  //datasouce
                this.dataSourceConfig = obj.dataserviceDataSource || defaultDataSource;
                if (this.dataSourceConfig.defaultDataSource === "mssql") {
                    this.dataSourceConfig.dataSourcePrivilege = this.getdataSourcerivilge(this.dataSourceConfig);
                }
                if (this.dataSourceConfig.defaultDataSource === "ldap" || this.dataSourceConfig.defaultDataSource === "mssql") {
                    this.dataSourceConfig.implementationDefaults = encryption.decryptAuthObj(this.dataSourceConfig.implementationDefaults, this.dataSourceConfig.defaultDataSource);
                }
                if(global.zoweServerConfig){ //zluxServerConfig 
                    this.zluxServerConfig = global.zoweServerConfig.zluxServerConfig;
                    this.authConfig = this.zluxServerConfig.dataserviceAuthentication;  //auth type
                    this.isAllowDefaultGroup = this.allowDefaultGroup();
                    this.getAuthenticationConfig(this.authConfig.defaultAuthentication).then((authDetailObj)=>{  //auth detail
                        if(authDetailObj){
                            this.anthenticationConfig=authDetailObj;
                        }
                        resolve(this);
                    })  
                }else{
                    reject(' errors when get ZLUX configuration');
                }
            });
        });
    }

    // printContext() {
    //     this.logger.info(JSON.stringify(this.context));
    // }

    getBZDBEntity(type){
        let dbEntity={entityName:'',filter:''}
        if (type === 'zlux' || type === 'server') {
            dbEntity.entityName='zlux' 
            dbEntity.filter={fileName:'zluxserver.json'};   
        }else if(type === 'auth'){
            dbEntity.entityName='authConfig'
            dbEntity.filter=constants.metaDataBackupPath.auth
        }
        else if(type === 'ldap'){
            dbEntity.entityName='authConfig'
            dbEntity.filter=constants.metaDataBackupPath.ldap
        }else if(type === 'mssql'){
            dbEntity.entityName='authConfig'
            dbEntity.filter=constants.metaDataBackupPath.mssql
        }else if(type === 'sso'){
            dbEntity.entityName='authConfig'
            dbEntity.filter=constants.metaDataBackupPath.sso
        }else if(type === 'datasource'){
            dbEntity.entityName='configurations'
            dbEntity.filter=constants.metaDataBackupPath.datasource
        }else if(type === 'config'){
            dbEntity.entityName='configurations'
            dbEntity.filter=constants.metaDataBackupPath.config
        }else{
            return null;
        }
        return dbEntity;
    }

    async getFileContent(type) {
        let jsonData = {};
        if (type && ['ldap', 'mssql', 'sso', 'auth', 'datasource'].includes(type)) {
            let dbEntity =this.getBZDBEntity(type);
            let result
            if (dbEntity) {
                await bzdb.waitLoadReady(); // on zowe, this could be before BZDB load ready. So wait till ready before select.
                result = await bzdb.select(dbEntity.entityName, dbEntity.filter)
            }
            if (result.data && Array.isArray(result.data) && result.data.length > 0) {
                jsonData = result.data[0];
            }
        } else if (type === 'zlux') {
            const fileName = this.getFileName('zlux');
            jsonData = jsonUtils.parseJSONWithComments(fileName);
        }
        return jsonData;
    }

    getFileName(type) {
        if (type === 'zlux') {
            return path.join(BASE_PATH, deployDirectory.instanceZluxPath, deployDirectory.serverConfigFolder, ZLUX_PATH)
        }
        else if (type === 'datasource') {
            const plugin = "com.rs.bzadm"
            return path.join(BASE_PATH, deployDirectory.instanceZluxPath, deployDirectory.pluginStorageFolder, plugin, DATASOURCE_PATH)
        }
    }

    getdataSourcerivilge(dataSourceConfig) {
        let privilege = [];
        if (this.dataSourceConfig.defaultDataSource === "mssql") {
            privilege[0] = dataSourceConfig.implementationDefaults.allowManageData ? 1 : 0; //management   
            privilege[1] = !!dataSourceConfig.implementationDefaults.userPasswordField ? 1 : 0; //password
        }

        return privilege;
    }

    getImportPasswordEncryption() {
        return this.zluxServerConfig.importPasswordEncoding || '';
    }

    allowDefaultGroup() {
        return this.zluxServerConfig.dataserviceAuthentication.onlyDefaultGroupMode;
    }

    async getAuthenticationConfig(authType) {
        let authenticationConfig;
        if(['sso',"ldap","mssql"].includes(authType)){
            authenticationConfig=await this.getFileContent(authType);
            if (authType === "ldap" || authType === "mssql") {
                authenticationConfig = encryption.decryptAuthObj(authenticationConfig, authType);
            }
        }else{
            authenticationConfig=null
        }
        return authenticationConfig;
    }

    setLdapConfig(req,res,config) {
        res.clearCookie(LDAP_CONFIG_COOKIES_NAME);
        if(config.length > LDAP_ATTR_COOKIE_CAPACITY){
            return config.length
        }else{
            const ldapAttr = encryption.encryptWithConstSalt(config);
            if(ldapAttr.length > 0){
                res.cookie(LDAP_CONFIG_COOKIES_NAME, ldapAttr, { httpOnly: true, sameSite:'lax', maxAge: ATTR_COOKIE_TIMEOUT,  secure: req.protocol === 'https' })
                return 0;
            }
            return 1
        }
    }

    getLdapConfig(cookieHeader) {
        return this.getCookies(cookieHeader, LDAP_CONFIG_COOKIES_NAME);
    }

    setSsoAttrs(req, res, config, userId) {
        res.clearCookie(SSO_ATTR_COOKIES_NAME);
        if(!!config && JSON.stringify(config).length > SSO_ATTR_COOKIE_CAPACITY){
            return {len: config.length}
        }else{
            const ssoAttr = encryption.encryptWithConstSalt(JSON.stringify({userId,attr: config}));
            if(ssoAttr.length > 0 && ssoAttr.length < SSO_ATTR_COOKIE_CAPACITY){
                res.cookie(SSO_ATTR_COOKIES_NAME, ssoAttr, { httpOnly: true, sameSite:'lax', maxAge: ATTR_COOKIE_TIMEOUT,  secure: req.protocol === 'https' })
                return {len: 0, attr: ssoAttr}
            }
            return {len: 1}
        }
    }

    getSsoAttrs(cookieHeader) {
        return this.getCookies(cookieHeader,SSO_ATTR_COOKIES_NAME)
    }

    clearSsoAttrs(res){
        res.clearCookie(SSO_ATTR_COOKIES_NAME);
    }

    
    setSsoAssert(req, res,data) {
        res.cookie(SSO_AUTH_COOKIES_NAME, data, { httpOnly: true, sameSite:'lax', maxAge: COOKIE_TIMEOUT,  secure: req.protocol === 'https' })
    }

    getSsoAssert(cookieHeader) {
        return this.getCookies(cookieHeader,SSO_AUTH_COOKIES_NAME)
    }

    clearSsoAssert(res){
        res.clearCookie(SSO_AUTH_COOKIES_NAME);
    }

    getIntMatchedGroup(userId) {
        if(userId != null) {
            return this.intMatchedGroups[userId];
        }

        return this.intMatchedGroups;
       
    }

    getCookies(cookieHeader, cookieName){
        let result ;
        cookieHeader?.split(`;`).forEach(cookie => {
            let [ name, ...rest] = cookie.split(`=`);
            name = name?.trim()
            if(name === cookieName){
                const value = rest.join(`=`).trim();
                if(value){
                    result = decodeURIComponent(value)
                    return
                }
            }
        });
        return result
    }
}

const authConfig = new authConfigService();
module.exports = authConfig;


