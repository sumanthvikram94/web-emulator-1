"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileStorage = void 0;
const bzdb = require("../services/bzdb.service");
const utils = require("../services/conn-utils");
const ReportSv = require("./report-service");
/** For peak user count - ever recorded and server first startup time */
const CONN_LOCAL_DATA_ENTITY = 'connLocalData';
const META_DATA_CONN_STAT = {
    fileName: 'connStat.json',
    backupFilePaths: []
};
/** For unique user - ever recorded */
const CONN_USER_TEMP_ENTITY = 'connUserTemp';
const CONN_USER_ENTITY = 'connUser';
/** For sample data */
const CONN_SAMPLE_TEMP_ENTITY = 'connSampleTemp';
const CONN_SAMPLE_ENTITY = 'connSample';
/** For user history */
const CONN_TEMP_ENTITY = 'connTemp';
const CONN_HISTORY_ENTITY = 'connHistory';
// const CONN_PEAK_DAY = 'connPeakDay';
// To avoid performance issue, the temp tables won't accept too much data.
const TEMP_ENTITY_MAX_RECORDS = 20000;
const SYM = String.fromCharCode(255);
class FileStorage {
    constructor() {
        this.serverId = '';
        this.serverName = '';
        this.localIp = '';
        this.utils = utils;
        this.reportSv = ReportSv;
        this.extendEntityConfig = [
            {
                name: CONN_USER_ENTITY,
                primaryKeys: ['uid'],
                dataStrategy: 3,
                integratyLevel: 3,
                analyzeMethod: 2 //BZDB.AnalyzeMethod.ANALYZE_METHOD_FILE_SIZE
            },
            {
                name: CONN_SAMPLE_ENTITY,
                primaryKeys: ['sut'],
                dataStrategy: 3,
                integratyLevel: 3,
                analyzeMethod: 2,
                partitions: {
                    date: 30
                }
            },
            {
                name: CONN_HISTORY_ENTITY,
                primaryKeys: ['suuid'],
                dataStrategy: 3,
                integratyLevel: 3,
                analyzeMethod: 2,
                partitions: {
                    uid: 20,
                    date: 30
                }
            }
        ];
    }
    setLogger(logger) {
        this.logger = logger;
    }
    async initServerInfo() {
        await this.getServerId();
        await this.getLocalIp();
    }
    async getServerId() {
        const metaNode = await this.reportSv.select('meta_node');
        this.serverId = metaNode.data && metaNode.data[0] && metaNode.data[0].id || '';
    }
    async getLocalIp() {
        const metaPeers = await this.reportSv.select('meta_peers', { id: this.serverId });
        this.localIp = metaPeers.data && metaPeers.data[0] && metaPeers.data[0].localIp || utils.getLocalIp();
    }
    async checkExtendEntity() {
        // const batchTxnData: any[] = [];
        for await (let entity of this.extendEntityConfig) {
            entity.name = this.getExtendEntityName(entity.name);
            await bzdb.create('ENTITY', entity);
            // const result = await bzdb.select(entity.name);
            // if (!result.data) {
            //     const createResult = await bzdb.create('ENTITY', entity);
            //     if (!createResult.status) {
            //         this.logger.severe(`Create entity ${entity.name} failed: ${createResult.message}; the entity is ${JSON.stringify(entity)}`)
            //     }
            // }
        }
    }
    async saveTempToExtendEntity() {
        const isReady = await this.isReadyStatus();
        if (isReady) {
            await this.saveTempToHistory();
            await this.updateSampleAndSampleTemp();
            await this.updateUserAndUserTemp();
        }
    }
    getExtendEntityName(name, ip) {
        const ipStr = ip ? ip : this.getSip();
        return name + '_' + ipStr;
    }
    async getCurrentServerMap() {
        let result = {};
        let mapResult = await this.getUpgradeServerMap();
        const metaPeers = await this.reportSv.select('meta_peers');
        (metaPeers.data || []).forEach(peer => {
            const ip = utils.truncLocalIp(peer.localIp || '');
            const sn = utils.getServerNameFromUrl(peer.serverURL || '');
            if (peer.id === this.serverId && !this.serverName)
                this.serverName = sn;
            if (!result[sn])
                result[sn] = [];
            if (mapResult[sn])
                result[sn].push(...mapResult[sn]);
            if (result[sn].indexOf(ip) === -1) {
                result[sn].push(ip);
            }
        });
        return result;
    }
    async getUpgradeServerMap() {
        let result = {};
        const entity = utils.getUpgradeMetaEntity();
        const upgradeMap = await bzdb.select(entity);
        (upgradeMap.data || []).forEach(item => {
            const ip = item.ip;
            if (ip) {
                const sn = utils.getServerNameFromUrl(item.serverURL || '');
                if (!result[sn])
                    result[sn] = [];
                if (result[sn].indexOf(ip) === -1) {
                    result[sn].push(ip);
                }
            }
        });
        return result;
    }
    getSnByIp(ip, sMap = {}) {
        let result = '';
        const sns = Object.keys(sMap);
        for (let sn of sns) {
            const ips = sMap[sn] || [];
            if (ips.indexOf(ip) > -1) {
                result = sn;
                break;
            }
        }
        return result;
    }
    async getIpsForCurrentSn() {
        const serverMap = await this.getCurrentServerMap();
        return serverMap[this.serverName] || [];
    }
    async getLocalStat() {
        try {
            const result = await bzdb.select(CONN_LOCAL_DATA_ENTITY, META_DATA_CONN_STAT);
            return result && result.data || [];
        }
        catch (err) {
            this.logger.severe(`Failed to get localStat: ${JSON.stringify(err)}`);
            return null;
        }
    }
    async updateLocalStat(data) {
        const result = await bzdb.updateOrInsert(CONN_LOCAL_DATA_ENTITY, {
            data: data,
            fileName: META_DATA_CONN_STAT.fileName
        });
        // }, true); // not print to log
        if (!result.status) {
            this.logger.severe(`update local stat failed: ${result.message}; the data is ${JSON.stringify(data)}`);
        }
    }
    async getClusteLocalStat() {
        try {
            const result = await bzdb.select(CONN_LOCAL_DATA_ENTITY, META_DATA_CONN_STAT, { selectCluster: true });
            return result && result.data || [];
        }
        catch (err) {
            this.logger.severe(`Failed to get clusteLocalStat: ${JSON.stringify(err)}`);
            return null;
        }
    }
    getSampleData(items, time) {
        let uids = [];
        const shareFS = this.reportSv.shareFS;
        items.forEach((item) => {
            const uid = item.uid;
            if (uids.indexOf(uid) === -1 && (shareFS.status ? item.sn === shareFS.id : true)) {
                uids.push(uid);
            }
        });
        const sample = {
            uc: uids.length,
            sc: items.length || 0,
            t: time
        };
        if (shareFS.status) {
            sample['sn'] = shareFS.id;
        }
        return sample;
    }
    async filterExtendEntities(filter) {
        let result = [];
        const serverMap = await this.getCurrentServerMap();
        const sns = Object.keys(serverMap);
        (sns || []).forEach(sn => {
            const ips = serverMap[sn] || [];
            ips.forEach(ip => result.push(`${filter}_${ip}`));
        });
        return result;
    }
    async getEntitiesData(entities, filter = {}) {
        // let result: any[] = [];
        // for await (let item of entities) {
        //     const itemData = await bzdb.select(item, filter || {});
        //     const data = itemData && itemData.data || [];
        //     if (data.length > 0) {
        //         result = result.concat(data);
        //     }
        // }
        const promises = [];
        for (const item of entities) {
            const itemData = bzdb.select(item, filter || {});
            promises.push(itemData);
        }
        let result = [];
        const data = await Promise.all(promises);
        for (let value of data) {
            const v = value && value.data || [];
            if (v.length > 0) {
                result = result.concat(v);
            }
        }
        return result;
    }
    async getConnSample(filter) {
        const entities = await this.filterExtendEntities(CONN_SAMPLE_ENTITY);
        let result = await this.getEntitiesData(entities, filter);
        const temp = await this.getClusterSampleTemp();
        result = result.concat(temp);
        return result;
    }
    async getConnHistory(filter) {
        const entities = await this.filterExtendEntities(CONN_HISTORY_ENTITY);
        const result = await this.getEntitiesData(entities, filter);
        return result;
    }
    async getClusterTemp() {
        const result = await bzdb.select(CONN_TEMP_ENTITY, {}, { selectCluster: true });
        return result && result.data || [];
    }
    // async updatePeakDay() {
    //     const date = utils.getDate();
    //     const sampleData: SampleData[] = await this.getConnSample({ date: date });
    //     let data: SampleData[] = [];
    //     const sip = this.getSip();
    //     sampleData.forEach(item => {
    //         if (item.sut.indexOf(sip) === 0) {
    //             data.push(item);
    //         }
    //     });
    //     bzdb.updateOrInsert(CONN_PEAK_DAY, { sip, date, data });
    // }
    async addToConnTemp(connObj) {
        const count = await bzdb.count(CONN_TEMP_ENTITY);
        if (count.rowCount > TEMP_ENTITY_MAX_RECORDS) {
            // This is to protect the server. 
            // When very high work load and data conflict happens, data volume in connTemp could keep grow.
            // When data volume is too big, server will be stuck by the read / write of connTemp.
            this.logger.severe(`Data entity ${CONN_TEMP_ENTITY} has reached its row count limit, can not insert more data.`);
            return;
        }
        const dateObj = new Date();
        const date = utils.getDate(dateObj);
        const data = {
            uuid: connObj.uuid,
            cid: connObj.cid,
            uid: connObj.uid,
            ip: connObj.ip,
            date: date,
            st: dateObj.getTime(),
            et: null
        };
        if (this.reportSv.shareFS.status) {
            data.sn = connObj.sn;
        }
        const result = await bzdb.insert(CONN_TEMP_ENTITY, data);
        // const result = await bzdb.insert(CONN_TEMP_ENTITY, data, true);  // not print to log
        if (!result.status) {
            this.logger.severe(`update connTemp failed: ${result.message}; the data is ${JSON.stringify(data)}`);
        }
    }
    async updateConnTemp(uuid) {
        await bzdb.update(CONN_TEMP_ENTITY, { uuid }, { et: (new Date).getTime() }, undefined);
        // await bzdb.update(CONN_TEMP_ENTITY, { uuid }, { et: (new Date).getTime() }, undefined, true) // not print to log
    }
    async updateHistoryAndTempData() {
        const temp = await bzdb.select(CONN_TEMP_ENTITY);
        const tempData = temp.data || [];
        const rmUuids = [];
        const htDatas = [];
        for (const tempItem of tempData) {
            if (tempItem.et) {
                rmUuids.push(tempItem.uuid);
            }
            const htData = Object.assign({
                suuid: this.getSuuid(tempItem.uuid)
            }, tempItem);
            if (htData.uuid)
                delete htData.uuid;
            htDatas.push(htData);
        }
        // update or insert connHistory
        if (htDatas.length > 0) {
            const entityName = this.getExtendEntityName(CONN_HISTORY_ENTITY);
            const historyResult = await bzdb.bulkLoad(entityName, htDatas, undefined);
            // const historyResult =  await bzdb.bulkLoad(entityName, htDatas, undefined, true); // not print to log
            if (!historyResult.status) {
                this.logger.severe(`update ${entityName} failed: ${historyResult.message}; the data is ${JSON.stringify(htDatas)}`);
            }
        }
        // update temp data
        if (rmUuids.length > 0) {
            const tempResult = await bzdb.delete(CONN_TEMP_ENTITY, { uuid: rmUuids }, undefined);
            // const tempResult = await bzdb.delete(CONN_TEMP_ENTITY, { cid: rmCids }, undefined, true);// not print to log
            if (!tempResult.status) {
                this.logger.severe(`Delete connTemp data failed: ${tempResult.message}; the data ids is ${JSON.stringify(rmUuids)}`);
            }
        }
    }
    /**
     *
     * @param maxDays
     * when restart server
     * 1. temp data saved to history, clear temp
     * 2. clear history data -- clear the data exceed the max days
     * 3. check history data -- if et is null, update to current utc time
     */
    async checkHistory(maxDays) {
        // await this.saveTempToHistory();
        await this.clearHistoryData(maxDays, 14);
        await this.checkHistoryData();
    }
    async checkHistoryData() {
        const dt = new Date();
        const et = dt.getTime();
        const currentDate = utils.getDate(dt);
        const ips = await this.getIpsForCurrentSn();
        for await (let ip of ips) {
            const entityName = this.getExtendEntityName(CONN_HISTORY_ENTITY, ip);
            // This should handle server restart, date should be the same as before server restart.
            const hData = await bzdb.select(entityName, { date: currentDate });
            let newData = [];
            (hData.data || []).forEach((item) => {
                if (!item.et) {
                    item.et = et;
                    newData.push(item);
                }
            });
            if (newData.length > 0) {
                const result = await bzdb.bulkLoad(entityName, newData, undefined);
                // const result = await bzdb.bulkLoad(entityName, newData, undefined, true); // not print to log
                if (!result.status) {
                    this.logger.severe(`Update ${entityName} when restart server failed: ${result.message}; the data ids is ${JSON.stringify(newData)}; the result is ${JSON.stringify(result.results)}`);
                }
            }
        }
    }
    async saveTempToHistory() {
        const time = (new Date()).getTime();
        const uDatas = [];
        const filter = this.reportSv.shareFS.status ? { sn: this.reportSv.shareFS.id } : {};
        const temp = await bzdb.select(CONN_TEMP_ENTITY, filter);
        const tempData = temp.data || [];
        tempData.forEach(tempItem => {
            if (!tempItem.et)
                tempItem.et = time;
            const htData = Object.assign({
                suuid: this.getSuuid(tempItem.uuid)
            }, tempItem);
            if (htData.uuid)
                delete htData.uuid;
            uDatas.push(htData);
        });
        // update connTemp which the et still null after restart server
        if (uDatas.length > 0) {
            const entityName = this.getExtendEntityName(CONN_HISTORY_ENTITY);
            const result = await bzdb.bulkLoad(entityName, uDatas, undefined);
            // const result = await bzdb.bulkLoad(entityName, uDatas, undefined, true);// not print to log
            if (!result.status) {
                this.logger.severe(`Update temp data to ${entityName} failed when restart server: ${result.message}; the data ids is ${JSON.stringify(uDatas)}; the result is ${JSON.stringify(result.results)}`);
            }
        }
        const rResult = await bzdb.delete(CONN_TEMP_ENTITY, undefined, undefined);
        // const rResult = await bzdb.delete(CONN_TEMP_ENTITY, undefined, undefined, true);// not print to log
        if (!rResult.status) {
            this.logger.severe(`Clear temp data failed when restart server: ${rResult.message}`);
        }
    }
    getUuid() {
        return bzdb.getUIDSync(36, 1);
    }
    getSip() {
        return utils.truncLocalIp(this.localIp);
    }
    getSuuid(uuid) {
        uuid = !uuid ? this.getUuid() : uuid;
        return this.getSip() + SYM + uuid;
    }
    extractSip(suuid) {
        const arr = suuid.split(SYM);
        return arr[0] || '';
    }
    extractSipAndUuid(suuid) {
        const arr = suuid.split(SYM);
        return { sip: arr[0] || '', uuid: arr[1] || '' };
    }
    getSut() {
        const ut = utils.getUTCDateTime(new Date());
        return this.getSip() + SYM + ut;
    }
    extractUt(sut) {
        const arr = sut.split(SYM);
        return Number(arr[1] || 0);
    }
    // async isReadyStatus() {
    //     const result = await bzdb.checkStatus();
    //     const data = (result && result.data || []).filter(item => item.id === this.serverId);
    //     return data.status === 'ready';
    // }
    async isReadyStatus() {
        const result = await bzdb.checkStatus();
        const data = result && result.data || [];
        const invalidStatus = ['checkin', 'pulling', 'data conflict'];
        // JERRY: Consider check the chain status only. Or remove this check directly.
        let isReady = true;
        for (let item of data) {
            if (invalidStatus.indexOf(item.status) > -1) {
                isReady = false;
                break;
            }
        }
        return isReady;
    }
    async getClearBatchTxn(entity, maxDays, delta = 1, isDaily = false) {
        const batchTxnData = [];
        const now = new Date().getTime();
        const date = utils.getExceedDate(maxDays, delta);
        if (!isDaily) {
            const start = now - maxDays * utils.getDayInterval();
            const needHandleDate = date.shift();
            const firstDateData = await bzdb.select(entity, { date: needHandleDate });
            const filters = new Map();
            (firstDateData.data || []).forEach(item => {
                const st = item.st;
                const dt = item.date;
                if (st < start) {
                    if (!filters.has(dt)) {
                        filters.set(dt, []);
                    }
                    const sts = filters.get(dt);
                    sts?.push(st);
                }
            });
            filters.forEach((filter) => {
                const dt = filter[0];
                const st = filter[1];
                batchTxnData.push({
                    dataEntityName: entity,
                    action: 'DELETE',
                    value: {},
                    options: { filter: { date: dt, st } }
                });
            });
        }
        if (date.length > 0) {
            batchTxnData.push({
                dataEntityName: entity,
                action: 'DELETE',
                value: {},
                options: { filter: { date } }
            });
        }
        return batchTxnData;
    }
    async clearHistoryData(maxDays, delta = 1, isDaily = false) {
        const ips = await this.getIpsForCurrentSn();
        let batchTxnData = [];
        for await (let ip of ips) {
            const entityName = this.getExtendEntityName(CONN_HISTORY_ENTITY, ip);
            const currentTxn = await this.getClearBatchTxn(entityName, maxDays, delta, isDaily);
            batchTxnData.push(...currentTxn);
        }
        if (batchTxnData.length > 0) {
            const result = await bzdb.batchTxn(batchTxnData);
            if (!result.status) {
                this.logger.severe(`Clear history data failed : ${result.message}; the data is ${JSON.stringify(batchTxnData)}; the results is ${JSON.stringify(result.results)}`);
            }
        }
    }
    async clearSampleData(maxDays, delta = 1, isDaily = false) {
        const ips = await this.getIpsForCurrentSn();
        let batchTxnData = [];
        for await (let ip of ips) {
            const entityName = this.getExtendEntityName(CONN_SAMPLE_ENTITY, ip);
            const currentTxn = await this.getClearBatchTxn(entityName, maxDays, delta, isDaily);
            batchTxnData.push(...currentTxn);
        }
        if (batchTxnData.length > 0) {
            const result = await bzdb.batchTxn(batchTxnData);
            if (!result.status) {
                this.logger.severe(`Clear sample data failed : ${result.message}; the data is ${JSON.stringify(batchTxnData)}; the result is ${JSON.stringify(result.results)}`);
            }
        }
    }
    async updateConnUserTemp(uid) {
        const originData = await bzdb.select(CONN_USER_TEMP_ENTITY, { uid });
        if (originData.data && originData.data.length === 0) {
            const result = await bzdb.insert(CONN_USER_TEMP_ENTITY, { uid });
            // const result = await bzdb.insert(CONN_USER_TEMP_ENTITY, { uid }, true); //not print to log
            if (!result.status) {
                this.logger.severe(`Update ${CONN_USER_TEMP_ENTITY} failed : ${result.message}; the user id is ${uid}`);
            }
        }
    }
    async updateUserAndUserTemp() {
        const filter = this.reportSv.shareFS.status ? { sn: this.reportSv.shareFS.id } : {};
        const temp = await bzdb.select(CONN_USER_TEMP_ENTITY, filter);
        const tempData = temp.data || [];
        // update or insert connUser; remove user temp
        if (tempData.length > 0) {
            const entityName = this.getExtendEntityName(CONN_USER_ENTITY);
            const originData = await bzdb.select(entityName);
            const newData = [];
            const rids = [];
            tempData.forEach(item => {
                rids.push(item.uid);
                const idx = (originData.data || []).findIndex(d => d.uid === item.uid);
                if (idx === -1) {
                    newData.push(item);
                }
            });
            if (newData.length > 0) {
                const result = await bzdb.bulkLoad(entityName, tempData, undefined);
                // const result = await bzdb.bulkLoad(entityName, tempData, undefined, true);//not print to log
                if (!result.status) {
                    this.logger.severe(`Update ${entityName} failed : ${result.message}; the data is ${JSON.stringify(tempData)}`);
                }
            }
            const deleteResult = await bzdb.delete(CONN_USER_TEMP_ENTITY, { uid: rids }, undefined);
            // const deleteResult = await bzdb.delete(CONN_USER_TEMP_ENTITY, {uid: rids}, undefined, true); //not print to log
            if (!deleteResult.status) {
                this.logger.severe(`Delete ${CONN_USER_TEMP_ENTITY} data failed : ${deleteResult.message}; the data is ${JSON.stringify(rids)}`);
            }
        }
    }
    async getConnUserCount() {
        const entities = await this.filterExtendEntities(CONN_USER_ENTITY);
        let result = await this.getEntitiesData(entities) || [];
        const userTemp = await this.getClusterUserTemp() || [];
        result = result.concat(userTemp);
        let uids = [];
        result.forEach((item) => {
            const uid = (item.uid || '').toLowerCase();
            if (uids.indexOf(uid) === -1) {
                uids.push(uid);
            }
        });
        return uids.length;
    }
    async getClusterUserTemp() {
        let result = [];
        const temp = await bzdb.select(CONN_USER_TEMP_ENTITY, {}, { selectCluster: true });
        const data = temp && temp.data || [];
        data.forEach(peer => {
            const peerData = utils.getConnItems(peer || {});
            result = result.concat(peerData);
        });
        return result;
    }
    /**
     * update connLocalData and connSampleTemp
     * @param clusterItems
     * @param t
     * @returns auc which used to update connLocalData
     */
    async updateConnSampleTemp(clusterItems, t) {
        const inShareMode = this.reportSv.shareFS.status;
        let uc = 0, auc = 0;
        let currentSampleData = {
            sut: this.getSut(),
            uc: 0,
            sc: 0,
            t: t,
            date: utils.getDate()
        };
        clusterItems.forEach(peer => {
            const id = inShareMode ? peer.sn : peer.id || '';
            const sampleData = this.getSampleData(inShareMode ? [peer] : utils.getConnItems(peer), t);
            auc += sampleData.uc || 0;
            if (this.serverId === id) {
                uc += sampleData.uc || 0;
                currentSampleData = Object.assign(currentSampleData, sampleData);
            }
        });
        if (inShareMode) {
            currentSampleData.sn = this.reportSv.shareFS.id;
            currentSampleData.uc = uc;
        }
        const result = await bzdb.updateOrInsert(CONN_SAMPLE_TEMP_ENTITY, currentSampleData);
        // const result = await bzdb.updateOrInsert(CONN_SAMPLE_TEMP_ENTITY, currentSampleData, true); // not print to log
        if (!result.status) {
            this.logger.severe(`update ${CONN_SAMPLE_TEMP_ENTITY} failed: ${result.message}; the data is ${JSON.stringify(currentSampleData)}`);
            return uc;
        }
        return auc;
    }
    async updateSampleAndSampleTemp() {
        const filter = this.reportSv.shareFS.status ? { sn: this.reportSv.shareFS.id } : {};
        const temp = await bzdb.select(CONN_SAMPLE_TEMP_ENTITY, filter);
        const tempData = temp.data || [];
        const rmSuts = [];
        tempData.forEach(tempItem => {
            rmSuts.push(tempItem.sut);
        });
        // update connSample
        if (tempData.length > 0) {
            const entityName = this.getExtendEntityName(CONN_SAMPLE_ENTITY);
            const sampleResult = await bzdb.bulkLoad(entityName, tempData, undefined);
            // const sampleResult = await bzdb.bulkLoad(entityName, tempData, undefined, true); // not print to log
            if (!sampleResult.status) {
                this.logger.severe(`update ${entityName} failed: ${sampleResult.message}; the data is ${JSON.stringify(tempData)}`);
            }
        }
        // remove temp data
        if (rmSuts.length > 0) {
            const tempResult = await bzdb.delete(CONN_SAMPLE_TEMP_ENTITY, { sut: rmSuts }, undefined);
            // const tempResult = await bzdb.delete(CONN_SAMPLE_TEMP_ENTITY, { sut: rmSuts }, undefined, true);  // not print to log
            if (!tempResult.status) {
                this.logger.severe(`Delete connSampleTemp data failed: ${tempResult.message}; the data ids is ${JSON.stringify(rmSuts)}`);
            }
        }
    }
    async getClusterSampleTemp() {
        let result = [];
        // const filter = this.reportSv.shareFS.status ? {sn: this.reportSv.shareFS.id} : {};
        const temp = await bzdb.select(CONN_SAMPLE_TEMP_ENTITY, {}, { selectCluster: true });
        const data = temp && temp.data || [];
        data.forEach(peer => {
            const peerData = this.reportSv.shareFS.status ? peer : utils.getConnItems(peer || {});
            result = result.concat(peerData);
        });
        return result;
    }
}
exports.FileStorage = FileStorage;
//# sourceMappingURL=connection-file-storage.js.map