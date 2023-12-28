/**
 * Deprecated
 */

const path = require('path');
const zoweService = require('./zowe.service');
const jsonUtils = zoweService.jsonUtils;

const STATE_ACT_DELETE = 'delete';
const STATE_ACT_ADD = 'add';
const STATE_ACT_NONE = 'none';

const NODE_TYPE_SINGLETON = 'singleton';
const NODE_TYPE_MASTER = 'master';
const NODE_TYPE_SLAVE = 'slave';

const OBJ_SINGLETON = { nodeType: NODE_TYPE_SINGLETON };

const windowServerFile = path.join(process.cwd(), '../lib/server/windowServer.json');

class ClusterState {

    constructor() {
        this.isRunningCluster = process.env.BZ_EXEC_MODE === 'CLUSTER'? true : false;;
    }

    init(config){
        this.resetData();
        this.config = config;
        this.action = STATE_ACT_NONE;
    }

    resetData(){
        this.data = {
            masterOrigin:'',
            authToken:'',
            nodeType:''
        }
    }

    setData(data){
        this.data = Object.assign(this.data, data);
    }

    setAction(action){
        this.action = action;
    }

    getData(){
        const dt = Object.assign(dt, this.data);
        return dt;
    }

    getConfig(){
        return this.config;
    }

    getAction(){
        return String(this.action);
    }

    getAuthtoken(){
        if (this.action === STATE_ACT_ADD && this.data && this.data.authToken && this.data.authToken.length > 0 ) {
            return this.data.authToken;
        } else if (this.action === STATE_ACT_NONE && this.config && this.config.authToken){
            return this.config.authToken;
        }
        return null;
    }

    getNodeType(){
        if (this.action === STATE_ACT_ADD && this.data && this.data.nodeType && this.data.nodeType.length > 0 ) {
            return {
                nodeType: String(this.data.nodeType),
                masterOrigin: String(this.data.masterOrigin)
            };
        } else if (this.action === STATE_ACT_NONE && this.config && this.config.nodeType){
            const result = {
                nodeType: this.config.nodeType
            };
            if (this.config.masterOrigin){
                result['masterOrigin'] = this.config.masterOrigin;
            }
            return result;
        }
        return OBJ_SINGLETON;
    }

    getNodeInfo(){
        const result = this.getNodeType();
        if (this.action === STATE_ACT_ADD) {
            result['restartRequired'] = true;
        }
        return result;
    }
}

const clusterState = new ClusterState();

function init(config) {
    clusterState.init(config);
    return clusterState;
}

function getInstance(){
    return clusterState;
}

const action = {
    STATE_ACT_DELETE: STATE_ACT_DELETE,
    STATE_ACT_ADD: STATE_ACT_ADD,
    STATE_ACT_NONE: STATE_ACT_NONE
}

const nodeType = {
    NODE_TYPE_SINGLETON: NODE_TYPE_SINGLETON,
    NODE_TYPE_MASTER: NODE_TYPE_MASTER,
    NODE_TYPE_SLAVE: NODE_TYPE_SLAVE
}

module.exports = {
    init : init,
    action: action,
    nodeType: nodeType,
    getInstance: getInstance
}