

/*
  This program and the accompanying materials are
  made available under the terms of the Eclipse Public License v2.0 which accompanies
  this distribution, and is available at https://www.eclipse.org/legal/epl-v20.html
  
  SPDX-License-Identifier: EPL-2.0
  
  Copyright Contributors to the Zowe Project.
*/

const crypto = require("crypto");
const rKey = Buffer.from([45, 116, 154, 81, 215, 123, 211, 238, 143, 184, 191, 134, 142, 53, 69, 143, 192, 179, 40, 219, 10, 83, 145, 72, 199, 67, 146, 248, 2, 245, 190, 113]);
const rIV= Buffer.from([45, 116, 154, 81, 215, 123, 211, 238, 143, 184, 191, 134, 142, 53, 69, 143]);


function encryptWithKey(text,key) {
  // waning that createCipher is not security enough from node 12 , Use Cipheriv for counter mode of aes-256-ctr
  var cipher = crypto.createCipher('AES-256-CTR',key);  
  var encrypted = cipher.update(text,'utf8','hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function getKeyFromPasswordSync(password,salt,length) {
  var rounds = 500;
  return crypto.pbkdf2Sync(password,salt,rounds,length,'sha256');
}

function getKeyFromPassword(password,salt,length,callback) {
  var rounds = 500;
  crypto.pbkdf2(password,salt,rounds,length,'sha256',(error, derivedKey) => {
    if (error) {
      throw error;
    }
    else {
      callback(derivedKey);
    }
  });
}

function getEncryptKeyRound(data, rounds) {
  rounds = rounds || 3;
  const key = encryptWithKey(data.keys, rKey);
  let authentication = data.password;

  for(let i = 0; i < Math.max(rounds, 1); i++) {
    authentication = encryptWithKey(authentication, data.keys);
  }
  return {authentication, key};
}



function encryptWithKeyAndIV(text,key,iv) {
  var cipher = crypto.createCipheriv('AES-256-CBC',key,iv);
  var encrypted = cipher.update(text,'utf8','hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function decryptWithKey(text,key) {
  // waning that createCipher is not security enough from node 12 , Use Cipheriv for counter mode of aes-256-ctr
  var decipher = crypto.createDecipher('AES-256-CTR',key);
  var decrypted = decipher.update(text,'hex','utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function decryptWithKeyRound(data, rounds) {
  rounds = rounds || 3;

  let key = decryptWithKey(data.key, rKey);
  let authentication = data.authentication;

  for(let i = 0; i < Math.max(rounds, 1); i++) {
    authentication = decryptWithKey(authentication, key);
  }

  return authentication;
}

function decryptWithKeyAndIV(text,key,iv) {
  var cipher = crypto.createDecipheriv('AES-256-CBC',key,iv);
  var decrypted = cipher.update(text,'hex','utf8');
  decrypted += cipher.final('utf8');
  return decrypted;
}


function encryptWithSHA1(text) {
  var cipher = crypto.createHash('sha1');
  var encrypted = cipher.update(text,'utf8');
  encrypted =cipher.digest('base64');
  return encrypted;
}
function encryptWithSHA256(text) {
  var cipher = crypto.createHash('sha256');
  var encrypted = cipher.update(text,'utf8');
  encrypted =cipher.digest('base64');
  return encrypted;
}

function encryptWithKeyConstIV(password,akey) {
  authentication = encryptWithKeyAndIV(password, akey, rIV);
  let key = encryptWithKeyAndIV(akey, rKey, rIV);
  return {
      authentication,
      key
  };
}

function decryptWithKeyConstIV(password,akey) {
  try {
      const key = decryptWithKeyAndIV(akey, rKey, rIV);
      authentication = decryptWithKeyAndIV(password, key, rIV);
  } catch (e) {
      authentication = password;
  } finally {
      return authentication;
  }
}
exports.encryptWithKeyAndIV = encryptWithKeyAndIV;
exports.decryptWithKeyAndIV = decryptWithKeyAndIV;
exports.getKeyFromPassword = getKeyFromPassword;
exports.getKeyFromPasswordSync = getKeyFromPasswordSync;
exports.encryptWithKey = encryptWithKey;
exports.decryptWithKey = decryptWithKey;
exports.encryptWithSHA1 = encryptWithSHA1;
exports.encryptWithSHA256 = encryptWithSHA256;
exports.decryptWithKeyRound = decryptWithKeyRound;
exports.getEncryptKeyRound = getEncryptKeyRound;
exports.encryptWithKeyConstIV = encryptWithKeyConstIV;
exports.decryptWithKeyConstIV = decryptWithKeyConstIV;
exports.rKey = rKey;
exports.rIV = rIV;

/*
  This program and the accompanying materials are
  made available under the terms of the Eclipse Public License v2.0 which accompanies
  this distribution, and is available at https://www.eclipse.org/legal/epl-v20.html
  
  SPDX-License-Identifier: EPL-2.0
  
  Copyright Contributors to the Zowe Project.
*/

