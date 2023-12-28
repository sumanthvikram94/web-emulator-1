import * as bzdb from '../services/bzdb.service';
import * as reportSv from './report-service';

import { PoolBasicItem, PoolGroupItem, PoolItem } from './connection-ifc'

const BASIC_ENTITY = 'connPoolBasic';
const GROUP_ENTITY = 'connPoolGroup';

class MemoryStorage {
    logger: any;
    reportSv: any = reportSv;
    constructor() { }

    setLogger(logger) {
        this.logger = logger;
    }

    async addToConnPool(dataObj: PoolItem) {
        const basicData: PoolBasicItem = this.exceptKeyForObj(dataObj, 'grps');
        const groupData: PoolGroupItem = this.exceptKeyForObj(dataObj, 'ip');
        const bResult = await bzdb.insert(BASIC_ENTITY, basicData);
        // const bResult = await bzdb.insert(BASIC_ENTITY, basicData, true); // not print to log
        if (!bResult.status) {
            this.logger.severe(`Insert ${BASIC_ENTITY} failed: ${bResult.message}; the data is ${JSON.stringify(basicData)}`)
        }

        const gResult = await bzdb.insert(GROUP_ENTITY, groupData);
        // const gResult = await bzdb.insert(GROUP_ENTITY, groupData, true); // not print to log
        if (!gResult.status) {
            this.logger.severe(`Insert ${GROUP_ENTITY} failed: ${gResult.message}; the data is ${JSON.stringify(groupData)}`)
        }
    }

    async removeFromConnPool(uuid: string) {
        const filter = { uuid };
        const bResult = await bzdb.delete(BASIC_ENTITY, filter, undefined);
        // const bResult = await bzdb.delete(BASIC_ENTITY, filter, undefined, true);  // not print to log
        if (!bResult.status) {
            this.logger.severe(`Delete ${BASIC_ENTITY} failed: ${bResult.message}; the uuid is ${uuid}`)
        }
        const gResult = await bzdb.delete(GROUP_ENTITY, filter, undefined);
        // const gResult = await bzdb.delete(GROUP_ENTITY, filter, undefined, true); // not print to log
        if (!gResult.status) {
            this.logger.severe(`Delete ${GROUP_ENTITY} failed: ${gResult.message}; the uuid is ${uuid}`)
        }
    }

    async getBasicItems() {
        const result = await bzdb.select(BASIC_ENTITY);
        return result && result.data || [];
    }

    async getGroupItems() {
        const result = await bzdb.select(GROUP_ENTITY);
        return result && result.data || [];
    }

    /**
    * [
    *   {
    *     id: peerId
    *     name: serverName
    *     status: online,
    *     data: {data: [], rowCount: number},
    *     inNet:
    *   }
    * ]
     * @returns 
     */
    async getClusterBasicItems() {
        try {
            const result = await bzdb.select(BASIC_ENTITY, {}, { selectCluster: true });
            return result && result.data || [];
        } catch(err) {
            this.logger.severe(`Failed to get clusterBasicItems: ${JSON.stringify(err)}`);
            return null;
        }
       
    }

    async getClusterGroupItems() {
        try {
            const result = await bzdb.select(GROUP_ENTITY, {}, { selectCluster: true });
            return result && result.data || [];
        } catch(err) {
            this.logger.severe(`Failed to get clusterGroupItems: ${JSON.stringify(err)}`);
            return null;
        }
    }

    /**
     * in share mode:
     *   persistMethod is PERSIST_METHOD_COMBINED_FILE for connPoolBasic | connPoolGroup
     * when restart server, it should delete existing files
     * 
     */
    async clearClusterItems() {
        try {
            if(!this.reportSv.shareFS.status) return;

            const gResult = await bzdb.delete(GROUP_ENTITY, { sn:  this.reportSv.shareFS.id});
            if (!gResult.status) {
                this.logger.severe(`Delete ${GROUP_ENTITY} failed: ${gResult.message};`)
            }
            const bResult = await bzdb.delete(BASIC_ENTITY, { sn:  this.reportSv.shareFS.id});
            if (!bResult.status) {
                this.logger.severe(`Delete ${BASIC_ENTITY} failed: ${bResult.message};`)
            }
        } catch(err) {
            this.logger.severe(`Failed to delete ClusterItems: ${JSON.stringify(err)}`);
        }
    }

    exceptKeyForObj(dataObj: any, key: string) {
        let result: any = {};
        Object.keys(dataObj || {}).forEach(dKey => {
            if (dKey !== key) result[dKey] = dataObj[dKey];
        });
        return result;
    }

}

export { MemoryStorage }
