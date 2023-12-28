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
const Promise = require('bluebird');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');
const zoweService = require('../../services/zowe.service');
const Utils = require('../../../../bzshared/lib/services/utils.service');
const ClusterRequestService = require('../../../../bzshared/lib/services/cluster-request.service');
const authConfigService = require("../../services/authConfigService");
const {adminConfigService} = require('../../services/admin-config.service');
const bzdb = require('../../services/bzdb.service');
const constants = require('../../services/constants.service');

class CustomizationController {
    constructor(context) {
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        this.instanceDir = context.plugin.server.config.user.instanceDir;
        this.productDir = context.plugin.server.config.user.productDir;
        this.rootDir = context.plugin.server.config.user.rootDir;
        this.utils = Utils.init(this.logger);
        this.requestService = new ClusterRequestService(this.context);
        //this.authConfigObj = authConfigService.init(context);
        this.adminConfigObj = adminConfigService;  // BZ-18221, Admin can configure the max file size for uploading
        authConfigService.init(context).then((obj)=>{
			this.authConfigObj=obj;
		});
    }

  

    /**
     * Gettor of the router
     */
    getRouter() {
        return this.router;
    };

    setupAddSessionRouter() {
        const logger = this.logger;
        const router = this.router;
        const lanTranTable = {
            'English':'en-US',
            'Dutch':'nl',
            'French':'fr',
            'German':'',//'de'
            'Japanese':'',
            'Spanish':'es'
        }
        logger.info('Setup add session mode router');

        router.use(bodyParser.json({ type: 'application/json' }));

        router.get('/adminConfig', (req, res) => {
            // BZ-18221, Admin can configure the max file size for uploading
            const config = this.adminConfigObj.getConfig();
            res.json(config);
        });
        
        router.get('/configuration', async (req, res) => {
            
            const filePath = path.join(zoweService.getPluginProductFilePath(this.context,'com.rs.bzw'),'./defaults/defaultConfig.json');
        //    const filePath = this.productDir + '/ZLUX/pluginStorage/com.rs.bzw/defaults/defaultConfig.json';
            let data = {};

            if(fs.existsSync(filePath)) {
                data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            } else {
                this.logger.severe(`There is no such file, please check it.`);
            }

            const series = await bzdb.select('meta_config');
            if (series.rowCount > 0) {
               data.seriesNum = Buffer.from(series.data[0].value).toString('base64');
            }

           return res.status(200).json(data);
        });

        router.get('/configurationW2h', (req, res) => {
            const filePath = this.productDir + '/ZLUX/pluginStorage/com.rs.bzw2h/defaults/defaultConfig.json';
            let data = {};
 
            if(fs.existsSync(filePath)) {
                data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
             } else {
                 this.logger.severe(`There is no such file, please check it.`);
             }
 
            return res.status(200).json(data);
         });

        router.get('/existFile', async (req, res) => {
            const name = req.query.name || '';
            const filePath = path.resolve(this.rootDir + `/../app/bzw/web/assets/templates/${name}.html`);
            const exist = fs.existsSync(filePath);

            return res.status(200).json({exist, name});
        });
        router.get('/existFileW2h', async (req, res) => {
            const name = req.query.name || '';
            const filePath = path.resolve(this.rootDir + `/../app/bzw2h/web/assets/templates/${name}.html`);
            const exist = fs.existsSync(filePath);

            return res.status(200).json({exist, name});
        });
        router.get('/authOptions', (req,res) => {
            this.logger.debug(`get active datasource successfully`);
            const authConfig = this.authConfigObj;

            return res.status(200).json({ 
                'isHttpHeader': authConfig && authConfig.authConfig ? (authConfig.authConfig.isHttpHeader && ["fallback","ldap"].includes(authConfig.authConfig.defaultAuthentication)): false,
                'isIgnorePwd': authConfig && authConfig.authConfig ? (authConfig.authConfig.isIgnorePwd && authConfig.authConfig.defaultAuthentication === 'fallback'): false
            });
        });

        router.get('/globalLang', async (req, res) => {
            const pluginId = req.query.pluginId;
            if (!pluginId) {
                this.logger.severe('Bad request, please specify pluginId.');
                return res.status(404).json({ status: false });
            }

            const fileName = pluginId == 'com.rs.bzadm' ? 'serverSettings.json' : 'severSetting.json';

            const filePath = path.join(zoweService.getPluginInstanceFilePath(this.context),`./configurations/${fileName}`);
            // for bzw2h: temporary hide language selection
            const isBzw2hMode = this.context.plugin.server.config.user.bzw2hMode || false;
            let data = {globalLang: 'en-US', isBzw2hMode: isBzw2hMode};
            if (isBzw2hMode) {
                const result = await bzdb.select("configurations",constants.metaDataBackupPath.w2hServerSettings);
                if (result.data[0]) {
                    const serverdata = result.data[0];
                    data.globalLang = lanTranTable[serverdata.language] || 'en-US';
                }else{
                    data.globalLang = 'en-US';
                }
                return res.status(200).json(data);
            }else if(zoweService.isOnZowe){
                return res.status(200).json(data);
            }
            const result=await bzdb.select("configurations",constants.metaDataBackupPath.config)
            if(result.data && Array.isArray(result.data) && result.data.length>0){
                const fileData =result.data[0];
                data.globalLang = fileData.language || 'en-US';
            }else{
                this.logger.severe(`There is no such file ${filePath}, please check it.`);
            }
            return res.status(200).json(data);
         });
    }
}


exports.customizationRouter = (context) => {
    return new Promise(function (resolve, reject) {
        let controller = new CustomizationController(context);
        controller.setupAddSessionRouter();
        resolve(controller.getRouter());
    });
};