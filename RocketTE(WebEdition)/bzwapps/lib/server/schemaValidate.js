
const fs = require('../zlux/zlux-proxy-server/js/node_modules/fs-extra/lib');
const path = require('path');
const Validator = require('../zlux/zlux-proxy-server/js/node_modules/jsonschema/lib').Validator;
const jsonUtils = require('../zlux/zlux-proxy-server/js/jsonUtils.js');
const PATH_SCHEMA_CONFIG = path.join(__dirname, '../../deploy/product/ZLUX/pluginStorage/com.rs.bzshared/_schema');
const PATH_AUTHENTICATION = path.join(__dirname, '../../deploy/instance/ZLUX/pluginStorage/com.rs.bzshared/_db_store/authConfig/authentication.json');
const PATH_INSTANCE = path.join(__dirname, '../../deploy/instance/ZLUX/');
const SCHEMA_VALIDATE_FILE = {
    '_schema_totp_config.json': [PATH_AUTHENTICATION, path.join(PATH_INSTANCE, 'serverConfig/zluxserver.json')]
};
const VALIDATE_PATH = {
    '_schema_totp_config.json': 'dataserviceAuthentication.twoFactorAuthentication.TOTP.config'
};

class SchemaValidate{

    constructor(){
        this.validator = new Validator();
        this.hasError = false
    }

    valid(){
        // Object.keys(SCHEMA_VALIDATE_FILE).forEach(schema => {
        for(const schema in SCHEMA_VALIDATE_FILE){
            const schemaPath = path.join(PATH_SCHEMA_CONFIG,schema);
            if(fs.existsSync(schemaPath)){
                const schemaContent = jsonUtils.parseJSONWithComments(schemaPath); 
                const configPathArr = SCHEMA_VALIDATE_FILE[schema];
                for(const configPath of configPathArr){
                    if(fs.existsSync(configPath)){
                        let configContent = jsonUtils.parseJSONWithComments(configPath); 
                        const partContent = VALIDATE_PATH[schema];
                        if(partContent){
                            for(const attr of partContent.split('.')){
                                configContent = (configContent || {})[attr];
                            }
                        }
                        const validation = this.validator.validate(configContent,schemaContent);
                        if(!validation.valid){
                            this.hasError = true
                            const errors = validation.errors;
                            for(const error of errors){
                                console.error('\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
                                console.error(`ERROR in ${configPath}:  ${error.stack.replace("instance."," ")}, please check it!`);
                                console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
                            }
                        }
                    }
                }
            }
        }
        if(this.hasError){
            process.exit(1);
        }
    }

    // validateMFAConfig(userConfig){
    //     let mfaInfo = {};
    //     if (fs.existsSync(PATH_AUTHENTICATION)){
    //         const authData = jsonUtils.parseJSONWithComments(PATH_AUTHENTICATION);
    //         mfaInfo = authData.dataserviceAuthentication.twoFactorAuthentication;
    //     }else{
    //         mfaInfo = userConfig.dataserviceAuthentication.twoFactorAuthentication;
    //     }
    //     if(mfaInfo.enabled && mfaInfo.defaultType === 'TOTP'){
    //         const v = new Validator();
    //         const schemaConfiFile = path.join(PATH_SCHEMA_CONFIG,"_schema_totp_config.json");
    //         if (fs.existsSync(schemaConfiFile)) {
    //             const schemaContent = jsonUtils.parseJSONWithComments(schemaConfiFile);
    //             const totpConfig = mfaInfo.TOTP.config
    //             if(!v.validate(totpConfig, schemaContent).valid){
    //                 const errors = v.validate(totpConfig, schemaContent).errors;
    //                 for(const error of errors){
    //                     console.error('\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    //                     console.error(`ERROR:  ${error.stack.replace("instance.","TOTP config: ")}, please check it!`);
    //                     console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
    //                 }
    //                 process.exit(1);
    //             }
    //         }
    //     }
    // }
}

const schemaValidate = new SchemaValidate();

module.exports = schemaValidate;


