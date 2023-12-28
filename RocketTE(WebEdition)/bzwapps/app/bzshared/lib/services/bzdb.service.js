const path = require('path');
// const resourceLoadService = require('./resource-load.service');
const zoweService = require('./zowe.service');
// const clusterState = require('./cluster-state.service');
const autoScalingService = require('./auto-scaling.service');
let BZDB
let bzdb
async function loadBZDBModule() {
    if (BZDB) {
        return BZDB
    }
    if (zoweService.isOnZowe) {
        return require('bz-db');
    } else {
        return await import(`file://${zoweService.jsPath}/node_modules/bz-db/dist/index.js`) // NODE_PATH is not supported by ES import.
    }
}

async function startDB() {
    BZDB = await loadBZDBModule()
    
    const FILE_EXT_JSON = '.json';
    const logConfig = {
        type: process.env.BZ_LOGGER_TYPE,
        logLevel: process.env.BZ_LOGGER_LEVEL || 2 // 0-SEVERE, 1-WARN, 2-INFO, 3-DEBUG
    }
    if (process.env.BZ_LOGGER_TYPE === 'file'){
        logConfig.fileName = process.env.BZ_LOGGER_FILE_NAME; // bzdb should write log to the same file as server.
    }
    const dbStorePath = zoweService.instanceDir + '/ZLUX/pluginStorage/com.rs.bzshared/';
    const defaultDataStrategy = zoweService.isOnZowe? BZDB.DataStrategy.NO_CACHE : BZDB.DataStrategy.FILE_NO_WATCH;
    const watchFileMode = process.env.RTE_CLUSTER_ON_SHARED_FS && process.env.RTE_CLUSTER_ON_SHARED_FS === 'true';

    const metadata = {
        appName: process.env.BZ_APP_NAME,
        storePath: dbStorePath,
        enableWorkerThread: !zoweService.isOnZowe,
        // processPooling: 0, // Multi-process can be controlled by ENV variable now.
        logging: logConfig,
        hostSpicificIp:process.env.BZ_APP_HOSTADDRESS,
        cluster: autoScalingService.getClusterConfig(),
        watchDataChanges: watchFileMode,
        dataEntities: [
            {
                name: 'sessionShared', 
                primaryKeys: ['id'],
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'group',
                primaryKeys: ['id'],
                indexes: {groupName: ['groupName']},
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'groupSession', // set candidate group for session
                primaryKeys: ['id'], // session id
                indexes: {gids: ['gids']},
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'groupSetting',
                primaryKeys: ['gid'],
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'groupDist',
                primaryKeys: ['gid'],
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'userInfo',
                primaryKeys: ['userId'],
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'userLogin',
                primaryKeys: ['username'],
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'keyboardMappingShared',
                primaryKeys: ['id'],
                persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                fileNamePrefix: 'K_',
                fileNameSurfix: FILE_EXT_JSON,
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'hotspotShared',
                primaryKeys: ['id'],
                persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                fileNamePrefix: 'H_',
                fileNameSurfix: FILE_EXT_JSON,
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'launchpadShared',
                primaryKeys: ['id'],
                persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                fileNamePrefix: 'L_',
                fileNameSurfix: FILE_EXT_JSON,
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'preferenceShared',
                primaryKeys: ['id'],
                persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                fileNamePrefix: 'P_',
                fileNameSurfix: FILE_EXT_JSON,
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'groupId',
                primaryKeys: ['id'],
                persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                filePath: '../../../../groups',
                fileName: 'id_manager.json',
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'virtualKeyboard',
                primaryKeys: ['username'],
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'keyboardMapping',
                primaryKeys: ['id'],
                persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                persistType: BZDB.PersistType.PERSIST_TYPE_ARRAY,
                filePath: 'keyboardMapping',
                fileName: 'keyboardMapping.json',
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'sessionSettingMapping',
                primaryKeys: ['id'],
                persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                persistType: BZDB.PersistType.PERSIST_TYPE_ARRAY,
                filePath: 'sessionSettingMapping',
                fileName: 'sessionSettingMapping.json',
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'sessionPrivate',
                primaryKeys: ['id'],
                indexes: {userId: ['userId'], TCPHost: ['TCPHost']},
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'scriptPrivate',
                primaryKeys: ['id'],
                persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'scriptShared',
                primaryKeys: ['id'],
                persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                dataStrategy: defaultDataStrategy,
                indexes: {status: ['status']},
            },
            {
                name: 'keyboardMappingPrivate',
                primaryKeys: ['userId', 'id'],
                indexes: {userId: ['userId']},
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'hotspotPrivate',
                primaryKeys: ['userId', 'id'],
                indexes: {userId: ['userId']},
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'launchpadPrivate',
                primaryKeys: ['userId', 'id'],
                indexes: {userId: ['userId']},
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'preferencePrivate',
                primaryKeys: ['userId', 'id'],
                indexes: {userId: ['userId']},
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'administrator',
                primaryKeys: ['id'],
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'userLanguage',
                primaryKeys: ['id'],
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'userConfig',
                primaryKeys: ['userId'],
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'userVar',  // BZ-19424, script variable
                primaryKeys: ['userId'],
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'groupUserPrivilege',
                primaryKeys: ['groupId','userId','sessionId'],
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'authConfig',
                primaryKeys: [],
                persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                filePath: 'authConfig',
                dataStrategy: BZDB.DataStrategy.NO_CACHE
            },
            {
                name: 'configurations',
                primaryKeys: [],
                persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                filePath: 'configurations',
                dataStrategy: BZDB.DataStrategy.NO_CACHE,
                fileNameSurfix: FILE_EXT_JSON
            },
            {
                name: 'w2hLicense',
                primaryKeys: [],
                persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                persistType: BZDB.PersistType.PERSIST_TYPE_RAW,
                dataStrategy: BZDB.DataStrategy.NO_CACHE,
                filePath: '../../../../../product/ZLUX/pluginStorage/com.rs.bzw2h',
                fileName: 'bluezone.lic'
            },
            {
                name: 'w2hGroups',
                primaryKeys: [],
                persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                persistType:BZDB.PersistType.PERSIST_TYPE_RAW,
                dataStrategy: BZDB.DataStrategy.NO_CACHE,
                isAllowSubFolder: true, 
                filePath: '../../../../../instance/ZLUX/pluginStorage/com.rs.bzw2h/groups'
            },
            {
                name: 'apiToken',
                primaryKeys: ['id'],
                persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'w2hFileDists',
                primaryKeys: ['relative_path'],
                partitions: {
                    relative_path: 1   // use single file
                },
                //persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                //persistType: BZDB.PersistType.PERSIST_TYPE_ARRAY,  <== Not work well in Cluster mode
                //fileName: 'fileSync.json',
                syncFile4Cluster: true,
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'w2hProfiles',
                primaryKeys: [],
                persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                persistType: BZDB.PersistType.PERSIST_TYPE_RAW,
                dataStrategy: BZDB.DataStrategy.NO_CACHE,
                filePath: '../../com.rs.bzadm/sessions'
            },
            {
                name: 'upload',
                primaryKeys: [],
                persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                filePath: 'upload',
                backupFilePaths:['../../../../../product/ZLUX/serverConfig'],
                persistType:BZDB.PersistType.PERSIST_TYPE_RAW,
                dataStrategy: BZDB.DataStrategy.NO_CACHE
            },
            {
                name: 'reportConfig',
                primaryKeys: [],
                persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                filePath: 'userReport',
                backupFilePaths:['../../../../../product/ZLUX/pluginStorage/com.rs.bzadm/configurations'],
                dataStrategy: BZDB.DataStrategy.NO_CACHE,
                fileName: 'userReport.json'
            },
            {
                name: 'serverLogging',
                primaryKeys: [],
                persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                filePath: '../../../../../instance/ZLUX/serverConfig',
                dataStrategy: BZDB.DataStrategy.NO_CACHE,
                fileName: 'logging.json'
            },
            {
                name: 'adminConfig',
                primaryKeys: [],
                persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                filePath: '../../../../../instance/ZLUX/pluginStorage/com.rs.bzadm/configurations',
                dataStrategy: BZDB.DataStrategy.NO_CACHE,
                fileName: 'adminConfig.json'
            },
            {
                name: 'securityHeader',
                primaryKeys: [],
                persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                filePath: '../../../../../instance/ZLUX/serverConfig',
                dataStrategy: BZDB.DataStrategy.NO_CACHE,
                fileName: 'securityHeader.json'
            },
            {
                name: 'nodejsConfig',
                primaryKeys: [],
                persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                filePath: '../../../../../instance/ZLUX/serverConfig',
                dataStrategy: BZDB.DataStrategy.NO_CACHE,
                fileName: 'nodejsConfig.json'
            },
            {
                name: 'terminalMfa',
                primaryKeys: ['id'],
                persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                filePath: './configuration',
                fileName: 'terminalMfa.json',
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'userTerminalMfa',
                primaryKeys: ['id'],
                dataStrategy: defaultDataStrategy
            },
            {
                name: 'connLocalData',     // [user report] Save the first startup time(since) and peak users count - ever recorded in local; Not sync to cluster
                persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                primaryKeys: [],
                filePath: '/connLocalData',
                dataStrategy: BZDB.DataStrategy.NO_CACHE,
                fileNameSurfix: FILE_EXT_JSON,
                syncMode: BZDB.SyncMode.SYNC_LOCAL
            },
            {
                name: 'connPoolBasic',     // [user report]  For user by server page
                primaryKeys: ['uuid'],
                persistMethod: watchFileMode ? BZDB.PersistMethod.PERSIST_METHOD_COMBINED_FILE : BZDB.PersistMethod.PERSIST_METHOD_ONLY_MEMORY,
                dataStrategy: defaultDataStrategy,
                syncMode: watchFileMode ? BZDB.SyncMode.SYNC_LOCAL : undefined
            },
            {
                name: 'connPoolGroup',    // [user report]  For user by group page
                primaryKeys: ['uuid'],
                persistMethod: watchFileMode ? BZDB.PersistMethod.PERSIST_METHOD_COMBINED_FILE : BZDB.PersistMethod.PERSIST_METHOD_ONLY_MEMORY,
                dataStrategy: defaultDataStrategy,
                syncMode:  watchFileMode ? BZDB.SyncMode.SYNC_LOCAL : undefined
            },
            // {
            //     name: 'connPeakDay',
            //     primaryKeys: ['sip'],
            //     dataStrategy: BZDB.DataStrategy.NO_CACHE
            // },
            {
                name: 'connTemp',        // [user report]  the temp data for user history
                primaryKeys: ['uuid'],   // unique ID generated from bzdb
                // dataStrategy: BZDB.DataStrategy.NO_CACHE,
                // persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                syncMode: BZDB.SyncMode.SYNC_LOCAL
            },
            {
                name: 'connUserTemp',    // [user report] the temp data for unique user
                primaryKeys: ['uid'],   
                // dataStrategy: BZDB.DataStrategy.NO_CACHE,
                // persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                syncMode: BZDB.SyncMode.SYNC_LOCAL
            },
            {
                name: 'connSampleTemp',    // [user report] the temp data for sample data
                primaryKeys: ['sut'],   
                // dataStrategy: BZDB.DataStrategy.NO_CACHE,
                // persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
                syncMode: BZDB.SyncMode.SYNC_LOCAL
            },
            {
                name: '_metadata_upgrade',   // [user report] the server name and localIp map of the previous versions; update when do upgrade
                primaryKeys: ['ip'],
                persistMethod: 1, //PersistMethod.PERSIST_METHOD_LIST_FILE,
                persistType: 1,  //PersistType.PERSIST_TYPE_ARRAY,
                fileName: 'upgradeIpMap.json',
                filePath: '_metadata_upgrade',
                dataStrategy: defaultDataStrategy
            },
            // {
            //     name: 'ssoAttrs',    // For sso user's attributes which used to match group
            //     primaryKeys: ['userId'],
            //     persistMethod: BZDB.PersistMethod.PERSIST_METHOD_ONLY_MEMORY,
            //     dataStrategy: defaultDataStrategy
            // },
            {
                name: 'totpUser',
                primaryKeys: ['uid'],
                dataStrategy: defaultDataStrategy,
                encryptAttrs: ['s']
            },
            {
                name: 'terminalScreen',   
                primaryKeys: ['uuid'],
                indexes: {name: ['name']},
                dataStrategy: defaultDataStrategy
            }
        ]
    };

    if (zoweService.isOnZowe){ // Zowe plugin spesific logics
        metadata.dataEntities.push({
            name: 'defaultGroup',
            primaryKeys: ['id'],
            persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
            filePath: path.join('../',path.relative(dbStorePath,path.join(zoweService.zoweWorkspaceDir, '../extensions/rocket-te-web/bzw/config/storageDefaults/defaults/'))),
            fileName: 'defaultGroup.json',
            dataStrategy: defaultDataStrategy
        });
        metadata.processPooling = 0;
        // metadata.watchDataChanges = 1; // We changed the dataStrategy to NO_CACHE on Zowe, so, no need to watch data change anymore.
    } else {  // Zowe plugin doesn't have superAdmin now.
        metadata.dataEntities.push({
            name: 'superAdmin',
            primaryKeys: ['username'],
            persistMethod: BZDB.PersistMethod.PERSIST_METHOD_LIST_FILE,
            filePath: '../../../../../product/ZLUX/pluginStorage/com.rs.bzadm/_internal/services/auth/',
            fileName: 'spadmahtctidt.json'
        });
    }

    if (process.env.RTEW_CONFLICT_POLICY){
        metadata.conflictPolicy = process.env.RTEW_CONFLICT_POLICY; 
    }

    // resourceLoadService.registerResourceLoad(proms);
    bzdb = BZDB.loadDatabase(new BZDB.DatabaseMetadata(metadata));
    return bzdb
}

let bzdbProm = startDB()
async function getBZDBInstance() {
    return await bzdbProm
}
async function waitLoadReady() {
    return (await getBZDBInstance()).waitLoadReady()
}

// Write the bootstrap data to bzwapps/config/server/bootstrap.txt
waitLoadReady().then(async () => {
    await autoScalingService.writeAutoScalingData(bzdb);
})
async function select(dataEntityName, filter, options) {
    return await bzdb.select(dataEntityName, filter, options)
}
async function update(dataEntityName, filter, value, constraints, isSilent) {
    return await bzdb.update(dataEntityName, filter, value, constraints, isSilent)
}
async function insert(dataEntityName, value, isSilent) {
    return await bzdb.insert(dataEntityName, value, isSilent)
}
async function deleteFun(dataEntityName, filter, constraints, isSilent) {
    return await bzdb.delete(dataEntityName, filter, constraints, isSilent)
}
async function updateOrInsert(dataEntityName, value, isSilent) {
    return await bzdb.updateOrInsert(dataEntityName, value, isSilent)
}
async function bulkLoad(dataEntityName, values, constraints, isSilent) {
    return await bzdb.bulkLoad(dataEntityName, values, constraints, isSilent)
}
async function introduceNode(nodeInfo) {
    return await bzdb.introduceNode(nodeInfo)
}
async function checkStatus() {
    return await bzdb.checkStatus()
}
async function batchTxn(batchTxnData) {
    return bzdb.batchTxn(batchTxnData)
}
async function kickNode(nodeInfo) {
    return await bzdb.kickNode(nodeInfo)
}
async function selectNoPKData(dataEntityName) {
    return await bzdb.selectNoPKData(dataEntityName)
}
async function count(dataEntityName) {
    return await bzdb.count(dataEntityName)
}
async function getStatus() {
    return bzdb.getStatus()
}
async function checkin() {
    return await bzdb.checkin()
}
async function checkinAll() {
    return await bzdb.checkinAll()
}
async function forcePullData(peerId) {
    return await bzdb.forcePullData(peerId)
}
async function pushToPeers(entities, checkInFlag) {
    await bzdb.pushToPeers(entities, checkInFlag)
}
async function getFileSyncInfo(filePath, isSync4Add) {
    return await bzdb.getFileSyncInfo(filePath, isSync4Add)
}

function onEvent(event,callback){
    bzdb.onEvent(event,callback);
}

async function getUID(radix, level) {
    return await bzdb.getUID(radix, level)
}
function getUIDSync(radix, level) {
    return bzdb.getUIDSync(radix, level)
}
async function registerCommand(cmd, execFunction) {
    return await bzdb.registerCommand(cmd, execFunction)
}
async function exec(cmd, parames, peerId) {
    return await bzdb.exec(cmd, parames, peerId)
}
async function create(schemType,dMetaDataObj) {
    return await bzdb.create(schemType,dMetaDataObj)
}
async function drop(schemType,entiryName) {
    return await bzdb.drop(schemType,entiryName)
}
async function refreshDataEntity(dataEntityName) {
    return await bzdb.refreshDataEntity(dataEntityName)
}
async function changeLogger(config) {
    return await bzdb.changeLogger(config)
}
async function getNodeAddrs() {
    return await bzdb.getNodeAddrs()
}
async function resolvePeers(peerId) {
    return await bzdb.resolvePeers(peerId)
}


function getBZDBModule() {
    return BZDB
}

module.exports = {
    getBZDBModule,
    getBZDBInstance,
    getNodeAddrs,
    waitLoadReady,
    select,
    update,
    insert,
    delete: deleteFun,
    updateOrInsert,
    bulkLoad,
    introduceNode,
    checkStatus,
    batchTxn,
    kickNode,
    selectNoPKData,
    count,
    getStatus,
    checkin,
    checkinAll,
    forcePullData,
    pushToPeers,
    getFileSyncInfo,
    getUID,
    getUIDSync,
    registerCommand,
    exec,
    create,
    drop,
    refreshDataEntity,
    onEvent,
    changeLogger,
    resolvePeers
};
