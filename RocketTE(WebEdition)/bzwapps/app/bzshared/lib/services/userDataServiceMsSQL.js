'use strict';

const mssqlHelper = require('../../../../lib/auth/mssql-auth/lib/mssqlHelper.js');
const passwordEncryptor=["no","internal","BzW2hSha"];
const acctSrc = require('../../../bzshared/lib/apis/account/account-service');
class userDataServiceMsSQL {

	constructor(context, authConfigObj) {
		this.logger = context.logger;
		this.authConfigObj = authConfigObj;
		this.msSQLConfigure = authConfigObj.dataSourceConfig.implementationDefaults
		this.mssqlClient = new mssqlHelper.mssqlHelper(this.msSQLConfigure);		
		this.mssqlClient.getColumnNames(this.msSQLConfigure.userTable).then((rep) => {
			this.DbSchema = rep;
		});
	}

	printContext() {
		this.logger.info(JSON.stringify(this.context));
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
		this.logger.info('changePassword for user : ' + editUserOptions.userId);
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
	encryptionPassword(fileContentsJSON, password) {
		return new Promise((resolve, reject) => {
			acctSrc._addIVAndAuthToObject(fileContentsJSON, password, (result) => {
				return resolve(result);
			})
		})
	}

}
module.exports = {
	init(context, authConfigObj) {
		return new userDataServiceMsSQL(context, authConfigObj);
	}

};
