'use strict';


const GROUP_PATH = '/instance/groups';
const Utiles = require('./utils.service');
const bzdb = require('../../../bzshared/lib/services/bzdb.service');

class AccessGroup {
  constructor(context) {
    this.utiles = new Utiles(context);
    this.context = context;
    this.groups = [];
  }

  // deprecated
  // async createAccessGroup(req, options) {
  //   const date = new Date();
  //   const dir = this.getPath(options.baseUrl);
  //   let data, id;

  //   const existGroup = (await bzdb.select('group', {groupName: options.groupName})).data[0];

  //   options.values.internalUsers = options.values.internalUsers.map(d => {
  //     return { userId: d.userId };
  //   });

  //   if (existGroup) {
  //     const group = { ...existGroup };
  //     const userIds = group.internalUsers.map(d => d.userId);
  //     let updated = true;
  //     options.values.internalUsers.forEach(d => {
  //       if (userIds.indexOf(d.userId) < 0) {
  //         group.internalUsers.push(d);
  //         updated = false;
  //       }
  //     });

  //     if (updated) {
  //       return new Promise((resolve) => {
  //         resolve({ text: 'the same group and do not need to update group file' })
  //       });

  //     }
  //     id = group.id;
  //     data = group;
  //   } else {
  //     id = await this.utiles.getGroupId(dir);

  //     const baseInfo = {
  //       "id": id,
  //       "groupName": "",
  //       "shortName": "",
  //       "leader": "",
  //       "parentGroupName": "",
  //       "description": "",
  //       "internalUsers": [],
  //       "sessions": [],
  //       "privileges": {},
  //       "timestamp": date.getTime(),
  //       "ldapUsers": [],
  //       "mssqlUsers": []
  //     };

  //     data = Object.assign(baseInfo, options.values);
  //   }

  //   //  data = Object.assign(this.dataSteward.searchDataByPK(DataEntities.group.name, req.body.id), req.body);

  //   this.createDir(dir);
  //   await this.createGroupFile(req, dir, id, data, !existGroup);
  // }

  // deprecated
  // createDir(dir) {
  //   if (!fs.existsSync(dir)) {
  //     fs.mkdirSync(dir);
  //   }
  // }

  async createGroupFile(req, dir, id, data, updateId) {
    return new Promise(async (resolve, reject) => {
      if (updateId) {
        this.utiles.saveGroupId(dir, id);
      }
  
      const value = await bzdb.updateOrInsert('group', data);
  
      if(value) {
        console.log('successfully create group');
        resolve({ text: 'successfully create group' });
      } else {
        console.log('failed to create group');
        resolve({ text: 'failed to create group' });
      }
    })
  }

 async setGroupasDefault(groupID){
    let returnResult = {
      groupName: "",
      status: "success",
      message: "Group ${groupName} has been set as default group."

      
    }
    try{

      let result = await bzdb.select('group', {isDefault: 'true'});
      for(let item of result.data){
        item.isDefault = 'false';
        await bzdb.updateOrInsert('group', item)
      }
      result = await bzdb.select('group', {id: groupID})
      if(result.rowCount > 0){

        result.data[0]['isDefault'] = 'true'
        returnResult.groupName = result.data[0].groupName;
        result = await bzdb.updateOrInsert('group', result.data[0])
        if(result){
            returnResult.status = "success";
            returnResult.message = `Group ${returnResult.groupName} has been set as default group.`;
          }
      }else{
        returnResult.status = "error";
        returnResult.message = "No indicated group found";
      }
    }catch(e){
        returnResult.status = "errro";
        returnResult.message = "Exception occured when making default";
    }
    return returnResult;
  }

  getPath(baseUrl) {
    return baseUrl + GROUP_PATH;
  }

  async getAllGroups(username) {
    let result = await bzdb.select('group');

    if (username !== 'superadmin') {
      const admin = await bzdb.select('administrator', { name: username });
      const data = admin.rowCount > 0 ? admin.data[0] : {};

      if (data.role === 'groupAdmin' && !data.isAll) {
        result.otherGroups = result.data.filter(d => {
          return data.group.findIndex(g => g === d['id']) < 0;
        }).map(d => {
          return {
            groupName: d.groupName,
            internalUsers: d.internalUsers,
            ldapUsers: d.ldapUsers,
            mssqlUsers: d.mssqlUsers,
            ssoUsers: d.ssoUsers,
            isDefault: d.isDefault? true: false
          }
        });
        result.data = result.data.filter(d => {
          return data.group.findIndex(g => g === d['id']) > -1;
        });
      }
    }
    
    return result;

  }

}

module.exports = {
  init(context) {
    return new AccessGroup(context);
  }
};