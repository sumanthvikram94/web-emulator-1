'use strict';

/**
 * Name:      no-auth-controller.js
 * Desc:      Provide api to return the sessionMode related configurations
 * Author:    Furong Liu
 * Create DT: 2019-01-07
 * Copyright: © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */

const express = require('express');
//const cors = require('cors');
const Promise = require('bluebird');
// const bodyParser = require('body-parser');
// const ClusterRequestService = require('../../../../bzshared/lib/services/cluster-request.service');
const bzdb = require('../../services/bzdb.service');
const authConfigService=require("../../services/authConfigService")

class NoAuthController {

    constructor(context){
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        // this.clusterReqService = new ClusterRequestService(context);
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

    setupNoAuthRouter() {
        const logger = this.logger;
        const router = this.router;
        const context = this.context;
        logger.info('Setup no auth router');
        let user;

        if (context.plugin && context.plugin.server && context.plugin.server.config && context.plugin.server.config.user) {
            user = context.plugin.server.config.user;
        }

        //router.use(cors());
        router.use(express.json({type:'application/json'}));

        // router.use((req, res, next) => {
        //     this.clusterReqService.redirectSlaveRequest(req, res, next);
        // });

        router.get('/', async (req,res) => {
            let isAnonymousAccessAllowed = false;
            let onlyDefaultGroupMode = false, enableAPI = false, navRecMode = false;;
            let defaultGroupName = '';
            if (user && user.dataserviceAuthentication) {
                isAnonymousAccessAllowed = user.dataserviceAuthentication.isAnonymousAccessAllowed || false;
                onlyDefaultGroupMode = user.dataserviceAuthentication.onlyDefaultGroupMode || false;
            }
            let dbEntity=authConfigService.getBZDBEntity('config');
            const result=await bzdb.select(dbEntity.entityName,dbEntity.filter);
            if(result.data && Array.isArray(result.data) && result.data.length>0){
                enableAPI = result.data[0].api || false;
                navRecMode = result.data[0].navRec || false;
            }

            if(isAnonymousAccessAllowed && !onlyDefaultGroupMode){
                const gResult = await bzdb.select('group', {isDefault: 'true'});
                if(gResult.rowCount> 0){
                    defaultGroupName =  gResult.data[0].groupName; 
                }
            }
            this.logger.info(`Get no auth status success. Current isAnonymousAccessAllowed status is ${isAnonymousAccessAllowed} and default group mode is ${onlyDefaultGroupMode}`);
            res.status(200).json({
                isAnonymousAccessAllowed: isAnonymousAccessAllowed,
                onlyDefaultGroupMode: onlyDefaultGroupMode,
                enableAPI,
                navRecMode,
                defaultGroupName
            });
        });

        router.get('/group/:groupName', async (req, res) => {
            let groupName = decodeURIComponent(req.params.groupName || '');
            groupName = groupName.toLowerCase();
            const result = await bzdb.select('group');
            // case insensitive for group name
            const group = result.data.filter(group => (group.groupName).toLowerCase() === groupName) || [];
            if (group.length > 0) {
                res.send(group[0]);
                logger.info(`Get group with group groupName "${groupName}" successful`);
                logger.debug(`Get group data: ${JSON.stringify(group[0])}`);
            } else {
                res.send(null);
                logger.warn(`Get group with group name "${groupName}" failed: The group is not exist.`);
            }
        });
    }
}

exports.noAuthRouter = (context) => {
    return new Promise ((resolve,reject) => {
      let controller = new NoAuthController(context);
      controller.setupNoAuthRouter();
      resolve(controller.getRouter()); 
    });
  };