const bzdb = require('../../../bzshared/lib/services/bzdb.service');
const DB_STORE_PATH = '/instance/ZLUX/pluginStorage/com.rs.bzshared/_db_store';
const UpgradeTo10_1_1 = require('./upgradeTo10_1_1.service'); // upgrad to 10.1.1 
const Utiles =  require('./../services/utils.service');
const path = require('path');
const fse = require('fs-extra');

class UpgradeTo10_1_4Service  extends UpgradeTo10_1_1 {

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
        this.logger.info(`start the 10.1.4 upgradation.`)
        if(result.status){ 
            this.logger.info(`start do upgrade - authConfig.`);
            const authResult = await this.convertDatasource(); // conver datasource
            result = Object.assign(result,authResult);
        }


        /**
         * Only if  'Record scripts' and 'Edit scripts' are both enabled，
         * the 'Record, import, edit and delete self-defined scripts' should be enabled, 
         * otherwise it should be disabled
         */
        if(result.status){ 
            this.logger.info(`start do upgrade - script privilege and view session panel.`); 
            const scriptPrivilegeResult = await this.convertScriptPrivilegeInGroup(); 
            result = Object.assign(result,scriptPrivilegeResult);
        }

        /**
         * Only if mgUserSession is false or undefined , mgUserSession should be false,
         * add viewSession into entitlement and default value is true
         */
        if(result.status){ 
            this.logger.info(`start do upgrade - add administrator privilege - view session.`); 
            const scriptPrivilegeResult = await this.convertAdministratorPrivilege(); 
            result = Object.assign(result,scriptPrivilegeResult);
        }

        /**
         * change group session data structure
         * add the gid value into gids array and remove the gid
         */
        if(result.status){ 
            this.logger.info(`start do upgrade - change group session data structure. gid:string => gids:array`); 
            const scriptPrivilegeResult = await this.changeGroupSessionDataStructure();
            result = Object.assign(result,scriptPrivilegeResult);
        }

        /**
         * add default value 
            "hostBell": false,
			"extensions3270": true,
			"fieldValidation3270": true 
            in preferences.advanced
         */
        if(result.status && !this.bzw2hMode){ 
            this.logger.info(`start do upgrade - add default value in preferences.advanced`); 
            const addAdvancedDefaultResult = await this.changeDefaultValuetInPreferences();
            result = Object.assign(result,addAdvancedDefaultResult);
        }

        if(result.status){ 
            this.logger.info(`start do upgrade - remove Yuan and At keyboard mapping`); 
            const keyboardMappingResult = await this.changeKeyboardMapping();
            result = Object.assign(result,keyboardMappingResult);
        }

        //end upgrade
        if (result.status) {  
            this.logger.info(`finished the 10.1.4 upgradation.`)
        } else {
            this.logger.severe(`failed the 10.1.4 upgradation.`) 
        }
        return result;
    }

    async convertScriptPrivilegeInGroup() {
        this.logger.info('== Start to convert script privlilege in Group');
        return await this.updateScriptPrivilegeInGroup();
    }
    
    async convertAdministratorPrivilege() {
        this.logger.info('== Start to convert administrator privlilege ');
        return await this.updateAdministratorPrivilege();
    }
    
    async changeGroupSessionDataStructure() {
        this.logger.info('== Start to change group session data structure. gid:string => gids:array ');
        return await this.updateGroupSessionData();
    }

    async changeDefaultValuetInPreferences() {
        this.logger.info('== Start to add default value in preferences.advanced or shared session ');
        return await this.updateDefaultValueInPreferences();
    }
    async changeKeyboardMapping() {
        this.logger.info('== Start to remove Yuan and At in keyboard mapping ');
        return await this.updateKeyboardMapping();
    }

    async updateAdministratorPrivilege(){
        let result = true;
        try {
            const administratorsData = await bzdb.select('administrator');
            let batchTxnData=[];
            let hasChange = false;
            if(administratorsData.rowCount > 0) {
                for(const admin of administratorsData.data){
                    if(admin.role === 'groupAdmin'){
                        if(admin.entitlement.mgUserSession === undefined){
                            if(admin.entitlement.mgGpSession !== null && admin.entitlement.mgGpSession === false) {
                                admin.entitlement.mgUserSession = false;
                            }else{
                                admin.entitlement.mgUserSession = true;
                            }
                            hasChange = true;
                        }
                        if(admin.entitlement.viewSession === undefined){
                            admin.entitlement.viewSession = true;
                            hasChange = true;
                        }
                        if(hasChange){
                            batchTxnData.push({dataEntityName: 'administrator', action:'UPDATEORINSERT', value: admin, options:{}})
                            hasChange = false;
                        }
                    }
                }
            }
            if(batchTxnData.length>0){
                this.logger.info(`update administrator privilege count ${batchTxnData.length}`);
                const rtn= await bzdb.batchTxn(batchTxnData);
                result=rtn.status;
                if(!rtn.status){
                    this.logger.severe(`failed, ${rtn.message}`);  
                }
            }else{
                this.logger.info(`no administrator need to be updated`);
            }
        } catch (error) {
            result = false;
            this.logger.severe(`Convert administrator privlilege failed: ${JSON.stringify(error.message)}`);
        }
        return {status:result};
    }

    

    async updateScriptPrivilegeInGroup() {
        let result = true;
        try {
            let groupDatas = await bzdb.select("group");
            let batchTxnData=[];
            let hasChange = false;
            if(groupDatas.rowCount>0){
                for(let g =0; g < groupDatas.rowCount; g++){
                    if(groupDatas.data[g].privileges.enableUseEditor != undefined){
                        groupDatas.data[g].privileges.enableRecorder = groupDatas.data[g].privileges.enableRecorder && groupDatas.data[g].privileges.enableUseEditor;
                        delete groupDatas.data[g].privileges.enableUseEditor;
                        hasChange = true;
                    }
                    if(groupDatas.data[g].privileges.viewSessionPanel === undefined){
                        groupDatas.data[g].privileges.viewSessionPanel = true;
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
            this.logger.severe(`Convert script privlilege in Groupe failed: ${JSON.stringify(error.message)}`);
        }
        return  {status:result};
    }
    
    async updateGroupSessionData() {
        let result = true;
        try {
            let groupSessionData = await bzdb.select("groupSession");
            let batchTxnData=[];
            if(groupSessionData.rowCount>0){
                for(const groupSession of groupSessionData.data){
                    if(groupSession.gids){
                        continue;
                    }else{
                        const gid = groupSession.gid;
                        groupSession.gids = [];
                        if(gid && gid.length > 0){
                            groupSession.gids.push(gid);
                        }
                        groupSession.gid = undefined;
                        batchTxnData.push({dataEntityName: "groupSession", action: 'UPDATEORINSERT', value:groupSession})
                    }
                }
            }
            if(batchTxnData.length>0){
                this.logger.info(` change group session data structure count ${batchTxnData.length}`);
                const rtn= await bzdb.batchTxn(batchTxnData);
                result=rtn.status;
                if(!rtn.status){
                    this.logger.severe(`failed, ${rtn.message}`);  
                }
            }else{
                this.logger.info(`no group session need to be updated`);
            }
        } catch (error) {
            result = false;
            this.logger.severe(`Change group session data structure failed: ${JSON.stringify(error.message)}`);
        }
        return  {status:result};
    }

    async updateDefaultValueInPreferences(){
        const sym = String.fromCharCode(255);
        let result = true;
        let sessionSharedDataMap = {};
        let sessionPrivateDataMap = {};
        let batchTxnData = [];
        try {
            let preferencePrivateData = await bzdb.select("preferencePrivate");
            let sessionSharedData = await bzdb.select("sessionShared");
            let sessionPrivateData = await bzdb.select("sessionPrivate");
            if(sessionSharedData.rowCount > 0){
                for(const sessionS of sessionSharedData.data){
                    if(!sessionS.advanced || (sessionS.advanced && sessionS.advanced.hostBell === undefined)){
                        if(sessionS.type.indexOf('5250') > -1 || sessionS.type.toLowerCase().indexOf('vt') > -1 ){
                            if(!sessionS.advanced){
                                sessionS.advanced = {};
                            }
                            sessionS.advanced.hostBell = false;
                            batchTxnData.push({dataEntityName: "sessionShared", action: 'UPDATEORINSERT', value:sessionS})
                        }else if(sessionS.type.indexOf('3270') > -1){
                            if(!sessionS.advanced){
                                sessionS.advanced = {};
                            }
                            sessionS.advanced.hostBell = false;
                            sessionS.advanced.extensions3270 = true;
                            sessionS.advanced.fieldValidation3270 = true;
                            batchTxnData.push({dataEntityName: "sessionShared", action: 'UPDATEORINSERT', value:sessionS})
                        }
                    }
                    sessionSharedDataMap[sessionS.id] = sessionS.type;
                }
            }
            if(sessionPrivateData.rowCount > 0){
                for(const sessionP of sessionPrivateData.data){
                    sessionPrivateDataMap[sessionP.id] = sessionP.sessionType;
                }
            }
            let preferenceId = '';
            let sessionId = '';
            if(preferencePrivateData.rowCount>0){
                for(const preference of preferencePrivateData.data){
                    if(!preference.advanced || (preference.advanced && preference.advanced.hostBell === undefined)){
                        preferenceId = preference.id
                        sessionId = preferenceId.substring(preferenceId.indexOf(sym)+1,preferenceId.lastIndexOf('_preferences'))
                        const sessionType = sessionSharedDataMap[sessionId] || sessionPrivateDataMap[sessionId];
                        if(sessionType && sessionType.indexOf('5250') > -1 || sessionType && sessionType.toLowerCase().indexOf('vt') > -1){
                            if(!preference.advanced) preference.advanced = {}
                            preference.advanced.hostBell = false;
                            batchTxnData.push({dataEntityName: "preferencePrivate", action: 'UPDATEORINSERT', value:preference})
                        }else if(sessionType && sessionType.indexOf('3270') > -1){
                            if(!preference.advanced) preference.advanced = {}
                            preference.advanced.hostBell = false;
                            preference.advanced.extensions3270 = true;
                            preference.advanced.fieldValidation3270 = true;
                            batchTxnData.push({dataEntityName: "preferencePrivate", action: 'UPDATEORINSERT', value:preference})
                        }
                    }
                }
            }
            if(batchTxnData.length>0){
                this.logger.info(` change group session data structure count ${batchTxnData.length}`);
                const rtn= await bzdb.batchTxn(batchTxnData);
                result=rtn.status;
                if(!rtn.status){
                    this.logger.severe(`failed, ${rtn.message}`);  
                }
            }else{
                this.logger.info(`no group session need to be updated`);
            }
        } catch (error) {
            result = false;
            this.logger.severe(`Change group session data structure failed: ${JSON.stringify(error.message)}`);
        }
        return  {status:result};
    }

    async updateKeyboardMapping(){
        let result = true;
        let batchTxnData = [];
        try {
            let keyboardMappingShared = await bzdb.select("keyboardMappingShared");
            if(keyboardMappingShared.rowCount > 0){
                for(const item of keyboardMappingShared.data){
                    let isDelete = false;
                    if(Array.isArray(item.keyboardMapping)) {
                        const i = item.keyboardMapping.findIndex(e => e.key === 'Yuan');
                        if (i > -1) {
                            item.keyboardMapping.splice(i,1);
                            isDelete = true;
                        }
                        const j = item.keyboardMapping.findIndex(e => e.key === 'At');
                        if (j > -1) {
                            item.keyboardMapping.splice(j,1);
                            isDelete = true;
                        }
                    }
                    if(isDelete){
                        batchTxnData.push({dataEntityName: "keyboardMappingShared", action: 'UPDATEORINSERT', value:item})
                    }
                }
            }
            let keyboardMappingPrivate = await bzdb.select("keyboardMappingPrivate");
            if(keyboardMappingPrivate.rowCount>0){
                for(const item of keyboardMappingPrivate.data){
                    let isDelete = false;
                    if(Array.isArray(item.keyboardMapping)) {
                        const i = item.keyboardMapping.findIndex(e => e.key === 'Yuan');
                        if (i > -1) {
                            item.keyboardMapping.splice(i,1);
                            isDelete = true;
                        }
                        const j = item.keyboardMapping.findIndex(e => e.key === 'At');
                        if (j > -1) {
                            item.keyboardMapping.splice(j,1);
                            isDelete = true;
                        }
                    }
                    if(isDelete){
                        batchTxnData.push({dataEntityName: "keyboardMappingPrivate", action: 'UPDATEORINSERT', value:item});
                    }
                }
            }
            if(batchTxnData.length>0){
                this.logger.info(` change keyboard mapping data structure count ${batchTxnData.length}`);
                const rtn= await bzdb.batchTxn(batchTxnData);
                result=rtn.status;
                if(!rtn.status){
                    this.logger.severe(`failed, ${rtn.message}`);  
                }
            }else{
                this.logger.info(`no keyboard mapping need to be updated`);
            }
        } catch (error) {
            result = false;
            this.logger.severe(`Change keyboard mapping data structure failed: ${JSON.stringify(error.message)}`);
        }
        return  {status:result};
    }

    /**
     * if sso is authentication, datasource should be fallback or sso in 10.1.4
     * and the datasource should be "Internal" which upgrated from the version before 10.1.3
     * @returns {status, message}
     */
    async convertDatasource() {
        const dataFilter = {
            fileName: 'dataSourceSetting.json',
            backupFilePaths: [
                '../../../../../instance/ZLUX/pluginStorage/com.rs.bzadm/configurations',
                '../../../../../instance/ZLUX/pluginStorage/com.rs.bzw/configurations',
                '../../../../../product/ZLUX/pluginStorage/com.rs.bzadm/configurations',
                '../../../../../product/ZLUX/pluginStorage/com.rs.bzw/configurations'
            ],
        };
        const authFilter = {
            fileName: 'authentication.json',
            backupFilePaths: [
            ]
        }
        const dataConfigure = await bzdb.select('configurations', dataFilter);
        const authConfigure = await bzdb.select('authConfig', authFilter);
        const isSSOAuth = authConfigure.rowCount > 0 && authConfigure.data[0].dataserviceAuthentication && authConfigure.data[0].dataserviceAuthentication.defaultAuthentication === 'sso';
        const isSSOSource = dataConfigure.rowCount > 0 && dataConfigure.data[0].dataserviceDataSource && ['sso', 'fallback'].indexOf(dataConfigure.data[0].dataserviceDataSource.defaultDataSource) > -1;
        if(isSSOAuth && !isSSOSource) {
            const result = await bzdb.updateOrInsert('configurations', {
                data: {
                    dataserviceDataSource: {
                        "defaultDataSource": "fallback",
                        "implementationDefaults": {}
                    }
                },
                fileName:'dataSourceSetting.json'
            });

            if(result) {
                return {status: true, message: "Upgrade datasource success"}
            } else {
                return {status: false, message: "Upgrade datasource failed"}
            }

        }
        return {status: true, message: "Upgrade datasource success"}
        
    }


}
module.exports = UpgradeTo10_1_4Service;
