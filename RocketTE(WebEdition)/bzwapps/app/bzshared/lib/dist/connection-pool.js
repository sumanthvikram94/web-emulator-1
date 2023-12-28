"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connPool = void 0;
const connId_pool_1 = require("./connId-pool");
const connection_memory_storage_1 = require("./connection-memory-storage");
const connection_file_storage_1 = require("./connection-file-storage");
const CronJob = require("cron");
const bzdb = require("../services/bzdb.service");
const zoweService = require("../services/zowe.service");
const jsonUtils = zoweService.jsonUtils;
const fs = require('fs-extra');
const path = require('path');
const zluxPath = path.join(__dirname, '../../../../deploy/instance/ZLUX/serverConfig/zluxserver.json');
const logger = global.COM_RS_COMMON_LOGGER.makeComponentLogger("bzw.connection-pool");
const MAX_CONNECT = 5000;
const CONN_STAT_ID = 'connStatId';
class ConnectionPool {
    constructor() {
        this.connIdPool = new connId_pool_1.ConnIdPool();
        this.memoryStorage = new connection_memory_storage_1.MemoryStorage();
        this.fileStorage = new connection_file_storage_1.FileStorage();
        this.sampleInterval = 5; // default interval is 5 minutes
        this.isNoAuth = false;
        this.poolSize = 0;
        this.tempInterval = 30; // default interval is 30 minutes
        this.historyDays = 14;
        this.sampleDays = 30;
        this.logger = logger;
        bzdb.waitLoadReady().then(async () => {
            await this.init();
        });
    }
    async init() {
        try {
            const config = fs.existsSync(zluxPath) ? jsonUtils.parseJSONWithComments(zluxPath) : undefined;
            this.bzw2hMode = config && config.bzw2hMode || false;
            this.setAdminConfig();
            if (this.adminConfigObj.enableUserReport && !this.bzw2hMode) {
                await this.fileStorage.reportSv.prepareEntity(this.logger, config);
                this.fileStorage.setLogger(this.logger);
                this.memoryStorage.setLogger(this.logger);
                await this.memoryStorage.clearClusterItems();
                await this.getConfig();
                await this.checkConnStat();
                await this.fileStorage.initServerInfo();
                await this.fileStorage.checkExtendEntity();
                await this.fileStorage.saveTempToExtendEntity();
                await this.fileStorage.checkHistory(this.historyDays); // when restart server, update end time of connTemp
                await this.updateSinceForConnStat();
                this.setPoolRotate();
                this.starts('all');
            }
        }
        catch (e) {
            this.logError(e);
        }
    }
    setAdminConfig() {
        const adminConfigs = ['instance', 'product'];
        for (let dir of adminConfigs) {
            const adminConfigPath = path.join(__dirname, `../../../../deploy/${dir}/ZLUX/pluginStorage/com.rs.bzadm/configurations/adminConfig.json`); //adminConfig path
            try {
                const adminConfig = fs.existsSync(adminConfigPath) ? jsonUtils.parseJSONWithComments(adminConfigPath) : null; // get adminConfig
                // set adminConfigPath
                if (adminConfig) {
                    this.adminConfigObj = adminConfig;
                    break;
                }
                else {
                    this.adminConfigObj = {};
                }
            }
            catch (err) {
                this.adminConfigObj = {};
                console.log(`Not found the adminConfig file in ${dir} folder`);
            }
        }
    }
    async getConfig() {
        const data = await bzdb.select('reportConfig');
        const config = data.data[0];
        const hDays = config && config.saveHistory && config.saveHistory.value;
        const sInterval = config && config.samplings && config.samplings.value;
        const tInterval = config && config.tempData && config.tempData.value;
        if (sInterval) {
            this.setSampleInterval(sInterval);
        }
        if (hDays) {
            this.setHistoryDays(hDays, false);
        }
        if (tInterval) {
            this.setTempInterval(tInterval);
        }
    }
    handleConnect(dataObj) {
        if (!this.adminConfigObj.enableUserReport || this.bzw2hMode)
            return {
                uuid: this.fileStorage.getUuid()
            };
        try {
            if (this.poolSize >= MAX_CONNECT) {
                this.logger.warn(`The connection number ${this.poolSize + 1} has exceed the max connection number ${MAX_CONNECT}`);
            }
            const node = {
                uuid: this.fileStorage.getUuid(),
                cid: this.connIdPool.getConnId()
            };
            if (this.fileStorage.reportSv.shareFS.status) {
                node['sn'] = this.fileStorage.reportSv.shareFS.id;
            }
            const connObj = Object.assign(node, dataObj);
            // for none auth: use clientIP to distinct users
            const ip = this.normalizeIP(dataObj.ip);
            connObj.uid = !connObj.uid ? ip : dataObj.uid;
            connObj.ip = ip;
            const that = this;
            (function update(obj) {
                that.memoryStorage.addToConnPool(obj);
                that.fileStorage.updateConnUserTemp(obj.uid);
                that.fileStorage.addToConnTemp(obj);
            })(connObj);
            this.poolSize++;
            return { uuid: connObj.uuid, cid: connObj.cid };
        }
        catch (e) {
            this.logError(e);
            return {};
        }
    }
    handleDisconnect(connIds) {
        if (!this.adminConfigObj.enableUserReport || this.bzw2hMode)
            return;
        try {
            const that = this;
            (function update(obj) {
                that.memoryStorage.removeFromConnPool(obj.uuid);
                that.connIdPool.enqueue(obj.cid);
                that.fileStorage.updateConnTemp(obj.uuid);
            })(connIds);
            this.poolSize--;
        }
        catch (e) {
            this.logError(e);
        }
    }
    logError(e) {
        if (!this.adminConfigObj.enableUserReport || this.bzw2hMode)
            return;
        this.logger.severe(e.stack ? e.stack : e.message);
        console.error(e);
    }
    async checkConnStat() {
        try {
            const statLocal = await this.fileStorage.getLocalStat();
            if (statLocal == null) { // return if statLocal is null
                return;
            }
            const statData = (this.fileStorage.utils.getConnItems(statLocal[0] || {}))[0];
            let stat = await this.getClusterStat();
            if ((!statData && stat) || (stat && stat.peakUc && (statData.since !== stat.since || statData.peakUc.count !== stat.peakUc.count))) {
                await this.fileStorage.updateLocalStat(stat);
            }
            return stat;
        }
        catch (e) {
            this.logError(e);
            return null;
        }
    }
    /**
     * 1. memory does not have stat:
     * (1). cluster memory does not have stat, update stat with init data
     * (2). cluster memory has stat, use memory stat to update stat
     */
    async updateSinceForConnStat() {
        try {
            const statLocal = await this.fileStorage.getLocalStat();
            const statData = (this.fileStorage.utils.getConnItems(statLocal[0] || {}))[0];
            if (!statData) {
                const stat = await this.getClusterStat();
                if (stat) {
                    await this.fileStorage.updateLocalStat(stat);
                }
                else {
                    const data = {
                        id: CONN_STAT_ID,
                        since: (new Date()).getTime(),
                        peakUc: null
                    };
                    await this.fileStorage.updateLocalStat(data);
                }
            }
        }
        catch (e) {
            this.logError(e);
        }
    }
    async getClusterStat() {
        let since = 0;
        let peakUc = null;
        try {
            const clusterStat = await this.fileStorage.getClusteLocalStat();
            if (clusterStat == null) { // return null if clusterStat is null
                return null;
            }
            clusterStat.forEach(peer => {
                const stat = this.fileStorage.utils.getConnItems(peer || {});
                if (stat.length === 1) {
                    const statData = stat[0];
                    if (!since || (since > statData.since)) {
                        since = statData.since;
                    }
                    if (statData.peakUc && (!peakUc || (peakUc.count <= statData.peakUc.count && peakUc.t < statData.peakUc.t))) {
                        peakUc = Object.assign({}, statData.peakUc);
                    }
                }
            });
            if (since) {
                return {
                    id: CONN_STAT_ID,
                    since: since,
                    peakUc: peakUc
                };
            }
            return null;
        }
        catch (e) {
            this.logError(e);
            return null;
        }
    }
    // update the uids for the cluster
    async resetDailyData() {
        try {
            await this.fileStorage.clearHistoryData(this.historyDays + 1, 1, true);
            await this.fileStorage.clearSampleData(this.sampleDays + 1, 1, true);
        }
        catch (e) {
            this.logError(e);
        }
    }
    async updateConnSampleData() {
        try {
            const t = (new Date()).getTime();
            const clusterItems = await this.memoryStorage.getClusterBasicItems();
            if (clusterItems == null) { // stop to insert if return null from getClusterBasicItems
                return;
            }
            const uc = await this.fileStorage.updateConnSampleTemp(clusterItems, t);
            const stat = await this.getClusterStat();
            if (!stat || !stat.peakUc || (stat.peakUc && stat.peakUc.count <= uc)) {
                const data = {
                    id: CONN_STAT_ID,
                    since: stat ? stat.since : t,
                    peakUc: {
                        count: uc,
                        t: t
                    }
                };
                await this.fileStorage.updateLocalStat(data);
                // if (uc > 0) {
                //     this.fileStorage.updatePeakDay();
                // }
            }
        }
        catch (e) {
            this.logError(e);
        }
    }
    // getSampleInterval() {
    //     if (!this.adminConfigObj.enableUserReport || this.bzw2hMode) return;
    //     return this.sampleInterval;
    // }
    // getTempInterval() {
    //     if (!this.adminConfigObj.enableUserReport || this.bzw2hMode) return;
    //     return this.tempInterval;
    // }
    getHistoryDays() {
        return this.historyDays;
    }
    setPoolRotate() {
        this.setDailyRotate();
        this.setSampleRotate();
        this.setTempRotate();
    }
    starts(type) {
        if (this.dailyRotate && (type === 'daily' || type === 'all')) {
            this.dailyRotate.start();
        }
        if (this.sampleRotate && (type === 'sample' || type === 'all')) {
            this.sampleRotate.start();
        }
        if (this.tempRotate && (type === 'temp' || type === 'all')) {
            this.tempRotate.start();
        }
    }
    setTime(type) {
        if (this.dailyRotate && (type === 'daily' || type === 'all')) {
            this.dailyRotate.setTime(new CronJob.CronTime(`59 59 23 * * *`));
        }
        if (this.sampleRotate && (type === 'sample' || type === 'all')) {
            this.sampleRotate.setTime(new CronJob.CronTime(`*/${this.sampleInterval} * * * *`));
        }
        if (this.tempRotate && (type === 'temp' || type === 'all')) {
            this.tempRotate.setTime(new CronJob.CronTime(`*/${this.tempInterval} * * * *`));
        }
    }
    setSampleInterval(sInterval) {
        this.sampleInterval = sInterval;
    }
    setTempInterval(tInterval) {
        this.tempInterval = tInterval;
    }
    async setHistoryDays(hDays, clear = true) {
        const oldVal = this.historyDays;
        const newVal = hDays > 14 ? 14 : hDays;
        this.historyDays = newVal;
        if (clear && newVal < oldVal) {
            const delta = oldVal - newVal + 1;
            await this.fileStorage.clearHistoryData(newVal, delta);
        }
    }
    normalizeIP(ip) {
        if (ip.indexOf('::ffff:') === 0) {
            return ip.substring(7);
        }
        // for localhost
        if (ip === '::1') {
            return '127.0.0.1';
        }
        /**
        * X-Forwarded-For: client, proxy1, proxy2
        * the left-most is the original client
       */
        ip = ip.includes(',') ? ip.split(',')[0] : ip;
        /**
        * For some users, ip contains port, such as 10.0.0.1:8543,
        * Check if port is included in ip： IPV4 has 2 parts and IPV6 has 9 parts.
        * if include port,  truncate to get ip
        */
        const ipParts = ip.split(':');
        if (ipParts.length == 2 || ipParts.length == 9) {
            ip = ip.substring(0, ip.lastIndexOf(':'));
        }
        return ip;
    }
    setDailyRotate() {
        this.dailyRotate = new CronJob.CronJob({
            cronTime: `01 00 00 * * *`,
            onTick: async () => {
                try {
                    await this.resetDailyData();
                }
                catch (e) {
                    this.logger.warn('Exception occurs when reset daily connection data: ', e);
                }
            },
            timeZone: 'UTC'
        });
    }
    setSampleRotate() {
        this.sampleRotate = new CronJob.CronJob({
            cronTime: `*/${this.sampleInterval} * * * *`,
            onTick: async () => {
                try {
                    await this.updateConnSampleData();
                }
                catch (e) {
                    this.logger.warn('Exception occurs when sample connection data: ', e);
                }
            },
            timeZone: 'UTC'
        });
    }
    setTempRotate() {
        this.tempRotate = new CronJob.CronJob({
            cronTime: `*/${this.tempInterval} * * * *`,
            onTick: async () => {
                try {
                    const isReady = await this.fileStorage.isReadyStatus();
                    if (isReady) {
                        // JERRY: consider postpone the operation instead of canceling it?
                        await this.fileStorage.updateHistoryAndTempData();
                        await this.fileStorage.updateUserAndUserTemp();
                        await this.fileStorage.updateSampleAndSampleTemp();
                    }
                }
                catch (e) {
                    this.logger.warn('Exception occurs when sync temp data: ', e);
                }
            },
            timeZone: 'UTC'
        });
    }
}
const connPool = new ConnectionPool();
exports.connPool = connPool;
module.exports = connPool;
//# sourceMappingURL=connection-pool.js.map