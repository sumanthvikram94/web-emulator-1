const bzdb = require('../../../bzshared/lib/services/bzdb.service');
const UpgradeTo10_1_1 = require('./upgradeTo10_1_1.service'); // upgrad to 10.1.1 
const path = require('path');
const fse = require('fs-extra');
const zoweService = require('../../../bzshared/lib/services/zowe.service');
const jsonUtils = zoweService.jsonUtils;

class UpgradeTo10_2_1Service  extends UpgradeTo10_1_1 {

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
    }

    async doUpgrade(migratePath){
        //reset the path
        this.upgradePath = migratePath?migratePath:this.upgradePath; 

        let result = {status:true};  //init
        this.logger.info(`start the 10.2.1 upgradation.`)

        //upgrade the root CA in zluxserver.json, decouple it with HTTPS
        if(result.status){ 
            this.logger.info(`start - decouple CA with HTTPS`);
            const decoupleResult=await this.decoupleCAwithHTTPS();
            result = Object.assign(result,decoupleResult);
            this.logger.info(`end - decouple CA with HTTP`);
        }


        if(result.status){ 
            this.logger.info(`start do upgrade - delete script under .../deploy/instance/users/<users>/ZLUX/pluginStorage/com.rs.bzw/scripts.`);
            const scriptDeletedResult = await this.deleteScriptUnderUsers();
            result = Object.assign(result,scriptDeletedResult);
            this.logger.info(`end do upgrade - delete script under .../deploy/instance/users/<users>/ZLUX/pluginStorage/com.rs.bzw/scripts.`);
        }

        if(result.status){ 
            this.logger.info(`start to reset the script file name.`);
            const resetScriptFileNameResult = await this.resetScriptFileName();
            result = Object.assign(result,resetScriptFileNameResult);
            this.logger.info(`end to reset the script file name.`);
        }

        //end upgrade
        if (result.status) {  
            this.logger.info(`finished the 10.2.1 upgradation.`)
        } else {
            this.logger.severe(`failed the 10.2.1 upgradation.`) 
        }
        return result;
    }

    /**
     * delete scripts under user's folder.
     * @returns {status}
     */
    async deleteScriptUnderUsers() {
        this.logger.info(`start to delete scripts folder under users. ` );
        let userPath = path.join(this.deployPath,`./instance/users`);
        let scriptsPath;
        try{
            if(fse.existsSync(userPath)) {
                const users = fse.readdirSync(userPath);
                users.forEach(userId => {
                    scriptsPath = path.join(userPath,userId,'./ZLUX/pluginStorage/com.rs.bzw/scripts');
                    if(fse.existsSync(scriptsPath)) {
                        fse.rmSync(scriptsPath, { recursive: true });
                    }else{
                        this.logger.info(`The given path ${scriptsPath} does not exist !`);
                    }
                })
            }else{
                this.logger.info(`The path ${userPath} does not exist !`);
            }
        }catch(error){
            this.logger.severe(`delete scripts folder under failed: ${JSON.stringify(error.message)}`);
            return {status: false}
        }
        this.logger.info(`end to delete scripts folder under users. ` );
        return {status: true}
    }

    /**
     * reset script file name: type_uuid 
     *   there is a bug in upgrade 10.1.1, the script name was not encode after moving script under users to bzdb.  eg. a_3270_t:t.json will be lost.
     *   using type_uuid to generate the script file name 
     * @returns {status:boolean}
     */
    async resetScriptFileName() {
        let result = true;
        let scriptPrivate=await bzdb.select("scriptPrivate");
        this.logger.info(`before, scriptPrivate  count ${scriptPrivate.rowCount}`);
        await bzdb.delete("scriptPrivate") //clean
        let batchTxnData=[];
        if(scriptPrivate.rowCount > 0){
            for(const script of scriptPrivate.data){
                script.id = `${script.type}_${bzdb.getUIDSync()}`
                batchTxnData.push({dataEntityName: "scriptPrivate", action: 'INSERT', value: script}) 
            }
        }
        if(batchTxnData.length > 0){
            try{
                this.logger.info(`insert scriptPrivate count ${batchTxnData.length}`);
                const rtn= await bzdb.batchTxn(batchTxnData);
                result=rtn.status;
                if(!rtn.status){
                    this.logger.severe(`insert scriptPrivate failed, ${rtn.message}`);  
                }
            }catch(err){
                result=false;
                this.logger.severe(`failed to insert scriptPrivate`);
            }
        }else{
            this.logger.info(`no scriptPrivate need to be insert`);
        }
        return {status:result};
    }


    /**
    * update zluxserver.json
    * @returns {status}
    */
    async decoupleCAwithHTTPS() {
        let result = true;
        this.logger.info(`start to modify zluxserver.json.`);
        const zluxServerPathArr = ['/instance/ZLUX/serverConfig/zluxserver.json', '/product/ZLUX/serverConfig/zluxserver.json']
        let hasChanged = false;
        for (const zServerPath of zluxServerPathArr) {
            const zluxServerPath = path.join(this.deployPath, zServerPath);
            if (fse.existsSync(zluxServerPath)) {
                try {
                    const zluxContent = jsonUtils.parseJSONWithComments(zluxServerPath);

                    if (zluxContent.node?.https?.certificateAuthorities && !zluxContent.node?.tlsOptions?.ca) {
                        if (!zluxContent.node?.tlsOptions?.ca) zluxContent.node.tlsOptions = { ca: [] }
                        this.logger.info(`set tlsOptions.ca`);
                        this.logger.debug(`certificates is ${zluxContent.node.https.certificateAuthorities.join()}`);
                        zluxContent.node.tlsOptions.ca = zluxContent.node.https.certificateAuthorities
                        delete zluxContent.node.https.certificateAuthorities
                        hasChanged = true
                    }
                    if (hasChanged) {
                        fse.writeFileSync(zluxServerPath, JSON.stringify(zluxContent, null, 2), { mode: 0o770 }, (err) => {
                            if (err) {
                                this.logger.severe('modify zluxserver.json occur error : ' + err.message);
                                result = false;
                            }
                        });
                        hasChanged = false;
                    }
                } catch (error) {
                    result = false;
                    this.logger.severe(`modify zluxserver.json occur error : ` + error);
                }
                this.logger.info('modify zluxserver.json successfully, the path is ' + zluxServerPath);
            }
        }
        this.logger.info(`end to modify zluxserver.json.`);
        return { status: result }
    }

}
module.exports = UpgradeTo10_2_1Service;
