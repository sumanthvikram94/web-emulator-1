'use strict';

/**
 * Name:      session-mode-controller.js
 * Desc:      Provide api to return the sessionMode related configurations
 * Author:    Jerry (Jian Gao)
 * Create DT: 2018-11-16
 * Copyright: © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */

const express = require('express');
//const cors = require('cors');
const Promise = require('bluebird');
// const bodyParser = require('body-parser');
// const DataEntities = require('../../model/data-entities.config');
const ClusterRequestService = require('../../services/cluster-request.service');
const zoweService = require('../../services/zowe.service');
const configjs_bzw_url = '/ZLUX/plugins/' + zoweService.configJsName 
                     + '/services/data' + zoweService.defaltAPIVersion + '/com.rs.bzw';
const configjs_bzshared_url = '/ZLUX/plugins/' + zoweService.configJsName 
                     + '/services/data' + zoweService.defaltAPIVersion + '/com.rs.bzshared';
const oauth = require('../../services/oauth.service');
// const ResourcePool = require('../../services/resource-pool.service');
const bzdb = require('../../services/bzdb.service');
const userSrc = require('./user-resource-service');
const reportSrc = require('../user-report/user-report-service');
const Utils = require('../../services/utils.service');
const errorHandler = require('../../services/error.service.js');
const Security = require('../../services/security.service');
const constants = require('../../services/constants.service');

const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const BASE_PATH = path.join(process.cwd(), '../');

class UserResourceController {

    constructor(context){
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        this.utils = Utils.init(this.logger);
        this.clusterReqService = new ClusterRequestService(context);
        this.serverConfig = context.plugin.server.config;
        this.instanceDir = this.context.plugin.server.config.user.instanceDir;
        this.user = context.plugin.server.config.user;
        this.dataAuthentication = this.user.dataserviceAuthentication;
        this.reportSrc = reportSrc;
        userSrc.setLogger(this.logger);
        userSrc.getDataSource().then((data)=>{
            this.dataSourceConfig=data.dataserviceDataSource;
            this.dataSourceConfig = (!!this.dataSourceConfig) ? this.dataSourceConfig : { "defaultDataSource": 'fallback' };
        });
       
        this.productDir = this.context.plugin.server.config.user.productDir;
        this.cacheEnabled = false;
        // deprecated
        // this.isSlave = false;
        // if (this.serverConfig.user.bzwCluster && this.serverConfig.user.bzwCluster.nodeType === 'slave' && this.serverConfig.user.bzwCluster.masterOrigin){
        //     this.isSlave = true;
        //     this.logger.info('User resource work in secondary node mode');
        // }else 
        if (this.serverConfig.user.enableUserResourceCaching) {
            this.cacheEnabled = true;
            this.logger.info('User resource work in cache mode');
            // this.poolService = new ResourcePool(context);
        }else{
            this.logger.info('User resource work in noCache mode');
        }
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

    setupUserResourceRouter() {
        const logger = this.logger;
        const router = this.router;
        const context = this.context;
        const that = this;
        logger.info('Setup session mode router');

        /**
         * Enable cross site access for cluster solution
         */
        //router.use(cors());
        router.use(express.urlencoded({limit: '50mb', extended: true}));
        router.use(express.json({type:'application/json',limit: '50mb'}));
        // router.use(oauth.defaultOAuthChecker());
        //router.use(bodyParser.json({type:'application/json'}));

        /**
         * redirect the user resource requests on slave node to master node
         */
        // router.use((req, res, next) => { // No need in new cluster solution
        //     this.clusterReqService.redirectSlaveRequest(req, res, next);
        // });

        /**
         * This part is for ZOWE platform only.
         */
        if (zoweService.isOnZowe){
            /**
             * Shares a session to all ZOWE users
             */
            router.get('/shareSession', async (req,res) => {
                try{
                    const userId = req.query.username? req.query.username: req.username;
                    let privateSession = await this.checkParam(req,res); 
                    privateSession.isAdminCreateSession = true;
                    const resultSes = await bzdb.updateOrInsert('sessionShared', privateSession);
                    if (!resultSes.status){
                        this.logger.severe('Operation Failed: <br>' + JSON.stringify(resultSes, null, 2));
                        res.status(500).send('Operation Failed: <br>' + JSON.stringify(resultSes, null, 2)); 
                        return;
                    }
                    // const sym = String.fromCharCode(255);
                    // // Copy the private KB as shared
                    // const privateKeyboard = await bzdb.select('keyboardMappingPrivate', {id: `${userId}${sym}${privateSession.id}_keyboardMapping`});
                    // if (privateKeyboard && privateKeyboard.rowCount && privateKeyboard.rowCount > 0){
                    //     const kbdata = privateKeyboard.data[0];
                    //     const sharedKeyboard = {
                    //         timestamp: Date.now(),
                    //         id: kbdata.id,
                    //         name: kbdata.name || 'uncheck',
                    //         index: -1,
                    //         title: kbdata.name || 'uncheck',
                    //         category: 'keyboard',
                    //         terminalType: privateSession.is3270Session? '3270' : privateSession.isVTSession? 'vt': '5250',
                    //         type: privateSession.is3270Session? '3270' : privateSession.isVTSession? 'vt': '5250',
                    //         keyboardMapping: kbdata.keyboardMapping,
                    //         keyboardOptions: kbdata.keyboardOptions,
                    //         action: 'add',
                    //         description: "",
	                //         keyboardLanguage: kbdata.keyboardLanguage,
                    //         userId: kbdata.userId
                    //     }
                    //     await bzdb.updateOrInsert('keyboardMappingShared', sharedKeyboard);
                    // }
                    // // Copy the private hotspots as shared
                    // const privateHotspots = await bzdb.select('hotspotPrivate', {id: `${userId}${sym}${privateSession.id}_hotspots`});
                    // if (privateHotspots && privateHotspots.rowCount && privateHotspots.rowCount > 0){
                    //     const hsdata = privateHotspots.data[0];
                    //     const sharedHotspots = {
                    //         timestamp: Date.now(),
                    //         id: hsdata.id,
                    //         hotspotDefs: hsdata.hotspotDefs,
                    //         userId: hsdata.userId
                    //     }
                    //     await bzdb.updateOrInsert('hotspotShared', sharedHotspots);
                    // }
                    // // Copy the private launchpad as shared
                    // const privateLaunchpad = await bzdb.select('launchpadPrivate', {id: `${userId}${sym}${privateSession.id}_launchpad`});
                    // if (privateLaunchpad && privateLaunchpad.rowCount && privateLaunchpad.rowCount > 0){
                    //     const lpdata = privateLaunchpad.data[0];
                    //     const sharedLaunchpad = {
                    //         timestamp: Date.now(),
                    //         id: lpdata.id,
                    //         launchpad: lpdata.launchpad,
                    //         userId: lpdata.userId
                    //     }
                    //     await bzdb.updateOrInsert('launchpadShared', sharedLaunchpad);
                    // }
    
                    let defaultGroup = (await bzdb.select('group', {id: 'Default Group'})).data[0];
                    if(!defaultGroup){
                        const groupInfo = (await bzdb.select('defaultGroup')).data[0];
                        if (groupInfo && groupInfo.privileges) {
                            zoweService.grantDefaultPrivileges(groupInfo.privileges); // On ZOWE, the default group has full privileges.
                            await bzdb.updateOrInsert('group', groupInfo);
                            defaultGroup = (await bzdb.select('group', {id: 'Default Group'})).data[0];
                        }
                    }
                    if (defaultGroup && defaultGroup.sessions){
                        defaultGroup.sessions.push(privateSession.id);
                    }
                    const resultGroup = await bzdb.updateOrInsert('group', defaultGroup);
                    if (resultGroup.status) {
                        res.status(200).send('Operation Succeed!');
                        return;
                    } else {
                        this.logger.severe('Operation Failed: <br>' + JSON.stringify(resultGroup, null, 2));
                        res.status(500).send('Operation Failed: <br>' + JSON.stringify(resultGroup, null, 2)); 
                        return;
                    }
                } catch(err) {
                    errorHandler.handleInternalError(err,res,this.logger);
                }
                
            });

            
            /**
             * Unshare a session from ZOWE users
             */
            router.get('/unshareSession', async (req,res) => {
                try {
                    // const userId = req.query.username? req.query.username: req.username;
                    // const sym = String.fromCharCode(255);
                    let privateSession = await this.checkParam(req,res); 
                    const filter = {id: privateSession.id};
                    const recordSet = await bzdb.select('sessionShared', filter);
                    if (recordSet.rowCount === 0){
                        res.status(404).send(`Data not found. <br>The shared session "${Security.defendXSS(req.query.sessionName)}" not exist.`);
                        return;
                    }
                    const resultSes = await bzdb.delete('sessionShared', filter);
                    if (!resultSes.status){
                        this.logger.severe('Operation Failed: <br>' + JSON.stringify(resultSes, null, 2));
                        res.status(500).send('Operation Failed: <br>' + JSON.stringify(resultSes, null, 2)); 
                        return;
                    }
                    // await bzdb.delete('keyboardMappingShared', {id:`${userId}${sym}${privateSession.id}_keyboardMapping`});
                    // await bzdb.delete('hotspotShared', {id:`${userId}${sym}${privateSession.id}_hotspots`});
                    // await bzdb.delete('launchpadShared', {id:`${userId}${sym}${privateSession.id}_launchpad`});
                    const defaultGroup = (await bzdb.select('group', {id: 'Default Group'})).data[0];
                    if (defaultGroup && defaultGroup.sessions){
                        const idx = defaultGroup.sessions.indexOf(privateSession.id);
                        if (idx > -1){
                            defaultGroup.sessions.splice(idx, 1);
                            const resultGroup = await bzdb.updateOrInsert('group', defaultGroup);
                            if (resultGroup.status) {
                                res.status(200).send('Operation Succeed!');
                                return;
                            } else {
                                this.logger.severe('Operation Failed: <br>' + JSON.stringify(resultGroup, null, 2));
                                res.status(500).send('Operation Failed: <br>' + JSON.stringify(resultGroup, null, 2)); 
                                return;
                            }
                        }
                    }
                    res.status(200).send('Operation Succeed!');
                } catch(err) {
                    errorHandler.handleInternalError(err,res,this.logger);
                }
               
            });
        };

        /**
         * get shared session
         */
        router.get('/sessionShared', (req,res) => {
            this.getUserResource('sessionShared', res);
        });

        // Not in use
        // router.get('/sessionPrivate', (req,res) => {
        //     if (!this.cacheEnabled){
        //         res.status(500).send('This API is only available in enableUserResourceCaching mode');
        //         return;
        //     }
        //     let userName = req.headers.username;
        //     if(userName){userName=encodeURIComponent(userName.toLowerCase());}
        //     this.poolService.sessionsProcess('RETRIEVE_KEY', DataEntities.sessionsPrivate.name, userName).then( (result) => {
        //         if (result && result.data){
        //             res.status(200).send(JSON.stringify(result.data));
        //         }else{
        //             res.status(200).send('No data found');
        //         }
        //         return;
        //     });
        // });

        /**
         * get shared and private sessions
         */
        router.get('/sessions', async (req,res) => {
            try {
                const username = req.headers.username.toLowerCase();
                const filterPrivate = {};
                const filterShared = {};
                let name = req.query.name; // Incase name is provided, it only check the existance of the data
                if (name){
                    filterPrivate['id'] = name;
                    filterShared['id'] = name;
                } else {
                    filterPrivate.userId = username;
                }
                const ports = userSrc.getDefaultPort(this.context);
                const extensions = userSrc.getDefaultExtension(this.context);
                const headers = userSrc.getFTPHeader(this.context);
                bzdb.select('sessionPrivate', filterPrivate).then(async (result) => {
                    const resPriv = result;
                    // await userSrc._decryptFTP(resPriv);
                    for await (let d of resPriv.data) {
                        if(!d.id) {
                            d.id = d.id || (d.name + new Date().getTime());
                        }
                        let decryptionObj = this.getPasswordObj(d);
                        if (decryptionObj && decryptionObj.data) {
                            await userSrc._decryptPasswordFiled(decryptionObj.data, decryptionObj.field);
                        }
                    }

                    if (name && result.rowCount > 0){
                        res.status(200).send('{"status":true}');
                        return;
                    }

                    const gs = await bzdb.select('groupSession');

                    bzdb.select('sessionShared', filterShared).then(async (result) => {
                        const resShar = result;
                        
                        //await userSrc._decryptFTP(resShar);
                        for await (let d of resShar.data) {
                            let decryptionObj = this.getPasswordObj(d);
                            if (decryptionObj && decryptionObj.data) {
                                await userSrc._decryptPasswordFiled(decryptionObj.data, decryptionObj.field);
                            }
                            const groupSessions = (gs.data.find(g => g.id === d.id) || {}).gids;

                            d.candGroup = Array.isArray(groupSessions) ? groupSessions[0] : ''; // whether is group session, just a flag which used to mark group session in RTE web.
                        }

                        if (name){
                            if (result.rowCount > 0){
                                res.status(200).send('{"status":true}');
                            }else{
                                res.status(200).send('{"status":false, "message":"data not found"}');
                            }
                            return;
                        }else{
                            res.status(200).send(JSON.stringify({'shared': resShar, 'private': resPriv, 'defaultPorts': ports, 'defaultHeaders': headers, 'defaultExtensions': extensions.extension || []}));
                        }
                        return;
                    });
                }).catch(err => {
                    errorHandler.handleInternalError(err,res,this.logger);
                });
            } catch(err) {
                errorHandler.handleInternalError(err,res,this.logger);
            }
        });

        /**
         * delete private session
         */
        router.delete('/sessionPrivate', (req,res) => {
            this.deleteUserResource('sessionPrivate', req, res, true);
        });

        /**
         * delete shared session
         */
        router.delete('/sessionShared', (req,res) => {
            this.deleteUserResource('sessionShared', req, res);
        });

        /**
         * update or insert private session
         */
        router.put('/sessionPrivate', async (req,res) => {
            this.logger.log(this.logger.FINEST, req);
            this.putUserResource('sessionPrivate', req, res, true);
        });
        
        /**
         * update or insert shared session
         */
        router.put('/sessionShared', async (req,res) => {
            this.logger.log(this.logger.FINEST, req);
            this.putUserResource('sessionShared', req, res);
        });

        // Not in use
        // router.get('/keyboardMappingShared', (req,res) => {
        //     if (!this.cacheEnabled){
        //         res.status(500).send('This API is only available in enableUserResourceCaching mode');
        //         return;
        //     }
        //     let userName = req.headers.username;
        //     if(userName){userName=encodeURIComponent(userName.toLowerCase());}
        //     this.poolService.keyboardProcess('RETRIEVE_ALL', DataEntities.keyboardMappingShared.name, userName).then( (result) => {
        //         if (result && result.data){
        //             res.status(200).send(JSON.stringify(result.data));
        //         }else{
        //             res.status(200).send('No data found');
        //         }
        //         return;
        //     });
        // });

        // Not in use
        // router.get('/keyboardMappingPrivate', (req,res) => {
        //     if (!this.cacheEnabled){
        //         res.status(500).send('This API is only available in enableUserResourceCaching mode');
        //         return;
        //     }
        //     let userName = req.headers.username;
        //     if(userName){userName=encodeURIComponent(userName.toLowerCase());}
        //     this.poolService.keyboardProcess('RETRIEVE_KEY', DataEntities.keyboardMappingPrivate.name, userName).then( (result) => {
        //         if (result && result.data){
        //             res.status(200).send(JSON.stringify(result.data));
        //         }else{
        //             res.status(200).send('No data found');
        //         }
        //         return;
        //     });
        // });

        /**
         * get shared and private keyboard mappings for user
         */
        router.get('/keyboardMapping', (req,res) => {
            this.getUserResourceComb('keyboardMapping', req, res);
        });

        /**
         * delete private keyboard mapping
         */
        router.delete('/keyboardMapping', (req,res) => {
            this.deleteUserResource('keyboardMappingPrivate', req, res, true);
        });

        // Not in use
        router.delete('/keyboardMappingShared', (req,res) => {
            this.deleteUserResource('keyboardMappingShared', req, res);
        });

        /**
         * update or insert keyboard mapping
         */
        router.put('/keyboardMapping', async (req,res) => {
            this.putUserResource('keyboardMappingPrivate', req, res, true);
        });
        
        // Not in use
        router.put('/keyboardMappingShared', async (req,res) => {
            this.putUserResource('keyboardMappingShared', req, res);
        });

        /**
         * get keyboard options for user
         */
         router.get('/virtualKeyboardOptions', async (req,res) => {
            try {
                const data = await bzdb.select('virtualKeyboard', {username: req.headers.username});
    
                res.status(200).send(JSON.stringify({status: true, data: data.rowCount > 0 ? data.data[0] : {}}));
            } catch(err) {
                this.logger.severe('Failed to get virtual keyboard options' + err.stack);
                const msg = {status: false, err};
                res.status(500).send(JSON.stringify(msg));
            }
        });

        /**
         * save keyboard options for user
         */
         router.put('/virtualKeyboardOptions', async (req,res) => {
            try {
                const data = req.body;

                data.username = req.headers.username;

                const value = await bzdb.updateOrInsert('virtualKeyboard', data);

                if(value) {
                    res.status(200).send('{"status":true}');
                } else {
                    this.logger.severe('Failed to save virtual keyboard options');
                    res.status(500).send(err.stack);
                }  
            } catch(err) {
                this.logger.severe('Failed to save virtual keyboard options' + err.stack);
                const msg = {status: false, err}
                res.status(500).send(JSON.stringify(msg));
            }    
        });

        // Not in use
        // router.get('/hotspotsShared', (req,res) => {
        //     if (!this.cacheEnabled){
        //         res.status(500).send('This API is only available in enableUserResourceCaching mode');
        //         return;
        //     }
        //     let userName = req.headers.username;
        //     if(userName){userName=encodeURIComponent(userName.toLowerCase());}
        //     this.poolService.hotspotProcess('RETRIEVE_ALL', DataEntities.hotspotsShared.name, userName).then( (result) => {
        //         if (result && result.data){
        //             res.status(200).send(JSON.stringify(result.data));
        //         }else{
        //             res.status(200).send('No data found');
        //         }
        //         return;
        //     });
        // });

        // Not in use
        // router.get('/hotspotsPrivate', (req,res) => {
        //     if (!this.cacheEnabled){
        //         res.status(500).send('This API is only available in enableUserResourceCaching mode');
        //         return;
        //     }
        //     let userName = req.headers.username;
        //     if(userName){userName=encodeURIComponent(userName.toLowerCase());}
        //     this.poolService.hotspotProcess('RETRIEVE_KEY', DataEntities.hotspotsPrivate.name, userName).then( (result) => {
        //         if (result && result.data){
        //             res.status(200).send(JSON.stringify(result.data));
        //         }else{
        //             res.status(200).send('No data found');
        //         }
        //         return;
        //     });
        // });

        /**
         * get shared and private hotspot
         */
        router.get('/hotspot', (req,res) => {
            this.getUserResourceComb('hotspot', req, res);
        });

        /**
         * delete private hotspot
         */
        router.delete('/hotspot', (req,res) => {
            this.deleteUserResource('hotspotPrivate', req, res, true);
        });

        // Not in use
        router.delete('/hotspotShared', (req,res) => {
            this.deleteUserResource('hotspotShared', req, res);
        });
        
        /**
         * Update or insert private hotspot
         */
        router.put('/hotspot', async (req,res) => {
            this.putUserResource('hotspotPrivate', req, res, true);
        });
        
        // Not in use
        router.put('/hotspotShared', async (req,res) => {
            this.putUserResource('hotspotShared', req, res);
        });

        // Not in use
        // router.get('/launchpadShared', (req,res) => {
        //     if (!this.cacheEnabled){
        //         res.status(500).send('This API is only available in enableUserResourceCaching mode');
        //         return;
        //     }
        //     let userName = req.headers.username;
        //     if(userName){userName=encodeURIComponent(userName.toLowerCase());}
        //     this.poolService.launchpadProcess('RETRIEVE_ALL', DataEntities.launchpadShared.name, userName).then( (result) => {
        //         if (result && result.data){
        //             res.status(200).send(JSON.stringify(result.data));
        //         }else{
        //             res.status(200).send('No data found');
        //         }
        //         return;
        //     });
        // });

        // Not in use
        // router.get('/launchpadPrivate', (req,res) => {
        //     if (!this.cacheEnabled){
        //         res.status(500).send('This API is only available in enableUserResourceCaching mode');
        //         return;
        //     }
        //     let userName = req.headers.username;
        //     if(userName){userName=encodeURIComponent(userName.toLowerCase());}
        //     this.poolService.launchpadProcess('RETRIEVE_KEY', DataEntities.launchpadPrivate.name, userName).then( (result) => {
        //         if (result && result.data){
        //             res.status(200).send(JSON.stringify(result.data));
        //         }else{
        //             res.status(200).send('No data found');
        //         }
        //         return;
        //     });
        // });

         /**
         * get user configuration: active session display mode
         */
         router.get('/userConfig', async (req,res) => {
            try {
                const result = await bzdb.select('userConfig', {userId: req.query.userId});

                res.status(200).json({data: result.rowCount ? result.data[0] : {}});
            } catch(err) {
                return errorHandler.handleInternalError(err,res,this.logger);
            }
        });

        /**
         * get user configuration: active session display mode
         */
        router.put('/userConfig', async (req,res) => {
            try {
                const result = await bzdb.updateOrInsert('userConfig', req.body);

                res.status(200).json({status: result.status});
            } catch(err) {
                return errorHandler.handleInternalError(err,res,this.logger);
            }
        });

        /**
         * get user configuration: active session display mode
         */
        router.get('/userConfig', async (req,res) => {
            try {
                const result = await bzdb.select('userConfig', {userId: req.query.userId});

                res.status(200).json({data: result.rowCount ? result.data[0] : {}});
            } catch(err) {
                return errorHandler.handleInternalError(err,res,this.logger);
            }
        });

        /**
         * get user configuration: active session display mode
         */
        router.put('/userConfig', async (req,res) => {
            try {
                const result = await bzdb.updateOrInsert('userConfig', req.body);

                res.status(200).json({status: result.status});
            } catch(err) {
                return errorHandler.handleInternalError(err,res,this.logger);
            }
        });
        

        /**
         * get shared and private launchpad
         */
        router.get('/launchpad', (req,res) => {
            this.getUserResourceComb('launchpad', req, res);
        });
        
        /**
         * delete private launchpad
         */
        router.delete('/launchpad', (req,res) => {
            this.deleteUserResource('launchpadPrivate', req, res, true);
        });

        // Not in use
        router.delete('/launchpadShared', (req,res) => {
            this.deleteUserResource('launchpadShared', req, res);
        });
        
        /**
         * Update or insert private launchpad
         */
        router.put('/launchpad', async (req,res) => {
            this.putUserResource('launchpadPrivate', req, res, true);
        });
        
        // Not in use
        router.put('/launchpadShared', async (req,res) => {
            this.putUserResource('launchpadShared', req, res);
        });
        
        /**
         * get shared and private preference
         */
        router.get('/preference', (req,res) => {
            this.getUserResourceComb('preference', req, res);
        });
        
        /**
         * delete private preference
         */
        router.delete('/preference', (req,res) => {
            this.deleteUserResource('preferencePrivate', req, res, true);
        });

        // Not in use
        // router.delete('/preferenceShared', (req,res) => {
        //     this.deleteUserResource('preferenceShared', req, res);
        // });
        
        /**
         * Update or insert prefrence
         */
        router.put('/preference', async (req,res) => {
            this.putUserResource('preferencePrivate', req, res, true);
        });

        router.put('/configuration', async (req,res) => {
            const putUser = async () => {
                let userName = req.headers.username;
                if(userName){
                    userName = userName.toLowerCase();
                } else {
                    this.logger.severe('Put user resource failed: Required field missing: username');
                    res.status(500).send('Required field missing: username');
                    return;
                }

                const {name, isAdd, sessionId} = req.query;
                const data = req.body, id = name;

                /* ***********************************************
                check session status for bza session when edit it in bzw, response error info when it is removed from bza.
                ******************************************************/
                const isNoAuth = req.headers && req.headers['isnoauth'] && req.headers['isnoauth'] === 'true';
                const userInfo = await bzdb.select('userInfo', {userId: userName});
                if(this.dataSourceConfig.defaultDataSource === 'fallback' && !isNoAuth  && isAdd !== 'true') {   
                    const accessGroups = await bzdb.select('group');
                    const selfSessions = await bzdb.select('sessionPrivate', {userId: userName});
                    const sessions = selfSessions.rowCount > 0 ? selfSessions.data.map(d => d.id) : [];

                    for await(let group of  (accessGroups.data || [])) {
                        let inGroup = ((group.internalUsers || []).filter(userObj => (userObj.userId || '').toLowerCase() === userName.toLowerCase())).length > 0;
                    
                        if(!inGroup) {
                            inGroup = await this.inMatchedGroup(userInfo.data[0], group, 'internal', req, userName);
                        }
    
                        if (inGroup || (group.id || group.groupName) === 'Default Group') {
                            sessions.push(...group.sessions);
                            // group session maybe assign to user directly, don't exist in group.
                            const groupSessions = await bzdb.select('groupSession');
                            const gs = groupSessions.data.filter(d => (d.gids || [d.gid]).indexOf(group.id) > -1);

                            if(gs.length > 0) {
                                sessions.push(...gs.map(d => d.id));
                            }
                        }
                    }

                    if(sessions.indexOf(sessionId) < 0) {
                        this.logger.severe('Put user resource failed: This session cannot be edited, please check it or connect to your administrator');
                        res.status(500).send({
                            status: false,
                            message: 'This session cannot be edited, please check it or connect to your administrator'
                        });
                        return;
                    }
                }

                if(isAdd === 'true') {
                    const selfSessions = await bzdb.select('sessionPrivate', {userId: userName});
                    const sessions = selfSessions.rowCount > 0 ? selfSessions.data.map(d => d.name) : [];
                    const node = req.body.find(d => d.dataEntityName === 'sessionPrivate');
                    delete node.value.autoRunScript;
                    if(node != null && sessions.indexOf(node.value.name) > -1) {
                        this.logger.severe('Put user resource failed: This self-defined session name already exists, please re-login or refresh website.');
                        res.status(500).send({
                            status: false,
                            message: "This self-defined session name already exists, please re-login or refresh website."
                        });
                        return;
                    }
                }

                data.forEach(d => {
                    d.action = 'UPDATEORINSERT';
                    d.options = {};
                   
                    d.value.userId = userName; // Assign PK value in case it's missing

                    if(d.dataEntityName === 'sessionPrivate' && !d.value.id) {
                        d.value.id = name + new Date().getTime();                   
                    }
                })
                
                bzdb.batchTxn(data).then(rep => {
                    if (rep && rep.status === true){
                        res.status(200).send('{"status":true}');
                    }else{
                        this.logger.severe('Put user resource failed: ' + rep.message);
                        res.status(500).send(rep);
                    }
                    return;
                }).catch(err => {
                    return res.status(500).send(JSON.stringify(err));
                })
            }
            const node = req.body.find(d => d.dataEntityName === 'sessionPrivate' || d.dataEntityName === 'preferencePrivate') || {};
            const vals = node.value || {};
            let encryptionObj=this.getPasswordObj(vals);
            if(encryptionObj && encryptionObj.data){  //need encrypt password
                userSrc._encryptObject(encryptionObj.data, encryptionObj.field).then(result => {
                    putUser();
                }).catch(err => {
                    errorHandler.handleInternalError(err,res,this.logger);
                });
            }else{
                putUser();
            }
            
        });

        // Not in use
        router.put('/launchpadShared', async (req,res) => {
            this.putUserResource('launchpadShared', req, res);
        });

          /*  type:
                session: config, keepAlive, advanced, signon, display, security
                font: font
                color: default, extended, inverse, extendedTV, extendedBold
                cursor: cursor
                powerpad: powerpad
                keyboard: keyMapping, keyOptions
                hotspots: hotspots
                language: language
                printe options: printer-basic,
                appearance: appearance
                file-transfer: file-trans-mode, file-trans-options
            */
        router.put('/restore', async (req,res) => {
            try {
                const data = req.body.batchTxnData;
                const id = req.body.id || "";
                const dataEntity = req.body.dataEntityName || "";
                // if the restore file exist
                if (id !== "" && dataEntity !== "") {
                    let restoreDataifExist = await bzdb.select(dataEntity, { id: id });
                    if (restoreDataifExist.data.length === 0) {
                        this.logger.severe('Restore user resource failed: This session cannot be edited, please check it or connect to your administrator');
                        res.status(500).send({
                            status: false,
                            message: 'This session cannot be edited, please check it or connect to your administrator'
                        });
                        return;
                    }
                }
                const result = await bzdb.batchTxn(data);
                if (result.status) {
                    res.status(200).send('{"status":true}');
                } else {
                    this.logger.severe('Delete user resource failed: Unknown Error');
                    res.status(201).send('{"status":false}');
                }
                
            } catch (error) {
                return res.status(500).send(error.stack);
            } 
        });

        router.delete('/restore', async (req,res) => {
            const {type, id} = req.query;
            const userName = req.headers.username;
            const resourceData = {
                hotspots: 'hotspotPrivate',
                powerpad: 'launchpadPrivate',
                keyMapping: 'keyboardMappingPrivate'
            };
            if(resourceData[type]) {
                const data = [{
                    dataEntityName: resourceData[type], 
                    action: 'DELETE',
                    value: {},
                    options: {id: userName + id}
                }]
                //bzdb.delete(resourceData[type], {id: userName + id})
                bzdb.batchTxn(data).then( (result) => {
                    if (result){
                        res.status(200).send('{"status":true}');
                    }else{
                        this.logger.severe('Delete user resource failed: Unknown Error');
                        res.status(500).send('Unknown Error');
                    }
                    return;
                }, err => {
                    return res.status(500).send(err.stack);
                });
            } else {
                res.status(200).send('{"status":true}');
            }          
        });

        router.delete('/configuration', async (req,res) => {
            let userName = req.headers.username;
            if(userName){
                userName=userName.toLowerCase();
            } else {
                this.logger.severe('Delete user resource failed: Required field missing: username');
                res.status(500).send('Required field missing: username');
                return;
            }
            const data = JSON.parse(req.query.data);

            data.forEach(d => {
                d.action = 'DELETE';
                d.value = {}
                d.options = {filter: d.options}
            });
            
            bzdb.batchTxn(data).then( (result) => {
                if (result && result.status === true){
                    res.status(200).send('{"status":true}');
                }else{
                    this.logger.severe('Delete user resource failed: Unknown Error');
                    res.status(500).send(result);
                }
                return;
            }, err => {
                return res.status(500).send(err.stack);
            });
        })
        
        // Not in use
        // router.put('/preferenceShared', (req,res) => {
        //     this.putUserResource('preferenceShared', req, res);
        // });

        // Not in use
        // router.get('/scripts3270Shared', (req,res) => {
        //     if (!this.cacheEnabled){
        //         res.status(500).send('This API is only available in enableUserResourceCaching mode');
        //         return;
        //     }
        //     let ds = this.dataSteward;
        //     ds.retrieveDataAsync(DataEntities.scripts3270Shared.name).then( (result) => {
        //         res.status(200).send(JSON.stringify(result));
        //     });
        // });

        router.get('/script3270', (req,res) => {
            this.getScript(req, res, '3270');
        });

        // Not in use
        // router.get('/scripts5250Shared', (req,res) => {
        //     if (!this.cacheEnabled){
        //         res.status(500).send('This API is only available in enableUserResourceCaching mode');
        //         return;
        //     }
        //     let ds = this.dataSteward;
        //     ds.retrieveDataAsync(DataEntities.scripts5250Shared.name).then( (result) => {
        //         res.status(200).send(JSON.stringify(result));
        //     });
        // });

        router.get('/script5250', (req,res) => {
            this.getScript(req, res, '5250');
        });
        
        // Not in use
        // router.get('/scriptsVTShared', (req,res) => {
        //     if (!this.cacheEnabled){
        //         res.status(500).send('This API is only available in enableUserResourceCaching mode');
        //         return;
        //     }
        //     let ds = this.dataSteward;
        //     ds.retrieveDataAsync(DataEntities.scriptsVTShared.name).then( (result) => {
        //         res.status(200).send(JSON.stringify(result));
        //     });
        // });
        
        router.get('/scriptvt', (req,res) => {
            this.getScript(req, res, 'vt');
        });

        
        router.get('/scriptshared', (req,res) => {
            this.getScript(req, res, 'shared');
        });
      
        /**
         * encode username for id, because bzdb will create file based on the id, if it contains '//' (such as rocket1/cmu),it will create rocket1 folder
         * id as primary key, and search scripts based on type and name
         */
        router.put('/script', async (req,res) => {
            const {type, name} = req.query;
            const username = req.headers.username;
            const scriptPrivateData = await bzdb.select('scriptPrivate', {type, username, name});
            let data;
            if(scriptPrivateData.rowCount > 0){
                data = scriptPrivateData.data[0];
                data.script = req.body;
            }else{
                data = {id: `${type}_${bzdb.getUIDSync()}`, name, type, username, script: req.body}
            }

            bzdb.updateOrInsert('scriptPrivate', data).then((result) => {
                if (result && result.status === true){
                    res.status(200).send('{"status":true}');
                } else {
                    this.logger.severe('Put script failed: Unknown Error');
                    res.status(500).send(result);
                }
                return;
            }, err => {
                this.logger.severe('Put script failed: ' + err.stack);
                return res.status(500).send(err.stack);
            });
            
        });

        router.get('/scripteditor', (req,res) => {
            try {
                const dir = this.getBzwUserPath(req, 'scripts/editor');

                if(!fs.existsSync(dir)) {
                    res.status(204).json({ error: 'No corresponding editor settings file exists!' });
                } else {
                    const data = JSON.parse(fs.readFileSync(path.join(dir, 'scriptEditorSettings')));
                    res.status(200).json({contents: data});
                    logger.info(`Get the content of editor settings successful`);
                }
            } catch(err) {
                errorHandler.handleInternalError(err,res,this.logger);
            }
        });

        router.put('/scripteditor', (req,res) => {
            try {
                const dir = this.getBzwUserPath(req, 'scripts/editor');

                if(!fs.existsSync(dir)) {
                    fse.mkdirSync(path.resolve(dir), {recursive: true}); // handle no editor folder
                }
    
                fs.writeFile(`${dir}/scriptEditorSettings`, JSON.stringify(req.body,null, 2), { mode: 0o644 }, (err) => {
                    if (err) {
                        const message = `I/O error when update scriptEditorSettings`;
                        res.status(500).json({ error: message });
                        logger.severe(`${message};${dir}/scriptEditorSettings`);
                    } else {
                        const message = 'Update scriptEditorSettings file successfully';
                        res.status(200).json({ success: true, message: message, data: req.body });
                        logger.info(message);
                        logger.debug(`Update scriptEditorSettings successful: ${JSON.stringify(req.body)}`);
    
                    }
                })
            } catch(err) {
                errorHandler.handleInternalError(err,res,this.logger);
            }
            
        });

        /**
         * For RTE web, it was used to reset user password when logining RTE web, but don't use it anymore.
         */
        router.put('/resetpassword', (req,res) => {
            try {
                let redirectUrl = '/ZLUX/plugins/com.rs.bzadm/services/userController/resetPassword';
                req.headers.authorization = oauth.getDefaultTokenBase64();
                this.clusterReqService.redirectToConfigjsRequest(req, res, redirectUrl, context);
            } catch(err) {
                errorHandler.handleInternalError(err,res,this.logger);
            }
        });
        
        // RTE web don't use it anymore.
        router.get('/defaults', (req,res) => {
            try {
                let redirectUrl = configjs_bzw_url + '/instance/defaults?';
                if (req.query.name){
                    redirectUrl += ('name=' + req.query.name);
                }else{
                    redirectUrl += 'listing=true';
                }
                this.clusterReqService.redirectToConfigjsRequest(req, res, redirectUrl, context);
            } catch(err) {
                errorHandler.handleInternalError(err,res,this.logger);
            }
        });
        
        router.get('/getKeyboardLayout', (req,res) => {
            try {
                const folders = ['Instance', 'Product'];

                for(let folder of folders) {
                    const file = path.join(zoweService[`getPlugin${folder}FilePath`](this.context),'./defaults/keyboardLayout.json');
                    if(fs.existsSync(file)) {
                        const data = JSON.parse(fs.readFileSync(`${file}`));
                        res.status(200).json({contents: data});
                        logger.info(`Get the content of keyboardLayout successful in folder: ${folder}`);
                        break;
                    }
                }
            } catch (err) {
                errorHandler.handleInternalError(err,res,this.logger);
            }
           
        });
        
        // deprecated
        // router.post('/logoutCluster', async (req,res) => {
        //     try {
        //         const result = await this.clusterReqService.deleteUserStateOnMaster(req, this.context);
        //         const resultObj = JSON.parse(result);
        //         if (resultObj && resultObj.status){
        //             res.status(200).send({status: true, message: 'Logout cluster succeed'});
        //         }
        //         else if (resultObj){
        //             res.status(200).send(resultObj);
        //         }else{
        //             this.logger.severe('logout cluster failed: Unknown Error');
        //             res.status(500).send({status: false, message: 'Unknown Error'});
        //         }
        //     } catch(err) {
        //         errorHandler.handleInternalError(err,res,this.logger);
        //     }
        // });

        /**
         * Request:     Healthcheck for accounts api. 
         * Description: Simply response a fixed text.
         * Authorize:   Any user???
         */
        router.get('/healthcheck', (req,res) => {
            res.status(200).send('userResource api works!');
        });

        router.get('/decryption', (req,res) => {
            const data = req.query;

            userSrc._decryptObject(data).then(d => {
              res.status(200).send(d);
            }).catch(err => {
                errorHandler.handleInternalError(err,res,this.logger);
            })
        })

        router.get('/connectionPreCheck', async (req,res) => {
            const data = req.query;
            const ip = req.headers['x-forwarded-for'] || req.ip;
          
            try {
                const filter = {uid: data.uid ? data.uid : this.reportSrc.connPool.normalizeIP(ip)};
                const uids = await bzdb.select('connPoolBasic', filter, { selectCluster: true });
                const dbResult = await bzdb.select("configurations",constants.metaDataBackupPath.config);
                const maxCount = (dbResult.data[0] || {}).limitSessions || 3;
                let activeSessions = 1; // calculate active session count from 1, consider current connect.
                uids.data.forEach(d => {
                    activeSessions += d.data.rowCount;
                });
                res.status(200).send({
                    status: activeSessions <= maxCount,
                    maxCount: maxCount
                });
            } catch(err) {
                errorHandler.handleInternalError(err,res,this.logger);
            }
        })

        //this put method is not used, move the code to BZW printer service since put not need auth privilege
        router.put('/spool', async(req,res) => { 
            let userName=req.headers.username;
            if(userName){userName=encodeURIComponent(userName.toLowerCase());}
            const userDir=this.context.plugin.server.config.user.usersDir;
            try {
                const fileContent = req.body.content;
                const folder = req.query.type === '5250' ? '5250spool' : 'spool';
                const dir=`${userDir}/${userName}/ZLUX/pluginStorage/com.rs.bzw/${folder}`;
                const fileName=req.body.fileName;
                let result=await this.utils.saveSpoolFile(dir,fileName,fileContent);
                if(result){
                    let fileAttr=await this.utils.getFileList(dir,fileName)
                    res.status(200).send(fileAttr[0]);
                }else{
                    res.status(200).send(result);
                }
            } catch(err) {
                errorHandler.handleInternalError(err,res,this.logger);
            }
        });

        router.get('/spool',async(req,res) => {
            let userName=req.headers.username;
            const folder = req.query.type === '5250' ? '5250spool' : 'spool';
            if(userName){userName=encodeURIComponent(userName.toLowerCase());}
            if(req.query.name){ 
                const userDir=this.context.plugin.server.config.user.usersDir;
                const fileName=`${userDir}/${userName}/ZLUX/pluginStorage/com.rs.bzw/${folder}/${req.query.name}`;
                try {
                    let fileContent;
                    if (fileName.indexOf(".json") != -1)
                        fileContent=await this.utils.getFileContent(fileName);
                    else
                        fileContent=await this.utils.getBinaryFileContent(fileName);
                    res.status(200).send(fileContent);
                } catch(err) {
                    errorHandler.handleInternalError(err,res,this.logger);
                }
            }else{  //list
                const userDir=this.context.plugin.server.config.user.usersDir;
                const spoolDir=`${userDir}/${userName}/ZLUX/pluginStorage/com.rs.bzw/${folder}`;
                try {
                    let listObj=await this.utils.getFileList(spoolDir);
                    res.status(200).send(listObj);
                } catch(err) {
                    errorHandler.handleInternalError(err,res,this.logger);
                }
            }

        });

        router.delete('/spool',async(req,res) => {
            let userName=req.headers.username;
            const folder = req.query.type === '5250' ? '5250spool' : 'spool';
            if(userName){userName=encodeURIComponent(userName.toLowerCase());}
            if(req.query.name){ 
                const userDir=this.context.plugin.server.config.user.usersDir;
                const fileName=`${userDir}/${userName}/ZLUX/pluginStorage/com.rs.bzw/${folder}/${req.query.name}`;
                try {
                    await this.utils.deleteFile(fileName);
                    res.status(200).send(true);
                } catch(err) {
                    errorHandler.handleInternalError(err,res,this.logger);
                }
            }else{  //list
                errorHandler.handleInternalError("not speicfy file name",res,this.logger);
            }

        });

    }

    async checkParam(req,res) {
        const sessionName = req.query.sessionName;
        if (!sessionName){
            res.status(400).send('Bad Request. <br>"sessionId" is required. <br> Try add "?sessionName=YOUR_SESSION_NAME" to the request.');
            return;
        }
        let username = req.query.username? req.query.username: req.username;
        if (!username){
            res.status(400).send('Bad Request. <br>"username" is required. <br> Try add "&username=YOUR_LOGIN_ID" to the request.');
            return;
        }
        if (!zoweService.isAdminAccount(this.context,username)){
            res.status(403).send('The requested operation is forbidden.');
            return;
        }
        username = username.toLowerCase();
        let privateSession = null
        const dbFilter = {userId: username.toLowerCase()};
        const recordSet = await bzdb.select('sessionPrivate', dbFilter);
        if (recordSet.rowCount === 0){
            res.status(404).send(`Data not found. <br>Session "${Security.defendXSS(sessionName)}" of user "${Security.defendXSS(username)}" not exist.`);
            return;
        }else{
            for(const s of recordSet.data){
                if((s.name === sessionName)){
                    privateSession = s;
                }
            }
        }
        if(privateSession === undefined || privateSession === null){
            res.status(404).send(`Data not found. <br>Session "${Security.defendXSS(sessionName)}"  of user "${Security.defendXSS(username)}" not exist.`);
            return;
        }
        return privateSession;
    }
    /**
     * 
     * @param {*} resourceName 
     * @param {*} res 
     * @param {*} filter
     * @returns resource data as Array
     */
    getUserResource(resourceName, res, filter){
        bzdb.select(resourceName, filter).then((result) => {
            res.status(200).send(JSON.stringify(result));
        }, err => {
            this.logger.severe('get user resource failed: ' + err.stack);
            return res.status(500).send(err.stack);
        }).catch(err => {
            return errorHandler.handleInternalError(err,res,this.logger);
        });
    }

    /**
     * 
     * @param {} resourceName resource name excluding 'Private' or 'Shared' in the name.
     * @param {*} req 
     * @param {*} res 
     * @returns shared and private resource combined as Object
     */
    async getUserResourceComb(resourceName, req, res){
        let userName = req.headers.username;
        const filter = {};
        if(userName){
            userName=userName.toLowerCase();
            filter['userId'] = userName;
        }
        bzdb.select(resourceName + 'Private', filter).then(async (result) => {
            const resPriv = result;

            if (resourceName === 'preference') {
                //await userSrc._decryptFTP(resPriv);
                for await (let d of resPriv.data) {
                    let decryptionObj = this.getPasswordObj(d);
                    if (decryptionObj && decryptionObj.data) {
                        await userSrc._decryptPasswordFiled(decryptionObj.data, decryptionObj.field);
                    }
                }
            }


            // userSrc._decryptWithKey(result.data, 'sessionPassword');
            bzdb.select(resourceName + 'Shared').then(async (result) => {
                let resShar = result;
                // await userSrc._decryptFTP(resShar);
                // userSrc._decryptWithKey(result.data, 'sessionPassword');
                if (resourceName === 'preference') {
                    for await (let d of resShar.data) {
                        let decryptionObj = this.getPasswordObj(d);
                        if (decryptionObj && decryptionObj.data) {
                            await userSrc._decryptPasswordFiled(decryptionObj.data, decryptionObj.field);
                        }
                    }
                }
                res.status(200).send(JSON.stringify({'shared': resShar, 'private': resPriv}));
                return;
            }, err => {
                this.logger.severe('get user resource combined failed: ' + err.stack);
                return res.status(500).send(err.stack);
            });
        }).catch(err => {
            return errorHandler.handleInternalError(err,res,this.logger);
        }); 
    }

    getBzwUserPath(req, subPath) {
        return path.join(BASE_PATH, `deploy/instance/users/${req.headers.username}/ZLUX/pluginStorage/com.rs.bzw/${subPath}`);
    }

    deleteUserResource(resourceName, req, res, isPrivate){
        // validation
        let userName;
        if (isPrivate){
            userName = req.headers.username;
            if(userName){
                userName=userName.toLowerCase();
            } else {
                this.logger.severe('Delete user resource failed: Required field missing: username');
                res.status(500).send('Required field missing: username');
                return;
            }
        }
        let name = req.query.name;
        if (name){
            // name=encodeURIComponent(name);
        } else {
            this.logger.severe('Delete user resource failed: Required field missing: name');
            res.status(500).send('Required field missing: name');
            return;
        }
        // prepare filter
        const filter = {id: name};
        // if (isPrivate && resourceName !== 'sessionPrivate'){
        //     filter['userId'] = userName; 
        // }
        // delete
        bzdb.delete(resourceName, filter).then( (result) => {
            if (result){
                res.status(200).send('{"status":true}');
            }else{
                this.logger.severe('Delete user resource failed: Unknown Error');
                res.status(500).send('Unknown Error');
            }
            return;
        }, err => {
            return res.status(500).send(err.stack);
        });
    }

    async putUserResource(resourceName, req, res, isPrivate) {
        try{
            // validations
            let userName;
            const putUser = async () => {
                if (isPrivate) {
                    userName = req.headers.username;
                    if(userName){
                        userName=userName.toLowerCase();
                    } else {
                        this.logger.severe('Put user resource failed: Required field missing: username');
                        res.status(500).send('Required field missing: username');
                        return;
                    }
                }
                let id = req.query.name;
                if (id){
                    // name=encodeURIComponent(id);
                } else {
                    this.logger.severe('Put user resource failed: Required field missing: id');
                    res.status(500).send('Required field missing: id');
                    return;
                }
                // data prepare
                const data = req.body;
                if(resourceName !== 'sessionPrivate') {
                    data.id = id;
                }
                // data['name'] = name; // Assign PK value in case it's missing
                if (isPrivate) {
                    data['userId'] = userName; // Assign PK value in case it's missing
                }
                if(resourceName === 'sessionPrivate' && isPrivate && !data.id) {
                    data.id = name + new Date().getTime();                   
                }
                 /* ***********************************************
                check session status for bza session when edit it in bzw, response error info when it is removed from bza.
                ******************************************************/
               const isNoAuth = req.headers && req.headers['isnoauth'] && req.headers['isnoauth'] === 'true';
               if(this.dataSourceConfig.defaultDataSource === 'fallback' && !isNoAuth && isPrivate && req.query.isAdd !== 'true') {
                    // const users = await bzdb.select('userInfo', {userId: userName});
                    // const groups = [];
                    // users.data.forEach(d => groups.push(...d.groupNames));
                    // const sessions = [];
                
                    // for(let i=0; i< groups.length; i++) {
                    //     const session = await bzdb.select('group', {id: groups[i]});
                    //     session.data.forEach(d => sessions.push(...d.sessions));
                    // }

                   
                    const accessGroups = await bzdb.select('group');
                    const selfSessions = await bzdb.select('sessionPrivate', {userId: userName});
                    const sessions = selfSessions.rowCount > 0 ? selfSessions.data.map(d => d.id) : [];
                    const userInfo = await bzdb.select('userInfo', {userId: userName});
                    for await(let group of  (accessGroups.data || [])) {
                      let inGroup = ((group.internalUsers || []).filter(userObj => (userObj.userId || '').toLowerCase() === userName.toLowerCase())).length > 0;
                      if (inGroup || (group.id || group.groupName) === 'Default Group') {
                        sessions.push(...group.sessions);
                      }
                      if(!inGroup) {
                        inGroup = await this.inMatchedGroup(userInfo.data[0], group, 'internal', req, userName);
                      }
                    }
                    if(sessions.indexOf(req.query.sessionId) < 0) {
                        this.logger.severe('Put user resource failed: This session cannot be edited, please check it or connect to your administrator');
                        res.status(500).send({
                            status: false,
                            message: 'This session cannot be edited, please check it or connect to your administrator'
                        });
                        return;
                    }
    
                
                }
                // Update if exist otherwise insert
                bzdb.updateOrInsert(resourceName, data).then((result) => {
                    if (result){
                        res.status(200).send('{"status":true}');
                    }else{
                        this.logger.severe('Put user resource failed: Unknown Error');
                        res.status(500).send('Unknown Error');
                    }
                    return;
                }, err => {
                    this.logger.severe('Put user resource failed: ' + err.stack);
                    return res.status(500).send(err.stack);
                });
            };
            const data = (req.body.isFTPSession ? req.body.ftp : req.body.signon) || {};
            const opt = req.body.isFTPSession ? 'password' : 'sessionPassword';
            userSrc._encryptObject(data, opt).then(result => {
                putUser();
            }).catch(err => {
                errorHandler.handleInternalError(err,res,this.logger);
            });
        
        } catch(err) {
            errorHandler.handleInternalError(err,res,this.logger);
        }
    }

    async getScript(req, res, type) {
        try {
            const name = req.query.name;
            let username = req.headers.username;
            // let names = [], script;
            // username=encodeURIComponent(username);
            let contents ;
            if(type === 'shared'){
                const filter = !!name  ? {id:name} : {}
                await bzdb.select('scriptShared',filter).then((shared) => {
                    if(name == null){
                        let sharedScriptMap = [];
                        if (shared.data && shared.data.length > 0){
                            sharedScriptMap = shared.data.map(d =>  { return {'id':d.id, 'name':d.name, 'status' : d.status, type: d.type}});
                        }
                        contents = {contents:sharedScriptMap};
                    }else{
                        let content = (shared.data[0] || {}).script;
                        contents = {contents: content};
                    }
                   
                    res.status(200).send(JSON.stringify(contents));
                    }, err => {
                        this.logger.severe('Get sharedScript failed: ' + err.stack);
                        return res.status(500).send(err.message);
                    });
            }else{
                const filter = name == null ? {type, username} : {type, username, name};
                let data;
                // there is no shared Script in it;
                // const shared = await bzdb.select('scriptShared', name == null ? {type} : {type, name});
                // let names = [], script;

                // if (shared){
                //     if (name == null) {
                //         names = shared.data.map(d => d.name);
                //     } else {
                //         script = (shared.data[0] || {}).script;
                //     }
                // }

                bzdb.select('scriptPrivate', filter).then((result) => {
                    if (result){
                        if (name == null) {
                            data = result.data.map(d => d.name);
                            // data.push(...names);
                            contents = {contents: [...new Set(data)]}
                        } else {
                            let content = (result.data[0] || {}).script;
                            // contents = {contents: content == null ? script : content};
                            contents = {contents: content};
                        }
                        res.status(200).send(JSON.stringify(contents));
                    } else {
                        this.logger.severe('Get script failed: Unknown Error');
                        res.status(500).send('Unknown Error');
                    }
                    return;
                }, err => {
                    this.logger.severe('Get script failed: ' + err.stack);
                    return res.status(500).send(err.stack);
                });
            }
        } catch(err) {
            errorHandler.handleInternalError(err,res,this.logger);
        }
    }

    async inMatchedGroup(userInfo = {}, group, type = '', req, userId) {
        let inGroup = false;
        const reg = userSrc.mapUserIdReg; // reg mail
    
        if(!this.dataAuthentication.matchedGroup) {
          return inGroup;
        }

        if(type !== 'internal') return inGroup;
    
        const authMode = this.user.dataserviceAuthentication.defaultAuthentication;
        if((authMode === 'sso' || authMode === 'ldap') && this.dataAuthentication.matchedGroup) {
            const groups = await userSrc.getGroup(userId, req, authMode);

            return groups.groups.length > 0;
        } 

        const prop = this.dataAuthentication.matchedProp;
        if(prop === 'mail') {
          inGroup = (reg.test(userInfo.userId) && group.groupName.toLowerCase() === userInfo.userId.split('@')[1].toLowerCase()) || 
            (reg.test(userInfo[prop]) && group.groupName.toLowerCase() === userInfo[prop].split('@')[1].toLowerCase());
        }

        return inGroup;
      }


    getPasswordObj=((obj)=>{
        if(obj && obj.ftp) return {data:obj.ftp,field:'password'};
        else if(obj && obj.ind$FileTransfer) return {data:obj.ind$FileTransfer,field:'FilePass'};
        //else if(d.is5250Session) return {data:d.signon,opt:'sessionPassword'};  //cryption by another API /decryption/'
        else return null;
    })
  

}

exports.userResourceRouter = (context) => {
    return new Promise (function (resolve,reject) {
      let controller = new UserResourceController(context);
      controller.setupUserResourceRouter();
      resolve(controller.getRouter()); 
    });
  };