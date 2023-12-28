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
// const BASE_PATH = '/instance/ZLUX/pluginStorage/com.rs.bzadm';
// const SESSIONSETTINGS_PATH = '/instance/ZLUX/pluginStorage/com.rs.bzadm/sessionSettings';
// const HOTSPOTS = '/hotspots';
// const LAUNCHPAD = '/launchpad';
// const KEYBOARDMAPPING = '/keyboardmapping';
// const PREFERENCES = '/preference';
// const InternalDataSteward = require('../../services/internal-data-steward.service');
// const InternalDataSteward = require('../../../../bzshared/lib/services/internal-data-steward.service');
// const DataEntities = require('../../services/data-entities.config');
const Utiles = require('../../services/utils.service');
const sessionSettingsService = require('../../services/session-settings.service');
const oAuth = require('../../../../bzshared/lib/services/oauth.service');
const bzdb = require('../../../../bzshared/lib/services/bzdb.service');
const Security = require('../../../../bzshared/lib/services/security.service')
const userSrc = require('../../../../bzshared/lib/apis/user-resource/user-resource-service');

class SessionSettingsRouter {

  constructor(context) {
    // this.dataSteward = InternalDataSteward.initWithContext(context);
    this.context = context;
    this.logger = context.logger;
    this.router = express.Router();
    this.sessionSettingDataService = sessionSettingsService.init(context);
    this.utiles = new Utiles(context);

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



  getSessionSettingsRouterRouter() {
    // const logger = this.logger;
    const router = this.router;

    router.use(express.json({ type: 'application/json' }));
		router.use(oAuth.defaultOAuthChecker());

    // router.get('/template/:type', (req, res) => {
    //   const type = req.params.type;
    //   if (type !== undefined) {
    //     this.sessionSettingDataService.getDefaultSessionConfigs(res, type);
    //   }else {
    //     res.status(404).json({ status: false, message: 'Missed session setting type.' });
    //   }
      
    // });
    // router.post('/', (req, res) => {
    //   if (!req.body) {
    //     res.status(404).json({status: false});
    //     logger.severe('Add/update session settings failed: Bad request, request body is empty!');
    //   }
    //   const type = req.body["type"];
    //   const name = req.body["name"];
    //   const id = req.body["id"]?req.body["id"] : '';
    //   const category = req.body["category"];
    //   this.sessionSettingDataService.createSessionSettingsPath();
    //   if (type !== undefined && name !== undefined) {
    //     if (!id) {
    //       this.utiles.getNewID(category, type, name).then(async (newId) => {
    //         await this.handleProcessSessionSettings(res, req, newId);
    //       });
    //     }else {
    //       this.handleProcessSessionSettings(res, req, id);
    //     }
    //   }else {
    //     res.status(404).json({ status: false, message: 'create session settings failed.' });
    //     this.logger.severe(`Create ${category} failed: type/name is undefined`);
    //   }
    // });

    router.put('/', async (req, res) => {
      if (!req.body) {
        this.logger.severe(`Update session setting failed: Bad request, request body is empty`);
        res.status(404).json({status: false});
      }
      const type = req.body['type'];
      const name = req.body['name'];
      const id = req.body['id']?req.body['id'] : '';
      const category = req.body['category'];

      if (type !== undefined && name !== undefined) {
        let isEdit = false;
        if (!id) { // this is create
          const existId = await this.utiles.getIdByName(category, name);
          if (existId !== '') { // Name already exists
            res.status(202).json({status: false, message: 'The name already exist'});
            this.logger.warn(`Duplicated name`);
            return;
          }
          const newId = bzdb.getUIDSync()
          const txnSSM = {dataEntityName: 'sessionSettingMapping', action:'UPDATEORINSERT', value: {
            id: newId,
            name,
            type
          }, options:{}};
          req['ssm'] = txnSSM;
          this.setExistSessionSettings(res, req, newId, isEdit);
        }else { // edit
          isEdit = true;
          this.setExistSessionSettings(res, req, id, isEdit);
        }

      }else {
        res.status(404).json({ status: false, message: 'create session settings failed.' });
        this.logger.severe(`Update session setting failed: type/name is undefined`);
      }
      

    });
  
    router.delete('/:name', async (req, res) => {
      let name = req.params.name;
      if(!!name){
        const id=await this.utiles.getIdByName("sessionSetting",name);
        name = Security.defendXSS(name)
        if(!!id){
            const result = await this.sessionSettingDataService.deleteSessionSetting(id);
            if (result && result.status === true){
              res.status(200).json(result);
              this.logger.info(`Delete session setting "${name}" successful`);
            } else {
              res.status(500).json(result);
              this.logger.info(`Delete session setting "${name}" failed`);
            }
        }else{
          res.status(202).json({ status: true });
          this.logger.severe(`delete session setting "${name}" failed: cannot find id`);
        }
      }else{
        res.status(404).json({ status: false });
        this.logger.severe(`Delete session setting failed: Bad request, name is undefined`);
      }
    });

    router.get('/:name', (req, res) => {
      const name = req.params.name;
      const type = req.query.type;
      this.sessionSettingDataService.getCurrentSessionSettingsConfigs(name, type).then(async (value) => {
        if (value) {
          if(value.pref!=undefined && value.pref.ind$FileTransfer!=undefined){
            await userSrc._decryptPasswordFiled(value.pref.ind$FileTransfer,"FilePass");
          }
          res.status(200).json({status: true, data: value});
          this.logger.info(`Get session setting "${name}" successful`);
        }else {
          res.status(200).json({status: false, data: ''});
          this.logger.severe(`Get session setting "${name}" failed.`);
        }
      })
    });
  }

  // async handleProcessSessionSettings(res, req, newId) {
  //   let createFileResult;
  //   if (newId) {
  //     const category = req.body["category"];
  //     if (category === 'sessionSetting') {
  //       createFileResult = await this.sessionSettingDataService.createSessionSettingsFile(req, newId);
  //     }else if(category === 'keyboard'){
  //       createFileResult = await this.sessionSettingDataService.createKeyboardFile(req, newId);
  //     }
  //     let result = { status: createFileResult, id: newId};
  //     if (createFileResult) {
  //       res.status(200).json(result);
  //       this.logger.info(`Create ${category} ${req.body["name"]} successful`);
  //     } else {
  //       res.status(200).json(result);
  //       this.logger.warn(`Create ${category} ${req.body["name"]} failed`);
  //     }
  //     this.logger.debug(`Create ${category} ${req.body["name"]} result: ${JSON.stringify(result)}`);
  //   } else {
  //     res.status(404).json({ status: false, message: 'create session settings failed.' });
  //     this.logger.severe(`Create ${category} ${req.body["name"]} failed: cannot get id`);
  //   }
  // }

  async setExistSessionSettings(res, req, id, isEdit) {
    const rs = await bzdb.select('preferenceShared', {id: id});
    if (isEdit && rs.rowCount === 0) {
      res.status(500).json({status: false, message: 'The data to edit doesn\'t exist'});
      this.logger.warn(`Data not exist`);
      return;
    }
    if (id) {
      const result = await this.sessionSettingDataService.editSessionSettingsFile(req, id);
      if (result && result.status === true) {
        res.status(200).json(result);
        this.logger.info(`Update session setting ${req.body["name"]} successful`);
      } else {
        res.status(500).json(result);
        this.logger.warn(`Update session setting ${req.body["name"]} failed`);
      }
      this.logger.debug(`Update session setting ${req.body["name"]} result: ${JSON.stringify(result)}`);
    } else {
      res.status(500).json({ status: false, message: 'The name already exits' });
      this.logger.warn(`Update session setting ${req.body["name"]} failed: cannot get id`);
    }
  }


  // getURL(req) {
  //   return `${req.protocol}://${req.headers.host}`;
  // }


}


exports.sessionSettingsRouter = (context) => {
  return new Promise(function (resolve, reject) {
    let controller = new SessionSettingsRouter(context);
    controller.getSessionSettingsRouterRouter();
    resolve(controller.getRouter());
  });
};