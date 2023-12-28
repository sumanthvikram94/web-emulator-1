const jsonUtils = require('../zlux/zlux-proxy-server/js/jsonUtils.js');
const fs = require('../zlux/zlux-proxy-server/js/node_modules/fs-extra');
const path = require('path');
const NODE_CONFIG = path.join(__dirname, '../../deploy/instance/ZLUX/serverConfig/nodejsConfig.json');
const process = require('process');
try {
    const formatFileName = path.join(__dirname, './windowServerFormat.json');
    if (fs.existsSync(formatFileName)) fs.unlinkSync(formatFileName);
    const serverConfig = path.join(__dirname, './windowServer.json'); // add
    const configObj = jsonUtils.parseJSONWithComments(serverConfig);
    //PM2 does not work well in node_args if set --openssl-config
    setNodeOptions(configObj)
    
    fs.writeFileSync(formatFileName, JSON.stringify(configObj, null, 2)); //a copy of windowServerFormat.json
    console.log('Format config file succeed');
} catch (err) {
    console.error(err);
    process.exit(1);
}

function setNodeOptions(configObj){
    //check whether allow weak Cipher (TLS1.0 & 1.1)
    const serverConfig = path.join(__dirname, './windowServer.json'); // add
    let nodeObject =fs.existsSync(NODE_CONFIG)?jsonUtils.parseJSONWithComments(NODE_CONFIG):null;
    const nodeV = process.version;
    const nodeVnum = Number(nodeV.substring(1, nodeV.indexOf('.')))//since from nodejs 17, openssl upgrade to 3.0
    let options = new Array();
    const LEGACYPROVIDER = "--openssl-legacy-provider"
    const OPENSSLCONFIG = "--tls-cipher-list=DEFAULT@SECLEVEL=0"
    if (configObj.apps[0].env.NODE_OPTIONS) {
        options = configObj.apps[0].env.NODE_OPTIONS.split(' ')
    }
    if (nodeVnum >= 17) {   //allow Weak Cipher (TLS1.0 & 1.1)
        if(nodeObject && nodeObject.opensslWeakCiphers){
            if (!options.includes(OPENSSLCONFIG)) options.push(OPENSSLCONFIG) //add
        }else{
            if (options.includes(OPENSSLCONFIG)) options.splice(options.indexOf(OPENSSLCONFIG)) //remove
        }
        if(nodeObject && nodeObject.opensslLegacyProvider){
            if (!options.includes(LEGACYPROVIDER)) options.push(LEGACYPROVIDER) //add
        }else{
            if (options.includes(LEGACYPROVIDER)) options.splice(options.indexOf(LEGACYPROVIDER)) //remove
        }
        configObj.apps[0].env.NODE_OPTIONS = options.join(' ');
        if(configObj.apps[0].env.NODE_OPTIONS=='')delete configObj.apps[0].env.NODE_OPTIONS
        fs.writeFileSync(serverConfig, JSON.stringify(configObj, null, 2)); // update NODE_OPTIONS to  windowServer.json 
    }else{
        if (options.includes(LEGACYPROVIDER) || options.includes(OPENSSLCONFIG)) { // remove
            if (options.includes(LEGACYPROVIDER)) options.splice(options.indexOf(LEGACYPROVIDER))
            if (options.includes(OPENSSLCONFIG)) options.splice(options.indexOf(OPENSSLCONFIG)) 
            configObj.apps[0].env.NODE_OPTIONS = options.join(' ');
            if(configObj.apps[0].env.NODE_OPTIONS=='')delete configObj.apps[0].env.NODE_OPTIONS
            fs.writeFileSync(serverConfig, JSON.stringify(configObj, null, 2)); // update NODE_OPTIONS to  windowServer.json
        }
    }
}
