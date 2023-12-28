'use strict';

/**
 * Name:      sso-auth-controller.js
 * Desc:      Provide api to return the sessionMode related configurations
 * Author:    Furong Liu
 * Create DT: 2020-07-26
 * Copyright: © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */

const express = require('express');
//const cors = require('cors');
const Promise = require('bluebird');
const bodyParser = require('body-parser');
const { fstat } = require('fs-extra');
const SSO_CONFIG_PATH = '/ZLUX/pluginStorage/com.rs.ssoAuth/_internal/plugin/ssoServerConfig.json';
const bzdb = require('../../services/bzdb.service');
const constants = require('../../services/constants.service');
const authConfigSv = require('../../services/authConfigService');
class SsoAuthController {

    constructor(context){
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        this.instanceDir = context.plugin.server.config.user.instanceDir;
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

    setupSsoAuthRouter() {
        const logger = this.logger;
        const router = this.router;
        const context = this.context;
        logger.info('Setup sso auth router');
        let user;

        if (context.plugin && context.plugin.server && context.plugin.server.config && context.plugin.server.config.user) {
            user = context.plugin.server.config.user;
        }

        //router.use(cors());
        router.use(bodyParser.json({type:'application/json'}));

        router.get('/allow_iframe',  async(req,res) => {
            const ssoPath = `${this.instanceDir}${SSO_CONFIG_PATH}`;
            let allow_iframe = false;
            const result=await bzdb.select("authConfig",constants.metaDataBackupPath.sso)
            if(result.data && Array.isArray(result.data) && result.data.length>0){
                const data =result.data[0];
                allow_iframe = data && data.allow_iframe;
            }
            this.logger.info(`Get sso auth allow_iframe status success. Current allow_iframe status is ${allow_iframe}`);
            res.status(200).json({
                allow_iframe: allow_iframe
            });
        });

        /*
         * It should need to determine whether logged in based on the assert information.
         * If no assert info, it should login okta, otherwise login RTE web directly.
         * assert info generates in assert post request and remove after the secondary logon.
        */
        router.get('/login_status',  async(req,res) => {
            const data = authConfigSv.getSsoAssert(req.headers?.cookie);

            res.status(200).json({
                status: !!data
            });
        });

    }
}

exports.ssoAuthRouter = (context) => {
    return new Promise ((resolve,reject) => {
      let controller = new SsoAuthController(context);
      controller.setupSsoAuthRouter();
      resolve(controller.getRouter()); 
    });
  };