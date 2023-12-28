
const fs = require('fs-extra');
const path = require('path');
const util = require('util');
const zoweService = require('../../../bzshared/lib/services/zowe.service');
const jsonUtils = zoweService.jsonUtils;
const FilerDirectory = require("./fileDirectory.service");
const ServerRuntimeService = require('../../../bzshared/lib/services/server-runtime.service');
const bzdb = require('../../../bzshared/lib/services/bzdb.service');

var readline = require('readline');
var events = require('events');
class Utiles {

    async getData(dir, subName) {
        const files = this.getFiles(dir) || [];
        return await Promise.all(files
            .filter(file => (subName.length && file.indexOf(`${subName}`) > -1))
            .map(async (file) => {
                let dataText = await this.readFilePromise(path.resolve(`${dir}/${file}`), 'utf8');
                let dataObj = JSON.parse(dataText);
                return dataObj;
            }));
    }
    readFilePromise(path, opts = 'utf8') {
        return new Promise((resolve, reject) => {
            fs.readFile(path, opts, (err, data) => {
                if (err) reject(err)
                else resolve(data)
            })
        });
    }
    getFiles(dir) {
        const dir1 = path.resolve(dir);

        if (fs.existsSync(dir1)) {
            return fs.readdirSync(dir1);
        }

        return [];
    }


    /**
     * Replaces the getNewID function. Do the same thing, but with new unique ID format. This function does:
     * - Check the given name exist or not. If exists, return ''
     * - Generate a new unique ID, returns the new ID value
     * - Insert a new mapping data with the ID.
     * @param {*} type   //"keyboard","sessionsetting"
     * @param {*} protocol  ////"3270","5250","vt"
     * @param {*} name 
     */
     async ensureMapping(type, protocol, name) {
        if (!(!!type && !!protocol && !!name)) { // validates the input
            return '';
        }
        let mappingFile = '';
        if (type.toLowerCase() === "sessionsetting") {
            mappingFile = 'sessionSettingMapping';
        } else if (type.toLowerCase() === "keyboard") {
            mappingFile = 'keyboardMapping';
        }
        const mappingData = await bzdb.select(mappingFile, {name});
        if (mappingData.rowCount === 0){ // name not exist
            const id = bzdb.getUIDSync()
            let IdObject = {
                id,
                name,
                type: protocol
            }
            const rep = await bzdb.updateOrInsert(mappingFile, IdObject);
            if(rep && rep.status) {
                return IdObject.id;
            } else {
                return rep;
            }
        } else { // name already exists
            return '';
        }
    }


    // /**
    //  * 
    //  * @param {*} type   //"keyboard","sessionsetting"
    //  * @param {*} protocol  ////"3270","5250","vt"
    //  * @param {*} name 
    //  */
    // async getNewID(type, protocol, name) {
    //     if (!(!!type && !!protocol && !!name)) {
    //         return Promise.resolve('');
    //     }
    //     const sessionSettingPath = FilerDirectory.Get_BZAadmin_Instance_SessionSetting_Path();
    //     const IdPrefix = "BZA";
    //     let IdProtocol = "";
    //     let IdIndex = "0000001";
    //     let indexFile = "", mappingFile = '';
    //     if (protocol === "3270") {
    //         IdProtocol = "M";
    //     } else if (protocol === "3270p") {
    //         IdProtocol = "P";
    //     } else if (protocol === "5250") {
    //         IdProtocol = "I";
    //     } else if (protocol === "VT") {
    //         IdProtocol = "V";
    //     } else {
    //         IdProtocol = "O"
    //     }
    //     let jsonData = new Array();
    //     let IdObject = {
    //         id: "",
    //         name: name,
    //         type: protocol
    //     }
    //     if (type.toLowerCase() === "sessionsetting") {
    //         indexFile = path.join(sessionSettingPath, "sessionSettingMapping.json");
    //         mappingFile = 'sessionSettingMapping';
    //     } else if (type.toLowerCase() === "keyboard") {
    //         indexFile = path.join(sessionSettingPath, "keyboardMapping.json");
    //         mappingFile = 'keyboardMapping';
    //     }
    //     const mappingData = await bzdb.select(mappingFile);
    //     jsonData = [].concat(...mappingData.data);
    //     if (jsonData && jsonData instanceof Array) {
    //         let len = jsonData.length;
    //         if (len > 0) {
    //             const existObj = jsonData.filter(value => value.name === name) || {};
    //             if (existObj.length == 0) {  //check name duplicated
    //                 const lastIndex = jsonData[len - 1].id;
    //                 // for compatibility with upgrade from 1.1.5/1.1.6: id is session name
    //                 IdIndex = jsonData[len - 1].isUpgrade ? "0000001" : this.NextId(lastIndex);
    //             }
    //         }
    //     }
    //     if (!!IdIndex) {
    //         IdObject.id = IdPrefix + IdProtocol + IdIndex;
    //         jsonData.push(IdObject);
    //         return new Promise(async (resolve, reject) => {
    //             const rep = await bzdb.updateOrInsert(mappingFile, IdObject);
    //             if(rep && rep.status) {
    //                 return resolve(IdObject.id);
    //             } else {
    //                 return resolve(rep);
    //             }
    //         });
    //     } else {
    //         return Promise.resolve('');
    //     }
    // }

    // deprecated
    // async getGroupId(dir) {
    //     const file = path.resolve(`${dir}/id_manager.json`);
    //     const PADDING = '000000';

    //     if (!fs.existsSync(file)) return PADDING + 1;
        
    //     const ids = await bzdb.select('groupId');
    //     const data = ids.data[0] || {};

    //     if(data.id && data.id.search(/000000/) < 0) return PADDING + 1;

    //     let id = parseInt(data.id.replace(/000000/, ''), 10);

    //     return PADDING + (id+1);
    // }

    // deprecated
    // async saveGroupId(dir, id) {
    //     const batchTxnData = [], PADDING = '000000', ogrId = parseInt(id.replace(/000000/, ''), 10);

    //     if(ogrId > 0) {
    //         batchTxnData.push({
    //             dataEntityName: 'groupId', 
    //             options: {filter: {id: PADDING + (ogrId - 1)}}, 
    //             action: 'DELETE', 
    //             value: {}
    //         })
    //     }

    //     batchTxnData.push({
    //         dataEntityName: 'groupId', options: {}, action: 'INSERT', value: {id: id} 
    //     })

    //     await bzdb.batchTxn(batchTxnData)
    // }

    /**
     * Returns the ID queried with name. If no data found, return ''
     * @param {*} type  //"keyboard","sessionSetting","script"
     * @param {*} name 
     */
    async getIdByName(type, name) {
        let id = '';
        let mappingFile='';
        if (type === 'sessionSetting') {
            mappingFile = 'sessionSettingMapping';
        } else if (type === 'keyboard') {
            mappingFile = 'keyboardMapping';
        } else if (type === 'script') {
            mappingFile = 'scriptShared';
        }
        let mappingData = await bzdb.select(mappingFile, {name});
        if (mappingData.rowCount > 0){
            id = mappingData.data[0].id
        }
        return id;
    }

    NextId(IdStr) {
        const IdPreferLength = 7;
        if (IdStr.length > 0) {
            IdStr = IdStr.substring(4);
            let idInt = parseFloat(IdStr);
            idInt++;
            IdStr = idInt.toString();
            let IdStrLength = IdStr.length;
            for (var i = 0; i < IdPreferLength - IdStrLength; i++) {
                IdStr = "0" + IdStr;
            }

        }
        return IdStr;
    }

    getURL(req, context) {
        const protocol = req.protocol;
        //const host = req.host? req.host : req.hostname;
        const serverRuntime = new ServerRuntimeService(context);
        const serverName = serverRuntime.getHostName();
        const host = serverName? serverName : (req.hostname || req.host);
        const port = req.headers.port? req.headers.port : context.plugin.server.config.user.node[protocol].port;
        const options = {
            url: protocol + '://' + host + ':' + port,
        }
        return `${protocol}://${host}:${port}`;
    }

    isValidUserLuKeyFormat(luStr) {
        const MAX_LU_COLUMNS = 32;
        if (-1 == luStr.search(/^LU[1-9]\d?$/i)) return false;
        let luNum = parseInt(luStr.slice(2), 10);
        return luNum && luNum > 0 && luNum <= MAX_LU_COLUMNS;
    }

    createDirs(dirpath) {
        if (!fs.existsSync(path.dirname(dirpath))) {
            this.createDirs(path.dirname(dirpath));
        }
        if (!fs.existsSync(dirpath)) {
             fs.mkdirSync(dirpath);
        }
    }

    rmdirSync(dirpath) {
        try {
            if(!fs.existsSync(dirpath))
                return;
            const files = fs.readdirSync(dirpath);
            for(const file of files) {
                const fullpath = path.join(dirpath, file);
                if(fs.statSync(fullpath).isFile())
                    fs.unlinkSync(fullpath);
                else {
                    this.rmdirSync(fullpath);
                }
            }
            fs.rmdirSync(dirpath);
        } catch (err) {
            throw err;
        }
    }

    copyFile(src, dst) {
        if (!fs.existsSync(src)) {
            return;
        }
        const dstDir = path.dirname(dst);
        if (!fs.existsSync(dstDir)) {
            try {
                //fs.mkdirSync(dstDir, {recursive: true});  // does not work on Zos
                this.createDirs(dstDir);
            } catch (e) {
                // do nothing
            }
        }
        if (fs.existsSync(dstDir)) {
            try {
                fs.copyFileSync(src, dst);
            } catch (e) {
                // do nothing
            }
        }
    }

    copyDirectory(src, dst, callback = null) {
        if (!fs.existsSync(src)) {
            return;
        }
        if (!fs.existsSync(dst)) {
            try {
                //fs.mkdirSync(dst, {recursive: true});  // does not work on Zos
                this.createDirs(dst);
            } catch (e) {
                // do nothing
            }
        }
        if (fs.existsSync(dst)) {
            let files = fs.readdirSync(src);
            if (callback) {
                files = files.filter(fn => callback(fn));
            }
            for (const file of files) {
                const stat = fs.statSync(path.join(src, file));
                if (!stat.isFile()) { // BZ-18482, fs.copyFileSync will copy FOLDER to FILE in Linux and z/OS.
                  continue;
                }
                try {
                    fs.copyFileSync(path.join(src, file), path.join(dst, file));
                } catch (e) {
                  // do nothing
                }
            } // end for
        }
    }
    readPropFile(path){
        let result = {};
        let lines = fs.readFileSync(path,"utf8").split('\n');
        for(let line of lines){
            if(line && line.indexOf("=") >= 0){
                result[line.substring(0,line.indexOf('='))] = line.substring(line.indexOf('=')+1,line.endsWith('\r')?line.length - 1:line.length);
            }
        }
        return result;
    }

    read_file(path,callback){
    
        var fRead = fs.createReadStream(path);
         
        var objReadline = readline.createInterface({
            input:fRead
        });
        
        var sectionName="";
        var sectionMap = new Map();
        var childMap = new Map();
        objReadline.on('line',function (line) {
            var reg1 = /^\[|$\]/g;//start with [ end with ]
            var matchSection = reg1.exec(line);
            if(matchSection!=null)
            {
              sectionName= matchSection.input.toString();
              sectionName=sectionName.substring(sectionName.indexOf("["),sectionName.indexOf("]"));
              sectionName=sectionName.replace("[","").replace("]","");
              childMap = new Map();
            }
            //var reg = /^("d\()|^("a\()/;//start with "d(
              var reg = /^(")/;//start with "
            var mateched =reg.exec(line);
            if(mateched!=null)
            {
              var funcName = mateched.input.toString();
              //var left = funcName.split("=")[0];
              //var right = funcName.split("=")[1];

              //Find the first '=' not in double quotes
              //"==="="dblrt"  should split at index 5, not 1
              let qCount = 0;
              let index = 0;
              for (let i=0;i<funcName.length;i++) {
                if (funcName[i] == '\"') {
                    qCount++;
                }
                else if (funcName[i] == '=') {
                    if (!(qCount % 2)) {
                        index = i;
                        break;
                    }
                }
              }
              var left = funcName.slice(0,index);
              var right = funcName.slice(index+1);
              left = left !=null ? left.replace(/\"|\\"/g,""):"";
              right = right !=null ? right.replace(/\"|\\"/g,""):"";
              childMap.set(left,right);
              sectionMap.set(sectionName,childMap);
            }
           
            
            
        });
        objReadline.on('close',function () {
          
            callback(sectionMap);
        });
      }
      readAllMap(filepath,keepfilext,callback)
      {
        var EventEmitter = new events.EventEmitter();
        fs.readdir(filepath,(err,files)=>{
          if(err)
          {
            throw err;
          }

          var i=0;
          var rootMap = new Map();
          if(files && files.length){
            files.forEach((file,index) =>{
                  var filedir = path.join(filepath,file);
                  if(fs.lstatSync(filedir).isDirectory()) 
                  {
                    i++; return;
                  }	
                  var filename = file.substring(0,file.toString().lastIndexOf("."));
                  if((filename.length==0) || (keepfilext)) //Extensions like click map (ck3, ck5, ckV) need to be saved to avoid conflicts when reading dir
                        filename = file.substring(0,file.toString().length);
                  this.read_file(filedir,function (data) {
                  rootMap.set(filename,data);
                  i++;
                   //map.set(section,data);
                   //if(index == files.length-1) //the order is not guarenteed, may miss files if the last file finishes early
                   if(i == files.length)
                  {
                    EventEmitter.emit('readData', rootMap);
                  }
                   
                 });
              
             
              
              
            });
           
          }else
          {
            callback(false);
          }
        });
        EventEmitter.on('readData', function(res){
          callback(res);
          
        });
      }  
     toJsonArray(section) 
    {
    
    var arr = new Array();
    section.forEach((value,key)=>{
        if(value!=null&&value.size>0)
        {
        var arr1 = new Array();
        
        arr1.push(this.toJsonArray(value));
        
        arr.push("\""+key +"\":{"+arr1.toString()+"}");
        
        }else{
        var item = "\""+key +"\":\""+value+"\"";
        arr.push(item);
        }
    
        
    });
    return arr;
    
    }
    //convert map to json string
    toJsonString(section) 
    {
    var data ="";
    var arr = this.toJsonArray(section);
    data = arr.toString();
    data = "{"+data+"}" ;
    return data;
    }

    ReadPreferenceFile(protocol, file) {
        const sessionSettingPath = FilerDirectory.Get_BZAadmin_Instance_SessionSetting_Path();
        const filename = "P_" + file + ".json";
        let indexFile = path.join(sessionSettingPath, "/preference/", filename );
        const mappingValue = fs.readFileSync(indexFile, "utf8");
        if (mappingValue) {
            let jsonData = JSON.parse(mappingValue);
            return jsonData;
        }
    };

    ReadHotSpotFile(protocol, file) {
        const sessionSettingPath = FilerDirectory.Get_BZAadmin_Instance_SessionSetting_Path();
        const filename = "H_" + file + ".json";
        let indexFile = path.join(sessionSettingPath, "/hotspots/", filename );
        const mappingValue = fs.readFileSync(indexFile, "utf8");
        if (mappingValue) {
            let jsonData = JSON.parse(mappingValue);
            return jsonData;
        }
    };

    ReadLaunchPadFile(protocol, file) {
        const sessionSettingPath = FilerDirectory.Get_BZAadmin_Instance_SessionSetting_Path();
        const filename = "L_" + file + ".json";
        let indexFile = path.join(sessionSettingPath, "/launchpad/", filename );
        const mappingValue = fs.readFileSync(indexFile, "utf8");
        if (mappingValue) {
            let jsonData = JSON.parse(mappingValue);
            return jsonData;
        }
    };
    
    isSameObj(a,b){
        if(a && b){
            return JSON.stringify(a)===JSON.stringify(b);
        }else{
            if(a === 'undefined' && b === 'undefined') return true
            if(a === null && b === null) return true
            return false;
        }
    }
};

const utiles = new Utiles();

module.exports = Utiles;

// module.exports = {
//     getData = utiles.getData

// }