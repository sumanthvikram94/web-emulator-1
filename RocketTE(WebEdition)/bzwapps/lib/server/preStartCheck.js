
const jsonUtils = require('../zlux/zlux-proxy-server/js/jsonUtils.js');
const reader = require('../zlux/zlux-proxy-server/js/reader.js');
const encryptor = require('../zlux/zlux-proxy-server/js/encryption.js');
const fs = require('../zlux/zlux-proxy-server/js/node_modules/fs-extra');
const path = require('path');
const util = require('util');
const tokenKey = ';lavoi312-23!!230(;as^alds8*.mv%';
const tokenIv = '2%&_=AVad1!;sa[}';
const schemaValidate = require('./schemaValidate');
const portfinder = require('../zlux/zlux-proxy-server/js/node_modules/portfinder');
const PATH_CONFIG_INSTANCE = path.join(__dirname, '../../deploy/instance/ZLUX/serverConfig/zluxserver.json');
const PATH_CONFIG_PM2 = path.join(__dirname, './config.json');
const process = require('process');


//check node version
const nodeV = process.version; //v20.2.0  ,v0.9.9,v10.16.2
const nodeVnum = Number(nodeV.substring(1, nodeV.indexOf('.')))//get the major version
if(nodeVnum<16){  //from 10.2.0, the supported node version is v16 and later
    console.error('\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error('\n[ERROR]: Your Node.js version is '+nodeV+ ', which has reached end-of-life. Please upgrade to Node.js 16.x or later.\n');
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
    process.exit(1);
}

if (!fs.existsSync(PATH_CONFIG_INSTANCE)){
    console.error('\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error('\n!!! [ERROR]: Server config file not exist. \nExpected file is: ' + PATH_CONFIG_INSTANCE + '\n');
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
    process.exit(1);
}
let userConfig = jsonUtils.parseJSONWithComments(PATH_CONFIG_INSTANCE);
if (!userConfig){
    console.error('\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error('\n!!! [ERROR]: Server config file not correct\n');
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
    process.exit(1);
}
const httpPort = userConfig.node.http ? userConfig.node.http.port : null
const httpsPort = userConfig.node.https ? userConfig.node.https.port :null

if (httpPort) {
    portfinder.getPort({port:httpPort, stopPort:httpPort}, (err, p) => {
        if (err) {
            console.error('\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
            console.error(`HTTP Port: ${httpPort} is occupied, please check it!`);
            console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
            process.exit(1);
        } else {
            console.log(`HTTP Port: ${httpPort} is not occupied`);
        }
    })
}

if (httpsPort) {
    portfinder.getPort({port:httpsPort, stopPort:httpsPort}, (err, p) => {
        if (err) {
            console.error('\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
            console.error(`HTTPS Port: ${httpsPort} is occupied, please check it!`);
            console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
            process.exit(1);
        } else {
            console.log(`HTTPS Port: ${httpsPort} is not occupied`);
        }
    })
}

console.log('[INFO]: Server config read from :' + PATH_CONFIG_INSTANCE);

if (userConfig.node && userConfig.node.https && userConfig.node.https.pfx && !userConfig.node.https.token) {
    
    if (typeof userConfig.node.https.pfx !== 'string'){
        console.error('\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        console.error('\n!!! [ERROR]: pfx must be a string\n');
        console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
        process.exit(1);
    }
    const pfxPath = path.resolve(__dirname, '../', userConfig.node.https.pfx);
    if (!fs.existsSync(pfxPath)){
        console.error('\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        console.error('!!! [ERROR]: The PFX file configured can not be found');
        console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
        process.exit(1);
    }

    if (!fs.existsSync(PATH_CONFIG_PM2)){
        console.error('\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        console.error('\n!!! [ERROR]: PM2 config file not exist. \nExpected file is: ' + PATH_CONFIG_PM2 + '\n');
        console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
        process.exit(1);
    }

    const r = new reader();
    const httpsShow = '\n'+
                      '\n=================================================='+
                      '\n   H     H  TTTTTTT  TTTTTTT  PPPPPP       SS'+
                      '\n   H     H     T        T     P     P   S     S'+
                      '\n   H     H     T        T     P     P    S'+
                      '\n   HHHHHHH     T        T     PPPPPP       S'+
                      '\n   H     H     T        T     P              S'+
                      '\n   H     H     T        T     P         S     S'+
                      '\n   H     H     T        T     P           SS'+
                      '\n=================================================='+
                      '\n\n';
    const passphrase = r.readPasswordSync(httpsShow + 'Please input passphrase for PFX certification: <Press Enter if no passphrase>');
    let passToken = '';
    
    if (passphrase === ''){
        console.error('\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        console.error('!!! [WARNING]: Empty passphrase will be used when start HTTPS server');
        console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
    } else {
        const en = new util.TextEncoder();
        passToken = encryptor.encryptWithKeyAndIV(passphrase, en.encode(tokenKey), en.encode(tokenIv));
    }
    if (!fs.existsSync(PATH_CONFIG_PM2)){
        console.error('\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        console.error('\n!!! [ERROR]: PM2 config file not exist. \nExpected file is: ' + PATH_CONFIG_PM2 + '\n');
        console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
        process.exit(1);
    }
    const pm2Config = jsonUtils.parseJSONWithComments(PATH_CONFIG_PM2);

    if (pm2Config && pm2Config.apps && pm2Config.apps[0]){
        if (passphrase === '' && pm2Config.apps[0]['env'] && pm2Config.apps[0]['env']['PFX_TOKEN']) {
            // console.log('DEBUG: deleting PFX_TOKEN');
            delete pm2Config.apps[0]['env']['PFX_TOKEN'];
        } else if (passphrase && passphrase !== '') {
            // console.log('DEBUG: adding PFX_TOKEN');
            pm2Config.apps[0]['env'] = Object.assign(pm2Config.apps[0]['env'], {PFX_TOKEN:passToken});
        }
        try{
            fs.writeFileSync(PATH_CONFIG_PM2,JSON.stringify(pm2Config,null,2), {encoding: 'ascii'}); 

            // Here need return a special code to shell to indicate that the file content is changed.
            // On z/OS, the file needs a chtag -tc819, otherwise the page code is incorrect.
            process.exitCode = 200; 
        }catch(e){
            console.error('\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
            console.error('\n!!! [ERROR]: Failed writting to config.json, error is: ' + e.message);
            console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
            process.exit(1);
        }
    } else {
        console.error('\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        console.error('\n!!! [ERROR]: Failed writting to config.json, file format is not correct');
        console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
        process.exit(1);
    }

}

schemaValidate.valid();