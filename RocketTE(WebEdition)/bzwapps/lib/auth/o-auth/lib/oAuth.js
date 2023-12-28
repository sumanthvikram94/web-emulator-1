"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
/*
  © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
  ROCKET SOFTWARE, INC. CONFIDENTIAL
*/
var authSuper_1 = require("./../../authSuper");
var bzdb = require('../../../../app/bzshared/lib/services/bzdb.service');
// var PvgService = require('../../../../app/bzshared/lib/apis/user-privilege/user-privilege.service');
var oauthAuthenticator = /** @class */ (function (_super) {
    __extends(oauthAuthenticator, _super);
    function oauthAuthenticator(pluginDef, pluginConf, serverConf) {
        return _super.call(this, pluginDef, pluginConf, serverConf) || this;
    }
    ;
    oauthAuthenticator.prototype.authenticate = function (request, sessionState, response) {
        return __awaiter(this, void 0, void 0, function () {
            var username, constraints, returnData, userLoginData;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        request.body = request.headers.type === 'oauth' ?
                            Object.assign(request.body, this.getOAuth(request.headers.authorization)) :
                            Object.assign(request.body, this.getAuth(request.headers.authorization));
                        if (!request.body.isSuperadmin) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.superAdminAuthenticate(request, sessionState, response)];
                    case 1: return [2 /*return*/, _a.sent()];
                    case 2:
                        username = request.body.username;
                        if (username) {
                            this.setRolesAndSessionState(request, sessionState, username);
                            return [2 /*return*/, { success: true, isMfaEnabled: this.isMfaEnabled, mfaType: this.mfaType, username: username }];
                        }
                        constraints = new (bzdb.getBZDBModule().SelectConstraints)();
                        constraints.addIgnoreCaseFields('username');
                        return [4 /*yield*/, bzdb.select('userLogin', { username: username }, constraints)];
                    case 3:
                        returnData = _a.sent();
                        if (returnData.rowCount > 0) {
                            userLoginData = returnData.data[0];
                            if (userLoginData && userLoginData.username && userLoginData.authentication) {
                                try {
                                    if (request.headers.type === 'oauth' || this.checkPassword(userLoginData, request.body.password)) {
                                        this.setRolesAndSessionState(request, sessionState, username);
                                        return [2 /*return*/, { success: true, isMfaEnabled: this.isMfaEnabled, mfaType: this.mfaType, username: username }];
                                    }
                                    else {
                                        sessionState.authenticated = false;
                                        this.logger.info('Authorization Failed,username:' + username + ',message: Incorrect user name/password.');
                                        return [2 /*return*/, { success: false, message: "Incorrect user name/password." }];
                                    }
                                }
                                catch (e) {
                                    //console.error(e)
                                    this.logger.severe('Authorization Failed,username:' + username + ', message: Decrypt User authentication info from login.json failed.');
                                    return [2 /*return*/, { success: false, message: "Decrypt User authentication info from login.json failed." }];
                                }
                            }
                            else {
                                this.logger.severe('Authorization Failed,username:' + username + ', : message: User authentication info is missing in login.json.');
                                return [2 /*return*/, { success: false, message: "User authentication info is missing in login.json." }];
                            }
                        }
                        else {
                            this.logger.severe('Authorization Failed,username:' + username + ', : message: Cannot find user authentication file login.json.');
                            return [2 /*return*/, { success: false, message: "Cannot find user authentication file login.json." }];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    oauthAuthenticator.prototype.setRolesAndSessionState = function (request, sessionState, username) {
        var authInfo = {
            username: username,
            roles: ''
        };
        if (this.authConfig.userRoles) {
            var userRoles = this.authConfig.userRoles[username];
            if (userRoles && userRoles.length > 0) {
                authInfo.roles = userRoles;
            }
        }
        // JSTE-1574
        if (request.body.validate || !this.isMfaEnabled) {
            this.setSessionState(sessionState, username);
        }
    };
    oauthAuthenticator.prototype.authorized = function (request, sessionState) {
        return __awaiter(this, void 0, void 0, function () {
            var header, headers;
            return __generator(this, function (_a) {
                header = request.headers || request.query;
                if (header.authorization && header.type === 'oauth') {
                    headers = this.getOAuth(header.authorization);
                    request.headers = Object.assign(request.headers, headers);
                }
                return [2 /*return*/, _super.prototype.authorized.call(this, request, sessionState)];
            });
        });
    };
    oauthAuthenticator.prototype.getOAuth = function (auth) {
        if (!auth || auth.indexOf('Basic') == -1) {
            return {
                username: ''
            };
        }
        try {
            var authStr = Buffer.from(auth.substring(6), 'base64').toString('ascii');
            var authArr = authStr.split(':');
            var username = authArr[0];
            var index = username.indexOf('\\');
            if (index > -1) {
                username = username.substring(index + 1, username.length);
            }
            this.logger.debug("currnt base64 string is: " + auth + ", decode is: " + username);
            return {
                username: username
            };
        }
        catch (_a) {
            this.logger.severe('It is not a vaild base64 string');
            return {
                username: ''
            };
        }
    };
    return oauthAuthenticator;
}(authSuper_1.authSuper));
module.exports = function (pluginDef, pluginConf, serverConf) {
    return Promise.resolve(new oauthAuthenticator(pluginDef, pluginConf, serverConf));
};
/*
  © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
  ROCKET SOFTWARE, INC. CONFIDENTIAL
*/ 
