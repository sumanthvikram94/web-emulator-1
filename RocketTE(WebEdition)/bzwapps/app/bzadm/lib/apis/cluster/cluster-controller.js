'use strict';

/**
 * Name:      session-mode-controller.js
 * Desc:      Provide api to return the sessionMode related configurations
 * Copyright: © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */

const express = require('express');
const Promise = require('bluebird');
const path = require('path');
const child_process = require('child_process');
// const bodyParser = require('body-parser');
const fs = require('fs-extra');
// const request = require('request');
// const path = require('path');
// const handleSync = require('../handleSync.service');
// const BASE_PATH = '/ZLUX/pluginStorage/com.rs.bzadm';
// const PARENT_PATH = '/ZLUX/pluginStorage/com.rs.bzadm/configurations';
const CLUSTER_PATH = '/ZLUX/pluginStorage/com.rs.bzadm/configurations/cluster_slave.json';
// const InternalDataSteward = require('../../services/internal-data-steward.service');
// const InternalDataSteward = require('../../../../bzshared/lib/services/internal-data-steward.service');
// const DataEntities = require('../../services/data-entities.config');
// const oAuth = require('../../../../bzshared/lib/services/oauth.service');
const ServerRuntimeService = require('../../../../bzshared/lib/services/server-runtime.service');
// const ClusterRequestService = require('../../../../bzshared/lib/services/cluster-request.service');

// const ConfigDataService = require('../../../../bzshared/lib/services/config-data.service');
const bzdb = require('../../../../bzshared/lib/services/bzdb.service');
const Security = require('../../../../bzshared/lib/services/security.service')
const reportSrc = require('../../../../bzshared/lib/apis/user-report/user-report-service');


// const connPool = require('../../../../bzshared/lib/dist/connection-pool');

// const uuidv4 = require('uuid/v4');

class ClusterRouter {

    constructor(context){
        // this.dataSteward = InternalDataSteward.initWithContext(context);
		// this.dataSteward.manage(DataEntities.cluster);
        this.reportSrc = reportSrc;
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        const user = this.context.plugin.server.config.user;
        this.instanceDir = user.instanceDir;
        this.bzw2hMode = user.bzw2hMode || false;
        this.serverRuntime = new ServerRuntimeService(context);
        const isWin = (process.platform.indexOf('win')!=-1);
        // this.clusterReqService = new ClusterRequestService(context);
        // this.configDataService = new ConfigDataService(context);
        // this.clusterReqService.updatePeers(); //For cluster, should add protocol, port, hostname into peer.json.
        // this.connPool = connPool;
        bzdb.waitLoadReady().then(async () => {
            // await this.clusterReqService.updatePeers();   //For cluster, should add protocol, port, hostname into peer.json.
            if(!this.bzw2hMode) {
                bzdb.registerCommand('resetPeerRotate', this.reportSrc.updateConfig.bind(this.reportSrc));
                bzdb.registerCommand('updatePeerD14Sample', this.reportSrc.updateD14Sample.bind(this.reportSrc));
            }
            { // BZ-21520, wdm also need this feature
                bzdb.onEvent('data conflict',(param) => {
                    child_process.exec( `${isWin ? 'dataConflictHook.bat': './dataConflictHook.sh' }  "${param.message}" "${param.detail}" "${param.type}" "${param.remotePeerId||'null'}" "${param.localPeerId||'null'}" "${param.localIP||'null'}" "${param.serverName||'null'}" "${param.dataEntity||'null'}" "${param.peerLastBlockTime||'null'}" "${param.localLastBlockTime||'null'}" "${param.localLastBlockDateTime||'null'}" "${param.peerLastBlockDateTime||'null'}"`, {cwd:path.join(this.instanceDir,'/ZLUX/serverConfig')},function (err, stdout, stderr) {
                        try{
                            if (err) {
                                console.error(`error occured when executing bash/command, error is : ${err}`);
                                return;
                            }
                            if(stderr){
                                console.error(`error occured when executing bash/command, stderr is : ${stderr}`);
                                return;
                            }
                            console.log(`execute bash/command successful! ${stdout}`);
                        }catch(e){}
                    });
                });
            }
        })
        this.refershTimestamp=0;
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

    getPath() {
        return this.instanceDir + CLUSTER_PATH;
    }

    createDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
    }


    getClusterRouterRouter() {
        // const logger = this.logger;
        const router = this.router;

        router.use(express.json({type:'application/json'}));

        /**
         * force pull
         */
        router.post('/peers/pull', async (req, res) => {
            const id = req.body.id;
            const peer = await bzdb.select('meta_peers', {id});

            if(peer.data.length === 0) {
                res.status(500).send({
                    status: false,
                    message: 'The target node metadata is invalid, please check it.'
                });
                this.logger.warn('The target node metadata is invalid, please check it.');
                return;
            }

            const peerInfo = peer.data[0];

            bzdb.forcePullData(peerInfo.id).then(result => {
                if(result.status) {
                    return res.status(200).send({
                        status: result.status, 
                        message: `Successfully force full data for peer node: "${peerInfo.id}"`
                    });
                } else {
                    return res.status(200).send({
                        status: result.status, 
                        message: `Failed to force full data for peer node: "${ result.message || ''}"`
                    });
                }
               
            }).catch(err => {
                return res.status(500).json({status: false,  message: `${err && err.message || 'Exception occurs'}`, id: id});
            })
        });

        router.post('/peers/push', async (req, res) => {
            const id = req.body.id;
            const peer = await bzdb.select('meta_peers', {id});

            if(peer.data.length === 0) {
                res.status(500).send({
                    status: false,
                    message: 'The target node metadata is invalid, please check it.'
                });
                this.logger.warn('The target node metadata is invalid, please check it.');
                return;
            }
            try{
                await bzdb.resolvePeers(id);
                return res.status(200).send({
                    status: true, 
                    message: `Successfully force push data from peer node: "${id}"`
                });
            }catch (e){
                return res.status(500).send({
                    status: false, 
                    message: `Failed to force push data from peer node: "${id}" error message:"${ e.message || ''}"`
                });
            }
        });
        
        /**
         * Restart a peer
         */
        router.post('/peers/restart', async (req, res) => {
            const id = req.body.id;
            const peer = await bzdb.select('meta_peers', {id});

            if(peer.rowCount === 0) {
                res.status(500).send({
                    status: false,
                    message: 'The target node metadata is invalid, please check it.'
                });
                this.logger.warn('The target node metadata is invalid, please check it.');
                return;
            }

            const peerInfo = peer.data[0];

            try{
                const result = await bzdb.exec('shutdown',[], peerInfo.id);
                if(result.status) {
                    return res.status(200).send({
                        status: result.status, 
                        message: result.message
                    });
                } else {
                    return res.status(200).send({
                        status: result.status, 
                        message: result.message
                    });
                }
            } catch (e) {
                return res.status(500).json({status: false,  message: `${e && e.message || 'Exception occurs'}`, id: id});
            }
        });

        /**
         * can be called every 5 minuts at a time
         */
        router.post('/refresh', async (req,res) => {
            const dateNow=Date.now();
            if(!this.refershTimestamp || dateNow-this.refershTimestamp>5*60*1000){  //interval is 5 minuts
                this.logger.warn(`verifydb - checkin all nodes`);
                const result = await bzdb.checkinAll(); // no response from checkinAll function
                this.refershTimestamp=dateNow;
                
                return res.status(200).json({status: true, message: 'Refesh done'});
              
            }else{
                return res.status(202).json({status: false,  message: `Do not refresh too frequently; you can refresh it every 5 minutes.`});
            }
        });


        /**
         * Get peers list
         */
        router.get('/peers', async (req, res) => {
            const metaPeers = await bzdb.select('meta_peers');
            const metaNode = await bzdb.select('meta_node');

            if(metaPeers.data.length === 0 || metaNode.data.length === 0) {
                res.status(500).send({
                    status: false,
                    message: 'The target node metadata is invalid, please check it.'
                });
                this.logger.severe('Failed to get meta peers.');
                return;
            }

            const key = metaNode.data[0].id;
            const data = metaPeers.data.filter(d => d.id !== key)
            .map(d => {
                const {id, serverURL, multiaddrs} = d;
                const port = multiaddrs[0]? multiaddrs[0].split('/tcp/')[1]: 'unknown'
                return {id, serverURL, port};
            });
            const peerInfo = metaPeers.data.filter(d => d.id === key)[0];
            this.logger.log(this.logger.FINE, 'Get meta peers success.');
            res.status(200).send({data, peerInfo});

            this.logger.debug(`Get peers data: ${JSON.stringify(data)}`);
        });

        router.get('/hostInfo', async (req, res) => {
            try{
                const hostInfo = await this.serverRuntime.getHostInfo();
                res.status(200).send({status: true, data: hostInfo});
            }catch(err){
                res.status(500).send({status: false, message: err.message});
            }
        });

        /**
         * get the status of peers
         */
        router.get('/peerStatus', async (req, res) => {
            bzdb.checkStatus().then(result => {
                return res.status(200).send(result);
            }).catch(err => {
                return res.status(500).send(err);
            })
        });

        /**
         * deprecated 
         *  */ 
        // router.post('/initSlave', (req, res) => {
        //     let that = this;
        //     const body = req.body;
        //     const url = `${body.protocol}://${body.host}:${body.port}/ZLUX/plugins/com.rs.bzshared/services/cluster/initSlave`;
        //     const authToken = uuidv4();
        //     const slaveData = {
        //         masterOrigin: body.masterOrigin,
        //         authToken: authToken,
        //         logLevels: body.logLevels == undefined ? this.context.plugin.server.config.user.logLevels['_unp.*'] : body.logLevels
        //     };
        //     try {
        //         let requestOption={
        //             url: url,
        //             json: true,
        //             body: slaveData,
        //             headers: {
        //                 Authorization: oAuth.getDefaultTokenBase64()
        //             }
        //         }
        //         requestOption=this.httpsOption(requestOption);
        //         request.post(requestOption, (err, response, body) => {
        //               if (err) {
        //                 res.status(500).send({status: false, message: 'Please make sure the node configuration is correct and the node is up running'});
        //                 that.logger.severe(`Init secondary node failed: ${err.stack}`);
        //                 return
        //               }

        //               // the slave configured both http and https, when add slave with http, the body will be undefined
        //               if (!body) {
        //                 let message = `The node contains both http and https configurations, the protocol must use "https".`
        //                 res.status(500).send({status: false, message: message, protocolError: true});
        //                 that.logger.severe(`Init secondary node failed: ${message}`);
        //                 return
        //               }

        //               let result = Object.assign(body, {authToken: oAuth.getTokenBase64(authToken)});
        //               res.status(response.statusCode).send(result);
        //               if (response.statusCode === 200 && response.status) {
        //                  that.logger.info(`Init secondary node success.`);
        //               } else {
        //                   that.logger.severe(`Init secondary node failed: ${body.message}`);
        //               }
        //               return
        //           });
        //     }
        //     catch(error) {
        //         that.logger.severe(`Init secondary node failed: ${error.stack}`);
        //         res.status(500).send({status: false, message: 'Unknown error occurs'});
        //     }

            
        // });

        /**
         * introduceNode
         */
        router.post('/peer', async (req, res) => {
            const slaveNode = req.body;
            const slaveURL = `${slaveNode.host}`;
            const slaveURLSafe = Security.defendXSS(slaveURL);
            let peerInfo;

            try {
                peerInfo = JSON.parse(slaveNode.peerInfo || '');
            } catch(err) {
                this.logger.severe(`Failed to parse peer metadata: ${err.stack}`);
                return res.status(500).send({
                    status: false,
                    statusError: true,
                    message: `Failed to parse peer metadata: ${err.message}`, 
                    name: slaveURLSafe
                });
            }

            try {
                const metaNode = await bzdb.select('meta_node');

                if(metaNode.rowCount > 0 && metaNode.data[0].id === peerInfo.id) {
                    return res.status(200).send({
                        status: false, 
                        message: `cannot add itself as peer node`, 
                        name: peerInfo.serverURL
                    });
                }

                const result = await bzdb.introduceNode(peerInfo);

                if(result.status && !this.bzw2hMode) {
                    const configs = await bzdb.select('reportConfig');
                    await bzdb.exec('resetPeerRotate', [configs.data[0]], peerInfo.id);
                    await bzdb.exec('updatePeerD14Sample',  peerInfo.id);
                }
               
                if (result.status) {
                    return res.status(200).send({
                        status: result.status, 
                        message: `Successfully added/updated cluster "${slaveURLSafe}"`, 
                        name: slaveURLSafe
                    });
                } else {
                    return res.status(200).send({
                        status: result.status, 
                        message: `Failed added/updated cluster "${slaveURLSafe}"`, 
                        name: slaveURLSafe,
                        message: result.message || ''
                    });
                }
            } catch(err) {
                return res.status(500).send({status: false,  message: `${err && err.message || 'Exception occurs'}`, name: values.name});
            }
        })

        /**
         * kickNode
         */
        router.delete('/:id', async (req, res) => {
            const id = req.params.id;
            const peer = await bzdb.select('meta_peers', {id});

            if(peer.data.length === 0) {
                res.status(500).send({
                    status: false,
                    message: 'The target node metadata is invalid, please check it.'
                });
                this.logger.warn('The target node metadata is invalid, please check it.');
                return;
            }

            const peerInfo = peer.data[0];

            try {
                const result = await bzdb.kickNode(peerInfo);
                if(result.status && !this.bzw2hMode) {
                    await bzdb.exec('updatePeerD14Sample',  peerInfo.id);
                }

                if(result.status) {
                    return res.status(200).send({
                        status: result.status, 
                        message: `Successfully delete peer node: "${peerInfo.id}"`
                    });
                } else {
                    return res.status(200).send({
                        status: result.status, 
                        message: `Failed to delete peer node: "${ result.message || ''}"`
                    });
                }
            }
            catch(err) {
                return res.status(500).json({status: false,  message: `${err && err.message || 'Exception occurs'}`, id: id});
            }

            // bzdb.kickNode(peerInfo).then(result => {
            //     if(result.status) {
            //         return res.status(200).send({
            //             status: result.status, 
            //             message: `Successfully delete peer node: "${peerInfo.id}"`
            //         });
            //     } else {
            //         return res.status(200).send({
            //             status: result.status, 
            //             message: `Failed to delete peer node: "${ result.message || ''}"`
            //         });
            //     }
               
            // }).catch(err => {
            //     return res.status(500).json({status: false,  message: `${err && err.message || 'Exception occurs'}`, id: id});
            // })
        })
       
        router.get('/url', async (req, res) => {
            let url;
            const verifyUrl = this.getReqHost(req);
            const bzwUrl = '/ZLUX/plugins/com.rs.bzw/web/';
            let urlPrefix=this.context.plugin.server.config.user.node.urlPrefix || ''
            if(urlPrefix && urlPrefix.indexOf('/')!==0){
                urlPrefix="/"+urlPrefix;
            }
            try{
                url = await this.getHostUrl(req);
                res.setHeader("Content-Type", "text/typescript");
                res.status(200).json({'text': 'Saved', url: url, protocol: req.protocol, verifyUrl: verifyUrl, bzwUrl: bzwUrl,urlPrefix});
                this.logger.info(`Get cluster url successful: ${url}`);
            }catch (err) {
                this.logger.warn('Failed to get server fullname. Using the url get from request.');
                this.logger.severe(err.stack? err.stack: err.message);
                res.status(500).json({'text': 'Error', status: false, message: err.message});

            }
        });
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

    async getHostUrl(req){
        let url = this.getReqHost(req);
        const protocol = this.getHostProtocol(req);
        let port = this.context.plugin.server.config.user.node[protocol].port;
        try{
            let serverName = this.serverRuntime.getHostName();
            this.logger.debug("getHostUrl::serverName "+serverName)
            const domain = await this.serverRuntime.getHostDomain();
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

    getURL(req) {
        return `${req.protocol}://${req.headers.host}`;
    }

    httpsOption(requestOptions){
        const isHttps=requestOptions.url.toLowerCase().indexOf("https")===0?true:false;
        if(isHttps){
            Object.assign(requestOptions,{"agentOptions":{"rejectUnauthorized":false}});  //todo, use this to https error CERT_HAS_EXPIRED   
        }
        return requestOptions;
    }

    // deprecated
    // changeNodeType(nodeType){
    //     return new Promise((resolve, reject) => {
    //         const option = {
    //             path: path.join(this.context.plugin.server.config.user.instanceDir, this.configDataService.getServerConfigFilePath()),
    //             data: {bzwCluster:{nodeType: nodeType}}
    //         }

    //         // this.context.plugin.server.config.user['bzwCluster']['nodeType'] = nodeType;
    //         global.RUNTIME_VAR_NODE_TYPE = nodeType;
    
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
}


exports.clusterRouter = (context) => {
    return new Promise (function (resolve,reject) {
      let controller = new ClusterRouter(context);
      controller.getClusterRouterRouter();
      resolve(controller.getRouter()); 
    });
  };