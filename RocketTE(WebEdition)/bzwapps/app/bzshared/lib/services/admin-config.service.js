'use strict';

const fs = require('fs-extra');
const path = require('path');
const zoweService = require('./zowe.service');
const jsonUtils = zoweService.jsonUtils;

const logger = global.COM_RS_COMMON_LOGGER.makeComponentLogger("bzshared.admin-config.service");

const ADMIN_CONFIG_FILE = '/ZLUX/pluginStorage/com.rs.bzadm/configurations/adminConfig.json'
const g_adminConfigDefult = {
  fileUpload: {
    license: 2,           // KB
    globalIni: 5,         // KB
    defaultIni: 5,        // KB
    profile: 500,         // KB
    profileAmount: 10,    // KB
    fileDist: 5 * 1024    // KB
  },
  varMapApiOauth2: {
    enable: false,
    grant_type: 'client_credentials',
    url: '',
    client_id: '',
    client_secret: '',
    scope: ''
  },
  groupPrivilegeScope: 'preDefinedOnly',  // string,
  enableATTLS: false, // BZ-19979, enable AT-TLS
  copyFullPage4Unselect: false,
  script:{
    enablePasswordRecord: false
  }
}
const g_adminConfigVerifier = {
  fileUpload: {
    license:        { type: typeof(1), min: 2,    max: 512,    default: 2 },
    globalIni:      { type: typeof(1), min: 2,    max: 512,    default: 5 },
    defaultIni:     { type: typeof(1), min: 2,    max: 512,    default: 5 },
    profile:        { type: typeof(1), min: 200,  max: 10240,  default: 500 },
    profileAmount:  { type: typeof(1), min: 10,   max: 20,     default: 10 },
    fileDist:       { type: typeof(1), min: 1024, max: 102400, default: 5 * 1024 },
  },
  varMapApiOauth2: {
    enable:         { type: typeof(true), default: false },
    grant_type:     { type: typeof(''),   default: 'client_credentials', validVals: ['client_credentials'] },
    url:            { type: typeof(''),   default: '' },
    client_id:      { type: typeof(''),   default: '' },
    client_secret:  { type: typeof(''),   default: '' },
    scope:          { type: typeof(''),   default: '' },
  },
  groupPrivilegeScope: {
    type: typeof(''),
    validVals: ['preDefinedOnly', 'preDefinedAndSelfDefined'],
    default: 'preDefinedOnly'
  },
  enableATTLS: { // BZ-19979, enable AT-TLS
    type: typeof(true),
    default: false
  },
  enableUserReport: true,
  copyFullPage4Unselect: false,
  preCheckEditableField: false,
  script:{
    enablePasswordRecord: false
  },
  maxPowerpadRow: { type: typeof(1), min: 1,    max: 3,    default: 2 }
}

class AdminConfigService {
  
  constructor(/*context*/) {
    //this.context = context;
    this.logger = logger;
    this.instanceDir = zoweService.instanceDir;
    this.configFile = path.join(this.instanceDir, ADMIN_CONFIG_FILE);
    this.config = g_adminConfigDefult;
    this.mtimeMs = 0;
    this.adminConfigObj = {};
    this.setAdminConfig();
  }

  verifyConfigValue(data, verifier) {
    if (undefined === data || null === data
      || !verifier.hasOwnProperty('type')
      || typeof(data) !== verifier.type
      || !verifier.hasOwnProperty('default')) {
        return verifier.hasOwnProperty('default') ? verifier.default : data;
    }

    let result = false;
    switch (verifier.type) {
      case typeof(1): // number
        if (verifier.hasOwnProperty('min') && verifier.hasOwnProperty('max')) {
          result = (data >= verifier.min && data <= verifier.max);
        }
        break;
      case typeof(''): // string
        if (verifier.hasOwnProperty('validVals') && Array.isArray(verifier.validVals)) {
          result = verifier.validVals.includes(data);
        } else {
          result = true; // valid values were not set
        }
        break;
      case typeof(true): // boolean
        result = true;
        break;

      default:
        break;
    }

    return result ? data : verifier.default;
  }

  getConfig() {
    if (!fs.existsSync(this.configFile)) {
      return this.config;
    }

    try {
      const stat = fs.lstatSync(this.configFile);
      if (this.mtimeMs >= stat.mtimeMs) {
        return this.config;  // no need to read again because no changes
      }
      this.logger.info(`AdminConfigService::getConfig, config file changed, reloading...`);

      const result = JSON.parse(JSON.stringify(g_adminConfigDefult));
      const data = jsonUtils.parseJSONWithComments(this.configFile);

      const keys4obj1 = ['fileUpload', 'varMapApiOauth2'];
      for (const key of keys4obj1) {
        if (data.hasOwnProperty(key)) {
          for (const subkey of Object.keys(g_adminConfigVerifier[key])) {
            result[key][subkey] = this.verifyConfigValue(data[key][subkey], g_adminConfigVerifier[key][subkey]);
          }
        }
      }

      const keys = ['groupPrivilegeScope', 'enableATTLS'];
      for (const key of keys) {
        if (data.hasOwnProperty(key)) {
          result[key] = this.verifyConfigValue(data[key], g_adminConfigVerifier[key]);
        }
      }

      if (data.hasOwnProperty('maxPowerpadRow')) {
        let key = 'maxPowerpadRow'
        result[key] = this.verifyConfigValue(data[key], g_adminConfigVerifier[key]);
      }

      if (data.hasOwnProperty('copyFullPage4Unselect')) {
        let key = 'copyFullPage4Unselect'
        result[key] = data[key];
      }

      if (data.hasOwnProperty('preCheckEditableField')) {
        let key = 'preCheckEditableField'
        result[key] = data[key];
      }
      
      if (data.hasOwnProperty('enableUserReport')) {
        let key = 'enableUserReport'
        result[key] = data[key];
      }
      
      if (data.hasOwnProperty('script')) {
        let key = 'script';
        for (const subkey of Object.keys(g_adminConfigVerifier[key])) {
          result[key][subkey] = data[key] ? data[key][subkey] : false;
        }
      }

      this.config = result;  // reset data in memory
      this.mtimeMs = stat.mtimeMs;  // reset timestamp
      return this.config;

    } catch (e) {
      this.logger.warn(`AdminConfigService::getConfig, failed with error ${e.stack}`);
      return this.config;
    }
  }

  getAdminConfig() {
    return this.adminConfigObj;
  }

  setAdminConfig() {
    const adminConfigs = ['instance', 'product'];

    for(let dir of adminConfigs) {
        const adminConfigPath = path.join(__dirname, `../../../../deploy/${dir}/ZLUX/pluginStorage/com.rs.bzadm/configurations/adminConfig.json`); //adminConfig path
        
        try{
            const adminConfig = fs.existsSync(adminConfigPath) ? jsonUtils.parseJSONWithComments(adminConfigPath) : null; // get adminConfig
        
            // set adminConfigPath
            if(adminConfig) {
                this.adminConfigObj = adminConfig;
                break;
            } else {
                this.adminConfigObj = {};
            }
        } catch(err) {
            this.adminConfigObj = {};
            console.log(`Not found the adminConfig file in ${dir} folder`);
        }
    }
}

}

let adminConfigService = new AdminConfigService();
module.exports = {
  adminConfigService
};