'use strict';

/**
 * Name:      session-mode-controller.js
 * Desc:      Provide api to return the sessionMode related configurations
 * Copyright: © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */

const express = require('express');
const Promise = require('bluebird');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const BASE_PATH = '/ZLUX/pluginStorage/com.rs.bzadm/sessionSettings';
const KEYBOARD_PATH = '/ZLUX/pluginStorage/com.rs.bzadm/sessionSettings/keyboardmapping';
const BZW_SYNC_PATH = '/ZLUX/plugins/com.rs.bzshared/services/syncMode';
const DEFAULT_PATH = '/ZLUX/pluginStorage/com.rs.bzadm/defaults';

// const InternalDataSteward = require('../../services/internal-data-steward.service');
// const InternalDataSteward = require('../../../../bzshared/lib/services/internal-data-steward.service');
const DataEntities = require('../../services/data-entities.config');
const Utiles = require('../../services/utils.service');
const sessionSettingsService = require('../../services/session-settings.service');
const bzdb = require('../../../../bzshared/lib/services/bzdb.service');
const Security = require('../../../../bzshared/lib/services/security.service');
const keymappingService = require('../../services/keyboard-mapping.service');

class KeyboardmappingRouter {

    constructor(context){
        // this.dataSteward = InternalDataSteward.initWithContext(context);
		// this.dataSteward.manage(DataEntities.keyboard);
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        this.instanceDir = this.context.plugin.server.config.user.instanceDir;
        this.productDir = this.context.plugin.server.config.user.productDir;
        this.utiles = new Utiles(context);
        this.sessionSettingDataService = sessionSettingsService.init(context);
        this.keymappingService = keymappingService.init(context, this.utiles);
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

    createDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
    }

    getKeyboardRouter() {
        const logger = this.logger;
        const router = this.router;
        logger.info('Setup keyboard router');
        router.use(bodyParser.urlencoded({limit: '10mb', extended: true}));
        router.use(bodyParser.json({type:'application/json',limit: '10mb'}));
        
        router.put('/', async (req, res) => {
            const data = req.body;
            this.keymappingService.add(data, res);
        });

        router.delete('/:name', async (req, res) => {
            let name = req.params.name;
            if(!!name){
              const id=await this.utiles.getIdByName("keyboard",name);
              name = Security.defendXSS(name)
              if(!!id){
                const batchTxnData = [
                    {dataEntityName: 'keyboardMapping', action:'DELETE', value: {}, options:{filter:{id}}},
                    {dataEntityName: 'keyboardMappingShared', action:'DELETE', value: {}, options:{filter:{id}}},
                ]
                const result = await bzdb.batchTxn(batchTxnData);
                if (result && result.status === true){
                    res.status(200).json(result);
                    logger.info(`Delete keyboard ${name} successful`);
                } else {
                    res.status(500).json(result);
                    logger.info(`Delete keyboard ${name} failed`);
                }
              }else{
                // res.status(202).json({ status: false });
                res.status(202).json({status: true});
                logger.severe(`Delete keyboard failed: Cannot find id for keyboard ${name}`);
              }
            }else{
              res.status(404).json({ status: false });
              logger.severe('Delete keyboard failed: Bad request, please specify keyboard name to be deleted.');
            }
        });

        router.get('/:type', (req, res) => {
            const type = req.params.type;
            const fileName = `default${type}KeyboardMapping.json`;
            this.readFilePromise(this.productDir + DEFAULT_PATH, fileName).then(data => {
                res.status(200).json({data: JSON.parse(data), status: true});
            }).catch(e => {
                logger.info(`get default${type}KeyboardMapping.json failed: ${e}`);
                res.status(200).json({data: e, status: false});
            });   
        })

        router.post('/upload', async (req, res) => {    //BZ-18070
            const data = req.body.data;
            const name = req.body.name;

            try {
                const isBinary = this.keymappingService.fileIsBinary(data);
                if (isBinary) {
                    this.logger.severe(`${name} is binary format`);
                    res.json({status: false, message: `'${name}' is not text format`}); 
                } else {
                    let type;
                    if(name.search(/\.mdk$/i) > -1) type = '3270';
                    else if(name.search(/\.adk$/i) > -1) type = '5250';
                    else if(name.search(/\.vdk$/i) > -1) type = 'VT';
                    const json = this.keymappingService.parseText(data, type);
                    if(!json) {
                        this.logger.severe(`${name} is invalid data format`);
                        return res.json({status: false, message: `'${name}' is invalid data format`});                          
                    }
                    const addData = {keyboardMapping: json.keyboardMapping,keyboardLanguage:json.keyboardLanguage,keyboardOptions:json.keyboardOption, name: name, terminalType: type, action: 'upload'};
                    this.keymappingService.add(addData, res);
                }
            } catch (e) {
                this.logger.severe(`Failed to import keyboard setting: ${name}\n${e.stack}`);
                return res.json({status: false, message: `Failed to import keyboard setting '${name}'`});
            }
           
        });

    }

    // getURL(req) {
    //     return  `${req.protocol}://${req.headers.host}`;
    // }

    // asyncGetKeyboardId(data) {
    //     if (data.id) {
    //         return new Promise((resolve, reject) => resolve(data.id));
    //     }
    //     return this.utiles.getNewID('keyboard', data.terminalType, data.name);
    // }

    readFilePromise(path, fileName, opts = 'utf8') {
        return new Promise((resolve, reject) => {
            if(!fs.existsSync(path)) {
                this.logger.info(`There is no default keyboard: ${fileName} in folder ${path}`);
                resolve(JSON.stringify([]));
            }
            fs.readFile(path+`/${fileName}`, opts, (err, data) => {
                if (err) reject(err)
                else resolve(data)
            })
        });
    }

}


exports.keyboardmappingRouter = (context) => {
    return new Promise ((resolve,reject) => {
      let controller = new KeyboardmappingRouter(context);
      controller.getKeyboardRouter();
      resolve(controller.getRouter()); 
    });
  };