/**
 * Any specific code that has different action on ZOWE platform should be handled with this service.
 * 
 * Author: Jian Gao (jgao@rocketsoftware.com)
 */

const path = require('path');
const fs = require('fs-extra');
const logger = global.COM_RS_COMMON_LOGGER.makeComponentLogger("bzw.install");
const ZOWE_CONFIG_FILE_PATH = './config/storageDefaults'
let globalConfig= global.zoweServerConfig;

let zoweWorkspaceDir= process.env.ZWE_zowe_workspaceDirectory;

let zoweLibDir = path.join(process.cwd(), '../../zlux-server-framework/lib');
// When BZW runs on ZOWE, ldap/mssql auth doesn't exsit in zowe code. So ldapHelper and mssqlHelper will be copied into bzshared/lib/auth
let authRootDir = path.join(__dirname, '../auth');
let isOnZowe = true;
let defaltAPIVersion ='/_current';
let configJsName = 'org.zowe.configjs';
if (process.env.APP_MODE && process.env.APP_MODE === 'STANDALONE'){
  zoweLibDir = path.join(__dirname, '../../../../lib/zlux/zlux-proxy-server/js');
  authRootDir = path.join(__dirname, '../../../../lib/auth');
  isOnZowe = false;
  defaltAPIVersion = '';
  configJsName =  'com.rs.configjs';
  zoweWorkspaceDir = null;
// } else {
  // const {appConfig, configJSON, startUpConfig, configLocation} = require(process.env.zoweLibDir + './zluxArgs')();
  // const util = require(path.join(process.cwd(), '../../zlux-server-framework/lib/util'));
  // util.resolveRelativePaths(configJSON, util.normalizePath, process.cwd());  //Modify the relative path to an absolute path

  // globalConfig = configJSON;  //all zowe config ,come from merged zowe.yaml

  // zoweWorkspaceDir = globalConfig.workspaceDirectory;

  // if(!zoweWorkspaceDir && process.env.ZWE_CLI_PARAMETER_CONFIG){
  //   zoweWorkspaceDir = path.dirname(process.env.ZWE_CLI_PARAMETER_CONFIG)
  // }
  // logger.console.warn('Setting zowe work dir to :' + zoweWorkspaceDir);
}

if (isOnZowe) {
  logger.info('BZW Plugin runs on ZOWE platform.');
  logger.info('BZW workspacedir DIR is: ' + zoweWorkspaceDir);
}
logger.info('ZOWE lib dir is: ' + zoweLibDir);
logger.info('AUTH root dir is: ' + authRootDir);

const jsonUtils = require(zoweLibDir + '/jsonUtils');
const encryption = require(zoweLibDir + '/encryption');

const grantDefaultPrivileges = (privileges) => {
  Object.keys(privileges).forEach(key => {
    privileges[key] = true;
  });
}

const isAdminAccount = (context, username) => {
  const fileName = path.join(context.plugin.server.state.pluginMap['com.rs.bzw'].location, ZOWE_CONFIG_FILE_PATH,'/permission/admins.json');
  if(fs.existsSync(fileName)){
    try {
      const jsonData=jsonUtils.parseJSONWithComments(fileName);
      if (jsonData.adminIDs && Array.isArray(jsonData.adminIDs) && (jsonData.adminIDs.includes(username) || jsonData.adminIDs.includes('__ANY_LOGIN_ID__'))){
        return true;
      }
    } catch (e) {
      console.error(e);
      return false;
    }
  }
  return false;
}


const getPluginProductFilePath = (context,pluginDef) => {
  if(isOnZowe){
    const pluginLocation = pluginDef ? context.plugin.server.state.pluginMap[pluginDef].location : context.plugin.pluginDef.location
    return path.join(pluginLocation, ZOWE_CONFIG_FILE_PATH)
  }
  if(pluginDef == null) {
    pluginDef = context.plugin.pluginDef.identifier;
  }
  
  return path.join(context.plugin.server.config.user.productDir,'ZLUX/pluginStorage/',pluginDef)
}

const getPluginInstanceFilePath = (context,pluginDef) => {
  if(isOnZowe){
    const pluginLocation = pluginDef ? context.plugin.server.state.pluginMap[pluginDef].location : context.plugin.pluginDef.location
    return path.join(pluginLocation, ZOWE_CONFIG_FILE_PATH)
  }
  if(pluginDef == null) {
    pluginDef = context.plugin.pluginDef.identifier;
  }
  return path.join(context.plugin.server.config.user.instanceDir,'ZLUX/pluginStorage/',pluginDef)
}

const loggerPath = isOnZowe? path.join(process.cwd(), '/../../zlux-shared/src/logging/logger') : '../../../../lib/zlux/zlux-shared/src/logging/logger';
const instanceDir = isOnZowe? path.relative(process.cwd(), zoweWorkspaceDir + '/app-server'): '../deploy/instance';

// get relative path to db_store folder on zowe
// const getRelativePathToDBStore = (plugin,subFilePath) => {
//   const dbStorePath = instanceDir + '/ZLUX/pluginStorage/com.rs.bzshared/';
//   return path.relative(dbStorePath,path.join(zoweWorkspaceDir, `../extensions/rocket-te-web/${plugin}/config/storageDefaults/${subFilePath}`))
// }

// const productDir = isOnZowe? globalConfig.productDir : '../deploy/product';
module.exports = {
    jsonUtils: jsonUtils,
    encryption: encryption,
    isOnZowe: isOnZowe,
    zoweWorkspaceDir: zoweWorkspaceDir,
    instanceDir: instanceDir,
    // productDir: productDir,
    defaltAPIVersion: defaltAPIVersion,
    configJsName: configJsName,
    grantDefaultPrivileges: grantDefaultPrivileges,
    isAdminAccount: isAdminAccount,
    getPluginInstanceFilePath:getPluginInstanceFilePath,
    getPluginProductFilePath:getPluginProductFilePath,
    globalConfig:globalConfig,
    loggerPath: loggerPath,
    jsPath: zoweLibDir
}

if (!isOnZowe) {
  const ldapHelper = require(authRootDir + '/ldap-auth/lib/ldapHelper');
  const mssqlHelper = require(authRootDir + '/mssql-auth/lib/mssqlHelper');
  module.exports.ldapHelper = ldapHelper;
  module.exports.mssqlHelper = mssqlHelper;
}