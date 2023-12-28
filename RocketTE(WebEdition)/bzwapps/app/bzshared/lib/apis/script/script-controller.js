'use strict';

/**
 * Name:      script-controller.js
 * Desc:      Provide api to return the sessionMode related configurations
 * Copyright: © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */

 const express = require('express');
 const cors = require('cors');
 const Promise = require('bluebird');
 // const bodyParser = require('body-parser');
 // const DataEntities = require('../../model/data-entities.config');
 const ClusterRequestService = require('../../services/cluster-request.service');
 const zoweService = require('../../services/zowe.service');
 const configjs_bzw_url = '/ZLUX/plugins/' + zoweService.configJsName 
                      + '/services/data' + zoweService.defaltAPIVersion + '/com.rs.bzw';
 const configjs_bzshared_url = '/ZLUX/plugins/' + zoweService.configJsName 
                      + '/services/data' + zoweService.defaltAPIVersion + '/com.rs.bzshared';
 const oauth = require('../../services/oauth.service');
 // const ResourcePool = require('../../services/resource-pool.service');
 const bzdb = require('../../services/bzdb.service');
 const Utils = require('../../services/utils.service');
 const errorHandler = require('../../services/error.service.js');
 const Security = require('../../services/security.service');
 const path = require('path');
 const fs = require('fs');
 const BASE_PATH = path.join(process.cwd(), '../');
 
 class ScriptController {
 
     constructor(context){
         this.context = context;
         this.logger = context.logger;
         this.router = express.Router();
         this.utils = Utils.init(this.logger);
         this.clusterReqService = new ClusterRequestService(context);
         this.serverConfig = context.plugin.server.config;
         this.instanceDir = this.context.plugin.server.config.user.instanceDir;
         this.user = context.plugin.server.config.user;
         this.dataAuthentication = this.user.dataserviceAuthentication;
         this.productDir = this.context.plugin.server.config.user.productDir;
         this.cacheEnabled = false;
         // deprecated
         // this.isSlave = false;
         // if (this.serverConfig.user.bzwCluster && this.serverConfig.user.bzwCluster.nodeType === 'slave' && this.serverConfig.user.bzwCluster.masterOrigin){
         //     this.isSlave = true;
         //     this.logger.info('User resource work in secondary node mode');
         // }else 
         if (this.serverConfig.user.enableUserResourceCaching) {
             this.cacheEnabled = true;
             this.logger.info('User resource work in cache mode');
             // this.poolService = new ResourcePool(context);
         }else{
             this.logger.info('User resource work in noCache mode');
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

    createDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
    }

    getScriptRouter() {
        const logger = this.logger;
        const router = this.router;
        logger.info('Setup script router');

        router.delete('/script',async (req,res) => {
            let name=req.query.name ;
            const userId = req.headers.username;
            if(!!name){
                let batchTxnData = [{dataEntityName: 'scriptPrivate', action:'DELETE', value: {}, options:{filter:{name,username:userId}}}]

                const preferencePrivate = await bzdb.select('preferencePrivate');
                if(preferencePrivate.rowCount > 0){
                    for(const s of preferencePrivate.data){
                        if(s.userId === userId && s.advanced && s.advanced.autoRunScript === name){
                            s.advanced.autoRunScript = '';
                            batchTxnData.push({dataEntityName: 'preferencePrivate', action:'UPDATEORINSERT', value: s})
                            logger.debug(`Delete script '${name}' in preferencePrivate '${s.name}' successful`);
                        }
                    }
                }

                const hotspotPrivate = await bzdb.select('hotspotPrivate');
                if(hotspotPrivate.rowCount > 0){
                    let hashotspotPrivate = false;
                    for(const hp of hotspotPrivate.data){
                        if(hp.userId === userId){
                            for (let i =hp.hotspotDefs.length -1; i >=0; i --){
                                if(hp.hotspotDefs[i].actionValue === name && hp.hotspotDefs[i].actionType == 'KEYMAP_TYPE_SCRIPT'){
                                    logger.debug(`Delete script '${name}' in hotspotPrivate '${hp.hotspotDefs[i].textToMatch}' successful`);
                                    hp.hotspotDefs[i].actionType = 'Unmapped';
                                    hp.hotspotDefs[i].actionValue = '';
                                    // hp.hotspotDefs.splice(i,1);
                                    hashotspotPrivate = true;
                                }
                            }
                            if(hashotspotPrivate){
                                batchTxnData.push({dataEntityName: 'hotspotPrivate', action:'UPDATEORINSERT', value: hp})
                                hashotspotPrivate = false;
                            }
                        }
                    }
                }

                const keyboardPrivate = await bzdb.select('keyboardMappingPrivate');
                if(keyboardPrivate.rowCount > 0 ){
                    let haskeyboardPrivate = false;
                    for(const kb of keyboardPrivate.data){
                        if(kb.userId === userId ){
                            for(let k = kb.keyboardMapping.length-1; k>=0; k -- ){
                                let kbmaping = kb.keyboardMapping[k];
                                let tmpMapping = 0;
                                for(let i=0; i<kbmaping.mapping.length;i++ ){
                                    if(kbmaping.mapping[i] && kbmaping.mapping[i].value === name && kbmaping.mapping[i].type === 'KEYMAP_TYPE_SCRIPT'){
                                        kbmaping.mapping[i] = null;
                                        haskeyboardPrivate = true;
                                        logger.debug(`Delete script '${name}' in keyboardMappingPrivate '${kb.name}' and the key is '${kbmaping.key}' successful`);
                                    }
                                    if(kbmaping.mapping[i] == null){
                                        tmpMapping++
                                    }
                                }
                                if(tmpMapping == kbmaping.mapping.length){
                                    kb.keyboardMapping.splice(k,1);
                                }
                            }
                            if(haskeyboardPrivate){
                                batchTxnData.push({dataEntityName: 'keyboardMappingPrivate', action:'UPDATEORINSERT', value: kb})
                                haskeyboardPrivate = false;
                            }
                        }
                    }
                }


                const launchpadPrivate = await bzdb.select('launchpadPrivate');
                if(launchpadPrivate.rowCount > 0 ){
                    let haslaunchpadPrivate = false;
                    for(const lp of launchpadPrivate.data){
                        if(lp.userId === userId ){
                            for(let i=lp.launchpad.length -1 ; i>=0; i--){
                                if(lp.launchpad[i].action === name && lp.launchpad[i].actionType === 'KEYMAP_TYPE_SCRIPT'){
                                    logger.debug(`Delete script '${name}' in launchpadPrivate '${lp.launchpad[i].name}' successful`);
                                    lp.launchpad[i].action = '';
                                    lp.launchpad[i].actionType = 'Unmapped';
                                    // lp.launchpad.splice(i,1);
                                    haslaunchpadPrivate = true;
                                }
                            }
                            if(haslaunchpadPrivate){
                                batchTxnData.push({dataEntityName: 'launchpadPrivate', action:'UPDATEORINSERT', value: lp})
                                haslaunchpadPrivate = false;
                            }
                        }
                    }
                }
                
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

        
        router.get('/downloadScript', async (req, res) => {
            let {name,type} = req.query;
            const username = req.username;
            const filter = {type, name,username};
            try{
                bzdb.select('scriptPrivate', filter).then((result) => {
                    if (result){
                        let content = result.data[0]
                        res.status(200).json({result:content});
                    } else {
                        this.logger.severe('download script file: Unknown Error');
                        res.status(500).json({result:'Unknown Error'});
                    }
                }, err => {
                    this.logger.severe('download script file failed: ' + err.stack);
                    return res.status(500).json({result:'Unknown Error'});
                });	
            }catch(err){
                this.logger.severe('download script file failed: ' + err.stack);
                return res.status(500).json({result:'Unknown Error'});
            }
        });

    }
}


exports.scriptRouter = (context) => {
    return new Promise ((resolve,reject) => {
      let controller = new ScriptController(context);
      controller.getScriptRouter();
      resolve(controller.getRouter()); 
    });
  };