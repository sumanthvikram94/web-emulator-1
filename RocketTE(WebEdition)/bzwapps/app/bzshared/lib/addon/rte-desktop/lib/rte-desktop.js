'use strict'

const fs = require('fs-extra')

class RteDesktop {
    
    constructor(sessionType) {
        this.isUseAddon = false;
        this.sessionType = sessionType;
        if (this.isUseAddon) {
            // if use addon, need change package.json under lznt1 folder
            this.lznt1 = require('lznt1')  //lznt1 addon for lznt1 compress algorithm 
        } else {
            const EmLznt1 = require('../../lznt1/wasm/index')
            this.lznt1 = new EmLznt1;
        }
        if (this.isUseAddon) {
            if(sessionType === '3270') {
                this.binding = require('loady')('rte_desktop3270', __dirname);
            }
            if(sessionType === '5250') {
                this.binding = require('loady')('rte_desktop5250', __dirname);
            }
            if(sessionType === 'VT') {
                this.binding = require('loady')('rte_desktopvt', __dirname);
            }
        } else {
            const EmRteDesktop = require('../wasm/index')
            this.binding = new EmRteDesktop(sessionType);
        }
    }

    /**
    * Background: ini package used in RTE Web can't deal with binary data in RTE-Desktop profile correctly
    *
    * Parse a RTE-Desktop text profile or ini file to json array where the first dimension is 
    * section name in the file and the second dimension is setting name under this section.
    * @param data the buffer of entire RTE-Desktop ini-style text profile
    * @return if the data buffer is valid, a json object is returned where each section in the profile is 
    * the first level and has all its settings at the child level
    */
   ParseIniString(data) {
    let ini_data = {}
    try {
        var input = data.replace(/\r\n/g, '\n');
        input = input.replace(/([\]\.\+\*\?\^\$\(\)\[\]\{\}\|\\])/g, '\\$1')
        var sections = input.match(/\\\[([a-zA-Z\s\d]+)\\\]$(.*(?!\\\[))/gms)
        for(let section of sections) {
            var data = {}
            var part = section.match(/\\\[([a-zA-Z\s\d]+)\\\]$(.*(?!\\\[))/ms)
            var m = part[2].match(/([a-zA-Z\s\-_\d]+)\s*=\s*([^=]+)\s*$/gms)
            if(!m) continue
            for(let s of m) {
                s = s.replace(/\\?\n/gm, '')
                var v = s.match(/([a-zA-Z\s\-_\d\/]+)\s*=\s*"?([^="]*)"?\s*$/)
                v[2] = v[2].replace(/(\\)(?=[\]\.\+\*\?\^\$\(\)\[\]\{\}\|\\])/g, '')
                data[v[1]] = v[2]            
            }
            ini_data[part[1]] = data
        }
        return ini_data  
    } catch(e) {
        throw e;
    }
   }

    ParseTextProfile(file) {
        try {
            var input = fs.readFileSync(file, 'utf8')
            return this.ParseIniString(input)
        } catch(e) {
            throw e
        }
    }

    ParseIniFile(file) {
        return ParseTextProfile(file)
    }

    /**
     * Uncompress binary text block of key mappings in RTE-Desktop keyboard profile to array buffer
     * @param binaryText the binary text block in RTE-Desktop keyboard profile
     * @return if the input data block is valid, a uncompressed array buffer is returned.
    */     
    UncompressBinaryText(binaryText) {
        var v1 = binaryText.replace(/[,\\\s]/g, '')
        var v2 = v1.substr(-16, 8)
        var v3 = Buffer.from(v2, 'hex')
        var temp = v3[0]
        v3[0] = v3[3]
        v3[3] = temp
        temp = v3[1]
        v3[1] = v3[2]
        v3[2] = temp
        var size_before = parseInt(v3.toString('hex'), 16)
        v1 = v1.slice(0, -16)
        var buf = Buffer.from(v1, 'hex')        
        var out = this.lznt1.uncompress(buf)
        if(out.length === size_before) {
            return out.buffer
        }
        return []
    }

    /**
     * Convert general key mappings from binary buffer to web format
     * @param binaryText the binary text block in RTE-Desktop keyboard profile
     * @return if the input data block is valid, json format of RTE-Web key mapping is returned. Particularly, 
     * all key mappings not supported in RTE Web are stored under KEYMAP_TYPE_XXXDESKTOP type with corresponding action name
     * and its 0-based index in RTE-Desktop action list (KeyLabelTable array).
    */     
    BinaryText2WebGeneralKeyMapping(binaryText) {
        var out = this.UncompressBinaryText(binaryText);
        if(out.byteLength) {
            const text = this.binding.Binary2WebKeyMapping(out)
            return JSON.parse(text)
        }
    }    

    /**
     * Convert one string key mapping from binary buffer to web format
     * @param value the mapped action of single string key mapping in RTE-Desktop keyboard profile
     * which is for example, the value of String1
     * @param binaryText the binary text block of single string key mapping in RTE-Desktop keyboard profile, 
     * which is for example, the value of String1_Keys
     * @param type the type of string key mapping, so far 0 means Send Keys, 1 means Toggle Power Pad
     * @return if the input data block is valid, json format of RTE-Web key mapping is returned
    */    
    BinaryText2WebStringKeyMapping(value, binaryText, type) {
        var out = this.UncompressBinaryText(binaryText);
        if(out.byteLength) {
            const text = this.binding.Binary2StringKeyMapping(value, out, parseInt(type, 16))            
            return JSON.parse(text)
        }
    } 
    
    /**
     * Convert one script/macro key mapping from binary buffer to web format     
     * @param value the mapped action of single script/macro key mapping in RTE-Desktop keyboard profile
     * which is for example, the value of Script1_File or Macro1_File
     * @param binaryText the binary text block of single script/macro key mapping in RTE-Desktop keyboard profile, 
     * which is for example, the value of Script1_Keys or Macro1_Keys
     * @param type the type of string key mapping, so far 0 means Script, 1 means Macro
     * @return if the input data block is valid, json format of RTE-Web key mapping is returned.
    */    
   BinaryText2WebScriptKeyMapping(value, binaryText, type) {
        var out = this.UncompressBinaryText(binaryText);
        if(out.byteLength) {
            const text = this.binding.Binary2ScriptKeyMapping(value, out, type)            
            return JSON.parse(text)
        }
    }    

    /**
     * Convert all key mappings from binary buffer to web format
     * @param keyboard_setting the entire text data under Keyboard section of text-format of RTE-Desktop keyboard profile
     * @return json format of RTE-Web keyboard mapping is returned, including general key mappings, string key mappings and 
     * script key mappings. Particularly, all key mappings not supported in RTE Web are stored under KEYMAP_TYPE_XXXDESKTOP 
     * type with corresponding action name and its 0-based index in RTE-Desktop action list (KeyLabelTable array).
    */     
    BinaryText2WebKeyMapping(keyboard_setting) {
        let full_keys
        const filter = (source) => {
            full_keys.keyboardMapping = full_keys.keyboardMapping.map(item => {
                for(const src_item of source.keyboardMapping) {
                    if(item.key === src_item.key) {
                        item.mapping = item.mapping.map((value, index) => {
                            if(src_item.mapping[index].value !== 'null') {
                                return src_item.mapping[index]
                            } else {
                                return value
                            }
                        })
                        break        
                    }
                }
                return item
            })
            //add keys in the source that don't exist in the target
            for(const src_item of source.keyboardMapping) {
                const item = full_keys.keyboardMapping.filter(item => item.key === src_item.key)
                if(!item.length) {
                    full_keys.keyboardMapping.push(src_item)
                }
            }           
        }

        const doString = (obj, value, binary, type) => {
            return obj.BinaryText2WebStringKeyMapping(value, binary, type)
        }
        const doScript = (obj, value, binary, type) => {
            return obj.BinaryText2WebScriptKeyMapping(value, binary, 0)
        } 
        const doMacro = (obj, value, binary, type) => {
            return obj.BinaryText2WebScriptKeyMapping(value, binary, 1)
        }                         

        const string_metadata = [
            { key: 'String', suffix: '', func: doString },
            { key: 'Script', suffix: '_File', func: doScript },
            { key: 'Macro', suffix: '_File', func: doMacro }          
        ]
        try {
            full_keys = this.BinaryText2WebGeneralKeyMapping(keyboard_setting['Current Key Mappings'])

            for(const item of string_metadata) {
                const count = keyboard_setting[`Number ${item.key} Functions`]
                for(let i = 0; i < count; i++) {
                    const source = item.func(this, keyboard_setting[`${item.key}${i+1}${item.suffix}`], 
                        keyboard_setting[`${item.key}${i+1}_Keys`], 
                        keyboard_setting[`${item.key}${i+1}_type`])
                    filter(source)
                }
            }
            return full_keys
        } catch(e) {
            throw e;
        }
    }

    /**
     * Convert all key mappings from editable settings to web format
     * @param kbdata the entire editable data under Keyboard section of text-format of RTE-Desktop keyboard profile
     * @return json format of RTE-Web keyboard mapping is returned, including general key mappings, string key mappings and 
     * script key mappings. Particularly, all key mappings not supported in RTE Web are stored under KEYMAP_TYPE_XXXDESKTOP 
     * type with corresponding action name and its 0-based index in RTE-Desktop action list (KeyLabelTable array).
    */     
    Editable2WebKeyMapping(kbdata) {
        try {
            var input = kbdata.replace(/\r\n/g, '\n')
            input = input.replace(/([\]\.\+\*\?\^\$\(\)\[\]\{\}\|\\])/g, '\\$1')  
            var data = input.match(/\\\[Keyboard\\\]$(.*(?!\\\[))/ms)
            if(!data) return {}
            data[1] = data[1].replace(/(\\)(?=[\]\.\+\*\?\^\$\(\)\[\]\{\}\|\\])/g, '')
            const text = this.binding.Editable2WebKeyMapping(data[1])
            return JSON.parse(text)

        } catch(e) {
            throw e;
        }
    }
}

class RteDesktopExport {
    constructor(sessionType) {
        this.desktop = new RteDesktop(sessionType);
    }   

    /**
     * Convert all key mappings from binary buffer to web format
     * @param keyboard_setting the entire text data under Keyboard section of text-format of RTE-Desktop keyboard profile
     * @return json format of RTE-Web keyboard mapping is returned, including general key mappings, string key mappings and 
     * script key mappings. Particularly, all key mappings not supported in RTE Web are stored under KEYMAP_TYPE_XXXDESKTOP 
     * type with corresponding action name and its 0-based index in RTE-Desktop action list (KeyLabelTable array).
    */  
    BinaryText2WebKeyMapping(keyboard_setting) {
        return this.desktop.BinaryText2WebKeyMapping(keyboard_setting)
    }

    /**
    * Background: ini package used in RTE Web can't deal with binary data in desktop profile correctly
    *
    * Parse a desktop text profile or ini file to json array where the first dimension is 
    * section name in the file and the second dimension is setting name under this section.
    * @param data the buffer of entire RTE-Desktop ini-style text profile
    * @return if the data buffer is valid, a json object is returned where each section in the profile is 
    * the first level and has all its settings at the child level
    */
    ParseIniString(data) {
        return this.desktop.ParseIniString(data)
    }

    /**
     * Convert all key mappings from editable settings to web format
     * @param kbdata the entire editable data under Keyboard section of text-format of RTE-Desktop keyboard profile
     * @return json format of RTE-Web keyboard mapping is returned, including general key mappings, string key mappings and 
     * script key mappings. Particularly, all key mappings not supported in RTE Web are stored under KEYMAP_TYPE_XXXDESKTOP 
     * type with corresponding action name and its 0-based index in RTE-Desktop action list (KeyLabelTable array).
    */     
    Editable2WebKeyMapping(kbdata) {
        return this.desktop.Editable2WebKeyMapping(kbdata)
    }
}

module.exports = {
    init(sessionType) {
        return new RteDesktopExport(sessionType);
    }
}