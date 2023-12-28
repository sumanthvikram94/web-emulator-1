"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_extra_1 = __importDefault(require("../../../lib/zlux/zlux-proxy-server/js/node_modules/fs-extra"));
const path_1 = __importDefault(require("path"));
const upgradeUtil_js_1 = __importDefault(require("./upgradeUtil.js"));
class Cluster {
    constructor() {
        this._isWindows = upgradeUtil_js_1.default.isWindows();
    }
    init(config) {
        return __awaiter(this, void 0, void 0, function* () {
            upgradeUtil_js_1.default.print('Preparing the cluster information, wait a while...');
            this._yamlConfig = config;
            this._debug = this._yamlConfig.debug;
            this._newVersionNumber = this._yamlConfig.newVersion.version || '';
            this._oldVersionNumber = this._yamlConfig.oldVersion.version || '';
            //upgradeUtil.basePath=path.join(this._yamlConfig.newVersion.workSpace, this._yamlConfig.newVersion.folderName);
            upgradeUtil_js_1.default.basePath = this._yamlConfig.newVersion.rootPath;
            //get cluster infomation on source version folder
            //const selfNode = await this.getMetaNode(path.join(this._yamlConfig.oldVersion.workSpace, this._yamlConfig.oldVersion.folderName))
            const selfNode = yield this.getMetaNode(this._yamlConfig.oldVersion.rootPath);
            const peers = yield this.getPeerNode('old', selfNode);
            const peerCandidate = this.getCandidatePeer(peers);
            const clusterOld = {
                clusterMode: this._yamlConfig.oldVersion.inCluster || false,
                nodeMeta: selfNode,
                peers: peers,
                peerHost: this.getSelfNode(peers),
                peerCandidate
            };
            //init new cluster
            let clusterNew = {
                clusterMode: this._yamlConfig.newVersion.inCluster || false,
                nodeMeta: undefined,
                peers: [],
                peerHost: undefined
            };
            this._cluster = {
                old: clusterOld,
                new: clusterNew
            };
            this._yamlConfig.cluster = this._cluster;
            if (this._yamlConfig.oldVersion.inCluster) {
                this.showClusterInfo();
            }
            else {
                upgradeUtil_js_1.default.print('The source is not running in cluster mode. will skip the recover cluster step');
            }
        });
    }
    get yamlConfig() {
        return this._yamlConfig;
    }
    getMetaNode(target) {
        const metaData = path_1.default.join(target, "deploy/instance/ZLUX/pluginStorage/com.rs.bzshared/_db_store/_metadata/node/node.json");
        if (fs_extra_1.default.existsSync(metaData)) {
            const data = fs_extra_1.default.readJSONSync(metaData);
            if (data) {
                return data;
            }
        }
        return undefined;
    }
    getSelfNode(peers) {
        for (let peer of peers || []) {
            if (peer.self) { //self
                return peer;
            }
        }
        return undefined;
    }
    getPeerNode(type, node) {
        return __awaiter(this, void 0, void 0, function* () {
            let target = this._yamlConfig.oldVersion.rootPath; //path.join(this._yamlConfig.oldVersion.workSpace, this.yamlConfig.oldVersion.folderName)
            if (type === 'new') {
                target = this._yamlConfig.newVersion.rootPath; //path.join(this._yamlConfig.newVersion.workSpace, this.yamlConfig.newVersion.folderName)
            }
            const metaData = path_1.default.join(target, "deploy/instance/ZLUX/pluginStorage/com.rs.bzshared/_db_store/_metadata/peers");
            const peersObj = [];
            if (!fs_extra_1.default.existsSync(metaData)) {
                return [];
            }
            const peers = fs_extra_1.default.readdirSync(metaData, 'utf8');
            for (let peer of peers) {
                const peerFile = path_1.default.join(metaData, peer);
                if (fs_extra_1.default.existsSync(peerFile)) {
                    if (type !== 'new') { //only output this when get the old version peer
                        upgradeUtil_js_1.default.print(`Collecting the information for peer by file ${peer}`);
                    }
                    const data = fs_extra_1.default.readJSONSync(peerFile);
                    if (data) { //except self
                        const version = (yield upgradeUtil_js_1.default.getRunningVersion(data.serverURL)) || '';
                        //:this._yamlConfig.newVersion.version
                        let obj = {
                            data: JSON.parse(JSON.stringify(data)),
                            appVersion: version,
                            isRunning: version ? true : false,
                            serverURL: data.serverURL,
                            id: data.id,
                            self: false,
                            isNew: false,
                            hasUpgrade: false
                        };
                        if (data.id === node.id) { //self
                            obj.self = true;
                            //obj.isNew = true  //aleay upgraded no matter in old or new 
                        }
                        if (obj.appVersion === this._newVersionNumber) {
                            obj.isNew = true;
                        }
                        if (version) { // it is runing and can get version
                            if (obj.self) { //replace the URL to localhost which can skip the admin console restrict issue
                                if (this._yamlConfig.newVersion.runningURL || this._yamlConfig.newVersion.initURL) {
                                    obj.serverURL = this._yamlConfig.newVersion.runningURL || this._yamlConfig.newVersion.initURL || '';
                                }
                            }
                            yield this.doLogin(obj.serverURL, data.id);
                            obj.hasUpgrade = yield upgradeUtil_js_1.default.hasUpgrade(obj.serverURL, this.getCookiesFile(data.id));
                        }
                        else {
                            if (type !== 'new') { //only output this when get the old version peer
                                upgradeUtil_js_1.default.print(`Can not connect peer ${peer} by URL ${data.serverURL}`);
                            }
                        }
                        peersObj.push(obj);
                    }
                }
            }
            return peersObj;
        });
    }
    showClusterInfo() {
        let data = [
            { key: "Source peers count ", value: (this._cluster.old.peers.length).toString() },
        ];
        if (this._cluster.old.peers.length > 1) {
            for (let i = 0; i < this._cluster.old.peers.length; i++) {
                const peer = this._cluster.old.peers[i];
                //for local, alway show new version, 
                const version = peer.self ? this._newVersionNumber : peer.appVersion || ' / ';
                const runStatus = peer.self ? this._yamlConfig.newVersion.isRunning : peer.isRunning;
                const running = runStatus ? "Running" : "Stopped";
                let hasUpgraded = !peer.isRunning ? ' / ' : peer.hasUpgrade ? 'Upgraded' : 'Not upgrade';
                //if(peer.self) hasUpgraded='Upgrading'
                const peerType = peer.self ? "Local" : "Peer";
                const val = `${version.padEnd(13)} | ${running.padEnd(7)} | ${hasUpgraded.padEnd(11)} | ${peerType.padEnd(5)}`;
                data.push({ key: `Node ${peer.serverURL}`, value: val });
            }
        }
        data.push({ key: "Target is in cluster", value: this._yamlConfig.newVersion.inCluster ? 'true' : 'false' });
        data.push({ key: "Target peer candidate exist", value: this._cluster.old.peerCandidate ? 'true' : 'false' });
        if (this._cluster.old.peerCandidate) {
            const candidate = this._cluster.old.peerCandidate;
            data.push({ key: `Target peer candidate URL`, value: `${candidate.serverURL}` });
        }
        upgradeUtil_js_1.default.drawTable(data);
    }
    doLogin(tragetPath, name) {
        var _a, _b, _c;
        return __awaiter(this, void 0, void 0, function* () {
            // if (!this.yamlConfig.Credential || !this.yamlConfig.Credential.UserName || !this.yamlConfig.Credential.Password) {
            //   return { status: false, message: 'Please provide administrator credential' }
            // }
            upgradeUtil_js_1.default.print(`Login peer by URL ${tragetPath} with account ${(_a = this._yamlConfig.credential) === null || _a === void 0 ? void 0 : _a.userName}`, 4);
            const auth = Buffer.from(`${((_b = this._yamlConfig.credential) === null || _b === void 0 ? void 0 : _b.userName) || ''}:${((_c = this._yamlConfig.credential) === null || _c === void 0 ? void 0 : _c.password) || ''}`).toString('base64');
            //if login failed, will exit
            let result = yield upgradeUtil_js_1.default.doLogin(tragetPath, auth, this.getCookiesFile(name));
            if (!result.status) {
                //exit 
                upgradeUtil_js_1.default.exitUpgade(1, `Rebuild stop:failed to login to the candidate peer ${tragetPath}`);
            }
        });
    }
    getCookiesFile(name) {
        const tempFolder = upgradeUtil_js_1.default.getTempFolder();
        return `${tempFolder}/session-${name}.txt`;
    }
    getPeerDataFile(name) {
        const tempFolder = upgradeUtil_js_1.default.getTempFolder();
        return `${tempFolder}/temp-peerData-${name}.json`;
    }
    setNewClusterInfo() {
        return __awaiter(this, void 0, void 0, function* () {
            upgradeUtil_js_1.default.print(`Check self peer information`);
            //this._cluster.new.nodeMeta = await this.getMetaNode(path.join(this._yamlConfig.newVersion.workSpace, this._yamlConfig.newVersion.folderName))
            this._cluster.new.nodeMeta = yield this.getMetaNode(this._yamlConfig.newVersion.rootPath);
            this._cluster.new.peers = yield this.getPeerNode('new', this._cluster.new.nodeMeta);
            this._cluster.new.peerHost = this.getSelfNode(this._cluster.new.peers);
        });
    }
    addClusters() {
        var _a, _b, _c, _d, _e;
        return __awaiter(this, void 0, void 0, function* () {
            //get  https://waldevbzqp01.dev.rocketsoftware.com:8544/ZLUX/plugins/com.rs.bzadm/services/cluster/peers
            //get https://localhost:8544/ZLUX/plugins/com.rs.bzadm/services/cluster/peerStatus
            //get cluster infomation on target version folder
            const peerCandidate = (_a = this._cluster.old) === null || _a === void 0 ? void 0 : _a.peerCandidate;
            if (!peerCandidate) {
                upgradeUtil_js_1.default.print(`Skipped since there is no identical running version of a node that can be added to the cluster.`);
                return { status: true };
            }
            yield this.setNewClusterInfo();
            if (!((_b = this._cluster.new.peerHost) === null || _b === void 0 ? void 0 : _b.serverURL) || !((_c = this._cluster.new.peerHost) === null || _c === void 0 ? void 0 : _c.data)) {
                return { status: false, message: `Added failed, can not get current peer information` };
            }
            upgradeUtil_js_1.default.print(`Start adding local node into a cluster by URL ${peerCandidate.serverURL}`);
            //if login failed, will exit
            yield this.doLogin(peerCandidate.serverURL, peerCandidate.id);
            const data = {
                host: (_d = this._cluster.new.peerHost) === null || _d === void 0 ? void 0 : _d.serverURL,
                peerInfo: JSON.stringify((_e = this._cluster.new.peerHost) === null || _e === void 0 ? void 0 : _e.data)
            };
            fs_extra_1.default.writeFileSync(this.getPeerDataFile(peerCandidate.id), JSON.stringify(data));
            const addPara = [
                '-d', `@${this.getPeerDataFile(peerCandidate.id)}`,
                '-b', this.getCookiesFile(peerCandidate.id),
                '-X', 'POST', `${peerCandidate.serverURL}/ZLUX/plugins/com.rs.bzadm/services/cluster/peer`
            ];
            const addResult = yield upgradeUtil_js_1.default.executeCURL(addPara);
            upgradeUtil_js_1.default.print('Adding cluster finish, start checking the result.');
            let result = yield upgradeUtil_js_1.default.checkResult(addResult);
            if (result.status) {
                if (result.obj && result.obj["status"]) { //add result
                    upgradeUtil_js_1.default.print('Adding cluster success', 0);
                    yield this.showPeerStatus(peerCandidate);
                    return { status: true };
                }
                else {
                    yield this.showPeerStatus(peerCandidate);
                    return { status: false, message: `Failed to add peer to cluster. ${result.obj && result.obj["message"] || ''}. Please refer to application log for more details.` };
                }
            }
            else { //add cluster failed
                return result;
            }
        });
    }
    showPeerStatus(peerInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            const peers = yield this.getPeerStatusUrl(peerInfo);
            let data = [];
            if (peers && peers.length > 0) {
                peers.forEach(peer => {
                    const aPeer = { key: peer.serverURL, value: peer.status || '' };
                    data.push(aPeer);
                });
                upgradeUtil_js_1.default.print(`Show new cluster list and status. `);
                upgradeUtil_js_1.default.drawTable(data);
            }
            else {
                upgradeUtil_js_1.default.print(`Failed to show new cluster list and status.`);
            }
        });
    }
    getPeerStatusUrl(peerInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            //get peers;
            const addPara1 = [
                '-b', this.getCookiesFile(peerInfo.id),
                '-X', 'GET', `${peerInfo.serverURL}/ZLUX/plugins/com.rs.bzadm/services/cluster/peers`
            ];
            let peerObj = [];
            let apiResult = yield upgradeUtil_js_1.default.executeCURL(addPara1);
            upgradeUtil_js_1.default.print(`Get recoverd peers information from ${peerInfo.serverURL}`);
            let result = yield upgradeUtil_js_1.default.checkResult(apiResult);
            if (result.status && result.obj) {
                const obj = result.obj;
                if (obj["peerInfo"]) {
                    const peer = {
                        serverURL: obj["peerInfo"].serverURL.toString(),
                        id: obj["peerInfo"].id.toString(),
                        status: ''
                    };
                    peerObj.push(peer);
                }
                if (obj["data"] && Array.isArray(obj["data"])) {
                    obj["data"].forEach(aPeer => {
                        const peer = {
                            serverURL: aPeer.serverURL.toString(),
                            id: aPeer.id.toString(),
                            status: ''
                        };
                        peerObj.push(peer);
                    });
                }
                //get status;
                if (peerObj.length > 0) {
                    const addPara2 = [
                        '-b', this.getCookiesFile(peerInfo.id),
                        '-X', 'GET', `${peerInfo.serverURL}/ZLUX/plugins/com.rs.bzadm/services/cluster/peerStatus`
                    ];
                    apiResult = yield upgradeUtil_js_1.default.executeCURL(addPara2);
                    upgradeUtil_js_1.default.print(`Get recoverd peers status from ${peerInfo.serverURL}`, 0);
                    result = yield upgradeUtil_js_1.default.checkResult(apiResult);
                    if (result.status && result.obj && result.obj["data"]) {
                        const obj = result.obj["data"];
                        if (Array.isArray(obj)) {
                            obj.forEach(aPeer => {
                                peerObj.map(e => {
                                    if (e.id === aPeer.id) {
                                        e.status = aPeer.status;
                                    }
                                });
                            });
                        }
                    }
                }
            }
            return peerObj;
        });
    }
    getCandidatePeer(peers) {
        for (let peer of peers || []) {
            // it is new but not self
            if (!peer.self && peer.isNew && peer.isRunning && peer.hasUpgrade) {
                return peer;
            }
        }
        return undefined;
    }
}
exports.default = Cluster;
//# sourceMappingURL=cluster.js.map