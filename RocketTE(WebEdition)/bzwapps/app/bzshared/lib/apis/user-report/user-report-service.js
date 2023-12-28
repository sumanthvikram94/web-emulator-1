'use strict';

/**
 * Name:      user-report-service.js
 * Desc:      Service for user report related requests.
 * Author:    Furong (Furong Liu)
 * Create DT: 2021-08-23
 * Copyright: © 2014-2021 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */

const bzdb = require('../../services/bzdb.service');
const utils = require('../../services/conn-utils');
const authConfigSv = require('../../services/authConfigService');
const constants = require('../../services/constants.service');
const connPool = require('../../dist/connection-pool');
const {adminConfigService} = require('../../services/admin-config.service');
const ReportSv = require('../../dist/report-service');
const DEFAULT_GROUP = 'Default Group';

class UserReportService {
  constructor() {
    this.connPool = connPool;
    this.utils = utils;
    // save some cache data for past 14 days peak user
    this.currentDate = utils.getDate();
    this.d14Sample = null;
    this.reportSv = ReportSv;
    const adminConfigObj = adminConfigService;
    const configured = adminConfigObj.getAdminConfig();
    this.enabled = configured.enableUserReport;
    setTimeout(async () => {
      await this.updateD14Sample();
    }, 3000);
  }

  async getDataSource() {
    const result = await bzdb.select('configurations', constants.metaDataBackupPath.datasource);
    const dataSourceObj = result && result.data && result.data[0] && result.data[0].dataserviceDataSource;
    return dataSourceObj ? dataSourceObj.defaultDataSource : 'fallback';
  }

  /**
   * 
   * @param {*} dataSource 
   * @param {*} isDefaultGroupMode 
   * 1. only default group mode: all users in only one group 'Default Group'
   * 2. when dataSource is fallback: get the real-time group info from bzdb
   * 3. noAuth and other dataSource: use the group info when login bzw(saved in connPoolGroup)
   * 
   * @returns {server1: {group1: [{uid: aa, ip: ip, cids: [1]}]}}
   */
  async getUsersByGroups(dataSource, isDefaultGroupMode, isNoAuth, matchedGroup) {
    if (isDefaultGroupMode) {
      return await this.getDefaultGroupUsers();
    } else if (isNoAuth) {
      return await this.getLogonGroupUsers(true);
    } else if (dataSource === 'fallback' && !matchedGroup) {
      return await this.getInternalGroupUsers();
    } else {
      return await this.getLogonGroupUsers();
    }
  }

  async getDefaultGroupUsers() {
    const basicData = await this.connPool.memoryStorage.getClusterBasicItems();
    const metaPeers = await this.reportSv.select('meta_peers');
    let result = {};

    (metaPeers.data || []).forEach(peer => {
      const serverName = utils.getServerNameFromUrl(peer.serverURL || '');
      let data;
      // 
      if(this.reportSv.shareFS.status) {
        // persistMethod: PERSIST_METHOD_COMBINED_FILE && SYNC_LOCAL
        const arr = basicData.filter(d => d.sn === this.reportSv.shareFS.id); 
        data = utils.aggregateCid(arr);
      } else {
         // persistMethod: PERSIST_METHOD_ONLY_MEMORY
        const uIdx = basicData.findIndex(node => node.id === peer.id); // shared mode has sid
        data = uIdx > -1 ? utils.aggregateCid(utils.getConnItems(basicData[uIdx])) : [];
      }
     
      result[serverName] = {
        [DEFAULT_GROUP]: {
          uc: data.length,
          data
        }
      };
    });

    return result;
  }


  async getInternalGroupUsers() {
    const metaPeers = await this.reportSv.select('meta_peers');
    const basicData = await this.connPool.memoryStorage.getClusterBasicItems();
    const groups = await this.getInternalGroups();

    const getGroupUsers = (groups, userObj) => {
      let groupUsers = {};
      groups.forEach(group => {
        const groupName = group.groupName;
        let uc = 0;
        if (groupName !== DEFAULT_GROUP) {
          const userIds = (group.internalUsers || []).map(item => (item.userId ||'').toLowerCase());
          let currentGroupUsers = [];
          userIds.forEach(userId => {
            if (userObj[userId]) {
              currentGroupUsers = currentGroupUsers.concat(userObj[userId]);
              uc++;
            }
          });
          groupUsers[groupName] = {
            uc,
            data: currentGroupUsers
          };          
        }
      });


      return groupUsers;
    }

    let result = {};

    (metaPeers.data || []).forEach(peer => {
      const serverName = utils.getServerNameFromUrl(peer.serverURL || '');
      let userObj;
      
      if(this.reportSv.shareFS.status) {
        // persistMethod: PERSIST_METHOD_COMBINED_FILE && SYNC_LOCAL
        const arr = basicData.filter(d => d.sn === peer.id);
        userObj = utils.aggregateCidToUserObj(arr);
      } else {
        // persistMethod: PERSIST_METHOD_ONLY_MEMORY
        const uIdx = basicData.findIndex(node => node.id === peer.id); // shared mode has sid
        userObj = uIdx > -1 ? utils.aggregateCidToUserObj(utils.getConnItems(basicData[uIdx])) : {}; 
      }
      result[serverName] = getGroupUsers(groups, userObj);
    });

    return result;
  }

  async getLogonGroupUsers(isNoAuth) {
    const metaPeers = await this.reportSv.select('meta_peers');
    const basicData = await this.connPool.memoryStorage.getClusterBasicItems();
    const groupData = await this.connPool.memoryStorage.getClusterGroupItems();
    const groups = await this.getInternalGroups();

    // use the new group info to replace the old
    const getUserGroupObj = (data) => {
      let userGroupObj = {};
      data.forEach(item => {
        userGroupObj[item.uid] = item.grps;
      });
      return userGroupObj;
    }

    // no auth user can logon with different group, merge the group info
    const getNoAuthUserGroupObj = (data) => {
      let userGroupObj = {};
      data.forEach(item => {
        let currentGrps = userGroupObj[item.uid] || [];
        const group = item.grps[0];
        if (currentGrps.indexOf(group) === -1) currentGrps.push(group);
        userGroupObj[item.uid] = [...currentGrps];
      });
      return userGroupObj;
    }

    const getLogonGroupUsers = (userGroupObj, userObj) => {
      let groupUsers = {};
      Object.keys(userGroupObj).forEach(uid => {
        const currentGrps = userGroupObj[uid] || [];
        currentGrps.forEach(grp => {
          const arr = userObj[uid] || [];
          if (groupUsers[grp] == undefined) {
            groupUsers[grp] = {
              uc: 1,
              data: [...arr]
            };
          } else {
            groupUsers[grp].uc += 1;
            groupUsers[grp].data = groupUsers[grp].data.concat(arr);
          }
        });
      });
      return groupUsers;
    }

    const mapGroups = (groups, groupUsers) => {
      let result = {};
      (groups || []).forEach(group => {
        const groupName = group.groupName;
        if (groupName !== DEFAULT_GROUP) {
          result[groupName] = groupUsers[groupName] || {uc: 0, data: []};
        }
      });
      return result;
    }

    let result = {};

    (metaPeers.data || []).forEach(peer => {
      let userObj, groupNode, groupObj;
      const serverName = utils.getServerNameFromUrl(peer.serverURL || '');
     
      if(this.reportSv.shareFS.status) {
        // persistMethod: PERSIST_METHOD_COMBINED_FILE && SYNC_LOCAL
        userObj = utils.aggregateCidToUserObj(basicData.filter(d => d.sn === peer.id));
        groupObj = groupData.filter(d => d.sn === peer.id);
      } else {
        // persistMethod: PERSIST_METHOD_ONLY_MEMORY
        const uIdx = basicData.findIndex(node => node.id === peer.id); // shared mode has sid
        const gIdx = groupData.findIndex(node => node.id === peer.id);
        userObj = uIdx > -1 ? utils.aggregateCidToUserObj(utils.getConnItems(basicData[uIdx])) : {}; 
        groupNode = gIdx > -1 ? groupData[gIdx] : {};
        groupObj = utils.getConnItems(groupNode);
      }
      const userGroupObj = isNoAuth ? getNoAuthUserGroupObj(groupObj) : getUserGroupObj(groupObj);      // {aa: [g1, g3], bb: [g1]} 
      const logonGroupUsers = getLogonGroupUsers(userGroupObj, userObj)
      result[serverName] = mapGroups(groups, logonGroupUsers);
    });

    return result;
  }


  /**
   * Get server info and user list by server name
   * 
   * @returns {server1: {status: string, sc: number, users: [{uid: aa, ip: ip, cids: [1, 2]}]}}
   */
  async getServersData() {
    const clusterUsers = await this.connPool.memoryStorage.getClusterBasicItems();
    const metaPeers = await this.reportSv.select('meta_peers');
    const peerStatus = await bzdb.checkStatus();
    const statusData = peerStatus && peerStatus.data || [];
    let result = {};

    (metaPeers.data || []).forEach(peer => {
      const serverName = utils.getServerNameFromUrl(peer.serverURL || '');
      let status, users, uc, sc;
      if(this.reportSv.shareFS.status) {
        // persistMethod: PERSIST_METHOD_COMBINED_FILE && SYNC_LOCAL
        const data = clusterUsers.filter(d => d.sn === peer.id);
        const result = utils.aggregateCidWithUc(data);

        users = result.users;
        uc = result.uc;
        sc = data.length
        status = 'ready';

      } else {
        // persistMethod: PERSIST_METHOD_ONLY_MEMORY
        const uIdx = clusterUsers.findIndex(node => node.id === peer.id); // shared mode has sid
        const sIdx = statusData.findIndex(node => node.id === peer.id); 
        status = statusData[sIdx] && statusData[sIdx].status || undefined;
        const result = uIdx > -1 ? utils.aggregateCidWithUc(utils.getConnItems(clusterUsers[uIdx])) : {
          users: [],
          uc: 0
        };
        users = result.users;
        uc = result.uc;
        sc = uIdx > -1 ? (utils.getConnItems(clusterUsers[uIdx])).length || 0 : 0
      }
      
      result[serverName] = {
        // server: serverName,
        status,
        uc,
        sc,
        users
      }
    });
 
    return result;
  }

  /**
   * Get user list by server name
   * 
   * @param {string} serverName 
   * 1. serverName is current node: get current node users
   * 2. serverName is 'all': get the cluster users
   * 3. serverName is 'serverName': get the specify node users
   * @param {boolean} getOneNode 
   * @returns {server1: [{uid: aa, ip: ip, cids: [1, 3]}], server2: [{uid: bb, ip: ip, cids: [2, 3]}]}
   */
  async getServerUsers(serverName, getOneNode) {
    let result = {};
    if (getOneNode) {
      const currentNodeUsers = await this.connPool.memoryStorage.getBasicItems();
      result[serverName] = utils.aggregateCid(utils.getConnItems(currentNodeUsers[0]));
    } else {
      const clusterUsers = await this.connPool.memoryStorage.getClusterBasicItems();
      const metaPeers = await this.reportSv.select('meta_peers');
      // if (serverName === 'all') {
      //   (metaPeers.data || []).forEach(peer => {
      //     const uIdx = clusterUsers.findIndex(node => node.id === peer.id);
      //     const nodeName = utils.getServerNameFromUrl(peer.serverURL || '');
      //     result[nodeName] = uIdx > -1 ? utils.aggregateCid(utils.getConnItems(clusterUsers[uIdx])) : [];
      //   });
      // } else {
      //   const specifyNode = clusterUsers.filter(node => utils.getServerNameFromUrl(node.serverName) === serverName);
      //   result[serverName] = utils.aggregateCid(utils.getConnItems(specifyNode[0]));
      // }

      // as current design: return all data to client.
      (metaPeers.data || []).forEach(peer => {
        const nodeName = utils.getServerNameFromUrl(peer.serverURL || '');
        let data;
        if(this.reportSv.shareFS.status) {
          // persistMethod: PERSIST_METHOD_COMBINED_FILE && SYNC_LOCAL
          const arr = clusterUsers.filter(d => d.sn === peer.id);
          data =  utils.aggregateCid(arr);
        } else {
           // persistMethod: PERSIST_METHOD_ONLY_MEMORY
          const uIdx = clusterUsers.findIndex(node => node.id === peer.id); // shared mode has sid
          data = uIdx > -1 ? utils.aggregateCid(utils.getConnItems(clusterUsers[uIdx])) : [];
        }

        result[nodeName] = data;
      });

    }
    return result;
  }

  /**
  * Get ever unique user count and daily unique user count
  * @returns
  *  {
  *   total: {
  *    count: number, 
  *    date: date   eg.11:22 05/20/2020
  *   }, 
  *   daily: {
  *    count: number, 
  *    date: date   eg. 07/20/2020
  *   }
  * }
  */
  async getUniqueUsers(stat) {
    let total = await this.connPool.fileStorage.getConnUserCount();
    const daily = await this.getDailyUnique();
    const defaultDate = utils.formatDate(new Date(), true);
    // fake fix for total unique
    if (total < daily) {
      total = daily;
    }

    return {
      total: {
        count: total,
        date: stat && stat.since ? utils.formatDate(new Date(stat.since), true) : defaultDate
      },
      daily: {
        count: daily,
        date: utils.formatDate(new Date(), false)
      }
    };
  }

  // get daily unique from connHistory
  async getDailyUnique() {
    const utcInterval = utils.getUtcInterval('daily');
    const end = (new Date()).getTime();
    const start = end - utcInterval;
    const dates = this.getHistoryDate(start, end);
    const uids = [];

    const includeTime = (data) => (!data.et || (data.et >= start && data.et <= end));
    const getUids = (uids, data) => {
      (data || []).forEach(item => {
        const uid = (item.uid || '').toLowerCase();
        if (includeTime(item) && uids.indexOf(uid) === -1) {
          uids.push(uid);
        }
      });
    }
    const history = await this.connPool.fileStorage.getConnHistory({ date: dates });
    getUids(uids, history);

    // append temp data(saved in local)
    const temp = await this.connPool.fileStorage.getClusterTemp();
    (temp || []).forEach(peer => {
      const peerData = utils.getConnItems(peer || {});
      getUids(uids, peerData);
    });

    // console.log('****daily uids******', uids);
    return uids.length;
  }

  /**
   * Get ever peak user count, daily peak user count, past 14 days peak user count
   * @returns {
   *   ever: {count: number, date: date},
   *   daily: {count: number, date: date},
   *   d14: {count: number, date: date}
   * }
   */
  async getPeakUsers(stat) {
    if (!stat) {
      const data = {
        count: 0,
        date: utils.formatDate(new Date(), true)
      };
      return {
        ever: data,
        daily: data,
        d14: data
      };
    }

    const dailySample = await this.getDailySample();
    const dailyData = this.getPeriodPeakUser(dailySample,'daily');

    // if currentDate is not changed, then d14Sample can use cache data
    // d14Data = max(dailyData, d14Peak)
    const currentDate = utils.getDate();
    if (!this.d14Sample  || currentDate !== this.currentDate) {
      await this.updateD14Sample();
      this.currentDate = currentDate;
    }
    let d14Peak = this.getPeriodPeakUser(this.d14Sample, 'w2');
    if (d14Peak && d14Peak.value <= dailyData.value) {
      Object.assign(d14Peak, dailyData);
    }

    const d14Data = d14Peak;
    const defaultDate = utils.formatDate(new Date(), true);
    const peakUc = this.fakeFixPeakUc(stat.peakUc || {}, dailyData, d14Data);
    return {
      ever: {
        count: peakUc.count || 0,
        date: peakUc.t ? utils.formatDate(new Date(peakUc.t), true) : defaultDate
      },
      daily: {
        count: dailyData.value,
        date: dailyData.key ? utils.formatDate(new Date((Number(dailyData.key))), true) : defaultDate
      },
      d14: {
        count: d14Data.value,
        date: d14Data.key ? utils.formatDate(new Date(Number(d14Data.key)), true) : defaultDate
      }
    };
  }

  fakeFixPeakUc(peakUc, dailyPeak, d14Peak) {
    const comparePeak = dailyPeak.value >= d14Peak.value ? dailyPeak : d14Peak;
    const result = (peakUc.count || 0) >= comparePeak.value ? peakUc : {
      count: comparePeak.value,
      t: comparePeak.key
    };
    return result; 
  }

  async getDailySample() {
    return await this.connPool.fileStorage.getConnSample({ date: utils.getPeriodDate('daily') });
  }

  async updateD14Sample() {
    if (!this.enabled) return; // JSTE-16597, do nothing if not enabled.
    this.d14Sample = await this.connPool.fileStorage.getConnSample({ date: utils.getPeriodDate('w2') });
  }

  /**
   * 
   * @param {*} connSample 
   * @param {*} period 
   * @returns peek user
   */
  getPeriodPeakUser(connSample, period) {
    let timeUserObj = {};
    // const connSample = await this.connPool.fileStorage.getConnSample({ date: utils.getPeriodDate(period) });
    const utcInterval = utils.getUtcInterval(period);
    const now = (new Date()).getTime();
    (connSample || []).forEach(sampleObj => {
      const sampleTime = sampleObj.t;
      const ut = this.connPool.fileStorage.extractUt(sampleObj.sut || '');
      if ((now - sampleTime) <= utcInterval) {
        if (timeUserObj[ut] == undefined) {
          timeUserObj[ut] = {
            uc: sampleObj.uc || 0,
            t: sampleTime
          }
        } else {
          timeUserObj[ut].uc += (sampleObj.uc || 0);
        }
      }
    });
    return utils.findObjMaxValue(timeUserObj);
  }

  /**
   * Get sample data in a specified period
   * Sometimes some sample data missing because of server down or some other reasons
   * Need fix the missing sample data
   * 
   * @param {*} period h1/d1/d3/w1/w2
   */
  async getPeriodUsers(period) {
    const connSample = await this.connPool.fileStorage.getConnSample({ date: utils.getPeriodDate(period) });
    const sMap = await this.connPool.fileStorage.getCurrentServerMap();
    const sampleObj = this.getSampleObj(connSample, period);
    const sampleObjWithSn = this.mapSnToSampleObj(sampleObj, sMap);
    let result = this.getPeriodSampleList(sampleObjWithSn);
    if (Object.keys(result).length === 0) {
      // no data yet, just return server name
      Object.keys(sMap).map(sn => result[sn] = []);
    } else {
      result = this.fixPeerSample(result, sMap);
      // result = this.removeSample(result);
      result = this.fixStartEndSample(result, period);
    }
   
    return result;
  }

  getSampleObj(sample, period) {
    const date = new Date();
    const now = this.getNow();
    let sampleObj = {};
    const utcInterval = utils.getUtcInterval(period);
    (sample || []).forEach(sObj => {
      const sip = this.connPool.fileStorage.extractSip(sObj.sut || '');
      if ((now - sObj.t) <= utcInterval) {
        if (!sampleObj[sip]) sampleObj[sip] = {};
        sampleObj[sip][sObj.t] = {
          uc: sObj.uc,
          t: utils.formatDate(new Date(sObj.t), true)
        };
      }
    });

    return sampleObj;
  }

  mapSnToSampleObj(sampleObj, sMap) {
    const result = {};
    Object.keys(sMap || {}).forEach(sn => {
      const ips = sMap[sn] || [];
      ips.forEach(ip => {
        const data = sampleObj[ip];
        if (sampleObj[ip]) {
          if (!result[sn]) result[sn] = {};
          Object.assign(result[sn], data);
        }
      });
    });
    return result;
  }

  getNow() {
    const date = new Date();
    const secondInterval = date.getSeconds() * 1000;
    return date.getTime() - secondInterval;
  }

  getPeriodSampleList(sampleObjWithSn) {
    let result = {};
    const date = new Date();
    const now = this.getNow();
    const sampleInterval = utils.getSampleInterval(this.connPool.sampleInterval);      // To check if there is missing sample data
    const deviationInterval = utils.getDeviationInterval(date, this.connPool.sampleInterval);

    const sns = Object.keys(sampleObjWithSn);
    for (let i = 0; i < sns.length; i++) {
      const sn = sns[i];
      let tKeys = Object.keys(sampleObjWithSn[sn]);
      tKeys.sort((a, b) => a - b);
      let count = 0;
      result[sn] = [];
      for (let j = tKeys.length; j > 0; j--) {
        const t = tKeys[j - 1];
        const currentInterval = (now - t);
        const fixedSample = this.fixMissingSample(count, currentInterval, sampleInterval, deviationInterval, now);
        result[sn].push(...fixedSample.results, sampleObjWithSn[sn][t]);
        count = fixedSample.count + 1;
      }
    }

    return result;
  }
 
  fixMissingSample(count, curInval, sampInval, deviInval, now) {
    let results = [];
    const paddingInterval = utils.getSampleInterval(5);   // To check if there is missing sample data

    while (curInval - count * paddingInterval > sampInval) {
      const fixedUtcTime = now - count * paddingInterval - deviInval;
      const curTimer = new Date(fixedUtcTime);

      if(curTimer.getMinutes() % this.connPool.sampleInterval === 0) {
        results.push({
          uc: 0,
          t: utils.formatDate(curTimer, true)
        });
      }
      count++;
      // results.push({
      //   uc: 0,
      //   t: utils.formatDate(new Date(fixedUtcTime), true)
      // });
      // count++;
    }

    return {
      results: results,
      count: count
    };
  }

  fixPeerSample(resultObj, sMap) {
    const sns = Object.keys(sMap || {});
    let rKeys = Object.keys(resultObj || {});

    if (rKeys.length < sns.length) {
      const sampleArr = rKeys.length > 0 ? resultObj[rKeys[0]] || [] : [];
      sns.forEach(sn => {
        if (!resultObj[sn]) {
          resultObj[sn] = sampleArr.map(item => ({ uc: 0, t: item.t }))
        }
      });
    }

    return resultObj;
  }

  fixStartEndSample(sample, period) {
    const date = new Date();
    const now = date.getTime();
    const utcInterval = utils.getUtcInterval(period);
    const paddingInterval = utils.getSampleInterval(5);

    for(let sn in sample) {
      const startTime = new Date(now - utcInterval);
      const endTime = new Date(now);
      const stime = utils.formatDate(startTime, true);
      const etime = utils.formatDate(endTime, true);
      const sindex = sample[sn].findIndex(d => d.t === stime);
      const eindex = sample[sn].findIndex(d => d.t === etime);
      const length = sample[sn].length;

      for(let timer = new Date(sample[sn][length - 1].t).getTime() - paddingInterval; timer > startTime.getTime(); timer -= paddingInterval) {
        const curTimer = new Date(timer);

        if(curTimer.getMinutes() % this.connPool.sampleInterval === 0) {
          sample[sn].push({uc: null, t: utils.formatDate(curTimer, true)});
        }
        
      }

      for(let timer = new Date(sample[sn][0].t).getTime() + paddingInterval; timer < endTime.getTime(); timer += paddingInterval) {
        const curTimer = new Date(timer);

        if(curTimer.getMinutes() % this.connPool.sampleInterval === 0) {
          sample[sn].unshift({uc: null, t: utils.formatDate(curTimer, true)});
        }
      }

      if(sindex < 0) {
        sample[sn].push({
          uc: null,
          t: stime
        })
      }
      if(eindex < 0) {
        sample[sn].unshift({
          uc: null,
          t: etime
        })
      }

    }

    return sample;
  }

  removeSample(sample) {
    const sampleInvl = this.connPool.sampleInterval;

    for(let sn in sample) {
      sample[sn] = sample[sn].filter(d => {
        const min = new Date(d.t).getMinutes();

        return min % sampleInvl === 0;
      });
    }

    return sample;
  }

  async getInternalGroups() {
    const result = await bzdb.select('group');
    return result && result.data || [];
  }

  getTime(fmt) {
    const date = new Date();
    const o = {
      "M+": date.getMonth() + 1,                 //月份   
      "d+": date.getDate(),                    //日   
      "h+": date.getHours(),                   //小时   
      "m+": date.getMinutes(),                 //分   
      "s+": date.getSeconds(),                 //秒   
      "q+": Math.floor((date.getMonth() + 3) / 3), //季度   
      "S": date.getMilliseconds()             //毫秒   
    };
    if (/(y+)/.test(fmt))
      fmt = fmt.replace(RegExp.$1, (date.getFullYear() + "").substr(4 - RegExp.$1.length));
    for (var k in o)
      if (new RegExp("(" + k + ")").test(fmt))
        fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
    return fmt;
  }

  /**
   * 
   * @param {string} uid 
   * @param {number} start 
   * @param {number} end 
   * @returns {server1: [{uid: aa, ...}]}
   */
  async getHistoryData(uid, start, end) {
    const filter = {};
    if (uid) {
      filter.uid = uid.toLowerCase();
    }

    start = this.fixStart(start);
    end = this.fixEnd(end);
    filter.date = this.getHistoryDate(start, end);

    const serverMap = await this.connPool.fileStorage.getCurrentServerMap();
    const history = await this.connPool.fileStorage.getConnHistory(filter);
    let result = {};
    let uuidObj = {};

    const includeTime = (data) => data.st >= start && data.st <= end;
    const includeData = (data) => {
      const containUid = !uid || data.uid.toLowerCase() === uid.toLowerCase();
      return containUid && includeTime(data);
    }

    (history || []).forEach(item => {
      const {sip, uuid} = this.connPool.fileStorage.extractSipAndUuid(item.suuid || '');
      const sName = this.connPool.fileStorage.getSnByIp(sip, serverMap);
      if (sName) {
        if (!result[sName]) {
          result[sName] = [];
          uuidObj[sName] = [];
        }
        if (includeTime(item)) {
          result[sName].push(item);
          uuidObj[sName].push(uuid);
        }
      }
    });

    // append temp data(saved in local)
    const temp = await this.connPool.fileStorage.getClusterTemp();
    (temp || []).forEach(peer => {
       // different persistMethod between watchFile and normal mode.
      const peerData = this.reportSv.shareFS.status ? [peer] : utils.getConnItems(peer || {});
      if (peerData.length > 0) {
        const sName = utils.getServerNameFromUrl(peer.serverName || '');
        if (sName) {
          if (!result[sName]) {
            result[sName] = peerData.filter(data => includeData(data));
          } else {
            peerData.forEach(data => {
              if (includeData(data)) {
                const uuid = data.uuid;
                const idx = uuidObj[sName].indexOf(uuid);
                if (idx > -1) {
                  result[sName][idx] = data;
                } else {
                  result[sName].push(data);
                }
              }
            });
          }
        }
      }
    });

    // add missing peer
    const sns = Object.keys(serverMap);
    let final = {};
    (sns || []).forEach(sName => {
      let data = result[sName];
      if (!data) {
        final[sName] = [];
      } else {
        data.sort((a, b) => (b.st - a.st));
        final[sName] = data.map(item => {
          const st = item.st;
          const et = item.et;
          item.st = utils.formatDate(new Date(st), true, true);
          item.et = et ? utils.formatDate(new Date(et), true, true) : et;
          return item;
        });
      }
    });

    return final;
  }

  fixStart(start) {
    const earliest = this.getEarliestStart();
    if (!start) return earliest;
    return start < earliest ? earliest : start;
  }

  // the end time from client is 00:00:00, it should be 23:59:59
  fixEnd(end) {
    if (!end) return (new Date()).getTime();
    return end + utils.getDayInterval(); 
  }

  getEarliestStart() {
    const now = (new Date()).getTime();
    return now - this.connPool.getHistoryDays() * utils.getDayInterval();
  }

  getHistoryDate(start, end) {
    if (!start) start = this.fixStart();
    if (!end) end = this.fixEnd();
    
    const dayInterval = utils.getDayInterval();
    //the date is local timezone date: deal with the start and end to ensure get the whole data
    if (start) start = start - dayInterval;
    if (end) end = end + dayInterval;

    let result = [];
    let dateTime = [end];
    let n = 1;
    let nDateTime = end - n * dayInterval;
    while(nDateTime > start) {
      dateTime.push(nDateTime);
      n ++;
      nDateTime = end - n * dayInterval;
    }

    dateTime.push(start);
    dateTime.forEach(time => {
      const date = utils.getDate(new Date(time));
      if (result.indexOf(date) === -1) result.push(date);
    });
    return result;
  }

  updateConfig(config) {
    if (!this.enabled) return; // JSTE-16597, do nothing if not enabled.
    if (!config) return;

    const hDays = config && config.saveHistory && config.saveHistory.value;
    const sInterval = config && config.samplings && config.samplings.value;
    const tInterval = config && config.tempData && config.tempData.value;

    if (hDays) {
      this.connPool.setHistoryDays(hDays, true);
    }
    if (sInterval) {
      this.connPool.setSampleInterval(sInterval);
      this.connPool.setTime('sample');
      this.connPool.starts('sample');
    }
    if (tInterval) {
      this.connPool.setTempInterval(tInterval);
      this.connPool.setTime('temp');
      this.connPool.starts('temp');
    }
  }
};

const reportSrc = new UserReportService();
module.exports = reportSrc;
