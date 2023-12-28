
const {init, rteDesktop} = require('../../../bzshared/lib/services/utils.service');
const bzdb = require('../../../bzshared/lib/services/bzdb.service');
const MAX_SCRIPT_NAME_LENGTH = 128;
class ScriptService {
    constructor(context, utils) {
        this.context = context;
        this.logger = context.logger;
        this.utils = utils;
        this.deployPath = this.context.plugin.server.config.user.rootDir;

        init(this.logger);
    }

    fileIsBinary(data) {
        return data.slice(0, 8).search(/BZMDKYBD|BZADKYBD|BZVTKYBD/) > -1;
    }

    async shareScript(data,res){
        let batchTxnData = [];
        const groups = await bzdb.select("group");
        if(groups.rowCount > 0){
            if(data.status === 'groups'){
                groups.data.forEach(g => {
                    if(!g.scripts){
                        g.scripts = [];
                    }
                    if(data.groups?.includes(g.id)){  //if group id in selected group
                        if(!g.scripts?.includes(data.id)){ // if(script id is not in group.scripts) then put it in
                            
                            g.scripts.push(data.id);
                            batchTxnData.push({dataEntityName: 'group', action:'UPDATEORINSERT', value: g })
                        }
                    }else { //if group id is not in selected group
                        if(g.scripts?.includes(data.id)){  // if script id is in group.scripts then remove it out
                            g.scripts.splice(g.scripts.findIndex(item => item === data.id), 1)
                            batchTxnData.push({dataEntityName: 'group', action:'UPDATEORINSERT', value: g })
                        }
                    }
                })
            }else if(data.status === 'public'){
                groups.data.forEach(g => {
                    if(!g.scripts){
                        g.scripts = [];
                    }
                    if(!g.scripts.includes(data.id)){
                        g.scripts.push(data.id)
                        batchTxnData.push({dataEntityName: 'group', action:'UPDATEORINSERT', value: g })
                    }
                })
            }else if(data.status === 'private'){
                groups.data.forEach(g => {
                    if(g.scripts?.includes(data.id)){
                        g.scripts.splice(g.scripts.findIndex(item => item === data.id), 1)
                        batchTxnData.push({dataEntityName: 'group', action:'UPDATEORINSERT', value: g })
                    }
                })
            }
        }
            
        let result = {};
        if(data && data.id.length > 0 ){
            try {
                delete data.groups;
                batchTxnData.push({dataEntityName: 'scriptShared', action:'UPDATEORINSERT', value: data })
                const rep = await bzdb.batchTxn(batchTxnData);
                if (rep && rep.status && rep.results.length > 0){
                    this.logger.info(`edit scripts successful `);
                    result = {status: true};
                } else {
                    this.logger.severe(`edit scripts  failed: ${rep && rep.message || 'Exception occurs'}`);
                    this.logger.debug(`script data : ${JSON.stringify(data)}`);
                    result = {status : false, message:rep && rep.message || 'Exception occurs'}
                }
            }catch(e) {
                this.logger.info(`edit script failed \n ${e.stack}`);
                result = {status : false, message:e.message || 'Exception occurs'}
            } 
            res.status(200).json(result);
        }else{
            res.status(500).json({status: false, message:'the script is not exists'});
        }
        
    }

    async rename(req, res){
        const script = req.body;
        const filter = {id: script.id}
        let value = await bzdb.select('scriptShared', filter);
        if(value.data && value.data.length == 1){
            value.data[0].name = script.name
            value.data[0].timestamp = Date.now();
            let batchTxnData = [];
            let results = [];
            batchTxnData.push({
                dataEntityName: 'scriptShared', options: {}, action: 'UPDATEORINSERT', value: value.data[0]
            });
            try {
                if(batchTxnData.length > 0){
                    const rep = await bzdb.batchTxn(batchTxnData)
                    if (rep && rep.status && rep.results.length > 0){
                        this.logger.info(`rename scripts successful `);
                        results.push({status: true});
                    } else {
                        this.logger.severe(`rename scripts  failed: ${rep && rep.message || 'Exception occurs'}`);
                        this.logger.debug(`script data in batchTxnData: ${JSON.stringify(batchTxnData)}`);
                        results.push( {status : false, message:rep && rep.message || 'Exception occurs'})
                    }
                }
            }catch(e) {
                this.logger.info(`rename script failed \n ${e.stack}`);
                results.push( {status : false, message:e.message || 'Exception occurs'})
            } 
            res.status(200).json({status: true, data: results});
        }else{
            res.status(500).json({status: false, message:'the script is not exists'});
        }
    }

    async upload(req, res) {
        const files = req.body.data;
        let batchTxnData = [];
        let results = [];
        let successUploadFileNames = [];
        let tmpNames = [];
        for await (let fileObj of files) {
            try {
                const isBinary = this.fileIsBinary(fileObj.file);
                if (isBinary) {
                    this.logger.severe(`${fileObj.name} is binary format`);
                    results.push({status: false, message: `The file is not text format`,fileName:fileObj.name}); 
                    continue;
                } else {
                    if(!(fileObj.name.search(/\.json$/i) > -1)) {//valid file extension
                        this.logger.severe(`${fileObj.name} : The file extension is invalid`);
                        results.push({status: false, message: `The file extension is invalid`,fileName:fileObj.name}); 
                        continue;   
                    }
                    const data =  JSON.parse(fileObj.file);
                    data.username = req.headers.username;
                    
                    if (!data.name) { 
                        this.logger.severe(`${fileObj.name} : The file attribute 'name' does not exist `);
                        results.push( {status: false, message: `The file data format is incorrect`,fileName:fileObj.name});
                        continue;
                    }
                    if(['vt','5250','3270'].indexOf(data.type) == -1 ){
                        // if(!data.type === 'vt' && data.script.script.includes("waitForString")){
                        //     this.logger.severe(`${fileObj.name} : The file has the function 'waitForString' but it is not a vt script `);
                        //     results.push( {status: false, message: `The type is invalid `,fileName:fileObj.name});    
                        //     continue;
                        // }
                    // }else{
                        this.logger.severe(`${fileObj.name} : The type is invalid : ${data.type} `);
                        results.push( {status: false, message: `The file data format is incorrect `,fileName:fileObj.name});    
                        continue;
                    }       
        
                    data.name = await this.getName(data.name,tmpNames);
                    
                    if(!( data.type && data.id && data.script && data.script.script != undefined )){
                        this.logger.severe(`${fileObj.name} is invalid data format ,these attributes (username,type,id,script,script.script) are necessary.`);
                        results.push( {status: false, message: `The file data format is incorrect`,fileName:fileObj.name});  
                        continue;
                    }
        
                    data.id = data.type+"_" + bzdb.getUIDSync(); // Generate ID for new Session Script  remove data.username+"_" + from scriptId
                    data.timestamp = Date.now();
                    successUploadFileNames.push({fileName:fileObj.name,scriptName:data.name,id:data.id,type:data.type});
                    batchTxnData.push({dataEntityName: 'scriptShared', action:'UPDATEORINSERT', value: data, options:{}})
                }
            } catch (e) {
                this.logger.severe(`Failed to import script: ${fileObj.name}\n${e.stack}`);
                results.push({status: false, message: `The file data format is incorrect`,fileName:fileObj.name});
            }
        };
        try {
            if(batchTxnData.length > 0){
                const rep = await bzdb.batchTxn(batchTxnData)
                if (rep && rep.status && rep.results.length > 0){
                    this.logger.info(`Update scripts successful ,total :${ batchTxnData.length} ,success : ${ rep.results.length} `);
                    results.push({status: true, count: rep.results.length,files:successUploadFileNames});
                } else {
                    this.logger.severe(`Update scripts  failed: ${rep && rep.message || 'Exception occurs'}`);
                    this.logger.debug(`script data in batchTxnData: ${JSON.stringify(batchTxnData)}`);
                    results.push( {status : false, message:rep && rep.message || 'Exception occurs',fileName:'Exception occurs'})
                }
            }
        }catch(e) {
            this.logger.info(`Write script failed \n ${e.stack}`);
            results.push( {status : false, message:e.message || 'Exception occurs',fileName:'Exception occurs'})
        } 
        
        res.status(200).json({status: true, data: results});
    }

    async getName(profileName,tmpNames) {
        if (!profileName) return '';
        let name = this.generateScriptNameFromProfileName(profileName);

        const existId = await this.utils.getIdByName('script', name);
        if(existId === '' && tmpNames.indexOf(name) === -1) {
            tmpNames.push(name)
            return name;
        }

        let newname = '';
        for(let n = 1; n < 100; n++) {
            newname =  name + '_' + n;
            const existId = await this.utils.getIdByName('script', newname);
            if (existId === '' && tmpNames.indexOf(newname) === -1){
                tmpNames.push(newname);
                break;
            } else {
                newname = '';
            }
        }
        return newname;
    }

    generateScriptNameFromProfileName(profileName) {   
        // remove the extension
        let name = profileName.length <= MAX_SCRIPT_NAME_LENGTH ? profileName : profileName.slice(0, MAX_SCRIPT_NAME_LENGTH);
        name = name.replace(/[&#%+]{1}/g, '-');  // /\*&:%#?~+`"|<>
        return name;
    } 

    async removeRelation(scriptId, scriptName, action){
        let batchTxnData = [];

        if(action === 'delete'){
            const sessionShared = await bzdb.select('sessionShared');
            if(sessionShared.rowCount > 0){
                for(const s of sessionShared.data){
                    if((s.advanced && s.advanced.autoRunScript === scriptId)){
                        s.advanced.autoRunScript = null;
                        batchTxnData.push({dataEntityName: 'sessionShared', action:'UPDATEORINSERT', value: s})
                        this.logger.debug(`Delete script '${scriptName}' in sessionShared '${s.name}' successful`);
                    }
                }

            }
            
            const hotspot = await bzdb.select('hotspotShared');
            if(hotspot.rowCount > 0){
                let hashotspot = false;
                for(const hp of hotspot.data){
                    for (const h of hp.hotspotDefs){
                        if(h.actionValue === scriptId && h.actionType == 'KEYMAP_TYPE_SCRIPT' ){
                            h.actionType = 'Unmapped';
                            h.actionValue = '';
                            hashotspot = true;
                            this.logger.debug(`Delete script '${scriptName}' in hotspotShared '${h.textToMatch}' successful`);
                        }
                    }
                    if(hashotspot){
                        batchTxnData.push({dataEntityName: 'hotspotShared', action:'UPDATEORINSERT', value: hp})
                        hashotspot = false;
                    }
                }
            }

            const keyboard = await bzdb.select('keyboardMappingShared');
            if(keyboard.rowCount > 0 ){
                let haskeyboard = false;
                for(const kb of keyboard.data){
                    kb.keyboardMapping.forEach(kbmaping => {
                        kbmaping.mapping.forEach(d => {
                            if(d.value === scriptId && d.type === 'KEYMAP_TYPE_SCRIPT'){
                                d.value = 'null';
                                d.type = 'null';
                                delete d.isAdminChanaged
                                haskeyboard = true;
                                this.logger.debug(`Delete script '${scriptName}' in keyboardMappingShared '${kb.name}' and the key is '${kbmaping.key}' successful`);
                            }
                        })
                    })
                    if(haskeyboard){
                        batchTxnData.push({dataEntityName: 'keyboardMappingShared', action:'UPDATEORINSERT', value: kb})
                        haskeyboard = false;
                    }
                }
            }

            const launchpad = await bzdb.select('launchpadShared');
            if(launchpad.rowCount > 0 ){
                let haslaunchpad = false;
                for(const lp of launchpad.data){
                    for(const l of lp.launchpad){
                        if(l.action === scriptId && l.actionType === 'KEYMAP_TYPE_SCRIPT'){
                            l.action = '';
                            l.actionType = 'Unmapped';
                            haslaunchpad = true;
                            this.logger.debug(`Delete script '${scriptName}' in launchpadShared '${l.name}' successful`);
                        }
                    }
                    if(haslaunchpad){
                        batchTxnData.push({dataEntityName: 'launchpadShared', action:'UPDATEORINSERT', value: lp})
                        haslaunchpad = false;
                    }
                }
            }
        }
        return batchTxnData;
    }
}

module.exports = {
    init(context, utils) {
		return new ScriptService(context, utils);
	}
};