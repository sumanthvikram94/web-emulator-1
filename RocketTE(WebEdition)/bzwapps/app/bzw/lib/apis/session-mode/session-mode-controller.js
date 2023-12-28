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
const zoweService = require('../../../../bzshared/lib/services/zowe.service');
const corsName = zoweService.isOnZowe? '../../../../bzshared/lib/node_modules/cors': 'cors';
//const cors = require(corsName);
const Promise = require('bluebird');
// const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');
// const ClusterRequestService = require('../../../../bzshared/lib/services/cluster-request.service');
const errorHandler = require('../../../../bzshared/lib/services/error.service.js');
const bzdb = require('../../../../bzshared/lib/services/bzdb.service');
const constants = require('../../../../bzshared/lib/services/constants.service');
const {adminConfigService}  = require('../../../../bzshared/lib/services/admin-config.service');

class SessionModeController {

    constructor(context){
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        this.adminConfigObj = adminConfigService;
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

    setupSessionModeRouter() {
        const logger = this.logger;
        const router = this.router;
        const basePath = this.context.plugin.server.config.user.instanceDir;
        const productPath = this.context.plugin.server.config.user.productDir;
        const subPath ="/ZLUX/pluginStorage/com.rs.bzw/configurations";
        // const name = "/severSetting.json";
        const dir = path.resolve(basePath + subPath);
        // const fileName = path.resolve(basePath + subPath + name);
       
        logger.info('Setup session mode router');

        //router.use(cors());
        router.use(express.json({type:'application/json'}));

        // router.use((req, res, next) => {
        //     this.clusterReqService.redirectSlaveRequest(req, res, next);
        // });

        router.get('/', async (req,res) => {
            let isHeaderLess = false, navRecMode = false, enableAPI = false;
            let sessionName = false;
            // const userRoles = null;
            let singleSession =  false;
            let contextMenu = false, limitation = false;
            let hideServer = false, preCheckEditableField = false;
            let placeVirtulKeyboardBelow = false, mobileKeyboard  = false, sysKeyboardAuto = false, launchSessionMode = 'list';
            let dataSecurity = {};
            let enablePasswordRecord = false;
            try{
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir);
                }
                const dbResult=await bzdb.select("configurations",constants.metaDataBackupPath.config);
                if(dbResult.data && Array.isArray(dbResult.data) && dbResult.data.length>0){
                    const sessionMode =dbResult.data[0];
                    isHeaderLess = sessionMode.isHeaderLess || false;
                    navRecMode = sessionMode.navRec || false;
                    enableAPI = sessionMode.api || false;
                    sessionName = sessionMode.sessionName || false;
                    singleSession = sessionMode.fullScreen || false;
                    contextMenu = sessionMode.contextMenu || false; 
                    hideServer = sessionMode.hideServer || false;
                    limitation = sessionMode.limitation || false;
                    placeVirtulKeyboardBelow = sessionMode.placeVirtulKeyboardBelow || false;
                    mobileKeyboard = sessionMode.mobileKeyboard || false;
                    sysKeyboardAuto = sessionMode.sysKeyboardAuto || false;
                    launchSessionMode = sessionMode.launchSessionMode;
                    dataSecurity = sessionMode.dataSecurity || {};
                }
                const screen=await bzdb.select('terminalScreen');
                if(screen.data && Array.isArray(screen.data)){
                    if(screen.data.length>0){
                        if(dataSecurity){
                            dataSecurity.screens= screen.data;
                        }
                    }else{
                        if(dataSecurity) delete dataSecurity.screens
                    }
                }

                let result = {
                    headerless: isHeaderLess,
                    singleSession: singleSession,
                    sessionName: sessionName,
                    contextMenu: contextMenu,
                    hideServer,
                    navRecMode,
                    enableAPI,
                    placeVirtulKeyboardBelow,
                    mobileKeyboard,
                    sysKeyboardAuto,
                    launchSessionMode,
                    dataSecurity,
                    preCheckEditableField,
                    limitation,
                    enablePasswordRecord
                    // roles: userRoles,
                    // types: result
                };
                let minVersion=this.getProperty(this.context,'plugin.server.config.user.TLSConfiguration.tlsMinVersion');
                let maxVersion=this.getProperty(this.context,'plugin.server.config.user.TLSConfiguration.tlsMaxVersion');
                const adminResult = await bzdb.select('adminConfig');
                const adminConfig = adminResult.rowCount > 1 ? adminResult.data[0] : this.adminConfigObj.getConfig();
               
                result.privScope = adminConfig.groupPrivilegeScope;
                result.maxPowerpadRow = adminConfig.maxPowerpadRow;
                result.copyFullPage4Unselect = adminConfig.copyFullPage4Unselect || false;
                result.preCheckEditableField = adminConfig.preCheckEditableField || false;
                result.limitation = result.limitation && this.adminConfigObj?.adminConfigObj?.enableUserReport; // limitation feature needs to open user report.Since user report need to restart, so use init value
                result.enablePasswordRecord = adminConfig.script.enablePasswordRecord || false;
                
                if(minVersion || maxVersion){
                    result["globalTLSConfiguration"]={};
                    result.globalTLSConfiguration["tlsMinVersion"] = minVersion || null;
                    result.globalTLSConfiguration["tlsMaxVersion"] = maxVersion || null;
                }

                const userId = req.query.userId;

                if(userId) {
                    const userConfig = await bzdb.select('userConfig', {userId: req.query.userId});

                    if(userConfig.rowCount) {
                        result.launchSessionMode = userConfig.data[0].launchSessionMode;
                        result.showInputHistory = userConfig.data[0].showInputHistory;
                    }
                }

                let sshKeyExAl=this.getProperty(this.context,'plugin.server.config.user.sshKeyExchangeAlgorithm');
                sshKeyExAl=!sshKeyExAl?[]:!Array.isArray(sshKeyExAl)?[sshKeyExAl]:sshKeyExAl;
                result.globalSSHKeyExchangeAlgorithm = sshKeyExAl || [];
   
                this.logger.info('Get session mode success.');
                this.logger.debug(`Get session mode info: ${JSON.stringify(result)}`);
                
                res.status(200).send(JSON.stringify(result));
            }catch(err){
                errorHandler.handleInternalError(err,res,this.logger);
            }

        });

        /**
         * Request:     Healthcheck for accounts api. 
         * Description: Simply response a fixed text.
         * Authorize:   Any user???
         */
        router.get('/healthcheck', (req,res) => {
            this.logger.info(`Health check success: sessionMode api works!`);
            res.status(200).send('sessionMode api works!');
        });
        
    }
    getProperty(obj, key){
        return key.split(".").reduce(function(o, x) {
            return (typeof o == "undefined" || o === null) ? o : o[x];
        }, obj);
    };
}


exports.sessionModeRouter = (context) => {
    return new Promise (function (resolve,reject) {
      let controller = new SessionModeController(context);
      controller.setupSessionModeRouter();
      resolve(controller.getRouter()); 
    });
  };