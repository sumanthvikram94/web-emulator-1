const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const ini = require('ini');
const w2hPriv = require('../model/w2h-privilege.model');
const w2h_const = require('../../../bzshared/lib/model/w2h-const'); // BZ-20034, update version to 10.2.0

const BZ_PROFILE_EXT = ['zmd','zad','zvt','zap','zmp','z65','zft','ztp','zld','ztd','zud'];
const  BZA_SUPPORT_PROFILE_EXT = ['zmd','zad','zvt','zap','zmp','z65','zft'];
const  SD_PAGE_SESSION_PRE = ['MD', 'AD', 'VT', 'AP', 'MP', 'BZ6530', 'FTP', 'LPD', 'ALC', 'T27','UTS'];


class Bzw2hUtils {

  static getSessionType(type) {
    if (type.search(/3270/) > -1) {
      return '3270';
    }  else if (type.search(/5250/) > -1) {
      return '5250';
    } else if (type.search(/FTP/) > -1){
      return 'FTP';
    } else if (type.search(/VT|vt/) > -1){
      return 'VT';
    } else if (type.search(/3287/) > -1) {
      return '3270p';
    } else if (type.search(/3812|5553/) > -1) {
      return '5250p';
    } else if (type.search(/TANDEM/) > -1){
      return '6530';
    } else {
      return 'unknown';
    }
  }

  // return YYYYMMDD string
  static getDateString4Now(originalname) {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const date = now.getDate().toString().padStart(2, '0');
    return `${year}${month}${date}`;
  }

  static getRandomString(count = 16) {
    const chars = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"];
    const temp = [...Array(count)].map(i=>chars[Math.floor(Math.random()*chars.length)]).join('');
    return temp;
  }

  /**
     * Name:  readData4BzdbRawFile
     * Desc:  read file content from a file for BZDB.PersistType.PERSIST_TYPE_RAW 
     * Rtn:   object, { status: false, data: '', err: '' }
     * Args:  file path
     */
  static readData4BzdbRawFile(filePath) {
    const res = { status: false, data: '', err: '' };
    if (fs.existsSync(filePath)) {
      try {
        let content = fs.readFileSync(filePath);
        res.status = true;
        res.data = JSON.stringify(content);  // "{\"type\":\"Buffer\",\"data\":[103,101,121]}"
      } catch (error) {
        res.err = 'Failed to read file'
      }
    } else {
      res.err = 'File does not exist'
    }
    return res;
  }

  /**
     * Name:  unlinkSync
     * Desc:  wrapper for fs.unlinkSync
     * Rtn:   object, { status: false, err: '' }
     * Args:  file path
     */
  static unlinkSync(filePath) {
    const res = { status: false, err: '' };
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.unlinkSync(filePath);
        res.status = true;
      } catch (error) {
        res.err = 'Failed to delete file'
      }
    } else {
      res.err = 'File does not exist'
    }
    return res;
  }

  static getAllProfileExt() {
    return BZ_PROFILE_EXT;
  }

  static getSDPageSessionPRE() {
    return SD_PAGE_SESSION_PRE;
  }

  static isBzaSupportedProfile(filename) {
    const arr = filename.split('.');
    if (1 === arr.length) {
      return false;
    } else {
      const ext = arr.pop();
      return BZA_SUPPORT_PROFILE_EXT.includes(ext.toLowerCase());
    }
  }

  static isBzProfile(filename) {
    const arr = filename.split('.');
    if (1 === arr.length) {
      return false;
    } else {
      const ext = arr.pop();
      return BZ_PROFILE_EXT.includes(ext.toLowerCase());
    }
  }

  static generateSessionNameFromProfileName(profileName) {   
    // remove the extension
    let name = profileName.replace(/\.[^/\\.]+$/, "");
    name = name.length <= w2h_const.MAX_SESSION_NAME_LENGTH ? name : name.slice(0, w2h_const.MAX_SESSION_NAME_LENGTH);
    // name = name.replace(/\/|\\|\*|\&|\%|\#|\?|\~|\+|\`|\"/g, '-'); // /\*&%#?~+`"
    name = name.replace(/[\/\\*&:%#?~+`"|<>]{1}/g, '-');  // /\*&:%#?~+`"|<>
    return name;
  }

  static generateKeyboardMappingNameFromProfileName(profileName) {   
    // remove the extension
    let name = profileName.replace(/\.[^/\\.]+$/, "");
    name = name.length <= w2h_const.MAX_KEYMAPPING_NAME_LENGTH ? name : name.slice(0, w2h_const.MAX_KEYMAPPING_NAME_LENGTH);
    // name = name.replace(/\/|\\|\*|\&|\%|\#|\?|\~|\+|\`|\"/g, '-'); // /\*&%#?~+`"
    name = name.replace(/[\/\\*&:%#?~+`"|<>]{1}/g, '-');  // /\*&:%#?~+`"|<>
    return name;
  }  
  
  static getBaseUrlFromContext(context) {    
    try {
      const isUseHost = context.plugin.server.config.user.bzw2hUseHostForApiCall; // BZ-15084
      const host = isUseHost ? os.hostname() : '127.0.0.1'; // BZ-15084
      const node = context.plugin.server.config.user.node;
      const protocol = node.https ? 'https' : 'http';
      const port =  node.https ? node.https.port : node.http.port;
      return `${protocol}://${host}:${port}/ZLUX/plugins/`;
    } catch (e) {
      return '';
    }
  }
  
  static setHttpsOption(requestOptions) {
    if (0 === requestOptions.url.toLowerCase().indexOf("https")) {
        Object.assign(requestOptions, {"agentOptions": {"rejectUnauthorized": false}});  //todo, use this to https error CERT_HAS_EXPIRED   
    }
    return requestOptions;
  }

  static getDefaultIniConvertSetting(file) {
    const rtn = {
      error: '',
      bUsePersonal: true,
      bAutoUpdate: ''
    }
    if (!fs.existsSync(file)) {
      rtn.error = `file '${file}' does not exist.`;
      return rtn;
    }
    let data = null;
    try {
      data = ini.parse(fs.readFileSync(file, 'utf-8'));
      let b = data['BlueZone']['UsePersonalFolderAsWorkingDir'];
      if( b !== undefined && b !== null) {
        rtn.bUsePersonal = b.toUpperCase().substring(0,1) === 'N'? false:true;
      }
      if( data['Session Manager']!==undefined && data['Session Manager']!== null){
        b = data['Session Manager']['AutoUpdate'];
        if( b !== undefined && b !== null) {
          rtn.bAutoUpdate = b.toUpperCase().substring(0,1) === 'N'? false:true;
        }
      }
    } catch (e) {
      rtn.error = `failed to parse '${file}', ${e}.`;
      return rtn;
    }
    return rtn;
  }
  /**
   * Name:  updatePrivFromDefaultIniStream
   * Desc:  parse the content of default.ini file and generate the privilege object for group
   * Rtn:   object for privilege
   * Args:
   *        [file] string, the file path of default.ini in server side
   *        [orgPriv] object, original privilege object
   */

  static updatePrivFromDefaultIniStream(content, orgPriv = w2hPriv.defaultPriv) {
    let nLock = 0;
    let nLockFTP = 0;
    const priv = JSON.parse(JSON.stringify(orgPriv));
    const rtn = {
      error: '',
      data: priv,
      content:''
    }

    let data = null;
    try {
      data = ini.parse(content);
      nLock = Number(data['Configuration Lock Feature']['Lock']);
      nLockFTP = Number(data['Configuration Lock Feature']['LockFTP']);
    } catch (e) {
      rtn.error = `failed to parse '${content}', ${e}.`;
      return rtn;
    }
    // createSession always true
    priv.createSession = true;

    // parse Lock
    if (-1 === nLock) {
      priv.sessionSettings = false;
      priv.enableDisplayLaunchPadMenu = false;
    } else {
      priv.sessionSettings = true;
      const mapLock = w2hPriv.mapPriv2Lock.lock;
      for (const key in mapLock) {
        priv[key] = (mapLock[key] & nLock) ? false : true;
        // console.log(`${key}: ${priv[key]}`);
      }
    }
    // parse LockFTP
    if (0 === nLockFTP) {
      priv.lockFTPCommands = false;
    } else {
      priv.lockFTPCommands = true;
      const mapLockFTP = w2hPriv.mapPriv2Lock.lockFTP;
      for (const key in mapLockFTP) {
        priv[key] = (mapLockFTP[key] & nLockFTP) ? true : false;
        // console.log(`${key}: ${priv[key]}`);
      }
    }
    try{
      data['Configuration Lock Feature']['Lock'] = '0';
      let tempLockFtpMannual = 0  ;
      for (const key in w2hPriv.mapPriv2Lock.lockFTP) {
        tempLockFtpMannual = tempLockFtpMannual | w2hPriv.mapPriv2Lock.lockFTP[key];
      }
      tempLockFtpMannual = tempLockFtpMannual ^  (w2hPriv.mapPriv2Lock.lockFTPMax * 2 - 1);
      data['Configuration Lock Feature']['LockFTP'] = tempLockFtpMannual & nLockFTP;
      rtn.content =ini.stringify(data);
    } catch (e) {
      rtn.error = `failed to update '${file}', ${e}.`;
      return rtn;
    }

    return rtn;
  }
}

 // end class

module.exports = Bzw2hUtils;
