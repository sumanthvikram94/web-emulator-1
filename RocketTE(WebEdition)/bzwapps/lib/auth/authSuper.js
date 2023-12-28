"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/*
  © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
  ROCKET SOFTWARE, INC. CONFIDENTIAL
*/
const fs = require('fs-extra');
const path = require('path');
const rKey = Buffer.from([45, 116, 154, 81, 215, 123, 211, 238, 143, 184, 191, 134, 142, 53, 69, 143, 192, 179, 40, 219, 10, 83, 145, 72, 199, 67, 146, 248, 2, 245, 190, 113]);
const rIV = Buffer.from([0, 33, 80, 130, 76, 138, 194, 49, 111, 167, 21, 126, 242, 99, 37, 21]);
const internalKey = "kGk3CfvnbqkIEyPEnrNe6fDllVByfneolThLZ47PRwgKLB";
const encryption = require('../../lib/zlux/zlux-proxy-server/js/encryption.js');
var zluxUtil = require("../zlux/zlux-proxy-server/js/util.js");
const duo_web = require('./node_modules/@duosecurity/duo_web');
const Oauth = require('../../app/bzshared/lib/services/oauth.service');
const ClusterRequest = require('../../app/bzshared/lib/services/cluster-request.service');
const bzdb = require('../../app/bzshared/lib/services/bzdb.service');
const request = require('request');
const {Secret, TOTP} = require ("otpauth");
const jwt = require('jsonwebtoken');
const akey = 'v4-uuid-2e56abd8-b9e5-4d15-9f63-f03d809c816d';// v4 uuid used for duo sign request; need to be at least 40 characters
const isAutoScalingCluster = process.env.RTEW_CLUSTER_AUTO_SCALING_ENABLED === 'true' && process.env.RTEW_CLUSTER_ENABLED !== 'false'
var authSuper = /** @class */ (function () {
    function authSuper(pluginDef, pluginConf, serverConf) {
        this.authConfig = {};
        this.userNameAnonymous = '_anonymous_access';
        this.logger = zluxUtil.loggers.authLogger;
        this.serverConfiguration = serverConf;
        this.verify = false;
        if (pluginDef.configuration) {
            this.authConfig = {
                userRoles: pluginDef.configuration.getContents(['userRoles.json']),
                roleDefinitions: pluginDef.configuration.getContents(['roleDefinitions.json']),
                resources: pluginDef.configuration.getContents(['resources.json'])
            };
        }
        let dataAuth = this.serverConfiguration.dataserviceAuthentication;
        this.isAAA = dataAuth.isAnonymousAccessAllowed || false;
        let twoFactorAuth = dataAuth.twoFactorAuthentication || {};
        this.isMfaEnabled = twoFactorAuth ? twoFactorAuth.enabled : false;
        this.mfaType = twoFactorAuth && twoFactorAuth.defaultType || '';
        const context = {
            logger: this.logger,
            plugin: {
                pluginDef: pluginDef,
                server: {
                    config: serverConf
                }
            }
        }
        this.oauth = Oauth;
        this.clusterRequest = new ClusterRequest(context);
        // first, sessionTimeoutMs comes from adminConfig. then from zluxserver.json.
        this.sessionTimeoutMs = serverConf.adminConfig?.node?.sessionTimeoutMs || serverConf.node.session?.cookie?.timeoutMS || 60 * 60 * 1000;
        if(this.isMfaEnabled && this.mfaType === 'TOTP'){
            this.totpConfig = this.serverConfiguration.dataserviceAuthentication.twoFactorAuthentication.TOTP.config
            this.totpConfig = Object.assign({label:'Rocket Terminal Emulation'},this.totpConfig)
        }
    }

    // authSuper.prototype.checkSlaveUserState = async function (sessionState, username) {
    //     try{
    //         const result = await this.clusterRequest.verifyUserStateOnMaster(username);
    //         this.logger.log(this.logger.FINE, 'User State verification on primary node returns: ' + result);
    //         const resultObj = JSON.parse(result);
    //         if (resultObj.status){
    //             return {authenticated:true, authorized: true};
    //         }else{
    //             this.logger.warn('Secondary node user state check failed: ' + resultObj.message);
    //             return {authenticated: false, authorized: false};
    //         }
    //     }catch(e){
    //         this.logger.warn('Secondary node user state check error: ' + e.stack? e.stack: e.message);
    //         return {authenticated: false, authorized: false};
    //     }
    // };

    authSuper.prototype.getStatus = async function (sessionState, req, res) {
        // if (this.pluginID === 'com.rs.slaveAuth'){
        //     if (!req.query.username){
        //         this.logger.warn('Username not provided in secondary node request');
        //         return {authenticated: false};
        //     }
        //     try{
        //         const result = await this.checkSlaveUserState(sessionState, req.query.username);
        //         if (result){
        //             return result;
        //         }else{
        //             return {authenticated: false};
        //         }
        //     }catch (e){
        //         this.logger.severe(e.stack? e.stack: e.message);
        //         return {authenticated: false};
        //     }
        // }
        if(isAutoScalingCluster){
            const username = await this.getClusterAuthUsername(req,res);
            return {
                authenticated: !!username && req.query.username === username,
                username: req.query.username,
                isMfaEnabled: this.isMfaEnabled,
                mfaType: this.mfaType
            };
        }
        if(req.query.username && sessionState.userName && req.query.username!=sessionState.userName){  //check userName whether equle the session user
            return {
                authenticated: false,
                username: sessionState.userName
            };
        }
        this.verify = req ? req.query.type === 'verify' : false;

        const isAAA = this.verify || this.isAAA;
        const role = req.query.type;
        const sessionRole = sessionState.roles;
        const authenticated = (['administrator','superadmin','group administrator'].indexOf(sessionRole) > -1 && role === 'bza') 
          || (sessionRole === 'user' && role === 'bzw'); // role === 'user', checked by bzw; role === 'administrator' checked by bza

        // login username is different between bzw and bza when no auth
        // const userName = sessionState.roles === 'superadmin' ? 'superadmin' : this.userNameAnonymous;
        // JSTE-16410, above logic will make userName always is _anonymous_access when none auth if role is administrator and group administrator, the below is fixes for JSTE-16410.
        let userName = '';
        if(sessionState.roles === 'superadmin'){
            userName = 'superadmin';
        } else if(sessionState.roles === 'administrator' || sessionState.roles === 'group administrator') {
            userName = sessionState.userName;
        } else {
            userName = this.userNameAnonymous;
        }
        
        return {
            authenticated: isAAA ? true : (authenticated ? !!sessionState.authenticated : false),
            username: isAAA ? userName : sessionState.userName,
            isMfaEnabled: this.isMfaEnabled,
            mfaType: this.mfaType
        };
    };
    /*access requested is one of GET,PUT,POST,DELETE*/
    authSuper.prototype.authorized = async function (request, sessionState, response) {
        // Web socket connection should never timeout...
        if (request.path === '/.websocket' || request.path === '/download/.websocket'){ 
            return { authenticated: true, authorized: true };
        }

        // When server is slave, and master node is noAuth
        if (request.headers && request.headers['isnoauth'] && request.headers['isnoauth'] === 'true' && request.headers.username === this.userNameAnonymous){
            this.setSessionState(sessionState, this.userNameAnonymous, 'user');
            request.username = request.headers['username'];
            return { authenticated: true, authorized: true};
        }
        // if (this.pluginID === 'com.rs.slaveAuth'){
        //     if (!request.headers.username){
        //         this.logger.warn('Username not provided in secondary node request');
        //         return { authenticated: false, authorized: false };
        //     }
        //     this.logger.log(this.logger.FINE, 'Authorization check for user ' + request.headers.username + ' on secondary node');
        //     try{
        //         const result = await this.checkSlaveUserState(sessionState, request.headers.username);
        //         if (result){
        //             // sessionState.userName = request.headers.username;
        //             // sessionState.authenticated = true;
        //             // JSTE-2781: User Validation always pops when Slave Node server config TLS service
        //             request.username = request.headers.username;
        //             return result;
        //         }else{
        //             return { authenticated: false, authorized: false };
        //         }
        //     }catch (e){
        //         this.logger.severe(e.stack? e.stack: e.message);
        //         return { authenticated: false, authorized: false };
        //     }
        // }

        var userName = sessionState.userName;
      
        if(!userName){
            if(this.isAAA || this.verify){
                request.username = this.userNameAnonymous;
                userName=this.userNameAnonymous;
            }
        }

        // for sso auth
        if (this.pluginID === 'com.rs.ssoAuth') {
            if (request.path === '/login' || request.path == '/assert' || request.path == '/logout') {
                return Promise.resolve({ authenticated: true, authorized: true });
            }
        }

        const verifybeforeAAA = request.headers.username === this.userNameAnonymous && sessionState.userName === 'superadmin';
        // JSTE-2405 Session expired between bzadmin and bzw: verify bzw api if don't refresh page.
        if (request.headers.username && userName && request.headers.username != undefined &&
             request.headers.username.toLowerCase() !== userName.toLowerCase() && 
             !verifybeforeAAA) {
            this.logger.warn('Authorization Failed : sessionState of user '+request.headers.username +' has been covered by ' + userName +';URL:'+ request.baseUrl);
            request.username = '';
            userName = '';
        } else if(verifybeforeAAA) {
            this.setSessionState(sessionState, this.userNameAnonymous, 'user');
            userName = this.userNameAnonymous;
        }

        if (userName) {
            // when use custom administrator login, should base on sessionState.roles.
            var userRoles = this.authConfig.userRoles[userName] || [sessionState.roles]; 
            // var resourceAccess = this.authConfig.resources[resourceName];
            var resourceAccess = this.getResourceAccess(request, this.authConfig.resources);
            const admin = await bzdb.select('administrator', {name: userName});

            if (resourceAccess) {
                var roles = resourceAccess.roles;
                let authenticated = false;

                if (sessionState.roles === 'superadmin' || sessionState.roles === 'administrator') {
                    authenticated = true;
                } else if(admin.rowCount > 0 && resourceAccess.roles) {
                    if(resourceAccess.roles.indexOf('group administrator') > -1) {
                        authenticated = true;
                    } else {
                        let entitlements = [];

                        if(admin.data[0].entitlement) {
                            Object.keys(admin.data[0].entitlement).forEach(e => {
                                if(admin.data[0].entitlement[e]) {
                                    entitlements.push(e);
                                }
                            });
                            if(resourceAccess.entitlements){
                                authenticated = resourceAccess.entitlements.some(d => {
                                    return entitlements.findIndex(e => e === d) > -1;
                                });
                            }
                            
                        }
                    }
                }
               
                if (roles) {
                    //sort to optimize later
                    for (var i = 0; i < roles.length; i++) {
                        if (roles[i] == '*') {
                            return { authenticated: true, authorized: true};
                        }
                        else if (userRoles) {
                            for (var j = 0; j < userRoles.length; j++) {
                                if (roles[i] == userRoles[j]) {
                                    return { authenticated: true, authorized: true};
                                } else if (userRoles[j] === 'group administrator' && roles[i] != userRoles[j]) {
                                    // group administrator which set specil promise to handle bza.
                                    return { authenticated: authenticated, authorized: authenticated};
                                }
                            }
                        }
                    }
                }
                var users = resourceAccess.users;
                if (users) {
                    //sort to optimize later
                    for (var i = 0; i < users.length; i++) {
                        if (users[i] == userName) {
                            request.username = userName;
                            return { authenticated: true, authorized: true };
                        }
                        else if (users[i] == '*') {
                            request.username = userName;
                            return { authenticated: true, authorized: true };
                        }
                    }
                }
            }
            else {
                this.logger.warn('Authorization Failed : resource not found for user ' + userName +',URL:'+ request.baseUrl);
                return {
                    authenticated: false,
                    authorized: false,
                    message: "Resource was not found"
                };
            }
        }
        // else if (this.isAAA || this.verify) {
        //     // sessionState.userName = userNameAnonymous;
        //     // sessionState.authenticated = true;
        //     request.username = this.userNameAnonymous;
        //     return Promise.resolve({
        //         authenticated: true,
        //         authorized: true,
        //         message: "Working in anonymous mode."
        //     });
        // }
         else if (request.headers['cluster-auth-token'] && request.headers['master-node']) {
            if (request.headers['cluster-auth-token'] == this.oauth.getDefaultTokenBase64()){
                request.username = request.headers['username'];
                return { authenticated: true, authorized: true };
            } else {
                return { authenticated: false, authorized: false };
            }
        }
        else if (request.headers['rte-api-token']) {
            const authenticated =  this.oauth.verifyAPIHeader(request);

            return { authenticated: authenticated, authorized: authenticated };
        }
        // else if (this.pluginID === 'com.rs.slaveAuth' && request.headers.username){
        //     this.logger.info('Authorization check for user ' + request.headers.username + 'on secondary node');
        //     try{
        //         const result = await this.verifyUserStatusFromMaster(sessionState, request.headers.username);
        //         if (result){
        //             sessionState.userName = request.headers.username;
        //             sessionState.authenticated = true;
        //             return { authenticated: true, authorized: true };
        //         }else{
        //             return { authenticated: false, authorized: false };
        //         }
        //     }catch (e){
        //         this.logger.severe(e.stack? e.stack: e.message);
        //         return { authenticated: false, authorized: false };
        //     }
        // }
        else {
            if(isAutoScalingCluster) {
                const username = await this.getClusterAuthUsername(request, response);
                if (username) {
                    request.username = username;
                    return { authenticated: true, authorized: true };
                }
            }
           
            this.logger.warn('Authorization Failed : no userName in sessionState,URL is'+ request.originalUrl || request.baseUrl);
            return {
                authenticated: false,
                authorized: false,
                message: "Missing username or password"
            };
        }
        return {
            authenticated: false,
            authorized: false,
            message: "Unknown Error"
        };
    };
    
    authSuper.prototype.getResourceAccess = function (request, resourceConfigs) {
        var requestMethod = request.method;
        var baseUrlArry = request.baseUrl.split('/');
        var productCode = baseUrlArry[1];
        var pluginId = baseUrlArry[3];

        var pathArray = request.path.split('/');
        var resourcePlugin = pathArray[1];
        var resourceType = 'config';
        var resource = request.path;
        if (pluginId && pluginId !== 'com.rs.configjs') {  //url format like http://localhost:8543/ZLUX/plugins/com.rs.bzadm/services/sessionSettings/ddd
            resourceType = 'service';
            resourcePlugin=pluginId;
            if(baseUrlArry[5]){
                resource = baseUrlArry[5]+request.path;
            }else{
                resource = "."+request.path;
            }           
        }else{  //url format like http://localhost:8543/ZLUX/plugins/com.rs.configjs/services/data/com.rs.bzw/user/scripts/vt?listing=true
            resource = resource.slice(resourcePlugin.length + 2);
        }
        if (resource.endsWith('/')) {
            resource = resource.substring(0, resource.length - 1);
        }
        var resourcePrefix = productCode + '.' + resourcePlugin + '_' + resourceType + '.' + requestMethod;
        var resourceVerify = resourcePrefix;
        var resourceParts = resource.split('/');
        let status = null;

        for (var _i = 0, resourceParts_1 = resourceParts; _i < resourceParts_1.length; _i++) {
            var resourcePart = resourceParts_1[_i];
            resourceVerify = resourceVerify + '.' + resourcePart;
            // var resourceAccess = this.authConfig.resources[resourceName];
            var result = resourceConfigs[resourceVerify + '.*'] ||  resourceConfigs[resourceVerify];
            if (result) {
                status = result;
            }
        }
        if(status != null) {
            return status;
        }
        
        /* FOR LDAP START
           ldap resources.json is different with other auth type */
        if (resourceConfigs[resourcePrefix + '.*']) {
            return resourceConfigs[resourcePrefix + '.*'];
        }
        /* FOR LDAP END */

        return resourceConfigs[resourceVerify];
    };

    authSuper.prototype.isMfaRequest = function(request) {
        const body = request.body;
        // JSTE-1574: use validate item to distinct the first login and validate account after login for Duo
        const validateAccount = body.validate || false;
        return !validateAccount && this.isMfaEnabled && (body.duopassed || body.totpverify || body.oktapassed);
    };

    authSuper.prototype.mfaAuthenticate = async function (request, sessionState) {
        if (this.mfaType === 'duo') {
            return this.duoAuthenticate(request, sessionState);
        }else if(this.mfaType === 'TOTP'){
            return await this.totpAuthenticate(request, sessionState);
        }else if(this.mfaType === 'okta') {
            return this.oktaAuthenticate(request, sessionState);
        }
        return Promise.resolve({success: false, message: 'unhandled mfa type'});
    };

    authSuper.prototype.getMFAConfig = async function (userId) {
        if (this.isMfaEnabled && this.mfaType === 'duo') {
            const duoConfig = this.serverConfiguration.dataserviceAuthentication.twoFactorAuthentication.duo.config || {};
            let sig_request = duo_web.sign_request(duoConfig.ikey, duoConfig.skey, akey, userId)
            return Promise.resolve({sig_request: sig_request, api_hostname: duoConfig.api_hostname, message: "Username auth passed"});
        }else if(this.isMfaEnabled && this.mfaType === 'TOTP'){
            const returnData = await bzdb.select('totpUser',{uid:userId});
            if(returnData.rowCount === 0 || (returnData.rowCount === 1 && !returnData.data[0].s)){
                let secret = new Secret({size:10}).base32;
                const totpAuth = new TOTP(Object.assign({},{ issuer: userId, secret },this.totpConfig));
                secret = this.encode(secret);
                //totp uri for  generate QR code  otpauth://totp/userId:Rocket Terminal Emulate?issuer=userId&secret=NB2W45DFOIZA&algorithm=SHA1&digits=6&period=30
                const keyuri = this.encode(totpAuth.toString());
                return Promise.resolve({secret,keyuri,digits:this.totpConfig.digits});
            }
            return Promise.resolve({digits:this.totpConfig.digits});
        }else{
            return Promise.resolve({});
        }
    };


    authSuper.prototype.totpAuthenticate = async function (request, sessionState) {
      let userId = request.body.username;
      const totpverify = request.body.totpverify;
      if(totpverify){
        const code = request.body.code;
        let secret = request.body.secret;
        const shortUserName = request.body.shortUserName;
        const returnData = await bzdb.select('totpUser',{uid:userId});
        if(returnData.rowCount === 1 && returnData.data[0].s){
            secret = returnData.data[0].s;
        }else{
            secret = this.decode(secret);
        }
        const totpAuth = new TOTP(Object.assign({},{ issuer: userId, secret },this.totpConfig));
        if(totpAuth.validate({token:code,window:this.totpConfig.window}) != null){
            //if the secret is exist, there is no need to save it.
            if(returnData.rowCount === 0 || (returnData.rowCount === 1 && !returnData.data[0].s)){
                await bzdb.updateOrInsert('totpUser', {uid:userId,s:secret});
            }
            if(shortUserName && shortUserName!=""){
                userId = shortUserName; 
            }
            this.setSessionState(sessionState, userId);
            return Promise.resolve({success: true, verifyResult:true});
        }else{
            return Promise.resolve({success: true, verifyResult:false});
        }
      }
    };

    authSuper.prototype.encode = function(content){
        return Buffer.from(content, 'utf-8').toString('base64');
    }

    authSuper.prototype.decode = function(content){
        return Buffer.from(content, 'base64').toString('utf-8');
    }

    authSuper.prototype.duoAuthenticate = function (request, sessionState) {
      let username = request.body.username;
      const isDuoPassed = request.body.duopassed;
      const shortUserName = request.body.shortUserName;
      if (isDuoPassed) { 
        if(shortUserName && shortUserName!=""){
            username= shortUserName; 
        }
        this.setSessionState(sessionState, username);
        return Promise.resolve({success: true});
      } 
    };

    authSuper.prototype.oktaAuthenticate = function (request, sessionState) {
        this.setSessionState(sessionState, request.body.userId || '');
        return Promise.resolve({ success: true });
    };

    authSuper.prototype.superAdminAuthenticate = async function (req, sessionState, res) {
        const filePath = path.join(this.serverConfiguration.productDir, './ZLUX/pluginStorage/com.rs.bzadm/_internal/services/auth/spadmahtctidt.json');
        const username = req.body.username;
        const password = req.body.password;
        const isSuper = username.toLowerCase() === 'superadmin';
        let superAdmResult, userLoginData;

        if (isSuper) {
            superAdmResult = await bzdb.select('superAdmin');
            userLoginData = superAdmResult.data[0];
        } else {
            superAdmResult = await bzdb.select('administrator');
            userLoginData = superAdmResult.data.find(d => d.name.toLowerCase() === username.toLowerCase());
        }

        if ((isSuper && !fs.existsSync(filePath)) || !userLoginData) {
            const sourceFile = path.join(this.serverConfiguration.instanceDir, '../../build/spadmahtctidt.json');
            userLoginData = JSON.parse(fs.readFileSync(sourceFile));
            bzdb.insert('superAdmin', userLoginData); // this is an async operation. But should be ok here.
        }

        const configuration = this.authConfig;
        const name = userLoginData.username || userLoginData.name;

         if (name.toLowerCase() === username.toLowerCase()) {
                try {
                    let iv = encryption.decryptWithKeyAndIV(userLoginData.iv, rKey, rIV);
                    let salt = encryption.decryptWithKeyAndIV(userLoginData.salt, rKey, rIV);

                    const key = encryption.getKeyFromPasswordSync(password, salt, 32);

                    try {
                        let result = encryption.decryptWithKeyAndIV(userLoginData.authentication, key, iv);
                        if (result === password) {
                            var authInfo = {
                                username: username,
                                roles: ''
                            };
                            if (configuration.userRoles) {
                                var userRoles = configuration.userRoles[username];
                                if (userRoles && userRoles.length > 0) {
                                    authInfo.roles = userRoles;
                                }
                            }
                            const admin = await bzdb.select('administrator', {name: name});
                            const isAdmin = admin.rowCount > 0 ? admin.data[0].role === 'admin' : false;
                            // custom administrator use 'administrator' role
                            this.setSessionState(sessionState, name, isSuper ? 'superadmin' : (isAdmin ? 'administrator' : 'group administrator'));
                            await this.authenticateTheCluster(req,res);
                            return {success: true, message: "sign on successfully.", init: isSuper ? userLoginData.init : false, username: name};     
                        } else {
                            return { success: false, message: "Incorrect userId / password." };
                        }
                    } catch (e) {
                        return { success: false, message: e.message };
                    }

                } catch (e) {
                    return { success: false, message: "Decrypt User authentication info from login.json failed." };
                }
            } else {
                return { success: false, message: "Incorrect userId / password."};
            }
    }

    authSuper.prototype.setSessionState = async function(sessionState, username, role) {
        // if (this.pluginID === 'com.rs.slaveAuth'){
        //     return await this.setSlaveSessionState(username);
        // }
        sessionState.userName = username;
        sessionState.authenticated = true;
        sessionState.roles = role ||'user';
        this.logger.info('Login success; username is '+sessionState.userName+";roles is "+sessionState.roles);
    }

    authSuper.prototype.checkPassword = function(userLoginData,password) {
        let passCheck = false;
        let passwordEncoding="BZW-AES256-CBC";  //default
        if (userLoginData.iv && userLoginData.salt) {
            passwordEncoding = "BZW-AES256-CBC";
        } else {
            if (this.serverConfiguration.importPasswordEncoding) {
                if (this.serverConfiguration.importPasswordEncoding.indexOf("SHA1") >= 0) {
                    passwordEncoding = "BZIS-SHA1"
                } else if (this.serverConfiguration.importPasswordEncoding.indexOf("SHA256") >= 0) {
                    passwordEncoding = "BZIS-SHA256"
                } else if (this.serverConfiguration.importPasswordEncoding.indexOf("AES256") >= 0) {
                    passwordEncoding = "BZW-AES256-CBC"
                } else if (this.serverConfiguration.importPasswordEncoding === "NONE") {
                    passwordEncoding = "NONE"
                }
            } else {
                passwordEncoding = "BZIS";
            }
        }
        switch (passwordEncoding) {
            case "BZW-AES256-CBC":
                const iv = encryption.decryptWithKeyAndIV(userLoginData.iv, rKey, rIV);
                const salt = encryption.decryptWithKeyAndIV(userLoginData.salt, rKey, rIV);
                const key = encryption.getKeyFromPasswordSync(password, salt, 32);
                const result = encryption.decryptWithKeyAndIV(userLoginData.authentication, key, iv);
                passCheck=(result === password);
                break;
            case "BZIS-SHA1":
                passCheck = (userLoginData.authentication===encryption.encryptWithSHA1(password));//w2h sha1 encryption method
                break;
            case "BZIS-SHA256":
                passCheck = (userLoginData.authentication===encryption.encryptWithSHA256(password));//w2h sha256 encryption method
                break;
            case "BZIS":
                passCheck = (userLoginData.authentication===encryption.encryptWithSHA1(password));//w2h sha1 encryption method
                if(!passCheck){
                    passCheck = (userLoginData.authentication===encryption.encryptWithSHA256(password));//w2h sha256 encryption method
                }
                break;
            case "NONE":
                passCheck=(userLoginData.authentication === password);
                break;    
            default:
                break;
        }
        return passCheck;
    }

   

    // authSuper.prototype.setSlaveSessionState = async function(username) {
    //     try{
    //         const response = await this.clusterRequest.recordUserStateOnMaster(username);
    //         if (response && JSON.parse(response).status){
    //             this.logger.info('Record user state onto primary node secceed for user: ' + username);
    //             return true;
    //         }else{
    //             this.logger.info('Record secondary node user state failed: ' + response.message? response.message: 'Unknown Error');
    //             return false;
    //         }
    //     }catch (e){
    //         this.logger.severe('Record user state onto primary node failed for user: ' + username);
    //         this.logger.severe('Error message: ' + e.message);
    //         return false;
    //     }
    // }

    authSuper.prototype.getAuth = function (auth) {
        const EMPTYPASSWORD='';
        if (!auth || auth.indexOf('Basic') == -1) {
            return {
                username: '',
                password: EMPTYPASSWORD
            };
        }
        try{
            let authStr = Buffer.from(auth.substring(6), 'base64').toString('latin1');
            let authArr = authStr.split(':');
            const username = authArr[0];
            let pwd = authArr[1];

            if(authArr.length > 2) {
                // colon character could be used by password
                authArr.splice(0, 1)
                pwd = authArr.join(':');
            }
            return {
                username: username,
                password: pwd 
            };
        } catch(e) {
            this.logger.severe('It is not a vaild base64 string. ' + e);
            return {
                username: '',
                password: ''
            }; 
        }
       
    }

    authSuper.prototype.authenticateTheCluster = async function (req, res) {
        // TBD, use more secure ways, like a private key in server
        const ip = process.env.RTEW_AUTH_X_FORWORDED_FOR === 'true' ? req.headers['x-forwarded-for'] : ''
        const authObj = {
            username: req.body.username,
            ip
        }
        const token = jwt.sign(authObj, akey, { expiresIn: '7d' });
        
        res.cookie('rte.cluster.session.token', token, { httpOnly: true, sameSite:'lax', maxAge: this.sessionTimeoutMs,  secure: req.protocol === 'https' })
    }

    authSuper.prototype.getClusterAuthUsername = async function(req, res) {
        const ip = process.env.RTEW_AUTH_X_FORWORDED_FOR === 'true' ? req.headers['x-forwarded-for'] : ''
        const cookieHeader = req.headers?.cookie;

        if (!cookieHeader) return undefined
        const cookies = {}
        cookieHeader.split(`;`).forEach(function(cookie) {
            let [ name, ...rest] = cookie.split(`=`);
            name = name?.trim()
            if (!name) return
            const value = rest.join(`=`).trim();
            if (!value) return
            cookies[name] = decodeURIComponent(value);
        });
        const token = cookies['rte.cluster.session.token']
        if (!token) {
            return undefined
        }
        try {
            const authObj = jwt.verify(token, akey);
            if(authObj.username && ((authObj.ip && ip) ? authObj.ip === ip : true)){
                zluxUtil.debounce(res.cookie('rte.cluster.session.token', token, { httpOnly: true, sameSite:'lax', maxAge: this.sessionTimeoutMs, secure: req.protocol ===  'https' }),10000); //10 sec
                return authObj.username
            }
        } catch(err) {
            this.logger.warn(err.message);
            this.logger.warn(JSON.stringify(err));
            res.clearCookie('rte.cluster.session.token');
        }
        return undefined
    }

    return authSuper;
}());
exports.authSuper = authSuper;

/*
  © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
  ROCKET SOFTWARE, INC. CONFIDENTIAL
*/
