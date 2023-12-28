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
const ini = require('ini');
// const BASE_PATH = '/ZLUX/pluginStorage/com.rs.bzadm';
const SESSION_PATH = '/ZLUX/pluginStorage/com.rs.bzadm/sessions';
// const InternalDataSteward = require('../../../../bzshared/lib/services/internal-data-steward.service');
const Utiles = require('../../services/utils.service');
const SessionService = require('../../services/session.service');
const oAuth = require('../../../../bzshared/lib/services/oauth.service');
const bzdb = require('../../../../bzshared/lib/services/bzdb.service');
const userSrc = require('../../../../bzshared/lib/apis/user-resource/user-resource-service');
const Security = require('../../../../bzshared/lib/services/security.service');
const Bzw2hUtils = require('../../services/bzw2h-utils');
const authConfigService=require("../../../../bzshared/lib/services/authConfigService");

class SessionRouter {

    constructor(context){
        // this.dataSteward = InternalDataSteward.initWithContext(context);
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        this.instanceDir = this.context.plugin.server.config.user.instanceDir;
        this.productDir = this.context.plugin.server.config.user.productDir;
        this.utiles = new Utiles(context);
        this.authConfigObj=authConfigService.init();
        this.sessionService = SessionService.init(context);
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
        if (req.query.path === 'session') {
            return this.instanceDir + SESSION_PATH;
        }

        return req.query.path;
    }

    createDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
    }

    async addSession(dir, values, req, res, file, isImportSite = false) {
        let profile = '';
        let orgSessionName4Edit = '';

        // BZ-18102, w2h HLLAPI session ID check
        // BZ-18310, do not check HLLAPI session ID for import site case
        if (!isImportSite && values.miscW2h && values.miscW2h.sid && values.miscW2h.sid !== -1) {
            const sid = values.miscW2h.sid;
            // BZ-18102, we should add quotes for number value, otherwise bzdb cannot find it using filter
            let result = await bzdb.select('sessionShared', {'miscW2h.sid': `${sid}`});
            // this.logger.warn(`=====Session id: ${JSON.stringify(result)}`);
            for (const ss of result.data) {
                if (ss.id !== values.id && Bzw2hUtils.getSessionType(ss.type) === Bzw2hUtils.getSessionType(values.type)) {
                    this.logger.warn(`The HLLAPI session ID '${sid}' has already existed, req(${values.name}), DB(${ss.name})`);
                    return res.json({status: false, message: `The HLLAPI session ID '${sid}' has already existed`});
                }
            }
        }

        if (values.bzd && values.bzd.profile) {
            profile = values.bzd.profile;
            values.bzd.profile = values.name + values.bzd.profile.slice(-4);
            if(values.bzd.initDeviceType == null)
                values.bzd.initDeviceType = values.type;
        }
        if (values.signon) {
            await userSrc._encryptObject(values.signon || {}, 'sessionPassword');
        }
        if (values.ftp) {
            await userSrc._encryptObject(values.ftp || {}, 'password');
        }
       
        let rs = await bzdb.select('sessionShared', {name: values.name});
        const batchTxnData = [];  // BZ-15270, HA for assign profile

        const scope = values.scope || {}; // group-session relation
        delete values.scope; // remove scope from session
        // let groupSession = await bzdb.select('groupSession', {id: values.id});

        // const globalSession = rs.data.filter(d => groupSession.data.findIndex(g => g.sessionName !== d.name) > 0);

        if (values.action === 'add' || values.action === 'clone') {
            // keep unique session name in in global session
            // keep unique session name in any group
            // there is unique session name in bza now, so annotating below code
            // if ((globalSession.length > 0 && scope.type === 'global') || (scope.type === 'group' && groupSession.data.findIndex(d => d.gid !== scope.gid) > -1)){
            //     res.status(202).json({status: false, message: `The name already exists in ${scope.type === 'group' ? 'candidate' : ''} ${scope.type} sessions`});
            //     return;
            // }
            if (rs.rowCount > 0){
                 // keep unique session name
                res.status(202).json({status: false, message: 'The name already exists'});
                return;
            }
            // BZ-15270, HA for assign profile
            // values.id = values.name + new Date().getTime();
            values.id = bzdb.getUIDSync();
            batchTxnData.push({
              dataEntityName: 'sessionShared', options: {}, action: 'INSERT', value: values
            });
        } else { // edit
            const rsid = await bzdb.select('sessionShared', {id: values.id});
            if (rsid.rowCount === 0) {
                res.status(202).json({status: false, message: 'The data to edit doesn\'t exist'});
                return;
            } else if (rs.rowCount === 1 && rs.data[0]['id'] != values.id) { 
                res.status(202).json({status: false, message: `The name already exists in ${scope.type === 'group' ? 'candidate' : ''} ${scope.type} sessions`});
                return;
            }
            if(values.action === "overwrite"){
                batchTxnData.push({
                    dataEntityName: 'groupSession', options: {id: values.id}, action: 'DELETE', value: '' 
                });
            }
            // BZ-15270, HA for assign profile
            orgSessionName4Edit = rsid.data[0]['name'];
            batchTxnData.push({
              dataEntityName: 'sessionShared', options: {}, action: 'UPDATEORINSERT', value: values 
            });
        }

        /**
         * @typedef {type: string, gid: string, ogid: string} scope
         * 
         * update groupSession data entity: 
         * 1. change candidate group
         * 2. remove session if it has been assigne to other groups or group users
         * 
         */

        // remove session from groups
        const upGps = await bzdb.select('group', {id: scope.upGps});
        upGps.data.forEach(group => {    
            const index = group.sessions.findIndex(d => d === values.id);
    
            if(index < 0) return;
    
            group.sessions.splice(index, 1);
        });

        if(upGps.data && upGps.data.length) {
            batchTxnData.push(
                {dataEntityName: 'group', action: 'BULKLOAD', value: upGps.data}
            );
        }
       
        // delete group user sessions
        (scope.upGpUserSessions || []).forEach(d => {
            const {userId, sessionId, groupId} = d;
            batchTxnData.push(
                {dataEntityName: 'groupUserPrivilege', options: {filter: {userId, sessionId, groupId}}, action: 'DELETE', value: {}}
            )
        });

        // JSTE-15466 [Cluster] Group session can be cloned if the group has been deleted in another node.
        if(scope.type === 'group' && req.query.type === 'clone') {
            const gs = await bzdb.select('group');

            if(gs.rowCount === 0) {
                this.logger.debug(`No available groups when cloning session ${scope.sessionName}`);
                res.status(202).json({status: false, message: 'No available groups specified'});
                return;
            }

            const gids = gs.data.map(d => d.id);
            const orgGids = JSON.parse(JSON.stringify(scope.gids));

            scope.gids = scope.gids.filter(d => gids.includes(d));
            
            if(scope.gids.length < orgGids.length) {
                this.logger.debug(`some candidate groups missing when cloning session ${scope.sessionName}`);
                this.logger.debug(`orginal candidate groups ${orgGids.toString()}, saved candidate groups: ${scope.gids.toString()}`);
            }

            if(scope.gids.length === 0) {
                this.logger.debug(`No available groups when cloning session ${scope.sessionName}`);
                res.status(202).json({status: false, message: 'No available groups specified'});
                return;
            }
        }

        // update group session
        if(scope.type === 'group') {
            batchTxnData.push(
                {dataEntityName: 'groupSession', options: {}, action: 'UPDATEORINSERT', value: {id: values.id, gids: scope.gids}}
            );
        } else {
            batchTxnData.push(
                {dataEntityName: 'groupSession', options: {filter: {id: values.id}}, action: 'DELETE', value: {}}
            );
        }
        
        //if (!file && profile) {
        if (profile) {
            const isClone = (req.query.type === 'clone');
            const isRename = (orgSessionName4Edit !== '' && orgSessionName4Edit !== values.name);
            if (isClone || isRename || file) {
                let fileData = '';
                if (file && file.data) {  // import or assign
                    fileData = JSON.stringify(Buffer.from(file.data));
                } else {  // clone or edit session name
                    const srcName = encodeURIComponent(profile);
                    const result = await bzdb.select('w2hProfiles', {fileName: srcName});
                    if (result.data.length > 0) {
                        fileData = result.data[0].data;
                    } else {  // this should not happen
                        this.logger.warn(`[addSession], failed to select ${srcName} from 'w2hProfiles'`);
                    }
                }
                if (fileData.length > 0) {
                    if (isRename) {  // rename
                        const oldName = encodeURIComponent(orgSessionName4Edit + profile.slice(-4));
                        batchTxnData.push({
                          dataEntityName: 'w2hProfiles', options: {filter: {fileName: oldName}}, action: 'DELETE', value: {}
                        });
                    }
                    const tgtName = encodeURIComponent(values.bzd.profile);
                    const payload = { fileName: tgtName, data: fileData };
                    batchTxnData.push({
                      dataEntityName: 'w2hProfiles', options: {}, action: 'UPDATEORINSERT', value: payload 
                    });
                }
            }
        }
        const result = await bzdb.batchTxn(batchTxnData);  // BZ-15270, HA for assign profile
        if (result.status) {
            res.status(200).json({status: true, data: values});
            this.logger.info(`Successfully added/updated session "${values.name}"`);
            this.logger.debug(`Session data: ${JSON.stringify(values)}`);
        } else {
            this.logger.warn(`Write shared session failed: ${result.message}`);
            res.setHeader("Content-Type", "text/typescript");
            res.status(202).json({status: false, message: result.message});
        }
    }

    /**
     * 
     * @param {*} gid: original group id
     * @param {*} sid : current session id
     * @param {*} batchTxnData 
     * 
     * handle scenario: has assigned groupSession to group, then superadmin change groupSession to other group,
     * then it need to update sessions property in group.json
     * and remove assigned session to user in groupUserPrivilege.json
     * 
     * * currently, couldn't edit candidate group or scope, so it only works for add session: gid = null
     */
    async handleGroup(gid, sid, batchTxnData) {
        if(gid == null) return;

        const group = await bzdb.select('group', {id: gid});

        if(group.rowCount === 0) return;

        const index = group.data[0].sessions.findIndex(d => d === sid);

        if(index < 0) return;

        group.data[0].sessions.splice(index, 1);

        batchTxnData.push(
            {dataEntityName: 'group', options: {}, action: 'UPDATEORINSERT', value: group.data[0]},
            {dataEntityName: 'groupUserPrivilege', options: {filter:{sessionId: sid, groupId: gid}}, action: 'DELETE', value: {}}
        )
    }

    // not in use
    // addFile(dir, file, name) {
    //     const iniFile = {
    //         path: `${dir}/${encodeURIComponent(name)}`,
    //         data: file.data
    //     };
    //     this.dataSteward.addFile(iniFile, true);
    // }
    
    getSameItems(aa, bb) {
        return aa.filter(a => {
          return bb.some(b => {
            return a === b;
          });
        });
    }

    getSessionRouterRouter() {
        const logger = this.logger;
        const router = this.router;

        router.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
        router.use(bodyParser.json({type:'application/json',limit: '50mb'}));
		router.use(oAuth.defaultOAuthChecker());

        router.put('/', (req, res) => {
            const dir = this.getPath(req);
            const values = req.body;
            const date = new Date();

            values.groupName = values.name;
            values.timestamp = date.getTime();

            this.addSession(dir, values, req, res, false);
        });
        router.get('/', async (req, res) => {
            let result;
            if(req.query && Object.getOwnPropertyNames(req.query).length>0){
                result = await bzdb.select('sessionShared', req.query);
            }else{
                result = await bzdb.select('sessionShared');
            }
            await userSrc._decryptFTP(result);
            const admin = await bzdb.select('administrator', {name: req.headers.username});
            const data = admin.rowCount > 0 ? admin.data[0] : {};

            /************************* prepare session ********************************
             * For administartor, filter is {}, and return all sessions
             * For group admin:
             *    isAll means managing all groups 
             *    return candidate sessions and global sessions in managed groups
             */
            const isGpAdmin = data.role === 'groupAdmin' && !data.isAll;
           

            const allCandGroups = (await bzdb.select('groupSession'));
            const candGroups = isGpAdmin ? allCandGroups.data.filter(d => {
                d.gids = d.gids || [d.gid];
                return this.getSameItems(d.gids, data.group).length > 0
            }) :  allCandGroups.data;
            
            
            const gFilter = isGpAdmin ? {id: data.group} : {};
            let groups =  (await bzdb.select('group', gFilter)).data || [];
            let sessions = result.data;

           
            if(data.role === 'groupAdmin') {
                const sIds = [];
                const defaultGroup = "Default Group";
                const isDefaultGroup = authConfigService.authConfig.onlyDefaultGroupMode;
                // check candidate group if in default group mode
                const availableCandGroup = candGroups.filter(d => {
                    const gids = d.gids || [d.gid];
                    if(isDefaultGroup) {
                        // groupAdmin should manage default group
                        return (data.group.includes(defaultGroup) || data.isAll) ? gids.includes(defaultGroup) : false;
                    } else {
                        return !(gids.includes(defaultGroup) && gids.length === 1);
                    }
                })

                sIds.push(...availableCandGroup.map(d => d.id)); // candidate sessions

                // check groups if in default group mode
                groups = groups.filter(d => {
                    return isDefaultGroup ? d.groupName === defaultGroup : d.groupName !== defaultGroup

                })
               
                groups.forEach(d => {
                    sIds.push(...d.sessions); // global session
                });

                sessions = sessions.filter(d => sIds.indexOf(d.id) > -1); // filter candidate sessions and global sessions in managed groups
            }

            sessions = sessions.map(d => {
                const node = candGroups.find(c => c.id === d.id); // candidate session

                if(node) {
                    const sId = node.id;
                    const gids = node.gids || [node.gid];

                    node.sessionName = result.data.find(d => d.id === sId).name;
                    node.groupNames = gids.map(g => {
                        return (groups.find(d => d.id === g) || {}).groupName;
                    }).filter(d => d != null);
                    node.gids = d.gids || gids;
                    node.type = 'group'; // clone session will use it to create groupSession

                    delete node.gid; // delete gid for upgrating data

                    d.scope = node; // set tag for candidate sesion: {sessionName, groupName, type, id, gid}
                }
                return d;
            });
           // ************************** prepare session ********************************

            result.data = sessions;
            result.defaultPorts = this.getDefaultPort();
            res.send(result);
            this.logger.info(`Get sessions successful`);
            this.logger.debug(`Get sessions data: ${JSON.stringify(result)}`);
        });

        /**
         * check unique session name
         */
        router.get('/name/:name', async (req, res) => {
            const name = req.params.name;

            let rs = await bzdb.select('sessionShared', {name}, {ignoreCaseFields: ['name']});

           res.status(202).json({status: rs.rowCount === 0, message: rs.rowCount > 0 ? 'The name already exists' : 'The name could be used'});
           this.logger.info(`Check session name: ${name} successful`);
        });

        router.get('/profile/:id', (req, res) => {
            const name = req.params.id;
            const basePath = this.instanceDir + SESSION_PATH;

            this.createDir(basePath);
            const filePath = basePath + '/' + encodeURIComponent(name);

            if (!fs.existsSync(filePath)) {
                res.status(500).send('File Not Found.');
            } else {
				try{
                    res.download(Security.sanitizePath(filePath));
                }catch(e){
                    this.logger.severe('Error while downlaoding file :' + file);
                    console.error(e);
                    res.status(500).send('Download file failed');
					return;
                }
            }
        });
        router.delete('/', async (req, res) => {
            const dir = this.getPath(req);
            let fileName = encodeURIComponent(req.query.name);

            if (fileName === null) return;
            fileName = Security.defendXSS(fileName);

            const filter = {id: req.query.name}
            const session = (await bzdb.select('sessionShared', filter)).data[0];
            if (!session) {
                res.setHeader("Content-Type", "text/typescript");
                res.status(200).json({'text': 'Deleted'});
                this.logger.warn('The shared session to delete doesn\'t exist');
                return;
            }

            try {
                 /** groupSession: candidate relationship
                  *  administrator could delete all sessions
                  *  group admin couldn't delete global session
                  *  group admin only could delete managed group session
                  *  delete group session should remove candidate relationship.
                 */
                const groupSession = await bzdb.select('groupSession', {id: req.query.name});
                const admin = await bzdb.select('administrator', {name: req.headers.username});
                const data = admin.rowCount > 0 ? admin.data[0] : {};
                const batchTxnData = [];
               
                // handle candidate relationship: groupSession.
                if(data.role === 'groupAdmin') {

                    if(data.group && groupSession.rowCount > 0 && this.getSameItems(data.group, groupSession.data[0].gids).length > -1) {
                        batchTxnData.push({
                            dataEntityName: 'groupSession', options: {filter}, action: 'DELETE', value: '' 
                        });
                    } else {
                        this.logger.info(`Group admin no permission to delete session ${req.query.name}.`);
                        return;
                    }
                } else if(groupSession.rowCount > 0){
                    batchTxnData.push({
                        dataEntityName: 'groupSession', options: {filter}, action: 'DELETE', value: '' 
                    });
                }

                // BZ-15270, HA for assign profile
               
                batchTxnData.push({
                    dataEntityName: 'sessionShared', options: {filter}, action: 'DELETE', value: ''
                });

                batchTxnData.push({
                    dataEntityName: 'groupUserPrivilege', options: {filter: {sessionId: req.query.name}}, action: 'DELETE', value: '' 
                });
 

                if (session.bzd && session.bzd.profile && req.query.rename !== 'true') {
                    const fileFilter = { fileName: encodeURIComponent(session.bzd.profile) };
                    batchTxnData.push({
                        dataEntityName: 'w2hProfiles', options: {filter: fileFilter}, action: 'DELETE', value: '' 
                    });
                }
                const result = await bzdb.batchTxn(batchTxnData);                
                if (result && result.status === true){
                    res.status(200).json({'text': 'Deleted'});
                    this.logger.info(`Delete session ${fileName} successful`);
                } else {
                    res.status(500).json(result);
                    this.logger.severe(`Delete session "${fileName}" failed: ${result && result.message? result.message: 'Exception occurs'}`);
                }
            } catch (err) {
                res.status(500).json({status: false, message: 'Delete failed'});
                this.logger.severe(`Delete session "${fileName}" failed: ${err && err.message? err.message: 'Exception occurs'}`);
            }
        });

        router.post('/upload', async (req, res) => {
            // import session:      'com.rs.bzadm/services/session/upload'
            // assign profile:      'com.rs.bzadm/services/session/upload?type=profile'
            // import site session: 'com.rs.bzadm/services/session/upload?type=importSite'
            const isImportSite = ('importSite' === req.query.type); // BZ-18310
            const data = req.body.data;
            const name = req.body.name;
            const overwrite = req.body.overwrite ? true : false;  // BZ-13894
            const orgProfile = req.body.orgProfile;  // BZ-14222

            try {

                const isBinary = this.sessionService.fileIsBinary(data);
                const sessionShareds = await bzdb.select('sessionShared');
                // const sessions = sessionShareds.data.map(d => d.name.toLowerCase());  // BZ-13894
                const sessions = sessionShareds.data  // BZ-13894

                if (isBinary) {
                    this.logger.severe(`${name} is binary format`);
                    res.json({status: false, message: `'${name}' is not text format`});  // BZ-18129
                } else {
                    const config = ini.parse(data);
                    const session = this.sessionService.convertBzw2Session(config, name, sessions, overwrite);
                    if (orgProfile && session.bzd && session.bzd.oriFileName) {
                        session.bzd.oriFileName = orgProfile;
                    }
                    const file = {name: session.name + name.slice(-4), data};

                    if (!session || !session.name || !session.host || !session.port || !session.type ) {
                        this.logger.severe(`${name} is invaild`);
                        res.json({status: false, message: `'${name}' is invaild`});  // BZ-18129
                        return;
                    }
                     // BZ-18310, add 'isImportSite' check
                    if (isImportSite && config.override !== undefined) {  // only for import sessions during importing site
                        session.override = config.override; 
                        const sov = config.override;
                        /* session override name has been updated from profile name
                        if(config.override.ConnectionName.length)   
                            session.name = config.override.ConnectionName;*/
                        if (sov.HostAddress !== '0' && sov.HostAddress.length)
                            session.host = sov.HostAddress;
                        if (sov.Port !== '0' && sov.Port.length)
                            session.port = sov.Port;
                        if (sov.Device !== undefined && sov.Device !== '0' && sov.Device.length && 
                            (this.sessionService.is5250(name) || this.sessionService.is5250p(name)))
                            session.luName = sov.Device; 
                        else if (sov.Lu !== undefined && sov.Lu !== '0' && sov.Lu.length && 
                            (this.sessionService.is3270(name) || this.sessionService.is3270p(name)))
                            session.luName = sov.Lu; 
                        if (session.miscW2h === undefined) {
                            session.miscW2h = {
                                sid: parseInt(sov.SessionId, 10)
                            };
                        } else {
                            session.miscW2h.sid = parseInt(sov.SessionId, 10);
                        }
                    }

                    if (req.query.type === 'profile') {
                        // assign profile
                        const currSession = req.body.session;
                        currSession.bzd = session.bzd;
                        this.addSession(this.instanceDir + SESSION_PATH, currSession, req, res, file);
                    } else {
                        // import session
                        this.addSession(this.instanceDir + SESSION_PATH, session, req, res, file, isImportSite);
                    }
                }
            } catch (e) {
                // BZ-14463, SessionService.getSession() might throw exception if profile is invalid
                this.logger.severe(`Failed to import session: ${name}\n${e.stack}`);
                return res.json({status: false, message: `Failed to assing profile '${name}'`});  // BZ-18129
            }
           
        });

        // return all groups which contain current session id
        router.get('/groups/:sid', async (req, res) => {
            let groups = (await bzdb.select('group')).data || [];
            const assigedGroups = groups.filter(d => d.sessions.indexOf(req.params.sid) > -1);

            res.status(200).json({groups: assigedGroups});
        })
    }

    // getURL(req) {
    //     return `${req.protocol}://${req.headers.host}`;
    // }
    getDefaultPort() {
        const filePath = path.resolve(this.productDir + '/ZLUX/pluginStorage/com.rs.bzw/defaults/defaultPort.json');

        if(fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }

        return {};
    }
}


exports.sessionRouter = (context) => {
    return new Promise (function (resolve,reject) {
      let controller = new SessionRouter(context);
      controller.getSessionRouterRouter();
      resolve(controller.getRouter()); 
    });
  };