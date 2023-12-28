"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bzdb = require("../services/bzdb.service");
const InternalDataSteward = require('../services/internal-data-steward.service');
const lodashGet = require('lodash').get;
const { adminConfigService } = require('../services/admin-config.service');
const BZDB_USER_VAR = 'userVar';
// \/\/\/ refer to app\bzadm\webClient\src\app\models\user\user-var-map.model.ts
var UvApiMethodEnum;
(function (UvApiMethodEnum) {
    UvApiMethodEnum["PUT"] = "PUT";
    UvApiMethodEnum["POST"] = "POST";
})(UvApiMethodEnum || (UvApiMethodEnum = {}));
class UserVarSvc {
    constructor(context) {
        this.defaultConfig = {
            enable: false,
            api: {
                enable: false,
                option: {
                    method: UvApiMethodEnum.POST,
                    url: '',
                    headers: []
                }
            },
            varMapArr: Array(9).fill("")
        };
        this.logger = context.logger;
        this.authConfig = context.plugin.server.config.user.dataserviceAuthentication;
        this.config = JSON.parse(JSON.stringify(this.defaultConfig));
        this.config = Object.assign(this.config, this.authConfig.varMapConfig);
        this.reqOpt = this.initRequestOption();
        this.dataSteward = InternalDataSteward.initWithContext(context);
        this.adminConfigObj = adminConfigService;
    }
    initRequestOption() {
        const data = {};
        for (const header of this.config.api.option.headers) {
            if (header.name) {
                data[header.name] = header.value;
            }
        }
        data['content-type'] = 'application/json';
        return {
            method: this.config.api.option.method,
            url: this.config.api.option.url,
            headers: data
        };
    }
    isVarMapEnabled() {
        return (this.authConfig
            && 'sso' === this.authConfig.defaultAuthentication
            && this.config.enable);
    }
    isRestApiEnabled() {
        return (this.isVarMapEnabled()
            && this.config.api.enable);
    }
    async getVarsByUserId(userId) {
        if (!this.isVarMapEnabled()) {
            return {};
        }
        const rs = await bzdb.select(BZDB_USER_VAR, { userId });
        if (rs.rowCount > 0) {
            return rs.data[0].vars;
        }
        else {
            this.logger.warn(`UserVarSvc::getVarsByUserId failed`);
            return {};
        }
    }
    /**
     * set userVars via SAML response
     * @param userId [string]
     * @param res [object]: SAML response
     */
    async setVars4Saml(userId, custData, res) {
        if (!this.isVarMapEnabled()) {
            return;
        }
        this.logger.info(`UserVarSvc::setVars4Saml SAML response, ${JSON.stringify(res)}`);
        this.logger.info(`UserVarSvc::setVars4Saml customData, ${JSON.stringify(custData)}`);
        let obj = {};
        if (this.isRestApiEnabled()) {
            const payload = {
                userId: userId,
                customData: custData,
                samlResponse: res
            };
            obj = await this.callRestApi(payload);
        }
        else {
            if (res.user && res.user.attributes) {
                obj = res.user.attributes;
            }
        }
        await this.setVars4User(userId, obj, this.config.varMapArr);
    }
    getAdminConfig() {
        // get the latest config using adminConfigObj.getConfig()
        return this.adminConfigObj.getConfig();
    }
    isEnabledOauth2() {
        return this.getAdminConfig().varMapApiOauth2.enable;
    }
    /**
     * make api call with Oauth 2.0
     * @param opt [object], HTTP request option
     */
    async callRestApiWithOauth2(opt) {
        let obj = {};
        const authConfig = this.getAdminConfig().varMapApiOauth2;
        const tokenOpt = {
            method: UvApiMethodEnum.POST,
            url: authConfig.url,
            form: {
                grant_type: authConfig.grant_type,
                client_id: authConfig.client_id,
                client_secret: authConfig.client_secret,
                scope: authConfig.scope ? authConfig.scope : ''
            }
        };
        try {
            const out = await this.dataSteward.syncFile(tokenOpt); // get access token first
            const data = JSON.parse(out.response.body);
            if (data.access_token) {
                this.logger.info(`UserVarSvc::callRestApiWithOauth2 access_token, ${data.access_token}`);
                opt.headers['Authorization'] = 'Bearer ' + data.access_token;
                const out = await this.dataSteward.syncFile(opt);
                obj = JSON.parse(out.response.body);
            }
        }
        catch (e) {
            this.logger.severe(`UserVarSvc::callRestApiWithOauth2 exception, ${e.message}\n${e.stack}`);
        }
        return obj;
    }
    /**
     * call customiszed restful api
     * @param body [string]
     */
    async callRestApi(body = {}) {
        const opt = JSON.parse(JSON.stringify(this.reqOpt));
        opt.body = body;
        let obj = {};
        if (this.isRestApiEnabled()) {
            try {
                if (this.isEnabledOauth2()) {
                    this.logger.info(`UserVarSvc::callRestApi OAuth 2.0`);
                    obj = await this.callRestApiWithOauth2(opt);
                }
                else {
                    const out = await this.dataSteward.syncFile(opt);
                    obj = JSON.parse(out.response.body);
                }
                this.logger.info(`UserVarSvc::callRestApi response, ${JSON.stringify(obj)}`);
            }
            catch (e) {
                this.logger.severe(`UserVarSvc::callRestApi exception, ${e.message}\n${e.stack}`);
            }
        }
        return obj;
    }
    /**
     * set vars to BZDB_USER_VAR entity
     * @param userId [string]
     * @param obj [object]
     * @param varMapArr, e.g. [ 'mail', 'token', ... ]
     */
    async setVars4User(userId, obj, varMapArr) {
        if (!this.isVarMapEnabled()) {
            return;
        }
        const data = {
            userId: userId,
            vars: {}
        };
        for (const n in varMapArr) {
        }
        varMapArr.forEach((varMap, index) => {
            const keyPath = varMap;
            try {
                const val = lodashGet(obj, keyPath);
                if (val) {
                    const tmp = Array.isArray(val) ? val[0] : val;
                    data.vars[`var${index + 1}`] = (typeof (tmp) === 'string') ? tmp : JSON.stringify(tmp);
                }
            }
            catch (e) {
                this.logger.warn(`UserVarSvc::setVars4User lodashGet failed, ${e.message}\n${e.stack}`);
            }
        });
        this.logger.info(`UserVarSvc::setVars4User BZDB_USER_VAR, ${JSON.stringify(data)}`);
        await bzdb.updateOrInsert(BZDB_USER_VAR, data);
    }
}
module.exports = {
    init(context) {
        if (!context.userVarSvc) {
            context.userVarSvc = new UserVarSvc(context);
        }
        return context.userVarSvc;
    }
};
//# sourceMappingURL=user-var-service.js.map