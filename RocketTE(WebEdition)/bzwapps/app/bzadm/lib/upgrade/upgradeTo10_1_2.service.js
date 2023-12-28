const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const bzdb = require('../../../bzshared/lib/services/bzdb.service');
const Promise = require('bluebird');
const SESSIONSETTING_DEFAULTS_PATH  = '/product/ZLUX/pluginStorage/com.rs.bzw/defaults';
const CONFIGURATIONS_Path = '/instance/ZLUX/pluginStorage/com.rs.bzadm/configurations';
const SESSIONSETTING_BZA_APTH  = '/instance/ZLUX/pluginStorage/com.rs.bzadm/sessionSettings';
const SESSION_PRIVATE_PATH = '/instance/ZLUX/pluginStorage/com.rs.bzshared/_db_store/scriptPrivate';
const SESSION_SHARED_PATH = '/instance/ZLUX/pluginStorage/com.rs.bzshared/_db_store/scriptShared';

const tempEntityName={
    groupUserPrivilege:"temp_groupUserPrivilege",
}
class UpgradeTo10_1_2Service {

    /**
     * Constructor
     * @param {Object} context - The plugin context of which invoking this class
     */
    constructor(context){
        this.context = context
        this.logger = context.logger
        this.deployPath = this.context.plugin.server.config.user.rootDir
        this.upgradePath = this.deployPath.replace('deploy', 'migrate')
        this.idSplitChar="ÿ"
    }

    async doUpgrade(versionFlag, migratePath,oldVersion){
         //reset the path
        this.upgradePath = migratePath?migratePath:this.upgradePath; 
        
        this._privateSession=await this.getPrivateSession()
      
        this._defaultSettings=await this.getMapContentByPath(SESSIONSETTING_DEFAULTS_PATH,true);
        this.logger.info(`start the 10.1.2 upgradation.`)


        let result={status:true};  //init

        if(result.status){//scriptUpdate
            this.logger.info(`start do upgrade - script.`);
            let scriptResult=await this.scriptUpdate();
            result=Object.assign(result,scriptResult);
        }

        if(result.status){
            this.logger.info(`clear temp db entities, make sure no exist temp entities`);
            await this.destroyTempEntities();
            this.logger.info(`start create temp db entities`);
            let updateResult=await this.createTempEntities(oldVersion);
            result = Object.assign(result, updateResult)
        }

        // move share setting from BZA to BZDB
        if(result.status) { 
            this.logger.info(`start do upgrade - move share to BZDB.`)
            let updateResult = await this.moveShareSettingToBZDB()
            result = Object.assign(result, updateResult)
        }

        // split sessionPrivate into 2 parts of defination and Preference
        if(result.status) { 
            this.logger.info(`start do upgrade - sessionDefination.`)
            let updateResult = await this.upgradeSessionDefination()
            result = Object.assign(result, updateResult)
        }
        this._privateSession=await this.getPrivateSession()  //get again to update
        this._allSession=await this.getAllSession()
        if(result.status){
            this.logger.info(`start do upgrade - launchpad.`);
            let updateResult = await this.upgradeLaunchpadSetting()
            result = Object.assign(result, updateResult)
        }

        if(result.status){
            this.logger.info(`start do upgrade - hotspots.`)
            let updateResult = await this.upgradeHotspotsSetting()
            result = Object.assign(result, updateResult)
        }
        
        if(result.status){
            this.logger.info(`start do upgrade - preference.`)
            let updateResult = await this.upgradePreferenceSetting()
            result = Object.assign(result, updateResult)
        }

        if(result.status){
            this.logger.info(`start do upgrade - keyBoard.`)
            let updateResult = await this.upgradekeyBoardSetting()
            result = Object.assign(result, updateResult)
        }


        if(result.status){
            this.logger.info(`start do upgrade - groupUserPrivilege.`)
            let updateResult = await this.upgradeGroupUserPrivilege()
            result = Object.assign(result, updateResult)
        }

        this.logger.info(`start do upgrade - installation.`)
        await this.upgradeInstallation();

        //always try to destro temp db entities
        this.logger.info(`start destroy temp db entities`);
        let destoryResult =await this.destroyTempEntities(); 

        //end upgrade
        if(result.status){  
            this.logger.info(`finished the 10.1.2 upgradation.`)
        }else{
            this.logger.severe(`failed the 10.1.2 upgradation.`) 
        }
        return result;
    }

    async scriptUpdate(){
        const scriptPrivate = this.updatePrivateScripts();  // using this upgrade to 10.1.2
        const sharedScripts = this.updateSharedScript(); // using this upgrade 10.1.2

        if(scriptPrivate.status) {
            this.logger.info('== Upgrade private scripts successfully==');
        } else {
            this.logger.severe(`Upgrade private scripts failed: ${JSON.stringify(err)}`);
        }
        
        if(sharedScripts.status) {
            this.logger.info('== Upgrade shared scripts successfully==');
        } else {
            this.logger.severe(`Upgrade shared scripts failed: ${JSON.stringify(err)}`);
        }

        if(scriptPrivate.status && sharedScripts.status){
            return {status: true, message: "Upgrade script success"};
        }else{
            return {status: false, message: "Upgrade script failed"};
        }
    }

    updatePrivateScripts() {
        return this.updateScripts(SESSION_PRIVATE_PATH, 'private')
    }

    updateSharedScript() {
        return this.updateScripts(SESSION_SHARED_PATH, 'shared')
    }

    /**
     * convert script to be format: decode username:
     *   if upgrade from 10.1.1, it maybe has encode and decode string as username: such as %40 and @
     *   convert to same fromat: contains @  in user name 
     * @param folderPath: private/shared path
     * @param type: private/shared string
     * @returns {status:boolean, message: string}
     */
    // this function has been changed at verion 10.2.0 
    //fix the bug that username had underline and has specific character like @ \<> that can be encode and decode. such as t@_t t 
    updateScripts(folderPath, type) {
        const scriptPath = path.join(this.deployPath, folderPath);

        if (fs.existsSync(scriptPath)) {
            const files = fs.readdirSync(scriptPath);   
            files.forEach(async (file) => {
                const filePath = path.join(scriptPath, file);
                const stat = fs.lstatSync(filePath);
               
                if(stat.isDirectory()) {
                    // remove folder if contains folder in script folder.
                    fs.rmSync(filePath, { recursive: true });

                    this.logger.severe(`${filePath} folder delete when upgrade script, it shouldn't has folder in ${folderPath}`);
                    return;
                } 
                const script = fse.readJsonSync(filePath);
                //The username obtained by intercepting the string of id is more rigorous.
                const username = script.id.substr(0, script.id?.length - script.type?.length - script.name?.length - 2);
                if(username.indexOf('%') > -1) {
                     /**
                     * cmu%40rs.com_3270_a.json should be format:
                     *     file name: cmu%40rs.com_3270_a.json
                     *            id: cmu%40rs.com_3270_a
                     *      username: cmu@rs.com
                     */
                    //the username did not decode when upgrade to 10.1.1 with 3 release versions. 
                    const decodeUsername = decodeURIComponent(username)
                    if(username && decodeUsername !== script.username){
                        script.username = decodeUsername;
                        fse.writeFileSync(filePath, JSON.stringify(script), { mode: 0o770 }, (err) => {
                            if (err) {
                                this.logger.severe(`set upgrade status error : when delete file ${file} and create file ${fileName}` + err.message);
                                throw err;
                            }
                            this.logger.info(`set upgrade status successfully: original file name is ${file} and new file name is ${fileName}`);
                        });
                    }
                    
                } else {
                     /**
                     * cmu@rs.com_3270_a.json should be format:
                     *     file name: cmu%40rs.com_3270_a.json
                     *            id: cmu%40rs.com_3270_a
                     *      username: cmu@rs.com
                     */
                    const encodeUserName = encodeURIComponent(username || '');
                    const id = [encodeUserName,script.type,script.name].join('_');
                    const fileName = id + ".json";

                    if(fileName !== file) {
                        const newFile = path.join(scriptPath, fileName);
                        script.username = username;
                        script.id = id;

                        fs.writeFile(newFile, JSON.stringify(script), { mode: 0o770 }, (err) => {
                            if (err) {
                                this.logger.severe(`set upgrade status error : when delete file ${file} and create file ${fileName}` + err.message);
                                throw err;
                            }
                            fse.removeSync(filePath); // remove original file.
                            this.logger.info(`set upgrade status successfully: original file name is ${file} and new file name is ${fileName}`);
                        });
                    }
                }
            });
            return {status: true, message: `Upgrade ${type} script success`};
        }
        return {status: true, message: `Upgrade ${type} script failed: no ${type} script`};
    }

    async upgradeLaunchpadSetting(){
        let privateData=await this.getDBStoreFile("launchpadPrivate"); 
        this.logger.info(`before , launchpad Private  count ${privateData.rowCount}`)
        let stringObj={idSuffix:'_launchpad',defaultType:'LaunchpadItems',entityName:'launchpadPrivate',itemsName:'launchpad'}
        let batchTxnData=this.getBatchTxnData(privateData,stringObj)
        let result=true;
        await bzdb.delete("launchpadPrivate") //delete all, then insert, in order to upgrade the ID which have changed the primiary key from name to ID from 1.2.1
        if(batchTxnData.length>0){
            try{
                this.logger.info(`deleted un-customized launchpad count ${privateData.rowCount-batchTxnData.length}`)
                const rtn= await bzdb.batchTxn(batchTxnData);
                result=rtn.status;
                if(!rtn.status){
                    this.logger.severe(`failed, ${rtn.message}`);  
                }
            }catch(err){
                result=false;
                this.logger.severe(`failed to delete un-customized launchpad`)
            }
        }else{
            this.logger.info(`no un-customized launchpad setting need to be deleted`)
        }
        privateData=await bzdb.select("launchpadPrivate");
        this.logger.info(`after , launchpad Private  count ${privateData.rowCount}`);
        return {status:result};
    }

    async upgradeHotspotsSetting(){
        let privateData=await this.getDBStoreFile("hotspotPrivate"); //read from file directly
        this.logger.info(`before, hotspot Private count ${privateData.rowCount}`);
        let stringObj={idSuffix:'_hotspots',defaultType:'HotspotDefs',entityName:'hotspotPrivate',itemsName:'hotspotDefs'};
        let batchTxnData=this.getBatchTxnData(privateData,stringObj);
        let result=true;

        await bzdb.delete("hotspotPrivate") //delete all, then insert, in order to upgrade the ID which have changed the primiary key from name to ID from 1.2.1
        if(batchTxnData.length>0){
            try{
                this.logger.info(`deleted un-customized hotspot count ${privateData.rowCount-batchTxnData.length}`);
                const rtn= await bzdb.batchTxn(batchTxnData);
                result=rtn.status;
                if(!rtn.status){
                    this.logger.severe(`failed, ${rtn.message}`);  
                }
            }catch(err){
                result=false;
                this.logger.severe(`failed to delete un-customized hotspot`);
            }
        }else{
            this.logger.info(`no un-customized hotspot setting need to be deleted`);
        }

        privateData=await bzdb.select("hotspotPrivate");
        this.logger.info(`after ,hotspot Private count ${privateData.rowCount}`);
        return {status:result};
    }

    async upgradePreferenceSetting(){
        let privateData=await this.getDBStoreFile("preferencePrivate"); //read from file directly
        this.logger.info(`before, preference Private count ${privateData.rowCount}`);
        let stringObj={idSuffix:'_preferences',defaultType:'SessionPreferences',entityName:'preferencePrivate'};
        let batchTxnData=this.getBatchTxnData(privateData,stringObj);
        let result=true;
        await bzdb.delete("preferencePrivate") //delete all, then insert, in order to upgrade the ID which have changed the primiary key from name to ID from 1.2.1
        if(batchTxnData.length>0){
            try{
                this.logger.info(`shrink customized preference count ${batchTxnData.length} `);
                const rtn = await bzdb.batchTxn(batchTxnData);
                result=rtn.status
                if(!rtn.status){
                    this.logger.severe(`failed, ${rtn.message}`);  
                }
            }catch(err){
                result=false;
                this.logger.severe(`failed to shrink customized preference`);
            }
        }else{
            this.logger.info(`no customized preference setting need to be shrinked`);
        }

        privateData=await bzdb.select("preferencePrivate");
        this.logger.info(`after ,preference Private count ${privateData.rowCount}`);
        return {status:result};
    }
    
    async upgradekeyBoardSetting(){
        let privateData=await this.getDBStoreFile("keyboardMappingPrivate");  //read from file directly
        this.logger.info(`before, keyboardMapping Private count ${privateData.rowCount}`);
        let stringObj={idSuffix:'_keyboardMapping',defaultType:'KeyboardMapping',entityName:'keyboardMappingPrivate'};
        let batchTxnData=this.getBatchTxnData(privateData,stringObj);
        let result=true;
        await bzdb.delete("keyboardMappingPrivate") //delete all, then insert, in order to upgrade the ID which have changed the primiary key from name to ID from 1.2.1
        if(batchTxnData.length>0){
            try{
                this.logger.info(`update keyboardMapping Id count ${batchTxnData.length}`);
                const rtn= await bzdb.batchTxn(batchTxnData);
                result=rtn.status;
                if(!rtn.status){
                    this.logger.severe(`failed, ${rtn.message}`);  
                }
            }catch(err){
                result=false;
                this.logger.severe(`failed to update keyboardMapping Id`);
            }
        }else{
            this.logger.info(`no keyboardMapping Id need to be updated`);
        }

        privateData=await bzdb.select("keyboardMappingPrivate");
        this.logger.info(`after ,keyboardMapping Private count ${privateData.rowCount}`);
        return {status:result};
    }

    
    async upgradeGroupUserPrivilege(){
        let groupData=await bzdb.select(tempEntityName.groupUserPrivilege);
        this.logger.info(`before, groupUserPrivilege  count ${groupData.rowCount}`);
        let stringObj={entityName:'groupUserPrivilege'};
        await bzdb.delete("groupUserPrivilege") //clean
        let batchTxnData=[];
        if(groupData.data && groupData.data.length>0){
            for(const obj of groupData.data){
                batchTxnData.push({dataEntityName: stringObj.entityName, action: 'INSERT', value: obj}) 
            }
        }
        let result=true;
        if(batchTxnData.length>0){
            try{
                this.logger.info(`insert groupUserPrivilege count ${batchTxnData.length}`);
                const rtn= await bzdb.batchTxn(batchTxnData);
                result=rtn.status;
                if(!rtn.status){
                    this.logger.severe(`failed, ${rtn.message}`);  
                }
            }catch(err){
                result=false;
                this.logger.severe(`failed to insert groupUserPrivilege`);
            }
        }else{
            this.logger.info(`no groupUserPrivilege need to be insert`);
        }

        groupData=await bzdb.select("groupUserPrivilege");
        this.logger.info(`after ,groupUserPrivilege count ${groupData.rowCount}`);
        return {status:result};
    }

    async upgradeSessionDefination(){
        let privateDatas=this._privateSession;
        let preference=await this.getDBStoreFile("preferencePrivate"); //read from file
        this.logger.info(`before, Session Private count ${privateDatas.length}`);
        this.logger.info(`before, preference Private count ${preference.rowCount}`);
        let stringObj={idSuffix:'_preferences',defaultType:'SessionPreferences',entityName:'preferencePrivate'};
        let batchTxnData=this.getBatchSessionRefactorData(privateDatas,stringObj);
        let result=true;
        if(batchTxnData.length>0){
            try{
                let countSession=batchTxnData.filter(e=>e.dataEntityName==="sessionPrivate").length/2; //delete and update
                let countPreference=batchTxnData.filter(e=>e.dataEntityName==='preferencePrivate').length;
                this.logger.info(`update session Private count ${countSession} `);
                this.logger.info(`createOrupdate preference Private count ${countPreference} `);
                const rtn1= await bzdb.batchTxn(batchTxnData.filter(e=>e.action==="DELETE"));
               const rtn3= await bzdb.batchTxn(batchTxnData.filter(e=>e.action==="UPDATEORINSERT"));
                const rtn2= await bzdb.batchTxn(batchTxnData.filter(e=>e.action==="INSERT"));
                this.logger.info(`upgradeSessionDefination result, batch DELETE: ${rtn1.status}; batch session INSERT: ${rtn2.status}; batch perference UPDATEORINSERT: ${rtn3.status}`);
                if(!rtn1.status || !rtn2.status || !rtn3.status){
                    this.logger.severe(`failed to save Session Private into BZDB`);
                    this.logger.info(`batch DELETE ${JSON.stringify(rtn1)}`);
                    this.logger.info(`batch INSERT ${JSON.stringify(rtn3)}`);
                    this.logger.info(`batch UPDATEORINSERT ${JSON.stringify(rtn2)}`);
                    result=false;
                }
            }catch(err){
                result=false;
                this.logger.severe(`failed to split Session Private`);
            }
        }else{
            this.logger.info(`no Private Session need to split into 2 parts `);
        }
        let preferencePrivate=await this.getDBStoreFile("preferencePrivate"); //read from file
        let asessionPrivate=await bzdb.select("sessionPrivate");
        this.logger.info(`after, Session Private count ${asessionPrivate.rowCount}`);
        this.logger.info(`after, preference Private count ${preferencePrivate.rowCount}`);

        return {status:result};
    }
    
    async upgradeInstallation() {
        const fileName = path.join(this.deployPath, CONFIGURATIONS_Path, 'installation.json');

        if(!fs.existsSync(fileName)) {
            this.logger.info(`no installation file in instance folder`);
            return {status: true, message: 'success', fileName: fileName};
        }

        return new Promise((resolve, reject) => {
            fs.unlink(fileName,  (err) => {
                if (err) {
                    this.logger.severe(`failed to remove installation file`);
                    resolve({ status: false, message: err.message, fileName: fileName});
                } else {
                    this.logger.info(`successed to remove installation file`);
                    resolve({status: true, message: 'success', fileName: fileName});
                }
            });
        });
    }
    
    //get the latest default value
    async getMapContentByPath(strPath,origin){
        let dir=strPath;
        let filesContent=[];
        let dataMaps=new Map();
        if(origin){
            dir=path.join(this.upgradePath,dir); // get from migrate folder
        }else{
            dir=path.join(this.deployPath,dir); // get the deploy folder
        }
       
        if (fs.existsSync(dir)) {
            filesContent=fs.readdirSync(dir);
        }
        if(filesContent.length>0){
            for(let i=0;i<filesContent.length;i++){
                const fileName = path.resolve(`${dir}/${filesContent[i]}`);
                let dataText = await this._readFilePromise(fileName, 'utf8');
                const akey=filesContent[i].substr(0,filesContent[i].indexOf(".json")); //fileName
                try{
                    let jsonObj=JSON.parse(dataText);
                    dataMaps.set(akey,jsonObj)
                }catch(err){
                    this.logger.info(`can not json parse content from file `+fileName);
                }
                
            }
        }
        return dataMaps;
    }

    _readFilePromise(path,opts){
        return new Promise((resolve, reject) => {
            fs.readFile(path, opts, (err,data) => {
                if (err) reject(err)
                else {
                    resolve(data);
                }
            })
        });
    };

    _isSameObj(a,b){
        if(a && b){
            return JSON.stringify(a)===JSON.stringify(b);
        }else{
            if(a === 'undefined' && b === 'undefined') return true
            if(a === null && b === null) return true
            return false;
        }
    }
    async getPrivateSession() {
        let privateSessions=await bzdb.select("sessionPrivate");
        let privateSessionData=[];
        if(privateSessions.rowCount>0){
            privateSessionData=privateSessions.data 
        }
        return privateSessionData;
    }

    async getAllSession() {
        let privateSessionData=this._privateSession;
        let publicSessionData=await bzdb.select("sessionShared");
        let mergedSessionData=[]
        if(privateSessionData.length>0){
            mergedSessionData=mergedSessionData.concat(privateSessionData)
        }
        if(publicSessionData.rowCount>0){
            mergedSessionData=mergedSessionData.concat(publicSessionData.data)
        }
        return mergedSessionData;
    }
    
    
    //hotspot ID rules, others are similar
    //{userId}ÿ{userId}ÿ{session.id}_hotspots  hotspot ID rule 1
    //{userId}ÿ{session.id}_hotspots  hotspot ID rule 2
    //ÿ{session.id}_hotspots`;hotspot ID rule 3
    //_{session.name}_hotspots; //rule 4
    //{userId}ÿ{session.name}_hotspots`; //rule 5
    //{userId}ÿ{userId}ÿ_{session.name}_hotspots  ////rule 6
    getSessionBySettingID(extend,settingObj) {
        let session;
        let settingId=settingObj.id 
        let settingName=settingObj.name
        let settingUserId=settingObj.userId
        if(this._allSession.length>0){
            for(let i=0; i<this._allSession.length;i++){
               
                const aSession=this._allSession[i];
                let idRule=[];
                if (aSession.id) {
                    if(aSession.userId){//private sessiion
                        idRule.push(`${aSession.userId}${this.idSplitChar}${aSession.userId}${this.idSplitChar}${aSession.id}${extend}`) //rule 1
                        idRule.push(`${aSession.userId}${this.idSplitChar}${aSession.id}${extend}`) //rule2
                    }else{ //public session
                        if(settingUserId){
                            idRule.push(`${settingUserId}${this.idSplitChar}${aSession.id}${extend}`) //rule2
                        }
                    }
                    idRule.push(`${this.idSplitChar}${aSession.id}${extend}`) //rule3
                }
                if(aSession.name){
                    if(aSession.userId){//private sessiion
                        idRule.push(`${aSession.userId}${this.idSplitChar}${aSession.userId}${this.idSplitChar}_${aSession.name}${extend}`) //rule6
                    }
                    idRule.push(`_${aSession.name}${extend}`) //rule4
                    idRule.push(`${aSession.userId}${this.idSplitChar}${aSession.name}${extend}`) //rule5

                }
                if(idRule.length>0){
                    if(settingId && idRule.includes(settingId)>0){
                        if(aSession.userId){
                            if(aSession.userId===settingUserId){
                                session= aSession;
                                break;
                            }
                        }else{
                            session= aSession;
                            break;
                        }
                    }
                    if(settingName && idRule.includes(settingName)>0){
                        if(aSession.userId){
                            if(aSession.userId===settingUserId){
                                session= aSession;
                                break;
                            }
                        }else{
                            session= aSession;
                            break;
                        }
                    }
                }
            }
        }
        return session;
    }

    getDefaultSettingObj(terminalType,settingType) {
        const defaultObjName=`default${terminalType}${settingType}` 
        return this._defaultSettings.get(defaultObjName);
 
    }
    getSessionType(sessionObj){
        if(sessionObj.is3270Session) return '3270'
        if(sessionObj.is5250Session) return '5250'
        if(sessionObj.isVTSession) return 'VT'
        if(sessionObj.is3270pSession) return '3270p'
        if(sessionObj.isFTPSession) return 'FTP'

        let type=sessionObj.type;
        if (type.search(/3270/) > -1) {
            return '3270';
          } else if (type.search(/3287/) > -1) {
            return '3270p';
          } else if (type.search(/5250/) > -1) {
            return '5250';
          } else if (type.search(/VT|vt/) > -1){
            return 'VT';
          } else if (type.search(/FTP/) > -1){
            return 'FTP';
          } else {
            return '';
          }
    }

    getBatchTxnData(privateData,stringObj){
        let batchTxnData=[];
        if(privateData.data && privateData.data.length>0){
            let canAdd=true;
            for(const obj of privateData.data){
                const id=obj.id || obj.name
                const originObj=JSON.parse(JSON.stringify(obj)); 
                const aSession=this.getSessionBySettingID(stringObj.idSuffix,obj)
                if(aSession){ //exist
                    const sessionType=this.getSessionType(aSession)
                    const defaultSettings=this.getDefaultSettingObj(sessionType,stringObj.defaultType)
                    if(defaultSettings){
                        const filter =obj.id?{id:obj.id}:{name:obj.name}
                        //not standard ID type is 1. qpanÿrs73_keyboardMapping ,2 _rs73_keyboardMapping, 3  _rs73{timestemp}_keyboardMapping
                        //standard ID type is  qpanÿrs73{timestemp}_keyboardMapping,
                        let newObjId= obj.userId+this.idSplitChar+aSession.id+stringObj.idSuffix
                        let duplicateIndex=batchTxnData.findIndex(e=>e.value.id===newObjId);
                        if(duplicateIndex>=0){  //duplicated
                            this.logger.info(`${stringObj.entityName}, duplicated ID ${newObjId}`);
                            if(originObj.name && !originObj.id){ //old data only exist name attribute
                                this.logger.info(`duplicated id in ${stringObj.entityName}, skip  ${originObj.name} since duplicated ID`);
                                canAdd=false;
                            }else{  // this one use ID, so remove the old which use name
                                batchTxnData.splice(duplicateIndex,1) //remove old one
                                this.logger.info(`duplicated id in ${stringObj.entityName}, use ${originObj.id}, remove old since duplicated ID`);
                                canAdd=true;
                            }
                        }else{
                            canAdd=true;
                        }
                        if(canAdd){
                            if(stringObj.entityName==='preferencePrivate'){ 
                                let modifyData=this.removeSameWithDefaultData(defaultSettings,obj,sessionType)  //always remove since there are some attributes which is no avilable for specify session type 
                                if(!obj.id || obj.id!==newObjId){ //id is {userId}ÿ{rs73}_preferences
                                    this.logger.info(`reset preferencePrivate Id to ${newObjId}, the origial name is ${obj.name} and Id is ${obj.id}`);
                                    modifyData.id=newObjId
                                    delete modifyData.name 
                                }
                                batchTxnData.push({dataEntityName: stringObj.entityName, action: 'INSERT', value: modifyData})

                            } else if (stringObj.entityName==='keyboardMappingPrivate'){ //update ID to qpanÿrs73{timestemp}_keyboardMapping 
                                let modifyData =this.removeKeyboardSameWithDefaultData(obj,sessionType) // remove the keyboardOptions
                                if(!modifyData.id || modifyData.id!==newObjId){ 
                                    this.logger.info(`reset keyboardMappingPrivate Id to ${newObjId}, the origial name is ${modifyData.name} and Id is ${modifyData.id}`);
                                    modifyData.id=newObjId
                                    delete modifyData.name 
                                }
                                batchTxnData.push({dataEntityName: stringObj.entityName, action: 'INSERT', value: modifyData})
                            } else { //hotspot, launchpad, only save the files which is not same as default
                                if(!this._isSameObj(defaultSettings[stringObj.itemsName],obj[stringObj.itemsName])){ //changed 	
                                    if(!obj.id || obj.id!==newObjId){ //id is {userId}ÿ{rs73}_hotspots
                                        this.logger.info(`reset ${stringObj.entityName} Id to ${newObjId}, the origial name is ${obj.name} and Id is ${obj.id}`);
                                        obj.id=newObjId
                                        delete obj.name 
                                    }
                                    batchTxnData.push({dataEntityName: stringObj.entityName, action: 'INSERT', value: obj}) 
                                }else{
                                    this.logger.info(`found uncustomized ${stringObj.entityName}, the name is ${obj.name} and Id is ${obj.id}`);
                                }
                            } 
                        }
                    }else{
                        this.logger.info(`Orphan data，${stringObj.entityName},can not find defaultSettings, the ID or name is ${id}, sessionType：${sessionType},setting type:${stringObj.defaultType}`);
                    }
                }else{
                    this.logger.info(`Orphan data，${stringObj.entityName},can not find session to match, the ID or name is ${id}, remove from db`);
                }
            }
        }
        return batchTxnData;
    } 

    //split private session into 2 parts: session defination and preference 
    getBatchSessionRefactorData(privateDatas,stringObj){
        let batchTxnData=[];
        if(privateDatas.length>0){
            for(const obj of privateDatas){
                //const id=obj.id || obj.name
                const aSession=obj;
                if(aSession){ //exist
                    const sessionType=this.getSessionType(aSession)
                    const filter=obj.id?{id:obj.id}:{name:obj.name}
                    const {aSessionCopy,aPreference}=this.splitDefinationData(aSession,sessionType)
                    if(aPreference && Object.keys(aPreference).length>0){ 
                        batchTxnData.push({dataEntityName: "preferencePrivate", action: 'UPDATEORINSERT', value: aPreference})
                    }
                    if(aSessionCopy && Object.keys(aSessionCopy).length>0){
                        batchTxnData.push({dataEntityName: "sessionPrivate", action: 'DELETE', value: {}, options:{filter:filter}}) //remove old
                        batchTxnData.push({dataEntityName: "sessionPrivate", action: 'INSERT', value: aSessionCopy})
                    }
                }
            }
        }
        return batchTxnData;
    } 



    //from private preference
    removeSameWithDefaultData(defaultSettings,preferenceObj,settingType){
        let aCopy=JSON.parse(JSON.stringify(preferenceObj)); 
        this.logger.info(`SHRINK private preference attributes from id ${preferenceObj.id} or name ${preferenceObj.name},type is ${settingType}`);
        const keepAliveDefault={"timerOptions":"0","timerValue":"1"}
        Object.keys(aCopy).forEach(key => {
            if(defaultSettings[key]==='undefined' ){ // not exist in template
                if(key!=="id" && key!="userId" && key!="timestamp" && key!="name" ){ //must have attributes
                    if(key==="keepAlive"){
                        if(this._isSameObj(aCopy[key],keepAliveDefault)){
                            delete aCopy.keepAlive 
                            this.logger.info(`remove attribute keepAlive which same as default`);
                        }
                    }else if(key==="advanced"){
                        if(!aCopy.advanced){
                            delete aCopy.advanced 
                            this.logger.info(`remove attribute advanced which is empty`);   
                        }
                    }else if(key==="signon" || key==="display"){
                        if(settingType!=="5250" || !Object.keys(aCopy[key]).length){
                            delete aCopy[key] 
                            this.logger.info(`remove attribute ${key} which is not exist intemplate`);
                        }
                    }else if(key==="ftpConfig" || key==="ftp"){
                        if(settingType.toLowerCase()!=="ftp" || !Object.keys(aCopy[key]).length){
                            delete aCopy[key] 
                            this.logger.info(`remove attribute ${key} which is not exist in template`);
                        }
                    }
                    else {
                        delete aCopy[key] 
                        this.logger.info(`remove attribute ${key} which is not exist in template`);  
                    }
                    
                }
            }else{// exist in default template
                if(key==="font"){  // remove w2h attributes which unused in bzw ,also do not exist in bzw defalt template
                    if (aCopy[key].autoSizeFont!=undefined) delete aCopy[key].autoSizeFont
                    if (aCopy[key].autoSizeWindow!=undefined) delete aCopy[key].autoSizeWindow
                    if (aCopy[key].vtHistoryScrollBufferLines_w2h) delete aCopy[key].vtHistoryScrollBufferLines_w2h
                }
                if(this._isSameObj(aCopy[key],defaultSettings[key])){ //same with default
                    delete aCopy[key] 
                    this.logger.info(`remove attribute ${key} which same as default`); 
                }
            }
        });
        return aCopy;
    }
    removeKeyboardSameWithDefaultData(keyboardMapObj,settingType)
    {
        const keyboardOptions = {
            autoResetOptions:{
              isAutoReset: false,
              isAutoTab: false,
              isImmediate: false,
              isPressNextKey: true
            },
            rapidLeftRight:true,
            autoSkipBackspace: settingType!=="3270",
            destructiveBackspace: false
          };

        if(keyboardMapObj.keyboardOptions){
            if(this._isSameObj(keyboardMapObj.keyboardOptions,keyboardOptions)){
                this.logger.info(`remove attribute keyboardOptions from id ${keyboardMapObj.id} or name ${keyboardMapObj.name}`)
                delete keyboardMapObj.keyboardOptions
            }
        }
        return keyboardMapObj
    }

    //split session defination into 2 parts
    splitDefinationData(sessionObj,settingType){
        
        let aSessionCopy=JSON.parse(JSON.stringify(sessionObj)); 
        if(!aSessionCopy.id || aSessionCopy.id===aSessionCopy.userId+this.idSplitChar+aSessionCopy.name){  //DB assign
            let sessionNewId=aSessionCopy.name + new Date().getTime()+Math.floor((Math.random()*1000000)+1)  //add 6 random number to advoid same ID
            this.logger.info(`reset sessionPrivate Id to ${sessionNewId}, the origial name is ${aSessionCopy.name} and Id is ${aSessionCopy.id}`);
            aSessionCopy.id= sessionNewId; 
        }
        let aPreference={}; 
        if(aSessionCopy.font)  delete aSessionCopy.font
        if(aSessionCopy.contextRightClick)  delete aSessionCopy.contextRightClick
        if(aSessionCopy.color)  delete aSessionCopy.color
        if(aSessionCopy.cursor)  delete aSessionCopy.cursor
        if(aSessionCopy.language)  delete aSessionCopy.language
        if(aSessionCopy.hotspots)  delete aSessionCopy.hotspots
        if(aSessionCopy.launchpadConfig)  delete aSessionCopy.launchpadConfig
        if(aSessionCopy.page)  delete aSessionCopy.page
        if(aSessionCopy.layout)  delete aSessionCopy.layout
        if(aSessionCopy.options)  delete aSessionCopy.options
        if(aSessionCopy.override)  delete aSessionCopy.override
        if(aSessionCopy.ftpConfig)  delete aSessionCopy.ftpConfig

        if(aSessionCopy.keepAlive)  delete aSessionCopy.keepAlive
        if(sessionObj.advanced)  delete aSessionCopy.advanced
        if(aSessionCopy.signon)  delete aSessionCopy.signon
        if(aSessionCopy.display)  delete aSessionCopy.display
        if(aSessionCopy.ftp)  delete aSessionCopy.ftp
        

        let newPreferencesId=aSessionCopy.userId+"ÿ"+aSessionCopy.id+"_preferences"
        let newLaunchpadId=aSessionCopy.userId+"ÿ"+aSessionCopy.id+"_launchpad" 
        let newKeyboardMappingId=aSessionCopy.userId+"ÿ"+aSessionCopy.id+"_keyboardMapping" 
        let newHotspotsId=aSessionCopy.userId+"ÿ"+aSessionCopy.id+"_hotspots"
        
        this.logger.info(`reset for sessionPrivate ${aSessionCopy.id}
        ,preferencesId from ${aSessionCopy.preferencesId} to ${newPreferencesId}
        ,keyboardMappingId from ${aSessionCopy.keyboardMappingId} to ${newKeyboardMappingId}
        ,launchpadId from ${aSessionCopy.launchpadId} to ${newLaunchpadId}
        ,hotspotsId from ${aSessionCopy.hotspotsId} to ${newHotspotsId};`)


        aSessionCopy.preferencesId=newPreferencesId 
        aSessionCopy.launchpadId=newLaunchpadId 
        aSessionCopy.keyboardMappingId=newKeyboardMappingId
        aSessionCopy.hotspotsId=newHotspotsId 

        if(settingType==="3270" || settingType==="5250" || settingType==="VT"){
            if(sessionObj.font)  Object.defineProperty(aPreference, 'font', {value: sessionObj.font,enumerable:true})
            if(sessionObj.contextRightClick)  Object.defineProperty(aPreference, 'contextRightClick', {value: sessionObj.contextRightClick,enumerable:true})
            if(sessionObj.color)  Object.defineProperty(aPreference, 'color', {value: sessionObj.color,enumerable:true})
            if(sessionObj.cursor)  Object.defineProperty(aPreference, 'cursor', {value: sessionObj.cursor,enumerable:true})
            if(sessionObj.language)  Object.defineProperty(aPreference, 'language', {value: sessionObj.language,enumerable:true})
            if(sessionObj.hotspots)  Object.defineProperty(aPreference, 'hotspots', {value: sessionObj.hotspots,enumerable:true})
            if(sessionObj.launchpadConfig)  Object.defineProperty(aPreference, 'launchpadConfig', {value: sessionObj.launchpadConfig,enumerable:true})
            if(settingType==="5250"){
                if(sessionObj.signon)  Object.defineProperty(aPreference, 'signon', {value: sessionObj.signon,enumerable:true})
                if(sessionObj.display)  Object.defineProperty(aPreference, 'display', {value: sessionObj.display,enumerable:true})
            }
        }else if (settingType==="3270p"){
            if(sessionObj.language)  Object.defineProperty(aPreference, 'language', {value: sessionObj.language,enumerable:true})
            if(sessionObj.page)  Object.defineProperty(aPreference, 'page', {value: sessionObj.page,enumerable:true})
            if(sessionObj.font)  Object.defineProperty(aPreference, 'font', {value: sessionObj.font,enumerable:true})
            if(sessionObj.layout)  Object.defineProperty(aPreference, 'layout', {value: sessionObj.layout,enumerable:true})
            if(sessionObj.options)  Object.defineProperty(aPreference, 'options', {value: sessionObj.options,enumerable:true})
            if(sessionObj.override)  Object.defineProperty(aPreference, 'override', {value: sessionObj.override,enumerable:true})
        }else if(settingType==="FTP"){
            if(sessionObj.language)  Object.defineProperty(aPreference, 'language', {value: sessionObj.language,enumerable:true})
            if(sessionObj.ftpConfig)  Object.defineProperty(aPreference, 'ftpConfig', {value: sessionObj.ftpConfig,enumerable:true})
            if(sessionObj.ftp)  Object.defineProperty(aPreference, 'ftp', {value: sessionObj.ftp,enumerable:true})
        }

        if(sessionObj.keepAlive)  Object.defineProperty(aPreference, 'keepAlive', {value: sessionObj.keepAlive,enumerable:true})
        if(sessionObj.advanced)  Object.defineProperty(aPreference, 'advanced', {value: sessionObj.advanced,enumerable:true})

        if(Object.keys(aPreference).length){
            aPreference.id=aSessionCopy.userId+this.idSplitChar+aSessionCopy.id+"_preferences";
            if(aSessionCopy.name){  //for 1.2.x
                aPreference.name=aPreference.id;
            }
            aPreference.userId=aSessionCopy.userId;
        }
        return {aSessionCopy,aPreference};
    }

    async moveShareSettingToBZDB(){
        let results=[]
        results.push(await this.moveSettingBatchToBZDB("hotspots","hotspotShared"))
        results.push(await this.moveSettingBatchToBZDB("launchpad","launchpadShared"))
        results.push(await this.moveSettingBatchToBZDB("keyboardmapping","keyboardMappingShared"))
        results.push(await this.moveSettingBatchToBZDB("preference","preferenceShared"))
        //due to the 1.1.6 upgrade still useing these 2 files , cancel move
        results.push(await this.moveSettingMapToBZDB("keyboardMapping.json","keyboardMapping"))
        results.push(await this.moveSettingMapToBZDB("sessionSettingMapping.json","sessionSettingMapping"))

        return { status: (0 === results.filter(el=>!el).length) };
    }

    async moveSettingBatchToBZDB(typeStr,entityName){
        let settingPath=SESSIONSETTING_BZA_APTH+"/"+typeStr;
        let settingMap=await this.getMapContentByPath(settingPath);
        let batchTxnData=[];
        let result=true;
        let fullDir=path.join(this.deployPath,settingPath); // get the old version default value
        if(settingMap.size>0){
            // for(let valueObj of settingMap.values()){
            //     batchTxnData.push({dataEntityName: entityName, action: 'UPDATEORINSERT', value: valueObj});
            // }
            settingMap.forEach((val,key)=>{  // is there is no ID, set ID
                if(!val.id){
                    val.id=key.substr(2);
                }
                batchTxnData.push({dataEntityName: entityName, action: 'UPDATEORINSERT', value: val});
            })
        }
        if(batchTxnData.length>0){
            try{
                this.logger.info(`move ${typeStr} from BZA to BZDB,count is ${batchTxnData.length}`);
                const rtn = await bzdb.batchTxn(batchTxnData);
                if(rtn.status){
                    for(let fileNames of settingMap.keys()){
                        let filePath=fullDir+"/"+fileNames+".json";
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                        }
                    }
                } else {
                    result = false;
                    this.logger.severe(`upgradeTo10_1_2::moveSettingBatchToBZDB failed, ${rtn.message}`);
                }
            }catch(err){
                result=false;
                this.logger.severe(`failed to move ${typeStr} from BZA to BZDB`);
            }
        }else{
            this.logger.info(`no share ${typeStr} need to be moved`);
        }
        return result;
    }
    
    async moveSettingMapToBZDB(IdFileName,entityName){
        let mapFilePath=SESSIONSETTING_BZA_APTH+"/"+IdFileName;
        mapFilePath=path.join(this.deployPath,mapFilePath); // get the old version file
        let mappingObj={};
        let batchTxnData=[];
        let result=true;
        if (fs.existsSync(mapFilePath)) {
            let dataText = await this._readFilePromise(mapFilePath, 'utf8');
            mappingObj=JSON.parse(dataText);
        }
        if(Object.keys(mappingObj).length>0 && mappingObj.length>0){
            for(let i=0;i<mappingObj.length;i++){
                batchTxnData.push({dataEntityName: entityName, action: 'UPDATEORINSERT', value: mappingObj[i]});
            }
        }
        if(batchTxnData.length>0){
            try{
                this.logger.info(`move ${IdFileName} from BZA to BZDB`);
                const rtn= await bzdb.batchTxn(batchTxnData);
                if(rtn.status){
                    fs.unlinkSync(mapFilePath);
                } else {
                    result = false;
                    this.logger.severe(`upgradeTo10_1_2::moveSettingBatchToBZDB failed, ${rtn.message}`);
                }
            }catch(err){
                result=false;
                this.logger.severe(`failed to move ${IdFileName} from BZA to BZDB`);
            }
        }else{
            this.logger.info(`no file ${IdFileName} need to be moved`);
        }
        return result;
    }
    async createTempEntities(oldVersion){
        let primaryKey="id" 
        // if(!oldVersion || oldVersion.indexOf("1.2.0")>=0 || oldVersion.indexOf("1.2.1")>=0 ||oldVersion.indexOf("1.2.2")>=0){
        //     primaryKey="name"
        // }
        //primaryKey=this.getPrimaryKey(); //the primaryKey change from 'name' to 'id' from 10.1.0
        this.logger.info(`create temp db entities, the primaryKey is ${primaryKey}`);
        const tempMap=[
            {name: tempEntityName.groupUserPrivilege,primaryKeys: ['groupId'],"dataStrategy":3,"entityType":1,filePath:'groupUserPrivilege'},
        ]
        const results = [];
        for await(let anEntity of tempMap) {
            results.push(await bzdb.create('TEMP ENTITY',anEntity));
        }
        if(results.filter(e=>!e.status).length===0){// all success
            this.logger.info(`create temp db entities success, the primaryKey is ${primaryKey}`);
            return {status:true}
        }else{
            this.logger.info(`create temp db entities failed, the primaryKey is ${primaryKey}`);
            return {status:false}
        }
    }
    async destroyTempEntities(){
        const results = [];
        for (let anEntity in tempEntityName) {
            results.push(await bzdb.drop('TEMP ENTITY',tempEntityName[anEntity]));
        }
        if(results.filter(e=>!e.status).length===0){// all success
            this.logger.info(`destroy temp db entities success`);
            return {status:true}
        }else{
            this.logger.info(`destroy temp db entities failed,may not exist`);
            return {status:false}
        }
    }

    /*
    detect whether the the primar key is ID or name, because it has been changed from 10.1.0.
    But if it upgraded from an old version like(1.2.0, 1.2.1, 1.2.2), the Primary key still is name.
    only need check one of ['sessionPrivate','hotspotPrivate','keyboardMappingPrivate','launchpadPrivate','preferencePrivate']
    */
    getPrimaryKey() {
        const folders=['sessionPrivate','hotspotPrivate','keyboardMappingPrivate','launchpadPrivate','preferencePrivate']
        let primaryKey="";
        for(let m=0;m<folders.length;m++){
            let path = `${this.deployPath}/instance/ZLUX/pluginStorage/com.rs.bzshared/_db_store/${folders[m]}`;
            if(fse.existsSync(path)){
                const fileNames = fse.readdirSync(path);
                if(fileNames && fileNames.length !== 0) {
                    for(let i=0;i<fileNames.length;i++){
                        let fileContent = fse.readJSONSync(`${path}/${fileNames[i]}`);
                        if(fileContent && Object.keys(fileContent).length>0){
                            let obj=fileContent[Object.keys(fileContent)[0]]
                            if(obj && !obj.id && obj.name)
                                primaryKey='name';
                            else
                                primaryKey='id';
                         this.logger.info(`detect primary key from ${folders[m]}/${fileNames[i]},primaryKey is ${primaryKey}`);
                         break;
                        }
                    }
                }
            }
            if(primaryKey)
                break;
        }
        if(!primaryKey)
            primaryKey='id';

        return primaryKey;
    }
    /*
        since the primary key has been changed from name to ID from 10.1.0.
        that's to say there is a case that the data may both exist type of primary key is 'name' or 'id'
        in ['sessionPrivate','hotspotPrivate','keyboardMappingPrivate','launchpadPrivate','preferencePrivate']
        So, can not use BZDB and temp table to read the dataset.
    */
    async getDBStoreFile(folder) {
        const path = `${this.deployPath}/instance/ZLUX/pluginStorage/com.rs.bzshared/_db_store/${folder}`;
        let fileContents = [];
        if(fse.existsSync(path)){
            const fileNames = fse.readdirSync(path);
            if(fileNames && fileNames.length !== 0) {
                for await (let file of fileNames) {
                    let fileContent = fse.readJSONSync(`${path}/${file}`);
                    let key = Object.keys(fileContent);
                    key.map(k => fileContents.push(fileContent[k]));
                
                };
            }
        }
        return {data:fileContents,rowCount:fileContents.length};
    }
}
module.exports = UpgradeTo10_1_2Service;
