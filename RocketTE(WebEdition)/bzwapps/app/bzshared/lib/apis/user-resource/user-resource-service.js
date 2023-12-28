'use strict';

/**
 * Name:      account-service.js
 * Desc:      Service for account/role related requests. This is a refactor of legacy code: accountManagement.js
 * Author:    Jerry (Jian Gao)
 * Create DT: 2018-08-06
 * Copyright: © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */

const constants = require('../account/constants');
const zoweService = require('../../services/zowe.service');
const encryption = zoweService.encryption;
const fs = require('fs-extra');
const path = require('path');
const jsonUtils = zoweService.jsonUtils;
const PATH_BZA_DATA_SOURCE_SETTING = '/ZLUX/pluginStorage/com.rs.bzw/configurations/dataSourceSetting.json';
const rKey = Buffer.from([45, 116, 154, 81, 215, 123, 211, 238, 143, 184, 191, 134, 142, 53, 69, 143, 192, 179, 40, 219, 10, 83, 145, 72, 199, 67, 146, 248, 2, 245, 190, 113]);
const bzdb = require('../../services/bzdb.service');
const shareConstants = require('../../services/constants.service');
const authConfigSv = require('../../services/authConfigService');

class UserService {
  constructor() {
    this.mapUserIdReg = /^(.*)@(([^<>()[\]\.,;:\s@\']+\.)+[^<>()[\]\.,;:\s@\']{2,})$/i; // reg mail
  }

  setLogger(logger){
    this.logger = logger
  }

  getEncryptKeyRound(data, rounds) {
    rounds = rounds || 3;
    const key = encryption.encryptWithKey(data.keys, rKey);
    let authentication = data.password;
  
    for(let i = 0; i < Math.max(rounds, 1); i++) {
      authentication = encryption.encryptWithKey(authentication, data.keys);
    }
    return {authentication, key};
  }

  decryptWithKeyRound(data, rounds) {
    rounds = rounds || 3;
  
    let key = encryption.decryptWithKey(data.key, rKey);
    let authentication = data.authentication;
  
    for(let i = 0; i < Math.max(rounds, 1); i++) {
      authentication = encryption.decryptWithKey(authentication, key);
    }
  
    return authentication;
  }

  _addKeyToObject(input, password, callback) {
    var keyBytes = new Array(16);
    for (let i = 0; i < 16; i++) {
      var num = constants.rString.charCodeAt(Math.round(Math.random() * 62));
      var randChar = password.charCodeAt(Math.round(Math.random() * password.length));
      keyBytes[i] = (num > randChar) ? num : randChar;
    }
    var keys = String.fromCharCode.apply(null, keyBytes);
    const data = {password, keys};
    const encrys = this.getEncryptKeyRound(data);

    input.authentication = encrys.authentication;
    input.key = encrys.key;
    callback(input);
  };


  _encryptObject(data, opt) {
      return new Promise((resolve, reject) => {
        if(data.hasPwd) {
          delete data.hasPwd;
        }
        if(data && data[opt]) {
          const password = Buffer.from(data[opt], 'base64').toString('ascii');
          this._addKeyToObject(data, password, (result) => {
            delete data[opt];
           // let password = encryption.decryptWithKeyRound(data);
            data = Object.assign(data, result);
            resolve(data);
          });
        } else {
          resolve(data);
        }
      });
  }

  _decryptObject(data) {
    return new Promise((resolve, reject) => {
      if(data && data.authentication && data.key) {
        const pwd = this.decryptWithKeyRound(data);
        resolve({
          data: Buffer.from(pwd).toString('base64'),
          status: true
        });
      } else {
        data.status = false;
        resolve(data);
      }
    });
  }


  getDefaultPort(context) {
    const filePath = path.join(zoweService.getPluginProductFilePath(context,'com.rs.bzw'),'defaults/defaultPort.json')
    if(fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }

    return {};
  }

  getDefaultExtension(context) {
    const filePath = path.join(zoweService.getPluginProductFilePath(context,'com.rs.bzw'),'defaults/defaultExtensions.json')
    if(fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    return {};
  }

  getFTPHeader(context) {
    const filePath = path.join(zoweService.getPluginProductFilePath(context,'com.rs.bzw'),'defaults/defaultFTPHeader.json')
    if(fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    return {};
  }

  async getGroup(userId, req, type) {
    const accessGroups = await bzdb.select('group');
    const reg = this.mapUserIdReg; // reg mail
    let attrs = {}, keys = [], groups = [];
    if(type === 'sso') {
      try {
        let attrStr = authConfigSv.getSsoAttrs(req.headers?.cookie);
        if(attrStr){
          attrStr = encryption.decryptWithKeyAndIV(attrStr, encryption.rKey, encryption.rIV);
          if(attrStr){
            const attrJson = JSON.parse(attrStr);
            if(attrJson && attrJson.userId === userId){
              attrs = attrJson.attr
            }else{
              authConfigSv.clearSsoAttrs(res);
            }
          }else{
            authConfigSv.clearSsoAttrs(res);
          }
          // RTE could get user attributes each time, so the following code is not required
          // if(!attrs) {
          //   attrs = JSON.parse(req.body.attributes);
          //   await authConfigSv.setSsoAttrs(userId, attrs);
          // }
          
          keys = Object.keys(attrs);
        }
        
      }catch(e) {
        this.logger.warn("error occured when get sso user's attributes, error message is " + e.message);
       // console.log(err);
      }
  
      (accessGroups.data || []).forEach(group => {
        let inGroup = (reg.test(userId) && group.groupName.toLowerCase() === userId.split('@')[1].toLowerCase()) 
        
        if(!inGroup) {
          for(let key of keys) {
            const mailAttr = key.toLowerCase() === 'mail' || key.toLowerCase() === 'email';
            if(Array.isArray(attrs[key]) && mailAttr) {
              for(let d of attrs[key]) {
                if((reg.test(d) && group.groupName.toLowerCase() === d.split('@')[1].toLowerCase())) {
                  inGroup = true;
                  break;
                }
              }
            } else if(inGroup) {
              break;
            } else {
              inGroup = mailAttr && (reg.test(attrs[key]) && group.groupName.toLowerCase() === attrs[key].split('@')[1].toLowerCase()) 
            };
          }
        }
          
        if (inGroup) {
          groups.push(group.id);
        }
        
      });
    } else if(type === 'ldap') {
      const userAttribute = this.getLdapAttr(req);

      (accessGroups.data || []).forEach(async group => {
        let inGroup = (reg.test(userId) && group.groupName.toLowerCase() === userId.split('@')[1].toLowerCase());

        if (!inGroup) {
          for(let d of userAttribute) {
            if(reg.test(d) && group.groupName.toLowerCase() === d.split('@')[1].toLowerCase()) {
              inGroup = true;
              break;
            }
          }
        }      
       
        if (inGroup) {
          groups.push(group.id);
        }
      });
    }

    

    return {
      userInfo: {userId: userId},
      groups: groups
    };
  }

  getLdapAttr(req) {
    let attrStr = authConfigSv.getLdapConfig(req.headers?.cookie);
    const userAttribute = [];
    if(attrStr){
      try{
        attrStr = encryption.decryptWithKeyAndIV(attrStr, encryption.rKey, encryption.rIV);
        const attrs = attrStr.length > 0 ? JSON.parse(attrStr) : [];
        for(let key in attrs) {
          if(attrs[key].type === 'mail') {
            userAttribute.push(...attrs[key].vals);
          }
        }
      }catch(e){
        this.logger.warn("error occured when get ldap user's attributes, error message is " + e.message);
      }
      
    }
    return userAttribute;
  }


  async getDataSource() {
    // const basePath = this.context.plugin.server.config.user.instanceDir;
    // const fileName = path.resolve(basePath + PATH_BZA_DATA_SOURCE_SETTING);
    // let jsonData = {};
    // if (fs.existsSync(fileName)) {
    //   jsonData = jsonUtils.parseJSONWithComments(fileName);
    // }
    // return jsonData;
    let jsonData = {};
    const result=await bzdb.select("configurations",shareConstants.metaDataBackupPath.datasource);
    if(result && result.data && result.data.length>0){
      jsonData= result.data[0]; 
    }
    return jsonData;
  }

  async _decryptFTP(result) {
    if(result.rowCount > 0) {
      result.data.forEach(async (d) => {
          if(d.ftp && d.ftp.authentication && d.ftp.key) {
              const pwd = await this._decryptObject(d.ftp);
              d.ftp.password = pwd.data;
              delete d.ftp.authentication;
              delete d.ftp.key;
          }

      })
  }
  }

  async _decryptPasswordFiled(obj,passwordFile) {
    if(obj && obj.authentication && obj.key) {
        const pwd = await this._decryptObject(obj);
        obj[passwordFile] = pwd.data;
        delete obj.authentication;
        delete obj.key;
    }
  }

};

module.exports = new UserService();
