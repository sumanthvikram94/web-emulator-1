'use strict';

/**
 * Name:      account-service.js
 * Desc:      Service for account/role related requests. This is a refactor of legacy code: accountManagement.js
 * Author:    Jerry (Jian Gao)
 * Create DT: 2018-08-06
 * Copyright: © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */

const fs = require('fs-extra');
const path = require('path');
const constants = require('./constants');
const zoweService = require('../../services/zowe.service');
const encryption = zoweService.encryption;

const rKey = Buffer.from([45, 116, 154, 81, 215, 123, 211, 238, 143, 184, 191, 134, 142, 53, 69, 143, 192, 179, 40, 219, 10, 83, 145, 72, 199, 67, 146, 248, 2, 245, 190, 113]);
const rIV = Buffer.from([0, 33, 80, 130, 76, 138, 194, 49, 111, 167, 21, 126, 242, 99, 37, 21]);

class AccountService {

  constructor() {

  }

  _addIVAndAuthToObject(input, password, callback) {
    var saltBytes = new Array(16);
    for (let i = 0; i < 16; i++) {
      var num = constants.rString.charCodeAt(Math.round(Math.random() * 62));
      var randChar = password.charCodeAt(Math.round(Math.random() * password.length));
      saltBytes[i] = (num > randChar) ? num : randChar;
    }
    var salt = String.fromCharCode.apply(null, saltBytes);

    var ivBytes = new Array(16);
    for (let i = 0; i < 16; i++) {
      ivBytes[i] = constants.rString.charCodeAt(Math.round(Math.random() * 62));
    }
    var iv = String.fromCharCode.apply(null, ivBytes);

    encryption.getKeyFromPassword(password, salt, 32, (key) => {
      try {
        input.authentication = encryption.encryptWithKeyAndIV(password, key, iv);
        input.iv = encryption.encryptWithKeyAndIV(iv, rKey, rIV);
        input.salt = encryption.encryptWithKeyAndIV(salt, rKey, rIV);
        callback(input);
      }
      catch (e) {
        callback(null);
      }
    });
  };

  _addKeyToObject(input, password, callback) {
    var keyBytes = new Array(16);
    for (let i = 0; i < 16; i++) {
      var num = constants.rString.charCodeAt(Math.round(Math.random() * 62));
      var randChar = password.charCodeAt(Math.round(Math.random() * password.length));
      keyBytes[i] = (num > randChar) ? num : randChar;
    }
    var keys = String.fromCharCode.apply(null, keyBytes);

    encryption.getKeyFromPassword(password, keys, 32, (key) => {
      try {
        input.authentication = encryption.encryptWithKey(password, key);
        input.key = encryption.encryptWithKey(key, rKey);
        callback(input);
      }
      catch (e) {
        callback(null);
      }
    });
  };

  _decryptWithKey(text,key) {
    return encryption.decryptWithKey(text,key)
  }

  _encryptWithAES256(fileContentsJSON, password) {
		return new Promise((resolve, reject) => {
			this._addIVAndAuthToObject(fileContentsJSON, password, (result) => {
				return resolve(result);
			})
		})
  }
  
  _encryptWithSHA1(passwordStr) {
    return encryption.encryptWithSHA1(passwordStr); 
  };

  _encryptWithSHA256(passwordStr) {
    return encryption.encryptWithSHA256(passwordStr); 
  };

  createUser(data, fileLocation, success, failure) {
    let _this = this;
    // let AccountHandler_ERROR_USER_EXISTS = this.AccountHandler_ERROR_USER_EXISTS;
    fs.access(fileLocation, fs.constants.F_OK, (err) => {
      if (err) {
        //file does not exist, continue creating
        var makeFile = function () {
          var fileContentsJSON = {
            timeStamp: data.timeStamp || '',
            username: data.userId
          };
          // for upgrade: bzw already has login.json file, but does not contain password
          if (data.fromImport || (data.authentication && data.iv && data.salt)) {
            let result = Object.assign(fileContentsJSON, {authentication: data.authentication, iv: data.iv, salt: data.salt});
            fs.writeFile(fileLocation, JSON.stringify(result), { mode: 0o770 }, (err) => {
              if (err) {
                failure(constants.AccountHandler_ERROR_FILE_IO);
              }
              else {
                success();
              }
            });
          } else {
            _this._addIVAndAuthToObject(fileContentsJSON, data.password, (result) => {
              if (!result) {
                failure(constants.AccountHandler_ERROR_CREATING_USER);
              }
              else {
                fs.writeFile(fileLocation, JSON.stringify(result), { mode: 0o770 }, (err) => {
                  if (err) {
                    failure(constants.AccountHandler_ERROR_FILE_IO);
                  }
                  else {
                    success();
                  }
                });
              }
            });
          }
        };

        var index = 0;
        var lastIndex = 0;
        var subLocation = null;
        var done = false;
        var makeFolder = function () {
          let index = fileLocation.indexOf('/', lastIndex + 1);
          if (index != -1) {
            subLocation = fileLocation.slice(0, index);
            fs.mkdir(subLocation, 0o770, (err) => {
              //ignore error, dont care if folder exists already
              lastIndex = index;
              makeFolder();
            });
          }
          else {
            makeFile();
          }
        };
        makeFolder();
      }
      else {
        failure(constants.AccountHandler_ERROR_USER_EXISTS);
      }
    });
  };

  editUser(data, fileLocation, success, failure) {
    let _this = this;
    if (fs.existsSync(fileLocation)) {
      var fileContentsJSON = {
        timeStamp: data.timeStamp || '',
        username: data.userId
      };
       // for upgrade: bzw already has login.json file, but does not contain password
       if (data.fromImport || (data.authentication && data.iv && data.salt)) {
        let result = Object.assign(fileContentsJSON, {authentication: data.authentication, iv: data.iv, salt: data.salt});
        fs.writeFile(fileLocation, JSON.stringify(result), { mode: 0o770 }, (err) => {
          if (err) {
            failure(constants.AccountHandler_ERROR_FILE_IO);
          }
          else {
            success();
          }
        });
      } else {
        _this._addIVAndAuthToObject(fileContentsJSON, data.password, (result) => {
          if (!result) {
            failure(constants.AccountHandler_ERROR_CREATING_USER);
          }
          else {
            fs.writeFile(fileLocation, JSON.stringify(result), { mode: 0o770 }, (err) => {
              if (err) {
                failure(constants.AccountHandler_ERROR_FILE_IO);
              }
              else {
                success();
              }
            });
          }
        });
      }
    }
  }

  getAuth(auth) {
    const EMPTYPASSWORD='';
    if (!auth || auth.indexOf('Basic') == -1) {
      return {
        userId: '',
        password: EMPTYPASSWORD
      };
    }
    let authStr = Buffer.from(auth.substring(6), 'base64').toString('ascii');
    let authArr = authStr.split(':');
    return {
      userId: authArr[0],
      password: authArr[1]
    };
  }

};

module.exports = new AccountService();
