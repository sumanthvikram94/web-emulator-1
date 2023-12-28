"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ldapHelper = void 0;
/*
  © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
  ROCKET SOFTWARE, INC. CONFIDENTIAL
*/
const ldapjs = require("ldapjs"); //http://ldapjs.org/
class ldapHelper {
    constructor(ldapServerConfig) {
        this.ldapServerConfig = ldapServerConfig;
        this.logger = global['COM_RS_COMMON_LOGGER'].makeComponentLogger("bzw.auth.ldap");
        if (this.ldapServerConfig && this.ldapServerConfig.ldapServerHostname) {
            const hostname = this.ldapServerConfig.ldapServerHostname;
            const port = this.ldapServerConfig.ldapServerPort;
            const isSecured = this.ldapServerConfig.ldapServerSSLEnabled;
            this.ldapHostUrl = (isSecured ? 'ldaps://' : 'ldap://') + hostname + ':' + port;
            const isRejectingUnauthorized = this.ldapServerConfig.rejectUnauthorized ? true : false;
            this.options = { 'rejectUnauthorized': isRejectingUnauthorized };
        }
    }
    async ldapBind(username, password, isDNBind) {
        const strPort = this.ldapServerConfig.ldapServerPort;
        const intPort = Number(strPort);
        if (Number.isNaN(intPort) || !Number.isInteger(intPort) || intPort < 1 || intPort > 65535) {
            this.logger.severe('Authorization Failed : bind LDAP occurs error:Port should be > 0 and < 65536 ');
            return Promise.resolve({ success: false, message: 'Port should be > 0 and < 65536' });
        }
        this.client = ldapjs.createClient({
            url: this.ldapHostUrl,
            // strictDN:'true', // upgraded ldap.js to V3. strictDN is removed and is true by default.
            tlsOptions: this.options,
            reconnect: false
        });
        let userFullName = this.getUserFullName(username);
        if (!!isDNBind) {
            userFullName = username;
        }
        return new Promise((resolve, reject) => {
            this.client.on('error', (err) => {
                this.logger.severe('Authorization Failed : bind LDAP occurs error: ' + err.message);
                return resolve({ success: false, message: err.message });
            });
            this.client.bind(userFullName, password, (err) => {
                if (err) {
                    let message = err instanceof ldapjs.LDAPError ? `${err.name} ${err.code}: ${err.message}` : 'unknown error';
                    this.logger.severe('Authorization Failed : bind LDAP occurs error: ' + message);
                    this.unBind();
                    return resolve({ success: false, message: message });
                }
                return resolve({ success: true });
            });
        });
    }
    async ldapAdminBind() {
        const ldapManagerDN = this.ldapServerConfig.ldapManagerDN;
        const ldapManagerPassword = this.ldapServerConfig.ldapManagerPassword;
        if (!ldapManagerDN || ldapManagerDN === "") {
            this.logger.severe('Authorization Failed : Manager DN is required');
            return { success: false, message: 'Manager DN is required' };
        }
        if (!ldapManagerPassword || ldapManagerPassword === "") {
            this.logger.severe('Authorization Failed : Manager Password is required');
            return { success: false, message: 'Manager Password is required' };
        }
        return await this.ldapBind(ldapManagerDN, ldapManagerPassword, true); //admin bind
    }
    async ldapAdminSearch(username, retureAttr) {
        let result = {};
        const bindResult = await this.ldapAdminBind();
        if (!bindResult["success"]) {
            return Promise.resolve({});
        }
        else {
            result = await this.ldapSearch(username, '', retureAttr);
            return Promise.resolve(result);
        }
    }
    async ldapDoubleBind(username, password) {
        const bindResult = await this.ldapAdminBind();
        if (!bindResult["success"]) {
            this.logger.severe('Authorization Failed : Manager  bind error');
            return { success: false, message: 'Manager bind error' };
        }
        else {
            if (!this.ldapServerConfig.ldapRootDN || this.ldapServerConfig.ldapRootDN === "") {
                this.ldapServerConfig.ldapRootDN = await this.getRootDN(); //set root DN
            }
            const retureAttr = "";
            const searchResult = await this.ldapSearch(username, password, retureAttr); //user DN
            if (searchResult && Object.keys(searchResult).length > 0) {
                let userDnName = searchResult[0].vals[0]; //set userDN name
                if (userDnName && userDnName !== '') {
                    const doubleBindResult = await this.ldapBind(userDnName, password, true); //use user DN bind
                    if (!doubleBindResult["success"]) {
                        this.logger.severe('Authorization Failed : user DN bind error,userDnName:' + userDnName);
                        return { success: false, message: username + ' occurs bind error' };
                    }
                    else {
                        return { success: true };
                    }
                }
                else {
                    this.logger.severe('Authorization Failed : search user DN occurs error');
                    return { success: false, message: username + ' occurs bind error' };
                }
            }
            else {
                this.logger.severe('Authorization Failed : search user DN occurs error');
                return { success: false, message: username + ' occurs bind error' };
            }
        }
    }
    async ldapClientBind(username, password) {
        username = this.getUserFullName(username);
        let bindResult;
        if (this.ldapServerConfig.ldapManagerDN && this.ldapServerConfig.ldapManagerDN != "") {
            bindResult = await this.ldapDoubleBind(username, password); //double bind
        }
        else {
            bindResult = await this.ldapBind(username, password); //sigle bind
        }
        return bindResult;
    }
    async getRootDN() {
        const rootopts = { filter: '(objectclass=*)' };
        return new Promise((resolve, reject) => {
            let ldapRootDN = '';
            this.client.search('', rootopts, (err, response) => {
                if (err)
                    return resolve(ldapRootDN);
                let responsed = false;
                response.on('searchEntry', entry => {
                    responsed = true;
                    let ldapResultEntry = JSON.parse(entry);
                    if (ldapResultEntry && Array.isArray(ldapResultEntry.attributes)) {
                        let find = ldapResultEntry.attributes.find((attr) => attr.type === 'defaultNamingContext');
                        if (find && 'vals' in find && Array.isArray(find.vals)) {
                            ldapRootDN = find.vals[0];
                        }
                    }
                });
                response.on('error', () => resolve(ldapRootDN));
                response.on('end', () => {
                    this.unBind();
                    if (!responsed)
                        ldapRootDN = '';
                    return resolve(ldapRootDN);
                });
            });
        });
    }
    async ldapSearch(username, password, retureAttr) {
        username = this.getUserFullName(username);
        let filter = this.ldapServerConfig.ldapFilter;
        let searchBase = this.ldapServerConfig.ldapRootDN;
        if (filter && filter != "") {
            if (username.indexOf("\\") > 0) {
                username = username.split("\\")[1]; //match the format 'rocket1\qpan'
            }
            filter = filter.replace("{0}", username);
            filter = filter.replace("{1}", password);
        }
        let rootopts = {
            scope: 'sub',
            filter: filter
        };
        if (retureAttr && retureAttr != "" && Object.keys(retureAttr).length > 0) {
            rootopts["attributes"] = retureAttr;
        }
        else {
            rootopts["attributes"] = "1.1"; //indicates that no attributes should be included 
        }
        if (this.ldapServerConfig.ldapTimeLimit && parseInt(this.ldapServerConfig.ldapTimeLimit) > 0) {
            rootopts["timeLimit"] = this.ldapServerConfig.ldapTimeLimit;
        }
        let result = {};
        return new Promise((resolve, reject) => {
            this.client.search(searchBase, rootopts, (err, response) => {
                this.logger.debug('ldapSearch detail, searchBase= ' + JSON.stringify(searchBase) + ";rootopts=" + JSON.stringify(rootopts));
                if (err) {
                    this.logger.severe('ldapSearch Failed :' + err.message);
                    return resolve(result);
                }
                response.on('searchEntry', entry => {
                    let ldapResultEntry = JSON.parse(entry);
                    if (ldapResultEntry) {
                        Object.assign(result, { 0: { type: 'DN', vals: [ldapResultEntry.objectName] } });
                        if (ldapResultEntry.attributes && ldapResultEntry.attributes.length > 0) {
                            let index = 0;
                            for (const attr in ldapResultEntry.attributes) {
                                index++;
                                result[index] = {
                                    type: ldapResultEntry.attributes[attr].type,
                                    vals: [ldapResultEntry.attributes[attr].values.toString()]
                                };
                                // this.logger.info('[LDAP] newObj: ' + JSON.stringify(result[index]));
                            }
                        }
                    }
                });
                response.on('error', (err) => {
                    this.logger.severe('ldapSearch Failed : bind LDAP occurs error: ' + err.message);
                    resolve(result);
                });
                response.on('end', () => {
                    this.unBind();
                    if (Object.keys(result).length === 0) {
                        this.logger.severe('ldapSearch Failed : no value return, check the filter, make sure it is correct after appending the suffix or prefix. ');
                    }
                    return resolve(result);
                });
            });
        });
    }
    async ldapBindSearch(username, password, retureAttr) {
        username = this.getUserFullName(username);
        let bindResult;
        let result = {};
        bindResult = await this.ldapClientBind(username, password);
        if (!bindResult.success) {
            return Promise.resolve({});
        }
        else {
            result = await this.ldapSearch(username, password, retureAttr);
            return Promise.resolve(result);
        }
    }
    async ldapSettingTest(username, password, returnAttr) {
        let bindResult;
        let searchResult;
        let userDnName = "";
        let testResult = {
            success: false,
            message: '',
            lookUp: {},
            login: ''
        };
        if (!!username) {
            username = this.getUserFullName(username);
        }
        else {
            testResult.message = 'user name is required';
            return testResult;
        }
        bindResult = await this.ldapAdminBind();
        if (bindResult.success) {
            testResult.success = true;
            searchResult = await this.ldapSearch(username, '', returnAttr);
            if (searchResult && Object.keys(searchResult).length > 0) {
                userDnName = searchResult[0].vals[0];
                Object.assign(testResult.lookUp, searchResult);
            }
            else {
                testResult.login = 'failed for user ' + username + ' with not find DN';
                return testResult;
            }
        }
        else {
            testResult.success = false;
            testResult.message = 'failed for  manager bind;' + bindResult.message;
            return testResult;
        }
        if (!!password) {
            bindResult = await this.ldapBind(userDnName, password, true);
            if (bindResult.success) {
                testResult.login = 'Authentication: successful for user ' + username;
            }
            else {
                testResult.login = 'failed for user ' + username + ";" + bindResult.message;
            }
        }
        else {
            testResult.login = 'failed for user ' + username + ' with empty password';
        }
        this.unBind();
        return testResult;
    }
    getUserFullName(userName) {
        let userFullName = userName.toLowerCase();
        if (this.ldapServerConfig.ldapUserIdSuffix && this.ldapServerConfig.ldapUserIdSuffix !== "") {
            if (userFullName.indexOf(this.ldapServerConfig.ldapUserIdSuffix.toLowerCase()) < 0) {
                userFullName += this.ldapServerConfig.ldapUserIdSuffix.toLowerCase();
            }
        }
        if (this.ldapServerConfig.ldapUserIdPrefix && this.ldapServerConfig.ldapUserIdPrefix !== "") {
            if (userFullName.indexOf(this.ldapServerConfig.ldapUserIdPrefix.toLowerCase()) < 0) {
                userFullName = this.ldapServerConfig.ldapUserIdPrefix + userFullName.toLowerCase();
            }
        }
        return userFullName;
    }
    getUserShortName(userName) {
        let userShortName = userName.toLowerCase();
        if (this.ldapServerConfig.ldapUserIdSuffix && this.ldapServerConfig.ldapUserIdSuffix !== "") {
            const pos = userShortName.indexOf(this.ldapServerConfig.ldapUserIdSuffix.toLowerCase());
            if (pos >= 0) {
                userShortName = userShortName.substring(0, pos);
            }
        }
        if (this.ldapServerConfig.ldapUserIdPrefix && this.ldapServerConfig.ldapUserIdPrefix !== "") {
            const pos = userShortName.indexOf(this.ldapServerConfig.ldapUserIdPrefix.toLowerCase());
            if (pos >= 0) {
                userShortName = userShortName.substring(this.ldapServerConfig.ldapUserIdPrefix.length);
            }
        }
        return userShortName;
    }
    unBind() {
        if (this.client) {
            this.client.unbind((err) => {
                //this.logger.debug('unbind: successful ');
            });
        }
    }
}
exports.ldapHelper = ldapHelper;
//# sourceMappingURL=ldapHelper.js.map