'use strict';

/**
 * Name:      encryptionService.js
 * Author:    Qianchao Pan
 * Create DT: 2018-08-06
 * Copyright: © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */
const crypto = require('crypto');
const zoweService = require('./zowe.service');
const encryption = zoweService.encryption;
const rString = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
class EncryptionService {
    constructor() {}

    decryptAuthObj(obj, type){
        if (type === "ldap" || type === "mssql") {
            if (!obj["key"]) {
                return obj;
            }else{
                let passwordFile = type === "ldap" ? "ldapManagerPassword" : "password"
                return this.decryptObject(obj,passwordFile)  
            }
        } else {
            return obj;
        }
    }

    encryptAuthObj(obj, type){
        if (type === "ldap" || type === "mssql") {
            let passwordFile = type === "ldap" ? "ldapManagerPassword" : "password"
            return this.encryptObject(obj,passwordFile);
        } else {
            return obj;
        }
    }

    decryptObject(obj, passwordFile='password') {
        const password = obj[passwordFile];
        const key=obj["key"];
        if(password && key){
            const authentication = encryption.decryptWithKeyConstIV(password,key);
            obj[passwordFile] = authentication;
        }
        return obj;
    }

    encryptObject(obj, passwordFile = 'password') {
        let password = obj[passwordFile];
        let key = this.getRoundKey(32);
        if(password && key){
            const authentication = encryption.encryptWithKeyConstIV(password,key);
            obj[passwordFile] = authentication.authentication
            obj["key"] = authentication.key;
        }
        return obj;
    }

     getRoundKey(length) {
        length = length || 16;
        let keyBytes = new Array(length);
        for (let i = 0; i < length; i++) {
            var randChar = rString.charCodeAt(Math.round(Math.random() * 62));
            keyBytes[i] = randChar;
        }
        let key = String.fromCharCode.apply(null, keyBytes);
        return key;
    }

    getRandom(size = 32) {
        try {
            return crypto.randomBytes(size).toString('hex');
        } catch(err) {
            console.log(err);

            return '';
        }
    }

    encryptWithConstSalt(content) {
        try {
            return encryption.encryptWithKeyAndIV(content,encryption.rKey, encryption.rIV);
        } catch(err) {
            console.log(err);
            return '';
        }
    }

    decryptWithConstSalt(content) {
        try {
            return encryption.decryptWithKeyAndIV(content, encryption.rKey, encryption.rIV);
        } catch(err) {
            console.log(err);
            return '';
        }
    }
};

module.exports = new EncryptionService();
