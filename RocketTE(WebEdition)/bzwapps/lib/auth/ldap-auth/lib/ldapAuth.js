"use strict";
/*
  © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
  ROCKET SOFTWARE, INC. CONFIDENTIAL
*/
const authSuper_1 = require("./../../authSuper");
const ldapHelper_1 = require("./ldapHelper");
const encryption = require("../../../zlux/zlux-proxy-server/js/encryption");
const bzdb = require('../../../../app/bzshared/lib/services/bzdb.service');
const constants = require('../../../../app/bzshared/lib/services/constants.service');
const authConfigSv = require('../../../../app/bzshared/lib/services/authConfigService');
class ldapAuthenticator extends authSuper_1.authSuper {
    constructor(pluginDef, pluginConf, serverConf) {
        super(pluginDef, pluginConf, serverConf);
        this.validateAccount = false;
        this.dataAuthentication = serverConf.dataserviceAuthentication;
        this.ldapServerConfig = {}; //Object.assign(this.ldapServerConfig={},pluginDef.configuration.getContents(['ldapServerConfig.json']))
        bzdb.select("authConfig", constants.metaDataBackupPath.ldap).then(result => {
            if (result.data && Array.isArray(result.data)) {
                this.ldapServerConfig = result.data[0];
                if (this.ldapServerConfig.key) {
                    this.ldapServerConfig.ldapManagerPassword = encryption.decryptWithKeyConstIV(this.ldapServerConfig.ldapManagerPassword, this.ldapServerConfig.key);
                }
                this.ldapClient = new ldapHelper_1.ldapHelper(this.ldapServerConfig);
            }
        });
    }
    async authenticate(request, sessionState, response) {
        request.body = Object.assign(request.body, this.getAuth(request.headers.authentication || request.headers.authorization));
        const username = request.body.username;
        const password = request.body.password;
        this.validateAccount = request.body.validate || false;
        if (request.body.isSuperadmin) {
            return this.superAdminAuthenticate(request, sessionState, response);
        }
        if (this.isMfaRequest(request)) {
            return await this.mfaAuthenticate(request, sessionState);
        }
        if (username.trim() === "" || password === "") {
            this.logger.severe('Authorization Failed : user name and password are required');
            return { success: false, message: 'Incorrect user name/password.' };
        }
        let bindResult;
        //first try to login by http header
        if (username && !password && this.dataAuthentication.isHttpHeader) {
            //check whether  is a valid user in LDAP
            if (this.ldapServerConfig && this.ldapServerConfig.ldapServerHostname) {
                try {
                    const userShortName = this.ldapClient.getUserShortName(username);
                    bindResult = await this.ldapClient.ldapAdminBind();
                    if (!bindResult.success) {
                        return Promise.resolve({ success: false, userID: userShortName, message: 'admin bind failed' });
                    }
                    else {
                        //search user in ldap and  return search result
                        const defineAttr = this.ldapServerConfig.ldapReturnAttributes === "" ? "" : this.ldapServerConfig.ldapReturnAttributes.split(",");
                        const searchResult = await this.ldapClient.ldapSearch(username, '', defineAttr);
                        if (searchResult && Object.keys(searchResult).length > 0) {
                            const ldapConfigLen = authConfigSv.setLdapConfig(request, response, JSON.stringify(searchResult));
                            if (ldapConfigLen > 0) {
                                this.logger.warn(`The user's attributes in ldap are too long to save, more than 3072. attr length after stringify is ${ldapConfigLen}`);
                            }
                            else if (ldapConfigLen === 1) {
                                this.logger.warn(`There is something wrong in encryption, the data is  ${JSON.stringify(searchResult)}`);
                            }
                            this.setSessionState(sessionState, userShortName);
                            return { success: true, isMfaEnabled: this.isMfaEnabled, mfaType: this.mfaType, retureAttr: searchResult, userID: userShortName };
                        }
                        else {
                            return Promise.resolve({ success: false, userID: userShortName, message: 'http header user does not exist in LDAP' });
                        }
                    }
                }
                catch (e) {
                    return Promise.resolve({ success: false, userID: username, message: e.message });
                }
            }
            else {
                return Promise.resolve({ success: false, userID: username, message: "Ldap configuration is missing." });
            }
        }
        // then ldap
        if (this.ldapServerConfig && this.ldapServerConfig.ldapServerHostname) {
            try {
                bindResult = await this.ldapClient.ldapClientBind(username, password);
                if (!bindResult.success) {
                    return Promise.resolve({ success: false, userID: username, message: "user bind failed" });
                }
                else {
                    const userShortName = this.ldapClient.getUserShortName(username);
                    if (this.validateAccount || !this.isMfaEnabled) {
                        this.setSessionState(sessionState, userShortName);
                    }
                    const defineAttr = this.ldapServerConfig.ldapReturnAttributes === "" ? "" : this.ldapServerConfig.ldapReturnAttributes.split(",");
                    const retureAttr = await this.ldapClient.ldapSearch(username, password, defineAttr);
                    const ldapConfigLen = authConfigSv.setLdapConfig(request, response, JSON.stringify(retureAttr));
                    if (ldapConfigLen > 0) {
                        this.logger.warn(`The user's attributes in ldap are too long to save, more than 3072. attr length after stringify is ${ldapConfigLen}`);
                    }
                    else if (ldapConfigLen === 1) {
                        this.logger.warn(`There is something wrong in encryption, the data is  ${JSON.stringify(retureAttr)}`);
                    }
                    const MFAInfoObj = await this.getMFAConfig(userShortName);
                    await this.authenticateTheCluster(request, response);
                    const authInfo = { success: true, isMfaEnabled: this.isMfaEnabled, mfaType: this.mfaType, retureAttr: retureAttr, userID: userShortName };
                    return Object.assign({}, MFAInfoObj, authInfo);
                }
            }
            catch (e) {
                return Promise.resolve({ success: false, message: e.message });
            }
        }
        else {
            return Promise.resolve({ success: false, message: "Ldap configuration is missing." });
        }
    }
}
module.exports = function (pluginDef, pluginConf, serverConf) {
    return Promise.resolve(new ldapAuthenticator(pluginDef, pluginConf, serverConf));
};
//# sourceMappingURL=ldapAuth.js.map