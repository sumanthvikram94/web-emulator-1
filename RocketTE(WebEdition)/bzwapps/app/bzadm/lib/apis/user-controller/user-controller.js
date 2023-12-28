'use strict';

/**
 * Name:      user-controller.js
 * Desc:      Provide api to return the sessionMode related configurations
 * Copyright: © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */
//const cors = require('cors');
const express = require('express');
const Promise = require('bluebird');
const bodyParser = require('body-parser');
const jsonexport = require('jsonexport');
// const path = require('path');
// const util = require('util');
 const acctSrc = require('./../../../../bzshared/lib/apis/account/account-service');
// const constants = require('./../../../../bzshared/lib/apis/account/constants');
// const BASE_PATH = '/instance/ZLUX/pluginStorage/com.rs.bzadm';
// const ADMIN_USER_PATH = '/instance/ZLUX/pluginStorage/com.rs.bzadm/users';
// const BZW_USER = '/ZLUX/plugins/com.rs.bzshared/services/register';
// const USERINFO = 'userInfo_';
// const USERLOGIN = 'login_';
// const CREATE = 'create';
const DELETE = 'delete';
const EDIT = 'edit';
const CREATE = 'create';
const RESET = 'reset Password';
const successData = { 'status': true, 'message': 'Successed' };
const failedData = { 'status': false, 'message': 'Failed' };
const userDataServiceMsSQL= require('../../services/userDataServiceMsSQL');
const userDataServiceFile= require('../../services/userDataServiceFile');
const oAuth = require('../../../../bzshared/lib/services/oauth.service');
const authConfigService=require("../../../../bzshared/lib/services/authConfigService");
const bzdb = require('../../../../bzshared/lib/services/bzdb.service');
const accessGroupService = require('../../services/access-group.service');
const Security = require('../../../../bzshared/lib/services/security.service');

class UserController {
	constructor(context) {
		this.context = context;
		this.logger = context.logger;
		this.router = express.Router();

		authConfigService.init().then((obj)=>{
			this.authConfigObj=obj;
			if(this.authConfigObj.dataSourceConfig.defaultDataSource==="mssql"){
				this.userDataService=userDataServiceMsSQL.init(context,this.authConfigObj)
			}else{
				this.userDataService=userDataServiceFile.init(context,this.authConfigObj)
			}
			this.accessGroupObj = accessGroupService.init(context);
		});

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

	getUserRouter() {
		const logger = this.logger;
		const router = this.router;

		const timeStamp = new Date().getTime();
		logger.info('Setup user router');
		//router.use(cors());
		router.use(bodyParser.json({ type: 'application/json', limit: '5mb' }));
		router.use(oAuth.defaultOAuthChecker());

		router.get('/',  (req, res) => {
			 this.userDataService.GetAllUser(req.headers.username).then((data)=>{
				if (data && data.rowCount) {
					res.status(201).json({"text": data});
					logger.debug('GetAllUser(), data is '+JSON.stringify(data) );
					logger.info('Get all users successful.');
				} else if (data && data.isGpAdmin) {
					res.status(201).json({"text": data.users, others: data.others, groups: data.groups});
					logger.warn('Get all users return empty data.');
				} else {
					res.status(201).json({"text": data});
					logger.warn('Get all users return empty data.');
				}
			})
		})
		router.get('/group',  (req, res) => {
			this.userDataService.getGroupNames().then((data)=>{
			   if (data.length !== 0 && data) {
					 res.status(201).json({"userGroup": data});
					 logger.info('Get all user groups successful.');
			   }else {
					 res.status(201).json({"userGroup": data});
					 logger.warn('Get all users groups return empty data.');
			   }
		   })
	   })

		// create user api
		router.put('/manageUser', (req, res) => {
			if (!req.body) {
				logger.severe(`Create user failed: Bad request, request body is empty.`);
				return res.sendStatus(500).json({ 'error': 'invalid request' });
			}
			const userInfo = req.body.userInfo;
			let userId = userInfo.userId;
			let actionType = req.body.actionType;

			let creatUserOptions = {
				timeStamp: timeStamp,
				userId: userId,
				userName: userInfo.userName,
				password: actionType !== EDIT ? req.body.userLogin.password : '',
				mail: userInfo.mail,
				phone: userInfo.phone,
				logicUnit: userInfo.logicUnit,
				authType: req.body.authType,
				actionType: actionType
			}

			// only mssql user will save groupNames in userInfo.json
			if (userInfo.groupNames !== undefined) {
				creatUserOptions.groupNames = userInfo.groupNames;
			}

			this.userDataService.setLu(userInfo, creatUserOptions);

			// this.manageUser(req, res, creatUserOptions);
			let processOptions = {
				res: res,
				data: creatUserOptions.actionType
			};
			
			//add a new validation  
			//when adding ,there should not have the same userid, when editing , there should have the userid.
			this.userDataService.validUserId(userInfo).then((valid)=>{
				if((valid && actionType === CREATE) || (!valid && actionType === EDIT)){ 
					this.userDataService.createUser(req, res, creatUserOptions).then((pros)=>{
						this.processResult(pros,processOptions);
					}).catch(e => {
						this.processError(e, processOptions);
					});
				}else{
					logger.severe(`Create user failed: The user ID ${userId} already exists.`);
					return res.status(500).json({ message: 'user ID already exists' });
				}
			}).catch(e => {
				this.processError(e, processOptions);
			})
		});

		// delete user request
		router.delete('/deleteUser', (req, res) => {
			if (!req.body) {
				logger.severe(`Delete user failed: Bad request, request body is empty.`);
				return res.sendStatus(500).json({ 'error': 'invalid request' });
			}
			let processOptions = {
				res: res,
				data: DELETE
			};
			// const deleValues = req.query.data;
			this.userDataService.deleteUser(req, res).then((pros)=>{
				this.processResult(pros,processOptions);
			}).catch(e => {
				this.processError(e, processOptions);
			});
		});

		
        router.get('/totpUserAmount',async (req, res) => {
            try{
                const result=await bzdb.select('totpUser');
                res.status(200).json({dataLen: result.data.length});
                logger.info(`Get the totpUser content successful`);
            }catch(e){
                let message = `I/O error when read totpUser data`;
                logger.warn(`${message},${e.message}`);
                res.status(200).json({dataLen: 0});
            }
        });

		//when authType = ldap & datesource = ldap
		router.get('/totpUser',async (req, res) => {
			let filter = {};
            const userId = req.query.userId;
			if(userId){
				filter = {uid:userId};
			}
            try{
                const result=await bzdb.select('totpUser',filter);
				const data = result.data.map(d => {return {userId: d.uid}});
                res.status(200).json({text: data});
                logger.info(`search the totpUser content successful`);
            }catch(e){
                let message = `I/O error when read totpUser data`;
                logger.warn(`${message},${e.message}`);
                res.status(500).json({status: false});
            }
        });
		
        router.put('/totpUser',async (req, res) => {
			if (!req.body) {
				logger.severe(`Reset user totp MFA failed: Bad request, request body is empty.`);
				return res.sendStatus(500).json({ 'error': 'invalid request' });
			}
            try{
                let data = req.body;
                const result=await bzdb.updateOrInsert('totpUser', data);
				if(result && result.status) {
					this.logger.info(`Successfully update totp user`);
					res.status(200).json({ status: true, data: true });
				} else {
					this.logger.info(`Failed update totp user`);
					res.status(500).json(req);
				}
            }catch(e){
                let message = `I/O error when update totpUser data`;
                logger.warn(`${message},${e.message}`);
                res.status(500).json({status: false});
            }
        });
	
		router.delete('/totpUser',async (req, res) => {
            try{
                const result=await bzdb.delete('totpUser');
                res.status(200).json({status: result.status});
                logger.info(`delete the totpUser content successful`);
            }catch(e){
                let message = `I/O error when read totpUser data`;
                logger.warn(`${message},${e.message}`);
                res.status(500).json({status: false});
            }
        });

		router.delete('/totpUser/:uid',async (req, res) => {
			let filter = {};
            const uid = req.params.uid.toLowerCase();
			if(uid){
				filter = {uid:uid};
			}
            try{
                const result=await bzdb.delete('totpUser',filter);
                res.status(200).json({status: result.status});
                logger.info(`delete the totpUser content successful`);
            }catch(e){
                let message = `I/O error when read totpUser data`;
                logger.warn(`${message},${e.message}`);
                res.status(500).json({status: false});
            }
        });

		// edit group call edit user api
		router.put('/editUser', (req, res) => {
			if (!req.body) {
				logger.severe(`Edit user failed: Bad request, request body is empty.`);
				return res.sendStatus(500).json({ 'error': 'invalid request' });
			}

			this.userDataService.editUser(req, res, timeStamp);
		});

		router.put('/resetPassword', (req, res) => {
			if (!req.body) {
				logger.severe(`Reset user password failed: Bad request, request body is empty.`);
				return res.sendStatus(500).json({ 'error': 'invalid request' });
			}
			let editUserOptions = {
				timeStamp: timeStamp,
				userId: req.body.userId,
				password: req.body.password,
				actionType: req.body.actionType,
				authType: req.body.authType,
			};
			let processOptions = {
				res: res,
				data: editUserOptions.authType
			}
			this.userDataService.changePassword(req, res, editUserOptions).then((pros)=>{
				this.processResult(pros,processOptions);
			}).catch((err) => {
				this.processError(err, processOptions);
			});
		});

		router.put('/upload', (req, res) => {
			req.setTimeout(30 * 60 * 1000) // no timeout

			if (!req.body) {
				logger.severe(`Upload user failed: Bad request, request body is empty.`);
				return res.sendStatus(500).json({ 'error': 'invalid request' });
			}

			// this.createUpload(res, req, timeStamp);
			this.userDataService.importData(req, res).then((result)=>{
				if (result && result.data){
					res.status(201).json({ status: true, data: result.data });
				} else {
					res.status(500).json({ status: false, message: 'Import data err with result: ' + 
						result && result.message? result.message: JSON.stringify(result)});
				}
			},(err)=>{
				logger.severe('Upload user occurs error: ' + err.message + "; Error name:" + err.name + "; Error code:" + err.code);
				return res.sendStatus(500).json({ 'error': err });
			})

		});

		router.get('/user_list.csv', async (req, res) => {
			const name = req.query.filter;
			const username = req.query.username;
			const filterAll = req.query.filterAllData;
			const groups = await this.accessGroupObj.getAllGroups(username);
			const usersGroupNamesInfo = this.userDataService.getUsersGroupNames(groups.data);

			this.userDataService.GetAllUser(username).then(async (users)=>{
				let data = JSON.parse(JSON.stringify(Array.isArray(users) ? users : users.data));
				let values = [];

				data.forEach(d => {
					d['Group'] = usersGroupNamesInfo[d.userId] || [];
				});

				if (name) {
					if(filterAll === 'true') {
						data = data.filter(d => (Object.keys(d)).findIndex(k => (d[k] || '').toString().toLowerCase().indexOf(name.toLowerCase()) > -1) > -1);
					}  else {
						data = data.filter(d => d.userId.toLowerCase().indexOf(name.toLowerCase()) > -1)
					}
				}

				for (let d of data){
					let value = {};

					value['User ID'] = d.userId;
					value['Name'] = encodeURIComponent(d.userName);
					value['Password'] = '********';
					value['Email'] = d.mail;
					value['Phone number'] = d.phone;
					// value['Group'] = [];
					// for (let g of d.groupNames){
					// // d.groupNames.forEach(async g => {
					// 	const filter = await bzdb.select('group', {id: g});
					// 	if (filter.rowCount > 0){
					// 		value['Group'].push(filter.data[0].groupName); // There should be only 1 record returned. Because it's selecting by id.
					// 	}
					// };
					// value['Group'] = value['Group'].length ? value['Group'] : '';
					value['Group'] = usersGroupNamesInfo[d.userId] || [];
					this.userDataService.setLu(d, value);
					values.push(value);
				}

				// export headers if no data.
				if(!values.length) {
					values = [{
						'User ID': '',
						'Name': '',
						'Password': '',
						'Email': '',
						'Phone number': '',
						'Group': ''	
					}];
				}
			
				jsonexport(values, (err, csv) => {
					if(err) return logger.severe(`export user list failed: ${err}`);
					
					res.setHeader("Content-Type", "application/force-download");
					res.status(200).send(csv);
				});
			});			
		});
		
		router.put('/administrator', async (req, res) => {
			let id = 1;
			const data = req.body;
			const rs = await bzdb.select('administrator', {name: data.name});
			if (data.action && data.action === 'add' && rs.rowCount > 0){
				res.setHeader("Content-Type", "text/typescript");
				res.status(202).json({status: false, message: 'The same name already exist'});
				return;
			}
			const users = await bzdb.select('administrator');
			const timeStamp = new Date().getTime();

			if (!data.id) {
				if (users.rowCount > 0) {
					id = Math.max(...users.data.map(d => d.id)) + 1;
				  }
				  data.id = id;
				  data.timeStamp = timeStamp;
				  const password = data.password;

				  delete data['password'];
				  
				  acctSrc._addIVAndAuthToObject(data, password, (result) => {
					this.updateOrInsert(data, res);
				  });
			} else {
				const rsid = await bzdb.select('administrator', {id: data.id});
				if (data.action && data.action === 'edit' && rsid.rowCount === 0) {
					res.setHeader("Content-Type", "text/typescript");
					res.status(500).json({status: false, message: 'The data to edit doesn\'t exist'});
					return;
				} else if (data.action && data.action === 'edit' && rs.rowCount === 1 && rs.data[0]['id'] !== data.id) {
					res.setHeader("Content-Type", "text/typescript");
					res.status(500).json({status: false, message: 'The same name already exist'});
					return;
				}
				this.updateOrInsert(data, res);
			}
		});
		router.put('/adminPwd', async (req, res) => {
			const data = req.body;
			const users = await bzdb.select('administrator');

			const key = req.query.key;
			const user = users.data.find(d => d[key] === data.id);
			if (!user) {
				this.logger.warn(`Data not found`);
				res.status(202).json({ status: false, message: 'The administrator doesn\'t exixt' });
				return;
			}

			acctSrc._addIVAndAuthToObject(user, data.password, (result) => {
			  this.updateOrInsert(user, res);
			});
			
		});
		router.get('/administrator', async (req, res) => {
			const result = await bzdb.select('administrator');

			// add view session entitlment and it should be the first element in v10.1.3.3, it should be true for upgrading data
			if(result.rowCount > 0) {
				result.data.forEach(d => {
					if(d.role === 'groupAdmin' && d.entitlement.viewSession == null) {
						d.entitlement = Object.assign({viewSession: true}, d.entitlement)
					}
					if(d.role === 'groupAdmin' && d.entitlement.mgUserSession == null) {
						if(d.entitlement.mgGpSession !== null && d.entitlement.mgGpSession === false) {
							// update mgUserSession to false if mgGpSession is false after upgrading
							d.entitlement = Object.assign({mgUserSession: false}, d.entitlement);
						}else {
							d.entitlement = Object.assign({mgUserSession: true}, d.entitlement);
						} 
						
					}
				})
			}
			this.logger.info(`Successfully get administrators`);
			res.send(result);
		});

		router.delete('/administrator', async (req, res) => {
			let id = req.query.id;
			const result = await bzdb.delete('administrator', { id: id });
			id = Security.defendXSS(id)
			if (result && result.status === true){
				res.status(200).json({ 'text': 'Deleted' });
				this.logger.info(`Successfully deleted administrator "${id}"`);
			} else {
				res.status(500).json(result);
				this.logger.severe(`Delete administrator "${id}" failed: ${result && result.message || 'Exception occurs'}`);
			}
			
		});
		
	}
	/**
	 * Handle the final result
	 * @param {*} allPromistArray 
	 * @param {*} options 
	 */
	processResult(allPromistArray, options) {
		Promise.all(allPromistArray).then((value) => {
			// console.log(value);
			let status = value.every((el) => {
				if (typeof(el) === 'boolean'){
					return el
				} else if (typeof(el) === 'object') {
					return el.status
				} else {
					return el ? true : false
				}
			});
			if (status === true) {
				options.res.status(201).json({ status: true, data: options.data });
			} else {
				const errors = value.reduce((accu, curr) => { 
					return (!curr.status)? accu + (accu.length>0? ';':'') + curr.message : '';
				});
				if (typeof(errors) === 'string'){
					options.res.status(500).json({ status: false, data: options.data, message: errors});
				} else if (errors && errors.status === false){
					options.res.status(500).json({ status: false, data: options.data, message: errors.message });
				} else {
					options.res.status(500).json({ status: false, data: options.data, message: 'Unknown Error' });
				}
			}
		}, (err) => {
			this.logger.severe(err.message);
			options.res.status(500).json({ status: false, data: options.data, message: 'Error encountered'});
		})
	}

	processError(err, options) {
		options.res.status(202).json({ status: false, data: options.data, message: err.message });
	}

	updateOrInsert(data, res) {
		bzdb.updateOrInsert('administrator', data).then(req => {
			if(req && req.status) {
				this.logger.info(`Successfully updateOrInsert administrator`);
				res.status(201).json({ status: true, data: true });
			} else {
				this.logger.info(`Failed updateOrInsert administrator`);
				res.status(500).json(req);
			}
		});
	}

}

exports.userRouter = (context) => {
	return new Promise(function (resolve, reject) {
		let controller = new UserController(context);
		controller.getUserRouter();
		resolve(controller.getRouter());
	});
};