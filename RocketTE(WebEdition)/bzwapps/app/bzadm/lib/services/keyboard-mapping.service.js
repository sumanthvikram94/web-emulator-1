
const {init, rteDesktop} = require('../../../bzshared/lib/services/utils.service');
const bzdb = require('../../../bzshared/lib/services/bzdb.service');
const Bzw2hUtils = require('./bzw2h-utils');
const w2h_const = require('../../../bzshared/lib/model/w2h-const'); // BZ-20034, update version to 10.2.0
const BZSHARED_DEFAULTS_PATH  = '/product/ZLUX/pluginStorage/com.rs.bzshared/defaults';
const fse = require('fs-extra');
const langTranMapping = {
    "Dutch" : "nld" ,
	"English (U.S.)" : "en-us" ,
    "English (International)" : "en-intl",
    "English (U.K.)" : "en-uk",
	"French" : "fra" ,
	"French (Canada)" : "frca",
	"French (Switzerland)" : "frasf" ,
	"German" : "deu",
	"German (Switzerland)" : "deusg",
	"Italian" : "ita",
    "Japanese" : "jpn",
	"Spanish" : "esp"
}

class KeyboardMappingService {
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

    parseText(data, type) {
        const desktop = rteDesktop.init(type)
        const ini = desktop.ParseIniString(data)
        let keyboardMapping = null;
        let languageResult = {"name":"US Standard","value":"English (United States)","altGrOn":false,"lang":"en-us"};
        let keyboardOption = {
            autoResetOptions: {
                isAutoReset: false,
                isAutoTab: false,
                isImmediate: false,
                isPressNextKey: true
            },
            rapidLeftRight: true,
            autoSkipBackspace: true,
            stopAtBeginning: false, 
            destructiveBackspace: false,
            dbClick2Selected: false,
            autoCopy: false
        };
        let keyboardTranslateLabel = null;
        if(ini) {
            if(ini['Keyboard']['Current Key Mappings'])
                keyboardMapping = desktop.BinaryText2WebKeyMapping(ini['Keyboard'])['keyboardMapping'];
            else
                keyboardMapping = desktop.Editable2WebKeyMapping(data)['keyboardMapping'];
            keyboardOption = {
                autoResetOptions:{
                    isAutoReset : Boolean(Number(ini['Keyboard']['Auto-Reset']?ini['Keyboard']['Auto-Reset']:0)),
                    isAutoTab : Boolean(Number(ini['Keyboard']['Auto-Reset Tab']?ini['Keyboard']['Auto-Reset Tab']:0)),
                    isImmediate : !Boolean(Number(ini['Keyboard']['Auto-Reset Key']?ini['Keyboard']['Auto-Reset Key']:0)),
                    isPressNextKey : Boolean(Number(ini['Keyboard']['Auto-Reset Key']?ini['Keyboard']['Auto-Reset Key']:0))
                },
                autoSkipBackspace : Number(ini['Keyboard']['Backspace Option']?ini['Keyboard']['Backspace Option']:0) === 1,
                dbClick2Selected : false,
                autoCopy : false,
                destructiveBackspace : Boolean(Number(ini['Keyboard']['Destructive Backspace']?ini['Keyboard']['Destructive Backspace']:0)),
                rapidLeftRight : Boolean(Number(ini['Keyboard']['Right']?ini['Keyboard']['Right']:0)),
                stopAtBeginning : Number(ini['Keyboard']['Backspace Option']?ini['Keyboard']['Backspace Option']:0) === 2,
                paste:{
                    skipSpace : true
                }
            }
            if(type === 'VT')//BZ-19192 support VT keyboard options
            {
                const keypadModes = ['hostctr', 'num', 'app'];
                const index = ini['Keyboard']['KeyPadMode']?Number(ini['Keyboard']['KeyPadMode']):1;
                if(index<0 || index>=keypadModes.length) index = 1;
                keyboardOption.keypadMode = keypadModes[index];
            }
            if( (!this.context.plugin.server.config.user.bzw2hMode) && type === '5250' && keyboardOption.stopAtBeginning)
            {
                keyboardOption.autoSkipBackspace = true;
                keyboardOption.stopAtBeginning = false;


            }
        }
        if(keyboardTranslateLabel = this.getKeyboardLayout()){
            let filterResult = keyboardTranslateLabel['lists'].filter(d => d.lang ===langTranMapping[ini['Keyboard']['Layout']]);
            if(filterResult[0]){
                languageResult = filterResult[0];
            }else{
                languageResult = keyboardTranslateLabel['lists'].filter(d => d.lang === 'en-us')[0];
            }
        }
        return {"keyboardMapping": keyboardMapping,
                "keyboardLanguage": languageResult,
                "keyboardOption": keyboardOption 
                };
    }
    getKeyboardLayout() {
        let keyboardLayoutPath = `${this.deployPath}${BZSHARED_DEFAULTS_PATH}/keyboardLayout.json`;
        let layout;
        if (fse.existsSync(keyboardLayoutPath)) {
            this.logger.info(`get keyboard layout from path:${keyboardLayoutPath}`);
            layout = fse.readJSONSync(keyboardLayoutPath);
            return layout;
        }
        this.logger.info(`There is no keyboard layout file under path:${keyboardLayoutPath}`);
        return false;
    }

    async add(data, res) {
        const batchTxnData = [];

        if (data.action === 'add') {
            const rs = await bzdb.select('keyboardMappingShared', {name: data.name});
            if (rs.rowCount > 0){
                res.status(500).json({status: false, message: 'The name already exists'});
                return;
            }
            const existId = await this.utils.getIdByName('keyboard', data.name);
            if (existId !== '') { // Doing add, but name already exists
                res.status(500).json({status: false, message: 'The name already exists'});
                return;
            }
            data.id = bzdb.getUIDSync(); // Generate ID for new keyboard Mapping
            batchTxnData.push({dataEntityName: 'keyboardMapping', action:'UPDATEORINSERT', value: {
                id: data.id,
                name: data.name,
                type: data.terminalType
              }, options:{}})
        } else if (data.action === 'edit') {
            const rsid = await bzdb.select('keyboardMappingShared', {id: data.id});
            if (rsid.rowCount === 0) {
                res.status(500).json({status: false, message: 'The data to update doesn\'t exist'});
                return;
            }
        } else if(data.action === 'upload') {
            if (data.name === '') { 
                res.status(500).json({status: false, message: 'The name is invalid'});
                return;
            }            
            data.name = await this.getName(data.name);
            if (data.name === '') { 
                res.status(500).json({status: false, message: 'The name already exists'});
                return;
            }

            data.id = bzdb.getUIDSync(); // Generate ID for new keyboard Mapping
            batchTxnData.push({dataEntityName: 'keyboardMapping', action:'UPDATEORINSERT', value: {
                id: data.id,
                name: data.name,
                type: data.terminalType
              }, options:{}})            
        }

        data.timestamp = Date.now();

        try {
            batchTxnData.push({dataEntityName: 'keyboardMappingShared', action:'UPDATEORINSERT', value: data, options:{}})
            const rep = await bzdb.batchTxn(batchTxnData)
            // const rep = await bzdb.updateOrInsert('keyboardMappingShared', data);
            if (rep && rep.status){
                res.status(200).json({status: true, data: data});
                this.logger.info(`Update keyboard "${data.name || ''}" successful`);
            } else {
                this.logger.severe(`Update keyboard "${data.name || ''}" failed: ${rep && rep.message || 'Exception occurs'}`);
                this.logger.debug(`keyboard data: ${JSON.stringify(data)}`);
                res.status(500).json(rep);
            }
        }catch(e) {
            res.status(500).json(e);
            this.logger.info(`Write keyboard "${data.name || ''}" failed`);
        }      
    }

    async getName(profileName) {
        if (!profileName) return '';

        let name = Bzw2hUtils.generateKeyboardMappingNameFromProfileName(profileName);
        if (name.length === w2h_const.MAX_KEYMAPPING_NAME_LENGTH) {
            name = name.slice(0, w2h_const.MAX_KEYMAPPING_NAME_LENGTH - 3);
        }
        const existId = await this.utils.getIdByName('keyboard', name);
        if(existId === '') {
            return name;
        }

        let newname = '';
        for(let n = 1; n < 100; n++) {
            newname =  name + '_' + n;
            const existId = await this.utils.getIdByName('keyboard', newname);
            if (existId === '')
                break;
            else {
                newname = '';
            }
        }
        return newname;
    }    
}

module.exports = {
    init(context, utils) {
		return new KeyboardMappingService(context, utils);
	}
};
