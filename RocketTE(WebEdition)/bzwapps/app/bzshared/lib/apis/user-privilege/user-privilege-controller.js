'use strict';

/**
 * Name:      user-privilege-controller.js
 * Desc:      Provide api to return the sessionMode related configurations
 * Author:    Furong Liu
 * Create DT: 2019-01-07
 * Copyright: © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */

const express = require('express');
//const cors = require('cors');
const Promise = require('bluebird');
const bodyParser = require('body-parser');
const zoweService = require('../../services/zowe.service');
// const jsonUtils = zoweService.jsonUtils;
const ldapHelper = zoweService.ldapHelper;
const mssqlHelper = zoweService.mssqlHelper;
// const path = require('path');
// const ClusterRequestService = require('../../services/cluster-request.service');
const resourceLoadService = require('../../services/resource-load.service');
const bzdb = require('../../services/bzdb.service');
const constants = require('../../services/constants.service');
const encryption = require('../../services/encryption.service');
const userSrc = require('../user-resource/user-resource-service');
const authConfigSv = require('../../services/authConfigService');
const UserVarSvc = require('../../dist/user-var-service');
const jsonParser = bodyParser.json();
const Utils = require('../../services/utils.service');
// const GROUP_ID_MANAGER = "id_manager.json";
// const PATH_BZA_DATA_SOURCE_SETTING = '/ZLUX/pluginStorage/com.rs.bzw/configurations/dataSourceSetting.json';
const DEFAULT_GROUP = 'Default Group';
const errorHandler = require('../../services/error.service.js');


class UserPrivilegeController {
  constructor(context) {
    this.context = context;
    this.logger = context.logger;
    this.router = express.Router();
    this.defaultDataSource = { "defaultDataSource": 'fallback' };
    this.getDataSource().then((data)=>{
      this.dataSourceConfig = data.dataserviceDataSource || this.defaultDataSource;
      //this.dataSourceConfig = (!!this.dataSourceConfig) ? this.dataSourceConfig : this.defaultDataSource;
      if(this.dataSourceConfig.defaultDataSource==="ldap" || this.dataSourceConfig.defaultDataSource==="mssql"){
        this.dataSourceConfig.implementationDefaults=encryption.decryptAuthObj(this.dataSourceConfig.implementationDefaults,this.dataSourceConfig.defaultDataSource);
      }
    })
    // this.clusterReqService = new ClusterRequestService(context);
    this.user = context.plugin.server.config.user;
    this.dataAuthentication = this.user.dataserviceAuthentication;
    this.isBzw2hMode = this.context.plugin.server.config.user.bzw2hMode || false;
    this.userVarSvc = UserVarSvc.init(context); // BZ-19424, script variable
    this.utils = Utils.init(this.logger);
    resourceLoadService.startChecking();
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

  setupUserPrivilegeRouter() {
    const logger = this.logger;
    const router = this.router;
    logger.info('Setup user privilege router');

    //router.use(cors());
    router.use(express.json({ type: 'application/json' }));

    // router.use((req, res, next) => {
    //   this.clusterReqService.redirectSlaveRequest(req, res, next);
    // });

    router.get('/', async (req, res) => {
      try {
        const privilege = await this.getPrivilegeByHttpGet(req, res);
        this.logger.debug(`Get user privilege: ${JSON.stringify(privilege)}`);
        res.status(200).json(privilege);
      }
      catch(err) {
        errorHandler.handleInternalError(err, res, this.logger, 202);
      }
    });

    /*
      this will return 3 type of data
      1: {privilege} means this is an json object which is plain-text
      2: {"_obj":privilege,signature} means it return a base64 text+Signature
    */
    router.post('/', jsonParser, async (req, res) => {
      try {
        let privilege = await this.getPrivilegeByHttpPost(req, res);
        this.logger.debug(`Get user privilege: ${JSON.stringify(privilege)}`);
        //comment out, since it will cause the print setting privilege issue which treat null as true in front .
        //privilege=this.removeFalseKey(privilege); //remove the false and undefined key
        //cover to binary then string to base64
        const str=JSON.stringify(privilege);
        const signature=this.utils.simpleSignature(str);
        privilege=Buffer.from(str, 'binary').toString('base64')
        return res.status(200).send({"_obj":privilege,signature});
      }
      catch(err) {
        // 202: Accepted. The request has been accepted for processing, but the processing has not been completed
        errorHandler.handleInternalError(err, res, this.logger, 202);
      }
    });


    

    router.get('/groups', async (req, res) => {
      try {
        const userGroup = await this.getUserGroup(req, res);
        res.status(200).json({ data: userGroup.groups});
      }
      catch (err) {
        errorHandler.handleInternalError(err, res, this.logger, 202);
      }
    });
  }

  removeFalseKey(obj){
    Object.keys(obj).forEach(k =>
      (obj[k] && typeof obj[k] === 'object') && this.removeFalseKey(obj[k]) ||
      (!obj[k] && obj[k] !== undefined) && delete obj[k]
    );
    return obj;
  };

  async getPrivilegeByHttpGet(req, res) {
    const userIdBase64 = req.query.userId || '';
    const userId = Buffer.from(userIdBase64, 'base64').toString('ascii');
    return await this.getPrivilegeByUserId(userId, req, res);
  }

  async getPrivilegeByHttpPost(req, res) {
    const data = Object.assign(req.body, this.getAuth(req.headers.authentication || req.headers.authorization, req.headers.type));
    const userId = data.username || '';
    return await this.getPrivilegeByUserId(userId, req, res);
  }

  async getUserGroup(req, res) {
    const userIdBase64 = req.query.userId || '';
    const userId = Buffer.from(userIdBase64, 'base64').toString('ascii');
    // TO DO: BZW2H need send groupId in req
    return await this.getGroupUserInfoByUidAndGid(userId, DEFAULT_GROUP, req, res);
  }

  async getPrivilegeByUserId(userId, req, res) {
    this.logger.info(`Get user privilege: ${userId}`);
    const groupId = req.body.groupId; // gid from URL parametes 'groupName'
    const gid4w2h = req.query.gid4w2h; // gid of selected group for w2h, from bza-data.service.js
    const userGroup = await this.getGroupUserInfoByUidAndGid(userId, (groupId || gid4w2h) /*BZ-21245*/, req, res);
    const userVars = await this.userVarSvc.getVarsByUserId(userId); // BZ-19424, script variable

    if(userId && userGroup.userInfo && userGroup.userInfo.nonexistence) {
      return {
        privilege: {
          userInfo: userGroup.userInfo,
          userVars: userVars, // BZ-19424, script variable
          groups: [],
          dataSource: this.dataSourceConfig.defaultDataSource
        }
      }
    }

    if (this.isUrlParamMatchGroup() && 0 === userGroup.groups.length) { // BZ-21116, support ?groupName=xxx for other auth
      const gidTmp = groupId || gid4w2h;
      userGroup.groups = gidTmp ? [gidTmp] : [];
    }

    if (this.isBzw2hMode && userId && gid4w2h && userGroup.groups.length > 1) { //W2h only . For BZ-13819.
      userGroup.groups = userGroup.groups.filter(g => g === gid4w2h);
    }
    this.logger.info("getGroupUserInfoByUidAndGid() return privilegeGroups is: " + JSON.stringify(userGroup))
    const privilege = await this.getSessionPrivilege(userId, userGroup.groups);
    privilege.userInfo = userGroup.userInfo;
    privilege.userVars = userVars; // BZ-19424, script variable
    privilege.groups = userGroup.groups;
    privilege.dataSource = this.dataSourceConfig.defaultDataSource;
    return { privilege: privilege };
  }
  
  async getGroupUserInfoByUidAndGid(userId, groupId, req, res) {
    const authConfig = this.user.dataserviceAuthentication;
    if (authConfig.isAnonymousAccessAllowed) {
      return { userInfo: { userId: userId }, groups: groupId ? [groupId] : [] };
    } else if (authConfig.onlyDefaultGroupMode || zoweService.isOnZowe) { // Use default group on ZOWE
      return { userInfo: await this.getUserInfoByUserId(userId), groups: [DEFAULT_GROUP] };
    } else if (this.dataSourceConfig.defaultDataSource === 'fallback') {
      return await this.getInternalGroup(req ,userId, res);
    } else if (this.dataSourceConfig.defaultDataSource === 'ldap') {
      return await this.getLdapGroup(userId);
    } else if (this.dataSourceConfig.defaultDataSource === 'sso') {
      return await this.getSSOGroup(req ,userId, res);
    } else if (this.dataSourceConfig.defaultDataSource === 'mssql') {
      return await this.getMssqlGroup(req,userId);
    } else {
      return { userInfo: { userId: userId }, groups: [] };
    }
  }

  isSSOSource() {
    return this.dataSourceConfig.defaultDataSource === 'sso';
  }

  // no users in bza, no session assign to group's users
  noGroupUsers() {
    const ds = this.dataSourceConfig.defaultDataSource;
    const da = this.user.dataserviceAuthentication;

    return ds === 'ldap' || ds === 'sso' || da.isAnonymousAccessAllowed;
  }

  async getUserInfoByUserId(userId) {
    let userInfo = {};
    if (this.dataSourceConfig.defaultDataSource === 'fallback') {
      userInfo = await this.getInternalUserInfo(userId);
    } else if (this.dataSourceConfig.defaultDataSource === 'mssql') {
      userInfo = await this.getMssqlUserInfo(userId);
    }
    return Object.assign({ userId: userId }, this.filterLuFromUserInfo(userInfo));
  }

  async getInternalUserInfo(userId) {
    const constraints = new (bzdb.getBZDBModule().SelectConstraints)();
    constraints.addIgnoreCaseFields('userId');
    const userInfo = await bzdb.select('userInfo', {userId: userId}, constraints);
    if (userInfo.rowCount > 0) {
      return userInfo.data[0];
    } else {
      this.logger.severe("getInternalUserInfo(), userInfo not exist：" + userId);
      return {userId: userId, nonexistence: true};
    }
  }

  isMailMatchGroup() {
    return (this.dataAuthentication.matchedGroup
      && 'mail' === this.dataAuthentication.matchedProp);
  }

  isUrlParamMatchGroup() {
    return (this.dataAuthentication.matchedGroup
      && 'urlParam' === this.dataAuthentication.matchedProp
      && 'mssql' !== this.dataAuthentication.defaultAuthentication/*JSTE-18221*/);
  }

  async getInternalGroup(req, userId, res) {
    let luInfo = { userId: userId };
    let groups = [];
    const userInfo = await this.getInternalUserInfo(userId);
    Object.assign(luInfo, this.filterLuFromUserInfo(userInfo));
    const accessGroups = await bzdb.select('group');
    const userAttribute = this.getLdapAttr(req);
    const reg = userSrc.mapUserIdReg; // reg mail
    const authType = this.dataAuthentication.defaultAuthentication;

    const getGroups = async () => {
      if(this.isMailMatchGroup()/*this.dataAuthentication.matchedGroup*/) {
        if(authType === 'sso' || authType === 'ldap') {
          const data = await userSrc.getGroup(userId, req, authType);
    
          return data;
        } 
      }
     
      return {};
    }

    if (userInfo.nonexistence) {
      const gps = await getGroups();

      if(gps.groups) {
        return gps;
      }

      return {
        userInfo: userInfo,
        groups: []
      };
    }
  
    let groupUser = false;
    
    if(this.isMailMatchGroup()/*this.dataAuthentication.matchedGroup*/) {
      groupUser = accessGroups.data.findIndex(g => {
        return ((g.internalUsers || []).filter(userObj => (userObj.userId || '').toLowerCase() === (userId || '').toLowerCase())).length > 0
      }) > -1;
    }
   
    
    (accessGroups.data || []).forEach(async group => {
      let inGroup = ((group.internalUsers || []).filter(userObj => (userObj.userId || '').toLowerCase() === (userId || '').toLowerCase())).length > 0;

      if(this.isMailMatchGroup()/*this.dataAuthentication.matchedGroup*/ && !groupUser) {
        if(this.dataAuthentication.defaultAuthentication === 'ldap') {
          inGroup = (reg.test(userId) && group.groupName.toLowerCase() === userId.split('@')[1].toLowerCase());

          if(!inGroup) {
            for(let d of userAttribute) {
              if(reg.test(d) && group.groupName.toLowerCase() === d.split('@')[1].toLowerCase()) {
                inGroup = true;
                break;
              }
            }
          }
          
        } else {
          inGroup = await this.inMatchedGroup(userInfo, group, 'internal');
        }
      }
     
      if (inGroup) {
        groups.push(group.id);
      }
    });

    if(!groupUser) {
      const gps = await getGroups();
      if(gps.groups) {
        return gps;
      }
    }
    return {
      userInfo: luInfo,
      groups: groups
    };
  }

  async getLdapGroup(userId) {
    let luInfo = { userId: userId};
    let userAttribute = [];
    let privilegeGroups = [];
    if(!userId){
      return {
        userInfo: luInfo,
        groups: privilegeGroups
      };
    }
    const ldapConfigure = this.dataSourceConfig.implementationDefaults;
    const ldapRAs = ldapConfigure.ldapReturnAttributes;
    let retureAttr = (!ldapRAs || ldapRAs === "") ? [] : ldapRAs.split(",");
   
    let mapResp = {};
    try {
      const ldapData = await this.connLDAP(userId, this.dataSourceConfig.implementationDefaults);
      mapResp = ldapData.resp;
      userAttribute = ldapData.userAttribute;
      retureAttr = ldapData.retureAttr;

      if (!ldapData.resp || !ldapData.resp[0]) {
        this.logger.severe("getLdapGroup(), user is not exist：" + userId);
        luInfo.nonexistence = true;
        return {
          userInfo: luInfo,
          groups: privilegeGroups
        };
      }
    } catch (err) {
      this.logger.severe("getLdapGroup(), error detail: " + err.message);
    }
    this.logger.info("getLdapGroup(), return attribute: " + retureAttr[0] + ":" + userAttribute.toString());
    //return userAttribute;
    if (userAttribute.length > 0) {
      const groups = (await bzdb.select('group')).data;

      let groupUser = false, testGroups = [];
      // check current user in any group
      if(this.isMailMatchGroup()/*this.dataAuthentication.matchedGroup*/) {
        for(let groupInfo of groups) {
          if(groupInfo.id === DEFAULT_GROUP) continue;
          if(groupUser) break;
  
          for(let userMap of groupInfo.ldapUsers) {
            userMap = userMap.toLowerCase() || '';
            if(groupUser) break;
  
            for(let attrItem of userAttribute) {
              attrItem = attrItem.toLowerCase();
              if (attrItem.indexOf(userMap.toLowerCase().trim()) >= 0 && testGroups.filter(item => { item === groupInfo.id }).length === 0) {
                testGroups.push(groupInfo.id);
                groupUser = true;
                break;
              }
            }
          }
        }
      }

      groups.forEach(async groupInfo => {
        let inGroup = false;

        if (groupInfo.id != DEFAULT_GROUP) {
          groupInfo.ldapUsers.forEach(userMap => {
            userMap = userMap.toLowerCase().trim();
            userAttribute.forEach(attrItem => {
              attrItem = attrItem.toLowerCase();
              if (attrItem.indexOf(userMap) >= 0) {
                if (privilegeGroups.filter(item => { item === groupInfo.id }).length === 0) {
                  inGroup = true;
                  privilegeGroups.push(groupInfo.id);
                }
              }
            });
          });
        }

        if(this.isMailMatchGroup()/*this.dataAuthentication.matchedGroup*/ && !groupUser) {
          inGroup = await this.inMatchedGroup({}, groupInfo, 'ldap', userId, mapResp);
          if(inGroup) {
            privilegeGroups.push(groupInfo.id);
          }
        }
      });
    }
    return {
      userInfo: luInfo,
      groups: privilegeGroups
    };
  }

  /**
   * 
   * @param {*} userId 
   * @param {*} req 
   * @returns {
      userInfo: userId,
      groups: privilegeGroups
    }
    sso as identity source, use group's condition to map group, if not any matched, try to use email value to match.
   */
  async getSSOGroup(req, userId, res) {
    let attrStr = authConfigSv.getSsoAttrs(req.headers?.cookie);
    let attrs = {};
    try{
      if(attrStr){
        attrStr = encryption.decryptWithConstSalt(attrStr);
        if(attrStr.length > 0){
          const attrJson = JSON.parse(attrStr);
          if(attrJson && attrJson.userId === userId){
            attrs = attrJson.attr
          }else {
            authConfigSv.clearSsoAttrs(res);
          }
        }else{
          authConfigSv.clearSsoAttrs(res);
        }
      }
    }catch(e){
      this.logger.warn("error occured when get sso user's attributes, error message is " + e.message);
    }
    
    const privilegeGroups = [];
    this.logger.debug("sso user's attributes:" + attrStr);

    try {
      const groups = (await bzdb.select('group')).data;
      const keys = Object.keys(attrs);

      // handle ssoUsers condition to match group
      const matchAttr = (group) => {
        let result = false;
  
        if(group.ssoUsers == null || !Array.isArray(group.ssoUsers)) {
          return false;
        }
        
        for(let i = 0; i < group.ssoUsers.length; i++) {
          const attr = group.ssoUsers[i];
          const name = attr.attr || '';
          const value = (attr.value || '').toLowerCase().trim();
          const attrName = keys.find(d => d.toLowerCase().trim() === name.toLowerCase().trim());
          const ssoValue = attrs[attrName];
          const attrMatched = () => {
            if(attr.relation === 'equal') {
              return (ssoValue || []).findIndex(a => a.toLowerCase().trim() === value) > -1;
            } else if(attr.relation === 'has') {
              return (ssoValue || []).findIndex(a => {
                return a.toLowerCase().indexOf(value) > -1
              }) > -1;
            } else {
              return false;
            }
          }
  
          if(i > 0) {
            if(attr.operator === 'or') {
               // 'and' has high priority, there are three conditions at this stage, so 'or' can decide the final result
               if(result) {
                break;
              }
              result = attrMatched();
            } else if(attr.operator === 'and') {
              result = attrMatched() && result;
            } else {
              result = false;
              break;
            }
          } else {
            result = attrMatched();
          }
        }
        return result;
      }
  
      // use group's map condition to match
      for(let group of groups) {
        if(group.id === DEFAULT_GROUP) continue;
  
        const isMatched = matchAttr(group);
  
        if(isMatched && privilegeGroups.indexOf(group.id) < 0) {
          privilegeGroups.push(group.id);
        }
      }
  
      // match group mode
      if(privilegeGroups.length === 0 && this.isMailMatchGroup()/*this.dataAuthentication.matchedGroup*/) {
        for(let group of groups) {
          const inGroup = await this.inMatchedGroup({}, group, 'sso', userId, attrs);
          if(inGroup) {
            privilegeGroups.push(group.id);
          }
        }
      }
  
      return  {
        userInfo: {userId: userId},
        groups: privilegeGroups
      }
    } catch(err) {
      this.logger.warn(err);
      return  {
        userInfo: {userId: userId},
        groups: []
      }
    }
    
  }

  async inMatchedGroup(userInfo = {}, group, type = '', userId = '', attrs = {}) {
    let inGroup = false;
    const reg = userSrc.mapUserIdReg; // reg mail

    if(!this.isMailMatchGroup()/*this.dataAuthentication.matchedGroup*/) {
      return inGroup;
    }
   
    if(type === 'internal') {
      const prop = this.dataAuthentication.matchedProp;
      if(prop === 'mail') {
        inGroup = (reg.test(userInfo.userId) && group.groupName.toLowerCase() === userInfo.userId.split('@')[1].toLowerCase()) || 
          (reg.test(userInfo[prop]) && group.groupName.toLowerCase() === userInfo[prop].split('@')[1].toLowerCase());
      }
    } 

    if(type === 'mssql') {
      const prop = this.dataAuthentication.matchedProp;
      if(prop === 'mail') {
        inGroup = (reg.test(userInfo.userId) && group.groupName.toLowerCase() === userInfo.userId.split('@')[1].toLowerCase()) || 
          (reg.test(userInfo[prop]) && group.groupName.toLowerCase() === userInfo[prop].split('@')[1].toLowerCase());
      }
    } 

    // match sso, loop all values
    if(type === 'sso') {
      inGroup = reg.test(userId) && userId.split('@')[1].toLowerCase() === group.groupName.toLowerCase();

      if(inGroup) return inGroup;

      const prop = this.dataAuthentication.matchedProp;
      if(prop === 'mail' || prop === 'email') {
        inGroup = (reg.test(userInfo.userId) && group.groupName.toLowerCase() === userInfo.userId.split('@')[1].toLowerCase()) || 
        (attrs[prop] || []).findIndex(d => (d.split('@')[1] || '').toLowerCase() === group.groupName.toLowerCase()) > -1;
      }
    } 

    if(type === 'ldap') {
      inGroup = reg.test(userId) && userId.split('@')[1].toLowerCase() === group.groupName.toLowerCase();

      if(inGroup) return inGroup;

      const prop = this.dataAuthentication.matchedProp;
      const isInGroup = (mails) => {
        let inLdapGroup = false;
        for(let key in mails) {
          const vals = mails[key].vals;
          if((key.toLowerCase() === 'mail' || (mails[key].type && mails[key].type.toLowerCase() === 'mail')) && vals && Array.isArray(vals)) {
            for(let c of vals) {
              if(reg.test(c) && c.split('@')[1].toLowerCase() === group.groupName.toLowerCase()) {
                inLdapGroup = true;
                break;
              }
            }
          } else if(inLdapGroup) {
            break;
          } else if(key === 'mail' && vals) {
            inLdapGroup = reg.test(vals) && vals.split('@')[1].toLowerCase() === group.groupName.toLowerCase();
          }
          if(inLdapGroup) {
            break;
          }
        }

        return inLdapGroup;
      }
      
      if(prop === 'mail' || prop === 'email') {
        inGroup = isInGroup(attrs);

        // if(!inGroup) {
        //   const mail = await attrs.ldapClient.ldapAdminSearch(userId, 'mail'); // check mail for match group
        //   inGroup = isInGroup(mail);
        // }      
      }
    }

    return inGroup;
  }

  async getMssqlUserInfo(userId) {
    let userInfo = {userId: userId};
    try {
      const msSQLConfigure = this.dataSourceConfig.implementationDefaults;
      const mssqlClient = new mssqlHelper.mssqlHelper(msSQLConfigure);
      const strSQL = "SELECT * FROM " + msSQLConfigure.userTable + " WHERE " + msSQLConfigure.userIdField + "=@userName";
      const param = { ["userName"]: userId };
      const recordset = await mssqlClient.execSql(strSQL, param);
      if (recordset && recordset.recordset.length > 0) {
        userInfo = recordset.recordset[0];
      } else {
        this.logger.severe("getMssqlUserInfo(), userInfo not exist：" + userId);
        return {userId: userId, nonexistence: true};
      }
    } catch (err) {
      this.logger.severe(err.message);
    }
    return userInfo;
  }

  async getMssqlGroup(req, userId) {
    let luInfo = { userId: userId };
    let privilegeGroups = [];
    const userInfo = await this.getMssqlUserInfo(userId);
    const groups = (await bzdb.select('group')).data;
    const reg = userSrc.mapUserIdReg; // reg mail
    const isLDAP = this.dataAuthentication.defaultAuthentication === 'ldap';

    const getMssqlGroups = async (req, userId) => {
      if(!this.isMailMatchGroup()/*this.dataAuthentication.matchedGroup*/) return [];

      const testGroups = [];
      
      groups.forEach(group => {
        if (group.id != DEFAULT_GROUP) {
          if(isLDAP) {
            let inGroup = (reg.test(userId) && group.groupName.toLowerCase() === userId.split('@')[1].toLowerCase());
            if(!inGroup) {
              const userAttribute = this.getLdapAttr(req);
              userAttribute.forEach(d => {
                if(reg.test(d) && group.groupName.toLowerCase() === d.split('@')[1].toLowerCase()) {
                  testGroups.push(group.id);
                }
              })
            } else {
              testGroups.push(group.id);
            }
           

          } else if (reg.test(userId) && group.groupName.toLowerCase() === userId.split('@')[1].toLowerCase()) {
            if (testGroups.filter(item => { item === group.id }).length === 0) {
              testGroups.push(group.id);
            }
          }
        }
      });

      return testGroups;
    }

    if (userInfo.nonexistence) {
      const data = await getMssqlGroups(req, userId);
    
      if(data.length > 0) {
        return {
          userInfo: {userId},
          groups: data
        }

      }
      return {
        userInfo: userInfo,
        groups: []
      };
    }
    Object.assign(luInfo, this.filterLuFromUserInfo(userInfo));
    const msSQLConfigure = this.dataSourceConfig.implementationDefaults;
    let groupNames = userInfo[msSQLConfigure.groupFieldName];
    this.logger.info("getMssqlGroup(), user group is: " + groupNames);

    if (groupNames && groupNames != "" || this.isMailMatchGroup()/*this.dataAuthentication.matchedGroup*/) {
      let groupUser = false, userAttribute =[];
      
      groupNames = (groupNames || '').split(",");

      if(this.isMailMatchGroup()/*this.dataAuthentication.matchedGroup*/ && isLDAP) {
        groupUser = groups.findIndex(g => {
          return (g.mssqlUsers || []).filter(userMap => groupNames.indexOf(userMap) >= 0).length > 0
        }) > -1;
      }

      if(isLDAP) {
        userAttribute = this.getLdapAttr(req);
      }

      for await(let groupInfo of groups) {
        let inGroup = false;
        if (groupInfo.id != DEFAULT_GROUP) {
          for(let userMap of (groupInfo.mssqlUsers || [])) {
            inGroup = groupNames.indexOf(userMap) >= 0;
            
            if(inGroup) break;
          }

          if(this.isMailMatchGroup()/*this.dataAuthentication.matchedGroup*/ && !groupUser && isLDAP) { 
            if(isLDAP) {
              inGroup = (reg.test(userId) && groupInfo.groupName.toLowerCase() === userId.split('@')[1].toLowerCase());
              if (!inGroup) {
                for(let d of userAttribute) {
                  if(reg.test(d) && groupInfo.groupName.toLowerCase() === d.split('@')[1].toLowerCase()) {
                    inGroup = true;
                    break;
                  }
                }
              }
            } else {
              inGroup = await this.inMatchedGroup({userId}, groupInfo, 'mssql');
            }
            
          }
          if (inGroup && privilegeGroups.filter(item => { item === groupInfo.id }).length === 0) {
            privilegeGroups.push(groupInfo.id);
          }
        }
      }
    }
    return {
      userInfo: luInfo,
      groups: privilegeGroups
    };
  }

  async connLDAP(userId, configuration) {
    const ldapRAs = configuration.ldapReturnAttributes;
    const retureAttr = (!ldapRAs || ldapRAs === "") ? [] : ldapRAs.split(",");
    let userAttribute = [], resp = [];
    try {
      const ldapClient = new ldapHelper.ldapHelper(configuration);
      resp = await ldapClient.ldapAdminSearch(userId, retureAttr);

      if (resp && resp[0]) {
        if (retureAttr.length === 0) {
          retureAttr.push("DN") // default return attribution is 'DN'.
        }
        for (const attr in resp) {
          if (resp[attr].type.toUpperCase() === retureAttr[0].toUpperCase()) {
            // use the first attributes as group map
            userAttribute = resp[attr].vals;
            break;
          }
        }
      }

      return {
        retureAttr, userAttribute, resp
      };
    } catch (err) {
      this.logger.severe("getLdapGroup(), error detail: " + err.message);
      return {};
    }

  }

  getLdapAttr(req) {
    if(this.dataAuthentication.defaultAuthentication !== 'ldap') return [];
    
    const userAttribute = []; const attrs = [];
    try{
      let attrStr = authConfigSv.getLdapConfig(req.headers?.cookie);
      if(attrStr){
        attrStr = encryption.decryptWithConstSalt(attrStr);
        attrs = attrStr.length > 0 ? JSON.parse(attrStr) : [];
      }

      for(let key in attrs) {
        if(attrs[key].type === 'mail') {
          userAttribute.push(...attrs[key].vals);
        }
      }
    }catch(e){
      this.logger.warn("error occured when get ldap user's attributes, error message is " + e.message);
    }
    return userAttribute;
  }

  // get lu name from user info
  filterLuFromUserInfo(userInfo) {
    const luInfo = {};    
    try {
      Object.keys(userInfo).forEach(key => {
        if (/^LU\d+$/gi.test(key)) {
          luInfo[key] = userInfo[key];
        }
      });
    } catch (ex) {
      return {};
    }
    return luInfo;
  }

  // JSTE-2610: when sessionSetting is false, advanceItems are all saved as true which should be false
  fixPrivilege(privilege) {
    let advanceItems = ['enableEditFontSize', 'enableEditColors', 'enableEditCursor', 'enableEditLaunchPad',
      'enableEditkeyboardMapping', 'enableEditHotSpots', 'enableEditLanguage', 'viewSessionPanel'];
    let fixedPrivilege = {};  
    Object.keys(privilege).forEach(key => {
      if (privilege['sessionSettings'] === false && advanceItems.indexOf(key) > -1) {
        fixedPrivilege[key] = false;
      } else {
        fixedPrivilege[key] = privilege[key];
      }
    });
    return fixedPrivilege;
  }

  async getSessionPrivilege(userId, groups) {
    let privilegeObj = {
      sessionNames: [],
      publicScripts: [],
      sessionPrivilege: {},
      createSession: false,
      mergedPrivilege: {},
      groupData: {}, // BZ-13725, servered desktop mode
      firstGrpDataSecurity:{}
    };
    if(this.isBzw2hMode){
      privilegeObj.createSession = true;
    }
    let sessionsObj = {};
    let assignedSession = [];
    // let assignedScripts = [];
    let userGroupsIn = new Array();
    const screen=await bzdb.select('terminalScreen');
    for (let group of groups){
      let groupInfo = (await bzdb.select('group', {id: group})).data[0];
     
      const gData = {
        basic: {
          gid: group,
          name: groupInfo.groupName,
          deployMode: groupInfo.deployMode || 'w2h',
          timestamp: groupInfo.timestamp
        },
        dataSecurity: groupInfo.dataSecurity || {}
      }
      if(screen.data && Array.isArray(screen.data)){
        if(screen.data.length>0){
          if(gData.dataSecurity && gData.dataSecurity.content){
            gData.dataSecurity.content.screens= screen.data;
          }
        }else{
          if(gData.dataSecurity && gData.dataSecurity.content) delete gData.dataSecurity.content.screens
        }
      }
      privilegeObj.groupData[group] = gData;
      if (!groupInfo){
        if (zoweService.isOnZowe){ // On ZOWE, if the 'Default Group' not exist, then insert it. This is onetime action.
          groupInfo = (await bzdb.select('defaultGroup')).data[0];
          if (groupInfo && groupInfo.privileges) {
            zoweService.grantDefaultPrivileges(groupInfo.privileges); // On ZOWE, the default group has full privileges.
            await bzdb.updateOrInsert('group', groupInfo);
          } else {
            this.logger.severe('The default group data missing or is invalid on ZOWE!');
            this.logger.severe('The data is: ' + JSON.stringify(groupInfo));
            continue;
          }
        }else{
          continue;
        }
      } 

      let sessionNames = groupInfo.sessions;
      if(groupInfo.privileges.sessionSettings && groupInfo.privileges.viewSessionPanel == null){
        groupInfo.privileges.viewSessionPanel = true;
      }
      let sessionPrivilege = this.fixPrivilege(Object.assign({}, groupInfo.privileges));
      
      // WEB2H need all sessions
      if(!this.isBzw2hMode) {
        // get session for current group user
        const constraints = new (bzdb.getBZDBModule().SelectConstraints)();
        constraints.addIgnoreCaseFields('userId');
        const filter = { userId: userId, groupId: group };
        let sessionForGroupSession = this.noGroupUsers() ? {data: [], rowCount: 0} : await bzdb.select('groupUserPrivilege', filter, constraints);
        const allGroupSessions =  await bzdb.select('groupSession');
        const groupSessions = allGroupSessions.data.filter(d => (d.gids || [d.gid]).indexOf(group) > -1);
        // add group sessions into privilege if has assigned to user but don't assign to any group when return to RTE web.
        groupSessions.forEach(d => { 
          if(sessionForGroupSession.data.findIndex(s => s.sessionId === d.id) > -1 && sessionNames.indexOf(d.id) < 0) {
            sessionNames.push(d.id); // get group user if assign specific session
          }
        })

        if(sessionForGroupSession && sessionForGroupSession.data.length !== 0) {
          sessionForGroupSession.data.forEach(el => {
            if(assignedSession.indexOf(el.sessionId) === -1) {
              assignedSession.push(el.sessionId); // get group user if assign specific session
            }
          });
        }else {
          (sessionNames || []).forEach(name => {
            if(assignedSession.indexOf(name) < 0) {
              assignedSession.push(name);
            }
          })
        }
        // groupInfo.scripts?.forEach((item) => {
        //   if (!assignedScripts.includes(item)) {
        //     assignedScripts.push(item)
        //   }
        // })
      }
      

      if (zoweService.isOnZowe){ 
        // as bzw logical: set enableEditSession = false will show session setting in config dialog.
        sessionPrivilege.enableEditSession = false;
      }

      privilegeObj.createSession = privilegeObj.createSession || !!sessionPrivilege.createSession;

      sessionNames.forEach((session) => { // public sessions
        if (!sessionsObj[session]) {
          sessionsObj[session] = Object.assign({isBzadmSession: true}, sessionPrivilege, sessionPrivilege.enableSharedScript?{'scripts':JSON.parse(JSON.stringify(groupInfo.scripts || []))}:{});
        } else {
          sessionsObj[session].isBzadmSession = true;
          Object.keys(sessionPrivilege).forEach((key) => {
            sessionsObj[session][key] = sessionsObj[session][key] || sessionPrivilege[key];
          });
          if(groupInfo.scripts && Array.isArray(groupInfo.scripts) && groupInfo.scripts.length > 0){
            if(!sessionsObj[session]['scripts']){
              sessionsObj[session]['scripts'] = sessionPrivilege.enableSharedScript ? groupInfo.scripts :[]
            }else {
              groupInfo.scripts.forEach(s => {
                if(!sessionsObj[session]['scripts'].includes(s) && sessionPrivilege.enableSharedScript){
                  sessionsObj[session]['scripts'].push(s);
                }
              })
            }
          }
          
        }
        if(groupInfo.dataSecurity && groupInfo.dataSecurity.overWriteServerDS){
          if(sessionsObj[session].dataSecurity && sessionsObj[session].grpTimeStamp) {// if the same session be assigned to mutiple groups
            if(groupInfo.timestamp < sessionsObj[session].grpTimeStamp){
              sessionsObj[session].dataSecurity = groupInfo.dataSecurity.content || {};// replace to first group 
            }
          }else{
            sessionsObj[session].dataSecurity = groupInfo.dataSecurity.content || {};
            sessionsObj[session].grpTimeStamp = groupInfo.timestamp;
          }
        }
      });
      Object.keys(sessionPrivilege).forEach((key) => {
        privilegeObj.mergedPrivilege[key] = privilegeObj.mergedPrivilege[key] || sessionPrivilege[key];
      });
      if(groupInfo.scripts && Array.isArray(groupInfo.scripts) && groupInfo.scripts.length > 0 && sessionPrivilege.enableSharedScript){
        if(!privilegeObj.mergedPrivilege['scripts']){
          privilegeObj.mergedPrivilege['scripts'] = [];
        }
        groupInfo.scripts.forEach(s => {
          if(!privilegeObj.mergedPrivilege['scripts'].includes(s)){
            privilegeObj.mergedPrivilege['scripts'].push(s);
          }
        })
      }
      userGroupsIn.push(JSON.parse(JSON.stringify(gData)));
    }
    this.logger.debug("getSessionPrivilege();admin share session privilige detail:"+ JSON.stringify(sessionsObj))
    // load user-define sessions
    userGroupsIn = this.getSortedGroup(userGroupsIn);
    const dbFilter = {userId: userId.toLowerCase()};
    const userSessions = await bzdb.select('sessionPrivate', dbFilter); // session private
    if (userSessions && userSessions.rowCount > 0){
      userSessions.data.forEach(session => {
        const sesName = session.id || session.name;
        if (!sessionsObj[sesName]) {
          sessionsObj[sesName] = Object.assign({}, privilegeObj.mergedPrivilege);
        } else {   //same name sessions both in admin-define and user-define
          Object.keys(privilegeObj.mergedPrivilege).forEach((key) => {
            sessionsObj[sesName][key] = sessionsObj[sesName][key] || privilegeObj.mergedPrivilege[key];
          });
          this.logger.info("getSessionPrivilege(); duplicated session '"+sesName+"', both admin-define and user-define , skip to load user-define.");
        }
      });
    }
    // WEB2H need all sessions   
    if (this.isBzw2hMode) { 
      Object.keys(sessionsObj).forEach(key => {
        privilegeObj.sessionNames.push(key);
      });
    } else {
      Object.keys(sessionsObj).forEach(key => {
        if (assignedSession.length !== 0) {
          if (assignedSession.indexOf(key) > -1 && sessionsObj[key].isBzadmSession) { // public session
            privilegeObj.sessionNames.push(key);
          } else if (!sessionsObj[key].isBzadmSession) { // private session 
            privilegeObj.sessionNames.push(key);
          }
        } else {
          privilegeObj.sessionNames.push(key); // if user doesn't assign specific session, display all sessions
        }
      });
      // privilegeObj.publicScripts = assignedScripts || []
    }
    
   
    privilegeObj.sessionPrivilege = sessionsObj;
    privilegeObj.firstGrpDataSecurity.dataSecurity = this.getFirstGroupSecurity(userGroupsIn);
    // console.log('********privilegeObj******', privilegeObj);
    return privilegeObj;
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
    const result=await bzdb.select("configurations",constants.metaDataBackupPath.datasource);
    if(result && result.data && result.data.length>0){
      jsonData= result.data[0]; 
    }
    return jsonData;

  }

  getAuth(auth, type) {
    const EMPTYPASSWORD="";
    if (!auth || auth.indexOf('Basic') == -1) {
      return {
        username: '',
        password: EMPTYPASSWORD
      };
    }
    let authStr = Buffer.from(auth.substring(6), 'base64').toString('ascii');
    let authArr = authStr.split(':');

    // no password mode for oauth
    if(this.dataAuthentication.isHttpHeader) {
      let username = authArr[0];
      const index = username.indexOf('\\');

      if(index > -1) {
        username = username.substring(index+1, username.length);
      }

      return {
        username: username,
        password: authArr[1]
      }
    }

    return {
      username: authArr[0],
      password: authArr[1]
    };
  }

  getSortedGroup(userGroupsIn){
    if(userGroupsIn && userGroupsIn.length > 0){
      userGroupsIn.sort((a, b) => {
        if (a.basic.timestamp > b.basic.timestamp) {
          return 1;
        } else if (a.basic.timestamp < b.basic.timestamp) {
          return -1;
        } else {
          return 0;
        }
      });
    }
    return userGroupsIn;
  }

  getFirstGroupSecurity(userGroupsIn){
    if (userGroupsIn.length > 0 ) {
      const dsGroup = userGroupsIn[0];// for private session, get first group's dataSecurity
      if (dsGroup && dsGroup.dataSecurity && dsGroup.dataSecurity.overWriteServerDS) {
          return dsGroup.dataSecurity.content || {};
      }
   }else {
     return {};
   }
  }

}

exports.userPrivilegeRouter = (context) => {
  return new Promise((resolve, reject) => {
    let controller = new UserPrivilegeController(context);
    controller.setupUserPrivilegeRouter();
    resolve(controller.getRouter());
  });
};