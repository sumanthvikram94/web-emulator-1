
const fs = require('fs-extra');
const path = require('path');
const bzdb = require('../../../../bzshared/lib/services/bzdb.service');
const Utils = require('../../services/utils.service');
const ini = require('ini');
const w2hPriv = require('../../model/w2h-privilege.model');
const Bzw2hUtils = require('../bzw2h-utils');
const override = require('../../model/bzw2h-overrides-model');
const w2h_const = require('../../../../bzshared/lib/model/w2h-const'); // BZ-20034, update version to 10.2.0

const BZW2H_GROUPS = 'groups';
const DESKTOP_INI = 'desktop.ini';

class LaunchFolder {
    constructor(dir, siteName, orgName, logger, context, configSvc,language) {
        
        this.dir = dir;
        this.orgName = orgName;
        this.siteName = siteName;
        this.name = `${siteName}_${orgName}`.replace(/[^A-Za-z0-9_ ]/g, '_');
        this.importOpt = { isImport: true, isOverwrite: true };
        this.groupId = 'unknown';
        this.logger = logger;
        this.context = context;
        this.configSvc = configSvc;
        this.utils = new Utils();
        this.desktopMode = false;
        this.error = '';
        this.sessions = [];
        this.privileges = {};
        this.distFiles = [];
        this.customFilesInOthers = [];  //extra custom files
        this.distFilesInShared = [];
        this.oldDistData = {};
        this.newDistFileData = '';
        this.features = [];
        this.bzscFeature = '';
        this.groupConfig = {
            method: 'launchPad', 
            LMGroup: '',
            usePersonal: true,
            cacheFile: "application",
            cacheBit: "32",
            openWLConfig:{
                createDesktop: true,
                shortcut: 'BZW2H',
                createMenu: true,
                clearFile: true
            },
            language: language,
            globalIni: '',
            sessions: []
        };
        this.desktopIniExist = false;
        this.sdGroupConfig = {
            "installOption": {
				"installDir": `<User Application Data>\\BlueZone\\${w2h_const.MAJOR_VERSION}`,
				"isUseProgramGroup": false,
				"programGroupName": `Rocket TE ${w2h_const.MAJOR_VERSION}`,
				"isCreateShortCut": true,
				"shortcutName": "sd",
				"isAddManager": false,
				"isSuppressLaunch": true,
				"isSuppressSession": true
			},
			"sessionManagerOption": {
				"isAutoUpdate": true,
				"isForceUpdate": false,
				"SecondaryURL": "",
				"isRunInTray": false
			}
        }
        this.launchFolderItems = {
            'default.ini': handleDefaultIni,
            'global.ini': handleGlobalIni,
            'page.json': handlePageJson,
            'launch_x.htm': handleLaunchXHtm,
            'launch_jws.htm': handleLaunchJWSHtm,
            'launch_bws.htm': handleLaunchBWSHtm, 
            'bzw2h.bzlp': handleBzlp,
            'bzw2h.jnlp': handleJnlp,  
            'desktop.ini': handleDesktopIni,
            'default.dst': handleDefaultDST,
            'page.properties' : handlePageProp
        }

        /*try {
            this.logger.info(`[folder] generate group name: '${this.orgName}' => '${this.name}'`);
            const chars = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"];
            const temp = [...Array(8)].map(i=>chars[Math.random()*chars.length|0]).join``;
            const dir = path.normalize(path.join(this.dir, '..', '..', '..', BZW2H_GROUPS, temp));
            this.tempDir = dir;
            this.tempId = temp;
            this.logger.info(`[folder] create temp group folder '${temp}'`);          
            const result = this.configSvc.newGroupDirectory(temp);
            if (result) throw result;
        } catch(err) {
            this.logError(err);
            throw err;
        }
        */
        this.defaultIniContent = "",
        this.globalIniContent = ""
    }

    getHandler(file) {
        return this.launchFolderItems[file];
    }

    logError(err) {
        this.error = err;
        this.logger.severe(`[folder::logError] ${err.message == undefined ? err : err.message}`); 
        if(err.message != undefined) this.logger.severe(`[folder::logError] ${err.stack}`);
    }    

    async handleDefaultIni( data) {
        this.logger.info(`[folder::handleDefaultIni] parse file default.ini`);
        this.defaultIniContent = data;
        const defaultIni = ini.parse(data);
        if(defaultIni['BlueZone']['DesktopMode'] === DESKTOP_INI ) {
            this.desktopMode = true;
            //this.deleteGroupDirectory();//BZ-13766 import served desktop
        }
        if(defaultIni['BlueZone']['UsePersonalFolderAsWorkingDir'] && (defaultIni['BlueZone']['UsePersonalFolderAsWorkingDir']).toLowerCase() === 'no') {
            this.groupConfig.usePersonal = false;
        }else{
            this.groupConfig.usePersonal = true;
        }
        //Enable Session Manager auto-update in served desktop mode
        if(defaultIni['Session Manager']) {
            if(defaultIni['Session Manager']['AutoUpdate']) {
                if((defaultIni['Session Manager']['AutoUpdate']).toLowerCase() == 'no') {
                    this.sdGroupConfig.sessionManagerOption.isAutoUpdate = false;
                }else{
                    this.sdGroupConfig.sessionManagerOption.isAutoUpdate = true;
                }
            }
        }
        if(defaultIni)
        this.privileges = Bzw2hUtils.updatePrivFromDefaultIniStream(this.defaultIniContent, w2hPriv.defaultPriv).data;
        return;
    }
    
    async handleGlobalIni( data) {
        this.logger.debug(`[folder::handleGlobalIni] parse file global.ini`);
        this.globalIniContent = data;
        return;
    }
    
    async handlePageJson( data) {
        this.logger.info(`[folder::handlePageJson] parse file page.json }`);
        try {
            let confJson = JSON.parse(data);
            if (confJson.params['LaunchPad'] && confJson.params['LaunchPad'].toLowerCase() === 'no') {
                this.groupConfig.method = 'all';
            } else {
                this.groupConfig.method = 'launchPad';
            }
            if ( confJson.params['CachePlatform']) {
                if (confJson.params['CachePlatform'].toLowerCase() === '32') {
                    this.groupConfig.cacheBit = '32';
                } else if (confJson.params['CachePlatform'].toLowerCase() === 'system') {
                    this.groupConfig.cacheBit = 'windows';
                } else if (confJson.params['CachePlatform'].toLowerCase() === 'office') {
                    this.groupConfig.cacheBit = 'ms';
                } else if (confJson.params['CachePlatform'].toLowerCase() === 'browser') {
                    this.groupConfig.cacheBit = 'windows';
                }
            }
            if (confJson.params['CacheDirectory']) {
                if (confJson.params['CacheDirectory'].toLowerCase() === 'allusersapplicationdata') {
                    this.groupConfig.cacheFile = 'all';
                } else if (confJson.params['CacheDirectory'].toLowerCase() === 'applicationdata') {
                    this.groupConfig.cacheFile = 'application';
                } else if (confJson.params['CacheDirectory'].toLowerCase() === 'temp') {
                    this.groupConfig.cacheFile = 'temp';
                }
            }
            if (confJson.params['LMGroup']) {
                this.groupConfig.LMGroup = confJson.params['LMGroup'];
            }
            //served desktop mode
            if (confJson.params['UseSessionManagerShortcut']) {
                if((confJson.params['UseSessionManagerShortcut']).toLowerCase() === 'no') {
                    this.sdGroupConfig.installOption.isCreateShortCut = false;
                }else{
                    this.sdGroupConfig.installOption.isCreateShortCut = true;
                }
            } 
            if (confJson.params['SessionManager']) {
                this.sdGroupConfig.installOption.shortcutName = confJson.params['SessionManager'];
            }
            if (confJson.params['LaunchSessionManager']) {
                if ((confJson.params['LaunchSessionManager']).toLowerCase() === 'no') {
                    this.sdGroupConfig.installOption.isSuppressLaunch = true;
                }else{
                    this.sdGroupConfig.installOption.isSuppressLaunch = false;
                }
            } 
            if (confJson.params['Sessions']) {
                this.sdGroupConfig.installOption.isSuppressSession = false;
            }else{
                this.sdGroupConfig.installOption.isSuppressSession = true;
            }
            if (confJson.params['SessionManagerSecondaryURL']) {
                this.sdGroupConfig.sessionManagerOption.SecondaryURL = confJson.params['SessionManagerSecondaryURL'];
            }

            if(!this.groupConfig.sessions.length)
                this.handleSessionData(confJson.params);

        } catch(e) {
            this.logError(e);
            // throw e;
        }
    }
    getServedSessions(pageParams) {
        let names = [];
        /*
            BZ-14525
            Each file in a group is parsed asychronously so as this.desktopMode is obtained from 
            default.ini but this function is called when parsing page.json, if page.json is parsed 
            before defaut.ini, this member would be probably false like this bug, thus there is nothing 
            parsed further in this function.
            In fact, this function is entered as long as 'Sessions' element doesn't exist in page.json,
            so we may simply ignore this.desktopMode here with little performance penalty.
        */
        // if(this.desktopMode) {
            for(let key in pageParams){
                //['.zmd','.zad','.zvt','.zap','.zmp','.z65','.zft']
                //key.index('_') key.split('_',1) ['MD', 'AD'].indexOf(key.split('_',1)) !== -1
                //if( (key.indexOf('MD_') != -1) || (key.indexOf('AD_') != -1) || (key.indexOf('VT_') != -1) 
                //    || ((key.indexOf('FTP_') != -1)) || (key.indexOf('BZ6530_') != -1)) 
                if(key.indexOf('_') !== -1 && Bzw2hUtils.getSDPageSessionPRE().indexOf(key.split('_',1)[0]) !== -1 ) {
                   let pos = pageParams[key].lastIndexOf('.');
                   let suffix = pos !== -1 ? pageParams[key].substring(pos+1,  pageParams[key].length) : '';
                   if(suffix.length !== 0 && Bzw2hUtils.getAllProfileExt().indexOf(suffix) !== -1) {
                       names.push(key);
                   }
                }                 
      
            }
        // }
        return names;
    }

    handleSessionData(data) {
        // Sample:
        // "Sessions" : "MD_S1,MD_S2,MD_S3,MD_S4,AD_S-1",
        // "MD_S4" : "r3.zmd",
        // "MD_S4_HostAddress" : "rs73",
        // "MD_S4_ConnectionName" : "r3a",
        // "MD_S4_Save" : "Yes"    
        this.logger.info(`[folder::handleSessionData] parse session data:\r${JSON.stringify(data, null, 2)}`);  
        let sessions = [];
        let names = data['Sessions'] ? data['Sessions'].split(',') : [];  // BZ-14220
        if(names.length === 0) {
            names = this.getServedSessions(data);
        }
        for(const name of names) {
            let session;
            if(name.indexOf('MD_') != -1) {
                session = JSON.parse(JSON.stringify(override["3270"]));
                session.SessionId = parseInt(name.slice(4), 10);
            } else if(name.indexOf('AD_') != -1) {
                session = JSON.parse(JSON.stringify(override["5250"]));
                session.SessionId = parseInt(name.slice(4), 10);
            } else if(name.indexOf('VT_') != -1) {
                session = JSON.parse(JSON.stringify(override["VT"]));
                session.SessionId = parseInt(name.slice(4), 10);
            } else if(name.indexOf('FTP_') != -1) {
                session = JSON.parse(JSON.stringify(override["FTP"]));
                session.SessionId = parseInt(name.slice(5), 10);
            } else if(name.indexOf('BZ6530_') != -1) {
                session = JSON.parse(JSON.stringify(override["6530"]));
                session.SessionId = parseInt(name.slice(8), 10);
            } else if(name.indexOf('MP_') != -1) {
                session = JSON.parse(JSON.stringify(override["3270"]));
                session.SessionId = parseInt(name.slice(4), 10);
            } else if(name.indexOf('AP_') != -1) {
                session = JSON.parse(JSON.stringify(override["5250"]));
                session.SessionId = parseInt(name.slice(4), 10);
            }           
            else {
                // BZ-14215
                session = JSON.parse(JSON.stringify(override["other"]));
            }

            session.Name = name;
            sessions.push(session);

            for(const key in data) {
                if(key === name) {
                    session.Profile = data[key];
                }
                else if(key.indexOf(name) != -1) {
                    const skey = key.slice(name.length + 1);
                    session[skey] = data[key];
                }
            }            
        }

        this.groupConfig.sessions = sessions;
    }

    async handleLaunchXHtm(data) {
        this.logger.debug(`[folder::handleLaunchXHtm] parse launch_x.htm`);
    }
    
    async handleLaunchJWSHtm(data) {
        this.logger.debug(`[folder::handleLaunchJWSHtm] parse launch_jws.htm`);
    }
    
    async handleLaunchBWSHtm(data) {
        this.logger.debug(`[folder::handleLaunchBWSHtm] parse launch_bws.htm`);
    }
    
    async handleBzlp(data) {
        this.logger.debug(`[folder::handleBzlp] parse bzw2h.bzlp`);
    }
    
    async handleJnlp(data) {
        this.logger.debug(`[folder::handleJnlp] parse bzw2h.jnlp`);
    }   
    
    updataDesktopIni(data) {
        let desktopIni = ini.parse(data);
        //Destination
        if(desktopIni['BZSetup']) {
            if(desktopIni['BZSetup']['DestinationDir']) {
                desktopIni['BZSetup']['DestinationDir'] = desktopIni['BZSetup']['DestinationDir'].replace(/(.*\\BlueZone\\)(7\.1|6\.1|6\.2)$/,`$1${w2h_const.MAJOR_VERSION}`);
            }
        }
        //Program group
        if(desktopIni['Program Group']) {
            if(desktopIni['Program Group']['GroupName']) {
                if(desktopIni['Program Group']['GroupName']) {
                let valid = /^BlueZone\s*(6\.1|6\.2|7\.1)$/.test(desktopIni['Program Group']['GroupName']);
                if(valid){
                    desktopIni['Program Group']['GroupName'] = `Rocket TE ${w2h_const.MAJOR_VERSION}`;
                }
                }
            }
        }
        const pgrpText = {
            "MainframeDisplayText": "Mainframe Display",
            "MainframePrinterText": "Mainframe Printer",
            "iSeriesDisplayText": "iSeries Display",
            "iSeriesPrinterText": "iSeries Printer",
            "VTText": "VT Display",
            "SessionManagerText": "Session Manager",
            "ScriptEditorText": "Script Editor",
            "FTPText": "FTP",
            "HllapiRedirectorText": "HLLAPI Redirector",
            "ScriptingHostText": "Scripting Host",
            "TCP/IPPrintServerText": "TCP-IP Print Server",
            "ICLDisplayText": "ICL Display",
            "UTSDisplayText": "UTS Display",
            "T27DisplayText": "T27 Display",
            "6530Text": "6530 Display",
            "ALCText": "ALC Display",
            "BlueZoneTabText": "TE Tab"
        };
        if(desktopIni['Program Group']) {
            for(var key in pgrpText) {
                if(desktopIni['Program Group'][key]) {
                    desktopIni['Program Group'][key] = pgrpText[key];
                }
            }
            
        }
        data = ini.stringify(desktopIni);
        return data;
    }
    async handleDesktopIni(data) {
        this.logger.debug(`[folder::handleDesktopIni] parse desktop.ini`);
        this.desktopIniExist = true;
        data = this.updataDesktopIni(data);
        const desktopIni = ini.parse(data);
        if(desktopIni['BZSetup']) {
            if(desktopIni['BZSetup']['DestinationDir']){
                this.sdGroupConfig.installOption.installDir = desktopIni['BZSetup']['DestinationDir'];
            }
        }
        if(desktopIni['Program Group']) {
            if(desktopIni['Program Group']['UseGroup']) {
                if((desktopIni['Program Group']['UseGroup']).toLowerCase() === 'no') {
                    this.sdGroupConfig.installOption.isUseProgramGroup = false;
                }else{
                    this.sdGroupConfig.installOption.isUseProgramGroup = true;
                }
            } 
            if(desktopIni['Program Group']['GroupName']) {
                this.sdGroupConfig.installOption.programGroupName = desktopIni['Program Group']['GroupName'];
            }
        }
        if(desktopIni['Desktop Shortcuts']) {
            if(desktopIni['Desktop Shortcuts']['SessionManagerInStartupFolder']) {
                if((desktopIni['Desktop Shortcuts']['SessionManagerInStartupFolder']).toLowerCase() === 'no') {
                    this.sdGroupConfig.installOption.isAddManager = false;
                }else{
                    this.sdGroupConfig.installOption.isAddManager = true;
                }
            } 
        }
        if(desktopIni['Session Manager']) {
            if(desktopIni['Session Manager']['RunInTray']) {
                if((desktopIni['Session Manager']['RunInTray']).toLowerCase() === 'no') {
                    this.sdGroupConfig.sessionManagerOption.isRunInTray = false;
                }else{
                    this.sdGroupConfig.sessionManagerOption.isRunInTray = true;
                }
            } 
            if(desktopIni['Session Manager']['ForceUpdates']) {
                if((desktopIni['Session Manager']['ForceUpdates']).toLowerCase() === 'no') {
                    this.sdGroupConfig.sessionManagerOption.isForceUpdate = false;
                }else{
                    this.sdGroupConfig.sessionManagerOption.isForceUpdate = true;
                }
            }
        }
        
    }    

    async handlePageProp(data) {
        this.logger.info(`[folder::handlePageProp] parse page.properties`);
        try {
            let content = {};
            let lines = data.split('\n');
            for(let line of lines){
                if(line && line.indexOf("=") >= 0){
                    content[line.substring(0,line.indexOf('='))] = line.substring(line.indexOf('=')+1,line.endsWith('\r')?line.length - 1:line.length);
                }
            }
            this.logger.debug(content);
            if (content) {
                if (content.hasOwnProperty('IS_LEAVE_JNLPS'))
                    this.groupConfig.openWLConfig.clearFile = content['IS_LEAVE_JNLPS'].toLowerCase() === 'false';
                if (content.hasOwnProperty('IS_CREATE_DESKTOP_SHORTCUT'))
                    this.groupConfig.openWLConfig.createDesktop = content['IS_CREATE_DESKTOP_SHORTCUT'].toLowerCase() === 'true';
                if (content.hasOwnProperty('APP_LABEL'))
                    this.groupConfig.openWLConfig.shortcut = content['APP_LABEL'];
                this.groupConfig.openWLConfig.createMenu = content['MENU_LABEL']? true: false;
            }
        } catch(e) {
            this.logError(e);
            // throw e;
        }
    }  

    async handleDefaultDST( data) {
        this.logger.info(`[folder::handleDefaultDST] parse default.dst`);
        const items = data.split('\r\n');
        items.forEach(item => {
            if (!item.length) return;
            const part = item.split(',');
            const name = path.basename(part[0]);
            if (name.length > 0 && LaunchFolder.isCustomFile(part[0], this.configSvc.bzw2hDir) &&
                !LaunchFolder.isFileInOthers(part[0])) {
                const isProfile = ['.zmd','.zad','.zvt','.zap','.zmp','.z65','.zft'].indexOf(path.extname(name)) >= 0;
                const isInConfigDir = (part[0].indexOf('/configs/') >= 0);    
                if(!isProfile || !isInConfigDir) {
                    this.logger.info(`[folder::handleDefaultDST], add 'custom' file dist '${name}'`);
                    this.distFiles.push(name);
                }
            }
            else {
                if (!LaunchFolder.isNotSupportedDistribution(name) && (part[0] !== '../global.ini')) {
                    const is = LaunchFolder.isNotDefaultOfSharedFolder(part[0], this.configSvc.bzw2hDir);
                    if (LaunchFolder.isFileInOthers(part[0])) {
                        if (LaunchFolder.isSystemFile(name)) {
                            this.newDistFileData = this.newDistFileData + `${item}\r\n`;
                        } else {
                            const src = path.join(this.dir, part[0]);
                            this.customFilesInOthers.push(src);
                            this.logger.info(`[folder::handleDefaultDST], add 'custom' file dist '${name}'`);
                            this.distFiles.push(name);
                        }
                    } else if (part[0].indexOf("../shared/") != -1) {
                        if (!is) {
                            this.newDistFileData = this.newDistFileData + `${item}\r\n`;
                        } else if (LaunchFolder.isSystemFile(name)) {
                            this.logger.info(`[folder::handleDefaultDST], add 'shared' file dist '${name}'`);
                            this.distFilesInShared.push(name);
                        }
                    }
                }

                if (['bzftp.cab','bzap.cab', 'bzmp.cab', 'bzlpd.cab', 'bzkerb.cab'].indexOf(name) !== -1) {
                    this.logger.info(`[folder::handleDefaultDST], add feature dist '${name}'`);
                    this.features.push(name.slice(0, -4));
                }

                // BZ-13965
                if (['bzsc.cab', 'bzscp.cab'].indexOf(name) !== -1) {
                    this.bzscFeature = name;
                }
            }
        })
    }

    static isNotSupportedDistribution(file) {
        return (['bzalc.cab', 'bzt27.cab', 'unisys.cab', 'bzuts.cab',
            'BZT27.INI', 'T27QPORT.INI', 'BZUTS.INI', 'BZUTSPTR.INI', 'UTSQPORT.INI',
            'default.ini', 'global.ini', 'desktop.ini',
            'default.dst', 'default-64.dst'].indexOf(path.win32.basename(file)) != -1) || 
                (['.zld', '.zud', '.ztd'].indexOf(path.extname(file)) != -1);
    }

    static isSystemFile(file) {
        return ['.cab','.dl_', '.ex_', '.af_', '.di_', '.lic', '.fo_', '.dll', '.exe', '.ttf', '.js', '.css', ].indexOf(path.extname(file)) != -1;        
    }

    static isFileInOthers(file) {
        return (file.indexOf('/shared/') == -1) && (file.indexOf('/configs/') == -1);
    }

    static isCustomFile(file, bzw2hProductDir) {
        const is = !LaunchFolder.isSystemFile(file);
        const is2 = !LaunchFolder.isNotSupportedDistribution(file);
        const is3 = LaunchFolder.isNotDefaultOfSharedFolder(file, bzw2hProductDir);
        return (is && is2 && is3);
    }
    
    static isNotDefaultOfSharedFolder(file, bzw2hProductDir) {
        if (file.indexOf('../shared/') == -1) return true;
        const defPath = path.join(bzw2hProductDir, 'template', 'default.dst');
        try {
            const data = fs.readFileSync(defPath, 'utf8');
            if (data.indexOf(path.basename(file)) != -1) return false;
        } catch(err) {
            throw err;
        }
        return true;
    }

    async createOrUpdateGroup() {
        this.logger.info(`[folder::createOrUpdateGroup] add/update group '${this.name}'`);
        let existing = false;
        const rs = await bzdb.select('group', {groupName: this.name});
        if (rs.rowCount > 0) {
            existing = true;
            this.logger.info(`[folder::createOrUpdateGroup] group '${this.name}' already exist`);
            this.logger.debug(`[folder::createOrUpdateGroup] group data: ${JSON.stringify(rs.data[0])}`);
        }
 
        let dir = path.join(this.context.plugin.server.config.user.instanceDir, 'groups');
        const id = existing ? rs.data[0].id : bzdb.getUIDSync();
        this.groupId = id;
        this.logger.info(`[folder::createOrUpdateGroup] group id: '${id}'`);
        this.sessions = this.sessions.filter((s)=>{
            if ((s.out.action !== "overwrite") && !s.checkGroupScope(this.groupId)) { //BZ-19900
                return false;
            } else {
                return true;
            }
        });
        const tSessions = [];
        this.sessions.forEach((session) => {
            if (!session.out.error && tSessions.indexOf(session.out.id) < 0 && session.out.id != '') {
                tSessions.push(session.out.id)
            }
        });

        // BZ-13965
        if ('bzsc.cab' === this.bzscFeature) {
            this.privileges.enableRecorder = true;
            this.privileges.enableUseEditor = true;
            this.privileges.enablePlayScript = true;
        } else if ('bzscp.cab' === this.bzscFeature) {
            this.privileges.enablePlayScript = true;
        }
        this.logger.info(`[folder::createOrUpdateGroup] privilege is:\n${JSON.stringify(this.privileges, null, 2)}`);

        let data = {};
        if (existing) {
            data = rs.data[0];
            data.sessions = tSessions;
            data.privileges = this.privileges;
            data.timestamp = Date.now();
        } else {
            data = {
                "groupName": this.name,
                "shortName": "",
                "id": id,
                "leader": "",
                "parentGroupName": "",
                "description": `Imported from launch folder '${this.orgName}' in site '${this.siteName}'`,
                "internalUsers": [],
                "sessions": tSessions,
                "privileges": this.privileges,
                "timestamp": Date.now(),
                "ldapUsers": [],
                "mssqlUsers": [],
                "ssoUsers": [],
                "action": "add",
                "type": "user",
                "deployMode": "w2h"
            }
            
        }
        if(this.desktopMode && this.desktopIniExist) {
            data.deployMode = 'sd';
        }else{
            data.deployMode = 'w2h';
        }

        let batchTxnGroup =[];
        // this.logger.info(`[folder::createOrUpdateGroup] update settings for group '${this.name}'`);
        /* dir = path.join(path.dirname(this.tempDir), this.groupId);
        if (fs.existsSync(dir))
            this.utils.rmdirSync(dir);
        fs.renameSync(this.tempDir, dir);
        this.dir = dir;
        */
        const gsData = {
            gid: id,
            deployMode: data.deployMode,
            w2h: this.groupConfig,
            sd: this.sdGroupConfig,
            defaultIniData: this.defaultIniContent,
            globalIniData: this.globalIniContent
        };
        try{
            batchTxnGroup.push({dataEntityName: 'group', action: 'UPDATEORINSERT', value: data});
            batchTxnGroup = batchTxnGroup.concat(this.configSvc.newGroupDirectoryDB(data.id,!this.desktopMode));
            batchTxnGroup = batchTxnGroup.concat( this.configSvc.setSetting4GroupDB(gsData));
            await bzdb.batchTxn(batchTxnGroup).then(
            (rep) => {
                this.logger.info(`[folder::createOrUpdateGroup] successfully added/updated group '${data.groupName}'`);
                this.logger.debug(`[folder::createOrUpdateGroup] group data: ${JSON.stringify(data)}`);
                this.logger.info(`[folder::createOrUpdateGroup] settings for group '${this.name}':\n${JSON.stringify(gsData, null, 2)}`);
                this.groupId = id;
            },
            err => {
                this.setLastError(`add/update group '${values.groupName}' failed: ${err && err.message || 'exception occurs'}`);
                this.logger.severe(`[folder::createOrUpdateGroup] failed to add/update group, ${this.error.stack}`);
                this.logger.debug(`[folder::createOrUpdateGroup] group data: ${JSON.stringify(data)}`);
                this.groupId = 'unknown';
                throw this.error;
            });


        }catch(e){
            this.logger.severe(`[folder::createGroup/setSetting4Group] failed to create group when importing site, ${e.stack}`);
        }


        this.logger.info(`[folder::createOrUpdateGroup] complete for group '${this.name}'`);        
    }

    async deleteGroup() {
        try {
            if (this.groupId === 'unknown') {
//                this.deleteGroupDirectory();
                return;
            }

            await bzdb.delete('group', { id: this.groupId }).then(
                (rep) => {
                    this.logger.info(`[folder::deleteGroup] successfully deleted group "${this.groupId}"`);
                    this.deleteGroupDirectory();
                },
                err => {
                    this.setLastError(`Delete group "${this.groupId}" failed: ${err && err.message || 'Exception occurs'}`);
                    this.logger.severe(`[folder::deleteGroup] ${this.error}`);
                }
            )
        } catch (err) {
            this.setLastError(err);
        }
    }

    deleteGroupDirectory() {
        if(this.groupId){
            this.configSvc.deleteGroupRelatedDB(this.groupId);
        }
    }
    async commitBzIniFiles() {
        this.logger.info(`[folder::commitBzIniFiles] start`);
        return new Promise((rs, rj) => {
            try {
                let defaultIniFile = path.join(this.dir, 'default.ini');
                if (fs.existsSync(defaultIniFile)) {
                    let data = fs.readFileSync(defaultIniFile, 'utf-8');
                    data = data.replace(/(MajorVersion\s*=\s*)[^\r\n]+/g, `$1${w2h_const.MAJOR_VERSION}`);
                    fs.writeFileSync(defaultIniFile, data);
                    this.logger.info(`[folder::commitBzIniFiles] complete to update '${defaultIniFile}'`);
                }
                // update global.ini file
                let globalIniFile = path.join(this.dir, 'global.ini');
                if (fs.existsSync(globalIniFile)) {
                  let data = fs.readFileSync(globalIniFile, 'utf-8');      
                  data = data.replace(/(WebHelpUrl\s*=\s*)[^\r\n]+/g, `$1${w2h_const.helpUrl}`);
                  fs.writeFileSync(globalIniFile, data);
                  this.logger.info(`[folder::commitBzIniFiles] complete to update '${globalIniFile}'`);
                }
                return rs('resolved');
            } catch(err) {
                this.logger.warn(`[folder::commitBzIniFiles] failed to update ini files, ${err}.`);
                return rj(err);
            }

        })
    }

    // BZ-18310, cluster support for file distribution
    async addCustomFiles2DB(files) {
        this.logger.info(`[folder::addCustomFiles2DB] start`); 
        if (0 === files.length) {
            return {stauts: true};
        }
        const dir = path.join(this.configSvc.bzw2hDir, 'custom');
        const batchTxnDataDist = [];
        for (const file of files) {
            const filePath = path.join(dir, file);
            if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;
            const fsi = await bzdb.getFileSyncInfo(filePath, true);
            batchTxnDataDist.push({dataEntityName: 'w2hFileDists', action:'UPDATEORINSERT', value: fsi})
        }
        const res = await bzdb.batchTxn(batchTxnDataDist);
        if (!res.status) {
            this.logger.info(`[folder::addCustomFiles2DB], ==FAIL== ${res.message}`);
        }
        this.logger.info(`[folder::addCustomFiles2DB] end`);
        return res;
    }

    async commitDistribution(files) {
        this.logger.info(`[folder::commitDistribution] start`);  
        return new Promise((rs, rj) => {
            const dir = path.join(this.configSvc.bzw2hDir, 'custom');
            if(!fs.existsSync(dir))
                fs.mkdirSync(dir);

            //write new default.dst
            const dstFile = path.join(this.dir, 'default.dst');
            fs.writeFileSync(dstFile, this.newDistFileData, 'utf8');

            //copy files to global custom directory and populate group dist selection
            let count = 0;
            const union = files.concat(this.customFilesInOthers);
            if (!union.length) {
                this.logger.info(`[folder::commitDistribution] no dist data in group ${this.name}`);
                return rs('resolved');                
            }
            this.logger.info(`[folder::commitDistribution] start to copy files to folder '${dir}'`);
            const distFiles = [];  // BZ-18310, cluster support for file distribution
            union.forEach(file => {
                this.logger.debug(`[folder::commitDistribution] copying file '${file}'`);                
                if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
                    count = count + 1; // BZ-19884
                    return; // BZ-19884, skip folders
                }
                const filename = path.win32.basename(file);
                distFiles.push(filename);  // BZ-18310, cluster support for file distribution
                fs.copyFile(file, path.join(dir, filename), async (err) => {
                    count = count + 1;
                    if (err) {
                        this.logger.severe(`[folder::commitDistribution] failed to copy file '${file}'`);
                        this.setLastError(err);
                        return rj(err);
                    }
                                   
                    if(count === union.length) { // BZ-19884
                        this.oldDistData = await this.configSvc.getDistFilesByGid(this.groupId);
                        const data = {
                            gid: this.groupId,
                            files: {
                                shared: this.distFilesInShared,
                                configs: [],
                                custom: this.distFiles
                            },
                            features: this.features
                        }
                        this.logger.info(`[folder::commitDistribution] dist setting for group '${this.name}':\n${JSON.stringify(data, null, 2)}`);  
                        const result = await this.configSvc.setDistFiles4Group(data);
                        if (result.status != true) {
                            this.logger.severe(`[folder::commitDistribution] failed to update dist setting for group '${this.name}'`);   
                            return rj('failed to commit the dist json');
                        }
                        // BZ-18310, cluster support for file distribution
                        const rtn = await this.addCustomFiles2DB(distFiles);
                        if (!rtn.status) {
                            this.logger.severe(`[folder::commitDistribution] failed to add custom files to DB '${this.name}'`);   
                            return rj('failed to add custom files to DB');
                        }
                        this.logger.info(`[folder::commitDistribution] complete for group '${this.name}'`);   
                        return rs('resolved');        
                    }        
                });
            });
        });
    }

    async rollbackDistribution(files) {
        this.logger.info('[folder::rollbackDistribution] start');
        try {
            files.forEach(file => {
                const filename = path.win32.basename(file);
                const dir = path.join(this.dir, 'custom', filename);
                if(fs.existsSync(dir))
                    fs.unlinkSync(dir);
            })

            await this.configSvc.deleteDistFilesByGid(this.groupId);
            const result = await this.configSvc.setDistFiles4Group(this.oldDistData);
            if(result.status != true)
                this.setLastError('Failed to rollback the dist json');
            else {
                this.logger.info(`[folder::rollbackDistribution] rollback data for group ${this.name}`);
            } 
        } catch (err) {
            this.setLastError(err);
        }
    }

    /************************************
    * COMMIT AS FEW AS POSSIBLE IF FAIL *
    ************************************/
    async commit(importSiteSvc) {
        this.configSvc = importSiteSvc.configSvc;
        return this.createOrUpdateGroup().then( () => {
            return this.commitDistribution(importSiteSvc.customFiles); })
            .then( ()=>{
                return this.commitBzIniFiles();
            })
            .then( ()=>{
                //TO DO...
            })
            .catch(err => {
                throw err;
            })
    }

    /***************************************
    * ROLLBACK AS MANY AS POSSIBLE IF FAIL *
    ****************************************/
    async rollBack(importSiteSvc) {
        this.configSvc = importSiteSvc.configSvc;    
        //TO DO...

        await this.rollbackDistribution(importSiteSvc.customFiles);
        await this.deleteGroup();
    }   

    setLastError(message) {
        if(message.message == undefined)
            this.error = new Error(message);
        else
            this.error = message;
        this.logError(this.error);
    }
}

async function handleDefaultIni(LaunchFolder, data) {
    return LaunchFolder.handleDefaultIni(data);
}

async function handleGlobalIni(LaunchFolder, data) {
    return LaunchFolder.handleGlobalIni(data);
}

async function handlePageJson(LaunchFolder, data) {
    await LaunchFolder.handlePageJson(data);
}

async function handleLaunchXHtm(LaunchFolder, data) {
    await LaunchFolder.handleLaunchXHtm(data);
}

async function handleLaunchJWSHtm(LaunchFolder, data) {
    await LaunchFolder.handleLaunchJWSHtm(data);
}

async function handleLaunchBWSHtm(LaunchFolder, data) {
    await LaunchFolder.handleLaunchBWSHtm(data);
}

async function handleBzlp(LaunchFolder, data) {
    await LaunchFolder.handleBzlp(data);
}

async function handleJnlp(LaunchFolder, data) {
    await LaunchFolder.handleJnlp(data);
}

async function handleDesktopIni(LaunchFolder, data) {
    await LaunchFolder.handleDesktopIni(data);
}

async function handleDefaultDST(LaunchFolder, data) {
    await LaunchFolder.handleDefaultDST(data);
}

async function handlePageProp(LaunchFolder, data) {
    await LaunchFolder.handlePageProp(data);
}

module.exports = LaunchFolder;
