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
// const zoweService = require('../../../../bzshared/lib/services/zowe.service');

const Promise = require('bluebird');
// const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');
const errorHandler = require('../../../../bzshared/lib/services/error.service.js');
const Utils = require('../../../../bzshared/lib/services/utils.service.js');
const autoScalingService = require('../../../../bzshared/lib/services/auto-scaling.service.js');
// const ClusterRequestService = require('../../../../bzshared/lib/services/cluster-request.service');
class PrinterController {

    constructor(context){
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        this.utils = Utils.init(this.logger);
        // this.clusterReqService = new ClusterRequestService(context);
        this.autoScalingService = autoScalingService;
    }

    printerContext() {
        this.logger.info(JSON.stringify(this.context));
    }

    /**
     * Gettor of the router
     */
    getPrinterRouter() {
        return this.router;
    };
    /**
     * notice, this API control is for printer put method, which will skip the session validation check
     */
    setPrinterRouter() {
        const logger = this.logger;
        const router = this.router;
        // const basePath = this.context.plugin.server.config.user.instanceDir;

        logger.info('Setup printer router');

        router.use(express.json({type:'application/json',limit: '1000mb'}));
        // router.use((req, res, next) => {
        //     this.clusterReqService.redirectSlaveRequest(req, res, next);
        // });
        //save
        router.put('/spool', async(req,res) => {
            let userName=req.headers.username;
            if(userName){userName=encodeURIComponent(userName.toLowerCase());}
            const userDir=this.context.plugin.server.config.user.usersDir;
            try {
                const fileContent = req.body.content;
                const folder = req.query.type === '5250' ? '5250spool' : 'spool';
                const dir=`${userDir}/${userName}/ZLUX/pluginStorage/com.rs.bzw/${folder}`;
                const fileName=req.body.fileName;
                let isCloudMode = false;
                if(this.autoScalingService && this.autoScalingService.getClusterConfig().enabled == true 
                    && this.autoScalingService.getClusterConfig().autoScaling.enabled){
                    isCloudMode = true;
                }
                if(isCloudMode){
                    let type = 'pdf';
                    let contentToDownload = fileContent;
                    if (fileName.indexOf(".pcl") != -1){
                        type = 'passthrough';
                        contentToDownload = Buffer.from(new Uint8Array(fileContent)).toString();
                    }
                    res.status(200).send({"type":type,"directDownload":true,"jobName":fileName,"contentToDownload":contentToDownload});
                } else {
                    const spoolName=fileName.substring(0,fileName.indexOf("-")+1);
                    let regex=new RegExp(spoolName+".*",'gi');
                    this.deleteFileByReg(dir,regex);
                    let result=await this.saveSpoolFile(dir,fileName,fileContent);
                    if(result){
                        let fileAttr=await this.utils.getFileList(dir,fileName)
                        res.status(200).send(fileAttr[0]);
                    }else{
                        res.status(200).send(result)
                    }
                }
            } catch(err) {
                errorHandler.handleInternalError(err,res,this.logger);
            }
        });

        router.get('/spool',async(req,res) => {
            let userName=req.headers.username;
            const folder = req.query.type === '5250' ? '5250spool' : 'spool';
            if(userName){userName=encodeURIComponent(userName.toLowerCase());}
            if(req.query.name){
                errorHandler.handleInternalError('API is not allowed',res,this.logger);
            }else{  //list
                const userDir=this.context.plugin.server.config.user.usersDir;
                const spoolDir=`${userDir}/${userName}/ZLUX/pluginStorage/com.rs.bzw/${folder}`;
                try {
                    let listObj=await this.utils.getFileList(spoolDir);
                    res.status(200).send(listObj);
                } catch(err) {
                    errorHandler.handleInternalError(err,res,this.logger);
                }
            }

        });
    }
    saveSpoolFile(dirPath, name, data) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath)
        }
        const fileName = path.join(dirPath, name);
        let opts = {
            encoding: 'binary',
            mode: 0o770
        };
        if (fileName.indexOf("PM0.") != -1) {
            opts = {
                mode: 0o770
            };
            data = JSON.stringify(data, null, 2);
        } else {
            data = new Uint8Array(data);
        }
        return new Promise((resolve, reject) => {
            fs.writeFile(fileName, data, opts, (err) => {
                if (err) {
                    reject(`I/O error when write file ${fileName}`);
                } else {
                    resolve(true);
                }
            });
        })
    }

    deleteFileByReg(dir, regex) {
        if (fs.existsSync(dir)) {
            fs.readdirSync(dir)
                .filter(f => regex.test(f))
                .map(f => fs.unlinkSync(path.resolve(dir, f)))
        }
    }
    }


exports.printerRouter = (context) => {
    return new Promise (function (resolve,reject) {
      let controller = new PrinterController(context);
      controller.setPrinterRouter();
      resolve(controller.getPrinterRouter()); 
    });
  };