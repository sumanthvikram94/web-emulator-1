

/*
  This program and the accompanying materials are
  made available under the terms of the Eclipse Public License v2.0 which accompanies
  this distribution, and is available at https://www.eclipse.org/legal/epl-v20.html
  
  SPDX-License-Identifier: EPL-2.0
  
  Copyright Contributors to the Zowe Project.
*/

'use strict';

const Promise = require('bluebird');
const fs = require('fs-extra');
const http = require('http');
const https = require('https');
const url = require('url');
const WebSocket = require('ws');
const expressWs = require('express-ws');
const util = require('./util');
const reader = require('./reader');
const encryptor = require('./encryption.js');
const tokenKey = ';lavoi312-23!!230(;as^alds8*.mv%';
const tokenIv = '2%&_=AVad1!;sa[}';
const nodeUtil = require('util');
const crypto = require("crypto");

const bootstrapLogger = util.loggers.bootstrapLogger;
const contentLogger = util.loggers.contentLogger;
const childLogger = util.loggers.childLogger;
const proxyLogger = util.loggers.proxyLogger;

function WebServer() {
  this.config = null;
}
WebServer.prototype = {
  constructor: WebServer,
  config: null,
  httpOptions: null,
  httpsOptions: null,
  wsPingPongInterval: null,
  
  _loadHttpsKeyData() {
    if (this.config.https.pfx) {
      try {
        this.httpsOptions.pfx = fs.readFileSync(this.config.https.pfx);
        if (this.config.https.token){
          const en = new nodeUtil.TextEncoder();
          this.httpsOptions.passphrase = encryptor.decryptWithKeyAndIV(this.config.https.token, en.encode(tokenKey), en.encode(tokenIv));
        } else if (process.env.PFX_TOKEN) {
          const en = new nodeUtil.TextEncoder();
          this.httpsOptions.passphrase = encryptor.decryptWithKeyAndIV(process.env.PFX_TOKEN, en.encode(tokenKey), en.encode(tokenIv));
        }
        bootstrapLogger.info('Using PFX: '+ this.config.https.pfx);
      } catch (e) {
        bootstrapLogger.warn('Error when reading PFX. Server cannot continue. Error='+e.message);
        //        process.exit(UNP_EXIT_PFX_READ_ERROR);
        throw e;
      }
    } else {
      try {
        if (this.config.https.certificates) {
          this.httpsOptions.cert = util.readFilesToArray(this.config.https.certificates);
          bootstrapLogger.info('Using Certificate: ' + this.config.https.certificates);
        }
        if (this.config.https.keys) {
          this.httpsOptions.key = util.readFilesToArray(this.config.https.keys);
        }
        if (this.config.https.tokens) {
          const en = new nodeUtil.TextEncoder();
          this.httpsOptions.passphrase = encryptor.decryptWithKeyAndIV(this.config.https.tokens[0], en.encode(tokenKey), en.encode(tokenIv));
        }
      } catch (e) {
        bootstrapLogger.warn('Error when reading KEY/CERT. Server cannot continue. Error='+e.message);
        throw e;
      }
    }

    //don't think below code is being used, HTTPS is server, the certificate chain is valid in Browser. 
    if (this.config.https.certificateAuthorities) {
      this.httpsOptions.ca = util.readFilesToArray(this.config.https.certificateAuthorities);
    }
    if (this.config.https.certificateRevocationLists) {
      this.httpsOptions.crl = util.readFilesToArray(this.config.https.certificateRevocationLists);
    };

    //this.config.https is object which has been confirmed before invoke
    //remove cipher like !AES128-GCM-SHA256,  ! means ciphers are permanently deleted from the list   
    //cipher shoule be SSL name format
    //node default :  TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:
    //ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-SHA256:DHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384:
    //DHE-RSA-AES256-SHA384:ECDHE-RSA-AES256-SHA256:DHE-RSA-AES256-SHA256:HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA
    if (this.config.disabledCiphers && Array.isArray(this.config.disabledCiphers) && this.config.disabledCiphers.length > 0) {
      const disabledList=this.config.disabledCiphers;
      let ciphers = crypto.constants.defaultCipherList;
      const disableCiphers = disabledList.map(e =>"!" + e);
      ciphers = ciphers + ":" + disableCiphers.join(":");
      this.httpsOptions.ciphers = ciphers;
    }
  },

  isConfigValid(config) {
    let canRun = false;
    if (config.http && config.http.port) {
      canRun = true;
    } else if (config.https && config.https.port) {
      if (config.https.pfx) {
        canRun = true;
      } else if (config.https.certificates && config.https.keys) {
        canRun = true;
      }
    }
    return canRun;
  },

  setConfig(config, adminConfig) {
    this.config = config;
    if (this.config.http && this.config.http.port) {
      this.httpOptions = {};
    }
    if (this.config.https && this.config.https.port) {
      this.httpsOptions = {};
    }

    if(adminConfig) {
      this.wsPingPongInterval = adminConfig.wsPingPongInterval;
    }
  },

  startListening: function (app) {
    let t = this;
    if (this.config.https && this.config.https.port) {
      let listening = false;
      this._loadHttpsKeyData();
      while (!listening) {
        try {
          this.httpsServer = https.createServer(this.httpsOptions, app);
          this.expressWsHttps = expressWs(app, this.httpsServer, {maxPayload: 50000});
          listening = true;
          this.enableWSPingPong(this.expressWsHttps.getWss());
        } catch (e) {
          if (e.message == 'mac verify failure') {
            // const r = new reader();
            // this.httpsOptions.passphrase = r.readPasswordSync(
            //     'HTTPS key or PFX decryption failure. Please enter passphrase: ');
            throw new Error('HTTPS key or PFX decryption failure');
          } else {
            throw e;
          }
        }
      }
      this.callListen(this.httpsServer, 'https', 'HTTPS');
    }
    if (this.config.http && this.config.http.port) {
      this.httpServer = http.createServer(app);
      this.expressWsHttp = expressWs(app, this.httpServer);
      this.callListen(this.httpServer, 'http', 'HTTP');
      this.enableWSPingPong(this.expressWsHttp.getWss());
    }

  },

  /**
   * RTEW Extended. Detect and close broken connections.
   * @param {*} wss - ws server instance
   */
  enableWSPingPong(wss){
    wss.on('connection', (ws) => {
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true; // Pong received, so the connection is still alive
      });
    })

    const timeoutMs = 2 * 60 * 60 * 1000; 
    const interval = setInterval(() => { // Ping all the ws clients each 5 minites
      wss.clients.forEach((ws) => {
        const now = new Date().getTime();
        /**
         * ignorePingPongTimer: 
         *  1. null: check pingPong
         *  2. always: ignore pingPong
         *  3. timestamp: ignore pingPong within 2 hours
         * 
         */
        const timer = ws.ignorePingPongTimer;
        const ignore = timer && (typeof timer === 'number' ? now - timer < timeoutMs : timer === 'always');

        if (ws.readyState !== WebSocket.OPEN || ignore){
          return;
        }
        if (ws.isAlive === false) {
          proxyLogger.info('Terminating dead ws connection')
          return ws.terminate(); // If the client didn't send pong after 5 minites, close the ws conn.
        }
        ws.isAlive = false; // Sets it to false before ping, pong will reset it.
        ws.ping();
      });
    }, this.wsPingPongInterval || 1000 * 60 * 5);
    wss.on('close', function close() {
      clearInterval(interval);
    });
  },

  callListen(methodServer, methodName, methodNameForLogging) {
    var methodConfig = this.config[methodName];
    var addressForLogging = methodConfig.hostname ? methodConfig.hostname : "*";
    addressForLogging += ":" + methodConfig.port;

    var logFunction = function () {
      bootstrapLogger.log(bootstrapLogger.INFO,`(${methodNameForLogging})  listening on ${addressForLogging}`)
    };
    bootstrapLogger.log(bootstrapLogger.INFO,`(${methodNameForLogging})  about to start listening on ${addressForLogging}`);

    /**
     * TODO, how to support multiple ip address
     * I have tried below ways,
     * String: "127.0.0.1,10.48.6.143", "127.0.0.1 10.48.6.143", treat this as a string does not work 
     * Array : ["127.0.0.1","10.48.6.143"], only listen the first one in this array if use foreach.
     * 
     */
    if (this.config.hostIp) {
      // const hostIps=Array.isArray(methodConfig.hostname)?methodConfig.hostname:[methodConfig.hostname];
      // hostIps.forEach(hostIp => {
      //   methodServer.listen(methodConfig.port, hostIp, logFunction);
      // });
      const hostIp=this.config.hostIp
      methodServer.listen(methodConfig.port, hostIp, logFunction);
    } else {
      methodServer.listen(methodConfig.port, logFunction);
    }
  },

  close() {
    if (this.httpServer) {
      bootstrapLogger.log(bootstrapLogger.INFO,'Closing http server');
      this.httpServer.close();
    }
    if (this.httpsServer) {
      bootstrapLogger.log(bootstrapLogger.INFO,'Closing https server');
      this.httpsServer.close();
    }
  }
};

module.exports = WebServer;

const _unitTest = false;
function unitTest() {
  const config = {
    "node": {
      "http": {
        "port": 31339,
        "hostname": "127.0.0.1"
      },
      "https": {
        "port": 31340,
        "keys": ["../deploy/product/MVD/serverConfig/server.key"],
        "certificates": ["../deploy/product/MVD/serverConfig/server.cert"]
      }
    }
  };
  const webServer = makeWebServer();
  if (webServer.isConfigValid(config)) {
    bootstrapLogger.info("Config valid");
    webServer.setConfig(config);
    const express = require('express');
    webServer.startListening(express());
  } else {
     bootstrapLogger.warn("Config invalid");
  }
}
if (_unitTest) {
  unitTest();
}
  
  
  


/*
  This program and the accompanying materials are
  made available under the terms of the Eclipse Public License v2.0 which accompanies
  this distribution, and is available at https://www.eclipse.org/legal/epl-v20.html
  
  SPDX-License-Identifier: EPL-2.0
  
  Copyright Contributors to the Zowe Project.
*/

