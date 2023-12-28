

/*
  This program and the accompanying materials are
  made available under the terms of the Eclipse Public License v2.0 which accompanies
  this distribution, and is available at https://www.eclipse.org/legal/epl-v20.html
  
  SPDX-License-Identifier: EPL-2.0
  
  Copyright Contributors to the Zowe Project.
*/


const express = require('express');
const expressWs = require('express-ws')(express); // avoid the risk of router.ws is not defined issue.
const Promise = require('bluebird');
var net = require('net');
const tls = require('tls');
const crypto = require('crypto');
const fs = require('fs-extra');
const isOnZowe = !(process.env.APP_MODE && process.env.APP_MODE === 'STANDALONE');
// if (process.env.APP_MODE && process.env.APP_MODE === 'STANDALONE'){
//   isOnZowe = false;
// }
const connPool= require(isOnZowe ? '../../bzshared/lib/dist/connection-pool' : '../../../../../../app/bzshared/lib/dist/connection-pool');
const bzdb = require(isOnZowe ? '../../bzshared/lib/services/bzdb.service': '../../../../../../app/bzshared/lib/services/bzdb.service');
const ssh = require('./ssh');
const enabledSSHPool = !isOnZowe;


let sshPool ;
if(enabledSSHPool){
  sshPool = require('../workers/worker-pool-ssh').sshPool;
  sshPool.startOne();
}
// Starts 1 thread only on server start. 
// In case more SSH connections requested, the pool will start more workers.

// This is always true for now. Use this to control whether to use SSH pool if required.

const SSH_MESSAGE = ssh.MESSAGE;

const base64BitValues = [ 
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3e, 0x00, 0x00, 0x00, 0x3f, 
  0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x3b, 0x3c, 0x3d, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
  0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 
  0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x00, 0x00, 0x00, 0x00, 0x00, 
  0x00, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 
  0x29, 0x2a, 0x2b, 0x2c, 0x2d, 0x2e, 0x2f, 0x30, 0x31, 0x32, 0x33, 0x00, 0x00, 0x00, 0x00, 0x00, 
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
];

const WS_READY_STATE_CONNECTING = 0;
const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSING = 2;
const WS_READY_STATE_CLOSED = 3;

const WS_CLOSE_MESSAGE_LENGTH_LIMIT = 123;

const SECURITY_BAD_CERTIFICATE_PROMPT = 1;
const SECURITY_BAD_CERTIFICATE_ALLOW = 0;

const CONN_TIMEOUT = 60000;


var hex = function(x){
  if (x || x === 0){
    return (x).toString(16);
  } else {
    return "<can't hex() unbound number>";
  }
}

var hexDump = function(a, offset, length){
  var start = (offset ? offset : 0);
  var len = (length ? length : a.length);
  var i; 
  var buff = "";
  for (i=0; i<len; i++){
    buff += hex(a[start+i])+" ";
    if ((i%16)==15) {
      // console.log(buff);
      buff += '\n';
    }
  }
  return buff;
}


var utf8ArrayToB64 = function(data) {
  var out = [];
  var start = 0;
  var length = data.length;
  
  var dataLen = data.length;
  var numFullGroups = Math.floor(dataLen / 3);
  var numBytesInPartialGroup = dataLen - 3 * numFullGroups;
  var inCursor = 0;

  // Translate all full groups from byte array elements to Base64
  for (var i = 0; i < numFullGroups; i++) {
    var byte0 = data[inCursor++] & 0xff;
    var byte1 = data[inCursor++] & 0xff;
    var byte2 = data[inCursor++] & 0xff;
    out.push(binToB64[byte0 >> 2]);
    out.push(binToB64[(byte0 << 4) & 0x3f | (byte1 >> 4)]);
    out.push(binToB64[(byte1 << 2) & 0x3f | (byte2 >> 6)]);
    out.push(binToB64[byte2 & 0x3f]);
  }

  // Translate partial group if present
  if (numBytesInPartialGroup != 0) {
    var byte0 = data[inCursor++] & 0xff;
    out.push(binToB64[byte0 >> 2]);
    if (numBytesInPartialGroup == 1) {
      out.push(binToB64[(byte0 << 4) & 0x3f]);
      out.push(0x3d);
      out.push(0x3d);
    }
    else {
      var byte1 = data[inCursor++] & 0xff;
      out.push(binToB64[(byte0 << 4) & 0x3f | (byte1 >> 4)]);
      out.push(binToB64[(byte1 << 2) & 0x3f]);
      out.push(0x3d);
    }
  }
      
  
  return String.fromCharCode.apply(null, out);
}

var base64ToUint8Array = function(s){
  var sLen = s.length;
  var numGroups = sLen / 4;
  var missingBytesInLastGroup = 0;
  var numFullGroups = numGroups;
  var inCursor = 0, outCursor = 0;
  var i;

  if (4 * numGroups != sLen){
    return null;
  }

  if (sLen != 0){
    if (s[sLen - 1] == '='){
      missingBytesInLastGroup++;
      numFullGroups--;
    }
    if (s[sLen - 2] == '='){
      missingBytesInLastGroup++;
    }
  }
  var resultLength = numFullGroups*3;
  if (missingBytesInLastGroup != 0){
    resultLength++;
  } 
  if (missingBytesInLastGroup == 1){
    resultLength++;
  }
  var result = new Uint8Array(resultLength);
  
  /* Translate all full groups from base64 to byte array elements */
  for (i = 0; i < numFullGroups; i++){
    var ch0 =base64BitValues[s.charCodeAt(inCursor++)];
    var ch1 =base64BitValues[s.charCodeAt(inCursor++)];
    var ch2 =base64BitValues[s.charCodeAt(inCursor++)];
    var ch3 =base64BitValues[s.charCodeAt(inCursor++)];
    var x = ((ch0 << 2) | (ch1 >> 4));
    result[outCursor++] =  ((ch0 << 2) | (ch1 >> 4));
    result[outCursor++] =  ((ch1 << 4) | (ch2 >> 2));
    result[outCursor++] =  ((ch2 << 6) | ch3);
  }
  
  /* Translate partial group, if present */
  if (missingBytesInLastGroup != 0){
    var ch0 =base64BitValues[s.charCodeAt(inCursor++)];
    var ch1 =base64BitValues[s.charCodeAt(inCursor++)];
    result[outCursor++] = ((ch0 << 2) | (ch1 >> 4));
    
    if (missingBytesInLastGroup == 1){
      var ch2 =base64BitValues[s.charCodeAt(inCursor++)];
      result[outCursor++] = ((ch1 << 4) | (ch2 >> 2));
    }
  }

  return result; 
}

const binToB64 =[0x41,0x42,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x4A,0x4B,0x4C,0x4D,0x4E,0x4F,0x50,
                 0x51,0x52,0x53,0x54,0x55,0x56,0x57,0x58,0x59,0x5A,0x61,0x62,0x63,0x64,0x65,0x66,
                 0x67,0x68,0x69,0x6A,0x6B,0x6C,0x6D,0x6E,0x6F,0x70,0x71,0x72,0x73,0x74,0x75,0x76,
                 0x77,0x78,0x79,0x7A,0x30,0x31,0x32,0x33,0x34,0x35,0x36,0x37,0x38,0x39,0x2B,0x2F];

function TerminalWebsocketProxy(messageConfig, clientIP, context, websocket, handlers) {
  this.uuid = bzdb.getUIDSync(36, 1); // To track the activities of the same session, assign a uuid for it. Consider use this id into the handleConnect function of user report.
  this.handlers = handlers;
  this.host;
  this.hostPort;
  this.hostSocket;
  this.usingSSH = false;
  this.sshSessionData;
  this.hostConnected = false;
  this.isConnecting = false;
  this.connTimer = undefined;
  this.clientIP = clientIP;
  this.connPool = connPool;
  this.connIds = null;

  this.logger = context.logger;
  this.log_header = '[ID='+this.uuid+', ClientIP='+this.clientIP+']';
  this.bufferedHostMessages = []; //while awaiting certificate verification
  this.ws = websocket;
  if (messageConfig) {
    this.hostTypeKey = messageConfig.hostTypeKey;
    this.hostDataKey = messageConfig.hostDataKey;
    this.clientTypeKey = messageConfig.clientTypeKey;
    this.clientDataKey = messageConfig.clientDataKey;
    var t = this;
    if (t.hostTypeKey && t.hostDataKey && t.clientTypeKey && t.clientDataKey) {
      // ws has breaking upgrading. https://github.com/websockets/ws/releases/tag/8.0.0
      websocket.on('message', async (msg)=>{t.handleWebsocketMessage(msg);});
      websocket.on('close',(code,reason)=>{t.handleWebsocketClosed(code,reason);});
      
      t.configured = true;
    }
    else {
      this.logger.warn('Terminal websocket proxy was not supplied with valid message config description');
    }
  }
  else {
    this.logger.warn('Terminal websocket proxy was not supplied with valid message config description');
  }
}

TerminalWebsocketProxy.prototype.identifierString = function() {
  return this.log_header
};

TerminalWebsocketProxy.prototype.handleWebsocketMessage = async function(msg) {
  if (this.configured !== true && this.ws.readyState < 2) { //if ws is still open
    this.closeConnection(this.ws, WEBSOCKET_REASON_TERMPROXY_GOING_AWAY, 'WS open when expected to be closed');
    return;
  }
  await this.handleTerminalClientMessage(msg, this.ws);
};

TerminalWebsocketProxy.prototype.decrementCounter = function() {
  openTerminalConnections--;
  this.logger.info(this.identifierString()+' Total remaining terminals connected: '+openTerminalConnections);
  if (this.hostTypeKey == '3270_HOST_MESSAGE') {
    openTerminalConnections3270--;
    this.logger.info('Total TN3270 terminals connected: '+openTerminalConnections3270);
  }
  else if (this.hostTypeKey == '5250_HOST_MESSAGE') {
    openTerminalConnections5250--;
    this.logger.info('Total TN5250 terminals connected: '+openTerminalConnections5250);
  }
  else if (this.hostTypeKey == 'TELNET_DATA') {
    openTerminalConnectionsVT--;
    this.logger.info('Total VT terminals connected: '+openTerminalConnectionsVT);
  }
}

TerminalWebsocketProxy.prototype.closeConnStat = function() {
  if (this.connIds) {
    this.connPool.handleDisconnect(this.connIds);
    if (this.usingSSH && enabledSSHPool) {
      this.closeSSH();
    }
    this.connIds = null;
  }
}

TerminalWebsocketProxy.prototype.closeConnection = function(ws, code, message, keepWsOpen) {
  if (this.hostConnected) {
    this.decrementCounter();
    this.hostConnected = false;
  }
  try {
    this.hostSocket.destroy();
    this.closeConnStat();
  } catch (e) {
    this.logger.warn(this.identifierString()+' Error when destroying host socket. e='+e.message);
  }
  if ((ws.readyState < 2) && (!keepWsOpen)) {//if still open  
    ws.close(code,message.substring(0,WS_CLOSE_MESSAGE_LENGTH_LIMIT));//web limited to length=123
  }
};

TerminalWebsocketProxy.prototype.handleWebsocketClosed = function(code, reason) {
  if (this.hostSocket) {
    if (this.hostConnected) {
      this.logger.info(this.identifierString() + ' Websocket between browser and web server is closed')
      this.decrementCounter();
    }
    try {
      this.hostSocket.destroy();//kill the host socket too
    } catch (e) {
      this.logger.warn(this.identifierString()+' Error when destroying host socket. e='+e.message);
    }
  }
  this.hostConnected = false;
  
};

TerminalWebsocketProxy.prototype.handleTerminalClientMessage = async function(message, websocket) {
  var jsonObject = JSON.parse(message);
  this.logger.debug(this.identifierString()+' Websocket client message received. Length='+message.length);
  this.logger.log(this.logger.FINER,this.identifierString()+' Websocket client message content='+message);
  if (jsonObject) {
    if (this.handlers) {
      let handlerlen = this.handlers.length;
      for (let i = 0; i < handlerlen; i++) {
        try {
          let result = this.handlers[i].handleClientMessage(jsonObject, this);
          if (result && result.response) {
            this.wsSend(websocket,JSON.stringify(result.response));
            if (!result.continue) {
              return;
            }
          }
        } catch (e) {
          this.logger.warn('Terminal handler # '+i+' threw exception on handle client message. E='+e.stack);
        }
      }
    }
    if (this.hostConnected === false || (jsonObject.connData && jsonObject.connData.hasError)) {
      if (jsonObject.t === 'CONFIG') {
        this.log_header = String('[ID='+this.uuid+', Host='+jsonObject.host+', Port='+jsonObject.port+', ClientIP='+this.clientIP+']')
        this.connect(jsonObject.host, jsonObject.port, websocket, jsonObject.security, jsonObject.keepAlive, jsonObject.connData, jsonObject.autoReconnect);
      }
    }
    else {
      if (jsonObject.t === 'CERT_RES') {
        if (this.awaitingCertificateVerification) {
          if (jsonObject.fp === this.outstandingCertFingerprint) {
            if (jsonObject.a === true) {//accepted
              this.logger.debug(this.identifierString()+' Certificate accepted by client, processing buffered host data messages. Messages to process='+this.bufferedHostMessages.length);

              var hostMessage;              
              while (this.bufferedHostMessages.length > 0) {
                hostMessage = this.bufferedHostMessages.pop();
                await this.handleData(hostMessage, websocket);
              }
              this.awaitingCertificateVerification = false;
            }
            else {//rejected
              for (var i = 0; i < this.bufferedHostMessages.length; i++) {
                delete this.bufferedHostMessages[i];
              }
              this.bufferedHostMessages = [];
              var errorMessage = {text:this.identifierString()+' Certificate rejection recieved.',
                                  t:'CERT_REJECT'};
              this.logger.debug(errorMessage.text);              
            }
          } else {
            this.logger.warn(this.identifierString()+' CERT_RES seen but fingerprint does not match outstanding certificate request.');
          }          
        } else {
          this.logger.debug(this.identifierString()+' CERT_RES seen but not awaiting any certificate verification.');
        }
      }
      else if (jsonObject.t === this.clientTypeKey) {
        var data = base64ToUint8Array(jsonObject[this.clientDataKey]);
        var dataBuffer = Buffer.from(data);
        if (this.usingSSH && this.sshSessionData){
          var sshData = {'msgCode':SSH_MESSAGE.SSH_MSG_CHANNEL_DATA,'data':dataBuffer};
          this.sendSSHData(sshData);
        }
        else {
          this.netSend(dataBuffer);
        }
      }
      else if (jsonObject.t === 'SSH_USER_AUTH_RES') {
        if (this.usingSSH && this.sshSessionData) {
          switch (jsonObject.m) {
          case 'publickey':
            if (jsonObject.alg && jsonObject.d && jsonObject.qo) {//this part is just for querying if the pubkey will be supported
              var credential = {'msgCode':SSH_MESSAGE.SSH_MSG_USERAUTH_REQUEST,'method':jsonObject.m,'queryOnly':jsonObject.qo,'algorithm':jsonObject.alg,'blob':jsonObject.data};
              this.sendSSHData(credential);
            }
            else if (jsonObject.alg && jsonObject.k && jsonObject.s) {
              var credential = {'msgCode':SSH_MESSAGE.SSH_MSG_USERAUTH_REQUEST,'method':jsonObject.m,'algorithm':jsonObject.alg,'key':jsonObject.k,'signature':jsonObject.s};
              this.sendSSHData(credential);
            }
            else {
              this.logger.warn('Malformed SSH_USER_AUTH_RES for publickey. Missing alg, and k,s or d,qo');
            }
            break;
          case 'password':
            var credential = {'msgCode':SSH_MESSAGE.SSH_MSG_USERAUTH_REQUEST,'method':jsonObject.m,'username':jsonObject.u,'password':jsonObject.p};
            this.sendSSHData(credential);
            break;
          case 'hostbased':
            break;
            
          }
        } else {
          this.logger.debug('SSH_USER_AUTH type seen while not setup for SSH.');
          //TODO send error msg to client
        }
      }
      else if (jsonObject.t === 'SSH_USER_AUTH_INFO_RES') {
        if (this.usingSSH && this.sshSessionData) {
          this.sendSSHData({
            msgCode: SSH_MESSAGE.SSH_MSG_USERAUTH_INFO_RESPONSE,
            responses: jsonObject.res
          });
        }
      }
      else if (jsonObject.t === 'SSH_CH_REQ') {
        if (this.usingSSH && this.sshSessionData) {
          this.sendSSHData({
            msgCode: SSH_MESSAGE.SSH_MSG_CHANNEL_REQUEST,
            channel: (jsonObject.ch ? jsonObject.ch : null),
            type: jsonObject.reqt,
            reply: jsonObject.reply,
            requestContents: jsonObject.data
          });
        }
        else {
          this.logger.debug('Ignoring SSH_CH_REQ when SSH not in use or not ready');
        }
      }
      else if (jsonObject.t === 'PING') {
        if (this.usingSSH && this.sshSessionData) {
          this.sendSSHData({'msgCode':SSH_MESSAGE.SSH_MSG_IGNORE});
        }
      }
      
    }
    if (jsonObject.t === 'IP_REQ') {
      if (websocket.readyState !== 1){
        return // JSTE-15151, it should check the websocket readyState, otherwise it could cause exception
      }
      /*This ability is for allowing the client to know what its IP is so that it can 
        tell terminal servers what its true IP is.*/
      this.wsSend(websocket,JSON.stringify({
        "t": "IP_RES",
        "data": this.clientIP
      }));
    }
  }
};

TerminalWebsocketProxy.prototype.netSend = function(buffer) {
  this.logger.debug(this.identifierString()+' Writing to host socket. Length='+buffer.length);
  this.logger.log(this.logger.FINER,this.identifierString()+' Content to be sent to host socket=\n'+hexDump(buffer));
  this.hostSocket.write(buffer);

};

TerminalWebsocketProxy.prototype.wsSend = function(websocket,string) {
  this.logger.debug(this.identifierString()+' Websocket sending client message. Length='+string.length);
  this.logger.log(this.logger.FINER, this.identifierString()+' Content to be sent to client=\n'+string);
  try {
    if (websocket.readyState === 1) {
      websocket.send(string);
    } else {
      this.logger.warn('WebSocket is not open: readyState ' + websocket.readyState);
    }
  } catch (e) {
    this.logger.warn(e.message);
  }
};

const WEBSOCKET_REASON_TERMPROXY_INTERNAL_ERROR = 4999;
const WEBSOCKET_REASON_TERMPROXY_GOING_AWAY = 4000;

TerminalWebsocketProxy.prototype.processSSHEncryptedData = async function(sshData) {
  
  if (!enabledSSHPool) {
    return ssh.processEncryptedData(this,sshData,this.uuid);
  }

  const task = {
    type: 'ssh_processEncryptedData',
    payload: {
      proxy: {
        sshSessionData: this.sshSessionData,
        clientIP: this.clientIP,
        connId: this.uuid,
        securitySettings: this.securitySettings
      },
      sshData
    }
  };
  const output = await sshPool.runTaskAsync(task, this.workerId, this.uuid);
  if (output) {
    const {workerId, result} = output;
    if (this.workerId === undefined) {
      this.workerId = workerId;
    }
    if (result) {
      if (result.sshSessionData) {
        this.sshSessionData = result.sshSessionData;
      }
      if (result.sshAuthenticated !== undefined) {
        this.sshAuthenticated = result.sshAuthenticated;
      }
      if (result.sendBuffers && Array.isArray(result.sendBuffers)) {
        result.sendBuffers.forEach((buf) => {
          const sendBuf = Buffer.from(buf);
          this.netSend(sendBuf);
        })
      }
      if (!result.sshMessages) {
        this.logger.warn(result);
      }
      return result.sshMessages;
    }
  }
  return [];
}


TerminalWebsocketProxy.prototype.closeSSH = function(sshData) {
  
  if (!enabledSSHPool) {
    return;
  }

  const task = {
    type: 'ssh_close',
    payload: {
      proxy: {
        clientIP: this.clientIP,
        connId: this.uuid
      },
      sshData
    }
  };
  sshPool.runTaskAsync(task, this.workerId, this.uuid);
}

TerminalWebsocketProxy.prototype.sendSSHData = function(sshData) {

  if (!enabledSSHPool) {
    return ssh.sendSSHData(this, sshData, this.uuid)
  }

  const task = {
    type: 'ssh_sendSSHData',
    payload: {
      proxy: {
        clientIP: this.clientIP,
        connId: this.uuid,
        securitySettings: this.securitySettings
      },
      sshData
    }
  };
  sshPool.runTaskAsync(task, this.workerId, this.uuid).then((output) => {
    if (output) {
      const {workerId, result} = output;
      if (this.workerId === undefined) {
        this.workerId = workerId;
      }
      if (result.sshSessionData) {
        this.sshSessionData = result.sshSessionData
      }
      if (result.sendBuffers && Array.isArray(result.sendBuffers)) {
        result.sendBuffers.forEach((buf) => {
          const sendBuf = Buffer.from(buf);
          this.netSend(sendBuf);
        })
      }
    }
  })
}

TerminalWebsocketProxy.prototype.handleData = async function(data, ws) {
  var t = this;
  try {
    t.logger.debug(t.identifierString()+' Received host data. Length='+data.length);
    t.logger.log(t.logger.FINER,t.identifierString()+' Content of host data=\n'+hexDump(data));

    var replies = [];
    if (t.usingSSH){
      var sshMessages = await this.processSSHEncryptedData(data);
      if (sshMessages.length > 0) {
        sshMessages.forEach(function(sshMessage) {
          switch (sshMessage.type) {
          case SSH_MESSAGE.SSH_MSG_USERAUTH_INFO_REQUEST:
            sshMessage.t = 'SSH_USER_AUTH_INFO_REQ';
            replies.push(sshMessage);
            break;
          case SSH_MESSAGE.SSH_MSG_USERAUTH_PK_OK:
            replies.push({t:'SSH_USER_AUTH_PK_OK'});
            break;
          case SSH_MESSAGE.SSH_MSG_USERAUTH_BANNER:
          case SSH_MESSAGE.SSH_MSG_CHANNEL_DATA:
            var b64Data = utf8ArrayToB64(Buffer.from( (sshMessage.type === SSH_MESSAGE.SSH_MSG_CHANNEL_DATA) ? sshMessage.readData : sshMessage.message,'utf8'));
            var reply = { t: t.hostTypeKey};
            reply[t.hostDataKey] = b64Data;
            replies.push(reply);
            break;
          case SSH_MESSAGE.SSH_MSG_SERVICE_ACCEPT:
            replies.push({
              t: "SSH_USER_AUTH_REQ"
            });
            break;
          case SSH_MESSAGE.SSH_MSG_DISCONNECT:
          case SSH_MESSAGE.SSH_MSG_CHANNEL_CLOSE:
            var errorMessage = 'SSH session disconnected';
            if (sshMessage.type === SSH_MESSAGE.SSH_MSG_CHANNEL_CLOSE)
              errorMessage = 'SSH session closed with CHANNEL_CLOSE from host';
            t.logger.warn(t.identifierString()+' '+errorMessage);
            if (t.hostConnected && ws && t.autoReconnect) {
              t.closeConnection(ws, WEBSOCKET_REASON_TERMPROXY_GOING_AWAY,errorMessage,true);
              t.sshSessionData = null;
              t.sshAuthenticated = false;
              t.logger.info(t.identifierString()+' Will auto reconnect');
              t.wsSend(ws,JSON.stringify({"t": "RECONNECT"}));
            } else if (t.hostConnected) {
              t.closeConnection(ws, WEBSOCKET_REASON_TERMPROXY_GOING_AWAY,errorMessage);
            } else {
              t.closeConnStat();
            }
            break;
          case SSH_MESSAGE.SSH_MSG_CHANNEL_REQUEST:
            var b64Data = utf8ArrayToB64(Buffer.from(sshMessage.data,'utf8'));
            replies.push({
              "t": "SSH_CH_REQ",
              "ch": sshMessage.recipientChannel,
              "reqt": sshMessage.requestName,
              "reply": sshMessage.needsReply,
              "B64": b64Data
            });
            break;
          case SSH_MESSAGE.SSH_MSG_USERAUTH_FAILURE:
            t.logger.debug('Probably user or password was wrong.');
            replies.push({
              t: "SSH_USER_AUTH_REQ"
            });                
            break;
          case SSH_MESSAGE.ERROR:
            var errorMessage = 'SSH encountered error='+sshMessage.msg;
            t.logger.warn(t.identifierString()+' '+errorMessage);
            t.closeConnection(ws, WEBSOCKET_REASON_TERMPROXY_INTERNAL_ERROR,errorMessage);            
            break;
          default:
            //ignore
          }
        });
      }
    } else {
      var b64Data = utf8ArrayToB64(data);
      var reply = { t: t.hostTypeKey};
      reply[t.hostDataKey] = b64Data;
      replies.push(reply);
    }
    if (replies.length > 0){
      replies.forEach(function(reply) {
        var stringReply = JSON.stringify(reply);
        t.wsSend(ws,stringReply);
      });
      // clearTimeout(ws.timeOutHandle);
    }
  } catch (e) {
    var errorMessage = 'Host communication error='+e.message;
    t.logger.warn(t.identifierString()+' '+errorMessage);    
    t.closeConnection(ws, WEBSOCKET_REASON_TERMPROXY_INTERNAL_ERROR,errorMessage);
  }
};

var incrementCounters = function(t) {
  openTerminalConnections++;
  t.logger.info('Total terminals connected: '+openTerminalConnections);
  if (t.hostTypeKey == '3270_HOST_MESSAGE') {
    openTerminalConnections3270++;
    t.logger.info('Total TN3270 terminals connected: '+openTerminalConnections3270);
  }
  else if (t.hostTypeKey == '5250_HOST_MESSAGE') {
    openTerminalConnections5250++;
    t.logger.info('Total TN5250 terminals connected: '+openTerminalConnections5250);
  }
  else if (t.hostTypeKey == 'TELNET_DATA') {
    openTerminalConnectionsVT++;
    t.logger.info('Total VT terminals connected: '+openTerminalConnectionsVT);
  }
};

TerminalWebsocketProxy.prototype.connect = function(host, port, ws, security, keepAlive, connData, autoReconnect) {
  var t = this;
  var connectOptions = null;
  // var timer, timeout = 60000;
  t.websocket = ws;
  t.autoReconnect = autoReconnect;
  t.keepAlive = keepAlive;

  var promptOrAcceptCertificate = function(servername, certificate) {
    t.logger.debug('Creating server fingerprint. server='+servername+', certificate='+certificate);
    var fingerprintHash = crypto.createHash('sha256');
    fingerprintHash.update(certificate.raw);
    var hex = fingerprintHash.digest('hex');
    var fingerprint = '';
    for (var i = 0; i < hex.length-1;) {
      fingerprint+= hex.substring(i,i+2) + ':';
      i=i+2;
    }
    fingerprint = fingerprint.substring(0,fingerprint.length-1);
    t.logger.debug(t.identifierString()+' Checking if certificate is OK. Fingerprint='+fingerprint);
    if (security.badCert != SECURITY_BAD_CERTIFICATE_ALLOW) {
      t.awaitingCertificateVerification = true;
      // In case of certificate chain, the certificate.issuerCertificate is a circular (includes itself circularly). 
      // A circular object will raise exception when it's stringified. 
      // To avoid exception, the issuerCertificate is removed from certificate of tls. 
      let certcopy = Object.assign({}, certificate);
      if (certcopy && certcopy.issuerCertificate) {
        delete certcopy.issuerCertificate;
      }

      const str = JSON.stringify({
        t: 'CERT_PROMPT',
        fp: fingerprint,
        o: certcopy
      });
      
      if (ws.readyState === 1) {
        ws.send(str);
      } else {
        t.logger.warn('WebSocket is not open: readyState ' + ws.readyState);
      }

    }
    return undefined;
  };
  
  if (host && port) {

    this.host = host;
    this.port = port;
    
    if (security && security.t === "ssh") {
      t.securitySettings = security;
      t.usingSSH = true;
      ssh.reOrderKeyExchangeList(security.keyExchangeAlgorithm)
    }
    else if (security && security.t === 'tls') {
      t.usingTLS = true;
      t.securitySettings = security;
      var rejectUnauthorized = ((typeof security.badCert == 'number') && security.badCert == SECURITY_BAD_CERTIFICATE_ALLOW) ? false : true;
      connectOptions = {
        rejectUnauthorized: rejectUnauthorized,//True casues rejection of certs if the CA cannot handle them. For example, self-signed exceptions are thrown
        servername: security.servername
      };
      /*
        With CAs, this will be called. It must return either undefined if allowed, or throw if not allowed, so it cannot be async. Instead we set up the server to buffer messages while the user is prompted if needed.
      */      
      if (rejectUnauthorized) {
        connectOptions.checkServerIdentity = promptOrAcceptCertificate;
      }
      var securityObjects = TerminalWebsocketProxy.securityObjects;
      if (securityObjects) {
        if (securityObjects.ca) {
          connectOptions.ca = securityObjects.ca;
        }
        if (securityObjects.crl) {
          connectOptions.crl = securityObjects.crl;
        }
      }      
	  if(security.useCipher && security.cipherList && Array.isArray(security.cipherList)){ //if don't user default and also no specify the cipher suit, cause fail to connect
        connectOptions.ciphers= security.cipherList.join(':'); 
        //connectOptions.minVersion='TLSv1';  
      }
    }
    if (!t.usingTLS) {
      this.hostSocket = net.Socket();
    }
    
    try {
      // how to handle connection id exceed condition?? 
      if (!connData.isBzaVerify) {
        this.connIds = this.connPool.handleConnect({ uid: connData.userId, ip: this.clientIP, grps: connData.groupNames });
      } else {
        this.connIds = this.connPool.handleConnect({ uid: 'admin', ip: this.clientIP, grps: connData.groupNames });
      }

      var errorHandler = function(e) {
        clearTimeout(t.connTimer);
        var errorMessage;
        if (e.code && e.code === 'ENOTFOUND') {
          errorMessage="Error: Host not found";
        } else {
          errorMessage = 'Host communication error='+e.message;
        }

        if (t.usingTLS) {
          var hostCert = t.hostSocket.getPeerCertificate();
          t.logger.debug('The host had a certificate of: '+JSON.stringify(hostCert));
        }
        t.logger.warn(t.identifierString()+' '+errorMessage);
        if ((t.hostConnected || t.isConnecting) && (t.websocket && t.autoReconnect)) {
          t.closeConnection(t.websocket, WEBSOCKET_REASON_TERMPROXY_INTERNAL_ERROR,errorMessage,true);
          t.sshSessionData = null;
          t.sshAuthenticated = false;
          t.logger.info(t.identifierString()+' Will auto reconnect')
          t.wsSend(t.websocket,JSON.stringify({"t": "RECONNECT"}));
        } else if (t.hostConnected || t.isConnecting) {
          // if (t.keepAlive && t.keepAlive.backUpEnabled
          //   && (t.keepAlive.useBackUpIndex == undefined
          //     || t.keepAlive.useBackUpIndex < t.keepAlive.backUpList.length)) {
          //   t.sshSessionData = null;
          //   t.sshAuthenticated = false;
          //   t.wsSend(t.websocket, JSON.stringify({ "t": "RECONNECT" }));
          //   t.logger.warn(t.identifierString() + ' ' + 'failed to connect ' + t.host + ':' + t.port);
          // } else {
          //   if (t.keepAlive && t.keepAlive.backUpEnabled
          //     && (t.keepAlive.useBackUpIndex >= t.keepAlive.backUpList.length)) {
          //     errorMessage = 'No valid host for connecting';
          //   }
          //   t.closeConnection(t.websocket, WEBSOCKET_REASON_TERMPROXY_INTERNAL_ERROR, errorMessage);
          // }
          t.closeConnection(t.websocket, WEBSOCKET_REASON_TERMPROXY_INTERNAL_ERROR, errorMessage);
        } else {
          t.closeConnStat();
        }
        this.isConnecting = false;
      };
      
      var connectHandler = function() {
        //TODO SSH also needs trusted hosts file. How can I get the SSH certificate?
        incrementCounters(t);
        t.isConnecting = false;        
        
        if(t.usingTLS){
            t.logger.info(t.identifierString()+" Negotiated TLS protocol Version:"+t.hostSocket.getProtocol());
            t.logger.debug("TLS Cipher:"+JSON.stringify(t.hostSocket.getCipher()));
        }
        t.hostSocket.on('error',errorHandler);
        
        t.hostSocket.on('data', async function(data) {
          if (t.awaitingCertificateVerification) {
            t.bufferedHostMessages.push(data);
            // clearTimeout(timer);
            return;
          }
          // ws.timeOutHandle=timer;
          await t.handleData(data,ws);
        });
        
        t.hostSocket.on('close', function () {
          // var errorMessage = 'Host closed the socket, session is closing, relaunch the session to reconnect.';
          // t.logger.debug(t.identifierString()+' '+errorMessage);
          const msg = ' Socket between web server and host is closed.'
          if (t.hostConnected && t.websocket && t.autoReconnect) {
            t.closeConnection(t.websocket, WEBSOCKET_REASON_TERMPROXY_GOING_AWAY,msg,true);
            t.sshSessionData = null;
            t.sshAuthenticated = false;
            t.logger.info(t.identifierString() + msg + ' Will auto reconnect');
            t.wsSend(t.websocket,JSON.stringify({"t": "RECONNECT"}));
          } else if (t.hostConnected) {
            t.logger.info(t.identifierString() + msg + ' Will close the websocket between browser and web server');
            t.closeConnection(t.websocket, WEBSOCKET_REASON_TERMPROXY_GOING_AWAY, msg);
          } else {
            t.logger.info(t.identifierString() + msg);
            t.closeConnStat();
          }
        });

        //connect
        t.hostConnected = true; 
      };

      try {
        this.logger.info(this.identifierString() + ' Establishing connection between web server and host')
        this.isConnecting = true;

        if (this.connTimer !== undefined) { // In case of auto-reconnect, make sure the previous timeout is cleard before assigning a new timeout to the same property.
          clearTimeout(this.connTimer);
        }
        this.connTimer = setTimeout(function() {
          var errorMessage = 'Error: Connect timeout';
          if(t.autoReconnect) {
            t.hostConnected = false;
            t.sshSessionData = null;
            t.sshAuthenticated = false;
            t.wsSend(t.websocket,JSON.stringify({"t": "RECONNECT"}));
            t.logger.warn(t.identifierString()+' '+'Connect timeout '+t.host+':'+t.port);
          }else {
            t.closeConnection(ws, WEBSOCKET_REASON_TERMPROXY_GOING_AWAY,errorMessage);
            t.logger.warn(t.identifierString()+' '+errorMessage);
          }
          t.closeConnection(ws, WEBSOCKET_REASON_TERMPROXY_GOING_AWAY,errorMessage);
          t.logger.warn(t.identifierString()+' '+errorMessage);
        }, CONN_TIMEOUT);

        if (t.usingTLS) {
          t.logger.debug(t.identifierString()+' Attempting TLS connect');
          if( t.securitySettings.tlsMinVersion){
            tls.DEFAULT_MIN_VERSION=t.securitySettings.tlsMinVersion
          }
          if( t.securitySettings.tlsMaxVersion){
            tls.DEFAULT_MAX_VERSION=t.securitySettings.tlsMaxVersion
          }
          this.hostSocket = tls.connect(port,host,connectOptions,connectHandler);
          this.hostSocket.on('error',errorHandler);
          this.hostSocket.on('secureConnect', () => {
            clearTimeout(this.connTimer);
            this.logger.info(this.identifierString()+' TLS connection with host established');
          })
        }
        else {
          t.logger.debug(this.identifierString()+'Attempting SSH or telnet connect');
          this.hostSocket.on('error',errorHandler);
          this.hostSocket.on('connect',() => {
            clearTimeout(this.connTimer);
            this.logger.info(this.identifierString()+' Socket connection with host established');
          });
          this.hostSocket.connect(port, host, connectHandler);
        }

        // Add Nagle's algorithm for the socket
        this.hostSocket.setNoDelay(false);

        if(!t.usingSSH && keepAlive){//telnet tcp keepalive
          this.hostSocket.setKeepAlive(keepAlive.enable,keepAlive.initialDelay);
        }
        
      } catch (e) {
        var errorMessage = 'Error during connection='+e.message;
        t.logger.warn(t.identifierString()+' '+errorMessage);
        t.closeConnection(ws, WEBSOCKET_REASON_TERMPROXY_INTERNAL_ERROR,errorMessage);
      }
    }
    catch (e) {
      var errorMessage;
      if (e.code && e.code === 'ENOTFOUND') {
        errorMessage="Error: Host not found";
      } else {
        errorMessage = 'Host communication error='+e.message;
      }
      t.logger.warn(t.identifierString()+' '+errorMessage);
      t.closeConnection(ws, WEBSOCKET_REASON_TERMPROXY_INTERNAL_ERROR,errorMessage);
    }

  }
};

var tn3270MessageConfig = {
  hostTypeKey: '3270_HOST_MESSAGE',
  hostDataKey: 'B64',
  clientTypeKey: '3270_CLIENT_MESSAGE',
  clientDataKey: 'data'
}

var tn5250MessageConfig = {
  hostTypeKey: '5250_HOST_MESSAGE',
  hostDataKey: 'B64',
  clientTypeKey: '5250_CLIENT_MESSAGE',
  clientDataKey: 'data'
}

var vtMessageConfig = {
  hostTypeKey: 'TELNET_DATA',
  hostDataKey: 'B64',
  clientTypeKey: 'VT_INPUT',
  clientDataKey: 'data'
}

var openTerminalConnections = 0;
var openTerminalConnectionsVT = 0;
var openTerminalConnections3270 = 0;
var openTerminalConnections5250 = 0;

function createSecurityObjects(config,logger) {
  var readFilesToArray = function(fileList) {
    var contentArray = [];
    fileList.forEach(function(filePath) {
      try {
        contentArray.push(fs.readFileSync(filePath));
      } catch (e) {
        logger.warn('Error when reading file='+filePath+'. Error='+e.message);
      }
    });
    if (contentArray.length > 0) {
      return contentArray;
    }
    else {
      return null;
    }
  };
  TerminalWebsocketProxy.securityObjects = {};
  //JSTE-17607,Decouple the root CA configuration and HTTPS
  const rootCAFiles=config?.tlsOptions?.ca
  const rootCRFiles=config?.tlsOptions?.crl

  if(!isOnZowe && rootCAFiles){
    TerminalWebsocketProxy.securityObjects.ca = readFilesToArray(rootCAFiles);
  }else if(isOnZowe && config.ca){
    TerminalWebsocketProxy.securityObjects.ca = config.ca;
  }

  if(!isOnZowe && rootCRFiles){
    TerminalWebsocketProxy.securityObjects.crl =  readFilesToArray(rootCRFiles);
  }else if(isOnZowe && config.crl){
    TerminalWebsocketProxy.securityObjects.crl =  config.crl;
  }
}

var handlerModules = null;
let scanAndImportHandlers = function(logger) {
  if (handlerModules == null) {
    handlerModules = [];
    let filenames = fs.readdirSync(__dirname);
    let len = filenames.length;
    for (let i = 0; i < len; i++) {
      let filename = filenames[i];

      if (filename.endsWith('.js') && (filename != 'terminalProxy.js') && (filename != 'ssh.js')) {
        try {
          let module = require('./'+filename);
          if (typeof module.handleClientMessage == 'function'){
            logger.info('Found and loaded compatible handler file /lib/'+filename);            
            handlerModules.push(module);
          }
        } catch (e) {
          logger.warn('Could not load a handler from file /lib/'+filename);
        }
      }
    }
  }
  return handlerModules;
};

exports.tn3270WebsocketRouter = function(context) {
  /* 
    a handler is an external component for interpreting messages of types or in ways not covered in this code alone
    a handler is given the data and returns  a JSON response which includes whether to continue or not
    requires: wsmessage, this
    returns: {response: {}, continue: true/false}
    if malformed, continues.

    handlers can come from /lib for now.
  */
  let handlers = scanAndImportHandlers(context.logger);
  return new Promise(function(resolve, reject) {
    let securityConfig = context.plugin.server.config.user.node;
    if (!TerminalWebsocketProxy.securityObjects) {
      if (!isOnZowe && securityConfig) {
        context.logger.debug('I see and will read in the CAs');
        createSecurityObjects(securityConfig,context.logger);
      }else if(isOnZowe){
        createSecurityObjects(context.tlsOptions,context.logger);
      }
    }
    

    let router = express.Router();  
    router.use(function abc(req,res,next) {
      context.logger.info('Saw Websocket request, method='+req.method);      
      next();
    });
    router.ws('/',function(ws,req) {
      const ip = req.headers['x-forwarded-for'] || req.ip;
      new TerminalWebsocketProxy(tn3270MessageConfig,ip,context,ws,handlers);
      //this is a new connection, this must make a BRAND NEW INSTANCE!!!
    });
    resolve(router);
  });
};
exports.tn5250WebsocketRouter = function(context) {
  let handlers = scanAndImportHandlers(context.logger);
  return new Promise(function(resolve, reject) {
    if (!TerminalWebsocketProxy.securityObjects) {
      let securityConfig = context.plugin.server.config.user.node;
      if (!isOnZowe && securityConfig) {
        createSecurityObjects(securityConfig,context.logger);
      }else if(isOnZowe){
        createSecurityObjects(context.tlsOptions,context.logger);
      }
    }

    let router = express.Router();  
    router.use(function abc(req,res,next) {
      context.logger.info('Saw Websocket request, method='+req.method);
      next();
    });
    router.ws('/',function(ws,req) {
      const ip = req.headers['x-forwarded-for'] || req.ip;
      new TerminalWebsocketProxy(tn5250MessageConfig,ip,context,ws,handlers);
      //this is a new connection, this must make a BRAND NEW INSTANCE!!!
    });
    resolve(router);
  });
};
exports.vtWebsocketRouter = function(context) {
  let handlers = scanAndImportHandlers(context.logger);
  return new Promise(function(resolve, reject) {
    if (!TerminalWebsocketProxy.securityObjects) {
      let securityConfig = context.plugin.server.config.user.node;
      if (!isOnZowe && securityConfig) {
        createSecurityObjects(securityConfig,context.logger);
      }else if(isOnZowe){
        createSecurityObjects(context.tlsOptions,context.logger);
      }
    }

    let router = express.Router();  
    router.use(function abc(req,res,next) {
      context.logger.info('Saw Websocket request, method='+req.method);      
      next();
    });
    router.ws('/',function(ws,req) {
      const ip = req.headers['x-forwarded-for'] || req.ip;
      new TerminalWebsocketProxy(vtMessageConfig,ip,context,ws,handlers);
      //this is a new connection, this must make a BRAND NEW INSTANCE!!!
    });
    resolve(router);
  });  
};

/*
  This program and the accompanying materials are
  made available under the terms of the Eclipse Public License v2.0 which accompanies
  this distribution, and is available at https://www.eclipse.org/legal/epl-v20.html
  
  SPDX-License-Identifier: EPL-2.0
  
  Copyright Contributors to the Zowe Project.
*/
