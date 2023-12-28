"use strict";
/**
 * Deprecated
 */
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
/*
  © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
  ROCKET SOFTWARE, INC. CONFIDENTIAL
*/
var request = require('request');
var path = require('path');
var cache = require('../../../../app/bzshared/lib/services/inmem-cache.service');
var CACHE_CATEGORY = 'SLAVE_USER_STATE';
var authSuper_1 = require("./../../authSuper");
var ConfigDataService = require('../../../../app/bzshared/lib/services/config-data.service');
/**
    Authentication and Authorization handler which get the user data from master node.
*/
var SlaveAuthenticator = /** @class */ (function (_super) {
    __extends(SlaveAuthenticator, _super);
    function SlaveAuthenticator(pluginDef, pluginConf, serverConf) {
        var _this = _super.call(this, pluginDef, pluginConf, serverConf) || this;
        _this.configDataService = new ConfigDataService({ logger: _this.logger });
        _this.cache = cache;
        return _this;
    }
    ;
    SlaveAuthenticator.prototype.authenticate = function (req, sessionState) {
        var _this = this;
        var that = this;
        return new Promise(function (resolve, reject) {
            req.body = Object.assign(req.body, _this.getAuth(req.headers.authentication || req.headers.authorization));
            var username = req.body.username;
            var headers = {};
            var reqBody = JSON.stringify(req.body);
            Object.assign(headers, req.headers);
            headers['content-length'] = Buffer.from(reqBody).length;
            var clusterConfig = that.serverConfiguration.bzwCluster;
            if (!clusterConfig || !clusterConfig.masterOrigin) {
                return resolve({ success: false, message: 'No valid cluster configuration found' });
            }
            var options = {
                url: clusterConfig.masterOrigin + '/auth',
                method: 'POST',
                headers: headers,
                body: reqBody
            };
            var isHttps = options.url.toLowerCase().indexOf("https") === 0 ? true : false;
            if (isHttps) {
                Object.assign(options, { "agentOptions": { "rejectUnauthorized": false } }); //todo, use this to https error CERT_HAS_EXPIRED   
            }
            request(options, function (err, response, body) {
                if (!err && response && response.body) {
                    try {
                        var resObj = JSON.parse(response.body);
                        var categories = resObj.categories;
                        var keys = Object.keys(categories);
                        var msg = 'Primary node auth failed';
                        var _loop_1 = function (key) {
                            var masterAuthType = Object.keys(categories[key].plugins)[0];
                            var result = categories[key].plugins[masterAuthType];
                            if (categories[key].success) {
                                if (result && result.userID) {
                                    var shortUserName = result.userID;
                                    if (shortUserName !== "") {
                                        username = shortUserName;
                                    }
                                }
                                // JSTE-4177: slave node passby duo verification when refresh page
                                if (req.body.validate || (!result.isMfaEnabled && !result.sig_request)) {
                                    _this.setSlaveSessionState(username).then(function (response) {
                                        if (response) {
                                            _this.cache.add(CACHE_CATEGORY, username, true);
                                            return resolve(result);
                                        }
                                        else {
                                            return resolve({ success: false, message: 'Failed to store session state to primary node' });
                                        }
                                    }, function (err) {
                                        _this.logger.warn(err.stack ? err.stack : err.message);
                                        return resolve({ success: false, message: 'Failed to store session state to primary node' });
                                    });
                                }
                                else {
                                    return { value: resolve(result) };
                                }
                            }
                            else {
                                if (result && result.message) {
                                    msg = result.message;
                                }
                                else if (masterAuthType) {
                                    msg = 'Primary node auth failed. Primary node auth type: ' + masterAuthType;
                                }
                                return { value: resolve({ success: false, message: msg }) };
                            }
                        };
                        for (var _i = 0, keys_1 = keys; _i < keys_1.length; _i++) {
                            var key = keys_1[_i];
                            var state_1 = _loop_1(key);
                            if (typeof state_1 === "object")
                                return state_1.value;
                        }
                    }
                    catch (err) {
                        return resolve({ success: false, message: err.stack });
                    }
                }
                else if (err) {
                    return resolve({ success: false, message: err.stack });
                }
                else {
                    return resolve({ success: false, message: 'Unknown Internal Error' });
                }
            });
        });
    };
    ;
    return SlaveAuthenticator;
}(authSuper_1.authSuper));
module.exports = function (pluginDef, pluginConf, serverConf) {
    return Promise.resolve(new SlaveAuthenticator(pluginDef, pluginConf, serverConf));
};
/*
  © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
  ROCKET SOFTWARE, INC. CONFIDENTIAL
*/ 
//# sourceMappingURL=slaveAuth.js.map