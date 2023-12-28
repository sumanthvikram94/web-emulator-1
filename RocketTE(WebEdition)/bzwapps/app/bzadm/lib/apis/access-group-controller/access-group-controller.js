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
const path = require('path');
const multer = require('multer');
const GROUP_PATH = '/groups';
const Utiles = require('../../services/utils.service');
const bzdb = require('../../../../bzshared/lib/services/bzdb.service');
const oAuth = require('../../../../bzshared/lib/services/oauth.service');
const Bzw2hConfigService = require('../../services/bzw2h-config.service');
// const BZDB = require('bz-db');
const authConfigService=require("../../../../bzshared/lib/services/authConfigService");
const accessGroupService = require('../../services/access-group.service');
const Security = require("../../../../bzshared/lib/services/security.service");
const Bzw2hUtils = require('../../services/bzw2h-utils');


class AccessGroupRouter {

    constructor(context){
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        this.instanceDir = this.context.plugin.server.config.user.instanceDir;
        this.GroupRootDir = path.join(this.instanceDir, 'ZLUX/pluginStorage/com.rs.bzw2h/groups');
        this.utiles = new Utiles(context);
        this.bzw2hConfigObj = Bzw2hConfigService.init(context);
        this.bzw2hImportSite = this.bzw2hConfigObj.importSite;
        this.authConfigObj=authConfigService.init();
        this.accessGroupObj = accessGroupService.init(context);
        this.defaultGroupName="Default Group";
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

    getPath(req) {
        if (req.query.path === 'group') {
            return this.instanceDir + GROUP_PATH;
        }

        return req.query.path;
    }

    createDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
    }

    getAccessGroupRouter() {
        const logger = this.logger;
        const router = this.router;
        const context = this.context;
       
        router.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
        router.use(bodyParser.json({type:'application/json',limit: '50mb'}));
        logger.info('Setup access group router');
        const date = new Date();
        router.use(bodyParser.json({type:'application/json'}));
        router.use(oAuth.defaultOAuthChecker());

        // upload dist file for bzw2h
        const storage = multer.diskStorage({
            destination: this.bzw2hConfigObj.getCustomDistTmpDir(),   //BZ-15263
            filename: function (req, file, cb) {
                const name = `${Bzw2hUtils.getRandomString(3)}_${file.originalname}`;
                cb(null, name);
            }
        });
        const distUpload = multer({storage: storage}).single('bzw2h-dist');        

        router.put('/', async (req, res) => {
            let data;
            const batchTxnData = [];
            if(req.body.type === 'userEdit') { // edit group when add/edit user
                data = req.body.groups;
                data.forEach(element => {
                    let obj = {dataEntityName: 'group', action:'UPDATEORINSERT', value: element};
                    batchTxnData.push(obj);
                })
                const rs = await bzdb.batchTxn(batchTxnData);
                if(rs.status) {
                    res.status(200).json({status: true});
                    this.logger.info(`Successfully added/updated group "${data}"`);
                    this.logger.debug(`Group data: ${JSON.stringify(data)}`);
                }else {
                    res.status(200).json({status: false});
                    this.logger.info(`Failed added/updated group "${data}"`);
                    this.logger.debug(`Group data: ${JSON.stringify(data)}`);
                }
            }else {
                if (req.body.action === 'edit'){
                    // Checks whether the name already exists.
                    // TBD, this should be handled by BZDB by unique key.
                   
                    const rs = await bzdb.select('group', {groupName: req.body.groupName});
                    if (rs.rowCount === 1 && rs.data[0].id != req.body.id) {
                        res.status(500).json({status: false, message: 'The name already exists'});
                        this.logger.warn(`The group to edit doesn't exist: "${req.body.groupName}"`);
                        this.logger.debug(`Group data: ${JSON.stringify(req.body)}`);
                        return;
                    }
                    data = (await bzdb.select('group', {id: req.body.id})).data[0];
                    if (!data) {
                        res.status(500).json({status: false, message: 'The data to edit doesn\'t exist'});
                        this.logger.warn(`The group to edit doesn't exist: "${req.body.groupName}"`);
                        this.logger.debug(`Group data: ${JSON.stringify(req.body)}`);
                        return;
                    }
                    data = Object.assign(data, req.body);
                } else {
                    const rs = await bzdb.select('group', {groupName: req.body.groupName});
                    if (rs.rowCount > 0) {
                        res.status(500).json({status: false, message: 'The name already exists'});
                        this.logger.warn(`The group to create already exist: "${req.body.groupName}"`);
                        this.logger.debug(`Group data: ${JSON.stringify(req.body)}`);
                        return;
                    }
                    let groupTemplate = {
                        "groupName": "",
                        "shortName": "",
                        "leader": "",
                        "parentGroupName": "",
                        "description": "",
                        "internalUsers": [],
                        "sessions": [],
                        // if privilege is {}, cannot distinct if editLU is from 1.2.0
                        "privileges": { // TBD, this data exists in several different places. We should put it to one place only.
                            createSession: false,
                            cloneSession: false,
                            removeSession: false,
                            editLU: true,
                            sessionSettings: false,
                            enableRecorder: false,
                            enableUseEditor: false,
                            enablePlayScript: false,
                            enableSharedScript: false,
                            enablePrivateScript: false,
                            enableEditSession: false,
                            enableEditFontSize: true,
                            enableEditColors: true,
                            enableEditCursor: true,
                            enableShowLaunchPadMenu: false,
                            enableEditLaunchPad: true,
                            enableEditkeyboardMapping: true,
                            enableEditHotSpots: true,
                            enableEditLanguage: true
                        },
                        "timestamp": date.getTime(),
                        "ldapUsers": [],
                        "mssqlUsers": [],
                        "ssoUsers": []
                    };
                    if( this.context.plugin.server.config.user.bzw2hMode) {
                        // if(req.body.deployMode === 'sd'){
                            groupTemplate.privileges.createSession = true;
                        //}
                    }
                    data = Object.assign(groupTemplate, req.body);
                    data['id'] = req.body.groupName === this.defaultGroupName ? this.defaultGroupName : (data['id']? data['id']: bzdb.getUIDSync());
                    const scriptShared = await bzdb.select('scriptShared', {status: 'public'});
                    if(scriptShared.rowCount > 0){
                        data['scripts'] = scriptShared.data.map(s => s.id);
                    }
                }
    
                try {
                    let batchTxnDataNewGroup = [];
                    batchTxnDataNewGroup.push({dataEntityName: 'group', action:'UPDATEORINSERT', value: data});
                    if (req.body.action === 'add') {
                        if(this.context.plugin.server.config.user.bzw2hMode) {
                            const bIsW2hMode = ('sd' !== data.deployMode);
                            let temp = this.bzw2hConfigObj.newGroupDirectoryDB(data.id, bIsW2hMode);
                            if(temp.length !== 4) {
                                throw new Error("The group folder creation failed!");
                            }
                            batchTxnDataNewGroup = batchTxnDataNewGroup.concat(temp);
                        }
                    }
                    const result = await bzdb.batchTxn(batchTxnDataNewGroup);
                    if (result && result.status === false){
                        res.status(500).json(result);
                        return;
                    }
                    res.status(200).json({status: true});
                    this.logger.info(`Successfully added/updated group "${data.groupName}"`);
                    this.logger.debug(`Group data: ${JSON.stringify(data)}`);
                    
                } catch(err) {
                    this.logger.severe(`Add/update group "${data.groupName}" failed: ${err && err.message || 'Exception occurs'}`);
                    this.logger.debug(`Group data: ${JSON.stringify(data)}`);
                    res.status(500).json({status: false, message: err.message});
                }
                
            }

            // fs.writeFile(`${dir}/group_${values.name}.json`, JSON.stringify(data), function (err) {
            //     if (err) throw err;
            //     // console.log('Saved!');
            //     res.setHeader("Content-Type", "text/typescript");
            //     res.status(200).json({'text': 'Saved'});
            //     handleSync.syncData(req, {
            //         name: values.name,
            //         values: data,
            //         method: 'put',
            //         api: BZW_GROUPS
            //     });
            //   });
        });

        // Get current group if has assign session to group user
        router.get('/getSessionForUser', async (req, res) => {
            const resultSessionForUser = await bzdb.select('groupUserPrivilege');
            const groupSession = await bzdb.select('groupSession'); // return group session for show all session names of user when editing group
            groupSession.data.forEach(g => {
                g.gids = g.gids || [g.gid]; // for updating data.
                delete g.gid;
            });
            resultSessionForUser.groupSession = groupSession.data;
            res.send(resultSessionForUser);
            logger.info(`Get group user session successful`);
            logger.debug(`Get group user session data: ${JSON.stringify(resultSessionForUser)}`);
        });

        /**
         * Remove group user session relationship with remove id (object)
         */

        router.post('/removeSessionForUser', async (req, res) => {
            try {
                const removeId = req.body.data || [];
                const batchTxnData = [];
                removeId.forEach(element => {
                    batchTxnData.push({dataEntityName: 'groupUserPrivilege', action: 'DELETE', value: {}, options: {filter: element}});
                });
                const result = await bzdb.batchTxn(batchTxnData);
                if (result.status) {
                    res.status(200).json({ status: true });
                    logger.info(`Remove Session for user successful`);
                } else {
                    res.status(202).json({ status: false });
                    logger.severe(`Remove Session for user failed`);
                }
            } catch (error) {
                logger.info(`Remove Session for user error: ${error.message}`);
                logger.debug(`Remove Session for user error data: ${JSON.stringify(req.body.data)}`);
            }
        });
        // Save assigned session for group user 
        router.put('/assignSessionForUser', async (req, res) => {
            try {
                const bodyData = req.body;
                let sessionForUser = bodyData.data || [];
                let groupId = bodyData.groupId;
                let userId = bodyData.userId;
                if (!groupId || !userId) {
                    this.logger.warn(`Add/update group user session: Bad request -- groupId/userId is missing`);
                    res.status(400).send('Bad request: groupId/userId is missing');
                    return
                }
                let removeInsertSession = await bzdb.delete('groupUserPrivilege',{groupId: groupId, userId: userId}); // remove insert session firstly, before bulkload
                if (removeInsertSession.status) {
                    const batchTxnData = [];
                    sessionForUser.forEach(element => {
                        batchTxnData.push({dataEntityName: 'groupUserPrivilege', action: 'UPDATEORINSERT', value: element});
                    });
                    const result = await bzdb.batchTxn(batchTxnData);
                    if (result.status) {
                        res.status(200).json({ status: result.status});
                        this.logger.info(`Successfully added/updated group user session "${JSON.stringify(sessionForUser)}"`);
    
                    } else {
                        res.status(202).json({status: result.status});
                        this.logger.severe(`Add/update group user session failed: "${JSON.stringify(req.body)}"`);
                    }
                } else {
                    res.status(202).json({status: result.status});
                    this.logger.severe(`Add/update group user session failed when remove the insert session: "${JSON.stringify(req.body)}"`);
                }
      
            } catch (err) {
                this.logger.severe(`Add/update group user session "${JSON.stringify(req.body)}" failed: ${err && err.message || 'Exception occurs'}`);
                this.logger.debug(`Group user session data: ${JSON.stringify(req.body)}`);
                // res.setHeader("Content-Type", "text/typescript");
                res.status(202).json({ status: false, message: err.message });
            }
        })
        
        router.delete('/', async (req, res) => {
            const id = decodeURI(req.query.name);
            if (id === null) return;
            try {
                let batchTxnData = [];
                batchTxnData.push({dataEntityName: 'group', options:{filter:{id}}, action: 'DELETE', value: {}});

                /*
                  delete group should delete group session and the relationship
                */
                const groupSessions = await bzdb.select('groupSession');
                const gsRelation = groupSessions.data.filter(d => {
                    d.gids = d.gids || [d.gid];
                    return d.gids.indexOf(req.query.name) > -1
                });

                // delete groupSession if the candidate group is only current group.
                const groupSessionIds = gsRelation.filter(d => (d.gids || [d.gid]).length === 1).map(d => d.id);
                batchTxnData.push(
                    {dataEntityName: 'groupSession', options: {filter: {id: groupSessionIds}}, action: 'DELETE', value: ''},
                    {dataEntityName: 'sessionShared', options: {filter: {id: groupSessionIds}}, action: 'DELETE', value: ''}
                );

                // update groupSession if the session for multiple groups.
                const updateGpSession = gsRelation.filter(d => d.gids && d.gids.length > 1);
                updateGpSession.forEach(d => {
                    const gids = d.gids.filter(g => g !== req.query.name);
                    batchTxnData.push(
                        {dataEntityName: 'groupSession', options: {}, action: 'UPDATEORINSERT', value: {id: d.id, gids}}
                    );
                });

                // BZ-19392, we need check if the session is associated with a profile
                // BZ-19898
                const sessions4Del = await bzdb.select('sessionShared', {id: groupSessionIds});
                for (const ss of sessions4Del.data) {
                    if (ss.bzd && ss.bzd.profile) {
                        const fileFilter = { fileName: encodeURIComponent(ss.bzd.profile) };
                        batchTxnData.push({
                            dataEntityName: 'w2hProfiles', options: {filter: fileFilter}, action: 'DELETE', value: '' 
                        });
                    }
                }

                if(this.context.plugin.server.config.user.bzw2hMode){
                    batchTxnData = batchTxnData.concat(this.bzw2hConfigObj.deleteGroupRelatedDB(id));
                }
                const result = await bzdb.batchTxn(batchTxnData);
                if (result && result.status === true){
                    res.status(200).json({ 'text': 'Deleted' });
                    this.logger.info(`Successfully deleted group "${id}"`);
                } else {
                    res.status(500).json(result);
                    this.logger.info(`Failed deleted group "${id}"`);
                }
            } catch (err) {
                res.status(500).json({status: false, message: 'Internal server error'});
                this.logger.severe(`Delete group "${id}" failed: ${err && err.message || 'Exception occurs'}`);
            }
        });

        router.get('/', async (req, res) => {
            // let result = await bzdb.select('group');
            // const isAdmin = req.headers.username !== 'superadmin';
            // // if(this.authConfigObj.isAllowDefaultGroup){
            // //     result.data=result.data.filter(group=>{return group.groupName===this.defaultGroupName})
            // //     result.rowCount=result.data.length;
            // // }else{
            // //     result.data=result.data.filter(group=>{return group.groupName!=this.defaultGroupName})
            // //     result.rowCount=result.data.length;
            // // }

            // if(isAdmin) {
            //     const admin = await bzdb.select('administrator', {name: req.headers.username});
            //     const data = admin.rowCount > 0 ? admin.data[0] : {};

            //     if(data.role === 'groupAdmin' && !data.isAll) {
            //         result.data = result.data.filter(d => {
            //           return data.group.findIndex(g => g === d['id']) > -1;
            //         });
            //     }
            // }

            const result = await this.accessGroupObj.getAllGroups(req.headers.username);
            result["bDisplayDefault"] = authConfigService.authConfig.isAnonymousAccessAllowed && !authConfigService.authConfig.onlyDefaultGroupMode  

            res.send(result);
            logger.info(`Get groups successful`);
            logger.debug(`Get groups data: ${JSON.stringify(result)}`);
        });

         // ZLUX/plugins/com.rs.bzadm/services/accessGroup/w2hfile/global.ini?gid=xxx&filename=xxx
         router.get('/w2hfile/:name', async (req, res) => {
            //'global.ini'
            let srcName = req.params.name;
            let file = await this.bzw2hConfigObj.getDownloadFileByGid( srcName, req.query.gid);

            //get download file name
            let downloadName = srcName;
            let queryFilename = req.query.filename;
            if(queryFilename !== undefined && queryFilename.length > 0)
                downloadName = queryFilename;
            if(file !== null){
                try{
                    res.download(Security.sanitizePath(file), downloadName);
                }catch(e){
                    logger.severe('Error while downlaoding file :' + file);
                    console.error(e);
                    res.status(500).send('Download file failed');
					return;
                }
            }else{
                res.status(500).send('File Not Found.');
            }
        });

        // ZLUX/plugins/com.rs.bzadm/services/accessGroup/w2hfile_save/global.ini
        /*router.post('/w2hfile_save/:name', async (req, res) => {
            
            let name = req.params.name;
            let ret = this.bzw2hConfigObj.saveFileByGid( name, req.body.gid);
            if( ret ) {s
                res.status(200).json({ success: true, message: `Save ${name} file successfully.` });
            } else {
                res.status(500).json({ error: `Failed to save file!` });
            }
        });*/
        
        // ZLUX/plugins/com.rs.bzadm/services/accessGroup/w2hfile/global.ini
        router.get('/id', async (req, res) => {
            const dir = this.instanceDir + GROUP_PATH;
            const id = bzdb.getUIDSync()
           
            res.send({id});
            logger.info(`Get new group id`);
        });

        router.get('/:groupId', async (req, res) => {
            const groupId = decodeURIComponent(req.params.groupId || '');
            const result = await bzdb.select('group', {id: groupId});
            res.send((result && result.rowCount && result.data[0]) || null);
            logger.info(`Get group with group id "${groupId}" successful`);
            logger.debug(`Get group data: ${JSON.stringify(result)}`);
        });

        router.post('/setting', async (req, res) => {
            let batchTxn = [];
            let result = {
                status: false,
                message: ''
            };
            try{
                batchTxn = this.bzw2hConfigObj.setSetting4GroupDB(req.body.data);

                result = await bzdb.batchTxn(batchTxn);
                if (!result.status) {
                    this.logger.severe(`[AccessGroupControllor::update group setting] update group setting failed. ${result.message}`);
                } else {
                    this.logger.info(`Update group setting file successfully`);
                }
            }catch(e){
                this.logger.severe(`Failed to set settings for group '${req.body.data.gid}': ${e}`);
                result = {
                    status: false,
                    message: `Exception occured while editing group: ${e.message}`
                };


            }

            res.json(result);
        });

        router.get('/setting/:gid', async (req, res) => {
            const data = await this.bzw2hConfigObj.getSettingByGid(req.params.gid);
            res.json(data);
        });

        router.put('/makedefault', async (req, res) => {
            const result = await this.accessGroupObj.setGroupasDefault(req.body.id);
            res.json(result);
        });


        router.post('/dist', async (req, res) => {
            try {
                const result = await this.bzw2hConfigObj.setDistFiles4Group(req.body.data);
                res.json(result);
            } catch (e) {                
                this.logger.severe(`AccessGroupRouter::post_dist, failed: ${e.message}`);
                return {status: false, message: 'Unknown error, please refer to server log for details'};
            }
        });

        router.get('/dist/:gid', async (req, res) => {
            const data = await this.bzw2hConfigObj.getClientDistInfoByGid(req.params.gid);
            res.json(data);
        });

        router.post('/dist/custom', (req, res) => {
            distUpload(req, res, (err) => {
                try {
                    if (err) {
                        // BZ-18273, 'req.file' might be null/undefined when error occurs
                        let name = '';
                        if (req.file && req.file.originalname) {
                            name = req.file.originalname
                        }
                        res.json({ status: false, name });
                        logger.severe(`AccessGroupRouter::post_custom, failed to upload file '${name} with error '${err}'`);
                    } else {
                        const name = req.file.originalname
                        const tmpName = req.file.filename;
                        logger.info(`AccessGroupRouter::post_custom, upload dist file ${JSON.stringify(req.file)}`);
                        res.json({ status: true, name, tmpName });
                    }
                } catch (e) {
                    this.logger.severe(`AccessGroupRouter::post_custom, failed with error '${e.message}'`);
                    return {status: false, name: ''};
                }
            });
        });

        /* // BZ-15263, remove the api
        router.delete('/dist/custom/:file', async (req, res) => {
            // delete;            
            const file = Buffer.from(req.params.file, 'base64').toString('ascii');
            const bRtn = await this.bzw2hConfigObj.deleteCustomFile(file);
            res.json({result: bRtn ? 'success' : 'failed'});
        });*/
        
        // ZLUX/plugins/com.rs.bzadm/services/accessGroup/w2hcm/setting?gids=00000017,00000018
        router.get('/w2hcm/setting', async (req, res) => {
            const data = await this.bzw2hConfigObj.getSettings4W2HCM(req.query.gids);
            res.json(data);
        });

        // ZLUX/plugins/com.rs.bzadm/services/accessGroup/w2hcm/dist?gids=00000017,00000018
        router.get('/w2hcm/dist', async (req, res) => {
            const data = await this.bzw2hConfigObj.getDistFiles4W2HCM(req.query.gids);
            res.json(data);
        });

		router.post('/w2hsite/group', (req, res) => {
            this.bzw2hImportSite.handleCustomizedImport(req, res);
        });   

		router.post('/w2hsite/zipfile', (req, res) => {
            this.bzw2hImportSite.handleUpload(req, res);
        });  
        
        router.get('/w2hsite/zipfile/:name', (req, res) => {
            const fileName = req.params.name;
            if (fileName.indexOf('../') > 0) {
                // "Directory Traversal Arbitrary File Download" vulnerability
                res.status(404).json({err: `Bad request: '${fileName}'`});
            } else {
                const result = this.bzw2hImportSite.checkSite(fileName);
                res.json(result);
            }
        });

        router.get('/w2hsite/log/:reportId', (req, res) => {
            const reportId = req.params.reportId;
            if (reportId.indexOf('../') > 0) {
                // "Directory Traversal Arbitrary File Download" vulnerability
                res.status(404).json({err: `Bad request: '${reportId}'`});
            } else {
                const dir = this.bzw2hImportSite.getSiteReportDir();
                const file = path.join(dir, `${reportId}.log`);
                try{
                    res.download(Security.sanitizePath(file));
                }catch(e){
                    logger.severe('Error while downlaoding file :' + file);
                    console.error(e);
                    res.status(500).send('Download file failed');
					return;
                }
            }
        });

        router.get('/w2hsite/report/:reportId', (req, res) => {
            const reportId = req.params.reportId;
            if (reportId.indexOf('../') > 0) {
                // "Directory Traversal Arbitrary File Download" vulnerability
                res.status(404).json({err: `Bad request: '${reportId}'`});
            } else {
                const dir = this.bzw2hImportSite.getSiteReportDir();
                let file = path.join(dir, `${reportId}.json`);
                try{
                    file = Security.sanitizePath(file);
                } catch(e) {
                    logger.severe('Error while downlaoding file :' + file);
                    console.error(e);
                    res.status(500).send('Download file failed');
                    return;
                }
                fs.readFile(file, 'utf8', (err, data) => {
                    if (err) {
                        return res.json({
                            status: false,
                            data: { groups: [] }
                        });
                    } else {
                        return res.json(JSON.parse(data));
                    }
                });
            }
        });

        // ZLUX/plugins/com.rs.bzadm/services/accessGroup/w2hsite/history
        router.get('/w2hsite/history', (req, res) => {
            const data = this.bzw2hImportSite.getImportHistory();
            res.json(data);
        });

		router.post('/w2hsite/status', (req, res) => {
            const running = !req.body.status ? false : true;
            this.bzw2hImportSite.setStatus(running);
            return res.json({status: true, message: ''});
        }); 

		router.get('/w2hsite/status/reset', (req, res) => {
            // BZ-18184, this API could be used by customer if they want to reset the import status
            this.bzw2hImportSite.setStatus(false);
            return res.json({status: true, message: ''});
        }); 
    }

    // getURL(req) {
    //     return `${req.protocol}://${req.headers.host}`;
    // }
}


exports.accessGroupRouter = (context) => {
    return new Promise (function (resolve,reject) {
      let controller = new AccessGroupRouter(context);
      controller.getAccessGroupRouter();
      resolve(controller.getRouter()); 
    });
  };
