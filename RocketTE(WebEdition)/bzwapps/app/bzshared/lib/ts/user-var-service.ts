import * as bzdb from '../services/bzdb.service';
const InternalDataSteward = require('../services/internal-data-steward.service');
const lodashGet = require('lodash').get;
const {adminConfigService} = require('../services/admin-config.service');

const BZDB_USER_VAR = 'userVar';

// { 'var1': 'username', 'var2': 'password' }
type ScriptVars = Record<string, string>;
type RequestHeader = Record<string, string>;
interface UserVar {
  userId: string;
  vars: ScriptVars;
}
interface RequestOption {
  method: string;
  url: string;
  headers: RequestHeader;
  body?: any;
}

// \/\/\/ refer to app\bzadm\webClient\src\app\models\user\user-var-map.model.ts
enum UvApiMethodEnum {
    PUT = 'PUT',
    POST = 'POST'
}
interface UvApiHeader {
  name: string;
  value: string;
}

interface UvApiOption {
  method: string;
  url: string;
  headers: UvApiHeader[]
}

interface UvApiConfig {
  enable: boolean;
  option: UvApiOption;
}

interface UvMapConfig {
  enable: boolean;
  api: UvApiConfig;
  varMapArr: string[];
}
// /\/\/\ refer to app\bzadm\webClient\src\app\models\user\user-var-map.model.ts

interface IUserVarSvc {
  getVarsByUserId(userId: string): Promise<ScriptVars>;
  setVars4Saml(userId: string, custData: any, res: any): Promise<void>;
}

class UserVarSvc implements IUserVarSvc {

  private logger: any;
  private authConfig: any;
  //private samlVarMapArr: VarMap[];
  private reqOpt: RequestOption;
  private config: UvMapConfig;
  private dataSteward: any;
  private adminConfigObj: any;
  readonly defaultConfig: UvMapConfig = { // BZ-19519, user var map
    enable: false,
    api: {
      enable: false,
      option: {
        method: UvApiMethodEnum.POST,
        url: '',
        headers: [] as any
      }
    },
    varMapArr: Array(9).fill("")
  };

  constructor(context: any) {
    this.logger = context.logger;
    this.authConfig = context.plugin.server.config.user.dataserviceAuthentication;
    this.config = JSON.parse(JSON.stringify(this.defaultConfig));
    this.config = Object.assign(this.config, this.authConfig.varMapConfig);
    this.reqOpt = this.initRequestOption();
    this.dataSteward = InternalDataSteward.initWithContext(context);
    this.adminConfigObj = adminConfigService;
  }

  initRequestOption(): RequestOption {
    const data: RequestHeader = {} as any;
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
    }
  }

  isVarMapEnabled(): boolean {    
    return (this.authConfig 
      && 'sso' === this.authConfig.defaultAuthentication
      && this.config.enable);
  }

  isRestApiEnabled(): boolean {
    return (this.isVarMapEnabled()
      && this.config.api.enable)
  }

  async getVarsByUserId(userId: string): Promise<ScriptVars> {
    if (!this.isVarMapEnabled()) {
      return {};
    }
    const rs = await bzdb.select(BZDB_USER_VAR, {userId});
    if (rs.rowCount > 0) {
        return rs.data[0].vars;
    } else {
      this.logger.warn(`UserVarSvc::getVarsByUserId failed`);
      return {};
    }
  }

  /**
   * set userVars via SAML response
   * @param userId [string] 
   * @param res [object]: SAML response
   */
  async setVars4Saml(userId: string, custData: any, res: any): Promise<void> {
    if (!this.isVarMapEnabled()) {
      return;
    }
    this.logger.info(`UserVarSvc::setVars4Saml SAML response, ${JSON.stringify(res)}`);
    this.logger.info(`UserVarSvc::setVars4Saml customData, ${JSON.stringify(custData)}`);

    let obj = {};
    if (this.isRestApiEnabled()) {
      const payload = {
        userId: userId,
        customData: custData, // BZ-20526, Support custom post data, Nissan North America Inc
        samlResponse: res
      };
      obj = await this.callRestApi(payload);
    } else {
      if (res.user && res.user.attributes) {
        obj = res.user.attributes
      }
    }
    
    await this.setVars4User(userId, obj, this.config.varMapArr);
  }

  getAdminConfig () {
    // get the latest config using adminConfigObj.getConfig()
    return this.adminConfigObj.getConfig();
  }

  isEnabledOauth2(): boolean {
    return this.getAdminConfig().varMapApiOauth2.enable;
  }

  /**
   * make api call with Oauth 2.0
   * @param opt [object], HTTP request option
   */
  async callRestApiWithOauth2(opt: any)
  {
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
    }    
    try {
      const out = await this.dataSteward.syncFile(tokenOpt); // get access token first
      const data = JSON.parse(out.response.body);
      if (data.access_token) {
        this.logger.info(`UserVarSvc::callRestApiWithOauth2 access_token, ${data.access_token}`);
        opt.headers['Authorization'] = 'Bearer ' + data.access_token;
        const out = await this.dataSteward.syncFile(opt);
        obj = JSON.parse(out.response.body);
      }
    } catch (e) {
      this.logger.severe(`UserVarSvc::callRestApiWithOauth2 exception, ${e.message}\n${e.stack}`);
    }
    return obj;
  }

  /**
   * call customiszed restful api
   * @param body [string]
   */
  async callRestApi(body: any = {}) {
    const opt = JSON.parse(JSON.stringify(this.reqOpt));
    opt.body = body;
    let obj = {};
    if (this.isRestApiEnabled()) {
      try {
        if (this.isEnabledOauth2()) {
          this.logger.info(`UserVarSvc::callRestApi OAuth 2.0`);
          obj = await this.callRestApiWithOauth2(opt);
        } else {
          const out = await this.dataSteward.syncFile(opt);
          obj = JSON.parse(out.response.body);
        }
        this.logger.info(`UserVarSvc::callRestApi response, ${JSON.stringify(obj)}`);
      } catch (e) {
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
  async setVars4User(userId: string, obj: any, varMapArr: string[]): Promise<void> {
    if (!this.isVarMapEnabled()) {
      return;
    }

    const data: UserVar = {
      userId: userId,
      vars: {}
    }
    for (const n in varMapArr) {
    }
    varMapArr.forEach((varMap, index) => {
      const keyPath = varMap;
      try {
        const val = lodashGet(obj, keyPath);
        if (val) {
           const tmp = Array.isArray(val) ? val[0] : val;
           data.vars[`var${index+1}`] = (typeof(tmp) === 'string') ? tmp : JSON.stringify(tmp);
        }
      } catch (e) {
        this.logger.warn(`UserVarSvc::setVars4User lodashGet failed, ${e.message}\n${e.stack}`);
      }
    });
    this.logger.info(`UserVarSvc::setVars4User BZDB_USER_VAR, ${JSON.stringify(data)}`);
    await bzdb.updateOrInsert(BZDB_USER_VAR, data);
  }
}

module.exports = {
  init(context: any): IUserVarSvc {
    if (!context.userVarSvc) {
      context.userVarSvc = new UserVarSvc(context);
    }
    return context.userVarSvc;
  }
};