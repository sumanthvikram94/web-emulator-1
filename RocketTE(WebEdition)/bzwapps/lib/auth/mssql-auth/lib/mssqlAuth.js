"use strict";
/*
  © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
  ROCKET SOFTWARE, INC. CONFIDENTIAL
*/
const mssqlHelper_1 = require("./mssqlHelper");
const authSuper_1 = require("../../authSuper");
const encryption = require("../../../zlux/zlux-proxy-server/js/encryption");
const bzdb = require('../../../../app/bzshared/lib/services/bzdb.service');
const constants = require('../../../../app/bzshared/lib/services/constants.service');
class mssqlAuthenticator extends authSuper_1.authSuper {
    constructor(pluginDef, pluginConf, serverConf) {
        super(pluginDef, pluginConf, serverConf);
        this.msSQLServerConfig = {}; //Object.assign(this.msSQLServerConfig={},pluginDef.configuration.getContents(['msSQLServerConfig.json'])) 
        bzdb.select("authConfig", constants.metaDataBackupPath.mssql).then(result => {
            if (result.data && Array.isArray(result.data))
                this.msSQLServerConfig = result.data[0];
            if (this.msSQLServerConfig.key) { //decryption password
                this.msSQLServerConfig.password = encryption.decryptWithKeyConstIV(this.msSQLServerConfig.password, this.msSQLServerConfig.key);
            }
            this.msSQLHelper = new mssqlHelper_1.mssqlHelper(this.msSQLServerConfig);
            this.dataAuthentication = serverConf.dataserviceAuthentication;
        });
    }
    async authenticate(request, sessionState, response) {
        request.body = Object.assign(request.body, this.getAuth(request.headers.authentication || request.headers.authorization));
        if (request.body.isSuperadmin) {
            return this.superAdminAuthenticate(request, sessionState, response);
        }
        const username = request.body.username;
        const password = request.body.password;
        const userTable = this.msSQLServerConfig.userTable;
        const userIdField = this.msSQLServerConfig.userIdField;
        const userPasswordField = this.msSQLServerConfig.userPasswordField;
        if (this.isMfaRequest(request)) {
            return await this.mfaAuthenticate(request, sessionState);
        }
        try {
            return this.msSQLHelper.getUserInfo(userTable, userIdField, userPasswordField, username, this.msSQLServerConfig.passwordEncryptor)
                .then(async (userInfo) => {
                if (userInfo && userInfo.userId.toLowerCase() === username.toLowerCase()) {
                    try {
                        // if(this.dataAuthentication.isIgnorePwd) {
                        //   this.setSessionState(sessionState, username);
                        //   return Promise.resolve({ success: true, isMfaEnabled: this.isMfaEnabled, mfaType: this.mfaType });
                        // } else if(!password){
                        //   return Promise.resolve({ success: false, message: "password is not correct" });
                        // }
                        if (!password) {
                            return Promise.resolve({ success: false, message: "password is not correct" });
                        }
                        userInfo["authentication"] = userInfo.password;
                        let passCheck = this.checkPassword(userInfo, password);
                        if (passCheck) {
                            // JSTE-1574
                            if (request.body.validate || !this.isMfaEnabled) {
                                this.setSessionState(sessionState, username);
                            }
                            const MFAInfoObj = await this.getMFAConfig(username);
                            const authInfo = { success: true, isMfaEnabled: this.isMfaEnabled, mfaType: this.mfaType, manageData: this.msSQLServerConfig.allowManageData };
                            await this.authenticateTheCluster(request, response);
                            return Promise.resolve(Object.assign({}, MFAInfoObj, authInfo));
                        }
                        else {
                            return Promise.resolve({ success: false, message: "username or password is not correct" });
                        }
                    }
                    catch (e) {
                        return Promise.resolve({ success: false, message: e.message });
                    }
                }
                else {
                    return Promise.resolve({ success: false, message: "username or password is not correct" });
                }
            });
        }
        catch (e) {
            return Promise.resolve({ success: false, message: e.message });
        }
    }
}
module.exports = function (pluginDef, pluginConf, serverConf) {
    return Promise.resolve(new mssqlAuthenticator(pluginDef, pluginConf, serverConf));
};
