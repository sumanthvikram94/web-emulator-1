const bzdb = require('../../../bzshared/lib/services/bzdb.service');
const UpgradeTo10_1_1 = require('./upgradeTo10_1_1.service'); // upgrad to 10.1.1 
const Utiles =  require('../services/utils.service');

class UpgradeTo10_1_5Service  extends UpgradeTo10_1_1 {

    /**
     * Constructor
     * @param {Object} context - The plugin context of which invoking this class
     */
    constructor(context){
        super(context);
        this.context = context
        this.logger = context.logger
        this.deployPath = this.context.plugin.server.config.user.rootDir
        this.bzw2hMode = this.context.plugin.server.config.user.bzw2hMode;
        this.upgradePath = this.deployPath.replace('deploy', 'migrate')
        this.backupPath = this.deployPath.replace('deploy', 'backup');
        this.utiles = new Utiles(context);
    }

    async doUpgrade(migratePath){
        //reset the path
        this.upgradePath = migratePath?migratePath:this.upgradePath; 

        let result = {status:true};  //init
        this.logger.info(`start the 10.1.5.2 upgradation.`)
        /**
         * either 'Run scripts' or 'Edit scripts' is enabled，
         * the 'Record, import, edit, run and delete self-defined scripts' should be enabled, 
         * add 'Run and view pre-defined scrpts' item
         */
        if(result.status){ 
            this.logger.info(`start do upgrade - script privilege.`); 
            const scriptPrivilegeResult = await this.convertScriptPrivilegeInGroup(); 
            result = Object.assign(result,scriptPrivilegeResult);
        }

        /**
         * update shared script status to public, add attribute 'shared' in it 
         * when the script upgrade from product or site folder. 
         */
        if(result.status){ 
            this.logger.info(`start do upgrade - update shared script status.`); 
            const sharedStatusResult = await this.convertSharedStatus(); 
            result = Object.assign(result,sharedStatusResult);
        }

        //end upgrade
        if (result.status) {  
            this.logger.info(`finished the 10.1.5.2 upgradation.`)
        } else {
            this.logger.severe(`failed the 10.1.5.2 upgradation.`) 
        }
        return result;
    }

    async convertSharedStatus() {
        this.logger.info('== Start to convert script privlilege in Group');
        return await this.updateSharedStatus();
    }

    async convertScriptPrivilegeInGroup() {
        this.logger.info('== Start to update script data in scriptShared');
        return await this.updateScriptPrivilegeInGroup();
    }

    async updateSharedStatus() {
        let result = true;
        try {
            let scriptSharedDatas = await bzdb.select("scriptShared");
            let batchTxnData=[];
            let hasChange = false;
            if(scriptSharedDatas.rowCount>0){
                for(let script of scriptSharedDatas.data){
                    if(script.shared===undefined && (script.id ===  script.type + "_" + script.name)){
                        script.shared = true;
                        hasChange = true
                    }
                    if(hasChange){
                        batchTxnData.push({dataEntityName: "scriptShared", action: 'UPDATEORINSERT', value: script})
                        hasChange = false;
                    }
                }
            }
            if(batchTxnData.length>0){
                this.logger.info(`update script data count ${batchTxnData.length}`);
                const rtn= await bzdb.batchTxn(batchTxnData);
                result=rtn.status;
                if(!rtn.status){
                    this.logger.severe(`failed, ${rtn.message}`);  
                }
            }else{
                this.logger.info(`no script need to be updated`);
            }
        } catch (error) {
            result = false;
            this.logger.severe(`Convert script data in scriptShared failed: ${JSON.stringify(error.message)}`);
        }
        return  {status:result};
    }
    
    async updateScriptPrivilegeInGroup() {
        let result = true;
        try {
            let groupDatas = await bzdb.select("group");
            let batchTxnData=[];
            let hasChange = false;
            if(groupDatas.rowCount>0){
                for(let g =0; g < groupDatas.rowCount; g++){
                    if(groupDatas.data[g].privileges.enablePrivateScript===undefined){ //if not, exist prividge will be overwrite
                        groupDatas.data[g].privileges.enablePrivateScript = !!(groupDatas.data[g].privileges.enableRecorder || groupDatas.data[g].privileges.enablePlayScript);
                        // delete groupDatas.data[g].privileges.enableRecorder;
                        // delete groupDatas.data[g].privileges.enablePlayScript;
                        hasChange = true;
                    }
                    if(hasChange){
                        batchTxnData.push({dataEntityName: "group", action: 'UPDATEORINSERT', value: groupDatas.data[g]})
                        hasChange = false;
                    }
                }
            }
            if(batchTxnData.length>0){
                this.logger.info(`update script privilege count ${batchTxnData.length}`);
                const rtn= await bzdb.batchTxn(batchTxnData);
                result=rtn.status;
                if(!rtn.status){
                    this.logger.severe(`failed, ${rtn.message}`);  
                }
            }else{
                this.logger.info(`no group need to be updated`);
            }
        } catch (error) {
            result = false;
            this.logger.severe(`Convert script privlilege in Group failed: ${JSON.stringify(error.message)}`);
        }
        return  {status:result};
    }
}
module.exports = UpgradeTo10_1_5Service;
