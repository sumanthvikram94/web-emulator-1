
/**
 * Name:      session-mode-controller.js
 * Desc:      Provide api to return the sessionMode related configurations
 * Copyright: © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */

// import {authSuper} from './../../../../../lib/auth/authSuper';
//const cors = require('cors');
const express = require('express');
const Promise = require('bluebird');
const path = require('path');
const bodyParser = require('body-parser');
const zoweService = require('../../services/zowe.service');
const reportSrc = require('./user-report-service');
const errorHandler = require('../../services/error.service.js');
const oAuth = require('../../services/oauth.service');
const bzdb = require('../../services/bzdb.service');
const ReportSv = require('../../dist/report-service');
const deployDirectory = {
    instanceZluxPath: "deploy/instance/ZLUX/pluginStorage/",
    productZluxPath: "deploy/product/ZLUX/pluginStorage/",
    userReport: "com.rs.bzadm/configurations/userReport.json"
}
const BASE_PATH = path.join(process.cwd(), '../');
class UserReportRouter {
    constructor(context){
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        this.productDir = this.context.plugin.server.config.user.productDir;;
        const authConfig = context.plugin.server.config.user.dataserviceAuthentication;
        this.isNoAuth = authConfig.isAnonymousAccessAllowed;
        this.isDefaultGroupMode = authConfig.onlyDefaultGroupMode || zoweService.isOnZowe;
        this.dataSource = 'fallback';
        this.user = context.plugin.server.config.user;
        this.dataAuthentication = this.user.dataserviceAuthentication;
        this.reportSrc = reportSrc;
        this.reportSv = ReportSv;
        this.reportSrc.getDataSource().then(result => this.dataSource = result);
        bzdb.registerCommand('resetRotate', this.reportSrc.updateConfig.bind(this.reportSrc));
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


    getUserReportRouter() {
        const logger = this.logger;
        const router = this.router;
        const context = this.context;
        logger.info('Setup user report router');
        // const date = new Date();
        //router.use(cors());
        router.use(express.json({type:'application/json'}));
        router.use(oAuth.defaultOAuthChecker());
        router.get('/servers', async (req, res) => {
            try {
                const sn = req.query.server;
                const field = req.query.field;
                const data = await this.reportSrc.getServersData();
                const time = this.reportSrc.utils.formatDate(new Date(), true);

                if(sn) {
                    if(field) {
                        const value = (data[sn] || {})[field];
                        res.status(200).json({value: value == null ? null : value}); 
                    } else {
                        res.status(200).json({data: data[sn] || {}});
                    }
                   
                } else {
                    res.status(200).json({success: true, data, time}); 
                }
    
                logger.info(`servers`);
            } catch(err) {
                errorHandler.handleInternalError(err, res, this.logger, 202);
            }
        });

        router.get('/serverNames', async (req, res) => {
            try {
                const metaPeers = await this.reportSv.select('meta_peers');
                const metaNode = await this.reportSv.select('meta_node');
                const data = (metaPeers.data || []).map(peer => this.reportSrc.utils.getServerNameFromUrl(peer.serverURL || ''));
                const curNode = metaPeers.data.filter(d => d.id === metaNode.data[0].id).map(d => this.reportSrc.utils.getServerNameFromUrl(d.serverURL || ''))
                
                res.status(200).json({success: true, data, server: curNode[0]}); 
                logger.info(`servers`);
            } catch(err) {
                errorHandler.handleInternalError(err, res, this.logger, 202);
            }
        });

        router.get('/uniqueAndPeakUser', async (req, res) => {
            try {
                const stat = await this.reportSrc.connPool.checkConnStat();
                const uniqueData = await this.reportSrc.getUniqueUsers(stat);
                const peakData = await this.reportSrc.getPeakUsers(stat);  // {ever: {count: number, date: date}, daily: {count: number, date: date}, d14: {count: number, date: date}}
                // peak past 14, peak recorded, unique total
                res.status(200).json({ success: true, uniqueData, peakData });
                logger.info(`peakUser`);
            } catch (err) {
                errorHandler.handleInternalError(err, res, this.logger, 202);
            }
        });

        router.get('/serverUsers', async (req, res) => {
            try {
                 // console.log(req, 'users');
                const hostName = req.hostname || req.host;
                const serverName = req.query.server || hostName;
                const time = this.reportSrc.utils.formatDate(new Date(), true);
                // const isCurrentNode = serverName === hostName;
                const getOneNode = false;
                const result = await this.reportSrc.getServerUsers(serverName, getOneNode);
                // console.log ('Get server users: ', result);
                        
                res.status(200).json({success: true, time, result}); 
                logger.info(`serverUsers`);
            } catch(err) {
                errorHandler.handleInternalError(err, res, this.logger, 202);
            }
        });

        // router.get('/serverSessions', (req, res) => {
        //     console.log(req, 'users');
        //     const serverName = req.query.server;
        //     const data = [];
        //     res.status(200).json({success: true, data}); 
        //     logger.info(`serverSessions`);
        // });

        router.get('/periodUsers', async (req, res) => {
            try {
                const {period} = req.query;
                console.log('periodUsers', period);
                const data = await this.reportSrc.getPeriodUsers(period);
                const time = this.reportSrc.getTime('yyyy-MM-dd hh:mm:ss');
                res.status(200).json({success: true, data, time}); 
                logger.info(`periodUsers`);
            } catch(err) {
                errorHandler.handleInternalError(err, res, this.logger, 202);
            }
        });

        router.get('/userGroups', async (req, res) => {
           try {
                const result = await this.reportSrc.getUsersByGroups(this.dataSource, this.isDefaultGroupMode, this.isNoAuth, this.dataAuthentication.matchedGroup);
                // console.log('servers info: ', result);
                const time =  this.reportSrc.getTime('yyyy-MM-dd hh:mm:ss');

                res.status(200).json({success: true, result, time}); 
                logger.info(`userGroups`);
            } catch(err) {
                errorHandler.handleInternalError(err, res, this.logger, 202);
            }
        });

        router.get('/userHistory', async (req, res) => {
            try {
                 const uid = req.query.id;
                 const start = req.query.start === 'undefined' ? 0 : Number(req.query.start);
                 const end = req.query.end === 'undefined' ? 0 : Number(req.query.end);
                 
                 if (!uid) {
                     res.status(400).send('Bad request: please specify the user id');
                 }

                 if (start && end && start > end) {
                    res.status(400).send('Bad request: incorrect date. The start time cannot larger than end time.');
                 }

                 const now = (new Date()).getTime();
                 const result = start > now ? [] : (await this.reportSrc.getHistoryData(uid, start, end));
                 res.status(200).json({success: true, result}); 
                 logger.info(`get user history data`);
             } catch(err) {
                 errorHandler.handleInternalError(err, res, this.logger, 202);
             }
         });

        router.put('/config', async (req, res) => {
            try {
                const values = req.body;
                const configs = await bzdb.select('reportConfig');
                const result = Object.assign(configs.data[0], values);
                const peers = await bzdb.select('meta_peers');
    
                // this.reportSrc.updateConfig(result);

                await bzdb.updateOrInsert('reportConfig', result);

                for await(let data of peers.data) {
                   await bzdb.exec('resetRotate', [result], data.id);
                }

                res.status(200).json({status: true});
            } catch(err) {
                 errorHandler.handleInternalError(err, res, this.logger, 202);
             }
         });

         router.get('/config', async (req, res) => {
            try {
                const data = await bzdb.select('reportConfig');
                res.status(200).json({status: true, data: data.data[0]}); 
                logger.info(`get config`);
             } catch(err) {
                 errorHandler.handleInternalError(err, res, this.logger, 202);
             }
         });
    }
}


exports.userReportRouter = (context) => {
    return new Promise (function (resolve,reject) {
      let controller = new UserReportRouter(context);
      controller.getUserReportRouter();
      resolve(controller.getRouter()); 
    });
  };