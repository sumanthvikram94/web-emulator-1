'use strict';

/**
 * Name:      setting-controller.js
 * Desc:      Provide api to return the sessionMode related configurations
 * Copyright: © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */

const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
// const request = require('request');
const path = require('path');
const fileUpload = require('express-fileupload');
const zoweService = require('../../../../bzshared/lib/services/zowe.service');
const jsonUtils = zoweService.jsonUtils;
const authConfigService=require("../../../../bzshared/lib/services/authConfigService")
const mssqlHelper = zoweService.mssqlHelper;
const ldapHelper = zoweService.ldapHelper;
const ServerRuntimeService = require('../../../../bzshared/lib/services/server-runtime.service');
const ConfigDataService = require('../../../../bzshared/lib/services/config-data.service');
const oAuth = require('../../../../bzshared/lib/services/oauth.service');
const encryption = require('../../../../bzshared/lib/services/encryption.service');
const bzdb = require('../../../../bzshared/lib/services/bzdb.service');
// const constants = require('../../../../bzshared/lib/services/constants.service');
// const encryptor = require('../../../../../lib/zlux/zlux-proxy-server/js/encryption.js');
// const util = require('util');
const Security = require('../../../../bzshared/lib/services/security.service');
const autoScalingService = require('../../../../bzshared/lib/services/auto-scaling.service');

const constants = require('../../../../bzshared/lib/services/constants.service');
const w2h_const = require('../../../../bzshared/lib/model/w2h-const');
const Bzw2hUtils = require('../../services/bzw2h-utils');
const Bzw2hConfigService = require('../../services/bzw2h-config.service');
const reportSrc = require('../../../../bzshared/lib/apis/user-report/user-report-service');
const deployDirectory = {
    instanceZluxPath: "deploy/instance/ZLUX",
    productZluxPath: "deploy/product/ZLUX",
    pluginStorageFolder: "pluginStorage",
    pluginFolder: "plugins",
    serverConfigFolder: "serverConfig",
}
const BASE_PATH = path.join(process.cwd(), '../');
const ZLUX_PATH = "/zluxserver.json";
const LDAP_NAME = 'com.rs.ldapAuth';
const SSO_NAME = 'com.rs.ssoAuth';
const OAUTH_NAME = 'com.rs.oauthAuth';
const BZADMIN_NAME = 'com.rs.bzadm';
// const BZWEB_NAME = 'com.rs.bzw';
const BZW2H_NAME = 'com.rs.bzw2h';
const MSSQL_NAME = 'com.rs.mssqlAuth';
const LDAP_PATH = '/_internal/plugin/ldapServerConfig.json';
const MSSQL_PATH = '/_internal/plugin/msSQLServerConfig.json';
const SSO_PATH = '/_internal/plugin/ssoServerConfig.json';
const OAUTH_PATH = '/_internal/plugin/oauthServerConfig.json';
const DATASOURCE_PATH = '/configurations/dataSourceSetting.json';
// const BZW_SYNC_API = '/ZLUX/plugins/com.rs.bzshared/services/syncMode';
//const SERVER_PATH = '/instance/ZLUX/pluginStorage/com.rs.bzadm/configurations';
const SERVER_FILE = "/configurations/serverSettings.json";
const INSTALLATION_FILE = "/configurations/installation.json";
const WEB2H_SERVER_FILE = "/configurations/web2hServerSettings.json";
// const CLUSTER_FILE ='/configurations/cluster_slave.json';
// const InternalDataSteward = require('../../../../bzshared/lib/services/internal-data-steward.service');
// const DataEntities = require('../../services/data-entities.config');
const Utiles =  require('../../services/utils.service');
const Protocol = require('../../services/protocol.service');
const { isIP } = require('net');
const LICESN_INTERNAL_NAME = 'bluezone.lic';
const DEFAULT_BZLP_AUTH_TIMEOUT = 5;
const DEFAULT_SERVER_CONFIG = {
    licenseName: '',
    method: 'launchPad',
    enableUsePersonal: true,
    cacheFile: 'application',
    cacheBit: 32,
    createShortcut: true,
    createMenu: true,
    shortcutName: 'BZW2H',
    clearFile: true,
    bzlpAuth: false, // BZ-19413, BZLP security
    bzlpAuthTimeout: DEFAULT_BZLP_AUTH_TIMEOUT, // BZ-19413, BZLP security
    useLogEvents: false,
    language: 'English',
    download: true,
    sdInstallDir: `<User Application Data>\\BlueZone\\${w2h_const.MAJOR_VERSION}`,
    sdIsAddManager: false,
    sdIsAutoUpdate: true,
    sdIsCreateShortcut:true,
    sdIsForceUpdate: false,
    sdIsRunInTray: false,
    sdIsSuppressLaunch: true,
    sdIsSuppressSession: true,
    sdIsUseProgramGroup: false,
    sdProgramGroupName: `Rocket TE ${w2h_const.MAJOR_VERSION}`,
    sdSecondaryURL: '',
    sdShortcutName: 'sd',
    useGlobalSetting: true,
    LMGroup:''
};


class ServerConfigRouter {
    constructor(context) {
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        //this.syncer = handleSync.init(context);
        this.serverRuntimeService = new ServerRuntimeService(context);
        this.configDataService = new ConfigDataService(context);
        // this.dataSteward = InternalDataSteward.initWithContext(context);        
        this.bzw2hConfigObj = Bzw2hConfigService.init(context);
        this.reportSrc = reportSrc;
        this.utiles = new Utiles(context);
        this.protocol = new Protocol(context);
        this.licName = "";
        this.adminConfigRestarts = {};
        this.serverLoggingRestarts = '';
        authConfigService.init(context).then((obj)=>{
            this.authConfigObj=obj;
        });
        this.setAdminConfigStatus(); // for cluster, need to get admin config status when starting server

    }

    printContext() {
        this.logger.info(JSON.stringify(this.context));
    }
    getFromProduct(type){
        let Product_Path = path.join(BASE_PATH, deployDirectory.productZluxPath, deployDirectory.pluginStorageFolder);
        type=type==="datasource"?"admin":type;
        if (type === 'ldap') {
            Product_Path=path.join(Instance_plugin_internal, LDAP_NAME,internal)
        } else if (type === 'mssql') {
            Product_Path=path.join(Instance_plugin_internal, MSSQL_NAME,internal)
        }
        else if (type === 'datasource') {   //admin plugin
            Product_Path=path.join(Instance_plugin_internal,BZADMIN_NAME,internal)
        } else if (type === 'bzw2h') {   //web-to-host plugin
            Product_Path=path.join(Instance_plugin_internal,BZADMIN_NAME,internal)
        }
        return Product_Path;
    }

    /**
     * Gettor of the router
     */
    getRouter() {
        return this.router;
    };
    async getFileContent(type){
        let jsonData = {};
        if(type && ['zlux','log','ldap','mssql','datasource','config','sso','auth'].includes(type)){
            let result;
            let dbEntity=authConfigService.getBZDBEntity(type);
            if(dbEntity){
                result=await bzdb.select(dbEntity.entityName,dbEntity.filter)
            }
            if(result.data && Array.isArray(result.data) && result.data.length>0){
              jsonData=result.data[0];
            }
        }

        if(Object.keys(jsonData).length==0){  //get from the backup path
            let fileName = this.getFileName(type,"instance");
            if (fs.existsSync(fileName)) {
                jsonData = jsonUtils.parseJSONWithComments(fileName);
            } else {   
                fileName=this.getFileName(type,"product");
                jsonData = jsonUtils.parseJSONWithComments(fileName);
            }
            if(type==='auth'){  // read from zluxServer.js, but only keep the dataserviceAuthentication
                let authentication={dataserviceAuthentication:{}}
                authentication.dataserviceAuthentication=Object.assign(authentication.dataserviceAuthentication,jsonData.dataserviceAuthentication)
                jsonData=authentication;
            }
        }
        if(type==="ldap" || type==="mssql"){
            jsonData=encryption.decryptAuthObj(jsonData,type);
        }
        if(type==="datasource"){
            if(jsonData.dataserviceDataSource.defaultDataSource==="ldap" || jsonData.dataserviceDataSource.defaultDataSource==="mssql"){
                jsonData.dataserviceDataSource.implementationDefaults=encryption.decryptAuthObj(jsonData.dataserviceDataSource.implementationDefaults,jsonData.dataserviceDataSource.defaultDataSource);
            }
        }
        if(Object.keys(jsonData).length==0){
            throw 'I/O error when read configuation '+type;
        } 
        return jsonData;
    }

    decryptToken(data) {
        if(data.node?.https?.token){
            const tmpToken = this.protocol.decryptFn(data.node.https.token);
            if(!tmpToken){
                data.node.https.token = '';
            }
        }
    }

    getBzadmSettingRouter() {
        const logger = this.logger;
        const router = this.router;

        logger.info('Setup Bzadmin setting router');

        router.use(express.json({ type: 'application/json' }));
        router.use(fileUpload());
        router.use(oAuth.defaultOAuthChecker());

        router.get('/serverConfig/:type', (req, res) => {
            let type = req.params.type;
            let fileName = this.getFileName(type,"instance");
            let jsonData = "";
            res.setHeader("Content-Type", "text/typescript");
            if (type === "activeAuth") {
                res.status(200).json({ 'data': {'authType':this.authConfigObj.authConfig,'authDetail':this.authConfigObj.anthenticationConfig} });   //cache
                logger.debug(`Get data for ${type}: ${JSON.stringify(this.authConfigObj.authConfig)}`);
            } else if (type === "activedatasource") {
                res.status(200).json({ 'data': this.authConfigObj.dataSourceConfig }); //cache
                
                const logObj = JSON.parse(JSON.stringify(this.authConfigObj.dataSourceConfig));
                if(logObj.implementationDefaults) {
                    delete logObj.implementationDefaults.password;
                    delete logObj.implementationDefaults.ldapManagerPassword
                }
                
                logger.debug(`Get data for ${type}: ${JSON.stringify(logObj)}`);
            } else if (type === 'bzw2hMode') {
                res.status(200).json({ 'enabled': this.context.plugin.server.config.user.bzw2hMode ? true : false});
            } else if (type === "zluxServerConfig") {
                res.status(200).json({ 'data': this.authConfigObj.zluxServerConfig }); //cache
                logger.debug(`Get data for ${type}: ${JSON.stringify(this.authConfigObj.zluxServerConfig)}`);
            } else if (type === "cookieTimeoutMs") {
                const zluxServerConfig = this.authConfigObj.zluxServerConfig;
                if(zluxServerConfig && zluxServerConfig.node 
                    && zluxServerConfig.node.session && zluxServerConfig.node.session.cookie)
                {
                    res.status(200).json({ 'data': zluxServerConfig.node.session.cookie }); //cookie's timeoutMS
                    logger.debug(`Get data for ${type}: ${JSON.stringify(zluxServerConfig.node.session.cookie)}`);
                }else {
                    res.status(200).json({ 'data': {} });
                }
            }
            else {
                this.getFileContent(type).then((data)=>{
                    this.decryptToken(data);
                    jsonData= data;
                    res.status(200).json({ 'data': jsonData });

                    // type === mssql || ldap
                    const logObj = JSON.parse(JSON.stringify(jsonData));
                    if(type === 'mssql' && logObj) {
                        delete logObj.password;
                    }
                    if(type === 'ldap' && logObj) {
                        delete logObj.ldapManagerPassword;
                    }
                    if(type === 'datasource' && logObj.dataserviceDataSource && logObj.dataserviceDataSource.implementationDefaults) {
                        delete logObj.dataserviceDataSource.implementationDefaults.password;
                        delete logObj.dataserviceDataSource.implementationDefaults.ldapManagerPassword;
                    }

                    logger.debug(`Get data for ${type}: ${JSON.stringify(logObj)}`);
                }).catch((err)=> {
                    fileName = Security.defendXSS(fileName);
                    res.status(500).json({ error: err});
                    let message = `I/O error when read file ${fileName},${err}`;
                    logger.severe(`${message}`);
                 });
            }
            logger.info(`Get server config for ${type} success`);
        });
        
        router.post('/testMsSQlConnection', (req, res) => {
            let data = req.body.data;
                let mssqlClient=new mssqlHelper.mssqlHelper(data);
                mssqlClient.testConnection()
                .then((result)=>{
                    const logObj = JSON.parse(JSON.stringify(data))
                    delete logObj.password;
                    logger.debug(`Test mssql connection: ${JSON.stringify(logObj)}`);
                    if(result && result.success){
                        res.status(200).json({ 'result': true });
                        logger.info('Test mssql connection successful');
                    }
                    else{
                        res.status(200).json({ 'result': false });
                        logger.severe('Test mssql connection failed');
                    }
                })
                .catch((err)=> {
                    res.status(200).json({ 'result': false});
                    let message = err && err.message || 'Exception occurs';
                    logger.severe(`Test mssql connection failed: ${message}`);
                    // console.log(err.message);
                 });
 
        });
        
        router.post('/testLdapSetting', (req, res) => {
            const ldapConfigure = req.body.data;
            const ldapClient = new ldapHelper.ldapHelper(ldapConfigure);
            const username=ldapConfigure.userId;
            const password=ldapConfigure.password;
            const retureAttrs=ldapConfigure.ldapReturnAttributes;
            ldapClient.ldapSettingTest(username, password,retureAttrs)
                .then((result)=>{
                    logger.debug(`Test LDAP setting: ${JSON.stringify(result)}`);
                    if(result){
                        res.status(200).json({ 'result': result });
                        logger.info('Test LDAP setting successful');
                    }
                    else{
                        res.status(200).json({ 'result': {success:false,message:''} });
                        logger.severe('Test LDAP setting failed');
                    }
                })
                .catch((err)=> {
                    let message = err && err.message || 'Exception occurs';
                    logger.severe(`Test LDAP setting failed: ${message}`);
                    res.status(200).json({ 'result': {success:false,message:message}});
                 });
 
        });
        router.put('/serverConfig/:type', async (req, res) => {
            const that = this;
            let type = req.params.type;
            let data = req.body.data;
            let fileName = this.getFileName(type);
            if(type==="ldap" || type==="mssql"){
                data=encryption.encryptAuthObj(data,type);
            }
            if(type==="datasource"){
                if(data.dataserviceDataSource.defaultDataSource==="ldap" || data.dataserviceDataSource.defaultDataSource==="mssql"){
                    data.dataserviceDataSource.implementationDefaults=encryption.encryptAuthObj(data.dataserviceDataSource.implementationDefaults,data.dataserviceDataSource.defaultDataSource);
                }
            }
            if (type && ['zlux', 'server', 'ldap', 'mssql', 'datasource', 'config','sso','auth'].includes(type)) {
                if (type === 'server') {
                    that.convert(data, req);
                }

                let result;
                let dbEntity=authConfigService.getBZDBEntity(type);
                let obj={
                    data:data,
                    fileName:dbEntity.filter.fileName
                }
                let autoScaleData = data;
              
                if(type === 'server' && req.query.sync === 'false') {
                    result = await this.configDataService.writeConfigFile({path: fileName, data: data})
                } else {
                    result = await bzdb.insert(dbEntity.entityName, obj);
                    const serverData = await bzdb.select(dbEntity.entityName, dbEntity.filter);
                    autoScaleData = serverData.data[0] || data;
                }

                autoScalingService.updateFile(autoScaleData, type);

                if (result.status) {
                    if (type === 'server') {
                        that.setLogLevel(data);
                    }
                    res.status(200).json({
                        data: data
                    });
                    logger.info(`Update ${fileName} successful`);
                } else {
                    let message = result.message;
                    res.status(500).json({
                        error: message
                    });
                    logger.severe(`I/O error when update ${fileName};${result.message}`);
                }

            }else{
              this.configDataService.createDirs(fileName);
              fs.writeFile(fileName, JSON.stringify(data, null, 2), {mode: 0o770}, (err) => {
                if (err) {
                  let message = `I/O error when update data`;
                  res.status(500).json({error: message});
                  logger.severe(`${message};${fileName}`);
                } else {
                  res.status(200).json({data: data});
                }
              });
            }
        });

        router.post('/cetificate', async (req, res) => {
            const permises = [];
            (req.body || []).forEach(d => {
                const {name, value, type} = d;
                const buffer = Buffer.from(value, type || 'utf-8');
               
                const dir = path.join(BASE_PATH, deployDirectory.instanceZluxPath, deployDirectory.serverConfigFolder, name);
               
                // let result = await bzdb.insert('uploadServerConfig', uploadFile);
                permises.push(this.configDataService.writeBinaryFile({path: dir, data: buffer, name: name}));
            })

            Promise.all(permises).then(value => {
                const status = value.every(e => e.status ? true: false);
                if (status) {
                    return res.send({status: true, message: 'success'});
                } else {
                    const faileds = value.filter(e => !e.status);
                    return res.status(500).send({result: faileds});
                }
            }).catch(err => {
                return res.status(500).send({status: false, message: err.stack? err.stack: err.message});
            });
        })

        router.delete('/cetificate', async (req, res) => {
            const permises = [];
            const {name, type} = req.query;
            const subPath = req.query.path;
            let dir = '';

            if(subPath) {
                dir = path.join(process.cwd(), subPath, name);
            } else {
                dir = path.join(BASE_PATH, deployDirectory.instanceZluxPath, deployDirectory.serverConfigFolder, name);
            }
            
            const data = await this.getFileContent('zlux');
            // const key = Object.keys(data.node)[0];
            // const fileName = `../${deployDirectory.instanceZluxPath}/${deployDirectory.serverConfigFolder}/${name}`
            // const index = (data.node[key][type] || []).findIndex(d => d === fileName);
            // if(index > -1) {
            //     data.node[key][type].splice(index, 1);
            //     let fileName = this.getFileName('zlux');
            //     // update zluxServer.json
            //     permises.push(this.configDataService.writeConfigFile({path: fileName, data: data}))
            // }

            // delete cetificate file
            permises.push(this.configDataService.deleteConfigFile({path: dir, name: name}));
           
            Promise.all(permises).then(value => {
                const status = value.every(e => e.status ? true: false);
                if (status) {
                    return res.send({status: true, message: 'success'});
                }else {
                    const faileds = value.filter(e => !e.status);
                    return res.status(500).send({result: faileds});
                }
            }).catch(err => {
                return res.status(500).send({status: false, message: err.stack? err.stack: err.message});
            });
        });

        router.put('/test', (req, res) => {
            // test certificate
            this.protocol.checkCertificate(req.body).then(result => {
                return res.send(result);
            }).catch(err => {
                return res.send(err);
            });
        })

        router.get('/cetificatePath', async (req, res) => {
            const dir = `../${deployDirectory.instanceZluxPath}/${deployDirectory.serverConfigFolder}`;
            const fullPath = path.join(BASE_PATH, deployDirectory.instanceZluxPath, deployDirectory.serverConfigFolder);
           
            return res.send({status: true, path: dir, fullPath});
        });

        router.get('/cetificate', async (req, res) => {
            const zluxPath =  this.getFileName('zlux');
            const data = {};

            if(fs.existsSync(zluxPath)) {
                data.zlux = jsonUtils.parseJSONWithComments(zluxPath);
            }

            // const https = data.zlux.node.https;

            // if(!https) {
            //     return res.send({status: true, exist: true});
            // } 

            const certs = ['certificates', 'keys', 'pfx', 'certificateAuthorities'];
            const results = [];
            const getFileName = (str = '') => {
                const names = str.split('/');
                const name = names[names.length - 1];

                return {
                    name,
                    path: str.replace(name, '')
                };
            };
            const getResult = (result, filePath, type) => {
                return {
                    name: result.name,
                    path: result.path,
                    type,
                    exist: fs.existsSync(path.join(process.cwd() + '/' + filePath))
                }
            }

            certs.forEach(d => {
                let file =null
                if(d==='certificateAuthorities'){
                    file=data.zlux.node?.tlsOptions?.ca
                }else{
                    if(data.zlux.node.https){
                        file=data.zlux.node.https[d]
                    } 
                    
                }
                if(file) {
                    if(Array.isArray(file)) {
                        file.forEach(f => {
                            const result = getFileName(f);

                            results.push(getResult(result, f, d));
                        })
                    } else {
                        const result = getFileName(file);
                        
                        results.push(getResult(result, file, d));
                    }
                }                    
            })

            return res.send({status: true, results});
        });


        router.get('/url', (req, res) => {
            const bzwUrl = `${this.utiles.getURL(req, this.context)}/ZLUX/plugins/com.rs.bzw/web/`;
            const bzaUrl = `${this.utiles.getURL(req, this.context)}/ZLUX/plugins/com.rs.bzadm/web/`;

            res.setHeader("Content-Type", "text/typescript");
            res.status(200).json({'text': 'Saved', url: bzwUrl, bzaURL: bzaUrl});
            logger.info(`Get bzw url successful: ${bzwUrl}`);
        });

        router.get('/configurations', async(req, res) => {
            let data = {
                fullScreen: false,
                contextMenu: false,
                hideServer: false,
                placeVirtulKeyboardBelow: false,
                language: 'en-US'
            };
            let dbEntity=authConfigService.getBZDBEntity('config');
            const result=await bzdb.select(dbEntity.entityName,dbEntity.filter);
            if (result.data && Array.isArray(result.data) && result.data.length > 0) {
                let jsonData = result.data[0];
                res.status(200).json({ data: jsonData });
                logger.info(`Get the configurations content successful`);
            } else {
                let message = `I/O error when read configurations`;
                logger.warn(`${message},${result.message}`);
                res.status(200).json({ data: data });
            }
        });



        router.get('/web2hConfig', async(req, res) => {
            const result=await bzdb.select("configurations",constants.metaDataBackupPath.w2hServerSettings)
            let data = JSON.parse(JSON.stringify(DEFAULT_SERVER_CONFIG));
            /* = {
                licenseName: '',
                method: 'launchPad',
                enableUsePersonal: true,
                cacheFile: 'application',
                cacheBit: 32,
                createShortcut: true,
                createMenu: true,
                shortcutName: 'BZW2H',
                clearFile: true,
                useLogEvents: false,
                language: 'English' 
            };*/
            if (result.data[0]) {
                const serverdata = result.data[0];
                data = Object.assign(data, serverdata);
            }
            
            const licenseFolder = this.getFileName('web2hlicense', 'product');
            const licenseFile = path.join(licenseFolder, LICESN_INTERNAL_NAME);
            if(!fs.existsSync(licenseFile)) {//no license file in the sever
                data.licenseName = '';
            }else{
                if(data.licenseName === undefined || data.licenseName.length === 0)//bluezone.lic exists, but no license name in config file
                {
                    data.licenseName = LICESN_INTERNAL_NAME;
                }
            }    
            this.licName = data.licenseName;
            logger.info(`Get the content of serverconfig successful`);
            res.status(200).json({data: data});
        });

        router.put('/configurations', async(req, res) => {
            const data = req.body;
            let dbEntity=authConfigService.getBZDBEntity('config');
            let obj={
                data:data,
                fileName:dbEntity.filter.fileName
            }
            const result = await bzdb.insert(dbEntity.entityName, obj);
            if (result.status) {
                res.status(200).json({
                    data: data
                });
                logger.info(`Update configurations successful`);
            } else {
                let message = result.message;
                res.status(500).json({
                    error: message
                });
                logger.severe(`I/O error when update configurations;${message};`);
            }
        });


        router.put('/web2hConfig', async(req, res) => {
            const result = await this.bzw2hConfigObj.saveClientConfig(req.body);
            res.json(result);
        });

        router.get('/web2hLicense/:id', (req, res) => {
            const name = req.params.id;
            const licenseFolder = this.getFileName('web2hlicense', 'product');
            const filePath = licenseFolder + '/' + encodeURIComponent(name);

            if (!fs.existsSync(filePath)) {
                res.status(500).send('File Not Found.');
            } else {
				try{
                    res.download(Security.sanitizePath(filePath), this.licName);
                }catch(e){
                    logger.severe('Error while downlaoding file :' + file);
                    console.error(e);
                    res.status(500).send('Download file failed');
					return;
                }
            }
        });
		 
        // BZ-15277, upload license and save to a temp file
        router.post('/web2hLicense', async (req, res) => {
            const result = await this.bzw2hConfigObj.saveLicense2TmpDir(req.body.data);
            return res.json(result);
        });
        
      
        router.post('/upload',  async(req, res) => {
            let message = '';
            // req.file is the `avatar` file
            // req.body will hold the text fields, if there were any
            if (Object.keys(req.files).length == 0 || req.files.file.size === 0) {
                message = 'No files were uploaded.';
                logger.severe(message);
                return res.status(400).send(message);
              }
            
              // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
              let fileObj = req.files.file;
              var DIR = path.join(BASE_PATH, deployDirectory.productZluxPath, deployDirectory.serverConfigFolder);
              logger.info(`upload file path: ${DIR}/${req.files.file.name}`);

              let uploadFile={
                data:JSON.stringify(fileObj.data), //must have
                fileName:fileObj.name,             //must have
                size:fileObj.size,
                encoding:fileObj.encoding,
                tempFilePath:fileObj.tempFilePath,
                truncated:fileObj.truncated,
                mimetype:fileObj.mimetype,
                md5:fileObj.md5,
              }
              const result = await bzdb.insert("upload", uploadFile)
              if (result.status) {
                 message = 'File uploaded!';
                 logger.info("upload file:" + message);
                 res.send(message);
              } else {
                    logger.severe("upload file:"+ result.message);
                    return res.status(500).send("upload file:"+ result.message);
              }
            //   sampleFile.mv(`${DIR}/${req.files.file.name}`, function(err) {
            //     if (err) {
            //         logger.severe("upload file:"+ err);
            //         return res.status(500).send(err);
            //     }

            //     message = 'File uploaded!';
            //     logger.info("upload file:" + message);
            //     res.send(message);
            //   });
          });

        router.post('/certExist', (req, res) => {
        // Verfiy the certificate if exists
        let path = req.body;
        this.isExistCertificate(path, res);
        });

        //remove the router to configuration-controller.js in bzshared 
        // router.get('/installation', (req, res) => {
        //     let fileName = this.getFileName("installation","instance");
        //     let data = {
        //         introduce: {
        //           show: true,
        //           isActive: false
        //         },
        //         configure: {
        //           start: true,
        //           show: true,
        //           isActive: true,
        //           steps: {
        //             auth: false,
        //             user: false,
        //             session: true,
        //             group: false
        //           }
        //         },
        //         upgrade: {
        //           show: true,
        //           start: true,
        //           isActive: true
        //         }
        //       };
        //     if (fs.existsSync(fileName)) {
        //         data = JSON.parse(fs.readFileSync(fileName));
        //     } else {
        //         fileName=this.getFileName("installation","product");
        //         data = JSON.parse(fs.readFileSync(fileName));
        //     }
        //     res.status(200).json({data});
        //     logger.info(`Get the content of ${fileName} successful`);
        // });

        // router.put('/installation', (req, res) => {
        //     const data = req.body;
        //     //const dir = folder + SERVER_FILE;
        //     let fileName = this.getFileName("installation","instance");
        //     this.configDataService.createDirs(fileName);

        //     fs.writeFile(fileName, JSON.stringify(data,null, 2), { mode: 0o644 }, (err) => {
        //         let message = '';
        //         if (err) {
        //             message = `I/O error when update data`;
        //             res.status(500).json({ error: message });
        //             logger.severe(`${message};${fileName}`);
        //         } else {
        //             message = 'Update serverSetting file successfully';
        //             res.status(200).json({ success: true, message: message, data: data });
        //             logger.info(message);
        //             logger.debug(`Update ${fileName} successful: ${JSON.stringify(data)}`);

        //         }
        //     });
        // })

        router.get('/apiToken', async (req, res) => {
            try{
                const result = await bzdb.select('apiToken');
                let data, values, id = 0, token, expire = 'm3', ranges = 'ur', allows = '', 
                expireTime= new Date().getTime() + this.getTime(expire);

                if(result.rowCount === 0) {
                    values = result.data;
                    // data = {
                    //     id: 0,
                    //     token: encryption.getRandom(32),
                    //     expire,
                    //     expireTime,
                    //     ranges,
                    //     allows
                    // };
                    // const encData = encryption.encryptObject(data, 'token');
                    // await bzdb.updateOrInsert('apiToken', encData);
                    // values = [data].map(d => {
                    //     d.token = Buffer.from(d.token).toString('base64');
                    //     return d;
                    // })
                } else {
                    values = result.data.map(d => {
                        const result = encryption.decryptObject(d, 'token');
                        result.token = Buffer.from(result.token).toString('base64');
                        result.expireTime = result.expire === 'never' ? 'never' : this.reportSrc.utils.formatDate(new Date(result.expireTime), true, false, 'yyyy/mm/dd');
                        return result;
                    })
                    // const data = result.data[0];
                    // const tokens = encryption.decryptObject(data, 'token');
                    // id = tokens.id;
                    // token = tokens.token;
                    // expire = tokens.expire;
                    // ranges = tokens.ranges;
                    // expireTime = tokens.expireTime;
                    // allows = tokens.allows || '';
                }
                
                res.status(200).json({data: values, status: true});
            } catch(err) {
                res.status(200).json({ 'result': false});
                let message = err && err.message || 'Exception occurs';
                logger.severe(`Get API token failed: ${message}`);
            }
           
        })

        router.get('/newToken', async (req, res) => {
            const token = encryption.getRandom(32);
            const id = await bzdb.getUID()
           
            res.status(200).json({token, id});
        })

        router.delete('/apiToken/:id', async (req, res) => {
            const id = req.params.id;
            const result = await bzdb.delete('apiToken', {id});
           
            res.status(200).json(result);
        })

        router.put('/apiToken', async (req, res) => {
            try {
                const data = req.body;
                const options = {
                    id: data.id || 0,
                    token: Buffer.from(data.token, 'base64').toString('ascii'),
                    expire: data.expire,
                    ranges: data.ranges,
                    allows: data.allows,
                    expireTime: data.expireTime
                };
                if(data.expireChanged) {
                    options.expireTime = new Date().getTime() + this.getTime(data.expire);
                }
                const encOptions = encryption.encryptObject(options, 'token');
                const result = await bzdb.updateOrInsert('apiToken', encOptions);

                result.expireTime = options.expireTime;
                res.status(200).json(result);
            } catch(err) {
                res.status(200).json({ 'result': false});
                let message = err && err.message || 'Exception occurs';
                logger.severe(`Put API token failed: ${message}`);
            }
           
        })
        

        router.get('/terminalScreens', async (req,res) => {
            const result=await bzdb.select('terminalScreen');
            if(result && result.data && Array.isArray(result.data)) {
                res.status(200).json(result.data);
                logger.info(`Get terminal screens successful`);
            } else {
                let message = result.message;
                res.status(500).json({
                    error: message
                });
                logger.severe(`I/O error when get terminal screen;${message};`);
            }
        });

     
        router.put('/terminalScreens', async (req,res) => {
            const screenData = req.body;
            if (!screenData) {
                this.logger.warn(`Update terminal screen failed: Bad request, data is missing`);
                res.status(400).send('Bad request: terminal screen  data is missing');
                return;
            }
            if(!screenData.uuid){
                screenData.uuid=bzdb.getUIDSync();
            }
            let result = await bzdb.updateOrInsert('terminalScreen', screenData);
            
            if (result.status) {
                result.screenData=screenData;
                res.status(200).json({result});
                logger.info(`Update terminal screen successful`);
            } else {
                let message = result.message;
                res.status(500).json({
                    error: message
                });
                logger.severe(`I/O error when update terminal screen;${message};`);
            }
        });

        router.delete('/terminalScreens/:id', async (req,res) => {
            const id = req.params.id;
            const result = await bzdb.delete('terminalScreen', {uuid:id});
            res.status(200).json(result);
        });

        
        router.get('/logConfig', async (req, res) => {
            const result = await bzdb.select('serverLogging');

            if(result.rowCount > 0) {
                const data = result.data[0], restarts = [];

                // check httpRequst to prevent miss some info which maybe cased by upgrade.
                if(!data.httpRequest) {
                    data.httpRequest = {}
                }

                if(data.httpRequest.enable == null) {
                    data.httpRequest.enable = false;
                }

                if(data.httpRequest.dir == null) {
                    data.httpRequest.dir = '../log/access';
                }

                if(data.httpRequest.prefix == null) {
                    data.httpRequest.prefix = 'access';
                }

                if(data.httpRequest.keepDays == null) {
                    data.httpRequest.keepDays = 30;
                }
                
                if( this.serverLoggingRestarts.length === 0) {
                    this.serverLoggingRestarts = JSON.stringify(data);
                }

                if(JSON.stringify(data) !== this.serverLoggingRestarts) {
                    restarts.push('server');
                }
                
                res.status(200).json({data, restarts});
                logger.info(`Get the content of server logging successful`);
            } else {
                let message = data.message;
                res.status(500).json({
                    error: message
                });
                logger.severe(`I/O error when get  server logging;${message};`);
            }

        });

        router.put('/logConfig', async (req, res) => {
            const loggingConfig = await bzdb.select('serverLogging');
            const data = Object.assign((loggingConfig.rowCount > 0) ? loggingConfig.data[0] : {}, req.body);
            const result = await bzdb.updateOrInsert('serverLogging', data);
            const restarts = [];
            
            if (result.status) {
                const message = 'Update server logging file successfully';
                if(JSON.stringify(data) !== this.serverLoggingRestarts) {
                    restarts.push('server');
                }
                const savedData = await bzdb.select('serverLogging');
                autoScalingService.updateFile(savedData.data[0] || data, 'serverLogging');
                res.status(200).json({ success: true, message: message, data: req.body, restarts });
                logger.info(message);
                logger.debug(`Update server logging successful: ${JSON.stringify(req.body)}`);
            } else {
                const message = result.message;
                res.status(500).json({
                    error: message
                });
                logger.severe(`I/O error when update server logging;${message};`);
            }
        });

         
        router.get('/adminConfig', async (req, res) => {
            const result = await bzdb.select('adminConfig');
            const type = req.query.type;

            if(result.rowCount > 0) {
                const configured = result.data[0];
                const data = JSON.parse(JSON.stringify(configured));

                if(type === 'bzw') {
                    delete data['fileUpload']; //web2h
                    delete data['varMapApiOauth2']; //web2h
                    delete data['enableATTLS'];
                }

                if(data?.node?.sessionTimeoutMs) {
                    data.node.sessionTimeoutMs /= 60000; // conver to minute to client
                }
                
                if(data.wsPingPongInterval) {
                    data.wsPingPongInterval /= 1000; // conver to second to client
                }

                if(data.IPWhiteList) {
                    data.IPWhiteList = data.IPWhiteList.join(',');
                }

                // whether need to restart server in advanced-configuration page
                const restarts = this.getRestartOptions(data);

                res.status(200).json({data: data, restarts});
                logger.info(`Get the content ofadminConfig successful`);
            } else {
                let message = data.message;
                res.status(500).json({
                    error: message
                });
                logger.severe(`I/O error when get  adminConfig;${message};`);
            }
           

        });

        router.put('/adminConfig', async (req, res) => {
            const adminConfig = await bzdb.select('adminConfig');
            const data = Object.assign((adminConfig.rowCount > 0) ? adminConfig.data[0] : {}, req.body);
            const sessionTimeoutMs = data.node?.sessionTimeoutMs / (req.body.node ? 1 : 60000) // sessionTimeoutMs used for checking whether changed
            const wsPingPongInterval = data.wsPingPongInterval / (req.body.wsPingPongInterval ? 1 : 1000);

            // conver to millisecond if change sessionTimeoutMs from client
            if(req.body.node?.sessionTimeoutMs) {
                data.node.sessionTimeoutMs *= 60000; 
            }

            // conver to millisecond if change sessionTimeoutMs from client
            if(req.body.wsPingPongInterval) {
                data.wsPingPongInterval *= 1000; 
            }

            // saved IPWhiteList as array, and convert string to client.
            const IPList = req.body.IPWhiteList;
            if(IPList != null) { // IPWhiteList is string from client and need convert to array to save.
                data.IPWhiteList = IPList === '' ? [] : IPList.split(',');
            }
            
            //save file uploading
            if(req.body.fileUpload){
                data.fileUpload = req.body.fileUpload
            }
            //save file OAuth
            if(req.body.varMapApiOauth2){
                data.varMapApiOauth2 = req.body.varMapApiOauth2
            }
            const result = await bzdb.updateOrInsert('adminConfig', data);
            
            if (result.status) {
                const message = 'Update admin configuration file successfully';
                const restarts = this.getRestartOptions(data, sessionTimeoutMs, true, wsPingPongInterval);
                const savedData = await bzdb.select('adminConfig');
                autoScalingService.updateFile(savedData.data[0] || data, 'adminConfig');
                res.status(200).json({ success: true, message: message, data: req.body, restarts });
                logger.info(message);
                logger.debug(`Update admin configuration successful: ${JSON.stringify(req.body)}`);
            } else {
                const message = result.message;
                res.status(500).json({
                    error: message
                });
                logger.severe(`I/O error when update admin configuration;${message};`);
            }
        });
}

    getTime(period) {
        if (period === 'w1') {
            return 7 * 24 * 60 * 60 * 1000;
        } else if (period === 'm1') {
            return 30 * 24 * 60 * 60 * 1000;
        } else if (period === 'm3') {
            return 90 * 24 * 60 * 60 * 1000;
        } else {
            return 100000000000000000000 * 24 * 60 * 60 * 1000;
        }
    }

    // get status which used for checking whether need to restart server
    setAdminConfigStatus() {
        bzdb.select('adminConfig').then(result => {
            if(result.rowCount === 0) return;

            const configured = result.data[0];    
            const data = JSON.parse(JSON.stringify(configured));
    
            if(data?.node?.sessionTimeoutMs) {
                data.node.sessionTimeoutMs /= 60000; // conver to minute to client
            }

            if(data.wsPingPongInterval) {
                data.wsPingPongInterval /= 1000; // conver to second to client
            }
    
            // whether need to restart server in advanced-configuration page
            if(Object.keys(this.adminConfigRestarts).length === 0) {
                this.adminConfigRestarts.sessionTimeoutMs = data.node?.sessionTimeoutMs || -1;
                this.adminConfigRestarts.restrictRemoteAddress = data.restrictRemoteAddress;
                this.adminConfigRestarts.IPWhiteList = data.IPWhiteList.join(',');
                this.adminConfigRestarts.enableUserReport = data.enableUserReport;
                this.adminConfigRestarts.wsPingPongInterval = data.wsPingPongInterval;
            }
        });
    }

    /**
     * whether need to restart server in advanced-configuration page
     * data: current admin config data
     * sessionTimeoutMs: need convert to minutes when getting from bzad and doesn't need convert if from client
     * isIPListArray: IPWhiteList is array from bzdb and it is string from client.
     * wsPingPongInterval: need convert to second when getting from bzad and doesn't need convert if from client
     */
    getRestartOptions(data, sessionTimeoutMs, isIPListArray, wsPingPongInterval) {
        const restarts = [];
        const timeoutMs = sessionTimeoutMs == null ? data.node?.sessionTimeoutMs : sessionTimeoutMs;
        const wsPingPong = wsPingPongInterval == null ? data.wsPingPongInterval : wsPingPongInterval;
        const ipString = isIPListArray ? data.IPWhiteList.join(',') : data.IPWhiteList;

        if(this.adminConfigRestarts.sessionTimeoutMs > 0 && this.adminConfigRestarts.sessionTimeoutMs !== timeoutMs) {
            restarts.push('sessionTimeoutMs');
        } 
        if(this.adminConfigRestarts.wsPingPongInterval > 0 && this.adminConfigRestarts.wsPingPongInterval !== wsPingPong) {
            restarts.push('wsPingPongInterval');
        }
        if(this.adminConfigRestarts.restrictRemoteAddress !== data.restrictRemoteAddress) {
            restarts.push('restrictRemoteAddress');
        }
        if(this.adminConfigRestarts.enableUserReport !== data.enableUserReport) {
            restarts.push('enableUserReport');
        } 
        if(this.adminConfigRestarts.IPWhiteList !== ipString) {
            restarts.push('IPWhiteList');
        } 

        return restarts;
    }

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
     * Verfiy the certificate if exists
     * @param {*} path 
     * @param {*} res 
     */
    async isExistCertificate(path, res) {
        //let samlCertPath = path.samlCert.includes('/')?`${BASE_PATH}${path.samlCert.slice(3)}`:`${BASE_PATH}${deployDirectory.productZluxPath}/${deployDirectory.serverConfigFolder}/${path.samlCert}`;
        //let privatekeyPath = path.privateKeyPath.includes('/')?`${BASE_PATH}${path.privateKeyPath.slice(3)}`:`${BASE_PATH}${deployDirectory.productZluxPath}/${deployDirectory.serverConfigFolder}/${path.privateKeyPath}`;
        //let certPath =  path.cert.includes('/')?`${BASE_PATH}${path.cert.slice(3)}`:`${BASE_PATH}${deployDirectory.productZluxPath}/${deployDirectory.serverConfigFolder}/${path.cert}`;
        const fileExists=async function(fileName){
            if(fileName.includes('/')){
                fileName=fileName.substring(fileName.lastIndexOf("/")+1);
            }
            try{
              let obj=await bzdb.select('upload',{"fileName":fileName});
              if(obj.data.length>0)
                return true;
              else
                return false;
            }catch(err){
                return false;
            }
        };
        let isSamlCert = await fileExists(path.samlCert);
        let isprivatekeyPath = await fileExists(path.privateKeyPath);
        let iscertPath = await fileExists(path.cert);
        let result = {
            isSamlCert: isSamlCert,
            isprivatekeyPath: isprivatekeyPath,
            iscertPath: iscertPath
        }
        res.send({ status: result });
        this.logger.info(`Verfiy the certificate if exists: ${JSON.stringify(result)}`);
    }

    /**
     * Exists File
     * @param {*} path 
     */
     existsFile(path) {
       return fs.existsSync(path);
    }

    /*uploadFile(fileName, res){
        const filePath = fileName;
        if(fs.existsSync(filePath))
            fs.unlinkSync(filePath);
       
        fs.writeFile(filePath, JSON.stringify(data,null, 2), { mode: 0o644 }, (err) => {
            let message = '';
            if (err) {
                message = `I/O error when update ${config_fileName}`;
                this.logger.severe(message);
                res.status(500).json({ error: message });
            } else {                    
                    message = 'Update file ' +  fileName + ' successfully';
                    this.logger.info(message);
                    this.logger.debug(`Update ${config_fileName} successful: ${JSON.stringify(data)}`);
                    res.setHeader("Content-Type", "text/typescript");
                    res.status(200).json({'text': 'Saved', 'name': fileName, data: fileName});
            }
        });
    }*/

    //BZ-15277
	/*updatelicName(fileName, res){
        let licName = fileName;
        let config_fileName = this.getFileName("web2hconfig","instance");
        let data = JSON.parse(JSON.stringify(DEFAULT_SERVER_CONFIG));
		if (fs.existsSync(config_fileName)) {
                data = JSON.parse(fs.readFileSync(config_fileName));	
        }else{
            data['licenseName'] = licName;
            this.configDataService.createDirs(config_fileName);
        }

        fs.writeFile(config_fileName, JSON.stringify(data,null, 2), { mode: 0o644 }, (err) => {
            let message = '';
            if (err) {
                message = `I/O error when update ${config_fileName}`;
                this.logger.severe(message);
                res.status(500).json({ error: message });
            } else {
                    this.licName = licName;
                    
                    message = 'Update license file name successfully';
                    this.logger.info(message);
                    this.logger.debug(`Update ${config_fileName} successful: ${JSON.stringify(data)}`);
                    res.setHeader("Content-Type", "text/typescript");
                    res.status(200).json({'text': 'Saved', 'name': fileName, data: fileName});
            }
        });	
    }*/
	
    getFileName(type,isProduct) {
        let containerPath = deployDirectory.instanceZluxPath;
        if (isProduct != "undefinded" && isProduct === "product") {
            containerPath = deployDirectory.productZluxPath;
        }
        if (type === 'zlux' || type === 'server' || type === 'auth') {
            return path.join(BASE_PATH, containerPath, deployDirectory.serverConfigFolder, ZLUX_PATH)
        } else if (type === 'ldap') {
            return path.join(BASE_PATH, containerPath, deployDirectory.pluginStorageFolder, LDAP_NAME, LDAP_PATH)
        } else if (type === 'mssql') {
            return path.join(BASE_PATH, containerPath, deployDirectory.pluginStorageFolder, MSSQL_NAME, MSSQL_PATH)
        }else if (type === 'sso') {
            return path.join(BASE_PATH, containerPath, deployDirectory.pluginStorageFolder, SSO_NAME, SSO_PATH)
        } else if (type === 'oauth') {
          return path.join(BASE_PATH, containerPath, deployDirectory.pluginStorageFolder, OAUTH_NAME, OAUTH_PATH)
        }
        else if (type === 'datasource') {
            return path.join(BASE_PATH, containerPath, deployDirectory.pluginStorageFolder, BZADMIN_NAME, DATASOURCE_PATH)
        }
        else if (type === 'config') {
            return path.join(BASE_PATH, containerPath, deployDirectory.pluginStorageFolder, BZADMIN_NAME, SERVER_FILE)
        } else if (type === 'web2hconfig') {
            return path.join(BASE_PATH, containerPath, deployDirectory.pluginStorageFolder, BZADMIN_NAME, WEB2H_SERVER_FILE)
        } else if (type === 'web2hlicense') {
            return path.join(BASE_PATH, containerPath, deployDirectory.pluginStorageFolder, BZW2H_NAME);
        } else if (type === 'web2hGroupRoot') {
            return path.join(BASE_PATH, containerPath, deployDirectory.pluginStorageFolder, BZW2H_NAME,  'groups');
        // }else if (type === 'cluster') {
        //     return path.join(BASE_PATH, containerPath, deployDirectory.pluginStorageFolder, BZADMIN_NAME, CLUSTER_FILE);
        } else if (type === 'installation') {
            return path.join(BASE_PATH, containerPath, deployDirectory.pluginStorageFolder, BZADMIN_NAME, INSTALLATION_FILE)
        }
    }



    setLogLevel(data) {
        // let that = this;
        this.serverRuntimeService.setLogLevel(data);
        // const logLevels = data.logLevels['_unp.*'];
        // const clusterFile = this.getFileName('cluster');
        // if (fs.existsSync(clusterFile)) {
        //     const slaveData = JSON.parse(fs.readFileSync(clusterFile));
        //     const slaveNodes = slaveData && slaveData.nodes || [];
        //     this.logger.debug(`Sync log levels for secondary nodes: ${JSON.stringify(slaveNodes)}`);
        //     slaveNodes.forEach(node => {
        //         const url = `${node.protocol}://${node.host}:${node.port}/ZLUX/plugins/com.rs.bzw/services/cluster/syncLogLevel`;
    
        //         try {
        //             request.post({
        //                 url: url,
        //                 json: true,
        //                 body: {masterOrigin: node.masterOrigin, logLevels: logLevels},
        //                 headers: {
        //                     Authorization: node.authToken
        //                 }
        //               }, (err, response, body) => {
        //                   if (err) {
        //                     that.logger.severe(`Sync log level for secondary node ${JSON.stringify(node)} failed: ${err.stack}`);
        //                     return
        //                   }
        //                   if (response.statusCode === 200 && response.status) {
        //                      that.logger.info(`Sync log level for secondary node ${JSON.stringify(node)} success.`);
        //                   } else {
        //                       that.logger.severe(`Sync log level for secondary node ${JSON.stringify(node)} failed: ${body.message}`);
        //                   }
        //                   return
        //               });
        //         }
        //         catch(error) {
        //             that.logger.severe(`Sync log level for secondary node ${JSON.stringify(node)} failed: ${error.stack}`);
        //         }
        //     });
        // }
    }

    async getHostUrl(req){
        let url = this.getReqHost(req);
        const protocol = this.getHostProtocol(req);
        let port = this.context.plugin.server.config.user.node[protocol].port;
        try{
            let serverName = this.serverRuntimeService.getHostName();
            this.logger.debug("getHostUrl::serverName "+serverName)
            const domain = await this.serverRuntimeService.getHostDomain();
            if (domain && domain.status && domain.data) {
                this.logger.debug("getHostUrl::domain "+domain.data)
                const len=serverName.length-domain.data.length
                if(!(len>0 && serverName.lastIndexOf(domain.data)==len)){ //server name ended by the domain.data
                    serverName = `${serverName}.${domain.data}`;
                }
            }else {
                this.logger.warn('Failed to get server domain. Will use hostname only. This will have problem when http requests are cross domain.');
            }
            url = `${protocol}://${serverName}:${port}`;
        }catch (err) {
            this.logger.warn('Failed to get server fullname. Using the url get from request.');
            this.logger.severe(err.stack? err.stack: err.message);
        }
        return url;
    }

    getHostProtocol(req){
        const protocols = Object.keys(this.context.plugin.server.config.user.node);
        const isHttp = protocols.findIndex(d => d.toLowerCase() === 'http')  > -1;
        const isHttps = protocols.findIndex(d => d.toLowerCase() === 'https')  > -1;
        if (isHttps && isHttp){
            this.logger.warn('Both http and https are configured. We have to rely on the http request to identify the actuall protocol. This could cause issues when reverse proxy or load balancer uses different protocol.');
        }
        const protocol = isHttps?'https': isHttp?'http': req.protocol;
        return protocol;
    }

    getReqHost(req){
        let reqHost = req.headers.host;
        if (!reqHost.includes(':')){ // When BZA is access through NGINX, the port could be missing. We have to use the referer to get the URL of NGINX.
            const referer = req.headers.referer;
            reqHost = referer.substring(0, referer.indexOf('/ZLUX/plugins'));
            return reqHost;
        }
        const protocol = req.protocol;
        return `${protocol}://${reqHost}`;
    }

    getURL(req, context) {
        const protocol = req.protocol;
        const host = req.hostname || req.host;
        const port = req.headers.port? req.headers.port : context.plugin.server.config.user.node[protocol].port;
        // const options = {
        //     url: protocol + '://' + host + ':' + port,
        // }
        return `${protocol}://${host}:${port}`;
    }

    convert(data, req) {
        if(data?.node?.https?.token === ''){
            data.node.https.token = this.protocol.encryptFn(data.node.https.token);
            return;
        }
        if(req.query.tokenUpdated !== 'true' || !data || !data.node || !data.node.https || data.node.https.token === undefined || data.node.https.token === null) return;

        data.node.https.token = this.protocol.encryptFn(data.node.https.token);

    }

   
    // copyLanguageFile(dstLanguage){
        
    //     let dstLanguageFile = 'bzstring.dl_';
    //     let dstFolder = path.join(BASE_PATH, deployDirectory.productZluxPath, deployDirectory.pluginStorageFolder, BZW2H_NAME , "languages" );
    //     let srcFolder = path.join(BASE_PATH, deployDirectory.productZluxPath, deployDirectory.pluginStorageFolder, BZW2H_NAME , "i18n" );

        

    //     fs.copyFile(path.join(srcFolder, dstLanguage + ".dl_") ,path.join(dstFolder, dstLanguageFile) ,  (err) => {
    //         if (err) throw err;
    //         this.logger.info("successfully to copy 32 bits language file ");
    //         const ts = Date.now();
	// 	    fs.utimesSync(path.join(dstFolder, dstLanguageFile), ts / 1000, ts / 1000);

    //     });
    //     fs.copyFile(path.join(srcFolder,"64", dstLanguage + ".dl_") ,path.join(dstFolder, "64" , dstLanguageFile) ,  (err) => {
    //         if (err) throw err;
    //         this.logger.info(`successfully to copy 64 bits language file `);
    //         const ts = Date.now();
	// 	    fs.utimesSync(path.join(dstFolder, "64" , dstLanguageFile), ts / 1000, ts / 1000);
    //     });

    // }

}

exports.serverConfigRouter = (context) => {
    return new Promise(function (resolve, reject) {
        let controller = new ServerConfigRouter(context);
        controller.getBzadmSettingRouter();
        resolve(controller.getRouter());
    });
};


