"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process = require("child_process");
const promises_1 = require("timers/promises");
const os = require("os");
const path = require("path");
const process = require("process");
const Enquirer = require("../../../lib/zlux/zlux-proxy-server/js/node_modules/enquirer/index.js");
const fs = __importStar(require("../../../lib/zlux/zlux-proxy-server/js/node_modules/fs-extra/lib/index.js"));
class UpgradeUtil {
    constructor() {
        this._debug = false;
        this._enquirer = new Enquirer();
        this._isWindows = this.isWindows();
    }
    get isDebug() {
        return this._debug;
    }
    set isDebug(b) {
        this._debug = b;
    }
    get basePath() {
        return this._basePath;
    }
    set basePath(str) {
        this._basePath = str;
    }
    _createEnv(envirPairs) {
        var env = {};
        var item;
        for (item in process.env) {
            env[item] = process.env[item];
        }
        for (item in envirPairs) {
            env[item] = envirPairs[item];
        }
        return env;
    }
    isWindows() {
        const platform = os.platform();
        return platform.indexOf("win32") !== -1;
    }
    /**
     *
     * @param {*} scriptFile
     * @param {*} workingDirectory
     * @param {*} envirPairs
     * @param {*} callback
     */
    executeFile(scriptFile, args, workingDirectory, envirPairs) {
        return __awaiter(this, void 0, void 0, function* () {
            if (path.sep === '\\') {
                scriptFile = scriptFile.replace(/\\/g, '/');
            }
            const result = child_process.spawnSync(scriptFile, args, {
                cwd: workingDirectory,
                env: this._createEnv(envirPairs),
                shell: !this._isWindows
            });
            yield promises_1.setTimeout(1000);
            return result;
        });
    }
    executeCommand(command, args, workingDirectory, envirPairs) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!command) {
                this.exitUpgade('1', 'command cannot be null');
            }
            const result = child_process.spawnSync(command, args, {
                cwd: workingDirectory,
                env: this._createEnv(envirPairs),
                shell: this._isWindows
            });
            this.print(`Run command: ${command} ${args.join(' ')} `, 4);
            yield promises_1.setTimeout(1000);
            return result;
        });
    }
    executeCURL(args, workingDirectory, envirPairs) {
        return __awaiter(this, void 0, void 0, function* () {
            const constArg = [
                '-k',
                '-s'
            ];
            constArg.push(...['-H', 'Content-Type:application/json']);
            args.unshift(...constArg);
            return yield this.executeCommand('curl', args, workingDirectory, envirPairs);
        });
    }
    compareVer(ver1, ver2) {
        if (ver1 && ver2) {
            let newVersion = ver1.replace('-', '.').split('.');
            let oldVersion = ver2.replace('-', '.').split('.');
            let minLen = Math.min(newVersion.length, oldVersion.length);
            let index = 0;
            while (index < minLen) {
                if (oldVersion[index].includes('-') && newVersion.length > minLen) {
                    oldVersion[index] = oldVersion[index].replace('-', '.');
                    if (parseFloat(newVersion[index] + "." + newVersion[index + 1]) > parseFloat(oldVersion[index])) {
                        return true;
                    }
                    else {
                        return false;
                    }
                }
                if (parseInt(newVersion[index]) > parseInt(oldVersion[index])) {
                    return true;
                }
                else if (parseInt(newVersion[index]) == parseInt(oldVersion[index])) {
                    index++;
                }
                else {
                    return false;
                }
            }
            if (index >= minLen)
                return false; //same version
        }
        return false;
    }
    generateQuestion(message, type, name) {
        return {
            type: type || 'input',
            name: name || 'question',
            message: message || 'Question',
            symbols: {
                prefix: {
                    pending: '?',
                    submitted: '$',
                    cancelled: 'X'
                },
                separator: '>>'
            }
        };
    }
    /**
   * wait for the given ms
   * @param ms
   * @returns
   */
    waitTime(ms = 5000) {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(true);
            }, ms);
        });
    }
    wait(callback, interval, count) {
        return __awaiter(this, void 0, void 0, function* () {
            while (count-- > 0) {
                if (yield callback()) {
                    return true;
                }
                else {
                    yield this.waitTime(interval);
                }
            }
            return false;
        });
    }
    waitingAnswer(promptText, type) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this._enquirer.prompt(this.generateQuestion(promptText, type))
                    .then(response => {
                    resolve(response["question"]);
                })
                    .catch(e => {
                    reject(e);
                });
            });
        });
    }
    /**
     *
     * @param message
     * @param level  0-highlight, 1-error, 2-warning,3-info,4-debug
     */
    print(message, level) {
        //0-highlight, 1-error, 2-warning,3-info,4-debug 
        if (level === undefined) {
            level = 3;
        }
        if (level === 3 || (level === 4 && (this._debug))) {
            console.log(message);
        }
        else if (level === 2) { //yellow
            console.log('\x1b[33m%s\x1b[0m', message);
        }
        else if (level === 1) { //red
            console.log('\x1b[31m%s\x1b[0m', message);
        }
        else if (level === 0) { //green
            console.log('\x1b[32m%s\x1b[0m', message);
        }
    }
    runningStatus(baseURL) {
        return __awaiter(this, void 0, void 0, function* () {
            this.print(`Check running status by:${baseURL}/ZLUX/plugins/com.rs.bzadm/services/healthCheckController/healthcheck`, 4);
            const args = [
                '-s',
                '-o',
                '/dev/null',
                '-w',
                '%{http_code}',
                `${baseURL}/ZLUX/plugins/com.rs.bzadm/services/healthCheckController/healthcheck`
            ];
            const result = yield this.executeCURL(args);
            this.print(`Get running result:${result.stdout.toString()}`, 4);
            if (result.stdout && result.stdout.toString().includes('200')) {
                return true;
            }
            else {
                return false;
            }
        });
    }
    getRunningVersion(baseURL) {
        return __awaiter(this, void 0, void 0, function* () {
            const args = [
                '-X', 'GET', `${baseURL}/plugins?type=application`
            ];
            let runningVersion = '';
            const result = yield this.executeCURL(args);
            const versionResult = yield this.checkResult(result);
            if (versionResult.status) {
                if (versionResult.obj && versionResult.obj["pluginDefinitions"]) {
                    const obj = versionResult.obj;
                    const bzw = obj["pluginDefinitions"].filter((e) => { return e.identifier === 'com.rs.bzadm'; })[0];
                    if (bzw && bzw.pluginVersion) {
                        runningVersion = bzw.pluginVersion.toString().trim();
                    }
                }
            }
            else {
                this.print(`${versionResult.message}`, 2);
            }
            this.print(`Running version is ${runningVersion}`, 4);
            return runningVersion;
        });
    }
    doLogin(targetURL, auth, cookiefile) {
        return __awaiter(this, void 0, void 0, function* () {
            const args = [];
            //write date to temp file
            const tempFile = path.join(this.getTempFolder(), 'temp-data-login.json'); //temp file
            const data = {
                isSuperadmin: true
            };
            fs.writeFileSync(tempFile, JSON.stringify(data));
            const args2 = [
                '-H', 'authorization:\"Basic ' + auth + '\"',
                '-d', `@${tempFile}`,
                '-c', cookiefile,
                '-X', 'POST', `${targetURL}/auth`
            ];
            args.push(...args2);
            const loginResult = yield this.executeCURL(args);
            const result = yield this.checkResult(loginResult);
            if (result.status && result.obj && result.obj["success"]) { //login success
                return { status: true };
            }
            return { status: false, message: `Login failed,${JSON.stringify((result === null || result === void 0 ? void 0 : result.obj) || 'unknow')}, more detail please refer to application log` };
        });
    }
    hasUpgrade(targetURL, cookiefile) {
        return __awaiter(this, void 0, void 0, function* () {
            this.print(`Check whether has upgrade by URL ${targetURL}`, 4);
            const URL = `${targetURL}/ZLUX/plugins/com.rs.bzadm/services/upgrade/isExist`;
            const argsIsExist = [
                '-b', cookiefile,
                '-X', 'GET', URL
            ];
            const existResult = yield this.executeCURL(argsIsExist);
            let result = yield this.checkResult(existResult);
            if (result.status && result.obj && result.obj["upgrade"]) { //has upgraded
                return true;
            }
            else {
                if (result.message) {
                    this.print(`Accessing ${URL}, ${result.message}`, 2);
                }
                return false;
            }
        });
    }
    clear() {
        const tempFolder = this.getTempFolder();
        if (fs.existsSync(tempFolder)) {
            fs.removeSync(tempFolder);
        }
        if (this.basePath) {
            const migrateFolder = path.join(this.basePath, 'migrate');
            if (fs.existsSync(migrateFolder)) {
                fs.removeSync(migrateFolder);
            }
        }
    }
    exitUpgade(exitCode, message) {
        const defaultMessage = '\nUpgrade completed!\n';
        const deployMessage = message ? message : defaultMessage;
        this.print(deployMessage, 1);
        this.clear();
        if (this._isWindows) {
            setTimeout(() => {
                process.exit(exitCode);
            }, 1000);
        }
        else {
            process.exit(exitCode);
        }
    }
    checkResult(result) {
        if (result.error instanceof Error) {
            return { status: false, message: result.stderr.toString() };
        }
        if (result.stdout && result.stdout.toString() != '') {
            this.print(`output: ${result.stdout.toString()}`, 4);
            if (!this.checkForbidden(result.stdout.toString())) {
                try {
                    const obj = JSON.parse(result.stdout.toString());
                    return { status: true, obj };
                }
                catch (err) { //parse error
                    return { status: false, message: err.toString() };
                }
            }
            else { //forbidden
                return { status: false, message: 'Request was rejected by peer, Rocket TE Administration Console has been configured to restrict remote access. You need to rebuild the cluster manually.' };
            }
        }
        if (result.stderr && result.stderr.toString() != '') {
            return { status: false, message: result.stderr.toString() };
        }
        return { status: false, message: 'Unknown error, maybe URL is not achievable' };
    }
    checkForbidden(str) {
        return str.includes('403 Forbidden');
    }
    drawTable(data) {
        let keyMaxLength = 0, valueMaxLength = 0;
        data.forEach(obj => {
            if (obj.key.length > keyMaxLength) {
                keyMaxLength = obj.key.length;
            }
            if (obj.value.length > valueMaxLength) {
                valueMaxLength = obj.value.length;
            }
        });
        const firstLine = `┌─${''.padEnd(keyMaxLength, '─')}─┬─${''.padEnd(valueMaxLength, '─')}─┐`;
        let body = '';
        data.forEach(obj => {
            body += `\r\n│ ${obj.key.padEnd(keyMaxLength)} │ ${obj.value.padEnd(valueMaxLength)} │`;
        });
        const lastLine = `\r\n└─${''.padEnd(keyMaxLength, '─')}─┴─${''.padEnd(valueMaxLength, '─')}─┘`;
        console.log(firstLine + body + lastLine);
    }
    isCluster(target) {
        const metaData = path.join(target, "deploy/instance/ZLUX/pluginStorage/com.rs.bzshared/_db_store/_metadata/peers");
        if (fs.existsSync(metaData)) {
            const files = fs.readdirSync(metaData, 'utf8');
            return files.length > 1;
        }
        return false;
    }
    checkCurlSupport() {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeCommand('curl', ['-V'], null, null);
            if (result.stdout && result.stdout.toString() != '') {
                const str = result.stdout.toString();
                this.print(`output: ${str}`, 4);
                return str.toLowerCase().includes('protocols'); //means support curl
            }
            return false;
        });
    }
    getTempFolder() {
        const tempPath = path.join('lib/temp');
        fs.ensureDirSync(tempPath);
        return tempPath;
    }
}
exports.default = new UpgradeUtil();
//# sourceMappingURL=upgradeUtil.js.map