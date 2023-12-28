
const fs = require('fs-extra');
const path = require('path');
//const lznt1 = require('lznt1');     //addon for LZNT1 compression algorithm
const rteDesktop = require('../addon/rte-desktop');

class Utiles {

	constructor(logger) {
        if (logger) {
            this.logger = logger; // Here accepts a logger for specific controller usage
        } else {
            this.logger = global.COM_RS_RTE?.defaultLogger // Here use the default logger for 'com.rs.rte' when no logger specified.
        }
	}

    async getData(dir, subName) {
        let files = this.getFiles(dir) || [];
        let dataArray=[];
        files=files.filter(file => (subName.length && file.indexOf(`${subName}`) > -1));
        if(files.length>0){
            const filesCount = files.length;
            this.logger?.info(`Loading data of ${subName}, data count: ${filesCount}`);
            for(let i=0;i<files.length;i++){
                try{
                    let dataText = await this.readFilePromise(path.resolve(`${dir}/${files[i]}`), 'utf8');
                    this.logger?.debug('getData();file path is '+path.resolve(`${dir}/${files[i]}`)+'; dataText is '+dataText);
                    let dataObj = JSON.parse(dataText);
                    dataArray.push(dataObj);
                    if (i % 500 === 0){
                        this.logger?.info('Loading data of '+subName+', loaded ' + i);
                    }
                    if (i === filesCount - 1){
                        this.logger?.info('Loading data of '+subName+', loaded ' + i);
                        this.logger?.info('Data load for '+subName+' is DONE');
                    }
                }catch(err){
                    this.logger?.severe('Error: getData(); file path is '+path.resolve(`${dir}/${files[i]}`)+'; error is '+err.stack);
                }
            }
        }
        return Promise.resolve(dataArray);
    }

    readFilePromise(path, opts = 'utf8') {
        return new Promise((resolve, reject) => {
            fs.readFile(path, opts, (err, data) => {
                if (err) reject(err)
                else resolve(data)
            })
        });
    }

    async getDataObj(dir, subName) {
        const files = this.getFiles(dir) || [];

        return await Promise.all(files
            .filter(file => (  subName.length > 0 ? file.indexOf(`${subName}`) > -1 : true))
            .map(async (file) => {
                let dataText = await this.readFilePromise(path.resolve(`${dir}/${file}`), 'utf8');
                let dataObj = JSON.parse(dataText);
                let result = {
                    path: dir,
                    file: file,
                    data: dataObj
                }
                return result;
            }));
    }
    
    getDataObjSimple(dir, fileName) {
        return new Promise((resolve, reject) => {
            const dataText = fs.readFileSync(path.join(dir, fileName), 'utf8');
            resolve([{
                path: dir,
                file: fileName,
                data: JSON.parse(dataText)
            }]);
        });
    }

    getFiles(dir) {
        const dir1 = path.resolve(dir);

        if (fs.existsSync(dir1)) {
            return fs.readdirSync(dir1);
        }

        return [];
    }

    
    getURL(req, context) {
        const protocol = req.protocol;
        //const host = req.host? req.host : req.hostname;
        const host = req.hostname || req.host;
        const port = req.headers.port? req.headers.port : context.plugin.server.config.user.node[protocol].port;
        const options = {
            url: protocol + '://' + host + ':' + port,
        }
        return `${protocol}://${host}:${port}`;
    }

    
    //return string, not json object
    getFileContent(filePath) {
        return new Promise((resolve, reject) => {
            if (fs.existsSync(filePath)) {
                fs.readFile(filePath, 'utf8', (err, data) => {
                    if (err) {
                        reject(`I/O error when read file ${filePath}`);
                    } else {
                        resolve(data);
                    }
                });
            } else {
                reject(`not find file ${filePath}`);
            }
        });
    }

    //return binary buffer, no encoding
    getBinaryFileContent(filePath) {
        return new Promise((resolve, reject) => {
            if (fs.existsSync(filePath)) {
                fs.readFile(filePath, null, (err, data) => {
                    if (err) {
                        reject(`I/O error when read file ${filePath}`);
                    } else {
                        resolve(data);
                    }
                });
            } else {
                reject(`not find file ${filePath}`);
            }
        });
    }

    deleteFile(filePath) {
        return new Promise((resolve, reject) => {
            if (fs.existsSync(filePath)) {
                fs.unlink(filePath, (err) => {
                    if (err) {
                        reject(`I/O error when remove file ${filePath}`);
                    } else {
                        resolve(true);
                    }
                });
            } else {
                reject(`not find file ${filePath}`);
            }
        });
    }
    // if has fileName, only get the attribute of this file,
    // if no file name, will get all the files attribute.
    async getFileList(dirpath, fileName) {
        return new Promise((resolve, reject) => {
            const response = [];
            if (fs.existsSync(dirpath)) {
                let files = [];
                if (fileName) {
                    files.push(fileName);
                } else {
                    files = fs.readdirSync(dirpath, 'utf8');
                }
                for (let file of files) {
                    const fileObj = fs.statSync(`${dirpath}/${file}`);
                    response.push({
                        name: file,
                        fileSizeInBytes: fileObj.size,
                        createTime: new Date(fileObj.ctime).getTime(),
                        modifiedTime: new Date(fileObj.mtime).getTime(),
                        lastAccessTime: new Date(fileObj.atime).getTime()
                    });
                }
                resolve(response);
            } else {
                resolve(response);
            }
        });
    }

    saveFile(dirPath, name, data) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath)
        }
        const fileName = path.join(dirPath, name)
        return new Promise((resolve, reject) => {
            fs.writeFile(fileName, JSON.stringify(data, null, 2), {
                mode: 0o770
            }, (err) => {
                if (err) {
                    reject(`I/O error when write file ${fileName}`);
                } else {
                    resolve(true);
                }
            });
        })
    }
    /**
     * 
     * @param {String} str: the text need to be signature 
     * the signature contains by 3 parts, 12 random characters + text mole +date
     * the mole data is caluate by the text length and each char.
     * Browser side will caluate text mole again and only check if these 2 mole data(server and client) is equaled.
     * @returns Hex String
     */
    simpleSignature(str) {
        let mole = 0;
        const len = str.length
        mole = (mole + len) % 255
        for (let i = 0; i < len; i++) {
          let code = str.charCodeAt(i);
          mole = (mole + code) % 255
        }
        const strMole=mole.toString(16).toLowerCase().padStart(2, 0);
        let ramdomStr=''
        for(let i=0;i<12;i++){
          const number=Math.floor(Math.random() * 256)
          ramdomStr+=number.toString(16).toLowerCase().padStart(2, 0)
        }
        const now = new Date().toLocaleString('en-us', { timeZone: 'UTC' });
        let nowStr=''
        for(let i=0;i<now.length;i++){
          const char=now.charCodeAt(i).toString(16).toLowerCase().padStart(2, 0)
          nowStr+=char
        }
        return ramdomStr+strMole+nowStr
      }

    /*lznt1_compress(inbuf) {
        let outbuf;
        try {
            outbuf = lznt1.compress(inbuf);
        } catch(e) {
            this.logger.severe(`${e}`);
        }
        return outbuf;
    }

    lznt1_uncompress(inbuf) {
        let outbuf;
        try {
            outbuf = lznt1.uncompress(inbuf);
        } catch(e) {
            this.logger.severe(`${e}`);
        }
        return outbuf;
    }*/

    /**
     * Converts b64 string to JSON object
     * @param {*} str b64 string for a JSON object
     * @returns JSON object
     * @throws Exception when JSON parsing fails
     */
    b64ToJSON(str) {
        const buff = Buffer.from(str, 'base64');
        const text = buff.toString('ascii');
        return JSON.parse(text);
    }

    /**
     * Converts JSON object to base64 string
     * @param {*} obj JSON object
     * @returns b64 string
     * @throws Exception when obj is undefined
     */
    JSONToB64(obj) {
        const buff = Buffer.from(JSON.stringify(obj));
        return buff.toString('base64');
    }
};

const util = new Utiles();

// module.exports = Utiles;

module.exports = {
    init(logger){
        return new Utiles(logger);
    },
    util
}

module.exports.rteDesktop = rteDesktop;
