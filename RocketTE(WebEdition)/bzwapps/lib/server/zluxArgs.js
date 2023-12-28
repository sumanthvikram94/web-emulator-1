
/*
  © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
  ROCKET SOFTWARE, INC. CONFIDENTIAL
*/
'use strict';
const ProxyServer = require('../zlux/zlux-proxy-server/js/index');
const argParser = require('../zlux/zlux-proxy-server/js/argumentParser.js');
const jsonUtils = require('../zlux/zlux-proxy-server/js/jsonUtils.js');

const PRODUCT_CODE = 'ZLUX';


const appConfig = {
    productCode: PRODUCT_CODE,
    // rootRedirectURL: '/' + PRODUCT_CODE + '/plugins/com.rs.zoe.dbbrowser/web/',
    oldRootRedirectURL: '/' + PRODUCT_CODE + '/plugins/com.rs.mvd/web/?pluginId=com.rs.bzw',
    rootRedirectURL: '/' + PRODUCT_CODE + '/plugins/com.rs.bzw/web/',
    bzadmRedirectURL: '/' + PRODUCT_CODE + '/plugins/com.rs.bzadm/web/',
    ssoRedirectURL: '/' + PRODUCT_CODE + '/plugins/com.rs.ssoController/services/ssoController/login',
    ssoConfigPath: `../deploy/instance/${PRODUCT_CODE}/pluginStorage/com.rs.ssoAuth/_internal/plugin/ssoServerConfig.json`,

    rootServices: [ // These APIs are not in used by RTE, and they have "Code Injection" issues of veracode scan.
      // {
      //   method: '*',
      //   url: '/login',
      //   requiresAuth: false
      // },
      // {
      //   method: '*',
      //   url: '/logout',
      // },
      // {
      //   method: '*',
      //   url: '/unixFileContents'
      // },
      // {
      //   method: '*',
      //   url: '/unixFileMetadata'
      // },
      // {
      //   method: '*',
      //   url: '/datasetContents'
      // },
      // {
      //   method: '*',
      //   url: '/VSAMdatasetContents'
      // },
      // {
      //   method: '*',
      //   url: '/datasetMetadata'
      // },
      // {
      //   method: '*',
      //   url: '/config'
      // },
      // {
      //   method: '*',
      //   url: '/ras'
      // }  
   ]
};

const DEFAULT_CONFIG = {
  "rootDir":"../deploy",
  "productDir":"../deploy/product",
  "siteDir":"../deploy/site",
  "instanceDir":"../deploy/instance",
  "groupsDir":"../deploy/instance/groups",
  "usersDir":"../deploy/instance/users",
  "pluginsDir":"../deploy/instance/"+PRODUCT_CODE+"/plugins",
  "node": {
    "http": {
      "port": 8543
    }
  },
  // we can config the different user to open different session in future, such as:  "sessionNames": ['aa']
  "sessionMode": {
    "headerless": false, // used for headerless mode of blueZone web.
    "singleSession": true
  },
  "dataserviceAuthentication": {
    "defaultAuthentication": "fallback",
    "implementationDefaults": {
      "fallback": {
        "plugins": ["com.rs.internalAuth"]
      }
    }
  },
  "zssPort":8542
};

const browserMessagePath = '../config/client/browserMessage.json';
const authenticationConfigPath= `../deploy/instance/${PRODUCT_CODE}/pluginStorage/com.rs.bzshared/_db_store/authConfig/authentication.json`;
const MVD_ARGS = [
  new argParser.CLIArgument('config', 'c', argParser.constants.ARG_TYPE_VALUE),
  new argParser.CLIArgument('hostServer', 'h', argParser.constants.ARG_TYPE_VALUE),
  new argParser.CLIArgument('hostPort', 'P', argParser.constants.ARG_TYPE_VALUE),  
  new argParser.CLIArgument('port', 'p', argParser.constants.ARG_TYPE_VALUE),  
  new argParser.CLIArgument('securePort', 's', argParser.constants.ARG_TYPE_VALUE),  
  new argParser.CLIArgument('noPrompt', null, argParser.constants.ARG_TYPE_FLAG),
  new argParser.CLIArgument('noChild', null, argParser.constants.ARG_TYPE_FLAG),
  new argParser.CLIArgument('allowInvalidTLSProxy', null, 
      argParser.constants.ARG_TYPE_VALUE),
];



var config;
var zssHost = '127.0.0.1';
var commandArgs = process.argv.slice(2);
var argumentParser = argParser.createParser(MVD_ARGS);
var userInput = argumentParser.parse(commandArgs);
var noPrompt = false;
if (userInput.noPrompt) {
  noPrompt = true;
}
if (!userInput.config) {
  console.log('Missing one or more parameters required to run.');
  console.log('config file was '+userInput.config);
  process.exit(-1);
}
const configJSON = DEFAULT_CONFIG;
try {
  const browserMessage = jsonUtils.parseJSONWithComments(browserMessagePath); //Read the unsupport browser message
  configJSON['browserMessage'] = browserMessage;
} catch (error) {
  console.log('Browser Message content is not exist or invalid');
}

const userConfig = jsonUtils.parseJSONWithComments(userInput.config);



for (const attribute in userConfig) { 
  configJSON[attribute] = userConfig[attribute]; 
}

const securityHeaderConfig =userInput.config.substring(0,userInput.config.lastIndexOf("/")+1)+ 'securityHeader.json';
try{
  const securityHeaderContent = jsonUtils.parseJSONWithComments(securityHeaderConfig);
  configJSON["securityHeader"]=securityHeaderContent; //add securityHeader context
  console.log('load security Header Content successful');
}catch(err){
  console.log('security Header Content is not exist or invalid');
}
try{
  const authentication=jsonUtils.parseJSONWithComments(authenticationConfigPath);

  if(authentication){
    configJSON.dataserviceAuthentication=authentication.dataserviceAuthentication  //overwrite the zluxserver.json defined dataserviceAuthentication
  }
}catch(err){
  console.log('Not found the dataserviceAuthentication in authentication.json from _db_store folder');
}

const adminConfigs = ['instance', 'product'];

for(let dir of adminConfigs) {
  const adminConfigPath = `../deploy/${dir}/${PRODUCT_CODE}/pluginStorage/com.rs.bzadm/configurations/adminConfig.json`; //adminConfig path
  
  try{
    const adminConfig = jsonUtils.parseJSONWithComments(adminConfigPath); // get adminConfig
  
    // set adminConfigPath
    if(adminConfig) {
      configJSON.adminConfig = adminConfig;
    } else {
      configJSON.adminConfig = {};
    }
    break;
  } catch(err) {
    configJSON.adminConfig = {};
    console.log(`Failed to parse adminConfig file in ${dir} folder, error: ${err.message}`);
  }
}

let hostPort = userInput.hostPort;
if (!hostPort) {
  hostPort = configJSON.zssPort;
}
if (userInput.hostServer) {
  zssHost = userInput.hostServer;
}
if (userInput.port) {
  configJSON.node.http.port = userInput.port;
}
if (userInput.securePort && configJSON.https) {
  configJSON.node.https.port = userInput.securePort;
}
if (userInput.noChild) {
  delete configJSON.node.childProcesses;
}
const startUpConfig = {
  proxiedHost: zssHost,
  proxiedPort: hostPort,
  allowInvalidTLSProxy: (userInput.allowInvalidTLSProxy === 'true')
};

//appConfig["zluxServerConfig"]=JSON.parse(JSON.stringify(configJSON)); //a copy data for auth change check
global.zoweServerConfig={"zluxServerConfig": JSON.parse(JSON.stringify(configJSON))}; //for all the node model to use

module.exports = function() {
  return {appConfig: appConfig, configJSON: configJSON, startUpConfig: startUpConfig}
}
/*
  © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
  ROCKET SOFTWARE, INC. CONFIDENTIAL
*/
