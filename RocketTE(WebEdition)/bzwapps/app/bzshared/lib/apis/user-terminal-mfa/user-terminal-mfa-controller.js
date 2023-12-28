'use strict';

/**
 * Name:      user-terminal-mfa-controller.js
 * Desc:      Provide api to handle configuration settings
 * Author:    Furong Liu
 * Create DT: 2021-03-18
 * Copyright: © 2017-2021 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */
 const path = require('path');
 const zoweService = require('../../services/zowe.service');
 const encryption = zoweService.encryption;
 const jsonUtils = zoweService.jsonUtils;
const express = require('express');
//const cors = require('cors');
const Promise = require('bluebird');
const bzdb = require('../../services/bzdb.service');
const USER_TERMINAL_MFA_ENTITY = 'userTerminalMfa';
const sym = String.fromCharCode(255);
const PATH_BZA_DATA_SOURCE_SETTING = '/ZLUX/pluginStorage/com.rs.bzw/configurations/dataSourceSetting.json';
const rKey = Buffer.from([45, 116, 154, 81, 215, 123, 211, 238, 143, 184, 191, 134, 142, 53, 69, 143, 192, 179, 40, 219, 10, 83, 145, 72, 199, 67, 146, 248, 2, 245, 190, 113]);
const rIV= Buffer.from([45, 116, 154, 81, 215, 123, 211, 238, 143, 184, 191, 134, 142, 53, 69, 143]);
const shareConstants = require('../../services/constants.service');

class userTeminalMfaController {

    constructor(context){
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        this.getDataSource().then((data)=>{
            const dataSourceConfig = data.dataserviceDataSource;
            this.dataSource = dataSourceConfig && dataSourceConfig.defaultDataSource ? dataSourceConfig.defaultDataSource : 'fallback';
        });
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

    setupUserTeminalMfaRouter() {
        const logger = this.logger;
        const router = this.router;
        const context = this.context;
        logger.info('Setup shared userTeminalMfa router');
        let user;

        if (context.plugin && context.plugin.server && context.plugin.server.config && context.plugin.server.config.user) {
            user = context.plugin.server.config.user;
        }

        //router.use(cors());
        router.use(express.json());
        router.use(express.urlencoded({
            extended: true
        }));

        router.get('/policyName', async (req,res) => {
            const userId = decodeURIComponent(req.query.userId);
            if (!userId) {
                this.logger.warn(`Get user terminal mfa policyName failed: Bad request -- userId is missing`);
                res.status(400).send('Bad request: userId is missing');
                return
            }
            if (userId !== req.username) {
                this.logger.warn(`Get user terminal mfa policyName failed: Bad request -- userId is incorrect`);
                res.status(400).send('Bad request: userId is incorrect');
                return
            }
            const result = await this.getTerminalMfaData(userId);
            this.logger.info(`Get user terminal MFA policy name of ${userId} successful: ${JSON.stringify(result)}`);
            res.status(200).json(result);
        });

        router.put('/policyName/:userId', async (req,res) => {
            const userId = decodeURIComponent(req.params.userId || '');
            const newData = req.body.data;
            if (!userId) {
                this.logger.warn(`Update user terminal MFA policy name failed: Bad request, userId is missing`);
                res.status(400).send('Bad request: userId is missing');
                return;
            }
            if (userId !== req.username) {
                this.logger.warn(`update user terminal mfa policyName failed: Bad request -- userId is incorrect`);
                res.status(400).send('Bad request: userId is incorrect');
                return
            }
            if (!newData) {
                this.logger.warn(`Update user terminal MFA policy name failed: Bad request, data is missing`);
                res.status(400).send('Bad request: data is missing');
                return;
            }

            let data = await this.getTerminalMfaData(userId);
            Object.assign(data.zMFA, newData.zMFA || {});
            Object.assign(data.RMFA, newData.RMFA || {});
            data.timestamp = Date.now();
            const results = await bzdb.updateOrInsert(USER_TERMINAL_MFA_ENTITY, data);

            if (results && results.status) {
                this.logger.info(`Update user terminal MFA config successful.`);
                res.status(200).send({status: true, message: 'User terminal MFA config updated successful.'})
            } else {
                this.logger.warn(`Update user terminal MFA config failed:`);
                res.status(200).send({status: false, message: 'User terminal MFA config updated failed.'})
            }
        });

        router.get('/showPolicyName', async (req,res) => {
            if (!req.query.userId) {
                this.logger.warn(`Get user terminal mfa policyName failed: Bad request -- userId is missing`);
                res.status(400).send('Bad request: userId is missing');
                return
            }

            const userId = decodeURIComponent(req.query.userId);
            if (userId !== req.username) {
                this.logger.warn(`Get user terminal mfa policyName failed: Bad request -- userId is incorrect`);
                res.status(400).send('Bad request: userId is incorrect');
                return
            }
            let query = {};
            Object.keys(req.query).forEach(key => {
                query[(key || '').toLowerCase()] = req.query[key];
            })
            const zMFAShow = query.zmfaalwaysshowpolicynameui;
            const RMFAShow = query.rmfaalwaysshowpolicynameui;

            if (zMFAShow == undefined && RMFAShow == undefined) {
                this.logger.warn(`Get user terminal mfa policyName failed: Bad request -- userId is missing`);
                res.status(400).send('Bad request: Please use zMFAAlwaysShowPolicyNameUI or RMFAAlwaysShowPolicyNameUI to set if always show policy name UI');
                return
            }

            let data = await this.getTerminalMfaData(userId);
            data.timestamp = Date.now();
            data.zMFA.alwaysShowPolicyNameUI = this.getValue(data.zMFA.alwaysShowPolicyNameUI, zMFAShow);
            data.RMFA.alwaysShowPolicyNameUI = this.getValue(data.RMFA.alwaysShowPolicyNameUI, RMFAShow);

            const results = await bzdb.updateOrInsert(USER_TERMINAL_MFA_ENTITY, data);

            if (results && results.status) {
                this.logger.info(`Update alwaysShowPolicyName of user terminal MFA config successful.`);
                res.status(200).send({status: true, message: 'User terminal MFA config updated successful.'})
            } else {
                this.logger.warn(`Update alwaysShowPolicyName of user terminal MFA config failed:`);
                res.status(200).send({status: false, message: 'User terminal MFA config updated failed.'})
            }
        });

        router.get('/autoEnter', async (req,res) => {
            if (!req.query.userId) {
                this.logger.warn(`Get user terminal mfa autoEnter settings failed: Bad request -- userId is missing`);
                res.status(400).send('Bad request: userId is missing');
                return
            }

            const userId = decodeURIComponent(req.query.userId);
            if (userId !== req.username) {
                this.logger.warn(`Get user terminal mfa autoEnter settings failed: Bad request -- userId is incorrect`);
                res.status(400).send('Bad request: userId is incorrect');
                return
            }
            let query = {};
            Object.keys(req.query).forEach(key => {
                query[(key || '').toLowerCase()] = req.query[key];
            })
            const zMFAAutoEnter = query.zmfaautopressenter;
            const RMFAAutoEnter = query.rmfaautopressenter;

            if (zMFAAutoEnter == undefined && RMFAAutoEnter == undefined) {
                this.logger.warn(`Get user terminal mfa autoEnter settings failed: Bad request -- userId is missing`);
                res.status(400).send('Bad request: Please use zMFAAutoPressEnter or RMFAAutoPressEnter to set if auto press enter after auto fill MFA ctc');
                return
            }

            let data = await this.getTerminalMfaData(userId);
            data.timestamp = Date.now();
            data.zMFA.autoPressEnter = this.getValue(data.zMFA.autoPressEnter, zMFAAutoEnter);
            data.RMFA.autoPressEnter = this.getValue(data.RMFA.autoPressEnter, RMFAAutoEnter);

            const results = await bzdb.updateOrInsert(USER_TERMINAL_MFA_ENTITY, data);

            if (results && results.status) {
                this.logger.info(`Update autoPressEnter of user terminal MFA config successful.`);
                res.status(200).send({status: true, message: 'User terminal MFA config updated successful.'})
            } else {
                this.logger.warn(`Update autoPressEnter of user terminal MFA config failed:`);
                res.status(200).send({status: false, message: 'User terminal MFA config updated failed.'})
            }
        });

        router.post('/encryptCtc', (req,res) => {
            const body = req.body;
            const ctc = body.ctc;
            if (!ctc) {
                this.logger.warn(`Encrypt user terminal MFA ctc failed: Bad request, data is missing`);
                res.status(400).send('Bad request: data is missing');
                return;
            }

            try {
                const key = this.generateRKey(req.username);
                // const key = 'dingisinsdiengindiengindinwsdedo';
                const result = encryption.encryptWithKeyAndIV(ctc, key, rIV);
                this.logger.info(`Encrypt user terminal MFA ctc successful.`);
                res.status(200).send({status: true, data: result})
            }
            catch(e) {
                this.logger.warn(`Encrypt user terminal MFA ctc failed: ${e}`);
                res.status(200).send({status: false, message: 'Encrypt user terminal MFA ctc failed.'})
            }
        });

        router.post('/decryptCtc', (req,res) => {
            const body = req.body;
            const ctc = body.ctc;
            if (!ctc) {
                this.logger.warn(`Decrypt user terminal MFA ctc failed: Bad request, data is missing`);
                res.status(400).send('Bad request: data is missing');
                return;
            }

            try {
                const key = this.generateRKey(req.username);
                const result = encryption.decryptWithKeyAndIV(ctc, key, rIV);
                this.logger.info(`Decrypt user terminal MFA ctc successful.`);
                res.status(200).send({status: true, data: result})
            }
            catch(e) {
                this.logger.warn(`Decrypt user terminal MFA ctc failed: ${e}`);
                res.status(200).send({status: false, message: 'Decrypt user terminal MFA ctc failed.'})
            }
        });

    }

    async getTerminalMfaData(userId) {
        const id = this.getId(userId);
        const initData = {
            id: id,
            zMFA: {},
            RMFA: {}
        };
        const selectResult = await bzdb.select(USER_TERMINAL_MFA_ENTITY, {id: id});
        const exist = selectResult && selectResult.rowCount === 1;
        return exist ? selectResult.data[0] : initData;
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
        const result=await bzdb.select("configurations",shareConstants.metaDataBackupPath.datasource);
        if(result && result.data && result.data.length>0){
          jsonData= result.data[0]; 
        }
        return jsonData;
    }

    getId(userId) {
        return this.dataSource + sym + userId;
    }

    getValue(oldData, newData) {
        if (!newData) return oldData || false;
        const data = newData.toLowerCase();
        if (data !== 'true' && data !== 'false') return oldData || false;
        return data === 'true';
    }

    generateRKey(username) {
        if (!username) return rKey;
        return Buffer.concat([Buffer.from(username), rKey], 32);
    }
}

exports.userTerminalMfaRouter = (context) => {
    return new Promise ((resolve,reject) => {
      let controller = new userTeminalMfaController(context);
      controller.setupUserTeminalMfaRouter();
      resolve(controller.getRouter()); 
    });
  };