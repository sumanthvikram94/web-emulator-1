'use strict';

/**
 * Name:      session-mode-controller.js
 * Desc:      Provide api clustering
 * Author:    Jerry (Jian Gao)
 * Create DT: 2019-5-21
 * Copyright: © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */

const express = require('express');
const zoweService = require('../../../../bzshared/lib/services/zowe.service');
const corsName = zoweService.isOnZowe? '../../../../bzshared/lib/node_modules/cors': 'cors';
//const cors = require(corsName);
const Promise = require('bluebird');
// const bodyParser = require('body-parser');
// const path = require('path');
// const ConfigDataService = require('../../../../bzshared/lib/services/config-data.service');
// const ServerRuntimeService = require('../../../../bzshared/lib/services/server-runtime.service');
// const oAuth = require('../../../../bzshared/lib/services/oauth.service');

// const NODE_TYPE_SINGLETON = 'singleton';
// const NODE_TYPE_MASTER = 'master';
// const NODE_TYPE_SLAVE = 'slave';

// const OBJ_SINGLETON = { nodeType: NODE_TYPE_SINGLETON };

// const STATE_ACT_DELETE = 'delete';
// const STATE_ACT_ADD = 'add';
// const STATE_ACT_NONE = 'none';

// class ClusterState {
//     constructor(config){
//         this.resetData();
//         this.config = config;
//         this.action = STATE_ACT_NONE;
//     }

//     resetData(){
//         this.data = {
//             masterOrigin:'',
//             authToken:'',
//             nodeType:''
//         }
//     }

//     setData(data){
//         this.data = Object.assign(this.data, data);
//     }

//     setAction(action){
//         this.action = action;
//     }

//     getData(){
//         const dt = Object.assign(dt, this.data);
//         return dt;
//     }

//     getConfig(){
//         return this.config;
//     }

//     getAction(){
//         return String(this.action);
//     }

//     getAuthtoken(){
//         if (this.action === STATE_ACT_ADD && this.data && this.data.authToken && this.data.authToken.length > 0 ) {
//             return this.data.authToken;
//         } else if (this.action === STATE_ACT_NONE && this.config && this.config.authToken){
//             return this.config.authToken;
//         }
//         return null;
//     }

    // getNodeType(){
    //     if (this.action === STATE_ACT_ADD && this.data && this.data.nodeType && this.data.nodeType.length > 0 ) {
    //         return {
    //             nodeType: String(this.data.nodeType),
    //             masterOrigin: String(this.data.masterOrigin)
    //         };
    //     } else if (this.action === STATE_ACT_NONE && this.config && this.config.nodeType){
    //         const result = {
    //             nodeType: this.config.nodeType
    //         };
    //         if (this.config.masterOrigin){
    //             result['masterOrigin'] = this.config.masterOrigin;
    //         }
    //         return result;
    //     }
    //     return OBJ_SINGLETON;
    // }

    // deprecated
    // getNodeInfo(){
    //     const result = this.getNodeType();
    //     if (this.action === STATE_ACT_ADD) {
    //         result['restartRequired'] = true;
    //     }
    //     return result;
    // }

// }

class ClusterController {

    constructor(context){
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        // this.configDataService = new ConfigDataService(context);
        // this.serverRuntimeService = new ServerRuntimeService(context);
        // this.userState = {};
        // this.clusterState = new ClusterState(this.context.plugin.server.config.user.bzwCluster);
    }

    printContext() {
        this.logger.info(JSON.stringify(this.context));
    }

    /**
     * Gettor of the router
     */
    getRouter() {
        return this.router;
    };

    setupRouter() {
        const logger = this.logger;
        const router = this.router;
        // const context = this.context;
       
        logger.info('Setup session mode router');

        //router.use(cors());
        router.use(express.json({type:'application/json'}));

        /**
         * Request:     Healthcheck api. This should be kept in case it's in use to check whether server is up.
         * Description: Simply response a fixed text.
         * Authorize:   Any user???
         */
        router.get('/healthcheck', (req,res) => {
            res.status(200).send('Cluster api works!');
        });
        
        // router.get('/nodeType', (req, res) => {
        //     const nodeType = this.clusterState.getNodeType();
        //     res.send(nodeType);
        //     this.logger.info(`Get node type successful`);
        //     this.logger.debug(`Get node type: ${JSON.stringify(nodeType)}`);
        // });

        // deprecated
        // router.get('/nodeInfo', (req,res) => {
        //     const masterOrigin = req.query.masterOrigin;
        //     if (!masterOrigin || typeof(masterOrigin) !== 'string'){
        //         this.logger.severe(`Get node info failed: Bad request, incorrect primaryOrigin.`);
        //         res.status(400).send({status: false, message: 'Bad Request - incorrect primaryOrigin'});
        //         return;
        //     }

        //     const nodeInfo = this.clusterState.getNodeInfo();
        //     if (nodeInfo && nodeInfo.masterOrigin && masterOrigin !== nodeInfo.masterOrigin){
        //         this.logger.severe(`Get node info failed: Bad request, primaryOrigin mismatch.`);
        //         res.status(400).send({status: false, message: 'Bad Request - primaryOrigin mismatch'});
        //         return;
        //     }

        //     this.logger.log(this.logger.FINE, 'Get node info success.');
        //     res.status(200).send(nodeInfo);
        // });

        // deprecated
        // Authorization Check, this is to validate the auth when HTTP requests are sent across primary and secondary nodes.
        // router.use((req,res,next) => {
        //     let token = this.clusterState.getAuthtoken();
        //     token = token? token: oAuth.getDefaultToken();

        //     if (oAuth.verifyBearerHeader(req, token)) {
        //         next();
        //     }else{
        //         this.logger.severe('Unauthorized');
        //         res.status(500).send('Unauthorized');
        //     }
        // });

        // deprecated
        // router.post('/deleteUserState', (req,res) => {
        //     const username = req.headers.username;
        //     if (username){
        //         if (this.userState[username]){
        //             delete this.userState[username];
        //             res.status(200).send({status: true, message: 'User state deleted'});
        //         }else{
        //             res.status(200).send({status: false, message: 'User has no state'});
        //         }
        //     }else{
        //         res.status(500).send({status: false, message: 'No username in request'});
        //     }
        // });

        // router.post('/verifyUserState', (req,res) => {
        //     let sessionLifeTime = 3600000; // Session keeps 1 hour by default. it can be changed by zluxserver.json
        //     if (context.plugin.server.config.user.sessionLifeTime && typeof(context.plugin.server.config.user.sessionLifeTime) === 'number') {
        //         sessionLifeTime = context.plugin.server.config.user.sessionLifeTime;
        //     }
        //     let username = req.headers.username;
        //     if (username){
        //         username = username.toLowerCase();
        //         if (this.userState[username]){
        //             const ts = this.userState[username].timestamp;
        //             if ( ts && (ts + sessionLifeTime) > Date.now()){
        //                 this.userState[username]={timestamp: Date.now()};
        //                 this.logger.log(this.logger.FINE, `User ${username} has valid state`);
        //                 return res.status(200).send({status: true, message: 'User state validate'});
        //             }
        //             res.status(200).send({status: false, message: 'User state timeout.'});
        //             delete this.userState[username];
        //         }else{
        //             this.logger.warn(`User ${username} has valid state`);
        //             res.status(200).send({status: false, message: 'User has no state'});
        //         }
        //     }else{
        //         res.status(500).send({status: false, message: 'No username in request'});
        //     }
        // });

        // router.post('/recordUserState', (req,res) => {
        //     const username = req.headers.username;
        //     if (username){
        //         this.userState[username]={timestamp: Date.now()}
        //         this.logger.warn(`User ${username} login cluster successful`);
        //         res.status(200).send({status: true, message: 'User state recorded.'});
        //     }else{
        //         res.status(500).send({status: false, message: 'No username in request'});
        //     }
        // });

        // router.post('/initSlave', async (req,res) => {
        //     // const that = this;
        //     let message = '';
        //     try{
        //         const masterOrigin = req.body.masterOrigin;
        //         if (!masterOrigin || typeof(masterOrigin) !== 'string'){
        //             this.logger.severe(`Init secondary node failed: Bad request, incorrect primaryOrigin.`);
        //             res.status(400).send({status: false, message: 'Bad Request'});
        //             return;
        //         }
        //         if ( this.isInCluster() ) {
        //             message = 'Target node is already in cluster';
        //             this.logger.severe(`Init secondary node failed: ${message}`);
        //             res.status(500).send({status: false, message: message});
        //             return;
        //         }
        //         const resultConfig = await this.updateServerMode('cluster', 'config.json');
        //         if (!resultConfig || !resultConfig.status){
        //             message = (resultConfig && resultConfig.message) ? resultConfig.message : 'Unknown Internal Error';
        //             this.logger.severe(`Secondary node initiation failed: ${message}`);
        //             res.status(500).send({status: false, message: message});
        //             return;
        //         }
        //         const resultWinServer = await this.updateServerMode('cluster', 'windowServer.json');
        //         if (!resultWinServer || !resultWinServer.status){
        //             message = (resultWinServer && resultWinServer.message) ? resultWinServer.message : 'Unknown Internal Error';
        //             this.logger.severe(`Secondary node initiation failed: ${message}`);
        //             res.status(500).send({status: false, message: message});
        //             return;
        //         }
        //         const resultZluxServer = await this.updateZluxServerSlave(req, 'init');
        //         if (!resultZluxServer || !resultZluxServer.status){
        //             message = (resultZluxServer && resultZluxServer.message) ? resultZluxServer.message : 'Unknown Internal Error';
        //             this.logger.severe(`Secondary node initiation failed: ${message}`);
        //             await this.updateServerMode('fork', 'windowServer.json');
        //             await this.updateServerMode('fork', 'config.json');
        //             res.status(500).send({status: false, message: message});
        //             return;
        //         }
        //         message = 'Secondary node initiation complete';
        //         this.logger.info(message);
        //         this.logger.warn('Secondary node needs a restart');
        //         this.clusterState.setAction(STATE_ACT_ADD);
        //         this.clusterState.setData(req.body);
        //         this.clusterState.setData({nodeType: NODE_TYPE_SLAVE});
        //         res.status(200).send({status: true, message: message});
        //         // this.serverRuntimeService.shutDown();
        //     }catch (err){
        //         message = err.stack?err.stack:err.message;
        //         this.logger.severe(`Secondary node initiation failed: ${message}`);
        //         res.status(500).send({status: false, message: message});
        //     }
        // });

        
        // router.post('/removeSlave', async (req,res) => {
        //     // const that = this;
        //     try{
        //         const masterOrigin = req.body.masterOrigin;
        //         let message = '';
    
        //         if (!masterOrigin || typeof(masterOrigin) !== 'string'){
        //             this.logger.severe(`Remove secondary node failed: Bad request, incorrect primaryOrigin.`);
        //             res.status(400).send({status: false, message: 'Bad Request'});
        //             return;
        //         }
    
        //         const nodeInfo = this.clusterState.getNodeInfo();
        //         if (nodeInfo && (nodeInfo.nodeType !== NODE_TYPE_SLAVE )){
        //             message = 'Target node is not a secondary node';
        //                 this.logger.severe(`Remove secondary node failed: ${message}`);
        //                 res.status(500).send({status: false, message: message});
        //                 return;
        //             }
        //         if (nodeInfo && nodeInfo.masterOrigin && masterOrigin !== nodeInfo.masterOrigin){
        //             message = 'Target node is in another cluster';
        //             this.logger.severe(`Remove secondary node failed: ${message}`);
        //             res.status(500).send({status: false, message: message});
        //             return;
        //         }

        //         const resultConfig = await this.updateServerMode('fork', 'config.json');
        //         if (!resultConfig || !resultConfig.status){
        //             message = (resultConfig && resultConfig.message) ? resultConfig.message : 'Unknown Internal Error';
        //             this.logger.severe(`Secondary node remove failed: ${message}`);
        //             res.status(500).send({status: false, message: message});
        //             return;
        //         }
        //         const resultWinServer = await this.updateServerMode('fork', 'windowServer.json');
        //         if (!resultWinServer || !resultWinServer.status){
        //             message = (resultWinServer && resultWinServer.message) ? resultWinServer.message : 'Unknown Internal Error';
        //             this.logger.severe(`Secondary node remove failed: ${message}`);
        //             res.status(500).send({status: false, message: message});
        //             return;
        //         }
        //         const resultZluxServer = await this.updateZluxServerSlave(req, 'remove');
        //         if (!resultZluxServer || !resultZluxServer.status){
        //             message = (resultZluxServer && resultZluxServer.message) ? resultZluxServer.message : 'Unknown Internal Error';
        //             this.logger.severe(`Secondary node remove failed: ${message}`);
        //             await this.updateServerMode('cluster', 'windowServer.json');
        //             await this.updateServerMode('cluster', 'config.json');
        //             res.status(500).send({status: false, message: message});
        //             return;
        //         }
        //         this.clusterState.setAction(STATE_ACT_DELETE);
        //         this.clusterState.resetData();
        //         message = 'Secondary node remove complete';
        //         this.logger.info(message);
        //         res.status(200).send({status: true, message: message});
        //         this.serverRuntimeService.shutDown();
        //     }catch (err){
        //         message = err.stack?err.stack:err.message;
        //         this.logger.severe(`Secondary node remove failed: ${message}`);
        //         res.status(500).send({status: false, message: message});
        //     }
        // });


        // router.post('/syncLogLevel', (req,res) => {
        //     const that = this;
        //     const instancePath = context.plugin.server.config.user.instanceDir;
        //     const masterOrigin = req.body.masterOrigin;
        //     const logLevels = req.body.logLevels;
        //     if (typeof(logLevels) != 'number' || !masterOrigin || typeof(masterOrigin) !== 'string'){
        //         that.logger.severe(`Sync log level failed: Bad request, incorrect logLevels.`);
        //         res.status(400).send({status: false, message: 'Bad Request'});
        //         return;
        //     }

        //     const option = {
        //         path: path.join(instancePath, this.configDataService.getServerConfigFilePath()),
        //         data: this.configDataService.setLogLevelData(logLevels, context)
        //     }
        //     this.configDataService.updateConfigFile(option).then((result) => {
        //         if (result && result.status){
        //             that.serverRuntimeService.setLogLevel(logLevelData);
        //             that.logger.info('Server log level updated to: '+logLevels);
        //             that.logger.log(that.logger.SEVERE, 'You will see logs on SEVERE level');
        //             that.logger.log(that.logger.WARNING, 'You will see logs on WARNING level');
        //             that.logger.log(that.logger.INFO, 'You will see logs on INFO level');
        //             that.logger.log(that.logger.FINE, 'You will see logs on FINE level');
        //             that.logger.log(that.logger.FINER, 'You will see logs on FINER level');
        //             that.logger.log(that.logger.FINEST, 'You will see logs on FINEST level');
        //             res.status(200).send({status: true, message: 'Log level update complete'});
        //         }else{
        //             let message = (result && result.message) ? result.message : 'Unknown Internal Error';
        //             that.logger.severe(`Sync log level failed: ${message}`);
        //             res.status(500).send({status: false, message: message});
        //         }
        //         return;
        //     });
        // });
    }

    // isInCluster(){
    //     const nodeInfo = this.clusterState.getNodeInfo();
    //     return nodeInfo && (nodeInfo.nodeType === NODE_TYPE_SLAVE || nodeInfo.nodeType === NODE_TYPE_MASTER);
    // }
    
    // deprecated
    // updateZluxServerSlave(req, action){ //action is 'init' or 'remove'
    //     return new Promise((resolve, reject) => {
    //         const masterOrigin = req.body.masterOrigin;
    //         const context = this.context;
    //         const authToken = req.body.authToken && typeof (req.body.authToken) === 'string' ? req.body.authToken : oAuth.getDefaultToken();
    //         const instancePath = context.plugin.server.config.user.instanceDir;

    //         let targetAuth; 
    //         let option; 
    //         if (action === 'init'){
    //             targetAuth = {
    //                 defaultAuthentication:'fallback',
    //                 implementationDefaults: {fallback: {plugins: ['com.rs.slaveAuth']}},
    //                 isAnonymousAccessAllowed: false,
    //                 twoFactorAuthentication: {defaultType: 'duo', duo: {config: {api_hostname: '', ikey: '', skey: ''}}, enabled: false}
    //             };
    //             option = {
    //                 path: path.join(instancePath, this.configDataService.getServerConfigFilePath()),
    //                 data: {dataserviceAuthentication:targetAuth, enableUserResourceCaching: false, bzwCluster:{nodeType: NODE_TYPE_SLAVE, masterOrigin: masterOrigin, authToken: authToken}}
    //             }
    //         }else if (action === 'remove'){
    //             targetAuth = {
    //                 defaultAuthentication:'fallback',
    //                 implementationDefaults: {fallback: {plugins: ['com.rs.internalAuth']}},
    //                 isAnonymousAccessAllowed: false,
    //                 twoFactorAuthentication: {defaultType: 'duo', duo: {config: {api_hostname: '', ikey: '', skey: ''}}, enabled: false}
    //             };
    //             option = {
    //                 path: path.join(instancePath, this.configDataService.getServerConfigFilePath()),
    //                 data: {dataserviceAuthentication:targetAuth, enableUserResourceCaching: true, bzwCluster:{nodeType: NODE_TYPE_SINGLETON}}
    //             }
    //         }

    //         const logLevels = req.body.logLevels;
    
    //         if (typeof(logLevels) == 'number') {
    //             Object.assign(option.data, this.configDataService.setLogLevelData(logLevels, context));
    //         }
    
    //         this.logger.warn('Changing authentication method for secondary node ' + action);
    //         this.configDataService.updateConfigFile(option).then((result) => {
    //             if (result && result.status){
    //                 resolve({status: true, message: 'update zluxserver.json succeed'});
    //             }else{
    //                 reject({status: false, message: result.message? result.message: 'Unknown Error'});
    //             }
    //         }, (err) => {
    //             reject({status: false, message: err.stack? err.stack : err.message});
    //         });
    //     });
    // }
    
    // deprecated
    // updateServerMode(mode, file){ //file = windowServer.json or , mode = cluster or fork
    //     return new Promise((resolve, reject) => {
    //         const context = this.context;
    //         const instanceDir = context.plugin.server.config.user.instanceDir;
    //         const option = {
    //             path: path.join(instanceDir, `../../lib/server/${file}`),
    //         }
    //         this.logger.warn(`Server mode will be changed to ${mode} in config file ${file}`);
    //         this.configDataService.readConfigFile(option).then( result => {
    //             if (result && result.status && result.data) {
    //                 if (!result.data['apps'] || !result.data['apps'][0]){
    //                     reject({status: false, message: 'Bad data format in config file'});
    //                 }
    //                 result.data['apps'][0]['exec_mode'] = mode;
    //                 result.data['apps'][0]['instances'] = (mode === 'cluster'? '-2': 1); 
    //                 if (file === 'config.json'){
    //                     result.data['apps'][0]['name'] = result.data['apps'][0]['name'] + 'a';
    //                 }
    //                 option['data'] = result.data;
    //                 this.configDataService.writeConfigFile(option).then( result => {
    //                     if (result && result.status ){
    //                         resolve({status: true, message: 'Write PM2 config suceed'});
    //                     }else{
    //                         reject({status: false, message: result.message? result.message: 'Write PM2 config failed'});
    //                     }
    //                 }, err => {
    //                     reject({status: false, message: err.stack? err.stack: err.message});
    //                 });
    //             }else{
    //                 reject({status: false, message: result.message? result.message: 'read PM2 config failed'});
    //             }

    //         }, (err=>{
    //                 reject({status: false, message: err.stack? err.stack: err.message});
    //         }));
    //     });
    // }
}


exports.clusterRouter = (context) => {
    return new Promise (function (resolve,reject) {
      let controller = new ClusterController(context);
      controller.setupRouter();
      resolve(controller.getRouter()); 
    });
  };