'use strict';

const acctSrc = require('../../../bzshared/lib/apis/account/account-service');

const bzdb = require('../../../bzshared/lib/services/bzdb.service');

class userDataServiceFile {

	constructor(context, authConfigObj) {
		this.context = context;
		this.logger = context.logger;
		this.authConfigObj = authConfigObj;
		this.basePath = this.context.plugin.server.config.user.instanceDir;

	}


	async changePassword(req, res, editUserOptions) {
		const constraints = new (bzdb.getBZDBModule().SelectConstraints)();
		constraints.addIgnoreCaseFields('username');
		//search the user id if exists
		const userLoginData = (await bzdb.select('userLogin', {username: editUserOptions.userId},constraints)).data[0]; 
		if (userLoginData) {
			editUserOptions.userId = userLoginData.username;
		}
		this.logger.info('changePassword for user : ' + editUserOptions.userId);
		return this.resetPassword(req, res, editUserOptions);
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
	 * create user login file
	 * @param {*} res 
	 * @param {*} req 
	 * @param {object} creatUserOptions all data
	 */
	async createUserLogin(creatUserOptions) {
		const userLoginValue = await this.getUserLoginValue(creatUserOptions);
		let dataEntityName = 'userLogin';
		let userId = creatUserOptions.userId;
		this.logger.info('createUserLogin() file data: ' + userLoginValue);
		try {
			return await bzdb.updateOrInsert(dataEntityName, userLoginValue);
		} catch (err) {
			this.logger.severe('createUserLogin() occurs error: ' + err.message + "; Error name:" + err.name + "; Error code:" + err.code);
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

}
module.exports = {
	init(context, authConfigObj) {
		return new userDataServiceFile(context, authConfigObj);
	}

};