const bzdb = require('../../../bzshared/lib/services/bzdb.service');
const UpgradeTo10_1_1 = require('./upgradeTo10_1_1.service'); // upgrad to 10.1.1 
const DB_STORE_PATH = '/instance/ZLUX/pluginStorage/com.rs.bzshared/_db_store';
class UpgradeTo10_1_3Service extends UpgradeTo10_1_1 {

    /**
     * Constructor
     * @param {Object} context - The plugin context of which invoking this class
     */
    constructor(context){
        super(context);
        this.context = context
        this.logger = context.logger
    }

    async doUpgrade(versionFlag, migratePath,oldVersion, before1011){
        let result = {status:true};  //init
        this.upgradePath = migratePath?migratePath:this.upgradePath;
        /*
          convertKeyboardMapping  
            1. update keymapping to 10.1.3 from 10.1.1
            2. don't need update keymapping again if upgraded from 1.2.0, because it has used the latest default template to upgrade keyboard.
        */
        if(result.status && !before1011){ 
            this.logger.info(`start do upgrade - KeyboardMapping.`);
            const keyboardresult = await this.convertKeyboardMapping(versionFlag); // conver keyboard mappings
            result = Object.assign(result,keyboardresult);
        }

        //end upgrade
        if(result.status){  
            this.logger.info(`finished the 10.1.3 upgradation.`)
        }else{
            this.logger.severe(`failed the 10.1.3 upgradation.`) 
        }
        return result;
    }

    async convertKeyboardMapping() {
        this.logger.info('== Start to convert keyboardMapping');
        return await this.updateKeyboardMappingForNewDefaultConfiguration('handleDataAfterV120');
    }

    getKeyboardPath() {
        const upgradeKeyboardPath = `${this.upgradePath}${DB_STORE_PATH}/keyboardMappingShared/`;
        const deployKeyboardPath = `${this.deployPath}${DB_STORE_PATH}/keyboardMappingShared/`;
        const upgradeKeyboardIDPath = `${this.upgradePath}${DB_STORE_PATH}/keyboardMapping/keyboardMapping.json`;
        const deployKeyboardIDPath = `${this.deployPath}${DB_STORE_PATH}/keyboardMapping/keyboardMapping.json`

        return {upgradeKeyboardPath, deployKeyboardPath, upgradeKeyboardIDPath, deployKeyboardIDPath};
    }

    getUserKeyboardPath(kpath, id) {
        return `${kpath}/K_${id}.json`; 
    }

    async updateKeyboardMappingWithNewConfigtuation(newMappings, plugin, flag) {
        try {
            if (plugin === 'com.rs.bzadm') {
                const batchTxnData = [];
                (newMappings || []).forEach(data => {
                    batchTxnData.push({dataEntityName: 'keyboardMappingShared', action:'UPDATEORINSERT', value: data, options:{}})  
                })
               
                await bzdb.batchTxn(batchTxnData);

            } else if (plugin === 'com.rs.bzw') {
                super.updateKeyboardMappingWithNewConfigtuation(newMappings, plugin, flag);
            }
        } catch (error) {
            this.logger.info(`Update TE admin and web keyboard infomation failed: ${JSON.stringify(error.message)}`);
        }
    }
}
module.exports = UpgradeTo10_1_3Service;
