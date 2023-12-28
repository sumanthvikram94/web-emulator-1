'use strict';

/**
 * Name:      language-controller.js
 * Desc:      Provide api to handle language settings
 * Author:    Furong Liu
 * Create DT: 2021-01-26
 * Copyright: © 2017-2021 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */

const path = require('path');
const express = require('express');
//const cors = require('cors');
const Promise = require('bluebird');
const bodyParser = require('body-parser');
const zoweService = require('../../services/zowe.service');
const jsonUtils = zoweService.jsonUtils;
const bzdb = require('../../services/bzdb.service');
const constants = require('../../services/constants.service');
const PATH_BZA_DATA_SOURCE_SETTING = '/ZLUX/pluginStorage/com.rs.bzw/configurations/dataSourceSetting.json';

const sym = String.fromCharCode(255);

// the language list is from 'app\bzadm\webClient\src\app\global.ts'
const SUPPORTED_LANS = ['en-US', 'fr', 'es', 'it', 'de', 'nl']; // BZ-19321

class LanguageController {

    constructor(context){
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        this.defaultDataSource = { "defaultDataSource": 'fallback' };
        //const dataSourceConfig = this.getDataSource().dataserviceDataSource;
        this.getDataSource().then((data)=>{
            const dataSourceConfig= data.dataserviceDataSource || this.defaultDataSource ;
            this.dataSource = this.dataSourceConfig && dataSourceConfig.defaultDataSource ? dataSourceConfig.defaultDataSource : 'fallback';
        })
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

    setupLanguageRouter() {
        const logger = this.logger;
        const router = this.router;
        const context = this.context;
        logger.info('Setup no auth router');
        let user;

        if (context.plugin && context.plugin.server && context.plugin.server.config && context.plugin.server.config.user) {
            user = context.plugin.server.config.user;
        }

        //router.use(cors());
        router.use(express.json());
        router.use(express.urlencoded({
            extended: true
        }));

        router.get('/', async (req,res) => {
            const userId = decodeURIComponent(req.query.userId);
            const pluginId = req.query.pluginId;
            const results = await bzdb.select('userLanguage', {id: this.getId(userId, pluginId)});
            const langObj = !results || results.rowCount === 0 ? {} : results.data[0];
            if (langObj && langObj.hasOwnProperty('language')) {
                if (!SUPPORTED_LANS.includes(langObj.language)) {
                    langObj.language = SUPPORTED_LANS[0]
                }
            }
            this.logger.info(`Get language of user ${userId} successful: ${JSON.stringify(langObj)}`);
            res.status(200).json(langObj);
        });

        router.put('/:userId', async (req,res) => {
            const userId = decodeURIComponent(req.params.userId || '');
            if (!userId) {
                this.logger.warn(`Update language of user ${userId} failed: Bad request -- userId is missing`);
                res.status(400).send('Bad request: userId is missing');
                return
            }
            const pluginId = req.headers.pluginid;
            const language = req.body.language;
            if (!language) {
                this.logger.warn(`Update language of user ${userId} failed: Bad request -- language is missing`);
                res.status(400).send('Bad request: language is missing');
                return
            } else {
                const results = await bzdb.updateOrInsert('userLanguage', {
                    id: this.getId(userId, pluginId),
                    timestamp: Date.now(),
                    language: language
                });

                if (results && results.status) {
                    this.logger.info(`Update language of user ${userId} successful: ${language}`);
                    res.status(200).send({status: true, message: 'User language updated successful.'})
                } else {
                    this.logger.warn(`Update language of user ${userId} failed:`);
                    res.status(200).send({status: false, message: 'User language updated successful.'})
                }
            }
        });


    }

    async getDataSource() {
        // const basePath = this.context.plugin.server.config.user.instanceDir;
        // const fileName = path.resolve(basePath + PATH_BZA_DATA_SOURCE_SETTING);
        // let jsonData = {};
        // if (fs.existsSync(fileName)) {
        //   jsonData = jsonUtils.parseJSONWithComments(fileName);
        // }
        // return jsonData;
        let jsonData = {};
        const result=await bzdb.select("configurations",constants.metaDataBackupPath.datasource);
        if(result && result.data && result.data.length>0){
          jsonData= result.data[0]; 
        }
        return jsonData;
    }

    getId(userId, pluginId) {
        const plugin = pluginId === 'com.rs.bzadm' ? 'bza' : 'bzw';
        const source = pluginId === 'com.rs.bzadm' ? 'fallback' : this.dataSource;
        return plugin + sym + source + sym + userId;
    }
}

exports.languageRouter = (context) => {
    return new Promise ((resolve,reject) => {
      let controller = new LanguageController(context);
      controller.setupLanguageRouter();
      resolve(controller.getRouter()); 
    });
  };