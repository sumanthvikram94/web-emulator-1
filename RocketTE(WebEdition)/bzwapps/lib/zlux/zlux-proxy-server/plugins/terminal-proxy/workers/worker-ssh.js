/**
 * Worker thread that handles SSH connections
 */
const { parentPort, workerData } = require('worker_threads');
const { EventLoopTracker, EluEvents } = require('perf-tracker');

/**
 * Each worker thread will handle multiple SSH sessions. Here maintains a map for key as connection ID, and value is session data.
 * Session data was managed in parent thread "terminalProxy.js", 
 * but the session data object can't be shared with workter thread,
 * and all the ssh session data are required by this file. So, using this map to maintain the sshSessionData.
 * sshSessionData also includes the cipher calculation objects, that's the hard part to keep it in parent thread.
 */
const sessionDatas = new Map();

/**
 * Worker metadata
 */
const workerId = workerData.workerId;
// const perfTraceInterval = workerData.perfTraceInterval;
const loglevel = workerData.loglevel;

/**
 * The real ssh module to be invoked for detailed SSH functions
 */
const ssh = require('../lib/ssh');

/**
 * This file runs in worker thread, and it can't take the logger from parent thread.
 * So, it will format the logs and output to console.log, and console.log will be streamed to parent thread.
 */
const loggerFile = require('../../../../zlux-shared/src/logging/logger.js');
const zoweLogger = new loggerFile.Logger();
zoweLogger.addDestination(zoweLogger.makeDefaultDestination(true,true,true));
const loggerName = 'com.rs.terminalproxy.ssh-worker' + workerId;
const sshLogger = zoweLogger.makeComponentLogger(loggerName);
zoweLogger.setLogLevelForComponentName(loggerName, loglevel);
ssh.setLogger(sshLogger);



/**
 * Worker performance tracking
 */
const elt = new EventLoopTracker({
    busy: 0.7,
    crazy: 0.95,
    doTrackPercent: true,
    doEmitAll: false,
    interval: 1000
});

let isBusy = false;
let isPreviousBusy = false;

elt.on(EluEvents.BUSY, (eu) => {
    if (isPreviousBusy === true){
        isBusy = true; // If 2 sample both is busy, then the worker is busy.
    }
    isPreviousBusy = true;
    sshLogger.info('Event loop increasing - ' + (eu * 100).toFixed(2) + '%');
})
elt.on(EluEvents.NOTBUSY, (eu) => {
    isBusy = false;
    isPreviousBusy = false;
    sshLogger.info('Event loop decreasing - ' + (eu * 100).toFixed(2) + '%');
})
elt.on(EluEvents.CRAZY, (eu) => {
    sshLogger.warn('Event loop busy - ' + (eu * 100).toFixed(2) + '%');
})
elt.on(EluEvents.NOTCRAZY, (eu) => {
    sshLogger.info('Event loop decreasing - ' + (eu * 100).toFixed(2) + '%');
})
elt.on(EluEvents.ABOVE_30, (eu) => {
    sshLogger.info('Event loop above 30 - ' + (eu * 100).toFixed(2) + '%');
})
elt.on(EluEvents.BELOW_30, (eu) => {
    sshLogger.info('Event loop below 30 - ' + (eu * 100).toFixed(2) + '%');
})
elt.on(EluEvents.ABOVE_50, (eu) => {
    sshLogger.warn('Event loop above 50 - ' + (eu * 100).toFixed(2) + '%');
})
elt.on(EluEvents.BELOW_50, (eu) => {
    sshLogger.info('Event loop below 50 - ' + (eu * 100).toFixed(2) + '%');
})
elt.on(EluEvents.ABOVE_70, (eu) => {
    sshLogger.warn('Event loop above 70 - ' + (eu * 100).toFixed(2) + '%');
})
elt.on(EluEvents.BELOW_70, (eu) => {
    sshLogger.warn('Event loop below 70 - ' + (eu * 100).toFixed(2) + '%');
})
elt.on(EluEvents.ABOVE_90, (eu) => {
    sshLogger.warn('Event loop above 90 - ' + (eu * 100).toFixed(2) + '%');
})
elt.on(EluEvents.BELOW_90, (eu) => {
    sshLogger.warn('Event loop below 90 - ' + (eu * 100).toFixed(2) + '%');
})

/**
 * ProxyManager class will handle the logics related to the terminalProxy
 */
class ProxyManager {

    constructor(proxy, connId) {
        this.connId = connId;
        this.proxy = proxy;
        this.hadSessionData = sessionDatas.has(this.connId);
        this.appendSessionData();
        this.buildNetSend();
        this.sshMessages = undefined;
    }

    /**
     * Find the sshSesionData for the proxy
     */
    appendSessionData() {
        const sessionData = sessionDatas.get(this.connId);
        if (sessionData) {
            this.proxy.sshSessionData = sessionData;
        }
    }

    /**
     * Give the proxy the netSend function
     */
    buildNetSend() {
        this.sendBuffers = [];
        this.proxy.netSend = (buff) => {
            this.sendBuffers.push(buff); // Records all the data sent by terminalWebsocketProxy.netSend(buffer)
        };
    }

    /**
     * Getter for this.proxy
     * @returns 
     */
    getProxy() {
        return this.proxy;
    }

    /**
     * Build the return msg to parent thread
     * @returns 
     */
    buildMsg() {
        return {
            output: {
                sendBuffers: this.sendBuffers,
                sshMessages: this.sshMessages,
                sshSessionData: this.hadSessionData? undefined: this.proxy.sshSessionData,
                sshAuthenticated: this.proxy.sshAuthenticated
            },
            connId: this.connId
        };
    }

    /**
     * Save the generated sshSessionData
     */
    saveSessionData() {
        if (!sessionDatas.has(this.connId)) {
            sessionDatas.set(this.connId, this.proxy.sshSessionData);
        }
    }

    destroy() {
        this.connId = undefined;
        this.proxy = undefined;
        this.hadSessionData = undefined;
        this.sshMessages = undefined;
        this.sendBuffers = undefined;
    }

}

/**
 * Listen for messages from parent thread.
 * The messages will includ data stands for tasks to do.
 * Data format of task:
 * {
 *      type: 'ssh_sendSSHData' / 'ssh_processEncryptedData' / 'ssh_close'
 *      payload: any // the data required by function
 * }
 */
parentPort.on('message', async (task) => {
    try {
        if (task === 'healthCheck') { // Main thread wants to check whether worker is busy
            const workerStatus = {
                workerId,
                isBusy: elt.isCrazy || isBusy
            };
            parentPort.postMessage({workerStatus});
            return;
        }
        const { type, payload } = task;
        switch (type) {
            case 'ssh_sendSSHData': { // Encrypts the data packet to send
                const { proxy, sshData } = payload;
                const proxyManager = new ProxyManager(proxy, proxy.connId);
                if (sshData.data !== undefined) {
                    sshData.data = Buffer.from(sshData.data); // When transfered from parent, Buffer is changed to UInt8Array. Here change it back.
                }
                ssh.sendSSHData(proxyManager.getProxy(), sshData, proxy.connId);
                parentPort.postMessage(proxyManager.buildMsg());
                proxyManager.destroy();
                break;
            }
            case 'ssh_processEncryptedData': { // SSH handshake and data packet decryption
                const { proxy, sshData } = payload;
                const proxyManager = new ProxyManager(proxy, proxy.connId);
                proxyManager.sshMessages = ssh.processEncryptedData(proxyManager.getProxy(), Buffer.from(sshData), proxy.connId);
                proxyManager.saveSessionData();
                parentPort.postMessage(proxyManager.buildMsg());
                proxyManager.destroy();
                break;
            }
            case 'ssh_close': { // Clears SSH session data when close
                const { proxy } = payload;
                sessionDatas.delete(proxy.connId);
                parentPort.postMessage({ // Sends back the connId, so that the task callback can be cleared.
                    connId: proxy.connId
                });
                break;
            }
            default: { // Unrecognized data type
                const { proxy } = payload;
                parentPort.postMessage({
                    status: 'error',
                    message: 'Not supported function',
                    connId: proxy.connId // Sends back the connId, so that the task callback can be cleared.
                });
            }
        }
    } catch (e) {
        sshLogger.severe(e.stack? e.stack: e.message);
        // connId is required for the worker pool to clear registered callback.
        // TBD, if connId can't be sent back, there should be a callback clearing mechenism like setTimeout.
        parentPort.postMessage({
            status: 'error',
            message: e.message,
            connId: task && task.payload && task.payload.proxy? task.payload.proxy.connId : undefined
        });
    }

});

