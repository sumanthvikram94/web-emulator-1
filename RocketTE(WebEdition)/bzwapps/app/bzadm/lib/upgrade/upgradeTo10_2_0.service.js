const bzdb = require('../../../bzshared/lib/services/bzdb.service');
const UpgradeTo10_1_1 = require('./upgradeTo10_1_1.service'); // upgrad to 10.1.1 
const Utiles =  require('../services/utils.service');
const path = require('path');
const fse = require('fs-extra');
const util = require('util');
const zoweService = require('../../../bzshared/lib/services/zowe.service');
const jsonUtils = zoweService.jsonUtils;
const encryptor = zoweService.encryption;
const tokenKey = ';lavoi312-23!!230(;as^alds8*.mv%';
const tokenIv = '2%&_=AVad1!;sa[}';

class UpgradeTo10_2_0Service  extends UpgradeTo10_1_1 {

    /**
     * Constructor
     * @param {Object} context - The plugin context of which invoking this class
     */
    constructor(context){
        super(context);
        this.context = context
        this.logger = context.logger
        this.deployPath = this.context.plugin.server.config.user.rootDir
        // this.bzw2hMode = this.context.plugin.server.config.user.bzw2hMode;
        this.upgradePath = this.deployPath.replace('deploy', 'migrate')
        this.backupPath = this.deployPath.replace('deploy', 'backup');
        this.utiles = new Utiles(context);
    }

    async doUpgrade(migratePath){
        //reset the path
        this.upgradePath = migratePath?migratePath:this.upgradePath; 

        let result = {status:true};  //init
        this.logger.info(`start the 10.2.0 upgradation.`)
        if(result.status){ 
            this.logger.info(`start do upgrade - authConfig and zluxserver.json.`);
            const authResult = await this.convertDatasource(); // conver datasource
            result = Object.assign(result,authResult);
            
            this.logger.info(`end do upgrade - authConfig and zluxserver.json.`);
        }

        if(result.status){ 
            this.logger.info(`start do upgrade - update scripts in group when there is shared scripts.`);
            const authResult = await this.updateScriptsInGroup(); // conver datasource
            result = Object.assign(result,authResult);
            
            this.logger.info(`end do upgrade - update scripts in group when there is shared scripts.`);
        }
        
        if(result.status){ 
            this.logger.info(`start do upgrade - add customized when end user remapped private launchpad and hotspots when it is a script type.`);
            const authResult = await this.updateScriptKeyInLaunchpadAndHotspots(); // conver datasource
            result = Object.assign(result,authResult);
            
            this.logger.info(`end do upgrade - add customized when end user remapped private launchpad and hotspots when it is a script type.`);
        }

        //end upgrade
        if (result.status) {  
            this.logger.info(`finished the 10.2.0 upgradation.`)
        } else {
            this.logger.severe(`failed the 10.2.0 upgradation.`) 
        }
        return result;
    }

    /**
     * need to add totp config into zluxserver.json and authConfig
     * @returns {status}
     */
    async convertDatasource() {
        let convertResult = true;
        
        this.logger.info(`start to modify zluxserver.json.`);
        const zluxServer_10_2_0_pro = path.join(this.deployPath,'../config/server/zluxserver.json')
        const zluxServerPathArr = ['/instance/ZLUX/serverConfig/zluxserver.json','/product/ZLUX/serverConfig/zluxserver.json']
        let hasChanged = false; 
        let TOTPDefault=null
        let zluxContent_product =null
        if(fse.existsSync(zluxServer_10_2_0_pro)){
             zluxContent_product = jsonUtils.parseJSONWithComments(zluxServer_10_2_0_pro);
            if(zluxContent_product.dataserviceAuthentication?.twoFactorAuthentication?.TOTP){
                TOTPDefault=JSON.parse(JSON.stringify(zluxContent_product.dataserviceAuthentication.twoFactorAuthentication.TOTP))
            }
        }
        for(const zServerPath of zluxServerPathArr){
            const zluxServerPath = path.join(this.deployPath,zServerPath);
            if (fse.existsSync(zluxServerPath)) {
                try {
                    const zluxContent= jsonUtils.parseJSONWithComments(zluxServerPath);
                
                    if (TOTPDefault && zluxContent && zluxContent.dataserviceAuthentication.twoFactorAuthentication && !zluxContent.dataserviceAuthentication.twoFactorAuthentication.TOTP) {
                        this.logger.info(`set default value to TOTP`);
                        let mfaAuth = zluxContent.dataserviceAuthentication.twoFactorAuthentication;
                        mfaAuth.TOTP = TOTPDefault
                        hasChanged = true
                    }

                    
                    if (zluxContent?.node.https?.token === '') {
                        const en = new util.TextEncoder();
                        this.logger.info(`encrypt empty https.token`);
                        zluxContent.node.https.token = encryptor.encryptWithKeyAndIV('', en.encode(tokenKey), en.encode(tokenIv));
                        hasChanged = true
                    }

                    if (zluxContent_product?.node?.disabledCiphers && !zluxContent.node?.disabledCiphers) {
                        this.logger.info(`set HTTPS disabled Ciphers list `);
                        zluxContent.node.disabledCiphers=[...zluxContent_product.node?.disabledCiphers]
                        hasChanged = true
                    }

                    if (hasChanged) {
                        fse.writeFileSync(zluxServerPath, JSON.stringify(zluxContent, null, 2), { mode: 0o770 }, (err) => {
                            if (err) {
                                this.logger.severe('modify zluxserver.json occur error : ' + err.message);
                                throw err;
                            }
                        });
                        hasChanged = false;
                    }
                } catch (error) {
                    convertResult = false;
                    this.logger.severe(`modify zluxserver.json occur error : ` + error);
                }
                this.logger.info('modify zluxserver.json successfully, the path is ' + zluxServerPath);
            }
        }

        const authFilter = {
            fileName: 'authentication.json',
            backupFilePaths: [
            ]
        }

        this.logger.info(`start to modify authConfig `);
        const authConfigure = await bzdb.select('authConfig', authFilter);
        if(authConfigure.rowCount > 0 ){
            const authInfo = authConfigure.data[0] ;
            if(authInfo && authInfo.dataserviceAuthentication && TOTPDefault) {
                authInfo.dataserviceAuthentication.twoFactorAuthentication.TOTP = TOTPDefault
                const result = await bzdb.updateOrInsert('authConfig', {data:authInfo,fileName: 'authentication.json'});
                if(result) {
                    this.logger.info(`end to modify authConfig ` );
                    return {status: convertResult}
                } else {
                    this.logger.severe(`modify authConfig occur error `);
                    return {status: false}
                }
    
            }
        }
        this.logger.info(`end to modify authConfig ` );
        return {status: convertResult}
    }

    /**
     * 
     * @returns {status}
     */
    async updateScriptsInGroup(){
        let result = true;
        try {
            let scriptSharedDatas = await bzdb.select("scriptShared");
            let groupDatas = await bzdb.select("group");
            let batchTxnData=[];
            let publicScriptIds = [];
            if(scriptSharedDatas.rowCount>0){
                for(let script of scriptSharedDatas.data){
                    if(script.shared){
                        script.status = 'public'
                        script.shared = undefined;
                        publicScriptIds.push(script.id);
                        batchTxnData.push({dataEntityName: "scriptShared", action: 'UPDATEORINSERT', value: script})
                    }
                }
            }
            this.logger.info(`update script data ids: ${JSON.stringify(publicScriptIds)}`);
            if(groupDatas.rowCount > 0 && batchTxnData.length > 0){
                groupDatas.data.forEach(group => {
                    group.scripts = publicScriptIds;
                    batchTxnData.push({dataEntityName: "group", action: 'UPDATEORINSERT', value: group})
                })
            }
            if(batchTxnData.length>0){
                this.logger.info(`update script data and group data count ${batchTxnData.length}`);
                const rtn= await bzdb.batchTxn(batchTxnData);
                result=rtn.status;
                if(!rtn.status){
                    this.logger.severe(`failed, ${rtn.message}`);  
                }
            }else{
                this.logger.info(`no group data need to be updated`);
            }
        } catch (error) {
            result = false;
            this.logger.severe(`update group data failed: ${JSON.stringify(error.message)}`);
        }
        return  {status:result};
    }

    /**
     * 
     * @returns {status}
     */
    async updateScriptKeyInLaunchpadAndHotspots(){
        let result = true;
        try {
            let hotspotPrivateDatas = await bzdb.select("hotspotPrivate");
            let launchpadPrivateDatas = await bzdb.select("launchpadPrivate");
            let batchTxnData=[];
            let hasChanged = false;
            if(hotspotPrivateDatas.rowCount>0){
                for(const hotspot of hotspotPrivateDatas.data){
                    for (let hp of hotspot.hotspotDefs){
                        if(hp.actionType == 'KEYMAP_TYPE_SCRIPT'){
                            this.logger.debug(`ready to update hotspot '${JSON.stringify(hp)}' in hotspotPrivate '${hotspot.id}'`);
                            hp.customized = true;
                            hasChanged = true;
                        }
                    }
                    if(hasChanged){
                        batchTxnData.push({dataEntityName: 'hotspotPrivate', action:'UPDATEORINSERT', value: hotspot})
                        hasChanged = false;
                    }
                }
            }

            this.logger.info(`update ${batchTxnData.length} item in hotspotPrivate : ${JSON.stringify(batchTxnData)}`);

            if(launchpadPrivateDatas.rowCount > 0 ){
                for(const launchpad of launchpadPrivateDatas.data){
                    for(let lp of launchpad.launchpad){
                        if(lp.actionType === 'KEYMAP_TYPE_SCRIPT'){
                            this.logger.debug(`ready to update launchpad '${JSON.stringify(lp)}' in launchpadPrivate '${launchpad.id}'`);
                            lp.customized = true;
                            hasChanged = true;
                        }
                    }
                    if(hasChanged){
                        batchTxnData.push({dataEntityName: 'launchpadPrivate', action:'UPDATEORINSERT', value: launchpad})
                        hasChanged = false;
                    }
                }
            }

            if(batchTxnData.length>0){
                this.logger.info(`update hotspotPrivate and launchpadPrivate data and total data count is : ${batchTxnData.length}`);
                const rtn= await bzdb.batchTxn(batchTxnData);
                result=rtn.status;
                if(!rtn.status){
                    this.logger.severe(`failed, ${rtn.message}`);  
                }
            }else{
                this.logger.info(`no group data need to be updated`);
            }
        } catch (error) {
            result = false;
            this.logger.severe(`update group data failed: ${JSON.stringify(error.message)}`);
        }
        return  {status:result};
    }
}
module.exports = UpgradeTo10_2_0Service;
