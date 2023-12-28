'use strict';

/**
 * Name:      account-controller.js
 * Desc:      Setup router for account/role related requests. This is a refactor of legacy code: accountManagement.js
 * Author:    Jerry (Jian Gao)
 * Create DT: 2018-08-06
 * Copyright: © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */

const express = require('express');
const Promise = require('bluebird');
const bodyParser = require('body-parser');
const acctSrc = require('./account-service');
const constants = require('./constants');
const fse = require('fs-extra');
const fs = fse;
const zoweService = require('../../services/zowe.service');
const jsonUtils = zoweService.jsonUtils;
const Security = require('../../services/security.service');

class AccountController {

  
  constructor(context) {
    this.context = context;
    this.logger = context.logger;
    this.router = express.Router();
  }

  /**
   * Created for debugging purpose only. 
   */
  printContext() {
    this.logger.info(JSON.stringify(this.context));
  }

  /**
   * Gettor of the router
   */
  getRouter() {
    return this.router;
  };


  /**
   * Setup the express router for user registrition:
   * /register 
   */
  setupRegisterRouter() {

    // Local variables defination
    const logger = this.logger;
    const router = this.router;

    // Debugging output
    logger.info('Setup User Register');
    // this.logger.info(JSON.stringify(req.body));
    // this.logger.info(req.body.username);
    // this.logger.info(req.body.password);
    // this.logger.info(JSON.stringify(this.context);
    // this.logger.info(this.context.plugin.server.config.user.usersDir);
    // this.logger.info(this.context.plugin.server.config.app.productCode);

    // Parsing the request body as JSON
    router.use(bodyParser.json({ type: 'application/json' }));
    // router.use(bodyParser.text({type:'text/plain'}));
    // router.use(bodyParser.text({type:'text/html'}));

    /**
     * Request:     Healthcheck for accounts api. 
     * Description: Simply response a fixed text.
     * Authorize:   Any user???
     */
    router.get('/healthcheck', (req, res) => {
      res.status(200).send('register api works!');
    });

    /**
     * Request:     User registrition  
     * Description: Create a new user 
     * Authorize:   Any user???
     */
    router.post('/', (req, res) => {

      req.body = Object.assign(req.body, acctSrc.getAuth(req.headers.authorization));

      if (!req.body) {
        return res.sendStatus(400).json({ 'error': 'invalid request' });
      } else if (!req.body.userId || !req.body.password) {
        return res.status(400).json({ 'error': 'username or password not given' });
      }

      const usersDir = this.context.plugin.server.config.user.usersDir;
      const prodCode = this.context.plugin.server.config.app.productCode;
      const acctLoginfile = '/account/';
      const defaultCredentialLocation = usersDir + '/' + req.body.userId + '/' + prodCode + acctLoginfile;
      const userLoginFile = defaultCredentialLocation + 'login.json';

      const successData = { 'data': 'created' };
      acctSrc.createUser(req.body, userLoginFile, () => {
        res.status(201).json(successData);
      }, (failCode) => {
        switch (failCode) {
          case constants.AccountHandler_ERROR_CREATING_USER:
            res.status(500).json({ 'error': 'Crypto error when creating user' });
            break;
          case constants.AccountHandler_ERROR_FILE_IO:
            res.status(500).json({ 'error': 'I/O error when creating user' });
            break;
          case constants.AccountHandler_ERROR_USER_EXISTS:
            res.status(400).json({ 'error': 'user already exists' });
            break;
          default:
            res.status(500).json({ 'error': 'unknown error occurred' });
        }
      });
    });

    router.put('/syncLogin', async (req, res) => {
      if (!req.body) {
        return res.sendStatus(400).json({ 'error': 'invalid request' });
      } else if (!req.body.userId) {
        return res.status(400).json({ 'error': 'username or password not given' });
      }
     

      const usersDir = this.context.plugin.server.config.user.usersDir;
      const prodCode = this.context.plugin.server.config.app.productCode;
      const acctLoginfile = '/account';
      const defaultCredentialLocation = usersDir + '/' + encodeURIComponent(req.body.userId) + '/' + prodCode + acctLoginfile;
      // const userLocation = usersDir + '/' + req.body.userId;
      const userLoginFile = defaultCredentialLocation + '/login.json';
      const userInfoFile = defaultCredentialLocation + '/userInfo.json';
      const authType = req.body.authType;
      const value = {
        timeStamp: req.body.timeStamp || '',
        userId: req.body.userId || '',
        userName: req.body.username || '',
        password: req.body.password || '',
        mail: req.body.mail || '',
        phone: req.body.phone || '',
        groupNames: req.body.groupNames || [],
        logicUnit: req.body.logicUnit || []
      };
      this.setLu(req.body, value);
      // for upgrade
      if(req.body.fromImport || (req.body.authentication && req.body.iv && req.body.salt)){
        value.authentication = req.body.authentication;
        value.iv = req.body.iv;
        value.salt = req.body.salt;
        value.fromImport = req.body.fromImport || false;
      }
      const options = {
        value: value,
        userLoginFile: userLoginFile,
        userInfoFile: userInfoFile,
        defaultCredentialLocation: defaultCredentialLocation
      }
      this.handlerUsers(res, req, options, this.logger);
    });

    router.delete('/syncDelete', (req, res) => {
      if (!req.body) {
        return res.sendStatus(400).json({ 'error': 'invalid request' });
      }
      let id = encodeURIComponent(req.body.id);
      let username = req.body.id;
      const successDeleteData = { 'status': true, 'message': 'Deleted user successed' };
      const failedDeleteData = { 'status': false, 'message': 'Deleted user Failed' };
      const usersDir = this.context.plugin.server.config.user.usersDir;
      const prodCode = this.context.plugin.server.config.app.productCode;
      const acctLoginfile = '/account';
      let defaultCredentialLocation = usersDir + '/' + id + '/' + prodCode + acctLoginfile;
      let userLocation = usersDir + '/' + id;
      let userLoginFile = defaultCredentialLocation + '/login.json';
      let userInfoFile = defaultCredentialLocation + '/userInfo.json';

      try{ // Ensure security
        defaultCredentialLocation = Security.sanitizePath(defaultCredentialLocation);
        userLocation = Security.sanitizePath(userLocation);
        userLoginFile = Security.sanitizePath(userLoginFile);
        userInfoFile = Security.sanitizePath(userInfoFile);
      } catch(e) {
        res.status(500).send('Illegal path');
        return;
      }

      if (fs.existsSync(userLoginFile)) {
        const userLoginData = jsonUtils.parseJSONWithComments(userLoginFile);
        if (username === userLoginData.username) {
          // delete folder with content
          fse.removeSync(userLocation);
          res.status(201).json(successDeleteData);
        } else {
          res.status(400).json(failedDeleteData);
        }
      }else if (fs.existsSync(userInfoFile)) {
        const userInfoData = jsonUtils.parseJSONWithComments(userInfoFile);
        if (username === userInfoData.userId) {
          // delete folder with content
          fse.removeSync(userLocation);
          res.status(201).json(successDeleteData);
        } else {
          res.status(400).json(failedDeleteData);
        }
      }else {
        this.logger.severe('Error: syncDelete(); userInfo URL is '+userInfoFile +'userlogin URL is'+ userLoginFile +'error is the login file and userInfo file do not exisit.');
        res.status(400).json({status: false, message: 'The login file and userInfo file do not exisit.'});
      }

    });

    router.put('/syncEditUser', (req, res) => {
      if (!req.body) {
        return res.sendStatus(400).json({ 'error': 'invalid request' });
      }
      const editData = {
        timeStamp: req.body.timeStamp || '',
        userId: req.body.userId || '',
        userName: req.body.username || '',
        mail: req.body.mail || '',
        phone: req.body.phone || '',
        groupNames: req.body.groupNames || [],
        logicUnit: req.body.logicUnit || []
      };
      this.setLu(req.body, editData);
      let id = encodeURIComponent(editData.userId);
      const successEditData = { 'status': true, 'message': "sync edit user successed" };
      const failedEditData = { 'status': false, 'message': "sync edit user failed." };
      const usersDir = this.context.plugin.server.config.user.usersDir;
      const prodCode = this.context.plugin.server.config.app.productCode;
      const acctLoginfile = '/account';
      const defaultCredentialLocation = usersDir + '/' + id + '/' + prodCode + acctLoginfile;
      const userLocation = usersDir + '/' + id;
      let userInfoFile = defaultCredentialLocation + '/userInfo.json';
      
      try{
        userInfoFile = Security.sanitizePath(userInfoFile) // Ensure security
      }catch(e){
          res.status(500).send('Illegal path');
          return;
      }
    
        try {
          fs.writeFile(userInfoFile, JSON.stringify(editData), function (err) {
            if (err) {
              logger.severe('Error: syncEditUser(); URL is '+userInfoFile+'error is userInfo file does not exist');
              res.status(400).json(failedEditData);
            } else {
              logger.info('syncEditUser(); URL is '+userInfoFile+'data is'+JSON.stringify(editData));
              res.status(201).json(successEditData);
            }
          })
        } catch (error) {
          logger.severe('Error: syncEditUser(); URL is '+ userInfoFile +'error is '+ error.stack);
          res.status(400).json(failedEditData);
        }

    });

    router.put('/syncResetPassword', (req, res) => {
      if (!req.body) {
        return res.sendStatus(400).json({ 'error': 'invalid request' });
      }
      const successResetData = { 'status': true, 'message': "sync reset password successed" };
      const failedEditData = { 'status': false, 'message': "sync edit user failed." };
      const usersDir = this.context.plugin.server.config.user.usersDir;
      const prodCode = this.context.plugin.server.config.app.productCode;
      const acctLoginfile = '/account/';
      const defaultCredentialLocation = usersDir + '/' + encodeURIComponent(req.body.userId) + '/' + prodCode + acctLoginfile;
      const userLoginFile = defaultCredentialLocation + 'login.json';

      try {
        acctSrc.editUser(req.body, userLoginFile, () => {
          this.logger.info('Error: syncResetPassword(); URL is '+ userLoginFile + 'data is' + JSON.stringify(req.body));
          res.status(201).json(successResetData);
        }, (failCode) => {
          switch (failCode) {
            case constants.AccountHandler_ERROR_CREATING_USER:
              this.logger.severe('Error: syncResetPassword(); URL is '+ userInfoFile +'Error is Crypto error when creating user');
              res.status(500).json({ 'error': 'Crypto error when creating user' });
              break;
            case constants.AccountHandler_ERROR_FILE_IO:
              this.logger.severe('Error: syncResetPassword(); URL is '+ userInfoFile +'Error is I/O error when creating use');
              res.status(500).json({ 'error': 'I/O error when creating user' });
              break;
            case constants.AccountHandler_ERROR_USER_EXISTS:
              this.logger.severe('Error: syncResetPassword(); URL is '+ userInfoFile +'Error is user already exists');
              res.status(400).json({ 'error': 'user already exists' });
              break;
            default:
              logger.severe('Error: syncResetPassword(); URL is '+ userInfoFile +'Error is unknown error occurred');
              res.status(500).json({ 'error': 'unknown error occurred' });
          }
        });
      } catch (error) {
        this.logger.severe('Error: syncResetPassword(); URL is '+ userInfoFile +'error is '+ error.stack);
          res.status(400).json(failedEditData);
      }
    });
  };

  async handlerUsers (res, req, options, logger) {
    const successData = { 'status': true, 'message': 'Create user successed' };
    const failedData = { 'status': false, 'message': 'Create user Failed' };
    const data = options.value;
    
    if (!fs.existsSync(options.defaultCredentialLocation)) {
        fse.mkdirs(options.defaultCredentialLocation);
      }
    if (fs.existsSync(options.userLoginFile)) {
      acctSrc.editUser(data, options.userLoginFile, () => {
      this.handlerCreateUserInfo(res, data, options.userInfoFile, logger);
      }, (failCode) => {
        res.status(201).json(failedData);
      });
    }else {
      acctSrc.createUser(data, options.userLoginFile, () => {
        this.handlerCreateUserInfo(res, data, options.userInfoFile, logger);
     }, (failCode) => {
       res.status(201).json(failedData);
     });
    }
  }

  handlerCreateUserInfo(res, data, path, logger) {
    const successData = { 'status': true, 'message': 'Create user successed' };
    const failedEditData = { 'status': false, 'message': "sync edit user failed." };
    if (data.userId !== undefined) {
      const valueObj = {
        userId: data.userId,
        userName: data.userName,
        mail: data.mail,
        phone:data.phone,
        groupNames: data.groupNames,
        logicUnit:  data.logicUnit
      }
      // const keys = Object.keys(data);
      this.setLu(data, valueObj);
      const userData = JSON.stringify(Object.assign(valueObj));
      fs.writeFile(path, userData, function (err) {
        if (err) {
          logger.severe('Error: handlerCreateUserInfo(); URL is '+path+'error is' + failedEditData);
          res.status(400).json(failedEditData);
        }else {
          logger.info('handlerCreateUserInfo(); URL is '+path+'data is'+JSON.stringify(data));
          res.status(201).json(successData);
        }
       
      });
    }
  }

  setLu(originObj, newObj) {
    const luKeys = Object.keys(originObj).filter(d => d.indexOf('LU') > -1);

    luKeys.forEach(d => {
      newObj[d] = originObj[d]
    });
  }

  /**
   * Setup the express router for account operations:
   * /login 
   * /users
   * /setpw
   * /roles
   */
  setupAcctRouter() {

    // Local variables defination
    const logger = this.logger;
    const router = this.router

    // Debugging output
    logger.info('Setup Account Router');
    // this.logger.info(JSON.stringify(req.body));
    // this.logger.info(req.body.username);
    // this.logger.info(req.body.password);
    // this.logger.info(JSON.stringify(this.context);
    // this.logger.info(this.context.plugin.server.config.user.usersDir);
    // this.logger.info(this.context.plugin.server.config.app.productCode);

    // Parsing the request body as JSON
    router.use(bodyParser.json({ type: 'application/json' }));
    // router.use(bodyParser.text({type:'text/plain'}));
    // router.use(bodyParser.text({type:'text/html'}));

    /**
     * Request:     Healthcheck for accounts api. 
     * Description: Simply response a fixed text.
     * Authorize:   Any user???
     */
    router.get('/healthcheck', (req, res) => {
      res.status(200).send('account api works!');
    });

    /**
     * Request:     Response for login request 
     * Description: This is simply a response after authentication. Authentication is not included here. 
     * Authorize:   Any user
     */
    router.post('/login', (req, res) => {
      res.status(200).send(true);
    });

    /**
     * Request:     Create new user
     * Description: Same as /rigister in old code. We should modify this as a batch user creation, pass the users list in request body
     * Authorize:   Administrator only
     */
    router.put('/users/:username', (req, res) => {
      // Old code as below: 
      //
      // if (urlParts.length == 2) {
      //   t.createUserRequest(urlParts[1],request,response,body);
      // }
      // else {
      //   response.status(400).json({'error':'unknown request'});      
      // }  
      res.status(501).json({ "error": "not implemented" });
    });

    /**
     * Request:     Delete the given user
     * Description: We should modify this as batch user deletion, pass the users list in request body 
     * Authorize:   Administrator only
     */
    router.delete('/users/:username', (req, res) => {
      // old code as below:
      //
      // if (urlParts.length == 2) {
      //   t.deleteUserRequest(urlParts[1],request,response,body);
      // }
      // else {
      //   response.status(400).json({'error':'unknown request'});      
      // }   
      res.status(501).json({ "error": "not implemented" });
    });

    /**
     * Request:     List all users
     * Description: 
     * Authorize:   Administrator only
     */
    router.get('/users', (req, res) => {
      // Old code as below:
      //
      // if (urlParts.length == 1) {
      //   t.listUsers(request,response);
      // }
      // else {
      //   response.status(400).json({'error':'unknown request'});      
      // }      
      res.status(501).json({ "error": "not implemented" });
    });

    /**
     * Request:     Reset password for a given user
     * Description: Not implemented in old code
     * Authorize:   Any user can do for him/herself, administrator can do for any user
     */
    router.put('/setpw/:username/:passowrd', (req, res) => {
      // Old code as below:
      //
      // //TODO
      // if (urlParts.length > 2) {
      //   response.status(400).json({'error':'unknown request'});              
      // }
      // else {
      //   var username = null;
      //   if (urlParts.length == 2) {
      //     username = urlParts[1];
      //   }
      //   else {
      //     username = authData.username;
      //   }
      // }
      // //TODO
      // response.status(501).json({"error": "not implemented"});      
      res.status(501).json({ "error": "not implemented" });
    });

    /**
     * Request:     List users with the given role
     * Description: 
     * Authorize:   Administrator only
     */
    router.get('/roles/:role/users', (req, res) => {
      // Old code as below:
      //
      // t.getUsersForRoleRequest(urlParts[1],request,response);
      res.status(501).json({ "error": "not implemented" });
    });

    /**
     * Request:     Modify users list in given role
     * Description: Users list is passed in request body
     * Authorize:   Administrator only
     */
    router.post('/roles/:role/users', (req, res) => {
      // Old code as below:
      //
      // t.modifyUsersInRoleRequest(urlParts[1],request,response,body);
      res.status(501).json({ "error": "not implemented" });
    });

    /**
     * Request:     Create a new role
     * Description: 
     * Authorize:   Administrator only
     */
    router.put('/roles/:role', (req, res) => {
      // Old code as below:
      //
      // t.createRole(urlParts[1],request,response,body);
      res.status(501).json({ "error": "not implemented" });
    });

    /**
     * Request:     Delete a role
     * Description: 
     * Authorize:   Administrator only
     */
    router.delete('/roles/:role', (req, res) => {
      // Old code as below:
      //
      // t.deleteRole(urlParts[1],request,response);
      res.status(501).json({ "error": "not implemented" });
    });

    /**
     * Request:     List all roles
     * Description: 
     * Authorize:   Administrator only
     */
    router.get('/roles', (req, res) => {
      // Old code as below:
      //
      // t.listRoles(request,response);
      res.status(501).json({ "error": "not implemented" });
    });

  };



  /**
  * Invokes the setupRouter()
  */
  // this.setupRouter();

};

exports.accountRouter = (context) => {
  return new Promise(function (resolve, reject) {
    let controller = new AccountController(context);

    // Print the context for debug.
    // controller.printContext();
    controller.setupAcctRouter();
    resolve(controller.getRouter());
  });
};

exports.registerRouter = (context) => {
  return new Promise(function (resolve, reject) {
    let controller = new AccountController(context);

    // Print the context for debug.
    // controller.printContext();
    controller.setupRegisterRouter();
    resolve(controller.getRouter());
  });
};
