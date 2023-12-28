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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonUtils_js_1 = __importDefault(require("../../../lib/zlux/zlux-proxy-server/js/jsonUtils.js"));
const fs_extra_1 = __importDefault(require("../../../lib/zlux/zlux-proxy-server/js/node_modules/fs-extra"));
const argumentParser_js_1 = __importDefault(require("../../../lib/zlux/zlux-proxy-server/js/argumentParser.js"));
const path_1 = __importDefault(require("path"));
const portfinder_1 = __importDefault(require("../../../lib/zlux/zlux-proxy-server/js/node_modules/portfinder"));
const upgradeUtil_js_1 = __importDefault(require("./upgradeUtil.js"));
const cluster_js_1 = __importDefault(require("./cluster.js"));
const model_js_1 = require("./model.js");
class OneStop {
    constructor() {
        this.CONSTANT = "c3VwZXJhZG1pbg== cGE1NXdvcmQ=";
        this._isWindows = upgradeUtil_js_1.default.isWindows();
        this._permissionStatus = false;
        this._skipUpdate = false;
        this._isExistWinService = false;
        this.welcome = '\nWelcome to RTE web application upgrade command tool.\n';
        this.useageInfo = 'usage: upgrade [-s <source name>] [-p <superadmin password>] [--debug] [--silent] [--pm2] [-h <help>] \n';
        this.helpInfo = '\nThese are common commands used in various situations\n'
            + '-s , --source          Specify the prior RTE web application folder path that you will migrate from, it can be absolute or relative path.\n'
            + '                       By default, it will try to find the last but one by created time.\n'
            + '-p , --password        Input the changed password of the super admin\n'
            + '-h , --help            More usage\n'
            + '--debug                Print more information in debug level\n'
            //+ '--port                 Specify a port for the new version,the prior version will not stop, which will on standby in case of rollback\n'
            + '--silent               Skip the confirm steps\n'
            + '--pm2                  For Windows platform, need to specify this if not running as a windows service.\n'
            + '--wait                 Specify the second to wait for the application to start or stop. The default value is 40.\n'
            + '\n';
        this.ARGS = [
            new argumentParser_js_1.default.CLIArgument('source', 's', argumentParser_js_1.default.constants.ARG_TYPE_VALUE),
            new argumentParser_js_1.default.CLIArgument('password', 'p', argumentParser_js_1.default.constants.ARG_TYPE_VALUE),
            //new argParser.CLIArgument('port', '', argParser.constants.ARG_TYPE_VALUE),  
            new argumentParser_js_1.default.CLIArgument('help', 'h', argumentParser_js_1.default.constants.ARG_TYPE_FLAG),
            new argumentParser_js_1.default.CLIArgument('debug', '', argumentParser_js_1.default.constants.ARG_TYPE_FLAG),
            new argumentParser_js_1.default.CLIArgument('silent', '', argumentParser_js_1.default.constants.ARG_TYPE_FLAG),
            new argumentParser_js_1.default.CLIArgument('pm2', '', argumentParser_js_1.default.constants.ARG_TYPE_FLAG),
            new argumentParser_js_1.default.CLIArgument('wait', '', argumentParser_js_1.default.constants.ARG_TYPE_VALUE),
        ];
        this._yamlConfig = JSON.parse(JSON.stringify(model_js_1.DefaultInfoMation));
        this.cluser = new cluster_js_1.default();
        this.parseArgs();
    }
    set yamlConfig(config) {
        this._yamlConfig = config;
    }
    get yamlConfig() {
        return this._yamlConfig;
    }
    parseArgs() {
        const commandArgs = process.argv.slice(2);
        const argumentParser = argumentParser_js_1.default.createParser(this.ARGS);
        this.commandInput = argumentParser.parse(commandArgs);
        this.overrideByArgs();
        //upgradeUtil.print(`Command Args ${JSON.stringify(this.commandInput)}`,3)
    }
    overrideByArgs() {
        if (this.commandInput.password) {
            if (!this.yamlConfig.credential)
                this.yamlConfig.credential = {};
            this.yamlConfig.password = this.commandInput.password;
        }
        if (this.commandInput.source) {
            this.yamlConfig.sourcePath = this.commandInput.source;
        }
        if (this.commandInput.debug !== undefined) {
            this.yamlConfig.debug = this.commandInput.debug;
        }
        if (this.commandInput.silent !== undefined) {
            this.yamlConfig.silent = this.commandInput.silent;
        }
        if (this.commandInput.port) {
            this.yamlConfig.specifyPort = Number(this.commandInput.port) || 8543;
        }
        if (this.commandInput.wait) {
            this.yamlConfig.waitTime = Number(this.commandInput.wait);
        }
        if (this.commandInput.pm2) {
            this.yamlConfig.pm2 = this.commandInput.pm2;
        }
    }
    readFormation() {
        return __awaiter(this, void 0, void 0, function* () {
            upgradeUtil_js_1.default.print('Reading upgradeFormation.yaml');
            return new Promise((res) => __awaiter(this, void 0, void 0, function* () {
                var _a;
                let upgradeFormation = ((_a = this.commandInput) === null || _a === void 0 ? void 0 : _a.config) || 'upgradeFormation.yaml';
                if (!fs_extra_1.default.existsSync(upgradeFormation)) {
                    try {
                        const result = yield upgradeUtil_js_1.default.waitingAnswer('Not found upgradeFormation.yaml, please specify: ');
                        upgradeFormation = (result || '').toString();
                    }
                    catch (err) {
                        res({ status: false, message: `${err.message || err} unexpected terminated` });
                    }
                }
                if (fs_extra_1.default.existsSync(upgradeFormation)) {
                    try {
                        const strConfig = fs_extra_1.default.readFileSync(upgradeFormation, "utf8");
                        if (strConfig) {
                            //const specialConfig=yaml.parse(strConfig);
                            //this.yamlConfig = Object.assign(this._yamlConfig,specialConfig)
                            res({ status: true });
                        }
                        else {
                            res({ status: false, message: `Empty file ${upgradeFormation}` });
                        }
                    }
                    catch (err) {
                        res({ status: false, message: `Exception occurs: ${err.message || err}` });
                    }
                }
                else {
                    res({ status: false, message: `Exception occurs:file ${upgradeFormation} not exist` });
                }
            }));
        });
    }
    confirmMethod() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.yamlConfig.sourcePath && !this.yamlConfig.silent) {
                try {
                    const answer = yield upgradeUtil_js_1.default.waitingAnswer(`No prior path was specified; do you want to auto find the one with the created time stamp is the second to last in the list of target space?  [y/n]:`);
                    if ((answer || '').toString().toLowerCase() === 'y') {
                        this.yamlConfig.sourcePath = '';
                    }
                    else {
                        return { status: false, message: 'Please specify the prior RTE web application folder by using parameter -s or --source' };
                    }
                }
                catch (err) {
                    return { status: false, message: `${err.message || err} unexpected terminated` };
                }
            }
            return { status: true };
        });
    }
    parseFormation() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.yamlConfig) {
                upgradeUtil_js_1.default.isDebug = this.yamlConfig.debug;
                upgradeUtil_js_1.default.print('Start upgrading', 0);
                upgradeUtil_js_1.default.print('Preparing the requisites');
                //get RTE space
                const basePath = __dirname;
                // BZ-21512, rootPath should be "C:/WorkSpace/bzwapps-10.2.1/bzwapps"
                this.yamlConfig.newVersion.rootPath = path_1.default.join(basePath, '../../../'); // BZ-21512
                // e.g. __dirname => workSpace
                // __dirname: "C:/WorkSpace/bzwapps-10.2.1/bzwapps/tools/upgrade/lib"
                // workSpace: "C:/WorkSpace"
                this.yamlConfig.newVersion.workSpace = path_1.default.join(basePath, '../../../../../');
                this.yamlConfig.isWindows = this._isWindows;
                //new information
                if (!this.yamlConfig.newVersion.folderName) {
                    // e.g. __dirname => workSpace
                    // __dirname: "C:/WorkSpace/bzwapps-10.2.1/bzwapps/tools/upgrade/lib"
                    // folderName: "bzwapps-10.2.1"
                    this.yamlConfig.newVersion.folderName = path_1.default.basename(path_1.default.join(basePath, '../../../../'));
                }
                upgradeUtil_js_1.default.basePath = this.getNewCombinePath();
                this.yamlConfig.newVersion.version = this.getVersionByFile(this.getNewCombinePath());
                //this.yamlConfig.newVersion.initURL = this.getRTEWebURL(this.getNewCombinePath())  //from ZLUX
                this.getZluxInfo(this.getNewCombinePath(), this.yamlConfig.newVersion); //get inforamtion from zluxserver.json, such as protocol, port, bzw2hMode and etc.
                this.yamlConfig.newVersion.portFree = (yield this.checkPort(this.yamlConfig.newVersion.port)).status;
                //Old information
                if (!this.yamlConfig.sourcePath) {
                    this.yamlConfig.oldVersion.workSpace = this.yamlConfig.newVersion.workSpace;
                    this.yamlConfig.oldVersion.folderName = this.getoldVersionFolder(); //auto get by create time
                }
                else {
                    if (path_1.default.isAbsolute(this.yamlConfig.sourcePath)) {
                        const folders = this.yamlConfig.sourcePath.split(path_1.default.sep);
                        this.yamlConfig.oldVersion.workSpace = folders.slice(0, folders.length - 1).join(path_1.default.sep);
                        this.yamlConfig.oldVersion.folderName = folders[folders.length - 1];
                    }
                    else {
                        this.yamlConfig.oldVersion.workSpace = this.yamlConfig.newVersion.workSpace;
                        this.yamlConfig.oldVersion.folderName = this.yamlConfig.sourcePath;
                    }
                }
                // \/\/\/ BZ-21512, get the rootPath and version of the old version
                let oldRootPath = path_1.default.join(this.yamlConfig.oldVersion.workSpace, this.yamlConfig.oldVersion.folderName);
                let oldVersion = this.getVersionByFile(oldRootPath);
                if (!oldVersion) {
                    oldRootPath += '/bzwapps';
                    oldVersion = this.getVersionByFile(oldRootPath);
                }
                this.yamlConfig.oldVersion.rootPath = oldRootPath;
                this.yamlConfig.oldVersion.version = oldVersion;
                // /\/\/\ BZ-21512, get the rootPath and version of the old version
                this.getZluxInfo(this.getOldCombinePath(), this.yamlConfig.oldVersion); //get the protocol and port
                this.yamlConfig.oldVersion.portFree = (yield this.checkPort(this.yamlConfig.oldVersion.port)).status;
                this.yamlConfig.oldVersion.inCluster = upgradeUtil_js_1.default.isCluster(this.getOldCombinePath());
                //new version has upgrade by file
                this.yamlConfig.newVersion.hasUpgraded = this.hasUpgraded(this.getNewCombinePath());
                //new version has upgrade password by file
                this.yamlConfig.newVersion.defaultPd = this.isDefaultPassword(this.getNewCombinePath());
                //new version is in cluser by file
                this.yamlConfig.newVersion.inCluster = upgradeUtil_js_1.default.isCluster(this.getNewCombinePath());
                //set new version is running 
                yield this.setRunningStatus();
                this.drawTable(); //show information
                return this.checkInfomation();
            }
            else {
                return { status: false, message: 'Upgrade formation is not vaild' };
            }
        });
    }
    // make sure the running URL version is match eigher the old folder version or new folder version, if not, it is running 
    setRunningStatus() {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            if ((_a = this.yamlConfig.newVersion) === null || _a === void 0 ? void 0 : _a.initURL) {
                if (yield upgradeUtil_js_1.default.runningStatus((_b = this.yamlConfig.newVersion) === null || _b === void 0 ? void 0 : _b.initURL)) { //if port is occupied
                    this.yamlConfig.newVersion.uRLVersion = yield upgradeUtil_js_1.default.getRunningVersion(this.yamlConfig.newVersion.initURL); //special port running version
                    if (this.yamlConfig.newVersion.uRLVersion === this.yamlConfig.newVersion.version) { //new port is free
                        this.yamlConfig.newVersion.isRunning = true;
                        this.yamlConfig.newVersion.runningURL = this.yamlConfig.newVersion.initURL;
                    }
                }
            }
            if (this.yamlConfig.oldVersion.initURL) {
                if (yield upgradeUtil_js_1.default.runningStatus(this.yamlConfig.oldVersion.initURL)) { //old port is occupied
                    this.yamlConfig.oldVersion.portFree = false;
                    this.yamlConfig.oldVersion.uRLVersion = yield upgradeUtil_js_1.default.getRunningVersion(this.yamlConfig.oldVersion.initURL); //special port running version
                    if (this.yamlConfig.oldVersion.uRLVersion === this.yamlConfig.oldVersion.version) {
                        this.yamlConfig.oldVersion.isRunning = true;
                        this.yamlConfig.oldVersion.runningURL = this.yamlConfig.oldVersion.initURL;
                    }
                }
            }
        });
    }
    checkInfomation() {
        var _a, _b, _c, _d, _e, _f;
        if (!((_a = this.yamlConfig.oldVersion) === null || _a === void 0 ? void 0 : _a.folderName) || !((_b = this.yamlConfig.oldVersion) === null || _b === void 0 ? void 0 : _b.version)) {
            return { status: false, message: 'Old version information is incorrect.' };
        }
        else if (!((_c = this.yamlConfig.newVersion) === null || _c === void 0 ? void 0 : _c.folderName) || !((_d = this.yamlConfig.newVersion) === null || _d === void 0 ? void 0 : _d.version)) {
            return { status: false, message: 'New version information is incorrect.' };
        }
        else if (!upgradeUtil_js_1.default.compareVer(this.yamlConfig.newVersion.version, this.yamlConfig.oldVersion.version)) {
            return { status: false, message: 'Versions does not match,old version number should smaller than the traget one.' };
        }
        else if (((_e = this.yamlConfig.oldVersion) === null || _e === void 0 ? void 0 : _e.isW2h) != ((_f = this.yamlConfig.newVersion) === null || _f === void 0 ? void 0 : _f.isW2h)) { // BZ-21512
            return { status: false, message: 'Product mode (RTE_WDM or RTEW) does not match' };
            //check whether port is occupied by third version
        }
        else if (!this.yamlConfig.oldVersion.isRunning && !this.yamlConfig.oldVersion.portFree //old is not running and port is occupied
            && this.yamlConfig.newVersion.isRunning && this.yamlConfig.oldVersion.port != this.yamlConfig.newVersion.port) { //new is running,but the port is not same as the old
            return { status: false, message: 'The port of the old version is occupied, although it is not in running.' };
        }
        return { status: true };
    }
    isExistWinService() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._isWindows)
                return false;
            if (this._isExistWinService)
                return true;
            const svcPrefix = this.yamlConfig.newVersion.isW2h ? 'RocketTEWebDeploymentManager' : 'RocketTEWebEdition';
            const str = `sc query state=all | findstr ${svcPrefix}`; // BZ-21512
            const arg = [];
            const result = yield upgradeUtil_js_1.default.executeCommand(str, arg);
            if (result.stdout && result.stdout.toString() != '') {
                const str = result.stdout.toString();
                upgradeUtil_js_1.default.print(`output: ${str}`, 4);
                const sName = 'SERVICE_NAME'.toLowerCase();
                this._isExistWinService = str.toLowerCase().includes(sName); //means support curl
            }
            return this._isExistWinService;
        });
    }
    confirmFormation(type) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.yamlConfig.silent) {
                try {
                    const answer = yield upgradeUtil_js_1.default.waitingAnswer('Check if the above information is correct. [y/n]:');
                    if ((answer || '').toString().toLowerCase() === 'y') {
                        return { status: true };
                    }
                    else {
                        return { status: false, message: `Confirmed that information is incorrect, stop the ${type}.` };
                    }
                }
                catch (err) {
                    return { status: false, message: `${err.message || err} unexpected terminated` };
                }
            }
            return { status: true };
        });
    }
    confirmUpgrade() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            if (((_a = this.yamlConfig.newVersion) === null || _a === void 0 ? void 0 : _a.hasUpgraded) && !this.yamlConfig.silent) {
                try {
                    const upgradeAnswer = yield upgradeUtil_js_1.default.waitingAnswer('The target version has been previously upgraded; do you want to upgrade again? [y/n]:');
                    if ((upgradeAnswer || '').toString().toLowerCase() === 'y') {
                        this._skipUpdate = false;
                    }
                    else {
                        this._skipUpdate = true;
                    }
                }
                catch (err) {
                    return { status: false, message: `${err.message || err} unexpected terminated` };
                }
            }
            return { status: true };
        });
    }
    drawTable() {
        var _a, _b;
        const data = [
            { key: "Source path", value: this.getOldCombinePath() },
            { key: "Source version", value: this.yamlConfig.oldVersion.version || '' },
            { key: "Source is running", value: this.yamlConfig.oldVersion.isRunning ? 'true' : 'false' },
            { key: "Source URL", value: this.yamlConfig.oldVersion.runningURL || this.yamlConfig.oldVersion.initURL || '' },
            { key: "Source is in cluster", value: this.yamlConfig.oldVersion.inCluster ? 'true' : 'false' },
            //{ key: "Source product mode", value: this.yamlConfig.oldVersion.isW2h?'RTE WDM':'RTE Web'}, // BZ-21512
            { key: "Target path", value: this.getNewCombinePath() },
            { key: "Target version ", value: this.yamlConfig.newVersion.version || '' },
            { key: "Target is running", value: this.yamlConfig.newVersion.isRunning ? 'true' : 'false' },
            { key: "Target has upgraded", value: this.yamlConfig.newVersion.hasUpgraded ? 'true' : 'false' },
            { key: "Target is in cluster", value: this.yamlConfig.newVersion.inCluster ? 'true' : 'false' },
        ];
        upgradeUtil_js_1.default.print(`Target password has changed:${this.yamlConfig.newVersion.defaultPd ? 'false' : 'true'}`, 4);
        upgradeUtil_js_1.default.print(`Old Version initURL:${this.yamlConfig.oldVersion.initURL}`, 4);
        upgradeUtil_js_1.default.print(`Old Version runningURL:${((_a = this.yamlConfig.oldVersion) === null || _a === void 0 ? void 0 : _a.runningURL) || ''}`, 4);
        upgradeUtil_js_1.default.print(`New Version initURL:${this.yamlConfig.newVersion.initURL}`, 4);
        upgradeUtil_js_1.default.print(`New Version runningURL:${((_b = this.yamlConfig.newVersion) === null || _b === void 0 ? void 0 : _b.runningURL) || ''}`, 4);
        upgradeUtil_js_1.default.print(`Old port is free:${this.yamlConfig.oldVersion.portFree ? 'true' : 'false'}`, 4);
        upgradeUtil_js_1.default.print(`New port is free:${this.yamlConfig.newVersion.portFree ? 'true' : 'false'}`, 4);
        upgradeUtil_js_1.default.drawTable(data);
    }
    upgradePrepare() {
        this.resetToDefault();
        this.createMigrateFolder();
        this.copySpecificFiles();
        this.copyLogFile();
        return { status: true };
    }
    takeActions() {
        var e_1, _a;
        return __awaiter(this, void 0, void 0, function* () {
            let result = { status: true };
            if (this.yamlConfig.actions) {
                try {
                    for (var _b = __asyncValues(this.yamlConfig.actions || []), _c; _c = yield _b.next(), !_c.done;) {
                        let action = _c.value;
                        const key = Object.keys(action)[0];
                        switch (key) {
                            case 'stop':
                                result = yield this.stopRTEWeb(action[key]);
                                break;
                            case 'start':
                                result = yield this.startRTEWeb(action[key]);
                                break;
                            case 'upgrade':
                                result = yield this.doUpgrade(action[key]);
                                break;
                            case 'recover':
                                result = yield this.recoverCluser(action[key]);
                                break;
                            case 'restart':
                                result = yield this.restartServerByURL();
                                // case 'Protocol':
                                break;
                        }
                        if (!(result === null || result === void 0 ? void 0 : result.status)) { //out the loop if one runs into error
                            return result;
                        }
                    }
                }
                catch (e_1_1) { e_1 = { error: e_1_1 }; }
                finally {
                    try {
                        if (_c && !_c.done && (_a = _b.return)) yield _a.call(_b);
                    }
                    finally { if (e_1) throw e_1.error; }
                }
            }
            return result;
        });
    }
    getRTEWebURL(targetPath) {
        const filePath = path_1.default.join(targetPath, 'deploy/instance/ZLUX/serverConfig/zluxserver.json');
        if (fs_extra_1.default.existsSync(filePath)) {
            //const data = fs.readJSONSync(filePath);
            const data = jsonUtils_js_1.default.parseJSONWithComments(filePath); //this exist comment
            if (data && data.node) {
                const node = data.node;
                if (node.https) {
                    return `https://localhost:${node.https.port}`;
                }
                else {
                    return `http://localhost:${node.http.port}`;
                }
            }
        }
        return '';
    }
    getZluxInfo(targetPath, obj) {
        const filePath = path_1.default.join(targetPath, 'deploy/instance/ZLUX/serverConfig/zluxserver.json');
        let node;
        if (fs_extra_1.default.existsSync(filePath)) {
            //const data = fs.readJSONSync(filePath);
            const data = jsonUtils_js_1.default.parseJSONWithComments(filePath); //this exist comment
            if (data && data.node) {
                const node = data.node;
                if (node.https) {
                    obj.protocol = 'https';
                    obj.port = node.https.port;
                    obj.initURL = `https://localhost:${node.https.port}`;
                }
                else {
                    obj.protocol = 'http';
                    obj.port = node.http.port;
                    obj.initURL = `http://localhost:${node.http.port}`;
                }
            }
            if (data && data.bzw2hMode) { // BZ-21512
                obj.isW2h = true;
            }
        }
    }
    setRTEWebPort(targetPath, port) {
        const filePath = path_1.default.join(targetPath, 'deploy/instance/ZLUX/serverConfig/zluxserver.json');
        if (fs_extra_1.default.existsSync(filePath)) {
            //const data = fs.readJSONSync(filePath);
            const data = jsonUtils_js_1.default.parseJSONWithComments(filePath);
            if (data && data.node) {
                if (data.node.https) {
                    data.node.https.port = port || 8543;
                }
                else {
                    data.node.http.port = port || 8544;
                }
                fs_extra_1.default.writeFileSync(filePath, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o644 });
            }
        }
    }
    checkPort(port) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                portfinder_1.default.getPort({ port, stopPort: port }, (err, p) => {
                    if (err) {
                        resolve({ status: false, message: 'The port is occupied!' });
                    }
                    else {
                        //upgradeUtil.print('Port is free: ' + p, 3)
                        resolve({ status: true, message: 'The port is not occupied!' });
                    }
                });
            });
        });
    }
    getoldVersionFolder() {
        const workSpace = this.yamlConfig.newVersion.workSpace; //get old from the new version work space
        const folders = fs_extra_1.default.readdirSync(workSpace, 'utf8');
        let olderVersion = { folderName: '', createTime: '' };
        for (let folder of folders) {
            const fileObj = fs_extra_1.default.statSync(path_1.default.join(workSpace, folder));
            const createTime = fileObj.ctime;
            const versionPath = path_1.default.join(workSpace, folder, 'bzwapps/deploy/product/ZLUX/pluginStorage/com.rs.bzshared/_internal/services/version/version.json');
            if (folder === this.yamlConfig.newVersion.folderName)
                continue; //current version folder
            let ingnore = false;
            if (this.yamlConfig.ingoreFolder && this.yamlConfig.ingoreFolder.length > 0) {
                for (let i = 0; i < this.yamlConfig.ingoreFolder.length; i++) {
                    if (this.yamlConfig.ingoreFolder[i] && folder === this.yamlConfig.ingoreFolder[i]) {
                        ingnore = true;
                        break;
                    }
                    ;
                }
            }
            if (ingnore)
                continue; //this folder  ingore
            if (!fs_extra_1.default.existsSync(versionPath))
                continue; //RTE web folder
            if (olderVersion && olderVersion.createTime && olderVersion.createTime > createTime)
                continue; //too older
            if (!olderVersion || olderVersion.createTime <= createTime) {
                olderVersion = { folderName: folder, createTime };
            }
        }
        return olderVersion ? olderVersion.folderName : '';
    }
    getVersionByFile(pathStr) {
        const versionPath = path_1.default.join(pathStr, 'deploy/product/ZLUX/pluginStorage/com.rs.bzshared/_internal/services/version/version.json');
        if (fs_extra_1.default.existsSync(versionPath)) {
            const data = fs_extra_1.default.readJSONSync(versionPath);
            if (data && data.pluginVersion) {
                return data.pluginVersion;
            }
        }
        return '';
    }
    hasUpgraded(targetPath) {
        const updatedSetting = `${targetPath}/deploy/instance/ZLUX/pluginStorage/com.rs.bzshared/_db_store/configurations/serverSettings.json`;
        if (fs_extra_1.default.existsSync(updatedSetting)) {
            const data = fs_extra_1.default.readJSONSync(updatedSetting);
            upgradeUtil_js_1.default.print(`Upgraded confile file data:${JSON.stringify(data)}`, 4);
            return data && data.hasUpgrade;
        }
        return false;
    }
    isDefaultPassword(targetPath) {
        const updatedSetting = `${targetPath}/deploy/product/ZLUX/pluginStorage/com.rs.bzadm/_internal/services/auth/spadmahtctidt.json`;
        if (fs_extra_1.default.existsSync(updatedSetting)) {
            const data = fs_extra_1.default.readJSONSync(updatedSetting);
            upgradeUtil_js_1.default.print(`Default-pw confile data:${JSON.stringify(data)}`, 4);
            return data && data.init;
        }
        return true;
    }
    stopRTEWeb(obj) {
        return __awaiter(this, void 0, void 0, function* () {
            upgradeUtil_js_1.default.print('Stopping the RTE web application');
            let versionObj = this.yamlConfig.oldVersion;
            let targetPath = this.getOldCombinePath();
            if (obj.target.toLowerCase() === 'new') {
                versionObj = this.yamlConfig.newVersion;
                targetPath = this.getNewCombinePath();
            }
            if (!versionObj.isRunning) {
                upgradeUtil_js_1.default.print(`Skipped since the RTE web application ${versionObj.version} is already stopped`);
                return { status: true };
            }
            const binFolder = path_1.default.join(targetPath, "bin");
            let stopFileName = 'sh shutdown.sh';
            const isExistWinService = yield this.isExistWinService();
            if (this._isWindows) {
                if (this.yamlConfig.pm2 || !isExistWinService) {
                    stopFileName = 'shutdown.bat';
                }
                else {
                    stopFileName = 'serviceDelete.bat';
                }
            }
            upgradeUtil_js_1.default.print(`Stopping the RTE web application ${versionObj.version} by run ${stopFileName}`);
            upgradeUtil_js_1.default.print('Waiting till it finishes');
            const arg = [];
            const result = yield upgradeUtil_js_1.default.executeFile(stopFileName, arg, binFolder);
            const count = this.yamlConfig.waitTime || 20;
            const URL = (versionObj === null || versionObj === void 0 ? void 0 : versionObj.runningURL) || (versionObj === null || versionObj === void 0 ? void 0 : versionObj.initURL);
            //upgradeUtil.print(`Stopping the service of site ${URL}`)
            yield upgradeUtil_js_1.default.wait(() => __awaiter(this, void 0, void 0, function* () { const res = yield upgradeUtil_js_1.default.runningStatus(URL); return !res; }), 1000, count);
            //check again
            const res = yield upgradeUtil_js_1.default.runningStatus(URL);
            const portFree = (yield this.checkPort(versionObj.port)).status;
            if (!res && portFree) {
                upgradeUtil_js_1.default.print(`${versionObj.version} stopped`);
                if (obj.target === 'new') {
                    this.yamlConfig.newVersion.isRunning = false;
                }
                else {
                    this.yamlConfig.oldVersion.isRunning = false;
                }
                return { status: true };
            }
            else {
                upgradeUtil_js_1.default.print(`Stop ${versionObj.version} failed`);
                return { status: false, message: `Stop ${versionObj.version} failed` };
            }
        });
    }
    resetProtocol() {
        this.setRTEWebPort(this.getNewCombinePath(), this.yamlConfig.specifyPort || this.yamlConfig.oldVersion.port);
        this.yamlConfig.newVersion.port = this.yamlConfig.oldVersion.port;
        this.yamlConfig.newVersion.initURL = `${this.yamlConfig.newVersion.protocol}://localhost:${this.yamlConfig.newVersion.port}`;
    }
    startRTEWeb(obj) {
        return __awaiter(this, void 0, void 0, function* () {
            upgradeUtil_js_1.default.print('Starting the RTE web application');
            let versionObj = this.yamlConfig.newVersion;
            let targetPath = this.getNewCombinePath();
            if (versionObj.isRunning) {
                upgradeUtil_js_1.default.print(`Skipped since the RTE web ${versionObj.version} is already running`);
                return { status: true };
            }
            //not running
            if (obj.target.toLowerCase() === 'old') {
                targetPath = this.getOldCombinePath();
                versionObj = this.yamlConfig.oldVersion;
            }
            else {
                //replace the port the old one
                this.resetProtocol();
                //check the old port whether it is free .
                const portFree = (yield this.checkPort(this.yamlConfig.newVersion.port)).status;
                if (!portFree) {
                    return { status: false, message: `Start failed, the port ${versionObj.port} is occupied!` };
                }
            }
            const binFolder = path_1.default.join(targetPath, "bin");
            //const isExistWinService=await this.isExistWinService();
            let startFileName = 'sh nodeServer.sh';
            if (this._isWindows) {
                if (this.yamlConfig.pm2) {
                    startFileName = 'nodeServer.bat';
                }
                else {
                    startFileName = 'serviceCreate.bat';
                }
            }
            const arg = [];
            upgradeUtil_js_1.default.print(`Starting the RTE web application ${versionObj.version} by run ${startFileName}`);
            upgradeUtil_js_1.default.print('Waiting till it finishes');
            const result = yield upgradeUtil_js_1.default.executeFile(startFileName, arg, binFolder);
            const count = this.yamlConfig.waitTime || 40;
            //upgradeUtil.print(`Starting the service of site ${versionObj.initURL}`)
            yield upgradeUtil_js_1.default.wait(() => __awaiter(this, void 0, void 0, function* () { const res = yield upgradeUtil_js_1.default.runningStatus(versionObj.initURL); return res; }), 1000, count);
            //check again
            const res = yield upgradeUtil_js_1.default.runningStatus(versionObj.initURL);
            if (res) {
                upgradeUtil_js_1.default.print(`${versionObj.version} is running`);
                if (obj.target === 'new') {
                    this.yamlConfig.newVersion.isRunning = true;
                    this.yamlConfig.newVersion.runningURL = this.yamlConfig.newVersion.initURL;
                }
                else {
                    this.yamlConfig.oldVersion.isRunning = true;
                    this.yamlConfig.oldVersion.runningURL = this.yamlConfig.oldVersion.initURL;
                }
                return { status: true };
            }
            else {
                upgradeUtil_js_1.default.print(`Start ${versionObj.version} failed`);
                return { status: false, message: `Start ${versionObj.version} failed` };
            }
        });
    }
    adminCredential() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.yamlConfig.credential)
                this.yamlConfig.credential = {};
            const var1 = this.CONSTANT.split(' ');
            this.yamlConfig.credential.userName = Buffer.from(var1[0], 'base64').toString('utf8');
            if (!this.yamlConfig.password) {
                try {
                    const pa = yield upgradeUtil_js_1.default.waitingAnswer(`Please input the prior version password of '${this.yamlConfig.credential.userName}':`, 'password'); //type is password
                    this.yamlConfig.credential.password = (pa || '').toString();
                }
                catch (err) {
                    return { status: false, message: `${err.message || err} unexpected terminated` };
                }
            }
            else {
                this.yamlConfig.credential.password = this.yamlConfig.password;
            }
            return { status: true };
        });
    }
    doLogin() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const var1 = this.CONSTANT.split(' ');
            let password = (_a = this.yamlConfig.credential) === null || _a === void 0 ? void 0 : _a.password;
            //using default
            if (this.yamlConfig.credential && this.yamlConfig.newVersion.defaultPd) {
                password = Buffer.from(var1[1], 'base64').toString('utf8');
            }
            if (!this.yamlConfig.credential || !this.yamlConfig.credential.userName || !password) {
                return { status: false, message: 'Please provide administrator credential' };
            }
            const auth = Buffer.from(`${this.yamlConfig.credential.userName}:${password}`).toString('base64');
            const result = yield upgradeUtil_js_1.default.doLogin(this.yamlConfig.newVersion.runningURL, auth, this.getTempFile());
            if (result.status) {
                this._permissionStatus = true;
                return { status: true };
            }
            else {
                this._permissionStatus = false;
                return { status: false, message: 'This process needs administrator permission, but got the wrong credential.' };
            }
        });
    }
    //2 methods to pass the authorized, 1: use default token, 2: use login cookies
    doUpgrade(obj) {
        return __awaiter(this, void 0, void 0, function* () {
            upgradeUtil_js_1.default.print('Starting data upgrade');
            if (!this.yamlConfig.newVersion.isRunning)
                return { status: false, message: `Target version is not running.` };
            if (this._skipUpdate) {
                upgradeUtil_js_1.default.print("Skipped the upgrade since it has been upgraded before and choose to cancel.");
                return { status: true };
            }
            if (this.yamlConfig.newVersion.inCluster) {
                upgradeUtil_js_1.default.print("Skipped the upgrade since it is already running in cluster mode.");
                return { status: true };
            }
            if (!this._permissionStatus) {
                let result = yield this.doLogin();
                if (!result.status)
                    return result; //login faild
            }
            yield this.upgradePrepare();
            yield upgradeUtil_js_1.default.hasUpgrade(this.yamlConfig.newVersion.runningURL, this.getTempFile());
            const argsUpgrade = [
                '-b', this.getTempFile(),
                '-X', 'POST', `${this.yamlConfig.newVersion.runningURL}/ZLUX/plugins/com.rs.bzadm/services/upgrade/data`
            ];
            const updateResult = yield upgradeUtil_js_1.default.executeCURL(argsUpgrade);
            upgradeUtil_js_1.default.print('Upgrade finished, start checking the result', 0);
            let result = yield upgradeUtil_js_1.default.checkResult(updateResult);
            if (result.status) {
                if (result.obj && result.obj["status"]) { //updgrade result
                    upgradeUtil_js_1.default.print('Restarting RTE web application for changes to take effect.');
                    result = yield this.restartServerByURL();
                }
                else {
                    return { status: false, message: `Upgrade failed, ${result.obj && result.obj["message"] || ''}, refer to application log to get more detail.` };
                }
            }
            return result;
        });
    }
    recoverCluser(actionConfig) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.yamlConfig.oldVersion.inCluster) {
                upgradeUtil_js_1.default.print('Skipped since the prior version is not running in cluster mode.');
                return { status: true };
            }
            upgradeUtil_js_1.default.print('\nStart to rebuild the cluster since prior version was running in cluster mode.', 0);
            yield this.cluser.init(this.yamlConfig);
            const res = yield this.confirmFormation('cluster rebuild');
            if (!res.status)
                return res; //return if the information is not correct.
            if (!this.yamlConfig.newVersion.isRunning)
                return { status: false, message: `Target version is not running.` };
            if (!this._permissionStatus) {
                let result = yield this.doLogin();
                if (!result.status)
                    return result; //login faild
            }
            return this.cluser.addClusters();
        });
    }
    restartServerByURL() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.yamlConfig.newVersion.isRunning)
                return { status: false, message: `Target version is not running.` };
            if (!this._permissionStatus) {
                let result = yield this.doLogin();
                if (!result.status)
                    return result; //login faild
            }
            const args = [
                '-b', this.getTempFile(),
                '-X', 'POST', `${this.yamlConfig.newVersion.initURL}/ZLUX/plugins/com.rs.bzshared/services/cluster/reboot`,
            ];
            const result = yield upgradeUtil_js_1.default.executeCURL(args);
            const startResult = yield upgradeUtil_js_1.default.checkResult(result);
            if (startResult.status) {
                const count = 60;
                yield upgradeUtil_js_1.default.waitTime(1000); //wait it stop
                yield upgradeUtil_js_1.default.wait(() => __awaiter(this, void 0, void 0, function* () { return yield upgradeUtil_js_1.default.runningStatus(this.yamlConfig.oldVersion.initURL); }), 1000, count);
                //check again
                const res = yield upgradeUtil_js_1.default.runningStatus(this.yamlConfig.oldVersion.initURL);
                if (res) {
                    const version = yield upgradeUtil_js_1.default.getRunningVersion(this.yamlConfig.oldVersion.initURL);
                    if (version === this.yamlConfig.newVersion.version) {
                        this.yamlConfig.newVersion.runningURL = this.yamlConfig.oldVersion.initURL; // update the URL
                        upgradeUtil_js_1.default.print(`Restarting ${this.yamlConfig.newVersion.version} successfully, URL is ${this.yamlConfig.oldVersion.initURL}`, 0);
                        return { status: true };
                    }
                }
                upgradeUtil_js_1.default.print(`Restart ${this.yamlConfig.newVersion.version} failed`);
                return { status: false, message: `Restart ${this.yamlConfig.newVersion.version} failed` };
            }
            else {
                return startResult;
            }
        });
    }
    resetToDefault() {
        const copysArray = [
            { from: "deploy/product/ZLUX/plugins/", to: "deploy/instance/ZLUX/plugins/" },
            { from: "config/server/zluxserver.json", to: "deploy/product/ZLUX/serverConfig/zluxserver.json" },
            { from: "config/server/zluxserver.json", to: "deploy/instance/ZLUX/serverConfig/zluxserver.json" },
            { from: "config/server/logging.json", to: "deploy/instance/ZLUX/serverConfig/logging.json" },
            { from: "config/server/securityHeader.json", to: "deploy/instance/ZLUX/serverConfig/securityHeader.json" },
        ];
        if (!this.yamlConfig.newVersion.isW2h) {
            copysArray.push({ from: "deploy/product/ZLUX/pluginStorage/com.rs.bzadm/configurations/dataSourceSetting.json", to: "deploy/instance/ZLUX/pluginStorage/com.rs.bzw/configurations/dataSourceSetting.json" });
        }
        for (let element of copysArray) {
            fs_extra_1.default.copySync(path_1.default.join(this.getNewCombinePath(), element.from), path_1.default.join(this.getNewCombinePath(), element.to));
        }
    }
    copySpecificFiles() {
        const copysArray = [
            "deploy/product/ZLUX/pluginStorage/com.rs.bzadm/_internal/services/auth/spadmahtctidt.json",
        ];
        if (this.yamlConfig.newVersion.isW2h) {
            copysArray.push("app/bzw2h/web/assets/templates");
        }
        else {
            copysArray.push("app/bzw/web/assets/templates");
        }
        for (let element of copysArray) {
            fs_extra_1.default.copySync(path_1.default.join(this.getOldCombinePath(), element), path_1.default.join(this.getNewCombinePath(), element));
        }
    }
    createMigrateFolder() {
        const dirName = 'migrate';
        upgradeUtil_js_1.default.print('Creating the migrate folder and copying files');
        try {
            fs_extra_1.default.removeSync(path_1.default.join(this.getNewCombinePath(), dirName));
            fs_extra_1.default.copySync(path_1.default.join(this.getOldCombinePath(), 'deploy'), path_1.default.join(this.getNewCombinePath(), dirName));
        }
        catch (err) {
            upgradeUtil_js_1.default.exitUpgade('1', err.toString());
        }
    }
    copyLogFile() {
        const oldlogConfigFile = path_1.default.join(this.getOldCombinePath(), 'config/server', 'logging.json');
        const newlogConfigFile = path_1.default.join(this.getNewCombinePath(), 'deploy/instance/ZLUX/serverConfig', 'logging.json');
        if (fs_extra_1.default.existsSync(newlogConfigFile)) {
            try {
                fs_extra_1.default.copySync(oldlogConfigFile, newlogConfigFile);
            }
            catch (err) {
                upgradeUtil_js_1.default.exitUpgade('1', err.toString());
            }
        }
    }
    getTempFile() {
        const folder = upgradeUtil_js_1.default.getTempFolder();
        return `${folder}/session.txt`;
    }
    getNewCombinePath() {
        //return path.join(this.yamlConfig.newVersion.workSpace, this.yamlConfig.newVersion.folderName)
        return this.yamlConfig.newVersion.rootPath; // BZ-21512
    }
    getOldCombinePath() {
        //return path.join(this.yamlConfig.oldVersion.workSpace, this.yamlConfig.oldVersion.folderName)
        return this.yamlConfig.oldVersion.rootPath; // BZ-21512
    }
    checkCurlSupport() {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield upgradeUtil_js_1.default.checkCurlSupport();
            if (result) {
                return { status: true };
            }
            else {
                return { status: false, message: 'Command curl does not support or disabled, please check because this process relys on it.' };
            }
        });
    }
    Main() {
        return __awaiter(this, void 0, void 0, function* () {
            upgradeUtil_js_1.default.print(this.welcome);
            upgradeUtil_js_1.default.print(this.useageInfo);
            if (this.commandInput.help) { //show help
                upgradeUtil_js_1.default.print(this.helpInfo);
                return;
            }
            let result = yield this.checkCurlSupport();
            if (result.status) {
                result = yield this.confirmMethod();
            }
            //if (result.status) {
            //   result = await this.readFormation();
            // }
            if (result.status) {
                result = yield this.parseFormation();
            }
            if (result.status) {
                result = yield this.confirmFormation('upgrade'); //confirm information is correct
            }
            if (result.status) {
                result = yield this.confirmUpgrade(); //confirm upgrade again
            }
            if (result.status) {
                result = yield this.adminCredential(); //input password
            }
            if (result.status) {
                result = yield this.takeActions();
            }
            if (result && !result.status) {
                upgradeUtil_js_1.default.exitUpgade(1, `Exception occurs: ${result.message}`);
            }
            else {
                upgradeUtil_js_1.default.clear(); //remove the login cookies
                upgradeUtil_js_1.default.print('Upgrade completed!', 0);
            }
        });
    }
}
const oneStop = new OneStop();
(() => __awaiter(void 0, void 0, void 0, function* () {
    yield oneStop.Main();
}))();
//# sourceMappingURL=one-stop.js.map