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
const path = require('path');
const util = require('util');
const acctSrc = require('../../../bzshared/lib/apis/account/account-service');
const constants = require('../../../bzshared/lib/apis/account/constants');
const accessGroupSrc = require('./access-group.service');
const Utiles = require('./utils.service');

const BASE_PATH = '/instance/ZLUX/pluginStorage/com.rs.bzadm';
const ADMIN_USER_PATH = '/instance/ZLUX/pluginStorage/com.rs.bzadm/users';
const USERINFO = 'userInfo_';
const USERLOGIN = 'login_';
const CREATE = 'create';
const DELETE = 'delete';
const EDIT = 'edit';
const RESET = 'reset Password';
const successData = { 'status': true, 'message': 'Successed' };
const failedData = { 'status': false, 'message': 'Failed' };
const mssqlHelper = require('../../../../lib/auth/mssql-auth/lib/mssqlHelper.js');
const passwordEncryptor=["no","internal","BzW2hSha"];
const bzdb = require('../../../bzshared/lib/services/bzdb.service');

class userDataServiceMsSQL {

	constructor(context, authConfigObj) {
		this.logger = context.logger;
		this.authConfigObj = authConfigObj;
		this.msSQLConfigure = authConfigObj.dataSourceConfig.implementationDefaults
		this.mssqlClient = new mssqlHelper.mssqlHelper(this.msSQLConfigure);		
		this.utiles = new Utiles(context);
		this.mssqlClient.getColumnNames(this.msSQLConfigure.userTable).then((rep) => {
			this.DbSchema = rep;
		});
		this.DefaultTableSchema = {
			"Base": {
				"UserId": this.msSQLConfigure.userIdField,
				"Group": this.msSQLConfigure.groupFieldName,
				"UserName": "UserName",
				"Email": "Email",
				"Phone": "Phone"
			},
			"Extend": {
				"Password": this.msSQLConfigure.userPasswordField,
				"salt": "salt",
				"iv": "iv"
			}
		};
	}

	printContext() {
		this.logger.info(JSON.stringify(this.context));
	}

	async validUserId(userInfo){ // Verify that the user exists
		const strSQL = "SELECT * FROM " + this.msSQLConfigure.userTable + " where " +this.msSQLConfigure.userIdField + " like '" + userInfo.userId + "'" ;
		const param = {};
		let recordset = await this.mssqlClient.execSql(strSQL, param);
		if (recordset && recordset.recordset.length > 0) {
			return false;
		}
		return true;
		
	}

	async GetAllUser(username) {
		const strSQL = "SELECT * FROM " + this.msSQLConfigure.userTable
		const param = {};
		let users = [];
		try {
			let recordset = await this.mssqlClient.execSql(strSQL, param);
			if (recordset && recordset.recordset.length > 0) {
				recordset.recordset.forEach(record => {
					let userObj = {
						groupNames:record[this.msSQLConfigure.groupFieldName]?record[this.msSQLConfigure.groupFieldName].split(","):[],
						mail: record.Email || '',
						phone: record.Phone || '',
						userId: record[this.msSQLConfigure.userIdField] || '',
						userName: record.UserName || '',
					};
					this.setLu(record, userObj);
					users.push(userObj);
				});
			}

			if(username !== 'superadmin') {
				const admin = await bzdb.select('administrator', {name: username});
				const data = admin.rowCount > 0 ? admin.data[0] : {};

				if(data.role === 'groupAdmin') {
					const accessGroups = await bzdb.select('group');

					if(this.authConfigObj.isAllowDefaultGroup) {
						if(data.group.indexOf('Default Group') > -1) {
							return users;
						} else {
							return [];
						}	
					}
					
					const msGroups = accessGroups.data.map(d => d.mssqlUsers); // get mssqlUsers in groups
					const ids = accessGroups.data.map(d => d.id); // get groups id.
					const groups = (data.isAll ? ids : data.group).map(d => { // administrator group map to mssqlUser groups
					  const index = ids.findIndex(id => id === d);
			  
					  return index > -1 ? msGroups[index] : d;
					});
				   
					const filters = users.filter(d => {
						return d.groupNames.findIndex(g => {
						  return groups.findIndex(m => m.indexOf(g) > -1) > -1;
						}) > -1;
					});
					const others = users.filter(d => {
						return d.groupNames.findIndex(g => {
						  return groups.findIndex(m => m.indexOf(g) < 0) < 0;
						}) < 0;
					}).map(d => {
						return {
							userId: d.userId,
							groupNames: d.groupNames
						}
					});
					
					const uniGroups = [].concat(...groups);
					const trimGroups = uniGroups.map(d => d.trim());
					const gpSets = new Set(trimGroups);

					return {
						isGpAdmin: true,
						users: filters,
						groups: Array.from(gpSets).filter(d => d !== ''),
						others

					}
				}
			}
			return users;
		} catch (err) {
			this.logger.info('GetAllUser() sql statement: ' + strSQL);
			this.logger.severe('GetAllUser() occurs error: ' + err.message+"; Error name:"+err.name +"; Error code:"+err.code);
			return users;
		}
	}
	async GetAllUserbyID(userID) {
		const strSQL = "SELECT"
			+　" ["+ this.msSQLConfigure.userIdField+"] AS UserId"
			+　",["+this.msSQLConfigure.groupFieldName+"] AS UserGroup"
			+　"," + "UserName,Email,Phone"
			+ " FROM " + this.msSQLConfigure.userTable
			+ " WHERE UserId=@userId"
		const param = {
			["userId"]: userID,
		};
		try {
			let recordset = await this.mssqlClient.execSql(strSQL, param);
			let users = [];
			if (recordset && recordset.recordset.length > 0) {
				recordset.recordset.forEach(record => {
					let userObj = {
						groupNames: record.UserGroup?record.UserGroup.split(","):[],
						mail: record.Email,
						phone: record.Phone,
						userId: record.UserId,
						userName: record.UserName,
					};
					this.setLu(record, userObj);
					users.push(userObj);
				});
			}
			return users;
		} catch (err) {
			this.logger.info('GetAllUserbyID() sql statement: ' + strSQL);
			this.logger.severe('GetAllUserbyID() occurs error: ' + err.message+"; Error name:"+err.name +"; Error code:"+err.code);
			return users;
		}
	}
	async createUser(req, res, userObj) {
		let timeStamp = userObj.timeStamp;
		let userId = userObj.userId;
		let password = userObj.password;
		let strSQL,param;
		let fileContentsJSON = {
			timeStamp: timeStamp,
			username: userId
		};
		if(!this.checkCreateField()){  //user table is not meet the requirment
			this.logger.severe('error, createUser() occurs error: user table is not meet the requirment;');
			return Promise.resolve([false]);
		}
		if (userObj.actionType === CREATE) {
			let passwordObj={
				authentication:password,
				salt:"",
				iv:"",
			}
			if(this.msSQLConfigure.userPasswordField!==""){
				// Encrypt the password
				if (this.msSQLConfigure.passwordEncryptor && this.msSQLConfigure.passwordEncryptor === passwordEncryptor[1]) {
					passwordObj = await this.encryptionPassword(fileContentsJSON, password);
				} else if (this.msSQLConfigure.passwordEncryptor && this.msSQLConfigure.passwordEncryptor === passwordEncryptor[2]) {
					passwordObj.authentication = acctSrc._encryptWithSHA1(password);
				}
				if(!this.checkPasswordField()){  //user table is not meet the requirment
					this.logger.severe('error, createUser() occurs error: user table is not meet password requirment;');
					return Promise.resolve([false]);
				}
				 strSQL = "INSERT INTO " + this.msSQLConfigure.userTable
				+ this.getColumns(userObj)
				+ ") VALUES " + this.getValues(userObj);
				 param = {
					["userId"]: userObj.userId,
					["password"]: passwordObj.authentication,
					["UserName"]: userObj.userName,
					["mail"]: userObj.mail,
					["groupNames"]: userObj.groupNames.toString(),
					["phone"]: userObj.phone,
					["salt"]: passwordObj.salt,
					["iv"]: passwordObj.iv
				};
			}else{
				 strSQL = "INSERT INTO " + this.msSQLConfigure.userTable
				 + this.getColumns(userObj)
				+ ") VALUES " + this.getValues(userObj)
				 param = {
					["userId"]: userObj.userId,
					["UserName"]: userObj.userName,
					["mail"]: userObj.mail,
					["groupNames"]: userObj.groupNames.toString(),
					["phone"]: userObj.phone
				};	
			}
			this.setLu(userObj, param, true);
			return new Promise((resolve, reject) => {
				this.mssqlClient.execSql(strSQL, param).then((recordset) => {
					if (recordset && recordset.rowsAffected.length > 0) {
						resolve([true]);
					} else {
						resolve([false]);
					}
				})
				.catch(err => {
					this.logger.info('createUser() sql statement: ' + strSQL);
					this.logger.severe('createUser() occurs error: ' + err.message+"; Error name:"+err.name +"; Error code:"+err.code);
					resolve([false]);
				});
			})

		} else if (userObj.actionType === EDIT) {
			return this.updateUser(req, res, userObj)
		}
	}

	setLu(originObj, newObj, createColMode) {
		const keys = Object.keys(originObj);
		const luKeys = keys.filter(d => this.utiles.isValidUserLuKeyFormat(d));

		luKeys.forEach(d => {
			newObj[createColMode ? [d] : d] = originObj[d]
		});
	}

	getColumns(userObj) {
		const luKeys = Object.keys(userObj).filter(d => this.utiles.isValidUserLuKeyFormat(d));
		const value = luKeys.join('],[');

		if(this.msSQLConfigure.userPasswordField !== ""){
		  return ` ([${this.msSQLConfigure.userIdField}],[${this.msSQLConfigure.userPasswordField}],[UserName],[Email],[${this.msSQLConfigure.groupFieldName}],[Phone],[salt],[iv],[${value}]`
		} else {
			return ` ([${this.msSQLConfigure.userIdField}],[UserName],[Email],[${this.msSQLConfigure.groupFieldName}],[Phone],[${value}]`
		}

	}

	getValues(userObj) {
		const luKeys = Object.keys(userObj).filter(d => this.utiles.isValidUserLuKeyFormat(d));
		const value = luKeys.join(',@');
		
		if(this.msSQLConfigure.userPasswordField!==""){
			return `(@userId,@password,@UserName,@mail,@groupNames,@phone,@salt,@iv,@${value})`
		  } else {
			  return `(@userId,@UserName,@mail,@groupNames,@phone,@${value})`
		  }
  
	}

	updateColumns(userObj) {
		const luKeys = Object.keys(userObj).filter(d => this.utiles.isValidUserLuKeyFormat(d));
		const value = luKeys.map(d => `[${d}]=@${d}`).join(', ');

		return `[UserName]=@UserName, [Email]=@mail, [Phone]=@phone, [${this.msSQLConfigure.groupFieldName}]=@groupNames, ${value}`;
	}

	async updateUser(req, res, userObj) {
		const strSQL = "UPDATE " + this.msSQLConfigure.userTable + " SET "
		     + this.updateColumns(userObj)
			+ " WHERE "+this.msSQLConfigure.userIdField +"=@userId;";
			
		const param = {
			["UserName"]: userObj.userName,
			["mail"]: userObj.mail,
			["phone"]: userObj.phone,
			["groupNames"]: userObj.groupNames.toString(),
			["userId"]: userObj.userId,
		};
		this.setLu(userObj, param, true);
		return new Promise((resolve, reject) => {
			this.mssqlClient.execSql(strSQL, param).then((recordset) => {
				if (recordset && recordset.rowsAffected.length > 0) {
					resolve([true]);
				} else {
					resolve([false]);
				}
			})
			.catch(err => {
				this.logger.info('updateUser() sql statement: ' + strSQL);
				this.logger.severe('updateUser() occurs error: ' + err.message+"; Error name:"+err.name +"; Error code:"+err.code);
				resolve([false]);
			});
		})

	}
	async deleteUser(req, res) {
		const userId = req.query.data;
		const strSQL = "DELETE FROM " + this.msSQLConfigure.userTable
			+ " WHERE " + this.msSQLConfigure.userIdField + "=@userId"
		const param = { ["userId"]: userId };
		try {
			let recordset = await this.mssqlClient.execSql(strSQL, param);
			let privilegeGroups = [];
			if (recordset && recordset.rowsAffected.length > 0) {
				return Promise.resolve([true]);
			} else {
				return Promise.resolve([false]);

			}
		} catch (err) {
			this.logger.info('deleteUser() sql statement: ' + strSQL);
			this.logger.severe('deleteUser() occurs error: ' + err.message+"; Error name:"+err.name +"; Error code:"+err.code);
			return Promise.resolve([false]);
		}

	}
	// async editUser(){

	// }
	async importData(req, res){
		//todo
		return Promise.resolve([false]);
		console.log("not support");
	 }
	async changePassword(req, res, editUserOptions) {
		let fileContentsJSON = {
			timeStamp: editUserOptions.timeStamp,
			username: editUserOptions.userId
		};
		let passwordObj={
			authentication:editUserOptions.password,
			salt:"",
			iv:"",
		}
		if (this.msSQLConfigure.passwordEncryptor && this.msSQLConfigure.passwordEncryptor === passwordEncryptor[1])
		{
			passwordObj = await this.encryptionPassword(fileContentsJSON, editUserOptions.password);
		}else if (this.msSQLConfigure.passwordEncryptor && this.msSQLConfigure.passwordEncryptor === passwordEncryptor[2])
		{
			passwordObj.authentication = acctSrc._encryptWithSHA1(password);
		}
		const strSQL = "UPDATE " + this.msSQLConfigure.userTable + " SET"
			+ " ["+this.msSQLConfigure.userPasswordField+"]=@Password,"
			+ " [salt]=@salt,"
			+ " [iv]=@iv"
			+ " WHERE "+ this.msSQLConfigure.userIdField+"=@userId;"
		const param = {
			["Password"]: passwordObj.authentication,
			["salt"]: passwordObj.salt,
			["iv"]: passwordObj.iv,
			["userId"]: editUserOptions.userId,
		};
		return new Promise((resolve, reject) => {
			this.mssqlClient.execSql(strSQL, param).then((recordset) => {
				if (recordset && recordset.rowsAffected.length > 0) {
					resolve([true]);
				} else {
					reject([false]);
				}
			})
			.catch(err => {
				this.logger.info('changePassword() sql statement: ' + strSQL);
				this.logger.severe('changePassword() occurs error: ' + err.message+"; Error name:"+err.name +"; Error code:"+err.code);
				resolve([false]);
			});

		})
	}

	async getGroupNames() {
		const strSQL = "SELECT TOP 2000 * FROM (SELECT DISTINCT  [" + this.msSQLConfigure.groupFieldName + "] as groupName FROM " + this.msSQLConfigure.userTable+" ) a WHERE a.groupName!=''"
		const param = {};
		let groupNames = [];
		try {
			let recordset = await this.mssqlClient.execSql(strSQL, param);
			if (recordset && recordset.recordset.length > 0) {
				recordset.recordset.forEach(record => {
					groupNames.push(record["groupName"]);
				});

			}
		} catch (err) {
			this.logger.info('getGroupNames() sql statement: ' + strSQL);
			this.logger.severe('getGroupNames() occurs error: ' + err.message + "; Error name:" + err.name + "; Error code:" + err.code);
		}
		return groupNames;
	}

	encryptionPassword(fileContentsJSON, password) {
		return new Promise((resolve, reject) => {
			acctSrc._addIVAndAuthToObject(fileContentsJSON, password, (result) => {
				return resolve(result);
			})
		})
	}

	existField(fieldName){
		if(this.DbSchema && this.DbSchema.length>0){
			return this.DbSchema.filter(item=>item.toLowerCase()===fieldName.toLowerCase()).length>0?true:false;
		}else{
			return true;
		}
		
	}
	checkCreateField(){
		for (let field in this.DefaultTableSchema.Base) {
			if(!this.existField(this.DefaultTableSchema.Base[field])){
				this.logger.info('checkCreateField(); field ' +field+' is not exist!');
		 		return false;
			}
		}
		return true;
	}
	checkPasswordField(){
		for (let field in this.DefaultTableSchema.Extend) {
			if(!this.existField(this.DefaultTableSchema.Extend[field])){
				this.logger.info('checkPasswordField(); field ' +field+' is not exist!');
		 		return false;
			}
		}
		return true;
	}



}
module.exports = {
	init(context, authConfigObj) {
		return new userDataServiceMsSQL(context, authConfigObj);
	}

};
