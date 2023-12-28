
/**
 * Name:      session-mode-controller.js
 * Desc:      Provide api to return the sessionMode related configurations
 * Copyright: © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */

// import {authSuper} from './../../../../../lib/auth/authSuper';

const express = require('express');
const session = require('express-session');
const Promise = require('bluebird');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const authFile='/ZLUX/pluginStorage/com.rs.bzadm/_internal/services/auth/spadmahtctidt.json';
const userDataServiceFile= require('../../services/userDataServiceFile');
const authConfigService=require("../../../../bzshared/lib/services/authConfigService")
const rKey = Buffer.from([45, 116, 154, 81, 215, 123, 211, 238, 143, 184, 191, 134, 142, 53, 69, 143, 192, 179, 40, 219, 10, 83, 145, 72, 199, 67, 146, 248, 2, 245, 190, 113]);
const rIV = Buffer.from([0, 33, 80, 130, 76, 138, 194, 49, 111, 167, 21, 126, 242, 99, 37, 21]);
const zoweService = require('../../../../bzshared/lib/services/zowe.service');
const encryption = zoweService.encryption;
const NAME = 'superadmin';
const PASSWORD = 'pa55word';

class AuthRouter {
    constructor(context){
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        this.productDir = this.context.plugin.server.config.user.productDir;;
        authConfigService.init(context).then((obj)=>{
            this.authConfigObj=obj;
            this.userDataService = userDataServiceFile.init(context,this.authConfigObj);
        })
        this.app = express();
        this.app.use(session({
            secret: 'bluezone administrator',
            name: 'bluezone-admin',
            resave: false,
            saveUninitialized: true,
            cookie: { 
                maxAge: 1000 * 60 * 60 
            }  
        }));
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


    getAuthRouter() {
        const logger = this.logger;
        const router = this.router;
        const context = this.context;
        logger.info('Setup auth router');
        // const date = new Date();
        router.use(bodyParser.json({type:'application/json'}));
        
        router.post('/', (req, res) => {
            // const username = response.body.userId;
            this.parsePassword(req, res).then(req => {
                if (req.success) {
                    res.status(200).json({success: req.success, message: req.message, init: req.init || false}); 
                    logger.info(`login bzadm successfully`);
                } else {
                    res.status(400).json({success: false, message: req.message});
                    logger.severe(`login bzadm failed: ${req.message || 'unknown error'}`);
                }
            });
        });

        router.post('/logout', (req, res) => {
            // const dir = this.getPath(req);
           // console.log(req, 'post');
           req.session.destroy();
           res.status(200).json({success: true, message: 'logout successfully.'}); 
           logger.info(`logout bzadm successfully`);
        });
        router.put('/changePassword', (req, res) => {
            // const dir = this.getPath(req);
           // console.log(req, 'post');
              
              this.changePassword(req, res);
          });

        router.get('/', (req, res) => {
            if(req.session.administrator) {
                res.status(200).json({authenticated: true, username: req.session.administrator, message: "already logged"});
                logger.info(`Already logged in bzadm`);
            } else {
                res.status(200).json({authenticated: false, message: " have not been login"}); 
                logger.warn(`Have not been logged in yet`);
            }
        })
    }

    // getURL(req) {
    //     return `${req.protocol}://${req.headers.host}`;
    // }

    changePassword(req, res) {
        const timeStamp = new Date().getTime();
        // console.log(req, data, 'put');

        const options = {
            timeStamp: timeStamp,
            userId: req.body.username,
            password: req.body.password,
            actionType: 'edit',
            path: this.productDir + authFile,
            init: false,
            async:'false'
        }
        
        this.userDataService.changePassword(req, res, options).then(pros => {
            const result = pros[0];
            if (result && result.status === true) {
                res.status(201).json({ success: true, message: 'change password successful' });  
                this.logger.info('Change password successful');
            } else {
                res.status(500).json({ success: false, message: result.message});
                this.logger.severe('Change password failed');
            }
        });
    }

    createInitFile(req, res) {
        const path = this.productDir + authFile;
        const timeStamp = new Date().getTime();
        
        fs.openSync(path, 'a'); // 'a' is openSync parameter which could create file if not exist and don't overwriter if exist

        const options = {
            timeStamp: timeStamp,
            userId: NAME,
            password: PASSWORD,
            actionType: 'edit',
            path: path,
            init: true
        }
        
        this.userDataService.changePassword(req, res, options).then((pros)=>{
            // console.log(pros, 'login json is missing, create file again');
        });
    }

    parsePassword(req, res) {
        req.body = Object.assign(req.body, this.getAuth(req.headers.authorization));

        const path = this.productDir + authFile;
        const username = req.body.username;
        const password = req.body.password;
       
        if (!fs.existsSync(path)) {
            this.createInitFile(req, res);

            return new Promise((resolve, reject) => {
                resolve({ success: false, message: "Since login file is missing, please sign on via initialization password"});
            });
        }

        const userLoginData = JSON.parse(fs.readFileSync(path));
        
        return new Promise ((resolve, reject) => {
            if (userLoginData.username === username) {
                try {
                    let iv = encryption.decryptWithKeyAndIV(userLoginData.iv, rKey, rIV);
                    let salt = encryption.decryptWithKeyAndIV(userLoginData.salt, rKey, rIV);

                    const key = encryption.getKeyFromPasswordSync(password, salt, 32);

                    try {
                        let result = encryption.decryptWithKeyAndIV(userLoginData.authentication, key, iv);
                        if (result === password) {
                            resolve({success: true, message: "sign on successfully.", init: userLoginData.init});
                            req.session.administrator = username;    
                            resolve({success: true, message: "sign on successfully."});
                        } else {
                            resolve({ success: false, message: "Incorrect userId / password." });
                        }
                    } catch (e) {
                        resolve({ success: false, message: e && e.message || 'unknown error' });
                    }

                } catch (e) {
                    resolve({ success: false, message: "Decrypt User authentication info from login.json failed." });
                }
            } else {
                resolve({ success: false, message: "Incorrect userId / password."});
            }
            });
    }

    setSessionState (sessionState, username) {
        sessionState.userName = username;
        sessionState.authenticated = true;
    }

    initSessionOpts() {
        req.session.secret = 'bluezone administrator';
        req.session.name = 'bluezone-admin';
        req.session.resave = false;
        req.session.saveUninitialized = true;
        req.session.cookie = { 
            maxAge: 1000 * 20 
        };
    }

    getAuth(auth) {
        const EMPTYPASSWORD='';
        if (!auth || auth.indexOf('Basic') == -1) {
            return {
                username: '',
                password: EMPTYPASSWORD
            };
        }
        let authStr = Buffer.from(auth.substring(6), 'base64').toString('ascii');
        let authArr = authStr.split(':');
        return {
            username: authArr[0],
            password: authArr[1]
        };
    }
}


exports.authRouter = (context) => {
    return new Promise (function (resolve,reject) {
      let controller = new AuthRouter(context);
      controller.getAuthRouter();
      resolve(controller.getRouter()); 
    });
  };