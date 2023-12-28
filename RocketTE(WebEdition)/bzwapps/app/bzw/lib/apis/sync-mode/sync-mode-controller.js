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
const Promise = require('bluebird');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');
const ClusterRequestService = require('../../../../bzshared/lib/services/cluster-request.service');
const Utils = require('../../../../bzshared/lib/services/utils.service');
const Security = require('../../../../bzshared/lib/services/security.service');

const GROUP_PATH = '/groups';
const BZW_PATH = '/ZLUX/pluginStorage/com.rs.bzw';
const HOTSPOTS = '/hotspots';
const LAUNCHPAD = '/launchpad';
const KEYBOARDMAPPING = '/keyboardmapping';
const PREFERENCES = '/preference';
const BZA_DEFAULT_PATH = '/ZLUX/pluginStorage/com.rs.bzadm/defaults';

class SyncModeController {
    constructor(context){
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        this.basePath = context.plugin.server.config.user.instanceDir;
        this.productPath = this.context.plugin.server.config.user.productDir;
        this.requestService = new ClusterRequestService(this.context);
        this.utils = Utils.init(context);
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
	
	setupSyncModenRouter() {
		const logger = this.logger;
        const router = this.router;
        // const context = this.context;
        logger.info('Setup session mode router');

        router.use(bodyParser.json({type:'application/json'}));

        router.put('/put', (req,res) => {
            let fileName="";
            let dir = req.body.path === 'group' ? GROUP_PATH : req.body.path;
            const basePath = this.context.plugin.server.config.user.instanceDir;
            const subPath ="/ZLUX/pluginStorage/com.rs.bzw/configurations";

            if (req.body.path === 'group'){
                fileName=`${this.basePath + dir}/group_${req.body.name}.json`;
            } else if(req.body.path === 'datasource'){
                let name="/dataSourceSetting.json";

                dir = path.resolve(basePath + subPath);
                fileName=path.resolve(basePath + subPath +name);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir);
                }
            } else if (req.body.path === 'seversetting') {
                let name = "/severSetting.json";
                dir = path.resolve(basePath + subPath);
                fileName = path.resolve(basePath + subPath + name);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir);
                }
            }
            
            try{
                fileName = Security.sanitizePath(fileName); // Ensure security
            }catch(e){
                res.status(500).send('Illegal path');
                return;
            }
			fs.writeFile(fileName, JSON.stringify(req.body.data), { mode: 0o644 }, (err) => {
                if (err) {
                    this.logger.severe(`Sync update file failed: ${JSON.stringify(err)}`);
                    throw err;
                }
                // console.log('Saved!');
                res.setHeader("Content-Type", "text/typescript");
                this.logger.info(`Sync update file ${fileName} success`);
                res.status(200).json({'text': 'Saved'});
               
              });
        });
        
        router.delete('/delete', (req, res) => {
            const dir = req.body.path === 'group' ? GROUP_PATH : req.body.path;
            let file = `${this.basePath + dir}/group_${req.body.name}.json`;
            
            try{
                file = Security.sanitizePath(file); // Ensure security
            }catch(e){
                res.status(500).send('Illegal path');
                return;
            }
            fs.unlink(file, (err) => {
                if (err) {
                    this.logger.severe(`Sync remove file failed: ${JSON.stringify(err)}`);
                    throw err;
                }
                res.setHeader("Content-Type", "text/typescript");
                this.logger.info(`Sync delete file ${file} success`);
                res.status(200).json({'text': 'Deleted'});
            });
        });
        
        router.put('/sessionSettingsConfigs', async (req, res) => {
            // sync session settings configuration 
            this.createPath();
            const value = req.body;
            // const createResult = await this.createSessionSettingFiles(value);
            const createResult = await this.createSessionSettingResource(value, req);
            if (createResult) {
                this.logger.info(`Sync create session settings successful.`);
                res.status(200).json({status: createResult});
              }else {
                this.logger.warn(`Sync create session settings with empty data.`);
                res.status(200).json({status: createResult});
              }
        });

        router.put('/keyboard', async (req, res) => {
            // sync session settings configuration 
            this.createPath();
            const value = req.body;
            const createResult = await this.createKeyboardResource(value, req);  // TBD, error handling
            if (createResult) {
                this.logger.info(`Sync create keyboard successful.`);
                res.status(200).json({status: createResult});
              }else {
                this.logger.warn(`Sync create keyboard with empty data.`);
                res.status(200).json({status: createResult});
              }
        });

        router.put('/editsessionSettings', async (req, res) => {
            // sync session settings configuration 
            this.createPath();
            const value = req.body
            const createResult = await this.editSessionSetting(value, req);
            if (createResult) {
                this.logger.info(`Sync update session settings successful.`);
                res.status(200).json({status: createResult});
              }else {
                this.logger.warn(`Sync update session settings with empty data.`);
                res.status(200).json({status: createResult});
              }
        });
        router.delete('/sessionSettingsConfigs/:id', async (req, res) => {
            // sync session settings configuration 
            const id = req.params.id;
            if(!!id){
                this.deleteSessionSetting(id, req);
                this.logger.info(`Sync delete keyboard successful.`);
                res.status(200).json({status: "success"});
            }else{
                this.logger.severe(`Sync delete session settings failed: Cannot find session settings "${id}".`);
                res.status(400).json({status: "not found"});
            }
        });

        router.put('/keyboardConfigs', (req, res) => {
            this.createDir(`${this.basePath}${BZW_PATH}`);
            this.createDir(`${this.basePath}${BZW_PATH}/${KEYBOARDMAPPING}`);
            let data = req.body.data;
            const targetName = this.getSessionSettingName(data.id);
            this.overrideSessionSettingsResource(data, targetName.keyBoardName, 'keyboardMappingShared', req).then(result => {
                if (result.status) {
                    this.logger.info(`Sync update keyboard configurations successful.`);
                    res.status(200).json({status: true, 'message': 'Sync update keyboard configurations successful'});
                } else {
                    this.logger.severe(`Sync update keyboard configurations failed.`);
                    res.status(500).json({status: true, 'message': 'Sync update keyboard configurations failed'});
                }
            }, err => {
                this.logger.severe(`Sync update keyboard configurations failed: ${err.message || 'Unknown error occurs'}`);
                res.status(500).json(err);
            });
        });

        router.delete('/keyboardConfigs/:id', async (req, res) => {
            // sync session settings configuration 
            const id = req.params.id;
            if(!!id){
                this.deleteKeyboard(id, req);
                this.logger.info(`Sync delete keyboard successful.`);
                res.status(200).json({status: "success"});
            }else{
                this.logger.severe(`Sync delete keyboard failed: Cannot find keyboard "${id}".`);
                res.status(400).json({status: "not found"});
            }
        });
    }
    
    createPath() {
        this.createDir(`${this.basePath}${BZW_PATH}`);
		this.createDir(`${this.basePath}${BZW_PATH}${HOTSPOTS}`);
		this.createDir(`${this.basePath}${BZW_PATH}${LAUNCHPAD}`);
		this.createDir(`${this.basePath}${BZW_PATH}${KEYBOARDMAPPING}`);
		this.createDir(`${this.basePath}${BZW_PATH}${PREFERENCES}`);
    }

    createDir(dir) {
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir);
		}
    }
    getSessionSettingPath(id){
		return {
			prefsTargetPath: this.getConfigPath('preference', id),
			launchpadTargetPath: this.getConfigPath('launchpad', id),
			hotspotsTargetPath:this.getConfigPath('hotspots', id),
			keyBoardTargetPath:this.getConfigPath('keyboardmapping', id)
		}
    }

    
    getSessionSettingName(id){
		return {
            prefsName: `${this.getIdType('preference')}_${id}.json`,
			launchpadName: `${this.getIdType('launchpad')}_${id}.json`,
			hotspotsName:`${this.getIdType('hotspots')}_${id}.json`,
			keyBoardName:`${this.getIdType('keyboardmapping')}_${id}.json`
		}
    }

    /**
	 * Get default session settings path
	 */
	getDefaultTemplatePath(type){
		const prefsSourcePath=`${this.productPath}${BZA_DEFAULT_PATH}/default${type}SessionPreferences.json`;
		const launchpadSourcePath=`${this.productPath}${BZA_DEFAULT_PATH}/default${type}LaunchpadItems.json`;
		const hotspotsSourcePath= `${this.productPath}${BZA_DEFAULT_PATH}/default${type}HotspotDefs.json`;
		const keyBoardSourcePath= `${this.productPath}${BZA_DEFAULT_PATH}/default${type}KeyboardMapping.json`;
		return {
			prefsSourcePath: prefsSourcePath,
			launchpadSourcePath: launchpadSourcePath,
			hotspotsSourcePath: hotspotsSourcePath,
			keyBoardSourcePath: keyBoardSourcePath,
		}
    }

    
    /**
     * create session settings config
     * @param {string} value 
     */
    async createSessionSettingResource(value, req) {
        return new Promise( (resolve, reject) => {
            const targetName = this.getSessionSettingName(value.id);
            const defaultTemplatePath = this.getDefaultTemplatePath(value.type);
            const pref = this.createSessionSettingsResource(defaultTemplatePath.prefsSourcePath,targetName.prefsName, 'preferenceShared', req);
            const launchpad = this.createSessionSettingsResource(defaultTemplatePath.launchpadSourcePath, targetName.launchpadName, 'launchpadShared', req);
            const hotspot = this.createSessionSettingsResource(defaultTemplatePath.hotspotsSourcePath, targetName.hotspotsName, 'hotspotShared', req);
            Promise.all([pref, launchpad, hotspot]).then((value) => {
                const status = value.every(e => e ? true: false);
                if (status) {
                    return resolve({status: true});
                }else {
                    // this.deleteSessionSettingFiles(value.id);
                    return reject({status: false});
                }
            }, err => {
                return reject({status: false, message: err.stack? err.stack : err.message});
            });
        });
    }
    
    /**
     * create session settings config
     * @param {string} value 
     */
    async createSessionSettingFiles(value) {
        
        const targetPath = this.getSessionSettingPath(value.id);
        const defaultTemplatePath = this.getDefaultTemplatePath(value.type);
        const pref = await this.copySessionSettingsFiles(defaultTemplatePath.prefsSourcePath, targetPath.prefsTargetPath);
        const launchpad = await this.copySessionSettingsFiles(defaultTemplatePath.launchpadSourcePath, targetPath.launchpadTargetPath);
        const hotspot = await this.copySessionSettingsFiles(defaultTemplatePath.hotspotsSourcePath, targetPath.hotspotsTargetPath);
        return Promise.all([pref, launchpad, hotspot]).then((value) => {
            const status = value.every(e => e ? true: false);
            if (status) {
                return Promise.resolve(true);
            }else {
                this.deleteSessionSettingFiles(value.id);
                return Promise.reject(false);
            }

			
		});
    }

    async editSessionSetting(value, req) {
        return new Promise( (resolve, reject) => {
            let pref, launchpad, hotspot;
            // const targetPath = this.getSessionSettingPath(value.id);
            const targetName = this.getSessionSettingName(value.id);
            const prefsValue = value["configuration"]["prefs"];
            const launchpadsValue = value["configuration"]["launchpad"];
            const hotspotsValue = value["configuration"]["hotspot"];
    
            pref = this.overrideSessionSettingsResource(prefsValue, targetName.prefsName, 'preferenceShared', req);
            launchpad = this.overrideSessionSettingsResource(launchpadsValue, targetName.launchpadName, 'launchpadShared', req);
            hotspot = this.overrideSessionSettingsResource(hotspotsValue, targetName.hotspotsName, 'hotspotShared', req);
    
            Promise.all([pref, launchpad, hotspot]).then(value => {
                const status = value.every(e => e ? true: false);
                if (status) {
                    return resolve({status: true});
                }else {
                    // this.deleteSessionSettingFiles(path);
                    return reject({status: false});
                }
            }, err => {
                return reject({status: false, message: err.stack? err.stack: err.message});
            });
        });
    }

    async createKeyboardResource(value, req) {
        return new Promise( (resolve, reject) => {  
            const defaultTemplatePath = this.getDefaultTemplatePath(value.type);
            const targetName = this.getSessionSettingName(value.id);
            const keyboard = this.createSessionSettingsResource(defaultTemplatePath.keyBoardSourcePath,targetName.keyBoardName, 'keyboardMappingShared', req);
            
            Promise.all([keyboard]).then((value) => {
                const status = value.every(e => e ? true : false);
                if (!status) {
                    // this.deleteKeyBoardFiles(id);
                    return reject({status: false});
                }
                return resolve(status);
            }, err => {
                return reject({status: false, message: err.stack? err.stack : err.message});
            });
        });
    }
    
    /**
	 * Copy Default file 
	 * @param {*} source  source path
	 * @param {*} target  target path
	 */

	async copySessionSettingsFiles(source, target) {
		await fs.copyFile(source, target, (err) => {
			if(err) {
				return Promise.resolve(false);
			}else {
				return Promise.resolve(true);
			}
		});
		return Promise.resolve(true);
    }

    /**
	 * Create shared user resources 
	 * @param {*} source  source path
	 * @param {*} target  target name
	 */

	createSessionSettingsResource(source, target, resType, req) {
        return new Promise((resolve, reject) => {
            this.utils.readFilePromise(source).then( data => {
                const resourcePath = '/ZLUX/plugins/com.rs.bzshared/services/userResource/' + resType + '?name=' + target;
                req.headers['username'] = 'superadmin';
                this.requestService.requestUserResource(req, resourcePath, data).then( result => {
                    resolve({status: true});
                }, err => {
                    reject({status: false, message: err.stack});
                })
            }, err => {
                reject({status: false, message: err.stack});
            })
        });
    }


    /**
	 * Create shared user resources 
	 * @param {*} source  source path
	 * @param {*} target  target name
	 */

	overrideSessionSettingsResource(data, target, resType, req) {
        return new Promise((resolve, reject) => {
            const resourcePath = '/ZLUX/plugins/com.rs.bzshared/services/userResource/' + resType + '?name=' + target;
            req.headers['username'] = 'superadmin';
            this.requestService.requestUserResource(req, resourcePath, data).then( result => {
                resolve({status: true});
            }, err => {
                reject({status: false, message: err.stack});
            })
        });
    }
    
    /**
	 * Create shared user resources 
	 * @param {*} source  source path
	 * @param {*} target  target name
	 */

	deleteSessionSettingsResource(target, resType, req) {
        return new Promise((resolve, reject) => {
            const resourcePath = '/ZLUX/plugins/com.rs.bzshared/services/userResource/' + resType + '?name=' + target;
            req.headers['username'] = 'superadmin';
            this.requestService.requestUserResource(req, resourcePath, null).then( result => {
                resolve({status: true});
            }, err => {
                reject({status: false, message: err.stack});
            })
        });
    }
    
    /**
     * Create session settings
     * @param {*} path 
     * @param {*} value 
     */

	async writeSessionSettingsFile(path, value) {
		await fs.writeFile(path, JSON.stringify(value), (err) => {
			if (err) {
				return Promise.resolve(false);
			}else {
				return Promise.resolve(true);
			}
		});
		// console.log('Edit session settings file successful');
		return Promise.resolve(true);
	}
    
    deleteSessionSettingFiles(id) {
        const sessionSettingPath=this.getSessionSettingPath(id);
        if (fs.existsSync(sessionSettingPath.prefsTargetPath) && fs.existsSync(sessionSettingPath.hotspotsTargetPath) && fs.existsSync(sessionSettingPath.launchpadTargetPath)) {
            fs.unlinkSync(sessionSettingPath.prefsTargetPath);
            fs.unlinkSync(sessionSettingPath.hotspotsTargetPath);
            fs.unlinkSync(sessionSettingPath.launchpadTargetPath);
        }
       
    }

    deleteSessionSetting(id, req) {
        return new Promise( (resolve, reject) => {
            const targetName = this.getSessionSettingName(id);
            const delPref = this.deleteSessionSettingsResource(targetName.prefsName, 'preferenceShared', req);
            const delLaunchp = this.deleteSessionSettingsResource(targetName.launchpadName, 'launchpadShared', req);
            const delHotspot = this.deleteSessionSettingsResource(targetName.hotspotsName, 'hotspotShared', req);
            Promise.all([delPref, delLaunchp, delHotspot]).then((value) => {
                const status = value.every(e => e ? true: false);
                if (status) {
                    return resolve(true);
                }else {
                    // this.deleteSessionSettingFiles(value.id);
                    return reject(false);
                }
            }, err => {
                return reject({status: false, message: err.stack? err.stack : err.message});
            });
        });
    }

    deleteKeyboard(id, req) {
        return new Promise( (resolve, reject) => {
            const targetName = this.getSessionSettingName(id);
            const delKM = this.deleteSessionSettingsResource(targetName.keyBoardName, 'keyboardMappingShared', req);
            Promise.all([delKM]).then((value) => {
                const status = value.every(e => e ? true: false);
                if (status) {
                    return resolve(true);
                }else {
                    // this.deleteSessionSettingFiles(value.id);
                    return reject(false);
                }
            }, err => {
                return reject({status: false, message: err.stack? err.stack : err.message});
            });
        });
    }

    deleteKeyboardFiles(id) {
        const sessionSettingPath=this.getSessionSettingPath(id);
        if (fs.existsSync(sessionSettingPath.keyBoardTargetPath)){
            fs.unlinkSync(sessionSettingPath.keyBoardTargetPath);
        }
    }

    getIdType(configType) {
        let idType = '';
        switch (configType) {
            case 'preference':
              idType = 'P';
              break;
            case 'launchpad':
            idType = 'L';
              break;
            case 'hotspots':
            idType = 'H';
              break;
            case 'keyboardmapping': 
            idType = 'K';
              break;
            default:
              idType = '';
        }
        return idType;
    }

    getConfigPath(configType,  id) {
        return `${this.basePath}${BZW_PATH}/${configType}/${this.getIdType(configType)}_${id}.json`;
    }

}


exports.syncModeRouter = (context) => {
    return new Promise (function (resolve,reject) {
      let controller = new SyncModeController(context);
      controller.setupSyncModenRouter();
      resolve(controller.getRouter()); 
    });
  };