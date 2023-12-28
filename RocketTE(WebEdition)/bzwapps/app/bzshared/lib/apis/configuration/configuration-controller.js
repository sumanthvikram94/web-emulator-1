'use strict';

/**
 * Name:      configuration-controller.js
 * Desc:      Provide api to handle configuration settings
 * Author:    Furong Liu
 * Create DT: 2021-03-18
 * Copyright: © 2017-2021 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */

const express = require('express');
//const cors = require('cors');
const fs = require('fs-extra');
const Promise = require('bluebird');
const bodyParser = require('body-parser');
const path = require('path');
const bzdb = require('../../services/bzdb.service');
const TERMINAL_MFA_ENTITY = 'terminalMfa';
const TERMINAL_MFA_CONFIG_ID = 'terminal_mfa_config_id';
const authConfigService=require("../../services/authConfigService")
const {adminConfigService} = require('../../services/admin-config.service');
const zoweService = require('../../services/zowe.service');
const deployDirectory = {
    instanceZluxPath: "deploy/instance/ZLUX",
    productZluxPath:  "deploy/product/ZLUX",
    pluginStorageFolder: "pluginStorage",
    pluginFolder: "plugins",
    serverConfigFolder: "serverConfig",
}
let BASE_PATH = path.join(process.cwd(), '../');  // zoweService.isOnZowe? path.join(process.cwd(), '../../../zoweInstance') :path.join(process.cwd(), '../');
// const BZADMIN_NAME = 'com.rs.bzadm';
const BZSHARED_NAME = 'com.rs.bzshared';
const INSTALLATION_FILE = "/configurations/installation.json";
class ConfigurationController {

    constructor(context){
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        authConfigService.init(context).then((obj)=>{
            this.authConfigObj=obj;
        });
        this.adminConfigObj = adminConfigService;
        if(zoweService.isOnZowe){
            BASE_PATH = this.context.plugin.server.config.user.productDir
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

    setupConfigurationRouter() {
        const logger = this.logger;
        const router = this.router;
        const context = this.context;
        logger.info('Setup shared configuration router');
        let user;

        if (context.plugin && context.plugin.server && context.plugin.server.config && context.plugin.server.config.user) {
            user = context.plugin.server.config.user;
        }

        //router.use(cors());
        router.use(express.json());
        router.use(express.urlencoded({
            extended: true
        }));

        router.get('/terminalMfa', async (req,res) => {
            const data = await this.getTerminalMfaData();
            this.logger.info(`Get terminal MFA config successful: ${JSON.stringify(data)}`);
            // const result = JSON.parse(JSON.stringify(data));
            // res.status(200).json(result);
            res.status(200).json(data);
        });
        
        router.put('/terminalMfa', async (req,res) => {
            const newData = req.body.data;
            if (!newData) {
                this.logger.warn(`Update terminal MFA config failed: Bad request, data is missing`);
                res.status(400).send('Bad request: language is missing');
                return;
            }
            const originData = await this.getTerminalMfaData();
            let data = Object.assign(originData.data, newData, {id: TERMINAL_MFA_CONFIG_ID,  timestamp: Date.now()});
            let results = {};

            if (originData.exist) {
                delete data.id;
                results = await bzdb.update(TERMINAL_MFA_ENTITY, {id: TERMINAL_MFA_CONFIG_ID}, data); 
            } else {
                results = await bzdb.insert(TERMINAL_MFA_ENTITY, data);
            }

            if (results && results.status) {
                this.logger.info(`Update terminal MFA config successful.`);
                res.status(200).send({status: true, message: 'Terminal MFA config updated successful.'})
            } else {
                this.logger.warn(`Update terminal MFA config failed:`);
                res.status(200).send({status: false, message: 'Terminal MFA config updated failed.'})
            }
        });

        router.get('/adminConfig', async (req,res) => {
            const configured = this.adminConfigObj.getAdminConfig();
            const shareFS = !!(process.env.RTE_CLUSTER_ON_SHARED_FS && process.env.RTE_CLUSTER_ON_SHARED_FS === 'true'); //hide cluster page in shareFS mode

            if(req.query.key === 'userReport') {
                const enableUserReport = configured.enableUserReport;
                this.logger.info(`Get admin config successful: ${JSON.stringify(configured)}`);
                // const result = JSON.parse(JSON.stringify(data));
                // res.status(200).json(result);
                res.status(200).json({enableUserReport, enableCluster: !shareFS});
            } else if(req.query.key === 'bzw') {
                const data = JSON.parse(JSON.stringify(configured));
                const {IPWhiteList, enableUserReport, groupPrivilegeScope, maxPowerpadRow, preCheckEditableField, restrictRemoteAddress, copyFullPage4Unselect, enablePasswordRecord} = configured 

                res.status(200).json({IPWhiteList, enableUserReport, groupPrivilegeScope, maxPowerpadRow, preCheckEditableField, restrictRemoteAddress, copyFullPage4Unselect, enablePasswordRecord, enableCluster: !shareFS});
            } else {
                res.status(200).json({configured});
            }  
        });

        router.get('/installation', (req, res) => {
            let fileName = this.getFileName("installation","instance");
            let data = {
                introduce: {
                  show: true,
                  isActive: false
                },
                configure: {
                  start: true,
                  show: true,
                  isActive: true,
                  steps: {
                    auth: false,
                    user: false,
                    session: true,
                    group: false
                  }
                },
                upgrade: {
                  show: true,
                  start: true,
                  isActive: true
                }
              };
            if (fs.existsSync(fileName)) {
                data = JSON.parse(fs.readFileSync(fileName));
            } else {
                fileName=this.getFileName("installation","product");
                data = JSON.parse(fs.readFileSync(fileName));
            }
            res.status(200).json({data});
            logger.info(`Get the content of ${fileName} successful`);
        });

        router.put('/installation', (req, res) => {
            const data = req.body;
            //const dir = folder + SERVER_FILE;
            let fileName = this.getFileName("installation","instance");
            this.createDirs(fileName);

            fs.writeFile(fileName, JSON.stringify(data,null, 2), { mode: 0o644 }, (err) => {
                let message = '';
                if (err) {
                    message = `I/O error when update data`;
                    res.status(500).json({ error: message });
                    logger.severe(`${message};${fileName}`);
                } else {
                    message = 'Update serverSetting file successfully';
                    res.status(200).json({ success: true, message: message, data: data });
                    logger.info(message);
                    logger.debug(`Update ${fileName} successful: ${JSON.stringify(data)}`);

                }
            });
        })

        router.get('/serverConfig/:type', (req, res) => {
            let type = req.params.type;
            res.setHeader("Content-Type", "text/typescript");
            if (type === "cookieTimeoutMs") {
                const zluxServerConfig = this.authConfigObj.zluxServerConfig;
                if(zluxServerConfig && zluxServerConfig.node 
                    && zluxServerConfig.node.session && zluxServerConfig.node.session.cookie)
                {
                    res.status(200).json({ 'data': zluxServerConfig.node.session.cookie }); //cookie's timeoutMS
                    logger.debug(`Get data for ${type}: ${JSON.stringify(zluxServerConfig.node.session.cookie)}`);
                }else {
                    res.status(200).json({ 'data': {} });
                }
            }
            logger.info(`Get server config for ${type} success`);
        });
    }

    getFileName(type,isProduct) {
        if (type === 'installation') {
            if (isProduct != "undefinded" && isProduct === "product") {
                return path.join(zoweService.getPluginProductFilePath(this.context),INSTALLATION_FILE);
            }else{
                return path.join(zoweService.getPluginInstanceFilePath(this.context),INSTALLATION_FILE);
            }
            // return path.join(BASE_PATH, containerPath, deployDirectory.pluginStorageFolder, BZSHARED_NAME, INSTALLATION_FILE)
        }
    }

    createDirs(dirpath) {
        if(dirpath.indexOf(".json")>0){
           dirpath=path.dirname(dirpath); 
        }
        if (!fs.existsSync(path.dirname(dirpath))) {
            this.createDirs(path.dirname(dirpath));
        }
        if (!fs.existsSync(dirpath)) {
            fs.mkdirSync(dirpath);
        }
     }

    async getTerminalMfaData() {
        const initData = {
            id: TERMINAL_MFA_CONFIG_ID,
            zMFA: {
                serverURL: '',
                policyName: [],
                host: '*'
            },
            RMFA: {
                serverURL: '',
                policyName: [],
                host: '*'
            }
        };
        const selectResult = await bzdb.select(TERMINAL_MFA_ENTITY, {id: TERMINAL_MFA_CONFIG_ID});
        const exist = selectResult && selectResult.rowCount === 1;
        return {exist: exist, data: exist ? selectResult.data[0] : initData};
    }
}

exports.configurationRouter = (context) => {
    return new Promise ((resolve,reject) => {
      let controller = new ConfigurationController(context);
      controller.setupConfigurationRouter();
      resolve(controller.getRouter()); 
    });
  };