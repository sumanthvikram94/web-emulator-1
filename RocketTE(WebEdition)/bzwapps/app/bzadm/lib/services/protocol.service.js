const net = require('net');
const https = require('https');
const path = require('path');
const fs = require('fs-extra');
const BASE_PATH = path.join(process.cwd(), '../');
const util = require('util');
const portfinder = require('portfinder');
const deployDirectory = {
    instanceZluxPath: "deploy/instance/ZLUX",
    productZluxPath: "deploy/product/ZLUX",
    pluginStorageFolder: "pluginStorage",
    pluginFolder: "plugins",
    serverConfigFolder: "serverConfig",
};
const tokenKey = ';lavoi312-23!!230(;as^alds8*.mv%';
const tokenIv = '2%&_=AVad1!;sa[}';
const encryptor = require('../../../../lib/zlux/zlux-proxy-server/js/encryption.js');
const zoweService = require('../../../bzshared/lib/services/zowe.service');
const jsonUtils = zoweService.jsonUtils;

class Protocol {
    constructor(context) {
        this.en = new util.TextEncoder();
        this.logger = context.logger;
        this.context=context;
        
    }
    //Todo for ip v6, undefined means 0.0.0.0 for Node.js 
    get hostSpicificIp(){
        return this.context.plugin.server.config.user.node.hostIp || undefined  
    }
    /*
      1. http only need to check port
      2. check port if set new port
      3. If use the same port:
        3.1 check pfx:
            get an avilable port
            use createServer and send option {pfx, passphrase} //passphrase may be need to decrypt
        3.2 check cert & key
            get an avilable port
            use createServer and send option {cert, key}
                
    */
    checkCertificate(data) {
        const type = Object.keys(data)[0];
        const port = data[type].port;
        const originPort = data[Object.keys(data)[1]];
        
        return new Promise((resolve, reject) => {
            this.checkPort(port, originPort).then(res => {
                if(type === 'http') {
                    resolve(res);
                    return;
                }
                // validate the certificate by create a server with new port
                this.createServer(data[type]).then(cer => {
                    resolve({status: true, result: {port: res, cert: cer}});
                    // this.getCertInfo(port);
                }).catch(error => {
                    reject({status: false, result: {port: res, cert: error}});
                    this.logger.severe(`Failed to parse certificate: ${error}`);
                })
            }).catch(err => {
                if(type === 'http') {
                    resolve(err);
                    return;
                }
                reject({status: false, result: {port: err}});
                this.logger.severe(`Failed to check Port`);
            });

        });
    }

    checkPort(port,originPort){
        return new Promise((resolve, reject) => {
            if(originPort === port) {
                resolve({status: true, message: 'The port has not changed!'})
                return;
            }
            portfinder.getPort({port, stopPort:port}, (err, p) => {
                if (err) {
                    this.logger.debug(`The port ${port} is occupied!: ${err}`)
                    reject({status: false, message: 'The port is occupied!', error: err});
                } else {
                    this.logger.debug('Port is free: ' + p)
                    resolve({status: true, message: 'The port is not occupied!'});
                }
            })
        })
    }

    getPort(port = 3000) {
        return new Promise((resolve, reject) => {
          const server = net.createServer()
          server.on('error', (err) => {
           // if (err.code !== 'EADDRINUSE') return reject(err)
            //this.logger.severe(`The port is occupied!: ${err}`);
            if(++port<65536){ //stop the check port  
                server.listen(port,this.hostSpicificIp)
            }else{
                this.logger.severe(`from 3000 to 65535, all ports is occupied!: ${err}`);
            }
          })
          server.on('listening', () => server.close(() => resolve(port)))
          server.listen(port,this.hostSpicificIp)
        })
    }

    createServer(data, tokenUpdated) {
        let _that = this;
        return new Promise((resolve, reject) => {
            let options;
            try {
                options = this.prepareCert(data);
            } catch (err) {
                reject({ status: false, message: 'Failed to prepare certificate info!', error: err });
            }
            // we need to support case that just want to updete the certificates without change the port
            // current port has been occupied by RTE web.
            // So, we need to find a new port to validate the certificate
            this.getPort().then(port => {
                const server = https.createServer(options, function (request, response) {
                    // res.writeHead(200, {
                    //     'Content-Type': 'text/plain'
                    // });
                    // res.send({status: 'Hello HTTP!'});
                }).listen(port, this.hostSpicificIp, () => {
                    server.close();
                    resolve({ status: true, message: 'Certificate info is OK!' });
                });

                server.on('error', function (e) {
                    // Handle your error here
                    _that.logger.severe(`Failed to parse certificate: ${e}`);
                    reject({ status: false, message: 'Failed to parse certificate info!', error: e });
                });
            }).catch(err => {
                _that.logger.severe(`Failed to parse certificate: ${err}`);
                reject({ status: false, message: 'Failed to parse certificate info!', error: err });
            })
        })
    }

    prepareCert(option) {
        const isPFX = Object.keys(option).find(d => d === 'pfx');

        if(isPFX) {
            return {
                pfx: fs.readFileSync(this.getPath(option.pfx)),
                passphrase: this.getToken(option.token, option.tokenUpdated),
                ca: this.readFilesToArray(option.certificateAuthorities)
            };
        } else {
            return {
                cert: this.readFilesToArray(option.certificates),
                key: this.readFilesToArray(option.keys),
                ca: this.readFilesToArray(option.certificateAuthorities)
            }
        }
    }

    getToken(token, tokenUpdated) {
        if(token != null && tokenUpdated) return token;

        if(token) {
            return encryptor.decryptWithKeyAndIV(token, this.en.encode(tokenKey), this.en.encode(tokenIv));             
        }

        const dir = path.join(BASE_PATH, deployDirectory.instanceZluxPath, deployDirectory.serverConfigFolder, 'zluxserver.json');
        const data = jsonUtils.parseJSONWithComments(dir);
        const node = data.node;

        token = (node.https || {}).token;
        try {
            return encryptor.decryptWithKeyAndIV(token, this.en.encode(tokenKey), this.en.encode(tokenIv));  
        } catch(err) {
            this.logger.severe(`Failed to parse token: ${err}`);
            return token || '';
        }
                   
    }

    getPath(name){
        // name contains releative path.
        return path.join(process.cwd(), '/' , name);
    }

    encryptFn(passphrase = '') {
        const en = new util.TextEncoder();
        const https_Token = encryptor.encryptWithKeyAndIV(passphrase, en.encode(tokenKey), en.encode(tokenIv));

        return https_Token;
    }

    decryptFn(token){
        return encryptor.decryptWithKeyAndIV(token, this.en.encode(tokenKey), this.en.encode(tokenIv));  
    }

    getCertInfo(res) {
        // const options = {
        //     host: 'google.com',
        //     port: port,
        //     method: 'GET'
        // };

        // var req = https.request(options, function(res) {
        //     console.log(res.socket.getPeerCertificate());
        // });
        
        // req.end();
        console.log(res.sockt)
    }

    readFilesToArray(fileList) {
        var contentArray = [];
        (fileList || []).forEach(filePath => {
          try {
            contentArray.push(fs.readFileSync(this.getPath(filePath)));
          } catch (e) {
            loggers.bootstrapLogger.warn('Error when reading file='+filePath+'. Error='+e.message);
          }
        });
        if (contentArray.length > 0) {
          return contentArray;
        } else {
          return null;
        }
      };


}

module.exports = Protocol;