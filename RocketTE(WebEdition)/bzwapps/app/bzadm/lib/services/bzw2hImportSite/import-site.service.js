'use strict';

const fs = require('fs-extra');
const path = require('path');
const multer = require('multer');
const unzip = require('unzipper');
const compressing = require('compressing');
const events = require('events');

const bzdb = require('../../../../bzshared/lib/services/bzdb.service');
const LaunchFolder = require('./launchFolder');
const Session = require('./session');
const ImportLogger = require('./import-logger');

const BZW2H_PATH = '/ZLUX/pluginStorage/com.rs.bzw2h';
const BZW2H_SITE_IMPORT = 'sites';
const BZW2H_SITE_IMPORT_REPORT = 'sitesReport';
const BZW2H_SITE_IMPORT_HISTORY_FILE = '__import_history.json';
const BZW2H_SITE_FOLDER_CONFIGS = 'configs';
const BZW2H_SITE_FOLDER_SHARED = 'shared';
const BZW2H_SITE_FOLDER_TEMPLATE = 'template';
const Utils = require('../utils.service');
const Bzw2hUtils = require('../bzw2h-utils');

class bzw2hImportSiteService {
    constructor(context, configSvc) {
        this.context = context;
        this.logger = new ImportLogger(context.logger);
        this.isEnabled = context.plugin.server.config.user.bzw2hMode ? true : false;
        this.bzw2hDir = path.join(context.plugin.server.config.user.instanceDir, BZW2H_PATH);
        this.configSvc = configSvc;
        this.utils = new Utils();
        this.sessions = [];
        this.groups = [];
        this.customFiles = [];
        this.summary = {};
        this.req = '';
        this.language = 'English';
        this.running = false;
        this.sitename = '';    
        this.running = false;
        this.sitename = '';
        this.reportId = '';
   
        this.siteDir = path.join(this.bzw2hDir, BZW2H_SITE_IMPORT);
        if (this.isEnabled && !fs.existsSync(this.siteDir)) {
          try {
            this.utils.createDirs(this.siteDir);
            //fs.mkdirSync(this.siteDir, {recursive: true});
          } catch (e) {
            this.logger.severe(`[site] failed to create directory '${this.siteDir}', ${e}`);
          }
        } 
   
        this.siteReportDir = path.join(this.bzw2hDir, BZW2H_SITE_IMPORT_REPORT);
        if (this.isEnabled && !fs.existsSync(this.siteReportDir)) {
          try {
            this.utils.createDirs(this.siteReportDir);
          } catch (e) {
            this.logger.severe(`[site] failed to create directory '${this.siteReportDir}', ${e}`);
          }
        }
        this.importHistoryFile = path.join(this.siteReportDir, BZW2H_SITE_IMPORT_HISTORY_FILE);

        this.storageSite = multer.diskStorage({
            destination: this.getSiteDir(),
            filename: function (req, file, cb) {
                cb(null, file.originalname);
            }
        });
        this.siteUpload = multer({storage: this.storageSite, fileFilter: (req, file, cb) => {
            cb(null, true);
        }}).single('bzw2h-site');          
    }

    getSiteDir() {
        return this.siteDir;
    }

    getSiteReportDir() {
        return this.siteReportDir;
    }

    handleUpload(req, res) {
        this.req = req;
        this.error = '';
        this.summary = {};
        if(this.running) {      
            const err = `One site is being imported, please try again after it completes.`;
            this.logger.warn(err);   
            this.setErrorSummary(err, false);
            res.json(this.summary);
            return;
        }
        this.running = true;        
        this.siteUpload(req, res, (err) => {
            if (err) {
                this.logger.severe(`${err}`);
                if (req.file && req.file.originalname) {
                    this.logger.severe(`Failed to upload file ${req.file.originalname}`);
                }
                this.logger.severe(`Failed to upload file due to ${err}`);  
                this.setErrorSummary(err);
                res.json(this.summary);
            } else {
                this.normalize(req.file.path)
                .on('done', (zipFile, sitename, target, sitepath) => {
                    this.sitename = sitename;
                    this.target = target;
                    this.sitepath = sitepath;

                    // BZ-14525, one import log for both preview and import
                    const siteZip = path.win32.basename(zipFile);
                    const timestamp = Date.now();
                    this.reportId = `${siteZip}_${timestamp}`.replace(/[^a-zA-Z-_\.\d]/g, '-');
                    const logFile = path.join(this.siteReportDir, `${this.reportId}.log`);
                    this.logger.setLogFile(logFile);
                    this.logger.info(`[site] start to extract site '${siteZip}'...`);

                    this.extract(zipFile).then(r=>{
                        this.clean(this.sitepath);
                        this.logger.info(`Import dist file ${req.file.originalname} to ${req.file.path}`);
                        res.json(this.summary);                    
                    }).catch(err => {
                        this.clean(this.sitepath);  
                        this.setErrorSummary(err);
                        this.logger.severe(`Failed to upload site ${req.file.originalname} due to ${err}`);                     
                        res.json(this.summary);
                    });
                })
                .on('error', err => {   
                    this.clean(this.sitepath);  
                    this.setErrorSummary(err);
                    this.logger.severe(`Failed to scan site ${req.file.originalname} due to ${err}`);                 
                    res.json(this.summary);  
                })
            }
        });      
    }

    handleCustomizedImport(req, res) {
        this.error = '';
        this.summary = {};
        const zipFile = path.join(this.siteDir, req.body.data.zipFile);
        const importOpt = req.body.data;
        this.extract(zipFile, true, importOpt).then(r=>{
            this.clean(this.sitepath);
            this.logger.info(`[site] Completed to import site '${zipFile}'`);
            res.json(this.summary);                    
        }).catch(err => {
            this.clean(this.sitepath);  
            this.setErrorSummary(err);
            this.logger.severe(`[site] failed to import site '${zipFile}' due to ${err}`);                     
            res.json(this.summary);
        });
    }

    extract(zipFile, isRealImport = false, importOpt = null) {
        return new Promise((rs, rj) => {
            const r = zipFile.lastIndexOf('.');
            if (r < 0) {
                this.error = `Invalid site zip file '${zipFile}'.`;
                this.logger.severe(this.error);
                return rj(this.error);
            }
            this.isRealImport = isRealImport;
            if (isRealImport) {
                this.logger.info(`[site] =====================================`);
                this.logger.info(`[site]            start to import           `);
                this.logger.info(`[site] =====================================`);
            }

            const read = fs.createReadStream(zipFile);
            const siteZip = path.win32.basename(zipFile);
            const target = this.target;

            const timestamp = Date.now();
            // const reportId = `${siteZip}_${timestamp}`.replace(/[^a-zA-Z-_\.\d]/g, '-');
            const importData = {
                id: encodeURIComponent(this.reportId),
                siteFile: siteZip,
                siteName: this.sitename,
                timestamp: timestamp,
                date: (new Date(timestamp)).toLocaleString()
            };
            // const logFile = path.join(this.siteReportDir, `${importData.id}.log`);
            // this.logger.setLogFile(logFile);
            // this.logger.info(`[site] start to extract site '${siteZip}'...`);

            /* BZ-20863, unzipper does not extract correctly with node 18.16
            read.pipe(unzip.Extract({path: `${target}`}))
            .on('close', () => {*/
            compressing.zip.uncompress(read, `${target}`)
            .then(() => {
                this.logger.info(`[site] check launch folders in site '${siteZip}'`);
                const configDir = path.join(this.sitepath, BZW2H_SITE_FOLDER_CONFIGS);
                if(!fs.existsSync(configDir)) {   //invalid site
                    this.error = `Invalid site '${siteZip}'.`;
                    this.logger.severe(this.error);
                    this.cleanInvalidSiteFile(zipFile, this.sitepath); 
                    return rj(this.error);               
                }
                const launchFolders = [];
                const others = [];
                this.walk(this.sitepath, others, launchFolders, 0);
                const promises = [];
                this.groups = [];
                this.sessions = [];
                this.customFiles = [];
                if(launchFolders.length > 0){
                    promises.push(this.handleLaunchFolders(launchFolders));
                }else{
                    return rj("Invalid site, no launch folder was found."); 
                }
                    
                if(others.length > 0)
                    promises.push(this.handleOthers(others));
                Promise.all(promises).then( async (results) => {
                    // BZ-13888
                    const gNames = importOpt ? importOpt.groups : null;
                    if (Array.isArray(gNames) && gNames.length > 0) {
                        this.logger.info(`[site::customize] post data:\n${JSON.stringify(gNames, null, 2)}`);
                        for (const group of this.groups) {
                            const gName = gNames.find(e => e.orgName === group.orgName);
                            if (gName) {
                                this.logger.info(`[site::customize] group name: '${group.name}' => '${gName.name}'`);
                                group.name = gName.name;
                                group.importOpt.isImport = gName.isImport ? true : false;
                                group.importOpt.isOverwrite = gName.isOverwrite ? true : false;
                            }
                        }
                    }
                    // BZ-13758, check session override setting.
                    this.handleGroupSession();
                    // BZ-14131, sesssion overwrite check                    
                    const res4ss = await bzdb.select('sessionShared');
                    const allSessions = res4ss.data;
                    const allCurGroups = (await bzdb.select('groupSession', {}));
                    for (const session of this.sessions) {
                        const find = allSessions.find(s => (s.name.toLowerCase() === session.name.toLowerCase()));
                        session.setSessionId(find ? find.id : '');

                        if(find && find.id){
                            const node = allCurGroups.data.find(c => c.id === find.id); // candidate session
                            
                            if(node) {
                                session.setGroupScope(node.gids || []); // BZ-19900, change .gid to .gids
                            }
                        }
                    }

                    if (!isRealImport) {
                        this.report();
                        this.clean(this.sitepath);
                        return rs(this.summary);
                    }
                    await this.commit(importOpt ? importOpt.owSession : false).then(() =>{
                        this.report(importData);
                        this.clean(this.sitepath);
                        return rs(this.summary);
                    }).catch(err =>{
                        return rj(err); 
                    });
                }).catch(async e => {
                    this.logError(e);
                    await this.rollBack();
                    this.report();
                    this.clean(this.sitepath);  
                    return rj(e);    
                });
            })
            /* BZ-20863, unzipper does not extract correctly with node 18.16
            .on('error', (err) => {*/
            .catch(err => {
                this.error = `[site] failed to unzip site '${siteZip}' due to ${err}`;
                this.logger.severe(this.error);
                this.cleanInvalidSiteFile(zipFile, this.sitepath);                
                return rj(err);
            });
        });
    }

    walk(target, others, launchFolders, level) {
        if (level > 1)
            return;
        const files = fs.readdirSync(target);
        for (let file of files) {
            const filepath = path.join(target, file);
            this.logger.debug(filepath);
            const stats = fs.statSync(filepath);
            if(stats.isDirectory()) {
                if(file === BZW2H_SITE_FOLDER_CONFIGS) 
                    others.push(filepath); 
                else if(file === BZW2H_SITE_FOLDER_SHARED)
                    others.push(filepath);
                else if(['controls', 'languages', 'template', 'cabs', 'images'].indexOf(file) == -1) {
                    this.walk(filepath, others, launchFolders, level + 1);    
                }
            } else if(stats.isFile()) {
                if(level === 1) {
                    if(file === 'bzw2h.jnlp' || file === 'bzw2h.bzlp') {
                        launchFolders.push(target);                    
                        break;
                    }
                }
            }
            if(level == 0 && file.toLowerCase().indexOf('site.properties') >= 0){
                this.handleLanguage(path.join(target, file));
            }
        }
    }
 
    handleSessions(item, files) {
        let count = 0;
        return new Promise((resolve, reject) => {
            this.logger.info(`[site::handleSessions] handle files in folder '${item}'`);
            files.forEach(async (file) => {               
                if(this.error != '') {
                    reject(this.error);                
                    return;
                }
                this.logger.debug(file);
                if (Bzw2hUtils.isBzProfile(file)) {
                    this.logger.info(`[site::handleSessions] find profile: '${file}'`);
                    const session = new Session(path.join(item, file), this.logger, this.context);
                    this.sessions.push(session);               
                }
                if (!Bzw2hUtils.isBzaSupportedProfile(file) && LaunchFolder.isCustomFile(file, this.configSvc.bzw2hDir)) {
                    this.logger.info(`[site::handleSessions] find custom file: '${file}'`);
                    this.customFiles.push(path.join(item, file));
                }
                count = count + 1;               
            });
            if(count === files.length) resolve('resolved');            
        });
    }
    
    handleShared(item, files) {
        let count = 0;
        return new Promise((resolve, reject) => {
            this.logger.info(`[site::handleShared] handle shared files in folder '${item}'`);
            files.forEach(async (file) => {
                if(this.error != '') {
                    return reject(this.error);
                }
                const fullpath = path.join(item, file);
                try {
                    if(fs.existsSync(fullpath) && fs.statSync(fullpath).isFile()) {
                        this.logger.debug(file);
                        if(LaunchFolder.isCustomFile(file, this.configSvc.bzw2hDir)) {
                            this.logger.info(`[site::handleShared] find custom file: '${file}'`);
                            this.customFiles.push(fullpath);
                        }
                    }
                    count = count + 1;
                    if(count === files.length) {
                        return resolve('resolved');  
                    }
                } catch(err) {
                    this.error = err;
                    return reject(err);
                }
            });        
        });
    }
    
    handleLaunchFolders(launchFolders) {
        let count = 0;
        this.logger.info('[site::handleLaunchFolders] handle launch folders in site');
        //this.groups = [];
        return new Promise((resolve, reject) => {
            launchFolders.forEach(async (dir) => {
                try {
                    const folderName = path.win32.basename(dir);
                    this.logger.info(`[site::handleLaunchFolders] start to handle launch folder '${folderName}'`); 
                    const launchFolder = new LaunchFolder(dir, this.sitename, folderName, this.logger,
                        this.context, this.configSvc,this.language); 
                    this.groups.push(launchFolder);
                    const files = fs.readdirSync(dir);
                    const promises = [];
                    this.lauchFolders = [];
                    files.forEach(async (file) => {                
                        this.logger.debug(file);                    
                        const f = launchFolder.getHandler(file);
                        if(f) {
                            promises.push(new Promise((rs, rj) => {
                                this.logger.debug(`start ${file}`);
                                const src = path.join(dir, file);
                                // const dest = path.join(launchFolder.tempDir, file);
                                //fs.copyFile(src, dest, (err) => {
                                //    if (err) { return rj(err); }
                                fs.readFile(src, 'utf8', async (err, data) => {
                                    if (err) { return rj(err); }
                                    if (this.error != '') {
                                        return rj(this.error);
                                    }
                                    //BZ-13766 import served desktop
                                    /*if (launchFolder.desktopMode) {
                                        return rs('resolved');
                                    }*/
                                    await f(launchFolder,  data).then(() => {
                                        if (launchFolder.error != '') throw launchFolder.error;
                                        return rs('resolved');
                                    }).catch(err => {
                                        this.error = err;
                                        this.logger.severe(`[site::handleLaunchFolders] ${err.message == undefined ? err : err.message}`);
                                        return rj(err);
                                    })
                                });
                               // });
                            }))
                        }
                    })
                    Promise.all(promises).then(results => {
                        count = count + 1;
                        if(count === launchFolders.length) return resolve('resolved');
                    }).catch(e => {
                        this.logError(e);
                        return reject(e);
                    });
                } catch(err) {
                    this.logError(err);
                    return reject(err);
                }                        
            })
        });
    }
    
    handleOthers(others) {
        let count = 0;
        this.logger.info('[site::handleOthers] handle other folders'); 
        //this.sessions = [];       
        return new Promise((resolve, reject) => {
            others.forEach(async (item) => {
                const name = path.win32.basename(item);
                fs.readdir(item, async (err, files) => {
                    if (err) {
                        this.logError(err);
                        return reject(err);
                    } else {
                        if(name === BZW2H_SITE_FOLDER_CONFIGS)
                            await this.handleSessions(item, files).catch(err => {
                                this.logError(err);
                                return reject(err); 
                            });
                        else if(name === BZW2H_SITE_FOLDER_SHARED)
                            await this.handleShared(item, files).catch(err => {
                                this.logError(err);
                                return reject(err);
                            });
                        count = count + 1;
                        if(count === others.length) return resolve('resolved');                          
                    }
                });           
            });
        });
    }

    handleGroupSession() {
        this.logger.info(`[site::handleGroupSession] handle relation between folders and sessions`);
        for (const group of this.groups) {
            this.logger.info(`[site::handleGroupSession] check sessions in launch folder '${group.orgName}'`);

            for (const session of group.groupConfig.sessions) {
                const orgProfileName = session.Profile;
                const find = this.sessions.find(s => s.profileName.toLowerCase() === orgProfileName.toLowerCase()); // BZ-19884
                if (find) {
                    let current = find;
                    const ext = path.extname(find.profileName);
                    const name = session.Description ? Bzw2hUtils.generateSessionNameFromProfileName(`${session.Description}.zxx`) : 
                        Bzw2hUtils.generateSessionNameFromProfileName(find.profileName);
                    let newfile = path.join(this.sitepath, BZW2H_SITE_FOLDER_CONFIGS, `${name}${ext}`); 

                    if(!current.override && name === current.name) {
                        current.override = session;
                    } else {
                        try {
                            let i = 1;
                            while(true) {
                                if(fs.existsSync(newfile)) {
                                    let newname = `${name}_${i}`;
                                    if(newname.length > 16) newname = `${name.slice(0, 16 - `_${i}`.length)}_${i}`;
                                    newfile = path.join(this.sitepath, BZW2H_SITE_FOLDER_CONFIGS, `${newname}${ext}`);
                                    i++;
                                }
                                else break;
                            }
                            const file = path.join(this.sitepath, BZW2H_SITE_FOLDER_CONFIGS, find.profileName);
                            fs.copyFileSync(file, newfile);
                            
                            session.Profile = path.basename(newfile);    
                            // session.Description = Bzw2hUtils.generateSessionNameFromProfileName(path.basename(newfile));
                            current = new Session(newfile, this.logger, this.context, session);
                            current.profileName = find.profileName;
                            current.orgName = orgProfileName.replace(/\.[^/\\.]+$/, "");
                            this.sessions.push(current);
                        } catch (e) {
                            this.logError(e);
                        }
                    }

                    current.addFolderImportOpt(group.importOpt);
                    group.sessions.push(current);
                    this.logger.info(`[site::handleGroupSession] # {${session.Name}: ${session.Description}(${orgProfileName})} => '${current.name}'`);
                } else {
                    // profile does not exist under "configs" folder
                    // this.logger.warn(`[site::handleGroupSession] find new session '${orgProfileName}' in folder '${group.orgName}'`);
                    const newone = new Session(orgProfileName, this.logger, this.context);
                    newone.addFolderImportOpt(group.importOpt);
                    group.sessions.push(newone);
                    this.logger.info(`[site::handleGroupSession] # {${session.Name}: ${orgProfileName}??}`);
                }
            }
        }

        //solve session id conflict //BZ-14475
        for(const session of this.sessions) {
            const others = this.sessions.filter(s => {
                if(s.override && session.override && s !== session) {
                    return s.override.SessionId === session.override.SessionId && 
                    s.override.SessionId !== -1 && s.type === session.type;
                }
                else
                    return false;
            });
            for(const s of others) {
                s.override.SessionId = -1;
            }
        }
    }

    handleLanguage(file) {
        this.logger.info(`[site::handleLanguage] check site language`);
        this.language = 'English';
        try {
            let content = this.utils.readPropFile(file);
            this.logger.debug(content);
            if (content) {
                this.language = content['LANGUAGE']?(content['LANGUAGE'].substring(0,1).toUpperCase() + content['LANGUAGE'].substring(1).toLowerCase()):this.groupConfig.language;
            }
        } catch(e) {
            this.logError(e);
            // throw e;
        }
        this.logger.info(`[site::handleLanguage] site language: ${this.language}`);
    }

    commit(isOverwriteSession = false) {
        this.logger.info(`[site::commit] start`);
        return new Promise(async (rs, rj) => {
            //const promises = [];
            this.logger.info(`[site::commit] start to create sessions...`);
            try {
                const res4ss = await bzdb.select('sessionShared');
                const allSessions = res4ss.data;
                for (const session of this.sessions) {
                    try {
                        const result = await session.doImport(this.req, isOverwriteSession);
                        if (!result) continue;  // BZ-18185, no need to solve conflict if import failed.
                    } catch (e) {
                        this.logger.warn("For session " + session.name + ": " + e.stack);
                        continue;
                    }

                    if(!Session.isSuccessfulImport(session.out.action)) continue;

                    if(isOverwriteSession) {
                        //update existing BZA session
                        const rs = await bzdb.select('sessionShared', {name: session.name});
                        if(rs) {
                            allSessions.find((s, index) => {
                                if(s.name === session.name) {
                                    allSessions[index] = rs.data[0];
                                    return true;
                                }
                            });
                        }
                    }
 
                    //Solve conflict of session id
                    const s = allSessions.find((s) => {
                        if(s.miscW2h === undefined) return false;
                        if(session.override === null ) return false;
                        if(s.miscW2h.sid !== session.override.SessionId) return false;
                        if(s.name === session.name && isOverwriteSession) return false; //BZ-14503
                        
                        //check if the session type is same                        
                        const a = s.type.slice(0, 4);
                        if(s.type.slice(0, 4) === '3270' && session.type === 'zmd') return true;
                        if(s.type.slice(0, 4) === '5250' && session.type === 'zad') return true;
                        if(s.type.slice(0, 2) === 'VT' && session.type === 'zvt') return true;
                        if(s.type === 'TANDEM' && session.type === 'z65') return true;
                        if(s.type.slice(0, 3) === 'FTP' && session.type === 'zft') return true;
                        if(s.type.slice(0, 4) === '3287' && session.type === 'zmp') return true; 
                        if((s.type.slice(0, 4) === '3812' || s.type.slice(0, 4) === '5553')
                            && session.type === 'zap') return true;
                        return false;   
                        }
                     );
                    if(s) {
                        s.miscW2h.sid = -1;
                        let rs = await bzdb.updateOrInsert('sessionShared', s);
                        if(!rs.status) {
                            this.logger.warn(`failed to update session ${s.name} due to conflict on session id`);
                        }
                    }
                }
                this.logger.info(`[site::commit] completed to create sessions`);
                
                let count = 0;
                const groups = this.getCommitGroups();
                if (groups.length == 0) return rs('resolved');
                this.logger.info(`[site::commit] start to create groups...`);
                for (let group of groups) {
                    /*
                        As it requies group id to add group to backend db but obtaining this id needs to read
                        instances\groups\id_manager.json and write it to this file when writing db performs, 
                        it's not possible to get these commit operations asynchronous.
                    */        
                    if (group.importOpt.isImport) {
                        await group.commit(this);
                    } else {
                        this.logger.info(`[site::commit] skip group '${group.name}'`);
                    }
                    count = count + 1;
                    if (count === groups.length) {  //last group gets done
                        
                        //commit other work...   (TO DO)                 
                        
                        this.logger.info(`[site::commit] completed`);
                        return rs('resolved');
                    }
                }
            } catch(err) {
                return rj(err);
            }
           
        });
    }

    report(importData = null) {
        this.summary = {};
        if(this.error === '') {
            this.summary.status = true;
            this.summary.data = {
                site: {
                    reportId: importData ? importData.id : ''
                },
                groups: []
            };
            for (const group of this.getCommitGroups()) {
                if (!group.importOpt.isImport) {
                    continue;
                }
                const folder = {
                    // id: group.groupId,
                    orgName: group.orgName,
                    name: group.name,
                    isW2hMode: !group.desktopMode,
                    sessions: []
                }
                for (const gs of group.sessions) {
                    const find = this.sessions.find(s => s.name === gs.name);
                    const session = {
                        id: find ? find.out.id : gs.out.id,
                        orgName: gs.orgName,
                        name: find ? find.out.name : gs.name,
                        overrideDesc: gs.overrideDesc,
                        type: gs.type,
                        isBzaSupport: gs.isBzaSupport,
                        isBinaryFormat: gs.isBinaryFormat,
                        action: find? find.out.action : gs.out.action,
                        error: find ? find.out.error : gs.out.error
                    }
                    folder.sessions.push(session);
                }
                this.summary.data.groups.push(folder);
            }
        } else {
            this.summary.status = false;
            this.summary.data = {};
            if(this.error.message != undefined)
                this.summary.reason = this.error.message;
            else
                this.summary.reason = this.error;            
        }

        this.logger.info(`[site::report] import summary:\r${JSON.stringify(this.summary, null, 2)}`);

        if (importData) {
            try {
                const jsonFile4Summary = path.join(this.siteReportDir, `${importData.id}.json`);
                fs.writeFileSync(jsonFile4Summary, JSON.stringify(this.summary, null, 2));
                this.updateImportHistory(importData);  // BZ-13891
            } catch (e) {
                this.logger.warn(`[site::report] failed to write summary, ${e}`);
            }
        }
    }

    // BZ-13891
    updateImportHistory(importData) {
        let histData = {
            timestamp: 0,
            data: []
        };
        try {
            if (fs.existsSync(this.importHistoryFile)) {
                const data = fs.readFileSync(this.importHistoryFile, 'utf-8');
                histData = JSON.parse(data);
            }
            histData.timestamp = importData.timestamp;
            histData.data.push(importData);
            fs.writeFileSync(this.importHistoryFile, JSON.stringify(histData, null, 2));
        } catch (e) {
            this.logger.warn(`[site::history] failed to update import history, ${e}`);
        };
    }

    // BZ-13891
    getImportHistory() {
        let histData = {
            timestamp: 0,
            data: []
        };
        try {
            if (fs.existsSync(this.importHistoryFile)) {
                const data = fs.readFileSync(this.importHistoryFile, 'utf-8');
                histData = JSON.parse(data);
            }
            return histData;
        } catch (e) {
            return histData;
        }
    }

    clean(sitePath) {
        try {
            this.utils.rmdirSync(sitePath);
            for (const group of this.groups) {
                // BZ-13966, make sure the temp folder was removed
                group.deleteGroupDirectory();
            }
        } catch(err) {
            this.logger.warn(`[site::clean ] failed to remove ${sitePath} due to ${err}`);    
        }
    }

    cleanInvalidSiteFile(siteFile, targetDir) {
        try {
            if(fs.existsSync(siteFile))
                fs.unlinkSync(siteFile);
            if(targetDir != '' && fs.existsSync(targetDir))
                this.utils.rmdirSync(targetDir);
        } catch(err) {
            this.logger.warn(`[site::cleanInvalidSiteFile] failed to remove ${targetDir} due to ${err}`);              
        }
    }

    rollBack() {
        return new Promise(async (rs, rj) => {
            let count = 0;
            const promises = [];
            try {
                for (let group of this.groups) {
                    await group.rollBack(this);
                    count = count + 1;                    
                }
                this.sessions.forEach(session => {
                    promises.push(session.deleteSession(this.req));
                });
                
                if (count === this.groups.length) {  //last group gets done                        
                    //rollback other work...   (TO DO)                 
                    Promise.all(promises).then(async (results) => {
                        this.logger.info(`[site::rollBack] site ${this.sitename} rollbacks`);
                        return rs('resolved');
                    }).catch(e => {
                        this.logError(e);
                        return rj(e);
                    });                   
                }
            } catch(err) {
                return rj(err);
            }
        });
    }

    checkSite(siteName) {
        const site = path.join(this.siteDir, siteName);
        return (fs.existsSync(site) === true) ? {result: true} : {result: false};
    }

    getCommitGroups() {
        return this.groups;//.filter(group => group.desktopMode == false);//BZ-13766 import served desktop
    }

    logError(err) {
        this.error = err;
        this.logger.severe(`[site::logError] ${err.message == undefined ? err : err.message}`);
        if(err.message != undefined) this.logger.severe(`[site::logError] ${err.stack}`);
    }

    setErrorSummary(err, resetRunningFlag = true) {
        if(this.summary.status == undefined) {
            this.summary.status = false;
            this.summary.data = {};
            this.summary.reason = err.message == undefined ? err : err.message;
        }
        if(resetRunningFlag)
            this.running = false;
    }

    normalize(zipFile) {
        const emitter = new events.EventEmitter();
        let sitename = path.win32.basename(zipFile);
        sitename = sitename.replace(/\.[^/\\.]+$/, "");    
        const read = fs.createReadStream(zipFile);
        let isValid = false;
        read.pipe(unzip.Parse())
        .on('entry', entry => {
            if(entry.type === 'File') {
                const filename = path.win32.basename(entry.path);
                if(filename === 'web.config') {
                    isValid = true;
                    this.logger.info('[site::normalize] found valid site');
                    const dir = path.dirname(entry.path);
                    if(dir !== '.') {
                        if(sitename !== dir)
                            sitename = dir;
                        const target = path.join(path.dirname(zipFile), sitename);   
                        emitter.emit('done', zipFile, sitename, path.dirname(zipFile), target);                                                       
                    } else {
                        const target = path.join(path.dirname(zipFile), sitename);
                        emitter.emit('done', zipFile, sitename, target, target);                        
                    }                    
                    entry.autodrain();
                    // throw new Error('checking done');  // BZ-14013
                } 
            }            
            entry.autodrain();
        })
        .on('finish', () => {
            // BZ-14013
            if (!isValid) {
                emitter.emit('error', new Error('Invalid site.'));
            }
        })
        .on('error', (e) => {
            // if(e.message === 'checking done') return;  // BZ-14013
            this.logger.severe(`[site::normalize] ${e}`);
            emitter.emit('error', e);
        });  
        return emitter;
    }

    setStatus(isRunning) {  // BZ-18184
        this.running = isRunning ? true : false;
    }
    
}   //end of class

module.exports = {
    init(context, configSvc) {
      if (!context.bzw2hImportSite) {
        context.bzw2hImportSite = new bzw2hImportSiteService(context, configSvc);
      }
      return context.bzw2hImportSite;
    }
  };
