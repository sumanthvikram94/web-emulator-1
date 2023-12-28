'use strict';

/**
 * Name:      user-controller.js
 * Desc:      Provide api to return the sessionMode related configurations
 * Copyright: © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */

// const express = require('express');
const Promise = require('bluebird');
// const bodyParser = require('body-parser');
const fs = require('fs-extra');
// const path = require('path');
// const util = require('util');
const acctSrc = require('../../../bzshared/lib/apis/account/account-service');
// const constants = require('../../../bzshared/lib/apis/account/constants');
const accessGroupSrc = require('./access-group.service');
const BASE_PATH = '/ZLUX/pluginStorage/com.rs.bzadm';
// const LEGACY_USERS_PATH = '/users';
// const LEGACY_GORUPS_PATH = '/groups';
const ADMIN_USER_PATH = '/ZLUX/pluginStorage/com.rs.bzadm/users';
// const BZW_USER = '/ZLUX/plugins/com.rs.bzshared/services/register';
const USERINFO = 'userInfo_';
const USERLOGIN = 'login_';
const CREATE = 'create';
// const DELETE = 'delete';
const EDIT = 'edit';
// const RESET = 'reset Password';
// const successData = { 'status': true, 'message': 'Successed' };
const failedData = { 'status': false, 'message': 'Failed' };
// const InternalDataSteward = require('../../../bzshared/lib/services/internal-data-steward.service');
const Utiles = require('./utils.service');
const bzdb = require('../../../bzshared/lib/services/bzdb.service');
const path = require('path');


class userDataServiceFile {

	constructor(context, authConfigObj) {
		this.context = context;
		this.logger = context.logger;
		this.authConfigObj = authConfigObj;
		this.basePath = this.context.plugin.server.config.user.instanceDir;
		this.importPasswordEncoding=authConfigObj.getImportPasswordEncryption();
		// this.dataSteward = InternalDataSteward.initWithContext(context);
		this.accessGroupSrc = accessGroupSrc.init(context);
		this.utiles = new Utiles(context);
		this.groupListMap = new Map();
		this.allGroupValue = [];

	}

	setLu(originObj, newObj) {
		const keys = Object.keys(originObj);
		const luKeys = keys.filter(d => this.utiles.isValidUserLuKeyFormat(d));

		luKeys.forEach(d => {
			newObj[d] = originObj[d]
		});
	}



	async GetAllUser(username) {
		const result = await bzdb.select('userInfo');

		if(username !== 'superadmin') {
			const admin = await bzdb.select('administrator', {name: username});
			const data = admin.rowCount > 0 ? admin.data[0] : {};

			if(this.authConfigObj.isAllowDefaultGroup) {
				if(data.role === 'admin') {
					return result;
				} else if(data.group.indexOf('Default Group') > -1 || (data.isAll && data.role === 'groupAdmin')) {
					return result;
				} else {
					result.data = [];
				}	
			}

			// if(data.role === 'groupAdmin') {
			// 	const accessGroups = await bzdb.select('group');
			// 	const ids = accessGroups.data.map(d => d.id); // get groups id.

			// 	result.data = result.data.filter(d => {
			// 	  return d.groupNames.findIndex(g => {
			// 			return (data.isAll ? ids : data.group).findIndex(a => a === g) > -1;
			// 		}) > -1;
			// 	});
			// }

			if(data.role === 'groupAdmin') {
				const accessGroups = (await bzdb.select('group')).data || [];
				const groups = data.isAll ? accessGroups : (data.group || []).map(groupId => (accessGroups.filter(group => group.id === groupId))[0]);
				let userIds = [];
				// get all users' ids
				(groups || []).forEach(group => {
					((group && group.internalUsers) || []).forEach(user => {
						if (userIds.indexOf(user.userId) === -1) {
							userIds.push(user.userId);
						}
					})
				});

				result.data = (result.data || []).filter(user => userIds.indexOf(user.userId) > -1);
			}
		}
		return result;
	}

	async GetAllUserbyID(userID) {

	}

	async createUser(req, res, userObj) {
		try {
			return await this.manageUser(req, res, userObj);
		} catch (e) {
			throw e;
		}
	}

	async deleteUser(req, res) {
		let deleteUserOptions = {
			userId: req.query.data
		}
		if(deleteUserOptions.userId && deleteUserOptions.userId.length > 0){
			const folderName = encodeURIComponent(deleteUserOptions.userId.toLowerCase());
			const ROOT_PATH = path.join(process.cwd(), '../');
			const userPath = path.join(ROOT_PATH, `deploy/instance/users/${folderName}`);
			if(fs.existsSync(userPath)){
				fs.removeSync(userPath);
			}
		}
		return this.handleDeleteUser(res, req, deleteUserOptions);
	}

	async validUserId(userInfo){
		const result = await bzdb.select('userInfo',{userId:userInfo.userId});
		if(result.rowCount > 0){
			return false;
		}
		return true;
	}

	// edit group call edit user api
	async editUser(req, res, timeStamp) {
		const editValue = req.body;
		this.logger.info(`Updating user, data: ${JSON.stringify(editValue)}`);
		const userId = editValue.userId;
		delete editValue['userId'];
		const constraints = new (bzdb.getBZDBModule().SelectConstraints)();
		constraints.addIgnoreCaseFields('userId');
		bzdb.update('userInfo', {userId: userId}, editValue, constraints).then((rep) => {
			res.setHeader("Content-Type", "text/typescript");
			if (rep.status){
				res.status(201).json({ 'text': 'success' });
				this.logger.info(`Succeed to update user: ${userId}`);
			} else {
				res.status(202).json(rep);
				this.logger.info(`Failed to update user: ${userId}`);
			}
		}, (err) => {
			res.status(400).json({ 'text': 'failed' });
			this.logger.server(`Failed to update user ${userId}, error: ${err}, data: ${JSON.stringify(editValue)}`);
		});
	}

	async changePassword(req, res, editUserOptions) {
		const constraints = new (bzdb.getBZDBModule().SelectConstraints)();
		constraints.addIgnoreCaseFields('username');
		//search the user id if exists
		const userLoginData = (await bzdb.select('userLogin', {username: editUserOptions.userId},constraints)).data[0]; 
		if (userLoginData) {
			editUserOptions.userId = userLoginData.username;
		} else if(editUserOptions.userId !== 'superadmin') {
			return Promise.reject({status: false, message: 'The user doesn\'t exist'});
		}
		return this.resetPassword(req, res, editUserOptions);
	}

	async importData(req, res) {
		this.createDir(this.basePath + BASE_PATH);
		this.createDir(this.basePath + ADMIN_USER_PATH);
		let timeStamp = new Date().getTime();
		return this.createUpload(req, res, timeStamp); // TBD error handling
	}
	/**
	 * Create folder if it don't exist
	 * @param {string} dir 
	 */
	createDir(dir) {
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir);
		}
	}
	/**
	 * Create folder if it don't exist
	 * @param {string} dir 
	 */
	createDir(dir) {
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir);
		}
	}

	/**
	 * Get user info file location
	 * @param {string} id 
	 */
	getUserInfoPath(id) {
		return `${this.basePath}${ADMIN_USER_PATH}/${USERINFO}${encodeURIComponent(id)}.json`;
	}

	/**
	 * Get user login file location
	 * @param {string} id 
	 */
	getUserLoginPath(id) {
		return `${this.basePath}${ADMIN_USER_PATH}/${USERLOGIN}${encodeURIComponent(id)}.json`;
	}


	/**
	 * Create, edit user at bzadmin
	 * @param {*} req 
	 * @param {*} res 
	 * @param {*} options 
	 */
	async manageUser(req, res, options) {
		let processOptions = {
			res: res,
			data: options.actionType
		}
		
		const constraints = new (bzdb.getBZDBModule().SelectConstraints)();
		constraints.addIgnoreCaseFields('userId');
		const rs = await bzdb.select('userInfo', {userId: options.userId}, constraints);
		
		if (options.actionType === CREATE) {
			if (rs.rowCount > 0 ){
				throw {status: false, message: 'The user ID to create already exists'};
			}
			processOptions.data = CREATE;
			// if (options.authType === 'ldap' || options.authType === 'mssql' || options.authType === 'sso') {
			// 	const createOnlyUserInfo = this.createUserInfo(options);
			// 	await this.syncUserData(req, options, "syncLogin");
			// 	return Promise.resolve([createOnlyUserInfo]);
			// 	//this.processResult([createOnlyUserInfo], processOptions);
			// } 
			options.password = options.password ? options.password : 'password';
			// const createUserInfo = await this.createUserInfo(options);
			// const createUserLogin = await this.createUserLogin(options);
			// const allPromistArray = [createUserInfo, createUserLogin];
			const createUser = await this.createUserData(options)
			const allPromistArray = [createUser];
			//this.processResult(allPromistArray, processOptions);
			return Promise.resolve(allPromistArray);

		} else if (options.actionType === EDIT) {
			if (rs.rowCount === 0){
				throw {status: false, message: 'The data to edit doesn\'t exist'};
			}
			const createOnlyUserInfo = this.createUserInfo(options);
			//this.processResult([createOnlyUserInfo], processOptions);
			return Promise.resolve([createOnlyUserInfo]);
		}
	}

	/**
	 * Reset Password
	 * @param {*} req 
	 * @param {*} res 
	 * @param {*} options 
	 */
	async resetPassword(req, res, options) {
		const resetPassword = await this.createUserLogin(options);
		return Promise.resolve([resetPassword]);
	}


	/**
	 * Creates userInfo and userLogin together
	 * @param {*} value 
	 * @returns 
	 */
	async createUserData(value){
		let userId = value.userId;
		let dataEntityName = 'userLogin';
		if (userId === 'superadmin'){
			dataEntityName = 'superAdmin';
		}
		const userLoginValue = await this.getUserLoginValue(value);
		const userInfoValue = this.getUserInfoValue(value);
		try{
			const batchTxnData = [
				{dataEntityName:'userInfo', action:'UPDATEORINSERT', value: userInfoValue, options:{}},
				{dataEntityName, action:'UPDATEORINSERT', value: userLoginValue, options:{}} // userLogin or superAdmin
			]
			this.logger.info('createUser() userInfo data: ' + userInfoValue);
			this.logger.info('createUser() userLogin data: ' + userLoginValue);
			const result = await bzdb.batchTxn(batchTxnData);
			return result
		}catch(err){
			this.logger.severe('createUser() occurs error: ' + err.message + "; Error name:" + err.name + "; Error code:" + err.code);
			return false;
		}
	}

	getUserInfoValue(value){
		let userInfoValues = {
			timeStamp: value.timeStamp,
			userId: value.userId,
			userName: value.userName,
			mail: value.mail,
			phone: value.phone,
			groupNames: value.groupNames,
			logicUnit: value.logicUnit
		};
		this.setLu(value, userInfoValues);
		return userInfoValues;
	}

	/**
	 * create user infor file
	 * @param {string} path 
	 * @param {*} value 
	 * @param {*} success 
	 * @param {*} failure 
	 */
	async createUserInfo(value) {
		const userInfoValues = this.getUserInfoValue(value)
		this.logger.info('createUserInfo() file data: ' + userInfoValues);
		try{
			const result = await bzdb.updateOrInsert('userInfo', userInfoValues)
			return result
		} catch(err) {
			this.logger.severe('createUserInfo() occurs error: ' + err.message + "; Error name:" + err.name + "; Error code:" + err.code);
			return false
		}
	}

	getUserLoginValue(creatUserOptions){
		let timeStamp = creatUserOptions.timeStamp;
		let userId = creatUserOptions.userId;
		let password = creatUserOptions.password;
		let fileContentsJSON = {
			timeStamp: timeStamp,
			username: userId
		};
		return new Promise((resolve) => {
			acctSrc._addIVAndAuthToObject(fileContentsJSON, password, (result) => {
				result.init = creatUserOptions.init; // super admin user should reset password when the first time sign in.
				resolve(result);
			})
		});
	}

	/**
	 * create user login file
	 * @param {*} res 
	 * @param {*} req 
	 * @param {object} creatUserOptions all data
	 */
	async createUserLogin(creatUserOptions) {
		const userLoginValue = await this.getUserLoginValue(creatUserOptions);
		let dataEntityName = 'userLogin';
		let userId = creatUserOptions.userId;
		if (userId === 'superadmin'){
			dataEntityName = 'superAdmin';
		}
		this.logger.info('createUserLogin() file data: ' + userLoginValue);
		try{
			return await bzdb.updateOrInsert(dataEntityName, userLoginValue);
		}catch(err){
			this.logger.severe('createUserLogin() occurs error: ' + err.message + "; Error name:" + err.name + "; Error code:" + err.code);
			return false
		}
	}

	/**
	 * Sync user information to BlueZone web
	 * @param {*} req 
	 * @param {*} options 
	 * @param {*} syncMethod 
	 */
	async syncUserData(req, options, syncMethod) {
		let value = {};
		if (syncMethod === 'syncResetPassword') {
			value = {
				timeStamp: options.timeStamp,
				userId: (options.userId).toLowerCase(),
				password: options.password,
				actionType: options.actionType,
				authType: options.authType,
				init: options.init || false
			}
		} else {
			value = {
				timeStamp: options.timeStamp,
				userId: (options.userId).toLowerCase(),
				username: options.userName,
				password: options.password,
				mail: options.mail,
				phone: options.phone,
				groupNames: options.groupNames,
				logicUnit: options.logicUnit,
				actionType: options.actionType,
				authType: options.authType
			}
			this.setLu(options, value);
            //form import
			value.authentication = options.authentication || '';
			value.iv = options.iv || '';
			value.salt = options.salt || '';
			value.passwordEncoding = options.passwordEncoding || '';
			value.fromImport = options.fromImport || false;
		}		
	}

	/**
	 * delete file if create file failure
	 * @param {Array} dirs
	 */
	deleteFile(dirs) {
		if (dirs.length !== 0) {
			dirs.forEach(function (filepath) {
				fs.access(filepath, fs.constants.F_OK, (err) => {
					if (err) return err;
					fs.unlink(filepath, function (err) {
						if (err) throw err;
						console.info("Deleted file success!");
					});
				})

			});
		}
	}

	/**
	 * Delete user
	 * @param {*} res 
	 * @param {*} req 
	 * @param {object} deleteUserOptions 
	 */
	async handleDeleteUser(res, req, deleteUserOptions) {
		const deleteUserLoginOptions = {
			username: deleteUserOptions.userId
		};
		const existUserInfo = (await bzdb.select('userInfo', deleteUserOptions)).rowCount > 0; // TBD: maybe performance could be improved by a pkExist() function
		const existUserLogin = (await bzdb.select('userLogin', deleteUserLoginOptions)).rowCount > 0;
		if (existUserInfo && existUserLogin) {
			// const deleteUserInfo = await this.removeUserInfo(deleteUserOptions);
			// const deleteUserLogin = await this.removeUserLogin(deleteUserLoginOptions);
			const deleteUser = await this.removeUserData(deleteUserOptions);
			return Promise.resolve([deleteUser]);
		} else if (existUserInfo) {
			const deleteUserInfo = await this.removeUserInfo(deleteUserOptions);
			return Promise.resolve([deleteUserInfo]);
		} else {
			return Promise.reject({status: false, message: 'The data to delete doesn\'t exist'});
		}
	}

	/**
	 * remove userLogin, userInfo, and all private resources of the user
	 * @param {*} deleteUserOptions 
	 * @returns 
	 */
	async removeUserData(deleteUserOptions){
		const batchTxnData = this.getRemoveUserInfoData(deleteUserOptions);
		const deleteUserLoginOptions = {
			username: deleteUserOptions.userId
		};
		batchTxnData.push({dataEntityName: 'userLogin', action: 'DELETE', value: {}, options:{filter: deleteUserLoginOptions}});
		try{
			return await bzdb.batchTxn(batchTxnData);
		}catch(err){
			return false;
		}
	}

	getRemoveUserInfoData(deleteUserOptions){
		const uid = deleteUserOptions.userId.toLowerCase();
		// const uidencode = encodeURIComponent(uid);
		const filter = {userId: uid};
		const batchTxnData = [
			{dataEntityName: 'userInfo', action: 'DELETE', value: {}, options:{filter:{userId: deleteUserOptions.userId}}},
			{dataEntityName: 'sessionPrivate', action: 'DELETE', value: {}, options:{filter}},
			{dataEntityName: 'keyboardMappingPrivate', action: 'DELETE', value: {}, options:{filter}},
			{dataEntityName: 'hotspotPrivate', action: 'DELETE', value: {}, options:{filter}},
			{dataEntityName: 'launchpadPrivate', action: 'DELETE', value: {}, options:{filter}},
			{dataEntityName: 'preferencePrivate', action: 'DELETE', value: {}, options:{filter}},
			{dataEntityName: 'scriptPrivate', action: 'DELETE', value: {}, options:{filter:{username: uid}}},
			// {dataEntityName: 'legacyUserDir', action: 'FS_DELETEDIR', value:path.join(this.basePath, LEGACY_USERS_PATH, uidencode)}
			// TBD delete script
		];
		return batchTxnData;
	}

	/**
	 * Remove the userInfo file
	 * @param {object} deleteUserOptions 
	 */
	async removeUserInfo(deleteUserOptions) {
		const batchTxnData = this.getRemoveUserInfoData(deleteUserOptions);
		try{
			return await bzdb.batchTxn(batchTxnData);
		}catch(err){
			return false;
		}
	}

	/**
	 * Remove the userLogin file
	 * @param {object} deleteUserOptions 
	 */
	removeUserLogin(deleteUserOptions) {
		return new Promise((resolve, reject) => {
			bzdb.delete('userLogin', deleteUserOptions).then((rep) => {
				resolve(true);
			}, (err) => {
				reject(false);
			});
		});
	}

	/**
	 * Sync delete user to BlueZone web
	 * @param {req} req 
	 * @param {object} options 
	 */

	syncDeleteUserData(req, options) {
		// let id = options.userId.toLowerCase();

	}

	/**
	 * Upload file
	 * @param {*} res 
	 * @param {*} req 
	 * @param {*} timeStamp 
	 */
	async createUpload(req, res, timeStamp) {
		let userInfo = []; // userInfo data to be inserted
		this.groupListMap = new Map(); // Groups to be inserted
		let status;
		let totalCount = 0;
		let errorCount = 0;
		let successCount = 0;
		let warnCount = 0;
		let userIDLen = 128;
		let existElem = [];
		let userIdEmptyError = [];
		let userIdLengthError = [];
		let userIdError = [];
		let passwordError = [];
		let passwordLengthError = [];
		let missPassword = [];
		let userNameError = [];
		let phoneError = [];
		let mailError = [];
		let luError = [];
		let groupNameError = [];
		let groupNameLengthError = [];
		let userNameLengthError = [];
		let defaultPassword = '';
		
		let userInformation, userLoginValue, addUserToGroup;
		const idRegex = /^[A-Za-z0-9_@`.#$=!^~)(\];,}{'[\\\+\-\w ]*$/;
		const passwordRegex = /^[A-Za-z0-9~!@#$%^*()_+`\-={}[\]|\\;'?,./]*$/;
		const starPasswordRegex = /^\*{1,8}$/;
		const groupRegex = /^[A-Za-z0-9_. ]*$/;
		const nameRegex = /^[A-Za-z0-9_@`.#$=!^~)(\];,}{'[\+\-\w\u0080-\uFFFF ]*$/;
		// const mailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
		const mailRegex = /^(([^<>()[\]\.,;:\s@\"]+(\.[^<>()[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i
		const phoneRegex = /^[+]*[0-9]*[(]{0,1}\s*[-\s/0-9]*\s*[)]{0,1}[-\s/0-9]*$/;
		const maxNameLength = 50;
		const maxLuLength = 31; // BZ-20493
		const overwritePassword = req.body.overwritePassword;
		let data = req.body.data;
		let groups;
		let importGroupList = []; // the groups to import
		let allImportUserID = []; // user ids to be imported
		let existUserGroups = {}; // records the groups to import for existing user
		let allGroupValue = (await bzdb.select('group')).data;
		this.allGroupValue = allGroupValue;
		let importStatus = {};
		const removeUsersInfo = [];
		const removeUsersLogin = [];

		if(req.body.uploadType === 'overwrite') {
			const users = (await this.GetAllUser()).data;

			users.forEach(d => {
				if(data.findIndex(c => c.userId === d.userId) < 0) {
					removeUsersInfo.push(d.userId);
					removeUsersLogin.push(d.userId);
					existUserGroups[d.userId] = [];
				}
			})
		}

		if (data && data.length !== 0) {
				for (let element of data) {
				// data.forEach(async (element) => {
					if (element.groupNames && element.groupNames.length !== 0) {
						if (String(element.groupNames).includes(';') || String(element.groupNames).includes(',')) {
							groups = this.spliceSymbol(element.groupNames);
						} else {
							groups = [String(element.groupNames)];
						}
						// group name is string, remove ''
						groups = groups.filter(d => d.trim());
					} else {
						groups = [];
					}
					let userData = {
						timeStamp: timeStamp,
						userId: element.userId.trim(),
						password: String(element.password),
						userName: element.userName,
						mail: element.mail,
						phone: element.phone,
						groupNames: groups.length !== 0 ?this.unique(groups):[]

					};
					const selectConstraint = new (bzdb.getBZDBModule().SelectConstraints)();
					selectConstraint.addIgnoreCaseFields('userId');
					let existUserInfo = (await bzdb.select('userInfo', {userId: userData.userId}, selectConstraint)).data[0];
					const luInfo = this.getLuInfo(element, maxLuLength);

					if(req.body.appendType === 'not' && req.body.uploadType === 'append' && existUserInfo) {
						this.logger.debug(`Do not update existing users: ${existUserInfo.userId}`);
						continue;
					}
					Object.assign(userData, luInfo.luObj);
	
					// for upgrade
					if (element.authentication && element.iv && element.salt) {
						userData.authentication = element.authentication;
						userData.iv = element.iv;
						userData.salt = element.salt;
					}
	
					// total need to upload group list
					userData.groupNames.forEach((value) => {
						if (value.length !== 0 && value.length < maxNameLength && groupRegex.test(value)) {
							let currentGroupIndex = importGroupList.indexOf(value.toLowerCase());
							if (currentGroupIndex === -1) {
								importGroupList.push(value);
							}
						}
					});

				

					// validate the import data
					if (userData.userId === '') {
						// errorCount++;
						userIdEmptyError.push(userData);
						this.logger.debug(`Import user id empty data: ${JSON.stringify(userIdEmptyError)}`);
					} else if (userData.userId.length > userIDLen) {
						// warnCount++;
						userIdLengthError.push(userData);
						this.logger.debug(`Import user id with a length more than 128 characters data: ${JSON.stringify(userIdLengthError)}`);
					}else if (!idRegex.test(userData.userId)) {
						// warnCount++;
						userIdError.push(userData);
						this.logger.debug(`Import user id contains illegal character data: ${JSON.stringify(userIdError)}`);
					} else if (userData.userId !== '' && idRegex.test(userData.userId)) {
						// check if current user already exists
						// keep password for exist user if unchecked overwritePassword
						const keepPassword = !overwritePassword && existUserInfo;

						// if (userData.password !== '' && userData.password.length < 6) {
						// 	warnCount++;
						// 	passwordLengthError.push(userData);
						// } else 
						if (!keepPassword && userData.password !== '' && !passwordRegex.test(userData.password)) {
							// warnCount++;
							passwordError.push(userData);
							this.logger.debug(`Import password contains illegal character data: ${JSON.stringify(passwordError)}`);
						}  else if (userData.userName !== "" && userData.userName.length > userIDLen) {
							// warnCount++;
							userNameLengthError.push(userData);
							this.logger.debug(`Import user name with a length more than 128 character data: ${JSON.stringify(userNameLengthError)}`);
						}else if (userData.userName !== "" && !nameRegex.test(userData.userName)) {
							// warnCount++;
							userNameError.push(userData);
							this.logger.debug(`Import user name contains illegal character data: ${JSON.stringify(userNameError)}`);
						} else if (userData.phone !== '' && !phoneRegex.test(userData.phone)) {
							// warnCount++;
							phoneError.push(userData);
							this.logger.debug(`Import phone contains illegal character data: ${JSON.stringify(phoneError)}`);
						} else if (userData.mail !== '' && !mailRegex.test(userData.mail)) {
							// warnCount++;
							mailError.push(userData);
							this.logger.debug(`Import mail contains illegal character data: ${JSON.stringify(mailError)}`);
						} else if (!luInfo.validate) {
							// warnCount++;
							luError.push(userData);
							this.logger.debug(`Import LU length beyond max length ${maxLuLength}: ${JSON.stringify(luError)}`);
						} else {
							// total import user id
							let currentUserIndex = allImportUserID.indexOf(element.userId);
							if (currentUserIndex === -1) {
								allImportUserID.push(element.userId);
							}

							if (!keepPassword && (userData.password === '' || starPasswordRegex.test(element.password))) {
								// set default password if the password is empty
								userData.password = 'password'; // TBD: we should make the defaul password configurable?
								defaultPassword = 'password';
								missPassword.push(userData);
							}
							let createUserflag = true;
							// validte the group name 
							if (userData.groupNames.length !== 0) {
								userData.groupNames.forEach((group) => {
									
									if (group.length !== 0) {
										if (group.length > maxNameLength) {
											// warnCount++;
											if (groupNameLengthError.length !== 0) {
												let index = groupNameLengthError.findIndex(d => d.userId === userData.userId);
												if (index === -1) {
													groupNameLengthError.push(data);
												}
											}else {
												groupNameLengthError.push(data);
											}
											
											this.logger.debug(`Import group name with a length more than 50 characters data: ${JSON.stringify(groupNameLengthError)}`);
											createUserflag = false;
										}else if (!groupRegex.test(group)) {
											// warnCount++;
											if (groupNameError.length !== 0) {
												let index = groupNameError.findIndex(d => d.userId === userData.userId);
												if (index === -1) {
													groupNameError.push(userData);
												}
											}else {
												groupNameError.push(userData);
											}
											
											this.logger.debug(`Import group name contains illegal character data: ${JSON.stringify(groupNameError)}`);
											createUserflag = false;
										}
									}else {
										// warnCount++;
										if (groupNameError.length !== 0) {
											let index = groupNameError.findIndex(d => d.userId === userData.userId);
											if (index === -1) {
												groupNameError.push(userData);
											}
										}else {
											groupNameError.push(userData);
										}
										
										this.logger.debug(`Import group name contains illegal character data: ${JSON.stringify(groupNameError)}`);
										createUserflag = false;
									}
								});

							}
							// user id does not case sensitive, if import user already exists, need to remove  userinfo and userlogin file firstly
							if (existUserInfo) {
								let userId = existUserInfo.userId;
								existUserGroups[userId] = userData.groupNames;
								if(req.body.uploadType === 'overwrite') {
									// userData.userId = userId;
									// keep original userId
								} else {
									userData.userId = userId;
								}
								
								if (!overwritePassword) {
									const originUserData = (await bzdb.select('userLogin', {username: userId})).data[0];
									userData.authentication = originUserData.authentication || '';
									userData.salt = originUserData.salt || '';
									userData.iv = originUserData.iv || '';
								}
							}

							// All effective data in userInfo paramter
							if (createUserflag) {
								if (userInfo.length !== 0) {
									let allUserInfoIndex = userInfo.findIndex(d => d.userId.toLowerCase() === userData.userId.toLowerCase());
									if (allUserInfoIndex > -1) {
										userInfo.splice(allUserInfoIndex, 1);
										userInfo.push(userData);
									} else {
										userInfo.push(userData);
									}
								} else {
									userInfo.push(userData);
								}
							}
						}
					}
				};

			// create new group and remove import user in exist group 
			/**
			 * allGroupValue - All exist group infromation
			 * allImportUserID - All need to import user id
			 * importGroupList - All need to import group list
			 * userInfo - All effective import data 
			 */

			/**
			 * For the existing groups that includes the imported userId, but not included in the new imported user,
			 * the user Id needs to be removed from this group.
			 */

			const groupsToRemoveUserId = await this.removeUserInGroup(req, allGroupValue, existUserGroups);
			// const resultsGroupsToRemoveUserId = await bzdb.bulkLoad('group', groupsToRemoveUserId);
			/**
			 * For the groups included in the imported users, 
			 * 	if the group already exist, add the user id into the existing group
			 *  if the group not exist, create the group.
			 */
			const groupsToAddUserIdOrCreate = await this.createImportGroup(req, userInfo, allGroupValue);
			// const resultsGroupsToAddUserIdOrCreate = await bzdb.bulkLoad('group', groupsToAddUserIdOrCreate);

			totalCount = data.length;
			// for all users are invalid user condition
			errorCount = Number(userIdEmptyError.length + groupNameError.length + groupNameLengthError.length + mailError.length + passwordError.length + 
				passwordLengthError.length + phoneError.length + userIdError.length + userIdLengthError.length + userNameError.length + luError.length);

			const userLogins = await this.createUploadUserlogins(userInfo, this.importPasswordEncoding);
			// const resultsUserLogins = await bzdb.bulkLoad('userLogin', userLogins);
			// const resultsUserInfo = await bzdb.bulkLoad('userInfo', userInfo);
			
			if(userLogins.length !== 0) {
				const batchTxnData = [
					{dataEntityName:'group', action:'BULKLOAD', value: groupsToRemoveUserId},
					{dataEntityName:'group', action:'BULKLOAD', value: groupsToAddUserIdOrCreate},
					{dataEntityName:'userLogin', action:'BULKLOAD', value: userLogins},
					{dataEntityName:'userInfo', action:'BULKLOAD', value: userInfo}
				];
				if(req.body.uploadType === 'overwrite') {
					if(removeUsersInfo.length > 0) {
						batchTxnData.push({
							dataEntityName:'userInfo',
							action: 'DELETE',
							value: {},
							options: { filter: {userId: removeUsersInfo} }
						});
						batchTxnData.push({dataEntityName: 'sessionPrivate', action: 'DELETE', value: {}, options:{ filter: {userId: removeUsersInfo} }});
						batchTxnData.push({dataEntityName: 'keyboardMappingPrivate', action: 'DELETE', value: {}, options:{ filter: {userId: removeUsersInfo} }});
						batchTxnData.push({dataEntityName: 'hotspotPrivate', action: 'DELETE', value: {}, options:{ filter: {userId: removeUsersInfo} }});
						batchTxnData.push({dataEntityName: 'launchpadPrivate', action: 'DELETE', value: {}, options:{ filter: {userId: removeUsersInfo} }});
						batchTxnData.push({dataEntityName: 'preferencePrivate', action: 'DELETE', value: {}, options:{ filter: {userId: removeUsersInfo} }});
						batchTxnData.push({dataEntityName: 'totpUser', action: 'DELETE', value: {}, options:{ filter: {uid: removeUsersInfo} }});
					}

					if(removeUsersLogin.length > 0) {
						batchTxnData.push({
							dataEntityName:'userLogin',
							action: 'DELETE',
							value: {},
							options: { filter: {username: removeUsersLogin} }
						});
					}
				}
				const uploadResult = await bzdb.batchTxn(batchTxnData);
	
				if (uploadResult.status){
					const userLoginResult = uploadResult.results.filter( r => r.dataEntityName === 'userLogin')
					if (userLoginResult.length > 0){
						userLoginResult[0].result.results.forEach( r => {
							if (r.status){
								successCount ++;
							}
						});
					}
				} else {
					return uploadResult;
				}
			}

			importStatus = {
				data: {
					totalCount: totalCount,
					errorCount: errorCount,
					userIdEmptyError: userIdEmptyError,
					successCount: successCount,
					warnCount: warnCount,
					existElem: existElem,
					missPassword: missPassword,
					defaultPassword: defaultPassword,
					passwordError: passwordError,
					passwordLengthError: passwordLengthError,
					userIdError: userIdError,
					userIdLengthError: userIdLengthError,
					userNameError: userNameError,
					userNameLengthError: userNameLengthError,
					mailError: mailError,
					phoneError: phoneError,
					groupNameError: groupNameError,
					groupNameLengthError: groupNameLengthError,
					luError: luError
				}
			}

			return Promise.resolve(importStatus);
		} else {
			importStatus = {
				data: failedData,
			}
			return Promise.resolve(importStatus);
		}
	}

	getLuInfo(dataObj, maxLen) {
		const MAX_LU_COLUMNS = 32;
		const LU_PREFIX = 'LU';
		let validate = true;
		let luObj = {};
		// init luObj with LU1-LU32 keys
		for (let n = 1; n <= MAX_LU_COLUMNS; n++) {
			const key = LU_PREFIX + n;
			luObj[key] = '';
		}
		Object.keys(dataObj || {}).forEach(key => {
			const uppercaseKey = key.toUpperCase();
			if (uppercaseKey in luObj) {
				luObj[uppercaseKey] = dataObj[key];
				validate = validate && (dataObj[key] || '').length <= maxLen; 
			}
		});
		
		return {
			luObj: luObj,
			validate: validate
		};
	}

	unique(array) {
		var res = [];
		for (var i = 0, len = array.length; i < len; i++) {
			var current = array[i];
			if (res.length !== 0) {
				let index = res.findIndex(d => d.toLowerCase() === array[i].toLowerCase());
				if (index === -1) {
					res.push(current);
				}
			} else {
				res.push(current);
			}
		}
		return res;
	}

	/**
	 * Split symbol, comma, semicolon do not start or end with sttring
	 * @param {string} group 
	 */
	spliceSymbol(group) {
		let result;
		let groupStr = String(group);
		if (groupStr.startsWith(';') || groupStr.startsWith(',')) {
			let name = groupStr.substring(1);
			if (name.includes(';') || name.includes(',')) {
				result = name.split(/;|,/);
			} else {
				result = [name];
			}
		}else if (groupStr.endsWith(';') || groupStr.endsWith(',')) {
			let name = groupStr.substring(groupStr.length - 1, 0);
			if (name.includes(';') || name.includes(',')) {
				result = name.split(/;|,/);
			} else {
				result = [name];
			}
		} else {
			result = groupStr.split(/;|,/);
		}
		return result;
	}

	/**
	 * Create user information uses import file
	 * @param {*} value 
	 */
	async createUploadUserInfo(value) {
		value.groupNames = value.groupNames.map(g => this.getGroupId(g));
		return bzdb.updateOrInsert('userInfo', value).then((rep) => {
			return true;
		}, (err) => {
			return false;
		});
	}

	async createUploadUserlogins(importData, importPasswordEncoding){
		const userLogins = [];

		for (let value of importData){

			let userAccountInfo = {
				timeStamp: value.timeStamp,
				username: value.userId
			};
			let passwordObj = {
				authentication: value.password,
				salt: value.salt || '',
				iv: value.iv || '',
			};

			if (importPasswordEncoding === "") { //for import using default encryption password 
				if (value.authentication && value.iv && value.salt) { // for upgrade: bzw already has login.json file, but does not contain password
					passwordObj.authentication = value.authentication;
				} else {
					passwordObj = await acctSrc._encryptWithAES256(userAccountInfo, value.password);
				}
			}
			
			Object.assign(userAccountInfo, passwordObj); //merge object
			userLogins.push(userAccountInfo);

			// delete the password related fields from importData
			if (value.password) delete value.password;
			if (value.salt) delete value.salt;
			if (value.iv) delete value.iv;
		}
		return userLogins;
	}

	/**
	 * Create user login uses import file
	 * @param {*} path 
	 * @param {*} value 
	 */
	async createUploadUserlogin(value) {
		
		let userAccountInfo = {
			timeStamp: value.timeStamp,
			username: value.userId
		};
		let passwordObj = {
			authentication: value.password,
			salt: value.salt || '',
			iv: value.iv || '',
		};
		if (this.importPasswordEncoding === "") { //for import using default encryption password 
			if (value.authentication && value.iv && value.salt) { // for upgrade: bzw already has login.json file, but does not contain password
				passwordObj.authentication = value.authentication;
			} else {
				passwordObj = await acctSrc._encryptWithAES256(userAccountInfo, value.password);
			}
		}
		Object.assign(userAccountInfo, passwordObj); //merge object
		return new Promise((resolve, reject) => {
			// for upgrade: bzw already has login.json file, but does not contain password
			// if (value.authentication && value.iv && value.salt) {
			// 	const data = Object.assign(fileContentsJSON, {authentication: value.authentication, iv: value.iv, salt: value.salt});
			// 	this.dataSteward.addData('user_login', {data: data, path: path}).then((rep) => {
			// 		resolve(true);
			// 	}, (err) => {
			// 		reject(false);
			// 	});
			// } else {
			bzdb.updateOrInsert('userLogin', userAccountInfo).then((rep) => {
				resolve(userAccountInfo);
			}, (err) => {
				reject(false);
			});
		})
			//}
	}

	getGroupId(name) {
		const group = this.allGroupValue.find(g => g.groupName.trim().toLowerCase() === name.trim().toLowerCase()) || {};

		return group.id || name;
	}

	/**
	 * Create import group if it does not exist
	 * @param {Object} req 
	 * @param {Array} importData - All effective import data
	 * @param {Array} allGroupValue - All exist group list
	 */
	async createImportGroup(req, importData, allGroupValue ) {
		// return new Promise((resolve, reject) => {
				// create group file
				for await (const element of importData){
					if (element.groupNames.length !== 0) {
						await this.addUserToAccessGroup(element, allGroupValue);
					}
				}
				
				if (this.groupListMap.size !== 0) {
					let lists = [];
					for (let list of this.groupListMap.values()){
					// this.groupListMap.forEach(async (list) => {
						// If the imported group already exist, add the imported userIds into existing group.
						if ((await bzdb.select('group', {id: list.id})).rowCount > 0) {
							allGroupValue.forEach(allgroups => {
								if (this.groupListMap.has(allgroups.groupName) && allgroups.groupName.toLowerCase() === list.groupName.toLowerCase()) {
									allgroups.internalUsers.forEach((addUser) => {
										let userIndex = list.internalUsers.findIndex(d => d.userId === addUser.userId);
										if (userIndex === -1) {
											list.internalUsers.push(addUser);
										}
									});
								}
							});
						} else {
							list.internalUsers = list.internalUsers.map(d => {
								return {userId: d.userId};
							});
						}
						lists.push(list);
					};
					return lists;
				}else {
					return [];
				}
		// })
	}

	// remove user in exist group list
	async removeUserInGroup(req, allGroupValue, existUserGroups) {
		return new Promise((resolve, reject) => {
			// The groups that included the imported user, but the imported user is not assigned to this group any more. 
			// So the user id needs remove from these groups.
			let needToRemoveUserList = this.getNeedToRemoveUserGroup(allGroupValue, existUserGroups);
			if (needToRemoveUserList.length !== 0) {
				Object.keys(existUserGroups).forEach(userId => { // remove the existing userIds from groups.
					needToRemoveUserList.forEach( (removeUserList) => {
						let index = removeUserList.internalUsers.findIndex(d => d.userId === userId);
						if (index > -1) {
							removeUserList.internalUsers.splice(index, 1);
						}
					})
				});
			}
			resolve(needToRemoveUserList);
		});
		
	}
	/**
	 * Add User into group for import file
	 * @param {*} req 
	 * @param {*} element 
	 */
	async addUserToAccessGroup(element, allGroupValue) {
		let groupList;
		let groupBaiseObj = {
			"groupName": "",
			"shortName": "",
			"leader": "",
			"parentGroupName": "",
			"description": "",
			"internalUsers": [],
			"ldapUsers": [],
			"mssqlUsers": [],
			"ssoUsers": [],
			"sessions": [],
			"privileges": {
				createSession: false,
				cloneSession: false,
				removeSession: false,
				editLU: true,
				sessionSettings: false,
				enableRecorder: false,
				enableUseEditor: false,
				enablePlayScript: false,
				enablePrivateScript: false,
                enableSharedScript: false,
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
			"name": '',
			"action": 'add'
		};

		let userObj = {
			userId: element.userId,
			userName: element.userName,
			accessGroups: element.groupNames,
			mail: element.mail,
			phone: element.phone
		}
		const groupIds = [];
		for await (const group of element.groupNames){
			let groupIndex = allGroupValue.findIndex(d => d.groupName.toLowerCase() === group.toLowerCase());
			if (groupIndex !== -1) {
				groupList = this.copy(allGroupValue[groupIndex]);
			}else {
				groupList = this.copy(groupBaiseObj);
				groupList.groupName = String(group);
				groupList.name = String(group);
				groupList.internalUsers = [];
			}
			if (this.groupListMap.has(group.toLowerCase())) {
				const groupObj = this.groupListMap.get(group.toLowerCase());
				let userInGroup = groupObj.internalUsers;
				let index = userInGroup.findIndex(d => d.userId === userObj.userId);
				if (index === -1) {
					this.groupListMap.get(group.toLowerCase()).internalUsers.push(userObj);
				}
				groupIds.push(groupObj.id);
			} else {
				let index = groupList.internalUsers.findIndex(d => d.userId === userObj.userId);
				if (index === -1) {
					groupList.internalUsers.push(userObj);
				}
				if (!groupList.id){
					const id = bzdb.getUIDSync();
					groupList['id'] = id;
				}
				this.groupListMap.set(group.toLowerCase(), groupList);
				groupIds.push(groupList.id);
			}
		}
		element.groupNames = groupIds;
	}

	// get need to remvoe user group list
	getNeedToRemoveUserGroup(groups, existUserGroups) {
		let removeUserList = [];
		groups.forEach((group) => {
			group.internalUsers.forEach((user) => {
				let groupNames = existUserGroups[user.userId]; // check whether the userid in import list
				if (groupNames){ // user id in import list
					// check whether the group still in import user's groupNames
					let groupIndex = groupNames.findIndex(d => d.toLowerCase() === group.groupName.toLowerCase());
					const isExist = removeUserList.findIndex(d => d.groupName.toLowerCase() === group.groupName.toLowerCase()) > -1;
					if (groupIndex === -1 && !isExist) { // group not in improt user's groupNames
						removeUserList.push(group);
					}
				}
			});
		});
		return removeUserList;
	}

	/**
	 * Deep copy
	 * @param {Object} data 
	 */
	copy(data) {
		return JSON.parse(JSON.stringify(data));
	}

	getUsersGroupNames(accessGroups) {
		let usersGroupNamesInfo = {};
		  (accessGroups || []).forEach(group => {
			const groupName = group.groupName || group.name;
			  (group.internalUsers || []).forEach(userObj => {
				const userId = userObj.userId;
				if (usersGroupNamesInfo[userId] === undefined) {
				  usersGroupNamesInfo[userId] = [groupName];
				} else if (usersGroupNamesInfo[userId].indexOf(groupName) === -1) {
				  usersGroupNamesInfo[userId].push(groupName);
				}
			  });
		  });
		  return usersGroupNamesInfo;
		}

}
module.exports = {
	init(context, authConfigObj) {
		return new userDataServiceFile(context, authConfigObj);
	}

};