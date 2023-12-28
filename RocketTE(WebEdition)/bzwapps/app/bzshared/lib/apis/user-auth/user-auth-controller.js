'use strict';

/**
 * Name:      user-controller.js
 * Desc:      Provide api to return the sessionMode related configurations
 * Copyright: © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */
const express = require('express');
const Promise = require('bluebird');
const bodyParser = require('body-parser');
const authConfigService=require("../../services/authConfigService");
const userDataServiceMsSQL= require('../../services/userDataServiceMsSQL');
const userDataServiceFile= require('../../services/userDataServiceFile');

class UserAuthController {
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

	getUserAuthRouter() {
		const logger = this.logger;
		const router = this.router;

		const timeStamp = new Date().getTime();
		logger.info('Setup user router');
		router.use(bodyParser.json({ type: 'application/json', limit: '5mb' }));

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

}

exports.userAuthRouter=(context) => {
	return new Promise(function (resolve, reject) {
		let controller = new UserAuthController(context);
		controller.getUserAuthRouter();
		resolve(controller.getRouter());
	});
};
