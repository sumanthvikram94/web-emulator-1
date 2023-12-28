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
// const bzdb = require('../../services/bzdb.service');
const Utiles = require('../../services/utils.service');

class OAuthController {

    constructor(context){
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        this.utiles = Utiles.init(this.logger);
        this.rootRedirectURL = this.context.plugin.server.config.app.rootRedirectURL;
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

    setupAuthRouter() {
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

        router.post('/', (req,res) => {
            res.redirect(this.utiles.getURL(req, this.context) + this.bzadmRedirectURL + `&authorization=${req.headers.authorization}`);
        });

        router.get('/', (req,res) => {
            res.redirect(this.utiles.getURL(req, this.context) + this.rootRedirectURL + `&authorization=${req.headers.authorization}`);
        });

    }
}

exports.oAuthRouter = (context) => {
    return new Promise ((resolve,reject) => {
      let controller = new OAuthController(context);
      controller.setupAuthRouter();
      resolve(controller.getRouter()); 
    });
  };