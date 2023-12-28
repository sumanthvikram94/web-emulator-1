"use strict";
/*
  © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
  ROCKET SOFTWARE, INC. CONFIDENTIAL
*/
const encryption = require("../../../zlux/zlux-proxy-server/js/encryption.js");
const authSuper_1 = require("./../../authSuper");
// import Oauth = require('../../../../app/bzshared/lib/services/oauth.service');
//Constants definition
const bzdb = require('../../../../app/bzshared/lib/services/bzdb.service');
const constants = require('../../../../app/bzshared/lib/services/constants.service');
const authConfigSv = require('../../../../app/bzshared/lib/services/authConfigService');
class ssoAuthenticator extends authSuper_1.authSuper {
    constructor(pluginDef, pluginConf, serverConf) {
        super(pluginDef, pluginConf, serverConf);
        this.authConfig = {
            userRoles: pluginDef.configuration.getContents(['userRoles.json']),
            roleDefinitions: pluginDef.configuration.getContents(['roleDefinitions.json']),
            resources: pluginDef.configuration.getContents(['resources.json']),
            ssoServerConfig: {} //Object.assign({}, pluginDef.configuration.getContents(['ssoServerConfig.json']))
        };
        bzdb.select("authConfig", constants.metaDataBackupPath.sso).then(data => {
            if (data && Array.isArray(data))
                this.authConfig.ssoServerConfig = data[0];
        });
        // const context = {
        //   logger: this.logger,
        //   plugin: {
        //     pluginDef: pluginDef,
        //     server: {
        //       config: serverConf
        //     }
        //   }
        // }
        // this.oauth = new Oauth(context);
    }
    // /*access requested is one of GET,PUT,POST,DELETE*/
    // authorized(request, sessionState): Promise<object> {
    //   var userName = sessionState.username || sessionState.userName;
    //   if (request.path === '/login' || request.path == '/assert' || request.path == '/logout') {
    //     return Promise.resolve({ authenticated: true, authorized: true });
    //   }
    //   if (userName) {
    //     var userRoles = this.authConfig.userRoles[userName];
    //     var resourceAccess = this.getResourceAccess(request, this.authConfig.resources);
    //     if (resourceAccess) {
    //       var roles = resourceAccess.roles;
    //       if (roles) {
    //         //sort to optimize later
    //         for (var i = 0; i < roles.length; i++) {
    //           if (roles[i] == '*') {
    //             return Promise.resolve({ authenticated: true, authorized: true });
    //           }
    //           else if (userRoles) {
    //             for (var j = 0; j < userRoles.length; j++) {
    //               if (roles[i] == userRoles[j]) {
    //                 return Promise.resolve({ authenticated: true, authorized: true });
    //               }
    //             }
    //           }
    //         }
    //       }
    //       var users = resourceAccess.users;
    //       if (users) {
    //         //sort to optimize later
    //         for (var i = 0; i < users.length; i++) {
    //           if (users[i] == userName) {
    //             request.username = userName;
    //             return Promise.resolve({ authenticated: true, authorized: true });
    //           }
    //           else if (users[i] == '*') {
    //             request.username = userName;
    //             return Promise.resolve({ authenticated: true, authorized: true });
    //           }
    //         }
    //       }
    //     } else {
    //       return Promise.resolve({
    //         authenticated: false,
    //         authorized: false,
    //         message: "Resource was not found"
    //       });
    //     }
    //   } else if (request.headers['cluster-auth-token'] && request.headers['master-node']) {
    //     if (request.headers['cluster-auth-token'] == this.oauth.getDefaultTokenBase64()) {
    //       request.username = request.headers['username'];
    //       return Promise.resolve({ authenticated: true, authorized: true });
    //     } else {
    //       return Promise.resolve({ authenticated: false, authorized: false });
    //     }
    //   } else {
    //     return Promise.resolve({
    //       authenticated: false,
    //       authorized: false,
    //       message: "Username was not found"
    //     });
    //   }
    //   return Promise.resolve({
    //     authenticated: false,
    //     authorized: false,
    //     message: "Unknown Error"
    //   });
    // }
    async authenticate(request, sessionState, response) {
        if (request.body.isSuperadmin) {
            request.body = Object.assign(request.body, this.getAuth(request.headers.authentication || request.headers.authorization /*BZ-21512*/));
            this.logger.log(this.logger.FINEST, 'SAML login body: ' + JSON.stringify(request.body));
            return this.superAdminAuthenticate(request, sessionState, response);
        }
        else {
            request.body = request.headers.type === 'sso' ? Object.assign(request.body, this.getSsoAuth(request.headers.authentication, request.headers?.cookie)) : Object.assign(request.body, this.getAuth(request.headers.authorization));
            this.logger.log(this.logger.FINEST, 'SAML login body: ' + JSON.stringify(request.body));
        }
        if (!request.body.authentication) {
            this.logger.warn('Authentication failed');
            return Promise.resolve({ success: false });
        }
        const userName = request.body.username;
        let result = encryption.decryptWithKeyAndIV(request.body.authentication, encryption.rKey, encryption.rIV);
        this.logger.log(this.logger.FINEST, 'userName: ' + userName);
        this.logger.log(this.logger.FINEST, 'Decrypted userName: ' + result);
        if (userName === result) {
            this.setSessionState(sessionState, userName);
            // sessionState.username = userName;
            // sessionState.authenticated = true;
            this.logger.info('sessionState.username: ' + sessionState.userName);
            // authConfig.setSsoAssert(''); // delete sso assert info after the first second authentication to login RTE Web.
            authConfigSv.clearSsoAssert(response);
            await this.authenticateTheCluster(request, response);
            return Promise.resolve({ success: true });
        }
        else {
            this.logger.warn('Authentication failed');
            return Promise.resolve({ success: false });
        }
    }
    getSsoAuth(auth, cookieHeader) {
        if (!auth || auth.indexOf('Basic') == -1) {
            return {
                username: '',
                authentication: ''
            };
        }
        let authStr = Buffer.from(auth.substring(6), 'base64').toString('ascii');
        let authArr = authStr.split(':');
        const authentication = authConfigSv.getSsoAssert(cookieHeader); // get sso assert from auth service
        return {
            username: authArr[0],
            authentication
        };
    }
}
module.exports = function (pluginDef, pluginConf, serverConf) {
    return Promise.resolve(new ssoAuthenticator(pluginDef, pluginConf, serverConf));
};
//# sourceMappingURL=ssoAuth.js.map