'use strict';

/**
 * Name:      session-settings-sevice.js
 * Desc:      Provide api to return the sessionMode related configurations
 * Copyright: © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */

// const Promise = require('bluebird');
const fs = require('fs-extra');
const BASE_PATH = '/ZLUX/pluginStorage/com.rs.bzadm';
const BZA_DEFAULT_PATH = '/ZLUX/pluginStorage/com.rs.bzadm/defaults';
const SESSIONSETTINGS_PATH = '/ZLUX/pluginStorage/com.rs.bzadm/sessionSettings';
const HOTSPOTS = '/hotspots';
const LAUNCHPAD = '/launchpad';
const KEYBOARDMAPPING = '/keyboardmapping';
const PREFERENCES = '/preference';
// const InternalDataSteward = require('../../../bzshared/lib/services/internal-data-steward.service');
// const DataEntities = require('./data-entities.config');
// const BZW_SYNCMODE = '/ZLUX/plugins/com.rs.bzshared/services/syncMode';
const Utiles = require('./utils.service');
const bzdb = require('../../../bzshared/lib/services/bzdb.service');
const userSrc = require('../../../bzshared/lib/apis/user-resource/user-resource-service');


class SessionSettings {

	constructor(context) {
		this.context = context;
		this.logger = context.logger;
		this.instanceDir = this.context.plugin.server.config.user.instanceDir;
		this.productPath = this.context.plugin.server.config.user.productDir;
		// this.dataSteward = InternalDataSteward.initWithContext(context);
		// this.dataSteward.manage(DataEntities.hotspots);
		// this.dataSteward.manage(DataEntities.launchpad);
		// this.dataSteward.manage(DataEntities.preference);
		// this.dataSteward.manage(DataEntities.keyboard);
		this.utiles = new Utiles(context);
	}

	// /**
	//  * Get session settings path
	//  */
	// getSessionSettingPath(id){
	// 	const prefsTargetPath=`${this.instanceDir}${SESSIONSETTINGS_PATH}${PREFERENCES}/P_${id}.json`;
	// 	const launchpadTargetPath=`${this.instanceDir}${SESSIONSETTINGS_PATH}${LAUNCHPAD}/L_${id}.json`;
	// 	const hotspotsTargetPath= `${this.instanceDir}${SESSIONSETTINGS_PATH}${HOTSPOTS}/H_${id}.json`;
	// 	const keyBoardTargetPath= `${this.instanceDir}${SESSIONSETTINGS_PATH}${KEYBOARDMAPPING}/K_${id}.json`;
	// 	return {
	// 		prefsTargetPath:prefsTargetPath,
	// 		launchpadTargetPath:launchpadTargetPath,
	// 		hotspotsTargetPath:hotspotsTargetPath,
	// 		keyBoardTargetPath:keyBoardTargetPath,
	// 	}
	// }

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
	
	
	// /**
	//  * Create session settings files
	//  * @param {req} req 
	//  * @param {string} id 
	//  */
	// async createSessionSettingsFile(req, id) {
	//   const value = req.body;
	// 	let pref, launchpad, hotspot;
	// 	const sessionSettingPath=this.getSessionSettingPath(id);
	// 	const defaultTemplatePath = this.getDefaultTemplatePath(value.type);
		
	// 	pref = await this.copySessionSettingsFiles(defaultTemplatePath.prefsSourcePath, sessionSettingPath.prefsTargetPath);
	// 	launchpad = await this.copySessionSettingsFiles(defaultTemplatePath.launchpadSourcePath, sessionSettingPath.launchpadTargetPath);
	// 	hotspot = await this.copySessionSettingsFiles(defaultTemplatePath.hotspotsSourcePath, sessionSettingPath.hotspotsTargetPath);
		
	// 	return Promise.all([pref, launchpad, hotspot]).then((value) => {
	// 		const status = value.every(e => e ? true : false);
	// 		if (!status) {
	// 			this.deleteSessionSettingFiles(id);
	// 		}
	// 		return Promise.resolve(status);
	// 	});
	// }


	/**
	 * Edit session setting
	 * @param {*} req 
	 * @param {*} id 
	 */
	async editSessionSettingsFile(req, id) {
		const value = req.body;
		const timestamp = Date.now();
		const prefsValue = value["configuration"]["prefs"];
		prefsValue.timestamp = timestamp;
		prefsValue.id = id;
		if(prefsValue.ind$FileTransfer)
		{
			userSrc._encryptObject(prefsValue.ind$FileTransfer,'FilePass');
		}
		const batchTxnData = [
			{dataEntityName: 'preferenceShared', action:'UPDATEORINSERT', value: prefsValue, options:{}} // userLogin or superAdmin
		]
		const launchpadsValue = value["configuration"]["launchpad"];
		if(launchpadsValue){
			launchpadsValue.timestamp = timestamp;
			launchpadsValue.id = id;
			batchTxnData.push({dataEntityName: 'launchpadShared', action:'UPDATEORINSERT', value: launchpadsValue, options:{}})
		}

		const hotspotsValue = value["configuration"]["hotspot"];
		if(hotspotsValue){
			hotspotsValue.timestamp = timestamp;
			hotspotsValue.id = id;
			batchTxnData.push({dataEntityName: 'hotspotShared', action:'UPDATEORINSERT', value: hotspotsValue, options:{}})
		}
		if (req['ssm']){
			batchTxnData.push(req['ssm'])
		}
		return await bzdb.batchTxn(batchTxnData);
	}


	// /**
	//  * Create keyboard file
	//  * @param {*} req 
	//  * @param {*} id 
	//  */
	// async createKeyboardFile(req, id) {
	// 	const value = req.body;
	// 	const defaultTemplatePath = this.getDefaultTemplatePath(value.type);
	// 	const sessionSettingPath=this.getSessionSettingPath(id);
	// 	const keyboard = await this.copySessionSettingsFiles(defaultTemplatePath.keyBoardSourcePath, sessionSettingPath.keyBoardTargetPath);
	// 	// no need to sync file any more
	// 	// const syncOptions = {
	// 	// 	id: id, 
	// 	// 	name: value["name"],
	// 	// 	type: value["type"],
	// 	// 	syncName: 'keyboard',
	// 	// 	method: 'PUT'
	// 	// }
	// 	// if (!this.context.plugin.server.config.user.bzw2hMode){
	// 	// 	await this.handleSyncFiles(req, syncOptions);
	// 	// }
	// 	return Promise.all([keyboard]).then((value) => {
	// 		const status = value.every(e => e ? true : false);
	// 		if (!status) {
	// 			this.deleteKeyBoardFiles(id);
	// 		}
	// 		return Promise.resolve(status);
	// 	});
	// }
	// /**
	//  * Copy Default file 
	//  * @param {*} source  source path
	//  * @param {*} target  target path
	//  */

	// async copySessionSettingsFiles(source, target) {
	// 	await fs.copyFile(source, target, (err) => {
	// 		if (err) {
	// 			return false;
	// 		} else {
	// 			const ts = Date.now();
	// 			fs.utimesSync(target, ts / 1000, ts / 1000);
	// 			return true;
	// 		}
	// 	});
	// 	return true
	// }

	// /**
	//  * Write session settings 
	//  * @param {string} entity dataStew entity
	//  * @param {string} path  file path
	//  * @param {object} value  file data
	//  * @deprecated
	//  */
	// async writeSessionSettingsFiles(entity, path, value) {
	// 	const options = {
	// 		data: value,
	// 		path: path
	// 	}
	// 	return  await this.dataSteward.addData(entity, options).then((rep) => {
	// 		return true;
	// 	}, (err) => {
	// 		return false;
	// 	});
	// }


	// async writeSettingsFile(path, value) {
	// 	await fs.writeFile(path, JSON.stringify(value), (err) => {
	// 		if (err) {
	// 			return Promise.resolve(false);
	// 		}
	// 	});
	// 	return Promise.resolve(true);
	// }

	/**
	 * Delete session settings from db
	 * @param {string} id 
	 */
	async deleteSessionSetting(id) {
		try {
			const batchTxnData = [
				{dataEntityName: 'preferenceShared', action: 'DELETE', value: {}, options:{filter: {id}}},
				{dataEntityName: 'hotspotShared', action: 'DELETE', value: {}, options:{filter: {id}}},
				{dataEntityName: 'launchpadShared', action: 'DELETE', value: {}, options:{filter: {id}}},
				{dataEntityName: 'sessionSettingMapping', action: 'DELETE', value: {}, options:{filter: {id}}}
			]
			return await bzdb.batchTxn(batchTxnData)
		} catch(e) {
			return e;
		}
	}


	// /**
	//  * Delete session settings files
	//  * @param {string} id 
	//  */
	// deleteSessionSettingFiles(id) {
	// 	this.removeIdFromMappingFile(id,"sessionSetting");
	// 	const sessionSettingPath=this.getSessionSettingPath(id);
	// 	if (fs.existsSync(sessionSettingPath.prefsTargetPath) && fs.existsSync(sessionSettingPath.hotspotsTargetPath) && fs.existsSync(sessionSettingPath.launchpadTargetPath)) {
	// 		fs.unlinkSync(sessionSettingPath.prefsTargetPath);
	// 		fs.unlinkSync(sessionSettingPath.hotspotsTargetPath);
	// 		fs.unlinkSync(sessionSettingPath.launchpadTargetPath);
	// 	}
	// }

	// deleteSessionSettingFilesSync(id,req){
	// 	return this.dataSteward.syncData(req, {
	// 		url: `${this.utiles.getURL(req, this.context)}${BZW_SYNCMODE}/sessionSettingsConfigs/${id}`,
	// 		method: `DELETE`,
	// 		headers: {
	// 			"content-type": "application/json"
	// 		}
	// 	})
	// }
	
	// /**
	//  * Delete keyboard file 
	//  * @param {string} id 
	//  */
	// deleteKeyBoardFiles(id) {
	// 	this.removeIdFromMappingFile(id,"keyboard");
	// 	const sessionSettingPath=this.getSessionSettingPath(id);
	// 	if (fs.existsSync(sessionSettingPath.keyBoardTargetPath)) {
	// 		fs.unlinkSync(sessionSettingPath.keyBoardTargetPath);
	// 	}
	// }


	// /**
	//  * Remove id in mapping file
	//  * @param {string} id 
	//  * @param {string} type 
	//  */
	
	// async removeIdFromMappingFile(id,type) {
	// 	const dbType = type == "keyboard" ? 'keyboardMapping': 'sessionSettingMapping';

	// 	await bzdb.delete(dbType, {id})
	// }

	/**
	 * Get current need to edit session setting  id 
	 * @param {string} name 
	 * @param {string} getDefault: used to get default SessionSettingsConfigs json files
	 */
	async getCurrentSessionSettingsConfigs(name, getDefault) {
		//const mappingPath = `${this.instanceDir}${SESSIONSETTINGS_PATH}/sessionSettingMapping.json`;
		if(getDefault != null) {
			return await this.getDefaultSessionConfigs(getDefault);
		}

		//if (fs.existsSync(mappingPath)) {
			const mappings = await bzdb.select('sessionSettingMapping')
		
			let id, type;
			if (mappings.rowCount > 0) {
				let sessionConfigs = mappings.data || [];
				let values = sessionConfigs.filter(value => value.name === name );
				if (values && values.length) {
					values.map((e) => {
						id = e.id;
						type = e.type
					});
					return await this.getCurrentConfigs(id, type);
				} 
			}	
		//} 
	}

	/**
	 * Get current need to edit session settings file contents
	 * @param {string} id 
	 * @param {string} type 
	 */
	async getCurrentConfigs(id, type) {
		// const prefsTargetPath = `${this.instanceDir}${SESSIONSETTINGS_PATH}${PREFERENCES}/P_${id}.json`;
		// const launchpadTargetPath = `${this.instanceDir}${SESSIONSETTINGS_PATH}${LAUNCHPAD}/L_${id}.json`;
		// const hotspotsTargetPath = `${this.instanceDir}${SESSIONSETTINGS_PATH}${HOTSPOTS}/H_${id}.json`;
		let configData = {
			type: type,
			id: id
		}
		const prefsData = await bzdb.select('preferenceShared', {id});
		if(prefsData.rowCount > 0){
			configData.pref= prefsData.data[0];
			// if (!configData.pref.timestamp) {  // @Shaogeng, check timestamp when upgrade preference data from old version
			// 	const stat = fs.statSync(prefsTargetPath);
			// 	configData.pref.timestamp = Date.parse(stat.mtime);
			// }
		}

		const hotspotsData = await bzdb.select('hotspotShared', {id});
		if(hotspotsData.rowCount > 0){
			configData.hotspots= hotspotsData.data[0]
			// if (!configData.hotspots.timestamp) {
			// 	const stat = fs.statSync(hotspotsTargetPath);
			// 	configData.hotspots.timestamp = Date.parse(stat.mtime);;
			// }
		}

		const launchpadsData = await bzdb.select('launchpadShared', {id});
		if(launchpadsData.rowCount > 0){
			configData.launchpad= launchpadsData.data[0]
			// if (!configData.launchpad.timestamp) {
			// 	const stat = fs.statSync(launchpadTargetPath);
			// 	configData.launchpad.timestamp = Date.parse(stat.mtime);;
			// }
		}

		return configData;


		// if (fs.existsSync(prefsTargetPath) && fs.existsSync(launchpadTargetPath) && fs.existsSync(hotspotsTargetPath)) {
		// 	const prefsData = fs.readFileSync(prefsTargetPath, 'utf8');
		// 	const hotspotsData = fs.readFileSync(hotspotsTargetPath, 'utf8');
		// 	const launchpadsData = fs.readFileSync(launchpadTargetPath, 'utf8');
		// 	if (prefsData !== undefined && hotspotsData !== undefined && launchpadsData !== undefined) {
		// 		const configData = {
		// 			type: type,
		// 			id: id,
		// 			pref: JSON.parse(prefsData),
		// 			launchpad: JSON.parse(launchpadsData),
		// 			hotspots: JSON.parse(hotspotsData)
		// 		}
		// 		if (!configData.pref.timestamp) {
		// 			const stat = fs.statSync(prefsTargetPath);
		// 			configData.pref.timestamp = Date.parse(stat.mtime);
		// 		}
		// 		if (!configData.launchpad.timestamp) {
		// 			const stat = fs.statSync(launchpadTargetPath);
		// 			configData.launchpad.timestamp = Date.parse(stat.mtime);;
		// 		}
		// 		if (!configData.hotspots.timestamp) {
		// 			const stat = fs.statSync(hotspotsTargetPath);
		// 			configData.hotspots.timestamp = Date.parse(stat.mtime);;
		// 		}
		// 		return configData;
		// 	}
		// 	return "";
		
		// }
	}

	/**
	 * Get Default session settings template when add
	 * @param {*} res 
	 * @param {string} type 
	 */
	async getDefaultSessionConfigs(type) {
		const pref = await this.getDefaultPreference(type);
		let launchpad,hotspots,keyboardmapping 
		if(type!=='3270p' && type!=='5250p'){
			launchpad = await this.getDefaultLaunchpad(type);
			hotspots = await this.getDefaultHotspots(type);
			keyboardmapping = await this.getDefaultKeyboardmapping(type);
		}

		if (this.context.plugin.server.config.user.bzw2hMode) {
			if (type === 'VT' && pref['language']) {
				pref['language']['langSelection'] = 'CurrentSystemLocale'; // BZ-20827
			}
		}
		const data = {
			pref: pref,
			launchpad: launchpad,
			hotspots: hotspots,
			keyboardmapping: keyboardmapping
		}

		return data;
	}

	/**
	 * Get default preference
	 * @param {string} type 
	 */
	getDefaultPreference(type){
		const resp = fs.readFileSync(`${this.productPath}${BZA_DEFAULT_PATH}/default${type}SessionPreferences.json`, 'utf8');
		if (resp) {
			let obj = (new Function("return " + resp))();
			return obj;
		}
	}

	/**
	 * Get default launchpad
	 * @param {string} type 
	 */
	getDefaultLaunchpad(type) {
		const resp = fs.readFileSync(`${this.productPath}${BZA_DEFAULT_PATH}/default${type}LaunchpadItems.json`, 'utf8');
		if (resp) {
			let obj = (new Function("return " + resp))();
			return obj;
		}
	}

	/**
	 * Get default hotspots
	 * @param {string} type 
	 */
	getDefaultHotspots(type) {
		const resp = fs.readFileSync(`${this.productPath}${BZA_DEFAULT_PATH}/default${type}HotspotDefs.json`, 'utf8');
		if (resp) {
			let obj = (new Function("return " + resp))();
			return obj;
		}
	}

	/**
	 * Get default keyboard mapping
	 * @param {string} type 
	 */
	getDefaultKeyboardmapping(type) {
		const resp = fs.readFileSync(`${this.productPath}${BZA_DEFAULT_PATH}/default${type}KeyboardMapping.json`, 'utf8');
		if (resp) {
			let obj = (new Function("return " + resp))();
			return obj;
		}
	}


	// /**
	//  * Sync session setting file to bzw
	//  * @param {*} req 
	//  * @param {object} options 
	//  */
	// async handleSyncFiles(req, options) {
	// 	const value = {
	// 		name: options.name,
	// 		type: options.type,
	// 		configuration: options.configuration?options.configuration:{},
	// 		id: options.id
	// 	}
	// 	const data = Object.assign(value);
	// 	this.dataSteward.syncData(req, {
	// 		url: `${this.utiles.getURL(req, this.context)}${BZW_SYNCMODE}/${options.syncName}`,
	// 		method: `${options.method}`,
	// 		headers: {
	// 			"content-type": "application/json"
	// 		},
	// 		body: data
	// 	})

		// return new Promise(function (resolve, reject) {
		// 	request({
		// 		url: `${hostname}/ZLUX/plugins/com.rs.bzw/services/syncMode/sessionSettingsConfigs`,
		// 		method: 'PUT',
		// 		headers: {
		// 			"content-type": "application/json"
		// 		},
		// 		body: JSON.stringify(data)
		// 	}, function (error, response, body) {
		// 		if (response && response.statusCode === 200) {
		// 			return resolve(true);
		// 		} else if (error) {
		// 			return reject(false);
		// 		}
		// 	});
		// })
	// }


	// /**
	// 		 * create path if no folder
	// 		 */
	createSessionSettingsPath() {
		this.createDir(`${this.instanceDir}${BASE_PATH}`);
		this.createDir(`${this.instanceDir}${SESSIONSETTINGS_PATH}`);
		this.createDir(`${this.instanceDir}${SESSIONSETTINGS_PATH}${HOTSPOTS}`);
		this.createDir(`${this.instanceDir}${SESSIONSETTINGS_PATH}${LAUNCHPAD}`);
		this.createDir(`${this.instanceDir}${SESSIONSETTINGS_PATH}${KEYBOARDMAPPING}`);
		this.createDir(`${this.instanceDir}${SESSIONSETTINGS_PATH}${PREFERENCES}`);
	}

	/**
	 * Create path
	 * @param {string} dir 
	 */
	createDir(dir) {
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir);
		}
	}

	// /**
	//  * Get URL
	//  * @param {*} req 
	//  */

	// getURL(req) {
  //   return `${req.protocol}://${req.headers.host}`;
  // }

}
module.exports = {
	init(context) {
		return new SessionSettings(context);
	}

};