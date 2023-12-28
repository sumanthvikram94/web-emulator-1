'use strict';

/**
 * Name:      session-mode-controller.js
 * Desc:      Provide api to return the sessionMode related configurations
 * Author:    Jerry (Jian Gao)
 * Create DT: 2018-11-16
 * Copyright: © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */

const express = require('express');
const Promise = require('bluebird');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');
const request = require('request');
const Utils = require('../../../../bzshared/lib/services/utils.service');
const oAuth = require('../../../../bzshared/lib/services/oauth.service');
const ClusterRequestService = require('../../../../bzshared/lib/services/cluster-request.service');

const DEFAULT_PATH = '/product/ZLUX/pluginStorage/com.rs.bzw/defaults';

const ZLUX_PATH = "/ZLUX";
const PLUGINSTORAGE_PATH = '/ZLUX/pluginStorage';
const BZW_PATH = '/ZLUX/pluginStorage/com.rs.bzw';
const BZADMIN_PATH = '/ZLUX/pluginStorage/com.rs.bzadm';

const PREFERENCE_PATH = BZADMIN_PATH + '/sessionSettings/preference';
const BZADMIN_SESSION_PATH = BZADMIN_PATH + '/sessions';

class AddSessionController {
    constructor(context) {
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        this.instanceDir = context.plugin.server.config.user.instanceDir;
        this.sessionPath = this.instanceDir + BZW_PATH + '/';
        this.utils = Utils.init(this.logger);
        this.requestService = new ClusterRequestService(this.context);
    }

    printContext() {
        this.logger.info(JSON.stringify(this.context));
    }

    /**
     * Gettor of the router
     */
    getRouter() {
        return this.router;
    };

    setupAddSessionRouter() {
        const logger = this.logger;
        const router = this.router;
        logger.info('Setup add session mode router');

        router.use(bodyParser.json({ type: 'application/json' }));

        this.prepareBasicDir();

        router.put('/', async (req, res) => {
            try{
                const data = await this.prepSession(req.body.data, req);
                if (data.status) return res.status(200).json(data);
                return res.status(400).json(data);
            }catch(err){
                this.logger.severe('Put session data failed: ' + err.stack? err.stack: (err.message? err.message: err));
                return res.status(500).json({status: false, message: err.stack? err.stack: (err.message? err.message: err)});
            }
        });

        router.delete('/', async (req, res) => {
            try{
                const data = await this.deleteSession(req.body.data, req);
                if (data.status) return res.status(200).json(data);
                return res.status(400).json(data);
            }catch(err){
                this.logger.severe('Delete session data failed: ' + err.stack? err.stack: (err.message? err.message: err));
                return res.status(500).json({status: false, message: err.stack? err.stack: (err.message? err.message: err)});
            }
        });
    }

    prepareBasicDir() {
        this.createDir(this.instanceDir + ZLUX_PATH);
        this.createDir(this.instanceDir + PLUGINSTORAGE_PATH);
        this.createDir(this.instanceDir + BZW_PATH);
        this.createDir(this.instanceDir + BZADMIN_PATH);
    }


    async prepSession(name, req) {
        const basePath = this.context.plugin.server.config.user.instanceDir;
        const subPath = `${BZADMIN_SESSION_PATH}/session_${name}.json`;
        const SECURITY_BAD_CERTIFICATE_PROMPT = '0';
        const SECURITY_BAD_CERTIFICATE_ALLOW = '1';
        const p3270 = "TN3270E_DEVICE_TYPE_3287_2";
        const sessionTypes = {
            "3270Model2": "TN3270E_DEVICE_TYPE_3278_2",
            "3270Model3": "TN3270E_DEVICE_TYPE_3278_3",
            "3270Model4": "TN3270E_DEVICE_TYPE_3278_4",
            "3270Model5": "TN3270E_DEVICE_TYPE_3278_5",
            "3270dynamic": "TN3270E_DEVICE_TYPE_DYNAMIC",
            "3270Model2_3279": "TN3270E_DEVICE_TYPE_3279_2",
            "3270Model3_3279": "TN3270E_DEVICE_TYPE_3279_3",
            "3270Model4_3279": "TN3270E_DEVICE_TYPE_3279_4",
            "3270Model5_3279": "TN3270E_DEVICE_TYPE_3279_5",
            "3270dynamic_3279": "TN3270E_DEVICE_TYPE_DYNAMIC_3279",            
            "3287Model2": p3270,
            "5250Model3179-2": "TN5250_DEVICE_TYPE_3179_2",
            "5250Model3180-2": "TN5250_DEVICE_TYPE_3180_2",
            "5250Model3196-A1": "TN5250_DEVICE_TYPE_3196_A1",
            "5250Model3477-FC": "TN5250_DEVICE_TYPE_3477_FC",
            "5250Model3477-FG": "TN5250_DEVICE_TYPE_3477_FG",
            "5250Model5251-11": "TN5250_DEVICE_TYPE_5251_11",
            "5250Model5291-1": "TN5250_DEVICE_TYPE_5291 _1",
            "5250Model5292-2": "TN5250_DEVICE_TYPE_5292_2",
            "5250Model5555-B01": "TN5250_DEVICE_TYPE_5555_B01",
            "5250Model5555-C01-132": "TN5250_DEVICE_TYPE_5555_C01_132",
            "5250Model5555-C01-80": "TN5250_DEVICE_TYPE_5555_C01_80",
            '3812Model1': 'TN5250E_DEVICE_TYPE_3812_1',
            '5553ModelB01': 'TN5250E_DEVICE_TYPE_5553_B01',
            "VTlinux": "VT_TERM_TYPE_LINUX",
            "VT220": "VT_TERM_TYPE_VT220",
            "VT320": "VT_TERM_TYPE_VT320",
            "VT420": "VT_TERM_TYPE_VT420",
            "FTP": "FTP_TERM_TYPE_FTP",
            "SFTP": "FTP_TERM_TYPE_SFTP",
            "FTPS" : "FTP_TERM_TYPE_FTPS",
            "FTPES": "FTP_TERM_TYPE_FTPES"
        };
        const localhost = this.utils.getURL(req, this.context);
        return new Promise((resolve, reject) => {
            fs.readFile(path.resolve(basePath + subPath), (err, rep) => {
                if (err) reject(err);
                try {
                    const data = JSON.parse(rep) || {};
                    // console.log('*********session data******', JSON.stringify(data));

                    let session = {
                        "session": {
                            "name": data.name,
                            "TCPHost": data.host,
                            "TCPPort": data.port,
                            //   "active": this.activeSession,
                            "sessionType": sessionTypes[data.type],
                            "sessionAliasType": data.type,
                            //   "sessionAliasType": data.sessionType,
                            "securityType": data.securityType || '0',
                            'is3270Session': data.type.indexOf('3270') > -1 && data.type !== p3270,
                            'is3270pSession': data.type === p3270,
                            'isVTSession': data.type.indexOf('VT') > -1,
                            'is5250Session': data.type.indexOf('5250') > -1 && data.type !== p5250,
                            'is5250pSession': data.type === p5250,
                            'isFTPSession': data.type.indexOf('FTP') > -1,
                            "ftp": data.ftp,
                            "sessionRows": data.rows,
                            'sessionColumns': data.columns,
                            "sessionDefRows": data.defrows,
                            'sessionDefColumns': data.defcolumns,
                            'sessionMaxSize': data.sessionMaxSize,
                            "invalidCertificateHandling": data.invalidCertificateHandling,
                            "scripts": [],
                            "security": {
                                badCert: Number(data.invalidCertificateHandling),
                                type: Number(data.securityType) // TECORE only accept number
                            },
                            "principle": data.principle || '',
                            "luName": data.luName || ''
                            //   "launchpadId": `_${data.name}_launchpad.json`,
                            //   "keyboardMappingId": `_${data.name}_keyboardMapping.json`,
                            //   "hotspotsId": `_${data.name}_hotspots.json`,
                            //   "keyboardMapping": `${data.keyboardMapping}.json`,
                            //   "sessionSettingsMapping": `${data.sessionSettings}.json`
                        }
                    };
                    // console.log(data, 'keyboardMapping and sessionSettings should be update when update this api.');
                    // JSTE-1889 & JSTE-1890:
                    const type = this.getType(data.type);
                    let idObj = {
                        keyboardMappingId: data.keyboardMapping ? `K_${data.keyboardMapping}.json` : `default${type}KeyboardMapping.json`,
                        launchpadId: data.sessionSettings ? `L_${data.sessionSettings}.json` : `default${type}LaunchpadItems.json`,
                        hotspotsId: data.sessionSettings ? `H_${data.sessionSettings}.json` : `default${type}HotspotDefs.json`,
                        preferencesId: data.sessionSettings ? `P_${data.sessionSettings}.json` : `default${type}SessionPreferences.json`,
                        isAdminCreateSession: true // admin create session flag
                    };
                    session.session = Object.assign(session.session, idObj);
                    // console.log('*********session.session******', JSON.stringify(session.session));

                    const sessionContents = {
                        "_metadataVersion": "1.1",
                        "_objectType": "com.rs.bzw.user.sessions",
                        "sessions": { 'session': session.session }
                    };

                    let fileName = `${encodeURIComponent(session.session.name)}.json`;

                    const headers = {};
                    const reqBody = JSON.stringify(sessionContents);
                    Object.assign(headers, req.headers);
                    headers['content-length'] = Buffer.from(reqBody).length;
                    headers['master-node'] = localhost;
                    headers['cluster-auth-token'] = oAuth.getDefaultTokenBase64();
                    headers['username'] = 'superadmin';
                    // headers['Content-Type'] = 'application/json';
                    let options = {
                        url: localhost + '/ZLUX/plugins/com.rs.bzshared/services/userResource/sessionShared?name=' + fileName,
                        method: 'PUT',
                        headers: headers,
                        body: reqBody
                    };
                    options=this.httpsOption(options);
                    request(options, (err, response, body) => {
                        if (!err && response && response.statusCode ) {
                            return resolve({ status: true, message: `Write file ${fileName} successful` });
                        }else if (err) {
                            return reject({ status: false, message: `Write file ${fileName} failed: ${err.message}` });
                        }else {
                            return reject({ status: false, message:'Unknown Internal Error'});
                        }
                    });
                } catch (err) {
                    this.logger.severe("Error:prepSession(), error message is " + err.stack);
                    reject(err);
                }
            });
        });
    }

    getType(type) {
        if (type.indexOf('3270') > -1) {
            return '3270';
        } else if (type.indexOf('5250') > -1) {
            return '5250';
        } else if (type.indexOf('3287') > -1) {
            return 'Printer';
        } else {
            return 'VT';
        }
    }

    // dir is folder name(sessions, keyboardMapping, hotspotDefs, launchpad),  name is file name
    async deleteSession(name, req) {
        const paths = [{ folder: 'sessions', file: name }/*, {folder: 'keyboardmapping', file: `_${name}_keyboardMapping`},
    {folder: 'hotspots', file: `_${name}_hotspots`}, {folder: 'launchpad', file: `_${name}_launchpad`}*/];
        
        const localhost = this.utils.getURL(req, this.context);
        return new Promise((resolve, reject) => {
            paths.forEach(d => {
                let fileName = `${d.file}.json`;
                const headers = {};
                Object.assign(headers, req.headers);
                headers['master-node'] = localhost;
                headers['cluster-auth-token'] = oAuth.getDefaultTokenBase64();
                headers['username'] = 'superadmin';
                let options = {
                    url: localhost + '/ZLUX/plugins/com.rs.bzshared/services/userResource/sessionShared?name=' + fileName,
                    method: 'DELETE',
                    headers: headers
                };
                options=this.httpsOption(options);
                request(options, (err, response, body) => {
                    if (!err && response && response.statusCode ) {
                        return resolve({ status: true, message: `Delete file ${fileName} successful` });
                    }else if (err) {
                        return reject({ status: false, message: `Delete file ${fileName} failed: ${err.message}` });
                    }else {
                        return reject({ status: false, message:'Unknown Internal Error'});
                    }
                });

            })
        });
    }

    createDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
    }
    httpsOption(requestOptions){
        const isHttps=requestOptions.url.toLowerCase().indexOf("https")===0?true:false;
        if(isHttps){
            Object.assign(requestOptions,{"agentOptions":{"rejectUnauthorized":false}});  //todo, use this to https error CERT_HAS_EXPIRED   
        }
        return requestOptions;
      }
}


exports.addSessionRouter = (context) => {
    return new Promise(function (resolve, reject) {
        let controller = new AddSessionController(context);
        controller.setupAddSessionRouter();
        resolve(controller.getRouter());
    });
};