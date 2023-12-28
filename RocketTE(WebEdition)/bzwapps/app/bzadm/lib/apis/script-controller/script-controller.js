'use strict';

/**
 * Name:      script-controller.js
 * Desc:      Provide api to return the sessionMode related configurations
 * Copyright: © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */

const express = require('express');
const Promise = require('bluebird');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
// const BASE_PATH = '/ZLUX/pluginStorage/com.rs.bzadm/sessionSettings';
// const KEYBOARD_PATH = '/ZLUX/pluginStorage/com.rs.bzadm/sessionSettings/keyboardmapping';
// const BZW_SYNC_PATH = '/ZLUX/plugins/com.rs.bzshared/services/syncMode';
const DEFAULT_PATH = '/ZLUX/pluginStorage/com.rs.bzadm/defaults';

// const InternalDataSteward = require('../../services/internal-data-steward.service');
// const InternalDataSteward = require('../../../../bzshared/lib/services/internal-data-steward.service');
const DataEntities = require('../../services/data-entities.config');
const Utiles = require('../../services/utils.service');
const bzdb = require('../../../../bzshared/lib/services/bzdb.service');
const Security = require('../../../../bzshared/lib/services/security.service');
// const keymappingService = require('../../services/keyboard-mapping.service');
const scriptService = require('../../services/script.service');

class ScriptRouter {

    constructor(context){
        // this.dataSteward = InternalDataSteward.initWithContext(context);
		// this.dataSteward.manage(DataEntities.keyboard);
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        this.instanceDir = this.context.plugin.server.config.user.instanceDir;
        this.productDir = this.context.plugin.server.config.user.productDir;
        this.utiles = new Utiles(context);
        this.scriptService = scriptService.init(context, this.utiles);
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

    getScriptRouter() {
        const logger = this.logger;
        const router = this.router;
        logger.info('Setup script router');
        router.use(bodyParser.urlencoded({limit: '2mb', extended: true}));
        router.use(bodyParser.json({type:'application/json',limit: '2mb'}));
        
        router.put('/', async (req, res) => {
            const data = req.body;
            this.scriptService.add(data, res);
        });

        router.delete('/:scriptId', async (req, res) => {
            let scriptId = req.params.scriptId;
            let name = req.query.name;
            
            if(!!scriptId){
                let batchTxnData = [];
                const scriptShared = await bzdb.select('scriptShared',{id:scriptId});
                if(scriptShared.rowCount === 1 && ( scriptShared.data[0].status === 'public' || scriptShared.data[0].status === 'groups' )){
                    const group = await bzdb.select('group');
                    group.data.forEach(g => {
                        if(g.scripts?.includes(scriptId)){
                            g.scripts.splice(g.scripts.findIndex(item => item === scriptId), 1)
                            batchTxnData.push({dataEntityName: 'group', action:'UPDATEORINSERT', value: g})
                        }
                    })
                }
                
                batchTxnData.push({dataEntityName: 'scriptShared', action:'DELETE', value: {}, options:{filter:{id:scriptId}}})
                const relationDateBatchTxnData = await this.scriptService.removeRelation(scriptId,name,'delete');
                batchTxnData.push(...relationDateBatchTxnData);
                const result = await bzdb.batchTxn(batchTxnData);
                if (result && result.status === true){
                    res.status(200).json(result);
                    logger.info(`Delete script '${name}' successful`);
                } else {
                    res.status(500).json(result);
                    logger.info(`Delete script '${name}' failed`);
                }
            }else{
                res.status(200).json({status: false,message:`Delete script '${name}' failed` });
                logger.severe(`Delete script failed: Cannot find id for script '${name}' `);
            }
        });

        router.get('/', async (req, res) => {
            let scriptSharedList = [];
            try {
                scriptSharedList = await bzdb.select('scriptShared');
                if(scriptSharedList.rowCount > 0){
                    scriptSharedList.data.map(d=> delete d.script);
                }
            }catch(e) {
                this.logger.info(`get script list failed \n ${e.stack}`);
                res.status(500).json({status: false, message: e.message});
            } 
            res.status(200).json({status: true, text: scriptSharedList.data});
            // const fileName = `default${type}KeyboardMapping.json`;
            // this.readFilePromise(this.productDir + DEFAULT_PATH, fileName).then(data => {
            //     res.status(200).json({data: JSON.parse(data), status: true});
            // }).catch(e => {
            //     logger.info(`get default${type}KeyboardMapping.json failed: ${e}`);
            //     res.status(200).json({data: e, status: false});
            // });   
        })

        // router.get('/', async (req, res) => {
        //     let result = {};
        //     const scriptId = req.query.script
        //     console.log(req.params);
        //     if(scriptId){
        //         const sharedScript = await bzdb.select('scriptShared', {id:scriptId});
        //         if(!sharedScript){
        //             this.logger.server(`Get script num unsuccessful,The script does not exist`);
        //             this.logger.debug(`Get script failed ,the scriptId is :  ${scriptId}`);
        //             res.status(200).json({data: 'The script does not exist', status: false});
        //         }
                
        //         const sessionShared = await bzdb.select('sessionShared');
        //         if(sessionShared.rowCount > 0){
        //             let sessionCount = 0
        //             for(const s of sessionShared.data){
        //                 sessionCount += (s.advanced && s.advanced.autoRunScript === scriptId) ? 1 : 0;
        //             }
        //             result['sessionCount'] = sessionCount;

        //         }
        //         const hotspot = await bzdb.select('hotspotShared');
        //         if(hotspot.rowCount > 0){
        //             let hotspotCount = 0
        //             for(const hp of hotspot.data){
        //                 hotspotCount += hp.hotspotDefs.filter(d =>d.actionValue === scriptId).length || 0;
        //             }
        //             result['hotspotCount'] = hotspotCount;

        //         }

        //         const launchpad = await bzdb.select('launchpadShared');
        //         if(launchpad.rowCount > 0 ){
        //             let launchpadCount = 0;
        //             for(const lp of launchpad.data){
        //                 launchpadCount += lp.launchpad.filter(d =>d.action === scriptId).length|| 0;
        //             }
        //             result['launchpadCount'] = launchpadCount;

        //         }
                
        //         const keyboard = await bzdb.select('keyboardMappingShared');
        //         if(keyboard.rowCount > 0 ){
        //             let keyboardCount = 0;
        //             for(const kb of keyboard.data){
        //                 kb.keyboardMapping.map(kbmaping => {
        //                     keyboardCount += kbmaping.mapping.filter(mapping => mapping.value === scriptId && mapping.type === 'KEYMAP_TYPE_SCRIPT').length || 0;
        //                 })
        //             }
        //             result['keyboardCount'] = keyboardCount;
        //         }

        //         this.logger.info(`Get script num successful`);
        //         this.logger.debug(`Get script data: ${result}`);
        //         res.status(200).json({data: result, status: true});
        //     }else{
        //         this.logger.server(`Get the parameter 'scriptId' unsuccessful,the scriptId is :  ${scriptId}`);
        //         res.status(200).json({data: `The parameter 'scriptId' does not exist`, status: false});
        //     }
        // });


        router.post('/upload', async (req, res) => {
            this.scriptService.upload(req,res)  ;
        });

        router.put('/rename', async (req, res) => {
            this.scriptService.rename(req,res)  ;
        });
        
        router.put('/shareScript', async (req, res) => {
            const data = req.body;
            this.scriptService.shareScript(data, res);
        });
    }
}


exports.scriptRouter = (context) => {
    return new Promise ((resolve,reject) => {
      let controller = new ScriptRouter(context);
      controller.getScriptRouter();
      resolve(controller.getRouter()); 
    });
  };