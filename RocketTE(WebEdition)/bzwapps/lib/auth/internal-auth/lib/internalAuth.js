"use strict";
/*
  © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
  ROCKET SOFTWARE, INC. CONFIDENTIAL
*/
const authSuper_1 = require("./../../authSuper");
//Constants definition
// const rKey = Buffer.from([45, 116, 154, 81, 215, 123, 211, 238, 143, 184, 191, 134, 142, 53, 69, 143, 192, 179, 40, 219, 10, 83, 145, 72, 199, 67, 146, 248, 2, 245, 190, 113]);
// const rIV = Buffer.from([0, 33, 80, 130, 76, 138, 194, 49, 111, 167, 21, 126, 242, 99, 37, 21]);
// const internalKey = "kGk3CfvnbqkIEyPEnrNe6fDllVByfneolThLZ47PRwgKLB";
const bzdb = require('../../../../app/bzshared/lib/services/bzdb.service');
let dataAuthentication;
/**
    Authentication and Authorization handler which manage the user accounts with json files.
*/
class internalAuthenticator extends authSuper_1.authSuper {
    constructor(pluginDef, pluginConf, serverConf) {
        super(pluginDef, pluginConf, serverConf);
        dataAuthentication = serverConf.dataserviceAuthentication;
    }
    ;
    /*
    here: pluginconf or override can have information about what user has write access to what scopes.
    if not present, they only have access to their own user.

    i think i need plugin config because:
    1. location overrides for files
    2. defaults


    i think i need the override because:
    1. someone requests account creation
    2. account creation requires a certain level of access
    3. basic authentication only covers if your credentials are what you claim they are
    4. override can say what level of access is needed for the command to be used
    */
    async authenticate(request, sessionState, response) {
        request.body = Object.assign(request.body, this.getOAuth(request.headers.authentication || request.headers.authorization));
        if (request.body.isSuperadmin) {
            return await this.superAdminAuthenticate(request, sessionState, response);
        }
        const username = request.body.username;
        const password = request.body.password;
        if (this.isMfaRequest(request)) {
            return await this.mfaAuthenticate(request, sessionState);
        }
        if (!username) {
            return { success: false, message: "Incorrect user name/password.", userName: username };
        }
        const constraints = new (bzdb.getBZDBModule().SelectConstraints)();
        constraints.addIgnoreCaseFields('username');
        const returnData = await bzdb.select('userLogin', { username: username }, constraints);
        if (returnData.rowCount > 0) {
            const userLoginData = returnData.data[0];
            if (userLoginData && userLoginData.username && userLoginData.authentication) {
                try {
                    if (dataAuthentication.isIgnorePwd || dataAuthentication.isHttpHeader) {
                        this.setRolesAndSessionState(request, sessionState, username);
                        const MFAInfoObj = await this.getMFAConfig(username);
                        const authInfo = { success: true, isMfaEnabled: this.isMfaEnabled, mfaType: this.mfaType, isIgnorePwd: dataAuthentication.isIgnorePwd, userName: username };
                        await this.authenticateTheCluster(request, response);
                        return Object.assign({}, MFAInfoObj, authInfo);
                    }
                    else if (!password) {
                        sessionState.authenticated = false;
                        this.logger.info('Authorization Failed,username:' + username + ',message: Incorrect password.');
                        return { success: false, message: "Incorrect password.", userName: username };
                    }
                    let passCheck = this.checkPassword(userLoginData, password);
                    if (passCheck) {
                        this.setRolesAndSessionState(request, sessionState, username);
                        const MFAInfoObj = await this.getMFAConfig(username);
                        const authInfo = { success: true, isMfaEnabled: this.isMfaEnabled, mfaType: this.mfaType, isIgnorePwd: dataAuthentication.isIgnorePwd, userName: username };
                        await this.authenticateTheCluster(request, response);
                        return Object.assign({}, MFAInfoObj, authInfo);
                    }
                    else {
                        sessionState.authenticated = false;
                        this.logger.info('Authorization Failed,username:' + username + ',message: Incorrect user name/password.');
                        return { success: false, message: "Incorrect user name/password.", userName: username };
                    }
                }
                catch (e) {
                    //console.error(e)
                    this.logger.severe('Authorization Failed,username:' + username + ', message: Decrypt User authentication info from login.json failed.');
                    return { success: false, message: "Decrypt User authentication info from login.json failed.", userName: username };
                }
            }
            else {
                this.logger.severe('Authorization Failed,username:' + username + ', : message: User authentication info is missing in login.json.');
                return { success: false, message: "User authentication info is missing in login.json.", userName: username };
            }
        }
        else {
            this.logger.severe('Authorization Failed,username:' + username + ', : message: Cannot find user authentication file login.json.');
            return { success: false, message: "Cannot find user authentication file login.json.", userName: username };
        }
    }
    setRolesAndSessionState(request, sessionState, username) {
        let authInfo = {
            username: username,
            roles: ''
        };
        if (this.authConfig.userRoles) {
            let userRoles = this.authConfig.userRoles[username];
            if (userRoles && userRoles.length > 0) {
                authInfo.roles = userRoles;
            }
        }
        // JSTE-1574
        if (request.body.validate || !this.isMfaEnabled) { // || (this.isMfaEnabled && this.mfaType === 'TOTP')
            this.setSessionState(sessionState, username);
        }
    }
    getOAuth(auth) {
        const account = super.getAuth(auth);
        let username = account.username;
        const index = username.indexOf('\\');
        if (dataAuthentication.isHttpHeader && index > -1) {
            account.username = username.substring(index + 1, username.length);
        }
        this.logger.debug(`currnt base64 string is: ${auth}, decode is: ${username}`);
        return account;
    }
}
module.exports = function (pluginDef, pluginConf, serverConf) {
    return Promise.resolve(new internalAuthenticator(pluginDef, pluginConf, serverConf));
};
/*
  © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
  ROCKET SOFTWARE, INC. CONFIDENTIAL
*/ 
//# sourceMappingURL=internalAuth.js.map