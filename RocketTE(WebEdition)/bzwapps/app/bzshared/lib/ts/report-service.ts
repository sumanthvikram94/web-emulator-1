import * as bzdb from '../services/bzdb.service';

interface SharedFSMap {
  status: boolean;
  id: string;
}

class ReportSv {
  serverRunSv: any;
  shareFS: SharedFSMap = {
    status: false, // shared file system: different server use same shared path to save data
    id: '' // current server id
  }

  constructor() {}

  async updateOrInsert(dataEntityName, value, isSilent) {
    return await bzdb.updateOrInsert(dataEntityName, value, isSilent)
  }

  /**
   * no meta_node and meta_peers in shareFS, 
   * select meta_node_temp and meta_peers_temp to replace meta_node and meta_peers
   */
  async select(dataEntityName, filter: any = {}, options) {
    if(!this.shareFS.status) {
      return await bzdb.select(dataEntityName, filter, options);
    }

    if(dataEntityName === 'meta_node') {
      filter.id = this.shareFS.id;
      const node = await bzdb.select(`_${dataEntityName}_temp`, filter, options)

      return node;
    }

    if(dataEntityName === 'meta_peers') {
      const peers = await bzdb.select(`_${dataEntityName}_temp`, filter, options);

      return peers;
    }

    const data = await bzdb.select(dataEntityName, filter, options);

    return data;
  }

  /**
   * no meta_node and meta_peers in shareFS, create meta_node_temp and meta_peers_temp which are used for select/update/delete data in all cluster nodes
   * @param logger 
   * @param config 
   * @returns 
   */
  async prepareEntity(logger, config) {
    this.shareFS.status = !!(process.env.RTE_CLUSTER_ON_SHARED_FS && process.env.RTE_CLUSTER_ON_SHARED_FS === 'true');

    if(!this.shareFS.status) return;

    const ServerRuntimeService = require('../services/server-runtime.service'); 
    this.serverRunSv = new ServerRuntimeService({logger});
    const hostInfo = await this.serverRunSv.getHostInfo();
    const port = (config?.node?.https || config?.node?.http)?.port;

    this.shareFS.id = `${hostInfo.hostFullName}:${port}`; // the key to select data between different nodes.

    await bzdb.create('ENTITY', {name: '_meta_node_temp', primaryKeys: ['id'], PersistMethod: 1}); // LIST_FILE
    await bzdb.create('ENTITY', {name: '_meta_peers_temp', primaryKeys: ['id'], PersistMethod: 1});
   
    await bzdb.updateOrInsert('_meta_node_temp', {
      id: this.shareFS.id,
      localIp: `${hostInfo.ip}.${port}`,
      port: hostInfo.port,
      shared: true
    });

    await bzdb.updateOrInsert('_meta_peers_temp', {
      serverURL: `${hostInfo.hostFullName}:${port}`,
      localIp: `${hostInfo.ip}.${port}`, // used for creating diff data entity
      port: port,
      id: this.shareFS.id
    });
  }
}

const reportSv = new ReportSv();

module.exports = reportSv;