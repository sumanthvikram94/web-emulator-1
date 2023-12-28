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
//const cors = require('cors');
const Promise = require('bluebird');
// const bodyParser = require('body-parser');
// const path = require('path');
// const ConfigDataService = require('../../../../bzshared/lib/services/config-data.service');
const ServerRuntimeService = require('../../../../bzshared/lib/services/server-runtime.service');
const oAuth = require('../../../../bzshared/lib/services/oauth.service');
// const clusterState = require('../../services/cluster-state.service');
const bzdb = require('../../../../bzshared/lib/services/bzdb.service');
const authConfigService = require("../../services/authConfigService");
const ReportSv = require('../../dist/report-service');
const portfinder = require('portfinder');

class ClusterController {

    constructor(context){
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        // this.configDataService = new ConfigDataService(context);
        this.serverRuntimeService = new ServerRuntimeService(context);
        this.reportSv = ReportSv;
        // this.userState = {};
        // this.clusterState = clusterState.init(this.context.plugin.server.config.user.bzwCluster);
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
        const context = this.context;
       
        logger.info('Setup session mode router');

        //router.use(cors());
        router.use(express.json({type:'application/json'}));

        /**
         * Request:     Healthcheck for accounts api. 
         * Description: Simply response a fixed text.
         * Authorize:   Any user???
         */
        router.get('/healthcheck', (req,res) => {
            res.status(200).send('Cluster api works!');
        });
        
        /**
         * nodeVersion is still in use on frontend
         */
        router.get('/nodeType', async (req, res) => {
            // const nodeType = this.clusterState.getNodeType();
            // nodeType.nodeVersion = process.versions.node;
            const nodeType = {
                nodeVersion: process.versions.node
            }
            const series = await bzdb.select('meta_config');
            if (series.rowCount > 0) {
                nodeType.seriesNum = Buffer.from(series.data[0].value).toString('base64');
            }
            nodeType.autoScaleMode = process.env.RTEW_CLUSTER_AUTO_SCALING_ENABLED === 'true' && process.env.RTEW_CLUSTER_ENABLED !== 'false';
            res.send(nodeType);
            this.logger.info(`Get node type successful`);
            this.logger.debug(`Get node type: ${JSON.stringify(nodeType)}`);
        });

        /**
         * Used by about panel of UI
         */
        router.get('/nodeURL', async (req, res) => {
            let url;
            const verifyUrl = this.getReqHost(req);
            const bzwUrl = '/ZLUX/plugins/com.rs.bzw/web/';
            try{
                url = await this.getHostUrl(req);
                res.setHeader("Content-Type", "text/typescript");
                res.status(200).json({'text': 'Saved', url: url, protocol: req.protocol, verifyUrl: verifyUrl, bzwUrl: bzwUrl});
                this.logger.info(`Get cluster url successful: ${url}`);
            }catch (err) {
                this.logger.warn('Failed to get server fullname. Using the url get from request.');
                this.logger.severe(err.stack? err.stack: err.message);
                res.status(500).json({'text': 'Error', status: false, message: err.message});
            }
        });


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

        router.get('/peerInfo', async (req,res) => {
            const metaNode = await this.reportSv.select('meta_peers');

            if(metaNode.data.length > 1) {
                res.status(500).send({
                    status: false,
                    message: 'The target node is already in cluster and can\'t be added.'
                });
                this.logger.warn('The target node is already in cluster and can\'t be added.');
            } else if(metaNode.data.length === 0) {
                res.status(500).send({
                    status: false,
                    message: 'The target node metadata is invalid, please check it.'
                });
                this.logger.warn('The target node metadata is invalid, please check it.');
            } else {
                res.status(200).send({
                    status: true,
                    message: 'current node could use',
                    data: metaNode.data[0]
                });
                this.logger.info('Get peer info successfully')
            }
        })

        //Authorization Check
        router.use((req,res,next) => {
            // let token = this.clusterState.getAuthtoken();
            // token = token? token: oAuth.getDefaultToken();

            // if (oAuth.verifyBearerHeader(req, token) || oAuth.verifyHttpSession(req)) {
            if (oAuth.verifyHttpSession(req)) { // The authentication is only for web UI now
                next();
            }else{
                this.logger.severe('Unauthorized');
                res.status(500).send('Unauthorized');
            }
        });

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

        /**
         * deprecated 
         *  */ 
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
        //         // config.json is not exist if nerver use PM2 to start server (Z/OS or Dev ENV)
        //         // const resultConfig = await this.updateServerMode('cluster', 'config.json');
        //         // if (!resultConfig || !resultConfig.status){
        //         //     message = (resultConfig && resultConfig.message) ? resultConfig.message : 'Unknown Internal Error';
        //         //     this.logger.severe(`Secondary node initiation failed: ${message}`);
        //         //     res.status(500).send({status: false, message: message});
        //         //     return;
        //         // }
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
        //         this.logger.warn('Secondary node server needs a restart');
        //         this.clusterState.setAction(clusterState.action.STATE_ACT_ADD);
        //         this.clusterState.setData(req.body);
        //         this.clusterState.setData({nodeType: clusterState.nodeType.NODE_TYPE_SLAVE});
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
        //     let message = '';
        //     try{
        //         const masterOrigin = req.body.masterOrigin;
    
        //         if (!masterOrigin || typeof(masterOrigin) !== 'string'){
        //             this.logger.severe(`Remove secondary node failed: Bad request, incorrect primaryOrigin.`);
        //             res.status(400).send({status: false, message: 'Bad Request'});
        //             return;
        //         }
    
        //         const nodeInfo = this.clusterState.getNodeInfo();
        //         if (nodeInfo && (nodeInfo.nodeType !== clusterState.nodeType.NODE_TYPE_SLAVE )){
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
        //         // file  config.json will refesh after run 'nodeServer'
        //         // const resultConfig = await this.updateServerMode('fork', 'config.json');
        //         // if (!resultConfig || !resultConfig.status){
        //         //     message = (resultConfig && resultConfig.message) ? resultConfig.message : 'Unknown Internal Error';
        //         //     this.logger.severe(`Secondary node remove failed: ${message}`);
        //         //     res.status(500).send({status: false, message: message});
        //         //     return;
        //         // }
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
        //         this.clusterState.setAction(clusterState.action.STATE_ACT_DELETE);
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

        router.post('/reboot', async(req, res) => {
            const zluxContent=await authConfigService.getFileContent('zlux');
            const nodeRunning=this.context.plugin.server.config.user.node;
            let preChecked=true;
            if(zluxContent){
                const httpPort = zluxContent.node.http ? zluxContent.node.http.port : null
                const httpsPort = zluxContent.node.https ? zluxContent.node.https.port :null
                const httpPortRunning=nodeRunning.http?nodeRunning.http.port:null
                const httpsPortRunning=nodeRunning.https?nodeRunning.https.port:null
                if (httpPort && httpPortRunning!=httpPort && httpsPortRunning!=httpPort) {
                    try{
                        await portfinder.getPortPromise({port:httpPort, stopPort:httpPort});
                        preChecked=true;
                    }catch(err){
                        preChecked=false;
                        this.logger.severe(`HTTP Port: ${httpPort} is occupied, please check it!`);
                    }
                }
                if (httpsPort && httpsPortRunning!=httpsPort && httpPortRunning!=httpsPort) {
                    try{
                        await portfinder.getPortPromise({port:httpsPort, stopPort:httpsPort});
                        preChecked=true;
                    }catch(err){
                        preChecked=false;
                        this.logger.severe(`HTTPS Port: ${httpsPort} is occupied, please check it!`);
                    }
                }
            }
            if(preChecked){
                res.status(200).json({message: 'Server reboot request received.'});
                // shutdown on next tick, this provides chance to finish the events that are already running.
                process.nextTick(() => {
                    this.serverRuntimeService.shutDown();
                });
            }else{
                res.status(500).send({type:'NotFreePort',error:'Restart failed, HTTP port or HTTPS port is not free, please check!'});
            }

        });

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

    // isInCluster(){
    //     const nodeInfo = this.clusterState.getNodeInfo();
    //     return nodeInfo && (nodeInfo.nodeType === clusterState.nodeType.NODE_TYPE_SLAVE || nodeInfo.nodeType === clusterState.nodeType.NODE_TYPE_MASTER);
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
    //                 data: {dataserviceAuthentication:targetAuth, enableUserResourceCaching: false, bzwCluster:{nodeType: clusterState.nodeType.NODE_TYPE_SLAVE, masterOrigin: masterOrigin, authToken: authToken}}
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
    //                 data: {dataserviceAuthentication:targetAuth, enableUserResourceCaching: true, bzwCluster:{nodeType: clusterState.nodeType.NODE_TYPE_SINGLETON}}
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